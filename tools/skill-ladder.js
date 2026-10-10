#!/usr/bin/env node
// The difficulty curve read as a slope and not as a verdict: the same careless batch, played by
// players of four different skills.
//
//   node tools/skill-ladder.js                       all four rungs, 12 seeds each
//   node tools/skill-ladder.js --runs 24              a bigger batch, for a steadier middle
//   node tools/skill-ladder.js --rungs ordinary,program
//   node tools/skill-ladder.js --seconds 600          a shorter window (it truncates the good rungs)
//   node tools/skill-ladder.js --seed 200             a different set of seeds
//   node tools/skill-ladder.js --picks wise           the careful build, to compare the two ladders
//
// `tools/difficulty-arc.js` answers one question about one player and says PASS or FAIL. That is
// the wrong shape for the harder question, which is *how far off* the band a batch is and how
// steep the hill either way is: PLAN 10's `4:00-9:00` has to be read against a player, and one
// player is one point, not a line. So this tool plays the same seeds at every rung of
// `tools/headless/human.js`'s dial and adds the program at the top of it, and prints what each one
// was worth.
//
// It is a report and not a check: it always exits 0 and judges nothing. The rung a number was
// measured on belongs next to the number, and what to do about the shape that comes out is
// `tools/difficulty-arc.js`'s business and PLAN's, not this file's.
//
// Every rung is careless at cards by default (`--picks random`), because that is the pairing PLAN
// writes the arc with: a person who did not look at the build. Move both dials at once and the
// two slopes cannot be told apart, which is why the flag is here and not a hidden default.

import { pathToFileURL } from 'node:url';
import { playBatches } from './headless/bot.js';
import { RUNGS } from './headless/human.js';
import { median } from './simulate.js';
import { ARC, endingOf } from './difficulty-arc.js';
import { clock, share, table } from './headless/tables.js';

/**
 * The four players, worst first. The first three are the same eyes at three speeds (one rung per
 * entry of `RUNGS`); the fourth has no hands at all and is here because a slope with a discontinuity
 * at the top has not been measured to the top.
 */
export const PLAYERS = [
  { rung: 'flustered', policy: 'human', dial: RUNGS.flustered, says: 'slow hands, half the looks elsewhere' },
  { rung: 'ordinary', policy: 'human', dial: RUNGS.ordinary, says: 'the person: a fifth of a second per look' },
  { rung: 'sharp', policy: 'human', dial: RUNGS.sharp, says: 'quick and nearly always watching' },
  { rung: 'program', policy: 'aware', says: 'no hands: it re-decides every simulation step' },
];

const DEFAULTS = { seed: 1, runs: 12, seconds: 900, rungs: '', picks: 'random' };

function readArgs(argv) {
  const opts = Object.assign({}, DEFAULTS);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      i++;
      return argv[i];
    };
    if (arg === '--seed') opts.seed = parseInt(next(), 10);
    else if (arg === '--runs') opts.runs = parseInt(next(), 10);
    else if (arg === '--seconds') opts.seconds = parseFloat(next());
    else if (arg === '--rungs') opts.rungs = next();
    else if (arg === '--picks') opts.picks = next();
    else {
      console.error('usage: skill-ladder.js [--seed N] [--runs N] [--seconds N] [--rungs a,b] [--picks NAME]');
      process.exit(2);
    }
  }
  if (!Number.isFinite(opts.seed) || !Number.isFinite(opts.runs) || !Number.isFinite(opts.seconds)) {
    console.error('--seed, --runs and --seconds want a number');
    process.exit(2);
  }
  if (opts.runs < 2) {
    console.error('--runs wants at least two runs: one seed is an anecdote, let alone a rung');
    process.exit(2);
  }
  if (opts.picks !== 'wise' && opts.picks !== 'random') {
    console.error('--picks wants one of: wise, random');
    process.exit(2);
  }
  return opts;
}

/** The rung list, with `--rungs` narrowing it. A name nobody defined is an error, not a skip. */
export function rungList(spec) {
  if (spec === '') return PLAYERS;
  const names = spec.split(',').map((name) => name.trim()).filter((name) => name !== '');
  if (names.length === 0) {
    throw new Error('--rungs wants at least one of: ' + PLAYERS.map((p) => p.rung).join(', '));
  }
  return names.map((name) => {
    const player = PLAYERS.find((one) => one.rung === name);
    if (player === undefined) {
      throw new Error('no rung is called ' + name + '; there are '
        + PLAYERS.map((one) => one.rung).join(', '));
    }
    return player;
  });
}

/** One rung's batch, boiled down to what a row of the table needs. */
export function rungRow(summaries) {
  const deaths = summaries.map(endingOf).filter((end) => end.at !== null);
  const times = deaths.map((end) => end.at);
  return {
    runs: summaries.length,
    deaths: deaths.length,
    medianDeath: median(times),
    inBand: deaths.filter((end) => end.at >= ARC.from && end.at <= ARC.to).length,
    alive: summaries.filter((end) => !end.died && !end.won).length,
    level: median(summaries.map((summary) => summary.stats.level)),
    score: median(summaries.map((summary) => summary.stats.score)),
  };
}

/** The ladder: one row per rung, worst player first. */
export function ladderTable(rows, picks) {
  return table(
    'the same batch, played ' + rows.length + (rows.length === 1 ? ' way' : ' ways'),
    rows[0].runs + ' ' + (picks === 'random' ? 'careless' : 'careful')
      + ' run' + (rows[0].runs === 1 ? '' : 's') + ' per rung, the same seeds at every rung.'
      + ' The band PLAN asks for is ' + clock(ARC.from) + '-' + clock(ARC.to) + '.',
    'llrrrlr', ['rung', 'what it is', 'died', 'median death', 'in band', 'level', 'score'],
    rows.map((row) => [
      row.rung, row.says, row.deaths + '/' + row.runs,
      row.deaths === 0 ? 'nobody died' : clock(row.medianDeath),
      share(row.inBand, row.runs), String(row.level), Math.round(row.score).toLocaleString('en-US'),
    ]));
}

/**
 * The slope, in words: how much one rung is worth over the one below it.
 *
 * Only the middle two rungs are compared in seconds, because the step up to the program is not a
 * step of the same kind - it is the difference between a player and a machine - and a number for
 * it invites somebody to call the machine a person.
 */
export function slopeLines(rows) {
  const lines = [];
  for (let i = 1; i < rows.length; i++) {
    const up = rows[i];
    const down = rows[i - 1];
    if (down.deaths === 0 || up.deaths === 0) {
      lines.push(up.rung + ' against ' + down.rung + ': one of the two never died, so there is no step to measure');
      continue;
    }
    const gain = up.medianDeath - down.medianDeath;
    lines.push(up.rung + ' against ' + down.rung + ': '
      + (gain >= 0 ? '+' : '') + Math.round(gain) + 's of middle run'
      + (up.alive > down.alive ? ', and ' + (up.alive - down.alive) + ' more runs outlasted the window' : ''));
  }
  return lines;
}

/** Only run when called as a command, so the tests can import the parts above. */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const opts = readArgs(process.argv.slice(2));
  const players = rungList(opts.rungs);
  const seeds = Array.from({ length: opts.runs }, (unused, i) => opts.seed + i);
  const rows = [];

  // One boot for the whole ladder (the modules hold one world per process), and each rung gets its
  // own dial through the run options. The top rung has none to get: `aware` has no hands to set.
  await playBatches(players.map((player) => ({
    seeds, maxSeconds: opts.seconds, policy: player.policy, picks: opts.picks, dial: player.dial,
  })), (summaries, index) => {
    for (const summary of summaries) {
      if (summary.stats.score <= 0) {
        throw new Error('the bot never scored: the game is not playable headless');
      }
    }
    rows.push(Object.assign({ rung: players[index].rung, says: players[index].says },
      rungRow(summaries)));
    // Printed as each rung finishes, because a full ladder is a batch per rung and a silent
    // terminal cannot be told apart from a stuck one (NOTES, session 88).
    const row = rows[rows.length - 1];
    console.log('rung ' + row.rung + ': ' + row.deaths + '/' + row.runs + ' died, middle at '
      + (row.deaths === 0 ? '-' : clock(row.medianDeath)) + ', ' + row.alive
      + ' outlasted the ' + clock(opts.seconds) + ' window');
  });

  console.log('');
  console.log(ladderTable(rows, opts.picks));
  console.log('');
  console.log(slopeLines(rows).join('\n'));
}
