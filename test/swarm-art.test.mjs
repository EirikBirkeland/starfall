// The swarm as drawn (PLAN 3.3's "arrives in packs of 20, flocks").
//
// There is no browser here, so this cannot say what a murmuration of twenty small darts
// looks like. What it can say is the three things that make its tell a tell:
//
//   a pack costs the canvas what twenty plain bodies cost - no blur, no gradient, no
//   dash pattern, however many of them there are, because twenty of anything has to be
//   cheap enough to be worth having in the arena at all;
//   the brace puts exactly one light on each body and nothing else, and a pack that is
//   not bracing puts none - so the warning cannot shine while there is no warning;
//   and the dive puts exactly one blur on each body, which is the only thing that says
//   "these are coming at you" before they arrive.
//
// Same trick as test/shield-art.test.mjs: count what a frame asks the canvas for.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { makeEnemy } from '../src/game/kinds.js';
import { newPack } from '../src/game/flock.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 46 });
const field = game.world;
const ship = game.player;
const S = BALANCE.kinds.swarmling;

// The title screen draws the menu crowd and no ship, so get a run going first.
game.pressMouse(640, 360);
game.step();
game.releaseMouse();

/** Nothing on the arena but what a test puts there, and nothing arriving. */
function clearTheSky() {
  field.enemies.length = 0;
  field.flocks.length = 0;
  field.particles.clear();
  field.rings.clear();
  field.texts.clear();
  field.bullets.clear();
  field.shards.clear();
  field.enemyShots.clear();
  field.spawnTimer = Infinity;
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
    dashes: after.dashes - before.dashes,
    gradients: after.gradients - before.gradients,
    shadows: after.shadows - before.shadows,
  };
}

/**
 * Stand a pack of `count` swarmlings in the arena, in a clump where the camera can see
 * all of them, and hold them there: a test wants to know what a beat looks like, not
 * where the pack flew while it was being drawn.
 */
function plantPack(count, x, y) {
  const pack = newPack(S.flock, x, y);
  field.flocks.push(pack);
  const bodies = [];
  for (let i = 0; i < count; i++) {
    const angle = i / count * Math.PI * 2;
    const enemy = makeEnemy(field, 'swarmling',
      x + Math.cos(angle) * S.pack.clump, y + Math.sin(angle) * S.pack.clump, { flock: pack });
    enemy.speed = 0;
    field.enemies.push(enemy);
    bodies.push(enemy);
  }
  return { pack: pack, bodies: bodies };
}

/**
 * Paint `frames` frames with the pack pinned on beat `stage`. The flock's clock is
 * rewound before every frame, because the simulation would otherwise walk the pack
 * through a whole cycle while the test is looking at one beat of it.
 */
function costOnBeat(plant, stage, frames) {
  const spots = plant.bodies.map((body) => [body.x, body.y]);
  let cost = null;
  for (let i = 0; i < frames; i++) {
    plant.pack.stage = stage;
    plant.pack.timer = stage === '' ? 9 : 0.5;
    plant.pack.stageTime = 1;
    for (let j = 0; j < plant.bodies.length; j++) {
      const body = plant.bodies[j];
      body.x = spots[j][0];
      body.y = spots[j][1];
    }
    const was = frameCost();
    if (i > 0) cost = was;        // the first frame may still be baking a sprite
  }
  return cost;
}

test('a pack costs the canvas bodies and nothing else', () => {
  clearTheSky();
  const empty = frameCost();
  const plant = plantPack(S.pack.into, ship.x + 200, ship.y);
  const cost = costOnBeat(plant, '', 3);

  assert.equal(cost.fills - empty.fills, S.pack.into, 'every one of them was drawn');
  assert.equal(cost.strokes - empty.strokes, S.pack.into, 'each with one edge, and no more');
  assert.equal(cost.gradients - empty.gradients, 0, 'not one gradient built for the swarm');
  assert.equal(cost.shadows - empty.shadows, 0, 'and not one blur asked for');
  assert.equal(cost.dashes - empty.dashes, 0, 'and no dash pattern, which is what the field and the fence cost');
});

test('a braced body lights its nose, and a gathering one does not', () => {
  clearTheSky();
  const plant = plantPack(S.pack.into, ship.x + 200, ship.y);
  const calm = costOnBeat(plant, '', 3);
  const braced = costOnBeat(plant, 'brace', 3);

  assert.equal(braced.images - calm.images, S.pack.into,
    'exactly one light per body, no more and no less');
  assert.equal(braced.strokes, calm.strokes, 'and it is a light, not a shape');
});

test('a diving pack drags one blur per body', () => {
  clearTheSky();
  const plant = plantPack(S.pack.into, ship.x + 200, ship.y);
  const calm = costOnBeat(plant, '', 3);
  const diving = costOnBeat(plant, 'dive', 3);

  assert.equal(diving.images - calm.images, S.pack.into,
    'exactly one blur per body');
  assert.equal(diving.gradients - calm.gradients, 0, 'baked once, like every other streak');
});

test('a lone swarmling is drawn like any other body', () => {
  clearTheSky();
  const empty = frameCost();
  const plant = plantPack(1, ship.x + 200, ship.y);
  const pack = plant.pack;
  const cost = costOnBeat(plant, 'brace', 3);
  // One body, braced: the light is one stamp, and the pack it belongs to is real, so
  // this is the smallest version of the tell rather than a different one.
  assert.equal(cost.images - empty.images, 2, 'its halo and its nose light');
  assert.ok(pack.n === 1 || pack.n === 0, 'a pack of one is still a pack');
});

test('the swarm is culled with the rest of the arena', () => {
  clearTheSky();
  const empty = frameCost();
  plantPack(S.pack.into, game.camera.x + game.camera.w + 400, ship.y);
  const offscreen = frameCost();
  assert.equal(offscreen.fills, empty.fills, 'none of them was drawn');
});
