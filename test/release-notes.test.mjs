// The full description of a release, for the page the version menu gives it.
//
// `tools/release-notes.js` copies one release's `CHANGELOG.md` entry into `releases/notes/v<version>.md`,
// because the published site is assembled from `releases/` alone and cannot read the changelog. The tool
// runs from `tools/release.sh` between the release being copied and its commit, and it must never be the
// reason a release did not happen - so what is tested here is the cutting (which entry, where it stops),
// the writing (a file per release, nothing else touched), and the state of the folder in the tree.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { releaseEntry } from '../tools/release-notes.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const NOTES = path.join(ROOT, 'releases', 'notes');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'releases', 'releases.json'), 'utf8'));

/** A changelog with the shapes a real one has: a heading with a date, a body, and a next heading. */
const FIXTURE = [
  '# Starfall — changelog',
  '',
  '## 0.3.0 — 2026-10-09',
  'The newest one.',
  '- **A bullet** with `code` in it.',
  '',
  '## 0.2.1 — 2026-10-08',
  'The middle one.',
  '',
  '## 0.2.0 — 2026-10-07',
  'The oldest one, and the file ends inside it.',
  '  with a wrapped line.',
].join('\n');

test('an entry is everything under its own heading and none of the next', () => {
  assert.equal(releaseEntry(FIXTURE, '0.2.1'), 'The middle one.');
  assert.equal(releaseEntry(FIXTURE, '0.3.0'), 'The newest one.\n- **A bullet** with `code` in it.');
  // The last entry has no next heading to stop at, and keeps the rest of the file.
  assert.equal(releaseEntry(FIXTURE, '0.2.0'), 'The oldest one, and the file ends inside it.\n  with a wrapped line.');
});

test('a version is matched whole, not as the start of a longer one', () => {
  assert.equal(releaseEntry(FIXTURE, '0.2'), '', '0.2 is not 0.2.0 or 0.2.1');
  assert.equal(releaseEntry(FIXTURE, '0.2.10'), '');
  assert.equal(releaseEntry(FIXTURE, '9.9.9'), '', 'a release that was never written');
  assert.equal(releaseEntry('', '0.2.0'), '');
});

test('the date and the dashes after a version do not stop it being found', () => {
  assert.equal(releaseEntry('## 1.0.0 — 2026-10-11\nShipped.\n', '1.0.0'), 'Shipped.');
  assert.equal(releaseEntry('## 1.0.0\nShipped.\n', '1.0.0'), 'Shipped.');
});

/** A repository of one's own: the tool finds its root beside its own file, like every tool here does. */
function tempRepo(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-notes-'));
  fs.mkdirSync(path.join(dir, 'tools'));
  fs.copyFileSync(path.join(ROOT, 'tools', 'release-notes.js'), path.join(dir, 'tools', 'release-notes.js'));
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), lines);
  return dir;
}

function runToolIn(dir, args) {
  const done = spawnSync(process.execPath, [path.join(dir, 'tools', 'release-notes.js'), ...args],
    { cwd: dir, encoding: 'utf8' });
  return { status: done.status, out: done.stdout + done.stderr };
}

test('the tool writes the entry beside itself, in releases/notes', () => {
  const dir = tempRepo(FIXTURE);
  const first = runToolIn(dir, ['0.2.1']);
  assert.equal(first.status, 0, first.out);
  assert.equal(fs.readFileSync(path.join(dir, 'releases', 'notes', 'v0.2.1.md'), 'utf8'),
    'The middle one.\n');

  // Writing one release does not disturb the folder, and writing it again says the same thing.
  runToolIn(dir, ['0.3.0']);
  assert.equal(fs.readFileSync(path.join(dir, 'releases', 'notes', 'v0.2.1.md'), 'utf8'), 'The middle one.\n');
  assert.equal(runToolIn(dir, ['0.2.1']).status, 0);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'releases', 'notes')).sort(), ['v0.2.1.md', 'v0.3.0.md']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a changelog with no entry for the version is an error the release script can step over', () => {
  const dir = tempRepo(FIXTURE);
  assert.equal(runToolIn(dir, []).status, 1, 'no version asked for');
  const missing = runToolIn(dir, ['7.7.7']);
  assert.equal(missing.status, 1);
  assert.match(missing.out, /No entry for 7\.7\.7/);
  assert.equal(fs.existsSync(path.join(dir, 'releases')), false, 'and nothing was written');

  // A changelog handed in as an argument, which is how an old release gets its notes back.
  fs.writeFileSync(path.join(dir, 'old.md'), '## 5.0.0\nFrom the other file.\n');
  assert.equal(runToolIn(dir, ['5.0.0', 'old.md']).status, 0);
  assert.equal(fs.readFileSync(path.join(dir, 'releases', 'notes', 'v5.0.0.md'), 'utf8'),
    'From the other file.\n');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------- the tree, not the fixture

test('every release the menu lists has a description to show', () => {
  for (const release of manifest) {
    const file = path.join(NOTES, `v${release.version}.md`);
    assert.ok(fs.existsSync(file), `v${release.version} has no note file for its page`);
    const text = fs.readFileSync(file, 'utf8').trim();
    assert.ok(text.length > 20, `v${release.version}'s note is empty: ${JSON.stringify(text)}`);
  }
});

test('a note is the changelog entry of its own release, where the changelog still has it', () => {
  // CHANGELOG.md keeps the recent history and nothing older; the old notes were back-filled from the
  // tags and stand on their own. What may not happen is a note that disagrees with the entry beside it.
  const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  for (const release of manifest) {
    const entry = releaseEntry(changelog, release.version);
    if (!entry) continue;
    const onDisk = fs.readFileSync(path.join(NOTES, `v${release.version}.md`), 'utf8').trim();
    assert.equal(onDisk, entry, `v${release.version}'s note is not its CHANGELOG.md entry`);
  }
});

test('the notes folder holds one file per release and nothing else', () => {
  const listed = new Set(manifest.map((release) => `v${release.version}.md`));
  for (const name of fs.readdirSync(NOTES)) {
    assert.match(name, /^v\d+\.\d+\.\d+\.md$/, `not a note file: ${name}`);
    assert.ok(listed.has(name), `${name} belongs to no release in releases.json`);
  }
});

test('the release script asks for the notes, and is not stopped by them failing', () => {
  const script = fs.readFileSync(path.join(ROOT, 'tools', 'release.sh'), 'utf8');
  assert.match(script, /node tools\/release-notes\.js "\$version"/);
  // Like the line counts: a description is a nicety, and a nicety does not call off a release.
  assert.match(script, /release-notes\.js "\$version" \\\n\s*\|\| echo/);
});
