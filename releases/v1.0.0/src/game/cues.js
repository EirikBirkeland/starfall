// Sound cues: the only way the simulation asks for audio.
//
// game/ must not import anything from audio/, so instead of playing a sound the
// simulation queues a cue here and the audio layer drains it once per frame.
//
// **A cue is a record off a pool, and every record a drain hands out is on loan.** A cue used
// to be a fresh object per sound. That looks free and is not: a busy step asks for several - a
// darter's beat, two shots landing, a death and the shards it paid out - and the sound queue
// turned out to be the dearest allocator left in the game once the crowd's distances went through
// `core/math.js`'s own `hypot`. Measured with `tools/alloc-probe.js`, switching these four pushes
// off takes the crowd dying from **984 B to 689 B** a step and the same 200 bodies standing still
// from **574 B to 507 B**, which is three quarters of what separated the two loads. So a record is
// taken from a pool, filled, and handed back the moment the drain that read it is over; once the
// queue has seen its busiest frame it builds nothing again (a real two-minute fight: 4,968 sounds,
// 15 records). It is not free - the pool's bookkeeping and a hand of field writes cost some 46 B a
// step more than making no sound at all - which is the price of keeping the fight audible.
//
// Two rules come with that, and `test/cues.test.mjs` keeps both:
//
//   - **what a drain hands you is borrowed.** Keep a copy (`copyCue`) if you mean to keep one;
//     otherwise the record is refilled with the next frame's sound. A drainer that wants to
//     look at the whole frame before it plays anything - which is what audio/sfx.js does, to
//     spend its voice budget well - gets the batch for the length of the call, which is why
//     `drainCues` hands over the batch and not one cue at a time.
//   - **every queue function writes every field**, the same contract `game/effects.js` keeps
//     for sparks and rings and labels: a noise cue can never be read as the beep that used the
//     record before it.
//
// Nothing may queue a cue from inside a drain - the batch is on its way back to the pool by the
// time the callback returns, so such a cue would be wiped unplayed. Nothing does: the audio
// layer only plays.

import { Pool } from '../core/pool.js';

/** The four kinds of cue, and the only values `kind` ever takes. */
export const BEEP = 'beep';
export const CHORD = 'chord';
export const NOISE = 'noise';
export const MUFFLE = 'muffle';

/**
 * One shape for all four kinds, so a reader never has to guess which of two shapes it is
 * holding and the pool hands out one hidden class instead of four. Fields a kind does not use
 * are wiped rather than left out (see `take`).
 */
function makeCue() {
  return {
    kind: '',
    freq: 0, wave: '', dur: 0, vol: 0, slideTo: 0,  // a tone
    notes: null,                                   // a chord: a balance array, never a copy
    cutoff: 0, sweep: 0, q: 0,                     // a burst of noise (audio/noise.js)
    to: 0, back: 0,                                // the blanket over the music
  };
}

const pool = new Pool(makeCue);

/** Take a record for `kind` and wipe everything the kind does not go on to write. */
function take(kind) {
  const cue = pool.spawn();
  cue.kind = kind;
  cue.freq = 0;
  cue.wave = '';
  cue.dur = 0;
  cue.vol = 0;
  cue.slideTo = 0;
  cue.notes = null;
  cue.cutoff = 0;
  cue.sweep = 0;
  cue.q = 0;
  cue.to = 0;
  cue.back = 0;
  return cue;
}

export function cueBeep(freq, dur, wave, vol, slideTo) {
  const cue = take(BEEP);
  cue.freq = freq;
  cue.dur = dur;
  cue.wave = wave;
  cue.vol = vol;
  cue.slideTo = slideTo;
}

export function cueChord(notes, dur, wave, vol) {
  const cue = take(CHORD);
  cue.notes = notes;
  cue.dur = dur;
  cue.wave = wave;
  cue.vol = vol;
}

/**
 * One burst of noise through a swept low-pass (audio/noise.js): a crack settling into a rumble,
 * or the other way up, a whoosh. `spec` is the sound row's own `noise` line - `{ dur, cutoff,
 * sweep, q }` - and `vol` is priced by whoever is asking, because the shape of an explosion is
 * the same for a swarmling and a boss and its loudness is not.
 */
export function cueNoise(spec, vol) {
  const cue = take(NOISE);
  cue.dur = spec.dur;
  cue.vol = vol;
  cue.cutoff = spec.cutoff;
  cue.sweep = spec.sweep;
  cue.q = spec.q;
}

/**
 * A blanket over the music for a moment: the low-pass on the music's bus is pulled down to `to`
 * hertz and let back up over `back` seconds. PLAN section 5's "a low-pass sweep over the music"
 * - and both numbers come off a balance row like every other sound number, so the simulation is
 * only repeating what its own table said (audio/engine.js).
 */
export function cueMuffle(to, back) {
  const cue = take(MUFFLE);
  cue.to = to;
  cue.back = back;
}

/**
 * Take everything queued since the last call: `handle` is given the whole batch, in the order
 * it was queued, and every cue in it is on loan for exactly as long as the call lasts. When it
 * returns the records go back to the pool and the batch is empty, so a listener that wants to
 * keep a cue copies it (`copyCue`).
 *
 * `handle` must not add to the batch it is handed or keep it: it is the pool's own live list.
 * And the records come home whatever the listener does - including throwing, because a listener
 * that failed halfway through a frame must not leave the queue stuck full and replaying itself
 * on every frame after it.
 */
export function drainCues(handle) {
  if (pool.count === 0) return;
  try {
    handle(pool.items);
  } finally {
    pool.clear();
  }
}

/** Forget everything queued: what a run that just ended asked for is not this run's business. */
export function clearCues() {
  pool.clear();
}

/** A cue worth keeping, as a plain object of its own instead of on loan. */
export function copyCue(cue) {
  return {
    kind: cue.kind,
    freq: cue.freq, wave: cue.wave, dur: cue.dur, vol: cue.vol, slideTo: cue.slideTo,
    notes: cue.notes,
    cutoff: cue.cutoff, sweep: cue.sweep, q: cue.q,
    to: cue.to, back: cue.back,
  };
}

/** How the queue's pool is doing: `{ live, free, made, spawned }`, for a test or the plate. */
export function cueStats() {
  return pool.stats();
}
