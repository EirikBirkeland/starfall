// The flying feedback: sparks, shockwave rings, and floating labels.

import { clamp } from '../core/math.js';
import { world } from '../game/world.js';

export function drawParticles(ctx) {
  ctx.shadowBlur = 0;
  for (let i = 0; i < world.particles.length; i++) {
    const p = world.particles[i];
    const t = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = t;
    ctx.fillStyle = p.color;
    const size = p.size * (0.35 + t * 0.65);
    ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
}

export function drawRings(ctx) {
  for (let i = 0; i < world.rings.length; i++) {
    const r = world.rings[i];
    const t = clamp(r.life / r.max, 0, 1);
    ctx.globalAlpha = t * 0.85;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 1 + t * 2.5;
    ctx.shadowBlur = 14;
    ctx.shadowColor = r.color;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

export function drawTexts(ctx) {
  ctx.textAlign = 'center';
  ctx.font = '700 14px "Segoe UI", system-ui, sans-serif';
  for (let i = 0; i < world.texts.length; i++) {
    const t = world.texts[i];
    const fade = clamp(t.life / t.max, 0, 1);
    ctx.globalAlpha = fade;
    ctx.fillStyle = t.color;
    ctx.shadowBlur = 12;
    ctx.shadowColor = t.color;
    ctx.fillText(t.t, t.x, t.y);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
}
