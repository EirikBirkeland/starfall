// Hit-stop seen from the frame loop (src/main.js). test/hitstop.test.mjs proves
// the world holds still; this file is about the things only the frame loop can
// get wrong: the frozen frame is still painted, a press that lands during a
// freeze is kept for the thaw instead of swallowed, and the screens still
// arrive while the world is holding its breath.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { makeEnemy } from '../src/game/kinds.js';
import { BALANCE } from '../src/game/balance.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 44 });
const ship = game.world.player;

function launch() {
  // The mouse launches the run; Space is the dash key and half these tests are
  // about a press that must survive.
  game.pressMouse(640, 240);
  game.step();
  // The crowd is not what this file is testing: nothing arrives, nothing bites.
  game.world.spawnTimer = Infinity;
  ship.invuln = Infinity;
}

/**
 * Where this frame drew the ship, out of the canvas calls, or null when the frame
 * did not paint it at all. While the world is frozen px equals x, so the answer
 * had better be the ship itself.
 */
function whereTheShipWasPainted() {
  const alpha = game.stats().alpha;
  const want = {
    x: ship.px + (ship.x - ship.px) * alpha,
    y: ship.py + (ship.y - ship.py) * alpha,
  };
  return game.translates().find((t) => t.x === want.x && t.y === want.y) || null;
}

test('a frozen frame is painted like any other frame', () => {
  launch();
  for (let i = 0; i < 10; i++) game.step();
  assert.equal(game.stats().state, game.STATE.PLAY);

  game.world.freeze = 0.05;
  game.step();
  const held = { x: ship.x, y: ship.y, t: game.stats().t };
  game.step();

  assert.ok(game.stats().freeze > 0, 'these frames landed inside the freeze');
  assert.equal(game.stats().t, held.t, 'and the run clock did not move');
  assert.equal(ship.x, held.x, 'the ship held exactly still');
  assert.equal(ship.y, held.y);
  assert.ok(whereTheShipWasPainted(), 'and it is still drawn');
});

test('a dash pressed during a freeze waits for the thaw', () => {
  game.world.freeze = BALANCE.playerHit.hitStop;      // the longest freeze in the game
  game.key('Space', true);
  game.key('Space', false);

  let frames = 0;
  while (game.stats().freeze > 0) {
    assert.ok(frames < 40, 'the freeze never ended');
    frames++;
    game.step();
    if (game.stats().freeze > 0) {
      // A frame that was frozen all the way through. The press is still waiting,
      // which is the whole point: the ship is trapped and the player is mashing.
      assert.equal(ship.dashLeft, 0, 'no dash while the world was frozen');
      assert.equal(ship.dashCd, 0, 'and none spent either');
    }
  }

  assert.ok(frames > 1, 'a 90 ms freeze is more than one frame at 60 Hz: it was ' + frames);
  game.step();
  assert.ok(ship.dashCd > 0, 'the press was answered as soon as the world woke up');
  assert.ok(ship.dashLeft > 0, 'and the dash is underway');
});

test('dying stops the world, and the summary arrives anyway', () => {
  ship.hull = 1;
  ship.invuln = 0;
  ship.dashLeft = 0;                        // a dash is its own kind of grace; this test wants a hit
  ship.fireTimer = 5;                        // no shot, or it would kill the planted enemy first
  game.enemies.push(makeEnemy(game.world, 'drifter', ship.x, ship.y, {
    hp: 1, speed: 0, drop: 0, score: 0,
  }));
  game.step();

  assert.equal(game.stats().state, game.STATE.OVER, 'the ship is gone');
  assert.ok(game.stats().freeze > 0, 'and the world stopped with it');
  assert.equal(game.screen.overHidden, false, 'the summary appeared through the freeze');

  const spray = game.world.particles;
  assert.ok(spray.count > 0, 'the death sprayed sparks');
  const spark = spray.items[0];
  const frozen = { x: spark.x, y: spark.y, life: spark.life };
  game.step();
  game.step();
  assert.equal(spark.x, frozen.x, 'and the blast hangs there, motionless');
  assert.equal(spark.y, frozen.y);
  assert.equal(spark.life, frozen.life, 'not even fading');

  for (let i = 0; i < 40; i++) game.step();   // outlive the freeze and the restart guard
  assert.equal(game.stats().freeze, 0, 'the freeze spent itself');
  game.key('Space', false);
  game.key('Space', true);
  assert.equal(game.stats().state, game.STATE.PLAY, 'and a fresh run is ready as normal');
  assert.equal(game.stats().freeze, 0, 'unfrozen from the first frame');
  game.stop();
});
