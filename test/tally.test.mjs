// The run's own record of what it was made of (game/tally.js), which is what
// `tools/balance-report.js` prints its tables from.
//
// Four groups of promises:
//
//   what counts as an arrival - a body the *world* sent, and not one a test or the
//   title screen's crowd built by hand;
//   what counts as a killing - only the player's, and only those are timed, in the
//   whole-life and the-time-under-fire columns;
//   what a hull costs - who is blamed for it, and which of them finished the run;
//   and what none of it costs: memory (the histograms are the same size whatever the
//   run did) and the run itself (counting spends no number out of the logic stream).
//
// Everything here runs on the scripted world (tools/headless/scripted.js), where a
// body can be stood exactly where the test needs it and one step is one step.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { BALANCE } from '../src/game/balance.js';
import { logic, setSeed } from '../src/core/rng.js';
import { damageEnemy, killEnemy } from '../src/game/enemies.js';
import { spawnEnemy } from '../src/game/waves.js';
import { enemyShotAt } from '../src/game/enemyshots.js';
import { hitPlayer } from '../src/game/player.js';
import { shotsPerSecond } from '../src/game/weapons.js';
import { hurtByBody, hurtByBlast, hurtByShot } from '../src/game/tally.js';
import { scriptedRun, stepTheWorld, enemyAt } from '../tools/headless/scripted.js';
import { bootGame } from '../tools/headless/harness.js';
import { playOneRun } from '../tools/headless/bot.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const STEP = BALANCE.sim.step;
const SPIT = BALANCE.kinds.spitter.spit;

/** Hold the world still for `n` of its own steps. */
function steps(n) {
  for (let i = 0; i < n; i++) stepTheWorld({});
}

const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, what || (a + ' is not ' + b));

/** A body with more hull than the test is going to take off it. */
function toughAt(field, type, x, y) {
  return enemyAt(type, x, y, 5000);
}

// --- arrivals -----------------------------------------------------------------

test('a fresh run has nothing on the sheet', () => {
  const field = scriptedRun(1);
  assert.equal(field.tally.arrived, 0);
  assert.equal(field.tally.killed, 0);
  assert.equal(field.tally.hullLost, 0);
  assert.deepEqual(field.tally.kinds, {});
  assert.equal(field.tally.killedBy, '');
});

test('a body the director sends is an arrival, and the first one is the kind\'s minute', () => {
  const field = scriptedRun(2);
  field.elapsed = 100;

  const first = spawnEnemy(field, 'drifter', 0);
  assert.ok(first, 'the director found somewhere to put it');
  const row = field.tally.kinds.drifter;
  assert.equal(row.arrived, 1);
  assert.equal(row.firstAt, 100, 'and it is written down as the minute the kind turned up');
  assert.equal(first.born, 100, 'the body knows when it arrived');

  field.elapsed = 140;
  spawnEnemy(field, 'drifter', 0);
  assert.equal(row.arrived, 2);
  assert.equal(row.firstAt, 100, 'the second one does not move the first minute');
});

test('a body somebody planted by hand is not an arrival', () => {
  const field = scriptedRun(3);
  const planted = enemyAt('drifter', 800, 500);

  assert.equal(field.tally.arrived, 0, 'nobody saw it come');
  assert.equal(planted.born, -1);

  killEnemy(field, planted, true);
  assert.equal(field.tally.killed, 1, 'but it still died');
  const row = field.tally.kinds.drifter;
  assert.equal(row.arrived, 0);
  assert.equal(row.lifeSamples, 0, 'a life nobody watched is not a life in the table');
});

test('a tank coming apart is two arrivals', () => {
  const field = scriptedRun(4);
  const tank = enemyAt('tank', 900, 500);
  spawnEnemy(field, 'drifter', 0);
  const before = field.tally.arrived;

  killEnemy(field, tank, true);
  assert.equal(field.enemies.length, 2 + 1, 'two hatchlings, and the drifter that was already there');
  assert.equal(field.tally.arrived, before + 2, 'both of them arrived');
  assert.equal(field.tally.kinds.drifter.arrived, 3, 'as drifters, which is what they are');
});

test('a gold body counts as its kind and as gold', () => {
  const field = scriptedRun(5);
  const gold = spawnEnemy(field, 'drifter', 0, true);

  assert.ok(gold.elite);
  assert.equal(field.tally.eliteArrived, 1);
  assert.equal(field.tally.kinds.drifter.eliteArrived, 1);
  assert.equal(field.tally.kinds.drifter.arrived, 1, 'and not twice over');
});

// --- dying --------------------------------------------------------------------

test('a hit is damage on the kind and a stamp on the body', () => {
  const field = scriptedRun(6);
  const foe = toughAt(field, 'tank', 900, 500);

  field.elapsed = 50;
  damageEnemy(field, foe, 3, true);
  const row = field.tally.kinds.tank;
  assert.equal(row.hits, 1);
  assert.equal(row.damage, 3);
  assert.equal(foe.firstHit, 50);
  near(foe.fired, 0);

  steps(4);
  damageEnemy(field, foe, 3, true);
  assert.equal(row.hits, 2);
  assert.equal(row.damage, 6);
  assert.equal(foe.firstHit, 50, 'the first wound stays the first wound');
});

test('a stretch of fire is one stretch, and a gap in it ends it', () => {
  const field = scriptedRun(7);
  const foe = toughAt(field, 'drifter', 900, 500);
  const volley = BALANCE.tally.volley / shotsPerSecond(field);

  damageEnemy(field, foe, 1, true);
  steps(3);
  damageEnemy(field, foe, 1, true);
  near(foe.fired, 3 * STEP, 'three steps of steady shooting');

  steps(Math.ceil(volley / STEP) + 1);
  damageEnemy(field, foe, 1, true);
  near(foe.fired, 3 * STEP, 'after a gap the shooting starts counting again from nothing');

  killEnemy(field, foe, true);
  const row = field.tally.kinds.drifter;
  assert.equal(row.fireSamples, 1);
  near(row.fireSum, 3 * STEP);
  assert.equal(row.shotsOnKilled, 3, 'three shots landed on the body that died');
  assert.equal(row.hits, 3, 'and all of them are on the kind as well');
});

test('a body that was never shot at never spent any time under fire', () => {
  const field = scriptedRun(8);
  const foe = enemyAt('drifter', 900, 500);
  spawnEnemy(field, 'drifter', 0);
  const walked = field.enemies[field.enemies.length - 1];

  killEnemy(field, walked, true);
  const row = field.tally.kinds.drifter;
  assert.equal(row.killed, 1);
  assert.equal(row.fireSamples, 0, 'nothing was fired at it');
  assert.equal(row.fireSum, 0);
  assert.equal(row.lifeSamples, 1, 'but it was alive all the same');
  assert.equal(foe.firstHit, -1, 'the hand-planted one is still nobody\'s arrival');
});

test('only what the player brings down is timed', () => {
  const field = scriptedRun(9);
  spawnEnemy(field, 'tank', 0);
  const tank = field.enemies[field.enemies.length - 1];

  steps(10);
  killEnemy(field, tank, false);

  const row = field.tally.kinds.tank;
  assert.equal(row.arrived, 1);
  assert.equal(row.killed, 0);
  assert.equal(row.lost, 1, 'came apart some other way');
  assert.equal(row.lifeSamples, 0, 'and is in no time table');
  assert.equal(field.tally.killed, 0);
});

test('the histograms are as wide as they are whatever the run did', () => {
  const field = scriptedRun(10);
  const spec = BALANCE.tally;
  field.elapsed = 600;
  const ancient = enemyAt('drifter', 900, 500);
  ancient.born = field.elapsed - spec.life.bucket * spec.life.buckets - 30;

  killEnemy(field, ancient, true);
  const row = field.tally.kinds.drifter;

  assert.equal(row.lifeHist.length, spec.life.buckets, 'and no longer for a long life');
  assert.equal(row.fireHist.length, spec.fire.buckets);
  assert.equal(row.lifeHist[spec.life.buckets - 1], 1, 'the overflow step caught it');
  assert.ok(row.lifeMax > spec.life.bucket * spec.life.buckets, 'and the maximum says how far past it went');
});

// --- what hurt the ship -------------------------------------------------------

test('a body that touches the ship is blamed by name', () => {
  const field = scriptedRun(11);
  const foe = enemyAt('darter', 900, 500);
  field.player.hull = 3;

  hitPlayer(field, hurtByBody(foe));
  assert.equal(field.tally.hullLost, 1);
  assert.deepEqual(field.tally.hurtBy, { 'body:darter': 1 });
  assert.equal(foe.flash, BALANCE.enemies.hitFlashShove, 'and it is flashed for the trouble');
  assert.equal(field.tally.killedBy, '', 'two hulls left, so the run goes on');

  hitPlayer(field, hurtByBody(foe));
  hitPlayer(field, hurtByBody(foe));
  assert.equal(field.tally.hullLost, 3, 'and the third one put the ship down');
  assert.equal(field.tally.hurtBy['body:darter'], 3);
  assert.equal(field.tally.killedBy, 'body:darter', 'the last one is what the run died of');
});

test('a body that walks into the ship is named on the sheet', () => {
  // The same blame as `hurtByBody` above, but read off the crowd's own contact test
  // rather than handed to `hitPlayer` by the test: this is the path a real run takes.
  const field = scriptedRun(14);
  field.player.hull = 3;
  field.player.invuln = 0;
  enemyAt('drifter', field.player.x, field.player.y);

  steps(1);
  assert.equal(field.player.hull, 2, 'one touch, one hull');
  assert.deepEqual(field.tally.hurtBy, { 'body:drifter': 1 });
});

test('a shot blames the kind that fired it, and a blast blames nobody', () => {
  const field = scriptedRun(12);
  field.player.hull = 3;
  field.player.invuln = 0;

  enemyShotAt(field, field.player.x - 20, field.player.y, 1, 0, SPIT.shot, 'spitter');
  steps(6);
  assert.equal(field.tally.hurtBy['shot:spitter'], 1, 'the spit remembers whose mouth it came out of');

  field.player.invuln = 0;
  hitPlayer(field, hurtByBlast());
  assert.equal(field.tally.hurtBy.blast, 1);
  assert.equal(field.tally.hurtBy['blast:'], undefined, 'a blast is a blast, not somebody\'s');
  assert.equal(field.tally.hullLost, 2);
});

test('a shot that nobody claims is still counted', () => {
  const field = scriptedRun(13);
  field.player.hull = 1;
  field.player.invuln = 0;

  hitPlayer(field, hurtByShot({ from: '' }));
  assert.deepEqual(field.tally.hurtBy, { shot: 1 });
  assert.equal(field.tally.killedBy, 'shot');
});

// --- what it costs ------------------------------------------------------------

test('counting spends no number out of the run\'s own stream', () => {
  setSeed(77);
  const untouched = logic.next();

  const field = scriptedRun(77);
  spawnEnemy(field, 'drifter', 0);
  spawnEnemy(field, 'tank', 0);
  const foe = field.enemies[field.enemies.length - 1];
  damageEnemy(field, foe, 1, true);
  steps(4);
  killEnemy(field, foe, true);
  hitPlayer(field, hurtByBlast());

  setSeed(77);
  assert.equal(logic.next(), untouched, 'the same seed draws the same number afterwards');
});

test('a whole run\'s kills are the tally\'s kills', async () => {
  // The one place the two sources of the same fact are put next to each other: the
  // game's own counter and the tally's, over a real run played by the bot. The
  // report's tables are only worth reading while these two agree.
  const game = await bootGame({ root: ROOT, seed: 61 });
  const run = playOneRun(game, { maxSeconds: 120 });
  const tally = run.tally;

  assert.equal(tally.killed, run.stats.kills, 'every kill is on the sheet');
  let fromRows = 0;
  let fromArrivals = 0;
  for (const row of Object.values(tally.kinds)) {
    fromRows += row.killed;
    fromArrivals += row.arrived;
  }
  assert.equal(fromRows, tally.killed, 'and the kind rows add up to the same story');
  assert.ok(fromArrivals >= tally.killed, 'nobody can be killed before arriving');

  for (const [type, row] of Object.entries(tally.kinds)) {
    assert.ok(row.firstAt >= BALANCE.kinds[type].from, type + ' arrived before it unlocked');
  }

  assert.equal(tally.killedBy !== '', run.died, 'and the sheet knows how the run ended');
  game.stop();
});
