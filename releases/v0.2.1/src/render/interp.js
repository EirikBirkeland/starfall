// Where a moving thing gets painted.
//
// The simulation advances in fixed steps and every moving entity keeps the place
// it stood at the start of the step just taken in px/py. A frame is drawn part
// way through the step that has not happened yet, so an entity is painted part
// way between px/py and x/y; main.js works that fraction out (alpha) and hands
// it down with every draw call. At alpha 1 a frame shows exactly the simulation
// state, which is what a headless run sees.
//
// What is deliberately not interpolated: the shockwave rings and the floating
// score labels. A ring expands and a label drifts, but one step of either is a
// pixel at most, so they are drawn straight from the simulation state. Nothing
// may depend on that difference.

import { lerp } from '../core/math.js';

/** The x a frame draws `entity` at, `alpha` of the way from the last step to this one. */
export function paintX(entity, alpha) {
  return lerp(entity.px, entity.x, alpha);
}

/** The y a frame draws `entity` at. See paintX. */
export function paintY(entity, alpha) {
  return lerp(entity.py, entity.y, alpha);
}
