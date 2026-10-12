#!/usr/bin/env node
// What one upgrade line is worth in a run, measured three ways on the same seeds.
//
//   node tools/line-ab.js --line mines                     three conditions, six seeds, 15 min
//   node tools/line-ab.js --line nova --seeds 10           more seeds for the argument that matters
//   node tools/line-ab.js --line mines --stats mines,minesBlown    extra columns off the world
//   node tools/line-ab.js --line afterimage --dash         let the bot dash (see below)
//   node tools/line-ab.js --line burn --conditions deck,free       two of the three
//   node tools/line-ab.js --line mines --set weight=0.6    measure a different number for one of
//                                                        the line's own fields (repeatable)
//   node tools/line-ab.js --line turret --with burn=3      hold another line at a rank for the whole
//                                                        run (repeatable; what a synergy needs)
//   node tools/line-ab.js --line pierce --weapon lance     price the line on a run flying another
//                                                        primary
//
// `--weapon` is there because a line's worth is not a property of the line alone. Three of the five
// primaries cannot spend `pierce` or `ricochet` at all and two of them cannot spend `bulletSpeed`
// either (the arc throws no shot, a beam goes through everything on its line by definition, and a
// micro-missile is spent on the body it finds - game/arc.js, game/lance.js, game/missiles.js). A
// number quoted for `pierce` on the pulse says nothing about what the card does to a lance run,
// which is the question PLAN 10's dead-line item had to answer before it could be decided; the
// answer it bought is in the `cannotSpend` lists in game/balance.js and in test/deck-per-gun.test.mjs.
//
// A synergy is measured with `--with`, because a synergy on its own does nothing: its own rank is
// the thing under test and the two parents only have to be there. `--with burn=3 --with chill=3`
// keeps the parents at that depth from the first frame (the bot may still take more of them, which
// is why they are pinned with a `max` and not set), and the `free` condition is the one that reads -
// a synergy is never dealt by luck, so `dealt` and `free` are the same table with the card in it.
//
// The three conditions, and why there are three of them:
//
//   out      the line is out of the deck (`ranks: 0`, which is how a line is taken out of the game:
//            it cannot be dealt and cannot be guaranteed as the "something new" card). This is the
//            control, and it is the only condition that says what the line did rather than what the
//            run would have done anyway.
//   dealt    the line is on the rack like every other card, and the bot takes it if its own policy
//            prefers it. This is what a player actually gets, and for a line a bot has no use for it
//            is the honest reading of the card: a line the bot never spends is a line it should not
//            have been dealt.
//   free     every rank of the line, handed from the first frame of every run, on top of whatever
//            the bot chooses. This is the ceiling: what the line can be when it is fully in.
//
// Read the three together. A line that is worth nothing `dealt` and a great deal `free` is a line
// the bots cannot use - which is a finding about the bots as often as about the card, and NOTES is
// full of the ones where it was the bots (game/afterimage.js lives on a press neither of them will
// press, and game/magnetar.js on picking a shard up). `--dash` is there for exactly that: it gives
// the bot the habit a dash line needs (a press out of whatever gets within arm's reach), and a
// number quoted for a dash line without it is a number about a bot that never dashes. Which habit -
// the get-out, or the dive-in it replaced - is `--dash-habit` (tools/dash-habit.js).
//
// What is measured is the run, because these are the lines the power ladder cannot see: a knot of
// bodies that cannot die never walks anywhere, never drops a shard and never gets picked up, so
// `tools/power-ladder.js` prints 1.00x for a line worth a tenth of a run. What the ladder is for -
// a rate on a crowd that stands still - it still measures, and a line should be quoted off both.
//
// Two rules the measurement depends on, both inherited from `tools/power-ladder.js`:
//
//   Every condition plays the *same seeds*, in the same order. A run is a function of its seed and
//     the difference between two batches of different seeds is noise five times bigger than the
//     card being measured.
//   Nothing here is judged. There is no threshold in this file. It prints medians, because a batch
//     of runs is lopsided and a mean is not the middle of it (tools/simulate.js has the argument).
//
// The numbers are the ones that go into `BALANCE.upgrades` as a comment, with the date and the seed
// count attached, so that the next session can tell a measured number from an invented one.

import { BALANCE } from '../src/game/balance.js';
import { WEAPONS } from '../src/game/weapons.js';
import { bootGame } from './headless/harness.js';
import { playOneRun, POLICIES, DEFAULT_POLICY, DEFAULT_DASH_HABIT } from './headless/bot.js';
import { median } from './simulate.js';
import { clock, int, dec, table } from './headless/tables.js';

const DEFAULTS = {
  line: null,
  seed: 1,
  seeds: 6,
  seconds: 900,
  conditions: 'out,dealt,free',
  stats: '',
  sets: [],
  holds: [],
  policy: undefined,
  dash: undefined,
  weapon: undefined,
};

function readArgs(argv) {
  const opts = Object.assign({}, DEFAULTS);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => { i++; return argv[i]; };
    if (arg === '--line') opts.line = next();
    else if (arg === '--seed') opts.seed = parseInt(next(), 10);
    else if (arg === '--seeds') opts.seeds = parseInt(next(), 10);
    else if (arg === '--seconds') opts.seconds = parseFloat(next());
    else if (arg === '--conditions') opts.conditions = next();
    else if (arg === '--stats') opts.stats = next();
    else if (arg === '--bot') opts.policy = next();
    else if (arg === '--set') opts.sets.push(next());
    else if (arg === '--with') opts.holds.push(next());
    else if (arg === '--dash') opts.dash = true;
    else if (arg === '--dash-habit') opts.dash = next();
    else if (arg === '--weapon') opts.weapon = next();
    else { console.error('unknown option: ' + arg); process.exit(2); }
  }
  if (opts.line === null || BALANCE.upgrades[opts.line] === undefined) {
    console.error('--line wants one of: ' + Object.keys(BALANCE.upgrades).join(', '));
    process.exit(2);
  }
  if (BALANCE.upgrades[opts.line].ranks === 0) {
    console.error('the ' + opts.line + ' line has no ranks to measure');
    process.exit(2);
  }
  if (opts.policy !== undefined && !POLICIES[opts.policy]) {
    console.error('--bot wants one of: ' + Object.keys(POLICIES).join(', '));
    process.exit(2);
  }
  // Checked against the list the game offers and not against BALANCE.weapons, which also holds a
  // few meta keys beside the guns (game/weapons.js `setWeapon` asks the same question).
  if (opts.weapon !== undefined && !WEAPONS.some((gun) => gun.id === opts.weapon)) {
    console.error('--weapon wants one of: ' + WEAPONS.map((gun) => gun.id).join(', '));
    process.exit(2);
  }
  if (!(opts.seeds >= 1) || !(opts.seconds > 0)) {
    console.error('--seeds wants at least one run and --seconds a window longer than none');
    process.exit(2);
  }
  for (const assignment of opts.sets) {
    const parts = assignment.split('=');
    const key = parts[0];
    const value = Number(parts[1]);
    if (parts.length !== 2 || !Number.isFinite(value) || !(key in BALANCE.upgrades[opts.line])) {
      console.error('--set wants <key>=<number>, a key of BALANCE.upgrades.' + opts.line
        + ' (one of: ' + Object.keys(BALANCE.upgrades[opts.line]).join(', ') + ')');
      process.exit(2);
    }
  }
  for (const assignment of opts.holds) {
    const parts = assignment.split('=');
    const key = parts[0];
    const value = Number(parts[1]);
    if (parts.length !== 2 || !Number.isInteger(value) || value < 0
      || BALANCE.upgrades[key] === undefined) {
      console.error('--with wants <line>=<ranks>, a line of BALANCE.upgrades and a whole number '
        + 'of ranks: ' + assignment);
      process.exit(2);
    }
  }
  return opts;
}

/**
 * Put the `--set` numbers on the line, and say what was changed. This is the tuning knob: a line's
 * numbers are argued about in runs, and the way to argue is to change one and see what the middle of
 * a batch does - which is worth writing down as a command rather than a throwaway script, because a
 * printed table that does not say it was measured with `weight=0.6` is a number nobody can use.
 */
function applySets(opts) {
  const changed = [];
  for (const assignment of opts.sets) {
    const parts = assignment.split('=');
    const key = parts[0];
    const value = Number(parts[1]);
    changed.push(key + ' ' + BALANCE.upgrades[opts.line][key] + ' -> ' + value);
    BALANCE.upgrades[opts.line][key] = value;
  }
  return changed;
}

const CONDITIONS = {
  out: { note: 'the line is out of the deck', ranks: null },
  dealt: { note: 'the line is dealt like every other card', ranks: null },
  free: { note: 'every rank handed from the first frame', ranks: 'all' },
};

/** Put one condition's hold on the deck in place. Returns what to put back after it. */
function apply(condition, id) {
  const spec = BALANCE.upgrades[id];
  const whole = spec.ranks;
  if (condition === 'out') spec.ranks = 0;
  else spec.ranks = whole;
  return whole;
}

/** Everything the run's own sheet says was taken off bodies, summed over every kind. */
function damageOf(summary) {
  let total = 0;
  for (const kind of Object.values(summary.tally.kinds)) total += kind.damage;
  return total;
}

/** Has a run been played on this boot yet. The first one is already sitting on the title screen. */
let started = false;

/** One condition: play the batch on a game that is already booted, and report the middle of it. */
async function measure(game, condition, id, opts) {
  const restore = apply(condition, id);
  const ranks = CONDITIONS[condition].ranks;
  const summaries = [];

  for (let i = 0; i < opts.seeds; i++) {
    // One game per process (the modules hold the world), so every run after the first is played on
    // a page that has already run thousands of frames and has to be put back: see harness.js.
    if (started) await game.resetToTitle(opts.seed + i);
    started = true;
    summaries.push(playOneRun(game, {
      maxSeconds: opts.seconds,
      policy: opts.policy,
      weapon: opts.weapon,
      // Before the step, wherever the bot's own hands are (playOneRun): a dash leans the frame it
      // is granted in and not the one after it.
      dash: opts.dash,
      onFrame: () => {
        // Handed after every step, which is how a rank that was never bought is felt by the very
        // next one - the same door a card taken between two frames goes through (game/upgrades.js).
        if (ranks === 'all') game.world.upgrades[id] = BALANCE.upgrades[id].ranks;
        // A second line held at a depth instead of raised to it: a synergy needs its parents, and
        // pinning them with a `max` leaves the bot free to take more of them the way it likes
        // while guaranteeing the depth the card under test is asking for.
        for (const assignment of opts.holds) {
          const parts = assignment.split('=');
          const held = game.world.upgrades[parts[0]];
          game.world.upgrades[parts[0]] = Math.max(held, Number(parts[1]));
        }
      },
    }));
    process.stdout.write('.');
  }
  BALANCE.upgrades[id].ranks = restore;

  const extras = opts.statKeys.map((key) => median(summaries.map((s) => s.stats[key] || 0)));
  return {
    condition,
    // A win is an ending and not a survival (game/run.js `winRun`), so it does not belong in the
    // count of runs the window cut short.
    atCap: summaries.filter((s) => !s.died && !s.won).length,
    runs: summaries.length,
    score: median(summaries.map((s) => s.stats.score)),
    damage: median(summaries.map(damageOf)),
    seconds: median(summaries.map((s) => s.seconds)),
    ranks: median(summaries.map((s) => s.stats.ranks[id])),
    extras,
  };
}

const opts = readArgs(process.argv.slice(2));
const changed = applySets(opts);
opts.statKeys = opts.stats === '' ? [] : opts.stats.split(',').map((key) => key.trim());
const conditions = opts.conditions.split(',').map((name) => name.trim());
for (const name of conditions) {
  if (CONDITIONS[name] === undefined) {
    console.error('--conditions wants some of: ' + Object.keys(CONDITIONS).join(', '));
    process.exit(2);
  }
}

const game = await bootGame({ seed: opts.seed });
const results = [];
for (const name of conditions) {
  results.push(await measure(game, name, opts.line, opts));
}
game.stop();
console.log('');

const base = results[0];
const header = ['line', 'alive', 'median time', 'median score', 'vs first', 'median damage',
  'vs first', 'ranks taken'].concat(opts.statKeys.map((key) => key));
const rows = results.map((row) => [
  row.condition,
  row.atCap + '/' + row.runs,
  clock(row.seconds),
  int(row.score),
  base.score === 0 ? '-' : (row.score / base.score).toFixed(3) + 'x',
  int(row.damage),
  base.damage === 0 ? '-' : (row.damage / base.damage).toFixed(3) + 'x',
  dec(row.ranks, 1) + ' of ' + BALANCE.upgrades[opts.line].ranks,
].concat(row.extras.map((value) => dec(value, 1))));

console.log(table(
  'the ' + opts.line + ' line, measured on ' + opts.seeds + ' seeds at a ' + clock(opts.seconds)
    + ' window, ' + (opts.policy === undefined ? DEFAULT_POLICY : opts.policy) + ' bot'
    + (opts.weapon === undefined ? '' : ' flying the ' + BALANCE.weapons[opts.weapon].name)
    + (opts.dash === undefined
      ? ' that never dashes'
      : ' with the ' + (opts.dash === true ? DEFAULT_DASH_HABIT : opts.dash) + ' dash habit pressed')
    + (opts.holds.length > 0 ? ', on a run that always had ' + opts.holds.join(', ') : '')
    + (changed.length > 0 ? ', with ' + changed.join(', ') : ''),
  'the middle run of each batch, against the first condition listed. `damage` is everything the\n'
  + 'run took off bodies summed over every kind (game/tally.js keeps the sheet), which is the number\n'
  + 'a line that adds a source can move even when the score cannot. `ranks taken` is what the bot\n'
  + 'helped itself to: `dealt` with a 0 in that column means the bot never spent the card at all.',
  'lllrrrrl',
  header,
  rows,
));

for (const name of conditions) {
  console.log('  ' + name.padEnd(6) + CONDITIONS[name].note);
}
