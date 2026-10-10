// Synthesised sound effects. The simulation never plays anything: it queues a cue
// (game/cues.js) and this module turns the queue into voices - oscillators and bursts of
// noise (audio/noise.js) - every one of them landing on the effects bus (audio/engine.js)
// so the music can be balanced against the fight without touching it.
//
// One frame's worth of cues is one mix, and it is spent the way a mix is spent: the loud
// things first, and the quiet ones only for as far as the voice budget will stretch
// (audio/mix.js). Everything here is one voice at a time - the budget prices a voice, not a
// cue - and a voice it turns away is a voice nobody would have heard under the ones that got
// there first.

import { STATE } from '../game/state.js';
import { drainCues } from '../game/cues.js';
import { getContext, getSfxBus, isMuted, muffleMusic } from './engine.js';
import { noiseVoice } from './noise.js';
import { loudnessOf, takeVoice } from './mix.js';

/** The shortest a voice can be scheduled for, and what a cue that names no length gets. */
const MIN_DUR = 0.05;

function beep(freq, dur, wave, vol, slideTo, must) {
  const actx = getContext();
  if (!actx || isMuted()) return;
  const loud = loudnessOf(vol);
  const len = dur > 0 ? dur : MIN_DUR;
  // The price is paid on the audio clock, which is the clock this voice is about to be
  // scheduled on - so a voice that gets played is counted against the mix for exactly as
  // long as it can be heard and not one frame longer.
  if (!takeVoice(loud, len, actx.currentTime, must)) return;
  try {
    if (actx.state === 'suspended' && actx.resume) actx.resume();
    const t0 = actx.currentTime;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = wave || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(24, slideTo), t0 + len);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, loud), t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    osc.connect(gain);
    gain.connect(getSfxBus());
    osc.start(t0);
    osc.stop(t0 + len + 0.03);
  } catch (err) {
    // One dropped voice is not worth losing a frame over.
  }
}

function chord(notes, dur, wave, vol) {
  for (let i = 0; i < notes.length; i++) {
    const freq = notes[i];
    const delay = i * 70;
    // A chime is never turned away. The three notes of a level-up are the run telling you
    // something about itself and not another tick in the mud, and a chime that arrives with
    // a full sky is the one a player was waiting for (audio/mix.js).
    setTimeout(function () { beep(freq, dur, wave || 'triangle', vol || 0.14, 0, true); }, delay);
  }
}

/**
 * One burst of noise (audio/noise.js): `vol` of it through a low-pass swept from `cutoff`
 * to `sweep` over `dur` seconds. The same budget, the same bus and the same rules as `beep`
 * - the mud a crowded sky turns to does not care which sort of voice is filling it.
 */
function hiss(dur, vol, cutoff, sweep, q) {
  const actx = getContext();
  if (!actx || isMuted()) return;
  const loud = loudnessOf(vol);
  const len = dur > 0 ? dur : MIN_DUR;
  if (!takeVoice(loud, len, actx.currentTime, false)) return;
  noiseVoice(actx, getSfxBus(), loud, { dur: len, cutoff, sweep, q });
}

/**
 * A blanket over the music (audio/engine.js). Not a voice, so not on the budget: one filter
 * on the music's bus, moved. The cue that asks for the thud asks for this too, so the two
 * are always heard together.
 */
function blanket(to, back) {
  if (isMuted()) return;
  muffleMusic(to, back);
}

/** This frame's cues, in the order they are worth playing them in. */
const waiting = [];

/** Loudest first, and stable, so a chime's three notes stay in the order they were written. */
function byLoudness(a, b) {
  return loudnessOf(b.vol) - loudnessOf(a.vol);
}

function play(cue) {
  if (cue.kind === 'beep') beep(cue.freq, cue.dur, cue.wave, cue.vol, cue.slideTo);
  else if (cue.kind === 'chord') chord(cue.notes, cue.dur, cue.wave, cue.vol);
  else if (cue.kind === 'noise') hiss(cue.dur, cue.vol, cue.cutoff, cue.sweep, cue.q);
}

/**
 * Play every cue queued since the last call. Nothing is played on the title.
 *
 * The whole frame is looked at before a single voice is started, because that is the only
 * way to spend a budget well: a frame that asks for a bomber's death and thirty shard pings
 * should play the death and as many pings as are left over, and it cannot know that until
 * it has seen all thirty-one.
 */
export function consumeCues(state) {
  waiting.length = 0;
  drainCues(function (cue) {
    if (state === STATE.START) return;
    // A blanket is not one of the sounds competing for the frame: it is not spent from the
    // budget and it is not made to wait behind anything, so it is handled on the way past.
    if (cue.kind === 'muffle') blanket(cue.to, cue.back);
    else waiting.push(cue);
  });
  waiting.sort(byLoudness);
  for (let i = 0; i < waiting.length; i++) play(waiting[i]);
  waiting.length = 0;
}
