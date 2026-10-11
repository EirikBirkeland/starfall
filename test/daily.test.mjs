// The daily run (PLAN milestone 10): one arena a day, the same one for everybody, and that day's own
// best score.
//
// Two halves. The first is arithmetic with no browser in it - what day a date belongs to, how it is
// written, and what seed it is flown on - which is the part a player never sees and the part every
// other player's score is compared against. The second is one visit through the real game: the key,
// the seed it flies, what its ending writes into the save, and what each of the places the day is said
// out loud says about it.
//
// One boot reads one save (tools/headless/harness.js), so the visit half is one boot and one file -
// which is fine here, because `core/save.js` reads storage on every call and never caches: a test can
// rewrite `game.storage` between two of these and the game reads the new document on the next question.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { remember } from '../src/core/save.js';
import { BALANCE } from '../src/game/balance.js';
import { makeEnemy } from '../src/game/kinds.js';
import {
  bankDaily, beginDailyRun, bestOnDay, cardWords, dayOf, dayWords, endDailyRun, hudWords,
  pauseWords, seedForDay, shortDayWords, titleWords, todayDay,
} from '../src/game/daily.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const SAVE_KEY = 'starfall.save';
const DAY_MS = 86400000;          // one day, for the setup that needs a yesterday

const game = await bootGame({ root: ROOT, seed: 41, width: 1280, height: 720, audio: true });
const world = game.world;

/** Today, worked out the same way the game works it out (game/daily.js `todayDay`). */
const TODAY = todayDay();

/** The day before today, by the same clock the game reads. */
function yesterday() {
  return dayOf(new Date(Date.now() - DAY_MS));
}

function press(code) {
  game.key(code, true);
  game.key(code, false);
}

function frames(n) {
  for (let i = 0; i < n; i++) game.step(FRAME);
}

/** Long enough for an ending's restart guard to be spent, so the next launch is answered. */
function waitOutGuard() {
  frames(40);
}

/** Park a lethal body on the ship and run one frame: the run is over afterwards (test/awards-saved). */
function killTheShip() {
  const ship = game.player;
  ship.hull = 1;
  ship.invuln = 0;
  ship.fireTimer = 5;
  game.enemies.push(makeEnemy(world, 'drifter', ship.x, ship.y, {
    hp: 1, speed: 0, drop: 0, score: 0,
  }));
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.OVER);
}

/** Fly a run, score it, and end it. `daily` asks for today's arena instead of one of its own. */
function fly(score, daily) {
  waitOutGuard();
  press(daily ? 'KeyT' : 'Space');
  frames(2);
  assert.equal(game.stats().state, game.STATE.PLAY, 'the run launched');
  game.world.score = score;
  killTheShip();
  return game.stats();
}

/** The save's own `daily` section, or an empty one when the document has nothing to say. */
function dailyInSave() {
  const doc = JSON.parse(game.storage[SAVE_KEY] || '{}');
  return doc.daily === undefined ? { day: 0, best: 0 } : doc.daily;
}

/** Say something about the day by writing it into the save the way the game would. */
function writeDailyInSave(day, best) {
  const doc = JSON.parse(game.storage[SAVE_KEY] || '{}');
  doc.version = 1;
  doc.daily = { day: day, best: best };
  game.storage[SAVE_KEY] = JSON.stringify(doc);
}

// --- the day, with no browser in it ------------------------------------------

test('a day is written the way the date is spoken', () => {
  assert.equal(dayOf(new Date(2026, 9, 12)), 20261012, 'October the twelfth');
  assert.equal(dayOf(new Date(2026, 0, 1)), 20260101, 'and the first of January keeps its zeroes');
  assert.equal(dayOf(new Date(1999, 11, 31)), 19991231);
  // Today, out of the visit's own clock: the shape is the promise, since everything else is compared
  // against whatever this comes up as.
  assert.match(String(TODAY), /^\d{8}$/, 'a day is eight digits of date');
});

test('the words a day is printed in are the day, padded to the same width', () => {
  assert.equal(dayWords(20261012), '2026-10-12');
  assert.equal(dayWords(20260101), '2026-01-01', 'a short month and a short day both keep a zero');
  assert.equal(shortDayWords(20260101), '01-01');
  assert.equal(shortDayWords(20261209), '12-09');
});

test('a day is flown on a seed of its own, and always the same one', () => {
  const seed = seedForDay(20261012);
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 4294967295, 'a uint32, like every seed');
  assert.equal(seedForDay(20261012), seed, 'the same day, asked twice, is the same arena');
  assert.notEqual(seed, 20261012, 'and it is not the date itself, which anybody could type');
  assert.notEqual(seedForDay(20261013), seed, 'the next day is not the same arena');
});

test('four hundred days in a row are four hundred different arenas', () => {
  // The scramble in core/rng.js is what makes 20261012 and 20261013 feel like two runs and not one
  // with a drifter moved. A repeat inside a year and a day would be two players flying the same arena
  // on two dates, which is the one thing this number exists to avoid.
  const seeds = new Set();
  for (let i = 0; i < 400; i++) {
    // Walk the calendar the honest way, by the clock and not by the digits: the 32nd of a month is not
    // a day, and a seed should never be asked for one.
    seeds.add(seedForDay(dayOf(new Date(2024, 0, 1 + i))));
  }
  assert.equal(seeds.size, 400, 'every one of them a different arena');
});

// --- what the day's best is, out of the save ---------------------------------

test('a save that has not flown today says so with nothing at all', () => {
  assert.equal(bestOnDay(TODAY), 0);
  assert.equal(titleWords(), '', 'and the title has no number to show for it');
  assert.equal(game.screen.titleToday, '', 'not even the dot in front of it');
});

test('a day best belongs to the day it was scored on and to no other', () => {
  const past = yesterday();
  writeDailyInSave(past, 40000);
  assert.equal(bestOnDay(past), 40000, 'asked for the day it was stored for, it is there');
  assert.equal(bestOnDay(TODAY), 0, 'asked for today, it is not: the calendar has turned');
  assert.equal(titleWords(), '', 'and the title shows nothing for a day that has not been flown');
  const words = cardWords({ dailyDay: past, newDailyBest: false });
  assert.match(words, /^TODAY \d{4}-\d\d-\d\d \u00b7 40,000 BEST TODAY$/,
    'and a card about that day says whose best it is: ' + words);
});

test('nonsense in the day section is no day at all', () => {
  const broken = [
    { day: 'today', best: 100 },        // a word where a date goes
    { day: 20261340, best: 100 },       // the fortieth of the thirteenth
    { day: 999999999, best: 100 },      // wider than any date can be
    { day: -1, best: 100 },
    { day: TODAY, best: 'a lot' },      // a score that is a sentence
    { day: TODAY, best: -5 },
    { day: TODAY, best: 1.5 },          // and a score is a whole number
  ];
  for (const daily of broken) {
    writeDailyInSave(daily.day, daily.best);
    assert.equal(bestOnDay(TODAY), 0, JSON.stringify(daily) + ' is not a day and a best');
  }
});

test('the save will not write a day that is not a date', () => {
  // The reading above is forgiving, as it has to be; the *writing* is strict, and that is what keeps
  // a ceiling on the field: a day is eight digits of date and nothing else, so a number past the
  // widest date there is cannot be stored at all (core/save.js `MAX_DAY`).
  assert.throws(() => remember('daily', { day: 999999999, best: 5 }), /refusing to remember daily/);
  assert.throws(() => remember('daily', { day: TODAY, best: 'a lot' }), /refusing to remember daily/);
  assert.equal(remember('daily', { day: TODAY, best: 5 }), true, 'and a real one goes in fine');
  assert.equal(bestOnDay(TODAY), 5);
});

// --- the key, and the run it launches ----------------------------------------

test('T flies today, and nothing else about the run is different', () => {
  const stats = fly(1234, true);
  assert.equal(stats.dailyDay, TODAY, 'the run knows the day it was flown on');
  assert.equal(stats.seed, seedForDay(TODAY), 'and it is flown on the day, the whole of it');
  assert.ok(stats.score > 0, 'which is a run like any other by the time it ends');
});

test('a daily run is banked like any run: the best, the purse, and the log', () => {
  // It is a run. That is the decision, and it is what makes the day a challenge and not a punishment:
  // the arena being everybody else does not make this run worth less to the save that flew it.
  const doc = JSON.parse(game.storage[SAVE_KEY] || '{}');
  assert.ok(doc.score.best > 0, 'the all-time best moved: ' + JSON.stringify(doc.score));
  assert.ok(doc.meta.dust > 0, 'the purse was paid: ' + JSON.stringify(doc.meta));
  assert.ok(doc.runs.log.length > 0, 'and the run is in the log');
});

test('the best today goes on the title once the day has been flown', () => {
  assert.equal(bestOnDay(TODAY), 1234);
  assert.equal(titleWords(), 'TODAY 1,234');
  assert.equal(game.screen.titleToday, ' \u00b7 TODAY 1,234', 'painted, separator and all');
});

test('an ending that beat the day says NEW, and one that did not says what it is short of', () => {
  assert.match(game.screen.finalDaily, /^TODAY \d{4}-\d\d-\d\d \u00b7 NEW BEST TODAY$/);
  const worse = fly(500, true);
  assert.equal(worse.newDailyBest, false, 'the day kept its best');
  assert.equal(bestOnDay(TODAY), 1234, 'in the save as well as on the card');
  assert.match(game.screen.finalDaily, /\u00b7 1,234 BEST TODAY$/);
  const better = fly(9000, true);
  assert.equal(better.newDailyBest, true);
  assert.equal(bestOnDay(TODAY), 9000);
  assert.match(game.screen.finalDaily, /NEW BEST TODAY$/);
});

test('the ordinary launch goes back to the seed the visit was given', () => {
  // The bug this pins: a tool or an address bar locks a seed in, a daily run writes the day's seed
  // into the world, and the next ordinary run used to fly the day by default instead of the seed the
  // visit was given. `beginRun` has to know which of the two it is coming back to.
  fly(700, true);
  const ordinary = fly(600, false);
  assert.equal(ordinary.dailyDay, 0, 'an ordinary run has no day');
  assert.equal(ordinary.seed, 41, 'and it flies the seed this visit was locked to');
  assert.equal(game.screen.finalDaily, '');
});

test('an ending on an ordinary run does not touch the day', () => {
  const before = dailyInSave();
  fly(80, false);
  assert.deepEqual(dailyInSave(), before, 'the day section is left exactly as it was');
});

test('the day is said out loud in the two places a flying run is looked at', () => {
  waitOutGuard();
  press('KeyT');
  frames(2);
  assert.equal(game.stats().dailyDay, TODAY);
  // Beside the clock, while it is being flown (render/hud.js).
  assert.ok(game.words().some((word) => word.indexOf('TODAY ' + shortDayWords(TODAY)) >= 0),
    'the HUD says which day this is: ' + JSON.stringify(game.words()));
  // On the pause, with its own date and not an abbreviation (game/daily.js `pauseWords`).
  press('KeyP');
  frames(1);
  const rows = game.screen.pauseFacts.filter((fact) => fact.name === 'TODAY');
  assert.equal(rows.length, 1, 'one row, and only one');
  assert.equal(rows[0].says, dayWords(TODAY));
  press('KeyP');
  frames(1);
  killTheShip();
});

test('a run that is not a daily is said nowhere at all', () => {
  waitOutGuard();
  press('Space');
  frames(2);
  assert.equal(hudWords(world), '', 'no word beside the clock');
  press('KeyP');
  frames(1);
  assert.equal(game.screen.pauseFacts.filter((fact) => fact.name === 'TODAY').length, 0,
    'no row on the pause');
  press('KeyP');
  frames(1);
  killTheShip();
  assert.equal(game.screen.finalDaily, '');
});

test('a new run forgets that the last one beat the day', () => {
  fly(99000, true);
  assert.equal(game.stats().newDailyBest, true, 'that ending did beat it');
  waitOutGuard();
  press('Space');
  frames(2);
  assert.equal(game.stats().state, game.STATE.PLAY, 'and this run launched');
  assert.equal(game.stats().newDailyBest, false, 'which has not beaten anything yet - the flag is per run');
  killTheShip();
});

// --- the book itself, at the door every ending uses --------------------------

test('a run that stops twice banks the bigger of its two endings', () => {
  // A won run is handed its arena back and goes down later (game/run.js `continueRun`), and `bankRun`
  // runs twice for the one run. The day is written at both, so the second has to lose unless the run
  // actually got bigger - the same bargain the all-time best and the log keep.
  writeDailyInSave(0, 0);        // a save that has never flown a daily at all
  endDailyRun(world);
  assert.equal(bankDaily(world), false, 'an ordinary run banks nothing on any day');
  beginDailyRun(world);
  world.score = 100;
  assert.equal(bankDaily(world), true, 'the first ending of a daily one does');
  world.score = 50;
  assert.equal(bankDaily(world), false, 'a smaller second ending does not');
  assert.equal(bestOnDay(world.dailyDay), 100, 'and the day keeps the bigger number');
  world.score = 200;
  assert.equal(bankDaily(world), true, 'a bigger one is paid out');
  assert.equal(bestOnDay(world.dailyDay), 200);
  endDailyRun(world);
});

test('the day a run belongs to is the day it started on, not the day it ended on', () => {
  // Asked for the day it cares about rather than for "today", which is what lets a run launched at
  // 23:59 be scored on the day it was flown on even if the clock has moved since.
  const past = yesterday();
  writeDailyInSave(past, 5);
  world.dailyDay = past;
  world.score = 6;
  assert.equal(bankDaily(world), true);
  assert.deepEqual(dailyInSave(), { day: past, best: 6 }, 'and that day is what the save says');
  assert.equal(bestOnDay(TODAY), 0, 'today is still untouched by it');
  world.dailyDay = 0;
});

test('the day a run belongs to is written when it is launched and nowhere else', () => {
  endDailyRun(world);
  assert.equal(world.dailyDay, 0);
  const day = beginDailyRun(world);
  assert.equal(day, TODAY);
  assert.equal(world.dailyDay, TODAY);
  assert.equal(world.seed, seedForDay(TODAY), 'and the seed went with it');
  endDailyRun(world);
  assert.equal(world.dailyDay, 0);
});

// --- the words each surface prints, so a card cannot print a hole ------------

test('the words each surface prints about the day', () => {
  assert.equal(cardWords({ dailyDay: 0, newDailyBest: false }), '');
  assert.equal(pauseWords({ dailyDay: 0 }), null);
  assert.equal(hudWords({ dailyDay: 0 }), '');
  assert.match(cardWords({ dailyDay: 20261012, newDailyBest: false }),
    /^TODAY 2026-10-12 \u00b7 /);
  assert.deepEqual(pauseWords({ dailyDay: 20261012 }), { name: 'TODAY', says: '2026-10-12' });
  assert.equal(hudWords({ dailyDay: 20261012 }), 'TODAY 10-12');
});

test('the mark beside the clock is short and the card has room for the whole date', () => {
  // The HUD draws the day on a line that carries a clock and a level already; the card has no such
  // crowd on it and says the date in full.
  assert.ok(hudWords({ dailyDay: 20261012 }).length <= 11, 'the HUD mark is short');
  assert.equal(cardWords({ dailyDay: 20261012, newDailyBest: true }),
    'TODAY 2026-10-12 \u00b7 NEW BEST TODAY');
});

test('no balance row owns the day, so a re-tune cannot move an arena', () => {
  // A day is a label and not a difficulty: no number in `BALANCE` decides which arena a date is, so
  // two players on one date cannot be handed different crowds by a patch between their runs.
  assert.equal(BALANCE.daily, undefined);
});

// --- the page itself, which is the only place the key is ever said -----------

const markup = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('the day line on a card is a rule, and it takes its space away when it is empty', () => {
  // Held the same way test/death-cause.test.mjs holds the card's other lines: a class with no rule is
  // a line that takes room it was never given, and `:empty` is the whole reason a card about an
  // ordinary run is the card it always was.
  assert.match(markup, /\.daily-line \{\n\s+margin-top: 8px;/);
  assert.match(markup, /\.daily-line:empty \{ display: none; \}/);
  assert.match(markup, /\.daily-line \{ margin-top: 4px; \}/, 'and it is tightened on a short window');
});

test('the key that flies the day is said where the launch keys are said', () => {
  // The title's control list has no row for it, and that is a decision with a reason in index.html:
  // the column is already exactly as tall as the window it was designed for. So the hint line - which
  // is where the launch key itself is written, and is the only other place a first visit looks for a
  // key - has to carry it, or the key does not exist.
  assert.match(
    markup,
    /PRESS SPACE OR CLICK TO LAUNCH &#183; <span id="titleKeysToday">T<\/span> FOR TODAY&#39;S ARENA/,
    'the day\'s key is written where the launch keys are, and written as a live one');
  assert.ok(markup.indexOf('id="titleToday"') > 0, 'and the day has somewhere on the title to be banked');
});
