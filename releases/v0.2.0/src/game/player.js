// The ship: flight, aim, firing, and what a hit costs.
//
// `input` is a plain descriptor built by the input layer each frame:
// { moveX, moveY, moving, aimX, aimY, firing }. The simulation never reads the
// keyboard or the mouse itself.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { logic } from '../core/rng.js';
import { clamp } from '../core/math.js';
import { burst, ring, shakeIt } from './effects.js';
import { cueBeep } from './cues.js';
import { endRun } from './run.js';

/** One shot: a bullet, a shove backwards, a muzzle flash, and a cue. */
export function fire(world) {
  const ship = world.player;
  const gun = BALANCE.bullets;
  const spec = BALANCE.player;

  const angle = ship.angle + logic.range(-spec.spread, spec.spread);
  const nose = ship.drawR + gun.noseOffset;
  const nx = ship.x + Math.cos(ship.angle) * nose;
  const ny = ship.y + Math.sin(ship.angle) * nose;

  const bullet = world.bullets.spawn();
  bullet.x = nx;
  bullet.y = ny;
  bullet.px = nx;
  bullet.py = ny;
  bullet.vx = Math.cos(angle) * gun.speed;
  bullet.vy = Math.sin(angle) * gun.speed;
  bullet.life = gun.life;
  bullet.dmg = gun.damage;

  ship.vx -= Math.cos(ship.angle) * spec.recoil;
  ship.vy -= Math.sin(ship.angle) * spec.recoil;

  const muzzle = gun.muzzle;
  burst(world, nx, ny, PALETTE.spark, muzzle.count, muzzle.speed, muzzle.life);
  const sound = BALANCE.firing.sound;
  cueBeep(logic.range(sound.base, sound.base + sound.jitter), sound.dur, sound.wave, sound.vol, sound.slide);
}

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

export function updatePlayer(world, dt, input) {
  const spec = BALANCE.player;
  const ship = world.player;

  steer(ship, spec, input, dt);
  ship.px = ship.x;
  ship.py = ship.y;
  // The body is clamped by what you can see of it, not by the hit radius, or the
  // nose would disappear into the wall.
  ship.x = clamp(ship.x + ship.vx * dt, ship.drawR, world.arena.w - ship.drawR);
  ship.y = clamp(ship.y + ship.vy * dt, ship.drawR, world.arena.h - ship.drawR);
  ship.angle = Math.atan2(input.aimY - ship.y, input.aimX - ship.x);
  ship.thrust = clamp(ship.thrust + (input.moving ? dt * spec.thrustRamp : -dt * spec.thrustRamp), 0, 1);
  if (ship.invuln > 0) ship.invuln -= dt;

  ship.fireTimer -= dt;
  if (input.firing && ship.fireTimer <= 0) {
    fire(world);
    ship.fireTimer = 1 / ship.fireRate;
  }
}

/** The ship is hit once: one hull, a flash of feedback, and a moment of grace. */
export function hitPlayer(world, enemy) {
  const spec = BALANCE.player;
  const hit = BALANCE.playerHit;
  const ship = world.player;

  ship.hull--;
  ship.invuln = spec.hitInvulnerability;
  shakeIt(world, hit.shake);
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

  if (enemy) enemy.flash = BALANCE.enemies.hitFlashShove;
  const sound = hit.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);

  if (ship.hull <= 0) {
    ship.hull = 0;
    endRun(world);
  }
}
