// The fire as it is drawn (PLAN 3.5's Burn, render/entities.js).
//
// There is no browser here, so this cannot say the flame reads as fire. What it can say is the
// five promises that make it an honest piece of the picture rather than a decoration - the
// same kind of promise every other light in this game is held to:
//
//   a crowd that is not burning costs exactly what an empty sky costs, and a ship that has
//     taken the card and hit nothing paints nothing either: ranks are not flames;
//   a body on fire costs a fixed pair of stamps and no strokes at all, neither of them a
//     blur or a gradient (render/glow.js), so forty bodies alight is forty times a cheap
//     thing - and it is the same two sprites however many bodies there are, because a fire is
//     baked once and stamped at the size of whatever is burning;
//   the flame is stamped where the body is, and over it: over the crowd, because the fire is
//     on the body it is eating, and under the ship, because the one thing the frame may never
//     let you lose inside somebody else's flames is yourself (PLAN section 1);
//   a fire off the edge of the window is not drawn at all;
//   and a fire on a body that has come apart draws nothing - a flame hanging in the air where
//     a crowd used to be is a lie about a wreck (game/burn.js keeps that fire alive for one
//     step and one only, which is where the rank-3 spread lives).
//
// Same trick as test/nova-art.test.mjs and test/beam-art.test.mjs: count what a frame asks
// the canvas for, and look at where the stamps landed (tools/headless/harness.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { makeEnemy } from '../src/game/kinds.js';
import { ignite } from '../src/game/burn.js';
import { stats as glowStats } from '../src/render/glow.js';
import { makeFrameCost } from '../tools/headless/frame-cost.js';

const ROOT = path.resolve(import.meta.dirname, '..');
// One device pixel to the CSS pixel, so a stamp can be compared with the numbers in
// render/entities.js without a scale factor in the way.
const game = await bootGame({ root: ROOT, seed: 71, dpr: 1 });
const field = game.world;
const ship = field.player;
const BURN = BALANCE.upgrades.burn;
const BIG = 1e6;

// Get a run going first: the title screen draws the menu crowd and no ship. The press comes
// from the mouse, because Space would also spend a dash (test/controls.test.mjs).
game.pressMouse(640, 360);
game.step();
game.releaseMouse();
game.step();

/** Nothing on the arena but what a test puts there, and nothing arriving or burning. */
function clearTheSky() {
  field.enemies.length = 0;
  field.particles.clear();
  field.rings.clear();
  field.texts.clear();
  field.bullets.clear();
  field.shards.clear();
  field.enemyShots.clear();
  field.fires.clear();
  field.spawnTimer = Infinity;
  field.shake = 0;
  field.upgrades.burn = 0;
  ship.invuln = Infinity;
}

/**
 * What one frame of the arena cost, and how many sprites it had to bake to do it. The interface
 * is not part of the answer and the run's build is part of it, so it is measured apart: see
 * tools/headless/frame-cost.js.
 */
const frameCost = makeFrameCost(game);

/** One body of `type` standing still at (x, y), and alight if the line has been taken. */
function plant(type, x, y, lit) {
  const body = makeEnemy(field, type, x, y);
  body.hp = BIG;
  body.maxhp = BIG;
  body.speed = 0;
  field.enemies.push(body);
  if (lit) ignite(field, body);
  return body;
}

/** The stamps whose middle landed within `within` px of a world point. */
function at(stamps, x, y, within) {
  const here = game.screenOf(x, y);
  const pad = within === undefined ? 8 : within;
  return stamps.filter((stamp) => Math.hypot(
    stamp.at.x + stamp.w / 2 - here.x,
    stamp.at.y + stamp.h / 2 - here.y) <= pad);
}

/** A crowd of `count` bodies, alight or not, and the frame that showed them. */
function crowd(count, lit, spot) {
  clearTheSky();
  field.upgrades.burn = lit ? 1 : 0;
  const bodies = [];
  for (let i = 0; i < count; i++) {
    const where = spot === undefined
      ? { x: ship.x - 60 + i * 40, y: ship.y - 150 }
      : spot(i);
    bodies.push(plant('drifter', where.x, where.y, lit));
  }
  return { bodies: bodies, frame: frameCost() };
}

test('ranks are not flames: a ship that took the card and hit nothing paints nothing', () => {
  // The same crowd twice, once with the line taken and once without. Nothing has been hit in
  // either, so nothing is alight, and the arena may not know the difference: this is the one
  // promise that stops a bought line from quietly setting bodies alight whether or not it has hit
  // anything. (The interface does know, and says so on the build rail - render/hud.js - which is
  // why this measures the arena and not the whole frame.)
  const plain = crowd(6, false);
  field.upgrades.burn = 1;
  assert.equal(field.fires.count, 0, 'the card is taken and nothing has been hit');

  const bought = frameCost();
  assert.equal(bought.images, plain.frame.images,
    'six bodies with nothing alight add no light of their own: ' +
    plain.frame.images + ' against ' + bought.images);
});

test('a body on fire costs a bounded pair of stamps and no strokes', () => {
  const unlit = crowd(1, false);
  const lit = crowd(1, true);
  const twoLit = crowd(2, true);
  const twoUnlit = crowd(2, false);

  assert.equal(lit.frame.images - unlit.frame.images, 2,
    'the flame is exactly two stamps: ' + (lit.frame.images - unlit.frame.images));
  assert.equal(twoLit.frame.images - twoUnlit.frame.images, 4,
    'and a second body alight is the same pair again, not something bigger');
  assert.equal(lit.frame.strokes, unlit.frame.strokes, 'none of it is a stroke');
  assert.equal(lit.frame.shadows, 0, 'and none of it is a blur');
  assert.equal(lit.frame.gradients, 0, 'or a gradient built this frame');
});

test('the flame is stamped on the body it is eating', () => {
  const unlit = crowd(1, false);
  const body = unlit.bodies[0];
  const before = at(unlit.frame.stamps, body.x, body.y).length;

  const lit = crowd(1, true);
  const after = at(lit.frame.stamps, lit.bodies[0].x, lit.bodies[0].y).length;
  assert.equal(after - before, 2,
    'both of them landed on the body, not on the sky beside it: ' + before + ' then ' + after);
});

test('the fire is painted over the crowd and under the ship', () => {
  const lit = crowd(1, true);
  const body = lit.bodies[0];
  const stamps = lit.frame.stamps;

  const onBody = at(stamps, body.x, body.y);
  const onShip = at(stamps, ship.x, ship.y);
  assert.ok(onShip.length > 0, 'the ship is drawn, and has light of its own');
  const lastFire = stamps.indexOf(onBody[onBody.length - 1]);
  const firstShip = stamps.indexOf(onShip[0]);
  assert.ok(lastFire > stamps.indexOf(onBody[0]), 'the pair is both of them, in order');
  assert.ok(lastFire < firstShip,
    'the flame went down over the crowd and under the ship: ' + lastFire + ' before ' + firstShip);
});

test('a fire off the edge of the window is not drawn at all', () => {
  const unlit = crowd(1, false, () => ({ x: ship.x + 4000, y: ship.y }));
  const lit = crowd(1, true, () => ({ x: ship.x + 4000, y: ship.y }));

  assert.equal(lit.frame.images, unlit.frame.images, 'nothing was stamped for a fire nobody can see');
});

test('a fire on a body that has come apart draws nothing', () => {
  const empty = crowd(0, true);
  const unlit = crowd(1, false);
  const lit = crowd(1, true);
  assert.equal(lit.frame.images - unlit.frame.images, 2, 'while the body stands, the flame is drawn');

  // What a death leaves for the one step a fire takes to go out (game/burn.js): the body is
  // out of the crowd, and the fire is still holding on to it.
  lit.bodies[0].hp = 0;
  field.enemies.length = 0;
  assert.equal(field.fires.count, 1, 'and the fire is still there, one step from going out');
  assert.equal(frameCost().images, empty.frame.images,
    'and it paints nothing: an empty sky and a sky with a dead body burning in it');
});

test('a burning crowd asks for two sprites, however many bodies it is', () => {
  const before = glowStats().sprites;
  const crowd12 = crowd(12, true, (i) => ({ x: ship.x - 220 + i * 40, y: ship.y - 90 - (i % 3) * 30 }));

  assert.ok(crowd12.frame.baked <= 2,
    'twelve bodies alight bake at most the fire itself: ' + crowd12.frame.baked);
  assert.ok(glowStats().sprites - before <= 2,
    'and the whole of the fire is two sprites, twelve bodies or one: +' +
    (glowStats().sprites - before));

  const steady = frameCost();
  assert.equal(steady.baked, 0, 'and the next frame bakes nothing at all');
});
