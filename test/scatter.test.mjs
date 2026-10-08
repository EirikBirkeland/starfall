// Scatter (PLAN 3.2), the second primary: what a cone of six short-ranged pellets does
// in the world, as opposed to what a pulse does.
//
//   * the fan is PLAN's thirty degrees, and the shot you aimed is one of the six;
//   * the reach is the trade - bodies past it are simply not this gun's problem;
//   * every pellet is a whole one of the gun's own shots, and a whole pull costs the
//     crowd exactly the weight the gun says it does;
//   * a pellet shoves harder than a pulse shot, which is what short range costs the crowd
//     and what it pays the player back with;
//   * one pull is one sound, however many pellets came with it;
//   * and the two secondary systems that hurt on their own - the orbital ring and the nova
//     - cost a body the same whatever was picked for the trigger. That is a decision, not
//     an accident: see BALANCE.bullets and NOTES session 33.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { clearCues, drainCues } from '../src/game/cues.js';
import { fire, setWeapon, shotsPerSecond } from '../src/game/weapons.js';
import { scriptedRun, enemyAt, stepTheWorld } from '../tools/headless/scripted.js';

const STEP = BALANCE.sim.step;
const PULSE = BALANCE.weapons.pulse;
const SCATTER = BALANCE.weapons.scatter;
const UNIT = BALANCE.bullets.damage;

/** Every cue one pull of the trigger asked the audio layer for. */
function cuesOfPull(field) {
  clearCues();
  fire(field);
  const cues = [];
  drainCues((cue) => cues.push(cue));
  return cues;
}

/**
 * Plant a wall of bodies across the fan and answer the total hull one pull took out of
 * it. The wall is wider than the widest pellet of the fan at that range, so a pull that
 * fires all of its weight lands all of it here.
 */
function hullLostInOnePull(field, range) {
  const ship = field.player;
  const wall = [];
  for (let i = -3; i <= 3; i++) {
    wall.push(enemyAt('drifter', ship.x + i * 16, ship.y - range, 1000));
  }

  const before = wall.reduce((sum, body) => sum + body.hp, 0);
  fire(field);
  let steps = 0;
  while (field.bullets.count > 0 && steps++ < 400) stepTheWorld({});
  assert.ok(steps < 400, 'the shots finished flying');

  return before - wall.reduce((sum, body) => sum + body.hp, 0);
}

/**
 * Stand one body `range` px up the nose and hold the trigger for longer than the longest
 * shot in the game lives. Answers whether that body was ever touched.
 */
function reaches(field, range) {
  const ship = field.player;
  const body = enemyAt('drifter', ship.x, ship.y - range, 100000);
  let steps = 0;
  while (steps++ < Math.ceil(PULSE.life / STEP) + 2) stepTheWorld({ firing: true });
  return body.hp < 100000;
}

/**
 * How far one body walks away from where it was planted, in the half second after one
 * pull of `id`'s gun at it from `range` px.
 */
function shove(seed, id, range) {
  const field = scriptedRun(seed);
  setWeapon(field, id);
  const ship = field.player;
  const body = enemyAt('drifter', ship.x, ship.y - range, 100000);
  const home = { x: body.x, y: body.y };

  fire(field);
  let furthest = 0;
  for (let i = 0; i < Math.round(0.6 / STEP); i++) {
    stepTheWorld({});
    furthest = Math.max(furthest, Math.hypot(body.x - home.x, body.y - home.y));
  }
  return furthest;
}

test('the cone is PLAN thirty degrees, with a pellet on the aim', () => {
  const field = scriptedRun(400);
  setWeapon(field, 'scatter');
  const ship = field.player;

  field.bullets.clear();
  fire(field);
  const shots = field.bullets.items.slice(0);
  assert.equal(shots.length, SCATTER.pellets);

  const leans = shots.map((shot) => {
    const lean = Math.atan2(shot.vy, shot.vx) - ship.angle;
    return Math.atan2(Math.sin(lean), Math.cos(lean));
  });
  const sorted = leans.slice(0).sort((a, b) => a - b);

  // The first shot out is the aimed one, and it is the heaviest thing in the fan only in
  // the sense that it is the one the player pointed: a shotgun's pellets are all one shot
  // (game/weapons.js), so this checks the aim and not the weight.
  assert.ok(Math.abs(leans[0]) <= SCATTER.spread + 1e-9, 'one pellet goes where you pointed');

  // Five gaps of the gun's own spread from the first pellet to the last, which is the
  // thirty degrees PLAN asks for - and evenly spaced, because a cone with a hole in the
  // middle is two cones.
  const span = sorted[sorted.length - 1] - sorted[0];
  assert.ok(Math.abs(span - (SCATTER.pellets - 1) * SCATTER.gap) <= SCATTER.spread * 2,
    'the cone spans ' + span.toFixed(3) + ' rad, wanted ' + ((SCATTER.pellets - 1) * SCATTER.gap).toFixed(3));
  assert.ok(Math.abs(span - Math.PI / 6) < 0.1, 'and that is about thirty degrees');

  for (let i = 1; i < sorted.length; i++) {
    assert.ok(Math.abs((sorted[i] - sorted[i - 1]) - SCATTER.gap) <= SCATTER.spread * 2,
      'evenly, gap by gap');
  }
});

/**
 * Hold the trigger for `seconds` at one body standing `range` px up the nose, and answer
 * the hull a second that cost it - averaged over six seeds, because one body catches a
 * handful of pellets and which of them land is a coin toss the logic stream has to agree
 * to. One body, no crowd: this is what a gun really does to the thing it is aimed at, as
 * opposed to what its numbers say it does.
 */
function loneBodyRate(range, seconds, id) {
  let total = 0;
  for (let seed = 11; seed <= 16; seed++) {
    const field = scriptedRun(seed);
    if (id !== undefined) setWeapon(field, id);
    const ship = field.player;
    const body = enemyAt('drifter', ship.x, ship.y - range, 1e6);
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i++) stepTheWorld({ firing: true });
    total += (1e6 - body.hp) / seconds;
  }
  return total / 6;
}

test('it is a short gun, and the reach is the weapon\'s own', () => {
  // The trade the whole weapon is: heavy, and closer. These two ranges are far enough
  // apart that no amount of lead, aim error or recoil can blur the answer - the scatter's
  // reach is `speed x life`, 370 px, and the pulse reaches twice that again.
  const near = scriptedRun(401);
  setWeapon(near, 'scatter');
  assert.ok(reaches(near, 300), 'a body at 300 px is this gun\'s business');

  const far = scriptedRun(402);
  setWeapon(far, 'scatter');
  assert.ok(!reaches(far, 470), 'a body at 470 px is not, however long the trigger is held');

  const pulse = scriptedRun(403);
  assert.ok(reaches(pulse, 470), 'and the pulse reaches that body and two of them beyond it');
});

test('a whole pull costs the crowd a whole pull of the gun\'s weight', () => {
  const field = scriptedRun(404);
  setWeapon(field, 'scatter');
  const wanted = SCATTER.pellets * SCATTER.damage;
  const lost = hullLostInOnePull(field, 110);
  assert.ok(Math.abs(lost - wanted) < 1e-9,
    'six pellets of a whole body cost six hull, not ' + lost);

  // And the same wall at a distance the pellets never reach: the weight is real, the range
  // is the price. A single pulse shot through the same wall at the same range touches one
  // body, which is one hull, and that is the whole comparison of the two guns.
  const away = scriptedRun(405);
  setWeapon(away, 'scatter');
  assert.equal(hullLostInOnePull(away, 600), 0, 'past the reach there is nothing');

  const pulse = scriptedRun(406);
  const pulseLost = hullLostInOnePull(pulse, 110);
  assert.ok(Math.abs(pulseLost - PULSE.damage) < 1e-9, 'one shot, one body, one hull');
});

test('a lone body is worth more up close and less far off, which is the weapon', () => {
  // The whole trade, measured one body at a time. A cone spends most of itself on air -
  // at 150 px a 30-degree fan is 78 px across and a drifter is thirty of them - so what
  // arrives is a fraction of what left, and the fraction shrinks with distance. What that
  // has to mean, or the scatter is just a worse gun with a longer fuse: nearer than the
  // pulse's comfort it must win, further out it must lose, and the two must cross where a
  // player can stand.
  //
  // `damage: 1` per pellet is where that crossed. At half a hull a pellet - my first guess,
  // and the reading of PLAN's "7 x 6" as a share of a pull - the middle row of the table in
  // BALANCE.weapons.scatter read 1.75 against 4.00 instead, and forty bot runs medianed
  // 3m53s against the pulse's 15m00s (NOTES session 33).
  const seconds = 3;
  const CROSSOVER = 150;

  const cross = loneBodyRate(CROSSOVER, seconds, 'scatter');
  const crossPulse = loneBodyRate(CROSSOVER, seconds);
  assert.ok(cross > crossPulse * 0.8 && cross < crossPulse * 1.25,
    'at the distance a fight usually happens the two guns cost a body about the same: '
    + cross.toFixed(2) + ' against ' + crossPulse.toFixed(2));

  const close = loneBodyRate(60, seconds, 'scatter');
  const closePulse = loneBodyRate(60, seconds);
  assert.ok(close > closePulse * 1.2,
    'and standing where the crowd is, it is the heavier gun: ' + close.toFixed(2)
    + ' against ' + closePulse.toFixed(2));

  const far = loneBodyRate(300, seconds, 'scatter');
  const farPulse = loneBodyRate(300, seconds);
  assert.ok(far < farPulse * 0.8,
    'and out at the pulse\'s own reach it is the lighter one: ' + far.toFixed(2)
    + ' against ' + farPulse.toFixed(2));

  // The pull that left the gun was six pellets; the pull that arrived at one small body at
  // the crossover range was a fraction of it. That is what a cone costs, and the reason the
  // weight per pellet had to come up to pay for it.
  const nominal = (seconds + 1) * SCATTER.fireRate * SCATTER.pellets * SCATTER.damage;
  assert.ok(cross * seconds < nominal * 0.6,
    'the cone spends most of itself on air: ' + (cross * seconds / nominal).toFixed(2)
    + ' of the fan arrived');
});

test('a pellet shoves harder than a pulse shot', () => {
  // PLAN's "heavy knockback", measured on one body with nothing else around it: the
  // impulse it walks away with is what the shove was worth.
  const pulse = shove(408, 'pulse', 100);
  const scatter = shove(409, 'scatter', 100);

  assert.ok(pulse > 0, 'a pulse shot nudges a body');
  assert.ok(scatter > pulse * 2, 'six pellets of a scatter throw it: '
    + scatter.toFixed(1) + ' px against ' + pulse.toFixed(1));
});

test('six pellets are one pull and one sound', () => {
  // The mix has no voice limiting until milestone 7, and six thumps per pull would be a
  // buzz rather than a gunshot (game/weapons.js).
  const field = scriptedRun(410);
  assert.equal(cuesOfPull(field).length, 1, 'the pulse queues one cue');

  setWeapon(field, 'scatter');
  const cues = cuesOfPull(field);
  assert.equal(cues.length, 1, 'and so does a cone of six');
  assert.ok(cues[0].freq < PULSE.sound.base, 'and it is the lower, heavier one');
});

test('a run may pull twice a second and still be a scatter', () => {
  // The cycle is the gun's, so six pellets leave and then the gun waits: the number of
  // projectiles a second is the rate times the pellets, and nothing about the fan makes
  // the trigger faster.
  const field = scriptedRun(411);
  setWeapon(field, 'scatter');
  const perSecond = shotsPerSecond(field);
  const ship = field.player;

  const pulls = [];
  for (let i = 0; i < 200 && pulls.length < 3; i++) {
    const before = field.bullets.count;
    stepTheWorld({ firing: true });
    if (field.bullets.count > before) pulls.push(field.bullets.count - before);
  }
  assert.equal(pulls.length, 3, 'three pulls in the window');
  for (const pull of pulls) assert.equal(pull, SCATTER.pellets, 'each of them a whole fan');
  assert.ok(Math.abs(ship.fireTimer - 1 / perSecond) < 1e-9, 'and the wait is the gun\'s own');
});

test('the orbital ring bites the same whatever is being flown', () => {
  // The decision of the session, written as an assertion: a bite is one shot of the
  // plain gun (BALANCE.bullets, the unit enemy hull is counted in) and not one pellet of
  // whatever happens to be in the trigger. A ring priced off a scatter's pellet would be
  // worth twice what the same card is worth on a pulse, for a reason nobody picked.
  const bite = UNIT * BALANCE.upgrades.orbitals.weight;
  const answer = {};
  for (const id of ['pulse', 'scatter']) {
    const field = scriptedRun(412);
    setWeapon(field, id);
    field.upgrades.orbitals = 1;

    const ship = field.player;
    const ring = BALANCE.upgrades.orbitals.radius;
    const body = enemyAt('drifter', ship.x + ring, ship.y, 100000);
    for (let i = 0; i < Math.round(3 / STEP); i++) stepTheWorld({});

    answer[id] = 100000 - body.hp;
  }

  assert.ok(answer.pulse > 0, 'the ring bit at all');
  assert.equal(answer.pulse, answer.scatter, 'the same number of bites, whichever gun was flown');
  assert.ok(Math.abs(answer.pulse % bite) < 1e-9,
    'and every one of them cost one shot of the plain gun, not one pellet: ' + answer.pulse);
});

test('a nova front costs a body the same whatever is being flown', () => {
  const nova = BALANCE.upgrades.nova;
  const cost = UNIT * nova.weight;
  const answer = {};

  for (const id of ['pulse', 'scatter']) {
    const field = scriptedRun(413);
    setWeapon(field, id);
    field.upgrades.nova = 1;

    const ship = field.player;
    const body = enemyAt('drifter', ship.x + nova.reach * 0.6, ship.y, 100000);
    for (let i = 0; i < Math.round((nova.cycle + 1) / STEP); i++) stepTheWorld({});
    answer[id] = 100000 - body.hp;
  }

  assert.ok(answer.pulse > 0, 'a front came over it');
  assert.equal(answer.pulse, answer.scatter);
  assert.ok(Math.abs(answer.pulse % cost) < 1e-9,
    'one front, ' + cost + ' hull, whatever the trigger: ' + answer.pulse);
});
