// The nova as drawn, on the card and in the sky (PLAN 3.2's nova, milestone 4's line).
//
// There is no browser here, so this cannot say the front is a cyan wave that reads as a
// shove. What it can say is the four things that make it readable rather than decorative,
// and they are the same four every other light in the game is held to - plus one that
// belongs to a thing whose whole promise is "the ring you can see is the ring that hurt
// you", which is why the sim keeps `pr` and `r` and the renderer draws between them
// (game/nova.js, render/interp.js):
//
//   a run that wears no nova costs exactly what an empty sky costs - the line is not quietly
//     drawing a circle for a ship that has none;
//   a front costs a fixed pair of strokes, and neither of them a blur or a gradient
//     (render/glow.js), so five of them are five times a cheap thing and not one expensive
//     one - and one off the edge of the window is not drawn at all;
//   a front is painted at the radius the simulation has actually reached, interpolated
//     between the two radii it has been at like any other moving thing, and never further
//     out than the rim it dies at: the light neither promises a reach the damage does not
//     have nor arrives late to the crowd it has already hurt;
//   and the frame paints it under the ship, over the crowd, which is the one order that
//     decides whether a player can still see themselves inside their own nova.
//
// Same trick as test/orbitals-art.test.mjs: count what a frame asks the canvas for, and
// look at where the points landed. Circles are logged with their radius for exactly this
// test (tools/headless/harness.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { lerp } from '../src/core/math.js';
import { makeFront } from '../src/game/nova.js';
import { paintR } from '../src/render/interp.js';

const ROOT = path.resolve(import.meta.dirname, '..');
// One device pixel to the CSS pixel, so a ring's radius can be compared with the numbers in
// render/entities.js without a scale factor in the way.
const game = await bootGame({ root: ROOT, seed: 47, dpr: 1 });
const field = game.world;
const ship = field.player;
const NOVA = BALANCE.upgrades.nova;

// Get a run going first: the title screen draws the menu crowd and no ship. The press comes
// from the mouse, because Space would also spend a dash (test/controls.test.mjs).
game.pressMouse(640, 360);
game.step();
game.releaseMouse();
game.step();

/** Nothing on the arena but what a test puts there, and nothing arriving. */
function clearTheSky() {
  field.enemies.length = 0;
  field.particles.clear();
  field.rings.clear();
  field.texts.clear();
  field.bullets.clear();
  field.shards.clear();
  field.enemyShots.clear();
  field.nova.fronts.clear();
  field.spawnTimer = Infinity;
  field.shake = 0;
  ship.invuln = Infinity;
}

/** What one frame cost to draw. */
function frameCost() {
  const before = game.drawCalls();
  game.step();
  const after = game.drawCalls();
  return {
    fills: after.fills - before.fills,
    strokes: after.strokes - before.strokes,
    images: after.images - before.images,
    texts: after.texts - before.texts,
    gradients: after.gradients - before.gradients,
    shadows: after.shadows - before.shadows,
  };
}

function total(cost) {
  return cost.fills + cost.strokes + cost.images + cost.texts;
}

/**
 * Put `count` fronts in the air, well short of the rim, and draw one frame of them.
 *
 * They are planted rather than thrown because this file is about the drawing; the timing is
 * tested in test/nova.test.mjs. The ranks are left at nought so the sim does not throw one
 * of its own into the middle of a measurement.
 */
function frameOfFronts(count, radius) {
  clearTheSky();
  field.upgrades.nova = 0;
  for (let i = 0; i < count; i++) {
    const front = field.nova.fronts.spawn();
    front.x = ship.x;
    front.y = ship.y;
    front.pr = (radius === undefined ? 40 : radius) + i * 12;
    front.r = front.pr + 6;
    front.weight = 1;
  }
  const cost = frameCost();
  return { cost: cost, circles: game.circles(), fronts: field.nova.fronts.items.slice(0, count) };
}

/**
 * The circles a frame drew round one front.
 *
 * The sky is full of small arcs - the stars are drawn as them - so what identifies a
 * front's own ring is that it is centred on the front, which is not the ship either.
 */
function round(worn, front) {
  const here = game.screenOf(front.x, front.y);
  return worn.circles.filter((circle) => Math.hypot(circle.at.x - here.x, circle.at.y - here.y) < 1);
}

test('a ship with no nova costs an empty sky', () => {
  clearTheSky();
  const empty = frameCost();
  field.upgrades.nova = 0;
  field.nova.fronts.clear();
  const bare = frameCost();

  assert.equal(total(bare), total(empty), 'nothing was painted for a nova of none');
});

test('every front costs the same pair of strokes, and neither of them a blur', () => {
  // One, two, three: the differences are both "one more front" and have to come out the
  // same number, because nothing about a front gets dearer as the sky fills with them. A
  // pair - one wide faint stroke for the light of it and one thin bright one for the edge
  // - and the pair is the whole cost, so five fronts are ten strokes and not a gradient.
  const none = frameOfFronts(0);
  const one = frameOfFronts(1);
  const two = frameOfFronts(2);
  const three = frameOfFronts(3);

  const perFront = total(one.cost) - total(none.cost);
  assert.equal(perFront, 2, 'a front is two strokes, and ' + perFront);
  assert.equal(total(two.cost) - total(one.cost), perFront, 'and the second costs the same');
  assert.equal(total(three.cost) - total(two.cost), perFront, 'and so does the third');
  assert.equal(three.cost.shadows, none.cost.shadows, 'and none of it is a blur');
  assert.equal(three.cost.gradients, none.cost.gradients, 'or a gradient built this frame');
});

test('a front off the window is not drawn at all', () => {
  // A front lives a quarter of a second and the ship is always leaving the place it was
  // thrown from, so off the edge is the normal state of most of them.
  clearTheSky();
  field.upgrades.nova = 0;
  const empty = frameCost();

  const far = field.nova.fronts.spawn();
  far.x = ship.x + 4000;
  far.y = ship.y;
  far.pr = 100;
  far.r = 120;
  far.weight = 1;
  const spent = frameCost();

  assert.equal(total(spent), total(empty), 'a ring nobody can see cost nothing');
});

test('the radius a frame draws is between the two radii the sim has been at', () => {
  // The interpolation contract on its own, without a frame in the way: a frame lands between
  // two steps, and the ring it draws is between the two radii those steps recorded. Never
  // ahead of the damage, which would be a promise, and never so far behind that the light
  // arrives after the crowd has already flinched.
  const front = makeFront();
  front.pr = 100;
  front.r = 118;
  for (const alpha of [0, 0.25, 0.5, 1]) {
    const painted = paintR(front, alpha);
    assert.ok(painted >= front.pr - 1e-9 && painted <= front.r + 1e-9,
      'at alpha ' + alpha + ' the ring was drawn at ' + painted);
    assert.ok(Math.abs(painted - lerp(front.pr, front.r, alpha)) < 1e-9,
      'and exactly as far between them as the frame is between the steps');
  }
  assert.equal(paintR(front, 1), front.r, 'a frame drawn on the step draws the sim radius');
});

test('a front is painted at the radius the sim has reached', () => {
  // The honesty of the whole line, measured: the ring drawn this frame is at the radius the
  // front is at, between the radius it was at when the last step began and the one it has
  // now - the same contract as a body's `px`/`x` one dimension round (render/interp.js).
  const worn = frameOfFronts(3);
  const alpha = game.stats().alpha;
  assert.equal(worn.fronts.length, 3, 'three fronts were put in the sky');

  for (const front of worn.fronts) {
    const wanted = lerp(front.pr, front.r, alpha);
    // One path, asked for twice - the wide faint stroke under the thin bright edge - so one
    // circle comes back from the frame at the radius the front is really at, and the pair of
    // strokes is counted in the test above.
    const strokes = round(worn, front).filter((circle) => Math.abs(circle.r - wanted) < 1e-9);
    assert.equal(strokes.length, 1,
      'the front was drawn once, at ' + wanted.toFixed(2) + ' px out: ' + round(worn, front)
      .map((circle) => circle.r.toFixed(1)).join(', '));
  }
});

test('the ring is never drawn past the rim the front dies at', () => {
  // The reach is the wall the damage stops at (test/nova.test.mjs) and the picture must not
  // draw a ring the damage never reached, or the flash is a promise the sim does not keep.
  const worn = frameOfFronts(1, NOVA.reach - 40);
  const widest = Math.max(...round(worn, worn.fronts[0]).map((circle) => circle.r));
  assert.ok(widest > NOVA.reach - 60, 'the front was drawn at all, and out near the rim: '
    + widest.toFixed(1));
  assert.ok(widest <= NOVA.reach, 'and no further out than ' + NOVA.reach
    + ' px, which is where its damage stops');
});

test('the front is painted over the crowd and under the ship', () => {
  // PLAN section 4: the player must always be able to see their own ship. A nova is drawn
  // round the ship at up to two hundred and twenty px, which is exactly the size at which a
  // bright ring could swallow it, so the order is written down where it can be checked - and
  // over the crowd, because a front is the ship's reach going out through them and the
  // bodies it is throwing are what tells you it arrived.
  const frame = fs.readFileSync(path.join(ROOT, 'src/render/renderer.js'), 'utf8');
  const crowd = frame.indexOf('drawEnemies(ctx, world.enemies');
  const front = frame.indexOf('drawNova(ctx');
  const shipDrawn = frame.indexOf('drawPlayer(ctx');
  assert.ok(crowd > 0, 'the frame paints the crowd');
  assert.ok(front > crowd, 'the front goes over it');
  assert.ok(shipDrawn > front, 'and the ship goes over the front');
});
