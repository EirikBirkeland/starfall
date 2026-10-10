// One Web Audio context, one master bus with a compressor and two buses hanging off it -
// one for sound effects, one for the music - and the mute switch. Everything else about
// sound is in sfx.js and music.js, and what the bus will let through at once is in mix.js.

let actx = null;
let master = null;
let compressor = null;
let musicBus = null;
let effectsBus = null;
let muted = false;
let failures = 0;
const MASTER_GAIN = 0.22;

// Why two buses when one master works: the mix's loudness numbers (audio/mix.js) are all
// written for the effects, and the music has to join the master without asking the effects
// budget to make room for it. A bus each means the two can be balanced against each other
// without touching a single voice in either - and when milestone 9 puts volume sliders on
// the glass, a slider is a bus, not a rewrite.
//
// The effects bus stays at 1 on purpose: every `vol` in the game is already priced against
// the whole master (the headroom analysis in mix.js is arithmetic on those numbers), so a
// different number here would silently reprice the entire game's sound. The music bus sits
// at half because the loudest bar the sequencer can write adds up to about 0.4 of its own
// (audio/music.js): halved here, the whole of the music peaks at well under half of what
// a full sky of effects is already allowed - music you feel under a fight, never a wall
// on top of it.
const SFX_BUS_GAIN = 1;
const MUSIC_BUS_GAIN = 0.5;

// PLAN section 5's "a master compressor so nothing clips". These are the gentle numbers:
// it only starts working on a mix that is already loud (-18 dBFS is well above one voice),
// it takes a few milliseconds to react so the crack of a shot is not squashed, and it
// lets go again in a fifth of a second so a burst does not leave the whole mix ducked.
// A late run is a lot of small sounds on top of a few big ones, which is exactly the shape
// a compressor is for and exactly the shape the voice budget cannot fix on its own, because
// the budget prices what is *sounding* and a transient lands on top of all of it at once.
const COMPRESSOR = { threshold: -18, knee: 6, ratio: 4, attack: 0.004, release: 0.18 };

/**
 * Build the whole master graph on `actx`: the two buses into the master gain, the gain into
 * a compressor if this machine has one, and that into the destination.
 *
 * The compressor is optional because it really is optional: a browser without
 * `createDynamicsCompressor` is an old one and it still has to be able to hear the game,
 * and it is a lot cheaper to be sure of that here than to find out from a silent release.
 * It is exported so a test can hand it both kinds of machine - the fake audio device of
 * `tools/headless/harness.js` is one with a compressor and `audio: 'raw'` is one without.
 *
 * Answers the four nodes, `{ gain, bus, music, sfx }`. The gain matters because `setMuted`
 * has to reach it and nothing else - both buses hang *upstream* of it, so one zero on that
 * one value is the whole game going quiet, music scheduled and all.
 */
export function buildMaster(actx) {
  const gain = actx.createGain();
  gain.gain.value = muted ? 0 : MASTER_GAIN;

  let bus = null;
  if (typeof actx.createDynamicsCompressor === 'function') {
    bus = actx.createDynamicsCompressor();
    bus.threshold.value = COMPRESSOR.threshold;
    bus.knee.value = COMPRESSOR.knee;
    bus.ratio.value = COMPRESSOR.ratio;
    bus.attack.value = COMPRESSOR.attack;
    bus.release.value = COMPRESSOR.release;
    gain.connect(bus);
    bus.connect(actx.destination);
  } else {
    gain.connect(actx.destination);
  }

  const music = actx.createGain();
  music.gain.value = MUSIC_BUS_GAIN;
  music.connect(gain);

  const sfx = actx.createGain();
  sfx.gain.value = SFX_BUS_GAIN;
  sfx.connect(gain);

  return { gain, bus, music, sfx };
}

/** Safe to call on every click; it gives up quietly if audio is impossible. */
export function initAudio() {
  if (actx || failures > 2) return;
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) {
      failures = 99;
      return;
    }
    actx = new Ctor();
    const chain = buildMaster(actx);
    master = chain.gain;
    compressor = chain.bus;
    musicBus = chain.music;
    effectsBus = chain.sfx;
  } catch (err) {
    failures++;
    actx = null;
    master = null;
    compressor = null;
    musicBus = null;
    effectsBus = null;
  }
}

export function getContext() {
  return actx;
}

/** The effects bus every sfx voice connects to (null until `initAudio` has run). */
export function getSfxBus() {
  return effectsBus;
}

/** The music bus every sequenced voice connects to (null until `initAudio` has run). */
export function getMusicBus() {
  return musicBus;
}

/** Is the master bus running through a compressor? (False on a machine that has none.) */
export function isCompressed() {
  return compressor !== null;
}

export function setMuted(value) {
  muted = !!value;
  if (master) master.gain.value = muted ? 0 : MASTER_GAIN;
}

export function toggleMuted() {
  setMuted(!muted);
}

export function isMuted() {
  return muted;
}
