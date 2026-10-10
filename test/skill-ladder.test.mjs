// The skill ladder (tools/skill-ladder.js): the same careless batch, played at four rungs.
//
// The tool is a report and not a check, so most of what a test can hold it to is that its parts
// mean one thing: which rungs exist and how one is asked for, that a rung's middle is the middle of
// its *deaths* (a batch that mostly survived has no meaning left in a median of everything), that
// the band is counted on the whole batch and with both edges inside it, and that the slope lines
// say what the numbers say - including when there is no step to measure.
//
// The one claim that needs real play is the reason the tool exists: that the rungs are actually
// different players. It is measured on a short window and a small batch, because a rung whose runs
// all end in the first minute is still a rung, and the ordering is what is on trial and not the
// seconds.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { RUNGS, HUMAN, HumanDodge, setDial, theHuman } from '../tools/headless/human.js';
import {
  PLAYERS, rungList, rungRow, ladderTable, slopeLines,
} from '../tools/skill-ladder.js';
import { ARC } from '../tools/difficulty-arc.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const LADDER = path.join(ROOT, 'tools', 'skill-ladder.js');

function ladder(args) {
  return spawnSync(process.execPath, [LADDER, ...args], { cwd: ROOT, encoding: 'utf8' });
}

/** A finished run shaped the way `playOneRun`'s answer is, for the parts a row reads. */
function run(seconds, options) {
  const opts = options || {};
  return {
    seconds: seconds,
    died: opts.died === undefined ? true : opts.died,
    won: opts.won === true,
    stats: { level: opts.level || 1, score: opts.score || 100 },
  };
}

// --- the rungs ----------------------------------------------------------------------

test('the ladder has four rungs and they are worst first', () => {
  assert.deepEqual(PLAYERS.map((player) => player.rung),
    ['flustered', 'ordinary', 'sharp', 'program']);
  assert.equal(PLAYERS[1].dial, HUMAN, 'the middle rung is the dial the file argues for');
  assert.equal(PLAYERS[3].policy, 'aware', 'the top rung has no hands at all');
  assert.equal(PLAYERS[3].dial, undefined, 'and so nothing to set the dial to');
});

test('a rung is a name and not a guess', () => {
  assert.deepEqual(rungList('').map((player) => player.rung), PLAYERS.map((player) => player.rung));
  assert.deepEqual(rungList('sharp, program').map((player) => player.rung), ['sharp', 'program']);

  assert.throws(() => rungList('expert'), /no rung is called expert/);
  assert.throws(() => rungList(','), /at least one of/);
});

test('a rung is a pair of eyes, and asking for one puts them on', () => {
  setDial(undefined);
  assert.deepEqual(theHuman.dial, HUMAN, 'asking for no dial means the ordinary one');
  setDial(RUNGS.flustered);
  assert.ok(theHuman.dial.lookEvery > HUMAN.lookEvery, 'a flustered player is slower to look');
  assert.ok(RUNGS.sharp.lookEvery < HUMAN.lookEvery, 'and a sharp one quicker');
  assert.ok(RUNGS.flustered.attention < RUNGS.sharp.attention, 'and less of a look is spent watching');
  setDial(undefined);
});

test('a rung says everything, because a rung that forgets one thing stops being slower', () => {
  // The bug this is here for: a rung written without `lookJitter` made the next-look timer NaN,
  // `NaN > 0` is false, and the flustered bot ended up re-deciding every frame - the fastest pair
  // of hands on the ladder and by far the hardest to kill. A dial is now merged over `HUMAN` and
  // checked, so a missing key is impossible and a nonsense one is an error.
  for (const player of PLAYERS) {
    if (player.dial === undefined) continue;
    for (const key of Object.keys(HUMAN)) {
      assert.ok(Number.isFinite(player.dial[key]), player.rung + ' has no ' + key);
    }
  }

  assert.deepEqual(new HumanDodge({ lookEvery: 0.3 }).dial,
    { ...HUMAN, lookEvery: 0.3 }, 'a patch over the ordinary dial is a whole dial');
  assert.throws(() => new HumanDodge({ attention: 'most of it' }), /wants a non-negative number/);
  assert.throws(() => setDial({ fumble: -1 }), /wants a non-negative number/);
});

// --- what a rung's batch says -------------------------------------------------------

test('a rung\'s middle is the middle of its deaths', () => {
  const row = rungRow([run(60), run(300), run(600), run(900, { died: false })]);

  assert.equal(row.runs, 4);
  assert.equal(row.deaths, 3, 'the run still flying at the cap is not a death');
  assert.equal(row.alive, 1);
  assert.equal(row.medianDeath, 300, 'the middle of three deaths, not of four runs');
});

test('a won run is an ending and not a survival', () => {
  const row = rungRow([run(500, { won: true }), run(500, { died: false })]);

  assert.equal(row.deaths, 0, 'the schedule came out and the ship was still standing');
  assert.equal(row.medianDeath, NaN, 'and there is no middle of no deaths to print');
  assert.equal(row.alive, 1, 'the other one is the one that outlasted the window');
});

test('the band counts the batch, edges and all', () => {
  const row = rungRow([
    run(ARC.from - 1), run(ARC.from), run(ARC.to), run(ARC.to + 1), run(120),
  ]);

  assert.equal(row.inBand, 2, '4m00s and 9m00s are both inside the band PLAN wrote');
  assert.equal(row.deaths, 5);
});

test('the table shows the band it is judging against', () => {
  const rows = [Object.assign({ rung: 'ordinary', says: 'x' }, rungRow([run(300)]))];
  const out = ladderTable(rows, 'random');

  assert.match(out, /rung\s+what it is\s+died\s+median death/);
  assert.match(out, /ordinary\s+x\s+1\/1\s+5m00s/);
  assert.match(out, /1 careless run per rung/);
  assert.match(out, /4m00s-9m00s/, 'the note says where the band is');
  assert.match(ladderTable(rows, 'wise'), /1 careful run per rung/);
});

test('a rung that never died has no slope to report', () => {
  const rows = [
    Object.assign({ rung: 'flustered' }, rungRow([run(60), run(90)])),
    Object.assign({ rung: 'ordinary' }, rungRow([run(900, { died: false }), run(900, { died: false })])),
  ];
  const lines = slopeLines(rows);

  assert.equal(lines.length, 1);
  assert.match(lines[0], /never died, so there is no step to measure/);
});

test('the slope is the step between two rungs, in seconds', () => {
  const rows = [
    Object.assign({ rung: 'flustered' }, rungRow([run(120), run(140)])),
    Object.assign({ rung: 'ordinary' }, rungRow([run(300), run(340), run(320)])),
  ];
  const lines = slopeLines(rows);

  assert.match(lines[0], /^ordinary against flustered: \+190s of middle run/);

  const back = slopeLines([rows[1], rows[0]]);
  assert.match(back[0], /-190s of middle run/, 'and the step down is said as a step down');
});

test('more runs outlasting the window is worth saying out loud', () => {
  const rows = [
    Object.assign({ rung: 'flustered' }, rungRow([run(120), run(140)])),
    Object.assign({ rung: 'ordinary' }, rungRow([run(300), run(400, { died: false })])),
  ];

  assert.match(slopeLines(rows)[0], /and 1 more runs outlasted the window/);
});

// --- and the tool -------------------------------------------------------------------

test('the ladder plays two rungs and says which is which', () => {
  const done = ladder(['--runs', '2', '--seconds', '40', '--rungs', 'flustered,program', '--seed', '7']);
  assert.equal(done.status, 0, done.stderr);
  assert.match(done.stdout, /^rung flustered: \d\/2 died/m);
  assert.match(done.stdout, /^rung program: \d\/2 died/m);
  assert.match(done.stdout, /the same batch, played 2 ways/);
  assert.match(done.stdout, /program\s+no hands/);
});

test('the ladder refuses a batch too small to have a middle', () => {
  const done = ladder(['--runs', '1']);
  assert.equal(done.status, 2);
  assert.match(done.stderr, /one seed is an anecdote/);

  const rung = ladder(['--runs', '2', '--rungs', 'legendary']);
  assert.match(rung.stdout + rung.stderr, /no rung is called legendary/);
});
