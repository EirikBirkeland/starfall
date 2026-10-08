// Turret (PLAN 3.2's turret, as an upgrade line): a gun is set down across the road ahead of the
// ship, holds that ground for ten seconds, and shoots whatever it can see.
//
// What these tests are mostly about is the two things this line has that nothing else in the deck
// has - a *facing* and a *place that is not the ship* - and the five promises game/turret.js makes:
// that a turret is a place with a nose and not a body, that a crew is laid across the road the ship
// was travelling and not under it, that a rank is another gun in the crew and not a heavier shell,
// that a shell is a shell of this run's own gun and so frosts, lights and is the run's kill, and that
// none of it is ever aimed at the ship that planted it.
//
//   the crew: one per `cycle`, `rank` of them, in a line across the way of travel centred on the road,
//     and none at all for a run that has not taken the line; a gun holds its ground for `life` and then
//     goes out, taking nothing with it;
//   the aim: a gun sees a body when its skin is inside `reach` of the mount and not one px further, and
//     its shell cannot fly past that either; a gun cannot fire through its own back, so the swing is
//     the wind-up; an idle gun does not spend its beat, so a lock is fired on the step it is found;
//   the shell: one shot of the ship's own gun times the line's weight, with the frost and the fire any
//     other shell of this gun leaves behind, no pierce and no ricochet, and never - ever - at the ship;
//   and the count: `hit` never outruns `shots`, `seen` never outruns `steps`, and a new run inherits
//     none of either.
//
// The scripted world's ship stands in the middle of the arena pointing due north unless a test says
// otherwise, so a crew of one is a single gun `stand` px due north of it facing due north, and every
// distance here is read off where the guns and the bodies actually are rather than off a number the
// test invented.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { logic } from '../src/core/rng.js';
import { resetRun } from '../src/game/run.js';
import { damageEnemy } from '../src/game/enemies.js';
import { aimedOf, fadingOf, hasTurret, reloadingOf } from '../src/game/turret.js';
import { effectOf, gainOf, gunsPerCrewOf } from '../src/game/upgrades.js';
import { scriptedRun, enemyAt, stepTheWorld } from '../tools/headless/scripted.js';

const TURRET = BALANCE.upgrades.turret;
const GUN = BALANCE.bullets;
const STEP = BALANCE.sim.step;
const IMMORTAL = 1e6;      // big enough never to die here, small enough to subtract exactly
const AHEAD = 90;          // px beyond the mount a test parks its first body: well inside `reach`

/** What one body hit by one shell loses, on a plain gun with no damage ranks. */
function weight() {
  return GUN.damage * TURRET.weight;
}

function marked(bodies) {
  for (const body of bodies) body.hpBefore = body.hp;
  return bodies;
}

function hullGone(body) {
  return body.hpBefore - body.hp;
}

/** A run wearing `rank` ranks of the line and nothing else, with no levels to be had. */
function wearing(rank, driver) {
  const field = scriptedRun(950 + rank, driver);
  field.xpNeed = Infinity;
  field.upgrades.turret = rank;
  return field;
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

/** Step until `read()` says so, or fail rather than hang (NOTES session 9's rule). `each` is held
 *  down the whole time, because a body a test is waiting on has to stay where it was put. */
function runUntil(field, read, limit, each) {
  const cap = limit === undefined ? 4000 : limit;
  let steps = 0;
  while (!read(field)) {
    assert.ok(steps < cap, 'the thing the test was waiting for happened');
    step(field, each);
    steps++;
  }
  return steps;
}

/** The guns standing, oldest first as the pool happens to hold them. */
function standing(field) {
  return field.turret.stands.items.slice(0, field.turret.stands.count);
}

/**
 * One body straight up the road from the ship, `distance` px beyond the place a gun of the crew will
 * be set down - so it is in front of the gun, dead on the bearing its barrel is born on, and the first
 * lock the line ever finds.
 */
function upTheRoad(field, distance, hp) {
  const ship = field.player;
  const bodies = marked([enemyAt('swarmling',
    ship.x, ship.y - TURRET.stand - AHEAD - distance, hp)]);
  return bodies[0];
}

/** Hold a body at a fixed place, whatever the shells shove into it. */
function pinned(body) {
  const x = body.x;
  const y = body.y;
  return (field) => {
    body.x = x;
    body.y = y;
    body.px = x;
    body.py = y;
    body.ix = 0;
    body.iy = 0;
  };
}

/** How far a body has to stand to be seen: the reach plus its own skin. */
function seenAt(body) {
  return TURRET.reach + body.r;
}

test('the card prints what the line is: one more turret per crew, per rank', () => {
  assert.equal(effectOf('turret'), '+1 turret planted');
  const field = wearing(0);
  assert.equal(gunsPerCrewOf(field), 0, 'and a build with no ranks hands out nothing');
  assert.equal(gunsPerCrewOf(wearing(3)), 3 * TURRET.step, 'and three ranks is three of them');
  assert.throws(() => gainOf(field, 'turret'), /not a line of shares/,
    'and it is a line of whole things, so nobody can ask it for a multiplier');
});

test('rank 0 is not a fence that does nothing, it is no fence at all', () => {
  const field = wearing(0);
  upTheRoad(field, 0, IMMORTAL);
  assert.equal(hasTurret(field), false);

  runFor(field, TURRET.cycle * 3);
  assert.equal(field.turret.crews, 0, 'nothing is planted');
  assert.equal(field.turret.stands.count, 0, 'and nothing stands in the arena');
  assert.equal(field.turret.shots, 0, 'and so nothing is fired');
  assert.equal(hasTurret(field), false);
});

test('a crew goes down on PLAN\'s beat, and a rank is more guns in it', () => {
  for (const rank of [1, 2, 5]) {
    const field = wearing(rank);
    runFor(field, TURRET.cycle * 3.5);
    assert.equal(field.turret.crews, 4,
      'the first crew on the first step and one on each beat after it, at rank ' + rank);
    assert.equal(field.turret.guns, 4 * rank,
      'and every gun of every one of them is counted, at rank ' + rank);
    assert.equal(field.turret.stands.count, rank,
      'but only the newest crew is still standing: ten seconds of life on a twelve second beat is '
      + 'PLAN\'s own two numbers read together, and the two second gap is the price of the line');
  }
});

test('a crew is a line across the road, centred on it, evenly spaced', () => {
  const field = wearing(5);
  runUntil(field, (f) => f.turret.crews >= 1);
  const ship = field.player;
  // Standing still and pointing due north, so the road is due north and the fence runs east-west.
  const row = standing(field).slice().sort((a, b) => a.x - b.x);

  assert.equal(row.length, 5, 'a whole crew of them');
  for (const turret of row) {
    assert.ok(Math.abs(turret.y - (ship.y - TURRET.stand)) < 1e-6,
      'the whole fence is on the line across the road, `stand` px down it');
  }
  const middle = row[2];
  assert.ok(Math.abs(middle.x - ship.x) < 1e-6, 'and the road itself goes through the middle gun');
  for (let i = 1; i < 5; i++) {
    assert.ok(Math.abs((row[i].x - row[i - 1].x) - TURRET.gap) < 1e-6,
      'gun ' + i + ' sits one gap beside the one before it: ' + (row[i].x - row[i - 1].x));
  }
});

test('a crew is laid across the way the ship was going, not the way it was pointing', () => {
  // Flying due east and aiming due north: the fence has to run north-south east of the ship, because a
  // gun is set down on the road the ship is travelling down and not the one the mouse points at
  // (game/turret.js `roadOf`, the mirror of game/mines.js dropping a field behind).
  const field = wearing(3);
  const ship = field.player;
  const here = { x: ship.x, y: ship.y };
  const east = { moveX: 1, moveY: 0, moving: true };
  let planted = null;

  // The ship is a wind tunnel here: the stick is held over so it is properly at full stretch east -
  // which is the only thing a road is made of - and it is put back in the middle every step so it does
  // not walk the fence off into the arena wall. The first crew goes down while it is still standing
  // still, which is the next test's business; this one waits for the second.
  while (field.turret.crews < 2) {
    field.xp = 0;
    field.freeze = 0;
    field.shards.clear();
    stepTheWorld(east);
    planted = { x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy };
    ship.x = here.x;
    ship.y = here.y;
    ship.px = here.x;
    ship.py = here.y;
    assert.ok(field.turret.crews <= 2, 'and no more than the two crews the test is about');
  }
  assert.ok(planted.vx > BALANCE.player.maxSpeed * 0.9,
    'the ship was at full stretch east by then: ' + planted.vx.toFixed(1));
  assert.ok(Math.abs(planted.vy) < 1e-6, 'and not going anywhere else: ' + planted.vy.toFixed(3));

  const crew = standing(field).slice().sort((a, b) => a.y - b.y);
  assert.equal(crew.length, 3, 'the whole crew, and nothing older than it');
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(crew[i].x - (planted.x + TURRET.stand)) < 1e-6,
      'gun ' + i + ' was set down across the road, `stand` px down it');
    assert.ok(Math.abs(crew[i].y - (planted.y + (i - 1) * TURRET.gap)) < 1e-6,
      'and one gap along it from the middle: ' + (crew[i].y - planted.y).toFixed(1));
  }
});

test('a gun is born looking down the road, so the chase is behind its barrel', () => {
  const field = wearing(1);
  runFor(field, STEP);
  const turret = standing(field)[0];
  // Due north here, and the way the ship was going is the answer in general: the fence is planted
  // facing where the ship is heading, which is why it has to come about to shoot its own wake.
  assert.ok(Math.abs(turret.angle + Math.PI / 2) < 1e-6,
    'born facing due north: ' + turret.angle);
});

test('a fence bends at the arena wall instead of planting guns outside it', () => {
  const field = wearing(5);
  const ship = field.player;
  ship.x = TURRET.pad;                        // hard against the west wall, still pointing north
  runUntil(field, (f) => f.turret.crews >= 1);

  for (const turret of standing(field)) {
    assert.ok(turret.x >= TURRET.pad - 1e-6 && turret.x <= field.arena.w - TURRET.pad,
      'a gun planted outside the arena would be one nobody could see or reach: ' + turret.x);
    assert.ok(turret.y >= TURRET.pad - 1e-6 && turret.y <= field.arena.h - TURRET.pad);
  }
});

test('a turret is a place and not a body: nothing in the game can touch it', () => {
  const field = wearing(1);
  const ship = field.player;
  runFor(field, STEP);
  const turret = standing(field)[0];
  assert.equal(turret.px, undefined, 'it is a place, and render/interp.js has nothing to lerp');
  assert.equal(turret.hp, undefined, 'it has no hull for anything to take off');
  assert.equal(field.enemies.includes(turret), false, 'and it is not in the crowd');

  // A bomber coming apart right on top of it: the biggest thing that goes off in this arena, and it
  // does not reach the gun - the same contract game/mines.js signed for a mine lying in the road.
  const bomber = marked([enemyAt('bomber', turret.x, turret.y, 4)])[0];
  damageEnemy(field, bomber, 1e6, true);
  assert.ok(bomber.hp <= 0, 'and it came apart on the spot');
  runFor(field, STEP * 4);
  assert.equal(standing(field).length, 1, 'and the gun is still standing there');

  // ...and it is still working afterwards, which is what the two assertions above are really for.
  const body = upTheRoad(field, 0, IMMORTAL);
  runUntil(field, (f) => hullGone(body) > 0, 2000);
  assert.ok(field.turret.shots > 0, 'and it was firing at anything it could see');
});

test('the reach is a hard edge, for the eye and for the shell alike', () => {
  const inside = wearing(1);
  const body = upTheRoad(inside, 0, IMMORTAL);
  const turret = (runUntil(inside, (f) => f.turret.stands.count > 0), standing(inside)[0]);
  body.x = turret.x;
  body.y = turret.y + seenAt(body) - 0.5;     // half a px inside the sight line's end
  runUntil(inside, (f) => f.turret.shots > 0, 2000);
  const fired = inside.turret.shots;
  runFor(inside, 2);
  assert.ok(inside.turret.shots > fired, 'a skin inside the reach is fired at');
  assert.ok(hullGone(body) > 0, 'and hit');

  const outside = wearing(1);
  const far = upTheRoad(outside, 0, IMMORTAL);
  const gun = (runUntil(outside, (f) => f.turret.stands.count > 0), standing(outside)[0]);
  far.x = gun.x;
  far.y = gun.y + seenAt(far) + 0.5;          // half a px outside it
  runFor(outside, TURRET.cycle);
  assert.equal(outside.turret.shots, 0, 'and one px further out is out, with no shell to reach it');
  assert.equal(hullGone(far), 0);
  assert.equal(outside.turret.seen, 0, 'and the gun never had anything in its sight at all');
});

test('a shell flies the length of the sight line and no further', () => {
  // The other half of the promise the drawn sight line makes: "reach" is how far the gun looks *and*
  // how far its shell goes, so the light on the floor never claims a longer gun than the simulation
  // has. The test is the ugly kind - a lock taken away mid flight - because a gun only ever aims at
  // what it can see, and what it can see is by definition inside the line.
  const field = wearing(1);
  const turret = (runUntil(field, (f) => f.turret.stands.count > 0), standing(field)[0]);
  const lock = marked([enemyAt('swarmling', turret.x, turret.y - TURRET.reach + 6, IMMORTAL)])[0];
  const past = marked([enemyAt('swarmling', turret.x, turret.y - TURRET.reach - 80, IMMORTAL)])[0];

  runUntil(field, (f) => f.turret.shots > 0);
  assert.equal(field.turret.hit, 0, 'the shell is still in the air on the step it is checked');
  damageEnemy(field, lock, 1e9, true);        // out of the sky, and out of the sight
  runFor(field, TURRET.beat * 2);
  assert.ok(field.turret.shots >= 1, 'the gun fired');
  assert.equal(hullGone(past), 0,
    'and a body a wide stride past the end of the line never felt it');
});

test('a gun cannot fire through its own back: the swing is the wind-up', () => {
  const field = wearing(1);
  const turret = (runUntil(field, (f) => f.turret.stands.count > 0), standing(field)[0]);
  // A body nearly dead astern of it: the barrel is born pointing up the road, so it has the better
  // part of a whole turn to come through before a shell may leave (game/turret.js lets one out only
  // down the nose). Nearly, not exactly - a body exactly behind the mount would be exactly behind the
  // ship too, and the ship is already standing there.
  const body = marked([enemyAt('swarmling', turret.x + 140, turret.y + 145, IMMORTAL)])[0];
  const hold = pinned(body);
  const bearing = Math.atan2(body.y - turret.y, body.x - turret.x);
  let round = bearing - turret.angle;
  while (round > Math.PI) round -= Math.PI * 2;
  while (round < -Math.PI) round += Math.PI * 2;
  const swing = (Math.abs(round) - TURRET.aim) / TURRET.turn;

  runFor(field, swing * 0.8, hold);
  assert.equal(field.turret.shots, 0, 'nothing has left while the barrel is still coming round');
  assert.equal(hullGone(body), 0);
  runUntil(field, (f) => f.turret.shots > 0, Math.round(swing * 2 / STEP) + 40, hold);
  // The first shell out of a barrel that is still coming round can miss - the tolerance is an angle,
  // and at 200 px an angle is more than the shell's own width - so what the test waits for is the hit
  // the gun gets once its nose has settled, which is the point of the swing in the first place.
  runUntil(field, (f) => hullGone(body) > 0,
    Math.round((swing + TURRET.beat * 4) / STEP), hold);
});

test('a gun that was idle is hot: the beat is spent by a shell and not by waiting', () => {
  const field = wearing(1);
  const turret = (runUntil(field, (f) => f.turret.stands.count > 0), standing(field)[0]);
  runFor(field, TURRET.beat * 4);              // nothing to shoot at, for a long while
  assert.equal(field.turret.shots, 0);

  // Put a body in its sight and the very next step it fires - not one beat late, because an idle gun
  // that had spent its beat waiting would be (game/orbitals.js has the same rule for the same reason).
  const body = marked([enemyAt('swarmling', turret.x, turret.y - 120, IMMORTAL)])[0];
  const hold = pinned(body);
  runFor(field, STEP * 3, hold);
  assert.equal(field.turret.shots, 1, 'one shell, on the step the lock was found');
  runFor(field, TURRET.beat * 0.6, hold);
  assert.ok(hullGone(body) > 0, 'and it arrived');
  assert.equal(field.turret.shots, 1, 'and that is all the beat had in it');
});

test('one gun fires once a beat, and every gun of a crew keeps its own beat', () => {
  const field = wearing(1);
  const body = upTheRoad(field, 0, IMMORTAL);
  const hold = pinned(body);
  runFor(field, TURRET.beat * 3.5, hold);
  assert.ok(field.turret.shots >= 3 && field.turret.shots <= 5,
    'one on the step it found the lock and one on each beat after it, give or take the last one: '
    + field.turret.shots + ' shells in ' + (TURRET.beat * 3.5).toFixed(1) + ' s');
});

test('what a shell costs is a shot of the ship\'s own gun, times its weight', () => {
  const field = wearing(1);
  field.upgrades.damage = 2;
  const body = upTheRoad(field, 0, IMMORTAL);
  const expected = weight() * gainOf(field, 'damage');

  runUntil(field, (f) => f.turret.hit > 0);
  assert.ok(Math.abs(hullGone(body) - expected) < 1e-6,
    'lost ' + hullGone(body) + ' where the gun, the damage line and the weight say ' + expected);
});

test('a rank is more guns and not heavier shells', () => {
  const perHit = [];
  for (const rank of [1, 5]) {
    const field = wearing(rank);
    const body = upTheRoad(field, 0, IMMORTAL);
    runFor(field, TURRET.beat * 4, pinned(body));
    assert.ok(field.turret.hit > 0, 'the guns found it at rank ' + rank);
    perHit.push(hullGone(body) / field.turret.hit);
  }
  assert.ok(Math.abs(perHit[0] - perHit[1]) < 1e-9,
    'every shell cost the same at both ranks: ' + perHit[0] + ' against ' + perHit[1]
    + ' - a rank buys ground');
  assert.ok(Math.abs(perHit[0] - weight()) < 1e-9, 'and one shell is one shot of the gun');
});

test('a shell that was thrown never comes round more than one body', () => {
  // No pierce and no ricochet on a turret's round: those two lines are bought for the ship's trigger
  // and a gun standing in the road has not bought them (game/turret.js).
  const field = wearing(1);
  const turret = (runUntil(field, (f) => f.turret.stands.count > 0), standing(field)[0]);
  const near = marked([enemyAt('swarmling', turret.x, turret.y - 90, IMMORTAL)])[0];
  const far = marked([enemyAt('swarmling', turret.x, turret.y - 150, IMMORTAL)])[0];
  field.upgrades.pierce = BALANCE.upgrades.pierce.ranks;
  field.upgrades.ricochet = BALANCE.upgrades.ricochet.ranks;

  runFor(field, TURRET.beat * 3, (f) => { pinned(near)(f); pinned(far)(f); });
  assert.ok(field.turret.hit > 0, 'and it was firing all the while');
  assert.equal(field.turret.hit, field.turret.shots,
    'one body per shell, however many stand behind it: ' + field.turret.hit
    + ' bodies came round ' + field.turret.shots + ' shells');
  assert.equal(hullGone(far), 0, 'and the body behind the one aimed at never felt it');
});

test('the shell is a shell of this gun, so it frosts and it lights', () => {
  // The same bargain a drone bite, a nova front, a mine and a thread strike: the round that kills a
  // body is the cold and the flame it dies with. Only the magnetar's crack is exempt, and it is
  // exempt because of how often it fires (game/magnetar.js).
  const field = wearing(1);
  field.upgrades.burn = BALANCE.upgrades.burn.ranks;
  field.upgrades.chill = BALANCE.upgrades.chill.ranks;
  const body = upTheRoad(field, 0, IMMORTAL);
  const fires = field.fires.count;
  body.frost = 0;

  runUntil(field, (f) => f.turret.hit > 0);
  assert.ok(hullGone(body) > 0, 'it hurt it');
  assert.ok(field.fires.count > fires, 'and it set it alight, like a drone bite and a mine');
  assert.ok(body.frost > 0, 'and took the speed out of it, like them both');
});

test('a body a turret brings down is the run\'s own kill, score and all', () => {
  const field = wearing(1);
  const doomed = upTheRoad(field, 0, 1);
  const before = { kills: field.kills, score: field.score };

  runUntil(field, (f) => f.enemies.length === 0, 2000);
  assert.equal(doomed.hp <= 0, true, 'the shell finished it');
  assert.equal(field.kills, before.kills + 1, 'the kill is credited');
  assert.ok(field.score > before.score, 'and so is the score it pays');
});

test('it never hurts the ship, whatever the ship is standing between', () => {
  const field = wearing(1);
  const turret = (runUntil(field, (f) => f.turret.stands.count > 0), standing(field)[0]);
  const ship = field.player;
  ship.invuln = 0;
  const hull = ship.hull;
  // The ship moved out past its own gun, so every shell the gun throws flies over the hull it belongs
  // to on the way to the body beyond - the one arrangement in which a friendly gun could hurt you, and
  // it cannot, because a shell is a shot of your own gun and shots do not hit you (game/bullets.js).
  ship.x = turret.x;
  ship.y = turret.y - 60;
  const body = marked([enemyAt('swarmling', turret.x, turret.y - 160, IMMORTAL)])[0];
  const hold = pinned(body);

  runFor(field, TURRET.beat * 4, hold);
  assert.ok(field.turret.hit > 1, 'and it was firing straight over her all the while');
  assert.equal(ship.hull, hull, 'and it did not cost her a thing');
});

test('a gun that is never used goes out on its own clock and takes nothing with it', () => {
  const field = wearing(3);
  const body = upTheRoad(field, TURRET.reach + 400, IMMORTAL);
  runUntil(field, (f) => f.turret.stands.count >= 3);
  field.upgrades.turret = 0;                  // and no more are coming: this is about the ones down

  runFor(field, TURRET.life + STEP * 2);
  assert.equal(field.turret.stands.count, 0, 'every gun of them went out');
  assert.equal(field.turret.shots, 0, 'and none of them fired');
  assert.equal(hullGone(body), 0, 'and nothing was hurt by the going-out');
});

test('the three readings the drawing is painted out of read the clocks honestly', () => {
  const field = wearing(1);
  const turret = (runUntil(field, (f) => f.turret.stands.count > 0), standing(field)[0]);

  assert.equal(aimedOf(turret), 0, 'with nobody in sight there is nothing aimed at');
  assert.equal(reloadingOf(turret), 1, 'and the beat is ready the moment it exists');
  assert.equal(fadingOf(turret), 0, 'with no time left to go out in yet');

  const body = upTheRoad(field, 0, IMMORTAL);
  const hold = pinned(body);
  runFor(field, STEP * 3, hold);
  assert.equal(aimedOf(turret), 1, 'and the moment there is, the gun says so');
  assert.ok(reloadingOf(turret) < 1, 'and it has just spent its beat: ' + reloadingOf(turret));

  runFor(field, TURRET.beat - STEP * 2, hold);
  assert.ok(reloadingOf(turret) > 0.9, 'and it comes back round as the beat comes due: '
    + reloadingOf(turret));

  turret.life = TURRET.fade * 0.5;
  assert.ok(fadingOf(turret) > 0, 'and now it is visibly running out: ' + fadingOf(turret));
  assert.ok(fadingOf(turret) < 1, 'but it has not gone yet');
});

test('the counters never lie about what the line did', () => {
  const field = wearing(3);
  const body = upTheRoad(field, 0, IMMORTAL);
  runFor(field, TURRET.cycle * 2, pinned(body));

  assert.ok(field.turret.steps > 0, 'every step a gun stood is counted');
  assert.ok(field.turret.seen <= field.turret.steps,
    'and never more of them than there were: ' + field.turret.seen + ' of ' + field.turret.steps);
  assert.ok(field.turret.seen > 0, 'with a body parked in the fence, some of them had a lock');
  assert.ok(field.turret.hit <= field.turret.shots,
    'a shell comes round at most one body: ' + field.turret.hit + ' of ' + field.turret.shots);
  assert.ok(field.turret.hit > 0, 'and at least one of them landed, or the test is empty');
  assert.equal(field.turret.guns, field.turret.crews * 3, 'guns counted against crews planted');
});

test('the line costs no number out of the run\'s own stream while nothing is in its sight', () => {
  // The guns themselves are pure arithmetic: the planting, the swing, the beat and the counting draw
  // nothing from the stream a run is made of. Shells that *land* do spend it, exactly as the ship's own
  // shots do, which is the same reason a run with the line in it is a different run and not a
  // rescaled copy of one without it.
  const field = wearing(5);
  runFor(field, STEP);
  const state = logic.state;
  runFor(field, TURRET.cycle * 2);
  assert.ok(field.turret.guns > 0, 'and crews went down all the way through');
  assert.equal(logic.state, state, 'not one draw from the stream a run is made of');
});

test('a new run forgets whatever the last one planted', () => {
  const field = wearing(3);
  runFor(field, TURRET.cycle * 1.5);
  assert.ok(field.turret.stands.count > 0);

  resetRun(field);
  assert.equal(field.turret.stands.count, 0, 'a restart does not fire from guns it never planted');
  assert.equal(field.turret.crews, 0);
  assert.equal(field.turret.guns, 0);
  assert.equal(field.turret.shots, 0);
  assert.equal(field.turret.hit, 0);
  assert.equal(field.turret.seen, 0);
  assert.equal(field.turret.steps, 0);
  assert.equal(field.turret.wait, 0, 'and the next run\'s first crew is planted on its first step');
});
