// Can every line of type in this game be read where it is painted? The interface, held.
//
// `tools/contrast.js` is the ruler and the tables, `tools/contrast-check.js` prints them for a human
// to argue with, and this file is what makes a red face appear when interface type goes dim. The long
// argument about why type gets the WCAG ratio and the arena gets an Oklab step, and about what the
// audit leaves out on purpose (a pulsing line, a glow, a page that has been put to bed), is at the top
// of the tool and is not repeated here.
//
// What this file owns is four promises:
//
// 1. **Nothing escapes the audit.** Every `color:` declaration in the page's own stylesheet is
//    measured, and every glass line is pinned to the function that paints it, so a new line of
//    interface type is measured the day it is written rather than never.
// 2. **Every line clears its bar**, and a line only gets the looser bar if it is really big.
// 3. **The quiet rungs are quiet in colour and not in darkness.** The game dims a thing on purpose - a
//    codex row it has not met, an award not yet won, a ship the purse has not bought, the slider nobody
//    has moved - and the dimming is paid for with grey, and with no glow, while the line stays above
//    its bar and clearly below the rung it sits under. A "fix" that lifted everything into one bright
//    flat wash would pass promise 2 and fail this one.
// 4. **The glass table measures what the renderer paints.** A remembered colour is how the banish tab
//    spent a hundred sessions being audited in a colour it was not drawn in, so the table is pinned to
//    the drawing twice: once by reading the source, once by painting a real panel and reading the ink
//    back off the canvas.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { PALETTE, parseColor } from '../src/core/palette.js';
import { oklch, over, luminance } from '../tools/colour-lab.js';
import {
  BARS, LARGE_PX, THIN_MARGIN, audit, pageColourRules, fieldsOf, readStyleSheet, brightestField,
  colourValue, contrastRatio, stepOf, glassFields, plateOf, hexOf,
} from '../tools/contrast.js';
import { bootGame } from '../tools/headless/harness.js';
import { showVolumePanel, panelLayout } from '../src/render/volume.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const result = audit();
const page = result.page;

/** A measured row, found by what it is called. Throws, because a renamed row is a bug in this file. */
function row(where) {
  const found = result.all.find((r) => r.where === where);
  assert.ok(found !== undefined, 'nothing called "' + where + '" is measured');
  return found;
}

/** How coloured a colour is - the other half of "quiet", once brightness is off the table. */
const chromaOf = (rgb) => oklch(rgb).C;

/** Every failure, in the words the report prints, so a red test says what a red report would say. */
function failing(list) {
  return list.map((r) => r.where + ' is ' + r.ratio.toFixed(2) + ' on ' + r.field.field
    + ' and needs ' + r.bar);
}

/** The body of one function out of `src/`, so a table can be pinned to it. */
function sourceOf(file, name) {
  const source = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');
  const start = source.indexOf('function ' + name);
  assert.ok(start >= 0, 'there is no ' + name + ' in ' + file);
  const end = source.indexOf('\n}', start);
  assert.ok(end > start, name + ' does not end where this test knows how to look');
  return source.slice(start, end);
}

// ---------------------------------------------------------------------------
// The ruler
// ---------------------------------------------------------------------------

test('the ruler is the published one, and knows its own ends', () => {
  // (L1 + 0.05) / (L2 + 0.05) with WCAG 2.1's relative luminance: white on the black of the sky is
  // the top of it (21 to 1) and a colour on itself is the bottom (1), and it cannot go under 1 or
  // depend on which of the two you call the text. A ratio that changes when you swap the ink and the
  // field is not a measurement of anything. The ruler takes three channels, the way every colour here
  // is carried, so a test that hands it a hex string is told so.
  assert.ok(Math.abs(contrastRatio(parseColor('#ffffff'), parseColor('#000000')) - 21) < 0.01);
  assert.equal(contrastRatio(parseColor('#6f9dc0'), parseColor('#6f9dc0')), 1);
  const ink = contrastRatio(parseColor('#dff6ff'), parseColor('#07112b'));
  assert.equal(ink, contrastRatio(parseColor('#07112b'), parseColor('#dff6ff')),
    'the ratio does not care which is the field');
  assert.ok(ink > 1);
  assert.throws(() => luminance('#dff6ff'), 'a hex string is not a colour to this ruler');
  // ...and the same difference in the palette's units: nothing apart is no steps, more apart is more.
  assert.equal(stepOf(parseColor('#07112b'), parseColor('#07112b')), 0);
  assert.ok(stepOf(parseColor('#dff6ff'), parseColor('#07112b'))
    > stepOf(parseColor('#6f9dc0'), parseColor('#07112b')));
});

test('a translucent colour is measured after it lands, not as it is spelled', () => {
  // An `rgba` is not a colour until it has been put on something, and half the interface is an rgba.
  // Every dimmed line is composited onto its own field before it is measured, which is the difference
  // between measuring the source and measuring what an eye is given.
  const ink = parseColor(PALETTE.uiDim);
  const plateSpec = colourValue(PALETTE.plateDeep);
  const plate = over(plateSpec.rgb, plateSpec.alpha, parseColor(PALETTE.bgTop));
  const quiet = over(ink, 0.5, plate);
  assert.ok(contrastRatio(quiet, plate) < contrastRatio(ink, plate), 'half an ink is dimmer than the ink');
  assert.ok(contrastRatio(quiet, plate) > 1, 'and still not the plate itself');
  assert.deepEqual(colourValue('rgba(9, 20, 44, 0.92)').rgb, colourValue('rgb(9,20,44)').rgb,
    'the page spells a colour both ways and the audit reads both');
  assert.equal(colourValue('#dff6ff').alpha, 1, 'a hex has no alpha, and that means one');
});

// ---------------------------------------------------------------------------
// Nothing escapes
// ---------------------------------------------------------------------------

test("every colour the page's stylesheet sets is a line in the audit", () => {
  // The audit reads `index.html` instead of remembering it, which only helps if it reads all of it.
  // `pageColourRules` is the same parse with the audited rows taken back out; the counts matching is
  // what stops a new selector being filtered into silence.
  const rules = pageColourRules();
  assert.ok(rules.length >= 50, 'the page has only ' + rules.length + ' colour rules to audit');
  assert.equal(page.length, rules.length,
    'the audit measured ' + page.length + ' of ' + rules.length + ' colour rules');
  // And the exclusions it claims are the exclusions it makes: `:root`'s palette and the page that has
  // been put to bed behind a panel (session 111) are the only places a `color:` may hide.
  for (const r of page) {
    assert.ok(r.where !== ':root' && !/\.screen\.aside/.test(r.where),
      r.where + ' is one of the two places a colour may hide, and it is being measured anyway');
    assert.ok(r.size > 0, r.where + ' has no size to be judged at');
    assert.equal(r.field.rgb.length, 3, r.where + ' was measured on no field');
  }
  // The two exclusions are currently empty of colours: `:root` holds the page's custom properties and
  // the put-to-bed page is exempt with an opacity and no colour of its own (session 111 - a page a
  // panel has gone up over is at a tenth on purpose, and is not asking to be read). Nothing may hide
  // there quietly: a colour on either is reported here rather than filtered into silence.
  const skipped = readStyleSheet().filter((r) => r.css.color !== undefined
    && (r.selector === ':root' || /\.screen\.aside/.test(r.selector)));
  assert.deepEqual(skipped.map((r) => r.selector), []);
});

test('every field a line can sit on is still nearly black, which is what one field means', () => {
  // Every page line is measured against the brightest field there is, on the grounds that the four
  // veils the page owns differ by about nothing and light-on-dark type is worst on the brightest. That
  // is a simplification, and this is the test that shouts the day it stops being true: give a panel a
  // real background - a pale one, or even a much lighter navy - and the audit has to measure the lines
  // that sit on it against it, here and not in a comment.
  const fields = fieldsOf(readStyleSheet());
  assert.ok(fields.length >= 8, 'the page has fewer veils than the audit thinks: ' + fields.length);
  const bright = brightestField(fields);
  let dim = bright;
  for (const each of fields) {
    assert.ok(luminance(each.rgb) < 0.05,
      each.field + ' is a real background (' + hexOf(each.rgb) + ') and not a veil');
    if (luminance(each.rgb) < luminance(dim.rgb)) dim = each;
  }
  // ...and they are all in the same dark family: an order of magnitude apart is the most the audit will
  // pretend are one field. A panel with a background of its own is a decade away from the sky, and it
  // would be measured on it instead.
  assert.ok(luminance(bright.rgb) / luminance(dim.rgb) < 10,
    bright.field + ' and ' + dim.field + ' are not one field: ' + hexOf(bright.rgb)
      + ' against ' + hexOf(dim.rgb));
});

// ---------------------------------------------------------------------------
// The bar
// ---------------------------------------------------------------------------

test('every line of type clears its bar, on the page and on the glass', () => {
  assert.deepEqual(failing(result.failures), []);
});

test('a line gets the looser bar only if it really is a heading', () => {
  // 3 to 1 is WCAG's number for type big enough to take in at a glance, and this pins the rule that
  // earns it: the bar comes out of the line's own size and from nothing else, so there is no way for a
  // 12px caption to be handed the heading bar by a flag or a favour. (It cannot catch a *wrong size* -
  // the size a glass row is measured at is pinned where the row is painted, in the last test below.)
  assert.ok(result.all.length >= 80, 'only ' + result.all.length + ' lines are measured');
  for (const r of result.all) {
    if (r.bar === BARS.large) {
      assert.ok(r.size >= LARGE_PX,
        r.where + ' is ' + r.size + 'px and has not earned ' + BARS.large + ' to 1');
    } else {
      assert.equal(r.bar, BARS.body, r.where + ' carries a bar nobody named');
      assert.ok(r.size < LARGE_PX, r.where + ' is ' + r.size + 'px and should have the heading bar');
    }
  }
});

test('the tight lines are named, and they are the ones meant to be quiet', () => {
  // A clean run still says where the edge is - the convention `tools/palette-check.js` keeps. Every
  // line within `THIN_MARGIN` of its bar is a deliberate quiet rung, so a new one appearing (or one of
  // these being lifted into the middle of the ladder) is this test's business.
  assert.deepEqual(result.thin.map((r) => r.where).sort(), [
    '.award.unwon .says',
    '.entry.unknown .says',
    '.ship.locked .numbers',
    'the mixer, a quiet row',
    'the mixer, its key line',
  ].sort());
  for (const r of result.thin) {
    assert.ok(r.ratio >= r.bar, r.where + ' is under its bar, not merely thin');
    assert.ok(r.ratio < r.bar + THIN_MARGIN);
  }
});

// ---------------------------------------------------------------------------
// The ladder, and what "quiet" is allowed to mean
// ---------------------------------------------------------------------------

/** Each quiet rung and the rung it sits under, in one panel, where a player sees both at once. */
const RUNGS = [
  ['.entry .name', '.entry.unknown .name'],
  ['.entry .says', '.entry.unknown .says'],
  ['.award .name', '.award.unwon .name'],
  ['.award .says', '.award.unwon .says'],
  ['.ship', '.ship.locked'],
  ['.ship .numbers', '.ship.locked .numbers'],
  ['.setting', '.setting .says'],
  ['the mixer, a row just touched', 'the mixer, a quiet row'],
  ['a banish tab, pointed at', 'a banish tab, cold'],
];

test('a quiet rung is a clear step below the rung it sits under', () => {
  for (const [litName, quietName] of RUNGS) {
    const lit = row(litName);
    const quiet = row(quietName);
    assert.ok(quiet.ratio < lit.ratio, quietName + ' must stay dimmer than ' + litName);
    assert.ok(quiet.ratio >= quiet.bar, quietName + ' has fallen under its bar');
    // A step and not a hair: the game is asking the player to read the difference between "yours" and
    // "not yet", and two rungs a tenth apart say neither.
    assert.ok(lit.ratio - quiet.ratio > 0.4,
      litName + ' (' + lit.ratio.toFixed(2) + ') and ' + quietName + ' (' + quiet.ratio.toFixed(2)
        + ') are one rung, not two');
  }
});

test("a page rung that has colour to give up gives some of it up", () => {
  // The decision this pins: a line is made quiet by its *colour*, and not by being dark, because a
  // line under the bar is not a quiet line, it is an absent one. So a quiet rung carries no more
  // chroma than the rung above it - greyer, not dimmer.
  //
  // `.entry .name` is the one pair left out, and it is left out honestly: its lit rung is nearly white,
  // and white has no chroma to give up, so the codex's undiscovered name is allowed to be the grey-blue
  // of the set. Everything else here has colour in it to spend.
  const pairs = [
    ['.entry .says', '.entry.unknown .says'],
    ['.ship', '.ship.locked'],
    ['.ship .numbers', '.ship.locked .numbers'],
    ['.setting', '.setting .says'],
    ['.award .name', '.award.unwon .name'],
    ['.award .says', '.award.unwon .says'],
  ];
  for (const [litName, quietName] of pairs) {
    const lit = row(litName);
    const quiet = row(quietName);
    assert.ok(chromaOf(quiet.colour) <= chromaOf(lit.colour) + 0.005,
      quietName + ' is quieter by hue than ' + litName + ', which is how it stops being readable');
  }
});

// ---------------------------------------------------------------------------
// The glass table, pinned to the drawing
// ---------------------------------------------------------------------------

test('a plate is a palette entry and never a number in the renderer', () => {
  // The audit can only measure a field it can find by name, so every plate the interface writes type
  // on is a `core/palette.js` entry. A rgba pasted back into a draw call is a plate that stops being
  // true the day somebody tunes the one the audit reads.
  for (const name of ['plate', 'plateDeep', 'chipFace', 'cardFace', 'cardScrim']) {
    assert.ok(PALETTE[name] !== undefined, 'there is no plate called ' + name);
    const value = colourValue(PALETTE[name]);
    assert.ok(value.alpha > 0 && value.alpha < 1,
      name + ' is opaque, so the audit has no business compositing it');
    assert.equal(plateOf(name), PALETTE[name], name + ' does not round-trip through plateOf');
    const literal = 'rgba(' + value.rgb.join(',');
    const offenders = [];
    for (const file of fs.readdirSync(path.join(ROOT, 'src/render'))) {
      if (!file.endsWith('.js')) continue;
      if (fs.readFileSync(path.join(ROOT, 'src/render', file), 'utf8').indexOf(literal) >= 0) {
        offenders.push(file);
      }
    }
    assert.deepEqual(offenders, [], name + ' is spelled out in ' + offenders.join(', '));
  }
});

test('the glass table names the colours the renderer actually paints with', () => {
  // Session 112 made this argument about silhouettes; it is the same argument about type. A remembered
  // colour is worse than no colour because it reads as a measurement - the banish tab was being audited
  // in `cardEdge` while the code had long since started painting it in the card's own key colour.
  const pins = [
    ['render/volume.js', 'drawVolumePanel', ['the mixer, a row just touched', 'the mixer, a quiet row']],
    ['render/cards.js', 'drawBanishTab', ['a banish tab, pointed at', 'a banish tab, cold']],
    ['render/cards.js', 'drawSynergyPlate', ['the SYNERGY plate']],
    ['render/hud.js', 'drawBossBar', ['the boss name']],
  ];
  for (const [file, fn, rows] of pins) {
    const body = sourceOf(file, fn);
    for (const name of rows) {
      assert.ok(body.indexOf('PALETTE.' + row(name).colourName) >= 0,
        name + ' is measured as ' + row(name).colourName + ', which ' + file + ':' + fn + ' never mentions');
    }
  }
});

test('a glass line is measured at the size it is set at', () => {
  // The bar a line gets comes out of its size, so a size written wrong in the table is a bar given away.
  // Where the size comes from a font the function names, the table is pinned to that font. (The mixer's
  // two rows are pinned more strongly still, against the size painted, in the last test below.)
  const pins = [
    ['render/cards.js', 'FONT_KEY', ['a banish tab, pointed at', 'a banish tab, cold']],
    ['render/volume.js', 'FONT_KEY', ['the mixer, its key line']],
  ];
  for (const [file, fontName, rows] of pins) {
    const source = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');
    const at = source.indexOf('const ' + fontName);
    assert.ok(at >= 0, fontName + ' is not a constant in ' + file);
    const found = /(\d+(?:\.\d+)?)px/.exec(source.slice(at, at + 90));
    assert.ok(found !== null, fontName + ' has no pixel size in its first 90 characters in ' + file);
    const px = Number(found[1]);
    for (const name of rows) {
      assert.equal(row(name).size, px, name + ' is measured at ' + row(name).size
        + 'px and set at ' + px + ' in ' + file + ':' + fontName);
    }
  }
});

test('what the mixer paints is what the mixer is measured as', async () => {
  // The strongest form of the test above, and the reason the canvas stub logs the ink of every word:
  // paint the real readout, read the colour back off the canvas, and measure that. Move `ROW_QUIET` in
  // the painter and this test moves with it whether or not anybody remembers the table exists.
  const game = await bootGame({ root: ROOT, seed: 11 });
  showVolumePanel('music');            // one row touched, which leaves the other one quiet
  game.step(16.7);
  const plate = glassFields().find((f) => f.field === 'a deep plate');
  assert.ok(plate !== undefined, 'the report has no deep plate to measure on');
  assert.equal(panelLayout().fade, 1, 'measured at full strength, not on its way out');

  const words = game.texts().filter((t) => !t.stroke && (t.text === 'MUSIC' || t.text === 'SOUND'));
  assert.equal(words.length, 2, 'both rows are painted - both are always shown');
  const measured = { MUSIC: 'the mixer, a row just touched', SOUND: 'the mixer, a quiet row' };
  for (const word of words) {
    const row_ = row(measured[word.text]);
    const ink = colourValue(word.ink);
    assert.equal(word.size, row_.size,
      word.text + ' was painted at ' + word.size + 'px and measured at ' + row_.size);
    assert.equal(ink.alpha, row_.alpha,
      word.text + ' was painted at ' + ink.alpha + ' and measured at ' + row_.alpha);
    assert.deepEqual(ink.rgb, parseColor(PALETTE[row_.colourName]),
      word.text + ' was painted in ' + word.ink + ' and measured as ' + row_.colourName);
    const painted = over(ink.rgb, ink.alpha * word.alpha, plate.rgb);
    assert.ok(contrastRatio(painted, plate.rgb) >= BARS.body,
      word.text + ' reads ' + contrastRatio(painted, plate.rgb).toFixed(2) + ' to 1 on its own plate');
  }
});
