// The mark, for a visitor who asked for as little movement as the machine can give.
//
// `prefers-reduced-motion: reduce` is a request, not a suggestion, and the game reads it in two
// places: the CSS stops its pulsing and its arrivals (index.html), and the canvas puts the title's
// mark up already lit and never animates it again (render/logo.js, through render/canvas.js). The
// mark is still there - it is the logo, and a title screen with no logo is a blank page - it simply
// arrives once, whole, and then holds.
//
// This is its own file because a visit has one answer to that query, and one boot per process.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { logoAge, logoDim, logoLayout } from '../src/render/logo.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const SECOND = Math.round(1000 / FRAME);

const game = await bootGame({
  root: ROOT, seed: 5, dpr: 1, width: 1280, height: 720, motion: 'reduce',
  layout: { logoBox: { rect: { left: 200, top: 60, width: 880, height: 108 } } },
});

/** The one number a letter may not be pinned by: its brightness, per letter. */
function lights(layout) {
  return layout.letters.map((l) => l.bright);
}

test('the mark is up whole before it has had a single frame', () => {
  assert.equal(logoAge() > 1, true, 'the clock starts at the end of the arrival');
  const layout = logoLayout();
  assert.equal(layout.letters.length, 8, 'all eight letters, at once');
  assert.ok(layout.letters.every((l) => l.draw === 1), 'every tube drawn');
  assert.ok(layout.rule.open > 0.99, 'the rule is out');
  assert.equal(layout.star, null, 'and no star is falling');
  const bright = lights(layout);
  assert.equal(new Set(bright).size, 1, 'every letter lit equally: ' + bright.join(', '));
  assert.ok(bright[0] > 0.5, 'lit, and not a flare: ' + bright[0]);
});

test('a second on the title changes nothing about it', () => {
  const first = logoLayout();
  for (let i = 0; i < SECOND; i++) game.step(FRAME);
  const later = logoLayout();
  assert.equal(later.cap, first.cap);
  assert.equal(later.x, first.x);
  assert.equal(later.y, first.y);
  assert.deepEqual(lights(later), lights(first), 'it does not breathe, shimmer, or arrive');
  assert.equal(later.rule.open, first.rule.open);
});

test('twenty seconds of frames and no star ever falls', () => {
  for (let i = 0; i < 20 * SECOND; i++) {
    game.step(FRAME);
    assert.equal(logoLayout().star, null, 'frame ' + i);
  }
  assert.equal(logoLayout().letters.length, 8, 'the word is still up');
});

test('a panel steps the mark back at once, rather than over a quarter of a second', () => {
  // The fade the mark's step back usually takes is movement, and this visitor asked for none of it
  // (render/logo.js, and the same request that pins the arrival). The brightness changes on the frame
  // the panel opens, and that is the whole of the animation.
  const press = (code) => { game.key(code, true); game.key(code, false); game.step(FRAME); };
  press('KeyH');
  assert.equal(game.screen.hangarHidden, false, 'the hangar is up');
  assert.ok(logoDim() < 0.2, 'and the mark is already stepped back: ' + logoDim());
  press('KeyH');
  assert.equal(game.screen.hangarHidden, true, 'and down again');
  assert.equal(logoDim(), 1, 'straight back to full light, on the one frame');
});
