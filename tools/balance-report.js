#!/usr/bin/env node
// Print the tables the balance is argued from.
//
//   node tools/balance-report.js                    8 runs, seeds 1-8, up to 15 min each
//   node tools/balance-report.js --runs 24          more runs, for the argument that matters
//   node tools/balance-report.js --seconds 300      a shorter window, for a quick look
//   node tools/balance-report.js --seed 7           start from a different seed
//   node tools/balance-report.js --bot naive        the plain player instead of the dodging one
//
// `tools/simulate.js` answers "did a run work"; this answers "what was the run made
// of". It plays the game with no browser, with the same bot and the same seeds, and
// reads back the sheet each run kept while it played (game/tally.js): what arrived
// and when, who killed what, how long a body took down once it was being fired at,
// and what the ship lost its hull to.
//
// Everything here is measured by playing, so everything here is only as good as the
// player. The aware bot dodges, picks its targets by distance, and never maneuvers
// on purpose: that makes the arrival and survival columns trustworthy and the time
// to kill a floor, because a person who focuses fire kills faster than this and
// never slower.
//
// It prints and it does not judge. There is no threshold in this file and no run is
// ever called good or bad by it - that is what the numbers are for later.
//
// One thing this cannot say: which gun was being flown. The weapon is not an upgrade line
// (game/weapons.js, and BALANCE.weapons), so every column below is an average over runs
// that happen to fly the plain pulse. For the numbers on the other guns see
// `node tools/simulate.js --weapon scatter --runs 40` and `node tools/power-ladder.js
// --weapon scatter`.

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootGame } from './headless/harness.js';
import { playOneRun, POLICIES, DEFAULT_POLICY } from './headless/bot.js';
import { clock, secs, share, int, dec, table } from './headless/tables.js';
import { BALANCE } from '../src/game/balance.js';
import { crowdBudget } from '../src/game/waves.js';

const ROOT = path.resolve(import.meta.dirname, '..');

const DEFAULTS = { seed: 1, runs: 8, seconds: 900, policy: undefined };

function readArgs(argv) {
  const opts = Object.assign({}, DEFAULTS);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      i++;
      return argv[i];
    };
    if (arg === '--seed') opts.seed = parseInt(next(), 10);
    else if (arg === '--runs') opts.runs = parseInt(next(), 10);
    else if (arg === '--seconds') opts.seconds = parseFloat(next());
    else if (arg === '--bot') opts.policy = next();
    else {
      console.error('unknown option: ' + arg);
      console.error('try: node tools/balance-report.js [--seed N] [--runs N] [--seconds N] [--bot name]');
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
  if (opts.policy !== undefined && !POLICIES[opts.policy]) {
    console.error('--bot wants one of: ' + Object.keys(POLICIES).join(', '));
    process.exit(2);
  }
  return opts;
}

/** `clock`, but a measurement that was never taken reads as nothing, not as no time. */
function when(seconds) {
  return Number.isFinite(seconds) ? clock(seconds) : '-';
}

/**
 * The crowd, watched once a frame while the run is being played. The tally knows
 * every birth and every death; what only a witness can say is how much of a crowd
 * was standing in front of the ship at any moment, and that is what a run feels
 * like.
 */
function watchCrowd() {
  const perKind = {};
  const touched = [];
  let frames = 0;
  let bodySum = 0;
  let bodyPeak = 0;
  let pointSum = 0;
  let pointPeak = 0;
  let budgetSum = 0;
  let elitePeak = 0;

  function rowFor(type) {
    let row = perKind[type];
    if (row === undefined) {
      row = { now: 0, total: 0, peak: 0 };
      perKind[type] = row;
    }
    return row;
  }

  return {
    /** One frame of it. Ignored before the run starts and after it ends. */
    frame(game) {
      const at = game.world;
      if (at.state !== game.STATE.PLAY) return;

      frames++;
      let bodies = 0;
      let points = 0;
      let gold = 0;
      for (const enemy of at.enemies) {
        bodies++;
        points += enemy.cost;
        if (enemy.elite) gold++;
        const row = rowFor(enemy.type);
        if (row.now === 0) touched.push(enemy.type);
        row.now++;
      }
      for (const type of touched) {
        const row = perKind[type];
        row.total += row.now;
        if (row.now > row.peak) row.peak = row.now;
        row.now = 0;
      }
      touched.length = 0;

      bodySum += bodies;
      if (bodies > bodyPeak) bodyPeak = bodies;
      pointSum += points;
      if (points > pointPeak) pointPeak = points;
      budgetSum += crowdBudget(at);
      if (gold > elitePeak) elitePeak = gold;
    },
    /** Everything measured, as means over the frames that were watched. */
    finish() {
      const watched = frames > 0 ? frames : 1;
      const kinds = {};
      for (const type of Object.keys(perKind)) {
        kinds[type] = { mean: perKind[type].total / watched, peak: perKind[type].peak };
      }
      return {
        frames: frames,
        kinds: kinds,
        bodies: { mean: bodySum / watched, peak: bodyPeak },
        points: { mean: pointSum / watched, peak: pointPeak },
        budgetMean: budgetSum / watched,
        elitePeak: elitePeak,
      };
    },
  };
}

function zeros(count) {
  const steps = [];
  for (let i = 0; i < count; i++) steps.push(0);
  return steps;
}

function addHistograms(into, from) {
  for (let i = 0; i < into.length; i++) into[i] += from[i];
}

/**
 * The whole tally folded over every run. The fields are the run's own (see
 * game/tally.js) with the same names, added together, plus the handful the report
 * needs for arrival and has nowhere else to get them from.
 */
function emptyTotal() {
  return {
    arrived: 0,
    eliteArrived: 0,
    killed: 0,
    eliteKilled: 0,
    lost: 0,
    firstSum: 0,        // the mean "first seen" over the runs that saw this kind at all
    firstRuns: 0,
    firstLatest: 0,
    hits: 0,
    damage: 0,
    hullOfKilled: 0,
    shotsOnKilled: 0,
    lifeSamples: 0,
    lifeSum: 0,
    lifeMax: 0,
    lifeHist: zeros(BALANCE.tally.life.buckets),
    fireSamples: 0,
    fireSum: 0,
    fireMax: 0,
    fireHist: zeros(BALANCE.tally.fire.buckets),
  };
}

function newReport() {
  return {
    lines: [],           // one line per run, for the table at the top
    kinds: {},           // kind name -> the total above
    crowd: {},           // kind name -> { sum, peak } of bodies, in body-frames
    hurtBy: {},          // 'body:tank' -> hulls lost to it
    diedOf: {},          // 'body:tank' -> runs that ended that way
    frames: 0,           // watched frames across every run, the denominator for means
    bodies: { sum: 0, peak: 0 },
    points: { sum: 0, peak: 0 },
    budgetSum: 0,
    elitePeak: 0,
    seconds: 0,          // game seconds simulated, across every run
    alive: 0,            // how many runs were still flying when the window shut
  };
}

function kindTotal(report, type) {
  let total = report.kinds[type];
  if (total === undefined) {
    total = emptyTotal();
    report.kinds[type] = total;
  }
  return total;
}

/** Fold one finished run into the report. */
function fold(report, summary, crowd) {
  const tally = summary.tally;
  const stats = summary.stats;

  report.lines.push({
    seed: summary.seed,
    player: summary.policy,
    end: summary.died ? 'died' : 'alive',
    seconds: summary.seconds,
    score: stats.score,
    level: stats.level,
    kills: stats.kills,
    shards: stats.collected,
    waves: stats.wave,
    hullLost: tally.hullLost,
    diedOf: summary.died ? tally.killedBy : '',
  });
  report.seconds += summary.seconds;
  if (!summary.died) report.alive++;

  for (const type of Object.keys(tally.kinds)) {
    const row = tally.kinds[type];
    const total = kindTotal(report, type);
    total.arrived += row.arrived;
    total.eliteArrived += row.eliteArrived;
    total.killed += row.killed;
    total.eliteKilled += row.eliteKilled;
    total.lost += row.lost;
    total.hits += row.hits;
    total.damage += row.damage;
    total.hullOfKilled += row.hullOfKilled;
    total.shotsOnKilled += row.shotsOnKilled;
    if (row.firstAt >= 0) {
      total.firstSum += row.firstAt;
      total.firstRuns++;
      if (row.firstAt > total.firstLatest) total.firstLatest = row.firstAt;
    }
    total.lifeSamples += row.lifeSamples;
    total.lifeSum += row.lifeSum;
    total.lifeMax = Math.max(total.lifeMax, row.lifeMax);
    addHistograms(total.lifeHist, row.lifeHist);
    total.fireSamples += row.fireSamples;
    total.fireSum += row.fireSum;
    total.fireMax = Math.max(total.fireMax, row.fireMax);
    addHistograms(total.fireHist, row.fireHist);
  }

  for (const label of Object.keys(tally.hurtBy)) {
    report.hurtBy[label] = (report.hurtBy[label] || 0) + tally.hurtBy[label];
  }
  if (summary.died && tally.killedBy) {
    report.diedOf[tally.killedBy] = (report.diedOf[tally.killedBy] || 0) + 1;
  }

  report.frames += crowd.frames;
  for (const type of Object.keys(crowd.kinds)) {
    const seen = crowd.kinds[type];
    let row = report.crowd[type];
    if (row === undefined) {
      row = { sum: 0, peak: 0 };
      report.crowd[type] = row;
    }
    row.sum += seen.mean * crowd.frames;
    row.peak = Math.max(row.peak, seen.peak);
  }
  report.bodies.sum += crowd.bodies.mean * crowd.frames;
  report.bodies.peak = Math.max(report.bodies.peak, crowd.bodies.peak);
  report.points.sum += crowd.points.mean * crowd.frames;
  report.points.peak = Math.max(report.points.peak, crowd.points.peak);
  report.budgetSum += crowd.budgetMean * crowd.frames;
  report.elitePeak = Math.max(report.elitePeak, crowd.elitePeak);
}

/**
 * The value at `p` of a histogram, read as the top of the step it falls in: a number
 * counted into steps is never a understatement of the thing it measures. It is then
 * held down to the largest one actually seen - a percentile cannot exceed the worst
 * case, and both numbers are in the same table, so the two had better agree.
 *
 * Exported so that it can be tested on its own; the tables above are its only caller.
 */
export function percentile(hist, spec, total, p, observedMax) {
  if (total <= 0) return NaN;
  let walked = 0;
  let edge = hist.length * spec.bucket;
  for (let i = 0; i < hist.length; i++) {
    walked += hist[i];
    if (walked >= total * p) {
      edge = (i + 1) * spec.bucket;
      break;
    }
  }
  return Number.isFinite(observedMax) ? Math.min(edge, observedMax) : edge;
}

/** Kinds come out in the order a run meets them, and then alphabetically. */
function orderedKinds(report) {
  const unlocks = (type) => (BALANCE.kinds[type] ? BALANCE.kinds[type].from : Infinity);
  return Object.keys(report.kinds).sort((a, b) => {
    const plan = unlocks(a) - unlocks(b);
    return plan !== 0 ? plan : a.localeCompare(b);
  });
}

const LEGEND = [
  'HOW THESE ARE MEASURED',
  '  arrived   a body the world put in play: the wave director, or a tank coming apart.',
  '  killed    brought down by the player. `standing` was still out there when the run',
  '            ended and `lost` came apart some other way, so neither of those is timed.',
  '  hull      the mean hull of the bodies of that kind the player did bring down.',
  '  shots     how many shots landed on a body, on average, before it came down.',
  '  fire      how long a killed body spent being fired at. Two hits less than three',
  '            shots apart (BALANCE.tally.volley, at the ship\'s own fire rate) count as',
  '            one stretch of fire, so a body clipped in passing spent almost none.',
  '  life      a killed body\'s whole life, from arriving to dying, travel included.',
  '  med / p90 counted into histograms - a life to the second, fire to the quarter -',
  '            and read off the top of their step, so they never flatter the run.',
];

function runLines(report) {
  const rows = report.lines.map((line) => [
    String(line.seed), line.player, line.end, clock(line.seconds),
    int(line.score), String(line.level), String(line.kills), String(line.shards),
    String(line.waves), String(line.hullLost), line.diedOf,
  ]);
  const mean = (pick) => report.lines.reduce((sum, line) => sum + pick(line), 0) / report.lines.length;
  rows.push([
    'mean', '', '', clock(mean((line) => line.seconds)),
    int(mean((line) => line.score)), dec(mean((line) => line.level)),
    dec(mean((line) => line.kills), 0), dec(mean((line) => line.shards), 0),
    dec(mean((line) => line.waves), 0), dec(mean((line) => line.hullLost), 1), '',
  ]);
  return table('THE RUNS', 'what the bot lived through, seed by seed', 'lllrrrrrrrl',
    ['seed', 'bot', 'end', 'time', 'score', 'level', 'kills', 'shards', 'waves', 'hulls lost', 'died of'],
    rows);
}

function crowdLines(report) {
  const rows = orderedKinds(report).filter((type) => report.crowd[type] !== undefined).map((type) => [
    type,
    dec(report.crowd[type].sum / report.frames),
    String(report.crowd[type].peak),
    share(report.crowd[type].sum, report.bodies.sum),
  ]);
  const note = [
    'bodies standing in the arena, averaged over every frame of every run',
    'the crowd held ' + dec(report.points.sum / report.frames) + ' points of enemy on average,'
      + ' against a budget of ' + dec(report.budgetSum / report.frames),
    'it peaked at ' + int(report.points.peak) + ' points in ' + int(report.bodies.peak) + ' bodies',
  ].join('\n');
  return table('ON SCREEN', note, 'lrrr', ['kind', 'mean', 'peak', 'share'], rows);
}

function arrivalLines(report) {
  const rows = orderedKinds(report).map((type) => [
    type,
    BALANCE.kinds[type] ? clock(BALANCE.kinds[type].from) : '-',
    when(report.kinds[type].firstSum / report.kinds[type].firstRuns),
    when(report.kinds[type].firstLatest),
    String(report.kinds[type].arrived),
  ]);
  return table('ARRIVAL', 'when each kind first turns up, against the minute the balance says it unlocks',
    'lrrrr', ['kind', 'planned', 'first seen', 'slowest run', 'arrived'], rows);
}

function killLines(report) {
  const kinds = orderedKinds(report);
  let killedAll = 0;
  for (const type of kinds) killedAll += report.kinds[type].killed;

  const rows = kinds.map((type) => {
    const t = report.kinds[type];
    return [
      type,
      String(t.arrived),
      String(t.killed),
      share(t.killed, killedAll),
      String(t.arrived - t.killed - t.lost),
      String(t.lost),
      dec(t.hullOfKilled / t.killed, 2),
      dec(t.shotsOnKilled / t.killed, 1),
      t.eliteKilled > 0 ? String(t.eliteKilled) : '',
    ];
  });
  return table('KILLING', 'what came down, what it was made of, and how much of the shooting it took',
    'lrrrrrrrr',
    ['kind', 'arrived', 'killed', 'share', 'standing', 'lost', 'hull', 'shots', 'gold'], rows);
}

function timeLines(report) {
  const rows = orderedKinds(report).map((type) => {
    const t = report.kinds[type];
    if (t.fireSamples === 0 && t.lifeSamples === 0) {
      return [type, '-', '-', '-', '-', '-', '-'];
    }
    return [
      type,
      secs(percentile(t.fireHist, BALANCE.tally.fire, t.fireSamples, 0.5, t.fireMax)),
      secs(percentile(t.fireHist, BALANCE.tally.fire, t.fireSamples, 0.9, t.fireMax)),
      secs(t.fireMax),
      when(t.lifeSum / t.lifeSamples),
      when(percentile(t.lifeHist, BALANCE.tally.life, t.lifeSamples, 0.5, t.lifeMax)),
      when(t.lifeMax),
    ];
  });
  return table('TIME TO KILL, AND HOW LONG THEY LAST',
    ['fire: the time a body spent being fired at; life: its whole life.',
      'A body the player never shot at, and one that never came down, are in neither.'].join('\n'),
    'lrrrrrr',
    ['kind', 'fire med', 'fire p90', 'fire max', 'life mean', 'life p90', 'life max'],
    rows);
}

function damageLines(report) {
  let dealt = 0;
  for (const type of Object.keys(report.kinds)) dealt += report.kinds[type].damage;
  const rows = orderedKinds(report).map((type) => {
    const t = report.kinds[type];
    return [type, int(t.damage), share(t.damage, dealt), int(t.hits)];
  });
  return table('WHERE THE SHOOTING WENT',
    [int(dealt) + ' points of hull taken off the crowd in ' + clock(report.seconds) + ' of play.',
      'The hits are every shot that landed, including on bodies that survived the run.'].join('\n'),
    'lrrr', ['kind', 'hull lost', 'share', 'hits'], rows);
}

function hurtLines(report) {
  const labels = Object.keys(report.hurtBy).sort((a, b) => report.hurtBy[b] - report.hurtBy[a]);
  let hulls = 0;
  for (const label of labels) hulls += report.hurtBy[label];
  const runs = report.lines.length - report.alive;

  const rows = labels.map((label) => [
    label,
    String(report.hurtBy[label]),
    share(report.hurtBy[label], hulls),
    report.diedOf[label] ? String(report.diedOf[label]) : '',
  ]);
  rows.push(['all', String(hulls), '100%', String(runs)]);
  return table('WHAT HURT THE SHIP', 'one entry per hull lost, and how many runs each of them finished',
    'lrrr', ['cause', 'hulls', 'share', 'runs it ended'], rows);
}

function eliteLines(report) {
  let arrived = 0;
  let killed = 0;
  for (const type of Object.keys(report.kinds)) {
    arrived += report.kinds[type].eliteArrived;
    killed += report.kinds[type].eliteKilled;
  }
  const waves = report.lines.reduce((sum, line) => sum + line.waves, 0);
  return table('THE GOLD', arrived + ' gold bodies arrived across ' + int(waves) + ' waves ('
    + share(arrived, waves) + ' of them), ' + killed + ' were brought down, and '
    + report.elitePeak + ' was the most ever standing at once', '', [], []);
}

/** Everything, as one page of text. */
export function renderReport(report, header) {
  return [
    header,
    '',
    LEGEND.join('\n'),
    '',
    runLines(report),
    '',
    crowdLines(report),
    '',
    arrivalLines(report),
    '',
    killLines(report),
    '',
    timeLines(report),
    '',
    damageLines(report),
    '',
    hurtLines(report),
    '',
    eliteLines(report),
  ].join('\n');
}

/** Play every run on one booted game and fold them into one report. */
export async function gather(options) {
  const opts = Object.assign({}, DEFAULTS, options);
  const policy = opts.policy === undefined ? DEFAULT_POLICY : opts.policy;
  const seeds = [];
  for (let i = 0; i < opts.runs; i++) seeds.push(opts.seed + i);

  const started = Date.now();
  const report = newReport();
  const game = await bootGame({ root: ROOT, seed: seeds[0] });
  for (let i = 0; i < seeds.length; i++) {
    if (i > 0) await game.resetToTitle(seeds[i]);
    const crowd = watchCrowd();
    const summary = playOneRun(game, {
      maxSeconds: opts.seconds,
      policy: policy,
      onFrame: (played) => crowd.frame(played),
    });
    fold(report, summary, crowd.finish());
    process.stderr.write('  seed ' + summary.seed + '  '
      + (summary.died ? 'died at ' : 'still flying at ') + clock(summary.seconds) + '\n');
  }
  game.stop();

  const header = [
    'STARFALL BALANCE REPORT',
    opts.runs + ' runs of the ' + policy + ' bot, seeds ' + seeds[0] + '-' + seeds[seeds.length - 1]
      + ', each cut short at ' + clock(opts.seconds) + '.',
    'Simulated ' + clock(report.seconds) + ' of game in ' + clock((Date.now() - started) / 1000)
      + (report.alive ? ' - ' + report.alive + ' run(s) were still flying when the window shut.'
        : ' - every run ended in a wreck.'),
  ].join('\n');
  return renderReport(report, header);
}

/** Only run when called as a command, so the tests can import the parts above. */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  console.log(await gather(readArgs(process.argv.slice(2))));
}
