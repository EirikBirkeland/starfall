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
//   node tools/challenge-cost.js --challenges none,brittle  two of the seven rows
//   node tools/challenge-cost.js --speed 1.3              the swift crowd's multiplier, tried live
//   node tools/challenge-cost.js --hold 1.75              the thick crowd's, tried live
//   node tools/challenge-cost.js --reach 0.25             the shard net's reach, tried live
//   node tools/challenge-cost.js --grace 0.75             the gap a hit leaves, tried live
//   node tools/challenge-cost.js --cards 2                ONE CARD's rack, tried at another size
//   node tools/challenge-cost.js --bot aware --challenges none,thin
//                                               ONE CARD, on the one hand that can price a choice
//   node tools/challenge-cost.js --dump                   print every seed behind the readings
//   node tools/challenge-cost.js --strict                 non-zero unless the rules cost what they claim
//   node tools/challenge-cost.js --seeds 24 --seconds 300
//                                              re-fly the numbers written into the game, and say
//                                              whether they still hold
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
// thick crowd's share of the arena, `--grace` the same door on the gap a hit leaves the ship, `--reach`
// the same door on how far the shard net reaches, and `--cards` the same door on how many places the
// rule's rack has.
//
// A rule about the **deal** is priced on a second table, and that is the one real subtlety here. Two
// facts about the default hand make it so. First, it answers the level-up at random, so a rule that takes
// the *choice* away takes away something this hand never used - ONE CARD flown on it measures a random
// draw of one card against a random draw of three, which is close to nothing. So the ladder flies the
// plain run and that rule a second time with the same careless feet answering the level-up on purpose
// (`--picks wise`), and judges it there. Second, and found the hard way: a deliberate hand is only a
// yardstick if its picks are worth something, and that has to be *shown* rather than read off the middles
// of two batches - on the default `human` policy the careful plain's middle scored *under* its careless
// one on 32 seeds and *over* it on 12 (NOTES sessions 157 and 158), which is two middles quarrelling and
// not a reading. Asked seed against seed the same batches say the two cannot be told apart, so taking a
// choice away from that hand is worth nothing measurable and the rule read as a gift. On `--bot aware`
// the seeds all agree and the taste is worth most of a run, which is where the shipped 0.41x comes from.
// So the ladder prints what its deliberate hand's taste is worth - by middles and by pairs - and refuses
// to judge a deal rule on a hand that cannot be shown to pick better than a die. A rule about a choice can
// only be priced by a hand that makes good ones, and saying which hand was flown beats passing what it
// could not see.
//
// Every one of those numbers then goes into the game: it is written into `BALANCE.challenges` as the rule's
// `measured` row, and a number that lives in the game without its window is a number that goes quiet when it
// stops being true. `tools/challenge-cost.js` therefore also *checks the quote*: every row carries the
// seeds, the window, the policy and the picks it was measured on and the pair it was counted on, and the
// ladder prints its own reading beside it - reproduced, stale, or "this ladder flew a different hand, and
// here is the command that would check it".
//
// Two traps there, both paid for by the flights that found them. The first is that a middle of a batch is
// not self-evidencing: it moves by a third of its own value between two batches of eight seeds, and a fresh
// date on a number the seeds do not back is a dated noise (NOTES session 158). So every quote carries its
// pair - of the seeds that could tell the two runs apart, how many the plain run won - and a quote whose
// pair is a coin is not a quote. The second is that the *size* cannot come out of the same pairing: a run
// of this game is a chaotic trajectory, and the same six seeds under ONE CARD came back at 0.15x, 0.24x,
// 0.56x, 1.20x, 4.05x and 5.14x of what they scored plain. Any middle or mean of ratios like those is a
// story about whichever seeds happened to be extreme - a mean of them read 1.62x for a crowd rule whose
// middles read 0.76x. The count is stable where the size is not, so the size stays what it always was, a
// batch middle over a batch middle, with the pair beside it saying whether that middle is a finding.
//
// One column is deliberately missing: what a rule feels like. NO DASH measured against a bot that
// presses the dash ten times a quarter-hour (NOTES session 114) may read as nearly free while a
// person who lives on the dash feels it in every corner. The number here is the bot's and it is
// labelled as that; the card says what the rule does, and only eyes on a screen can say whether that
// is too much.

import { pathToFileURL } from 'node:url';

import { playBatches, POLICIES, PICKS } from './headless/bot.js';
import { BALANCE } from '../src/game/balance.js';
import { CHALLENGES, isChallenge, measuredOf, nameOf, saysOf } from '../src/game/challenges.js';
import { table, clock, int, dec } from './headless/tables.js';
import { median, pairedRatio, isBetter, pairWords, signTest, CONFIDENCE } from './headless/pairs.js';

const DEFAULTS = {
  seeds: 8,
  seconds: 300,
  // The careless pair of eyes, on purpose: see the header. `aware` sees a rule about the crowd and
  // nothing about a touch; `naive` is harsher still and dies in the first minute of a plain run.
  policy: 'human',
  picks: 'random',
  challenges: 'none,brittle,grounded,merciless,swift,thick,byhand,thin',
  // The shipped get-out habit (tools/headless/bot.js `DASH`), because NO DASH is a rule about a dash
  // and a ladder whose bot never pressed it in the first place would be measuring the two cards the
  // deck lost, not the jump.
  dash: true,
  speed: null,
  hold: null,
  reach: null,
  grace: null,
  cards: null,
  strict: false,
  dump: false,
};

/** The eight rows the ladder can print: `none` beside the seven rules. */
const PLAIN = 'none';

/**
 * Which rules are about what the *deal* gives the run, and so have to be priced on a hand that picks on
 * purpose. The careless hand answers the level-up at random; a rule that removes a choice from it
 * removes nothing it was using. See the header.
 */
const DEAL_RULES = ['thin'];

/** How the second table answers the level-up: the same careless feet, choosing deliberately. */
const DELIBERATE_PICKS = 'wise';

/**
 * What a rule's middle of deaths is allowed to decide, judged against its own plain row.
 *
 * `judge` is the ordinary case: a rule that lets the batch outlive the plain batch is buying its way
 * into the ladder and the `died` column is where that shows.
 *
 * `report` is for a rule about the **deal**, whose whole cost is a choice the hand no longer gets. Its
 * middle of deaths is only comparable when both batches died in numbers worth comparing, and the hand
 * that can price a choice is the hand that hardly dies at all: on the aware hand that priced ONE CARD
 * (24 seeds x 8m, NOTES session 157) the deliberate plain lost **1 run in 24** and the thin batch 5, so
 * those two medians are one sample against five, and the honest column is the `died` one the table
 * prints. A deal rule is still judged on the score column - that is the column the rule is paid in, and
 * it paid at 0.41x there. Said out loud rather than exempted in silence.
 */
const DEATHS = { judge: 'judge', report: 'report' };

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

/**
 * How far a re-flight may move a quoted cost and still be the same measurement.
 *
 * A relative slack, with a floor, because the quotes are ratios and a rule quoted at 0.9x has a lot
 * less room to move than one quoted at 0.4x. The size is a working tolerance and not a statistic: it is
 * how far a re-flight has to disagree before the ladder is willing to say the game's number has gone out
 * of date, and it is deliberately wider than the wander a re-flight of the paired reading shows day to
 * day (the *middles* wander by a good deal more, which is what session 158 found). A stale call is not a
 * verdict about the rule; it is the ladder saying *go and re-measure this*, and the line it prints says
 * which of the two numbers it is holding against the other.
 */
const QUOTE_SLACK = 0.25;

/** The same slack, in absolute terms, for a quote sitting near 1.00x where a relative one is mean. */
const QUOTE_SLACK_FLOOR = 0.05;

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
    else if (arg === '--reach') opts.reach = Number(next());
    else if (arg === '--grace') opts.grace = Number(next());
    else if (arg === '--cards') opts.cards = parseInt(next(), 10);
    else if (arg === '--strict') opts.strict = true;
    else if (arg === '--dump') opts.dump = true;
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
  if (opts.reach !== null && !(opts.reach >= 0)) {
    console.error('--reach wants a share of the shipped reach; 0 takes the net away altogether');
    process.exit(2);
  }
  if (opts.grace !== null && !(opts.grace >= 0)) {
    console.error('--grace wants a number of seconds; 0 takes the gap away altogether');
    process.exit(2);
  }
  if (opts.cards !== null && !(opts.cards >= 1)) {
    console.error('--cards wants how many places the rack has, such as 1');
    process.exit(2);
  }
  return opts;
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
 * The same door on how far the shard net reaches, which is read every time a shard is pulled. A share
 * and not a radius, because that is what the row holds: `--reach 1` is BY HAND flying with the net it
 * ships with, which is the control that says the reading below is the rule and not the window.
 */
function setReach(share) {
  if (share === null) return;
  BALANCE.challenges.byhand.reachMul = share;
}

/**
 * The same door on the gap a hit leaves the ship, which is read every time a hit lands. It is why 0 can
 * be tried at all: the sweep is how the shipped number was shown to be a floor and not a preference.
 */
function setGrace(seconds) {
  if (seconds === null) return;
  BALANCE.challenges.merciless.grace = seconds;
}

/**
 * The same door on how many places the rule's rack has, which is read every time a level is paid.
 * `--cards 2` is ONE CARD with a roomier rack, which is how the shipped number gets swept; the plain
 * row keeps dealing what ships, so every ratio on the table is the rule against the game and not one
 * sweep against another.
 */
function setCards(places) {
  if (places === null) return;
  BALANCE.challenges.thin.offer = places;
}

/** Which of the rows asked for are about the deal, and so have to be flown twice. */
function dealNamesOf(names) {
  return names.filter((name) => DEAL_RULES.indexOf(name) >= 0);
}

/**
 * Fly every row on the same seeds, in one process and one booted game (the game is one per process -
 * NOTES session 3 - so both tables of a ladder have to come out of one `playBatches` call).
 *
 * `specs` is what to fly: a rule name and how the level-up is answered. Every row is reported with the
 * picks it was flown on, because the two tables of one run differ by nothing else.
 */
async function measure(opts, specs) {
  const rows = [];
  const batches = specs.map((spec) => {
    const finished = [];
    return {
      batch: {
        seeds: Array.from({ length: opts.seeds }, (unused, i) => i + 1),
        maxSeconds: opts.seconds,
        policy: opts.policy,
        picks: spec.picks,
        // `none` is the game as it shipped, which the game calls no challenge at all.
        challenge: spec.id === PLAIN ? '' : spec.id,
        dash: opts.dash,
        onRun: (summary) => { finished.push(summary); },
      },
      report: () => {
        const deaths = finished.filter((s) => s.died).map((s) => s.seconds);
        const total = (pick) => finished.reduce((sum, s) => sum + pick(s), 0);
        return {
          id: spec.id,
          picks: spec.picks,
          // seed -> that run's score, which is what a pair is made from: the deal table and the
          // careless one are the same seeds, so the taste gate below is allowed to ask seed by seed.
          bySeed: new Map(finished.map((s) => [s.seed, s.stats.score])),
          middleDeath: median(deaths),
          died: deaths.length,
          won: finished.filter((s) => s.won).length,
          middleScore: median(finished.map((s) => s.stats.score)),
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
 * One table of rows, printed the same way every time, so that the two tables a ladder can come back with
 * are read against each other column for column.
 *
 * Two columns are the same rule asked two ways. `vs plain` is the middle score over the middle score - the
 * number a rule's `measured` row in the game holds, and the one every quote in NOTES was written with.
 * `plain won` is the pair: of the seeds that could tell the two runs apart, how many the plain run scored
 * higher on. The first says how much a rule costs and the second says whether that is a finding or a coin,
 * which matters because a run of this game is a chaotic trajectory and a couple of seeds can move a middle
 * (NOTES session 158). `best score` used to be on this table and is not any more: it is the single run that
 * happened to be lucky, and it is the column that fooled a ladder once.
 */
function printTable(rows, plain, opts, title, note) {
  const align = 'lrrrrrrrr';
  const header = ['rule', 'middle death', 'died', 'middle score', 'vs plain', 'plain won',
    'hulls', 'fights', 'won'];
  const body = rows.map((row) => {
    const pair = plain === undefined || row === plain ? null : pairedRatio(row.bySeed, plain.bySeed);
    return [
      row.id === PLAIN ? 'plain' : nameOf(row.id),
      row.middleDeath === null ? '-' : clock(row.middleDeath),
      row.died + '/' + opts.seeds,
      int(row.middleScore),
      plain === undefined || plain.middleScore === 0 ? '-'
        : dec(row.middleScore / plain.middleScore, 2) + 'x',
      pair === null ? '-'
        : (pair.compared === 0 ? '0/0' : pair.losses + '/' + pair.compared),
      String(row.hulls),
      String(row.fights),
      String(row.won),
    ];
  });
  console.log(table(title, note, align, header, body));
}

/**
 * The verdict. A rule that costs nothing is not a challenge. Six of the seven rules are judged and one
 * is only judged on a hand that can judge it, and the difference is what the ladder can see.
 *
 *   **ONE HULL, SHORT GRACE, SWIFT CROWD, THICK CROWD and BY HAND are judged**, the two rules about a
 *     touch provided the plain batch actually lost hulls - which is what says the ladder can see a rule
 *     about losing one at all. An aware bot that finishes a run with three hull in a body that costs
 *     one is not an instrument for those two rules, and saying so beats failing a rule the instrument
 *     cannot reach. The two crowd rules need no such proviso, nor does the loot: a crowd and a pile of
 *     shards are in front of every pair of eyes, careless or not.
 *
 *   **NO DASH is reported and never judged**, and the reason is in the columns rather than in a
 *     paragraph: taking the jump away from a hand that presses it ten times a quarter-hour is a small
 *     thing, and taking the two cards that need it out of a careless deck can be worth more than the
 *     jump was. Whether that rule is hard is a question about a person who *lives* on the dash, and
 *     no bot here is one.
 *
 *   **ONE CARD is judged on the deliberate table, and only if that table can show it has taste.** A
 *     hand that picks at random cannot miss a choice it never made, so the rule is stood aside on the
 *     first table and priced where the same feet answer the level-up on purpose. And a deliberate hand
 *     is only an instrument if its picks are worth something, which is measured rather than assumed -
 *     see `dealTasteOf`. On the shipped careless hand the aware policy has to be the one flown
 *     (`--bot aware`): NOTES session 157 has both readings.
 *
 * Returns the lines to print and the lines that are failures, so `--strict` has something to exit on
 * and a test has something to assert on without parsing prose (the same shape `tools/ghost-grid.js`
 * settled on).
 */
export function verdictOf(rows, plain, deal) {
  const problems = [];
  const skipped = [];
  const touchable = plain !== undefined && plain.hulls > 0;
  const deliberatePass = deal !== undefined && deal.rows !== rows;   // a second table was flown
  const taste = dealTasteOf(deal);
  const dealJudged = deliberatePass && taste !== null && isBetter(taste);
  for (const row of rows) {
    if (row.id === PLAIN || plain === undefined || plain.middleScore === 0) continue;
    const ratio = row.middleScore / plain.middleScore;
    if (row.id === 'grounded') {
      skipped.push(nameOf(row.id) + ' is reported and not judged: it read ' + dec(ratio, 2)
        + 'x plain, which is the two cards the deck lost and the jump this hand barely spends, not a '
        + 'verdict about a person who uses it.');
      continue;
    }
    if (DEAL_RULES.indexOf(row.id) >= 0) {
      if (deal === undefined) {
        skipped.push(nameOf(row.id) + ' is about the deal, and this ladder never flew a hand that '
          + 'makes one, so there is no verdict here to give: fly the default, which adds the deliberate '
          + 'pass, or ask for one with `--picks wise`.');
        continue;
      }
      if (!deliberatePass) {
        skipped.push(nameOf(row.id) + ' cannot be priced on a ladder that flew *only* the deliberate '
          + 'hand: nothing says whether that hand\'s picks are worth anything, and that is the whole of '
          + 'what the rule takes away. Fly `none,' + row.id + '` on a careless hand and it will check.');
        continue;
      }
      if (!dealJudged) {
        skipped.push(nameOf(row.id) + ' is not priced by this ladder: ' + tasteWords(taste, deal)
          + '. It read ' + dec(ratio, 2) + 'x plain here, which is the same nothing. (`--bot aware` flies '
          + 'the hand whose picks are worth pricing; `tools/pick-taste.js` says why this one has none - '
          + 'it dies around level seven with half a dozen cards spent, and a taste needs a build to be '
          + 'worth anything.)');
        continue;
      }
      skipped.push(nameOf(row.id) + ' is priced on the deliberate table and not this one: it read '
        + dec(ratio, 2) + 'x plain here, and a hand that answers the level-up at random cannot miss a '
        + 'choice it never made.');
      continue;
    }
    if (TOUCH_RULES.indexOf(row.id) >= 0 && !touchable) {
      skipped.push(nameOf(row.id) + ' is not measurable on this ladder: the plain batch lost no '
        + 'hulls at all, so a rule about what a touch costs cannot show up in it. Fly a worse hand '
        + '(`--bot naive`) or a careless one (`--bot human --picks random`).');
      continue;
    }
    judgeAgainst(row, plain, problems, skipped, DEATHS.judge);
  }
  // The deal rules, on the hand that picks on purpose - which is only an instrument when its taste has
  // been measured (see dealTasteOf), and every refusal above said so out loud rather than passing it.
  if (dealJudged && deal.plain !== undefined && deal.plain.middleScore > 0) {
    for (const row of deal.rows) {
      if (row.id === PLAIN) continue;
      judgeAgainst(row, deal.plain, problems, skipped, DEATHS.report);
    }
  }
  return { problems, skipped };
}

/**
 * What the deliberate hand's card taste is worth: its plain run against the same policy's careless
 * plain run, which differ in nothing except how the level-up was answered - counted **seed against
 * seed**, because that is the only comparison here that is not moved by which seeds were flown.
 *
 * This is the ladder asking whether it is holding a yardstick at all, and on the shipped hand the answer
 * is no. On the `human` policy the careful plain's *middle* scored under the careless one on 32 seeds
 * and over it on 12 (NOTES sessions 157 and 158) - two middles quarrelling, which is what this gate was
 * written before and what it stopped being written on. Asked seed by seed the same batch says it cannot
 * tell the picker from a die, and a hand that cannot be *shown* to pick better cannot say what losing
 * the choice costs. On the `aware` policy the taste is worth most of a run and the seeds all agree, so
 * ONE CARD is priced there and nowhere else.
 *
 * `tools/pick-taste.js` is the ladder that measures the taste on its own, with no rule in sight, and it
 * says *why* the short-handed batches say nothing: they die with a handful of cards spent, where which
 * handful buys nothing, while the aware batch is thirty-something levels deep and has spent thirty-some
 * cards. That is a by-product of that ladder and not a finding of this one.
 *
 * Answers `null` when there is no careless plain to compare with - a ladder flown wholly on the
 * deliberate hand, which is a hand of unknown taste and prices nothing.
 */
function dealTasteOf(deal) {
  if (deal === undefined) return null;
  const deliberate = deal.plain;
  const careless = deal.carelessPlain;
  // No careless plain next to it means the whole ladder was flown on the deliberate hand, which is a
  // hand of unknown taste and prices nothing.
  if (deliberate === undefined || careless === undefined) return null;
  const pair = pairedRatio(deliberate.bySeed, careless.bySeed);
  return pair.seeds === 0 ? null : pair;
}

/** Why the deliberate hand was not believed, in the words the refusal prints. */
function tasteWords(taste, deal) {
  if (taste === null || deal.plain === undefined || deal.carelessPlain === undefined) {
    return 'nothing was flown against it to show that it picks better than a die';
  }
  return 'the hand answering the level-up on purpose was worth ' + dec(taste.medianRatio, 2)
    + 'x a run per seed against the careless hand on the same seeds and was chosen on '
    + pairWords(taste) + ' (its plain run scored ' + int(deal.plain.middleScore)
    + ' against the careless hand\'s ' + int(deal.carelessPlain.middleScore)
    + '), and a hand that cannot be shown to pick better than a die cannot say what losing the '
    + 'choice costs';
}

/**
 * The two questions one row can be asked against its own plain row: did it pay in the score column,
 * and did it outlive the plain batch. `deaths` says which of the two the second one is allowed to
 * decide - see DEATHS.
 */
function judgeAgainst(row, plain, problems, notes, deaths) {
  const ratio = row.middleScore / plain.middleScore;
  if (ratio > COST_RATIO) {
    problems.push(nameOf(row.id) + ' scored ' + dec(ratio, 2) + 'x plain, which is above the '
      + dec(COST_RATIO, 2) + 'x a rule has to beat: a rule that says it is harder has to be paid '
      + 'for in the score column, or it is a flavour setting.');
  }
  if (row.middleDeath === null || plain.middleDeath === null
      || row.middleDeath <= plain.middleDeath) return;
  if (deaths === DEATHS.judge) {
    problems.push(nameOf(row.id) + '\'s middle of deaths is ' + clock(row.middleDeath)
      + ' against plain\'s ' + clock(plain.middleDeath) + ': it outlasts the plain batch.');
    return;
  }
  notes.push(nameOf(row.id) + ' outlived the deliberate plain - ' + clock(row.middleDeath)
    + ' against ' + clock(plain.middleDeath) + ', on ' + row.died + ' deaths to plain\'s ' + plain.died
    + ' - and that column is reported and not judged here (see DEATHS). The score column, which this'
    + ' rule does have to pay, is judged.');
}

// ---------------------------------------------------------------------------
// The seeds themselves, for when a reading has to be looked at rather than believed.
//
// Every summary on the table is one number, and the whole point of session 158 was that one number can be
// a middle that a couple of lucky seeds decided. `--dump` prints what went into a row - each seed, its
// score, the plain run's score for the same seed, and the ratio between them - which is how you tell a rule
// that took half of every run from a rule that took everything from four runs and nothing from the other
// twenty. It changes nothing about the flight: the same batches, printed wider.
// ---------------------------------------------------------------------------

function dumpTable(rows, plain) {
  if (plain === undefined) return;
  for (const row of rows) {
    if (row === plain) continue;
    const pair = pairedRatio(row.bySeed, plain.bySeed);
    console.log('');
    console.log(nameOf(row.id) + ' against plain, seed by seed:');
    for (const entry of row.bySeed) {
      const other = plain.bySeed.get(entry[0]);
      console.log('  seed ' + entry[0] + ': ' + int(entry[1]) + ' against ' + int(other) + ', '
        + (other > 0 ? dec(entry[1] / other, 2) + 'x' : '-')
        + (entry[1] === other ? '  (the same score: this run never asked the rule anything)' : ''));
    }
    console.log('  the batch middles say ' + dec(row.middleScore / plain.middleScore, 2) + 'x; '
      + pair.losses + ' of the ' + pair.compared + ' seeds that could tell were won by plain, '
      + pair.wins + ' by the rule, ' + pair.ties + ' tied (p = '
      + (pair.p < 0.001 ? '<0.001' : pair.p.toFixed(3)) + '); the middle of the per-seed ratios is '
      + (pair.medianRatio === null ? 'nothing to divide'
        : dec(pair.medianRatio, 2) + 'x, which is printed to be looked at and not believed - one seed can '
        + 'speak five times for itself in this game, as tools/headless/pairs.js explains') + '.');
  }
}

// ---------------------------------------------------------------------------
// The quotes. What the game says each rule costs, held against what this flight says it costs.
//
// A challenge's number is written into `BALANCE.challenges` next to the lever it measures, and a number
// the game carries without its window is a number that goes quiet when it stops being true: the same
// rule reads one way over a five-minute window and another way over an eight-minute one, and the game
// has changed underneath most of these quotes since they were taken. So the ladder is asked a second
// question besides "is this rule a rule" - *is the number in the game still the number the game
// measures* - and it answers it twice over: the middle of each batch, which is the size the quote holds,
// and the pair of seeds, which is what says whether that size is a finding or a coin flip.
// ---------------------------------------------------------------------------

/**
 * The pair a `measured` row asserts, in the shape `pairedRatio` hands back: the rule first.
 *
 * Only the split is stored, because only the split is a claim the row gets to make: the size in `cost` is a
 * middle of two batches and not a paired number at all (see the header). The p is derived from the split
 * rather than written down beside it, so a quote cannot disagree with its own arithmetic.
 */
function quotePair(m) {
  return {
    seeds: m.seeds,
    compared: m.plainWon + m.ruleWon,
    wins: m.ruleWon,
    losses: m.plainWon,
    p: signTest(m.ruleWon, m.plainWon),
  };
}

/** Did these seeds show a difference, or only lean towards one? */
function shownWords(pair) {
  return pair.p <= CONFIDENCE
    ? 'a difference the seeds showed (' + pairWords(pair) + ')'
    : 'a lean and nothing more (' + pairWords(pair) + ')';
}

/** The window and the hand a quote was made on, in the words the ladder prints. */
function quoteWindow(m) {
  return m.seeds + ' seeds x ' + clock(m.seconds) + ', the ' + m.policy + ' hand answering the level-up '
    + m.picks + ', as of ' + m.on;
}

/** The shortest command that re-flies one quote exactly. */
function quoteCommand(m, id) {
  const parts = ['tools/challenge-cost.js'];
  if (m.policy !== DEFAULTS.policy) parts.push('--bot ' + m.policy);
  // The deliberate table is what the default already adds on its own; any other way of answering the
  // level-up has to be asked for by name.
  if (m.picks !== DEFAULTS.picks && m.picks !== DELIBERATE_PICKS) parts.push('--picks ' + m.picks);
  parts.push('--challenges ' + PLAIN + ',' + id);
  parts.push('--seeds ' + m.seeds);
  parts.push('--seconds ' + m.seconds);
  return 'node ' + parts.join(' ');
}

/**
 * Every rule the game quotes, held against this flight.
 *
 * `tables` is every table that was flown (`{ policy, picks, rows, plain }`), because a rule's quote names
 * the hand it was measured on and the ladder has to find that table or say it never flew it - ONE CARD is
 * quoted on a deliberate hand and nowhere else, and NO DASH is quoted nowhere at all. `flown` says what
 * this ladder flew (`{ seeds, seconds, swept }`): a quote is only *checked* by a flight of the same
 * window on the same hand, and a sweep of the very number being quoted tests the sweep and not the quote.
 *
 * A quote is **contradicted** whenever the same hand's seeds show the rule scoring *more* than plain -
 * that is a finding about the rule and not about the window, so it is reported whatever the seeds and
 * seconds were. Otherwise: reproduced, or stale (same window, reading outside `QUOTE_SLACK`), or not
 * checked here, with the one command that would check it - and the reading is printed either way, because
 * a number the operator can paste into the balance sheet is half the point of flying the batch.
 *
 * Returns `{ lines, problems }` in the same shape `verdictOf` settled on. `quoteOf` is where the quotes
 * come from - the balance sheet by default, and a test's own table when the test wants to ask about a
 * quote the game is not making yet.
 */
export function quotesReport(tables, flown, quoteOf) {
  const quoted = quoteOf === undefined ? measuredOf : quoteOf;
  const lines = [];
  const problems = [];
  for (const challenge of CHALLENGES) {
    const id = challenge.id;
    const m = quoted(id);
    const name = nameOf(id);
    if (m === null) {
      lines.push(name + ' carries no number in the game, and that is the honest answer: this ladder has '
        + 'never been an instrument that could measure it, so there is nothing here to check and nothing '
        + 'here to believe either.');
      continue;
    }
    const quote = quotePair(m);
    const table = tables.find((t) => t.policy === m.policy && t.picks === m.picks);
    const row = table === undefined ? undefined : table.rows.find((r) => r.id === id);
    const plain = table === undefined ? undefined : table.plain;
    if (row === undefined || plain === undefined || plain.middleScore === 0) {
      lines.push(name + ' is quoted at ' + dec(m.cost, 2) + 'x (' + quoteWindow(m) + '), and this ladder '
        + 'never flew that hand against its own plain run, so it has no reading of it. `'
        + quoteCommand(m, id) + '` would check it.');
      continue;
    }
    const pair = pairedRatio(row.bySeed, plain.bySeed);
    const reading = row.middleScore / plain.middleScore;
    const size = plain.middleScore === 0 ? 'nothing to divide' : dec(reading, 2) + 'x';
    const backing = shownWords(pair);
    const said = name + ' is quoted at ' + dec(m.cost, 2) + 'x of a plain run\'s middle score ('
      + quoteWindow(m) + '; the plain run won ' + shownWords(quote) + ')';
    if (flown.swept.indexOf(id) >= 0) {
      lines.push(said + ', and this flight swept that very number, so it tested the sweep and not the '
        + 'quote. It reads ' + size + ' (' + backing + ') with the number swept; `' + quoteCommand(m, id)
        + '` checks the shipped one.');
      continue;
    }
    if (isBetter(pair)) {
      problems.push(name + ' is quoted at ' + dec(m.cost, 2) + 'x of a plain run\'s middle score ('
        + quoteWindow(m) + '), and these seeds say the other thing entirely: the rule read '
        + size + ' against plain and the seeds say ' + backing + ' - that is, the rule was shown to be '
        + 'worth *more*. Either the number in the game is wrong or the game has changed under it. '
        + 'Re-measure with `' + quoteCommand(m, id) + '`.');
      continue;
    }
    if (flown.seeds !== m.seeds || flown.seconds !== m.seconds) {
      lines.push(said + '. This ladder flew ' + flown.seeds + ' seeds x ' + clock(flown.seconds)
        + ', which is a different yardstick and cannot check it; here it reads ' + size + ' ('
        + backing + '). `' + quoteCommand(m, id) + '` flies the window the quote names.');
      continue;
    }
    const slack = Math.max(QUOTE_SLACK * m.cost, QUOTE_SLACK_FLOOR);
    if (Math.abs(reading - m.cost) > slack) {
      problems.push(name + ' is quoted at ' + dec(m.cost, 2) + 'x of a plain run\'s middle score ('
        + quoteWindow(m) + '), and this flight, on that same window and that same hand, reads '
        + size + ' (' + backing + ') - outside the ' + dec(slack, 2) + ' a re-flight is allowed. The '
        + 'number in the game is not the number the game measures any more: write this flight into '
        + 'BALANCE.challenges.' + id + '.measured, or say why it should not be believed.');
      continue;
    }
    lines.push(said + '. It reads ' + size + ' (' + backing + '), which is the same reading ('
      + dec(slack, 2) + ' of slack allowed) - reproduced.');
  }
  return { lines, problems };
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const opts = readArgs(process.argv.slice(2));
  setSpeed(opts.speed);
  setHold(opts.hold);
  setReach(opts.reach);
  setGrace(opts.grace);
  setCards(opts.cards);
  const names = opts.challenges.split(',');
  // One flight, both tables: the deal rules are flown twice, once the way this ladder answers the
  // level-up and once on purpose, and a second boot in one process is not a thing the game can do. If
  // the ladder was already asked to pick on purpose, there is only one table to fly and it is the one.
  const needsDeal = dealNamesOf(names).length > 0 && opts.picks !== DELIBERATE_PICKS;
  const specs = names.map((name) => ({ id: name, picks: opts.picks }));
  if (needsDeal) {
    specs.push({ id: PLAIN, picks: DELIBERATE_PICKS });
    for (const name of dealNamesOf(names)) specs.push({ id: name, picks: DELIBERATE_PICKS });
  }
  const flown = await measure(opts, specs);
  const rows = flown.filter((r) => r.picks === opts.picks);
  const plain = rows.find((r) => r.id === PLAIN);
  let deal;
  if (needsDeal) {
    const dealRows = flown.filter((r) => r.picks === DELIBERATE_PICKS);
    deal = { rows: dealRows, plain: dealRows.find((r) => r.id === PLAIN), carelessPlain: plain };
  } else if (dealNamesOf(names).length > 0) {
    deal = { rows, plain };
  }

  // Every table this flight produced, keyed the way a quote names a hand (policy + how it picked). A
  // rule's `measured` row says who flew it, and this is what says whether they were flown here at all.
  const tables = [{ policy: opts.policy, picks: opts.picks, rows, plain }];
  if (needsDeal) {
    tables.push({ policy: opts.policy, picks: DELIBERATE_PICKS, rows: deal.rows, plain: deal.plain });
  }
  // Which of the quoted numbers this flight wrote over. A sweep of a rule's own number is a measurement
  // of the sweep, and saying so out loud is what keeps it from being read back as the shipped one.
  const swept = [];
  if (opts.speed !== null) swept.push('swift');
  if (opts.hold !== null) swept.push('thick');
  if (opts.grace !== null) swept.push('merciless');
  if (opts.cards !== null) swept.push('thin');

  const sweep = (opts.speed === null ? '' : ', the swift crowd at ' + dec(opts.speed, 2) + 'x')
    + (opts.hold === null ? '' : ', the thick crowd at ' + dec(opts.hold, 2) + 'x')
    + (opts.grace === null ? '' : ', a hit leaving ' + dec(opts.grace, 2) + 's')
    + (opts.cards === null ? '' : ', the rack at ' + opts.cards + (opts.cards === 1 ? ' card' : ' cards'));

  const note = 'Each row is the same seeds flown under one rule, `plain` being the game as it shipped.\n'
    + '`middle death` is the middle of the runs that died - a batch that never died has no middle and\n'
    + 'shows a dash. `vs plain` is the middle score against plain\'s, which is the number a rule\'s quote\n'
    + 'in the game holds; `plain won` is the pair it was counted on - of the seeds that could tell the two\n'
    + 'runs apart, how many plain scored higher on. A seed that tied says the rule was never asked about,\n'
    + 'and is in neither half of that fraction. `hulls` is every hull the batch lost, which is what says\n'
    + 'whether this ladder could see a rule about losing one at all; `fights` is every boss it buried and\n'
    + '`won` the runs that came out of the schedule standing. This is the bot\'s cost and not a person\'s.';

  printTable(rows, plain, opts, 'the challenges, on ' + opts.seeds + ' seeds of ' + clock(opts.seconds)
    + ', ' + opts.policy + ' bot'
    + (opts.picks === undefined ? '' : ' answering the level-up ' + opts.picks)
    + (opts.dash ? ', pressing the get-out dash' : ', never pressing the dash') + sweep, note);
  if (opts.dump) dumpTable(rows, plain);

  // The deal rules again, on a hand that picks on purpose. Same seeds, same feet, same everything but
  // how the level-up is answered - because that is the only thing this kind of rule reaches.
  if (deal !== undefined && deal.rows !== rows) {
    console.log('');
    printTable(deal.rows, deal.plain, opts, 'the same seeds and the same feet, answering the level-up '
      + DELIBERATE_PICKS + ' - which is the only table a rule about the deal can be read on', note);
    if (opts.dump) dumpTable(deal.rows, deal.plain);
    // And what that hand's taste is worth, because it is the number the verdict below is allowed to
    // lean on: a deliberate hand that cannot be shown to beat its own careless one has no taste to price.
    if (deal.plain !== undefined && deal.carelessPlain !== undefined
        && deal.carelessPlain.middleScore > 0) {
      const taste = dealTasteOf(deal);
      console.log('That hand\'s card taste is worth '
        + dec(deal.plain.middleScore / deal.carelessPlain.middleScore, 2)
        + 'x the careless hand\'s on the same seeds: its plain run scored '
        + int(deal.plain.middleScore) + ' against ' + int(deal.carelessPlain.middleScore)
        + ', and counted seed against seed that is ' + pairWords(taste) + '.');
      console.log('The verdict believes a rule about the deal only if the seeds say so too: '
        + (isBetter(taste)
          ? 'they do, so this hand has a taste and it can be priced.'
          : 'they do not, so this hand has no taste to price and any deal rule here would be refused.'));
    }
  }

  console.log('');
  console.log('What the card says each rule does, read out of the row the sim itself reads:');
  for (const row of rows) {
    if (row.id === PLAIN) continue;
    console.log('  ' + nameOf(row.id) + ' \u00b7 ' + saysOf(row.id));
  }

  const verdict = verdictOf(rows, plain, deal);
  for (const line of verdict.skipped) {
    console.log('');
    console.log('Not judged: ' + line);
  }

  // The second question: not "is this rule hard enough to be a rule", which the verdict above answers,
  // but "is the number the game carries for it still the number this ladder measures".
  const quotes = quotesReport(tables, { seeds: opts.seeds, seconds: opts.seconds, swept });
  console.log('');
  console.log('What the game quotes each rule for, and what this flight says about it:');
  for (const line of quotes.lines) console.log('  - ' + line);

  const problems = verdict.problems.concat(quotes.problems);
  console.log('');
  if (problems.length > 0) {
    console.log('VERDICT: FAIL');
    for (const line of problems) console.log('  - ' + line);
    console.log('');
    console.log('Either the rule is not what its card says it is, or this bot is not the yardstick');
    console.log('for it and the number has to be read off a person instead. Both answers are worth');
    console.log('having; neither is a pass. A stale quote is the third kind of failure: the rule may be');
    console.log('fine and only its number in the game has gone out of date.');
    if (opts.strict) process.exit(1);
  } else {
    console.log('VERDICT: every rule this ladder could see is paid for in the score column, and every');
    console.log('quote it could check still holds.');
    console.log('The `died` column is what a rule does to a run\'s length and the score column is what');
    console.log('it does to what a run is worth; a rule that moves only one of the two is half a rule.');
  }
}
