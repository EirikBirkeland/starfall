// Hit-stop (PLAN section 4): a kill worth marking, and the ship being hit, hold
// the whole run still for a few milliseconds. These drive the scripted world so
// they can count the frozen steps exactly; what the frame loop does with a press
// that lands during a freeze is test/frozen-frame.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { addText, burst, hitStop, ring } from '../src/game/effects.js';
import {
  scriptedRun, enemyAt, bulletFlyingToward, stepTheWorld as step,
} from '../tools/headless/scripted.js';

const STEP = BALANCE.sim.step;
const BIG = BALANCE.kinds.tank.death.hitStop;
const HIT = BALANCE.playerHit.hitStop;

/** How many whole steps a freeze of `seconds` costs - a freeze is spent in steps. */
function stepsIn(seconds) {
  return Math.ceil(seconds / STEP - 1e-9);
}

/**
 * Step until the freeze is gone and report how many frozen steps it took.
 * Bounded on purpose: a regression here must fail, not hang the test runner.
 */
function thaw(field, limit) {
  let frozen = 0;
  while (field.freeze > 0) {
    frozen++;
    assert.ok(frozen <= limit, 'the freeze never ended');
    assert.equal(step(), false, 'a frozen step says it froze');
  }
  return frozen;
}

/** Everything a moving part of the world is, as one comparable string. */
function fingerprint(field) {
  const parts = ['elapsed:' + field.elapsed, 'score:' + field.score, 'kills:' + field.kills];
  const ship = field.player;
  parts.push('ship:' + ship.x + ',' + ship.y + ',' + ship.px + ',' + ship.py + ',' + ship.vx + ',' + ship.vy);
  for (const e of field.enemies) parts.push('e:' + e.x + ',' + e.y + ',' + e.px + ',' + e.py + ',' + e.flash);
  for (const b of field.bullets.items) parts.push('b:' + b.x + ',' + b.y + ',' + b.life);
  for (const s of field.shards.items) parts.push('s:' + s.x + ',' + s.y);
  for (const p of field.particles.items) parts.push('p:' + p.x + ',' + p.y + ',' + p.life);
  for (const r of field.rings.items) parts.push('r:' + r.r + ',' + r.life);
  for (const t of field.texts.items) parts.push('t:' + t.y + ',' + t.life);
  return parts.join('|');
}

test('a big kill holds the run still for exactly its hit-stop', () => {
  const field = scriptedRun(21);
  const ship = field.player;
  enemyAt('tank', ship.x + 24, ship.y, 1);
  bulletFlyingToward(ship.x + 12, ship.y, 0, 0);      // already inside contact

  assert.equal(step(), true, 'the step that landed the kill was a real step');
  assert.equal(field.kills, 1, 'the tank went down');
  assert.equal(field.freeze, BIG, 'and the world asked for a moment');

  const elapsed = field.elapsed;
  assert.equal(thaw(field, 40), stepsIn(BIG), 'the freeze cost the steps it promised and no more');
  assert.equal(field.elapsed, elapsed, 'the run clock did not move while frozen');
  assert.equal(field.freeze, 0, 'and it is spent');

  assert.equal(step(), true, 'the world is running again');
  assert.ok(field.elapsed > elapsed, 'and time is being simulated once more');
});

test('a kill that is not big does not stop anything', () => {
  const field = scriptedRun(22);
  enemyAt('drifter', 400, 300, 1);
  bulletFlyingToward(400, 300, 0, 0);

  step();

  assert.equal(field.kills, 1, 'a drifter died');
  assert.equal(field.freeze, 0, 'and nobody noticed');
  assert.equal(step(), true);
});

test('being hit is the longest stop in the game', () => {
  const field = scriptedRun(23);
  const ship = field.player;
  ship.invuln = 0;                    // this test is about the ship, not its grace
  enemyAt('drifter', ship.x, ship.y);

  const hull = ship.hull;
  step();

  assert.equal(ship.hull, hull - 1, 'the hit landed');
  assert.equal(field.freeze, HIT, 'and the run stopped for it');
  assert.ok(HIT > BIG, 'and longer than a big kill, because this is the moment that matters');

  ship.invuln = Infinity;             // one hit is the whole test
  const frozen = thaw(field, 40);
  assert.equal(frozen, stepsIn(HIT));
});

test('two freezes at once: the longer one wins', () => {
  const field = scriptedRun(24);
  hitStop(field, 0.02);
  hitStop(field, BIG);
  hitStop(field, 0.01);

  assert.equal(field.freeze, BIG, 'a small freeze cannot cut a big one short');
  assert.equal(thaw(field, 40), stepsIn(BIG), 'and it is still spent in the same number of steps');
});

test('a frozen step moves nothing except the clocks that are not the worlds', () => {
  const field = scriptedRun(25);
  const ship = field.player;
  enemyAt('tank', 400, 300);
  bulletFlyingToward(300, 300, 600, 0);
  burst(field, 200, 200, '#ffffff', 6, 120, 0.6);
  ring(field, 200, 200, '#ffffff', 10, 300, 0.5);
  addText(field, 200, 200, '+10', '#ffffff');
  hitStop(field, 0.03);

  const before = fingerprint(field);
  const time = field.time;
  field.shake = 5;                        // trauma the frame is shaking by
  const shake = field.shake;
  const steps = field.steps;

  assert.equal(step({ moveX: 1, moving: true }), false);
  assert.equal(step({ moveX: 1, moving: true }), false);

  assert.equal(fingerprint(field), before, 'the whole world held still, the ship included');
  assert.ok(field.time > time, 'but the session clock the eye animates on kept going');
  assert.ok(field.shake < shake, 'and the trauma kept fading, so a freeze does not add to the shake');
  assert.equal(field.steps, steps + 2, 'and the steps were still counted, frozen or not');
});

test('the restart guard keeps ticking while the world is frozen', () => {
  const field = scriptedRun(26);
  field.state = STATE.OVER;
  field.overTimer = 0;
  hitStop(field, 0.02);

  const frozen = thaw(field, 40);

  assert.equal(frozen, stepsIn(0.02));
  assert.equal(field.overTimer, frozen * STEP, 'the guard belongs to the player, not the simulation');
  assert.equal(field.elapsed, 0, 'and the run clock never moved');
});

test('a fresh run is never still frozen from the last one', () => {
  const field = scriptedRun(27);
  hitStop(field, 0.5);
  assert.ok(field.freeze > 0);

  scriptedRun(28);
  assert.equal(field.freeze, 0, 'resetRun unfroze it');
  assert.equal(step(), true);
});
