// The ship: flight, the dash, aim, and what a hit costs.
//
// `input` is a plain descriptor built by the input layer each frame:
// { moveX, moveY, moving, aimX, aimY, firing, dash }. The simulation never reads
// the keyboard or the mouse itself.
//
// The gun is not here: what one pull of the trigger is belongs to the weapon being
// flown and lives in game/weapons.js. The ship's business is where it is, which way it
// is pointing, and when the trigger is pulled.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { clamp } from '../core/math.js';
import { addText, burst, ring, shakeIt, hitStop, spray, engineTrail } from './effects.js';
import { cueBeep, cueChord } from './cues.js';
import { endRun } from './run.js';
import { noteHullLoss } from './tally.js';
import { updateOvercharge } from './overcharge.js';
import { armDash, trailImages } from './afterimage.js';
import { armTie, tieCords } from './tether.js';
import { fire, shotsPerSecond } from './weapons.js';

/**
 * One step of the engines (PLAN 3.1). The velocity is steered toward wherever the
 * controls point - full speed that way while a direction is held, nothing at all
 * when none is - and it can only get there at `accel` or `brake` px/s^2.
 *
 * Both are rates of change of velocity rather than a smoothing constant, so the
 * ship answers the same way however it was moving: a lean from a standstill, a
 * slide to a stop, and a turn that goes through the middle instead of teleporting
 * across the speed. Nothing is smoothed per frame, which the fixed step needs.
 */
function steer(ship, spec, input, dt) {
  const pushing = input.moveX !== 0 || input.moveY !== 0;
  let targetX = input.moveX * ship.maxSpeed;
  let targetY = input.moveY * ship.maxSpeed;

  // The controls are meant to hand over a direction no longer than 1, and this is
  // the one place that cares: a stick pushed twice as hard is still the ship's
  // top speed, not twice the ship's top speed.
  const wanted = Math.sqrt(targetX * targetX + targetY * targetY);
  if (wanted > ship.maxSpeed) {
    targetX *= ship.maxSpeed / wanted;
    targetY *= ship.maxSpeed / wanted;
  }

  const dvx = targetX - ship.vx;
  const dvy = targetY - ship.vy;
  const gap = Math.sqrt(dvx * dvx + dvy * dvy);
  if (gap === 0) return;

  // Never past the target, so the ship settles instead of ringing around it.
  const reach = Math.min(gap, (pushing ? spec.accel : spec.brake) * dt);
  ship.vx += (dvx / gap) * reach;
  ship.vy += (dvy / gap) * reach;
}

/** Engines only: steer, remember where the step began, move, stay inside. */
function fly(world, ship, spec, input, dt) {
  steer(ship, spec, input, dt);
  ship.px = ship.x;
  ship.py = ship.y;
  // The body is clamped by what you can see of it, not by the hit radius, or the
  // nose would disappear into the wall.
  ship.x = clamp(ship.x + ship.vx * dt, ship.drawR, world.arena.w - ship.drawR);
  ship.y = clamp(ship.y + ship.vy * dt, ship.drawR, world.arena.h - ship.drawR);
}

/**
 * Where a dash without a held direction goes: at the cursor, and straight ahead
 * if the cursor is sitting on the ship. A lean always wins over the aim, because
 * that is the direction the ship was already being driven.
 */
function dashDirection(ship, input) {
  if (input.moveX !== 0 || input.moveY !== 0) {
    const length = Math.hypot(input.moveX, input.moveY);
    return { x: input.moveX / length, y: input.moveY / length };
  }
  const dx = input.aimX - ship.x;
  const dy = input.aimY - ship.y;
  const length = Math.hypot(dx, dy);
  // Nothing held and the cursor sitting on the ship: go where it is pointing.
  if (length === 0) return { x: Math.cos(ship.angle), y: Math.sin(ship.angle) };
  return { x: dx / length, y: dy / length };
}

/**
 * Start a dash, if the last one has worn off. `input.dash` is a request from the
 * input layer, spent whether it was answered or not: one press, one dash.
 */
function beginDash(world, input) {
  const spec = BALANCE.player.dash;
  const ship = world.player;
  if (ship.dashCd > 0) return false;

  const dir = dashDirection(ship, input);
  ship.dashDirX = dir.x;
  ship.dashDirY = dir.y;
  ship.dashLeft = spec.distance;
  // The wait is measured from the start of the dash, so a dash that ends early
  // against a wall still costs the full cooldown. How long that is is the ship's own
  // number (game/ships.js) - the frame counts the same one down for its ring.
  ship.dashCd = ship.dashWait;

  const back = Math.atan2(-dir.y, -dir.x);
  const start = spec.start;
  // A dash that was granted is a dash that will leave its images, if the run has bought the line
  // (game/afterimage.js). Arming happens here and not in `dashStep` so that the number of images
  // is settled once, at the moment the dash was allowed, by whatever ranks the ship has now.
  armDash(world);
  // And a dash that was granted is a dash that will tie a tether, if the run has bought that line
  // (game/tether.js) - which is also the moment the threads are born, because the tether is live from
  // the first step of the dash that tied it.
  armTie(world);
  ring(world, ship.x, ship.y, PALETTE.player, start.ring, start.ringSpeed, start.ringLife);
  spray(world, ship.x, ship.y, PALETTE.spark, start.burst, start.speed, start.life, back, spec.streak.spread);
  shakeIt(world, spec.shake);

  const sound = spec.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
  return true;
}

/**
 * The dash shoulders the crowd aside as it passes. Partly for the feel of pushing
 * through something, mostly so that a dash which ends in the middle of a mob ends
 * somewhere the ship can stand: the moment the dash is over, the crowd can hurt
 * again.
 */
function dashShoulder(world, ship) {
  const spec = BALANCE.player.dash.shove;
  for (let i = 0; i < world.enemies.length; i++) {
    const other = world.enemies[i];
    const dx = other.x - ship.x;
    const dy = other.y - ship.y;
    // Measured by what you can see of both, which is also how the shove reads.
    const reach = other.r + ship.drawR + spec.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 > reach * reach) continue;
    const dist = Math.sqrt(d2) || 1;
    // Set, not added: the dash keeps shouldering the same enemy for several steps
    // and a growing impulse would fling it across the arena.
    other.ix = (dx / dist) * spec.impulse;
    other.iy = (dy / dist) * spec.impulse;
  }
}

/**
 * One hull back, if there is a hull to give (an elite's gift, PLAN 3.3). Mint and
 * loud, because this is the one piece of good news a run hands out by itself and the
 * player has to know it happened without looking at the pips (PLAN section 4).
 * Answers how much was actually healed, so a caller cannot claim one that was not.
 */
export function healPlayer(world, amount) {
  const spec = BALANCE.player.heal;
  const ship = world.player;
  const healed = Math.min(amount, ship.maxHull - ship.hull);
  if (healed <= 0) return 0;

  ship.hull += healed;
  addText(world, ship.x, ship.y - ship.drawR - BALANCE.death.labelOffset - spec.labelOffset,
    '+' + healed + ' HULL', PALETTE.shardLine);
  burst(world, ship.x, ship.y, PALETTE.shard, spec.sparks.count, spec.sparks.speed, spec.sparks.life);
  ring(world, ship.x, ship.y, PALETTE.shard, spec.ring.radius, spec.ring.speed, spec.ring.life);
  cueChord(spec.sound.notes, spec.sound.dur, spec.sound.wave, spec.sound.vol);
  return healed;
}

/**
 * One step of a dash: the ship is on rails, covering its `distance` at a steady
 * speed, which is what makes it read as a dash rather than as a faster walk. The
 * engines do nothing until it is over, so the brake cannot strangle it halfway.
 */
function dashStep(world, ship, dt) {
  const spec = BALANCE.player.dash;
  const step = Math.min(ship.dashLeft, (spec.distance / spec.time) * dt);

  ship.px = ship.x;
  ship.py = ship.y;
  ship.x = clamp(ship.x + ship.dashDirX * step, ship.drawR, world.arena.w - ship.drawR);
  ship.y = clamp(ship.y + ship.dashDirY * step, ship.drawR, world.arena.h - ship.drawR);
  ship.dashLeft -= step;
  dashShoulder(world, ship);

  spray(world, ship.x, ship.y, PALETTE.player, spec.streak.count, spec.streak.speed,
    spec.streak.life, Math.atan2(-ship.dashDirY, -ship.dashDirX), spec.streak.spread);
  // And whatever images this much of the streak has reached (game/afterimage.js). After the
  // ship has moved, because an image is a copy of where the ship got to.
  trailImages(world);
  // And the same for the knots the tether is tied at (game/tether.js): a place the dash has actually
  // got to, and not a plan it never reached.
  tieCords(world);

  if (ship.dashLeft <= 0) {
    // The burst handed the ship back to the engines moving fast, so it keeps the
    // dash's direction at its normal top speed and brakes from there.
    ship.dashLeft = 0;
    ship.vx = ship.dashDirX * ship.maxSpeed;
    ship.vy = ship.dashDirY * ship.maxSpeed;
  }
}

/** Nothing may touch the ship right now: the grace after a hit, or a dash. */
export function isInvulnerable(ship) {
  return ship.invuln > 0 || ship.dashLeft > 0;
}

export function updatePlayer(world, dt, input) {
  const spec = BALANCE.player;
  const ship = world.player;

  // The wait never goes below zero, so "ready" is one honest value.
  if (ship.dashCd > 0) ship.dashCd = Math.max(0, ship.dashCd - dt);
  if (input.dash) beginDash(world, input);

  if (ship.dashLeft > 0) dashStep(world, ship, dt);
  else fly(world, ship, spec, input, dt);

  ship.angle = Math.atan2(input.aimY - ship.y, input.aimX - ship.x);
  // The flame answers the engines, and nothing else: a dash coasts, and it is the
  // streak that paints it (render/entities.js), not a thruster that is not firing.
  ship.thrust = clamp(ship.thrust + (input.moving ? dt * spec.thrustRamp : -dt * spec.thrustRamp), 0, 1);
  engineTrail(world, ship, dt);
  if (ship.invuln > 0) ship.invuln -= dt;

  // After the ship has been moved and before the trigger is looked at: whether this step was
  // standing still is a question about the velocity the engines just left, and a charge that
  // comes up this step is there for a pull this step (game/overcharge.js).
  updateOvercharge(world, dt, input);

  ship.fireTimer -= dt;
  if (input.firing && ship.fireTimer <= 0) {
    fire(world);
    ship.fireTimer = 1 / shotsPerSecond(world);
  }
}

/**
 * The ship is hit once: one hull, a flash of feedback, and a moment of grace.
 *
 * `cause` says what did it - a body, a shot, or a blast (see game/tally.js, which
 * is where the three shapes are made). The tally needs it to say what the run died
 * of, and a body that touched the ship gets flashed for its trouble.
 */
export function hitPlayer(world, cause) {
  const spec = BALANCE.player;
  const hit = BALANCE.playerHit;
  const ship = world.player;

  ship.hull--;
  noteHullLoss(world, cause);
  ship.invuln = spec.hitInvulnerability;
  shakeIt(world, hit.shake);
  // The longest freeze in the game. For these milliseconds the ship is still
  // there, the crowd is still closing in, and nothing can be done about either -
  // which is exactly why the moment is worth stopping for.
  hitStop(world, hit.hitStop);
  burst(world, ship.x, ship.y, PALETTE.player, hit.sparks.count, hit.sparks.speed, hit.sparks.life);
  burst(world, ship.x, ship.y, PALETTE.white, hit.flashSparks.count, hit.flashSparks.speed, hit.flashSparks.life);
  ring(world, ship.x, ship.y, PALETTE.white, hit.ring.radius, hit.ring.speed, hit.ring.life);

  // Shove the whole crowd outwards so the ship is not instantly hit again.
  for (let i = 0; i < world.enemies.length; i++) {
    const other = world.enemies[i];
    const dx = other.x - ship.x;
    const dy = other.y - ship.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    if (dist < spec.hitShoveRadius) {
      other.ix += (dx / dist) * spec.hitShoveImpulse;
      other.iy += (dy / dist) * spec.hitShoveImpulse;
    }
  }

  if (cause.enemy) cause.enemy.flash = BALANCE.enemies.hitFlashShove;
  const sound = hit.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);

  if (ship.hull <= 0) {
    ship.hull = 0;
    endRun(world);
  }
}
