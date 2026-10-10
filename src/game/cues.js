// Sound cues: the only way the simulation asks for audio.
//
// game/ must not import anything from audio/, so instead of playing a sound the
// simulation appends a cue here and the audio layer drains it once per frame.
// A headless run leaves the list empty and costs nothing.

const queue = [];

export function cueBeep(freq, dur, wave, vol, slideTo) {
  queue.push({ kind: 'beep', freq, dur, wave, vol, slideTo });
}

export function cueChord(notes, dur, wave, vol) {
  queue.push({ kind: 'chord', notes, dur, wave, vol });
}

/**
 * One burst of noise through a swept low-pass (audio/noise.js): a crack settling into a
 * rumble, or the other way up, a whoosh. `spec` is the sound row's own `noise` line -
 * `{ dur, cutoff, sweep }` - and `vol` is priced by whoever is asking, because the shape of
 * an explosion is the same for a swarmling and a boss and its loudness is not.
 */
export function cueNoise(spec, vol) {
  queue.push({ kind: 'noise', dur: spec.dur, vol, cutoff: spec.cutoff, sweep: spec.sweep, q: spec.q });
}

/**
 * A blanket over the music for a moment: the low-pass on the music's bus is pulled down to
 * `to` hertz and let back up over `back` seconds. PLAN section 5's "a low-pass sweep over
 * the music" - and both numbers come off a balance row like every other sound number, so
 * the simulation is only repeating what its own table said (audio/engine.js).
 */
export function cueMuffle(to, back) {
  queue.push({ kind: 'muffle', to, back });
}

/** Give every cue queued since the last drain to `handle`, then clear. */
export function drainCues(handle) {
  for (let i = 0; i < queue.length; i++) handle(queue[i]);
  queue.length = 0;
}

export function clearCues() {
  queue.length = 0;
}
