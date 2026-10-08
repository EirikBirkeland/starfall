#!/usr/bin/env node
// Play a whole game with no browser and report on it.
//
//   node tools/simulate.js                    one run, default seed
//   node tools/simulate.js --seed 7           a different run
//   node tools/simulate.js --runs 20          a batch of runs, and the middle one
//   node tools/simulate.js --seconds 120      stop after this many game seconds
//   node tools/simulate.js --bot naive         play it the plain way (see below)
//   node tools/simulate.js --dash              let the bot dash when a body gets close
//   node tools/simulate.js --weapon scatter    fly another primary (game/weapons.js: pulse,
//                                              scatter, arc)
//   node tools/simulate.js --need 300         exit non-zero unless the batch mediates
//                                             this many seconds (PLAN's survival check)
//   node tools/simulate.js --trace            print a state fingerprint over time
//   node tools/simulate.js --audio            boot with a fake audio device
//
// One run prints what that run was. A batch adds a line for the set: how many were
// still flying when the window shut, and the *middle* run of it, with the mean beside
// it. The middle is what PLAN's survival check is written against and a mean is not
// that number - a batch of runs is lopsided, two early wrecks drag the average down
// and say nothing about the run in the middle of the set. `--need` is that check as an
// exit code instead of an eye test.
//
// The bot is tools/headless/bot.js. `aware`, the default, shoots the nearest thing
// and steps out of whatever is on its way to the ship; `naive` shoots the nearest
// thing and only backs away from whatever is already close. Neither of them dashes until
// `--dash` is asked for, which is the only way a line that lives on the dash
// (game/afterimage.js) can be measured at all. This script must always
// finish without throwing; the one exit it may choose for itself is `--need`.

import { pathToFileURL } from 'node:url';
import { clock, int, dec } from './headless/tables.js';
import { playRuns, dashEscape, POLICIES } from './headless/bot.js';

function readArgs(argv) {
  const opts = { seed: 1, runs: 1, seconds: 600, trace: false, audio: false, every: 120, policy: undefined, weapon: undefined, need: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      i++;
      return argv[i];
    };
    if (arg === '--seed') opts.seed = parseInt(next(), 10);
    else if (arg === '--runs') opts.runs = parseInt(next(), 10);
    else if (arg === '--seconds') opts.seconds = parseFloat(next());
    else if (arg === '--bot') opts.policy = next();
    else if (arg === '--weapon') opts.weapon = next();
    else if (arg === '--need') opts.need = parseFloat(next());
    else if (arg === '--trace') opts.trace = true;
    else if (arg === '--dash') opts.dash = true;
    else if (arg === '--audio') opts.audio = true;
    else {
      console.error('unknown option: ' + arg);
      process.exit(2);
    }
  }
  if (!Number.isFinite(opts.seed) || !Number.isFinite(opts.runs) || !Number.isFinite(opts.seconds)) {
    console.error('--seed, --runs and --seconds want a number');
    process.exit(2);
  }
  if (opts.policy !== undefined && !POLICIES[opts.policy]) {
    console.error('--bot wants one of: ' + Object.keys(POLICIES).join(', '));
    process.exit(2);
  }
  if (opts.runs < 1) {
    console.error('--runs wants at least one run');
    process.exit(2);
  }
  if (opts.need !== undefined && !Number.isFinite(opts.need)) {
    console.error('--need wants a number of seconds');
    process.exit(2);
  }
  return opts;
}

function reportLine(summary) {
  const s = summary.stats;
  return 'seed ' + summary.seed
    + '  ' + summary.policy
    + '  gun ' + summary.stats.weapon
    + '  ' + (summary.died ? 'died' : 'alive at the cap')
    + '  ' + clock(summary.seconds)
    + '  score ' + s.score
    + '  level ' + s.level
    + '  kills ' + s.kills
    + '  shards ' + s.collected
    + '  hull ' + s.hull
    // What the run was built from, in the order game/upgrades.js lists the lines.
    + '  build ' + Object.values(s.ranks).join('/');
}

/**
 * The middle of a set of numbers: the one in the middle of the sorted set, or the
 * middle of the two that are when there is no single one. Exported so a test can put
 * it on numbers it made up rather than on twenty bot runs.
 */
export function median(values) {
  if (values.length === 0) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
}

/** The middle of a batch for one field of it, with the mean and the earliest run. */
function spread(summaries, pick) {
  const values = summaries.map(pick);
  let sum = 0;
  for (const value of values) sum += value;
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    mean: sum / values.length,
    median: median(values),
    // The shortest run of the set - the early wreck a median and a mean both hide.
    // (The longest is not printed: in a capped batch it is the cap.)
    worst: sorted[0],
  };
}

/**
 * A batch of finished runs, counted up. `cap` is the window every one of them was cut
 * short at: when most of a batch is `atCap` its median is a floor and not a survival
 * time, which is why the two are always printed together.
 */
export function aggregate(summaries, cap) {
  return {
    runs: summaries.length,
    policy: summaries[0].policy,
    weapon: summaries[0].stats.weapon,
    cap: cap,
    atCap: summaries.filter((summary) => !summary.died).length,
    seconds: spread(summaries, (summary) => summary.seconds),
    score: spread(summaries, (summary) => summary.stats.score),
    level: spread(summaries, (summary) => summary.stats.level),
    kills: spread(summaries, (summary) => summary.stats.kills),
  };
}

/** A count whose middle can land between two whole numbers. */
function count(value) {
  return Number.isInteger(value) ? int(value) : dec(value, 1);
}

/** The set as one line: the middle run, the mean beside it, and how many never died. */
export function batchLine(batch) {
  return 'batch of ' + batch.runs + ' runs, ' + batch.policy + ' bot, gun ' + batch.weapon
    + ': median ' + clock(batch.seconds.median)
    + ', mean ' + clock(batch.seconds.mean)
    + ', worst ' + clock(batch.seconds.worst)
    + ', ' + batch.atCap + '/' + batch.runs + ' still flying at the ' + clock(batch.cap) + ' cap';
}

/** The same batch, in the columns that are not time. */
export function batchStatsLine(batch) {
  return '  score median ' + count(batch.score.median) + ' mean ' + count(batch.score.mean)
    + '  |  level median ' + count(batch.level.median) + ' mean ' + count(batch.level.mean)
    + '  |  kills median ' + count(batch.kills.median) + ' mean ' + count(batch.kills.mean);
}

/** Only run when called as a command, so the tests can import the parts above. */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const opts = readArgs(process.argv.slice(2));

  const summaries = await playRuns({
    seeds: Array.from({ length: opts.runs }, (unused, i) => opts.seed + i),
    maxSeconds: opts.seconds,
    audio: opts.audio,
    every: opts.trace ? opts.every : 0,
    policy: opts.policy,
    weapon: opts.weapon,
    onFrame: opts.dash ? dashEscape : undefined,
    // Printed as each run finishes: a batch of twenty long ones is minutes of work and
    // a silent terminal cannot be told apart from a stuck one.
    onRun: (summary) => {
      console.log(reportLine(summary));
      if (opts.trace) console.log('trace ' + summary.trace.join(' '));
      if (!summary.died) console.log('note: the bot survived the whole ' + opts.seconds + 's window.');
    },
  });

  for (const summary of summaries) {
    if (summary.stats.score <= 0) {
      throw new Error('the bot never scored: the game is not playable headless');
    }
  }

  if (summaries.length > 1) {
    const batch = aggregate(summaries, opts.seconds);
    console.log(batchLine(batch));
    console.log(batchStatsLine(batch));
    if (opts.need !== undefined) {
      const reached = batch.seconds.median >= opts.need;
      console.log('survival check: the median run lasted ' + clock(batch.seconds.median)
        + ' against the ' + clock(opts.need) + ' it needs - ' + (reached ? 'pass' : 'FAIL'));
      // The exit code, not a thrown Error: the runs all played, the batch is simply short.
      process.exitCode = reached ? 0 : 1;
    }
  } else if (opts.need !== undefined) {
    console.error('--need wants a batch: one run is its own median and proves nothing');
    process.exit(2);
  }
}
