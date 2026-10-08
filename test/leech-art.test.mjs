// The leech as it is drawn (PLAN 3.5, render/hud.js and render/cards.js).
//
// There is no browser here, so this cannot say the meter reads as "bodies coming back". What
// it can say is the four promises that make it an honest piece of the picture:
//
//   it is not drawn at all until the run has bought the line - an anonymous filling bar in the
//     corner of the screen would be a riddle, and ranks the player does not have are not a
//     meter;
//   it costs strokes and a word, and no blur, no gradient and no sprite of its own: a bar
//     glows the way the XP bar does (render/glow.js);
//   a charge held costs exactly what a charge filling costs - the difference between them is
//     how bright the bar is, and brightness is alpha, not geometry;
//   and the card is on the rack: the eleventh icon exists, paints, and asks for nothing a
//     frame has to build.
//
// Same trick as test/chill-art.test.mjs and test/dash.test.mjs: count what a frame asks the
// canvas for (tools/headless/harness.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const LEECH = BALANCE.upgrades.leech;
const game = await bootGame({ root: ROOT, seed: 75, dpr: 1 });
const field = game.world;

// A run under way: the title screen draws no HUD. The press comes from the mouse, because
// Space would also spend a dash (test/controls.test.mjs).
game.pressMouse(640, 360);
game.step();
game.releaseMouse();
game.step();

/** Paint one frame and report what it asked the canvas for. */
function paintFrame() {
  const before = game.drawCalls();
  const baked = game.bakeCalls();
  game.step();
  const after = game.drawCalls();
  const now = game.bakeCalls();
  return {
    texts: after.texts - before.texts,
    strokes: after.strokes - before.strokes,
    fills: after.fills - before.fills,
    gradients: after.gradients - before.gradients,
    shadows: after.shadows - before.shadows,
    baked: now.canvases - baked.canvases,
    words: game.words(),
  };
}

/** Put the leech at a rank, with `kills` of the price counted and `held` charges in hand. */
function arm(ranks, kills, held) {
  field.upgrades.leech = ranks;
  field.leech.kills = kills;
  field.leech.held = held === undefined ? 0 : held;
}

test('the meter is not drawn until the run has bought the line', () => {
  arm(0, 0, 0);
  const without = paintFrame();
  arm(1, 0, 0);
  const withTheLine = paintFrame();

  assert.ok(withTheLine.texts > without.texts, 'the line is worth a word on the screen');
  assert.ok(withTheLine.strokes > without.strokes, 'and a bar, and a pip at the end of it');
  assert.ok(without.words.indexOf('LEECH') < 0, 'and none of it before the card was taken');
});

test('the meter says what it is, and costs nothing a frame has to build', () => {
  arm(1, 1, 0);
  paintFrame();                       // bake whatever it needs, once
  const frame = paintFrame();

  assert.ok(frame.words.indexOf('LEECH') >= 0, 'and the word is the line it belongs to');
  assert.equal(frame.gradients, 0, 'nothing built a gradient');
  assert.equal(frame.shadows, 0, 'nothing asked the canvas for a blur');
  assert.equal(frame.baked, 0, 'and nothing baked a sprite either: a bar glows with a stroke');
});

test('a charge held costs exactly what a charge filling costs', () => {
  arm(1, LEECH.base - LEECH.step, 0);
  paintFrame();
  const filling = paintFrame();
  arm(1, 0, 1);
  paintFrame();
  const held = paintFrame();

  assert.equal(held.strokes, filling.strokes, 'the same bar, brighter');
  assert.equal(held.fills, filling.fills, 'the same pip, the same track');
  assert.equal(held.texts, filling.texts, 'the same word');
});

test('the leech card is on the rack and paints', () => {
  const offer = field.offer.slice();
  field.offer.length = 0;
  field.offer.push('leech');
  field.state = STATE.LEVEL;
  field.offerTime = field.time;

  paintFrame();                       // the icon's glow is baked on meeting it
  const frame = paintFrame();
  assert.ok(frame.words.indexOf('LEECH') >= 0, 'the card carries its name');
  assert.ok(frame.words.indexOf('+6 fewer kills per hull') >= 0,
    'and the number it is selling: ' + frame.words.join(' / '));
  assert.equal(frame.gradients, 0, 'and it asks for nothing built mid-frame');
  assert.equal(frame.shadows, 0, 'and nothing blurred');

  field.state = STATE.PLAY;
  field.offer.length = 0;
  for (const id of offer) field.offer.push(id);
});
