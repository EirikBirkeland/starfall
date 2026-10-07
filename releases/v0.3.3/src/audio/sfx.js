// Synthesised sound effects. The simulation never plays anything: it queues a
// cue (game/cues.js) and this module turns the queue into oscillator voices.

import { STATE } from '../game/state.js';
import { drainCues } from '../game/cues.js';
import { getContext, getMaster, isMuted } from './engine.js';

function beep(freq, dur, wave, vol, slideTo) {
  const actx = getContext();
  if (!actx || isMuted()) return;
  try {
    if (actx.state === 'suspended' && actx.resume) actx.resume();
    const t0 = actx.currentTime;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = wave || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(24, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol || 0.15), t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(getMaster());
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  } catch (err) {
    // One dropped voice is not worth losing a frame over.
  }
}

function chord(notes, dur, wave, vol) {
  for (let i = 0; i < notes.length; i++) {
    const freq = notes[i];
    const delay = i * 70;
    setTimeout(function () { beep(freq, dur, wave || 'triangle', vol || 0.14); }, delay);
  }
}

/** Play every cue queued since the last call. Nothing is played on the title. */
export function consumeCues(state) {
  drainCues(function (cue) {
    if (state === STATE.START) return;
    if (cue.kind === 'beep') beep(cue.freq, cue.dur, cue.wave, cue.vol, cue.slideTo);
    else if (cue.kind === 'chord') chord(cue.notes, cue.dur, cue.wave, cue.vol);
  });
}
