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
import { playOneRun, startBotRun, endingItAt, FRAME_MS } from '../tools/headless/bot.js';
import { cardAt, cardLayout } from '../src/render/cards.js';
import { dropShards } from '../src/game/pickups.js';
import { LINES } from '../src/game/upgrades.js';
import { BALANCE } from '../src/game/balance.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 61 });
const world = game.world;
const ship = world.player;
const LINE_IDS = LINES.map((line) => line.id);
const ALL_RANKS = LINES.reduce((sum, line) => sum + BALANCE.upgrades[line.id].ranks, 0);

/** The whole build, as one number, so a test can say "exactly one rank more". */
function ranksTaken() {
  return Object.values(world.upgrades).reduce((sum, rank) => sum + rank, 0);
}

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
  const taken = ranksTaken();
  earnALevel();

  assert.equal(world.offer.length, BALANCE.cards.offer, 'three cards are up');
  assert.equal(new Set(world.offer).size, BALANCE.cards.offer, 'and no line comes twice');
  for (const id of world.offer) {
    assert.ok(LINE_IDS.includes(id), id + ' is a line the game knows: ' + id);
  }

  const frozen = game.stats().t;
  for (let i = 0; i < 20; i++) game.step(FRAME_MS);
  assert.equal(game.stats().t, frozen, 'no run time passes while the cards are up');

  const middle = world.offer[1];
  const middleBefore = world.upgrades[middle];
  game.key('Digit2', true);
  game.key('Digit2', false);
  assert.equal(world.state, game.STATE.PLAY, 'the run came back');
  assert.equal(world.upgrades[middle], middleBefore + 1,
    'and the middle card was the ' + middle + ' line');
  assert.equal(ranksTaken(), taken + 1, 'exactly one rank, from exactly one line');
  assert.ok(game.stats().t > before, 'and the clock is running again');
});

test('a click on a card takes that card, and a click off them takes nothing', () => {
  earnALevel();
  const taking = world.offer[1];
  const before = world.upgrades[taking];

  const layout = cardLayout(world.offer.length, 1280, 720);
  const middle = layout.cards[1];
  assert.equal(cardAt(middle.x + middle.w / 2, middle.y + middle.h / 2), 1, 'the middle of the middle card is the middle card');
  assert.equal(cardAt(4, 4), -1, 'and the corner of the window is nothing at all');

  game.pressMouse(4, 4, 0);
  assert.equal(world.state, game.STATE.LEVEL, 'a click off the cards is not an answer');
  game.releaseMouse(0);

  game.pressMouse(middle.x + middle.w / 2, middle.y + middle.h / 2, 0);
  assert.equal(world.state, game.STATE.PLAY, 'and a click on one is');
  assert.equal(world.upgrades[taking], before + 1, 'the middle card is the middle line');
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

  const taking = world.offer[0];
  const before = Object.assign({}, world.upgrades);
  game.key('Digit1', true);
  game.key('Digit1', false);
  assert.equal(world.upgrades[taking], before[taking] + 1, 'and key 1 is the left-hand card');
  for (const id of LINE_IDS) {
    if (id === taking) continue;
    assert.equal(world.upgrades[id], before[id], id + ' was not touched');
  }
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

test('every line has a face: a name, a number, and a shape drawn for it', () => {
  // Cards are canvas, not DOM (PLAN section 4 wants each icon drawn in code), so the
  // only way to see one here is to paint one. Every line gets put on the table on its
  // own: a line whose icon was never written throws, and a line whose words were never
  // written draws a card with nothing on it.
  for (const line of LINES) {
    world.state = game.STATE.LEVEL;
    world.offer.length = 0;
    world.offer.push(line.id);
    world.offerTime = world.time;

    const frame = painted();
    assert.ok(frame.texts > 2, line.id + ' prints its name and its number: ' + frame.texts + ' texts');
    assert.ok(frame.images > 0, line.id + ' has something that shines: ' + frame.images);
    assert.ok(frame.strokes > 2, line.id + ' has a panel and an icon: ' + frame.strokes + ' strokes');
  }

  world.offer.length = 0;
  world.state = game.STATE.PLAY;
});

test('the bot picks a card when the run stops for one, and still dies in the end', async () => {
  await game.resetToTitle(62);
  // Finished on purpose: a bot that has been handed the upgrade lines can outlast any
  // window this suite could afford to wait for (NOTES, session 28).
  const run = playOneRun(game, { maxSeconds: 300, onFrame: endingItAt(120) });

  assert.equal(run.died, true, 'the run ended');
  const taken = ranksTaken();
  assert.ok(taken > 0, 'the bot took upgrades on the way: ' + JSON.stringify(world.upgrades));
  assert.ok(taken <= ALL_RANKS, 'and never more than the lines have to give: ' + taken);
  assert.ok(game.stats().level > 3, 'and levelled up enough to have taken them');
  assert.match(game.screen.build, /DAMAGE|FIRE RATE|SHOT SPEED|SPLIT SHOT|NO UPGRADES/,
    'and the game-over card says what it was built from');
  game.stop();
});
