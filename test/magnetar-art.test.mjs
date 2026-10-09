// Magnetar (game/magnetar.js, render/entities.js) as it is drawn, and its card as it is dealt.
//
// There is no browser here, so this cannot say the ring round the hull reads as "the bank is nearly
// full". What it can say is the four promises that make the line an honest piece of the picture:
//
//   a run that has not bought the card draws nothing at all - no ring, no light, no hint;
//   the ring round the hull is a meter and not the field's size: it is a track with an arc of fill
//     growing round it, at a radius well inside the crack's reach - the crack's own light is what
//     says how far the field reaches, born at exactly `reach`, the radius the damage was paid out
//     at, and running in from there (the rule that makes this the opposite of a nova front);
//   a bank that is holding more than one crack at once - a magnet pile landing - is that ring whole
//     and breathing, and costs one stroke fewer than the filling one;
//   a crack asks a frame for strokes and sparks and nothing built mid-frame - no gradient, no blur,
//     no sprite of its own, which is the only reason a line that fires about once a second can
//     afford to light up at all;
//   and the card is on the rack: it prints what a rank does, in shots, because a rank is a whole
//     number of shots.
//
// Same instrument as test/afterimage-art.test.mjs and test/nova-art.test.mjs: boot the real game
// through the headless harness, paint real frames through the real painter, and count what the
// frame asked the canvas for (tools/headless/harness.js). Painting the arena and not just the card
// is the point of this file: NOTES has told me twice now that a ring which throws on a ship with a
// half-full bank is exactly what an icon-only art test lets through.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { makeFrameCost } from '../tools/headless/frame-cost.js';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { TAU } from '../src/core/math.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const MAG = BALANCE.upgrades.magnetar;
const game = await bootGame({ root: ROOT, seed: 43, dpr: 1 });
const field = game.world;

// Start a run, then leave the arena empty: this file counts what the ship's own rings cost, and a
// wave arriving mid-measurement would be a different measurement every time. Nothing can hurt the
// ship either, so no frame is cut short by a death.
game.pressMouse(640, 360);
game.step();
game.releaseMouse();
game.step();
field.spawnTimer = Infinity;
field.player.invuln = Infinity;
field.enemies.length = 0;
field.player.dashCd = 0;      // a ready dash is one circle; a cooling one is three

/**
 * Paint one frame and report what it asked the arena for. The interface is painted on every frame
 * and one mark of it belongs to every line the run owns, which is not what this file is measuring,
 * so it is measured apart: tools/headless/frame-cost.js.
 */
const paintFrame = makeFrameCost(game);

/**
 * Put `shards` shards' worth in the bank at `ranks` ranks, then settle for two frames so whatever
 * the drawing bakes on meeting the line is baked before anything is counted. Two frames and not
 * one because the first of them is where the line's sprite is met, and a measurement taken on the
 * step something is first drawn is a measurement of building it.
 */
function bank(ranks, shards) {
  field.upgrades.magnetar = ranks;
  field.magnetar.charge = shards;
  paintFrame();
  return paintFrame();
}

/**
 * Every circle drawn round the ship this frame, grouped by radius, innermost first. The ship's own
 * rings are drawn in the ship's own rotated space, so they come in at its origin - 0,0 - which is
 * also how they are told apart from a nova front or a crack, which are drawn out in the arena at
 * the place the ship was.
 */
function ringsRoundShip(frame) {
  const byRadius = new Map();
  for (const circle of frame.circles) {
    if (circle.x !== 0 || circle.y !== 0) continue;
    byRadius.set(circle.r, (byRadius.get(circle.r) || 0) + 1);
  }
  return [...byRadius.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * The bank's own ring, if this frame has one: the outermost radius round the ship carrying more
 * than one arc, and well inside the reach. One arc is a ready dash ring and that is not this.
 */
function bankRing(frame) {
  const rings = ringsRoundShip(frame).filter(([r, n]) => n >= 2 && r < MAG.reach);
  return rings.length === 0 ? null : rings[rings.length - 1];
}

test('a run that has not bought the card draws no field at all', () => {
  const cold = bank(0, 0);
  assert.equal(bankRing(cold), null, 'no bank, no ring: no radius carries a track and a fill');
  const charged = bank(0, MAG.cost * 3);
  assert.equal(charged.strokes, cold.strokes,
    'and a bank a run cannot spend is not painted either');
});

test('the bank is a meter on the hull, not the field drawn to scale', () => {
  const none = bank(0, 0);
  const half = bank(1, MAG.cost * 0.5);
  const ring = bankRing(half);

  assert.ok(ring !== undefined, 'the bank draws a ring round the hull');
  assert.equal(ring[1], 3, 'a track, a wide faint pass and a thin bright one: ' + ring[1]);
  assert.ok(ring[0] > field.player.drawR, 'and it is outside the ship: ' + ring[0].toFixed(1) + ' px');
  assert.ok(ring[0] < MAG.reach / 2,
    'and it is well inside the reach the crack lights - the light owns the distance, the ring '
    + 'only says what the next crack costs: ' + ring[0].toFixed(1) + ' px of a ' + MAG.reach + ' px field');
  assert.equal(half.strokes - none.strokes, 3,
    'three strokes, and they are the bank\'s own: ' + half.strokes + ' against ' + none.strokes);
});

test('the ring says how full the bank is, as a sweep round', () => {
  const oneFrame = bank(1, 1);
  const threeFrame = bank(1, MAG.cost - 1);
  const one = bankRing(oneFrame);
  const three = bankRing(threeFrame);

  // One shard of four is a quarter of the way round, three of four three quarters of the way, and
  // the price is the same three strokes either way - a meter that costs more the fuller it gets is
  // a meter a busy frame cannot afford. The shortest sweep at that radius is the fill's; the
  // longest is the track it is drawn over, which is the whole circle by definition.
  const sweep = (frame, r) => Math.min(...frame.circles
    .filter((c) => c.r === r && c.from !== undefined)
    .map((c) => c.to - c.from));

  assert.ok(Math.abs(sweep(oneFrame, one[0]) - TAU / 4) < 0.01,
    'one shard of four, a quarter round: ' + sweep(oneFrame, one[0]).toFixed(3));
  assert.ok(Math.abs(sweep(threeFrame, three[0]) - TAU * 0.75) < 0.01,
    'three of four, three quarters round: ' + sweep(threeFrame, three[0]).toFixed(3));
  assert.equal(three[1], one[1], 'and the meter costs the same at both ends: ' + one[1] + ' arcs');
});

test('a bank holding more than one crack is that ring whole, and one stroke cheaper', () => {
  const filling = bankRing(bank(1, MAG.cost - 1));
  const overfull = bankRing(bank(1, MAG.cost * 5));   // what a magnet pile leaves behind

  assert.ok(overfull !== undefined, 'an overfull bank is drawn');
  assert.equal(overfull[1], 2, 'the two passes of a whole circle, with no track left to fill: '
    + overfull[1]);
  // Breathing moves the radius by a couple of px from frame to frame - that is how you can see it
  // is overfull at all. What may not move is where the ring sits between one fill state and the
  // next, or the whole thing would twitch as the shards come in.
  assert.ok(Math.abs(overfull[0] - filling[0]) < 4,
    'and the ring does not jump when it fills: ' + filling[0].toFixed(1) + ' px against '
    + overfull[0].toFixed(1));
});

test('the crack lights the reach it hurts, born at its rim and running in', () => {
  field.enemies.length = 0;
  field.upgrades.magnetar = 1;
  field.magnetar.charge = MAG.cost;      // the last shard in, on the step that lets go
  paintFrame();

  const lit = game.circles().filter((c) => c.r > MAG.reach * 0.5);
  assert.ok(lit.length >= 1, 'a crack paints a ring the size of the field');
  for (const c of lit) {
    // Never out past the reach it hurt at, and never a smaller circle than it either: this is the
    // light of a damage circle, so it is that circle and nothing else (game/nova.js has the rule
    // for a light that travels, which this is not).
    assert.ok(c.r <= MAG.reach, 'and it never runs out past the reach: ' + c.r);
  }
  const born = Math.max(...lit.map((c) => c.r));
  assert.ok(born > MAG.reach - 40,
    'born at the rim, one step into falling: ' + born.toFixed(1) + ' px of a '
    + MAG.reach + ' px field');
});

test('a crack costs strokes and sparks and nothing built mid-frame', () => {
  field.magnetar.charge = MAG.cost;
  const before = game.drawCalls();
  game.step();
  const after = game.drawCalls();
  assert.ok(after.strokes > before.strokes, 'the crack was painted');
  assert.equal(after.gradients - before.gradients, 0, 'nothing built a gradient');
  assert.equal(after.shadows - before.shadows, 0, 'nothing asked the canvas for a blur');
});

test('the magnetar card is on the rack and prints what a rank does', () => {
  const offer = field.offer.slice();
  field.offer.length = 0;
  field.offer.push('magnetar');
  field.state = STATE.LEVEL;
  field.offerTime = field.time;

  paintFrame();                       // the icon's glow is baked on meeting it
  const frame = paintFrame();
  assert.ok(frame.words.indexOf('MAGNETAR') >= 0, 'the card carries its name');
  assert.ok(frame.words.indexOf('+1 shot off the field') >= 0,
    'and the number it is selling, in shots: ' + frame.words.join(' / '));
  assert.equal(frame.gradients, 0, 'and it asks for nothing built mid-frame');
  assert.equal(frame.shadows, 0, 'and nothing blurred');

  field.state = STATE.PLAY;
  field.offer.length = 0;
  for (const id of offer) field.offer.push(id);
});
