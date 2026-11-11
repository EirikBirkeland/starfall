// The clouds behind everything: PLAN section 4's "slow drifting nebula clouds
// drawn once to an offscreen canvas".
//
// One offscreen canvas, baked once and lazily - on the first frame that needs it,
// the same way every glow sprite is made (render/glow.js) - and stamped twice a
// frame. Two passes because depth is the whole point of a sky: the far pass is the
// same bake stamped bigger, dimmer and slower, the near pass at its own size. One
// bake because a bake is not free, and because the two passes differing only in
// how they are stamped is what keeps this cheap.
//
// The bake is a *seamless tile*. Every puff that reaches past an edge is painted
// again on the far side of it, so the tile may be tiled in every direction and no
// join ever shows - which is what lets it be a fixed size, independent of the
// window: resizing never means rebaking, and a 1024 px tile (1741 px on the far
// pass) repeats on a very big window only where nobody looks. On the sky, unlike
// a wall or a floor, a repeat has nothing to be measured against.
//
// It is baked at half the size it is drawn at. A cloud has no detail finer than a
// pixel to lose, and a quarter of the pixels is a quarter of the bake and of the
// memory for something the eye reads as a soft wash either way.
//
// None of it is simulated. The clouds drift on the frame's own clock the way the
// stars do (render/background.js), read only the `visual` stream, and are painted
// in screen space, before the camera is applied.

import { PALETTE, mixColors, withAlpha } from '../core/palette.js';
import { visual } from '../core/rng.js';
import { TAU } from '../core/math.js';
import { view } from './canvas.js';
import { camera } from './camera.js';
import { world } from '../game/world.js';

const TILE = 1024;      // CSS px of one seamless tile of sky
const BAKE = 0.5;       // the sprite is baked at this fraction of the size it draws at

// The two passes, furthest first. Both are the same bake: what makes one look
// further away is that it is stamped bigger, dimmer, that it drifts less and
// parallaxes less. The depths sit under the shallowest star layer's and the drifts
// under its slowest 5 px/s (render/background.js), so the clouds always read as
// the furthest thing on screen.
const LAYERS = [
  { scale: 1.7, alpha: 0.5, depth: 0.004, driftX: -1.1, driftY: 0.35, x: 0, y: 0 },
  { scale: 1, alpha: 0.8, depth: 0.009, driftX: -2.4, driftY: 0.8, x: 0, y: 0 },
];

// What goes into the bake. A cloud is a chain of soft puffs laid along a line, so
// it reads as a filament and not as a disc, and there are two families of them: big
// masses spread over the tile, and a dusting of small wisps for texture. Everything
// is added together, so where puffs overlap the sky gets brighter, which is the only
// way any of it gets a bright middle.
//
// Each family is scattered on a jittered grid rather than at random, and that is not
// fastidiousness: the tile repeats, so a family scattered at random spends half of
// the sky empty and the other half in a knot - and a knot repeats too. Scattering
// on a grid with each cloud jittered inside its own cell dresses the whole sky and
// still wraps. `strength` is what a cloud of that family is worth, and it is drawn
// out wide on purpose: a bright one next to a nearly invisible one is what makes
// this read as gas with depth in it instead of as fog.
//
// There is no screen here to judge these by, so they were chosen by compositing the
// bake in a float buffer and reading the numbers: one tile of sky adds about 3.5 of
// luminance on average and 28 at its brightest core, which over the palette's dark
// sky (21) is a deep blue wash peaking around 58 with both passes lined up - still
// dimmer than the faintest star, which is where a backdrop belongs. If it ever
// reads as fog, widen `strength` before you lower `alpha`.
const CLOUD_FIELD = {
  grid: [3, 2],                 // how the big ones are spread over the tile
  reach: [0.12, 0.26],          // how long one is, as a share of the tile
  puffs: 16,                    // soft blobs in one
  alpha: 0.08,                  // per puff; the overlap is what makes it bright
  strength: [0.12, 1.8],        // what one is worth; the spread of it is the contrast
};
const DUST_FIELD = {
  grid: [6, 5],
  reach: [0.05, 0.13],
  puffs: 5,
  alpha: 0.04,
  strength: [0.2, 1.6],
};
const CLOUD_WIDTH = 0.34;       // how wide one is, as a share of its own length
const JITTER = 0.36;            // how far a cloud may wander from the middle of its cell
const PUFF_SIZE = [0.35, 0.8];  // a puff's radius, as a share of its cloud's reach

// How a puff fades from its middle. Softer than a glow sprite's falloff
// (render/glow.js): a cloud has no centre to point at.
const FALLOFF = [[0, 1], [0.35, 0.42], [0.7, 0.12], [1, 0]];

// The three tile positions a puff may be copied to when it crosses an edge.
const WRAP = [-TILE, 0, TILE];

let sprite = null;
let bakes = 0;

/** What has been baked, for the F3 overlay (PLAN milestone 10). */
export function stats() {
  return { bakes, layers: LAYERS.length, tile: TILE, baked: sprite !== null };
}

/** The clouds move, slowly. Once per frame, on the frame's own clock. */
export function updateNebula(dt) {
  for (let i = 0; i < LAYERS.length; i++) {
    const layer = LAYERS[i];
    const span = TILE * layer.scale;
    layer.x = wrap(layer.x + layer.driftX * dt, span);
    layer.y = wrap(layer.y + layer.driftY * dt, span);
  }
}

/**
 * The sky, in screen space, additively: each pass tiled across the window so that
 * wherever the drift has got to there is always cloud behind it. Called before the
 * camera transform, and it leaves the canvas the way it found it.
 */
export function drawNebula(ctx) {
  if (!sprite) sprite = bake();

  // Measured from the middle of the arena, so the sky sits still on the title
  // screen - where the camera parks - and only slides as a run travels.
  const px = camera.cx - world.arena.w / 2;
  const py = camera.cy - world.arena.h / 2;

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < LAYERS.length; i++) {
    const layer = LAYERS[i];
    const span = TILE * layer.scale;
    const ox = wrap(layer.x - px * layer.depth, span);
    const oy = wrap(layer.y - py * layer.depth, span);
    ctx.globalAlpha = layer.alpha;
    // The first stamp always starts at or before the window's edge, and each one
    // abuts the last, so the window ends up covered exactly once by every pass.
    for (let x = -ox; x < view.W; x += span) {
      for (let y = -oy; y < view.H; y += span) {
        ctx.drawImage(sprite, x, y, span, span);
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** `value` inside [0, period), however negative it arrived as. */
function wrap(value, period) {
  return ((value % period) + period) % period;
}

/** Bake the tile. The one place in this file that touches a canvas directly. */
function bake() {
  const size = Math.max(1, Math.round(TILE * BAKE));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  // Everything below is said in tile units; the canvas is smaller than that.
  g.scale(BAKE, BAKE);
  g.globalCompositeOperation = 'lighter';

  bakeField(g, CLOUD_FIELD);
  bakeField(g, DUST_FIELD);

  bakes++;
  return canvas;
}

/** One family of clouds: `grid` of them, each jittered inside its own cell. */
function bakeField(g, field) {
  const cellX = TILE / field.grid[0];
  const cellY = TILE / field.grid[1];
  for (let row = 0; row < field.grid[1]; row++) {
    for (let col = 0; col < field.grid[0]; col++) {
      bakeCloud(g,
        (col + 0.5 + visual.range(-JITTER, JITTER)) * cellX,
        (row + 0.5 + visual.range(-JITTER, JITTER)) * cellY,
        field,
        visual.range(field.strength[0], field.strength[1]));
    }
  }
}

/**
 * One cloud: `puffs` soft blobs along a line through its centre, each a different
 * size, all of them added together. The colour is somewhere between the palette's
 * two cloud colours, which is as much variety as a nebula needs - warm means harm
 * (PLAN section 1) and a cloud is not out to get you.
 */
function bakeCloud(g, cx, cy, field, strength) {
  const reach = visual.range(field.reach[0], field.reach[1]) * TILE;
  const angle = visual.next() * TAU;
  const alongX = Math.cos(angle);
  const alongY = Math.sin(angle);
  const colour = mixColors(PALETTE.nebulaDeep, PALETTE.nebulaTeal, visual.next());
  const alpha = field.alpha * strength;

  for (let i = 0; i < field.puffs; i++) {
    const along = visual.range(-1, 1) * reach;
    const across = visual.range(-1, 1) * reach * CLOUD_WIDTH;
    const radius = reach * visual.range(PUFF_SIZE[0], PUFF_SIZE[1]);
    paintWrapped(g,
      cx + alongX * along - alongY * across,
      cy + alongY * along + alongX * across,
      radius, colour, alpha);
  }
}

/**
 * A puff, and its copies on the far side of the tile wherever it reaches past an
 * edge. That is what makes the tile seamless: whatever is cut off on the right
 * arrives on the left, so tiling it in any direction shows no join.
 */
function paintWrapped(g, x, y, radius, colour, alpha) {
  for (const copy of puffCopies(x, y, radius)) {
    puff(g, colour, x + copy[0], y + copy[1], radius, alpha);
  }
}

/**
 * Where a puff standing at `x, y` of `radius` has to be painted to make the tile
 * wrap: itself, plus one copy across every edge it reaches past.
 *
 * Exported for the test and for nobody else: it is the one part of the bake that
 * nothing on screen can vouch for, because a seam would show up as a line across
 * the sky and no headless test can see one.
 */
export function puffCopies(x, y, radius) {
  const copies = [];
  for (let i = 0; i < WRAP.length; i++) {
    const dx = WRAP[i];
    if (x + dx + radius < 0 || x + dx - radius > TILE) continue;
    for (let j = 0; j < WRAP.length; j++) {
      const dy = WRAP[j];
      if (y + dy + radius < 0 || y + dy - radius > TILE) continue;
      copies.push([dx, dy]);
    }
  }
  return copies;
}

/** One soft round blob of gas, added to whatever is already there. */
function puff(g, colour, x, y, radius, alpha) {
  const grad = g.createRadialGradient(x, y, 0, x, y, radius);
  for (let i = 0; i < FALLOFF.length; i++) {
    grad.addColorStop(FALLOFF[i][0], withAlpha(colour, FALLOFF[i][1] * alpha));
  }
  g.fillStyle = grad;
  g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
