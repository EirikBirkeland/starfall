// The noise: the buffer, the voice it makes, the price it pays, and the blanket it pulls
// over the music when the ship is hurt.
//
// Everything is measured on the fake audio device (tools/headless/harness.js), which counts
// buffer sources the way it counts oscillators and writes down every filter sweep it is
// asked for. The old-machine cases are not booted at all - a process boots one game - they
// are handed the units directly, the same way `test/mix.test.mjs` hands `buildMaster` a
// machine with nothing optional in it.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { clearCues, cueNoise } from '../src/game/cues.js';
import { getContext, hasMusicTone, initAudio, isMuted, muffleMusic, setMuted } from '../src/audio/engine.js';
import { consumeCues } from '../src/audio/sfx.js';
import { noiseVoice, noiseVoices } from '../src/audio/noise.js';
import { MIX, ledgerOf, takeVoice } from '../src/audio/mix.js';
import { hitPlayer } from '../src/game/player.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 7, audio: true });

// What a browser's first click does (src/main.js). Nothing is heard before it.
initAudio();

/** Was any filter on this machine swept to exactly `hz`? */
function sweptTo(hz) {
  return game.audio.ramps.some((r) => r.op === 'exp' && r.v === hz);
}

/** Did the music's blanket get pulled, and then let back up? */
function musicLetBackUp() {
  return game.audio.ramps.some((r) => r.op === 'target' && r.v > 10000);
}

/** Step frames until the audio clock has moved `seconds` on. */
function waitFrames(seconds) {
  for (let i = 0; i < Math.ceil(seconds / 0.0167); i++) game.step();
}

test('every noise row in the game is a real sweep', () => {
  // A row is data and data is typed, so this is the check that a `noise:` line names the
  // four things a voice needs. `share` is what the hiss costs against the tone it lies under
  // (game/balance.js), so it has to be a fraction and not a shout.
  const rows = [];
  (function walk(node) {
    if (node === null || typeof node !== 'object') return;
    if (node.noise !== undefined) rows.push(node);
    for (const key of Object.keys(node)) walk(node[key]);
  })(BALANCE);

  assert.ok(rows.length >= 5, 'the deaths, the blasts, the boss, the dash and the hit: ' + rows.length);
  for (const row of rows) {
    const spec = row.noise;
    assert.ok(spec.dur > 0 && spec.dur < 2, 'a voice of a sane length: ' + spec.dur);
    assert.ok(spec.cutoff > 30 && spec.cutoff < 20000, 'a cutoff inside hearing: ' + spec.cutoff);
    assert.ok(spec.sweep > 30 && spec.sweep < 20000, 'a sweep that lands inside hearing: ' + spec.sweep);
    assert.ok(spec.share > 0 && spec.share <= 1, 'a share of the tone it lies under: ' + spec.share);
    assert.ok(row.vol > 0, 'and a tone for it to be a share of');
  }
});

test('a noise cue is one voice, through a swept filter, on a shared buffer', () => {
  const row = BALANCE.death.sound;
  const before = noiseVoices();
  cueNoise(row.noise, row.vol * row.noise.share);
  consumeCues(STATE.PLAY);

  assert.equal(noiseVoices() - before, 1, 'one voice');
  assert.equal(game.audio.buffers, 1, 'and the first of them built the buffer');
  assert.ok(sweptTo(row.noise.sweep), 'and its filter was swept to where the row says');

  // A second voice is the same two seconds of grain, sliced somewhere else.
  cueNoise(row.noise, row.vol * row.noise.share);
  consumeCues(STATE.PLAY);
  assert.equal(noiseVoices() - before, 2, 'a second voice');
  assert.equal(game.audio.buffers, 1, 'on the same buffer');
});

test('the buffer is built once, and it is noise', () => {
  assert.equal(game.audio.buffers, 1, 'one buffer for the whole page visit');
  // The harness hands back a real Float32Array, so the fill the game wrote into it is here
  // to be looked at: it has to be actual grain, and it has to stay inside the bus.
  const built = game.audio.noiseData;
  assert.ok(built.length > 40000, 'two seconds of it: ' + built.length);
  let sum = 0;
  let peak = 0;
  let crossings = 0;
  for (let i = 0; i < built.length; i++) {
    const v = built[i];
    assert.ok(v >= -1 && v <= 1 && v === v, 'a finite sample between the rails');
    sum += Math.abs(v);
    if (Math.abs(v) > peak) peak = Math.abs(v);
    if (i > 0 && (v < 0) !== (built[i - 1] < 0)) crossings++;
  }
  assert.ok(sum / built.length > 0.2, 'loud all the way through, not a hole: ' + sum / built.length);
  assert.ok(peak > 0.5, 'and it reaches for the rails: ' + peak);
  assert.ok(crossings > built.length / 10, 'grain, not a tone: ' + crossings + ' crossings');
});

test('the mix prices a hiss like any other voice', () => {
  // The whole sky paid for in advance, on the clock the voice is about to be scheduled on:
  // a hiss that arrives into that is turned away exactly as the thirtieth shard ping is.
  waitFrames(0.2);
  const now = getContext().currentTime;
  const before = ledgerOf();
  const noiseBefore = noiseVoices();
  assert.ok(takeVoice(MIX.headroom, 0.05, now, false), 'the sky is fillable');

  const row = BALANCE.death.sound;
  cueNoise(row.noise, row.vol * row.noise.share);
  consumeCues(STATE.PLAY);

  assert.equal(noiseVoices(), noiseBefore, 'and the hiss was turned away');
  assert.ok(ledgerOf().dropped > before.dropped, 'and the books say so');
  waitFrames(0.2);   // let the borrowed sky be spent and given back
});

test('a muted game voices no noise', () => {
  setMuted(true);
  const before = noiseVoices();
  cueNoise(BALANCE.player.dash.sound.noise, 0.05);
  consumeCues(STATE.PLAY);
  assert.equal(noiseVoices(), before, 'the mute switch is upstream of all of it');
  setMuted(false);
  assert.ok(!isMuted());
  clearCues();
});

test('the ship being hurt sweeps the music behind a wall', () => {
  // A run under way, on a ship that can be hurt: this is the one cue in the game that is not
  // a sound but a filter being moved, and it arrives with the thud and not instead of it.
  game.pressMouse(640, 240);
  game.moveMouse(900, 360);
  game.step();
  const world = game.world;
  world.player.invuln = 0;
  world.player.hull = 3;

  const noise = noiseVoices();
  const to = BALANCE.playerHit.duck.to;
  assert.ok(!sweptTo(to), 'nothing has muffled the music yet');
  hitPlayer(world, {});
  game.step();

  assert.ok(noiseVoices() > noise, 'the thud voiced its noise');
  assert.ok(sweptTo(to), 'the blanket came down to ' + to + ' Hz');
  assert.ok(musicLetBackUp(), 'and was let back up again');
});

test('the blanket needs a filter, and says when there is none', () => {
  assert.ok(hasMusicTone(), 'this machine has one');
  assert.ok(muffleMusic(400, 0.5), 'and the sweep was made');
});

test('a machine with none of the optional parts still plays', () => {
  // No compressor, no filters, no buffers: `audio: 'raw'` in the harness, hand-built here
  // because a process boots one game and this file has already booted its. The rule is the
  // engine's (audio/engine.js) and it is the noise voice's too - an old browser is not a
  // reason for the game to go silent, let alone to stop.
  const knob = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const bare = {
    destination: {},
    sampleRate: 44100,
    currentTime: 1,
    createGain: () => ({ gain: knob(), connect() {} }),
  };
  const before = noiseVoices();
  assert.equal(noiseVoice(bare, bare.createGain(), 0.05, { dur: 0.1, cutoff: 900, sweep: 60 }), false);
  assert.equal(noiseVoices(), before, 'and nothing was voiced');

  // A machine with buffers but no filter is worse than the bare one - it fails halfway
  // through building a voice - and it is still only a dropped voice.
  const halfBroken = Object.assign({}, bare, {
    createBuffer(channels, length, rate) {
      return { getChannelData: () => new Float32Array(length), length };
    },
    createBufferSource: () => ({ buffer: null, loop: false, start() {}, stop() {}, connect() {} }),
  });
  assert.equal(noiseVoice(halfBroken, bare.createGain(), 0.05, { dur: 0.1, cutoff: 900, sweep: 60 }), false);
});
