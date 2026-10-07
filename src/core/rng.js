// All randomness in the game comes from here (PLAN section 2), so that a run can
// be replayed exactly from its seed.
//
// There are three streams and they are deliberately separate:
//
//   logic   every number that can change the simulation. `startRun` reseeds it
//           from `world.seed`, so a seed always plays the same run.
//   fx      the numbers the *simulation's* cosmetics draw: how a spray of sparks
//           scatters, which way a chip tumbles. Reseeded with every run like
//           `logic`, so a replay sprays the same, but a burst with one more spark
//           in it cannot move a shot that was already in flight.
//   visual  star twinkle, thruster flicker, screen shake. The simulation never
//           reads it, so changing the art cannot move a run.
//
// `Math.random` appears exactly once in this file: the draw that chooses a seed
// for a visit that did not ask for one. Everything else is a stream.

const GOLDEN = 0x9E3779B9;    // 2^32 / phi: successive seeds land far apart
const INCREMENT = 0x6D2B79F5; // the step between one counter value and the next
const WARMUP = 4;             // numbers thrown away after a reseed
const UINT32 = 4294967296;

/** Scramble a number so that neighbours (seed 1, 2, 3) give unrelated streams. */
function scramble(value) {
  let z = (value + GOLDEN) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

/** A small, fast, completely repeatable generator (mulberry32). */
export class Rng {
  /** `salt` keeps two streams built from the same seed apart. */
  constructor(salt) {
    this.salt = salt >>> 0;
    this.reset(0);
  }

  /** Start the stream over from `seed`. */
  reset(seed) {
    this.state = scramble((seed >>> 0) ^ this.salt);
    for (let i = 0; i < WARMUP; i++) this.next();
  }

  /** The next number, evenly spread over [0, 1). */
  next() {
    this.state = (this.state + INCREMENT) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  }

  /** Uniformly between `min` and `max`. */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** Uniform whole number from `min` to `max`, both included. */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True about `p` of the time. */
  chance(p) {
    return this.next() < p;
  }

  /** One element of a non-empty array. */
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }
}

/** The stream the simulation reads. Reseeded at the start of every run. */
export const logic = new Rng(0x5d7f1a3b);

/** The stream the renderer reads. Nothing in `game/` may use it. */
export const visual = new Rng(0x2c9e6f07);

/** The stream the simulation reads for anything nobody can win or lose on. */
export const fx = new Rng(0x4b8c31e9);

let currentSeed = null;

/** Fix every stream to a seed, and return the seed that is now in play. */
export function setSeed(seed) {
  currentSeed = seed >>> 0;
  logic.reset(currentSeed);
  fx.reset(currentSeed);
  visual.reset(currentSeed);
  return currentSeed;
}

/** The seed in play, or null while nobody has picked one. */
export function getSeed() {
  return currentSeed;
}

/**
 * A seed nobody could guess, for a visit that did not ask for one. This is the
 * one unseeded draw in the game: something has to choose the first seed.
 */
export function randomSeed() {
  const clock = scramble(Date.now() & 0xffffffff);
  const noise = Math.floor(Math.random() * UINT32);
  return (clock ^ noise) >>> 0;
}
