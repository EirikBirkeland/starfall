// The award plate as it is drawn (render/toast.js).
//
// There is no browser here, so this cannot say the plate looks good. What it can say is the four
// promises that make it an honest piece of the picture:
//
//   it is one plate of three pieces, in the one strip of window nothing else uses - under the boss
//     bar, clear of the score, the hull and the XP bar - and it is centred, because it is news
//     about the run and not a readout bolted to a corner of it;
//   every award's own words fit it. The `says` lines are prose written by hand at no particular
//     length, and a plate that clips "still be standing" into "still be st…" is a plate that has
//     stopped explaining the thing it is celebrating;
//   it costs no gradient, no blur and no sprite: a plate is a rounded plate, a stroke, and words,
//     and it lands in the middle of a fight that needs the frame for the crowd;
//   and the stack has a bottom - a fifth award does not bury the fourth, it replaces the one that
//     has been up longest.
//
// Same trick as test/overcharge-art.test.mjs: count what a frame asks the canvas for
// (tools/headless/harness.js), and read back the words it drew and where.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { AWARDS, dustOf, nameOf } from '../src/game/awards.js';
import { bossBarLayout } from '../src/render/hud.js';
import {
  advanceToasts, clearToasts, drawToasts, pushAwardToast, toastCount, toastLayout,
} from '../src/render/toast.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;

const game = await bootGame({ root: ROOT, seed: 4109, width: 1280, height: 720, storage: {} });
const VIEW_W = 1280;
const PLATE_W = 320;

/** Put one award's plate up and let it finish arriving, so its box and its brightness are steady. */
function raiseOne(id) {
  clearToasts();
  pushAwardToast({ name: nameOf(id), says: saysOf(id), dust: dustOf(id) });
  advanceToasts(0.2);
  return toastLayout()[0];
}

/** The row a plate's rule says, looked up by id rather than repeated here. */
function saysOf(id) {
  for (const award of AWARDS) if (award.id === id) return award.says;
  throw new Error('no award is called ' + id);
}

/**
 * Let the game paint one frame, and measure the plate on a canvas of its own.
 *
 * The frame is the painter - render/renderer.js calls `drawToasts`, so stepping is what proves the
 * wiring and not just the arithmetic - and its draw log is what `words()` reads back. `measure`
 * paints the same plates again on a stub of their own, which is the only way to ask what *one*
 * plate costs when the frame around it is drawing a whole arena.
 */
function paint() {
  game.step(FRAME);
  return { cost: game.measure((ctx) => drawToasts(ctx)), words: game.texts() };
}

test('a plate is one rounded plate, three pieces of type, and nothing built mid-frame', () => {
  const plate = raiseOne('century');
  assert.equal(toastCount(), 1);
  assert.equal(plate.w, PLATE_W);
  assert.equal(plate.x, (VIEW_W - PLATE_W) / 2, 'centred: this is news about the run');
  assert.ok(plate.glow > 0.99, 'it has finished arriving');
  assert.ok(Math.abs(plate.y - 84) < 0.001, 'and it has landed where it belongs');

  // The one strip of window it uses is the one strip nothing else uses: below the boss bar.
  const bar = bossBarLayout(VIEW_W);
  assert.ok(plate.y > bar.y + bar.h, 'under the boss bar, not over it');
  assert.ok(plate.y + plate.h < 720 / 3, 'and well above the middle of the fight');

  const painted = paint();
  assert.equal(painted.cost.gradients, 0, 'no gradient built');
  assert.equal(painted.cost.shadows, 0, 'no blur');
  assert.equal(painted.cost.images, 0, 'no sprite of its own - a plate is not a glow');
  assert.equal(painted.cost.texts, 4, 'name twice (the halo and the word), the money, the reason');
  assert.equal(painted.cost.fills, 2, 'the plate and its gold edge');
});

test('every award on the table has words that fit the plate they are painted on', () => {
  for (const award of AWARDS) {
    const plate = raiseOne(award.id);
    const painted = paint();
    const strings = painted.words.map((word) => word.text);

    assert.ok(strings.indexOf(award.name) >= 0, award.id + "'s name is on its plate");
    assert.ok(strings.indexOf(award.says) >= 0,
      award.id + "'s reason was cut short: " + strings.join(' / '));
    assert.ok(strings.indexOf('+' + dustOf(award.id) + ' STARDUST') >= 0,
      award.id + "'s money is on its plate");

    // Nothing may hang off the edge: `textW` is the room between the two margins, and the money is
    // drawn right-aligned to the far one.
    const right = plate.x + plate.w;
    for (const word of painted.words) {
      const left = word.align === 'right' ? word.x - word.w : word.x;
      assert.ok(left >= plate.x, award.id + ' draws a word off its left edge');
      assert.ok(left + word.w <= right, award.id + ' draws ' + word.text + ' off its right edge');
      assert.ok(word.y >= plate.y && word.y <= plate.y + plate.h,
        award.id + ' draws ' + word.text + ' outside the plate');
    }
  }
  clearToasts();
});

test('the stack grows down, and a fifth award replaces the one that has been up longest', () => {
  clearToasts();
  const ids = AWARDS.slice(0, 5).map((award) => award.id);
  for (const id of ids) {
    pushAwardToast({ name: nameOf(id), says: saysOf(id), dust: dustOf(id) });
    advanceToasts(0.05);
  }
  assert.equal(toastCount(), 4, 'four plates and no more');
  const stack = toastLayout();
  assert.equal(stack[0].name, nameOf(ids[1]), 'the first one went to make room');
  assert.equal(stack[3].name, nameOf(ids[4]), 'and the newest is at the bottom of the stack');
  for (let i = 1; i < stack.length; i++) {
    assert.ok(stack[i].y > stack[i - 1].y, 'they go down, not up or over');
    assert.ok(stack[i].y >= stack[i - 1].y + stack[i - 1].h, 'and none of them overlaps');
  }
});

test('a plate holds, fades, and is gone with nothing pressed', () => {
  const plate = raiseOne('gold-touch');
  assert.equal(plate.glow, 1, 'fully up at first');
  advanceToasts(1);
  assert.equal(toastCount(), 1, 'it holds');
  assert.equal(toastLayout()[0].glow, 1);
  advanceToasts(2.3);
  assert.ok(toastLayout()[0].glow < 1, 'then it fades');
  advanceToasts(0.5);
  assert.equal(toastCount(), 0, 'and then it is not drawn at all');
  assert.equal(paint().cost.fills, 0, 'and a frame with nothing to say asks for nothing');
});
