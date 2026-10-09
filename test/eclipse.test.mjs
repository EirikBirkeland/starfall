// The Eclipse (PLAN 3.4's 15:00): a dark sun. Two things are new about it and they are the whole
// of what this file owns.
//
// The first is that it drags the ship, which is a thing nothing else in the game does and so a
// permission the framework had to be given (game/bosses.js `holdTheShip`, game/player.js
// `dragShip`). The claims here are about what kind of thing that pull is: a *place* the ship is
// moved to and not a force on its engines, the phase's own pace rather than a share of the ship's,
// a pull that stops at the rim of the body that hurts you rather than one that feeds you into it,
// and one that does not stop just because a promise is being shown - because it is not a promise,
// it is the sun being there.
//
// The second is that its one beat is a shell and nothing else, which is the first time a phase has
// had exactly one beat and no spokes at all: a rhythm that alternates has to be able to say that a
// beat a row never wrote is not taken, or the Eclipse would spend half of every turn standing still
// with a telegraph on it for a volley that never comes.
//
// What the shells themselves promise - a door opened on the ship's own bearing and then held - is
// the Warden's rule, owned by test/warden.test.mjs and by the framework's telegraph floor. What is
// tested here is that a fight which pulls can still keep it, which it can because the drag points at
// the body and so can only ever carry the ship *down* a door, never out of one.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import { TAU } from '../src/core/math.js';
import {
  armedCount, bossFlare, bossName, bossPhase, bossRiding, bossShape, gapAngle, gapHalf,
} from '../src/game/bosses.js';
import { damageEnemy } from '../src/game/enemies.js';
import { scriptedRun, stepTheWorld, bossOnTheField } from '../tools/headless/scripted.js';

const STEP = BALANCE.sim.step;
const ECLIPSE = BALANCE.bosses.eclipse;
const PULL = ECLIPSE.phases[0].pull;

/** Which entry of the schedule the third boss is. */
const DUE = 2;

/** The mark it is due at. */
const AT = BALANCE.bosses.schedule[DUE].at;

function steps(seconds) {
  let ran = 0;
  let guard = 0;
  while (ran < seconds - 1e-9) {
    if (stepTheWorld()) ran += STEP;
    guard++;
    if (guard > 20000) throw new Error('the arena never came back to life');
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

function eclipseOnTheField() {
  const boss = bossOnTheField(DUE);
  assert.equal(boss.id, 'eclipse', 'the third entry of the schedule is not the Eclipse any more');
  return boss;
}

/** How far the ship's middle stands from the body that is pulling it. */
function gap(field, boss) {
  const body = boss.enemy;
  return Math.hypot(field.player.x - body.x, field.player.y - body.y);
}

/** The bearing from a body to the ship. */
function bearing(field, boss) {
  return Math.atan2(field.player.y - boss.enemy.y, field.player.x - boss.enemy.x);
}

/** The shortest signed distance between two bearings, in radians. */
function off(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

/**
 * Put the ship somewhere and remember where that was, so the frame does not paint it sliding in and
 * the next measurement starts from the place the test asked for.
 */
function place(field, x, y) {
  const ship = field.player;
  ship.x = x;
  ship.y = y;
  ship.px = x;
  ship.py = y;
  return ship;
}

/**
 * Stand the sun `distance` px east of the ship, and the ship in the middle of the room the fight is
 * being held in: the way it falls is then west, away from the wall it was standing beside and into
 * the room, and neither of them is anywhere near a wall for the test to mistake a clamp for a drag.
 * Answers how far apart they really ended up, which is the cage's answer and not this one.
 */
function standBesideTheSun(field, boss, distance) {
  const ship = place(field, (field.field.x0 + field.field.x1) / 2,
    (field.field.y0 + field.field.y1) / 2);
  const body = boss.enemy;
  body.x = ship.x + distance;
  body.y = ship.y;
  body.px = body.x;
  body.py = body.y;
  return gap(field, boss);
}

/**
 * One step of the arena that actually happened.
 *
 * A freeze (game/effects.js `hitStop`) swallows a step and moves nobody, and a boss's own arrival
 * costs seven of them - so anything that measures a single step has to wait one out first, or it is
 * measuring a world that is holding its breath.
 */
function realStep() {
  let guard = 0;
  while (!stepTheWorld()) {
    if (++guard > 4000) throw new Error('the arena never came back to life');
  }
}

/** One step, and how far the ship itself moved in it - whatever it was that moved it. */
function shipMoved(field) {
  const ship = field.player;
  const before = { x: ship.x, y: ship.y };
  realStep();
  return Math.hypot(ship.x - before.x, ship.y - before.y);
}

/** Do to the sun what everything else does to a body that is about to stop existing. */
function fell(field, boss) {
  damageEnemy(field, boss.enemy, boss.enemy.maxhp * 10, true);
}

// ---------------------------------------------------------------------------
// The schedule, and the shape of the row
// ---------------------------------------------------------------------------

test('the eclipse is the third fight, and it is due at PLAN fifteen minutes', () => {
  const schedule = BALANCE.bosses.schedule;
  assert.equal(schedule[DUE].boss, 'eclipse');
  assert.equal(AT, 900, 'the last fight of a run is due at fifteen minutes');
  assert.ok(AT > schedule[DUE - 1].at, 'two bosses are due at the same minute');

  const field = scriptedRun(300);
  const boss = eclipseOnTheField();
  assert.equal(bossName(boss), 'THE ECLIPSE');
  assert.equal(bossShape(boss), 'sun', 'it is the third rhythm: it turns *and* walks');
});

test('every phase drags, and drags harder than the one before it', () => {
  assert.equal(ECLIPSE.phases.length, BALANCE.bosses.atHull.length);

  let force = 0;
  for (const phase of ECLIPSE.phases) {
    assert.ok(phase.pull !== undefined, 'a phase of the Eclipse with no drag is not the Eclipse');
    assert.ok(phase.pull.force > force, 'the last phase is the one that hurts most');
    assert.ok(phase.pull.floor > ECLIPSE.radius, 'it lets go before the ship is inside the sun');
    force = phase.pull.force;
  }

  // Priced against the ship the game ships with: the first phase is a tide you can walk out of at
  // half speed and the last is more than half of everything the Wisp has, so the answer to the end
  // of the fight is a dash and a bearing and not a straight line away (game/balance.js `eclipse`).
  const ship = BALANCE.ships.wisp.maxSpeed;
  assert.ok(ECLIPSE.phases[0].pull.force < ship * 0.6, 'the first phase should be a tide');
  assert.ok(ECLIPSE.phases[2].pull.force < ship, 'even the last phase can be out-swum, slowly');
});

test('no phase of it has spokes, which is what makes its one beat the whole of its rhythm', () => {
  for (const phase of ECLIPSE.phases) {
    assert.equal(phase.spokes, undefined, 'a sun has no hoop to draw rays across');
    assert.ok(phase.bullets !== undefined, 'and it has to have something to do with its turn');
  }
});

// ---------------------------------------------------------------------------
// The drag
// ---------------------------------------------------------------------------

test('a ship that does nothing falls towards the sun at the pace its phase says', () => {
  const field = scriptedRun(301);
  const boss = eclipseOnTheField();
  const at = standBesideTheSun(field, boss, ECLIPSE.approach.far - 20);

  // A second of falling. It starts inside the band the sun holds, and stays there, so the sun has
  // no reason to move of its own accord and all of the closing is the ship's - which is what makes
  // this number the drag's and not the sum of two walks.
  steps(1);
  const fell = at - gap(field, boss);
  const want = PULL.force;
  assert.ok(Math.abs(fell - want) < 4,
    'it fell ' + fell.toFixed(1) + ' px in a second, and the row says ' + want);
});

test('the drag is spent on the ship\'s place and never on its engines', () => {
  const field = scriptedRun(302);
  const boss = eclipseOnTheField();
  standBesideTheSun(field, boss, ECLIPSE.approach.far - 20);
  const ship = field.player;
  const before = { x: ship.x, y: ship.y };

  realStep();

  // The whole of the reason it is a place and not a force: the engines are untouched - a force
  // written into `vx` would be steered away before the player had felt it, and a sun does not ask
  // the engines' permission - and yet the ship is one step further along the line to the sun than
  // it was, by exactly as much as the phase says and not one pixel more.
  assert.equal(ship.vx, 0, 'the drag leaned on the ship\'s velocity');
  assert.equal(ship.vy, 0);
  const moved = Math.hypot(ship.x - before.x, ship.y - before.y);
  assert.ok(Math.abs(moved - PULL.force * STEP) < 1e-6,
    'it moved ' + moved + ' px in a step, and the row says ' + PULL.force * STEP);
  // Straight at the sun, and there is nothing else it could be: the ship is west of it.
  assert.ok(Math.abs(ship.y - before.y) < 1e-9, 'the drag went somewhere other than at the body');
  assert.ok(ship.x > before.x);
});

test('it drags the same while it is showing a promise as while it is riding', () => {
  const field = scriptedRun(303);
  const boss = eclipseOnTheField();

  // A ride step.
  until(() => bossRiding(boss), 10);
  standBesideTheSun(field, boss, ECLIPSE.approach.far - 20);
  const riding = shipMoved(field);
  assert.ok(bossRiding(boss), 'the beat came round on the very step it was measured on');

  // A promise step: park again, because the ship has fallen since, and wait for the shell to be lit.
  until(() => !bossRiding(boss), 10);
  standBesideTheSun(field, boss, ECLIPSE.approach.far - 20);
  const shown = shipMoved(field);

  assert.ok(Math.abs(riding - PULL.force * STEP) < 1e-6);
  assert.ok(Math.abs(shown - PULL.force * STEP) < 1e-6,
    'it let go while it was promising: ' + shown + ' px against ' + PULL.force * STEP);
});

test('it stops at the rim, and never walks the ship into the body that hurts it', () => {
  const field = scriptedRun(304);
  const boss = eclipseOnTheField();
  standBesideTheSun(field, boss, PULL.floor + 40);

  // A minute and a half of being dragged at it. What is being claimed is not that the ship stops -
  // the sun is walking off towards the band it holds the whole time, and the ship is faster than it
  // is - but that the ship is *held* at the rim and never carried through it: the closest it ever
  // got is one step of the fall inside the rim and no more than that.
  let least = Infinity;
  let dragged = 0;
  for (let i = 0; i < 180; i++) {
    if (shipMoved(field) > 0) dragged++;
    least = Math.min(least, gap(field, boss));
  }
  assert.ok(dragged > 20, 'nothing was ever dragged, so the rim was never tested');
  assert.ok(least <= PULL.floor + 2, 'it was never held at the rim: closest was ' + least.toFixed(2));
  assert.ok(least > PULL.floor - STEP * PULL.force - 1e-6,
    'it dragged the ship ' + (PULL.floor - least).toFixed(2) + ' px past its own rim');

  // And the ship standing inside the rim is not dragged at all, on a step of its own: park it past
  // the rim and the whole step is nothing.
  standBesideTheSun(field, boss, PULL.floor - 6);
  assert.equal(shipMoved(field), 0, 'it pulled with the ship inside the rim');
});

test('the shell opens its door on the ship, holds it, and the drag cannot walk you out of it', () => {
  const field = scriptedRun(305);
  const boss = eclipseOnTheField();
  standBesideTheSun(field, boss, ECLIPSE.approach.far - 20);

  assert.ok(until(() => armedCount(boss) > 0, 20), 'it never threw a shell');
  const shown = gapAngle(boss);
  const half = gapHalf(boss);
  assert.ok(Math.abs(off(shown, bearing(field, boss))) < 1e-9,
    'the door was not opened on the ship\'s own bearing');

  // Now let the promise run out, being dragged all the way: the ship falls straight down the door's
  // bearing, which is the whole of the fairness of a fight that pulls, and it is worth writing down
  // as a number because a drag with any sideways in it would break it.
  assert.ok(until(() => armedCount(boss) === 0, 10), 'the shell never landed');
  assert.equal(gapAngle(boss), shown, 'the door moved between being shown and being fired');
  assert.ok(Math.abs(off(bearing(field, boss), shown)) <= half + 1e-9,
    'the drag walked the ship out of the door it was shown');
});

test('it never takes a beat its row did not write', () => {
  const field = scriptedRun(306);
  const boss = eclipseOnTheField();

  // Twenty seconds of the first phase: several turns of the ride, several shells. Not one of them
  // is a lock, and not one ray is drawn or fired, because this row has no spokes in it at all
  // (game/bosses.js `alternateBeats`).
  steps(20);
  assert.ok(boss.shots > 0, 'it threw no shells in twenty seconds');
  assert.ok(boss.rings > 1, 'that should have been several turns and not one');
  assert.equal(boss.volleys, 0, 'it took a spokes beat it never wrote');
  assert.equal(boss.beams, 0);
  assert.equal(boss.calls, 0);
  assert.equal(boss.summons, 0);
});

test('a phase flare is the sun letting go', () => {
  const field = scriptedRun(307);
  const boss = eclipseOnTheField();
  standBesideTheSun(field, boss, ECLIPSE.approach.far - 20);

  // Put it on the mark and stop halfway through the flare: the fight has agreed to stop doing
  // anything at all for the length of it, and that includes pulling (game/bosses.js `updateBosses`
  // gives the flare the step back, which is where the drag is spent).
  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[1] * 0.99;
  steps(BALANCE.bosses.phaseBreak.time * 0.5);
  assert.equal(bossPhase(boss), 2, 'the flare did not land where it was asked to');
  assert.ok(bossFlare(boss) > 0, 'the flare was over before it was measured');
  standBesideTheSun(field, boss, ECLIPSE.approach.far - 20);
  assert.equal(shipMoved(field), 0, 'it dragged the ship through its own phase flare');
});

test('the sun lets go when the fight is down', () => {
  const field = scriptedRun(308);
  const boss = eclipseOnTheField();
  standBesideTheSun(field, boss, PULL.floor + 60);
  assert.ok(shipMoved(field) > 0, 'it was not dragging to begin with');

  fell(field, boss);
  steps(0.5);
  assert.equal(field.boss, null, 'the fight is still on the field');

  let moved = 0;
  for (let i = 0; i < 60; i++) moved += shipMoved(field);
  assert.equal(moved, 0, 'a dead sun is still pulling');
});
