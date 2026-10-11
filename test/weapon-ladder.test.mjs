// PLAN 10's weapon parity, as a check: no primary over 25% better than the others.
//
// A full ladder is five guns over a dozen seeds at a fifteen minute window, which is minutes of
// playing and so is not what is tested here. What is tested is everything the ladder is built out
// of: what a knot is worth when it can die as when it cannot, the arithmetic that turns a batch of
// runs into a standing and a standing into a verdict, the command line that has to be checked
// before anything is played, and one short real run through `rowOf` to prove the parts are wired
// to a game and not only to each other.
//
// The band itself is PLAN's and is pinned here so that nobody quietly widens it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BALANCE } from '../src/game/balance.js';
import { WEAPONS } from '../src/game/weapons.js';
import { makeEnemy } from '../src/game/kinds.js';
import { damageEnemy } from '../src/game/enemies.js';
import { scriptedRun, enemyAt } from '../tools/headless/scripted.js';
import { KNOTS, marked, revive } from '../tools/power-ladder.js';
import { bootGame } from '../tools/headless/harness.js';
import { playOneRun } from '../tools/headless/bot.js';
import {
  ALL_GUNS, BAND, gunList, readArgs, seedList, bodyHull, knotRate, knotsOf, spread,
  standingOf, standingsOf, spanOf, verdictOf, ladderTable, chippedTable, felledTable,
  rowOf, readRows, writeRows,
} from '../tools/weapon-ladder.js';

const STEP = BALANCE.sim.step;

/* ------------------------------------------------------------------ the ladder's own rules */

test('every primary the game offers is on the ladder', () => {
  assert.deepEqual(ALL_GUNS, WEAPONS.map((gun) => gun.id));
  assert.deepEqual(gunList(null), ALL_GUNS);
  assert.deepEqual(gunList('pulse, lance'), ['pulse', 'lance']);
});

test('a gun list is checked against the game, and two is the least that can be compared', () => {
  assert.throws(() => gunList('pulse,wide'), /no primary is called wide/);
  assert.throws(() => gunList('pulse'), /at least two guns/);
});

test("the band is PLAN's 25% and nothing else", () => {
  assert.equal(BAND, 1.25);
});

test('the command line is read before anything is played', () => {
  const plain = readArgs([]);
  assert.equal(plain.policy, 'aware');
  assert.deepEqual(plain.guns, ALL_GUNS);
  assert.throws(() => readArgs(['--nope']), /unknown flag/);
  assert.throws(() => readArgs(['--bot', 'blind']), /--bot wants one of/);
  assert.throws(() => readArgs(['--picks', 'hand']), /--picks wants one of/);
  assert.throws(() => readArgs(['--guns', 'nonsense']), /no primary is called/);
  assert.throws(() => readArgs(['--seconds', '0']), /window longer than none/);
  assert.throws(() => readArgs(['--play-only']), /--play-only needs --out/);
  // Pooling runs that were already played has nothing left to split, and a shard that is asked to
  // shard is a ladder that never ends.
  assert.throws(() => readArgs(['--in', '/tmp/x.jsonl', '--shards', '4']), /nothing left to shard/);
});

test('which seeds a batch plays', () => {
  const plain = seedList(readArgs([]));
  assert.equal(plain.length, 12, 'the default batch, so a plain command says what it played');
  assert.equal(plain[0], 1);
  assert.deepEqual(seedList(readArgs(['--seed', '5', '--runs', '3'])), [5, 6, 7]);
  assert.deepEqual(seedList(readArgs(['--seeds', '20-23'])), [20, 21, 22, 23]);
});

test('spread is the widest over the narrowest, and nothing that cannot divide is asked', () => {
  assert.equal(spread([4, 2, 8]), 4);
  assert.equal(spread([5]), 1);
  // A gun that killed nothing on a knot is a fact about the knot, not an infinite ratio.
  assert.equal(spread([0, 3, 3]), 1);
  assert.equal(spread([NaN, 2, 2]), 1);
});

/* ------------------------------------------------------------------------ the knots */

test('a knot body is worth what a body is worth once the ramp has spent itself', () => {
  // The number the felled column is priced with comes from the game, so the test asks the game the
  // same question the tool asks and checks the tool is not making it up (game/kinds.js scales a
  // body's hull with the clock; the ramp is over `hpScaleWindow x hpScaleMax` seconds in).
  const field = scriptedRun(3);
  const ramp = BALANCE.enemies.hpScaleWindow * BALANCE.enemies.hpScaleMax;
  field.elapsed = ramp;
  const grown = makeEnemy(field, 'swarmling', 0, 0, {}).hp;
  field.elapsed = 0;
  const fresh = makeEnemy(field, 'swarmling', 0, 0, {}).hp;

  assert.equal(bodyHull(), grown);
  assert.ok(grown > fresh, 'the ramp has to have grown the body, or the column is measuring t0');
  assert.equal(fresh, BALANCE.kinds.swarmling.hull);
});

test('a body that came apart is put back, counted once, and only then counted again', () => {
  const field = scriptedRun(7);
  const ship = field.player;
  const bodies = marked([enemyAt('swarmling', ship.x + 40, ship.y, 3),
    enemyAt('swarmling', ship.x - 40, ship.y, 3)]);

  damageEnemy(field, bodies[0], 99, true);
  assert.ok(bodies[0].hp <= 0, 'the body came apart');
  assert.equal(field.enemies.indexOf(bodies[0]), -1, 'and left the crowd on the way out');

  assert.equal(revive(field, bodies), 1);
  assert.equal(bodies[0].hp, 3, 'wound back up to what it was planted with');
  assert.ok(field.enemies.indexOf(bodies[0]) >= 0, 'and back in the crowd to be shot at again');
  assert.equal(revive(field, bodies), 0, 'a body that is standing is not a second kill');

  // And the trap that silence would hide: a dead body nobody marked remembers nothing to be wound
  // up with, and a knot of bodies at `undefined` hull measures as nothing at all.
  const stray = enemyAt('swarmling', ship.x, ship.y + 40, 1);
  stray.hp = 0;
  assert.throws(() => revive(field, [stray]), /needs marked bodies/);
});

test('the same knot is planted whether it can die or not', () => {
  // One seed: this is a shape test, not a balance reading. Both columns pin the knot in the same
  // places, so the hull a second off the immortal knot is what the mortal one loses too - the only
  // thing that changes is whether a body coming apart leaves. Six seconds because a kill is a whole
  // number and a one second window is a coin, not a rate.
  const gun = 'pulse';
  const knot = 2;
  const dead = knotRate(gun, knot, 1, 6, undefined);
  const alive = knotRate(gun, knot, 1, 6, bodyHull());
  assert.ok(dead.kills === 0, 'a knot that cannot die is never counted as dying');
  assert.ok(Math.abs(dead.hull - alive.hull) / dead.hull < 0.02,
    `the geometry drifted: ${dead.hull} against ${alive.hull}`);
  assert.ok(alive.kills > 0, 'and the mortal one does come apart');
  // Every kill paid out cost the body its own hull and nothing more: a pulse shot costs less than a
  // mid-run body is worth, so nothing is spent past what the body had to give. A little over, always
  // - a window ends with bodies part-way down, hull spent with no kill to show for it yet.
  assert.ok(Math.abs(alive.hull / alive.kills - bodyHull()) / bodyHull() < 0.15,
    `a pulse kill cost ${alive.hull / alive.kills}, not the body's ${bodyHull()}`);
});

test('the heaviest line in the game costs a body exactly what a body is worth', () => {
  // The number PLAN 10's re-price was built to land on. This row used to cost a body five hull and a
  // body is worth three (`bodyHull()`, asked of game/kinds.js), so every pull of the slowest trigger
  // in the game threw two hull away past the body it took off - and a shard, and so a level, is paid
  // per body, so the hull past a body buys nothing at all. Session 96 priced the row in bodies: a
  // pull is one body and the gun's weight is bought with pulls. The near knot is where that shows,
  // because it is one body at a time and one line a pull.
  const near = KNOTS.length - 1;
  const chipped = knotRate('lance', near, 1, 6, undefined);
  const felled = knotRate('lance', near, 1, 6, bodyHull());
  const cost = chipped.hull / felled.kills;
  assert.ok(Math.abs(cost - BALANCE.weapons.lance.damage) / BALANCE.weapons.lance.damage < 0.05,
    `a beam costs a body ${cost}, and the row says ${BALANCE.weapons.lance.damage}`);
  assert.ok(cost <= bodyHull() * 1.05,
    `a beam costs ${cost} and a body is only worth ${bodyHull()}: the row is paying over the top of`
    + ' a body again, which is the tax this column exists to show');
  // And no gun in the game pays a *multiple* of a body for one, which is the same denomination rule
  // read down the column: the five of them land in 3.00-3.25, and the quarter over a body is a shot
  // that landed part-way through a kill and not a beam twice the width of what it removed.
  for (const gun of ['pulse', 'scatter', 'arc', 'swarm']) {
    const its = knotRate(gun, near, 1, 6, bodyHull());
    const itsChipped = knotRate(gun, near, 1, 6, undefined);
    assert.ok(itsChipped.hull / its.kills <= bodyHull() * 1.1,
      `${gun} pays ${itsChipped.hull / its.kills} for a body worth ${bodyHull()}`);
  }
  // The hull that actually came off a mortal body never exceeds what the body had: overkill is
  // wasted, not banked, and the run's income is the body and not the hull.
  assert.ok(felled.hull / felled.kills <= bodyHull() + 0.01,
    `a mortal body lost ${felled.hull / felled.kills} and had ${bodyHull()}`);
});

test('a knot table has a row for every gun and one column for every knot', () => {
  const knots = knotsOf(['pulse', 'scatter'], 1, 4 * STEP);
  assert.equal(knots.length, 2);
  for (const row of knots) assert.equal(row.knots.length, KNOTS.length);
  for (const text of [chippedTable(knots), felledTable(knots)]) {
    const lines = text.split('\n').filter((line) => /^(pulse|scatter)/.test(line));
    assert.equal(lines.length, 2, text);
  }
});

/* ------------------------------------------------------------------------- the runs */

/** A row out of a batch, as `rowOf` writes it. */
function row(gun, seed, seconds, score, level, kills, damage) {
  return {
    gun, seed, seconds, died: seconds < 900, won: false,
    score, level, kills, damage,
  };
}

test('one finished run, as the ladder reads it', async () => {
  const game = await bootGame({ seed: 4 });
  const summary = playOneRun(game, { maxSeconds: 20, weapon: 'scatter' });
  game.stop();
  const seen = rowOf(summary);
  assert.equal(seen.gun, 'scatter', 'a row knows which gun ran it');
  assert.ok(seen.score > 0 && seen.kills > 0, 'the bot scored: ' + JSON.stringify(seen));
  assert.ok(seen.damage >= seen.kills, 'the run took hull off bodies as well as scoring them');
  assert.equal(seen.died, false, '20 seconds is not enough to die, and the ladder says so');
});

test('a standing is the middle of one gun’s batch', () => {
  const rows = [
    row('pulse', 1, 900, 1000, 30, 100, 3000),
    row('pulse', 2, 900, 3000, 40, 300, 3000),
    row('pulse', 3, 300, 500, 10, 50, 1500),
    row('scatter', 1, 900, 2000, 35, 200, 3000),
  ];
  const pulse = standingOf('pulse', rows, 900);
  assert.equal(pulse.runs, 3);
  assert.equal(pulse.atCap, 2, 'two runs were cut short by the window');
  assert.equal(pulse.died, 1);
  assert.equal(pulse.score, 1000, 'the middle of 500, 1000, 3000');
  assert.equal(pulse.seconds, 900);
  assert.equal(pulse.damage, (3000 / 900 + 3000 / 900 + 1500 / 300) / 3, 'hull a second, mean over the batch');
  assert.equal(standingOf('scatter', rows, 900).runs, 1);
  assert.throws(() => standingOf('arc', rows, 900), /no runs were played for arc/);
});

test('the middle of an even batch is between the two middles', () => {
  const rows = [row('pulse', 1, 900, 100, 1, 1, 10), row('pulse', 2, 900, 300, 1, 1, 10)];
  assert.equal(standingsOf(['pulse'], rows, 900)[0].score, 200);
});

test('spanOf finds the two ends of whatever column it is asked about', () => {
  const standings = standingsOf(['pulse', 'scatter'], [
    row('pulse', 1, 900, 1000, 9, 1, 1),
    row('scatter', 1, 900, 4000, 2, 1, 1),
  ], 900);
  const byScore = spanOf(standings, (one) => one.score);
  assert.equal(byScore.best, 'scatter');
  assert.equal(byScore.worst, 'pulse');
  assert.equal(byScore.ratio, 4);
  assert.equal(spanOf(standings, (one) => one.level).best, 'pulse', 'a different column, a different best');
});

test('the verdict is PLAN’s sentence: the best middle run over the worst, against 1.25', () => {
  const rows = [row('pulse', 1, 900, 1000, 10, 10, 10), row('scatter', 1, 900, 1250, 10, 10, 10)];
  const level = verdictOf(standingsOf(['pulse', 'scatter'], rows, 900));
  assert.equal(level.pass, true, level.lines.join('\n'));
  assert.equal(level.ratio, 1.25, 'exactly on the line is on it, not over it');

  const wide = verdictOf(standingsOf(['pulse', 'scatter'], [
    row('pulse', 1, 900, 1000, 10, 10, 10),
    row('scatter', 1, 900, 4000, 10, 10, 10),
  ], 900));
  assert.equal(wide.pass, false);
  assert.match(wide.lines[0], /SCATTER 4,000 over PULSE 1,000 = 4\.00x/);
  // A FAIL has to say what to do next, because the one thing not to do is buff the loser blindly.
  assert.match(wide.lines.join('\n'), /before anything is tuned/);
});

test('a gun that never died has its runs counted, not guessed', () => {
  const rows = [row('pulse', 1, 900, 100, 1, 1, 1), row('pulse', 2, 60, 20, 1, 1, 1)];
  const standing = standingOf('pulse', rows, 900);
  assert.equal(standing.atCap + standing.died, standing.runs);
});

test('the run table prints a row a gun and says what its columns mean', () => {
  const standings = standingsOf(['pulse', 'scatter'], [
    row('pulse', 1, 900, 1000, 10, 10, 10), row('scatter', 1, 900, 1200, 10, 10, 10),
  ], 900);
  const text = ladderTable(standings, { policy: 'aware', picks: 'wise', seconds: 900 });
  assert.equal(text.split('\n').filter((line) => /^(pulse|scatter)/.test(line)).length, 2);
  assert.match(text, /vs best/);
  assert.match(text, /0\.83x/, 'the worse gun is measured against the better one');
});

test('rows survive the round trip through --out and --in', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ladder-'));
  const file = path.join(dir, 'rows.jsonl');
  const rows = [row('pulse', 1, 900, 1000, 10, 10, 10), row('lance', 1, 100, 10, 1, 1, 1)];
  writeRows(file, rows);
  assert.ok(existsSync(file));
  assert.deepEqual(readRows([file]), rows);
  assert.throws(() => readRows([path.join(dir, 'nope.jsonl')]), /no such file/);
  rmSync(dir, { recursive: true, force: true });
});
