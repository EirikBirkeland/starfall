// The measurements a palette audit needs: how bright a colour really is, how far
// apart two of them are, and how much of that difference survives losing a cone.
//
// This is a *measurement* module, not part of the game: `src/` never imports it and no number here
// can move a run. `tools/sights.js` says what gets measured and how much is asked of it,
// `tools/palette-check.js` prints the whole audit, and `test/palette-read.test.mjs` holds the rules
// so a palette change cannot quietly become a colour-blind player's problem.
//
// What everything here is measured in: **Oklab** (Björn Ottosson's perceptual space). It takes the
// three linear-light channels of the screen, weights them into three cone-like responses, takes the
// cube root of each, and rotates them into:
//
//   L  lightness, 0 (the black of the sky) to 1 (white) - close enough to CIE L*/100 to be read either way
//   a  green (-) .. red (+)
//   b  blue (-) .. yellow (+)
//
// It is used here rather than plain HSL because a hue angle in HSL is not a perceptual distance -
// a degree of hue near yellow is worth several near cyan - and because the question being asked is
// "can two things be told apart", which wants a space where a step in any direction is about as
// visible as a step in any other.
//
// ### The colour-vision half, and what it does and does not claim
//
// A dichromat is missing one of the three cone types, so the world they see is the colour solid
// *projected away from the missing cone's axis*: two colours that differ only along that axis are
// one colour to them. Which axis that is, in a space built on the cones, is the whole trick - and
// Oklab's `a` and `b` are close relatives of the two chromatic directions the cones disagree about:
//
//   protanopia (no L) and deuteranopia (no M): the red-green axis is gone; what is left of the hue
//     is the blue-yellow axis (`b`) plus brightness;
//   tritanopia (no S): the blue-yellow axis is gone; what is left is the red-green axis (`a`) plus
//     brightness;
//   achromatopsia: brightness only.
//
// That is an *approximation with a known bias*: a real protanope's reds also go dim, and hues slide
// rather than simply losing an axis. It is used here because it is the harsh useful reading - it
// asks "if the one chromatic axis this eye is missing is all that separates these two colours, are
// they still two colours?" - and because it can be stated in three lines and checked by a test
// instead of trusting a table of fitted matrices nobody here can verify against a source. Where a
// pair passes on `b` alone but sits within a hair of the line, the report says so and a human
// decides; that is what the report is for.

const srgbToLinearCache = new Map();

/** One 0-255 screen channel as its linear-light value. */
export function linearChannel(value) {
  const key = value;
  const cached = srgbToLinearCache.get(key);
  if (cached !== undefined) return cached;
  const c = value / 255;
  const out = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  srgbToLinearCache.set(key, out);
  return out;
}

/** The relative luminance of a colour: 0 for the black of the sky, 1 for white. */
export function luminance(rgb) {
  const [r, g, b] = rgb.map(linearChannel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** CIE L*, 0-100. Reported next to Oklab's `L` because some readers think in these. */
export function lightnessStar(rgb) {
  const y = luminance(rgb);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

/**
 * A colour as Oklab `{ L, a, b }`.
 *
 * `rgb` is three 0-255 channels, which is the shape `core/palette.js`'s `parseColor` hands back.
 */
export function oklab(rgb) {
  const r = linearChannel(rgb[0]);
  const g = linearChannel(rgb[1]);
  const b = linearChannel(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024615 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** The same colour as `{ L, C, h }`: lightness, how coloured it is, and its hue in degrees. */
export function oklch(rgb) {
  const lab = oklab(rgb);
  return {
    L: lab.L,
    C: Math.hypot(lab.a, lab.b),
    h: (Math.atan2(lab.b, lab.a) * 180 / Math.PI + 360) % 360,
  };
}

/** A colour's hue in the plain screen sense (the HSL angle), for cross-checking `oklch`'s. */
export function screenHue(rgb) {
  const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

/**
 * How a colour with an opacity actually lands on the sky: `fg` over `bg`, both 0-255 triples.
 *
 * Half the palette is a translucent fill or a glow, and a translucent colour is not a colour - a
 * `rgba(232,58,85,0.16)` body over the night sky is a *dark* red, not the red its channels say.
 * Every measurement of a translucent colour goes through here first, so the audit measures what an
 * eye is given and not what the source file spells.
 */
export function over(fg, alpha, bg) {
  const out = [];
  for (let i = 0; i < 3; i++) out.push(Math.round(fg[i] * alpha + bg[i] * (1 - alpha)));
  return out;
}

// --- colour vision ------------------------------------------------------------

/**
 * The eyes the palette is checked against. Each one is the axes an eye keeps, not the eye itself
 * (see the note at the top of the file).
 */
export const VISIONS = [
  { id: 'normal', name: 'TWO CONE TYPES AGREEING', keeps: ['L', 'a', 'b'] },
  { id: 'protanopia', name: 'NO RED CONE', keeps: ['L', 'b'] },
  { id: 'deuteranopia', name: 'NO GREEN CONE', keeps: ['L', 'b'] },
  // No S cone, so the blue-yellow axis is the one that is gone: what is left is the red-green
  // axis (`a`) and brightness. Note this is the one eye whose surviving axis is *not* `b`, which
  // is what makes it worth measuring at all: it is the eye that catches a palette leaning on a
  // blue-vs-yellow difference, and every other eye here passes those by construction.
  { id: 'tritanopia', name: 'NO BLUE CONE', keeps: ['L', 'a'] },
  { id: 'greyscale', name: 'NO HUE AT ALL', keeps: ['L'] },
];

// How big a step along one axis is enough to call two colours two colours, when that step is the
// only thing saying so. Both numbers are far above a just-noticeable difference (a step of about
// 0.01 in either) on purpose: these are small bodies moving fast on a bright, busy sky, and the
// question is not "can a careful viewer squint out the difference" but "is there a difference to
// see at a glance". `NOTES.md` for the session that chose them; change them here and nowhere else.
const STEP = { L: 0.1, a: 0.06, b: 0.06 };

/** The axes an eye is left with, as the numbers it can compare. */
export function seenBy(visionId, lab) {
  const vision = VISIONS.find((v) => v.id === visionId);
  if (vision === undefined) throw new Error('nobody has measured an eye called ' + visionId);
  return vision.keeps.map((axis) => ({ axis, value: lab[axis] }));
}

/**
 * How far apart two Oklab colours are for one eye, as a multiple of "enough": 1 or more means the
 * eye is handed a difference to see, and under 1 means everything that eye could use is too small.
 *
 * The *largest* axis gap is what counts, because one clear difference is enough - a body that is
 * both much brighter and a different colour is not harder to see than one that is merely much
 * brighter. The axis that wins is reported with it, so a reader can see *what* the separation is.
 */
export function separation(visionId, labA, labB) {
  const axes = seenBy(visionId, labA);
  let best = 0;
  let axis = '';
  for (let i = 0; i < axes.length; i++) {
    const ratio = Math.abs(axes[i].value - labB[axes[i].axis]) / STEP[axes[i].axis];
    if (ratio > best) { best = ratio; axis = axes[i].axis; }
  }
  return { ratio: best, axis };
}

/** The worst eye of the set, which is the one a promise has to be made against. */
export function worstVision(labA, labB, visionIds = VISIONS.map((v) => v.id)) {
  let worst = null;
  for (const id of visionIds) {
    const s = separation(id, labA, labB);
    if (worst === null || s.ratio < worst.ratio) worst = Object.assign({ vision: id }, s);
  }
  return worst;
}

/** The step one of each axis is worth, for a report that wants to print the raw numbers too. */
export const STEP_OF = STEP;
