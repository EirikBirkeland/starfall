// The primaries as data (PLAN 3.2) and the pull one of them makes (game/weapons.js).
//
// The scripted world again: the ship is parked in the middle of the arena pointing
// straight up, which is what makes a fan's geometry arithmetic a test can do on purpose.
// Everything here is about what a gun is; what the crowd does about it is
// test/scatter.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { resetRun } from '../src/game/run.js';
import {
  WEAPONS, defaultWeapon, fire, shotsPerPull, shotsPerSecond, setWeapon, setWeaponByIndex,
  weaponName, weaponOf,
} from '../src/game/weapons.js';
import { makeBullet } from '../src/game/bullets.js';
import { scriptedRun } from '../tools/headless/scripted.js';

/** The hull unit: what a plain shot of the plain gun costs a body. */
const UNIT = BALANCE.bullets.damage;
const PULSE = BALANCE.weapons.pulse;

/**
 * The primaries that throw shots, i.e. everything except the arc and the lance.
 *
 * Most of what this file says is about a fan of bullets - where it opens, what each of its
 * shots carries, that a recycled shot is a fresh one - and none of it is true of the two guns
 * that throw no bullets at all: the arc finds the bodies it hurts instead (game/arc.js) and the
 * lance spends a wind-up on a line of light (game/lance.js). Those weapons' own contracts are
 * test/arc.test.mjs and test/lance.test.mjs; what belongs here is what every primary shares,
 * which is a name, a rate, and the two lines that multiply it. The Swarm *is* a fan of shots - a
 * fan that steers and goes off where it lands, which is test/missiles.test.mjs's business and not
 * this file's.
 */
const SHOT_GUNS = WEAPONS.filter((weapon) => {
  const row = BALANCE.weapons[weapon.id];
  return row.chain === undefined && row.beam === undefined;
});
const CHAIN_GUNS = WEAPONS.filter((weapon) => BALANCE.weapons[weapon.id].chain !== undefined);
const BEAM_GUNS = WEAPONS.filter((weapon) => BALANCE.weapons[weapon.id].beam !== undefined);
const MISSILE_GUNS = WEAPONS.filter((weapon) => BALANCE.weapons[weapon.id].missile !== undefined);

/** Every field a bullet has, by name, from the pool's own maker. */
const FIELDS = Object.keys(makeBullet());

/** One pull of the trigger into an empty magazine, as the shots that came out. */
function pull(field) {
  field.bullets.clear();
  fire(field);
  return field.bullets.items.slice(0);      // the live list, snapshotted
}

/** How far off the nose a shot left, in radians, folded back to [-pi, pi]. */
function leanOf(shot, ship) {
  const lean = Math.atan2(shot.vy, shot.vx) - ship.angle;
  return Math.atan2(Math.sin(lean), Math.cos(lean));
}

test('every primary on offer is a whole row of numbers', () => {
  // The title screen offers what the table can back up: an id with a row of its own, and
  // a row with every number its kind of pull needs in it. A weapon added to one and not the
  // other is the kind of bug this is here to make impossible - and there are three kinds of
  // pull now, so all three are asked for their own numbers, plus the one extra block the gun that
  // throws hunting shots owes its own module (game/missiles.js).
  assert.ok(WEAPONS.length >= 2, 'the game has more than one primary now');
  assert.ok(CHAIN_GUNS.length > 0, 'one of them is the chain');
  assert.ok(BEAM_GUNS.length > 0, 'one of them is the beam');
  assert.ok(MISSILE_GUNS.length > 0, 'one of them is the flight of micro-missiles');
  for (const weapon of WEAPONS) {
    const row = BALANCE.weapons[weapon.id];
    assert.ok(row !== undefined, weapon.id + ' is offered but has no numbers');
    for (const key of ['fireRate', 'pellets', 'damage', 'recoil']) {
      assert.ok(Number.isFinite(row[key]), weapon.id + ' is missing ' + key);
    }
    assert.ok(row.pellets >= 1, weapon.id + ' throws at least one thing');
    assert.ok(weapon.blurb.length > 0, weapon.id + ' has a line for the player');
    assert.ok(row.name.length > 0, weapon.id + ' has a name to be flown under');

    if (row.chain !== undefined) {
      // A chain needs to know how far it reaches, how far it hops, how many bodies it lands
      // on and what each of them costs. It has no speed and no life in seconds because it
      // flies nowhere at all (game/arc.js).
      for (const key of ['reach', 'leap', 'jumps', 'decay', 'jolt']) {
        assert.ok(Number.isFinite(row.chain[key]), weapon.id + ' is missing chain.' + key);
      }
      assert.ok(row.chain.decay > 0 && row.chain.decay <= 1, weapon.id + ': a chain decays');
      assert.ok(row.chain.reach >= row.chain.leap,
        weapon.id + ': the first leap reaches at least as far as a hop');
    } else if (row.beam !== undefined) {
      // A beam needs to know how long it is wound up for, how wide a line still hurts, how far it
      // throws what it crosses, and how long its light is kept (game/lance.js). It has no speed,
      // no life and no knockback because nothing travels: the reach is the arena's.
      for (const key of ['wind', 'halfWidth', 'shove']) {
        assert.ok(Number.isFinite(row.beam[key]), weapon.id + ' is missing beam.' + key);
      }
      assert.ok(Number.isFinite(row.beam.light.life), weapon.id + ' is missing beam.light.life');
      assert.ok(row.beam.wind > 0, weapon.id + ': a wind-up of nothing is a free gun');
      assert.ok(row.beam.halfWidth > 0, weapon.id + ': a line nobody can stand on');
    } else {
      for (const key of ['gap', 'speed', 'life', 'spread', 'knockback']) {
        assert.ok(Number.isFinite(row[key]), weapon.id + ' is missing ' + key);
      }
      assert.ok(row.gap >= 0, weapon.id + ': a negative fan is not a fan');

      if (row.missile !== undefined) {
        // A gun whose shots hunt and go off owes four more numbers: how hard they can turn, how far
        // they look, how wide they go off and how much of themselves that costs (game/missiles.js).
        for (const key of ['turn', 'reach']) {
          assert.ok(Number.isFinite(row.missile[key]), weapon.id + ' is missing missile.' + key);
        }
        assert.ok(row.missile.turn > 0, weapon.id + ': a missile that cannot turn is a slow shot');
        for (const key of ['radius', 'share', 'shove', 'shake']) {
          assert.ok(Number.isFinite(row.missile.blast[key]), weapon.id + ' is missing blast.' + key);
        }
        assert.ok(row.missile.blast.share > 0 && row.missile.blast.share < 1,
          weapon.id + ': a blast is worth part of the shell, not more than it');
      }
    }
  }

  assert.ok(WEAPONS.some((w) => w.id === defaultWeapon()), 'the default is one of them');
});

test('the plain gun is the unit every enemy hull is counted in', () => {
  // A deliberate decision and not a coincidence (BALANCE.bullets): a drone bite and a
  // nova front cost a body `bullets.damage` whatever gun is being flown, because that
  // number is the unit enemy hull is written in - and the pulse is the gun that unit was
  // defined against. Change one and you have to change the other, on purpose.
  assert.equal(PULSE.damage, UNIT);
});

test('a primary is chosen by id, and by its place on the title screen', () => {
  const field = scriptedRun(300);
  assert.equal(field.weapon, defaultWeapon(), 'a fresh world flies the default');

  setWeapon(field, 'scatter');
  assert.equal(field.weapon, 'scatter');
  assert.equal(weaponName(field), BALANCE.weapons.scatter.name);

  // The number keys, in the order the title prints them.
  assert.equal(setWeaponByIndex(field, 0), true);
  assert.equal(field.weapon, WEAPONS[0].id);
  assert.equal(setWeaponByIndex(field, WEAPONS.length - 1), true);
  assert.equal(field.weapon, WEAPONS[WEAPONS.length - 1].id);
  assert.equal(setWeaponByIndex(field, WEAPONS.length), false, 'there is no key past the list');

  // And an id that is not a primary is a bug that says so out loud. `BALANCE.weapons` holds a
  // couple of meta keys beside the weapons, so being in that table is not enough - and PLAN 3.2's
  // five primaries are all in the game now, so the not-a-weapon has to be a name nobody used.
  assert.throws(() => setWeapon(field, 'sprayer'), /no weapon is offered/);
  assert.throws(() => setWeapon(field, 'rateMax'), /no weapon is offered/);
  assert.throws(() => weaponOf({ weapon: 'wobble' }), /no weapon is called/);
});

test('the gun is not cached in the ship, so changing it takes effect at once', () => {
  // No `player.gun` field, no rank written into a ship: every number is read where it is
  // used, which is what makes a mid-run switch honest rather than half-applied.
  const field = scriptedRun(301);
  assert.equal(pull(field).length, PULSE.pellets);

  setWeapon(field, 'scatter');
  const scatter = pull(field);
  assert.equal(scatter.length, BALANCE.weapons.scatter.pellets, 'the very next pull is the new gun');
  assert.equal(shotsPerSecond(field), BALANCE.weapons.scatter.fireRate, 'and so is the cycle');
});

test('the fire rate line multiplies whichever gun is being flown', () => {
  const field = scriptedRun(302);
  const line = BALANCE.upgrades.fireRate;

  for (const weapon of WEAPONS) {
    const gun = BALANCE.weapons[weapon.id];
    setWeapon(field, weapon.id);
    assert.equal(shotsPerSecond(field), gun.fireRate, weapon.id + ': its own rate');

    for (const rank of [1, line.ranks]) {
      field.upgrades.fireRate = rank;
      const wanted = gun.fireRate * (1 + line.step * rank);
      assert.ok(Math.abs(shotsPerSecond(field) - wanted) < 1e-9, weapon.id + ' rank ' + rank);
      // The ceiling is a frame-budget guard, not a thing a player runs into: if a weapon
      // could reach it, the number below would be a silent tax on the fire rate card.
      assert.ok(wanted < BALANCE.weapons.rateMax, weapon.id + ' stays under the ceiling');
    }
    field.upgrades.fireRate = 0;
  }
});

test('the split line adds to a pull whatever the pull already was', () => {
  const field = scriptedRun(303);
  const split = BALANCE.upgrades.split;

  for (const weapon of SHOT_GUNS) {
    const gun = BALANCE.weapons[weapon.id];
    setWeapon(field, weapon.id);
    for (const rank of [0, 2, split.ranks]) {
      field.upgrades.split = rank;
      const wanted = gun.pellets + rank * split.step;
      assert.equal(shotsPerPull(field), wanted, weapon.id + ' rank ' + rank);
      assert.equal(pull(field).length, wanted, 'and the gun agrees with the line');
    }
    field.upgrades.split = 0;
  }
});

test('the gun throws its whole weight at everything it owns, and the extras carry a share', () => {
  // A shotgun's pellets are not a fan of weights: six of them are six of the same shot.
  // Only what the split line bolts on afterwards is lighter, and that is the line's own
  // price rather than the gun's.
  const field = scriptedRun(304);
  const split = BALANCE.upgrades.split;
  setWeapon(field, 'scatter');
  field.upgrades.split = split.ranks;
  field.upgrades.damage = 2;

  const gun = BALANCE.weapons.scatter;
  const weight = gun.damage * (1 + BALANCE.upgrades.damage.step * 2);
  const shots = pull(field);

  for (let i = 0; i < gun.pellets; i++) {
    assert.ok(Math.abs(shots[i].dmg - weight) < 1e-9, 'pellet ' + i + ' is a whole shot');
  }
  for (let i = gun.pellets; i < shots.length; i++) {
    assert.ok(Math.abs(shots[i].dmg - weight * split.share) < 1e-9, 'extra ' + i + ' is a share');
  }

  let total = 0;
  for (const shot of shots) total += shot.dmg;
  assert.ok(total > weight, 'the extras are not nothing');
  assert.ok(total < weight * shots.length, 'and they are not free: ' + (total / weight).toFixed(2) + ' shots worth');
});

test('a shot carries its own gun: speed, reach, and the shove it gives a body', () => {
  const field = scriptedRun(305);

  for (const weapon of SHOT_GUNS) {
    const gun = BALANCE.weapons[weapon.id];
    setWeapon(field, weapon.id);
    const shots = pull(field);
    for (const shot of shots) {
      assert.ok(Math.abs(Math.hypot(shot.vx, shot.vy) - gun.speed) < 1e-9, weapon.id + ': its speed');
      assert.equal(shot.life, gun.life, weapon.id + ': its reach');
      assert.equal(shot.knock, gun.knockback, weapon.id + ': its shove');
    }
  }

  // And the bullet pool reuses its objects, so a shot fired by the second gun must not
  // still be carrying the first one's numbers. The same trap as `pierce` and `bounce`.
  setWeapon(field, WEAPONS[0].id);
  pull(field);
  setWeapon(field, 'scatter');
  for (const shot of pull(field)) {
    assert.equal(shot.knock, BALANCE.weapons.scatter.knockback, 'a recycled shot is a fresh one');
    assert.equal(shot.life, BALANCE.weapons.scatter.life);
  }
});

test('a pull writes every field a bullet has, whichever gun fired it', () => {
  // The pool contract: `makeBullet`'s shape is the whole contract, and a spawner that
  // forgets a field leaves whatever the last shot had in it.
  const field = scriptedRun(306);

  for (const weapon of SHOT_GUNS) {
    setWeapon(field, weapon.id);
    const shots = pull(field);
    for (const shot of shots) {
      for (const key of FIELDS) {
        assert.ok(shot[key] !== undefined, weapon.id + ' left ' + key + ' unwritten');
        if (key === 'hits') assert.equal(shot.hits.length, 0);
        else if (typeof shot[key] === 'number') assert.ok(Number.isFinite(shot[key]), key);
      }
    }
  }
});

test('the ship is shoved back by the gun that kicked, not by the crowd it hit', () => {
  const field = scriptedRun(307);
  const ship = field.player;

  // The nose points up, so every kick is a push down: read the ship's own velocity.
  const kick = (id) => {
    setWeapon(field, id);
    ship.vx = 0;
    ship.vy = 0;
    fire(field);
    return ship.vy;
  };

  assert.ok(Math.abs(kick('pulse') - PULSE.recoil) < 1e-9, 'the pulse barely nudges');
  const scatter = kick('scatter');
  assert.ok(scatter > PULSE.recoil * 2,
    'a scatter is a shove you feel: ' + scatter + ' px/s of kick');
});

test('a new run keeps the primary that was picked', () => {
  // The pick is not part of a run, it is what the runs of this visit are flown with -
  // like the seed. `resetRun` puts the ship back and leaves the gun rack alone.
  const field = scriptedRun(308);
  setWeapon(field, 'scatter');
  resetRun(field);
  assert.equal(field.weapon, 'scatter', 'the pick survives the reset');
  assert.equal(pull(field).length, BALANCE.weapons.scatter.pellets, 'and the run flies it');
});

test('the first shot leaves on the nose and the fan opens out from there', () => {
  // One aim error per projectile, so a fan is a fan of shots and not a grid: the aimed
  // one is allowed to be off by the gun's own error and nothing more, and every weapon's
  // fan must stay inside its own spread of the aim for its first shot.
  const field = scriptedRun(309);
  const ship = field.player;

  for (const weapon of SHOT_GUNS) {
    setWeapon(field, weapon.id);
    const gun = BALANCE.weapons[weapon.id];
    field.bullets.clear();
    fire(field);
    // Read while the shots are still live, and read every one of them.
    let worst = 0;
    for (const shot of field.bullets.items) {
      worst = Math.max(worst, Math.abs(leanOf(shot, ship)));
    }
    assert.ok(worst <= gun.gap * 3 + gun.spread + 1e-9, weapon.id + ': a shot left the fan');
    assert.ok(Math.abs(leanOf(pull(field)[0], ship)) <= gun.spread + 1e-9,
      weapon.id + ': the first shot is the one that was aimed');
  }
});
