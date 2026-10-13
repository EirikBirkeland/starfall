// The same three lines, for the hand that arrived with a keyboard (PLAN section 6).
//
// The other file holds what a finger is shown. What this one holds is that the change did not touch this
// visit at all: the three lines say exactly what `index.html` ships, both clauses are on the page, and the
// words the code writes for a keyboard are the words the markup already had - which is the only reason a
// visit with a mouse cannot tell that `paintLaunchHints` ran.
//
// Its own file because a process boots one game (the modules hold the world) and this boot must have no
// fingers to report (tools/headless/harness.js `touch`).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const MARKUP = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const game = await bootGame({ root: ROOT, seed: 4042, width: 1280, height: 720 });

/** The words the page ships inside one element - what a browser would show before the game says anything. */
function shipped(id) {
  const found = new RegExp('id="' + id + '">([^<]*)<').exec(MARKUP);
  assert.ok(found, 'index.html has no #' + id + ' to read its shipped words from');
  // The page writes its middle dot as an entity; the browser would have decoded it by the time anybody read.
  return found[1].replace(/&#(\d+);/g, (whole, code) => String.fromCharCode(Number(code)));
}

test('a keyboard visit reads the page exactly as it was written', () => {
  const lines = [
    ['titleHintLaunch', 'titleHintKeys'],
    ['overHintLaunch', 'overHintKeys'],
    ['winHintLaunch', 'winHintKeys'],
  ];
  for (const [launch, keys] of lines) {
    // The one promise that matters for this hand: the game writes the words the page already had, so a
    // visit with a mouse cannot tell that `paintLaunchHints` ran at all.
    assert.equal(game.text(launch), shipped(launch), '#' + launch + ' was rewritten under a hand that has keys');
    assert.equal(game.classes(launch).includes('gone'), false, '#' + launch + ' was put away');
    assert.equal(game.classes(keys).includes('gone'), false, '#' + keys + ' was put away');
  }

  // Read back as a visitor reads them, clause against clause: the letter, the separator, the key.
  assert.equal(game.text('titleHintLaunch') + shipped('titleHintKeys') + game.text('titleKeysToday'),
    'PRESS SPACE OR CLICK TO LAUNCH \u00b7 T');
  assert.equal(game.text('overHintLaunch') + shipped('overHintKeys') + game.text('overKeysSettings'),
    'PRESS SPACE OR CLICK TO RESTART \u00b7 O');
  assert.equal(game.text('winHintLaunch') + shipped('winHintKeys') + game.text('winKeysReroll'),
    'PRESS SPACE TO KEEP FLYING \u00b7 R');
});

test('each of the three lines is still two clauses in the page, so the thumb shape cannot be lost', () => {
  // Flatten them back into one sentence and the finger's version has nowhere to go: the separator lives
  // inside the key clause precisely so that putting the clause away takes the separator with it.
  for (const id of ['titleHintLaunch', 'titleHintKeys', 'overHintLaunch', 'overHintKeys',
    'winHintLaunch', 'winHintKeys']) {
    assert.ok(MARKUP.includes('id="' + id + '"'), '#' + id + ' has gone out of the page');
  }
  assert.match(MARKUP, /\.hint \.gone \{ display: none; \}/, 'and nothing puts a clause away any more');
});

test('the letters in the clauses are the live ones, as everywhere else on the page', () => {
  assert.equal(game.text('titleKeysToday'), 'T');
  assert.equal(game.text('overKeysSettings'), 'O');
  assert.equal(game.text('winKeysReroll'), 'R');
});

