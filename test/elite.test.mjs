// The elite variant (PLAN 3.3: "any type with a gold outline; drops a large shard
// and a chance of a heal"), as the simulation does it.
//
// An elite is not a kind, so the promises here are not the ones a kind row makes.
// There are four groups:
//
//   what one *is* - its kind times four, times one and a bit, and its kind in every
//   other way, because the tell is the gold and not a different body;
//   how the run gets one - one roll per wave, only after 8:00, and at most one gold
//   body in a wave, paid for out of the same spawn budget as everyone else;
//   what it leaves behind - a large shard and the chance of a hull back, and only
//   for whoever killed it;
//   and what none of it costs a run that never lives that long: nothing at all, which
//   is what the "the stream does not move before 8:00" test is for.
//
// Everything here runs on the scripted world (tools/headless/scripted.js) at the
// game's own step, next to test/kinds.test.mjs and test/waves.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { logic } from '../src/core/rng.js';
import { makeEnemy } from '../src/game/kinds.js';
import { killEnemy } from '../src/game/enemies.js';
import { crowdCost, roomToSpare, spawnEnemy, updateWaves } from '../src/game/waves.js';
import { eliteSpoils, rollElite } from '../src/game/elite.js';
import { dropBigShard } from '../src/game/pickups.js';
import { healPlayer } from '../src/game/player.js';
import { scriptedRun, stepTheWorld } from '../tools/headless/scripted.js';

const STEP = BALANCE.sim.step;
const E = BALANCE.elite;
const SHARDS = BALANCE.shards;
/** A run aged past every `from` in the game, so nothing is locked out. */
const LATE = Math.max(...Object.values(BALANCE.kinds).map((kind) => kind.from), E.from) + 30;

/** A run parked `seconds` old with the director on a leash. */
function runAged(seed, seconds) {
  const field = scriptedRun(seed);
  field.elapsed = seconds;
  field.spawnTimer = 0;
  return field;
}

/** A gold body of `type` standing in the crowd at (x, y). */
function goldAt(field, type, x, y) {
  const enemy = makeEnemy(field, type, x, y, { elite: true });
  enemy.speed = 0;
  field.enemies.push(enemy);
  return enemy;
}

/** How many of `rolls` rolls come back gold. */
function goldRolls(field, rolls) {
  let gold = 0;
  for (let i = 0; i < rolls; i++) if (rollElite(field)) gold++;
  return gold;
}

// --- what an elite is ---------------------------------------------------------

test('a gold body is its kind times four, and its kind in every other way', () => {
  const field = runAged(900, 300);
  for (const type of Object.keys(BALANCE.kinds)) {
    const plain = makeEnemy(field, type, 100, 100);
    const gold = makeEnemy(field, type, 200, 200, { elite: true });

    assert.equal(gold.elite, true, 'a ' + type + ' asked for gold knows it is');
    assert.equal(plain.elite, false, 'and the one nobody asked for is not');
    assert.equal(gold.type, type, 'it is still the kind it was rolled as');
    assert.equal(gold.r, plain.r, 'the tell is the outline, not a body twice the size');
    assert.equal(gold.kind, plain.kind, 'so it still walks, and dies, like its kind');

    // The hull is the kind's hull times four before the run's clock multiplies it,
    // so the two round at slightly different moments: a point of hull, never more.
    assert.ok(Math.abs(gold.hp - plain.hp * E.hullMul) <= E.hullMul,
      type + ': ' + gold.hp + ' against ' + plain.hp + ' times ' + E.hullMul);
    assert.ok(Math.abs(gold.maxhp - gold.hp) < 1e-9, 'and its whole hull is its max');
    assert.ok(Math.abs(gold.speed - plain.speed * E.speedMul) < 1e-9,
      type + ' walks ' + gold.speed + ' against ' + plain.speed);
    assert.equal(gold.score, plain.score * E.scoreMul);
    assert.equal(gold.drop, plain.drop * E.dropMul);
    assert.equal(gold.cost, BALANCE.kinds[type].cost * E.costMul);
  }
});

test('the crowd budget pays for a gold body at its gold price', () => {
  const field = runAged(901, 300);
  const stats = BALANCE.kinds.drifter;
  assert.equal(crowdCost(field), 0, 'an empty arena is worth nothing');

  field.enemies.push(makeEnemy(field, 'drifter', 700, 700));
  assert.equal(crowdCost(field), stats.cost, 'a plain one costs its kind');

  field.enemies.length = 0;
  field.enemies.push(makeEnemy(field, 'drifter', 700, 700, { elite: true }));
  assert.equal(crowdCost(field), stats.cost * E.costMul,
    'and a gold one is worth three of them to fight, so three of them to spawn');
});

test('a hatchling off a gold tank is plain', () => {
  // Otherwise one gold tank would quietly be two gold tanks, and the roll that made
  // it would have paid for four bodies instead of one.
  const field = runAged(902, 300);
  const tank = goldAt(field, 'tank', BALANCE.arena.w / 2, BALANCE.arena.h / 2);
  const before = field.enemies.length;

  killEnemy(field, tank, true);
  const kids = field.enemies.filter((enemy) => !enemy.elite);
  assert.ok(field.enemies.length >= before, 'the tank came apart into its hatchlings');
  assert.ok(kids.length >= 2, 'and there are ' + kids.length + ' of them');
  for (const kid of field.enemies) {
    assert.equal(kid.elite, false, 'none of them wears gold');
    assert.equal(kid.cost, BALANCE.kinds[kid.type].cost, 'nor pays a gold price');
  }
});

// --- how one arrives ----------------------------------------------------------

test('the roll for a gold body is not spent before PLAN wants one', () => {
  const field = runAged(903, E.from - 1);
  const before = logic.state;
  for (let i = 0; i < 500; i++) assert.equal(rollElite(field), false, 'not one of them');
  assert.equal(logic.state, before,
    'and the stream did not move: a run that dies at 7:59 is the run it always was');

  field.elapsed = E.from;
  assert.ok(goldRolls(field, 200) > 0, 'one second later they can arrive');
});

test('after 8:00 about one wave in eight carries one', () => {
  const field = runAged(904, LATE);
  const tries = 10000;
  const gold = goldRolls(field, tries);
  const share = gold / tries;
  assert.ok(Math.abs(share - E.chance) < 0.03,
    gold + ' of ' + tries + ' waves carried one: ' + (share * 100).toFixed(1)
    + '% against ' + (E.chance * 100).toFixed(1) + '% wanted');
});

test('a wave carries at most one, and several waves carry one', () => {
  const field = runAged(905, LATE);
  let waves = 0;
  let withGold = 0;
  for (let i = 0; i < 400; i++) {
    field.enemies.length = 0;
    field.spawnTimer = 0;
    const wave = updateWaves(field, STEP);
    if (!wave) continue;
    waves++;
    const gold = wave.members.filter((enemy) => enemy.elite).length;
    assert.ok(gold <= 1, 'a wave brought ' + gold + ' gold bodies; one is the ceiling');
    if (gold === 1) withGold++;
  }
  assert.ok(waves > 100, 'the director sent ' + waves + ' waves to look at');
  assert.ok(withGold > 0, 'and at least one of them carried a gold one');
  const share = withGold / waves;
  assert.ok(Math.abs(share - E.chance) < 0.06,
    withGold + ' of ' + waves + ' waves: ' + (share * 100).toFixed(1) + '% against '
    + (E.chance * 100).toFixed(1) + '%');
});

test('a gold body is bought out of the room the wave was given', () => {
  const field = runAged(906, LATE);
  for (let i = 0; i < 200; i++) {
    field.enemies.length = 0;
    field.spawnTimer = 0;
    const room = BALANCE.waves.waveMaxPoints;
    const wave = updateWaves(field, STEP);
    if (!wave) continue;
    assert.ok(wave.points <= room,
      'a wave spent ' + wave.points + ' of a room worth ' + room);
    let spent = 0;
    for (const enemy of wave.members) spent += enemy.cost;
    assert.equal(wave.points, spent, 'and reports what its own members cost');
  }
});

test('an arrival asked for gold is gold, and one that was not is not', () => {
  const field = runAged(907, LATE);
  const asked = spawnEnemy(field, 'darter', 0, true);
  assert.ok(asked, 'the spawn answered the enemy itself');
  assert.equal(asked.elite, true);
  assert.equal(asked.type, 'darter');

  field.enemies.length = 0;
  field.elapsed = 60;
  const plain = spawnEnemy(field, 'darter', 0);
  assert.equal(plain.elite, false, 'nobody asked it for gold');
});

test('a tight wave still arrives, and still does not overspend', () => {
  // The room is deliberately pinned near the least the director will spend, which is
  // where a gold body is least likely to fit: whatever the rolls said, a wave is
  // never worth more than the room it was bought with.
  const field = runAged(908, LATE);
  const cheapest = Math.min(...Object.values(BALANCE.kinds).map((kind) => kind.cost));
  assert.ok(BALANCE.waves.waveMinPoints >= cheapest * E.costMul,
    'the smallest wave is at least worth one gold body of the cheapest kind');

  for (let i = 0; i < 200; i++) {
    // Crowd the arena until only just enough room is left for a wave at all.
    while (roomToSpare(field) > BALANCE.waves.waveMinPoints + 1) {
      field.enemies.push(makeEnemy(field, 'tank', 200 + field.enemies.length * 4, 200));
    }
    field.spawnTimer = 0;
    const room = roomToSpare(field);
    const wave = updateWaves(field, STEP);
    if (!wave) continue;
    assert.ok(wave.points <= room, 'spent ' + wave.points + ' of ' + room);
    let spent = 0;
    for (const enemy of wave.members) spent += enemy.cost;
    assert.equal(spent, wave.points, 'and told the truth about it');
    field.enemies.length = 0;
  }
});

// --- what it leaves behind ----------------------------------------------------

test('a gold body drops a large shard, and a plain one never does', () => {
  const field = runAged(909, LATE);
  const ship = field.player;
  const gold = goldAt(field, 'drifter', ship.x + 400, ship.y);
  killEnemy(field, gold, true);

  const big = field.shards.items.filter((shard) => shard.worth > 1);
  assert.equal(big.length, 1, 'exactly one large shard out of a gold body');
  assert.equal(big[0].worth, SHARDS.big.worth);

  field.shards.clear();
  field.enemies.length = 0;
  const plain = goldAt(field, 'drifter', ship.x + 400, ship.y);
  plain.elite = false;
  plain.cost = BALANCE.kinds.drifter.cost;
  killEnemy(field, plain, true);
  assert.equal(field.shards.items.filter((shard) => shard.worth > 1).length, 0,
    'a plain body scatters plain shards and that is all');
});

test('only a kill the ship did pays out', () => {
  // A bomber's chain reaction is the player's work for score, but a blast that took
  // a gold body out is not something they chose to bring down.
  const field = runAged(910, LATE);
  const ship = field.player;
  const gold = goldAt(field, 'drifter', ship.x + 400, ship.y);
  const score = field.score;
  const kills = field.kills;

  killEnemy(field, gold, false);
  assert.equal(field.score, score, 'nothing was scored');
  assert.equal(field.kills, kills, 'nothing was counted');
  assert.equal(field.shards.count, 0, 'and nothing was dropped at all');
});

test('a large shard is worth what it says it is worth', () => {
  const field = runAged(911, LATE);
  const ship = field.player;
  dropBigShard(field, ship.x, ship.y);
  const xp = field.xp;
  const score = field.score;
  const collected = field.shardsCollected;

  stepTheWorld();
  assert.ok(field.shardsCollected > collected, 'the ship sucked it in on the next step');
  assert.equal(field.xp - xp, SHARDS.xp * SHARDS.big.worth, 'and was paid for it');
  assert.equal(field.score - score, SHARDS.score * SHARDS.big.worth);
});

test('the heal is rolled for a ship that needs one, and not for one that does not', () => {
  const field = runAged(912, LATE);
  const ship = field.player;
  assert.equal(ship.hull, ship.maxHull, 'a fresh ship is whole');

  // Whole: no heal, and no roll spent finding out - the big shard is dropped either
  // way, so what this can say is that the ship's hull never moved.
  for (let i = 0; i < 20; i++) {
    ship.hull = ship.maxHull;
    const gold = goldAt(field, 'drifter', ship.x + 400, ship.y);
    assert.equal(eliteSpoils(field, gold), false, 'a whole ship is never healed');
    assert.equal(ship.hull, ship.maxHull, 'and never owes one either');
  }

  // Hurt: the gift lands about as often as the balance says it should. The roll is
  // one number and each death spends it, so this measures the rule and not the seed.
  ship.hull = 1;
  let healed = 0;
  const tries = 400;
  for (let i = 0; i < tries; i++) {
    ship.hull = 1;
    const gold = goldAt(field, 'drifter', ship.x + 400, ship.y);
    if (eliteSpoils(field, gold)) healed++;
    assert.ok(ship.hull <= ship.maxHull, 'a heal never fills more than the ship can hold');
  }
  const share = healed / tries;
  assert.ok(Math.abs(share - E.heal.chance) < 0.08,
    healed + ' of ' + tries + ' deaths healed: ' + (share * 100).toFixed(1)
    + '% against ' + (E.heal.chance * 100).toFixed(1) + '% promised');
});

test('healing a ship that is already whole does nothing, and says so', () => {
  const field = runAged(913, LATE);
  const ship = field.player;
  assert.equal(healPlayer(field, 1), 0, 'nothing was healed');
  assert.equal(ship.hull, ship.maxHull, 'and nothing changed');

  ship.hull = 1;
  assert.equal(healPlayer(field, 1), 1, 'one hull, because one was asked for');
  assert.equal(ship.hull, 2);
  assert.equal(healPlayer(field, 5), 1, 'only as much as the ship can hold comes back');
  assert.equal(ship.hull, ship.maxHull);
});

test('a gold body killed by the ship pays its score and its spoils together', () => {
  const field = runAged(914, LATE);
  const ship = field.player;
  const gold = goldAt(field, 'tank', ship.x + 500, ship.y);
  const before = { score: field.score, kills: field.kills, shards: field.shards.count };

  killEnemy(field, gold, true);
  assert.equal(field.score - before.score, gold.score, 'the score its kind times five');
  assert.equal(field.kills - before.kills, 1);
  assert.ok(field.shards.count > before.shards, 'and a pile of shards, one of them large');
  assert.ok(field.texts.count > 0, 'and a number floated up over the wreck');
});

test('none of it moves a run that ends before the eighth minute', () => {
  // The whole elite is gated on `from`, and the simulation bot dies at about 2:10,
  // so the reference run must not be able to notice any of it. This is the same
  // promise the reference trace makes, stated where the code for it is.
  const field = runAged(915, 0);
  const seen = [];
  let t = 0;
  while (t < E.from - 1) {
    t += STEP * 60;
    field.elapsed = t;
    field.spawnTimer = 0;
    const wave = updateWaves(field, STEP);
    if (wave) for (const enemy of wave.members) seen.push(enemy.elite);
    field.enemies.length = 0;
  }
  assert.ok(seen.length > 500, 'the director sent ' + seen.length + ' bodies');
  assert.equal(seen.filter(Boolean).length, 0, 'and not one of them was gold');
});
