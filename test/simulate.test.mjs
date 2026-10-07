// The headless simulation: a whole run, played by the simple bot, and the
// promise that a seed replays exactly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { playRun } from '../tools/headless/bot.js';

const ROOT = path.resolve(import.meta.dirname, '..');

function simulate(args) {
  return execFileSync(process.execPath, [path.join(ROOT, 'tools', 'simulate.js'), ...args],
    { cwd: ROOT, encoding: 'utf8' });
}

test('a whole run plays out with no browser', async () => {
  const run = await playRun({ seed: 11, maxSeconds: 240 });

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
  // The window is longer than the simple bot survives (a little over 1m20s on
  // average), because the run has to end for the fingerprint to mean much.
  const args = ['--trace', '--seconds', '240', '--seed', '31'];
  const first = simulate(args);
  const second = simulate(args);
  const other = simulate(['--trace', '--seconds', '240', '--seed', '32']);

  assert.match(first, /died/);
  assert.equal(first, second, 'the same seed must replay the same run');
  assert.notEqual(first, other, 'a different seed must give a different run');
});
