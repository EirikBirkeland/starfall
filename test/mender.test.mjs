// The mender: one wounded body near it, one pulse, and never itself.
//
// A support body is only a support body if it actually heals something, and the heal has to respect
// the three decisions the row makes: one target, the lowest share of hull, inside its own radius.
// `game/kinds.js walksMending` is the behaviour; this file steps a real world with a planted mender
// and reads what the crowd's hull did.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { makeEnemy } from '../src/game/kinds.js';
import { stepWorld } from '../src/game/world.js';
import { STATE } from '../src/game/state.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const STEP = BALANCE.sim.step;
const game = await bootGame({ root: ROOT, seed: 31 });
const world = game.world;

/** One step of the simulation alone: no frame, no input, no arrivals. */
function step() { stepWorld(STEP, { moveX: 0, moveY: 0, moving: false, aimX: 0, aimY: 0, firing: false }); }

/** A body at (x, y), wounded by `missing` of its own hull. */
function wounded(kind, x, y, missing) {
  const enemy = makeEnemy(world, kind, x, y);
  enemy.hp = Math.max(1, enemy.maxhp - missing);
  world.enemies.push(enemy);
  return enemy;
}

function clear() {
  world.enemies.length = 0;
  world.flocks.length = 0;
  world.rings.clear();
  world.particles.clear();
  world.spawnTimer = Infinity;
  world.player.invuln = Infinity;
  world.state = STATE.PLAY;
}

test('a mender patches the most wounded body in reach, and never itself', () => {
  clear();
  const mender = wounded('mender', 400, 400, 3);
  const hurt = wounded('drifter', 430, 400, 2);       // 2 of 3 missing, the worst share
  const light = wounded('tank', 450, 400, 1);         // 1 of 9 missing
  const far = wounded('drifter', 400 + BALANCE.kinds.mender.mend.radius + 40, 400, 2);
  const menderHp = mender.hp;
  const hurtHp = hurt.hp;
  const lightHp = light.hp;
  const farHp = far.hp;
  // The mender's timer starts at 0, so the first step after the scan is its first pulse.
  step();
  assert.ok(mender.hp <= menderHp, 'the mender never heals itself');
  assert.equal(hurt.hp, Math.min(hurt.maxhp, hurtHp + BALANCE.kinds.mender.mend.heal),
    'the lowest share in reach is the one patched');
  assert.equal(light.hp, lightHp, 'a healthier body in the same pulse is untouched');
  assert.equal(far.hp, farHp, 'and a body outside the radius is untouched');
});

test('an empty wound means no pulse and no effect', () => {
  clear();
  const mender = wounded('mender', 400, 400, 0);
  const full = wounded('drifter', 430, 400, 0);
  step();
  assert.equal(mender.hp, mender.maxhp);
  assert.equal(full.hp, full.maxhp);
  assert.equal(world.rings.count, 0, 'a pulse with no wound paints no ring');
});
