// Plain-text formatting shared by the command-line reports.
//
// These are the pieces every table in `tools/balance-report.js` is built out of,
// and nothing else uses them: a duration, a percentage, a column of digits that
// lines up with the column above it. Kept here rather than inline so a table is
// mostly the numbers it is showing.

/** Whole seconds as `6m14s`. Negative and missing read as no time at all. */
export function clock(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m00s';
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return minutes + 'm' + (rest < 10 ? '0' : '') + rest + 's';
}

/** A shorter duration, for the seconds a body spends dying: `1.50s`. */
export function secs(seconds) {
  if (!Number.isFinite(seconds)) return '-';
  return seconds.toFixed(2) + 's';
}

/** A share of a whole as a whole percentage: `36%`. Nothing to divide is `-`. */
export function share(part, whole) {
  if (!whole) return '-';
  return Math.round((part / whole) * 100) + '%';
}

/** A whole number with the thousands split up: `1,204`. */
export function int(n) {
  return Math.round(n).toLocaleString('en-US');
}

/** One decimal, or a dash when there was nothing to average. */
export function dec(n, places) {
  if (!Number.isFinite(n)) return '-';
  return n.toFixed(places === undefined ? 1 : places);
}

/**
 * A titled block of aligned text.
 *
 * `align` says which way each column sits - one character per column, `r` for
 * right, anything else for left - and `header` and `rows` are already strings: a
 * table function that also formatted numbers would have to know what every number
 * in the game means. The columns are as wide as their widest cell, and a line is
 * trimmed of the padding it does not need, so the output diffs cleanly.
 */
export function table(title, note, align, header, rows) {
  const widths = header.map((head, column) => {
    let wide = head.length;
    for (const row of rows) wide = Math.max(wide, row[column].length);
    return wide;
  });

  const paint = (row) => row
    .map((cell, column) => (align[column] === 'r' ? cell.padStart(widths[column]) : cell.padEnd(widths[column])))
    .join('  ')
    .replace(/\s+$/, '');

  const lines = [];
  if (title) lines.push(title);
  // A note may be several lines; every one of them is indented, so a table's note
  // always reads as prose under its title rather than as a broken column.
  if (note) {
    for (const line of String(note).split('\n')) lines.push('  ' + line);
  }
  if (header.length > 0) lines.push(paint(header));
  for (const row of rows) lines.push(paint(row));
  return lines.join('\n');
}
