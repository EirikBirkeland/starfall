// One Web Audio context, one master bus with a compressor and two buses hanging off it -
// one for sound effects, one for the music, the music's with a tone control of its own -
// the mute switch, and the two volume sliders PLAN section 5 asks for. Everything else
// about sound is in sfx.js, music.js and noise.js, and what the bus will let through at
// once is in mix.js.

import { remember, section } from '../core/save.js';

let actx = null;
let master = null;
let compressor = null;
let musicBus = null;
let effectsBus = null;
let musicTone = null;
let muted = false;
let failures = 0;
const MASTER_GAIN = 0.22;

// Why two buses when one master works: the mix's loudness numbers (audio/mix.js) are all
// written for the effects, and the music has to join the master without asking the effects
// budget to make room for it. A bus each means the two can be balanced against each other
// without touching a single voice in either - and when a slider was asked for it could be a
// bus and not a rewrite (see the sliders below, and milestone 9 for putting them on the glass).
//
// The effects bus ships at 1 on purpose: every `vol` in the game is already priced against
// the whole master (the headroom analysis in mix.js is arithmetic on those numbers), so a
// different number here would silently reprice the entire game's sound. The music bus sits
// at half because the loudest instant any pattern the sequencer can write reaches is
// `MUSIC.peakLoad` - 0.5 of its own unit, measured by `patternPeak` in audio/music.js and
// held there by a test: halved here, the busiest bar of the harshest pattern peaks at half
// of what a full sky of effects is already allowed - music you feel under a fight, never a
// wall on top of it.
const SFX_BUS_GAIN = 1;
const MUSIC_BUS_GAIN = 0.5;

// ---------------------------------------------------------------------------
// The two sliders.
//
// A slider is a bus, which is the whole reason there are two buses (see the note above):
// these two numbers multiply the two bus gains and touch nothing else. The mute stays the
// single value that goes quiet whatever is scheduled, because it hangs on the master above
// both of them and no slider can out-mute it - and the music's tone filter sits *downstream*
// of the music bus, so a slider can make the music quieter without repricing the muffle.
//
// **The top of a slider is the shipped mix, not twice the shipped mix.** Every `vol` in the
// game is priced against the master through the headroom analysis in mix.js, and every bar
// of music against `MUSIC.peakLoad` (audio/music.js): those two measurements are what stop
// a late run turning into a hiss, and a slider that could go past them would un-measure the
// game. So both sliders end at unity on their own bus - which is exactly what the game
// shipped as before a player was allowed a say - and go *down* from there.
//
// **Each step is the same step to the ear, not the same number.** A linear 0..1 slider is
// half the key presses spent on the loudest third of the range and nothing on the quietest:
// loudness is a ratio, so the slider is one too. `span` dB spread over `steps` positions
// means every press moves 2 dB, which is the smallest change a listener can tell, and 0 is
// a hard zero - nothing on that bus, not a very quiet something.
// ---------------------------------------------------------------------------
export const VOLUME = {
  /** Positions on a slider. The top one is the shipped mix; 0 shuts that bus. */
  steps: 10,
  /** dB the whole slider spans, so one step is `span / steps` dB. */
  span: 20,
  /** Where both sliders start: as loud as the game was measured to be. */
  start: 10,
};

/** s of glide a bus takes to a new level - see `glideTo`. */
const BUS_GLIDE = 0.015;

/** Where the two sliders are. Kept here whether or not there is an audio device to apply them to. */
const levels = { music: VOLUME.start, effects: VOLUME.start };

// The three numbers this mixer owns in the save document (core/save.js). They are defaults here
// rather than there because this is the module that knows what it ships at: both sliders at the
// top of their travel, the master open.
const SAVED = { music: VOLUME.start, effects: VOLUME.start, muted: false };

/**
 * What one slider position is worth as a gain: 1 at the top, 0 at the bottom, and the same
 * ratio between every pair of neighbours. Rounds, because a slider has positions and not a
 * continuum - and a caller who asks for 3.7 meant the third one.
 */
export function levelGain(level) {
  const n = Math.round(level);
  if (n <= 0) return 0;
  if (n >= VOLUME.steps) return 1;
  return Math.pow(10, (-VOLUME.span * (VOLUME.steps - n)) / (VOLUME.steps * 20));
}

// The music's tone control: a low-pass between the music bus and the master, sitting wide
// open all game and swept shut for a moment by `muffleMusic` when the ship is hurt (PLAN
// section 5's "player-hit thud with a low-pass sweep over the music"). It lives here rather
// than in the sequencer because it is a wire and not a note: it muffles whatever is on the
// bus, including a bar that was already scheduled half a second ago, which is exactly the
// music that has to go quiet behind the thud. Wide open means 18 kHz, three octaves above
// the highest note the sequencer writes, so a filter that is sitting open takes nothing off
// the music anybody can hear.
const MUSIC_TONE = { open: 18000, q: 0.9 };

// How the muffle moves: it is slammed shut in `down` - faster than the ear can separate it
// from the thud it lands with, which is what makes the two one event - and then let back up
// on `setTargetAtTime`, whose time constant is a quarter of `back`, so by `back` seconds the
// music is 99% of the way home and nobody has heard the filter move.
const MUFFLE = { down: 0.03, approach: 4 };

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
 * Answers the five nodes, `{ gain, bus, music, sfx, tone }`. The gain matters because
 * `setMuted` has to reach it and nothing else - both buses hang *upstream* of it, so one
 * zero on that one value is the whole game going quiet, music scheduled and all.
 *
 * The music's tone filter hangs between the music bus and the master, which is the one spot
 * on the graph where it can shut the music up without touching the effects and without being
 * able to out-shout the mute above it. A machine with no `createBiquadFilter` gets none, on
 * the same terms as the compressor below: it is an old browser and it still has to play.
 */
export function buildMaster(actx) {
  const gain = actx.createGain();
  gain.gain.value = muted ? 0 : MASTER_GAIN;
  const gains = busGains();

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
  music.gain.value = gains.music;

  let tone = null;
  if (typeof actx.createBiquadFilter === 'function') {
    tone = actx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = MUSIC_TONE.open;
    tone.Q.value = MUSIC_TONE.q;
    music.connect(tone);
    tone.connect(gain);
  } else {
    music.connect(gain);
  }

  const sfx = actx.createGain();
  sfx.gain.value = gains.effects;
  sfx.connect(gain);

  return { gain, bus, music, sfx, tone };
}

/**
 * What each bus is set to right now, in the unit its own shipped number is written in - the
 * two sliders applied to the two constants above. A copy, and the answer both `buildMaster`
 * and a live graph work from, so neither can drift from the other.
 */
export function busGains() {
  return {
    music: MUSIC_BUS_GAIN * levelGain(levels.music),
    effects: SFX_BUS_GAIN * levelGain(levels.effects),
  };
}

/**
 * Take a bus to a new gain over a breath. A step is 2 dB and a bus carries everything that is
 * sounding, so a bus moved between two frames would click: the pad is already in the middle
 * of a chord and a chord that jumps is a pop out of the speakers. Fifteen milliseconds is
 * far too fast to hear as a fade and about ten times longer than a click needs.
 *
 * A bus only ever exists once there is a context to schedule it on (initAudio below builds the
 * graph or nothing), so there is no third case here: no bus means the level is remembered on
 * this side of the wire and `buildMaster` will build the graph at it.
 */
function glideTo(node, value) {
  if (!node) return;
  const now = actx.currentTime;
  node.gain.cancelScheduledValues(now);
  node.gain.setValueAtTime(node.gain.value, now);
  node.gain.setTargetAtTime(value, now, BUS_GLIDE);
}

function applyLevels() {
  const gains = busGains();
  glideTo(musicBus, gains.music);
  glideTo(effectsBus, gains.effects);
}

/** A requested position as a position: a step, inside the travel, no matter who asked. */
function clampLevel(level) {
  return Math.max(0, Math.min(VOLUME.steps, Math.round(level)));
}

/** Where one of the two sliders is. */
export function musicLevel() {
  return levels.music;
}

export function effectsLevel() {
  return levels.effects;
}

/**
 * Move one slider, and answer the position it landed on - or null when it was already there,
 * which is how a caller knows there is nothing to answer the press with. Out of range is
 * clamped rather than refused: a key pressed twice too often is a slider against the end of
 * its travel, and the end of the travel is a real place to be.
 */
export function setLevel(which, level) {
  if (levels[which] === undefined) throw new Error('no volume bus is called ' + which);
  const next = clampLevel(level);
  if (next === levels[which]) return null;
  levels[which] = next;
  applyLevels();
  rememberAudio();
  return next;
}

/** One slider, one step, one direction. */
export function nudgeLevel(which, delta) {
  return setLevel(which, levels[which] + delta);
}

/** Send the three numbers this mixer owns to the save document, so the next visit starts here. */
function rememberAudio() {
  remember('audio', { music: levels.music, effects: levels.effects, muted: muted });
}

/**
 * Put the sliders and the mute where the last visit left them (core/save.js). Boot calls this
 * once, before anything has made a sound, and answers what it landed on so the interface can say
 * something about a game that comes back silent.
 *
 * It moves the state and the graph directly rather than going through `setLevel`/`setMuted`,
 * because those remember and a read of the document must not be a write of it.
 */
export function restoreAudio() {
  const saved = section('audio', SAVED);
  levels.music = clampLevel(saved.music);
  levels.effects = clampLevel(saved.effects);
  muted = saved.muted;
  applyLevels();
  applyMute();
  return { music: levels.music, effects: levels.effects, muted: muted };
}

/**
 * Whether anything played on the device right now would actually be heard: there is a device, and
 * the browser is letting its clock run.
 *
 * A device that exists but is asleep answers to nothing, because its clock is not running: a note
 * scheduled at `currentTime` while the clock is stopped is a note that lands the moment the clock
 * starts again, however long that is. So the two things that write ahead of the frame - the
 * sequencer and the menu's recording (audio/music.js, audio/track.js) - ask this instead of asking
 * only whether there is a device, and wait for the browser rather than filling up a stopped clock.
 *
 * A machine whose context has no `state` at all is treated as awake: that is an old browser, and the
 * game made sound on one of those before the property existed.
 */
export function audioIsHeard() {
  return actx !== null && actx.state !== 'suspended' && actx.state !== 'interrupted';
}

/**
 * Ask a sleeping device to wake up, and answer whether it can be heard now.
 *
 * Only a press may do this. A browser will not let the frame loop start a device - that is the whole
 * of the autoplay rule - so this is called from presses: from `initAudio` below, and from the small
 * set of first-press listeners main.js puts on the window. Asking again when the device is already
 * running is nothing at all, which is why the callers do not have to be careful about how often.
 */
export function wakeAudio() {
  if (!actx) return false;
  if (actx.state === 'suspended' && actx.resume) {
    try {
      const waking = actx.resume();
      // A resume the browser will not grant is a device that stays asleep, and a rejected promise
      // nobody is watching is a red line in somebody's console. Both are the same non-event.
      if (waking && typeof waking.catch === 'function') waking.catch(() => {});
    } catch (err) {
      // Including the browser that resumes with a callback and hands back nothing.
    }
  }
  return audioIsHeard();
}

/**
 * Build the device at boot, before there has been a press, and say whether it can be heard.
 *
 * This is the half of the menu's song that used to be missing: the device was only ever built by a
 * press, and the press that builds it is usually the one that launches a run - so a browser that
 * *would* have let the title screen make a sound on its own (one with no autoplay rule, or one that
 * remembers this visitor asking for sound before) never got asked. Now the device is there from the
 * first frame and the menu says what it has to say. Where the browser will not, the device is built
 * and asleep, nothing is spent on it, and the first press wakes it (main.js, and `wakeAudio`).
 *
 * It does not ask for the wake itself. A browser that lets a page play hands out a device that is
 * already running, and one that will not refuses a resume asked by anything but a press - so asking
 * here would buy nothing and print a warning in somebody's console for the asking.
 */
export function openAudioDevice() {
  openDevice();
  return audioIsHeard();
}

/** Open the device if this visit has not got one yet, and wake it if it is asleep. */
export function initAudio() {
  openDevice();
  wakeAudio();
}

/** Safe to call on every click and on every boot; it gives up quietly if audio is impossible. */
function openDevice() {
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
    musicTone = chain.tone;
  } catch (err) {
    failures++;
    actx = null;
    master = null;
    compressor = null;
    musicBus = null;
    effectsBus = null;
    musicTone = null;
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

/**
 * Put a blanket over the music for a moment: slam the low-pass on its bus down to `to`
 * hertz and let it open again over `back` seconds. This is the whole of the "the ship was
 * hurt" effect on the music, and it is on purpose that it is one call and not a scheduled
 * note - the sequencer has half a second of music already queued, and a filter on the bus
 * reaches every note in it including the ones already on their way.
 *
 * Answers whether there was a filter to move, so a caller can tell an old machine from a
 * sound it chose not to make.
 */
export function muffleMusic(to, back) {
  if (!musicTone || !actx) return false;
  const now = actx.currentTime;
  const freq = musicTone.frequency;
  // Anchored on where the filter actually is, because two hits inside the recovery would
  // otherwise start their ramp from wherever the last one left the value and jump.
  freq.cancelScheduledValues(now);
  freq.setValueAtTime(freq.value, now);
  freq.exponentialRampToValueAtTime(Math.max(30, to), now + MUFFLE.down);
  freq.setTargetAtTime(MUSIC_TONE.open, now + MUFFLE.down, back / MUFFLE.approach);
  return true;
}

/** Does this machine have the music's tone control at all? (A thing the tests ask.) */
export function hasMusicTone() {
  return musicTone !== null;
}

/**
 * The one switch. It works on the master above both buses, so it is still the only value
 * that goes quiet whatever is scheduled - music already in the sequencer's half second of
 * lookahead, a slider at its top, all of it. The sliders are balances between two things
 * that are playing; this is whether anything is.
 */
function applyMute() {
  if (master) master.gain.value = muted ? 0 : MASTER_GAIN;
}

export function setMuted(value) {
  muted = !!value;
  applyMute();
  rememberAudio();
}

export function toggleMuted() {
  setMuted(!muted);
  // Answers the way it landed, so the interface can answer the press (main.js): coming back is
  // the half that needs a sound to say it happened, and going quiet is its own silence.
  return muted;
}

export function isMuted() {
  return muted;
}
