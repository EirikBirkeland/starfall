// The headless simulation: a whole run, played by the bot, and the promise that a
// seed replays exactly.
//
// The windows here are roomy because the default bot dodges, and so outlives the
// plain one that played these tests first: about six minutes to two. `--bot naive`
// is measured here too, for two reasons - it is the baseline the older notes in
// NOTES.md were taken against, and the difference between the two players is the
// whole point of having two.
//
// One boot for the whole file, because the modules hold the world: a process plays
// one game, and `resetToTitle` is what puts another run up. The command-line checks
// spawn their own processes and are unaffected by that rule.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { playOneRun } from '../tools/headless/bot.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 11 });

function simulate(args) {
  return execFileSync(process.execPath, [path.join(ROOT, 'tools', 'simulate.js'), ...args],
    { cwd: ROOT, encoding: 'utf8' });
}

/** One run on this boot, from a title screen that has never seen a frame. */
async function play(seed, options) {
  await game.resetToTitle(seed);
  return playOneRun(game, options);
}

test('a whole run plays out with no browser', async () => {
  const run = await play(11, { maxSeconds: 900 });

  assert.equal(run.died, true, 'the bot was never destroyed in ' + run.seconds + 's');
  assert.ok(run.seconds > 15, 'the bot should survive a while, got ' + run.seconds + 's');
  assert.ok(run.stats.score > 100, 'score: ' + run.stats.score);
  assert.ok(run.stats.kills > 10, 'kills: ' + run.stats.kills);
  assert.ok(run.stats.level >= 2, 'level: ' + run.stats.level);
  assert.ok(run.stats.collected > 10, 'shards: ' + run.stats.collected);
  assert.equal(run.stats.state, 2);
  assert.equal(run.stats.hull, 0);

  assert.ok(run.drawCalls.fills > 1000, 'the renderer should have painted: ' + JSON.stringify(run.drawCalls));
  assert.equal(run.screen.startHidden, true);
  assert.equal(run.screen.overHidden, false);
  assert.match(run.screen.stats, /KILLS/);
  assert.match(run.screen.stats, /SHARDS/);
  assert.equal(run.screen.finalScore, run.stats.score.toLocaleString('en-US'));
  assert.equal(run.storage['starfall.best'], String(run.stats.score));
});

test('tools/simulate.js runs clean and repeats itself exactly', () => {
  // A window shorter than the bot survives: the promise here is that the same seed
  // is the same run, and a run still flying when the window shuts is just as good a
  // witness to that as one that ended.
  const args = ['--trace', '--seconds', '240', '--seed', '31'];
  const first = simulate(args);
  const second = simulate(args);
  const other = simulate(['--trace', '--seconds', '240', '--seed', '32']);

  assert.match(first, /score [1-9]/, 'the bot scored, so the fingerprint is not empty: ' + first);
  assert.match(first, /trace [0-9]+:/, 'and the trace was printed');
  assert.equal(first, second, 'the same seed must replay the same run');
  assert.notEqual(first, other, 'a different seed must give a different run');
});

test('the bot that dodges outlives the bot that does not', async () => {
  const seeds = [1, 2, 3];
  const aware = [];
  const naive = [];
  for (const seed of seeds) aware.push(await play(seed, { maxSeconds: 600, policy: 'aware' }));
  for (const seed of seeds) naive.push(await play(seed, { maxSeconds: 600, policy: 'naive' }));
  const seconds = (runs) => runs.reduce((sum, run) => sum + run.seconds, 0);

  assert.ok(seconds(aware) > seconds(naive),
    'dodging bought nothing: ' + Math.round(seconds(aware)) + ' s against '
    + Math.round(seconds(naive)) + ' s over the same seeds');
  assert.ok(naive.every((run) => run.died),
    'the plain bot is meant to die inside this window; if it stops dying, this '
    + 'comparison has stopped measuring anything');
});

test('--bot picks which player sits down at the keyboard', () => {
  assert.match(simulate(['--seconds', '40', '--seed', '5', '--bot', 'naive']), /^seed 5  naive  /);

  let rejected = null;
  try {
    simulate(['--bot', 'nonsense']);
  } catch (error) {
    rejected = error;
  }
  assert.ok(rejected, 'a player name nobody defined must not be accepted');
  assert.equal(rejected.status, 2);
  assert.match(String(rejected.stderr), /--bot wants one of/);
});
