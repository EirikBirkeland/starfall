// Path helpers shared by the renderer. Each one leaves a path on the context
// for the caller to fill or stroke.

import { TAU } from '../core/math.js';

/** A regular polygon with `sides` corners. */
export function polygon(ctx, x, y, radius, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = rot + (i / sides) * TAU;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** The pointed ship silhouette, `spike` stretching the nose. */
export function shipPath(ctx, x, y, radius, rot, spike) {
  ctx.beginPath();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.moveTo(radius * spike, 0);
  ctx.lineTo(-radius * 0.75, radius * 0.7);
  ctx.lineTo(-radius * 0.35, 0);
  ctx.lineTo(-radius * 0.75, -radius * 0.7);
  ctx.closePath();
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
