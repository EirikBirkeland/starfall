// The keymap (core/keymap.js): the table of controls a player can move, the codes they answer, and
// what happens to a table when a hand moves one of them.
//
// The three promises in the module's own header are what this file is built around. **One key, one
// action** - so a rebinding that takes a held key swaps the two, and no control is ever left with no
// key at all. **A row can always be put back** - so every control knows its shipped key and a save can
// be taken away. And **what the panel prints is what the game hears** - so every read of a key goes
// through this table, which is why the words a test expects are the table's own `wordsOf` and never a
// string typed out here.
//
// The store is faked the same way test/save.test.mjs fakes it: `core/save.js` reads `window.localStorage`
// on every call, so a plain object on `globalThis.window` is the whole browser this needs. The panel
// and the keys that drive it are test/keys.test.mjs, which drives the real game.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SAVE_KEY } from '../src/core/save.js';
import {
  ACTIONS, loadFromSave, tableAsWords, codeFor, actionFor, bindable, wordFor, wordsOf,
  rebind, restore, changedCount,
} from '../src/core/keymap.js';

/** The browser the store expects: a map of strings, and the one member of localStorage it uses. */
function browser(initial) {
  const store = Object.assign({}, initial);
  globalThis.window = {
    localStorage: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); },
    },
  };
  return store;
}

/** Start on the shipped table: no save at all, and the table read from it. */
function shipped() {
  browser({});
  return loadFromSave();
}

/** Start as a visit that had already moved things: `binds` is what the last one left in the save. */
function leftThemAt(binds) {
  browser({ [SAVE_KEY]: JSON.stringify({ version: 1, keys: { binds: binds } }) });
  return loadFromSave();
}

/** What the save holds for the keymap now: the moved rows and nothing else. */
function storedBinds() {
  const doc = JSON.parse(globalThis.window.localStorage.getItem(SAVE_KEY) || '{}');
  return (doc.keys === undefined || doc.keys.binds === undefined) ? {} : doc.keys.binds;
}

const ids = ACTIONS.map((action) => action.id);

// --- the table itself ----------------------------------------------------------

test('every control has a name, a line, and a shipped key the game can print', () => {
  assert.ok(ACTIONS.length >= 12, 'the set a hand on another layout needs: ' + ids.join(', '));
  assert.equal(new Set(ids).size, ids.length, 'no control id twice');
  for (const action of ACTIONS) {
    assert.match(action.id, /^[a-z][a-z0-9_-]{0,31}$/, action.id + ' is a name the save will hold');
    assert.ok(action.name.length > 0 && action.says.length > 0, action.id + ' says what it is');
    assert.equal(bindable(action.shipped), true,
      action.id + ' ships on a key the game would let a hand choose (' + action.shipped + ')');
    assert.notEqual(wordFor(action.shipped), action.shipped,
      action.id + "'s shipped key has a spelling of its own, not its code name");
  }
});

test('no two controls ship on the same key, and the four movement keys are neighbours', () => {
  const shipped = ACTIONS.map((action) => action.shipped);
  assert.equal(new Set(shipped).size, shipped.length, 'one key, one meaning, as it ships');
  assert.deepEqual(
    ['up', 'down', 'left', 'right'].map((id) => codeFor(id)),
    ['KeyW', 'KeyS', 'KeyA', 'KeyD'],
    'WASD as this build ships it - the reference every rebinding test starts from');
});

test('an unknown control is an error, not a silent nothing', () => {
  shipped();
  assert.throws(() => codeFor('sidestep'), /no control called sidestep/);
  assert.throws(() => rebind('sidestep', 'KeyQ'), /no control called sidestep/);
  assert.throws(() => restore('sidestep'), /no control called sidestep/);
  assert.equal(actionFor('KeyQ'), '', 'and a key nothing answers is answered with an empty name');
});

// --- which keys a hand may name ------------------------------------------------

test('a key a hand can name is a letter, the space bar, or a punctuation key', () => {
  const yes = ['KeyQ', 'KeyZ', 'Space', 'Comma', 'Period', 'Slash', 'Semicolon', 'Quote',
    'BracketLeft', 'BracketRight', 'Backslash', 'Minus', 'Equal', 'Backquote'];
  for (const code of yes) assert.equal(bindable(code), true, code + ' can be taken');

  // The refusals each have a reason of their own, and every one of them is a key the game would rather
  // not lose: the numbers answer cards and ships, Escape cancels a rebinding and always holds the run,
  // a browser does not give a function key to a page, and the arrows are a panel's cursor.
  const no = ['Digit1', 'Numpad9', 'Escape', 'F3', 'F5', 'ArrowUp', 'ShiftLeft', 'ControlLeft',
    'Tab', 'Enter', 'Home', '', 'nothing', undefined, 42];
  for (const code of no) assert.equal(bindable(code), false, code + ' cannot be taken');
});

test('a key is spelled the way the glass spells it', () => {
  assert.equal(wordFor('KeyW'), 'W');
  assert.equal(wordFor('Space'), 'SPACE');
  assert.equal(wordFor('BracketLeft'), '[');
  assert.equal(wordFor('Minus'), '-');
  // Something the table cannot name is said as it came in rather than guessed at.
  assert.equal(wordFor('WhateverTheBrowserSent'), 'WhateverTheBrowserSent');
  assert.equal(wordsOf(['up', 'left', 'down', 'right']), 'W A S D', 'one call writes four keys');
  assert.equal(wordsOf('dash'), 'SPACE', 'and one control does not need a list');
});

// --- reading the save ---------------------------------------------------------

test('nothing stored is the shipped table, and nothing is written', () => {
  const table = shipped();
  assert.deepEqual(table, {
    up: 'W', down: 'S', left: 'A', right: 'D', dash: 'SPACE', pause: 'P', giveup: 'G',
    hangar: 'H', codex: 'C', settings: 'O', daily: 'T', challenge: 'X', reroll: 'R', mute: 'M',
  }, 'the whole table as it ships, in the words a panel prints');
  assert.equal(changedCount(), 0, 'and nothing has been moved');
  assert.deepEqual(storedBinds(), {}, 'reading the shipped table wrote nothing to the save');
});

test('a visit that had moved keys starts where it left them', () => {
  const table = leftThemAt({ up: 'KeyI', dash: 'KeyJ' });
  assert.equal(table.up, 'I');
  assert.equal(table.dash, 'J');
  assert.equal(codeFor('up'), 'KeyI', 'and the game hears it, not just the panel');
  assert.equal(changedCount(), 2);
});

test('a stored code this build would not take is no binding, and its neighbours are kept', () => {
  const table = leftThemAt({
    up: 'F5',            // a key no browser gives a page
    down: 'lower case',  // not a code at all
    left: 42,            // not even a string
    right: 'KeyK',       // and one that is fine
  });
  assert.equal(table.up, 'W', 'a function key from a build that has been and gone: the row ships');
  assert.equal(table.down, 'S');
  assert.equal(table.left, 'A');
  assert.equal(table.right, 'K', 'the one good row came through');
  assert.equal(changedCount(), 1);
});

// --- moving a key -------------------------------------------------------------

test('taking a key for a control writes it, and only it, to the save', () => {
  shipped();
  const moved = rebind('up', 'KeyI');
  assert.deepEqual(moved, { took: 'up', gave: '' }, 'nobody was standing on I');
  assert.equal(codeFor('up'), 'KeyI');
  assert.equal(actionFor('KeyI'), 'up', 'and the reverse index knows it too');
  assert.deepEqual(storedBinds(), { up: 'KeyI' }, 'the shipped rows are not written down');
  assert.equal(changedCount(), 1);
});

test('a key can only be in one place, so the control that had it takes the one just left', () => {
  shipped();
  const moved = rebind('up', 'KeyM');       // mute's key, and up's is W
  assert.deepEqual(moved, { took: 'up', gave: 'mute' });
  assert.equal(codeFor('up'), 'KeyM');
  assert.equal(codeFor('mute'), 'KeyW', 'a swap, not a theft: nothing is left with no key');
  assert.equal(actionFor('KeyW'), 'mute');
  assert.equal(actionFor('KeyM'), 'up');
  assert.equal(changedCount(), 2, 'both rows moved and both are remembered');
  assert.deepEqual(storedBinds(), { mute: 'KeyW', up: 'KeyM' });
});

test('the key a row already wears is refused, and writes nothing', () => {
  shipped();
  assert.equal(rebind('dash', 'Space'), null, 'Space is already the dash');
  assert.equal(changedCount(), 0);
  assert.deepEqual(storedBinds(), {});
  assert.equal(codeFor('dash'), 'Space');
});

test('a key the game cannot name is refused and leaves the table alone', () => {
  shipped();
  assert.equal(rebind('pause', 'F5'), null);
  assert.equal(rebind('pause', ''), null);
  assert.equal(codeFor('pause'), 'KeyP');
  assert.equal(changedCount(), 0);
});

test('a row can be put back, and putting back a row that is already shipped says so', () => {
  shipped();
  assert.equal(rebind('codex', 'Keyb'), null, 'a lower-case code is not a code, so nothing moved');
  assert.equal(codeFor('codex'), 'KeyC');
  assert.equal(restore('codex'), false, 'and there was nothing to put back');

  rebind('codex', 'KeyV');
  assert.equal(codeFor('codex'), 'KeyV');
  assert.equal(restore('codex'), true);
  assert.equal(codeFor('codex'), 'KeyC', 'the shipped key, exactly');
  assert.equal(changedCount(), 0);
  assert.deepEqual(storedBinds(), {}, 'and the save is empty again, because there is nothing to keep');
});

test('putting one half of a swap back puts the other half back too', () => {
  // The case a plain "write the shipped code back" would get wrong: after up and mute have traded keys,
  // W belongs to mute, and restoring UP without a swap would put two controls on W at once.
  shipped();
  rebind('up', 'KeyM');
  assert.equal(codeFor('mute'), 'KeyW');
  assert.equal(restore('up'), true);
  assert.equal(codeFor('up'), 'KeyW', 'up is back on W, which is what the press asked for');
  assert.equal(codeFor('mute'), 'KeyM', 'and mute was holding W, so it went back to its own M');
  assert.equal(changedCount(), 0, 'one press undid the whole swap, and nothing is on two keys');
});

test('a whole table can be walked round and still be one key per control', () => {
  shipped();
  const before = tableAsWords();
  // The knot a person gets into: every key taken in turn, each one somebody else's. A swap keeps every
  // control on a key at every step, so there is no state a hand can reach that it cannot undo.
  for (const action of ACTIONS) rebind(action.id, 'KeyQ');
  const codes = ACTIONS.map((action) => codeFor(action.id));
  assert.equal(new Set(codes).size, codes.length, 'thirteen controls, thirteen keys');
  assert.equal(codes.indexOf(undefined), -1, 'and none of them lost its key');
  for (const action of ACTIONS) restore(action.id);
  assert.equal(changedCount(), 0);
  assert.deepEqual(tableAsWords(), before, 'the whole table back the way it came');
  assert.deepEqual(storedBinds(), {}, 'and nothing left in the save to remember the knot');
});
