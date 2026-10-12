#!/usr/bin/env node
// What a step throws away, and against what: PLAN section 2's "no allocation inside the per-frame
// loops", measured.
//
//   node tools/alloc-probe.js                                  every load, and the verdict
//   node tools/alloc-probe.js --scene endless                  one load only
//   node tools/alloc-probe.js --kind sniper                    a crowd of one kind
//   node tools/alloc-probe.js --kinds                          one row per kind, to price one body
//   node tools/alloc-probe.js --parts                          one row per list, so a byte can be
//                                                              traced to the crowd, the shots or the
//                                                              sparks
//   node tools/alloc-probe.js --bodies 300 --sparks 900        a load of your own (measured, gated
//                                                              against nothing)
//   node tools/alloc-probe.js --live                           what a played run throws away
//   node tools/alloc-probe.js --steps 300 --windows 12         a longer window, more of them
//   node tools/alloc-probe.js --quiet                          the verdict and nothing else
//
// PLAN section 2 sets two rules for the frame and this file is the instrument for the second one.
// The first - "use object pools for bullets, particles, and enemies" - was measured by
// `tools/perf-probe.js` and is watched by `test/pool.test.mjs`; the second has never had a ruler held
// to it, and a rule with no ruler turns into a style opinion that nobody checks.
//
// **What a byte is here.** The number is how much the young generation grew across a window of steps
// with nothing collected in it, read twice - once off `process.memoryUsage().heapUsed` and once off
// `v8.getHeapSpaceStatistics()`'s new space, which agree to under one percent when the window is
// honest and are compared with each other for exactly that reason (way number 2 below). It is what the
// collector actually has to carry away, which is not what the source
// appears to write: V8 throws a short-lived object away before it ever reaches the heap when it can
// see the whole of its life from inside one optimised function (escape analysis), so the same line
// can allocate a lot cold and nothing at all warm - and only the warm number is paid for in a fight
// that has been going on for nine minutes. Hence: warm up, and take the best of several windows.
//
// **Warming up is the hard part, and the first way this file warmed is wrong.** A load stepped in one
// long synchronous run does not get warm: measured on this box, 20,000 steps of uninterrupted stepping
// left the first reading of the endless wall at 2,660 B a step, and stepping the same crowd with the
// event loop handed back every 60 steps settled it at 606 B a step from the very first window. The
// difference is not the number of steps - it is that V8 installs the code it compiles in the background
// when the event loop turns, so a loop that never turns is timed on whatever it started on. A browser
// hands the loop back every frame, which is why the settled number - and not the cold one - is the
// number a player pays. So the warm-up below measures the load in windows of its own until they stop
// getting cheaper, every one of them a turn of the loop: see `warmWork`.
//
// **The three ways this measurement lies, and what is done about each.**
//
//   1. A window the collector interrupts reads *low*, because the garbage is gone before the second
//      reading - and a "best of N" rule would pick the lies out of the set and call them the truth. So
//      every window is watched: the GC entries `perf_hooks` reports are kept with their timestamps,
//      and a window in which the collector came is thrown away and retried, and the file prints how
//      many it threw away. It also runs with a young generation 64 MB wide, which is more than a
//      window can fill.
//   2. A window can read low without the collector saying it came at all. The reading is taken twice,
//      off `heapUsed` and off the young generation, and the two normally agree to under one percent -
//      so when old space hands a page back inside a window, quietly, the heap figure falls by more
//      than the work put into it and only the young generation is still telling the truth. About one
//      window in a hundred does this, and "best of N" is a magnet for exactly that: the endless wall
//      read 574 B a step at six windows and 189 B at twenty-four until the two readings were compared
//      and a window where they differ by more than a fifth was refused (`oneWindow`).
//   3. A load reads differently depending on what the same process measured *before* it. That is not
//      noise, it is the optimiser: a step that has only ever seen empty pools gets compiled for empty
//      pools, and the first live bullet deoptimises it and everything starts boxing numbers. Measured,
//      the same 60 shots threw away 479 B a step when they were the first load the process had ever
//      seen and 3,145 B a step when an empty arena had been measured first, and the second number is
//      the artifact of the first. So **every load is measured in its own process** - the file re-runs
//      itself once per load - which is the only way the number belongs to the load. Same lesson as
//      `tools/perf-probe.js` learning that a painted frame belonged to whichever run had come before
//      it, and the same remedy: plant the thing again from the beginning.
//
// **Why it is worth measuring at all.** A step's garbage is the only reason the collector comes, and
// the collector is the only thing in this file's family that explains a frame costing fifteen times
// what the crowd inside it is worth: `tools/perf-probe.js` measures a step at the endless wall at
// 0.11 ms, while the F3 plate sees worst steps of 1.4-1.7 ms in real runs - including one with no
// bodies on the glass at all. A scavenge of this heap measures 0.85-1.12 ms (`node --trace-gc` across
// a simulated run, and the numbers are printed under the table), which is the size of that tail and
// not the size of the crowd. So the budget is in bytes a step, and the lines under the table say how
// long a player waits between one young generation and the next.

import os from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import { spawnSync } from 'node:child_process';
import { PerformanceObserver, performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { stepWorld } from '../src/game/world.js';
import { drainCues } from '../src/game/cues.js';
import { bootGame } from './headless/harness.js';
import { playOneRun, FRAME_MS } from './headless/bot.js';
import {
  SCENES, settled, openScene, plantScene, holdScene, customScene,
} from './perf-probe.js';
import { table, int, dec } from './headless/tables.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const STEP = BALANCE.sim.step;
const STEPS_PER_SECOND = 1 / STEP;

/** The young generation this file asks the collector for, in bytes. See the header. */
export const YOUNG_BYTES = 64 * 1024 * 1024;
/** What V8 starts a page with, and so what the first minutes of play are actually running on. */
export const TAB_YOUNG_BYTES = 1024 * 1024;
/** What V8 lets the young generation grow to by default on a 64-bit build. */
export const GROWN_YOUNG_BYTES = 16 * 1024 * 1024;

// The two budgets, both ratchets: they exist so that a change which makes a step throw away more has
// to be argued about, and neither is a claim about what a browser needs. Both are set at what the game
// measured on the commit that wrote them, plus about a quarter - a ratchet with no room in it gets
// raised the first time anyone needs it, which is worse than a loose one.
//
//   FLOOR_BYTES   what one step may throw away with nothing in the arena but the ship. Every other
//                 row pays this first, so a lookup that has no business running every step turns up
//                 here before it turns up anywhere else.
//   STEP_BYTES    what a gated load may throw away in total.
//   BODY_BYTES    what one body may throw away a step, which is the same rule in the currency that
//                 scales: the crowd is the load that grows, and 30 bytes a body at the endless wall is
//                 four thousand bytes a step the day the wall moves. Measured per body against an arena
//                 with none, so it is the walk and the broad phase and nothing else.
//
// Where the three budgets stood when they were last moved: measured on a load that has actually been
// warmed (see `warmWork`), on this box and reproducible to under one percent, the empty arena throws
// away **64 B** a step, the schedule crowd **436 B**, the endless wall **574 B**, the same crowd dying
// **984 B** and spread out **582 B**; a body costs **3-5 B** and 900 sparks and 60 shots together cost
// the step *nothing* over an empty arena. All three budgets came down when the warm-up was fixed - by
// 4x on the floor, 2x on a load and 2x on a body - because what the old numbers were mostly measuring
// was V8 still compiling the step, and a ratchet set against a compiler cannot be tightened by anything
// the game does. That is the point of a ratchet: it goes down when the game does, or it is only a
// ceiling.
//
// The dearest gated load is the crowd dying, at 984 B: killing and replacing 200 bodies a step costs
// about as much again as the same 200 bodies walking (574 B) does, which is the first place the next
// cut should go.
export const FLOOR_BYTES = 128;
export const STEP_BYTES = 1280;
export const BODY_BYTES = 8;

/**
 * How a load is warmed up. `WARM_PROBE_STEPS` is the window the warm-up measures - wider than a
 * measuring window on purpose, because what a load needs is steps and every window pays for two full
 * collections to get them. `WARM_MIN_STEPS` is the floor on the warm-up (a load that looks flat after
 * two probes has not started getting cheap yet) and `WARM_MAX_STEPS` the ceiling, so a box that never
 * settles gets a complaint instead of a hang. Measured on these six loads with these settings: the
 * empty arena and the two pools want about 23,000 steps, the 100-body crowd 27,000, the two 200-body
 * walls 20,000-47,000 and PLAN section 2's impossible scene 42,000 - so a full ladder is about a
 * minute, which is the price of a number that means something. The width is not a free knob: a probe of
 * 2,000 steps steps further before it decides and reads the same crowd about a fifth cheaper again, so
 * 1,000 is the width the three budgets above were set against and moving it means moving them.
 */
export const WARM_PROBE_STEPS = 1000;
export const WARM_MIN_STEPS = 12_000;
export const WARM_MAX_STEPS = 300_000;
/** Probes that have to agree before the load counts as warm... */
export const WARM_QUIET = 6;
/** ... and how far apart they may be. The readings bounce; a band tells a bounce from a fall. */
export const WARM_BAND = 1.10;
/**
 * How far a window's two readings - the heap and its young generation - may disagree before the window
 * is refused instead of read. This is the absolute half of that bound; the other half is a fifth of the
 * bigger reading, and `readingsAgree` and `oneWindow` have the measurement that says why a fifth is not
 * loose. It is there for the tiny windows: the arena on its own grows 19 KB across a window and its two
 * readings sit within a few hundred bytes of each other, but a page rebate in old space is never a few
 * hundred bytes.
 */
export const WINDOW_DISAGREES_BYTES = 4096;

/**
 * Whether a window's two readings - the bytes the heap grew, the bytes its young generation filled -
 * can both be believed. Honest windows sit inside a percent of each other; a page rebate out of old
 * space moves one of them by tens of kilobytes and the other not at all, so a fifth of the larger (or
 * `WINDOW_DISAGREES_BYTES`, whichever is more) is far out of the way of the first and catches the
 * second every time.
 */
export function readingsAgree(grown, filled) {
  return Math.abs(grown - filled) <= Math.max(WINDOW_DISAGREES_BYTES, 0.2 * Math.max(grown, filled));
}

/** A byte count the way a person reads one: `843 B` under a kilobyte, `4.2 KB` above it. */
export function bytes(n) {
  if (!Number.isFinite(n)) return '-';
  if (Math.abs(n) < 1024) return int(Math.round(n)) + ' B';
  return dec(n / 1024, 1) + ' KB';
}

export function readArgs(argv) {
  const opts = {
    scene: null, kinds: false, parts: false, live: false, seconds: 60, quiet: false, child: null,
    json: false,
    steps: 300, windows: 12, kind: null, bodies: null, shots: null, sparks: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const next = () => argv[++i];
    if (key === '--scene') opts.scene = next();
    else if (key === '--kind') opts.kind = next();
    else if (key === '--kinds') opts.kinds = true;
    else if (key === '--parts') opts.parts = true;
    else if (key === '--live') opts.live = true;
    else if (key === '--seconds') opts.seconds = Number(next());
    else if (key === '--steps') opts.steps = Number(next());
    else if (key === '--windows') opts.windows = Number(next());
    else if (key === '--bodies') opts.bodies = Number(next());
    else if (key === '--shots') opts.shots = Number(next());
    else if (key === '--sparks') opts.sparks = Number(next());
    else if (key === '--quiet') opts.quiet = true;
    else if (key === '--json') opts.json = true;
    else if (key === '--child') opts.child = next();      // internal: one load, this process only
    else throw new Error('I do not know the flag ' + key);
  }
  if (!(opts.steps > 0)) throw new Error('--steps wants a number of steps above zero');
  if (!(opts.windows >= 2)) throw new Error('--windows wants at least two windows, so the spread can be seen');
  if (!(opts.seconds > 0)) throw new Error('--seconds wants a number of seconds above zero');
  if (opts.scene !== null && !SCENES.some((s) => s.id === opts.scene)) {
    throw new Error('there is no scene called ' + opts.scene
      + '; there is ' + SCENES.map((s) => s.id).join(', '));
  }
  if (opts.kind !== null && !BALANCE.kinds[opts.kind]) {
    throw new Error('there is no kind called ' + opts.kind
      + '; there is ' + Object.keys(BALANCE.kinds).join(', '));
  }
  return opts;
}

// --- the loads -------------------------------------------------------------------

/**
 * The loads for `--parts`: one list at a time, then all three together. This is the file's
 * attribution - a byte cannot be asked "which system made you", but a load can be asked to leave one
 * list at home and say what the step is worth without it.
 */
export function partLoads() {
  const cap = BALANCE.effects.particleCap;
  const crowd = BALANCE.waves.maxBodies;
  return [
    { name: 'the arena on its own', bodies: 0, shots: 0, sparks: 0, floor: true },
    { name: 'the spark cap alone', bodies: 0, shots: 0, sparks: cap },
    { name: "a gun's shots alone", bodies: 0, shots: 60, sparks: 0 },
    { name: 'the schedule crowd alone', bodies: crowd, shots: 0, sparks: 0 },
    { name: 'all three together', bodies: crowd, shots: 60, sparks: cap },
  ].map((part) => ({ ...part, onGlass: true, mortal: false, kind: null, gated: false, id: 'part' }));
}

/** The loads a plain run measures: PLAN's four walls, or one of them, or one kind of body. */
export function chosenLoads(opts) {
  if (opts.parts) return partLoads();
  if (opts.bodies !== null || opts.shots !== null || opts.sparks !== null) {
    return [settled(customScene(opts), undefined, undefined, opts.kind)];
  }
  if (opts.kinds) {
    return Object.keys(BALANCE.kinds).map((kind) => (
      settled(SCENES.find((s) => s.id === 'schedule'), undefined, undefined, kind)));
  }
  return SCENES.filter((s) => opts.scene === null || s.id === opts.scene)
    .map((s) => settled(s, undefined, undefined, opts.kind));
}

// --- the window ---------------------------------------------------------------

/**
 * The collector, watched. `perf_hooks` reports a GC entry for every collection; the entries are
 * delivered on the next turns of the event loop, so a window has to leave the loop between the work
 * and the reading, and then every entry whose own timestamp falls inside the window counts against
 * it. Waiting on the delivery rather than on a counter is what makes this work when the collector is
 * late rather than absent.
 */
export function watchCollector() {
  const finished = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) finished.push(entry.startTime);
  });
  observer.observe({ entryTypes: ['gc'] });
  return {
    /** Let everything the loop owes arrive, including the entries from a collection just now. */
    async settle() {
      for (let i = 0; i < 4; i++) await new Promise((done) => setImmediate(done));
    },
    /** How many collections finished between two readings of the clock. */
    collectedSince(from, to) {
      let n = 0;
      for (const at of finished) if (at > from && at <= to) n++;
      return n;
    },
    stop() { observer.disconnect(); },
  };
}

/** How wide the young generation is right now, in bytes. */
export function youngWidth() {
  for (const space of v8.getHeapSpaceStatistics()) {
    if (space.space_name === 'new_space') return space.space_size;
  }
  return 0;
}

/** How full the young generation is right now, in bytes - the second reading of a window. */
function youngUsed() {
  for (const space of v8.getHeapSpaceStatistics()) {
    if (space.space_name === 'new_space') return space.space_used_size;
  }
  return 0;
}

/**
 * One window of `work`: the two readings round `steps` of it, or null when the window is not a
 * reading. A window starts from an emptied young generation - two forced collections, because one is a
 * scavenge and only the second is the full mark-and-sweep that actually empties it - and then does the
 * work with no `await` in it at all. Both readings are taken, and they are the same number: a window
 * that grows the heap without growing the young generation would be a window something else is paying
 * for. Three things can stop a window being a reading and each is refused here and counted by the
 * caller: the collector came inside it, which reads low; the heap went *down*, which means something
 * was collected without `perf_hooks` saying so; and the two readings disagree by more than
 * `WINDOW_DISAGREES_BYTES`, which is what a quiet page rebate in old space looks like.
 */
async function oneWindow(work, steps, watch) {
  await watch.settle();
  global.gc();
  global.gc();
  await watch.settle();
  const from = performance.now();
  const heapBefore = process.memoryUsage().heapUsed;
  const youngBefore = youngUsed();
  for (let i = 0; i < steps; i++) work();
  const grown = process.memoryUsage().heapUsed - heapBefore;
  const filled = youngUsed() - youngBefore;
  const to = performance.now();
  await watch.settle();
  if (watch.collectedSince(from, to) > 0) return null;
  if (grown < 0 || filled < 0) return null;
  // The two instruments have to agree - the check the header's second lie is about. They agree to well
  // under a percent on an honest window (`endless`: 567 B a step off the heap, 566 off the young
  // generation), which is what makes a disagreement worth refusing a window for. The one caught while
  // writing this had grown 59 KB off `heapUsed` and 176 KB off the new space, and read 197 B a step
  // against the load's real 560 B.
  if (!readingsAgree(grown, filled)) return null;
  return { bytes: grown / steps, young: filled / steps };
}

/**
 * One window of `work`, repeated `windows` times: the bytes each threw away, and how many windows had
 * to be thrown away because the collector came into them.
 */
async function measureWindows(work, opts, watch) {
  const good = [];
  let voids = 0;
  const attempts = opts.windows * 2;          // a bound, so a busy box fails rather than hanging
  for (let attempt = 0; attempt < attempts && good.length < opts.windows; attempt++) {
    const reading = await oneWindow(work, opts.steps, watch);
    if (reading === null) { voids++; continue; }
    good.push(reading);
  }
  if (good.length < 2) {
    throw new Error('every window was thrown away (' + voids + ' of them - a collector inside them, or '
      + 'the two readings of them disagreeing), so there is no '
      + 'honest number to print: ask for fewer --steps, or run the file on a quieter box');
  }
  good.sort((a, b) => a.bytes - b.bytes);
  return {
    best: good[0].bytes,
    worst: good[good.length - 1].bytes,
    youngBest: good[0].young,
    voids,
    taken: good.length,
  };
}

/**
 * Warm a load up, and stop the moment warming it has stopped working.
 *
 * The warm-up is *windows*, not a step loop, and that is the finding: V8 finishes the code it compiles
 * in the background when the event loop turns, so a warm-up that never turns leaves the load running on
 * whatever it started on and the reading is two to five times what the load costs. See the header. Each
 * probe here is one ordinary window - collections, two readings, refused if the collector came into it
 * - and the load is warm when the last `WARM_QUIET` probes all landed within `WARM_BAND` of each other,
 * which is the reading itself saying it has stopped falling.
 *
 * A *band* of probes and not "this one was near the best" matters: the readings bounce on the way down
 * (the endless wall dips to 831 B a step, rises to 1,080, and only then settles near 580), and a rule
 * that stops on a lucky dip stops twice as high as the truth.
 *
 * Returns how many steps of warm-up it took, whether it ever settled, and how many probes it had to
 * refuse; a load still getting cheaper at `WARM_MAX_STEPS` is a broken ruler, and the caller says so out
 * loud instead of printing its number.
 */
export async function warmWork(work, watch) {
  const probes = [];
  let steps = 0;
  let voids = 0;
  while (steps < WARM_MAX_STEPS) {
    const probe = await oneWindow(work, WARM_PROBE_STEPS, watch);
    if (probe === null) { voids++; probes.length = 0; continue; }
    steps += WARM_PROBE_STEPS;
    probes.push(probe.bytes);
    if (probes.length > WARM_QUIET) probes.shift();
    if (steps >= WARM_MIN_STEPS && probes.length === WARM_QUIET) {
      const lo = Math.min(...probes);
      const hi = Math.max(...probes);
      if (hi <= lo * WARM_BAND) return { steps, settled: true, voids };
    }
  }
  return { steps, settled: false, voids };
}

/**
 * A load's bytes a step, in a process that has never measured anything else (see the header). The
 * load is held between the steps for the same reason `tools/perf-probe.js` holds it - bodies walk off,
 * shots leave the glass - and the holding is measured on its own in the same shape of window and taken
 * back out, because keeping a scene standing is this file's work and not the game's.
 *
 * The sound queue is emptied after every step, which is what a frame does with it once per frame
 * (`main.js` → `audio/sfx.js consumeCues`): a cue is an object, and a probe that stepped without
 * draining would measure a headless run's queue getting longer instead of the game's work. The count
 * is kept and printed, because how many sounds a load asks for is a fact worth seeing next to the
 * bytes they cost.
 */
export async function measureLoad(game, scene, opts, watch) {
  const world = game.world;
  const input = {
    moveX: 0, moveY: 0, moving: false,
    aimX: world.player.x + 200, aimY: world.player.y, firing: false, dash: false,
  };
  let cues = 0;
  const countCue = () => { cues++; };
  const step = () => {
    holdScene(game, scene);
    stepWorld(STEP, input);
    drainCues(countCue);
  };

  const warm = await warmWork(step, watch);
  cues = 0;
  const whole = await measureWindows(step, opts, watch);
  // The holding gets no settle of its own: `holdScene` is the first thing the load's own work calls,
  // so the warm-up above has already been through it as many times as it needs.
  const held = await measureWindows(() => holdScene(game, scene), opts, watch);

  const off = held.best;
  return {
    bytesPerStep: Math.max(0, whole.best - off),
    worstWindow: Math.max(0, whole.worst - off),
    youngPerStep: Math.max(0, whole.youngBest - held.youngBest),
    holdBytesPerStep: off,
    warmSteps: warm.steps,
    warmSettled: warm.settled,
    voids: whole.voids + held.voids,
    cuesPerStep: cues / (opts.steps * whole.taken),
    taken: Math.min(whole.taken, held.taken),
    youngWidth: youngWidth(),
    bodies: world.enemies.length, shots: world.bullets.count, sparks: world.particles.count,
  };
}

/**
 * What a played run throws away: the crowd the game chose, the gun it chose, the waves as they
 * arrive. Here the window is one long stretch of frames and the steps are the game's own count, so a
 * frame that caught up after a stall is paid for honestly, and the collector is counted over the
 * stretch rather than pretended absent, so the number is what a young generation of this size costs a
 * player rather than what a single clean window would.
 *
 * It is the one number in this file still played *cold*, and the row says so when it prints: a stretch is
 * one synchronous run of frames with no turn of the event loop in it, and so is the single 30-second run
 * played beforehand to set the scene, which means the row carries its own warm-up inside itself and reads
 * dearer than every warmed load above it. `warmWork` cannot be used here the way it is used on a planted
 * scene, because there is no window of repeatable work to measure - the work is a run, and a run played
 * to warm up is a run that had already ended by the time the window opened. Doing it properly means
 * playing two or three of those 30-second runs with a turn of the event loop between them (~1.5 s of the
 * box each) before the measured stretch, which is a decision for whoever next needs this row to be a
 * cost and not a ceiling.
 */
export async function measureLiveRun(game, seconds, watch) {
  const at = BALANCE.bosses.schedule[BALANCE.bosses.schedule.length - 1].at;
  await game.resetToTitle(20261011);
  playOneRun(game, { maxSeconds: 30, at, policy: 'aware', picks: 'wise' });
  await game.resetToTitle(20261011);
  await watch.settle();
  global.gc();
  global.gc();
  await watch.settle();
  const from = performance.now();
  const before = process.memoryUsage().heapUsed;
  const stepsBefore = game.world.steps;
  let ended = null;
  playOneRun(game, {
    maxSeconds: seconds, at, policy: 'aware', picks: 'wise',
    onFrame: (g) => { if (g.world.state !== STATE.PLAY) ended = g.world.state; },
  });
  const grown = process.memoryUsage().heapUsed - before;
  const to = performance.now();
  await watch.settle();
  const steps = game.world.steps - stepsBefore;
  return {
    bytesPerStep: steps > 0 ? grown / steps : 0,
    steps, seconds,
    collected: watch.collectedSince(from, to),
    ended,
  };
}

// --- one load, one process --------------------------------------------------------

/** Whether this process can measure at all: a window has to start from an emptied young generation,
    and only the collector can empty one, and only the flag lets a script ask it to. */
export function needsFlags() {
  return typeof global.gc !== 'function';
}

/**
 * Run this same file again - once per load - under the flags a byte measurement needs and cannot add
 * to itself: `--expose-gc`, because a window has to start from an emptied young generation, and a
 * wide young generation, because a window the collector interrupts is not a window.
 *
 * One process per load is the whole point (`--child` below): the number a load gets depends on what
 * the process measured before it, and a ratchet that depends on which row of the table came first is
 * not a ratchet.
 */
function spawnChild(load, opts) {
  const spec = { load, steps: opts.steps, windows: opts.windows, live: opts.liveSeconds || null };
  const child = spawnSync(process.execPath, [
    '--expose-gc',
    '--max-semi-space-size=' + (YOUNG_BYTES / 1024 / 1024),
    path.resolve(process.argv[1]),
    '--child', JSON.stringify(spec),
  ], { cwd: ROOT, encoding: 'utf8' });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error('a measuring child failed (' + child.status + '): '
      + (child.err && child.err.message ? child.err.message : child.stderr.trim()));
  }
  const line = child.stdout.split('\n').find((l) => l.startsWith('RESULT '));
  if (!line) throw new Error('a measuring child printed no RESULT line: ' + child.stdout.trim());
  return JSON.parse(line.slice('RESULT '.length));
}

/** The child's whole job: measure one load, print it, get out. */
async function measureOneChild(spec) {
  const opts = { steps: spec.steps, windows: spec.windows };
  const game = await bootGame({ root: ROOT, seed: 20261011 });
  const watch = watchCollector();
  let out;
  if (spec.live !== null) {
    out = await measureLiveRun(game, spec.live, watch);
  } else {
    await openScene(game, 20261011);
    plantScene(game, spec.load);
    game.step(FRAME_MS);
    out = await measureLoad(game, spec.load, opts, watch);
    out.name = spec.load.name;
    out.id = spec.load.id;
    out.wanted = spec.load.bodies;
  }
  watch.stop();
  game.stop();
  console.log('RESULT ' + JSON.stringify(out));
}

// --- printing -------------------------------------------------------------------

function sceneTable(results) {
  return table(
    'WHAT A STEP THROWS AWAY',
    'every load measured in its own process; the reading is the best of the windows, holding taken out',
    'llrrrrrrl',
    ['load', 'bodies', 'shots', 'sparks', 'sounds a step', 'bytes a step', 'bytes a body',
      'worst window', 'gate'],
    results.map((r) => [
      r.name,
      int(r.bodies), int(r.shots), int(r.sparks), dec(r.cuesPerStep, 1),
      bytes(r.bytesPerStep),
      r.perBody === null ? '-' : bytes(r.perBody),
      bytes(r.worstWindow),
      r.gated ? (r.ok ? 'PASS' : 'FAIL') : '-',
    ])
  );
}

/** How long a young generation this wide lasts, played at this rate. */
export function secondsPerYoungGeneration(bytesPerStep, youngBytes) {
  if (!(bytesPerStep > 0)) return Infinity;
  return youngBytes / (bytesPerStep * STEPS_PER_SECOND);
}

/** The verdict: every gated load inside the budget, and the floor inside its own. */
export function verdictOf(results, floor) {
  const gated = results.filter((r) => r.gated);
  const failed = gated.filter((r) => !r.ok).map((r) => r.name);
  if (!(floor <= FLOOR_BYTES)) failed.push('the empty arena');
  return {
    pass: failed.length === 0,
    gated: gated.length,
    failed,
    worstBytes: gated.reduce((m, r) => Math.max(m, r.bytesPerStep), 0),
    floorBytes: floor,
  };
}

/** How many seconds of play one young generation is, at a load's rate. */
function youngLine(load) {
  return '  ' + load.name + ': ' + bytes(load.bytesPerStep * STEPS_PER_SECOND) + ' a second -'
    + ' a megabyte in ' + dec(secondsPerYoungGeneration(load.bytesPerStep, TAB_YOUNG_BYTES), 1)
    + ' s of play, sixteen in '
    + dec(secondsPerYoungGeneration(load.bytesPerStep, GROWN_YOUNG_BYTES), 1) + ' s';
}

async function main() {
  const opts = readArgs(process.argv.slice(2));
  if (opts.child !== null) {
    if (needsFlags()) {
      throw new Error('a measuring child must be started with --expose-gc; run the file without'
        + ' --child and it starts its own children');
    }
    await measureOneChild(JSON.parse(opts.child));
    return;
  }
  if (needsFlags()) {
    if (process.env.STARFALL_ALLOC_PROBE === '1') {
      throw new Error('re-ran myself with --expose-gc and there is still no global.gc, so this box'
        + ' will not let the collector be told when to run');
    }
    const child = spawnSync(process.execPath, [
      '--expose-gc',
      '--max-semi-space-size=' + (YOUNG_BYTES / 1024 / 1024),
      path.resolve(process.argv[1]),
      ...process.argv.slice(2),
    ], { stdio: 'inherit', env: { ...process.env, STARFALL_ALLOC_PROBE: '1' } });
    if (child.error) throw child.error;
    process.exitCode = child.status === null ? 1 : child.status;
    return;
  }

  const loads = chosenLoads(opts);
  const results = [];
  for (const load of loads) {
    const reading = spawnChild(load, opts);
    results.push({
      name: load.name + (load.kind === null || load.kind === undefined ? '' : ' (all ' + load.kind + ')'),
      id: load.id, gated: !!load.gated, floor: !!load.floor, ...reading,
      perBody: null,
      ok: reading.bytesPerStep <= STEP_BYTES,
    });
  }
  // The floor row is the arena on its own; a run without --parts still needs one, and it gets its own
  // process too. Where --parts asked for it as a row, that row is the floor.
  let floor = results.find((r) => r.floor);
  if (floor === undefined) {
    const empty = { name: 'the arena on its own', id: 'floor', bodies: 0, shots: 0, sparks: 0,
      onGlass: true, mortal: false, kind: null, gated: false, floor: true };
    floor = spawnChild(empty, opts);
    floor.name = empty.name;
    results.unshift({ ...floor, gated: false, perBody: null, ok: true, floor: true });
  }
  for (const r of results) {
    if (r.perBody === null && r.wanted > 0) {
      r.perBody = Math.max(0, (r.bytesPerStep - floor.bytesPerStep) / r.wanted);
    }
    // A load that never stopped getting cheaper has no number in it to gate: it is a broken ruler, and
    // it fails the way an over-budget load fails so the report cannot be read as a pass.
    r.ok = r.bytesPerStep <= STEP_BYTES
      && (r.perBody === null || r.perBody <= BODY_BYTES)
      && r.warmSettled !== false;
  }

  const live = opts.live
    ? spawnChild({}, { ...opts, liveSeconds: opts.seconds })
    : null;
  const verdict = verdictOf(results, floor.bytesPerStep);

  if (opts.json) {
    // The rows on their own line, for a test or a script that would rather not parse a table.
    console.log('ROWS ' + JSON.stringify(results.map((r) => ({
      name: r.name, id: r.id, gated: r.gated, floor: !!r.floor,
      bodies: r.bodies, shots: r.shots, sparks: r.sparks,
      bytesPerStep: Math.round(r.bytesPerStep), perBody: r.perBody === null ? null : Math.round(r.perBody),
      worstWindow: Math.round(r.worstWindow), voids: r.voids,
      warmSteps: r.warmSteps, warmSettled: r.warmSettled,
    }))) + ' floor ' + Math.round(floor.bytesPerStep));
  } else if (!opts.quiet) {
    const cpus = os.cpus();
    console.log('What a step throws away (PLAN section 2: "no allocation inside the per-frame loops").');
    console.log('  box     ' + (cpus[0].model || 'a cpu').trim() + ', ' + cpus.length
      + ' cores, node ' + process.versions.node);
    console.log('  method  one process per load, warmed first: measured in ' + int(WARM_PROBE_STEPS)
      + '-step windows until ' + int(WARM_QUIET) + ' of them in a row came within '
      + dec((WARM_BAND - 1) * 100, 0) + '% of each other, each one starting from an emptied young'
      + ' generation and handing the event loop back on the way - which is the whole of what makes a'
      + ' load warm. Then ' + int(opts.steps) + ' steps a window, ' + opts.windows + ' windows a load,'
      + ' best taken, and any window the collector came into - or whose two readings of it disagreed -'
      + ' thrown away and retried');
    console.log('  budget  a load <= ' + bytes(STEP_BYTES) + ' a step and a body <= ' + bytes(BODY_BYTES)
      + ' a step, and the empty arena <= ' + bytes(FLOOR_BYTES));
    console.log('');
    console.log(sceneTable(results));
    console.log('  the arena on its own: ' + bytes(floor.bytesPerStep) + ' a step ('
      + bytes(floor.worstWindow) + ' on its dearest window); this tool holding a load up between the'
      + ' steps costs ' + bytes(floor.holdBytesPerStep) + ' and is taken out of every row');
    const warmed = results.map((r) => r.warmSteps).filter((n) => Number.isFinite(n));
    const unwarmed = results.filter((r) => r.warmSettled === false).map((r) => r.name);
    console.log('  warmed before reading: ' + int(Math.min(...warmed)) + '-' + int(Math.max(...warmed))
      + ' steps a load, until ' + int(WARM_QUIET) + ' windows in a row stopped beating each other'
      + (unwarmed.length > 0 ? ' - NEVER SETTLED: ' + unwarmed.join(', ') + ' was still getting cheaper'
        + ' at ' + int(WARM_MAX_STEPS) + ' steps, so its number is a ceiling and not a measurement' : ''));
    const thrown = results.reduce((m, r) => Math.max(m, r.voids || 0), 0);
    console.log('  windows thrown away - a collector inside them, or their two readings disagreeing: '
      + int(thrown)
      + ' at worst on one load, of ' + int(opts.windows) + ' wanted'
      + (thrown > 0 ? ' - the readings above are the ones that were clean' : ''));
    const slope = results.find((r) => r.id === 'endless') || results.find((r) => r.perBody);
    if (slope) {
      console.log('  what a body costs: ' + bytes(slope.perBody) + ' a step, measured as '
        + int(slope.bodies) + ' bodies against an arena with none');
    }
    if (opts.parts) {
      const byName = new Map(results.map((r) => [r.name, r]));
      const each = (name, count) => (byName.get(name).bytesPerStep - floor.bytesPerStep) / count;
      console.log('  one at a time, each a step: a spark '
        + bytes(each('the spark cap alone', BALANCE.effects.particleCap)) + ', a shot '
        + bytes(each("a gun's shots alone", 60)) + ', a body '
        + bytes(each('the schedule crowd alone', BALANCE.waves.maxBodies))
        + ' - and all three together come to '
        + bytes(byName.get('all three together').bytesPerStep - floor.bytesPerStep));
    }
    console.log('');
    console.log('How long a young generation lasts, played at ' + int(STEPS_PER_SECOND)
      + ' steps a second:');
    for (const r of results.filter((x) => x.gated || x.id === 'part')) console.log(youngLine(r));
    if (live) {
      console.log('');
      console.log('A played run: ' + bytes(live.bytesPerStep) + ' a step over ' + int(live.steps)
        + ' steps (' + dec(live.seconds, 0) + ' s of the schedule, '
        + (live.ended === null ? 'still flying when the window shut' : 'the run stopped early')
        + ', ' + int(live.collected) + ' collections inside the stretch)');
      console.log('  played cold - a stretch is one synchronous loop with no turn of the event loop in'
        + ' it, so this row carries its own warm-up inside it and is a ceiling, not a cost like the '
        + 'warmed rows above');
    }
    console.log('');
    console.log('  (a scavenge of this heap measures 0.85-1.12 ms under `node --trace-gc`: that is the'
      + ' size of the worst frame the F3 plate reports, and none of it is the crowd - every byte spent'
      + ' above is a hitch the player waits through)');
  }

  if (verdict.gated === 0) {
    console.log('VERDICT n/a - nothing in this run was gated');
    return;
  }
  console.log('VERDICT ' + (verdict.pass ? 'PASS' : 'FAIL') + ' - ' + verdict.gated
    + ' gated load(s); the dearest step threw away ' + bytes(verdict.worstBytes)
    + ' and the empty arena ' + bytes(floor.bytesPerStep)
    + (verdict.failed.length ? '; over: ' + verdict.failed.join(', ') : ''));
  if (!verdict.pass) process.exitCode = 1;
}

/** Only run when called as a command, so the tests can import the parts above. */
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  main().catch((err) => {
    console.error('alloc-probe: ' + err.message);
    process.exitCode = 1;
  });
}
