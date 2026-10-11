// The promise the whole menu-song design is built on: a visit that never sits on the attract screen
// with its sound unlocked never pays for it (audio/track.js). The bytes are 8.7 MB and the samples
// they turn into are about 31 MB, and the ordinary way to open this game is to press Space the moment
// the title appears - which is also the press that unlocks the audio, so the menu is gone by the time
// there is anywhere to put a sound. That visit must not spend a byte.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { MENU_TRACK_URL, menuTrackLedger } from '../src/audio/track.js';
import { musicLedger } from '../src/audio/music.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SONG = new Uint8Array(2048);
SONG.set([0x66, 0x4c, 0x61, 0x43]);

const game = await bootGame({ root: ROOT, seed: 7, audio: true, network: { [MENU_TRACK_URL]: SONG } });

async function frames(n) {
  for (let i = 0; i < n; i++) {
    game.step();
    await new Promise((done) => setImmediate(done));
  }
}

test('launching on the first press asks for nothing', async () => {
  // The title is up, and the very first press of the visit is the one that flies.
  game.pressMouse(700, 300);
  game.world.player.invuln = Infinity;    // this file is about the bytes, not about dying
  await frames(300);
  assert.deepEqual(game.audio.fetched, [], 'a run that never sat on the menu paid for the song anyway');
  assert.equal(menuTrackLedger().status, 'waiting');
  assert.equal(menuTrackLedger().bytes, 0);
  assert.equal(menuTrackLedger().playing, false);
});

test('and the sequencer is none the worse for it', async () => {
  // Nothing here is a song's failure path: the run has the generated music exactly as it always had
  // it, which is the whole reason the recording is confined to the attract screen.
  const heard = musicLedger().heard;
  assert.ok(musicLedger().pattern !== 'silent', 'the run is playing no music at all');
  assert.ok((heard.run || 0) + (heard.driving || 0) > 0, 'the run never got its own pattern: ' + JSON.stringify(heard));
  assert.equal(heard.title, undefined, 'the title pad played on a visit that never heard it');
  game.stop();
});
