// Nobody pinned a seed, so every run in the visit must be a new one. A restart
// that replays the same arena is the failure this guards.
//
// Its own file because a process boots exactly one game (the modules hold the
// world), and this boot must be an unpinned one.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { playOneRun, FRAME_MS } from '../tools/headless/bot.js';
import { makeEnemy } from '../src/game/kinds.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: null });

/** How long the two runs are allowed to be played for before they are ended on purpose. */
const RUN_SECONDS = 120;

/**
 * From `RUN_SECONDS` in, hold the ship to one hull with no grace and put a body on it,
 * every frame until it stops: the way test/session.test.mjs ends a run.
 *
 * The runs here are ended rather than waited out because the bot dodges well and an
 * unpinned seed is a different seed every time the suite runs, so no window a test can
 * afford is a promise that a run is over inside it - one of them went the full fifteen
 * minutes and the file failed for the wrong reason. What this file proves is that a
 * restart takes and the next run is new, and that needs two finished runs, not two
 * accidents.
 */
function finishItWhenDue(game, frames) {
  if (frames * FRAME_MS < RUN_SECONDS * 1000) return;
  const ship = game.player;
  ship.hull = 1;
  ship.invuln = 0;
  ship.fireTimer = 5;           // no shot, or it kills the body planted on it
  game.enemies.push(makeEnemy(game.world, 'drifter', ship.x, ship.y, {
    hp: 1, speed: 0, drop: 0, score: 0,
  }));
}

test('a restart starts a fresh run, not a replay', () => {
  const options = { maxSeconds: 4 * RUN_SECONDS, every: 97, onFrame: finishItWhenDue };

  const first = playOneRun(game, options);
  assert.equal(first.died, true, 'the first run was never finished');
  assert.ok(first.seconds >= RUN_SECONDS,
    'the run was expected to be played a while before it was ended: ' + first.seconds + ' s');

  const second = playOneRun(game, options);
  assert.equal(second.died, true, 'the restart should have taken');
  assert.notEqual(second.seed, first.seed, 'an unpinned visit must pick a new seed');
  assert.notDeepEqual(second.trace, first.trace, 'the second run replayed the first');
  game.stop();
});
