// Burn (PLAN 3.5): a hit sets the crowd alight, and the fire keeps working after the
// shot has gone.
//
// This is the fifth thing in the game that hurts the crowd - the ship's gun, its orbitals,
// its nova, its arc, and now its fire - and the only one of them that is a *state a body is
// in* rather than an event that happens to it. That is what makes it its own system: nothing
// here is fired, thrown or clipped. A fire is lit, it eats the body it was lit on for as long
// as it lasts, and it goes out sideways.
//
// Four decisions live here, and each of them has a test:
//
//   **A fire is a thing in the world, not a number on the body.** `world.fires` holds one
//     fire per body that is alight, and a fire holds a reference to the body it is eating -
//     the same arrangement the swarm's packs have (game/flock.js). Two reasons, and the
//     second is the one that decided it: a body that dies leaves the crowd, and PLAN's third
//     rank is "burning enemies spread it on death", which is a thing a corpse can still do.
//     Anything wearing a field on the enemy would have lost the fire with the body; this way
//     the fire outlives it by one step, which is exactly the moment the fire needs. It also
//     means the pass costs what is burning rather than what is walking.
//
//   **One fire per body, and a hit buys it time rather than another fire.** So the line's
//     rank is the only thing that decides how hard the fire bites, and taking a rank in the
//     middle of a burning crowd is felt by the next bite of every fire already going. What a
//     rank never buys is a second fire on the same body, which would make this line a race
//     to see how fast you can click rather than a share of your gun.
//
//   **A bite is a share of one shot of the ship's own gun**, like a drone bite and a nova
//     front (game/orbitals.js, game/nova.js), spent in chunks on a beat instead of spread
//     thin over every step. Being a share is what keeps the fire worth taking on a heavy gun:
//     an additive line with a flat number loses to a multiply as soon as the gun is twice
//     what it was, which is session 31's measured mistake. Being chunky is what lets a body
//     flash when the fire takes hold, and lets a run see how badly it is burning.
//
//   **The fire only ever comes from the ship.** Every system that hurts the crowd on the
//     run's behalf calls `ignite` when it lands - bullets, bolts, drones, fronts - and
//     nothing else catches, so a body that burns down is the run's kill all the way down the
//     chain and no fire in this file ever has to be asked who lit it. A blast is the
//     exception on purpose: that is somebody else's death, not the ship's hit.
//
// The damage of a fire is paid where the crowd has finished walking (game/world.js), and the
// spread spends no randomness at all, so a run that is on fire is as reproducible from its
// seed as one that is not.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { STATE } from './state.js';
import { dist2 } from '../core/math.js';
import { damageEnemy } from './enemies.js';
import { burst, ring, spray } from './effects.js';
import { cueBeep } from './cues.js';
import { flameOf, gainOf, rankOf } from './upgrades.js';

/** Which way fire goes in this game. */
const UP = -Math.PI / 2;

/**
 * The shape of one fire: the body it is eating, how much of the fire is left (`left`, in
 * seconds), and how long until the next bite (`due`). It keeps no position of its own -
 * a fire is wherever its body is, and the renderer paints it at the body's interpolated
 * place for the same reason (render/interp.js).
 *
 * `target` may be a body that has already come apart: the step a fire finds one of those is
 * the step it goes out sideways, so a fire always outlives its body by the one step it needs.
 */
export function makeFire() {
  return { target: null, left: 0, due: 0, quenched: false };
}

/**
 * The fire on this body, or null. The pool is one fire per body that is alight, which is
 * dozens at the worst of a run, so a hit landing costs a short walk and nothing else - and
 * this is the only place a fire is looked up, which is why the body holds no reference back.
 */
function fireOn(world, enemy) {
  const fires = world.fires;
  for (let i = 0; i < fires.count; i++) {
    if (fires.items[i].target === enemy) return fires.items[i];
  }
  return null;
}

/**
 * Set one body alight for `time` seconds, or feed the fire it already has if that one is
 * going to last longer than this. Spawns nothing new in the second case, and is the only way
 * a fire ever begins, so both doors - a hit that lands, and a corpse that jumps the fire -
 * go through the same rules and the same light.
 */
function feed(world, enemy, spec, time) {
  const already = fireOn(world, enemy);
  if (already !== null) {
    if (already.left < time) already.left = time;
    return already;
  }

  const fire = world.fires.spawn();
  fire.target = enemy;
  fire.left = time;
  fire.quenched = false;
  // It takes a moment to get going. A fire that bit the instant it was lit would be worth a
  // whole bite more than the line says it is, and a body caught in a chain never burns long
  // enough to pay one out at all.
  fire.due = spec.bite;

  // The light belongs to a body that is standing there. A fire lit on one that is coming
  // apart exists only to be passed on (see `ignite`), and throwing embers and beeping for a
  // fire nobody can see would be the frame claiming damage it is not doing.
  if (enemy.hp > 0) {
    const lit = spec.ignite;
    spray(world, enemy.x, enemy.y, PALETTE.burnFlame, lit.count, lit.speed, lit.life, UP, lit.spread);
    const sound = spec.sound;
    cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
  }
  return fire;
}

/**
 * What one bite costs the body it is eating: one shot of the ship's gun in the unit the
 * whole game counts hull in (BALANCE.bullets.damage, and session 33 on why it is that unit
 * and not whatever weapon is being flown), times the line's own share of it per second,
 * times how long this bite covers. Read once a step, so a rank taken between two frames is
 * worth the same on every fire already going (game/upgrades.js).
 */
function biteWeight(world, spec) {
  return BALANCE.bullets.damage * gainOf(world, 'damage') * flameOf(world) * spec.bite;
}

/**
 * PLAN's "burning enemies spread it on death at rank 3": the numbers of the jump, or null
 * while the line has not been taken far enough to have one. Rank 1 and 2 are about the fire
 * biting harder; the third is what turns a crowd into a bonfire, which is why it is a gate
 * and not a growing radius.
 */
function jumpAt(world, spec) {
  return rankOf(world, 'burn') >= spec.spread.at ? spec.spread : null;
}

/**
 * A body that came apart alight passes its fire to everything standing within the jump's
 * reach, for a share of the time the corpse had left. The share is the whole argument for
 * how a chain behaves: each jump is shorter than the one before it, so fire runs *down*
 * through a crowd and dies out rather than setting the arena alight from one match.
 *
 * The light only happens when the jump actually landed somewhere. A ring for a fire that
 * went nowhere would be a claim the damage did not make.
 */
function passFire(world, corpse, jump, time) {
  if (time <= 0) return;

  const spec = BALANCE.upgrades.burn;
  const crowd = world.enemies;
  const reach2 = jump.radius * jump.radius;
  let landed = 0;
  for (let i = 0; i < crowd.length; i++) {
    const body = crowd[i];
    // Only what is still standing. A body that came apart in this step has a fire of its own
    // to spend - its own, at its own share - and lighting it again here would pay the same
    // death out twice.
    if (body.hp <= 0) continue;
    if (dist2(body.x, body.y, corpse.x, corpse.y) > reach2) continue;
    if (feed(world, body, spec, time) !== null) landed++;
  }
  if (landed === 0) return;

  ring(world, corpse.x, corpse.y, PALETTE.burnFlame, jump.radius, jump.ring.speed, jump.ring.life);
  burst(world, corpse.x, corpse.y, PALETTE.burnCore, jump.burst.count, jump.burst.speed, jump.burst.life);
}

/**
 * A fire that has nowhere left to burn: out sideways if the line has that, and then back in
 * the drawer. `left` is whatever was still burning when the body stopped - a fire that ate
 * the body has almost none of it left to give, which is the honest share of a kill.
 */
function goOut(world, fires, at, fire, spec) {
  const jump = jumpAt(world, spec);
  if (jump !== null) passFire(world, fire.target, jump, fire.left * jump.share);
  fires.killAt(at);
}

/**
 * Set a body alight for the line's whole burn time. Called by everything that hurts the
 * crowd on the run's behalf - game/bullets.js, game/arc.js, game/orbitals.js, game/nova.js -
 * where the hit is, and not from one place above them, so a system that does not want to
 * light things (a bomber's blast, game/blast.js) can honestly not.
 *
 * A body already alight is not lit twice; its fire is topped up to the full time instead.
 * A run that has not taken the line pays nothing here at all, not one compare.
 *
 * A body the hit brought down is the one case that is not a whole burn. Nothing can bite a
 * body that has come apart, so there is no burn to give it: what it gets is the share a jump
 * carries, because what a killing hit really does is hand the fire to whatever was standing
 * next to the body - PLAN's "burning enemies spread it on death", paid for by the shot that
 * did the killing rather than only by a fire that happened to still be going when it died.
 * That is the difference between a line that fades out as the gun gets strong enough to kill
 * everything in one hit and one that gets louder: at the ranks before the jump there is
 * nothing for a corpse to do with a fire, so it gets none and the frame has nothing to draw.
 */
export function ignite(world, enemy) {
  const spec = BALANCE.upgrades.burn;
  if (flameOf(world) <= 0) return null;
  if (enemy.hp > 0) return feed(world, enemy, spec, spec.time);

  const jump = jumpAt(world, spec);
  if (jump === null) return null;
  return feed(world, enemy, spec, spec.time * jump.share);
}

/**
 * One step of the fire. Downwards, because a fire that goes back in the drawer drops the
 * last one into its hole (core/pool.js); and bodies set alight *during* this pass - by a
 * jump from a body eaten earlier in it - are deliberately not bitten until the next step,
 * which is what keeps a chain from paying out its whole length in one frame.
 *
 * Answers false when the run ended part way through, the way the other systems that can
 * kill something do: a fire can finish a bomber, and a bomber's blast reaches the ship.
 */
export function updateBurn(world, dt) {
  const spec = BALANCE.upgrades.burn;
  const fires = world.fires;
  if (fires.count === 0) return true;
  const weight = biteWeight(world, spec);

  for (let i = fires.count - 1; i >= 0; i--) {
    const fire = fires.items[i];
    const body = fire.target;

    // Came apart since the last step - a bullet, a nova front, one of these bites. The fire
    // is one step behind the crowd on purpose: that step is where a death can still spread.
    if (body.hp <= 0) {
      // ...unless the death already paid its ending with a detonation (game/shock.js): that fire
      // was spent in the blast, and it is put back in the drawer without going out sideways.
      if (fire.quenched) fires.killAt(i);
      else goOut(world, fires, i, fire, spec);
      continue;
    }

    fire.left -= dt;
    if (fire.left <= 0) {
      // Burned out. It goes out on its own account, not sideways: PLAN's spread is what a
      // death does, and a body that stopped smouldering is still standing there.
      fires.killAt(i);
      continue;
    }

    fire.due -= dt;
    if (fire.due > 0) continue;
    fire.due = spec.bite;

    const embers = spec.ember;
    spray(world, body.x, body.y, PALETTE.burnFlame, embers.count, embers.speed, embers.life,
      UP, embers.spread);
    // `true`: the fire is the ship's, whoever lit it and whoever it kills next (game/tally.js).
    if (damageEnemy(world, body, weight, true)) goOut(world, fires, i, fire, spec);
  }

  return world.state === STATE.PLAY;
}

/**
 * Is this body alight - does it have a fire of its own going. Asked by game/shock.js, which has
 * to know whether a corpse wore fire as well as cold before it decides what that death is worth,
 * and asked by nothing else: every other system lights a fire and never looks to see who is
 * burning.
 */
export function isAlight(world, enemy) {
  return fireOn(world, enemy) !== null;
}

/**
 * Light a body for a stated time, if the run has any fire at all: the door a *death* that throws
 * fire comes through (game/shock.js), as distinct from the door a hit lands by ({@link ignite}).
 * The time is the caller's business and is not scaled by anything here - a detonation hands on a
 * share of what its corpse had, and this file has no way of knowing what a blast was worth.
 *
 * A body that has come apart is not lit: it has an ending of its own to pay, and {@link ignite} is
 * the door that deals with corpses.
 */
export function passFlame(world, enemy, time) {
  if (flameOf(world) <= 0) return null;
  if (enemy.hp <= 0 || time <= 0) return null;
  return feed(world, enemy, BALANCE.upgrades.burn, time);
}

/**
 * Take a body's fire out of the world without letting it go out sideways. Only a detonation has
 * ever needed this (game/shock.js): the fire is spent *in* the blast, so it must not also arrive
 * on the neighbours a step later, and the one corpse must pay one ending and not two.
 *
 * It *marks* the fire rather than removing it, and that is not laziness: this is called from
 * inside a death, and a death can be on its way through `updateBurn`'s own walk of this pool -
 * a fire that bit a body which then came apart can quench a different body's fire, and taking a
 * slot out of the pool from under that loop would move an object the loop has not come back for
 * (core/pool.js swap-removes). A mark costs one compare in the one place that already looks at
 * every fire, and the fire goes back in the drawer on the step that finds its body gone.
 */
export function quenchFlame(world, enemy) {
  const fires = world.fires;
  for (let i = 0; i < fires.count; i++) {
    if (fires.items[i].target === enemy) {
      fires.items[i].quenched = true;
      return true;
    }
  }
  return false;
}

/**
 * Put every fire back in the drawer. A fire left over from the last run would be eating a
 * body that no longer exists, and the title screen does not step a run to find that out.
 */
export function resetFires(world) {
  world.fires.clear();
}
