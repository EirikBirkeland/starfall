// The Warden (BALANCE.bosses.warden): the first boss, and the one the framework was written
// around. One attack, escalating over three phases (PLAN 3.4): a ring that rides round, stops
// dead, shows its spokes, and fires down them.
//
// The framework - the schedule, the cage, the phases as beats, the going down - is
// test/bosses.test.mjs. What is proved here is the ring: that it points where it says it
// points, that the lines it draws are the lines that hurt, that the volley is a volley, and
// that each phase is the same attack and a harder one.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import { axisDistance } from '../src/game/beams.js';
import {
  bossAngle, bossPhase, spokeAngle, spokeCount, spokeHalf, spokeProgress, spokeStep,
} from '../src/game/bosses.js';
import {
  bossOnTheField, enemyAt, scriptedRun, stepTheWorld,
} from '../tools/headless/scripted.js';

const STEP = BALANCE.sim.step;
const TAU = Math.PI * 2;
const WARDEN = BALANCE.bosses.warden;

/** Step until `seconds` of the arena have happened, hit-stops and all (see test/bosses.test.mjs). */
function steps(seconds) {
  let ran = 0;
  let guard = 0;
  while (ran < seconds - 1e-9) {
    if (stepTheWorld()) ran += STEP;
    guard++;
    if (guard > 20000) throw new Error('the arena never came back to life');
  }
}

/** Walk it forward to the moment it is standing still with its spokes drawn. */
function catchItHolding(field, boss) {
  let guard = 0;
  while (spokeCount(boss) === 0 && guard < 2000) {
    stepTheWorld();
    guard++;
  }
  if (spokeCount(boss) === 0) throw new Error('the ring never stopped to aim');
  return boss;
}

/** The angles its spokes are drawn down, in the order they are drawn. */

function spokeAngles(boss) {
  const angles = [];
  for (let i = 0; i < spokeCount(boss); i++) angles.push(spokeAngle(boss) + i * spokeStep(boss));
  return angles;
}

// ---------------------------------------------------------------------------
// The ring
// ---------------------------------------------------------------------------

test('it rides, and it stops dead to aim', () => {
  const field = scriptedRun(70);
  const boss = bossOnTheField();
  const phase = WARDEN.phases[0];

  // Riding: the ring turns at the pace its phase says, and the body is turned with it, so what
  // you see pointing is what the spokes will be drawn from (game/bosses.js `holdsItsGround`).
  const before = bossAngle(boss);
  steps(0.5);
  const turned = bossAngle(boss) - before;
  assert.ok(Math.abs(Math.abs(turned) - phase.turn * 0.5) < 0.05,
    'it rode ' + turned.toFixed(3) + ' rad in half a second, not ' + phase.turn);
  assert.equal(boss.enemy.rot, bossAngle(boss), 'the body is not wearing the ring it is');

  // Standing still: not slower. Still.
  catchItHolding(field, boss);
  const held = bossAngle(boss);
  steps(0.2);
  assert.equal(bossAngle(boss), held, 'the ring moved while it was holding its spokes');
});

test('the spokes it shows are the phase it is in', () => {
  const field = scriptedRun(71);
  const boss = bossOnTheField();

  assert.equal(spokeCount(boss), 0, 'it arrived with a promise already made');
  catchItHolding(field, boss);
  assert.equal(spokeCount(boss), WARDEN.phases[0].spokes);
  assert.equal(spokeStep(boss), TAU / WARDEN.phases[0].spokes);
  assert.equal(spokeHalf(boss), WARDEN.phases[0].beam.halfWidth);

  // Evenly spaced all the way round, and shown from the facing it is standing at.
  const angles = spokeAngles(boss);
  for (let i = 0; i < angles.length; i++) {
    assert.ok(Math.abs(angles[i] - (spokeAngle(boss) + i * spokeStep(boss))) < 1e-9);
  }
  assert.ok(Math.abs(spokeProgress(boss)) < 1);
});

test('the countdown the spokes are drawn bright by is the one they fire on', () => {
  const field = scriptedRun(72);
  const boss = bossOnTheField();
  catchItHolding(field, boss);

  assert.ok(spokeProgress(boss) < 0.2, 'it was already most of the way through its wind-up');
  steps(WARDEN.phases[0].windup * 0.5);
  const middle = spokeProgress(boss);
  assert.ok(middle > 0.4 && middle < 0.8, 'the light is not telling the truth: ' + middle);

  // The floor every boss is held to (game/bosses.js `telegraphMin`), and the wind-up is
  // exactly that long: the spokes are up for all of it and not one frame less.
  assert.ok(WARDEN.phases[0].windup >= BALANCE.bosses.telegraphMin);
  steps(WARDEN.phases[0].windup - middle * WARDEN.phases[0].windup + STEP);
  assert.equal(spokeCount(boss), 0, 'it is still holding them after they fired');
});

// ---------------------------------------------------------------------------
// The volley
// ---------------------------------------------------------------------------

test('a volley is one ray per spoke, down the lines it was showing', () => {
  const field = scriptedRun(73);
  const boss = bossOnTheField();
  catchItHolding(field, boss);

  const shown = spokeAngles(boss);
  const half = spokeHalf(boss);
  steps(WARDEN.phases[0].windup + STEP * 2);

  const beams = [];
  for (let i = 0; i < field.beams.count; i++) beams.push(field.beams.items[i]);
  assert.equal(beams.length, shown.length, 'it fired a different number of rays than it showed');

  for (const beam of beams) {
    assert.equal(beam.from, 'warden', 'the beam does not know who fired it');
    const angle = Math.atan2(beam.dirY, beam.dirX);
    const match = shown.some((a) => Math.abs(Math.atan2(Math.sin(a - angle), Math.cos(a - angle))) < 1e-6);
    assert.ok(match, 'a beam went ' + angle.toFixed(3) + ' rad, which was never shown');
    assert.equal(beam.width, half, 'the beam is not the width it was drawn at');
  }
});

test('a spoke is a ray out of the ring and not a line across the room', () => {
  // This is what makes a gap a place to stand: the far side of the ring, on the same axis as a
  // spoke, is not where the light goes. `through: false` on the beam (game/beams.js) is the one
  // number that decides it, and it is decided per phase, not by the framework.
  const field = scriptedRun(74);
  const boss = bossOnTheField();
  catchItHolding(field, boss);
  const angle = spokeAngle(boss);
  assert.equal(WARDEN.phases[0].beam.through, false);

  steps(WARDEN.phases[0].windup + STEP * 2);
  const beams = [];
  for (let i = 0; i < field.beams.count; i++) beams.push(field.beams.items[i]);

  const beam = beams.find((b) => Math.abs(Math.atan2(b.dirY, b.dirX) - angle) < 1e-6);
  assert.ok(beam !== undefined, 'the spoke it was pointing down never fired');
  assert.equal(beam.back, 0, 'it reached behind the ring as well as in front of it');

  const r = boss.enemy.r;
  assert.equal(axisDistance(beam, boss.enemy.x - Math.cos(angle) * (r + 40), boss.enemy.y - Math.sin(angle) * (r + 40)),
    Infinity, 'standing behind the ring is not safe and it should be');
  assert.ok(axisDistance(beam, boss.enemy.x + Math.cos(angle) * (r + 40), boss.enemy.y + Math.sin(angle) * (r + 40))
    <= beam.width / 2, 'in front of it is not where the light went');
});

test('a volley costs one hull however many spokes come through', () => {
  // The same rule every beam in the game is held to (game/beams.js `swept`): eight rays in one
  // step is one thing happening. Without it a phase-3 volley would be eight pips at once, which
  // is not a hard fight, it is an instant death.
  const field = scriptedRun(75);
  const boss = bossOnTheField();
  const ship = field.player;
  ship.invuln = 0;
  const hull = ship.hull;

  // Park the ship dead in line with the first spoke, well out past the ring.
  catchItHolding(field, boss);
  const angle = spokeAngle(boss);
  ship.x = boss.enemy.x + Math.cos(angle) * (boss.enemy.r + 60);
  ship.y = boss.enemy.y + Math.sin(angle) * (boss.enemy.r + 60);
  ship.invuln = 0;

  steps(WARDEN.phases[0].windup + STEP * 4);
  assert.equal(ship.hull, hull - 1, 'a spoke through the ship cost ' + (hull - ship.hull) + ' hull');
});

test('a volley hurts the crowd it sweeps, and never the ring that fired it', () => {
  const field = scriptedRun(76);
  const boss = bossOnTheField();
  catchItHolding(field, boss);

  const angle = spokeAngle(boss);
  const gap = angle + spokeStep(boss) / 2;      // dead between two spokes
  const r = boss.enemy.r;
  const onSpoke = enemyAt('drifter', boss.enemy.x + Math.cos(angle) * (r + 70), boss.enemy.y + Math.sin(angle) * (r + 70));
  const offSpoke = enemyAt('drifter', boss.enemy.x + Math.cos(gap) * (r + 70), boss.enemy.y + Math.sin(gap) * (r + 70));
  const beforeBoss = boss.enemy.hp;
  const onBefore = onSpoke.hp;
  const offBefore = offSpoke.hp;

  // The drifter walks, so keep it where it was put: what is being measured is who the light
  // went through and not who happened to be standing there by the time it arrived.
  let guard = 0;
  while (boss.enemy.hp === beforeBoss && onSpoke.hp === onBefore && guard < 400) {
    onSpoke.x = boss.enemy.x + Math.cos(angle) * (r + 70);
    onSpoke.y = boss.enemy.y + Math.sin(angle) * (r + 70);
    offSpoke.x = boss.enemy.x + Math.cos(gap) * (r + 70);
    offSpoke.y = boss.enemy.y + Math.sin(gap) * (r + 70);
    stepTheWorld();
    guard++;
  }

  assert.ok(onSpoke.hp < onBefore, 'the body standing in the spoke it showed was untouched');
  assert.equal(offSpoke.hp, offBefore, 'a body in the gap next to it was burned as well');
  assert.equal(boss.enemy.hp, beforeBoss, 'its own volley went through its own ring');
});

test('a volley it never got to fire is a volley the run keeps', () => {
  // A sniper killed mid-lock never fires (game/beams.js); a boss whose phase changes under it
  // drops the volley it was holding for the same reason - the shape it was about to make was
  // the old shape's, and it does not have that shape any more.
  const field = scriptedRun(77);
  const boss = bossOnTheField();
  catchItHolding(field, boss);

  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[1] * 0.99;
  steps(STEP);
  assert.equal(bossPhase(boss), 2);
  field.beams.clear();

  steps(BALANCE.bosses.phaseBreak.time);
  assert.equal(field.beams.count, 0, 'the volley it was holding went off anyway');
  assert.equal(spokeCount(boss), 0);
});

// ---------------------------------------------------------------------------
// The three phases, as the same attack and a harder one
// ---------------------------------------------------------------------------

test('every phase is the same attack, and a harder one', () => {
  const phases = WARDEN.phases;
  assert.equal(phases.length, BALANCE.bosses.atHull.length);

  for (let i = 1; i < phases.length; i++) {
    const was = phases[i - 1];
    const now = phases[i];
    assert.ok(now.spokes > was.spokes, 'phase ' + (i + 1) + ' has no more spokes to dodge');
    assert.ok(now.turn > was.turn, 'phase ' + (i + 1) + ' does not ride any faster');
    assert.ok(now.wait < was.wait, 'phase ' + (i + 1) + ' is no less patient about aiming');
    assert.ok(now.windup > BALANCE.bosses.telegraphMin, 'phase ' + (i + 1) + ' is too quick to read');
    assert.ok(now.windup < was.windup, 'phase ' + (i + 1) + ' gives no more time to read it');
    assert.notEqual(now.tint, was.tint, 'phase ' + (i + 1) + ' is wearing the same colour');
  }
});

test('phase 2 is the same fight with six spokes, and phase 3 with eight', () => {
  const field = scriptedRun(78);
  const boss = bossOnTheField();
  const rows = WARDEN.phases;

  assert.equal(spokeCountOf(field, boss, 0), rows[0].spokes);

  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[1] * 0.99;
  steps(BALANCE.bosses.phaseBreak.time + 0.1);
  assert.equal(bossPhase(boss), 2);
  assert.equal(spokeCountOf(field, boss, 1), rows[1].spokes);
  assert.equal(spokeHalf(boss), rows[1].beam.halfWidth);

  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[2] * 0.99;
  steps(BALANCE.bosses.phaseBreak.time + 0.1);
  assert.equal(bossPhase(boss), 3);
  assert.equal(spokeCountOf(field, boss, 2), rows[2].spokes);

  // Eight spokes, so the gap between two of them is half what it was in phase 1: a phase 3
  // volley is a thing you dodge between rather than one you outrun.
  assert.equal(rows[2].spokes, 8);
  assert.ok(TAU / rows[2].spokes < TAU / rows[0].spokes, 'more spokes somehow made the gaps wider');
  assert.ok(spokeHalfOf(rows[2]) <= spokeHalfOf(rows[0]), 'the beams got fatter as well as more of them');
});

/** Walk a fresh boss of the given phase to its next lock and report what it holds up. */
function spokeCountOf(field, boss, phase) {
  while (boss.phase !== phase) stepTheWorld();
  catchItHolding(field, boss);
  return spokeCount(boss);
}

/** How wide a phase's spokes are, as game/beams.js will be told to draw them. */
function spokeHalfOf(row) {
  return row.beam.halfWidth;
}

test('it is still standing there, and shooting back, a minute later', () => {
  // Not a mechanic so much as a floor under the whole fight: the ring neither wanders off nor
  // stops, and the volleys keep coming, so the fight has a shape a player can learn.
  const field = scriptedRun(79);
  const boss = bossOnTheField();
  const box = field.field;
  let volleys = 0;
  let last = 0;

  for (let i = 0; i < 3600; i++) {
    stepTheWorld();
    if (boss.beams > last) { volleys++; last = boss.beams; }
    assert.ok(boss.enemy.x > box.x0 && boss.enemy.x < box.x1, 'the ring left the room it was given');
    assert.ok(boss.enemy.y > box.y0 && boss.enemy.y < box.y1);
  }

  assert.equal(bossPhase(boss), 1, 'it changed phase without anything hitting it');
  // Half a minute of the ring's own beat, which is `wait` + `windup` long. Two volleys' worth
  // of slack: the world is allowed to freeze for its own effects now and then.
  const beat = WARDEN.phases[0].wait + WARDEN.phases[0].windup;
  assert.ok(volleys >= Math.floor(28 / beat), 'only ' + volleys + ' volleys in half a minute of holding');
});
