// The sky behind the game (render/nebula.js).
//
// There is no browser here, so this file cannot say what the clouds look like. What
// it can say is the geometry the whole trick rests on: that the tile is stamped so
// that it covers the window completely, in every direction, however far it has
// drifted and however big the window is - because a sky that ran out at the edge of
// its tile would be the most obvious failure on screen and the hardest to spot in
// code. And it can say what a frame of sky costs: stamps and nothing else, and one
// bake ever.
//
// The sky's stamps are picked out of a frame by their size. Nothing else in the
// game is stamped bigger than a ship and the light around it; a tile of sky is
// window-sized, so the two cannot be confused.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { puffCopies, stats as nebulaStats, updateNebula } from '../src/render/nebula.js';
import { view } from '../src/render/canvas.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 41 });

const SKY_MIN = 400;    // px: bigger than this and it is a tile of sky, not a glow

/** Every stamp big enough to be a tile of sky, in the frame just drawn. */
function skyStamps() {
  return game.stamps().filter((s) => s.w >= SKY_MIN);
}

/**
 * The stamps of one pass, grouped by the size they were stamped at: the near pass
 * and the far pass are the same tile at two sizes, so one group per pass.
 */
function passes() {
  const bySize = new Map();
  for (const stamp of skyStamps()) {
    const size = Math.round(stamp.w);
    if (!bySize.has(size)) bySize.set(size, []);
    bySize.get(size).push(stamp);
  }
  return [...bySize.values()].sort((a, b) => a[0].w - b[0].w);
}

/** The points of the window a set of stamps does not reach. */
function holes(stamps, w, h) {
  const misses = [];
  for (let x = 0; x < w; x += 40) {
    for (let y = 0; y < h; y += 40) {
      if (!covered(stamps, x, y)) misses.push(x + ',' + y);
    }
  }
  if (!covered(stamps, w - 1, h - 1)) misses.push((w - 1) + ',' + (h - 1));
  return misses;
}

function covered(stamps, x, y) {
  for (const s of stamps) {
    if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) return true;
  }
  return false;
}

/**
 * How much of the window a pass actually paints, counting only what lands on it.
 * A pass that tiles properly paints the window exactly once: not a gap in it, and
 * no pixel painted twice.
 */
function painted(pass, w, h) {
  let total = 0;
  for (const s of pass) {
    const wide = Math.min(s.x + s.w, w) - Math.max(s.x, 0);
    const tall = Math.min(s.y + s.h, h) - Math.max(s.y, 0);
    if (wide > 0 && tall > 0) total += wide * tall;
  }
  return total;
}

/** Nothing but the ship and the sky, parked where the test wants it, view settled. */
function parkAt(x, y) {
  const field = game.world;
  field.enemies.length = 0;
  field.bullets.clear();
  field.shards.clear();
  field.rings.clear();
  field.texts.clear();
  field.particles.clear();
  field.spawnTimer = Infinity;
  const ship = field.player;
  ship.invuln = Infinity;
  ship.x = x;
  ship.y = y;
  ship.px = x;
  ship.py = y;
  ship.vx = 0;
  ship.vy = 0;
  // The cursor over the middle of the window is the ship itself, so the camera has
  // nothing to lean towards and stops moving: after this the only thing that moves
  // the sky is the sky.
  game.moveMouse(view.W / 2, view.H / 2);
  for (let i = 0; i < 40; i++) game.step();
}

function launch() {
  game.pressMouse(640, 360);
  game.step();
  game.releaseMouse();
}

/** Where a pass's leftmost tile begins this frame. */
function leftEdge(pass) {
  return Math.min(...pass.map((s) => s.x));
}

/** How far apart two positions of a drifting tile are, around the loop it wraps on. */
function drifted(from, to, span) {
  const d = Math.abs(to - from) % span;
  return Math.min(d, span - d);
}

test('the sky is baked once, on the first frame that shows it', () => {
  assert.equal(nebulaStats().baked, false, 'nothing has been drawn yet');
  game.step();
  assert.equal(nebulaStats().bakes, 1, 'the first frame baked the tile');
  game.step();
  game.step();
  assert.equal(nebulaStats().bakes, 1, 'and nothing rebakes it after that');
  assert.equal(nebulaStats().baked, true);
});

test('a puff is painted again across every edge it reaches past', () => {
  const T = nebulaStats().tile;

  assert.deepEqual(puffCopies(T / 2, T / 2, 40), [[0, 0]],
    'a puff in the middle of the tile has no edge to reach');

  const right = puffCopies(T - 10, T / 2, 40);
  assert.equal(right.length, 2, 'half of it is off the right edge');
  assert.ok(right.some((c) => c[0] === -T && c[1] === 0),
    'and the part that falls off arrives on the left instead');

  const corner = puffCopies(T - 5, 5, 30);
  assert.equal(corner.length, 4, 'a puff over two edges is painted four times');

  // The general promise, over the whole tile: whatever copies are asked for, the
  // puff is painted where it stands and again wherever it wrapped to, never twice
  // in one place, and never somewhere off the tile where it would paint nothing.
  for (let i = 0; i < 200; i++) {
    const x = (i * 137) % (T + 1);
    const y = (i * 211) % (T + 1);
    const radius = 10 + (i % 9) * 60;
    const copies = puffCopies(x, y, radius);
    const seen = new Set(copies.map((c) => c.join(',')));
    assert.equal(seen.size, copies.length, 'a copy is never asked for twice');
    assert.ok(seen.has('0,0'), 'and it is always painted where it stands');
    for (const [dx, dy] of copies) {
      assert.ok(x + dx + radius > 0 && x + dx - radius < T,
        'a copy at ' + dx + ',' + dy + ' from ' + x + ' paints nothing but a wasted gradient');
      assert.ok(y + dy + radius > 0 && y + dy - radius < T);
    }
  }
});

test('every pass of the sky covers the window it is behind', () => {
  launch();
  const arena = game.world.arena;
  const places = [
    [arena.w / 2, arena.h / 2],          // the middle of the world
    [40, 40],                            // into a corner of it
    [arena.w - 40, arena.h - 40],        // and the far one
  ];

  for (const [x, y] of places) {
    parkAt(x, y);
    game.step();
    const groups = passes();
    assert.equal(groups.length, 2, 'the near pass and the far one, from one bake');
    for (const group of groups) {
      assert.deepEqual(
        holes(group, view.W, view.H), [],
        'a pass of the sky left the window bare at ' + group.length + ' stamps');
      const whole = view.W * view.H;
      const ratio = painted(group, view.W, view.H) / whole;
      assert.ok(Math.abs(ratio - 1) < 0.01,
        'a pass paints the window once, and painted ' + ratio.toFixed(3) + ' of them');
    }
  }
});

test('the clouds keep covering it however far they have drifted', () => {
  parkAt(game.world.arena.w / 2, game.world.arena.h / 2);
  // Five minutes of drift, a minute at a time: ten times the tile's width of
  // travel, so the wrap is what is being tested here and not the first tile.
  for (let minute = 0; minute < 5; minute++) {
    updateNebula(60);
    game.step();
    for (const group of passes()) {
      assert.deepEqual(holes(group, view.W, view.H), [], 'minute ' + minute);
    }
  }
});

test('the nearer pass slides further than the far one, and both slowly', () => {
  parkAt(game.world.arena.w / 2, game.world.arena.h / 2);
  const before = passes();

  updateNebula(1);
  game.step();
  const after = passes();

  assert.equal(before.length, 2, 'the near pass first, then the far one');
  const shifts = before.map((pass, i) => {
    // A pass is stamped at exactly the size of one tile, which is also the size of
    // the loop it wraps on.
    const span = pass[0].w;
    return drifted(leftEdge(pass), leftEdge(after[i]), span);
  });
  const [near, far] = shifts;
  assert.ok(far > 0.2, 'both passes drift: the far one moved ' + far + ' px in a second');
  assert.ok(near > far, 'the near pass moved ' + near + ' px, the far one ' + far);
  // Slower than the slowest star layer's 5 px/s, which is what keeps the sky behind
  // the stars instead of among them.
  assert.ok(near < 5, 'the near pass moved ' + near + ' px in a second, which is not slow');
});

test('a frame of sky costs stamps and nothing else', () => {
  parkAt(game.world.arena.w / 2, game.world.arena.h / 2);
  game.step();                                  // whatever it shows first, it bakes here

  const before = game.drawCalls();
  game.step();
  const after = game.drawCalls();

  assert.equal(after.shadows - before.shadows, 0, 'the sky is never blurred');
  assert.equal(after.gradients - before.gradients, 0, 'and no gradient is built for it');
  // The sky is in every frame, so there is no frame without it to take away and
  // difference against. What can be said is that a frame strokes exactly the ship,
  // its hull pips and the bar along the bottom - the six that test/walls.test.mjs
  // and test/controls.test.mjs count the same way - and nothing of the sky.
  assert.equal(after.strokes - before.strokes, 6, 'nothing about the sky is stroked');

  const stamps = skyStamps();
  assert.ok(stamps.length >= 2, 'both passes are stamped: ' + stamps.length);
  assert.ok(stamps.length <= 12,
    'and tiling the window costs a handful of stamps, not one per pixel: ' + stamps.length);
});

test('a bigger window gets more tiles and no more baking', () => {
  game.setViewport(2400, 1500);
  game.step();
  assert.equal(nebulaStats().bakes, 1, 'the tile belongs to the sky, not to the window');

  for (const group of passes()) {
    assert.deepEqual(holes(group, view.W, view.H), [], 'at ' + view.W + 'x' + view.H);
  }
  game.setViewport(1280, 720);
  game.step();
  game.stop();
});
