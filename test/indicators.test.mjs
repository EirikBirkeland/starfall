// The arrows at the edge of the window (PLAN section 4, milestone 3's off-screen
// indicators).
//
// Two promises, and the file is built around being able to say both without a
// browser. The first is *what gets an arrow*: a body that the window still draws
// never earns one, one that is too far away to matter yet never earns one, and
// everything else earns one arrow per direction rather than one per body - forty
// enemies off to the left are a bright arrow, not forty. The second is *what it
// costs*: two strokes and one light per arrow, no blur and no gradient, the same
// idiom every other light in the game is painted with (render/glow.js).
//
// The pure half calls `collectIndicators` directly with a handful of bodies at
// known arena points; the drawn half boots the game and counts what a frame asks
// the canvas for, the way test/blast-art.test.mjs does.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { makeEnemy } from '../src/game/kinds.js';
import { BALANCE } from '../src/game/balance.js';
import { camera, snapCamera } from '../src/render/camera.js';
import {
  arrowCount, collectIndicators, EDGE_INSET, indicatorSlots, resetIndicators,
} from '../src/render/indicators.js';

const ROOT = path.resolve(import.meta.dirname, '..');
// One device pixel to the CSS pixel, so a canvas point can be compared with the
// window's own size without a scale factor in every assertion.
const game = await bootGame({ root: ROOT, seed: 44, dpr: 1 });
const field = game.world;
const ship = field.player;

// Get a run going: the title screen draws the menu crowd and no ship. The press
// comes from the mouse, because Space would also spend a dash (test/controls).
game.pressMouse(640, 360);
game.step();
game.releaseMouse();
game.step();

/**
 * Nothing in the arena, the ship in the middle of the world and of the window, the
 * director parked. Every position below is measured off `camera`, so the tests do
 * not care how big the harness's window happens to be.
 */
function park() {
  field.enemies.length = 0;
  field.particles.clear();
  field.rings.clear();
  field.texts.clear();
  field.bullets.clear();
  field.shards.clear();
  field.enemyShots.clear();
  field.spawnTimer = Infinity;
  // A shaking frame translates the whole view by a random offset, which would look
  // like an extra arrow to anything diffing one frame against the next.
  field.shake = 0;
  ship.invuln = Infinity;
  ship.x = field.arena.w / 2;
  ship.y = field.arena.h / 2;
  ship.px = ship.x;
  ship.py = ship.y;
  ship.vx = 0;
  ship.vy = 0;
  snapCamera();
  resetIndicators();
}

/** A body of `type` standing at (x, y) and not walking anywhere. */
function aBody(type, x, y) {
  const enemy = makeEnemy(field, type, x, y);
  enemy.speed = 0;
  enemy.px = x;
  enemy.py = y;
  return enemy;
}

/** Ask the collector what a set of bodies is worth, and read back the directions.
 * The slots are scratch: read the numbers you want out of them before collecting
 * again, or the next crowd will have overwritten them.
 */
function sight(bodies) {
  const live = collectIndicators(bodies, ship.x, ship.y, 0);
  return { live, lit: indicatorSlots().filter((slot) => slot.threat > 0) };
}

/** A body of `type` standing `distance` px from the ship, on the compass `deg`. */
function aBodyAt(type, deg, distance) {
  const angle = deg * Math.PI / 180;
  return aBody(type, ship.x + Math.cos(angle) * distance, ship.y + Math.sin(angle) * distance);
}

/** The one direction a set of bodies lit, however faintly. */
function theDirection(seen) {
  assert.equal(seen.lit.length, 1, 'expected exactly one direction lit');
  return seen.lit[0];
}

// Places to put a body, all measured off the live camera box.
const justOffRight = () => aBody('drifter', camera.x + camera.w + 90, ship.y);
const stillVisible = () => aBody('drifter', camera.x + camera.w - 20, ship.y);
const farSideOfTheWorld = () => aBody('drifter', ship.x + 2400, ship.y);

test('a crowd the window can see asks for nothing', () => {
  park();
  const crowd = [];
  for (let i = 0; i < 8; i++) {
    crowd.push(aBody('drifter', camera.x + 100 + i * 120, camera.y + 80 + (i % 3) * 200));
  }
  const seen = sight(crowd);
  assert.equal(seen.live, 0, 'not one arrow for eight bodies you are looking at');
  assert.equal(seen.lit.length, 0);
});

test('a body off the edge earns one arrow, pointing straight at it', () => {
  park();
  const alone = sight([justOffRight()]);
  assert.equal(alone.live, 1);
  assert.equal(alone.lit.length, 1);
  const slot = alone.lit[0];
  assert.ok(slot.dirX > 0.99, 'it points out to the right, not off it: ' + slot.dirX.toFixed(3));
  assert.ok(Math.abs(slot.dirY) < 0.05);
  // Close in, it is worth exactly what the wave director says a drifter is worth.
  assert.equal(slot.threat, BALANCE.kinds.drifter.cost);
});

test('a body the window still draws gets no arrow at all', () => {
  // The same test the renderer uses to decide whether to draw a body at all: an
  // arrow is for what you cannot see, and nothing else.
  park();
  assert.equal(sight([stillVisible()]).live, 0);
  assert.ok(sight([justOffRight()]).live === 1, 'and one step further out it is');
});

test('something on the far side of the world is not a threat yet', () => {
  park();
  assert.equal(sight([farSideOfTheWorld()]).live, 0, 'nothing at all that far out');

  // ...and the same body gets louder the whole way in, which is the whole point of
  // the fade: an arrow brightening is a wave arriving.
  const distances = [800, 1000, 1300, 1600];
  // Read the numbers straight out of each collect: the slots are scratch and the
  // next collect writes over the same objects.
  const marks = distances.map((d) => {
    park();
    const seen = sight([aBodyAt('drifter', 15, d)]);
    return { threat: seen.lit.length === 1 ? seen.lit[0].threat : 0, live: seen.live };
  });
  const threats = marks.map((mark) => mark.threat);
  for (let i = 1; i < marks.length; i++) {
    assert.ok(threats[i] < threats[i - 1], 'worth less at ' + distances[i] + ' px: ' + threats.join(' '));
  }
  const cost = BALANCE.kinds.drifter.cost;
  assert.ok(threats[0] > cost * 0.9, 'just off the edge it is worth about all of itself: ' + threats[0]);
  // And the floor in the middle of it all is doing something: the nearest of these
  // is worth an arrow, the furthest is a body on the other side of the world and is
  // not. Between these two distances is where an arrow stops being drawn.
  assert.equal(marks[0].live, 1, 'the closest of them earns an arrow');
  assert.equal(marks[3].live, 0, 'the furthest of them does not: ' + threats[3].toFixed(2) + ' points is nothing');
});

test('a crowd in one direction is one arrow, worth all of them', () => {
  // Two bodies on the same ring, a few degrees apart: one direction, and worth
  // exactly twice what either of them is worth on its own.
  park();
  const lone = theDirection(sight([aBodyAt('drifter', 15, 780)])).threat;
  const pair = sight([aBodyAt('drifter', 12, 780), aBodyAt('drifter', 18, 780)]);
  assert.equal(pair.live, 1, 'two bodies that way are still one arrow');
  assert.ok(Math.abs(theDirection(pair).threat - lone * 2) < 1e-9,
    'and it is worth both their weights');
});

test('opposite sides each get their own, and point their own way', () => {
  park();
  const both = sight([
    aBody('drifter', ship.x + 760, ship.y + 190),
    aBody('drifter', ship.x - 760, ship.y + 190),
  ]);
  assert.equal(both.live, 2);
  assert.equal(both.lit.length, 2);
  const rights = both.lit.filter((slot) => slot.dirX > 0);
  const lefts = both.lit.filter((slot) => slot.dirX < 0);
  assert.equal(rights.length, 1, 'one that way');
  assert.equal(lefts.length, 1, 'and one the other');
  assert.ok(rights[0].dirX > 0.9 && lefts[0].dirX < -0.9, 'they are not the same arrow');
});

test('what a body is worth is what the director says it is worth', () => {
  // A tank is four drifters' worth of dying, so it is four drifters' worth of
  // arrow. Same place, same distance, only the kind differs.
  park();
  const where = camera.x + camera.w + 90;
  const drifter = sight([aBody('drifter', where, ship.y)]).lit[0].threat;
  park();
  const tank = sight([aBody('tank', where, ship.y)]).lit[0].threat;
  assert.equal(tank / drifter, BALANCE.kinds.tank.cost / BALANCE.kinds.drifter.cost);
});

/** What one frame cost to draw, and every place it moved the canvas to. */
function frame() {
  const before = game.drawCalls();
  game.step();
  return {
    cost: {
      fills: game.drawCalls().fills - before.fills,
      strokes: game.drawCalls().strokes - before.strokes,
      images: game.drawCalls().images - before.images,
      texts: game.drawCalls().texts - before.texts,
      gradients: game.drawCalls().gradients - before.gradients,
      shadows: game.drawCalls().shadows - before.shadows,
    },
    moves: game.translates(),
    arrows: arrowCount(),
  };
}

/** What the crowd in `setup` added to a frame, against the same frame empty. */
function difference(setup) {
  park();
  const empty = frame();
  park();
  setup(field.enemies);
  const full = frame();

  const left = empty.moves.map((m) => m.x + ',' + m.y);
  const added = [];
  for (const move of full.moves) {
    const key = move.x + ',' + move.y;
    const at = left.indexOf(key);
    if (at < 0) added.push(move);
    else left.splice(at, 1);
  }
  return {
    strokes: full.cost.strokes - empty.cost.strokes,
    images: full.cost.images - empty.cost.images,
    fills: full.cost.fills - empty.cost.fills,
    gradients: full.cost.gradients,
    shadows: full.cost.shadows,
    added,
    arrows: full.arrows,
  };
}

test('an arrow costs two strokes and one light, and never a blur', () => {
  const seen = difference((enemies) => { enemies.push(justOffRight()); });
  assert.equal(seen.arrows, 1);
  assert.equal(seen.strokes, 2, 'a wide soft pass and a thin bright one, the house idiom');
  assert.equal(seen.images, 1, 'and one glow behind it');
  assert.equal(seen.fills, 0);
  assert.equal(seen.gradients, 0, 'nothing baked this frame');
  assert.equal(seen.shadows, 0, 'and the canvas was never asked to blur it');
});

test('the arrow is pinned to the glass, not painted where the enemy stands', () => {
  // The body itself is culled - that is what makes it worth an arrow - so the only
  // place the frame moves the canvas that it did not move to before is the rim
  // point, out along the line to it and inset from the edge of the window. `at` is
  // where that move lands once the transforms around it are counted, which is the
  // whole difference between an arrow on the glass and a blob in the arena.
  const seen = difference((enemies) => { enemies.push(justOffRight()); });
  assert.equal(seen.added.length, 1, 'one place, the arrow: ' + JSON.stringify(seen.added));
  const at = seen.added[0].at;
  assert.ok(Math.abs(at.x - (camera.w - EDGE_INSET)) < 2,
    'pinned to the right edge, ' + at.x.toFixed(0) + ' of ' + camera.w);
  assert.ok(Math.abs(at.y - camera.h / 2) < 2, 'and level with the ship: ' + at.y.toFixed(0));
});

test('a body overhead points up, at the top of the glass', () => {  const seen = difference((enemies) => {
    enemies.push(aBody('drifter', ship.x, camera.y - 90));
  });
  assert.equal(seen.arrows, 1);
  const at = seen.added[0].at;
  assert.ok(Math.abs(at.x - camera.w / 2) < 2, 'above the ship: ' + at.x.toFixed(0));
  assert.ok(Math.abs(at.y - EDGE_INSET) < 2, 'pinned to the top edge, at ' + at.y.toFixed(0));
});

/** The move that landed on the right-hand rim, wherever else the frame went. */
function arrowOnTheRim() {
  const want = { x: camera.w - EDGE_INSET, y: camera.h / 2 };
  let best = null;
  let bestGap = Infinity;
  for (const move of game.translates()) {
    const gap = Math.hypot(move.at.x - want.x, move.at.y - want.y);
    if (gap < bestGap) { bestGap = gap; best = move.at; }
  }
  assert.ok(bestGap < 2, 'nothing was drawn on the right-hand rim');
  return best;
}

test('an arrow belongs to the glass, so a shaking frame cannot slide it off its edge', () => {
  // The screen shake moves the arena and not the interface (PLAN section 4's whole
  // reason for a trauma value that stops short of the HUD). An arrow that slid about
  // with the shake would stop being a mark on the edge of the screen and become
  // another thing in the arena, which is the thing it is warning you is over there.
  park();
  field.enemies.push(justOffRight());
  frame();
  const calm = arrowOnTheRim();

  park();
  field.shake = 14;
  field.enemies.push(justOffRight());
  frame();
  const shaken = arrowOnTheRim();
  assert.equal(shaken.x, calm.x, 'the rim did not move');
  assert.equal(shaken.y, calm.y);
});

test('a ship cornered in the world still pins its arrows to the edge', () => {
  // The camera cannot show more world than there is, so against a corner of the
  // arena the ship sits nearer the glass than an arrow wants to be drawn. The ray is
  // cast from the ship pulled inside that inset, so the arrow still lands on the
  // edge beside it instead of landing on top of it.
  park();
  ship.x = 10; ship.y = 10; ship.px = 10; ship.py = 10;
  snapCamera();
  field.enemies.push(aBody('drifter', -300, -300));
  const seen = frame();
  let gap = Infinity;
  for (const move of seen.moves) {
    gap = Math.min(gap, Math.hypot(move.at.x - EDGE_INSET, move.at.y - EDGE_INSET));
  }
  assert.equal(seen.arrows, 1);
  assert.ok(gap < 2, 'the arrow is on the corner of the inset, ' + gap.toFixed(1) + ' px from it');
});

test('nothing is drawn for a body the window shows, or for one on the far side', () => {
  assert.equal(difference((enemies) => { enemies.push(stillVisible()); }).arrows, 0);
  assert.equal(difference((enemies) => { enemies.push(farSideOfTheWorld()); }).arrows, 0);
  const quiet = difference(() => {});
  assert.equal(quiet.strokes, 0);
  assert.equal(quiet.images, 0);
});

test('an arrow fades in and fades out instead of blinking', () => {
  // It is a warning, not a scoreboard: it has to arrive fast enough to be worth
  // anything and leave slowly enough that a body crossing the cull line does not
  // make the edge of the screen strobe.
  park();
  const enemy = justOffRight();
  field.enemies.push(enemy);
  frame();
  assert.equal(arrowCount(), 1, 'the first frame already shows it');

  field.enemies.length = 0;
  frame();
  assert.equal(arrowCount(), 1, 'and it is still there a frame after the body went');
  for (let i = 0; i < 20; i++) frame();
  assert.equal(arrowCount(), 0, 'but it cannot outlast a fifth of a second of nothing');
});

test('a new run starts with an edge that has never pointed anywhere', () => {
  park();
  field.enemies.push(justOffRight());
  frame();
  assert.equal(arrowCount(), 1);
  resetIndicators();
  park();
  frame();
  assert.equal(arrowCount(), 0, 'nothing left fading out over the new run');
});

// Last, because it takes the game off the run every test above is playing on.
test('the edge only speaks while a run is being played', async () => {
  await game.resetToTitle(7);
  park();
  const calm = frame();
  park();
  field.enemies.push(justOffRight());
  const planted = frame();
  assert.equal(planted.cost.strokes - calm.cost.strokes, 0,
    'the title screen has a crowd of its own and needs no warnings');
  assert.equal(planted.cost.images - calm.cost.images, 0);
  assert.equal(planted.arrows, 0);
});
