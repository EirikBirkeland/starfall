// Every soft light in the game, baked once into a small offscreen canvas.
//
// PLAN section 4: a glow is a sprite stamped with drawImage, never a `shadowBlur`
// and never a gradient built this frame. Asking the canvas to blur a shape is the
// most expensive thing a draw call can do, and doing it once per entity per frame
// is what puts the ceiling on how much may be on screen at once.
//
// Two kinds of sprite exist here:
//   glowFor(color, radius)  - a round pool of light. Memoised on its arguments,
//                             because they come from a handful of kinds, so a
//                             draw loop may ask for one every frame.
//   makeStreak(...)         - a tapering trail with a bright head, pointing along
//                             +x with its head at the origin. Owned by whoever
//                             made it (a weapon's trail, the ship's flame, the
//                             dash's blur) and built by that code once, lazily,
//                             on the first frame that needs it.
//
// Sprites are baked at device resolution and stamped at CSS size, so they stay
// crisp on a HiDPI screen. render/canvas.js reports the pixel ratio on every
// resize; after it changes, each sprite is rebuilt the next time it is stamped.
//
// None of this is simulated. A sprite is an argument to a draw call, never game
// state, and nothing here is built or thrown away during a simulation step.

import { mixColors, withAlpha } from '../core/palette.js';
import { clamp } from '../core/math.js';

// How a blob of light falls off from its middle, as [stop, alpha] pairs.
const FALLOFF = [[0, 1], [0.3, 0.5], [0.62, 0.17], [1, 0]];
// A streak is a row of those blobs along an axis. These are its shape:
const STEP_SPACING = 3;    // px of travel per blob
const BLOB_SPREAD = 1.7;   // how far a blob's soft edge reaches past its size
const TAIL_WIDTH = 0.3;    // the tail's width, as a fraction of the head's
const TAIL_ALPHA = 0.3;    // and its brightness

/** colour -> Map(radius -> holder). The memo `glowFor` reads. */
const glowMemo = new Map();
/** Every holder ever handed out, so a resolution change can empty them all. */
const holders = [];
let pixelRatio = 1;

/** Called by render/canvas.js whenever the device pixel ratio may have changed. */
export function setGlowResolution(next) {
  if (next === pixelRatio) return;
  pixelRatio = next;
  for (const holder of holders) holder.sprite = null;
}

/** What the sprite cache holds, for the F3 overlay (PLAN milestone 10). */
export function stats() {
  let sprites = 0;
  for (const holder of holders) if (holder.sprite) sprites++;
  return { holders: holders.length, sprites, pixelRatio };
}

/** The round glow of `color` reaching `radius` px out from its middle. */
export function glowFor(color, radius) {
  const r = Math.max(1, Math.round(radius));
  let byRadius = glowMemo.get(color);
  if (!byRadius) {
    byRadius = new Map();
    glowMemo.set(color, byRadius);
  }
  let holder = byRadius.get(r);
  if (!holder) {
    holder = register({ kind: 'glow', color, radius: r, w: r * 2, h: r * 2 });
    byRadius.set(r, holder);
  }
  return holder;
}

/**
 * A trail `length` px long and `thickness` px across, brightest at its head and
 * fading to `tail` colour at its tail. The caller keeps the result and stamps it
 * with paintStreak; both colours are baked at full opacity, so how faint the
 * streak lands is the stamp's business (`strength`), not the sprite's.
 */
export function makeStreak(tip, tail, length, thickness) {
  const w = Math.max(1, Math.round(length));
  const h = Math.max(1, Math.round(thickness));
  const pad = Math.max(1, Math.ceil((h / 2) * BLOB_SPREAD));
  return register({
    kind: 'streak',
    tip,
    tail,
    length: w,
    thickness: h,
    pad,
    w: w + pad * 2,
    h: h + pad * 2,
    headX: pad + w,
  });
}

/**
 * Stamp a round glow centred on x,y. `strength` dims it, on top of whatever
 * globalAlpha the caller already has.
 */
export function paintGlow(ctx, holder, x, y, strength = 1) {
  if (strength <= 0) return;
  const sprite = spriteOf(holder);
  if (strength >= 1) {
    stamp(ctx, sprite, x, y);
    return;
  }
  ctx.save();
  ctx.globalAlpha = ctx.globalAlpha * strength;
  stamp(ctx, sprite, x, y);
  ctx.restore();
}

/**
 * Stamp a streak with its head on x,y, pointing along `angle`. `stretch` makes it
 * longer or shorter along its own axis only (a bigger flame from one sprite);
 * `strength` dims it.
 */
export function paintStreak(ctx, holder, x, y, angle, stretch = 1, strength = 1) {
  if (strength <= 0) return;
  const sprite = spriteOf(holder);
  ctx.save();
  ctx.globalAlpha = ctx.globalAlpha * clamp(strength, 0, 1);
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(
    sprite.canvas,
    -sprite.headX * stretch, -sprite.h / 2,
    sprite.w * stretch, sprite.h,
  );
  ctx.restore();
}

function register(holder) {
  holder.sprite = null;
  holders.push(holder);
  return holder;
}

function spriteOf(holder) {
  if (!holder.sprite) {
    holder.sprite = holder.kind === 'glow' ? bakeGlow(holder) : bakeStreak(holder);
  }
  return holder.sprite;
}

function stamp(ctx, sprite, x, y) {
  ctx.drawImage(sprite.canvas, x - sprite.w / 2, y - sprite.h / 2, sprite.w, sprite.h);
}

function bakeSprite(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * pixelRatio));
  canvas.height = Math.max(1, Math.ceil(h * pixelRatio));
  const ctx = canvas.getContext('2d');
  ctx.scale(pixelRatio, pixelRatio);
  draw(ctx, w, h);
  return { canvas, w, h };
}

function bakeGlow(holder) {
  const r = holder.radius;
  return bakeSprite(holder.w, holder.h, (g) => {
    blob(g, holder.color, r, r, r, 1);
  });
}

function bakeStreak(holder) {
  const { length, thickness, pad, tip, tail } = holder;
  const half = thickness / 2;
  const midY = holder.h / 2;
  const steps = Math.max(1, Math.round(length / STEP_SPACING));
  const sprite = bakeSprite(holder.w, holder.h, (g) => {
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i <= steps; i++) {
      // t runs from the tail to the head: the blobs grow and brighten as they go.
      const t = i / steps;
      const radius = half * (TAIL_WIDTH + (1 - TAIL_WIDTH) * t) * BLOB_SPREAD;
      const alpha = TAIL_ALPHA + (1 - TAIL_ALPHA) * t;
      blob(g, mixColors(tail, tip, t), pad + (length * t), midY, radius, alpha);
    }
  });
  sprite.headX = holder.headX;
  return sprite;
}

/** Draw one soft round blob of light, additively, into a sprite being baked. */
function blob(g, color, x, y, radius, alpha) {
  const grad = g.createRadialGradient(x, y, 0, x, y, radius);
  for (const [stop, level] of FALLOFF) {
    grad.addColorStop(stop, withAlpha(color, level * alpha));
  }
  g.fillStyle = grad;
  g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
