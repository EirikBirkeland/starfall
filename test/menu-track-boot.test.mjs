// The menu's song, on the browser that lets the page make a sound without being asked
// (`autoplay: true` in the stub: a visitor who has heard sound on this origin before, or a browser
// with no autoplay rule at all). The request was "the menu music should announce itself on the root
// menu", and this is what that means in a browser: the device is there from the first frame
// (audio/engine.js `openAudioDevice`), it is running, and the attract screen spends its song at once
// - no press first, and no press in the right order.
//
// The other half - a browser that keeps the device asleep until a press - is `test/menu-track-wake.test.mjs`.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { MENU_TRACK_URL, menuTrackLedger } from '../src/audio/track.js';
import { musicLedger } from '../src/audio/music.js';

const ROOT = path.resolve(import.meta.dirname, '..');

// A song the stub browser will decode: `fLaC` and padding, which is all it looks at (see the stub).
const SONG = new Uint8Array(2048);
SONG.set([0x66, 0x4c, 0x61, 0x43]);

const game = await bootGame({
  root: ROOT, seed: 13, audio: true, autoplay: true,
  network: { [MENU_TRACK_URL]: SONG },
});

/** Frames, and a breath between each so the promises the game started get their turn. */
async function frames(n) {
  for (let i = 0; i < n; i++) {
    game.step();
    await new Promise((done) => setImmediate(done));
  }
}

test('the device is there and running before a hand has done anything', () => {
  // The one thing that used to be missing: the device was only ever built by a press, so a browser
  // that would have let the title screen sing never got asked.
  assert.equal(game.audioState, 'running', 'the browser lets this page play and the game did not ask');
});

test('the menu announces itself with no press at all', async () => {
  await frames(60);
  const ledger = menuTrackLedger();
  assert.deepEqual(game.audio.fetched, [MENU_TRACK_URL],
    'the song was not asked for: ' + ledger.status + ' - ' + ledger.reason);
  assert.equal(ledger.status, 'playing', ledger.reason);
  assert.equal(ledger.playing, true);
  assert.equal(ledger.starts, 1, 'one song, one source');
  assert.equal(game.stats().menuTrack.status, 'playing', 'and the ledger the tools read says otherwise');
});

test('and the generated title pad stands down under it', async () => {
  // The pad is what the sequencer plays on a title screen, and it is allowed a bar of it on the way
  // in - that is the fade the song rises out of (audio/track.js `FADE`) - but it does not carry on
  // once there is a song to hear, whatever order the two arrived in.
  assert.equal(musicLedger().pattern, 'silent',
    'the title has two soundtracks arguing: ' + musicLedger().pattern);
  const title = musicLedger().heard.title || 0;
  await frames(120);
  assert.equal(musicLedger().heard.title || 0, title, 'the pad crept back under the song');
  assert.equal(menuTrackLedger().starts, 1, 'and the song was started again over itself');
});

test('a run still takes the music bus back', async () => {
  game.pressMouse(640, 360);
  await frames(10);
  const ledger = menuTrackLedger();
  assert.equal(ledger.playing, false, 'the song is still playing over the run');
  assert.equal(ledger.status, 'ready');
  assert.notEqual(musicLedger().pattern, 'silent', 'and the sequencer never came back for the run');
  game.stop();
});
