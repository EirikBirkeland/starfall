// Stardust: what a run is worth, and the promise that it is worth it once (game/stardust.js).
//
// PLAN 3.7 gives the rule in one sentence - "1 per 100 score, plus bonuses for bosses" - and this
// file keeps that sentence from being rewritten by whoever writes the next reward screen. Two
// things are pinned here: the arithmetic, and the payment. The arithmetic matters because every
// cost milestone 8 puts on a ship or a perk is priced against it; the payment matters because a
// won run can be handed back and flown on (game/run.js `continueRun`), so "pay what the run is
// worth" at every ending would pay one run twice.
//
// No game is booted: the purse is a number and a write, and a fake window is all the browser a
// save needs (the same bargain test/save.test.mjs makes).

import test from 'node:test';
import assert from 'node:assert/strict';

import { dustForRun, payForRun, spendDust, storedDust } from '../src/game/stardust.js';
import { BALANCE } from '../src/game/balance.js';
import { section, SAVE_KEY } from '../src/core/save.js';

const PER_SCORE = BALANCE.stardust.perScore;
const PER_BOSS = BALANCE.stardust.perBoss;
const FOR_WIN = BALANCE.stardust.won;

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

/** A finished run, as far as stardust is concerned: three facts and the purse it pays into. */
function finished(fields) {
  return Object.assign({ score: 0, bossesDown: 0, won: false, dust: 0, dustPaid: 0 }, fields);
}

function dustStored(store) {
  return JSON.parse(store[SAVE_KEY]).meta.dust;
}

test('the rule is the balance sheet, not a number in a test', () => {
  // What PLAN says, in the sheet's own units: one dust per `perScore`, and nothing under it.
  assert.equal(dustForRun(finished({ score: PER_SCORE - 1 })), 0, '99 of score is no dust');
  assert.equal(dustForRun(finished({ score: PER_SCORE })), 1, 'and 100 of it is one');
  assert.equal(dustForRun(finished({ score: PER_SCORE * 3 - 1 })), 2, 'and it never rounds up');
  assert.equal(dustForRun(finished({ score: 12345 })), 123, 'a 1,200-score run pays 12');
});

test('a fight the schedule sent is worth its own dust, and finishing is worth more', () => {
  assert.equal(dustForRun(finished({ bossesDown: 1 })), PER_BOSS);
  assert.equal(dustForRun(finished({ bossesDown: 3 })), PER_BOSS * 3);
  assert.equal(dustForRun(finished({ won: true })), FOR_WIN);
  assert.equal(dustForRun(finished({ score: PER_SCORE * 40, bossesDown: 3, won: true })),
    40 + PER_BOSS * 3 + FOR_WIN, 'and the three parts of it add up');
});

test('what a run that walked the whole schedule out is worth', () => {
  // Held alive to the end of the schedule a run scores 55,000-113,000 (NOTES session 74). The
  // bottom of that is the number a ship's cost has to be reachable by, so it is worth writing
  // down what the rule makes of it: about a thousand dust for the best run a player can have.
  const cleared = finished({ score: 54885, bossesDown: 3, won: true });
  assert.equal(dustForRun(cleared), 548 + PER_BOSS * 3 + FOR_WIN);
  assert.ok(dustForRun(cleared) > 1000, 'a win is worth more than a thousand dust');
});

test('what a run is worth is what the Gleaner says it is worth', () => {
  // One rank of the hangar's Gleaner (game/perks.js, PLAN 3.7) is a share on the whole line, so it
  // pays on the score, the fights and the win at once - and it cannot be forgotten by the next reward
  // anybody adds below, because there is only this one line that says what a run is worth.
  const withRanks = (rank, fields) => Object.assign(
    finished(Object.assign({ score: PER_SCORE * 100 }, fields)), { perkRanks: { dust: rank } });
  assert.equal(dustForRun(withRanks(0)), 100, 'no ranks, no multiplier');
  assert.equal(dustForRun(finished({ score: PER_SCORE * 100 })), 100, 'nor is a visit with no ledger');
  assert.equal(dustForRun(withRanks(1)), 110);
  assert.equal(dustForRun(withRanks(5)), 150);
  assert.equal(dustForRun(withRanks(900)), 150, 'and a count past the ladder is the top of it');
  assert.equal(dustForRun(withRanks(3, { bossesDown: 2, won: true })),
    Math.round((100 + PER_BOSS * 2 + FOR_WIN) * 1.3), 'every part of the line at once');

  // A purse is spent in whole stardust, so the worth is rounded rather than being a number a price
  // could never be paid with.
  assert.equal(dustForRun(withRanks(1, { score: PER_SCORE * 15 })), 17, 'fifteen, plus a tenth');
});

test('a rank of the Gleaner pays into the purse and nowhere else', () => {
  // The multiplier is on what a run earned, not on what a visit has: the purse, the best and the
  // ships the last visit bought are nobody's to multiply (game/hangar.js spends them as they are).
  const store = browser({});
  const run = finished({ score: PER_SCORE * 100, dust: 500 });
  run.perkRanks = { dust: 2 };
  assert.equal(payForRun(run), 120, 'the payment is the multiplied worth');
  assert.equal(run.dust, 620, 'and the purse is the purse plus that');
  assert.equal(dustStored(store), 620, 'which is what the write says too');
});

test('a finished run pays into the purse, and the purse is stored', () => {
  const store = browser({});
  const run = finished({ score: 2500 });
  assert.equal(payForRun(run), 25, 'the payment is what the run earned');
  assert.equal(run.dust, 25, 'it went into the purse');
  assert.equal(dustStored(store), 25, 'and into storage, in the save');
  assert.equal(storedDust(), 25, 'which is where the next visit reads it back from');
});

test('a run is paid once, whichever way it ended', () => {
  const store = browser({});
  const run = finished({ score: 800 });
  assert.equal(payForRun(run), 8);
  const written = store[SAVE_KEY];
  assert.equal(payForRun(run), 0, 'nothing is owed the second time');
  assert.equal(store[SAVE_KEY], written, 'and nothing was written for it');
  assert.equal(run.dust, 8, 'and the purse did not move');
});

test('a run that is won, flown on, and then lost is paid for the flying and not for the win twice', () => {
  const store = browser({});
  const run = finished({ score: 50000, bossesDown: 3, won: true });
  const atTheWin = payForRun(run);
  assert.equal(atTheWin, 500 + PER_BOSS * 3 + FOR_WIN, 'the win pays in full when it happens');
  assert.equal(run.dust, atTheWin);

  // The card was answered with "keep flying", the score went up by another 20,000, and then the
  // run went down (game/run.js `continueRun`). Only the new score is new dust.
  run.score += 20000;
  assert.equal(payForRun(run), 200, 'the stretch past the win, and nothing else');
  assert.equal(run.dust, atTheWin + 200);
  assert.equal(dustStored(store), atTheWin + 200, 'and that is what the purse says');
});

test('a run that earned nothing is not a write to storage at all', () => {
  const store = browser({});
  const run = finished({ score: 40 });          // 40 of score is under a single dust
  assert.equal(dustForRun(run), 0);
  assert.equal(payForRun(run), 0);
  assert.equal(store[SAVE_KEY], undefined, 'a nothing run touched nothing');
});

test('the purse comes back from storage, and nonsense is a fresh purse', () => {
  browser({ [SAVE_KEY]: JSON.stringify({ version: 1, meta: { dust: 1234 } }) });
  assert.equal(storedDust(), 1234);

  browser({});
  assert.equal(storedDust(), 0, 'nothing stored is no dust');

  browser({ [SAVE_KEY]: '{"version":1,"meta":{"dust":"' });
  assert.equal(storedDust(), 0, 'half a blob is no dust');

  browser({ [SAVE_KEY]: JSON.stringify({ version: 1, meta: { dust: -5 } }) });
  assert.equal(storedDust(), 0, 'a negative purse is no purse');

  browser({ [SAVE_KEY]: JSON.stringify({ version: 1, meta: { dust: 1e9 + 1 } }) });
  assert.equal(storedDust(), 0, 'and a purse over the ceiling the store allows is no purse');
});

test('a browser that will not store still gets a purse for the visit', () => {
  // `remember` answers false when storage is blocked or full, or when a newer build's document is
  // in the way (core/save.js). None of them are a reason to tell a player their run paid nothing.
  globalThis.window = {
    localStorage: { getItem: () => null, setItem: () => { throw new Error('quota'); } },
  };
  const run = finished({ score: 600 });
  assert.equal(payForRun(run), 6, 'the purse moved for this visit');
  assert.equal(storedDust(), 0, 'and nothing arrived to be read back');
  assert.equal(payForRun(run), 0, 'and the same run is not paid again for trying twice');
});

test('the purse has one door each way, and a purchase it cannot cover takes nothing', () => {
  // PLAN 3.7's money is spent as well as earned, and `spendDust` is the only door out (game/hangar.js
  // buys through it). Short is not a discount and not a partial payment.
  const store = browser({});
  const purse = finished({ score: PER_SCORE * 10 });
  payForRun(purse);
  assert.equal(purse.dust, 10);

  assert.equal(spendDust(purse, 4), true, 'a purse that covers it pays');
  assert.equal(purse.dust, 6);
  assert.equal(dustStored(store), 6, 'and the write went in');

  assert.equal(spendDust(purse, 7), false, 'a purse that does not cover it is refused');
  assert.equal(purse.dust, 6, 'and nothing left it');
  assert.equal(dustStored(store), 6, 'and the document was not touched');

  assert.equal(spendDust(purse, 6), true, 'spending to exactly nothing is still spending');
  assert.equal(purse.dust, 0);
  assert.equal(dustStored(store), 0, 'and a zero purse is written as one');
});

test('a purchase leaves the rest of the visit alone', () => {
  // Spending shares the save with the best score, the sliders, and what the purse has already bought
  // (core/save.js), so it has to be as careful as earning: one section lands, the rest stays.
  const store = browser({
    [SAVE_KEY]: JSON.stringify({
      version: 1, score: { best: 77 }, meta: { dust: 30 },
      hangar: { ships: ['bulwark'] }, audio: { music: 4, effects: 2, muted: true },
    }),
  });
  const purse = finished({ dust: storedDust() });
  assert.equal(spendDust(purse, 12), true);
  assert.equal(dustStored(store), 18);
  assert.equal(section('score', { best: 0 }).best, 77, 'the best is where it was');
  assert.deepEqual(section('hangar', { ships: [] }).ships, ['bulwark'],
    'and so is the ship the last visit paid for');
  assert.deepEqual(section('audio', { music: 10, effects: 10, muted: false }),
    { music: 4, effects: 2, muted: true }, 'and so is the mixer');
});

test('a browser that will not store still spends the purse it has', () => {
  // The same bargain the pay strikes: the purse on the glass is the purse the visit has, and a write
  // that cannot land is not a reason to lie about it.
  globalThis.window = {
    localStorage: { getItem: () => null, setItem: () => { throw new Error('quota'); } },
  };
  const purse = finished({ dust: 9 });
  assert.equal(spendDust(purse, 4), true, 'the purse moved for this visit');
  assert.equal(purse.dust, 5);
  assert.equal(storedDust(), 0, 'and nothing arrived to be read back');
});

test('paying a run leaves the rest of the visit alone', () => {
  // The purse shares its home with the best score and the two sliders (core/save.js), so a write
  // that lands one section must not be a write that forgets the others - which is the one way a
  // shared save goes wrong.
  browser({
    [SAVE_KEY]: JSON.stringify({
      version: 1, score: { best: 77 }, audio: { music: 4, effects: 2, muted: true },
    }),
  });
  assert.equal(payForRun(finished({ score: 300 })), 3);
  assert.equal(storedDust(), 3);
  assert.equal(section('score', { best: 0 }).best, 77, 'the best is where it was');
  assert.deepEqual(section('audio', { music: 10, effects: 10, muted: false }),
    { music: 4, effects: 2, muted: true }, 'and so is the mixer');
});
