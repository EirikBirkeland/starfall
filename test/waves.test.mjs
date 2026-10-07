// The wave director (game/waves.js): how much of a crowd a run may hold, what the
// room in that buys, and where the lot of it is allowed to arrive.
//
// The director is the only place a run gets its enemies from, so this file is
// really four separate promises:
//
//   the budget grows with the clock, and the crowd tracks it;
//   a wave is bought with the room, and never spends more than it was given;
//   a wave arrives as a group, off one side of the window, never on the ship;
//   and the whole thing is a function of the seed and of nothing else.
//
// These drive the director directly rather than through the frame loop: the clock
// it waits on is `world.spawnTimer`, so a test can hand it exactly the time it wants
// without a simulation of enemies walking around getting in the way.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { TAU } from '../src/core/math.js';
import { logic } from '../src/core/rng.js';
import { resetRun } from '../src/game/run.js';
import { makeEnemy } from '../src/game/kinds.js';
import {
  crowdBudget, crowdCost, pickMember, roomToSpare, spawnEnemy, updateWaves,
} from '../src/game/waves.js';
import { scriptedRun } from '../tools/headless/scripted.js';

const STEP = BALANCE.sim.step;
const W = BALANCE.waves;
const ARENA = BALANCE.arena;
const SHIP = { x: ARENA.w / 2, y: ARENA.h / 2 };   // where a fresh run puts the ship

/** The cheapest body the director can buy, however far the run has got. */
const CHEAPEST = Math.min(...Object.values(BALANCE.kinds).map((kind) => kind.cost));

/**
 * A moment of the run late enough that every kind in the table has unlocked. The
 * tests that ask "can the roll bring anything" have to be sat past the last `from`,
 * and saying it as the last `from` is the only way they stay true when a kind is
 * added - which is exactly when they would otherwise start lying quietly.
 */
const ALL_UNLOCKED = Math.max(...Object.values(BALANCE.kinds).map((kind) => kind.from)) + 30;

function angleDifference(a, b) {
  let diff = (a - b) % TAU;
  if (diff > Math.PI) diff -= TAU;
  if (diff < -Math.PI) diff += TAU;
  return diff;
}

/** A run parked at `seconds` old, with nothing in it and the director listening. */
function runAged(seed, seconds) {
  const field = scriptedRun(seed);
  // One world is shared by every test in this file, and one of them below shrinks
  // the world to nothing, so a fresh run has to put the arena back like new.
  field.arena.w = ARENA.w;
  field.arena.h = ARENA.h;
  field.player.x = SHIP.x;
  field.player.y = SHIP.y;
  field.elapsed = seconds || 0;
  field.spawnTimer = 0;
  return field;
}

/** One tick of the director, with the run's clock wound on with it. */
function tick(field, seconds) {
  const dt = seconds === undefined ? STEP : seconds;
  field.elapsed += dt;
  return updateWaves(field, dt);
}

/** Step the director for `seconds` and hand back every wave that arrived. */
function directorFor(field, seconds) {
  const waves = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    const wave = tick(field);
    if (wave) waves.push(wave);
  }
  return waves;
}

/** Stand `points` of crowd in the arena, out of the cheapest bodies there are. */
function fillCrowd(field, points) {
  let i = 0;
  while (crowdCost(field) < points) {
    field.enemies.push(makeEnemy(field, 'drifter', SHIP.x + 60 + i * 8, SHIP.y + 60));
    i++;
    if (i > 4000) throw new Error('the crowd cannot be filled, so the costs are wrong');
  }
  return field.enemies.length;
}

/** Where every member of every wave came in, as { x, y, type }. */
function arrivals(waves) {
  const out = [];
  for (const wave of waves) {
    for (const enemy of wave.members) out.push({ x: enemy.x, y: enemy.y, type: enemy.type });
  }
  return out;
}

// --- the budget ---------------------------------------------------------------

test('the crowd the run may hold grows with the clock, and stops growing sometime', () => {
  const field = runAged(200);
  assert.equal(crowdBudget(field), W.crowdBase, 'it starts at the balance base');

  field.elapsed = 60;
  assert.equal(crowdBudget(field), W.crowdBase + W.crowdPerMinute, 'and gains the per-minute share');

  let last = 0;
  for (const seconds of [0, 30, 60, 120, 300, 600, 1800]) {
    field.elapsed = seconds;
    const now = crowdBudget(field);
    assert.ok(now >= last, 'it never shrinks as the run goes on');
    last = now;
  }
  assert.equal(last, W.crowdMax, 'and it levels off at the ceiling');
  assert.ok(crowdBudget(field) / CHEAPEST > 20,
    'late in a run there are scores of bodies worth of room, not a handful');
});

test('the crowd tracks the budget: it fills up to it and never past it', () => {
  const field = runAged(201);
  let overBudget = 0;
  for (const seconds of [60, 120, 180]) {
    // Sit at three moments of a run and let the director have a minute each.
    field.enemies.length = 0;
    field.elapsed = seconds - 60;
    field.spawnTimer = 0;
    directorFor(field, 60);
    const bodies = field.enemies.length;
    assert.ok(bodies > 4, 'a minute of the director put ' + bodies + ' bodies in the arena');
    assert.ok(crowdCost(field) <= crowdBudget(field),
      'the arena is holding ' + crowdCost(field) + ' points of a ' + crowdBudget(field) + ' budget');
    assert.ok(crowdCost(field) > crowdBudget(field) - W.waveMaxPoints,
      'and it is within a wave of what it may hold');
    if (crowdCost(field) > crowdBudget(field)) overBudget++;
  }
  assert.equal(overBudget, 0);
});

test('more of a crowd arrives the later in the run it is', () => {
  const field = runAged(202);
  const early = directorFor(field, 90).reduce((n, wave) => n + wave.members.length, 0);
  const late = directorFor(runAged(202, 300), 90).reduce((n, wave) => n + wave.members.length, 0);
  assert.ok(late > early * 1.5,
    'a minute and a half at 5:00 sends ' + late + ' against ' + early + ' at the start');
});

test('killing opens the room and the next wave is no more than the gap away', () => {
  const field = runAged(203, 60);
  directorFor(field, 2);
  assert.ok(field.enemies.length > 0, 'the run has a crowd to start with');

  const whileFull = directorFor(field, 20);
  assert.ok(whileFull.length > 1, 'a full arena leaves no room, so the waves are far apart: ' + whileFull.length);
  assert.ok(whileFull.length < 6,
    'and they are far apart indeed: ' + whileFull.length + ' waves in 20 s');

  field.enemies.length = 0;                 // the player cleared it
  let waited = 0;
  let wave = null;
  while (wave === null && waited < W.gap[1] + STEP) {
    waited += STEP;
    wave = tick(field);
  }
  assert.ok(wave, 'the room opened by the clearing is spent as soon as its turn comes');
  assert.ok(waited <= W.gap[1] + STEP, 'and no later than the gap: waited ' + waited.toFixed(2) + ' s');
});

test('the hard ceiling holds whatever the budget says', () => {
  const field = runAged(204, 600);          // a budget far bigger than the ceiling
  assert.ok(roomToSpare(field) > 100, 'there is room to spare by the budget alone');
  fillCrowd(field, W.maxBodies * CHEAPEST);
  const bodies = field.enemies.length;
  assert.ok(bodies >= W.maxBodies);

  assert.equal(tick(field), null, 'nothing arrives at the ceiling');
  assert.equal(field.enemies.length, bodies, 'not one body');
  assert.equal(field.spawnTimer, W.retry, 'and it will look again shortly, not next minute');
});

// --- what a wave is made of ---------------------------------------------------

test('a wave spends the room it was given and never more', () => {
  const field = runAged(205, 120);
  const room = roomToSpare(field);
  const wave = tick(field);

  assert.ok(wave, 'the empty arena has room to spare');
  assert.ok(wave.members.length >= 1, 'and a wave came');
  assert.ok(wave.points <= room, 'it spent ' + wave.points + ' of ' + room);
  assert.ok(wave.members.length <= W.maxMembers);
  assert.ok(wave.members.length <= wave.asked, 'not every member finds somewhere to stand');

  // The room is spent to the last few points - the loop only stops when nothing
  // left fits, or when the wave is as many bodies as one wave is allowed.
  const leftOver = room - wave.points;
  assert.ok(leftOver < CHEAPEST || wave.members.length === W.maxMembers,
    'it left ' + leftOver + ' of ' + room + ' unspent');

  let cost = 0;
  for (const enemy of wave.members) cost += BALANCE.kinds[enemy.type].cost;
  assert.equal(cost, wave.points, 'the wave reports what its own members cost');
});

test('a wave never spends more than one wave is worth', () => {
  const field = runAged(206, 600);          // the whole budget is free
  assert.ok(roomToSpare(field) > W.waveMaxPoints * 3);
  const wave = tick(field);
  assert.ok(wave.points <= W.waveMaxPoints,
    'a huge gap in pressure arrives as a wave, not as a screenful: ' + wave.points);
});

test('every kind fits in the smallest wave the director will send', () => {
  // The one lockstep between the two tables: if the dearest kind costs more than the
  // least the director is willing to spend, that kind would never arrive at all -
  // a wave bought with a handful of points could not afford it.
  const dearest = Math.max(...Object.values(BALANCE.kinds).map((kind) => kind.cost));
  assert.ok(dearest <= W.waveMinPoints,
    'the dearest kind costs ' + dearest + ' and the smallest wave is worth ' + W.waveMinPoints);

  // And it is not just affordable, it is rolled: a big wave brings the big kinds.
  const field = runAged(224, ALL_UNLOCKED);
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    field.enemies.length = 0;
    const wave = tick(field);
    for (const enemy of wave.members) seen.add(enemy.type);
    field.spawnTimer = 0;
  }
  for (const type of Object.keys(BALANCE.kinds)) {
    assert.ok(seen.has(type), 'a ' + type + ' arrives in a wave, not only in a roll');
  }
});

test('nothing arrives while the crowd is worth all the run may hold', () => {
  const field = runAged(207, 120);
  fillCrowd(field, crowdBudget(field));
  const bodies = field.enemies.length;

  assert.equal(tick(field), null);
  assert.equal(field.enemies.length, bodies, 'the arena keeps what it has');
  assert.equal(field.spawnTimer, W.retry, 'and looks again in a moment');
});

test('a wave is bought only out of what it can afford', () => {
  const field = runAged(208, 300);
  const tank = BALANCE.kinds.tank.cost;
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const type = pickMember(field, tank - 1);
    assert.ok(type, 'something is always affordable down to the cheapest body');
    assert.ok(BALANCE.kinds[type].cost <= tank - 1,
      type + ' costs ' + BALANCE.kinds[type].cost + ' and was asked for with ' + (tank - 1));
    seen.add(type);
  }
  assert.equal(seen.has('tank'), false, 'a tank does not fit in the room for a tank');
});

test('the roll can bring any kind that is unlocked, and none that is not', () => {
  const field = runAged(209, 30);
  const early = new Set();
  for (let i = 0; i < 600; i++) early.add(pickMember(field, Infinity));
  assert.deepEqual([...early].sort(), ['drifter', 'tank', 'weaver'],
    'at half a minute the roster is what has appeared by then');

  field.elapsed = ALL_UNLOCKED;
  const late = new Set();
  for (let i = 0; i < 600; i++) late.add(pickMember(field, Infinity));
  for (const type of Object.keys(BALANCE.kinds)) {
    assert.ok(late.has(type), 'once they have all had their turn a ' + type + ' shows up in the roll');
  }
});

test('the roll is weighted by what each kind is worth', () => {
  // Every kind unlocked is offered its weight of the roll, no more and no less -
  // which is what makes the two passes over the roster agree with each other.
  const field = runAged(227, ALL_UNLOCKED);
  const rows = Object.keys(BALANCE.kinds).map((type) => ({
    type: type,
    weight: BALANCE.kinds[type].weight,
    rolled: 0,
  }));
  const total = rows.reduce((sum, row) => sum + row.weight, 0);

  const tries = 6000;
  for (let i = 0; i < tries; i++) {
    const type = pickMember(field, Infinity);
    rows.find((row) => row.type === type).rolled++;
  }
  for (const row of rows) {
    const share = row.rolled / tries;
    const want = row.weight / total;
    assert.ok(Math.abs(share - want) < 0.04,
      row.type + ' was rolled ' + (share * 100).toFixed(1) + '% of the time, its weight wants ' +
      (want * 100).toFixed(1) + '%');
  }
});

test('one kind rolled is one number out of the stream, however many are unlocked', () => {
  // How far the generator moves for one number of its own. The state is a wrapped
  // 32-bit counter, so the distance between two of its values is read unsigned.
  const mark = logic.state;
  logic.next();
  const oneNumber = (logic.state - mark) >>> 0;

  const field = runAged(210, 30);
  const before = logic.state;
  pickMember(field, Infinity);
  const early = (logic.state - before) >>> 0;

  field.elapsed = 300;
  const again = logic.state;
  pickMember(field, Infinity);
  const late = (logic.state - again) >>> 0;

  assert.equal(early, oneNumber, 'one roll, one number');
  assert.equal(late, early,
    'a fifth kind on the roster cannot move the stream of a run that met none');
});

test('the waves are counted, and a new run forgets the count', () => {
  const field = runAged(211, 120);
  const waves = directorFor(field, 30);
  assert.ok(waves.length >= 3, 'a minute of a free arena is several waves, got ' + waves.length);
  assert.equal(waves[0].number, 1, 'the first wave of a run is the first');
  assert.equal(waves[waves.length - 1].number, waves.length, 'and they count up');
  assert.equal(field.waveNumber, waves.length);

  resetRun(field);
  assert.equal(field.waveNumber, 0, 'a restart is a first wave again');
  assert.equal(field.spawnTimer, BALANCE.runStart.spawnDelay,
    'and the director is back to the breathing room a run starts with');
});

// --- where a wave arrives -----------------------------------------------------

test('a dribble of room is not a wave', () => {
  // The crowd is left just short of the budget - there is room for a body or two,
  // and the director is meant to wait rather than send a trickle.
  const field = runAged(225, 120);
  fillCrowd(field, crowdBudget(field) - (W.waveMinPoints - 1));
  const room = roomToSpare(field);
  assert.ok(room >= CHEAPEST && room < W.waveMinPoints,
    'the setup left ' + room + ' points of room, and a wave costs ' + W.waveMinPoints);

  assert.equal(tick(field), null, 'nothing comes for a dribble');
  assert.equal(field.spawnTimer, W.retry);

  field.spawnTimer = 0;
  field.enemies.length -= 4;               // four bodies' worth of room opens up
  assert.ok(roomToSpare(field) >= W.waveMinPoints, 'and that is enough to be worth a wave');
  assert.ok(tick(field), 'a wave');
});

test('the waves do not all come from the same side', () => {
  const field = runAged(226, 300);
  const bearings = new Set();
  for (let i = 0; i < 40; i++) {
    field.enemies.length = 0;
    field.spawnTimer = 0;
    const wave = tick(field);
    if (wave) bearings.add(Math.round(wave.bearing * 100));
  }
  assert.ok(bearings.size > 20, '40 waves came in from ' + bearings.size + ' bearings, not a compass of them');
});

test('a wave with nowhere to come in is not a wave', () => {
  // Every point of a small enough arena is too close to the ship to be allowed to
  // arrive in, so the director has room and no way to spend it.
  const field = runAged(228, 120);
  field.arena.w = 300;
  field.arena.h = 300;
  field.player.x = 150;
  field.player.y = 150;
  assert.ok(roomToSpare(field) > W.waveMinPoints, 'the budget has room for a wave');

  assert.equal(tick(field), null, 'and nothing arrived');
  assert.equal(field.waveNumber, 0, 'and nothing was counted');
});

test('a wave comes in off one side of the window, spread across a fan', () => {
  for (const seed of [212, 213, 214, 215]) {
    const field = runAged(seed, 120);
    const wave = tick(field);
    const bearings = [];
    for (const enemy of wave.members) {
      const bearing = Math.atan2(enemy.y - SHIP.y, enemy.x - SHIP.x);
      const off = angleDifference(bearing, wave.bearing);
      assert.ok(Math.abs(off) <= W.fan / 2 + 1e-9,
        'a member came in ' + off.toFixed(2) + ' rad off the wave it arrived with');
      bearings.push(off);
    }
    if (wave.members.length > 2) {
      const spread = Math.max(...bearings) - Math.min(...bearings);
      assert.ok(Math.abs(spread - W.fan) < 1e-6,
        'a crowd arrives across the whole fan, not stacked on one point: ' + spread);
    }
  }
});

test('every arrival is off the window, inside the world, and off the ship', () => {
  const field = runAged(216, 300);
  const seen = arrivals(directorFor(field, 120));
  assert.ok(seen.length > 40, 'three minutes of the director is a lot of arrivals, got ' + seen.length);

  const halfW = field.view.w / 2;
  const halfH = field.view.h / 2;
  for (const spot of seen) {
    assert.ok(Math.abs(spot.x - SHIP.x) > halfW || Math.abs(spot.y - SHIP.y) > halfH,
      'an enemy arrived in plain sight at ' + spot.x + ',' + spot.y);
    assert.ok(spot.x > 0 && spot.x < ARENA.w && spot.y > 0 && spot.y < ARENA.h,
      'and it arrived outside the world at ' + spot.x + ',' + spot.y);
  }
});

test('a ship in a corner of the world is no easier to land on', () => {
  const field = runAged(217, 300);
  const ship = field.player;
  ship.x = BALANCE.player.drawRadius + 2;
  ship.y = ARENA.h - BALANCE.player.drawRadius - 2;

  const seen = arrivals(directorFor(field, 60));
  assert.ok(seen.length > 20, 'there was somewhere to put them after all: ' + seen.length);
  for (const spot of seen) {
    assert.ok(Math.hypot(spot.x - ship.x, spot.y - ship.y) > W.minDistance,
      'an enemy landed on the ship: ' + Math.round(Math.hypot(spot.x - ship.x, spot.y - ship.y)) + ' px');
    assert.ok(spot.x > 0 && spot.x < ARENA.w && spot.y > 0 && spot.y < ARENA.h);
  }
});

test('an arrival asked for by name is that kind, standing in the world', () => {
  const field = runAged(218, 60);
  const enemy = spawnEnemy(field, 'darter', 0);
  assert.ok(enemy, 'the spawn answered the enemy itself, not just yes');
  assert.equal(enemy.type, 'darter');
  assert.equal(field.enemies.length, 1);
  assert.ok(Number.isFinite(enemy.x) && Number.isFinite(enemy.y));
  assert.ok(enemy.hp > 0 && enemy.r > 0);
  assert.equal(enemy.x, enemy.px, 'and it is drawn where it stands, on its first step');
});

test('the ceiling on bodies holds an arrival asked for by name too', () => {
  const field = runAged(219, 60);
  fillCrowd(field, W.maxBodies * CHEAPEST);
  assert.equal(spawnEnemy(field, 'drifter'), null, 'no room, no enemy');
});

// --- the clock it waits on ----------------------------------------------------

test('a wave does not arrive while the run is still in its wait', () => {
  const field = runAged(220, 120);
  field.spawnTimer = Infinity;              // what every other test gets: no director
  assert.equal(field.spawnTimer, Infinity, 'the scripted run parked the director');
  for (let i = 0; i < Math.round(30 / STEP); i++) tick(field);
  assert.equal(field.enemies.length, 0, 'and nothing arrived for half a minute of it');
});

test('one wave, then its wait, then the next one', () => {
  // The arena is kept empty here, so every tick of the director has room to spend:
  // this measures the beat between waves and nothing else. A full arena waiting on
  // room is test('nothing arrives while the crowd is worth all the run may hold').
  const field = runAged(221, 120);
  const gaps = [];
  let lastWaveAt = null;
  let t = field.elapsed;
  for (let i = 0; i < Math.round(60 / STEP); i++) {
    t += STEP;
    field.enemies.length = 0;
    const wave = updateWaves(field, STEP);
    field.elapsed = t;
    // The first wave of a run is not after another wave, so it is not a gap.
    if (wave) {
      if (lastWaveAt !== null) gaps.push(t - lastWaveAt);
      lastWaveAt = t;
    }
  }
  assert.ok(gaps.length > 2, 'a minute of a free arena is more than a couple of waves');
  for (const gap of gaps) {
    assert.ok(gap >= W.gap[0] - STEP && gap <= W.gap[1] + STEP,
      'a wave arrived ' + gap.toFixed(2) + ' s after the last, outside the gap');
  }
});

test('the same seed buys the same waves', () => {
  const first = arrivals(directorFor(runAged(222, 150), 45));
  const second = arrivals(directorFor(runAged(222, 150), 45));
  assert.ok(first.length > 20, 'there was something to compare');
  assert.deepEqual(first, second, 'the same seed, the same arrivals');

  const other = arrivals(directorFor(runAged(223, 150), 45));
  assert.notDeepEqual(first, other, 'and a different seed is a different run');
});
