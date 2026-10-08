// Where the camera is, and what it means.
//
// The arena is bigger than the window (PLAN section 4), so everything in the game
// is drawn through this transform and the controls have to be turned back through
// it: the mouse speaks in pixels on the glass, the simulation speaks in arena
// coordinates, and `resolveAim` is the one place that translates.
//
// The camera is not simulated. Nothing in game/ reads it; it reads the world once
// per frame - at the frame's `alpha`, so it travels with everything else that is
// drawn - and it is allowed to be a frame out of date without anything noticing.
//
// It follows the ship one for one, which is what keeps the ship rock steady in the
// middle of a fast game, and leans a little towards wherever the ship is aiming,
// so the view shows a touch more of what you are pointing at.

import { view } from './canvas.js';
import { world } from '../game/world.js';
import { STATE } from '../game/state.js';
import { clamp } from '../core/math.js';
import { paintX, paintY } from './interp.js';

// The camera's eye, not the game's balance.
const LEAN_FRACTION = 0.16;   // of the way from the ship to what it is aiming at
const LEAN_MAX = 150;         // px, so the ship never ends up pinned to an edge
const LEAN_SETTLE = 0.0006;   // this share of the gap is left after one second
const CULL_PAD = 72;          // things are drawn this far past the edge they show at

/** Where the screen is looking, in arena coordinates. */
export const camera = {
  x: 0, y: 0,        // the arena point in the top-left corner of the window
  cx: 0, cy: 0,      // the arena point in the middle of it
  w: 0, h: 0,        // how much arena the window shows
  leanX: 0, leanY: 0,
};

/** Keep a span of `size` inside `total`, centred on `at`; centre it if it will not fit. */
function spanCentre(at, size, total) {
  if (size >= total) return total / 2;
  return clamp(at, size / 2, total - size / 2);
}

/** Put the middle of the view on an arena point, with the size the window has. */
function centreOn(x, y) {
  camera.w = view.W;
  camera.h = view.H;
  camera.cx = spanCentre(x, camera.w, world.arena.w);
  camera.cy = spanCentre(y, camera.h, world.arena.h);
  camera.x = camera.cx - camera.w / 2;
  camera.y = camera.cy - camera.h / 2;
}

/**
 * Put the camera straight back on the ship and let go of the lean.
 *
 * A real play session is a page that has never drawn a frame, so its camera is
 * always already on the ship and its lean always already nothing. Anything that
 * plays a second run on one boot has to say the same thing, or the new run starts
 * with the camera a hair off wherever the last one died - which is why the headless
 * harness calls this, next to the clock reset it sits beside.
 */
export function snapCamera() {
  camera.leanX = 0;
  camera.leanY = 0;
  centreOn(world.player.x, world.player.y);
}

/**
 * Follow the ship and settle the lean. Once per frame, before anything is drawn.
 * `input` is the frame's input descriptor, whose aim is already in arena coordinates.
 */
export function followCamera(dt, alpha, input) {
  const ship = world.player;
  const shipX = paintX(ship, alpha);
  const shipY = paintY(ship, alpha);

  // Only a run in progress leans. On the title screen the view sits still in the
  // middle of the arena behind the logo, wherever the mouse happens to be.
  let wantX = 0;
  let wantY = 0;
  if (world.state === STATE.PLAY && input) {
    wantX = clamp((input.aimX - shipX) * LEAN_FRACTION, -LEAN_MAX, LEAN_MAX);
    wantY = clamp((input.aimY - shipY) * LEAN_FRACTION, -LEAN_MAX, LEAN_MAX);
  }
  // A frame's worth of settling, measured the way every other eased thing here is:
  // a share left over after one second, so it costs the same on any display.
  const settle = 1 - Math.pow(LEAN_SETTLE, dt);
  camera.leanX += (wantX - camera.leanX) * settle;
  camera.leanY += (wantY - camera.leanY) * settle;

  centreOn(shipX + camera.leanX, shipY + camera.leanY);
}

/**
 * Turn the controls' screen pixels into arena coordinates, in place. Called once
 * per frame with the frame's input, before any of it reaches the simulation.
 */
export function resolveAim(input) {
  input.aimX = camera.x + input.aimX;
  input.aimY = camera.y + input.aimY;
}

/** Where an arena point lands on the screen. The headless bot aims this way. */
export function screenX(arenaX) {
  return arenaX - camera.x;
}

export function screenY(arenaY) {
  return arenaY - camera.y;
}

/**
 * Whether a point is anywhere the window can see, with room for a halo and for
 * whatever is heading this way. Everything drawn in the arena asks this first;
 * on a 3000 px world most of it is not.
 */
export function onScreen(x, y, pad = CULL_PAD) {
  return x > camera.x - pad && x < camera.x + camera.w + pad
    && y > camera.y - pad && y < camera.y + camera.h + pad;
}
