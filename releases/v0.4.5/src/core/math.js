// Small maths helpers shared by the simulation and the renderer.
//
// There is no randomness here on purpose: every random number comes from a named
// stream in core/rng.js, so a run can be replayed from its seed.

export const TAU = Math.PI * 2;

export function clamp(value, low, high) {
  return value < low ? low : (value > high ? high : value);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Squared distance. Comparison only; nobody needs the square root here. */
export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
