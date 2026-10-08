// The sniper (PLAN 3.3's last body, arriving at 10:30): "stationary, long telegraphed
// laser across the whole arena", as the simulation does it.
//
// The whole kind is a promise and a line, so that is what is measured here:
//
//   It never moves - not from the crowd leaning on it, not from a bullet kicking it -
//   which is what makes the line it drew a minute ago still be the line it fires down.
//   It cannot change its mind during a lock, so the band you were shown is the band
//   that hurts, edge for edge.
//   The band is exactly as wide as it hurts, it reaches the arena walls and no further,
//   and it pays its damage out once - on the step it is born - so a body that walks
//   onto a beam after it fired is not hurt by it.
//   Whatever it kills, nobody killed: a beam is the sniper's doing, not the run's.
//
// And the arrival: it is landed in sight of the player, at a distance, announced -
// because a body that cannot be walked to must be answerable (game/waves.js).
//
// Everything here runs on the scripted world (tools/headless/scripted.js) at the
// game's own step, next to test/kinds.test.mjs, which proves the general kind promises
// for every kind including this one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { beamHalfWidth, isLocking, isRooted, makeEnemy } from '../src/game/kinds.js';
import { killEnemy } from '../src/game/enemies.js';
import { pickMember, spawnEnemy } from '../src/game/waves.js';
import { axisDistance, beamReach } from '../src/game/beams.js';
import { scriptedRun, stepTheWorld } from '../tools/headless/scripted.js';
import { STATE } from '../src/game/state.js';
import { logic } from '../src/core/rng.js';

const STEP = BALANCE.sim.step;
const STATS = BALANCE.kinds.sniper;
const LOCK = STATS.lock;
const HALF = LOCK.beam.halfWidth;
const ARENA = BALANCE.arena;
const CENTRE = { x: ARENA.w / 2, y: ARENA.h / 2 };

/**
 * A run with one sniper in it at (x, y) and a ship that can be hurt, sitting where the
 * game puts it - the middle of the world. Every test here plants the eye due north of
 * that, so the line it locks is the vertical one and a body's `x` says how far off it
 * the body stands.
 */
function parked(seed, x, y) {
  const field = scriptedRun(seed);
  const ship = field.player;
  ship.invuln = 0;
  ship.hull = 9;
  const sniper = makeEnemy(field, 'sniper', x, y);
  sniper.hp = 9999;            // these tests are about what it does, not about dying
  field.enemies.push(sniper);
  return { field: field, sniper: sniper, ship: ship };
}

/** Step `seconds` of the game's own clock. */
function forSeconds(seconds) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) stepTheWorld();
}

/** Step until `now` stops being false. Bounded, so a failure fails instead of hanging. */
function until(now, what, capSeconds) {
  let seconds = 0;
  while (!now() && seconds < capSeconds) {
    stepTheWorld();
    seconds += STEP;
  }
  assert.ok(now(), 'it never happened: ' + what);
  return seconds;
}

/** Wait for one whole beam: fired, paid out, and faded. Answers the beam it caught. */
function oneBeam(field) {
  const beam = untilBeam(field);
  untilDark(field);
  return beam;
}

/** Step until a beam is in the air; answers it. Bounded, so a failure fails outright. */
function untilBeam(field) {
  let beam = null;
  let seconds = 0;
  while (beam === null && seconds < 5) {
    stepTheWorld();
    seconds += STEP;
    if (field.beams.count > 0) beam = field.beams.items[0];
  }
  assert.ok(beam, 'no beam was fired within 5s');
  return beam;
}

/** Step until whatever is in the air has faded. */
function untilDark(field) {
  let seconds = 0;
  while (field.beams.count > 0 && seconds < 5) {
    stepTheWorld();
    seconds += STEP;
  }
  assert.equal(field.beams.count, 0, 'the light never went out');
}

/** Stand a prop in the arena: a body that stays where it is put. */
function prop(field, type, x, y, hp) {
  const enemy = makeEnemy(field, type, x, y);
  enemy.speed = 0;
  if (hp !== undefined) {
    enemy.hp = hp;
    enemy.maxhp = hp;
  }
  field.enemies.push(enemy);
  return enemy;
}

test('it is the kind that stands still, and the game agrees it does', () => {
  assert.equal(STATS.speed, 0, 'PLAN 3.3 gives it no speed');
  assert.equal(isRooted(makeEnemy(scriptedRun(1), 'sniper', 100, 100)), true,
    'and it is rooted, so nothing else can move it either');
});

test('it never moves, whatever leans on it', () => {
  const { field, sniper } = parked(2, 1500, 1200);
  for (let i = 0; i < 12; i++) {
    prop(field, 'drifter', 1500 + 6 + i, 1200).ix = -400;   // a crowd shoving into it
  }
  const stood = { x: sniper.x, y: sniper.y };
  const draws = logic.state;

  forSeconds(1);

  assert.equal(sniper.x, stood.x, 'not one pixel of drift from the crowd');
  assert.equal(sniper.y, stood.y);
  assert.equal(logic.state, draws, 'and a body that cannot walk draws no random numbers');
  assert.ok(field.enemies.length > 10, 'and the crowd that leaned on it is still here');
});

test('a kick it is handed is refused, not spent', () => {
  const { sniper } = parked(3, 1500, 1200);
  sniper.ix = 600;                        // whatever a shot's knockback leaves behind
  const was = sniper.x;

  forSeconds(0.5);

  assert.equal(sniper.x, was);
  assert.equal(sniper.ix, 0, 'and there is no shove kept up in it, waiting to be spent');
});

test('it brings its eye to bear between locks, at the pace of its mount', () => {
  const { field, sniper } = parked(4, 1500, 1200);
  sniper.timer = 1e6;                     // hold it in the wait, off the subject
  sniper.rot = Math.PI;                   // pointing west, away from everything
  field.player.x = 1800;
  field.player.y = 1200;                  // due east: the eye has a half turn to make

  forSeconds(1);
  const turned = Math.PI - sniper.rot;

  assert.ok(Math.abs(turned - LOCK.turn) < 1e-9,
    'it turned ' + turned.toFixed(4) + ' rad in a second; its mount allows ' + LOCK.turn);

  forSeconds(5);
  assert.ok(Math.abs(sniper.rot) < 1e-9, 'and it arrived on the line to the ship and stopped there');
});

test('a lock keeps the line it took, whatever the ship does afterwards', () => {
  const { field, sniper, ship } = parked(5, 1500, 1200);
  ship.x = 1800;
  ship.y = 1200;                          // due east of the eye

  until(() => isLocking(sniper), 'it took a lock', 5);
  const dirX = sniper.dirX;
  const dirY = sniper.dirY;
  const rot = sniper.rot;
  assert.ok(dirX > 0.99, 'it locked on the way to the ship: ' + dirX);

  ship.x = CENTRE.x;
  ship.y = 2400;                          // right out from under it, mid-telegraph
  forSeconds(LOCK.aim.time * 0.6);

  assert.equal(sniper.dirX, dirX, 'the eye did not follow: the line is the line');
  assert.equal(sniper.dirY, dirY);
  assert.equal(sniper.rot, rot, 'and it is not even turning while it holds it');
});

test('the beam is fired down exactly the line that was shown', () => {
  const { field, sniper, ship } = parked(6, 1500, 1200);
  ship.x = 1700;
  ship.y = 1400;

  until(() => isLocking(sniper), 'it took a lock', 5);
  const wantX = ship.x - sniper.x;
  const wantY = ship.y - sniper.y;
  const length = Math.hypot(wantX, wantY);
  ship.x = 900;
  ship.y = 900;                           // gone before it fires

  until(() => field.beams.count > 0, 'a beam was fired', 5);
  const beam = field.beams.items[0];

  assert.ok(Math.abs(beam.dirX - wantX / length) < 1e-9, 'the axis is the locked line');
  assert.ok(Math.abs(beam.dirY - wantY / length) < 1e-9);
  assert.equal(beam.x, sniper.x, 'from the eye it was drawn from');
  assert.equal(beam.y, sniper.y);
  assert.equal(beam.from, 'sniper', 'and it says who fired it');
  assert.equal(ship.hull, 9, 'a ship that stepped off the line in time owes nothing');
});

test('the band is exactly as wide as it hurts', () => {
  const { field, sniper } = parked(7, 1500, 1200);
  // Two props on the line, one a pixel inside the band and one a pixel outside it -
  // and far enough along it to be nowhere near each other.
  const inside = prop(field, 'drifter', 1500 + HALF - 1, 1400, 99);
  const outside = prop(field, 'drifter', 1500 + HALF + 1, 2000, 99);

  oneBeam(field);

  assert.equal(inside.hp, 99 - LOCK.beam.damage,
    'one px inside the band and it lost what the band costs');
  assert.equal(outside.hp, 99, 'one px outside and it lost nothing');
  assert.equal(beamHalfWidth(sniper), HALF, 'and that is the width the band is drawn at');
});

test('the ship is measured the same way a body is: by its centre', () => {
  const { field, ship } = parked(8, 1500, 1200);
  ship.x = 1500 + HALF;                   // dead on the edge of the band, centre and all
  ship.y = 1600;

  oneBeam(field);

  assert.equal(ship.hull, 8, 'a centre on the line is on it, however little of the ship is');
});

test('it pays its damage out once, on the step it is born', () => {
  const { field, sniper } = parked(9, 1500, 1200);
  const body = prop(field, 'drifter', 1500, 1400, 99);

  until(() => field.beams.count > 0, 'a beam was fired', 5);
  const lost = 99 - body.hp;
  const life = field.beams.items[0].life;
  stepTheWorld();                         // while the light is still hanging there
  stepTheWorld();

  assert.ok(life > 2 * STEP, 'the light lasts a good few steps, so that is not an accident');
  assert.equal(body.hp, 99 - lost, 'and none of the steps it lasts pays out again');
});

test('a body that walks onto a beam after it fired is not hurt by it', () => {
  const { field } = parked(10, 1500, 1200);
  const late = prop(field, 'drifter', 2000, 1600, 99);   // 500 px east of the line

  until(() => field.beams.count > 0, 'a beam was fired', 5);
  late.x = 1500;                          // and now it is standing right on it
  late.px = 1500;
  stepTheWorld();
  stepTheWorld();

  assert.equal(late.hp, 99, 'a beam is a thing that happened, not an area that lasts');
});

test('the line reaches the arena walls, both ways, and no further', () => {
  const ends = beamReach(scriptedRun(12), 1500, 1200, 0, 1);
  assert.equal(ends.fore, ARENA.h - 1200, 'down to the south wall');
  assert.equal(ends.back, 1200, 'and up to the north one');

  const { field } = parked(12, 1500, 1200);
  const beam = untilBeam(field);

  assert.equal(axisDistance(beam, 1500, -10), Infinity, 'nothing outside the wall is on it');
  assert.ok(axisDistance(beam, 1500, 10) < 1e-9, 'everything inside it is');
  assert.equal(axisDistance(beam, 1500, ARENA.h + 10), Infinity, 'and the same at the far wall');
});

test('it locks once per cycle: never twice, never never', () => {
  const { field } = parked(13, 1500, 1200);
  const window = 30;
  const every = LOCK.aim.time + LOCK.wait;

  let fired = 0;
  for (let i = 0; i < Math.round(window / STEP); i++) {
    const before = field.beams.stats().spawned;
    stepTheWorld();
    if (field.beams.stats().spawned > before) fired++;
  }

  assert.ok(Math.abs(fired - window / every) < 1.2,
    fired + ' beams in ' + window + 's, its own clock asked for ' + (window / every).toFixed(2));
  assert.ok(field.player.hull > 0, 'and the ship that stood there all the while is still flying');
});

test('the eye stands in its own light and is not burned by it', () => {
  // A beam is fired out of the middle of the body that fired it, so its own centre is
  // on its own line, at along 0. Without that exclusion the kind would eat itself -
  // two beams of 6 against 12 hull - and arrive as a threat that lasted eight seconds.
  const { field, sniper } = parked(14, 1500, 1200);
  sniper.hp = STATS.hull;                 // an ordinary hull, not the armoured one parked() gives
  sniper.maxhp = STATS.hull;
  const before = field.beams.stats().spawned;

  forSeconds(20);

  assert.ok(field.beams.stats().spawned - before >= 4, 'it had every chance to fire');
  assert.ok(field.enemies.includes(sniper), 'and it is still standing there');
  assert.equal(sniper.hp, STATS.hull, 'without one scratch of its own doing');
});

test('a second sniper standing in the light is not exempt', () => {
  // The exemption above belongs to the body that fired, not to the kind: two of them
  // on one line, and the one that is standing in the way of the other's beam burns.
  const { field, sniper } = parked(15, 1500, 1200);
  const twin = makeEnemy(field, 'sniper', 1500, 2000);        // dead on the same line
  twin.hp = STATS.hull;
  twin.maxhp = STATS.hull;
  twin.timer = 1e6;                                           // it never looks up
  field.enemies.push(twin);

  until(() => twin.hp < STATS.hull, 'the beam crossed it', 5);

  assert.equal(sniper.hp, 9999, 'the eye that fired it is untouched');
  assert.ok(twin.hp <= STATS.hull - LOCK.beam.damage, 'and the one in the way lost what a beam costs');
});

test('kill it during the telegraph and nothing fires', () => {
  const { field, sniper } = parked(16, 1500, 1200);
  until(() => isLocking(sniper), 'it took a lock', 5);

  killEnemy(field, sniper, true);

  let lit = 0;
  for (let i = 0; i < Math.round(LOCK.aim.time * 4 / STEP); i++) {
    stepTheWorld();
    if (field.beams.count > 0) lit++;
  }

  assert.equal(lit, 0, 'the beam it promised never came, on any step of it');
});

test('a beam can end a run, and the sheet says what ended it', () => {
  // The fourth way the ship can lose a hull (game/tally.js): the others are a body,
  // a shot and a blast, and a run that died of light is entitled to say so.
  const { field, ship } = parked(17, 1500, 1200);
  ship.hull = 1;

  untilBeam(field);

  assert.equal(ship.hull, 0);
  assert.equal(field.state, STATE.OVER, 'and the step stopped there, the way a contact does');
  assert.equal(field.tally.killedBy, 'beam:sniper');
});

test('what a beam kills, nobody killed', () => {
  // A beam is the sniper's doing. The bodies it takes are not kills and pay nothing -
  // the same reading as a bomber's blast that nobody lit (game/blast.js).
  const { field } = parked(18, 1500, 1200);
  const victim = prop(field, 'drifter', 1500, 1400);
  const score = field.score;
  const kills = field.kills;

  until(() => !field.enemies.includes(victim), 'the beam took it', 5);

  assert.equal(field.score, score, 'no score');
  assert.equal(field.kills, kills, 'no kill');
  assert.equal(field.tally.lost, 1, 'and the balance sheet files it as a loss');
});

test('the director lands it in the player\'s window, at a distance, with some ceremony', () => {
  const field = scriptedRun(19);
  field.elapsed = 700;
  const ship = field.player;
  const rings = field.rings.count;
  const sparks = field.particles.count;

  const arrived = spawnEnemy(field, 'sniper');

  assert.ok(arrived, 'it arrived');
  assert.ok(Math.abs(arrived.x - ship.x) <= field.view.w / 2, 'inside the window, horizontally');
  assert.ok(Math.abs(arrived.y - ship.y) <= field.view.h / 2, 'and vertically');
  assert.ok(Math.hypot(arrived.x - ship.x, arrived.y - ship.y) >= STATS.inSight.min,
    'but not in the player\'s face');
  assert.ok(arrived.x > 0 && arrived.x < ARENA.w && arrived.y > 0 && arrived.y < ARENA.h,
    'and inside the arena');
  assert.ok(field.rings.count > rings && field.particles.count > sparks,
    'and it announced itself landing');
  assert.equal(arrived.timer, LOCK.wake, 'its first lock is not immediate: it was just landed');
});

test('every place it can land is somewhere it is allowed to stand', () => {
  const field = scriptedRun(20);
  field.elapsed = 700;
  const ship = field.player;

  for (let i = 0; i < 200; i++) {
    field.enemies.length = 0;
    const arrived = spawnEnemy(field, 'sniper');
    assert.ok(arrived, 'there is always somewhere on the glass');
    assert.ok(Math.abs(arrived.x - ship.x) <= field.view.w / 2
      && Math.abs(arrived.y - ship.y) <= field.view.h / 2, 'in sight');
    assert.ok(Math.hypot(arrived.x - ship.x, arrived.y - ship.y) >= STATS.inSight.min,
      'at a distance: it landed ' + Math.round(Math.hypot(arrived.x - ship.x, arrived.y - ship.y)) + ' px out');
  }
});

test('it does not arrive before ten and a half minutes, and does after', () => {
  const field = scriptedRun(21);
  assert.equal(STATS.from, 630, 'PLAN 3.3 says 10:30');

  field.elapsed = STATS.from - 30;
  const early = new Set();
  for (let i = 0; i < 600; i++) early.add(pickMember(field, Infinity));
  assert.equal(early.has('sniper'), false, 'not one of them at ten minutes');

  field.elapsed = STATS.from + 30;
  const late = new Set();
  for (let i = 0; i < 600; i++) late.add(pickMember(field, Infinity));
  assert.ok(late.has('sniper'), 'and an ordinary arrival once its turn comes');
});

test('a ship that stands on the line loses one hull a beam, and no more', () => {
  const { field, ship } = parked(22, 1500, 1200);
  let beams = 0;
  let hits = 0;

  for (let i = 0; i < Math.round(20 / STEP); i++) {
    const before = field.beams.stats().spawned;
    const was = ship.hull;
    stepTheWorld();
    if (field.beams.stats().spawned > before) beams++;
    if (ship.hull < was) hits++;
  }

  assert.ok(beams >= 4, 'it fired ' + beams + ' times in a third of a minute');
  assert.ok(hits > 0 && hits <= beams, hits + ' of those ' + beams + ' beams found it');
  assert.equal(ship.hull, 9 - hits, 'and each one that did cost exactly one hull');
});
