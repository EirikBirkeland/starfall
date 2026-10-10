// The lance (PLAN 3.2's fourth primary): a line of light down the arena that costs a short
// wind-up and then hurts everything standing on it at once.
//
// This is the fifth thing the ship owns that hurts the crowd without being aimed at one body -
// the orbitals, the nova, the arc and the tether are the other four - and it is the only one of
// them that is a *gun*: it throws no projectile, it covers the whole arena, and it is slow. What
// makes it a weapon and not a nova with corners is that it costs a pull of the trigger to wind
// up, and the line it draws is the line the player chose.
//
// Four decisions live here, and each of them has a test:
//
//   **The wind-up is a window to aim in, not a tax for pulling.** The band tracks wherever the
//     nose points for the whole of `wind` and the beam fires along wherever the line ended up,
//     so the band you were shown is the band that hurt, edge for edge, and you have all of the
//     wind-up to walk it onto a column. That is the opposite of a sniper's lock (game/beams.js),
//     which is frozen the instant it starts - and the two readings are right for opposite
//     reasons. A sniper's telegraph is a promise about a *place*, so leaving the place is the
//     answer to it; a lance's is a promise about where *you* are pointing, so lining it up
//     better is the answer to it, and it is the whole skill of the gun.
//
//   **The beam is one instant and the light outlives it.** Exactly the discipline game/beams.js
//     and game/arc.js keep: a lance's beam is born having already paid out to every body on it,
//     and what is left in the pool is the record of the flash, fading. You cannot walk out of a
//     lance - there is nothing travelling to outrun - you can only not be on the line when it
//     happens. Which is also why the light is drawn at exactly `width` off the axis and never a
//     pixel more: the drawn line is the paid line.
//
//   **Everything on the line pays, and that *is* the gun.** A lance pierces by definition, so the
//     pierce line has nothing to do here and the ricochet line has nothing to turn a shot on -
//     the same reading that leaves them off the arc (game/arc.js), because both are the business
//     of a shot that travels and there is nothing here that travels. The bullet-speed line buys
//     nothing either, for the same reason. What the split line buys is another *line* - see
//     `shotsPerPull` in game/weapons.js, which is where every gun reads that line as its own kind
//     of "one more" - each extra worth that line's share and laid at another angle, so a rank
//     fans the beam across a lane instead of paying the same line twice. The damage line and the
//     fire rate line multiply it like any other gun.
//
//   **The pull is spent at the trigger and the shot is paid at the discharge.** What the beams
//     will cost, how many of them there will be and whether the gun was loaded when the trigger
//     moved are all settled the moment the trigger moves - the same contract a bullet signs, that
//     a card taken afterwards does not rewrite a shot already on its way (game/bullets.js). But
//     the kick, the flash, the noise and the spent charge all belong to the discharge, because
//     that is when the gun actually went off. So `windUp` answers *false* to game/weapons.js:
//     the pull threw nothing yet, and everything a pull normally costs is paid here, later.
//
// One wind-up is held at a time. A pull that arrives while the gun is still humming is spent on
// the beam that is already coming rather than starting a second one: with PLAN's rate and this
// wind-up the cycle is always the longer of the two, so it cannot happen in a real run, but the
// fire rate line is allowed to change a cycle and the answer may not be a beam nobody asked for.
//
// It never hurts the ship that fired it and it never reaches behind it: `back` is zero, which is
// the one structural difference between this and a sniper's beam, and the reason there is no
// `isInvulnerable` question here and no `source` to exclude.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { logic } from '../core/rng.js';
import { Pool } from '../core/pool.js';
import { STATE } from './state.js';
import { axisDistance, beamReach } from './beams.js';
import { damageEnemy } from './enemies.js';
import { ignite } from './burn.js';
import { chill } from './chill.js';
import { burst, hitStop, ring, shakeIt, spray } from './effects.js';
import { cueBeep } from './cues.js';
import { spendCharge } from './overcharge.js';

/**
 * The shape of one discharged beam: where its near end is (x, y), which way the axis runs
 * (dirX, dirY), how far it gets forwards before the arena ends (`fore`) and how far backwards
 * (`back`, always zero here: a lance fires forwards), how far off the axis a centre is still
 * hurt (`width`), how long the light has left (`life`, out of `max`), which of the pull's beams
 * it was (`rank`, which is what the renderer thins and dims the extras by), and whether the pull
 * that threw it was loaded (game/overcharge.js).
 *
 * The record is deliberately the same shape a sniper's beam is, minus the half of it that
 * belongs to a body with a hull: `axisDistance` and `beamReach` from game/beams.js are used
 * here unchanged, because "is this point on that line" is one question and a lance's line is a
 * line. What a lance's record keeps nothing of is the *damage*: a beam is born having already
 * paid out, so unlike game/beams.js there is no `paid` flag, no `weight` and no `spec` - the
 * light in the pool is a memory and nothing else.
 */
export function makeLanceBeam() {
  return {
    x: 0, y: 0, dirX: 0, dirY: 0, fore: 0, back: 0,
    width: 0, life: 0, max: 0, rank: 0, charged: false,
  };
}

/**
 * The whole state of the line: the wind-up (`wind` counts down from `windMax`, and 0 means the
 * gun is cold), what the beams coming out of it will be worth (`weight` apiece, `pull` of them,
 * `spreads` apart, `loaded` if the trigger was loaded when it moved), the light left behind, and
 * four counters of what the line was asked to do and what it got to do with it - the scorecard
 * every line in the deck keeps, because a beam's worth is a relation to a crowd and a crowd is
 * only visible from inside a run.
 */
export function newLance() {
  return {
    wind: 0,
    windMax: 0,
    weight: 0,
    pull: 0,
    spreads: [],
    loaded: false,
    beams: new Pool(makeLanceBeam),
    pulls: 0,
    fired: 0,
    caught: 0,
    dealt: 0,
  };
}

/** How far through the current wind-up the gun is: 0 has just begun, 1 is due to go off. */
export function windOf(world) {
  const line = world.lance;
  if (line.wind <= 0 || line.windMax <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - line.wind / line.windMax));
}

/** Is the gun holding a wind-up right now? (Which is the only time a band is drawn.) */
export function isWinding(world) {
  return world.lance.wind > 0;
}

/**
 * Begin a wind-up: the pull of the trigger that buys one discharge.
 *
 * `fan` is the pull's own fan of angles (game/weapons.js), which on this gun is not a set of
 * directions to fire down but a set of *offsets* to keep: the beams track the nose for the whole
 * wind-up, so what is remembered is how far apart they are and not where they point. The first
 * offset is always zero, which is why the aim is always one of the lines.
 *
 * `weight` is what the pull was worth the moment the trigger moved - the gun's own damage, times
 * whatever the damage line is worth, times the overcharge if the gun was loaded - and every beam
 * of the discharge carries it except the extras the split line added, which carry that line's
 * share, exactly as an extra pellet does (BALANCE.upgrades.split). `charged` says whether that
 * multiplier was the loaded gun's one (game/overcharge.js), which is the only way the light can be
 * painted hotter for it later (render/entities.js).
 *
 * Answers false, on purpose: nothing has left the ship yet, so game/weapons.js owes this pull no
 * kick, no flash, no sound and no spent charge, and game/lance.js pays all four when the beam
 * actually goes off.
 */
export function windUp(world, gun, fan, weight, charged) {
  const line = world.lance;
  const spec = gun.beam;

  // One wind-up at a time: a pull while the gun is humming is spent on the beam that is coming.
  if (line.wind > 0) return false;

  line.wind = spec.wind;
  line.windMax = spec.wind;
  line.weight = weight;
  line.pull = fan.length;
  line.loaded = charged;
  for (let i = 0; i < fan.length; i++) {
    line.spreads[i] = fan[i] - world.player.angle;
  }
  line.pulls++;

  // The whine of the thing coming up. The muzzle flash and the report belong to the discharge
  // (see below), so all the wind-up gets is the rising note: you hear a lance as much as you
  // see it, and the note *is* the clock on when it goes off.
  const sound = spec.charge;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
  return false;
}

/**
 * Leave one beam in the pool: the record of a flash that has already been paid out, from the
 * ship's own middle out to the wall the axis hits. `rank` is which of the pull's beams this was -
 * zero for the one that was aimed - and the extras are drawn thinner for what they cost.
 */
function leaveBeam(world, line, spec, angle, rank) {
  const ship = world.player;
  const beam = line.beams.spawn();
  beam.x = ship.x;
  beam.y = ship.y;
  beam.dirX = Math.cos(angle);
  beam.dirY = Math.sin(angle);
  const ends = beamReach(world, beam.x, beam.y, beam.dirX, beam.dirY);
  beam.fore = ends.fore;
  beam.back = 0;              // a lance fires forwards, and `axisDistance` honours that
  beam.width = spec.halfWidth;
  beam.life = spec.light.life;
  beam.max = spec.light.life;
  beam.rank = rank;
  beam.charged = line.loaded;
  return beam;
}

/**
 * Everything standing on one beam loses: the hull, a shove down the line away from the ship, and
 * sparks thrown along it, so a line of damage that crossed you is a line you will see.
 *
 * The crowd is picked out before anything is hurt, because hurting it can set off a bomber and
 * that happens inside this call (game/blast.js) and a body the beam finished is a body whose fire
 * goes sideways. Every one of them is the run's (`byPlayer` is true, as for an arc bolt) and every
 * one of them wears the ship's own frost and fire, because this is the ship's gun and a killing
 * beam is a hit like any other - which is what lets a lance, burn and chill in one build turn a
 * column into a chain of thermal shocks (game/shock.js).
 *
 * The ship is not asked. Its middle is the near end of the axis, and `axisDistance` counts
 * `along` from there, so the ship itself is off the line by construction.
 */
function payOut(world, line, spec, beam, weight) {
  const crowd = world.enemies;
  const crossed = [];
  for (let i = 0; i < crowd.length; i++) {
    const body = crowd[i];
    if (body.hp > 0 && axisDistance(beam, body.x, body.y) <= beam.width) crossed.push(body);
  }

  for (let i = 0; i < crossed.length; i++) {
    const body = crossed[i];
    // A beam that crossed one of these may have killed this one on the way out, and a body does
    // not die twice.
    if (body.hp <= 0) continue;
    body.ix += beam.dirX * spec.shove;
    body.iy += beam.dirY * spec.shove;
    spray(world, body.x, body.y, PALETTE.spark, spec.cut.count, spec.cut.speed, spec.cut.life,
      Math.atan2(beam.dirY, beam.dirX), spec.cut.spread);
    chill(world, body);
    damageEnemy(world, body, weight, true);
    ignite(world, body);
    line.caught++;
    line.dealt += weight;
  }
}

/**
 * Let the gun go: every beam of the pull, along wherever the nose is pointing now, and all the
 * feedback a heavy gun deserves - the kick it gives the ship back, the flash at the muzzle, the
 * shake, the small stop, the report.
 *
 * The beams are thrown one at a time and paid out immediately after being left in the pool, which
 * is safe for the same reason game/arc.js is safe: this runs inside the step, in stepRun's own
 * order, and a body that dies here is taken out of the crowd as it dies (game/enemies.js). The
 * fan is what makes it worth doing in one go - a split lance is a fan of lines and one of them
 * may find nothing at all, which is why the feedback is paid once for the pull and not once per
 * beam: the gun went off once.
 */
function discharge(world) {
  const line = world.lance;
  const gun = BALANCE.weapons.lance;
  const spec = gun.beam;
  const ship = world.player;
  const share = BALANCE.upgrades.split.share;

  const nose = ship.drawR + BALANCE.bullets.noseOffset;
  const nx = ship.x + Math.cos(ship.angle) * nose;
  const ny = ship.y + Math.sin(ship.angle) * nose;

  for (let i = 0; i < line.pull; i++) {
    const angle = ship.angle + line.spreads[i];
    const beam = leaveBeam(world, line, spec, angle, i);
    // The gun's own beam is a whole one of them and the split line's extras are a share each,
    // exactly as a fan of pellets is priced (game/weapons.js).
    payOut(world, line, spec, beam, i < gun.pellets ? line.weight : line.weight * share);
    line.fired++;
  }

  // The gun is handed back to the trigger with what it just did to the ship: one kick backwards,
  // the heaviest in the game, and a ship that fires a lance with a body behind it should expect
  // to be shoved at it. (The brake eats the kick in a fraction of a second - see NOTES session 8
  // on the recoil of every gun - so this is a lurch and not a teleport.)
  ship.vx -= Math.cos(ship.angle) * gun.recoil;
  ship.vy -= Math.sin(ship.angle) * gun.recoil;

  const flash = spec.flash;
  burst(world, nx, ny, PALETTE.spark, flash.count, flash.speed, flash.life);
  ring(world, nx, ny, PALETTE.bulletCore, flash.ring.radius, flash.ring.speed, flash.ring.life);
  shakeIt(world, spec.shake);
  hitStop(world, spec.hitStop);

  const sound = spec.sound;
  cueBeep(logic.range(sound.base, sound.base + sound.jitter), sound.dur, sound.wave,
    sound.vol, sound.slide);

  // And the charge this pull was carrying is spent here, at the muzzle it left from, rather than
  // at the trigger that asked for it (game/overcharge.js).
  if (line.loaded) spendCharge(world, nx, ny);

  line.loaded = false;
  line.weight = 0;
  line.pull = 0;
}

/**
 * One step of the lance: wind the gun down and let it go when it is due, then fade the light that
 * is left. Counted in the simulation and not in the renderer so the beam freezes with a hit-stop,
 * waits out a level-up, and dies with the run (the same arrangement as game/arc.js).
 *
 * Runs after the crowd has walked, so the line pays out where bodies ended up rather than where
 * the collision grid last saw them - the reason game/beams.js, game/orbitals.js and game/nova.js
 * are all where they are in stepRun.
 *
 * Answers whether the run is still on, the way `updateBeams` does: a beam can finish a bomber,
 * and a bomber's blast can end the ship (game/blast.js).
 */
export function updateLance(world, dt) {
  const line = world.lance;
  if (line.wind > 0) {
    line.wind -= dt;
    if (line.wind <= 0) {
      line.wind = 0;
      discharge(world);
    }
  }

  const beams = line.beams;
  for (let i = beams.count - 1; i >= 0; i--) {
    const beam = beams.items[i];
    beam.life -= dt;
    if (beam.life <= 0) beams.killAt(i);
  }
  return world.state === STATE.PLAY;
}

/** Put the lance back to nothing: a beam left over from the last run would shine on, and a
 * wind-up would go off for a ship that is not there any more. */
export function resetLance(world) {
  const line = world.lance;
  line.beams.clear();
  line.wind = 0;
  line.windMax = 0;
  line.weight = 0;
  line.pull = 0;
  line.loaded = false;
  line.pulls = 0;
  line.fired = 0;
  line.caught = 0;
  line.dealt = 0;
}
