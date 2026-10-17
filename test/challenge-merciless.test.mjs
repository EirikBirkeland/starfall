// SHORT GRACE (game/challenges.js, BALANCE.challenges.merciless): the gap a hit leaves the ship,
// shortened from a second and a half to half one.
//
// The plain game hands the ship 1.5 s of safety after every hit (`player.hitInvulnerability`), which is
// what lets a mistake survive itself: the crowd is shoved off a ship that was hurt, and this is the time
// to walk out. Shorten it and a touch that would have been one hull is two and a slow one is three.
// That is the whole rule, and these tests hold the three things worth holding about it:
//
//   **the gap is what changed, and nothing else.** A run's opening second and the invulnerability a dash
//     is made of are promises this rule has no business touching, and both are tested standing.
//   **a second touch inside the old gap costs nothing, and one between the two numbers costs a hull.**
//     That is where the rule is drawn - between 0.5 s and 1.5 s, not at zero.
//   **the number is a floor.** A body is shoved off a hurt ship; a blade, a spoke and a fan of shot are
//     not, so a hazard that *stays* across the ship asks again every step and only this gap says how
//     often "again" is. With no gap the ask is a hull a frame, and the run is over before whoever is
//     standing in it has seen the second frame of it. That is why the row says 0.5 and not 0, and the
//     last test spends the row on 0 to show what the alternative was.
//
// Everything here goes through the collision and not through `hitPlayer` directly: the gate is the thing
// under test, and a test that walked past it could not fail.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { isInvulnerable } from '../src/game/player.js';
import { resetRun } from '../src/game/run.js';
import { setChallenge } from '../src/game/challenges.js';
import { scriptedRun, enemyAt, stepTheWorld } from '../tools/headless/scripted.js';

const STILL = { moveX: 0, moveY: 0, moving: false };
const STEP = BALANCE.sim.step;
const PLAIN = BALANCE.player.hitInvulnerability;
const SHIPPED = BALANCE.challenges.merciless.grace;

/** One step of the arena that actually happened - a hit freezes the world for a moment. */
function step() {
  let guard = 0;
  while (!stepTheWorld(STILL)) {
    if (++guard > 4000) throw new Error('the arena never came back to life');
  }
}

function steps(seconds) {
  let ran = 0;
  while (ran < seconds - 1e-9) {
    step();
    ran += STEP;
  }
}

/**
 * A run parked mid-flight with the ship able to be hurt, under `id` as its rule.
 *
 * `scriptedRun` parks the ship out of harm's way (an unbounded grace and no crowd); this takes the grace
 * away, because the grace is what these tests are about, and gives the ship enough hull to be hurt more
 * than once without ending the run underneath a test that did not mean to.
 */
function worldUnder(id) {
  const field = scriptedRun(31);
  setChallenge(field, id);
  field.player.invuln = 0;
  field.player.hull = 6;
  return field;
}

/** A body nailed to the ship's own spot: the cheapest hazard in here that does not move off. */
function hazardOnTheShip(field) {
  const body = enemyAt('drifter', field.player.x, field.player.y);
  body.speed = 0;
  return body;
}

/** Keep `body` across the ship for `seconds`, and answer how many hull it took. */
function holdTheHazard(field, body, seconds) {
  const before = field.tally.hullLost;
  let ran = 0;
  while (ran < seconds - 1e-9) {
    if (field.state !== STATE.PLAY) break;   // the run ended; nothing is standing in anything any more
    if (body !== null) {
      body.x = field.player.x;
      body.y = field.player.y;
    }
    step();
    ran += STEP;
  }
  return field.tally.hullLost - before;
}

/** How many hull a hazard that stays across the ship takes, under one rule's gap. */
function hullsUnder(id, seconds) {
  const field = worldUnder(id);
  return holdTheHazard(field, hazardOnTheShip(field), seconds);
}

/** Put a different gap on the rule for one measurement, and put the shipped one back after it. */
function withGap(gap, measure) {
  const was = BALANCE.challenges.merciless.grace;
  try {
    BALANCE.challenges.merciless.grace = gap;
    return measure();
  } finally {
    BALANCE.challenges.merciless.grace = was;
  }
}

// ---------------------------------------------------------------------------

test('a hit leaves the gap the run\'s rules say, and the plain game leaves the whole one', () => {
  assert.equal(PLAIN, 1.5, 'the plain gap is the one the prose and the balance row both name');
  assert.ok(SHIPPED > 0 && SHIPPED < PLAIN, 'the rule shortens the gap and does not take it away');

  const plain = worldUnder('');
  hazardOnTheShip(plain);
  step();
  assert.equal(plain.player.hull, 5, 'the touch was not paid for');
  assert.equal(plain.player.invuln, PLAIN, 'plain leaves a second and a half');

  const quick = worldUnder('merciless');
  hazardOnTheShip(quick);
  step();
  assert.equal(quick.player.hull, 5, 'the same touch under the rule is paid for the same');
  assert.equal(quick.player.invuln, SHIPPED, 'and leaves half a second after it');
});

test('a second touch costs under the rule at a distance that is free in a plain run', () => {
  // The line the rule is drawn on. Halfway between the two gaps is the only distance at which the plain
  // game and the rule differ at all: inside 0.5 s neither is charged, beyond 1.5 s both are.
  const between = (PLAIN + SHIPPED) / 2;

  const plain = worldUnder('');
  hazardOnTheShip(plain);
  step();
  plain.enemies.length = 0;
  steps(between);
  hazardOnTheShip(plain);
  step();
  assert.equal(plain.tally.hullLost, 1, 'plain was touched inside its gap and should have paid nothing');

  const quick = worldUnder('merciless');
  hazardOnTheShip(quick);
  step();
  quick.enemies.length = 0;
  steps(between);
  hazardOnTheShip(quick);
  step();
  assert.equal(quick.tally.hullLost, 2, 'under the rule the same second touch is a second hull');
});

test('the rule reaches the gap after a hit and no other promise about being hurt', () => {
  // A run's opening second is game/run.js's own grace and not the one a hit buys, so the rule that
  // shortens one leaves the other standing: a ship that opened its run already hurt would be a rule
  // nobody chose and no card named.
  const field = scriptedRun(33);
  setChallenge(field, 'merciless');
  resetRun(field);
  assert.equal(field.player.invuln, BALANCE.player.startInvulnerability,
    'the opening second of a run is not this rule\'s to shorten');

  // ...and a dash is still a dash. The jump's immunity is not the gap a hit buys - `isInvulnerable`
  // ORs the two, so however short this rule makes the gap, a ship mid-jump is not what a touch can
  // bill. `dashLeft` is a distance and not a time (game/player.js `beginDash` writes it in px), which is
  // why it is asked for off the row rather than written as a number of seconds here.
  field.player.hull = 6;
  field.player.invuln = 0;
  field.player.dashLeft = BALANCE.player.dash.distance;
  assert.equal(isInvulnerable(field.player), true,
    'the jump lost its immunity to a rule that never touched it');
  field.player.dashLeft = 0;
  assert.equal(isInvulnerable(field.player), false, 'and the world is open again once it is spent');
});

test('a hazard that stays takes one hull per gap, which is why the gap has a floor', () => {
  // Something that does not get shoved off - a blade, a spoke, a fan that came across the ship - asks
  // again every step. Plainly that is one hull and then a safe second and a half; under the rule it is
  // about one per half second, which is a bill a person can pay and answer; and with no gap at all it is
  // a hull every step of the run's ending.
  assert.equal(hullsUnder('', 1.2), 1, 'plain takes the hull it asked for and no more');
  assert.equal(hullsUnder('', 1.7), 2, 'and asks once more when the whole gap has gone by');

  const short = hullsUnder('merciless', 1.2);
  assert.ok(short >= 2 && short <= 3, 'half a second of gap is two or three hulls a second, not '
    + short);

  // The alternative the row refused: no gap at all, and a hazard that stays takes the whole hull in a
  // handful of steps - not a harder rule, a run nobody gets to answer.
  const bare = worldUnder('merciless');
  const gone = withGap(0, () => holdTheHazard(bare, hazardOnTheShip(bare), 1.2));
  assert.equal(gone, 6, 'with no gap every step of standing in it is a hull, so all six went at once');
  assert.equal(bare.state, STATE.OVER, 'and the run was over before a person had seen the second frame of it');
});

test('the run ends when the hull is gone, however the gap was spent', () => {
  // The rule cannot take a hull past the last one: an ending is an ending, and a ship at no hull that is
  // still being hit is a tally writing itself after the fact.
  const field = worldUnder('merciless');
  field.player.hull = 1;
  const body = hazardOnTheShip(field);
  step();
  assert.equal(field.state, STATE.OVER, 'the touch did not end the run');
  const lost = field.tally.hullLost;
  assert.equal(holdTheHazard(field, body, 0.6), 0, 'and the wreck was hurt again afterwards');
});
