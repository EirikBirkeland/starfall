#!/usr/bin/env node
// What a step throws away, and against what: PLAN section 2's "no allocation inside the per-frame
// loops", measured.
//
//   node tools/alloc-probe.js                                  every load, and the verdict
//   node tools/alloc-probe.js --scene endless                  one load only
//   node tools/alloc-probe.js --kind sniper                    a crowd of one kind
//   node tools/alloc-probe.js --kinds                          one row per kind, to price one body
//                                                              against another - a price list, so it
//                                                              measures and never gates
//   node tools/alloc-probe.js --parts                          one row per list, so a byte can be
//                                                              traced to the crowd, the shots or the
//                                                              sparks
//   node tools/alloc-probe.js --bodies 300 --sparks 900        a load of your own (measured, gated
//                                                              against nothing)
//   node tools/alloc-probe.js --live                           weigh what a real run was seen holding
//   node tools/alloc-probe.js --seconds 30                     how long that run is flown (60 s)
//   node tools/alloc-probe.js --steps 300 --windows 12         a longer window, more of them
//   node tools/alloc-probe.js --quiet                          the verdict and nothing else
//
// What this file cannot do is name the line a byte came from - a byte has no return address, and the
// inspector's sampling profiler only sees what stayed alive. That question is `tools/alloc-ablate.js`:
// it takes one line out of a copy of the game and reads the same load again.
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
import { stepWorld } from '../src/game/world.js';
import { drainCues } from '../src/game/cues.js';
import { bootGame } from './headless/harness.js';
import { FRAME_MS } from './headless/bot.js';
import {
  SCENES, settled, openScene, plantScene, holdScene, customScene, watchRealRun,
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
// away **16 B** a step, the schedule crowd **354 B**, the endless wall **449 B**, the same crowd dying
// **713 B** and spread out **454 B**; a body costs **2 B** and 900 sparks alone cost the step *nothing*
// over an empty arena (60 shots alone cost 1 B). All three budgets came down when the warm-up was
// fixed - by 4x on the floor, 2x on a load and 2x on a body - because what the old numbers were mostly
// measuring was V8 still compiling the step, and a ratchet set against a compiler cannot be tightened
// by anything the game does. That is the point of a ratchet: it goes down when the game does, or it is
// only a ceiling.
//
// They came down a second time when the **sound queue** went onto a pool (game/cues.js). Every cue used
// to be a fresh object and a fight asks for 1.7 sounds a step - a darter's beat, two shots landing, a
// death and the shards it paid out - which made one `queue.push` the dearest allocator in the game on
// its own: switching those four pushes off read the dying crowd at 689 B and the endless wall at 507 B
// against the 984 B and 574 B they were. Records go round a pool now, and what a sound costs a step is
// a spawn, a hand of field writes and a clear instead of an allocation.
//
// And a third time when `updateEffects` stopped looking its drags up in a dictionary keyed by shape
// name (game/effects.js has the note): a keyed read of a double has to be handed back boxed, which is
// 16 B a spark twice a step once V8 stops being able to prove the number is a double - and it proved it
// could, for about ten minutes of arena time, which is why every budget here passed while the game threw
// away **29 KB a step**. Most of what the floor row was measuring was that same lookup: the empty arena
// fell **64 B → 16 B**, and every crowd row with it by about a fifth. The 735 B the dying crowd used to
// read was a rung and not a measurement; warmed to the bottom it reads **713 B**, which is what the
// budget below is 25% over.
//
// STEP_BYTES sits inside PLAN section 2's 1 KiB on purpose: **896 B**, which is 25% over the dearest
// gated load (the crowd dying, at 713-716 B) and - deliberately - *under* the 984 B that same load threw
// away before the sound queue went onto a pool. A gate that the last fix would have passed is a gate
// nobody believes, so this one was checked the way every budget in this file has been checked: put the
// allocation back in a copy of the tree and watch it fail. It failed at 29 KB for the drag dictionary.
// BODY_BYTES is two and a half times the 2 B a body costs at that same wall - loose on purpose, because
// three of the nine kinds are over it on their own and a mixed crowd is what the gate is for.
export const FLOOR_BYTES = 48;
export const STEP_BYTES = 896;
export const BODY_BYTES = 5;

/**
 * How a load is warmed up. `WARM_PROBE_STEPS` is the window the warm-up measures - wider than a
 * measuring window on purpose, because what a load needs is steps and every window pays for two full
 * collections to get them. `WARM_MIN_STEPS` is the floor on the warm-up (a load that looks flat after
 * two probes has not started getting cheap yet) and `WARM_MAX_STEPS` the ceiling, so a box that never
 * settles gets a complaint instead of a hang. Measured on these loads with these settings: **24,000 to
 * 51,000 steps a load** - the empty arena and the two pooled lists about 24,000-33,000, the 100-body
 * crowd 35,000, the two 200-body walls 41,000-51,000 - so a full ladder is about a minute, which is the
 * price of a number that means something. The width is not a free knob: a probe of 2,000 steps steps
 * further before it decides and reads the same crowd about a fifth cheaper again, so 1,000 is the width
 * the three budgets above were set against and moving it means moving them.
 */
export const WARM_PROBE_STEPS = 1000;
export const WARM_MIN_STEPS = 12_000;
export const WARM_MAX_STEPS = 300_000;
/** Probes that have to agree before the load counts as warm... */
export const WARM_QUIET = 6;
/**
 * ... how far apart probes may be (the readings bounce; a band tells a bounce from a fall), and how
 * long the floor has to have stopped falling before the flat stretch counts as warm.
 *
 * A plateau is not a settle. A load falls in **rungs**: measured on `the schedule crowd alone` (100
 * bodies, no shots, no sparks) it reads 1,300 B a step, then ~840, ~720, ~480, ~350, ~286 - every rung
 * flat for thousands of steps, every one cheaper than the last by more than the band, the way down a
 * background compile finishing. Six probes sit inside the band on a rung every time, so a rule that
 * stops on the first band stops on whichever rung the compiler happened to have reached, and the same
 * load then reads **369 B a step in one process and 289 in the next** - a fifth of the whole crowd,
 * which is more than the differences two rows of this table are asked about.
 *
 * So the warm-up is over when the *cheapest reading it has seen* has not fallen for `WARM_HOLD_STEPS`
 * and the probes under the wheel are flat. A rung cannot satisfy that: it takes a fall to leave a rung,
 * and a fall restarts the clock. `WARM_MIN_STEPS` alone cannot either - a load can be flat on a rung at
 * the minimum and still have two rungs left, which is what this file used to do and why two processes
 * could disagree about a crowd by 80 B a step.
 */
export const WARM_HOLD_STEPS = 12_000;
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

/**
 * The name a row is printed under: the load's own, with the kind stamped on when the load was planted
 * from one kind of body. Exported because it is the whole meaning of a `--kinds` row and it was being
 * silently overwritten (see where the rows are built in `main`).
 */
export function rowName(load) {
  return load.kind === null || load.kind === undefined || load.kind === ''
    ? load.name : load.name + ' (all ' + load.kind + ')';
}

/** The loads a plain run measures: PLAN's four walls, or one of them, or one kind of body. */
export function chosenLoads(opts) {
  if (opts.parts) return partLoads();
  // A load is a *price list* - measured, printed, and not gated - when it is not a crowd the game can
  // be asked to field: one kind of body on its own (the director mixes, and a kind is allowed to spend
  // an object on purpose: the darter files a sound a step or two), or a scene that exists to be
  // subtracted from another one (`noBytes`, whose bytes are the spark cap's and not the clump's - a
  // clump is priced in operations, in tools/perf-probe.js). Everything over the per-body budget is
  // still named under the table, so ungated is not the same as silent. Three kinds are over it today:
  // the darter on the sounds it files, and the shielder and the swarmling on writes their walk makes
  // once per body - which `tools/alloc-ablate.js` chased, and the answer is that it is not one line.
  // Taking almost any part of the stand-off or the flocking walk out takes the whole 48 B a body with
  // it, because what those crowds pay is a shape V8 compiled the crowd's loop into and not a thing the
  // walk spends; the same edit made dearer on one kind and cheaper on another. A mixed crowd - the one
  // the director fields, and the one the gate below is a gate on - pays 3 B a body.
  const priceList = (scene, kind) => {
    const load = settled(scene, undefined, undefined, kind);
    if ((kind !== null && kind !== undefined) || scene.noBytes === true) load.gated = false;
    return load;
  };
  if (opts.bodies !== null || opts.shots !== null || opts.sparks !== null) {
    // A load of your own: `customScene` builds it ungated, because nobody knows what you were asking.
    return [settled(customScene(opts), undefined, undefined, opts.kind)];
  }
  if (opts.kinds) {
    return Object.keys(BALANCE.kinds).map((kind) => priceList(
      SCENES.find((s) => s.id === 'schedule'), kind));
  }
  if (opts.scene !== null) {
    return SCENES.filter((s) => s.id === opts.scene).map((s) => priceList(s, opts.kind));
  }
  return SCENES.filter((s) => s.noBytes !== true).map((s) => priceList(s, opts.kind));
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
 * probe here is one ordinary window - collections, two readings, refused if the collector came into it -
 * and the load is warm when the probes under the wheel agree within `WARM_BAND` *and* the cheapest of
 * them has not fallen for `WARM_HOLD_STEPS`. Both halves are the reading itself saying it has stopped
 * falling: the band says "flat now", the hold says "flat for long enough that whatever rung was coming
 * next has had its turn" (see `WARM_HOLD_STEPS` for why the band alone is not enough).
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
  let floor = Infinity;          // the cheapest probe since the last fall out of it
  let fellAt = 0;                // and where that fall happened
  while (steps < WARM_MAX_STEPS) {
    const probe = await oneWindow(work, WARM_PROBE_STEPS, watch);
    if (probe === null) { voids++; probes.length = 0; continue; }
    steps += WARM_PROBE_STEPS;
    // A probe more than a band below the floor is the next rung appearing, and it starts the clock
    // again. One inside the band is a bounce and does not - the floor follows the bounces down too,
    // or a load that dips and recovers would never be believed.
    if (probe.bytes * WARM_BAND < floor) { floor = probe.bytes; fellAt = steps; }
    else if (probe.bytes < floor) floor = probe.bytes;
    probes.push(probe.bytes);
    if (probes.length > WARM_QUIET) probes.shift();
    if (warmEnough(probes, steps, fellAt)) return { steps, settled: true, voids };
  }
  return { steps, settled: false, voids };
}

/**
 * Whether the probes so far say the load is warm: the last `WARM_QUIET` of them within `WARM_BAND` of
 * each other, and the cheapest reading of the whole warm-up not having fallen for `WARM_HOLD_STEPS`.
 * Exported because it is the arithmetic a test can check without a box to be warm: a rung and a settle
 * look the same to the first half of that rule and nothing else.
 */
export function warmEnough(probes, steps, fellAt) {
  if (steps < WARM_MIN_STEPS || steps - fellAt < WARM_HOLD_STEPS) return false;
  if (probes.length < WARM_QUIET) return false;
  let lo = Infinity;
  let hi = 0;
  for (const probe of probes) {
    if (probe < lo) lo = probe;
    if (probe > hi) hi = probe;
  }
  return hi <= lo * WARM_BAND;
}

/**
 * A load's bytes a step, in a process that has never measured anything else (see the header). The
 * load is held between the steps for the same reason `tools/perf-probe.js` holds it - bodies walk off,
 * shots leave the glass - and the holding is measured on its own in the same shape of window and taken
 * back out, because keeping a scene standing is this file's work and not the game's.
 *
 * The sound queue is emptied after every step, which is what a frame does with it once per frame
 * (`main.js` → `audio/sfx.js consumeCues`): a cue is a pooled record and a probe that stepped
 * without draining would measure a headless run's queue getting longer instead of the game's
 * work. The count is kept and printed, because how many sounds a load asks for is a fact worth
 * seeing next to the bytes they cost - the queue was the dearest allocator in the game until the
 * records went onto a pool, and it is still the row that says what a load asks an ear for.
 */
export async function measureLoad(game, scene, opts, watch) {
  const world = game.world;
  const input = {
    moveX: 0, moveY: 0, moving: false,
    aimX: world.player.x + 200, aimY: world.player.y, firing: false, dash: false,
  };
  let cues = 0;
  const countBatch = (batch) => { cues += batch.length; };
  const step = () => {
    holdScene(game, scene);
    stepWorld(STEP, input);
    drainCues(countBatch);
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
 * What a played run was seen holding, in the shape every other load in this file is planted from.
 *
 * This is what `--live` weighs, and it replaced a row that weighed the run itself - which was not a
 * cost. A byte window is only a window if the collector stayed out of it, and a played run is driven a
 * whole *painted frame* at a time (`game.step`), which fills this box's young generation in about a
 * hundred frames: every honest window was refused, and what printed instead was a floor that the row
 * apologised for - and most of those bytes were the headless browser's own bookkeeping (a draw call
 * logged is two objects built) rather than anything the game spends. `frameTrial` below is that
 * measurement, kept as a ruler so the decision can be re-asked instead of remembered.
 *
 * So the run is *watched* and what it held is planted: the mean crowd, shots and sparks over the
 * frames the ship was actually being flown, at the dearest mark on the boss schedule. That puts the
 * game's own fight in the same currency as the planted walls - the world's step, warmed, holding
 * taken out - which is the whole reason the row exists.
 *
 * It is planted **immortal**, like three of the four walls, and that is a decision rather than an
 * oversight. A mean of counts is a standing load: a death is a *rate*, and no mean of
 * bodies-on-the-glass carries one. Measured mortal, these same 49 bodies cost four times the step -
 * 1.4 KB against 290 B - but most of that is this tool re-planting every body its own planted shot
 * ends, and the holding is only weighed against an arena where nothing is dying. What a crowd that is
 * dying costs is the `fight` wall's job, and it is gated there.
 *
 * And it is a **price list, not a wall** (`gated: false`, like a crowd of one kind): the row moves with
 * how well the bot flies - a run that clears the crowd faster holds fewer bodies, and the same bytes
 * then divide by a smaller number. What the game can be *told* to hold is what the budgets are for; a
 * sampled fight is printed, named if it goes over, and read against the walls rather than judged by them.
 */
export function seenLoad(seen) {
  const mean = seen.mean;
  return {
    id: 'seen', name: 'what a real run was seen holding', gated: false,
    onGlass: true, mortal: false, kind: null, flocks: 0, each: 0,
    bodies: Math.max(1, Math.round(mean.bodies)),
    shots: Math.max(0, Math.round(mean.shots)),
    sparks: Math.max(0, Math.round(mean.sparks)),
  };
}

/**
 * How a frame trial is asked: which windows to try, how many warm each length up, and how many are read.
 * A frame is two of the simulation's steps, so these are short windows by this file's standards - and
 * they are tried in a set on purpose, because "your window was too big" is the obvious objection and it
 * is answered by the measurement and not in prose (see `frameTrial`).
 */
export const TRIAL_LENGTHS = [40, 120, 360];
export const TRIAL_WARM = 5;
export const TRIAL_WINDOWS = 5;

/** One window of painted frames: the bytes a step of it threw away, and why the ruler would refuse it. */
async function oneFrameWindow(game, scene, watch, frames) {
  await watch.settle();
  global.gc();
  global.gc();
  await watch.settle();
  const from = performance.now();
  const heapBefore = process.memoryUsage().heapUsed;
  const youngBefore = youngUsed();
  for (let i = 0; i < frames; i++) {
    holdScene(game, scene);
    game.step(FRAME_MS);
  }
  const grown = process.memoryUsage().heapUsed - heapBefore;
  const filled = youngUsed() - youngBefore;
  const to = performance.now();
  await watch.settle();
  const steps = frames * FRAME_MS / 1000 * STEPS_PER_SECOND;
  const why = watch.collectedSince(from, to) > 0 ? 'the collector came inside it'
    : (grown < 0 || filled < 0 || !readingsAgree(grown, filled)) ? 'its two readings disagreed' : '';
  return { bytes: Math.max(0, grown) / steps, why };
}

/** The trial at one window length: warm it, then read `TRIAL_WINDOWS` of them and count the refusals. */
async function trialAtLength(game, scene, watch, frames) {
  const reasons = {};
  let clean = 0;
  let floor = 0;
  for (let i = 0; i < TRIAL_WARM + TRIAL_WINDOWS; i++) {
    const window = await oneFrameWindow(game, scene, watch, frames);
    if (i < TRIAL_WARM) continue;            // this is the warm-up, same rule as every load's
    if (window.why === '') clean++;
    else reasons[window.why] = (reasons[window.why] || 0) + 1;
    if (window.bytes > floor) floor = window.bytes;
  }
  return { frames, windows: TRIAL_WINDOWS, clean, reasons, floor };
}

/**
 * Prove why a played run cannot be weighed here, instead of asserting it.
 *
 * Same scene, same ruler, one window at a time - but the windows are whole painted *frames*, and the
 * refusals are counted instead of hidden. What comes back is how many of them were clean, the reasons
 * for the ones that were not, and a **floor**: the dearest net growth seen, which is a floor because a
 * window the collector came into reports less than it spent.
 *
 * Three window lengths are tried, because shrinking the window is the obvious answer to "the collector
 * keeps coming inside it" and it has to be ruled out rather than waved away. It does not work: none of
 * the three lengths ever produced a clean window, and even the floors they report - what is left after
 * the collector took its share - are twenty to a hundred times what the same load costs the game to
 * step, because a painted frame spends the stub's bytes whether many of them are weighed together or
 * few.
 *
 * It is read in the same process as the load it is being quoted against, after that load was weighed.
 * That order can only make a frame look dearer than it is, and the number is a floor either way.
 */
export async function frameTrial(game, scene, watch) {
  const lengths = [];
  for (const frames of TRIAL_LENGTHS) lengths.push(await trialAtLength(game, scene, watch, frames));
  const reasons = {};
  let clean = 0;
  let windows = 0;
  let floor = 0;
  for (const one of lengths) {
    for (const why of Object.keys(one.reasons)) {
      reasons[why] = (reasons[why] || 0) + one.reasons[why];
    }
    clean += one.clean;
    windows += one.windows;
    if (one.floor > floor) floor = one.floor;
  }
  return { frames: TRIAL_LENGTHS, windows, clean, reasons, floor, lengths };
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
 * not a ratchet. That is also why the run `--live` watches is watched in a process of its own: the
 * load it hands back is weighed by a second child that has never seen anything else.
 */
function spawnChild(spec) {
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

/** One load, in its own process: the measuring spec the file was called with, plus the load. */
function measureChild(load, opts, extra) {
  return spawnChild(Object.assign({
    load, steps: opts.steps, windows: opts.windows, live: null, trial: false,
  }, extra || {}));
}

/** The child's whole job: measure one load - or watch one run - print it, get out. */
async function measureOneChild(spec) {
  const opts = { steps: spec.steps, windows: spec.windows };
  const game = await bootGame({ root: ROOT, seed: 20261011 });
  const watch = watchCollector();
  let out;
  if (spec.live !== null) {
    const seen = await watchRealRun(game, { seeds: [20261011], seconds: spec.live });
    out = { seen, load: seenLoad(seen) };
  } else {
    await openScene(game, 20261011);
    plantScene(game, spec.load);
    game.step(FRAME_MS);
    out = await measureLoad(game, spec.load, opts, watch);
    out.name = spec.load.name;
    out.id = spec.load.id;
    out.wanted = spec.load.bodies;
    // Read after the load was weighed, in the same process: that order can only make a painted frame
    // look dearer than it is, and the number it reports is a floor either way.
    if (spec.trial) out.trial = await frameTrial(game, spec.load, watch);
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

/**
 * Rows that are over the per-body budget without being walls: the price-list rows (`--kinds`, a named
 * scene, a load of your own, and the load a real run was seen holding) are measured and not gated,
 * because the crowd the game actually fields is gated as itself and a sampled fight moves with how well
 * the bot flies it. But "measured and silent" is how a forty-byte body stays hidden behind a PASS, so
 * every one of them that is over is named here in words instead of in a verdict.
 */
export function overBudgetRows(results) {
  return results.filter((r) => !r.gated && r.perBody !== null && r.perBody > BODY_BYTES);
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
    const reading = measureChild(load, opts);
    // The stamp goes *after* the reading, and that order is a fix and not a style point: the measuring
    // child sends back a row of its own with the plain scene name in it, and spreading it after the
    // stamped name used to overwrite the stamp - so `--kinds` printed nine rows all called "the
    // schedule at full crowd" and a reader could not tell a 3-byte body from a 48-byte one.
    results.push({
      ...reading,
      name: rowName(load),
      id: load.id, gated: !!load.gated, floor: !!load.floor,
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
    floor = measureChild(empty, opts);
    floor.name = empty.name;
    results.unshift({ ...floor, gated: false, perBody: null, ok: true, floor: true });
  }
  // `--live`, in two processes: one watches a real run and comes back with what it held, and a second
  // weighs that load the way every other row is weighed - warmed, in a process that has measured
  // nothing else. The row goes in before the per-body arithmetic below so that it gets the same figures
  // the planted walls get; it is a price list beside them, and not a wall (see `seenLoad`).
  let live = null;
  if (opts.live) {
    live = spawnChild({ load: null, steps: opts.steps, windows: opts.windows,
      live: opts.seconds, trial: false });
    const reading = measureChild(live.load, opts, { trial: true });
    live.trial = reading.trial;
    results.push({
      ...reading,
      name: rowName(live.load), id: live.load.id, gated: !!live.load.gated, floor: false,
      perBody: null, ok: reading.bytesPerStep <= STEP_BYTES,
    });
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
    if (live) {
      console.log('LIVE '
        + JSON.stringify({ seen: live.seen, load: live.load, trial: live.trial }));
    }
  } else if (!opts.quiet) {
    const cpus = os.cpus();
    console.log('What a step throws away (PLAN section 2: "no allocation inside the per-frame loops").');
    console.log('  box     ' + (cpus[0].model || 'a cpu').trim() + ', ' + cpus.length
      + ' cores, node ' + process.versions.node);
    console.log('  method  one process per load, warmed first: measured in ' + int(WARM_PROBE_STEPS)
      + '-step windows until the cheapest of them had stopped falling for '
      + int(WARM_HOLD_STEPS / 1000) + 'k steps and ' + int(WARM_QUIET)
      + ' of them in a row came within ' + dec((WARM_BAND - 1) * 100, 0)
      + '% of each other, each one starting from an emptied young'
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
      + ' steps a load, until the floor stopped falling and ' + int(WARM_QUIET)
      + ' windows in a row agreed'
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
    const pricey = overBudgetRows(results);
    if (pricey.length > 0) {
      console.log('  over the ' + bytes(BODY_BYTES) + ' a body, measured and not gated - a price list is'
        + ' not a wall the game fields, but it is not a secret either: '
        + pricey.map((r) => r.name + ' at ' + bytes(r.perBody)).join(', '));
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
    for (const r of results.filter((x) => x.gated || x.id === 'part' || x.id === 'seen')) {
      console.log(youngLine(r));
    }
    if (live) {
      const seen = live.seen;
      const trial = live.trial;
      const refused = Object.keys(trial.reasons)
        .map((why) => dec(trial.reasons[why] / trial.windows * 100, 0) + '% of them ' + why);
      const lengths = trial.lengths.map((one) => int(one.frames) + ' frames: ' + int(one.clean)
        + ' clean, floors ' + bytes(one.floor)).join('; ');
      console.log('');
      console.log('What a real run was seen holding: ' + dec(seen.mean.bodies, 1) + ' bodies, '
        + dec(seen.mean.shots, 1) + ' of its shots and ' + dec(seen.mean.sparks, 0)
        + ' sparks on average - ' + dec(seen.mean.enemyShots, 1) + ' of the arena\'s shots and '
        + dec(seen.mean.packs, 1) + ' clumps of the swarm beside them, over '
        + dec(seen.seconds, 0) + ' s flown from ' + dec(seen.at, 0) + ' s in'
        + (seen.stopped === null ? '' : ' (the run came up in ' + seen.stopped + ' partway through, so '
          + 'this is a shorter sample than was asked for)'));
      console.log('  that mean, planted as a load: ' + int(live.load.bodies) + ' bodies, '
        + int(live.load.shots) + ' shots, ' + int(live.load.sparks)
        + ' sparks - the row above, weighed like every other row instead of being watched while it'
        + ' runs. Standing and not dying: a death is a rate and no mean of counts carries one, so the'
        + ' dying is the `fight` wall\'s');
      console.log('  the run peaked at ' + int(seen.peak.bodies) + ' bodies, ' + int(seen.peak.shots)
        + ' of your shots, ' + int(seen.peak.enemyShots) + ' of the arena\'s, '
        + int(seen.peak.sparks) + ' sparks; the F3 plate read ' + dec(seen.stepAvg, 3)
        + ' ms a step on average and ' + dec(seen.stepWorst, 3) + ' ms at its worst'
        + ' (that worst is the collector, and `tools/perf-probe.js --peak` is where the plate is read)');
      console.log('  why the run is planted and not weighed: weighed a whole painted frame at a time, '
        + int(trial.clean) + ' of ' + int(trial.windows) + ' windows came out clean - ' + lengths
        + (refused.length ? '; ' + refused.join('; ') : '')
        + '. The dearest floor is ' + bytes(trial.floor)
        + ' a step, and it is this stub\'s own bookkeeping (every logged draw call builds two objects),'
        + ' not the game\'s: no length survived, so there is no window size left to weigh a frame at');
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
