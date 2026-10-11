// `--weapon` on tools/line-ab.js: what one upgrade line is worth *on a gun*.
//
// A line's worth is not a property of the line alone. Three of the five primaries cannot spend
// `pierce` at all and two of them cannot spend `ricochet` or the shot-speed line either, so a number
// quoted for `pierce` on the default pulse says nothing at all about what the card does to a lance
// run - which is the question PLAN 10's dead-line item had to answer before it could be decided.
// This file holds the flag, not the answer: that a bad gun name is refused before a single run is
// played, and that a good one is played and *says so* in the header, because a printed table that
// does not name the gun it measured is a number nobody can use.
//
// The measurements themselves are in the weapon rows of game/balance.js and in NOTES session 97;
// the deck behaviour they bought is held by test/deck-per-gun.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'line-ab.js');

function lineAb(args) {
  return spawnSync(process.execPath, [TOOL, ...args], { cwd: ROOT, encoding: 'utf8' });
}

test('a gun the game does not offer is refused before anything is played', () => {
  const run = lineAb(['--line', 'pierce', '--weapon', 'nonsense', '--seeds', '1', '--seconds', '5']);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /--weapon wants one of: pulse, scatter, arc, lance, swarm/);
});

test('a line the game does not have is still refused, with or without a gun', () => {
  const run = lineAb(['--line', 'not-a-line', '--weapon', 'lance']);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /--line wants one of/);
});

test('a measured gun is named in the table it prints', () => {
  // One seed and a five-second window: the point is the header's claim and not the numbers, and a
  // table that says "flying the LANCE" for runs played on the pulse would mislead in exactly the
  // way the flag exists to avoid.
  const run = lineAb(['--line', 'pierce', '--weapon', 'lance', '--seeds', '1', '--seconds', '5']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /flying the LANCE/);
  assert.equal(run.stdout.split('\n').filter((line) => /^(out|dealt|free)\s/.test(line)).length, 3,
    'all three conditions were played');
});
