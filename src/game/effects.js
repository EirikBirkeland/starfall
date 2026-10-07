// The stuff that sprays, flashes and floats: sparks, shockwave rings, and the
// little score labels that drift upwards. They are simulated (they need the
// seeded random stream) but they never touch anything back.
//
// All three lists live in pools, because they are the busiest things in the game
// (a single death can spray 30 sparks) and they never care about their own order.
// Each spawner below writes every field of its shape, so a recycled object can
// never carry a leftover from its previous life.

import { BALANCE } from './balance.js';
import { logic } from '../core/rng.js';
import { Pool } from '../core/pool.js';
import { TAU } from '../core/math.js';

/** The shapes of the three effect lists, one factory each. */
export function makeParticle() {
  return { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 0, color: '' };
}

export function makeRing() {
  return { x: 0, y: 0, r: 0, vr: 0, life: 0, max: 1, color: '' };
}

export function makeLabel() {
  return { x: 0, y: 0, text: '', color: '', life: 0, max: 1 };
}

/** Trauma, in the units the camera shake reads. */
export function shakeIt(world, amount) {
  world.shake = Math.min(BALANCE.screen.shakeCap, world.shake + amount);
}

export function burst(world, x, y, color, count, speed, life) {
  const fx = BALANCE.effects;
  for (let i = 0; i < count; i++) {
    const angle = logic.range(0, TAU);
    const pSpeed = logic.range(speed * fx.particleSpeedFloor, speed);
    const p = world.particles.spawn();
    p.x = x;
    p.y = y;
    p.vx = Math.cos(angle) * pSpeed;
    p.vy = Math.sin(angle) * pSpeed;
    p.life = logic.range(fx.particleLifeFloor, life);
    p.max = life;
    p.size = logic.range(fx.particleSizeMin, fx.particleSizeMax);
    p.color = color;
  }
  // Over the cap, some sparks have to go. The pool is unordered, so this drops
  // an arbitrary handful rather than the oldest ones; at this crowd size no one
  // can tell, and no run may depend on it.
  const over = world.particles.count - fx.particleCap;
  if (over > 0) world.particles.trim(over);
}

export function ring(world, x, y, color, radius, speed, life) {
  const r = world.rings.spawn();
  r.x = x;
  r.y = y;
  r.r = radius;
  r.vr = speed;
  r.life = life;
  r.max = life;
  r.color = color;
}

export function addText(world, x, y, string, color) {
  const fx = BALANCE.effects;
  const label = world.texts.spawn();
  label.x = x;
  label.y = y;
  label.text = string;
  label.color = color;
  label.life = fx.textLife;
  label.max = fx.textLife;
  const over = world.texts.count - fx.textCap;
  if (over > 0) world.texts.trim(over);
}

export function updateEffects(world, dt) {
  const drag = Math.pow(BALANCE.effects.particleDrag, dt);
  const particles = world.particles;
  for (let i = particles.count - 1; i >= 0; i--) {
    const p = particles.items[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.killAt(i);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= drag;
    p.vy *= drag;
  }

  const ringDrag = Math.pow(BALANCE.effects.ringDrag, dt);
  const rings = world.rings;
  for (let i = rings.count - 1; i >= 0; i--) {
    const r = rings.items[i];
    r.life -= dt;
    if (r.life <= 0) {
      rings.killAt(i);
      continue;
    }
    r.r += r.vr * dt;
    r.vr *= ringDrag;
  }

  const texts = world.texts;
  for (let i = texts.count - 1; i >= 0; i--) {
    const label = texts.items[i];
    label.life -= dt;
    if (label.life <= 0) {
      texts.killAt(i);
      continue;
    }
    label.y -= BALANCE.effects.textRise * dt;
  }
}
