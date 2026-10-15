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
  settled, customScene, openScene, measureStep, measurePaint, sceneIsInsideBudgets, verdictOf,
  peakOfRealRuns,
} from '../tools/perf-probe.js';

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
  assert.equal(SCENES.filter((s) => s.gated).length, 4);
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

test('a crowd that is dying is dearer to paint and no dearer to step', async () => {
  // The reason the file plants a fight as well as a crowd: a death is the loudest thing a frame can do
  // (a ring, a fire, a spray, a floating number) and the loudest thing a step can skip (a body that is
  // gone stops walking and stops shoving). The paint half of that is exact - operations cannot be late -
  // and it is the claim this test is really keeping. The step half is a wall clock on a box that may be
  // busy (the suite runs forty files at once), so it is a guard against a *surprise* - a death that
  // cost ten times what a walk costs - and not a claim about which of the two scenes is the cheaper of
  // the pair. Under load they trade places; a factor of two is what survives that.
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
    const full = settled(scene, 2, 3, null);
    const read = await readScene(full);
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
    { args: ['--kind', 'nonsense'], why: /there is no kind called nonsense/ },
    { args: ['--seconds', '0'], why: /--seconds wants a number of seconds above zero/ },
    { args: ['--reps', '0'], why: /--reps wants at least one timed pass/ },
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
