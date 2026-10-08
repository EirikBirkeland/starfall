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

/** Give every cue queued since the last drain to `handle`, then clear. */
export function drainCues(handle) {
  for (let i = 0; i < queue.length; i++) handle(queue[i]);
  queue.length = 0;
}

export function clearCues() {
  queue.length = 0;
}
