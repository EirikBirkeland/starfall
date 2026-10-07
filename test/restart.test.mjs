// Nobody pinned a seed, so every run in the visit must be a new one. A restart
// that replays the same arena is the failure this guards.
//
// Its own file because a process boots exactly one game (the modules hold the
// world), and this boot must be an unpinned one.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { playOneRun } from '../tools/headless/bot.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: null });

test('a restart starts a fresh run, not a replay', () => {
  const first = playOneRun(game, { maxSeconds: 240, every: 97 });
  assert.equal(first.died, true, 'the bot was never destroyed');

  const second = playOneRun(game, { maxSeconds: 240, every: 97 });
  assert.equal(second.died, true, 'the restart should have taken');
  assert.notEqual(second.seed, first.seed, 'an unpinned visit must pick a new seed');
  assert.notDeepEqual(second.trace, first.trace, 'the second run replayed the first');
  game.stop();
});
