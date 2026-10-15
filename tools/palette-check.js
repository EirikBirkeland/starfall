#!/usr/bin/env node
// Can the eye be told what is about to hurt it? The palette, measured.
//
//   node tools/palette-check.js              the report
//   node tools/palette-check.js --all        every pair, not only the tight ones
//   node tools/palette-check.js --strict     and exit non-zero if a pair is under its bar or
//                                            a shared silhouette is paid for by neither size
//                                            nor colour
//   node tools/palette-check.js --only shard every sight whose id or meaning says the word
//
// Why this exists: the game has one colour rule (PLAN section 4 - warm means harm, cool means
// help) and that rule is a promise about hue, made to eyes a tenth of which do not have the hue
// the promise is made on. Nobody can keep a promise they cannot check, and "the enemy kinds are
// all quite red, aren't they" is not a check. So this measures it.
//
// `tools/sights.js` is the question (what the player has to tell apart, what each one means, and
// what shape and size it is painted at) and `tools/colour-lab.js` is the ruler (Oklab, and what
// survives losing a cone). Everything here is those two, printed. The same two are read by
// `test/palette-read.test.mjs`, which holds the promises in the same words - so the report cannot
// say one thing and the tests another, because they run the same function on the same table.
//
// What a number here means, once: `1` is "one axis, by an amount chosen to be visible on a small
// body moving fast over a busy sky" - well above what a careful viewer squinting at a swatch needs.
// Under `1` on the red-green eyes is "there is a difference to see, but it is not one you get for
// free". See the STEP table at the bottom of tools/colour-lab.js for the size of a step, and the
// long note at the top of tools/sights.js for why the greyscale eye is promised less than the others.

import { PALETTE } from '../src/core/palette.js';
import { oklch, lightnessStar, STEP_OF } from './colour-lab.js';
import {
  SIGHTS, SKY, auditSights, auditSky, auditMarks, markNames, measure, visionName, promised,
  sharedSilhouettes, shipBorrowers, marginOf as margin,
} from './sights.js';

function readArgs(argv) {
  const opts = { all: false, strict: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') opts.all = true;
    else if (arg === '--strict') opts.strict = true;
    else if (arg.startsWith('--only=')) opts.only = arg.slice('--only='.length);
    else if (arg === '--only') {
      i++;
      opts.only = argv[i];
    } else {
      process.stderr.write('palette-check: I do not know the option ' + arg + '\n');
      process.exit(2);
    }
  }
  return opts;
}

const pad = (text, width) => String(text).padEnd(width);
const num = (value, digits) => value.toFixed(digits);

function head(title) {
  process.stdout.write('\n' + title + '\n' + '='.repeat(title.length) + '\n\n');
}

function reportSights(sights) {
  head('What the eye is handed');
  const sky = oklch(SKY);
  process.stdout.write('  the sky behind it all is ' + PALETTE.bgMiddle
    + ' (L ' + num(sky.L, 3) + ', L* ' + num(lightnessStar(SKY), 1) + ')\n\n');
  process.stdout.write('  ' + pad('SIGHT', 22) + pad('MEANING', 8) + pad('FORM', 10)
    + pad('PX', 5) + pad('L', 7) + pad('C', 7) + pad('HUE', 6) + 'COLOUR\n');
  for (const sight of sights) {
    const m = measure(sight);
    const lch = oklch(m.rgb);
    // The colour column names the palette entry, and the L/C/H beside it are what an eye is handed -
    // which for the two energy walls is not the same thing, because they are painted translucent and
    // the number is read after the colour has been laid on the sky. Say so on the row rather than
    // leaving a near-white hex next to a mid-grey measurement.
    const painted = sight.alpha === undefined
      ? sight.colour
      : sight.colour + ' at ' + sight.alpha + ' on the sky';
    process.stdout.write('  ' + pad(sight.id, 22) + pad(sight.meaning, 8) + pad(sight.form, 10)
      + pad(num(sight.size, 1), 5) + pad(num(lch.L, 3), 7) + pad(num(lch.C, 3), 7)
      + pad(num(lch.h, 0), 6) + painted + '\n');
  }
}

function reportPairs(pairs, opts) {
  head('Can one be told from the other');
  const sorted = promised(pairs).slice().sort((x, y) => margin(x) - margin(y));
  const failing = sorted.filter((p) => !p.pass);
  const shown = opts.all ? sorted : sorted.filter((p) => margin(p) < 0.45);
  process.stdout.write('  a pair PASSES when the eye that has the least to work with, and the eye with no');
  process.stdout.write(' hue at all, both reach what the pair was asked to show\n');
  process.stdout.write('  (a step is L ' + STEP_OF.L + ', a ' + STEP_OF.a + ', b ' + STEP_OF.b
    + '; the eye named is the one that had the least to work with)\n\n');
  if (shown.length === 0) {
    process.stdout.write('  nothing within 0.45 of its bar. Ask for --all to see every pair.\n');
  }
  for (const pair of shown) {
    const flag = pair.pass ? 'ok  ' : 'FAIL';
    process.stdout.write('  ' + flag + ' ' + pad(pair.a.id + ' / ' + pair.b.id, 26)
      + 'red-green ' + pad(num(pair.redGreen.ratio, 2), 7)
      + 'on ' + pad(visionName(pair.redGreen.vision).toLowerCase(), 16)
      + 'no hue ' + pad(num(pair.hueless.ratio, 2), 6)
      + 'asked ' + num(pair.need.redGreen, 2) + '/' + num(pair.need.hueless, 2)
      + '  ' + pair.need.why + '\n');
  }
  process.stdout.write('\n  ' + failing.length + ' of ' + sorted.length
    + ' promised pairs under their bar');
  if (failing.length > 0) {
    process.stdout.write(': ' + failing.map((p) => p.a.id + '/' + p.b.id).join(', '));
  }
  process.stdout.write('\n');
}

/**
 * A pair with no harm in it is printed and not judged: the crowd is allowed to be a crowd.
 * The note at the top of tools/sights.js says why that is the honest line to draw.
 */
function reportReported(pairs, opts) {
  head('The pairs with nothing at stake (shown, not promised)');
  const list = pairs.filter((p) => !p.promised).sort((x, y) => x.redGreen.ratio - y.redGreen.ratio);
  const shown = opts.all ? list : list.slice(0, 14);
  process.stdout.write('  In none of these pairs can one of them hurt you while the other helps, so the\n');
  process.stdout.write('  palette is promised nothing about them: telling two harms apart is shape, size\n');
  process.stdout.write('  and motion\'s job as much as colour\'s. A number here near zero says two things\n');
  process.stdout.write('  are one colour to some eye - worth a look, not a failure.\n\n');
  for (const pair of shown) {
    process.stdout.write('       ' + pad(pair.a.id + ' / ' + pair.b.id, 26)
      + 'red-green ' + pad(num(pair.redGreen.ratio, 2), 7)
      + 'on ' + pad(visionName(pair.redGreen.vision).toLowerCase(), 16)
      + 'no hue ' + num(pair.hueless.ratio, 2) + '\n');
  }
  if (!opts.all && list.length > shown.length) {
    process.stdout.write('  ... and ' + (list.length - shown.length)
      + ' more. Ask for --all to see all of them.\n');
  }
}

/**
 * Which bodies are drawn the same shape (tools/sights.js, `sharedSilhouettes`).
 *
 * The colour report judges pairs; this one asks the other half of PLAN section 4's sentence -
 * "by brightness and shape as well as hue" - and says which bodies the crowd asks the eye to
 * tell apart with colour and size alone. A shared silhouette is a choice the game is allowed to
 * make; a shared silhouette paid for by neither size nor colour is one body pretending to be two,
 * and that is what `--strict` fails on.
 */
/** What a pair that shares a silhouette has left to carry the difference, as the report says it. */
const CARRIED_BY = {
  both: 'both of them carry it',
  colour: 'colour carries it',
  size: 'size carries it',
  nothing: 'NEITHER of them carries it',
};

function reportForms() {
  head('Who shares a silhouette');
  const groups = sharedSilhouettes();
  process.stdout.write('  Two bodies drawn the one shape leave colour and size to say which one it is.\n');
  process.stdout.write('  The crowd is allowed to do that - nine bodies cannot all be a different shape as\n');
  process.stdout.write('  well as a different colour - but it has to be a choice, so this is where the game\n');
  process.stdout.write('  says what it chose, and what each pair has left to carry the difference.\n\n');
  if (groups.length === 0) {
    process.stdout.write('  every body in the crowd has a silhouette of its own.\n');
    return 0;
  }
  let unpaid = 0;
  for (const group of groups) {
    process.stdout.write('  ' + pad(group.form, 12) + group.members.join(', ') + '\n');
    for (const pair of group.pairs) {
      if (!pair.carries) unpaid++;
      process.stdout.write('      ' + pad(pair.a + ' / ' + pair.b, 24)
        + num(pair.sizeRatio, 2) + 'x apart in size, '
        + num(pair.colour, 2) + ' of a step apart in colour on ' + pair.eyes.toLowerCase()
        + ' - ' + CARRIED_BY[pair.carriedBy] + '\n');
    }
  }
  const borrowers = shipBorrowers();
  if (borrowers.length > 0) {
    process.stdout.write('\n  wearing the ship\'s own silhouette: '
      + borrowers.map((sight) => sight.id + ' (' + num(sight.size, 0) + ' px)').join(', ') + '\n');
    process.stdout.write('  This is the one sharing that can cost a run - a thing in your own shape, coming\n');
    process.stdout.write('  at you - so they are promised a whole step against the ship on every axis an eye\n');
    process.stdout.write('  keeps, which is what says "that one is not you". See the pairs above.\n');
  }
  return unpaid;
}

function reportSky(sky) {
  head('Can a body be seen at all');
  const bad = sky.filter((row) => row.worst.ratio < row.need);
  for (const row of sky) {
    if (row.worst.ratio >= row.need) continue;
    process.stdout.write('  FAIL ' + pad(row.sight.id + ' ' + row.part, 22)
      + 'is ' + pad(num(row.worst.ratio, 2), 6) + ' of a step from the sky on '
      + visionName(row.worst.vision).toLowerCase() + ', needs ' + row.need + '\n');
  }
  if (bad.length === 0) {
    process.stdout.write('  every line colour and every wash clears the sky it is drawn on.\n');
  }
}

/**
 * The MARKS row, measured (game/settings.js).
 *
 * One block per step of the row that paints anything - the faintest first, because the faint step is
 * the one that has to clear the bar: the full step is the same colours laid with more ink in them.
 * Every pair a mark touches is printed before and after, and the ones the marks are *for* - the pairs
 * the palette promises a whole step of brightness about - are the ones the section is judged on.
 */
function reportMarks(marks, opts) {
  head('When MARKS is asked for');
  for (const mark of markNames()) {
    process.stdout.write('  ' + mark.name + ' is ' + mark.colour + ', at ' + mark.ratio
      + ' of the thing it sits in the middle of\n');
  }
  process.stdout.write('  a mark is measured as the mean of itself over the thing it covers, so these\n');
  process.stdout.write('  numbers are the least an eye gets and not the most\n\n');
  if (marks.length === 0) {
    process.stdout.write('  the row has no step that paints anything, so there is nothing to measure.\n');
    return;
  }
  for (const one of marks) {
    process.stdout.write('  step ' + one.step.words + ' \u00b7 ' + one.step.share + ' of an opacity\n');
    const sorted = one.pairs.slice().sort((x, y) => margin(x) - margin(y));
    const shown = opts.all ? sorted : sorted.filter((p) => margin(p) < 0.45);
    for (const pair of shown) {
      process.stdout.write('    ' + (pair.pass ? 'ok  ' : 'FAIL') + ' '
        + pad(pair.a.id + ' / ' + pair.b.id, 26)
        + 'red-green ' + pad(num(pair.redGreen.ratio, 2), 7)
        + 'no hue ' + pad(num(pair.hueless.ratio, 2), 6)
        + 'asked ' + num(pair.need.redGreen, 2) + '/' + num(pair.need.hueless, 2) + '\n');
    }
    for (const row of one.sky) {
      process.stdout.write('    FAIL ' + pad(row.sight.id + ' ' + row.part, 26)
        + 'is ' + num(row.worst.ratio, 2) + ' of a step from the sky, needs ' + row.need + '\n');
    }
    if (one.needed.length === 0) {
      process.stdout.write('    nothing in this corner of the table is promised a whole step of brightness,');
      process.stdout.write(' so nothing here is what the marks were built for\n');
    } else {
      process.stdout.write('    ' + one.bought.length + ' of ' + one.needed.length
        + ' pairs the marks are for came out further over their bar\n');
    }
    for (const each of one.needed) {
      process.stdout.write('      ' + pad(each.pair.a.id + ' / ' + each.pair.b.id, 26)
        + 'was ' + pad(num(margin(each.before), 2), 6) + ' clear of its bar, is '
        + num(margin(each.pair), 2) + '\n');
    }
    if (one.failures.length > 0) {
      process.stdout.write('    ' + one.failures.length + ' promised pair'
        + (one.failures.length === 1 ? '' : 's') + ' under the bar with the mark on: '
        + one.failures.map((p) => p.a.id + '/' + p.b.id).join(', ') + '\n');
    }
    process.stdout.write('\n');
  }
}

const opts = readArgs(process.argv.slice(2));
let sights = SIGHTS;
if (opts.only !== null) {
  const word = opts.only.toLowerCase();
  sights = SIGHTS.filter((s) => s.id.includes(word) || s.meaning.includes(word) || s.form.includes(word));
  if (sights.length === 0) {
    process.stderr.write('palette-check: nothing in the table is called ' + opts.only + '\n');
    process.exit(2);
  }
}
// A pair needs both of its sights, so a filtered report audits whichever pairs the filter left.
const pairs = auditSights(sights).filter((p) => sights.includes(p.a) && sights.includes(p.b));
const sky = auditSky(sights);

process.stdout.write('STARFALL palette check - ' + sights.length + ' sights, '
  + promised(pairs).length + ' of ' + pairs.length + ' pairs promised something\n');
reportSights(sights);
reportPairs(pairs, opts);
reportReported(pairs, opts);
const unpaidForms = reportForms();
reportSky(sky);
const marks = auditMarks(sights);
reportMarks(marks, opts);

const failures = promised(pairs).filter((p) => !p.pass).length
  + unpaidForms
  + sky.filter((r) => r.worst.ratio < r.need).length
  + marks.reduce((sum, one) => sum + one.failures.length + one.sky.length
    + (one.needed.length - one.bought.length), 0);
head('Verdict');
if (failures === 0) {
  process.stdout.write('  every pair clears what the rule asks of it.\n');
  process.exit(0);
}
process.stdout.write('  ' + failures + ' measurement' + (failures === 1 ? '' : 's')
  + ' under the bar. --strict exits on this.\n');
process.exit(opts.strict ? 1 : 0);
