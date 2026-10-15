// The daily run (PLAN milestone 10): one arena a day, the same one for everybody, and that day's
// own best score.
//
// Everything here is a *label* and a *book*, never a mechanic. A daily run is an ordinary run flown
// on a seed nobody chose - the day's own number, scrambled (core/rng.js `seedFor`) so that the
// hundred-and-twelfth of October is not the hundred-and-eleventh with one drifter moved. Same ship,
// same deck, same crowd, same purse: what the day adds is that the arena is the one everybody else
// is flying today, and that the best score on it is kept beside the all-time best instead of
// drowning in it. Nothing in `stepWorld` reads any of this, so the reference run traces byte for
// byte whether a daily was ever flown.
//
// Three decisions worth having written down:
//
//   **The day is the player's own, not the clock's.** The date is read locally (`getFullYear` and
//   friends), so "today" is the day on the machine the game is being played on. A shared UTC day
//   would be the more globally-consistent answer and the less honest one: it would call yesterday's
//   arena "today" for half the planet for a few hours, and it would reset a player's best at four
//   in the afternoon. Two people comparing scores are almost always in the same day already; a
//   daily you cannot fly because it is not yet today where you are is the broken promise.
//
//   **One day is kept, not a history.** The save holds the latest day it has seen and the best score
//   on it, which is everything the game can still be compared against. Yesterday's best is a number
//   nothing in the game can do anything with once today has begun, and a stored field nothing reads
//   is a field that quietly rots. If a week of them is ever wanted it wants a table and a panel, and
//   that is a feature and not a second field.
//
//   **A daily run banks everything an ordinary run banks** - the all-time best, the purse, the
//   codex, the awards, the log - because it *is* a run, and a run that paid half as much for being
//   on the same seed as everybody else would be a punishment for taking the challenge. The day's
//   best is an extra line on top, which is what makes it a challenge and not a second mode.
//
// The clock is asked for in exactly one place, `todayDay` below, and never during a step: a run
// launched at 23:59:59 belongs to the day it started on even when it is still flying after midnight,
// and a run's own facts must not move while it is being flown.

import { remember, section } from '../core/save.js';
import { seedFor } from '../core/rng.js';

// A day is written the way a date is spoken: 2026-10-12 is the number 20261012. It is a label and
// not a duration - nothing is ever measured against it, no interval is ever taken between two of
// them - which is why an integer is a good enough shape for it: the save can hold it, a test can
// read it, and a player can read it out of storage without a decoder.
const YEAR_WIDTH = 10000;   // ... four digits of month-and-day under the year
const MONTH_WIDTH = 100;    // ... and two digits of day under the month

/** Which day this date belongs to, in the number above. */
export function dayOf(date) {
  return date.getFullYear() * YEAR_WIDTH
    + (date.getMonth() + 1) * MONTH_WIDTH
    + date.getDate();
}

/** Two digits, so the twelfth does not come out as `2026-10-2`. */
function two(value) {
  return String(value).padStart(2, '0');
}

/** The month and the day, out of a day number: the year is not what a short word wants. */
function monthAndDay(day) {
  const rest = day % YEAR_WIDTH;
  return two(Math.floor(rest / MONTH_WIDTH)) + '-' + two(rest % MONTH_WIDTH);
}

/** The day in the words a card prints it in: `2026-10-12`. */
export function dayWords(day) {
  return Math.floor(day / YEAR_WIDTH) + '-' + monthAndDay(day);
}

/** The same day short enough for the corner of a HUD: `10-12`. */
export function shortDayWords(day) {
  return monthAndDay(day);
}

/**
 * The day the visit is standing in, on the machine it is standing on. The one place in the game
 * that asks the clock what it is: whoever needs a day asks for this and keeps the number.
 */
export function todayDay() {
  return dayOf(new Date());
}

/** The seed the arena of one day is flown on. */
export function seedForDay(day) {
  return seedFor(day);
}

/**
 * What the best score of one day is, out of the save: 0 for a save that has not flown that day,
 * which is a real answer and not a missing one - nobody has beaten nothing yet.
 *
 * This reads storage, so it is asked at an ending and when a title is painted, and never while a run
 * is flying. It is asked *for the day it cares about* rather than for "today", which is what makes a
 * run that was launched before midnight and ended after it be scored on the day it belonged to.
 */
export function bestOnDay(day) {
  const kept = section('daily', { day: 0, best: 0 });
  return kept.day === day ? kept.best : 0;
}

/**
 * Fly today's arena. Whoever launches a run calls this before `startRun` (main.js), and it is the
 * only thing that decides a run is a daily one: the seed goes with the day, because a daily arena
 * is the day and nothing else. Returns the day that is now being flown.
 */
export function beginDailyRun(world) {
  const day = todayDay();
  world.dailyDay = day;
  world.seed = seedForDay(day);
  return day;
}

/** Fly an arena of this run's own again. Ordinary runs say so by having no day at all. */
export function endDailyRun(world) {
  world.dailyDay = 0;
}

/**
 * Bank this run against its day (game/run.js `bankRun` is the only caller, and it calls once per
 * ending). False when there was nothing to bank - an ordinary run, or a daily one that did not beat
 * what the day already had - and true when the day has a new best score, which is what lights the
 * card's own line.
 *
 * The same bargain as the all-time best above it in `bankRun`: a run that is won, handed its arena
 * back and finally goes down is banked twice, and the second ending only wins if the run came out
 * bigger than its own first ending, which it nearly always has. `world.newDailyBest` is written by
 * the caller out of this answer, the same way `world.newBest` is written out of `score > best`.
 */
export function bankDaily(world) {
  const day = world.dailyDay;
  if (day === 0) return false;
  if (world.score <= bestOnDay(day)) return false;
  remember('daily', { day: day, best: world.score });
  return true;
}

/**
 * What the title says about today, on the line that says what the visit has banked: `TODAY 3,000`, or
 * nothing at all for a day this save has not flown yet - a number that is not a number nobody scored
 * is not shown, and the three numbers on that line are then always three facts and never a placeholder.
 * The key that flies the day is on the launch line, where the other launch keys are (index.html), and
 * the day's own date is on the run's card and beside its clock: this line is the fourth banked number
 * and nothing more, because the title's column is exactly as tall as the window it was built for.
 */
export function titleWords() {
  const best = bestOnDay(todayDay());
  return best > 0 ? 'TODAY ' + best.toLocaleString('en-US') : '';
}

/**
 * What an ending's card says about the day its run was flown on, or '' for a run that flew an arena
 * of its own (and an empty line takes its space with it, index.html `.daily-line`). The day's best is
 * read out of the save rather than off the run, which is what makes it the day's and not this
 * ending's: a run that beat the day says NEW, and a run that did not says what the day's best still
 * is, which is the number the player will want to know they are short of.
 *
 * Takes anything that says which day a run was flown on and whether this ending beat it - the world,
 * or the summary an ending's card is painted from (main.js `describeRun`).
 */
export function cardWords(run) {
  if (run.dailyDay === 0) return '';
  if (run.newDailyBest) return 'TODAY ' + dayWords(run.dailyDay) + ' \u00b7 NEW BEST TODAY';
  return 'TODAY ' + dayWords(run.dailyDay)
    + ' \u00b7 ' + bestOnDay(run.dailyDay).toLocaleString('en-US') + ' BEST TODAY';
}

/**
 * One row on the pause's rack for a run that is flying one: the day, and nothing else. Null for a run
 * that is not, which is how the rack leaves the row out (ui/screens.js `factLines`). Takes the world
 * or a pause summary, as `cardWords` does.
 */
export function pauseWords(run) {
  if (run.dailyDay === 0) return null;
  return { name: 'TODAY', says: dayWords(run.dailyDay) };
}

/** The mark beside the run's clock while it is flying one: `TODAY 10-12`. */
export function hudWords(world) {
  if (world.dailyDay === 0) return '';
  return 'TODAY ' + shortDayWords(world.dailyDay);
}
