// The title's mark, painted (render/logo.js).
//
// There is no browser here, so no test can say the logo looks good. What these can say is that it is
// a real piece of the picture and not a diagram:
//
//   the letters are drawn on the frame and not only in the arithmetic - at the places the layout
//     says, in window pixels, while the tube widths stay in the letter's own unit box, which is
//     what "scaled once" means and the only way to catch a painter that scaled twice;
//   it costs strokes and one sprite per light: no `shadowBlur`, no gradient built this frame, and
//     nothing baked once the word has arrived;
//   it is painted while the world is on its title screen, and it is not painted after.
//
// The box is the real one for a 1280x720 window: `#logoBox` is min(92vw, 880px) by
// clamp(56px, 13.5vh, 132px), so these numbers are what an ordinary laptop shows and not ones
// invented for the test. The same trick as test/awards-art.test.mjs: price one painter on a canvas
// of its own so the arena behind it is not part of the bill.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { drawLogo, logoAge, logoLayout, measureLogo } from '../src/render/logo.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const SECOND = Math.round(1000 / FRAME);
const BOX = { left: 200, top: 60, width: 880, height: 97 };

const game = await bootGame({
  root: ROOT, seed: 91, dpr: 1, width: 1280, height: 720,
  layout: { logoBox: { rect: BOX } },
});

/** Price one frame's worth of mark, on a canvas of its own, at the moment the clock stands. */
function price() {
  return game.measure((ctx) => drawLogo(ctx));
}

/** Does the last frame's own path log hold a point at `where`? (dpr 1, so pixels are pixels.) */
function painted(where) {
  return game.points().some((p) => Math.abs(p.x - where.x) < 0.01 && Math.abs(p.y - where.y) < 0.01);
}

/** Every point of one letter's tubes, in window pixels. */
function outline(letter) {
  const out = [];
  for (const tube of letter.glyph.tubes) {
    for (const p of tube.pts) {
      out.push({ x: letter.x + p.x * letter.cap, y: letter.y + p.y * letter.cap });
    }
  }
  return out;
}

/** Step until the word is all lit and the rule is out, and no further. */
function settled() {
  while (logoAge() < 1.3) game.step(FRAME);
}

/** Step until a star is out, or twelve seconds have gone by. */
function waitForStar() {
  for (let i = 0; i < 12 * SECOND; i++) {
    game.step(FRAME);
    if (logoLayout().star !== null) return logoLayout();
  }
  return null;
}

settled();

test('a frame paints the word where the layout says it is', () => {
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.START);
  const layout = logoLayout();
  assert.equal(layout.letters.length, 8);
  for (const letter of layout.letters) {
    for (const point of outline(letter)) {
      assert.ok(painted(point), letter.ch + ' was not drawn at ' + point.x + ',' + point.y);
    }
  }
  // ...and the rule under it, which is the one piece that is not a letter.
  assert.ok(painted({ x: layout.rule.cx - layout.rule.half, y: layout.rule.y }),
    'the rule under the word was drawn');
});

test('the whole mark scales linearly with the box it was given', () => {
  // Half the height is half the cap, half the word, half the tube and half the rule - and the tubes
  // stay fractions of the cap, so the mark is one drawing at two sizes rather than a different one.
  const wide = logoLayout();
  measureLogo({
    getBoundingClientRect: () => ({ left: BOX.left, top: BOX.top, width: BOX.width, height: BOX.height / 2 }),
  });
  const half = logoLayout();
  measureLogo({
    getBoundingClientRect: () => ({ left: BOX.left, top: BOX.top, width: BOX.width, height: BOX.height }),
  });

  assert.ok(Math.abs(half.cap - wide.cap / 2) < 0.001,
    'cap ' + half.cap + ' against ' + wide.cap);
  assert.ok(Math.abs(half.w - wide.w / 2) < 0.01, 'the word halves with the box');
  assert.ok(Math.abs(half.rule.thick - wide.rule.thick / 2) < 0.001, 'the rule halves with it');
  assert.ok(Math.abs((half.x + half.w / 2) - (wide.x + wide.w / 2)) < 0.01,
    'and both are centred in the box they are in');
  assert.equal(logoLayout().cap, wide.cap, 'and it went back when the box did');

  const thickest = Math.max(...price().widths.filter((w) => w > 0 && w < 1));
  assert.ok(thickest * wide.cap > 4 && thickest * wide.cap < 30,
    'the widest pass lays a tube ' + (thickest * wide.cap).toFixed(1) + 'px thick on this window');
});

test('a settled mark is strokes and nothing else: no blur, no gradient, no new sprite', () => {
  const before = game.bakeCalls();
  game.step(FRAME);
  const cost = price();

  assert.equal(logoLayout().star, null, 'no star in this frame, so nothing is stamped at all');
  assert.equal(cost.images, 0, 'the letters themselves are drawn, not stamped');
  assert.equal(cost.shadows, 0, 'nothing asked the canvas for a blur');
  assert.equal(cost.gradients, 0, 'nothing built a gradient this frame');
  assert.equal(game.bakeCalls().canvases, before.canvases, 'the settled mark bakes nothing');
  assert.ok(cost.strokes > 20, 'the tubes are drawn: ' + cost.strokes);
  assert.ok(cost.strokes < 60, 'and it is a word, not a crowd: ' + cost.strokes);
  assert.ok(cost.fills <= 2, 'the only fills are the two diamonds at the ends of the rule');
  assert.ok(cost.translates <= 12, 'one transform per letter and no more: ' + cost.translates);
});

test('every tube gets three passes, from a wide halo to a hot core', () => {
  const distinct = [...new Set(price().widths.filter((w) => w < 1))];
  assert.equal(distinct.length, 3, 'halo, colour, core: ' + distinct.join(', '));
  const [core, body, halo] = distinct.slice().sort((a, b) => a - b);
  assert.ok(body > core, 'the body is wider than the core');
  assert.ok(halo > body, 'and the halo wider than the body');
  assert.ok(halo < core * 6, 'the halo is soft, not a searchlight: ' + halo / core + 'x the core');
});

test('the mark asks for round caps and joins, the way a bent tube is', () => {
  // The stub keeps whatever a painter sets (its `restore` puts the transform back and nothing
  // else), so this is a claim about what the painter asked the canvas for - which is the thing worth
  // pinning: nothing else in the game draws open-ended polylines at these widths, so if the mark ever
  // stopped asking, the letters' corners would go flat and this would say so.
  const ctx = game.context;
  drawLogo(ctx);
  assert.equal(ctx.lineCap, 'round');
  assert.equal(ctx.lineJoin, 'round');
});

test('a falling star is one stamped light and three legs that narrow away from it', () => {
  const layout = waitForStar();
  assert.ok(layout !== null, 'a star comes past within twelve seconds');

  const cost = price();
  assert.equal(cost.images, 1, 'the head is one glow sprite, added to the sky');
  assert.equal(cost.stamps[0].mode, 'lighter');
  // The stamp log records the corner a sprite is laid at, so the middle is half a sprite away.
  const head = cost.stamps[0];
  assert.ok(Math.abs(head.at.x + head.w / 2 - layout.star.x) < 0.5, 'and it sits on the star');
  assert.ok(Math.abs(head.at.y + head.h / 2 - layout.star.y) < 0.5, 'and it sits on the star');
  assert.ok(head.w > 8 && head.w < layout.cap * 1.2,
    'a pool of light, not a searchlight: ' + head.w);
  assert.equal(cost.shadows, 0);
  assert.equal(cost.gradients, 0);

  const legs = cost.widths.slice(-3);
  assert.ok(legs[0] > legs[1] && legs[1] > legs[2],
    'the trail narrows as it runs out: ' + legs.join(', '));
  assert.ok(legs[0] < layout.cap, 'and it is thinner than a letter of the word it falls past');
});

test('the mark is painted while the world is on its title screen and not after', () => {
  settled();
  game.step(FRAME);
  const corner = outline(logoLayout().letters[0])[0];
  assert.ok(painted(corner), 'the first letter of the word was drawn this frame');

  game.pressMouse(640, 400);
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.PLAY, 'the run is flying');
  assert.ok(!painted(corner), 'the mark is gone with the title it belongs to');
  assert.ok(game.points().length > 0, '...and the frame still draws the arena it was replaced by');
});
