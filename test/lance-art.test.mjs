// The lance, as drawn (PLAN 3.2's fourth primary, game/lance.js).
//
// There is no browser here, so this cannot say what a band of light looks like. What it can say is
// the two things that matter about it, which are the two the sniper's beam has always had to say
// (test/beam-art.test.mjs):
//
//   It is drawn as wide as it hurts. The widest pass of the wind-up's band and of the beam that
//     follows it is exactly twice `beam.halfWidth` - the distance off the axis at which a centre is
//     hurt - so the light never claims a finger's width more or less than the harm.
//   It is painted and not blurred: three strokes and a stamp per line, no gradient, no blur, and
//     nothing baked on the spot (render/glow.js, and test/draw-cost.test.mjs for the whole cache).
//
// plus the ordinary housekeeping: that a fan of lines costs a band each, that an extra line and a
// loaded one are drawn no wider than the aimed one, and that a gun with nothing in its wind-up and
// no light behind it costs the arena nothing at all.
//
// The arena and nothing else is what is measured here, so the interface is subtracted out
// (tools/headless/frame-cost.js): a run that flies a lance also owns whatever marks the build rail
// has grown, and none of that is this file's business.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { makeFrameCost } from '../tools/headless/frame-cost.js';
import { BALANCE } from '../src/game/balance.js';
import { makeEnemy } from '../src/game/kinds.js';
import { fire } from '../src/game/weapons.js';
import { resetIndicators } from '../src/render/indicators.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 31 });
const field = game.world;
const ship = field.player;
const GUN = BALANCE.weapons.lance;
const BEAM = GUN.beam;
const BAND = BEAM.halfWidth * 2;

const frameCost = makeFrameCost(game);

// Pick the lance on the title, the way the number keys do, and get a run going: the title screen
// draws the menu crowd and no ship, and a gun with no ship in the world has no nose to draw a band
// out of.
game.chooseWeapon('lance');
game.pressMouse(640, 360);
game.step();
game.releaseMouse();

/** Nothing but the ship on the glass, and nothing arriving to spoil the count. */
function clearTheSky() {
  field.enemies.length = 0;
  field.bullets.clear();
  field.beams.clear();
  field.lance.beams.clear();
  field.lance.wind = 0;
  field.lance.pull = 0;
  field.particles.clear();
  field.rings.clear();
  field.texts.clear();
  field.shards.clear();
  field.spawnTimer = Infinity;
  ship.invuln = Infinity;
  // The arrows at the window edge belong to whatever the last test planted and they fade out over a
  // second or so, which is a second too long for a frame that is being counted.
  resetIndicators();
}

/** Pull the trigger and leave the gun humming: the frame that is counted is inside the wind-up. */
function windingBand() {
  clearTheSky();
  fire(field);
  assert.ok(field.lance.wind > 0, 'the gun is winding up');
  return frameCost();
}

/**
 * Leave one discharged beam in the pool, half its light left, exactly as game/lance.js would have
 * left it - forwards, from the ship's own middle, and not paid out to anybody.
 */
function beamInAir(what) {
  const beam = field.lance.beams.spawn();
  beam.x = ship.x;
  beam.y = ship.y;
  beam.dirX = 1;
  beam.dirY = 0;
  beam.fore = 900;
  beam.back = 0;
  beam.width = BEAM.halfWidth;
  beam.life = BEAM.light.life * 0.5;
  beam.max = BEAM.light.life;
  beam.rank = what === 'extra' ? 1 : 0;
  beam.charged = what === 'charged';
  return frameCost();
}

/** Plant one body and leave it standing there. */
function plant(x, y) {
  const body = makeEnemy(field, 'drifter', x, y);
  body.speed = 0;
  field.enemies.push(body);
  return body;
}

test('a winding lance draws the band, and the band is as wide as the harm', () => {
  clearTheSky();
  const cold = frameCost();
  const warm = windingBand();

  assert.equal(warm.strokes - cold.strokes, 3,
    'the band is three passes and nothing else: the width of it, a hotter middle, and the axis');
  assert.equal(warm.images - cold.images, 1, 'and one light gathering at the muzzle it leaves from');
  assert.ok(game.strokeWidths().includes(BAND),
    'drawn at exactly twice the distance off the axis at which a centre is hurt');
});

test('the beam is drawn as wide as the wind-up that promised it', () => {
  clearTheSky();
  const cold = frameCost();
  const lit = beamInAir('plain');

  assert.equal(lit.strokes - cold.strokes, 3, 'the same three passes as the band');
  assert.equal(lit.images - cold.images, 1, 'and the same light, left at the ship it came out of');
  assert.ok(game.strokeWidths().includes(BAND), 'and the same width, to the pixel');
});

test('an extra line and a loaded one are drawn no wider than the aimed one', () => {
  // Brightness is not a promise; width is. The split line's extras are painted dimmer and a loaded
  // pull hotter, and neither may claim a line any wider than the one the damage is paid out on
  // (game/lance.js, render/entities.js).
  clearTheSky();
  beamInAir('plain');
  const aimed = Math.max(...game.strokeWidths());

  clearTheSky();
  beamInAir('extra');
  const extra = Math.max(...game.strokeWidths());

  clearTheSky();
  beamInAir('charged');
  const charged = Math.max(...game.strokeWidths());

  assert.equal(extra, aimed, 'an extra line is as wide as the line it came with');
  assert.equal(charged, aimed, 'and a loaded beam is no wider for being hotter');
  assert.equal(aimed, BAND, 'and both are as wide as the harm, like the aimed one');
});

test('a fan of lines is a band each, and one muzzle light', () => {
  clearTheSky();
  const cold = frameCost();
  const lines = BALANCE.upgrades.split.ranks + GUN.pellets;

  clearTheSky();
  field.upgrades.split = BALANCE.upgrades.split.ranks;
  fire(field);
  const fan = frameCost();
  field.upgrades.split = 0;

  assert.equal(field.lance.pull, lines, 'the pull the split line is worth');
  assert.equal(fan.strokes - cold.strokes, 3 * lines,
    'every line the pull is worth is drawn, because an undrawn line is a line nobody was warned of');
  assert.equal(fan.images - cold.images, 1,
    'and the muzzle light is one, however many lines are coming out of it');
});

test('the whole gun is painted, not blurred, and it bakes nothing on the spot', () => {
  const warm = windingBand();
  clearTheSky();
  const lit = beamInAir('plain');

  for (const cost of [warm, lit]) {
    assert.equal(cost.gradients, 0, 'no gradient was built for it');
    assert.equal(cost.shadows, 0, 'and the canvas was never asked to blur anything');
    assert.equal(cost.baked, 0, 'and no glow sprite had to be baked: the ship\'s own light is stamped');
  }
});

test('a body in the way does not stop the band being drawn, before or after', () => {
  // A promise about where a line of light will be is worth nothing if a drifter can stand in front of
  // it, so the band is painted under the crowd; the beam is the record of damage already paid and it
  // is painted over it. What can be proved from in here is that neither of them is skipped because a
  // body happens to be standing on the line.
  const crowd = () => {
    clearTheSky();
    plant(ship.x + 60, ship.y - 100);
    return frameCost();
  };

  const plain = crowd();

  clearTheSky();
  plant(ship.x + 60, ship.y - 100);
  fire(field);
  const band = frameCost();
  assert.equal(band.strokes - plain.strokes, 3, 'the band is drawn with a body in the way');

  clearTheSky();
  plant(ship.x + 60, ship.y - 100);
  const lit = beamInAir('plain');
  assert.equal(lit.strokes - plain.strokes, 3, 'and so is the beam');
});

test('a cold gun with no light behind it costs the arena nothing', () => {
  clearTheSky();
  const first = frameCost();
  clearTheSky();
  const second = frameCost();

  assert.equal(second.strokes, first.strokes, 'no strokes for a gun that is doing nothing');
  assert.equal(second.images, first.images, 'and no stamps either');
});
