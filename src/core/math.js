// Small maths helpers shared by the simulation and the renderer.
//
// Randomness goes through Math.random for the moment. Milestone 1 replaces it
// with a seeded generator in core/rng.js so that a run can be replayed.

export const TAU = Math.PI * 2;

/** Random float in [a, b). */
export function rand(a, b) {
  return a + Math.random() * (b - a);
}

/** Random integer in [a, b], both included. */
export function randi(a, b) {
  return Math.floor(rand(a, b + 1));
}

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
