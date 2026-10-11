#!/usr/bin/env node
// PLAN 10's weapon parity, measured: every primary priced against every other, and a verdict.
//
//   node tools/weapon-ladder.js                          12 seeds a gun, a 15 minute window each
//   node tools/weapon-ladder.js --seeds 1-24 --shards 8  a bigger read in a few minutes
//   node tools/weapon-ladder.js --guns pulse,lance       two of them
//   node tools/weapon-ladder.js --seconds 300            a shorter window
//   node tools/weapon-ladder.js --bot human --picks random   the careless person, not the careful
//                                                          player every other number here is
//                                                          measured with
//   node tools/weapon-ladder.js --knots-only             the two bot-free tables, in seconds
//   node tools/weapon-ladder.js --quiet                  the verdict and nothing else
//   node tools/weapon-ladder.js --out /tmp/l.jsonl       keep the runs; --in pools them again
//
// `--guns a,b` prices a subset, `--knot-seconds` and `--knot-seeds` size the bot-free tables, and
// `--shards K` splits the seeds over K child processes because one game per process is the
// harness's rule and 5 guns x 16 seeds x 15 minutes is about eight minutes of this box otherwise.
//
// When rows are pooled from files with `--in`, the `--bot`, `--picks` and `--seconds` flags are
// labels on rows that were already played and nothing checks them: pass them as they were when the
// runs were played, or the header will describe somebody else's batch. The seeds are not guessed at
// - they are counted out of the rows.
//
// PLAN's sentence is one line and it is a check: *tune every weapon so that none is over 25%
// better than the others in the balance report.* `tools/balance-report.js` cannot see the primary
// at all - the gun is not an upgrade line (game/weapons.js) - so this file is where that sentence
// gets a number. The band is PLAN's and is not tuned here: `BAND` is 1.25 and the verdict is the
// ratio of the best gun's middle run to the worst gun's, on the same seeds.
//
// Three yardsticks, because each one lies on its own and the three together say *which* one is
// lying, which is the whole difference between tuning a gun and tuning the measuring tape:
//
//   **the knots, chipped** - hull a second off a knot of bodies that cannot die, aimed by the
//   clock and not by a player (`tools/power-ladder.js`'s three knots). What a gun's geometry buys
//   at its widest. It cannot see a kill: a body that cannot die never mind how much hull it is
//   missing, so a 5-hull beam through a 1-hull body is scored the same as a 1-hull shot through it.
//
//   **the knots, felled** - the same three knots planted with the hull a body carries once the
//   crowd's ramp has spent itself (`bodyHull`, asked of game/kinds.js rather than written in here),
//   a body that comes apart put back where it stood and counted (power-ladder's pinning, plus
//   `revive`). This is the column the game *pays* in: shards, and so XP, and so levels, are paid per
//   body and not per hull, so a gun that spends 5 hull on a 3-hull body buys a body with it and
//   throws two hull away - which is what the lance's row did until session 96, and what `cost/kill`
//   is there to catch in any row that starts doing it again.
//
//   **the run** - the bot plays N seeds of each gun through the real game, and the middle run of
//   each batch is what gets compared. This is the only column that says what a player gets, and it
//   carries the bot's own habits with it. The habit to expect is the aim - the bot parks its cursor
//   on the nearest body - and it is worth something to a line gun. It is worth less than it looks:
//   NOTES session 91 gave the bot a lane-finding aim, measured it lining up 4.8 bodies an aim, and
//   the lance's median run came out *no better*. So a gun outside the band is still not tuned until
//   the two knot columns say which side of the band it is on - **below them too** is a weak gun, and
//   **above them** is one the instrument cannot drive, and buffing that is a nerf of every player
//   who can - but a knot reading of "above" is no longer a licence to blame the bot on its own.
//
// Which is why only the run column is gated. The knots are not, and cannot be: a shotgun is
// supposed to own a press (the scatter is 3x the pulse on a ring knot *by design*, NOTES session
// 33), and a knot is a geometry rather than a fight. Its spread is printed so that a `FAIL` up
// there can be read as a fact about the shape of the guns and not as a red light.
//
// The band used to read red, and wide: sixteen seeds a gun, the aware bot, a fifteen minute window -
// scatter 120,642, pulse 118,867, arc 110,868, swarm 35,960, lance 5,658, which was 21.32x best over
// worst against the 1.25x allowed. The knot columns said neither outlier was short of damage - the
// lance was the strongest of the five on the ring and on the column - so what a run is actually
// buying is not hull a second but *bodies* a second, because XP is paid per body and a run's damage
// is made of levels. NOTES session 91 has all of that, and session 96 has the re-price it led to:
// the lance's pull now costs one body instead of one and two thirds and its trigger pulls 2.6 times
// a second instead of 0.9, and the Swarm's pull throws a pair of shells instead of one. Same sixteen
// seeds, same window: **scatter 120,642, swarm 125,756, pulse 118,867, lance 111,963, arc 110,868 -
// 1.13x best over worst, PASS**, with every one of the five outlasting the window and a middle run of
// level 63-66.
//
// The lesson that is worth keeping out of that, because it took eight milestones of looking at the
// wrong column to learn it: a heavy gun's income is what it *touches*, and a slow trigger cannot buy
// its way out of that with a bigger pull. Twice the width of the lance's beam did nothing (5,025);
// three beams a pull did nothing (4,891); a longer-reach missile did nothing (18,050); the rate did
// everything (57,852 at 1.8/s). What a press asks for is thinned continuously.
//
// Same rules as every other measurement here: every gun plays the *same* seeds, in the same order,
// so the comparison is a paired one and a lucky seed is lucky for all five; nothing is judged but
// the one band; and `--shards K` splits the seeds over K child processes because one game per
// process is the harness's rule and 5 guns x 24 seeds x 15 minutes does not fit in a session
// otherwise (NOTES session 89).

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { BALANCE } from '../src/game/balance.js';
import { WEAPONS, setWeapon } from '../src/game/weapons.js';
import { makeEnemy } from '../src/game/kinds.js';
import { scriptedRun, stepTheWorld } from './headless/scripted.js';
import { KNOTS, pin, revive } from './power-ladder.js';
import { playBatches, POLICIES, PICKS } from './headless/bot.js';
import { median } from './simulate.js';
import { parseSeeds, splitShards } from './run-shape.js';
import { clock, int, dec, table } from './headless/tables.js';

/** PLAN 10: no weapon over 25% better than the others. Pinned in test/weapon-ladder.test.mjs. */
export const BAND = 1.25;

const STEP = BALANCE.sim.step;
const IMMORTAL = 1e9;

const DEFAULTS = {
  seed: 1, runs: 12, seconds: 900, policy: 'aware', picks: 'wise', guns: null,
  shards: 1, outfile: '', infiles: [], playOnly: false, knotsOnly: false,
  knotSeconds: 6, knotSeeds: 4, quiet: false,
};

/** The primaries on offer, in the order the game offers them. */
export const ALL_GUNS = WEAPONS.map((gun) => gun.id);

/** `--guns pulse,lance`, checked against what the game actually has. */
export function gunList(spec) {
  if (spec === null || spec === undefined) return ALL_GUNS.slice();
  const ids = String(spec).split(',').map((id) => id.trim()).filter((id) => id !== '');
  for (const id of ids) {
    if (ALL_GUNS.indexOf(id) === -1) {
      throw new Error('--guns: no primary is called ' + id + '; the game has ' + ALL_GUNS.join(', '));
    }
  }
  if (ids.length < 2) throw new Error('--guns wants at least two guns to compare');
  return ids;
}

/** Read the command line into plain values, and throw on anything it does not understand. */
export function readArgs(argv) {
  const opts = Object.assign({}, DEFAULTS, { seeds: null });
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      i++;
      if (i >= argv.length) throw new Error(flag + ' needs a value');
      return argv[i];
    };
    if (flag === '--seed') opts.seed = Number(value());
    else if (flag === '--runs') opts.runs = Number(value());
    else if (flag === '--seeds') opts.seeds = value();
    else if (flag === '--seconds') opts.seconds = Number(value());
    else if (flag === '--bot') opts.policy = value();
    else if (flag === '--picks') opts.picks = value();
    else if (flag === '--guns') opts.guns = value();
    else if (flag === '--shards') opts.shards = Number(value());
    else if (flag === '--knot-seconds') opts.knotSeconds = Number(value());
    else if (flag === '--knot-seeds') opts.knotSeeds = Number(value());
    else if (flag === '--out') opts.outfile = value();
    else if (flag === '--in') opts.infiles.push(value());
    else if (flag === '--knots-only') opts.knotsOnly = true;
    else if (flag === '--play-only') opts.playOnly = true;
    else if (flag === '--quiet') opts.quiet = true;
    else throw new Error('unknown flag: ' + flag);
  }
  if (POLICIES[opts.policy] === undefined) {
    throw new Error('--bot wants one of: ' + Object.keys(POLICIES).join(', '));
  }
  if (PICKS[opts.picks] === undefined) {
    throw new Error('--picks wants one of: ' + Object.keys(PICKS).join(', '));
  }
  opts.guns = gunList(opts.guns);
  if (!(opts.seconds > 0) || !(opts.runs >= 1)) {
    throw new Error('--seconds wants a window longer than none and --runs at least one run');
  }
  if (opts.infiles.length > 0 && opts.shards > 1) {
    throw new Error('--in pools runs that were already played; it has nothing left to shard');
  }
  if (opts.playOnly && opts.outfile === '') throw new Error('--play-only needs --out to write to');
  if (!(opts.knotSeconds > 0) || !(opts.knotSeeds >= 1)) {
    throw new Error('--knot-seconds and --knot-seeds want a positive window and at least one seed');
  }
  return opts;
}

/** The seeds to play, either `--seeds 1-24` / `--seeds 1,3,5` or `--seed N --runs M`. */
export function seedList(opts) {
  return opts.seeds !== null ? parseSeeds(opts.seeds)
    : Array.from({ length: opts.runs }, (unused, i) => opts.seed + i);
}

/* ------------------------------------------------------------------ the knots */

/**
 * What a body of the knot is worth in hull, asked of the game rather than invented.
 *
 * The knots are planted with a swarmling, and a swarmling is one hull at the start of a run and
 * three once the crowd has stopped growing (game/kinds.js scales a body's hull with the clock up
 * to `enemies.hpScaleMax`, so the ramp is spent `hpScaleWindow x hpScaleMax` seconds in). A knot
 * of 1-hull bodies would price every heavy gun as a nonsense tax and a knot of 10-hull ones would
 * let it off entirely, so the ladder plants what a body is worth once the ramp has run: that is
 * where a fifteen minute window spends nearly all of itself.
 */
export function bodyHull() {
  const field = scriptedRun(11);
  field.elapsed = BALANCE.enemies.hpScaleWindow * BALANCE.enemies.hpScaleMax;
  return makeEnemy(field, 'swarmling', 0, 0, {}).hp;
}

/** The hull still on a knot. A body with none left counts as nothing, not as a negative. */
function hullOn(bodies) {
  let total = 0;
  for (const body of bodies) total += body.hp > 0 ? body.hp : 0;
  return total;
}

/**
 * Hold the trigger on one knot for `seconds` and answer what came off it and what came down.
 *
 * `hp` is the whole difference between the two knot tables: given a number, the knot is planted
 * with that much hull and every body that comes apart is wound up and put back where it stood, so
 * the window is spent on the same crowd and the answer is a rate rather than a stopwatch. Left
 * out, the bodies cannot die at all - the rule `tools/power-ladder.js` exists on, for the same
 * reason: a knot that dies partway through a window stops being the crowd the measurement is
 * about. Same geometry either way (a knot is pinned, so nothing moves), which is what lets the two
 * columns be read as one question: what a gun spends, and what it buys.
 *
 * No bot is in the room for either column: the aim is the knot's own (`power-ladder.js`: a gun
 * pointed at the sky measures the sky), so no player's habits are in these numbers.
 */
function knotRun(weapon, knotAt, seed, seconds, hp) {
  const field = scriptedRun(seed);
  // A level-up would pause the arena in the middle of a window, and a measurement of a gun must
  // not be a measurement of the pause (power-ladder.js again).
  field.xpNeed = Infinity;
  setWeapon(field, weapon);
  const knot = KNOTS[knotAt];
  const bodies = knot.build(field, hp === undefined ? IMMORTAL : hp);
  const mortal = hp !== undefined;
  const ship = field.player;

  let hull = 0;
  let kills = 0;
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    pin(bodies);
    const before = hullOn(bodies);
    field.shards.clear();
    field.xp = 0;
    const where = knot.aim(ship);
    stepTheWorld({ firing: true, aimX: where.x, aimY: where.y });
    hull += before - hullOn(bodies);
    if (mortal) kills += revive(field, bodies);
  }
  return { hull: hull / seconds, kills: kills / seconds };
}

/** Mean over `seeds` of one gun on one knot. One seed is a coin toss. */
export function knotRate(weapon, knotAt, seeds, seconds, hp) {
  let hull = 0;
  let kills = 0;
  for (let i = 0; i < seeds; i++) {
    const run = knotRun(weapon, knotAt, 11 + i, seconds, hp);
    hull += run.hull;
    kills += run.kills;
  }
  return { hull: hull / seeds, kills: kills / seeds };
}

/** Every gun against every knot, chipped and felled. */
export function knotsOf(guns, seeds, seconds) {
  const alive = bodyHull();
  const out = [];
  for (const gun of guns) {
    const knots = [];
    for (let k = 0; k < KNOTS.length; k++) {
      knots.push({
        chipped: knotRate(gun, k, seeds, seconds, undefined),
        felled: knotRate(gun, k, seeds, seconds, alive),
      });
    }
    out.push({ gun, knots });
  }
  return out;
}

/** The widest gap between two numbers of one column, as a multiple of the smaller. */
export function spread(values) {
  const some = values.filter((value) => Number.isFinite(value) && value > 0);
  if (some.length < 2) return 1;
  return Math.max(...some) / Math.min(...some);
}

/** Across a row: how much the same gun's worth swings with the shape of the crowd. */
function rowSpread(row, pick) {
  return spread(row.knots.map(pick));
}

/** Down a column: how far apart the guns are when the crowd stands in one particular shape. */
function columnSpread(knots, knotAt, pick) {
  return spread(knots.map((row) => pick(row.knots[knotAt])));
}

/** `the ring`, `the column`, `the near field` - short enough to head a column with. */
const KNOT_NAME = KNOTS.map((knot) => knot.name.replace(/^the /, ''));

const byHull = (knot) => knot.chipped.hull;
const byKills = (knot) => knot.felled.kills;

/** hull a second off a knot that cannot die, one row a gun and a between-guns row at the foot. */
export function chippedTable(knots) {
  const rows = knots.map((row) => [row.gun]
    .concat(row.knots.map((knot) => dec(knot.chipped.hull, 1)))
    .concat(dec(rowSpread(row, byHull), 2) + 'x'));
  rows.push(['every gun'].concat(KNOTS.map((unused, k) => dec(columnSpread(knots, k, byHull), 2) + 'x'))
    .concat(''));
  return table(
    'the knots, chipped: hull a second off bodies that cannot die',
    `Aimed by the clock, no bot in the room. ${KNOT_NAME.join(', ')} are the three knots of\n`
    + 'tools/power-ladder.js, planted the same way here.\n'
    + 'across knots is how much the same gun is worth in one shape of crowd versus another; the last\n'
    + 'row is how far apart the guns are from each other in one shape. Neither is gated: a knot is a\n'
    + 'geometry, and a shotgun is supposed to own a press (the scatter is 3x the pulse on a ring by\n'
    + 'design, NOTES session 33).',
    'l' + 'r'.repeat(KNOTS.length) + 'r',
    ['gun'].concat(KNOT_NAME.map((name) => name + ' hull/s')).concat('across knots'),
    rows);
}

/** bodies a second off a knot of mortal ones, one row a gun, with what a kill costs beside it. */
export function felledTable(knots) {
  const rows = knots.map((row) => [row.gun]
    .concat(row.knots.map((knot) => dec(knot.felled.kills, 1)))
    // What a body costs the gun in damage, on the knot that is what a real fight looks like (three
    // bodies at the distance a press keeps): the chipped hull a second over the bodies it felled.
    // 3.00 is a gun that never pays more than a mid-run body is worth; 5.00 is a beam through a
    // swarmling, and the run is paid in bodies - a shard drops per kill (game/enemies.js), so the
    // hull a heavy hit spends past a body's hull buys no XP at all.
    .concat(dec(row.knots[2].chipped.hull / row.knots[2].felled.kills, 2))
    .concat(dec(rowSpread(row, byKills), 2) + 'x'));
  rows.push(['every gun'].concat(KNOTS.map((unused, k) => dec(columnSpread(knots, k, byKills), 2) + 'x'))
    .concat('', ''));
  return table(
    'the knots, felled: bodies a second off the same knots, mortal and put back where they stood',
    'This is the column the game pays in: a shard, and so a level, is paid per body and not per hull.\n'
    + 'cost/kill is the near knot\u2019s chipped hull over its felled kills - what a body costs the gun in\n'
    + 'damage. 3.00 is a gun that never pays more than a mid-run body is worth; 5.00 is a 5-hull beam\n'
    + 'through a 3-hull body, and the two hull past it buy no XP at all - the tax the lance\u2019s row\n'
    + 'carried until session 96. The two spread columns are printed and not gated, for the same reason\n'
    + 'as above.',
    'l' + 'r'.repeat(KNOTS.length) + 'rr',
    ['gun'].concat(KNOT_NAME.map((name) => name + ' kills/s')).concat(['cost/kill', 'across knots']),
    rows);
}

/* ------------------------------------------------------------------- the run */

/** What the run took off bodies, whatever it took it off: the tally's own sheet (game/tally.js). */
function damageOf(summary) {
  let total = 0;
  for (const kind of Object.values(summary.tally.kinds)) total += kind.damage;
  return total;
}

/** One finished run, down to the columns this ladder reads. */
export function rowOf(summary) {
  return {
    gun: summary.stats.weapon,
    seed: summary.seed,
    seconds: summary.seconds,
    died: summary.died,
    won: summary.won,
    score: summary.stats.score,
    level: summary.stats.level,
    kills: summary.stats.kills,
    damage: damageOf(summary),
  };
}

export function readRows(files) {
  const rows = [];
  for (const file of files) {
    if (!existsSync(file)) throw new Error('--in: no such file: ' + file);
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line.trim() !== '') rows.push(JSON.parse(line));
    }
  }
  if (rows.length === 0) throw new Error('--in: ' + files.join(' ') + ' held no runs');
  return rows;
}

export function writeRows(file, rows) {
  writeFileSync(file, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
}

/** Play one process's share: every gun, over these seeds, one boot for all of it. */
async function play(guns, seeds, opts) {
  const rows = [];
  await playBatches(guns.map((gun) => ({
    seeds: seeds,
    maxSeconds: opts.seconds,
    policy: opts.policy,
    picks: opts.picks,
    weapon: gun,
    // A batch of long runs is minutes of silence without this, and a silent terminal cannot be
    // told apart from a stuck one.
    onRun: (summary) => {
      rows.push(rowOf(summary));
      process.stdout.write('.');
    },
  })));
  return rows;
}

/** The same guns and seeds again, played by K child processes and pooled. */
async function playSharded(guns, seeds, opts) {
  const chunks = splitShards(seeds, opts.shards);
  const files = chunks.map((unused, k) => tmpdir() + '/starfall-weapon-ladder-'
    + process.pid + '-' + k + '.jsonl');
  const pass = ['--seconds', String(opts.seconds), '--bot', opts.policy, '--picks', opts.picks,
    '--guns', guns.join(','), '--knot-seconds', String(opts.knotSeconds),
    '--knot-seeds', String(opts.knotSeeds)];
  const kids = chunks.map((chunk, k) => new Promise((resolve, reject) => {
    const kid = spawn(process.execPath, [fileURLToPath(import.meta.url),
      '--seeds', chunk.join(','), '--play-only', '--out', files[k]].concat(pass),
    { stdio: ['ignore', 'ignore', 'inherit'] });
    kid.on('error', reject);
    kid.on('exit', (code) => resolve(code === 0 ? null
      : new Error('shard ' + k + ' (seeds ' + chunk.join(',') + ') exited ' + code)));
  }));
  const failed = (await Promise.all(kids)).find((err) => err !== null);
  if (failed !== undefined) throw failed;
  try {
    return readRows(files);
  } finally {
    files.forEach((file) => {
      try { unlinkSync(file); } catch (err) { /* already gone is not a failure */ }
    });
  }
}

/** One gun's middle run: what the batch of them was, and what it was worth. */
export function standingOf(gun, rows, cap) {
  const mine = rows.filter((row) => row.gun === gun);
  if (mine.length === 0) throw new Error('no runs were played for ' + gun);
  const mean = (pick) => mine.reduce((sum, row) => sum + pick(row), 0) / mine.length;
  return {
    gun: gun,
    runs: mine.length,
    // A run the window cut short, not a survival: a win is an ending of its own (game/run.js).
    atCap: mine.filter((row) => !row.died && !row.won).length,
    died: mine.filter((row) => row.died).length,
    seconds: median(mine.map((row) => row.seconds)),
    score: median(mine.map((row) => row.score)),
    level: median(mine.map((row) => row.level)),
    kills: median(mine.map((row) => row.kills)),
    // The middle run's bodies a second, which is what a run is actually paid in (a shard per kill,
    // a level per shard) and the currency PLAN 10's re-price was read on. From the two medians
    // above rather than a mean of per-run rates, so it is the same run the rest of the row is.
    bodies: median(mine.map((row) => row.kills)) / median(mine.map((row) => row.seconds)),
    damage: mean((row) => row.damage / (row.seconds || 1)),
    cap: cap,
  };
}

/** Every gun's middle run, in the order the guns were asked for. */
export function standingsOf(guns, rows, cap) {
  return guns.map((gun) => standingOf(gun, rows, cap));
}

/** The best and the worst of a column, and the multiple between them. */
export function spanOf(standings, pick) {
  let best = standings[0];
  let worst = standings[0];
  for (const one of standings) {
    if (pick(one) > pick(best)) best = one;
    if (pick(one) < pick(worst)) worst = one;
  }
  const floor = pick(worst);
  return {
    best: best.gun, worst: worst.gun,
    ratio: floor > 0 ? pick(best) / floor : Infinity,
    bestValue: pick(best), worstValue: pick(worst),
  };
}

/**
 * PLAN's sentence, judged on the one column that says what a player gets.
 *
 * The middle run's score is the yardstick: it is what a run is worth (the hangar prices its dust
 * off it, and `tools/balance-report.js`'s headline is a score). Kills and level are printed beside
 * it because they say *why* a gun is where it is, but they are not gated: three columns on the
 * same five runs are three chances to fail, and one of them is the question.
 */
export function verdictOf(standings) {
  const span = spanOf(standings, (standing) => standing.score);
  const pass = span.ratio <= BAND;
  const lines = [
    'the spread on the middle run: ' + span.best.toUpperCase() + ' ' + int(span.bestValue)
    + ' over ' + span.worst.toUpperCase() + ' ' + int(span.worstValue)
    + ' = ' + dec(span.ratio, 2) + 'x, against the ' + dec(BAND, 2) + 'x PLAN allows - '
    + (pass ? 'PASS' : 'FAIL'),
  ];
  if (!pass) {
    lines.push(['Read it against the two knot tables before anything is tuned. A gun under them too',
      'is a weak gun, and its row in BALANCE.weapons is what moves; a gun above them is one',
      'this instrument cannot drive, and buffing it to match may be a nerf of every player who',
      'can. Check the driver before the row: NOTES session 91 gave the bot a lane-aiming eye and',
      'the lance did not get better. And check what the row buys *a second* and not only what it',
      'buys a pull - the whole of the 21x this tool was written about was two rows whose triggers',
      'were too slow to touch as many bodies as the rest, and no amount of width, fan or hull',
      'moved them (session 96).'].join('\n'));
  }
  const also = ['kills', 'bodies', 'level'].map((key) => {
    const other = spanOf(standings, (standing) => standing[key]);
    return key + ': ' + other.best.toUpperCase() + ' over ' + other.worst.toUpperCase()
      + ' = ' + dec(other.ratio, 2) + 'x';
  });
  lines.push('beside it, ungated - ' + also.join(', '));
  return { pass, ratio: span.ratio, best: span.best, worst: span.worst, lines };
}

/** The middle run of each batch, one row a gun. */
export function ladderTable(standings, opts) {
  const best = Math.max(...standings.map((standing) => standing.score));
  const rows = standings.map((one) => [
    one.gun,
    one.atCap + '/' + one.runs,
    clock(one.seconds),
    int(one.score),
    dec(one.score / best, 2) + 'x',
    dec(one.level, 1),
    int(one.kills),
    dec(one.bodies, 2),
    dec(one.damage, 1),
  ]);
  return table(
    'the run: ' + standings.map((one) => one.runs).join('/') + ' runs a gun, '
    + opts.policy + ' bot' + (opts.picks === 'wise' ? '' : ' answering the level-up with a die')
    + ', a ' + clock(opts.seconds) + ' window, the same seeds for every gun',
    'The middle run of each batch. vs best is the only column PLAN\u2019s 25% is read on. bodies/s is\n'
    + 'what that run removed a second, which is what it was paid in - a shard per body, a level per\n'
    + 'shard - and it is the column the five rows are priced on now (session 96). hull/s is what the\n'
    + 'run took off bodies a second (game/tally.js), which says how much of a gun\u2019s score is the\n'
    + 'crowd\u2019s size rather than the gun. A bot is in this number and it aims at whatever is nearest;\n'
    + 'giving it a lane-finding eye did not help the lance (NOTES session 91), so read a line gun\u2019s\n'
    + 'row as a fact about how this fight goes rather than as a floor for a better one.',
    'lrrrrrrrr',
    ['gun', 'alive', 'median time', 'median score', 'vs best', 'level', 'kills', 'bodies/s', 'hull/s'],
    rows);
}

/* --------------------------------------------------------------------- main */

/** Only run when called as a command, so the tests can import the parts above. */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();

async function main() {
  const opts = readArgs(process.argv.slice(2));
  const seeds = seedList(opts);

  if (opts.playOnly) {
    // A shard at work: play, write, say nothing. No verdict and no non-zero exit here - a shard
    // whose ladder failed is not a shard that crashed, and the parent's pooled verdict is the
    // only one anybody should read.
    const rows = await play(opts.guns, seeds, opts);
    writeRows(opts.outfile, rows);
    console.log(rows.length + ' runs written to ' + opts.outfile);
    return;
  }

  const knots = knotsOf(opts.guns, opts.knotSeeds, opts.knotSeconds);

  if (opts.knotsOnly) {
    console.log(chippedTable(knots));
    console.log('');
    console.log(felledTable(knots));
    console.log('');
    console.log('no runs were played: --knots-only. The band is read on the run table ('
      + 'node tools/weapon-ladder.js).');
    return;
  }

  let rows;
  if (opts.infiles.length > 0) rows = readRows(opts.infiles);
  else if (opts.shards > 1) rows = await playSharded(opts.guns, seeds, opts);
  else rows = await play(opts.guns, seeds, opts);
  if (opts.outfile !== '') writeRows(opts.outfile, rows);
  process.stdout.write('\n');

  const standings = standingsOf(opts.guns, rows, opts.seconds);
  const verdict = verdictOf(standings);
  // The seeds come out of the rows and not out of the command line, because with `--in` the two
  // need not agree and a header that claims seeds it never played is the worst kind of comment.
  const played = [...new Set(rows.map((row) => row.seed))].sort((a, b) => a - b);

  console.log('the weapon ladder: ' + opts.guns.join(', ') + ' on seeds ' + played[0] + '-'
    + played[played.length - 1] + ' (' + played.length + ' a gun)'
    + (opts.shards > 1 ? ', played over ' + opts.shards + ' processes' : '')
    + (opts.infiles.length > 0 ? ', pooled from ' + opts.infiles.join(' ') : ''));
  if (opts.quiet) {
    // The verdict on its own, for whoever is running this before a release and does not want the
    // whole ladder scrolled past it.
    console.log(verdict.lines.join('\n'));
    if (!verdict.pass) process.exitCode = 1;
    return;
  }
  console.log('');
  console.log(ladderTable(standings, opts));
  console.log('');
  console.log(chippedTable(knots));
  console.log('');
  console.log(felledTable(knots));
  console.log('');
  console.log(verdict.lines.join('\n'));
  if (!verdict.pass) process.exitCode = 1;
}
