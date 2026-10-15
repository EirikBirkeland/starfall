// The shape tool (tools/run-shape.js): a batch's runs, minute by minute, from the inside.
//
// Three things are worth holding to here. The seed speller and the argument reader, because a tool
// whose `--seeds 1-200` quietly meant something else would report a batch nobody played. The medians,
// because the whole point of the table is that they are the middles of whichever runs were *still
// flying* in each slice - a table that quietly counted dead runs as zero bodies would say the crowd
// thins out as a batch dies, which is the opposite of what the game does. And the round trip
// through `--out` and `--in`, because the pooling is what lets eight processes answer one question,
// and a row that loses a field on the way to disk loses that field from the verdict.
//
// The one claim that needs real play is that sharding works: that the parent actually waits for its
// children and pools their rows instead of reporting a batch it never played.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  parseSeeds, splitShards, readArgs, rowOf, summaryOf, shapeRows, shapeTable, readRows, writeRows,
} from '../tools/run-shape.js';
import { creditTable } from '../tools/difficulty-arc.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SHAPE = path.join(ROOT, 'tools', 'run-shape.js');

function shape(args) {
  return spawnSync(process.execPath, [SHAPE, ...args], { cwd: ROOT, encoding: 'utf8' });
}

/** A run as `playOneRun` hands it back, with only the parts `rowOf` reads. */
function run(options) {
  return Object.assign({
    seed: 7, seconds: 12.5, died: true, won: false,
    stats: { killedBy: 'body:tank', level: 4, score: 900, kills: 30, collected: 12 },
    tally: { hurtBy: { 'body:tank': 2 } },
  }, options);
}

/** A row of samples for `shapeRows`, made from the middles this tool is meant to find. */
function flown(samples) {
  return { samples: samples };
}

test('a batch can be asked for as a span, as a list, or as one seed', () => {
  assert.deepEqual(parseSeeds('1-4'), [1, 2, 3, 4]);
  assert.deepEqual(parseSeeds(' 3-6 '), [3, 4, 5, 6]);
  assert.deepEqual(parseSeeds('9'), [9]);
  assert.deepEqual(parseSeeds('2,7,3'), [2, 7, 3]);
  assert.throws(() => parseSeeds('9-3'), /counts backwards/);
  assert.throws(() => parseSeeds('one'), /wants 1-24/);
  assert.throws(() => parseSeeds('1-2-3'), /wants 1-24/);
});

test('the seeds divide across the shards, every one of them exactly once', () => {
  assert.deepEqual(splitShards([1, 2, 3, 4, 5, 6], 3), [[1, 4], [2, 5], [3, 6]]);
  // An odd number across an even number of shards: somebody gets the extra, and nobody gets nothing.
  assert.deepEqual(splitShards([1, 2, 3], 2), [[1, 3], [2]]);
  assert.deepEqual(splitShards([1, 2], 5), [[1], [2]]);
  assert.deepEqual(splitShards([1, 2, 3], 1), [[1, 2, 3]]);

  const seeds = Array.from({ length: 47 }, (unused, i) => i + 1);
  const parts = splitShards(seeds, 8);
  assert.equal(parts.reduce((sum, part) => sum + part.length, 0), 47, 'a shard lost a run');
  assert.equal(new Set(parts.flat()).size, 47, 'two shards played the same seed');
  assert.equal(parts.filter((part) => part.length === 0).length, 0, 'a shard was born idle');
});

test('the flags mean what they say, and the ones that contradict each other are refused', () => {
  const plain = readArgs([]);
  assert.equal(plain.policy, 'human', 'the default batch is the one PLAN asks the arc about');
  assert.equal(plain.picks, 'random', 'and it answers the level-up with a die');
  assert.equal(plain.runs, 48);
  assert.equal(plain.every, 60);
  assert.equal(plain.ship, undefined, 'nobody asks for a ship unless the flag says so');

  assert.equal(readArgs(['--seed', '7']).seed, 7);
  assert.deepEqual(readArgs(['--seeds', '1-3']).seeds, '1-3');
  assert.deepEqual(readArgs(['--in', 'a.jsonl', '--in', 'b.jsonl']).infiles, ['a.jsonl', 'b.jsonl']);
  assert.equal(readArgs(['--quiet']).quiet, true);
  assert.equal(readArgs(['--ship', 'bulwark']).ship, 'bulwark');
  assert.equal(readArgs(['--weapon', 'lance']).weapon, 'lance');
  assert.equal(readArgs([]).weapon, undefined, 'and a plain batch flies the default gun');
  assert.throws(() => readArgs(['--nope']), /unknown flag: --nope/);
  assert.throws(() => readArgs(['--every']), /--every needs a value/);
  assert.throws(() => readArgs(['--every', '0']), /above 0/);
  assert.throws(() => readArgs(['--in', 'a.jsonl', '--shards', '4']), /already played/);
  assert.throws(() => readArgs(['--play-only']), /needs --out/);
});

test('a row survives the trip through a file, fields and all', () => {
  const samples = [[0, 10, 1, 3, 0, 0], [60, 12, 2, 2, 500, 1]];
  const row = rowOf(run({}), samples);
  assert.equal(row.seed, 7);
  assert.equal(row.killedBy, 'body:tank');
  assert.equal(row.shards, 12);
  assert.equal(row.hurtBy['body:tank'], 2);
  assert.deepEqual(row.samples, samples);

  const dir = mkdtempSync(path.join(tmpdir(), 'run-shape-'));
  try {
    const file = path.join(dir, 'batch.jsonl');
    writeRows(file, [row, rowOf(run({ seed: 8, died: false, won: true, stats: {
      killedBy: '', level: 9, score: 4000, kills: 90, collected: 40,
    } }), samples)]);
    const back = readRows([file]);
    assert.equal(back.length, 2, 'a file of two runs pooled as ' + back.length);
    assert.deepEqual(back[0].samples, samples, 'the samples did not survive the file');
    assert.equal(back[1].won, true);

    // And the pooled rows still feed the arc's own checks, which is the whole reason they are kept
    // in this shape and not in a prettier one.
    const arcRows = back.map(summaryOf);
    assert.equal(arcRows[0].stats.killedBy, 'body:tank');
    assert.deepEqual(arcRows[0].tally.hurtBy, { 'body:tank': 2 });
    assert.equal(creditTable(arcRows.filter((s) => s.died && !s.won).map((s) => s.stats.killedBy))
      .rows[0].count, 1, 'the arc\'s ceiling table did not read the pooled rows');
    assert.equal(arcRows[1].won, true, 'a run that won the schedule must not arrive as a death');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a file that is not there, or that is empty, is refused and not played as a zero-run batch', () => {
  assert.throws(() => readRows(['/nope/nothing.jsonl']), /no such file/);
  const dir = mkdtempSync(path.join(tmpdir(), 'run-shape-'));
  try {
    const file = path.join(dir, 'empty.jsonl');
    writeFileSync(file, '\n   \n');
    assert.throws(() => readRows([file]), /held no runs/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('each slice is the middle of the runs still flying in it', () => {
  const rows = [
    // Three runs at 0m00s; two of them are still there at 1m00s; one of those two at 2m00s.
    flown([[0, 10, 1, 3, 0, 0], [60, 12, 2, 2, 500, 1], [120, 20, 3, 1, 900, 2]]),
    flown([[0, 8, 1, 3, 100, 0], [60, 20, 3, 2, 900, 1]]),
    flown([[0, 5, 1, 1, 200, 0]]),
  ];
  assert.deepEqual(shapeRows(rows, 60), [
    ['0m00s', '3', '8', '1', '3', '100', '-'],
    ['1m00s', '2', '16', '2.5', '2', '700', '1'],
    ['2m00s', '1', '20', '3', '1', '900', '1'],
  ]);
});

test('`hulls lost` is each run\u2019s own losses, not the difference of two slices\u2019 medians', () => {
  // The wrong arithmetic is tempting: median hull at 2m minus median hull-lost at 1m. But the two
  // slices are medians of *different batches of ships* - the second minute is over three runs and the
  // third over one - so the difference is a fact about which runs survived, not about whether anyone
  // was hit. Read each run against itself instead, and a run that was untouched says so.
  const rows = [
    flown([[0, 10, 1, 3, 0, 0], [60, 12, 2, 2, 500, 3]]),   // hit three times in the minute
    flown([[0, 8, 1, 3, 100, 0], [60, 20, 3, 2, 900, 0]]),  // and not once
    flown([[0, 5, 1, 1, 200, 0], [60, 20, 3, 1, 900, 0]]),  // and not once
  ];
  const at = shapeRows(rows, 60);
  assert.equal(at[0][6], '-', 'the first row has no before to read against');
  assert.equal(at[1][6], '0', 'the middle run of the minute was not hit');

  // And the same batch with the untouched runs taken out says the opposite, which is the whole point
  // of the column: it is the crowd landing things, counted off the ships it was landing them on.
  const hit = shapeRows([rows[0]], 60);
  assert.equal(hit[1][6], '3');
});

test('a batch played before the hull tally was sampled prints a dash and not a zero', () => {
  // A zero in that column is the claim that nobody was hit, which is the most load-bearing number on
  // the page. Rows off an older `--out` file simply do not have the field, and that has to read as
  // "not answered" rather than as the finding.
  const rows = [flown([[0, 6, 1, 3, 0], [60, 9, 4, 2, 4000]])];
  assert.deepEqual(shapeRows(rows, 60).map((row) => row[6]), ['-', '-']);
});

test('a slice nobody was flying in is not a row, and neither is a minute nobody reached', () => {
  const rows = [flown([[0, 6, 1, 3, 0, 0], [120, 9, 4, 2, 4000, 2]])];
  assert.deepEqual(shapeRows(rows, 60), [
    ['0m00s', '1', '6', '1', '3', '0', '-'],
    // The 2m00s row reads against 0m00s and not against a 1m00s nobody flew in: a run that was
    // flying in both of the rows on either side of a gap still lost its hulls across it.
    ['2m00s', '1', '9', '4', '2', '4000', '2'],
  ], 'the table invented a 1m00s the run had no sample for');
  assert.deepEqual(shapeRows([flown([])], 60), []);
  assert.match(shapeTable(rows, 60), /at\s+flying/);
});

test('a played batch answers the question the column is there for', () => {
  // Four careless runs at a two minute window: they lose hulls, and the table has to say so with a
  // number rather than a dash. This is the end-to-end trip - the tally off the world (`stats()`),
  // into the sample, through the slice, on to the page.
  const run = shape(['--seeds', '1-4', '--seconds', '120', '--every', '30']);
  // The exit code of this tool is the difficulty arc's verdict, and the arc's band is a documented
  // FAIL (NOTES, session 105), so a non-zero here is expected and is not what this is checking. A
  // usage error would be, and that is the one status this refuses.
  assert.notEqual(run.status, 2, run.stderr);
  assert.match(run.stdout, /hulls lost/);
  const rows = run.stdout.split('\n').filter((line) => /^\d+m\d\ds\s/.test(line));
  assert.ok(rows.length >= 3, 'the batch was sliced: ' + rows.length + ' rows');
  const answered = rows.map((line) => line.trim().split(/\s+/).pop());
  assert.equal(answered[0], '-', 'the first row has no before, so a dash there is right');
  assert.ok(answered.slice(1).some((value) => value !== '-' && Number(value) > 0),
    'a careless batch at two minutes is being hit, and the table says: ' + answered.join(' '));
});

test('the shards are waited for, and what they played is what gets reported', () => {
  const out = shape(['--runs', '4', '--seconds', '25', '--every', '10', '--shards', '2', '--bot', 'human']);
  // The verdict of a 25-second batch is never a pass - nothing can die between 4m and 9m in 25s -
  // so what is on trial here is that the parent printed a report at all, and printed four runs.
  assert.match(out.stdout, /the shape of the batch: 4 runs/);
  assert.match(out.stdout, /the ceiling:/, 'the pooled verdict never ran');
  const flying = out.stdout.split('\n').filter((line) => /^\d+m\d\ds\s+\d/.test(line));
  assert.ok(flying.length >= 2, 'the shape table had no slices in it:\n' + out.stdout);
  assert.ok(flying.every((line) => Number(line.trim().split(/\s+/)[1]) > 0),
    'a slice reported zero runs flying:\n' + flying.join('\n'));
});
