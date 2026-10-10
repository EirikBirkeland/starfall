// The noise: the part of the game's sound that is not an oscillator.
//
// PLAN section 5 asks for "oscillators, noise buffers, and envelopes", and until now there
// were only oscillators. Every explosion in the game is a sawtooth sliding down at the
// same time as its own harmonics, which is a passable imitation of a thing falling over and
// no imitation at all of air: a bomber going off, a dash past your ear and a hull taking a
// hit are all *broadband*, which means every frequency at once, and no number of sweeping
// one frequency makes that.
//
// So: one buffer of noise, filled once, and a voice that plays a slice of it through a
// low-pass that is swept by the same envelope that fades it out. That sweep is what makes
// an explosion an explosion rather than a hiss - the filter closes as the sound dies, so it
// starts as a crack and ends as a rumble - and opening it the other way is a whoosh, which
// is the same instrument read backwards.
//
// **Why the fill is `Math.random` and not `core/rng.js`.** The seeded generator belongs to
// the simulation: it is what makes a run replayable from its seed, and every number drawn
// from it moves the run. Audio is not the simulation - a run played with the sound off has
// to be the same run as one played with it on, down to the last shard - so nothing in this
// folder may draw from it, and this is the one place in the game that has to say so out loud.
//
// **Why one buffer and not one per sound.** The buffer is two seconds of nothing in
// particular; what makes each of these sounds a different sound is its filter, its length,
// and its own slice of the buffer - which starts at a random point, so that thirty deaths do
// not play the thirty identical microseconds of hiss. Two seconds of it is ninety-odd
// thousand samples, a float each: about a third of a megabyte, filled once in well under a
// millisecond, on the first voice that needs it.

import { MIX } from './mix.js';

/** Seconds of noise in the buffer, and the default resonance of a voice's low-pass. */
const SECONDS = 2;
const DEFAULT_Q = 0.9;
/** The lowest a swept cutoff may land on, so a ramp never asks for zero hertz. */
const FLOOR = 30;

let owner = null;      // the context `buffer` was built on
let buffer = null;     // null means "not built yet", and also "this machine cannot build one"
let voices = 0;        // what has been voiced, which the tests and the sim tool read

/** Can this machine hold a buffer and play one back at all? */
function able(actx) {
  return !!actx && typeof actx.createBuffer === 'function'
    && typeof actx.createBufferSource === 'function';
}

/**
 * The shared noise buffer, built once on `actx`.
 *
 * Answers null on a machine with no buffers in it, which is treated the way the engine
 * treats a machine with no compressor: the game is older than this and still has to be able
 * to make a sound (audio/engine.js).
 */
function noiseBuffer(actx) {
  if (!able(actx)) return null;
  if (owner === actx) return buffer;

  const rate = actx.sampleRate > 0 ? actx.sampleRate : 44100;
  const built = actx.createBuffer(1, Math.floor(rate * SECONDS), rate);
  const data = built.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  owner = actx;
  buffer = built;
  return buffer;
}

/**
 * One burst of noise on `bus`.
 *
 * `spec` is `{ dur, cutoff, sweep, q }`: how long it lasts, where its low-pass starts, where
 * the sweep leaves it, and how resonant the filter is on the way. `cutoff` above `sweep` is
 * a sound closing - a crack settling into a rumble, which is an explosion - and below it is
 * a sound opening, which is a whoosh.
 *
 * Answers whether the voice was started, so a caller can tell a silent old browser from a
 * sound it decided not to play.
 */
export function noiseVoice(actx, bus, vol, spec) {
  try {
    const buf = noiseBuffer(actx);
    if (!buf) return false;
    const t0 = actx.currentTime;
    const len = spec.dur;

    const src = actx.createBufferSource();
    src.buffer = buf;
    // Looping, so a sound longer than the buffer cannot run dry halfway through it, and
    // started somewhere inside it, so no two of them are the same grain of hiss.
    src.loop = true;

    const filter = actx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = spec.q > 0 ? spec.q : DEFAULT_Q;
    filter.frequency.setValueAtTime(spec.cutoff, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(FLOOR, spec.sweep), t0 + len);

    const gain = actx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    // A harder attack than an oscillator gets (audio/sfx.js rises over a hundredth of a
    // second): noise is the part of these sounds that arrives all at once, and a slower rise
    // than this would be a swell and not a crack.
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + len);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    src.start(t0, Math.random() * SECONDS);
    // The same tail the voice budget prices a voice for, so the schedule and the books agree
    // about how long this thing can be heard (audio/mix.js).
    src.stop(t0 + len + MIX.tail);
  } catch (err) {
    // One dropped voice is not worth losing a frame over - and that includes a machine that
    // throws on being handed a buffer at all (audio/sfx.js says the same thing).
    return false;
  }
  voices++;
  return true;
}

/** How many noise voices have been voiced, ever (test/noise.test.mjs, tools/simulate.js). */
export function noiseVoices() {
  return voices;
}
