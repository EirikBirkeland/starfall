// The shielder's field: who is covering whom, and what that costs a bullet.
//
// The shielder (PLAN 3.3, 7:30) is the first thing in the game whose behaviour is a
// *relationship* rather than a walk. It does not touch the ship. It stands off behind
// its own crowd and holds a field over the bodies near it, and every one of those
// bodies takes what it can of a hit on a shield that grows back while the field
// lasts. So the crowd is not a list of separate things any more: it is a list with one
// of them propping the others up, and the whole of the kind is in the fact that
// removing the prop removes all the shields at once.
//
// That is why the relation lives here and not on the shielder. A field is a fact about
// two positions, and a position is exactly what a crowd spends its time changing, so
// the answer is recomputed from scratch every step: `guard` on each body says who is
// covering it, and it is nothing - `null`, and no shield - the moment the field is
// out of reach or the thing holding it stops existing. Nothing may keep an answer of
// its own: a stale field is a body that cannot be hurt for no reason, which is the one
// thing that would make this kind unfair.
//
// Three rules, all of them tested in `test/shielder.test.mjs`:
//
//   **A shield is a pool, not a reduction.** Damage comes off `shield` first and the
//   rest of it off the hull, so a body is never hurt by a fraction and the tally's
//   "hull lost" column still means hull lost (game/tally.js).
//
//   **It is the same for everything that hurts a body.** A bullet, a bomber's blast,
//   whatever comes next: they all come through `damageEnemy`, and that is where the
//   shield is asked. There is no kind of damage that gets past it by forgetting to
//   ask.
//
//   **A field covers everything in it, and nothing twice.** Not its own body - a
//   shielder that could not be shot around would be the end of the argument - and two
//   overlapping fields make a wider cover, not a thicker one.
//
// Like the collision grid, this is derived state: rebuilt at the top of every step of
// a run by `updateShields`, and stale everywhere else. It is walked directly against
// the crowd rather than through the grid, which is a snapshot of the crowd as it was
// before the bullets ran and would answer with a body that has since walked out of
// the field. There are at most a handful of shielders in a crowd and the inner test is
// one squared distance, so the honest double loop is the cheap one too.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { clamp, dist2 } from '../core/math.js';
import { burst, ring, shakeIt } from './effects.js';
import { cueBeep } from './cues.js';

/**
 * How far one body's field reaches, in px - 0 for every kind that has no field to
 * hold. The renderer draws exactly this as a circle, which is what makes the circle
 * the field's word and not the renderer's opinion about it (same deal as
 * `blastRadius` in game/kinds.js).
 */
export function fieldRadius(enemy) {
  const spec = enemy.kind.stats.guard;
  return spec === undefined ? 0 : spec.radius;
}

/** Whose field a body is standing in, or null when nothing is covering it. */
export function guardOf(enemy) {
  return enemy.guard;
}

/** Is it protected at this moment. */
export function isGuarded(enemy) {
  return enemy.guard !== null;
}

/** The numbers of the field covering it, or undefined when nothing covers it. */
function guardSpec(enemy) {
  const holder = enemy.guard;
  return holder === null ? undefined : holder.kind.stats.guard;
}

/**
 * How much of the shield over a body is still up, 0..1 - what the ring drawn round it
 * is filled to. Zero when nothing is covering it or when it has been soaked flat.
 */
export function shieldShare(enemy) {
  const spec = guardSpec(enemy);
  return spec === undefined ? 0 : clamp(enemy.shield / spec.cap, 0, 1);
}

/**
 * How far through its wait a shield is, 1 just after it was soaked down to 0..
 * nothing once it has started to fill back up. The drawing breathes on this, so the
 * tell and the rule it is telling you about are the same number twice.
 */
export function shieldWaiting(enemy) {
  const spec = guardSpec(enemy);
  return spec === undefined ? 0 : clamp(enemy.shieldWait / spec.after, 0, 1);
}

/**
 * One step of every field in the crowd: who is covering whom, what that is worth, and
 * what happens when a field goes out. Called before anything is shot at, so a shot
 * that lands this step is answered by the cover that was standing when it was fired.
 */
export function updateShields(world, dt) {
  const crowd = world.enemies;

  // This step's answer is worked out from scratch. Every body starts the step
  // unprotected and gets claimed by whichever field reaches it - the nearest one, so
  // that the link drawn between the two is a short line inside its own circle rather
  // than a stray across the screen to a shielder on the other side of the crowd.
  for (let i = 0; i < crowd.length; i++) crowd[i].guard = null;

  for (let i = 0; i < crowd.length; i++) {
    const field = crowd[i];
    const radius = fieldRadius(field);
    if (radius === 0) continue;
    const squared = radius * radius;

    for (let j = 0; j < crowd.length; j++) {
      const body = crowd[j];
      if (body === field || body.hp <= 0) continue;
      const d2 = dist2(body.x, body.y, field.x, field.y);
      if (d2 > squared) continue;
      const holder = body.guard;
      if (holder === null || d2 < dist2(body.x, body.y, holder.x, holder.y)) body.guard = field;
    }
  }

  // Then the shields themselves: what is covered fills back up, what is not loses
  // whatever it had. A body walking out of range therefore costs it its cover exactly
  // as much as its shielder dying does, which is the honest reading of "while the
  // field reaches it".
  for (let i = 0; i < crowd.length; i++) {
    const body = crowd[i];
    const spec = guardSpec(body);
    if (spec === undefined) {
      loseShield(world, body);
      continue;
    }
    if (body.shieldWait > 0) {
      body.shieldWait -= dt;
      continue;
    }
    if (body.shield < spec.cap) body.shield = Math.min(spec.cap, body.shield + spec.rate * dt);
  }
}

/**
 * A shield takes what it can of a hit and answers how much of `amount` it ate, so the
 * caller can take the rest off the hull and note only that (game/enemies.js). It
 * starts the wait from here, because "left alone" means left alone.
 */
export function shieldSoak(enemy, amount) {
  const spec = guardSpec(enemy);
  if (spec === undefined || enemy.shield <= 0) return 0;

  const soaked = Math.min(enemy.shield, amount);
  if (soaked <= 0) return 0;
  enemy.shield -= soaked;
  enemy.shieldWait = spec.after;
  cueBeep(spec.block.freq, spec.block.dur, spec.block.wave, spec.block.vol, spec.block.slide);
  return soaked;
}

/**
 * A body's cover went out - its shielder died, or it walked out of reach. Small and
 * silent, because this happens a handful of times a minute as a crowd walks through a
 * field; the field itself going out is the loud one, and that is `collapseField`.
 */
function loseShield(world, enemy) {
  if (enemy.shield > 0) {
    const spec = BALANCE.kinds.shielder.guard.pop;
    ring(world, enemy.x, enemy.y, PALETTE.shieldLight, spec.ring.radius, spec.ring.speed, spec.ring.life);
    burst(world, enemy.x, enemy.y, PALETTE.shieldLight, spec.burst.count, spec.burst.speed, spec.burst.life);
  }
  enemy.shield = 0;
  enemy.shieldWait = 0;
}

/**
 * A shielder's death: the field going out, closing in on the body that was holding it
 * and going with it. Whoever did the killing gets the same thing out of it - the
 * crowd's shields come down either way, which is what `updateShields` goes and finds
 * out on the step after this one.
 */
export function collapseField(world, enemy) {
  const spec = BALANCE.kinds.shielder.guard.collapse;
  ring(world, enemy.x, enemy.y, PALETTE.shieldLight, spec.ring.radius, spec.ring.speed, spec.ring.life);
  burst(world, enemy.x, enemy.y, PALETTE.shieldLight, spec.burst.count, spec.burst.speed, spec.burst.life);
  shakeIt(world, spec.shake);
  cueBeep(spec.sound.freq, spec.sound.dur, spec.sound.wave, spec.sound.vol, spec.sound.slide);
}
