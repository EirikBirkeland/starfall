// The flying feedback: sparks, shockwave rings, and floating labels.

import { clamp } from '../core/math.js';
import { world } from '../game/world.js';

export function drawParticles(ctx) {
  ctx.shadowBlur = 0;
  const particles = world.particles;
  for (let i = 0; i < particles.count; i++) {
    const p = particles.items[i];
    const t = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = t;
    ctx.fillStyle = p.color;
    const size = p.size * (0.35 + t * 0.65);
    ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
}

export function drawRings(ctx) {
  const rings = world.rings;
  for (let i = 0; i < rings.count; i++) {
    const r = rings.items[i];
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
  const texts = world.texts;
  for (let i = 0; i < texts.count; i++) {
    const label = texts.items[i];
    const fade = clamp(label.life / label.max, 0, 1);
    ctx.globalAlpha = fade;
    ctx.fillStyle = label.color;
    ctx.shadowBlur = 12;
    ctx.shadowColor = label.color;
    ctx.fillText(label.text, label.x, label.y);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
}
