// The pause, through the real game: the key that holds a run, the screen that goes up over it, and
// the one key that ends it (PLAN section 4, game/run.js `pauseRun`).
//
// What is proved here is the wiring and the refusals - that a held run really does hold, that the
// panel says the run's own numbers, and that a pause takes no keys off the run underneath it. The
// rules themselves (who may be held, what a give-up banks, what a step does and does not do while the
// world is held) are test/pause-rules.test.mjs, on the scripted world; what the build rack prints is
// test/pause-build.test.mjs, because reading it needs a run that has levelled up.
//
// One boot per file (the game's `boot()` runs once per process), so this is one visit: the title, one
// run held and let go of several times, and then given up.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { makeEnemy } from '../src/game/kinds.js';
import { dustForRun } from '../src/game/stardust.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;

const game = await bootGame({ root: ROOT, seed: 1207, width: 1280, height: 720, storage: {} });
const world = game.world;
const ship = world.player;

/** One press of a key, and the frame that answers it. */
function press(code) {
  game.key(code, true);
  game.key(code, false);
  game.step(FRAME);
}

function frames(howMany) {
  for (let i = 0; i < howMany; i++) game.step(FRAME);
}

/** Is the pause on the glass? */
const up = () => game.screen.pauseHidden === false;

/** What the readout rack says about one thing, or null when it has no row for it. */
function fact(name) {
  const row = game.screen.pauseFacts.find((line) => line.name === name);
  return row === undefined ? null : row.says;
}

/** A run these tests are about the pausing of: nothing arriving, nothing dying. */
function launchACalmRun() {
  press('Space');
  world.spawnTimer = Infinity;
  ship.invuln = Infinity;
  world.enemies.length = 0;
  frames(6);
  assert.equal(game.stats().state, game.STATE.PLAY, 'the run launched');
}

test('with no run flying there is nothing to hold', () => {
  assert.equal(game.stats().state, game.STATE.START);
  press('Escape');
  press('KeyP');
  assert.equal(up(), false, 'the pause is not a screen a visit can sit on');
  assert.equal(game.stats().paused, false);

  // ...and losing focus holds nothing either: the crowd behind the logo is the attract display and
  // not a run, and a title that stopped moving when the window lost focus would read as a crash.
  game.fire('blur', {});
  game.step(FRAME);
  assert.equal(up(), false);
  assert.equal(game.stats().paused, false);
});

test('the pause holds a run where it stands', () => {
  launchACalmRun();
  world.elapsed = 61.5;                   // a run with a minute on the clock
  const walker = makeEnemy(world, 'drifter', ship.x + 120, ship.y, null);
  world.enemies.push(walker);

  press('Escape');
  assert.equal(up(), true, 'and the screen went up');
  assert.equal(game.stats().state, game.STATE.PLAY, 'the run is still the run - held, not ended');
  assert.equal(game.stats().paused, true);

  const clock = game.stats().t;
  const session = world.time;
  const shipX = ship.x;
  const enemyX = walker.x;
  frames(120);                            // two seconds of frames, and no run

  assert.equal(game.stats().t, clock, 'the run clock did not move');
  assert.ok(world.time > session, 'the window kept moving - the sparks and the sky are not the arena');
  assert.equal(ship.x, shipX, 'the ship stood still');
  assert.equal(walker.x, enemyX, 'and so did the body walking at it');
});

test('the panel says the run it is sitting over', () => {
  world.score = 18300;
  world.kills = 812;
  world.shardsCollected = 1204;
  world.waveNumber = 11;
  world.bossesDown = 1;
  world.best = 42000;
  ship.level = 9;
  ship.hull = 2;
  ship.maxHull = 4;

  press('KeyP');                          // out and back in, so the panel is painted from these
  press('KeyP');
  assert.equal(up(), true, 'P is the pause key as much as Escape is');
  assert.match(game.screen.pauseHead, /^SCORE 18,300   \u00b7   1m\d\ds$/,
    'the run\'s two headline numbers, and the clock is the whole run\'s');

  assert.equal(fact('KILLS'), '812');
  assert.equal(fact('SHARDS'), '1,204');
  assert.equal(fact('LEVEL'), '9');
  assert.equal(fact('HULL'), '2 OF 4');
  assert.equal(fact('WAVES'), '11');
  assert.equal(fact('FIGHTS'), '1 BOSS');
  assert.equal(fact('BEST'), '42,000');
  assert.equal(fact('SEED'), String(world.seed),
    'the one number on the panel a player can ask for again, by seed, in the address bar');
  assert.equal(fact('FLOWN IN'), BALANCE.ships[world.ship].name + ' \u00b7 '
    + BALANCE.weapons[world.weapon].name, 'the body, and the gun that came with it');
  // What the run would be paid if it stopped this second (game/stardust.js) - and this panel is the
  // one place in the game that offers a key that stops it.
  assert.equal(fact('RUN WORTH'),
    '+' + dustForRun(world).toLocaleString('en-US') + ' STARDUST');
  assert.equal(fact('SCORE'), null, 'the score is said once, in the headline, and not twice');
});

test('the same key is the way back out, and neither key is anything else', () => {
  press('Escape');
  assert.equal(game.stats().paused, false, 'Escape let the run go');
  assert.equal(up(), false, 'and took the panel with it');
  frames(30);
  assert.ok(game.stats().t > 62, 'the clock is running again');

  press('KeyP');
  assert.equal(game.stats().paused, true, 'P holds it again');
  press('Escape');
  assert.equal(game.stats().paused, false, 'and either key lets it go');

  // The keys that mean something in a run keep meaning it, which over a held run means nothing at
  // all: Space is the launch and the dash, a number is a card or a ship, R is the deal. None of them
  // has a second answer here, and none of them puts a panel up (game/run.js `canStartRun` refuses a
  // world that is already flying).
  press('Escape');
  const clock = game.stats().t;
  const body = world.ship;
  press('Space');
  game.pressMouse(640, 360, 0);
  game.releaseMouse(0);
  press('Digit2');
  press('KeyR');
  press('KeyH');
  press('KeyC');
  frames(5);
  assert.equal(game.stats().paused, true, 'none of them resumed the run');
  assert.equal(game.stats().state, game.STATE.PLAY, 'none of them started a new one');
  assert.equal(world.ship, body, 'none of them picked a ship out from under the run');
  assert.equal(game.screen.hangarHidden, true,
    'and none of them put another panel up over the pause: the run already has one');
  assert.equal(game.screen.codexHidden, true);
  assert.ok(game.stats().t <= clock + BALANCE.sim.step, 'and the run is still held');
});

test('a dash asked for during a pause is spent and not kept', () => {
  ship.dashCd = 0;
  ship.dashLeft = 0;
  press('Space');                          // the launch key is the dash key, over a pause as anywhere
  assert.equal(ship.dashCd, 0, 'no dash went off when nothing was stepping');
  press('Escape');
  frames(2);
  assert.equal(ship.dashLeft, 0, 'and none went off late, frames after the key');
  assert.equal(ship.dashCd, 0, 'the wait was never started, so the run owes nothing to that press');
});

test('the view holds with the run', () => {
  press('Escape');
  const before = { x: game.camera.cx, y: game.camera.cy };
  game.moveMouse(60, 90);
  frames(30);
  assert.equal(game.camera.cx, before.x, 'the mouse still moves the cursor, and no longer the view');
  assert.equal(game.camera.cy, before.y);

  press('Escape');
  game.moveMouse(1200, 700);
  frames(30);
  assert.ok(game.camera.cx > before.x, 'and the lean comes back with the run');
});

test('losing focus holds the run too, without a press', () => {
  const clock = game.stats().t;
  game.fire('blur', {});
  game.step(4000);
  assert.equal(game.stats().paused, true, 'the game pauses itself when nobody is watching it');
  assert.equal(game.stats().t, clock, 'and nothing was flown while nobody was');
  assert.equal(up(), true, 'so the screen says it, rather than looking like a freeze');

  press('Escape');
  assert.equal(game.stats().paused, false);
});

test('giving the run up ends it like any other ending', () => {
  press('Escape');
  const score = world.score;
  press('KeyG');
  game.step(FRAME);

  assert.equal(game.stats().state, game.STATE.OVER, 'the run is over');
  assert.equal(game.stats().paused, false, 'and it is not being held any more, either');
  assert.equal(up(), false, 'the card the run ends on is not for a panel to sit under');
  assert.equal(game.screen.overHidden, false, 'and the card went up on the frame after the press');
  assert.equal(game.screen.finalScore, score.toLocaleString('en-US'), 'banked like any death');
  assert.ok(game.stats().hull > 0, 'with the hull it had left: nothing killed this run');
  assert.equal(game.stats().killedBy, '', 'and the tally says so instead of inventing a cause');

  // G is the pause's key and nobody else's. Over a wreck it asks for nothing - the run is already
  // over, and the way out of that card is Space.
  press('KeyG');
  assert.equal(game.stats().state, game.STATE.OVER);
});

test('the next run is not born paused', () => {
  for (let i = 0; i < 120; i++) game.step(FRAME);   // the wreck's restart guard, spent
  press('Space');
  assert.equal(game.stats().state, game.STATE.PLAY);
  assert.equal(game.stats().paused, false);
  assert.equal(up(), false);
  const clock = game.stats().t;
  frames(30);
  assert.ok(game.stats().t > clock, 'and it flies on its own clock from the first step');
});
