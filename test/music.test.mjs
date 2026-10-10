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
import { initAudio } from '../src/audio/engine.js';
import { MUSIC, PATTERNS, musicLedger, patternPeak } from '../src/audio/music.js';

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

test('the drums are what arrives at 2:00, and nothing else is', () => {
  // Not just "more notes": the kit has to be absent before the threshold and present after
  // it - and the groove underneath it has to be the *same*, or what arrived at two minutes
  // was a new pattern and not a drummer joining the one that was already playing.
  game.world.elapsed = 20;
  const early = musicOver(600);
  assert.equal(early.pattern, 'run');
  assert.equal(early.drums, 0, 'nothing is beating before its time');

  game.world.elapsed = MUSIC.drumsAfter + 1;
  const late = musicOver(600);
  assert.ok(late.drums > 20, 'the kit is playing: ' + late.drums + ' drum voices in ' + late.seconds + 's');
  const groove = late.notes - late.drums;
  assert.ok(Math.abs(groove - early.notes) <= 8,
    'and everything else is the same music it was: ' + groove + ' against ' + early.notes);
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
