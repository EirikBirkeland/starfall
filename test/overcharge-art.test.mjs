// The overcharge as it is drawn (PLAN 3.5, render/entities.js and render/cards.js).
//
// There is no browser here, so this cannot say the ring round the hull reads as "the gun is
// loaded". What it can say is the four promises that make it an honest piece of the picture:
//
//   the ring is not drawn at all until the run has bought the line - a ring nothing can fill
//     would be a riddle, and it would be competing with the dash's cooldown ring for the same
//     twelve pixels of air around the ship;
//   it costs strokes and no blur, no gradient and no sprite of its own: a ring glows the way
//     every other ring in this game does, with a wide faint pass under a thin bright one;
//   a loaded ring costs no more than a filling one, and a charged shot costs one stroke more
//     than a plain one and nothing built mid-frame - the difference between those states is
//     alpha and radius, which is what a tell should be made of;
//   and the card is on the rack: the twelfth icon exists, paints, and asks for nothing a frame
//     has to build.
//
// Same trick as test/leech-art.test.mjs and test/dash.test.mjs: count what a frame asks the
// canvas for (tools/headless/harness.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OC = BALANCE.upgrades.overcharge;
const game = await bootGame({ root: ROOT, seed: 79, dpr: 1 });
const field = game.world;

// A run under way: the title screen draws no ship. The press comes from the mouse, because Space
// would also spend a dash (test/controls.test.mjs).
game.pressMouse(640, 360);
game.step();
game.releaseMouse();
game.step();

// Nothing else in the arena, and nothing that can hurt the ship: this file is about what a frame
// costs to paint, and a wave arriving mid-measurement would be a different measurement each time.
field.spawnTimer = Infinity;
field.player.invuln = Infinity;

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

/** Ranks of the line, and a charge of `charge` on the gun. */
function arm(ranks, charge) {
  field.upgrades.overcharge = ranks;
  field.overcharge.charge = charge === undefined ? 0 : charge;
}

/**
 * One shot in the air next to the ship, written field by field like any spawner must, and
 * charged or not as the test asks.
 */
function plantShot(charged) {
  const ship = field.player;
  const bullet = field.bullets.spawn();
  bullet.x = ship.x + 40;
  bullet.y = ship.y;
  bullet.px = bullet.x;
  bullet.py = bullet.y;
  bullet.vx = 300;
  bullet.vy = 0;
  bullet.life = BALANCE.weapons.pulse.life;
  bullet.dmg = BALANCE.weapons.pulse.damage;
  bullet.knock = BALANCE.weapons.pulse.knockback;
  bullet.pierce = 0;
  bullet.bounce = 0;
  bullet.charged = charged;
  bullet.hits.length = 0;
  return bullet;
}

test('the ring is not drawn until the run has bought the line', () => {
  arm(0, 0);
  const without = paintFrame();
  arm(1, 0.5);
  const withTheLine = paintFrame();

  assert.ok(withTheLine.strokes > without.strokes,
    'a ring is three arcs, and none of them belong to a run that has not bought the card');
});

test('the ring costs strokes and nothing built mid-frame', () => {
  arm(1, 0.5);
  paintFrame();                       // bake whatever it needs, once
  const frame = paintFrame();

  assert.equal(frame.gradients, 0, 'nothing built a gradient');
  assert.equal(frame.shadows, 0, 'nothing asked the canvas for a blur');
  assert.equal(frame.baked, 0, 'and nothing baked a sprite: a ring glows with a wide stroke');
});

test('a loaded ring is brighter and whole, and no dearer than a filling one', () => {
  arm(1, 0.5);
  paintFrame();
  const filling = paintFrame();
  arm(1, 1);
  paintFrame();
  const loaded = paintFrame();

  assert.ok(loaded.strokes <= filling.strokes,
    'the whole circle is two passes, not three: ' + loaded.strokes + ' against ' + filling.strokes);
  assert.equal(loaded.gradients, 0, 'and it asks for nothing built');
  assert.equal(loaded.baked, 0, 'and nothing baked');
  // (No promise about fills: the starfield twinkles, and a whole frame's fill count moves by a
  // star or two between one frame and the next. Only the strokes belong to the ring.)
});

test('a charged shot is one stroke heavier and nothing more', () => {
  field.bullets.clear();
  paintFrame();
  const plain = paintFrame();

  field.bullets.clear();
  plantShot(false);
  paintFrame();
  const onePlain = paintFrame();

  field.bullets.clear();
  plantShot(true);
  paintFrame();
  const oneCharged = paintFrame();

  assert.equal(onePlain.strokes, plain.strokes, 'a plain shot costs what a shot costs: a trail and a dot');
  assert.ok(oneCharged.strokes >= onePlain.strokes + 1,
    'a charged one is the same with a ring of light under it');
  assert.equal(oneCharged.gradients, 0, 'and it builds nothing');
  assert.equal(oneCharged.shadows, 0, 'and blurs nothing');
  assert.equal(oneCharged.baked, 0, 'and bakes nothing of its own');

  field.bullets.clear();
});

test('the overcharge card is on the rack and paints', () => {
  const offer = field.offer.slice();
  field.offer.length = 0;
  field.offer.push('overcharge');
  field.state = STATE.LEVEL;
  field.offerTime = field.time;

  paintFrame();                       // the icon's glow is baked on meeting it
  const frame = paintFrame();
  assert.ok(frame.words.indexOf('OVERCHARGE') >= 0, 'the card carries its name');
  assert.ok(frame.words.indexOf('+' + Math.round(OC.step * 100) + '% charged shot') >= 0,
    'and the number it is selling: ' + frame.words.join(' / '));
  assert.equal(frame.gradients, 0, 'and it asks for nothing built mid-frame');
  assert.equal(frame.shadows, 0, 'and nothing blurred');

  field.state = STATE.PLAY;
  field.offer.length = 0;
  for (const id of offer) field.offer.push(id);
});
