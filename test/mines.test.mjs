// Mines (PLAN 3.2's mines, as an upgrade line): the ship drops mines out of the way it was going,
// and a body that walks into one pays for the road.
//
// What these tests are mostly about is the mine's own three-part clock - it winds, it waits, and
// then it either goes off or it goes out - and the four promises game/mines.js makes about it: that
// it is a place and not a body, that it never hurts the ship, that the ring on the floor is the
// reach that sets it off and the blast is never smaller than the ring, and that it is a shell of
// the ship's own gun and so frosts, lights, and is paid for by the run like a drone bite or a nova
// front.
//
//   the clock: one drop per `cycle`, `rank` mines in it, spaced out behind the ship and none of
//     them live until `arm` has gone by; a mine with nobody near it goes out at `life` and takes
//     nothing with it; a mine whose fuse is lit always goes off, even from a body that has already
//     left and even with no life left to speak of;
//   the geometry: a body whose skin touches the trigger ring lights it and a body one px outside
//     does not; a body outside the trigger but inside the blast is hurt by a mine that someone else
//     lit - which is the whole promise that `radius > trigger`, and the reason the ring on the
//     floor is a promise and not a wall;
//   and who it is done to: never the ship, always the crowd, always the run's own kill, and always
//     with the frost and the fire that any other shell of this gun leaves behind.
//
// The scripted world's ship sits still in the middle of the arena and points due north unless a test
// says otherwise, so a drop falls out in a straight row to the south of it and every distance here
// is measured from the ship's own place - which is where the first mine of a row lands.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { logic } from '../src/core/rng.js';
import { resetRun } from '../src/game/run.js';
import { damageEnemy } from '../src/game/enemies.js';
import { armingOf, fadingOf, fusingOf, hasMines } from '../src/game/mines.js';
import { effectOf, gainOf, minesPerDropOf } from '../src/game/upgrades.js';
import { scriptedRun, enemyAt, stepTheWorld, flyFor } from '../tools/headless/scripted.js';

const MINES = BALANCE.upgrades.mines;
const GUN = BALANCE.bullets;
const STEP = BALANCE.sim.step;
const IMMORTAL = 1e9;

/** What one body inside the blast loses, on a plain gun with no damage ranks. */
function weight() {
  return GUN.damage * MINES.weight;
}

function marked(bodies) {
  for (const body of bodies) body.hpBefore = body.hp;
  return bodies;
}

function hullGone(body) {
  return body.hpBefore - body.hp;
}

/** A run wearing `rank` ranks of the line and nothing else, with no levels to be had. */
function wearing(rank) {
  const field = scriptedRun(700 + rank);
  field.xpNeed = Infinity;
  field.upgrades.mines = rank;
  return field;
}

/** One body `distance` due north of the ship - out of the way the mines fall. */
function ahead(field, distance, hp) {
  const ship = field.player;
  return marked([enemyAt('swarmling', ship.x, ship.y - distance, hp)])[0];
}

/** How far a body has to stand to be touching the ring: the ring plus its own skin. */
function touching(body) {
  return MINES.trigger + body.r;
}

/** One step of the run, with whatever could pause it swept away first. */
function step(field, each) {
  if (each !== undefined) each(field);
  field.xp = 0;
  field.freeze = 0;
  field.shards.clear();
  stepTheWorld();
}

/** Step the world for `seconds`, calling `each(field)` before every one of them. */
function runFor(field, seconds, each) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) step(field, each);
}

/** Step until `read()` says so, or fail rather than hang (NOTES session 9's rule). */
function runUntil(field, read, limit) {
  const cap = limit === undefined ? 4000 : limit;
  let steps = 0;
  while (!read(field) && steps < cap) {
    step(field);
    steps++;
  }
  assert.ok(steps < cap, 'the thing the test was waiting for happened');
  return steps;
}

/** Hold a body at a fixed distance north of the ship, whatever the blasts shove into it. */
function pinned(body) {
  return (field) => {
    body.x = field.player.x;
    body.y = field.player.y - body.stand;
    body.px = body.x;
    body.py = body.y;
    body.ix = 0;
    body.iy = 0;
  };
}

/** Wait until the first mine of the run has gone off. */
function untilBlown(field) {
  return runUntil(field, (f) => f.mines.blown > 0);
}

test('the card prints what the line is: one more mine per drop, per rank', () => {
  assert.equal(effectOf('mines'), '+1 mine per drop');
  const field = wearing(0);
  assert.equal(minesPerDropOf(field), 0, 'and a build with no ranks hands out nothing');
  assert.equal(minesPerDropOf(wearing(3)), 3 * MINES.step, 'and three ranks is three of them');
  assert.throws(() => gainOf(field, 'mines'), /not a line of shares/,
    'and it is a line of whole things, so nobody can ask it for a multiplier');
});

test('rank 0 is not a minefield that does nothing, it is no mines at all', () => {
  const field = wearing(0);
  ahead(field, MINES.trigger, IMMORTAL);
  assert.equal(hasMines(field), false);

  runFor(field, MINES.cycle * 4);
  assert.equal(field.mines.dropped, 0, 'nothing is dropped');
  assert.equal(field.mines.laid.count, 0, 'and nothing stands in the arena');
  assert.equal(field.mines.blown, 0, 'and so nothing goes off');
  assert.equal(hasMines(field), false);
});

test('a drop falls out on PLAN\'s beat, and a rank is more mines in it', () => {
  for (const rank of [1, 2, 5]) {
    const field = wearing(rank);
    runFor(field, MINES.cycle * 3.5);
    assert.equal(field.mines.dropped, 4 * rank,
      'the first drop on the first step and one on each beat after it, at rank ' + rank);
    assert.equal(field.mines.laid.count, 3 * rank,
      'and three rows of them are still standing: nine seconds of life is three drops\' worth, '
      + 'so the oldest row has already gone out');
  }
});

test('a rank is a longer stretch of road, in the way the ship was going', () => {
  const field = wearing(4);
  runUntil(field, (f) => f.mines.laid.count >= 4);
  const ship = field.player;
  // Standing still and pointing due north, so "behind" is due south and the row runs down the y.
  const row = field.mines.laid.items.slice().sort((a, b) => a.y - b.y);

  assert.ok(row.length >= 4, 'a whole row of them');
  for (const mine of row) {
    assert.ok(Math.abs(mine.x - ship.x) < 1e-6, 'the row is straight back and not fanned out');
  }
  assert.ok(Math.abs(row[0].y - ship.y) < 1e-6,
    'the first of them is at the ship itself, because it fell out of its wake');
  for (let i = 1; i < 4; i++) {
    assert.ok(Math.abs((row[i].y - row[i - 1].y) - MINES.gap) < 1e-6,
      'mine ' + i + ' sits one gap behind the one before it: ' + (row[i].y - row[i - 1].y));
  }
});

test('the fallout goes the way the ship was going, not the way it is pointing', () => {
  // Flying east and aiming north: the newest row must trail to the west of the ship, because a
  // mine is what falls out of the wake and not what the nose is aimed at (game/mines.js).
  const field = wearing(3);
  flyFor(MINES.cycle * 1.5, {
    moveX: 1, moveY: 0, moving: true,
    aimX: field.player.x, aimY: field.player.y - 200,
  });
  const ship = field.player;
  const newest = field.mines.laid.items.slice(-minesPerDropOf(field));

  assert.equal(newest.length, 3, 'the whole of the newest row');
  for (let i = 0; i < newest.length; i++) {
    assert.ok(Math.abs(newest[i].y - ship.y) < 1, 'row ' + i + ' is on the line the ship flew');
    assert.ok(newest[i].x < ship.x, 'and behind it, not in front');
    if (i > 0) {
      assert.ok(Math.abs((newest[i - 1].x - newest[i].x) - MINES.gap) < 1e-6,
        'and spaced out along it by the gap: ' + (newest[i - 1].x - newest[i].x));
    }
  }
});

test('a ship that is barely moving drops them out behind its nose', () => {
  const field = wearing(2);
  const ship = field.player;
  // Aimed due east and standing still, so "behind" is due west and the row runs along the -x.
  for (let i = 0; i < 3; i++) stepTheWorld({ aimX: ship.x + 100, aimY: ship.y });
  const mine = field.mines.laid.items[1];
  assert.ok(mine.x < ship.x - MINES.gap * 0.5, 'behind the nose, not in front of it');
  assert.ok(Math.abs(mine.y - ship.y) < 1e-6);
});

test('a mine is not live the moment it lands, and that is the whole card', () => {
  const field = wearing(1);
  const body = ahead(field, MINES.trigger, IMMORTAL);

  // The mine drops under the ship, which is exactly where a chase is sitting - and it is on top of
  // a body from the step it is born. Without the wind-up the line would be a rear-facing gun.
  runFor(field, MINES.arm * 0.6);
  assert.equal(hullGone(body), 0, 'nothing has gone off while it winds');
  assert.equal(field.mines.blown, 0);

  runFor(field, MINES.arm + MINES.fuse + STEP * 2);
  assert.ok(hullGone(body) > 0, 'and it goes once the winding is done and the fuse has run');
  assert.equal(field.mines.blown, 1, 'exactly once');
});

test('the three readings the drawing is painted out of read the clock honestly', () => {
  const field = wearing(1);
  runFor(field, STEP);
  const mine = field.mines.laid.items[0];

  assert.ok(armingOf(mine) > 0.9, 'born at the top of its wind: ' + armingOf(mine).toFixed(2));
  assert.equal(fusingOf(mine), 0, 'with nobody near it, no fuse');
  assert.equal(fadingOf(mine), 0, 'and no time left to go out in yet');

  runFor(field, MINES.arm);
  assert.equal(armingOf(mine), 0, 'and done with it');

  runFor(field, MINES.life - MINES.fade + STEP * 2);
  assert.ok(fadingOf(mine) > 0, 'and now it is visibly running out: ' + fadingOf(mine).toFixed(2));
  assert.ok(fadingOf(mine) < 1, 'but it has not gone yet');
});

test('a mine does not move, so it keeps no previous position to interpolate', () => {
  const field = wearing(1);
  runFor(field, STEP);
  const mine = field.mines.laid.items[0];
  assert.equal(mine.px, undefined, 'it is a place, and render/interp.js has nothing to lerp');
  assert.equal(mine.py, undefined);
});

test('a body whose skin touches the ring lights it, and one outside does not', () => {
  const inside = wearing(1);
  const body = ahead(inside, 0, IMMORTAL);
  body.y = inside.player.y + MINES.trigger + body.r - 0.5;   // half a px inside the ring
  runUntil(inside, (f) => f.mines.blown > 0, 2000);
  assert.ok(hullGone(body) > 0, 'caught');

  const outside = wearing(1);
  const far = ahead(outside, 0, IMMORTAL);
  far.y = outside.player.y + touching(far) + 0.5;            // half a px outside it
  runFor(outside, MINES.cycle * 2);
  assert.equal(hullGone(far), 0, 'and one px further out is out');
  assert.equal(outside.mines.blown, 0);
});

test('the blast is never smaller than the ring on the floor, and that is the promise', () => {
  assert.ok(MINES.radius > MINES.trigger,
    'so a body brushing the rim is caught by the whole of the mine and not by a firecracker');

  const field = wearing(1);
  const ringer = ahead(field, MINES.trigger, IMMORTAL);        // the one that lights it
  const beyond = ahead(field, MINES.radius - 1, IMMORTAL);     // outside the ring, inside the blast
  const clear = ahead(field, MINES.radius + 1, IMMORTAL);     // and out of the blast altogether

  untilBlown(field);
  assert.ok(hullGone(ringer) > 0, 'the body that walked in pays');
  assert.ok(hullGone(beyond) > 0, 'and so does the one standing past the ring it walked into');
  assert.equal(hullGone(clear), 0, 'and a body outside the blast is outside it');
});

test('what the blast takes off is a shot of the ship\'s own gun, times its weight', () => {
  const field = wearing(1);
  field.upgrades.damage = 2;
  const body = ahead(field, MINES.trigger, IMMORTAL);
  const expected = weight() * gainOf(field, 'damage');

  untilBlown(field);
  assert.ok(Math.abs(hullGone(body) - expected) < 1e-6,
    'lost ' + hullGone(body) + ' where the gun, the damage line and the weight say ' + expected);
});

test('a rank is more mines and not heavier ones', () => {
  const readings = [];
  for (const rank of [1, 5]) {
    const field = wearing(rank);
    // A lighter to set the mine off, and a body standing where only the first mine of a row can
    // reach it: five ranks throw five mines, but the row runs away from this one.
    ahead(field, MINES.trigger, IMMORTAL);
    const measured = ahead(field, MINES.radius - 1, IMMORTAL);
    untilBlown(field);
    readings.push(hullGone(measured));
  }
  assert.ok(readings[0] > 0, 'the blast landed at both ranks');
  assert.ok(Math.abs(readings[0] - readings[1]) < 1e-9,
    'and cost the same: ' + readings[0] + ' against ' + readings[1] + ' - a rank buys ground');
});

test('once the fuse is lit the mine goes off, whatever the body does after', () => {
  const field = wearing(1);
  const body = ahead(field, MINES.trigger, IMMORTAL);
  runUntil(field, (f) => f.mines.laid.items.some((mine) => mine.fuse >= 0), 2000);

  // Take the body away mid-fuse. A fuse that could be cancelled would be a get-out, and the tell
  // would be a lie: `fuse` is shorter than anything in the arena can back out of.
  field.enemies.length = 0;
  const before = hullGone(body);
  runFor(field, MINES.fuse + STEP * 2);
  assert.equal(field.mines.blown, 1, 'it came apart anyway');
  assert.equal(field.enemies.length, 0, 'on an empty arena, so nothing can have re-lit it');
  assert.equal(hullGone(body), before, 'and there was nobody left standing in it to be hurt');
});

test('a mine on a fuse outlives its life: it either goes off or it goes out', () => {
  const field = wearing(1);
  ahead(field, MINES.trigger, IMMORTAL);
  runUntil(field, (f) => f.mines.laid.items.some((mine) => mine.fuse >= 0), 2000);
  field.mines.laid.items.find((mine) => mine.fuse >= 0).life = STEP * 0.5;

  runFor(field, MINES.fuse + STEP * 3);
  assert.equal(field.mines.blown, 1, 'the fuse was lit, so it went off rather than went out');
  assert.equal(field.mines.laid.count, 0);
});

test('a mine nobody walks into goes out on its own clock and takes nothing with it', () => {
  const field = wearing(2);
  const body = ahead(field, MINES.trigger + 80, IMMORTAL);
  runFor(field, STEP);
  assert.ok(field.mines.laid.count > 0, 'a row is standing in the arena');
  field.upgrades.mines = 0;             // and no more are coming: this is about the ones already down

  runFor(field, MINES.life + STEP * 2);
  assert.equal(field.mines.laid.count, 0, 'every one of them went out');
  assert.equal(field.mines.blown, 0, 'and none of them went off');
  assert.equal(hullGone(body), 0, 'and nothing was hurt by the going-out');
});

test('it never hurts the ship, whatever the ship is standing on', () => {
  const field = wearing(5);
  const ship = field.player;
  ship.invuln = 0;
  const hull = ship.hull;
  const lighter = ahead(field, MINES.trigger, IMMORTAL);
  lighter.stand = MINES.trigger;

  // Held in place, because a blast throws a body clear and a body that has been thrown clear stops
  // lighting anything - and this test wants the ship standing in a going-off minefield, not in one
  // that lit once nine seconds ago.
  runFor(field, MINES.cycle * 3, pinned(lighter));
  assert.ok(field.mines.blown > 1, 'the ship was sitting in the middle of its own minefield');
  assert.equal(ship.hull, hull, 'and it did not cost her a thing');
});

test('a mine is a place and not a body: nothing but a body coming near sets one off', () => {
  const field = wearing(1);
  const ship = field.player;
  // A bomber coming apart just outside the ring and well inside a bomber's own blast: the biggest
  // thing that can go off in this arena, and it is not allowed to touch the mine - no hull, no
  // trigger, nothing to shoot at (game/afterimage.js signed the same contract for a ghost).
  runFor(field, STEP);
  const mine = field.mines.laid.items[0];
  const bomber = marked([enemyAt('bomber', ship.x, ship.y - 100, 4)])[0];
  assert.ok(Math.hypot(bomber.x - mine.x, bomber.y - mine.y) > touching(bomber),
    'it is standing outside the mine\'s reach');

  damageEnemy(field, bomber, 1e6, true);
  assert.ok(bomber.hp <= 0, 'and it came apart where it stood');
  runFor(field, STEP * 4);
  assert.equal(field.mines.blown, 0, 'and the mine did not care');
  assert.equal(field.mines.laid.count, 1, 'it is still lying there');

  // ...and it still works afterwards, which is what the two assertions above are really for.
  const later = ahead(field, MINES.trigger, IMMORTAL);
  later.y = mine.y - touching(later);
  runUntil(field, (f) => f.mines.blown > 0, 2000);
  assert.ok(hullGone(later) > 0, 'a body walking into it still lights it');
});

test('a body the blast brings down is the run\'s own kill, score and all', () => {
  const field = wearing(1);
  const doomed = ahead(field, MINES.trigger, 1);
  const before = { kills: field.kills, score: field.score };

  runUntil(field, () => doomed.hp <= 0, 2000);
  assert.equal(field.enemies.includes(doomed), false, 'the kill took it out of the crowd');
  assert.equal(field.kills, before.kills + 1, 'the kill is credited');
  assert.ok(field.score > before.score, 'and so is the score it pays');
});

test('a mine that finishes a bomber chains, with nothing coming apart twice', () => {
  const field = wearing(1);
  const ship = field.player;
  const bomber = marked([enemyAt('bomber', ship.x, ship.y - MINES.trigger, 1)])[0];
  const neighbour = marked([enemyAt('drifter', ship.x + 12, ship.y - MINES.trigger, IMMORTAL)])[0];

  runUntil(field, () => bomber.hp <= 0, 2000);
  assert.ok(field.mines.blown >= 1, 'the mine went off');
  runFor(field, STEP * 4);
  assert.ok(hullGone(neighbour) > weight(),
    'and the body beside it took the mine *and* the bomber, with nothing doubled');
});

test('a mine\'s round is a shell of this gun, so it frosts and it lights', () => {
  // The opposite of the magnetar's crack (game/magnetar.js): a mine goes off on the nova's scale
  // and not once a second, so it is allowed to hand out what a bullet hands out.
  const field = wearing(1);
  field.upgrades.burn = BALANCE.upgrades.burn.ranks;
  field.upgrades.chill = BALANCE.upgrades.chill.ranks;
  const body = ahead(field, MINES.trigger, IMMORTAL);
  const fires = field.fires.count;
  body.frost = 0;

  untilBlown(field);
  assert.ok(hullGone(body) > 0, 'it hurt it');
  assert.ok(field.fires.count > fires, 'and it set it alight, like a drone bite and a nova front');
  assert.ok(body.frost > 0, 'and took the speed out of it, like them both');
});

test('the line costs no number out of the run\'s own stream, so a seed is still a seed', () => {
  const field = wearing(3);
  ahead(field, MINES.trigger, IMMORTAL);
  runFor(field, STEP);

  const state = logic.state;
  runFor(field, MINES.cycle * 2);
  assert.ok(field.mines.blown > 0, 'and it was going off all the way through');
  assert.equal(logic.state, state, 'not one draw from the stream a run is made of');
});

test('a new run forgets whatever the last one left lying around', () => {
  const field = wearing(3);
  runFor(field, MINES.cycle * 2);
  assert.ok(field.mines.laid.count > 0);

  resetRun(field);
  assert.equal(field.mines.laid.count, 0, 'a restart is not chased by a trail it never laid');
  assert.equal(field.mines.dropped, 0);
  assert.equal(field.mines.blown, 0);
  assert.equal(field.mines.wait, 0);
});
