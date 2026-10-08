// Burn (PLAN 3.5): a hit sets the crowd alight, the fire eats the body for a while, and at
// the third rank a body that comes apart alight sets its neighbours alight.
//
// Four things are measured here, in the order the system argues for itself in
// `game/burn.js`:
//
//   one fire per body - a hit on a body already burning buys it time, it does not stack a
//     second fire on it, and the line's rank is the only thing that decides how hard the
//     fire bites;
//   the weight - a bite is a share of one shot of the ship's own gun per second of burning,
//     so it grows with the damage line exactly as a shot does, and it is worth nothing at
//     all at rank 0 (which is why the line sells a `rate` and not a percentage of something);
//   the tail - the fire outlives the last hit that lit it, and that tail is the damage you
//     did not have to fire, which is the whole card;
//   the jump - PLAN's "spread it on death at rank 3", which passes the fire sideways for a
//     share of what the corpse had left, so a chain runs down and dies out instead of
//     setting the arena alight from one match.
//
// The bodies are planted with a hull big enough to survive whatever the test is doing to
// them, because a corpse cannot be measured: these tests want a rate of damage, not a count
// of corpses (NOTES session 30's fractional-damage trap). The bodies that are meant to be
// brought down are given a hull of 1. Everything is the game's own fixed step, on the
// scripted world, with the ship invulnerable and the wave director switched off.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { logic } from '../src/core/rng.js';
import { damageEnemy } from '../src/game/enemies.js';
import { fire, setWeapon } from '../src/game/weapons.js';
import { ignite } from '../src/game/burn.js';
import { flameOf, gainOf } from '../src/game/upgrades.js';
import { scriptedRun, enemyAt, stepTheWorld } from '../tools/headless/scripted.js';

const BURN = BALANCE.upgrades.burn;
const GUN = BALANCE.bullets;
const STEP = BALANCE.sim.step;
const BIG = 1e6;
/** What one bite of the fire costs a body on a plain gun, at one rank. */
const BITE = GUN.damage * BURN.step * BURN.bite;

/** Everything that would otherwise turn a measured window into a level-up pause. */
function sweep(field) {
  field.shards.clear();
  field.xp = 0;
  field.offer.length = 0;
  field.pendingLevels = 0;
}

/** Step `seconds` of the game's own clock, holding `input` the whole way. */
function runFor(field, seconds, input) {
  for (let i = 0, steps = Math.round(seconds / STEP); i < steps; i++) {
    sweep(field);
    stepTheWorld(input);
  }
}

/** A run on `ranks` of burn, and nothing in it. */
function burning(seed, ranks) {
  const field = scriptedRun(seed);
  field.upgrades.burn = ranks;
  return field;
}

/** One body of `type`, standing still, that will not run out of hull. */
function standingStill(field, type, x, y, hp) {
  const body = enemyAt(type, x, y, hp === undefined ? BIG : hp);
  body.speed = 0;
  return body;
}

/** North of the ship - where the gun is pointed - `distance` px out. */
function ahead(field, type, distance, hp) {
  const ship = field.player;
  return standingStill(field, type, ship.x, ship.y - distance, hp);
}

/** The fire eating this body, or null. */
function fireOn(field, body) {
  for (const fire2 of field.fires.items) if (fire2.target === body) return fire2;
  return null;
}

/** How many bodies are alight. */
function alight(field) {
  return field.fires.count;
}

/** Fire until something catches, and say whether it did. Bounded, as every wait in here. */
function fireUntilAlight(field, frames) {
  fire(field);
  for (let i = 0; i < frames && alight(field) === 0; i++) stepTheWorld({ firing: true });
  return alight(field);
}

test('the line is nothing at all at rank 0, and a share of the gun above it', () => {
  const field = burning(10, 0);
  const body = ahead(field, 'drifter', 200);

  ignite(field, body);
  assert.equal(alight(field), 0, 'a run that did not take the card lights nothing');
  assert.equal(flameOf(field), 0, 'and there is no fire to be worth anything');

  field.upgrades.burn = 1;
  assert.ok(Math.abs(flameOf(field) - BURN.step) < 1e-12, 'one rank is one step');
  field.upgrades.burn = BURN.ranks;
  assert.ok(Math.abs(flameOf(field) - BURN.step * BURN.ranks) < 1e-12, 'and the ranks add up');
});

test('a hit sets a body alight, and the next hit feeds the same fire', () => {
  const field = burning(11, 2);
  ahead(field, 'drifter', 120);

  assert.equal(fireUntilAlight(field, 60), 1, 'the shot that landed lit one fire');

  fire(field);
  runFor(field, 0.2, { firing: true });
  assert.equal(alight(field), 1, 'and the shots after it lit nothing new - one body, one fire');
});

test('the fire bites on a beat, and a bite is the line\'s share of a shot', () => {
  const field = burning(12, 1);
  const body = ahead(field, 'drifter', 200);
  // However many beats the fire lives through is how many bites it pays out, and the tail on
  // the last one is a matter of where the step boundary falls, so this is a count plus or
  // minus one and not an exact one.
  const beats = Math.floor(BURN.time / BURN.bite);

  ignite(field, body);
  const before = body.hp;
  runFor(field, BURN.time + 0.1);

  const lost = before - body.hp;
  assert.ok(lost > 0, 'the fire took something off it with nobody firing');
  assert.ok(Math.abs(lost / BITE - beats) <= 1,
    'the burn came to ' + lost.toFixed(3) + ' hull, or ' + (lost / BITE).toFixed(2) +
    ' bites of ' + BITE + ' where ' + beats + ' were expected');
  assert.equal(alight(field), 0, 'and it went out on its own when its time was up');
});

test('the damage line makes the fire heavier, because a bite is a shot', () => {
  const field = burning(13, 3);
  const plain = ahead(field, 'drifter', 200);
  ignite(field, plain);
  const beforePlain = plain.hp;
  // A whole burn each, because the fire pays in chunks: one window can hold one more bite
  // than the next, and over six bites that is worth less than a fifth of the answer.
  runFor(field, BURN.time);

  field.upgrades.damage = 4;
  const heavy = ahead(field, 'drifter', 240);
  ignite(field, heavy);
  const beforeHeavy = heavy.hp;
  runFor(field, BURN.time);

  const want = gainOf(field, 'damage');
  const ratio = (beforeHeavy - heavy.hp) / (beforePlain - plain.hp);
  assert.ok(Math.abs(ratio / want - 1) < 0.2,
    'the fire came up by the damage line: ' + ratio.toFixed(3) + ' against ' + want);
});

test('the tail is the card: a body goes on burning long after the last hit that lit it', () => {
  const field = burning(14, 2);
  const body = ahead(field, 'drifter', 200);

  ignite(field, body);
  runFor(field, BURN.time * 0.5);
  assert.equal(alight(field), 1, 'half its time left, and nobody has touched it since');

  const half = fireOn(field, body).left;
  ignite(field, body);
  assert.ok(fireOn(field, body).left > half, 'one more hit put the whole time back on');

  const at = body.hp;
  runFor(field, BURN.time + 0.1);
  assert.equal(alight(field), 0, 'and it went out a full burn after that last one');
  assert.ok(body.hp < at, 'and every one of those seconds was costing it hull');
});

test('a body already burning keeps the longer fire, whichever door it came in by', () => {
  const field = burning(15, BURN.ranks);
  const kept = ahead(field, 'drifter', 200);
  const dying = ahead(field, 'drifter', 260);

  ignite(field, kept);
  ignite(field, dying);
  runFor(field, BURN.time * 0.9);            // both of them down to a tenth of a burn
  ignite(field, kept);                       // and one more shot lands on the first
  const full = fireOn(field, kept).left;
  const short = fireOn(field, dying).left;
  assert.ok(full > short, 'the one that was hit again has the longer fire');

  damageEnemy(field, dying, BIG, true);      // the other one comes apart inside the jump
  stepTheWorld();

  assert.ok(Math.abs(fireOn(field, kept).left - full) < STEP * 1.5,
    'and the jump it caught did not shorten the fire it already had');
});

test('a body that comes apart alight is not alight any more', () => {
  const field = burning(16, 1);
  const body = ahead(field, 'drifter', 200);
  ignite(field, body);

  damageEnemy(field, body, BIG, true);
  assert.equal(field.enemies.length, 0, 'the body is out of the crowd');

  stepTheWorld();
  assert.equal(alight(field), 0, 'and its fire went out one step later, having spread nowhere');
});

test('the fire is the ship doing the killing: a burn-down is a kill, and it pays', () => {
  const field = burning(17, BURN.ranks);
  const body = ahead(field, 'drifter', 200, 1);
  const kills = field.kills;

  ignite(field, body);
  runFor(field, BURN.time + 0.1);

  assert.equal(field.enemies.length, 0, 'the fire brought it down');
  assert.equal(field.kills, kills + 1, 'and the run was paid for it, points and all');
});

test('two ranks of burn only bite; three ranks spread', () => {
  for (const ranks of [BURN.spread.at - 1, BURN.spread.at]) {
    const field = burning(18, ranks);
    const corpse = ahead(field, 'drifter', 200);
    const near = ahead(field, 'weaver', 260);
    const far = ahead(field, 'weaver', 200 + BURN.spread.radius * 3);
    ignite(field, corpse);

    damageEnemy(field, corpse, BIG, true);
    stepTheWorld();

    const caught = fireOn(field, near) !== null;
    if (ranks >= BURN.spread.at) assert.ok(caught, 'rank ' + ranks + ' jumps the fire');
    else assert.ok(!caught, 'rank ' + ranks + ' bites and does not spread');
    assert.equal(fireOn(field, far), null, 'and nothing outside the jump catches, either way');
  }
});

test('a jump reaches what stands inside it, for a share of what the corpse had left', () => {
  const field = burning(19, BURN.ranks);
  const ship = field.player;
  const corpse = ahead(field, 'drifter', 200);
  const inside = standingStill(field, 'drifter', ship.x + BURN.spread.radius * 0.9, ship.y - 200);
  const outside = standingStill(field, 'drifter', ship.x + BURN.spread.radius * 1.2, ship.y - 200);
  ignite(field, corpse);

  runFor(field, BURN.time * 0.5);
  const left = fireOn(field, corpse).left;
  assert.ok(left > 0, 'and the corpse was still burning when it went');

  damageEnemy(field, corpse, BIG, true);
  stepTheWorld();

  assert.equal(alight(field), 1, 'one body caught, and not two');
  assert.equal(fireOn(field, inside) !== null, true, 'the one standing in the jump');
  const caught = fireOn(field, inside).left;
  assert.ok(caught <= left * BURN.spread.share + STEP,
    'for a share of what was left: ' + caught.toFixed(3) + ' of ' + left.toFixed(3));
  assert.equal(outside.hp, BIG, 'and the one outside it is untouched');
});

test('a chain walks a crowd, gets weaker every hop, and dies out', () => {
  const field = burning(20, BURN.ranks);
  const ship = field.player;
  // A row of bodies a jump apart, so a fire could walk the length of the line - and each
  // one is brought down while the last one's jump is still going, which is the case the
  // rank is for: the crowd that comes apart in a heap is the one that catches.
  const row = [];
  for (let i = 0; i < 8; i++) {
    row.push(standingStill(field, 'drifter', ship.x, ship.y - 160 + i * BURN.spread.radius * 0.8));
  }
  ignite(field, row[0]);

  const longest = [];          // the most fire each body ever held, in the order of the row
  for (const body of row) {
    runFor(field, STEP * 5);      // killed before the next one's fire has had time to bite
    longest.push(fireOn(field, body) === null ? 0 : fireOn(field, body).left);
    damageEnemy(field, body, BIG, true);
    stepTheWorld();
  }

  const walked = longest.filter((left) => left > 0).length;
  assert.ok(walked > 1, 'the fire walked down the row: ' +
    longest.map((left) => left.toFixed(2)).join(' '));
  assert.ok(walked < row.length, 'and died out on the way rather than the whole row at once: ' +
    walked + ' of ' + row.length + ' - ' + longest.map((left) => left.toFixed(2)).join(' '));

  let weaker = true;
  for (let i = 1; i < walked; i++) {
    if (longest[i] > longest[i - 1] * BURN.spread.share + STEP) weaker = false;
  }
  assert.ok(weaker, 'and every hop was shorter than the one before it');
});

test('everything the ship hits sets them alight: shots, bolts, drones and fronts', () => {
  const shots = burning(21, 1);
  ahead(shots, 'drifter', 120);
  assert.equal(fireUntilAlight(shots, 60), 1, 'a bullet that landed');

  const bolts = burning(22, 1);
  setWeapon(bolts, 'arc');
  ahead(bolts, 'drifter', 120);
  fire(bolts);
  assert.equal(alight(bolts), 1, 'a bolt, which finds its own body and lights it as it lands');
  setWeapon(bolts, 'pulse');

  const ringed = burning(23, 1);
  ringed.upgrades.orbitals = 1;
  const RING = BALANCE.upgrades.orbitals;
  standingStill(ringed, 'drifter', ringed.player.x + RING.radius, ringed.player.y);
  runFor(ringed, RING.beat + STEP * 4);
  assert.equal(alight(ringed), 1, 'a drone bite');

  const waved = burning(24, 1);
  waved.upgrades.nova = 1;
  const stood = ahead(waved, 'drifter', 140);
  runFor(waved, 0.5);
  assert.equal(alight(waved), 1, 'and a nova front that came over it');
  assert.ok(stood.hp < BIG, 'which had to reach it to light it');
});

test('a body that dies to a hit dies alight, and that is what the third rank bought', () => {
  // The rule the whole line turns on. A shot that kills sets the body alight like any other
  // shot - and a body that is alight when it comes apart passes it on, from the rank that can
  // buy a jump. So at rank 3 and up, killing a crowd is what sets a crowd alight: the fire
  // walks the bodies that are still standing, one death at a time.
  //
  // The fire a killing hit lights is not a whole burn, and cannot be: nothing bites a body
  // that has already come apart. It is the share a jump carries, and no more (game/burn.js),
  // which is what stops a crowd from burning forever off the rate the gun is killing at.
  const field = burning(25, BURN.ranks);
  const victim = ahead(field, 'drifter', 120, 1);
  const neighbour = ahead(field, 'drifter', 120 + BURN.spread.radius - 20);

  fire(field);
  for (let i = 0; i < 60 && field.enemies.length > 1; i++) stepTheWorld({ firing: true });

  assert.equal(field.enemies.length, 1, 'the shot brought the first one down');
  assert.ok(fireOn(field, neighbour) !== null,
    'and the body that stood next to it is alight - the fire went sideways with the kill');
  assert.equal(neighbour.hp, BIG,
    'alight and untouched: the jump is a fire, not a hit of its own');
  assert.equal(alight(field), 1, 'and the corpse is not alight about the sky, it spent itself');
});

test('before the third rank there is no jump to buy, so a kill lights nothing', () => {
  const field = burning(26, 2);
  ahead(field, 'drifter', 120, 1);
  const neighbour = ahead(field, 'drifter', 120 + BURN.spread.radius - 20);

  fire(field);
  for (let i = 0; i < 60 && field.enemies.length > 1; i++) stepTheWorld({ firing: true });

  assert.equal(field.enemies.length, 1, 'the shot brought the first one down');
  assert.equal(alight(field), 0, 'and a two-rank fire has nowhere to go from a corpse');
  assert.equal(neighbour.hp, BIG, 'so nothing beside it caught');
});

test('fire spends no number out of the run stream, so a seed is still a seed', () => {
  const field = burning(28, BURN.ranks);
  const bodies = [];
  for (let i = 0; i < 6; i++) bodies.push(ahead(field, 'drifter', 120 + i * 30));
  for (const body of bodies) ignite(field, body);

  const state = logic.state;
  for (let i = 0; i < 400; i++) {
    sweep(field);
    stepTheWorld();
  }

  assert.ok(bodies.some((body) => body.hp < BIG), 'the fire was doing something all the way');
  assert.equal(logic.state, state, 'not one draw from the stream a run is made of');
});

test('every fire goes out, and a new run forgets the ones that had not', () => {
  const field = burning(29, BURN.ranks);
  for (let i = 0; i < 5; i++) ignite(field, ahead(field, 'drifter', 120 + i * 40));
  assert.equal(alight(field), 5);

  runFor(field, BURN.time + 1);
  assert.equal(alight(field), 0, 'every one of them went out on its own');
});
