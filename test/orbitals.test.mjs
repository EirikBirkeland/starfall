// Orbitals (PLAN 3.2, taken as an upgrade line): drones that circle the ship and damage
// on touch.
//
// A drone has no position of its own - it is a place on a circle round the ship, and the
// circle is one number - so most of what could go wrong here is geometry rather than
// bookkeeping, and that is what this file checks:
//
//   how many drones a rank puts on the ring, that they are evenly spaced, and that the ring
//     re-forms without a jump when a rank is taken mid-run;
//   that the ring turns at the line's spin and rides with the ship wherever it goes;
//   that a bite is a *rate*: the whole ring is worth a known number of shots a second and
//     no more, however many bodies are standing in it - which is what makes the line
//     possible to price against the damage line at all;
//   that the reach is a wall (a body the ring cannot touch takes nothing) and that the
//     middle of the ring is a dead zone, which is the decision that makes this a ring and
//     not an aura;
//   and that a bite is the ship's own damage in every way that matters: it pays out, it is
//     soaked by a shielder's field, and it throws the crowd away from the ship.
//
// The scripted world's ship sits in the middle of the arena pointing straight up and does
// not move unless a test drives it, so a body planted below the ship is one no shot can
// ever reach, and a body planted on the ring's own radius sits exactly where a drone
// passes. Bodies with `hp: 0.2` die to any touch at all, which is what makes a count of
// bodies killed mean a count of bodies touched (NOTES session 30's fractional-damage trap).

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { TAU } from '../src/core/math.js';
import { countOf, dronesOf, effectOf, gainOf } from '../src/game/upgrades.js';
import { guardOf } from '../src/game/shields.js';
import { resetRun } from '../src/game/run.js';
import { scriptedRun, enemyAt, stepTheWorld } from '../tools/headless/scripted.js';

const RING = BALANCE.upgrades.orbitals;
const GUN = BALANCE.bullets;
const RANKS = RING.ranks;
const STEP = BALANCE.sim.step;
const IMMORTAL = 1e9;
/** What one bite is worth on a plain gun: a shot, at the drone's own weight. */
const BITE = GUN.damage * RING.weight;

/** The two angles' difference, folded into (-PI, PI]. */
function turnBetween(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

/** How far a point stands from the ship's middle - which is what "on the ring" means. */
function fromShip(field, x, y) {
  return Math.hypot(x - field.player.x, y - field.player.y);
}

/** Remember what every body in the list is worth now, so a test can ask what it lost. */
function marked(bodies) {
  for (const body of bodies) body.hpBefore = body.hp;
  return bodies;
}

/** How much hull the marked bodies have lost. */
function hullGone(bodies) {
  return bodies.reduce((sum, body) => sum + (body.hpBefore - body.hp), 0);
}

/** `count` bodies standing on the ring itself, evenly spaced, `hp` apiece. */
function onRing(field, count, hp, kind, radius) {
  const ship = field.player;
  const bodies = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    bodies.push(enemyAt(kind || 'drifter',
      ship.x + Math.cos(a) * (radius === undefined ? RING.radius : radius),
      ship.y + Math.sin(a) * (radius === undefined ? RING.radius : radius), hp));
  }
  return bodies;
}

/** Step the world for `seconds`, sweeping the shards so a crowd cannot buy a level. */
function runFor(field, seconds, firing) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    // A level-up would stop the arena and the test would measure the pause, not the ring.
    field.shards.clear();
    field.xp = 0;
    stepTheWorld({ firing: firing === undefined ? false : firing });
  }
}

/** What the ring would be worth over `seconds` if it never ran out of something to bite. */
function nominalRate(rank, seconds) {
  return rank * RING.step * BITE * (seconds / RING.beat);
}

/** A run wearing `rank` ranks, with nothing in it but the ring's own arithmetic. */
function wearing(rank) {
  const field = scriptedRun(520 + rank);
  field.xpNeed = Infinity;
  field.upgrades.orbitals = rank;
  return field;
}

test('a rank puts a pair more on the ring, evenly spaced and at the line radius', () => {
  for (let rank = 0; rank <= RANKS; rank++) {
    const field = wearing(rank);
    stepTheWorld({});

    const drones = field.orbit.drones;
    assert.equal(drones.length, rank * RING.step, 'rank ' + rank + ' flies ' + drones.length);
    assert.equal(drones.length, dronesOf(field), 'and the line is counted, not cached');

    for (let i = 0; i < drones.length; i++) {
      assert.ok(Math.abs(fromShip(field, drones[i].x, drones[i].y) - RING.radius) < 1e-9,
        'every drone stands on the ring, at the distance the card is drawn at');
      const slot = turnBetween(
        Math.atan2(drones[i].y - field.player.y, drones[i].x - field.player.x),
        field.orbit.angle + (i * TAU) / drones.length);
      assert.ok(Math.abs(slot) < 1e-9, 'and in its own slot of the turn');
    }
    for (let i = 1; i < drones.length; i++) {
      const before = Math.atan2(drones[i - 1].y - field.player.y, drones[i - 1].x - field.player.x);
      const after = Math.atan2(drones[i].y - field.player.y, drones[i].x - field.player.x);
      assert.ok(Math.abs(turnBetween(after - before, TAU / drones.length)) < 1e-9,
        'and evenly spaced, so a rank never puts two of them on one another');
    }
  }
});

test('the ring turns at the line spin and rides with the ship', () => {
  const field = wearing(2);
  stepTheWorld({});

  const started = field.orbit.angle;
  runFor(field, 1);
  assert.ok(Math.abs(turnBetween(field.orbit.angle - started, RING.spin)) < 0.02,
    'one second turned the ring by the line spin: ' + (field.orbit.angle - started).toFixed(3));

  // And it is a ring round the *ship*: drive the ship to the right and every drone comes
  // with it, because a drone has no position of its own to stay behind with.
  let steps = 0;
  while (field.player.x < 1600 && steps < 600) {
    stepTheWorld({ moveX: 1, moving: true });
    steps++;
  }
  assert.ok(steps < 600, 'and the ship really did move');
  for (const drone of field.orbit.drones) {
    assert.ok(Math.abs(fromShip(field, drone.x, drone.y) - RING.radius) < 1e-9,
      'the whole ring came with the ship');
  }
});

test('the ring bites at its own tempo, and a bigger crowd does not make it faster', () => {
  // A crowd standing in the ring, and three seconds. What comes off it is the ring's whole
  // output - `drones * damage / beat` - and not one bite per neighbour per step, which is
  // the mistake this line could make. Then the same ring against half again the crowd: it
  // was already busy, and it is no faster for the company.
  //
  // The bodies are swarmlings because they are seven pixels across and so can stand three
  // deep in the bite band; a crowd that thin in there is not a busy ring at all, because a
  // bitten body is shoved outwards and a single row of them ends the three seconds out of
  // reach - which is the ring working as designed, and the reason a press of bodies gets
  // further than a stream of them.
  const seconds = 3;
  for (const rank of [1, RANKS]) {
    const few = deepRing(wearing(rank), 10, [-14, 14]);
    runFor(few.field, seconds);
    const many = deepRing(wearing(rank), 10, [-14, 0, 14]);
    runFor(many.field, seconds);

    const wanted = nominalRate(rank, seconds);
    const slack = 2 * BITE;
    assert.ok(Math.abs(hullGone(few.bodies) - wanted) < slack,
      'rank ' + rank + ' took ' + hullGone(few.bodies) + ' off twenty bodies, ' + wanted + ' expected');
    assert.ok(Math.abs(hullGone(many.bodies) - wanted) < slack,
      'and ' + hullGone(many.bodies) + ' off thirty: the beat is per drone, not per body');
  }
});

/** `per` bodies on each of the ring radii in `offsets`, all marked. */
function deepRing(field, per, offsets) {
  const bodies = [];
  for (const off of offsets) bodies.push(...onRing(field, per, IMMORTAL, 'swarmling', RING.radius + off));
  return { field, bodies: marked(bodies) };
}

test('the ring only bites what it can reach', () => {
  // One body just where the ring stands and one well past its reach, measured the same way:
  // the reach is a wall, and it is the wall the renderer draws.
  assert.ok(bittenAt(RING.radius, 2) > 0, 'a body standing on the ring was bitten');
  assert.equal(bittenAt(RING.radius + RING.touch + 15 + 30, 2), 0,
    'and one thirty pixels past its reach was not');
});

test('a body inside the ring is out of reach of it', () => {
  // The decision, written as a test: this is a ring at a known distance and not an aura
  // that forgives you for standing in the middle of it. A body that has walked past the
  // drones - which is the one about to take a hull - takes nothing from them.
  const field = wearing(2);
  const ship = field.player;
  const inside = marked([enemyAt('drifter', ship.x, ship.y - 20, IMMORTAL)]);

  runFor(field, 2);
  assert.equal(hullGone(inside), 0, 'nothing at the ship end of the ring was bitten');
  assert.ok(fromShip(field, inside[0].x, inside[0].y) < RING.radius - RING.touch - 15,
    'and it really was inside, where a drone cannot reach');
});

/** What one body `distance` above the ship loses in `seconds`. */
function bittenAt(distance, seconds) {
  const field = wearing(RANKS);
  const ship = field.player;
  const body = marked([enemyAt('drifter', ship.x, ship.y - distance, IMMORTAL)]);
  runFor(field, seconds);
  return hullGone(body);
}

test('a bite is the ship own damage, and pays out like it', () => {
  // Score, kills and shards all follow the ring, because everything it kills is the run's
  // doing - game/enemies.js is told as much. A drone is a weapon of the ship, not scenery
  // the run can watch do the work.
  const field = wearing(RANKS);
  onRing(field, 6, 0.2, 'drifter');

  runFor(field, 2);
  assert.equal(field.kills, 6, 'the ring cleared the whole crowd standing on it');
  assert.ok(field.score > 0, 'and the run was paid for every one of them');
  assert.equal(field.enemies.length, 0, 'and nothing of it is left');
});

test('a bite throws the crowd away from the ship', () => {
  const field = wearing(2);
  const ship = field.player;
  const body = enemyAt('drifter', ship.x + RING.radius, ship.y, IMMORTAL);

  let steps = 0;
  while (body.ix === 0 && steps < 400) { stepTheWorld({}); steps++; }
  assert.ok(steps < 400, 'a drone found it');
  assert.ok(body.ix > 0, 'and the shove pointed outwards, away from the ship: ' + body.ix);
});

test('a shielder drinks a bite before the hull does, like any other shot', () => {
  // There is one way to hurt a body in this game (`damageEnemy`) and the ring must not be a
  // way of getting past it, or the shielder kind would be a suggestion. Same body, same
  // ring, same seconds: the one standing in a field loses less.
  const guarded = fieldWithGuard(true);
  const bare = fieldWithGuard(false);
  runFor(guarded.field, 2);
  runFor(bare.field, 2);

  assert.notEqual(guardOf(guarded.body), null, 'and the body really was standing in a field');
  assert.ok(hullGone([bare.body]) > hullGone([guarded.body]),
    'the guarded body lost ' + hullGone([guarded.body]) + ' against the bare one at '
    + hullGone([bare.body]));
});

/** One drifter on the ring, with or without a shielder standing over it. */
function fieldWithGuard(withShielder) {
  const field = wearing(RANKS);
  const ship = field.player;
  const body = marked([enemyAt('drifter', ship.x + RING.radius, ship.y, IMMORTAL)])[0];
  if (withShielder) enemyAt('shielder', ship.x + 60, ship.y + 40, IMMORTAL);
  for (let i = 0; i < 10; i++) stepTheWorld({});   // let the field be worked out
  return { field, body };
}

test('taking a rank mid-run puts the new drones on the ring without a jump', () => {
  // A card is taken between two frames, so the ring has to change size inside one step.
  // Growing it moves every drone to a new slot, and a move the renderer interpolates would
  // be painted as a streak right across the arena - so the resize throws its own history
  // away, and this is the test that says so.
  const field = wearing(1);
  runFor(field, 1);

  field.upgrades.orbitals = 2;
  stepTheWorld({});
  const drones = field.orbit.drones;
  assert.equal(drones.length, 2 * RING.step, 'the pair arrived at once');
  for (const drone of drones) {
    const jumped = Math.hypot(drone.x - drone.px, drone.y - drone.py);
    assert.ok(jumped < RING.radius * RING.spin * STEP * 2,
      'nobody was moved further in one step than the ring turns in one: ' + jumped.toFixed(2));
  }
});

test('a new run has no ring at all', () => {
  const field = wearing(RANKS);
  runFor(field, 0.5);
  assert.ok(field.orbit.drones.length > 0, 'the ranks were there to begin with');

  // A restart runs `resetRun`, and the title screen does not step a run - so a ring left
  // over from the last run would be drawn behind the logo until the next one started.
  resetRun(field);
  assert.equal(field.orbit.drones.length, 0, 'the ring went with the ranks');
});

test('the line is a count, not a multiplier, and the card says so', () => {
  const field = wearing(0);
  assert.equal(dronesOf(field), 0, 'a fresh run flies nothing');

  field.upgrades.orbitals = RANKS;
  assert.equal(dronesOf(field), RANKS * RING.step);
  assert.equal(countOf(field, 'orbitals'), dronesOf(field), 'and it is the line, counted');
  assert.equal(effectOf('orbitals'), '+' + RING.step + ' orbital drone');
  assert.throws(() => gainOf(field, 'orbitals'), /not a line of shares/);
});

test('a bite carries the damage line, exactly like a shot does', () => {
  // A drone hits as hard as you do. That is what keeps the line worth taking once the run
  // is a quarter of the way up a build instead of a card you only want in the first minute
  // - and it is the thing the numbers say was wrong with the first version of this line,
  // which paid the ring a flat number and lost the run a rank of the gun every time it was
  // picked (NOTES session 31).
  const plain = wearing(RANKS);
  const plainBodies = marked(onRing(plain, 10, IMMORTAL, 'swarmling'));
  runFor(plain, 2);

  const heavy = wearing(RANKS);
  heavy.upgrades.damage = BALANCE.upgrades.damage.ranks;
  const heavyBodies = marked(onRing(heavy, 10, IMMORTAL, 'swarmling'));
  runFor(heavy, 2);

  const gain = gainOf(heavy, 'damage');
  assert.ok(gain > 1, 'the damage line is worth something');
  assert.ok(Math.abs(hullGone(heavyBodies) - hullGone(plainBodies) * gain) < 2 * BITE * gain,
    'the same ring over the same seconds took ' + hullGone(heavyBodies).toFixed(1)
    + ' against ' + hullGone(plainBodies).toFixed(1) + ' x ' + gain);
});

test('a rank of the ring is worth a rank of the damage line', () => {
  // The ladder, as a lockstep. Every firepower line was weighed against a plain pull
  // (NOTES session 30: damage 2.50x, split 2.57x, pierce 3.33x, ricochet 2.50x), and the
  // ring cannot be weighed on the knot they used - a ring cannot reach a crowd standing a
  // hundred and fifty pixels in front of the ship, which is what a ring *is*. So it is
  // weighed in damage a second instead, against the line it is a rival of: a rank of
  // drones is a rank of damage, spent on the crowd around you rather than the one in front
  // of you. And unlike a flat number it stays worth that much once the gun has grown, which
  // is what the test above is for. Whoever retunes either of these numbers retunes both.
  const perRank = RING.step * BITE / RING.beat;
  const gunPerRank = GUN.damage * BALANCE.player.fireRate * BALANCE.upgrades.damage.step;
  assert.ok(Math.abs(perRank / gunPerRank - 1) < 0.05,
    'a rank of the ring is ' + perRank.toFixed(2) + ' a second against the damage line at '
    + gunPerRank.toFixed(2));
});

test('a crowd the gun cannot reach still dies to the ring', () => {
  // The claim the card sells, end to end: the same bodies, the same gun aimed the other
  // way, the same seconds of trigger, and only the run wearing the line clears them.
  assert.equal(clearedBehind(0), 0, 'the gun, aimed up, hit none of the seven below it');
  assert.equal(clearedBehind(RANKS), 7, 'the ring cleared every one of them');
});

/** Seven bodies on the ring below the ship - out of the air the gun covers - and how
 *  many of them died in two seconds with the trigger held. */
function clearedBehind(rank) {
  const field = wearing(rank);
  const ship = field.player;
  const bodies = [];
  for (let i = 0; i < 7; i++) {
    const a = Math.PI / 2 + (i - 3) * 0.4;
    bodies.push(enemyAt('drifter',
      ship.x + Math.cos(a) * RING.radius, ship.y + Math.sin(a) * RING.radius, 0.2));
  }

  runFor(field, 2, true);
  assert.equal(field.state, STATE.PLAY, 'and nothing stopped the run on the way');
  return bodies.filter((body) => body.hp <= 0).length;
}
