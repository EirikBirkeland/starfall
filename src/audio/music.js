// The music: a step sequencer that the frame loop winds.
//
// PLAN section 5 asks for music that is *generated* - a step grid at 110 BPM in a minor
// key with layers laid over it - and not a song on a loop. This file is the grid and the
// first three layers (pad, bass, arpeggio); which layers are on a given frame is the
// run's state answering, because the simulation must not learn that music exists. main.js
// hands the frame's state over here next to where it drains the sound-effect queue, and
// that is the whole seam.
//
// **The schedule runs on the audio clock, not the frame clock.** Notes are scheduled ahead of
// `AudioContext.currentTime`, several steps at a time, every frame; a frame that arrives
// late is a frame that finds the schedule still full, and a clock that ran *past* the
// schedule (a backgrounded tab, a card left up, a long game-over screen) is re-anchored
// and started again from the top of the progression rather than chased - thirty steps of
// the past dumped on the present at once would sound like the tune being thrown at the
// wall, and skipping is what every real sequencer does when its clock is interrupted.
// `lookahead` is the size of the buffer of music kept ready, and it is half a second
// because the worst hitch a browser serves is comfortably under that.
//
// **The music is not on the voice budget.** The budget in mix.js exists because a crowded
// sky asks a frame for thirty sounds and cannot know in advance what it is full of; a
// sequencer knows exactly what it will play before it plays it - the whole pattern's voice
// count is countable from the tables below - and a voice turned away from a pattern is not
// a spare tick, it is a hole in the bar. Its loudness is bounded instead, and bounded
// tightly: the heaviest bar this can write sums to about 0.4 of its own unit, half of
// which the music bus takes off (audio/engine.js), so the whole of the music sits at a
// fraction of what the effects are allowed and both still go through the one compressor.

import { STATE } from '../game/state.js';
import { getContext, getMusicBus, isMuted } from './engine.js';

const BPM = 110;
const STEPS_PER_BAR = 16;
/** One sixteenth note at the tempo above: 0.136 s at 110 BPM. */
const STEP_SECONDS = 60 / BPM / 4;

export const MUSIC = {
  bpm: BPM,
  stepsPerBar: STEPS_PER_BAR,
  stepSeconds: STEP_SECONDS,
  /** s of music kept scheduled ahead of the audio clock (see the header). */
  lookahead: 0.5,
  /** s after an anchor before the first note lands - a breath, not an instant. */
  startGap: 0.05,
};

/** s an oscillator keeps sounding past the close of its envelope (the same tail sfx uses). */
const VOICE_TAIL = 0.03;

/** The one arithmetic every tone table below needs: MIDI note number to hertz. */
function hz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// A natural-minor progression, one chord per bar, four bars to a loop: Am - F - C - G,
// the tonic, the submediant, the mediant and the subtonic - every note of every chord in
// the key, and the minor third of the tonic is the only minor third in it, which is what
// makes it sound sad-and-driving instead of merely sad. Roots are MIDI numbers in the
// bass register (A2 is 110 Hz - the same number as the BPM, which is a happy accident
// worth having): each bar's chord is [root, third, fifth] and the layers below take it
// apart.
const CHORDS = [
  { root: 45, third: 3 },  // A minor - i
  { root: 41, third: 4 },  // F       - VI
  { root: 48, third: 4 },  // C       - III
  { root: 43, third: 4 },  // G       - VII
];

// The pad: the whole triad, an octave above the root, both of its oscillators of each note
// nudged a comma apart so the chord breathes instead of standing still. Slow on, slow off,
// one chord per bar with a tail over the bar line - the layer a title screen is made of.
const PAD = { wave: 'sawtooth', vol: 0.03, attack: 0.6, dur: 2.5, spread: 1.004 };
// The bass: sawtooth for grit at a low level, six steps to a bar on the driving offbeats,
// walking to the fifth and up an octave at the end of the bar so the loop leans into the
// next one instead of starting square.
const BASS = { wave: 'sawtooth', vol: 0.16, attack: 0.008, dur: 0.24 };
const BASS_STEPS = [0, null, null, 0, null, null, 0, null, 7, null, null, 0, null, null, 12, null];
// The arpeggio: a square-wave chip line two octaves up, one note per pair of sixteenths,
// climbing the chord and back down. The quietest layer by far - it is sparkle, not tune.
const ARP = { wave: 'square', vol: 0.05, attack: 0.004, dur: 0.13 };
const ARP_STEPS = [null, null, 0, null, 1, null, 2, null, null, null, 3, null, 2, null, 1, null];

/**
 * The bar's chord as four intervals from its root - tonic, third, fifth, octave -
 * starting `base` semitones up. The pad takes the first three an octave up; the
 * arpeggio takes all four two octaves up.
 */
function chordTones(chord, base) {
  return [base, base + chord.third, base + 7, base + 12];
}

const NO_MUSIC = null;
const PAD_ONLY = { pad: true, bass: false, arp: false };
const RUNNING = { pad: true, bass: true, arp: true };

/**
 * Which layers the run's state asks for. The title breathes; a run - and a run paused
 * for its cards, which is still the same run holding its breath - drives; and the two
 * endings are silent on purpose: the hush after the last fight and the death's card both
 * belong to what the run just did, not to a tune over the top of it.
 */
function layersFor(state) {
  if (state === STATE.START) return PAD_ONLY;
  if (state === STATE.PLAY || state === STATE.LEVEL) return RUNNING;
  return NO_MUSIC;
}

let stepIndex = 0;   // how far into the progression the schedule has reached
let nextAt = -1;     // audio-clock time the next step is due; negative means "not started"
const ledger = { steps: 0, notes: 0, anchors: 0 };

/**
 * What the sequencer has done this page visit: steps scheduled, notes voiced, how many
 * times the clock ran out from under it and had to be re-anchored, and where it stands in
 * the progression right now. A copy, and never reset, for the same reason the mix ledger
 * is neither (audio/mix.js).
 */
export function musicLedger() {
  return { steps: ledger.steps, notes: ledger.notes, anchors: ledger.anchors, position: stepIndex };
}

/** One voice on the music bus: an oscillator, an envelope, a start and a stop. */
function voice(actx, freq, tone, when) {
  const bus = getMusicBus();
  if (!bus) return;
  try {
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = tone.wave;
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, tone.vol), when + tone.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + tone.dur);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(when);
    osc.stop(when + tone.dur + VOICE_TAIL);
    ledger.notes++;
  } catch (err) {
    // One dropped voice is not worth losing a frame over, same bargain as audio/sfx.js.
  }
}

function padChord(actx, chord, when) {
  const tones = chordTones(chord, 12);
  for (let i = 0; i < 3; i++) {
    const f = hz(chord.root + tones[i]);
    voice(actx, f * PAD.spread, PAD, when);
    voice(actx, f / PAD.spread, PAD, when);
  }
}

function scheduleStep(actx, index, when, layers) {
  const inBar = index % STEPS_PER_BAR;
  const chord = CHORDS[Math.floor(index / STEPS_PER_BAR) % CHORDS.length];

  if (layers.pad && inBar === 0) padChord(actx, chord, when);
  if (layers.bass) {
    const interval = BASS_STEPS[inBar];
    if (interval !== null) voice(actx, hz(chord.root + interval), BASS, when);
  }
  if (layers.arp) {
    const toneIndex = ARP_STEPS[inBar];
    if (toneIndex !== null) voice(actx, hz(chord.root + chordTones(chord, 24)[toneIndex]), ARP, when);
  }
}

/**
 * Wind the sequencer. main.js calls this once per frame with the world's state; it does
 * nothing until a context exists (audio starts on the first input, like everything else
 * here) and nothing while the game is muted.
 */
export function updateMusic(state) {
  const actx = getContext();
  if (!actx || isMuted()) return;

  const layers = layersFor(state);
  if (layers === NO_MUSIC) {
    // Silence is dropping the schedule, not sitting on it: whatever was already
    // scheduled rings out on its own, and there is nothing half-ready to resume
    // when the screen changes.
    nextAt = -1;
    return;
  }

  if (actx.state === 'suspended' && actx.resume) actx.resume();
  const now = actx.currentTime;

  if (nextAt < now) {
    // The first frame music can play on, or the clock has run past everything that
    // was scheduled. Start again from the top of the progression a breath from now;
    // a pattern that tried to catch up would be a hundred notes late and no music.
    nextAt = now + MUSIC.startGap;
    stepIndex = 0;
    ledger.anchors++;
  }

  while (nextAt < now + MUSIC.lookahead) {
    scheduleStep(actx, stepIndex, nextAt, layers);
    ledger.steps++;
    stepIndex++;
    nextAt += STEP_SECONDS;
  }
}
