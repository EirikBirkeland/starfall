#!/usr/bin/env node
// What a frame costs, and against what: PLAN section 2's performance target, measured.
//
//   node tools/perf-probe.js                                   every scene, and the verdict
//   node tools/perf-probe.js --scene endless                   one scene only
//   node tools/perf-probe.js --bodies 300 --shots 400         a scene of your own (measured, never gated)
//   node tools/perf-probe.js --kind shielder                  a crowd of one kind, to price one body against another
//   node tools/perf-probe.js --seconds 4 --reps 5              a longer window, more passes
//   node tools/perf-probe.js --peak                           adds what a real run was seen holding
//   node tools/perf-probe.js --quiet                          the verdict and nothing else
//
// PLAN section 2 says the game must "run at 60 fps with 600 enemies, 1500 bullets, 4000 particles on
// a mid-range laptop", and PLAN milestone 10 asks whether that is true of the game that shipped. It
// cannot be answered by reading the code, and it cannot be answered whole here either, so this file
// answers the two halves that *can* be measured without a browser and says plainly which half is
// missing. There is no canvas in here: the harness's is a stub that counts what it is asked for.
//
//   **the simulation, in milliseconds.** One `stepWorld` at a scene's load, timed on this box, over
//   `--seconds` of arena time. This is the real thing and it is the half the crowd is made of: the
//   walk, the separation, the broad phase, every hit test. A frame at 60 fps is two of them.
//
//   **the painter, in canvas operations.** Strokes, fills, sprite stamps and words, one frame, with
//   the interface taken back out (tools/headless/frame-cost.js) so a scene is only ever the arena.
//   These are not milliseconds and nothing in here pretends they are: what a `stroke` costs a canvas
//   depends on the canvas, the pixel ratio and what is already on the glass. What an *operation count*
//   can say is how much work the painter is asking for, which is the half that a change in the art
//   moves - and it is the currency every previous measurement in this file's family was written in
//   (the note on `BALANCE.endless.growth.bodiesCeil` quotes draw calls and nothing else).
//
//   **the page, in writes a frame.** The arena is a canvas and every word of the interface is DOM, so
//   the same frames are counted a third way: text put into an element, children added or taken away,
//   which is what a browser charges for and what nothing above can see. It is measured on the painter's
//   frames because those are the frames the interface is painted on, and it is the number that turns
//   "the page is quiet" from a hope into a reading - the arena is a canvas and the score, the purse and
//   the level line are painted on it (render/hud.js), so a busy fight writes the page not at all.
//
// Why the target itself is part of the answer: PLAN section 2 was written before the arena became
// 3000x3000 (section 4), before the camera culled everything off the glass (render/camera.js) and
// before the effect lists were capped (game/effects.js). Three of its numbers are now unreachable by
// the shipped game, and each one is unreachable by a different wall:
//
//   - the crowd stops at `endless.growth.bodiesCeil`, which is a frame budget and not difficulty;
//   - sparks are trimmed to `effects.particleCap` by the spawner that makes them;
//   - and no gun, at any rank, keeps `1500` shots in the air - which is what `--peak` is for, because
//     that sentence should be a measurement and not this comment (and `test/perf-probe.test.mjs` is what
//     keeps it one when the guns next change).
//
// So the scenes below are the loads the game can be *told* to hold, and the literal section-2 scene
// is measured too - gated against nothing, printed so that nobody has to re-measure it and so that
// the distance between "what the game does" and "what the plan asked for" is a number and not an
// opinion.
//
// Budgets, and what each of them is allowed to mean:
//
// Three numbers, every one of them a choice, and the choice is written next to it. All three are
// ratchets, so called: they exist so that a change which makes the frame dearer has to be argued
// about, and not because any one of them is a claim about what a browser can do.
//
//   SIM_STEP_MS    what one step of the arena may cost on a box like this one. The four gated scenes
//                  measure 0.04 - 0.13 ms here and PLAN section 2's own load measures 1.0 ms, so
//                  1.5 ms is "the heaviest thing this file can be made to plant, plus half again": it
//                  moves no shipped frame, and a change that made a step ten times dearer would trip
//                  it. A mid-range laptop is slower than this box by some factor nobody has measured,
//                  which is exactly why the shipped frame is read off the F3 plate and not off here.
//
//   PAINT_OPS      what the *mean* painted frame of the arena may ask the canvas for, in operations.
//                  These are not milliseconds and never will be (see above). The number is the busiest
//                  gated scene - the crowd at the wall, dying, which measures 3,403 operations a frame
//                  here - with about a fifth over it. The game passes it today; a change that puts a
//                  few hundred more operations on every frame trips it and has to be worth what it
//                  costs.
//
//   PAINT_WORST_OPS what the *dearest single frame* in the window may ask for - 3,638 operations on the
//                  same scene, measured the same day. This is the one a 60 fps budget is really spent
//                  on, and it is the reason the painter is measured twice: a crowd dying in bursts asks
//                  for a very different number in a quiet frame and in a frame where thirty bodies went
//                  down at once (see `measurePaint`). A mean over two seconds reads whichever half of a
//                  burst it happened to land in, so it cannot be the only gate - but it is kept, because
//                  a change that makes every frame a little dearer need not move the worst frame at all.
//
// The gated scenes are the ones the game can reach. If one of them goes over, a change has made the
// arena more expensive to run or to draw and it should be argued about; if `plan2` goes over, nothing
// has happened, and that is why it is not gated.

import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { stepWorld } from '../src/game/world.js';
import { makeEnemy } from '../src/game/kinds.js';
import { frameCosts, resetCosts } from '../src/render/debug.js';
import { bootGame } from './headless/harness.js';
import { makeFrameCost } from './headless/frame-cost.js';
import { playOneRun, FRAME_MS } from './headless/bot.js';
import { WEAPONS } from '../src/game/weapons.js';
import { table, int, dec } from './headless/tables.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const STEP = BALANCE.sim.step;

/** How many times the clock ticks on one 60 fps frame. The frame budget is spent in these. */
export const STEPS_PER_FRAME = 2;

// The two budgets. See "Budgets" above for what each one is allowed to mean.
export const SIM_STEP_MS = 1.5;
// The crowd at the wall, dying, all on one screen: 3,403 operations a frame on the mean and 3,638 on
// its dearest frame, measured on the commit that wrote these two numbers. test/perf-probe.test.mjs
// re-measures both and fails the project if either goes over.
export const PAINT_OPS = 4000;
export const PAINT_WORST_OPS = 4400;
// The page, in writes a frame. The arena is a canvas and every word of the interface is DOM
// (render/hud.js paints the score, the purse and the level line *on the canvas*, with the fight), so
// a frame of a busy arena writes the page not at all - measured 0.00 writes a frame in all four gated
// scenes, and held screen by screen by test/dom-writes.test.mjs.
//
// The budget is 1 and not 0 on purpose. A card that legitimately arrives in the middle of a scene's
// window is a burst of a couple of dozen writes spread over a hundred and eighty frames, which is
// what this number is for: it catches a panel that starts being *rebuilt* every frame - session 125
// found the death's card doing exactly that, with its "press to go" flag forgotten - and a rebuilt
// panel reads tens a frame, not a fraction of one.
export const PAGE_WRITES = 1;

// PLAN section 2's sentence, as numbers, so the file can be read against the sentence it is testing.
export const PLAN_SECTION_2 = { bodies: 600, shots: 1500, sparks: 4000 };

/**
 * The scenes. `onGlass` is the whole of the difference on the painter's side: the camera only draws
 * what it is looking at, so 200 bodies spread over a 3000x3000 arena are a tenth of the drawing of
 * 200 bodies parked in front of the ship - while costing the simulation exactly the same.
 *
 * `shots` are planted slow and long-lived, because a scene has to still be the scene it was when the
 * ruler comes back for it; a real run's shots are quick and short and `--peak` is where those are
 * measured.
 */
export const SCENES = [
  {
    id: 'schedule', name: 'the schedule at full crowd', gated: true,
    note: 'waves.maxBodies on the glass, the spark cap',
    bodies: () => BALANCE.waves.maxBodies, onGlass: true,
    shots: () => 60, sparks: () => BALANCE.effects.particleCap,
  },
  {
    id: 'endless', name: 'endless at the body wall', gated: true,
    note: 'bodiesCeil on the glass, the spark cap',
    bodies: () => BALANCE.endless.growth.bodiesCeil, onGlass: true,
    shots: () => 60, sparks: () => BALANCE.effects.particleCap,
  },
  {
    id: 'fight', name: 'the same crowd, dying', gated: true,
    note: 'bodiesCeil with the hull a body really has, and shots that kill it',
    bodies: () => BALANCE.endless.growth.bodiesCeil, onGlass: true,
    shots: () => 60, sparks: () => BALANCE.effects.particleCap, mortal: true,
  },
  {
    id: 'spread', name: 'the same crowd, spread out', gated: true,
    note: 'bodiesCeil over the whole arena - most of it is culled',
    bodies: () => BALANCE.endless.growth.bodiesCeil, onGlass: false,
    shots: () => 60, sparks: () => BALANCE.effects.particleCap,
  },
  {
    id: 'plan2', name: "PLAN section 2's sentence", gated: false,
    note: '600 bodies, 1500 shots and 4000 sparks, all of it on the glass',
    bodies: () => PLAN_SECTION_2.bodies, onGlass: true,
    shots: () => PLAN_SECTION_2.shots, sparks: () => PLAN_SECTION_2.sparks,
  },
];

export function readArgs(argv) {
  const opts = { scene: null, seconds: 2, reps: 3, peak: false, quiet: false, bodies: null, shots: null, sparks: null, kind: null };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const next = () => argv[++i];
    if (key === '--scene') opts.scene = next();
    else if (key === '--kind') opts.kind = next();
    else if (key === '--seconds') opts.seconds = Number(next());
    else if (key === '--reps') opts.reps = Number(next());
    else if (key === '--bodies') opts.bodies = Number(next());
    else if (key === '--shots') opts.shots = Number(next());
    else if (key === '--sparks') opts.sparks = Number(next());
    else if (key === '--peak') opts.peak = true;
    else if (key === '--quiet') opts.quiet = true;
    else throw new Error('I do not know the flag ' + key);
  }
  if (!(opts.seconds > 0)) throw new Error('--seconds wants a number of seconds above zero');
  if (!(opts.reps >= 1)) throw new Error('--reps wants at least one timed pass a scene');
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

// --- planting a scene ---------------------------------------------------------

/**
 * A load that stays put. Every spawner here writes every field, which is the pool's contract and the
 * only reason a recycled shot cannot arrive wearing the last scene's `pierce`.
 *
 * `mortal` is the whole difference between a crowd that is standing and a crowd that is dying: with
 * the hull a body really has, a shot that lands ends a body, and a death is the loudest thing a step
 * can do - sparks, wreck, a ring, a floating number, shards, a sound cue, and the score bookkeeping
 * that comes with all of it. A scene of immortal bodies measures the walking and nothing else.
 */
function plantBodies(game, count, onGlass, mortal, kind) {
  const world = game.world;
  const names = kind !== null && kind !== undefined
    ? [kind]
    : ['drifter', 'weaver', 'darter', 'spitter', 'tank', 'swarmling', 'bomber', 'shielder'];
  let seed = 12345;
  const spin = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const ship = world.player;
  for (let i = 0; i < count; i++) {
    let x;
    let y;
    if (onGlass) {
      x = ship.x + (spin() - 0.5) * 1100;
      y = ship.y + (spin() - 0.5) * 620;
    } else {
      x = spin() * world.arena.w;
      y = spin() * world.arena.h;
    }
    // An immortal body is what makes a scene stay the scene; a mortal one is what makes it a fight.
    world.enemies.push(makeEnemy(world, names[i % names.length], x, y, mortal ? null : { hp: 1e9 }));
  }
}

function plantShots(game, count, lethal, onGlass) {
  const world = game.world;
  const ship = world.player;
  let seed = 999;
  const spin = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  while (world.bullets.count < count) {
    const b = world.bullets.spawn();
    const a = spin() * Math.PI * 2;
    // A planted shot sits where its crowd sits: on the glass, near the ship, so it is drawn; off it,
    // anywhere in the arena, so a scene that is culled is culled in full.
    const d = lethal ? spin() * 60 : spin() * (onGlassSpan(world) / 2);
    b.x = onGlass ? ship.x + Math.cos(a) * d : spin() * world.arena.w;
    b.y = onGlass ? ship.y + Math.sin(a) * d : spin() * world.arena.h;
    b.px = b.x;
    b.py = b.y;
    // A planted shot that leaves the window in a frame would have to be re-planted every frame, and
    // then the timing would be measuring the re-planting - except in a fight, where that is the point
    // and the gun is doing the same thing for real.
    const speed = lethal ? 700 : 120;
    b.vx = Math.cos(a) * speed;
    b.vy = Math.sin(a) * speed;
    b.life = lethal ? 1.2 : 120;
    b.dmg = lethal ? 3 : 1;
    b.knock = 0;
    b.pierce = 0;
    b.bounce = 0;
    b.charged = false;
    b.turret = false;
    b.hunts = false;
    b.splash = 0;
    b.hits.length = 0;
  }
}

function plantSparks(game, count) {
  const world = game.world;
  const ship = world.player;
  let seed = 4242;
  const spin = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  while (world.particles.count < count) {
    const p = world.particles.spawn();
    p.x = ship.x + (spin() - 0.5) * 1100;
    p.y = ship.y + (spin() - 0.5) * 620;
    p.px = p.x;
    p.py = p.y;
    p.vx = (spin() - 0.5) * 60;
    p.vy = (spin() - 0.5) * 60;
    p.life = 120;
    p.max = 120;
    p.size = 2.4;
    p.color = '#8fd8ff';
    p.shape = 'spark';
    p.rot = spin() * 6;
    p.spin = 0;
  }
}

/** How wide a stretch of glass a planted shot is allowed to be spread over. */
function onGlassSpan(world) {
  return Math.min(world.view.w, 1280);
}

/**
 * Plant a whole scene - the crowd, the shots, the sparks. Shared with `tools/alloc-probe.js`, which
 * measures the same loads in bytes instead of in milliseconds and in canvas operations, and which
 * must not have its own copy of "what a scene is" or the two rulers would drift apart.
 */
export function plantScene(game, scene) {
  plantBodies(game, scene.bodies, scene.onGlass, scene.mortal, scene.kind);
  plantShots(game, scene.shots, scene.mortal, scene.onGlass);
  plantSparks(game, scene.sparks);
}

/**
 * A run that will not end, will not spawn, and will not level: the scene is planted on top of it.
 * The launch goes through the title screen like a player's does, so the frame loop, the camera and
 * the HUD are all the real ones by the time anything is measured.
 */
export async function openScene(game, seed) {
  await game.resetToTitle(seed);
  game.pressMouse(640, 360, 0);
  game.step(FRAME_MS);
  game.step(FRAME_MS);
  const world = game.world;
  if (world.state !== STATE.PLAY) throw new Error('the run never launched, so there is nothing to measure');
  world.player.invuln = Infinity;
  world.spawnTimer = Infinity;
  world.xpNeed = Infinity;
  world.bossIndex = BALANCE.bosses.schedule.length;
  return world;
}

// --- the two measurements -----------------------------------------------------

/**
 * Put a scene back at its planted size. Bodies walk off towards the ship and shots leave the glass,
 * so a scene has to be topped up to still be the scene it was named for; the caller times that
 * separately and takes it back out, because keeping a scene standing is this file's work and not the
 * game's.
 */
export function holdScene(game, scene) {
  const world = game.world;
  if (world.enemies.length < scene.bodies) {
    plantBodies(game, scene.bodies - world.enemies.length, scene.onGlass, scene.mortal, scene.kind);
  }
  if (world.bullets.count < scene.shots) plantShots(game, scene.shots, scene.mortal, scene.onGlass);
  if (world.particles.count < scene.sparks) plantSparks(game, scene.sparks);
}

/**
 * One scene's simulation cost: `seconds` of arena time, timed, with the crowd held at its planted
 * size. `holdMs` is the topping-up on its own, printed so that the subtraction can be seen.
 *
 * The window is run `reps` times, and the two kinds of number in it are combined differently:
 *
 *   - **the milliseconds take the best pass.** This is a wall clock and the box it runs on may be busy
 *     - the test suite runs forty files at once, on purpose - and a pre-empted pass reads slow and
 *     says nothing about the game, while the fastest pass of a handful is the one where the process
 *     mostly had its core. The paint needs no such care: an operation count cannot be late.
 *   - **the counts are summed over every pass.** Which pass happened to be fastest is a fact about the
 *     box; what the scene was holding is a fact about the game, and the world is a little further along
 *     the third time round (a crowd walks in, shots land, sparks get re-planted). Keeping the counts
 *     off the winning pass made the printed load depend on which pass won the race; adding them all up
 *     and dividing by the whole run makes the same number come back every time.
 */
export function measureStep(game, scene) {
  const world = game.world;
  const steps = Math.round(scene.seconds / STEP);
  const input = {
    moveX: 0, moveY: 0, moving: false,
    aimX: world.player.x + 200, aimY: world.player.y, firing: false, dash: false,
  };
  const hold = () => holdScene(game, scene);

  hold();                                     // the game has to have met the scene before it is timed on it
  for (let i = 0; i < 30; i++) stepWorld(STEP, input);

  const reps = Math.max(1, Math.round(scene.reps));
  const totals = { ms: 0, holdMs: 0, bodies: 0, shots: 0, sparks: 0 };
  let bestMs = Infinity;
  for (let rep = 0; rep < reps; rep++) {
    const pass = timeAStep(game, scene, steps, input, hold);
    totals.ms += pass.ms;
    totals.holdMs += pass.holdMs;
    totals.bodies += pass.bodies;
    totals.shots += pass.shots;
    totals.sparks += pass.sparks;
    if (pass.ms < bestMs) bestMs = pass.ms;
  }
  const every = steps * reps;
  const stepMs = bestMs / steps;
  return {
    stepMs,
    frameMs: stepMs * STEPS_PER_FRAME,
    holdMs: totals.holdMs / every,
    bodies: totals.bodies / every,
    shots: totals.shots / every,
    sparks: totals.sparks / every,
  };
}

/**
 * One pass over the window, in totals and not in averages: `measureStep` picks the fastest of these
 * for the milliseconds and adds all of them up for the counts.
 */
function timeAStep(game, scene, steps, input, hold) {
  const world = game.world;
  let holdMs = 0;
  let bodies = 0;
  let shots = 0;
  let sparks = 0;
  const start = process.hrtime.bigint();
  for (let i = 0; i < steps; i++) {
    const h0 = process.hrtime.bigint();
    hold();
    holdMs += Number(process.hrtime.bigint() - h0) / 1e6;
    stepWorld(STEP, input);
    bodies += world.enemies.length;
    shots += world.bullets.count;
    sparks += world.particles.count;
  }
  return {
    ms: Number(process.hrtime.bigint() - start) / 1e6 - holdMs,
    holdMs,
    bodies,
    shots,
    sparks,
  };
}

/**
 * One scene's painter cost, with the interface taken out. The load is held between the frames for the
 * same reason it is held between the steps.
 *
 * Two answers and not one, because a crowd that is dying is not steady: bodies go down in batches and
 * a death is what costs the painter (a ring, a fire, a spray, a floating number), so the same scene
 * asks for about 3,000 operations in a quiet frame and several thousand more in one where a wave went
 * down together. A mean over a short window reads whichever half of a burst it landed in, which makes
 * it a poor thing to gate a project on, so the window is measured twice over:
 *
 *   `total`  the mean operations a frame asks for across the whole window;
 *   `worst`  the dearest single frame in it, which is the number a 60 fps budget is actually spent on.
 *
 * Both are gated (see PAINT_OPS and PAINT_WORST_OPS) and both are deterministic: the seed is fixed,
 * the stub canvas counts calls and not milliseconds, and the same scene planted in the same order
 * paints the same picture.
 */
const PAINT_KEYS = ['strokes', 'fills', 'images', 'texts', 'gradients', 'shadows', 'baked'];

export function measurePaint(game, scene) {
  const frameCost = makeFrameCost(game);
  const frames = Math.max(6, Math.round(scene.seconds * 60));
  const hold = () => holdScene(game, scene);
  const total = {};
  for (const key of PAINT_KEYS) total[key] = 0;
  let worst = 0;
  // The page on the same frames. The arena is a canvas and every word of the interface is DOM, so a
  // frame that rebuilds a panel is spending time the crowd never sees - which is invisible here until
  // it is counted (session 125 found the death's card writing itself sixty times a second).
  let domTotal = 0;
  let domWorst = 0;
  for (let i = 0; i < frames; i++) {
    hold();
    game.resetDomWrites();
    const cost = frameCost(() => game.step(FRAME_MS));
    const writes = game.domWrites();
    domTotal += writes;
    if (writes > domWorst) domWorst = writes;
    for (const key of PAINT_KEYS) total[key] += cost[key];
    const frameOps = cost.strokes + cost.fills + cost.images + cost.texts;
    if (frameOps > worst) worst = frameOps;
  }
  const per = {};
  for (const key of PAINT_KEYS) per[key] = total[key] / frames;
  per.total = per.strokes + per.fills + per.images + per.texts;
  per.worst = worst;
  per.dom = domTotal / frames;
  per.domWorst = domWorst;
  return per;
}

/** A scene of the caller's own, for `--bodies` and friends: measured, and never gated. */
export function customScene(opts) {
  return {
    id: 'yours', name: 'a scene you asked for', gated: false,
    note: '--bodies/--shots/--sparks',
    bodies: () => (opts.bodies === null ? BALANCE.waves.maxBodies : opts.bodies),
    onGlass: true,
    mortal: false,
    kind: opts.kind === undefined ? null : opts.kind,
    shots: () => (opts.shots === null ? 60 : opts.shots),
    sparks: () => (opts.sparks === null ? BALANCE.effects.particleCap : opts.sparks),
    seconds: opts.seconds,
    reps: opts.reps,
  };
}

/** Resolve a scene's function-shaped numbers into the numbers a measurement needs. */
export function settled(scene, seconds, reps, kind) {
  return {
    id: scene.id, name: scene.name, note: scene.note, gated: scene.gated,
    bodies: scene.bodies(), onGlass: scene.onGlass, mortal: !!scene.mortal,
    // --kind is a lever on any scene, not only on a custom one: "what does one kind of body cost"
    // has to be askable of the crowd the game actually fields.
    kind: kind === undefined || kind === null ? (scene.kind || null) : kind,
    shots: scene.shots(), sparks: scene.sparks(),
    seconds: seconds === undefined ? scene.seconds : seconds,
    reps: reps === undefined ? scene.reps : reps,
  };
}

// --- what a real run was seen holding -----------------------------------------

/**
 * The busiest live counts a played run produced, per list, for one primary. This is the only half of
 * the file that asks the game to be itself instead of being planted, and it is what turns "no gun
 * keeps 1500 shots in the air" from a comment into a reading - one gun at a time, because how many
 * shots are in the air is a property of the gun as much as of the game.
 */
export async function peakOfRealRuns(game, seeds, minutes, weapon) {
  const peak = { weapon, bodies: 0, shots: 0, enemyShots: 0, sparks: 0, shards: 0, stepWorst: 0, stepAvg: 0 };
  let samples = 0;
  const last = BALANCE.bosses.schedule[BALANCE.bosses.schedule.length - 1].at;
  for (const seed of seeds) {
    await game.resetToTitle(seed);
    resetCosts();
    playOneRun(game, {
      maxSeconds: minutes * 60,
      at: last,
      policy: 'aware',
      picks: 'wise',
      weapon,
      onFrame: (g) => {
        const w = g.world;
        peak.bodies = Math.max(peak.bodies, w.enemies.length);
        peak.shots = Math.max(peak.shots, w.bullets.count);
        peak.enemyShots = Math.max(peak.enemyShots, w.enemyShots.count);
        peak.sparks = Math.max(peak.sparks, w.particles.count);
        peak.shards = Math.max(peak.shards, w.shards.count);
        // The F3 plate's own numbers (render/debug.js): main.js times its step loop and hands the
        // frame over every time round, so a headless run has real step milliseconds in it already.
        // What is *not* in here is the paint - the stub canvas measures its own bookkeeping, not a
        // canvas's, which is why the painter is counted in operations instead.
        const cost = frameCosts();
        peak.stepWorst = Math.max(peak.stepWorst, cost.stepWorst);
        peak.stepAvg += cost.stepAvg;
        samples++;
      },
    });
  }
  peak.stepAvg = samples > 0 ? peak.stepAvg / samples : 0;
  return peak;
}

// --- printing -----------------------------------------------------------------

/** The busiest thing any gun was seen holding, for the sentence under the peak table. */
function worstPeak(peaks, field) {
  return peaks.reduce((m, p) => Math.max(m, p[field]), 0);
}

function peakLines(peaks, seeds) {
  return table(
    'WHAT REAL RUNS WERE SEEN HOLDING',
    peaks.length + ' primaries x ' + seeds.length + ' seeds, late in the schedule, live counts at their busiest',
    'llrrrrrr',
    ['gun', 'bodies', 'shots', 'enemy shots', 'sparks', 'shards', 'step ms avg', 'step ms worst'],
    peaks.map((p) => [
      p.weapon, int(p.bodies), int(p.shots), int(p.enemyShots), int(p.sparks), int(p.shards),
      dec(p.stepAvg, 3), dec(p.stepWorst, 3),
    ])
  );
}

export function sceneLines(results) {
  return table(
    'THE SCENES',
    'a scene is planted and held; the step is timed on this box, the painter is counted in operations',
    'lllrrrrrrrrrrl',
    ['scene', 'bodies', 'shots', 'sparks', 'step ms', 'sim ms/frame', 'strokes', 'fills', 'stamps',
      'ops mean', 'ops worst', 'page/frame', 'page worst', 'gate'],
    results.map((r) => [
      r.name,
      int(r.live.bodies), int(r.live.shots), int(r.live.sparks),
      dec(r.step.stepMs, 3), dec(r.step.frameMs, 2),
      int(r.paint.strokes), int(r.paint.fills), int(r.paint.images),
      int(r.paint.total), int(r.paint.worst),
      dec(r.paint.dom, 2), int(r.paint.domWorst),
      r.gated ? (r.ok ? 'PASS' : 'FAIL') : '-',
    ])
  );
}

/**
 * Whether a scene is inside every budget it is gated on. Exported so a test can ask the same question
 * of a reading without running the arena again.
 */
export function sceneIsInsideBudgets(paint, step) {
  return step.stepMs <= SIM_STEP_MS
    && paint.total <= PAINT_OPS
    && paint.worst <= PAINT_WORST_OPS
    && paint.dom <= PAGE_WRITES;
}

export function verdictOf(results) {
  const gated = results.filter((r) => r.gated);
  const failed = gated.filter((r) => !r.ok);
  return {
    pass: failed.length === 0,
    gated: gated.length,
    failed: failed.map((r) => r.name),
    worstOps: gated.reduce((m, r) => Math.max(m, r.paint.worst), 0),
    meanOps: gated.reduce((m, r) => Math.max(m, r.paint.total), 0),
    worstStep: gated.reduce((m, r) => Math.max(m, r.step.stepMs), 0),
    worstPage: gated.reduce((m, r) => Math.max(m, r.paint.dom), 0),
  };
}

async function main() {
  const opts = readArgs(process.argv.slice(2));
  const chosen = opts.bodies !== null || opts.shots !== null || opts.sparks !== null
    ? [settled(customScene(opts), opts.seconds, opts.reps, opts.kind)]
    : SCENES.filter((s) => opts.scene === null || s.id === opts.scene)
      .map((s) => settled(s, opts.seconds, opts.reps, opts.kind));

  const game = await bootGame({ root: ROOT, seed: 20261011 });
  const results = [];
  for (const scene of chosen) {
    await openScene(game, 20261011);
    plantScene(game, scene);
    game.step(FRAME_MS);                    // let the camera look at where the ship now is
    const step = measureStep(game, scene);
    // The painter gets its own copy of the scene. A dying crowd is not steady (see `measurePaint`),
    // and a window that starts at the end of a timing run reads a different half of its burst cycle
    // than one that starts at the planting - so the planting is done again and both halves of a scene
    // are read from the same starting frame, whatever `--seconds` was asked for.
    await openScene(game, 20261011);
    plantScene(game, scene);
    game.step(FRAME_MS);
    const paint = measurePaint(game, scene);
    results.push({
      // A table that does not say which body it planted is the mistake --kind exists to stop, so the
      // kind goes into the row's own name.
      name: scene.name + (scene.kind === null ? '' : ' (all ' + scene.kind + ')'),
      id: scene.id, note: scene.note, gated: scene.gated,
      step, paint, live: step,
      ok: sceneIsInsideBudgets(paint, step),
    });
  }
  const verdict = verdictOf(results);
  if (!opts.quiet) {
    const cpus = os.cpus();
    console.log('What a frame costs (PLAN section 2).');
    console.log('  box     ' + (cpus[0].model || 'a cpu').trim() + ', ' + cpus.length
      + ' cores, node ' + process.versions.node);
    console.log('  budget  a step <= ' + dec(SIM_STEP_MS, 2) + ' ms; a painted arena <= '
      + int(PAINT_OPS) + ' operations on the mean and ' + int(PAINT_WORST_OPS) + ' on its dearest frame'
      + '; and the page <= ' + dec(PAGE_WRITES, 2) + ' writes a frame');
    console.log('  window  ' + dec(chosen[0].seconds, 1) + 's of arena time and '
      + Math.max(6, Math.round(chosen[0].seconds * 60)) + ' painted frames a scene, '
      + chosen[0].reps + ' timed pass(es) and the best of them');
    console.log('');
    console.log(sceneLines(results));
    for (const r of results) {
      console.log('  ' + r.name + ': ' + r.note
        + (r.step.holdMs > 0.0005
          ? ' (re-planting what the scene lost cost ' + dec(r.step.holdMs, 3)
            + ' ms a step, and is taken out of its number)'
          : ''));
    }
    console.log('');
    console.log('The walls the shipped game puts up, against the sentence:');
    console.log('  bodies  ' + BALANCE.endless.growth.bodiesCeil + ' (`endless.growth.bodiesCeil`)'
      + ', and ' + BALANCE.waves.maxBodies + ' on a scheduled run (`waves.maxBodies`)');
    console.log('  sparks  ' + BALANCE.effects.particleCap + ' (`effects.particleCap`)');
    console.log('  shots   whatever a gun can hold in the air - run with --peak to see what that is');
    console.log('  PLAN section 2 asks for ' + PLAN_SECTION_2.bodies + ' / ' + PLAN_SECTION_2.shots
      + ' / ' + PLAN_SECTION_2.sparks + ', and that row above is measured against none of it');

    if (opts.peak) {
      const seeds = [1, 2];
      const peaks = [];
      for (const gun of WEAPONS) peaks.push(await peakOfRealRuns(game, seeds, 4, gun.id));
      console.log('');
      console.log(peakLines(peaks, seeds));
      console.log('');
      console.log('  the busiest gun was seen holding ' + int(worstPeak(peaks, 'shots'))
        + ' of its own shots in the air, and ' + int(worstPeak(peaks, 'sparks'))
        + ' sparks; PLAN section 2 asked for ' + int(PLAN_SECTION_2.shots) + ' and '
        + int(PLAN_SECTION_2.sparks));
      console.log('  the crowd stopped at ' + int(worstPeak(peaks, 'bodies'))
        + ' bodies - which is the wall, not the ceiling of what a step can afford');
      console.log('  (a step\'s own milliseconds are the F3 plate\'s, timed in the frame loop; the '
        + 'painter\'s half is not among them, because the stub canvas measures its own bookkeeping and '
        + 'not a canvas)');
    }
    console.log('');
  }
  game.stop();

  if (verdict.gated === 0) {
    console.log('VERDICT n/a - nothing in this run was gated');
    return;
  }
  console.log('VERDICT ' + (verdict.pass ? 'PASS' : 'FAIL') + ' - ' + verdict.gated
    + ' gated scene(s); the worst step was ' + dec(verdict.worstStep, 3) + ' ms, the dearest frame '
    + int(verdict.worstOps) + ' operations, the dearest mean ' + int(verdict.meanOps)
    + ' and the busiest page ' + dec(verdict.worstPage, 2) + ' writes a frame'
    + (verdict.failed.length ? '; over: ' + verdict.failed.join(', ') : ''));
  if (!verdict.pass) process.exitCode = 1;
}

/** Only run when called as a command, so the tests (and a scratch script) can import the parts above. */
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  main().catch((err) => {
    console.error('perf-probe: ' + err.message);
    process.exitCode = 1;
  });
}
