// The cold as it is drawn (PLAN 3.5's Chill, render/entities.js).
//
// There is no browser here, so this cannot say the frost reads as cold. What it can say is
// the five promises that make it an honest piece of the picture rather than a decoration -
// the same kind of promise every other light in this game is held to:
//
//   a crowd that is not chilled costs exactly what an empty sky costs, and a ship that has
//     taken the card and hit nothing paints nothing either: ranks are not rime;
//   a chilled body costs one stamp and no strokes, a frozen one one stamp more and one
//     stroke, and none of it is a blur or a gradient (render/glow.js) - and it is the same
//     two sprites however many bodies are cold, because the rime is baked once and stamped at
//     the size of whatever is wearing it;
//   the rime is stamped where the body is, and the shell stands off it, so a frozen body is
//     bigger on the screen than a walking one: the shell is how a player knows, *before* the
//     death, that this body will shatter (game/chill.js);
//   a chilled body off the edge of the window is not drawn at all;
//   and the ice does not turn with the body: a shell that spun with whatever is inside it is a
//     spinning hexagon, and a spinning hexagon forty times over is a strobe. The stamps have
//     to land on the body, in the flat space the harness can see, for that reason and that one
//     only (tools/headless/harness.js reads a translate, not a rotate).
//
// Same trick as test/burn-art.test.mjs and test/nova-art.test.mjs: count what a frame asks
// the canvas for, and look at where the stamps landed (tools/headless/harness.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { makeEnemy } from '../src/game/kinds.js';
import { stats as glowStats } from '../src/render/glow.js';

const ROOT = path.resolve(import.meta.dirname, '..');
// One device pixel to the CSS pixel, so a stamp can be compared with the numbers in
// render/entities.js without a scale factor in the way.
const game = await bootGame({ root: ROOT, seed: 74, dpr: 1 });
const field = game.world;
const ship = field.player;
const BIG = 1e6;

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
  field.spawnTimer = Infinity;
  field.shake = 0;
  field.upgrades.chill = 0;
  ship.invuln = Infinity;
}

/** What one frame cost to draw, and how many sprites it had to bake to do it. */
function frameCost() {
  const before = game.drawCalls();
  const beforeBakes = game.bakeCalls();
  game.step();
  const after = game.drawCalls();
  const afterBakes = game.bakeCalls();
  return {
    fills: after.fills - before.fills,
    strokes: after.strokes - before.strokes,
    images: after.images - before.images,
    texts: after.texts - before.texts,
    gradients: after.gradients - before.gradients,
    shadows: after.shadows - before.shadows,
    baked: afterBakes.canvases - beforeBakes.canvases,
    stamps: game.stamps(),
  };
}

/** One body of `type` standing still at (x, y), cold by `frost` if one is given. */
function plant(type, x, y, frost) {
  const body = makeEnemy(field, type, x, y);
  body.hp = BIG;
  body.maxhp = BIG;
  body.speed = 0;
  body.frost = frost === undefined ? 0 : frost;
  field.enemies.push(body);
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

/** How far out from this body the frame drew a path point, in px: the size of what it is
 *  wearing, measured off the canvas rather than intended by the code that drew it. */
function reachAt(body) {
  const here = game.screenOf(body.x, body.y);
  let furthest = 0;
  for (const point of game.points()) {
    const off = Math.hypot(point.x - here.x, point.y - here.y);
    if (off > 60) continue;         // the ship and its crowd are further off than this
    furthest = Math.max(furthest, off);
  }
  return furthest;
}

/** A crowd of `count` bodies, cold by `frost` or not, and the frame that showed them. */
function crowd(count, frost, spot) {
  clearTheSky();
  field.upgrades.chill = frost === undefined ? 0 : BALANCE.upgrades.chill.ranks;
  const bodies = [];
  for (let i = 0; i < count; i++) {
    const where = spot === undefined
      ? { x: ship.x - 60 + i * 40, y: ship.y - 150 }
      : spot(i);
    bodies.push(plant('drifter', where.x, where.y, frost));
  }
  return { bodies: bodies, frame: frameCost() };
}

test('ranks are not rime: a ship that took the card and hit nothing paints nothing', () => {
  // The same crowd twice, once with the line taken and once without. Nothing has been hit in
  // either, so nothing is cold, and the frame may not know the difference: this is the one
  // promise that stops a bought line from quietly drawing itself whether or not it is doing
  // anything.
  const plain = crowd(6, undefined);
  field.upgrades.chill = BALANCE.upgrades.chill.ranks;
  assert.ok(field.enemies.every((body) => body.frost === 0),
    'the card is taken and nothing has been hit');

  const bought = frameCost();
  assert.equal(bought.images, plain.frame.images,
    'six bodies with nothing cold add no light of their own: '
    + plain.frame.images + ' against ' + bought.images);
});

test('a chilled body costs one stamp and no strokes, a frozen one one stamp and one more', () => {
  const warm = crowd(1, undefined);
  const chilled = crowd(1, 0.4);
  const frozen = crowd(1, 1);
  const twoChilled = crowd(2, 0.4);
  const twoWarm = crowd(2, undefined);

  assert.equal(chilled.frame.images - warm.frame.images, 1,
    'the rime is exactly one stamp: ' + (chilled.frame.images - warm.frame.images));
  assert.equal(twoChilled.frame.images - twoWarm.frame.images, 2,
    'and a second cold body is the same stamp again, not something bigger');
  assert.equal(chilled.frame.strokes, warm.frame.strokes, 'none of the rime is a stroke');

  assert.equal(frozen.frame.images - warm.frame.images, 2,
    'a shell is the rime plus one glow of its own');
  assert.equal(frozen.frame.strokes - warm.frame.strokes, 1, 'and one stroke: the shell itself');
  assert.equal(chilled.frame.shadows, 0, 'and none of it is a blur');
  assert.equal(chilled.frame.gradients, 0, 'or a gradient built this frame');
});

test('the rime is stamped on the body it is cold in', () => {
  const warm = crowd(1, undefined);
  const body = warm.bodies[0];
  const before = at(warm.frame.stamps, body.x, body.y).length;

  const cold = crowd(1, 1);
  const after = at(cold.frame.stamps, cold.bodies[0].x, cold.bodies[0].y).length;
  assert.equal(after - before, 2,
    'both of them landed on the body, not on the sky beside it: ' + before + ' then ' + after);
});

test('a frozen body is painted bigger than a chilled one, which is the whole tell', () => {
  // The shell has to reach further out than the rime, or "frozen" and "chilled" are one shape
  // at two brightnesses and the shatter arrives out of nowhere (game/chill.js).
  const chilled = crowd(1, 0.4);
  const narrow = reachAt(chilled.bodies[0]);
  const frozen = crowd(1, 1);
  const wide = reachAt(frozen.bodies[0]);

  assert.ok(narrow > 0, 'a chilled body has something drawn round it');
  assert.ok(wide > narrow + 4,
    'and a frozen one stands in a shell that reaches further out: ' + narrow.toFixed(1)
    + ' px against ' + wide.toFixed(1));
});

test('cold off the edge of the window is not drawn at all', () => {
  const offscreen = () => ({ x: ship.x + 4000, y: ship.y });
  const warm = crowd(1, undefined, offscreen);
  const frozen = crowd(1, 1, offscreen);

  assert.equal(frozen.frame.images, warm.frame.images,
    'nothing was stamped for a body nobody can see');
});

test('a frozen crowd asks for two sprites, however many bodies it is', () => {
  const before = glowStats().sprites;
  const many = crowd(12, 1, (i) => ({ x: ship.x - 220 + i * 40, y: ship.y - 90 - (i % 3) * 30 }));

  assert.ok(many.frame.baked <= 2,
    'twelve bodies frozen solid bake at most the ice itself: ' + many.frame.baked);
  assert.ok(glowStats().sprites - before <= 2,
    'and the whole of it is two sprites, twelve bodies or one: +'
    + (glowStats().sprites - before));

  const steady = frameCost();
  assert.equal(steady.baked, 0, 'and the next frame bakes nothing at all');
});
