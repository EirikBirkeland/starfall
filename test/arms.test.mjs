// The Eclipse's sweeping arms (PLAN 3.4's phase 3: "sweeping arms"), as the simulation means it.
//
// A blade is the one hazard in this game that *moves while it hurts*, and the whole of this file is
// about what that costs to be honest. Four claims, each of them a test:
//
//   **The fan shown is the fan swept.** The beat lights a wedge - bearing, width, length, thickness -
//     and the blades that come out of it are cut out of those same four numbers, from the bearings
//     the fight was holding when the fan lit. A promise that travels has to show the whole of the way
//     it travels (game/bosses.js `showArms`), and this is where that sentence is paid for.
//
//   **A blade dies at the far edge of its fan.** It travels `arc` radians and goes back in the drawer,
//     not one step of a sweep more (game/arms.js). A blade that outlived its own promise would be a
//     hazard with no telegraph at all.
//
//   **It costs a hull, once.** The blade asks for one hit and `player.hitInvulnerability` is what
//     says it cannot take a second one while the ship is still standing in it. And it asks the ship
//     and nothing else: a duel has no crowd to mow (game/waves.js holds the director).
//
//   **The row is a question and not a wall.** Three fans can never cover the whole sky, and the sweep
//     is slower than a ship at the near edge of the band the sun holds and faster than one at the far
//     edge - which is the difference between "turn with them" and "be out of it", and the reason the
//     fan is drawn as a fan.
//
// What is *not* here: what a blade looks like, and what the dark leaves out for it
// (test/arms-art.test.mjs), and the framework's own telegraph floor, which every phase of every boss
// is held to in test/bosses.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import { TAU } from '../src/core/math.js';
import {
  armArc, armCount, armHalf, armProgress, armReach, armStep, bossFlare, bossPhase, bossRiding,
  bossSweeps, bossBlades,
} from '../src/game/bosses.js';
import { looseArm, offTheBlade } from '../src/game/arms.js';
import { damageEnemy } from '../src/game/enemies.js';
import { resetRun } from '../src/game/run.js';
import { scriptedRun, bossOnTheField, enemyAt, stepTheWorld } from '../tools/headless/scripted.js';
import { world } from '../src/game/world.js';

const STEP = BALANCE.sim.step;
const ECLIPSE = BALANCE.bosses.eclipse;
const SWEEP = ECLIPSE.phases[2].sweep;
const DUE = BALANCE.bosses.schedule.findIndex((entry) => entry.boss === 'eclipse');
const SHIP = BALANCE.ships.wisp.maxSpeed;

/** One step of the arena that actually happened (a freeze swallows one: see test/eclipse.test.mjs). */
function realStep() {
  let guard = 0;
  while (!stepTheWorld()) {
    if (++guard > 4000) throw new Error('the arena never came back to life');
  }
}

function steps(seconds) {
  let ran = 0;
  while (ran < seconds - 1e-9) {
    realStep();
    ran += STEP;
  }
}

/** Step until `seen` answers true, and say whether it ever did. */
function until(seen, seconds) {
  let ran = 0;
  while (!seen()) {
    if (ran > seconds) return false;
    realStep();
    ran += STEP;
  }
  return true;
}

function eclipseOnTheField(seed) {
  scriptedRun(seed);
  const boss = bossOnTheField(DUE);
  assert.equal(boss.id, 'eclipse', 'the third entry of the schedule is not the Eclipse any more');
  return boss;
}

/**
 * Put the fight on the mark that opens its last phase, and wait for the flare to finish.
 *
 * The flare is part of the ask: the phase is not being fought until the immunity is spent, and a
 * test that starts counting beats inside it is counting a fight that is holding its breath.
 */
function intoTheBlades(seed) {
  const boss = eclipseOnTheField(seed);
  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[2] * 0.99;
  assert.ok(until(() => bossPhase(boss) === 3 && bossFlare(boss) === 0, 10),
    'the last phase never opened');
  return boss;
}

/** Put the ship somewhere and remember where that was, so the frame does not paint it sliding in. */
function place(field, x, y) {
  const ship = field.player;
  ship.x = x;
  ship.y = y;
  ship.px = x;
  ship.py = y;
  return ship;
}


/** The four numbers of the fan being shown, or null when nothing is being shown. */
function shown(boss) {
  if (armCount(boss) === 0) return null;
  return {
    count: armCount(boss),
    step: armStep(boss),
    arc: armArc(boss),
    reach: armReach(boss),
    half: armHalf(boss),
    angle: boss.cores[0].angle,
    progress: armProgress(boss),
  };
}

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

test('the blades are the last phase only, and everything from before is still there', () => {
  assert.equal(ECLIPSE.phases[0].sweep, undefined, 'the first phase has no arms to show yet');
  assert.equal(ECLIPSE.phases[1].sweep, undefined, 'nor has the second');
  assert.ok(SWEEP !== undefined, 'the third phase of the Eclipse has no arms at all');

  // "and everything from before": the blades are a second beat bolted onto the shell the fight
  // already had, not a replacement for it.
  assert.ok(ECLIPSE.phases[2].bullets !== undefined, 'the blades took the shell away');
  assert.ok(ECLIPSE.phases[2].pull !== undefined, 'and they took the drag away');
  assert.ok(ECLIPSE.phases[2].dark !== undefined, 'and they took the night away');
});

test('three fans can never cover the whole sky, so there is always a place to be', () => {
  // The fairness of a sweep is arithmetic before it is anything else: `arms` blades stand
  // TAU/arms apart and each sweeps `arc`, so the sky they ever enter is `arms * arc` of the turn
  // and the rest of it is never touched. At or over a whole turn the fan would be a wall, and no
  // amount of standing room in the room would make it a question.
  assert.ok(SWEEP.arms >= 2, 'one blade is a bar, not a sweep');
  assert.ok(SWEEP.arms * SWEEP.arc < TAU,
    'the fans cover ' + (SWEEP.arms * SWEEP.arc).toFixed(2) + ' of a turn of ' + TAU);
  assert.ok(SWEEP.arc > 0 && SWEEP.rate > 0, 'a fan has to have a width and a travel');
});

test('the blades reach past where the sun wants the ship, and cannot span the room', () => {
  assert.ok(SWEEP.reach > ECLIPSE.approach.far,
    'a ship standing in the band the sun holds would be outside the blades and safe for nothing');
  assert.ok(SWEEP.reach * 2 < BALANCE.bosses.cage.w,
    'a blade would be longer than the room is wide, and a room with a blade across it is a wall');
  assert.ok(SWEEP.half > BALANCE.player.hitRadius,
    'a blade narrower than the ship is a hair to stand on and not a thing to leave');
});

test('a sweep is slower than a ship close in and quicker than one out at the band', () => {
  // The two halves of one sentence, and the reason the fan is drawn as a fan (game/bosses.js):
  // near the sun the blades can be out-turned, so the ask is to turn with them; out where the sun
  // keeps the ship, the ask is to be out of the fan before it starts. Both are answerable, and
  // neither is the same ask, which is what stops a long fight with the sun being one long dodge.
  assert.ok(SWEEP.rate * ECLIPSE.approach.near < SHIP,
    'even close in a blade outruns the ship: ' + (SWEEP.rate * ECLIPSE.approach.near).toFixed(0));
  assert.ok(SWEEP.rate * ECLIPSE.approach.far > SHIP,
    'even out at the band a ship could simply out-run every blade: '
    + (SWEEP.rate * ECLIPSE.approach.far).toFixed(0));
});

test('the wind-up is long enough to leave a fan in, and the room is not on fire the whole time', () => {
  assert.ok(SWEEP.windup >= BALANCE.bosses.telegraphMin, 'the fan is shown for too little');

  // A sweep is under a second and a shell's wind-up is shorter still, and what the fight is
  // measured by is how much of it is *standing room*: a sweep that lasted longer than the wait
  // between sweeps would be one continuous wall of blades with a shell in it.
  const sweeping = SWEEP.arc / SWEEP.rate;
  assert.ok(sweeping < ECLIPSE.phases[2].wait,
    'a sweep outlasts the ride between sweeps: ' + sweeping.toFixed(2) + 's of turning');
});

// ---------------------------------------------------------------------------
// The promise, and what lands
// ---------------------------------------------------------------------------

test('the blades that come out of a fan are the fan that was shown', () => {
  const field = world;
  const boss = intoTheBlades(701);

  assert.ok(until(() => shown(boss) !== null, 20), 'the fight never showed a fan');
  const promise = shown(boss);
  assert.equal(promise.count, SWEEP.arms);
  assert.equal(promise.arc, SWEEP.arc);
  assert.equal(promise.reach, SWEEP.reach);
  assert.equal(promise.half, SWEEP.half);
  assert.ok(Math.abs(promise.step - TAU / SWEEP.arms) < 1e-9, 'the blades are not evenly spaced');
  assert.equal(promise.progress, 0, 'a fan that has only just lit is already brightening');
  realStep();
  const progress = armProgress(boss);
  assert.ok(progress > 0 && progress < 1,
    'the fan has no countdown for the frame to draw itself by: ' + progress);

  // The body is held still while a beat is being shown, which is the framework's rule for every
  // promise and the only reason the bearing written down here is still true when the blades go.
  assert.equal(bossRiding(boss), false, 'a fan was shown while the fight was riding');
  const turned = boss.cores[0].angle;
  realStep();
  assert.equal(boss.cores[0].angle, turned, 'the fight turned while it was promising a fan');
  assert.ok(shown(boss) !== null, 'the fan went out before its own wind-up was spent');

  assert.ok(until(() => shown(boss) === null, 10), 'the fan never let go');
  assert.equal(field.arms.count, promise.count, 'a different number of blades landed than were shown');
  for (let i = 0; i < field.arms.count; i++) {
    const arm = field.arms.items[i];
    assert.ok(Math.abs(arm.angle - (promise.angle + i * promise.step)) < 1e-9,
      'a blade started somewhere other than the bearing its fan was lit at');
    assert.equal(arm.left, promise.arc, 'a blade was promised a different travel than the fan');
    assert.equal(arm.reach, promise.reach, 'a blade was longer than the fan it came out of');
    assert.equal(arm.half, promise.half, 'a blade was wider than the fan it came out of');
    assert.equal(arm.color, ECLIPSE.phases[2].tint, 'a blade does not wear the phase that loosed it');
    assert.equal(arm.from, 'eclipse', 'a blade does not remember whose fight it is');
  }
});

test('a blade travels the arc it was shown and then stops existing', () => {
  const field = world;
  const boss = intoTheBlades(702);
  assert.ok(until(() => field.arms.count > 0, 20), 'no blades were loosed');

  const arm = field.arms.items[0];
  const from = arm.angle;
  let turned = 0;
  let guard = 0;
  while (field.arms.items.includes(arm)) {
    const before = arm.angle;
    realStep();
    if (field.arms.items.includes(arm)) {
      turned += arm.angle - before;
      assert.ok(arm.left > 0, 'a blade was left standing with no sweep left in it');
    }
    if (++guard > 4000) throw new Error('a blade never stopped sweeping');
  }

  // One step of turning of slack, because the last step of a sweep is the step it is retired on.
  assert.ok(Math.abs(turned - SWEEP.arc) < SWEEP.rate * STEP * 2,
    'it swept ' + turned.toFixed(3) + ' rad and the fan said ' + SWEEP.arc);
  assert.equal(field.arms.count, 0, 'the sweep is over and a blade is still in the room');
  assert.equal(boss.sweeps, boss.blades / SWEEP.arms, 'blades and sweeps do not add up');
});

test('the blades alternate with the shell, and neither one of them hogs the turn', () => {
  const boss = intoTheBlades(703);
  assert.ok(boss.sweeps === 0 && boss.rings === 0, 'the phase opened with a beat already spent');

  // Two of each, in a row that has two beats and takes them in turn (game/bosses.js `beatsOf`).
  assert.ok(until(() => boss.sweeps >= 2 && boss.rings >= 2, 60),
    'a beat stopped coming round: ' + boss.sweeps + ' sweeps, ' + boss.rings + ' shells');
  assert.ok(Math.abs(boss.sweeps - boss.rings) <= 1,
    'the two beats are not taking one another\'s turns: ' + boss.sweeps + ' against ' + boss.rings);
});

test('a fight that never reaches the last phase never lifts an arm', () => {
  const field = world;
  const boss = eclipseOnTheField(704);
  steps(30);
  assert.equal(bossPhase(boss), 1, 'the fight moved out of its first phase on its own');
  assert.equal(boss.sweeps, 0, 'the first phase has no sweep to take');
  assert.equal(field.arms.count, 0);

  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[1] * 0.99;
  assert.ok(until(() => bossPhase(boss) === 2, 10));
  steps(30);
  assert.equal(boss.sweeps, 0, 'the second phase has no sweep either');
  assert.ok(boss.rings > 0, 'the second phase stopped fighting altogether');
});

// ---------------------------------------------------------------------------
// What a blade costs
// ---------------------------------------------------------------------------

/**
 * Park the ship on a live blade, halfway along it.
 *
 * It is put on the axis rather than near an edge on purpose: the drag points at the body the blade
 * is rooted to, which is the blade's own axis, so a ship set down on the line is held on it by the
 * sun's own pull instead of by the test holding it there.
 */
function standOnABlade(field, boss) {
  const arm = field.arms.items[0];
  const body = boss.enemy;
  const r = arm.inner + (arm.reach - arm.inner) / 2;
  const ship = place(field, body.x + arm.dirX * r, body.y + arm.dirY * r);
  ship.invuln = 0;
  return arm;
}

test('a blade standing on the ship costs a hull, and only the one it asked for', () => {
  const field = world;
  const boss = intoTheBlades(705);
  assert.ok(until(() => field.arms.count > 0, 20), 'no blades were loosed');
  const arm = standOnABlade(field, boss);
  const ship = field.player;
  ship.hull = 3;
  assert.ok(offTheBlade(arm, ship.x, ship.y) <= arm.half, 'the ship was not on the blade to begin with');

  realStep();
  assert.equal(ship.hull, 2, 'a blade went across the ship and nothing was paid for it');
  assert.equal(field.tally.hurtBy['arm:eclipse'], 1, 'the hull was not blamed on the arm that took it');

  // A whole second more of standing in it - which is three times the sweep and far longer than a
  // blade is in front of anybody - and the bill is still one hull: the invulnerability is what says
  // a sweep takes a pip and not the fight.
  steps(1);
  assert.equal(ship.hull, 2, 'one sweep took more than it promised: ' + ship.hull + ' hull left');
});

test('a blade hurts at exactly the width it is drawn at', () => {
  const field = world;
  const boss = intoTheBlades(706);
  assert.ok(until(() => field.arms.count > 0, 20), 'no blades were loosed');
  const arm = field.arms.items[0];
  const body = boss.enemy;
  const ship = place(field, body.x, body.y);
  ship.invuln = 0;
  ship.hull = 3;
  field.enemyShots.clear();      // the ship is about to stand still; a shell is not what is on trial

  // Three ships that are not in the blade: outside the tip, inside the rim it starts from, and a
  // pixel off its side. The first two are geometry only - a ship parked at the middle of a dark sun
  // is a ship that hurts on contact, and that is a different promise being tested.
  const along = (r) => ({ x: body.x + arm.dirX * r, y: body.y + arm.dirY * r });
  for (const at of [along(arm.reach + 40), along(arm.inner / 2)]) {
    assert.ok(offTheBlade(arm, at.x, at.y) > arm.half,
      'the blade reached ' + offTheBlade(arm, at.x, at.y).toFixed(1) + ' px further than its own fan');
  }

  // The edge itself: a centre `half` px off the axis is in the blade and half a pixel further out is
  // not, because there is one number for the width it is drawn at and the width it hurts at
  // (game/arms.js). Floating point is why these are inequalities and not an exact equality.
  const across = (px) => ({
    x: along(300).x + arm.dirY * px,
    y: along(300).y - arm.dirX * px,
  });
  // `hair` is the rounding of the trig above and nothing else: the two points asked for are exactly
  // `half` and exactly `half + 0.5` px off the axis, and getting there is a multiply by a sine - a
  // centre asked for at exactly `half` comes back at `half + 7e-14` on the sweep this ships. It is
  // written down rather than tuned in silence because a knife-edge test that fails on fourteen powers
  // of nothing is a test the next session deletes instead of reading.
  const hair = 1e-9;
  assert.ok(offTheBlade(arm, across(arm.half).x, across(arm.half).y) <= arm.half + hair,
    'a centre exactly on the edge of the blade was not measured as being in it');
  assert.ok(offTheBlade(arm, across(arm.half + 0.5).x, across(arm.half + 0.5).y) > arm.half + hair,
    'a centre half a pixel outside the blade was measured as being inside it');

  // Stood in, with a clear margin either side of that edge: a blade turns a little between the moment
  // a ship is put beside it and the moment the blade pays out, and at 300 px out one step of the sweep
  // is worth about two pixels of sideways. The edge itself is pinned above, where there is no motion
  // to allow for.
  const clear = standBeside(field, arm.half + 8);
  assert.notEqual(clear, null, 'none of this sweep had room beside it inside the room');
  assert.equal(clear, false, 'a blade took a hull off a ship standing clear of it');
  const inside = standBeside(field, arm.half - 8);
  assert.notEqual(inside, null, 'none of this sweep had room beside it inside the room');
  assert.equal(inside, true,
    'a blade went across a ship standing inside it and nothing was paid for it');
});

/**
 * Ride the ship alongside a live blade, `across` px off its axis, for as long as that blade lasts, and
 * answer whether it ever cost a hull the tally blamed on the arm: `true`, `false`, or `null` when no
 * blade of this sweep had room beside it.
 *
 * The ship is put back before every step rather than once - the pivot walks, the blade turns, and a
 * ship left where it was put is measuring the room and not the width of a blade - and the room has the
 * final say: the Eclipse parks against whatever wall it chose (game/bosses.js `stationOf`), so some
 * blades of a sweep run into the wall, and no ship can stand inside a wall to be measured. Outward
 * first, then in towards the sun, and the first blade and radius with room wins.
 */
function standBeside(field, across) {
  const before = field.tally.hurtBy['arm:eclipse'] || 0;
  const ship = field.player;
  let rode = null;
  let steps = 0;
  // Wait for the next sweep to be loosed: this is called from a quiet moment as often as from a live
  // one, and there is nothing beside which to stand until a blade exists.
  let waiting = 0;
  while (field.arms.count === 0 && waiting++ < 2000) {
    field.enemyShots.clear();
    realStep();
  }
  while (field.arms.count > 0 && steps++ < 2000) {
    field.enemyShots.clear();          // a shell is not what is on trial here
    const spot = somewhereBeside(field, across);
    if (spot !== null) {
      rode = spot.arm;
      place(field, spot.x, spot.y);
    }
    ship.hull = 99;
    ship.invuln = 0;
    realStep();
    if ((field.tally.hurtBy['arm:eclipse'] || 0) > before) return true;
  }
  assert.ok(rode !== null, 'none of this sweep had room beside it inside the room');
  return false;
}

/**
 * A live blade with room for a ship `across` px beside it, and where to stand: the outermost reach
 * tried first, because a ship beside a blade's tip is a ship beside the whole of it.
 */
function somewhereBeside(field, across) {
  const box = field.field;              // the live box: the cage this duel is being fought in
  const margin = field.player.drawR + 1;
  for (const arm of field.arms.items) {
    // Stand where the blade will be when it pays out, not where it is: game/world.js turns the arms
    // before it hands the harm out, so a ship parked on the bearing a blade holds now is already a
    // couple of pixels out of true by the time that blade asks about it.
    const at = arm.angle + arm.spin * BALANCE.sim.step;
    const ux = Math.cos(at);
    const uy = Math.sin(at);
    for (const along of [300, 260, 220, 180, 140, 100]) {
      if (along < arm.inner + 8 || along > arm.reach - 8) continue;
      const x = arm.x + ux * along + uy * across;
      const y = arm.y + uy * along - ux * across;
      if (x > box.x0 + margin && x < box.x1 - margin
        && y > box.y0 + margin && y < box.y1 - margin) {
        return { arm: arm, x: x, y: y, along: along };
      }
    }
  }
  return null;
}

test('a blade is the fight\'s own hand and hurts nothing else in the room', () => {
  const field = world;
  const boss = intoTheBlades(707);
  assert.ok(until(() => field.arms.count > 0, 20), 'no blades were loosed');
  const arm = field.arms.items[0];
  const body = boss.enemy;

  // A body standing dead on the axis, which is the one thing a beam would burn and a blade does not
  // (game/arms.js: the crowd is not what a boss's arm is for).
  const foe = enemyAt('drifter', body.x + arm.dirX * 300, body.y + arm.dirY * 300);
  const before = foe.hp;
  steps(0.5);
  assert.ok(foe.hp >= before, 'a blade chewed through a body of the crowd');
});

test('a blade follows the body it came out of, and sweeps on when that body is gone', () => {
  const field = world;
  const boss = intoTheBlades(708);
  assert.ok(until(() => field.arms.count > 0, 20), 'no blades were loosed');
  const arm = field.arms.items[0];
  const body = boss.enemy;

  // Rooted while the body stands: the pivot is the body's own place and nothing else's.
  const before = { x: arm.x, y: arm.y };
  body.x += 70;
  realStep();
  assert.equal(arm.px, before.x, 'the pivot moved without writing where it was first');
  assert.equal(arm.x, body.x, 'a blade let go of the body it was loosed out of');

  // And loose once more, in spirit: the fight coming down mid-sweep leaves the last sweep of its
  // life to finish, rather than snapping the blades off a corpse (game/bosses.js `dismissCall`,
  // same rule for everything a fight lets go of).
  const left = arm.left;
  damageEnemy(field, body, body.maxhp * 10, true);
  realStep();
  assert.ok(field.arms.items.includes(arm), 'the blades went with the fight that loosed them');
  assert.equal(arm.x, body.x, 'a blade moved with a body that had stopped existing');
  realStep();
  assert.ok(arm.left < left, 'a blade stopped turning when its fight came down');
});

test('a blade is painted where it will be, not only where it was', () => {
  const field = world;
  const boss = intoTheBlades(709);
  assert.ok(until(() => field.arms.count > 0, 20), 'no blades were loosed');
  const arm = field.arms.items[0];

  realStep();
  assert.notEqual(arm.pangle, arm.angle, 'a blade turned without writing where it turned from');
  assert.ok(arm.pangle < arm.angle, 'the sweep went backwards from its own last step');
});

test('a restart puts every blade back in the drawer', () => {
  const field = world;
  const boss = intoTheBlades(710);
  assert.ok(until(() => field.arms.count > 0, 20), 'no blades were loosed');
  assert.ok(field.arms.count > 0);

  resetRun(field);
  assert.equal(field.arms.count, 0, 'a blade outlived the run that loosed it');
});

test('a blade loosed on a body that cannot turn has no excuse to live for ever', () => {
  // The one way this system could run away: an arm with no turn in it would never spend its arc and
  // would sit in the arena hurting the ship for the rest of the run. The row cannot write one
  // (`rate` is the sweep) and this is what says so out loud instead of leaving a permanent hazard
  // for a typo to find.
  const field = world;
  scriptedRun(777);
  const body = enemyAt('drifter', 400, 400);
  assert.throws(() => looseArm(field, body, 0, { rate: 0, arc: 1, reach: 100, half: 10 }, '#fff'),
    /does not turn/);
});
