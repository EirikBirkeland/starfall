// The flying feedback: sparks, shockwave rings, and floating labels.
//
// A ring's glow and a label's halo are a second, wider, fainter stroke under the
// first one: it reads as light spilling out and costs nothing like a blur does.

import { clamp } from '../core/math.js';
import { withAlpha } from '../core/palette.js';
import { paintX, paintY } from './interp.js';
import { onScreen } from './camera.js';
import { world } from '../game/world.js';

const RING_GLOW = 0.22;        // how bright the wide faint pass under a ring is
const RING_GLOW_MIN = 4;       // and how wide it is, growing thin as the ring fades
const RING_GLOW_SPAN = 6;
const TEXT_GLOW = 0.3;
const TEXT_GLOW_WIDTH = 4;
// A spark is a couple of pixels and carries no halo, so it only has to be nearly
// on screen to be worth a fillRect. Rings and labels are left alone: a run holds
// a handful of each, and a ring is as likely to reach in from off screen as not.
const SPARK_REACH = 24;

export function drawParticles(ctx, alpha) {
  const particles = world.particles;
  for (let i = 0; i < particles.count; i++) {
    const p = particles.items[i];
    if (!onScreen(p.x, p.y, SPARK_REACH)) continue;
    const t = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = t;
    ctx.fillStyle = p.color;
    const size = p.size * (0.35 + t * 0.65);
    ctx.fillRect(paintX(p, alpha) - size / 2, paintY(p, alpha) - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
}

export function drawRings(ctx) {
  const rings = world.rings;
  for (let i = 0; i < rings.count; i++) {
    const r = rings.items[i];
    const t = clamp(r.life / r.max, 0, 1);
    ctx.strokeStyle = r.color;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.globalAlpha = t * RING_GLOW;
    ctx.lineWidth = RING_GLOW_MIN + t * RING_GLOW_SPAN;
    ctx.stroke();
    ctx.globalAlpha = t * 0.85;
    ctx.lineWidth = 1 + t * 2.5;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawTexts(ctx) {
  ctx.textAlign = 'center';
  ctx.font = '700 14px "Segoe UI", system-ui, sans-serif';
  ctx.lineWidth = TEXT_GLOW_WIDTH;
  const texts = world.texts;
  for (let i = 0; i < texts.count; i++) {
    const label = texts.items[i];
    const fade = clamp(label.life / label.max, 0, 1);
    ctx.globalAlpha = fade;
    ctx.strokeStyle = withAlpha(label.color, TEXT_GLOW);
    ctx.strokeText(label.text, label.x, label.y);
    ctx.fillStyle = label.color;
    ctx.fillText(label.text, label.x, label.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}
