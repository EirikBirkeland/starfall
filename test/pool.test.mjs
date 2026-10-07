// The object pool (PLAN section 2): objects are reused instead of rebuilt, and
// the hot effect lists stop allocating once the pool is warm.
//
// The last test boots a game and plays a whole run, because a pool that is only
// ever exercised by unit tests proves nothing about the game.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Pool } from '../src/core/pool.js';
import { bootGame } from '../tools/headless/harness.js';
import { playOneRun } from '../tools/headless/bot.js';
import { BALANCE } from '../src/game/balance.js';

const ROOT = path.resolve(import.meta.dirname, '..');

/** The shape these tests churn through. `seen` counts visits in the sweep test. */
function sparkPool() {
  return new Pool(() => ({ x: 0, y: 0, life: 0, seen: 0 }));
}

function spawnSome(pool, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(pool.spawn());
  return out;
}

/** Kill everything, back to front, the way an update loop does it. */
function killAll(pool) {
  for (let i = pool.count - 1; i >= 0; i--) pool.killAt(i);
}

test('spawn hands out a live object of the right shape', () => {
  const pool = sparkPool();
  assert.equal(pool.count, 0, 'a fresh pool holds nothing');

  const first = pool.spawn();
  assert.equal(pool.count, 1);
  assert.deepEqual(pool.items, [first]);
  assert.deepEqual(Object.keys(first), ['x', 'y', 'life', 'seen'], 'the shape comes from the factory');

  const second = pool.spawn();
  assert.equal(pool.count, 2);
  assert.notEqual(first, second, 'two lives need two objects');
});

test('a killed object is handed out again instead of a new one being built', () => {
  const pool = sparkPool();
  const first = spawnSome(pool, 5);
  killAll(pool);

  assert.equal(pool.count, 0);
  assert.equal(pool.stats().free, 5, 'every object is in the drawer');

  const second = spawnSome(pool, 5);
  assert.equal(pool.stats().made, 5, 'nothing was built for the second life');
  for (const object of second) {
    assert.ok(first.includes(object), 'a recycled object came back instead of a new one');
  }
});

test('a recycled object keeps its old values until the spawner writes over them', () => {
  // The contract every spawner honours: set every field. This is what makes the
  // pools safe, and this test is what says so out loud.
  const pool = sparkPool();
  const spark = pool.spawn();
  spark.x = 7;
  killAll(pool);

  assert.equal(pool.spawn().x, 7, 'spawn does not wipe it for you');
});

test('killAt drops the last live object into the hole', () => {
  // The unordered contract, stated as a test: anything that needs an ordered
  // list must not live in a pool.
  const pool = sparkPool();
  const [a, b, c] = spawnSome(pool, 3);

  pool.killAt(0);
  assert.equal(pool.count, 2);
  assert.equal(pool.items[0], c, 'the last one moved into the hole');
  assert.equal(pool.items[1], b);
  assert.ok(a.x === 0 && pool.stats().free === 1, 'and the dead one waits in the drawer');
});

test('killAt refuses an index that is not a live object', () => {
  const pool = sparkPool();
  spawnSome(pool, 3);

  assert.throws(() => pool.killAt(3), RangeError, 'one past the end is not live');
  assert.throws(() => pool.killAt(-1), RangeError);
  assert.throws(() => pool.killAt(1.5), RangeError, 'a fractional index is a bug, not a no-op');
  assert.throws(() => pool.killAt(NaN), RangeError);
  assert.equal(pool.count, 3, 'and none of them took');
});

test('trim lets go of that many objects, and never more', () => {
  const pool = sparkPool();
  spawnSome(pool, 10);

  pool.trim(0);
  assert.equal(pool.count, 10, 'asked for nothing, nothing left');

  pool.trim(4);
  assert.equal(pool.count, 6);

  pool.trim(100);
  assert.equal(pool.count, 0, 'trim cannot go below empty');
  assert.equal(pool.stats().free, 10);
});

test('clear empties the live list and keeps the objects for the next run', () => {
  const pool = sparkPool();
  spawnSome(pool, 12);
  pool.clear();

  assert.equal(pool.count, 0);
  assert.equal(pool.stats().free, 12);

  spawnSome(pool, 12);
  assert.equal(pool.stats().made, 12, 'the next run rebuilt nothing');
});

test('a backwards sweep visits every live object exactly once', () => {
  // The pattern in updateEffects: walk down the list, drop what has expired.
  // Removal swaps the last one into the hole, which is behind the cursor - so a
  // sweep that walks the other way would skip the object it swapped in.
  const pool = sparkPool();
  const all = spawnSome(pool, 40);
  all.forEach((spark, index) => {
    spark.life = index % 3;    // every third one is already dead
    spark.seen = 0;
  });

  let expired = 0;
  for (let i = pool.count - 1; i >= 0; i--) {
    const spark = pool.items[i];
    spark.seen++;
    if (spark.life === 0) {
      expired++;
      pool.killAt(i);
    }
  }

  assert.equal(expired, 14, 'indices 0, 3, ... 39');
  assert.equal(pool.count, 26);
  for (const spark of pool.items) assert.equal(spark.seen, 1, 'a live spark was missed or double-taken');
});

test('the pool never builds more objects than were alive at once', () => {
  // The reason a long run stops allocating: after the busiest moment, every
  // spawn is a reuse.
  const pool = sparkPool();
  let peak = 0;

  for (let round = 0; round < 200; round++) {
    const lives = (round * 7) % 23;
    spawnSome(pool, lives);
    peak = Math.max(peak, pool.count);
    if (round % 2 === 0) pool.trim(Math.ceil(lives / 2));
    if (round % 17 === 0) killAll(pool);
  }

  assert.equal(pool.stats().made, peak, 'built ' + pool.stats().made + ' for a peak of ' + peak);
  assert.ok(pool.stats().spawned > pool.stats().made * 5, 'and reused them many times over');
});

test('stats describes the pool honestly', () => {
  const pool = sparkPool();
  spawnSome(pool, 6);
  pool.killAt(0);
  pool.killAt(0);

  const stats = pool.stats();
  assert.equal(stats.live, 4);
  assert.equal(stats.live, pool.count);
  assert.equal(stats.free, 2);
  assert.equal(stats.made, 6);
  assert.equal(stats.spawned, 6);
  assert.equal(stats.live + stats.free, stats.made, 'nothing leaks: every object is live or in the drawer');
});

// And now the same promise where it matters: a real run, played to the end, with
// its three effect pools.
test('the game recycles its sparks, rings, and labels across a whole run', async () => {
  const game = await bootGame({ root: ROOT, seed: 11 });
  const run = playOneRun(game, { maxSeconds: 240 });
  assert.equal(run.died, true, 'the run had to end for this to mean anything');

  const fx = [
    ['sparks', game.world.particles, BALANCE.effects.particleCap],
    ['rings', game.world.rings, null],      // rings are few and short; nothing caps them
    ['labels', game.world.texts, BALANCE.effects.textCap],
  ];
  for (const [name, pool, cap] of fx) {
    const stats = pool.stats();
    assert.ok(stats.spawned > 50, name + ' should have seen a busy run: ' + stats.spawned + ' lives');
    if (cap !== null) {
      assert.ok(stats.made <= cap, name + ' built ' + stats.made + ' objects, the cap is ' + cap);
    }
    assert.ok(stats.made * 3 <= stats.spawned,
      name + ' should be reused, not rebuilt: ' + stats.made + ' built for ' + stats.spawned + ' lives');
    assert.equal(stats.live + stats.free, stats.made, name + ' lost an object');
  }

  game.stop();
});
