#!/usr/bin/env node
// Play a whole game with no browser and report on it.
//
//   node tools/simulate.js                    one run, default seed
//   node tools/simulate.js --seed 7           a different run
//   node tools/simulate.js --runs 5           several runs, with an average
//   node tools/simulate.js --seconds 120      stop after this many game seconds
//   node tools/simulate.js --bot naive         play it the plain way (see below)
//   node tools/simulate.js --weapon scatter    fly another primary (game/weapons.js)
//   node tools/simulate.js --trace            print a state fingerprint over time
//   node tools/simulate.js --audio            boot with a fake audio device
//
// The bot is tools/headless/bot.js. `aware`, the default, shoots the nearest thing
// and steps out of whatever is on its way to the ship; `naive` shoots the nearest
// thing and only backs away from whatever is already close. This script must always
// finish without throwing.

import { playRuns, POLICIES } from './headless/bot.js';

function readArgs(argv) {
  const opts = { seed: 1, runs: 1, seconds: 600, trace: false, audio: false, every: 120, policy: undefined, weapon: undefined };
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
    else if (arg === '--trace') opts.trace = true;
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
  return opts;
}

function clockText(seconds) {
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return minutes + 'm' + (rest < 10 ? '0' : '') + rest + 's';
}

function reportLine(summary) {
  const s = summary.stats;
  return 'seed ' + summary.seed
    + '  ' + summary.policy
    + '  gun ' + summary.stats.weapon
    + '  ' + (summary.died ? 'died' : 'alive at the cap')
    + '  ' + clockText(summary.seconds)
    + '  score ' + s.score
    + '  level ' + s.level
    + '  kills ' + s.kills
    + '  shards ' + s.collected
    + '  hull ' + s.hull
    // What the run was built from, in the order game/upgrades.js lists the lines.
    + '  build ' + Object.values(s.ranks).join('/');
}

function average(summaries, pick) {
  return summaries.reduce((sum, item) => sum + pick(item), 0) / summaries.length;
}

const opts = readArgs(process.argv.slice(2));

const summaries = await playRuns({
  seeds: Array.from({ length: opts.runs }, (unused, i) => opts.seed + i),
  maxSeconds: opts.seconds,
  audio: opts.audio,
  every: opts.trace ? opts.every : 0,
  policy: opts.policy,
  weapon: opts.weapon,
});

for (const summary of summaries) {
  console.log(reportLine(summary));
  if (opts.trace) console.log('trace ' + summary.trace.join(' '));
  if (!summary.died) console.log('note: the bot survived the whole ' + opts.seconds + 's window.');
  if (summary.stats.score <= 0) {
    throw new Error('the bot never scored: the game is not playable headless');
  }
}

if (summaries.length > 1) {
  console.log('average over ' + summaries.length + ' runs: '
    + clockText(average(summaries, (s) => s.seconds))
    + ', score ' + Math.round(average(summaries, (s) => s.stats.score))
    + ', level ' + average(summaries, (s) => s.stats.level).toFixed(1)
    + ', kills ' + Math.round(average(summaries, (s) => s.stats.kills)));
}
