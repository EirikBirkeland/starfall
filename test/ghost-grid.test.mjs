// The ruler that reads the afterimage off the crowd (tools/ghost-grid.js).
//
// The card's whole effect is on where the crowd is walking, and the number that decides that is
// `BALANCE.upgrades.afterimage.bait`: a body standing inside it of a ghost chases the ghost instead
// of the ship. Session 42 chose 110 px from three radii read on the dash habit of the time, and
// session 114 replaced that habit with one that presses a quarter as often and drops its images
// behind a fleeing ship instead of inside the crowd - so the instrument that produced the number
// changed under it. `tools/ghost-grid.js` is the re-read, and this file is what keeps it honest:
//
//   the reading itself - what counts as near, what counts as fooled, and what does not count at all
//     (a rooted body cannot be diverted, and a body three screens away never could);
//   the three promises the radius has to keep - a first rank that is felt, a fifth that is a
//     different crowd, and a ceiling past which the crowd stops coming at all - each one falsified
//     here with the very figures session 42 wrote down when it made them;
//   the one claim about the instrument rather than the card: a wider disc that fools fewer bodies
//     has measured the crowd and not the radius;
//   and the command line: what is refused before any run is played, and the guard biting on a batch
//     that measured nothing.
//
// What is *not* here is whether the card is worth a level - `test/afterimage.test.mjs` holds the
// behaviour and `tools/line-ab.js --line afterimage --dash` prices the deck. This file holds the
// ruler and the promises about the radius.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { BALANCE } from '../src/game/balance.js';
import { scriptedRun, enemyAt } from '../tools/headless/scripted.js';
import {
  readFrame, newSheet, reportOf, verdictOf, gridTable, NEAR, FLOOR, CEILING, SLOPE, LINE,
} from '../tools/ghost-grid.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'ghost-grid.js');
const AI = BALANCE.upgrades[LINE];
const BAIT = AI.bait;
const LAST = AI.ranks;

function ghostGrid(args) {
  return spawnSync(process.execPath, [TOOL, ...args], { cwd: ROOT, encoding: 'utf8' });
}

/** Put a ghost standing at a place, the way a dash would leave one. */
function ghostAt(field, x, y) {
  const image = field.afterimage.trail.spawn();
  image.x = x;
  image.y = y;
  image.angle = 0;
  image.age = 0;
  return image;
}

/** A world with the ship parked at the origin of its own arena and nothing else in it. */
function quietWorld() {
  const field = scriptedRun(7);
  field.enemies.length = 0;
  field.afterimage.trail.clear();
  field.player.x = field.field.x0 + 900;
  field.player.y = field.field.y0 + 900;
  field.xpNeed = Infinity;
  return field;
}

test('a frame with no ghost standing is counted and not measured', () => {
  const field = quietWorld();
  enemyAt('drifter', field.player.x + 20, field.player.y);
  const sheet = newSheet();
  readFrame(field, sheet);
  assert.equal(sheet.frames, 1);
  assert.equal(sheet.lit, 0, 'nothing stood, so there was no frame to measure');
  assert.equal(sheet.nearWalk, 0);
  assert.equal(sheet.fooledWalk, 0);
});

test('a body inside a ghost reach is read as fooled and one outside it is not', () => {
  const field = quietWorld();
  const ship = field.player;
  ghostAt(field, ship.x + 60, ship.y);
  const taken = enemyAt('drifter', ship.x + 70, ship.y);            // 10 px from the ghost
  const honest = enemyAt('drifter', ship.x + BAIT + 60, ship.y);    // out of its reach, in the ring
  const sheet = newSheet();
  readFrame(field, sheet);
  assert.equal(sheet.nearWalk, 2, 'both bodies are inside the ' + NEAR + ' px ring');
  assert.equal(sheet.fooledWalk, 1);
  assert.ok(taken.x < honest.x);
  assert.equal(sheet.peak, 1);
  assert.equal(sheet.litWithFooled, 1);
  assert.equal(reportOf(sheet, BAIT, 1, 1).divertWalk, 0.5, 'half the near crowd, not half the arena');
});

test('a body outside the near ring is nobody', () => {
  const field = quietWorld();
  const ship = field.player;
  ghostAt(field, ship.x + 40, ship.y);
  // A ghost out in the field with a crowd around it, and the ship nowhere near either: whatever
  // that crowd is chasing has nothing to do with the ship being chased.
  enemyAt('drifter', ship.x + 300, ship.y);
  const sheet = newSheet();
  readFrame(field, sheet);
  assert.equal(sheet.nearAll, 0);
  assert.equal(sheet.fooledAll, 0);
  assert.equal(sheet.peak, 0);
});

test('a rooted body is not in the share of what got diverted', () => {
  const field = quietWorld();
  const ship = field.player;
  ghostAt(field, ship.x + 40, ship.y);
  enemyAt('sniper', ship.x + 45, ship.y);       // bolted to the floor: it cannot walk at anything
  const sheet = newSheet();
  readFrame(field, sheet);
  assert.equal(sheet.nearAll, 1, 'it is in the ring, and in the figure session 42 printed');
  assert.equal(sheet.nearWalk, 0, 'but it is not a body the card could turn aside');
  const row = reportOf(sheet, BAIT, 1, 1);
  assert.equal(row.divertAll, 1);
  assert.equal(row.divertWalk, 0, 'a share of nothing diverted is nothing diverted, not everything');
});

test('reportOf divides by what was lit, and by nothing when nothing was', () => {
  const sheet = newSheet();
  sheet.frames = 100;
  sheet.lit = 20;
  sheet.nearWalk = 60;
  sheet.fooledWalk = 15;
  sheet.images = 40;
  sheet.litWithFooled = 10;
  const row = reportOf(sheet, BAIT, 3, 4);
  assert.equal(row.litFrames, 20);
  assert.equal(row.nearWalk, 3);
  assert.equal(row.divertWalk, 0.25);
  assert.equal(row.anyShare, 0.5);
  assert.equal(row.images, 2);
  const empty = reportOf(newSheet(), BAIT, 3, 4);
  assert.equal(empty.divertWalk, 0);
  assert.ok(Number.isFinite(empty.nearWalk) && Number.isFinite(empty.perFrame), 'no NaN from an empty cell');
});

// ---------------------------------------------------------------------------------------------
// The three promises, falsified with the figures that made them.
//
// Session 42's grid, verbatim: the share of the near crowd diverted at each of the three radii it
// tried, at rank 1 and at rank 5. Those three numbers are the whole argument for 110 px, so they
// are what the verdict is tested against: it must agree with the session, or it is not measuring
// the thing that session decided.
// ---------------------------------------------------------------------------------------------

/** One cell of a grid, with everything the verdict does not look at set to a healthy value. */
function cell(bait, rank, divert, litFrames) {
  return {
    bait, rank, frames: 18000, litFrames: litFrames === undefined ? 3000 : litFrames,
    nearWalk: 2, nearAll: 2, divertWalk: divert, divertAll: divert,
    anyShare: 0.5, perFrame: 1, images: rank, peak: rank, dashes: 4,
  };
}

const SESSION_42 = [
  cell(72, 1, 0.020), cell(72, LAST, 0.134),
  cell(110, 1, 0.064), cell(110, LAST, 0.302),
  cell(150, 1, 0.175), cell(150, LAST, 0.438),
];
const GRID_OPTS = { habit: 'escape', trigger: null, baitList: [72, 110, 150], rankList: [1, LAST], seeds: 10 };

test('the verdict agrees with the session that chose the radius: 110 is the one that holds', () => {
  const kept = verdictOf(SESSION_42, 110, GRID_OPTS);
  assert.equal(kept.failures, 0, kept.lines.join('\n'));
  assert.match(kept.lines.join('\n'), /PASS/);
});

test('and it refuses the two radii that session refused, on the same numbers', () => {
  // "a card that mostly does nothing" - 2.0% at the first rank, where 72 px left it.
  const narrow = verdictOf(SESSION_42, 72, GRID_OPTS);
  assert.equal(narrow.failures, 1, narrow.lines.join('\n'));
  assert.match(narrow.lines[0], /rank 1 turns aside 2\.0%.*under the 4%/s);
  // "a card that ends the fight for you" - 43.8% at the fifth, where 150 px left it.
  const wide = verdictOf(SESSION_42, 150, GRID_OPTS);
  assert.equal(wide.failures, 1, wide.lines.join('\n'));
  assert.match(wide.lines[0], /over the 40%/);
});

test('a rank that buys the same crowd fooled again fails the slope', () => {
  const flat = [cell(110, 1, 0.10), cell(110, LAST, 0.05)];
  const verdict = verdictOf(flat, 110, { ...GRID_OPTS, baitList: [110] });
  assert.equal(verdict.failures, 1, verdict.lines.join('\n'));
  assert.match(verdict.lines[0], /buys 0\.50x what rank 1 does/);
});

test('the promises are pinned to the words they were written with', () => {
  // The floor is what 72 px missed and the ceiling is what 150 px missed; if either is moved, the
  // test above stops meaning what it says and this is the file that has to be argued with.
  assert.ok(FLOOR > 0.020 && FLOOR <= 0.064, 'the floor is between 72 px and 110 px');
  assert.ok(CEILING >= 0.302 && CEILING < 0.438, 'the ceiling is between 110 px and 150 px');
  assert.ok(SLOPE >= 2, 'a rank has to buy at least twice the crowd');
});

test('a batch that barely glows is refused, and so is one that never glowed at all', () => {
  const thin = verdictOf([cell(110, 1, 0.06, 12), cell(110, LAST, 0.3, 12)], 110, GRID_OPTS);
  assert.equal(thin.failures, 1, thin.lines.join('\n'));
  assert.match(thin.lines[0], /12 lit frames/);

  const dark = verdictOf([cell(110, 1, 0, 0), cell(110, LAST, 0, 0)], 110, GRID_OPTS);
  assert.match(dark.lines.join('\n'), /NOTHING MEASURED/);
  assert.ok(dark.failures >= 1);
});

test('a batch with too few presses of the dash is not a measurement of the card', () => {
  // Ten frames in which the dash was pressed nine times is not a reading of a radius: the sample is
  // presses, and a short window is nothing but the opening knot. This is the guard that stops the
  // verdict flipping between a two-minute batch and a five-minute one, which it otherwise does.
  const rare = [cell(110, 1, 0.37), cell(110, LAST, 0.57)];
  for (const row of rare) row.dashes = 1.1;
  const verdict = verdictOf(rare, 110, GRID_OPTS);
  assert.equal(verdict.failures, 1, verdict.lines.join('\n'));
  assert.match(verdict.lines[0], /TOO FEW PRESSES: the dash was pressed about 11 times/);
  assert.doesNotMatch(verdict.lines.join('\n'), /over the 40%/, 'no promise is judged on 11 presses');
});

test('a rung below 1 or below the last rank is named as not checked, not quietly skipped', () => {
  const verdict = verdictOf([cell(110, 2, 0.2)], 110, { ...GRID_OPTS, rankList: [2] });
  assert.match(verdict.lines.join('\n'), /did not include both rung 1 and rung/);
});

test('a wider disc that fooled less is reported as a broken measurement', () => {
  // Monotonic in the radius is a fact about the instrument, not the card: a grid where 150 px
  // diverts less than 110 px did has read where the crowd happened to be standing.
  const backwards = [
    cell(72, 1, 0.02), cell(72, LAST, 0.13),
    cell(110, 1, 0.064), cell(110, LAST, 0.302),
    cell(150, 1, 0.175), cell(150, LAST, 0.10),
  ];
  const verdict = verdictOf(backwards, 110, GRID_OPTS);
  assert.match(verdict.lines.join('\n'), /reading the crowd and not the radius/);
  assert.ok(verdict.failures >= 1);
});

test('the grid prints one row a rung and stars the shipped radius', () => {
  const text = gridTable(SESSION_42, 110, 110, {
    seeds: 10, seconds: 300, habit: 'escape', trigger: null,
  });
  assert.equal(text.split('\n').filter((line) => /110 px \*/.test(line)).length, 2);
  assert.match(text, /rank 1/);
  assert.match(text, /rank 5/);
  assert.match(text, /30\.2%/, 'the fifth rank reads as the grid measured it');
  assert.match(text, /dash habit/);
});

// ---------------------------------------------------------------------------------------------
// The command line.
// ---------------------------------------------------------------------------------------------

test('a habit, a rung, a radius or a seed count that is nonsense is refused before a run is played',
  () => {
    assert.equal(ghostGrid(['--habit', 'nonsense']).status, 2);
    assert.equal(ghostGrid(['--ranks', '9']).status, 2);
    assert.equal(ghostGrid(['--ranks', '-1']).status, 2);
    assert.equal(ghostGrid(['--baits', 'wide']).status, 2);
    assert.equal(ghostGrid(['--seeds', '0']).status, 2);
    assert.equal(ghostGrid(['--trigger', 'soon']).status, 2);
  });

test('a tiny grid still prints every rung and names the shipped radius', () => {
  const run = ghostGrid(['--seeds', '1', '--seconds', '10', '--ranks', '0,1,5']);
  assert.equal(run.status, 0, run.stderr);
  const rows = run.stdout.split('\n').filter((line) => line.trim().startsWith(BAIT + ' px *'));
  assert.equal(rows.length, 3, 'one row per rung, at the shipped radius only');
  assert.match(run.stdout, new RegExp('rank 0'), 'the rung that has nothing to look at is played too');
  assert.match(run.stdout, new RegExp('The shipped bait is ' + BAIT + ' px'));
});

test('--baits without the shipped radius says so instead of passing on somebody else', () => {
  const run = ghostGrid(['--seeds', '1', '--seconds', '10', '--baits', '90']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /90 px/);
  assert.match(run.stdout, /to verdict on/);
  assert.doesNotMatch(run.stdout, /PASS/);
});

test('a batch where nothing ever dashed is a failure and not a clean run', () => {
  // `off` never presses the dash, so no ghost can stand and the whole grid is a zero. A check that
  // called that a pass would pass every time nobody measured anything.
  const run = ghostGrid(['--seeds', '1', '--seconds', '20', '--habit', 'off', '--strict']);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /NOTHING MEASURED/);
});

test('the shipped radius is what the tool is asked to check by default', () => {
  assert.equal(BALANCE.upgrades[LINE].ranks, LAST);
  assert.ok(BAIT > 0 && BAIT < NEAR, 'the reach of the trick is inside the ring it is measured in');
});
