// The flying feedback: sparks, chunks of wreckage, the wake off the engines,
// shockwave rings, and floating labels.
//
// A ring's glow and a label's halo are a second, wider, fainter stroke under the
// first one: it reads as light spilling out and costs nothing like a blur does.
//
// The engine wake is drawn apart from the rest, earlier in the frame: a ship must
// never be lost inside its own trail, so its puff glow goes under the crowd and
// the ship while the sparks that fly over everything go over it.

import { clamp } from '../core/math.js';
import { withAlpha } from '../core/palette.js';
import { DEBRIS, SMOKE } from '../game/effects.js';
import { glowFor, paintGlow } from './glow.js';
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
const CHIP_REACH = 26;

// A chip of wreckage is drawn as a short bar, turned however far it has spun.
// Its length is a multiple of the size the simulation gave it, and it keeps more
// of that size than a spark does: a chunk winks out, it does not shrink away.
const CHIP_LENGTH = 2.4;
const CHIP_KEEP = 0.6;

// A puff of exhaust is one baked glow sprite, scaled up as it cools. A ship drops
// these every ~40 ms and they lie along the way it came, so they overlap: kept
// deliberately faint, or a run's own wake would outshine the ship and wash out
// everything behind it (PLAN pillar 2).
const PUFF_SPRITE = 12;    // px: how far the baked light reaches from its middle
const PUFF_BASE = 6;       // px: the size a puff is born at, whatever it was dealt
const PUFF_BLOOM = 2;      // ...and how much wider it is once it has cooled
const PUFF_LIGHT = 0.16;   // the brightest a puff ever lands

/**
 * Sparks and chunks: everything that flies hot. Chunks are the ones that tumble -
 * a bar turned to wherever its spin has got to, which is what makes a wreck read
 * as pieces of a thing rather than as a puff of dots.
 */
export function drawSparks(ctx, alpha) {
  const particles = world.particles;
  for (let i = 0; i < particles.count; i++) {
    const p = particles.items[i];
    if (p.shape === SMOKE) continue;
    const chip = p.shape === DEBRIS;
    if (!onScreen(p.x, p.y, chip ? CHIP_REACH : SPARK_REACH)) continue;

    const t = clamp(p.life / p.max, 0, 1);
    const x = paintX(p, alpha);
    const y = paintY(p, alpha);
    ctx.globalAlpha = t;
    ctx.fillStyle = p.color;
    if (chip) {
      const size = p.size * (CHIP_KEEP + (1 - CHIP_KEEP) * t);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rot);
      ctx.fillRect(-size * CHIP_LENGTH / 2, -size / 2, size * CHIP_LENGTH, size);
      ctx.restore();
      continue;
    }
    const size = p.size * (0.35 + t * 0.65);
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
}

/**
 * The wake the engines have been dropping. Faintest at the end of its life and
 * widest then too, so what is left of a ship's trail is a smear rather than a line
 * of dots; drawn before the ship, so nothing it leaves behind can hide the ship.
 */
export function drawSmoke(ctx, alpha) {
  const particles = world.particles;
  for (let i = 0; i < particles.count; i++) {
    const p = particles.items[i];
    if (p.shape !== SMOKE) continue;
    const t = clamp(p.life / p.max, 0, 1);
    const bloom = 1 + (1 - t) * (PUFF_BLOOM - 1);
    if (!onScreen(p.x, p.y, PUFF_SPRITE * bloom + 4)) continue;
    paintGlow(
      ctx,
      glowFor(p.color, PUFF_SPRITE),
      paintX(p, alpha), paintY(p, alpha),
      t * t * PUFF_LIGHT,
      (p.size / PUFF_BASE) * bloom,
    );
  }
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
