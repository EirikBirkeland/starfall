// The arc as drawn (game/arc.js, render/entities.js): the light a chain leaves behind.
//
// There is no browser here, so this cannot say the bolt reads as lightning. What it can say -
// and it is the same four things every other light in the game is held to, plus the one that
// belongs to a weapon whose entire damage is instantaneous and therefore entirely invisible
// but for this picture - is:
//
//   a run that has not fired costs exactly what an empty sky costs: no strokes, no wobble, no
//     bolt, because a ship that has found nothing has nothing to show;
//   a bolt costs a fixed pair of strokes and neither of them a blur or a gradient, so a chain
//     of four is four times a cheap thing rather than one expensive one - and a bolt off the
//     edge of the window is not drawn at all;
//   **the two ends are the truth.** The first point of a bolt is the muzzle the leap left and
//     the last is the body that lost hull, exactly, and every point of the wobble between them
//     stays inside a narrow band round the straight line: the light may scribble, but it can
//     never claim a reach the damage did not have nor wander on to a body it did not touch.
//     That is the whole honesty of a weapon you cannot otherwise see;
//   and the shape holds for a flicker and then turns over, because a bolt that re-rolled every
//     frame would be a strobe and one that never changed would be a drawing of a wire.
//
// Same trick as test/nova-art.test.mjs: count what a frame asks the canvas for, and look at
// where the points landed (tools/headless/harness.js logs both).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 47, dpr: 1 });
const field = game.world;
const ship = field.player;
const ARC = BALANCE.weapons.arc;

// The renderer's own numbers, read out of the file that draws them: this file is about whether
// the picture keeps its promises, and the size of the wobble is one of them.
const entities = fs.readFileSync(path.join(ROOT, 'src/render/entities.js'), 'utf8');
const JAG = Number(/const BOLT_JAG = ([\d.]+)/.exec(entities)[1]);

// Get a run going first: the title screen draws the menu crowd and no ship, and the press comes
// from the mouse because Space would also spend a dash (test/controls.test.mjs).
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
  field.nova.fronts.clear();
  field.arc.bolts.clear();
  field.spawnTimer = Infinity;
  field.shake = 0;
  field.upgrades.nova = 0;
  field.upgrades.orbitals = 0;
  ship.invuln = Infinity;
}

/** Plant one bolt from (x0, y0) to (x1, y1), mid-flicker and far from the ship's own art. */
function plant(x0, y0, x1, y1, rank) {
  const bolt = field.arc.bolts.spawn();
  bolt.x0 = x0;
  bolt.y0 = y0;
  bolt.x1 = x1;
  bolt.y1 = y1;
  bolt.rank = rank === undefined ? 0 : rank;
  bolt.life = ARC.chain.bolt.life;
  bolt.max = ARC.chain.bolt.life;
  bolt.seed = 0.371;
  return bolt;
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

function total(cost) {
  return cost.fills + cost.strokes + cost.images + cost.texts;
}

/** Draw one frame at a chosen point in the session clock, and hand back what it put down. */
function frameAt(time) {
  field.time = time;
  const cost = frameCost();
  return { cost: cost, points: game.points() };
}

/**
 * The points a frame drew inside a narrow corridor round a bolt's own straight line, in the
 * order they came: the frame draws a good deal of other art and the ship's own hull sits at
 * one end of most bolts, so a bolt is found by where it was drawn rather than trusted to be
 * the only thing in the sky.
 */
function along(points, bolt) {
  const a = game.screenOf(bolt.x0, bolt.y0);
  const b = game.screenOf(bolt.x1, bolt.y1);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const band = JAG + 12;

  const found = [];
  for (const point of points) {
    const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2;
    if (t < -0.05 || t > 1.05) continue;
    const off = Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
    if (off > band) continue;
    found.push({ x: point.x, y: point.y, t: t, off: off });
  }
  return found;
}

test('a sky with no bolts in it costs nothing', () => {
  clearTheSky();
  const empty = frameCost();
  field.arc.bolts.clear();
  const bare = frameCost();

  assert.equal(total(bare), total(empty), 'nothing was painted for a bolt that never landed');
});

test('every bolt costs the same pair of strokes, and neither of them a blur', () => {
  clearTheSky();
  const none = frameCost();
  plant(ship.x + 100, ship.y + 150, ship.x + 260, ship.y - 100);
  const one = frameCost();
  plant(ship.x - 100, ship.y + 150, ship.x - 260, ship.y - 100);
  const two = frameCost();

  const perBolt = total(one) - total(none);
  assert.equal(perBolt, 2, 'a bolt is two strokes, one wide and faint under one thin: ' + perBolt);
  assert.equal(total(two) - total(one), perBolt, 'and the second costs the same as the first');
  assert.equal(one.shadows, none.shadows, 'and none of it is a blur');
  assert.equal(one.gradients, none.gradients, 'or a gradient baked this frame');
});

test('a bolt off the window is not drawn at all', () => {
  // The ship is always leaving the place a bolt was drawn, so off the edge is the normal
  // state of most of them within a tenth of a second.
  clearTheSky();
  const empty = frameCost();
  plant(ship.x + 3000, ship.y, ship.x + 3200, ship.y - 200);
  const spent = frameCost();

  assert.equal(total(spent), total(empty), 'a line nobody can see cost nothing');
});

test('the two ends of a bolt are the muzzle and the body, exactly', () => {
  // The promise the whole weapon rests on: the light names the two places the leap joined.
  // The wobble is the light's own, but it starts on the first of them and stops on the second.
  clearTheSky();
  const bolt = plant(ship.x + 100, ship.y + 150, ship.x + 260, ship.y - 100);
  const drawn = along(frameAt(20.025).points, bolt);
  assert.ok(drawn.length > 4, 'the frame drew a bolt: ' + drawn.length + ' points');

  const wanted = game.screenOf(bolt.x0, bolt.y0);
  const end = game.screenOf(bolt.x1, bolt.y1);
  const first = drawn.filter((point) => Math.abs(point.t) < 0.001);
  const last = drawn.filter((point) => point.t > 0.999);

  assert.equal(first.length, 1, 'it starts on one point');
  assert.equal(last.length, 1, 'and stops on one');
  assert.ok(Math.hypot(first[0].x - wanted.x, first[0].y - wanted.y) < 1e-9,
    'the start is where the leap began');
  assert.ok(Math.hypot(last[0].x - end.x, last[0].y - end.y) < 1e-9,
    'and the end is the body it landed on');
});

test('the wobble stays on the line the damage travelled', () => {
  // A bolt that wandered wide would read as a reach the gun does not have - and on a weapon
  // whose whole damage happens in one step, the scribble is the only reach anybody can see.
  // So: it scribbles, and it scribbles inside a band `BOLT_JAG` wide, and nothing wider.
  clearTheSky();
  const bolt = plant(ship.x + 90, ship.y + 160, ship.x + 280, ship.y - 120);
  const drawn = along(frameAt(20.025).points, bolt);
  const middle = drawn.filter((point) => point.t > 0.05 && point.t < 0.95);

  assert.ok(middle.length > 3, 'the middle of a bolt is drawn in several legs');
  let widest = 0;
  for (const point of middle) widest = Math.max(widest, Math.abs(point.off));
  assert.ok(widest > 2, 'and it is a zig and not a wire: ' + widest.toFixed(2) + ' px off the line');
  assert.ok(widest <= JAG + 1e-9,
    'and never further than ' + JAG + ' px off it: ' + widest.toFixed(2));
});

test('a bolt holds its shape for a flicker and then turns over', () => {
  // The one art decision here that a test can reach: the dice are hashed out of the bolt's own
  // seed and the frame's place in the flicker, so two frames inside one flicker draw the same
  // bolt and a frame past the boundary draws another one. Live lightning, not a strobe.
  clearTheSky();
  const bolt = plant(ship.x + 100, ship.y + 150, ship.x + 260, ship.y - 100);

  const shape = (points) => along(points, bolt).map((point) => point.off.toFixed(3)).join(',');
  const before = shape(frameAt(20.025).points);
  const same = shape(frameAt(20.03).points);
  const after = shape(frameAt(20.2).points);

  assert.ok(before.length > 10, 'a bolt was drawn, twice over');
  assert.equal(before, same, 'two frames inside one flicker drew the same bolt');
  assert.notEqual(before, after, 'and one past it drew a different one');
});

test('a deep bolt is drawn with the same two strokes as a shallow one', () => {
  // Falloff is a thing the renderer does to the alpha and the width, not a thing that makes a
  // leap down the chain dearer to draw - which is what keeps a chain of four costing four
  // strokes and not a blur each. The brightness itself is for an eye to judge.
  clearTheSky();
  const none = frameCost();
  plant(ship.x + 100, ship.y + 150, ship.x + 260, ship.y - 100, ARC.chain.jumps);
  const deep = frameCost();

  assert.equal(total(deep) - total(none), 2, 'the last leap of a chain costs what the first does');
});

test('the bolts go over the crowd and the ship, and under the sparks', () => {
  // A bolt is the story of where the damage went. Behind a drifter it is a story nobody is
  // told, so it is painted over the crowd - and under the sparks, which are the loudest thing
  // in the frame by design (PLAN section 4).
  const frame = fs.readFileSync(path.join(ROOT, 'src/render/renderer.js'), 'utf8');
  const crowd = frame.indexOf('drawEnemies(ctx, world.enemies');
  const player = frame.indexOf('drawPlayer(ctx');
  const bolts = frame.indexOf('drawArcs(ctx');
  const sparks = frame.indexOf('drawSparks(ctx');

  assert.ok(crowd > 0 && player > crowd, 'the frame paints the crowd and then the ship');
  assert.ok(bolts > player, 'the bolts go over both');
  assert.ok(sparks > bolts, 'and the sparks go over the bolts');
});
