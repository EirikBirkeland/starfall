// The rack's words stay inside the rack.
//
// This is the one bug report the game has ever received, and it was true: a card description was
// wrapped to the card's width but never bounded, so a paragraph longer than the card was painted
// straight off the bottom of it and across the rank pips on the way. Two things answer it now.
// render/fit.js will not let a line of text leave the box it was given - smaller type first, an
// ellipsis only when even the floor is not enough. And the rack itself keeps to a budget
// (game/upgrades.js), because a card that has been cut to fit is a card nobody can read: the fix is
// the guarantee *and* the writing.
//
// The measurements come from the headless canvas, which answers `measureText` with something the
// size of the word and the size of the font (tools/headless/harness.js). That is an estimate of a
// real face - a little generous, on purpose, so that text which fits in here fits in a browser. The
// policy is what is under test, not the width of a capital T.
//
// The rack is painted by hand here (`drawCards`, the same entry point main.js uses) on a game sitting
// on the title screen: the card painter reads the offer and nothing else, so this sees the cards and
// no HUD noise, and can put any three lines on the table it likes.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { FRAME_MS } from '../tools/headless/bot.js';
import { askLayout, cardLayout, drawCards } from '../src/render/cards.js';
import { ellipsize, fitOneLine, fitParagraph, wrapRows } from '../src/render/fit.js';
import { LINES } from '../src/game/upgrades.js';
import { BALANCE } from '../src/game/balance.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 7 });
const world = game.world;
const ctx = game.context;
const ELLIPSIS = '\u2026';
const WIDE = [1280, 720];
const SMALLS = [[560, 400], [420, 320]];

/** A font string for the tests that measure by hand. */
const fontFor = (size) => '600 ' + size + 'px "Segoe UI", system-ui, sans-serif';

/** Paint the rack with these cards and hand back every word it put on the canvas. */
function paint(ids, W = WIDE[0], H = WIDE[1]) {
  world.offer.length = 0;
  for (const id of ids) world.offer.push(id);
  // Fully arrived: the cards slide in a tenth of a second apart and nothing here is about that.
  world.offerTime = world.time - 1;
  game.setViewport(W, H);
  game.step(FRAME_MS);                  // a frame: it clears the word log, and shows no cards
  const before = game.texts().length;   // whatever the title screen painted, which is not the point
  drawCards(ctx, null);                 // and then the rack, and nothing else
  // A haloed word is stroked and then filled, so it is in the log twice; a word is one word.
  return game.texts().slice(before).filter((word) => !word.stroke);
}

/** Where a drawn word actually is, given the alignment it was drawn with. */
function box(word) {
  const left = word.align === 'left' ? word.x
    : word.align === 'right' ? word.x - word.w : word.x - word.w / 2;
  return { left: left, right: left + word.w, y: word.y, text: word.text };
}

/**
 * The words the *screen* paints - the heading above the cards and the two asks and the cut-out line
 * under them. Everything else on this screen belongs to a card, and that is what makes the check
 * below possible: a word that belongs to a card and is not inside one has walked out of it.
 */
function belongsToTheScreen(word) {
  return /^LEVEL \d+$/.test(word) || word.startsWith('CHOOSE ONE')
    || word.includes('REROLL') || word.includes('BANISH') || word.startsWith('CUT OUT OF THE RUN');
}

/**
 * What is wrong with this word, if anything.
 *
 * Which card a word belongs to is asked of its own middle: a word that has walked out of the side of
 * a card still has its middle in the card it started in. A word with no card under it at all has
 * walked out of the rack and into the gutter, and that is a failure too.
 */
function complaint(word, rects) {
  const at = box(word);
  if (belongsToTheScreen(at.text)) return null;
  const centre = (at.left + at.right) / 2;
  const home = rects.find((rect) => centre >= rect.x && centre <= rect.x + rect.w);
  if (home === undefined) return '"' + at.text + '" is painted outside the rack altogether';
  if (at.y < home.y - 1) return '"' + at.text + '" starts ' + (home.y - at.y).toFixed(1) + ' px above its card';
  if (at.y > home.y + home.h) {
    return '"' + at.text + '" runs ' + (at.y - home.y - home.h).toFixed(1) + ' px below its card';
  }
  if (at.left < home.x - 1) {
    return '"' + at.text + '" starts ' + (home.x - at.left).toFixed(1) + ' px left of its card';
  }
  if (at.right > home.x + home.w + 1) {
    return '"' + at.text + '" runs ' + (at.right - home.x - home.w).toFixed(1) + ' px past its edge';
  }
  return null;
}

/** Every way the rack can be dealt, a table at a time, in table order. */
function tables() {
  const out = [];
  for (let i = 0; i < LINES.length; i += BALANCE.cards.offer) {
    out.push(LINES.slice(i, i + BALANCE.cards.offer).map((line) => line.id));
  }
  return out;
}

/** Every word of a freshly painted rack, and what is wrong with each of them. */
function checked(ids, W, H) {
  const words = paint(ids, W, H);
  const rects = cardLayout(ids.length, W, H).cards;
  return words.map((word) => complaint(word, rects)).filter((why) => why !== null);
}

// --- the fitter itself, measured with a font the test names ---

test('a paragraph is wrapped at spaces, and no row is wider than the box', () => {
  const text = 'an honest sentence about shots and bodies and the room they run out of';
  ctx.font = fontFor(10);
  const rows = wrapRows(ctx, text, 100);
  assert.ok(rows.length > 2, 'it is a paragraph, not one long row');
  for (const row of rows) {
    assert.ok(ctx.measureText(row).width <= 100, 'row too wide: ' + row);
  }
  assert.equal(rows.join(' '), text, 'and nothing was dropped on the way');
});

test('one word longer than the box gets a row to itself instead of being broken', () => {
  ctx.font = fontFor(10);
  const rows = wrapRows(ctx, 'incomprehensiblylong word', 40);
  assert.equal(rows.length, 2);
  assert.equal(rows[0], 'incomprehensiblylong');
  assert.equal(rows[1], 'word');
});

test('an ellipsis is paid for: what comes back is inside the box it was given', () => {
  ctx.font = fontFor(10);
  const cut = ellipsize(ctx, 'a description far too long for the card it was written for', 60);
  assert.ok(cut.endsWith(ELLIPSIS), 'the words that came off are admitted to: ' + cut);
  assert.ok(ctx.measureText(cut).width <= 60);
  assert.equal(ellipsize(ctx, 'short', 60), 'short', 'and a word that fits comes back untouched');
});

test('a line is shrunk before it is cut, and says which one happened', () => {
  const shrunk = fitOneLine(ctx, 'A COLD CORPSE GOES UP',
    { widest: 200, size: 20, minSize: 12, fontFor: fontFor });
  assert.equal(shrunk.cut, false);
  assert.ok(shrunk.size < 20, 'smaller type: ' + shrunk.size);
  assert.ok(shrunk.size >= 12, 'but never below the floor the caller named');
  assert.equal(shrunk.text, 'A COLD CORPSE GOES UP', 'every word still there');

  const stubborn = fitOneLine(ctx, 'A COLD CORPSE THAT WILL NOT FIT AT ANY SIZE',
    { widest: 100, size: 20, minSize: 19, fontFor: fontFor });
  assert.equal(stubborn.cut, true, 'and when even the floor will not do, it is cut honestly');
  assert.ok(stubborn.text.endsWith(ELLIPSIS));
});

test('a paragraph that will not fit its rows is cut on the last one and says so', () => {
  const text = 'word '.repeat(24).trim();
  const out = fitParagraph(ctx, text, {
    widest: 100, size: 10, minSize: 10, maxRows: 2, fontFor: fontFor,
  });
  assert.equal(out.rows.length, 2, 'it got exactly the room it was given');
  assert.equal(out.cut, true);
  assert.ok(out.rows[1].endsWith(ELLIPSIS), 'the cut is on the row that ran out: ' + out.rows[1]);
  ctx.font = fontFor(10);
  for (const row of out.rows) assert.ok(ctx.measureText(row).width <= 100);
});

test('the shrink ladder has a bottom, so a tiny card cannot ask for tiny type forever', () => {
  const out = fitOneLine(ctx, 'A DESCRIPTION THAT GOES ON FOR VERY MANY WORDS INDEED',
    { widest: 60, size: 24, minSize: 20, fontFor: fontFor });
  assert.equal(out.size, 20, 'it stops at the floor and cuts instead');
  assert.equal(out.cut, true);
});

// --- and the rack itself, painted by the code that paints it ---

test('every card on the rack keeps every word inside itself', () => {
  for (const table of tables()) {
    assert.deepEqual(checked(table, WIDE[0], WIDE[1]), [], table.join(', '));
  }
});

test('and none of it had to be cut to do that: the rack is written to fit', () => {
  for (const table of tables()) {
    const cut = paint(table).map((word) => word.text).filter((text) => text.endsWith(ELLIPSIS));
    assert.deepEqual(cut, [], table.join(', ') + ' had to be cut short: ' + cut.join(' | '));
  }
});

test('a small window shrinks the type instead of overflowing the card', () => {
  for (const [W, H] of SMALLS) {
    for (const table of tables()) {
      assert.deepEqual(checked(table, W, H), [], W + 'x' + H + ' ' + table.join(', '));
    }
  }
});

test('the cut-out line stays between the chips it sits under', () => {
  world.banished.length = 0;
  for (const id of ['turret', 'magnetar', 'afterimage', 'overcharge']) world.banished.push(id);
  const words = paint(tables()[0]);
  world.banished.length = 0;
  const row = askLayout(WIDE[0], WIDE[1]);
  const span = { left: row.reroll.x, right: row.banish.x + row.banish.w };
  const line = words.filter((word) => word.text.startsWith('CUT OUT OF THE RUN'));
  assert.equal(line.length, 1, 'and it is painted at all');
  const at = box(line[0]);
  assert.ok(at.left >= span.left - 1 && at.right <= span.right + 1,
    '"' + at.text + '" is ' + Math.round(at.left) + '..' + Math.round(at.right)
      + ' against the chips at ' + Math.round(span.left) + '..' + Math.round(span.right));
});

test('a name is printed whole: the longest one on the rack still fits', () => {
  const longest = LINES.reduce((a, b) => (b.name.length > a.name.length ? b : a));
  const words = paint([longest.id, 'damage', 'nova']);
  const named = words.filter((word) => word.text === longest.name);
  assert.equal(named.length, 1, longest.name + ' was not painted at all');
  assert.deepEqual(checked([longest.id, 'damage', 'nova'], WIDE[0], WIDE[1]), [],
    longest.name + ' does not fit its card');
});