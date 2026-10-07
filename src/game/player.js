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
  const bullets = BALANCE.bullets;
  const spec = BALANCE.player;

  const angle = ship.angle + logic.range(-spec.spread, spec.spread);
  const nose = ship.r + bullets.noseOffset;
  const nx = ship.x + Math.cos(ship.angle) * nose;
  const ny = ship.y + Math.sin(ship.angle) * nose;

  world.bullets.push({
    x: nx,
    y: ny,
    vx: Math.cos(angle) * bullets.speed,
    vy: Math.sin(angle) * bullets.speed,
    life: bullets.life,
    dmg: bullets.damage,
  });

  ship.vx -= Math.cos(ship.angle) * spec.recoil;
  ship.vy -= Math.sin(ship.angle) * spec.recoil;

  const muzzle = bullets.muzzle;
  burst(world, nx, ny, PALETTE.spark, muzzle.count, muzzle.speed, muzzle.life);
  const sound = BALANCE.firing.sound;
  cueBeep(logic.range(sound.base, sound.base + sound.jitter), sound.dur, sound.wave, sound.vol, sound.slide);
}

export function updatePlayer(world, dt, input) {
  const spec = BALANCE.player;
  const ship = world.player;

  const steer = clamp(dt * spec.steerSmoothing, 0, 1);
  ship.vx += (input.moveX * ship.speed - ship.vx) * steer;
  ship.vy += (input.moveY * ship.speed - ship.vy) * steer;
  ship.x = clamp(ship.x + ship.vx * dt, ship.r, world.arena.w - ship.r);
  ship.y = clamp(ship.y + ship.vy * dt, ship.r, world.arena.h - ship.r);
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
