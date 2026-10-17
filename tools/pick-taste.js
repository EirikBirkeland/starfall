#!/usr/bin/env node
// What the bot's card taste is worth, and on which pair of hands. A check and not a decoration:
// with `--strict` it exits non-zero when the taste `tools/headless/bot.js` ships is not the best of
// the tastes flown on a given pair of hands.
//
//   node tools/pick-taste.js                          every build, on the `human` and `aware` hands
//   node tools/pick-taste.js --seeds 32               a wider batch (slower)
//   node tools/pick-taste.js --seconds 900            a longer window
//   node tools/pick-taste.js --policies human         one pair of hands
//   node tools/pick-taste.js --builds die,ship,nodefer   three rows instead of six
//   node tools/pick-taste.js --no-dash                the bot never presses the dash at all
//   node tools/pick-taste.js --strict                 non-zero unless the shipped taste wins where it flies
//
// Why this exists at all: `tools/challenge-cost.js` prices ONE CARD - the rule that takes the level-up
// choice down to a single card - on a hand that answers the level-up *on purpose*, because a hand that
// answers it at random cannot miss a choice it never had. That is a claim about the picker in
// `tools/headless/bot.js`, and the claim came unstuck on the hands the ladder ships with: the careful
// `human` batch's middle scored **under** the same batch rolling a die on 32 seeds and **over** it on 12
// (NOTES sessions 157 and 158), while the same picker on the `aware` hands was worth most of a run.
// Either the appetite was tuned on the aware bot and has never been asked anywhere else - NOTES sessions
// 31, 32 and 38 all measured it there - or a hand that dies at four minutes cannot cash a good build at
// all. Those two answers want different fixes, and only one of them can be found from inside a headless
// batch, so this file finds it: it flies the same seeds under several written-down tastes on each pair
// of hands and asks which of them a given pair of hands can actually use.
//
// What a row is: one pair of hands (`--policies`) answering the level-up one written-down way
// (`--builds`), on the plain game, on the same seeds. Every row is ranked against the `die` row **seed
// against seed** - the middle score a taste was worth per seed, and how many of the seeds it shared with
// the die preferred it - because a middle of a batch of runs jiggles by tens of percent and the two
// batches share their seeds for a reason. `tools/headless/pairs.js` is that arithmetic and its header
// says why a quotient of two middles could not be used here.
//
// The die is not a straw man: it is the average of every build the deal could have been answered with,
// so a taste that cannot beat it is a taste that has been traded for nothing. It is printed as the floor
// and not ranked as a build. Everything else is the bot's own picker with a different written-down
// appetite, so every one of them is a hand that *is* choosing and the only difference between the rows
// is what it chooses for - which is exactly the thing that was assumed and never measured.
//
// What it came back with, and the reading bot.js and `tools/challenge-cost.js` now quote (5m windows,
// 2026-10-17, 32 seeds and 24 on `aware`):
//
//   hand    middles (ship / die)   per seed   seeds that preferred it   level, die -> ship
//   human   4,843 / 5,333         0.95x      17 of 32, p = 0.860        7 -> 8
//   naive   7,842 / 5,346         1.41x      20 of 32, p = 0.215       11 -> 14
//   aware  29,627 / 14,276        1.95x      20 of 24, p = 0.002       22 -> 39
//
// One of the three is a shown difference. The `human` seeds cannot tell the picker from a die at all
// (17 of 32 is a coin), and the `naive` ones lean the right way - the shipped order is worth 1.41x a run
// per seed there, on a pair of hands this appetite was never tuned on - but 20 of 32 is not a difference
// the ladder will believe, and it says so instead of quoting the ratio. So the appetite is not stale on
// the short-handed pairs, it is *unspent* on them: read the `level` column, which is what a taste has to
// spend itself on, and the two short batches die with five to fourteen ranks taken while the aware batch
// dies at thirty-nine. That is the sentence `tools/challenge-cost.js` acts on when it refuses to price a
// rule about the deal on a hand it cannot show has a taste.
//
// Nothing beat the shipped taste on any hand - not the ring taken early, not the even spread with no
// order at all, not the shipped order turned round - which is the other half of what the file was written
// to be able to say, and it held on all three pairs of hands. The `flat` row is the one that says most:
// "take the shallowest line, with no opinion about which" reads 0.88x on `human`, 0.99x on `naive` and
// 1.55x on `aware`. Spreading the build out is worth something on a long run and nothing on a short one,
// and the *order* on top of it is worth the difference between 0.99x and 1.41x where the run is long
// enough to spend twelve ranks, on hands it was never tuned on.

import { pathToFileURL } from 'node:url';

import { playBatches, POLICIES, TASTE } from './headless/bot.js';
import { table, clock, int, dec } from './headless/tables.js';
import { median, pairedRatio, isBetter, isWorse, isUndecided, pairWords } from './headless/pairs.js';

const DEFAULTS = {
  seeds: 16,
  seconds: 300,
  // The two pairs of hands the other ladders quote their numbers from. `naive` is not flown by default
  // because it is a third of the work again for one more point on the same curve - and it is a point
  // worth having, so add it (`--policies naive,human,aware`) when there is time: that batch dies at a
  // middle of 3m24s and levels 11-14, which is where this file's story gets its middle rung.
  policies: 'human,aware',
  builds: 'die,ship,flat,nodefer,area,reverse',
  // The shipped get-out habit, same as the challenge ladder, so that a run here is the same run the
  // challenge numbers are quoted from.
  dash: true,
  strict: false,
};

/** The taste the bot ships with, read off the bot rather than copied, so this cannot go stale. */
const SHIPPED = { appetite: TASTE.appetite.slice(), deferred: Object.assign({}, TASTE.deferred) };

/**
 * How much more a taste has to be worth per seed before it is said to beat the shipped one.
 *
 * The sign test decides whether the seeds could tell the two apart at all (see
 * `tools/headless/pairs.js`); this is the size a difference has to reach once it has. Both are needed:
 * a tenth of a percent would clear the test on ten thousand seeds and would not be worth a paragraph,
 * and a big middle-of-the-batch difference that only two seeds agree on is not worth one either.
 */
const BEATEN_BY = 1.05;
/** A batch smaller than this cannot rank two tastes; it can only show you the runs. */
const MIN_SEEDS = 8;

/** What each row is, printed under the tables so a reader of a pasted ladder knows what they read. */
const BUILD_WORDS = {
  die: 'roll a die over whatever is face up - the floor, and not a taste',
  ship: 'what ships: the tie-break order in bot.js, the orbital ring held two ranks back',
  flat: 'the shallowest line on the table, with no opinion about which one that is',
  nodefer: 'the shipped order, with the ring bought level with the gun',
  area: 'the nova and the ring taken early, on the guess that a cornered hand is what they are for',
  reverse: 'the shipped order turned round - the control for whether the order carries anything',
};

/**
 * The written-down tastes this ladder can fly.
 *
 * Every one of them states both numbers, changed or not, because the dial is one global the bot reads
 * while it plays and a row that inherits the previous row's appetite is a row that measured something
 * else. `{}` would mean "whatever the last row left behind" and that is not a build - which is the claim
 * `test/pick-taste.test.mjs` puts every row through, and the reason this table is exported.
 */
export const BUILDS = {
  // The same feet answering the level-up with a die. The floor, and the only row in the table that
  // is not a taste at all: a build that cannot beat it has no taste worth the name.
  die: { picks: 'random', taste: SHIPPED },
  // What ships: the tie-break order in bot.js and the ring held two ranks back.
  ship: { taste: SHIPPED },
  // Even spread with no opinion about which line: shallowest card on the table, ties broken by
  // nothing. This is the control for whether the written order buys anything at all.
  flat: { taste: { appetite: [], deferred: {} } },
  // The shipped order with the orbital ring bought level with the gun. NOTES session 31 measured
  // this on the aware hands and it cost that batch a minute and a half of mean survival; it has
  // never been asked anywhere else, and a hand that gets cornered may want what a hand that flees
  // does not.
  nodefer: { taste: { appetite: SHIPPED.appetite, deferred: {} } },
  // The two lines that reach out from the ship rather than sharpen the gun - a nova front and the
  // orbital ring - taken early, on the hypothesis that a hand which cannot dodge is the hand that
  // is standing inside a crowd when the card pays.
  area: {
    taste: {
      appetite: ['damage', 'nova', 'orbitals', 'split', 'ricochet', 'pierce', 'fireRate', 'bulletSpeed'],
      deferred: {},
    },
  },
  // The shipped order turned round, with the ring unbent. If this reads like `flat`, the order is
  // carrying nothing on these hands and arguing about its middle ranks is arguing about noise.
  reverse: { taste: { appetite: SHIPPED.appetite.slice().reverse(), deferred: {} } },
};

function readArgs(argv) {
  const opts = Object.assign({}, DEFAULTS);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => { i++; return argv[i]; };
    if (arg === '--seeds') opts.seeds = parseInt(next(), 10);
    else if (arg === '--seconds') opts.seconds = parseFloat(next());
    else if (arg === '--policies') opts.policies = next();
    else if (arg === '--builds') opts.builds = next();
    else if (arg === '--no-dash') opts.dash = false;
    else if (arg === '--strict') opts.strict = true;
    else { console.error('unknown option: ' + arg); process.exit(2); }
  }
  if (!Number.isFinite(opts.seeds) || !Number.isFinite(opts.seconds) || opts.seeds < 1) {
    console.error('--seeds wants a count and --seconds a number of seconds');
    process.exit(2);
  }
  // Checked before a single run, because a batch is minutes of work.
  for (const name of opts.policies.split(',')) {
    if (POLICIES[name] === undefined) {
      console.error('--policies wants some of: ' + Object.keys(POLICIES).join(', '));
      process.exit(2);
    }
  }
  for (const name of opts.builds.split(',')) {
    if (BUILDS[name] === undefined) {
      console.error('--builds wants some of: ' + Object.keys(BUILDS).join(', '));
      process.exit(2);
    }
  }
  return opts;
}

/** How many lines the run had at least one rank in - how spread the build it died holding was. */
function linesOf(ranks) {
  return Object.keys(ranks).filter((id) => ranks[id] > 0).length;
}

/**
 * Fly every build on every pair of hands asked for, in one process on one booted game (the game is
 * one per process - NOTES session 3), each row carrying its own taste because the dial is global.
 *
 * Every row keeps the score of every seed it flew, because that is what the ranking is done with: the
 * rows are flown on the *same* seeds on purpose, and a taste is worth what it does to the run it is
 * dealt, seed by seed - not what the middle of its batch happens to come to. See the header.
 */
async function measure(opts) {
  const names = opts.builds.split(',');
  const rows = [];

  const batches = [];
  for (const policy of opts.policies.split(',')) {
    for (const name of names) {
      const build = BUILDS[name];
      const finished = [];
      batches.push({
        batch: {
          seeds: Array.from({ length: opts.seeds }, (unused, i) => i + 1),
          maxSeconds: opts.seconds,
          policy: policy,
          picks: build.picks,
          taste: build.taste,
          dash: opts.dash,
          onRun: (summary) => { finished.push(summary); },
        },
        policy: policy,
        build: name,
        report: () => ({
          policy: policy,
          build: name,
          // seed -> middle score of that run, which is the whole of what a pair is made from.
          bySeed: new Map(finished.map((s) => [s.seed, s.stats.score])),
          middleDeath: median(finished.filter((s) => s.died).map((s) => s.seconds)),
          died: finished.filter((s) => s.died).length,
          middleScore: median(finished.map((s) => s.stats.score)),
          bestScore: Math.max(...finished.map((s) => s.stats.score)),
          middleLevel: median(finished.map((s) => s.stats.level)),
          // The two lines the `area` row is about, in the middle run: this column is how the table
          // can show that the rows really did pick differently rather than all picking the same.
          middleArea: median(finished.map((s) => s.stats.ranks.orbitals + s.stats.ranks.nova)),
          middleLines: median(finished.map((s) => linesOf(s.stats.ranks))),
          hulls: finished.reduce((sum, s) => sum + s.tally.hullLost, 0),
        }),
      });
    }
  }

  await playBatches(batches.map((b) => b.batch));
  for (const b of batches) rows.push(b.report());
  return rows;
}

/**
 * What one pair of hands' rows mean: the sentence about what its taste is worth, the failures, and
 * the notes. Exported so a test can put it on made-up rows (test/pick-taste.test.mjs); the ladder
 * prints exactly these strings and adds nothing of its own.
 *
 * Every comparison here is a **pair**: the same seed flown under both builds, and the question is which
 * of the two runs scored more. That is what the seeds were lined up for, and it is the only way this
 * file can rank anything at all - a run's score is wildly spread (the middle of a `human` batch was
 * 3,835 with a best of 28,637), so the middle of a batch moves by tens of percent between one seed
 * count and the next and a quotient of two of them is not a measurement. See `tools/headless/pairs.js`.
 *
 * The three things this can say, and they are different findings:
 *
 *   **A written-down taste beats the shipped one on these hands, and the seeds can tell.** The appetite
 *     in bot.js is then not what *this* pair of hands wants, which is the answer the file was written
 *     to be able to give, and it names the row that says so.
 *
 *   **The shipped taste cannot be told from its own die.** Not a failure of the ladder; it is the
 *     finding `tools/challenge-cost.js` needs - a hand that cannot be *shown* to have a taste cannot
 *     price a rule about taking a choice away. It is a note, unless some other row did beat the die,
 *     in which case the shipped appetite is wrong on these hands and that is a problem and says so.
 *
 *   **The shipped taste loses to its own die on the seeds.** Worse than worthless: a written-down
 *     appetite that a die beats is a habit nobody checked, and the ladder says it out loud instead of
 *     quietly reporting the ratio.
 */
export function verdictOf(rows, policy) {
  const die = rows.find((r) => r.build === 'die');
  const shipped = rows.find((r) => r.build === 'ship');
  const lines = [];
  const problems = [];
  const notes = [];

  if (die === undefined || shipped === undefined) {
    notes.push('`die` and `ship` both have to be in the table for there to be a verdict on '
      + policy + '; this ladder was asked for ' + rows.map((r) => '`' + r.build + '`').join(', ') + '.');
    return { lines, problems, notes };
  }

  const taste = pairedRatio(shipped.bySeed, die.bySeed);
  if (taste.seeds < MIN_SEEDS) {
    notes.push(taste.seeds + ' shared seeds is below the ' + MIN_SEEDS
      + ' this file will rank anything on; it is showing you runs, not a verdict.');
    return { lines, problems, notes };
  }
  if (taste.medianRatio === null) {
    notes.push('the `die` row on the ' + policy + ' hands scored nothing on any seed the taste shared '
      + 'it, so nothing here can be divided.');
    return { lines, problems, notes };
  }

  const size = dec(taste.medianRatio, 2) + 'x a run';
  lines.push('On the ' + policy + ' hands the shipped taste was worth a middle of ' + size
    + ' per seed against the same bot rolling a die, and the seeds chose it over the die on '
    + pairWords(taste) + '. '
    + (isBetter(taste)
      ? 'That is a hand that can use a choice, so a rule about the deal can be priced on it.'
      : isWorse(taste)
        ? 'The die beat it, so this hand would have done better rolling: the appetite is wrong here, '
          + 'not merely worthless.'
        : 'The seeds cannot tell the two apart, so this hand has no taste to price and a rule about '
          + 'the deal cannot be read on it (tools/challenge-cost.js refuses one priced here.)'));

  if (isWorse(taste)) {
    problems.push('on the ' + policy + ' hands the shipped appetite is worth less than rolling a die - '
      + dec(taste.medianRatio, 2) + 'x a run per seed, the die preferred on ' + pairWords(taste)
      + '. The appetite in bot.js was measured somewhere and it is not here.');
  }
  if (isUndecided(taste)) {
    notes.push('the shipped taste could not be told from its own die on the ' + policy + ' hands ('
      + pairWords(taste) + '). That is a finding rather than a failure of the ladder - but if any row '
      + 'below *did* beat the die, then the shipped appetite is wrong on these hands and not merely '
      + 'unmeasurable.');
  }

  const builds = rows.filter((r) => r.build !== 'die' && r.build !== 'ship');
  for (const row of builds) {
    const versus = pairedRatio(row.bySeed, shipped.bySeed);
    if (isBetter(versus) && versus.medianRatio >= BEATEN_BY) {
      problems.push('on the ' + policy + ' hands the build `' + row.build + '` is worth a middle of '
        + dec(versus.medianRatio, 2) + 'x the shipped taste per seed and the seeds chose it on '
        + pairWords(versus) + '. The appetite in bot.js is not what these hands want; the table says '
        + 'which one is.');
    }
    // The other way a row wins: not by beating the shipped taste head to head - which a taste of the
    // same size as another does not always manage - but by beating the die the shipped one could not.
    const againstDie = pairedRatio(row.bySeed, die.bySeed);
    if (!isBetter(taste) && isBetter(againstDie) && againstDie.medianRatio >= BEATEN_BY) {
      problems.push('on the ' + policy + ' hands the build `' + row.build + '` beats the die ('
        + dec(againstDie.medianRatio, 2) + 'x a run per seed, on ' + pairWords(againstDie)
        + ') and the shipped taste does not. Something is written down that these hands do not want.');
    }
  }
  return { lines, problems, notes };
}

/** One table per pair of hands, then what the verdict of that table has to say about it. */
function report(rows, policy, opts) {
  const own = rows.filter((r) => r.policy === policy);
  const die = own.find((r) => r.build === 'die');
  const pair = (row) => (die === undefined || row.build === 'die' ? null : pairedRatio(row.bySeed, die.bySeed));
  const versus = (row) => {
    const p = pair(row);
    return p === null || p.medianRatio === null ? '-' : dec(p.medianRatio, 2) + 'x';
  };
  // "how many seeds preferred this row over the die", which is the column the verdict is made of and
  // the one a reader can check by eye: anything near half the seeds is a coin.
  const betterOn = (row) => {
    const p = pair(row);
    return p === null ? '-' : p.wins + '/' + p.compared;
  };

  const title = 'the bot\'s card taste on the ' + policy + ' hands, ' + opts.seeds + ' seeds of '
    + clock(opts.seconds) + (opts.dash ? ', pressing the get-out dash' : ', never pressing the dash');
  const note = 'Every row is the same seeds and the same pair of hands answering the level-up one\n'
    + 'written-down way; `die` is the same bot rolling for the card instead, and it is the floor a\n'
    + 'taste has to beat rather than another taste. `vs die` and `better on` are counted seed against\n'
    + 'seed and not middle against middle: the middle score a taste was worth per seed against the\n'
    + 'die\'s, and how many of the seeds it shared with the die preferred it - about half of them is a\n'
    + 'coin, and the verdict believes only what is well clear of half. The `middle score` column stays\n'
    + 'because every other number in the game is quoted that way; `level` says why that way is worth\n'
    + 'little here: a taste buys a build, and a run that dies at level six has no build.\n'
    + '`ring+nova` is the ranks the middle run had in the two lines that reach out from the ship and\n'
    + '`lines` how many lines it had a rank in, which is the even spread being counted rather than\n'
    + 'assumed. Read `died` before `middle death`: the middle of one death is that death.';
  console.log(table(title, note,
    ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
    ['build', 'middle death', 'died', 'middle score', 'vs die', 'better on', 'level',
      'ring+nova', 'lines', 'hulls'],
    own.map((row) => [
      row.build === 'ship' ? 'ship *' : row.build,
      row.middleDeath === null ? 'never died' : clock(row.middleDeath),
      row.died + '/' + opts.seeds,
      int(row.middleScore),
      versus(row),
      betterOn(row),
      row.middleLevel === null ? '-' : String(row.middleLevel),
      row.middleArea === null ? '-' : String(row.middleArea),
      row.middleLines === null ? '-' : String(row.middleLines),
      String(row.hulls),
    ])));

  const verdict = verdictOf(own, policy);
  for (const line of verdict.lines) {
    console.log('');
    console.log(line);
  }
  return verdict;
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const opts = readArgs(process.argv.slice(2));
  const rows = await measure(opts);

  const problems = [];
  const notes = [];
  for (const policy of opts.policies.split(',')) {
    console.log('');
    const verdict = report(rows, policy, opts);
    problems.push(...verdict.problems);
    notes.push(...verdict.notes);
    console.log('');
  }
  console.log('What each build is, in the words the ladder means by it:');
  for (const name of opts.builds.split(',')) {
    console.log('  ' + name + ' \u00b7 ' + BUILD_WORDS[name]);
  }

  for (const line of notes) {
    console.log('');
    console.log('Note: ' + line);
  }

  console.log('');
  if (problems.length > 0) {
    console.log('VERDICT: FAIL');
    for (const line of problems) console.log('  - ' + line);
    console.log('');
    console.log('The appetite in tools/headless/bot.js was measured on one pair of hands and is');
    console.log('being asked to speak for another. Either write the difference down as a second');
    console.log('taste and say which numbers were measured on which hands, or say which hands a');
    console.log('number has to be read on - and do not quietly re-tune the bot until the ladder');
    console.log('agrees with itself, because a ruler sanded down measures nothing.');
    if (opts.strict) process.exit(1);
  } else {
    console.log('VERDICT: on every pair of hands flown, no other taste was worth more than '
      + Math.round((BEATEN_BY - 1) * 100) + '% above the shipped one on the seeds they shared, or was\n'
      + 'not the sort of difference the seeds could tell apart.');
    console.log('That is not the same as the shipped taste being worth something on all of them - the');
    console.log('`vs die` and `better on` columns are where that is said, and `tools/challenge-cost.js`');
    console.log('refuses a deal rule priced on a hand no better than its own die.');
  }
}
