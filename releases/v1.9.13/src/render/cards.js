// The upgrade choice, painted (game/upgrades.js deals the cards; this is the part you
// read). The panels the rack deals, the icon each one sells, the two asks a run may make about its own
// deal - reroll and banish - and the geometry that turns a click into an answer.
//
// The layout is asked for by three places that must never disagree: the frame that draws
// the cards, main.js, which has to know what a click landed on, and the tests, which have
// to click it too. So the rectangles are worked out here, once per window size, and
// nowhere else.
//
// Everything here is cool-coloured on purpose. A card is the best news a run gives
// out, and PLAN section 4 spends warm colours on things that are about to hurt you.

import { PALETTE, withAlpha } from '../core/palette.js';
import { clamp } from '../core/math.js';
import { world } from '../game/world.js';
import { banishedLines, effectOf, isSynergy, lineOf, maxRanksOf, needsOf, rankOf } from '../game/upgrades.js';
import { polygon, roundRect } from './shapes.js';
import { drawIcon, tintOf } from './icons.js';
import { glowFor, paintGlow } from './glow.js';
import { haloText } from './hud.js';
import { fitOneLine, fitParagraph, shrinkToFit, widthOf } from './fit.js';
import { thumbUsed } from '../input/touch.js';
import { view } from './canvas.js';

const GAP = 26;             // px of air between two cards
const SIDE_MARGIN = 20;     // at least this much window left at either side
const MAX_CARD_W = 236;     // a card is not going to get any wider than this
const CARD_RATIO = 1.36;    // height / width
const MAX_HEIGHT = 0.7;     // of the window, so a short window gets short cards
const HEADROOM = 92;        // px of window above the cards, for the heading
const RISE = 0.2;           // how long one card takes to slide in (PLAN: under 250 ms)
const STAGGER = 0.08;       // and how much later the next one starts
const PUSH = 26;            // how far below its place it starts
const ASK_GAP = 16;         // px of window between the cards and the row of asks
const ASK_H = 26;           // how tall one ask chip is
const ASK_CHIP_W = 112;     // fixed width chips, because the layout has no canvas to
const ASK_GAP_X = 14;       // measure text with, and a click must be measured by the
                            // same numbers that drew the target
const TAB_W = 34;           // the banish tab in a card's top-right corner
const TAB_H = 24;
const SYNERGY_INSET = 5;    // px between a synergy's two edges: fire outside, frost inside
const SYNERGY_WORD = 'SYNERGY';
const SYNERGY_PLATE_PAD = 9;
const NEEDS_PLUS = '  +  ';
const ASK_ROOM = ASK_GAP + ASK_H;   // the window the row of asks under the cards needs


// How a card is filled in. A card is whatever size the window makes it, so every part of it is a
// share of the card and not a pixel count: the icon, then the three lines of text, then the rank
// pips (or, for a synergy, the two lines it came out of) along the bottom.
//
// The flavour gets *the room that is left* rather than a fixed number of rows, and render/fit.js
// decides what it can say in it: smaller type first, an ellipsis only when even the floor is not
// enough. That is the answer to the one bug report the game has ever received - a card whose
// description ran off the bottom of itself - and it is answered in two halves, this layout and a
// rack of descriptions short enough to be read (game/upgrades.js).
const ICON_AT = 0.21;          // the icon's centre, and its size, as shares of the card
const ICON_SIZE = 0.30;
const NAME_AT = 0.50;          // baselines, all of them, as shares of the card's height
const NAME_SIZE = 0.11;        // and type sizes, as shares of the card's width
const NAME_FLOOR = 0.078;
const EFFECT_AT = 0.58;
const EFFECT_SIZE = 0.082;
const EFFECT_FLOOR = 0.056;
const FLAVOUR_AT = 0.655;
const FLAVOUR_SIZE = 0.06;
const FLAVOUR_FLOOR = 0.045;
const FLAVOUR_LEAD = 1.3;      // row pitch, as a multiple of the size it is set in
const MARKS_AT = 0.92;         // the rank pips, or a synergy's two parents
const MARKS_ROOM = 0.03;       // of the card, between the last flavour row and the pips
const TEXT_W = 0.86;           // of the card's width is the measure a line of text may use
const MARKS_SIZE = 0.064;      // a synergy's `BURN 3 + CHILL 3`, and its floor
const MARKS_FLOOR = 0.04;

const FONT_HEADING = '800 34px "Segoe UI", system-ui, sans-serif';
const FONT_ASK = '600 12px "Segoe UI", system-ui, sans-serif';
const FONT_KEY = '800 13px "Segoe UI", system-ui, sans-serif';
const GLOW_KEY = 'rgba(94,247,255,0.75)';
const HALO_GLOW = 96;      // the one glow sprite the panels shine with, stamped bigger

/**
 * A font string. Built per draw rather than per frame-by-frame constant, because the
 * cards are sized by the window and there are only ever a few of them.
 *
 * It rounds *down*, and that is the contract render/fit.js measures against: a card is fitted at a
 * size and then painted at whatever this says, so a font that came out bigger than the size it was
 * fitted at could walk off the card again with every measurement having been honest.
 */
function font(weight, size) {
  return weight + ' ' + Math.max(8, Math.floor(size)) + 'px "Segoe UI", system-ui, sans-serif';
}

/** A text size this card may use: nothing on a card is set in type below eight pixels. */
const px = (size) => Math.max(8, size);

/** The ease the cards slide in on: fast, then settling, never a bounce. */
function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}

let cached = null;

/** The card rectangles for `count` cards in a W x H window. Cached per size. */
export function cardLayout(count, W, H) {
  const key = count + ':' + W + ':' + H;
  if (cached !== null && cached.key === key) return cached;

  const w = Math.min(MAX_CARD_W, (W - SIDE_MARGIN * 2 - GAP * (count - 1)) / count);
  // The asks under the cards are part of the same screen, so they are asked for out of the
  // same window: a short window shrinks the cards instead of running the row over them.
  const h = Math.max(60, Math.min(w * CARD_RATIO, (H - HEADROOM - ASK_ROOM) * MAX_HEIGHT));
  const span = w * count + GAP * (count - 1);
  const x0 = (W - span) / 2;
  const y0 = (H - h) / 2 + HEADROOM * 0.5;

  const cards = [];
  for (let i = 0; i < count; i++) {
    cards.push({ x: x0 + i * (w + GAP), y: y0, w: w, h: h });
  }
  cached = { key: key, cards: cards, w: w, h: h };
  return cached;
}

function cardUnder(cards, x, y) {
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return i;
  }
  return -1;
}

const inside = (rect, x, y) =>
  !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

/** Which of these tabs the glass is over, counting the holes: a null is a card with no tab. */
function tabUnder(tabs, x, y) {
  for (let i = 0; i < tabs.length; i++) {
    if (inside(tabs[i], x, y)) return i;
  }
  return -1;
}

/**
 * The banish tab: the number-key chip's twin, in the mirror corner of the card, reading
 * `Shift + that same number`. Taking a card and refusing it for good are one key apart, so
 * they are one chip apart - and a click anywhere else on the card is still a take, which is
 * what makes this small mark safe to put where a player is aiming.
 */
function tabRect(rect) {
  return {
    x: rect.x + rect.w * 0.87 - TAB_W / 2,
    y: rect.y + rect.h * 0.1 - TAB_H / 2,
    w: TAB_W,
    h: TAB_H,
  };
}

/**
 * Whether this card has a banish tab at all. A synergy never does: a synergy is not a line the run
 * has no use for, it is what the lines it chose have become, and game/upgrades.js refuses the ask
 * as well - so the key and the mouse answer the same way here as they do in the rule.
 *
 * Whether the run can still *pay* for a tab is a different question and stays with the click and
 * the drawing, which is how it always was: a spent ask leaves the geometry on the screen.
 */
function tabbable(id) {
  return !isSynergy(id);
}

/** The tab's rectangle, or nothing at all for a card that has none. */
function tabOf(id, rect) {
  return tabbable(id) ? tabRect(rect) : null;
}

/**
 * The row of asks under the cards: reroll the whole table, or banish one of these lines
 * out of the run. They are drawn whether or not the run can still pay for them - a spent
 * ask is still a fact about the choice, and a chip that vanished would leave a player
 * wondering where it went - but only a paid-for one is a click target, and `choiceHit` is
 * what says so.
 */
function askRow(W, H, layout) {
  const first = layout.cards[0];
  if (first === undefined) return { reroll: null, banish: null };
  const span = ASK_CHIP_W * 2 + ASK_GAP_X;
  const x0 = (W - span) / 2;
  const y = Math.min(first.y + layout.h + ASK_GAP, H - ASK_H - 6);
  return {
    reroll: { x: x0, y: y, w: ASK_CHIP_W, h: ASK_H },
    banish: { x: x0 + ASK_CHIP_W + ASK_GAP_X, y: y, w: ASK_CHIP_W, h: ASK_H },
  };
}

/**
 * Where the two asks are, in a W x H window. Exported for the same reason `cardLayout` is:
 * a test that wants to click a chip has to be able to say where one is, and the only honest
 * way to say that is to ask the code that draws it.
 */
export function askLayout(W, H) {
  return askRow(W, H, cardLayout(world.offer.length, W, H));
}

/** Where each card's banish tab is, in the same window, one per card on the table - and null for a
 *  card with no tab, which is what a test clicking one has to be told. */
export function banishLayout(W, H) {
  const layout = cardLayout(world.offer.length, W, H);
  return layout.cards.map((rect, i) => tabOf(world.offer[i], rect));
}

/**
 * Where a glass point lands on the choice, and what clicking there would do: banish a
 * line, take a card, reroll the table, or nothing at all. The order here is the precedence
 * - a tab is inside its card, so it is asked about first, and only while it is there to be
 * asked about (a run with no banish left has no tabs, and its cards have one answer).
 */
export function choiceHit(x, y) {
  const layout = cardLayout(world.offer.length, view.W, view.H);

  if (world.banishesLeft > 0) {
    const at = tabUnder(layout.cards.map((rect, i) => tabOf(world.offer[i], rect)), x, y);
    if (at >= 0) return { banish: at };
  }
  const card = cardUnder(layout.cards, x, y);
  if (card >= 0) return { card: card };
  if (inside(askRow(view.W, view.H, layout).reroll, x, y) && world.rerollsLeft > 0) {
    return { reroll: true };
  }
  return null;
}

/**
 * Which of the cards on the table this glass point is over, or -1. main.js asks this
 * when the fire button goes down, which is how a mouse picks a card.
 */
export function cardAt(x, y) {
  return cardUnder(cardLayout(world.offer.length, view.W, view.H).cards, x, y);
}

export function drawCards(ctx, pointer) {
  const offer = world.offer;
  if (offer.length === 0) return;

  const W = view.W;
  const H = view.H;
  const layout = cardLayout(offer.length, W, H);
  const age = world.time - world.offerTime;
  const pointing = pointer !== null && pointer !== undefined;
  const hover = pointing ? cardUnder(layout.cards, pointer.x, pointer.y) : -1;
  // Only the tab under the pointer lights up, which is how a player learns what the mark is
  // before they have spent anything finding out.
  const tabs = world.banishesLeft > 0
    ? layout.cards.map((rect, i) => tabOf(offer[i], rect))
    : layout.cards.map(() => null);
  const tabHot = pointing && world.banishesLeft > 0 ? tabUnder(tabs, pointer.x, pointer.y) : -1;

  ctx.save();
  // The arena goes quiet behind the choice rather than going black: the crowd you are
  // about to be handed back to is still worth seeing.
  ctx.fillStyle = PALETTE.cardScrim;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  drawHeading(ctx, W, layout, age);
  for (let i = 0; i < offer.length; i++) {
    drawCard(ctx, offer[i], layout.cards[i], i, age, hover === i, tabs[i], tabHot === i);
  }
  drawAsks(ctx, askRow(W, H, layout), age);
  drawCutOut(ctx, askRow(W, H, layout));
  ctx.restore();
}

/**
 * The keys that answer the deal, spelled out: one per card face up.
 *
 * Counted off the table and never written down, because the deal does not always have three places:
 * a rule can thin the rack (game/challenges.js ONE CARD) and an almost-finished deck deals what is
 * left of it. Either way a line that named a key with no card behind it would be the one lie on this
 * screen, and the digits are the one part of it that has to keep up.
 */
export function pickKeyWords(count) {
  const keys = [];
  for (let i = 1; i <= count; i++) keys.push(String(i));
  return keys.join(' ');
}

function drawHeading(ctx, W, layout, age) {
  const appear = easeOut(clamp(age / RISE, 0, 1));
  const top = layout.cards.length > 0 ? layout.cards[0].y : 0;
  ctx.globalAlpha = appear;

  ctx.font = FONT_HEADING;
  haloText(ctx, 'LEVEL ' + world.player.level, W / 2, top - 46, PALETTE.uiText, GLOW_KEY);

  ctx.font = FONT_ASK;
  // The keys are worth the same to a thumb run and the cards answer a tap the same way they answer a
  // click (main.js `onPickCard`), so the only thing that changes is the word - and a line that named a
  // mouse to a hand that owns no mouse would be the one line on this screen not to act on.
  haloText(ctx, 'CHOOSE ONE   \u00b7   ' + pickKeyWords(world.offer.length) + ' OR '
    + (thumbUsed() ? 'TAP' : 'CLICK'), W / 2, top - 24, PALETTE.uiDim, GLOW_KEY);
  ctx.globalAlpha = 1;
}

function drawCard(ctx, id, rect, index, age, hovered, tab, tabHot) {
  const appear = easeOut(clamp((age - index * STAGGER) / RISE, 0, 1));
  if (appear <= 0) return;

  const line = lineOf(id);
  const synergy = isSynergy(id);
  const tint = tintOf(line.icon);
  const w = rect.w;
  const h = rect.h;
  const x = rect.x;
  const y = rect.y + (1 - appear) * PUSH;
  const cx = x + w / 2;

  ctx.save();
  ctx.globalAlpha = ctx.globalAlpha * appear;

  if (hovered) {
    paintGlow(ctx, glowFor(PALETTE.player, HALO_GLOW), cx, y + h / 2, 0.16, (w / HALO_GLOW) * 1.5);
  }

  ctx.fillStyle = PALETTE.cardFace;
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();

  // The edge, twice: once wide and faint for the halo, once crisp. The one being
  // pointed at is the brighter of the two, which is the whole hover story. A synergy
  // wears its two parents instead (see `drawSynergyEdges`).
  if (synergy) {
    drawSynergyEdges(ctx, x, y, w, h, hovered);
  } else {
    const edge = hovered ? PALETTE.playerLine : PALETTE.cardEdge;
    roundRect(ctx, x, y, w, h, 14);
    ctx.lineWidth = hovered ? 6 : 4;
    ctx.strokeStyle = withAlpha(edge, hovered ? 0.3 : 0.16);
    ctx.stroke();
    roundRect(ctx, x, y, w, h, 14);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = withAlpha(edge, hovered ? 1 : 0.72);
    ctx.stroke();
  }

  drawIcon(ctx, line.icon, cx, y + h * ICON_AT, w * ICON_SIZE, tint);

  // The three lines, each one fitted to the card it is being drawn on: smaller type before cut
  // words, and never either one silently. The card's size is the window's business, so this is
  // asked again every frame and costs three measurements of a dozen characters.
  const widest = w * TEXT_W;
  const name = fitOneLine(ctx, line.name, {
    widest: widest, size: px(w * NAME_SIZE), minSize: px(w * NAME_FLOOR),
    fontFor: (size) => font(800, size),
  });
  ctx.font = font(800, name.size);
  haloText(ctx, name.text, cx, y + h * NAME_AT, PALETTE.uiText, GLOW_KEY);

  const effect = fitOneLine(ctx, effectOf(id), {
    widest: widest, size: px(w * EFFECT_SIZE), minSize: px(w * EFFECT_FLOOR),
    fontFor: (size) => font(700, size),
  });
  ctx.font = font(700, effect.size);
  haloText(ctx, effect.text, cx, y + h * EFFECT_AT, PALETTE.xpText, 'rgba(88,255,161,0.8)');

  drawFlavour(ctx, line.flavour, cx, y + h * FLAVOUR_AT, widest, h, w);
  // Where a line shows how deep it goes, a synergy shows what it came out of: it has one rank and
  // no depth to draw, but the two lines that earned it are the whole story of the card.
  if (synergy) drawNeeds(ctx, id, cx, y + h * MARKS_AT, widest, w);
  else drawRanks(ctx, id, cx, y + h * MARKS_AT, w, tint);
  drawKeyHint(ctx, index + 1, x + w * 0.13, y + h * 0.1);
  if (tab !== null) drawBanishTab(ctx, tab, index + 1, tabHot);
  else if (synergy) drawSynergyPlate(ctx, tabRect(rect), rect);
  ctx.restore();
}

/**
 * A synergy's frame: its two parents, held apart. The flame is the outside edge - the wide faint
 * pass and the crisp one over it, exactly the two passes every other card makes, so the shape of a
 * card on the rack does not change - and the frost is an inner line just inside it, which is what
 * says *both of them* without a word. Neither is a new colour and neither is a new sprite: this is
 * the eighteenth card on a rack that ran out of hues four cards ago, and a synergy that is made of
 * two existing lines should be wearing their colours anyway.
 */
function drawSynergyEdges(ctx, x, y, w, h, hovered) {
  const lift = hovered ? 1 : 0.78;

  roundRect(ctx, x, y, w, h, 14);
  ctx.lineWidth = hovered ? 7 : 5;
  ctx.strokeStyle = withAlpha(PALETTE.burnFlame, 0.22 * lift);
  ctx.stroke();
  roundRect(ctx, x, y, w, h, 14);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = withAlpha(PALETTE.burnFlame, lift);
  ctx.stroke();

  // The frost, inset: a line of rime just inside the fire, with the same wide pass under it so it
  // is light and not paint. 5 px is the smallest gap that reads as two separate edges at the
  // narrowest card the layout will make.
  const gap = SYNERGY_INSET;
  roundRect(ctx, x + gap, y + gap, w - gap * 2, h - gap * 2, 14 - gap);
  ctx.lineWidth = 4;
  ctx.strokeStyle = withAlpha(PALETTE.chillFrost, 0.16 * lift);
  ctx.stroke();
  roundRect(ctx, x + gap, y + gap, w - gap * 2, h - gap * 2, 14 - gap);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = withAlpha(PALETTE.chillShell, 0.9 * lift);
  ctx.stroke();
}

/**
 * The plate that says what the card is, in the corner where a line's banish tab would be - the
 * place a player is already looking at to refuse a card, which is the right place to be told that
 * this one is not like the others. It is sized to its own word because nothing clicks on it (the
 * ask chips have to be a fixed width because a click has to be measured by the number that drew
 * them; this is not clicked, so it can fit its text) - and it is pulled back inside the card, so
 * that a narrow card reads "SYNERGY" and not "SYNERG" over the edge of itself.
 */
function drawSynergyPlate(ctx, tab, card) {
  ctx.font = FONT_KEY;
  const width = ctx.measureText(SYNERGY_WORD).width + SYNERGY_PLATE_PAD * 2;
  const left = clamp(tab.x + tab.w / 2 - width / 2,
    card.x + 5, Math.max(card.x + 5, card.x + card.w - 5 - width));
  const rect = { x: left, y: tab.y, w: width, h: tab.h };
  const cx = rect.x + rect.w / 2;

  ctx.fillStyle = PALETTE.chipFace;
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = withAlpha(PALETTE.burnFlame, 0.7);
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
  ctx.stroke();

  haloText(ctx, SYNERGY_WORD, cx, rect.y + rect.h * 0.67,
    withAlpha(PALETTE.burnCore, 0.95), 'rgba(255,194,58,0.5)');
}

/**
 * The two lines a synergy came out of, in their own tints, where a line's rank pips would be. Both
 * of them are necessarily deep enough by the time this card is on the table (game/upgrades.js only
 * deals it when they are), so there is no "not yet" state to draw and the numbers are a receipt and
 * not a promise.
 *
 * Laid out as one line and measured as one line, because the words are the parents' own names and no
 * constant can know how wide they are: the size comes off the same ladder every other line on the
 * card uses, so this cannot be the one thing that walks off the edge.
 */
function drawNeeds(ctx, id, cx, y, widest, w) {
  const needs = needsOf(id);
  shrinkToFit(ctx, {
    size: px(w * MARKS_SIZE), minSize: px(w * MARKS_FLOOR), fontFor: (each) => font(700, each),
  }, () => needsWidth(ctx, needs) <= widest);
  const parts = needs.map((need) => {
    const parent = lineOf(need.line);
    return {
      text: parent.name + ' ' + need.rank,
      tint: tintOf(parent.icon),
      width: widthOf(ctx, parent.name + ' ' + need.rank),
    };
  });
  const plus = widthOf(ctx, NEEDS_PLUS);
  const total = needsWidth(ctx, needs);

  // Measured and laid out from the middle, because nothing knows how wide the words are.
  let at = cx - total / 2;
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      ctx.textAlign = 'center';
      haloText(ctx, NEEDS_PLUS, at + plus / 2, y, PALETTE.uiFaint, 'rgba(111,143,176,0.3)');
      at += plus;
    }
    ctx.textAlign = 'left';
    haloText(ctx, parts[i].text, at, y, withAlpha(parts[i].tint, 0.95), 'rgba(111,143,176,0.35)');
    at += parts[i].width;
  }
  ctx.textAlign = 'center';
}

/** How wide a synergy's `BURN 3 + CHILL 3` is, in the ctx's current font. */
function needsWidth(ctx, needs) {
  let total = widthOf(ctx, NEEDS_PLUS) * (needs.length - 1);
  for (const need of needs) total += widthOf(ctx, lineOf(need.line).name + ' ' + need.rank);
  return total;
}

/**
 * The banish tab, drawn as the key chip it is: a small plate with `Shift` and the card's own
 * number on it. It is small on purpose - the card is the offer, and this is the escape hatch
 * from it.
 */
function drawBanishTab(ctx, tab, number, hot) {
  const cx = tab.x + tab.w / 2;
  const cy = tab.y + tab.h / 2;
  const edge = hot ? PALETTE.playerLine : PALETTE.cardEdge;

  // The edge may be the card's own blue, because an edge is a line a pixel thick; the ink on it is a
  // 13px mark that has to be read across a table of cards, so cold it is the interface's secondary
  // text colour and hot it is what the card's own number key is written in. The card's blue at 0.75
  // measured 3.3 to 1 on the chip (`tools/contrast-check.js`), which is a mark and not a readable one.
  const ink = hot ? PALETTE.playerLine : withAlpha(PALETTE.uiDim, 0.85);

  // The tab is a fixed size however big the card is, so its type is fixed with it rather than left
  // as whichever font the last line of the card happened to set.
  ctx.font = FONT_KEY;
  ctx.fillStyle = hot ? withAlpha(PALETTE.player, 0.16) : PALETTE.chipFace;
  roundRect(ctx, tab.x, tab.y, tab.w, tab.h, 7);
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = withAlpha(edge, hot ? 1 : 0.5);
  roundRect(ctx, tab.x, tab.y, tab.w, tab.h, 7);
  ctx.stroke();

  haloText(ctx, '\u21e7' + number, cx, cy + 5, ink,
    hot ? GLOW_KEY : 'rgba(111,143,176,0.35)');
}

/**
 * The two asks, under the cards: reroll the table, or banish one of these lines out of the
 * run for good. A spent chip is drawn rather than hidden (see `askRow`).
 */
function drawAsks(ctx, row, age) {
  const appear = easeOut(clamp((age - STAGGER * 2) / RISE, 0, 1));
  if (appear <= 0 || row.reroll === null) return;

  ctx.save();
  ctx.globalAlpha = ctx.globalAlpha * appear;
  drawAskChip(ctx, row.reroll, 'R   REROLL \u00d7' + world.rerollsLeft, world.rerollsLeft > 0);
  drawAskChip(ctx, row.banish, '\u21e7   BANISH \u00d7' + world.banishesLeft, world.banishesLeft > 0);
  ctx.restore();
}

function drawAskChip(ctx, rect, text, live) {
  ctx.font = live ? FONT_KEY : FONT_ASK;
  ctx.fillStyle = PALETTE.cardFace;
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, ASK_H / 2);
  ctx.fill();

  ctx.lineWidth = live ? 1.5 : 1;
  ctx.strokeStyle = withAlpha(live ? PALETTE.cardEdge : PALETTE.uiFaint, live ? 0.9 : 0.4);
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, ASK_H / 2);
  ctx.stroke();

  haloText(ctx, text, rect.x + rect.w / 2, rect.y + ASK_H * 0.67,
    live ? PALETTE.playerLine : PALETTE.uiFaint,
    live ? GLOW_KEY : 'rgba(111,143,176,0.3)');
}

/** What the run has cut out of its own deck. Drawn only once there is one to show. */
function drawCutOut(ctx, row) {
  const cut = banishedLines(world);
  if (cut.length === 0 || row.reroll === null) return;

  const left = row.reroll.x;
  const span = row.banish.x + row.banish.w - left;
  const label = 'CUT OUT OF THE RUN   \u00b7   '
    + cut.map((id) => lineOf(id).name).join('   \u00b7   ');
  const fitted = fitOneLine(ctx, label, {
    widest: span, size: 12, minSize: 8, fontFor: () => FONT_ASK,
  });
  haloText(ctx, fitted.text, left + span / 2, row.reroll.y + ASK_H + 20,
    PALETTE.uiFaint, 'rgba(111,143,176,0.3)');
}

/**
 * The one plain line under the effect (PLAN section 4), wrapped to fit the card and given exactly
 * the room the card has: from where it starts down to where the rank pips stand. It is a paragraph
 * and not a line, and it is fitted by the same rule as everything else here (render/fit.js) - the
 * longest description on the rack is a paragraph somebody wrote by hand, and the card does not
 * grow to meet it.
 */
function drawFlavour(ctx, text, cx, y, widest, h, w) {
  const room = (MARKS_AT - MARKS_ROOM - FLAVOUR_AT) * h;
  const pitch = px(w * FLAVOUR_SIZE) * FLAVOUR_LEAD;
  const fitted = fitParagraph(ctx, text, {
    widest: widest,
    size: px(w * FLAVOUR_SIZE),
    minSize: px(w * FLAVOUR_FLOOR),
    maxRows: Math.max(1, Math.floor(room / pitch) + 1),
    fontFor: (size) => font(600, size),
  });

  ctx.fillStyle = PALETTE.uiFaint;
  ctx.textAlign = 'center';
  ctx.font = font(600, fitted.size);   // what it was measured at, and so what fits
  const lead = fitted.size * FLAVOUR_LEAD;
  for (let row = 0; row < fitted.rows.length; row++) {
    ctx.fillText(fitted.rows[row], cx, y + row * lead);
  }
}

/** The rank as pips: what is taken, the next one waiting, and what is left. */
function drawRanks(ctx, id, cx, y, w, tint) {
  const total = maxRanksOf(id);
  const have = rankOf(world, id);
  const step = Math.min(w * 0.11, 18);
  const left = cx - step * (total - 1) / 2;
  const pulse = 0.55 + 0.45 * Math.sin(world.time * 5);

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < total; i++) {
    const x = left + i * step;
    const taken = i < have;
    const next = i === have;
    polygon(ctx, x, y, taken || next ? 4.4 : 3.4, 4, Math.PI / 4);
    if (taken) {
      ctx.fillStyle = tint;
      ctx.fill();
    } else if (next) {
      ctx.fillStyle = withAlpha(tint, pulse * 0.6);
      ctx.fill();
      ctx.strokeStyle = tint;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else {
      ctx.strokeStyle = withAlpha(tint, 0.26);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** The number key that takes this card, in a chip in the card's corner. */
function drawKeyHint(ctx, number, x, y) {
  const size = 24;
  ctx.fillStyle = 'rgba(94,247,255,0.1)';
  roundRect(ctx, x - size / 2, y - size / 2, size, size, 7);
  ctx.fill();
  ctx.strokeStyle = withAlpha(PALETTE.player, 0.5);
  ctx.lineWidth = 1.2;
  roundRect(ctx, x - size / 2, y - size / 2, size, size, 7);
  ctx.stroke();

  ctx.font = FONT_KEY;
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.playerLine;
  ctx.fillText(String(number), x, y + size * 0.34);
}