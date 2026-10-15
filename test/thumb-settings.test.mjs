// The settings panel under a thumb (PLAN section 6, ui/chips.js, main.js `pressSettingsPanel`).
//
// A phone visitor can fly, dash, pause, give up, launch and answer a card, and until now it could not
// open anything else in the game. This file holds the fourth chip on the rail and the panel it opens:
// **the settings panel answers a tap.** A row moves to its next value under the tap that lands on it, and
// the CLOSE chip under the rows takes the panel back down - which is the whole reason the chip is allowed
// on the rail at all, since a chip that opened a page a finger could neither use nor leave was the reason
// it was left off it.
//
// Two things are said rather than measured, because the harness has no layout engine. `touch: true` boots
// a browser that reports fingers (input/touch.js `hasFinger`), and the boxes below say where the page laid
// the chips and the rows out - the same way a test says where the title's mark did. Everything else, the
// hit-testing, the row walking, the save write and the sound, is the shipped code.
//
// The rows are laid out *after* the panel has been painted, because that is when they exist
// (`layOutRows` in the harness). A test that changes how many rows there are lays them out again.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { STATE } from '../src/game/state.js';
import { isMuted, musicLevel, VOLUME } from '../src/audio/engine.js';
import { wordsOf as pictureWords } from '../src/game/settings.js';
import { wordsOf as assistWords } from '../src/game/assists.js';
import { pauseButton } from '../src/input/touch.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const VIEW = { width: 1280, height: 720 };
const SEED = 4022;

/** Where the browser put the rail and its four chips, in the window's own pixels. */
const LAYOUT = {
  thumbRail: { rect: { left: 380, top: 640, width: 440, height: 48 } },
  chipToday: { rect: { left: 390, top: 640, width: 90, height: 48 } },
  chipRule: { rect: { left: 490, top: 640, width: 80, height: 48 } },
  chipMute: { rect: { left: 580, top: 640, width: 90, height: 48 } },
  chipSettings: { rect: { left: 680, top: 640, width: 130, height: 48 } },
  // The chip inside the settings panel, below the last row and clear of the rail at the bottom of the
  // title (which is behind the panel whenever this one is up).
  settingsClose: { rect: { left: 560, top: 600, width: 160, height: 44 } },
};

const SETTINGS = { x: 745, y: 664 };
const CLOSE = { x: 640, y: 622 };

/** Where the panel's rows came to rest: one row of words, one row of glass, in order. */
const ROW_LEFT = 300;
const ROW_TOP = 180;
const ROW_H = 40;
const ROW_W = 620;

function rowBox(i) {
  return { left: ROW_LEFT, top: ROW_TOP + i * ROW_H, width: ROW_W, height: ROW_H };
}

function rowPoint(i) {
  return { x: ROW_LEFT + ROW_W / 2, y: ROW_TOP + i * ROW_H + ROW_H / 2 };
}

/** Anywhere on the panel that is not a row and not the chip. */
const BETWEEN = { x: ROW_LEFT + ROW_W / 2, y: ROW_TOP - 12 };

const game = await bootGame({
  root: ROOT, seed: SEED, width: VIEW.width, height: VIEW.height,
  touch: true, layout: LAYOUT,
});
const world = game.world;

const PAGE = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let fingerId = 0;

function frames(n) {
  for (let i = 0; i < n; i++) game.step(FRAME);
}

/** One tap of the glass, and the frame that answers it. */
function tap(x, y) {
  const id = fingerId++;
  game.touchDown(x, y, id);
  game.touchUp(0, 0, id);
  frames(2);
}

/** Back to a fresh title. */
async function title() {
  await game.resetToTitle(SEED);
  frames(2);
  assert.equal(world.state, STATE.START);
}

/** The panel, put up the way a finger puts it up, with its rows laid out. */
async function openPanel() {
  await title();
  tap(SETTINGS.x, SETTINGS.y);
  assert.equal(game.screen.settingsHidden, false, 'the chip put the panel up');
  layOut(10);
}

function layOut(count) {
  const boxes = [];
  for (let i = 0; i < count; i++) boxes.push(rowBox(i));
  game.layOutRows('settingRow', boxes);
}

function rows() {
  return game.screen.settingsRows;
}

function words(name) {
  for (const row of rows()) if (row.name === name) return row.value;
  throw new Error('the panel has no ' + name + ' row: ' + rows().map((r) => r.name).join(', '));
}

test('the rail has a SETTINGS chip and the panel has a way out', () => {
  assert.ok(/<span class="chip" id="chipSettings">SETTINGS<\/span>/.test(PAGE),
    'the page ships the fourth chip with its own word on it');
  assert.ok(/<div class="chip gone" id="settingsClose">CLOSE<\/div>/.test(PAGE),
    'and the panel ships its CLOSE chip put away, for a visit with no finger');
  assert.ok(game.classes('settingsClose').includes('gone') === false,
    'and this visit, which arrived on a finger, has it put out');
});

test('the settings chip is the O key, and the panel owns the glass it is up on', async () => {
  await title();
  tap(SETTINGS.x, SETTINGS.y);
  assert.equal(game.screen.settingsHidden, false, 'one press and the panel is up');
  assert.equal(world.state, STATE.START, 'and a panel is a panel, not a launch');

  tap(SETTINGS.x, SETTINGS.y);
  assert.equal(game.screen.settingsHidden, false, 'the chip behind the panel answers nothing, as every other');
  assert.equal(world.state, STATE.START, 'and the press did not go through to the launch either');

  tap(CLOSE.x, CLOSE.y);
  assert.equal(game.screen.settingsHidden, true, 'the way out is the chip standing on the panel itself');
  assert.equal(world.state, STATE.START, 'and shutting a panel is not a launch either');
});

test('the panel is written for the hand that arrived', async () => {
  assert.equal(game.text('settingsHint'), 'TAP A ROW TO CHANGE IT',
    'one line, in the words a thumb has');
  assert.ok(game.classes('settingsKeysLine').includes('gone'),
    'and the line that named O, Esc, M and [ ] - = is taken away, not left blank');
  // The markup still ships the keyboard's words, which is what a visit with a keyboard reads back.
  assert.ok(/<div class="hint" id="settingsHint">&#8593; &#8595; PICK A ROW &#183; &#8592; &#8594; CHANGE IT<\/div>/
    .test(PAGE), 'the page ships the arrow words for the other hand');
});

test('the controls rack is not offered to a visit that has never pressed a key', async () => {
  await openPanel();
  const names = rows().map((row) => row.name);
  assert.equal(names.length, 10, 'ten rows, and every one of them answers a tap');
  assert.ok(names.indexOf('KEYS') < 0, 'the door to a rack of key presses is not among them');
});

test('a row that ships at the top of its travel still moves under a tap', async () => {
  await openPanel();
  assert.equal(words('SCREEN SHAKE'), 'FULL', 'as shipped');
  assert.equal(pictureWords('shake'), 'FULL', 'and the owner of the row says the same thing');

  tap(rowPoint(0).x, rowPoint(0).y);
  assert.equal(words('SCREEN SHAKE'), 'NONE', 'one tap is the whole way to the first step');
  assert.equal(pictureWords('shake'), 'NONE', 'and the row itself moved, not just the word');

  tap(rowPoint(0).x, rowPoint(0).y);
  assert.equal(words('SCREEN SHAKE'), 'LOW', 'and the next tap is the next step up');
});

test('the two switches a thumb flies with go either way under a tap', async () => {
  // On the title, before a control has ever claimed a touch, these two are still off (game/assists.js
  // answers `on` for the hand the run is being flown on, and input/touch.js `thumbUsed()` is honest about
  // which hand that is). What this holds is the thing a thumb needs: that a tap reaches *both* values, so
  // the switch a run has turned on can be turned off - which is the step `+1` can never take.
  await openPanel();
  assert.equal(words('AUTO-FIRE'), 'OFF', 'nobody has flown on this finger yet');
  assert.equal(assistWords('fire'), 'OFF', 'and that is the owner saying it, not the panel');

  tap(rowPoint(8).x, rowPoint(8).y);
  assert.equal(words('AUTO-FIRE'), 'ON', 'one tap holds the trigger');
  assert.equal(assistWords('fire'), 'ON', 'in the run, not just on the glass');

  tap(rowPoint(8).x, rowPoint(8).y);
  assert.equal(words('AUTO-FIRE'), 'OFF', 'and the next one lets it go, which is the way round');
});

test('a tap on the mute row is the M key', async () => {
  await openPanel();
  assert.equal(isMuted(), false, 'a fresh visit can be heard');

  tap(rowPoint(7).x, rowPoint(7).y);
  assert.equal(isMuted(), true, 'the row is the key');
  assert.equal(words('MUTE'), 'ON', 'and the panel says so on the same press');

  tap(rowPoint(7).x, rowPoint(7).y);
  assert.equal(isMuted(), false, 'and the next tap is it back');
});

test('a slider comes back round to the bottom of its travel', async () => {
  await openPanel();
  assert.equal(musicLevel(), VOLUME.steps, 'both sliders ship at the top');
  assert.equal(words('MUSIC'), VOLUME.steps + ' OF ' + VOLUME.steps, 'and say so');

  tap(rowPoint(5).x, rowPoint(5).y);
  assert.equal(musicLevel(), 0, 'one tap is the whole travel, because a thumb has no other direction');
  assert.equal(words('MUSIC'), '0 OF ' + VOLUME.steps, 'and the row says the new place');

  tap(rowPoint(5).x, rowPoint(5).y);
  assert.equal(musicLevel(), 1, 'from there on it walks up one at a time, like the key does');
});

test('the tap lights the row it landed on, and the cursor is the same light', async () => {
  await openPanel();
  tap(rowPoint(3).x, rowPoint(3).y);
  assert.equal(rows()[3].chosen, true, 'the row that was tapped is the row the panel is pointing at');
  assert.equal(rows()[0].chosen, false, 'and not the one the panel opened on');

  // ...which is the same cursor the arrow keys walk, so the two hands cannot be pointing apart. And this
  // is the moment the visit has a keyboard: from here the door to the controls rack is on the panel, one
  // row below where the taps have been pointing.
  game.key('ArrowDown', true);
  game.key('ArrowDown', false);
  assert.equal(rows()[4].chosen, true, 'one arrow from there is one row down from the tap');
  assert.equal(rows().length, 11, 'and the panel grew the row this hand can now answer');
  assert.equal(rows()[5].name, 'KEYS', 'the door, in the place the panel prints it');
});

test('a tap between the rows is nothing at all', async () => {
  await openPanel();
  const before = rows().map((row) => row.value).join('|');

  tap(BETWEEN.x, BETWEEN.y);
  assert.equal(rows().map((row) => row.value).join('|'), before, 'no row moved');
  assert.equal(game.screen.settingsHidden, false, 'the panel is still the panel');
  assert.equal(world.state, STATE.START, 'and nothing launched behind it');
});

test('the CLOSE chip is the O key, and over a held run it puts the pause back up', async () => {
  // A key goes into this one, because that is the only way a run gets held here at all - and a visit that
  // has pressed a key is a visit the KEYS row is offered to, so the rows are one longer from here on.
  await title();
  game.key('KeyP', true);
  game.key('KeyP', false);
  assert.equal(world.state, STATE.START, 'there is no run to hold on a fresh title');

  tap(640, 300);
  frames(6);
  assert.equal(world.state, STATE.PLAY, 'so first there has to be a run, launched the way a thumb launches');

  const plate = pauseButton(VIEW.width, VIEW.height);
  tap(plate.x, plate.y);
  assert.equal(world.paused, true, 'and held with the thumb\u2019s own plate');
  assert.equal(game.screen.pauseHidden, false, 'with the rack up over it');

  game.key('KeyO', true);
  game.key('KeyO', false);
  assert.equal(game.screen.settingsHidden, false, 'the panel, opened from the pause with a key');
  layOut(11);
  assert.equal(words('KEYS'), 'ALL SHIPPED', 'and now the door is on the panel, because this hand has keys');

  tap(CLOSE.x, CLOSE.y);
  assert.equal(game.screen.settingsHidden, true, 'the chip takes it down');
  assert.equal(game.screen.pauseHidden, false, 'and puts the pause back, exactly as O does');
  assert.equal(world.paused, true, 'on a run that was never let go of');
});
