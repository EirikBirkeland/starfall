// The ships' silhouettes (render/shapes.js, one per row in BALANCE.ships). What a ship is
// drawn as is the half of PLAN 3.7 you cannot get from a number, so it is measured here the
// way the rest of the frame's promises are: by asking what a shape actually asked the canvas
// for, and whether the picture it makes is the one the simulation is entitled to make.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { FRAME_MS } from '../tools/headless/bot.js';
import { BALANCE } from '../src/game/balance.js';
import { SHIPS } from '../src/game/ships.js';
import { SHIP_SHAPES, shipShape } from '../src/render/shapes.js';

const ROOT = path.resolve(import.meta.dirname, '..');
// One device pixel to a CSS pixel, so a painted point can be compared with where the camera
// says the thing that painted it stands - the same trick test/orbitals-art.test.mjs plays.
const game = await bootGame({ root: ROOT, seed: 5, dpr: 1 });

/** The radius every ship is drawn at, whatever ship it is (BALANCE.player.drawRadius). */
const R = BALANCE.player.drawRadius;
const TAU = Math.PI * 2;

/**
 * A context that does nothing but remember where the paths went, for measuring a silhouette
 * on its own - the same trick test/card-fit.test.mjs plays on the real canvas, with less of
 * the canvas.
 */
function recordingContext() {
  const points = [];
  return {
    points: points,
    beginPath() { points.length = 0; },
    moveTo(x, y) { points.push({ x: x, y: y }); },
    lineTo(x, y) { points.push({ x: x, y: y }); },
    closePath() {},
  };
}

/** One silhouette, drawn at the ship's own radius with nothing in the way. */
function drawn(name) {
  const ctx = recordingContext();
  shipShape(name)(ctx, R);
  const points = ctx.points;
  return {
    points: points,
    forward: points.reduce((most, p) => Math.max(most, p.x), 0),
    back: points.reduce((least, p) => Math.min(least, p.x), 0),
    side: points.reduce((most, p) => Math.max(most, Math.abs(p.y)), 0),
    reach: points.reduce((most, p) => Math.max(most, Math.hypot(p.x, p.y)), 0),
  };
}

/** The row of the ship this or that is about. */
const rowOf = (ship) => BALANCE.ships[ship.id];

test('every ship is drawn as something, and nothing draws a shape no ship wears', () => {
  const worn = SHIPS.map((ship) => rowOf(ship).shape);
  for (const shape of worn) {
    assert.ok(SHIP_SHAPES[shape], 'nothing is drawn as ' + shape);
  }
  // A shape nobody wears is a shape nobody can ever see, which is a placeholder by another
  // name. Every silhouette in the file belongs to a ship on the rack.
  assert.deepEqual(Object.keys(SHIP_SHAPES).slice().sort(), worn.slice().sort(),
    'the silhouettes and the ships are the same list');
  assert.throws(() => shipShape('saucer'), /no ship is drawn as/);
});

test('every silhouette is drawn around the core it is hiding', () => {
  // The ship's hurtbox is its middle (BALANCE.player.hitRadius, the same 6 px whoever you
  // fly), so a shape that left the middle out would be a ship that gets hurt where it is not
  // drawn. Going exactly once around the origin says it does not.
  for (const ship of SHIPS) {
    const points = drawn(rowOf(ship).shape).points;
    let turning = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      let turn = Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x);
      while (turn > Math.PI) turn -= TAU;
      while (turn < -Math.PI) turn += TAU;
      turning += turn;
    }
    assert.equal(Math.abs(Math.round(turning / TAU)), 1,
      ship.id + ' does not go once around its own middle');
  }
});

test('no silhouette runs away from the radius it is drawn at', () => {
  // `drawRadius` is what the walls clamp at, what the dash shoulders the crowd with, and what
  // every ring around the ship is measured from - so a drawing that reached far past it would
  // promise a body the simulation does not have, and slide a nose through a wall. The house
  // allowance is the dart's own: its nose sits 16 px out at a radius of 13.
  const allowance = (R + 3) / R;
  for (const ship of SHIPS) {
    const shape = drawn(rowOf(ship).shape);
    assert.ok(shape.reach <= R * allowance + 0.01,
      ship.id + ' reaches ' + shape.reach.toFixed(1) + ' px out; the allowance is '
        + (R * allowance).toFixed(1));
    assert.ok(shape.reach >= R, ship.id + ' is drawn smaller than the ship it is drawn at');
    assert.ok(shape.forward > 0, ship.id + ' has no nose to point at anything');
  }
});

test('every silhouette is a ship and not a blob: it is flat, pointed, and unlike the others', () => {
  const signatures = [];
  for (const ship of SHIPS) {
    const shape = drawn(rowOf(ship).shape);
    const points = shape.points;

    // Left to right symmetric: the ship turns to face where the cursor is, and a body that
    // was not the same on both sides of its own axis would lean over to one side of its own
    // wake. Within a hundredth of a pixel, because these are numbers and not brushstrokes.
    for (const p of points) {
      const twin = points.some((q) => Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y + p.y) < 0.01);
      assert.ok(twin, ship.id + ' has a point at ' + p.x.toFixed(1) + ',' + p.y.toFixed(1)
        + ' with nothing mirrored at its back');
    }
    // More than a triangle, or it could be any of a thousand ships.
    assert.ok(points.length > 3, ship.id + ' is a triangle');
    signatures.push([rowOf(ship).shape, shape.forward.toFixed(1), shape.side.toFixed(1), points.length].join('/'));
  }

  assert.equal(new Set(signatures).size, SHIPS.length,
    'two ships are drawn identically: ' + signatures.join('  '));
});

test('the five ships read as five bodies, measured the way they are seen', () => {
  // The reach of a silhouette, front to back and side to side, at the one radius they all
  // share: what makes the Bulwark look heavy and the Needle look quick is these two numbers
  // and not a bigger hitbox.
  const seen = SHIPS.map((ship) => {
    const shape = drawn(rowOf(ship).shape);
    return {
      ship: ship.id,
      length: shape.forward - shape.back,
      width: shape.side * 2,
    };
  });

  const pairs = new Set(seen.map((one) => one.length.toFixed(1) + '/' + one.width.toFixed(1)));
  assert.equal(pairs.size, SHIPS.length, 'silhouettes share a footprint: ' + JSON.stringify(seen));

  // How stretched each one is, which is the two ships' whole argument in one number: the
  // Needle is the most elongated thing in the game and the Bulwark the least, and the ship
  // the game starts on is neither of those extremes.
  const stretched = (id) => {
    const one = seen.find((ship) => ship.ship === id);
    return one.length / one.width;
  };
  const all = seen.map((one) => stretched(one.ship));
  assert.equal(stretched('needle'), Math.max(...all),
    'the Needle is the longest thing for its width: ' + JSON.stringify(seen));
  assert.equal(stretched('bulwark'), Math.min(...all),
    'and the Bulwark the shortest thing for its width');
  assert.ok(stretched('wisp') > stretched('bulwark') && stretched('wisp') < stretched('needle'),
    'and the Wisp sits between them');
});

test('the frame draws the ship you picked, not the one you did not', async () => {
  // The whole point of `shape` on the row: that what the title screen picked is what arrives
  // on the glass. Measured off a real frame, with nothing else in the sky to draw, and with
  // the mouse held above the ship so that all five are pointed the same way - up, which means
  // a ship's own length is the screen's vertical and its own width the horizontal.
  const field = game.world;
  const painted = {};
  for (const ship of SHIPS) {
    await game.resetToTitle(5);
    game.chooseShip(ship.id);
    game.pressMouse(640, 100);
    game.step();
    game.releaseMouse();
    field.enemies.length = 0;
    field.particles.clear();
    field.spawnTimer = Infinity;
    field.player.invuln = Infinity;
    game.step(FRAME_MS);

    const here = game.screenOf(field.player.x, field.player.y);
    const near = game.points().filter((p) => Math.hypot(p.x - here.x, p.y - here.y) < R * 2);
    assert.ok(near.length > 3, ship.id + ' painted nothing where it stands');
    const wide = near.reduce((most, p) => Math.max(most, Math.abs(p.x - here.x)), 0);
    const tall = near.reduce((most, p) => Math.max(most, Math.abs(p.y - here.y)), 0);
    painted[ship.id] = (wide * 2).toFixed(1) + 'x' + tall.toFixed(1);
  }

  assert.equal(new Set(Object.values(painted)).size, SHIPS.length,
    'every ship painted the same: ' + JSON.stringify(painted));
});
