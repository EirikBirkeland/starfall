#!/usr/bin/env node
// Which way the bot dashes, how often, and what that is worth. A check and not a decoration: with
// `--strict` it exits non-zero when the habit `tools/headless/bot.js` ships is not the best of the
// habits that press the dash.
//
//   node tools/dash-habit.js                        the ladder, on the shipped defaults
//   node tools/dash-habit.js --seeds 16             a wider batch (slower: a 15-minute run is ~25 s here)
//   node tools/dash-habit.js --seconds 900          a longer window
//   node tools/dash-habit.js --bot human --picks random   the careless person the difficulty band is read on
//   node tools/dash-habit.js --habits off,escape    two of them instead of four
//   node tools/dash-habit.js --trigger 60           how cornered the bot has to be before it presses
//   node tools/dash-habit.js --push 200             how far out bodies vote on which way is out
//   node tools/dash-habit.js --strict               non-zero unless the shipped habit wins
//
// Why this exists at all: the habit that shipped up to 0.10.19 pressed the dash *at* the nearest
// body, and a dash with no key held goes the way the cursor points - so the bot threw itself at
// whatever frightened it, and moved its guns to do it. Every number quoted for a dash line
// (game/afterimage.js, game/tether.js) was priced against that bot, which is why this file is a
// check: an instrument that costs the thing it measures runs is worse than no instrument.
//
// The second question, which turned out to matter more than the first, is *when* to press, and that
// is what --trigger sweeps. The first habit pressed whenever a body was 170 px away, which in a
// crowd is every cooldown forever, and the batches say a bot that spends its dashes that way is a
// bot that spends them badly.
//
// What is printed per habit is not only how long the runs lasted. `at a body` is how many of the
// dashes pointed at the nearest body when they started, `ended in a mob` how many landed the ship
// within a body's reach of another body, `into a wall` how many finished against the edge of the
// world, and `hull after` is the hull lost in the 0.6 s after a dash ended - a dash that buys a
// free get-out and then costs a hull the moment it is over has bought nothing.
//
// The verdict is bought with the middle *score* and not with the middle of the deaths, and that is
// the second lesson this file exists for: a habit can stretch the deaths out and play worse at the
// same time. Pressing whenever a body was 170 px out kept the careless aware batch alive a little
// longer than never dashing at all (5m11s against 4m23s) while halving what those runs scored
// (5,773 against 12,914), because a ship that spends every cooldown running is a ship that is not
// standing its ground and shooting. A run is worth what it scores.

import { playBatches, nearestEnemy, DASH_HABITS, DEFAULT_DASH_HABIT, POLICIES, PICKS, setDashDial } from './headless/bot.js';
import { table, clock, int, dec, share } from './headless/tables.js';

const FRAME_MS = 1000 / 60;
/** A dash that ends this near another body ended in the crowd it was trying to leave. */
const MOB_RANGE = 60;
/** How far short of the edge counts as spending the dash on the edge. */
const WALL_RANGE = 110;
/** How long after a dash a hull still counts as the dash's fault. */
const AFTER_FRAMES = 36;
/** A batch smaller than this cannot rank two habits; it can only show you the runs. */
const MIN_SEEDS = 8;
/** How much better another habit has to be before it beats the shipped one. */
const TIE_RATIO = 1.1;

const DEFAULTS = {
  seeds: 8,
  seconds: 300,
  habits: 'off,escape,dive,along',
  // The careless build, on purpose: on the careful one nothing dies inside any window anybody
  // can afford, and a ladder that always answers "not measured" is noise. `--bot aware`
  // (the default policy) with `--picks random` is the player the difficulty band is read on,
  // and it dies at a middle of a few minutes on a batch this size.
  policy: 'aware',
  picks: 'random',
  trigger: null,
  push: null,
  strict: false,
};

function readArgs(argv) {
  const opts = Object.assign({}, DEFAULTS);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => { i++; return argv[i]; };
    if (arg === '--seeds') opts.seeds = parseInt(next(), 10);
    else if (arg === '--seconds') opts.seconds = parseFloat(next());
    else if (arg === '--habits') opts.habits = next();
    else if (arg === '--bot') opts.policy = next();
    else if (arg === '--picks') opts.picks = next();
    else if (arg === '--trigger') opts.trigger = Number(next());
    else if (arg === '--push') opts.push = Number(next());
    else if (arg === '--strict') opts.strict = true;
    else { console.error('unknown option: ' + arg); process.exit(2); }
  }
  if (!Number.isFinite(opts.seeds) || !Number.isFinite(opts.seconds) || opts.seeds < 1) {
    console.error('--seeds wants a count and --seconds a number of seconds');
    process.exit(2);
  }
  // Checked before a single run, because a batch is minutes of work.
  for (const name of opts.habits.split(',')) {
    if (DASH_HABITS[name] === undefined) {
      console.error('--habits wants some of: ' + Object.keys(DASH_HABITS).join(', '));
      process.exit(2);
    }
  }
  if (opts.policy !== undefined && POLICIES[opts.policy] === undefined) {
    console.error('--bot wants one of: ' + Object.keys(POLICIES).join(', '));
    process.exit(2);
  }
  if (opts.picks !== undefined && PICKS[opts.picks] === undefined) {
    console.error('--picks wants one of: ' + Object.keys(PICKS).join(', '));
    process.exit(2);
  }
  for (const value of [opts.trigger, opts.push]) {
    if (value !== null && !Number.isFinite(value)) {
      console.error('--trigger and --push want a number of pixels');
      process.exit(2);
    }
  }
  return opts;
}

/** Median, or null for nothing: a habit whose batch never died has no middle of deaths to show. */
function median(values) {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * One run's dash sheet, filled by `onFrame` as the run goes and closed when the run ends.
 *
 * Every field is a *reading* of the ship, never a write to it: this file must not be able to
 * change a run, only to describe it. The habit itself is applied by `playOneRun`, which is the
 * only way a habit gets into these runs at all.
 */
function newSheet() {
  return {
    dashes: 0, toward: 0, mobEnds: 0, wallEnds: 0, hullAfter: 0,
    pending: null, watch: 0, wasDashing: false,
  };
}

/** Called on the frame after each step: watch the dash state and write down what it did. */
function readFrame(game, sheet) {
  const ship = game.player;
  const dashing = ship.dashLeft > 0;
  if (dashing && !sheet.wasDashing) {
    const near = nearestEnemy(game);
    sheet.pending = { toward: false, hull: ship.hull };
    if (near !== null) {
      const d = Math.sqrt(near.distance2) || 1;
      const dot = ship.dashDirX * (near.enemy.x - ship.x) / d
        + ship.dashDirY * (near.enemy.y - ship.y) / d;
      // More than a quarter of the way round towards it. Exactly sideways is not a dive, and a
      // dash that slides along a line of bodies is a way of leaving, not of arriving.
      if (dot > 0.25) sheet.pending.toward = true;
    }
  }
  if (!dashing && sheet.wasDashing && sheet.pending) {
    const field = game.world.field;
    sheet.dashes++;
    if (sheet.pending.toward) sheet.toward++;
    if (ship.x < field.x0 + WALL_RANGE || ship.y < field.y0 + WALL_RANGE
      || ship.x > field.x1 - WALL_RANGE || ship.y > field.y1 - WALL_RANGE) sheet.wallEnds++;
    const near = nearestEnemy(game);
    if (near !== null && near.distance2 < MOB_RANGE * MOB_RANGE) sheet.mobEnds++;
    sheet.watch = AFTER_FRAMES;
  }
  // The 0.6 s after a dash: any hull gone in here is a dash that got out and could not stay out.
  if (sheet.watch > 0 && sheet.pending) {
    if (ship.hull < sheet.pending.hull) {
      sheet.hullAfter += sheet.pending.hull - ship.hull;
      sheet.pending.hull = ship.hull;
    }
    sheet.watch--;
  }
  sheet.wasDashing = dashing;
}

/** Play every habit on the same seeds and return one row of numbers per habit. */
async function measure(opts) {
  const names = opts.habits.split(',');
  const rows = [];

  const batches = names.map((name) => {
    // One collector per habit, filled run by run. `current` is the run being flown now; the one
    // before it is already in `sheet` by the time the next run starts, because playBatches tells
    // us a run has finished before it starts another.
    const finished = [];
    let current = newSheet();
    return {
      batch: {
        seeds: Array.from({ length: opts.seeds }, (unused, i) => i + 1),
        maxSeconds: opts.seconds,
        policy: opts.policy,
        picks: opts.picks,
        dash: name,
        onFrame: (game) => readFrame(game, current),
        onRun: (summary) => {
          current.died = summary.died;
          current.seconds = summary.seconds;
          current.score = summary.stats.score;
          current.hullLost = summary.tally.hullLost;
          finished.push(current);
          current = newSheet();
        },
      },
      report: () => {
        const deaths = finished.filter((s) => s.died).map((s) => s.seconds);
        const sum = (pick) => finished.reduce((total, s) => total + pick(s), 0);
        return {
          habit: name,
          middleDeath: median(deaths),
          died: deaths.length,
          middleScore: median(finished.map((s) => s.score)),
          dashes: sum((s) => s.dashes) / finished.length,
          toward: sum((s) => s.toward),
          mobEnds: sum((s) => s.mobEnds),
          wallEnds: sum((s) => s.wallEnds),
          dashCount: sum((s) => s.dashes),
          hullAfter: sum((s) => s.hullAfter),
          hullLost: sum((s) => s.hullLost),
        };
      },
    };
  });

  await playBatches(batches.map((b) => b.batch));
  for (const b of batches) rows.push(b.report());
  return rows;
}

const opts = readArgs(process.argv.slice(2));
// The habit's own dials, put over before a single run. "How cornered before the dash is worth
// pressing" is a habit and not a law, so it is swept here and the winning number is written back
// into bot.js as the shipped one.
const dial = {};
if (opts.trigger !== null) dial.trigger = opts.trigger;
if (opts.push !== null) dial.push = opts.push;
if (Object.keys(dial).length > 0) setDashDial(dial);
const rows = await measure(opts);

const title = 'the dash habits, on ' + opts.seeds + ' seeds of ' + clock(opts.seconds)
  + ', ' + (opts.policy === undefined ? 'aware' : opts.policy) + ' bot'
  + (opts.picks === undefined ? '' : ' answering the level-up ' + opts.picks)
  + (opts.trigger === null ? '' : ', a body within ' + opts.trigger + ' px counting as trouble')
  + (opts.push === null ? '' : ', bodies within ' + opts.push + ' px voting on the way out');
const note = 'The middle of the batch\'s deaths is the number a habit is worth; a run that never died\n'
  + 'has no death to be the middle of, and is counted in `died` and not in it. `at a body` is how the\n'
  + 'dash was pointed when it started, `ended in a mob` and `into a wall` is where it finished, and\n'
  + '`hull after` is the hull lost in the ' + dec(AFTER_FRAMES * FRAME_MS / 1000, 1)
  + 's after a dash ended, over the whole batch.';
console.log(table(title, note,
  ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
  ['habit', 'middle death', 'died', 'middle score', 'dashes/run', 'at a body', 'ended in a mob',
    'into a wall', 'hull after', 'hull lost'],
  rows.map((row) => [
    row.habit === DEFAULT_DASH_HABIT ? row.habit + ' *' : row.habit,
    row.middleDeath === null ? 'never died' : clock(row.middleDeath),
    row.died + '/' + opts.seeds,
    int(row.middleScore),
    dec(row.dashes, 1),
    share(row.toward, row.dashCount),
    share(row.mobEnds, row.dashCount),
    share(row.wallEnds, row.dashCount),
    dec(row.hullAfter, 1),
    dec(row.hullLost, 1),
  ])));

const shipped = rows.find((row) => row.habit === DEFAULT_DASH_HABIT);
if (shipped === undefined) {
  // The habits are a list a person chooses, and a ladder that did not measure the shipped one has
  // no verdict in it to print.
  console.log('--habits did not include `' + DEFAULT_DASH_HABIT + '`, the shipped habit, so there is '
    + 'nothing to verdict on. The rows above are the ones you asked for.');
  process.exit(0);
}
// What a habit is worth is the score its batch made, and not how long it lasted. That is the whole
// lesson of the sweep that wrote this file: a habit that spends a dash on every cooldown can stretch
// the middle of the deaths out - it is running away from the crowd all game - while making half the
// score of a bot that never presses, because a run that is always fleeing is a run that is not
// shooting. The middle of deaths stays printed because it is the number the difficulty band is read
// in, but the verdict is bought with the score.
const worth = (row) => row.middleScore;
const asText = (row) => (row.middleDeath === null
  ? 'a batch that never died at ' + int(row.middleScore)
  : clock(row.middleDeath) + ' at ' + int(row.middleScore));
// `off` is not a habit a person has: it is the same bot with the key left alone, and it is here as
// the floor a habit is measured against and not as one of the habits. A run that never presses the
// dash is also a run no dash line can be priced on.
const dashers = rows.filter((row) => row.habit !== 'off');
const best = dashers.slice().sort((a, b) => worth(b) - worth(a))[0];
const plain = rows.find((row) => row.habit === 'off');
console.log('');
console.log('the shipped habit is `' + DEFAULT_DASH_HABIT + '` (marked *) at ' + asText(shipped)
  + '; the best-scoring habit that presses the dash at all is `' + (best === undefined ? 'none'
    : best.habit + '` at ' + asText(best)) + '.');
if (plain !== undefined) {
  console.log('The same bot leaving the dash alone (`off`) middles at ' + asText(plain)
    + ', and that is the floor: a habit under it costs more than it buys.');
}

let failures = 0;
if (opts.seeds < MIN_SEEDS) {
  console.log('note: ' + opts.seeds + ' seeds is below the ' + MIN_SEEDS
    + ' this file will rank anything on; it is showing you runs, not a verdict.');
} else if (rows.every((row) => row.died === 0)) {
  // The honest null. Every habit kept every run alive to the cap, so there is no middle of any
  // deaths to compare and a PASS here would be a claim about a window that measured nothing.
  failures++;
  console.log('NOTHING RANKED: nothing died in this window. A shorter --seconds or --picks random is '
    + 'what makes this a verdict, and --strict will not call an unmeasured thing a pass.');
} else if (best !== undefined && best.habit !== DEFAULT_DASH_HABIT
  && worth(best) > worth(shipped) * TIE_RATIO) {
  failures++;
  console.log('FAIL: `' + best.habit + '` scores better than the shipped habit does - '
    + asText(best) + ' against ' + asText(shipped) + '.');
} else if (plain !== undefined && worth(shipped) < worth(plain) / TIE_RATIO) {
  // The one that got past the first version of this file: a habit that survives a bit longer and
  // scores a great deal less, which is a habit that is running instead of playing.
  failures++;
  console.log('FAIL: the shipped habit scores under the bot that never presses - '
    + asText(shipped) + ' against ' + asText(plain) + '. A dash habit that costs the run more than '
    + 'the dash it spends is not a habit worth shipping.');
} else {
  console.log('PASS: no habit that dashes beats the shipped one by more than '
    + Math.round((TIE_RATIO - 1) * 100) + '%, and the shipped one is not behind the floor by that '
    + 'much either.');
}
if (shipped.dashCount === 0) {
  failures++;
  console.log('FAIL: the shipped habit never pressed the dash once, so nothing about it was measured.');
}
if (opts.strict && failures > 0) process.exit(1);
