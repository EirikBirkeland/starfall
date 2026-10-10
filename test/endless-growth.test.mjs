// The second clock (PLAN 3.4: "Endless mode then continues with all values scaling for as long as
// the player lasts").
//
// test/endless.test.mjs owns the hand-back - the run being handed its arena back. This owns what it
// is handed: the four things that keep growing after every ceiling in `BALANCE` has been spent, and
// the two walls that say when one of them has to stop.
//
// Everything here is measured on a parked world, wound forward to a chosen minute of endless, and
// every expectation is written out of the balance table rather than copied from the code - otherwise
// the test would be the same sentence twice. The three claims that hold it up:
//
//   **A run that has not won is untouched.** Every growth is exactly 0, and a body built by a normal
//     run is made of exactly what it always was. That is why the reference run's trace does not move.
//   **The seam is smooth.** On the step of the hand-back the growth is nothing, so a run is not
//     punished for winning: the crowd it is standing in is the crowd it already beat.
//   **The two walls are walls.** Speed and the count of bodies stop; the hull and the crowd budget
//     do not, and that is what ends an endless run (game/endless.js argues the whole case).
import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import {
  bodyGrowth, crowdGrowth, endlessMinutes, endlessTime, hullGrowth, speedGrowth,
} from '../src/game/endless.js';
import { crowdBudget, bodyCeiling } from '../src/game/waves.js';
import { makeEnemy, KINDS } from '../src/game/kinds.js';
import { shipBody, defaultShip } from '../src/game/ships.js';
import { growthCurve } from '../tools/endless-gauge.js';
import { scriptedRun, stepTheWorld } from '../tools/headless/scripted.js';

const G = BALANCE.endless.growth;
const E = BALANCE.enemies;
const W = BALANCE.waves;
const MINUTE = 60;

/**
 * A world that has been handed its arena back, wound to `minutes` of endless.
 *
 * The run's own clock is parked where the last fight was due, so the schedule's own scaling is
 * already spent by the time any of these grow things start - which is the whole situation this clock
 * exists for, and the reason the arithmetic below can treat it as a constant.
 */
function afterHandback(minutes) {
  const field = scriptedRun(5);
  const from = BALANCE.bosses.schedule[BALANCE.bosses.schedule.length - 1].at;
  field.endless = true;
  field.endlessAt = from;
  field.elapsed = from + minutes * MINUTE;
  return field;
}

/** What the schedule's own clocks have already bought a body, at a parked run clock. */
function scheduleHullScale(field) {
  return 1 + Math.min(field.elapsed / E.hpScaleWindow, E.hpScaleMax);
}

function scheduleSpeedScale(field) {
  return 1 + Math.min(field.elapsed / E.speedScaleWindow, 1) * E.speedScaleMax;
}

/** The fastest body the wave director can field - the one the speed wall is about. */
function swiftest() {
  let best = null;
  for (const name of Object.keys(KINDS)) {
    if (best === null || KINDS[name].stats.speed > KINDS[best].stats.speed) best = name;
  }
  return best;
}

// ---------------------------------------------------------------------------
// A run that has not been handed back grows by nothing
// ---------------------------------------------------------------------------

test('a run that has not won is not on the second clock at all', () => {
  const field = scriptedRun(1);
  field.elapsed = 1200;     // past every window in the table, so the schedule's own growth is spent

  assert.equal(endlessTime(field), 0);
  assert.equal(endlessMinutes(field), 0);
  assert.equal(hullGrowth(field), 0, 'no hull');
  assert.equal(speedGrowth(field), 0, 'no speed');
  assert.equal(crowdGrowth(field), 0, 'no crowd');
  assert.equal(bodyGrowth(field), 0, 'and no more bodies');

  assert.equal(crowdBudget(field), W.crowdMax, 'the budget stops at the schedule\u2019s own ceiling');
  assert.equal(bodyCeiling(field), W.maxBodies, 'and so does the count of bodies');

  const body = makeEnemy(field, 'weaver', 200, 200, null);
  assert.equal(body.hp, Math.ceil(KINDS.weaver.stats.hull * scheduleHullScale(field)),
    'a body is exactly what the run\u2019s own clock says it is');
  assert.equal(body.speed, KINDS.weaver.stats.speed * scheduleSpeedScale(field),
    'and no faster');
});

test('the hand-back is a seam and not a jump', () => {
  const handed = afterHandback(0);
  const plain = scriptedRun(1);
  plain.elapsed = handed.elapsed;

  assert.equal(endlessTime(handed), 0, 'the second clock reads nothing on the step it starts on');
  assert.equal(hullGrowth(handed), 0);
  assert.equal(speedGrowth(handed), 0);
  assert.equal(crowdBudget(handed), crowdBudget(plain), 'the same crowd is still the same crowd');
  assert.equal(bodyCeiling(handed), bodyCeiling(plain), 'standing in the same number of bodies');

  const a = makeEnemy(handed, 'weaver', 200, 200, null);
  const b = makeEnemy(plain, 'weaver', 200, 200, null);
  assert.equal(a.hp, b.hp, 'and a body on that step is no tougher than one a moment earlier');
  assert.equal(a.speed, b.speed, 'and no faster');
});

// ---------------------------------------------------------------------------
// What grows, and what stops
// ---------------------------------------------------------------------------

test('the hull keeps growing, with no ceiling on it', () => {
  for (const minutes of [1, 5, 12, 40]) {
    const field = afterHandback(minutes);
    const want = scheduleHullScale(field) + minutes * G.hullPerMinute;
    assert.ok(Math.abs(hullGrowth(field) - minutes * G.hullPerMinute) < 1e-9,
      '+' + minutes + 'm of hull is ' + minutes + ' times the rate');
    const body = makeEnemy(field, 'weaver', 200, 200, null);
    assert.equal(body.hp, Math.ceil(KINDS.weaver.stats.hull * want),
      'and a body is built out of it at +' + minutes + 'm');
  }

  let last = -1;   // nothing at all is what the growth is at +0m, and the seam test says so properly
  for (const minutes of [0, 1, 2, 4, 8, 16, 32, 64]) {
    const grown = hullGrowth(afterHandback(minutes));
    assert.ok(grown > last, 'it never stops growing (+ ' + minutes + 'm)');
    last = grown;
  }
});

test('the speed grows up to one wall shared with the schedule, and stops there', () => {
  assert.ok(E.speedScaleCeil > scheduleSpeedScale(afterHandback(0)),
    'the wall cannot eat the growth the schedule does on its own');

  const early = afterHandback(1);
  const body = makeEnemy(early, 'weaver', 200, 200, null);
  const want = Math.min(scheduleSpeedScale(early) + G.speedPerMinute, E.speedScaleCeil);
  assert.equal(body.speed, KINDS.weaver.stats.speed * want, 'one minute of endless buys one minute of speed');

  // And then it stops, and stays stopped: the ceiling is on the whole multiplier and not on the
  // endless share of it, so the two clocks cannot add up past it between them.
  const late = afterHandback(600);
  assert.equal(makeEnemy(late, 'weaver', 200, 200, null).speed, KINDS.weaver.stats.speed * E.speedScaleCeil,
    'ten hours of endless is the same speed as the minute the wall was reached');

  // The wall has to mean something next to the ship. The fastest body in the game is allowed to be
  // quicker than the ship - that is what a swarmling is - but not by this much more.
  const swift = swiftest();
  const atTheWall = KINDS[swift].stats.speed * E.speedScaleCeil;
  const ship = shipBody(defaultShip()).maxSpeed;
  assert.ok(atTheWall < ship * 1.2,
    swift + ' at the wall is ' + Math.round(atTheWall) + ' px/s against a ship of ' + ship);
});

test('the crowd budget grows past the schedule\u2019s ceiling and never comes back to it', () => {
  assert.equal(crowdBudget(afterHandback(0)), W.crowdMax, 'it starts exactly where the schedule left off');
  let last = 0;
  for (const minutes of [0, 1, 3, 9, 30]) {
    const field = afterHandback(minutes);
    assert.ok(Math.abs(crowdBudget(field) - (W.crowdMax + minutes * G.crowdPerMinute)) < 1e-9,
      '+ ' + minutes + 'm of crowd');
    assert.ok(crowdBudget(field) >= last, 'and it only ever grows');
    last = crowdBudget(field);
  }
});

test('the ceiling on standing bodies lifts with the budget, up to its own wall', () => {
  assert.equal(bodyCeiling(afterHandback(0)), W.maxBodies, 'it starts where the frame budget was set');
  for (const minutes of [1, 4]) {
    const field = afterHandback(minutes);
    assert.equal(bodyCeiling(field), W.maxBodies + Math.floor(minutes * G.bodiesPerMinute),
      '+' + minutes + 'm of bodies');
  }
  for (const minutes of [30, 300]) {
    assert.equal(bodyCeiling(afterHandback(minutes)), G.bodiesCeil,
      'and it stops at the wall the frame was measured against, at +' + minutes + 'm');
  }
  assert.ok(G.bodiesCeil > W.maxBodies, 'the wall has to be above where the schedule stops');
  assert.ok(G.bodiesCeil <= 600, 'and inside what PLAN section 2 says the game is built for');
});

test('the director really does field more bodies than the schedule was allowed to', () => {
  const field = afterHandback(6);
  assert.ok(bodyCeiling(field) > W.maxBodies, 'the test needs a wall that has actually lifted');

  // No guns and no boss: what is being counted is what arrives and stands, and nothing else. The
  // wall is re-asked every 30 steps because the clock is moving underneath it - the ceiling the
  // crowd is allowed to fill to is the one of the moment it is filling in, and never more.
  field.spawnTimer = 0;
  field.player.invuln = Infinity;
  let over = 0;
  for (let i = 0; i < 120 * 90; i++) {
    stepTheWorld({ firing: false });
    if (i % 30 === 0 && field.enemies.length > bodyCeiling(field)) over++;
  }

  assert.equal(over, 0, 'the wall held at every step it was asked about');
  assert.ok(field.enemies.length > W.maxBodies,
    'the crowd stopped at ' + field.enemies.length + ', which is the old wall and not the new one');
  assert.ok(field.enemies.length <= bodyCeiling(field),
    'and at or under the new one (' + field.enemies.length + ' of ' + bodyCeiling(field) + ')');
});

// ---------------------------------------------------------------------------
// The instrument that prints this curve
// ---------------------------------------------------------------------------

test('the gauge prints the curve the code plays', () => {
  const rows = growthCurve({ minutes: 6 });
  assert.equal(rows.length, 7, 'one row per minute, the hand-back included');
  assert.equal(rows[0].minute, 0);

  let lastHull = 0;
  let lastBodies = 0;
  for (const row of rows) {
    assert.ok(row.hullMul > lastHull, 'tougher every minute (+' + row.minute + 'm)');
    assert.ok(row.speedMul <= E.speedScaleCeil + 1e-9, 'never past the speed wall');
    assert.ok(row.bodies <= G.bodiesCeil, 'never past the body wall');
    assert.ok(row.bodies >= lastBodies, 'and never fewer bodies than the minute before');
    assert.equal(row.budget, crowdBudget(afterHandback(row.minute)), 'the budget is the director\u2019s own');
    lastHull = row.hullMul;
    lastBodies = row.bodies;
  }
});
