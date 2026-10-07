// The arrows pinned to the edge of the window (PLAN section 4).
//
// The arena is several times the size of the window and a wave arrives off one
// bearing, so most of what is on its way to you is somewhere you are not looking.
// An arrow says which way.
//
// Two honest questions decide whether a body gets one, and the renderer already
// asks the first of them for itself:
//
//   is it off the window   - the same `onScreen` test every draw call uses, so an
//                            arrow appears exactly when the body behind it stops
//                            being drawn and not a moment sooner
//   is it worth an arrow   - a body is worth what the wave director already says it
//                            is worth, its spawn `cost` (a drifter 2, a tank 8),
//                            faded out by how far away it stands. A far crowd is a
//                            rumour; one at the edge of the glass is a shout.
//
// Then the bodies are grouped by the direction they are in and one arrow is drawn
// per direction, so forty enemies off to the left are one bright arrow and not
// forty of them. An arrow points at the weighted middle of its group rather than at
// its own slice of the compass, so a cluster straddling two slices points at the
// cluster.
//
// Nothing is remembered between frames except how loud each direction currently is,
// which is eased: an arrow arrives and leaves instead of blinking on and off. This
// is the eye's business and not the run's - it reads no random stream, so a seed
// cannot notice it.

import { PALETTE, withAlpha } from '../core/palette.js';
import { clamp, TAU } from '../core/math.js';
import { world } from '../game/world.js';
import { camera, onScreen } from './camera.js';
import { view } from './canvas.js';
import { paintX, paintY } from './interp.js';
import { glowFor, paintGlow } from './glow.js';

// How many directions an arrow may point in.
const SECTORS = 12;
const SLICE = TAU / SECTORS;

// How much of a crowd makes an arrow shout, and how little makes it not worth
// drawing at all. Both are counted in the wave director's units - points of enemy,
// 2 for a drifter and 8 for a tank - because that is already the game's own opinion
// of how much a body matters.
const ARROW_FULL = 16;
const ARROW_FLOOR = 1.5;
// How far off a body stops being worth an arrow, as a share of the window's own
// diagonal: worth full weight out to NEAR, nothing by FAR. Half a diagonal is past
// the edge of the window, so a wave that has just arrived off the edge is nearly a
// whole arrow already and gets louder as it walks in.
const NEAR_SHARE = 0.5;
const FAR_SHARE = 1.2;

// The arrow itself. Warm, because it points at a thing that wants you dead, and
// the same two-tone red as a darter's warning line: a wide soft pass under a thin
// bright one, plus one glow sprite (render/glow.js). None of this is balance.
// EDGE_INSET is exported so a test can say where an arrow belongs instead of
// repeating the number and quietly drifting from it.
export const EDGE_INSET = 26;  // px in from the glass the arrow is pinned to
const LIGHT = 0.75;            // how bright a full one is at the top of its fade
const LOUD_SHARE = 0.3;        // and how faint the quietest one drawn may be
const MIN_SIZE = 7;            // px, half-height of the smallest chevron
const MAX_SIZE = 13;           // ... and of the biggest
const GLOW_REACH = 15;         // px of light behind it
const GLOW_LIGHT = 0.55;       // ... how much of that the sprite is stamped at
const SOFT_WIDTH = 5;          // px, the wide pass
const THIN_WIDTH = 1.6;        // px, the line over it
const SETTLE = 1e-10;          // this share of the gap is left after one second
const FLOOR_LIGHT = 0.02;      // below this an arrow is not drawn at all

/**
 * One slot per direction, refilled every frame. `threat` is how many points of
 * enemy are that way and `dirX`/`dirY` their weighted sum of directions (still
 * unnormalised); `aimX`/`aimY` is that direction settled and normalised, and it is
 * what the arrow is drawn from - kept over the frames an arrow is fading out, so a
 * body crossing back onto the glass does not leave an arrow pointing nowhere.
 * `level` is the eased 0..1 the arrow's size and brightness come from.
 */
const SLOTS = [];
for (let i = 0; i < SECTORS; i++) {
  SLOTS.push({ threat: 0, dirX: 0, dirY: 0, aimX: 0, aimY: 0, level: 0 });
}

/** Where the rim point lands, hoisted so a frame that draws nothing allocates nothing. */
const POINT = { x: 0, y: 0 };

let drawn = 0;

/** The scratch list `collectIndicators` just filled. Exported for the tests; do not keep it. */
export function indicatorSlots() {
  return SLOTS;
}

/** How many arrows the last frame drew. For the F3 overlay (milestone 10). */
export function arrowCount() {
  return drawn;
}

/** Forget every arrow. A new run is played by a window that is not pointing anywhere. */
export function resetIndicators() {
  for (let i = 0; i < SECTORS; i++) {
    const slot = SLOTS[i];
    slot.threat = 0;
    slot.dirX = 0;
    slot.dirY = 0;
    slot.aimX = 0;
    slot.aimY = 0;
    slot.level = 0;
  }
  drawn = 0;
}

/** Which slice of the compass an angle falls in. atan2 hands back (-pi, pi]. */
function sectorOf(angle) {
  const index = Math.floor((angle + Math.PI) / SLICE);
  if (index < 0) return 0;
  if (index >= SECTORS) return SECTORS - 1;
  return index;
}

/** What a body `distance` away is worth: everything nearby, nothing beyond `far`. */
function fade(distance, near, far) {
  if (distance <= near) return 1;
  if (distance >= far) return 0;
  return 1 - (distance - near) / (far - near);
}

/**
 * Fill the direction list from a crowd, in arena coordinates: `source` is any array
 * of enemies, (shipX, shipY) is where the ship stands among them, and `alpha` is the
 * frame's interpolation fraction (render/interp.js). Answers how many directions are
 * worth an arrow; the list is `indicatorSlots()`.
 */
export function collectIndicators(source, shipX, shipY, alpha) {
  const reach = Math.hypot(camera.w, camera.h);
  const near = reach * NEAR_SHARE;
  const far = reach * FAR_SHARE;

  for (let i = 0; i < SECTORS; i++) {
    const slot = SLOTS[i];
    slot.threat = 0;
    slot.dirX = 0;
    slot.dirY = 0;
  }

  for (let i = 0; i < source.length; i++) {
    const enemy = source[i];
    const x = paintX(enemy, alpha);
    const y = paintY(enemy, alpha);
    // You can already see it, or its halo: no arrow for a thing on the glass.
    if (onScreen(x, y)) continue;

    const dx = x - shipX;
    const dy = y - shipY;
    const distance = Math.hypot(dx, dy);
    if (distance <= 1) continue;

    const weight = enemy.kind.stats.cost * fade(distance, near, far);
    if (weight <= 0) continue;

    const slot = SLOTS[sectorOf(Math.atan2(dy, dx))];
    slot.threat += weight;
    slot.dirX += (dx / distance) * weight;
    slot.dirY += (dy / distance) * weight;
  }

  let live = 0;
  for (let i = 0; i < SECTORS; i++) {
    const slot = SLOTS[i];
    if (slot.threat <= 0) continue;
    const length = Math.hypot(slot.dirX, slot.dirY);
    if (length <= 0) continue;
    slot.aimX = slot.dirX / length;
    slot.aimY = slot.dirY / length;
    if (slot.threat >= ARROW_FLOOR) live++;
  }
  return live;
}

/**
 * Where a ray out of the ship crosses the window, pulled `inset` px away from the
 * glass so the arrow stays clear of the corner text and of a rounded screen corner.
 * The ship itself is pulled inside the same box first: hugging a wall of the world it
 * can stand closer to the edge of the window than that, and an arrow pointing back
 * over its shoulder then lands on the edge beside it rather than nowhere at all.
 */
function rimPoint(shipX, shipY, dirX, dirY, inset) {
  const left = inset;
  const right = view.W - inset;
  const top = inset;
  const bottom = view.H - inset;
  const fromX = clamp(shipX, left, right);
  const fromY = clamp(shipY, top, bottom);
  let t = Infinity;
  if (dirX > 1e-6) t = (right - fromX) / dirX;
  else if (dirX < -1e-6) t = (left - fromX) / dirX;
  if (dirY > 1e-6) t = Math.min(t, (bottom - fromY) / dirY);
  else if (dirY < -1e-6) t = Math.min(t, (top - fromY) / dirY);
  if (!Number.isFinite(t) || t < 0) t = 0;
  POINT.x = fromX + dirX * t;
  POINT.y = fromY + dirY * t;
}

/**
 * Draw the arrows. Screen space, after the camera and the shake have been put back
 * the way they were found: an arrow belongs to the glass and must not slide off the
 * edge it is pointing at when the frame shakes.
 */
export function drawIndicators(ctx, dt, alpha) {
  const ship = world.player;
  const shipX = paintX(ship, alpha);
  const shipY = paintY(ship, alpha);
  collectIndicators(world.enemies, shipX, shipY, alpha);

  // The bearing is the same in either coordinate system - screen is arena shifted by
  // the camera - but the rim is a place on the glass, so the ray starts here.
  const glassX = shipX - camera.x;
  const glassY = shipY - camera.y;
  const inset = Math.min(EDGE_INSET, view.W / 2, view.H / 2);
  const ease = 1 - Math.pow(SETTLE, dt);
  const glow = glowFor(PALETTE.red, GLOW_REACH);

  drawn = 0;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < SECTORS; i++) {
    const slot = SLOTS[i];
    const want = slot.threat >= ARROW_FLOOR ? Math.min(1, slot.threat / ARROW_FULL) : 0;
    slot.level += (want - slot.level) * ease;
    if (slot.level <= FLOOR_LIGHT) continue;

    const length = Math.hypot(slot.aimX, slot.aimY);
    if (length <= 0) continue;
    const dirX = slot.aimX / length;
    const dirY = slot.aimY / length;
    rimPoint(glassX, glassY, dirX, dirY, inset);

    const size = MIN_SIZE + (MAX_SIZE - MIN_SIZE) * slot.level;
    const light = LIGHT * (LOUD_SHARE + (1 - LOUD_SHARE) * slot.level);

    ctx.save();
    ctx.translate(POINT.x, POINT.y);
    ctx.rotate(Math.atan2(dirY, dirX));
    paintGlow(ctx, glow, 0, 0, light * GLOW_LIGHT, 0.6 + 0.4 * slot.level);

    ctx.beginPath();
    ctx.moveTo(-size * 0.5, -size);
    ctx.lineTo(size * 0.8, 0);
    ctx.lineTo(-size * 0.5, size);
    ctx.lineWidth = SOFT_WIDTH;
    ctx.strokeStyle = withAlpha(PALETTE.red, light * 0.4);
    ctx.stroke();
    ctx.lineWidth = THIN_WIDTH;
    ctx.strokeStyle = withAlpha(PALETTE.telegraph, light);
    ctx.stroke();
    ctx.restore();
    drawn++;
  }
  ctx.restore();
}
