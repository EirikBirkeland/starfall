// A save document from a *newer* build of the game than the one being played.
//
// That is not a theoretical case here: the release menu serves every past version from the same
// origin, so every one of them reads and writes the same localStorage. A player who plays next
// year's build and then picks this one off the shelf is this visit - and the one rule that follows
// from that is that a document from the future is read for the fields this build knows and never
// written over, because this build cannot know what the newer one means by the rest of it.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { makeEnemy } from '../src/game/kinds.js';
import { isMuted, musicLevel } from '../src/audio/engine.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;

// Version 40, with the sections this build knows plus two it has never heard of.
const FUTURE = JSON.stringify({
  version: 40,
  score: { best: 88888, stardust: 1200 },
  audio: { music: 2, effects: 9, muted: true },
  codex: { warden: 'met' },
});

const game = await bootGame({
  root: ROOT,
  seed: 9,
  audio: true,
  storage: { 'starfall.save': FUTURE },
});

test('the fields this build knows are still its own', () => {
  assert.equal(game.world.best, 88888, 'a best remembered by a newer build is a best');
  assert.equal(musicLevel(), 2, 'so is a slider it left down');
  assert.equal(isMuted(), true, 'and a mute it left on');
  assert.equal(game.stats().saveNote, 'written by version 40', 'and it says whose document it is');
  assert.equal(game.stats().saveWritable, false, 'and that this visit may not write');
});

test('a visit on someone else\'s document writes nothing at all', () => {
  game.pressMouse(640, 400);
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.PLAY);

  game.key('BracketRight', true);            // a slider change this visit would like remembered
  game.key('BracketRight', false);
  game.step(FRAME);
  assert.equal(musicLevel(), 3, 'it works for this visit');

  const ship = game.world.player;
  ship.hull = 1;
  ship.invuln = 0;
  ship.fireTimer = 5;
  game.world.score = 999999;                 // ...and so would a record-breaking run
  game.enemies.push(makeEnemy(game.world, 'drifter', ship.x, ship.y, {
    hp: 1, speed: 0, drop: 0, score: 0,
  }));
  game.step();
  assert.equal(game.stats().state, game.STATE.OVER);

  assert.equal(game.storage['starfall.save'], FUTURE,
    'and the newer document is left exactly as it was found, byte for byte');
  assert.equal(game.storage['starfall.best'], undefined,
    'including no new mirror written beside it');
});
