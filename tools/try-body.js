#!/usr/bin/env node
// Judge a proposed crowd body with the gates the game actually ships.
//
//   node tools/try-body.js draft.mjs
//
// A draft file exports `drafts`: bodies redrawn and/or recoloured, and nothing else. Every one is
// measured against the crowd as it ships - the other eight bodies, the whole palette, every promise
// the audit makes - so a line here says what `palette-check --strict` and `test/crowd-art.test.mjs`
// will say once the change is committed, in about a tenth of the time it takes to find out by hand:
//
//     import { bulged } from '../src/render/shapes.js';
//     export const drafts = [{
//       label: 'faces bowed to 0.85',
//       drifter: { shape: bulged(3, 1.0, 0.85) },
//     }, {
//       label: 'and a deeper colour to pay for it',
//       drifter: { shape: bulged(3, 1.0, 0.85), colour: '#6f4fe8', fill: 'rgba(111,79,232,0.26)' },
//     }];
//
// One entry per draft, keyed by the kind it changes. A change is any of `shape` (written with the
// builders in `src/render/shapes.js`, in the same words the shipped table is written in), `colour`,
// `fill` and `covers`. `label` is what the report calls the draft by.
//
// ### What is judged
//
// A body is not judged for being pretty. It is judged for whether the frame can still say what it
// is, which the palette audit has always said in three parts - outline, size, colour - plus one the
// hurtbox ruler says:
//
//   **Outline.** How far one body's edge stands from another's, at the kindest turn. Under four px
//   everywhere and the two bodies are one shape, and the list of which ones are is the crowd's
//   written-down debt: `test/crowd-art.test.mjs` holds it, pair by pair, and it is the first thing a
//   shape change moves.
//   Only the pairs that are within `THIN_SHAPE_PX` of each other on one side of the change or the
//   other are printed: those are the ones a shape change can put into the debt or take out of it, and
//   a pair that parts by a centimetre either way was never what a draft is argued about.
//
//   **Colour.** Steps of colour for the eye that has the least to work with, which is what pays for a
//   shared outline. A shared outline paid for by neither colour nor size is one body pretending to be
//   two, and that is a hard failure.
//
//   **Size.** Which a draft cannot change - `BALANCE.kinds.*.radius` is what the simulation hurts you
//   by, and a drawing does not get to move it - so it is printed and never judged.
//
//   **Its own hurtbox.** How much of the circle that hurts you the drawing fills, and how far past it
//   it reaches. A draft may not leave a body thinner than the one it replaces unless it moves that
//   body's bar in the same breath (`covers`), and it may not reach further out than the crowd's
//   longest nose. It may move a colour's lightness wherever it likes: that axis is the palette's to
//   spend, and a drafter who dislikes a colour is arguing with the palette and not with this ruler.
//
// ### The bars, which are the shipped ones
//
// Nothing in this file is a bar. `ONE_SHAPE_PX` and `THIN_SHAPE_PX` come from `tools/shape-lab.js`,
// the colour promises and the crowded list from `tools/sights.js`, the per-kind coverage bar from the
// COVERS table the test reads, and the ceiling on a nose is measured off the crowd. A tool with bars
// of its own is a tool that passes a draft the gates then refuse.
//
// ### Reading the report
//
// One section per draft; inside it, one block per body it changes with the shipped numbers and the
// drafted ones in the same columns, then the pairs that could be one shape either side of the
// change, then a FAIL line per thing that would not ship, then the crowd's three lists - one shape,
// thin outline only, one colour - counted against the shipped crowd, with every pair that changed
// hands named next to what it now stands on. The verdict is PASS or FAIL, and the command exits
// non-zero when none of the drafts in the files would ship - so a sweep that found nothing is a red
// exit as well as a red screen.

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BALANCE } from '../src/game/balance.js';
import { parseColor } from '../src/core/palette.js';
import { CROWD_SHAPES } from '../src/render/shapes.js';
import {
  crowdBodies, hurtboxFit, inscribedShare, COVERS, longestNose, noseCeiling, NOSE_HEADROOM_R,
  THIN_SHAPE_PX,
} from './shape-lab.js';
import {
  SIGHTS, auditSights, auditSky, auditMarks, crowdedColours, measure, promised, sharedSilhouettes,
  silhouettePairs,
} from './sights.js';
import { oklab, separation } from './colour-lab.js';

/** A draft that does not make sense. The CLI answers one of these in a line, not a stack. */
export class DraftError extends Error {}

/**
 * What a draft would have to improve to pass, and the line each one prints.
 *
 *   `one shape`  a pair of bodies is drawn as one shape and neither colour nor size pays for it;
 *   `promise`    a pair the palette promises something about is under its bar;
 *   `sky`        a colour or a wash is too near the sky to be seen on it;
 *   `less`       the drawing would cover less of its own hurtbox than the body it replaces;
 *   `bar`        the drawing is under the share its kind is held to;
 *   `nose`       the drawing would reach further out than the crowd's longest nose;
 *   `marks`      the MARKS row, measured the way `palette-check.js` measures it.
 */
const WHAT_A_DRAFT_MUST_IMPROVE = {
  'one shape': 'is drawn as one shape with another body and pays for it with neither colour nor size',
  promise: 'is under what the palette promises about it',
  sky: 'is too near the sky to be seen on it',
  less: 'covers less of its own hurtbox than the body it replaces',
  bar: 'is under the share of its hurtbox its kind is held to',
  nose: 'reaches past the longest nose the crowd wears',
  marks: 'is under its bar with the MARKS row painted over it',
};

/** A draft may change these, and nothing else. */
const FIELDS = ['shape', 'colour', 'fill', 'covers'];

// ---------------------------------------------------------------------------------------------
// the shipped crowd, and putting it back
//
// The tool works by writing into the tables the shipped rulers read - `CROWD_SHAPES`,
// `BALANCE.kinds`, and the crowd's rows in `SIGHTS`, which copied the palette at import - and then
// putting every one of them back. That is the only way a draft gets measured by `silhouettePairs`
// and `auditSights` themselves rather than by a copy of their arithmetic that somebody keeps in a
// scratch file and forgets to update.
// ---------------------------------------------------------------------------------------------

const SHIPPED_SHAPES = { ...CROWD_SHAPES };
const SHIPPED_SIGHTS = SIGHTS.map((s) => ({ sight: s, colour: s.colour, fill: s.fill }));
const SHIPPED_KINDS = new Map(Object.entries(BALANCE.kinds)
  .map(([kind, stats]) => [kind, { color: stats.color, fill: stats.fill }]));

/** Every kind a draft may change: the crowd, because a shape needs a body to be drawn on. */
export const DRAFTABLE = Object.keys(BALANCE.kinds);

/** Put every table back the way it shipped, so each draft is measured against the real crowd. */
export function reset() {
  for (const [kind, shape] of Object.entries(SHIPPED_SHAPES)) CROWD_SHAPES[kind] = shape;
  for (const saved of SHIPPED_SIGHTS) {
    saved.sight.colour = saved.colour;
    saved.sight.fill = saved.fill;
  }
  for (const [kind, stats] of SHIPPED_KINDS) {
    BALANCE.kinds[kind].color = stats.color;
    BALANCE.kinds[kind].fill = stats.fill;
  }
}

const FIELD_OF_BALANCE = { colour: 'color', fill: 'fill' };

/**
 * One change of one kind, written into the shipped tables.
 *
 * A colour goes everywhere the audit and the frame read it: the balance sheet, which is what the
 * renderer paints from and spells it `color`, and the sight row, which spells it `colour` and copied
 * the palette at import and would otherwise keep measuring the old one. Missing either half is the
 * bug every scratch version of this tool had to work around - the report says one thing, the frame
 * draws another, and the tests disagree with both.
 *
 * `colour` and `fill` stay separate because `PALETTE` keeps them separate - a draft that recolours a
 * body and says nothing about its wash is drawing a body in one colour and a halo in another, which
 * is a thing to check and not a thing to assume.
 */
export function applyChange(kind, change) {
  if (!DRAFTABLE.includes(kind)) {
    throw new DraftError('no crowd body is called ' + kind + '; a draft may change '
      + DRAFTABLE.join(', '));
  }
  if (change.shape !== undefined) {
    if (typeof change.shape !== 'function') {
      throw new DraftError(kind + "'s shape is not a shape: a draft writes one with the builders in"
        + ' src/render/shapes.js - plainPolygon, bulged, lens, studded, lobed, flanks');
    }
    CROWD_SHAPES[kind] = change.shape;
  }
  for (const field of ['colour', 'fill']) {
    if (change[field] === undefined) continue;
    try {
      parseColor(change[field]);
    } catch (error) {
      throw new DraftError(kind + "'s " + field + ' is not a colour the game can paint: '
        + error.message);
    }
    BALANCE.kinds[kind][FIELD_OF_BALANCE[field]] = change[field];
    SIGHTS.find((sight) => sight.id === kind)[field] = change[field];
  }
}

/** The kinds a draft touches, in the order the crowd is listed. */
export function kindsOf(draft) {
  return DRAFTABLE.filter((kind) => draft[kind] !== undefined);
}

function validateChange(kind, change, where) {
  if (change === null || typeof change !== 'object') {
    throw new DraftError(where + ' says ' + kind + ' is ' + JSON.stringify(change)
      + ', and a change is { shape, colour, fill, covers }');
  }
  for (const field of Object.keys(change)) {
    if (!FIELDS.includes(field)) {
      throw new DraftError(where + ' asks to change the ' + kind + "'s " + field
        + ', which a draft may not; it may change ' + FIELDS.join(', '));
    }
  }
  if (change.covers !== undefined && !(change.covers >= 0 && change.covers <= 1)) {
    throw new DraftError(where + ' gives the ' + kind + "'s covers as " + change.covers
      + ', which is a share of the hurtbox between 0 and 1');
  }
}

function validateDraft(draft, where) {
  if (draft === null || typeof draft !== 'object' || Array.isArray(draft)) {
    throw new DraftError(where + ' is not a draft: it is a '
      + (Array.isArray(draft) ? 'array' : typeof draft));
  }
  const kinds = kindsOf(draft);
  for (const key of Object.keys(draft)) {
    if (key !== 'label' && !kinds.includes(key)) {
      throw new DraftError(where + ' talks about ' + key + ', which is not a crowd body and is not'
        + ' `label`; the crowd is ' + DRAFTABLE.join(', '));
    }
  }
  if (kinds.length === 0) {
    throw new DraftError(where + ' changes no body the crowd has; a draft is `{ label,'
      + ' ' + DRAFTABLE[0] + ': { shape } }` and the key is a kind name');
  }
  for (const kind of kinds) {
    validateChange(kind, draft[kind], where);
    if (Object.keys(draft[kind]).length === 0) {
      throw new DraftError(where + ' says the ' + kind + ' changes nothing; the crowd as it ships is'
        + ' already measured by tools/shape-lab.js and tools/palette-check.js');
    }
    applyChange(kind, draft[kind]);
  }
  reset();
}

/**
 * Read a draft file: it must export `drafts`, a list, and every draft in it is applied and put back
 * before anything is measured - so a typo is answered in one line about the file instead of in a
 * stack about the ruler, and a sweep of forty rows fails on the first bad row rather than printing
 * thirty-nine and then lying.
 */
export async function readDraftFile(file) {
  let module;
  try {
    module = await import(pathToFileURL(path.resolve(file)).href);
  } catch (error) {
    throw new DraftError(file + ' could not be loaded: ' + error.message);
  }
  if (module.drafts === undefined) {
    throw new DraftError(file + ' exports no `drafts`; a draft file is'
      + ' `export const drafts = [{ label, drifter: { shape } }]`');
  }
  if (!Array.isArray(module.drafts)) {
    throw new DraftError(file + ' exports `drafts` as ' + typeof module.drafts
      + '; it has to be a list of drafts');
  }
  if (module.drafts.length === 0) throw new DraftError(file + ' exports an empty list of drafts');
  module.drafts.forEach((draft, i) => validateDraft(draft, file + ' draft ' + (i + 1)));
  return module.drafts;
}

// ---------------------------------------------------------------------------------------------
// measuring
// ---------------------------------------------------------------------------------------------

/** One crowd body as it now stands: what it covers, how far it reaches, and what it is hurt by. */
function fitOf(shape, r) {
  const fit = hurtboxFit(shape, r);
  return { covered: fit.covered, reachOverR: fit.reachOverR, r, encloses: inscribedShare(shape, r) };
}

function crowdFits() {
  return new Map(crowdBodies().map((body) => [body.type, fitOf(body.shape, body.r)]));
}

const lightnessOf = (id) => oklab(measure(SIGHTS.find((s) => s.id === id)).rgb).L;
const washLightnessOf = (id) => {
  const m = measure(SIGHTS.find((s) => s.id === id));
  return m.fillLab === undefined ? undefined : m.fillLab.L;
};

/** How a pair is called in the report: `a / b`, in crowd order. */
const nameOf = (row) => row.a + ' / ' + row.b;

/**
 * Steps of colour between two bodies for an eye with all its cones - what `crowdedColours()` counts.
 *
 * Needed for a pair that *left* that list, whose number is by definition no longer in it, so the
 * ruler is asked directly rather than the list being widened to fit.
 */
function colourSteps(name) {
  const [a, b] = name.split(' / ');
  const sight = (id) => SIGHTS.find((each) => each.id === id);
  return separation('normal', measure(sight(a)).lab, measure(sight(b)).lab).ratio;
}

/**
 * A crowd, measured: every pair of bodies, what each body covers, and what each body's colours are.
 *
 * The shipped crowd and a drafted one are the same shape here, which is what lets the report put
 * their numbers in the same columns and call the difference a finding.
 *
 * The three lists are the crowd's written-down debt - which pairs are one shape, which are one
 * colour, which are told apart by a thin outline and nothing else - read off the shipped rulers and
 * the shipped `carriedBy`, so a draft that moves a pair is measured by the same code that will hold
 * it once it ships. The thin one is `test/crowd-art.test.mjs`'s `thinly` list (a pair the outline
 * tells apart by less than six px and by nothing else), not the wider 4-6 px band the ruler also
 * reports: the debt is who has nothing else, not who is a little close.
 */
function measureCrowd() {
  const pairs = silhouettePairs();
  return {
    pairs,
    rows: new Map(pairs.map((row) => [nameOf(row), row])),
    shared: sharedSilhouettes().map(nameOf),
    thin: pairs.filter((row) => row.carriedBy === 'thinly').map(nameOf),
    crowded: crowdedColours().map((row) => row.name),
    fits: crowdFits(),
    ceiling: noseCeiling(),
    nose: longestNose(),
    lightness: new Map(DRAFTABLE.map((kind) => [kind, lightnessOf(kind)])),
    wash: new Map(DRAFTABLE.map((kind) => [kind, washLightnessOf(kind)])),
  };
}

/** The crowd as it ships, measured, for the deltas. */
export function shipped() {
  reset();
  return measureCrowd();
}

/**
 * The shipped gates, run over the tables as they now stand.
 *
 * This is `palette-check --strict`'s arithmetic and nothing else - the same five calls on the same
 * tables, not a copy of its reasoning - so a PASS here and a red `--strict` there cannot disagree
 * about a change that is actually committed.
 */
export function gatesNow() {
  return {
    pairs: promised(auditSights(SIGHTS)).filter((pair) => !pair.pass),
    unpaid: silhouettePairs().filter((pair) => !pair.carries),
    sky: auditSky(SIGHTS).filter((row) => row.worst.ratio < row.need),
    marks: auditMarks(SIGHTS).flatMap((one) => one.failures),
  };
}

// ---------------------------------------------------------------------------------------------
// the verdict
// ---------------------------------------------------------------------------------------------

/**
 * Every reason this draft would not ship, complete on purpose.
 *
 * A sweep that reports one failure per draft teaches a drafter to fix one thing, re-run, and find
 * the next, which is how a session spends an hour on a change that had four problems at once.
 */
export function reasonsAgainst(draft, crowd, gate, base) {
  const reasons = [];
  for (const pair of gate.unpaid) {
    reasons.push({ why: 'one shape', about: nameOf(pair) });
  }
  for (const pair of gate.pairs) {
    reasons.push({ why: 'promise', about: pair.a.id + ' / ' + pair.b.id });
  }
  for (const row of gate.sky) reasons.push({ why: 'sky', about: row.sight.id + ' ' + row.part });
  for (const one of gate.marks) {
    reasons.push({ why: 'marks', about: one.a.id + ' / ' + one.b.id });
  }
  for (const kind of kindsOf(draft)) {
    const now = crowd.fits.get(kind);
    const was = base.fits.get(kind);
    const change = draft[kind];
    const bar = barOf(kind, change);
    const asked = change.covers !== undefined;
    if (now.covered < bar - 1e-9) {
      reasons.push({ why: 'bar', about: kind,
        says: coverageWords('bar', kind, now, bar, asked) });
    } else if (!asked && now.covered < was.covered - 1e-9) {
      reasons.push({ why: 'less', about: kind,
        says: coverageWords('less', kind, now, was.covered) });
    }
    if (now.reachOverR > base.ceiling + 1e-9) {
      reasons.push({ why: 'nose', about: kind, says: kind + ' reaches ' + now.reachOverR.toFixed(2)
        + 'r past its own hurtbox and the crowd lets a body reach ' + base.ceiling
        + 'r: the rest of that nose is shots that looked like they landed' });
    }
  }
  return reasons;
}

const pct = (x) => (x * 100).toFixed(0) + '%';

/** The bar a draft holds a body to: the one the crowd ships with, or the one the draft asks for. */
function barOf(kind, change) {
  return change.covers === undefined ? COVERS[kind] : change.covers;
}

/**
 * What a coverage failure means, in the sentence the report prints.
 *
 * There are two, and they are different arguments. `bar` is the cheap one: the drawing is under the
 * share its kind is held to in COVERS. `less` is the one that used to be invisible: every number in
 * COVERS was read off the body that shipped, so a draft could - and this is what a shape draft is
 * for - draw a body *thinner* than that and be told it passed. A bar that cannot go red is not a
 * gate, so a draft that gives ground up fails, and the way to say "I meant to" is `covers: 0.62` on
 * the draft, which is one line next to the shape's own argument in `src/render/shapes.js`.
 */
function coverageWords(why, kind, now, bar, asked) {
  if (why === 'bar') {
    return kind + ' covers ' + pct(now.covered) + ' of the circle that hurts it and its bar is '
      + pct(bar) + (asked ? ' (the bar this draft asked for)' : '')
      + ' - shots that land visibly would miss it';
  }
  return kind + ' covers ' + pct(now.covered) + ' and the body it replaces covers ' + pct(bar)
    + ': it gives ground up, and a bar comes down only with an argument - write `covers '
    + now.covered.toFixed(2) + '` on the draft to try one';
}

function detailOf(reason) {
  return reason.says === undefined
    ? reason.about + ' ' + WHAT_A_DRAFT_MUST_IMPROVE[reason.why]
    : reason.says;
}

// ---------------------------------------------------------------------------------------------
// printing
// ---------------------------------------------------------------------------------------------

const COL = { covers: 7, reach: 8, light: 9, wash: 8 };

function numberRow(words, fit, lightness, wash) {
  return '    ' + words.padEnd(12)
    + pct(fit.covered).padStart(COL.covers)
    + (fit.reachOverR.toFixed(2) + 'r').padStart(COL.reach)
    + lightness.toFixed(3).padStart(COL.light)
    + (wash === undefined ? '-' : wash.toFixed(3)).padStart(COL.wash);
}

function numberHead() {
  return '    ' + ' '.repeat(12) + 'covers'.padStart(COL.covers) + 'reaches'.padStart(COL.reach)
    + 'colour'.padStart(COL.light) + 'wash'.padStart(COL.wash);
}

function pairLine(row, was) {
  return '      ' + (row.a + ' / ' + row.b).padEnd(22)
    + row.gap.toFixed(1).padStart(4) + ' px'
    + (was === undefined ? '' : ' (was ' + was.gap.toFixed(1) + ')').padStart(12)
    + '   size ' + row.sizeRatio.toFixed(2) + 'x'
    + '   colour ' + row.colour.toFixed(2) + ' on ' + row.eyes.toLowerCase()
    + '   - carried by ' + row.carriedBy;
}

/**
 * The pairs this draft could put into the crowd's debt, or take out of it.
 *
 * Within `THIN_SHAPE_PX` on one side of the change or the other is the rule, and it is the question
 * the drafter is asking rather than the whole 36-row table: a pair that parts by a centimetre on
 * both sides is not what a shape change is argued about. Both sides are printed together, because
 * the finding in a sweep is as often a pair *leaving* the list as one joining it - the fuller darter
 * stood 5.8 px from a swarmling and that pair left for nothing (session 143), and a report that
 * printed only the joiners hid it.
 */
function printPairs(kind, crowd, base, out) {
  const was = new Map(base.pairs.map((row) => [row.a + '/' + row.b, row]));
  const rows = crowd.pairs
    .filter((row) => row.a === kind || row.b === kind)
    .filter((row) => row.gap <= THIN_SHAPE_PX || was.get(row.a + '/' + row.b).gap <= THIN_SHAPE_PX)
    .sort((x, y) => x.gap - y.gap);
  if (rows.length === 0) return;
  out.push('    what it is one shape with, or nearly, either side of this:');
  for (const row of rows) out.push(pairLine(row, was.get(row.a + '/' + row.b)));
}

/**
 * The crowd's three written-down lists, and what this draft moved between them.
 *
 * This is the finding a shape or a colour visit is really about, and it is not a failure: the crowd
 * going from eight pairs drawn as one shape to eleven (session 143) shipped, because every new one
 * was paid for in colour. A verdict of PASS with no number attached hides exactly that, so the
 * counts are printed every time and any pair that changed hands is named with what it now stands on.
 */
function printLists(crowd, base, out) {
  out.push('  the crowd as this draft leaves it: ' + crowd.shared.length
    + ' pairs share an outline (ships with ' + base.shared.length + '), ' + crowd.thin.length
    + ' are told apart by a thin outline and nothing else (ships with ' + base.thin.length + '), '
    + crowd.crowded.length + ' stand under a step of colour (ships with '
    + base.crowded.length + ')');
  const moves = [];
  const record = (key, join, leave, words) => {
    const now = new Set(crowd[key]);
    const was = new Set(base[key]);
    for (const name of crowd[key]) {
      if (!was.has(name)) moves.push('+ ' + name + ' ' + join + ' - ' + words(name, crowd));
    }
    for (const name of base[key]) {
      if (!now.has(name)) moves.push('- ' + name + ' ' + leave + ' - ' + words(name, crowd));
    }
  };
  record('shared', 'is one shape with it now', 'is not one shape with it any more', outlineWords);
  record('thin', 'is on a thin outline and nothing else now', 'has more than an outline to it again',
    outlineWords);
  record('crowded', 'is under a step of colour now', 'is a step of colour clear again',
    (name) => colourSteps(name).toFixed(2) + ' of a step for an eye with all its cones');
  out.push(moves.length === 0 ? '    nothing changed hands between the three lists'
    : moves.map((line) => '    ' + line).join('\n'));
}

/** What a pair that joined or left a shape list now stands on: outline, and what carries the pair. */
function outlineWords(name, crowd) {
  const row = crowd.rows.get(name);
  return row.gap.toFixed(1) + ' px of outline, carried by ' + row.carriedBy;
}

function printBody(kind, draft, crowd, base, reasons, out) {
  const now = crowd.fits.get(kind);
  const was = base.fits.get(kind);
  out.push('  ' + kind + ', drawn at ' + now.r + ' px, which is the circle that hurts you:');
  out.push(numberHead());
  out.push(numberRow('ships now', was, base.lightness.get(kind), base.wash.get(kind)));
  out.push(numberRow('as drafted', now, crowd.lightness.get(kind), crowd.wash.get(kind)));
  out.push('    its bar is ' + pct(COVERS[kind]) + ' of the circle and it may reach '
    + base.ceiling + 'r out, which is the crowd' + "'s" + ' longest nose ('
    + base.nose.toFixed(2) + 'r) with ' + NOSE_HEADROOM_R + 'r of room');
  if (draft[kind].covers !== undefined && draft[kind].covers !== COVERS[kind]) {
    out.push('    this draft moves the bar to ' + pct(draft[kind].covers) + ' from '
      + pct(COVERS[kind]) + ': that has to land in tools/shape-lab.js COVERS with the reason'
      + ' written where the shape is, in src/render/shapes.js, or it is not shipped');
  }
  out.push('    its outline encloses ' + pct(now.encloses)
    + ' of the circle: the part no shot can stop in, whatever a bar says');
  for (const reason of reasons.filter((r) => r.about === kind)) {
    out.push('    FAIL - ' + detailOf(reason));
  }
  printPairs(kind, crowd, base, out);
}

/** The crowd as a draft leaves it, measured, with the gates run over it. */
function draftedCrowd(draft) {
  reset();
  for (const kind of kindsOf(draft)) applyChange(kind, draft[kind]);
  return measureCrowd();
}

/**
 * Everything one draft is worth knowing, in one call: what it changes, how the crowd came out, what
 * the gates said, and every reason it would not ship.
 *
 * `base` is the crowd it is measured against, which the CLI measures once per file because a sweep of
 * forty drafts asking for the shipped crowd forty times is forty times the work for one answer.
 */
export function inspect(draft, base = shipped()) {
  const crowd = draftedCrowd(draft);
  const gate = gatesNow();
  const kinds = kindsOf(draft);
  const reasons = reasonsAgainst(draft, crowd, gate, base);
  return {
    draft, kinds, crowd, gate, reasons, base,
    label: draft.label === undefined
      ? kinds.map((kind) => kind + ' changed').join(' and ') : draft.label,
    passes: reasons.length === 0,
  };
}

/** Judge and print one draft. Returns whether it would ship as drawn. */
export function reportDraft(draft, base, out) {
  const seen = inspect(draft, base);
  out.push('DRAFT: ' + seen.label + ' - ' + (seen.passes ? 'PASS' : 'FAIL'));
  for (const kind of seen.kinds) {
    printBody(kind, draft, seen.crowd, base, seen.reasons, out);
  }
  for (const reason of seen.reasons.filter((r) => !seen.kinds.includes(r.about))) {
    out.push('  FAIL - ' + detailOf(reason));
  }
  printLists(seen.crowd, base, out);
  out.push('');
  return seen.passes;
}

const USAGE = `node tools/try-body.js draft.mjs [more.mjs...]   judge a body you have not drawn yet
node tools/try-body.js --help

A draft file exports \`drafts\`: proposals, one key per crowd body each changes -
\`{ label, drifter: { shape: bulged(3, 1.0, 0.85), colour: '#6f4fe8' } }\`. A shape is written with
the shipped builders in src/render/shapes.js. Exits non-zero when none of the drafts would pass the
shipped gates.`;

export function readArgs(argv) {
  const files = [];
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') return { help: true, files };
    if (arg.startsWith('-')) throw new DraftError('try-body does not know the option ' + arg);
    files.push(arg);
  }
  return { help: false, files };
}

async function main(argv) {
  let opts;
  try {
    opts = readArgs(argv);
  } catch (error) {
    process.stderr.write('try-body: ' + error.message + '\n');
    return 2;
  }
  if (opts.help) {
    process.stdout.write(USAGE + '\n');
    return 0;
  }
  if (opts.files.length === 0) {
    process.stderr.write('try-body: nothing to judge.\n\n' + USAGE + '\n');
    return 2;
  }
  let anyPassed = false;
  for (const file of opts.files) {
    let drafts;
    try {
      drafts = await readDraftFile(file);
    } catch (error) {
      process.stderr.write('try-body: ' + error.message + '\n');
      return 2;
    }
    const base = shipped();
    const out = [];
    let passed = 0;
    for (const draft of drafts) if (reportDraft(draft, base, out)) passed++;
    process.stdout.write(out.join('\n'));
    process.stdout.write(passed + ' of ' + drafts.length
      + (drafts.length === 1 ? ' draft would ship as drawn.' : ' drafts would ship as drawn.')
      + '\n');
    if (passed > 0) anyPassed = true;
  }
  reset();
  return anyPassed ? 0 : 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) process.exitCode = await main(process.argv.slice(2));
