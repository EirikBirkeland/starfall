// Thermal shock (PLAN 3.5's first synergy): a body that comes apart both burning and frozen is
// worth a detonation, and that detonation is the *only* ending the death pays - not a third
// payload stacked on the fire's jump and the shatter it would otherwise have had.
//
// Six things are measured here, in the order `game/shock.js` argues for itself:
//
//   the trigger is a death and not a state - a body standing there alight and cold is a body on
//     fire and covered in frost, which is two things the arena already draws, and it goes up when
//     it comes apart;
//   one corpse, one ending - with the synergy owned, a death that wore both pays the blast and
//     neither of the two endings it replaces: no fire jumping on its own account a step later, no
//     shatter;
//   how cold the corpse was is how hard it goes - the same pricing chill had to learn, because a
//     run with a real gun kills a body with about the first shot that touches it;
//   the reach is the ring, the blast never touches the ship that owns it, and its weight is a
//     share of this run's own gun and not a flat number;
//   both halves of what it throws are shares, so a chain runs *down* a crowd and dies out;
//   and the counters on the world (game/shock.js `newShock`) say what the line was asked to do,
//     which is the only way `tools/line-ab.js` can price it.
//
// Bodies that must survive a measurement are given a hull big enough to; the ones meant to come
// apart are given a hull of 1 (NOTES session 30's fractional-damage trap: a corpse cannot be
// measured). Everything runs on the game's own fixed step in the scripted world, with the ship
// invulnerable unless a test says otherwise and the wave director switched off.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { PALETTE } from '../src/core/palette.js';
import { damageEnemy } from '../src/game/enemies.js';
import { ignite, isAlight } from '../src/game/burn.js';
import { chill, frostOf, isChilled } from '../src/game/chill.js';
import { enemyAt, scriptedRun, stepTheWorld } from '../tools/headless/scripted.js';

const SHOCK = BALANCE.upgrades.thermalShock;
const BURN = BALANCE.upgrades.burn;
const GUN = BALANCE.bullets.damage;
const STEP = BALANCE.sim.step;
const BIG = 1e6;

/** A run that has earned the synergy: both parents at the third rank, and the card taken. */
function earned(seed) {
  const field = scriptedRun(seed);
  field.upgrades.burn = 3;
  field.upgrades.chill = 3;
  field.upgrades.thermalShock = 1;
  return field;
}

/** Everything that would otherwise turn a measured window into a level-up pause. */
function sweep(field) {
  field.shards.clear();
  field.xp = 0;
  field.offer.length = 0;
  field.pendingLevels = 0;
}

/** One step of the run, with the ship doing nothing. */
function step(field) {
  sweep(field);
  stepTheWorld({});
}

/** Set one body alight, the way a hit that lands does. */
function alight(field, body) {
  ignite(field, body);
  return body;
}

/**
 * Frost one body to exactly `frost` (0..1). The real door is used first - a hit's worth of the
 * line, so the motes and the going-solid ring are the game's own - and then the number is set to
 * what the test is measuring, because `chill` hands out `chillOf` a hit and a test that wants "a
 * body frozen solid" wants it exactly. That the crossing is told once, and what it costs, is
 * `test/chill.test.mjs`'s business and not this file's.
 */
function frosted(field, body, frost) {
  chill(field, body);
  body.frost = frost;
  return body;
}

/** The colours of every ring the world is holding, oldest first. */
function rings(field) {
  return field.rings.items.slice(0, field.rings.count).map((r) => r.color);
}

/** How many rings of one colour a frame is holding. */
function ringsOf(field, color) {
  return rings(field).filter((c) => c === color).length;
}

/** A body of `type` at (`x`, `y`), alight and frosted to `frost`. */
function wearingBoth(field, type, x, y, frost, hp) {
  const body = enemyAt(type, x, y, hp === undefined ? BIG : hp);
  frosted(field, body, frost);
  alight(field, body);
  return body;
}

test('a corpse that wore both goes up, and takes the room with it', () => {
  const field = earned(11);
  const corpse = wearingBoth(field, 'drifter', 600, 400, 1, 1);
  const near = wearingBoth(field, 'drifter', 660, 400, 0.4);
  field.rings.clear();

  damageEnemy(field, corpse, 1, true);

  assert.equal(field.shock.blasts, 1, 'the death was claimed by the synergy');
  assert.equal(field.shock.caught, 1, 'and one body was standing in it');
  assert.ok(ringsOf(field, PALETTE.burnCore) === 1, 'the flash is the blast\'s own: ' + rings(field));
  assert.ok(near.hp < BIG, 'and the body next to it lost hull');
});

test('a body standing there wearing both does not go off: the trigger is the death', () => {
  const field = earned(12);
  const body = wearingBoth(field, 'drifter', 600, 400, 1);

  for (let i = 0; i < Math.round(1 / STEP); i++) step(field);

  assert.equal(field.shock.blasts, 0, 'nothing detonated');
  assert.ok(isAlight(field, body) && isChilled(body), 'it is still wearing both');
  assert.ok(body.hp < BIG, 'and the fire has been biting it, which is not a detonation');
  assert.equal(ringsOf(field, PALETTE.burnCore), 0, 'and no blast was painted');
});

test('one corpse, one ending: the blast stands in for the shatter and the fire jump', () => {
  const field = earned(13);
  field.upgrades.chill = 5;             // so the ending it replaces is the loud one
  const corpse = wearingBoth(field, 'drifter', 600, 400, 1, 1);
  // A witness with nothing of its own to wear - everything it ends up with came off this blast -
  // and enough hull to stand there and be a witness instead of going up with the corpse.
  const near = enemyAt('drifter', 660, 400, BIG);
  field.rings.clear();
  field.particles.clear();

  damageEnemy(field, corpse, 1, true);
  // One more step, because a fire goes out sideways the step *after* its body is gone - which is
  // exactly the step this blast is supposed to have swallowed (game/burn.js).
  step(field);

  assert.equal(field.shock.blasts, 1, 'the detonation happened');
  assert.equal(ringsOf(field, PALETTE.chillShell), 0, 'the shatter did not: ' + rings(field));
  assert.equal(ringsOf(field, PALETTE.burnFlame), 0, 'nor did the fire jump: ' + rings(field));
  assert.equal(ringsOf(field, PALETTE.burnCore), 1, 'the blast was painted once: ' + rings(field));
  assert.ok(!isAlight(field, corpse), 'the corpse spent its fire in the blast');
  assert.ok(isAlight(field, near), 'and what the blast threw is a fire of its own');
});

test('without the synergy the same death pays both of the old endings and nothing detonates', () => {
  const field = earned(14);
  field.upgrades.thermalShock = 0;
  field.upgrades.chill = 5;
  const corpse = wearingBoth(field, 'drifter', 600, 400, 1, 1);
  const near = enemyAt('drifter', 660, 400, BIG);
  field.rings.clear();

  damageEnemy(field, corpse, 1, true);
  assert.equal(ringsOf(field, PALETTE.chillShell), 1, 'the shatter fired, as it always did');
  assert.equal(ringsOf(field, PALETTE.burnCore), 0, 'and nothing detonated');
  assert.equal(field.shock.blasts, 0);

  step(field);
  assert.ok(isAlight(field, near), 'and the fire jumped on its own account a step later');
  assert.equal(ringsOf(field, PALETTE.burnFlame), 1, 'the way it has always been painted');
});

test('a corpse that wore only one of them pays the ending it earned', () => {
  const field = earned(15);
  field.upgrades.chill = 5;

  const onlyCold = enemyAt('drifter', 400, 400, 1);
  frosted(field, onlyCold, 1);
  const onlyHot = enemyAt('drifter', 900, 400, 1);
  alight(field, onlyHot);
  field.rings.clear();

  damageEnemy(field, onlyCold, 1, true);
  assert.equal(field.shock.blasts, 0, 'a cold corpse on its own is still just a shatter');
  assert.equal(ringsOf(field, PALETTE.chillShell), 1);

  field.rings.clear();
  damageEnemy(field, onlyHot, 1, true);
  assert.equal(field.shock.blasts, 0, 'and a burning one is still just a fire finding its neighbours');
  assert.equal(ringsOf(field, PALETTE.burnCore), 0);
});

test('how cold the corpse was is how hard it goes', () => {
  const solid = earned(16);
  const solidCorpse = wearingBoth(solid, 'drifter', 600, 400, 1, 1);
  const solidNear = wearingBoth(solid, 'drifter', 660, 400, 0.2);
  damageEnemy(solid, solidCorpse, 1, true);
  const solidLoss = BIG - solidNear.hp;

  const shallow = earned(17);
  const shallowCorpse = wearingBoth(shallow, 'drifter', 600, 400, 0.24, 1);
  const shallowNear = wearingBoth(shallow, 'drifter', 660, 400, 0.24);
  damageEnemy(shallow, shallowCorpse, 1, true);
  const shallowLoss = BIG - shallowNear.hp;

  assert.ok(solidLoss > shallowLoss * 3,
    'a body frozen solid goes up harder than one a single cold shot killed: '
    + solidLoss + ' against ' + shallowLoss);
  assert.ok(Math.abs(solidLoss / shallowLoss - 1 / 0.24) < 0.01,
    'and the two are in the ratio of the frost they died with, not merely in order');
});

test('the blast reaches exactly as far as the ring it is painted at', () => {
  const field = earned(18);
  const corpse = wearingBoth(field, 'drifter', 600, 400, 1, 1);
  const inside = wearingBoth(field, 'drifter', 600 + SHOCK.radius - 1, 400);
  const outside = wearingBoth(field, 'drifter', 600 + SHOCK.radius + 1, 400);

  damageEnemy(field, corpse, 1, true);

  assert.ok(inside.hp < BIG, 'a skin inside the reach is in it');
  assert.equal(outside.hp, BIG, 'and a skin outside is not');
});

test('the blast can never hurt the ship that owns it', () => {
  const field = earned(19);
  const ship = field.player;
  ship.invuln = 0;
  ship.hull = 3;
  // Inside the blast and out of touching distance of the hull.
  const corpse = wearingBoth(field, 'drifter', ship.x + 40, ship.y, 1, 1);

  damageEnemy(field, corpse, 1, true);
  for (let i = 0; i < Math.round(0.5 / STEP); i++) step(field);

  assert.equal(field.shock.blasts, 1, 'it did go up');
  assert.equal(ship.hull, 3, 'and the ship paid nothing for standing in it');
});

test('the weight is a share of this run\'s own gun, and grows with the damage line', () => {
  const plain = earned(20);
  const plainCorpse = wearingBoth(plain, 'drifter', 600, 400, 1, 1);
  const plainNear = wearingBoth(plain, 'drifter', 660, 400, 0.2);
  damageEnemy(plain, plainCorpse, 1, true);
  const plainLoss = BIG - plainNear.hp;

  const heavy = earned(21);
  heavy.upgrades.damage = 2;
  const heavyCorpse = wearingBoth(heavy, 'drifter', 600, 400, 1, 1);
  const heavyNear = wearingBoth(heavy, 'drifter', 660, 400, 0.2);
  damageEnemy(heavy, heavyCorpse, 1, true);
  const heavyLoss = BIG - heavyNear.hp;

  const gain = 1 + BALANCE.upgrades.damage.step * 2;
  assert.ok(Math.abs(heavyLoss / plainLoss - gain) < 0.01,
    'the blast is `weight` shots of the gun this run is flying, times the damage line: '
    + plainLoss + ' against ' + heavyLoss);
  assert.ok(Math.abs(plainLoss - GUN * SHOCK.weight) < 1e-6,
    'and at no damage ranks it is `weight` shots of the plain gun');
});

test('what a hop throws is a share of what the last one had, so a chain runs down and dies out', () => {
  const field = earned(22);
  // Three bodies, one reach apart and no further, and only the first of them wearing anything: the
  // cold and the fire every later body has was thrown at it, which is the only way to watch a
  // chain get weaker.
  const first = wearingBoth(field, 'drifter', 400, 400, 1, 1);
  const second = enemyAt('drifter', 400 + SHOCK.radius, 400, 1);
  const third = enemyAt('drifter', 400 + SHOCK.radius * 2, 400, BIG);

  damageEnemy(field, first, 1, true);

  assert.equal(field.shock.blasts, 2,
    'the second body came apart wearing what the first blast gave it, and went up the same way');
  const thrown = SHOCK.cold;
  assert.ok(Math.abs((BIG - third.hp) - GUN * SHOCK.weight * thrown) < 1e-9,
    'and its blast was worth the frost it was *given*, not the frost the first one had: '
    + (BIG - third.hp) + ' against ' + GUN * SHOCK.weight * thrown);
  assert.ok(Math.abs(frostOf(third) - thrown * SHOCK.cold) < 1e-9,
    'and what the third caught was a share of a share: ' + frostOf(third));
  assert.ok(frostOf(third) < thrown && thrown < 1,
    'so every hop is colder, dimmer and weaker than the one before it');
});

test('the blast throws fire as well as cold, and a body it finishes off is the run\'s kill', () => {
  const field = earned(23);
  const before = field.kills;
  const corpse = wearingBoth(field, 'drifter', 600, 400, 1, 1);
  const near = wearingBoth(field, 'drifter', 660, 400, 0.4, 1);

  damageEnemy(field, corpse, 1, true);

  assert.ok(isAlight(field, near), 'the neighbour caught fire');
  assert.ok(isChilled(near) && frostOf(near) > 0.4, 'and gained frost on top of what it had');
  assert.ok(field.kills > before + 1, 'the chain\'s kill was credited to the run');
});

test('one body detonates once, and the counters say what the line was asked to do', () => {
  const field = earned(24);
  // Five pairs, far enough apart that no blast reaches two of them: one corpse, one witness each.
  const pairs = [];
  for (let i = 0; i < 5; i++) {
    const x = 300 + i * 300;
    pairs.push([wearingBoth(field, 'drifter', x, 400, 1, 1),
      wearingBoth(field, 'drifter', x + 80, 400, 0.3)]);
  }

  for (const [corpse] of pairs) damageEnemy(field, corpse, 1, true);

  assert.equal(field.shock.blasts, 5, 'five deaths, five blasts, none of them twice');
  assert.equal(field.shock.caught, 5, 'each one catching the one body standing in its reach');
  const weight = GUN * SHOCK.weight;
  assert.ok(Math.abs(field.shock.dealt - weight * 5) < 1e-9,
    'and the hull it dealt is the arithmetic, counted as it was paid out');
  for (const [, witness] of pairs) {
    assert.ok(witness.hp < BIG, 'every witness was in one');
  }
});

test('the glass belongs to a body that wore the shell, and the quiet ones go up quietly', () => {
  const solid = earned(25);
  const frozen = wearingBoth(solid, 'drifter', 600, 400, 1, 1);
  damageEnemy(solid, frozen, 1, true);
  const chips = solid.particles.items.slice(0, solid.particles.count)
    .filter((p) => p.color === PALETTE.chillShell).length;
  assert.ok(chips >= SHOCK.broke.count, 'a body frozen solid threw the ice: ' + chips);

  const shallow = earned(26);
  const grazed = wearingBoth(shallow, 'drifter', 600, 400, 0.24, 1);
  damageEnemy(shallow, grazed, 1, true);
  const none = shallow.particles.items.slice(0, shallow.particles.count)
    .filter((p) => p.color === PALETTE.chillShell).length;
  assert.equal(none, 0, 'and a body one cold shot killed did not: ' + none);
});
