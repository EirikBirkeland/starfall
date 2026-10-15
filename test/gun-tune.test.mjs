// `tools/gun-tune.js`: the knob that moves one number of a primary's row and measures the runs it
// changes. It is the thing NOTES session 96 asked for and never got: a throwaway that patched
// `BALANCE` from the command line, played eight seeds at a ten minute window and printed one median
// line, and thirty of them in parallel is how "what did not work" got measured at all.
//
// What this file holds is the shape of the measurement rather than any number in it. The tuning
// itself lives in the weapon rows of game/balance.js and in NOTES; a test here that asserted a
// median score would break on the next retune and not on a bug (NOTES, session 96, on exactly that
// mistake). What is worth pinning is that the tool cannot lie:
//
//   a bad flag is refused before a single run is played, with a line and not a stack;
//   the shipped row is always played, on the same seeds, as the first condition;
//   a patch is put back before the next one, so a sweep measures each value on its own;
//   putting a row back puts back the lists on it as lists, not as objects;
//   and a number that moves something other than itself says so.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { BALANCE } from '../src/game/balance.js';
import {
  ALL_GUNS, readArgs, conditionsOf, seedList, copyRow, restoreRow, numberFields, fieldOf, rowWords,
  standingOf, notesFor,
} from '../tools/gun-tune.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'gun-tune.js');

function gunTune(args) {
  return spawnSync(process.execPath, [TOOL, ...args], { cwd: ROOT, encoding: 'utf8' });
}

/** The flags every spawned run in this file uses: one seed, a window short enough to be a test. */
const SHORT = ['--seeds', '1', '--seconds', '15'];

/**
 * The table's data rows, by label.
 *
 * Anchoring on the label alone is not enough: without `--quiet` the tool prints a progress dot per
 * run on a line that starts with the very first label, and a filter that matches that line is
 * reading the dots as if they were measurements.
 */
function tableRows(out, labels) {
  const pattern = new RegExp('^(' + labels.join('|') + ')\\s+\\d+/\\d+');
  return out.split('\n').filter((line) => pattern.test(line));
}

/* ------------------------------------------------------------------ the flags */

test('a gun the game does not offer is refused before anything is played', () => {
  const run = gunTune(['--gun', 'nonsense', '--set', 'damage=1', ...SHORT]);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /--gun wants one of: pulse, scatter, arc, lance, swarm/);
});

test('a field the row does not have is refused, and the message names the ones it does', () => {
  // The misspelling this is really about is `firerate`: it is silently a *new* field, so the patch
  // would do nothing at all and the table would print a number as though it had.
  const run = gunTune(['--gun', 'pulse', '--set', 'firerate=2.6', ...SHORT]);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /the PULSE row has no number called firerate/);
  assert.match(run.stderr, /it has fireRate, pellets, gap, damage/);
});

test('a field that is not a number is refused, at either depth', () => {
  for (const bad of ['name=x', 'sound.wave=sawtooth', 'cannotSpend=pierce']) {
    const run = gunTune(['--gun', 'lance', '--set', bad, ...SHORT]);
    assert.equal(run.status, 2, bad + ' was refused');
  }
});

test('a sweep of one value is refused, because it is a probe with no axis', () => {
  // The whole reason `--sweep` exists is session 96's "`damage` 5 to 3 with `fireRate` 0.9 to 1.4
  // gives 5,508 - no better", which was read as a verdict about the rate when 1.4 was simply not
  // far enough. One value next to the shipped row is that mistake again.
  const run = gunTune(['--gun', 'pulse', '--sweep', 'damage=3', ...SHORT]);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /--sweep wants at least two numbers to walk through/);
});

test('a patch that was never asked for is refused rather than measuring the game twice', () => {
  const run = gunTune(['--gun', 'pulse', ...SHORT]);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /nothing to measure/);
});

test('an unknown flag is refused with a line and not a stack', () => {
  const run = gunTune(['--gun', 'pulse', '--set', 'damage=3', '--swept', 'fireRate=2', ...SHORT]);
  assert.equal(run.status, 2);
  assert.equal(run.stderr.trim(), 'unknown flag: --swept');
});

test('a field is only addressable one level deep', () => {
  // The muzzle and the sound are the only objects on a row, and both are flat.
  assert.equal(fieldOf(BALANCE.weapons.pulse, 'muzzle.count'), BALANCE.weapons.pulse.muzzle.count);
  assert.equal(fieldOf(BALANCE.weapons.pulse, 'muzzle.count.deep'), undefined);
  assert.equal(fieldOf(BALANCE.weapons.pulse, 'nope'), undefined);
});

/* ------------------------------------------------------------------ the conditions */

test('the shipped row is always the first condition, whatever was asked for', () => {
  const one = conditionsOf(readArgs(['--gun', 'pulse', '--set', 'damage=3']));
  assert.equal(one[0].label, 'shipped');
  assert.deepEqual(one[0].sets, []);
  assert.equal(one.length, 2);

  const swept = conditionsOf(readArgs(['--gun', 'pulse', '--sweep', 'fireRate=1.4,2.6,4.4']));
  assert.equal(swept[0].label, 'shipped');
  assert.deepEqual(swept.slice(1).map((at) => at.label),
    ['fireRate 1.4', 'fireRate 2.6', 'fireRate 4.4']);
});

test('a --set is held for every value of a sweep, so one table walks one axis', () => {
  const conditions = conditionsOf(readArgs(
    ['--gun', 'lance', '--set', 'damage=5', '--sweep', 'fireRate=1.3,2.6,5.2'],
  ));
  for (const condition of conditions.slice(1)) {
    assert.deepEqual(condition.sets.map((set) => set.path), ['damage', 'fireRate']);
  }
  assert.equal(conditions[0].sets.length, 0, 'the control is the row as shipped and nothing else');
});

test('a patch remembers what it is covering, so the row can be put back', () => {
  const conditions = conditionsOf(readArgs(['--gun', 'scatter', '--set', 'pellets=9']));
  const patch = conditions[1].sets[0];
  assert.equal(patch.was, BALANCE.weapons.scatter.pellets);
  assert.equal(patch.value, 9);
});

test('the seeds are the same batch for every condition', () => {
  const opts = readArgs(['--gun', 'pulse', '--set', 'damage=3', '--seeds', '7-10']);
  assert.deepEqual(seedList(opts), [7, 8, 9, 10]);
  assert.equal(seedList(readArgs(['--gun', 'pulse', '--set', 'damage=3', '--runs', '3'])).length, 3);
});

/* ------------------------------------------------------------------ putting the row back */

test('putting a row back puts back its lists as lists', () => {
  // The bug this holds: `Object.assign({}, ['pierce', 'ricochet'])` is `{0: 'pierce', ...}`, which
  // has no `indexOf`, and game/upgrades.js `spendableBy` reads the list with `indexOf`. So a copy
  // that treated every object the same way killed a lance run three minutes into a batch, in the one
  // place a tuning tool cannot afford to die - and it only showed on the three guns that carry the
  // list at all, which is why it survived a whole afternoon of pulse probes.
  const shipped = copyRow('lance');
  BALANCE.weapons.lance.cannotSpend.push('mines');
  BALANCE.weapons.lance.damage = 99;
  restoreRow('lance', shipped);
  const row = BALANCE.weapons.lance;
  assert.ok(Array.isArray(row.cannotSpend), 'cannotSpend is still a list');
  assert.deepEqual(row.cannotSpend, ['pierce', 'ricochet', 'bulletSpeed']);
  assert.equal(row.damage, 3);
});

test('a swept value that equals the shipped one reads exactly like the control', () => {
  // The cheap self-check on the sweep itself. The second value swept here is the number already in
  // the row, so it has to land on 1.00x: that says the patch reached the row (a patch that never
  // got there would read 1.00x for the wrong reason and this would not tell), that the control was
  // played on the shipped row and not on a patched one, and that the labels name the numbers that
  // were actually applied.
  //
  // What it does not prove is that the row is put back between conditions, and it would be dishonest
  // to claim it does: every condition re-applies its own whole patch, so with today's condition
  // builder a missed restore changes nothing. `restoreRow` before each condition is a guard for the
  // ordering, not a load-bearing part of this design - it is there so that a condition builder which
  // patches different fields per row (a two-axis sweep, say) is correct without its author having to
  // re-derive why.
  const shipped = BALANCE.weapons.pulse.damage;
  const run = gunTune(['--gun', 'pulse', '--sweep', 'damage=' + (shipped * 9) + ',' + shipped,
    ...SHORT]);
  assert.equal(run.status, 0, run.stderr);
  const line = run.stdout.split('\n')
    .find((text) => text.startsWith('damage ' + shipped + ' '));
  assert.ok(line !== undefined, 'the shipped value was swept and printed:\n' + run.stdout);
  assert.match(line, /1\.00x/, 'the second value reads exactly like the control');
});

test('every gun can be patched and put back, including the three that carry a list', () => {
  for (const gun of ALL_GUNS) {
    const shipped = copyRow(gun);
    assert.equal(shipped.name, BALANCE.weapons[gun].name);
    for (const field of numberFields(gun)) {
      const was = fieldOf(BALANCE.weapons[gun], field);
      assert.equal(typeof was, 'number', gun + '.' + field + ' is a number');
    }
    assert.ok(!numberFields(gun).includes('cannotSpend'), gun + ' offers its list as a number');
  }
});

/* ------------------------------------------------------------------ the reading */

test('a gun patched to its own shipped number reads one point zero zero', () => {
  // The cheapest self-check the tool has, and the one that catches a patch that never reached the
  // row: if the number typed is the number already there and the table still moves, the table is
  // measuring something else.
  const gun = 'pulse';
  const run = gunTune(['--gun', gun, '--set', 'damage=' + BALANCE.weapons[gun].damage, ...SHORT,
    '--quiet']);
  assert.equal(run.status, 0, run.stderr);
  const rows = tableRows(run.stdout, ['shipped', 'damage ' + BALANCE.weapons[gun].damage]);
  assert.equal(rows.length, 2, 'the control and the patch were both played:\n' + run.stdout);
  const ratio = (line) => Number(/([\d.]+)x/.exec(line)[1]);
  assert.equal(ratio(rows[0]), 1);
  assert.equal(ratio(rows[1]), 1, 'a patch to the shipped value changes nothing');
});

test('the table names the row it measured and the row it was shipped as', () => {
  const run = gunTune(['--gun', 'arc', '--set', 'fireRate=8', ...SHORT]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /the ARC row as shipped: 4 pulls\/s, 1 per pull/);
  assert.match(run.stdout, /the ARC row, measured on 1 seed at a 0m15s window/);
  // The arc throws no shot, so there is no speed and no life to print for it - and printing
  // `undefined px/s` for the one gun in the game that is not a shot is how a table stops being read.
  assert.doesNotMatch(run.stdout, /undefined px\/s/);
  assert.match(run.stdout, /cannot spend pierce, ricochet, bulletSpeed/);
});

test('a beam row says what it cannot spend and a shot row says how far it reaches', () => {
  assert.match(rowWords('lance'), /cannot spend pierce, ricochet, bulletSpeed/);
  assert.doesNotMatch(rowWords('lance'), /px\/s/);
  assert.match(rowWords('pulse'), /620 px\/s for 1\.15 s \(713 px of reach\)/);
  assert.match(rowWords('scatter'), /0\.105 rad between neighbours/);
});

test('moving a rate says which per-pull numbers it moved with it', () => {
  const moved = notesFor('pulse', conditionsOf(readArgs(['--gun', 'pulse', '--set', 'fireRate=2'])));
  assert.equal(moved.length, 1);
  assert.match(moved[0], /per-pull/);
  for (const field of ['recoil', 'knockback', 'muzzle.count', 'sound.dur']) {
    assert.ok(moved[0].includes(field), 'the note names ' + field);
  }
  // And it is quiet when the rate was not the number moved.
  assert.deepEqual(notesFor('pulse', conditionsOf(readArgs(['--gun', 'pulse', '--set', 'damage=3']))),
    []);
});

test('a rate past the frame-budget ceiling says the row is measuring the ceiling', () => {
  // shotsPerSecond (game/weapons.js) takes the lesser of the row's rate and rateMax, so a patch
  // above it is silently clipped and the table would otherwise print a number nobody typed.
  const notes = notesFor('pulse',
    conditionsOf(readArgs(['--gun', 'pulse', '--set', 'fireRate=40'])));
  assert.equal(notes.length, 2, 'the feel note and the ceiling note');
  assert.match(notes[1], /above BALANCE\.weapons\.rateMax \(15\)/);
  assert.match(notes[1], /measure the frame-budget ceiling, not the number typed/);
});

test('a gun that carries a list of lines it cannot spend plays a whole run', () => {
  // The end-to-end version of the copy bug. game/upgrades.js `spendableBy` reads the row's
  // `cannotSpend` with `indexOf` every time the deck is dealt, which is every level-up, so a row
  // whose list has been copied into an object kills the run at the first card - three minutes into a
  // batch, in the one place a tuning tool cannot afford to die. Only three of the five guns carry
  // the list, so a probe on the pulse never sees it.
  const run = gunTune(['--gun', 'lance', '--set', 'damage=6', '--seeds', '1', '--seconds', '60',
    '--quiet']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /damage 6\s+\d+\/1/);
});

test('the middle of a batch is the middle of it, and alive counts the runs that outlasted the cap', () => {
  const rows = [
    { seconds: 100, score: 100, level: 4, kills: 20, died: true },
    { seconds: 600, score: 900, level: 12, kills: 200, died: false },
    { seconds: 300, score: 500, level: 8, kills: 100, died: true },
  ];
  const at = standingOf(rows);
  assert.equal(at.seconds, 300);
  assert.equal(at.score, 500);
  assert.equal(at.alive, 1);
  assert.equal(at.runs, 3);
  assert.equal(at.bodies, 100 / 300);
});

test('a pooled batch reads the same table as the batch it was made of', () => {
  // `--shards K` plays the seeds in child processes and pools their rows, so the pooling has to
  // remember which condition each run belonged to - which is what `at` is for, and which is what a
  // label alone would get wrong the day two conditions are spelled the same.
  const file = '/tmp/starfall-gun-tune-test.jsonl';
  const flags = ['--gun', 'scatter', '--set', 'pellets=9', ...SHORT, '--quiet'];
  const played = gunTune(flags.concat(['--play-only', '--out', file]));
  assert.equal(played.status, 0, played.stderr);
  const rows = readFileSync(file, 'utf8')
    .split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));
  assert.deepEqual(rows.map((row) => row.at), [0, 1]);
  assert.equal(rows[1].seed, rows[0].seed, 'both conditions played the same seed');

  const pooled = gunTune(flags.concat(['--in', file]));
  const live = gunTune(flags);
  rmSync(file, { force: true });
  assert.equal(pooled.status, 0, pooled.stderr);
  assert.equal(live.status, 0, live.stderr);
  assert.equal(tableRows(pooled.stdout, ['shipped', 'pellets 9']).length, 2,
    'both conditions were read back out of the file:\n' + pooled.stdout);
  assert.deepEqual(tableRows(pooled.stdout, ['shipped', 'pellets 9']),
    tableRows(live.stdout, ['shipped', 'pellets 9']));
});

test('the band between guns is pointed at and not pretended to be answered', () => {
  const run = gunTune(['--gun', 'pulse', '--set', 'damage=3', ...SHORT, '--quiet']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /tools\/weapon-ladder\.js has re-measured it/);
});
