#!/usr/bin/env node
// How much each release changed, for the menu that lists them.
//
//   node tools/release-stats.js                 fill in whatever releases.json is missing
//   node tools/release-stats.js --check         fail if any release has no line counts
//   node tools/release-stats.js --print         the table as it stands, nothing written
//   node tools/release-stats.js --stamp 0.11.0  fill one entry, the release being made right now
//   node tools/release-stats.js --stamp 0.11.0 --log other.log
//
// Every entry in `releases/releases.json` gets three numbers beside its version, date and summary:
//
//   "added"   lines the release put in, since the release before it
//   "removed" lines it took out
//   "logBytes" how far `loop.log` had got when the release was made
//
// The two line counts are counted over the game's own files and nothing else: `index.html`, `src/`,
// `tools/` and `test/`. The copies under `releases/` are excluded because they are copies, and
// `NOTES.md`, `PLAN.md`, `CHANGELOG.md` and `loop.log` are excluded because they are the story about
// the work and not the work - a session can write three pages of notes about a two line change and
// the change is still two lines. They come from `git diff --numstat` between one release's tag and
// the next one's, which is exact and needs no judgement: the first release is counted from the empty
// tree, so it reads as everything it shipped with.
//
// `logBytes` is a rough one and is meant to be read rough: the menu takes the difference between two
// releases' values as how many tokens the second one cost, so it only has to be in the right order
// and the right size. A release being made now gets the honest thing, the size of `loop.log` at that
// moment. For the releases already out there there is only what the log remembers, and the log is a
// transcript the harness writes with long output elided - so the anchor used is the release's own
// `Released v<version>. It is now in the menu.` line, at the start of a line, and an entry gets no
// `logBytes` at all when that line was elided. Nothing is invented for it: a missing number reads as
// nothing in the menu, which is true, and an estimated one would read as a measurement.
//
// What it never does: change a number that is already there. It fills gaps, so it is safe to run
// again after anything, and a hand-edited entry stays as it was left.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');

/** The files whose lines belong to the work. Everything else is commentary or a copy. */
export const COUNTED = ['index.html', 'src', 'tools', 'test'];

/** git's own name for "no files at all", for the first release which has no previous one. */
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** The last line `tools/release.sh` prints, which is the moment the release existed. */
export function echoLine(version) {
  return 'Released v' + version + '. It is now in the menu.';
}

/**
 * What `git diff --numstat` added and removed, read off its own output.
 *
 * A file with no text in it prints `-` in both columns; it counts as nothing, which is what a
 * binary blob or a mode change is worth in a line count.
 */
export function numstat(text) {
  let added = 0;
  let removed = 0;
  for (const line of text.split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    added += Number.isFinite(+parts[0]) ? +parts[0] : 0;
    removed += Number.isFinite(+parts[1]) ? +parts[1] : 0;
  }
  return { added: added, removed: removed };
}

/**
 * The same, straight from git. `run` is the git call and is a parameter so a test can hand in a
 * table of output instead of needing a repository of its own.
 */
export function diffSince(from, to, run) {
  const git = run === undefined
    ? (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
    : run;
  return numstat(git(['diff', '--numstat', from + '..' + to, '--'].concat(COUNTED)));
}

/**
 * Which pair of revisions each entry is counted between.
 *
 * `entries` is the manifest, newest first, which is the order releases.json keeps - so an entry's
 * previous release is the one after it in the list, whatever the version numbers look like (0.4.10
 * sorts after 0.4.2 by string and before it by date, and the list is the chronology).
 */
export function pairs(entries) {
  return entries.map((entry, i) => ({
    version: entry.version,
    from: i + 1 < entries.length ? 'v' + entries[i + 1].version : EMPTY_TREE,
    to: 'v' + entry.version,
  }));
}

/**
 * How far the log had got when this release was made, in bytes: the offset just past the release's
 * own echo line, or null when the log has no such line at the start of a line.
 *
 * The line has to start the line (with the harness's own indentation and line numbering in front of
 * it) because the log is full of sessions quoting each other, and a quote is not a moment. Where the
 * harness elided the script's output the line is simply not there, and null is the honest answer.
 */
export function logBytesOf(log, version) {
  const needle = Buffer.from(echoLine(version));
  let from = 0;
  for (;;) {
    const at = log.indexOf(needle, from);
    if (at < 0) return null;
    const lineStart = log.lastIndexOf(0x0a, at) + 1;   // 0 when the match is at byte 0
    const before = log.slice(lineStart, at).toString('utf8');
    if (/^[ \t]*(?:\d+:)?$/.test(before)) {
      const eol = log.indexOf(0x0a, at);
      return eol < 0 ? log.length : eol + 1;
    }
    from = at + 1;
  }
}

/**
 * Drop any log position that sits before an older release's, which cannot be the release happening.
 *
 * The log is written in order, so positions must grow with the releases. A line-start match that
 * breaks that is a session quoting an older release in its own text, and the alternative - taking
 * it and shifting everything after it - turns one quote into fifty wrong numbers.
 */
export function onlyInOrder(positions) {
  let last = 0;
  return positions.map((at) => {
    if (at === null || at <= last) return null;
    last = at;
    return at;
  });
}

/**
 * Fill the gaps in a manifest, oldest release first.
 *
 * Oldest first because that is the direction the log positions have to be checked in, and because a
 * gap in the middle of the list is exactly what a backfill is for. Returns the entries it changed.
 */
export function fill(manifest, options) {
  const opts = options || {};
  const dir = opts.dir === undefined ? ROOT : opts.dir;
  const manifestPath = path.join(dir, 'releases', 'releases.json');
  const logPath = path.join(dir, opts.log === undefined ? 'loop.log' : opts.log);
  const log = fs.existsSync(logPath) ? fs.readFileSync(logPath) : null;
  // One git runner for the whole fill, pointed at the tree being measured.
  const git = opts.git === undefined
    ? (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
    : opts.git;

  const changed = [];
  // The pairs are found on the manifest as it stands; the numbers are then written back into the
  // same objects, so a filled `added` never changes which tag an entry is counted from.
  const oldestFirst = pairs(manifest).slice().reverse();
  // And the log positions in the same order, oldest first, because that is the direction the log was
  // written in and the only way to notice a match that cannot be the release happening.
  const positions = onlyInOrder(oldestFirst.map(
    (pair) => (log === null ? null : logBytesOf(log, pair.version))));

  oldestFirst.forEach((pair, index) => {
    const entry = manifest.find((one) => one.version === pair.version);
    if (entry === undefined) return;
    const wantsLines = entry.added === undefined || entry.removed === undefined;
    const wantsLog = entry.logBytes === undefined;
    const counted = wantsLines && tagExists(pair.to, git)
      && (pair.from === EMPTY_TREE || tagExists(pair.from, git));
    if (counted) {
      const lines = diffSince(pair.from, pair.to, git);
      entry.added = lines.added;
      entry.removed = lines.removed;
      changed.push(entry.version + ' lines');
    }
    if (wantsLog && positions[index] !== null) {
      entry.logBytes = positions[index];
      changed.push(entry.version + ' log');
    }
  });

  if (changed.length > 0 && opts.write !== false) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }
  return changed;
}

/** Does this tag exist? A release whose tag went missing cannot be measured, and says so. */
function tagExists(tag, run) {
  const git = run === undefined
    ? (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
    : run;
  try {
    git(['rev-parse', '-q', '--verify', tag]);
    return true;
  } catch (notThere) {
    return false;
  }
}

/**
 * The entry for a release that is being made right now, before it has a tag of its own.
 *
 * `tools/release.sh` calls this between writing the entry and committing it, which is the only
 * moment where "since the last release" is HEAD and "how far the log has got" is the file's size.
 */
export function stamp(version, options) {
  const opts = options || {};
  const dir = opts.dir === undefined ? ROOT : opts.dir;
  const logName = opts.log === undefined ? 'loop.log' : opts.log;
  const logPath = path.join(dir, logName);
  const git = opts.git === undefined
    ? (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
    : opts.git;
  const previous = (() => {
    try {
      return git(['describe', '--tags', '--abbrev=0']).trim();
    } catch (noTagsAtAll) {
      return EMPTY_TREE;
    }
  })();
  const lines = diffSince(previous, 'HEAD', git);
  const entry = { added: lines.added, removed: lines.removed };
  // The size now, which is a few hundred bytes short of the honest figure by the time the harness
  // has written the release line into the log - the same order as everything else in this number.
  if (fs.existsSync(logPath)) entry.logBytes = fs.statSync(logPath).size;
  entry.previous = previous === EMPTY_TREE ? '' : previous;
  return entry;
}

function readArgs(argv) {
  const opts = { mode: 'fill', version: null, log: 'loop.log' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      i++;
      return argv[i];
    };
    if (arg === '--check') opts.mode = 'check';
    else if (arg === '--print') opts.mode = 'print';
    else if (arg === '--stamp') {
      opts.mode = 'stamp';
      opts.version = next();
    } else if (arg === '--log') opts.log = next();
    else {
      console.error('usage: release-stats.js [--check | --print | --stamp VERSION] [--log FILE]');
      process.exit(2);
    }
  }
  if (opts.mode === 'stamp' && !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(opts.version || '')) {
    console.error('--stamp wants the version being released, like 0.11.0');
    process.exit(2);
  }
  return opts;
}

/** Which entries are still missing their line counts, and which their place in the log. */
function gaps(manifest) {
  return {
    lines: manifest.filter((e) => e.added === undefined || e.removed === undefined),
    log: manifest.filter((e) => e.logBytes === undefined),
  };
}

function table(manifest) {
  return manifest.map((e) => e.version.padEnd(8)
    + ('+' + (e.added === undefined ? '?' : e.added)).padStart(8)
    + ('-' + (e.removed === undefined ? '?' : e.removed)).padStart(8)
    + (e.logBytes === undefined ? '        -' : String(e.logBytes).padStart(11))).join('\n');
}

/** Only run when called as a command, so the tests can import the parts above. */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const opts = readArgs(process.argv.slice(2));
  const manifestPath = path.join(ROOT, 'releases', 'releases.json');

  if (opts.mode === 'stamp') {
    const stamped = stamp(opts.version, { log: opts.log });
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const entry = manifest.find((one) => one.version === opts.version);
    if (entry === undefined) {
      console.error('releases.json has no ' + opts.version + ' yet - the release script writes the entry first');
      process.exit(1);
    }
    entry.added = stamped.added;
    entry.removed = stamped.removed;
    if (stamped.logBytes !== undefined) entry.logBytes = stamped.logBytes;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log('release ' + opts.version + ' since ' + (stamped.previous === '' ? 'nothing' : stamped.previous)
      + ': +' + stamped.added + ' -' + stamped.removed + ' lines'
      + (stamped.logBytes === undefined ? ', no loop.log' : ', loop.log at ' + stamped.logBytes + ' bytes'));
  } else {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (opts.mode === 'fill') {
      const changed = fill(manifest, { log: opts.log });
      console.log(changed.length === 0
        ? 'releases.json already has all three numbers for every release'
        : 'filled ' + changed.length + ' number' + (changed.length === 1 ? '' : 's')
        + ' across ' + new Set(changed.map((one) => one.split(' ')[0])).size + ' releases');
    }
    console.log(table(manifest));
    const missing = gaps(manifest);
    console.log('');
    console.log(missing.lines.length === 0
      ? 'every release has its line counts'
      : missing.lines.length + ' of ' + manifest.length + ' releases have no line counts - '
      + 'their tags are missing, so nothing honest can be counted');
    console.log(missing.log.length === 0
      ? 'every release has its place in the log'
      : missing.log.length + ' of ' + manifest.length + ' releases have no place in the log: their '
      + 'release line was elided from ' + opts.log + ', and a quote is not a moment');
    // Only the line counts can be had for every release, so only their absence is a failure. A
    // missing log position is a fact about an old release, not a gap to close.
    if (opts.mode === 'check' && missing.lines.length > 0) process.exitCode = 1;
  }
}
