// `core/math.js` - the small maths the whole game stands on. The subject of most of this file is
// `hypot`, which is a drop-in for `Math.hypot` and therefore has to be the same number to within a
// rounding error, or every run measured since the game began would be a different game.

import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, dist2, hypot, lerp, TAU } from '../src/core/math.js';
import { BALANCE } from '../src/game/balance.js';

test('the length of a line is the length of the line', () => {
  assert.equal(hypot(3, 4), 5);
  assert.equal(hypot(0, 0), 0);
  assert.equal(hypot(0, -7), 7);
  assert.equal(hypot(-24, 0), 24);
  // Which way the line points changes nothing: a shot flies the same distance north as south.
  for (const [dx, dy] of [[40, -15], [-61, 82], [-3, -4]]) {
    assert.equal(hypot(dx, dy), hypot(-dx, -dy), 'a line and its reverse');
    assert.equal(hypot(dx, dy), hypot(dy, dx), 'swapping the two sides of a right angle');
  }
});

test('it is the number Math.hypot answers, for every line the game can measure', () => {
  // The one promise the swap made: a distance is the same number it was, to within what a square
  // root and a square each round away. `Math.hypot` guards against overflow on the way in and this
  // does not - see the helper's note - so the sweep stops where the game actually reaches.
  const arena = BALANCE.arena;
  const worst = (() => {
    let max = 0;
    for (let i = 0; i < 4000; i++) {
      const dx = (Math.random() * 2 - 1) * arena.w;
      const dy = (Math.random() * 2 - 1) * arena.h;
      const mine = hypot(dx, dy);
      const theirs = Math.hypot(dx, dy);
      const relative = Math.abs(mine - theirs) / Math.max(theirs, 1e-9);
      if (relative > max) max = relative;
    }
    return max;
  })();
  assert.ok(worst < 1e-12, 'the two disagree by ' + worst + ' at worst');
});

test('nothing the game asks it overflows or comes back round', () => {
  const arena = BALANCE.arena;
  const diagonal = hypot(arena.w, arena.h);
  assert.ok(Number.isFinite(diagonal), 'the arena diagonal is a number');
  assert.ok(diagonal > arena.w && diagonal < arena.w * 1.5, diagonal + ' px across the corner');
  // Speeds, one px a step at the top of the game, and the widest a shove is ever worth.
  for (const [dx, dy] of [[0.1, 0.1], [1000, 1000], [1e6, 1e6]]) {
    assert.ok(Number.isFinite(hypot(dx, dy)), dx + ',' + dy + ' is still a length');
  }
});

test('it squares with the squared distance beside it', () => {
  // `dist2` is what the collision tests compare, and it is the same maths without the root. Two
  // functions making two different squares would be a hole waiting to be stepped into.
  for (const [ax, ay, bx, by] of [[0, 0, 3, 4], [100, 200, 100, 200], [-40, 60, 60, -40]]) {
    assert.ok(Math.abs(hypot(ax - bx, ay - by) ** 2 - dist2(ax, ay, bx, by)) < 1e-9);
  }
});

test('the neighbours still do their jobs', () => {
  // Cheap, and this file is the only place they are checked.
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(50, 0, 10), 10);
  assert.equal(lerp(10, 20, 0), 10);
  assert.equal(lerp(10, 20, 1), 20);
  assert.equal(lerp(10, 20, 0.5), 15);
  assert.ok(Math.abs(TAU - Math.PI * 2) < 1e-15);
});
