// The level-up choice through the real game: the run stops by itself, the number keys
// and the mouse answer it, the frame keeps painting while everything else is frozen,
// and the bot plays all of it without being told to.
//
// One world per process, as ever, so this file is one session: launch, level up,
// answer it three ways, then hand the whole thing to the bot and let it finish.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { playOneRun, startBotRun, FRAME_MS } from '../tools/headless/bot.js';
import { cardAt, cardLayout } from '../src/render/cards.js';
import { dropShards } from '../src/game/pickups.js';
import { BALANCE } from '../src/game/balance.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 61 });
const world = game.world;
const ship = world.player;

/**
 * Pay for exactly one level and step until the run has stopped to spend it. The bank
 * starts empty and nothing is left on the floor from the last time, so one call is
 * exactly one choice - not two, which a fat handful of shards would otherwise be.
 */
function earnALevel() {
  world.xp = 0;
  world.shards.clear();
  world.enemies.length = 0;
  world.pendingLevels = 0;
  dropShards(world, ship.x, ship.y, Math.ceil(world.xpNeed / BALANCE.shards.xp));
  let frames = 0;
  while (world.state !== game.STATE.LEVEL && frames < 400) {
    game.step(FRAME_MS);
    frames++;
  }
  assert.equal(world.state, game.STATE.LEVEL, 'the shards came in and the run stopped for a choice');
  assert.equal(world.pendingLevels, 1, 'and exactly one level was earned');
  return frames;
}

/** One frame's worth of draw calls, so "it was painted" is a number and not a hope. */
function painted() {
  const before = game.drawCalls();
  game.step(FRAME_MS);
  const after = game.drawCalls();
  return {
    texts: after.texts - before.texts,
    fills: after.fills - before.fills,
    strokes: after.strokes - before.strokes,
    images: after.images - before.images,
  };
}

test('the run launches and is untouched until it levels up', () => {
  for (let i = 0; i < 30; i++) game.step(FRAME_MS);
  startBotRun(game);
  assert.equal(game.stats().state, game.STATE.PLAY);
  // These tests are about the choice. The ship cannot be hurt and nothing new arrives,
  // so nothing here is ever cut short by dying.
  ship.invuln = Infinity;
  world.spawnTimer = Infinity;
  game.step(FRAME_MS);
  assert.equal(world.offer.length, 0, 'nothing is on the table while the run is playing');
});

test('the run stops for a choice, and a number key answers it', () => {
  const before = game.stats().t;
  earnALevel();

  assert.equal(world.offer.length, BALANCE.cards.offer, 'three cards are up');
  assert.deepEqual(world.offer, ['damage', 'fireRate', 'bulletSpeed'], 'in the order the table knows them');

  const frozen = game.stats().t;
  for (let i = 0; i < 20; i++) game.step(FRAME_MS);
  assert.equal(game.stats().t, frozen, 'no run time passes while the cards are up');

  game.key('Digit2', true);
  game.key('Digit2', false);
  assert.equal(world.state, game.STATE.PLAY, 'the run came back');
  assert.equal(world.upgrades.fireRate, 1, 'and the middle card was the fire rate line');
  assert.ok(game.stats().t > before, 'and the clock is running again');
});

test('a click on a card takes that card, and a click off them takes nothing', () => {
  earnALevel();

  const layout = cardLayout(world.offer.length, 1280, 720);
  const middle = layout.cards[1];
  assert.equal(cardAt(middle.x + middle.w / 2, middle.y + middle.h / 2), 1, 'the middle of the middle card is the middle card');
  assert.equal(cardAt(4, 4), -1, 'and the corner of the window is nothing at all');

  game.pressMouse(4, 4, 0);
  assert.equal(world.state, game.STATE.LEVEL, 'a click off the cards is not an answer');
  game.releaseMouse(0);

  const before = world.upgrades.fireRate;
  game.pressMouse(middle.x + middle.w / 2, middle.y + middle.h / 2, 0);
  assert.equal(world.state, game.STATE.PLAY, 'and a click on one is');
  assert.equal(world.upgrades.fireRate, before + 1, 'the middle card is the middle line');
  game.releaseMouse(0);
});

test('the choice is painted, and paints over a frame that is not running', () => {
  const running = painted();
  earnALevel();
  const paused = painted();

  assert.ok(paused.texts > running.texts + 8,
    'the cards bring words with them: ' + running.texts + ' against ' + paused.texts);
  assert.ok(paused.strokes > running.strokes + 6, 'and the panels, which are stroked: ' + paused.strokes);
  assert.ok(paused.images > 0, 'and something shines: ' + paused.images);

  const damageBefore = world.upgrades.damage;
  const fireBefore = world.upgrades.fireRate;
  game.key('Digit1', true);
  game.key('Digit1', false);
  assert.equal(world.upgrades.damage, damageBefore + 1, 'and key 1 is the left-hand card');
  assert.equal(world.upgrades.fireRate, fireBefore, 'and only that one card was taken');
});

test('a dash pressed while the cards are up is spent, not stored', () => {
  earnALevel();
  ship.dashCd = 0;
  ship.dashLeft = 0;

  game.key('Space', true);
  game.key('Space', false);
  for (let i = 0; i < 5; i++) game.step(FRAME_MS);
  assert.equal(world.state, game.STATE.LEVEL, 'Space is not an answer to a card');

  game.key('Digit1', true);
  game.key('Digit1', false);
  for (let i = 0; i < 4; i++) game.step(FRAME_MS);
  assert.equal(ship.dashLeft, 0, 'the press during the pause did not go off afterwards');
  assert.equal(ship.dashCd, 0, 'and it was not banked for later either');
});

test('the bot picks a card when the run stops for one, and still dies in the end', async () => {
  await game.resetToTitle(62);
  const run = playOneRun(game, { maxSeconds: 900 });

  assert.equal(run.died, true, 'the run ended');
  const ranks = game.world.upgrades;
  const taken = ranks.damage + ranks.fireRate + ranks.bulletSpeed;
  assert.ok(taken > 0, 'the bot took upgrades on the way: ' + JSON.stringify(ranks));
  assert.ok(taken <= 15, 'and never more than the three lines have to give: ' + taken);
  assert.ok(game.stats().level > 3, 'and levelled up enough to have taken them');
  assert.match(game.screen.build, /DAMAGE|FIRE RATE|SHOT SPEED|NO UPGRADES/, 'and the game-over card says what it was built from');
  game.stop();
});
