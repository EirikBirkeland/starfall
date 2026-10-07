// Colour arithmetic (core/palette.js) and the rule that every colour in the game
// is one this arithmetic can read. A colour that parsed as black by mistake would
// put a black hole in the middle of a glow, and the eye is not going to catch it
// from here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, parseColor, withAlpha, mixColors } from '../src/core/palette.js';

test('the colour forms the palette uses all parse', () => {
  assert.deepEqual(parseColor('#ff0000'), [255, 0, 0]);
  assert.deepEqual(parseColor('#0f0'), [0, 255, 0]);
  assert.deepEqual(parseColor('rgb(0, 0, 255)'), [0, 0, 255]);
  assert.deepEqual(parseColor('rgba(0, 0, 255, 0.5)'), [0, 0, 255]);
  assert.deepEqual(parseColor('rgb(1.4, 2.6, 3.5)'), [1, 3, 4]);
});

test('a colour that is not a colour is an error, not black', () => {
  for (const bad of ['red', '', '#ff00', 'rgba(1,2)', '#gggggg', null, 7]) {
    assert.throws(() => parseColor(bad), /not a colour/, String(bad) + ' should not pass for a colour');
  }
});

test('withAlpha keeps the colour and replaces the opacity', () => {
  assert.equal(withAlpha('#5ef7ff', 0.5), 'rgba(94,247,255,0.5)');
  assert.equal(withAlpha('rgba(94,247,255,0.18)', 1), 'rgba(94,247,255,1)');
  assert.equal(withAlpha('#ffffff', 0), 'rgba(255,255,255,0)');
  // An opacity out of range is a bug in the caller; say it by clamping loudly.
  assert.equal(withAlpha('#ffffff', 4), 'rgba(255,255,255,1)');
  assert.equal(withAlpha('#ffffff', -1), 'rgba(255,255,255,0)');
});

test('mixing gives the ends and the middle', () => {
  assert.equal(mixColors('#000000', '#ffffff', 0), '#000000');
  assert.equal(mixColors('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mixColors('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mixColors('#ff0000', '#0000ff', 0.25), '#bf0040');
  assert.equal(mixColors('#0000ff', '#ff0000', 4), '#ff0000', 'a mix past the end is the end');
});

test('every colour in the palette is one that parses', () => {
  for (const [name, value] of Object.entries(PALETTE)) {
    if (Array.isArray(value)) {
      for (const part of value) assert.equal(parseColor(part).length, 3, name + ' holds a colour that does not parse');
    } else {
      assert.equal(parseColor(value).length, 3, name + ' is not a colour this can read');
    }
  }
});
