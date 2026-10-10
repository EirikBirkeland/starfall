// The title's mark: the word STARFALL, drawn as neon tubes with a star falling past it.
//
// PLAN section 4 asks for "the logo drawn in code, animated, with the starfield live behind it",
// and this is that. There is no font in it: every letter is a handful of straight lengths in a unit
// box, stroked the way a neon sign's tubes are - a wide soft halo, a coloured body, a hot core - so
// the word is cut from the same straight edges as the ships (render/shapes.js) and looks the same
// on a machine that has never heard of the typeface it is not using.
//
// It is frame state and nothing else, like the mixer readout (render/volume.js) and the award
// plates (render/toast.js): its clock is burnt by the frame (`advanceLogo`) and never by a
// simulation step, and all of the arithmetic of where everything sits and how bright it is lives in
// `logoLayout`, so a test with no pixels can measure it and the painter only has to paint what it
// is told. Nothing here reaches the game, and nothing in the game knows this file exists: the mark
// is drawn because the world is on its title screen, and it stops being drawn the moment it is not.
//
// *Where* it sits is the DOM's business. `#logoBox` in index.html is an empty heading sized in CSS
// inside a flex-centred column, and main.js hands its rectangle in at boot and at every resize -
// the canvas cannot know what the layout did, and asking the page for a measurement every frame is
// a layout thrash for a number that changes when the window does. *How big* it is comes from the
// box too, but bounded by it rather than read off it, which is what keeps a stub that measured
// nothing from being painted as a whole window of letters.

import { PALETTE, withAlpha } from '../core/palette.js';
import { clamp } from '../core/math.js';
import { view } from './canvas.js';
import { glowFor, paintGlow } from './glow.js';
import { polygon } from './shapes.js';

/**
 * The alphabet: one entry per letter the word needs, each one a set of tubes inside a 1 x 1 box
 * (x right, y down), and a `w` saying how wide that box is next to the rest. Straight lengths
 * only, cut at the same angles as the ship silhouettes - a curve here would need a font to look
 * right, and the whole point is that it does not.
 */
const LETTERS = {
  s: {
    w: 0.92,
    tubes: [[
      [1, 0.14], [0.72, 0], [0.28, 0], [0, 0.14], [0, 0.36], [0.28, 0.5],
      [0.72, 0.5], [1, 0.64], [1, 0.86], [0.72, 1], [0.28, 1], [0, 0.86],
    ]],
  },
  t: {
    w: 0.96,
    tubes: [
      [[0, 0], [1, 0]],
      [[0.5, 0], [0.5, 1]],
    ],
  },
  a: {
    w: 1,
    tubes: [
      [[0, 1], [0.28, 0], [0.72, 0], [1, 1]],
      [[0.15, 0.6], [0.85, 0.6]],
    ],
  },
  r: {
    w: 0.94,
    tubes: [
      [[0, 1], [0, 0], [0.66, 0], [1, 0.25], [0.66, 0.5], [0, 0.5]],
      [[0.38, 0.5], [1, 1]],
    ],
  },
  f: {
    w: 0.84,
    tubes: [
      [[0, 1], [0, 0], [1, 0]],
      [[0, 0.48], [0.86, 0.48]],
    ],
  },
  l: {
    w: 0.84,
    tubes: [[[0, 0], [0, 1], [0.94, 1]]],
  },
};

const WORD = 'starfall';

/** The gap between two letters, and the word's whole width, in cap heights. */
const TRACK = 0.34;

/** The tube's own thickness, in cap heights, and the two softer passes around it. */
const TUBE = 0.115;
const HALO = 3.1;
const BODY = 1.9;

/** How the mark arrives: one letter lights every `STAGGER`, taking `LIGHT` to draw itself in. */
const STAGGER = 0.09;
const LIGHT = 0.17;
const SETTLE = 0.5;         // s a letter spends cooling off after it lands
/** ...and the rule under it, which shoots out from the middle once the word is lit. */
const RULE_AT = 0.66;
const RULE_RUN = 0.34;
const RULE_HALF = 0.3;      // half its length, as a share of the word's width

/** How the mark breathes once it is lit, and how the shine travels along it. */
const BREATHE_RATE = 1.15;
const BREATHE_DEEP = 0.12;
const WAVE_RATE = 0.8;
const WAVE_STEP = 0.55;

/**
 * The brightness recipe, all in shares of a cap height or of full brightness.
 *
 * A settled letter sits at `LIT_FLOOR` and rides up by `LIT_WAVE` as the shine passes; a letter that
 * has just been lit adds `STRIKE_LIFT` on its way down; a letter the star is above picks up
 * `STAR_LIFT` times however near the star is, `STAR_REACH` being how far "near" reaches.
 */
const LIT_FLOOR = 0.82;
const LIT_WAVE = 0.26;
const STRIKE_LIFT = 0.55;
const STAR_LIFT = 0.85;
const STAR_REACH = 1.6;
const CROSS_AT = 0.3;       // where the star's dive crosses the word, below its top

/** The gap between the word and the rule under it, and the rule's own thickness, in cap heights. */
const RULE_GAP = 0.19;
const RULE_THICK = 0.05;

/** Everything drawn, as a share of the box's height: the word, its tube, the gap, the rule. */
const CONTENT = 1 + TUBE + RULE_GAP + RULE_THICK;

/** The falling star: how often, how fast, and how steeply it dives. */
const FALL_FIRST = 2.3;     // s after the title arrives before the first one
const FALL_EVERY = 7.2;
const FALL_RUN = 1.25;
const FALL_SLOPE = 0.35;    // the same tilt the sky's own drift falls at (render/background.js)
const FALL_IN = 0.14;       // share of the pass spent brightening
const FALL_OUT = 0.24;      // ...and spent going away again
const TAIL = [              // the trail, up the line from its head: [share of its length, width, brightness]
  [0.42, 0.13, 0.5],
  [0.33, 0.075, 0.28],
  [0.25, 0.04, 0.14],
];
const TAIL_LONG = 2.2;      // the whole trail, in cap heights
const HEAD_WIDE = 0.4;      // the head's pool of light, in cap heights

/** How far along the dive's axis one unit of travel moves x and y. */
const FALL_X = 1 / Math.hypot(1, FALL_SLOPE);
const FALL_Y = FALL_SLOPE / Math.hypot(1, FALL_SLOPE);

/**
 * One tube of one letter, with its lengths already measured in the space it will be drawn in - so
 * "how much of this tube is lit" is a length question and not a counting-the-points one, and the
 * pen tip the intro puts its spark on is exactly where the stroke stopped.
 */
function buildTube(points, squeeze) {
  const pts = points.map((p) => ({ x: p[0] * squeeze, y: p[1] }));
  const legs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    legs.push(len);
    total += len;
  }
  return { pts: pts, legs: legs, total: total };
}

/** One letter of the word: its width, its tubes, and how long they are all together. */
function buildLetter(ch) {
  const glyph = LETTERS[ch];
  if (glyph === undefined) throw new Error('the mark has no letter ' + ch);
  const tubes = glyph.tubes.map((tube) => buildTube(tube, glyph.w));
  let length = 0;
  for (const tube of tubes) length += tube.total;
  return { ch: ch, w: glyph.w, tubes: tubes, length: length };
}

const GLYPHS = WORD.split('').map(buildLetter);

/** The word's width in cap heights, tracking included and the trailing gap not. */
const SPAN = GLYPHS.reduce((sum, g) => sum + g.w + TRACK, 0) - TRACK;

// Frame state. `age` is how long the title has been on the glass; `box` is the last measurement of
// the element the mark is supposed to sit in; `calm` says the visitor asked for less movement, and
// pins the whole thing to its settled frame.
let age = 0;
let box = null;
let calm = false;

/**
 * Remember where the mark belongs. `el` is the empty heading in the markup; a missing one, or one
 * that has not been laid out yet, leaves the mark where it was rather than moving it nowhere.
 */
export function measureLogo(el) {
  if (el === null || el === undefined || typeof el.getBoundingClientRect !== 'function') return;
  const rect = el.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return;
  box = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
}

/** Does this visitor want as little movement as possible? (render/canvas.js `calmMotion`.) */
export function setCalmMotion(on) {
  calm = on === true;
  if (calm) age = RULE_AT + RULE_RUN + 1;
}

/** Burn the mark's clock. main.js calls this on the frame's time, like the sky. */
export function advanceLogo(dt) {
  if (calm) return;
  // The clock only has to run until everything has arrived; the comet works out its own place in
  // its cycle from the same number, so it keeps running quietly while the mark is off the glass.
  age += dt;
}

/** How long the title has been up, for a test that wants to know whether the mark has arrived. */
export function logoAge() {
  return age;
}

/**
 * Where the mark goes: the box it was measured in, or a plain band across the upper middle of the
 * window when nobody has measured anything. The fallback is a real answer and not a shrug - the
 * window is the same size the box is drawn to, so a mark with no box is a mark in about the right
 * place rather than one spread across the whole glass.
 */
function home() {
  if (box !== null) return box;
  return { x: 0, y: view.H * 0.06, w: view.W, h: view.H * 0.16 };
}

/** The three passes every tube gets: a wide halo, a coloured body, and a core that reads as white.
 *  The core is not quite at full on purpose: the breathing and the falling star should move the tube
 *  a little as well as the glow around it, and an already-saturated core cannot move at all. */
const PASSES = [
  { width: TUBE * HALO, colour: PALETTE.player, share: 0.1 },
  { width: TUBE * BODY, colour: PALETTE.violet, share: 0.24 },
  { width: TUBE, colour: PALETTE.bulletCore, share: 0.9 },
];

/** How far up the letter's box one tube's lit part reaches, and where its pen tip is. */
function traceTube(ctx, tube, part) {
  const reach = tube.total * clamp(part, 0, 1);
  let x = tube.pts[0].x;
  let y = tube.pts[0].y;
  let left = reach;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i < tube.legs.length; i++) {
    const leg = tube.legs[i];
    if (left >= leg) {
      x = tube.pts[i + 1].x;
      y = tube.pts[i + 1].y;
      ctx.lineTo(x, y);
      left -= leg;
      if (left <= 0) return { x: x, y: y };
    } else {
      const t = leg === 0 ? 1 : left / leg;
      x = x + (tube.pts[i + 1].x - x) * t;
      y = y + (tube.pts[i + 1].y - y) * t;
      ctx.lineTo(x, y);
      return { x: x, y: y };
    }
  }
  return { x: x, y: y };
}

/** How much of one letter is drawn yet, and how much longer it is bright for after that. */
function strikeOf(index) {
  const since = age - index * STAGGER;
  return {
    draw: clamp(since / LIGHT, 0, 1),
    // 1 while the tube is still being drawn - the pen is the hottest thing on the screen - and then
    // away over `SETTLE`, so a letter that has just landed is brighter than the word around it.
    strike: clamp(1 - (since - LIGHT) / SETTLE, 0, 1),
  };
}

/** The falling star's place in the sky, or null when there is no star out right now. */
function fallingStar(layout) {
  if (calm) return null;
  const since = age - FALL_FIRST;
  if (since < 0) return null;
  const round = since % FALL_EVERY;
  const part = round / FALL_RUN;
  if (part >= 1) return null;

  // The dive is chosen so it crosses the band the word sits in: it comes in above the right-hand
  // end and goes out below the left-hand one. `back` and `forth` are the two ends of the pass, and
  // each is the shorter of "far enough to be off the side" and "far enough to be off the top (or
  // bottom)" - a star that spends its first third outside the window is a star that does not exist
  // for its first third, and the cycle would read as a flicker instead of a fall.
  const cap = layout.cap;
  const cross = { x: layout.cx, y: layout.wordY + cap * CROSS_AT };
  const back = Math.min(
    (view.W + cap - cross.x) / FALL_X,
    (cross.y + cap) / FALL_Y,
  );
  const forth = Math.min(
    (cross.x + cap) / FALL_X,
    (view.H + cap - cross.y) / FALL_Y,
  );
  if (back <= 0 || forth <= 0) return null;

  const gone = (back + forth) * part;
  const strength = Math.min(
    1,
    Math.min(part / FALL_IN, 1),
    Math.min((1 - part) / FALL_OUT, 1),
  );
  return {
    x: cross.x + (back - gone) * FALL_X,
    y: cross.y - (back - gone) * FALL_Y,
    strength: strength,
    cap: cap,
  };
}

/**
 * The whole mark as the frame sees it: the cap height, the eight letters with how much of each is
 * drawn and how bright it is, the rule under them, and the star if one is out. In window pixels,
 * because everything that draws it is drawing in window pixels.
 */
export function logoLayout() {
  const at = home();
  const cap = Math.min(at.h / CONTENT, at.w / SPAN);
  const width = cap * SPAN;
  const left = at.x + (at.w - width) / 2;
  const wordY = at.y + (at.h - cap * CONTENT) / 2 + cap * TUBE * 0.5;
  const star = fallingStar({ cx: at.x + at.w / 2, wordY: wordY, cap: cap });
  const breathe = calm ? 1 : 1 - BREATHE_DEEP + BREATHE_DEEP * Math.sin(age * BREATHE_RATE);

  const letters = [];
  let x = left;
  for (let i = 0; i < GLYPHS.length; i++) {
    const glyph = GLYPHS[i];
    const strike = strikeOf(i);
    if (strike.draw <= 0) {
      x += (glyph.w + TRACK) * cap;
      continue;
    }
    // The shine travels along the lit word, left to right, so a settled mark is never quite
    // still - a neon sign is, and so is this one.
    const wave = calm ? 0.5 : 0.5 + 0.5 * Math.sin(age * WAVE_RATE - i * WAVE_STEP);
    let bright = breathe * (LIT_FLOOR + LIT_WAVE * wave * wave) + strike.strike * STRIKE_LIFT;
    if (star !== null) {
      // What the falling star lights is the letter it is above, however far above it it happens
      // to be: this is a title, not a lighting plan, and the eye reads a light sweeping along
      // the word just as well as one crossing it.
      const near = 1 - Math.abs(star.x - (x + glyph.w * cap / 2)) / (cap * STAR_REACH);
      if (near > 0) bright += star.strength * near * STAR_LIFT;
    }
    letters.push({
      ch: glyph.ch,
      glyph: glyph,
      x: x,
      y: wordY,
      w: glyph.w * cap,
      cx: x + glyph.w * cap / 2,
      cap: cap,
      draw: strike.draw,
      bright: clamp(bright, 0, 2),
    });
    x += (glyph.w + TRACK) * cap;
  }

  const open = clamp((age - RULE_AT) / RULE_RUN, 0, 1);
  return {
    cap: cap,
    x: left,
    y: wordY,
    w: width,
    cx: at.x + at.w / 2,
    letters: letters,
    rule: {
      cx: at.x + at.w / 2,
      y: wordY + cap + cap * RULE_GAP,
      half: width * RULE_HALF,
      open: open,
      bright: open,
      thick: cap * RULE_THICK,
      stud: cap * 0.085,
    },
    star: star,
  };
}

/**
 * How much of each of a letter's tubes is lit, given how far the letter's own pen has travelled.
 *
 * A letter is drawn by one pen, not by eight at once: the letter's progress spends itself along the
 * first tube before it starts the second, which is what lets a letter of two or three tubes (an `a`
 * has a crossbar, an `r` has a leg) have one pen tip instead of one per tube.
 */
function drawnOf(letter) {
  const glyph = letter.glyph;
  if (letter.draw >= 1) {
    return { parts: glyph.tubes.map((tube) => ({ tube: tube, part: 1 })), tip: null };
  }
  const parts = [];
  let tip = null;
  let left = letter.draw * glyph.length;
  for (const tube of glyph.tubes) {
    const part = tube.total === 0 ? 1 : clamp(left / tube.total, 0, 1);
    if (part > 0) parts.push({ tube: tube, part: part });
    if (part > 0 && part < 1) tip = tipOf(tube, part);
    left -= tube.total;
  }
  return { parts: parts, tip: tip };
}

/** Where the pen sits `part` of the way along one tube, in the letter's own scaled space. */
function tipOf(tube, part) {
  const reach = tube.total * part;
  let x = tube.pts[0].x;
  let y = tube.pts[0].y;
  let left = reach;
  for (let i = 0; i < tube.legs.length; i++) {
    if (left >= tube.legs[i]) {
      x = tube.pts[i + 1].x;
      y = tube.pts[i + 1].y;
      left -= tube.legs[i];
    } else {
      const t = tube.legs[i] === 0 ? 1 : left / tube.legs[i];
      return { x: x + (tube.pts[i + 1].x - x) * t, y: y + (tube.pts[i + 1].y - y) * t };
    }
  }
  return { x: x, y: y };
}

/** One letter: three passes of the same tubes - halo, colour, core - and the spark where the pen is. */
function drawLetter(ctx, letter) {
  const drawn = drawnOf(letter);
  if (drawn.parts.length === 0) return;
  ctx.save();
  ctx.translate(letter.x, letter.y);
  ctx.scale(letter.cap, letter.cap);
  for (const pass of PASSES) {
    ctx.lineWidth = pass.width;
    ctx.strokeStyle = withAlpha(pass.colour, clamp(pass.share * letter.bright, 0, 1));
    for (const part of drawn.parts) {
      traceTube(ctx, part.tube, part.part);
      ctx.stroke();
    }
  }
  ctx.restore();
  // The pen is a bright thing and only the core pass is bright enough to carry it, so the spark is
  // stamped once, outside the scaled space, at the size of the letter it is drawing.
  if (drawn.tip !== null) {
    paintGlow(ctx, glowFor(PALETTE.spark, 40), letter.x + drawn.tip.x * letter.cap,
      letter.y + drawn.tip.y * letter.cap, 0.9, letter.cap * 0.5 / 40);
  }
}

/** The rule under the word: it shoots out from the middle and its ends are two small cut diamonds. */
function drawRule(ctx, rule) {
  if (rule.open <= 0) return;
  const half = rule.half * rule.open;
  ctx.strokeStyle = withAlpha(PALETTE.playerLine, 0.5 * rule.bright);
  ctx.lineWidth = Math.max(1, rule.thick);
  ctx.beginPath();
  ctx.moveTo(rule.cx - half, rule.y);
  ctx.lineTo(rule.cx + half, rule.y);
  ctx.stroke();
  // The diamonds arrive with the end of the line rather than standing there waiting for it.
  const stud = rule.stud * rule.open;
  ctx.fillStyle = withAlpha(PALETTE.elite, 0.75 * rule.bright);
  polygon(ctx, rule.cx - rule.half, rule.y, stud, 4, 0);
  ctx.fill();
  polygon(ctx, rule.cx + rule.half, rule.y, stud, 4, 0);
  ctx.fill();
}

/** The falling star: a hot head and a trail that tapers by getting narrower as much as fainter. */
function drawStar(ctx, star) {
  paintGlow(ctx, glowFor(PALETTE.spark, 40), star.x, star.y,
    star.strength, star.cap * HEAD_WIDE / 40);
  let x = star.x;
  let y = star.y;
  for (const segment of TAIL) {
    const len = star.cap * TAIL_LONG * segment[0];
    const to = { x: x + len * FALL_X, y: y - len * FALL_Y };
    ctx.strokeStyle = withAlpha(PALETTE.spark, segment[2] * star.strength);
    ctx.lineWidth = Math.max(1, star.cap * segment[1]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    x = to.x;
    y = to.y;
  }
}

/**
 * Paint the mark. main.js's frame loop calls this through render/renderer.js for as long as the
 * world is on its title screen, and asks nothing else of it.
 */
export function drawLogo(ctx) {
  const layout = logoLayout();
  if (layout.letters.length === 0 && layout.rule.open <= 0 && layout.star === null) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Additive, like everything that shines in this game: where two tubes cross, and where the star
  // passes over a letter, the light is meant to pile up.
  ctx.globalCompositeOperation = 'lighter';
  for (const letter of layout.letters) drawLetter(ctx, letter);
  drawRule(ctx, layout.rule);
  if (layout.star !== null) drawStar(ctx, layout.star);
  // Put the glass back before the restore as well as with it: the mark is the only additive painter
  // on this side of the arena pass, and what comes after it - the mixer readout, a plate - inherits
  // the composite it finds rather than naming its own.
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}
