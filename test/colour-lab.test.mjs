// The ruler, checked on its own before it is trusted to measure anything.
//
// `tools/colour-lab.js` makes two kinds of claim: numbers about a colour (how bright it is, how far
// two of them are apart), and a model of what survives losing a cone of the eye. The second kind is
// where a silent mistake would do the most damage - an eye wired to the wrong axis would let a whole
// family of collisions through while the report looked spotless - so the eyes are tested against
// what they are named for, on colours built by hand rather than on colours the game happens to ship.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseColor } from '../src/core/palette.js';
import {
  luminance, lightnessStar, oklab, oklch, screenHue, over,
  VISIONS, seenBy, separation, worstVision, STEP_OF,
} from '../tools/colour-lab.js';

test('the extremes of brightness are the extremes', () => {
  assert.equal(luminance([0, 0, 0]), 0);
  assert.equal(luminance([255, 255, 255]), 1);
  assert.equal(lightnessStar([0, 0, 0]), 0);
  assert.ok(Math.abs(lightnessStar([255, 255, 255]) - 100) < 1e-9);
  // Oklab's L runs the same way, 0 to 1, and green is the brightest of the three primaries -
  // which is the whole reason a mint shard reads as a bright thing and a blood-red sniper does not.
  assert.ok(oklab([0, 255, 0]).L > oklab([255, 0, 0]).L);
  assert.ok(oklab([0, 255, 0]).L > oklab([0, 0, 255]).L);
  assert.ok(Math.abs(oklab([255, 255, 255]).L - 1) < 1e-6);
  assert.ok(Math.abs(oklab([0, 0, 0]).L) < 1e-6);
});

test('a grey has no colour, and a colour has a hue', () => {
  for (const grey of ['#000000', '#808080', '#ffffff']) {
    assert.ok(oklch(parseColor(grey)).C < 1e-6, grey + ' is a grey and should carry no chroma');
  }
  assert.ok(oklch(parseColor('#ff0000')).C > 0.15);
});

test('the plain screen hue says what the plain screen hue means', () => {
  // `screenHue` exists to cross-check `oklch`'s hue, so this is the whole of its contract: the
  // primaries sit where the screen says they do, and a grey has no angle to report. Oklab's wheel
  // is turned relative to this one - that is what a perceptual space costs - and all the audit
  // needs from that is that well-separated colours stay well separated on it.
  assert.equal(screenHue([255, 0, 0]), 0);
  assert.equal(screenHue([0, 255, 0]), 120);
  assert.equal(screenHue([0, 0, 255]), 240);
  assert.equal(screenHue([128, 128, 128]), 0);
  const hueOf = (colour) => oklch(parseColor(colour)).h;
  assert.ok(Math.abs(hueOf('#ff0000') - hueOf('#00ff00')) > 60);
  assert.ok(Math.abs(hueOf('#00ff00') - hueOf('#0000ff')) > 60);
  assert.ok(Math.abs(hueOf('#ff0000') - hueOf('#0000ff')) > 60);
});

test('a colour is one colour to every eye', () => {
  const lab = oklab(parseColor('#5ef7ff'));
  for (const vision of VISIONS) {
    assert.equal(separation(vision.id, lab, lab).ratio, 0);
  }
});

test('each eye is blind along exactly the axis its name says', () => {
  // Built by hand rather than read off a screen: one colour, and its twin moved along a single axis.
  const base = { L: 0.6, a: 0, b: 0 };
  const brighter = { L: 0.6 + STEP_OF.L, a: 0, b: 0 };
  const alongRedGreen = { L: 0.6, a: STEP_OF.a, b: 0 };
  const alongBlueYellow = { L: 0.6, a: 0, b: STEP_OF.b };

  // One step along one axis, and the eye that kept that axis sees one step of difference. Nobody
  // here is claiming a just-noticeable difference; STEP_OF *is* the step, so this is a definition
  // checked against itself - which is what makes the number meaningful when it is used on a pair.
  // (The tolerance is floating-point noise in the division, nothing to do with colour.)
  const step = (actual) => assert.ok(Math.abs(actual - 1) < 1e-9, 'one step is one step, got ' + actual);
  step(separation('greyscale', base, brighter).ratio);
  step(separation('protanopia', base, alongBlueYellow).ratio);
  step(separation('tritanopia', base, alongRedGreen).ratio);

  // And the axis each of them has lost is gone: not small, *gone*, because the model is a projection.
  assert.equal(separation('greyscale', base, alongRedGreen).ratio, 0);
  assert.equal(separation('greyscale', base, alongBlueYellow).ratio, 0);
  assert.equal(separation('protanopia', base, alongRedGreen).ratio, 0);
  assert.equal(separation('deuteranopia', base, alongRedGreen).ratio, 0);
  assert.equal(separation('tritanopia', base, alongBlueYellow).ratio, 0);
});

test('the red-green eyes are the ones the palette is argued against', () => {
  // Red against green: the confusion the whole exercise exists for. A normal eye has both axes, so
  // it has the largest number; the two eyes missing the red-green axis are left with whatever
  // brightness the two colours happen to differ by - and that is the reading to design against.
  const red = oklab(parseColor('#ff0000'));
  const green = oklab(parseColor('#00ff00'));
  const normal = separation('normal', red, green).ratio;
  const protan = separation('protanopia', red, green).ratio;
  const tritan = separation('tritanopia', red, green).ratio;
  assert.ok(protan < normal, 'a red-green pair must be harder without the red-green axis');
  assert.ok(tritan > protan, 'and a blue-blind eye keeps what the red-blind one lost');
  // Achromatopsia sees the least of any of them: two colours of no hue difference at all.
  assert.ok(separation('greyscale', red, green).ratio <= protan);
});

test('an eye keeps the axes it is documented to keep', () => {
  // The doc block above VISIONS says this in prose. If someone re-wires an eye to the wrong axis -
  // which is exactly the bug this table had once - the report goes quietly optimistic, and this is
  // the line that says so instead.
  assert.deepEqual(VISIONS.find((v) => v.id === 'normal').keeps, ['L', 'a', 'b']);
  assert.deepEqual(VISIONS.find((v) => v.id === 'protanopia').keeps, ['L', 'b']);
  assert.deepEqual(VISIONS.find((v) => v.id === 'deuteranopia').keeps, ['L', 'b']);
  assert.deepEqual(VISIONS.find((v) => v.id === 'tritanopia').keeps, ['L', 'a']);
  assert.deepEqual(VISIONS.find((v) => v.id === 'greyscale').keeps, ['L']);
  assert.deepEqual(seenBy('greyscale', oklab(parseColor('#ff0000'))).map((a) => a.axis), ['L']);
});

test('a translucent colour is measured where it lands, not as written', () => {
  assert.deepEqual(over([255, 0, 0], 1, [0, 0, 0]), [255, 0, 0]);
  assert.deepEqual(over([255, 0, 0], 0, [0, 0, 0]), [0, 0, 0]);
  assert.deepEqual(over([255, 0, 0], 0.5, [0, 0, 0]), [128, 0, 0]);
  assert.deepEqual(over([255, 0, 0], 0.16, [0, 0, 0]), [41, 0, 0]);
  // Which is the point: a 16% red on a night sky is a dark red, and a ruler that measured the red
  // as written would be measuring a colour nobody is ever shown.
  assert.ok(oklab(over([255, 77, 109], 0.16, [5, 12, 30])).L < oklab([255, 77, 109]).L * 0.5);
});

test('the worst eye is the one with the least to work with', () => {
  const pale = oklab(parseColor('#ffffff'));
  const warm = oklab(parseColor('#ff8a45'));
  const every = VISIONS.map((v) => separation(v.id, pale, warm).ratio);
  const worst = worstVision(pale, warm);
  assert.equal(worst.ratio, Math.min(...every), 'the worst of five eyes is their minimum');
  // Narrowing the set to one eye is how the palette asks for a specific eye's opinion, and the
  // three-eyed reading the audit uses is the minimum of exactly those three.
  assert.equal(worstVision(pale, warm, ['normal']).ratio, separation('normal', pale, warm).ratio);
  const three = ['protanopia', 'deuteranopia', 'tritanopia'];
  assert.equal(worstVision(pale, warm, three).ratio, Math.min(
    separation('protanopia', pale, warm).ratio,
    separation('deuteranopia', pale, warm).ratio,
    separation('tritanopia', pale, warm).ratio,
  ));
  assert.equal(worstVision(pale, pale, ['normal']).ratio, 0);
});

test('an eye nobody measured is an error, not a free pass', () => {
  const lab = oklab(parseColor('#58ffa1'));
  assert.throws(() => separation('tetrachromacy', lab, lab), /nobody has measured an eye/);
  assert.throws(() => seenBy('frog', lab), /nobody has measured an eye/);
});
