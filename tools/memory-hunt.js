#!/usr/bin/env node
// Is the page bigger at the end of a long run than it was in the middle of one?
//
//   node tools/memory-hunt.js                       the whole hunt: eight short runs, then a 30-minute flight
//   node tools/memory-hunt.js --minutes 10          a shorter flight
//   node tools/memory-hunt.js --every 30            sample twice a minute instead of once
//   node tools/memory-hunt.js --runs 0              skip the wrecks (the flight on its own)
//   node tools/memory-hunt.js --seed 9              fly a different run (the wrecks take the seeds after it)
//   node tools/memory-hunt.js --warm-runs 5         treat the first five short runs as warm-up too
//   node tools/memory-hunt.js --wreck-policy aware  fly the short runs with perfect eyes instead
//   node tools/memory-hunt.js --budget 0.1          fail above this much retained growth, in MB a minute
//   node tools/memory-hunt.js --per-run 0.1         fail above this much left behind by each wreck
//   node tools/memory-hunt.js --quiet               just the verdict
//
// It is a check and not a report: it exits non-zero when the run it played is getting heavier as it
// goes on, so a release can be gated on it the way `tools/difficulty-arc.js` and
// `tools/weapon-ladder.js` gate theirs.
//
// **Why the flight is an endless one.** PLAN's item is a *30-minute* run, and nothing in the game
// flies for thirty minutes on its own: the schedule ends, the win card comes up, and a run that
// stays in the arena after it is on the second clock (game/endless.js). So this walks through the
// same door `tools/endless-gauge.js` walks through - park the clock on the last fight, spend the
// whole ladder so the bot survives long enough to be worth measuring, press Space over the win
// through the game's own handler, and fly on - and it then watches what the crowd does, which is
// the one thing that keeps growing out there. That is a heavier arena than a person ever plays
// against and it is meant to be: a hunt wants the worst case the game can produce, and the pools
// and the sprite cache are sized by the biggest frame they have ever seen.
//
// **What "bigger" means here, and what it does not.** Every heap number is read after `gc()`, so it
// is what the page is *holding* and not what it has recently borrowed; that is why the tool re-launches
// itself under `--expose-gc` when node was not started with it. Holding is not the same as growing:
// the first minutes of any run are warm-up - object pools reaching their peak, a sprite baked once per
// colour and radius, the crowd's histogram filling out - and warm-up is not a leak. So the verdict is
// read off the **steady stretch**: the slope of the heap over the samples after `--warmup`, in
// megabytes a minute of game time, against `--budget`. The first third is printed beside it because
// the difference between the two *is* the warm-up, and a hunt that cannot tell them apart will
// "find" a leak in every program ever written.
//
// **A number that grows is not an answer, so the tool says what grew.** Between the baseline sample
// and the last it prints every pool that made more objects, every sprite that got baked, every byte
// the save document put on, and the paths inside the world that are holding more slots than they
// were. Half of a hunt is knowing which of those is honest: the crowd is *meant* to grow in endless,
// a pool that grows with it is a pool doing its job, and a `free` list getting shorter while `items`
// gets longer is nothing at all - which is why pools are printed as `made` (objects ever built, the
// permanent cost) and not merely as what is live.
//
// **The part a headless heap cannot see, and the number that stands in for it.** A glow sprite is an
// offscreen canvas (render/glow.js) and the fake canvas of the test harness holds no pixels, so a
// cache baking one sprite per (colour, radius) could grow until a real browser ran out and this
// process would not notice. `render/glow.js` therefore reports what its cache *would* cost - holders,
// baked sprites, and the pixels behind them at the current device ratio - and `--sprite-mb` fails the
// hunt when that passes a budget. Measured, the cache settles at 82 holders and 8.9 MB of pixels
// at a device ratio of 2 within the first few minutes of the heaviest arena the game can describe,
// and does not move again: the colours come from `PALETTE` and the radii from the balance tables, so
// the key space is a list and not a continuum. Keep it that way; anything that hands `glowFor` a
// radius read off a live body is a leak this tool is watching for.
//
// **The short runs are a different animal, and they come first.** A single long run exercises the
// steady state; a page that plays forty runs exercises the *seams* - the tally, the history row, the
// save write, the toast list, the level-up table, all of which are built and thrown away at an ending.
// So the tool plays `--runs` short runs answered with a die (`--picks random`, the careless build:
// NOTES session 88) and samples between them, because a visit that gets 200 KB heavier per wreck is a
// visit that needs a reload by lunchtime. Two choices make that phase measure what it is for:
//
//   - **They are flown by the hand that gets buried** (`--wreck-policy`, the human bot by default).
//     The perfect-eyed bot with a die largely refuses to die - 7 of the 8 careless aware runs measured
//     here outlived a five-minute window, where the human hand with the same die was a wreck eight times
//     in eight - and it is an *ending* that has to leave something behind for this phase to find it.
//   - **They are played on a fresh visit, before the flight.** A run banks stardust and the hangar
//     spends it, so a batch measured after a twenty-seven-minute maxed flight would be flying a better
//     ship than a careless person had by then. (Checked, and it did not move these seeds: the same
//     eight aware runs came out identical before the flight and after it. A phase that counts what a
//     visit accumulates still should not accumulate anything it did not mean to count.)
//
// **One trap to know about.** The warm-up is not the thirty seconds after the launch: in the heaviest
// arena the game can describe the pools keep reaching for new objects for minutes, because the endless
// crowd is itself still growing until it hits its 200-body wall. `--warmup` ships at 5 minutes for
// that reason, and a short hunt with a small `--warmup` will honestly report the pools filling out as
// growth - it is reading the slope it was asked for. The same goes for the budgets: they are priced
// against the shipped reading (`--minutes 30`, `--runs 8` of `--run-seconds 300`), and shortening the
// flight measures the crowd growing rather than a leak. A short hunt is a fine way to check the tool
// works; it is not a verdict.

import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { bootGame } from './headless/harness.js';
import { botFrame, startBotRun, dashEscape, FRAME_MS, DEFAULT_POLICY, POLICIES, PICKS } from './headless/bot.js';
import { resetDodge } from './headless/human.js';
import { Pool } from '../src/core/pool.js';
import { BALANCE } from '../src/game/balance.js';
import { LINES, maxRanksOf } from '../src/game/upgrades.js';
import { STATE } from '../src/game/state.js';
import { endlessTime } from '../src/game/endless.js';
import { SAVE_KEY } from '../src/core/save.js';
import { stats as glowStats } from '../src/render/glow.js';
import { clock, int, dec, table } from './headless/tables.js';

export const MB = 1048576;

/**
 * What the hunt ships with, and what `test/memory-hunt.test.mjs` holds.
 *
 * `budget` is the megabytes a minute the steady stretch of a flight may put on, `perRun` the
 * megabytes one wreck may leave behind, and `spriteMB` the ceiling on the glow cache's pixels -
 * all three measured off a healthy game (NOTES, session 93) with room left in them for a machine
 * doing something else at the same time. `warmup` and `warmRuns` are how much of each phase is
 * treated as filling out rather than growing, and the same note applies to both.
 */
export const DEFAULTS = {
  seed: 4, minutes: 30, every: 60, warmup: 5, budget: 0.12, perRun: 0.2, spriteMB: 40,
  runs: 8, warmRuns: 3, runSeconds: 300, picks: 'random', policy: DEFAULT_POLICY,
  wreckPolicy: 'human',
};

export function readArgs(argv) {
  const opts = {
    seed: DEFAULTS.seed, minutes: DEFAULTS.minutes, every: DEFAULTS.every, warmup: DEFAULTS.warmup,
    budget: DEFAULTS.budget, perRun: DEFAULTS.perRun, spriteMB: DEFAULTS.spriteMB,
    runs: DEFAULTS.runs, warmRuns: DEFAULTS.warmRuns, runSeconds: DEFAULTS.runSeconds,
    picks: DEFAULTS.picks, policy: DEFAULTS.policy, wreckPolicy: DEFAULTS.wreckPolicy, quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      i++;
      if (i >= argv.length) throw new Error(arg + ' wants a value');
      return argv[i];
    };
    if (arg === '--seed') opts.seed = Number(next());
    else if (arg === '--minutes') opts.minutes = Number(next());
    else if (arg === '--every') opts.every = Number(next());
    else if (arg === '--warmup') opts.warmup = Number(next());
    else if (arg === '--budget') opts.budget = Number(next());
    else if (arg === '--per-run') opts.perRun = Number(next());
    else if (arg === '--sprite-mb') opts.spriteMB = Number(next());
    else if (arg === '--runs') opts.runs = Number(next());
    else if (arg === '--warm-runs') opts.warmRuns = Number(next());
    else if (arg === '--run-seconds') opts.runSeconds = Number(next());
    else if (arg === '--picks') opts.picks = next();
    else if (arg === '--policy') opts.policy = next();
    else if (arg === '--wreck-policy') opts.wreckPolicy = next();
    else if (arg === '--quiet') opts.quiet = true;
    else throw new Error('unknown option: ' + arg);
  }
  if (!(opts.minutes > 0) || !(opts.every > 0)) throw new Error('--minutes and --every want real numbers');
  // The verdict is the slope of the samples *after* the warm-up, so a flight that ends before the
  // warm-up is over has no verdict to give, and a tool that said "pass" about a measurement it did not
  // make would be worse than one that refused to run.
  if (opts.minutes <= opts.warmup + 2) {
    throw new Error('--minutes wants to outlast --warmup by a couple of samples: ' + opts.minutes
      + ' of flight with ' + opts.warmup + ' spent on warm-up leaves nothing to read');
  }
  if (opts.picks !== undefined && PICKS[opts.picks] === undefined) {
    throw new Error('no card picker is called ' + opts.picks);
  }
  if (POLICIES[opts.policy] === undefined) throw new Error('no bot policy is called ' + opts.policy);
  if (POLICIES[opts.wreckPolicy] === undefined) {
    throw new Error('no bot policy is called ' + opts.wreckPolicy);
  }
  return opts;
}

/**
 * Re-launch under `--expose-gc` when the node running this has no `gc`.
 *
 * Every number here is a heap reading and a heap reading without a collection first is a reading of
 * whatever the allocator happened to be holding. Re-execing costs one process and no thinking; a
 * README line that says "remember the flag" costs a confused colleague.
 */
function requireGc() {
  if (typeof global.gc === 'function') return;
  // `import.meta.url` and not `process.argv[1]`, because argv[1] is whatever the caller typed: run this
  // from the folder above with `node tools/memory-hunt.js` and the re-exec would go looking for
  // `tools/tools/memory-hunt.js` and die of it before measuring anything.
  const res = spawnSync(
    process.execPath,
    ['--expose-gc', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit' },
  );
  process.exit(res.status === null ? 1 : res.status);
}

/** Every pool the world owns, found by looking rather than remembered.
 *
 * Pools hang off the world directly (bullets, particles) and inside the subsystems that were handed
 * a corner of it (mines, tether, turret, the lance), so walking is the only way this list cannot go
 * stale the day somebody gives a new line its objects.
 */
export function poolsOf(world) {
  const found = {};
  const walk = (node, path, depth) => {
    if (!node || typeof node !== 'object' || depth > 3) return;
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (child instanceof Pool) found[path + key] = child.stats();
      else if (child && typeof child === 'object' && !Array.isArray(child)) walk(child, path + key + '.', depth + 1);
    }
  };
  walk(world, '', 0);
  return found;
}

/**
 * A census of what the world is holding: live objects and array slots, bucketed by the path they sit
 * under. Depth-limited and allocation-free apart from its own buckets, and it is here for the case a
 * named list cannot cover - the leak nobody thought to name.
 */
export function censusOf(world) {
  const seen = new Set([world]);
  const queue = [[world, '', 0]];
  let head = 0;
  const out = { objects: 0, slots: 0, byPath: {} };
  while (head < queue.length && queue.length < 200000) {
    const [node, path, depth] = queue[head++];
    if (Array.isArray(node)) {
      out.slots += node.length;
      out.byPath[path] = (out.byPath[path] || 0) + node.length;
      if (depth < 4) {
        for (const child of node) {
          if (child && typeof child === 'object' && !seen.has(child)) { seen.add(child); queue.push([child, path, depth + 1]); }
        }
      }
      continue;
    }
    out.objects++;
    if (depth < 4) {
      for (const key of Object.keys(node)) {
        const child = node[key];
        if (child && typeof child === 'object' && !seen.has(child)) {
          seen.add(child);
          queue.push([child, path === '' ? key : path + '.' + key, depth + 1]);
        }
      }
    }
  }
  return out;
}

/**
 * How many bytes the save document is holding, because a browser caps that in megabytes too.
 *
 * It reads `window.localStorage` and not `globalThis.localStorage`, which is a detail of the harness
 * rather than of the game: `core/save.js` goes through `window`, and the headless shim puts its store
 * on the window object it builds (tools/headless/harness.js), so a hunt that looked on `globalThis`
 * would report a save of zero bytes forever and never be wrong loudly enough to notice.
 */
function saveBytes() {
  const win = globalThis.window;
  const store = (win && win.localStorage) || globalThis.localStorage;
  if (!store) return 0;
  return String(store.getItem(SAVE_KEY) || '').length;
}

/** One reading of the page: the heap it is holding, and the named things that make it up. */
export function survey(game, at) {
  if (typeof global.gc === 'function') global.gc();
  const world = game.world;
  const used = process.memoryUsage();
  const glow = glowStats();
  const pools = poolsOf(world);
  let made = 0;
  let live = 0;
  for (const key of Object.keys(pools)) {
    made += pools[key].made;
    live += pools[key].live;
  }
  return {
    at: at,
    heap: used.heapUsed,
    external: used.external,
    poolMade: made,
    poolLive: live,
    pools: pools,
    census: censusOf(world),
    enemies: world.enemies.length,
    score: world.score,
    holders: glow.holders,
    sprites: glow.sprites,
    spriteBytes: glow.bytes,
    save: saveBytes(),
  };
}

/**
 * Fly one run for `minutes` of game time and sample it every `every` seconds.
 *
 * The doors are endless-gauge's and for the same reason: the schedule is parked on the last fight and
 * the ladder is spent so the ship is still in the arena an hour of frames later. Space over the win
 * is the game's own key (`game/run.js continueRun`), so the second clock starts the way a player
 * starts it. It walks back to the title first, so that the flight is the same flight whatever the
 * wrecks before it did.
 */
async function flyLong(game, opts, onSample) {
  const world = game.world;
  // From whatever the wrecks left behind - a tally card, most likely, and a click on the middle of a
  // tally card is not a launch button - back to the title, on the seed this hunt was given. The short
  // runs are flown on the seeds after it (`opts.seed + 1000 + i`), so the flight is the one number in
  // the report that means the same thing from one hunt to the next.
  await game.resetToTitle(opts.seed);
  startBotRun(game);
  for (const line of LINES) world.upgrades[line.id] = maxRanksOf(line.id);
  const schedule = BALANCE.bosses.schedule;
  world.elapsed = schedule[schedule.length - 1].at - 5;
  world.bossIndex = schedule.length - 1;

  const limit = Math.ceil(opts.minutes * 60 * 1000 / FRAME_MS);
  const gap = Math.ceil(opts.every * 1000 / FRAME_MS);
  let frames = 0;
  let due = gap;
  // The sample clock is the flight's own, not the run's: the run is parked a quarter of an hour in
  // before the first frame is stepped, and "the fifth minute of warm-up" has to mean the fifth minute
  // of what this tool is watching.
  onSample(survey(game, 0));
  while (frames < limit) {
    if (world.state === STATE.WON) {
      game.key('Space', true);
      game.key('Space', false);
    } else {
      botFrame(game, opts.policy);
      if (world.state === STATE.PLAY) dashEscape(game);
    }
    game.step(FRAME_MS);
    frames++;
    if (frames >= due) {
      due += gap;
      onSample(survey(game, frames * FRAME_MS / 1000));
    }
    if (world.state === STATE.OVER) break;
  }
  return { frames: frames, endless: endlessTime(world) > 0, state: world.state };
}

/** Play `runs` short runs on one page visit, sampling between them, and answer what each was. */
async function playWrecks(game, opts, onSample) {
  if (PICKS[opts.picks] === undefined) throw new Error('no card picker is called ' + opts.picks);
  const rows = [];
  for (let i = 0; i < opts.runs; i++) {
    // Every run opens on a title screen, the first one included. The harness boots on one and each run
    // after it ends on a tally card - and a click in the middle of a tally card is not a launch button,
    // so a run that is launched on a dead arena is not a run.
    await game.resetToTitle(opts.seed + 1000 + i);
    const summary = playOneRunShort(game, opts);
    const row = survey(game, summary.seconds);
    row.ended = summary.ended;
    row.score = summary.stats.score;
    rows.push(row);
    onSample(row, i);
  }
  return rows;
}

/**
 * One short run, played the way `tools/simulate.js` plays one - the bot answers its own level-up
 * table, and the whole thing stops at the window or the wreck, whichever comes first. A run that
 * *ends* is the point: an ending is where the tally, the history row, the save write and the toast
 * list are built and thrown away.
 */
function playOneRunShort(game, opts) {
  startBotRun(game);
  // One seed is one person having the same afternoon (tools/headless/human.js), which is what makes a
  // batch of them a sample rather than eight copies of the same flinch.
  resetDodge(game.world.seed);
  const limit = Math.ceil(opts.runSeconds * 1000 / FRAME_MS);
  let frames = 0;
  while (frames < limit) {
    botFrame(game, opts.wreckPolicy, opts.picks);
    game.step(FRAME_MS);
    frames++;
    if (game.world.state === STATE.OVER || game.world.state === STATE.WON) break;
  }
  const stats = game.stats();
  return {
    seconds: stats.t,
    ended: game.world.state === STATE.OVER ? 'died' : (game.world.state === STATE.WON ? 'won' : 'window'),
    stats: stats,
  };
}

/**
 * The least-squares slope of a set of `{ x, y }` points.
 *
 * One point has no slope, so it says 0 rather than inventing one; two is a line, and everything the
 * tool feeds it is at least that.
 */
export function slopeOf(points) {
  const n = points.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  for (const p of points) { sumX += p.x; sumY += p.y; }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let up = 0;
  let down = 0;
  for (const p of points) {
    up += (p.x - meanX) * (p.y - meanY);
    down += (p.x - meanX) * (p.x - meanX);
  }
  return down === 0 ? 0 : up / down;
}

/** Megabytes of heap per minute of game time. */
export function slopePerMinute(rows) {
  return slopeOf(rows.map((row) => ({ x: row.at / 60, y: row.heap / MB })));
}

/** Megabytes of heap per run played on one visit. */
export function slopePerRun(rows) {
  return slopeOf(rows.map((row, i) => ({ x: i, y: row.heap / MB })));
}

/** What grew between two readings, in the named things that can be explained. */
export function grewBetween(from, to) {
  const lines = [];
  for (const key of Object.keys(to.pools)) {
    const before = from.pools[key] ? from.pools[key].made : 0;
    const made = to.pools[key].made - before;
    if (made > 0) lines.push('pool ' + key + ' built ' + made + ' more objects (' + to.pools[key].made + ' now)');
  }
  if (to.holders > from.holders) {
    lines.push('the sprite cache took ' + (to.holders - from.holders) + ' more holders (' + to.holders
      + ' now, ' + dec(to.spriteBytes / MB, 1) + ' MB of pixels)');
  }
  if (to.save > from.save) lines.push('the save document grew ' + int(to.save - from.save) + ' bytes');
  const grew = [];
  for (const path of new Set([...Object.keys(to.census.byPath), ...Object.keys(from.census.byPath)])) {
    const d = (to.census.byPath[path] || 0) - (from.census.byPath[path] || 0);
    if (Math.abs(d) >= 24) grew.push([path, d]);
  }
  grew.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  for (const [path, d] of grew.slice(0, 10)) {
    lines.push('world.' + path + ' holds ' + (d > 0 ? '+' : '') + d + ' slots');
  }
  return lines;
}

/** The verdict: the steady slope, the sprite cache, and the two budgets they are held to. */
export function verdictOf(flight, wrecks, opts) {
  const steady = flight.filter((row) => row.at / 60 >= opts.warmup);
  const warm = flight.filter((row) => row.at / 60 < opts.warmup);
  const slope = slopePerMinute(steady);
  const warmSlope = slopePerMinute(warm);
  const sprites = flight.length ? flight[flight.length - 1].spriteBytes / MB : 0;
  // The first runs of a visit are warm-up in exactly the sense the flight's first minutes are, even
  // though every run gets a brand-new world and brand-new pools: what fills out across them is the
  // sprite cache getting its first bakes, the save document taking on its first rows of the run log,
  // the awards and the codex, and the panels' modules being imported the first time a screen needs
  // them. Reading the slope off run 1 against run 8 calls all of that a leak.
  const steadyWrecks = wrecks.slice(Math.min(
    Number.isFinite(opts.warmRuns) ? opts.warmRuns : 0,
    Math.max(0, wrecks.length - 3)));
  const perWreck = slopePerRun(steadyWrecks);
  const lines = [];
  const fails = [];
  if (steady.length < 2) {
    lines.push('the flight: ' + steady.length + ' sample' + (steady.length === 1 ? '' : 's')
      + ' after ' + clock(opts.warmup * 60) + ' of warm-up - there is nothing to read a slope from, so'
      + ' this is not a pass');
    return { pass: false, slope: 0, warmSlope: 0, sprites: 0, perWreck: 0, lines, fails: ['too little flight to measure'] };
  }
  lines.push('the flight: ' + dec(slope, 3) + ' MB a minute of game time over the ' + steady.length
    + ' samples after ' + clock(opts.warmup * 60) + ' of warm-up, against ' + dec(opts.budget, 2)
    + ' allowed' + (slope > opts.budget ? ' - FAIL' : ' - pass'));
  if (slope > opts.budget) fails.push('the page is still holding more at the end of the flight than it was in the middle of it');
  if (warm.length >= 2) {
    lines.push('  (the warm-up slope was ' + dec(warmSlope, 3)
      + ' MB a minute; that part is pools and sprites reaching their size, not a leak)');
  }
  lines.push('the sprite cache: ' + dec(sprites, 1) + ' MB of baked pixels at the end, against '
    + dec(opts.spriteMB, 0) + ' allowed' + (sprites > opts.spriteMB ? ' - FAIL' : ' - pass'));
  if (sprites > opts.spriteMB) fails.push('the glow cache is bigger than its budget - something is handing glowFor a size that is not on a table');
  if (wrecks.length >= 3) {
    lines.push('the wrecks: ' + dec(perWreck, 3) + ' MB a run over the last ' + steadyWrecks.length
      + ' of ' + wrecks.length + ' runs on one visit, against ' + dec(opts.perRun, 2)
      + ' allowed - what a wreck leaves behind, and what forty of them would add up to'
      + (perWreck > opts.perRun ? ' - FAIL' : ' - pass'));
    if (perWreck > opts.perRun) fails.push('a page visit gets heavier with every run it plays');
  }
  return { pass: fails.length === 0, slope, warmSlope, sprites, perWreck, lines };
}

/** The flight's own table: one row per sample. */
export function flightTable(rows) {
  return table('one flight', 'heap is what the page holds after a collection; slots is everything reachable from the world',
    'rrrrrrr',
    ['minute', 'heap MB', 'enemies', 'score', 'pool objects', 'world slots', 'sprites'],
    rows.map((row) => [
      clock(row.at), dec(row.heap / MB, 2), int(row.enemies), int(row.score),
      int(row.poolMade) + ' / ' + int(row.poolLive), int(row.census.slots),
      int(row.sprites) + ' (' + dec(row.spriteBytes / MB, 1) + ' MB)',
    ]));
}

/** The wrecks' table: one row per run played on the visit. */
export function wreckTable(rows) {
  return table('the runs on one visit', 'each one launched from the title, sampled once it was over',
    'lrrrr',
    ['run', 'ended', 'heap MB', 'world slots', 'sprites'],
    rows.map((row, i) => [
      'run ' + (i + 1), row.ended + ' at ' + clock(row.at), dec(row.heap / MB, 2),
      int(row.census.slots), int(row.sprites),
    ]));
}

/** Only run when called as a command, so the tests can import the parts above. */
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  requireGc();
  const opts = readArgs(process.argv.slice(2));
  const game = await bootGame({ seed: opts.seed, audio: false });

  // The short runs first, while the page is fresh and has banked nothing (see the header).
  let wrecks = [];
  if (opts.runs > 0) {
    wrecks = await playWrecks(game, opts, (row, i) => {
      if (!opts.quiet) {
        console.log('wreck ' + (i + 1) + ' (' + row.ended + ' at ' + clock(row.at) + ', score '
          + int(row.score) + ')  heap ' + dec(row.heap / MB, 2) + ' MB');
      }
    });
  }

  const flight = [];
  const flightEnd = await flyLong(game, opts, (row) => {
    flight.push(row);
    if (!opts.quiet) {
      console.log('flight ' + clock(row.at) + '  heap ' + dec(row.heap / MB, 2) + ' MB  enemies '
        + int(row.enemies) + '  pool ' + int(row.poolMade) + '  slots ' + int(row.census.slots)
        + '  sprites ' + int(row.sprites));
    }
  });
  if (flightEnd.state === STATE.OVER) {
    console.log('note: the flight was a wreck at ' + clock(flight[flight.length - 1].at)
      + '; its samples are what it held on the way down');
  }

  if (!opts.quiet) {
    console.log('');
    if (wrecks.length) {
      console.log(wreckTable(wrecks));
      console.log('');
    }
    console.log(flightTable(flight));
    console.log('');
    const baseline = flight.find((row) => row.at / 60 >= opts.warmup) || flight[0];
    console.log('what grew between the baseline (' + clock(baseline.at) + ') and the end:');
    for (const line of grewBetween(baseline, flight[flight.length - 1])) console.log('  ' + line);
    console.log('');
  }
  const verdict = verdictOf(flight, wrecks, opts);
  console.log(verdict.lines.join('\n'));
  game.stop();
  if (!verdict.pass) process.exitCode = 1;
}
