// Overcharge (PLAN 3.5): stand still and the gun keeps loading, and the next pull of the
// trigger is worth more than a pull is normally worth.
//
// This is the only card in the deck whose price is not a level. Every other line is paid for
// with a card and asks nothing of the ship; this one is paid for by *not moving* while the crowd
// is coming, which is the one thing a ship under pressure is trying to do. That is the trade and
// the whole design problem of it: the reward has to be big enough to be worth stopping for, and
// the wait has to be long enough that stopping is a decision and not a habit. `BALANCE.upgrades
// .overcharge` is where both of those numbers are argued about, and NOTES session 41 is where
// they were measured.
//
// Four decisions live here, and each of them has a test:
//
//   **Standing still is two questions.** Is the ship *asking* to move, and is it moving? The
//     first is the same reading the engines use (`steer` in game/player.js): no direction held.
//     Held against a wall the ship goes nowhere and is not standing still, because it is flying.
//     The second is a speed under `still`, which is above the hardest kick any gun gives the
//     ship - so a ship that is holding nothing and pulling the trigger counts as standing, which
//     is what a player believes they are doing, and nothing else in the game can shove the ship
//     at all. A dash is the loudest way not to stand still and is said so here.
//
//   **A charge that is interrupted bleeds and is not wiped.** Moving takes the charge off at
//     `bleed` a second - a full one is gone in half a second of running - rather than dropping it
//     the instant a key goes down. Wiping it is the trap version of the card: it punishes the
//     dodge and not the standing, and it makes the tell a flicker instead of a bar. Bleeding
//     means what the card asks for is that the ship *settles*, which is a thing a player who is
//     still dodging can do between two threats.
//
//   **A charge is spent by a pull, and by all of it.** "The next shot" is what the player heard;
//     what the sim has is a pull of the trigger, and on a scatter that is six pellets and on an
//     arc it is a whole chain. Doubling one pellet of six is not a doubling of anything anybody
//     could see, so the boost goes on everything the pull throws and the pull spends the charge
//     whether it threw one thing or eleven. A pull that threw nothing - the arc's own answer to
//     an empty sky, game/weapons.js - spends nothing, because a pull that costs the ship nothing
//     has not fired yet.
//
//   **One charge, and it is not banked.** The meter fills to a full and stops there: standing for
//     three seconds is one loaded gun and not three, which is the same reason the leech holds one
//     charge and not three (game/leech.js) - more than one is a store the run is carrying rather
//     than a thing it just earned, and the ring round the ship is one honest circle.
//
// The light and the sound are here too, because on this line they are not decoration: a ring
// closing round the hull is the only way a player can tell that the second is up without looking
// at a number, and the shout at the muzzle is the only way a loaded pull can be told from a plain
// one while it is in the air.

import { BALANCE } from './balance.js';
import { hypot } from '../core/math.js';
import { PALETTE } from '../core/palette.js';
import { burst, ring } from './effects.js';
import { cueBeep } from './cues.js';
import { pullBoostOf, rankOf } from './upgrades.js';

/** A charge is measured in shares of itself: 0 is cold, 1 is loaded. */
const FULL = 1;
/**
 * How close to full counts as full.
 *
 * A charge is a running sum of fixed steps, and 120 steps of a 1/120 s step do not add up to
 * exactly 1 - they stop a four-trillionth short of it. Nobody can tell that apart from full, and
 * a promise as testable as "a charge is worth `hold` seconds and one step less is not a charge"
 * cannot be asked of a sum that misses it by a four-trillionth. This is session 8's lesson about
 * the frame clock again: a run may not be able to notice what nobody can notice. So the slack is
 * asked for here, in the one question that needs it, and nowhere else.
 */
const FULL_SLACK = 0.000000001;

/** A fresh, cold gun. */
export function newOvercharge() {
  return { charge: 0 };
}

/** Put the gun back to cold. Called with the rest of the run's resetting. */
export function resetOvercharge(world) {
  world.overcharge.charge = 0;
}

/** Has this run taken the line at all. Nothing is painted and nothing is counted until it has. */
export function hasOvercharge(world) {
  return rankOf(world, 'overcharge') > 0;
}

/** How full the gun is, 0 to 1, which is what the ring round the hull is drawn from. */
export function chargeOf(world) {
  return world.overcharge.charge;
}

/** Is it loaded. The one place the four-trillionth is let off. */
export function isLoaded(world) {
  return chargeOf(world) >= FULL - FULL_SLACK;
}

/**
 * Is the ship standing still? Two questions, and both have to answer yes (see the header): it is
 * not asking to move - the same test `steer` uses, so the tell and the engines cannot disagree -
 * and it is not moving, or is moving slower than a gun's own kick.
 */
export function isStandingStill(world, input) {
  const spec = BALANCE.upgrades.overcharge;
  const ship = world.player;
  if (input.moveX !== 0 || input.moveY !== 0) return false;
  if (ship.dashLeft > 0) return false;
  return hypot(ship.vx, ship.vy) <= spec.still;
}

/**
 * One step of the gun: it loads while the ship stands and cools while it does not. Called from
 * `updatePlayer` after the ship has been moved and before the trigger is looked at, so a charge
 * that comes up this step is there for a pull this step.
 *
 * A run that has not taken the line pays one compare here and nothing else.
 */
export function updateOvercharge(world, dt, input) {
  if (!hasOvercharge(world)) return;
  const spec = BALANCE.upgrades.overcharge;
  const state = world.overcharge;
  const was = isLoaded(world);

  if (isStandingStill(world, input)) {
    state.charge = Math.min(FULL, state.charge + dt / spec.hold);
    if (!was && isLoaded(world)) announceLoaded(world);
  } else {
    state.charge = Math.max(0, state.charge - dt * spec.bleed);
  }
}

/**
 * What this pull of the trigger is worth: the line's whole boost when the gun is loaded, and 1
 * at any other time - which includes every time at all for a run that never took the card.
 */
export function chargedPullOf(world) {
  return isLoaded(world) ? pullBoostOf(world) : 1;
}

/**
 * The charge is spent: the gun goes cold and says so, at the nose it went out of. Called by
 * game/weapons.js only for a pull that actually threw something, and only when the boost was
 * worth spending, so nothing here has to ask whether it was earned.
 */
export function spendCharge(world, noseX, noseY) {
  const spec = BALANCE.upgrades.overcharge.spent;
  world.overcharge.charge = 0;
  ring(world, noseX, noseY, PALETTE.white, spec.ring.radius, spec.ring.speed, spec.ring.life);
  burst(world, noseX, noseY, PALETTE.bulletCore, spec.burst.count, spec.burst.speed, spec.burst.life);
  const sound = spec.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/** The moment the second is up: one ring and one note, the only time the line speaks unasked. */
function announceLoaded(world) {
  const spec = BALANCE.upgrades.overcharge.ready;
  const ship = world.player;
  ring(world, ship.x, ship.y, PALETTE.bulletCore, spec.ring.radius, spec.ring.speed, spec.ring.life);
  const sound = spec.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}
