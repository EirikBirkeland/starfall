// The box the ship is kept inside.
//
// Most of the time that box is the whole arena and nothing here does anything
// interesting. While a boss is in the arena it is the cage that boss closed round the
// duel (PLAN 3.4's arena lock, game/bosses.js), and the ship cannot leave it: a boss
// fight has a room, and running to the far side of the world is not a way of fighting
// one.
//
// Two rules keep this small enough to trust:
//
//   **Only the ship is kept in.** The crowd walks at the ship, so every body in the arena
//     is already inside or on its way, and snapping a spitter that had been hanging about
//     in the far corner to the nearest point of the new room would teleport it across the
//     world in one step. Bodies that keep themselves off a wall (game/kinds.js
//     `heldByTheWall`) still keep themselves off the arena's, which is the honest limit of
//     what a cage that arrives mid-run can promise.
//
//   **The box is written into, never replaced.** `world.field` is one object for the life
//     of the world and its four numbers are what change, so anything holding a reference
//     to it - and a system that clamps every step is going to want to - is never left
//     reading a box that is no longer the live one.
//
// The numbers are the box's *inside* edges: a body of radius `r` is held with its centre
// between `x0 + r` and `x1 - r`, which is how the arena's own walls have always held it.

import { clamp } from '../core/math.js';

/**
 * Put the box back to the whole arena. `resetRun` calls this before anything in the new
 * run can look at it, and a boss going down calls it too, so "no cage" is one call and
 * not a field being set to null in two places.
 */
export function openField(world) {
  const box = world.field;
  box.x0 = 0;
  box.y0 = 0;
  box.x1 = world.arena.w;
  box.y1 = world.arena.h;
}

/**
 * Close the box. `box` is four numbers somebody decided on (game/bosses.js `cageBox`);
 * they are copied, not kept, so the caller may hand over a scratch object and reuse it.
 */
export function closeField(world, box) {
  const field = world.field;
  field.x0 = box.x0;
  field.y0 = box.y0;
  field.x1 = box.x1;
  field.y1 = box.y1;
}

/** Is there a cage up at all - i.e. is the ship's room smaller than the world. */
export function fieldIsCaged(world) {
  const box = world.field;
  return box.x0 !== 0 || box.y0 !== 0 || box.x1 !== world.arena.w || box.y1 !== world.arena.h;
}

/**
 * Hold a body inside the live box by its own radius, in place. Answers whether it had to
 * move, which is how a caller that stops doing something when it hits a wall knows that
 * it has (game/kinds.js ends a darter's lunge on it).
 */
export function holdInField(world, body, r) {
  const box = world.field;
  const x = clamp(body.x, box.x0 + r, box.x1 - r);
  const y = clamp(body.y, box.y0 + r, box.y1 - r);
  if (x === body.x && y === body.y) return false;
  body.x = x;
  body.y = y;
  return true;
}
