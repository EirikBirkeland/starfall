// The balance report: the little formatters its tables are made of, the tables
// themselves, and the command line that prints them.
//
// The measurements are tested where they are taken (test/tally.test.mjs); what this
// file holds down is the step from those numbers to a page of text. A table that
// says a kind was killed more often than it arrived, a median that is bigger than
// the maximum next to it, a percentage column that does not add up: those are bugs in
// the report and nothing else would notice them.
//
// It also plays two very short runs through the real `gather`, because a report that
// has only ever been handed made-up numbers has never met a kind that never turned
// up, or a run that was still flying when the window shut.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BALANCE } from '../src/game/balance.js';
import { clock, secs, share, int, dec, table } from '../tools/headless/tables.js';
import { gather, percentile } from '../tools/balance-report.js';

const ROOT = path.resolve(import.meta.dirname, '..');

/** `1m03s` back to seconds, for a test that wants to compare two of them. */
function unclock(text) {
  const match = /^(\d+)m(\d{2})s$/.exec(text);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}

/** A table out of the printed page: its header cells and its complete rows. */
function tableOf(text, title) {
  const lines = text.split('\n');
  const at = lines.indexOf(title);
  assert.ok(at >= 0, 'there is no table called ' + title + ' in:\n' + text);

  const cells = (line) => line.replace(/\s+$/, '').split(/\s{2,}/);
  let i = at + 1;
  while (i < lines.length && lines[i] !== '' && lines[i].startsWith('  ')) i++;
  const header = cells(lines[i]);

  const rows = [];
  for (i += 1; i < lines.length && lines[i] !== ''; i++) {
    const row = cells(lines[i]);
    // A row whose last columns are blank is printed with them trimmed off the end,
    // so put them back before believing the row.
    while (row.length < header.length) row.push('');
    if (row.length === header.length) rows.push(row);
  }
  return { header: header, rows: rows };
}

const column = (spec, head) => {
  const at = spec.header.indexOf(head);
  assert.ok(at >= 0, 'no column called ' + head);
  return at;
};

// --- the pieces ---------------------------------------------------------------

test('the formatters say what they mean', () => {
  assert.equal(clock(0), '0m00s');
  assert.equal(clock(74), '1m14s');
  assert.equal(clock(74.6), '1m15s', 'rounded, not truncated');
  assert.equal(clock(-3), '0m00s', 'nothing is less than no time');
  assert.equal(clock(NaN), '0m00s');

  assert.equal(secs(1.5), '1.50s');
  assert.equal(secs(NaN), '-', 'a measurement never taken is not zero seconds');

  assert.equal(share(1, 4), '25%');
  assert.equal(share(1, 3), '33%');
  assert.equal(share(0, 0), '-', 'nothing out of nothing is not a share');

  assert.equal(int(1204), '1,204');
  assert.equal(dec(1.234), '1.2');
  assert.equal(dec(1.234, 3), '1.234');
  assert.equal(dec(NaN), '-');
});

test('a table lines its columns up and indents its note', () => {
  const text = table('TITLES', 'a note', 'lrr',
    ['name', 'n', 'bigger'],
    [['short', '1', '2'], ['a longer name', '10', '20']]);
  const lines = text.split('\n');

  assert.equal(lines[0], 'TITLES');
  assert.equal(lines[1], '  a note', 'the note belongs to the title');
  assert.deepEqual(lines.slice(2), [
    'name            n  bigger',
    'short           1       2',
    'a longer name  10      20',
  ]);
  assert.ok(lines.every((line) => line === line.replace(/\s+$/, '')), 'nothing trails spaces');
});

test('a note may be several lines and a table may have no columns', () => {
  const two = table('T', 'one\nand two', '', [], []).split('\n');
  assert.deepEqual(two, ['T', '  one', '  and two']);

  const noteOnly = table('T', 'only a note', '', [], []);
  assert.equal(noteOnly.split('\n').length, 2);
});

test('a percentile is the top of its step, and never past the worst that happened', () => {
  const spec = { bucket: 1, buckets: 4 };
  assert.ok(Number.isNaN(percentile([0, 0, 0, 0], spec, 0, 0.5, 0)), 'nothing to walk over');

  const three = [1, 2, 0, 0];
  assert.equal(percentile(three, spec, 3, 0.5, NaN), 2, 'the top of the step it lands in');
  assert.equal(percentile(three, spec, 3, 0.9, NaN), 2, 'and it never flatters');
  assert.equal(percentile(three, spec, 3, 0.9, 1.5), 1.5, 'but never past the maximum seen');
  assert.equal(percentile(three, spec, 3, 0.5, 2.5), 2, 'a maximum beyond the step changes nothing');

  const flat = [10, 0, 0, 0];
  assert.equal(percentile(flat, spec, 10, 0.9, 0.2), 0.2);
});

// --- the page -----------------------------------------------------------------

/** Two short runs, once, for every test below. */
const page = await gather({ seed: 700, runs: 2, seconds: 40 });

test('the page says what it played', () => {
  const first = page.split('\n').slice(0, 3).join('\n');
  assert.match(first, /STARFALL BALANCE REPORT/);
  assert.match(first, /2 runs of the aware bot, seeds 700-701/);
  assert.match(first, /each cut short at 0m40s/);
  assert.match(page, /HOW THESE ARE MEASURED/);

  for (const title of ['THE RUNS', 'ON SCREEN', 'ARRIVAL', 'KILLING',
    'TIME TO KILL, AND HOW LONG THEY LAST', 'WHERE THE SHOOTING WENT',
    'WHAT HURT THE SHIP', 'THE GOLD']) {
    assert.ok(page.includes(title + '\n'), 'and it has a ' + title + ' table');
  }
});

test('every kind on the page is one a run can have met in 40 seconds', () => {
  const arrival = tableOf(page, 'ARRIVAL');
  assert.ok(arrival.rows.length > 0, 'somebody turned up');

  for (const row of arrival.rows) {
    const kind = row[0];
    assert.ok(BALANCE.kinds[kind], kind + ' is not a kind the game knows');
    const planned = unclock(row[column(arrival, 'planned')]);
    const seenAt = unclock(row[column(arrival, 'first seen')]);
    assert.ok(seenAt >= planned, kind + ' arrived ' + row[column(arrival, 'first seen')]
      + ', before the balance unlocks it at ' + row[column(arrival, 'planned')]);
    assert.ok(Number(row[column(arrival, 'arrived')]) > 0, 'and it arrived at least once');
  }

  const late = Object.keys(BALANCE.kinds)
    .filter((kind) => BALANCE.kinds[kind].from > 40);
  assert.ok(late.length > 0, 'the roster still has something for later in the run');
  for (const kind of late) {
    assert.ok(!page.includes(kind), kind + ' unlocks after the window and must not be on the page');
  }
});

test('the killing table adds up, and the shares of it do too', () => {
  const killing = tableOf(page, 'KILLING');
  const arrived = column(killing, 'arrived');
  const killed = column(killing, 'killed');
  const standing = column(killing, 'standing');
  const lost = column(killing, 'lost');
  const shares = column(killing, 'share');
  const hull = column(killing, 'hull');
  const shots = column(killing, 'shots');

  let total = 0;
  let percent = 0;
  for (const row of killing.rows) {
    total += Number(row[killed]);
    percent += Number(row[shares].replace('%', ''));
    assert.ok(Number(row[arrived]) >= Number(row[killed]), row[0] + ': more killed than arrived');
    const left = Number(row[arrived]) - Number(row[killed]) - Number(row[lost]);
    assert.equal(left, Number(row[standing]), row[0] + ': what is left standing is not what is left over');

    // A kill has a body and it took shots to make it; a kind that never came down has
    // neither, and says so with a dash rather than with a zero.
    if (Number(row[killed]) > 0) {
      assert.ok(Number(row[hull]) > 0, row[0] + ': a kill with no hull to it');
      assert.ok(Number(row[shots]) > 0, row[0] + ': a kill that took no shots');
    } else {
      assert.equal(row[hull], '-', row[0] + ': nothing was killed, so there is no mean hull');
      assert.equal(row[shots], '-', row[0] + ': nothing was killed, so there are no shots');
    }
  }
  assert.ok(total > 0, 'the bot killed something');
  assert.ok(Math.abs(percent - 100) <= killing.rows.length, 'the shares cover the lot: ' + percent + '%');
});

test('the time table never says a body outlived its own worst case', () => {
  const times = tableOf(page, 'TIME TO KILL, AND HOW LONG THEY LAST');
  const seconds = (cell) => (cell === '-' ? NaN : Number(cell.replace('s', '')));
  const clockish = (cell) => (cell === '-' ? NaN : unclock(cell));

  let measured = 0;
  for (const row of times.rows) {
    const med = seconds(row[column(times, 'fire med')]);
    const p90 = seconds(row[column(times, 'fire p90')]);
    const max = seconds(row[column(times, 'fire max')]);
    if (Number.isNaN(med)) continue;
    measured++;
    assert.ok(med <= p90, row[0] + ': the median is past the p90');
    assert.ok(p90 <= max, row[0] + ': the p90 (' + p90 + ') is past the maximum (' + max + ')');

    const lifeMed = clockish(row[column(times, 'life p90')]);
    const lifeMax = clockish(row[column(times, 'life max')]);
    assert.ok(lifeMed <= lifeMax, row[0] + ': a life p90 past the longest life');
  }
  assert.ok(measured > 0, 'something was timed');
});

test('what hurt the ship ends with all of it', () => {
  const hurt = tableOf(page, 'WHAT HURT THE SHIP');
  const last = hurt.rows[hurt.rows.length - 1];
  assert.equal(last[0], 'all');
  assert.equal(last[column(hurt, 'share')], '100%');

  let hulls = 0;
  for (const row of hurt.rows.slice(0, -1)) {
    hulls += Number(row[column(hurt, 'hulls')]);
    assert.match(row[0], /^(body|shot|blast)(:.+)?$/, row[0] + ' is not a cause the tally writes');
  }
  assert.equal(hulls, Number(last[column(hurt, 'hulls')]));
});

// --- the command --------------------------------------------------------------

function report(args) {
  return execFileSync(process.execPath, [path.join(ROOT, 'tools', 'balance-report.js'), ...args],
    { cwd: ROOT, encoding: 'utf8' });
}

test('the command prints the page and says nothing else on stdout', () => {
  const out = report(['--runs', '1', '--seconds', '20', '--seed', '9']);
  assert.match(out, /^STARFALL BALANCE REPORT\n/);
  assert.match(out, /1 runs of the aware bot, seeds 9-9/);
  assert.match(out, /THE GOLD/);
  assert.ok(!out.includes('undefined') && !out.includes('NaN'), 'and no hole in the numbers');
});

test('the command refuses what it was not given a number for', () => {
  const refused = (args, message) => {
    let error = null;
    try {
      report(args);
    } catch (caught) {
      error = caught;
    }
    assert.ok(error, args.join(' ') + ' should not have been accepted');
    assert.equal(error.status, 2);
    assert.match(String(error.stderr), message);
  };
  refused(['--nonsense'], /unknown option/);
  refused(['--runs'], /want a number/);
  refused(['--runs', '0'], /at least one run/);
  refused(['--bot', 'nonsense'], /--bot wants one of/);
});
