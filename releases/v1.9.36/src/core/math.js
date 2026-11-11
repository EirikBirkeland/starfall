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

/**
 * The length of the line (x, y) - the number `Math.hypot(x, y)` answers, and the reason
 * there is a second one of those in here is a byte count and not a style opinion. V8's
 * `Math.hypot` takes any number of arguments, so it lays them out in a list on the heap and
 * throws that list away again on every call: measured with `tools/alloc-probe.js`, it was
 * **2.7 KB of the 3.5 KB a step threw away** with the schedule's crowd on the glass, which is
 * a scavenge of the collector every couple of seconds of play and a hitch a player waits
 * through. Two multiplies, an add and a square root allocate nothing and step faster besides.
 *
 * Two arguments only, which is every call in the game. Unlike `Math.hypot` this does not keep
 * a number from squaring itself into infinity on the way in - the widest line measured here is
 * the diagonal of a 3000 px arena and its square is 9e6, four orders of magnitude below where
 * that would even begin to matter.
 */
export function hypot(x, y) {
  return Math.sqrt(x * x + y * y);
}
