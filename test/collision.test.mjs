// Bullet-against-enemy, played out on the real simulation now that the collision
// grid sits between them: what counts as a hit, what counts as a kill, and the
// two rules a snapshot brings - the exact test still decides, and a corpse that
// is still filed in the grid cannot be shot again.
//
// These drive the scripted world (tools/headless/scripted.js) instead of booting
// the browser stub, because a scripted world can be put in exactly the awkward
// positions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import {
  scriptedRun, enemyAt, bulletFlyingToward, stepTheWorld as step,
} from '../tools/headless/scripted.js';

/** How close a bullet and an enemy have to be for it to count. */
function contactOf(type) {
  return BALANCE.kinds[type].radius + BALANCE.bullets.hitRadius;
}

test('the grid is rebuilt from the crowd every step', () => {
  const field = scriptedRun(3);
  assert.equal(field.grid.count, 0, 'a fresh run has nothing to find');

  const near = enemyAt('chaser', 200, 300);
  const far = enemyAt('darter', 700, 300);
  bulletFlyingToward(480, 300, 0, -1);      // a stray that meets nobody

  step();

  assert.equal(field.enemies.length, 2);
  assert.equal(field.grid.count, 2, 'every enemy in the crowd got filed');
  assert.equal(field.grid.items, field.grid.count, 'and count means what it says');

  const found = field.grid.queryCircle(200, 300, contactOf('chaser'));
  assert.ok(found.includes(near), 'the world can be asked who stands there');
  assert.ok(!found.includes(far), 'and it is not told about the far side of the arena');
});

test('a shot that reaches an enemy does the damage and is spent', () => {
  const field = scriptedRun(4);
  const target = enemyAt('chaser', 480, 200);
  const before = target.hp;
  bulletFlyingToward(480, 214, 0, -600);    // one step later it is inside contact

  step();

  assert.equal(target.hp, before - BALANCE.bullets.damage, 'one hit, one wound');
  assert.equal(field.bullets.count, 0, 'the bullet is gone');
  assert.equal(field.enemies.length, 1, 'and the enemy is still standing');
});

test('a shot that stops short of an enemy does nothing', () => {
  const field = scriptedRun(5);
  const contact = contactOf('chaser');
  const target = enemyAt('chaser', 480, 200);
  bulletFlyingToward(480, 200 + contact + 4, 0, -60);   // ends 4px shy

  step();

  assert.equal(target.hp, BALANCE.kinds.chaser.hull, 'it grazed past without touching');
  assert.equal(field.bullets.count, 1, 'and flew on, unspent');
});

test('one enemy dies once: a corpse in the grid is not shootable', () => {
  // The grid is a snapshot of the crowd, so a killed enemy stays filed in it
  // until the next rebuild. It has already paid out, so the rest of the shot
  // must sail through it.
  const field = scriptedRun(6);
  enemyAt('chaser', 480, 200, 1);
  for (let i = 0; i < 5; i++) bulletFlyingToward(480 + i * 2, 200, 0, 0);

  step();

  assert.equal(field.kills, 1, 'one kill, not five');
  assert.equal(field.enemies.length, 0, 'and it left the crowd');
  assert.equal(field.bullets.count, 4, 'four of the five shots are still in the air');
  assert.equal(field.score, BALANCE.kinds.chaser.score, 'paid out exactly once');
});

test('a tank hatchling cannot be shot in the step it appears', () => {
  // The split grows the crowd after the grid was built, so the hatchlings join
  // the collision world on the next step. They are thrown clear as they arrive,
  // and this is what the grid snapshot costs: one step, nobody's eye.
  const field = scriptedRun(7);
  enemyAt('tank', 480, 200, 1);
  bulletFlyingToward(480, 200, 0, 0);
  for (let i = 0; i < 3; i++) bulletFlyingToward(480 + i * 3, 202, 0, 0);

  step();

  assert.equal(field.kills, 1, 'only the tank died this step');
  assert.equal(field.enemies.length, BALANCE.kinds.tank.split.into, 'and it left its hatchlings');
  assert.equal(field.bullets.count, 3, 'nobody shot a hatchling yet');
});

test('a spent shot goes back to the pool, not to the garbage collector', () => {
  const field = scriptedRun(8);
  for (let i = 0; i < 6; i++) bulletFlyingToward(480, 200 + i, 900, 0);
  assert.equal(field.bullets.count, 6);
  const built = field.bullets.stats().made;

  // Longer than a shot lives: in an arena this big the edge is not what usually
  // ends a shot, its life is.
  const steps = Math.ceil(BALANCE.bullets.life / BALANCE.sim.step) + 1;
  for (let i = 0; i < steps; i++) step();

  assert.equal(field.bullets.count, 0, 'every one of them ran out');
  assert.equal(field.bullets.stats().free, built, 'and every one came back to the drawer');

  bulletFlyingToward(480, 200, 0, -1);
  assert.equal(field.bullets.stats().made, built, 'the next volley was built by nobody');
});

test('a bullet past the edge of the arena is despawned', () => {
  const field = scriptedRun(9);
  const nearEdge = field.arena.w + BALANCE.bullets.despawnMargin - 2;
  bulletFlyingToward(nearEdge, 300, 600, 0);

  step();

  assert.equal(field.bullets.count, 0, 'one step past the margin and it is gone');
});
