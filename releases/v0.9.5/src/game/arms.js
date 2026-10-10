// A boss's arm: a blade of light out of its body that turns (PLAN 3.4's Eclipse, phase 3:
// "sweeping arms").
//
// It is the fifth thing in the game that hurts the ship without being thrown at it - a sniper's
// beam, a bomber's circle, a boss's spoke and a boss's shell are the other four - and the only one
// of them that *moves while it hurts*. A beam is a thing that happened: it pays out in the step it
// is fired and spends the rest of its life fading (game/beams.js). An arm is a place the fight is
// holding: it sweeps an arc, and anything still standing in the blade when it comes round loses.
// That is the whole reason this is a file of its own and not a call to `fireBeam`: a beam fired
// every step of a sweep would shake the frame, stop the clock and shriek once per step, which is
// what a *flash* costs and not what a blade costs.
//
// Four decisions live here, and each of them has a test:
//
//   **It is loose, not attached.** The fight's beat shows the fan and then lets the blade go
//     (game/bosses.js `letArmsLoose`); from that step on the arm is a thing in the world with its
//     own turn to spend, like a shell out of a rim. It follows the body it was born out of while
//     that body stands, and it carries on sweeping when it does not. A boss's own beat is three
//     lines long because of this, and a blade is still honest after the fight that made it has gone.
//
//   **It hurts the ship and nothing else.** The crowd is not what a blade is for: a duel has no
//     crowd in it (the director holds while a fight is on, game/waves.js) and a second damage
//     source with no number beside it is a number nobody has measured. The blade's one ask is a
//     hull, and `player.hitInvulnerability` is what says it cannot take a second one while the
//     ship is still standing inside it - the same bargain a spoke makes (game/beams.js).
//
//   **The blade drawn is the blade that hurts, edge for edge.** One number, `half`, says how far
//     off its axis the light is painted and the harm is paid out, and one pair, `inner` and
//     `reach`, says how far it runs either way (render/arms.js asks this file for all three). A
//     promise you can stand on has to be measured from one thing only, and this game has been
//     holding every telegraph to that rule since the sniper's lock.
//
//   **It spends no randomness.** Where a blade starts is the body's own facing at the moment the
//     beat lit, which the ride turned there and the framework then held still; how far it goes is
//     the row's. So a seed sweeps its blades to the same bearings twice over, like a door and a
//     spoke and a call.
//
// It is stepped with the other things that hurt the ship after the crowd has walked
// (game/world.js), so a blade pays out where every body ended up this step.

import { STATE } from './state.js';
import { hitPlayer, isInvulnerable } from './player.js';
import { hurtByArm } from './tally.js';

/**
 * The shape of one blade: the body it is rooted to and the pivot that follows it (`source`, and
 * `x`/`y`, which is where it is drawn and hurt from), which way it points (`angle`, with the unit
 * vector `dirX`/`dirY` written out of it every step so nobody has to take a cosine of the same
 * number twice), how it turns (`spin`, rad/s, signed, for as long as `left` radians last), and
 * how big a band of harm it is (`inner`..`reach` along it, `half` px off it).
 *
 * `angle` is deliberately never folded back into 0..TAU: it is only ever travelled by `spin`, and
 * an unwrapped angle with a `pangle` beside it is what lets a frame paint a turning blade between
 * two steps (render/interp.js) without a lerp that jumps the whole arena across at pi.
 *
 * `px`/`py` are the pivot's, as every mover's are: a blade whose body is walking is drawn one step
 * behind where it stands, like everything else in the world.
 *
 * `color` is the phase that loosed the blade wearing, written at the same moment the shot of a
 * shell is (game/enemyshots.js `enemyShotAt`), so a blade outlives its phase without lying about
 * which one it came from. `from` is whose fight it is, which is the only way anybody can say
 * afterwards what put a hole in the ship (game/tally.js).
 */
export function makeArm() {
  return {
    x: 0, y: 0, px: 0, py: 0,
    source: null,
    angle: 0, pangle: 0, dirX: 1, dirY: 0,
    spin: 0, left: 0,
    inner: 0, reach: 0, half: 0,
    color: '', from: '',
  };
}

/**
 * Loose one blade out of `body`, along `angle`, on the numbers the phase's `sweep` row gives.
 *
 * Every field is written, which is the contract every spawner in the game signs and the pool keeps
 * an honest object out of: a recycled blade that remembered the last one's reach would be a blade
 * longer than the fan it was promised by.
 *
 * It is born having already turned nothing: the first step of its life is the first step of the
 * sweep, so the bearing the frame was showing is the bearing the blade starts from and not one
 * step of a turn further round it.
 */
export function looseArm(world, body, angle, spec, color) {
  if (spec.rate === 0) throw new Error('an arm that does not turn has no end to its sweep');
  const arm = world.arms.spawn();
  arm.x = body.x;
  arm.px = body.x;
  arm.y = body.y;
  arm.py = body.y;
  arm.source = body;
  arm.angle = angle;
  arm.pangle = angle;
  arm.dirX = Math.cos(angle);
  arm.dirY = Math.sin(angle);
  arm.spin = spec.rate;
  arm.left = spec.arc;
  // The blade starts at the rim of the body it came out of, which is where the fight is drawn
  // ending (render/boss.js) - a blade across the middle of a dark sun would be a blade through the
  // one hole in the sky this boss is.
  arm.inner = body.r;
  arm.reach = spec.reach;
  arm.half = spec.half;
  arm.color = color;
  arm.from = body.type;
  return arm;
}

/**
 * How far a point stands off a blade, or Infinity if it is not level with it at all - past the tip
 * or inside the rim it starts from. A ship's centre inside `half` of this is in the blade; that is
 * the whole of the collision test, and it is `beams.js`'s `axisDistance` with a near end, which a
 * ray that starts at a rim rather than in the middle of a body needs and a beam does not.
 */
export function offTheBlade(arm, x, y) {
  const rx = x - arm.x;
  const ry = y - arm.y;
  const along = rx * arm.dirX + ry * arm.dirY;
  if (along < arm.inner || along > arm.reach) return Infinity;
  return Math.abs(rx * arm.dirY - ry * arm.dirX);
}

/**
 * The pivot, one step older: the blade is rooted to the body that made it, so it goes where that
 * body went and no further - and it stops being rooted the moment that body stops existing, which
 * leaves the last sweep of a fight's life still sweeping instead of snapping to a corpse.
 */
function followTheBody(arm) {
  arm.px = arm.x;
  arm.py = arm.y;
  arm.pangle = arm.angle;
  const body = arm.source;
  if (body === null || body.hp <= 0) return;
  arm.x = body.x;
  arm.y = body.y;
}

/** One step of the turn, and the last of the arc it was promised. */
function turnTheBlade(arm, dt) {
  const step = arm.spin * dt;
  arm.angle += step;
  arm.left -= Math.abs(step);
  arm.dirX = Math.cos(arm.angle);
  arm.dirY = Math.sin(arm.angle);
}

/**
 * One step of the arm system: every blade turns, every blade asks whether the ship is standing in
 * it, and a blade that has travelled the arc it was given goes back in the drawer.
 *
 * Answers whether the run is still going, the way `updateBeams` does: a blade can end a run, and
 * the step has to stop touching things the moment there is no ship left to touch.
 */
export function updateArms(world, dt) {
  const arms = world.arms;
  const ship = world.player;
  for (let i = arms.count - 1; i >= 0; i--) {
    const arm = arms.items[i];
    followTheBody(arm);
    turnTheBlade(arm, dt);
    if (world.state === STATE.PLAY && !isInvulnerable(ship)
      && offTheBlade(arm, ship.x, ship.y) <= arm.half) {
      hitPlayer(world, hurtByArm(arm.from));
    }
    if (arm.left <= 0) arms.killAt(i);
  }
  return world.state === STATE.PLAY;
}

/** Put every blade back in the drawer. One left standing from the last run would still be sweeping. */
export function resetArms(world) {
  world.arms.clear();
}
