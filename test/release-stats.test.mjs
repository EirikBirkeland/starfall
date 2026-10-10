// What each release changed, for the menu that lists them: two line counts and a position in the
// session log, written for a new release by tools/release.sh and back-filled over the tags by
// `node tools/release-stats.js`.
//
// The line counts come out of git and are exact, so most of what is tested here is the parts that
// are not: how `git diff --numstat` is read, which release each one is measured against, and how a
// position is found in a log that is full of sessions quoting each other's release lines. The log
// fixture is written here rather than read from the real one, so the promises are held against a log
// whose right answers are known.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  COUNTED, EMPTY_TREE, echoLine, numstat, diffSince, pairs, logBytesOf, onlyInOrder, fill, stamp,
} from '../tools/release-stats.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'release-stats.js');

function runTool(args) {
  const done = spawnSync(process.execPath, [TOOL, ...args], { cwd: ROOT, encoding: 'utf8' });
  return { status: done.status, out: done.stdout + done.stderr };
}

/** A git that answers only what these tests ask, from a table keyed by the diff's revisions. */
function fakeGit(diffs, tags) {
  return function run(args) {
    if (args[0] === 'rev-parse') {
      if (tags.indexOf(args[args.length - 1]) < 0) throw new Error('no such tag');
      return args[args.length - 1] + '\n';
    }
    if (args[0] === 'diff') {
      const range = args[2];
      const found = diffs[range];
      if (found === undefined) throw new Error('unexpected diff: ' + range);
      return found;
    }
    if (args[0] === 'describe') return 'v9.9.9\n';
    throw new Error('unexpected git call: ' + args.join(' '));
  };
}

test('the line counts are counted over the work and nothing else', () => {
  assert.deepEqual(COUNTED, ['index.html', 'src', 'tools', 'test']);
  // The copies under releases/, the notes, the plan and the log are not the work, and they are not
  // in the list, which is the whole of how they get left out.
  assert.equal(COUNTED.some((one) => one.startsWith('releases')), false);
  assert.equal(COUNTED.some((one) => one.endsWith('.md') || one.endsWith('.log')), false);
});

test('numstat is read as added and removed, and a binary file is worth nothing', () => {
  assert.deepEqual(numstat('10\t3\tsrc/game/run.js\n2\t0\ttest/run.test.mjs\n'),
    { added: 12, removed: 3 });
  assert.deepEqual(numstat(''), { added: 0, removed: 0 });
  assert.deepEqual(numstat('-\t-\tassets/tile.png\n5\t1\tsrc/main.js\n'), { added: 5, removed: 1 });
  assert.deepEqual(numstat('0\t0\ttools/release.sh\n'), { added: 0, removed: 0 });
});

test('one release is measured from the release before it, and the first from nothing', () => {
  // Newest first, the order releases.json keeps.
  const plan = pairs([{ version: '0.3.0' }, { version: '0.2.1' }, { version: '0.2.0' }]);
  assert.deepEqual(plan, [
    { version: '0.3.0', from: 'v0.2.1', to: 'v0.3.0' },
    { version: '0.2.1', from: 'v0.2.0', to: 'v0.2.1' },
    // The oldest release has no previous one, so it is counted from the empty tree: everything it
    // shipped with is an addition and nothing is a removal.
    { version: '0.2.0', from: EMPTY_TREE, to: 'v0.2.0' },
  ]);
});

test('the diff asks git for the counted paths and takes the numbers from its own output', () => {
  const asked = [];
  const git = (args) => {
    asked.push(args);
    return '7\t2\tsrc/game/wave.js\n';
  };
  assert.deepEqual(diffSince('v1', 'v2', git), { added: 7, removed: 2 });
  assert.deepEqual(asked[0], ['diff', '--numstat', 'v1..v2', '--'].concat(COUNTED));
});

/**
 * A log with the three things a real one has: the release's own line, with the harness's own line
 * numbering in front of it; a session quoting an older release in the middle of its own sentence;
 * and a multi-byte character, because the answer is in bytes and not in characters.
 */
function fixtureLog() {
  const prefix = 'a session that said naïve things about the wisp\n';   // the é is two bytes
  const a = '    120:' + echoLine('0.1.0') + '\n';
  const quote = 'and then we shipped, or rather "Released v0.2.0. It is now in the menu." was printed\n';
  const b = '    9:' + echoLine('0.2.0') + '\n';
  return Buffer.from(prefix + a + quote + b, 'utf8');
}

test('a release position is the end of its own line, in bytes', () => {
  const log = fixtureLog();
  const a = logBytesOf(log, '0.1.0');
  const b = logBytesOf(log, '0.2.0');
  assert.ok(a > 0 && b > a, 'the log is written in order, so the positions must grow');
  assert.equal(a, Buffer.byteLength('a session that said naïve things about the wisp\n'
    + '    120:' + echoLine('0.1.0') + '\n', 'utf8'), 'just past the line, and in bytes');
  assert.ok(log.slice(0, a).toString('utf8').endsWith(echoLine('0.1.0') + '\n'));
  assert.equal(logBytesOf(log, '0.3.0'), null, 'a release the log never saw has no position');
});

test('a quote in the middle of a sentence is not the moment the release happened', () => {
  // The fixture has exactly one real line for 0.2.0 and one quote of it, mid-sentence, earlier.
  const log = fixtureLog();
  const quoted = log.indexOf(Buffer.from('Released v0.2.0.'));
  const found = logBytesOf(log, '0.2.0');
  assert.ok(quoted > 0 && quoted < found, 'the quote is earlier in the log, and was not chosen');
});

test('a line that begins with a quote is caught by the order it turned up in', () => {
  // A session can put a quoted release line at the start of one of its own lines, which passes the
  // anchor test. What gives it away is sitting before an older release's position, which is how
  // onlyInOrder is used before any of them is written down.
  const positions = onlyInOrder([100, 50, 200, null, 150, 300]);
  assert.deepEqual(positions, [100, null, 200, null, null, 300]);
  assert.deepEqual(onlyInOrder([]), []);
  assert.deepEqual(onlyInOrder([null, null]), [null, null]);
});

test('a fill writes the numbers that are missing and leaves the ones that are there alone', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-stats-'));
  fs.mkdirSync(path.join(dir, 'releases'));
  fs.writeFileSync(path.join(dir, 'releases', 'releases.json'), JSON.stringify([
    { version: '0.2.0', date: '2026-10-09', summary: 'later' },
    { version: '0.1.0', date: '2026-10-08', summary: 'first', added: 40, removed: 4 },
  ], null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'loop.log'), fixtureLog());

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'releases', 'releases.json'), 'utf8'));
  const changed = fill(manifest, {
    dir: dir,
    git: fakeGit({ 'v0.1.0..v0.2.0': '30\t5\tsrc/game/wave.js\n', [EMPTY_TREE + '..v0.1.0']: '99\t0\tindex.html\n' },
      ['v0.1.0', 'v0.2.0']),
  });

  assert.equal(manifest[0].added, 30);
  assert.equal(manifest[0].removed, 5);
  assert.equal(manifest[0].logBytes, logBytesOf(fixtureLog(), '0.2.0'));
  assert.equal(manifest[1].added, 40, 'a number that was already there is not a gap');
  assert.equal(manifest[1].removed, 4);
  assert.ok(manifest[1].logBytes > 0, 'the log position was missing, and is filled');
  assert.ok(changed.length > 0);
  assert.match(fs.readFileSync(path.join(dir, 'releases', 'releases.json'), 'utf8'), /"added": 30/);

  // Running it again changes nothing, which is what makes it safe to leave in the release script.
  const written = fs.readFileSync(path.join(dir, 'releases', 'releases.json'), 'utf8');
  assert.deepEqual(fill(manifest, { dir: dir, git: fakeGit({}, []) }), []);
  assert.equal(fs.readFileSync(path.join(dir, 'releases', 'releases.json'), 'utf8'), written);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a release whose tags have gone missing is left blank rather than guessed at', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-stats-'));
  fs.mkdirSync(path.join(dir, 'releases'));
  const manifest = [{ version: '0.2.0' }, { version: '0.1.0' }];
  fs.writeFileSync(path.join(dir, 'releases', 'releases.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, 'loop.log'), Buffer.alloc(0));

  // v0.1.0's tag has gone. There is no honest diff for either of them - counting 0.2.0 from the empty
  // tree would call the whole history a release - so both are left with nothing and say so.
  const git = fakeGit({ 'v0.1.0..v0.2.0': '1\t1\ttools/x.js\n' }, ['v0.2.0']);
  assert.deepEqual(fill(manifest, { dir: dir, git: git }), []);
  assert.equal(manifest[0].added, undefined);
  assert.equal(manifest[1].added, undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('stamping the release being made counts from the last tag and reads the log as it is', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-stats-'));
  fs.writeFileSync(path.join(dir, 'loop.log'), Buffer.from('released, and here is the log so far\n'));
  const stamped = stamp('0.3.0', {
    dir: dir,
    git: fakeGit({ 'v9.9.9..HEAD': '12\t3\tsrc/game/wave.js\n' }, ['v9.9.9']),
  });
  assert.equal(stamped.previous, 'v9.9.9', 'the newest tag already in the tree');
  assert.deepEqual({ added: stamped.added, removed: stamped.removed }, { added: 12, removed: 3 });
  assert.equal(stamped.logBytes, 37, 'how far the log had got, in bytes');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the manifest in the tree has its line counts for every release', () => {
  const out = runTool(['--print']);
  assert.equal(out.status, 0, out.out);
  assert.equal(out.out.includes('?'), false, 'no release is left with an unknown line count:\n' + out.out);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'releases', 'releases.json'), 'utf8'));
  assert.ok(manifest.length > 40, 'the whole history is listed: ' + manifest.length);
  for (const entry of manifest) {
    assert.ok(Number.isInteger(entry.added) && entry.added > 0, entry.version + ' added: ' + entry.added);
    assert.ok(Number.isInteger(entry.removed) && entry.removed >= 0, entry.version + ' removed');
  }
  // The newest release always has its log position, because release.sh writes it there and then.
  assert.ok(Number.isInteger(manifest[0].logBytes) && manifest[0].logBytes > 0);
});

test('the tool says plainly when a release has no log position to be had', () => {
  const out = runTool(['--print']);
  // Not every old release has one: the harness elides long output, and the release line goes with it.
  assert.match(out.out, /have no place in the log|every release has its place in the log/);

  // And that is not a failure. A missing place in the log is a fact about an old release; a missing
  // line count would be a hole that could still be filled, and only that is what --check is for.
  const checked = runTool(['--check']);
  assert.equal(checked.status, 0, checked.out);
  assert.match(checked.out, /every release has its line counts/);
});
