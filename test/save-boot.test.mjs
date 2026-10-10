// The save document read through a whole visit: the game boots with something already remembered,
// plays, dies, and restarts, and every number it was supposed to have remembered came out of
// storage and went back into it.
//
// `save.test.mjs` tests the store itself against a fake window. This file is the wiring, which is
// where a save module actually fails: a document nobody reads at boot, a slider restored to the
// graph but not to the number the readout paints, a change that reaches memory and never the
// disk. The storage below is put in place before the game is imported, which is exactly what a
// returning player's browser does.
//
// One game per process, because the modules hold the world - so the "a reload comes back as the
// last visit left it" case is played by booting *this* game on a document that a previous visit
// (any earlier release's, or the one before this reload) wrote.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { makeEnemy } from '../src/game/kinds.js';
import { isMuted, musicLevel, effectsLevel } from '../src/audio/engine.js';
import { panelIsUp } from '../src/render/volume.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;

/** A stored document, written the way the game writes one. */
function document(fields) {
  return JSON.stringify(Object.assign({ version: 1 }, fields));
}

const game = await bootGame({
  root: ROOT,
  seed: 11,
  audio: true,
  storage: {
    'starfall.save': document({
      score: { best: 5234 },
      audio: { music: 7, effects: 3, muted: true },
    }),
  },
});

/** Land an enemy on the ship so the next frame is the last one. */
function killTheShip(score) {
  const ship = game.world.player;
  ship.hull = 1;
  ship.invuln = 0;
  ship.dashLeft = 0;
  ship.fireTimer = 5;
  game.world.score = score;
  game.enemies.push(makeEnemy(game.world, 'drifter', ship.x, ship.y, {
    hp: 1, speed: 0, drop: 0, score: 0,
  }));
  game.step();
}

function stored() {
  return JSON.parse(game.storage['starfall.save']);
}

test('a visit opens with the score it left behind, and says why it is silent', () => {
  // Before a single frame, so the readout below can only have come from the document.
  assert.equal(game.world.best, 5234, 'the title screen already knows your best');
  assert.equal(musicLevel(), 7, 'the music slider came back four steps down');
  assert.equal(effectsLevel(), 3, 'the sounds slider seven');
  assert.equal(isMuted(), true, 'and the master came back shut');
  assert.equal(panelIsUp(), true, 'a game that starts silent says so, unasked');
  assert.equal(game.stats().saveNote, '', 'and the document it read had nothing wrong with it');
  assert.equal(game.stats().saveWritable, true);
});

test('a key pressed this visit is stored where the next visit will look', () => {
  game.key('BracketLeft', true);     // one step down on the music
  game.key('BracketLeft', false);
  game.step(FRAME);
  assert.equal(musicLevel(), 6);
  assert.equal(stored().audio.music, 6, 'it went into the document');
  assert.equal(stored().score.best, 5234, 'without disturbing the rest of it');

  game.key('KeyM', true);            // and the mute is the same story
  game.key('KeyM', false);
  game.step(FRAME);
  assert.equal(isMuted(), false);
  assert.equal(stored().audio.muted, false);
});

test('a run that does not beat the best does not touch it', () => {
  game.pressMouse(640, 400);
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.PLAY);
  killTheShip(1200);
  assert.equal(game.stats().state, game.STATE.OVER);
  assert.equal(game.screen.finalBest, '5,234', 'the card shows the remembered best, not the run');
  assert.equal(game.screen.newBestShown, false);
  assert.equal(stored().score.best, 5234, 'and storage was left alone on that number');
  // ...though the run was not nothing: 1,200 of score paid 12 of stardust, and that is a write of
  // its own (game/stardust.js). A run that loses can still buy something.
  assert.equal(stored().meta.dust, 12, 'the purse took what the run earned');
  assert.equal(game.screen.finalDust, 'STARDUST  +12   \u00b7   12 BANKED');
});

test('a better run is banked in both places the number lives', () => {
  for (let i = 0; i < 40; i++) game.step(FRAME);   // the restart guard
  game.key('Space', false);
  game.key('Space', true);
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.PLAY, 'the second run on this boot is flying');
  killTheShip(9001);
  assert.equal(game.screen.finalScore, '9,001');
  assert.equal(game.screen.newBestShown, true);
  assert.equal(game.world.best, 9001, 'the rest of this visit knows it');
  assert.equal(stored().score.best, 9001, 'the document has it');
  assert.equal(game.storage['starfall.best'], '9001',
    'and so does the plain key the releases before the document still read');
  // The purse is the same story in its own section: 9,001 of score is 90 of dust, on top of the
  // 12 the first run of this visit paid.
  assert.equal(stored().meta.dust, 102, 'both runs were paid, and neither was paid twice');
  assert.equal(game.stats().dust, 102, 'and the visit is carrying the same total');
});
