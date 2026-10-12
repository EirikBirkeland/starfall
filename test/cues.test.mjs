// The sound queue (game/cues.js): what the simulation asks the audio layer for, and the two
// rules that come with the records being pooled instead of built per sound.
//
// The queue used to build one object per sound, which is the one thing in a busy step that
// looked free and was not: a darter's beat, two shots landing, a death and the shards it paid
// out is five allocations in one 1/120 s, and `tools/alloc-probe.js` measured the difference
// at 295 B a step on a crowd that is dying - the dearest allocator left in the game. So a cue is
// a record off a pool, and this file keeps the two promises that decision makes:
//
//   - **a drained cue is on loan.** The records go back to the pool when the drain is over, so
//     anything that means to keep one keeps a copy (`copyCue`), and a copy says what it heard
//     forever while the record it came from goes on to be the next sound;
//   - **every queue function writes every field.** A noise cue must not be readable as the
//     beep that used the record before it, which is the same contract `game/effects.js` keeps
//     for sparks, rings and labels.
//
// The last test boots the game and plays a real fight, because the whole point is that a real
// fight stops allocating: that is what `tools/alloc-probe.js` gates in bytes, and this is what
// keeps it honest about which pool the bytes came out of.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BEEP, CHORD, clearCues, copyCue, cueBeep, cueChord, cueMuffle, cueNoise, cueStats,
  drainCues, MUFFLE, NOISE,
} from '../src/game/cues.js';
import { scriptedRun } from '../tools/headless/scripted.js';
import { hear } from '../tools/headless/hear.js';
import { bootGame } from '../tools/headless/harness.js';
import { playOneRun, endingItAt } from '../tools/headless/bot.js';

/** Queue one of every kind, with numbers that tell them apart. */
function oneOfEach() {
  cueBeep(440, 0.1, 'square', 0.5, 660);
  cueChord([523, 659], 0.3, 'triangle', 0.4);
  cueNoise({ dur: 0.4, cutoff: 900, sweep: -600, q: 2 }, 0.6);
  cueMuffle(300, 1.5);
}

test('the four kinds arrive in the order they were asked for, each with its own numbers', () => {
  clearCues();
  oneOfEach();

  const cues = hear();
  assert.equal(cues.length, 4, 'four asks, four cues');
  assert.deepEqual(cues.map((cue) => cue.kind), [BEEP, CHORD, NOISE, MUFFLE]);

  const [beep, chord, noise, muffle] = cues;
  assert.equal(beep.freq, 440);
  assert.equal(beep.slideTo, 660, 'a slide is where the note is going, not how far it went');
  assert.deepEqual(chord.notes, [523, 659], 'a chord keeps the notes it was handed');
  assert.equal(noise.cutoff, 900);
  assert.equal(noise.sweep, -600);
  assert.equal(muffle.to, 300);
  assert.equal(muffle.back, 1.5);
});

test('an empty queue does not bother the drainer', () => {
  clearCues();
  let called = 0;
  drainCues(() => { called++; });
  assert.equal(called, 0, 'nothing was asked for, so there is no batch to hand over');
});

test('clearCues throws the queue away', () => {
  clearCues();
  cueBeep(300, 0.1, 'sine', 0.2, 0);
  clearCues();
  assert.equal(hear().length, 0);
});

test('a run does not inherit the last one\'s sounds', () => {
  // resetRun (game/run.js) is what the queue's `clearCues` is for: the last frame of a dying
  // run can ask for a great deal, and none of it belongs in the arena that starts next.
  cueBeep(200, 0.1, 'sine', 0.2, 0);
  scriptedRun(3);
  assert.equal(hear().length, 0);
});

test('what a drain hands out is on loan, and a copy is yours to keep', () => {
  clearCues();
  cueBeep(220, 0.2, 'sawtooth', 0.3, 330);

  let borrowed = null;
  drainCues((batch) => { borrowed = batch[0]; });
  const kept = copyCue(borrowed);

  // The next frame's sound goes out through the same record, and the borrowed handle follows
  // it - that is the whole of the deal, and it is why `copyCue` exists.
  cueBeep(880, 0.05, 'square', 0.1, 0);
  assert.equal(borrowed.freq, 880, 'the record was handed out again');
  assert.equal(kept.freq, 220, 'the copy is still the note it heard');
  assert.equal(kept.wave, 'sawtooth');
  assert.equal(kept.slideTo, 330);
});

test('every kind writes the whole record, so one cannot be read as another', () => {
  clearCues();
  cueNoise({ dur: 0.5, cutoff: 1200, sweep: 400, q: 3 }, 0.7);
  const noise = hear()[0];
  assert.equal(noise.kind, NOISE);

  clearCues();
  cueBeep(500, 0.1, 'sine', 0.2, 0);
  const beep = hear()[0];

  // A beep uses five of the record's fields. The other six belong to the noise that may well
  // have had this record first, and they have to have gone back to their nothing.
  assert.equal(beep.dur, 0.1, 'the field the two kinds share is the new one, not the old one');
  assert.equal(beep.notes, null, 'no chord left behind');
  assert.equal(beep.cutoff, 0);
  assert.equal(beep.sweep, 0);
  assert.equal(beep.q, 0);
  assert.equal(beep.to, 0);
  assert.equal(beep.back, 0);
  assert.ok(noise.cutoff > 0, 'and the copy taken while it was a noise still says so');
});

test('a listener that throws does not leave the queue stuck full', () => {
  // The records come home through a `finally`, and this is the falsification of that: without
  // it the queue stays live, and every frame after the failure replays the sounds of the one
  // that broke.
  clearCues();
  cueBeep(100, 0.1, 'sine', 0.1, 0);
  cueBeep(200, 0.1, 'sine', 0.1, 0);
  assert.throws(() => drainCues(() => { throw new Error('the audio layer fell over'); }));
  assert.equal(cueStats().live, 0, 'and still the queue took its records back');

  cueBeep(300, 0.1, 'sine', 0.1, 0);
  const after = hear();
  assert.equal(after.length, 1, 'and the next frame is one sound, not three');
  assert.equal(after[0].freq, 300);
});

test('the queue stops building records once it has seen a busy frame', () => {
  clearCues();
  const before = cueStats();
  const frames = 200;
  const perFrame = 40;
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < perFrame; i++) cueBeep(200 + i, 0.1, 'sine', 0.2, 0);
    drainCues(() => {});
  }
  const after = cueStats();
  assert.equal(after.spawned - before.spawned, frames * perFrame, 'every sound was queued');
  assert.ok(after.made - before.made <= perFrame,
    'a batch of ' + perFrame + ' built ' + (after.made - before.made)
    + ' records; a warm queue builds none and a cold one at most one per slot');
  assert.equal(after.live, 0, 'and it keeps none of them live between frames');
});

test('a real fight does not queue an object per sound', async () => {
  const game = await bootGame({ seed: 20261006 });
  await game.resetToTitle(20261006);
  game.pressMouse(640, 360, 0);
  game.step(16.7);

  clearCues();
  const before = cueStats();
  const run = playOneRun(game, { maxSeconds: 300, onFrame: endingItAt(120) });
  assert.equal(run.died, true, 'the run had to end for this to mean anything');
  const after = cueStats();

  const sounds = after.spawned - before.spawned;
  const built = after.made - before.made;
  assert.ok(sounds > 1000,
    'a fight asks for a great deal of sound, or the ratio below is empty; got ' + sounds);
  // Measured on this very run: 4,968 sounds, 15 records, none left live. The ceiling is not a
  // rounding up of 15 - it is "a few frames' worth", because that is the only size the queue is
  // ever asked to be.
  assert.ok(built <= 40, built + ' records built for ' + sounds + ' sounds');
  assert.ok(built * 50 < sounds,
    built + ' records for ' + sounds + ' sounds: they have to be going round and round');
  assert.ok(after.live < 200,
    'and the queue keeps a frame\'s worth, not the run\'s: ' + after.live + ' live');
});
