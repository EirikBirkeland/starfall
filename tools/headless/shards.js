// Splitting a batch of runs over several processes, and pooling what they wrote.
//
// One game per process is the harness's rule - the modules hold the world (tools/headless/harness.js)
// - so a tool that wants forty-eight runs at a fifteen minute window cannot get them from one process
// in any reasonable time. What every measuring tool has done about it is the same four steps, written
// out four times: split the seeds, name a file per shard, spawn a child that plays its share and
// writes it, wait for all of them and pool the rows. This file is those four steps once.
//
// The rules they share, and why each one is here rather than open to interpretation:
//
//   **round-robin, not contiguous.** A shard that owns seeds 1-6 and another that owns 7-12 would put
//     the whole of a `--shards 2` batch's variance on whichever half of the seed space it landed in.
//     Dealing the seeds round the shards means every shard sees a spread, and pooling them gives the
//     same batch `--runs 48` would have in one process.
//   **a shard that exits non-zero is an error naming its seeds.** A silent short batch is the worst
//     failure a measuring tool can have: the table comes out printed, plausible, and describing fewer
//     runs than it claims.
//   **the files are the tool's own and get removed.** They are made seconds ago in the tmpdir and the
//     rows are already in memory by the time anyone reads them.
//   **an empty pool is refused.** `--in` over a file that holds nothing is a mistake, and reporting it
//     as a zero-run batch is how a measurement ends up quoted from a batch nobody played.
//
// A shard is the same tool started again with `--seeds <its share> --play-only --out <its file>`, so
// the child needs no new code path beyond "play, write, say nothing" - and it deliberately does not
// answer a verdict, because a shard whose arc failed is not a shard that crashed and the parent's
// pooled verdict is the only one anybody should be reading.

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

/** One JSON row per run, one line each. */
export function writeRows(file, rows) {
  writeFileSync(file, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
}

/** The rows of one or more files written by `writeRows`, in the order the files were given. */
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

/**
 * Play `seeds` over `shards` child processes of the calling tool and pool their rows.
 *
 * `tool` is the caller's own `import.meta.url` - the module cannot know whose child it is being asked
 * to start, and a child that ran this file instead of the tool would play nothing at all. `pass` is
 * the flag list the child needs to be measuring the same thing (`--seconds`, `--bot`, and whatever
 * the tool's own subject is); the seeds and the output file are added here because they are what
 * *being a shard* means.
 */
export async function playSharded(options) {
  const name = options.name;
  const chunks = splitShards(options.seeds, options.shards);
  const files = chunks.map((unused, k) => tmpdir() + '/starfall-' + name + '-' + process.pid
    + '-' + k + '.jsonl');
  const pass = options.pass === undefined ? [] : options.pass;
  const kids = chunks.map((chunk, k) => new Promise((resolve, reject) => {
    const kid = spawn(process.execPath, [fileURLToPath(options.tool),
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
    files.forEach((file) => {
      try { unlinkSync(file); } catch (err) { /* already gone is not a failure */ }
    });
  }
}
