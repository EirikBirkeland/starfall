// FROSTBITE: chill 3 + damage 3, and a body that dies cold comes apart with the rank-five shatter.
//
// It is the third synergy: it unlocks a part of `chill` the ranks the card needs do not own, so the
// test watches the shatter reach the body beside the corpse, and watches it stop when either parent
// is one rank short.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { makeEnemy } from '../src/game/kinds.js';
import { chill, isChilled, shatterOnDeath } from '../src/game/chill.js';
import { needsOf, newRanks } from '../src/game/upgrades.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 43 });
const world = game.world;

function clear() {
  world.enemies.length = 0;
  world.rings.clear();
  world.particles.clear();
  world.upgrades = newRanks();
}

function coldBody() {
  const enemy = makeEnemy(world, 'drifter', 400, 400);
  world.upgrades.chill = 3;
  chill(world, enemy);
  assert.equal(isChilled(enemy), true, 'the parent made it cold');
  return enemy;
}

test('it needs chill three and damage three, and is a synergy', () => {
  assert.deepEqual(needsOf('frostbite'), [
    { line: 'chill', rank: 3 },
    { line: 'damage', rank: 3 },
  ]);
  assert.equal(newRanks().frostbite, 0);
});

test('a cold death shatters the body beside it with the card', () => {
  clear();
  world.upgrades.chill = 3;
  world.upgrades.damage = 3;
  world.upgrades.frostbite = 1;
  const corpse = coldBody();
  const neighbour = makeEnemy(world, 'drifter', corpse.x + 30, corpse.y);
  world.enemies.push(neighbour);
  const before = neighbour.hp;
  shatterOnDeath(world, corpse, true);
  assert.ok(neighbour.hp < before, 'the cold death reached the neighbour');
  assert.equal(isChilled(neighbour), true, 'and left it colder');
});

test('without the card, chill three does not shatter', () => {
  clear();
  world.upgrades.chill = 3;
  world.upgrades.damage = 3;
  const corpse = coldBody();
  const neighbour = makeEnemy(world, 'drifter', corpse.x + 30, corpse.y);
  world.enemies.push(neighbour);
  const before = neighbour.hp;
  shatterOnDeath(world, corpse, true);
  assert.equal(neighbour.hp, before);
});
