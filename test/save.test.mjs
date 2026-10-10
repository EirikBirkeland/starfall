// The save document: what the game remembers between visits (core/save.js).
//
// PLAN section 3.7 gives milestone 8 a lot to remember and this is where all of it will live, so
// the promises this file holds are the three that make a shared, permanent, player-visible blob
// safe to build on: it is **versioned** (an older document is completed, a newer one is left
// alone), it is **validated on the way in** (anything that is not the right kind of thing counts
// as not-stored), and **a read never destroys** (only a caller who asked for a new value writes).
//
// The store reads `window.localStorage` on every call, so the whole suite runs against a fake
// window swapped in per test - no browser, no harness, and no cached copy of the document to
// get out of sync with what is in storage.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SAVE_KEY, SAVE_VERSION, freshSave, remember, saveIsWritable, saveProblem, section,
} from '../src/core/save.js';

const BEST_DEFAULTS = { best: 0 };
const AUDIO_DEFAULTS = { music: 10, effects: 10, muted: false };
const LEGACY_BEST_KEY = 'starfall.best';

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

/** What is in storage under the save key, as text - exactly what a player's browser holds. */
function text(store) { return store[SAVE_KEY]; }

function parsed(store) { return JSON.parse(store[SAVE_KEY]); }

/** A stored document, written the way the game writes one. */
function stored(fields) {
  return { [SAVE_KEY]: JSON.stringify(Object.assign({ version: SAVE_VERSION }, fields)) };
}

test('nothing stored is a fresh save, and the defaults are the caller\'s', () => {
  browser({});
  assert.equal(saveProblem(), 'nothing stored');
  assert.deepEqual(section('score', BEST_DEFAULTS), { best: 0 });
  assert.deepEqual(section('audio', AUDIO_DEFAULTS), AUDIO_DEFAULTS);
  assert.deepEqual(freshSave().version, SAVE_VERSION, 'a fresh document carries the version');
  assert.deepEqual(freshSave().audio, {}, '...and remembers nothing in any of its sections');
});

test('a page with no storage at all is still a page the game can be played on', () => {
  delete globalThis.window;                       // a Node tool, not a browser
  assert.equal(saveProblem(), 'nothing stored');
  assert.deepEqual(section('score', BEST_DEFAULTS), { best: 0 });
  assert.equal(remember('score', { best: 10 }), false, 'nothing was written, and it says so');

  globalThis.window = { get localStorage() { throw new Error('storage is blocked'); } };
  assert.deepEqual(section('audio', AUDIO_DEFAULTS), AUDIO_DEFAULTS, 'a throwing localStorage');
  assert.equal(remember('audio', { muted: true }), false);
});

test('the one number an older release remembered is picked up off the floor', () => {
  browser({ [LEGACY_BEST_KEY]: '12345' });
  assert.equal(section('score', BEST_DEFAULTS).best, 12345, 'starfall.best is the migration in');
  assert.equal(section('audio', AUDIO_DEFAULTS).music, 10, 'and nothing else arrives with it');

  browser({ [LEGACY_BEST_KEY]: 'not a score' });
  assert.equal(section('score', BEST_DEFAULTS).best, 0, 'garbage in the old key is no score');

  browser({ [LEGACY_BEST_KEY]: '-40' });
  assert.equal(section('score', BEST_DEFAULTS).best, 0, 'and a negative one is no score either');
});

test('a write is a versioned document, and the same values always write the same text', () => {
  const store = browser({});
  assert.equal(remember('score', { best: 500 }), true);
  const written = text(store);
  assert.deepEqual(JSON.parse(written), {
    version: SAVE_VERSION, score: { best: 500 }, meta: {}, hangar: {}, audio: {},
  });

  assert.equal(remember('audio', { music: 3, effects: 3, muted: false }), true);
  assert.equal(section('score', BEST_DEFAULTS).best, 500, 'a second write did not lose the first');
  assert.equal(section('audio', AUDIO_DEFAULTS).music, 3);

  const both = text(store);
  remember('audio', { music: 3, effects: 3, muted: false });
  assert.equal(text(store), both, 'the same values again is the same text, byte for byte');

  const keys = Object.keys(parsed(store));
  assert.deepEqual(keys, ['version', 'score', 'meta', 'hangar', 'audio'],
    'the document is written in schema order');
});

test('the old plain best key is kept up to date, for releases that still read it', () => {
  const store = browser({});
  remember('score', { best: 4321 });
  assert.equal(store[LEGACY_BEST_KEY], '4321');

  remember('audio', { muted: true });
  assert.equal(store[LEGACY_BEST_KEY], '4321', 'a write that has no best does not clear the mirror');

  const before = browser({});
  remember('audio', { muted: true });
  assert.equal(before[LEGACY_BEST_KEY], undefined, 'and with no best remembered there is no mirror');
});

test('two features share one document without losing each other', () => {
  const store = browser({});
  remember('score', { best: 70 });
  remember('audio', { music: 8 });
  remember('score', { best: 80 });
  assert.deepEqual(section('score', BEST_DEFAULTS), { best: 80 });
  assert.deepEqual(section('audio', AUDIO_DEFAULTS), { music: 8, effects: 10, muted: false });
  assert.deepEqual(parsed(store).audio, { music: 8 }, 'a section keeps only what was given to it');
});

test('a document that is not a document falls back to a fresh save and says what was wrong', () => {
  const cases = [
    [undefined, 'nothing stored'],
    ['', 'nothing stored'],
    ['{', 'not JSON'],
    ['17', 'not an object'],
    ['"best"', 'not an object'],
    ['[1,2]', 'not an object'],
    ['null', 'not an object'],
    ['{}', 'no version'],
    ['{"version":0}', 'no version'],
    ['{"version":"one"}', 'no version'],
    ['{"version":1.5}', 'no version'],
  ];
  for (const [raw, problem] of cases) {
    const store = browser(raw === undefined ? {} : { [SAVE_KEY]: raw });
    assert.equal(saveProblem(), problem, JSON.stringify(raw));
    assert.deepEqual(section('score', BEST_DEFAULTS), { best: 0 }, JSON.stringify(raw));
    assert.deepEqual(section('audio', AUDIO_DEFAULTS), AUDIO_DEFAULTS, JSON.stringify(raw));
    assert.equal(text(store), raw, 'a read leaves what it found exactly where it was');
  }
});

test('a field of the wrong kind is treated as not stored', () => {
  browser(stored({
    score: { best: 'lots' },
    audio: { music: 'loud', effects: 2.5, muted: 'yes' },
  }));
  assert.equal(saveProblem(), '', 'the document itself is fine');
  assert.equal(section('score', BEST_DEFAULTS).best, 0, 'a best that is a word is no best');
  assert.equal(section('audio', AUDIO_DEFAULTS).music, 10);
  assert.equal(section('audio', AUDIO_DEFAULTS).effects, 10, 'a fractional slider is no slider');
  assert.equal(section('audio', AUDIO_DEFAULTS).muted, false);
});

test('one bad field does not take its neighbours with it', () => {
  browser(stored({ score: { best: 900 }, audio: { music: 4, effects: 'loud', muted: true } }));
  assert.equal(section('score', BEST_DEFAULTS).best, 900);
  const audio = section('audio', AUDIO_DEFAULTS);
  assert.equal(audio.music, 4, 'the slider that is a number is kept');
  assert.equal(audio.effects, 10, 'the one that is a word is not');
  assert.equal(audio.muted, true);
});

test('a remembered zero and a remembered no are answers, not absences', () => {
  browser(stored({ score: { best: 0 }, audio: { music: 0, effects: 0, muted: false } }));
  assert.equal(section('score', { best: 500 }).best, 0, 'a best of zero beats a default of 500');
  const audio = section('audio', { music: 10, effects: 10, muted: true });
  assert.deepEqual(audio, { music: 0, effects: 0, muted: false }, 'a slider shut on purpose stays shut');
});

test('a remembered set of names is a set: read back deduped, sorted, and with its rubbish dropped', () => {
  // The kind game/hangar.js keeps its purchases in (PLAN 3.7). A set is the one shape where the
  // wreck is an entry rather than a whole field, so a bad entry is dropped and its neighbours are
  // kept - one mangled line in a half-written page must not cost a player every ship they own - and
  // what is left comes out sorted, so the same rack always writes the same text.
  const BOUGHT = { ships: [] };
  browser(stored({
    hangar: { ships: ['volt', 'bulwark', 'volt', 3, '', 'VOLT', '##', 'x'.repeat(40), 'brood'] },
  }));
  assert.equal(saveProblem(), '', 'the document itself is fine');
  assert.deepEqual(section('hangar', BOUGHT).ships, ['brood', 'bulwark', 'volt']);

  const store = browser({});
  remember('hangar', { ships: ['needle', 'bulwark'] });
  assert.deepEqual(parsed(store).hangar.ships, ['bulwark', 'needle'], 'a write sorts on the way in');
  assert.deepEqual(section('hangar', BOUGHT).ships, ['bulwark', 'needle']);
});

test('a set that is not a set is not stored, and an empty one is an answer', () => {
  const BOUGHT = { ships: ['wisp'] };
  // Not a list at all, and a list with nothing a name is any more: both are the field being the
  // wrong kind, so the feature falls back to its own default like any other wreck.
  for (const bad of ['bulwark', 4, true, { a: 1 }, ['x'.repeat(40)], [1, 2, 3]]) {
    browser(stored({ hangar: { ships: bad } }));
    assert.deepEqual(section('hangar', BOUGHT).ships, ['wisp'], JSON.stringify(bad));
  }
  // A list longer than the game has things to put in it is not the game's list either.
  const tooMany = [];
  for (let i = 0; i < 40; i++) tooMany.push('ship' + i);
  browser(stored({ hangar: { ships: tooMany } }));
  assert.deepEqual(section('hangar', BOUGHT).ships, ['wisp'], 'forty ships is not a rack');

  // But a list with nothing in it is the plainest answer there is: nothing bought yet.
  browser(stored({ hangar: { ships: [] } }));
  assert.deepEqual(section('hangar', BOUGHT).ships, [], 'a first visit remembers nothing, on purpose');

  assert.throws(() => remember('hangar', { ships: 'volt' }), /refusing to remember hangar.ships/);
  assert.throws(() => section('hangar', { ships: 'volt' }), /cannot default hangar.ships/);
});

test('a number out of all reason is not remembered', () => {
  browser(stored({ score: { best: 1e30 }, audio: { music: 99999 } }));
  assert.equal(section('score', BEST_DEFAULTS).best, 0, 'a trillion-point best is a corrupt number');
  assert.equal(section('audio', AUDIO_DEFAULTS).music, 10, 'and a slider with no such position too');
});

test('a remembered set of names reads the names it can and sorts what is left', () => {
  // game/hangar.js keeps the ships this save bought as a list of ids (PLAN 3.7), and a list is a
  // new shape for the store: the wreck is one entry now, not a whole field, so an entry that is not
  // a name is dropped and its neighbours are kept - one bad line in a half-written page should not
  // cost a player every ship they own.
  const HANGAR = { ships: [] };
  browser(stored({
    hangar: { ships: ['volt', 'bulwark', 'volt', 3, '', '##', null, 'x'.repeat(40), 'brood'] },
  }));
  assert.equal(saveProblem(), '', 'the document itself is fine');
  // Sorted, because the same set of ships has to write the same text every time, whoever bought
  // them in whichever order.
  assert.deepEqual(section('hangar', HANGAR).ships, ['brood', 'bulwark', 'volt']);

  assert.deepEqual(section('hangar', { ships: ['wisp'] }).ships, ['brood', 'bulwark', 'volt'],
    'a default for a key that is there is not applied');
});

test('a set that is not a set is treated as not stored, and an empty one is an answer', () => {
  const HANGAR = { ships: ['wisp'] };
  for (const bad of ['bulwark', 4, true, { a: 1 }, ['x'.repeat(40)], [1, 2, 3]]) {
    browser(stored({ hangar: { ships: bad } }));
    assert.deepEqual(section('hangar', HANGAR).ships, ['wisp'], JSON.stringify(bad));
  }
  // A list longer than the game has things to put in it is not the game's list.
  const tooMany = [];
  for (let i = 0; i < 40; i++) tooMany.push('ship' + i);
  browser(stored({ hangar: { ships: tooMany } }));
  assert.deepEqual(section('hangar', HANGAR).ships, ['wisp'], 'forty ships is not a rack');

  // But a list with nothing in it is the plainest answer there is: nothing bought yet.
  browser(stored({ hangar: { ships: [] } }));
  assert.deepEqual(section('hangar', HANGAR).ships, [], 'a first visit remembers nothing, on purpose');

  const store = browser({});
  assert.equal(remember('hangar', { ships: ['volt', 'bulwark'] }), true);
  assert.deepEqual(parsed(store).hangar.ships, ['bulwark', 'volt'], 'a write sorts on the way in');
  assert.throws(() => remember('hangar', { ships: 'volt' }), /refusing to remember hangar.ships/);
  assert.throws(() => section('hangar', { ships: 'volt' }), /cannot default hangar.ships/);
});

test('fields this build has never heard of are dropped, and stay dropped', () => {
  const store = browser(stored({
    stardust: 900,
    score: { best: 12, rank: 'gold' },
    audio: { music: 6, loudness: 'high' },
  }));
  assert.equal(section('score', BEST_DEFAULTS).best, 12, 'a known key next to an unknown one is read');
  assert.equal(section('audio', AUDIO_DEFAULTS).music, 6);

  remember('score', { best: 13 });
  const written = parsed(store);
  assert.deepEqual(written.score, { best: 13 }, 'the unknown key did not ride along into the write');
  assert.deepEqual(written.audio, { music: 6 });
  assert.equal('stardust' in written, false);
});

test('a document from a newer version is read, and never overwritten', () => {
  const future = JSON.stringify({
    version: SAVE_VERSION + 4,
    score: { best: 7777 },
    audio: { music: 3, muted: true },
    codex: { warden: 'met' },
  });
  const store = browser({ [SAVE_KEY]: future });
  assert.equal(saveProblem(), 'written by version ' + (SAVE_VERSION + 4));
  assert.equal(saveIsWritable(), false);
  assert.equal(section('score', BEST_DEFAULTS).best, 7777, 'the fields this build knows are still its own');
  assert.equal(section('audio', AUDIO_DEFAULTS).music, 3);
  assert.equal(section('audio', AUDIO_DEFAULTS).muted, true);

  assert.equal(remember('score', { best: 5 }), false, 'this visit may not write over it');
  assert.equal(remember('audio', { music: 9 }), false);
  assert.equal(text(store), future, 'the newer document is left exactly as it was found');
});

test('a browser that refuses to store is not a game that cannot be played', () => {
  const store = browser({});
  globalThis.window.localStorage.setItem = () => { throw new Error('quota'); };
  assert.equal(remember('score', { best: 20 }), false);
  assert.equal(store[SAVE_KEY], undefined);
  assert.equal(section('score', BEST_DEFAULTS).best, 0, 'and the read still answers from defaults');
});

test('a caller that asks the document for something it does not hold is told so', () => {
  browser({});
  assert.throws(() => section('stardust', { amount: 0 }), /has no stardust section/);
  assert.throws(() => section('score', { hull: 3 }), /does not remember score.hull/);
  assert.throws(() => section('score', { best: 'nothing' }), /cannot default score.best/);
  assert.throws(() => remember('nope', { a: 1 }), /has no nope section/);
  assert.throws(() => remember('audio', { hull: 1 }), /does not remember audio.hull/);
  assert.throws(() => remember('audio', { music: NaN }), /refusing to remember audio.music/);
  assert.throws(() => remember('score', { best: -1 }), /refusing to remember score.best/);
});
