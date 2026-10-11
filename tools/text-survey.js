// Every line of text the game can put in front of a player, printed for a human to read.
//
// This is the reading half of the writing pass (PLAN: "read every line of text in the game and make
// it short, clear, and consistent"). `tools/headless/text.js` plays a whole visit in the stub browser
// and takes back what was on the glass at every stop; this prints it, one line per sentence, longest
// first. Whether a line fits the box it is said in is not this file's business - that is
// test/card-fit.test.mjs and the other fit tests, which measure real boxes.
//
//   node tools/text-survey.js            every stop, in the order the visit walks them
//   node tools/text-survey.js --counts   one line per stop: how many sentences, and the longest
//
// A page line is printed as the page holds it. A browser collapses a run of spaces when it lays text
// out, so a `   ·  ` written into a page element shows as one space on the screen; `--counts` says
// which lines came off the page and which off the glass, because the glass keeps its spaces.
//
// test/words.test.mjs is the same harvest with the rules switched on; this file is the version with
// the rules switched off, for reading.

import { harvestVisit } from './headless/text.js';

const COUNTS = process.argv.indexOf('--counts') >= 0;

/** One stop's lines, deduplicated in the order they first appeared. */
function tidy(lines) {
  const seen = new Set();
  const out = [];
  for (const text of lines) {
    const line = text.replace(/\s+/g, ' ').trim();
    if (line === '' || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

function longest(lines) {
  let best = '(nothing)';
  for (const line of lines) if (line.length > best.length) best = line;
  return best;
}

/** `wreck` on the glass, `THE WRECK` on the page of this report. */
function heading(name) {
  return ('THE ' + name).toUpperCase();
}

const harvest = await harvestVisit({ root: process.cwd() });

for (const stop of harvest.stops) {
  const page = tidy(stop.page);
  const markup = tidy(stop.markup);
  const canvas = tidy(stop.canvas);

  if (COUNTS) {
    console.log(stop.name.padEnd(26)
      + ' page ' + String(page.length).padStart(3)
      + ' markup ' + String(markup.length).padStart(3)
      + ' glass ' + String(canvas.length).padStart(3)
      + '  longest: ' + longest(canvas.length > 0 ? canvas : page));
    continue;
  }

  console.log('\n=== ' + heading(stop.name));
  if (page.length > 0) {
    console.log('  the page:');
    for (const line of page.sort((a, b) => b.length - a.length)) {
      console.log('    ' + JSON.stringify(line));
    }
  }
  if (markup.length > 0) {
    console.log('  written into the markup:');
    for (const line of markup.sort((a, b) => b.length - a.length)) {
      console.log('    ' + JSON.stringify(line));
    }
  }
  if (canvas.length > 0) {
    console.log('  the glass:');
    for (const line of canvas.sort((a, b) => b.length - a.length)) {
      console.log('    ' + JSON.stringify(line));
    }
  }
}

console.log('\n' + harvest.stops.length + ' stops, '
  + harvest.stops.reduce((n, s) => n + s.page.length + s.canvas.length, 0)
  + ' lines gathered in total (deduplicated per stop).');
