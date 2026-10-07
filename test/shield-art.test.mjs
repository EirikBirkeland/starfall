// The shielder's field as drawn (PLAN 3.3's "projects a shield onto nearby enemies").
//
// There is no browser here, so this cannot say what the fence, the links and the
// bubbles look like. What it can say is the four things that make them a tell rather
// than a decoration:
//
//   they are drawn for a shielder and for nothing else, and a crowd with no shielder
//   in it asks the canvas for not one more thing than an empty sky does;
//   they cost strokes and dashes and never a blur or a gradient;
//   the brightness of a bubble is the simulation's own numbers about the shield over
//   that body, so it cannot shine while the thing it is telling you about is gone;
//   and the fence is culled by its own reach, so a shielder whose circle covers the
//   window is drawn even when the body holding it is not - a warning you can only see
//   once the danger is on screen is not one.
//
// Same trick as test/blast-art.test.mjs: count what a frame asks the canvas for.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { makeEnemy } from '../src/game/kinds.js';
import { bubbleLight, linkLight } from '../src/render/entities.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 47 });
const field = game.world;
const ship = game.player;
const G = BALANCE.kinds.shielder.guard;

// The title screen draws the menu crowd and no ship, so get a run going first.
game.pressMouse(640, 360);
game.step();
game.releaseMouse();

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

/** Put one enemy of `type` at (x, y) for the next frame only. */
function planted(type, x, y) {
  const enemy = makeEnemy(field, type, x, y);
  enemy.speed = 0;          // it is scenery for one frame; it must not walk anywhere
  field.enemies.push(enemy);
  return enemy;
}

/**
 * Paint the scene as it stands for `seconds`, holding every planted body exactly where
 * the test put it - a band-walker shuffles sideways even with no speed to walk with,
 * and these tests want to know what a field *looks like*, not where it wandered to.
 */
function holdScene(seconds) {
  const props = field.enemies.slice();
  const spots = props.map((e) => [e.x, e.y]);
  for (let i = 0; i < Math.ceil(seconds * 1000 / 16.7); i++) {
    game.step();
    for (let j = 0; j < props.length; j++) {
      props[j].x = spots[j][0];
      props[j].y = spots[j][1];
    }
  }
}

/** A shielder with one body under its fence, and both of them filled right up. */
function coveredScene() {
  clearTheSky();
  const shielder = planted('shielder', ship.x + 220, ship.y);
  const body = planted('drifter', shielder.x - 40, shielder.y);
  holdScene((G.cap / G.rate) + 0.5);
  return { shielder, body };
}

/** A body with `shield` points of shield over it, standing in somebody's field. */
function shieldedLike(shield) {
  const body = makeEnemy(field, 'drifter', ship.x + 100, ship.y);
  const holder = makeEnemy(field, 'shielder', ship.x + 200, ship.y);
  body.guard = holder;
  body.shield = shield;
  return body;
}

/** A body no field reaches at all. */
function bareBody() {
  const body = makeEnemy(field, 'drifter', ship.x + 100, ship.y);
  return body;
}

/** How far apart two things are. */
function apart(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** How far past the right edge of the window an arena point sits, in px. */
function pastTheEdge(x) {
  const camera = game.camera;
  return x - (camera.x + camera.w);
}

// --- what it costs to paint --------------------------------------------------

test('a crowd with no shielder in it asks for nothing', () => {
  clearTheSky();
  const empty = frameCost();

  clearTheSky();
  for (const type of ['drifter', 'weaver', 'darter', 'spitter', 'tank']) {
    planted(type, ship.x - 300 + 60 * type.length, ship.y - 100);
  }
  const crowd = frameCost();

  // The bomber is not in this list: it draws a dashed ring of its own, and
  // test/blast-art.test.mjs is the file that promises it is the only other one.
  assert.equal(crowd.dashes, empty.dashes, 'not one dash from the kinds that carry no field');
  assert.ok(crowd.strokes > empty.strokes, 'the crowd is being drawn, of course');
});

test('a shielder draws its fence, and asks for no blur', () => {
  clearTheSky();
  planted('drifter', ship.x + 300, ship.y);
  const plain = frameCost();

  clearTheSky();
  planted('shielder', ship.x + 300, ship.y);
  const shielder = frameCost();

  assert.equal(shielder.dashes - plain.dashes, 1, 'one dash pattern, for the circle');
  assert.equal(shielder.strokes - plain.strokes, 3,
    'two passes for the fence, and the arc of the face it stands with - and that is all');
  assert.equal(shielder.gradients, 0, 'no gradient built for any of it');
  assert.equal(shielder.shadows, 0, 'and the canvas was never asked to blur it');
});

test('a covered body wears a bubble, and a link back to who is covering it', () => {
  // The comparison has to be between two scenes that both have a body in them, or the
  // body's own outline is counted as though it were the bubble.
  clearTheSky();
  const lonely = planted('shielder', ship.x + 220, ship.y);
  const outside = planted('drifter', ship.x - 400, ship.y);
  assert.ok(apart(outside, lonely) > G.radius, 'the first scene has a body, but an uncovered one');
  holdScene((G.cap / G.rate) + 0.5);
  const alone = frameCost();

  clearTheSky();
  const near = planted('shielder', ship.x + 220, ship.y);
  const body = planted('drifter', near.x - 40, near.y);
  holdScene((G.cap / G.rate) + 0.5);
  const covered = frameCost();

  assert.equal(covered.dashes - alone.dashes, 1, 'the link is a second dash pattern');
  assert.equal(covered.strokes - alone.strokes, 5,
    'five passes for it: the track the shield grows back along, the shield itself in '
    + 'two passes, and the link in two');
  assert.ok(body.shield >= G.cap, 'and the bubble had a full shield to be filled with');
  assert.equal(covered.shadows, 0, 'and none of it asked for a blur');
});

test('the fence is culled by its reach and not by its body', () => {
  // Dash patterns are what is compared here, not strokes: an enemy off the window also
  // buys itself an arrow on the edge of it (render/indicators.js), which would be
  // counted as though the fence had been drawn.
  clearTheSky();
  const cost0 = frameCost();

  // Stand a shielder just past the right edge, close enough that its circle reaches
  // back into the window: the fence is what you need to see, so that is what decides.
  clearTheSky();
  const near = planted('shielder', game.camera.x + game.camera.w + G.radius - 20, ship.y);
  near.speed = 0;
  const reaching = frameCost();
  assert.ok(pastTheEdge(near.x) > 0, 'the body that owns it is off the window');
  assert.ok(reaching.dashes > cost0.dashes, 'and still the fence is drawn');

  clearTheSky();
  const far = planted('shielder', game.camera.x + game.camera.w + G.radius + 400, ship.y);
  far.speed = 0;
  const nowhere = frameCost();
  assert.equal(nowhere.dashes, cost0.dashes, 'a field that reaches nowhere is not drawn at all');
  assert.ok(reaching.dashes > nowhere.dashes, 'and the one that reaches back into the window is');
});

// --- what it says ------------------------------------------------------------

test('a body no field is covering is not lit at all', () => {
  const bare = bareBody();
  assert.equal(bubbleLight(bare, 1), 0, 'no bubble for a body on its own');
  assert.equal(linkLight(bare, 1), 0, 'and no line pointing at nobody');
});

test('a whole shield is the brightest thing on the body, and an empty one is a whisper', () => {
  const whole = bubbleLight(shieldedLike(G.cap), 1);
  const soaked = bubbleLight(shieldedLike(0), 1);
  const half = bubbleLight(shieldedLike(G.cap / 2), 1);

  assert.ok(whole > 0.5, 'a full one is a shout: ' + whole.toFixed(2));
  assert.ok(soaked < whole / 3, 'one that has just been eaten is quiet: ' + soaked.toFixed(2));
  assert.ok(half > soaked && half < whole, 'and what is left of a shield is between them');
});

test('a shield that is waiting to refill breathes instead of sitting there', () => {
  const waiting = shieldedLike(0);
  waiting.shieldWait = G.after;
  let dimmest = Infinity;
  let brightest = 0;
  for (let i = 0; i < 200; i++) {
    const light = bubbleLight(waiting, i / 20);
    dimmest = Math.min(dimmest, light);
    brightest = Math.max(brightest, light);
  }

  assert.ok(brightest > dimmest, 'it moves: ' + dimmest.toFixed(3) + ' to ' + brightest.toFixed(3));
  assert.ok(dimmest > 0, 'but never out, because the field is still there');
  assert.ok(brightest < bubbleLight(shieldedLike(G.cap), 1),
    'and never as loud as a shield that is actually up');
});

test('the light and the shield it reports on go the same way', () => {
  // The one promise that makes all of this a tell: the brightness is a function of the
  // shield, so it cannot be shining over a body that has nothing over it any more.
  let last = -1;
  for (let i = 0; i <= G.cap * 10; i++) {
    const body = shieldedLike(i / 10);
    const light = bubbleLight(body, 3);
    assert.ok(light >= last, 'it never gets quieter as the shield over it grows');
    last = light;
    assert.ok(linkLight(body, 3) > 0, 'and the link is lit whenever the bubble is');
  }
});

test('the bubble and the fence agree about how far a field reaches', () => {
  // Both are drawn out of the same number the simulation covers bodies with, which is
  // the only reason a circle on the floor can be trusted (same promise as the bomber's
  // death zone, test/blast-art.test.mjs).
  const shielder = makeEnemy(field, 'shielder', ship.x + 200, ship.y);
  const body = makeEnemy(field, 'drifter', ship.x + 200 + G.radius, ship.y);
  field.enemies.push(shielder, body);
  for (let i = 0; i < 12; i++) game.step();

  assert.equal(body.guard, shielder, 'a body standing exactly on the line is covered');
  assert.ok(body.shield > 0, 'so the ring drawn round it has something in it');
  field.enemies.length = 0;
});
