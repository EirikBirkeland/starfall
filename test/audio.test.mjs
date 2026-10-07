// Sound, with a fake audio device standing in for the machine's.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 5, audio: true });

test('shots, kills, and pickups all reach the synthesiser', () => {
  for (let i = 0; i < 20; i++) game.step();
  assert.equal(game.audio.voices, 0, 'the title screen stays quiet');

  game.pressMouse(640, 240);
  game.key('Space', true);
  game.moveMouse(900, 360);
  for (let i = 0; i < 240; i++) game.step();

  assert.ok(game.audio.voices > 10, 'firing and killing should cost voices, got ' + game.audio.voices);
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
