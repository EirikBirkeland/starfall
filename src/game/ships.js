// The ships: what the body you are flying actually is (PLAN 3.7).
//
// A ship is data (BALANCE.ships) and the two things a run does with it. `setShip` is the choice,
// and it hands over the primary that ship was designed around - which is why picking a ship is one
// key and not two, and why the two lists can never disagree about what you are flying. `applyShip`
// is the run's side of it: at the start of a run the ship's numbers are written onto the player,
// where the simulation reads them as it reads anything else, so nothing has to be kept in step with
// a pick afterwards.
//
// What this file deliberately does not ask is whether anybody *owns* the ship being picked. That
// is game/hangar.js's question, and the hangar is the player's only door to a pick: it refuses a
// body the purse has not bought. `setShip` is the door underneath that one - the one the headless
// tools walk through to measure any body they like without grinding for it - which is why it stays
// where it is instead of growing a price check of its own.
//
// The split between the two is deliberate and it is the same one game/weapons.js makes
// about the gun: a ship's *body* is run state, because a heal spent in the last run must
// not come back in this one; a ship's *gun* is the visit's choice, and a tool that measures
// one primary on a neutral body (tools/power-ladder.js) sets the gun after the ship and is
// answered. Nothing caches a ship's numbers into the player at any other time, so there is
// no half-applied ship standing in the middle of a run.
//
// Five ships at the time of writing, and the honest summary of what differs between them is
// in the table above `ships` in game/balance.js: hull, speed, the dash's wait, the gun, and
// the silhouette the frame draws. Not the hitbox - every ship is hurt by the same core.

import { BALANCE } from './balance.js';
import { lineOf } from './upgrades.js';

/**
 * The ships on offer, in the order the hangar's rack prints them and the number keys pick
 * them. `blurb` is a line for the player and nothing else; the name, every number the body
 * needs, and what the purse has to pay for it live on the ship's row in `BALANCE.ships`, which
 * is the only place any of them is written.
 *
 * The order is the primaries' order - the pulse's ship, the scatter's, the arc's, the
 * lance's, the swarm's - so the number a player presses still means the gun it has always
 * meant on this screen, and the key a new ship has to answer is the key its gun already had.
 */
export const SHIPS = [
  { id: 'wisp', blurb: 'three hull, quick, and no tricks' },
  { id: 'bulwark', blurb: 'four hull, slow, and it hits up close' },
  { id: 'volt', blurb: 'three hull, and the dash comes back fast' },
  { id: 'needle', blurb: 'two hull, very fast, one long line of fire' },
  { id: 'brood', blurb: 'three hull, and it starts with a pair of drones' },
];

/** The ship id a run that has not picked one flies. */
export function defaultShip() {
  return BALANCE.ships.default;
}

/** The row of the ship this world is flying. */
export function shipOf(world) {
  return shipRow(world.ship);
}

/** The row for a ship id, and a loud answer if there is not one. */
export function shipRow(id) {
  const row = BALANCE.ships[id];
  if (row === undefined) throw new Error('no ship is called ' + id);
  return row;
}

/** The name to print for the ship this world is flying. */
export function shipName(world) {
  return shipOf(world).name;
}

/** Is `id` one of the ships on offer? */
function isOffered(id) {
  for (let i = 0; i < SHIPS.length; i++) {
    if (SHIPS[i].id === id) return true;
  }
  return false;
}

/**
 * Choose the ship for the runs this world plays, and take its primary with it: a ship is
 * the body and the gun together, which is the only way five of each stay five combinations
 * worth balancing instead of twenty-five.
 *
 * Like the gun it is a choice made between runs - in the hangar, or with the same number key on
 * the title or over a wreck - and it is honest mid-run too: nothing is cached into the ship
 * between one frame and the next, so what changes is the *next* run's body (see `applyShip`) and
 * the gun from the next pull. An id that is not one of the ships offered is a bug and says so;
 * `BALANCE.ships` holds a meta key beside the ships, so being in that table is not the test.
 *
 * Whether anybody *owns* the ship is not asked here, on purpose: game/hangar.js `pickShip` is the
 * door that asks it, and everything the player presses goes through that.
 */
export function setShip(world, id) {
  if (!isOffered(id)) throw new Error('no ship is offered called ' + id);
  world.ship = id;
  world.weapon = shipRow(id).weapon;
  return id;
}

/** The pick by position on the hangar's rack: 0 is the first one offered, or null past the list. */
export function shipAt(index) {
  const row = SHIPS[index];
  return row === undefined ? null : row.id;
}

/**
 * The live numbers a ship writes onto the player - its body, as the simulation holds it.
 * Spelled out field by field rather than copied wholesale because the player carries plenty
 * that a ship has nothing to say about (its velocity, its level, what the last dash was
 * doing), and because `r`, the hit radius, is deliberately not here: it is the same core for
 * every ship (game/balance.js, `ships`).
 */
export function shipBody(id) {
  const row = shipRow(id);
  return {
    hull: row.hull,
    maxHull: row.maxHull,
    maxSpeed: row.maxSpeed,
    // What the dash's wait is, so the wait the frame counts down its ring with is the same
    // number the simulation went to sleep for (render/entities.js).
    dashWait: row.dashCooldown,
    shape: row.shape,
  };
}

/**
 * Put the ship this world flies onto the player, at the start of a run: its hull, its
 * engines, its dash's wait, its silhouette, and any upgrade rank it arrived with.
 *
 * It has to be called after the ranks are cleared (game/run.js), because the second half of
 * what it does is hand out the ship's own starting ranks - which is the Brood's reason for
 * existing and nothing else's, and is written as data rather than as a special case so that
 * the next ship that wants one is a row and not a branch.
 */
export function applyShip(world) {
  const row = shipOf(world);
  Object.assign(world.player, shipBody(world.ship));
  for (const line of Object.keys(row.ranks)) {
    // Through the line's own door, so a row that names a line nobody sells says so out loud
    // instead of quietly adding a rank nothing will ever read (game/upgrades.js).
    lineOf(line);
    world.upgrades[line] = row.ranks[line];
  }
}
