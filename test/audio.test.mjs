// Sound, with a fake audio device standing in for the machine's.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { getMusicBus, getSfxBus } from '../src/audio/engine.js';
import { bootGame } from '../tools/headless/harness.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 5, audio: true });

test('shots, kills, and pickups all reach the synthesiser', () => {
  // The device is built at boot (audio/engine.js `openAudioDevice`) so that a browser which lets the
  // page make a sound can hear the menu's song, and its clock stays stopped until a press - so what
  // may not move on the title screen is the voice count: the graph's own gains are built and nothing
  // is played on them.
  const graph = game.audio.voices;
  assert.equal(game.audioState, 'suspended', 'the device was awake before anybody pressed anything');
  for (let i = 0; i < 20; i++) game.step();
  assert.equal(game.audio.voices, graph, 'the title screen spent voices before there was a press');

  // The mouse launches the run. Space would too, but it is the dash key as well
  // and this file is not about the dash - see test/controls.test.mjs.
  game.pressMouse(640, 240);
  game.moveMouse(900, 360);
  // The ship cannot be hurt here. This file measures the synthesiser, and a run
  // that ended halfway through would go quiet for reasons that are not about audio.
  game.world.player.invuln = Infinity;
  for (let i = 0; i < 240; i++) game.step();

  assert.ok(game.audio.voices > 10, 'firing and killing should cost voices, got ' + game.audio.voices);
});

test('effects and music each have their own bus', () => {
  // The context has been up since boot and is running now (the launch pressed it awake), and everything
  // the game plays reaches one of the two buses: the effects queue and the sequencer have no other
  // way to be heard, and the mute switch reaches both through the master above them.
  assert.ok(getSfxBus(), 'the effects bus is built');
  assert.ok(getMusicBus(), 'and so is the music bus');
});

test('muting stops every voice', () => {
  const before = game.audio.voices;
  game.key('KeyM', true);
  game.moveMouse(300, 300);
  for (let i = 0; i < 120; i++) game.step();
  assert.equal(game.audio.voices, before, 'muted means silent');

  game.key('KeyM', false);
  game.key('KeyM', true);          // the mute switch lives on keydown
  for (let i = 0; i < 60; i++) game.step();
  assert.ok(game.audio.voices > before, 'and unmuting brings it back');
});
