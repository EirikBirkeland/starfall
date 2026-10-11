// The music: a step sequencer wound by the frame, on the audio clock, whose patterns are
// the run itself answering. Everything here is measured through the ledger of
// audio/music.js - what it scheduled and voiced - on the fake audio device, whose clock
// is the frame clock (tools/headless/harness.js), so the run's seconds and the music's
// seconds are the same seconds.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { STATE } from '../src/game/state.js';
import { BALANCE } from '../src/game/balance.js';
import { resetBosses } from '../src/game/bosses.js';
import { MUSIC, PATTERNS, CHORDS, KEY, musicLedger, patternPeak } from '../src/audio/music.js';

const ROOT = path.resolve(import.meta.dirname, '..');
// `audio` builds the device and `autoplay` is a browser that lets this page make a sound before it has
// been asked: this file is about what the sequencer does with a running clock, and it wants one from
// the first frame rather than from a press in the right order. (The strict visit - device asleep until
// a hand wakes it - is audio/engine.js's business and `test/menu-track-wake.test.mjs` holds it.)
const game = await bootGame({ root: ROOT, seed: 5, audio: true, autoplay: true });

/** Seconds one idle frame is worth on this machine's clocks. */
const FRAME = 0.0167;

/** Step `frames` times and answer how many *steps of music* those frames bought. */
function stepsOver(frames) {
  const before = musicLedger();
  for (let i = 0; i < frames; i++) game.step();
  return musicLedger().steps - before.steps;
}

/** ...and how many notes. */
function notesOver(frames) {
  const before = musicLedger();
  for (let i = 0; i < frames; i++) game.step();
  return musicLedger().notes - before.notes;
}

/**
 * What a stretch of frames bought the sequencer: steps, notes, how many of the voices were
 * drums, and which pattern the schedule was in at the end of it.
 */
function musicOver(frames) {
  const before = musicLedger();
  for (let i = 0; i < frames; i++) game.step();
  const after = musicLedger();
  return {
    seconds: frames * FRAME,
    steps: after.steps - before.steps,
    notes: after.notes - before.notes,
    drums: after.drums - before.drums,
    melody: after.melody - before.melody,
    subs: after.subs - before.subs,
    pattern: after.pattern,
  };
}

/** How thick the music is, in voices per second of run. Density is how intensity is heard. */
function density(played) {
  return played.notes / played.seconds;
}

/**
 * What each rung of the ladder measured, filled in as the tests below walk one run through
 * the whole of it, because each rung is compared against the one below it and a number that
 * belongs to two tests belongs to whichever ran first.
 */
const ladder = {};

test('the sequencer keeps time with the audio clock, not the frame count', () => {
  // 240 idle title frames are 4.008 s, and at 110 BPM in sixteenths the grid owes
  // one step every 0.136 s of that - whatever number of frames it took to pass. The
  // allowance is the lookahead buffer plus the starting gap: the schedule always runs
  // ahead of the clock it is measured against, and it is not allowed to run behind it.
  const seconds = 240 * FRAME;
  const owed = seconds / MUSIC.stepSeconds;
  const got = stepsOver(240);
  assert.ok(got >= owed, 'the schedule ran behind the clock: ' + got + ' steps for ' + owed);
  assert.ok(got <= owed + MUSIC.lookahead / MUSIC.stepSeconds + 1,
    'and it ran no further ahead than the buffer: ' + got + ' steps');
});

test('the title is a pad, and a run fills it out', () => {
  // The same frames on the same clock: the title can only be voicing the chord, and a
  // running arena owes the bass and the arpeggio on top of it. "Layers come in as
  // intensity rises" (PLAN section 5) measured as a density, not as a hope.
  const title = notesOver(480);
  assert.ok(title > 0, 'the title has music at all: ' + title + ' notes');

  game.pressMouse(640, 240);
  game.moveMouse(900, 360);
  game.world.player.invuln = Infinity;   // this file is not about dying
  const run = notesOver(480);
  assert.ok(run > title * 2,
    'a run is more than twice the music of a title: ' + run + ' against ' + title);
});

test('the endings cut the music dead', () => {
  // The win's hush and the death's card both belong to what the run just did, so the
  // sequencer drops its schedule entirely - and drops it *cleanly*: no steps are even
  // counted while the screen is silent, because there is nothing sitting half-scheduled
  // to resume the moment the screen changes.
  game.world.state = STATE.WON;
  let before = musicLedger();
  for (let i = 0; i < 60; i++) game.step();
  let after = musicLedger();
  assert.equal(after.notes, before.notes, 'nothing is voiced through the hush');
  assert.equal(after.steps, before.steps, 'and nothing is even counted');

  game.world.state = STATE.OVER;
  before = musicLedger();
  for (let i = 0; i < 60; i++) game.step();
  after = musicLedger();
  assert.equal(after.notes, before.notes, 'and the death card is quiet too');

  // And the next thing that flies starts the tune again from its top, not from wherever
  // this one left off mid-phrase.
  game.world.state = STATE.PLAY;
  game.step();
  after = musicLedger();
  assert.ok(after.anchors > before.anchors, 'the clock was re-anchored');
  assert.ok(after.position <= MUSIC.lookahead / MUSIC.stepSeconds + 1,
    'and it restarted from the top of the progression, not the middle: position ' + after.position);
});

test('a clock that jumps does not make the music chase it', () => {
  // A backgrounded tab comes back thirty seconds late. The honest answer is one bar's
  // worth of catch-up budget and a fresh start, not two hundred seconds of past music
  // dumped on the present at once.
  const before = musicLedger();
  game.step(30000);
  game.step();
  game.step();
  const got = musicLedger().steps - before.steps;
  assert.ok(got <= MUSIC.stepsPerBar,
    'a late frame scheduled at most a bar, got ' + got + ' steps');
});

test('a run walks the ladder: the groove, then the drums, then the nerves', () => {
  // The same ship, the same arena, the same frames - and the music changing its mind about
  // all three because the run told it how far in it was and how much hull was left. This is
  // PLAN section 5's whole intensity sentence, read back out of the sequencer one rung at a
  // time (audio/music.js `patternFor`).
  const world = game.world;
  world.state = STATE.PLAY;
  world.player.invuln = Infinity;      // this file is not about dying
  world.player.hull = world.player.maxHull;

  world.elapsed = 5;
  ladder.run = musicOver(600);
  assert.equal(ladder.run.pattern, 'run', 'a run in its first minutes is bass and arpeggio');

  world.elapsed = MUSIC.drumsAfter + 2;
  ladder.driving = musicOver(600);
  assert.equal(ladder.driving.pattern, 'driving', 'two minutes in, the drums are in');

  world.player.hull = MUSIC.lastHull;
  assert.equal(musicOver(120).pattern, 'last', 'one hull left strips it');

  world.player.hull = world.player.maxHull;
  assert.equal(musicOver(60).pattern, 'driving', 'and a hull bought back puts the groove back');
});

test('the drums and the tune are what arrives at 2:00, and nothing else is', () => {
  // Not just "more notes": the kit and the melody both have to be absent before the threshold and
  // present after it - the reward for two minutes of surviving is a drummer *and* a tune to hum -
  // and the groove underneath has to be the *same* music, or what arrived at two minutes was a new
  // pattern and not a band joining the one that was already playing (audio/music.js `patternFor`).
  game.world.elapsed = 20;
  const early = musicOver(600);
  assert.equal(early.pattern, 'run');
  assert.equal(early.drums, 0, 'nothing is beating before its time');
  assert.equal(early.melody, 0, 'and nothing is singing either');

  game.world.elapsed = MUSIC.drumsAfter + 1;
  const late = musicOver(600);
  assert.ok(late.drums > 20, 'the kit is playing: ' + late.drums + ' drum voices in ' + late.seconds + 's');
  assert.ok(late.melody > 6, 'and so is the tune: ' + late.melody + ' notes of it');

  // And the groove underneath them is literally the same music - not "about the same density in a
  // ten second window", which a form makes a fuzzy number anyway: the two patterns share the same
  // three lines, figure list for figure list, so what arrived at two minutes was a band joining
  // the groove and not a new groove.
  for (const key of ['sub', 'bass', 'arp']) {
    assert.equal(PATTERNS.driving[key], PATTERNS.run[key], 'the ' + key + ' is the same line');
  }
});

test('a boss walks in and the grid speeds up under it', () => {
  // The first fight on the schedule, brought on by the schedule itself: the clock is parked
  // just before it is due and the frames are stepped until the cage shuts. The pattern is
  // not being told a boss is here; it is reading `world.boss`, which only the director writes.
  const world = game.world;
  world.state = STATE.PLAY;
  world.player.hull = world.player.maxHull;
  world.elapsed = BALANCE.bosses.schedule[0].at - 0.1;
  let guard = 0;
  while (world.boss === null && guard < 3000) {
    // A run five minutes deep has level-ups owed to it, and the cards hold the arena still -
    // so the wait for the fight lets them go past. This file is not about the cards.
    if (world.state === STATE.LEVEL) world.state = STATE.PLAY;
    game.step();
    guard++;
  }
  assert.ok(world.boss, 'the schedule brought the first fight on, in ' + guard + ' frames');

  ladder.boss = musicOver(600);
  assert.equal(ladder.boss.pattern, 'boss');
  // "Faster" measured as the only thing that cannot be faked: steps of music per second of
  // run. The grid is running at `PATTERNS.boss.rate`, so the schedule owes that many more
  // steps than the run's own clock bought.
  const owed = ladder.boss.seconds / MUSIC.stepSeconds;
  assert.ok(ladder.boss.steps > owed * 1.2,
    'the grid ran faster than the run\'s: ' + ladder.boss.steps + ' steps where ' + Math.round(owed) + ' were owed');
  assert.ok(density(ladder.boss) > density(ladder.driving) * 1.5,
    'and the bar is fuller than the run it replaced: ' + density(ladder.boss).toFixed(1)
      + ' against ' + density(ladder.driving).toFixed(1));
  assert.ok(ladder.boss.drums > ladder.driving.drums,
    'and the kit is working harder than it ever did in a crowd');
});

test('one hull outranks a boss, and the music says so', () => {
  // The fight is still standing in the arena when this runs. The ship drops to a pip and the
  // groove is taken away from it - which is the decision `patternFor` argues for in its own
  // comment: "about to die" is the louder fact of the two, and taking the drums away lands
  // harder than adding any number of them.
  game.world.player.hull = MUSIC.lastHull;
  const nerves = musicOver(600);
  assert.ok(game.world.boss, 'the boss is still in there, unheard');
  assert.equal(nerves.pattern, 'last');
  assert.ok(density(nerves) < density(ladder.run),
    'stripped is thinner than the groove it replaced: ' + density(nerves).toFixed(1)
      + ' against ' + density(ladder.run).toFixed(1));
  assert.ok(nerves.drums > 0, 'the heartbeat is still there: ' + nerves.drums + ' pulses');
  assert.ok(nerves.drums * 3 < ladder.driving.drums,
    'and it is a heartbeat and not a kit: ' + nerves.drums + ' against ' + ladder.driving.drums);

  game.world.player.hull = game.world.player.maxHull;
  assert.equal(musicOver(60).pattern, 'boss', 'and a hull bought back goes straight back to the fight');
});

test('the point vacuum buys the run a fanfare over the pattern it was already playing', () => {
  // The owner's second half of the request: "during this 10 second event, play some excited music".
  // It is a layer swap and not a new groove (audio/music.js): the run keeps its tempo, its drums and
  // its chord, and the arpeggio's slot is spent on a tune instead - which is what lets a reward
  // interrupt a boss fight without ever stopping it, and what keeps its loudness a measured number
  // rather than a hope (the four `-fanfare` patterns are metered like every other one, below).
  const world = game.world;
  world.state = STATE.PLAY;
  world.player.hull = world.player.maxHull;
  // The fight the last test brought in is put away by the same door a new run puts it away by
  // (game/bosses.js `resetBosses`) - a boss body left in the crowd without its fight is not a thing
  // the painter knows how to draw. With the schedule spent, nothing else walks in mid-test.
  resetBosses(world);
  world.enemies.length = 0;      // and the crowd goes with the fight: a boss's own body is not a
  // thing the painter can draw once its fight is gone, and nothing in this file is about the crowd
  world.bossIndex = BALANCE.bosses.schedule.length;
  world.elapsed = MUSIC.drumsAfter + 1;

  const plain = musicOver(600);
  assert.equal(plain.pattern, 'driving');

  // Longer than the measuring window on purpose: `left` is spent in step time, so a well of exactly
  // the row's ten seconds would be shut again by the end of the ten seconds of frames below.
  world.vacuum.left = BALANCE.vacuum.duration * 2;
  const warm = musicOver(600);
  assert.equal(warm.pattern, 'driving-fanfare', 'the same groove with the tune over it');
  assert.ok(warm.notes > plain.notes,
    'and the reward has more line than the melody it replaced: ' + warm.notes + ' against '
      + plain.notes);
  // The kit goes on playing through a fanfare - it never stopped for the reward - but a kit with a
  // fill in it is not the same number of hits in every ten seconds of it, so this is a proportion
  // and not a count: `fills` puts one extra kick in eight bars, and the two windows do not start
  // in the same place in the phrase.
  assert.ok(warm.drums > plain.drums * 0.8 && warm.drums < plain.drums * 1.25,
    'the kit never stopped for it: ' + warm.drums + ' against ' + plain.drums);

  world.vacuum.left = 0;
  assert.equal(musicOver(60).pattern, 'driving',
    'and it goes back on its own when the well shuts, with no help');

  // And on the last hull the reward still arrives: the fanfare outranks everything short of an
  // ending, because ten seconds of being paid is not a reason to be nervy.
  world.player.hull = MUSIC.lastHull;
  world.vacuum.left = 4;
  assert.equal(musicOver(60).pattern, 'last-fanfare');
  world.player.hull = world.player.maxHull;
  world.vacuum.left = 0;
});

test('the ledger says how long the run spent in every pattern', () => {
  // What `tools/simulate.js --audio` prints as the run's intensity curve, and the reason
  // the ledger carries seconds and not just counts: "did that run ever reach the drums" is
  // a question about how long, and a step count cannot answer it once the boss sped the grid.
  const heard = musicLedger().heard;
  for (const name of ['title', 'run', 'driving', 'boss', 'last']) {
    assert.ok(heard[name] > 0, 'the sequencer spent time in ' + name + ': ' + heard[name]);
  }
  assert.ok(heard.boss < heard.run, 'and the numbers are durations, not a tally of frames');
});

const PARTS = ['sub', 'bass', 'arp', 'lead'];

test('every note of every figure is in the key, and on a beat it is a tone of the chord', () => {
  // The claim audio/music.js makes about its own notation, checked rather than trusted: a figure
  // is written as intervals from the bar's own chord so it can be handed any chord in the phrase
  // and stay in A natural minor - and the one thing that has to be true for that to be more than a
  // nice idea is that every figure is only ever handed chords it was written against. Every note
  // on a beat is a tone of the chord under it; a note off a beat may be any note of the key.
  let checked = 0;
  for (const [name, pattern] of Object.entries(PATTERNS)) {
    for (const key of PARTS) {
      const part = pattern[key];
      if (!part) continue;
      part.bars.forEach((bar, figureAt) => {
        bar.split('').forEach((ch, step) => {
          // Which chords this figure can ever be played over: the sequencer walks the form in
          // order, so figure `i` of a `k`-figure list lands on bars i, i+k, i+2k of the form.
          for (let barAt = figureAt; barAt < pattern.bars; barAt += part.bars.length) {
            const chord = CHORDS[barAt % CHORDS.length];
            const interval = ch === '.' ? null : (ch === 't' ? chord.third : parseInt(ch, 16));
            if (interval === null) continue;
            checked++;
            const pitch = (chord.root + part.octave + interval) % 12;
            assert.ok(KEY.includes(pitch), name + '.' + key + ' bar ' + barAt + ' step ' + step
              + ' plays ' + pitch + ', which is not in the key: ' + bar);
            if (step % 4 === 0) {
              const tones = [0, chord.third, 7, 12].map((t) => t % 12);
              assert.ok(tones.includes(interval % 12), name + '.' + key + ' bar ' + barAt
                + ' puts ' + interval + ' on a beat and the chord is ' + JSON.stringify(chord));
            }
          }
        });
      });
    }
  }
  assert.ok(checked > 400, 'the sweep actually looked at the music: ' + checked + ' notes');
});

test('a pattern is a form, and every figure list divides it', () => {
  // The arithmetic that keeps a four-bar bass phrase from starting its statement on the
  // subdominant once the loop comes round (audio/music.js `checked`, which the pattern book runs
  // itself on the way past - this is the second opinion, and the one that notices if the two ever
  // stop agreeing).
  for (const [name, pattern] of Object.entries(PATTERNS)) {
    assert.equal(pattern.bars % CHORDS.length, 0,
      name + ' is ' + pattern.bars + ' bars, and the chord phrase is ' + CHORDS.length);
    const lists = PARTS.map((key) => pattern[key]).filter(Boolean)
      .concat(pattern.drums ? Object.values(pattern.drums) : []);
    for (const part of lists) {
      assert.equal(pattern.bars % part.bars.length, 0,
        name + ' has a ' + part.bars.length + '-bar figure in a ' + pattern.bars + '-bar form');
      for (const bar of part.bars) assert.equal(bar.length, MUSIC.stepsPerBar);
    }
  }
});

test('the basic song is not one bar on a loop', () => {
  // The owner's complaint, made a number: "the basic song should be less repetitive". Every part
  // of a running pattern has to have more than one bar of material, the harmony's second half has
  // to differ from its first, and the kit has to do something different at the end of a phrase -
  // a fill is the one thing in a loop that proves somebody is playing it rather than replaying it.
  const phrase = CHORDS.slice(0, 4).map((c) => c.root).join(',');
  assert.notEqual(phrase, CHORDS.slice(4).map((c) => c.root).join(','),
    'the eight-bar phrase is two four-bar halves that are not the same');

  for (const name of ['run', 'driving', 'boss']) {
    const pattern = PATTERNS[name];
    assert.ok(new Set(pattern.bass.bars).size > 1, name + ' plays more than one bar of bass');
    assert.ok(new Set(pattern.arp.bars).size > 1, name + ' plays more than one bar of arpeggio');
    assert.ok(new Set(pattern.sub.bars).size >= 1, name + ' holds the floor');
  }
  assert.equal(new Set(PATTERNS.driving.lead.bars).size, PATTERNS.driving.lead.bars.length,
    'the tune is a through-composed line and not one bar repeated');

  for (const name of ['driving', 'boss']) {
    const kit = PATTERNS[name].drums;
    const names = Object.keys(kit);
    const filled = names.filter((drumName) => kit[drumName].bars.at(-1).join('') !== kit[drumName].bars[0].join(''));
    assert.ok(filled.length > 0, name + '\'s kit plays something different at the end of the phrase');
    assert.ok(filled.includes('kick') || filled.includes('crack'),
      name + '\'s fill is on a drum you can hear: ' + filled.join(', '));
  }
});

test('the oomph: a sine holds the floor under the saw', () => {
  // "More oomph" bought where oomph lives - the octave the saw bass is brightest in and laptop
  // speakers are weakest - and not by turning the music up (audio/engine.js keeps the bus gain
  // fixed against MUSIC.peakLoad no matter what the arrangement does). Three things have to be
  // true for that claim: the sub is a sine, it is the lowest thing playing, and it is actually
  // being scheduled in a running game (which the ledger below is for).
  for (const name of ['run', 'driving', 'boss']) {
    const sub = PATTERNS[name].sub;
    assert.equal(sub.voice.wave, 'sine', name + '\'s floor is a sine, not a second saw');
    assert.ok(sub.voice.vol > 0);
    assert.ok(sub.voice.dur > MUSIC.stepSeconds * 4,
      name + '\'s sub holds long enough to be a floor and not a note');
    for (const key of ['bass', 'arp', 'lead']) {
      if (PATTERNS[name][key]) {
        assert.ok(sub.octave <= PATTERNS[name][key].octave,
          name + '.' + key + ' sits under the sub, which is not the arrangement this is');
      }
    }
  }
  assert.equal(PATTERNS.title.sub, undefined, 'the title is a pad and has no floor to hold');
  const played = musicLedger();
  assert.ok(played.subs > 0, 'and a real run heard it: ' + played.subs + ' notes of floor');
});

test('the tune sings in a register of its own', () => {
  // The one line that is a melody rather than a figure handed to a chord: long notes (longer than
  // anything else in the pattern), in the octave between the bass and the sparkle, arriving with
  // the kit. Written any higher it would be a siren, any lower it would be a second bass.
  const driving = PATTERNS.driving;
  assert.ok(driving.lead.voice.dur > driving.arp.voice.dur, 'the tune is the long line');
  assert.ok(driving.lead.voice.dur > driving.bass.voice.dur, 'and longer than the bass too');
  assert.ok(driving.lead.octave > driving.bass.octave, 'above the bass');
  assert.ok(driving.lead.octave < driving.arp.octave, 'below the arpeggio');
  assert.equal(PATTERNS.run.lead, undefined, 'the first two minutes have no tune: that is what they are for');
});

test('the fanfare spends the melody slot, or the sparkle\u2019s if there is no melody', () => {
  // The reward takes whichever line was carrying the tune. Where there is one it is the melody that
  // steps aside (the run's own tune should not keep singing over the game paying it out) and the
  // sparkle stays; in the first two minutes, where there is no tune, the arpeggio is what pays.
  const over = PATTERNS['driving-fanfare'];
  assert.equal(over.lead.bars.length, 1, 'the fanfare is one bar, so it can start anywhere');
  assert.ok(PATTERNS.driving.lead.bars.length > 1, 'and it is the eight-bar tune that made room');
  assert.equal(over.arp.bars, PATTERNS.driving.arp.bars, 'the arpeggio never stopped');
  assert.equal(PATTERNS['run-fanfare'].arp.bars.length, 1,
    'on a run too young to have a tune, the sparkle is what is spent');
  assert.deepEqual(PATTERNS['run-fanfare'].arp.bars, PATTERNS['driving-fanfare'].lead.bars,
    'and it is the same fanfare, spent on whichever slot the pattern had to give');
});

test('the load meter walks the whole form and not just its first bar', () => {
  // The mutation the form made necessary: if `patternPeak` had quietly gone back to measuring one
  // bar, every claim about the ceiling would be about bar one and the fill at the end of the phrase
  // could ask for anything. So make the last bar of a phrase louder and watch the number move.
  const name = 'driving';
  const kit = PATTERNS[name].drums.kick;
  const before = patternPeak(name);
  const last = kit.bars[kit.bars.length - 1];
  const was = last.slice();
  for (let i = 0; i < last.length; i += 4) last[i] = 'x';
  const filled = patternPeak(name);
  kit.bars[kit.bars.length - 1] = was;
  assert.ok(filled >= before, 'the last bar of the form is in the meter: ' + filled + ' against ' + before);
  assert.equal(patternPeak(name), before, 'and the meter is back where the music is');
});

test('no pattern may ask the bus for more than its ceiling', () => {
  // The one number keeping the music under the fight, since the sequencer is deliberately
  // outside the voice budget (audio/mix.js). `patternPeak` reads the same tables the
  // scheduler plays from, so this cannot quietly go stale the way a hand-written claim in a
  // comment can - and the mutation check below is what proves it is wired to them.
  for (const name of Object.keys(PATTERNS)) {
    const peak = patternPeak(name);
    assert.ok(peak > 0, name + ' writes music at all: ' + peak);
    assert.ok(peak <= MUSIC.peakLoad, name + ' peaks at ' + peak + ' of a ' + MUSIC.peakLoad + ' bus');
  }
  // And the ceiling is not simply the biggest number in the file: the ladder the meter
  // measures has to be the ladder the run walks, quietest to loudest.
  assert.ok(patternPeak('title') < patternPeak('run'), 'the title is the quietest thing here');
  assert.ok(patternPeak('run') < patternPeak('driving'), 'the kit is louder than the groove');
  assert.ok(patternPeak('driving') <= patternPeak('boss'), 'and a fight is the loudest of all');
  assert.ok(patternPeak('last') < patternPeak('run'), 'and the last hull is under the run it came from');
});

test('the load meter reads the tables and not a remembered number', () => {
  // The mutation this file would otherwise be missing: every peak above is measured, so
  // making the pad louder has to show up in it. If this ever stays green with the pad
  // turned up, the meter has been cut adrift from the music and every claim above is one.
  const pad = PATTERNS.title.pad;
  const before = patternPeak('title');
  pad.vol += 0.04;
  const louder = patternPeak('title');
  pad.vol -= 0.04;
  assert.ok(louder > before, 'a louder pad is a louder title: ' + louder + ' against ' + before);
  assert.equal(patternPeak('title'), before, 'and the meter is back where the music is');
});

test('mute takes the music with everything else', () => {
  game.key('KeyM', true);
  const before = notesOver(120);
  assert.equal(before, 0, 'a muted page schedules no music');

  game.key('KeyM', false);
  game.key('KeyM', true);   // the switch lives on keydown, so this pair is an unmute
  assert.ok(notesOver(60) > 0, 'and unmuting brings it back');
});
