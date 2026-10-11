// The menu's song, on the ordinary browser: one that keeps a device built before a press asleep until
// a hand does something (the stub's rule - `tools/headless/harness.js`). The page may ask all day from
// its frame loop and will not be answered; only a press buys the clock, and that is the browser's rule
// and not this game's. What *is* this game's business is what happens while it waits: nothing spent,
// nothing scheduled, and the first press of any kind - including one the game does not answer - making
// the menu sing (audio/engine.js `wakeAudio`, main.js `AUDIO_WAKE_EVENTS`, audio/track.js).
//
// The other half - a browser that lets the page make a sound unasked - is `test/menu-track-boot.test.mjs`.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { MENU_TRACK_URL, menuTrackLedger } from '../src/audio/track.js';
import { musicLedger } from '../src/audio/music.js';

const ROOT = path.resolve(import.meta.dirname, '..');

const SONG = new Uint8Array(2048);
SONG.set([0x66, 0x4c, 0x61, 0x43]);

const game = await bootGame({
  root: ROOT, seed: 17, audio: true,
  network: { [MENU_TRACK_URL]: SONG },
});

async function frames(n) {
  for (let i = 0; i < n; i++) {
    game.step();
    await new Promise((done) => setImmediate(done));
  }
}

test('the device is built at boot and is asleep, and nothing is spent on it', async () => {
  const graph = game.audio.voices;      // the buses and the master, and nothing played on them
  assert.equal(game.audioState, 'suspended', 'the game woke a device no press had woken');
  await frames(120);
  assert.equal(game.audio.voices, graph, 'something was played on a clock that is not running');
  assert.equal(game.audio.resumes, 0, 'the frame loop asked for the clock itself: a browser says no');
  assert.deepEqual(game.audio.fetched, [], 'the bytes were bought for a device nobody could hear');
  assert.equal(menuTrackLedger().status, 'waiting');
  assert.equal(musicLedger().pattern, 'silent', 'the sequencer wrote a bar into a stopped clock');
});

test('a pointer that only moved is not permission', async () => {
  // A mouse moving is not a press in a browser's eyes, and the game must not pretend it is.
  game.moveMouse(400, 300);
  await frames(30);
  assert.equal(game.audioState, 'suspended');
  assert.deepEqual(game.audio.fetched, []);
});

test('any press wakes it, even one the game does not answer', async () => {
  // `V` is bound to nothing. The visitor who presses it has still told the browser that sound is
  // wanted here, and a menu that stays quiet through that press is the bug this file exists for.
  game.key('KeyV', true);
  game.key('KeyV', false);
  await frames(60);
  assert.equal(game.audioState, 'running', 'a press went by without waking the device');
  assert.deepEqual(game.audio.fetched, [MENU_TRACK_URL], 'and the song was still not asked for');
  const ledger = menuTrackLedger();
  assert.equal(ledger.status, 'playing', ledger.reason);
  assert.equal(ledger.starts, 1);
});

test('the title pad holds the seam until the song is ready', async () => {
  // The pad is what the sequencer plays on a title screen, and it is what the title has got while the
  // 8.7 MB are on their way - so it has to have played, and then got out of the song's way.
  assert.ok((musicLedger().heard.title || 0) > 0, 'the title had no music at all while it waited');
  assert.equal(musicLedger().pattern, 'silent', 'and then two soundtracks were playing at once');
  game.stop();
});
