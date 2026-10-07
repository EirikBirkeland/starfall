// The energy wall at the edge of the arena (PLAN section 4).
//
// Only the parts of it the window can see are drawn, which on a 3000 px world is
// usually one edge and sometimes none. Each visible edge is the same line stroked
// three times - wide and faint, medium, thin and bright - which is how every other
// light in this game looks like light without asking the canvas for a blur
// (see render/glow.js for the sprite version of the trick), plus a row of ticks
// reaching into the arena so it reads as a field and not as a border.
//
// Nothing here is simulated or remembered: the wall is drawn from the arena's
// size and the camera's, every frame.

import { PALETTE, withAlpha } from '../core/palette.js';
import { world } from '../game/world.js';
import { camera } from './camera.js';

const REACH = 24;          // an edge is still drawn this far past the window's edge
const LINE_WIDTH = 2;
const MID_WIDTH = 6;
const SOFT_WIDTH = 16;
const LINE_LIGHT = 0.5;    // the alpha the bright line lands at
const MID_LIGHT = 0.14;
const SOFT_LIGHT = 0.06;
const TICK_SPACING = 48;   // px along the wall between two ticks
const TICK_DEPTH = 10;     // how far in they reach
const TICK_WIDTH = 2;
const TICK_LIGHT = 0.3;
const BREATH = 0.14;       // how much the whole wall brightens and dims
const BREATH_RATE = 1.4;   // and how fast, in radians per second

// The four sides, filled in afresh each frame. Pre-allocated because a frame that
// draws nothing should still allocate nothing.
const SIDES = [
  { horizontal: true, at: 0, from: 0, to: 0, inward: 1 },
  { horizontal: true, at: 0, from: 0, to: 0, inward: -1 },
  { horizontal: false, at: 0, from: 0, to: 0, inward: 1 },
  { horizontal: false, at: 0, from: 0, to: 0, inward: -1 },
];
let sideCount = 0;

function addSide(horizontal, at, from, to, inward) {
  const across = horizontal ? camera.y : camera.x;
  const beyond = horizontal ? camera.y + camera.h : camera.x + camera.w;
  if (at < across - REACH || at > beyond + REACH) return;
  if (to <= from) return;

  const side = SIDES[sideCount];
  side.horizontal = horizontal;
  side.at = at;
  side.from = from;
  side.to = to;
  side.inward = inward;
  sideCount++;
}

/** Which of the arena's four edges the window can see, and how much of each. */
function collectSides() {
  const arena = world.arena;
  sideCount = 0;

  const left = Math.max(camera.x - REACH, 0);
  const right = Math.min(camera.x + camera.w + REACH, arena.w);
  const top = Math.max(camera.y - REACH, 0);
  const bottom = Math.min(camera.y + camera.h + REACH, arena.h);

  addSide(true, 0, left, right, 1);
  addSide(true, arena.h, left, right, -1);
  addSide(false, 0, top, bottom, 1);
  addSide(false, arena.w, top, bottom, -1);
}

function traceSide(ctx, side) {
  ctx.beginPath();
  if (side.horizontal) {
    ctx.moveTo(side.from, side.at);
    ctx.lineTo(side.to, side.at);
  } else {
    ctx.moveTo(side.at, side.from);
    ctx.lineTo(side.at, side.to);
  }
}

/**
 * The ticks, on the world's own grid rather than on the visible stretch, so the
 * ones at a corner of the arena line up with the ones on the wall next to it.
 */
function drawTicks(ctx, side, light) {
  const first = Math.ceil(side.from / TICK_SPACING) * TICK_SPACING;
  if (first > side.to) return;

  ctx.beginPath();
  for (let along = first; along <= side.to; along += TICK_SPACING) {
    if (side.horizontal) {
      ctx.moveTo(along, side.at);
      ctx.lineTo(along, side.at + side.inward * TICK_DEPTH);
    } else {
      ctx.moveTo(side.at, along);
      ctx.lineTo(side.at + side.inward * TICK_DEPTH, along);
    }
  }
  ctx.lineWidth = TICK_WIDTH;
  ctx.strokeStyle = withAlpha(PALETTE.wallTick, TICK_LIGHT * light);
  ctx.stroke();
}

/** The wall, in arena coordinates, with the camera transform already applied. */
export function drawWalls(ctx) {
  collectSides();
  if (sideCount === 0) return;

  const breath = 1 - BREATH / 2 + BREATH / 2 * Math.sin(world.time * BREATH_RATE);
  for (let i = 0; i < sideCount; i++) {
    const side = SIDES[i];
    traceSide(ctx, side);

    ctx.lineWidth = SOFT_WIDTH;
    ctx.strokeStyle = withAlpha(PALETTE.wall, SOFT_LIGHT * breath);
    ctx.stroke();

    ctx.lineWidth = MID_WIDTH;
    ctx.strokeStyle = withAlpha(PALETTE.wall, MID_LIGHT * breath);
    ctx.stroke();

    ctx.lineWidth = LINE_WIDTH;
    ctx.strokeStyle = withAlpha(PALETTE.wall, LINE_LIGHT * breath);
    ctx.stroke();

    drawTicks(ctx, side, breath);
  }
}
