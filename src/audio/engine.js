// One Web Audio context, one master bus, and the mute switch. Everything else
// about sound is in sfx.js, and what the bus will let through at once is in mix.js.

let actx = null;
let master = null;
let compressor = null;
let muted = false;
let failures = 0;
const MASTER_GAIN = 0.22;

// PLAN section 5's "a master compressor so nothing clips". These are the gentle numbers:
// it only starts working on a mix that is already loud (-18 dBFS is well above one voice),
// it takes a few milliseconds to react so the crack of a shot is not squashed, and it
// lets go again in a fifth of a second so a burst does not leave the whole mix ducked.
// A late run is a lot of small sounds on top of a few big ones, which is exactly the shape
// a compressor is for and exactly the shape the voice budget cannot fix on its own, because
// the budget prices what is *sounding* and a transient lands on top of all of it at once.
const COMPRESSOR = { threshold: -18, knee: 6, ratio: 4, attack: 0.004, release: 0.18 };

/**
 * Build the master bus on `actx`: the gain, then a compressor if this machine has one,
 * then the destination.
 *
 * The compressor is optional because it really is optional: a browser without
 * `createDynamicsCompressor` is an old one and it still has to be able to hear the game,
 * and it is a lot cheaper to be sure of that here than to find out from a silent release.
 * It is exported so a test can hand it both kinds of machine - the fake audio device of
 * `tools/headless/harness.js` is one with a compressor and `audio: 'raw'` is one without.
 *
 * Answers the two nodes, `{ gain, bus }`, because `setMuted` has to reach the gain and
 * nothing else, and a caller that kept the bus instead would find muting does nothing.
 */
export function buildMaster(actx) {
  const gain = actx.createGain();
  gain.gain.value = muted ? 0 : MASTER_GAIN;

  if (typeof actx.createDynamicsCompressor !== 'function') {
    gain.connect(actx.destination);
    return { gain, bus: null };
  }

  const bus = actx.createDynamicsCompressor();
  bus.threshold.value = COMPRESSOR.threshold;
  bus.knee.value = COMPRESSOR.knee;
  bus.ratio.value = COMPRESSOR.ratio;
  bus.attack.value = COMPRESSOR.attack;
  bus.release.value = COMPRESSOR.release;
  gain.connect(bus);
  bus.connect(actx.destination);
  return { gain, bus };
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
  } catch (err) {
    failures++;
    actx = null;
    master = null;
    compressor = null;
  }
}

export function getContext() {
  return actx;
}

export function getMaster() {
  return master;
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
