// An elite, and a large shard, as drawn (PLAN section 4: "elites outlined in gold").
//
// There is no browser here, so this cannot say that the gold is gold. What it can say
// is the four things that make the outline do its job: an elite costs a little more
// to paint than its plain self and a lot more than nothing; its hull ring appears
// only once there is hull to show draining, and a plain body never grows one; a gold
// body off the window costs exactly nothing, because the outline is culled with the
// body it outlines; and none of it asks the canvas for a blur or a gradient, the
// same promise every other light in the game makes (render/glow.js).
//
// Same trick as test/blast-art.test.mjs: count what a frame asks the canvas for, and
// look at where the stamps landed.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { PALETTE } from '../src/core/palette.js';
import { makeEnemy } from '../src/game/kinds.js';
import { healPlayer } from '../src/game/player.js';
import { dropBigShard, dropShards } from '../src/game/pickups.js';
import { arrowCount } from '../src/render/indicators.js';

const ROOT = path.resolve(import.meta.dirname, '..');
// One device pixel to the CSS pixel, so a stamp's size can be compared with the
// numbers in render/entities.js without a scale factor in the way.
const game = await bootGame({ root: ROOT, seed: 44, dpr: 1 });
const field = game.world;
const ship = field.player;
const E = BALANCE.elite;

// The title screen draws the menu crowd and no ship, so get a run going first. The
// press comes from the mouse, because Space would also spend a dash (test/controls).
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
  ship.invuln = Infinity;
  // An arrow at the window edge eases out over a fifth of a second (render/indicators.js),
  // so a frame measured straight after one that had a body off the glass would still
  // be paying for that arrow. Let it go.
  for (let i = 0; i < 30; i++) game.step();
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

/** An empty arena, one frame of it. The baseline every comparison below starts from. */
function emptyFrame() {
  clearTheSky();
  return frameCost();
}

/** Put one enemy of `type` 240 px along from the ship, gold or not, for one frame. */
function planted(type, elite) {
  const enemy = makeEnemy(field, type, ship.x + 240, ship.y, elite ? { elite: true } : null);
  enemy.speed = 0;          // it is scenery for one frame; it must not walk anywhere
  field.enemies.push(enemy);
  return enemy;
}

/** The label list, copied out before anything else can spend the pool. */
function labels() {
  const out = [];
  for (let i = 0; i < field.texts.count; i++) {
    out.push({ text: field.texts.items[i].text, color: field.texts.items[i].color });
  }
  return out;
}

/**
 * The widest stamp the next frame puts on the glass at (x, y) - which is how a test
 * can measure the size of a light without ever seeing a pixel. Stamps are logged at
 * their top-left, so the middle is half a sprite back along both axes.
 */
function widestStampAt(x, y) {
  const spot = game.screenOf(x, y);
  game.step();
  let best = null;
  let bestDistance = Infinity;
  for (const stamp of game.stamps()) {
    const distance = Math.hypot(stamp.at.x + stamp.w / 2 - spot.x, stamp.at.y + stamp.h / 2 - spot.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = stamp;
    }
  }
  return { stamp: best, distance: bestDistance };
}

/**
 * Drop one shard at (x, y) and pin it there: a prop for the frame to be measured on,
 * not a thing flying past. `worth` is what makes it a large one.
 */
function aShardAt(x, y, worth) {
  if (worth > 1) dropBigShard(field, x, y);
  else dropShards(field, x, y, 1);
  const shard = field.shards.items[field.shards.count - 1];
  shard.vx = 0;
  shard.vy = 0;
  shard.px = x;
  shard.py = y;
  shard.x = x;
  shard.y = y;
  return shard;
}

/**
 * How far the path points land from (x, y) on the next frame - the size of whatever
 * body is drawn there, measured rather than assumed. Points further than `limit` away
 * belong to something else and are ignored.
 */
function bodyReach(x, y, limit) {
  game.step();
  const spot = game.screenOf(x, y);
  let reach = 0;
  for (const point of game.points()) {
    const distance = Math.hypot(point.x - spot.x, point.y - spot.y);
    if (distance <= limit && distance > reach) reach = distance;
  }
  return reach;
}

test('gold costs a stroke and a light over its own kind, and no blur', () => {
  const empty = emptyFrame();

  clearTheSky();
  planted('drifter', false);
  const plain = frameCost();

  clearTheSky();
  planted('drifter', true);
  const gold = frameCost();

  assert.ok(plain.strokes > empty.strokes && plain.images > empty.images,
    'the plain body was drawn at all, or the comparison below means nothing');
  assert.equal(gold.strokes - plain.strokes, 1,
    'one pass more: the wide gold under the thin gold outline');
  assert.equal(gold.images - plain.images, 1, 'and one light, so it shines gold');
  assert.equal(gold.gradients, 0, 'nothing built a gradient for it');
  assert.equal(gold.shadows, 0, 'and the canvas was never asked to blur it');
});

test('the hull ring appears when there is hull to show draining', () => {
  clearTheSky();
  planted('drifter', false);
  const plain = frameCost();

  clearTheSky();
  planted('drifter', true);
  const whole = frameCost();

  clearTheSky();
  planted('drifter', true).hp = 1;
  const wounded = frameCost();

  assert.equal(wounded.strokes - whole.strokes, 1,
    'one more stroke, and it is the ring closing as the hull goes');
  assert.equal(wounded.images, whole.images, 'and no more light for it');

  // A plain body the same size and the same half-hull pays nothing: the ring belongs
  // to an elite, whose fourfold hull is the thing that needs reading.
  clearTheSky();
  planted('drifter', false).hp = 1;
  const plainHurt = frameCost();
  assert.equal(plainHurt.strokes, plain.strokes,
    'a plain wounded body costs exactly what a plain whole one does');
  assert.equal(plainHurt.images, plain.images, 'and no more light either: it is not gold');

  // A gold tank has its own hull arc as well, and still asks for no blur.
  clearTheSky();
  planted('tank', true).hp = 1;
  const goldTank = frameCost();
  assert.equal(goldTank.shadows, 0, 'two rings and not one blur');
});

test('a body off the window paints no body, and an elite earns an arrow', () => {
  // Both halves of the promise at once: the outline is culled with the body it
  // outlines, so nothing of a gold body off the glass is drawn - and that body is
  // then worth the one thing PLAN section 4 asks an arrow for, which its plain self
  // standing in the same place is not.
  const empty = emptyFrame();
  const justOff = game.camera.x + game.camera.w + 400;

  clearTheSky();
  const plain = makeEnemy(field, 'drifter', justOff, ship.y);
  plain.speed = 0;
  field.enemies.push(plain);
  assert.deepEqual(frameCost(), empty, 'a plain drifter out there is not worth a look');
  assert.equal(arrowCount(), 0, 'and not worth an arrow either');

  clearTheSky();
  const gold = makeEnemy(field, 'drifter', justOff, ship.y, { elite: true });
  gold.speed = 0;
  field.enemies.push(gold);
  const cost = frameCost();
  assert.equal(arrowCount(), 1, 'the gold one is');
  assert.equal(cost.strokes - empty.strokes, 2, 'one arrow: a wide pass and a thin one');
  assert.equal(cost.images - empty.images, 1, 'and its light');
  assert.equal(cost.fills, empty.fills, 'and none of the body itself');

  clearTheSky();
  const nowhere = makeEnemy(field, 'drifter', game.camera.x + game.camera.w + 2000, ship.y,
    { elite: true });
  nowhere.speed = 0;
  field.enemies.push(nowhere);
  assert.deepEqual(frameCost(), empty, 'and a gold body nowhere near is not worth one either');
});

test('a large shard is drawn bigger than a plain one, in body and in light', () => {
  const x = ship.x + 260;
  const y = ship.y;

  clearTheSky();
  aShardAt(x, y, 1);
  assert.equal(field.shards.count, 1, 'a plain shard is standing there');
  const plain = widestStampAt(x, y);
  const plainBody = bodyReach(x, y, 40);

  clearTheSky();
  aShardAt(x, y, BALANCE.shards.big.worth);
  assert.equal(field.shards.count, 1, 'and now a large one');
  const big = widestStampAt(x, y);
  const bigBody = bodyReach(x, y, 40);

  assert.ok(plain.distance < 12, 'the stamp found belongs to the shard: ' + plain.distance);
  assert.ok(big.distance < 12, 'and the same for the large one: ' + big.distance);
  assert.ok(big.stamp.w > plain.stamp.w * 1.2,
    'a large shard is a larger light: ' + big.stamp.w + ' px against ' + plain.stamp.w);
  assert.ok(plainBody > 3, 'the plain body was measured at all: ' + plainBody);
  assert.ok(bigBody > plainBody * 1.2,
    'and its body is bigger too: ' + bigBody.toFixed(1) + ' px against ' + plainBody.toFixed(1));
});

test('a heal is said out loud, in the helpful half of the palette', () => {
  clearTheSky();
  ship.hull = 1;
  const rings = field.rings.count;

  assert.equal(healPlayer(field, 1), 1, 'one hull came back');
  assert.equal(ship.hull, 2);

  const spoken = labels().filter((label) => label.text === '+' + E.heal.hull + ' HULL');
  assert.equal(spoken.length, 1, 'and the ship said so over its own head');
  assert.equal(spoken[0].color, PALETTE.shardLine, 'in mint, because mint means help');
  assert.ok(field.rings.count > rings, 'with a ring out of the ship');

  const cost = frameCost();
  assert.ok(cost.texts >= 2, 'the words are on the glass: ' + cost.texts);
  assert.equal(cost.shadows, 0, 'and none of it asked for a blur');
  assert.equal(cost.gradients, 0, 'or a gradient');
});

test('a hull that is already whole is not painted a heal', () => {
  clearTheSky();
  ship.hull = ship.maxHull;
  const before = labels().length;
  const rings = field.rings.count;

  assert.equal(healPlayer(field, 1), 0, 'nothing was healed');
  assert.equal(labels().length, before, 'so nothing was said about it');
  assert.equal(field.rings.count, rings, 'and nothing shone');
});
