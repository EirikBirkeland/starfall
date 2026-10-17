// The ruler that measures a frame, and the budgets it enforces (PLAN section 2, milestone 10).
//
// PLAN's performance sentence is "60 fps with 600 enemies, 1500 bullets, 4000 particles on a
// mid-range laptop". Two of those three numbers are unreachable by the shipped game on purpose - the
// crowd stops at a body wall and sparks are trimmed to a cap - so the sentence cannot be checked as
// written, and a promise that cannot be checked is not a budget. `tools/perf-probe.js` is the version
// of it that can be checked without a browser: it plants a load, keeps it standing, times one
// simulation step in milliseconds and counts one painted frame in canvas operations. This file keeps
// three things true about that instrument:
//
//   - **the scenes are the walls the game actually has** (planted from `BALANCE`, not typed in), so the
//     day a wall moves the ruler moves with it or says so;
//   - **the readings mean what they say**: the step's milliseconds come from the crowd and not from the
//     harness, the counts are the scene's and not a race, and a dying crowd really is dearer to paint
//     than a standing one;
//   - **the gated scenes are inside both paint budgets, the step budget and the page budget**, which is
//     the ratchet: a change that makes the arena dearer to run, dearer to draw, or starts writing the
//     page every frame has to be argued about here.
//
// What is *not* in here is any claim about a browser. The harness's canvas is a stub that counts calls
// and holds no pixels, so the paint half is counted in operations and never in milliseconds, and the
// frame a player actually sees is read off the F3 plate (render/debug.js) on a real machine.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { bootGame } from '../tools/headless/harness.js';
import { FRAME_MS } from '../tools/headless/bot.js';
import {
  SCENES, PLAN_SECTION_2, SIM_STEP_MS, PAINT_OPS, PAINT_WORST_OPS, PAGE_WRITES, STEPS_PER_FRAME,
  DEFAULT_SECONDS, DEFAULT_REPS, TELL_OPS, BROOD, FLOCK_CYCLE, settled, customScene, openScene, plantScene,
  holdScene, measureStep, measurePaint, measureBeats, beatsInsideBudget, sceneIsInsideBudgets,
  verdictOf, peakOfRealRuns, watchRealRun, stoppedNote, windowNote, stepStats,
} from '../tools/perf-probe.js';
import { isClump, BEATS } from '../src/game/flock.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'perf-probe.js');
const game = await bootGame({ root: ROOT, seed: 20261011 });

const SCENE_ID = {};
for (const scene of SCENES) SCENE_ID[scene.id] = scene;

/** One named scene, with a short window: for the tests that only need a reading, not the gate. */
function quick(id) {
  return settled(SCENE_ID[id], 1, 2, null);
}

/**
 * The tool's own sequence for one scene: time the step, then plant the scene again and paint it. The
 * second planting is what makes the paint reading independent of how long the timing run took (see
 * `main` in the tool), so a test that wants the tool's numbers has to walk the tool's path.
 */
async function readScene(scene) {
  await openScene(game, 20261011);
  const step = measureStep(game, scene);
  await openScene(game, 20261011);
  const paint = measurePaint(game, scene);
  return { step, paint, world: game.world };
}

/**
 * The tool's whole path for one scene, including the pinned-beat reading it only makes for a scene
 * that has packs in it. The beats are taken off the painter's copy of the scene, which is where the
 * tool takes them too.
 */
async function readSceneWithBeats(scene) {
  const read = await readScene(scene);
  read.beats = measureBeats(game, scene);
  return read;
}

function probe(args) {
  return spawnSync(process.execPath, [TOOL, ...args], { cwd: ROOT, encoding: 'utf8' });
}

// --- what the scenes are ------------------------------------------------------

test('the scenes are the walls the shipped game puts up, read from BALANCE', () => {
  // Every gated scene's body count is a wall out of balance.js, asked for and not typed in: the day
  // somebody moves `bodiesCeil` the scene moves with it, and a scene that planted a number nobody
  // configured any more would be a ruler with a inch scale bolted to a metric wall.
  const endless = settled(SCENE_ID.endless, 2, 3, null);
  const fight = settled(SCENE_ID.fight, 2, 3, null);
  const spread = settled(SCENE_ID.spread, 2, 3, null);
  const schedule = settled(SCENE_ID.schedule, 2, 3, null);
  assert.equal(schedule.bodies, BALANCE.waves.maxBodies);
  assert.equal(endless.bodies, BALANCE.endless.growth.bodiesCeil);
  assert.equal(fight.bodies, BALANCE.endless.growth.bodiesCeil);
  assert.equal(spread.bodies, BALANCE.endless.growth.bodiesCeil);
  assert.ok(endless.bodies > schedule.bodies, 'endless must be allowed a bigger crowd than a scheduled run');

  // Both are the spark cap, because the cap is the other half of the sentence PLAN section 2 wrote.
  assert.equal(endless.sparks, BALANCE.effects.particleCap);
  assert.equal(schedule.sparks, BALANCE.effects.particleCap);

  // The dying crowd is the same crowd with a mortal hull, and the spread one is the same crowd
  // culled: three readings of one load, so the differences between them mean something.
  assert.equal(fight.mortal, true);
  assert.equal(endless.mortal, false);
  assert.equal(spread.onGlass, false);
  assert.equal(endless.onGlass, true);

  // PLAN's own sentence is in the list and is not gated: it is a distance to print, not a promise.
  const plan2 = settled(SCENE_ID.plan2, 2, 3, null);
  assert.equal(plan2.bodies, PLAN_SECTION_2.bodies);
  assert.equal(plan2.shots, PLAN_SECTION_2.shots);
  assert.equal(plan2.sparks, PLAN_SECTION_2.sparks);
  assert.equal(plan2.gated, false);

  // The brood pair is one crowd planted twice: the same clumps, with a pack on them in one row and
  // with the packs taken back out of the other. Both halves come out of the swarm's own row - the pack
  // the wave director is allowed to buy, and not a number typed in here - and the scene is watched for
  // a whole beat, because the brace is 0.7 s of a 4.6 s cycle and a shorter window would report a
  // brood that never commits.
  const brood = settled(SCENE_ID.brood, undefined, undefined, null);
  const loose = settled(SCENE_ID.loose, undefined, undefined, null);
  assert.equal(brood.kind, 'swarmling');
  assert.equal(brood.flocks, BROOD.clumps);
  assert.equal(loose.flocks, brood.flocks, 'the control plants the same clumps, then unpacks them');
  assert.equal(loose.unpacked, true);
  assert.equal(brood.bodies, brood.flocks * brood.each);
  assert.equal(loose.bodies, brood.bodies, 'the same crowd either way, so the rows can be subtracted');
  const pack = BALANCE.kinds.swarmling.pack;
  assert.ok(brood.each >= pack.min && brood.each <= pack.into,
    `a clump of ${brood.each} is outside the pack the director may buy (${pack.min}-${pack.into})`);
  assert.ok(brood.seconds >= FLOCK_CYCLE,
    'the flock scene is watched for a whole cycle of its own beat');
  assert.equal(settled(SCENE_ID.endless, undefined, undefined, null).seconds, DEFAULT_SECONDS,
    'and every other scene takes the default window');

  assert.equal(SCENES.filter((s) => s.gated).length, 5);
});

test('the brood really flies in clumps, and the control has no pack on anything', async () => {
  // A planted swarmling with no pack just chases the ship (game/kinds.js), so "the crowd, but flocking"
  // is a thing this file has to check it actually planted and not assume.
  const scene = settled(SCENE_ID.brood, 1, 1, null);
  await openScene(game, 20261011);
  plantScene(game, scene);
  game.step(FRAME_MS);
  const world = game.world;
  assert.equal(world.enemies.length, scene.bodies);
  assert.equal(world.flocks.length, scene.flocks);
  assert.equal(world.enemies.filter((b) => b.type === 'swarmling').length, scene.bodies);
  assert.ok(world.enemies.every((b) => b.flock !== null), 'every body flies in a pack');
  const sizes = world.flocks.map((p) => p.n);
  assert.deepEqual(sizes, [scene.each, scene.each, scene.each], 'and every pack is the whole clump');
  assert.ok(world.flocks.every(isClump), 'every clump is big enough to be drawn a ring');
  // The beats are staggered, because packs are born at different times and keep the clock they were
  // born with - plant them in step and the scene is a lockstep volley the game never fields.
  assert.equal(new Set(world.flocks.map((p) => p.timer)).size, scene.flocks,
    'the three clumps are at three different points of the same beat');
  // A pinned beat survives a step, which is the only reason `measureBeats` can paint one.
  world.flocks[0].stage = BEATS.braced;
  world.flocks[0].stageTime = BALANCE.kinds.swarmling.flock.brace;
  world.flocks[0].timer = BALANCE.kinds.swarmling.flock.brace * 0.5;
  game.step(FRAME_MS);
  assert.equal(world.flocks[0].stage, BEATS.braced, 'half a beat left is still the same beat');

  const control = settled(SCENE_ID.loose, 1, 1, null);
  await openScene(game, 20261011);
  plantScene(game, control);
  game.step(FRAME_MS);
  assert.equal(game.world.enemies.length, control.bodies, 'the same crowd');
  assert.equal(game.world.flocks.length, 0, 'with nothing to fly it in');
  assert.ok(game.world.enemies.every((b) => b.flock === null));
});

test('the flock costs operations and not milliseconds, against its own control', async () => {
  // The reason the control row exists: "what does a pack cost" is a subtraction between two rows the
  // tool prints, and not a claim in a comment. The paint half moves - the ring, the arc, the nose
  // lights and the dive trail are drawn on the beats they are on - and the step half must not: a pack
  // is arithmetic on the crowd it describes, not a second crowd walking next to it.
  const packed = await readScene(settled(SCENE_ID.brood, undefined, 3, null));
  const loose = await readScene(settled(SCENE_ID.loose, undefined, 3, null));
  assert.ok(packed.paint.total > loose.paint.total,
    `the clumps painted ${packed.paint.total.toFixed(0)} operations a frame against the loose ${loose.paint.total.toFixed(0)}: nothing was drawn for the flock`);
  // The step half of the claim, and the honest tolerance on it: operations are counted and so are
  // exact, milliseconds are not. This same brood reads 0.015 ms on a quiet box and 0.163 ms with the
  // rest of the suite running alongside it, so a flock-to-control ratio is only meaningful down to a
  // quarter of a millisecond - which is a sixth of the frame budget, and the flock's own pass on three
  // clumps is nowhere near it. The ratchet on a step is SIM_STEP_MS, gated in the budget test below.
  assert.ok(packed.step.stepMs < Math.max(loose.step.stepMs * 3, 0.25),
    `a brood steps at ${packed.step.stepMs.toFixed(3)} ms and the same bodies loose at ${loose.step.stepMs.toFixed(3)} ms: the flock's own pass is costing more than the walk`);
  assert.ok(packed.step.packs > 2.9 && packed.step.packs < 3.1,
    'and the packs were there for the whole timed window');
  assert.equal(loose.step.packs, 0, 'and were not in the control');
});

test('a clump that is really gone comes back, and one with no room does not', async () => {
  // The other half of the guard: the top-up is not switched off, it is bounded. A pack whose bodies
  // went - which is what game/flock.js throwing one away looks like - is planted back, and the crowd is
  // whole again the next step.
  const scene = settled(SCENE_ID.brood, 1, 1, null);
  await openScene(game, 20261011);
  plantScene(game, scene);
  game.step(FRAME_MS);
  const world = game.world;
  const gone = world.flocks[0];
  world.flocks.splice(0, 1);
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    if (world.enemies[i].flock === gone) world.enemies.splice(i, 1);
  }
  assert.equal(world.enemies.length, scene.bodies - scene.each, 'a whole clump is out of the room');
  holdScene(game, scene);
  assert.equal(world.flocks.length, scene.flocks, 'and the hold put it back');
  assert.equal(world.enemies.length, scene.bodies, 'with its bodies, not a loose body apiece');
  game.step(FRAME_MS);            // the pack's own numbers are rebuilt from the crowd by a step
  assert.ok(world.flocks.every((p) => p.n >= 1), 'and every pack in the room has a body in it');
  assert.equal(Math.min(...world.flocks.map((p) => p.n)), scene.each,
    'and no pack was planted empty while its bodies stood around loose');
});

test('a hold cannot grow a scene, whatever it finds in the arena', async () => {
  // The trap this guard exists for is a runaway and not a wrong number: game/flock.js throws away a
  // pack whose last body is gone, so "put the missing clumps back" asked every step of a planting that
  // had attached its bodies to no pack would add a clump a step, forever - a ruler that grew the arena
  // instead of failing a test. The room for a clump is measured in the crowd, because a clump is part
  // of the crowd and not on top of it.
  const packed = settled(SCENE_ID.brood, 1, 1, null);
  const bare = settled(SCENE_ID.loose, 1, 1, null);
  await openScene(game, 20261011);
  plantScene(game, bare);          // the bodies a broken planting leaves: the clumps, unpacked
  assert.equal(game.world.flocks.length, 0);
  assert.equal(game.world.enemies.length, packed.bodies);
  for (let i = 0; i < 30; i++) holdScene(game, packed);
  assert.equal(game.world.enemies.length, packed.bodies,
    'thirty holds did not add one body to a crowd that had no room for a clump');
  assert.equal(game.world.flocks.length, 0, 'and none was conjured into it');
});

test('a clump\'s tell is a shape with a price, and the price is inside the budget', async () => {
  // The scene row cannot see a tell at all: a clump is braced for 0.7 s of a 4.6 s cycle, so a ring
  // that cost fifty operations would hide in a mean over a window. The beat is pinned instead, and
  // what comes back is the art's own shape - three arcs and a light for the ring, plus a nose light
  // per body - counted, so that a fourth shape or a blur has to be argued about.
  const read = await readSceneWithBeats(settled(SCENE_ID.brood, undefined, undefined, null));
  const beats = read.beats;
  assert.ok(beats !== null, 'a brood scene has beats to read');
  assert.equal(beats.clumps, BROOD.clumps);

  // The brace: three arcs (the whole circle faint, what is left of it hot, and the line of the arc)
  // and one light at its head - and then one nose light on every body the clump is made of, which is
  // the per-body tell the clump's ring was drawn to stand in for and still keeps.
  assert.equal(beats.braced.strokes, 3, 'the ring is three strokes and nothing else strokes it');
  assert.equal(beats.braced.stamps, BROOD.each + 1,
    'one light for the clump and one per body it is made of');
  assert.equal(beats.braced.fills, 0, 'and the brace fills no shape of its own');

  // The dive: a stretched trail and its head light, and a blur on every body that is flying the line.
  assert.equal(beats.diving.strokes, 0, 'the line is stamped, not stroked');
  assert.equal(beats.diving.stamps, BROOD.each + 2, 'a blur per body, the trail, and its head');

  // Neither one is allowed a blur: the glow sprites are the whole of how soft these get.
  assert.equal(beats.braced.gradients + beats.diving.gradients, 0, 'no gradient on a clump tell');
  assert.equal(beats.braced.shadows + beats.diving.shadows, 0, 'no shadow either');

  assert.ok(beatsInsideBudget(beats),
    `the brace costs ${beats.braced.ops.toFixed(1)} operations a clump and the dive ${beats.diving.ops.toFixed(1)}, over the ${TELL_OPS} allowed`);
  // A scene with no brood in it has no beats and cannot fail on them.
  assert.equal(beatsInsideBudget(null), true);
  assert.equal(beatsInsideBudget({ braced: { ops: TELL_OPS + 1 }, diving: { ops: 0 } }), false);
  assert.equal(beatsInsideBudget({ braced: { ops: 0 }, diving: { ops: TELL_OPS + 1 } }), false);
});

test('a window shorter than the beat is the mistake the flock scene names its own for', () => {
  // The trap in one line: the brace is 0.7 s of a 4.6 s cycle, so a two-second window can paint a
  // whole brood with no tell on it and report it as cheap as a loose crowd. A scene declares the
  // window it has to be watched for; `--seconds` still outranks it, because the flag is the question.
  const brood = settled(SCENE_ID.brood, undefined, undefined, null);
  const loose = settled(SCENE_ID.loose, undefined, undefined, null);
  assert.ok(brood.seconds >= FLOCK_CYCLE, 'the scene asks for a whole cycle');
  assert.equal(loose.seconds, brood.seconds, 'and so does its control, or the two rows are not one question');
  assert.ok(DEFAULT_SECONDS < FLOCK_CYCLE, 'and the default really is shorter than the beat');
  assert.equal(settled(SCENE_ID.brood, 2, 1, null).seconds, 2, 'the flag outranks the scene');
  assert.match(windowNote([brood]), new RegExp(Math.ceil(brood.seconds) + '\\.'),
    'the header says which window was measured');
  assert.match(windowNote([settled(SCENE_ID.endless, undefined, undefined, null), brood]), /2\.0s.*5\.0s/,
    'and when two scenes disagree, the header says both');
  // A scene of your own takes the default unless it says otherwise - and its clumps are part of the
  // crowd it names, not extra bodies on top of it, which is what makes `--flocks` a fair subtraction.
  const mine = settled(customScene({ bodies: 100, shots: 10, sparks: 10, flocks: 2, each: 14 }));
  assert.equal(mine.seconds, DEFAULT_SECONDS);
  assert.equal(mine.reps, DEFAULT_REPS);
  assert.ok(mine.flocks * mine.each <= mine.bodies, 'a clump is inside the crowd, not beside it');
  const named = settled(customScene({ bodies: 100, shots: 10, sparks: 10 }), 9, 4, null);
  assert.equal(named.seconds, 9, 'and a window from the flags is the window from the flags');
  assert.equal(named.reps, 4);
});

test('a planted scene really is the load it is named for, and holds', async () => {
  const scene = settled(SCENE_ID.endless, 1, 1, null);
  const read = await readScene(scene);
  const world = read.world;
  assert.equal(world.state, STATE.PLAY);
  assert.equal(world.enemies.length, scene.bodies);
  assert.equal(world.bullets.count, scene.shots);
  assert.equal(world.particles.count, scene.sparks);
  // The printed load is the scene's: a table row that said 200 bodies over a 60-body arena would be
  // the exact mistake this file exists to avoid.
  assert.ok(Math.abs(read.step.bodies - scene.bodies) < 1, 'the timed pass held its crowd');
  assert.ok(read.step.sparks > scene.sparks * 0.9, 'the sparks were there for the timing');
  // Nothing spawns or dies behind the probe's back, or the numbers would drift while they were read.
  for (let i = 0; i < 60; i++) game.step(1000 / 60);
  assert.equal(world.enemies.length, scene.bodies, 'the crowd did not grow or shrink on its own');
  assert.equal(world.state, STATE.PLAY, 'and the run did not end, level up, or hand out a card');
});

test('the step number is the crowd and not the harness', async () => {
  // If the timing instrument only ever read its own overhead then every scene would cost the same and
  // the whole tool would be decoration. Bodies are planted twice as many at a time, so a real cost
  // per body has to show up as a bigger number - and the gap has to be big enough that no scheduling
  // noise can account for it.
  const few = settled(customScene({ bodies: 20, shots: 0, sparks: 0 }), 1, 2, null);
  const many = settled(customScene({ bodies: 400, shots: 0, sparks: 0 }), 1, 2, null);
  const small = (await readScene(few)).step;
  const big = (await readScene(many)).step;
  assert.ok(small.stepMs > 0 && big.stepMs > 0, 'a timed pass that reported no time at all is not a measurement');
  assert.ok(big.stepMs > small.stepMs * 3,
    `400 bodies cost ${big.stepMs.toFixed(3)} ms and 20 cost ${small.stepMs.toFixed(3)} ms: the step is not reading the crowd`);
  assert.equal(big.bodies, 400);
  assert.ok(Math.abs(big.frameMs - big.stepMs * STEPS_PER_FRAME) < 1e-9,
    'a frame is two steps, and the table that prints both says so');
});

test('a scheduling stall cannot move the middle step, and a real doubling still can', () => {
  // Why `measureStep` times every step on its own instead of timing a pass: the suite runs thirty-odd
  // files at once and the scheduler takes a step away from the process now and then. A 30 ms stall
  // lands all of its milliseconds on one step of a 240-step window, which is more than the whole
  // crowd costs - so a *mean* over the window pays for it, and the millisecond gate used to go red on
  // a commit that had not touched a frame. The middle of the window does not blink.
  const clean = new Float64Array(237).fill(0.1);
  const plain = stepStats(clean);
  assert.equal(plain.median, 0.1);
  assert.equal(plain.worst, 0.1);
  assert.ok(Math.abs(plain.mean - 0.1) < 1e-12, 'a window with nothing in it but 0.1 ms averages 0.1 ms');

  const stalled = stepStats([...clean, 12, 30, 8]);
  assert.equal(stalled.median, 0.1, 'three stalls in two hundred and forty steps change nothing');
  assert.ok(stalled.mean > 0.2,
    `the same window reads ${stalled.mean.toFixed(3)} ms as a mean, which is the mistake this file`
    + ' used to gate on');
  assert.equal(stalled.worst, 30, 'and the tail is still named, even though nothing gates on it');

  // The mutation check: a statistic that throws the stalls away must not also throw away a step that
  // really did get twice as dear. The stalled cheap window and the clean dear one stay in order.
  assert.ok(stepStats(new Float64Array(240).fill(0.2)).median > stalled.median,
    'a crowd that costs twice as much still reads as costing twice as much');

  // The two edges of the middle: an odd window has one, an even window averages the pair.
  assert.equal(stepStats([3, 1, 2]).median, 2);
  assert.equal(stepStats([4, 1, 3, 2]).median, 2.5);
  assert.throws(() => stepStats([]), /no steps/, 'a window that measured nothing is refused');
});

test('a crowd that is dying is dearer to paint and no dearer to step', async () => {
  // The reason the file plants a fight as well as a crowd: a death is the loudest thing a frame can do
  // (a ring, a fire, a spray, a floating number) and the loudest thing a step can skip (a body that is
  // gone stops walking and stops shoving). The paint half of that is exact - operations cannot be late -
  // and it is the claim this test is really keeping. The step half is a wall clock on a box that may be
  // busy (the suite runs thirty-odd files at once), so it is a guard against a *surprise* - a death
  // that cost ten times what a walk costs - and not a claim about which of the two scenes is the
  // cheaper of the pair. Both readings are the middle step of a best pass now (see the test above),
  // which is most of what used to trip this one; a factor of two is what is left over once a stall is
  // out of the numbers, and it is still what survives a box on fire.
  const standing = await readScene(settled(SCENE_ID.endless, 2, 3, null));
  const dying = await readScene(settled(SCENE_ID.fight, 2, 3, null));
  assert.ok(dying.paint.total > standing.paint.total,
    `the dying crowd painted ${dying.paint.total.toFixed(0)} operations a frame against the standing ${standing.paint.total.toFixed(0)}`);
  assert.ok(dying.paint.worst >= standing.paint.worst);
  assert.ok(dying.step.stepMs < standing.step.stepMs * 2 + 0.05,
    `dying steps at ${dying.step.stepMs.toFixed(3)} ms and standing at ${standing.step.stepMs.toFixed(3)} ms: a death is costing more than a walk`
  );
  // And the camera: the same crowd spread over the whole arena is mostly culled, which is the only
  // difference between the two rows and has to show up on the painter and not on the step.
  const spread = await readScene(settled(SCENE_ID.spread, 2, 3, null));
  assert.ok(spread.paint.total < standing.paint.total * 0.8,
    'culling should be worth a lot of operations');
  assert.ok(spread.step.stepMs < standing.step.stepMs * 2 + 0.05
    && standing.step.stepMs < spread.step.stepMs * 2 + 0.05,
    'and nothing at all on the simulation, which walks the whole arena either way');
});

test('the load a scene was holding is the same number every time', async () => {
  // The tool runs its window several times and keeps the fastest pass for the milliseconds. It used to
  // keep that same winning pass for the counts as well, which made the printed load depend on which
  // pass won the race - and a table whose body count changes between two runs of the same commit is a
  // table nobody trusts. So: the milliseconds may come from the fastest pass; the counts may not.
  const scene = settled(SCENE_ID.plan2, 1, 3, null);
  const first = await readScene(scene);
  const second = await readScene(scene);
  assert.equal(first.step.bodies, second.step.bodies);
  assert.equal(first.step.shots, second.step.shots);
  assert.equal(first.step.sparks, second.step.sparks);
  assert.equal(first.paint.total, second.paint.total);
  assert.equal(first.paint.worst, second.paint.worst);
});

// --- the budgets --------------------------------------------------------------

test('every gated scene is inside the step budget, both paint budgets and the page budget', async () => {
  // This is the ratchet. The step budget has an order of magnitude of room over the shipped game
  // (0.12 ms against 1.5) so it only trips on a change that really makes the arena expensive; the two
  // paint budgets are set about a fifth over the busiest scene, which is "a few hundred operations",
  // which is what an art addition costs. Anything that trips this has to be worth it - and say so in
  // the commit message, and in the comment next to the number in the tool.
  for (const scene of SCENES.filter((s) => s.gated)) {
    // No window and no rep count passed in: a scene that has to be watched for a whole beat gets its
    // own window here, exactly as the tool gives it one.
    const full = settled(scene, undefined, undefined, null);
    const read = await readSceneWithBeats(full);
    assert.ok(read.step.stepMs <= SIM_STEP_MS,
      full.name + ' steps at ' + read.step.stepMs.toFixed(3) + ' ms, over ' + SIM_STEP_MS);
    assert.ok(read.paint.total <= PAINT_OPS,
      full.name + ' asks for ' + read.paint.total.toFixed(0) + ' operations a frame on the mean, over ' + PAINT_OPS);
    assert.ok(read.paint.worst <= PAINT_WORST_OPS,
      full.name + ' asks for ' + read.paint.worst + ' operations on its dearest frame, over ' + PAINT_WORST_OPS);
    assert.ok(read.paint.worst >= read.paint.total,
      'the dearest frame cannot be cheaper than the mean of the window it came from');
    assert.ok(read.paint.gradients < 1 && read.paint.shadows < 1,
      full.name + ' is not supposed to blur or gradient anything any more (see test/draw-cost.test.mjs)');
    assert.ok(read.paint.dom <= PAGE_WRITES,
      full.name + ' writes the page ' + read.paint.dom.toFixed(2) + ' times a frame, over '
        + PAGE_WRITES);
    if (full.flocks > 0) {
      assert.ok(read.beats !== null, full.name + ' is a brood scene and has no packs to read');
      assert.ok(beatsInsideBudget(read.beats),
        full.name + ' costs ' + read.beats.braced.ops.toFixed(1) + ' operations a clump on its brace '
          + 'and ' + read.beats.diving.ops.toFixed(1) + ' on its dive, over ' + TELL_OPS);
    }
  }
});

test('a busy arena writes the page not at all', async () => {
  // The interesting half of the page budget, and the reason it is a budget and not a shrug. Every word
  // of this game's interface is DOM and the arena is a canvas, and the score, the purse and the level
  // line are painted *on the canvas* with the fight (render/hud.js) - so 200 bodies dying on the glass
  // with the spark cap up write the page zero times a frame. That is what makes the interface free, and
  // it is exactly what session 125's bug cost: a card whose "press to go" flag was forgotten, painting
  // itself again on every frame it was up.
  //
  // If this ever reads non-zero, the first question is whether something has legitimately started
  // writing during a scene (a card arriving mid-window is a burst of a couple of dozen writes spread
  // over the window, which the budget above already allows). If it has, say so in the commit and raise
  // the reading here; if it has not, this is the bug.
  const read = await readScene(settled(SCENE_ID.fight, 2, 3, null));
  assert.equal(read.paint.dom, 0, 'the dying crowd writes the page, per frame');
  assert.equal(read.paint.domWorst, 0, 'and so does its busiest single frame');

  // The control, because a zero that comes from an instrument that is not plugged in looks identical
  // to a zero that means the page is quiet. The same counter, on the same boot, does see a panel: the
  // pause is DOM, and putting it up is a write.
  game.resetDomWrites();
  game.key('KeyP', true);
  game.key('KeyP', false);
  for (let i = 0; i < 3; i++) game.step(FRAME_MS);
  assert.ok(game.domWrites() > 0,
    'the counter sees a panel being put up, so its zero above means something');
  game.key('KeyP', true);
  game.key('KeyP', false);
  for (let i = 0; i < 3; i++) game.step(FRAME_MS);
});

test('a scene that goes over a budget fails, and only a gated one can', () => {
  const inside = {
    gated: true, ok: true, name: 'inside',
    step: { stepMs: 0.2 }, paint: { total: 1000, worst: 1200, dom: 0 },
  };
  const overMean = {
    gated: true, ok: sceneIsInsideBudgets({ total: PAINT_OPS + 1, worst: 1, dom: 0 }, { stepMs: 0.2 }),
    name: 'over the mean', step: { stepMs: 0.2 }, paint: { total: PAINT_OPS + 1, worst: 1, dom: 0 },
  };
  const overWorst = {
    gated: true,
    ok: sceneIsInsideBudgets({ total: 1, worst: PAINT_WORST_OPS + 1, dom: 0 }, { stepMs: 0.2 }),
    name: 'over the worst frame', step: { stepMs: 0.2 },
    paint: { total: 1, worst: PAINT_WORST_OPS + 1, dom: 0 },
  };
  const overStep = {
    gated: true, ok: sceneIsInsideBudgets({ total: 1, worst: 1, dom: 0 }, { stepMs: SIM_STEP_MS + 1 }),
    name: 'over the step', step: { stepMs: SIM_STEP_MS + 1 }, paint: { total: 1, worst: 1, dom: 0 },
  };
  const overPage = {
    gated: true,
    ok: sceneIsInsideBudgets({ total: 1, worst: 1, dom: PAGE_WRITES + 0.5 }, { stepMs: 0.2 }),
    name: 'over the page', step: { stepMs: 0.2 },
    paint: { total: 1, worst: 1, dom: PAGE_WRITES + 0.5 },
  };
  assert.equal(sceneIsInsideBudgets(inside.paint, inside.step), true);
  assert.equal(overMean.ok, false, 'a mean over the paint budget is a fail');
  assert.equal(overWorst.ok, false, 'a dearest frame over the paint budget is a fail');
  assert.equal(overStep.ok, false, 'a step over the step budget is a fail');
  assert.equal(overPage.ok, false, 'a page written every frame is a fail');

  const verdict = verdictOf([inside, overMean, overWorst, overStep, overPage]);
  assert.equal(verdict.pass, false);
  assert.deepEqual(verdict.failed,
    ['over the mean', 'over the worst frame', 'over the step', 'over the page']);
  assert.equal(verdict.worstStep, SIM_STEP_MS + 1);
  assert.equal(verdict.worstPage, PAGE_WRITES + 0.5);

  // PLAN's own scene may cost whatever it costs: it is printed so the distance to it is a number, and
  // it gates nothing, so it fails nothing.
  const ungated = verdictOf([inside, {
    gated: false, ok: false, name: 'PLAN section 2',
    step: { stepMs: 99 }, paint: { total: 99999, worst: 99999, dom: 99 },
  }]);
  assert.equal(ungated.pass, true);
  assert.equal(ungated.gated, 1);
  assert.deepEqual(ungated.failed, []);
});

// --- the command line ---------------------------------------------------------

test('it refuses a flag, a scene, a kind or a window it cannot measure', () => {
  const bad = [
    { args: ['--scnee', 'endless'], why: /I do not know the flag --scnee/ },
    { args: ['--scene', 'nonsense'], why: /there is no scene called nonsense/ },
    { args: ['--scene', 'endless,nonsense'], why: /there is no scene called nonsense/ },
    { args: ['--kind', 'nonsense'], why: /there is no kind called nonsense/ },
    { args: ['--seconds', '0'], why: /--seconds wants a number of seconds above zero/ },
    { args: ['--reps', '0'], why: /--reps wants at least one timed pass/ },
    { args: ['--flocks', '-1'], why: /--flocks wants a number of clumps/ },
    { args: ['--flocks', '1.5'], why: /--flocks wants a whole number of clumps/ },
  ];
  for (const one of bad) {
    const run = probe(one.args);
    assert.notEqual(run.status, 0, one.args.join(' ') + ' should not have been accepted');
    assert.match(run.stderr, one.why, one.args.join(' ') + ': ' + run.stderr);
    assert.equal(run.stdout, '', 'a refusal prints nothing but its complaint');
  }
});

test('one scene, printed once, and --quiet prints only the verdict', () => {
  const run = probe(['--scene', 'endless', '--seconds', '1', '--reps', '1']);
  assert.equal(run.status, 0, run.stderr);
  const rows = run.stdout.split('\n').filter((line) => /PASS|FAIL/.test(line) && !/VERDICT/.test(line));
  assert.equal(rows.length, 1, 'exactly one scene was measured:\n' + run.stdout);
  assert.match(run.stdout, /endless at the body wall/);
  assert.match(run.stdout, /ops mean\s+ops worst/, 'the painter is read twice and says so in the header');
  assert.match(run.stdout, /step ms\s+step ms worst/,
    'and so is the step - its middle and its tail, both printed');
  assert.match(run.stdout, /VERDICT PASS/);

  const quiet = probe(['--scene', 'endless', '--quiet', '--seconds', '1', '--reps', '1']);
  assert.equal(quiet.status, 0, quiet.stderr);
  assert.deepEqual(quiet.stdout.trim().split('\n').length, 1, '--quiet keeps the verdict and nothing else');
  assert.match(quiet.stdout, /^VERDICT PASS/);
});

test("PLAN section 2's own scene is measured and gated against nothing", () => {
  const run = probe(['--scene', 'plan2', '--seconds', '1', '--reps', '1', '--quiet']);
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.match(run.stdout, /VERDICT n\/a - nothing in this run was gated/);
});

test('a scene you asked for is measured and never gated', () => {
  const run = probe(['--bodies', '40', '--shots', '10', '--sparks', '50', '--seconds', '1', '--reps', '1']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /a scene you asked for/);
  assert.match(run.stdout, /VERDICT n\/a/, 'a hand-planted load is a reading, not a promise the project keeps');
});

test('--kind says which body it planted, in the row it printed', () => {
  // The same reason `--weapon` is named in tools/line-ab.js's header: a number that does not say what
  // it was measured on is the number that gets quoted at the wrong thing afterwards. A shielder costs
  // several times what a drifter does, so "the crowd costs 2,900 operations" is only true of a mix.
  const run = probe(['--scene', 'schedule', '--kind', 'tank', '--seconds', '1', '--reps', '1']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /the schedule at full crowd \(all tank\)/);
});

test('--flocks packs a scene of your own and says so in the row', () => {
  // A clump is a different load from the same number of loose bodies, so a reading that does not say
  // whether there were packs in it is the mistake --kind exists to stop.
  const run = probe(['--bodies', '42', '--flocks', '3', '--seconds', '1', '--reps', '1']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /a scene you asked for \(3 clumps\)/);
  assert.match(run.stdout, /one clump on a pinned beat/,
    'a scene with packs in it gets its tells priced');
  assert.match(run.stdout, /packs\s+shots/);

  const none = probe(['--bodies', '42', '--flocks', '0', '--seconds', '1', '--reps', '1']);
  assert.equal(none.status, 0, none.stderr);
  assert.doesNotMatch(none.stdout, /one clump on a pinned beat/,
    'no packs, so no tells to price - and not a zero pretending to be a reading');
});

test('two scenes print side by side, which is how a brood is read against its control', () => {
  const run = probe(['--scene', 'brood,loose', '--seconds', '1', '--reps', '1']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /the brood, in clumps/);
  assert.match(run.stdout, /the same brood, loose/);
  const rows = run.stdout.split('\n').filter((line) => /PASS|FAIL|-\s*$/.test(line) && !/VERDICT/.test(line));
  assert.ok(rows.length >= 2, 'both rows printed:\n' + run.stdout);
});

test('what a run held comes back as a peak and as a mean, and the mean is inside the peak', async () => {
  // The same watch feeds two rulers: `--peak` prints the maxima (a wall: can any gun hold PLAN's 1,500
  // shots) and `tools/alloc-probe.js --live` plants the means (a load: what the game was really
  // holding). Both readings have to come from one run, or the two rulers would be quoting different
  // afternoons - so this checks the pair, and that the mean never escapes the peak it came from.
  const seen = await watchRealRun(game, { seeds: [3], seconds: 20 });
  assert.ok(seen.frames > 60, 'a 20 s window is about 1,200 frames, and only flown ones count: '
    + seen.frames);
  assert.ok(seen.seconds > 15 && seen.seconds <= 20.5, 'the frames counted add up to the window asked'
    + ' for and no more: ' + seen.seconds + ' s');
  for (const key of ['bodies', 'shots', 'enemyShots', 'sparks', 'shards', 'packs']) {
    assert.ok(seen.mean[key] <= seen.peak[key], key + ' cannot average above its own peak: '
      + seen.mean[key] + ' against ' + seen.peak[key]);
  }
  assert.ok(seen.mean.bodies > 0, 'the run had a crowd in it to average');
  assert.ok(seen.peak.bodies <= BALANCE.endless.growth.bodiesCeil,
    'a run held ' + seen.peak.bodies + ' bodies, over the ceiling the director is capped at');
  assert.ok(seen.peak.sparks <= BALANCE.effects.particleCap,
    'sparks reached ' + seen.peak.sparks + ' and the spawner trims to ' + BALANCE.effects.particleCap);
  assert.ok(seen.stepAvg > 0 && seen.stepAvg < SIM_STEP_MS,
    'the plate read ' + seen.stepAvg.toFixed(3) + ' ms a step, mean');
  assert.ok(seen.stepWorst >= seen.stepAvg, 'the worst frame is not cheaper than the mean');
  // A short sample is a shorter sample than was asked for, and the watch is the only place that knows.
  assert.equal(seen.stopped, null, 'the window was flown right through, so nothing to report: '
    + seen.stopped);
});

test('a run that was not flown right through its window says so in the peak table', () => {
  assert.equal(stoppedNote([{ weapon: 'pulse', stopped: null }]), '',
    'a window flown right through needs no note');
  assert.match(stoppedNote([{ weapon: 'pulse', stopped: 'OVER' }, { weapon: 'arc', stopped: null }]),
    /1 not flown right through \(pulse: OVER\)/,
    'the state has to be named, because a mean over a wreck is not the fight');
});

// --- what a real run was seen holding ----------------------------------------

test('no gun keeps the plan 1,500 shots in the air, and no run the spark cap', async () => {
  // The third wall in the sentence is the one nobody put up: no gun, at any rank, can hold 1,500 shots
  // in the air, and a real run's sparks stop at the cap. Measured on a minute of a real bot run late
  // in the schedule rather than asserted in a comment, which is the whole reason `--peak` exists.
  const peak = await peakOfRealRuns(game, [3], 1, 'scatter');
  assert.ok(peak.bodies > 10, 'the run had a crowd in it to measure: ' + peak.bodies);
  assert.ok(peak.shots > 0, 'the gun fired');
  assert.ok(peak.shots < PLAN_SECTION_2.shots / 10,
    'a run held ' + peak.shots + ' shots, which is not a tenth of what PLAN section 2 asked for');
  assert.ok(peak.sparks > 0 && peak.sparks <= BALANCE.effects.particleCap,
    'sparks reached ' + peak.sparks + ', and the cap the spawner trims to is ' + BALANCE.effects.particleCap);
  assert.ok(peak.stepAvg > 0 && peak.stepAvg < SIM_STEP_MS,
    'the F3 plate read ' + peak.stepAvg.toFixed(3) + ' ms a step in a real run');
});
