// The instrument that asks which line spends the bytes, and the rows it asks with.
//
//   node tools/alloc-ablate.js --list
//   node tools/alloc-ablate.js --kind shielder --bare
//
// `tools/alloc-probe.js` weighs a step in bytes and `test/alloc-probe.test.mjs` keeps that weight honest;
// neither of them can say *where* the bytes came from, and a byte has no return address - the inspector's
// sampling profiler sees a crowd that throws away 4.8 KB a step at 3.5 B a step, because everything the
// crowd spent was garbage before anyone looked. So this file ablates: it copies the game into a
// temporary folder, takes one line out of the copy, and reads the same load again. What went with the
// line was the line's - and what stayed is the honest part of the answer.
//
// Three things are kept true here:
//
//   - **every row still names a line that exists.** The rows are exact text, so that a row cannot
//     quietly stop meaning anything; a row whose text is gone reads `not in the source any more` when it
//     runs, and this file fails before anyone has to sit through a measurement to find out.
//   - **every row leaves the copy of the game parseable.** A row that edits the middle of an expression
//     is not a question, it is a broken build, and the copy is where the mistake belongs.
//   - **the instrument still notices the thing it was built to notice**: a crowd of shielders throws away
//     several kilobytes a step with its walks in, and almost nothing with them out. That is the one
//     claim the tool makes about the game, and it is what the last test pays a real measurement for.
//
// The readings themselves are not asserted - not one byte of them. A row's number is what V8 made of the
// shape it was handed on this box today, and the header of the tool spells out why that is a magnifier
// and not a ruler: on the same shielder crowd, half a dozen unrelated edits each take the whole 48 B a
// body to nothing, which is a compilation shape and not a line to delete.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BALANCE } from '../src/game/balance.js';
import {
  ROWS, applyEdits, chosenRows, makeCopy, readArgs, verdictOf,
} from '../tools/alloc-ablate.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'alloc-ablate.js');

/** A copy of the tree to edit, like the tool's own, and the game half of it. */
function scratchCopy() {
  const into = mkdtempSync(path.join(os.tmpdir(), 'ablate-test-'));
  makeCopy(into);
  return into;
}

test('every row still names something that is in the source', () => {
  const into = scratchCopy();
  try {
    for (const row of ROWS) {
      const applied = applyEdits(row.edits, path.join(into, 'src'));
      assert.equal(applied.problem, undefined, `row "${row.name}": ${applied.problem}`);
    }
  } finally {
    rmSync(into, { recursive: true, force: true });
  }
});

test('every row leaves the game parseable', () => {
  const into = scratchCopy();
  try {
    for (const row of ROWS) {
      const applied = applyEdits(row.edits, path.join(into, 'src'));
      assert.equal(applied.problem, undefined, `row "${row.name}": ${applied.problem}`);
      for (const file of applied.files) {
        const checked = spawnSync(process.execPath, ['--check', path.join(into, 'src', 'game', file)],
          { encoding: 'utf8' });
        assert.equal(checked.status, 0, `row "${row.name}" leaves ${file} unparseable:\n${checked.stderr}`);
      }
    }
  } finally {
    rmSync(into, { recursive: true, force: true });
  }
});

test('a row that is not in the source any more says so instead of measuring nothing', () => {
  const into = scratchCopy();
  try {
    const applied = applyEdits([{ file: 'kinds.js', find: 'the line nobody wrote', repl: '' }],
      path.join(into, 'src'));
    assert.equal(applied.ok, false);
    assert.match(applied.problem, /not in kinds\.js any more/);
  } finally {
    rmSync(into, { recursive: true, force: true });
  }
});

test('the rows are named, asked of a kind this game has, and the plain load is one of them', () => {
  const names = ROWS.map((row) => row.name);
  assert.equal(new Set(names).size, names.length, 'two rows share a name');
  assert.ok(names.includes('nothing taken out'), 'there is no load to measure the others against');
  for (const row of ROWS) {
    assert.ok(row.why.length > 10, `"${row.name}" does not say what it asks`);
    assert.ok(row.about === 'any' || BALANCE.kinds[row.about] !== undefined,
      `"${row.name}" is about a kind called ${row.about}`);
    assert.ok(row.edits.length === 0 || row.edits.every((e) => e.file && e.find && 'repl' in e),
      `"${row.name}" has an edit without a file, a find, and a repl`);
  }
});

test('a crowd of a kind gets that kind\'s rows and the ones every body shares', () => {
  const shielder = chosenRows('shielder', '');
  assert.ok(shielder.some((row) => row.about === 'shielder'));
  assert.ok(!shielder.some((row) => row.about === 'swarmling'), 'a swarmling row came to a shielder run');
  assert.ok(shielder.every((row) => row.about === 'any' || row.about === 'shielder'));
  const mixed = chosenRows('mixed', '');
  assert.ok(mixed.every((row) => row.about === 'any'), 'a kind\'s own row came to a mixed crowd');
  assert.equal(chosenRows('shielder', 'glide').every((row) => row.name.includes('glide')), true);
});

test('what a reading says is read off the load it came from', () => {
  const plain = { name: 'nothing taken out', bytes: 4800, floor: 64 };
  assert.equal(verdictOf({ name: 'a', bytes: 70 }, plain, 64), 'the whole of it went');
  assert.equal(verdictOf({ name: 'b', bytes: 1200 }, plain, 64), 'most of it went');
  assert.equal(verdictOf({ name: 'c', bytes: 4000 }, plain, 64), 'a share went');
  assert.equal(verdictOf({ name: 'd', bytes: 4800 }, plain, 64), 'nothing came off');
  assert.equal(verdictOf({ name: 'e', problem: 'does not parse' }, plain, 64), 'does not parse');
});

test('the flags it takes, and the one it refuses', () => {
  const opts = readArgs(['--kind', 'swarmling', '--bare', '--row', 'flock', '--steps', '200']);
  assert.equal(opts.kind, 'swarmling');
  assert.equal(opts.bare, true);
  assert.equal(opts.row, 'flock');
  assert.equal(opts.steps, 200);
  assert.throws(() => readArgs(['--nope']), /I do not know the flag --nope/);
  assert.throws(() => readArgs(['--edit', 'kinds.js']), /--edit needs --find/);
  const mine = readArgs(['--edit', 'kinds.js', '--find', 'a\\nb', '--repl', 'c']);
  assert.equal(mine.custom[0].find, 'a\nb', 'a \\n in --find is a newline, not a backslash');
});

/** One run of the tool, in its own process, on a short window so the suite is not waiting on a ladder. */
function ablate(args) {
  return spawnSync(process.execPath, [TOOL, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
}

test('the instrument notices where a shielder crowd spends its bytes', () => {
  const run = ablate(['--kind', 'shielder', '--bare', '--row', 'the crowd is not walked',
    '--steps', '200', '--windows', '3', '--json']);
  assert.equal(run.status, 0, run.stderr);
  const line = run.stdout.split('\n').filter((l) => l.startsWith('ABLA '))[0];
  assert.ok(line, `the tool printed no reading:\n${run.stdout}`);
  const reading = JSON.parse(line.slice(5));
  const byName = new Map(reading.rows.map((r) => [r.name, r]));
  const plain = byName.get('nothing taken out');
  const walked = byName.get('the crowd is not walked');
  assert.equal(plain.problem, '', plain.name);
  assert.equal(walked.problem, '', walked.name);
  // The walk is where this crowd's garbage is, or this tool has stopped measuring what it claims to.
  assert.ok(plain.bytes > 1024, `a shielder crowd threw away only ${plain.bytes} B a step`);
  assert.ok(walked.bytes < plain.bytes / 4,
    `taking the walk out left ${walked.bytes} B of the ${plain.bytes} B a step it started with`);
});
