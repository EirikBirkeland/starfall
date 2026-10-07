// The stuff that sprays, flashes and floats: sparks, shockwave rings, and the
// little score labels that drift upwards. They are simulated (they need the
// seeded random stream) but they never touch anything back.

import { BALANCE } from './balance.js';
import { logic } from '../core/rng.js';
import { TAU } from '../core/math.js';

/** Trauma, in the units the camera shake reads. */
export function shakeIt(world, amount) {
  world.shake = Math.min(BALANCE.screen.shakeCap, world.shake + amount);
}

export function burst(world, x, y, color, count, speed, life) {
  const fx = BALANCE.effects;
  for (let i = 0; i < count; i++) {
    const angle = logic.range(0, TAU);
    const pSpeed = logic.range(speed * fx.particleSpeedFloor, speed);
    world.particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * pSpeed,
      vy: Math.sin(angle) * pSpeed,
      life: logic.range(fx.particleLifeFloor, life),
      max: life,
      size: logic.range(fx.particleSizeMin, fx.particleSizeMax),
      color: color,
    });
  }
  const over = world.particles.length - fx.particleCap;
  if (over > 0) world.particles.splice(0, over);
}

export function ring(world, x, y, color, radius, speed, life) {
  world.rings.push({ x: x, y: y, r: radius, vr: speed, life: life, max: life, color: color });
}

export function addText(world, x, y, string, color) {
  world.texts.push({ x: x, y: y, t: string, color: color, life: BALANCE.effects.textLife, max: BALANCE.effects.textLife });
  if (world.texts.length > BALANCE.effects.textCap) world.texts.shift();
}

export function updateEffects(world, dt) {
  const drag = Math.pow(BALANCE.effects.particleDrag, dt);
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const p = world.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      world.particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= drag;
    p.vy *= drag;
  }

  const ringDrag = Math.pow(BALANCE.effects.ringDrag, dt);
  for (let i = world.rings.length - 1; i >= 0; i--) {
    const r = world.rings[i];
    r.life -= dt;
    if (r.life <= 0) {
      world.rings.splice(i, 1);
      continue;
    }
    r.r += r.vr * dt;
    r.vr *= ringDrag;
  }

  for (let i = world.texts.length - 1; i >= 0; i--) {
    const t = world.texts[i];
    t.life -= dt;
    if (t.life <= 0) {
      world.texts.splice(i, 1);
      continue;
    }
    t.y -= BALANCE.effects.textRise * dt;
  }
}
