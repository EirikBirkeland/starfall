// The settings panel under a cursor, and the controls rack under nobody (PLAN section 6).
//
// The thumb's panel is the same panel, so most of what this file holds is what did *not* move: a visit the
// browser says has no fingers is given no SETTINGS chip on the rail and no CLOSE chip on the panel, and it
// reads the arrow words the page ships. What did move is that a row now answers a click as well as a tap -
// a press is a press, and there is one press handler in the game - and that the door to the controls rack is
// on the panel for exactly the visits that have pressed a key.
//
// One boot per process, so the thumb half of this lives in test/thumb-settings.test.mjs and the two files
// differ only in what the stub browser was told about its own fingers.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { STATE } from '../src/game/state.js';
import { isMuted } from '../src/audio/engine.js';
import { hasFinger } from '../src/input/touch.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const VIEW = { width: 1280, height: 720 };
const SEED = 4023;

/** The very boxes the thumb visit is given: the difference between the two visits is not the layout. */
const LAYOUT = {
  thumbRail: { rect: { left: 380, top: 640, width: 440, height: 48 } },
  chipToday: { rect: { left: 390, top: 640, width: 90, height: 48 } },
  chipRule: { rect: { left: 490, top: 640, width: 80, height: 48 } },
  chipMute: { rect: { left: 580, top: 640, width: 90, height: 48 } },
  chipSettings: { rect: { left: 680, top: 640, width: 130, height: 48 } },
  settingsClose: { rect: { left: 560, top: 600, width: 160, height: 44 } },
};

const CLOSE = { x: 640, y: 622 };
const ROW_LEFT = 300;
const ROW_TOP = 180;
const ROW_H = 40;
const ROW_W = 620;

/** The panel as a keyboard visit sees it: the door to the keys is in the middle of it. */
const ROWS = { MUTE: 8, KEYS: 5 };

const game = await bootGame({
  root: ROOT, seed: SEED, width: VIEW.width, height: VIEW.height, layout: LAYOUT,
});
const world = game.world;

const PAGE = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function frames(n) {
  for (let i = 0; i < n; i++) game.step(FRAME);
}

function click(x, y) {
  game.pressMouse(x, y, 0);
  game.releaseMouse(0);
  frames(2);
}

function rowPoint(i) {
  return { x: ROW_LEFT + ROW_W / 2, y: ROW_TOP + i * ROW_H + ROW_H / 2 };
}

/** The panel, put up the only way this visit can put it up, with its eleven rows laid out. */
async function openPanel() {
  await game.resetToTitle(SEED);
  frames(2);
  game.key('KeyO', true);
  game.key('KeyO', false);
  assert.equal(game.screen.settingsHidden, false, 'O put the panel up');
  const boxes = [];
  for (let i = 0; i < 11; i++) boxes.push({ left: ROW_LEFT, top: ROW_TOP + i * ROW_H, width: ROW_W, height: ROW_H });
  game.layOutRows('settingRow', boxes);
}

function rows() {
  return game.screen.settingsRows;
}

test('a visit with no finger is given neither chip', () => {
  assert.equal(hasFinger(), false, 'the browser said it had no fingers');
  assert.equal(game.classes('thumbRail').includes('hidden'), true, 'and the rail stayed put away');
  assert.ok(game.classes('settingsClose').includes('gone'),
    'and so did the panel\u2019s CLOSE chip, because this visit has O');
});

test('the panel keeps the words the page ships for a hand with arrows', () => {
  assert.equal(/<div class="hint" id="settingsHint">&#8593; &#8595; PICK A ROW &#183; &#8592; &#8594; CHANGE IT<\/div>/
    .test(PAGE), true, 'the page ships the arrow words');
  assert.equal(game.text('settingsHint'), '\u2191 \u2193 PICK A ROW \u00b7 \u2190 \u2192 CHANGE IT',
    'and this visit is shown exactly those, not the thumb\u2019s line');
  assert.ok(game.classes('settingsKeysLine').includes('gone') === false,
    'and the line about O, Esc, M and [ ] - = is left where it belongs');
});

test('a click where the CLOSE chip would be answers nothing', async () => {
  await openPanel();
  click(CLOSE.x, CLOSE.y);
  assert.equal(game.screen.settingsHidden, false, 'the chip is not on this visit\u2019s rack, so it is not pressed');
  assert.equal(world.state, STATE.START, 'and the click did not go through to the launch either');
});

test('a click on a row moves it, the same way a tap does', async () => {
  await openPanel();
  assert.equal(isMuted(), false, 'a fresh visit can be heard');

  click(rowPoint(ROWS.MUTE).x, rowPoint(ROWS.MUTE).y);
  assert.equal(isMuted(), true, 'the row is the M key, under a cursor as under a finger');
  assert.equal(rows()[ROWS.MUTE].value, 'ON', 'and the panel says so on the same press');

  click(rowPoint(ROWS.MUTE).x, rowPoint(ROWS.MUTE).y);
  assert.equal(isMuted(), false, 'and the next click is it back');
});

test('the door to the controls rack is on this panel, and a click walks it', async () => {
  await openPanel();
  assert.equal(rows()[ROWS.KEYS].name, 'KEYS', 'this visit has pressed a key, so it is offered the door');

  click(rowPoint(ROWS.KEYS).x, rowPoint(ROWS.KEYS).y);
  assert.equal(game.screen.keysHidden, false, 'and the rack is up in the panel\u2019s place');
  assert.equal(game.screen.settingsHidden, true, 'one of the two at a time');
});

test('the rack itself answers no press at all', async () => {
  await openPanel();
  click(rowPoint(ROWS.KEYS).x, rowPoint(ROWS.KEYS).y);
  assert.equal(game.screen.keysHidden, false, 'the rack, opened from the panel');

  // Every verb on this rack is a key press - take a key, put the shipped one back - and a press that
  // landed on a row is not one of them. It is not a launch either: the rack owns the glass it is up on.
  click(rowPoint(0).x, rowPoint(0).y);
  assert.equal(game.screen.keysHidden, false, 'the rack is still up');
  assert.equal(world.state, STATE.START, 'and nothing happened behind it');

  game.key('KeyO', true);
  game.key('KeyO', false);
  assert.equal(game.screen.keysHidden, true, 'and O goes back to the settings, as the page says');
  assert.equal(game.screen.settingsHidden, false, 'which is the panel the rack was reached from');
});

test('a click between the rows is nothing at all', async () => {
  await openPanel();
  const before = rows().map((row) => row.value).join('|');

  click(ROW_LEFT + ROW_W / 2, ROW_TOP - 12);
  assert.equal(rows().map((row) => row.value).join('|'), before, 'no row moved');
  assert.equal(game.screen.settingsHidden, false, 'the panel is still the panel');
  assert.equal(world.state, STATE.START, 'and nothing launched behind it');
});
