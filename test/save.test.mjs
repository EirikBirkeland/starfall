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
const VIEW_DEFAULTS = { shake: 'full', flash: 'full', numbers: 'on', particles: 'all' };
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
    version: SAVE_VERSION, score: { best: 500 }, meta: {}, hangar: {}, codex: {},
    awards: {}, runs: {}, daily: {}, audio: {}, view: {}, assists: {}, tutorial: {}, keys: {},
  });

  assert.equal(remember('audio', { music: 3, effects: 3, muted: false }), true);
  assert.equal(remember('view', { shake: 'half', numbers: 'off' }), true);
  assert.equal(section('score', BEST_DEFAULTS).best, 500, 'a second write did not lose the first');
  assert.equal(section('audio', AUDIO_DEFAULTS).music, 3);
  assert.deepEqual(section('view', VIEW_DEFAULTS),
    { shake: 'half', flash: 'full', numbers: 'off', particles: 'all' },
    'a remembered step name comes back as the name it was written as');

  const both = text(store);
  remember('audio', { music: 3, effects: 3, muted: false });
  remember('view', { shake: 'half', numbers: 'off' });
  assert.equal(text(store), both, 'the same values again is the same text, byte for byte');

  const keys = Object.keys(parsed(store));
  assert.deepEqual(keys,
    ['version', 'score', 'meta', 'hangar', 'codex', 'awards', 'runs', 'daily', 'audio', 'view',
      'assists', 'tutorial', 'keys'],
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
  assert.equal(remember('hangar', { ships: ['needle', 'bulwark'] }), true, 'and it got there');
  assert.deepEqual(parsed(store).hangar.ships, ['bulwark', 'needle'], 'a write sorts on the way in');
  assert.deepEqual(section('hangar', BOUGHT).ships, ['bulwark', 'needle']);
  assert.deepEqual(section('hangar', { ships: ['wisp'] }).ships, ['bulwark', 'needle'],
    'a default for a key that is there is not applied');
});

test('the codex\'s lists are sets too, and allowed to be longer than a rack is', () => {
  // The same kind as a hangar purchase, with a different ceiling (core/save.js): a rack is five ships
  // and four perks, and a codex is a row per enemy, per fight and per card (game/codex.js), so forty
  // entries is nonsense in one field and the honest shape of the other. Both still have a ceiling - a
  // list past every row the game can name is not the game's list either.
  const MET = { hosts: [], lines: [] };
  const forty = [];
  for (let i = 0; i < 40; i++) forty.push('kind' + i);
  browser(stored({ codex: { hosts: forty, lines: ['burn'] } }));
  assert.deepEqual(section('codex', MET).hosts, forty.slice().sort(),
    'forty bodies is a codex, where forty ships is not a rack');
  assert.deepEqual(section('codex', MET).lines, ['burn'], 'and its neighbour on the same row survives');

  const absurd = [];
  for (let i = 0; i < 200; i++) absurd.push('kind' + i);
  browser(stored({ codex: { hosts: absurd, lines: ['burn'] } }));
  assert.deepEqual(section('codex', MET).hosts, [], 'two hundred rows is not a codex either');

  const store = browser({});
  assert.equal(remember('codex', { hosts: ['tank'], lines: ['fire-rate'] }), true);
  assert.deepEqual(parsed(store).codex, { hosts: ['tank'], lines: ['fire-rate'] },
    'and it is written back as it was given');
});

test('the awards are a longer set again, and nonsense in them is no awards', () => {
  // Thirty-odd on purpose (game/awards.js), so the rack's ceiling of thirty-two would have been
  // full the day this shipped - and, like the codex, it still has a ceiling of its own.
  const WON = { won: [] };
  const twenty = [];
  for (let i = 0; i < 20; i++) twenty.push('award' + i);
  browser(stored({ awards: { won: twenty } }));
  assert.deepEqual(section('awards', WON).won, twenty.slice().sort(),
    'twenty awards is a list of awards');

  const absurd = [];
  for (let i = 0; i < 200; i++) absurd.push('award' + i);
  browser(stored({ awards: { won: absurd } }));
  assert.deepEqual(section('awards', WON).won, [], 'two hundred of them is not');

  // Every entry the wrong shape - capitals, a number, an empty name - is the field being the wrong
  // kind, so the visit starts from nothing rather than from a half-read list.
  browser(stored({ awards: { won: ['CENTURY', 42, ''] } }));
  assert.deepEqual(section('awards', WON).won, [], 'and a list of nonsense is no list');

  const store = browser({});
  assert.equal(remember('awards', { won: ['century', 'old-hand'] }), true);
  assert.deepEqual(parsed(store).awards, { won: ['century', 'old-hand'] },
    'and what was won is written back as it was given');
});

/** One run's record (game/history.js), with any of its fields changed - the way a wrecked log turns
    up in somebody's storage. */
function runRecord(seed, over) {
  return Object.assign(
    { seed: seed, ship: 'wisp', seconds: 95, score: 1200, won: false },
    over || {});
}

test('the run log is a list of records, and its order is part of the record', () => {
  // The fourth kind of thing this store is asked to hold (PLAN 3.7: the last twenty runs): not a
  // number, not a set, not a ledger, but a *list of rows* - and the one list the store does not put
  // in order, because "which run was the last one" is the information the panel reads.
  const LOG = { log: [] };
  const log = [runRecord(700), runRecord(42), runRecord(1)];
  browser(stored({ runs: { log } }));
  assert.deepEqual(section('runs', LOG).log, log, 'read back in the order it was written');

  browser(stored({ runs: { log: log.slice().reverse() } }));
  assert.deepEqual(section('runs', LOG).log.map((run) => run.seed), [1, 42, 700],
    'the same runs the other way round stay the other way round');

  // A seed twice is two runs and two rows: a log is a record of what was flown, not a set of seeds.
  browser(stored({ runs: { log: [runRecord(9), runRecord(9)] } }));
  assert.equal(section('runs', LOG).log.length, 2, 'nothing here dedupes anything');

  // Every field is read, including the ones that are zero and the widest seed there is - a run that
  // scored nothing in no seconds is a run, and `won: false` is an answer and not an absent field.
  const edges = [runRecord(4294967295, { ship: 'brood', seconds: 0, score: 0, won: true })];
  browser(stored({ runs: { log: edges } }));
  assert.deepEqual(section('runs', LOG).log, edges);

  const store = browser({});
  assert.equal(remember('runs', { log }), true);
  assert.deepEqual(parsed(store).runs.log, log, 'and a write is given back exactly as it was given');
});

test('a run record that is not whole is dropped, and the log keeps its neighbours', () => {
  // Where the set and the ledger forgive an entry field by field, a record is judged whole: a row that
  // lost its score cannot be printed, so it is not kept with a hole in it.
  const LOG = { log: [] };
  const whole = [runRecord(5), { seed: 6, ship: 'volt', seconds: 1, score: 0, won: true }];
  const log = [
    whole[0],
    { seed: 1, ship: 'wisp', seconds: 3 },                        // no score, no win
    { seed: 2, ship: 'WISP', seconds: 3, score: 1, won: false },  // a ship id that is not a name
    { seed: -1, ship: 'wisp', seconds: 3, score: 1, won: false }, // a seed below nothing
    { seed: 3, ship: 'wisp', seconds: 1e6, score: 1, won: false },// a day-long run is not a run
    { seed: 4, ship: 'wisp', seconds: 3, score: 1.5, won: false },// a run does not end mid-point
    { seed: 5, ship: 'wisp', seconds: 3, score: 1, won: 'yes' },  // a win that is not a yes or a no
    Object.assign({}, whole[1], { extra: 'x' }),                 // a whole row with a field to spare
    'not a record', null, [], 42,
  ];
  browser(stored({ runs: { log } }));
  assert.equal(saveProblem(), '', 'the document itself is fine');
  assert.deepEqual(section('runs', LOG).log, whole,
    'the whole records survived, and the one unknown field did not ride along');
});

test('a log that is not a log is not stored, and an empty one is an answer', () => {
  const first = runRecord(1);
  const ONE = { log: [first] };
  // Not a list at all, and a list with nothing a whole record in it: both are the field being the
  // wrong kind, so the feature falls back to its own default like any other wreck.
  for (const bad of ['log', 4, true, { a: 1 }, ['x'], [null], [{}], [runRecord(2, { seed: -1 })]]) {
    browser(stored({ runs: { log: bad } }));
    assert.deepEqual(section('runs', ONE).log, [first], JSON.stringify(bad));
  }
  // Longer than the game could have written (core/save.js's own ceiling, well past BALANCE.history).
  const tooMany = [];
  for (let i = 0; i < 70; i++) tooMany.push(runRecord(i));
  browser(stored({ runs: { log: tooMany } }));
  assert.deepEqual(section('runs', ONE).log, [first], 'seventy runs is not a log');

  // But an empty list is the plainest answer there is: nothing has been flown yet.
  browser(stored({ runs: { log: [] } }));
  assert.deepEqual(section('runs', ONE).log, [], 'a first visit remembers no runs, on purpose');

  assert.throws(() => remember('runs', { log: 'one run' }), /refusing to remember runs.log/);
  assert.throws(() => remember('runs', { log: [{ seed: 1 }] }), /refusing to remember runs.log/);
  assert.throws(() => section('runs', { log: 'one run' }), /cannot default runs.log/);
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

test('a remembered tally of counts is a ledger: read back sorted, and with its rubbish dropped', () => {
  // The other kind of collection, and the one PLAN 3.7's perks need (game/perks.js): not a yes but a
  // count. The same bargains as the set, entry by entry - a name that is not a name or a count that
  // is not a count is dropped and its neighbours are kept, because one mangled entry in a
  // half-written page must not cost a player every rank they bought.
  const RANKS = { perks: {} };
  const junk = { hull: 2, reroll: 5, dust: 0, '##': 3, nope: 'two', slow: -1, big: 1e9, frac: 1.5,
    nullish: null };
  junk['x'.repeat(40)] = 1;
  browser(stored({ hangar: { perks: junk } }));
  assert.equal(saveProblem(), '', 'the document itself is fine');
  assert.deepEqual(section('hangar', RANKS).perks, { dust: 0, hull: 2, reroll: 5 },
    'the entries that are a name and a count are all of it');

  const store = browser({});
  assert.equal(remember('hangar', { perks: { banish: 3, hull: 1 } }), true);
  assert.deepEqual(parsed(store).hangar.perks, { banish: 3, hull: 1 },
    'a write sorts on the way in, so the same ledger writes the same text');
  assert.deepEqual(section('hangar', RANKS).perks, { banish: 3, hull: 1 });
});

test('a tally that is not a tally is not stored, and an empty one is an answer', () => {
  const RANKS = { perks: { hull: 4 } };
  // Not a map at all, and a map with nothing a count is any more: both are the field being the wrong
  // kind, so the feature falls back to its own default like any other wreck.
  for (const bad of ['hull', 4, true, [], [1, 2, 3], { a: 'b' }, { '##': 2 }, { hull: -1 }]) {
    browser(stored({ hangar: { perks: bad } }));
    assert.deepEqual(section('hangar', RANKS).perks, { hull: 4 }, JSON.stringify(bad));
  }
  // A map with more names in it than the game could ever fill is not the game's ledger either - and
  // a ledger is one field, so half of it cannot be kept without the rest coming along.
  const tooMany = {};
  for (let i = 0; i < 40; i++) tooMany['perk' + i] = 1;
  browser(stored({ hangar: { perks: tooMany } }));
  assert.deepEqual(section('hangar', RANKS).perks, { hull: 4 }, 'forty perks is not a rack');

  // But an empty map is the plainest answer there is: nothing bought yet.
  browser(stored({ hangar: { perks: {} } }));
  assert.deepEqual(section('hangar', RANKS).perks, {}, 'a first visit remembers nothing, on purpose');

  assert.throws(() => remember('hangar', { perks: 'hull' }), /refusing to remember hangar.perks/);
  assert.throws(() => remember('hangar', { perks: { hull: 'two' } }), /refusing to remember/);
  assert.throws(() => section('hangar', { perks: 'hull' }), /cannot default hangar.perks/);
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
