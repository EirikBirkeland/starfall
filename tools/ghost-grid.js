#!/usr/bin/env node
// What an afterimage is worth, read off the crowd: of the bodies standing near the ship, how many
// are walking at a ghost instead of at the ship. A check and not a decoration - with `--strict` it
// exits non-zero when the shipped `bait` radius is outside the window it has to sit in.
//
//   node tools/ghost-grid.js                       the rank ladder at the shipped bait
//   node tools/ghost-grid.js --baits 72,110,150    the grid NOTES session 42 printed, re-read
//   node tools/ghost-grid.js --spacing 74          the ladder at another spacing between the images
//   node tools/ghost-grid.js --ranks 1,5           two rungs instead of the ladder
//   node tools/ghost-grid.js --seeds 12 --seconds 300
//   node tools/ghost-grid.js --habit dive          the habit the number was first read with
//   node tools/ghost-grid.js --trigger 170         ...and how cornered it has to be to press
//   node tools/ghost-grid.js --strict              non-zero unless the shipped bait holds
//
// WHY THIS FILE EXISTS. `BALANCE.upgrades.afterimage.bait` is not a tuning number, it is the card's
// identity: it says which bodies the trick is played on ("the ones already on top of you", and not
// "the arena"), and the worth of a rank is a function of it, because images are laid every `spacing`
// px along the way the ship came and a rank buys *length* - more images fooling bodies along a longer
// line. Session 42 chose 110 px from a grid of three radii read on the dash habit of the time, which pressed the
// dash *at* whatever frightened the bot and pressed it whenever anything came within 170 px - about
// twenty times a minute. Session 114 replaced that habit with a get-out pressed at one body-reach,
// which presses about ten times a *quarter-hour* and leaves its images behind a fleeing ship
// instead of dropping them inside the crowd. Both halves of the instrument changed - how often a
// ghost stands, and where it stands - and a radius is exactly the number that changes meaning when
// the crowd you show it to changes.
//
// The other half of the geometry is `spacing` - how far apart the images stand - and that is what a
// rank actually buys. It used to be the dash's 220 px divided by the rank, which put the fifth
// rank's images 44 px apart inside a 110 px reach: the ladder's slope read 2.24x and its last two
// cards were nearly free. It is its own number now, and `--spacing` reads the ladder at any other.
//
// WHAT IS MEASURED, and why the denominator is the near crowd. A ghost only ever competes with the
// ship for the bodies close enough to reach it, so the honest denominator is the crowd standing
// within NEAR px of the ship and the honest numerator is how many of those are pointed at a ghost.
// The far crowd was never going to arrive, and counting it would report the card doing better than
// it is by whatever share of the arena happens to be off-screen. Everything is measured over the
// frames a ghost is actually standing (`lit`), because on the other frames there is nothing to
// measure: a share over the whole run would be a report of how often the bot pressed the dash,
// which is the habit's number and not the card's. How often a ghost stands at all is printed beside
// it in the `lit` column, so nobody reads the first number without the second.
//
// Two denominators are printed. `walkers` counts only bodies that can walk - a rooted body (a
// sniper, a place in the Hive's wall: game/kinds.js `isRooted`) cannot be diverted by anything and
// has no business in the denominator of a share of what got diverted. `all` is every body in the
// ring, which is what session 42 printed, so the two grids can be read against each other.
//
// THE ONE THING THAT CANNOT BE FORGOTTEN WHEN READING THESE NUMBERS: the sample is presses and not
// frames, and a press early in a run is a different event from a press late in one. Ten seeds at
// five minutes (71 presses of the dash) read 16.5% diverted at rank 1 and 37.0% at rank 5; the same
// radius and the same habit on eight seeds at two minutes (10 presses) read 36.9% and 57.1%. That
// is not the card changing, it is the crowd it meets: a two-minute batch is nothing but the opening
// knot, with a pack at the ship's heels whenever the dash gets pressed, and a long batch also counts
// every dash spent on the lone body that brushed past on its way to nothing. The swing between the
// two windows is wider than the whole distance from 72 px to 150 px, which is why `MIN_PRESSES`
// refuses to verdict on a short one and why nobody should move `bait` on a single batch's figures.
//
// WHAT IS NOT MEASURED here: whether the card is worth a level. That is `tools/line-ab.js --line
// afterimage --dash`, and its answer - nothing measurable, to a bot that runs - is in the balance
// row and in NOTES sessions 42 and 114. This file answers the narrower question the row was priced
// on: is 110 px still the radius at which the first rank is felt and the fifth is a different card.

import { BALANCE } from '../src/game/balance.js';
import { dist2 } from '../src/core/math.js';
import { quarryFor } from '../src/game/afterimage.js';
import { isRooted } from '../src/game/kinds.js';
import { playBatches, DASH_HABITS, DEFAULT_DASH_HABIT, setDashDial } from './headless/bot.js';
import { table, int, dec, share } from './headless/tables.js';
import { pathToFileURL } from 'node:url';

/** px. The crowd a ghost is competing for. Session 42's number, kept so the two grids compare. */
export const NEAR = 250;
const NEAR2 = NEAR * NEAR;

/**
 * The three promises about the shipped radius, in the words of the session that chose it.
 *
 * `FLOOR` is what 72 px failed: it turned aside 2.0% of the near crowd at the first rank and was
 * "a card that mostly does nothing". `CEILING` is what 150 px failed: 43.8% at the fifth, which was
 * "a card that ends the fight for you" - a crowd that stops coming is a crowd that never forms.
 * `SLOPE` is the reason 150 px failed twice over: at that radius the discs overlap so heavily that
 * the fifth rank bought only 1.25x what the first did, and a rank that buys the same crowd fooled
 * again is not a rank.
 */
export const FLOOR = 0.04;
export const CEILING = 0.40;
export const SLOPE = 2;
/** Below this many lit frames a cell is one dash's story and not a radius's. */
export const MIN_LIT_FRAMES = 400;
/**
 * Below this many dashes across a batch the promises are not checked at all.
 *
 * The sample is dashes and not frames: a ghost is only standing because some ship just pressed the
 * dash, so 5,000 lit frames out of fifty dashes is fifty observations and not five thousand. This
 * number is measured rather than invented - the same radius on the same habit reads 16.5% diverted
 * on a batch of seventy-one presses (ten seeds at five minutes) and 36.9% on a batch of ten
 * presses (eight seeds at two minutes), because a short batch is nothing but the opening knot and
 * a long one also counts every dash spent on the lone body that brushed past. A radius moved on the
 * difference between those two readings would be a radius moved on the window.
 */
export const MIN_PRESSES = 25;

export const LINE = 'afterimage';

export const DEFAULTS = {
  seeds: 10,
  seconds: 300,
  baits: null,
  spacing: null,
  ranks: '1,3,5',
  habit: DEFAULT_DASH_HABIT,
  trigger: null,
  strict: false,
};

export function readArgs(argv) {
  const opts = Object.assign({}, DEFAULTS);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => { i++; return argv[i]; };
    if (arg === '--seeds') opts.seeds = parseInt(next(), 10);
    else if (arg === '--seconds') opts.seconds = Number(next());
    else if (arg === '--baits') opts.baits = next();
    else if (arg === '--spacing') opts.spacing = Number(next());
    else if (arg === '--ranks') opts.ranks = next();
    else if (arg === '--habit') opts.habit = next();
    else if (arg === '--trigger') opts.trigger = Number(next());
    else if (arg === '--strict') opts.strict = true;
    else { console.error('unknown option: ' + arg); process.exit(2); }
  }
  if (!Number.isFinite(opts.seeds) || opts.seeds < 1 || !Number.isFinite(opts.seconds)
    || opts.seconds <= 0) {
    console.error('--seeds wants a count and --seconds a number of seconds');
    process.exit(2);
  }
  if (DASH_HABITS[opts.habit] === undefined) {
    console.error('--habit wants one of: ' + Object.keys(DASH_HABITS).join(', '));
    process.exit(2);
  }
  if (opts.trigger !== null && !Number.isFinite(opts.trigger)) {
    console.error('--trigger wants a number of pixels');
    process.exit(2);
  }
  if (opts.spacing !== null && !(opts.spacing > 0)) {
    console.error('--spacing wants a number of pixels above zero');
    process.exit(2);
  }
  opts.baitList = opts.baits === null
    ? [BALANCE.upgrades[LINE].bait]
    : opts.baits.split(',').map((text) => Number(text));
  opts.rankList = opts.ranks.split(',').map((text) => parseInt(text, 10));
  for (const bait of opts.baitList) {
    if (!Number.isFinite(bait) || bait <= 0) {
      console.error('--baits wants a comma-separated list of radii in pixels');
      process.exit(2);
    }
  }
  for (const rank of opts.rankList) {
    // 0 is a rung and not a mistake: it is the same run with nothing to look at, and the cell that
    // says whether this instrument can tell a ghost from no ghost at all.
    if (!Number.isInteger(rank) || rank < 0 || rank > BALANCE.upgrades[LINE].ranks) {
      console.error('--ranks wants whole ranks between 0 and ' + BALANCE.upgrades[LINE].ranks);
      process.exit(2);
    }
  }
  return opts;
}

/** One cell's readings, filled by `readFrame` as a batch of runs goes by. */
export function newSheet() {
  return {
    frames: 0, lit: 0, litWithFooled: 0,
    nearAll: 0, nearWalk: 0, fooledAll: 0, fooledWalk: 0,
    images: 0, peak: 0, dashes: 0, was: false,
  };
}

/**
 * One frame of one run, after the step. Reads only: nothing here writes to the world, which is what
 * makes it safe to run beside a live simulation (the rule `tools/dash-habit.js` keeps too).
 *
 * The quarry is asked again here rather than read off the body, because game/enemies.js hands each
 * walk its quarry and then forgets it - `quarryFor` is the same question asked one step later, and
 * it reads `BALANCE.upgrades.afterimage.bait` live, which is what lets this file sweep the radius
 * without touching the sim.
 */
export function readFrame(world, sheet) {
  const ship = world.player;
  const trail = world.afterimage.trail;
  sheet.frames++;
  if (trail.count === 0) return;

  sheet.lit++;
  sheet.images += trail.count;
  let nearAll = 0;
  let nearWalk = 0;
  let fooledAll = 0;
  let fooledWalk = 0;
  for (const body of world.enemies) {
    if (dist2(body.x, body.y, ship.x, ship.y) > NEAR2) continue;
    nearAll++;
    const walks = !isRooted(body);
    if (walks) nearWalk++;
    if (quarryFor(world, body) !== ship) {
      fooledAll++;
      if (walks) fooledWalk++;
    }
  }
  sheet.nearAll += nearAll;
  sheet.nearWalk += nearWalk;
  sheet.fooledAll += fooledAll;
  sheet.fooledWalk += fooledWalk;
  if (fooledWalk > 0) sheet.litWithFooled++;
  if (fooledWalk > sheet.peak) sheet.peak = fooledWalk;
}

/** Turn one cell's sheet into the figures the table prints. */
export function reportOf(sheet, bait, rank, seeds) {
  const lit = sheet.lit;
  const mean = (total) => (lit > 0 ? total / lit : 0);
  return {
    bait,
    rank,
    frames: sheet.frames,
    litFrames: lit,
    nearWalk: mean(sheet.nearWalk),
    nearAll: mean(sheet.nearAll),
    divertWalk: sheet.nearWalk > 0 ? sheet.fooledWalk / sheet.nearWalk : 0,
    divertAll: sheet.nearAll > 0 ? sheet.fooledAll / sheet.nearAll : 0,
    anyShare: lit > 0 ? sheet.litWithFooled / lit : 0,
    perFrame: mean(sheet.fooledWalk),
    images: mean(sheet.images),
    peak: sheet.peak,
    dashes: seeds > 0 ? sheet.dashes / seeds : 0,
  };
}

const HEADERS = ['bait', 'rank', 'lit', 'near crowd', 'near crowd (all)', 'diverted',
  'diverted (all)', 'frames w/ fooled', 'fooled/frame', 'images', 'peak', 'dashes/run'];
const ALIGN = ['r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'];

function lineOf(row, shippedBait) {
  return [
    row.bait + ' px' + (row.bait === shippedBait ? ' *' : ''),
    'rank ' + row.rank,
    share(row.litFrames, row.frames),
    dec(row.nearWalk, 2),
    dec(row.nearAll, 2),
    (row.divertWalk * 100).toFixed(1) + '%',
    (row.divertAll * 100).toFixed(1) + '%',
    share(row.anyShare * row.litFrames, row.litFrames),
    dec(row.perFrame, 2),
    dec(row.images, 2),
    int(row.peak),
    dec(row.dashes, 1),
  ];
}

/**
 * One grid - one radius, every rung - as printed text. Split out so a test can put invented rows
 * through it and check what the table claims, which is the part a reader actually trusts.
 */
export function gridTable(rows, bait, shippedBait, opts) {
  const head = 'afterimage: the share of the near crowd walking at a ghost, on ' + opts.seeds
    + ' seeds of ' + Math.round(opts.seconds) + ' s, `' + opts.habit + '` dash habit'
    + (opts.trigger === null ? '' : ' pressed within ' + opts.trigger + ' px')
    + '. The shipped bait is ' + shippedBait + ' px, one image every '
    + (Number.isFinite(opts.spacing) ? opts.spacing : BALANCE.upgrades[LINE].spacing)
    + ' px of ground.';
  const note = 'Every figure is over the frames a ghost was standing; `lit` is how many of those there\n'
    + 'were. `walkers` counts only bodies that can walk (a rooted body cannot be diverted) and `all`\n'
    + 'counts every body in the ' + NEAR + ' px ring, which is how session 42 read it. `fooled/frame`\n'
    + 'is bodies at a ghost per lit frame and `peak` the most seen in one frame over the batch.';
  return table(head + ' (bait ' + bait + ' px)', note, ALIGN, HEADERS,
    rows.filter((row) => row.bait === bait).map((row) => lineOf(row, shippedBait)));
}

/**
 * The verdict: three promises about the shipped radius, plus the one claim about the instrument.
 *
 * Returns the lines to print and how many of the promises broke, so `--strict` has something to
 * exit on and a test has something to assert on without parsing prose.
 */
export function verdictOf(rows, shippedBait, opts) {
  const lines = [];
  let failures = 0;
  const ladder = rows.filter((row) => row.bait === shippedBait);
  const byRank = new Map(ladder.map((row) => [row.rank, row]));
  const maxLit = ladder.reduce((most, row) => Math.max(most, row.litFrames), 0);

  const thin = ladder.filter((row) => row.rank > 0 && row.litFrames < MIN_LIT_FRAMES);
  if (thin.length > 0) {
    failures++;
    lines.push('FAIL: ' + thin.map((row) => 'rank ' + row.rank + ' had ' + int(row.litFrames)
      + ' lit frames').join(', ') + '. Below ' + int(MIN_LIT_FRAMES)
      + " the number is one dash's story and not a radius's; --seconds or --seeds is what fixes it.");
  }
  if (maxLit === 0) {
    failures++;
    lines.push('NOTHING MEASURED: no ghost stood in a single frame of this batch, so the instrument '
      + 'read nothing. `' + opts.habit + '` is the habit that was run - `off` never presses the dash.');
  }

  const first = byRank.get(1);
  const fifth = byRank.get(BALANCE.upgrades[LINE].ranks);
  // How many times the dash was actually pressed across the batch, which is the sample every share
  // in this grid was cut from. `dashes` is a mean a run, so it goes back up over the seeds.
  const presses = Math.round(
    ladder.reduce((most, row) => Math.max(most, row.dashes), 0) * (opts.seeds || 1));
  if (presses < MIN_PRESSES) {
    failures++;
    lines.push('TOO FEW PRESSES: the dash was pressed about ' + presses + ' times across the whole '
      + 'batch, under the ' + MIN_PRESSES + ' this file will verdict on. A ghost only stands because '
      + 'a dash left it, so the sample is presses and not frames - lengthen --seconds before '
      + 'shortening the radius.');
  } else if (first === undefined || fifth === undefined) {
    lines.push('note: --ranks did not include both rung 1 and rung '
      + BALANCE.upgrades[LINE].ranks + ', so the floor and the slope were not checked.');
  } else if (maxLit > 0) {
    if (first.divertWalk < FLOOR) {
      failures++;
      lines.push('FAIL: rank 1 turns aside ' + (first.divertWalk * 100).toFixed(1)
        + '% of the walking near crowd, under the ' + Math.round(FLOOR * 100)
        + '% a first rank has to reach to be a card and not a rumour.');
    }
    if (fifth.divertWalk > CEILING) {
      failures++;
      lines.push('FAIL: rank ' + fifth.rank + ' turns aside ' + (fifth.divertWalk * 100).toFixed(1)
        + '% of the walking near crowd, over the ' + Math.round(CEILING * 100)
        + '% at which the crowd stops coming and the fight ends by itself.');
    }
    const slope = first.divertWalk > 0 ? fifth.divertWalk / first.divertWalk : 0;
    if (slope < SLOPE) {
      failures++;
      lines.push('FAIL: rank ' + fifth.rank + ' buys ' + dec(slope, 2) + 'x what rank 1 does, under '
        + 'the ' + SLOPE + 'x a rank has to buy to be a different crowd and not the same crowd'
        + ' fooled again - which is what happens when the discs overlap.');
    }
    if (failures === 0) {
      lines.push('PASS: at ' + shippedBait + ' px rank 1 turns aside '
        + (first.divertWalk * 100).toFixed(1) + '% of the walking near crowd and rank '
        + fifth.rank + ' turns aside ' + (fifth.divertWalk * 100).toFixed(1) + '% - which is '
        + dec(slope, 2) + 'x the first, over the floor of ' + Math.round(FLOOR * 100) + '%, under'
        + ' the ceiling of ' + Math.round(CEILING * 100) + '%, and a slope of at least ' + SLOPE
        + 'x, on ' + presses + ' presses of the dash.');
    }
  }

  // The wider claim, only checkable on a grid: a bigger radius has to divert more of the crowd.
  // That is not a fact about the card, it is a fact about the instrument - if a wider disc diverts
  // less, what this file measured was where the crowd happened to be and not the radius.
  for (const rank of opts.rankList) {
    const column = opts.baitList
      .map((bait) => rows.find((row) => row.bait === bait && row.rank === rank))
      .filter((row) => row !== undefined && row.litFrames > 0);
    for (let i = 1; i < column.length; i++) {
      if (column[i].divertWalk < column[i - 1].divertWalk) {
        failures++;
        lines.push('FAIL: at rank ' + rank + ', ' + column[i].bait + ' px diverted less than '
          + column[i - 1].bait + ' px did. A wider disc cannot fool fewer bodies; the grid is'
          + ' reading the crowd and not the radius.');
        break;
      }
    }
  }
  return { lines, failures };
}

async function main() {
  const opts = readArgs(process.argv.slice(2));
  if (opts.trigger !== null) setDashDial({ trigger: opts.trigger });
  const shippedBait = BALANCE.upgrades[LINE].bait;
  // The spacing is put on the live table for the whole grid: the sim reads it every step it lays an
  // image, and a ladder measured at one spacing while the table says another is a ladder nobody can
  // read back.
  if (opts.spacing !== null) BALANCE.upgrades[LINE].spacing = opts.spacing;

  const sheets = [];
  const batches = [];
  for (const bait of opts.baitList) {
    for (const rank of opts.rankList) {
      const sheet = newSheet();
      sheets.push({ sheet, bait, rank });
      batches.push({
        seeds: Array.from({ length: opts.seeds }, (unused, i) => i + 1),
        maxSeconds: opts.seconds,
        dash: opts.habit,
        // The rank is *pinned* after every step rather than dealt, which is how a rank ladder is a
        // ladder and not an account of what the bot happened to buy. The line stays in the deal
        // while it is pinned, so the bot spends a level on it and gets nothing for it at rung 0;
        // the same seeds run through every cell, so the deal each cell fights is the same deal.
        //
        // The radius is put on too, and every frame: the sim reads it live out of BALANCE, so a grid
        // measured without this would be every cell read at whatever the last one asked for.
        onFrame: (game) => {
          BALANCE.upgrades[LINE].bait = bait;
          game.world.upgrades[LINE] = rank;
          // A dash counted once, on the frame it starts - the sample size behind every share.
          const dashing = game.player.dashLeft > 0;
          if (dashing && !sheet.was) sheet.dashes++;
          sheet.was = dashing;
          readFrame(game.world, sheet);
        },
      });
    }
  }
  await playBatches(batches, () => { process.stdout.write('.'); });
  BALANCE.upgrades[LINE].bait = shippedBait;
  process.stdout.write('\n');

  const rows = sheets.map((c) => reportOf(c.sheet, c.bait, c.rank, opts.seeds));
  console.log('');
  for (const bait of opts.baitList) {
    console.log(gridTable(rows, bait, shippedBait, opts));
  }

  if (!opts.baitList.includes(shippedBait)) {
    console.log('--baits did not include ' + shippedBait + ', the shipped radius, so there is nothing'
      + ' to verdict on. The grids above are the ones you asked for.');
    return 0;
  }
  const verdict = verdictOf(rows, shippedBait, opts);
  for (const line of verdict.lines) console.log(line);
  return opts.strict && verdict.failures > 0 ? 1 : 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) process.exit(await main());
