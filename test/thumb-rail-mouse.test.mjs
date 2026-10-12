// The same rail, on a visit that arrived with no finger (PLAN section 6, ui/chips.js).
//
// The other half of test/thumb-rail.test.mjs, and the half that keeps the promise the mouse visitors
// care about: a desktop with a mouse is the visit it always was. The rail is in its page and never on
// its glass, and a click on the title means the launch and nothing else - including a click at the
// exact spot where a phone's rail happens to be sitting, invisible, in the same page.
//
// One boot per process, which is why this is its own file: the boot is the thing being varied. The
// chips are given the same boxes here as there, so the only difference between the two visits is what
// the browser said about its own fingers (input/touch.js `hasFinger`).

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { STATE } from '../src/game/state.js';
import { isMuted } from '../src/audio/engine.js';
import { hasFinger } from '../src/input/touch.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const VIEW = { width: 1280, height: 720 };
const SEED = 4021;

/** The very boxes the thumb visit was given: the difference between the two visits is not the layout. */
const LAYOUT = {
  thumbRail: { rect: { left: 486, top: 640, width: 316, height: 48 } },
  chipToday: { rect: { left: 496, top: 640, width: 96, height: 48 } },
  chipRule: { rect: { left: 602, top: 640, width: 84, height: 48 } },
  chipMute: { rect: { left: 696, top: 640, width: 96, height: 48 } },
};

const CHIP = {};
for (const id of ['Today', 'Rule', 'Mute']) {
  const box = LAYOUT['chip' + id].rect;
  CHIP[id.toLowerCase()] = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

const game = await bootGame({
  root: ROOT, seed: SEED, width: VIEW.width, height: VIEW.height, layout: LAYOUT,
});
const world = game.world;

function frames(n) {
  for (let i = 0; i < n; i++) game.step(FRAME);
}

test('a visit with no finger is never given the rail', () => {
  assert.equal(hasFinger(), false, 'the browser said it had no fingers');
  assert.equal(game.classes('thumbRail').includes('hidden'), true, 'and the rail stayed put away');
});

test('a click on where a chip would be is the launch, as it always was', async () => {
  await game.resetToTitle(SEED);
  frames(2);

  for (const id of ['today', 'rule', 'mute']) {
    game.pressMouse(CHIP[id].x, CHIP[id].y, 0);
    game.releaseMouse(0);
    frames(4);
    assert.equal(world.state, STATE.PLAY, 'a click on the ' + id + ' chip launched a run');
    assert.equal(world.dailyDay, 0, 'and did not fly the day');
    assert.equal(world.challenge, '', 'and did not pick a rule');
    assert.equal(isMuted(), false, 'and did not touch the sound');
    await game.resetToTitle(SEED);
    frames(2);
  }
});
