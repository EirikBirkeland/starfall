// The swarm: PLAN 3.3's "splitter swarm - 8 each, 180, arrives in packs of 20, flocks",
// as the simulation does it. There is no browser here, so a "frame" is one fixed step of
// the scripted world (tools/headless/scripted.js) and what can be promised is what the
// flock's own numbers say.
//
// Four groups of promises:
//
//   **the pack is an arrival** - one member of a wave, many bodies, standing together
//   off one side of the window, and paid for out of the spawn budget one body at a time;
//   a swarm too small to be called a swarm is not sent at all;
//
//   **the flock is a relationship** - twenty bodies and one answer to "where are we
//   going": the middle, the heading and the beat belong to the pack (game/flock.js) and
//   are worked out again every step from whoever is still alive in it;
//
//   **the dive is a promise** - a pack bunches up for `brace` seconds and then every
//   body flies the one line it locked when the brace ended, so the tell and the flight
//   are the same fact twice, counted down from one clock;
//
//   **none of it costs a run that never meets it** - the kind is gated on 9:00 and the
//   roll cannot notice it before then.
//
// The numbers the tests measure against are read out of balance.js, never copied.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { logic } from '../src/core/rng.js';
import { TAU } from '../src/core/math.js';
import { makeEnemy } from '../src/game/kinds.js';
import { killEnemy } from '../src/game/enemies.js';
import { crowdBudget, crowdCost, roomToSpare, pickMember, updateWaves } from '../src/game/waves.js';
import { braceProgress, isBraced, isDiving, newPack, packOf, packSize, updateFlocks } from '../src/game/flock.js';
import { scriptedRun, stepTheWorld } from '../tools/headless/scripted.js';
import { crowdUntilRoomIs as crowdUpToRoomIs } from '../tools/headless/balance-tools.js';

const STEP = BALANCE.sim.step;
const S = BALANCE.kinds.swarmling;
const F = S.flock;
const W = BALANCE.waves;
/** A moment past the swarm's `from`, so the director may buy one. */
const LATE = S.from + 30;
/** Where `scriptedRun` puts the ship, and so where everything here starts from. */
const SHIP = { x: BALANCE.arena.w / 2, y: BALANCE.arena.h / 2 };

/**
 * A run parked `seconds` old. The director stays on a leash (the scripted world's
 * `spawnTimer = Infinity`) unless a test says it wants arrivals, which is what lets a
 * flock test measure one pack and nothing else.
 */
function runAged(seed, seconds) {
  const field = scriptedRun(seed);
  field.elapsed = seconds;
  return field;
}

/** Let the director run. */
function withDirector(field) {
  field.spawnTimer = 0;
  return field;
}

/**
 * Stand a crowd in the arena until exactly `room` points of its budget are free. The
 * dearest bodies go in first so the crowd stays small enough to miss the ceiling on
 * bodies, and the cheapest closes the last point, which is what makes it exactly `room`
 * rather than about it.
 */
function crowdUntilRoomIs(field, room) {
  field.enemies.length = 0;
  return crowdUpToRoomIs(field, room);
}

/** Stand a pack of `count` swarmlings in the crowd around (x, y), like an arrival. */
function packAt(field, count, x, y, clump) {
  const pack = newPack(F, x, y);
  field.flocks.push(pack);
  const bodies = [];
  for (let i = 0; i < count; i++) {
    const angle = logic.range(0, TAU);
    const reach = logic.range(0, clump === undefined ? S.pack.clump : clump);
    const enemy = makeEnemy(field, 'swarmling',
      x + Math.cos(angle) * reach, y + Math.sin(angle) * reach, { flock: pack });
    field.enemies.push(enemy);
    bodies.push(enemy);
  }
  return { pack: pack, bodies: bodies };
}

function alive(field, bodies) {
  return bodies.filter((body) => field.enemies.includes(body));
}

/** How far the widest living body of a pack is from its middle, in px. */
function spreadOf(field, bodies) {
  let worst = 0;
  for (const body of alive(field, bodies)) {
    const pack = packOf(body);
    worst = Math.max(worst, Math.hypot(body.x - pack.cx, body.y - pack.cy));
  }
  return worst;
}

/** The mean distance from the ship over the living bodies of a list. */
function meanDistance(field, bodies) {
  const list = alive(field, bodies);
  if (list.length === 0) return -1;
  let sum = 0;
  for (const body of list) sum += Math.hypot(body.x - field.player.x, body.y - field.player.y);
  return sum / list.length;
}

/** How far the pack's middle travels in `seconds` of play, px/s. Averaged over the
 * middle, so the shoving a crowd does to itself cancels out the way it does in real
 * life: a pair pushes equal and opposite. */
function paceOf(field, bodies, seconds) {
  const pack = packOf(alive(field, bodies)[0]);
  const x = pack.cx;
  const y = pack.cy;
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) stepTheWorld();
  return Math.hypot(pack.cx - x, pack.cy - y) / seconds;
}

/** Step until the pack is on beat `want`, and say how long that took. */
function untilStage(field, pack, want, limit) {
  const guard = Math.round((limit === undefined ? 30 : limit) / STEP);
  for (let i = 0; i < guard; i++) {
    if (pack.stage === want) return i * STEP;
    stepTheWorld();
  }
  throw new Error('the pack never reached beat "' + want + '" in ' + (limit === undefined ? 30 : limit) + ' s');
}

/** Play `seconds` and report every beat change: [{ t, stage }]. */
function watchBeats(field, pack, seconds) {
  const beats = [];
  let last = pack.stage;
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    stepTheWorld();
    if (pack.stage !== last) { beats.push({ t: (i + 1) * STEP, stage: pack.stage }); last = pack.stage; }
  }
  return beats;
}

/** The shortest signed angle from `from` to `to`. */
function turn(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// --- the pack as an arrival ---------------------------------------------------

test('a swarm is one member of a wave, however many bodies it turns into', () => {
  const field = runAged(700, LATE);
  let packs = 0;
  let waves = 0;
  for (let i = 0; i < 4000; i++) {
    field.enemies.length = 0;
    withDirector(field);
    const wave = updateWaves(field, STEP);
    if (!wave) continue;
    waves++;
    const swarm = wave.members.filter((enemy) => enemy.type === 'swarmling');
    if (swarm.length === 0) continue;
    packs++;
    // One arrival: they all belong to one pack, and it is the pack that is a member.
    const pack = packOf(swarm[0]);
    assert.ok(pack !== null, 'a swarm arrived without a pack to fly with');
    for (const body of swarm) {
      assert.equal(packOf(body), pack, 'every body of the arrival flies with the same pack');
      assert.equal(body.elite, false, 'and none of them is gold - a leader is one body');
    }
    assert.ok(swarm.length <= S.pack.into, 'a pack is never bigger than its kind says');
  }
  assert.ok(packs > 20, 'the director sent ' + packs + ' swarms in ' + waves + ' waves to look at');
});

test('a pack arrives standing together, off the window, and never on the ship', () => {
  const field = runAged(701, LATE);
  const ship = field.player;
  let looked = 0;
  for (let i = 0; i < 600; i++) {
    field.enemies.length = 0;
    withDirector(field);
    const wave = updateWaves(field, STEP);
    if (!wave) continue;
    const swarm = wave.members.filter((enemy) => enemy.type === 'swarmling');
    if (swarm.length < 2) continue;
    looked++;

    const halfW = field.view.w / 2;
    const halfH = field.view.h / 2;
    let furthest = 0;
    for (const body of swarm) {
      assert.ok(Math.abs(body.x - ship.x) > halfW || Math.abs(body.y - ship.y) > halfH,
        'a swarmling arrived in plain sight at ' + body.x.toFixed(0) + ',' + body.y.toFixed(0));
      assert.ok(body.x > 0 && body.x < field.arena.w && body.y > 0 && body.y < field.arena.h,
        'and one arrived outside the world');
      assert.ok(Math.hypot(body.x - ship.x, body.y - ship.y) > W.minDistance,
        'and one arrived within reach of the ship');
      const middle = packOf(body);
      furthest = Math.max(furthest, Math.hypot(body.x - middle.cx, body.y - middle.cy));
    }
    // The clump is the whole read of "one thing is coming from over there", so a pack
    // that arrived smeared across the window would be a different kind of enemy.
    assert.ok(furthest <= S.pack.clump + 1, 'the pack stood ' + furthest.toFixed(0) + ' px across');
  }
  assert.ok(looked > 20, 'looked at ' + looked + ' arrivals');
});

test('a swarm is only rolled when the room can pay for a swarm', () => {
  const price = S.cost * S.pack.min;
  assert.ok(W.waveMinPoints >= price,
    'the smallest wave the director spends is worth a swarm of ' + S.pack.min);
  assert.ok(W.waveMaxPoints >= S.cost * S.pack.into,
    'and the biggest is worth a whole one of ' + S.pack.into);

  const field = runAged(702, LATE);
  for (let i = 0; i < 600; i++) {
    assert.notEqual(pickMember(field, price - 1), 'swarmling',
      (price - 1) + ' points buys bodies, but never a swarm');
  }
  let rolled = false;
  for (let i = 0; i < 600; i++) if (pickMember(field, price) === 'swarmling') rolled = true;
  assert.ok(rolled, price + ' points buys a swarm, and it was rolled at least once');
});

test('a pack is bought with the room, body by body, and never overspends', () => {
  for (const room of [W.waveMinPoints, 20, W.waveMaxPoints, W.waveMaxPoints + 20]) {
    const field = runAged(724, LATE);
    let swarms = 0;

    for (let i = 0; i < 400; i++) {
      // Crowd the arena until exactly `room` points of its budget are free, then ask
      // the director for a wave and hold it to what it was given.
      crowdUntilRoomIs(field, room);
      assert.equal(roomToSpare(field), room, 'the room is ' + room);

      withDirector(field);
      const wave = updateWaves(field, STEP);
      if (!wave) continue;
      let cost = 0;
      for (const enemy of wave.members) cost += enemy.cost;
      assert.equal(wave.points, cost, 'the wave reports what its own members cost');
      assert.ok(cost <= room, 'a wave cost ' + cost + ' of the ' + room + ' points of room');

      const swarm = wave.members.filter((enemy) => enemy.type === 'swarmling');
      if (swarm.length === 0) continue;
      swarms++;
      assert.ok(swarm.length >= S.pack.min, 'a swarm of ' + swarm.length + ' is not a swarm');
      assert.ok(swarm.length <= S.pack.into, 'and never more than a whole one');
      assert.ok(swarm.length * S.cost <= Math.min(room, W.waveMaxPoints),
        swarm.length + ' bodies cost more than the wave was allowed to spend');
    }
    assert.ok(swarms > 10, 'a room of ' + room + ' brought ' + swarms + ' swarms in 400 waves');
  }
});

test('a wave brings one swarm, not two', () => {
  // Two packs in one wave is not one arrival coming in, it is a screenful, and the
  // fan has one place for a swarm however many bodies it turns into.
  const field = runAged(723, LATE);
  for (let i = 0; i < 3000; i++) {
    field.enemies.length = 0;
    withDirector(field);
    const wave = updateWaves(field, STEP);
    if (!wave) continue;
    const packs = new Set();
    for (const enemy of wave.members) {
      if (enemy.type !== 'swarmling') continue;
      packs.add(packOf(enemy));
    }
    assert.ok(packs.size <= 1, 'a wave brought ' + packs.size + ' swarms');
  }
});

test('a crowd near the ceiling on bodies is a crowd no swarm is added to', () => {
  const field = runAged(703, LATE);
  // Leave three places left, which is room to spend by the budget and none by the bodies:
  // a pack that would have to arrive in threes does not arrive at all.
  while (field.enemies.length < W.maxBodies - 3) {
    field.enemies.push(makeEnemy(field, 'drifter', 200 + field.enemies.length * 4, 200));
  }
  for (let i = 0; i < 400; i++) {
    withDirector(field);
    const wave = updateWaves(field, STEP);
    assert.ok(field.enemies.length <= W.maxBodies, 'the ceiling held at ' + field.enemies.length);
    if (!wave) continue;
    const swarm = wave.members.filter((enemy) => enemy.type === 'swarmling');
    assert.ok(swarm.length === 0 || swarm.length >= S.pack.min,
      'a pack of ' + swarm.length + ' was squeezed into the last few places');
    field.enemies.length = 0;
  }
});

test('the swarm is not on the stage before PLAN wants it', () => {
  const field = runAged(704, S.from - 1);
  const seen = new Set();
  for (let i = 0; i < 800; i++) seen.add(pickMember(field, Infinity));
  assert.equal(seen.has('swarmling'), false, 'the roll cannot bring one yet');

  field.elapsed = LATE;
  const late = new Set();
  for (let i = 0; i < 800; i++) late.add(pickMember(field, Infinity));
  assert.ok(late.has('swarmling'), 'and one second past its time it can');
});

test('a roll asked to leave the packs alone brings one body, never a swarm', () => {
  // This is how an elite's kind is chosen: a gold body is one body, and a wave led by
  // twenty gold things is not the event the roll means.
  const field = runAged(705, LATE);
  for (let i = 0; i < 2000; i++) {
    assert.notEqual(pickMember(field, Infinity, false), 'swarmling', 'not one of them');
  }
  let plain = false;
  for (let i = 0; i < 400; i++) if (pickMember(field, Infinity) === 'swarmling') plain = true;
  assert.ok(plain, 'and the same roll with the packs left in brings them');
});

test('a gold wave is never a swarm, however late the run is', () => {
  const field = runAged(706, LATE);
  let gold = 0;
  for (let i = 0; i < 1500; i++) {
    field.enemies.length = 0;
    withDirector(field);
    const wave = updateWaves(field, STEP);
    if (!wave) continue;
    for (const enemy of wave.members) {
      if (!enemy.elite) continue;
      gold++;
      assert.notEqual(enemy.type, 'swarmling', 'a swarm arrived with a gold body in it');
    }
  }
  assert.ok(gold > 20, 'the waves did bring gold bodies: ' + gold);
});

// --- the flock as a relationship ----------------------------------------------

test('a pack holds itself together while it chases', () => {
  const field = runAged(707, LATE);
  // Scattered far wider than the circle its kind wants to fly in, so the only way this
  // passes is if the pull back towards the middle of the pack is real.
  const pack = packAt(field, S.pack.into, SHIP.x + 700, SHIP.y, F.keep * 4);
  const bodies = pack.bodies;
  const was = spreadOf(field, bodies);

  for (let i = 0; i < Math.round(20 / STEP); i++) stepTheWorld();

  const now = spreadOf(field, bodies);
  assert.equal(alive(field, bodies).length, bodies.length, 'nothing died on its own');
  assert.ok(now < was * 0.6, 'the pack came together as it flew: ' + was.toFixed(0) + ' px to ' + now.toFixed(0));
  assert.ok(now < F.keep * 2.5, 'and it settled into a pack: ' + now.toFixed(0) + ' px across');
  const nearer = meanDistance(field, bodies);
  assert.ok(nearer < 500, 'the pack got to the ship: it is ' + nearer.toFixed(0) + ' px away on average');
});

test('the middle and the heading are the crowd that is still alive', () => {
  const field = runAged(708, LATE);
  const pack = packAt(field, 10, 1900, 1500, 20);
  updateFlocks(field, STEP);

  const p = packOf(pack.bodies[0]);
  assert.equal(packSize(pack.bodies[0]), 10, 'the pack knows all ten of them');
  let sx = 0;
  let sy = 0;
  for (const body of pack.bodies) { sx += body.x; sy += body.y; }
  assert.ok(Math.abs(p.cx - sx / 10) < 1e-9, 'its middle is the middle of its bodies');
  assert.ok(Math.abs(p.cy - sy / 10) < 1e-9);

  killEnemy(field, pack.bodies[0], false);
  updateFlocks(field, STEP);
  assert.equal(packSize(pack.bodies[1]), 9, 'and a body that died is not in it any more');
  let tx = 0;
  let ty = 0;
  for (const body of alive(field, pack.bodies)) { tx += body.x; ty += body.y; }
  assert.ok(Math.abs(p.cx - tx / 9) < 1, 'the middle moved with the death');
});

test('a pack with nobody left in it is gone from the world', () => {
  const field = runAged(709, LATE);
  const pack = packAt(field, 4, 1900, 1500, 10);
  stepTheWorld();
  assert.ok(field.flocks.includes(pack.pack), 'the world is holding the pack');

  for (const body of pack.bodies) killEnemy(field, body, false);
  stepTheWorld();
  assert.equal(field.flocks.includes(pack.pack), false, 'and it stopped holding it');
  assert.equal(packSize(pack.bodies[1]), 0, 'nothing is flying in it any more');
});
test('a lone swarmling has no pack, and flies at the ship anyway', () => {
  const field = runAged(710, LATE);
  const ship = field.player;
  const lone = makeEnemy(field, 'swarmling', ship.x + 500, ship.y);
  field.enemies.push(lone);
  const was = Math.hypot(lone.x - ship.x, lone.y - ship.y);

  for (let i = 0; i < Math.round(4 / STEP); i++) stepTheWorld();

  assert.equal(packOf(lone), null, 'a body built by hand flies alone');
  assert.equal(isBraced(lone), false, 'it never braces');
  assert.equal(isDiving(lone), false, 'and it never commits');
  const now = Math.hypot(lone.x - ship.x, lone.y - ship.y);
  assert.ok(now < was - 100, 'but it still came: ' + (was - now).toFixed(0) + ' px closer');
});

test('a body turns as fast as its kind allows and no faster', () => {
  const field = runAged(711, LATE);
  const pack = packAt(field, 12, 1900, 1500, 30);
  const turns = [];
  let last = pack.bodies.map((body) => body.rot);

  for (let i = 0; i < Math.round(10 / STEP); i++) {
    const wasDiving = isDiving(pack.bodies[0]);
    stepTheWorld();
    // A dive is a commitment, not a turn: the whole pack takes the line it was shown in
    // one step, which is the promise, so it is not this test's business.
    if (!wasDiving && !isDiving(pack.bodies[0])) {
      pack.bodies.forEach((body, index) => {
        turns.push(Math.abs(turn(last[index], body.rot)));
      });
    }
    last = pack.bodies.map((body) => body.rot);
  }
  const fastest = Math.max(...turns);
  const ceiling = F.turn * STEP + 1e-9;
  assert.ok(turns.length > 1000, 'looked at ' + turns.length + ' turns');
  assert.ok(fastest <= ceiling,
    'a body turned ' + fastest.toFixed(5) + ' rad in one step; its kind allows ' + ceiling.toFixed(5));
});

test('the flock spends no number out of the stream a run is made of', () => {
  const field = runAged(712, LATE);
  packAt(field, S.pack.into, 1900, 1500);
  stepTheWorld();
  const state = logic.state;
  for (let i = 0; i < Math.round(5 / STEP); i++) stepTheWorld();
  assert.equal(logic.state, state, 'five seconds of flocking, and the stream never moved');
});

test('the swarm never leaves the arena', () => {
  const field = runAged(713, LATE);
  // A pack starting in a corner of the world, so that half its cycle is spent against
  // a wall it wants to fly through.
  const pack = packAt(field, S.pack.into, 60, 60, 30);
  for (let i = 0; i < Math.round(30 / STEP); i++) {
    stepTheWorld();
    for (const body of pack.bodies) {
      // A neighbour's shove can push a body a little past the clamp the walk applies,
      // by its own width and no more - which is true of every kind in the crowd.
      assert.ok(body.x > 0 && body.x < field.arena.w && body.y > 0 && body.y < field.arena.h,
        'a swarmling left the world at ' + body.x.toFixed(1) + ',' + body.y.toFixed(1));
    }
  }
});

// --- the dive as a promise ----------------------------------------------------

test('a pack gathers, braces, commits, and does it again', () => {
  const field = runAged(714, LATE);
  const pack = packAt(field, 12, 1900, 1500, 20);
  const beats = watchBeats(field, pack.pack, 30);
  // The whole cycle, in order, and each beat as long as its own number says. `''` is
  // the gather: the pack is chasing, and nothing is being promised.
  const AFTER = { brace: 'dive', dive: '', '': 'brace' };
  const LENGTH = { brace: F.brace, dive: F.dive.time, '': F.gather };

  assert.ok(beats.length >= 10, 'thirty seconds of a pack saw ' + beats.length + ' beat changes');
  assert.equal(beats[0].stage, 'brace', 'it starts by bunching up, not by diving');
  for (let i = 0; i + 1 < beats.length; i++) {
    const stage = beats[i].stage;
    const length = beats[i + 1].t - beats[i].t;
    assert.equal(beats[i + 1].stage, AFTER[stage],
      'beat "' + stage + '" was followed by "' + beats[i + 1].stage + '"');
    assert.ok(Math.abs(length - LENGTH[stage]) < STEP * 1.5,
      'and "' + stage + '" lasted ' + length.toFixed(3) + ' s, its kind says ' + LENGTH[stage]);
  }
});

test('every body of the pack flies the one line the pack locked', () => {
  const field = runAged(715, LATE);
  const pack = packAt(field, 14, 1900, 1500, 24);
  const p = pack.pack;

  untilStage(field, p, 'brace');
  assert.equal(p.stage, 'brace', 'the pack is bracing');
  untilStage(field, p, 'dive');
  assert.equal(p.stage, 'dive', 'and has now committed');

  const line = Math.atan2(p.dirY, p.dirX);
  const toShip = Math.atan2(field.player.y - p.cy, field.player.x - p.cx);
  assert.ok(Math.abs(turn(line, toShip)) < 0.02, 'the line is the line to the ship, not one to each body');

  const p0 = { x: p.cx, y: p.cy };
  const rots = pack.bodies.map((body) => body.rot);
  stepTheWorld();
  const dx = p.cx - p0.x;
  const dy = p.cy - p0.y;
  const walked = Math.hypot(dx, dy);
  assert.ok(walked > 1, 'the pack moved ' + walked.toFixed(1) + ' px in a step');
  // The middle is the honest measure: whatever the bodies shove in each other cancels.
  assert.ok(Math.abs(turn(line, Math.atan2(dy, dx))) < 1e-9, 'the whole pack went along one line');

  const pace = alive(field, pack.bodies)[0].speed * F.dive.mul * STEP;
  assert.ok(Math.abs(walked - pace) < pace * 0.2,
    'and at the speed its dive says: ' + walked.toFixed(2) + ' px in a step, ' + pace.toFixed(2) + ' asked');
  rots.forEach((was, i) => {
    assert.ok(Math.abs(turn(line, pack.bodies[i].rot)) < 1e-9, 'a body points along the line it was shown');
  });
});

test('a pack bunches up while it braces, and crawls while it does', () => {
  const field = runAged(716, LATE);
  const pack = packAt(field, 16, 1900, 1500, F.keep * 1.6);
  const p = pack.pack;

  const walked = paceOf(field, pack.bodies, 0.5);
  const wide = spreadOf(field, pack.bodies);

  untilStage(field, p, 'brace');
  assert.equal(p.stage, 'brace', 'the pack is bracing');
  const crawling = paceOf(field, pack.bodies, F.brace * 0.5);
  const bunched = spreadOf(field, pack.bodies);

  assert.ok(crawling < walked * 0.75,
    'it crawled at ' + crawling.toFixed(0) + ' px/s against ' + walked.toFixed(0) + ' px/s walking');
  assert.ok(bunched < wide,
    'and it bunched: ' + wide.toFixed(0) + ' px across to ' + bunched.toFixed(0));
  assert.ok(bunched < F.keep, 'to inside the circle its numbers ask for: ' + bunched.toFixed(0) + ' px');
});

test('a dive is faster than the walk, and the tell counts down the same beat', () => {
  const field = runAged(717, LATE);
  const pack = packAt(field, 8, 1900, 1500, 20);
  const p = pack.pack;
  const body = pack.bodies[0];

  untilStage(field, p, 'brace');
  const told = [];
  while (p.stage === 'brace') {
    told.push(braceProgress(body));
    stepTheWorld();
  }
  assert.ok(told.length > 10, 'the brace lasted ' + told.length + ' steps');
  for (let i = 1; i < told.length; i++) {
    assert.ok(told[i] >= told[i - 1] - 1e-9, 'the tell only ever runs forwards');
  }
  assert.ok(told[0] < 0.2, 'it starts at nothing, so the change is the read');
  assert.ok(told[told.length - 1] > 0.7,
    'and it gets all the way to the moment the pack commits: ' + told[told.length - 1].toFixed(2));

  const before = { x: body.x, y: body.y };
  stepTheWorld();
  const dived = Math.hypot(body.x - before.x, body.y - before.y);
  assert.ok(dived > body.speed * STEP * F.dive.mul * 0.9,
    'a diving body covered ' + dived.toFixed(2) + ' px in a step, over its walking '
    + (body.speed * STEP).toFixed(2));
  assert.equal(braceProgress(body), 0, 'and the tell is off, because the beat it counted is over');
});

test('a lone body asks the tell for nothing', () => {
  const field = runAged(718, LATE);
  const lone = makeEnemy(field, 'swarmling', 900, 900);
  field.enemies.push(lone);
  stepTheWorld();
  assert.equal(braceProgress(lone), 0);
  assert.equal(isBraced(lone), false);
  assert.equal(isDiving(lone), false);
});

// --- what a body is, and what it pays -----------------------------------------

test('a swarmling is the smallest body in the game, and costs like it', () => {
  const field = runAged(719, LATE);
  const body = makeEnemy(field, 'swarmling', 900, 900);
  const others = Object.keys(BALANCE.kinds).filter((name) => name !== 'swarmling');
  const thinnest = Math.min(...others.map((name) => BALANCE.kinds[name].radius));
  assert.ok(body.r < thinnest, 'it is thinner than anything else walking');
  assert.equal(body.cost, S.cost);
  assert.equal(S.cost, Math.min(...Object.values(BALANCE.kinds).map((kind) => kind.cost)),
    'and it is the cheapest body the director can buy');
});

test('a pack counts against the budget body by body', () => {
  const field = runAged(720, LATE);
  const pack = packAt(field, 12, 1900, 1500, 20);
  assert.equal(crowdCost(field), 12 * S.cost, 'twelve bodies, twelve times one point');
  assert.equal(field.flocks.length, 1, 'and one pack');
});

test('a swarmling that dies pays like any other body', () => {
  const field = runAged(721, LATE);
  const pack = packAt(field, 3, 1900, 1500, 10);
  const body = pack.bodies[0];
  const before = { score: field.score, kills: field.kills, shards: field.shards.count };

  killEnemy(field, body, true);
  assert.equal(field.score, before.score + S.score);
  assert.equal(field.kills, before.kills + 1);
  assert.equal(field.shards.count, before.shards + S.drop);
});

// --- the whole thing, in a live run -------------------------------------------

test('a run that plays past 9:00 meets a swarm', () => {
  const field = withDirector(runAged(722, LATE));
  const held = crowdBudget(field) - W.waveMinPoints;
  let onScreen = 0;
  let best = 0;
  const seen = new Set();

  for (let i = 0; i < Math.round(180 / STEP); i++) {
    stepTheWorld();
    const swarm = field.enemies.filter((enemy) => enemy.type === 'swarmling');
    if (swarm.length > 0) onScreen++;
    if (swarm.length > best) best = swarm.length;
    for (const body of swarm) {
      seen.add(body.flock);
      assert.ok(Number.isFinite(body.x) && Number.isFinite(body.y), 'a swarmling lost its position');
    }
    // Somebody is killing things, or the arena fills up and the director stops sending.
    if (crowdCost(field) > held || field.enemies.length > W.maxBodies - 8) {
      killEnemy(field, field.enemies[0], false);
    }
  }

  assert.ok(seen.size >= 2, 'three minutes of a late crowd brought ' + seen.size + ' packs');
  assert.ok(onScreen > 600, 'a swarm was standing in the arena for ' + onScreen + ' steps');
  assert.ok(best >= S.pack.min, 'the biggest pack on screen at once was ' + best + ' bodies');
});
