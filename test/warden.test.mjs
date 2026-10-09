// The Warden (BALANCE.bosses.warden): the first boss, and the one the framework was written
// around. One attack, escalating over three phases (PLAN 3.4): a ring that rides round, stops
// dead, shows its spokes, and fires down them - and from phase 2, a second beat between the
// spokes: a ring of shots with a door in it, thrown down the same grammar of stop-show-fire.
//
// The framework - the schedule, the cage, the phases as beats, the going down - is
// test/bosses.test.mjs. What is proved here is the ring: that it points where it says it
// points, that the lines it draws are the lines that hurt, that the volley is a volley, that
// the door it lights is the door that arrives, and that each phase is the same attack and a
// harder one.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import { axisDistance } from '../src/game/beams.js';
import {
  armedCount, bossAngle, bossPhase, gapAngle, gapHalf, gapProgress,
  spokeAngle, spokeCount, spokeHalf, spokeProgress, spokeStep,
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

    // And a phase that keeps the bullet ring keeps it harder: more shots, a narrower door, a
    // shorter read. A phase 3 that dropped the phase-2 attack would be a different fight, and
    // PLAN 3.4 says the phases stack (game/bosses.js).
    if (was.bullets !== undefined) {
      assert.ok(now.bullets !== undefined, 'phase ' + (i + 1) + ' lost the ring it had');
      assert.ok(now.bullets.count > was.bullets.count, 'phase ' + (i + 1) + ' throws a thinner ring');
      assert.ok(now.bullets.gap < was.bullets.gap, 'phase ' + (i + 1) + ' leaves a wider door');
      assert.ok(now.bullets.windup > BALANCE.bosses.telegraphMin,
        'phase ' + (i + 1) + ' shows its door for less than any boss may');
      assert.ok(now.bullets.windup < was.bullets.windup, 'phase ' + (i + 1) + ' is slower to throw');
      assert.ok(now.bullets.shot.speed >= was.bullets.shot.speed,
        'phase ' + (i + 1) + ' throws slower shots');
    }
  }

  // Phase 1 is the fight the run has already been warned about by the arrival; the second beat
  // is what the phase-2 flare has to announce, so it does not exist before it.
  assert.equal(phases[0].bullets, undefined, 'phase 1 already has the phase-2 attack');
  assert.ok(phases[1].bullets !== undefined && phases[2].bullets !== undefined);
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

// ---------------------------------------------------------------------------
// The second beat: the ring of shots with a door in it (phase 2 and phase 3)
// ---------------------------------------------------------------------------

/** Walk it into phase 2 and drop the hull to where the mark is. */
function phaseTwo(field) {
  const boss = bossOnTheField();
  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[1] * 0.99;
  steps(BALANCE.bosses.phaseBreak.time + STEP);
  assert.equal(bossPhase(boss), 2, 'it did not get to phase 2');
  return boss;
}

/** Step until it is standing still with a ring armed, and hand back the boss. */
function catchItArming(boss) {
  let guard = 0;
  while (armedCount(boss) === 0 && guard < 4000) {
    stepTheWorld();
    guard++;
  }
  if (armedCount(boss) === 0) throw new Error('the ring never armed a volley');
  return boss;
}

/** The bearings the shots in the air are travelling along. */
function shotBearings(field) {
  const out = [];
  for (let i = 0; i < field.enemyShots.count; i++) {
    const shot = field.enemyShots.items[i];
    out.push(Math.atan2(shot.vy, shot.vx));
  }
  return out;
}

/** An angle folded into [-PI, PI]: the gap between two bearings, which is all it is used for. */
function fold(angle) {
  let a = angle;
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

/** The same, folded into [0, TAU): how far round a circle one bearing sits from another. */
function around(angle) {
  let a = angle % TAU;
  if (a < 0) a += TAU;
  return a;
}

test('phase 1 never throws a ring of shots', () => {
  // The second beat is what the phase-2 flare has to announce. A phase 1 that already had it
  // would leave the flare announcing something the run already knew (game/bosses.js).
  const field = scriptedRun(80);
  const boss = bossOnTheField();
  steps(WARDEN.phases[0].wait + WARDEN.phases[0].windup + 0.5);
  assert.ok(boss.beams > 0, 'phase 1 stopped firing its spokes');
  assert.equal(armedCount(boss), 0);
  assert.equal(field.enemyShots.count, 0);
});

test('the door opens where the ship is standing, and then holds still', () => {
  const field = scriptedRun(81);
  const boss = phaseTwo(field);
  const enemy = boss.enemy;
  const ship = field.player;

  // Park it well out and off to one side, so "towards the ship" is a bearing worth checking.
  ship.x = enemy.x - 300;
  ship.y = enemy.y + 180;
  ship.px = ship.x;
  ship.py = ship.y;
  catchItArming(boss);

  const want = Math.atan2(ship.y - enemy.y, ship.x - enemy.x);
  assert.ok(Math.abs(fold(gapAngle(boss) - want)) < 1e-9,
    'the door was lit ' + gapAngle(boss).toFixed(2) + ' rad, the ship is at ' + want.toFixed(2));

  // And it is a promise and not a searchlight: whatever the ship does next, the door it was
  // shown does not follow it round. A telegraph that tracked you would be a wall, not a door.
  const shown = gapAngle(boss);
  ship.y = enemy.y - 400;
  ship.py = ship.y;
  steps(WARDEN.phases[1].bullets.windup * 0.5);
  assert.equal(gapAngle(boss), shown, 'the door chased the ship');
});

test('the door is lit for the whole telegraph, and nothing is fired inside it', () => {
  const field = scriptedRun(82);
  const boss = phaseTwo(field);
  const spec = WARDEN.phases[1].bullets;
  catchItArming(boss);

  assert.equal(armedCount(boss), spec.count);
  assert.equal(gapHalf(boss), spec.gap);
  assert.ok(spec.windup >= BALANCE.bosses.telegraphMin);
  assert.equal(field.enemyShots.count, 0, 'it threw shots before it showed the door');

  // The light the door is drawn bright by is the countdown it fires on, same as a spoke.
  assert.ok(gapProgress(boss) < 0.2, 'it was already most of the way through its arming');
  steps(spec.windup * 0.5);
  const middle = gapProgress(boss);
  assert.ok(middle > 0.4 && middle < 0.8, 'the door is not telling the truth: ' + middle);
  assert.equal(field.enemyShots.count, 0, 'it threw the ring early');

  steps(spec.windup - middle * spec.windup + STEP);
  assert.equal(armedCount(boss), 0, 'it is still arming after it threw');
  assert.equal(gapProgress(boss), 0);
  assert.equal(field.enemyShots.count, spec.count, 'it threw a different number of shots than it armed');
});

test('not one shot is fired inside the door it showed', () => {
  const field = scriptedRun(83);
  const boss = phaseTwo(field);
  const spec = WARDEN.phases[1].bullets;
  catchItArming(boss);
  const shown = gapAngle(boss);
  const half = gapHalf(boss);
  steps(spec.windup + STEP * 2);

  const bearings = shotBearings(field);
  assert.ok(bearings.length > 0, 'the ring never left');
  for (const bearing of bearings) {
    assert.ok(Math.abs(fold(bearing - shown)) >= half,
      'a shot went down the door it was told to leave open');
  }

  // Evenly spread over what is left of the circle, and the door is the widest gap in the ring by
  // a distance: the answer it shows you is the best answer there is.
  const step = (TAU - half * 2) / spec.count;
  assert.ok(half * 2 > step * 3, 'the door is barely wider than the gap between two shots');
  const offs = bearings.map((b) => around(b - bearings[0])).sort((a, b) => a - b);
  for (let i = 1; i < offs.length; i++) {
    assert.ok(Math.abs((offs[i] - offs[i - 1]) - step) < 1e-9, 'the ring came out uneven');
  }
});

test('a ship standing in the door is not touched by the ring', () => {
  const field = scriptedRun(84);
  const boss = phaseTwo(field);
  const spec = WARDEN.phases[1].bullets;
  const ship = field.player;
  const enemy = boss.enemy;

  // Anywhere off the ring will do: the door opens on the ship's own bearing, which is the whole
  // honesty of the attack - the answer never asks the ship to travel somewhere it cannot.
  ship.x = enemy.x - 300;
  ship.y = enemy.y + 180;
  ship.px = ship.x;
  ship.py = ship.y;
  const radius = Math.hypot(ship.x - enemy.x, ship.y - enemy.y);
  catchItArming(boss);
  ship.invuln = 0;
  const hull = ship.hull;

  // Exactly as long as it takes the ring to reach the ship's own radius and go past it, and not a
  // second longer: the next beat is the spokes, and a ship standing 350 px from the ring is
  // standing where they go too. This test is about the ring.
  steps(spec.windup + (radius - enemy.r) / spec.shot.speed + 0.2);
  assert.equal(ship.hull, hull, 'the ring went through a ship standing in its door');
});

test('a ship outside the door is in the way of a shot', () => {
  const field = scriptedRun(85);
  const boss = phaseTwo(field);
  const spec = WARDEN.phases[1].bullets;
  const ship = field.player;
  const enemy = boss.enemy;

  ship.x = enemy.x - 300;
  ship.y = enemy.y + 180;
  ship.px = ship.x;
  ship.py = ship.y;
  const radius = Math.hypot(ship.x - enemy.x, ship.y - enemy.y);
  catchItArming(boss);
  const door = gapAngle(boss);
  ship.invuln = 0;
  const hull = ship.hull;

  steps(spec.windup + STEP * 2);

  // Slide out of the door and onto the line of a shot, at the same distance from the ring: no
  // heroics of aim required, because the ring is what it is - a fence with one door in it.
  const bearing = shotBearings(field)[0];
  assert.ok(Math.abs(fold(bearing - door)) >= gapHalf(boss), 'the shot is in the door');
  ship.x = enemy.x + Math.cos(bearing) * radius;
  ship.y = enemy.y + Math.sin(bearing) * radius;
  ship.px = ship.x;
  ship.py = ship.y;

  steps((radius - enemy.r) / spec.shot.speed + 0.4);
  assert.ok(ship.hull < hull,
    'a ship standing on the line of a shot it had been shown lost nothing');
  assert.ok(ship.hull >= hull - 1, 'one ring is one hull, whatever number of shots pass through');
});

test('the room stops the ring: a shot stops at the cage', () => {
  // The cage is the wall for the ship, so it is the wall for what is aimed at the ship
  // (game/enemyshots.js `caged`). A ring that sailed through it would leave the far side of the
  // duel free for nothing, and half of it would be wandering about outside the fight.
  const field = scriptedRun(86);
  const boss = phaseTwo(field);
  const spec = WARDEN.phases[1].bullets;
  catchItArming(boss);
  steps(spec.windup + STEP * 2);
  assert.ok(field.enemyShots.count > 0, 'nothing was thrown');

  const box = field.field;
  let guard = 0;
  while (field.enemyShots.count > 0 && guard < 4000) {
    stepTheWorld();
    guard++;
    for (let i = 0; i < field.enemyShots.count; i++) {
      const shot = field.enemyShots.items[i];
      assert.ok(shot.x >= box.x0 - 2 && shot.x <= box.x1 + 2
        && shot.y >= box.y0 - 2 && shot.y <= box.y1 + 2,
        'a shot the room owns walked out through its wall');
    }
  }
  assert.ok(guard < 4000, 'the shots outlived their lives instead of the wall');
  assert.ok(boss.enemy.hp > 0, 'the fight is still going, so this is not an empty arena');
});

test('the two beats take turns, and a ring it never threw is a ring the run keeps', () => {
  const field = scriptedRun(87);
  const boss = phaseTwo(field);
  let spokes = boss.volleys;
  let rings = boss.rings;
  let order = '';

  // Long enough for several of each: the rhythm is the thing being measured, and two beats that
  // came in clumps would read as two fights and not one.
  for (let i = 0; i < 3600; i++) {
    stepTheWorld();
    if (boss.rings > rings) { rings = boss.rings; order += 'R'; }
    if (boss.volleys > spokes) { spokes = boss.volleys; order += 'S'; }
  }

  assert.ok(spokes >= 3 && rings >= 3, 'one beat never came round: ' + order);
  assert.equal(order[0], 'R', 'a new phase did not open with whatever is new about it');
  for (let i = 1; i < order.length; i++) {
    assert.notEqual(order[i], order[i - 1], 'the beats came in clumps instead of turns: ' + order);
  }

  // And a ring interrupted mid-arming is dropped, exactly like a held volley (game/bosses.js
  // `openPhase`): the shape it was about to make belonged to the phase it is leaving.
  catchItArming(boss);
  field.enemyShots.clear();
  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[2] * 0.99;
  steps(BALANCE.bosses.phaseBreak.time);
  assert.equal(field.enemyShots.count, 0, 'the ring it was holding went off anyway');
  assert.equal(armedCount(boss), 0, 'it came out of the flare still arming');
});

test('phase 3 keeps the ring, and throws it harder', () => {
  const field = scriptedRun(88);
  const boss = bossOnTheField();
  const rows = WARDEN.phases;

  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[2] * 0.99;
  steps(BALANCE.bosses.phaseBreak.time + STEP);
  assert.equal(bossPhase(boss), 3);
  catchItArming(boss);

  assert.equal(armedCount(boss), rows[2].bullets.count);
  assert.equal(gapHalf(boss), rows[2].bullets.gap);
  assert.ok(gapHalf(boss) < rows[1].bullets.gap, 'the door did not narrow with the phase');
  assert.ok(armedCount(boss) > rows[1].bullets.count, 'the ring did not thicken with the phase');
  assert.ok(gapProgress(boss) < 1);

  // And it still leaves a door: eight spokes, twenty-six shots and a room, and the one thing
  // the fight may never run out of is a way to stand in it.
  steps(rows[2].bullets.windup + STEP * 2);
  const bearings = shotBearings(field);
  assert.equal(bearings.length, rows[2].bullets.count);
  const door = gapAngle(boss);
  for (const bearing of bearings) {
    assert.ok(Math.abs(fold(bearing - door)) >= gapHalf(boss), 'phase 3 filled the door');
  }
});
