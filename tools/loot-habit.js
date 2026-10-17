#!/usr/bin/env node
// Whether the bot goes and gets its own loot, how far it will walk for it, and what that is worth.
// A check and not a decoration: with `--strict` it exits non-zero when the habit `tools/headless/
// loot.js` ships does not bank more shards than the same bot standing still, or costs it score.
//
//   node tools/loot-habit.js                        the ladder, on the shipped defaults
//   node tools/loot-habit.js --seeds 32             a wider batch (slower)
//   node tools/loot-habit.js --seconds 600          a longer window
//   node tools/loot-habit.js --bot aware --picks wise   a hand that hardly dies, which is a poor
//                                               instrument for anything (see the note under the table)
//   node tools/loot-habit.js --habits off,greedy    which habits to fly
//   node tools/loot-habit.js --reach 400            how far off a shard may be to be worth a walk
//   node tools/loot-habit.js --grace 1              how much slack in judging whether it will rot
//   node tools/loot-habit.js --no-dash              the bot never presses the dash
//   node tools/loot-habit.js --strict               non-zero unless the shipped habit holds up
//
// Why this exists at all: every policy in `tools/headless/` used to answer "nothing is wrong" with
// the same instruction - drift back to the middle - and the shard net then did the collecting for it.
// That made a whole half of the game invisible to every ladder in this folder, and BY HAND (the rule
// that cuts the net to two fifths) was the one that showed it: the careless hand went from level 7 to
// level 1 under it and the aware hand's eight-minute score fell to 0.12x of plain, not because the
// rule is that cruel but because no bot here had ever walked *back* for a pile it walked away from
// (NOTES session 160). A ladder that prices every build in the game with a build the net dealt it is
// an instrument with a blind spot, and this file is how the blind spot got measured instead of
// inherited.
//
// The verdict is bought with the middle *score*, on the same grounds `tools/dash-habit.js` settled
// on: a run is worth what it scores, and a habit can stretch a batch's deaths out while scoring less
// for it. What is different here is that a loot habit is expected to *gain*: it is buying shards the
// ship was leaving on the floor. So the two failures this file looks for are that the habit banked
// nothing (a dead instrument - it never fired, or fired at nothing) and that it banked loot at a loss
// (a habit that walks the ship into a crowd it could have stayed out of, and pays more hull than the
// pile was worth).
//
// `shards/run` is the proof the habit did something at all: it is every shard the batch banked over
// its runs, which is the number that says whether the walk found loot or the ship wandered.
// `steered` is what share of the frames flown the habit had the wheel, which is how a habit that
// never fires and a habit that found nothing out there are told apart from one that was never asked.

import { playBatches, POLICIES, PICKS } from './headless/bot.js';
import { LOOT, LOOT_HABITS, DEFAULT_LOOT_HABIT, setLootDial } from './headless/loot.js';
import { table, clock, int, dec, share } from './headless/tables.js';
import { median, pairedRatio, pairWords, isBetter } from './headless/pairs.js';

const DEFAULTS = {
  seeds: 12,
  seconds: 300,
  habits: 'off,greedy',
  // The careless pair of eyes with the shipped get-out dash, which is the hand `tools/
  // challenge-cost.js` prices the rules on and so the hand a loot habit has to be worth something
  // to. `aware` with wise picks is the one that beats the schedule: it dies too rarely for a
  // difference between two ways of walking to show up in a batch anybody can afford to fly.
  policy: 'human',
  picks: 'random',
  dash: true,
  reach: null,
  grace: null,
  strict: false,
};

/** A batch this small cannot rank two ways of walking; it can only show you the runs. */
const MIN_SEEDS = 8;
/** How much worse the shipped habit may read than standing still before it is a failure. */
const TIE_RATIO = 1.1;

function readArgs(argv) {
  const opts = Object.assign({}, DEFAULTS);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => { i++; return argv[i]; };
    if (arg === '--seeds') opts.seeds = parseInt(next(), 10);
    else if (arg === '--seconds') opts.seconds = parseFloat(next());
    else if (arg === '--bot') opts.policy = next();
    else if (arg === '--picks') opts.picks = next();
    else if (arg === '--habits') opts.habits = next();
    else if (arg === '--no-dash') opts.dash = false;
    else if (arg === '--reach') opts.reach = Number(next());
    else if (arg === '--grace') opts.grace = Number(next());
    else if (arg === '--strict') opts.strict = true;
    else { console.error('unknown option: ' + arg); process.exit(2); }
  }
  if (!Number.isFinite(opts.seeds) || !Number.isFinite(opts.seconds) || opts.seeds < 1) {
    console.error('--seeds wants a count and --seconds a number of seconds');
    process.exit(2);
  }
  // Checked before a single run, because a batch is minutes of work.
  for (const name of opts.habits.split(',')) {
    if (LOOT_HABITS[name] === undefined) {
      console.error('--habits wants some of: ' + Object.keys(LOOT_HABITS).join(', '));
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
  for (const value of [opts.reach, opts.grace]) {
    if (value !== null && !(value >= 0)) {
      console.error('--reach wants a number of pixels and --grace a number of seconds');
      process.exit(2);
    }
  }
  return opts;
}

/** Play every habit on the same seeds and return one row of numbers per habit. */
async function measure(opts) {
  const names = opts.habits.split(',');
  const rows = [];

  const batches = names.map((name) => {
    const finished = [];
    return {
      batch: {
        seeds: Array.from({ length: opts.seeds }, (unused, i) => i + 1),
        maxSeconds: opts.seconds,
        policy: opts.policy,
        picks: opts.picks,
        dash: opts.dash,
        loot: name,
        onRun: (summary) => { finished.push(summary); },
      },
      report: () => {
        const deaths = finished.filter((s) => s.died).map((s) => s.seconds);
        const total = (pick) => finished.reduce((sum, s) => sum + pick(s), 0);
        const frames = total((s) => s.frames);
        return {
          habit: name,
          middleDeath: median(deaths),
          died: deaths.length,
          middleScore: median(finished.map((s) => s.stats.score)),
          bySeed: new Map(finished.map((s) => [s.seed, s.stats.score])),
          // Every shard the batch banked, over every run of it. This is the column that says the
          // walk found loot: the net collects the same handful whichever habit runs, so a habit
          // that banks no more than `off` never went anywhere.
          shards: total((s) => s.stats.collected),
          steered: total((s) => s.foraged),
          frames: frames,
          level: median(finished.map((s) => s.stats.level)),
          hulls: total((s) => s.tally.hullLost),
        };
      },
    };
  });

  await playBatches(batches.map((b) => b.batch));
  for (const b of batches) rows.push(b.report());
  return rows;
}

const opts = readArgs(process.argv.slice(2));
// The habit's own dials, put over before a single run. "How far would you go for loot" is a habit
// and not a law, so it is swept here and the winning number is written back into loot.js.
const dial = {};
if (opts.reach !== null) dial.reach = opts.reach;
if (opts.grace !== null) dial.grace = opts.grace;
if (Object.keys(dial).length > 0) setLootDial(dial);
const rows = await measure(opts);

const plain = rows.find((row) => row.habit === 'off');
const title = 'the loot habits, on ' + opts.seeds + ' seeds of ' + clock(opts.seconds)
  + ', ' + (opts.policy === undefined ? 'human' : opts.policy) + ' bot'
  + (opts.picks === undefined ? '' : ' answering the level-up ' + opts.picks)
  + (opts.dash ? ', pressing the get-out dash' : ', never pressing the dash')
  + (opts.reach === null ? '' : ', a shard within ' + opts.reach + ' px worth walking for')
  + (opts.grace === null ? '' : ', ' + dec(opts.grace, 1) + 's of slack on a shard rotting');
const note = 'Each row is the same seeds flown with one way of spending an idle second. `off` is the\n'
  + 'bot the net feeds - drift to the middle, let the loot come - and it is the floor a habit is\n'
  + 'measured against, not a habit a person has. `middle death` is the middle of the runs that died;\n'
  + 'a batch that never died has no middle and shows a dash. `vs off` is the middle score against\n'
  + 'that floor and `off won` the pair under it - of the seeds that could tell the two runs apart,\n'
  + 'how many the standing-still run scored higher on. `shards/run` is every shard the batch banked\n'
  + 'divided by its runs, and `steered` what share of the frames flown the habit had the wheel.';
console.log(table(title, note,
  ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
  ['habit', 'middle death', 'died', 'middle score', 'vs off', 'off won', 'shards/run', 'steered',
    'level'],
  rows.map((row) => {
    const pair = plain === undefined || row === plain ? null : pairedRatio(row.bySeed, plain.bySeed);
    return [
      row.habit === DEFAULT_LOOT_HABIT ? row.habit + ' *' : row.habit,
      row.middleDeath === null ? 'never died' : clock(row.middleDeath),
      row.died + '/' + opts.seeds,
      int(row.middleScore),
      plain === undefined || plain.middleScore === 0 ? '-'
        : dec(row.middleScore / plain.middleScore, 2) + 'x',
      pair === null ? '-' : (pair.compared === 0 ? '0/0' : pair.losses + '/' + pair.compared),
      dec(row.shards / opts.seeds, 0),
      share(row.steered, row.frames),
      String(row.level),
    ];
  })));

const shipped = rows.find((row) => row.habit === DEFAULT_LOOT_HABIT);
console.log('');
if (shipped === undefined) {
  console.log('--habits did not include `' + DEFAULT_LOOT_HABIT + '`, the shipped habit, so there is '
    + 'nothing to verdict on. The rows above are the ones you asked for.');
  process.exit(0);
}
if (plain === undefined) {
  console.log('--habits did not include `off`, the bot the net feeds, so nothing here has a floor to '
    + 'be measured against. The rows above are the ones you asked for.');
  process.exit(0);
}

const worth = (row) => row.middleScore;
const asText = (row) => (row.middleDeath === null
  ? 'a batch that never died at ' + int(row.middleScore)
  : clock(row.middleDeath) + ' at ' + int(row.middleScore));
const pair = pairedRatio(shipped.bySeed, plain.bySeed);

console.log('The shipped habit is `' + DEFAULT_LOOT_HABIT + '` (marked *) at ' + asText(shipped)
  + ', banked ' + dec(shipped.shards / opts.seeds, 0) + ' shards a run and had the wheel on '
  + share(shipped.steered, shipped.frames) + ' of the frames flown.');
console.log('The same bot leaving the loot on the floor (`off`) middles at ' + asText(plain)
  + ' and banked ' + dec(plain.shards / opts.seeds, 0) + ' a run. Counted seed against seed, the '
  + 'walk is worth ' + (pair.medianRatio === null ? 'nothing to divide'
    : dec(pair.medianRatio, 2) + 'x a run per seed') + ' and the seeds say ' + pairWords(pair)
  + (isBetter(pair) ? ' - a difference they showed.' : ' - a lean, and nothing more.'));
if (opts.reach !== null || opts.grace !== null) {
  console.log('note: this flight swept ' + (opts.reach === null ? '' : '--reach ' + opts.reach + ' ')
    + (opts.grace === null ? '' : '--grace ' + opts.grace)
    + ', which are not the shipped numbers (' + LOOT.reach + ' px, ' + LOOT.grace
    + 's). A verdict here is a verdict about the sweep: write the winner into tools/headless/loot.js'
    + ' and re-fly it clean, or it is a number nobody can quote.');
}

let failures = 0;
if (opts.seeds < MIN_SEEDS) {
  console.log('note: ' + opts.seeds + ' seeds is below the ' + MIN_SEEDS
    + ' this file will rank anything on; it is showing you runs, not a verdict.');
} else if (pair.compared === 0) {
  // The honest null: two habits that scored the same on every seed. Nothing was asked of the walk.
  failures++;
  console.log('NOTHING RANKED: not one seed could tell the two batches apart, so the rule was never '
    + 'asked. A shorter --seconds, or the careless hand (`--bot human --picks random`), is what makes '
    + 'this a verdict, and --strict will not call an unmeasured thing a pass.');
} else if (shipped.steered === 0) {
  failures++;
  console.log('FAIL: the shipped habit never took the wheel once, so nothing about it was measured.');
} else if (shipped.shards <= plain.shards) {
  failures++;
  console.log('FAIL: the shipped habit banked ' + dec(shipped.shards / opts.seeds, 0)
    + ' shards a run against the standing-still bot\'s ' + dec(plain.shards / opts.seeds, 0)
    + '. Going and getting the loot did not get any more of it, which means the walk is not finding '
    + 'piles - look at `steered`, and at whether the window is long enough for loot to matter.');
} else if (worth(shipped) * TIE_RATIO < worth(plain)) {
  failures++;
  console.log('FAIL: the shipped habit scores under the bot that never moves for loot - '
    + asText(shipped) + ' against ' + asText(plain) + '. A walk that costs the run more than the pile '
    + 'it walks to is not a habit worth shipping, it is a way of dying in the wrong place.');
} else {
  console.log('PASS: the shipped habit banks more loot than the bot that stands still, and does not '
    + 'pay for it in the score column.');
}
if (opts.strict && failures > 0) process.exit(1);
