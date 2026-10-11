// Key rebinding (PLAN section 6), driven the way a player drives it: the real keyboard, the real
// panels, and the real simulation listening at the other end of the table.
//
// `test/keymap.test.mjs` has the table itself - the swap, the save, what may be taken. What is here is
// the *machine* around it: the door on the settings panel, the rack behind it, the arrow that asks the
// keyboard for a key, and the promise that a rebound key reaches the ship rather than only the picture
// of a rebound key. That last one is the reason the file exists: a rebinding implemented in the panel -
// a table the display reads and the input layer never asks - would pass every test that only looks at
// rows, so nearly every test below ends by pressing the new key at the game and watching the world move.
//
// Three things to know about the shape of it:
//
//   * The bindings are one global table (core/keymap.js), so a test that moves a key leaves it moved
//     for every later test unless it puts it back - hence `shippedAgain()`, which takes the save away
//     and re-reads the table, the same bargain test/settings.test.mjs strikes with its own rows.
//   * One game lives in a process (tools/headless/harness.js), so every test sets up its own screen.
//   * No rack can be put up over a run that is flying, so a test that wants to rebind and then fly has
//     to hold the run, rebind, and let it go again - which is exactly what a player does.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { SAVE_KEY } from '../src/core/save.js';
import { loadFromSave, codeFor, changedCount, wordsOf, ACTIONS } from '../src/core/keymap.js';
import { paintKeyWords, KEY_LABELS } from '../src/ui/screens.js';

/** Every control the rack prints a row for, in the rack's own order. */
const ROW_NAMES = ACTIONS.map((action) => action.id);

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;

const game = await bootGame({ root: ROOT, seed: 61, width: 1280, height: 720, storage: {} });
const world = game.world;
const ship = world.player;

function press(code) {
  game.key(code, true);
  game.key(code, false);
  game.step(FRAME);
}

function frames(howMany) {
  for (let i = 0; i < howMany; i++) game.step(FRAME);
}

const rackIsUp = () => game.screen.keysHidden === false;
const settingsAreUp = () => game.screen.settingsHidden === false;
const keys = () => game.stats().keys;
/** What the rack calls a control, written out once and in the rack's own order. */
const NAME_OF = {
  up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', dash: 'DASH', pause: 'PAUSE',
  giveup: 'GIVE UP', hangar: 'HANGAR', codex: 'CODEX', settings: 'SETTINGS',
  daily: "TODAY'S ARENA", reroll: 'REROLL', mute: 'MUTE',
};

/** The row the amber light is on, or -1 when no row is waiting for a key. */
function waitingRow() {
  return game.screen.keysRows.findIndex((row) => row.waiting);
}

function chosenRow() {
  return game.screen.keysRows.findIndex((row) => row.chosen);
}

/** Back to the shipped table: no save, and the table read from it (see the note at the top). */
function shippedAgain() {
  delete game.storage[SAVE_KEY];
  loadFromSave();
  assert.equal(changedCount(), 0);
}

/** Every panel down, whatever a previous test left hanging. Takes the pause down with them. */
function closePanels() {
  for (let i = 0; i < 6 && (settingsAreUp() || rackIsUp()); i++) press(theSettingsKey());
}

/**
 * The key that opens the settings *now* - `KeyO` until a test moves it (core/keymap.js). Every helper
 * that gets from a screen to a panel goes through this, so a test that rebound the settings panel can
 * still walk its way out of it.
 */
function theSettingsKey() {
  return codeFor('settings');
}

/** Where the settings panel prints the door onto this rack, or -1 when it does not print one. */
function doorRow() {
  return game.screen.settingsRows.findIndex((row) => row.name === 'KEYS');
}

/** From the title: the settings panel, the door walked to, and the rack opened. */
function openRack() {
  closePanels();
  press(theSettingsKey());
  const at = doorRow();
  assert.ok(at >= 0, 'the settings panel has a door onto the keys');
  for (let i = 0; i < at; i++) press('ArrowDown');
  press('ArrowRight');
  assert.equal(rackIsUp(), true, 'and one press on the door opens it');
}

/** Put the cursor on one control by name. */
function goTo(id) {
  // Guarded, because the walk below is a `while` over the cursor and a rack that is not on the glass has
  // no cursor to walk - it answers -1, and a loop on -1 never ends.
  assert.equal(rackIsUp(), true, 'the rack is up before anything looks for a row on it');
  const index = game.screen.keysRows.findIndex((row) => row.name === NAME_OF[id]);
  assert.ok(index >= 0, 'the rack prints a row for ' + id);
  while (chosenRow() < index) press('ArrowDown');
  while (chosenRow() > index) press('ArrowUp');
  assert.equal(chosenRow(), index, 'the cursor is on ' + NAME_OF[id]);
  return index;
}

/** ...and ask the keyboard for a key for it. */
function askFor(id) {
  const index = goTo(id);
  press('ArrowRight');
  assert.equal(waitingRow(), index, NAME_OF[id] + ' is waiting for a key');
}

/**
 * A run that is held, with nothing in the arena to die of: the screen every rebinding starts from.
 * `spawnTimer` and `invuln` are set before the run is held so that letting it go is safe.
 */
async function heldRun() {
  await game.resetToTitle(61);
  frames(3);
  closePanels();
  press('Space');
  frames(2);
  world.spawnTimer = Infinity;
  ship.invuln = Infinity;
  assert.equal(game.stats().state, game.STATE.PLAY, 'the run is flying');
  press('Escape');
  frames(2);
  assert.equal(game.stats().paused, true, 'and held, which is the only state a rack belongs in');
}

/** Let a held run go again, and take the pause that comes with letting it go. */
function letItGo() {
  closePanels();
  press('Escape');
  frames(2);
  assert.equal(game.stats().paused, false);
}

// --- the door and the rack ----------------------------------------------------

test('the settings panel has one door onto the keys, and one press walks through it', async () => {
  shippedAgain();
  await game.resetToTitle(61);
  frames(3);
  closePanels();
  press('KeyO');
  const rows = game.screen.settingsRows;
  const at = rows.findIndex((row) => row.name === 'KEYS');
  assert.ok(at >= 0, 'there is a KEYS row');
  assert.equal(rows[at].value, 'ALL SHIPPED', 'and it says nothing has been moved yet');
  assert.ok(rows[at].says.length > 0, 'and it says how to open it');

  for (let i = 0; i < at; i++) press('ArrowDown');
  press('ArrowRight');
  assert.equal(rackIsUp(), true, 'and it opened');
  assert.equal(settingsAreUp(), false, 'one panel at a time - the settings go down on its way up');

  const printed = game.screen.keysRows;
  assert.equal(printed.length, 13, 'one row per control a hand can move');
  assert.deepEqual(printed.map((row) => row.name), Object.values(NAME_OF),
    'the whole table, in order');
  assert.deepEqual(printed.map((row) => row.value),
    ['W', 'S', 'A', 'D', 'SPACE', 'P', 'G', 'H', 'C', 'O', 'T', 'R', 'M'],
    'every row shows the key it is on, spelled the way the glass spells it');
  for (const row of printed) assert.ok(row.says.length > 0, row.name + ' says what it is');
  assert.equal(chosenRow(), 0, 'one cursor, on the top row');
  assert.ok(game.screen.keysNote.length > 0 && game.screen.keysHint.length > 0,
    'and the rack says what it keeps and how it is driven');
  closePanels();
});

test('O goes back the way it came, and the settings panel is still the same rack', async () => {
  shippedAgain();
  await game.resetToTitle(61);
  frames(3);
  openRack();
  press('ArrowDown');
  press('ArrowDown');
  press('KeyO');
  assert.equal(settingsAreUp(), true, 'back to the settings, not out to the title');
  assert.equal(rackIsUp(), false);
  assert.equal(game.screen.settingsRows.findIndex((row) => row.chosen), doorRow(),
    'the settings cursor came back to the door it was walked to - it was never moved');
  press('KeyO');
  assert.equal(settingsAreUp(), false, 'and the second O closes the settings themselves');
});

test('the rack owns the screen it is put up on, like the settings it came from', async () => {
  shippedAgain();
  await game.resetToTitle(61);
  frames(3);
  openRack();
  press('Space');
  press('Digit1');
  assert.equal(game.stats().state, game.STATE.START, 'nothing launched and nothing was picked');
  assert.equal(rackIsUp(), true, 'and the rack is still up');
  closePanels();

  // Over a run that is flying it is refused outright, exactly as the settings panel is.
  await game.resetToTitle(61);
  frames(3);
  press('Space');
  frames(20);
  assert.equal(game.stats().state, game.STATE.PLAY);
  press('KeyO');
  assert.equal(settingsAreUp(), false, 'no rack over a run that is being played');
  press('Escape');
  frames(2);
  assert.equal(game.stats().paused, true, 'a held run is a run a rack belongs over');
  openRack();
  assert.equal(rackIsUp(), true);
  closePanels();
  press('Escape');
  frames(2);
  await game.resetToTitle(61);
});

test('the cursor walks the rack and stops at both ends', async () => {
  shippedAgain();
  await heldRun();
  openRack();
  for (let i = 0; i < 20; i++) press('ArrowDown');
  assert.equal(chosenRow(), 12, 'the last row is the last place the cursor can be');
  assert.equal(keys().mute, 'M', 'and walking onto a row changes nothing about it');
  for (let i = 0; i < 20; i++) press('ArrowUp');
  assert.equal(chosenRow(), 0);
  assert.equal(keys().up, 'W', 'forty arrow presses and no key moved');
  letItGo();
});

// --- taking a key -------------------------------------------------------------

test('the right arrow asks the keyboard, and the next key is the new one', async () => {
  shippedAgain();
  await heldRun();
  openRack();
  askFor('up');
  assert.equal(game.screen.keysRows[0].chosen, true,
    'the row that is asking keeps its cursor - the amber is the cursor lit differently, not elsewhere');
  assert.match(game.screen.keysHint, /PRESS THE KEY YOU MEAN/,
    'the hint says what the keys mean now');

  press('KeyI');
  assert.equal(waitingRow(), -1, 'one key, one answer, and the asking is over');
  assert.equal(keys().up, 'I', 'the table moved');
  assert.equal(game.screen.keysRows[0].value, 'I', 'the row says so');
  assert.equal(codeFor('up'), 'KeyI', 'and so does the game that hears it');
  assert.equal(game.stats().keysUp, true, 'and the rack stays up to be read');

  // The proof the panel is not the whole story: the ship goes up on I and not on W.
  letItGo();
  game.key('KeyW', true);
  frames(20);
  game.key('KeyW', false);
  frames(30);
  assert.ok(Math.abs(ship.vy) < 1, 'W does nothing any more: vy is ' + ship.vy);

  game.key('KeyI', true);
  frames(20);
  assert.ok(ship.vy < -100, 'I flies the ship up: vy is ' + ship.vy);
  game.key('KeyI', false);
  frames(1);
});

test('the dash, the pause and the panels all answer their rebound keys', async () => {
  shippedAgain();
  await heldRun();
  openRack();
  askFor('dash');
  press('KeyJ');
  letItGo();
  assert.equal(keys().dash, 'J');
  ship.dashCd = 0;
  ship.dashLeft = 0;
  press('KeyJ');
  frames(2);
  assert.ok(ship.dashCd > 0, 'the dash answered the new key');
  press('Escape');
  frames(2);

  // ...the pause, on a run that is being held: the new key holds it and lets it go again, and `Esc`
  // still does both, which is the half of the deal the PAUSE row's own line promises.
  openRack();
  askFor('pause');
  press('KeyK');
  closePanels();
  assert.equal(keys().pause, 'K');
  assert.equal(game.stats().paused, true, 'rebinding the pause did not disturb the hold');
  press('KeyK');
  frames(2);
  assert.equal(game.stats().paused, false, 'K lets it go');
  press('KeyK');
  frames(2);
  assert.equal(game.stats().paused, true, 'and K holds it again - it is the pause now');
  press('Escape');
  frames(2);
  assert.equal(game.stats().paused, false, 'and Esc still does it, because Esc is not bindable');

  // ...and a panel: O is moved off, so O must stop opening it and the new key must open it instead.
  await heldRun();
  openRack();
  askFor('settings');
  press('KeyU');
  assert.equal(keys().settings, 'U');
  assert.equal(rackIsUp(), true, 'the rack is still up - the press was a rebinding, not a way out');
  press('KeyO');
  assert.equal(rackIsUp(), true, 'and O is nobody now, so the rack is still up');
  press('KeyU');
  assert.equal(rackIsUp(), false, 'U closes it, the way O used to');
  assert.equal(settingsAreUp(), true, 'back to the settings, which is where U is going next');
  press('KeyU');
  assert.equal(settingsAreUp(), false);
  shippedAgain();
  await game.resetToTitle(61);
});

test('a key that is already somebody else\'s moves them, and both rows say so', async () => {
  shippedAgain();
  await heldRun();
  openRack();
  askFor('dash');
  press('KeyH');                          // the hangar's key
  assert.equal(keys().dash, 'H');
  assert.equal(keys().hangar, 'SPACE', 'the hangar takes the key the dash just left');
  assert.equal(game.screen.keysRows[4].value, 'H');
  assert.equal(game.screen.keysRows[7].value, 'SPACE');
  assert.equal(game.text('titleKeysDash'), 'H', 'the title says it too');
  assert.equal(game.text('titleKeysHangar'), 'SPACE');
  letItGo();

  // And the swap is real at the other end: H dashes, and the hangar is on Space - so a press of H in a
  // fight is a dash and not a shop.
  ship.dashCd = 0;
  ship.dashLeft = 0;
  press('KeyH');
  frames(2);
  assert.ok(ship.dashCd > 0, 'H is the dash now');
  assert.equal(game.screen.hangarHidden, true, 'and it did not open the hangar');
  shippedAgain();
});

test('a key the game cannot take is refused, and the row keeps waiting', async () => {
  shippedAgain();
  await heldRun();
  openRack();
  askFor('reroll');
  const at = waitingRow();
  assert.equal(at, 11, 'the reroll row is the one waiting');
  press('F5');
  assert.equal(waitingRow(), at,
    'still waiting, because a function key is not a key a page can be given');
  press('Digit1');
  assert.equal(keys().reroll, 'R', 'a number is a card, not a binding');
  assert.equal(waitingRow(), at, 'and the row is still waiting');
  press('ArrowDown');
  assert.equal(waitingRow(), -1, 'moving the cursor gives up the asking');
  assert.equal(chosenRow(), 12, 'the cursor moved, and the row it left is unlit again');
  letItGo();
});

test('Escape leaves the row as it is and does not hold the run behind it', async () => {
  shippedAgain();
  await heldRun();
  openRack();
  askFor('left');
  press('Escape');
  assert.equal(waitingRow(), -1, 'the first thing Escape does is stop the asking');
  assert.equal(rackIsUp(), true, 'and it is the only thing it does: the rack is still up');
  assert.equal(game.stats().paused, true, 'the run is still held, not let go of');
  assert.equal(keys().left, 'A', 'and the row is exactly as it was');
  letItGo();
});

test('the left arrow puts the shipped key back', async () => {
  shippedAgain();
  await heldRun();
  openRack();
  askFor('codex');
  press('KeyV');
  assert.equal(keys().codex, 'V');
  press('ArrowLeft');                     // and put it back
  assert.equal(keys().codex, 'C', 'the shipped key, from one press');
  assert.equal(game.text('titleKeysCodex'), 'C', 'everywhere the page prints it');
  assert.equal(changedCount(), 0, 'and there is nothing moved left to remember');
  press('ArrowLeft');                     // again, on a row that is already shipped
  assert.equal(keys().codex, 'C', 'silent, because nothing moved');
  letItGo();
});

// --- what the page says, and what the next visit finds ------------------------

/**
 * Every place the page prints a key says the new one.
 *
 * Five lines on five different screens print the settings key, and three more print the dash, the
 * pause, the hangar, the codex, the mute, the daily launch and the reroll. A rebind that updated the
 * rack and forgot one of those lines would be a page lying to the one hand that cannot use the shipped
 * key - which is the whole reason the page reads the table at all (ui/screens.js `paintKeyWords`).
 */
test('every place the page prints a key says the new one', async () => {
  shippedAgain();
  await heldRun();
  openRack();
  askFor('reroll');
  press('KeyZ');
  assert.equal(game.text('winKeysReroll'), 'Z', 'the win card counts too');
  assert.equal(game.text('titleKeysFly'), 'W A S D', 'and a row nobody moved still says its own');
  press('ArrowLeft');
  assert.equal(game.text('winKeysReroll'), 'R', 'putting the row back puts the page back with it');

  askFor('settings');
  press('KeyU');
  assert.equal(keys().settings, 'U');
  const labels = ['titleKeysSettings', 'hangarKeysSettings', 'codexKeysSettings',
    'settingsKeysClose', 'keysKeysBack', 'pauseKeysSettings', 'overKeysSettings'];
  for (const id of labels) assert.equal(game.text(id), 'U', id + ' still says O');

  // And the new key owns the panel from here on: U closes the rack onto the settings, and closes those
  // in turn - while the old O is nothing at all.
  assert.equal(rackIsUp(), true, 'the press was a rebinding, not a way out');
  press('KeyO');
  assert.equal(rackIsUp(), true, 'O is nobody now');
  press('KeyU');
  assert.equal(rackIsUp(), false, 'U closes the rack onto the settings it came from');
  assert.equal(settingsAreUp(), true);
  press('KeyU');
  assert.equal(settingsAreUp(), false, 'and closes the settings too, the way O used to do both');

  // Back the way a player goes back, so no later test inherits a panel nobody can open.
  await heldRun();
  press('KeyU');
  const at = game.screen.settingsRows.findIndex((row) => row.name === 'KEYS');
  for (let i = 0; i < at; i++) press('ArrowDown');
  press('ArrowRight');
  assert.equal(rackIsUp(), true, 'the rack opens on its rebound key, and the cursor starts at the top');
  goTo('settings');
  press('ArrowLeft');
  assert.equal(changedCount(), 0, 'and one press of the left arrow shipped it again');
  assert.equal(game.text('titleKeysSettings'), 'O', 'every line that prints it, on every screen');
  closePanels();
  await game.resetToTitle(61);
});

test('not one place the game prints a key is left behind', async () => {
  // Every control onto its own letter, so each line on the page has exactly one control it could be
  // saying - and then every line in ui/screens.js `KEY_LABELS` is asked what it says. A list that has
  // forgotten a line is how a game ends up with a title screen advertising a key nobody can bind and a
  // rack saying the truth, on the same page.
  shippedAgain();
  await heldRun();
  openRack();
  const letters = ['KeyB', 'KeyE', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'KeyN', 'KeyQ', 'KeyU', 'KeyV',
    'KeyX', 'KeyY', 'KeyZ'];
  assert.equal(letters.length, ROW_NAMES.length, 'one letter per row, and no row without one');
  for (let i = 0; i < ROW_NAMES.length; i++) {
    goTo(ROW_NAMES[i]);
    press('ArrowRight');
    press(letters[i]);
  }
  assert.equal(changedCount(), ROW_NAMES.length, 'thirteen rows, thirteen moved');
  assert.equal(rackIsUp(), true, 'and not one of those thirteen letters escaped into the game');

  for (const entry of KEY_LABELS) {
    assert.equal(game.text(entry[0]), wordsOf(entry[1]), entry[0] + ' says what the table says');
  }
  closePanels();
  shippedAgain();
  await game.resetToTitle(61);
});

test('the pause line names the key the pause is actually on', async () => {
  shippedAgain();
  await heldRun();
  assert.equal(game.screen.pauseHint, 'ESC OR P TO GO BACK TO THE RUN', 'as it ships');
  openRack();
  askFor('pause');
  press('KeyK');
  closePanels();
  assert.equal(game.screen.pauseHint, 'ESC OR K TO GO BACK TO THE RUN', 'and after one press of K');
  letItGo();
});

test('a moved key is kept for the next visit, and a save full of nonsense ships', async () => {
  shippedAgain();
  await heldRun();
  openRack();
  askFor('mute');
  press('KeyB');
  assert.equal(keys().mute, 'B');
  const saved = JSON.parse(game.storage[SAVE_KEY]);
  assert.deepEqual(saved.keys, { binds: { mute: 'KeyB' } }, 'one row moved, one row written');

  // The next visit: the same storage, read again from the top (which is all a reload can be), and the
  // page written from it the way a boot writes it (ui/screens.js `paintKeyWords`).
  loadFromSave();
  paintKeyWords();
  assert.equal(keys().mute, 'B', 'the visit after this one hears B too');
  assert.equal(game.text('titleKeysMute'), 'B', 'and prints it');

  // And a save that names codes this build will not take: those rows ship, the rest of the document is
  // untouched, and the game still boots.
  game.storage[SAVE_KEY] = JSON.stringify({
    version: 1, keys: { binds: { mute: 'F7', up: 'KeyM', nonsense: 'KeyQ' } },
  });
  loadFromSave();
  assert.equal(keys().up, 'M', 'the good row came through');
  assert.equal(keys().mute, 'M', 'and the function key left its row alone');
  assert.equal(changedCount(), 1, 'the control nobody asked about was not made into a control');
  shippedAgain();
  await game.resetToTitle(61);
});
