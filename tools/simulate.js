#!/usr/bin/env node
// Play a whole game with no browser and report on it.
//
//   node tools/simulate.js                    one run, default seed
//   node tools/simulate.js --seed 7           a different run
//   node tools/simulate.js --runs 20          a batch of runs, and the middle one
//   node tools/simulate.js --seconds 120      stop after this many game seconds
//   node tools/simulate.js --bot naive         play it the plain way (see below)
//   node tools/simulate.js --bot human         play it at a person's speed (tools/headless/human.js)
//   node tools/simulate.js --picks random      answer the level-up with a die instead of a
//                                              build (tools/headless/bot.js PICKS; what
//                                              tools/difficulty-arc.js measures with)
//   node tools/simulate.js --dash              let the bot dash when a body gets close
//   node tools/simulate.js --weapon scatter    fly another primary (game/weapons.js: pulse,
//                                              scatter, arc, lance, swarm)
//   node tools/simulate.js --ship bulwark      fly another ship (game/ships.js: wisp,
//                                              bulwark, volt, needle, brood) - and with it,
//                                              that ship's own primary, unless --weapon
//                                              is asked for as well
//   node tools/simulate.js --need 300         exit non-zero unless the batch mediates
//                                             this many seconds (PLAN's survival check)
//   node tools/simulate.js --at 295           start the run's clock there instead of at 0, so
//                                             the run is measured from five minutes in (which is
//                                             where PLAN 3.4 puts the first boss, and the only
//                                             way a bot that dies at a minute ever sees one)
//   node tools/simulate.js --trace            print a state fingerprint over time
//   node tools/simulate.js --audio            boot with a fake audio device, and print what
//                                             the mix made of it
//
// One run prints what that run was: a wreck, a win (the schedule out and the ship still
// standing, game/run.js `winRun`), or a run still flying when the window shut. A batch adds a
// line for the set: how many were still flying when the window shut, and the *middle* run of it,
// with the mean beside it. The middle is what PLAN's survival check is written against and a mean
// is not
// that number - a batch of runs is lopsided, two early wrecks drag the average down
// and say nothing about the run in the middle of the set. `--need` is that check as an
// exit code instead of an eye test.
//
// The bot is tools/headless/bot.js. `aware`, the default, shoots the nearest thing
// and steps out of whatever is on its way to the ship; `naive` shoots the nearest
// thing and only backs away from whatever is already close; `human` has the aware bot's
// eyes behind a person's hands - it looks a fifth of a second at a time and a quarter of
// its looks are at the wrong thing (tools/headless/human.js). None of them dashes until
// `--dash` is asked for, which is the only way a line that lives on the dash
// (game/afterimage.js) can be measured at all. This script must always
// finish without throwing; the one exit it may choose for itself is `--need`.

import { pathToFileURL } from 'node:url';
import { clock, int, dec } from './headless/tables.js';
import { playRuns, dashEscape, POLICIES, PICKS } from './headless/bot.js';
import { MIX, ledgerOf } from '../src/audio/mix.js';
import { musicLedger } from '../src/audio/music.js';
import { noiseVoices } from '../src/audio/noise.js';

function readArgs(argv) {
  const opts = { seed: 1, runs: 1, seconds: 600, trace: false, audio: false, every: 120, policy: undefined, picks: undefined, ship: undefined, weapon: undefined, need: undefined, at: undefined };
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
    else if (arg === '--picks') opts.picks = next();
    else if (arg === '--weapon') opts.weapon = next();
    else if (arg === '--ship') opts.ship = next();
    else if (arg === '--need') opts.need = parseFloat(next());
    else if (arg === '--at') opts.at = parseFloat(next());
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
  if (opts.picks !== undefined && !PICKS[opts.picks]) {
    console.error('--picks wants one of: ' + Object.keys(PICKS).join(', '));
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
  if (opts.at !== undefined && !(opts.at >= 0)) {
    console.error('--at wants a number of seconds to start the run clock at');
    process.exit(2);
  }
  return opts;
}

/** What one finished run was, as one line. Exported so a test can read the line without a run. */
export function reportLine(summary) {
  const s = summary.stats;
  return 'seed ' + summary.seed
    + '  ' + summary.policy
    + (summary.picks !== undefined && summary.picks !== 'wise' ? ' picks ' + summary.picks : '')
    + '  ship ' + summary.stats.ship
    + '  gun ' + summary.stats.weapon
    + '  ' + (summary.won ? 'WON' : summary.died ? 'died' : 'alive at the cap')
    + '  ' + clock(summary.seconds)
    + '  score ' + s.score
    + '  level ' + s.level
    + '  kills ' + s.kills
    + '  shards ' + s.collected
    + '  hull ' + s.hull
    // A boss worth naming: which one, how much of it was left when the run stopped, and how many
    // came down (game/bosses.js). Without this a boss fight is invisible in the report.
    + (s.boss !== '' ? '  boss ' + s.boss + ' @' + Math.round(s.bossHull * 100) + '% phase ' + s.bossPhase : '')
    + (s.bossCells > 0 ? ' mass ' + s.bossCells : '')
    // Only when there is more than one, which is only ever a fight that has come apart: the number
    // is the answer to "how many bodies is it still standing on" (game/bosses.js `coresStanding`).
    + (s.bossCores > 1 ? ' bodies ' + s.bossCores : '')
    + (s.bossesDown > 0 ? '  bosses down ' + s.bossesDown : '')
    // How many times the point vacuum opened and what it carried in (game/vacuum.js). Only when it
    // happened: a short run never reaches the first threshold, and a zero on every line would be a
    // column nobody reads.
    + (s.vacuumEvents > 0 ? '  vacuums ' + s.vacuumEvents + ' (' + s.vacuumSwallowed + ' in)' : '')
    // And, when the run ended, what it ended of: a swarm, a wall, a spoke. The tally keeps it
    // (game/tally.js) and it is the difference between a balance number and a guess.
    + (summary.died ? '  killed by ' + (s.killedBy || 'nothing') : '')
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
    picks: summaries[0].picks === undefined ? 'wise' : summaries[0].picks,
    ship: summaries[0].stats.ship,
    weapon: summaries[0].stats.weapon,
    cap: cap,
    atCap: summaries.filter((summary) => !summary.died && !summary.won).length,
    // A win is an ending and not a survival, and a batch that had one in it should say so: it is
    // the only number here that says the schedule was beaten at all (game/bosses.js).
    wins: summaries.filter((summary) => summary.won).length,
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
  return 'batch of ' + batch.runs + ' runs, ' + batch.policy + ' bot'
    + (batch.picks === 'wise' ? '' : ' answering the level-up with a die')
    + ', ship ' + batch.ship
    + ', gun ' + batch.weapon
    + ': median ' + clock(batch.seconds.median)
    + ', mean ' + clock(batch.seconds.mean)
    + ', worst ' + clock(batch.seconds.worst)
    + (batch.wins > 0 ? ', ' + batch.wins + ' won' : '')
    + ', ' + batch.atCap + '/' + batch.runs + ' still flying at the ' + clock(batch.cap) + ' cap';
}

/** The same batch, in the columns that are not time. */
export function batchStatsLine(batch) {
  return '  score median ' + count(batch.score.median) + ' mean ' + count(batch.score.mean)
    + '  |  level median ' + count(batch.level.median) + ' mean ' + count(batch.level.mean)
    + '  |  kills median ' + count(batch.kills.median) + ' mean ' + count(batch.kills.mean);
}

/**
 * How long the music spent in each of its patterns, in the order they were first heard
 * (audio/music.js `patternFor`). A run's intensity curve in one line: a bot that never made it
 * to two minutes never gets a `driving` in here, and one that spent its last minute on one hull
 * says so.
 */
export function patternsLine(heard) {
  const parts = [];
  for (const name of Object.keys(heard)) parts.push(name + ' ' + clock(heard[name]));
  return parts.length ? parts.join(', ') : 'silent';
}

/**
 * What the mix did, on a run that had an audio device to do it on (audio/mix.js keeps the
 * books and audio/music.js keeps its own). This is how a change to the sound is measured
 * instead of hoped for: a bus that has run out of headroom shows up here as a pile of
 * turned-away voices long before anybody can hear it.
 */
function mixLine() {
  const ledger = ledgerOf();
  const music = musicLedger();
  return 'mix: ' + int(ledger.asked) + ' voices asked, ' + int(ledger.played) + ' played, '
    + int(ledger.dropped) + ' turned away (loudest of them ' + dec(ledger.loudestDropped, 3)
    + ') | peak ' + dec(ledger.peakLoad, 2) + ' of ' + MIX.headroom + ' at once, in '
    + int(ledger.peakVoices) + ' voices | ' + int(noiseVoices()) + ' noise voices | music '
    + int(music.notes) + ' notes over ' + int(music.steps) + ' steps, '
    + int(music.drums) + ' of them drums | ' + patternsLine(music.heard);
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
    picks: opts.picks,
    ship: opts.ship,
    weapon: opts.weapon,
    at: opts.at,
    onFrame: opts.dash ? dashEscape : undefined,
    // Printed as each run finishes: a batch of twenty long ones is minutes of work and
    // a silent terminal cannot be told apart from a stuck one.
    onRun: (summary) => {
      console.log(reportLine(summary));
      if (opts.trace) console.log('trace ' + summary.trace.join(' '));
      // Only a run that ran out of window gets the note: a death and a win both finished, and
      // saying the bot "survived the whole window" over one of either would be reading the cap
      // onto an ending that had one of its own.
      if (!summary.died && !summary.won) {
        console.log('note: the bot survived the whole ' + opts.seconds + 's window.');
      }
    },
  });

  for (const summary of summaries) {
    if (summary.stats.score <= 0) {
      throw new Error('the bot never scored: the game is not playable headless');
    }
  }

  if (opts.audio) console.log(mixLine());

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
