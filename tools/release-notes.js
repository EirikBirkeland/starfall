#!/usr/bin/env node
// The full description of a release, for its page in the version menu.
//
//   node tools/release-notes.js 1.5.0                   from CHANGELOG.md
//   node tools/release-notes.js 0.3.1 old-changelog.md  from another copy of the changelog
//
// The menu is published from `releases/` alone, so it cannot read `CHANGELOG.md`. This copies one
// release's entry - everything under its `## <version>` heading, up to the next heading - into
// `releases/notes/v<version>.md`, which the menu shows when that release is opened.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The lines under the version's heading, or '' when the changelog has no entry for it. */
export function releaseEntry(changelog, version) {
  const lines = changelog.split('\n');
  const isHeading = line => line.startsWith('## ');
  const isThisVersion = line => isHeading(line) && line.slice(3).split(/\s/)[0] === version;

  const start = lines.findIndex(isThisVersion);
  if (start < 0) return '';

  const body = lines.slice(start + 1);
  const nextHeading = body.findIndex(isHeading);
  const entry = nextHeading < 0 ? body : body.slice(0, nextHeading);
  return entry.join('\n').trim();
}

function main() {
  const [version, changelogPath = path.join(root, 'CHANGELOG.md')] = process.argv.slice(2);
  if (!version) {
    console.error('usage: node tools/release-notes.js <version> [changelog file]');
    process.exit(1);
  }

  const entry = releaseEntry(fs.readFileSync(changelogPath, 'utf8'), version);
  if (!entry) {
    console.error(`No entry for ${version} in ${changelogPath}.`);
    process.exit(1);
  }

  const notesFolder = path.join(root, 'releases', 'notes');
  fs.mkdirSync(notesFolder, { recursive: true });
  fs.writeFileSync(path.join(notesFolder, `v${version}.md`), entry + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
