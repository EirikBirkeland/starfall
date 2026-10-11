// The one recording the game plays: the menu's song.
//
// Everything else in this game is synthesised - PLAN section 2 says "all sound is synthesised with
// the Web Audio API; no audio files", and the sequencer in audio/music.js is that rule kept. This
// file is the one exception, and it is an exception because the owner asked for it by name: a
// recording of theirs (`assets/MenuMusic-SpaceRapBattle.flac`, 80 s of 48 kHz stereo) plays on the
// attract screen. It stays the *only* place it plays, because the sequencer is doing a job a file
// cannot do anywhere else in the game: it is answering the run - the boss that walked in, the hull
// that went, the two minutes that bought the drum kit - and a fixed song would be deaf to all of it.
// So the recording is the menu and the sequencer is the run, and neither is heard over the other.
//
// **It joins the graph on the music bus**, which is the whole of its integration: the music slider
// moves it, the mute out-mutes it from the master above, and the player-hit muffle reaches whatever
// is on that bus - all of it without this file knowing any of those things exist. `patternFor` in
// audio/music.js is told `menuTrackIsUp()` and stands the generated title pad down while the song
// is playing, so the title screen has one soundtrack and not two arguing.
//
// **Nothing is asked for until the menu is on the screen and the audio device exists.** The file is
// 8.7 MB and the browser decodes it into about 31 MB of samples, and the frame loop must not wait a
// millisecond on either. So the bytes are fetched on the first frame that finds the attract screen
// up *with* an AudioContext (audio/engine.js only builds one on a real press, and a browser allows
// no sound before one), they are fetched once, and a visit that never sits on the menu with sound
// unlocked never spends a byte - which matters, because the first press of a first visit is usually
// the press that launches a run, and a menu nobody waits on is not worth 8.7 MB per load.
//
// **Silence is the answer to every failure.** No network, no file, a browser that cannot decode
// FLAC, a bus that does not exist: each of them leaves the attract screen doing what it did before
// this file existed - the title pad from the sequencer - and each one is written down in
// `menuTrackLedger()` so a test - or anybody with a console and one line of `STARFALL.stats()` - can
// ask what went wrong. There is no error dialog for a song. The states are `waiting` (nothing asked
// yet), `loading`, `ready` (decoded, not playing), `playing`, `missing` (the bytes never arrived), and
// `broken` (they arrived and the machine would not decode them).
//
// **It loops, and it fades.** A looping `AudioBufferSourceNode` is gapless, which is more than an
// `<audio loop>` element is, and it is the reason this is a decoded buffer rather than a media
// element - the other reason being that a media element cannot be handed a bus to live on without
// `createMediaElementSource`, which is its own small pile of browser differences. Starting and
// stopping a whole song on a state change is a click waiting to happen, so both ends are glided on
// the track's own gain the way a bus glide is done in audio/engine.js: a source is never restarted
// after it is stopped, so a stop lets this one go and the next start builds another.

import { STATE } from '../game/state.js';
import { getContext, getMusicBus, isMuted } from './engine.js';

/** Where the recording lives, beside `index.html` - and beside it again inside every release folder. */
export const MENU_TRACK_URL = 'assets/MenuMusic-SpaceRapBattle.flac';

/**
 * s of glide in and out. The way in is long on purpose: the sequencer keeps half a second of the title
 * pad already scheduled (audio/music.js `lookahead`), so a song that arrives over a second rises out
 * from under the pad's own tail instead of cutting across it. The way out is short because it is
 * crossing under a run that has already begun and wants the bus back.
 */
const FADE = { in: 1.0, out: 0.3 };

/** How many bytes a response body has to be worth fetching at all. A guard against an empty one. */
const MIN_BYTES = 1024;

const track = {
  asked: false,
  status: 'waiting',
  reason: 'nothing has been asked for yet',
  bytes: 0,
  seconds: 0,
  buffer: null,
  source: null,
  gain: null,
  loads: 0,
  starts: 0,
  stops: 0,
  startedAt: -1,
  stopAskedAt: -1,
  stoppedAt: -1,
};

/**
 * Everything this file knows about itself: the state machine's name and why it is there, how many
 * bytes came and how long they turned out to be, how many times the song has been loaded, started
 * and stopped, and - on the audio clock, in seconds - when the last source started, when a stop was
 * asked for and when it lands, which is where the fade can be read. A copy, and never reset, for the
 * same reason the mix ledger is neither (audio/mix.js): "did the menu get its song" is a question
 * asked after the fact.
 */
export function menuTrackLedger() {
  return {
    status: track.status,
    reason: track.reason,
    playing: track.source !== null,
    seconds: track.seconds,
    bytes: track.bytes,
    loads: track.loads,
    starts: track.starts,
    stops: track.stops,
    startedAt: track.startedAt,
    stopAskedAt: track.stopAskedAt,
    stoppedAt: track.stoppedAt,
    url: MENU_TRACK_URL,
  };
}

/** Is the recording what the menu is playing right now? audio/music.js asks this and stands down. */
export function menuTrackIsUp() {
  return track.status === 'playing';
}

/**
 * The two-call decode: every browser has the promise form and a few of them only had the callbacks,
 * and paying for both is one line where the alternative is a silent title screen on an old Safari.
 * Resolving twice is harmless and rejecting after resolving is thrown away with everything else here.
 */
function decode(actx, bytes) {
  return new Promise((resolve, reject) => {
    try {
      const maybe = actx.decodeAudioData(bytes, resolve, reject);
      // A browser that takes the callbacks also hands back a promise. Its outcome is nobody's business
      // here - the callbacks are the door this file uses - but a rejected promise nobody watches is an
      // unhandled rejection, so it is watched and thrown away.
      if (maybe && typeof maybe.catch === 'function') maybe.catch(() => {});
    } catch (err) {
      // Including the machine that has no decoder at all.
      reject(err);
    }
  });
}

/**
 * Fetch the recording and turn it into samples. Never throws and never awaited by the caller: the
 * frame loop asks once and gets on with the frame, and whatever happens lands in the state machine
 * above. `actx` is only needed to decode into.
 */
async function load(actx) {
  let bytes;
  try {
    const response = await fetch(MENU_TRACK_URL);
    if (!response.ok) throw new Error('the server answered ' + response.status);
    bytes = await response.arrayBuffer();
  } catch (err) {
    track.status = 'missing';
    track.reason = 'no bytes: ' + err.message;
    return;
  }
  if (!(bytes.byteLength > MIN_BYTES)) {
    track.status = 'missing';
    track.reason = bytes.byteLength + ' bytes is not a song';
    return;
  }
  track.bytes = bytes.byteLength;
  let buffer;
  try {
    buffer = await decode(actx, bytes);
  } catch (err) {
    track.status = 'broken';
    track.reason = 'would not decode: ' + (err && err.message ? err.message : 'the decoder refused');
    return;
  }
  track.buffer = buffer;
  track.seconds = buffer.duration;
  track.loads = 1;
  track.status = 'ready';
  track.reason = Math.round(buffer.duration * 10) / 10 + ' s of sound, ready';
}

/** The glide both ends of a song use: from where the knob is now, to `value`, over `time` seconds. */
function glideTo(knob, value, time, at) {
  knob.cancelScheduledValues(at);
  knob.setValueAtTime(knob.value, at);
  knob.setTargetAtTime(value, at, time / 3);
}

/** Bring the song in on the music bus. One source, looped from its own first sample. */
function play(actx) {
  const bus = getMusicBus();
  if (!bus || !track.buffer) return;
  if (actx.state === 'suspended' && actx.resume) actx.resume();
  const source = actx.createBufferSource();
  const gain = actx.createGain();
  source.buffer = track.buffer;
  source.loop = true;
  source.connect(gain);
  gain.connect(bus);
  const now = actx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  source.start(now);
  glideTo(gain.gain, 1, FADE.in, now);
  track.source = source;
  track.gain = gain;
  track.status = 'playing';
  track.reason = 'playing on the music bus';
  track.startedAt = now;
  track.stopAskedAt = -1;
  track.stoppedAt = -1;
  track.starts++;
}

/**
 * Let the song go. The source is dropped straight away - a stopped `AudioBufferSourceNode` never
 * plays again, so this file's idea of what is playing and the browser's do not get to disagree - and
 * the node itself is stopped at the end of the fade, which is a sample or two of silence by then.
 */
function fadeOut(actx) {
  const source = track.source;
  const gain = track.gain;
  track.source = null;
  track.gain = null;
  track.status = 'ready';
  track.reason = 'stood down for the run';
  track.stops++;
  if (!source || !gain) return;
  const now = actx.currentTime;
  glideTo(gain.gain, 0.0001, FADE.out, now);
  track.stopAskedAt = now;
  track.stoppedAt = now + FADE.out;
  try {
    source.stop(now + FADE.out);
  } catch (err) {
    // Already stopped, or never started: either way it is silent, which was the ask.
  }
}

/**
 * Wind it. main.js calls this once per frame beside the sequencer (audio/music.js), and the
 * simulation never learns it exists - the same seam, for the same reason.
 *
 * Three doors before the bytes are worth asking for: there has to be an audio device (there is not
 * until a press, and a browser would not let us use one before that anyway), the visit has to not be
 * muted (a muted visitor should not pay 8.7 MB for a song they cannot hear, and pressing M asks for
 * it then), and the attract screen has to be the screen being looked at.
 */
export function updateMenuTrack(world) {
  const actx = getContext();
  if (!actx) return;
  if (!track.asked) {
    if (isMuted() || world.state !== STATE.START) return;
    track.asked = true;
    // The frame does not wait on this, and `load` is written so that nothing escapes it. This is the net
    // underneath, because a song that throws must not take the frame loop with it.
    load(actx).catch((err) => {
      track.status = 'broken';
      track.reason = 'its own fault: ' + err.message;
    });
    return;
  }
  if (track.status === 'ready' && world.state === STATE.START) play(actx);
  else if (track.status === 'playing' && world.state !== STATE.START) fadeOut(actx);
}
