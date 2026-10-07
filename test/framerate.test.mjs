// The other end of the fixed step: a booted game whose frames are sliced badly.
// The run must get the same amount of simulation whatever the display does, and
// every frame must be painted somewhere between the two steps it straddles.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 23 });

function launch() {
  // The mouse launches the run. Space would too, but it is the dash key as well
  // and this file is not about the dash - see test/controls.test.mjs.
  game.pressMouse(640, 240);
  game.step();
}

/** Give the tests below a ship that is alive, in the open, and heading right. */
function ensureFlying() {
  if (game.stats().state !== game.STATE.PLAY) {
    for (let i = 0; i < 30; i++) game.step();        // wait out the restart guard
    launch();
  }
  const ship = game.world.player;
  ship.invuln = Infinity;          // these tests are about frames, not about dying
  ship.x = 200;                    // with room to fly right
  ship.y = game.world.arena.h / 2;
  ship.px = ship.x;
  ship.py = ship.y;
  game.moveMouse(900, 300);
  game.pressMouse(900, 300);
  game.key('KeyD', true);
}

/**
 * Where the last frame drew the ship, read off the canvas calls. The renderer
 * paints the ship by translating to it, and the harness keeps the translates of
 * the frame just drawn, so this asks: is the interpolated position among them?
 */
function shipAsDrawn() {
  const ship = game.player;
  const alpha = game.stats().alpha;
  const want = {
    x: ship.px + (ship.x - ship.px) * alpha,
    y: ship.py + (ship.y - ship.py) * alpha,
  };
  const found = game.translates().some((t) => {
    return Math.abs(t.x - want.x) < 1e-9 && Math.abs(t.y - want.y) < 1e-9;
  });
  const travelling = ship.x !== ship.px || ship.y !== ship.py;
  return { found, want, ship, alpha, travelling };
}

function describe(seen) {
  return 'wanted ' + seen.want.x + ',' + seen.want.y + ' between '
    + seen.ship.px + ',' + seen.ship.py + ' and ' + seen.ship.x + ',' + seen.ship.y
    + ' at alpha ' + seen.alpha;
}

test('a run gets the same simulation for the same seconds, at any frame rate', () => {
  launch();
  game.moveMouse(900, 300);
  game.pressMouse(900, 300);
  game.key('KeyD', true);

  const before = game.stats().steps;
  for (let i = 0; i < 120; i++) game.step(1000 / 60);        // two seconds of 60 fps
  const atSixty = game.stats().steps - before;

  const halfway = game.stats().steps;
  for (let i = 0; i < 480; i++) game.step(1000 / 240);       // two seconds of 240 fps
  const atTwoForty = game.stats().steps - halfway;

  const expected = Math.round(2 / BALANCE.sim.step);
  assert.ok(Math.abs(atSixty - expected) <= 2, '60 fps gave ' + atSixty + ' steps for two seconds');
  assert.ok(Math.abs(atTwoForty - expected) <= 2, '240 fps gave ' + atTwoForty + ' steps for two seconds');
  assert.equal(game.stats().state, game.STATE.PLAY, 'the ship was flying the whole time');
});

test('a stutter is caught up in steps, and only as far as the clamp allows', () => {
  const before = game.stats().steps;
  game.step(5000);                          // the tab was away
  const caught = game.stats().steps - before;

  assert.ok(caught > 0, 'the run went on');
  assert.ok(caught <= Math.ceil(BALANCE.sim.maxFrameDt / BALANCE.sim.step),
    caught + ' steps is more than one frame is allowed to catch up');
});

test('every frame paints the ship between the last step and the next', () => {
  ensureFlying();
  let between = 0;

  for (let i = 0; i < 200; i++) {
    game.step(4);                            // a display quicker than the simulation
    const seen = shipAsDrawn();
    assert.ok(seen.found, 'the ship was not drawn where the interpolation puts it: ' + describe(seen));

    const low = Math.min(seen.ship.px, seen.ship.x);
    const high = Math.max(seen.ship.px, seen.ship.x);
    if (seen.travelling && seen.want.x > low && seen.want.x < high) between++;
  }

  assert.ok(between > 5, 'expected frames drawn strictly between two steps, saw ' + between);
});

test('a juddering frame rate keeps the ship on the line between two steps', () => {
  ensureFlying();
  let checked = 0;

  for (let i = 0; i < 120; i++) {
    game.step(i % 3 === 0 ? 33 : 6);        // a stutter, then a couple of quick frames
    const seen = shipAsDrawn();
    assert.ok(seen.found, 'the ship slipped off the interpolation line: ' + describe(seen));

    // Which is also the promise that nothing is painted where the ship never was:
    // a mix of the two positions cannot leave the segment between them.
    const low = Math.min(seen.ship.px, seen.ship.x);
    const high = Math.max(seen.ship.px, seen.ship.x);
    assert.ok(seen.want.x >= low && seen.want.x <= high, describe(seen));
    checked++;
  }

  assert.ok(checked > 100, 'every frame was checked, judder or not');
});

test('a frame that runs no step still paints the ship', () => {
  ensureFlying();
  let idle = 0;
  let steps = game.stats().steps;

  for (let i = 0; i < 300; i++) {
    game.step(3);                            // four frames for every simulated step
    const stepped = game.stats().steps !== steps;
    steps = game.stats().steps;

    const seen = shipAsDrawn();
    assert.ok(seen.found, 'every frame paints the ship, step or no step: ' + describe(seen));
    if (!stepped) {
      idle++;
      assert.ok(seen.alpha < 1, 'a frame with no step in it is still inside the step');
    }
  }

  assert.ok(idle > 150, 'at 333 fps most frames run no step at all: saw ' + idle);
  game.stop();
});
