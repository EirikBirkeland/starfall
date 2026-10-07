// The upgrade choice, painted (game/upgrades.js deals the cards; this is the part you
// read). Three panels, the icon each one sells, and the geometry that turns a click
// into a card number.
//
// The layout is asked for by two places that must never disagree: the frame that draws
// the cards, and main.js, which has to know which card a click landed on. So the
// rectangles are worked out here, once per window size, and nowhere else.
//
// Everything here is cool-coloured on purpose. A card is the best news a run gives
// out, and PLAN section 4 spends warm colours on things that are about to hurt you.

import { PALETTE, withAlpha } from '../core/palette.js';
import { clamp } from '../core/math.js';
import { world } from '../game/world.js';
import { effectOf, lineOf, maxRanksOf, rankOf } from '../game/upgrades.js';
import { polygon, roundRect } from './shapes.js';
import { glowFor, paintGlow } from './glow.js';
import { haloText } from './hud.js';
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

// The four shapes, one per line (the ids come from game/upgrades.js). Kept apart
// from the colours so a line can be drawn in whichever cool colour suits it.
const TINT = {
  damage: PALETTE.white,
  fireRate: PALETTE.player,
  bulletSpeed: PALETTE.shard,
  split: PALETTE.violet,
};

const FONT_HEADING = '800 34px "Segoe UI", system-ui, sans-serif';
const FONT_ASK = '600 12px "Segoe UI", system-ui, sans-serif';
const FONT_KEY = '800 13px "Segoe UI", system-ui, sans-serif';
const GLOW_KEY = 'rgba(94,247,255,0.75)';
const HALO_GLOW = 96;      // the one glow sprite the panels shine with, stamped bigger

/** A font string. Built per draw rather than per frame-by-frame constant, because the
 *  cards are sized by the window and there are only ever three of them. */
function font(weight, size) {
  return weight + ' ' + Math.max(8, Math.round(size)) + 'px "Segoe UI", system-ui, sans-serif';
}

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
  const h = Math.min(w * CARD_RATIO, (H - HEADROOM) * MAX_HEIGHT);
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
  const hover = pointer === null || pointer === undefined ? -1 : cardUnder(layout.cards, pointer.x, pointer.y);

  ctx.save();
  // The arena goes quiet behind the choice rather than going black: the crowd you are
  // about to be handed back to is still worth seeing.
  ctx.fillStyle = PALETTE.cardScrim;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  drawHeading(ctx, W, layout, age);
  for (let i = 0; i < offer.length; i++) {
    drawCard(ctx, offer[i], layout.cards[i], i, age, hover === i);
  }
  ctx.restore();
}

function drawHeading(ctx, W, layout, age) {
  const appear = easeOut(clamp(age / RISE, 0, 1));
  const top = layout.cards.length > 0 ? layout.cards[0].y : 0;
  ctx.globalAlpha = appear;

  ctx.font = FONT_HEADING;
  haloText(ctx, 'LEVEL ' + world.player.level, W / 2, top - 46, PALETTE.uiText, GLOW_KEY);

  ctx.font = FONT_ASK;
  haloText(ctx, 'CHOOSE ONE   \u00b7   1 2 3 OR CLICK', W / 2, top - 24, PALETTE.uiDim, GLOW_KEY);
  ctx.globalAlpha = 1;
}

function drawCard(ctx, id, rect, index, age, hovered) {
  const appear = easeOut(clamp((age - index * STAGGER) / RISE, 0, 1));
  if (appear <= 0) return;

  const line = lineOf(id);
  const tint = TINT[line.icon] || PALETTE.player;
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
  // pointed at is the brighter of the two, which is the whole hover story.
  const edge = hovered ? PALETTE.playerLine : PALETTE.cardEdge;
  roundRect(ctx, x, y, w, h, 14);
  ctx.lineWidth = hovered ? 6 : 4;
  ctx.strokeStyle = withAlpha(edge, hovered ? 0.3 : 0.16);
  ctx.stroke();
  roundRect(ctx, x, y, w, h, 14);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = withAlpha(edge, hovered ? 1 : 0.72);
  ctx.stroke();

  drawIcon(ctx, line.icon, cx, y + h * 0.26, w * 0.34, tint);

  ctx.font = font(800, w * 0.115);
  haloText(ctx, line.name, cx, y + h * 0.55, PALETTE.uiText, GLOW_KEY);

  ctx.font = font(700, w * 0.085);
  haloText(ctx, effectOf(id), cx, y + h * 0.65, PALETTE.xpText, 'rgba(88,255,161,0.8)');

  drawFlavour(ctx, line.flavour, cx, y + h * 0.755, w * 0.86, w * 0.072);
  drawRanks(ctx, id, cx, y + h * 0.88, w, tint);
  drawKeyHint(ctx, index + 1, x + w * 0.13, y + h * 0.1);

  ctx.restore();
}

/** The one plain line under the effect (PLAN section 4), wrapped to fit the card. */
function drawFlavour(ctx, text, cx, y, widest, size) {
  ctx.font = font(600, size);
  ctx.fillStyle = PALETTE.uiFaint;
  ctx.textAlign = 'center';
  const words = text.split(' ');
  let line = '';
  let row = 0;
  for (const word of words) {
    const trial = line === '' ? word : line + ' ' + word;
    if (line !== '' && ctx.measureText(trial).width > widest) {
      ctx.fillText(line, cx, y + row * (size + 4));
      line = word;
      row++;
    } else {
      line = trial;
    }
  }
  if (line !== '') ctx.fillText(line, cx, y + row * (size + 4));
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

/**
 * The shapes, all pointing up, all cool: an impact for damage, a stack for the gun's
 * cycle, a shot with its own wake for velocity, three of them for split shot. Small,
 * drawn from paths, and legible at a card's worth of pixels. Each line names one of
 * these in game/upgrades.js, and an icon with no shape is a bug that says so rather
 * than drawing the wrong thing.
 */
const ICONS = {
  damage: iconDamage,
  fireRate: iconFireRate,
  bulletSpeed: iconBulletSpeed,
  split: iconSplit,
};

function drawIcon(ctx, kind, cx, cy, size, tint) {
  const shape = ICONS[kind];
  if (shape === undefined) throw new Error('no card icon is called ' + kind);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalCompositeOperation = 'lighter';
  paintGlow(ctx, glowFor(tint, Math.round(size * 0.9)), 0, 0, 0.5, 1);
  ctx.globalCompositeOperation = 'source-over';
  shape(ctx, size, tint);
  ctx.restore();
}

/** A hit: a solid diamond with what came off it flying off in four directions. */
function iconDamage(ctx, size, tint) {
  polygon(ctx, 0, 0, size * 0.42, 4, Math.PI / 4);
  ctx.fillStyle = withAlpha(tint, 0.9);
  ctx.fill();
  ctx.strokeStyle = withAlpha(tint, 0.85);
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * (Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * size * 0.52, Math.sin(a) * size * 0.52);
    ctx.lineTo(Math.cos(a) * size * 0.86, Math.sin(a) * size * 0.86);
    ctx.stroke();
  }
}

/** Three of the same shot, close together, the newest one the brightest. */
function iconFireRate(ctx, size, tint) {
  for (let i = 0; i < 3; i++) {
    const dy = (i - 1) * size * 0.36;
    ctx.beginPath();
    ctx.moveTo(0, dy - size * 0.24);
    ctx.lineTo(size * 0.34, dy + size * 0.16);
    ctx.lineTo(-size * 0.34, dy + size * 0.16);
    ctx.closePath();
    ctx.fillStyle = withAlpha(tint, 0.34 + i * 0.3);
    ctx.fill();
  }
}

/** One shot, going fast enough to be leaving a wake behind it. */
function iconBulletSpeed(ctx, size, tint) {
  polygon(ctx, 0, -size * 0.1, size * 0.46, 3, -Math.PI / 2);
  ctx.fillStyle = withAlpha(tint, 0.9);
  ctx.fill();
  ctx.strokeStyle = withAlpha(tint, 0.6);
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const dy = size * (0.34 + i * 0.2);
    const half = size * (0.4 - i * 0.1);
    ctx.beginPath();
    ctx.moveTo(-half, dy);
    ctx.lineTo(half, dy);
    ctx.stroke();
  }
}

/**
 * One muzzle and three shots leaving it: the fan a split pull makes. The middle one is
 * the brightest, because that one is the shot the player aimed and the heaviest thing
 * the gun fires.
 */
function iconSplit(ctx, size, tint) {
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(0, size * 0.44);
    ctx.rotate((i - 1) * 0.46);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.88);
    ctx.lineTo(size * 0.16, -size * 0.4);
    ctx.lineTo(-size * 0.16, -size * 0.4);
    ctx.closePath();
    ctx.fillStyle = withAlpha(tint, i === 1 ? 0.95 : 0.55);
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, size * 0.44, size * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(tint, 0.85);
  ctx.fill();
}
