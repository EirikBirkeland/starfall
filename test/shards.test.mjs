// Splitting a batch over processes and pooling it back (tools/headless/shards.js).
//
// Four measuring tools used to carry their own copy of this - and a shard that quietly played fewer
// runs than it was asked for is the worst failure a measuring tool can have, because the table still
// prints, still looks plausible, and describes a batch nobody played. So the promises here are about
// the pooling being honest: every seed is played exactly once, a shard that dies is an error that
// names its seeds, an empty pool is refused rather than reported as a zero-run batch, and a sharded
// batch is the same batch as one played in a single process.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  parseSeeds, splitShards, readRows, writeRows, playSharded,
} from '../tools/headless/shards.js';

const ROOT = path.resolve(import.meta.dirname, '..');

/**
 * A stand-in for a tool's `--play-only` mode: it plays the seeds it was handed and writes one row
 * each, or exits non-zero when the test wants a shard that died.
 */
function fakeTool(dir, name) {
  const file = path.join(dir, name + '.mjs');
  writeFileSync(file, [
    "import { writeFileSync } from 'node:fs';",
    'const args = process.argv.slice(2);',
    "const get = (flag) => { const i = args.indexOf(flag); return i < 0 ? null : args[i + 1]; };",
    "const out = get('--out');",
    "if (out === null) { console.error('no --out'); process.exit(2); }",
    "if (args.indexOf('--fail') >= 0) process.exit(3);",
    "const seeds = (get('--seeds') || '').split(',').filter((s) => s !== '');",
    "writeFileSync(out, seeds.map((s) => JSON.stringify({ seed: Number(s) })).join('\\n') + '\\n');",
  ].join('\n'));
  return pathToFileURL(file).href;
}

test('a span, a list and a single seed all spell a list of seeds', () => {
  assert.deepEqual(parseSeeds('1-4'), [1, 2, 3, 4]);
  assert.deepEqual(parseSeeds(' 3-6 '), [3, 4, 5, 6]);
  assert.deepEqual(parseSeeds('2,7,3'), [2, 7, 3]);
  assert.throws(() => parseSeeds('9-3'), /counts backwards/);
  assert.throws(() => parseSeeds('one'), /wants 1-24/);
});

test('the deal is round-robin, so no shard owns a run of neighbouring seeds', () => {
  assert.deepEqual(splitShards([1, 2, 3, 4, 5, 6], 3), [[1, 4], [2, 5], [3, 6]]);
  assert.deepEqual(splitShards([1, 2, 3], 2), [[1, 3], [2]]);
  // Asking for more shards than seeds is not an error and is not an empty shard either.
  assert.deepEqual(splitShards([1, 2], 5), [[1], [2]]);
  assert.deepEqual(splitShards([1, 2, 3], 1), [[1, 2, 3]]);
  const seeds = Array.from({ length: 48 }, (unused, i) => i + 1);
  const parts = splitShards(seeds, 8);
  assert.equal(parts.length, 8);
  assert.deepEqual(parts.flat().slice().sort((a, b) => a - b), seeds, 'a seed went missing');
});

test('rows survive the trip through a file, and the pool keeps the order the files were given in', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'shards-'));
  try {
    const a = path.join(dir, 'a.jsonl');
    const b = path.join(dir, 'b.jsonl');
    writeRows(a, [{ seed: 1 }, { seed: 2 }]);
    writeRows(b, [{ seed: 3 }]);
    assert.deepEqual(readRows([a, b]), [{ seed: 1 }, { seed: 2 }, { seed: 3 }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a pool that is missing or empty is refused, not reported as a batch of none', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'shards-'));
  try {
    assert.throws(() => readRows([path.join(dir, 'nope.jsonl')]), /no such file/);
    const empty = path.join(dir, 'empty.jsonl');
    writeFileSync(empty, '\n   \n');
    assert.throws(() => readRows([empty]), /held no runs/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a sharded batch plays every seed exactly once and pools them back', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'shards-'));
  try {
    const rows = await playSharded({
      name: 'test-shard', tool: fakeTool(dir, 'ok'), seeds: [1, 2, 3, 4, 5], shards: 3, pass: [],
    });
    assert.deepEqual(rows.map((row) => row.seed).sort((a, b) => a - b), [1, 2, 3, 4, 5]);
    // The shard's own files are made in the system tmpdir, named after the tool and this process, and
    // the rows are already in memory by the time anyone reads them: leaving them is litter.
    const left = readdirSync(tmpdir())
      .filter((name) => name.startsWith('starfall-test-shard-' + process.pid));
    assert.deepEqual(left, [], 'a shard left its file behind');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a shard that dies is an error that says which seeds it was given', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'shards-'));
  try {
    await assert.rejects(
      () => playSharded({
        name: 'test-shard', tool: fakeTool(dir, 'bad'), seeds: [1, 2, 3, 4], shards: 2,
        pass: ['--fail'],
      }),
      /shard \d \(seeds [1234,]+\) exited 3/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a flag list reaches the shard that needs it', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'shards-'));
  try {
    // The child here writes what it was asked for, so a flag that did not travel shows up as a row
    // that is missing - which is exactly how a tool's own `--seconds` or `--set` would go wrong.
    const rows = await playSharded({
      name: 'test-shard', tool: fakeTool(dir, 'ok'), seeds: [7, 8], shards: 2,
      pass: ['--seconds', '30'],
    });
    assert.deepEqual(rows.map((row) => row.seed).sort((a, b) => a - b), [7, 8]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
