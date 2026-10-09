// The voice budget: what the mix will let sound at once, and what it turns away.
//
// Two instruments here. The budget itself is arithmetic on a clock, so most of it is asked
// directly of audio/mix.js with a clock the test holds - an hour *before* the page opened, so
// nothing it creates is still sounding when the real clock comes round (see `T`). The rest is
// the synthesiser behind it, which needs an audio device: the fake one from
// tools/headless/harness.js, on a title screen where nothing else may make a sound.
//
// Everything above the boot is a declaration and nothing else, on purpose: node runs a
// top-level `test` as soon as it is declared, so a const under one can be read by a test as
// `undefined`. The device is booted before the first of them and the clock never moves again
// except inside `wait`.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { BALANCE } from '../src/game/balance.js';
import { cueBeep } from '../src/game/cues.js';
import { STATE } from '../src/game/state.js';
import { buildMaster, initAudio, isCompressed } from '../src/audio/engine.js';
import { consumeCues } from '../src/audio/sfx.js';
import { MIX, ledgerOf, loadOfSounding, soundingOf, takeVoice } from '../src/audio/mix.js';
import { bootGame } from '../tools/headless/harness.js';

const ROOT = path.resolve(import.meta.dirname, '..');

/**
 * An hour *before* the page opened.
 *
 * The unit questions below are asked of the budget with a clock of their own, and the budget
 * is one list of voices shared with whatever the real game is doing on the real audio clock -
 * which starts at nothing when the device is built and moves with the frames. An hour in the
 * *future* would leave every voice these tests create still sounding when the real clock
 * arrives, so the clock here runs behind it instead: by the time the device has been up for
 * four seconds, all of this is ancient history and the sky it filled is empty again.
 */
const T = -3600;

/** What three real sounds cost, so the numbers below are the game's and not invented. */
const TICK = BALANCE.upgrades.orbitals.sound.vol;      // a drone bite: the quietest thing here
const DEATH = BALANCE.death.sound.vol;                // a body coming apart
const CHIME = BALANCE.levelUp.sound.vol;              // one note of the level-up's three

/** One voice, priced the way a cue is priced. */
function ask(vol, dur, now, must) {
  return takeVoice(vol, dur === undefined ? 0.1 : dur, now, must);
}

/** Fill the sky and answer how many voices it took to do it. */
function fill(vol, dur, now) {
  let n = 0;
  while (ask(vol, dur, now)) n++;
  return n;
}

// A fake audio device and a title screen that plays nothing of its own. `initAudio` is what
// a browser's first click does (main.js); no run is running here, so every voice below is
// one this file asked for, and the clock only moves when `wait` says so.
const game = await bootGame({ root: ROOT, seed: 5, audio: true });
initAudio();
assert.ok(isCompressed(), 'the engine wired the compressor this machine has');

/** `seconds` of idle frames: the clock moves and the arena never gets a say. */
function wait(seconds) {
  for (let i = 0; i < Math.round(seconds / 0.0167); i++) game.step();
}

test('a voice is priced in its own loudness, and so is the ceiling', () => {
  // The whole design in one promise: what the sky holds is a sum of volumes, so a crowd of
  // ticks and a heap of wrecks are not the same question and do not get the same answer.
  assert.ok(MIX.headroom > 0, 'there is a ceiling at all');
  assert.ok(TICK < DEATH, 'a bite is quieter than a death, which is the whole point of the test');

  const ticks = fill(TICK, 0.2, T);
  assert.ok(ticks > 20, 'a sky of hit ticks is deep: ' + ticks + ' of them');
  assert.ok(loadOfSounding(T) <= MIX.headroom, 'and it is still inside itself');

  const wrecks = fill(DEATH, 0.2, T + 10);
  assert.ok(wrecks < ticks, 'a sky of the louder sound fills in ' + wrecks);
  assert.ok(wrecks >= 2, 'and a ceiling that holds two of those is not one nobody can hear');
});

test('a voice costs the sky for exactly as long as it sounds', () => {
  const before = soundingOf(T + 1000);
  ask(0.1, 0.25, T + 1000);
  assert.equal(soundingOf(T + 1000), before + 1, 'it is sounding now');
  assert.equal(loadOfSounding(T + 1000), 0.1, 'and it is being paid for');

  ask(0.1, 0.25, T + 1000 + 0.2);
  assert.equal(soundingOf(T + 1000 + 0.2), before + 2, 'two of them, a fifth of a second apart');

  // The tail is what the synthesiser stops the oscillator with (audio/sfx.js), so a voice is
  // audible until `dur + tail` and not one frame longer than that - and two voices a fifth of
  // a second apart therefore go out one at a time, which is the whole promise of the test.
  const one = T + 1000 + 0.25 + MIX.tail + 0.001;
  assert.equal(soundingOf(one), before + 1, 'the first is gone and the second is still audible');
  assert.equal(loadOfSounding(one), 0.1, 'and the sum is down to the one that is left');

  const gone = T + 1000 + 0.2 + 0.25 + MIX.tail + 0.001;
  assert.equal(soundingOf(gone), before, 'and then the sky has them both back');
  assert.equal(loadOfSounding(gone), 0, 'and the sum with them');
});

test('a full sky turns the next one away, and says so', () => {
  const before = ledgerOf();
  assert.ok(ask(0.15, 0.2, T + 2000), 'there was room');
  assert.ok(ask(0.15, 0.2, T + 2000), 'and room again');
  assert.ok(ask(0.15, 0.2, T + 2000), 'and once more - three of them fit');
  assert.ok(!ask(0.15, 0.2, T + 2000), 'and the fourth is the one that is too loud');

  const after = ledgerOf();
  assert.equal(after.asked - before.asked, 4, 'all four were asked');
  assert.equal(after.played - before.played, 3, 'three were played');
  assert.equal(after.dropped - before.dropped, 1, 'and the ledger holds the fourth');
  assert.equal(after.loudestDropped, 0.15, 'including how loud the worst turn-down was');
});

test('a chime is never turned away', () => {
  fill(0.1, 0.2, T + 3000);
  assert.ok(!ask(0.02, 0.1, T + 3000), 'the sky is full to a newcomer');

  assert.ok(ask(CHIME, 0.14, T + 3000, true), 'but a chime gets through whatever is on');
  assert.ok(loadOfSounding(T + 3000) > MIX.headroom, 'and the ceiling bends for it, visibly');
});

test('a frame spends its mix on the loudest thing it was asked for', () => {
  wait(2);
  const before = ledgerOf();
  const voices = game.audio.voices;

  // Forty shard pings and one bomber: forty things each worth hearing and one worth more
  // than all of them, queued with the quiet ones first so the mix has to sort them out
  // rather than be handed them in a useful order.
  for (let i = 0; i < 40; i++) cueBeep(1200 + i, 0.05, 'sine', 0.02, 1900);
  cueBeep(84, 0.4, 'sawtooth', 0.2, 34);
  consumeCues(STATE.PLAY);

  const after = ledgerOf();
  const played = after.played - before.played;
  const dropped = after.dropped - before.dropped;
  assert.ok(played > 1, 'the frame made a sound: ' + played + ' voices');
  assert.ok(played < 41, 'and not all of them: ' + dropped + ' were turned away');
  assert.ok(after.loudestDropped < 0.2,
    'and everything turned away was a ping, never the bomber: ' + after.loudestDropped);
  assert.equal(game.audio.voices - voices, played * 2,
    'and it cost one oscillator and one gain per voice played, and no more');
  assert.ok(loadOfSounding(game.audio.currentTime) <= MIX.headroom, 'and the bus is inside itself');
});

test('nothing is turned away while the sky is empty', () => {
  wait(2);
  const before = ledgerOf();
  for (let i = 0; i < 5; i++) cueBeep(700, 0.06, 'square', 0.03, 400);
  consumeCues(STATE.PLAY);
  const after = ledgerOf();
  assert.equal(after.dropped - before.dropped, 0, 'five small voices fit');
  assert.equal(after.played - before.played, 5, 'and all five were played');
});

test('the master bus works on a machine with no compressor', () => {
  // `buildMaster` is exported for exactly this: an old browser is a machine that has to be
  // able to hear the game, and the only cheap way to be sure is to hand the engine one.
  const wire = [];
  const node = () => ({
    gain: { value: 0 }, threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 },
    attack: { value: 0 }, release: { value: 0 },
    connect(to) { wire.push(to); },
  });
  const out = node();
  const raw = { destination: out, createGain: node };

  const chain = buildMaster(raw);
  assert.equal(chain.bus, null, 'there was no compressor to build');
  assert.equal(wire.length, 1, 'and the bus made exactly one connection');
  assert.equal(wire[0], out, 'which is the gain straight to the speakers');
  assert.ok(chain.gain.gain.value > 0, 'and it is a bus you can hear through');
});
