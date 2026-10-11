// The menu's song: the one recording in a game that is otherwise synthesised (audio/track.js).
//
// The owner asked for it - `OVERLORDS_REQUESTS` - and it is their file, `assets/MenuMusic-SpaceRapBattle.flac`,
// 80 s of 48 kHz stereo, 8.7 MB of it. That is a great deal of money for a web page to spend, so the
// whole design of this feature is about *not* spending it: the bytes are asked for only when the
// attract screen is the screen being looked at, only once the browser has been given a press (no
// browser lets a page make a sound before one), and only if the visit is not muted. A run that is
// flown the way everyone flies it - open the page, press Space - never asks for a byte, and that is
// the first promise these tests hold.
//
// One game per process (tools/headless/harness.js), so this file boots one visit that sits on the
// menu with its sound unlocked - which is exactly the visit the song is for.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { MENU_TRACK_URL, menuTrackLedger } from '../src/audio/track.js';
import { musicLedger } from '../src/audio/music.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'assets', 'MenuMusic-SpaceRapBattle.flac');

// A song the stub will decode: it looks at the four bytes every audio format starts with and nothing
// else, so 2 KB of `fLaC` and padding is a whole song as far as the stub browser is concerned. What
// the *game* does with the byte count is its own rule, and 2 KB is over it.
const SONG = new Uint8Array(2048);
SONG.set([0x66, 0x4c, 0x61, 0x43]);

const game = await bootGame({
  root: ROOT, seed: 5, audio: true,
  // The visit opens muted on purpose: the mute is the one state a returning visitor can arrive in, and
  // "a muted visit never pays for the bytes" is worth more than a tidy start.
  storage: { 'starfall.save': JSON.stringify({ version: 1, audio: { music: 10, effects: 10, muted: true } }) },
  network: { [MENU_TRACK_URL]: SONG },
});

/** Frames, and a breath between each so the promises the game started get their turn. */
async function frames(n) {
  for (let i = 0; i < n; i++) {
    game.step();
    await new Promise((done) => setImmediate(done));
  }
}

test('the shipped recording is in the game, and the release script ships it', () => {
  const bytes = fs.readFileSync(FILE);
  assert.equal(bytes.slice(0, 4).toString('latin1'), 'fLaC',
    MENU_TRACK_URL + ' is not a FLAC file');
  assert.ok(bytes.length > 1024 * 1024, 'a recording this long is not a few kilobytes');
  const script = fs.readFileSync(path.join(ROOT, 'tools', 'release.sh'), 'utf8');
  assert.match(script, /playable_items="[^"]*\bassets\b/,
    'release.sh would publish a release with no song in it');
});

test('nothing is asked for before the machine has heard a press', async () => {
  // No AudioContext yet - and no browser will have one before a press - so there is nothing to decode
  // into and no sound allowed anyway. The attract screen sits here for as long as the visitor takes.
  await frames(30);
  assert.deepEqual(game.audio.fetched, [], 'the bytes were asked for before there was any audio');
  assert.equal(menuTrackLedger().status, 'waiting');
  assert.equal(menuTrackLedger().playing, false);
});

test('a muted visit never spends the bytes', async () => {
  // H is a press, and it is a press that does not start a run: the audio device exists now and the
  // attract screen is still the screen being looked at. The visit is muted, so the song is not asked
  // for - 8.7 MB is not nothing, and a visitor who left the game muted should not pay it.
  game.key('KeyH', true);
  game.key('KeyH', false);
  await frames(20);
  assert.deepEqual(game.audio.fetched, [], 'a muted visit fetched the song anyway');
  assert.equal(menuTrackLedger().status, 'waiting');

  // M, and the answer arrives - because that is the moment the bytes are worth fetching.
  game.key('KeyM', true);
  game.key('KeyM', false);
  await frames(30);
  assert.deepEqual(game.audio.fetched, [MENU_TRACK_URL], 'unmuting on the menu did not ask for the song');
});

test('the bytes are asked for once, and once only', async () => {
  await frames(120);
  const ledger = menuTrackLedger();
  assert.deepEqual(game.audio.fetched, [MENU_TRACK_URL],
    'the song was fetched ' + game.audio.fetched.length + ' times: one visit, one request');
  assert.equal(game.audio.decodes, 1, 'it was decoded ' + game.audio.decodes + ' times');
  assert.equal(ledger.loads, 1);
  assert.equal(ledger.bytes, SONG.length);
  assert.ok(ledger.seconds > 0, 'the ledger says the song has no length');
});

test('the menu plays it, and the sequencer stands down', async () => {
  await frames(30);
  const ledger = menuTrackLedger();
  assert.equal(ledger.status, 'playing', ledger.reason);
  assert.equal(ledger.playing, true);
  assert.equal(ledger.starts, 1, 'one song, one source');
  assert.equal(musicLedger().pattern, 'silent',
    'the generated title pad is still playing over the recording');
  // And it keeps standing down: a frame that finds the song playing does not start another one.
  const title = musicLedger().heard.title || 0;
  await frames(120);
  assert.equal(musicLedger().heard.title || 0, title, 'the pad crept back under the song');
  assert.equal(menuTrackLedger().starts, 1);
});

test('a run takes the music back, over a breath and not in a click', async () => {
  game.key('KeyH', true); game.key('KeyH', false);      // close the hangar
  game.pressMouse(640, 360);                            // and launch
  await frames(10);
  const ledger = menuTrackLedger();
  assert.equal(ledger.playing, false, 'the song is still playing over the run');
  assert.equal(ledger.status, 'ready');
  assert.equal(ledger.stops, 1);
  assert.notEqual(musicLedger().pattern, 'silent', 'the sequencer never came back for the run');
  // The stop is asked for in the future, not at the instant of the press - which is the fade, and the
  // difference between a breath and a click in the speakers. `stoppedAt - stopAskedAt` is its length.
  const fade = ledger.stoppedAt - ledger.stopAskedAt;
  assert.ok(fade > 0, 'the source was stopped the instant the run began: that is a click');
  assert.ok(fade < 1, 'the fade is ' + fade + ' s: a song that takes a second to leave is a hole');
});

test('back on the attract screen it starts again, on a new source', async () => {
  // The game has no way back to the title yet - the death's card is an ending and the launch key is a
  // new run - but the tools do, and the rule is the rule: the menu is the song's, whatever put the
  // menu back up.
  await game.resetToTitle(5);
  await frames(30);
  const ledger = menuTrackLedger();
  assert.equal(ledger.status, 'playing', ledger.reason);
  assert.equal(ledger.starts, 2, 'a stopped source cannot be restarted; the song needs a new one');
  assert.equal(game.audio.fetched.length, 1, 'and it came back without fetching the bytes again');
  assert.equal(musicLedger().pattern, 'silent');
});

test('the state machine is in the ledger for a tool to read', () => {
  const stats = game.stats();
  assert.equal(stats.menuTrack.status, menuTrackLedger().status);
  assert.equal(stats.menuTrack.url, MENU_TRACK_URL);
  game.stop();
});
