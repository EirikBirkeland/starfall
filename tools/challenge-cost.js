#!/usr/bin/env node
// What each challenge modifier costs, measured on the bot. A check and not a decoration: with
// `--strict` it exits non-zero when a rule that is supposed to be harder is not.
//
//   node tools/challenge-cost.js                          the ladder, on the careless build
//   node tools/challenge-cost.js --seeds 16               a wider batch (slower)
//   node tools/challenge-cost.js --seconds 900            a longer window
//   node tools/challenge-cost.js --bot aware --picks wise  the careful build, which hardly dies
//   node tools/challenge-cost.js --bot naive              the worst pair of hands there is
//   node tools/challenge-cost.js --no-dash                the bot never presses the dash at all
//   node tools/challenge-cost.js --challenges none,brittle  two of the six rows
//   node tools/challenge-cost.js --speed 1.3              the swift crowd's multiplier, tried live
//   node tools/challenge-cost.js --hold 1.75              the thick crowd's, tried live
//   node tools/challenge-cost.js --grace 0.75             the gap a hit leaves, tried live
//   node tools/challenge-cost.js --strict                 non-zero unless the rules cost what they claim
//
// Why a yardstick at all: a challenge modifier is a rule about the whole run, and a rule about the
// whole run cannot be A/B'd one card at a time (`tools/line-ab.js` prices a line against itself). So
// this file flies the same seeds under each rule and asks the two questions a rule can be asked:
// does the careless build die sooner, and does it score less for it. The bot is not a person and
// its middle of deaths is not anybody's evening; it is a *yardstick*, and what matters is that the
// same hand is measured under every rule.
//
// Which hand, then. The default is the careless third policy (tools/headless/human.js), the same
// pair of eyes the difficulty band is read on, and it is the careless one on purpose: the aware bot
// finishes a ten-minute run with every hull it started on (NOTES, the reference run), so a rule about
// what *one touch* costs is invisible to it and `ONE HULL` would read as a free rule. The `hulls`
// column is the tell - a plain batch that lost no hulls cannot price a rule about losing one, and the
// verdict says so instead of failing a rule it could not see. The bot presses the shipped get-out
// dash unless `--no-dash` is given, because a NO DASH measured on a bot that never dashes is a
// measurement of the two cards the deck lost and not of the jump it did.
//
// The swift crowd's multiplier is passed to the game through the balance row, which the sim reads
// every time it builds a body, so `--speed` sweeps it without touching a source file - the same
// trick `tools/ghost-grid.js` plays with the afterimage's radius. `--hold` is the same door on the
// thick crowd's share of the arena, and `--grace` the same door on the gap a hit leaves the ship.
//
// One column is deliberately missing: what a rule feels like. NO DASH measured against a bot that
// presses the dash ten times a quarter-hour (NOTES session 114) may read as nearly free while a
// person who lives on the dash feels it in every corner. The number here is the bot's and it is
// labelled as that; the card says what the rule does, and only eyes on a screen can say whether that
// is too much.

import { pathToFileURL } from 'node:url';

import { playBatches, POLICIES, PICKS } from './headless/bot.js';
import { BALANCE } from '../src/game/balance.js';
import { CHALLENGES, isChallenge, nameOf, saysOf } from '../src/game/challenges.js';
import { table, clock, int, dec } from './headless/tables.js';

const DEFAULTS = {
  seeds: 8,
  seconds: 300,
  // The careless pair of eyes, on purpose: see the header. `aware` sees a rule about the crowd and
  // nothing about a touch; `naive` is harsher still and dies in the first minute of a plain run.
  policy: 'human',
  picks: 'random',
  challenges: 'none,brittle,grounded,merciless,swift,thick',
  // The shipped get-out habit (tools/headless/bot.js `DASH`), because NO DASH is a rule about a dash
  // and a ladder whose bot never pressed it in the first place would be measuring the two cards the
  // deck lost, not the jump.
  dash: true,
  speed: null,
  hold: null,
  grace: null,
  strict: false,
};

/** The six rows the ladder can print: `none` beside the five rules. */
const PLAIN = 'none';

/**
 * Which rules are about what a touch costs, and so need a batch that actually loses a hull before the
 * ladder can see them. ONE HULL makes one touch the last one; SHORT GRACE makes the touches come in
 * clusters. Neither shows up in a batch nobody wounded, and a pass bought by an instrument that could
 * not see the rule would be worse than no pass.
 */
const TOUCH_RULES = ['brittle', 'merciless'];

/**
 * How much of the middle score a rule has to take off to be believed.
 *
 * The batches are paired - the same seeds flown under every rule - so this is not a noise allowance.
 * It is a claim: a rule that costs a run less than a twentieth of its score is not the rule its card
 * says it is, and a ladder that passed it would be grading the card and not the game.
 */
const MIN_COST = 0.05;
const COST_RATIO = 1 - MIN_COST;

function readArgs(argv) {
  const opts = Object.assign({}, DEFAULTS);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => { i++; return argv[i]; };
    if (arg === '--seeds') opts.seeds = parseInt(next(), 10);
    else if (arg === '--seconds') opts.seconds = parseFloat(next());
    else if (arg === '--bot') opts.policy = next();
    else if (arg === '--picks') opts.picks = next();
    else if (arg === '--challenges') opts.challenges = next();
    else if (arg === '--no-dash') opts.dash = false;
    else if (arg === '--speed') opts.speed = Number(next());
    else if (arg === '--hold') opts.hold = Number(next());
    else if (arg === '--grace') opts.grace = Number(next());
    else if (arg === '--strict') opts.strict = true;
    else { console.error('unknown option: ' + arg); process.exit(2); }
  }
  if (!Number.isFinite(opts.seeds) || !Number.isFinite(opts.seconds) || opts.seeds < 1) {
    console.error('--seeds wants a count and --seconds a number of seconds');
    process.exit(2);
  }
  // Checked before a single run, because a batch is minutes of work.
  for (const name of opts.challenges.split(',')) {
    if (name !== PLAIN && !isChallenge(name)) {
      console.error('--challenges wants `' + PLAIN + '` or one of: ' + CHALLENGES.map((c) => c.id).join(', '));
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
  if (opts.speed !== null && !(opts.speed > 1)) {
    console.error('--speed wants a multiplier above 1, such as 1.3');
    process.exit(2);
  }
  if (opts.hold !== null && !(opts.hold > 1)) {
    console.error('--hold wants a multiplier above 1, such as 1.5');
    process.exit(2);
  }
  if (opts.grace !== null && !(opts.grace >= 0)) {
    console.error('--grace wants a number of seconds; 0 takes the gap away altogether');
    process.exit(2);
  }
  return opts;
}

/** Median, or null: a batch that never died has no middle of deaths to show. */
function median(values) {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Put one rule's number over what ships, for a sweep.
 *
 * Both of these rows are read where the number is spent - `swift.speedMul` every time the sim builds a
 * body, `thick.holdMul` every time the wave director asks what the arena may hold - so writing one
 * here changes the next body and nothing else, the same reason `tools/ghost-grid.js` can sweep a
 * radius. Nothing in a run is touched, so the batch is a measurement of the game and not of the tool.
 */
function setSpeed(mul) {
  if (mul === null) return;
  BALANCE.challenges.swift.speedMul = mul;
}

/** The same door on the thick crowd's share of the arena. */
function setHold(mul) {
  if (mul === null) return;
  BALANCE.challenges.thick.holdMul = mul;
}

/**
 * The same door on the gap a hit leaves the ship, which is read every time a hit lands. It is why 0 can
 * be tried at all: the sweep is how the shipped number was shown to be a floor and not a preference.
 */
function setGrace(seconds) {
  if (seconds === null) return;
  BALANCE.challenges.merciless.grace = seconds;
}

/** One row per rule, on the same seeds. */
async function measure(opts) {
  const names = opts.challenges.split(',');
  const rows = [];
  const batches = names.map((name) => {
    const finished = [];
    return {
      batch: {
        seeds: Array.from({ length: opts.seeds }, (unused, i) => i + 1),
        maxSeconds: opts.seconds,
        policy: opts.policy,
        picks: opts.picks,
        // `none` is the game as it shipped, which the game calls no challenge at all.
        challenge: name === PLAIN ? '' : name,
        dash: opts.dash,
        onRun: (summary) => { finished.push(summary); },
      },
      report: () => {
        const deaths = finished.filter((s) => s.died).map((s) => s.seconds);
        const total = (pick) => finished.reduce((sum, s) => sum + pick(s), 0);
        return {
          id: name,
          middleDeath: median(deaths),
          died: deaths.length,
          won: finished.filter((s) => s.won).length,
          middleScore: median(finished.map((s) => s.stats.score)),
          bestScore: Math.max(...finished.map((s) => s.stats.score)),
          fights: total((s) => s.stats.bossesDown),
          hulls: total((s) => s.tally.hullLost),
          level: median(finished.map((s) => s.stats.level)),
        };
      },
    };
  });

  await playBatches(batches.map((b) => b.batch));
  for (const b of batches) rows.push(b.report());
  return rows;
}

/**
 * The verdict. A rule that costs nothing is not a challenge. Four of the five rules are judged and
 * one is not, and the difference is what the ladder can see.
 *
 *   **ONE HULL, SHORT GRACE, SWIFT CROWD and THICK CROWD are judged**, the two rules about a touch
 *     provided the plain batch actually lost hulls - which is what says the ladder can see a rule about
 *     losing one at all. An aware bot that finishes a run with three hull in a body that costs one is
 *     not an instrument for those two rules, and saying so beats failing a rule the instrument cannot
 *     reach. The two crowd rules need no such proviso: a crowd is in front of every pair of eyes,
 *     careless or not.
 *
 *   **NO DASH is reported and never judged**, and the reason is in the columns rather than in a
 *     paragraph: taking the jump away from a hand that presses it ten times a quarter-hour is a small
 *     thing, and taking the two cards that need it out of a careless deck can be worth more than the
 *     jump was. Whether that rule is hard is a question about a person who *lives* on the dash, and
 *     no bot here is one.
 *
 * Returns the lines to print and the lines that are failures, so `--strict` has something to exit on
 * and a test has something to assert on without parsing prose (the same shape `tools/ghost-grid.js`
 * settled on).
 */
export function verdictOf(rows, plain) {
  const problems = [];
  const skipped = [];
  const touchable = plain !== undefined && plain.hulls > 0;
  for (const row of rows) {
    if (row.id === PLAIN || plain === undefined || plain.middleScore === 0) continue;
    const ratio = row.middleScore / plain.middleScore;
    if (row.id === 'grounded') {
      skipped.push(nameOf(row.id) + ' is reported and not judged: it read ' + dec(ratio, 2)
        + 'x plain, which is the two cards the deck lost and the jump this hand barely spends, not a '
        + 'verdict about a person who uses it.');
      continue;
    }
    if (TOUCH_RULES.indexOf(row.id) >= 0 && !touchable) {
      skipped.push(nameOf(row.id) + ' is not measurable on this ladder: the plain batch lost no '
        + 'hulls at all, so a rule about what a touch costs cannot show up in it. Fly a worse hand '
        + '(`--bot naive`) or a careless one (`--bot human --picks random`).');
      continue;
    }
    if (ratio > COST_RATIO) {
      problems.push(nameOf(row.id) + ' scored ' + dec(ratio, 2) + 'x plain, which is above the '
        + dec(COST_RATIO, 2) + 'x a rule has to beat: a rule that says it is harder has to be paid '
        + 'for in the score column, or it is a flavour setting.');
    }
    if (row.middleDeath !== null && plain.middleDeath !== null
        && row.middleDeath > plain.middleDeath) {
      problems.push(nameOf(row.id) + '\'s middle of deaths is ' + clock(row.middleDeath)
        + ' against plain\'s ' + clock(plain.middleDeath) + ': it outlasts the plain batch.');
    }
  }
  return { problems, skipped };
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const opts = readArgs(process.argv.slice(2));
  setSpeed(opts.speed);
  setHold(opts.hold);
  setGrace(opts.grace);
  const rows = await measure(opts);
  const plain = rows.find((r) => r.id === PLAIN);

  const title = 'the challenges, on ' + opts.seeds + ' seeds of ' + clock(opts.seconds)
    + ', ' + opts.policy + ' bot'
    + (opts.picks === undefined ? '' : ' answering the level-up ' + opts.picks)
    + (opts.dash ? ', pressing the get-out dash' : ', never pressing the dash')
    + (opts.speed === null ? '' : ', the swift crowd at ' + dec(opts.speed, 2) + 'x')
    + (opts.hold === null ? '' : ', the thick crowd at ' + dec(opts.hold, 2) + 'x')
    + (opts.grace === null ? '' : ', a hit leaving ' + dec(opts.grace, 2) + 's');
  const note = 'Each row is the same seeds flown under one rule, `plain` being the game as it shipped.\n'
    + '`middle death` is the middle of the runs that died - a batch that never died has no middle and\n'
    + 'shows a dash - and `vs plain` is the middle score against plain\'s, so below 1.00x is less for\n'
    + 'the same window. `hulls` is every hull the batch lost, which is what says whether this ladder\n'
    + 'could see a rule about losing one at all; `fights` is every boss it buried and `won` the runs\n'
    + 'that came out of the schedule standing. This is the bot\'s cost and not a person\'s.';

  const align = 'lrrrrrrrr';
  const header = ['rule', 'middle death', 'died', 'middle score', 'best score', 'vs plain',
    'hulls', 'fights', 'won'];
  const body = rows.map((row) => [
    row.id === PLAIN ? 'plain' : nameOf(row.id),
    row.middleDeath === null ? '-' : clock(row.middleDeath),
    row.died + '/' + opts.seeds,
    int(row.middleScore),
    int(row.bestScore),
    plain === undefined || plain.middleScore === 0 ? '-'
      : dec(row.middleScore / plain.middleScore, 2) + 'x',
    String(row.hulls),
    String(row.fights),
    String(row.won),
  ]);
  console.log(table(title, note, align, header, body));

  console.log('');
  console.log('What the card says each rule does, read out of the row the sim itself reads:');
  for (const row of rows) {
    if (row.id === PLAIN) continue;
    console.log('  ' + nameOf(row.id) + ' \u00b7 ' + saysOf(row.id));
  }

  const verdict = verdictOf(rows, plain);
  for (const line of verdict.skipped) {
    console.log('');
    console.log('Not judged: ' + line);
  }

  console.log('');
  if (verdict.problems.length > 0) {
    console.log('VERDICT: FAIL');
    for (const line of verdict.problems) console.log('  - ' + line);
    console.log('');
    console.log('Either the rule is not what its card says it is, or this bot is not the yardstick');
    console.log('for it and the number has to be read off a person instead. Both answers are worth');
    console.log('having; neither is a pass.');
    if (opts.strict) process.exit(1);
  } else {
    console.log('VERDICT: every rule this ladder could see is paid for in the score column.');
    console.log('The `died` column is what a rule does to a run\'s length and the score column is what');
    console.log('it does to what a run is worth; a rule that moves only one of the two is half a rule.');
  }
}
