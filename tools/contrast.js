// The interface, measured: can a line of type be read where it is painted?
//
// This is the ruler and the tables; `tools/contrast-check.js` is what prints them and
// `test/contrast.test.mjs` is what holds the promises. Nothing in here prints or exits, so a test can
// import it and measure.
//
// `tools/sights.js` measures the arena: small bodies, moving fast, told apart by colour. This is the
// other half of the game's colour business, and it is a different question - words, on a panel, read
// at leisure. A pair of bodies within a hair of each other is a hesitation; a line of interface type
// you cannot read is a fact the game is not telling you, and the interface had been writing its
// dimmest lines in colours nobody ever measured.
//
// ### The ruler, and why it is not the palette's
//
// Type is measured with the **WCAG 2.1 contrast ratio**: the relative luminance of the text divided
// into the relative luminance of the field it sits on, `(L1 + 0.05) / (L2 + 0.05)`, which is the
// published ruler for exactly this question and comes with thresholds that carry a decade of arguing
// behind them: **4.5 to 1 for a line of type you read, 3 to 1 for a heading**. The Oklab step stays
// the ruler for bodies in the arena, where the question is "are these two things two things" and the
// answer depends on which cones you have; a line of grey-on-navy type is not a colour-blindness
// question in the same way, because it carries no hue and needs to carry none.
//
// The two rulers are printed side by side anyway - the report shows the Oklab lightness step (`STEP`)
// between a line and its field next to the ratio, in the same units `tools/palette-check.js` counts
// in - so that an interface number can be compared with a palette number and one of them is not a
// fiction.
//
// ### What a row is
//
// One line of type, in one place: the words, the colour they are painted in, the field they are
// painted on, the size they are set at, and the bar that follows from the size. Nothing here is a
// remembered hex: **the page half is read out of `index.html` itself** - every `color:` declaration
// in its `<style>` block, with its size resolved through the same inheritance the browser would use,
// composited by whatever `opacity` its own rule sets, over a veil parsed from the same file - so the
// audit cannot drift from the page, and a new line of type is audited the day it is written. The glass
// half is a table of the lines `src/render/` paints, with every colour read from `core/palette.js` by
// name; the plates are palette entries for the same reason (`test/contrast.test.mjs` refuses an
// inline plate in `src/render/`).
//
// ### What is measured, and what is left out on purpose
//
//   **The field is the brightest one the interface can put behind a line.** The page has four veils
//   (the title's, the end cards', the three heavy panels', and `.screen`'s own) and they differ by
//   about nothing - see `fieldsOf` and the test in `test/contrast.test.mjs` that holds them together -
//   because every one of them is
//   nearly black and the game's type is uniformly light on dark, so the heaviest veil over the
//   brightest sky is a floor for all of them and is what every page row is measured against.
//
//   **A `text-shadow` is not counted.** Every bright line on the page has a coloured bloom behind it
//   and the bloom genuinely helps, but it is a gradient of unknown spread at audit time and the audit
//   is about the flat figure of the glyphs; a line that only reads because of its glow is a line the
//   audit should shout about, not one it should quietly pass.
//
//   **A pulsing line is measured at full strength.** `.hint` and `.newbest` breathe down to 0.3
//   opacity, which is the one place in the interface where a line is briefly much dimmer than its
//   colour, and it is left out for the same reason the palette audit leaves out a bomber's flash: it
//   is a transient, it is at full brightness in the middle of every cycle, it is the only thing moving
//   on a still screen, and neither of the two facts it carries is written only there (the launch keys
//   are in the title's own key list, and NEW BEST repeats on the card under it).
//
//   **`.screen.aside` is not a legibility question.** A page that has been put to bed behind a panel
//   is at a tenth on purpose (session 111) and is not asking to be read.
//
//   **The F3 plate is exempt**, on the same grounds `test/words.test.mjs` gives it: it is a terminal
//   readout for the developer and not the game's type. The frame-rate line in the corner is exempt for
//   the same reason - it is the game telling the developer what a frame costs, and it is not telling a
//   player anything they need in order to fly.
//
//   **The sky is the plain sky.** The brightest field the arena sustains is its own gradient at its
//   top; the nebula is excluded because how bright a cloud gets on screen is a property of a baked
//   sprite (`render/nebula.js`) and not of a colour, and the audit declines to invent a number for it
//   - which also means a HUD line measured here is measured against the field it gets with the room
//   empty. Bodies, glows and beams are transients and are excluded, as they are in the arena audit.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PALETTE, parseColor, withAlpha } from '../src/core/palette.js';
import { luminance, oklab, over, STEP_OF } from './colour-lab.js';

/** The bar a line has to clear. WCAG 2.1's two numbers, in the words this report prints. */
export const BARS = {
  body: 4.5,
  large: 3,
};

/** A line set at or above this size is a heading and gets the looser bar. */
export const LARGE_PX = 24;

/** The browser's own default, which the page never sets and never needs. */
const ROOT_PX = 16;

/** How much warning a row gets before it is a failure: a row within this of its bar is `thin`. */
export const THIN_MARGIN = 0.5;

/** `(L1 + 0.05) / (L2 + 0.05)` for the brighter of two colours over the duller. Always >= 1. */
export function contrastRatio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/** The same difference in the palette's units: how many Oklab lightness steps apart the two are. */
export function stepOf(fg, bg) {
  return Math.abs(oklab(fg).L - oklab(bg).L) / STEP_OF.L;
}

/**
 * A colour as the page writes it: three channels and an opacity.
 *
 * Accepts everything the stylesheet uses - `#abc`, `#rrggbb`, `rgb()`, `rgba()` - and throws on
 * anything else, because a colour the audit could not read and passed over is worse than no audit.
 */
export function colourValue(text) {
  const raw = String(text).trim();
  const match = /^rgba?\(([^)]+)\)$/i.exec(raw);
  if (match !== null) {
    const bits = match[1].split(',').map(Number);
    if (!bits.every((n) => Number.isFinite(n))) throw new Error('not a colour: ' + raw);
    return { rgb: parseColor(raw), alpha: bits.length > 3 ? bits[3] : 1 };
  }
  return { rgb: parseColor(raw), alpha: 1 };
}

/** One `selector, selector { ... }` block out of a stylesheet, with the declarations split apart. */
function declarations(bodyText) {
  const out = {};
  for (const part of bodyText.split(';')) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    const name = part.slice(0, at).trim();
    if (name !== '') out[name] = part.slice(at + 1).trim();
  }
  return out;
}

/**
 * Every rule in a stylesheet, flattened, with `@media` blocks opened up.
 *
 * `@keyframes` are skipped whole: a keyframe is not a rule about an element, and its `opacity` is a
 * moment of an animation rather than a state an element is in.
 */
function rulesOf(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(bare)) !== null) {
    const selector = match[1].trim();
    if (/^@(media|-webkit-media)/.test(selector)) {
      // The condition is dropped and its rules are read as ordinary ones: every override the page
      // makes for a short window makes its type *smaller*, and the smallest size is the one the bar
      // has to be chosen against, so flattening is the pessimistic reading and the right one.
      out.push(...rulesOf(match[2]));
      continue;
    }
    if (/^@/.test(selector)) continue;
    for (const one of selector.split(',')) {
      out.push({ selector: one.trim().replace(/\s+/g, ' '), css: declarations(match[2]) });
    }
  }
  return out;
}

/** The size a `font-size` value could come out at, taking the smallest it is ever allowed to be. */
function smallestSize(value) {
  const clamp = /^clamp\(([^)]+)\)$/i.exec(value);
  const candidates = clamp === null ? [value] : clamp[1].split(',');
  let best = Infinity;
  for (const each of candidates) {
    const px = /^\s*([\d.]+)px/.exec(each);
    if (px !== null) best = Math.min(best, Number(px[1]));
  }
  return Number.isFinite(best) ? best : null;
}

/** The two stops of a screen's veil, out of the `radial-gradient` the page gives it. */
function veilOf(value) {
  const stops = [...String(value).matchAll(/(rgba?\([^)]+\))\s+\d+%/g)];
  if (stops.length < 2) return null;
  return { centre: colourValue(stops[0][1]), edge: colourValue(stops[1][1]) };
}

/** The page's own stylesheet, read out of `index.html`. */
export function readStyleSheet(file = null) {
  const html = readFileSync(file ?? path.resolve(import.meta.dirname, '..', 'index.html'), 'utf8');
  const style = /<style>([\s\S]*?)<\/style>/.exec(html);
  if (style === null) throw new Error('index.html has no <style> block to audit');
  return rulesOf(style[1]);
}

/**
 * The fields a line of page type can sit on, all four parsed out of the page's own CSS.
 *
 * They are near enough to identical to be one field (`test/contrast.test.mjs` holds them together and
 * shouts the day one of them is made a real background), and every page row is measured against the
 * brightest, because light-on-dark type is worst on the brightest field there is.
 */
export function fieldsOf(rules) {
  const veils = {};
  let sky = null;
  for (const rule of rules) {
    if (rule.css.background === undefined) continue;
    if (/gradient/.test(rule.css.background)) {
      const veil = veilOf(rule.css.background);
      if (veil !== null) veils[rule.selector] = veil;
    } else {
      const flat = colourValue(rule.css.background);
      if (rule.selector === 'body') sky = flat;
    }
  }
  if (sky === null) throw new Error('the page has no body background to audit against');

  // The arena's own gradient, at its lightest and with no vignette: what a panel is laid over.
  const skyTop = colourValue(PALETTE.bgTop);
  const skyBottom = colourValue(PALETTE.bgBottom);
  const out = [];
  for (const [name, veil] of Object.entries(veils)) {
    for (const [end, stop] of [['centre', veil.centre], ['edge', veil.edge]]) {
      for (const [where, base] of [['sky top', skyTop], ['sky bottom', skyBottom]]) {
        out.push({ field: name + ' ' + end + ' over ' + where, rgb: over(stop.rgb, stop.alpha, base.rgb) });
      }
    }
  }
  // ...and the bare canvas, with no veil at all, which is what the HUD is drawn over.
  out.push({ field: 'the open sky at its brightest', rgb: skyTop.rgb });
  out.push({ field: 'the open sky at its darkest', rgb: skyBottom.rgb });
  return out;
}

/** The brightest field of the lot: the one every page line is measured on. */
export function brightestField(fields) {
  let best = fields[0];
  for (const each of fields) {
    if (luminance(each.rgb) > luminance(best.rgb)) best = each;
  }
  return best;
}

/** The smallest size any rule in the page sets, used when a rule's own inheritance is ambiguous. */
function smallestDeclaredSize(rules) {
  let best = ROOT_PX;
  for (const rule of rules) {
    const size = rule.css['font-size'] === undefined ? null : smallestSize(rule.css['font-size']);
    if (size !== null) best = Math.min(best, size);
  }
  return best;
}

/**
 * The size a rule's own text is set at, following the page's inheritance the way a browser would.
 *
 * A rule with no `font-size` of its own takes the one on the rule for its parent, which is the
 * selector with one compound fewer: `.entry.unknown .name` asks `.entry.unknown`, then `.entry`. When
 * nothing answers, the element could be under any of a few parents (`.key` sits in a 13px row and in
 * 12px ship rows) and the smallest size in the page is taken, which is the pessimistic answer: a
 * smaller line never earns a looser bar.
 */
function sizeOf(rules, selector) {
  const compounds = selector.split(' ');
  for (let end = compounds.length; end > 0; end--) {
    const wanted = compounds.slice(0, end).join(' ');
    for (const rule of rules) {
      if (rule.selector !== wanted || rule.css['font-size'] === undefined) continue;
      const size = smallestSize(rule.css['font-size']);
      if (size !== null) return size;
    }
  }
  if (/^(html|body)$/.test(selector)) return ROOT_PX;
  return smallestDeclaredSize(rules);
}

/** A row of the audit: one line of type, one field, one measurement. */
function row(where, colour, alpha, field, size, note) {
  const rgb = alpha === 1 ? colour : over(colour, alpha, field.rgb);
  const ratio = contrastRatio(rgb, field.rgb);
  const bar = size >= LARGE_PX ? BARS.large : BARS.body;
  return {
    where,
    colour,
    alpha,
    size,
    bar,
    field,
    ratio,
    step: stepOf(rgb, field.rgb),
    pass: ratio >= bar,
    thin: ratio >= bar && ratio < bar + THIN_MARGIN,
    note: note === undefined ? '' : note,
  };
}

/**
 * Every line of type on the page, measured.
 *
 * One row per `color:` declaration that is not `:root`'s palette or a state the exclusions above
 * name. A rule that sets a colour and is not audited is a bug in this file, and
 * `test/contrast.test.mjs` counts them to make sure it cannot happen quietly.
 */
export function auditPage(htmlFile = null) {
  const rules = readStyleSheet(htmlFile);
  const fields = fieldsOf(rules);
  const field = brightestField(fields);
  const rows = [];
  for (const rule of rules) {
    const colour = rule.css.color;
    if (colour === undefined) continue;
    if (rule.selector === ':root') continue;
    if (/\.screen\.aside/.test(rule.selector)) continue;
    const value = colourValue(colour);
    const dim = rule.css.opacity === undefined ? 1 : Number(rule.css.opacity);
    if (!Number.isFinite(dim)) throw new Error('the page gives ' + rule.selector + ' an opacity nobody can read');
    const size = sizeOf(rules, rule.selector);
    // An element's own opacity dims its text over its own background, which is the field here: the
    // page's veils are what the text is composited against, not what is behind the panel.
    rows.push(row(rule.selector, value.rgb, value.alpha * dim, field, size,
      rule.css['font-weight'] === undefined ? '' : 'weight ' + rule.css['font-weight']));
  }
  return rows.sort((a, b) => a.ratio - b.ratio);
}

/** The lines the page's CSS declares, whether or not they are audited - for the test that counts. */
export function pageColourRules(htmlFile = null) {
  return readStyleSheet(htmlFile).filter((rule) => rule.css.color !== undefined
    && rule.selector !== ':root' && !/\.screen\.aside/.test(rule.selector));
}

// --- the glass ----------------------------------------------------------------
//
// The lines `src/render/` paints. There is no stylesheet to read here, so this is a table, and the
// table's colours are `core/palette.js` entries looked up by name, which is how a palette change is
// measured the day it happens instead of never. The three plates are palette entries too
// (`plate`, `plateDeep`, `chipFace`) for the same reason: a plate copied into a tool is a plate that
// stops being true.
//
// `sky` is the arena with nothing on it, at its brightest; `plate` and the rest are composited over
// it, because a plate is translucent and a translucent colour is not a colour until it has been put
// on the thing behind it (the same rule `tools/sights.js` measures bodies by).

const SKY_FIELD = { field: 'the open sky at its brightest', rgb: colourValue(PALETTE.bgTop).rgb };

/** A field the glass paints over the sky: a plate, a scrim, a card face. */
function glassField(name, colour) {
  const value = colourValue(colour);
  return { field: name, rgb: over(value.rgb, value.alpha, SKY_FIELD.rgb) };
}

const CHIP = glassField("a card's key chip", PALETTE.chipFace);

const FIELDS = {
  sky: SKY_FIELD,
  scrim: glassField('the card scrim', PALETTE.cardScrim),
  card: glassField("a card's face", PALETTE.cardFace),
  chip: CHIP,
  // The chip under a pointer wears a wash of the ship's own cyan over its face (render/cards.js),
  // which is the brightest a card's corner ever gets and so the field its key is measured on.
  chipHot: { field: "a card's key chip, hovered", rgb: over(colourValue(PALETTE.player).rgb, 0.16, CHIP.rgb) },
  plate: glassField('a HUD plate', PALETTE.plate),
  deep: glassField('a deep plate', PALETTE.plateDeep),
};

/**
 * One line the renderer paints.
 *
 * `colour` is read from the palette at call time by name, so nothing in this table is a literal;
 * `alpha` covers the few lines the renderer dims with `withAlpha`, and is measured as painted, not
 * as the palette spells it. `size` is the px the renderer sets, or the smallest it will settle on
 * when the type is fitted to the window (render/fit.js), which is where a card's lines get their
 * number: a narrow window makes a narrow card and a small line, and the bar follows the line.
 */
const GLASS_ROWS = [
  // The card table (render/cards.js), which is the interface the game deals in the middle of a fight.
  ['the level-up heading', 'uiText', 1, 'scrim', 34, 'the `LEVEL 12` over the cards'],
  ['the level-up ask', 'uiDim', 1, 'scrim', 12, '`CHOOSE ONE - 1 2 3 OR CLICK`'],
  ["a card's name", 'uiText', 1, 'card', 8, 'fitted down to 8px on a narrow window'],
  ["a card's effect line", 'xpText', 1, 'card', 8, '`+25% DAMAGE`'],
  ["a card's flavour", 'uiFaint', 1, 'card', 8, 'the paragraph, and the smallest type on a card'],
  ["a card's number key", 'playerLine', 1, 'chipHot', 13, 'the `1` you press'],
  ['a banish tab, cold', 'uiDim', 0.85, 'chip', 13, 'the `SHIF+n` mark before it is pointed at'],
  ['a banish tab, pointed at', 'playerLine', 1, 'chipHot', 13, ''],
  ['the SYNERGY plate', 'burnCore', 0.95, 'chip', 13, ''],
  ['reroll or banish, paid for', 'playerLine', 1, 'card', 13, ''],
  ['reroll or banish, spent', 'uiFaint', 1, 'card', 12, 'drawn so a spent ask is still a fact'],
  ['what the run cut out', 'uiFaint', 1, 'scrim', 8, 'the `CUT OUT OF THE RUN - - -` line'],
  ['what a synergy came from', 'uiFaint', 1, 'card', 8, 'the `BURN 3 + CHILL 3` under a synergy'],

  // The HUD (render/hud.js), over the open arena and on its own two plates.
  ['the score', 'uiText', 1, 'sky', 30, ''],
  ['the best score', 'uiDim', 1, 'sky', 11, ''],
  ['the clock line', 'uiFaint', 1, 'sky', 11, '`TIME 15m02s - LV 12`'],
  ['which gun, and HULL', 'uiDim', 1, 'sky', 11, ''],
  ['the leech meter', 'uiFaint', 1, 'sky', 10, 'the word beside the meter, when none is held'],
  ['the level and XP line', 'xpText', 1, 'sky', 11, ''],
  ['the boss name', 'uiText', 1, 'sky', 11, 'above the bar, and the phase beside it'],
  ['a HUD plate word', 'elite', 1, 'plate', 10, 'the vacuum fanfare, on the meter plate'],

  // The plates that arrive over a run: an award (render/toast.js), the mixer (render/volume.js),
  // and the tutorial's line (render/tutorial.js).
  ['an award plate, its name', 'elite', 1, 'deep', 15, ''],
  ['an award plate, its reason', 'uiDim', 1, 'deep', 8, 'fitted down to 8px when the words are long'],
  ['the mixer, a row just touched', 'uiDim', 1, 'deep', 11, ''],
  ['the mixer, a quiet row', 'uiDim', 0.7, 'deep', 11, 'the dial nobody has moved in the last second'],
  ['the mixer, its key line', 'uiFaint', 0.9, 'deep', 10, ''],
  ['a lesson on the glass', 'uiText', 1, 'deep', 15, 'the tutorial plate'],
];

/** Every glass row, measured. Exported as a function so a test can re-measure after a palette move. */
export function auditGlass() {
  return GLASS_ROWS.map(([where, colourName, alpha, field, size, note]) => {
    if (PALETTE[colourName] === undefined) {
      throw new Error('the glass table names a colour the palette does not have: ' + colourName);
    }
    return Object.assign(row(where, colourValue(PALETTE[colourName]).rgb, alpha, FIELDS[field], size, note),
      // The palette name goes with the row so a test can pin the table to the drawing that uses it
      // (test/contrast.test.mjs) instead of trusting a remembered colour.
      { colourName });
  }).sort((a, b) => a.ratio - b.ratio);
}

/** Every field the glass can write on, for a report that wants to print them. */
export function glassFields() {
  return Object.values(FIELDS);
}

/** Both halves at once, worst first, with the failures counted. */
export function audit(htmlFile = null) {
  const page = auditPage(htmlFile);
  const glass = auditGlass();
  const all = page.concat(glass);
  return {
    page,
    glass,
    all,
    failures: all.filter((each) => !each.pass),
    thin: all.filter((each) => each.thin),
  };
}

/** The `rgba(...)` a plate is spelled as, for the report to print beside a row. */
export function plateOf(name) {
  return withAlpha(PALETTE[name], colourValue(PALETTE[name]).alpha);
}

/** `#rrggbb` for a triple, because a report that prints `[ 111, 143, 176 ]` is read by nobody. */
export function hexOf(rgb) {
  return '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
}


