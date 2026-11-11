// The pulsar: a mark on the ground, a wait, then a blast at the mark.
//
// The promise of an area-denial body is that the circle is where the pain lands and that leaving it
// is an answer. This file watches the mark being taken, the blast arriving at the *old* place and not
// at the body, and the wind-up being short enough to walk out of.

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
const PULSE = BALANCE.kinds.pulsar.pulse;
const game = await bootGame({ root: ROOT, seed: 37 });
const world = game.world;

function step() { stepWorld(STEP, { moveX: 0, moveY: 0, moving: false, aimX: 0, aimY: 0, firing: false }); }

function clear() {
  world.enemies.length = 0;
  world.flocks.length = 0;
  world.rings.clear();
  world.particles.clear();
  world.nova.fronts.clear();
  world.nova.wait = Infinity;
  world.spawnTimer = Infinity;
  world.player.invuln = Infinity;
  world.freeze = 0;          // a previous blast's hit-stop must not eat this test's first step
  world.player.x = 700;
  world.player.y = 400;
  world.state = STATE.PLAY;
}

function holdFor(seconds) {
  const steps = Math.ceil(seconds / STEP);
  for (let i = 0; i < steps; i++) step();
}

test('a pulsar marks the ship where it stands, then waits out the wind-up', () => {
  clear();
  const body = makeEnemy(world, 'pulsar', 300, 400);
  world.enemies.push(body);
  const markX = world.player.x;
  const markY = world.player.y;
  step();
  assert.equal(body.stage, 'mark', 'the first beat starts a mark');
  assert.equal(body.dirX, markX, 'on the ship, not ahead of it');
  assert.equal(body.dirY, markY);
  assert.ok(body.timer > PULSE.warn - STEP * 2, 'with the whole wind-up still to run');
  holdFor(PULSE.warn * 0.5);
  assert.equal(body.stage, 'mark', 'and it holds the mark for that long');
  assert.equal(world.rings.count, 0, 'nothing has gone off yet');
});

test('the blast lands on the mark, not on the body, so walking out is enough', () => {
  clear();
  const body = makeEnemy(world, 'pulsar', 300, 400);
  world.enemies.push(body);
  const markX = world.player.x;
  const hull = world.player.hull;
  step();
  // The mark is down; the ship is a long way from the body and walks further away.
  world.player.x = markX + PULSE.blast.radius + 80;
  holdFor(PULSE.warn + STEP * 4);
  assert.equal(world.player.hull, hull, 'the ship left the circle and paid nothing');
  assert.ok(world.rings.count > 0, 'the blast still went off');
  assert.equal(body.stage, '', 'and the body is free to mark again');
});

test('standing in the marked circle costs a hull', () => {
  clear();
  const body = makeEnemy(world, 'pulsar', 300, 400);
  world.enemies.push(body);
  // A real hull and no grace: the ship does not move, so the mark is where it will be.
  world.player.invuln = 0;
  const hull = world.player.hull;
  step();
  holdFor(PULSE.warn + STEP * 4);
  assert.equal(world.player.hull, hull - 1, 'the blast found the ship on the mark');
});

test('a mark that never fires is queued, not fired from the crowd walk', () => {
  clear();
  const body = makeEnemy(world, 'pulsar', 300, 400);
  world.enemies.push(body);
  body.stage = 'mark';
  body.timer = 0;
  body.dirX = world.player.x;
  body.dirY = world.player.y;
  // One step ends the mark and queues the blast; updatePulses runs after the non-empty crowd list.
  step();
  assert.equal(body.stage, '', 'the pulse has already been paid');
  assert.ok(world.rings.count > 0, 'and paid once');
});

test('two ready marks are paid one step apart, and neither loses its place', () => {
  clear();
  const first = makeEnemy(world, 'pulsar', 300, 400);
  const second = makeEnemy(world, 'pulsar', 300, 600);
  world.enemies.push(first, second);
  first.stage = 'ready';
  second.stage = 'ready';
  first.dirX = 400;
  first.dirY = 450;
  second.dirX = 800;
  second.dirY = 450;
  step();
  assert.equal(first.stage, '', 'one pulse is paid a step');
  assert.equal(second.stage, 'ready', 'the other waits its turn');
  assert.equal(second.dirX, 800, 'and the waiting mark is not overwritten by a walk');
  assert.equal(second.dirY, 450);
  world.freeze = 0;   // the first blast's hit-stop is not a step of the game
  step();
  assert.equal(second.stage, '', 'the second is paid on the next step');
});

test('it arrives at its own minute, not before', () => {
  const stats = BALANCE.kinds.pulsar;
  assert.equal(stats.from, 560);
  assert.ok(stats.from > BALANCE.kinds.mender.from, 'after the mender, in the last third');
  assert.ok(stats.cost <= BALANCE.waves.waveMinPoints, 'a wave can afford one');
  const list = Object.values(BALANCE.kinds);
  assert.ok(stats.score <= Math.max(...list.map((kind) => kind.score)), 'it is worth what a body of its size is');
});
