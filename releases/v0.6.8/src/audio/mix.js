// The voice budget: how much of this sound may be sounding at once.
//
// PLAN section 5 asks for one thing here and it is the right thing: "limit how many of the
// same sound play at once, or the mix turns to mush at 500 enemies". A late run really does
// ask for dozens of voices in one frame - the headless run at three minutes peaks at twenty
// sounds in a single 16 ms frame, most of them shard pings and hit ticks - and every one of
// them is an oscillator that adds its own amplitude to the master bus. Too many at once and
// the game stops being a thing you hear and becomes a hiss that clips.
//
// **The budget is loudness, not a count.** The mud is a sum of amplitudes and so the ceiling
// is one too: a frame may spend up to `MIX.headroom` worth of voice volume that is *already*
// sounding, whatever number of voices that is. Six loud ones and forty quiet ones are not
// the same problem and they do not get the same answer - the quiet ones are what a crowded
// sky can afford, and a bomber going off is not asked to wait its turn behind thirty pings.
// The same number also makes the answer get better on its own as the mix gets busier: the
// first voice in a frame is free and the tenth is paying for the nine that came first.
//
// **A voice is only held against the sky for as long as it sounds.** The synthesiser stops
// each oscillator after `dur` plus a small tail, so that is exactly how long its amplitude
// stays in the sum and exactly how long it costs the next voice. `now` is the audio clock
// (`AudioContext.currentTime`) rather than a frame counter, because the voices are scheduled
// on that clock and nothing else - a dropped frame is a frame the ear did not skip, and a
// backgrounded tab whose audio kept running while the loop slept is the one case where the
// two clocks genuinely disagree.
//
// **What got turned away is written down.** `ledgerOf()` answers how many voices were asked
// for, how many were played, how many were dropped and how loud the loudest drop was - which
// is how `test/mix.test.mjs` can say "a busy run does turn things away" instead of hoping,
// and how the debug overlay of milestone 10 will be able to show the mix working.

export const MIX = {
  // How much voice volume may be sounding at once, in the same unit a cue's `vol` is
  // written in. What one voice costs is a small spread: the loudest sound in the game is
  // the ship's own death at 0.16, a shot of the pulse is 0.07, a shard ping 0.05 and a
  // hit tick between 0.014 and 0.03 - so this ceiling is about seven shots, or a hundred
  // ticks, and a normal fight sits far under it. It is there for the frame that is not
  // normal: three minutes into a bot's run the loudest frame asks for twenty sounds at
  // once, which is a hiss and not a gunfight. With `MASTER_GAIN` at 0.22 this puts the
  // worst case the bus can reach at about a tenth of full scale - a mix with room in it
  // rather than a wall - and the compressor in audio/engine.js catches the transient that
  // lands on top of it.
  headroom: 0.5,
  // s of tail the synthesiser adds to every voice after its own length (audio/sfx.js
  // stops the oscillator that much after the envelope has closed), so a voice is held
  // against the sky for as long as it can still be heard.
  tail: 0.03,
  // What a cue that names no volume is worth. `beep` has always filled this in for a cue
  // written without one (`vol || 0.15`), and the budget has to price a voice exactly the way
  // the synthesiser plays it - which is the whole reason this number is in one place and not
  // two. Nothing in the game forgets a volume today; the day one does, it is a voice of this
  // size and not a free one.
  plainVol: 0.15,
};

/**
 * One voice that is sounding: what it costs the bus (`vol`) and when it stops being
 * audible (`endsAt`, on the audio clock).
 */
function makeVoice() {
  return { vol: 0, endsAt: 0 };
}

const voices = [];          // what is sounding, in no particular order
const free = [];            // records to reuse, so a busy frame allocates nothing
const ledger = {
  asked: 0, played: 0, dropped: 0,
  peakLoad: 0, peakVoices: 0,
  loudestDropped: 0,
};

/** The whole of the loudness sounding right now, in a cue's own unit. */
function loadOf(now) {
  let load = 0;
  for (let i = 0; i < voices.length; i++) {
    if (voices[i].endsAt > now) load += voices[i].vol;
  }
  return load;
}

/** Drop every voice that has finished. In place, and it keeps the free list. */
function prune(now) {
  let keep = 0;
  for (let i = 0; i < voices.length; i++) {
    const voice = voices[i];
    if (voice.endsAt > now) {
      voices[keep++] = voice;
    } else {
      free.push(voice);
    }
  }
  voices.length = keep;
}

/** What a cue's volume is worth on the bus, default included (see `MIX.plainVol`). */
export function loudnessOf(vol) {
  return vol > 0 ? vol : MIX.plainVol;
}

/**
 * Ask the mix for one voice: `vol` of it, for `dur` seconds, at `now` on the audio clock.
 *
 * Answers whether the voice may be played. A yes spends the budget for as long as the voice
 * lasts and a no spends nothing, so a caller that is turned away should drop the sound rather
 * than try again - a voice that arrives late in a busy second is not a worse version of the
 * same sound, it is a sound nobody would have heard under the ones that got there first.
 *
 * `must` buys a voice whatever the sky is doing, and it is for the three notes of a chime:
 * a level-up is the run telling the player something about itself and not another tick in the
 * mud, so the ceiling bends for it and `peakLoad` is allowed to be read past `headroom`.
 */
export function takeVoice(vol, dur, now, must) {
  prune(now);
  ledger.asked++;

  const load = loadOf(now) + vol;
  if (load > MIX.headroom && !must) {
    ledger.dropped++;
    if (vol > ledger.loudestDropped) ledger.loudestDropped = vol;
    return false;
  }

  const voice = free.pop() || makeVoice();
  voice.vol = vol;
  voice.endsAt = now + dur + MIX.tail;
  voices.push(voice);

  ledger.played++;
  if (load > ledger.peakLoad) ledger.peakLoad = load;
  if (voices.length > ledger.peakVoices) ledger.peakVoices = voices.length;
  return true;
}

/** How much is sounding at `now`, in voices. (Mostly a thing the tests ask.) */
export function soundingOf(now) {
  prune(now);
  return voices.length;
}

/** How much is sounding at `now`, in a cue's own volume. */
export function loadOfSounding(now) {
  prune(now);
  return loadOf(now);
}

/**
 * What the mix has been asked to do and what it got to do with it. A copy, because a caller
 * that keeps the ledger itself would be able to rewrite its own history. It is a count for
 * the whole page visit rather than for one run - the voices it is counting are the browser's,
 * and they outlive a run whatever this module decides to remember about them - so a test that
 * wants to know what *it* caused takes the ledger before and after and subtracts.
 */
export function ledgerOf() {
  return Object.assign({}, ledger);
}
