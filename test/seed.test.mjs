// Where a run's seed comes from and what it guarantees: the address bar can fix
// it, and a seed plays the same run however many times it is played.
//
// This lives in its own file because a process boots exactly one game (the
// modules hold the world), and both tests below continue that one session.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { playOneRun, endingItAt } from '../tools/headless/bot.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: null, url: '?seed=4031' });

/** How long a run is played for before it is ended on purpose. */
const RUN_SECONDS = 150;

/**
 * Play one run, keeping a fingerprint of the state along the way, and end it when it is
 * due. What is being proved is that a run replays, so the run has to be long enough to
 * fingerprint and it cannot be left to chance: a bot with the upgrade lines behind it
 * will outlast any window a test can wait out (see `endingItAt`), so the finish is
 * arranged rather than hoped for.
 */
async function play(seed) {
  if (seed !== undefined) await game.resetToTitle(seed);
  return playOneRun(game, {
    maxSeconds: 4 * RUN_SECONDS,
    every: 97,
    onFrame: endingItAt(RUN_SECONDS),
  });
}

let first = null;

test('a seed in the address bar fixes the run', async () => {
  assert.equal(game.world.seed, 4031, 'the game read ?seed= off the address bar');
  assert.equal(game.stats().seed, 4031);

  first = await play();
  assert.equal(first.died, true, 'the bot was never destroyed');
  assert.equal(first.seed, 4031);
  assert.ok(first.trace.length > 3, 'the run was long enough to fingerprint');
  assert.match(first.screen.stats, /SEED 4031/);
});

test('the same seed plays the same run, and a different one does not', async () => {
  const again = await play(4031);
  assert.deepEqual(again.trace, first.trace, 'the same seed must replay the same run');
  assert.equal(again.stats.score, first.stats.score);

  const other = await play(4032);
  assert.notDeepEqual(other.trace, first.trace, 'a different seed must not replay it');
  game.stop();
});
