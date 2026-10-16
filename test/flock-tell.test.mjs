// The brood's tells, as drawn (render/flock.js). There is no browser here, so this cannot say what
// a ring of light round a clump looks like. What it can say is the four things that matter about it:
//
//   **it is one shape per pack, not one per body** - a clump of a dozen bodies costs a handful of
//     canvas operations and a pair costs none, which is the whole of why the coarse read exists;
//
//   **the ring is the beat** - what is left of the arc is what is left of the time, counted down off
//     the same clock every body's own nose light is counted down off (game/flock.js), and the ring is
//     sized by the clump it goes round;
//
//   **the line is the lunge** - the light reaches exactly as far along the locked line as the dive
//     still has to give, and the pack then *walks that ground*, so the promise and the harm are the
//     same number (the bargain test/beam-art.test.mjs makes about a beam);
//
//   **it costs sprites and strokes** - no blur, no gradient, and nothing at all on a frame with no
//     clump in it, which is what test/draw-cost.test.mjs holds the rest of the game to.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { TAU } from '../src/core/math.js';
import { makeEnemy } from '../src/game/kinds.js';
import { newPack, isBracing, isCommitted, beatProgress } from '../src/game/flock.js';
import { drawFlockTells } from '../src/render/flock.js';
import { resetIndicators } from '../src/render/indicators.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 42 });
const field = game.world;
const ship = field.player;
const F = BALANCE.kinds.swarmling.flock;
/** A clump: well over the smallest flock the wave director sends, so it is worth a tell. */
const CLUMP = 12;
/** A pair: what a hive's brood is made of, and not a clump. */
const PAIR = 2;

// The title screen draws the menu crowd and no ship, so get a run going first.
game.pressMouse(640, 360);
game.step();
game.releaseMouse();

/** One clump, standing in a disc of `spread` px, and nothing else on the arena. */
function plant(count, x, y, spread) {
  const pack = newPack(F, x, y);
  field.flocks.push(pack);
  const bodies = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU;
    const body = makeEnemy(field, 'swarmling',
      x + Math.cos(angle) * spread, y + Math.sin(angle) * spread, { flock: pack });
    field.enemies.push(body);
    bodies.push(body);
  }
  return { pack: pack, bodies: bodies };
}

/** A fresh arena with a clump in it, the ship parked mid-arena and unhurtable, nothing arriving. */
function arenaWith(count, x, y, spread) {
  field.enemies.length = 0;
  field.flocks.length = 0;
  field.particles.clear();
  field.rings.clear();
  field.texts.clear();
  field.bullets.clear();
  field.shards.clear();
  field.spawnTimer = Infinity;
  ship.invuln = Infinity;
  // Back to the middle of the arena, so the clump the test plants is inside the window the camera
  // is looking through - one test moved the ship to a corner to prove a cull and the next one
  // should not have to know that.
  ship.x = BALANCE.arena.w / 2;
  ship.y = BALANCE.arena.h / 2;
  ship.px = ship.x;
  ship.py = ship.y;
  resetIndicators();
  game.step(16);
  return plant(count, x, y, spread);
}

/** Step frames until `seen` answers true, and say whether it ever did. */
function until(seen, frames) {
  let n = 0;
  while (!seen()) {
    if (n++ > frames) return false;
    game.step(16);
  }
  return true;
}

/** The clump on the beat, and nowhere near the commit yet. */
function braceOf(clump) {
  if (!until(() => isBracing(clump.pack), 900)) throw new Error('the pack never braced');
  return clump;
}

function committedOf(clump) {
  if (!until(() => isCommitted(clump.pack), 900)) throw new Error('the pack never committed');
  return clump;
}

/** Just the tells, on a canvas of their own, so the counts are theirs and not the frame's. */
function paint() {
  return game.measure((ctx) => drawFlockTells(ctx, field.flocks));
}

/** Where a stamped light landed, in arena px (a stamp is logged by its top-left corner). */
function centre(stamp) {
  return { x: stamp.at.x + stamp.w / 2, y: stamp.at.y + stamp.h / 2 };
}

const WEST = { x: 1500, y: 900 };

test('a clump that is only gathering has nothing to say', () => {
  arenaWith(CLUMP, WEST.x, WEST.y, 40);
  game.step(16);
  const cost = paint();
  assert.equal(cost.circles.length, 0, 'a gathering pack drew a ring');
  assert.equal(cost.images, 0, 'a gathering pack stamped a light');
});

test('a pair is not a clump, and draws nothing at either end of its dive', () => {
  const pair = arenaWith(PAIR, WEST.x, WEST.y, 20);
  braceOf(pair);
  assert.equal(paint().circles.length, 0, 'a pair was given a ring round it');
  committedOf(pair);
  const cost = paint();
  assert.equal(cost.images, 0, 'a pair was given a line');
  assert.equal(cost.strokes, 0);
});

test('a brace is drawn as a clock: a ring, with an arc of it left', () => {
  const clump = braceOf(arenaWith(CLUMP, WEST.x, WEST.y, 40));
  const pack = clump.pack;
  pack.timer = pack.stageTime * 0.75;

  const cost = paint();
  assert.equal(cost.circles.length, 3, 'a brace ring is a whole circle and an arc of it, twice');
  assert.equal(cost.gradients, 0, 'a brace ring built a gradient to draw itself with');
  assert.equal(cost.shadows, 0, 'a brace ring asked the canvas for a blur');
  assert.equal(cost.images, 1, 'and it has one light at the head of the arc');

  const whole = cost.circles.filter((c) => Math.abs((c.to - c.from) - TAU) < 1e-9);
  assert.equal(whole.length, 1, 'one pass is the whole circle, which is what the beat was');
  const left = cost.circles.filter((c) => c !== whole[0]);
  assert.equal(left.length, 2, 'and two passes are what is left of it');
  for (const arc of left) {
    const want = TAU * (1 - beatProgress(pack));
    assert.ok(Math.abs((arc.to - arc.from) - want) < 1e-9,
      'the arc standing is ' + (arc.to - arc.from).toFixed(3) + ' rad, over the '
      + want.toFixed(3) + ' rad of beat left');
  }
});

test('the last quarter of a brace is the loudest', () => {
  const clump = braceOf(arenaWith(CLUMP, WEST.x, WEST.y, 40));
  const pack = clump.pack;

  pack.timer = pack.stageTime * 0.95;
  const early = paint();
  pack.timer = pack.stageTime * 0.05;
  const late = paint();
  assert.ok(late.alphas[2] > early.alphas[2],
    'a brace about to commit is no brighter than one that has just started: '
    + late.alphas[2].toFixed(3) + ' against ' + early.alphas[2].toFixed(3));
  assert.ok(late.circles[2].to - late.circles[2].from < early.circles[2].to - early.circles[2].from,
    'and the arc is eating itself as the beat runs out');
});

test('the ring is sized by the clump it goes round', () => {
  const wide = braceOf(arenaWith(CLUMP, WEST.x, WEST.y, 90));
  const wideRing = paint().circles[0].r;
  assert.ok(wideRing > wide.pack.spread,
    'the ring stood inside its own clump: ' + wideRing.toFixed(1) + ' px against a spread of '
    + wide.pack.spread.toFixed(1));
  assert.ok(wideRing < wide.pack.spread + 40,
    'and it floated out in empty ground: ' + wideRing.toFixed(1) + ' px');

  const tight = braceOf(arenaWith(CLUMP, WEST.x, WEST.y, 8));
  const tightRing = paint().circles[0].r;
  assert.ok(tightRing < wideRing,
    'a bunched clump was given a wider ring than a scattered one: ' + tightRing.toFixed(1)
    + ' against ' + wideRing.toFixed(1));
});

test('the line reaches exactly as far as the dive has left to fly', () => {
  const clump = committedOf(arenaWith(CLUMP, WEST.x, WEST.y, 30));
  const pack = clump.pack;
  const cost = paint();

  assert.equal(cost.images, 2, 'a dive is a trail and a light at the end of it');
  assert.equal(cost.strokes, 0, 'and neither of them is a stroke');
  const head = centre(cost.stamps[cost.stamps.length - 1]);
  const from = Math.hypot(head.x - pack.cx, head.y - pack.cy);
  const want = pack.timer * pack.pace;
  assert.ok(Math.abs(from - want) < 2,
    'the light reaches ' + from.toFixed(1) + ' px along the line, over the '
    + want.toFixed(1) + ' px of dive left');
  // ...and along *that* line, not just any line: the light is on the ray the pack locked.
  const cross = Math.abs((head.x - pack.cx) * pack.dirY - (head.y - pack.cy) * pack.dirX);
  assert.ok(cross < 2, 'the light is off the line the pack committed to by ' + cross.toFixed(2) + ' px');
});

test('the ground the light promised is the ground the pack walks', () => {
  // Start the clump out where it has room to fly, and let it commit at the ship.
  const clump = committedOf(arenaWith(CLUMP, 1900, 900, 30));
  const pack = clump.pack;
  const cost = paint();
  assert.equal(cost.images, 2, 'a fresh dive is a trail and a light at the end of it');
  const head = centre(cost.stamps[cost.stamps.length - 1]);
  const promised = Math.hypot(head.x - pack.cx, head.y - pack.cy);
  assert.ok(promised > 40, 'a fresh dive promised ' + promised.toFixed(1) + ' px of lunge');

  const from = { x: pack.cx, y: pack.cy };
  let guard = 0;
  while (isCommitted(pack) && guard++ < 400) game.step(16);
  const flown = Math.hypot(pack.cx - from.x, pack.cy - from.y);
  assert.ok(flown > promised * 0.85 && flown < promised * 1.15,
    'the light promised ' + promised.toFixed(0) + ' px and the pack flew ' + flown.toFixed(0));
});

test('a dive with nothing left in it draws nothing', () => {
  const clump = committedOf(arenaWith(CLUMP, WEST.x, WEST.y, 30));
  clump.pack.timer = 0.001;
  const cost = paint();
  assert.equal(cost.images, 0, 'a lunge of a pixel was drawn as a line');
});

test('once the dive is spent the light is gone', () => {
  const clump = committedOf(arenaWith(CLUMP, WEST.x, WEST.y, 30));
  if (!until(() => !isCommitted(clump.pack), 400)) throw new Error('the dive never ended');
  const cost = paint();
  assert.equal(cost.images, 0, 'the trail outlived the beat it was drawn from');
  assert.equal(cost.circles.length, 0);
});

test('a clump the window cannot see costs the frame nothing', () => {
  const clump = arenaWith(CLUMP, 2700, 2700, 40);
  // Pinned where they are: a clump that walks is a clump that walks into the window while the
  // test is still asking about the corner it was left in.
  for (const body of clump.bodies) body.speed = 0;
  ship.x = 300;
  ship.y = 300;
  ship.px = 300;
  ship.py = 300;
  braceOf(clump);
  assert.equal(paint().circles.length, 0,
    'a brace ring was drawn ' + Math.round(Math.hypot(clump.pack.cx - ship.x, clump.pack.cy - ship.y))
    + ' px away from anywhere the glass can see');
});

test('the frame asks for the ring, not just the test', () => {
  // The one check that render/renderer.js actually calls this painter: the arcs have to turn up in a
  // real frame's drawing, centred where the clump is standing.
  const clump = arenaWith(CLUMP, WEST.x, WEST.y, 40);
  const pack = clump.pack;
  const round = (c) => Math.abs(c.x - pack.cx) < 0.01 && Math.abs(c.y - pack.cy) < 0.01;

  game.step(16);
  assert.equal(game.circles().filter(round).length, 0, 'a gathering clump was ringed in a real frame');

  braceOf(clump);
  const arcs = game.circles().filter(round);
  assert.equal(arcs.length, 3, 'the frame drew ' + arcs.length + ' arcs round the clump, not 3');
});

test('the smallest flock the director sends is a clump, and gets the tell', () => {
  // `pack.min` is the fewest bodies a wave may arrive as, and `each` is how many a hive's mouth lets
  // out. The line between a clump and a pair has to fall between the two numbers (render/flock.js).
  const least = BALANCE.kinds.swarmling.pack.min;
  const brood = BALANCE.bosses.hive.phases[0].spawn.each;
  assert.ok(least > brood, 'a wave\'s smallest pack is ' + least + ' bodies and a mouth lets out '
    + brood + ', so there is a line to draw between them');

  const clump = braceOf(arenaWith(least, WEST.x, WEST.y, 40));
  assert.ok(paint().circles.length > 0,
    'a pack of ' + least + ' bodies was refused a ring: spread ' + clump.pack.spread.toFixed(1));
});

test('two clumps cost two tells, not one per body', () => {
  const one = arenaWith(CLUMP, WEST.x, WEST.y, 40);
  const other = plant(CLUMP * 3, WEST.x + 200, WEST.y, 40);
  braceOf(one);
  braceOf(other);
  one.pack.timer = one.pack.stageTime * 0.5;
  other.pack.timer = other.pack.stageTime * 0.5;

  const cost = paint();
  assert.equal(cost.circles.length, 6,
    'two clumps drew ' + cost.circles.length + ' arcs, not three apiece');
  assert.equal(cost.images, 2, 'one light each, and none of them per body');
  assert.equal(cost.strokes, cost.circles.length, 'every arc is stroked once and only once');
});
