// The thumb's chips, on a visit that arrived with a finger (PLAN section 6, ui/chips.js).
//
// A phone visitor has no letters, and everything the game answers outside the fight has been a letter
// since the first version. Three of them now have a chip: the day, the harder rule, and the sound. The
// promise this file holds is the one that makes a chip worth having - **a chip is its key** - so every
// test here presses a chip and expects exactly what pressing the key would do, on the same screens the
// key is answered on and none others. The rail itself is a second promise: it is on the glass for a
// visit with a finger and nowhere else, which the mouse half of is held in
// test/thumb-rail-mouse.test.mjs (one boot per process, so one boot shape per file).
//
// The harness has no fingers and no layout engine, so two things are said rather than measured. `touch:
// true` boots a browser that reports fingers (input/touch.js `hasFinger`), and `LAYOUT` below says
// where the page laid the three chips out - the same way a test says where the title's mark ended up
// (render/logo.js `measureLogo`). Everything else, including the hit-testing of a tap against those
// boxes, is the shipped code.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { STATE } from '../src/game/state.js';
import { isMuted } from '../src/audio/engine.js';
import { CHALLENGES } from '../src/game/challenges.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const VIEW = { width: 1280, height: 720 };
const SEED = 4021;

/** Where the browser put the rail and its three chips, in the window's own pixels. */
const LAYOUT = {
  thumbRail: { rect: { left: 486, top: 640, width: 316, height: 48 } },
  chipToday: { rect: { left: 496, top: 640, width: 96, height: 48 } },
  chipRule: { rect: { left: 602, top: 640, width: 84, height: 48 } },
  chipMute: { rect: { left: 696, top: 640, width: 96, height: 48 } },
};

/** The middle of each chip - where a thumb actually lands when it is aiming for one. */
const CHIP = {};
for (const id of ['Today', 'Rule', 'Mute']) {
  const box = LAYOUT['chip' + id].rect;
  CHIP[id.toLowerCase()] = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** Anywhere else on the title, well clear of the rail at the bottom of it. */
const AWAY = { x: 640, y: 300 };

/** The cycle the rule chip walks, in the order the key walks it (game/challenges.js). */
const CYCLE = ['', ...CHALLENGES.map((c) => c.id)];

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

/** Back to a fresh title, the way every test here starts. */
async function title() {
  await game.resetToTitle(SEED);
  frames(2);
  assert.equal(world.state, STATE.START);
}

test('a visit that arrived with a finger is given the rail', () => {
  assert.equal(game.classes('thumbRail').includes('hidden'), false,
    'the rail is on the glass, not merely in the page');
  // The markup, which is where a chip's word is written and the stub DOM cannot see it.
  const rail = /<div class="rail hidden" id="thumbRail">([\s\S]*?)<\/div>/.exec(PAGE);
  assert.ok(rail !== null, 'the page has the rail, and ships it hidden');
  for (const id of ['chipToday', 'chipRule', 'chipMute']) {
    assert.ok(rail[1].includes('id="' + id + '"'), 'and it holds ' + id);
  }
  assert.ok(/<span class="chip" id="chipToday">TODAY<\/span>/.test(PAGE), 'the day says so in its word');
});

test('the rule chip is the X key: it cycles the rule and launches nothing', async () => {
  await title();
  assert.equal(world.challenge, '', 'the visit starts under no rule');

  tap(CHIP.rule.x, CHIP.rule.y);
  assert.equal(world.state, STATE.START, 'a rule is a choice and not a launch');
  assert.equal(world.challenge, CYCLE[1], 'and the chip put the first rule on');
  assert.match(game.screen.titleChallenge, /ONE HULL/, 'and the title says which');

  // Round the whole cycle and it comes back where it started, exactly as the key does: the chip is a
  // press of X and nothing else, so it cannot have an extra step or a missing one.
  for (let i = 2; i <= CYCLE.length; i++) {
    tap(CHIP.rule.x, CHIP.rule.y);
    assert.equal(world.challenge, CYCLE[i % CYCLE.length], 'press ' + i + ' of the cycle');
  }
  assert.equal(world.state, STATE.START, 'and none of them launched a run');
});

test('the mute chip is the M key: off, then back on, and nothing else', async () => {
  await title();
  assert.equal(isMuted(), false, 'a fresh visit can be heard');

  tap(CHIP.mute.x, CHIP.mute.y);
  assert.equal(isMuted(), true, 'one press is the sound gone');
  assert.equal(world.state, STATE.START, 'and the title is still the title');

  tap(CHIP.mute.x, CHIP.mute.y);
  assert.equal(isMuted(), false, 'and the next one is it back');
});

test('the day chip flies today\'s arena, in one press', async () => {
  await title();
  assert.equal(world.dailyDay, 0, 'nothing has been flown on the day yet');

  tap(CHIP.today.x, CHIP.today.y);
  frames(4);
  assert.equal(world.state, STATE.PLAY, 'one press and the run is flying');
  assert.notEqual(world.dailyDay, 0, 'on the day\'s own arena, which is all the T key does');
});

test('a tap anywhere else on the title is still the launch it always was', async () => {
  await title();

  tap(AWAY.x, AWAY.y);
  frames(4);
  assert.equal(world.state, STATE.PLAY, 'the tap launched an ordinary run');
  assert.equal(world.dailyDay, 0, 'an arena of its own, not the day\'s');
  assert.equal(world.challenge, '', 'under no rule, the chips notwithstanding');
});

test('a chip box is a chip box: a tap beside one is not on it', async () => {
  await title();
  const justBelow = { x: CHIP.rule.x, y: LAYOUT.chipRule.rect.top - 4 };

  tap(justBelow.x, justBelow.y);
  frames(4);
  assert.equal(world.state, STATE.PLAY, 'a hand that missed the rail got a run, not a rule');
  assert.equal(world.challenge, '');
});

test('a panel owns the glass, chips and all', async () => {
  await title();
  game.key('KeyO', true);
  game.key('KeyO', false);
  assert.equal(game.screen.settingsHidden, false, 'the settings are up');
  assert.equal(game.classes('thumbRail').includes('hidden'), false,
    'and the rail is still standing behind them - the page dims the whole title it sits in');

  tap(CHIP.mute.x, CHIP.mute.y);
  assert.equal(game.screen.settingsHidden, false, 'the panel is still the panel');
  assert.equal(isMuted(), false, 'and the chip under it answered nothing');
  assert.equal(world.state, STATE.START, 'and nothing launched behind it');

  game.key('KeyO', true);
  game.key('KeyO', false);
  assert.equal(game.screen.settingsHidden, true, 'the key still takes it back down');
});

test('a chip is the size of the thumb it is for', () => {
  // The half a JavaScript test cannot see: `.chip` is the whole of how big a chip is, and a thumb has
  // a minimum. The number is input/touch.js's own (DASH_MIN, and STICK_MIN beside it) - the same reason
  // the dash ring is never smaller is the reason a chip is never smaller.
  const THUMB_MIN = 44;
  const rule = /\.chip \{([^}]*)\}/.exec(PAGE);
  assert.ok(rule !== null, 'the page styles `.chip`');
  const px = Number(/min-height:\s*(\d+)px/.exec(rule[1])[1]);
  assert.ok(px >= THUMB_MIN, 'a chip is ' + px + 'px tall, and a thumb needs ' + THUMB_MIN);
});
