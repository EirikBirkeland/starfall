// The bot that plays tools/simulate.js has learned to read danger: it steps off the
// lines the game draws before it strikes, and it gives ground to the bodies that can
// actually touch it. See tools/headless/threats.js for the model; this file is the
// evidence that the model says what it claims to say.
//
// Two kinds of promise, in that order.
//
// The first interrogates `escapeDirection` about a parked world. That function only
// ever reads, so a test can put one thing in the arena, ask, and read a number out of
// the answer - no frames, no timing, no luck. Everything about *geometry* and
// *urgency* belongs here.
//
// The second lets a ship actually fly: the same scripted world, driven by the same
// answers for thirty seconds, against the same world with the ship holding still.
// That is the only way to say the boring, important sentence - it gets hit less.
//
// The driven ship does not shoot in the volley tests on purpose. A ship that kills
// the crowd is a different test, and a slower one; what is being measured is whether
// it can stand where it is not standing.
//
// One arena per process: `parked()` empties whatever the previous test left behind,
// so a test that wants two situations - a bomb here, a plain body there - measures
// one, re-parks, and measures the other. Doing it the other way round quietly puts
// both worlds in the same arena and compares a thing with itself.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { enemyShotAt } from '../src/game/enemyshots.js';
import { makeEnemy, aimProgress, blastRadius, isAiming, isLocking, isLunging, isSpitting } from '../src/game/kinds.js';
import { bossOnTheField, scriptedRun, stepTheWorld } from '../tools/headless/scripted.js';
import { armedCount, bossPhase, gapAngle } from '../src/game/bosses.js';
import { SKILL, escapeDirection } from '../tools/headless/threats.js';

const STEP = BALANCE.sim.step;
const ARENA = BALANCE.arena;
const SPIT = BALANCE.kinds.spitter.spit;
const BAND = (SPIT.range.near + SPIT.range.far) / 2;   // where a spitter likes to stand
const C = { x: ARENA.w / 2, y: ARENA.h / 2 };

/**
 * A run parked with the ship in the middle of the arena and able to be hurt - the
 * scripted world makes it immortal, and being hurt is the subject here. `hull` is
 * generous so that a test can count hits rather than be cut short by a death.
 */
function parked(hull) {
  const field = scriptedRun(3);
  const ship = field.player;
  ship.x = C.x;
  ship.y = C.y;
  ship.px = C.x;
  ship.py = C.y;
  ship.invuln = 0;
  ship.hull = hull === undefined ? 9 : hull;
  return field;
}

function at(field, type, x, y) {
  const enemy = makeEnemy(field, type, x, y);
  field.enemies.push(enemy);
  return enemy;
}

/** A spitter's shot, already in the air at (x, y) and travelling along (dx, dy). */
function shotAt(field, x, y, dx, dy) {
  return enemyShotAt(field, x, y, dx, dy, SPIT.shot);
}

/** Place `n` of a kind evenly around the ship, `radius` out. */
function ring(field, type, n, radius) {
  for (let i = 0; i < n; i++) {
    const bearing = (i / n) * Math.PI * 2;
    at(field, type, C.x + Math.cos(bearing) * radius, C.y + Math.sin(bearing) * radius);
  }
}

const unit = (v) => Math.abs(Math.hypot(v.x, v.y) - 1) < 1e-6;

function stepsIn(seconds) {
  return Math.round(seconds / STEP);
}

/**
 * Fly the ship the way the bot would for `seconds`, and answer how many times it was
 * hit. `dodge: false` holds the ship still instead, which is the control: a threat
 * model that dodges nothing would still pass every geometry test above it.
 */
function fly(field, seconds, dodge) {
  let hits = 0;
  let hull = field.player.hull;
  for (let i = 0; i < stepsIn(seconds); i++) {
    if (dodge) {
      const want = escapeDirection(field);
      const going = want.pressure >= SKILL.calm;
      stepTheWorld(going ? { moveX: want.x, moveY: want.y, moving: true } : {});
    } else {
      stepTheWorld();
    }
    if (field.player.hull < hull) { hits++; hull = field.player.hull; }
    if (field.state !== 1) break;
  }
  return hits;
}

/** Step until `now` stops being true. Bounded, so a failure fails instead of hanging. */
function until(now, what, capSeconds) {
  let seconds = 0;
  while (!now() && seconds < capSeconds) {
    stepTheWorld();
    seconds += STEP;
  }
  assert.ok(now(), 'it never happened: ' + what);
  return seconds;
}

// --- what it sees -------------------------------------------------------------------

test('an empty arena asks for nothing', () => {
  const field = parked();
  const want = escapeDirection(field);

  assert.equal(want.pressure, 0, 'nothing is out there');
  assert.equal(want.x, 0);
  assert.equal(want.y, 0);
});

test('a shot aimed straight down the ship sends it sideways', () => {
  const field = parked();
  shotAt(field, C.x - 200, C.y, 1, 0);

  const want = escapeDirection(field);

  assert.ok(want.pressure > 1, 'a shot about to land is a shout: ' + want.pressure);
  assert.ok(Math.abs(want.x) < 0.01, 'the way out of a line is off it, not along it: ' + want.x);
  assert.ok(Math.abs(want.y) > 0.99, 'straight off it: ' + want.y);
});

test('a shot that will miss is not worth a step', () => {
  const field = parked();
  shotAt(field, C.x - 200, C.y, 1, 0);
  field.player.y = C.y + 300;

  const want = escapeDirection(field);

  assert.equal(want.pressure, 0, '300 px off its line, and it is somebody else\'s problem');
  assert.equal(want.x, 0);
  assert.equal(want.y, 0);
});

test('what has gone past is history', () => {
  const field = parked();
  shotAt(field, C.x + 200, C.y, 1, 0);       // east of the ship, going east

  assert.equal(escapeDirection(field).pressure, 0, 'it is on its way to the far edge, not here');
});

test('the nearer the arrival, the louder the ask', () => {
  const field = parked();
  const shot = shotAt(field, C.x - 100, C.y, 1, 0);

  const near = escapeDirection(field).pressure;
  shot.x = C.x - 200;
  const middle = escapeDirection(field).pressure;
  shot.x = C.x - 320;
  const far = escapeDirection(field).pressure;

  assert.ok(near > middle && middle > far,
    'expected a falling curve, got ' + [near, middle, far].map((v) => v.toFixed(2)).join(' > '));
});

test('stepping off a line means getting clear of it, not merely off it', () => {
  // `shotRoom` is where the ship starts to mind; `shotClear` is where it stops. In
  // between it keeps moving, because a ship that stopped the instant it technically
  // missed would be standing on the same line when the next shot was aimed.
  const field = parked();
  shotAt(field, C.x - 200, C.y, 1, 0);
  const deadOn = escapeDirection(field).pressure;

  field.player.y = C.y + 60;
  const inside = escapeDirection(field);
  assert.ok(inside.pressure > 0, '60 px off the line is still on it, so it keeps going');
  assert.ok(inside.pressure < deadOn, 'but more gently the further out it already is');
  assert.ok(unit(inside), 'and at full stride: ' + JSON.stringify(inside));
  assert.ok(inside.y > 0, 'and away from the line, not back across it: ' + inside.y);

  field.player.y = C.y - 60;
  assert.ok(escapeDirection(field).y < 0, 'the other side of it and the dodge is that way');

  field.player.y = C.y + 110;
  assert.equal(escapeDirection(field).pressure, 0, 'clear by then');
});

test('dead on a line, it picks the side it was already heading for', () => {
  const field = parked();
  shotAt(field, C.x - 200, C.y, 1, 0);

  field.player.vy = -100;
  assert.ok(escapeDirection(field).y < 0, 'it was sliding north, so it finishes going north');
  field.player.vy = 100;
  assert.ok(escapeDirection(field).y > 0, 'and south if it was sliding south');
});

test('dead on a line and standing still, it steps toward the middle of the world', () => {
  // Picking the other side here is the dodge that ends with the ship against the edge
  // of the arena and nowhere further to go.
  const field = parked();
  field.player.y = C.y + 700;             // south of the middle, so north is inward
  shotAt(field, C.x - 200, C.y + 700, 1, 0);
  assert.ok(escapeDirection(field).y < 0, 'it went north, into the arena');

  field.player.y = C.y - 700;
  shotAt(field, C.x - 200, C.y - 700, 1, 0);
  assert.ok(escapeDirection(field).y > 0, 'and south from the other side of it');
});

test('a body that can touch the ship is worth a step directly away from it', () => {
  const field = parked();
  const drifter = at(field, 'drifter', C.x - 60, C.y);

  const want = escapeDirection(field);

  assert.ok(want.x > 0.99, 'due east of the thing walking at it: ' + want.x);
  assert.ok(Math.abs(want.y) < 0.01);

  // And it is the ship's own opinion of its personal space that decides, not the
  // distance this test happened to pick.
  const air = drifter.r + field.player.r + SKILL.personalSpace;
  field.player.x = C.x - 60 + air - 1;
  assert.ok(escapeDirection(field).pressure > 0, 'one px inside it and it is felt');
  field.player.x = C.x - 60 + air + 1;
  assert.equal(escapeDirection(field).pressure, 0, 'one px outside it and it is not');
});

test('a body too far away to hurt is ignored', () => {
  const field = parked();
  at(field, 'drifter', C.x + 400, C.y);

  assert.equal(escapeDirection(field).pressure, 0);
});

test('a darter that has already gone past is nobody to fear', () => {
  // The lunge is a line, and a line only threatens what is down it. The ship behind
  // the darter, on the far side of it, is out of the story it is telling.
  const field = parked();
  const darter = at(field, 'darter', C.x - 200, C.y);
  until(() => isLunging(darter), 'the darter committed', 10);

  field.player.x = darter.x - 300;          // behind it, off the end of the world it is heading for
  field.player.y = C.y;

  assert.equal(escapeDirection(field).pressure, 0, 'it is going away at 5x its walking pace and it does not care');
});

test('a darter can only threaten what its lunge can actually reach', () => {
  // The line is not infinite: it is `lungeReach` long, and standing 400 px away from
  // something whose lunge is 243 px is not a threat, it is an afternoon.
  const field = parked();
  const darter = at(field, 'darter', C.x - 400, C.y);
  until(() => isAiming(darter), 'the darter stopped to take aim', 10);

  assert.equal(escapeDirection(field).pressure, 0, 'too far for the line it is holding');

  field.player.x = darter.x + 200;          // still on the line it locked, just within reach now
  assert.ok(escapeDirection(field).pressure > 0, 'and now it is on it');
});

test('a darter with no speed has nowhere to lunge, so it threatens nothing', () => {
  // Parked enemies cannot walk, and a darter that cannot walk has no lunge in it -
  // the line it appears to hold is a promise it cannot keep, and the bot is not owed
  // a step aside for it. The game's own `lungeReach` is a balance constant and does
  // not know the difference, so this is where that gets settled.
  const field = parked();
  const darter = at(field, 'darter', C.x - 200, C.y);
  darter.speed = 0;
  until(() => isAiming(darter), 'the darter took aim', 10);

  assert.equal(escapeDirection(field).pressure, 0, 'a darter that cannot move is not a threat');
});

test('asking is free: it reads the world and leaves it alone', () => {
  const field = parked();
  ring(field, 'spitter', 3, BAND);
  shotAt(field, C.x - 180, C.y + 20, 1, 0);
  const before = JSON.stringify({
    ship: field.player, enemies: field.enemies, shots: field.enemyShots.items,
  });

  const once = escapeDirection(field);
  const twice = escapeDirection(field);

  assert.deepEqual(twice, once, 'the same moment answered twice is the same answer');
  assert.equal(JSON.stringify({
    ship: field.player, enemies: field.enemies, shots: field.enemyShots.items,
  }), before, 'and asking did not touch any of it');
});

// --- what it reads on the enemy's side ----------------------------------------------

test('a darter taking aim is answered while there is still time', () => {
  const field = parked();
  const darter = at(field, 'darter', C.x - 200, C.y);
  until(() => isAiming(darter), 'the darter stopped to take aim', 10);

  const want = escapeDirection(field);
  const along = want.x * darter.dirX + want.y * darter.dirY;

  assert.ok(Math.abs(along) < 1e-6,
    'the answer is across the line it is holding, not along it: ' + along);
  assert.ok(want.pressure > 0, 'and it is being asked at all');

  const early = want.pressure;
  until(() => aimProgress(darter) > 0.9, 'the aim nearly finished', 5);
  assert.ok(escapeDirection(field).pressure > early,
    'and it gets louder as the darter finishes lining up');
});

test('a darter aiming at empty sky asks for nothing', () => {
  const field = parked();
  const darter = at(field, 'darter', C.x - 200, C.y);
  until(() => isAiming(darter), 'the darter stopped to take aim', 10);

  field.player.y = C.y + 200;             // off the line it locked, before the lunge

  assert.equal(escapeDirection(field).pressure, 0);
});

test('a darter already committed is louder than one still aiming', () => {
  const field = parked();
  const darter = at(field, 'darter', C.x - 200, C.y);
  until(() => isAiming(darter), 'the darter stopped to take aim', 10);
  const whileAiming = escapeDirection(field).pressure;
  until(() => isLunging(darter), 'the darter committed', 10);
  field.player.x = C.x;
  field.player.y = C.y;

  assert.ok(escapeDirection(field).pressure > whileAiming,
    'the moment it is coming is the moment to be moving');
});

test('a spitter mid-breath is answered before it has even fired', () => {
  const field = parked();
  const spitter = at(field, 'spitter', C.x + BAND, C.y);
  until(() => isSpitting(spitter), 'the spitter started a spit', 10);

  assert.equal(field.enemyShots.count, 0, 'nothing has left its mouth yet');
  const want = escapeDirection(field);
  const along = want.x * spitter.dirX + want.y * spitter.dirY;
  assert.ok(Math.abs(along) < 1e-6, 'off the line it has already chosen: ' + along);
  assert.ok(want.pressure > 0);
});

test('a ship the spitter is not lined up with is not in its mind', () => {
  const field = parked();
  const spitter = at(field, 'spitter', C.x + BAND, C.y);
  until(() => isSpitting(spitter), 'the spitter started a spit', 10);

  field.player.y = C.y + 220;

  assert.equal(escapeDirection(field).pressure, 0);
});

test('the circle a bomber stands in is a threat the bot keeps out of', () => {
  const field = parked();
  const bomber = at(field, 'bomber', C.x - 90, C.y);
  bomber.speed = 0;                       // it is the circle that matters here, not the walk
  const radius = blastRadius(bomber);

  const want = escapeDirection(field);
  assert.ok(want.x > 0.99, 'due east out of the circle: ' + want.x);
  assert.ok(want.pressure > 1, 'the ring is a say of its own, above an ordinary body: ' + want.pressure);

  // The margin outside the drawn ring. For a bomber it sits inside the air the ship
  // keeps around any body, so what it buys is weight here, not distance - and weight
  // is what the next two numbers measure.
  const edge = parked();
  at(edge, 'bomber', C.x - (radius + SKILL.blastRoom * 0.5), C.y).speed = 0;
  assert.ok(escapeDirection(edge).pressure > 1, 'just outside the ring and still worth minding');

  const far = parked();
  const out = Math.max(radius + SKILL.blastRoom,
    BALANCE.kinds.bomber.radius + field.player.r + SKILL.personalSpace) + 1;
  at(far, 'bomber', C.x - out, C.y).speed = 0;
  assert.equal(escapeDirection(far).pressure, 0, 'past the ring, its margin and the ship\'s own air, and it is nothing');
});

test('a wounded bomber is more urgent than a whole one', () => {
  const field = parked();
  const bomber = at(field, 'bomber', C.x - 90, C.y);
  bomber.speed = 0;
  const whole = escapeDirection(field).pressure;

  bomber.hp = Math.ceil(bomber.maxhp * BALANCE.kinds.bomber.blast.arm * 0.5);
  const wounded = escapeDirection(field).pressure;

  assert.ok(wounded > whole, 'it is about to be on its way into you: ' + whole + ' then ' + wounded);
});

test('a bomber inside its own ring is worth more than an ordinary body at the same distance', () => {
  // The one thing the ring rule adds over simply minding the body: a drifter at 90 px
  // and a bomber at 90 px push the ship the same way, and only one of them is a bomb.
  // Measured one at a time because a process holds one arena, and parking a second
  // world is the same arena emptied.
  const bomb = parked();
  at(bomb, 'bomber', C.x - 90, C.y).speed = 0;
  const loud = escapeDirection(bomb).pressure;

  const plain = parked();
  at(plain, 'drifter', C.x - 90, C.y).speed = 0;
  const quiet = escapeDirection(plain).pressure;

  assert.ok(loud > quiet * 1.5,
    'the bomb asks louder than the body: ' + loud + ' against ' + quiet);
});

test('a dodge is not an invitation to run into the edge of the world', () => {
  // A body walking the ship towards the west wall: the wall gets a say, and it wins,
  // because a ship pinned on the edge has nowhere further to go.
  const wall = parked();
  wall.player.x = 40;
  at(wall, 'drifter', 150, wall.player.y);
  assert.ok(escapeDirection(wall).x > 0, 'it gave ground east, away from the edge');

  const middle = parked();
  at(middle, 'drifter', middle.player.x + 110, middle.player.y);
  assert.ok(escapeDirection(middle).x < 0, 'the same body in open ground and it runs the other way');
});

// --- and does it actually work ------------------------------------------------------

test('a volley aimed at the ship misses a ship that moves', () => {
  const dodging = parked();
  ring(dodging, 'spitter', 2, BAND);
  const hits = fly(dodging, 30, true);

  const still = parked();
  ring(still, 'spitter', 2, BAND);
  const took = fly(still, 30, false);

  assert.equal(hits, 0, 'the dodging ship was hit ' + hits + ' times in half a minute of volleys');
  assert.ok(took >= 3, 'the one that held still was hit only ' + took + ' times');
});

test('three spitters, and a ship that moves is still untouched', () => {
  const dodging = parked();
  ring(dodging, 'spitter', 3, BAND);
  assert.equal(fly(dodging, 30, true), 0);
});

test('a knot of darters lunges at a ship that is not there', () => {
  const dodging = parked();
  ring(dodging, 'darter', 3, 260);
  const still = parked();
  ring(still, 'darter', 3, 260);

  const hits = fly(dodging, 30, true);
  const took = fly(still, 30, false);

  assert.ok(hits <= 2, 'the dodging ship was hit ' + hits + ' times');
  assert.ok(took >= 5, 'the still one was hit only ' + took + ' times');
});

test('weavers come at a ship that moved, not the one that did not', () => {
  const dodging = parked();
  ring(dodging, 'weaver', 5, 200);
  const still = parked();
  ring(still, 'weaver', 5, 200);

  assert.ok(fly(dodging, 30, true) < fly(still, 30, false));
});

test('the ship leaves the circle it was shown', () => {
  const field = parked();
  const bomber = at(field, 'bomber', C.x - 90, C.y);
  bomber.speed = 0;
  const radius = blastRadius(bomber);

  fly(field, 2, true);
  const out = Math.hypot(field.player.x - bomber.x, field.player.y - bomber.y);

  assert.ok(out > radius, 'it stood ' + Math.round(out) + ' px from a bomb of ' + radius + ' px');

  const still = parked();
  const same = at(still, 'bomber', C.x - 90, C.y);
  same.speed = 0;
  fly(still, 2, false);
  assert.ok(Math.hypot(still.player.x - same.x, still.player.y - same.y) < radius,
    'and the ship that stayed is still standing in it');
});

// --- the band a sniper holds across the arena ---------------------------------------

/**
 * PLAN 3.3's last body: it stands still and locks a laser down a line that crosses the
 * whole world. Everything the bot needs is in one fact - the band was chosen when the
 * lock closed, and the only defence is not to be standing on it when the light arrives.
 * So it is read as a line with no ends: how far down it the ship happens to stand buys
 * nothing, the width it has to be clear of is the game's own `beamHalfWidth`, and the
 * whole of the urgency is the countdown the band is drawn bright by.
 */
function lockHeld(shipX, shipY) {
  const field = parked(9);
  const sniper = at(field, 'sniper', C.x, C.y - 500);
  sniper.timer = 0;
  stepTheWorld();                         // the step on which it decides to look
  assert.ok(isLocking(sniper), 'it locked');
  field.player.x = shipX;
  field.player.y = shipY;                 // moved after the lock closed, so it cannot be followed
  return { field: field, sniper: sniper };
}

test('a band is answered sideways, and answered at either end of it', () => {
  // Standing north of the eye, on the line extended backwards: the beam goes that way
  // too, and a bot that thought of it as a lunge would stand there feeling safe.
  const { field } = lockHeld(C.x, C.y - 900);
  const want = escapeDirection(field);

  assert.ok(want.pressure > 0.5, 'behind the eye is on the band all the same');
  assert.ok(Math.abs(want.x) > 0.9 && Math.abs(want.y) < 0.2,
    'and the way off it is sideways, across the band: ' + want.x.toFixed(2) + ',' + want.y.toFixed(2));
});

test('the band is answered for the width that hurts, and for a room to stand in', () => {
  const HALF = BALANCE.kinds.sniper.lock.beam.halfWidth;
  const { field } = lockHeld(C.x, C.y - 1300);      // 800 px down the line, out of reach of its body
  const ship = field.player;
  const room = HALF + ship.r + SKILL.beamRoom;
  const clear = room + SKILL.beamClear;

  const on = escapeDirection(field).pressure;
  ship.x = C.x + room;
  const edge = escapeDirection(field).pressure;
  ship.x = C.x + (room + clear) / 2;
  const halfway = escapeDirection(field).pressure;
  ship.x = C.x + clear + 1;
  const past = escapeDirection(field).pressure;

  assert.ok(on > 0.5 && edge > on * 0.9, 'a ship at the room is as much in it as one on the axis');
  assert.ok(halfway < edge && halfway > 0, 'and it eases out across the clear');
  assert.equal(past, 0, 'and once it is clear the band asks nothing of it');
});

test('the band gets louder the closer the lock is to firing', () => {
  const { field, sniper } = lockHeld(C.x, C.y - 1300);
  const early = escapeDirection(field).pressure;

  sniper.timer = BALANCE.kinds.sniper.lock.aim.time * 0.02;
  const late = escapeDirection(field).pressure;

  assert.ok(aimProgress(sniper) > 0.95, 'the same countdown the player is shown');
  assert.ok(late > early, early.toFixed(3) + ' at the start of a lock, ' + late.toFixed(3) + ' at the end');
});

test('two snipers fire at a ship that is not where they were aimed', () => {
  // The whole case for the dodge, played out: two emplacements crossing the arena, one
  // ship that reads them and one that does not. Forty seconds, because a sniper's cycle
  // is slow and a short window would flatter nothing.
  const dodging = parked(9);
  at(dodging, 'sniper', C.x, C.y - 600);
  at(dodging, 'sniper', C.x + 700, C.y);
  const took = fly(dodging, 40, true);

  const still = parked(9);
  at(still, 'sniper', C.x, C.y - 600);
  at(still, 'sniper', C.x + 700, C.y);
  const hit = fly(still, 40, false);

  assert.equal(took, 0, 'the ship that moved was touched ' + took + ' times in two thirds of a minute');
  assert.ok(hit >= 5, 'the one that stood there took ' + hit + ', and would have taken more');
});

test('a door a boss is lighting is a place the bot wants to stand', () => {
  // The one ask in the file that pulls instead of pushing (tools/headless/threats.js
  // `intoTheDoor`), and it earns its place the same way every other one does: the wedge is on the
  // glass, so a player who reads it is doing exactly this and for the same reason.
  const field = parked();
  const boss = bossOnTheField();
  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[1] * 0.99;
  let guard = 0;
  while (armedCount(boss) === 0 && guard < 1500) { stepTheWorld(); guard++; }
  assert.ok(armedCount(boss) > 0, 'phase 2 never armed a ring');
  assert.equal(bossPhase(boss), 2);

  // Stand the ring in the middle of the world and ask about the door alone: nothing else within
  // `wallRoom` of the ship, no crowd, and the ring itself further than its own personal space.
  const enemy = boss.enemy;
  enemy.x = C.x; enemy.y = C.y; enemy.px = C.x; enemy.py = C.y;
  const ship = field.player;
  const place = (bearing) => {
    ship.x = C.x + Math.cos(bearing) * 300;
    ship.y = C.y + Math.sin(bearing) * 300;
    ship.px = ship.x; ship.py = ship.y;
  };

  place(gapAngle(boss) + Math.PI);          // as far out of the door as it is possible to be
  const want = escapeDirection(field);
  const out = { x: (ship.x - C.x) / 300, y: (ship.y - C.y) / 300 };
  const along = want.x * out.x + want.y * out.y;
  const round = Math.abs(-want.x * out.y + want.y * out.x);
  assert.ok(want.pressure > 0.1, 'the door asked nothing of a ship standing outside it');
  assert.ok(round > 0.5, 'it did not start going round the ring: ' + JSON.stringify(want));
  assert.ok(Math.abs(along) < 0.4, 'it ran in or out, which is not how you cross onto a wedge');

  // And a ship already in the door is left alone: the door is not a threat to dodge, and while
  // the ring is arming there is nothing else out there saying anything at all.
  place(gapAngle(boss));
  const calm = escapeDirection(field);
  assert.ok(calm.pressure < 0.01, 'a ship standing in the door was being shoved: ' + calm.pressure);
});
