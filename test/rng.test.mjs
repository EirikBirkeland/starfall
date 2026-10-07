// The seeded generator: repeatable, well spread out, and split into three streams
// so that the way things are drawn - and how thickly the sparks are thrown - can
// never move the simulation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng, logic, fx, visual, setSeed, getSeed, randomSeed } from '../src/core/rng.js';

const SAMPLES = 20000;

function take(rng, count) {
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = rng.next();
  return out;
}

/** A fresh stream built from `seed`. */
function streamFor(seed) {
  const rng = new Rng(0);
  rng.reset(seed);
  return rng;
}

/** The first `count` numbers a fresh stream built from `seed` produces. */
function opening(seed, count) {
  return take(streamFor(seed), count);
}

test('a seed always produces the same numbers', () => {
  const first = take(streamFor(123456), 500);
  const second = take(streamFor(123456), 500);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, take(streamFor(123457), 500), 'a new seed must give a new run');
});

test('setSeed starts both streams over', () => {
  setSeed(9);
  const game = take(logic, 50);
  const eye = take(visual, 50);
  assert.equal(getSeed(), 9);

  setSeed(9);
  assert.deepEqual(take(logic, 50), game);
  assert.deepEqual(take(visual, 50), eye);
});

test('every number sits inside the range it promised', () => {
  const rng = streamFor(7);
  for (let i = 0; i < SAMPLES; i++) {
    const n = rng.next();
    assert.ok(n >= 0 && n < 1, 'next() gave ' + n);
    const r = rng.range(-3, 7);
    assert.ok(r >= -3 && r < 7, 'range(-3, 7) gave ' + r);
    const whole = rng.int(0, 9);
    assert.ok(Number.isInteger(whole) && whole >= 0 && whole <= 9, 'int(0, 9) gave ' + whole);
  }
});

test('the numbers are spread evenly, not bunched up', () => {
  const rng = streamFor(2024);
  const buckets = new Array(10).fill(0);
  let sum = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const n = rng.next();
    buckets[Math.floor(n * 10)]++;
    sum += n;
  }
  const expected = SAMPLES / buckets.length;
  for (const count of buckets) {
    assert.ok(count > expected * 0.85 && count < expected * 1.15,
      'a tenth of the range held ' + count + ' of ' + SAMPLES);
  }
  const mean = sum / SAMPLES;
  assert.ok(Math.abs(mean - 0.5) < 0.01, 'the mean should sit near a half, got ' + mean);

  const whole = new Set();
  for (let i = 0; i < SAMPLES; i++) whole.add(rng.int(0, 9));
  assert.equal(whole.size, 10, 'int(0, 9) never reached every value');
});

test('chance happens about the number of times it says it will', () => {
  const rng = streamFor(99);
  let hits = 0;
  for (let i = 0; i < SAMPLES; i++) if (rng.chance(0.25)) hits++;
  assert.ok(hits > SAMPLES * 0.23 && hits < SAMPLES * 0.27, 'chance(0.25) hit ' + hits + ' times');
  assert.equal(rng.chance(0), false);
  assert.equal(rng.chance(1), true);
});

test('pick only picks from the list, and reaches all of it', () => {
  const rng = streamFor(5);
  const kinds = ['drifter', 'weaver', 'tank'];
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const kind = rng.pick(kinds);
    assert.ok(kinds.includes(kind), 'pick gave ' + kind);
    seen.add(kind);
  }
  assert.equal(seen.size, kinds.length, 'pick never reached every entry');
});

test('seeds that differ by one are not related streams', () => {
  // The simulate tool plays seed, seed+1, seed+2 ... so neighbours must not look
  // like shifted copies of each other.
  const openings = new Set();
  for (let seed = 1; seed <= 64; seed++) openings.add(opening(seed, 8).join(','));
  assert.equal(openings.size, 64, 'two neighbouring seeds opened with the same numbers');
});

test('the three streams read different numbers from one seed', () => {
  setSeed(4321);
  const game = take(logic, 100);
  setSeed(4321);
  const spray = take(fx, 100);
  setSeed(4321);
  const eye = take(visual, 100);
  assert.notDeepEqual(game, spray);
  assert.notDeepEqual(game, eye);
  assert.notDeepEqual(spray, eye);
});

test('reseeding starts the spray over, so a replay sprays the same', () => {
  // The effects stream is replayable like the simulation's: same seed, same spray.
  setSeed(90210);
  const first = take(fx, 60);
  setSeed(90210);
  assert.deepEqual(take(fx, 60), first);
});

test('drawing cannot move the simulation', () => {
  // The whole point of separate streams: however much the renderer and the sparks
  // consume, the game's numbers come out the same.
  setSeed(777);
  for (let i = 0; i < 500; i++) {
    visual.next();
    fx.next();
  }
  const afterADraw = take(logic, 40);

  setSeed(777);
  assert.deepEqual(take(logic, 40), afterADraw);
});

test('randomSeed hands out a fresh 32-bit number every time', () => {
  const seeds = new Set();
  for (let i = 0; i < 200; i++) {
    const seed = randomSeed();
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 4294967296, 'randomSeed gave ' + seed);
    seeds.add(seed);
  }
  assert.ok(seeds.size > 190, 'randomSeed repeated itself ' + (200 - seeds.size) + ' times in 200');
});
