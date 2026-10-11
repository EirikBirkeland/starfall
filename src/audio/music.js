// The music: a step sequencer that the frame loop winds.
//
// PLAN section 5 asks for music that is *generated* - a step grid at 110 BPM in a minor
// key with layers laid over it - and not a song on a loop. This file is the grid and the
// layers over it (pad, sub, bass, arpeggio, lead, drums); which of them are sounding on a
// given frame is the run itself answering, because the simulation must not learn that music
// exists.
// main.js hands the whole world over here next to where it drains the sound-effect queue,
// and that is the whole seam: audio reads the run, never the other way round.
//
// **The run's shape is the intensity.** PLAN section 5 names five things the music is
// supposed to do as the run gets more dangerous - a pad on the title, bass and arpeggio in
// a run, drums after 2:00, a faster and harsher pattern for a boss, and a stripped one at
// one hull left - and each of them is one `PATTERNS` entry below, picked by `patternFor`
// out of what the world says about itself: the clock, whether a boss is on the arena, and
// how much hull the ship has got left. A pattern is not a mix of switches but a whole set
// of parts - which lines it plays, how fast its grid runs, and how its chord is voiced -
// because "harsher" turned out not to be a volume: the boss entry changes the *tempo*,
// writes sixteenths where the run writes eighths, and gives its pad the scale's second to
// rub on.
//
// **A pattern is a form, not a bar.** Nothing here repeats every bar and little of it repeats
// every four: a pattern carries `bars` (how long its arrangement is, in bars) and each of its
// parts carries a *list* of bar figures, one per bar of that loop, so the bass can answer the
// bar it just played, the drum kit can leave a fill at the end of a phrase, and the tune can be
// eight bars long instead of one. The chord phrase is eight bars (see `CHORDS`), so every
// figure list's length has to divide the form and the form has to be a whole number of chord
// phrases - `checked` refuses anything else, because a figure list that does not line up with
// the harmony is a wrong note waiting to happen rather than a wrong note you can hear. `title`
// and `last` still have one figure each: they are a pad and a drone, and the eight-bar harmony
// moving under them is their variation.
//
// **Every line is written as sixteen characters.** A pitched figure is a bar of sixteenths in
// the same shape the drum figures always were (`figure`), and a note in it is an interval in
// semitones from that bar's own chord root - `t` being the chord's own third, since this phrase
// has a minor and a major third in it - so a figure is a shape that can be handed to any chord
// and stay in key, which is how a four-bar phrase becomes an eight-bar one without a single note
// being rewritten. `test/music.test.mjs` proves it: every note of every figure, against the
// chord it can actually land on, is a note of the key, and every note on a strong beat is a note
// of that chord.
//
// **Below the groove is a floor and above it is a tune.** A sine on the bar's root holds the
// octave the saw bass only brightens, which is the half of "oomph" that a laptop speaker is
// physically able to admit; and when the kit arrives at two minutes so does the lead - eight bars
// of long notes on the chord tones, in the one register nothing else in the arrangement occupies,
// which is the place this soundtrack sings instead of driving. Both are paid for out of the other
// layers, because the ceiling below is a sum: the pad is a third quieter than it was and the saw
// bass a fifth, and the music is fuller at the end of it and no louder.
//
// **The other tune is the vacuum's.** When the point vacuum opens (game/vacuum.js) the pattern the
// run is playing spends one of its two melodic slots on a fanfare for ten seconds: the melody's
// slot where there is a melody, or the arpeggio's in the first two minutes where there is not.
// It is a *layer swap* and not a new pattern of its own so the reward is heard over the fight it
// happened in, and it is metered like every other pattern (`patternPeak`, and the four `-fanfare`
// entries in `PATTERNS`) because "loud enough to be the reward" is a number and the one that keeps
// this bus honest does not care which pattern is spending it. Its ceiling is the loudest pattern's
// headroom, which is why the fanfare is no louder than the line it replaces and makes itself known
// by register and rhythm instead.
//
// **How loud the music is allowed to be is measured, not hoped.** The sequencer sits
// outside the voice budget (see the last paragraph of this header and audio/mix.js), so the
// one thing standing between it and a wall of sound is the arithmetic in `patternPeak`,
// which lays every voice of a pattern's whole form end to end on its own grid and answers
// the loudest instant of any bar in it. It reads the same tables the scheduler plays from, so it cannot drift
// out of date, and `test/music.test.mjs` refuses any pattern whose loudest bar asks for
// more than `MUSIC.peakLoad`. Every price below is written against that number, which is
// what lets a fourth drum or a fifth pad voice be added without repricing the bus.
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
// **The music is not on the voice budget, and still is not.** The budget in mix.js exists
// because a crowded sky asks a frame for thirty sounds and cannot know in advance what it is
// full of; a sequencer knows exactly what it will play before it plays it - the whole
// pattern's voice count is countable from the tables below - and a voice turned away from a
// pattern is not a spare tick, it is a hole in the bar. Its loudness is bounded instead, and
// bounded by measurement: the loudest instant of the heaviest pattern is `MUSIC.peakLoad`
// (0.5, measured by `patternPeak`), half of which the music bus takes off (audio/engine.js),
// so the busiest the music can ever be is half of what a full sky of effects is already
// allowed - music you feel under a fight, never a wall on top of it - and both still go
// through the one compressor.
//
// One thing in this file is not the sequencer: `auditionMusic`, the single note the music's
// volume slider answers with. It is here rather than in sfx.js because it has to be played on
// the music's bus to say anything at all, and it is one voice per keypress instead of a
// pattern, so nothing about the grid or its meter is asked to make room for it.

import { STATE } from '../game/state.js';
import { isVacuuming } from '../game/vacuum.js';
import { getContext, getMusicBus, isMuted } from './engine.js';
import { noiseVoice } from './noise.js';

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
  /**
   * s of run before the drums join - PLAN section 5's "drums after 2:00", and read off
   * `world.elapsed` rather than counted here, so a run paused over its cards does not spend
   * its way to the drum kit while the player is reading.
   */
  drumsAfter: 120,
  /**
   * How much hull is left when the music strips down to its nerves - PLAN's "a stripped,
   * tense version at 1 hull". One pip of any of the five ships, which is the state where
   * one more mistake ends the run, and it outranks a boss being in the arena: "you are about
   * to die" is the louder fact of the two.
   */
  lastHull: 1,
  /**
   * The loudest one instant any pattern may ask of the music bus, in the unit every `vol`
   * here is written in, as measured by `patternPeak`. A ceiling and not a target: the
   * heaviest pattern comes in under it and the bus gain (audio/engine.js) is priced against
   * this number, so the price of a new layer is paid out of what is left and not out of the
   * fight's headroom.
   */
  peakLoad: 0.5,
};

/** s an oscillator keeps sounding past the close of its envelope (the same tail sfx uses). */
const VOICE_TAIL = 0.03;

/** The one arithmetic every tone table below needs: MIDI note number to hertz. */
function hz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// A natural-minor progression, one chord per bar, and **eight bars to a phrase**: Am - F - C - G,
// then Am - F - Dm - G. The first four are the tonic, submediant, mediant and subtonic - the
// loop this soundtrack was built on - and the second four turn back over the tonic and take the
// subdominant instead of the mediant in the seventh bar, so the end of the phrase leans home
// rather than repeating the beginning. Eight bars of harmony is the smallest phrase that can
// say something and come back: at four bars the ear hears a loop, at eight it hears a sentence.
//
// Every note of every chord is in A natural minor, and the tonic's minor third is the only
// minor third in it, which is what makes it sound sad-and-driving instead of merely sad. Roots
// are MIDI numbers in the bass register (A2 is 110 Hz - the same number as the BPM, which is a
// happy accident worth having): each bar's chord is [root, third, fifth] and the layers below
// take it apart. `third` is 3 for the two minor chords and 4 for the major ones, and it is
// part of the chord and not of the key: the figure notation spells it `t` so one line can be
// handed either.
/** A natural minor as pitch classes: the only notes any figure in this file may ask for. */
export const KEY = [9, 11, 0, 2, 4, 5, 7];

export const CHORDS = [
  { root: 45, third: 3 },  // A minor - i
  { root: 41, third: 4 },  // F       - VI
  { root: 48, third: 4 },  // C       - III
  { root: 43, third: 4 },  // G       - VII
  { root: 45, third: 3 },  // A minor - i     (the phrase turns back over the tonic)
  { root: 41, third: 4 },  // F       - VI
  { root: 50, third: 3 },  // D minor - iv
  { root: 43, third: 4 },  // G       - VII
];


// The pad: the whole triad, an octave above the root, both of its oscillators of each note
// nudged a comma apart so the chord breathes instead of standing still. Slow on, slow off,
// one chord per bar with a tail over the bar line - the layer a title screen is made of.
const PAD = { wave: 'sawtooth', vol: 0.02, attack: 0.6, dur: 2.5, spread: 1.004 };
// The same pad read harsher, for a boss: detuned twice as far apart, so the chord does not
// so much breathe as swim, and voiced with the scale's second against the root (see
// `harshTones`). It is quieter than the plain one for exactly that reason - eight voices of
// a grinding pair cost more of the bar than six of a soft one, and the ceiling is a sum.
const PAD_BOSS = { wave: 'sawtooth', vol: 0.013, attack: 0.35, dur: 2.3, spread: 1.009 };
// The bass: sawtooth for grit at a low level, six steps to a bar on the driving offbeats,
// walking to the fifth and up an octave at the end of the bar so the loop leans into the
// next one instead of starting square. Four bars of it make a phrase: the statement, the same
// shape with the fifth moved up a step, an answer that starts on the fifth, and a turnaround
// that lands the octave early. Everything in them is a chord tone - 0, the third, the fifth, the
// octave - which is what lets one phrase be handed to any of the eight bars and stay home.
const BASS = { wave: 'sawtooth', vol: 0.105, attack: 0.008, dur: 0.24 };
const BASS_BARS = [
  '0..0..0.7...0..c',   // the statement, as long as the groove has been this line
  '0..0..7...0..c..',   // the same shape with the answer a step earlier
  '0...7...0..0..c.',   // the answer, from the fifth down
  '0..0..7.0...c...',  // and the turnaround, landing the octave on the way out
];
// Under it, the sub: a clean sine on the bar's own root, held most of the bar. This is the
// oomph - the saw's own fundamental is a bright, filtered thing and on laptop speakers most of
// what was low about it never arrives, so the weight of the music now sits on a waveform that
// puts all of its energy where the ear hears weight. One long note a bar, and always the root:
// a moving sub walks into the wrong chord, and a held one is the floor everything else stands on.
const SUB = { wave: 'sine', vol: 0.05, attack: 0.03, dur: 1.6 };
const SUB_BARS = ['0...............'];
// The boss's bass: the same idea on eighths instead of six offbeat steps - eight hits to a
// bar, a shorter note so they stay apart at the faster grid, and a quarter of the level taken
// off because there are a third more of them per second. Motion over the bar line stays
// (the fifth, then the octave, then a walk home) so it still leans forward, and two bars of it
// alternate so the eighth notes do not flatten into a drill.
const BASS_BOSS = { wave: 'sawtooth', vol: 0.095, attack: 0.006, dur: 0.17 };
const BASS_BOSS_BARS = ['0.0.7.0.0.0.c.7.', '0.0.7.0.c.0.7.0.'];
// The stripped bass of the last hull: the root, twice a bar, held long enough to be a drone
// rather than a note. This is the pulse the tension is built out of - the run's heartbeat
// when everything else about it has been taken away.
const BASS_LAST = { wave: 'sawtooth', vol: 0.095, attack: 0.03, dur: 0.85 };
const BASS_LAST_BARS = ['0.......0.......'];
// The arpeggio: a square-wave chip line two octaves up, one note per pair of sixteenths,
// climbing the chord and back down. The quietest layer by far - it is sparkle, not tune. Two
// bars of it, so the climb and the turn-around alternate and the figure never quite repeats.
const ARP = { wave: 'square', vol: 0.042, attack: 0.004, dur: 0.13 };
const ARP_BARS = ['..0.t.7...c.7.t.', '..0.t.7.0...7.t.'];
// The boss's arpeggio: the same chip voice, but the gaps are filled in - eleven notes to a
// bar instead of six, most of them sixteenths apart, and the figure turns back on itself
// instead of climbing, which is what makes it read as urgent rather than as busier.
const ARP_BOSS = { wave: 'square', vol: 0.038, attack: 0.003, dur: 0.1 };
const ARP_BOSS_BARS = ['0.7tc.7.0.7tc7c.', '0.7tc.7tc0.7t.c.'];
// And the one note the stripped pattern keeps of the arpeggio: the chord's third, an octave
// above where the arpeggio lives, once to a bar, long and alone. A run at one hull is not
// quiet because the game stopped - it is quiet because it is listening to you.
const PING = { wave: 'triangle', vol: 0.045, attack: 0.02, dur: 1.4 };
const PING_BARS = ['t...............'];
// The lead: the tune. Where every other line is a figure being handed to a chord, this one is a
// melody - three long notes a bar, a breath apart, on the chord's own tones and an octave above
// the root, which is the register nobody else in the arrangement occupies: the bass is under it,
// the pad is the same chord slower, the arpeggio is sparkle two octaves up. It is the one place
// the soundtrack sings instead of drives, and it is why the kit and the tune arrive together at
// two minutes: a drum you can walk to and a line you can hum are the two things a run that has
// settled into itself deserves.
//
// The eight bars are one sentence: the call goes up the chord (octave, third, fifth), the answer
// comes down it, the middle of the phrase turns the same shape over the subdominant and the tonic
// again, and the last bar leaves the fifth hanging into the loop. `test/music.test.mjs` proves
// every note of it is in the key and every note on a beat is a tone of the chord it lands on.
const LEAD = { wave: 'triangle', vol: 0.045, attack: 0.05, dur: 0.78 };
const LEAD_BARS = [
  'c...t...7.......',   // i     - up the chord: the call
  '7.......c...t...',   // VI    - and back down
  'c.......t...7...',   // III   - the call again, a bar earlier in the phrase
  '7...t...c.......',   // VII   - the answer, landing on the octave
  'c...t...c.......',   // i     - home, and holding it
  't.......7...c...',   // VI    - the shape, stretched
  '7...c...t.......',   // iv    - the subdominant, which is the new bar of the phrase
  'c...........7...',   // VII   - and the fifth left hanging into the loop
];
// The fanfare (game/vacuum.js): what the music plays while the point vacuum is open. It takes
// the arpeggio's slot *and* the lead's and spends both on one tune - the arpeggio is sparkle and
// the lead is the run's own melody, and a reward wants the melody to itself - and
// it is written the way every other line here is: intervals from the bar's own chord, so it is
// consonant on all eight bars of the progression and can begin on any bar the sequencer happens to
// be standing in when the well opens.
//
// The shape is the oldest one in the book: four notes running up the chord, the octave held, an
// answer coming back down, and a rest at the end of the bar so the next one lands on a clean beat.
// It is one bar long for the same reason the arpeggio is - the sequencer never has to remember where
// a figure started, which is what lets a reward interrupt a bar and still be music.
const FANFARE = { wave: 'square', vol: 0.038, attack: 0.004, dur: 0.26 };
const FANFARE_BARS = ['0t7tc...c.7.t...'];
// One note to say the music's slider moved. It is priced like a voice of the pad (0.02) on
// purpose: it is the only thing this bus gets that `patternPeak` has not metered, and a pad's
// price is the one number known to fit on top of any bar the sequencer can write.
const AUDITION = { wave: 'triangle', vol: 0.02, attack: 0.006, dur: 0.16 };

// The drums: three of them, all synthesis, none of them a loop. A kick is a chip kick - one
// triangle falling through most of two octaves in a seventh of a second (`from` to `drop`),
// which is the oldest drum in the language and the only one that still cuts through a
// sawtooth bass. A crack is the backbeat and a burst of the same noise buffer the explosions
// use (their filters close the same way, over a hundredth of the time): noise for the snare
// is what stops the kit sounding like three beeps. A tick is a closed hi-hat on the offbeats
// and by far the quietest thing here, because a hat that can be heard on its own is a hat
// that has eaten the mix.
const KICK = { wave: 'triangle', from: 150, drop: 46, vol: 0.095, attack: 0.004, dur: 0.14 };
// The same instrument played as a heartbeat for the last hull: lower, softer, and taking a
// twentieth of a second to arrive instead of a two-hundred-and-fiftieth, which is the
// difference between a drum and a pulse you feel in your chest instead of one you hear.
const THUMP = { wave: 'triangle', from: 118, drop: 41, vol: 0.08, attack: 0.05, dur: 0.34 };
const CRACK = { dur: 0.17, cutoff: 2600, sweep: 700, q: 1.1, vol: 0.055 };
const TICK = { dur: 0.05, cutoff: 9000, sweep: 5500, q: 0.9, vol: 0.028 };

/**
 * A drum: the voice it is, and the bars it plays on - one figure, or a list of them. A kit that
 * plays one bar forever is a loop; a kit that answers the phrase it just played is a drummer.
 */
function drum(row, figures) {
  return { row, bars: (Array.isArray(figures) ? figures : [figures]).map(hits) };
}

/**
 * A bar of one drum, written as the sixteen characters it is: `x` hits, anything else does
 * not. Sixteen characters are easier to read than sixteen booleans, and `hits` refuses
 * anything that is not a bar, so a figure with a typo cannot quietly shift a kit by a step.
 */
function hits(figure) {
  const bar = figure.split('');
  if (bar.length !== STEPS_PER_BAR) {
    throw new Error('a drum figure is ' + STEPS_PER_BAR + ' characters: ' + figure);
  }
  return bar;
}

/**
 * The same kit with a fill at the end of every phrase of `every` bars: the last bar of the kit's
 * own loop is played `fill` instead. That is the whole of what a fill is in a sequencer that must
 * not remember anything between steps - a bar that is different because of where it falls, and
 * nothing more clever than that.
 */
function fills(kit, every, fill) {
  const out = {};
  for (const name of Object.keys(kit)) {
    const bars = kit[name].bars.slice();
    while (bars.length < every) bars.push(bars[0]);
    const last = fill[name];
    if (last) {
      for (let at = every - 1; at < bars.length; at += every) bars[at] = hits(last);
    }
    out[name] = { row: kit[name].row, bars };
  }
  return out;
}

/**
 * A pitched bar, written as the same sixteen characters a drum bar is: `.` is nothing, a hex
 * digit is that many semitones above the bar's own chord root, and `t` is that chord's third -
 * the one note a figure cannot spell as a number, because this progression has both a minor and
 * a major third in it and one line has to be handable to either.
 *
 * Written against the chord and not against the key is what keeps a line in key wherever the
 * sequencer happens to be standing when it starts: the notes that are safe on *every* bar of the
 * phrase are 0, 2, 7, the octave, and the chord's own third, and `test/music.test.mjs` holds
 * every figure in this file to being a chord tone on a beat and a note of A natural minor
 * everywhere else.
 */
function figure(text) {
  if (typeof text !== 'string' || text.length !== STEPS_PER_BAR) {
    throw new Error('a figure is ' + STEPS_PER_BAR + ' characters: ' + text);
  }
  if (/[^.0-9a-f t]/.test(text)) throw new Error('a figure is rests, hex, and t: ' + text);
  return text;
}

/** What one character of a figure owes: nothing, an interval, or the bar's own third. */
function intervalAt(ch, chord) {
  if (ch === '.') return null;
  if (ch === 't') return chord.third;
  return parseInt(ch, 16);
}

/**
 * One line of the pattern book: a voice, the bars it plays (one figure per bar of its own loop,
 * which has to divide the pattern's form), and the octave it lives in above the chord root. The
 * octave is why the arpeggio and the bass can both be written `0..t..7.` and be nothing like the
 * same line.
 */
function line(voice, figures, octave) {
  const bars = (Array.isArray(figures) ? figures : [figures]).map(figure);
  return { voice, bars, octave: octave || 0 };
}

/** The four-on-the-floor the run earns at two minutes, on the offbeats for the hat - and a fill
 * to close every eight bars, so the kit is playing something else one bar in eight because the
 * phrase is turning over. */
const KIT_RUN = fills({
  kick: drum(KICK, ['x...x...x...x...', 'x...x...x..x..x.']),
  crack: drum(CRACK, ['....x.......x...', '....x.....x.x...']),
  tick: drum(TICK, ['..x...x...x...x.', '..x.x.x...x...x.']),
}, 8, { kick: 'x...x...x...x.x.', crack: '....x...x...x...' });
// The boss's kit: the kick on every eighth, the hat on the eighths in between them, and the
// crack on the backbeat with a ghost note in front of each of the next pair - a kit that
// never lets the foot settle, which is most of what "harsher" means when it is heard. The
// hat going *between* the kicks and not on top of them is the other half of it: two drums
// landing together is one thud, and eight thuds a bar is a wall.
const KIT_BOSS = fills({
  kick: drum(KICK, ['x.x.x...x.x.x...', 'x.x.x...x.x.x.x.']),
  crack: drum(CRACK, ['....x..x....x..x', '....x..x..x.x.x.']),
  tick: drum(TICK, ['.x.x.x.x.x.x.x.x', 'x.x.x.x.x.x.x.x.']),
}, 8, { kick: 'x.x.x...x.x.xxx.', crack: '....x..x....x.xx' });
// And the stripped one: the heartbeat, and nothing else. Two low pulses a bar, about the
// speed of a real one at rest, over the drone - the whole kit reduced to the one thing
// nobody mistakes for music when they are alone in the arena with one hull left.
const KIT_LAST = { kick: drum(THUMP, ['x.......x.......', 'x...............']) };

/** The pad's own chord: the triad an octave above the root, and no octave on top of it -
 * the layer already doubles every note across two slightly detuned oscillators, and a third
 * copy of the top of the chord is not a wider chord, it is just louder. */
function padTones(chord) {
  return [12, 12 + chord.third, 19];
}

/**
 * The same chord voiced for a boss: the root, the note a whole tone above it, the third and
 * the fifth - and no octave to sit on.
 *
 * A note against the one a whole tone over it is the sharpest rub this key can ask for, and
 * it is the one rub that stays *inside* it: every chord of the progression has the scale's
 * own second a whole tone above its root (A over B, F over G, C over D, G over A), so the
 * boss's chord grates without ever sounding like a wrong note. Losing the octave is the
 * other half of it - a chord with nothing above it to lean on keeps leaning.
 */
function harshTones(chord) {
  return [12, 14, 12 + chord.third, 19];
}

/** One line of the pattern book: a voice, and which step of the bar it plays on. */

/**
 * The rules of the pattern book, applied as the book is built rather than remembered by a test:
 *
 * - the form is a whole number of eight-bar chord phrases, because a figure that lands on a
 *   different chord the second time round is a wrong note you can hear;
 * - every part's figure list divides the form, for the same reason the other way round: a bass
 *   whose four bars do not fit the form would start its statement on the subdominant;
 * - every pitched figure is sixteen characters of rests, hex and `t`, and every drum figure is
 *   sixteen characters (`figure` and `hits` both refuse anything else on the way in).
 */
function checked(spec) {
  if (spec.bars % CHORDS.length !== 0) {
    throw new Error(spec.name + ' is ' + spec.bars + ' bars: the phrase is ' + CHORDS.length);
  }
  const parts = ['sub', 'bass', 'arp', 'lead'].map((key) => spec[key]).filter(Boolean);
  const kits = spec.drums ? Object.values(spec.drums) : [];
  for (const part of parts.concat(kits)) {
    if (spec.bars % part.bars.length !== 0) {
      throw new Error(spec.name + ' has a ' + part.bars.length + '-bar figure in a '
        + spec.bars + '-bar form');
    }
  }
  return spec;
}

/** A pattern, and the rules applied to it. */
function pattern(spec) {
  return checked(spec);
}

/**
 * The five patterns the game knows. `rate` is how fast the grid itself runs against the
 * 110 BPM the file is named for - 1 is the grid as written, and anything above it is every
 * part of the music getting faster together, chord changes included, which is the only way
 * "a faster pattern" that does not sound like a stutter was ever going to work.
 *
 * `bars` is the form: how long the arrangement is before it starts again, and every part's
 * figure list has to divide it (`checked`). Eight bars is one turn of the harmony, which is the
 * shortest form that can state something and come back for it.
 *
 * `harsh` says whether the chord is voiced with the scale's second rubbing on its root. A
 * `null` in a slot means that part is not playing at all, which is what makes the last hull
 * *stripped* and not merely quiet.
 */
const TITLE = pattern({
  name: 'title', bars: 8, rate: 1, pad: PAD, harsh: false, bass: null, arp: null, drums: null,
});
const RUN = pattern({
  name: 'run', bars: 8, rate: 1, pad: PAD, harsh: false,
  sub: line(SUB, SUB_BARS), bass: line(BASS, BASS_BARS), arp: line(ARP, ARP_BARS, 24), drums: null,
});
// The run two minutes in: the same groove, and the two things a run that has settled into itself
// has earned - a kit you can walk to and a tune you can hum.
const DRIVING = pattern({
  ...RUN, name: 'driving', drums: KIT_RUN, lead: line(LEAD, LEAD_BARS, 12),
});
// The fight: a third faster, with the scale's second rubbing on every chord. No tune - the boss
// pattern is the loudest thing the bus is allowed to write and its arpeggio is already the busiest
// line in the book, so the melody stays with the run that has to survive it.
const BOSS = pattern({
  name: 'boss', bars: 8, rate: 4 / 3, pad: PAD_BOSS, harsh: true,
  sub: line(SUB, SUB_BARS), bass: line(BASS_BOSS, BASS_BOSS_BARS),
  arp: line(ARP_BOSS, ARP_BOSS_BARS, 24), drums: KIT_BOSS,
});
const LAST = pattern({
  name: 'last', bars: 8, rate: 1, pad: PAD, harsh: false,
  bass: line(BASS_LAST, BASS_LAST_BARS), arp: line(PING, PING_BARS, 24), drums: KIT_LAST,
});

/**
 * One pattern with the fanfare over it: the same parts, the same tempo and the same chord, with
 * one slot spent on the reward's tune. Where the pattern has a melody line the fanfare takes
 * that - the reward *is* the tune, and it would be a strange prize that arrived while the run's
 * own melody kept singing - and where it has none, as the first two minutes have none, the
 * fanfare takes the arpeggio's slot instead and the sparkle is what pays for it. It is a whole
 * pattern and not a switch because that is what `patternPeak` can measure - "loud enough to be
 * the reward" is a number, and the number is held to the same ceiling as every other pattern by
 * `test/music.test.mjs`.
 */
function fanfareOver(spec) {
  const over = { ...spec, name: spec.name + '-fanfare', fanfare: true };
  if (spec.lead) over.lead = line(FANFARE, FANFARE_BARS, 12);
  else over.arp = line(FANFARE, FANFARE_BARS, 24);
  return checked(over);
}

const RUN_FANFARE = fanfareOver(RUN);
const DRIVING_FANFARE = fanfareOver(DRIVING);
const BOSS_FANFARE = fanfareOver(BOSS);
const LAST_FANFARE = fanfareOver(LAST);

/** Every pattern by name, for the tests and the load meter, which have to be able to name one. */
export const PATTERNS = {
  title: TITLE, run: RUN, driving: DRIVING, boss: BOSS, last: LAST,
  'run-fanfare': RUN_FANFARE, 'driving-fanfare': DRIVING_FANFARE,
  'boss-fanfare': BOSS_FANFARE, 'last-fanfare': LAST_FANFARE,
};

/** The four a run can be playing when the well opens, by the name of the pattern they were made from. */
const FANFARED = {
  run: RUN_FANFARE, driving: DRIVING_FANFARE, boss: BOSS_FANFARE, last: LAST_FANFARE,
};

const NO_MUSIC = null;

/**
 * Which pattern the run is playing, out of what the world says about itself.
 *
 * The title breathes; a run - and a run paused for its cards, which is still the same run
 * holding its breath - drives; and the two endings are silent on purpose: the hush after
 * the last fight and the death's card both belong to what the run just did, not to a tune
 * over the top of it. Above that, three things make the music change its mind, in this
 * order and for these reasons:
 *
 * 1. **One hull left** strips it to the drone and the one high note, and it outranks a boss
 *    being in the arena. PLAN asked for this one and it is the strongest statement the
 *    music can make: taking the groove away is scarier than adding one.
 * 2. **A boss in the arena** speeds the grid up by a third and harshens everything.
 * 3. **Two minutes in**, the drums come in and stay - PLAN's own threshold, read off the
 *    run's clock, so a run that dies at 90 s never heard them and a run that spends a
 *    minute reading its cards does not get them early.
 *
 * Above all three stands **the point vacuum** (game/vacuum.js), which is the one thing in the run
 * that buys the music a tune of its own for ten seconds: whatever the run was playing gets its
 * arpeggio swapped for the fanfare, so the reward is heard *over* the fight it happened in rather
 * than instead of it. It outranks a boss and it outranks the last hull because it is ten seconds
 * long and it is the game paying you out - the run's own business comes back on its own clock after
 * it, and the same pattern is waiting there.
 *
 * Nothing re-anchors when it begins. The sequencer is scheduled up to `lookahead` ahead of the audio
 * clock, so dropping the clock to make the figure start on a bar's head would play two bars at once -
 * and a figure written in intervals of the bar's own chord cannot make a wrong note entering a bar
 * halfway through it. This is the same bargain the boss pattern has always made with a bar already in
 * progress, and for the same reason.
 */
function patternFor(world) {
  const state = world.state;
  if (state === STATE.START) return TITLE;
  if (state !== STATE.PLAY && state !== STATE.LEVEL) return NO_MUSIC;
  const ship = world.player;
  const base = ship && ship.hull <= MUSIC.lastHull ? LAST
    : world.boss ? BOSS
    : world.elapsed >= MUSIC.drumsAfter ? DRIVING
    : RUN;
  return isVacuuming(world) ? FANFARED[base.name] : base;
}

let stepIndex = 0;   // how far into the progression the schedule has reached
let nextAt = -1;     // audio-clock time the next step is due; negative means "not started"
const ledger = { steps: 0, notes: 0, drums: 0, melody: 0, subs: 0, anchors: 0, pattern: 'silent' };
// How long the run has spent in each pattern, in seconds of music actually scheduled. The
// tests and `tools/simulate.js --audio` read this to check the intensity curve happened at
// all instead of hoping a threshold was crossed somewhere.
const heard = {};

/**
 * What the sequencer has done this page visit: steps scheduled, notes voiced (drums among
 * them), how many of those were drums, how many were the tune, how many were the sub, how many
 * times the clock ran out from under it and had to be re-anchored, where it stands in the
 * progression, which pattern it is in right now, and how long each pattern has been playing. A
 * copy, and never reset, for the same reason the mix ledger is neither (audio/mix.js).
 */
export function musicLedger() {
  return {
    steps: ledger.steps,
    notes: ledger.notes,
    drums: ledger.drums,
    melody: ledger.melody,
    subs: ledger.subs,
    anchors: ledger.anchors,
    position: stepIndex,
    pattern: ledger.pattern,
    heard: { ...heard },
  };
}

/**
 * One voice on the music bus: an oscillator, an envelope, a start and a stop. `tone.drop`
 * is the kick's falling pitch - a target in hertz, and the only voice in the game's music
 * that is not a steady note. Answers whether it was started, because the ledger is written
 * by the caller that asked for the voice and not here (see `scheduleStep`).
 */
function voice(actx, freq, tone, when) {
  const bus = getMusicBus();
  if (!bus) return false;
  try {
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = tone.wave;
    osc.frequency.setValueAtTime(freq, when);
    if (tone.drop) osc.frequency.exponentialRampToValueAtTime(tone.drop, when + tone.dur);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, tone.vol), when + tone.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + tone.dur);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(when);
    osc.stop(when + tone.dur + VOICE_TAIL);
  } catch (err) {
    // One dropped voice is not worth losing a frame over, same bargain as audio/sfx.js.
    return false;
  }
  return true;
}

/**
 * The note a slider answers with: the tonic of the key the whole soundtrack is in (A4), and
 * where it goes from there - up a fifth or down a fourth, both notes of the key, so the answer
 * is a piece of the tune and not a test beep.
 */
export const AUDITION_NOTE = { at: hz(69), up: hz(69 + 7), down: hz(69 - 5) };

/**
 * One note on the music bus, to say the music's slider moved.
 *
 * It is on the bus and not beside it, which is the whole point: the level you just set is the
 * loudness you hear, so the answer needs no arithmetic of its own. It rises if you turned the
 * slider up and falls if you turned it down - the same two words the interface ticks are
 * spoken in (game/balance.js `ui`).
 *
 * And it is only played when there is music to hear, because `patternFor` says so: on a
 * death's card or the win's hush the bus is silent by choice and a note out of nowhere would
 * be a lie about what the game is doing. It is not sequenced and not ledged, for the same
 * reason it is not metered against `MUSIC.peakLoad`: it is one voice, one per keypress, and
 * it belongs to the interface and not to the pattern.
 */
export function auditionMusic(world, rising) {
  const actx = getContext();
  if (!actx || isMuted()) return false;
  if (patternFor(world) === NO_MUSIC) return false;
  if (actx.state === 'suspended' && actx.resume) actx.resume();
  const tone = { ...AUDITION, drop: rising ? AUDITION_NOTE.up : AUDITION_NOTE.down };
  return voice(actx, AUDITION_NOTE.at, tone, actx.currentTime + 0.001);
}

/** The bar's chord, spread across two oscillators a comma apart: six voices, eight when harsh. */
function padVoices(chord, pattern) {
  const tones = pattern.harsh ? harshTones(chord) : padTones(chord);
  const out = [];
  for (const tone of tones) {
    const f = hz(chord.root + tone);
    out.push({ freq: f * pattern.pad.spread, tone: pattern.pad });
    out.push({ freq: f / pattern.pad.spread, tone: pattern.pad });
  }
  return out;
}

/**
 * Every voice one step of one pattern owes, as plain data: `{ freq, tone }` for an
 * oscillator and `{ hiss }` for a burst of noise, either of them carrying `drum` when the
 * voice was asked for by a kit. Both the scheduler and the load meter below read this and
 * nothing else, which is the reason the number that keeps the bus honest cannot drift away
 * from the music it is supposed to be measuring.
 */
function stepVoices(pattern, index) {
  const inBar = index % STEPS_PER_BAR;
  const bar = Math.floor(index / STEPS_PER_BAR);
  const chord = CHORDS[bar % CHORDS.length];
  const out = inBar === 0 ? padVoices(chord, pattern) : [];

  // The four pitched lines are one loop: whichever parts this pattern has, their own bar of the
  // figure list is resolved against this bar's chord and lifted into their own octave.
  for (const key of ['sub', 'bass', 'arp', 'lead']) {
    const part = pattern[key];
    if (!part) continue;
    const interval = intervalAt(part.bars[bar % part.bars.length][inBar], chord);
    // `melody` and `sub` ride along on the note so the ledger can say how much of the music is
    // the tune and how much is the floor: "did the run ever get a melody" is a question the
    // tests and `tools/simulate.js --audio` ask, and neither can answer it off a bare note count.
    if (interval !== null) {
      out.push({
        freq: hz(chord.root + part.octave + interval), tone: part.voice,
        melody: key === 'lead', sub: key === 'sub',
      });
    }
  }
  if (pattern.drums) {
    for (const name of ['kick', 'crack', 'tick']) {
      const hit = pattern.drums[name];
      if (!hit || hit.bars[bar % hit.bars.length][inBar] !== 'x') continue;
      // A drum with a wave is a pitch falling through itself; the rest are the noise buffer -
      // and either way it is a drum, which is what the ledger below is asked to count.
      if (hit.row.wave) out.push({ freq: hit.row.from, tone: hit.row, drum: true });
      else out.push({ hiss: hit.row, drum: true });
    }
  }
  return out;
}

/**
 * How loud one pattern can get: the loudest single instant of any bar of its form, counted by
 * laying every voice it owes end to end on its own grid and adding up what is sounding at
 * each point of it - through each voice's envelope, so a slow one is worth what it is worth
 * at that moment and not its full price for its whole length. Two bars are walked because
 * the pad's tail crosses the bar line - the loudest instant of a bar is nearly always the
 * first step of the next one, with the last chord still ringing under it - and the
 * measurement is taken in the second so both bars' tails are in the picture.
 *
 * Exported for `test/music.test.mjs`, which holds every pattern under `MUSIC.peakLoad`.
 */
export function patternPeak(name) {
  const pattern = PATTERNS[name];
  if (!pattern) throw new Error('no music pattern is called ' + name);
  const step = STEP_SECONDS / pattern.rate;
  const bar = STEPS_PER_BAR * step;
  const voices = [];
  for (let index = 0; index < STEPS_PER_BAR * (pattern.bars + 1); index++) {
    const at = index * step;
    for (const v of stepVoices(pattern, index)) {
      const row = v.hiss || v.tone;
      // A burst of noise has no attack of its own to name: noiseVoice rises over 6 ms
      // whatever it is handed (audio/noise.js), which is what the 0.006 below is.
      voices.push({ from: at, vol: row.vol, attack: row.attack || 0.006, dur: row.dur });
    }
  }
  let peak = 0;
  // The whole form, and one bar past it: a form is the point of a form, so the bar that is
  // loudest - usually the fill at the end of the phrase - has to be in the picture, and the bar
  // that starts the loop again is measured with the last bar's tail under it because that is
  // what a loop is.
  for (let t = bar; t < bar * (pattern.bars + 1); t += 0.005) {
    let sum = 0;
    for (const v of voices) sum += envelopeAt(v, t);
    if (sum > peak) peak = sum;
  }
  return Math.round(peak * 1000) / 1000;
}

/**
 * What one voice is worth at time `t`, envelope and all: up from nothing across its attack,
 * then back down to nothing by the close of its length. The envelope is part of the number
 * and not a detail - the pad is on for two and a half seconds but takes six tenths of a
 * second to arrive, so the moment two chords genuinely overlap is the quietest moment the
 * pad has, and a meter that counted a voice at full volume for its whole length would be
 * measuring a wall the sequencer never writes.
 */
function envelopeAt(voice, t) {
  const since = t - voice.from;
  if (since < 0 || since > voice.dur) return 0;
  if (since < voice.attack) return voice.vol * (since / voice.attack);
  return voice.vol * (1 - (since - voice.attack) / Math.max(0.001, voice.dur - voice.attack));
}

function scheduleStep(actx, index, when, pattern) {
  for (const v of stepVoices(pattern, index)) {
    const started = v.hiss
      ? noiseVoice(actx, getMusicBus(), v.hiss.vol, v.hiss, when)
      : voice(actx, v.freq, v.tone, when);
    if (started) {
      ledger.notes++;
      if (v.drum) ledger.drums++;
      if (v.melody) ledger.melody++;
      if (v.sub) ledger.subs++;
    }
  }
}

/**
 * Wind the sequencer. main.js calls this once per frame with the world; it does nothing
 * until a context exists (audio starts on the first input, like everything else here) and
 * nothing while the game is muted.
 *
 * One frame's pattern is used for the whole window of music it schedules - up to half a
 * second ahead - so a boss arriving or a hull going is heard as the next half bar changing
 * and not as a seam in the middle of one.
 */
export function updateMusic(world) {
  const actx = getContext();
  if (!actx || isMuted()) return;

  const pattern = patternFor(world);
  if (pattern === NO_MUSIC) {
    // Silence is dropping the schedule, not sitting on it: whatever was already
    // scheduled rings out on its own, and there is nothing half-ready to resume
    // when the screen changes.
    nextAt = -1;
    ledger.pattern = 'silent';
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

  const step = STEP_SECONDS / pattern.rate;
  ledger.pattern = pattern.name;
  while (nextAt < now + MUSIC.lookahead) {
    scheduleStep(actx, stepIndex, nextAt, pattern);
    ledger.steps++;
    heard[pattern.name] = (heard[pattern.name] || 0) + step;
    stepIndex++;
    nextAt += step;
  }
}

