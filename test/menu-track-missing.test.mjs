// The song is not there (audio/track.js). A release that shipped without `assets/`, a server with a
// 404, a visitor on a captive network: the attract screen has to do the one right thing, which is to
// play the generated title pad it played before there was a song, and to ask the question once rather
// than once a frame looking for an answer that is not coming.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { MENU_TRACK_URL, menuTrackLedger } from '../src/audio/track.js';
import { musicLedger } from '../src/audio/music.js';

const ROOT = path.resolve(import.meta.dirname, '..');

// No `network` at all: the stub browser refuses every request, which is the shape of a missing file.
const game = await bootGame({ root: ROOT, seed: 9, audio: true });

async function frames(n) {
  for (let i = 0; i < n; i++) {
    game.step();
    await new Promise((done) => setImmediate(done));
  }
}

test('the menu asks, is refused, and says so', async () => {
  game.key('KeyH', true); game.key('KeyH', false);      // a press, and still the attract screen
  await frames(30);
  const ledger = menuTrackLedger();
  assert.equal(ledger.status, 'missing', ledger.reason);
  assert.match(ledger.reason, /no bytes/);
  assert.deepEqual(game.audio.fetched, [MENU_TRACK_URL]);
  assert.equal(ledger.playing, false, 'a missing song claims to be playing');
});

test('it is asked once and not again every frame', async () => {
  await frames(600);
  assert.equal(game.audio.fetched.length, 1,
    'a page with no song on it was asked ' + game.audio.fetched.length + ' times');
});

test('the title keeps the music it always had', async () => {
  assert.equal(musicLedger().pattern, 'title', 'the sequencer stood down for a song that never came');
  const before = musicLedger().heard.title || 0;
  await frames(120);
  assert.ok((musicLedger().heard.title || 0) > before, 'and then the title went quiet altogether');
  game.stop();
});
