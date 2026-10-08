// Tether (PLAN 3.2's tether, as an upgrade line): a dash ties a line of light from the place it left
// to the ship, and everything standing on that line for two seconds is burned and thrown off it.
//
// What these tests are mostly about is the geometry - a *line* is the one damage shape in the deck
// that is not a circle round the ship - and the five promises game/tether.js makes about it: that a
// thread is a place and not a body, that its far end is where the dash began and its near end is the
// ship wherever it gets to, that a rank is another thread and not a heavier pulse, that the whole fan
// pulses as one and never spends a pulse on nothing, and that what it does to a body is hull and a
// shove off the line and never anything at all to the ship that tied it.
//
//   the tie: `rank` knots down the streak the dash covered, at the moment the dash was granted, and
//     none at all for a run that has not taken the line; the fan lives `life` seconds and then lets
//     go by itself; a second dash reties it and whatever was tied is gone;
//   the geometry: a body is on a thread when it stands within `reach` of the *line* - measured to its
//     own skin, and to the line and not past its ends, so the ground beyond a knot and the ground
//     past the ship are both out; a rank buys ground off to the side, not weight on the middle;
//   the pulse: one shot of the ship's own gun times the line's weight, once per `beat` for the whole
//     fan, once and only once per body however many threads overlap under it, and not at all - and
//     not spent - when nothing stands on the light;
//   and who it is done to: never the ship, always the crowd, always with the frost and the fire any
//     other shell of this gun leaves behind, and always thrown clear of the line rather than slowed.
//
// The scripted world's ship starts in the middle of the arena and points due north, so a dash with a
// held north goes 220 px due north and every distance here is read off where the knots and the ship
// actually ended up rather than off a number the test invented.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { logic } from '../src/core/rng.js';
import { resetRun } from '../src/game/run.js';
import { damageEnemy } from '../src/game/enemies.js';
import { hasTether, lettingGoOf, pulsingBy } from '../src/game/tether.js';
import { cordsOf, effectOf, gainOf } from '../src/game/upgrades.js';
import { scriptedRun, enemyAt, stepTheWorld, flyFor } from '../tools/headless/scripted.js';

const TETHER = BALANCE.upgrades.tether;
const DASH = BALANCE.player.dash;
const GUN = BALANCE.bullets;
const STEP = BALANCE.sim.step;
const IMMORTAL = 1e9;

/** What one body on a thread loses to one pulse, on a plain gun with no damage ranks. */
function bite() {
  return GUN.damage * TETHER.weight;
}

function marked(body) {
  body.hpBefore = body.hp;
  return body;
}

function hullGone(body) {
  return body.hpBefore - body.hp;
}

/** A run wearing `rank` ranks of the line and nothing else, with no levels to be had. */
function wearing(rank) {
  const field = scriptedRun(900 + rank);
  field.xpNeed = Infinity;
  field.upgrades.tether = rank;
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

/**
 * Dash due north, the whole 220 px of it, and hand back the ship's place when it finished. The dash
 * is 12 steps of the fixed clock, and holding the direction through all of them is what a player
 * does - the direction held is the direction the dash goes (game/player.js `dashDirection`).
 */
function dashNorth(field) {
  const ship = field.player;
  const from = { x: ship.x, y: ship.y };
  flyFor(DASH.time + STEP, { moveX: 0, moveY: -1, moving: true, dash: true });
  for (let i = 0; i < 3; i++) stepTheWorld({ moveX: 0, moveY: -1, moving: true });
  return from;
}

/** The knots the last dash tied, nearest to the ship's dash end last. */
function knots(field) {
  return field.tether.cords.items.slice(0, field.tether.cords.count);
}

/**
 * Stand a body at (x, y), holding it there through every step that follows.
 */
function planted(field, x, y, hp) {
  const body = marked(enemyAt('drifter', x, y, hp === undefined ? IMMORTAL : hp));
  return pin(body);
}

/** Hold whatever is already standing where it is, through every step that follows. */
function pin(body) {
  body.anchor = { x: body.x, y: body.y };
  return body;
}

/** Hold a list of bodies still, whatever the tether throws into them. */
function holding(bodies) {
  return (field) => {
    for (const body of bodies) {
      body.x = body.anchor.x;
      body.y = body.anchor.y;
      body.px = body.x;
      body.py = body.y;
      body.ix = 0;
      body.iy = 0;
    }
  };
}

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** How far a point stands off the line through two points, ignoring its ends. */
function offLine(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const span = Math.hypot(dx, dy) || 1;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / span;
}

/**
 * The unit normal of the line through two points, and the point `distance` off that line from a place
 * on it. The threads are not axis-aligned - a ship dashes one way and then flies another - so every
 * distance off one is measured along its own normal and not off a coordinate.
 */
function normalOf(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const span = Math.hypot(dx, dy) || 1;
  return { x: -dy / span, y: dx / span };
}

function offTheLine(p, normal, distance) {
  return { x: p.x + normal.x * distance, y: p.y + normal.y * distance };
}

/**
 * Tie a tether, let the ship brake to a stop, and park it: after this the threads do not move, so a
 * body can be put on one and left there. The tether's own clock is held open for the measurement -
 * the same door test/mines.test.mjs holds a mine's fuse open through, and the drawing readings are
 * tested for honesty separately.
 */
function tiedAndStill(rank, seconds) {
  const field = wearing(rank);
  dashNorth(field);
  // Fly east, off the line the dash laid, so the fan opens: a ship flying straight drags one thread
  // along its own wake and a ship that turns sweeps a lane (game/tether.js).
  flyFor(seconds === undefined ? 1.2 : seconds, { moveX: 1, moveY: 0, moving: true });
  runFor(field, 0.2);                       // brakes to a stop
  field.tether.live = 60;                   // and the measurement outlives two seconds
  return field;
}

test('the card prints what the line is: one more thread tied, per rank', () => {
  assert.equal(effectOf('tether'), '+1 thread tied');
  const field = wearing(0);
  assert.equal(cordsOf(field), 0, 'and a build with no ranks ties nothing');
  assert.equal(cordsOf(wearing(3)), 3 * TETHER.step, 'and three ranks is three of them');
  assert.throws(() => gainOf(field, 'tether'), /not a line of shares/,
    'and it is a line of whole things, so nobody can ask it for a multiplier');
});

test('rank 0 is not a tether that does nothing, it is no tether at all', () => {
  const field = wearing(0);
  assert.equal(hasTether(field), false);
  const due = dashNorth(field);
  const body = planted(field, field.player.x, field.player.y - 100);

  assert.equal(hasTether(field), false);
  assert.equal(field.tether.tied, 0, 'the dash tied nothing');
  assert.equal(field.tether.cords.count, 0, 'and there is nothing in the arena');
  runFor(field, TETHER.life * 2);
  assert.equal(field.tether.pulses, 0, 'and nothing pulsed');
  assert.equal(hullGone(body), 0, 'and nothing was hurt');
  assert.ok(due.y > field.player.y, 'the dash did happen, though');
});

test('a dash ties its knots down the streak it covered, one per rank', () => {
  const field = wearing(3);
  const from = dashNorth(field);
  const line = knots(field);

  assert.equal(field.tether.tied, 1, 'one tether, tied by one dash');
  assert.equal(line.length, 3 * TETHER.step, 'one knot per rank');
  assert.ok(field.tether.live > TETHER.life - 0.3,
    'live for PLAN\'s two seconds from the dash that tied it: ' + field.tether.live.toFixed(2));

  const gap = DASH.distance / line.length;
  // A knot is driven in on the step the dash reaches it, so each one sits up to one step's travel
  // (18 px of a 220 px dash) further along than the plan it was laid out on. That is the honest shape
  // of it: a dash that hits a wall ties the knots it actually got to.
  const slop = DASH.distance / (DASH.time / STEP) + 1;
  assert.ok(Math.abs((from.y - line[0].y)) < slop, 'the first of them is where the dash began');
  for (let i = 1; i < line.length; i++) {
    assert.ok(Math.abs((line[i - 1].y - line[i].y) - gap) < slop,
      'knot ' + i + ' sits one gap down the streak: ' + (line[i - 1].y - line[i].y));
  }
  assert.ok(field.player.y < line[0].y - (DASH.distance - gap),
    'and none of them is standing on the ship, which has moved on');
});

test('the tether lives its two seconds and lets go by itself', () => {
  const field = wearing(2);
  dashNorth(field);
  const on = planted(field, mid(knots(field)[0], field.player).x, mid(knots(field)[0], field.player).y);
  assert.ok(offLine(on, knots(field)[0], field.player) < TETHER.reach, 'it is standing on a thread');

  runFor(field, TETHER.life - 0.6, holding([on]));
  assert.ok(hullGone(on) > 0, 'and it has been paying for it');
  assert.ok(field.tether.cords.count > 0, 'while it lasted the knots were there');

  runFor(field, 0.6, holding([on]));
  assert.equal(field.tether.cords.count, 0, 'then they were gone');
  assert.ok(field.tether.live <= 0, 'and the clock is spent');

  const before = hullGone(on);
  runFor(field, 1, holding([on]));
  assert.equal(hullGone(on), before, 'and nothing happens on a road that is no longer lit');
});

test('a second dash reties the tether, and what was tied is simply gone', () => {
  const field = wearing(2);
  dashNorth(field);
  const first = knots(field).map((cord) => ({ x: cord.x, y: cord.y }));
  runFor(field, 0.4);
  assert.ok(field.tether.live > 0, 'the first tether is still live when the second dash comes');

  field.player.dashCd = 0;                     // the cooldown is not what this test is about
  flyFor(DASH.time + STEP, { moveX: 1, moveY: 0, moving: true, dash: true });
  const second = knots(field);

  assert.equal(field.tether.tied, 2, 'two tethers have been tied over the run');
  assert.equal(second.length, 2 * TETHER.step, 'and only the second one is standing');
  for (const cord of second) {
    assert.equal(first.some((old) => old.x === cord.x && old.y === cord.y), false,
      'not one knot of the first fan is left in the arena');
  }
  assert.ok(field.tether.live > TETHER.life - 0.3, 'and its clock started again: ' + field.tether.live);
});

test('the far end is where the dash began and the near end is the ship', () => {
  const field = tiedAndStill(1);
  const cord = knots(field)[0];
  const ship = field.player;

  const on = planted(field, mid(cord, ship).x, mid(cord, ship).y);
  const past = planted(field, cord.x - (ship.x - cord.x), cord.y - (ship.y - cord.y));
  const behind = planted(field, ship.x + (ship.x - cord.x), ship.y + (ship.y - cord.y));
  assert.ok(offLine(past, cord, ship) < 1, 'the one beyond the knot is in line with the thread');
  assert.ok(offLine(behind, cord, ship) < 1, 'and so is the one beyond the ship');

  runFor(field, TETHER.beat * 2.5, holding([on, past, behind]));
  assert.ok(hullGone(on) > 0, 'what stands on the thread pays');
  assert.equal(hullGone(past), 0, 'and what stands past its end does not: a thread is a road and not a ray');
  assert.equal(hullGone(behind), 0, 'nor does what stands past the ship');
});

test('the band is the road it burns, and one px off it is off it', () => {
  const field = tiedAndStill(1);
  const cord = knots(field)[0];
  const ship = field.player;
  const middle = mid(cord, ship);
  const normal = normalOf(cord, ship);

  // Half a px inside the band and half a px outside it, measured along the thread's own normal - the
  // reach is measured to a body's skin, exactly as every other reach in the game is.
  const inside = planted(field, middle.x, middle.y);
  inside.anchor = offTheLine(middle, normal, TETHER.reach + inside.r - 0.5);
  inside.x = inside.anchor.x;
  inside.y = inside.anchor.y;
  const outside = planted(field, middle.x, middle.y);
  outside.anchor = offTheLine(middle, normal, TETHER.reach + outside.r + 0.5);
  outside.x = outside.anchor.x;
  outside.y = outside.anchor.y;
  assert.ok(Math.abs(offLine(inside, cord, ship) - (TETHER.reach + inside.r - 0.5)) < 0.01,
    'half a px inside the band: ' + offLine(inside, cord, ship));
  assert.ok(Math.abs(offLine(outside, cord, ship) - (TETHER.reach + outside.r + 0.5)) < 0.01,
    'and half a px outside it: ' + offLine(outside, cord, ship));

  runFor(field, TETHER.beat * 2.5, holding([inside, outside]));
  assert.ok(hullGone(inside) > 0, 'the one whose skin touches the light pays');
  assert.equal(hullGone(outside), 0, 'and the one a hair further off does not');
});

test('a pulse takes one shot of the ship\'s own gun, times its weight, on the beat', () => {
  const field = tiedAndStill(1);
  const cord = knots(field)[0];
  const body = planted(field, mid(cord, field.player).x, mid(cord, field.player).y);
  const expected = bite() * gainOf(field, 'damage');

  field.tether.cool = 0;
  step(field, holding([body]));
  assert.ok(Math.abs(hullGone(body) - expected) < 1e-6,
    'one pulse: lost ' + hullGone(body) + ' where a shot, the damage line and the weight say ' + expected);

  body.hpBefore = body.hp;
  const beats = 4;
  runFor(field, TETHER.beat * beats, holding([body]));
  assert.ok(Math.abs(hullGone(body) - expected * beats) < expected * 0.01 + 1e-6,
    'and ' + beats + ' pulses in ' + beats + ' beats, no more: ' + hullGone(body));
});

test('a rank is more threads and not heavier ones', () => {
  const readings = [];
  for (const rank of [1, 5]) {
    const field = tiedAndStill(rank);
    const cord = knots(field)[0];                       // the knot rank 1 also has
    const body = planted(field, mid(cord, field.player).x, mid(cord, field.player).y);
    field.tether.cool = 0;
    runFor(field, TETHER.beat * 2.5, holding([body]));
    readings.push(hullGone(body));
  }

  assert.ok(readings[0] > 0, 'the thread bit at both ranks');
  assert.ok(Math.abs(readings[0] - readings[1]) < 1e-9,
    'exactly the same: ' + readings[0] + ' against ' + readings[1]
    + ' - a body under five overlapping threads pays one pulse, not five');
});

test('a rank is a fan: the outer threads reach ground the middle one never does', () => {
  // The middle of the thread from the *far* knot, and the middle of the thread from the knot closest to
  // where the dash ended. They are half the knot spacing apart, which is a long way outside the band,
  // so the second one is ground only a fan can reach.
  const readings = [];
  for (const rank of [1, 5]) {
    const field = tiedAndStill(rank);
    const line = knots(field);
    const ship = field.player;
    // The middle of the thread from the dash's own knot, and the middle of the thread from the knot a
    // rank-five fan ties nearest the end of the dash - one gap short of where the ship stopped. That
    // second place is a fixed point in the arena, whatever ranks tied anything, which is what makes the
    // two ranks comparable: at rank 1 the light simply never reaches it.
    const start = line[0];
    const nearKnot = { x: start.x, y: start.y - DASH.distance * 4 / 5 };
    const onFar = planted(field, mid(start, ship).x, mid(start, ship).y);
    const onNear = planted(field, mid(nearKnot, ship).x, mid(nearKnot, ship).y);
    assert.ok(offLine(onNear, start, ship) > TETHER.reach + onNear.r,
      'and that place really is off the thread a rank-1 ship has: '
      + offLine(onNear, start, ship).toFixed(1));
    assert.ok(offLine(onFar, start, ship) < 0.01, 'while the first one is on it');
    runFor(field, TETHER.beat * 2.5, holding([onFar, onNear]));
    readings.push({ far: hullGone(onFar), near: hullGone(onNear) });
  }

  assert.ok(readings[0].far > 0 && readings[1].far > 0, 'both ranks burn the middle of the wake');
  assert.equal(readings[0].near, 0, 'and a single thread burns nothing off it');
  assert.ok(readings[1].near > 0, 'while four more threads reach the crowd beside the road');
});

test('a pulse is not spent on nothing, and is ready the moment something arrives', () => {
  const field = tiedAndStill(2);
  runFor(field, TETHER.beat * 4);
  assert.equal(field.tether.pulses, 0, 'nothing on the light, so nothing was paid out');
  assert.equal(field.tether.cool, 0, 'and the beat was not spent waiting for a body');

  const cord = knots(field)[0];
  const body = planted(field, mid(cord, field.player).x, mid(cord, field.player).y);
  step(field, holding([body]));
  assert.equal(field.tether.pulses, 1, 'the first body to arrive is bitten on the step it arrives');
  assert.ok(hullGone(body) > 0);
});

test('what it does to a body is hull and a shove off the line, never its walk', () => {
  const field = tiedAndStill(1);
  const cord = knots(field)[0];
  const ship = field.player;
  const middle = mid(cord, ship);
  const normal = normalOf(cord, ship);
  const at = offTheLine(middle, normal, TETHER.reach * 0.5);
  const body = planted(field, at.x, at.y);
  const walk = body.speed;

  field.tether.cool = 0;
  step(field, holding([body]));
  assert.ok(hullGone(body) > 0, 'it hurt it');
  assert.equal(body.speed, walk, 'and took nothing off the pace it walks at');
  assert.ok(Math.abs(body.ix) + Math.abs(body.iy) > 0, 'it was thrown off the line');
  assert.ok(body.ix * normal.x + body.iy * normal.y > 0,
    'off the line it stood at, which is the only direction a thread has to throw with');
});

test('a body standing dead on the axis has no side to be thrown to, and is left where it is', () => {
  const field = tiedAndStill(1);
  const cord = knots(field)[0];
  const body = planted(field, mid(cord, field.player).x, mid(cord, field.player).y);

  field.tether.cool = 0;
  step(field, holding([body]));
  assert.ok(hullGone(body) > 0, 'it was still burned');
  assert.equal(body.ix, 0, 'and not shoved, because there is nothing to shove it away from');
});

test('it never hurts the ship that tied it, whatever the ship is standing on', () => {
  const field = wearing(5);
  const ship = field.player;
  ship.invuln = 0;
  const hull = ship.hull;

  dashNorth(field);
  const on = planted(field, field.player.x, field.player.y - 40);
  runFor(field, TETHER.life + 0.5, holding([on]));
  assert.ok(field.tether.pulses > 1, 'the fan pulsed while the ship was standing at the end of it');
  assert.ok(hullGone(on) > 0, 'and what it does to the crowd it did');
  assert.equal(ship.hull, hull, 'and the ship paid nothing for any of it');
});

test('a thread is a place and not a body: nothing can cut one', () => {
  const field = tiedAndStill(2);
  const cord = knots(field)[0];
  const bomber = marked(enemyAt('bomber', mid(cord, field.player).x, mid(cord, field.player).y, 4));
  const standing = field.tether.cords.count;
  const live = field.tether.live;

  damageEnemy(field, bomber, 1e6, true);
  assert.ok(bomber.hp <= 0, 'a bomber came apart on the thread - the biggest thing that goes off here');
  runFor(field, 0.3);
  assert.equal(field.tether.cords.count, standing, 'and the thread is still tied');
  assert.ok(Math.abs(field.tether.live - live) > 0, 'on the clock it was already running, and no other');
});

test('a body the light brings down is the run\'s own kill, score and all', () => {
  const field = tiedAndStill(1);
  const cord = knots(field)[0];
  const doomed = planted(field, mid(cord, field.player).x, mid(cord, field.player).y, 1);
  const before = { kills: field.kills, score: field.score };

  runFor(field, TETHER.beat + STEP * 2, holding([doomed]));
  assert.equal(field.enemies.includes(doomed), false, 'the kill took it out of the crowd');
  assert.equal(field.kills, before.kills + 1, 'the kill is credited');
  assert.ok(field.score > before.score, 'and so is the score it pays');
});

test('a thread that finishes a bomber chains, with nothing coming apart twice', () => {
  const field = tiedAndStill(1);
  const cord = knots(field)[0];
  const middle = mid(cord, field.player);
  const bomber = pin(marked(enemyAt('bomber', middle.x, middle.y, 1)));
  const neighbour = pin(marked(enemyAt('drifter', middle.x + 12, middle.y, IMMORTAL)));

  runFor(field, TETHER.beat + STEP * 4, holding([bomber, neighbour]));
  assert.ok(field.tether.pulses >= 1, 'the thread pulsed');
  assert.ok(hullGone(neighbour) > bite(),
    'and the body beside it took the thread *and* the bomber, with nothing doubled');
});

test('a thread\'s round is a shell of this gun, so it frosts and it lights', () => {
  // The opposite of the magnetar's crack (game/magnetar.js): a pulse lands on the nova's scale and
  // not once a second, so it is allowed to hand out what a bullet hands out.
  const field = tiedAndStill(1);
  field.upgrades.burn = BALANCE.upgrades.burn.ranks;
  field.upgrades.chill = BALANCE.upgrades.chill.ranks;
  const cord = knots(field)[0];
  const body = planted(field, mid(cord, field.player).x, mid(cord, field.player).y);
  body.frost = 0;
  const fires = field.fires.count;

  runFor(field, TETHER.beat + STEP * 2, holding([body]));
  assert.ok(hullGone(body) > 0, 'it hurt it');
  assert.ok(field.fires.count > fires, 'and it set it alight, like a drone bite and a nova front');
  assert.ok(body.frost > 0, 'and took the speed out of it, like them both');
});

test('the two readings the drawing is painted out of read the clock honestly', () => {
  const field = wearing(1);
  dashNorth(field);

  assert.equal(lettingGoOf(field.tether), 0, 'a fresh tether has all its life in hand');
  assert.equal(pulsingBy(field.tether), 0, 'and no pulse has just gone out');

  field.tether.cool = TETHER.beat;
  assert.ok(Math.abs(pulsingBy(field.tether) - 1) < 1e-9, 'the step a pulse went out: 1');
  field.tether.cool = TETHER.beat * 0.5;
  assert.ok(Math.abs(pulsingBy(field.tether) - 0.5) < 1e-9, 'half a beat later: half as loud');

  field.tether.live = TETHER.fade * 0.5;
  assert.ok(Math.abs(lettingGoOf(field.tether) - 0.5) < 1e-9,
    'half way through its going-out: ' + lettingGoOf(field.tether).toFixed(2));
  field.tether.live = 0;
  assert.equal(lettingGoOf(field.tether), 1, 'and done');
});

test('a crowd that is run through and turned pays for it: the whole card in one press', () => {
  // Twenty bodies coming up from behind, one dash away from them and then a turn: the fan sweeps the
  // lane they are standing in. This is the claim the run A/B cannot make - a bot that runs in a
  // straight line drags one thread along its own wake and never turns - so it is made here, the way
  // afterimage's press is (NOTES session 42).
  const field = wearing(5);
  const ship = field.player;
  const crowd = [];
  // A block of them across the way the dash is going, so the streak the knots are tied down lies right
  // in the middle of the crowd - and then the turn, which is what sweeps the fan across them.
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      crowd.push(pin(marked(enemyAt('drifter', ship.x - 90 + col * 45, ship.y - 120 - row * 40, IMMORTAL))));
    }
  }

  dashNorth(field);
  flyFor(1.2, { moveX: 1, moveY: 0, moving: true });   // the turn that opens the fan
  field.tether.live = 60;                              // and the sweep outlives two seconds
  runFor(field, TETHER.life * 0.8);

  const paid = crowd.filter((body) => hullGone(body) > 0);
  assert.ok(field.tether.pulses > 0, 'the fan pulsed');
  assert.ok(paid.length >= crowd.length / 2,
    'and it came round most of the crowd it was turned across: ' + paid.length + ' of ' + crowd.length);
});

test('the line costs no number out of the run\'s own stream, so a seed is still a seed', () => {
  const field = wearing(3);
  dashNorth(field);
  const cord = knots(field)[0];
  planted(field, mid(cord, field.player).x, mid(cord, field.player).y);
  runFor(field, STEP);

  const state = logic.state;
  runFor(field, TETHER.beat * 3);
  assert.ok(field.tether.pulses > 0, 'and it was paying out all the way through');
  assert.equal(logic.state, state, 'not one draw from the stream a run is made of');
});

test('a new run forgets whatever the last one left tied', () => {
  const field = wearing(3);
  dashNorth(field);
  assert.ok(field.tether.cords.count > 0);

  resetRun(field);
  assert.equal(field.tether.cords.count, 0, 'a restart is not chased by threads it never tied');
  assert.equal(field.tether.live, 0);
  assert.equal(field.tether.tied, 0);
  assert.equal(field.tether.pulses, 0);
  assert.equal(field.tether.hit, 0);
});
