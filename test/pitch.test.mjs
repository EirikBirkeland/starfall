// The two pitch stories PLAN section 5 asks for: "hits pitched by enemy size" and "pickups
// rising in pitch with a streak".
//
// Both are read at the cue queue (game/cues.js), which is the one door the simulation has to
// audio: what a run asks to be heard is a fact about the run, and the synthesiser downstream
// only turns it into voices (test/ui-sound.test.mjs is about the sounds that never come through
// this door at all). Reading them here rather than off an audio stub also keeps the promise that a
// pitch cannot move a run: nothing in this file needs a browser or a sound card.
//
// Every test drives `stepWorld` directly on a parked run (tools/headless/scripted.js), so a note
// is measured against a body standing where it was put and not against a crowd that happened to
// arrive.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scriptedRun, enemyAt, bulletFlyingToward, stepTheWorld,
} from '../tools/headless/scripted.js';
import { makeEnemy } from '../src/game/kinds.js';
import { dropShards } from '../src/game/pickups.js';
import { resetRun } from '../src/game/run.js';
import { clearCues, drainCues } from '../src/game/cues.js';
import { BALANCE } from '../src/game/balance.js';
import { world } from '../src/game/world.js';

const ROW = BALANCE.bullets.impactSound;
const SHARD = BALANCE.shards.sound;
const CLIMB = SHARD.streak;
const STEP = BALANCE.sim.step;

/** Every beep queued since the last call. */
function beepsHeard() {
  const out = [];
  drainCues((cue) => { if (cue.kind === 'beep') out.push(cue); });
  return out;
}

/**
 * Park a run for a pitch test: the ship out of the way and unhurtable, nothing arriving, and the
 * next level pushed out of reach. That last one is not tampering with the balance, it is leaving
 * out the one part of a run these tests are not about - a level is a pause for its cards
 * (game/upgrades.js `refreshOffer`) and a paused run collects nothing.
 */
function quietRun() {
  scriptedRun(7);
  const ship = world.player;
  ship.x = 200; ship.y = 200; ship.px = 200; ship.py = 200;
  world.xpNeed = Infinity;
  clearCues();
  return world;
}

/**
 * Fire one shot into a body that will survive it and report the tick the hit made. The body is
 * given a pile of hull on purpose: a body that dies plays its own death and no impact tick, and
 * this file is about the tick.
 */
function shootAt(enemy) {
  const shot = bulletFlyingToward(enemy.x - 40, enemy.y, 4000, 0, 0, 0);
  clearCues();
  let steps = 0;
  while (shot.hits.length === 0 && steps < 60) {
    stepTheWorld();
    steps++;
  }
  assert.ok(shot.hits.length > 0, 'the shot never landed on the body it was aimed at');
  const ticks = beepsHeard();
  assert.equal(ticks.length, 1, 'one hit, one tick, got ' + ticks.length);
  return ticks[0].freq;
}

/**
 * Stand a body of the given kind (or of a size of the test's own) at `y` in the shooting lane.
 * Each one gets its own lane: two bodies at one spot would be one target, and the shot would
 * answer for whichever of them the grid happened to hand back first.
 */
function bodyAt(kind, y, radius) {
  const enemy = makeEnemy(world, kind, 900, y, {
    hp: 400, speed: 0, r: radius === undefined ? undefined : radius,
  });
  enemy.spin = 0;
  world.enemies.push(enemy);
  return enemy;
}

test('a hit is pitched by the body it landed on, and a bigger body is lower', () => {
  quietRun();
  const small = shootAt(bodyAt('swarmling', 600));
  const mid = shootAt(bodyAt('drifter', 900));
  const big = shootAt(bodyAt('tank', 1200));

  assert.ok(small > mid, 'a swarmling (' + small.toFixed(0) + ' Hz) should ring above a drifter ('
    + mid.toFixed(0) + ')');
  assert.ok(mid > big, 'a drifter (' + mid.toFixed(0) + ' Hz) should ring above a tank ('
    + big.toFixed(0) + ')');

  // The row says an inverse of the radius, so the notes stand in the same ratio the bodies do -
  // within the jitter each of them carries.
  const sizes = BALANCE.kinds.tank.radius / BALANCE.kinds.swarmling.radius;
  assert.ok(Math.abs(small / big - sizes) < sizes * 0.15,
    'a body ' + sizes + 'x the size should sit about ' + sizes + 'x higher, got '
    + (small / big).toFixed(2));
});

test('the note is the body the shot met, not the kind it belongs to', () => {
  // A boss's piece, a hatchling, a swollen body: the hit is measured against the body the shot
  // actually arrived on (game/bullets.js reads `enemy.r`), which is the only reading that works
  // for the fights that are made of several bodies at several sizes.
  quietRun();
  const fat = shootAt(bodyAt('weaver', 600, 48));
  const plain = shootAt(bodyAt('weaver', 900));
  assert.ok(plain > fat, 'the same kind stood on a bigger body rings lower: '
    + plain.toFixed(0) + ' against ' + fat.toFixed(0));
});

test('the band is clamped, so a nonsense body still makes a tick', () => {
  quietRun();
  const low = shootAt(bodyAt('drifter', 600, 4000));
  assert.ok(Number.isFinite(low) && low > 0, 'an absurd body still gets a note, got ' + low);
  assert.ok(low >= ROW.low && low <= ROW.low + ROW.jitter,
    'a body that big sits on the floor of the band, got ' + low);
});

test('no ordinary body sits on the clamp', () => {
  // The clamp is there for a boss's frame and for nonsense, not for the crowd. If a kind's own
  // size landed on it then the row's `hz` and `at` are wrong and every hit in the game is saying
  // one note, which is the exact thing this row was written to stop.
  for (const id of Object.keys(BALANCE.kinds)) {
    const radius = BALANCE.kinds[id].radius;
    const note = ROW.hz * ROW.at / radius;
    assert.ok(note > ROW.low && note < ROW.high,
      id + ' (' + radius + ' px) sits at ' + note.toFixed(0) + ' Hz, outside the band');
  }
});

test('the impact row is a whole row of numbers a voice can use', () => {
  for (const key of ['at', 'hz', 'low', 'high', 'jitter', 'bend', 'dur', 'vol']) {
    assert.equal(typeof ROW[key], 'number', 'impactSound.' + key + ' is missing');
  }
  assert.ok(ROW.low < ROW.high, 'the band is a band');
  assert.ok(ROW.bend > 0 && ROW.bend < 1, 'the note falls below where it started');
});

// --- the shard's climb ---------------------------------------------------------------
// The ship is parked and the loot is dropped on it, one shard at a time, so "inside the window"
// and "after the window" are both things this file controls exactly: a shard born within
// `collectRadius` of the ship is paid for on the step it is born.

/** Collect exactly one shard and report the note it was paid with. */
function takeOneShard() {
  clearCues();
  const before = world.shardsCollected;
  dropShards(world, world.player.x, world.player.y, 1);
  let steps = 0;
  while (world.shardsCollected === before && steps < 30) {
    stepTheWorld();
    steps++;
  }
  assert.equal(world.shardsCollected, before + 1, 'the shard was never collected');
  const pings = beepsHeard();
  assert.equal(pings.length, 1, 'one shard, one ping, got ' + pings.length);
  return pings[0].freq;
}

test('a handful of shards climbs, one step each', () => {
  quietRun();
  const notes = [takeOneShard(), takeOneShard(), takeOneShard(), takeOneShard()];
  const step = Math.pow(2, CLIMB.step / CLIMB.stepsPerOctave);
  for (let i = 1; i < notes.length; i++) {
    assert.ok(notes[i] > notes[i - 1], 'shard ' + (i + 1) + ' did not rise: '
      + notes.map((n) => n.toFixed(0)).join(', '));
    // One step of the octave the row splits, give or take the jitter either note carries.
    assert.ok(Math.abs(notes[i] / notes[i - 1] / step - 1) < 0.05,
      'the step was ' + (notes[i] / notes[i - 1]).toFixed(3) + ', expected ' + step.toFixed(3));
  }
  // The first of the handful is the plain note: a streak of one has nothing to climb with.
  assert.ok(Math.abs(notes[0] / SHARD.base - 1) < 0.05,
    'the first shard of a handful sits on the base note, got ' + notes[0].toFixed(0));
  assert.equal(world.shardStreak.count, notes.length - 1);
});

test('and the note comes home when the loot stops', () => {
  quietRun();
  const first = takeOneShard();
  takeOneShard();
  const top = takeOneShard();
  assert.ok(top > first);

  // Longer than the window with nothing collected: that is all a streak needs to be over.
  const cold = Math.ceil(CLIMB.window / STEP) + 2;
  for (let i = 0; i < cold; i++) stepTheWorld();
  assert.equal(world.shardStreak.left, 0, 'the row should have gone cold');
  assert.equal(world.shardStreak.count, 0);

  const again = takeOneShard();
  assert.ok(again < top, 'after the wait the note is back down: '
    + again.toFixed(0) + ' against ' + top.toFixed(0));
  assert.ok(Math.abs(again / first - 1) < 0.05,
    'and back on the plain note, within its jitter');
});

test('the climb has a ceiling, and it is the octave the row says', () => {
  quietRun();
  let top = 0;
  for (let i = 0; i <= CLIMB.max; i++) top = takeOneShard();   // one more than it has steps
  assert.equal(world.shardStreak.count, CLIMB.max, 'the streak stops at its ceiling');
  const ceiling = SHARD.base * Math.pow(2, CLIMB.max / CLIMB.stepsPerOctave);
  assert.ok(Math.abs(top / ceiling - 1) < 0.05,
    'the top of the climb is one octave over the base, got ' + top.toFixed(0));
});

test('the streak is a fact about the run and starts again with it', () => {
  quietRun();
  takeOneShard();
  takeOneShard();
  assert.ok(world.shardStreak.count > 0, 'the climb had begun');
  // A new run is not still climbing with the last one's loot (game/run.js `resetRun`).
  resetRun(world);
  assert.equal(world.shardStreak.count, 0);
  assert.equal(world.shardStreak.left, 0);
});

test('a pickup pays its note, whatever the streak did to it', () => {
  // The bend is a ratio of the note it started on (BALANCE.shards.sound.bend), which is what
  // lets a shard at the top of a streak still rise instead of sliding down to the ceiling the
  // bottom one slid to. The cue carries both halves: the note and where it slides.
  quietRun();
  clearCues();
  dropShards(world, world.player.x, world.player.y, 1);
  while (world.shardsCollected === 0) stepTheWorld();
  const ping = beepsHeard()[0];
  assert.ok(ping.slideTo > ping.freq * SHARD.bend * 0.99,
    'the ping bends up from its own note, not to one fixed ceiling');
  assert.ok(ping.slideTo <= ping.freq * SHARD.bend * 1.01);
});
