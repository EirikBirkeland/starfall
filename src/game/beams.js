// The sniper's beam (PLAN 3.3's "long telegraphed laser across the whole arena").
//
// This is the fourth thing in the game that hurts the crowd without being fired at
// it - the orbitals, the nova and the arc are the ship's own - and the only one of
// the four that belongs to an enemy. It is also the only damage in the game that is
// a *line* rather than a place, which is why it is a system of its own and not a
// call to `game/blast.js`: a blast is a circle that already told you where it would
// be, and this is a chord of light across the whole arena that told you a second and
// a quarter earlier.
//
// Four decisions live here, and each of them has a test:
//
//   **The damage is instantaneous and the light outlives it**, exactly like a bolt
//     (game/arc.js) and unlike a nova front (game/nova.js). A beam is born having
//     already hurt everything standing on it, and what is left in the pool is the
//     record of that flash, fading. That is what makes the telegraph honest: the
//     band you were shown is the band that hurt, edge for edge, and a body that
//     walks onto a beam *after* it fired is not hurt by it, because a beam is a
//     thing that happened and not an area that lasts.
//
//   **It reaches the arena, not the screen.** The axis is clipped to the arena's
//     walls at the moment it is fired - both ways from the eye - and the renderer
//     draws the same two numbers, so a lock ends where the world does and never a
//     pixel further. Nothing about a beam depends on where the player happens to be
//     standing, which is the point of the kind: the whole arena is the danger zone
//     and the whole arena can be read.
//
//   **A centre either is on the line or it is not.** A ship's centre and a body's
//     centre are measured the same way, against `halfWidth`, which is the number the
//     painted band is drawn at twice - the same convention as a bomber's circle
//     (game/blast.js), and for the same reason: a promise you can stand on has to be
//     measured from one thing only.
//
//   **The eye stands in its own light and is not hurt by it.** A beam is fired out of
//     the middle of the body that fired it, so the source is excluded from the payout:
//     an emplacement that burned itself away two beams after arriving would be a kind
//     nobody has to answer, and the threat this kind is meant to be would last eight
//     seconds. Another sniper standing on the same line is not so lucky.
//
// It runs after the crowd has walked, so it pays out where bodies ended up rather
// than where the collision grid last saw them - the same reason `game/nova.js` and
// `game/orbitals.js` walk the crowd directly. A beam spends no randomness: its line
// is the eye's, its victims are whoever stands on it.

import { PALETTE } from '../core/palette.js';
import { STATE } from './state.js';
import { damageEnemy } from './enemies.js';
import { hitPlayer, isInvulnerable } from './player.js';
import { burst, hitStop, shakeIt, spray } from './effects.js';
import { cueBeep } from './cues.js';
import { hurtByBeam } from './tally.js';

/**
 * The shape of one beam: where its eye is (x, y), which way the axis runs
 * (dirX, dirY), how far that axis reaches each way before the arena ends (`fore`
 * and `back`), how far off the axis a centre is still hurt (`width`), how long the
 * light has left (`life`, out of `max`), what a body on it loses (`weight`, in
 * shots of the ship's gun, like a bomber's blast), which kind fired it (`from`, so
 * the run can say afterwards what killed it), and whether the flash has been paid
 * out yet (`paid`).
 *
 * `through` is the one field that says what *kind* of line this is: true for a sniper's,
 * which is an axis through the eye and hurts both ways along it, false for a ray, which
 * starts at the body that fired it and goes one way only (game/bosses.js' spokes). It
 * belongs to the gun rather than to the beam because it is a property of what was aimed.
 *
 * A beam keeps no px/py: it does not move, so there is nothing to interpolate
 * between. The renderer paints it straight from this state, like an arc bolt.
 *
 * `spec` is the row of the kind that fired it - `kinds.sniper.lock.beam` - kept for
 * its whole life the same way an enemy keeps `enemy.kind` (game/kinds.js), so what a
 * beam does with a body on it is read from one place and not from a kind named here.
 * `source` is that body itself: the beam is fired out of the middle of it, so without
 * that exclusion an eye standing on its own line would burn itself away, two beams at
 * a time, and the kind would destroy itself rather than threaten anything.
 */
export function makeBeam() {
  return {
    x: 0, y: 0, dirX: 0, dirY: 0, fore: 0, back: 0,
    width: 0, weight: 0, life: 0, max: 0, through: true,
    from: '', paid: false, spec: null, source: null,
  };
}

/** The scratch `beamReach` refills. A frame may ask for a beam's ends; it may not keep them. */
const ENDS = { fore: 0, back: 0 };

/** How far a ray from (x, y) along (dirX, dirY) gets before the world ends. */
function wallAlong(world, x, y, dirX, dirY) {
  // The live box and not the arena: while a boss has the room in a cage, the cage is the
  // wall, and light does not go through it any more than the ship does (game/field.js).
  const box = world.field;
  let t = Infinity;
  if (dirX > 0) t = Math.min(t, (box.x1 - x) / dirX);
  else if (dirX < 0) t = Math.min(t, (box.x0 - x) / dirX);
  if (dirY > 0) t = Math.min(t, (box.y1 - y) / dirY);
  else if (dirY < 0) t = Math.min(t, (box.y0 - y) / dirY);
  return Number.isFinite(t) ? t : 0;
}

/**
 * How far the axis of a beam fired from (x, y) along (dirX, dirY) reaches forwards
 * and backwards, in px, as `{ fore, back }`. Refills and returns one scratch object:
 * the caller copies it out or uses it at once.
 */
export function beamReach(world, x, y, dirX, dirY) {
  ENDS.fore = wallAlong(world, x, y, dirX, dirY);
  ENDS.back = wallAlong(world, x, y, -dirX, -dirY);
  return ENDS;
}

/**
 * How far a point stands off a beam's axis, in px, or Infinity if it is not level
 * with the beam at all (past one end of it or the other). A ship's centre inside
 * `width` of this is on the line; that is the whole of the collision test.
 */
export function axisDistance(beam, x, y) {
  const rx = x - beam.x;
  const ry = y - beam.y;
  const along = rx * beam.dirX + ry * beam.dirY;
  if (along > beam.fore || along < -beam.back) return Infinity;
  // Which side is which does not matter here; the magnitude is the answer.
  return Math.abs(rx * beam.dirY - ry * beam.dirX);
}

/**
 * Which way to step off a beam: the perpendicular that points away from the axis on
 * the side `across` says the thing stands. `across` is signed, and this is the same
 * arithmetic `tools/headless/threats.js` uses to say it to a player.
 */
function offTheAxis(beam, across) {
  const side = across >= 0 ? 1 : -1;
  return { x: beam.dirY * side, y: -beam.dirX * side };
}

/**
 * Everything standing on the axis loses: the crowd first, then the ship. The crowd
 * is picked out before anything is hurt because hurting it can set off a bomber, and
 * that happens inside this call (game/blast.js).
 *
 * Nothing it kills is a kill and nothing it kills pays the run: a beam is the sniper's
 * doing, the same reading as a bomber's blast that nobody lit (game/blast.js). It
 * still throws the bodies it crosses off the line and sprays sparks along
 * it, because a line of damage that crossed you silently is not a line you will see.
 *
 * The body that fired it is left out: the beam starts in the middle of it, and an eye
 * that burned itself away would be a hazard nobody has to answer.
 */
function payOut(world, beam) {
  const spec = beam.spec;
  const crossed = [];
  const crowd = world.enemies;
  for (let i = 0; i < crowd.length; i++) {
    const enemy = crowd[i];
    if (enemy === beam.source) continue;      // the eye is standing in its own light
    if (enemy.hp > 0 && axisDistance(beam, enemy.x, enemy.y) <= beam.width) crossed.push(enemy);
  }

  for (let i = 0; i < crossed.length; i++) {
    const enemy = crossed[i];
    // A beam that crossed one of these may have killed this one on the way out, and a
    // body does not die twice.
    if (enemy.hp <= 0) continue;
    const across = (enemy.x - beam.x) * beam.dirY - (enemy.y - beam.y) * beam.dirX;
    const step = offTheAxis(beam, across);
    enemy.ix += step.x * spec.shove;
    enemy.iy += step.y * spec.shove;
    spray(world, enemy.x, enemy.y, PALETTE.beamCore, spec.cut.count, spec.cut.speed,
      spec.cut.life, Math.atan2(step.y, step.x), spec.cut.spread);
    damageEnemy(world, enemy, beam.weight, false);
  }

  const ship = world.player;
  if (world.state !== STATE.PLAY || isInvulnerable(ship)) return;
  if (axisDistance(beam, ship.x, ship.y) > beam.width) return;
  hitPlayer(world, hurtByBeam(beam.from));
}

/**
 * Fire one beam. The damage is done on this step - after the crowd has walked, which is
 * why `updateBeams` calls it here and not inside the walk that decided to fire - and the
 * light is left behind in the pool to fade.
 *
 * It takes its line as four numbers rather than a body, because the two things in the game
 * that fire a beam only have the beam in common: a sniper fires down the axis its eye
 * locked, and a boss fires down each of its spokes (game/bosses.js). `source` is the body
 * to leave out of the payout - a body that fires a beam stands in its own light either
 * way, and an eye that burned itself down would be a hazard nobody has to answer.
 */
export function fireBeam(world, x, y, dirX, dirY, spec, from, source) {
  const beam = world.beams.spawn();
  beam.x = x;
  beam.y = y;
  beam.dirX = dirX;
  beam.dirY = dirY;
  const ends = beamReach(world, x, y, dirX, dirY);
  beam.fore = ends.fore;
  beam.back = spec.through === false ? 0 : ends.back;
  beam.width = spec.halfWidth;
  beam.weight = spec.damage;
  beam.life = spec.time;
  beam.max = spec.time;
  beam.through = spec.through !== false;
  beam.from = from;
  beam.paid = false;
  beam.spec = spec;
  beam.source = source;

  burst(world, x, y, PALETTE.beamCore, spec.flare.count, spec.flare.speed, spec.flare.life);
  shakeIt(world, spec.shake);
  hitStop(world, spec.hitStop);
  cueBeep(spec.sound.freq, spec.sound.dur, spec.sound.wave, spec.sound.vol, spec.sound.slide);
  return beam;
}

/**
 * One step of the beam system: fire anything whose lock has just run out, then pay
 * out and fade what is already in the air.
 *
 * A lock that is ready is spent here rather than inside the enemy's walk for one
 * reason: the beam hurts the crowd, and a walk is not allowed to splice the crowd it
 * is being called from (game/enemies.js). Firing here means a beam pays out where
 * every body ended up this step, and that a sniper killed during its telegraph never
 * fires at all - the line it drew was a promise, and killing it breaks the promise in
 * the player's favour, which is what a telegraph is for.
 *
 * What a ready lock looks like is `enemy.beamReady`: the walk raises it, this spends
 * it (game/kinds.js).
 *
 * Answers false when the run ended here, the way `updateEnemies` does, so the step can
 * stop touching things the moment there is no ship left to touch.
 */
export function updateBeams(world, dt) {
  const crowd = world.enemies;
  for (let i = 0; i < crowd.length; i++) {
    const enemy = crowd[i];
    if (enemy.beamReady) {
      enemy.beamReady = false;
      const spec = enemy.kind.stats.lock.beam;
      fireBeam(world, enemy.x, enemy.y, enemy.dirX, enemy.dirY, spec, enemy.type, enemy);
    }
  }

  const beams = world.beams;
  for (let i = beams.count - 1; i >= 0; i--) {
    const beam = beams.items[i];
    if (!beam.paid) {
      beam.paid = true;
      payOut(world, beam);
    }
    beam.life -= dt;
    if (beam.life <= 0) beams.killAt(i);
  }
  return world.state === STATE.PLAY;
}

/** Put every beam back in the drawer: one left over from the last run would shine on. */
export function resetBeams(world) {
  world.beams.clear();
}
