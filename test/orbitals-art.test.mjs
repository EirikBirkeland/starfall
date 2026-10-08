// The orbital ring as drawn (PLAN 3.2's orbitals, milestone 4's line).
//
// There is no browser here, so this cannot say that the drones are cyan diamonds with a
// wake. What it can say is the four things that make the ring readable rather than
// decorative, and they are the same four every other light in the game is held to:
//
//   a run that wears no ring costs exactly what an empty sky costs - the line is not
//     quietly drawing a circle for a ship that has none;
//   every drone costs the same handful of canvas calls, and none of them a blur or a
//     gradient (render/glow.js), so ten of them are ten times a cheap thing and not one
//     expensive one;
//   a drone is painted where the simulation says it stands, at the distance from the ship
//     the bite is measured from - the circle on the glass is the circle in `orbitals.js`,
//     and not the renderer's opinion about it;
//   and the ring is painted over the crowd, which is what keeps the ship's own reach from
//     being hidden by the bodies it is grinding.
//
// Same trick as test/elite-art.test.mjs: count what a frame asks the canvas for, and look
// at where the points landed.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { makeEnemy } from '../src/game/kinds.js';
import { lerp } from '../src/core/math.js';

const ROOT = path.resolve(import.meta.dirname, '..');
// One device pixel to the CSS pixel, so a stamp's place can be compared with the numbers
// in render/entities.js without a scale factor in the way.
const game = await bootGame({ root: ROOT, seed: 46, dpr: 1 });
const field = game.world;
const ship = field.player;
const RING = BALANCE.upgrades.orbitals;
// How far a drone's own silhouette reaches past the middle it is drawn around. Enough
// slack on every geometry test below to cover a drawn thing and no more than that.
const DRAWN = 14;

// Get a run going first: the title screen draws the menu crowd and no ship. The press
// comes from the mouse, because Space would also spend a dash (test/controls.test.mjs).
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

/**
 * Wear `rank` ranks, let the ring appear, and draw one frame of it. The ranks are written
 * straight onto the world because this file is about the drawing; the line itself is
 * tested in test/orbitals.test.mjs.
 */
function frameWearing(rank) {
  clearTheSky();
  field.upgrades.orbitals = rank;
  game.step();                      // the ring is sized on the step, not on the card
  const cost = frameCost();
  return { cost: cost, drones: field.orbit.drones.slice(0) };
}

/** Where the frame painted a point, in window pixels. */
function paintedAt(entity) {
  const alpha = game.stats().alpha;
  return game.screenOf(lerp(entity.px, entity.x, alpha), lerp(entity.py, entity.y, alpha));
}

test('a ship wearing no ring costs an empty sky', () => {
  clearTheSky();
  const empty = frameCost();
  field.upgrades.orbitals = 0;
  game.step();
  const bare = frameCost();

  assert.equal(total(bare), total(empty), 'nothing was painted for a ring of none');
});

test('every drone costs the same handful of calls, and none of them a blur', () => {
  // Two, then four, then six: the differences are both "two more drones", and they have to
  // come out the same number, because nothing about a drone gets dearer as the ring fills
  // up. The first pair also pays for the track, which is one stroke and not one per drone.
  const none = frameWearing(0);
  const two = frameWearing(1);
  const four = frameWearing(2);
  const six = frameWearing(3);

  const perDrone = (total(four.cost) - total(two.cost)) / RING.step;
  assert.ok(perDrone > 0, 'the ring is drawn at all');
  assert.equal(perDrone, (total(six.cost) - total(four.cost)) / RING.step,
    'a drone costs ' + perDrone + ' calls, whatever the ring is already holding');
  assert.equal(total(two.cost) - total(none.cost), perDrone * RING.step + 1,
    'and the first pair adds one stroke more than its own cost: the track');

  const ten = frameWearing(RING.ranks);
  assert.equal(ten.cost.shadows, none.cost.shadows, 'and none of it is a blur');
  assert.equal(ten.cost.gradients, none.cost.gradients, 'or a gradient built this frame');
});

test('a drone is painted where the simulation says it stands', () => {
  const worn = frameWearing(RING.ranks);
  const points = game.points();

  for (const drone of worn.drones) {
    const spot = paintedAt(drone);
    let nearest = Infinity;
    for (const point of points) {
      nearest = Math.min(nearest, Math.hypot(point.x - spot.x, point.y - spot.y));
    }
    assert.ok(nearest < DRAWN,
      'a drone was drawn at ' + nearest.toFixed(1) + ' px from where it actually is');
  }
});

test('the ring is painted at the distance a bite is measured from', () => {
  // What the player is shown is the line a body has to cross: the closest point drawn for
  // any drone sits about one ring radius out from the ship, and nothing of the ring is
  // drawn closer than that - or the picture would promise a reach the simulation does not
  // have (the same promise a bomber's circle makes, game/kinds.js).
  const worn = frameWearing(RING.ranks);
  const points = game.points();
  const here = game.screenOf(ship.x, ship.y);

  for (const drone of worn.drones) {
    const spot = paintedAt(drone);
    let closest = Infinity;
    for (const point of points) {
      // Only the points that belong to this drone: everything the frame drew far away from
      // the ship's own middle is the ship, the HUD, or somebody else.
      const fromDrone = Math.hypot(point.x - spot.x, point.y - spot.y);
      if (fromDrone > DRAWN) continue;
      closest = Math.min(closest, Math.hypot(point.x - here.x, point.y - here.y));
    }
    assert.ok(Math.abs(closest - RING.radius) < DRAWN,
      'a drone was drawn ' + closest.toFixed(1) + ' px out, the ring stands at ' + RING.radius);
  }
});

test('a drone is still painted with a body standing on it', () => {
  // The ring's whole job is to be the thing between the ship and the crowd, so a drone with
  // a body on top of it is not quietly dropped from the frame.
  clearTheSky();
  field.upgrades.orbitals = RING.ranks;
  game.step();

  const body = makeEnemy(field, 'tank', field.orbit.drones[0].x, field.orbit.drones[0].y, { hp: 1e9 });
  body.speed = 0;
  field.enemies.push(body);
  game.step();

  const points = game.points();
  const drones = field.orbit.drones;
  assert.equal(drones.length, RING.ranks * RING.step, 'the ring is full');
  for (const drone of field.orbit.drones) {
    const spot = paintedAt(drone);
    let nearest = Infinity;
    for (const point of points) {
      nearest = Math.min(nearest, Math.hypot(point.x - spot.x, point.y - spot.y));
    }
    assert.ok(nearest < DRAWN, 'every drone was drawn, the one with a tank on it included');
  }
});

test('the ring is painted after the crowd, so nothing can bury it', () => {
  // PLAN section 4: the player must always be able to see their own ship and its reach. The
  // one thing that decides whether a five-pixel drone survives a tank standing on it is the
  // order the frame is painted in, so it is written down where it can be checked.
  const frame = fs.readFileSync(path.join(ROOT, 'src/render/renderer.js'), 'utf8');
  const crowd = frame.indexOf('drawEnemies(ctx, world.enemies');
  const ring = frame.indexOf('drawOrbitals(ctx');
  assert.ok(crowd > 0, 'the frame paints the crowd');
  assert.ok(ring > crowd, 'and paints the ring over it');
});
