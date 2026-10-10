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
//   holeFor(radius)         - a disc of *nothing*: full alpha out to most of its
//                             radius and a soft rim after that. It is the inverse
//                             of a glow, and it exists to be stamped with
//                             `destination-out`, which is how a hole is cut in the
//                             night (render/darkness.js). One radius is baked and
//                             stamped at any size with `scale`.
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
// A hole falls off the other way round: it is *all there* until near its own edge and then goes.
// A glow's profile would not do - a glow is only half as strong as it is at its middle by a third
// of the way out, so a hole cut with one would be a dim smear with a bright pinprick in it and its
// radius would mean nothing you could plan a fight round.
const HOLE_FALLOFF = [[0, 1], [0.62, 1], [0.8, 0.62], [1, 0]];
// A streak is a row of those blobs along an axis. These are its shape:
const STEP_SPACING = 3;    // px of travel per blob
const BLOB_SPREAD = 1.7;   // how far a blob's soft edge reaches past its size
const TAIL_WIDTH = 0.3;    // the tail's width, as a fraction of the head's
const TAIL_ALPHA = 0.3;    // and its brightness

/** colour -> Map(radius -> holder). The memo `glowFor` reads. */
const glowMemo = new Map();
/** radius -> holder. The memo `holeFor` reads; a hole has no colour, only alpha. */
const holeMemo = new Map();
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
 * A disc of nothing reaching `radius` px, flat across the middle of it and soft at the edge.
 *
 * It is only ever stamped with `destination-out`, where the colour does not matter and the alpha
 * is the whole of the answer, so one sprite serves every hole in the game and `radius` is the
 * literal reach of the hole it cuts. Baked at one size and stamped at any other with `scale`:
 * what scales with it is the softness of the rim, which is what a light's edge is anyway.
 */
export function holeFor(radius) {
  const r = Math.max(1, Math.round(radius));
  let holder = holeMemo.get(r);
  if (!holder) {
    holder = register({ kind: 'hole', color: '#ffffff', radius: r, w: r * 2, h: r * 2 });
    holeMemo.set(r, holder);
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
 * globalAlpha the caller already has; `scale` stamps it bigger or smaller than the
 * sprite that was baked (one sprite makes every size a thing could want).
 */
export function paintGlow(ctx, holder, x, y, strength = 1, scale = 1) {
  if (strength <= 0) return;
  const sprite = spriteOf(holder);
  if (strength >= 1 && scale === 1) {
    stamp(ctx, sprite, x, y);
    return;
  }
  ctx.save();
  ctx.globalAlpha = ctx.globalAlpha * strength;
  stamp(ctx, sprite, x, y, scale);
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
    if (holder.kind === 'streak') holder.sprite = bakeStreak(holder);
    else holder.sprite = bakeDisc(holder, holder.kind === 'hole' ? HOLE_FALLOFF : FALLOFF);
  }
  return holder.sprite;
}

function stamp(ctx, sprite, x, y, scale = 1) {
  const w = scale === 1 ? sprite.w : sprite.w * scale;
  const h = scale === 1 ? sprite.h : sprite.h * scale;
  ctx.drawImage(sprite.canvas, x - w / 2, y - h / 2, w, h);
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

function bakeDisc(holder, stops) {
  const r = holder.radius;
  return bakeSprite(holder.w, holder.h, (g) => {
    blob(g, holder.color, r, r, r, 1, stops);
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
function blob(g, color, x, y, radius, alpha, stops) {
  const grad = g.createRadialGradient(x, y, 0, x, y, radius);
  for (const [stop, level] of (stops === undefined ? FALLOFF : stops)) {
    grad.addColorStop(stop, withAlpha(color, level * alpha));
  }
  g.fillStyle = grad;
  g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
