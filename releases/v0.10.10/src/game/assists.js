// The two switches that answer for the hand (PLAN section 6).
//
// AUTO-FIRE holds the trigger down and AUTO-AIM points the gun at a body, which is the whole of what
// PLAN asks for when it says the game is to be playable "with one hand or keyboard only": with both
// of them on, WASD is a whole set of controls.
//
// These are the opposite kind of thing from game/settings.js and it is worth being plain about it.
// The four rows there are the game's *report* about a run and may not change one - that is the promise
// `test/settings.test.mjs` plays a seed twice to pay for. These two are the *hand*: they are written
// into the same controls the hand writes into, and the whole of what they are for is to change what
// happens in a run.
// They sit on the same panel because it is the one screen that asks a player what they would like, and
// they are stored the same way a setting is stored, but they are not under that promise and nothing
// that reads them should pretend otherwise.
//
// What they ship at is off, which is the game as it was built and balanced: a switch has two places and
// off is the one that asks for nothing. Neither of them draws a number, spends the run's luck or costs
// a step of anything, so with both of them off a run is the same run it always was - the reference run
// traces the same bytes with this file in the tree as without it.
//
// Where they are applied: game/world.js `stepRun` asks `driveAssists` for the step's controls, just
// before the ship is moved. Not in the frame loop, because a frame can hold no steps at all or three
// of them and the aim would then be chosen a different number of times on different displays; a step
// is the game's real clock and one step, one aim.

import { section, remember } from '../core/save.js';
import { dist2 } from '../core/math.js';

// How much further than the nearest body the one being aimed at may be before the gun lets it go. One
// is "always the nearest body", which is what the plainest reading of PLAN says and which turned out to
// twitch: two bodies circling in from the same side trade the lead every few steps, and a nose that
// snaps between them every few steps sprays shots between both of them and kills neither. So a body up
// to forty per cent further out than the nearest one is kept, which is enough to ride out that trade;
// past it the body being held is a different fight and the gun lets it go.
const KEEP_SLACK = 1.4;

/**
 * The two switches: what the save calls one, what the panel calls it, the one plain line on what it
 * does, and where it ships. Both of them are on or off and there is nothing in between, so there is no
 * table of steps to walk - and both of them ship off, because there is no switch in the game that has
 * a reason to be on before anybody has asked for it. `default` is said per switch rather than once for
 * both so that a row added later has to say its own place, the same way every row in
 * game/settings.js carries its own.
 */
export const ROWS = [
  { id: 'fire', name: 'AUTO-FIRE', says: 'THE TRIGGER IS ALREADY HELD', default: false },
  { id: 'aim', name: 'AUTO-AIM', says: 'THE GUN FINDS THE NEAREST BODY IT CAN HURT', default: false },
];

const WORDS = { on: 'ON', off: 'OFF' };

// The switches as this visit has them: row id -> whether it is on. Written by `loadFromSave` and by
// `stepRow`, and read by everything else through `on` and the two getters at the bottom.
const switches = {};

/** The switch a setting id names, or null when nobody has heard of it. */
function rowOf(id) {
  for (const row of ROWS) {
    if (row.id === id) return row;
  }
  return null;
}

/** Whether one switch is on, which is the only question a switch can be asked. */
function on(id) {
  if (rowOf(id) === null) throw new Error('the game has no assist called ' + id);
  return switches[id] === undefined ? false : switches[id] === true;
}

/** Where every switch stands, in the save document's own field names: read, or written straight back. */
function stateAsStored() {
  const out = {};
  for (const row of ROWS) out[row.id] = on(row.id);
  return out;
}

/**
 * Put the switches where the last visit left them (core/save.js, the `assists` section).
 *
 * Boot calls this once, before the first frame, and answers what it landed on so `stats()` and a test
 * can see it. The shipped answer is off and every row is written, so a save that has nothing to say -
 * or says something that is not a yes or a no, which the store drops on the way in - is a visit that
 * never asked, and the switch ships at off. That is deliberate: the default is each row's own and not
 * wherever the switch happens to be standing, so reading the save is a fresh answer and not a nudge.
 */
export function loadFromSave() {
  const defaults = {};
  for (const row of ROWS) defaults[row.id] = row.default;
  const stored = section('assists', defaults);
  for (const row of ROWS) {
    switches[row.id] = typeof stored[row.id] === 'boolean' ? stored[row.id] : row.default;
  }
  return stateAsStored();
}

/**
 * Move one switch one place, and answer the place it landed on - or null when it was already there.
 *
 * Like the picture rows and the two sliders there is no wrapping: a switch that came back round would
 * hand the trigger back to the game under a hand that was reaching for it. Right turns a switch on and
 * left turns it off, which is the direction the words point in - and zero is not a direction, which is
 * the one answer a two-place row has to give the same way a five-place one does.
 */
export function stepRow(id, delta) {
  if (rowOf(id) === null) throw new Error('the game has no assist called ' + id);
  const where = Math.sign(delta);
  if (where === 0) return null;
  const now = on(id);
  const next = where > 0;
  if (next === now) return null;
  switches[id] = next;
  remember('assists', stateAsStored());
  return { id: next ? 'on' : 'off', words: WORDS[next ? 'on' : 'off'] };
}

/** What one switch is set to, in the words the panel prints. */
export function wordsOf(id) {
  return WORDS[on(id) ? 'on' : 'off'];
}

/** Which place one switch is standing at, which is what `stats()` reports. */
export function stepIdOf(id) {
  return on(id) ? 'on' : 'off';
}

// --- what the simulation reads ---------------------------------------------------
// Two small getters rather than the raw switches, for the reason game/settings.js gives: whatever
// reads one of these wants the one number of its own thing and nothing else.

/** Is the trigger being held? Read by `driveAssists` below, at game/world.js's asking. */
export function autoFireOn() {
  return on('fire');
}

/** Is the gun being pointed? Read by `driveAssists` below, at game/world.js's asking. */
export function autoAimOn() {
  return on('aim');
}

/**
 * Can this body be pointed at at all?
 *
 * Something already dead is not worth a shot and something in the middle of a phase change cannot be
 * hurt by one (game/enemies.js `damageEnemy` refuses it), so a gun held on either is a gun that is
 * throwing shots away. A run with nothing but a phasing boss in front of it has nothing to aim at and
 * says so by leaving the aim where the hand left it, which is honest: the switch is not going to make
 * a target out of empty sky.
 */
function targetable(body) {
  return body.hp > 0 && body.immune <= 0;
}

/**
 * Take aim: which body the gun is being held on, or null when there is nothing to hold it on.
 *
 * The nearest body the gun can hurt, with a slack (KEEP_SLACK) on changing its mind. The body it is
 * held on is kept on `world.aimLock`, which is derived state like the grid and the packs: a body that
 * dies leaves the crowd and the lock goes with it, and a new run starts with no lock at all.
 *
 * It walks the crowd instead of asking the collision grid because it cannot ask the grid: the grid is
 * rebuilt inside the step (game/enemies.js `rebuildEnemyGrid`) and the aim is taken before the ship is
 * moved, so an answer out of it would be a step stale at best and a body that has left the crowd at
 * worst. One walk of a few hundred bodies at the most, once a step, and only while the switch is on.
 */
export function takeAim(world) {
  const ship = world.player;

  let nearest = null;
  let nearestBy = Infinity;
  for (let i = 0; i < world.enemies.length; i++) {
    const body = world.enemies[i];
    if (!targetable(body)) continue;
    const by = dist2(ship.x, ship.y, body.x, body.y);
    if (by < nearestBy) {
      nearestBy = by;
      nearest = body;
    }
  }
  if (nearest === null) {
    world.aimLock = null;
    return null;
  }

  const held = world.aimLock;
  if (held !== null && targetable(held)) {
    const keptBy = dist2(ship.x, ship.y, held.x, held.y);
    // The comparison is in squared distances, so the slack is squared with them.
    if (keptBy <= nearestBy * KEEP_SLACK * KEEP_SLACK) return held;
  }
  world.aimLock = nearest;
  return nearest;
}

/**
 * Answer this step's controls for the hand, in the same descriptor the hand wrote into.
 *
 * Written into the caller's descriptor on purpose: every system downstream sees one set of controls
 * and cannot tell which hand moved them, which is the only way an auto-fired shot and a shot the
 * player fired are the same shot. With both switches off it does nothing at all - it neither reads the
 * crowd nor writes a field - which is the whole of why a run that has never heard of these switches
 * plays exactly as it always did.
 *
 * The aim is left alone when there is nothing to aim at, so the ship keeps the pointing the hand left
 * it rather than swinging round to face an empty corner of the arena.
 */
export function driveAssists(world, input) {
  if (autoAimOn()) {
    const target = takeAim(world);
    if (target !== null) {
      input.aimX = target.x;
      input.aimY = target.y;
    }
  } else if (world.aimLock !== null) {
    // A lock from a switch that has just been turned off is not a lock any more, and it should not be
    // waiting there for the next time the switch comes on.
    world.aimLock = null;
  }
  if (autoFireOn()) input.firing = true;
}
