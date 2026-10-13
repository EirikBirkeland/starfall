// Thermal shock (PLAN 3.5's first synergy): a body that is burned *and* frozen at once is a
// contradiction held together by nothing, and when it comes apart it takes the room with it.
//
// This is the seventh thing in the game that hurts the crowd on the run's behalf, and the only
// one of them that is not bought on its own. Burn and chill are two lines a run decides to take;
// this is what a run gets for taking both of them far enough, and it has no rank of its own to
// feed and no number that competes with theirs (game/upgrades.js deals the card, once, and only
// to a run that has already paid for the pair).
//
// Four decisions live here, and each of them has a test:
//
//   **One corpse, one ending.** A body that came apart alight already had an ending - it passes
//     its fire to the bodies next to it (game/burn.js `goOut`). A body that came apart cold
//     already had one - it throws ice and hull at everything in reach (game/chill.js
//     `shatterOnDeath`). A body that came apart *both*, with this synergy owned, gets a
//     detonation **instead of either of them**: it pays out hull, cold and fire together in one
//     blast, and its fire is spent in the blast rather than jumping on its own next step. That
//     is the rule this whole file exists to state, and the one six sessions of NOTES kept asking
//     for: without it a body wearing both pays two area payloads every death and the pair of
//     cards is not a synergy but a double payment. With it the synergy *fuses* the two endings
//     the run already owned - which is what a synergy is supposed to do to a build.
//
//   **The cold the corpse died with is how hard it goes.** `weight x frost`, exactly as a
//     shatter is priced (game/chill.js), for the reason chill learned and burn learned before it:
//     a run with a real gun kills a body with about the first shot that touches it, so a payload
//     that only fires on a body that survived being shot is a payload that switches itself off as
//     the gun grows. A drifter that died to one cold shot goes up small. A tank that was held
//     under fire and frozen solid goes up like a room on fire. Nothing here asks a body to have
//     lived.
//
//   **Both halves of the blast are shares, so the chain dies out.** What a caught body gains is
//     `cold x the corpse's frost` of frost and `fire x the corpse's frost` of burn, and its own
//     detonation - if it comes apart before either wears off - is scaled by its own frost in
//     turn. Every hop is a colder, dimmer, weaker copy of the one before it, which is the same
//     discipline a fire's jump and a shatter's front keep (game/burn.js, game/chill.js) and the
//     only thing that keeps a detonation from walking the arena off one drifter.
//
//   **It can never hurt the ship that owns it**, whatever is standing where the body was, and the
//     flash on the arena is born at exactly the reach the damage was paid out at - the same two
//     contracts every one of the run's own area effects signs (game/nova.js, game/mines.js,
//     game/tether.js).
//
// Nothing in this file spends a number out of the `logic` stream, so a run that detonates is
// exactly as reproducible from its seed as one that does not.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { dist2 } from '../core/math.js';
import { damageEnemy } from './enemies.js';
import { burst, ring, wreck } from './effects.js';
import { cueBeep } from './cues.js';
import { gainOf, hasSynergy } from './upgrades.js';
import { isAlight, passFlame, quenchFlame } from './burn.js';
import { freeze, frostOf, isFrozen, isChilled } from './chill.js';

/** The line this synergy is the payoff for, in the card's own words. */
const SYNERGY_ID = 'thermalShock';

/**
 * The blast's own weight: one shot of the ship's gun in the unit the whole game counts hull in
 * (BALANCE.bullets.damage), times the damage line, times the line's share of one, times **how
 * cold the corpse was**. Read where the body comes apart, so a rank of the damage line taken in
 * the middle of a chain is worth what it says on every blast still going.
 */
function blastWeight(world, spec, frost) {
  return BALANCE.bullets.damage * gainOf(world, 'damage') * spec.weight * frost;
}

/**
 * What a body that came apart both alight and cold does to the room around it, and the answer to
 * the question the two temperature cards never had to answer each other: on a body that wore
 * both, this happens and neither of theirs does.
 *
 * The bodies are picked out before any of them is hurt, the way game/blast.js and game/chill.js
 * do it: hurting one can bring another one down, and a death splices the crowd under whatever
 * loop is walking it. That also means a detonation can detonate - a body this one finishes off
 * has just been given frost and fire by it - which is the chain the card is really selling, and
 * why everything passed on is a share of what the corpse had.
 */
function detonate(world, corpse, byPlayer, spec) {
  const frost = frostOf(corpse);
  const weight = blastWeight(world, spec, frost);
  const reach2 = spec.radius * spec.radius;
  const caught = [];
  const crowd = world.enemies;
  for (let i = 0; i < crowd.length; i++) {
    const body = crowd[i];
    if (body.hp <= 0) continue;
    if (dist2(body.x, body.y, corpse.x, corpse.y) > reach2) continue;
    caught.push(body);
  }

  world.shock.blasts++;
  world.shock.caught += caught.length;

  // Both parents at once, and no third colour invented for it: a flash that is nearly white-hot -
  // the hottest thing in the palette, which is what two opposite temperatures arriving together
  // looks like - with embers off one parent and chips of ice off the other. The ring runs out by
  // the cold, so a body that died of one cold shot never claims as much room as one kept under
  // fire (game/chill.js `light` makes the same bargain about the same rule).
  const flash = spec.flash;
  ring(world, corpse.x, corpse.y, PALETTE.burnCore,
    flash.ring.radius, flash.ring.speed * frost, flash.ring.life);
  burst(world, corpse.x, corpse.y, PALETTE.burnFlame,
    Math.max(1, Math.round(flash.embers.count * frost)), flash.embers.speed, flash.embers.life);

  // The glass and the shriek belong to a body that actually wore the shell. At this card's own
  // gate almost every kill in a late run is both alight and cold, and a shriek of breaking ice on
  // every one of them would be a hiss - which is chill's argument for the same restraint, arrived
  // at again for the same reason (game/chill.js `shatter`).
  if (isFrozen(corpse)) {
    const broke = spec.broke;
    wreck(world, corpse.x, corpse.y, PALETTE.chillShell, broke.count, broke.speed, broke.life);
    const sound = broke.sound;
    cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
  }

  for (let i = 0; i < caught.length; i++) {
    const body = caught[i];
    // An earlier body in this list may have come apart already and taken this one with it -
    // possibly with a detonation of its own. Nothing is hurt twice and nothing is frosted twice.
    if (body.hp <= 0) continue;
    // Frost and fire first, then the hull: a body this blast finishes off has to come apart
    // wearing both, or the chain stops here for no reason the player can see.
    freeze(world, body, spec.cold * frost, BALANCE.upgrades.chill);
    passFlame(world, body, BALANCE.upgrades.burn.time * spec.fire * frost);
    world.shock.dealt += weight;
    damageEnemy(world, body, weight, byPlayer);
  }
}

/**
 * A body came apart. If it wore both fire and frost and the run owns the synergy, this is where
 * it goes up - and it goes up *instead of* shattering and *instead of* passing its fire, so one
 * death pays exactly one ending (the file header argues for that rule).
 *
 * Called by `killEnemy` (game/enemies.js) with the corpse still in hand, and answers whether it
 * claimed the death: a false here is the chill shatter being asked next, and a true is the fire
 * already having been quenched so game/burn.js never sees it.
 */
export function detonateOnDeath(world, enemy, byPlayer) {
  if (!hasSynergy(world, SYNERGY_ID)) return false;
  if (!isChilled(enemy)) return false;
  if (!isAlight(world, enemy)) return false;

  // The fire goes out *in* the blast and not after it: it is spent, it does not get to jump on its
  // own account a step later (game/burn.js). This is the one line in this file that reaches into
  // another system's state, and it is the price of the one-corpse-one-ending rule being true.
  quenchFlame(world, enemy);
  detonate(world, enemy, byPlayer, BALANCE.upgrades[SYNERGY_ID]);
  return true;
}

/** What the run's shock counters start at (game/world.js builds them, game/run.js resets them). */
export function newShock() {
  return {
    blasts: 0,    // how many bodies came apart this way
    caught: 0,    // how many bodies were standing in one when it did
    dealt: 0,     // how much hull the blasts took off them, in the game's own unit
  };
}

/** Put the counters back with the rest of the run's resetting (game/run.js). */
export function resetShock(world) {
  const line = world.shock;
  line.blasts = 0;
  line.caught = 0;
  line.dealt = 0;
}
