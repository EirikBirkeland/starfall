#!/usr/bin/env node
// One primary's row, moved by hand, measured on the runs it changes.
//
//   node tools/gun-tune.js --gun pulse --set fireRate=2.6      one number, against the shipped row
//   node tools/gun-tune.js --gun lance --set damage=3 --set fireRate=1.8
//   node tools/gun-tune.js --gun pulse --sweep fireRate=0.9,1.4,1.8,2.6,3.4
//   node tools/gun-tune.js --gun scatter --set pellets=8 --seeds 1-16 --seconds 600
//   node tools/gun-tune.js --gun arc --sweep damage=2,3,4 --shards 8    the batch across 8 processes
//   node tools/gun-tune.js --gun swarm --set damage=2 --quiet           the table and nothing else
//   node tools/gun-tune.js --out /tmp/t.jsonl --play-only               a shard's rows, for --in
//   node tools/gun-tune.js --in /tmp/t-0.jsonl /tmp/t-1.jsonl          pool them and print once
//
// This is the tuning knob for a row of `BALANCE.weapons`, and it exists because the two tools that
// price a gun cannot tell you which number in it to move. `tools/weapon-ladder.js` prices a gun
// against the other four and takes minutes; `tools/power-ladder.js` prices its geometry on a crowd
// that stands still and cannot see a kill at all. The way a row actually gets argued about is to
// change one number and read what the middle of a batch does - and that has to be a command rather
// than a throwaway script, for the same reason `tools/line-ab.js --set` exists: a printed number
// that does not say it was measured with `fireRate=2.6` is a number nobody can use.
//
// The shipped row is always played as the first condition, on the same seeds, in the same process.
// A patch measured against a different batch of seeds is noise five times bigger than the number.
//
// `--sweep` is the flag this tool exists for. NOTES session 96: a probe that "does not fix it" has
// to say how far it probed. That session recorded "`damage` 5 to 3 with `fireRate` 0.9 to 1.4 gives
// 5,508 - no better" and concluded the rate was not the lever. The rate was the lever; 1.4 was not
// far enough, because what a rate buys is whether the press round the ship is thinned *at all*, and
// that is a cliff and not a slope (8 seeds at the old rate: six dead before the window; at 1.8, two
// dead; from 2.6, zero). A single `--set` prints an answer with no axis next to it. A sweep prints
// the axis.
//
// Two traps the table points at rather than hides:
//
//   **a rate moves the feel numbers with it.** `recoil`, `knockback`, the muzzle's count and life
//     and the sound's length are per-*pull* quantities in a table whose rows have different rates,
//     so moving `fireRate` silently moves how hard each of them lands, and a row retuned on the rate
//     alone has been retuned on all of them. The note names the ones this row actually has.
//   **a rate above `rateMax` is clipped, not refused.** `shotsPerSecond` (game/weapons.js) takes the
//     lesser of the row's rate and `BALANCE.weapons.rateMax`, which is a frame-budget guard and not
//     a balance number, so a patch past it measures the ceiling and not the number typed.
//
// What is *not* checked here is PLAN 10's band - no primary over 25% better than the others. That
// sentence belongs to `tools/weapon-ladder.js` and is pinned there; a row tuned here has to be
// re-measured there before it ships, and the table says so at the bottom rather than pretending the
// question was answered.
//
// One game per process is the harness's rule (the modules hold the world), so the conditions are
// played through one boot with `resetToTitle` between runs, and `--shards K` splits the seeds over
// K child processes: eight seeds at a ten minute window is about ninety seconds a condition on this
// box, and thirty of them in parallel is what made session 96's "what did not work" measurable at
// all. With `--in`, the `--bot`, `--picks`, `--seconds` and `--set` flags are labels on rows that
// were already played and nothing checks them; pass them as they were, or the header describes
// somebody else's batch.

import { pathToFileURL } from 'node:url';
import { BALANCE } from '../src/game/balance.js';
import { WEAPONS } from '../src/game/weapons.js';
import { bootGame } from './headless/harness.js';
import { playOneRun, POLICIES, PICKS } from './headless/bot.js';
import { median } from './simulate.js';
import { parseSeeds, readRows, writeRows, playSharded as playOverShards }
  from './headless/shards.js';
import { fieldAt, numberFields as numberFieldsOf, parseNumberPatch, applyPatches }
  from './headless/patch.js';
import { clock, int, dec, table } from './headless/tables.js';

const DEFAULTS = {
  gun: BALANCE.weapons.default, seed: 1, runs: 8, seconds: 600,
  policy: 'aware', picks: 'wise', sets: [], sweep: null,
  shards: 1, outfile: '', infiles: [], playOnly: false, quiet: false,
  // Whether this process has played a run yet. The first one is already sitting on the title screen
  // and every run after it needs a page that has never seen a frame (tools/headless/harness.js).
  started: false,
};

/** The primaries on offer, in the order the game offers them. */
export const ALL_GUNS = WEAPONS.map((gun) => gun.id);

/* ------------------------------------------------------------------ the row being moved */

/**
 * A field of a gun's row, addressed as `fireRate` or as `muzzle.count`.
 *
 * A thin wrapper over the shared patch module (tools/headless/patch.js), kept because this file's
 * notes and tests talk about a row's fields and the module talks about any table's.
 */
export function fieldOf(row, path) {
  return fieldAt(row, path);
}

/**
 * Read one `path=value` and check it against the row before a single run is played.
 *
 * A batch of twenty long runs is the wrong place to find out the field was spelled `firerate`, and a
 * field that is not a number (`name`, `sound.wave`, the list of lines a gun cannot spend) would put a
 * string into a multiplication somewhere else, minutes later.
 */
export function parseSet(gun, assignment) {
  return parseNumberPatch(assignment, BALANCE.weapons[gun],
    'the ' + BALANCE.weapons[gun].name + ' row');
}

/** `--sweep fireRate=0.9,1.4,1.8,2.6` - one field, the values to walk it through. */
export function parseSweep(gun, spec) {
  const parts = String(spec).split('=');
  const path = parts[0];
  const was = fieldOf(BALANCE.weapons[gun], path);
  if (parts.length !== 2 || was === undefined || typeof was !== 'number') {
    throw new Error('--sweep wants <field>=<number>,<number>,...: ' + spec);
  }
  const values = parts[1].split(',').map((text) => Number(text));
  if (values.length < 2 || values.some((value) => !Number.isFinite(value))) {
    throw new Error('--sweep wants at least two numbers to walk through: ' + spec);
  }
  return { path, values, was };
}

/** Every number on the row, spelled the way `--set` wants it. */
export function numberFields(gun) {
  return numberFieldsOf(BALANCE.weapons[gun]);
}

/* ------------------------------------------------------------------ the conditions */

/**
 * What gets played: the shipped row first, then one condition per patch.
 *
 * The control is not optional. A patch printed on its own is a number with nothing to be read
 * against, and the control has to be played in the same process on the same seeds, because the
 * difference between two batches of different seeds is noise five times bigger than the number.
 *
 * `--set` patches are held for every condition, so `--set damage=3 --sweep fireRate=...` walks the
 * rate at a fixed damage of 3 rather than walking two unrelated axes in one table.
 */
export function conditionsOf(opts) {
  const base = opts.sets.map((assignment) => parseSet(opts.gun, assignment));
  const control = { label: 'shipped', sets: [], swept: null };
  if (opts.sweep === null) return [control, { label: labelOf(base), sets: base, swept: null }];
  const swept = parseSweep(opts.gun, opts.sweep);
  return [control].concat(swept.values.map((value) => {
    const sets = base.concat([{ path: swept.path, value, was: swept.was }]);
    return { label: labelOf(sets), sets, swept: { path: swept.path, value } };
  }));
}

/** What a condition is called in the table: the numbers it moved, or `shipped` for the control. */
function labelOf(sets) {
  if (sets.length === 0) return 'shipped';
  return sets.map((set) => set.path + ' ' + set.value).join(', ');
}

/** The row as it stands, in the one line the header prints - only the parts this gun has. */
export function rowWords(gun) {
  const row = BALANCE.weapons[gun];
  const bits = [row.fireRate + ' pulls/s, ' + row.pellets + ' per pull, '
    + row.damage + ' hull each'];
  // A beam has no shot to give a speed and a life to (game/lance.js draws it), and printing
  // `undefined px/s for undefined s` for the one gun in the game that throws nothing is the sort of
  // thing that makes a table unread.
  if (typeof row.speed === 'number' && typeof row.life === 'number') {
    bits.push(row.speed + ' px/s for ' + row.life + ' s ('
      + Math.round(row.speed * row.life) + ' px of reach)');
  }
  if (typeof row.gap === 'number' && row.gap > 0) {
    bits.push(dec(row.gap, 3) + ' rad between neighbours');
  }
  if (Array.isArray(row.cannotSpend) && row.cannotSpend.length > 0) {
    bits.push('and cannot spend ' + row.cannotSpend.join(', '));
  }
  return bits.join(', ');
}

/** `1 seed`, `12 seeds`. */
function seedsWords(count) {
  return count + (count === 1 ? ' seed' : ' seeds');
}

/* ------------------------------------------------------------------ the command line */

/** Read the command line into plain values, and throw on anything it does not understand. */
export function readArgs(argv) {
  const opts = Object.assign({}, DEFAULTS, { seeds: null, sets: [], infiles: [], started: false });
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      i++;
      if (i >= argv.length) throw new Error(flag + ' needs a value');
      return argv[i];
    };
    if (flag === '--gun') opts.gun = value();
    else if (flag === '--set') opts.sets.push(value());
    else if (flag === '--sweep') opts.sweep = value();
    else if (flag === '--seed') opts.seed = Number(value());
    else if (flag === '--runs') opts.runs = Number(value());
    else if (flag === '--seeds') opts.seeds = value();
    else if (flag === '--seconds') opts.seconds = Number(value());
    else if (flag === '--bot') opts.policy = value();
    else if (flag === '--picks') opts.picks = value();
    else if (flag === '--shards') opts.shards = Number(value());
    else if (flag === '--out') opts.outfile = value();
    else if (flag === '--in') opts.infiles.push(value());
    else if (flag === '--play-only') opts.playOnly = true;
    else if (flag === '--quiet') opts.quiet = true;
    else throw new Error('unknown flag: ' + flag);
  }
  if (ALL_GUNS.indexOf(opts.gun) === -1) {
    throw new Error('--gun wants one of: ' + ALL_GUNS.join(', '));
  }
  if (POLICIES[opts.policy] === undefined) {
    throw new Error('--bot wants one of: ' + Object.keys(POLICIES).join(', '));
  }
  if (PICKS[opts.picks] === undefined) {
    throw new Error('--picks wants one of: ' + Object.keys(PICKS).join(', '));
  }
  if (opts.sets.length === 0 && opts.sweep === null && opts.infiles.length === 0) {
    throw new Error('nothing to measure: pass --set <field>=<number> or '
      + '--sweep <field>=<number>,...');
  }
  // Checked here and not at the first patch, so a misspelled field is a usage error and not a
  // stack trace after ninety seconds of runs.
  for (const assignment of opts.sets) parseSet(opts.gun, assignment);
  if (opts.sweep !== null) parseSweep(opts.gun, opts.sweep);
  if (!(opts.seconds > 0) || !(opts.runs >= 1)) {
    throw new Error('--seconds wants a window longer than none and --runs at least one run');
  }
  if (opts.infiles.length > 0 && opts.shards > 1) {
    throw new Error('--in pools runs that were already played; it has nothing left to shard');
  }
  if (opts.playOnly && opts.outfile === '') throw new Error('--play-only needs --out to write to');
  return opts;
}

/** The seeds to play, either `--seeds 1-24` / `--seeds 1,3,5` or `--seed N --runs M`. */
export function seedList(opts) {
  return opts.seeds !== null ? parseSeeds(opts.seeds)
    : Array.from({ length: opts.runs }, (unused, i) => opts.seed + i);
}

/* ------------------------------------------------------------------ the runs */

/**
 * One run, kept down to the columns the table reads.
 *
 * `at` is which condition played it, because a pooled batch of rows from K shards has to be split
 * back into its conditions and the label is a string a typo could change.
 */
function rowOf(summary, at) {
  return {
    at,
    seed: summary.seed,
    seconds: summary.seconds,
    died: summary.died,
    won: summary.won,
    score: summary.stats.score,
    level: summary.stats.level,
    kills: summary.stats.kills,
  };
}

/**
 * Play one condition's batch on a game that is already booted.
 *
 * The row is put back to shipped and then patched, every condition, so the sweep's third value is
 * measured on the third value alone. `onRun` is the progress dot: a batch of long runs is minutes of
 * silence without it, and whoever is watching wants to know which seed is taking its time.
 */
async function playCondition(game, gun, condition, seeds, opts, at) {
  // The patch goes on the row for the length of the condition and comes straight off it again, and it
  // touches only the leaves it names. Nothing here copies a row: a copied row is a row whose lists can
  // come back as objects (tools/headless/patch.js, and NOTES session 134 for the lance run that proved
  // it), and a condition that leaves a number behind measures the next one twice.
  const restore = applyPatches(condition.sets, BALANCE.weapons[gun]);
  const rows = [];
  try {
    for (let i = 0; i < seeds.length; i++) {
      // Every run after the very first one gets a title screen that has never seen a frame
      // (tools/headless/harness.js: one game per process, and a fresh page is what a second run in a
      // browser gets).
      if (opts.started) await game.resetToTitle(seeds[i]);
      opts.started = true;
      rows.push(rowOf(playOneRun(game, {
        maxSeconds: opts.seconds,
        policy: opts.policy,
        picks: opts.picks,
        weapon: gun,
      }), at));
      if (!opts.quiet) process.stdout.write('.');
    }
  } finally {
    restore();
  }
  return rows;
}

/** The same seeds again, played by K child processes and pooled. */
/**
 * The same seeds again, played by K child processes and pooled.
 *
 * The plumbing is the shared one (tools/headless/shards.js); what is this tool's own is the flag list
 * a shard needs to be measuring the same row.
 */
async function playSharded(seeds, opts) {
  const pass = ['--gun', opts.gun, '--seconds', String(opts.seconds), '--bot', opts.policy,
    '--picks', opts.picks];
  for (const set of opts.sets) pass.push('--set', set);
  if (opts.sweep !== null) pass.push('--sweep', opts.sweep);
  return playOverShards({
    name: 'gun-tune', tool: import.meta.url, seeds: seeds, shards: opts.shards, pass: pass,
  });
}

/* ------------------------------------------------------------------ the reading */

/**
 * What a batch of runs was.
 *
 * `bodies/s` is the median kills over the median seconds, which is the convention
 * `tools/weapon-ladder.js` prices the band on: XP is paid per body, so a run's damage is made of
 * levels and the number that matters is how fast bodies come apart, not how much hull comes off.
 */
export function standingOf(rows) {
  const pick = (field) => median(rows.map((row) => row[field]));
  return {
    runs: rows.length,
    alive: rows.filter((row) => !row.died).length,
    seconds: pick('seconds'),
    score: pick('score'),
    level: pick('level'),
    kills: pick('kills'),
    bodies: pick('kills') / pick('seconds'),
  };
}

/**
 * The notes a patch earns.
 *
 * Both of them are about a number that moves something other than itself, which is the kind of thing
 * a table that only prints medians will let you ship.
 */
export function notesFor(gun, conditions) {
  const notes = [];
  const moved = new Set();
  for (const condition of conditions) {
    for (const set of condition.sets) moved.add(set.path);
  }
  const row = BALANCE.weapons[gun];
  if (moved.has('fireRate')) {
    const feel = ['recoil', 'knockback', 'muzzle.count', 'muzzle.life', 'sound.dur', 'sound.vol']
      .filter((path) => typeof fieldOf(row, path) === 'number');
    notes.push('fireRate is a per-second number and '
      + (feel.length > 1 ? 'these are per-pull ones' : 'this is a per-pull one') + ': '
      + feel.join(', ') + '. Moving the rate moves how hard each of them lands, so a row retuned on'
      + ' the rate alone has been retuned on all of them (NOTES, session 96: "feel numbers ride on a'
      + ' rate").');
  }
  const over = [];
  for (const condition of conditions) {
    for (const set of condition.sets) {
      if (set.path === 'fireRate' && set.value > BALANCE.weapons.rateMax) {
        over.push(set.value);
      }
    }
  }
  if (over.length > 0) {
    notes.push('fireRate ' + over.join(', ') + ' is above BALANCE.weapons.rateMax ('
      + BALANCE.weapons.rateMax + '), and shotsPerSecond (game/weapons.js) takes the lesser of the '
      + 'two: those rows measure the frame-budget ceiling, not the number typed.');
  }
  return notes;
}

/** The table itself, one row per condition, the shipped control first. */
export function tuneTable(gun, standings, opts) {
  const base = standings[0].score;
  const rows = standings.map((at) => [
    at.label,
    at.alive + '/' + at.runs,
    clock(at.seconds),
    int(Math.round(at.score)),
    (at.score / base).toFixed(2) + 'x',
    dec(at.level, 1),
    int(Math.round(at.kills)),
    dec(at.bodies, 2),
  ]);
  return table(
    'the ' + BALANCE.weapons[gun].name + ' row, measured on ' + seedsWords(seedList(opts).length)
      + ' at a ' + clock(opts.seconds) + ' window, ' + opts.policy + ' bot, ' + opts.picks
      + ' cards'
      + (opts.sweep !== null ? ', sweeping ' + opts.sweep : ''),
    'the middle run of each batch. The first row is the row as shipped, on the same seeds, in the\n'
    + 'same process: a patch read against a different batch of seeds is noise five times bigger than\n'
    + 'the number. `bodies/s` is median kills over median seconds, the convention\n'
    + 'tools/weapon-ladder.js prices PLAN\'s band on, because XP is paid per body and not per hull.',
    'lllrrrrr',
    ['condition', 'alive', 'median time', 'median score', 'vs shipped', 'level', 'kills',
      'bodies/s'],
    rows,
  );
}

/* ------------------------------------------------------------------ main */

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  // A flag that does not parse is a usage error and gets a line rather than a stack: this is a tool
  // somebody types at a prompt in the middle of an argument, and exit 2 is what tools/line-ab.js
  // answers a bad flag with. Everything past the flags is left to fail loudly, because a tool that
  // cannot read its own rows is not a usage mistake.
  let opts;
  try {
    opts = readArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  await main(opts);
}

async function main(opts) {
  const seeds = seedList(opts);
  let rows;

  if (opts.infiles.length > 0) {
    rows = readRows(opts.infiles);
  } else if (opts.shards > 1) {
    rows = await playSharded(seeds, opts);
  } else {
    // One boot for every condition: the modules hold the world, so a process can only ever boot one
    // game (tools/headless/harness.js), and a tool that wants to compare patches has to put them all
    // through that one.
    const game = await bootGame({ seed: seeds[0] });
    const conditions = conditionsOf(opts);
    rows = [];
    for (let at = 0; at < conditions.length; at++) {
      if (!opts.quiet) process.stdout.write(conditions[at].label + ' ');
      rows = rows.concat(await playCondition(game, opts.gun, conditions[at], seeds, opts, at));
    }
    game.stop();
  }

  // The shipped control is condition 0 whether it was played here or in a shard. The conditions are
  // rebuilt from the flags, which is why the header of this file says a pooled batch has to be
  // handed the flags it was played with.
  const conditions = conditionsOf(opts);
  const standings = [];
  for (let at = 0; at < conditions.length; at++) {
    const mine = rows.filter((row) => row.at === at);
    if (mine.length === 0) throw new Error('no runs were played for ' + conditions[at].label);
    standings.push(Object.assign({ label: conditions[at].label }, standingOf(mine)));
  }

  if (opts.playOnly) {
    writeRows(opts.outfile, rows);
    return;
  }

  if (!opts.quiet) process.stdout.write('\n\n');
  console.log('the ' + BALANCE.weapons[opts.gun].name + ' row as shipped: '
    + rowWords(opts.gun));
  console.log('');
  console.log(tuneTable(opts.gun, standings, opts));
  for (const note of notesFor(opts.gun, conditions)) {
    console.log('');
    console.log('  note: ' + note);
  }
  console.log('');
  console.log('  PLAN\'s band - no primary over 25% better than the others - is not measured here and\n'
    + '  cannot be: it compares this gun to the other four. A row tuned here ships once\n'
    + '  tools/weapon-ladder.js has re-measured it. That is where the band is pinned, and where the\n'
    + '  knot columns say whether a run\'s reading is the gun or the bot driving it.');
}
