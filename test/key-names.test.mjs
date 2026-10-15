// What the game *hears* when a key is pressed (core/keymap.js, input/keyboard.js).
//
// The report this file exists for, from a friend of the owner's playing the game: **"D fungerer ikke
// hos meg, right-arrow fungerer dog"** - D does not work for me, right-arrow does though. On the face
// of it that is impossible: `D` and the right arrow are two rows of the same flight control, and the
// ship goes right on both. What it really says is that the visitor's browser named one of those keys
// and not the other, and the game only ever read one of the two names a browser hands over.
//
// A keyboard event arrives with two names for the same key. `code` is a *place on the keyboard*
// (`KeyD`), which is what the game keeps its bindings by because it is the one name a save can mean on
// somebody else's machine. `key` is *what the key prints* (`'d'`), which is the only name the player
// standing at the keyboard has. They are the same string for the arrows and nothing else - which is
// exactly the shape of the report: a visit that gets no `code` has every letter of the table go deaf
// while its arrows carry on working, and a visit on a board whose letters do not sit where QWERTY puts
// them (Dvorak, Colemak, a Mac with an odd input source) is told to press a key wearing somebody
// else's letter.
//
// So the rule being held here is one line long and it is the whole fix: **a press is heard by what it
// prints, and by its place when it prints nothing this game can name.** Every test below sends events
// the way those two broken visits send them, and then looks at the world - because a name the input
// layer understands but the ship never notices is not a fix.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { SAVE_KEY } from '../src/core/save.js';
import { codeForWord, loadFromSave, codeFor, changedCount } from '../src/core/keymap.js';
import { refreshOffer } from '../src/game/upgrades.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 71, width: 1280, height: 720, storage: {} });
const world = game.world;
const ship = world.player;

const FRAME = 16.7;                     // what one game.step() advances the clock by, in ms

// --- the words themselves (core/keymap.js `codeForWord`) ----------------------

test('a printed word answers the key that wears it', () => {
  assert.equal(codeForWord('d'), 'KeyD');
  assert.equal(codeForWord('W'), 'KeyW');           // Caps Lock and Shift are not other keys
  assert.equal(codeForWord('3'), 'Digit3');
  assert.equal(codeForWord(' '), 'Space');
  assert.equal(codeForWord('['), 'BracketLeft');
  assert.equal(codeForWord('-'), 'Minus');
  assert.equal(codeForWord("'"), 'Quote');
});

test('a key that prints nothing spells itself, so a nameless browser still has arrows', () => {
  for (const word of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'Enter', 'F3']) {
    assert.equal(codeForWord(word), word, word + ' should answer itself');
  }
});

test('a word this game has no key for answers nothing, and the press falls back to its place', () => {
  // The point of these is not that they are refused - it is that refusing them is what lets a layout
  // with no latin letters keep the bindings the rack prints. `æ` is one key on the board the report
  // came from, and it is not a letter this table can ever wear.
  for (const word of ['æ', 'ø', 'å', '∂', 'Dead', '中', 'Shift', 'ab', '']) {
    assert.equal(codeForWord(word), '', word + ' names no key the game can bind');
  }
  assert.equal(codeForWord(undefined), '');
  assert.equal(codeForWord(null), '');
  assert.equal(codeForWord(7), '');
});

// --- the visit that names no place at all -------------------------------------

/**
 * Hold or release a key the way a browser that reports no `code` does it: the event carries what the
 * key prints and nothing else. This is the report, sent to the game.
 */
function type(word, down) {
  game.fire(down ? 'keydown' : 'keyup', { key: word, code: '', preventDefault() {} });
}

/**
 * ...and the way a board whose letters are not where QWERTY puts them reports it: a place *and* a
 * letter, and they disagree. `pressAt('KeyH', 'd')` is a Dvorak hand on its own D key.
 */
function pressAt(place, word, down) {
  game.fire(down ? 'keydown' : 'keyup', { code: place, key: word, preventDefault() {} });
}

/** A run with nothing in the sky to push the ship, so the only thing that moves it is the key. */
async function flying(seed = 71) {
  await game.resetToTitle(seed);
  for (let i = 0; i < 3; i++) game.step(FRAME);
  game.key('Space', true);
  game.key('Space', false);
  for (let i = 0; i < 3; i++) game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.PLAY, 'the run is flying');
  world.enemies.length = 0;
  world.spawnTimer = Infinity;
  ship.invuln = Infinity;
  ship.vx = 0;
  ship.vy = 0;
  return ship;
}

/** Hold what `type`/`pressAt` put down for a while, and answer how far the ship got. */
function driftFor(frames) {
  const from = { x: ship.x, y: ship.y };
  for (let i = 0; i < frames; i++) {
    world.enemies.length = 0;
    game.step(FRAME);
  }
  return { dx: ship.x - from.x, dy: ship.y - from.y };
}

test('a browser that names no place still flies the ship on its letters', async () => {
  await flying();

  for (const [word, axis, sign] of [['d', 'dx', 1], ['a', 'dx', -1], ['s', 'dy', 1], ['w', 'dy', -1]]) {
    ship.vx = 0;
    ship.vy = 0;
    type(word, true);
    const moved = driftFor(12);
    type(word, false);
    const along = axis === 'dx' ? moved.dx : moved.dy;
    const across = axis === 'dx' ? moved.dy : moved.dx;
    assert.ok(along * sign > 20,
      word + ' moved the ship ' + along.toFixed(1) + 'px along its own axis, not at all');
    assert.ok(Math.abs(across) < 1,
      word + ' also moved it ' + across.toFixed(1) + 'px the other way');
  }
});

test('and the letter lets go when the browser says it let go', async () => {
  await flying();

  type('d', true);
  driftFor(12);
  assert.ok(ship.vx > 100, 'the ship was not moving in the first place');
  type('d', false);
  driftFor(30);
  assert.equal(ship.vx, 0, 'a keyup that named no place left the key held down');
});

test('the arrows are still arrows when nothing else is named', async () => {
  await flying();

  type('ArrowRight', true);
  const moved = driftFor(12);
  type('ArrowRight', false);
  assert.ok(moved.dx > 20, 'the right arrow moved the ship ' + moved.dx.toFixed(1) + 'px');
});

// --- the visit whose letter and place disagree --------------------------------

test('the key a player is looking at beats the place it happens to sit on', async () => {
  await flying();

  // A Dvorak hand on its own D key: the browser says the place is where QWERTY keeps H, and the key
  // says D. The ship goes right, and the hangar - which owns that place - keeps its door shut.
  pressAt('KeyH', 'd', true);
  const moved = driftFor(12);
  pressAt('KeyH', 'd', false);
  assert.ok(moved.dx > 20, 'the key that prints d moved the ship ' + moved.dx.toFixed(1) + 'px sideways');
  assert.equal(game.screen.hangarHidden, true, 'and the place under it opened the hangar');

  // ...and the other half of the same board: the key sitting on the QWERTY-D place prints `i` there,
  // so it is not the ship going right. A game that read the place would move the ship on it.
  ship.vx = 0;
  pressAt('KeyD', 'i', true);
  const still = driftFor(12);
  pressAt('KeyD', 'i', false);
  assert.ok(Math.abs(still.dx) < 1,
    'the key that prints i moved the ship ' + still.dx.toFixed(1) + 'px on the strength of its place');
});

test('a letter this game cannot name falls back to its place, so any layout can fly', async () => {
  await flying();

  // The same physical key as the shipped binding, on a board that prints `æ` there. The game has no
  // `æ` row, so the place is the only name available - and it is the right one.
  pressAt('KeyD', 'æ', true);
  const moved = driftFor(12);
  pressAt('KeyD', 'æ', false);
  assert.ok(moved.dx > 20, 'the key at the D place moved the ship ' + moved.dx.toFixed(1) + 'px');
});

// --- the rest of the keyboard, heard without a place --------------------------

test('the launch, the pause and the mute are heard without a place', async () => {
  await game.resetToTitle(72);
  for (let i = 0; i < 3; i++) game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.START);

  type(' ', true);
  type(' ', false);
  for (let i = 0; i < 3; i++) game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.PLAY, 'a spacebar that named no place did not launch');

  world.spawnTimer = Infinity;
  ship.invuln = Infinity;
  type('p', true);
  type('p', false);
  game.step(FRAME);
  assert.equal(game.stats().paused, true, 'the pause key went deaf without a place');
  type('Escape', true);
  type('Escape', false);
  game.step(FRAME);
  assert.equal(game.stats().paused, false, 'and Escape did not let the run go either');

  const wasMuted = game.stats().muted;
  type('m', true);
  type('m', false);
  game.step(FRAME);
  assert.equal(game.stats().muted, !wasMuted, 'the mute switch did not answer its letter');
  type('m', true);
  type('m', false);
  game.step(FRAME);
  assert.equal(game.stats().muted, wasMuted, 'and it would not answer it back');
});

test('a card is answered by the number printed on the key, not by the place it is on', async () => {
  await flying(73);

  // Deal the cards by hand rather than by luck: what is being tested is the number, not the deal.
  world.pendingLevels = 1;
  refreshOffer(world);
  assert.equal(world.state, game.STATE.LEVEL, 'the run stopped for a choice');
  const dealt = world.offer.slice();
  assert.equal(dealt.length, 3, 'three cards are dealt');

  type('2', true);
  type('2', false);
  game.step(FRAME);
  assert.notEqual(world.state, game.STATE.LEVEL, 'the number 2 did not answer the card it was pointed at');
  assert.equal(world.upgrades[dealt[1]], 1, 'the second card of the deal was not the one taken');
});

// --- and the rack, which has to hear a key in order to remember one -----------

/** Back to the shipped table, so a rebinding here cannot leak into the next test. */
function shippedAgain() {
  delete game.storage[SAVE_KEY];
  loadFromSave();
  assert.equal(changedCount(), 0);
}

const rackIsUp = () => game.screen.keysHidden === false;
const settingsAreUp = () => game.screen.settingsHidden === false;
const chosenRow = () => game.screen.keysRows.findIndex((row) => row.chosen);
const waitingRow = () => game.screen.keysRows.findIndex((row) => row.waiting);

/** A typed press, with the frame that answers it. */
function tap(word) {
  type(word, true);
  type(word, false);
  game.step(FRAME);
}

test('the rack takes a key from a visit that names no place, and the ship flies on it', async () => {
  shippedAgain();
  await game.resetToTitle(74);
  for (let i = 0; i < 3; i++) game.step(FRAME);

  tap('o');                                    // the settings panel, by its letter alone
  assert.equal(settingsAreUp(), true, 'the letter o did not put the settings up');
  const door = game.screen.settingsRows.findIndex((row) => row.name === 'KEYS');
  assert.ok(door >= 0, 'the settings panel has a door onto the keys');
  for (let i = 0; i < door; i++) tap('ArrowDown');
  tap('ArrowRight');
  assert.equal(rackIsUp(), true, 'and the door opened the rack');

  const at = game.screen.keysRows.findIndex((row) => row.name === 'RIGHT');
  assert.ok(at >= 0, 'the rack prints a row for RIGHT');
  while (chosenRow() < at) tap('ArrowDown');
  tap('ArrowRight');
  assert.equal(waitingRow(), at, 'the row is waiting for a key');

  tap('j');                                    // the key this hand means, with no place attached
  assert.equal(codeFor('right'), 'KeyJ', 'the rack remembered ' + codeFor('right'));
  assert.equal(game.screen.keysRows[at].value, 'J', 'and the row says so on the glass');

  // ...and the binding is not paint: the ship answers the letter that was pressed.
  await flying(74);
  ship.vx = 0;
  type('j', true);
  const moved = driftFor(12);
  type('j', false);
  assert.ok(moved.dx > 20, 'the rebound key moved the ship ' + moved.dx.toFixed(1) + 'px, not at all');

  ship.vx = 0;
  type('d', true);
  const now = driftFor(12);
  type('d', false);
  assert.ok(Math.abs(now.dx) < 1, 'the key RIGHT left behind still flies the ship');

  shippedAgain();
  assert.equal(codeFor('right'), 'KeyD', 'and putting the row back put it back on D');
});
