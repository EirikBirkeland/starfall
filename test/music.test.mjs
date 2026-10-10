// The music: a step sequencer wound by the frame, on the audio clock, whose layers are
// the run's state answering. Everything here is measured through the ledger of
// audio/music.js - what it scheduled and voiced - on the fake audio device, whose clock
// is the frame clock (tools/headless/harness.js), so the run's seconds and the music's
// seconds are the same seconds.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { STATE } from '../src/game/state.js';
import { initAudio } from '../src/audio/engine.js';
import { MUSIC, musicLedger } from '../src/audio/music.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 5, audio: true });

// The title is music before it is a run - but only once something has given the page an
// audio context, which in a browser is the first key or click and here is this call.
initAudio();

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

test('mute takes the music with everything else', () => {
  game.key('KeyM', true);
  const before = notesOver(120);
  assert.equal(before, 0, 'a muted page schedules no music');

  game.key('KeyM', false);
  game.key('KeyM', true);   // the switch lives on keydown, so this pair is an unmute
  assert.ok(notesOver(60) > 0, 'and unmuting brings it back');
});
