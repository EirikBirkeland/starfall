// Storage that is not a save document: half a JSON blob, somebody's own typing in the console, a
// write the browser lost halfway through. None of it may be able to stop the game being played, and
// none of it may be destroyed by a player who only came to look (core/save.js's third promise: a
// read never writes).
//
// The one number worth rescuing out of the wreck is `starfall.best`, which every release before
// the document kept on its own - so a player whose document came adrift loses the settings and
// keeps the score.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { makeEnemy } from '../src/game/kinds.js';
import { musicLevel } from '../src/audio/engine.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const GARBAGE = '{"version":1,"score":{"best":99}';        // cut off mid-write
const OLD_BEST = '90210';

const game = await bootGame({
  root: ROOT,
  seed: 5,
  audio: true,
  storage: { 'starfall.save': GARBAGE, 'starfall.best': OLD_BEST },
});

function launch() {
  game.pressMouse(640, 400);
  game.step(FRAME);
}

test('nonsense in storage is a first visit, except that the old best score is kept', () => {
  assert.equal(game.world.best, 90210, 'the one number from before the document was picked up');
  assert.equal(musicLevel(), 10, 'and everything the document holds starts at its shipped value');
  assert.equal(game.stats().saveNote, 'not JSON', 'and the game says what it found');
  assert.equal(game.stats().saveWritable, true, 'a wreck is still ours to overwrite');
});

test('the game plays, and the nonsense is still in storage afterwards', () => {
  launch();
  assert.equal(game.stats().state, game.STATE.PLAY);
  for (let i = 0; i < 60; i++) game.step(FRAME);
  assert.ok(game.stats().t > 0.5, 'the run went on under a broken save');
  assert.equal(game.storage['starfall.save'], GARBAGE, 'looking is not the same as rewriting');
});

test('the first thing worth remembering replaces the wreck', () => {
  const ship = game.world.player;
  ship.hull = 1;
  ship.invuln = 0;
  ship.fireTimer = 5;
  game.world.score = 4500;
  game.enemies.push(makeEnemy(game.world, 'drifter', ship.x, ship.y, {
    hp: 1, speed: 0, drop: 0, score: 0,
  }));
  game.step();
  assert.equal(game.stats().state, game.STATE.OVER);
  assert.equal(game.screen.newBestShown, false, '4,500 is not a best against 90,210');

  game.key('BracketLeft', true);
  game.key('BracketLeft', false);
  game.step(FRAME);
  const written = JSON.parse(game.storage['starfall.save']);
  assert.equal(written.version, 1, 'storage holds a real document now');
  assert.equal(written.audio.music, 9, 'with the change that was made to it');
  assert.equal(written.score.best, 90210, 'and carrying the rescued best with it');
  assert.equal(game.storage['starfall.best'], OLD_BEST, 'and the plain key is left at what it had');
});
