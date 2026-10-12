#!/usr/bin/env node
// What a run is faced with once it has outlasted the schedule, and how long the strongest ship the
// game can describe survives it.
//
//   node tools/endless-gauge.js                    the curve, and one run played out into it
//   node tools/endless-gauge.js --minutes 40       print the curve this far past the win
//   node tools/endless-gauge.js --seed 7           a different run
//   node tools/endless-gauge.js --runs 4           four runs instead of one, seeds in a row
//   node tools/endless-gauge.js --no-play          the curve on its own - it costs a second
//   node tools/endless-gauge.js --cap 45           stop a run this many minutes past the win;
//                                                  the default, because four maxed builds were
//                                                  still flying at half an hour and a cap that bites
//                                                  measures nothing (see burialSummary)
//   node tools/endless-gauge.js --ranks 2          a shorter reach: no line deeper than this many
//                                                  ranks, which is closer to what a real run has
//                                                  earned by the last fight
//   node tools/endless-gauge.js --need-buried 20   exit non-zero unless most of the runs were
//                                                  buried, and their median was inside this much
//                                                  of an endless stretch
//
// Why this exists. PLAN 3.4 says an endless run "continues with all values scaling for as long as
// the player lasts", which is two claims and neither one is free:
//
//   **there is a curve**, and it keeps going after every ceiling in `BALANCE` has been spent;
//   **it ends**, because "as long as the player lasts" is a promise that the run does eventually stop.
//
// The first is arithmetic and this prints it: the crowd budget, the ceiling on standing bodies, and
// what a real body is made of, at every minute of endless, all read out of the game's own functions
// so that the table below cannot drift away from the code that plays it. The second cannot be
// arithmetic - a curve that grows forever is only a difficulty if something out there dies - so the
// second half plays a run and waits.
//
// The run it plays is not a plain one. It parks the clock on the last fight of the schedule, puts
// **every upgrade line in the game at its maximum** (86 ranks), and then lets the dodging bot beat
// the fight, press Space over the win, and fly on until it stops. That is an upper bound and not a
// typical build - a run parked at the Eclipse has earned roughly a fifth of those ranks in real play,
// and nothing out here can hand it the middle of the ladder (the mid-build gap NOTES has been carrying
// since milestone 3) - so read the number as the *most* endless a run can get: a player is weaker than
// every card in the game and better than a bot that only ever runs away, and the truth is below the
// number this prints. The number this file exists to keep an eye on is the median of `past the win`,
// and `--need-buried` is that number as an exit code. Two things to read off it honestly: the spread
// is wide (sixteen maxed runs came out between 14 and 33 minutes, so one seed proves nothing and the
// median of a batch is the number), and a run's exact length is a sample rather than a fingerprint -
// the same seed measured alone and measured second in a batch came out different, because one step of
// difference in the bot's aim is a different run, which is the same reason a seed only replays a run
// when the frame phase is fixed (NOTES, session 7). The cap and the RNG state in front of a batch are
// part of how it was measured, and a quoted number should say which they were.
//
// One trap in measuring a thing that might not end: a run stopped by `--cap` is not a run that ended.
// It is a run this instrument stopped watching, and its real length is longer than the cap and unknown
// to the tool. Counting those as if they had died at the cap makes a batch where nothing ever ended
// report the same median as one where everything did, which is the exact lie this file is here to
// avoid, so `burialSummary` counts the buried and the cut-off apart and the verdict says which of the
// two it was told.
//
// What the runs measured are not: a measure of the schedule (tools/simulate.js plays that), nor of
// how much the crowd is worth (tools/balance-report.js), nor of anything about a run that never won
// - every growth here is exactly 0 until a run has been handed its arena back.

import { pathToFileURL } from 'node:url';
import { bootGame } from './headless/harness.js';
import { botFrame, dashEscape, startBotRun, FRAME_MS, DEFAULT_POLICY } from './headless/bot.js';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { LINES, maxRanksOf } from '../src/game/upgrades.js';
import { makeEnemy } from '../src/game/kinds.js';
import { crowdBudget, bodyCeiling } from '../src/game/waves.js';
import { endlessTime } from '../src/game/endless.js';
import { scriptedRun } from './headless/scripted.js';
import { clock, dec, int } from './headless/tables.js';

const SECONDS_PER_MINUTE = 60;

/**
 * The wave kind that wins a comparison - the heaviest body, the fastest one, whatever is asked of
 * it. The curve is read off real bodies, so it needs to know which real ones to ask.
 */
function pickKind(measure) {
  let best = null;
  for (const name of Object.keys(BALANCE.kinds)) {
    if (best === null || measure(name) > measure(best)) best = name;
  }
  return best;
}

/** The body the hull column is read off, and the one the speed column is read off. */
const HEAVIEST = pickKind((name) => BALANCE.kinds[name].hull);
const SWIFTEST = pickKind((name) => BALANCE.kinds[name].speed);

/**
 * The endless curve, one row per minute.
 *
 * Every number is measured and not recomputed: the crowd budget and the body ceiling come from the
 * wave director's own questions, and what a body is made of comes from `makeEnemy` building one at
 * that moment of the run. Two kinds are built for it - the heaviest for the hull, the fastest for
 * the speed, because each column is about a different thing a player has to live with. `from` is
 * where the run's own clock is parked, the moment the arena is handed back: the growth is measured
 * from there and nowhere else.
 */
export function growthCurve(options) {
  const opts = options || {};
  const minutes = opts.minutes === undefined ? 20 : opts.minutes;
  const schedule = BALANCE.bosses.schedule;
  const from = opts.from === undefined ? schedule[schedule.length - 1].at : opts.from;

  const field = scriptedRun(1);
  field.endless = true;

  const rows = [];
  for (let minute = 0; minute <= minutes; minute++) {
    field.elapsed = from + minute * SECONDS_PER_MINUTE;
    field.endlessAt = from;
    const bulk = makeEnemy(field, HEAVIEST, 100, 100, null);
    const quick = makeEnemy(field, SWIFTEST, 100, 100, null);
    rows.push({
      minute: minute,
      past: minute * SECONDS_PER_MINUTE,
      budget: crowdBudget(field),
      bodies: bodyCeiling(field),
      hullKind: HEAVIEST,
      hull: bulk.hp,
      hullMul: bulk.hp / BALANCE.kinds[HEAVIEST].hull,
      speedKind: SWIFTEST,
      kindSpeed: quick.speed,
      speedMul: quick.speed / BALANCE.kinds[SWIFTEST].speed,
      // The ship this is being measured against: whatever the world is flying, which is the default
      // one until a tool says otherwise. The speed wall means something only next to this.
      shipSpeed: field.player.maxSpeed,
    });
  }
  return rows;
}

/** The first minute the speed wall is what is holding the curve, or null if it never gets there. */
export function speedWallAt(rows) {
  for (const row of rows) {
    if (Math.abs(row.speedMul - BALANCE.enemies.speedScaleCeil) < 1e-9) return row.minute;
  }
  return null;
}

/** The first minute the crowd has as many bodies to spend as it may stand, or null. */
export function bodyWallAt(rows) {
  const full = BALANCE.endless.growth.bodiesCeil;
  for (const row of rows) if (row.bodies >= full) return row.minute;
  return null;
}

/** The curve as lines: one per minute, and two lines saying when the walls close. */
export function curveLines(rows) {
  const lines = rows.map((row) => '  +' + row.minute + 'm'
    + '  hull x' + dec(row.hullMul, 1) + ' (' + row.hullKind + ' at ' + int(row.hull) + ' hp)'
    + '  speed x' + dec(row.speedMul, 2)
    + '  crowd ' + int(row.budget) + ' pts'
    + '  bodies ' + int(row.bodies)
    + '   (' + row.speedKind + ' at ' + int(row.kindSpeed) + ' px/s)');
  const speedAt = speedWallAt(rows);
  const bodiesAt = bodyWallAt(rows);
  lines.push('  the speed wall is ' + dec(BALANCE.enemies.speedScaleCeil, 2) + 'x'
    + (speedAt === null ? ', and this curve never reaches it'
      : ' at +' + speedAt + 'm - ' + rows[speedAt].speedKind + ' at '
        + int(rows[speedAt].kindSpeed) + ' px/s against the ship\'s '
        + int(rows[speedAt].shipSpeed)));
  lines.push('  the body wall is ' + int(BALANCE.endless.growth.bodiesCeil)
    + (bodiesAt === null ? ', and this curve never reaches it' : ' at +' + bodiesAt + 'm'));
  return lines;
}

/**
 * Play one run out into endless and report where it stopped, on a game that is sitting on its title
 * screen. The doors are the real ones: the bot fights the last fight on the schedule, presses Space
 * over the win (which is `continueRun` through main.js, not a way round it), and flies on until it
 * is a wreck or the cap runs out.
 */
function oneEndlessRun(game, opts) {
  const world = game.world;

  startBotRun(game);

  // Park, once the launch has been taken: the last fight on the schedule is due in a moment,
  // everything before it has been and gone, and the build is the whole deal spent. This is the same
  // trick tools/simulate.js --at uses, one frame after the launch, so the clock is put where the
  // tool wants it before the second frame of the run is simulated.
  const schedule = BALANCE.bosses.schedule;
  const due = schedule[schedule.length - 1].at;
  let ranks = 0;
  for (const line of LINES) {
    // The whole deal by default; `--ranks` keeps every line shallower, which is what a run that
    // earned its cards on the way up actually walks into the endless with.
    const deep = opts.ranks === undefined ? maxRanksOf(line.id) : Math.min(opts.ranks, maxRanksOf(line.id));
    world.upgrades[line.id] = deep;
    ranks += deep;
  }
  world.elapsed = due - 5;
  world.bossIndex = schedule.length - 1;
  world.player.level = ranks + 1;

  let handedBackAt = null;
  let hullsLost = 0;
  let lastHull = world.player.hull;
  let frames = 0;
  const limit = Math.ceil((opts.cap + due + 60) * 1000 / FRAME_MS);
  while (frames++ < limit) {
    if (world.state === STATE.WON) {
      // The card's own key, through the game's own handler. Until the guard is spent the press buys
      // nothing, which is what those five seconds are for (game/run.js `victoryCardIsAnswerable`).
      game.key('Space', true);
      game.key('Space', false);
    } else {
      // `botFrame` answers the level-up table by itself, so a build that cannot use what it is
      // offered still does not stall on it: what is being measured is the crowd, not the deal.
      botFrame(game, opts.policy);
      dashEscape(game);
    }
    game.step(FRAME_MS);

    if (handedBackAt === null && world.endless) handedBackAt = world.elapsed;
    if (world.player.hull < lastHull) hullsLost += lastHull - world.player.hull;
    lastHull = world.player.hull;

    if (world.state === STATE.OVER) break;
    if (handedBackAt !== null && endlessTime(world) >= opts.cap) break;
  }

  const stats = game.stats();
  const past = handedBackAt === null ? 0 : endlessTime(world);
  return {
    seed: world.seed,
    ranks: ranks,
    won: handedBackAt !== null,
    // What this run was cut off at, in minutes, so a batch can say where a `capped` run was stopped
    // rather than pretend it died there (burialSummary).
    capMinutes: opts.cap / SECONDS_PER_MINUTE,
    // How long the run flew once the arena had been handed back, and whether that ended or was cut
    // off by the cap. An endless run that is "still flying" is a run this instrument failed to bury.
    past: past,
    capped: handedBackAt !== null && past >= opts.cap - FRAME_MS / 1000,
    hullsLost: hullsLost,
    killedBy: stats.killedBy,
    bodies: stats.enemies,
    score: stats.score,
    level: stats.level,
    at: stats.t,
    policy: opts.policy,
  };
}

/**
 * Play a batch of them. One boot for the whole batch, the way every other batch in this folder
 * does it: the world lives in the modules, so a second `bootGame` would not start a second game -
 * `resetToTitle` is the door from one run to the next.
 */
export async function playEndlessRuns(options) {
  const opts = options || {};
  const seeds = opts.seeds === undefined ? [1] : opts.seeds;
  const run = {
    cap: (opts.cap === undefined ? 30 : opts.cap) * SECONDS_PER_MINUTE,
    ranks: opts.ranks,
    policy: opts.policy === undefined ? DEFAULT_POLICY : opts.policy,
  };
  const game = await bootGame({ seed: seeds[0] });
  const results = [];
  for (let i = 0; i < seeds.length; i++) {
    if (i > 0) await game.resetToTitle(seeds[i]);
    results.push(oneEndlessRun(game, run));
    // A batch is minutes of silence without this, and the long one is the interesting one.
    console.log(runLine(results[results.length - 1]));
  }
  game.stop();
  return results;
}

function runLine(result) {
  if (!result.won) {
    return 'seed ' + result.seed + ': the maxed build did not get past the last fight ('
      + clock(result.at) + ', killed by ' + (result.killedBy || 'the last fight') + ')';
  }
  return 'seed ' + result.seed + ': ' + (result.capped ? 'still flying at the cap, ' : 'buried ')
    + clock(result.past) + ' past the win'
    + '  (run clock ' + clock(result.at) + ', ' + int(result.ranks) + ' ranks,'
    + int(result.bodies) + ' bodies standing,'
    + ' ' + int(result.hullsLost) + ' hulls lost'
    + (result.capped ? '' : ', the last of them by ' + result.killedBy)
    + ', ' + result.policy + ' bot)';
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
}

/**
 * What a batch of played runs says about the second claim: that an endless run ends.
 *
 * Every duration here is in **minutes past the hand-back**, and the two kinds of run that did not
 * stop by themselves are counted apart from the ones that did:
 *
 *   `buried` - runs that went down, so their length is a fact;
 *   `cappedCount` - runs still flying when this instrument stopped watching, whose real length is
 *                    longer than `capMinutes` and is not known here.
 *
 * The median is taken over the buried only, which is the whole point of the split: a batch where
 * nothing ended has no median to report, and saying `null` is worth more than saying the cap. And
 * `majorityBuried` says whether the median is a description of the batch at all.
 *
 * `missed` counts the runs that never got as far as the endless stretch; they are neither of the two
 * and the verdict treats them as the failure they are.
 */
export function burialSummary(results) {
  const reached = results.filter((r) => r.won);
  const buried = reached
    .filter((r) => !r.capped)
    .map((r) => r.past / SECONDS_PER_MINUTE)
    .sort((a, b) => a - b);
  const capMinutes = results.length === 0 ? 0 : results[0].capMinutes;
  return {
    runs: results.length,
    reached: reached.length,
    missed: results.length - reached.length,
    buried: buried,
    cappedCount: reached.length - buried.length,
    median: buried.length === 0 ? null : median(buried),
    shortest: buried.length === 0 ? null : buried[0],
    longest: buried.length === 0 ? null : buried[buried.length - 1],
    majorityBuried: buried.length * 2 > reached.length,
    capMinutes: capMinutes,
  };
}

/** The batch as one line, saying which of the two kinds of run it saw. */
export function burialLine(summary) {
  const parts = [];
  if (summary.missed > 0) {
    parts.push(summary.missed + ' of the ' + summary.runs + ' runs never reached the endless stretch');
  }
  if (summary.buried.length === 0) {
    parts.push('not one run was buried in '
      + dec(summary.capMinutes, 0) + ' minutes of endless - the curve is not ending the run');
  } else {
    parts.push(summary.buried.length + ' of ' + summary.reached
      + ' runs buried, ' + dec(summary.shortest, 1) + 'm to ' + dec(summary.longest, 1)
      + 'm past the win, median ' + dec(summary.median, 1) + 'm');
  }
  if (summary.cappedCount > 0) {
    parts.push(summary.cappedCount + ' still flying at the ' + dec(summary.capMinutes, 0)
      + 'm cap, so those lasted at least that long');
  }
  return '  ' + parts.join('; ');
}

/**
 * `--need-buried` as a yes or a no, with the reason beside it.
 *
 * Three things have to be true, in this order: every run got as far as the endless stretch (a batch
 * that never got there says nothing about it); most of them actually ended, or there is no median
 * that describes the batch; and the median of the ones that ended is inside what is allowed.
 */
export function burialVerdict(summary, needBuried) {
  if (summary.runs === 0) return { pass: false, why: 'nothing was played' };
  if (summary.missed > 0) {
    return {
      pass: false,
      why: summary.missed + ' of ' + summary.runs
        + ' runs never reached the endless stretch, so this batch cannot say how long one lasts',
    };
  }
  if (!summary.majorityBuried) {
    return {
      pass: false,
      why: 'only ' + summary.buried.length + ' of ' + summary.runs + ' were buried before the '
        + dec(summary.capMinutes, 0) + 'm cap, so how long the run really lasts is not measured here',
    };
  }
  return {
    pass: summary.median <= needBuried,
    why: 'the median run lasted ' + dec(summary.median, 1)
      + ' minutes of endless against the ' + dec(needBuried, 1) + ' it is allowed',
  };
}

function readArgs(argv) {
  const opts = { minutes: 20, seed: 1, runs: 1, play: true, cap: 45, needBuried: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      i++;
      return argv[i];
    };
    if (arg === '--minutes') opts.minutes = parseInt(next(), 10);
    else if (arg === '--seed') opts.seed = parseInt(next(), 10);
    else if (arg === '--runs') opts.runs = parseInt(next(), 10);
    else if (arg === '--cap') opts.cap = parseFloat(next());
    else if (arg === '--ranks') opts.ranks = parseInt(next(), 10);
    else if (arg === '--no-play') opts.play = false;
    else if (arg === '--need-buried') opts.needBuried = parseFloat(next());
    else {
      console.error('unknown option: ' + arg);
      process.exit(2);
    }
  }
  if (!(opts.minutes > 0)) {
    console.error('--minutes wants how many minutes of endless to print');
    process.exit(2);
  }
  if (!(opts.seed >= 0) || !(opts.runs >= 1)) {
    console.error('--seed wants a seed and --runs how many runs to play from it');
    process.exit(2);
  }
  if (!(opts.cap > 0)) {
    console.error('--cap wants how many minutes of endless a run is allowed to last');
    process.exit(2);
  }
  if (opts.ranks !== undefined && !(opts.ranks > 0)) {
    console.error('--ranks wants how deep a line the build is allowed to reach');
    process.exit(2);
  }
  return opts;
}

/** Only run when called as a command, so the tests can import the parts above. */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const opts = readArgs(process.argv.slice(2));
  const g = BALANCE.endless.growth;
  console.log('the endless curve - '
    + 'hull +' + g.hullPerMinute + '/min, speed +' + g.speedPerMinute + '/min to '
    + dec(BALANCE.enemies.speedScaleCeil, 2) + 'x, crowd +' + g.crowdPerMinute + '/min, bodies +'
    + g.bodiesPerMinute + '/min to ' + g.bodiesCeil);
  for (const line of curveLines(growthCurve({ minutes: opts.minutes }))) console.log(line);

  if (opts.play) {
    const results = await playEndlessRuns({
      seeds: Array.from({ length: opts.runs }, (unused, k) => opts.seed + k),
      cap: opts.cap,
      ranks: opts.ranks,
    });
    const summary = burialSummary(results);
    console.log(burialLine(summary));
    if (opts.needBuried !== undefined) {
      const verdict = burialVerdict(summary, opts.needBuried);
      console.log('burial check: ' + verdict.why + ' - ' + (verdict.pass ? 'pass' : 'FAIL'));
      process.exitCode = verdict.pass ? 0 : 1;
    }
  }
}
