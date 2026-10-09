#!/usr/bin/env node
// How much the window moves while a run is played, and when it moves.
//
//   node tools/shake-meter.js                       one run, default seed, 10 minutes
//   node tools/shake-meter.js --seed 7              a different run
//   node tools/shake-meter.js --runs 5              a batch, and the middle of it
//   node tools/shake-meter.js --seconds 120         stop after this many game seconds
//   node tools/shake-meter.js --at 895              start the run clock there (so a bot
//                                                   that dies at two minutes can be put
//                                                   next to the Eclipse)
//   node tools/shake-meter.js --bot naive           another bot (see tools/simulate.js)
//   node tools/shake-meter.js --need-still 95       exit non-zero unless the middle run
//                                                   of the batch sat still this often
//
// Why this exists: the owner's rule is that the window is shaken *extraordinarily* and
// not otherwise (BUG_REPORT_README) - a boss, the end of a run, and nothing between.
// That is a claim about feel, and a claim about feel nobody can measure is a claim nobody
// can keep, because the next person to add a `shake:` row to the balance table will not
// be able to see that the last forty of them already filled the screen with jitter.
//
// So this measures it. `world.shake` (game/effects.js `shakeIt`) is the trauma the
// camera is allowed to spend, and it is sampled once per rendered frame of a real,
// bot-played run - the same number `render/renderer.js` turns into a pixel offset - and
// reported as a distribution over the run. The headline is `still`: the share of frames
// where the window did not move at all. Everything else says what the moving frames were.
//
// It measures the simulation's half only. Whether a given shake is *worth* moving the
// window for is game/balance.js's business, and `test/shake-policy.test.mjs` holds that
// line; this is the instrument that says what the line costs in practice.

import { pathToFileURL } from 'node:url';
import { playRuns } from './headless/bot.js';
import { BALANCE } from '../src/game/balance.js';
import { clock, dec, int } from './headless/tables.js';

const FRAME_SECONDS = 16.7 / 1000;   // tools/headless/bot.js's frame length

function readArgs(argv) {
  const opts = { seed: 1, runs: 1, seconds: 600, at: undefined, policy: undefined, needStill: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      i++;
      return argv[i];
    };
    if (arg === '--seed') opts.seed = parseInt(next(), 10);
    else if (arg === '--runs') opts.runs = parseInt(next(), 10);
    else if (arg === '--seconds') opts.seconds = parseFloat(next());
    else if (arg === '--at') opts.at = parseFloat(next());
    else if (arg === '--bot') opts.policy = next();
    else if (arg === '--need-still') opts.needStill = parseFloat(next());
    else {
      console.error('unknown option: ' + arg);
      process.exit(2);
    }
  }
  if (!Number.isFinite(opts.seed) || !Number.isFinite(opts.runs) || !Number.isFinite(opts.seconds)) {
    console.error('--seed, --runs and --seconds want a number');
    process.exit(2);
  }
  if (opts.runs < 1) {
    console.error('--runs wants at least one run');
    process.exit(2);
  }
  if (opts.at !== undefined && !(opts.at >= 0)) {
    console.error('--at wants a number of seconds to start the run clock at');
    process.exit(2);
  }
  if (opts.needStill !== undefined && !(opts.needStill >= 0 && opts.needStill <= 100)) {
    console.error('--need-still wants a percentage between 0 and 100');
    console.error('that is how much of the run the window is required to have sat still');
    process.exit(2);
  }
  return opts;
}

/**
 * One quantile of a sorted-elsewhere set, by the nearest-rank rule.
 *
 * Nearest rank and not interpolation: this is read off a frame counter and the frame it
 * lands on is a real frame, so "the 95th frame of a hundred" is the answer and anything
 * between two of them is a number about nothing.
 */
function quantile(sorted, part) {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(part * sorted.length) - 1))];
}

/** The middle of a set of numbers, the same way tools/simulate.js means it. */
function median(values) {
  if (values.length === 0) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
}

/** A share of a whole as a whole percentage, or a dash when there was nothing to divide. */
function percent(share) {
  return Number.isFinite(share) ? Math.round(share * 100) + '%' : '-';
}

/**
 * What one run's frames add up to.
 *
 * `samples` is one entry per rendered frame, in order: how much trauma the camera was
 * holding (`shake`), and whether a boss was on the field while it held it (`boss`).
 *
 * `still` is the number the whole instrument is built for - the share of frames where
 * the window was not moved at all, which is `render/renderer.js`'s own answer and not a
 * threshold chosen here. `rolling` is the share where the room was visibly travelling,
 * which is the thing that actually costs a player their evening. `travel` is the shake
 * held over the seconds it was held, so a long small shake and a short big one can be
 * told apart instead of both being "a max of 12".
 *
 * The boss/crowd split is which way the arena was pointed when the frame was taken, so the
 * tail of a fight's own shake lands in the crowd pile once its body is gone - a crowd peak
 * of a dozen px is a boss's death fading and not a source the policy test missed. Which
 * sources there are at all is `test/shake-policy.test.mjs`'s business, not this one's.
 */
export function shakeReport(samples) {
  const floor = BALANCE.screen.shakeFloor;
  const notice = BALANCE.screen.shakeNotice;
  const frames = samples.length;
  const values = samples.map((sample) => sample.shake);
  const sorted = values.slice().sort((a, b) => a - b);
  const moving = samples.filter((sample) => sample.shake > floor);
  const boss = samples.filter((sample) => sample.boss);
  const crowd = samples.filter((sample) => !sample.boss);
  const total = values.reduce((sum, value) => sum + value, 0);

  /** The same three numbers for any pile of frames. */
  const part = (pile) => ({
    frames: pile.length,
    share: frames === 0 ? NaN : pile.length / frames,
    mean: pile.length === 0 ? NaN : pile.reduce((sum, s) => sum + s.shake, 0) / pile.length,
    max: pile.length === 0 ? NaN : pile.reduce((best, s) => Math.max(best, s.shake), 0),
  });

  // The busiest minute of the run, because a run that is still for nine minutes and
  // throws the window around for one of them has a problem this share hides. The sentinel
  // has to be a mean no minute can beat rather than a missing object, or the loop below has
  // nothing to compare the first minute against.
  let worst = { at: 0, mean: -Infinity, max: NaN, frames: 0 };
  const minutes = new Map();
  for (const sample of samples) {
    const at = Math.floor(sample.t / 60) * 60;
    if (!minutes.has(at)) minutes.set(at, []);
    minutes.get(at).push(sample);
  }
  for (const [at, pile] of minutes) {
    const mean = pile.reduce((sum, s) => sum + s.shake, 0) / pile.length;
    if (mean > worst.mean) worst = { at, mean, max: part(pile).max, frames: pile.length };
  }

  return {
    frames,
    seconds: frames * FRAME_SECONDS,
    floor,
    still: frames === 0 ? NaN : 1 - moving.length / frames,
    rolling: frames === 0 ? NaN : samples.filter((s) => s.shake >= notice).length / frames,
    mean: frames === 0 ? NaN : total / frames,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    max: sorted.length === 0 ? NaN : sorted[sorted.length - 1],
    travel: total * FRAME_SECONDS,
    moving: part(moving),
    boss: part(boss),
    crowd: part(crowd),
    worst: worst,
  };
}

/** What one measured run was, as lines. Exported so a test can read them without a run. */
export function reportLines(report) {
  return [
    clock(report.seconds) + '  ' + int(report.frames) + ' frames'
      + '  still ' + percent(report.still)
      + '  rolling ' + percent(report.rolling),
    '  trauma  mean ' + dec(report.mean, 2) + 'px  p50 ' + dec(report.p50, 2)
      + '  p95 ' + dec(report.p95, 2) + '  p99 ' + dec(report.p99, 2)
      + '  max ' + dec(report.max, 1)
      + '  travel ' + dec(report.travel, 1) + 'px·s',
    '  while moving  ' + int(report.moving.frames) + ' frames, mean ' + dec(report.moving.mean, 1) + 'px',
    '  crowd  ' + percent(report.crowd.share) + ' of frames'
      + ', mean ' + dec(report.crowd.mean, 2) + 'px, max ' + dec(report.crowd.max, 1)
      + (report.boss.frames > 0
        ? '  |  boss  ' + percent(report.boss.share) + ' of frames'
          + ', mean ' + dec(report.boss.mean, 1) + 'px, max ' + dec(report.boss.max, 1)
        : '  |  no boss walked in'),
    '  busiest minute  ' + clock(report.worst.at) + '  mean ' + dec(report.worst.mean, 2)
      + 'px  max ' + dec(report.worst.max, 1),
  ];
}

/** The batch as two lines: how much of the run was still, and how much it moved when it did. */
export function batchLine(reports) {
  const still = reports.map((r) => r.still * 100);
  const max = reports.map((r) => r.max);
  const travel = reports.map((r) => r.travel);
  return 'batch of ' + reports.length + ' runs: median ' + dec(median(still), 1) + '% of frames still'
    + ' (worst ' + dec(Math.min(...still), 1) + '%)'
    + ', median peak ' + dec(median(max), 1) + 'px'
    + ', median ' + dec(median(travel), 1) + 'px·s of travel';
}

/** Only run when called as a command, so the tests can import the parts above. */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const opts = readArgs(process.argv.slice(2));
  const reports = [];

  // One frame at a time, into the pile the run that is playing owns. Trauma is a thing
  // that happens over time - a summary taken at the end of a run cannot see the shape of
  // it - so there is nothing for it but to stand by the frame loop and take a reading.
  // `playRuns` calls `onRun` between one run's last frame and the next run's first, which
  // is the moment the pile is whole and can be handed over and emptied.
  let samples = [];

  await playRuns({
    seeds: Array.from({ length: opts.runs }, (unused, i) => opts.seed + i),
    maxSeconds: opts.seconds,
    at: opts.at,
    policy: opts.policy,
    every: 0,
    onFrame: (game) => {
      samples.push({
        t: game.world.elapsed,
        shake: game.world.shake,
        boss: game.world.boss !== null,
      });
    },
    onRun: (summary) => {
      const report = shakeReport(samples);
      samples = [];
      reports.push(report);
      for (const line of reportLines(report)) console.log('seed ' + summary.seed + '  ' + line);
    },
  });

  if (reports.length > 1) {
    console.log(batchLine(reports));
    if (opts.needStill !== undefined) {
      const mid = median(reports.map((r) => r.still * 100));
      const reached = mid >= opts.needStill;
      console.log('stillness check: the median run sat still ' + dec(mid, 1)
        + '% of the time against the ' + dec(opts.needStill, 0) + '% it needs - '
        + (reached ? 'pass' : 'FAIL'));
      process.exitCode = reached ? 0 : 1;
    }
  } else if (opts.needStill !== undefined) {
    console.error('--need-still wants a batch: give it --runs 2 or more');
    process.exit(2);
  }
}
