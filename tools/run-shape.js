#!/usr/bin/env node
// What a batch of runs looks like from the inside, minute by minute.
//
// `tools/difficulty-arc.js` answers *when* a batch of careless runs dies and *who* does it. This
// answers what those runs were doing at the time: how many bodies were on the screen, how many
// lines the ship had bought, how much hull and score it had, at each slice of the clock. That is
// the only way to tell a batch that died because it was overrun from one that died because it never
// got strong enough, and the two want opposite fixes.
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
// usage
//   node tools/run-shape.js                        48 seeds, the person-shaped bot, cards by die
//   node tools/run-shape.js --seeds 1-200 --shards 8
//   node tools/run-shape.js --bot aware --picks wise --runs 12
//   node tools/run-shape.js --out /tmp/a.jsonl     one JSON row per run, kept for re-reading
//   node tools/run-shape.js --in /tmp/a.jsonl --in /tmp/b.jsonl    pool rows already played
//   node tools/run-shape.js --every 30 --seconds 300 --quiet       coarser, shorter, verdict only
//
// The flags are `--seed N` `--runs M` `--seeds 1-24` or `--seeds 1,3,5` `--bot naive|aware|human`
// `--picks wise|random` `--ship stock|bulwark|skiff` `--seconds N` `--every N` `--shards K`
// `--out FILE` `--in FILE` `--quiet`. The exit code is the difficulty arc's verdict, same as
// `tools/difficulty-arc.js`, so either one can gate a release.
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { playRuns } from './headless/bot.js';
import { median } from './simulate.js';
import { arcOf, arcTable, verdictOf, deathsTable, hullsTable } from './difficulty-arc.js';
import { clock, table } from './headless/tables.js';

// The default batch and the default slice, deliberately the arc tool's own defaults, so the two
// tools describe the same forty-eight people and the same window unless told otherwise.
const DEFAULTS = {
  seed: 1, runs: 48, seconds: 900, every: 60, shards: 1, policy: 'human', picks: 'random',
};

/** `--seeds 1-24` and `--seeds 1,3,5` both mean a list of seeds. */
export function parseSeeds(spec) {
  const text = String(spec).trim();
  const span = /^(\d+)-(\d+)$/.exec(text);
  if (span !== null) {
    const from = Number(span[1]);
    const to = Number(span[2]);
    if (to < from) throw new Error('--seeds: ' + text + ' counts backwards');
    return Array.from({ length: to - from + 1 }, (unused, i) => from + i);
  }
  if (!/^\d+(,\d+)*$/.test(text)) throw new Error('--seeds wants 1-24 or 1,3,5, got ' + text);
  return text.split(',').map(Number);
}

/** The seeds split K ways, as evenly as they divide, round-robin so no shard owns a run of neighbours. */
export function splitShards(seeds, shards) {
  const parts = Math.max(1, Math.min(shards, seeds.length));
  const out = Array.from({ length: parts }, () => []);
  seeds.forEach((seed, i) => out[i % parts].push(seed));
  return out;
}

/**
 * One run, as the harness hands it back, kept down to the columns this tool reads.
 *
 * `samples` is `[second, bodies on screen, level, hull left, score]` per slice. Arrays and not
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
 */
export function shapeRows(rows, every) {
  const atEach = rows.map((row) => new Map(row.samples.map((sample) => [sample[0], sample])));
  const last = rows.reduce((top, row) => Math.max(top, row.samples.length === 0 ? 0
    : row.samples[row.samples.length - 1][0]), 0);
  const out = [];
  for (let at = 0; at <= last; at += every) {
    const here = atEach.map((at2) => at2.get(at)).filter((sample) => sample !== undefined);
    if (here.length === 0) continue;
    out.push([
      clock(at),
      String(here.length),
      String(median(here.map((sample) => sample[1]))),
      String(median(here.map((sample) => sample[2]))),
      String(median(here.map((sample) => sample[3]))),
      String(Math.round(median(here.map((sample) => sample[4])))),
    ]);
  }
  return out;
}

export function shapeTable(rows, every) {
  return table(
    'the shape of the batch',
    rows.length + ' runs, one row per ' + every + 's, each one the median of whichever runs were'
    + ' still flying at that moment: bodies on the screen, lines bought, hull left, score earned.',
    'llrrrr', ['at', 'flying', 'bodies', 'level', 'hull', 'score'], shapeRows(rows, every));
}

/** The rows of one or more files written by `--out`, in the order the files were given. */
export function readRows(files) {
  const rows = [];
  for (const file of files) {
    if (!existsSync(file)) throw new Error('--in: no such file: ' + file);
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line.trim() !== '') rows.push(JSON.parse(line));
    }
  }
  if (rows.length === 0) throw new Error('--in: ' + files.join(' ') + ' held no runs');
  return rows;
}

export function writeRows(file, rows) {
  writeFileSync(file, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
}

/** Read the command line into plain values, and throw on anything it does not understand. */
export function readArgs(argv) {
  const opts = Object.assign({}, DEFAULTS, {
    seeds: null, infiles: [], outfile: '', ship: undefined, quiet: false, playOnly: false,
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
    else if (flag === '--bot') opts.policy = value();
    else if (flag === '--picks') opts.picks = value();
    else if (flag === '--ship') opts.ship = value();
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
    // Called on every frame, including the one the run ends on. Only the *first* frame of each
    // slice is kept, which is what makes a 15-minute run cost fifteen numbers and not fifty-four
    // thousand - and it is why a row of the table can say "as it stood at 3m00s" and mean it.
    onFrame: (game) => {
      const s = game.stats();
      if (s.hull <= 0) return;
      const at = Math.floor(s.t / opts.every) * opts.every;
      if (samples.length === 0 || samples[samples.length - 1][0] !== at) {
        samples.push([at, s.enemies, s.level, s.hull, s.score]);
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
async function playSharded(seeds, opts) {
  const chunks = splitShards(seeds, opts.shards);
  const files = chunks.map((unused, k) => tmpdir() + '/starfall-run-shape-' + process.pid + '-' + k + '.jsonl');
  const pass = ['--seconds', String(opts.seconds), '--every', String(opts.every),
    '--bot', opts.policy, '--picks', opts.picks];
  if (opts.ship !== undefined) pass.push('--ship', opts.ship);
  const { spawn } = await import('node:child_process');
  const kids = chunks.map((chunk, k) => new Promise((resolve, reject) => {
    const kid = spawn(process.execPath, [fileURLToPath(import.meta.url),
      '--seeds', chunk.join(','), '--play-only', '--out', files[k]].concat(pass),
    { stdio: ['ignore', 'ignore', 'inherit'] });
    kid.on('error', reject);
    kid.on('exit', (code) => resolve(code === 0 ? null
      : new Error('shard ' + k + ' (seeds ' + chunk.join(',') + ') exited ' + code)));
  }));
  const failed = (await Promise.all(kids)).find((err) => err !== null);
  if (failed !== undefined) throw failed;
  try {
    return readRows(files);
  } finally {
    // Ours, made seconds ago, and the pooled rows are already in memory: a shard's file left behind
    // is only noise in whoever's tmpdir.
    files.forEach((file) => {
      try { unlinkSync(file); } catch (err) { /* already gone is not a failure */ }
    });
  }
}

/** Only run when called as a command, so the tests can import the parts above. */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const opts = readArgs(process.argv.slice(2));
  const seeds = opts.seeds !== null ? parseSeeds(opts.seeds)
    : Array.from({ length: opts.runs }, (unused, i) => opts.seed + i);

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
        + ', a ' + clock(opts.seconds) + ' window');
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
