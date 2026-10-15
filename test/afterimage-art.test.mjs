// The afterimage as it is drawn (PLAN 3.5, render/entities.js and render/cards.js).
//
// There is no browser here, so this cannot say the pale ship standing in the arena reads as
// "that is where it was". What it can say is the four promises that make it an honest piece of
// the picture:
//
//   nothing is painted at all until a dash has left something: an image is not drawn by a run
//     that has not bought the line, and not drawn once its two seconds are up;
//   the circle round each one is drawn at exactly `bait` - the reach the simulation measures a
//     chase from - so the line on the screen is the line a body has to be inside of, the same
//     bargain a bomber's zone and the orbital track make;
//   an image costs strokes and nothing built mid-frame: no gradient, no blur, and no sprite of
//     its own, because the glow is the house trick of a wide faint pass under a thin bright one;
//   and five of them cost five times what one does, which is the whole point of a rank - and a
//     rank is bought with ground, so standing five is a dash and then running on;
//   and the card is on the rack: the thirteenth icon exists, paints, and asks for nothing a frame
//     has to build.
//
// Same trick as test/overcharge-art.test.mjs and test/nova-art.test.mjs: count what a frame asks
// the canvas for (tools/headless/harness.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { makeFrameCost } from '../tools/headless/frame-cost.js';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const AI = BALANCE.upgrades.afterimage;
const game = await bootGame({ root: ROOT, seed: 83, dpr: 1 });
const field = game.world;

// A run under way: the title screen draws no ship, and no images. The press comes from the mouse,
// because Space would also spend a dash (test/controls.test.mjs).
game.pressMouse(640, 360);
game.step();
game.releaseMouse();
game.step();

// Nothing else in the arena, and nothing that can hurt the ship: this file is about what a frame
// costs to paint, and a wave arriving mid-measurement would be a different measurement each time.
field.spawnTimer = Infinity;
field.player.invuln = Infinity;

/**
 * Paint one frame and report what it asked the arena for. The interface is painted on every frame
 * and one mark of it belongs to every line the run owns, which is not what this file is measuring,
 * so it is measured apart: tools/headless/frame-cost.js.
 */
const paintFrame = makeFrameCost(game);

/**
 * Dash to the right, through the game's own door: the right mouse button. The cooldown is
 * cleared first - a test that measures what a dash paints is allowed to ask for one, and the
 * 2.5 s wait is what test/dash.test.mjs is about, not this file.
 */
function dashRight() {
  const ship = field.player;
  ship.dashCd = 0;
  const on = game.screenOf(ship.x + 300, ship.y);
  game.moveMouse(on.x, on.y);
  game.pressMouse(on.x, on.y, 2);
  for (let i = 0; i < Math.round(BALANCE.player.dash.time / 0.0167) + 2; i++) game.step(16.7);
  game.releaseMouse(2);
}

/**
 * Stand `ranks` images in the arena, and let the frames settle so whatever the dash threw up has
 * died down before anything is counted. A dash lays what its own 220 px covers, so a stand of more
 * than that is a dash and then running on until the trail is spent - which is how the upper ranks
 * are actually paid for (game/afterimage.js).
 *
 * The ship is put back in the middle first. The trail needs 400 px of arena to be laid in, and a
 * stand that measures what a frame costs has to start where the last one started, or the fourth one
 * in a row is measured against a wall.
 */
const SETTLE = 25;        // frames: past the dash's longest particle (0.32 s), well inside 2 s

function stand(ranks) {
  const ship = field.player;
  field.upgrades.afterimage = ranks;
  field.afterimage.trail.clear();
  ship.x = field.arena.w / 2;
  ship.y = field.arena.h / 2;
  ship.vx = 0;
  ship.vy = 0;
  if (ranks > 0) {
    dashRight();
    game.key('KeyD', true);
    for (let i = 0; i < 120 && field.afterimage.left > 0; i++) game.step(16.7);
    game.key('KeyD', false);
  }
  for (let i = 0; i < SETTLE; i++) game.step(16.7);
  paintFrame();
  return field.afterimage.trail.items.slice();
}

test('nothing is painted until a dash has left something', () => {
  const none = stand(0);
  assert.equal(none.length, 0, 'a run that has not bought the line leaves nothing');
  const cold = paintFrame();

  const some = stand(3);
  assert.equal(some.length, 3);
  const warm = paintFrame();

  assert.ok(warm.strokes > cold.strokes,
    'three images are three silhouettes and three reach circles: '
    + cold.strokes + ' strokes against ' + warm.strokes);
});

test('the circle round an image is the reach the sim measures a chase from', () => {
  const some = stand(3);
  paintFrame();
  const frame = paintFrame();

  for (const image of some) {
    const ring = frame.circles.find((one) => one.r === AI.bait
      && Math.abs(one.x - image.x) < 0.001 && Math.abs(one.y - image.y) < 0.001);
    assert.ok(ring !== undefined,
      'an image at ' + image.x.toFixed(0) + ',' + image.y.toFixed(0)
      + ' is drawn with a circle of ' + AI.bait + ' px round it');
  }
});

test('an image costs strokes and nothing built mid-frame', () => {
  stand(1);
  const frame = paintFrame();
  assert.equal(frame.gradients, 0, 'nothing built a gradient');
  assert.equal(frame.shadows, 0, 'nothing asked the canvas for a blur');
  assert.equal(frame.baked, 0, 'and nothing baked a sprite: an image glows with a wide stroke');
});

test('five images cost five times what one does, and no more per image', () => {
  stand(1);
  const one = paintFrame();
  stand(5);
  const five = paintFrame();

  // Three strokes each: the reach, the wide faint pass, the thin bright one. (No promise about
  // fills: the starfield twinkles, and a whole frame's fill count moves by a star or two between
  // one frame and the next. Only the strokes belong to the images.)
  const perImage = (five.strokes - one.strokes) / 4;
  assert.ok(Math.abs(perImage - 3) < 0.01, 'each image is three strokes, was ' + perImage);
  assert.equal(five.gradients, 0);
  assert.equal(five.shadows, 0);
  assert.equal(five.baked, 0, 'and the fifth one asks for nothing the first one did not');
});

test('an image that has gone out stops being painted on the step it goes', () => {
  const some = stand(2);
  const alive = paintFrame();
  field.afterimage.trail.clear();
  const gone = paintFrame();
  assert.ok(alive.strokes > gone.strokes, 'they were what those strokes were');
  assert.equal(field.afterimage.trail.count, 0);
  assert.equal(some.length, 2);
});

test('the afterimage card is on the rack and paints', () => {
  const offer = field.offer.slice();
  field.offer.length = 0;
  field.offer.push('afterimage');
  field.state = STATE.LEVEL;
  field.offerTime = field.time;

  paintFrame();                       // the icon's glow is baked on meeting it
  const frame = paintFrame();
  assert.ok(frame.words.indexOf('AFTERIMAGE') >= 0, 'the card carries its name');
  assert.ok(frame.words.indexOf('+1 image left behind') >= 0,
    'and the number it is selling: ' + frame.words.join(' / '));
  assert.equal(frame.gradients, 0, 'and it asks for nothing built mid-frame');
  assert.equal(frame.shadows, 0, 'and nothing blurred');

  field.state = STATE.PLAY;
  field.offer.length = 0;
  for (const id of offer) field.offer.push(id);
});
