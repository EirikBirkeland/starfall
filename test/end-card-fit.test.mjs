// The two ending cards are one body each, fitted to the glass the HUD leaves them.
//
// A late run's card is the tallest thing in the game - a full build, every hull, the day, the rule,
// the awards - and centred in a flex column it ran its hint onto the XP bar at 720 px and its title
// under the phone's top-left HUD. Session 176 wrapped both cards in `.end-body` (index.html) and
// fitted them with `fitEndCard`; this file holds the structure and the arithmetic, without a browser.
//
// The real-browser audit that found it is `.scratch/browser-screens.mjs`: the screenshots at
// 1280x720 and 390x844 are what said the fit was needed and that the body lands where it should.
// This test is the part that can run in the suite.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fitEndCard } from '../src/ui/screens.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const HTML = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('both ending cards are one body, and the fit has a body to measure', () => {
  assert.match(HTML, /id="overBody"/, 'the death card has a body to scale');
  assert.match(HTML, /id="winBody"/, 'the win card has a body to scale');
  assert.match(HTML, /\.end-body\s*\{/, 'the body is a flex column, not the screen itself');
  assert.match(HTML, /#overScreen, #winScreen \{ padding:/,
    'the HUD strip is reserved in the one place the fit reads it');
});

test('a late card is scaled to the glass the HUD leaves, not to the whole window', () => {
  const screen = { clientWidth: 1280, clientHeight: 720 };
  const body = { offsetWidth: 900, offsetHeight: 600, style: {} };
  fitEndCard(screen, body);
  // 1280 - 2 x 28 across, 720 - 64 - 84 down: 1224 x 572, and the tight axis is the height.
  assert.equal(body.style.transform, 'scale(0.953)');
});

test('a card that already fits is left with no transform at all', () => {
  const screen = { clientWidth: 1280, clientHeight: 720 };
  const body = { offsetWidth: 900, offsetHeight: 500, style: {} };
  fitEndCard(screen, body);
  assert.equal(body.style.transform, '', 'the common case costs nothing and leaves nothing to undo');
});

test('a phone card is scaled to a narrower strip as well', () => {
  const screen = { clientWidth: 390, clientHeight: 844 };
  const body = { offsetWidth: 300, offsetHeight: 800, style: {} };
  fitEndCard(screen, body);
  // Fallback reserves without a CSS engine: 334 wide by 696 tall; the height is the tight one.
  assert.equal(body.style.transform, 'scale(0.870)');
});

test('a screen with no body is a no-op, which is the harness', () => {
  assert.doesNotThrow(() => fitEndCard(null, null));
  assert.doesNotThrow(() => fitEndCard({ clientWidth: 800, clientHeight: 600 }, null));
});
