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
import { clamp, TAU } from '../core/math.js';
import { world } from '../game/world.js';
import { effectOf, lineOf, maxRanksOf, rankOf } from '../game/upgrades.js';
import { polygon, roundRect, shipPath } from './shapes.js';
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

// The shapes, one per line (the ids come from game/upgrades.js). Kept apart
// from the colours so a line can be drawn in whichever cool colour suits it.
const TINT = {
  damage: PALETTE.white,
  fireRate: PALETTE.player,
  bulletSpeed: PALETTE.shard,
  split: PALETTE.violet,
  pierce: PALETTE.wall,
  ricochet: PALETTE.teal,
  orbitals: PALETTE.indigo,
  nova: PALETTE.spring,
  // The one warm tint on the rack, and the exception is on purpose: seven cool hues were
  // handed out before anything that is itself a flame came along, and a blue flame on a card
  // called BURN would be a joke nobody in the arena would get. The panel around it is still
  // the cool one (PALETTE.cardFace, cardEdge) and the rank pips are small, so the warmth is
  // an icon and not a card.
  burn: PALETTE.burnFlame,
  // The tenth tint, and the pale end of the wheel. Every tint handed out before it is a
  // saturated hue and this one is rime - the same colour a frozen body wears in the arena -
  // which is what lets a tenth card still be told from the nine at a glance without inventing
  // an eleventh hue nobody asked for. It goes across the wheel from BURN's warm one, which is
  // the pair the cards were always going to be.
  chill: PALETTE.chillFrost,
  // The eleventh tint, and not an eleventh hue: it is the pale mint a hull coming back already
  // wears on screen (the '+1 HULL' label, game/player.js `healPlayer`), so the card and the
  // thing it sells are the same colour on purpose and a player who has seen one has read the
  // other. The rack is out of cool hues by now - white, cyan, mint, violet, sky, teal, indigo,
  // spring, and a flame and a rime - and inventing a greenier green to keep the tints all
  // twelve degrees apart would be a colour nobody could name.
  leech: PALETTE.shardLine,
  // The twelfth tint, and - like the eleventh - not a new hue but the colour the thing itself
  // wears in the arena: the near-white heart of a shot, which is what this card loads and what
  // its ring is drawn in (render/entities.js). It is a paler cyan than FIRE RATE's and the two
  // shapes could not be less alike, which is the same bargain the tenth and eleventh tints made;
  // the rack is out of cool hues and a thirteenth invented to keep them evenly spaced would be a
  // colour nobody could name.
  overcharge: PALETTE.chargeRingReady,
  // The thirteenth tint, and - like the eleventh and the twelfth - not a thirteenth hue but the
  // colour the thing itself wears: an image is the ship's own silhouette and nothing else, so the
  // card wears the pale edge of the ship's own hull (render/entities.js strokes an image in it).
  // It is a shade off FIRE RATE's cyan and the two shapes could not be less alike, which is the
  // same bargain the last three tints made: the rack is out of hues and a fourteenth invented to
  // keep them evenly spaced would be a colour nobody could name.
  afterimage: PALETTE.playerLine,
  // The fourteenth tint, and the second warm one on the rack after BURN. It is not a fourteenth
  // hue: it is the gold of an elite's outline, which is the colour this card spends - PLAN section
  // 4 asks for shards gold, this game made the shards mint and gave the gold to whatever is worth
  // killing, and a card that turns loot into damage wears the colour of value. Warm on a card is
  // the exception BURN made (see above), and it means the same thing here as it does in the arena:
  // not a threat, a prize. The shape is nothing like the flame's either.
  magnetar: PALETTE.elite,
  // The fifteenth tint, and - following the four before it - not a fifteenth hue. It is the colour the
  // mine's own ring is drawn in on the arena floor (PALETTE.mineZone), which is the deepest saturated
  // cut of the walls' sky that the rack had left: a mine is the ship's own ordnance, so it wears the
  // ship's cool end of the wheel, and the one thing on this rack that is not like the others is that
  // nothing about it is attached to the ship at all. It is a bluer, harder blue than PIERCE's powder
  // blue and the two shapes could not be less alike.
  mines: PALETTE.mineZone,
  // The sixteenth tint, and the first one that is not a sixteenth hue *or* the thing's own colour: it
  // is the ship's own cyan, which FIRE RATE already wears. That is deliberate, and it is the rack
  // admitting what NOTES has been saying since the tenth card - there are no cool hues left to hand
  // out, and a sixteenth invented to keep them evenly spaced would be a colour nobody could name. The
  // tether wears the ship's cyan in the arena because it *is* the ship's own light drawn as a line
  // (render/entities.js), the same bargain the orbitals and the nova strike, and of the two cards now
  // wearing cyan, one is a stack of bars and the other is a ship trailing threads: they cannot be
  // mistaken for each other at any size, which is the only test a tint has to pass.
  tether: PALETTE.player,
  // The seventeenth tint, and - following the five before it - not a seventeenth hue. It is the pale
  // edge of the ship's own hull, which is what a turret is drawn in in the arena (render/entities.js
  // strokes its mount and barrel with it) because a turret is not something the ship left behind: it
  // is a piece of the ship, its own gun on a mount, still firing. AFTERIMAGE already wears this for the
  // same reason - an image is the ship as it was and nothing else - and of the two cards now wearing
  // the ship's pale edge one is a ship trailing ghosts and the other is a fence of guns across a road:
  // they cannot be mistaken for each other at any size, which is the only test a tint has to pass. It
  // also means the seventeenth card asks the canvas for no new sprite, which test/draw-cost.test.mjs
  // is watching.
  turret: PALETTE.playerLine,
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
 * cycle, a shot with its own wake for velocity, three of them for split shot, one going
 * through two bodies for pierce, one turning from one body to the next for ricochet, a
 * ring of drones round a ship for the orbitals, and a wave caught mid-expansion off a
 * ship for the nova. Small, drawn from paths, and legible at
 * a card's worth of pixels. Each line names one of these in game/upgrades.js, and an icon
 * with no shape is a bug that says so rather than drawing the wrong thing.
 */
const ICONS = {
  damage: iconDamage,
  fireRate: iconFireRate,
  bulletSpeed: iconBulletSpeed,
  split: iconSplit,
  pierce: iconPierce,
  ricochet: iconRicochet,
  orbitals: iconOrbitals,
  nova: iconNova,
  burn: iconBurn,
  chill: iconChill,
  leech: iconLeech,
  overcharge: iconOvercharge,
  afterimage: iconAfterimage,
  magnetar: iconMagnetar,
  mines: iconMines,
  tether: iconTether,
  turret: iconTurret,
};

/** The orbital icon: the ring's own radius, three of them on it, and a ship in the middle. */
const ORBIT_RING = 0.62;
const ORBIT_BODY = 0.16;
const ORBIT_THIRD = Math.PI * 2 / 3;
const ORBIT_TRAIL_ARC = 0.55;    // rad of bright arc behind each drone: which way it turns

/**
 * The nova icon's two rings: where the wave is and where it was a moment ago. The near
 * one is the bright one, because that is the edge that is hurting things now.
 */
const NOVA_NEAR = 0.5;
const NOVA_FAR = 0.86;
const NOVA_SHIP = 0.26;
const NOVA_TICKS = 8;

/** The three lengths of the pierce icon's shot, brightest where it started. */
const PIERCE_SHOT = [
  { from: 0.86, to: 0.14, wide: 0.17, thin: 0.13, at: 0.95 },
  { from: -0.12, to: -0.46, wide: 0.12, thin: 0.09, at: 0.55 },
  { from: -0.56, to: -0.86, wide: 0.08, thin: 0.03, at: 0.3 },
];

/**
 * The ricochet icon's two bodies, and the three legs of shot that run between them: in
 * from below, from one body to the next, and out again. Each leg is thinner and dimmer
 * than the one before it - the shot spends itself as it goes - and the last one is the
 * shot still flying after the body it found.
 */
const RICOCHET_BODY_A = [-0.06, 0.2];
const RICOCHET_BODY_B = [0.62, -0.3];
const RICOCHET_PATH = [
  { from: [-0.8, 0.84], to: RICOCHET_BODY_A, wide: 0.19, at: 0.95 },
  { from: RICOCHET_BODY_A, to: RICOCHET_BODY_B, wide: 0.14, at: 0.62 },
  { from: RICOCHET_BODY_B, to: [0.88, -0.66], wide: 0.09, at: 0.32 },
];

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

/**
 * Three drones on a track round a ship. The track is the whole card - a thing that goes
 * round you and hurts whatever it touches - so it is drawn first and widest, with the
 * drones on it and a ship in the middle small enough that the ring reads before the ship
 * does. The short bright arc behind each drone is the direction the ring turns in.
 */
function iconOrbitals(ctx, size, tint) {
  ctx.strokeStyle = withAlpha(tint, 0.36);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, size * ORBIT_RING, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + i * ORBIT_THIRD;
    ctx.strokeStyle = withAlpha(tint, 0.7);
    ctx.lineWidth = size * 0.09;
    ctx.beginPath();
    ctx.arc(0, 0, size * ORBIT_RING, a - ORBIT_TRAIL_ARC, a);
    ctx.stroke();

    polygon(ctx, Math.cos(a) * size * ORBIT_RING, Math.sin(a) * size * ORBIT_RING,
      size * ORBIT_BODY, 4, Math.PI / 4);
    ctx.fillStyle = withAlpha(tint, 0.95);
    ctx.fill();
  }
  ctx.lineCap = 'butt';

  shipPath(ctx, 0, size * 0.05, size * 0.3, -Math.PI / 2, 1.7);
  ctx.fillStyle = withAlpha(tint, 0.8);
  ctx.fill();
}

/**
 * A wave caught on its way out of a ship: the ring where it is now, a fainter one further
 * out where it has come from, and eight short ticks between them pointing away. Two rings
 * rather than one is the whole card - a thing that expands, not a thing that sits there -
 * and the ship in the middle is small so the wave reads first.
 */
function iconNova(ctx, size, tint) {
  ctx.strokeStyle = withAlpha(tint, 0.28);
  ctx.lineWidth = size * 0.07;
  ctx.beginPath();
  ctx.arc(0, 0, size * NOVA_FAR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = withAlpha(tint, 0.5);
  ctx.lineWidth = size * 0.05;
  for (let i = 0; i < NOVA_TICKS; i++) {
    const a = (i / NOVA_TICKS) * Math.PI * 2 + Math.PI / NOVA_TICKS;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * size * (NOVA_NEAR + 0.08), Math.sin(a) * size * (NOVA_NEAR + 0.08));
    ctx.lineTo(Math.cos(a) * size * (NOVA_FAR - 0.06), Math.sin(a) * size * (NOVA_FAR - 0.06));
    ctx.stroke();
  }

  ctx.strokeStyle = withAlpha(tint, 0.95);
  ctx.lineWidth = size * 0.1;
  ctx.beginPath();
  ctx.arc(0, 0, size * NOVA_NEAR, 0, Math.PI * 2);
  ctx.stroke();

  shipPath(ctx, 0, 0, size * NOVA_SHIP, -Math.PI / 2, 1.7);
  ctx.fillStyle = withAlpha(tint, 0.9);
  ctx.fill();
}

/**
 * A shot that came in low, turned on a body, and is on its way to the next one. The kink
 * is the whole card: the shot that hit something does not stop, it goes somewhere you did
 * not point it - and the leg after the turn is thinner, because it is lighter for it.
 */
function iconRicochet(ctx, size, tint) {
  ctx.lineCap = 'round';
  for (const leg of RICOCHET_PATH) {
    ctx.beginPath();
    ctx.moveTo(leg.from[0] * size, leg.from[1] * size);
    ctx.lineTo(leg.to[0] * size, leg.to[1] * size);
    ctx.lineWidth = leg.wide * size;
    ctx.strokeStyle = withAlpha(tint, leg.at);
    ctx.stroke();
  }

  // The two bodies it found, quiet, so the path reads as going from one to the other
  // rather than as a bend in nothing.
  for (const spot of [RICOCHET_BODY_A, RICOCHET_BODY_B]) {
    polygon(ctx, spot[0] * size, spot[1] * size, size * 0.24, 4, Math.PI / 4);
    ctx.strokeStyle = withAlpha(tint, 0.5);
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
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
 * A flame standing on a body: the fire is *on a thing*, which is the whole card - it is not
 * another projectile to throw, it is what happens to whatever you have already hit. The body
 * sits under it quiet, the way pierce's bodies do, and the flame leans a little so it is a
 * live shape and not a teardrop.
 */
function iconBurn(ctx, size, tint) {
  polygon(ctx, 0, size * 0.46, size * 0.26, 4, Math.PI / 4);
  ctx.fillStyle = withAlpha(tint, 0.16);
  ctx.fill();
  ctx.strokeStyle = withAlpha(tint, 0.45);
  ctx.lineWidth = 1.4;
  ctx.stroke();

  flamePath(ctx, 0, size * 0.36, size * 1.12, size * 0.6, size * 0.2);
  ctx.fillStyle = withAlpha(tint, 0.92);
  ctx.fill();

  flamePath(ctx, size * 0.02, size * 0.3, size * 0.52, size * 0.26, 0);
  ctx.fillStyle = withAlpha(PALETTE.burnCore, 0.9);
  ctx.fill();
}

/**
 * A body inside a shell of ice: the same quiet body the burn icon carries, because this card is
 * also about what happens to a thing you have already hit and not about one more thing to throw.
 * The hexagon is the shell the arena draws on a body that has frozen solid - the card and the
 * ice are the same shape, so a player who has seen one has read the other - and the ticks off
 * its faces are the cold going out, not a sparkle.
 */
function iconChill(ctx, size, tint) {
  polygon(ctx, 0, 0, size * 0.26, 4, Math.PI / 4);
  ctx.fillStyle = withAlpha(tint, 0.14);
  ctx.fill();
  ctx.strokeStyle = withAlpha(tint, 0.4);
  ctx.lineWidth = 1.4;
  ctx.stroke();

  polygon(ctx, 0, 0, size * 0.56, 6, 0);
  ctx.fillStyle = withAlpha(tint, 0.12);
  ctx.fill();
  ctx.strokeStyle = withAlpha(tint, 0.9);
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.lineWidth = 1.6;
  for (let i = 0; i < CHILL_TICKS; i++) {
    const angle = -Math.PI / 2 + (i / CHILL_TICKS) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(cos * size * CHILL_TICK_NEAR, sin * size * CHILL_TICK_NEAR);
    ctx.lineTo(cos * size * CHILL_TICK_FAR, sin * size * CHILL_TICK_FAR);
    ctx.strokeStyle = withAlpha(tint, CHILL_TICK_LIGHT - i * 0.1);
    ctx.stroke();
  }
}

/** The shell's three ticks: where they start, where they stop, and how bright. */
const CHILL_TICKS = 3;
const CHILL_TICK_NEAR = 0.62;
const CHILL_TICK_FAR = 0.9;
const CHILL_TICK_LIGHT = 0.7;

/**
 * A hull pip with bodies coming back to it: the middle is the brightest thing on the card,
 * because the middle is what the card gives you, and the six chevrons around it all point
 * inwards - two deep, so the near ones are still arriving while the far ones have already
 * turned. No ring and no orbit: this is not a thing that goes round the ship, it is a price
 * that gets paid at every body that comes down (game/leech.js), and the chevrons are the
 * same language the edge arrows speak - a direction, not a decoration.
 */
const LEECH_PIP = 0.34;
const LEECH_TURNS = 3;
const LEECH_SPIN = -Math.PI / 2;
const LEECH_ROWS = [
  { at: 0.6, arm: 0.15, light: 0.8 },
  { at: 0.84, arm: 0.11, light: 0.34 },
];

function iconLeech(ctx, size, tint) {
  polygon(ctx, 0, 0, size * LEECH_PIP, 4, Math.PI / 4);
  ctx.fillStyle = withAlpha(tint, 0.85);
  ctx.fill();
  ctx.strokeStyle = withAlpha(tint, 0.95);
  ctx.lineWidth = 1.8;
  ctx.stroke();

  ctx.lineCap = 'round';
  for (const row of LEECH_ROWS) {
    ctx.lineWidth = size * 0.07;
    ctx.strokeStyle = withAlpha(tint, row.light);
    for (let i = 0; i < LEECH_TURNS; i++) {
      const a = LEECH_SPIN + i * (Math.PI * 2 / LEECH_TURNS);
      ctx.save();
      ctx.rotate(a);
      // A V with its point nearest the middle: the wings are `arm` further out and `arm`
      // off the axis, which is a chevron at any size without a second number to agree with.
      const reach = size * row.at;
      const arm = size * row.arm;
      ctx.beginPath();
      ctx.moveTo(reach + arm, -arm);
      ctx.lineTo(reach, 0);
      ctx.lineTo(reach + arm, arm);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.lineCap = 'butt';
}

/**
 * A shot standing inside a ring that has nearly closed over it: the card's picture is the ring the
 * ship wears in the arena (render/entities.js), because that ring *is* the card - an arc that
 * closes over a second of standing still, and a shot that comes out of it heavier than it went
 * in. The middle is the brightest thing on the card, as it is on DAMAGE and LEECH, for the same
 * reason: the middle is what the card gives you. No chevrons and no flame, because this is not a
 * thing arriving and not a thing happening to a body - it is the ship's own gun being loaded.
 */
const CHARGE_ARC = 0.78;      // how far round the ring has got, of a whole turn
const CHARGE_RING = 0.74;     // where the ring sits, of the icon's own size
const CHARGE_BAND = 0.13;     // and how thick it is

function iconOvercharge(ctx, size, tint) {
  const radius = size * CHARGE_RING;
  ctx.lineCap = 'round';
  ctx.lineWidth = size * CHARGE_BAND;

  ctx.strokeStyle = withAlpha(tint, 0.22);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();

  ctx.strokeStyle = withAlpha(tint, 0.95);
  ctx.beginPath();
  ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + TAU * CHARGE_ARC);
  ctx.stroke();
  ctx.lineCap = 'butt';

  polygon(ctx, 0, 0, size * 0.3, 4, Math.PI / 4);
  ctx.fillStyle = withAlpha(tint, 0.55);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.14, 0, TAU);
  ctx.fillStyle = withAlpha(PALETTE.white, 0.95);
  ctx.fill();
}

/**
 * Three of the ship in a row, going out: the streak a dash covers, told as the images it leaves
 * standing in it. The bright one at the front is where the ship is and the two behind it are
 * where it was - the same fade the arena paints them with (render/entities.js), and the same
 * shape, because the card and the thing it sells are one thing.
 */
const GHOST_PLACES = [
  { at: -0.68, light: 0.2 },
  { at: -0.24, light: 0.46 },
  { at: 0.3, light: 0.95 },
];
const GHOST_HULL = 0.3;     // the ship's own size, as a share of the icon
const GHOST_SPIKE = 1.3;    // how pointed: an image is the ship caught mid-dash
const GHOST_TRACK = 0.88;   // how far the streak runs out behind the last of them
const GHOST_TRACK_WIDE = 0.1;

function iconAfterimage(ctx, size, tint) {
  ctx.lineCap = 'round';
  ctx.lineWidth = size * GHOST_TRACK_WIDE;
  ctx.strokeStyle = withAlpha(tint, 0.22);
  ctx.beginPath();
  ctx.moveTo(-size * GHOST_TRACK, 0);
  ctx.lineTo(size * GHOST_TRACK, 0);
  ctx.stroke();
  ctx.lineCap = 'butt';

  ctx.lineWidth = size * 0.07;
  for (const ghost of GHOST_PLACES) {
    shipPath(ctx, size * ghost.at, 0, size * GHOST_HULL, -Math.PI / 2, GHOST_SPIKE);
    ctx.fillStyle = withAlpha(tint, ghost.light * 0.34);
    ctx.fill();
    ctx.strokeStyle = withAlpha(tint, ghost.light);
    ctx.stroke();
  }
}

/**
 * Six shards on the edge of the field, six short arrows falling in from them, and the ship at the
 * middle of it all: the whole card is the direction, which is the one thing that tells this apart
 * from the nova's two rings running out (game/nova.js). The shards are diamonds because a shard is
 * a diamond, and the ring they stand on is not drawn - the shards *are* the ring, and a line under
 * them would be the orbitals' track again.
 */
const FIELD_SHARDS = 6;
const FIELD_RING = 0.84;      // where the shards stand, of the icon's own size
const FIELD_SHARD = 0.14;     // how big one of them is
const FIELD_FALL_FROM = 0.66; // where a falling arrow starts, and where it ends
const FIELD_FALL_TO = 0.44;
const FIELD_FALL_WIDE = 0.065;
const FIELD_CORE = 0.33;      // the rim the field collapses to
const FIELD_SHIP = 0.24;      // the ship in the middle, small, as always

function iconMagnetar(ctx, size, tint) {
  for (let i = 0; i < FIELD_SHARDS; i++) {
    const a = -Math.PI / 2 + (i / FIELD_SHARDS) * Math.PI * 2;
    polygon(ctx, Math.cos(a) * size * FIELD_RING, Math.sin(a) * size * FIELD_RING,
      size * FIELD_SHARD, 4, Math.PI / 4);
    ctx.fillStyle = withAlpha(tint, 0.92);
    ctx.fill();
  }

  ctx.lineCap = 'round';
  ctx.lineWidth = size * FIELD_FALL_WIDE;
  ctx.strokeStyle = withAlpha(tint, 0.62);
  for (let i = 0; i < FIELD_SHARDS; i++) {
    // Half a step round from the shards, so every arrow falls between two of them and the two sets
    // never pile on each other.
    const a = -Math.PI / 2 + ((i + 0.5) / FIELD_SHARDS) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * size * FIELD_FALL_FROM, Math.sin(a) * size * FIELD_FALL_FROM);
    ctx.lineTo(Math.cos(a) * size * FIELD_FALL_TO, Math.sin(a) * size * FIELD_FALL_TO);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';

  ctx.lineWidth = size * 0.08;
  ctx.strokeStyle = withAlpha(tint, 0.95);
  ctx.beginPath();
  ctx.arc(0, 0, size * FIELD_CORE, 0, Math.PI * 2);
  ctx.stroke();

  shipPath(ctx, 0, 0, size * FIELD_SHIP, -Math.PI / 2, 1.7);
  ctx.fillStyle = withAlpha(tint, 0.85);
  ctx.fill();
}

/**
 * One flame: a round body of fire with a tip leaning `lean` px to the right, `width` px
 * across and `height` px tall, sitting on `base`. Two quadratic curves on each side is all
 * it is - a shape with no hard edges, which is what a flame is.
 */
function flamePath(ctx, cx, base, height, width, lean) {
  const tip = cx + lean;
  ctx.beginPath();
  ctx.moveTo(tip, base - height);
  ctx.quadraticCurveTo(cx + width, base - height * 0.42, cx + width * 0.6, base);
  ctx.quadraticCurveTo(cx, base + height * 0.16, cx - width * 0.6, base);
  ctx.quadraticCurveTo(cx - width, base - height * 0.42, tip, base - height);
  ctx.closePath();
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

/**
 * One shot on its way through two bodies, and still going. The column of light gets
 * thinner and fainter the further it has travelled, which is the whole deal of the card
 * in one picture: the body behind the one you aimed at gets what is left of the shot.
 */
function iconPierce(ctx, size, tint) {
  // Bodies first, quiet, so the shot reads as going through them rather than past.
  for (const y of [0.3, -0.3]) {
    polygon(ctx, 0, y * size, size * 0.3, 4, Math.PI / 4);
    ctx.fillStyle = withAlpha(tint, 0.16);
    ctx.fill();
    polygon(ctx, 0, y * size, size * 0.3, 4, Math.PI / 4);
    ctx.strokeStyle = withAlpha(tint, 0.5);
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // Then the shot: three lengths of it, each narrower and dimmer than the one below.
  for (const s of PIERCE_SHOT) {
    ctx.beginPath();
    ctx.moveTo(-s.wide * size / 2, s.from * size);
    ctx.lineTo(s.wide * size / 2, s.from * size);
    ctx.lineTo(s.thin * size / 2, s.to * size);
    ctx.lineTo(-s.thin * size / 2, s.to * size);
    ctx.closePath();
    ctx.fillStyle = withAlpha(tint, s.at);
    ctx.fill();
  }
}

/**
 * A ship at the top of the card and the three mines it has just dropped behind it, each still
 * wearing its ring. The trail is the card and not the ship, which is why the ship is small and up at
 * the top and what you read first is the line of things falling out of its wake (game/mines.js).
 * Each mine is the hexagon-and-four-spikes shell the arena paints, with a lit eye; the rings get
 * fainter going down the line because the ones further back have been waiting longer.
 */
const MINE_PLACES = [
  { at: -0.36, ring: 0.3, light: 0.95 },
  { at: 0.16, ring: 0.26, light: 0.66 },
  { at: 0.66, ring: 0.22, light: 0.4 },
];
const MINE_SHELL = 0.13;    // the hexagon, as a share of the icon
const MINE_SPIKE = 0.055;   // and how far its spikes stand off
const MINE_DASH = 0.1;      // px of dash and px of gap on a ring, same share
const MINE_WAKE = 0.09;     // how wide the drop line down the middle is drawn
const MINE_SHIP = 0.22;     // the ship at the top of it, small, as always

function iconMines(ctx, size, tint) {
  // The wake: the way the ship was going, with the mines dropped out of it.
  ctx.lineCap = 'round';
  ctx.lineWidth = size * MINE_WAKE;
  ctx.strokeStyle = withAlpha(tint, 0.18);
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.52);
  ctx.lineTo(0, size * 0.82);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Every ring first, then every shell, so one dash setting serves them all and no shell is drawn
  // under a ring it is supposed to be inside.
  ctx.setLineDash([size * MINE_DASH, size * MINE_DASH]);
  ctx.lineWidth = 1.4;
  for (const place of MINE_PLACES) {
    ctx.strokeStyle = withAlpha(tint, place.light * 0.55);
    ctx.beginPath();
    ctx.arc(0, place.at * size, size * place.ring, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const place of MINE_PLACES) {
    const y = place.at * size;
    const r = size * MINE_SHELL;
    // One path for the shell and its four spikes, then the house two passes: a wide faint stroke
    // under a thin bright one, which is how anything here glows without a blur.
    polygon(ctx, 0, y, r, 6, Math.PI / 6);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.moveTo(Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(Math.cos(a) * (r + size * MINE_SPIKE), y + Math.sin(a) * (r + size * MINE_SPIKE));
    }
    ctx.strokeStyle = withAlpha(tint, place.light * 0.3);
    ctx.lineWidth = size * 0.09;
    ctx.stroke();
    ctx.strokeStyle = withAlpha(tint, place.light * 0.9);
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, y, size * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(PALETTE.white, place.light);
    ctx.fill();
  }

  shipPath(ctx, 0, -size * 0.72, size * MINE_SHIP, -Math.PI / 2, 1.6);
  ctx.fillStyle = withAlpha(tint, 0.9);
  ctx.fill();
}

/**
 * A ship that has turned, the three knots its dash tied along the way it came, and a thread from every
 * one of them back to the hull. The knots are spread across a turn and not down a straight line on
 * purpose: a ship flying straight drags one thread along its own wake and a ship that turns sweeps a
 * fan, and the fan is the card (game/tether.js). The threads are what you read first - bright, taut,
 * all of them meeting at the ship - and the faint line behind the knots is only the road they were tied
 * along.
 */
const TETHER_SHIP = [0.46, -0.52];
const TETHER_KNOTS = [
  { at: [-0.68, 0.02], light: 0.45 },
  { at: [-0.44, 0.44], light: 0.7 },
  { at: [-0.04, 0.74], light: 1 },
];
const TETHER_SOFT = 0.1;    // the wide faint pass under each thread, as a share of the icon
const TETHER_LINE = 1.4;    // px, the thread itself
const TETHER_DOT = 0.065;   // a knot, as a share of the icon
const TETHER_SHIP_SIZE = 0.24;
const TETHER_HEADING = -0.62;   // rad: off the road it came along, which is the whole story

function iconTether(ctx, size, tint) {
  const sx = size * TETHER_SHIP[0];
  const sy = size * TETHER_SHIP[1];

  // The road the knots were tied along, faint and wide, so the threads read as something tied to
  // somewhere and not as three lines drawn at nothing.
  ctx.lineCap = 'round';
  ctx.lineWidth = size * TETHER_SOFT;
  ctx.strokeStyle = withAlpha(tint, 0.16);
  ctx.beginPath();
  ctx.moveTo(size * -0.84, -size * 0.16);
  for (const knot of TETHER_KNOTS) ctx.lineTo(size * knot.at[0], size * knot.at[1]);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Every thread first and every knot after it, so no thread is painted over the dot it ends at.
  ctx.beginPath();
  for (const knot of TETHER_KNOTS) {
    ctx.moveTo(sx, sy);
    ctx.lineTo(size * knot.at[0], size * knot.at[1]);
  }
  ctx.strokeStyle = withAlpha(tint, 0.2);
  ctx.lineWidth = size * 0.09;
  ctx.stroke();

  for (const knot of TETHER_KNOTS) {
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(size * knot.at[0], size * knot.at[1]);
    ctx.strokeStyle = withAlpha(tint, knot.light * 0.9);
    ctx.lineWidth = TETHER_LINE;
    ctx.stroke();
  }

  for (const knot of TETHER_KNOTS) {
    ctx.beginPath();
    ctx.arc(size * knot.at[0], size * knot.at[1], size * TETHER_DOT, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(PALETTE.white, knot.light);
    ctx.fill();
  }

  shipPath(ctx, sx, sy, size * TETHER_SHIP_SIZE, TETHER_HEADING, 1.6);
  ctx.fillStyle = withAlpha(tint, 0.9);
  ctx.fill();
}

/**
 * The turret icon: the road ahead with a fence of guns laid across it, the middle one loaded and
 * throwing, and the ship below it small as always. Three of the five are drawn because three is what
 * fits in a card's worth of pixels and still says "a line across the road" rather than "a gun".
 */
const TURRET_ROAD = 0.09;      // how wide the lane is drawn across the icon
const TURRET_GUNS = [          // where the guns stand across it, and how lit each one is
  { at: -0.54, light: 0.38 },
  { at: 0, light: 1 },
  { at: 0.54, light: 0.38 },
];
const TURRET_Y = -0.2;         // the row of guns, as a share of the icon
const TURRET_MOUNT = 0.115;    // the mount, as a share of the icon
const TURRET_BARREL = 0.19;    // how far the barrel reaches up out of it
const TURRET_LINE = 1.4;       // px, the mount and the barrel
const TURRET_TRACER = 0.36;    // how far up the shot that just left reaches
const TURRET_SHELL = 0.055;    // and the shot itself
const TURRET_SHIP = 0.22;      // the ship at the bottom of it, small, as always

function iconTurret(ctx, size, tint) {
  const y = size * TURRET_Y;

  // The lane, so the guns read as laid across somewhere and not as three shapes in a row.
  ctx.lineCap = 'round';
  ctx.lineWidth = size * TURRET_ROAD;
  ctx.strokeStyle = withAlpha(tint, 0.14);
  ctx.beginPath();
  ctx.moveTo(-size * 0.82, y);
  ctx.lineTo(size * 0.82, y);
  ctx.stroke();
  ctx.lineCap = 'butt';

  for (const gun of TURRET_GUNS) {
    const x = size * gun.at;
    const r = size * TURRET_MOUNT;
    // One path for the mount and its barrel, then the house two passes: a wide faint stroke under a
    // thin bright one, which is how anything here glows without a blur.
    polygon(ctx, x, y, r, 4, Math.PI / 4);
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - size * TURRET_BARREL);
    ctx.strokeStyle = withAlpha(tint, gun.light * 0.3);
    ctx.lineWidth = size * 0.09;
    ctx.stroke();
    ctx.strokeStyle = withAlpha(tint, gun.light * 0.9);
    ctx.lineWidth = TURRET_LINE;
    ctx.stroke();
  }

  // The middle gun's own shot, which is the whole card: a gun that fires on its own.
  const muzzle = y - size * TURRET_BARREL;
  ctx.strokeStyle = withAlpha(tint, 0.5);
  ctx.lineWidth = size * 0.05;
  ctx.beginPath();
  ctx.moveTo(0, muzzle);
  ctx.lineTo(0, muzzle - size * TURRET_TRACER);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, muzzle - size * TURRET_TRACER, size * TURRET_SHELL, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(PALETTE.white, 1);
  ctx.fill();

  shipPath(ctx, 0, size * 0.66, size * TURRET_SHIP, -Math.PI / 2, 1.6);
  ctx.fillStyle = withAlpha(tint, 0.9);
  ctx.fill();
}
