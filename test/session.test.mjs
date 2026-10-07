// One browser session, checked in the order it happens: the title screen, a
// run, a window resize, death, restart, and losing focus.
//
// The modules hold the world, so a process boots exactly one game and every
// test below continues the same session. Anything needing a second, clean boot
// lives in its own file (node --test runs each file in its own process).

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 3 });

function launch() {
  game.pressMouse(640, 240);
  game.key('Space', true);
  game.step();
}

/** Park a lethal enemy on the ship and run one frame. */
function killTheShip(score) {
  const ship = game.world.player;
  ship.hull = 1;
  ship.invuln = 0;
  ship.fireTimer = 5;          // no shot, or it would kill the planted enemy first
  game.world.score = score || 0;
  game.enemies.push({
    type: 'chaser', x: ship.x, y: ship.y, r: 15, hp: 1, maxhp: 1,
    speed: 0, ix: 0, iy: 0, rot: 0, seed: 0, flash: 0, drop: 0, score: 0,
    ambient: false, vx: 0, vy: 0,
  });
  game.step();
}

test('the title screen breathes until you launch', () => {
  for (let i = 0; i < 30; i++) game.step();

  assert.equal(game.stats().state, game.STATE.START);
  assert.equal(game.screen.startHidden, false);
  assert.equal(game.stats().score, 0);
  assert.equal(game.enemies.length, 0, 'nothing hunts you on the title screen');
  assert.ok(game.world.ambient.length >= 7, 'the menu crowd drifts behind the logo');
  assert.ok(game.drawCalls().fills > 100, 'the starfield is painted');

  launch();
  assert.equal(game.stats().state, game.STATE.PLAY);
  assert.equal(game.screen.startHidden, true);
  assert.equal(game.stats().hull, 3);
});

test('a mid-run window resize keeps the ship inside the arena', () => {
  for (let i = 0; i < 120; i++) {
    game.moveMouse(700, 300);
    game.step();
  }
  assert.equal(game.stats().state, game.STATE.PLAY, 'the ship was still flying before the resize');

  game.setViewport(400, 800);
  game.key('KeyD', true);
  for (let i = 0; i < 300; i++) {
    game.moveMouse(100, 700);
    game.step();
  }

  const ship = game.player;
  assert.equal(game.world.arena.w, 400, 'the simulation heard about the new window');
  assert.equal(game.world.arena.h, 800);
  assert.ok(ship.x >= 0 && ship.x <= 400 && ship.y >= 0 && ship.y <= 800,
    'the ship escaped the arena: ' + ship.x + ',' + ship.y);
  assert.ok(game.stats().t > 5, 'the run kept going through the resize');
});

test('death is not instantly restartable', () => {
  killTheShip(1234);

  assert.equal(game.stats().state, game.STATE.OVER);
  assert.equal(game.screen.overHidden, false);
  assert.equal(game.screen.finalScore, '1,234');
  assert.equal(game.screen.newBestShown, true, 'a first score is always a new best');
  assert.equal(game.storage['starfall.best'], '1234');

  game.key('Space', false);
  game.key('Space', true);
  assert.equal(game.stats().state, game.STATE.OVER, 'the key that killed you must not restart');

  for (let i = 0; i < 30; i++) game.step();       // half a second
  game.key('Space', false);
  game.key('Space', true);
  assert.equal(game.stats().state, game.STATE.PLAY);
  assert.equal(game.screen.overHidden, true);
  assert.equal(game.stats().hull, 3, 'a new run starts whole');
  assert.equal(game.stats().score, 0);
});

test('losing focus drops the controls, and a long gap is not simulated', () => {
  game.key('KeyD', true);
  game.step();
  const before = game.stats().t;
  const pushing = game.player.vx;
  assert.ok(pushing > 0, 'the ship was flying right');

  game.fire('blur', {});
  game.step(5000);                                 // five seconds in another tab
  assert.ok(game.stats().t - before < 0.1, 'a background tab must not fast-forward the run');

  for (let i = 0; i < 30; i++) game.step();
  assert.ok(game.player.vx < pushing * 0.5, 'the ship coasts to a stop once focus is gone');
});

test('the mute key survives a machine with no audio at all', () => {
  game.key('KeyM', true);
  game.key('KeyM', false);
  game.key('KeyM', true);
  game.key('KeyM', false);
  const before = game.stats().t;
  game.step();
  assert.ok(game.stats().t > before, 'the game went on playing');
  game.stop();
});
