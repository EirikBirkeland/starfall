// The Eclipse's blades, as painted, and as left out of the dark (PLAN 3.4's phase 3: "sweeping
// arms", seen in the phase-3 night that phase 3 also brings).
//
// There are no pixels here, so what these can say is the arithmetic of the two painters - which is
// exactly where the lies about them would live:
//
//   A fan is drawn at the length it reaches and the width it hurts at, and it is drawn as the whole
//     way the blade travels, not just where it starts. A sweep shown as a line would be a promise of
//     one bearing and a harm that arrives at forty others.
//   The night leaves the fan out, and leaves the blade out. The Eclipse's last phase is the darkest
//     row in the game, so this is not polish: a fan the dark has eaten is a wall you were standing
//     inside, and `telegraphMin` does not care how dark the room is (game/balance.js `bosses.dark`).
//   Both halves of that come from one question (render/arms.js), so the carve and the light are
//     measured against each other here and found identical - the same test the door's wedge has.
//   A blade is drawn as wide as it hurts, and a frame of blades costs the canvas nothing slow.
//
// The blade carve is a *path* on the night's own sheet, so it is read through the harness's
// offscreen path log (tools/headless/harness.js `pointsOffscreen`) - the same reason the veil's
// rectangles had to become rectangles rather than counts.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import {
  armCount, armProgress, armedCount, bossPhase,
} from '../src/game/bosses.js';
import { drawBlades, bladesOf, fansOf } from '../src/render/arms.js';

const ROOT = path.resolve(import.meta.dirname, '..');
// One device pixel per CSS pixel, for the reason test/darkness-art.test.mjs gives: the night is cut
// at CSS resolution, and at a ratio of 1 a sheet point and an arena point are the same numbers bar
// one camera translate - so distances can be compared without converting either side.
const game = await bootGame({ root: ROOT, seed: 13, dpr: 1 });
const field = game.world;
const SWEEP = BALANCE.bosses.eclipse.phases[2].sweep;
const DUE = BALANCE.bosses.schedule.findIndex((entry) => entry.boss === 'eclipse');

game.pressMouse(640, 360);
game.step();
game.releaseMouse();

/**
 * Bring the Eclipse out, put it in its last phase, and wait for the room to be under.
 *
 * The cards are cleared as they come out (test/darkness-art.test.mjs says why): the night is stepped
 * with the fight, and a run parked behind a card is not fighting.
 */
function intoTheBlades() {
  field.spawnTimer = Infinity;
  field.player.invuln = Infinity;
  field.bossIndex = DUE;
  field.elapsed = BALANCE.bosses.schedule[DUE].at - 0.05;
  let guard = 0;
  while ((field.boss === null || field.boss.enemy === null) && guard++ < 900) step(16);
  const boss = field.boss;
  assert.ok(boss !== null && boss.id === 'eclipse', 'the Eclipse never walked in');
  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[2] * 0.99;
  guard = 0;
  while (bossPhase(boss) < 3 && guard++ < 2000) step(16);
  assert.equal(bossPhase(boss), 3, 'the last phase never opened');
  return boss;
}

/** One frame, with the cards out of the way. */
function step(ms) {
  if (game.stats().state === game.STATE.LEVEL) {
    game.key('Digit1', true);
    game.step(ms);
    game.key('Digit1', false);
    return;
  }
  game.step(ms);
}

/** Step frames until `seen` answers true, and say whether it ever did. */
function until(seen, frames) {
  let n = 0;
  while (!seen()) {
    if (n++ > frames) return false;
    step(16);
  }
  return true;
}

/** Where an arena point lands on the sheet the night is cut on. */
function sheet(x, y) {
  return { x: x - game.camera.x, y: y - game.camera.y };
}

/**
 * The wedges of the fans being promised, as the night sees them: destination-out arcs. Every filter
 * here is against the row's own reach and not against `armReach(boss)`, because in the one test that
 * asks whether anything was lit when nothing was being promised, `armReach` is 0 and a filter on it
 * would answer the question by not asking it.
 */
function carvedFans() {
  return game.circlesOffscreen().filter((c) => c.mode === 'destination-out'
    && Math.abs(c.r - SWEEP.reach) < 1);
}

/** The lit fans, on the window: the same radius, the same bearings, a different composite. */
function litFans() {
  return game.circles().filter((c) => Math.abs(c.r - SWEEP.reach) < 1);
}

/** The sheet's own path points, as `{ x, y, }` in sheet pixels. */
function carved() {
  return game.pointsOffscreen();
}

/** How many sheet points stand `distance` px from `at`, give or take two. */
function atDistance(list, at, distance) {
  return list.filter((p) => Math.abs(Math.hypot(p.x - at.x, p.y - at.y) - distance) < 2).length;
}

// ---------------------------------------------------------------------------

test('a fan is drawn as the whole of the way its blade travels', () => {
  const boss = intoTheBlades();
  assert.ok(until(() => armCount(boss) > 0, 900), 'it never showed a fan');
  step(16);

  const fans = fansOf(boss, game.alpha === undefined ? 1 : 1);
  assert.equal(fans.length, SWEEP.arms, 'the frame lit a different number of fans than were promised');
  for (const fan of fans) {
    assert.equal(fan.reach, SWEEP.reach, 'a fan was drawn to a different length than it reaches');
    assert.ok(Math.abs((fan.to - fan.from) - SWEEP.arc) < 1e-9,
      'a fan was drawn narrower than the arc its blade travels');
  }

  // And it is on the glass: the wedges the frame asked for are the same count, at the same length.
  // (`arc` is logged twice per fan - the filled wedge and the rim across its end - which is why this
  // counts in twos.)
  const lit = litFans();
  assert.equal(lit.length, SWEEP.arms * 2, 'the fans were not painted: ' + lit.length + ' wedges');
  assert.ok(armProgress(boss) > 0, 'a fan with no countdown has nothing to brighten with');
});

test('the night leaves the fans out, out of the same wedges the light is drawn from', () => {
  const boss = intoTheBlades();
  assert.ok(until(() => armCount(boss) > 0, 900), 'it never showed a fan');
  step(16);

  const carved = carvedFans();
  assert.equal(carved.length, SWEEP.arms, 'the dark covered a fan it was promised: ' + carved.length);
  const lit = litFans();
  for (const fan of carved) {
    // Two painters, one question: the wedge the night lets through is one the frame lit, bearings and
    // all. A dark that disagreed with the light about where a fan is would be the worst bug here,
    // because both of them would look right.
    const twin = lit.find((c) => Math.abs(c.from - fan.from) < 1e-9 && Math.abs(c.to - fan.to) < 1e-9);
    assert.ok(twin !== undefined, 'the dark left a fan out that the frame never lit');
  }
});

test('a live blade is carved out of the night at the width it hurts at', () => {
  const boss = intoTheBlades();
  assert.ok(until(() => field.arms.count > 0, 900), 'it never loosed a blade');
  step(16);
  assert.ok(field.arms.count > 0, 'the blades were gone before they could be looked at');

  const sun = sheet(boss.enemy.x, boss.enemy.y);
  const list = carved();
  // The four corners of a blade stand `inner` and `reach` from the pivot, each pushed `half` off the
  // axis - so two of them are at one distance from the sun and two at the other, and the count is
  // four corners per blade with nothing else on the sheet at those radii.
  const root = Math.hypot(field.arms.items[0].inner, SWEEP.half);
  const tip = Math.hypot(SWEEP.reach, SWEEP.half);
  assert.equal(atDistance(list, sun, root), field.arms.count * 2,
    'the dark did not carve the roots of every blade');
  assert.equal(atDistance(list, sun, tip), field.arms.count * 2,
    'the dark did not carve the tips of every blade');
});

test('a blade is drawn as wide as it hurts, and no wider', () => {
  const boss = intoTheBlades();
  assert.ok(until(() => field.arms.count > 0, 900), 'it never loosed a blade');
  step(16);

  // One painter on a canvas of its own (tools/headless/harness.js `measure`), so the widths are the
  // blade's and not the frame's. A band is three passes - the full width, a hotter middle of it, and
  // a thin axis - and the widest of them is exactly twice `armHalf`, which is the one number the harm
  // is paid out at too (game/arms.js `offTheBlade`).
  const cost = game.measure((ctx) => drawBlades(ctx, field.arms, 1));
  // (`cost.images` is the number of blades that were actually on the glass; the ship is parked at the
  // sun by the phase's own drag in this file, so that is all of them, and it is what the counts below
  // are against.)
  assert.equal(cost.images, field.arms.count, 'a loose blade was not on the glass to be measured');
  assert.equal(cost.strokes, cost.images * 3,
    'a blade costs the canvas something other than its three band passes');
  assert.equal(cost.images, field.arms.count, 'a blade has no light at its own tip');
  assert.equal(cost.shadows, 0, 'a blade asked the canvas for a blur');
  assert.equal(cost.gradients, 0, 'a blade built a gradient to draw itself with');

  const wide = cost.widths.filter((w) => w === SWEEP.half * 2);
  assert.equal(wide.length, cost.images,
    'a blade was not drawn at twice the width it hurts at: ' + cost.widths.join(', '));
  assert.ok(Math.max.apply(null, cost.widths) === SWEEP.half * 2,
    'something on a blade is wider than the blade: ' + Math.max.apply(null, cost.widths));
});

test('nothing is lit or carved for a sweep that is not happening', () => {
  const boss = intoTheBlades();
  // A moment when the fight has promised nothing at all: no fan, no blade in the air, and no shell
  // armed either, because a shell's door is carved out of the night too and this claim is about a
  // frame with nothing in it.
  assert.ok(until(() => field.arms.count === 0 && armCount(boss) === 0 && armedCount(boss) === 0, 900),
    'the fight never had a moment between promises');
  step(16);
  assert.equal(armCount(boss), 0);
  assert.equal(field.arms.count, 0);
  assert.equal(litFans().length, 0, 'a fan was lit between sweeps');
  assert.equal(carvedFans().length, 0, 'a fan was left out of the night between sweeps');
  assert.equal(carved().length, 0, 'a blade was carved out of the night with none in the air');
});

test('a frame of blades asks the canvas for nothing slow', () => {
  const boss = intoTheBlades();
  assert.ok(until(() => field.arms.count > 0, 900), 'it never loosed a blade');
  for (let i = 0; i < 30; i++) step(16);
  const before = game.drawCalls();
  const baked = game.bakeCalls();
  let sawBlades = 0;
  for (let i = 0; i < 60; i++) {
    step(16);
    if (field.arms.count > 0 || armCount(boss) > 0) sawBlades++;
  }
  const spent = game.drawCalls();
  const build = game.bakeCalls();

  assert.ok(sawBlades > 30, 'no blades were on the glass for the frames that were counted');
  assert.equal(spent.shadows - before.shadows, 0, 'a frame of blades asked the canvas for a blur');
  assert.equal(spent.gradients - before.gradients, 0, 'a frame of blades built a gradient');
  assert.equal(build.gradients - baked.gradients, 0, 'and baked a gradient to draw one with');
});

/** How many strokes of the last frame were drawn at exactly a blade's width. */
function bandsOnTheGlass() {
  return game.strokeWidths().filter((w) => w === SWEEP.half * 2).length;
}

test('a live blade is on the glass and not only in the world', () => {
  // The frame's own log, for once, because there is a claim only the frame can answer: that the
  // painter is actually called. Everything else in this file asks one painter on a canvas of its own,
  // which is the right way to measure a blade and the wrong way to notice it had been unhooked.
  const boss = intoTheBlades();
  assert.ok(until(() => field.arms.count > 0 && armCount(boss) === 0, 900), 'it never loosed a blade');
  const live = field.arms.count;
  step(16);
  assert.equal(bandsOnTheGlass(), live,
    'the frame painted a different number of blades than were in the air');

  field.arms.clear();
  step(16);
  assert.equal(bandsOnTheGlass(), 0, 'something besides a blade is drawn at a blade\'s width');
});

test('what a blade takes off the night is most of the night', () => {
  // The carve is a *share* of the veil and not a radius (render/darkness.js), for the door's reason:
  // a blade is already the shape of a light, and all the night can do is stop covering it up. So the
  // only number for how visible a sweep is in the darkest room in the game is this one, and the
  // fairness argument for it is `telegraphMin`'s - a fan the night has eaten is a wall you were
  // standing inside, and a share much short of the door's would leave it a smudge.
  const dark = BALANCE.bosses.dark;
  assert.ok(dark.light.blade >= dark.light.door,
    'a sweep is left more covered than a shell door: ' + dark.light.blade);
  assert.ok(dark.light.blade <= 1,
    'a blade cannot take more of the night than there is: ' + dark.light.blade);
  assert.ok(dark.light.blade > 0.5,
    'the darkest room in the game is putting most of its night back over a blade: ' + dark.light.blade);
});

test('the blades and their fans are the same shapes the dark is cut with', () => {
  // The claim render/arms.js is built on, stated once: whatever the frame lights, the night lets
  // through, and neither of them measured anything the other one did not ask about. Both are asked
  // the same question twice over here and found equal, which is the only way two painters can be
  // proved not to have disagreed.
  const boss = intoTheBlades();
  assert.ok(until(() => armCount(boss) > 0, 900), 'it never showed a fan');
  step(16);

  const lit = fansOf(boss, 1);
  const carved = carvedFans();
  assert.equal(carved.length, lit.length);
  for (let i = 0; i < lit.length; i++) {
    assert.equal(carved[i].from, lit[i].from, 'the dark cut a fan at another bearing');
    assert.equal(carved[i].to, lit[i].to, 'the dark cut a fan of another width');
    assert.ok(Math.abs(carved[i].r - lit[i].reach) < 1, 'the dark cut a fan of another length');
  }

  const blades = bladesOf(field.arms, 1);
  assert.equal(blades.length, 0, 'a blade was live while a fan was being shown');
});
