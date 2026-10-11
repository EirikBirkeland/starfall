// The bytes arrived and the machine will not play them (audio/track.js): a browser without a FLAC
// decoder, a file truncated in transit, a proxy that answered a video page with HTML. The answer is
// the same as a missing file - the title keeps its own generated music - and it is worth testing
// separately because it is a different door: one is the network failing and this one is the decoder.
// A machine with no decoder at all (`audio: 'raw'`) lands in the same state by the same try/catch.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { MENU_TRACK_URL, menuTrackLedger } from '../src/audio/track.js';
import { musicLedger } from '../src/audio/music.js';

const ROOT = path.resolve(import.meta.dirname, '..');

// Whatever this is, it is not sound: it does not begin with the bytes any audio format begins with,
// and the stub browser says so the way a real one does.
const NOT_MUSIC = new Uint8Array(4096);
NOT_MUSIC.set([0x3c, 0x68, 0x74, 0x6d]);               // '<htm' - the classic answer

const game = await bootGame({ root: ROOT, seed: 11, audio: true, network: { [MENU_TRACK_URL]: NOT_MUSIC } });

async function frames(n) {
  for (let i = 0; i < n; i++) {
    game.step();
    await new Promise((done) => setImmediate(done));
  }
}

test('a file that will not decode is called what it is', async () => {
  game.key('KeyH', true); game.key('KeyH', false);
  await frames(30);
  const ledger = menuTrackLedger();
  assert.equal(ledger.status, 'broken', ledger.reason);
  assert.match(ledger.reason, /would not decode/);
  assert.equal(ledger.bytes, NOT_MUSIC.length, 'it should still say how many bytes came');
  assert.equal(ledger.playing, false);
  assert.equal(game.audio.decodes, 1, 'it asked the decoder ' + game.audio.decodes + ' times');
});

test('and it is not asked again', async () => {
  await frames(600);
  assert.equal(game.audio.fetched.length, 1);
  assert.equal(game.audio.decodes, 1);
});

test('the title keeps its own music', async () => {
  assert.equal(musicLedger().pattern, 'title');
  const before = musicLedger().heard.title || 0;
  await frames(120);
  assert.ok((musicLedger().heard.title || 0) > before, 'and then the title went quiet anyway');
  game.stop();
});
