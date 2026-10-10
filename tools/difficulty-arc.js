#!/usr/bin/env node
// PLAN 10's difficulty arc, measured instead of hoped for: when a run that did not think about
// its build dies, and what it dies of.
//
//   node tools/difficulty-arc.js                     48 careless runs, a 15 minute window each
//   node tools/difficulty-arc.js --runs 96           more runs, for the 40% question in particular
//   node tools/difficulty-arc.js --seed 200          a different set of seeds
//   node tools/difficulty-arc.js --seconds 600       a shorter window (it cuts the arc short)
//   node tools/difficulty-arc.js --bot aware         the player that never misses a thing
//   node tools/difficulty-arc.js --bot naive         the player that does not dodge at all
//   node tools/difficulty-arc.js --picks wise        the careful build, to compare against
//   node tools/difficulty-arc.js --quiet             the two verdicts and nothing else
//
// PLAN asks two things of it:
//
//   the bot should usually die between 4:00 and 9:00, and
//   no enemy type should be responsible for over 40% of deaths.
//
// Both numbers are PLAN's and neither is touched here. What is mine, and written down because a
// check has to mean one thing and not whatever it felt like on the day:
//
//   **"the bot"**: the human one (tools/headless/human.js) - PLAN's person, dodging at the speed
//   of a person. It used to be the aware bot, which is why `--bot aware` is still measured here and
//   still printed by `tools/skill-ladder.js` as the top rung: a careless build on perfect hands is
//   the run that sentence was *written* against, and it turned out to be unmeasurable, because the
//   aware bot re-decides every simulation step and steps off everything it can see, so half a
//   careless batch of it outlived fifteen minutes (NOTES, session 88). The naive bot is the other
//   end of the ladder and `--bot naive` still runs it. What the three of them say *together*, on the
//   same seeds and the same die, is the finding; `tools/skill-ladder.js` is the tool that reads them
//   as one slope instead of three verdicts.
//   The bot answers a level-up with a die (`tools/headless/bot.js PICKS.random`), which is the plain
//   reading of "no upgrades chosen wisely": a person who did not look, rather than one written
//   to choose badly.
//   **"usually"**: at least half the runs in the batch. A run that never died is not a run that
//   died in the band, so it counts in the denominator and not the numerator - that is the whole
//   point of the sentence, which is about the game not letting a run drift on forever.
//   **"deaths"**: what took the last hull, one per run that ended (game/tally.js `killedBy`), and
//   an enemy *type* owns a death however it was dealt - a spitter's shot, a spitter's body and a
//   spitter's beam are all the spitter. That table needs a sample to mean anything: two batches of
//   24 runs put the same body at 46% of one batch's deaths and 31% of the other's, which is why
//   `minDeaths` is twenty and not ten, and why the batch is 48 runs by default - below that the
//   ceiling is reported as not measured rather than as a share of a handful.
//   The all-hull table under it is the same question on ten times the sample - what the batch spent
//   every one of its hulls on - which is where a body that never lands the finisher still shows up
//   as the one doing the work.
//
// It is a check and not a report: it exits non-zero when either half of PLAN's sentence fails, so
// it can be run before a release and read as red or green. `tools/balance-report.js` is the one
// that prints numbers and judges none of them; this one judges two.
//
// Today the band reads red the other way up - a careless batch of people middles its deaths at
// 2m33s of 48 seeds, with 7 of them in the band and 5 never dying at all - and the ceiling reads
// green with the widest body sitting on the line and not under it (the weaver, at 40%). Both are
// findings rather than bugs, and the PLAN item of the same name has the numbers, along with the
// nine knobs that were measured and moved the tails instead. `tools/run-shape.js` plays this same
// batch over eight processes in about a quarter of the time and prints what the runs were *doing*
// at each minute, which is where the finding came from: a careless batch is not a ramp that starts
// too soon, it is a cliff, and the six runs over it are level 37 and unkillable by the fifth minute.

import { pathToFileURL } from 'node:url';
import { playRuns, POLICIES, PICKS } from './headless/bot.js';
import { clock, share, table } from './headless/tables.js';
import { hostName } from '../src/game/codex.js';

/** PLAN 10's two numbers, and the two judgement calls that come with them. */
export const ARC = {
  from: 240,        // "between 4:00"
  to: 540,          // "and 9:00"
  usual: 0.5,       // "usually": at least this much of the batch dies in the band
  ceiling: 0.4,     // no enemy type over this share of the deaths
  bucket: 60,       // the width of a row of the histogram, in seconds
  // A share of thirteen was seen to be 46% of one 24-run batch's deaths and 31% of another's, so a
  // ceiling read on that few deaths is a coin with a percentage stuck on it. Twenty is where the
  // two batches together (48 runs) sit comfortably above it and the error bars get small.
  minDeaths: 20,
};

const DEFAULTS = { seed: 1, runs: 48, seconds: 900, policy: 'human', picks: 'random', quiet: false };

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
    else if (arg === '--bot') opts.policy = next();
    else if (arg === '--picks') opts.picks = next();
    else if (arg === '--quiet') opts.quiet = true;
    else {
      console.error('usage: difficulty-arc.js [--seed N] [--runs N] [--seconds N] [--bot NAME] [--picks NAME] [--quiet]');
      process.exit(2);
    }
  }
  if (!Number.isFinite(opts.seed) || !Number.isFinite(opts.runs) || !Number.isFinite(opts.seconds)) {
    console.error('--seed, --runs and --seconds want a number');
    process.exit(2);
  }
  if (opts.runs < 2) {
    // One run is a story about one seed and not an arc. The tool would rather be asked.
    console.error('--runs wants at least two runs: one seed is an anecdote');
    process.exit(2);
  }
  if (!POLICIES[opts.policy]) {
    console.error('--bot wants one of: ' + Object.keys(POLICIES).join(', '));
    process.exit(2);
  }
  if (!PICKS[opts.picks]) {
    console.error('--picks wants one of: ' + Object.keys(PICKS).join(', '));
    process.exit(2);
  }
  return opts;
}

/**
 * When one run stopped, in the four ways it can stop.
 *
 * `at` is the run's clock when it stopped and `null` when it did not: a run still flying when the
 * window shut has no death time, and writing the cap there would read a window onto an ending.
 */
export function endingOf(summary) {
  if (summary.won) return { kind: 'won', at: null };
  if (!summary.died) return { kind: 'alive', at: null };
  const at = summary.seconds;
  if (at < ARC.from) return { kind: 'early', at: at };
  if (at > ARC.to) return { kind: 'late', at: at };
  return { kind: 'band', at: at };
}

/**
 * The batch, sorted out by when it ended.
 *
 * The median is the median of the *deaths*, because that is the sentence PLAN wrote: how long a
 * careless run lasts. A batch where half the runs never died has no meaning left in a median of
 * everything (it is 15m00s by construction), which is why the two are counted separately here.
 */
export function arcOf(summaries, cap) {
  const endings = summaries.map(endingOf);
  const deaths = endings.filter((end) => end.at !== null);
  const sorted = deaths.map((end) => end.at).sort((a, b) => a - b);
  const rows = [];
  for (let from = 0; from < cap; from += ARC.bucket) {
    const to = from + ARC.bucket;
    rows.push({
      from: from,
      to: to,
      inBand: to > ARC.from && from < ARC.to,
      count: deaths.filter((end) => end.at >= from && end.at < to).length,
    });
  }
  return {
    runs: summaries.length,
    cap: cap,
    band: { from: ARC.from, to: ARC.to },
    inBand: endings.filter((end) => end.kind === 'band').length,
    early: endings.filter((end) => end.kind === 'early').length,
    late: endings.filter((end) => end.kind === 'late').length,
    alive: endings.filter((end) => end.kind === 'alive').length,
    won: endings.filter((end) => end.kind === 'won').length,
    deaths: deaths.length,
    medianDeath: sorted.length === 0 ? NaN
      : sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
    rows: rows,
  };
}

/** The histogram: one row per minute of the window, the band's minutes marked. */
export function arcTable(arc) {
  const rows = arc.rows.map((row) => [
    clock(row.from) + '-' + clock(row.to),
    row.inBand ? 'in' : '',
    String(row.count),
    '#'.repeat(row.count),
  ]);
  // The runs that never died are part of the arc and have to be seen next to the ones that did:
  // a table that only counted deaths could show a perfect-looking band out of four runs.
  if (arc.alive > 0) rows.push(['still flying at ' + clock(arc.cap), '', String(arc.alive), '#'.repeat(arc.alive)]);
  if (arc.won > 0) rows.push(['won the schedule', '', String(arc.won), '#'.repeat(arc.won)]);
  return table(
    'when the batch ended',
    arc.deaths + ' of ' + arc.runs + ' runs died; the middle one of them at ' + clock(arc.medianDeath)
    + '. The band PLAN asks for is ' + clock(arc.band.from) + '-' + clock(arc.band.to) + '.',
    'lllr', ['window', 'band', 'runs', ''], rows);
}

/**
 * Split a tally label into the body to blame and the way it did it.
 * `body:tank` and `shot:tank` are both the tank's doing (game/tally.js); `blast` has nobody.
 */
function splitLabel(label) {
  const at = label.indexOf(':');
  return at < 0 ? { who: '', how: label } : { who: label.slice(at + 1), how: label.slice(0, at) };
}

/** What a type is called in a table: the codex's own name, or the way, when nobody owns it. */
function whoName(who, how) {
  return who === '' ? (how === '' ? 'NO CAUSE' : how.toUpperCase()) : hostName(who);
}

/**
 * Tally labels counted up by the body they blame.
 *
 * `ways` keeps the hows inside a row so the table can say *how* a type is landing its share -
 * a type that takes a third of the batch's deaths with shots is a different problem from one
 * that does it by walking into the ship, and the fix is in a different file.
 */
export function creditTable(labels) {
  const groups = new Map();
  let total = 0;
  for (const label of labels) {
    const { who, how } = splitLabel(label);
    const key = who === '' ? how : who;
    let row = groups.get(key);
    if (row === undefined) {
      row = { key: key, name: whoName(who, how), count: 0, ways: {} };
      groups.set(key, row);
    }
    row.count++;
    total++;
    row.ways[how] = (row.ways[how] || 0) + 1;
  }
  const rows = [...groups.values()]
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .map((row) => Object.assign({}, row, { share: total === 0 ? 0 : row.count / total, total: total }));
  return { total: total, rows: rows };
}

/** One row of a credit table: how that body did it, spelled out when it did it several ways. */
function waysWords(ways) {
  const keys = Object.keys(ways).sort((a, b) => ways[b] - ways[a]);
  // One way and the count is already in the column beside it, so the word stands alone.
  if (keys.length === 1) return keys[0];
  return keys.map((how) => how + ' ' + ways[how]).join(', ');
}

/** The deaths: one row per body that took a last hull. */
export function deathsTable(summaries) {
  const credit = creditTable(summaries.filter((s) => s.died && !s.won).map((s) => s.stats.killedBy || ''));
  const rows = credit.rows.map((row) => [
    row.name, String(row.count), share(row.count, credit.total), waysWords(row.ways),
  ]);
  return table(
    'what took the last hull',
    credit.total === 0 ? 'nobody died: there are no deaths to apportion'
      : 'PLAN: no enemy type over ' + Math.round(ARC.ceiling * 100) + '% of these.',
    'lrrl', ['who', 'deaths', 'share', 'how'], rows);
}

/** Every hull the batch lost, which is the same question on far more sample than the deaths. */
export function hullsTable(summaries) {
  const labels = [];
  for (const summary of summaries) {
    const hurt = summary.tally.hurtBy;
    for (const label of Object.keys(hurt)) {
      for (let i = 0; i < hurt[label]; i++) labels.push(label);
    }
  }
  const credit = creditTable(labels);
  const rows = credit.rows.map((row) => [
    row.name, String(row.count), share(row.count, credit.total), waysWords(row.ways),
  ]);
  return table(
    'what every hull of the batch went to',
    credit.total + ' hulls lost in all. Not PLAN\'s check - a finisher and a chipper are different'
    + ' things - but the same question with enough sample to answer it.',
    'lrrl', ['who', 'hulls', 'share', 'how'], rows);
}

/**
 * The two verdicts, in the order PLAN wrote them.
 *
 * Returns `pass` as well as the lines, because the exit code is the point of the tool: a release
 * can be gated on it and a human can read the same two sentences either way.
 *
 * The band is scored against the whole batch, which is the strict reading of "the bot should
 * usually die between 4:00 and 9:00": a run that never died is not one that died in the band. The
 * other reading - of the runs that *did* die, when did they - is printed under it, because it is
 * the same two numbers divided differently and it is the one that says whether the arc is in the
 * right place or merely off it: a batch that dies at 4m00s and a batch that never dies both fail
 * the strict check, and only one of them is a game that needs a change.
 */
export function verdictOf(arc, summaries) {
  const credit = creditTable(summaries.filter((s) => s.died && !s.won).map((s) => s.stats.killedBy || ''));
  const lines = [];
  const bandShare = arc.runs === 0 ? 0 : arc.inBand / arc.runs;
  const bandPass = bandShare >= ARC.usual;
  lines.push('the band: ' + arc.inBand + ' of ' + arc.runs + ' runs (' + share(arc.inBand, arc.runs)
    + ') died between ' + clock(arc.band.from) + ' and ' + clock(arc.band.to) + ', against the '
    + Math.round(ARC.usual * 100) + '% "usually" needs - ' + (bandPass ? 'PASS' : 'FAIL'));
  // No deaths and no middle of them to report: `clock(NaN)` reads 0m00s, and a line about there
  // being nothing to measure must not print a time that was never measured (NOTES, session 88).
  const middle = arc.deaths === 0 ? '' : ', the middle one at ' + clock(arc.medianDeath);
  lines.push('  of the ' + arc.deaths + ' that died at all, ' + arc.inBand + ' ('
    + (arc.deaths === 0 ? '-' : share(arc.inBand, arc.deaths)) + ') died in it' + middle + '; '
    + arc.early + ' came sooner, ' + arc.late + ' later, '
    + arc.alive + ' never died and ' + arc.won + ' won the schedule');
  if (!bandPass) {
    lines.push('  ' + (arc.early > arc.late + arc.alive
      ? 'the batch dies too soon: ' + arc.early + ' of them before ' + clock(arc.band.from)
      : arc.alive > 0
        ? 'the batch outlasts the window: ' + arc.alive + ' never died at all'
        : 'the batch dies too late: ' + arc.late + ' of them after ' + clock(arc.band.to)));
  }

  const top = credit.rows[0];
  let ceilingPass;
  if (credit.total < ARC.minDeaths) {
    ceilingPass = false;
    // How big the batch would have to be for the question to be answerable at all, from the rate of
    // deaths this one actually managed - which is itself a fact about the game, not a guess.
    const need = arc.deaths === 0 ? null : Math.ceil(arc.runs * ARC.minDeaths / arc.deaths);
    lines.push('the ceiling: only ' + credit.total + ' deaths in ' + arc.runs + ' runs, and a share of '
      + credit.total + ' is not a share - ' + ARC.minDeaths + ' are needed'
      + (need === null ? ', and this batch has none to share out' : ', so try --runs ' + need)
      + ' - FAIL');
  } else {
    ceilingPass = top.share <= ARC.ceiling;
    lines.push('the ceiling: the widest is ' + top.name + ' at ' + share(top.count, credit.total)
      + ' of ' + credit.total + ' deaths, against the ' + Math.round(ARC.ceiling * 100)
      + '% ceiling - ' + (ceilingPass ? 'PASS' : 'FAIL'));
  }
  return { pass: bandPass && ceilingPass, lines: lines };
}

/** Only run when called as a command, so the tests can import the parts above. */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const opts = readArgs(process.argv.slice(2));
  const summaries = await playRuns({
    seeds: Array.from({ length: opts.runs }, (unused, i) => opts.seed + i),
    maxSeconds: opts.seconds,
    policy: opts.policy,
    picks: opts.picks,
    // Nothing per run: this report is a batch's, and the histogram is where a single seed shows up.
  });

  for (const summary of summaries) {
    if (summary.stats.score <= 0) {
      throw new Error('the bot never scored: the game is not playable headless');
    }
  }

  const arc = arcOf(summaries, opts.seconds);
  const verdict = verdictOf(arc, summaries);

  if (!opts.quiet) {
    console.log('the difficulty arc: ' + opts.runs + ' runs, seeds ' + opts.seed + '-'
      + (opts.seed + opts.runs - 1) + ', the ' + opts.policy + ' bot'
      + (opts.picks === 'random' ? ' answering the level-up with a die' : ' picking ' + opts.picks)
      + ', a ' + clock(opts.seconds) + ' window');
    console.log('');
    console.log(arcTable(arc));
    console.log('');
    console.log(deathsTable(summaries));
    console.log('');
    console.log(hullsTable(summaries));
    console.log('');
  }
  console.log(verdict.lines.join('\n'));
  if (!verdict.pass) process.exitCode = 1;
}
