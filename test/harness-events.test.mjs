// The harness sends a key the way a browser does (session 127's unfinished half; `key-names.test.mjs`
// owns what the game does with what it hears).
//
// A key event arrives with two names for one press: `code`, the place on the keyboard, and `key`, what
// that key prints. The game hears the printing first and the place second, because the key the player is
// looking at is the one they pressed. Until session 132 the stub sent only the place - so the half of the
// keyboard every player actually uses was exercised by exactly one test file, and the two thousand others
// were quietly reading the fallback. This file is the harness's own promise: the events it sends carry
// both names, they carry them the way a browser spells them, and where the two disagree with the game's
// keymap the disagreement is a bug in one of them rather than a difference nobody noticed.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame, printedFor, printedCodes } from '../tools/headless/harness.js';
import { ACTIONS, bindable, codeFor, codeForWord, wordFor } from '../src/core/keymap.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const SEED = 4029;

const game = await bootGame({ root: ROOT, seed: SEED, width: 1280, height: 720 });

function frames(n) {
  for (let i = 0; i < n; i++) game.step(FRAME);
}

/**
 * Press a key and hand back the event the stub window was sent.
 *
 * The stub's window is a real listener list - `src/input/keyboard.js` is listening on it - and a test may
 * listen beside it. That is the only way to ask what the harness actually put on the wire rather than what
 * it means to.
 */
function pressAndCatch(code, extra) {
  const windowObj = globalThis.window;
  const seen = [];
  const down = (event) => seen.push(event);
  const up = (event) => seen.push(event);
  windowObj.addEventListener('keydown', down);
  windowObj.addEventListener('keyup', up);
  game.key(code, true, extra);
  game.key(code, false, extra);
  windowObj.removeEventListener('keydown', down);
  windowObj.removeEventListener('keyup', up);
  return seen;
}

test('a key event carries both names, the way a browser sends it', () => {
  const seen = pressAndCatch('KeyD');
  assert.equal(seen.length, 2, 'a press and a release');
  for (const event of seen) {
    assert.equal(event.code, 'KeyD', 'the place it was pressed on');
    assert.equal(event.key, 'd', 'and what that key prints');
  }
});

test('a chord carries its modifier beside both names', () => {
  const seen = pressAndCatch('Digit2', { shiftKey: true });
  assert.equal(seen[0].shiftKey, true, 'the modifier is on the event, which is what the game reads for a chord');
  assert.equal(seen[0].code, 'Digit2', 'and the two names are still there beside it');
  assert.equal(seen[0].key, '2', 'printed as the key prints it, unshifted');
});

test('the harness refuses to print a place no keyboard has', () => {
  // Silence here would be worse than an error: a test would be pressing a key no browser could send and
  // the game would be answering it for reasons nobody could read back.
  assert.throws(() => game.key('Numpad99', true), /no printing for a key called Numpad99/);
});

test('the harness and the keymap agree about every place on the keyboard', () => {
  // The important one. For every place the game can be told to answer, the word the harness prints for it
  // has to map back to that same place - otherwise the whole suite is exercising the *fallback* half of the
  // keyboard and calling it the primary one, which is precisely how session 127's bug stayed invisible.
  const codes = printedCodes();
  let checked = 0;
  for (const code of codes) {
    if (!bindable(code)) continue;
    const word = printedFor(code);
    assert.equal(codeForWord(word), code,
      'a browser prints ' + JSON.stringify(word) + ' for ' + code + ' and the game cannot find that place');
    checked++;
  }
  assert.ok(checked >= 30, 'and that covers a real keyboard, not a handful of keys: ' + checked + ' places');
});

test('every action the game offers is reachable through the name a browser prints', () => {
  // The same promise from the other end: each of the game's own bindings, heard as a printed word.
  for (const action of ACTIONS) {
    const code = codeFor(action.id);
    assert.ok(bindable(code), action.id + ' is bound to a place a keyboard has');
    const word = printedFor(code);
    assert.equal(codeForWord(word), code, action.id + ' answers to ' + JSON.stringify(word) + ' on the wire');
    // The game's own word for a key is a legend for eyes (`SPACE`, `ESC`), not the wire's, so the two are
    // only compared where the wire prints a character: a letter, a digit, a piece of punctuation.
    if (/^[A-Za-z0-9]$/.test(word)) {
      assert.equal(wordFor(code).toLowerCase(), word.toLowerCase(),
        action.id + ' is spelled the same by the game and by the browser');
    }
  }
});
