#!/usr/bin/env node
// Can a line of type be read where it is painted? The interface, printed.
//
//   node tools/contrast-check.js              the report (every line that is tight or failing)
//   node tools/contrast-check.js --all        every line, not only the tight ones
//   node tools/contrast-check.js --strict     and exit non-zero if any line is under its bar
//
// This file is only the printing. The ruler, the page reader and the table of glass lines all live in
// `tools/contrast.js` - which says what every number means, why type is measured with WCAG's contrast
// ratio and the arena with an Oklab step, and what the audit leaves out on purpose - because
// `test/contrast.test.mjs` holds the same promises and must not run a report to do it. The report and
// the tests call one `audit()`, so they cannot disagree about what the interface looks like.
//
// The shape of the output follows `tools/palette-check.js`: worst first, a line printed even when it
// passes if it is within `THIN_MARGIN` of its bar, so a clean run still says where the edge is, and a
// verdict line at the bottom because that is the only line a busy reader looks at.

import { luminance } from './colour-lab.js';
import {
  BARS, LARGE_PX, THIN_MARGIN, audit, glassFields, hexOf,
} from './contrast.js';

function readArgs(argv) {
  const opts = { all: false, strict: false };
  for (const arg of argv) {
    if (arg === '--all') opts.all = true;
    else if (arg === '--strict') opts.strict = true;
    else {
      process.stderr.write('contrast-check: I do not know the option ' + arg + '\n');
      process.exit(2);
    }
  }
  return opts;
}

const pad = (text, width) => String(text).padEnd(width);
const num = (value, digits) => value.toFixed(digits);

function head(title) {
  process.stdout.write('\n' + title + '\n' + '-'.repeat(title.length) + '\n\n');
}

/** One row. The flag is what the eye sorts by: FAIL first, then the thin ones, then everything else. */
function reportRow(row) {
  const flag = row.pass ? (row.thin ? 'thin' : 'ok  ') : 'FAIL';
  process.stdout.write('  ' + flag + '  '
    + pad(num(row.ratio, 2), 6) + ' (need ' + row.bar + ')'
    + '  ' + pad(num(row.step, 2) + ' step', 10)
    + '  ' + pad(row.size + 'px', 6)
    + '  ' + pad(row.where, 34)
    + '  ' + hexOf(row.field.rgb) + ' for ' + pad(row.field.field, 30)
    + '  ' + hexOf(row.colour) + (row.alpha < 1 ? ' at ' + num(row.alpha, 2) : '')
    + (row.note === '' ? '' : '   // ' + row.note)
    + '\n');
}

function reportSection(title, rows, all) {
  head(title);
  const sorted = rows.slice().sort((a, b) => a.ratio - b.ratio);
  const shown = all ? sorted : sorted.filter((r) => !r.pass || r.thin);
  if (shown.length === 0) {
    process.stdout.write('  ' + rows.length + ' lines, none of them within ' + THIN_MARGIN
      + ' of a bar. (--all prints the whole table.)\n\n');
    return;
  }
  for (const each of shown) reportRow(each);
  process.stdout.write('\n');
}

const opts = readArgs(process.argv.slice(2));
const result = audit();
const field = result.page[0].field;

process.stdout.write('STARFALL interface contrast check - ' + result.all.length + ' lines of type ('
  + result.page.length + ' on the page, ' + result.glass.length + ' on the glass)'
  + ', measured with the WCAG 2.1 ruler: ' + BARS.body + ' to 1 for a line you read, ' + BARS.large
  + ' to 1 for a heading of ' + LARGE_PX + 'px or more.\n');
process.stdout.write('  `step` is the same difference in the palette\'s units (tools/colour-lab.js),'
  + ' so an interface number can be compared with an arena one.\n');
process.stdout.write('  Every page line is measured on ' + field.field + ' (' + hexOf(field.rgb)
  + '), the brightest field the interface can put behind type; a lighter field would only help.\n');

reportSection('The page (index.html)', result.page, opts.all);
reportSection('The glass (src/render)', result.glass, opts.all);

head('The fields the glass writes on');
for (const each of glassFields()) {
  process.stdout.write('  ' + pad(hexOf(each.rgb), 9) + pad(each.field, 32)
    + 'luminance ' + num(luminance(each.rgb), 4) + '\n');
}

head('Verdict');
if (result.failures.length === 0) {
  process.stdout.write('  every line of type clears its bar'
    + (result.thin.length === 0 ? '.\n'
      : '; ' + result.thin.length + ' of them are within ' + THIN_MARGIN
        + ' of one, printed above as `thin`.\n'));
  process.exit(0);
}
process.stdout.write('  ' + result.failures.length + ' line' + (result.failures.length === 1 ? '' : 's')
  + ' of type under its bar: '
  + result.failures.map((r) => r.where + ' ' + num(r.ratio, 2)).join(', ') + '\n');
process.stdout.write('  --strict exits on this.\n');
process.exit(opts.strict ? 1 : 0);
