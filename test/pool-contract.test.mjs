// The pool contract, made visible: a recycled object must be written field by field by whatever
// spawns it, or it wears its last life into this one (src/core/pool.js).
//
// Prose has held this rule so far by attention alone. Every field a shot has ever grown - `pierce` and
// `bounce`, `charged`, `hunts` and `splash`, `turret` - had to be written by every spawner that throws
// one in the same moment it was invented, and NOTES records the trap being noticed each time as the
// field was new. Attention is what found them; it is not a check. `tools/headless/pool-audit.js` is the
// witness: it poisons every field of every object a pool hands out and reports any field still poisoned
// once the step is over.
//
// These tests put that witness on the whole game: every upgrade line maxed, each of the five primaries
// in turn, a crowd that keeps arriving, a dash every time one is ready, and a boss's blade loosed.
// Then they make two promises:
//
//   - nothing was left unwritten, anywhere, in any of it; and
//   - every pooled list in the world was actually reached - a system the audit never visited would
//     pass these tests for the wrong reason, so the coverage is asserted and not assumed.
//
// The last test poisons one on purpose, because an instrument that cannot detect a planted fault is
// not measuring anything.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import { world } from '../src/game/world.js';
import { WEAPONS, setWeapon } from '../src/game/weapons.js';
import { looseArm } from '../src/game/arms.js';
import { enemyAt, scriptedRun, stepTheWorld, wearEveryLine } from '../tools/headless/scripted.js';
import { startPoolAudit, watchedSteps } from '../tools/headless/pool-audit.js';

const STEP = BALANCE.sim.step;
const KINDS = ['drifter', 'weaver', 'darter', 'spitter', 'tank', 'bomber', 'shielder', 'swarmling', 'sniper'];

/** What the audits found, across every test in this file. It has to stay empty. */
const findings = [];
/** How many lives each pooled list lived while it was being watched. */
const visited = new Map();
/** Every pooled list the audit has ever seen, so the coverage test can name what was missed. */
const allPools = new Set();

/** A run wearing every line at its top rank, with no crowd until one is planted. */
function fullBuild(seed) {
  return wearEveryLine(scriptedRun(seed));
}

/**
 * A body of each kind, planted in a ring round the ship.
 *
 * The shooters are in there twice: a spitter's shot and a sniper's beam are the two pooled lists that
 * nothing else in the game fills, and one of each per wave would spend its whole telegraph on a ship
 * that is circling away. They stand still (`enemyAt` zeroes their speed) so the aim has something to
 * hold, and they are close enough that the crowd reaches the ship and the melee lines get spent.
 */
function plantWave(offset) {
  const ship = world.player;
  const kinds = KINDS.concat(['spitter', 'sniper']);
  const radius = 260 + (offset % 3) * 60;
  for (let i = 0; i < kinds.length; i++) {
    const angle = (i / kinds.length) * Math.PI * 2 + offset * 0.37;
    enemyAt(kinds[i],
      ship.x + Math.cos(angle) * radius,
      ship.y + Math.sin(angle) * radius);
  }
}

/** What the hand is doing on step `n`: a slow circle, the gun on the nearest body, a dash whenever one is ready. */
function hands(n) {
  const ship = world.player;
  let nearest = null;
  let nearestBy = Infinity;
  for (const body of world.enemies) {
    const dx = body.x - ship.x;
    const dy = body.y - ship.y;
    const by = dx * dx + dy * dy;
    if (by < nearestBy && body.hp > 0) { nearestBy = by; nearest = body; }
  }
  return {
    moveX: Math.cos(n * 0.03), moveY: Math.sin(n * 0.03), moving: true,
    aimX: nearest === null ? ship.x : nearest.x,
    aimY: nearest === null ? ship.y - 100 : nearest.y,
    firing: true,
    dash: n % 300 === 0,           // the dash is ready every 2.5 s and one is spent the moment it is
  };
}

/**
 * Fly `seconds` of the game with the audit watching, and say what it saw.
 *
 * The crowd is topped up whenever it thins, because a wave that dies leaves nothing to shoot at and an
 * audit that shoots nothing visits nothing.
 */
function watch(seed, weaponId, seconds, onStep) {
  const field = fullBuild(seed);
  if (weaponId !== undefined) setWeapon(field, weaponId);
  const audit = startPoolAudit(field);
  for (const path of audit.pools) allPools.add(path);
  try {
    watchedSteps(audit, Math.round(seconds / STEP), (n) => {
      if (onStep !== undefined) onStep(n);
      if (world.enemies.length < 10) plantWave(n);
      return stepTheWorld(hands(n));
    });
    audit.sweep();
    for (const finding of audit.report()) findings.push(finding);
    for (const line of audit.summary()) {
      visited.set(line.path, (visited.get(line.path) || 0) + line.spawned);
    }
  } finally {
    audit.stop();
  }
  return audit;
}

// --- the witness itself ----------------------------------------------------------

test('the audit sees a field a spawner forgot to write', () => {
  // A mutation test for the instrument: plant the fault the whole file is looking for and prove it is
  // caught, and prove that a spawner that writes everything is not. Without this the empty report
  // below would be indistinguishable from an audit that watches nothing.
  const field = scriptedRun(4242);
  const audit = startPoolAudit(field);
  try {
    const honest = world.particles.spawn();
    for (const key of Object.keys(honest)) honest[key] = 0;
    honest.shape = 'spark';
    honest.color = '#ffffff';

    const forgetful = world.particles.spawn();
    forgetful.x = 10;                    // one field written, the rest left to the drawer

    audit.sweep();
    const found = audit.report();
    assert.equal(found.length, Object.keys(world.particles.make()).length - 1,
      'every field that was not written is named');
    assert.ok(found.some((f) => f.pool === 'particles' && f.key === 'y'), 'and one of them is the one left alone');
  } finally {
    audit.stop();
  }

  // A second audit sees the same pool cleanly, which is the repair promise: nothing poisoned was left
  // in the drawer for the next visitor.
  const again = startPoolAudit(world);
  try {
    const clean = world.particles.spawn();
    for (const key of Object.keys(clean)) clean[key] = 0;
    again.sweep();
    assert.deepEqual(again.report(), [], 'the last test left nothing behind');
  } finally {
    again.stop();
  }
});

// --- the game -------------------------------------------------------------------

for (const weapon of WEAPONS) {
  test('every pooled list is written from head to foot while the run flies the ' + weapon.id.toUpperCase(), () => {
    watch(90210 + WEAPONS.indexOf(weapon), weapon.id, 30);
    assert.deepEqual(findings, [], 'nothing was left wearing its last life');
  });
}

test('and while a boss blade is turning', () => {
  // A blade is the one pooled list nothing else fills (game/arms.js), and it is loosed here the way
  // game/bosses.js looses it - out of a body, on the eclipse's own phase-three sweep.
  const phase = BALANCE.bosses.eclipse.phases[2];
  watch(90777, 'pulse', 8, (n) => {
    if (n !== 60) return;
    const body = enemyAt('tank', world.player.x + 220, world.player.y);
    looseArm(world, body, 0, phase.sweep, phase.tint);
    looseArm(world, body, Math.PI, phase.sweep, phase.tint);
  });
  assert.ok((visited.get('arms') || 0) >= 2, 'the blades were loosed into a watched pool');
  assert.deepEqual(findings, [], 'nothing was left wearing its last life');
});

test('every pooled list in the game was visited by all of that', () => {
  console.log('VISITED ' + [...visited.entries()].map(([k, v]) => k + ':' + v).join(' '));
  assert.ok(allPools.size >= 17, 'the audit found the lists the world owns, and found ' + allPools.size);
  const never = [];
  for (const path of allPools) {
    if (!visited.get(path)) never.push(path);
  }
  assert.deepEqual(never, [], 'a list nobody reached is a list nobody checked');
});
