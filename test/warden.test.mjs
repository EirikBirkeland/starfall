// The Warden (BALANCE.bosses.warden): the first boss, and the one the framework was written
// around. One attack, escalating over three phases (PLAN 3.4): a ring that rides round, stops
// dead, shows its spokes, and fires down them - and from phase 2, a second beat between the
// spokes: a ring of shots with a door in it, thrown down the same grammar of stop-show-fire. And
// from phase 3, a third: a call of darters sent out of the hoop itself. In that last phase the
// first two are thrown *together* - a wall of shots with the spokes down it, one halt answering
// two questions (`with`, game/balance.js) - which is what the last section of this file measures.
//
// The framework - the schedule, the cage, the phases as beats, the going down - is
// test/bosses.test.mjs. What is proved here is the ring: that it points where it says it
// points, that the lines it draws are the lines that hurt, that the volley is a volley, that
// the door it lights is the door that arrives, that the marks it lights are the bodies that
// come, and that each phase is the same attack and a harder one.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import { axisDistance } from '../src/game/beams.js';
import { damageEnemy } from '../src/game/enemies.js';
import {
  armedCount, bossAngle, bossFlare, bossPhase, callAngle, callCount, callProgress, callStand,
  callStep, carriedBeatsOf, gapAngle, gapHalf, gapProgress, isBossBody, spokeAngle, spokeCount,
  spokeHalf, spokeProgress, spokeStep, windupProgress,
} from '../src/game/bosses.js';
import {
  bossOnTheField, enemyAt, scriptedRun, stepTheWorld,
} from '../tools/headless/scripted.js';
import { thingsSent } from '../tools/boss-pressure.js';

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
    // Patience stopped being the escalation on its own the day a phase could buy a second promise
    // for the same halt out of its ride (game/balance.js `with`, game/bosses.js `takeBeat`): a
    // longer ride is honest only if that halt carries more, and a phase that merely got slower is
    // refused. What the phases really send per second is measured further down this file instead of
    // asserted from a table.
    if (now.wait > was.wait) {
      assert.ok(carriedBeatsOf(now).length > 0,
        'phase ' + (i + 1) + ' is less patient about aiming and asks nothing more at each halt');
    }
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

test('each phase of the ring sends more than the one before it, measured', () => {
  // The measured half of the test above. Once a halt can carry a second promise and pay for it out
  // of the ride, the table cannot say on its own which phase is the harder one, so this asks the
  // fight instead: held in each phase's own band of the bar for half a minute, and counted - shots
  // thrown, spokes fired, bodies called, per second of the arena (game/bosses.js keeps the tally).
  scriptedRun(106);
  const boss = bossOnTheField();
  const marks = BALANCE.bosses.atHull;
  const rate = [];
  for (let phase = 0; phase < WARDEN.phases.length; phase++) {
    const bottom = marks[phase + 1] === undefined ? 0 : marks[phase + 1];
    const share = (marks[phase] + bottom) / 2;
    const hold = () => { boss.enemy.hp = boss.enemy.maxhp * share; };
    let guard = 0;
    while ((bossPhase(boss) !== phase + 1 || bossFlare(boss) > 0) && guard++ < 6000) {
      hold();
      stepTheWorld();
    }
    assert.equal(bossPhase(boss), phase + 1, 'phase ' + (phase + 1) + ' never opened');
    const at = thingsSent(boss);
    let t = 0;
    while (t < 30 - 1e-9) {
      hold();
      stepTheWorld();
      t += STEP;
    }
    rate.push((thingsSent(boss) - at) / t);
  }
  for (let i = 1; i < rate.length; i++) {
    assert.ok(rate[i] > rate[i - 1], 'phase ' + (i + 1) + ' sends ' + rate[i].toFixed(2)
      + ' things a second, and phase ' + i + ' sent ' + rate[i - 1].toFixed(2));
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

// ---------------------------------------------------------------------------
// The third beat: a call of darters out of the hoop (phase 3)
// ---------------------------------------------------------------------------

/** Walk it into phase 3 and drop the hull to where that mark is. */
function phaseThree(field) {
  const boss = bossOnTheField();
  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[2] * 0.99;
  steps(BALANCE.bosses.phaseBreak.time + STEP);
  assert.equal(bossPhase(boss), 3, 'it did not get to phase 3');
  return boss;
}

/** Step until it is standing still with a call lit on the rim, and hand back the boss. */
function catchItCalling(boss) {
  let guard = 0;
  while (callCount(boss) === 0 && guard < 4000) {
    stepTheWorld();
    guard++;
  }
  if (callCount(boss) === 0) throw new Error('the ring never made a call');
  return boss;
}

/** Step until `said` is true, and say whether it ever was. */
function walkUntil(said, limit) {
  let guard = 0;
  while (!said() && guard < limit) {
    stepTheWorld();
    guard++;
  }
  return said();
}

/** The bearings of the marks it is showing, in the order they are lit. */
function markBearings(boss) {
  const out = [];
  const middle = (callCount(boss) - 1) / 2;
  for (let i = 0; i < callCount(boss); i++) out.push(callAngle(boss) + (i - middle) * callStep(boss));
  return out;
}

/** The darters in the arena. In a scripted world the only ones there are what was called. */
function dartsOn(field) {
  return field.enemies.filter((e) => e.type === 'darter');
}

test('no call comes out of the ring before phase 3', () => {
  // The call is what the phase-3 flare has to announce (game/bosses.js). A ring that had been
  // throwing darters since it arrived would be announcing something the run already knew, and
  // PLAN 3.4 puts the summons in the last phase on purpose: they are the reason to move when
  // everything else in the fight is a reason to stand still.
  const field = scriptedRun(90);
  const boss = bossOnTheField();
  steps(WARDEN.phases[0].wait + WARDEN.phases[0].windup + 0.5);
  assert.ok(boss.beams > 0, 'phase 1 stopped firing its spokes');
  assert.equal(boss.calls, 0);
  assert.equal(boss.summons, 0);
  assert.equal(dartsOn(field).length, 0);

  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[1] * 0.99;
  steps(BALANCE.bosses.phaseBreak.time + 20);
  assert.equal(bossPhase(boss), 2);
  assert.ok(boss.rings > 0, 'phase 2 stopped throwing its rings');
  assert.equal(boss.calls, 0, 'phase 2 already had the phase-3 attack');
  assert.equal(dartsOn(field).length, 0);
});

test('phase 3 opens with its call, and its call alone', () => {
  const field = scriptedRun(91);
  const boss = phaseThree(field);
  assert.equal(boss.calls, 0, 'the flare itself sent bodies');

  catchItCalling(boss);
  assert.equal(boss.calls, 0, 'it made a call before the marks had been lit');
  assert.equal(callCount(boss), WARDEN.phases[2].call.count);

  // The one question the body's own light asks without knowing what the attack plan turns out to
  // be (render/boss.js): is something coming? A call is something coming. It reads 0 the instant
  // the marks light, like the door's own countdown does, so it is asked halfway through.
  assert.equal(windupProgress(boss), 0, 'it lit the marks already half-fired');
  steps(WARDEN.phases[2].call.windup * 0.5);
  assert.ok(windupProgress(boss) > 0.4, 'the ring looked like nothing was about to happen');
  assert.equal(callCount(boss), WARDEN.phases[2].call.count, 'it stopped showing them halfway');
});

test('the marks it lights are the bodies that come out of them', () => {
  const field = scriptedRun(92);
  const boss = phaseThree(field);
  const spec = WARDEN.phases[2].call;
  const enemy = boss.enemy;
  catchItCalling(boss);

  assert.equal(callStep(boss), spec.step);
  assert.equal(callStand(boss), spec.gap);
  assert.ok(spec.windup >= BALANCE.bosses.telegraphMin,
    'the marks are lit for less than any boss may show a thing');
  assert.ok(callProgress(boss) < 0.2, 'it was already most of the way through its call');

  const shown = markBearings(boss);
  const crowd = field.enemies.length;

  // The step the call fires on, and not one step more: what is being measured is where the
  // bodies were born, and a dart walks from the moment it exists.
  walkUntil(() => boss.summons > 0, 2000);
  assert.equal(boss.summons, spec.count, 'it sent a different number of bodies than it lit');
  assert.equal(field.enemies.length, crowd + spec.count);
  assert.equal(callCount(boss), 0, 'it is still showing marks after it sent them');
  assert.equal(callAngle(boss), null, 'it has a bearing to point at with no call being made');

  for (const body of field.enemies.slice(crowd)) {
    const bearing = Math.atan2(body.y - enemy.y, body.x - enemy.x);
    const onAMark = shown.some((a) => Math.abs(fold(bearing - a)) < 1e-9);
    assert.ok(onAMark, 'a dart came out of a bearing that was never lit');
    const out = Math.hypot(body.x - enemy.x, body.y - enemy.y);
    assert.ok(out >= enemy.r + spec.gap - 1e-6,
      'a dart was born inside the hoop that is hurt on contact: ' + out);
  }
});

test('a call is made on the far side of the ring, and the marks hold', () => {
  const field = scriptedRun(93);
  const boss = phaseThree(field);
  const enemy = boss.enemy;
  const ship = field.player;

  // Anywhere off the ring: what matters is the bearing the ring is turned away on.
  ship.x = enemy.x + 300;
  ship.y = enemy.y - 180;
  ship.px = ship.x;
  ship.py = ship.y;
  catchItCalling(boss);

  const shipBearing = Math.atan2(ship.y - enemy.y, ship.x - enemy.x);
  for (const mark of markBearings(boss)) {
    assert.ok(Math.abs(fold(mark - shipBearing)) > Math.PI / 2,
      'a dart was lit on the near side, where the ship stands when it is dodging spokes');
  }

  // And held, exactly like the door: the marks are a promise and not a searchlight, so whatever
  // the ship does now the bodies come out of the places it was shown.
  const shown = markBearings(boss);
  ship.x = enemy.x - 500;
  ship.y = enemy.y + 400;
  ship.px = ship.x;
  ship.py = ship.y;
  steps(WARDEN.phases[2].call.windup * 0.5);
  const still = markBearings(boss);
  for (let i = 0; i < shown.length; i++) {
    assert.equal(still[i], shown[i], 'the marks chased the ship');
  }
});

test('it calls again when the run has answered the last call, and not before', () => {
  const field = scriptedRun(94);
  const boss = phaseThree(field);
  catchItCalling(boss);
  steps(WARDEN.phases[2].call.windup + STEP);
  assert.equal(boss.calls, 1);
  assert.equal(dartsOn(field).length, WARDEN.phases[2].call.count);

  // A minute of the fight, watched a step at a time: a second pack sent over one that is still
  // hunting the ship would be the ring filling its own cage with its own summons instead of
  // fighting (game/bosses.js `alternateBeats`), so the second call is timed off the darters and not
  // off a clock - and note that the fight's own spokes sweep its own darters away, so "answered" is
  // not only ever something the run does.
  let emptied = -1;
  let second = -1;
  const minutes = Math.round(60 / STEP);
  for (let i = 0; i < minutes; i++) {
    stepTheWorld();
    if (emptied < 0 && dartsOn(field).length === 0) emptied = i;
    if (second < 0 && boss.calls > 1) second = i;
  }
  if (emptied < 0) {
    assert.equal(second, -1, 'it called again with every one of its darters still hunting');
  } else {
    assert.ok(second === -1 || second > emptied,
      'it called again over a call that was still standing');
  }
  assert.ok(boss.volleys > 1 && boss.rings > 0, 'and it stopped fighting while it waited');

  // Answer whatever is left of it, and it calls again on the next ride.
  for (const dart of dartsOn(field)) damageEnemy(field, dart, 999, true);
  assert.equal(dartsOn(field).length, 0);
  const calls = boss.calls;
  assert.ok(walkUntil(() => boss.calls > calls, 4000), 'the ring went quiet once its darters died');
  assert.equal(dartsOn(field).length, WARDEN.phases[2].call.count);
});

test('a call does not disturb the two beats it is made between', () => {
  const field = scriptedRun(95);
  const boss = phaseThree(field);
  let spokes = boss.volleys;
  let rings = boss.rings;
  let calls = boss.calls;
  let order = '';

  for (let i = 0; i < 4000; i++) {
    stepTheWorld();
    if (boss.rings > rings) { rings = boss.rings; order += 'R'; }
    if (boss.volleys > spokes) { spokes = boss.volleys; order += 'S'; }
    if (boss.calls > calls) { calls = boss.calls; order += 'C'; }
  }

  assert.ok(calls >= 1 && spokes >= 3 && rings >= 3, 'a beat never came round: ' + order);
  assert.equal(order[0], 'C', 'a new phase did not open with whatever is new about it');

  // Take the calls out and what is left is the phase-2 rhythm, untouched: the call is a beat the
  // ring borrows when its own call is empty, not a third of a new one it has learned to count.
  const beats = order.split('').filter((c) => c !== 'C');
  for (let i = 1; i < beats.length; i++) {
    assert.notEqual(beats[i], beats[i - 1], 'the two beats lost their turn: ' + order);
  }
});

test('a dart out of a call is one of the crowd', () => {
  // Not a boss minion kind, not a second body to learn: `makeEnemy` with the crowd's own darter
  // at the hull the run's clock has brought it to (game/bosses.js `sendCall`). Which is what
  // makes every gun, blast, fire and bolt in the game already know how to hit it.
  const field = scriptedRun(96);
  const boss = phaseThree(field);
  catchItCalling(boss);
  steps(WARDEN.phases[2].call.windup + STEP);

  const dart = dartsOn(field)[0];
  assert.ok(dart !== undefined, 'no dart came out of the call');
  assert.equal(dart.type, 'darter');
  assert.equal(isBossBody(field, dart), false);
  assert.ok(dart.hp > 0);
  // It was counted as an arrival, so the balance tables see it and do not mistake it for a drifter.
  const row = field.tally.kinds.darter;
  assert.ok(row.arrived > 0, 'the tally never heard about it');

  const score = field.score;
  const kills = field.kills;
  assert.equal(damageEnemy(field, dart, 999, true), true, 'nothing hurts it');
  assert.ok(field.score > score && field.kills > kills, 'it died without being paid for');
  assert.equal(dartsOn(field).length, WARDEN.phases[2].call.count - 1, 'it is still in the crowd');
});

test('what the ring called goes down with the ring', () => {
  // The bodies were the fight's and not the arena's. A duel that ended with one of them still
  // going at the ship would end on a loose end and not on the chord (game/bosses.js `dismissCall`).
  const field = scriptedRun(97);
  const boss = phaseThree(field);
  catchItCalling(boss);
  steps(WARDEN.phases[2].call.windup + STEP);
  const darts = dartsOn(field);
  assert.ok(darts.length > 0);

  damageEnemy(field, boss.enemy, boss.enemy.maxhp * 10, true);
  // The ring's own death is the biggest in the game, and it holds the world breathless while it
  // happens (row.death.hitStop): the going-down is a beat, not an instant.
  steps(0.4);
  assert.equal(field.boss, null);
  for (const dart of darts) {
    assert.ok(dart.hp <= 0, 'one of its darters is still hunting the ship');
    assert.equal(field.enemies.includes(dart), false);
  }
});

test('a call it never sent is a call the run never sees', () => {
  // The same rule the held volley and the half-armed ring are held to: a promise broken in the
  // run's favour. The marks go out with the ring that was lighting them.
  const field = scriptedRun(98);
  const boss = phaseThree(field);
  catchItCalling(boss);
  assert.equal(boss.calls, 0, 'the marks were lit after the call had already been made');
  assert.equal(dartsOn(field).length, 0);

  damageEnemy(field, boss.enemy, boss.enemy.maxhp * 10, true);
  steps(0.4);
  assert.equal(field.boss, null);
  assert.equal(boss.calls, 0, 'it sent the call it was still lighting');
  assert.equal(dartsOn(field).length, 0, 'the bodies it was about to send came anyway');
  // And nothing about the retired fight is reachable any more: the world is the only door the
  // frame and the framework read, and it has no boss in it to light marks or make calls.
  assert.equal(field.enemies.length, 0, 'something outlived the fight');
});

test('the call is priced like the phase it belongs to', () => {
  const rows = WARDEN.phases;
  assert.equal(rows[0].call, undefined, 'phase 1 already had the summons');
  assert.equal(rows[1].call, undefined, 'phase 2 already had the summons');
  const spec = rows[2].call;
  assert.ok(spec.windup >= BALANCE.bosses.telegraphMin);
  assert.ok(spec.windup < rows[2].windup + 0.3, 'the call takes the whole of the phase to make');
  assert.equal(spec.type, 'darter', 'PLAN 3.4 says darters');
  assert.ok(spec.count <= 4, 'a call of ' + spec.count + ' is a swarm and not a summons');
  // The fan reaches from the bearing it is centred on by (count-1)/2 steps each way, and it must
  // stay on the far half of the hoop or a body is lit on the near side (test above).
  assert.ok(((spec.count - 1) / 2) * spec.step < Math.PI / 2, 'the fan wraps round onto the ship');
});

// ---------------------------------------------------------------------------
// The paired stop: the ring thrown *with* the spokes (phase 3)
// ---------------------------------------------------------------------------

/** Step until it is standing still with a door lit *and* spokes drawn, and hand back the boss. */
function catchItPaired(boss) {
  let guard = 0;
  while (spokeCount(boss) === 0 || armedCount(boss) === 0) {
    stepTheWorld();
    if (++guard > 4000) throw new Error('the ring never threw its ring with its spokes');
  }
  return boss;
}

/** Which promises it is showing right now, as a word: '' when it is riding and showing none. */
function promises(boss) {
  return (spokeCount(boss) > 0 ? 'S' : '') + (armedCount(boss) > 0 ? 'R' : '')
    + (callCount(boss) > 0 ? 'C' : '');
}

test('phase 3 shows the door and the spokes in one halt, each with its own row on it', () => {
  const field = scriptedRun(100);
  const boss = phaseThree(field);
  const rows = WARDEN.phases[2];

  catchItPaired(boss);
  assert.equal(spokeCount(boss), rows.spokes, 'the carried volley is not the phase\'s own');
  assert.equal(spokeHalf(boss), rows.beam.halfWidth, 'the carried spokes are not drawn as wide as they hurt');
  assert.equal(armedCount(boss), rows.bullets.count, 'the ring is not the phase\'s own');
  assert.equal(gapHalf(boss), rows.bullets.gap, 'the door is not the phase\'s own');

  // The two halves of the telegraph are drawn from the numbers they are kept to, so the beams and
  // the shots that arrive are the lines and the wedge the ship was shown, edge for edge - and the
  // door is still opened on the ship even with a volley going out at the same moment.
  const angles = spokeAngles(boss);
  assert.equal(angles.length, rows.spokes);
  const ship = field.player;
  const door = gapAngle(boss);
  const bearing = Math.atan2(ship.y - boss.enemy.y, ship.x - boss.enemy.x);
  assert.ok(Math.abs(fold(door - bearing)) < 0.02,
    'the door it is showing is not opened on the ship');

  // And the ask has an answer in it: some bearing inside the door is off every spoke line by more
  // than a spoke is wide, at a distance a ship is usually standing. A door that was all spoke would
  // be a halt with nowhere to stand, which is the one thing a pair may not be.
  const reach = 300;
  const clearance = Math.asin(spokeHalf(boss) / reach);
  let room = 0;
  for (let a = -gapHalf(boss); a <= gapHalf(boss); a += 0.01) {
    if (angles.every((s) => Math.abs(fold(door + a - s)) > clearance)) room += 0.01;
  }
  assert.ok(room > 0.2, 'the door it opens is all spoke: ' + room.toFixed(2) + ' rad of it is standable');
});

test('the pair is held for the longer wind-up and both halves land on the same step', () => {
  const field = scriptedRun(101);
  const boss = phaseThree(field);
  const rows = WARDEN.phases[2];
  const shown = Math.max(rows.windup, rows.bullets.windup);
  assert.ok(shown >= BALANCE.bosses.telegraphMin,
    'a promise shorter than any boss may show is being carried into a stop');

  catchItPaired(boss);
  // One clock, so one answer to "how far through it are you" - and the pair is asked of both halves
  // rather than each being timed by its own row (game/bosses.js `takeBeat`).
  assert.ok(Math.abs(spokeProgress(boss) - gapProgress(boss)) < 1e-12,
    'the two halves of one stop are keeping two clocks');

  const volleys = boss.volleys;
  const rings = boss.rings;
  steps(shown - 0.05);
  assert.ok(spokeCount(boss) > 0 && armedCount(boss) > 0,
    'a half of the pair landed before the longer wind-up was up');
  assert.equal(boss.volleys, volleys, 'the spokes fired early');
  assert.equal(boss.rings, rings, 'the ring threw early');

  steps(0.1);
  assert.equal(boss.volleys, volleys + 1, 'the spokes did not fire with the ring');
  assert.equal(boss.rings, rings + 1, 'the ring did not throw with the spokes');
  assert.equal(spokeCount(boss), 0, 'it is still drawing spokes it has fired');
  assert.equal(armedCount(boss), 0, 'it is still showing a door it has thrown');
  assert.ok(field.beams.count >= rows.spokes, 'the spokes it drew did not arrive');
  assert.ok(field.enemyShots.count >= rows.bullets.count, 'the wall it showed did not arrive');
});

test('the plain spoke halt is gone from the phase that carries one', () => {
  // A carried beat is not a beat the phase takes on its own (game/bosses.js `beatsOf`): a fight
  // that has begun asking both questions stops asking the small one beside them, which is the
  // difference between a denser stop and a louder fight.
  const field = scriptedRun(102);
  const boss = phaseThree(field);
  const seen = new Set();
  for (let i = 0; i < 6000; i++) {
    const now = promises(boss);
    if (now !== '') seen.add(now);
    stepTheWorld();
  }
  assert.ok(seen.has('SR'), 'it never threw a ring with its spokes: ' + [...seen].join(' '));
  assert.equal(seen.has('S'), false, 'it still halts for spokes on their own');
  assert.equal(seen.has('R'), false, 'it still halts for a ring on its own');
  assert.equal(field.boss, boss, 'the fight ended in the middle of the look');
});

test('a phase that carries nothing still alternates, so the pair is a phase and not a rule', () => {
  // The control on the test above: phase 2 has the same two rows and no `with`, and there the two
  // beats do take turns - so what the last phase does is the row's doing and not the framework's.
  const field = scriptedRun(103);
  const boss = phaseTwo(field);
  const seen = new Set();
  for (let i = 0; i < 4000; i++) {
    const now = promises(boss);
    if (now !== '') seen.add(now);
    stepTheWorld();
  }
  assert.ok(seen.has('S') && seen.has('R'), 'phase 2 stopped alternating: ' + [...seen].join(' '));
  assert.equal(seen.has('SR'), false, 'phase 2 was told to carry a volley and nobody wrote it');
  assert.equal(field.boss, boss, 'the fight ended in the middle of the look');
});

test('a flare puts down both halves of a stop it never let land', () => {
  // The rule every promise here is held to (game/bosses.js `openPhase`), asked of a pair: a stop
  // the run interrupted is a stop the run keeps, and the second half is not allowed to fire on
  // the way out. Phase 2 is written to carry for the length of the test and put back after it.
  const shipped = WARDEN.phases[1].bullets.with;
  try {
    WARDEN.phases[1].bullets.with = 'spokes';
    const field = scriptedRun(104);
    const boss = phaseTwo(field);
    catchItPaired(boss);
    const volleys = boss.volleys;
    const rings = boss.rings;
    field.enemyShots.clear();

    boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[2] * 0.99;
    steps(BALANCE.bosses.phaseBreak.time + STEP);
    assert.equal(bossPhase(boss), 3, 'the flare did not happen');
    assert.equal(boss.volleys, volleys, 'the flare fired the spokes it was holding');
    assert.equal(boss.rings, rings, 'the flare threw the ring it was holding');
    assert.equal(field.enemyShots.count, 0, 'shots are in the air that the phase left behind');
  } finally {
    WARDEN.phases[1].bullets.with = shipped;
  }
  assert.equal(WARDEN.phases[1].bullets.with, undefined, 'the test left its patch on the table');
});

// ---------------------------------------------------------------------------
// The call is a turn of the rotation, not a jump of it
// ---------------------------------------------------------------------------

test('a run that answers every pack does not turn the ring into a summoner', () => {
  // The rule the rotation is there for, and the shape the game shipped without. A call used to jump
  // the queue whenever the room happened to be clear, so a strong run that killed each pack inside
  // one ride got a fight that did nothing *else*: measured over a minute of this phase with every
  // pack gone the step it landed, the queue-jumping rule spent seventeen stops of seventeen on
  // calls and never lit its door once. On the rotation (game/bosses.js `alternateBeats`) a call is
  // one turn of the fight and the wall keeps coming round.
  const field = scriptedRun(99);
  const boss = phaseThree(field);
  const order = [];
  let calls = boss.calls;
  let walls = boss.rings;

  for (let i = 0; i < Math.round(60 / STEP); i++) {
    stepTheWorld();
    if (boss.calls > calls) { order.push('C'); calls = boss.calls; }
    if (boss.rings > walls) { order.push('R'); walls = boss.rings; }
    for (const dart of dartsOn(field)) damageEnemy(field, dart, 999, false);
  }

  const made = order.filter((c) => c === 'C').length;
  const thrown = order.filter((c) => c === 'R').length;
  assert.ok(made >= 3, 'it made ' + made + ' calls in a minute: ' + order.join(''));
  assert.ok(thrown >= 3, 'it threw its wall ' + thrown + ' times in a minute: ' + order.join(''));
  assert.equal(order.includes('CC'), false,
    'two calls came from two stops in a row: ' + order.join(''));
});
