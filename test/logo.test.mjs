// The title's mark: the word, where it sits, and how it arrives (render/logo.js).
//
// There is no browser here, so this cannot say the logo looks good. What it can say is the five
// promises that make it an honest piece of the picture:
//
//   it spells the game's name, in the order the name is spelled, out of straight lengths that all
//     stay inside the letter they belong to;
//   it sits where the page measured, inside the box it was given, with the letters in a row and not
//     on top of each other - which is the only way a mark painted on a canvas can be said to belong
//     under a column the DOM laid out;
//   it arrives - nothing, then letter by letter, then the rule - and then never quite sits still;
//   a star falls past it now and then, inside the window the whole time it is on the glass, and the
//     word is brighter while it passes;
//   and it is painted because the world is on its title screen, and it is not painted when the world
//     is not - which test/logo-art.test.mjs is the one that checks, along with what it costs.
//
// The box is a real one - `#logoBox` in the markup is min(92vw, 880px) by clamp(56px, 13.5vh, 132px),
// and this boots a 1280x720 window with the numbers that gives, so the geometry below is what a
// player on an ordinary laptop gets and not a number invented for the test.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { logoAge, logoLayout, measureLogo } from '../src/render/logo.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const SECOND = Math.round(1000 / FRAME);
const BOX = { left: 200, top: 60, width: 880, height: 97 };
const WINDOW = { w: 1280, h: 720 };

const game = await bootGame({
  root: ROOT, seed: 77, dpr: 1, width: WINDOW.w, height: WINDOW.h,
  layout: { logoBox: { rect: BOX } },
});

/** Step `seconds` of frames, one at a time, so every frame in between is really drawn. */
function run(seconds) {
  for (let i = 0; i < Math.round(seconds * SECOND); i++) game.step(FRAME);
}

/** The brightest a letter is anywhere in this layout. */
function peak(layout) {
  return Math.max(...layout.letters.map((l) => l.bright));
}

test('before the first frame nothing is on the glass', () => {
  assert.equal(logoAge(), 0, 'the mark keeps a clock and the harness has not run one yet');
  assert.equal(logoLayout().letters.length, 0);
  assert.equal(logoLayout().rule.open, 0);
  assert.equal(logoLayout().star, null);
});

test('it arrives letter by letter and then settles', () => {
  run(0.1);
  let layout = logoLayout();
  assert.ok(layout.letters.length >= 1 && layout.letters.length <= 3,
    'a letter or two is on the glass at a tenth of a second: ' + layout.letters.length);
  assert.ok(layout.letters[layout.letters.length - 1].draw < 1,
    'and the newest of them is still being drawn');
  assert.ok(peak(layout) > 1, 'a letter that has just lit is a hot one');

  run(0.15);
  layout = logoLayout();
  assert.ok(layout.letters.length >= 2, 'the next one arrives before the first has cooled');
  assert.ok(layout.letters[0].draw > layout.letters[layout.letters.length - 1].draw,
    'and they arrive in the order they are spelled');
  assert.ok(layout.letters.length < 8, 'the word is not all up yet: ' + layout.letters.length);
  assert.equal(layout.rule.open, 0, 'and the rule under it has not started');

  run(0.8);
  layout = logoLayout();
  assert.equal(layout.letters.length, 8, 'the whole word is up');
  assert.ok(layout.letters.every((l) => l.draw === 1), 'every tube is drawn');
  assert.ok(layout.rule.open > 0.99, 'and the rule is out');
  for (const letter of layout.letters) {
    assert.ok(letter.bright > 0.5 && letter.bright < 1.6,
      letter.ch + ' settles to a glow, not to a flare: ' + letter.bright);
  }
});

test('the mark spells the name, in order, in straight lengths', () => {
  const layout = logoLayout();
  assert.equal(layout.letters.map((l) => l.ch).join(''), 'starfall');
  for (const letter of layout.letters) {
    assert.ok(letter.glyph.tubes.length > 0, letter.ch + ' is made of at least one tube');
    for (const tube of letter.glyph.tubes) {
      assert.ok(tube.pts.length > 1, letter.ch + ' has a tube with nothing in it');
      assert.ok(tube.total > 0, letter.ch + ' has a tube of no length');
      for (const point of tube.pts) {
        assert.ok(point.x >= 0 && point.x <= letter.glyph.w + 0.001,
          letter.ch + ' reaches outside its own width');
        assert.ok(point.y >= 0 && point.y <= 1, letter.ch + ' reaches outside its own height');
      }
    }
  }
});

test('it sits where the page measured, and inside the box it was given', () => {
  const layout = logoLayout();
  const cx = BOX.left + BOX.width / 2;
  assert.ok(Math.abs(layout.x + layout.w / 2 - cx) < 0.01, 'centred in the box, not in the window');
  assert.ok(layout.x >= BOX.left, 'the word starts inside the box');
  assert.ok(layout.x + layout.w <= BOX.left + BOX.width, '...and ends inside it');
  assert.ok(layout.y >= BOX.top, 'the word starts below the top of the box');
  assert.ok(layout.rule.y <= BOX.top + BOX.height, 'the rule under it is still inside it');
  assert.ok(layout.cap * 1.355 <= BOX.height + 0.01, 'the whole mark is no taller than the box');
  assert.ok(layout.cap > 30, 'and it is big enough to be a logo: ' + layout.cap);
});

test('a window half the size gets a mark that fits it', () => {
  // The same box shape on a small screen: the mark bounds itself by the box, so the only way this
  // can go wrong is by growing past it - and the letters have to stay in a row while it does.
  const wide = logoLayout().cap;
  measureLogo({ getBoundingClientRect: () => ({ left: 40, top: 30, width: 440, height: 52 }) });
  const small = logoLayout();
  assert.ok(small.x >= 40 && small.x + small.w <= 480, 'inside a 440px box: ' + small.w);
  assert.ok(small.cap * 1.355 <= 52 + 0.01, 'and inside its height');
  assert.ok(small.cap < wide, 'a smaller box is a smaller mark: ' + small.cap + ' against ' + wide);
  assert.equal(small.letters.length, 8, 'every letter still there');
  assert.ok(small.letters[7].x > small.letters[0].x, 'still in a row');
  measureLogo({ getBoundingClientRect: () => ({ left: BOX.left, top: BOX.top,
    width: BOX.width, height: BOX.height }) });
  assert.equal(logoLayout().cap, wide, 'and it goes back when the box does');
});

test('the letters stand in a row and do not touch each other', () => {
  const letters = logoLayout().letters;
  for (let i = 1; i < letters.length; i++) {
    const before = letters[i - 1];
    const here = letters[i];
    assert.equal(here.y, before.y, 'the word sits on one line');
    assert.equal(here.cap, before.cap, 'and in one size');
    assert.ok(here.x > before.x + before.w, before.ch + ' and ' + here.ch + ' overlap');
  }
});

test('it never quite sits still, and nothing about it grows over time', () => {
  const first = logoLayout();
  run(3);
  const later = logoLayout();
  assert.equal(later.cap, first.cap, 'the same window is the same mark');
  assert.equal(later.letters.length, first.letters.length);
  assert.notEqual(later.letters[0].bright, first.letters[0].bright, 'a neon sign breathes');
  const high = peak(later);
  const low = Math.min(...later.letters.map((l) => l.bright));
  assert.ok(high > low, 'the shine travels along it rather than lifting all of it at once');
  assert.ok(high < 1.6 && low > 0.5, 'and it stays a glow: ' + low + ' to ' + high);
});

test('a star falls past the word, inside the window, and it comes back', () => {
  const starts = [];
  let wasOut = false;
  let crossed = false;
  let brightest = 0;
  let quiet = 0;
  for (let i = 0; i < 16 * SECOND; i++) {
    game.step(FRAME);
    const now = logoLayout();
    if (now.star === null) {
      wasOut = false;
      quiet = Math.max(quiet, peak(now));
      continue;
    }
    if (!wasOut) starts.push(logoAge());
    wasOut = true;
    brightest = Math.max(brightest, peak(now));
    assert.ok(now.star.x > -now.cap - 1 && now.star.x < WINDOW.w + now.cap + 1,
      'the star is inside the window: x ' + now.star.x);
    assert.ok(now.star.y > -now.cap - 1 && now.star.y < WINDOW.h + now.cap + 1,
      'the star is inside the window: y ' + now.star.y);
    assert.ok(now.star.strength >= 0 && now.star.strength <= 1);
    if (now.star.x > now.x && now.star.x < now.x + now.w) crossed = true;
  }
  assert.ok(starts.length >= 2, 'it comes again and again, not once: ' + starts.length);
  const gap = starts[1] - starts[0];
  assert.ok(gap > 6 && gap < 8, 'about every seven seconds: ' + gap.toFixed(2));
  assert.ok(crossed, 'it passes over the word, which is what lights the letters');
  assert.ok(brightest > quiet, 'and the word is brighter while it does');
});

test('an element that is not there does not move the mark', () => {
  const before = logoLayout();
  measureLogo(null);
  measureLogo({});                          // no getBoundingClientRect at all
  measureLogo({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) });
  const after = logoLayout();
  assert.equal(after.x, before.x);
  assert.equal(after.y, before.y);
  assert.equal(after.cap, before.cap);
});
