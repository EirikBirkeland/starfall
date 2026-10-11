// A run keeps its own things.
//
// `resetRun` (game/run.js) is a long list of "and the last run's X goes back to nothing", and every
// line on that list is there because somebody once inherited it. It is also the kind of list a new
// system gets forgotten by: the state is created in `createWorld`, emptied in the system's own
// `resetX`, and only a reading of both sides together notices when one half is missing.
//
// `tools/headless/reset-audit.js` does that reading. Two findings came out of the first run of it, and
// both of them are in here as named tests as well as being caught by the sweep - because a promise about
// one object deserves a line that names it:
//
//   - the lance's fan (`lance.spreads`) kept the last run's angles; both readers were bounded by
//     `pull`, so nothing read them wrong, but the list was the run's and it stayed;
//   - the tether's spare rider (`tether.probe`) kept the last body it had said "yes, on a thread" to,
//     which after the run is over means a body that no longer exists was still being held by the world
//     the next run is played in.
//
// What is *not* here on purpose: the eight pieces of state that outlive a run by design - the seed, the
// session clock, the screen, the best, the purse, the awards, the codex and the log. They are named and
// argued in `OUTLIVES_A_RUN`, and the sweep is only as good as that list being honest.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import { world } from '../src/game/world.js';
import { endRun, resetRun } from '../src/game/run.js';
import { WEAPONS, setWeapon } from '../src/game/weapons.js';
import { enemyAt, scriptedRun, stepTheWorld, wearEveryLine } from '../tools/headless/scripted.js';
import {
  OUTLIVES_A_RUN, diffSnapshots, skippedByDesign, snapshotWorld,
} from '../tools/headless/reset-audit.js';

const STEP = BALANCE.sim.step;
const KINDS = ['drifter', 'weaver', 'darter', 'spitter', 'tank', 'bomber', 'shielder', 'swarmling', 'sniper'];

/** A ring of every kind round the ship, so every system has somebody to work on. */
function plantWave(offset) {
  const ship = world.player;
  const kinds = KINDS.concat(['spitter', 'sniper']);
  const radius = 250 + (offset % 3) * 70;
  for (let i = 0; i < kinds.length; i++) {
    const angle = (i / kinds.length) * Math.PI * 2 + offset * 0.41;
    enemyAt(kinds[i], ship.x + Math.cos(angle) * radius, ship.y + Math.sin(angle) * radius);
  }
}

/** The hand: a slow circle, the gun on the nearest body, and a dash whenever one is ready. */
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
    dash: n % 300 === 0,
  };
}

/**
 * Fly a run that has every line at its top rank and works every gun in turn, so that everything the
 * world can be made to hold is being held when it ends.
 */
function flyEverything(stepsPerGun) {
  let n = 0;
  for (const gun of WEAPONS) {
    wearEveryLine(scriptedRun(31337 + n));
    setWeapon(world, gun.id);
    for (let i = 0; i < stepsPerGun; i++, n++) {
      if (world.enemies.length < 10) plantWave(n);
      stepTheWorld(hands(n));
    }
  }
}

test('a run leaves the world it was given', () => {
  // Two identical clean worlds, and one run flown between them. The comparison is the whole test: if a
  // run left a field, a list entry or a live object behind, it shows here as a path with a name in it.
  const before = snapshotWorld(scriptedRun(20260999));
  flyEverything(1400);
  endRun(world);
  const after = snapshotWorld(scriptedRun(20260999));

  const leaks = diffSnapshots(before, after, skippedByDesign());
  assert.deepEqual(leaks, [], 'still holding: ' + leaks.map((l) => l.path).join(', '));

  // And the sweep really did have something to skip: four of the eight are what the flown run left
  // behind, and a world that changed nothing at all would pass this test for no reason at all.
  assert.ok(world.best > 0, 'the run banked a best score');
  assert.ok(world.dust > 0, 'and paid for it');
  assert.ok(world.pastRuns.length > 0, 'and wrote itself in the log');
  assert.ok(world.found.hosts.length > 0, 'and taught the codex what it met');
});

test('the eight things a run is allowed to keep are still the eight it is allowed to keep', () => {
  // The sweep is only as honest as this list, so it gets read rather than trusted: a ninth would have
  // to be argued for here, and every row has to say for itself.
  const names = OUTLIVES_A_RUN.map((row) => row.path);
  assert.deepEqual(names, ['seed', 'time', 'state', 'best', 'dust', 'awards', 'found', 'pastRuns']);
  for (const row of OUTLIVES_A_RUN) assert.ok(row.why.length > 0, row.path + ' has to say why it stays');
});

test("the lance's fan goes with the run that fanned it", () => {
  wearEveryLine(scriptedRun(555));
  setWeapon(world, 'lance');
  let spread = 0;
  for (let n = 0; n < 1200 && spread === 0; n++) {
    if (world.enemies.length < 10) plantWave(n);
    stepTheWorld(hands(n));
    spread = world.lance.spreads.length;
  }
  assert.ok(spread > 0, 'the gun had wound up and measured a fan');

  resetRun(world);
  assert.equal(world.lance.spreads.length, 0, 'and the next run is not standing in the angles');
});

test("the tether's spare rider lets go of the body it was holding", () => {
  wearEveryLine(scriptedRun(556));
  let held = false;
  for (let n = 0; n < 2400 && !held; n++) {
    if (world.enemies.length < 10) plantWave(n);
    stepTheWorld(hands(n));
    held = world.tether.probe.body !== null;
  }
  assert.ok(held, 'a dash tied a thread and something was standing on it');

  resetRun(world);
  assert.equal(world.tether.probe.body, null, 'the last run\'s body is not this world\'s to hold');
  assert.equal(world.tether.probe.x, 0);
  assert.equal(world.tether.probe.y, 0);
});
