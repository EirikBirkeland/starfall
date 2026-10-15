// The record under a cursor (PLAN section 6).
//
// The thumb's record is the same record, and this file holds what did not move: a visit the browser says
// has no fingers is given no CODEX chip on the rail and no row of chips on the panel, it is shown all five
// racks at once exactly as the page ships them, and its line under the racks keeps the words the page
// ships. The paging is a shape for a window too narrow for the whole panel, and a keyboard visit has never
// been asked to fit one - so for this visit the panel is exactly what it was before session 130.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { STATE } from '../src/game/state.js';
import { hasFinger } from '../src/input/touch.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const VIEW = { width: 1280, height: 720 };
const SEED = 4027;

/** The very boxes the thumb visit is given: the difference between the two visits is not the layout. */
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

const NEXT = { x: 460, y: 622 };
const CLOSE = { x: 640, y: 622 };
const ROW = { x: 640, y: 300 };

const ALL = ['HOSTS', 'CARD LINES', 'SYNERGIES', 'PAST RUNS', 'HARDER RULES'];

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

function key(code) {
  game.key(code, true);
  game.key(code, false);
  frames(2);
}

/** A title, and the record put up the only way this visit can put it up. */
async function record() {
  await game.resetToTitle(SEED);
  frames(2);
  assert.equal(world.state, STATE.START);
  key('KeyC');
  assert.equal(game.screen.codexHidden, false, 'C put the record up');
}

function shown() { return game.screen.codexShown; }

test('a visit with no fingers is given no chip for the record and no page turn', () => {
  assert.equal(hasFinger(), false, 'the stub browser said so when it was asked');
  assert.equal(game.classes('thumbRail').includes('hidden'), true, 'and the rail stayed put away');
  assert.ok(game.classes('codexChips').includes('gone'),
    'and so did the row of chips on the record, because this visit has C');
});

test('the whole panel is up at once, in the words the page ships', async () => {
  await record();
  assert.deepEqual(shown(), ALL, 'five racks, exactly as the page lays them out');
  assert.equal(/<div class="hint"><span id="codexHintLaunch">SPACE TO LAUNCH<\/span>/.test(PAGE), true,
    'the page ships the launch clause on its own, so the thumb can be shown a different one');
  assert.equal(game.text('codexHintLaunch'), 'SPACE TO LAUNCH', 'and this visit is shown that one');
  assert.ok(!game.classes('codexHintBack').includes('gone'), 'with C named, because this visit has C');
  assert.ok(!game.classes('codexHintSettings').includes('gone'), 'and O named, because it has O too');
});

test('a click where the two chips would be answers nothing', async () => {
  await record();
  click(NEXT.x, NEXT.y);
  assert.deepEqual(shown(), ALL, 'the page did not turn, because there is no page to turn');
  click(CLOSE.x, CLOSE.y);
  assert.equal(game.screen.codexHidden, false, 'and the record did not close');
  assert.equal(world.state, STATE.START, 'and neither click went through to the launch');
});

test('a click on a row of the record does nothing, here as much as under a thumb', async () => {
  await record();
  click(ROW.x, ROW.y);
  assert.deepEqual(shown(), ALL, 'a codex row has no verb');
  assert.equal(game.screen.codexHidden, false, 'the record is still up');
  assert.equal(world.state, STATE.START, 'and nothing launched behind it');
});

test('C still opens and closes it, and the racks never move', async () => {
  await record();
  key('KeyC');
  assert.equal(game.screen.codexHidden, true, 'C took the record down, the way it always did');
  key('KeyC');
  assert.equal(game.screen.codexHidden, false, 'and put it back up');
  assert.deepEqual(shown(), ALL, 'with all five racks on it, as it was');
});
