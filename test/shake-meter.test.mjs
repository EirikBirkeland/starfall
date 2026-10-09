// The instrument that holds the owner's shake rule is itself the thing being trusted, so
// it is tested the way the rule is: on numbers made up here, where the honest answer is
// known without playing anything.
//
// `tools/shake-meter.js` samples the camera's trauma once per frame of a played run and
// reduces it to a handful of numbers, and `test/shake-policy.test.mjs` quotes those numbers
// back at the game. If the reduction is wrong - a still share that counts a moving frame as
// still, a percentile that reads the wrong frame - then the policy is being held by a
// stopped clock. Everything below is a claim about the arithmetic, with the frame counts and
// the trauma written out longhand beside it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import { shakeReport, reportLines, batchLine } from '../tools/shake-meter.js';

const FRAME_SECONDS = 16.7 / 1000;   // the harness's frame length, as the meter reads it
const FLOOR = BALANCE.screen.shakeFloor;
const NOTICE = BALANCE.screen.shakeNotice;

/** `n` frames of one amount of trauma, `every` frames apart on the run's own clock. */
function pile(amount, n, boss) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ t: i * FRAME_SECONDS, shake: amount, boss: boss === true });
  return out;
}

/** The whole pile at one minute mark, so the busiest-minute number can be aimed at. */
function atMinute(amount, n, minute) {
  const out = pile(amount, n);
  for (const sample of out) sample.t += minute * 60;
  return out;
}

test('a run that never moved is all still', () => {
  const report = shakeReport(pile(0, 100));

  assert.equal(report.frames, 100);
  assert.equal(report.still, 1, 'every frame was still');
  assert.equal(report.rolling, 0);
  assert.equal(report.mean, 0);
  assert.equal(report.max, 0);
  assert.equal(report.travel, 0, 'no trauma held for no seconds');
  assert.equal(report.moving.frames, 0);
  assert.ok(reportLines(report).join(' ').includes('no boss walked in'),
    'and the lines say so rather than printing a mean of nothing');
});

test('the still share is the painter\'s floor and nobody else\'s', () => {
  // `render/renderer.js` does not translate the canvas for trauma at or below the floor, so
  // a frame at exactly the floor was still as any other - and one above it was not.
  assert.ok(shakeReport(pile(FLOOR, 50)).still === 1, 'at the floor: still');
  assert.ok(shakeReport(pile(FLOOR + 0.01, 50)).still === 0, 'above it: moving');
});

test('rolling starts where the eye starts', () => {
  assert.equal(shakeReport(pile(NOTICE - 0.01, 20)).rolling, 0, 'a tremble is not a roll');
  assert.equal(shakeReport(pile(NOTICE, 20)).rolling, 1, 'and this is where it is');
});

test('travel is trauma held over the seconds it was held', () => {
  const report = shakeReport(pile(10, 60));
  assert.equal(report.travel, 10 * 60 * FRAME_SECONDS);

  // Which is why the two runs below are not the same run: same peak, one tenth of the time.
  const brief = shakeReport(pile(10, 6));
  assert.equal(report.max, brief.max);
  assert.ok(report.travel > brief.travel * 5, 'and the long one cost ten times as much');
});

test('the percentiles read the frame they land on', () => {
  // Half the run rolling, half of it dead still, so every quantile has an obvious answer.
  const samples = pile(0, 50).concat(pile(NOTICE + 1, 50));
  const report = shakeReport(samples);

  assert.equal(report.p50, 0, 'the middle frame was still');
  assert.equal(report.p95, NOTICE + 1, 'the ninety-fifth was not');
  assert.equal(report.p99, NOTICE + 1);
  assert.equal(report.max, NOTICE + 1);
  assert.equal(report.mean, (NOTICE + 1) / 2);
});

test('one spike in a thousand is a max and not a percentile', () => {
  // The reason the report prints both: a single 12 px jump is a real event and it is not a
  // trend, and a share alone would say the run was spotless.
  const samples = pile(0, 999).concat(pile(12, 1));
  const report = shakeReport(samples);

  assert.equal(report.max, 12);
  assert.ok(report.p99 < 1, 'p99 never saw it: ' + report.p99);
  assert.equal(report.moving.frames, 1, 'and it is one frame of the run');
});

test('the boss half and the crowd half are counted apart', () => {
  const samples = pile(0, 80).concat(pile(9, 20, true));
  const report = shakeReport(samples);

  assert.equal(report.boss.frames, 20);
  assert.equal(report.crowd.frames, 80);
  assert.equal(report.boss.mean, 9);
  assert.equal(report.crowd.mean, 0, 'the crowd gave none of it');
  assert.ok(report.boss.mean > report.crowd.mean, 'which is the claim the policy test quotes');
});

test('the busiest minute is the loud one', () => {
  const samples = atMinute(0, 60, 0).concat(atMinute(8, 60, 2));
  const report = shakeReport(samples);

  assert.equal(report.worst.at, 120, 'the third minute, and not the first');
  assert.equal(report.worst.mean, 8);
  assert.equal(report.worst.max, 8);
});

test('an empty pile is a dash and not a crash', () => {
  const report = shakeReport([]);

  assert.equal(report.frames, 0);
  assert.ok(Number.isNaN(report.still), 'nothing to take a share of');
  const lines = reportLines(report);
  assert.equal(lines.length, 5, 'the run still gets its lines');
  assert.ok(lines.join(' ').includes('-'), 'printed as a dash, not as NaN');
});

test('a batch prints the middle run and not the loudest one', () => {
  // Three runs whose stillness is 100%, 50% and 0%: the line has to say 50%, because a
  // batch of runs is lopsided and the loudest one is not what a release should be judged on.
  const reports = [
    shakeReport(pile(0, 100)),
    shakeReport(pile(FLOOR, 50).concat(pile(12, 50))),
    shakeReport(pile(12, 100)),
  ];
  const line = batchLine(reports);

  assert.ok(line.includes('batch of 3 runs'), line);
  assert.ok(line.includes('median 50.0% of frames still'), 'the middle of 0%, 50%, 100%: ' + line);
  assert.ok(line.includes('worst 0.0%'), 'and the run that never sat still at all: ' + line);
});
