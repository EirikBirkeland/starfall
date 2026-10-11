// The headless simulation: a whole run, played by the bot, and the promise that a
// seed replays exactly.
//
// The runs that need to *end* arrange their own ending (tools/headless/bot.js,
// `endingItAt`) rather than waiting for a death: a bot with the upgrade lines behind it
// outlasts any window a test can afford, and a test that waits for a death it will not
// get has stopped measuring something (NOTES, session 28). `--bot naive` is measured
// here too, for two reasons - it is the baseline the older notes in NOTES.md were taken
// against, and the difference between the two players is the whole point of having two.
//
// One boot for the whole file, because the modules hold the world: a process plays
// one game, and `resetToTitle` is what puts another run up. The command-line checks
// spawn their own processes and are unaffected by that rule.
//
// The bottom of the file is the batch - the middle run of a set of them, which is the
// number PLAN's survival check is written against. It is measured on numbers the test
// made up, because a batch of real runs is not something a test can wait for.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { playOneRun, endingItAt } from '../tools/headless/bot.js';
import { median, aggregate, batchLine, batchStatsLine, reportLine, patternsLine } from '../tools/simulate.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SIMULATE = path.join(ROOT, 'tools', 'simulate.js');
const game = await bootGame({ root: ROOT, seed: 11 });

function simulate(args) {
  return execFileSync(process.execPath, [SIMULATE, ...args], { cwd: ROOT, encoding: 'utf8' });
}

/** The same, but keeping the exit status instead of throwing on a non-zero one. */
function runTool(args) {
  const done = spawnSync(process.execPath, [SIMULATE, ...args], { cwd: ROOT, encoding: 'utf8' });
  return { status: done.status, out: done.stdout, err: done.stderr };
}

/** One run on this boot, from a title screen that has never seen a frame. */
async function play(seed, options) {
  await game.resetToTitle(seed);
  return playOneRun(game, options);
}

test('a whole run plays out with no browser', async () => {
  // Killed off at 2:30 on purpose: everything below is about what a finished run leaves
  // behind, and the bot is no longer a player a test can wait out.
  const run = await play(11, { maxSeconds: 900, onFrame: endingItAt(150) });

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

test('the sound cannot move a run', () => {
  // The promise the noise buffer would break if it drew its grain off the seeded stream
  // (audio/noise.js, and the rule test/structure.test.mjs watches): a run played where you
  // can hear it is the same run, trace for trace, as one played in the dark. Two more
  // processes, for the one thing that cannot be checked from a single boot.
  const args = ['--trace', '--seconds', '120', '--seed', '41'];
  const dark = simulate(args);
  const loud = simulate(args.concat('--audio'));

  assert.match(loud, /mix: [\d,]+ voices asked/, 'the loud one had an audio device and used it');
  assert.match(loud, /of them drums and \d+ the tune \| \w+ \d+m\d+s/, 'and it names the patterns it played');
  assert.equal(dark, loud.replace(/^mix: .*\n/m, ''), 'hearing the game changed the game');
});

test('the intensity curve is a line a run can be read from', () => {
  // What the mix line's second half is made of (audio/music.js keeps the seconds, one per
  // pattern). A run that never reached two minutes has no `driving` in here and a run that
  // never met a boss has no `boss`, which is the point of printing it at all.
  assert.equal(patternsLine({}), 'silent');
  assert.equal(patternsLine({ title: 4.4, run: 130.2, boss: 62 }),
    'title 0m04s, run 2m10s, boss 1m02s');
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

/** A finished run, as small as a test can make it and still be one. */
function runOf(seconds, score, level, kills, died, won) {
  return {
    policy: 'aware',
    seconds: seconds,
    died: died,
    won: won === true,
    stats: {
      ship: 'wisp', weapon: 'pulse', score: score, level: level, kills: kills,
      // The run line names the fight that was standing when it stopped, and what ended it if it
      // ended (tools/simulate.js `reportLine`), so even a fixture this small has to be able to
      // answer both - empty on most of these, and a shape away from a lie.
      boss: '', bossCells: 0, bossCores: 0, bossesDown: 0,
      killedBy: died ? 'body:drifter' : '',
      ranks: {},
    },
  };
}

// One wreck, one middling run, one that outlasted the window: every column a batch
// reports has a different answer in these three.
const BATCH = [runOf(60, 100, 2, 10, true), runOf(300, 300, 5, 40, true), runOf(900, 900, 9, 90, false)];

test('the median is the middle run, not the average of them', () => {
  assert.equal(median([5]), 5);
  assert.equal(median([5, 1, 3]), 3, 'sorted first, then the middle one');
  assert.equal(median([4, 1, 3, 2]), 2.5, 'an even batch has nobody exactly in the middle');
  assert.ok(Number.isNaN(median([])), 'an empty batch has no middle at all');

  // The whole point of the number: two wrecks at the bottom of a batch of six drag the
  // mean down to the floor and leave the middle standing.
  const six = [900, 900, 900, 900, 30, 45];
  assert.equal(median(six), 900);
  assert.ok(median(six) > six.reduce((sum, value) => sum + value, 0) / six.length);
});

test('a batch is its middle, its mean, and how much of it was cut short', () => {
  const batch = aggregate(BATCH, 900);
  assert.equal(batch.runs, 3);
  assert.equal(batch.policy, 'aware');
  assert.equal(batch.weapon, 'pulse');
  assert.equal(batch.atCap, 1, 'one of the three was still flying when the window shut');
  assert.equal(batch.seconds.median, 300);
  assert.equal(batch.seconds.mean, 420);
  assert.equal(batch.seconds.worst, 60, 'the seed that went wrong early is printed too');
  assert.equal(batch.score.median, 300);
  assert.equal(batch.kills.median, 40);
});

test('the batch line names the middle run and the ship it was flown on', () => {
  const line = batchLine(aggregate(BATCH, 900));
  assert.match(line, /^batch of 3 runs, aware bot, ship wisp, gun pulse:/);
  assert.match(line, /median 5m00s, mean 7m00s, worst 1m00s/);
  assert.match(line, /1\/3 still flying at the 15m00s cap/);

  const stats = batchStatsLine(aggregate(BATCH, 900));
  assert.match(stats, /score median 300 mean 433\.3/);
  assert.match(stats, /level median 5 mean 5\.3/);
  assert.match(stats, /kills median 40 mean 46\.7/);
});

test('a run line names which of the three endings it was', () => {
  const wreck = reportLine(runOf(60, 100, 2, 10, true));
  assert.match(wreck, /died/);
  assert.match(wreck, /killed by body:drifter/, 'and what it ended of');

  assert.match(reportLine(runOf(900, 900, 9, 90, false)), /alive at the cap/);

  const won = reportLine(runOf(900, 900, 9, 90, false, true));
  assert.match(won, /WON/);
  assert.equal(won.includes('killed by'), false, 'a win was not killed by anything');
});

test('a win is an ending in the batch and not a survival', () => {
  const one = aggregate([runOf(60, 100, 2, 10, true), runOf(900, 900, 9, 90, false, true)], 900);
  assert.equal(one.wins, 1);
  assert.match(batchLine(one), /1 won/);
  // A batch with no win in it must not say there was one: that is the difference between a zero
  // and a number nobody looked at.
  assert.equal(batchLine(aggregate(BATCH, 900)).includes('won'), false);
});

test('a batch of runs prints its middle after the runs', () => {
  const out = simulate(['--runs', '3', '--seconds', '45', '--seed', '71']);
  assert.equal(out.trim().split('\n').filter((line) => line.startsWith('seed ')).length, 3);
  assert.match(out, /^batch of 3 runs, aware bot, ship wisp, gun pulse: median/m);
  assert.match(out, /^ {2}score median /m);
});

test('--need makes the survival check an exit code', () => {
  const under = runTool(['--runs', '2', '--seconds', '60', '--seed', '71', '--need', '90']);
  assert.equal(under.status, 1, 'a batch that mediates a minute does not clear a minute and a half');
  assert.match(under.out, /survival check: the median run lasted 1m00s against the 1m30s it needs - FAIL/);

  const over = runTool(['--runs', '2', '--seconds', '60', '--seed', '71', '--need', '30']);
  assert.equal(over.status, 0);
  assert.match(over.out, /against the 0m30s it needs - pass/);

  const lonely = runTool(['--need', '30']);
  assert.equal(lonely.status, 2, 'one run is its own median and proves nothing');
  assert.match(lonely.err, /--need wants a batch/);
});

test('--runs wants at least one run', () => {
  const none = runTool(['--runs', '0']);
  assert.equal(none.status, 2);
  assert.match(none.err, /--runs wants at least one run/);
});
