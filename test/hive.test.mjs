// The Hive (PLAN 3.4's 10:00, game/bosses.js): a mass of hex cells that drifts at the ship,
// breeds swarmlings out of itself, and can be broken apart cell by cell.
//
// The framework's own duties - the schedule, the cage, the warning, the phases, the hull bar -
// are test/bosses.test.mjs and are not repeated here. What this file owns is the second boss,
// which is also the thing that asked the framework for three new permissions: a boss may name
// its rhythm, a boss may walk, and a boss may be made of bodies.
//
//   It arrives whole, and stays whole: the cells keep their places round the core however far the
//     mass has walked, and nothing the crowd does to them shifts them.
//   The cell that lights is the cell that opens, in the place it was standing when it lit, for as
//     long as `telegraphMin` at least (which bosses.test.mjs holds every phase of every boss to).
//   The swarm is a pack, because that is what a swarmling is (game/flock.js), and its size is a
//     share of the mass that is still standing - which is the whole of the reason to shoot the
//     cells, and it is also why the bar goes down with them.
//   And it all goes down with the hive: the mass is the fight's own body and not the arena's.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import { world } from '../src/game/world.js';
import { damageEnemy } from '../src/game/enemies.js';
import { kindOf } from '../src/game/kinds.js';
import { packOf } from '../src/game/flock.js';
import {
  bossCells, bossHullShare, bossPhase, bossShape, cellOpening, cellProgress, cellsStanding,
  isBossBody, isBossPart, massReach,
} from '../src/game/bosses.js';
import { scriptedRun, stepTheWorld, bossOnTheField } from '../tools/headless/scripted.js';

const STEP = BALANCE.sim.step;
const HIVE = BALANCE.bosses.hive;
const CELLS = HIVE.cells;

/** Which entry of the schedule the second boss is. */
const DUE = 1;

/** The mark it is due at. */
const AT = BALANCE.bosses.schedule[DUE].at;

/**
 * Step until `seconds` of the arena have actually happened - see test/bosses.test.mjs for why
 * counting the calls is not the same thing as spending the time (a hit-stop swallows steps, and
 * a boss is written out of everything that stops the world for a living).
 */
function steps(seconds) {
  let ran = 0;
  let guard = 0;
  while (ran < seconds - 1e-9) {
    if (stepTheWorld()) ran += STEP;
    guard++;
    if (guard > 20000) throw new Error('the arena never came back to life');
  }
}

/** Step until `seen` answers true, and say whether it ever did. */
function until(seen, seconds) {
  let ran = 0;
  while (ran < seconds) {
    if (seen()) return true;
    if (stepTheWorld()) ran += STEP;
  }
  return seen();
}

function hiveOnTheField() {
  const boss = bossOnTheField(DUE);
  assert.equal(boss.id, 'hive', 'the second entry of the schedule is not the Hive any more');
  return boss;
}

/** The cells that are still standing. */
function mass(boss) {
  return bossCells(boss).filter((cell) => cell.hp > 0);
}

/** The cells of a mass that are lit for an opening right now. */
function lit(boss) {
  return bossCells(boss).filter((cell) => cellOpening(cell) && cell.hp > 0);
}

/** Every brood in the arena - the only swarmlings a scripted world can have are the hive's. */
function brood(field) {
  return field.enemies.filter((body) => body.type === 'swarmling');
}

/** Do to the core what everything else does to a body that is about to stop existing. */
function fell(field, boss) {
  damageEnemy(field, boss.enemy, boss.enemy.maxhp * 10, true);
}

/** Break one cell, the way a gun would, and answer what the core lost with it. */
function breakCell(field, cell) {
  const before = field.boss.enemy.hp;
  while (cell.hp > 0) damageEnemy(field, cell, cell.hp, true);
  return before - field.boss.enemy.hp;
}

/** How far a cell stands from the core it is part of. */
function seat(cell) {
  return Math.hypot(cell.x - cell.hub.x, cell.y - cell.hub.y);
}

/**
 * How far a cell has strayed from the ring it was given.
 *
 * Not exactly zero, and it cannot be: the crowd walks a cell from the place its core was standing
 * when that cell's own turn came up, and the core walks after it, so a cell trails the middle of
 * its own mass by one step of the mass's drift - under a pixel at the pace the hive walks, and
 * it does not grow, because a cell is placed absolutely and not nudged. Anything more than that
 * is the mass coming apart, which is what these tests are looking for.
 */
function drift(cell) {
  return Math.abs(seat(cell) - CELLS.ring);
}

const SEAT_SLACK = 1.5;   // px; see `drift`

// ---------------------------------------------------------------------------
// The mass, and the fact that it walks
// ---------------------------------------------------------------------------

test('the hive is the second boss, and its rhythm is not the ring', () => {
  assert.ok(AT > BALANCE.bosses.schedule[0].at, 'two bosses are due at the same minute');
  assert.equal(HIVE.rhythm, 'mass');
  assert.ok(HIVE.speed > 0, 'the whole point of the second boss is that it walks');
  assert.equal(CELLS.rooted, true, 'a place in a wall does not get shoved out of it');
});

test('it arrives whole: a core, and the honeycomb round it', () => {
  const field = scriptedRun(101);
  const boss = hiveOnTheField();

  assert.equal(bossShape(boss), 'mass');
  assert.equal(bossCells(boss).length, CELLS.count);
  assert.equal(field.enemies.length, CELLS.count + 1,
    'something else came in with the hive');
  assert.equal(isBossBody(field, boss.enemy), true);

  for (const cell of bossCells(boss)) {
    assert.equal(isBossPart(field, cell), true, 'a cell does not know its own core');
    assert.equal(cell.type, 'cell');
    assert.ok(Math.abs(seat(cell) - CELLS.ring) < 1e-6,
      'a cell arrived ' + seat(cell) + 'px out, not at the ring it was given');
  }

  // Equally spaced, and every one of them a different place: the seats are the whole of the
  // layout, so two cells on one seat would be a hole in the mass wearing two hexes.
  const bearings = bossCells(boss).map((cell) => Math.atan2(cell.y - boss.enemy.y, cell.x - boss.enemy.x));
  assert.equal(new Set(bearings.map((b) => b.toFixed(6))).size, CELLS.count);
});

test('the mass keeps its shape, however far it walks', () => {
  const field = scriptedRun(102);
  const boss = hiveOnTheField();
  const start = bossCells(boss).map((cell) => ({ x: cell.x, y: cell.y }));

  // Park the ship far away so the mass has a reason to get up and go, and let it go.
  field.player.x = 200;
  field.player.y = 200;
  const walked = Math.hypot(boss.enemy.x - start[0].x, boss.enemy.y - start[0].y);
  steps(4);

  assert.ok(Math.hypot(boss.enemy.x - 200, boss.enemy.y - 200) <
    Math.hypot(start[0].x - 200, start[0].y - 200) - 20,
    'the mass stood still for four seconds (it moved ' + walked.toFixed(1) + 'px)');

  for (const cell of bossCells(boss)) {
    assert.ok(drift(cell) < SEAT_SLACK,
      'a cell came adrift from its seat in the mass by ' + drift(cell).toFixed(2) + 'px');
  }
});

test('it holds the band it likes, and it stays inside the room', () => {
  const field = scriptedRun(103);
  const boss = hiveOnTheField();
  const ship = field.player;

  // From across the room it comes.
  ship.x = field.field.x0 + 60;
  ship.y = field.field.y0 + 60;
  const far = Math.hypot(boss.enemy.x - ship.x, boss.enemy.y - ship.y);
  steps(6);
  assert.ok(Math.hypot(boss.enemy.x - ship.x, boss.enemy.y - ship.y) < far - 40,
    'it never came in at all');

  // Up close it gives ground back, at its own pace and not for ever.
  ship.x = boss.enemy.x + 40;
  ship.y = boss.enemy.y;
  steps(3);
  assert.ok(Math.hypot(boss.enemy.x - ship.x, boss.enemy.y - ship.y) > HIVE.approach.near * 0.5,
    'it let the ship sit on top of it');

  // And the whole of the mass is inside the cage, not leaning through it with half of itself
  // outside the fight the run is meant to be having.
  for (const cell of bossCells(boss)) {
    assert.ok(cell.x > field.field.x0 && cell.x < field.field.x1);
    assert.ok(cell.y > field.field.y0 && cell.y < field.field.y1);
  }
  assert.ok(massReach(boss) > CELLS.ring);
});

test('a cell cannot be shoved out of the mass', () => {
  const field = scriptedRun(104);
  const boss = hiveOnTheField();
  const cell = mass(boss)[0];

  cell.ix = 900;      // whatever a bullet's kick or a blast's shove can hand a body
  cell.iy = -700;
  steps(0.5);

  assert.ok(drift(cell) < SEAT_SLACK, 'a shove walked a cell out of its seat');
  assert.ok(cell.hp > 0, 'the shove hurt it, which is not what a shove is for');
});

// ---------------------------------------------------------------------------
// The opening: what lights is what opens
// ---------------------------------------------------------------------------

test('the cells light before they open, and what lights is what opens', () => {
  const field = scriptedRun(105);
  const boss = hiveOnTheField();
  const spec = HIVE.phases[0].spawn;

  assert.ok(until(() => lit(boss).length > 0, 30), 'the hive never opened anything');

  const shown = lit(boss).map((cell) => ({ cell: cell, x: cell.x, y: cell.y }));
  const dark = mass(boss).filter((cell) => !cellOpening(cell));
  // `share` of the standing mass, and a mass always has one cell open even at a small share -
  // the framework rounds a share rather than rounding it up, because a share that always rounds
  // up quietly doubles the pressure on a mass that has been broken down to two or three.
  assert.equal(shown.length, openingCells(CELLS.count, spec.share),
    'a different number of cells lit than the phase asked for');
  for (const one of shown) assert.ok(cellProgress(one.cell) >= 0);

  // The hold: the mass stands still while it is showing this (the same rule the ring rides by,
  // and the one that makes the cell you watched the cell the brood come out of).
  const held = { x: boss.enemy.x, y: boss.enemy.y };
  steps(spec.windup * 0.6);
  assert.ok(Math.hypot(boss.enemy.x - held.x, boss.enemy.y - held.y) < 1,
    'the mass drifted while it was still promising the cell');
  for (const one of shown) assert.ok(cellOpening(one.cell), 'a cell went out before it opened');

  steps(spec.windup * 0.5);
  const born = brood(field);
  assert.equal(born.length, shown.length * spec.each,
    'the opening sent ' + born.length + ' bodies and lit ' + shown.length + ' cells');

  // Every one of them out of a mouth that was lit, at the place that mouth was standing, and
  // none of them out of a cell that was dark.
  for (const body of born) {
    const from = shown.filter((one) => Math.hypot(body.x - one.x, body.y - one.y)
      < one.cell.r + spec.gap + CELLS.radius + spec.each * spec.step * CELLS.ring);
    assert.ok(from.length > 0, 'a body came out of nowhere');
  }
  for (const cell of dark) {
    for (const body of born) {
      assert.ok(Math.hypot(body.x - cell.x, body.y - cell.y) > cell.r + spec.gap + 2,
        'a cell that never lit sent something out anyway');
    }
  }
});

test('what comes out of one mouth is one pack', () => {
  const field = scriptedRun(106);
  const boss = hiveOnTheField();

  assert.ok(until(() => brood(field).length > 0, 30), 'nothing ever came out of the hive');
  steps(0.4);

  const born = brood(field);
  assert.ok(born.length >= 2, 'one body is not a swarm');
  assert.equal(born[0].kind, kindOf('swarmling'),
    'the brood are a kind of their own, which is one thing too many to learn');

  // One pack per mouth: every body has a pack, and the packs are in the world's list, which is
  // what lets them bunch and commit and dive as one thing (game/flock.js).
  const packs = new Set();
  for (const body of born) {
    const pack = packOf(body);
    assert.ok(pack !== null, 'a brood body is flying on its own');
    assert.ok(field.flocks.indexOf(pack) >= 0, 'its pack is not in the world');
    packs.add(pack);
  }
  assert.ok(packs.size <= born.length / 2, 'every body arrived with a pack of one');
});

test('the smaller the mass, the smaller the swarm', () => {
  const field = scriptedRun(107);
  const boss = hiveOnTheField();
  const spec = HIVE.phases[0].spawn;

  assert.ok(until(() => brood(field).length > 0, 30));
  const whole = brood(field).length;
  assert.equal(whole, openingCells(CELLS.count, spec.share) * spec.each);

  // Break most of the mass off and let the hive take another turn.
  const left = mass(boss);
  for (let i = 0; i < CELLS.count - 2; i++) damageEnemy(field, left[i], left[i].hp, true);
  field.enemies.length = 0;              // the brood are not the question any more
  assert.equal(cellsStanding(boss), 2);

  assert.ok(until(() => brood(field).length > 0, 30), 'a two-cell hive stopped fighting');
  assert.ok(brood(field).length < whole,
    'six cells and two cells sent the same swarm: ' + whole + ' and ' + brood(field).length);
  assert.equal(brood(field).length, openingCells(2, spec.share) * spec.each);
});

/** How many cells a phase opens out of a mass of `have`: its share, never none of it. */
function openingCells(have, share) {
  return Math.min(have, Math.max(1, Math.round(have * share)));
}

test('with nothing left to open, the core opens instead', () => {
  const field = scriptedRun(108);
  const boss = hiveOnTheField();

  for (const cell of mass(boss)) damageEnemy(field, cell, cell.hp, true);
  assert.equal(cellsStanding(boss), 0);
  field.enemies.length = 0;

  assert.ok(until(() => brood(field).length > 0, 30),
    'a hive with no cells left has no attack at all, and the fight is over by subtraction');
  assert.equal(lit(boss).length, 0, 'a destroyed cell lit up again');
});

// ---------------------------------------------------------------------------
// Breaking it apart: the bar is the mass
// ---------------------------------------------------------------------------

test('a cell that comes off takes its share of the hull with it', () => {
  const field = scriptedRun(109);
  const boss = hiveOnTheField();
  const cell = mass(boss)[0];
  const before = bossHullShare(boss);
  const score = field.score;

  const lost = breakCell(field, cell);

  assert.ok(field.enemies.indexOf(cell) < 0, 'the cell is still in the crowd');
  assert.equal(cellsStanding(boss), CELLS.count - 1);
  assert.ok(Math.abs(lost - CELLS.share * boss.enemy.maxhp) < 1e-6,
    'the bar moved ' + lost + ' and the cell was worth ' + CELLS.share * boss.enemy.maxhp);
  assert.ok(bossHullShare(boss) < before, 'the bar did not move at all');
  assert.ok(field.score > score, 'a body died and nothing was paid for it');
});

test('the whole mass is worth most of the bar, and not all of it', () => {
  // Every point of the bar is a cell somebody can shoot, which is what makes shooting the cells
  // a way of fighting and not a side activity - but the core has to outlive the honeycomb, or
  // breaking the last cell ends a fight the run was not in.
  assert.ok(CELLS.share * CELLS.count > 0.2,
    'breaking the mass is worth nothing: ' + CELLS.share * CELLS.count);
  assert.ok(CELLS.share * CELLS.count < 0.9,
    'the core has nothing left to do but die with the last cell');

  const field = scriptedRun(110);
  const boss = hiveOnTheField();
  for (const cell of mass(boss)) damageEnemy(field, cell, cell.hp, true);

  assert.ok(boss.enemy.hp > 0, 'the mass was the whole of the hive');
  assert.ok(bossHullShare(boss) < 1 - CELLS.share * CELLS.count + 1e-9);
});

test('a phase change leaves the mass where it was', () => {
  const field = scriptedRun(111);
  const boss = hiveOnTheField();
  const standing = mass(boss);

  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[1] * 0.99;
  steps(BALANCE.bosses.phaseBreak.time + 0.1);

  assert.equal(bossPhase(boss), 2);
  assert.equal(cellsStanding(boss), standing.length, 'the flare took cells with it');
  for (const cell of standing) {
    assert.ok(field.enemies.indexOf(cell) >= 0, 'a cell left the crowd on a phase change');
    assert.ok(drift(cell) < SEAT_SLACK, 'and left its seat');
    assert.equal(cellOpening(cell), false, 'a flare is not an opening');
  }
});

test('a cell that is lit when the hive goes down is put out, not fired', () => {
  const field = scriptedRun(112);
  const boss = hiveOnTheField();

  assert.ok(until(() => lit(boss).length > 0, 30));
  fell(field, boss);
  steps(BALANCE.bosses.phaseBreak.time);   // a hit-stop is not the world, and this one is long

  assert.equal(world.boss, null);
  assert.equal(brood(field).length, 0, 'the brood came out of a hive that had already died');
});

test('the mass goes down with the hive, and unpaid', () => {
  const field = scriptedRun(113);
  const boss = hiveOnTheField();
  const cells = mass(boss);
  const before = field.score;
  const hull = boss.enemy.score;

  fell(field, boss);
  steps(0.4);

  assert.equal(field.boss, null);
  assert.equal(field.enemies.length, 0, 'a hex of wax was left standing over the wreck');
  for (const cell of cells) assert.ok(cell.hp <= 0);
  // The one number that says the mass was dismissed and not killed: everything the run was paid
  // for after this point is the hive's own score and nothing else (game/bosses.js `breakMass`).
  assert.equal(field.score, before + hull, 'the mass was paid for on the way out');
});

test('the hive is hurt by everything that hurts anything, cells included', () => {
  // The whole point of building a boss and its parts as bodies (game/kinds.js `opts.kind`):
  // every damage door in the game already knows how to hit them, and nobody had to remember to.
  const field = scriptedRun(114);
  const boss = hiveOnTheField();

  for (const cell of mass(boss)) {
    assert.equal(typeof cell.kind.walk, 'function');
    assert.ok(cell.r > 0 && cell.maxhp > 0);
    assert.equal(cell.hub, boss.enemy);
  }
  assert.ok(isBossPart(field, mass(boss)[0]));
  assert.equal(isBossPart(field, boss.enemy), false, 'the core is not one of its own cells');
});
