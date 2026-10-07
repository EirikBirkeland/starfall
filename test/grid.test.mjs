// The spatial grid (PLAN section 2): the broad phase that stops every bullet
// from having to meet every enemy on screen.
//
// The contract these tests exist to hold is a *broad-phase* one. A query must
// never miss something inside the circle, it may hand back a few extra things,
// and the caller makes the exact test afterwards.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '../src/core/grid.js';
import { BALANCE } from '../src/game/balance.js';

function item(x, y, tag) {
  return { x: x, y: y, tag: tag === undefined ? '' : tag };
}

function crowd(count, seed) {
  // A plain deterministic scatter: a grid must behave the same whatever it is
  // given, and a test that uses the game's own streams would move when the game
  // does. Numbers are in [-200, 1400) so the scatter straddles the origin.
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push(item(next() * 1600 - 200, next() * 1600 - 200, i));
  }
  return items;
}

function distance2(ax, ay, bx, by) {
  return (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
}

test('a cell has to have a width', () => {
  assert.throws(() => new Grid(0), RangeError);
  assert.throws(() => new Grid(-8), RangeError);
  assert.throws(() => new Grid('wide'), RangeError);
});

test('an empty grid finds nothing', () => {
  const grid = new Grid(64);
  assert.equal(grid.count, 0);
  assert.deepEqual(grid.queryCircle(0, 0, 100), []);
  assert.deepEqual(grid.queryCircle(9999, -9999, 500), []);
});

test('an inserted item is found where it stands', () => {
  const grid = new Grid(64);
  const here = item(300, 300, 'here');
  grid.insert(here);

  assert.equal(grid.count, 1);
  assert.deepEqual(grid.queryCircle(300, 300, 0), [here], 'a point query finds a point');
  assert.deepEqual(grid.queryCircle(305, 296, 12), [here], 'and so does a small circle');
  assert.equal(grid.queryCircle(500, 300, 30).length, 0, 'not from across the cell');
});

test('a query misses nothing inside its circle', () => {
  // The one promise that matters: everything whose centre is within the radius
  // turns up in the candidate list. Anything else is the caller's problem.
  const cell = 32;
  const grid = new Grid(cell);
  const items = crowd(500, 20261007);
  for (const one of items) grid.insert(one);

  const reach = 45;
  const diagonal = cell * Math.SQRT2;
  for (const probe of crowd(60, 777)) {
    const found = grid.queryCircle(probe.x, probe.y, reach);
    const missing = items.filter((one) => distance2(one.x, one.y, probe.x, probe.y) <= reach * reach);

    for (const one of missing) {
      assert.ok(found.includes(one), 'an item inside the circle went unfound');
    }
    assert.equal(new Set(found).size, found.length, 'an item was offered twice');
    for (const one of found) {
      const far = reach + diagonal;
      assert.ok(distance2(one.x, one.y, probe.x, probe.y) <= far * far,
        'a candidate was further away than the grid is allowed to be');
    }
  }
});

test('a negative coordinate is filed like any other', () => {
  // Enemies are spawned outside the arena on purpose, so the grid gets negative
  // cell coordinates every step of every run.
  const grid = new Grid(64);
  const outside = item(-40, -1000, 'outside');
  grid.insert(outside);

  assert.deepEqual(grid.queryCircle(-40, -1000, 6), [outside]);
  assert.equal(grid.queryCircle(0, 0, 6).length, 0, 'and it is not near the origin');
});

test('a rebuild refills the cells instead of building new ones', () => {
  // No allocation inside the per-frame loops (PLAN section 2): a rebuild costs
  // the inserts, not the furniture.
  const grid = new Grid(64);
  const items = crowd(300, 5);

  for (const one of items) grid.insert(one);
  const first = grid.stats();
  assert.equal(first.items, 300);
  assert.ok(first.filled > 1, 'a spread-out crowd fills more than one cell');

  grid.clear();
  assert.equal(grid.count, 0);
  assert.equal(first.allocated > 0, true);
  assert.deepEqual(grid.queryCircle(0, 0, 10), [], 'cleared means cleared');

  for (const one of items) grid.insert(one);
  const again = grid.stats();
  assert.equal(again.items, 300);
  assert.equal(again.filled, first.filled);
  assert.equal(again.allocated, first.allocated, 'the second rebuild allocated nothing');
});

test('stats counts items and filled cells honestly', () => {
  const grid = new Grid(64);
  grid.insert(item(10, 10));
  grid.insert(item(20, 20));
  grid.insert(item(70, 70));

  assert.deepEqual(grid.stats(), { items: 3, filled: 2, allocated: 2, cellSize: 64 });
  grid.clear();
  assert.deepEqual(grid.stats(), { items: 0, filled: 0, allocated: 2, cellSize: 64 });
});

test('a nonsense position or radius fails loudly', () => {
  // A silent miss here would be a bullet walking through an enemy, which is the
  // kind of bug that takes a week to notice.
  const grid = new Grid(64);
  assert.throws(() => grid.insert({ x: NaN, y: 0 }), RangeError);
  assert.throws(() => grid.insert({ x: 0, y: undefined }), RangeError);
  assert.throws(() => grid.insert({ x: Infinity, y: 0 }), RangeError);
  assert.throws(() => grid.queryCircle(0, 0, Infinity), RangeError);
  assert.throws(() => grid.queryCircle(0, 0, NaN), RangeError);
  assert.throws(() => grid.queryCircle(NaN, 1, 4), RangeError);
  assert.equal(grid.count, 0, 'none of them filed anything');
});

test('a query costs what is nearby, not what exists', () => {
  // The performance promise, stated as a number. 600 enemies march across an
  // arena three times the size of the screen - the target of PLAN section 2 -
  // and one bullet must not have to look at them.
  const grid = new Grid(BALANCE.grid.cellSize);
  const reach = 30;     // roughly: the fattest enemy plus the bullet's own reach

  let made = 0;
  for (let row = 0; row < 24; row++) {
    for (let column = 0; column < 25; column++) {
      grid.insert(item(column * 120 + 60, row * 120 + 60));
      made++;
    }
  }
  assert.equal(made, 600);

  const nearby = [];
  let worst = 0;
  for (let probe = 0; probe < 25; probe++) {
    const found = grid.queryCircle(probe * 120 + 60, 1380, reach, nearby);
    worst = Math.max(worst, found.length);
  }
  assert.ok(worst * 20 <= made, 'the busiest query looked at ' + worst + ' enemies out of ' + made);

  grid.queryCircle(4000, 4000, reach, nearby);
  assert.equal(nearby.length, 0, 'an empty neighbourhood really is empty');
});
