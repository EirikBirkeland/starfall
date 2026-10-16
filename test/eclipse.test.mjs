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
  armedCount, bossFlare, bossName, bossPhase, bossRiding, bossShape, callAngle, callCount,
  callStand, callStep, gapAngle, gapEnd, gapHalf, gapProgress, gapStart, windupProgress,
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

// ---------------------------------------------------------------------------
// The walking door (PLAN 3.4's "bullet walls with moving gaps")
//
// Every other door in the game is opened on you and held, because a promise that moves is not a
// promise. The last phase of the last fight breaks that rule, and what buys the permission is the
// same thing that bought the blades theirs: the whole of the way it travels is on the glass from
// the first step of the wind-up, and it is standing still again before anything is thrown. So the
// claims here are all about the shape of the walk - that it starts on the ship, that it is one way
// and all the way, that it ends early enough to be read, and that the hole the shots leave is the
// place the door came to rest and not a step short of it.
// ---------------------------------------------------------------------------

/** The row the last phase promises with. */
const SHELL = ECLIPSE.phases[2].bullets;

/** The last phase, with its flare run out. */
function toPhaseThree(boss) {
  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[2] * 0.99;
  assert.ok(until(() => bossPhase(boss) === 3, 30), 'the last phase never opened');
  assert.ok(until(() => bossFlare(boss) === 0, 30), 'the flare never ran out');
  return boss;
}

/** Wait for the next shell to start being promised, and hand back the fight. */
function catchItArming(boss) {
  assert.ok(until(() => armedCount(boss) > 0, 30), 'it never armed a shell');
  return boss;
}

/**
 * The wind-up stepped out to the last step, with the door's bearing and its progress at every one
 * of them. What a walk is made of can only be measured by watching one.
 */
function watchTheWalk(boss) {
  const seen = [];
  let guard = 0;
  while (armedCount(boss) > 0) {
    seen.push({ at: gapAngle(boss), p: gapProgress(boss) });
    realStep();
    if (++guard > 4000) throw new Error('it never stopped promising');
  }
  return seen;
}

/** The bearing every shot in the air is travelling on - which is the bearing it left the rim on. */
function shotBearings(field) {
  const shots = field.enemyShots;
  const out = [];
  for (let i = 0; i < shots.count; i++) {
    const shot = shots.items[i];
    if (shot.from === 'eclipse') out.push(Math.atan2(shot.vy, shot.vx));
  }
  return out;
}

/** Park the ship on a bearing from the sun, `distance` out, and remember neither movement. */
function standOnBearing(field, boss, bearing, distance) {
  const body = boss.enemy;
  return place(field, body.x + Math.cos(bearing) * distance, body.y + Math.sin(bearing) * distance);
}
test('only the last phase lets its door walk, and what it walks can be paid for', () => {
  assert.equal(ECLIPSE.phases[0].bullets.gapWalk, undefined, 'the first shell has a held door');
  assert.equal(ECLIPSE.phases[1].bullets.gapWalk, undefined, 'and so has the second');

  // Further than the door is half-wide, or the door would have walked and the ship not noticed:
  // it is standing dead in the middle of it when it lights, so anything less than `gap` of travel
  // leaves it inside the wedge anyway and the gap has not moved in any way it could tell.
  assert.ok(SHELL.gapWalk > SHELL.gap, 'a door that walked less than its own half-width never moved');

  // There has to be a rest in it: `gapSettle` of the wind-up is spent with the door standing
  // still, and that is the half of the promise the held doors never had to make. It has to be a
  // rest the simulation can actually reach - at least a step, or the door would still be moving on
  // the step the wall is thrown - because that rest is the only reason the last bearing the frame
  // ever showed is the bearing the hole is left at.
  for (const phase of ECLIPSE.phases) {
    const row = phase.bullets;
    if (row.gapWalk === undefined) continue;
    assert.ok(row.gapSettle > BALANCE.sim.step, 'there is no rest at the end of the walk');
    assert.ok(row.gapSettle < row.windup, 'the walk never finishes inside the wind-up');
  }

  // And the chase has to be affordable. The ship has `gapWalk - gap` of bearing to buy back, from
  // the first step of the wind-up until the wall reaches its own radius - priced at the dear end,
  // the far edge of the band the sun holds, where a radian of arc is longest, against the fastest
  // hull in the game, and asked for less than half of it: the other half is being spent not
  // falling into the sun (game/balance.js `eclipse.pull`).
  const far = ECLIPSE.approach.far;
  const arc = (SHELL.gapWalk - SHELL.gap) * far;
  const secs = SHELL.windup + (far - ECLIPSE.radius) / SHELL.shot.speed;
  const ask = arc / secs;
  const ship = BALANCE.ships.wisp.maxSpeed;
  assert.ok(ask > 20, 'a door that walks is asking for nothing: ' + ask.toFixed(0) + ' px/s');
  assert.ok(ask < ship / 2, 'the chase costs ' + ask.toFixed(0) + ' px/s of the ' + ship + ' it has');
});

test('the door lights on the ship, walks one way, and the whole of the way', () => {
  const field = scriptedRun(309);
  const boss = eclipseOnTheField();
  standBesideTheSun(field, boss, ECLIPSE.approach.far - 20);
  toPhaseThree(boss);
  catchItArming(boss);

  // It starts where the ship is standing, exactly as every held door does: the walk is a thing that
  // happens to a door the ship was already inside, and not a door thrown at random.
  const lit = bearing(field, boss);
  assert.equal(gapStart(boss), lit, 'the door did not light on the ship');
  assert.equal(gapAngle(boss), lit, 'the door was somewhere else on the step it lit');

  const walk = gapEnd(boss) - gapStart(boss);
  assert.ok(Math.abs(Math.abs(walk) - SHELL.gapWalk) < 1e-12, 'it promised to walk ' + walk);

  const seen = watchTheWalk(boss);
  assert.ok(seen.length > 20, 'the wind-up was too short to watch');

  // One way, the whole way, and never backtracking: a ship can read a bearing that only ever gets
  // further from where it lit, and cannot read anything else.
  let moved = 0;
  for (let i = 1; i < seen.length; i++) {
    const step = seen[i].at - seen[i - 1].at;
    if (step === 0) continue;
    assert.ok((step > 0) === (walk > 0), 'the door changed its mind at step ' + i);
    moved += step;
  }
  assert.ok(Math.abs(moved - walk) < 1e-12, 'it walked ' + moved + ' of the ' + walk + ' it promised');
  assert.equal(seen[seen.length - 1].at, gapEnd(boss), 'it was still walking when the shell landed');
});

test('the door is standing still again before the wall is thrown', () => {
  const field = scriptedRun(310);
  const boss = eclipseOnTheField();
  standBesideTheSun(field, boss, ECLIPSE.approach.far - 20);
  toPhaseThree(boss);
  catchItArming(boss);
  const seen = watchTheWalk(boss);

  // Not one step of the last `gapSettle` seconds of the stop moves the door a pixel. This is the
  // whole of the difference between a moving gap and a moving promise - the wall that arrives has
  // not moved an inch. It is measured in seconds off the steps themselves and not as a share of the
  // row's own wind-up, because the stop it is held for is the pair's and is longer than this row
  // asked for (game/bosses.js `takeBeat`): a door that rests *longer* than it promised has kept its
  // promise, and a rest read as a share would call that a lie.
  let moved = 0;
  for (let i = 1; i < seen.length; i++) if (seen[i].at !== seen[i - 1].at) moved = i;
  const rest = seen.length - moved;
  assert.ok(rest > 8, 'the rest was ' + rest + ' steps long, which is not a rest');
  assert.ok(rest * STEP > SHELL.gapSettle - STEP,
    'the door stood still for ' + (rest * STEP).toFixed(2) + ' s and the row promises '
    + SHELL.gapSettle);
  for (const s of seen.slice(moved)) {
    assert.equal(s.at, seen[seen.length - 1].at, 'the door was still creeping');
  }
  for (let i = 1; i < seen.length; i++) {
    assert.ok(seen[i].p >= seen[i - 1].p, 'the progress it reports went backwards');
  }
  assert.ok(seen[seen.length - 1].p > 0.9, 'the promise ended before it had run its own length');
});

test('the hole that arrives is the hole it walked to, edge for edge', () => {
  const field = scriptedRun(311);
  const boss = eclipseOnTheField();
  standBesideTheSun(field, boss, ECLIPSE.approach.far - 20);
  toPhaseThree(boss);
  catchItArming(boss);
  const walked = gapEnd(boss);
  const half = gapHalf(boss);

  assert.ok(until(() => armedCount(boss) === 0, SHELL.windup + 1), 'it never threw the shell');
  steps(STEP * 2);
  assert.equal(armedCount(boss), 0, 'it is still arming after it threw');
  assert.equal(gapAngle(boss), walked, 'it fired with the door short of its place of rest');

  const bearings = shotBearings(field);
  assert.equal(bearings.length, SHELL.count, 'it threw a different number of shots than it armed');
  for (const bearing of bearings) {
    assert.ok(Math.abs(off(bearing, walked)) >= half,
      'a shot went down the door it was told to leave open');
  }

  // The door is a wide place and not a hairline: the ring is spread thinly enough over what is
  // left of the circle that the wedge on the glass is the best answer there is, and not one of
  // several.
  const step = (TAU - half * 2) / SHELL.count;
  assert.ok(half * 2 > step * 3, 'the door is barely wider than the gap between two shots');
});

test('every other shell walks the other way', () => {
  const field = scriptedRun(312);
  const boss = eclipseOnTheField();
  standBesideTheSun(field, boss, ECLIPSE.approach.far - 20);
  toPhaseThree(boss);

  // The direction is the count of shells the fight has thrown and not a roll, so a player who has
  // seen one shell walk knows which way the next one is going before it starts - which is the only
  // way a moving gap is a rhythm rather than a coin toss.
  const walks = [];
  for (let shell = 0; shell < 4; shell++) {
    catchItArming(boss);
    walks.push(gapEnd(boss) - gapStart(boss));
    // Until this shell has actually gone: the stop it is shown for is the pair's, and a loop that
    // steps a fixed slice of it can catch the same shell twice and call that a rhythm.
    assert.ok(until(() => armedCount(boss) === 0, SHELL.windup + 1), 'it never threw the shell');
  }
  for (let i = 0; i < walks.length; i++) {
    assert.ok(Math.abs(Math.abs(walks[i]) - SHELL.gapWalk) < 1e-12,
      'shell ' + i + ' walked ' + walks[i].toFixed(3) + ' and the row says ' + SHELL.gapWalk);
    if (i > 0) assert.ok((walks[i] > 0) !== (walks[i - 1] > 0), 'two shells in a row went the same way');
  }
});

test('a walk is not a roll: another seed walks the same door', () => {
  const first = oneWalk(scriptedRun(313));
  const second = oneWalk(scriptedRun(991));
  assert.equal(second, first, 'two runs walked different doors: ' + first + ' and ' + second);
});

/** One shell's walk, from a fresh arena with the sun arrived and on its last phase. */
function oneWalk(field) {
  const boss = eclipseOnTheField();
  standBesideTheSun(field, boss, ECLIPSE.approach.far - 20);
  toPhaseThree(boss);
  catchItArming(boss);
  const walk = gapEnd(boss) - gapStart(boss);
  watchTheWalk(boss);
  return walk;
}

test('a ship that stays where the door lit is not in it when the wall arrives', () => {
  // The claim the whole row exists to make, paid out in hull and not in bearings: the door really
  // did leave, and the wall really does arrive where it stopped. Two ships, one that followed and
  // one that did not, at the dear end of the room, and the only difference between them is whether
  // they went to where the promise ended.
  const took = hullTakenByOneShell(314);
  assert.ok(took.stayed >= 1, 'a ship that did nothing was left alone by a door that walked away');
  assert.equal(took.followed, 0, 'a ship standing in the door it walked to was still hit');
});

/**
 * One shell, twice: the hull a ship loses standing on the bearing the door lit on, and the hull the
 * same ship loses standing on the bearing the door came to rest on. Both parked on the far edge of
 * the band the sun holds - the dear end, where the chase costs most - and the window is as long as
 * that wall's own flight and no longer, so nothing after this shell can be blamed for it.
 */
function hullTakenByOneShell(seed) {
  const out = {};
  for (const where of ['lit', 'rest']) {
    const field = scriptedRun(seed);
    const boss = eclipseOnTheField();
    toPhaseThree(boss);
    catchItArming(boss);
    const ship = standOnBearing(field, boss,
      where === 'lit' ? gapStart(boss) : gapEnd(boss), ECLIPSE.approach.far);
    ship.invuln = 0;
    ship.hull = 5;

    const wall = (ECLIPSE.approach.far - ECLIPSE.radius) / SHELL.shot.speed;
    // Wait for this shell to have actually been thrown before the window opens. The stop it is
    // promised for is the pair's and so is longer than this row's own wind-up, and a window timed off
    // the row would shut before the wall had left the rim - and the window is the wall's own flight and
    // nothing else, which is the whole point of the measurement.
    let guard = 0;
    while (armedCount(boss) > 0 && guard++ < 2000) realStep();
    const total = Math.ceil(wall / STEP) + 4;
    let hull = ship.hull;
    let lost = 0;
    for (let i = 0; i < total; i++) {
      realStep();
      if (ship.hull < hull) { lost++; hull = ship.hull; }
    }
    out[where === 'lit' ? 'stayed' : 'followed'] = lost;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The summons: the third beat, carried by the shell (game/bosses.js `with`)
// ---------------------------------------------------------------------------

const CALL = ECLIPSE.phases[2].call;

/** Whatever the sun has sent that is still in the room. */
function calledOn(field) {
  return field.enemies.filter((e) => e.type === CALL.type);
}

/** The bearings of the marks it is showing, in the order they are lit. */
function markBearings(boss) {
  const out = [];
  const middle = (callCount(boss) - 1) / 2;
  for (let i = 0; i < callCount(boss); i++) out.push(callAngle(boss) + (i - middle) * callStep(boss));
  return out;
}

test('the summons belong to the last phase, and the shell carries them', () => {
  assert.equal(ECLIPSE.phases[0].call, undefined, 'the first shell already had bodies');
  assert.equal(ECLIPSE.phases[1].call, undefined, 'the second shell already had bodies');
  assert.equal(ECLIPSE.phases[2].bullets.with, 'call', 'the shell is not carrying its summons');
  assert.equal(ECLIPSE.phases[2].sweep.with, undefined, 'the fan is carrying something as well');

  const field = scriptedRun(320);
  const boss = eclipseOnTheField();
  standBesideTheSun(field, boss, ECLIPSE.approach.far - 20);
  toPhaseThree(boss);
  catchItArming(boss);

  // One halt, two promises: the door and the marks are lit together, and the stop is held for the
  // longer of the two wind-ups so neither ask is cut short by the company it keeps.
  assert.equal(callCount(boss), CALL.count, 'the halt that lit its door lit no marks');
  assert.ok(windupProgress(boss) < 0.1, 'it was already partway through the stop it had not started');
  assert.ok(CALL.windup > SHELL.windup, 'the call is not the longer ask, so this pair proves nothing');

  const before = { rings: boss.rings, calls: boss.calls };
  const limit = Math.ceil(Math.max(SHELL.windup, CALL.windup) / STEP) + 4;
  let wall = -1;
  for (let i = 0; i < limit; i++) {
    realStep();
    if (wall < 0 && boss.rings > before.rings) wall = i;
    if (boss.calls > before.calls) {
      assert.equal(wall, i, 'the wall and its bodies arrived on different steps');
      break;
    }
  }
  assert.ok(wall >= 0, 'the pair never landed');
  assert.equal(calledOn(field).length, CALL.count, 'the wall arrived without its bodies');
  assert.equal(armedCount(boss), 0, 'it is still promising a door after it threw');
  assert.equal(callCount(boss), 0, 'it is still showing marks after it sent');
});

test('the marks it lights are the bodies that arrive on them', () => {
  const field = scriptedRun(321);
  const boss = eclipseOnTheField();
  const body = boss.enemy;
  standBesideTheSun(field, boss, ECLIPSE.approach.far - 20);
  toPhaseThree(boss);
  catchItArming(boss);

  assert.equal(callStep(boss), CALL.step);
  assert.equal(callStand(boss), CALL.gap);
  assert.ok(CALL.windup >= BALANCE.bosses.telegraphMin,
    'the marks are lit for less than any boss may show a thing');
  assert.ok(((CALL.count - 1) / 2) * CALL.step < Math.PI / 2,
    'the fan of marks wraps round onto the ship');

  // A mark is a place a ship can be asked to leave, which means it has to be a place a ship can
  // stand off: outside the rim that hurts on contact, and outside the distance the drag lets go of
  // the ship at, so that walking away from one is the engines' business and not luck (game/balance.js).
  const stand = body.r + CALL.gap;
  assert.ok(stand > body.r + field.player.r, 'a body is born on top of the ship that touches the sun');
  assert.ok(stand > ECLIPSE.phases[2].pull.floor,
    'a mark stands inside the drag floor, where a ship arrives by falling: ' + stand);

  const shown = markBearings(boss);
  const crowd = field.enemies.length;
  const sent = boss.summons;
  assert.ok(until(() => boss.summons > sent, CALL.windup + 1), 'the call never landed');
  assert.equal(boss.summons - sent, CALL.count, 'it sent a different number of bodies than it lit');
  assert.equal(field.enemies.length, crowd + CALL.count);

  for (const one of field.enemies.slice(crowd)) {
    const angle = Math.atan2(one.y - body.y, one.x - body.x);
    assert.ok(shown.some((a) => Math.abs(off(angle, a)) < 1e-9),
      'a body came out of a bearing that was never lit');
    assert.ok(Math.hypot(one.x - body.x, one.y - body.y) >= stand - 1e-6,
      'a body was born inside the rim it was shown outside of');
  }
});

test('the sun does not send a second pack over one that is still hunting', () => {
  const field = scriptedRun(322);
  const boss = eclipseOnTheField();
  standBesideTheSun(field, boss, ECLIPSE.approach.far - 20);
  toPhaseThree(boss);
  catchItArming(boss);
  const sent = boss.summons;
  assert.ok(until(() => boss.summons > sent, CALL.windup + 1), 'the call never landed');

  // Two minutes of the phase, watched a step at a time. Nothing in this room shoots, so the first
  // pack is still going, and a second one dropped on top of it would be the fight filling its own
  // cage with its own summons instead of fighting (game/bosses.js `takeBeat`).
  const rings = boss.rings;
  let emptied = -1;
  let second = -1;
  const minutes = Math.round(120 / STEP);
  for (let i = 0; i < minutes; i++) {
    stepTheWorld();
    if (emptied < 0 && calledOn(field).length === 0) emptied = i;
    if (second < 0 && boss.summons > sent + CALL.count) second = i;
  }
  if (emptied < 0) {
    assert.equal(second, -1, 'it called again with every body it had sent still hunting');
  } else {
    assert.ok(second === -1 || second > emptied, 'it called again over a call that was still standing');
  }
  assert.ok(boss.rings > rings + 3 && boss.sweeps > 1, 'it stopped fighting while it waited');
});

test('what the sun called goes down with the sun', () => {
  const field = scriptedRun(323);
  const boss = eclipseOnTheField();
  standBesideTheSun(field, boss, ECLIPSE.approach.far - 20);
  toPhaseThree(boss);
  catchItArming(boss);
  const sent = boss.summons;
  assert.ok(until(() => boss.summons > sent, CALL.windup + 1), 'the call never landed');
  assert.ok(calledOn(field).length > 0, 'nothing was called');

  fell(field, boss);
  steps(0.4);
  assert.equal(field.boss, null, 'the sun is still standing');
  assert.equal(calledOn(field).length, 0, 'a body the fight sent outlived the fight that sent it');
});

test('a call it never made is a call the run never sees', () => {
  // A promise broken in the run's favour, exactly like the half-armed wall it shares a stop with.
  const field = scriptedRun(324);
  const boss = eclipseOnTheField();
  standBesideTheSun(field, boss, ECLIPSE.approach.far - 20);
  toPhaseThree(boss);
  catchItArming(boss);
  assert.equal(boss.summons, 0, 'the bodies arrived before the marks were lit');
  assert.equal(calledOn(field).length, 0);

  fell(field, boss);
  steps(0.4);
  assert.equal(field.boss, null);
  assert.equal(boss.summons, 0, 'it sent the call it was still lighting');
  assert.equal(calledOn(field).length, 0, 'the bodies it was about to send came anyway');
});
