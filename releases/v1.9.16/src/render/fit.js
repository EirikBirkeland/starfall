// Words that have to stay inside a box.
//
// The card rack (render/cards.js) paints a rectangle whose size the window decides and a handful
// of strings that were written by hand at no particular length, and the second of those has to
// give. Everything here measures with the same ctx that is going to draw the words, because the
// only honest answer to "how wide is this word" comes from the canvas that will paint it - and
// because a card can be any width at all, "does it fit" is a question for the frame it is drawn
// in and not one that can be answered once in a text editor.
//
// Both policies shrink before they cut. A card whose sentence is complete at twelve pixels says
// more than the same card at fifteen with an ellipsis in the middle of its last line, so cutting
// is only what is left when even the smallest honest size cannot hold the words. Every caller
// therefore names a floor: type below it is not smaller, it is unreadable, and an ellipsis is
// the better lie.

/** One notch of the shrink ladder, and how many notches there are. The ladder has a bottom the
 *  caller names as `minSize`; the count is only here so that no predicate can wedge the loop. */
const STEP = 0.92;
const MAX_NOTCHES = 10;

/** What goes where a word had to be cut short. */
const ELLIPSIS = '\u2026';

/**
 * The size to draw at: `opts.size` if `fits` is happy with it, or one notch smaller until it is,
 * and never below `opts.minSize`. `fits` is called with the ctx font already set to the size it
 * is asking about, so it can measure with the same canvas - which is the whole point.
 *
 * Returns the size chosen and leaves the ctx font set to it, so what a caller draws with is
 * exactly what was measured and nothing can drift between the two.
 */
export function shrinkToFit(ctx, opts, fits) {
  let size = opts.size;
  for (let notch = 0; notch <= MAX_NOTCHES; notch++) {
    ctx.font = opts.fontFor(size);
    if (fits(size) || size <= opts.minSize) return size;
    size = Math.max(opts.minSize, size * STEP);
  }
  ctx.font = opts.fontFor(size);
  return size;
}

/** How wide `text` is in the ctx's current font. */
export function widthOf(ctx, text) {
  return ctx.measureText(text).width;
}

/**
 * `text`, shortened until it is no wider than `widest`, with whatever came off the end paid back
 * as a single ellipsis. Returns the text untouched when it already fits, so a caller can ask
 * whether anything was cut by comparing what it got back with what it handed over.
 */
export function ellipsize(ctx, text, widest) {
  if (widthOf(ctx, text) <= widest) return text;
  let cut = text.length;
  while (cut > 1 && widthOf(ctx, text.slice(0, cut).trimEnd() + ELLIPSIS) > widest) cut--;
  return text.slice(0, cut).trimEnd() + ELLIPSIS;
}

/**
 * `text` wrapped at spaces into rows no wider than `widest`, in the ctx's current font. A single
 * word longer than the box is never broken up: it gets a row to itself and the caller decides
 * what to do about it (see `fitParagraph`, which cuts the row it lands on).
 */
export function wrapRows(ctx, text, widest) {
  const words = text.split(' ');
  const rows = [];
  let row = '';
  for (const word of words) {
    const trial = row === '' ? word : row + ' ' + word;
    if (row !== '' && widthOf(ctx, trial) > widest) {
      rows.push(row);
      row = word;
    } else {
      row = trial;
    }
  }
  if (row !== '') rows.push(row);
  return rows;
}

/**
 * One line of text, at the largest size between `opts.size` and `opts.minSize` that is narrow
 * enough for `opts.widest`, and cut short only if even the floor is not. Returns the size, the
 * text to draw, and whether anything had to come off: a card that got shortened is a fact its
 * reader and its tests both want, not a detail.
 */
export function fitOneLine(ctx, text, opts) {
  const size = shrinkToFit(ctx, opts, () => widthOf(ctx, text) <= opts.widest);
  const shown = ellipsize(ctx, text, opts.widest);
  return { size: size, text: shown, cut: shown !== text };
}

/**
 * A paragraph in at most `opts.maxRows` rows of `opts.widest`, in the largest size between
 * `opts.size` and `opts.minSize` that fits. If the floor is still not enough, the last row keeps
 * what is left of the text and is cut where the box ends, and `cut` says so.
 */
export function fitParagraph(ctx, text, opts) {
  let rows = [];
  const size = shrinkToFit(ctx, opts, () => {
    rows = wrapRows(ctx, text, opts.widest);
    return rows.length <= opts.maxRows;
  });
  if (rows.length <= opts.maxRows) return { size: size, rows: rows, cut: false };

  const kept = rows.slice(0, opts.maxRows);
  // The last row gets the rest of the paragraph and is cut there, so the ellipsis lands where the
  // card runs out and not in the middle of the last row that would have fitted anyway.
  kept[opts.maxRows - 1] = ellipsize(ctx, rows.slice(opts.maxRows - 1).join(' '), opts.widest);
  return { size: size, rows: kept, cut: true };
}
