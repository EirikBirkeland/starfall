// The ships (PLAN 3.7): the rows game/ships.js reads, what they promise each other, and
// what a run gets from them. The title screen's side of it - the rack and the number keys -
// is test/ship-pick.test.mjs; what the frame draws for each is test/ship-art.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { SHIPS, applyShip, defaultShip, setShip, shipAt, shipBody, shipName, shipOf } from '../src/game/ships.js';
import { WEAPONS, setWeapon } from '../src/game/weapons.js';
import { lineOf } from '../src/game/upgrades.js';
import { scriptedRun } from '../tools/headless/scripted.js';

/** Every row the table holds, keyed the way game/ships.js keys them. */
const rows = SHIPS.map((ship) => BALANCE.ships[ship.id]);

/**
 * How far from the ship one of a gun's pulls lands anything, however it is spent: how far a
 * shot flies for the guns that throw shots, how far the arc's first link reaches, and
 * forever for the lance, which is a line across the whole arena.
 */
function reachOf(gun) {
  if (gun.beam !== undefined) return Infinity;
  if (gun.chain !== undefined) return gun.chain.reach;
  return gun.speed * gun.life;
}

test('every ship on offer has a row, and the row holds every number a body needs', () => {
  for (const ship of SHIPS) {
    const row = BALANCE.ships[ship.id];
    assert.ok(row, ship.id + ' is offered but has no row');
    for (const key of ['name', 'shape', 'hull', 'maxHull', 'maxSpeed', 'dashCooldown', 'weapon',
      'ranks', 'cost']) {
      assert.ok(row[key] !== undefined, ship.id + ' has no ' + key);
    }
    assert.ok(ship.blurb.length > 0, ship.id + ' is offered without a line about itself');
    // No row is quietly spelling the default: what the sim writes onto the player is named
    // on every row, whether or not it happens to match anybody else's.
    assert.equal(typeof row.ranks, 'object', ship.id + ' has to say what it starts with, even if nothing');
  }
  // And the table holds nothing else about ships: `default` beside the rows is the only
  // extra key in there, so a row cannot be added that nobody offers.
  const keys = Object.keys(BALANCE.ships).filter((key) => key !== 'default');
  assert.deepEqual(keys, SHIPS.map((ship) => ship.id), 'the rack and the table are the same list');
});

test('the ship the game flies by default is still the ship the game has always flown', () => {
  // The reason the reference run in NOTES is still a valid reference: the Wisp is what a
  // run that never picked anything flies, and its numbers are the ones every measurement in
  // this project was taken on. Move one of these and the reference is a different ship.
  assert.equal(defaultShip(), 'wisp');
  assert.equal(BALANCE.ships.wisp.hull, 3);
  assert.equal(BALANCE.ships.wisp.maxHull, 3);
  assert.equal(BALANCE.ships.wisp.maxSpeed, 320);
  assert.equal(BALANCE.ships.wisp.dashCooldown, 2.5);
  assert.equal(BALANCE.ships.wisp.weapon, 'pulse');
  assert.deepEqual(BALANCE.ships.wisp.ranks, {});
});

test('every ship brings a primary that exists, and no two bring the same one', () => {
  const offered = WEAPONS.map((weapon) => weapon.id);
  const brought = rows.map((row) => row.weapon);
  for (const row of rows) {
    assert.ok(offered.includes(row.weapon), row.name + ' brings a ' + row.weapon + ', which is not offered');
  }
  // One ship per primary: the rack still reaches every gun exactly once, which is what lets a
  // ship pick replace a gun pick without taking a single thing away from the player.
  assert.deepEqual(brought.slice().sort(), offered.slice().sort(),
    'the ships bring the primaries between them, once each');
});

test('a hull is worth about a fifth of the speed, whichever way it is being traded', () => {
  // The claim in the pricing note above `ships` in game/balance.js: the Bulwark sells speed
  // for a fourth pip and the Needle buys it back by giving one up, and the two trades should
  // be priced at about the same rate or one of the two ships is a tax.
  const wisp = BALANCE.ships.wisp;
  const sold = (wisp.maxSpeed - BALANCE.ships.bulwark.maxSpeed) / (BALANCE.ships.bulwark.hull - wisp.hull);
  const bought = (BALANCE.ships.needle.maxSpeed - wisp.maxSpeed) / (wisp.hull - BALANCE.ships.needle.hull);
  const fifth = wisp.maxSpeed / 5;

  assert.ok(BALANCE.ships.bulwark.hull > wisp.hull && BALANCE.ships.bulwark.maxSpeed < wisp.maxSpeed,
    'the Bulwark buys hull with speed');
  assert.ok(BALANCE.ships.needle.hull < wisp.hull && BALANCE.ships.needle.maxSpeed > wisp.maxSpeed,
    'and the Needle sells it back');
  assert.ok(Math.abs(sold - bought) / fifth < 0.25,
    'a pip cost ' + sold.toFixed(0) + ' px/s one way and ' + bought.toFixed(0) + ' the other');
  assert.ok(Math.abs(sold - fifth) / fifth < 0.25,
    'and a pip is worth about a fifth of the plain ship\'s speed, not twice that or a tenth');
});

test('the Volt pays for its quick dash with the reach of the gun it carries', () => {
  // The other half of the pricing note: the Volt's own numbers are all the plain ship's,
  // and what it pays is the arc, whose reach is the shortest of the five primaries.
  const volt = BALANCE.ships.volt;
  const wisp = BALANCE.ships.wisp;
  assert.equal(volt.hull, wisp.hull);
  assert.equal(volt.maxSpeed, wisp.maxSpeed);
  assert.ok(volt.dashCooldown < wisp.dashCooldown, 'its dash comes back sooner than anybody else\'s');
  for (const ship of SHIPS) {
    if (ship.id !== 'volt') {
      assert.ok(BALANCE.ships[ship.id].dashCooldown >= wisp.dashCooldown,
        ship.id + ' has no business dashing as often as the Volt does');
    }
  }

  const reaches = WEAPONS.map((weapon) => reachOf(BALANCE.weapons[weapon.id]));
  const shortest = reaches.reduce((a, b) => Math.min(a, b));
  assert.equal(reachOf(BALANCE.weapons[volt.weapon]), shortest,
    'and the arc is the shortest-reaching primary the game has: ' + reaches.join(', '));
});

test('the Brood arrives with a rank spent on a line that exists, and it is the only one that does', () => {
  for (const ship of SHIPS) {
    const ranks = BALANCE.ships[ship.id].ranks;
    for (const line of Object.keys(ranks)) {
      // A rank has to be a rank of a line the game sells, and one the line can actually
      // hold: `lineOf` throws for a line nothing sells, which is the loud answer a bad row
      // deserves, and the ceiling is the card's own (game/upgrades.js).
      assert.ok(lineOf(line) !== undefined, ship.id + ' starts with a line nobody sells: ' + line);
      assert.ok(BALANCE.upgrades[line].ranks >= ranks[line],
        ship.id + ' starts with more ' + line + ' than the line has');
      if (ship.id !== 'brood') assert.equal(0, ranks[line], ship.id + ' was meant to start with nothing');
    }
  }
  assert.equal(BALANCE.ships.brood.ranks.orbitals, 1, 'the Brood\'s drones are the rank of Orbitals PLAN 3.7 asks for');
});

test('choosing a ship chooses the primary it brings, in one move', () => {
  const field = scriptedRun(1);
  for (const ship of SHIPS) {
    setShip(field, ship.id);
    assert.equal(field.ship, ship.id);
    assert.equal(field.weapon, BALANCE.ships[ship.id].weapon,
      'the ' + ship.id + ' flies the ' + BALANCE.ships[ship.id].weapon + ' and nothing else');
    assert.equal(shipName(field), BALANCE.ships[ship.id].name, 'and it is called by the row\'s own name');
  }

  // The keys are one line long, and a key past the rack is no ship at all (game/hangar.js turns
  // this into a pick or a purchase, and refuses what it answers null for).
  assert.equal(shipAt(0), SHIPS[0].id);
  assert.equal(shipAt(SHIPS.length - 1), SHIPS[SHIPS.length - 1].id);
  assert.equal(shipAt(SHIPS.length), null, 'there is no key past the list');
  assert.throws(() => setShip(field, 'hangar'), /no ship is offered/);
  // `default` is a key in the table beside the ships, so being in the table is not the test.
  assert.throws(() => setShip(field, 'default'), /no ship is offered/);
  assert.throws(() => shipOf({ ship: 'wispz' }), /no ship is called/);
});

test('a run gets the body of the ship it flies, and nothing else', () => {
  for (const ship of SHIPS) {
    const row = BALANCE.ships[ship.id];
    const field = scriptedRun(3);
    setShip(field, ship.id);
    field.player.hull = 1;              // whatever the last run left behind
    field.player.maxSpeed = 999;
    field.player.dashWait = 7;
    applyShip(field);

    assert.equal(field.player.hull, row.hull, ship.id + ' starts whole');
    assert.equal(field.player.maxHull, row.maxHull);
    assert.equal(field.player.maxSpeed, row.maxSpeed);
    assert.equal(field.player.dashWait, row.dashCooldown);
    assert.equal(field.player.shape, row.shape);
    assert.equal(field.player.r, BALANCE.player.hitRadius,
      ship.id + ' is hurt by the same core every other ship is');
    for (const line of Object.keys(BALANCE.upgrades)) {
      const want = row.ranks[line] === undefined ? 0 : row.ranks[line];
      assert.equal(field.upgrades[line], want, ship.id + ' starts with ' + want + ' of ' + line);
    }
  }
});

test('the ship is applied after the ranks, so a ship that starts with one really does', () => {
  // `applyShip` grants a rank, and `resetRun` clears every rank - so the order inside
  // resetRun is a promise and not a detail (game/run.js).
  const field = scriptedRun(4);
  setShip(field, 'brood');
  assert.equal(field.upgrades.orbitals, 0, 'the scripted world has not started a run');
  field.upgrades.orbitals = 5;
  applyShip(field);
  assert.equal(field.upgrades.orbitals, 1, 'and the ship writes its own rank over whatever was there');
});

test("the pick is the visit's, the body is the run's", () => {
  // Same bargain game/weapons.js makes about the gun: the pick outlives a run, the numbers it
  // writes do not. A tool that measures one primary on a neutral body sets the gun after the
  // ship and is answered (tools/simulate.js, tools/power-ladder.js).
  const field = scriptedRun(5);
  setShip(field, 'needle');
  setWeapon(field, 'pulse');
  assert.equal(field.weapon, 'pulse', 'a gun asked for after the ship is the gun you get');

  field.player.hull = 0;
  applyShip(field);
  assert.equal(field.player.hull, BALANCE.ships.needle.hull, 'and the body comes back from the ship');
});

test('the body a ship writes is spelled out and never carries a hitbox', () => {
  const keys = Object.keys(shipBody('wisp')).sort();
  assert.deepEqual(keys, ['dashWait', 'hull', 'maxHull', 'maxSpeed', 'shape']);
});
