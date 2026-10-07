// One Web Audio context, one master gain, and the mute switch. Everything else
// about sound is in sfx.js.

let actx = null;
let master = null;
let muted = false;
let failures = 0;
const MASTER_GAIN = 0.22;

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
    master = actx.createGain();
    master.gain.value = muted ? 0 : MASTER_GAIN;
    master.connect(actx.destination);
  } catch (err) {
    failures++;
    actx = null;
  }
}

export function getContext() {
  return actx;
}

export function getMaster() {
  return master;
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
