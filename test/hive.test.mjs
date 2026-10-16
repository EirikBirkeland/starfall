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
import { TAU } from '../src/core/math.js';
import { fieldIsCaged } from '../src/game/field.js';
import { world } from '../src/game/world.js';
import { damageEnemy } from '../src/game/enemies.js';
import { kindOf } from '../src/game/kinds.js';
import { isClump, packOf } from '../src/game/flock.js';
import {
  bossCells, bossCores, bossHullShare, bossPhase, bossShape, bossSummons, cellOpening,
  cellProgress, cellsStanding, coreCells, coreReach, coresStanding, isBossBody, isBossPart,
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

/** Every flock in the arena that is flying brood bodies. */
function broods(field) {
  const seen = new Set();
  for (const body of brood(field)) {
    const pack = packOf(body);
    if (pack !== null) seen.add(pack);
  }
  return [...seen];
}

/** The body in `list` that `body` stands nearest to. */
function nearest(list, body) {
  let best = list[0];
  let bestD = Infinity;
  for (const one of list) {
    const d = Math.hypot(body.x - one.x, body.y - one.y);
    if (d < bestD) { best = one; bestD = d; }
  }
  return best;
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
  assert.ok(coreReach(bossCores(boss)[0]) > CELLS.ring);
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

test('one beat lets out one flock, however many mouths opened', () => {
  const field = scriptedRun(106);
  const boss = hiveOnTheField();
  const spec = HIVE.phases[0].spawn;

  assert.ok(openingCells(CELLS.count, spec.share) > 1,
    'phase 1 lights one mouth, so this cannot see a beat gather its mouths into one flock');
  assert.ok(until(() => lit(boss).length > 0, 30), 'the hive never opened anything');
  const shown = lit(boss).length;

  assert.ok(until(() => brood(field).length > 0, 30), 'nothing ever came out of the hive');
  steps(0.4);

  const born = brood(field);
  assert.equal(born.length, shown * spec.each,
    shown + ' mouths lit and ' + born.length + ' bodies arrived');
  assert.ok(born.length >= 2, 'one body is not a swarm');
  assert.equal(born[0].kind, kindOf('swarmling'),
    'the brood are a kind of their own, which is one thing too many to learn');

  // One flock per beat, and not one per mouth: the mouths that light are neighbours round the
  // ring, so a mass lets out one clump that bunches, commits and dives as one thing
  // (game/flock.js) - which is the whole of what the ring drawn round a clump is a tell *for*.
  const packs = broods(field);
  assert.equal(packs.length, 1,
    'a beat that lit ' + shown + ' mouths flew ' + packs.length + ' flocks');
  for (const body of born) {
    const pack = packOf(body);
    assert.ok(pack !== null, 'a brood body is flying on its own');
    assert.ok(field.flocks.indexOf(pack) >= 0, 'its pack is not in the world');
  }
  assert.equal(packs[0].n, born.length, 'the flock does not know all its bodies');

  // ... and a beat's brood is worth a tell of its own, which is the bargain between this fight and
  // that eye: a clump of the swarm is drawn once, and a pair is not.
  assert.ok(isClump(packs[0]),
    'a beat lets out ' + packs[0].n + ' bodies, which is not a clump');
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

// ---------------------------------------------------------------------------
// The third phase: the fight comes apart into three smaller hives
// ---------------------------------------------------------------------------
//
// PLAN 3.4's last line for the Hive is the one thing no boss here had done: a fight that stops
// being one body. What these tests are holding is the bar - the pieces divide the hull the fight
// has left and their maximums add back up to the one it arrived with, so one hull bar is still one
// fight - and the fact that a beat, a flare and a going-down are each spent once however many
// bodies the fight is standing on (game/bosses.js `newCore`, `spendSplit`).

const PHASE3 = HIVE.phases[2];
const SPLIT = PHASE3.split;

/** The band's middle distance: how far out a fragment is told to stand (game/bosses.js). */
const STATION = (HIVE.approach.near + HIVE.approach.far) / 2;

/**
 * Drop the fight to its third phase and let the flare run its length, so the split is spent.
 * Answers what the bar, the purse and the body were on the way in, which is what three of these
 * measure - and the share is read *after* the hull was put where the last mark is, because the
 * whole point is that the split does not move it.
 */
function breakItOpen(field, boss) {
  const body = boss.enemy;
  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[2] * 0.99;
  const before = { share: bossHullShare(boss), score: field.score, body: body };
  steps(BALANCE.bosses.phaseBreak.time + 0.1);
  return before;
}

/** How far a body's bearing from the ship differs from the side it was told to keep, in radians. */
function offItsSide(core, ship) {
  const here = Math.atan2(core.enemy.y - ship.y, core.enemy.x - ship.x);
  let off = here - core.bearing;
  while (off > Math.PI) off -= TAU;
  while (off < -Math.PI) off += TAU;
  return off;
}

/** Park the ship somewhere in the room and let the fight settle round it for a moment. */
function settle(field, x, y, seconds) {
  const ship = field.player;
  ship.x = x;
  ship.y = y;
  ship.px = x;
  ship.py = y;
  steps(seconds);
  return ship;
}

test('no piece is grown before the last phase, and a big enough hit never grows any', () => {
  const field = scriptedRun(120);
  const boss = hiveOnTheField();
  const one = boss.enemy;

  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[1] * 0.99;
  steps(BALANCE.bosses.phaseBreak.time + 0.1);
  assert.equal(bossPhase(boss), 2);
  assert.equal(bossCores(boss).length, 1, 'it grew pieces a phase too early');
  assert.equal(boss.enemy, one, 'the second phase is not the same body it arrived as');

  // And a run that takes it from above the last mark to below nothing in one blow never sees the
  // third phase at all. That is the accepted price of a phase being a hull share: a burst bigger
  // than a third of the bar skips the last act, the same way a huge hit falls two marks in one
  // flare (test/bosses.test.mjs).
  damageEnemy(field, boss.enemy, boss.enemy.maxhp * 10, true);
  steps(0.2);
  assert.equal(field.boss, null, 'a fight that ended is still being fought');
  assert.equal(field.bossesDown, 1);
});

test('the third phase breaks the hive into three smaller hives', () => {
  const field = scriptedRun(121);
  const boss = hiveOnTheField();
  const was = breakItOpen(field, boss).body;

  assert.equal(bossPhase(boss), 3);
  assert.equal(bossCores(boss).length, SPLIT.cores, 'it came apart into the wrong number of hives');
  assert.equal(bossShape(boss), 'mass', 'the pieces are not hives any more');

  for (const core of bossCores(boss)) {
    assert.ok(field.enemies.indexOf(core.enemy) >= 0, 'a piece is not a body of the crowd');
    assert.equal(isBossBody(field, core.enemy), true, 'a piece is not the boss');
    assert.equal(coreCells(core).length, SPLIT.cells.count, 'a piece arrived without its honeycomb');
    for (const cell of coreCells(core)) {
      assert.equal(cell.hub, core.enemy, 'a cell does not know which hive it belongs to');
      assert.equal(isBossPart(field, cell), true);
      const seat = Math.hypot(cell.x - core.enemy.x, cell.y - core.enemy.y);
      assert.ok(Math.abs(seat - SPLIT.cells.ring) < SEAT_SLACK,
        'a piece\'s cell stands ' + seat + 'px out, not at ' + SPLIT.cells.ring);
    }
  }

  // The body the fight was, and its mass, are gone from the crowd - and the bar they were wearing
  // is being worn by the three that are left, which the next test measures.
  assert.equal(field.enemies.indexOf(was), -1, 'the hive it was is still standing there');
  assert.ok(was.hp <= 0, 'the body the fight was still reads as alive');
});

test('the bar does not jump when the hive comes apart', () => {
  const field = scriptedRun(122);
  const boss = hiveOnTheField();
  const before = breakItOpen(field, boss);

  assert.ok(Math.abs(bossHullShare(boss) - before.share) < 1e-9,
    'the bar moved from ' + before.share.toFixed(4) + ' to ' + bossHullShare(boss).toFixed(4)
      + ' on the split');

  // The pieces' maximums add back up to the one the fight arrived with, and every piece is at the
  // same share of its own hull as the bar is of the whole: the fight divided its remaining hull
  // three ways, it did not grow a new one and it did not lose the old one.
  let total = 0;
  for (const core of bossCores(boss)) {
    total += core.enemy.maxhp;
    assert.ok(Math.abs(core.enemy.hp / core.enemy.maxhp - before.share) < 1e-9,
      'a piece carries the wrong share of the hull');
  }
  assert.equal(total, HIVE.hull, 'the bar has a different length than the fight arrived with');
});

test('the split survives a hit that falls past the last mark with the mass whole', () => {
  const field = scriptedRun(211);
  const boss = hiveOnTheField();
  const body = boss.enemy;

  // The whole honeycomb is worth `count x share` of the bar - 30% of its length - and a run pays
  // that off a cell at a time. The split sheds whatever is left of it in one moment
  // (`breakMass`), so a hit that crosses the last mark with the mass whole can leave the bar
  // holding less than the shed is worth, in the same breath that opens the phase doing the shedding.
  // That is an ordinary late-run bullet: it has to be, because the mark is crossed by damage.
  body.hp = body.maxhp * BALANCE.bosses.atHull[2] * 1.01;
  damageEnemy(field, body, body.maxhp * 0.30, true);

  const share = bossHullShare(boss);
  assert.equal(cellsStanding(boss), CELLS.count, 'the mass was not whole on the way in');
  assert.ok(share < CELLS.count * CELLS.share,
    'the bar has more left than the whole mass is worth, so this is not the case being tested');

  steps(BALANCE.bosses.phaseBreak.time + 0.1);

  assert.equal(bossPhase(boss), 3);
  assert.equal(coresStanding(boss), SPLIT.cores,
    'the hive did not come apart into its three hives - it died in its own split');
  assert.equal(field.bossesDown, 0, 'the fight ended in its own split');
  // And the shed cost the bar nothing: what came off was already in the number on the glass.
  assert.ok(Math.abs(bossHullShare(boss) - share) < 1e-9,
    'the shed charged the bar: it was ' + share.toFixed(4) + ' and is '
      + bossHullShare(boss).toFixed(4));
});

test('what the fight was is not paid for', () => {
  const field = scriptedRun(123);
  const boss = hiveOnTheField();
  const before = breakItOpen(field, boss);

  assert.equal(field.score, before.score,
    'the body the fight came apart in paid out, and its reward is not the run\'s yet');

});

test('every piece takes its own side of the ship and keeps it', () => {
  const field = scriptedRun(124);
  const boss = hiveOnTheField();
  breakItOpen(field, boss);
  const box = field.field;
  const ship = settle(field, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, 12);

  // In the middle of the room there is room for the whole formation, so this is the promise made
  // plain: each piece is standing at the range it was given, on the bearing it was given.
  for (const core of bossCores(boss)) {
    const range = Math.hypot(core.enemy.x - ship.x, core.enemy.y - ship.y);
    assert.ok(Math.abs(range - STATION) < HIVE.approach.park * 2,
      'a piece is ' + range.toFixed(0) + 'px from the ship, not at the ' + STATION + 'px it was told');
    assert.ok(Math.abs(offItsSide(core, ship)) < 0.1,
      'a piece is ' + offItsSide(core, ship).toFixed(2) + ' rad off the side it was told to keep');
  }

  // Three pieces spread that many ways round the ship: the split is a triangle round the run and
  // not a pile of hives at its back, which is the whole reason a fragment is told a side instead of
  // being left to walk at it like everything else in the crowd.
  const sides = bossCores(boss).map((core) => core.bearing);
  for (let i = 1; i < sides.length; i++) {
    assert.ok(Math.abs(Math.abs(sides[i] - sides[i - 1]) - TAU / SPLIT.cores) < 0.01,
      'the pieces are not spaced round the ship: ' + sides.join(', '));
  }

  // And they follow: the ship goes across the room and each piece comes round to its own side of it
  // again, at its own pace and not at a speed that would make it a chaser.
  settle(field, (box.x0 + box.x1) / 2 + 300, (box.y0 + box.y1) / 2, 12);
  for (const core of bossCores(boss)) {
    const range = Math.hypot(core.enemy.x - ship.x, core.enemy.y - ship.y);
    assert.ok(Math.abs(offItsSide(core, ship)) < 0.35,
      'a piece did not come back to its side of the ship (off by '
        + offItsSide(core, ship).toFixed(2) + ' rad)');
    assert.ok(range > STATION - HIVE.approach.park * 3 && range < STATION + HIVE.approach.park * 3,
      'a piece is ' + range.toFixed(0) + 'px out after the ship moved');
    assert.ok(core.enemy.x > box.x0 && core.enemy.x < box.x1
      && core.enemy.y > box.y0 && core.enemy.y < box.y1,
      'a piece walked out of the room it was shut in with');
  }
});

test('every piece opens on the same beat, and the brood come out of all of them', () => {
  const field = scriptedRun(125);
  const boss = hiveOnTheField();
  breakItOpen(field, boss);
  const spec = SPLIT.spawn;
  const perBeat = SPLIT.cores * openingCells(SPLIT.cells.count, spec.share) * spec.each;

  const before = bossSummons(boss);
  assert.ok(until(() => lit(boss).length > 0, 30), 'no piece ever lit a cell');

  // The mouths that lit belong to more than one hive: it is one beat, and three bodies spend it
  // together, which is what keeps three hives one fight to read.
  const hubs = new Set(lit(boss).map((cell) => cell.hub));
  assert.ok(hubs.size > 1, 'only one of the pieces was allowed to open');

  assert.ok(until(() => bossSummons(boss) > before, 30), 'no piece ever opened anything');
  assert.equal(bossSummons(boss) - before, perBeat,
    'one beat sent ' + (bossSummons(boss) - before) + ' bodies and ' + perBeat
      + ' was what the pieces add up to');
});

test('a piece lets out its own flock, and the three of them are the fight', () => {
  const field = scriptedRun(131);
  const boss = hiveOnTheField();
  breakItOpen(field, boss);
  const spec = SPLIT.spawn;
  const perBeat = SPLIT.cores * openingCells(SPLIT.cells.count, spec.share) * spec.each;

  const was = new Set(brood(field));
  const before = bossSummons(boss);
  assert.ok(until(() => bossSummons(boss) > before, 30), 'no piece ever opened anything');
  const born = brood(field).filter((body) => !was.has(body));
  assert.equal(born.length, perBeat, 'one beat sent something other than what the pieces add up to');

  // Three pieces, three flocks. A flock's middle has to be a middle, and bodies born on the far
  // side of the room would be a clump drawn round nothing - so the beat is one event in three
  // places, and the mouth that lit is the mouth its own piece's bodies came out of.
  const hubs = bossCores(boss).map((core) => core.enemy);
  const packs = [...new Set(born.map(packOf))];
  assert.equal(packs.length, SPLIT.cores,
    'one beat flew ' + packs.length + ' flocks and there are ' + SPLIT.cores + ' pieces');
  for (const pack of packs) {
    const bodies = born.filter((body) => packOf(body) === pack);
    assert.equal(bodies.length, openingCells(SPLIT.cells.count, spec.share) * spec.each,
      'a piece let out the wrong number of bodies');
    const home = nearest(hubs, bodies[0]);
    for (const body of bodies) {
      assert.equal(nearest(hubs, body), home, 'one flock came out of two different pieces');
    }
    // And a pair, which is what the row says and what the eye agrees is not a clump: three pieces
    // are three places to read already (balance.js `split.spawn`, game/flock.js `isClump`).
    assert.ok(!isClump(pack), 'a fragment\'s brood was big enough to be drawn as a clump');
  }
});

test('a piece with nothing left to open opens its own core', () => {
  const field = scriptedRun(126);
  const boss = hiveOnTheField();
  breakItOpen(field, boss);
  const spec = SPLIT.spawn;
  const empty = bossCores(boss)[1];

  for (const cell of coreCells(empty)) {
    if (cell.hp > 0) damageEnemy(field, cell, cell.hp, true);
  }
  assert.equal(coreCells(empty).filter((cell) => cell.hp > 0).length, 0);

  const before = bossSummons(boss);
  assert.ok(until(() => bossSummons(boss) > before, 30), 'a piece with no cells stopped fighting');
  const born = brood(field).filter((body) =>
    Math.hypot(body.x - empty.enemy.x, body.y - empty.enemy.y) < empty.enemy.r + spec.gap + 40);
  assert.ok(born.length > 0, 'a piece with no cells left sent nothing out of itself');
});

test('a piece\'s cell is worth its share of the bar, and only of its own body', () => {
  const field = scriptedRun(127);
  const boss = hiveOnTheField();
  breakItOpen(field, boss);
  const cores = bossCores(boss);
  const own = cores[1];
  const other = cores[2];
  const cell = coreCells(own).filter((one) => one.hp > 0)[0];
  const share = bossHullShare(boss);
  const hull = own.enemy.hp;
  const elsewhere = other.enemy.hp;

  while (cell.hp > 0) damageEnemy(field, cell, cell.hp, true);

  assert.ok(Math.abs(hull - own.enemy.hp - SPLIT.cells.share * HIVE.hull) < 1e-9,
    'the bar moved by the wrong amount for one cell of a piece');
  assert.equal(other.enemy.hp, elsewhere, 'another piece paid for a cell that was not its own');
  assert.ok(bossHullShare(boss) < share);
});

test('the last piece down is the fight down', () => {
  const field = scriptedRun(128);
  const boss = hiveOnTheField();
  breakItOpen(field, boss);
  const cores = bossCores(boss);
  assert.equal(fieldIsCaged(field), true);

  for (let i = 0; i < cores.length - 1; i++) {
    damageEnemy(field, cores[i].enemy, cores[i].enemy.maxhp * 10, true);
    steps(0.4);
    assert.notEqual(field.boss, null,
      'the fight ended with ' + (cores.length - i - 1) + ' pieces still standing');
    assert.equal(coresStanding(boss), cores.length - i - 1);
    assert.equal(fieldIsCaged(field), true, 'the room opened while a hive was still fighting');
    for (const cell of coreCells(cores[i])) {
      assert.ok(cell.hp <= 0, 'a piece came down and left its honeycomb standing');
    }
  }

  const last = cores[cores.length - 1];
  const score = field.score;
  damageEnemy(field, last.enemy, last.enemy.maxhp * 10, true);
  steps(0.4);

  assert.equal(field.boss, null);
  assert.equal(field.bossesDown, 1, 'three pieces went down but the fight is one fight');
  assert.equal(fieldIsCaged(field), false, 'the room stayed shut after the last piece went down');
  assert.ok(field.score > score, 'the last piece went down unpaid for');
  assert.equal(brood(field).length, 0, 'the brood were left behind by a fight that ended');
});

test('the split is spent once', () => {
  const field = scriptedRun(129);
  const boss = hiveOnTheField();
  breakItOpen(field, boss);

  steps(25);
  assert.equal(bossCores(boss).length, SPLIT.cores, 'it came apart again');
  assert.equal(field.enemies.filter((body) => isBossBody(field, body)).length, SPLIT.cores);
  assert.ok(bossSummons(boss) > 0, 'it stopped fighting after it broke');
});

test('a beat spends its light on a body that is standing', () => {
  const field = scriptedRun(130);
  const boss = hiveOnTheField();
  breakItOpen(field, boss);
  const cores = bossCores(boss);
  const gone = [cores[0].enemy, cores[1].enemy];
  const last = cores[2].enemy;

  for (const body of gone) damageEnemy(field, body, body.maxhp * 10, true);
  steps(0.4);
  assert.equal(coresStanding(boss), 1, 'two pieces came down and the fight is not one body');

  // Catch the step an opening lands on and ask where its light went out. With one body a fight
  // spends every light at that body and there is nothing to measure, so this only says anything
  // once a fight has several: the first body it was built with has been dead for a while and the
  // framework is still one fight, on one clock, with one ring of light to spend per beat.
  const before = bossSummons(boss);
  let spent = null;
  for (let guard = 0; guard < 3000 && spent === null; guard++) {
    field.rings.clear();          // so the rings left in the pool are this step's
    const was = bossSummons(boss);
    stepTheWorld();
    if (bossSummons(boss) > was) {
      spent = field.rings.items.map((shape) => ({ x: shape.x, y: shape.y }));
    }
  }
  assert.ok(spent !== null, 'the last piece stopped fighting');
  assert.ok(bossSummons(boss) > before);

  const at = (body) => spent.filter((shape) => Math.hypot(shape.x - body.x, shape.y - body.y) < 2);
  assert.ok(at(last).length > 0,
    'a beat landed and nothing was lit at the body that was standing and fighting');
  for (const body of gone) {
    assert.equal(at(body).length, 0,
      'a beat was lit at the place a body that had stopped existing was last standing');
  }
});
