// The synergy card through the real game: what it says, what it does not have, and the two ways a
// player answers it. The rules behind it are `test/synergies.test.mjs`'s; this file only presses
// keys and clicks, and reads what was painted - which is why it is a separate process (NOTES
// session 48: the world is a singleton, and a booted game must not be handed to a rule test).

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { startBotRun, FRAME_MS } from '../tools/headless/bot.js';
import { banishLayout, cardLayout } from '../src/render/cards.js';
import { dropShards } from '../src/game/pickups.js';
import { BALANCE } from '../src/game/balance.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 88 });
const world = game.world;
const ship = world.player;
const SHOCK = 'thermalShock';
const W = 1280;
const H = 720;

/** Launch, then stop the world from interfering: this file is about the card, not the run. */
for (let i = 0; i < 4; i++) game.step(FRAME_MS);
startBotRun(game);
ship.invuln = Infinity;
world.spawnTimer = Infinity;
game.step(FRAME_MS);

/** Burn three, chill three: the card is earned from here on. */
world.upgrades.burn = 3;
world.upgrades.chill = 3;

/** Pay for exactly one level and step until the run has stopped to spend it. */
function earnALevel() {
  world.xp = 0;
  world.shards.clear();
  world.enemies.length = 0;
  world.offer.length = 0;
  world.pendingLevels = 0;
  world.state = game.STATE.PLAY;
  dropShards(world, ship.x, ship.y, Math.ceil(world.xpNeed / BALANCE.shards.xp));
  let frames = 0;
  while (world.state !== game.STATE.LEVEL && frames < 400) {
    game.step(FRAME_MS);
    frames++;
  }
  assert.equal(world.state, game.STATE.LEVEL, 'the run stopped for a choice');
  // ...and let the cards finish sliding in before anything reads them: the third one starts a
  // tenth of a second behind the first (render/cards.js STAGGER).
  for (let i = 0; i < 30; i++) game.step(FRAME_MS);
  return frames;
}

/** One frame's worth of draw calls, and every word that frame painted. */
function painted() {
  const before = game.drawCalls();
  const frame = game.step(FRAME_MS);
  const after = game.drawCalls();
  return {
    frame: frame,
    texts: after.texts - before.texts,
    strokes: after.strokes - before.strokes,
    fills: after.fills - before.fills,
    images: after.images - before.images,
    words: game.words(),
  };
}

function press(code, extra) {
  game.key(code, true, extra);
  game.key(code, false, extra);
}

function clickWhere(rect) {
  game.pressMouse(rect.x + rect.w / 2, rect.y + rect.h / 2, 0);
  game.releaseMouse(0);
}

const card = (index) => cardLayout(world.offer.length, W, H).cards[index];

test('a run that earned it is handed the card, in the right-hand place', () => {
  earnALevel();
  assert.ok(world.offer.includes(SHOCK), 'dealt: ' + world.offer.join(', '));
  assert.equal(world.offer[world.offer.length - 1], SHOCK, 'and last of the three');
  assert.equal(world.offer.length, BALANCE.cards.offer, 'with the table no bigger than it was');
});

test('the card says what it is, what it does, and what it came out of', () => {
  const frame = painted();
  const says = frame.words.join(' | ');

  assert.ok(frame.words.includes('THERMAL SHOCK'), 'its name: ' + says);
  assert.ok(frame.words.includes('A COLD CORPSE GOES UP'),
    'what it becomes, where a line prints what a rank adds: ' + says);
  assert.ok(frame.words.includes('SYNERGY'), 'and the plate that says what kind of card it is: ' + says);
  assert.ok(frame.words.includes('BURN 3'), 'and the two lines it came out of: ' + says);
  assert.ok(frame.words.includes('CHILL 3'), 'in their own names and their own numbers: ' + says);
});

test('its frame is not an ordinary card frame', () => {
  // The same window, the same single card: a synergy's frame is the two parents' edges and a
  // plate, where a line has one edge and a banish tab, so the frame the synergy wears has to show
  // up as more of the canvas being asked for.
  const line = paintOneCard('damage');
  const synergy = paintOneCard(SHOCK);

  assert.ok(synergy.strokes > line.strokes,
    'two edges and a plate cost more strokes than one edge and a tab: '
    + line.strokes + ' against ' + synergy.strokes);
  assert.ok(synergy.words.includes('SYNERGY') && !line.words.includes('SYNERGY'),
    'and the plate is on one of them and not the other');

  earnALevel();   // put the real table back for the tests that follow
});

/** Put one card on the table on its own and paint a frame of it. */
function paintOneCard(id) {
  world.offer.length = 0;
  world.offer.push(id);
  world.offerTime = world.time;
  for (let i = 0; i < 30; i++) game.step(FRAME_MS);   // wait out the slide-in, as above
  return painted();
}

test('a synergy has no banish tab, and the key that would use one does nothing', () => {
  earnALevel();
  const at = world.offer.indexOf(SHOCK);
  const tabs = banishLayout(W, H);
  assert.ok(tabs.filter((tab) => tab !== null).length === BALANCE.cards.offer - 1,
    'the other two cards have tabs and this one does not: ' + JSON.stringify(tabs));
  assert.equal(tabs[at], null, 'nothing to press in that corner');

  const banishes = world.banishesLeft;
  const before = world.offer.slice();
  press('Digit' + (at + 1), { shiftKey: true });

  assert.deepEqual(world.offer.slice(), before, 'and the key changed nothing');
  assert.equal(world.banishesLeft, banishes, 'without spending the ask either');
  assert.equal(world.upgrades[SHOCK], 0, 'and the card is still face up');
  assert.equal(world.state, game.STATE.LEVEL, 'so the run is still holding still');
});

test('the number key answers it, and pays the level for it', () => {
  earnALevel();
  const at = world.offer.indexOf(SHOCK);
  assert.ok(world.offer.includes(SHOCK), 'it is dealt again on the next level too');

  press('Digit' + (at + 1));
  assert.equal(world.upgrades[SHOCK], 1, 'key ' + (at + 1) + ' answered the card');
  assert.equal(world.pendingLevels, 0, 'and paid the level for it');
  assert.equal(world.state, game.STATE.PLAY, 'and the run is flying again');
  game.step(FRAME_MS);
});

test('so does a click, in the corner where an ordinary card keeps its banish tab', () => {
  // The card handed back to ask the same question of the mouse: `upgrades` is a number on the
  // world like any other, and whether a run can be handed it twice is test/synergies.test.mjs's
  // question, not this one's.
  world.upgrades[SHOCK] = 0;
  earnALevel();
  const at = world.offer.indexOf(SHOCK);
  clickWhere(card(at));

  assert.equal(world.upgrades[SHOCK], 1, 'the card was taken');
  assert.equal(world.state, game.STATE.PLAY, 'and the run is flying again');
  game.step(FRAME_MS);
});

test('once taken it is never dealt again, and the asks are still there for the lines', () => {
  for (let level = 0; level < 6; level++) {
    earnALevel();
    assert.ok(!world.offer.includes(SHOCK), 'one rank of it, once: ' + world.offer.join(', '));
    press('Digit1');
    game.step(FRAME_MS);
  }
  assert.equal(world.banishesLeft, BALANCE.cards.banishes, 'the banish was never spent on it');
  assert.equal(world.rerollsLeft, BALANCE.cards.rerolls, 'nor the reroll');
});
