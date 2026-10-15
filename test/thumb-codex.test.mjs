// The record under a thumb (PLAN 3.7, PLAN section 6, main.js `pressCodexPanel`).
//
// The codex is the one panel that does nothing: no row of it can be pressed in either hand, because there
// is nothing to do to a thing you have already met. What it needed was not a verb but a **shape** - five
// racks and forty-odd rows, which a phone stacks into one column taller than the phone is long, and these
// panels are scaled to fit rather than scrolled, so the bottom of the panel (the log, and the rules under
// it) would have been unreadable rather than merely off the glass. So a thumb is walked through the racks
// one at a time by a chip, and the whole page is at the size it is written at.
//
// Two things are said rather than measured, because the harness has no layout engine: `touch: true` boots a
// browser that reports fingers, and the boxes below say where the page laid the rail and the two chips out.
// Which racks are on the glass is read back off the page (`codexShown`), and everything else - the paging,
// the toggle, the hint line - is the shipped code.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { STATE } from '../src/game/state.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const VIEW = { width: 1280, height: 720 };
const SEED = 4026;

/** Where the browser put the rail, its six chips, and the two chips standing on the record. */
const LAYOUT = {
  thumbRail: { rect: { left: 300, top: 640, width: 700, height: 48 } },
  chipToday: { rect: { left: 310, top: 640, width: 90, height: 48 } },
  chipRule: { rect: { left: 410, top: 640, width: 80, height: 48 } },
  chipMute: { rect: { left: 500, top: 640, width: 90, height: 48 } },
  chipSettings: { rect: { left: 600, top: 640, width: 130, height: 48 } },
  chipHangar: { rect: { left: 740, top: 640, width: 120, height: 48 } },
  chipCodex: { rect: { left: 870, top: 640, width: 110, height: 48 } },
  codexNext: { rect: { left: 380, top: 600, width: 160, height: 44 } },
  codexClose: { rect: { left: 560, top: 600, width: 160, height: 44 } },
};

const CODEX = { x: 925, y: 664 };
const NEXT = { x: 460, y: 622 };
const CLOSE = { x: 640, y: 622 };

/** Anywhere on the record that is neither chip - and where a rack's rows are. */
const ROW = { x: 640, y: 300 };

/** The five racks, under the titles the page writes above them. */
const RACKS = ['HOSTS', 'CARD LINES', 'SYNERGIES', 'PAST RUNS', 'HARDER RULES'];

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

function tap(x, y) {
  const id = fingerId++;
  game.touchDown(x, y, id);
  game.touchUp(0, 0, id);
  frames(2);
}

/** A fresh title with the record put up on it. */
async function record() {
  await game.resetToTitle(SEED);
  frames(2);
  assert.equal(world.state, STATE.START);
  tap(CODEX.x, CODEX.y);
  assert.equal(game.screen.codexHidden, false, 'the chip put the record up');
}

function shown() { return game.screen.codexShown; }

test('the rail has a CODEX chip and the record has its two chips', () => {
  assert.ok(/<span class="chip" id="chipCodex">CODEX<\/span>/.test(PAGE),
    'the page ships the sixth chip with its own word on it');
  assert.ok(/<div class="chip-row gone" id="codexChips">/.test(PAGE),
    'and the page ships the row of chips on the record put away');
  assert.ok(/<div class="chip" id="codexNext">NEXT RACK<\/div>/.test(PAGE)
    && /<div class="chip" id="codexClose">CLOSE<\/div>/.test(PAGE),
    'and both of them are in it, with their words written');
  assert.equal(game.classes('codexChips').includes('gone'), false,
    'and this visit, which arrived on a finger, has them put out');
});

test('the CODEX chip is the C key, and the record owns the glass it is up on', async () => {
  await record();
  tap(CODEX.x, CODEX.y);
  assert.equal(game.screen.codexHidden, false, 'the chip behind the record answers nothing');
  assert.equal(world.state, STATE.START, 'and the tap did not go through to the launch');

  tap(CLOSE.x, CLOSE.y);
  assert.equal(game.screen.codexHidden, true, 'the way out is the chip standing on the record');
  assert.equal(world.state, STATE.START, 'and shutting a panel is not a launch either');
});

test('a thumb is shown one rack at a time, from the first', async () => {
  await record();
  assert.deepEqual(shown(), ['HOSTS'], 'the hosts, and nothing else');
  assert.equal(game.text('codexHintLaunch'), 'CLOSE TO LAUNCH',
    'and the launch, which a finger gets by closing the record and tapping the title');
  assert.ok(game.classes('codexHintBack').includes('gone'), 'and the clause naming C is put away');
  assert.ok(game.classes('codexHintSettings').includes('gone'), 'and so is the one naming O');
});

test('NEXT RACK walks the five and comes back round', async () => {
  await record();
  for (const which of RACKS.slice(1)) {
    tap(NEXT.x, NEXT.y);
    assert.deepEqual(shown(), [which], 'one tap, one rack');
  }
  tap(NEXT.x, NEXT.y);
  assert.deepEqual(shown(), ['HOSTS'],
    'and the page turns over: this is read to the bottom of and then begun again');
});

test('a tap on a row of the record does nothing at all', async () => {
  await record();
  const before = shown();
  tap(ROW.x, ROW.y);
  assert.deepEqual(shown(), before, 'a codex row has no verb, in either hand');
  assert.equal(game.screen.codexHidden, false, 'the record is still the record');
  assert.equal(world.state, STATE.START, 'and nothing launched behind it');
});

test('a tap between the chips answers nothing and closes nothing', async () => {
  await record();
  tap(700, 664);
  assert.deepEqual(shown(), ['HOSTS'], 'the rack did not move');
  assert.equal(game.screen.codexHidden, false, 'the record did not go');
  assert.equal(world.state, STATE.START, 'and the glass behind it is still the title');
});

test('the record comes back up on its first rack', async () => {
  await record();
  tap(NEXT.x, NEXT.y);
  tap(NEXT.x, NEXT.y);
  assert.deepEqual(shown(), ['SYNERGIES'], 'two racks in');

  tap(CLOSE.x, CLOSE.y);
  tap(CODEX.x, CODEX.y);
  assert.equal(game.screen.codexHidden, false, 'and it came back up');
  assert.deepEqual(shown(), ['HOSTS'],
    'on the hosts, where it always starts: nobody should have to turn five times to get back');
});

test('one panel at a time, and the chip behind a panel answers nothing', async () => {
  await record();
  tap(NEXT.x, NEXT.y);
  assert.deepEqual(shown(), ['CARD LINES'], 'the record is on its second rack');

  // The shop's chip is on the rail, under the record. It is not pressed, because a panel owns the glass
  // it is up on - chips included, which is what `test/thumb-rail.test.mjs` has held for MUTE since.
  tap(800, 664);
  assert.equal(game.screen.hangarHidden, true, 'the shop did not come up from behind the record');
  assert.equal(game.screen.codexHidden, false, 'and the record is still up');

  tap(CLOSE.x, CLOSE.y);
  tap(800, 664);
  assert.equal(game.screen.hangarHidden, false, 'closed, the shop is one tap away like everything else');
  assert.equal(game.screen.codexHidden, true, 'and the record went down with it');
});
