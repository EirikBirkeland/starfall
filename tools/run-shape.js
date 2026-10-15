#!/usr/bin/env node
// What a batch of runs looks like from the inside, minute by minute.
//
// `tools/difficulty-arc.js` answers *when* a batch of careless runs dies and *who* does it. This
// answers what those runs were doing at the time: how many bodies were on the screen, how many
// lines the ship had bought, how much hull and score it had, and how many hulls the middle run was
// losing, at each slice of the clock. That is the only way to tell a batch that died because it was
// overrun from one that died because it never got strong enough, and the two want opposite fixes -
// and the hit rate is what tells the third case apart from both of those: a batch that stops being
// hit at all once a handful of ships have out-scaled the crowd, which is the mechanism of the cliff
// `tools/difficulty-arc.js` reports as a FAIL.
//
// It exists because of session 90, which was asked to make a careless build last four minutes
// instead of two and a half. Every way of thinning the opening that was tried made the runs
// *shorter*, and the shape table is what showed why: with the cheapest fast body taken out of the
// first four minutes the crowd on the screen did not get thinner by anything like as much as the
// run's income did. The cheap bodies are what a run is paid in, and what a run is paid in is what a
// run survives on. A histogram of death times could not have said that, and this said it in one look.
//
// It also plays in parallel, which nothing else here does. One game per process is how the headless
// harness works (`tools/headless/bot.js`, `playBatches`), so a 48-run batch at the 15-minute cap is
// about 25 minutes of wall clock: `--shards 8` splits the seeds over eight processes and pools what
// they wrote, which is the same batch in about four of this box's idle cores. That is the difference
// between an arc measurement a session repeats after every change and one it skips.
//
// What the hit-rate column found the day it was added (48 seeds, the person bot, cards by die, the
// 15-minute cap, `--shards 8`, session 136). The batch goes 48 flying at 0m, 34 at 2m, 10 at 4m, 6 at
// 5m, 4 from 6m on - and the middle run's hulls lost a minute run 0, 1, 1, 2, 2.5, 0.5, 1.5, then 0,
// 0.5, and then **nothing at all from 10m to the cap**, at level 46 through 63 with 12 to 29 bodies on
// the screen. So the cliff session 105 described has a mechanism, and it is not that the crowd stops
// existing: a ship that reaches the fifth minute out-kills the spawn rate (bodies fall from 55 at 4m
// to 12 at 14m while the wall is 100), and a crowd that cannot reach the ship cannot hurt it.
// `waves.maxBodies` is a ceiling and not a floor, and nothing in the game puts a floor under what the
// crowd is *landing*.
//
// usage
//   node tools/run-shape.js                        48 seeds, the person-shaped bot, cards by die
//   node tools/run-shape.js --seeds 1-200 --shards 8
//   node tools/run-shape.js --bot aware --picks wise --runs 12
//   node tools/run-shape.js --ship bulwark --weapon lance   fly something other than the default
//   node tools/run-shape.js --out /tmp/a.jsonl     one JSON row per run, kept for re-reading
//   node tools/run-shape.js --in /tmp/a.jsonl --in /tmp/b.jsonl    pool rows already played
//   node tools/run-shape.js --set waves.gap.1=0.8  move one number of BALANCE for the batch, and say
//                                                  so in the header (repeatable; see difficulty-arc.js)
//   node tools/run-shape.js --every 30 --seconds 300 --quiet       coarser, shorter, verdict only
//
// The flags are `--seed N` `--runs M` `--seeds 1-24` or `--seeds 1,3,5` `--bot naive|aware|human`
// `--picks wise|random` `--ship stock|bulwark|skiff` `--weapon pulse|scatter|arc|lance|swarm`
// `--seconds N` `--every N` `--set path=number` `--shards K` `--out FILE` `--in FILE` `--quiet`.
// The exit code is the
// difficulty arc's verdict, same as `tools/difficulty-arc.js`, so either one can gate a release.
// The ship and the weapon go through the same doors the title screen uses (game/ships.js,
// game/weapons.js), so a shape table measured on the Bulwark flying the lance is the run a player
// who bought that ship actually has - which is how a hangar item gets arc-tested rather than
// assumed.
import { pathToFileURL } from 'node:url';
import { playRuns } from './headless/bot.js';
import { median } from './simulate.js';
import { arcOf, arcTable, verdictOf, deathsTable, hullsTable } from './difficulty-arc.js';
import { parseNumberPatch, applyPatches, patchWords } from './headless/patch.js';
import {
  parseSeeds, readRows, writeRows, playSharded as playOverShards,
} from './headless/shards.js';
import { BALANCE } from '../src/game/balance.js';
import { clock, table } from './headless/tables.js';

// The default batch and the default slice, deliberately the arc tool's own defaults, so the two
// tools describe the same forty-eight people and the same window unless told otherwise.
const DEFAULTS = {
  seed: 1, runs: 48, seconds: 900, every: 60, shards: 1, policy: 'human', picks: 'random',
};

/**
 * One run, as the harness hands it back, kept down to the columns this tool reads.
 *
 * `samples` is `[second, bodies on screen, level, hull left, score, hulls lost so far]` per slice. Arrays and not
 * objects because there are ~15 of these per run at the default slice and every byte of a 48-run
 * file is paid 48 times over.
 */
export function rowOf(summary, samples) {
  return {
    seed: summary.seed,
    seconds: summary.seconds,
    died: summary.died,
    won: summary.won,
    killedBy: summary.stats.killedBy || '',
    hurtBy: Object.assign({}, summary.tally.hurtBy),
    level: summary.stats.level,
    score: summary.stats.score,
    kills: summary.stats.kills,
    shards: summary.stats.collected,
    samples: samples,
  };
}

/** A row, back in the shape `tools/difficulty-arc.js`'s tables read. */
export function summaryOf(row) {
  return {
    seed: row.seed,
    seconds: row.seconds,
    died: row.died,
    won: row.won,
    stats: { killedBy: row.killedBy, level: row.level, score: row.score, kills: row.kills },
    tally: { hurtBy: row.hurtBy },
  };
}

/**
 * The shape table: one row per slice of the clock, the middles of the runs still flying in it.
 *
 * A row is labelled with the moment it was sampled: a run is sampled on the *first* frame of each
 * slice it is alive for, so the row at 3m00s is where the batch stood as the third minute began, and
 * a run that died at 3m12s is in that row and in no later one.
 *
 * `flying` owns how to read every column beside it. By the fifth minute of a careless batch there
 * may be two runs left out of forty-eight, and their median level is a fact about survivors and not
 * about the batch - which is the difference between reading this as the game's plan for a player and
 * reading it as a handful of survivors' luck.
 *
 * `hulls lost` is the one column that is a rate and not a state, and it is read off each run rather
 * than off the slice: it is the middle **run's own** hull losses between this slice and the previous
 * one a run was flying in. Taking the difference of two slices' medians would subtract one batch of
 * ships from another - the twelfth minute's median is over six survivors and the fifth's over twelve
 * - and the answer would be a fact about arithmetic. This is the column that answers whether the late
 * crowd can still touch a ship that has gotten strong, which is the mechanism of the cliff
 * `tools/difficulty-arc.js` reports as a FAIL: bodies at the wall and nobody losing anything.
 */
export function shapeRows(rows, every) {
  const atEach = rows.map((row) => new Map(row.samples.map((sample) => [sample[0], sample])));
  const last = rows.reduce((top, row) => Math.max(top, row.samples.length === 0 ? 0
    : row.samples[row.samples.length - 1][0]), 0);
  const out = [];
  // The previous slice anyone was flying in, not simply `at - every`: a minute nobody reached is not
  // a row, and a run that was flying in both of the rows that bracket it still lost hull between them.
  let before = null;
  for (let at = 0; at <= last; at += every) {
    const here = atEach.map((seen) => ({ now: seen.get(at), was: before === null
      ? undefined : seen.get(before) })).filter((pair) => pair.now !== undefined);
    if (here.length === 0) continue;
    const samples = here.map((pair) => pair.now);
    out.push([
      clock(at),
      String(here.length),
      String(median(samples.map((sample) => sample[1]))),
      String(median(samples.map((sample) => sample[2]))),
      String(median(samples.map((sample) => sample[3]))),
      String(Math.round(median(samples.map((sample) => sample[4])))),
      hullsBetween(here),
    ]);
    before = at;
  }
  return out;
}

/**
 * The middle run's hull losses since the previous row, or `-` when it cannot be answered.
 *
 * It cannot be answered in the first row of the table (there is no before to read against) and in a
 * batch whose rows were played before the tally was being sampled (`--in` over a file written by an
 * older tool), and both print the same dash rather than a zero: a zero here is the claim that nobody
 * was hit, which is the most load-bearing number on the page and should never be an artefact.
 */
function hullsBetween(pairs) {
  const lost = [];
  for (const pair of pairs) {
    if (pair.was === undefined) continue;
    if (pair.now[5] === undefined || pair.was[5] === undefined) return '-';
    lost.push(pair.now[5] - pair.was[5]);
  }
  if (lost.length === 0) return '-';
  return String(median(lost));
}

export function shapeTable(rows, every) {
  return table(
    'the shape of the batch',
    rows.length + ' runs, one row per ' + every + 's, each one the median of whichever runs were'
    + ' still flying at that moment: bodies on the screen, lines bought, hull left, score earned.'
    + ' `hulls lost` is a rate and not a state - the middle run\'s own hull losses since the previous'
    + ' row - and it is the column that says whether the crowd is still landing anything.',
    'llrrrrr', ['at', 'flying', 'bodies', 'level', 'hull', 'score', 'hulls lost'],
    shapeRows(rows, every));
}

/** Read the command line into plain values, and throw on anything it does not understand. */
export function readArgs(argv) {
  const opts = Object.assign({}, DEFAULTS, {
    seeds: null, infiles: [], sets: [], outfile: '', ship: undefined, weapon: undefined,
    quiet: false, playOnly: false,
  });
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      i++;
      if (i >= argv.length) throw new Error(flag + ' needs a value');
      return argv[i];
    };
    if (flag === '--seed') opts.seed = Number(value());
    else if (flag === '--runs') opts.runs = Number(value());
    else if (flag === '--seeds') opts.seeds = value();
    else if (flag === '--set') opts.sets.push(value());
    else if (flag === '--bot') opts.policy = value();
    else if (flag === '--picks') opts.picks = value();
    else if (flag === '--ship') opts.ship = value();
    else if (flag === '--weapon') opts.weapon = value();
    else if (flag === '--seconds') opts.seconds = Number(value());
    else if (flag === '--every') opts.every = Number(value());
    else if (flag === '--shards') opts.shards = Number(value());
    else if (flag === '--out') opts.outfile = value();
    else if (flag === '--in') opts.infiles.push(value());
    else if (flag === '--quiet') opts.quiet = true;
    else if (flag === '--play-only') opts.playOnly = true;
    else throw new Error('unknown flag: ' + flag);
  }
  if (opts.every <= 0 || opts.seconds <= 0) throw new Error('--seconds and --every have to be above 0');
  // Checked against the live table before a single run is played, by the same reader
  // tools/difficulty-arc.js and tools/gun-tune.js use (tools/headless/patch.js). A path that is not
  // there is silently a new field, and the shape table would then describe the shipped game while
  // claiming to describe a patched one.
  for (const assignment of opts.sets) parseNumberPatch(assignment, BALANCE, 'BALANCE');
  if (opts.infiles.length > 0 && opts.shards > 1) {
    throw new Error('--in pools rows that were already played; it has nothing left to shard');
  }
  if (opts.playOnly && opts.outfile === '') throw new Error('--play-only needs --out to write to');
  return opts;
}

/** Play one batch in this process. The samples ride along in a running list the harness refills. */
async function play(seeds, opts) {
  let samples = [];
  const rows = [];
  await playRuns({
    seeds: seeds,
    maxSeconds: opts.seconds,
    policy: opts.policy,
    picks: opts.picks,
    ship: opts.ship,
    weapon: opts.weapon,
    // Called on every frame, including the one the run ends on. Only the *first* frame of each
    // slice is kept, which is what makes a 15-minute run cost fifteen numbers and not fifty-four
    // thousand - and it is why a row of the table can say "as it stood at 3m00s" and mean it.
    onFrame: (game) => {
      const s = game.stats();
      if (s.hull <= 0) return;
      const at = Math.floor(s.t / opts.every) * opts.every;
      if (samples.length === 0 || samples[samples.length - 1][0] !== at) {
        samples.push([at, s.enemies, s.level, s.hull, s.score, s.hullLost]);
      }
    },
    // The run is over: its samples belong to it and to nobody after it.
    onRun: (summary) => {
      rows.push(rowOf(summary, samples));
      samples = [];
    },
  });
  return rows;
}

/** The same seeds again, played by K child processes and pooled. */
/**
 * The same seeds again, played by K child processes and pooled.
 *
 * The plumbing is the shared one (tools/headless/shards.js); what is this tool's own is the flag list
 * a shard has to be given to be measuring the same batch.
 */
async function playSharded(seeds, opts) {
  const pass = ['--seconds', String(opts.seconds), '--every', String(opts.every),
    '--bot', opts.policy, '--picks', opts.picks];
  for (const assignment of opts.sets) pass.push('--set', assignment);
  if (opts.ship !== undefined) pass.push('--ship', opts.ship);
  if (opts.weapon !== undefined) pass.push('--weapon', opts.weapon);
  return playOverShards({
    name: 'run-shape', tool: import.meta.url, seeds: seeds, shards: opts.shards, pass: pass,
  });
}

/** Only run when called as a command, so the tests can import the parts above. */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  // A flag that does not parse is a usage error and gets a line rather than a stack - the same exit 2
  // that tools/line-ab.js, tools/difficulty-arc.js and tools/gun-tune.js answer a bad flag with.
  // Everything past the flags is left to fail loudly: a tool that cannot read its own rows is not a
  // usage mistake.
  let opts;
  try {
    opts = readArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const seeds = opts.seeds !== null ? parseSeeds(opts.seeds)
    : Array.from({ length: opts.runs }, (unused, i) => opts.seed + i);
  // A patch goes on the live table for the length of the batch, and a shard gets the same `--set`
  // flags so its children patch their own copies the same way. Over `--in` the flag is a label on
  // rows that were already played, like `--bot` and `--seconds` are, and nothing here checks it.
  const patches = opts.sets.map((assignment) => parseNumberPatch(assignment, BALANCE, 'BALANCE'));
  if (opts.infiles.length === 0) applyPatches(patches, BALANCE);

  if (opts.playOnly) {
    // A shard at work: play, write, say nothing. Deliberately no verdict and no non-zero exit here -
    // a shard whose arc failed is not a shard that crashed, and the parent's pooled verdict is the
    // only one anyone should be reading.
    const rows = await play(seeds, opts);
    writeRows(opts.outfile, rows);
    console.log(rows.length + ' runs written to ' + opts.outfile);
  } else {
    const rows = opts.infiles.length > 0 ? readRows(opts.infiles)
      : opts.shards > 1 ? await playSharded(seeds, opts)
        : await play(seeds, opts);
    if (opts.outfile !== '') writeRows(opts.outfile, rows);

    const summaries = rows.map(summaryOf);
    if (summaries.some((s) => s.stats.score <= 0)) {
      throw new Error('the bot never scored: the game is not playable headless');
    }
    const arc = arcOf(summaries, opts.seconds);
    const verdict = verdictOf(arc, summaries);
    if (!opts.quiet) {
      console.log('the shape of the batch: ' + rows.length + ' runs, the ' + opts.policy + ' bot'
        + (opts.picks === 'random' ? ' answering the level-up with a die' : ' picking ' + opts.picks)
        + ', a ' + clock(opts.seconds) + ' window' + patchWords(patches));
      console.log('');
      console.log(shapeTable(rows, opts.every));
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
}
