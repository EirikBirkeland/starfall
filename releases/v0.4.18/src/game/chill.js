// Chill (PLAN 3.5): a hit takes the speed out of them, and what cannot reach you is not a
// threat on its way.
//
// This is the sixth thing in the game that the ship's gun does to the crowd - the orbitals,
// the nova, the arc, the beams and the fire have four of the six - and the only one of them
// that *takes something away* instead of adding damage. Nothing here is fired and nothing is
// thrown: a body that is being shot slows down, and if it is being shot enough it stops, and
// PLAN's fifth rank is what a body that stops is worth.
//
// Five decisions live here, and each of them has a test:
//
//   **The frost is a field on the body, not a thing in the world.** `game/burn.js` keeps its
//     fires in the world because a fire has to outlive the body it is eating by the one step
//     in which it spreads; frost has no such errand. Its whole life is the body's own walk,
//     and the one thing it does after the body comes apart is paid out at the death, while
//     the corpse is still in hand (game/enemies.js `killEnemy`). So there is no list of
//     chilled bodies to keep in step, nothing to empty between runs, and what the walk pays
//     for the line is one multiply in game/kinds.js `glide`.
//
//   **A hit buys frost, and the frost *is* the slow.** One number, no second meter under it:
//     every hit takes `step x rank` of the body's own walk away, up to a whole of it. PLAN's
//     "hits slow by 8% per rank" is exactly the first hit, and every hit after it is worth
//     just as much until there is no walk left to take. That is also why the line is a
//     `rate` and not a share (game/upgrades.js): rank 0 has to mean *nothing is cold*, which
//     a multiplier cannot say.
//
//   **A shove is not a walk, but a turn is.** The frost takes its share off the pace a kind
//     walks at and the rate it turns at, and none of the impulse on it, so a bullet's kick, a
//     dash's shoulder, a nova front and a neighbour making room all still move a frozen body.
//     That is what keeps a knot of frozen bodies a thing you can push clear instead of a wall
//     you have to fly around - and it goes with the rest of it: frozen is not harmless. A
//     frozen body still hurts on contact, a frozen spitter still spits, and a sniper already
//     holding a lock still fires it on the second it promised. The card buys time to aim and
//     room to fly, not immunity.
//
//   **It melts.** A body that stops being shot warms back through in `melt` seconds, so the
//     line is something a player keeps up with fire rather than a tax the arena pays once and
//     for all. It is also what keeps the fifth rank an achievement: freezing the crowd is
//     what happens while you are standing in somebody's face, not a state everything settles
//     into.
//
//   **The shatter is what a cold body is worth, and it is worth the cold it had.** PLAN's
//     "frozen enemies shatter for area damage at rank 5" - from the fifth rank, and out of a
//     body that was made cold. It cannot be gated on *frozen solid*, and the measurement that
//     said so is in NOTES: a run with a strong gun kills a body in about one hit, so a body
//     that needs three of them to freeze has about a hundredth of a chance of ever getting
//     them - one body froze solid in a five minute run. So the frost a body dies with is the
//     size of its shatter: `weight x frost` of a shot of hull, and `share x frost` of cold
//     thrown to whatever it catches. That keeps PLAN's sentence true at the top - a body
//     frozen solid goes off at full weight, and only a body that was kept under fire gets
//     frozen solid - while still paying the rank on the hundred drifters a late run comes
//     apart per minute. It is the lesson Burn learned in session 38, arriving again: the hit
//     that kills is a hit, and a card that only works on bodies that survived being shot is a
//     card that stops working as the gun grows.
//
// The shatter is the only damage in here, and it is one shot of the ship's own gun times the
// line's share - the same pricing as a drone bite, a nova front and a fire's bite, for the
// same reason (session 31's measured mistake: an additive line with a flat number loses the
// race to a multiply as soon as the gun is twice what it was). It hurts the crowd and never
// the ship, whatever radius it reaches: this is the run's own work coming apart, and a card
// that took hull off you for killing things well would be a trap and not a reward
// (`game/nova.js` makes the same argument for the ring it throws).
//
// Nothing in this file spends a number out of the `logic` stream, so a run with a chilled
// crowd is exactly as reproducible from its seed as one without.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { dist2 } from '../core/math.js';
import { damageEnemy } from './enemies.js';
import { burst, ring, wreck } from './effects.js';
import { cueBeep } from './cues.js';
import { chillOf, gainOf, rankOf } from './upgrades.js';

/** How frost is counted here: a whole of it is a body that cannot walk. */
const WHOLE = 1;

/**
 * How much frost makes a body *frozen*: solid enough that the tenth of a pace left to it is
 * standing still as far as the arena is concerned - a drifter at a tenth of its pace crawls
 * 7 px/s, less than the crowd moves when it is merely jostling.
 *
 * It is not exactly a whole frost, and the reason is the melt. A frost wears away continuously,
 * so "exactly a whole" is one step wide and a shell drawn at that line would flicker once and
 * vanish. At this number a body frozen solid at the fifth rank wears the shell for the first
 * tenth of its thaw - and for as long as the fire keeps it there, which is the case that
 * matters: the shell says "this one is locked down, and it will shatter when it comes apart".
 */
const SOLID = 0.9;

/** The line this file is the other half of. */
const CHILL_LINE = 'chill';

/** Is this body cold at all - i.e. is anything being taken off its walk. */
export function isChilled(enemy) {
  return enemy.frost > 0;
}

/** Is it frozen solid: no walk left to speak of. `SOLID` says why that is not a whole frost. */
export function isFrozen(enemy) {
  return enemy.frost >= SOLID;
}

/** How much of a body's own walk has been taken off it, 0..1 (render/entities.js draws it). */
export function frostOf(enemy) {
  return enemy.frost;
}

/**
 * What one shatter costs a body standing in it: one shot of the ship's gun in the unit the
 * whole game counts hull in (BALANCE.bullets.damage), times the line's share of one, times
 * how cold the body that came apart was. Read where the ice comes apart, so a rank of the
 * damage line taken while a shatter is being paid out is worth what it says it is on every
 * body the shatter reaches.
 */
function shatterWeight(world, spec, frost) {
  return BALANCE.bullets.damage * gainOf(world, 'damage') * spec.weight * frost;
}

/** PLAN's "at rank 5", as numbers - or null while the line has not been taken that far. */
function shatterAt(world, spec) {
  return rankOf(world, CHILL_LINE) >= spec.shatter.at ? spec.shatter : null;
}

/**
 * Add frost to one body, and say what happened: nothing, a colder body, a body that has just
 * frozen solid. It is the one door frost comes in by - a hit landing, or a shatter throwing
 * ice - so the light and the sound of a body going solid cannot be missed by one of them and
 * doubled by the other.
 *
 * A body already frozen is not deepened: there is nothing left to take off its walk, and a
 * hit that buys nothing should not pay for the tell of one.
 */
function freeze(world, enemy, amount, spec) {
  const was = enemy.frost;
  if (was >= WHOLE) return;
  const frost = Math.min(WHOLE, was + amount);
  enemy.frost = frost;

  const dust = spec.dust;
  burst(world, enemy.x, enemy.y, PALETTE.chillFrost, dust.count, dust.speed, dust.life);
  // The shell is told once, at the crossing: a body already frozen cannot be frozen harder, and
  // every hit after it would otherwise pay for the same announcement again.
  if (frost < SOLID || was >= SOLID) return;

  // The moment it stops. A ring born at the shell the renderer is about to draw, and the one
  // sound the line makes on its own - the bite of every earlier hit was silent, so the whole
  // build up to this is quiet and this is not.
  const solid = spec.freeze;
  ring(world, enemy.x, enemy.y, PALETTE.chillShell, solid.ring.radius, solid.ring.speed, solid.ring.life);
  burst(world, enemy.x, enemy.y, PALETTE.chillShell, solid.burst.count, solid.burst.speed, solid.burst.life);
  const sound = solid.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * One hit landed on this body - including the one that killed it, which is why every door
 * calls this *before* it takes the hull away. Called by everything that hurts the crowd on
 * the run's behalf: game/bullets.js, game/arc.js, game/orbitals.js, game/nova.js. Exactly
 * like a fire being lit, and for the same reason: a blast is somebody else's death and does
 * not chill anything, and a fire is a state a body is in rather than a hit that landed.
 *
 * A run that has not taken the line pays one compare here and nothing else.
 */
export function chill(world, enemy) {
  const per = chillOf(world);
  if (per <= 0) return;
  freeze(world, enemy, per, BALANCE.upgrades.chill);
}

/**
 * A body's own frost warming through, one step of it. Tucked into the crowd's step beside
 * `flash` (game/enemies.js) rather than in a system of its own because it is the body's own
 * fading state, and the crowd is walked once a step anyway.
 *
 * Letting go of a whole frost is the one melt the frame says out loud: a body that stops
 * being shot is a body the ship has stopped worrying about, and the dust coming off it is
 * the last thing the card did to it.
 */
export function melt(world, enemy, dt) {
  const spec = BALANCE.upgrades.chill;
  const was = enemy.frost;
  const left = was - dt / spec.melt;
  if (left > 0) {
    enemy.frost = left;
    return;
  }

  enemy.frost = 0;
  if (was < SOLID) return;
  const thaw = spec.thaw;
  burst(world, enemy.x, enemy.y, PALETTE.chillFrost, thaw.count, thaw.speed, thaw.life);
}

/**
 * What the ice of a body that came apart cold does to the room around it: a front of cold at
 * the shatter's reach, everything inside it losing hull and gaining frost, and the corpse
 * thrown apart in chips of it.
 *
 * The bodies are picked out before any of them is hurt, the way `game/blast.js` does it:
 * hurting one can bring another one down, and a death splices the crowd under whatever loop
 * is walking it. That also means a shatter can shatter - a body this one finishes off has
 * just been frosted by it, and it comes apart here and now - which is the chain the fifth
 * rank is really buying, and why everything that is passed on is a share: each hop is colder
 * by `share` and its next shatter is weaker by the same, so a chain runs down a crowd and
 * dies out instead of walking the arena off one drifter.
 *
 * The ship is not in it, whatever is standing where the body was.
 */
function shatter(world, corpse, byPlayer, spec) {
  const frost = frostOf(corpse);
  const weight = shatterWeight(world, spec, frost);
  const reach2 = spec.radius * spec.radius;
  const caught = [];
  const crowd = world.enemies;
  for (let i = 0; i < crowd.length; i++) {
    const body = crowd[i];
    if (body.hp <= 0) continue;
    if (dist2(body.x, body.y, corpse.x, corpse.y) > reach2) continue;
    caught.push(body);
  }

  const light = spec.light;
  // The ring is sized by what it is claiming. A body that died of one cold shot flickers; a
  // body frozen solid runs the light out to the whole reach it hurt, which is the one thing a
  // light that follows damage may do - it must not claim less of it than was paid out, and it
  // must not claim more either (game/burn.js draws its jump the same way for the same reason).
  ring(world, corpse.x, corpse.y, PALETTE.chillShell,
    light.ring.radius, light.ring.speed * frost, light.ring.life);
  // The chips and the glass are for a body that was actually frozen. Nearly every kill in a
  // late run is a cold one - the killing hit is itself a frost - and a shriek of breaking ice
  // on each of them would be a hiss, so the sound and the shards belong to the shell: the rare
  // body that was kept under fire, and the moment the fifth rank was bought for.
  if (isFrozen(corpse)) {
    wreck(world, corpse.x, corpse.y, PALETTE.chillShell, light.chips.count, light.chips.speed, light.chips.life);
    const sound = spec.sound;
    cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
  }

  for (let i = 0; i < caught.length; i++) {
    const body = caught[i];
    // An earlier body in this list may have come apart already and taken this one with it -
    // possibly with a shatter of its own. Nothing is hurt twice and nothing is frosted twice.
    if (body.hp <= 0) continue;
    freeze(world, body, spec.share * frost, BALANCE.upgrades.chill);
    damageEnemy(world, body, weight, byPlayer);
  }
}

/**
 * A body came apart with cold in it. Called by `killEnemy` (game/enemies.js) with the corpse
 * still in its hand - the only reason the frost is allowed to live on the body and not in the
 * world, and the reason the four doors chill a body *before* they take its hull away: the hit
 * that kills is the hit that gets to be the cold it dies with.
 *
 * How cold it was is how hard it goes, which is what makes a body that was kept under fire - a
 * tank, an elite, a shielder at the back of a wave - worth freezing while a drifter that died
 * to one shot still throws something on the way out. The tell is readable before the death,
 * which is the one thing the frame has to get right about this: rime for a little cold, the
 * shell for a whole lot (render/entities.js).
 */
export function shatterOnDeath(world, enemy, byPlayer) {
  if (!isChilled(enemy)) return;
  const spec = BALANCE.upgrades.chill;
  const gate = shatterAt(world, spec);
  if (gate === null) return;
  shatter(world, enemy, byPlayer, gate);
}
