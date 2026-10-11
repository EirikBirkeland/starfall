#!/usr/bin/env node
// What a rank of each firepower line is actually worth, measured on two crowds.
//
//   node tools/power-ladder.js                    both knots, twenty-four seconds
//   node tools/power-ladder.js --seconds 12       a shorter window
//   node tools/power-ladder.js --line nova        one line only
//   node tools/power-ladder.js --weapon scatter   a different primary under it
//
// The lines are measured on the pulse, because that is the gun every number in
// BALANCE.upgrades was priced against (NOTES sessions 30 to 32) - `--weapon` re-runs the
// same ladder with another primary underneath, which is how a line's worth is checked to
// scale with a gun that hits differently (the additive lines are the ones to look at
// there: a bite and a nova front cost a body what the plain gun costs it, whatever is
// being flown, so on a heavier gun they buy relatively less of a damage rank).
//
// Every line that makes the run hit harder is maxed, on a plain gun, and the answer is
// written as a multiple of what the plain gun did over the same seconds against the same
// crowd. That ladder is the basis of the upgrade balance: NOTES session 30 measured the
// four gun lines with it, session 31 added the orbital ring, and every line since has to
// be quoted against the same numbers or the comparison is worthless. This file is that
// measurement, so it outlives the session that needed it.
//
// Two knots, because a line is only worth what its geometry lets it be worth:
//
//   the ring    thirty bodies standing all round the ship, three deep. The crowd a nova
//               or an orbital ring is for, and the one a gun aimed down one line of it
//               mostly misses. The ship aims up, and one body is standing there.
//   the column  forty-two bodies in a block ahead of the ship, which is the air the gun
//               covers - what pierce and ricochet were first measured on.
//   the near    what the ship really has around it: three bodies, at the distance a press
//   field       really keeps. Measured, not invented - counted over twelve full bot runs,
//               the mean number of bodies inside two hundred and twenty px of a fleeing
//               ship is two and a third (NOTES session 32). The two knots above are what a
//               crowd can look like; this is what it does look like, and a wide line is
//               worth ten times more on a crowd thirty deep than on one three deep, so a
//               ring-line quoted off the ring knot is a bomb and not a card.
//
// Three rules the measurement depends on:
//
//   The bodies cannot die (`hp` is enormous), on purpose. A chain's fractional hits have
//     to be counted as damage rather than vanishing into a kill, and what a line buys is
//     a rate of damage and not a count of corpses (NOTES session 30's third test trap).
//   The run's XP is wiped every step, so a level-up cannot pause the arena in the middle
//     of a window: a measurement of a gun must not be a measurement of the pause.
//   Every row is averaged over the same handful of seeds. The crowd here does not move
//     and no wave arrives, but the split fan, the drone ring and the swarm's own jitter
//     all spend the logic stream, so one seed is a coin toss and six is a number.
//
// And one thing this file cannot measure, said here because it prints a row for it anyway: a
// line that adds no damage at all comes out at exactly 1.00x, which is a true answer to a
// question nobody was asking. game/afterimage.js is the first of those lines - it buys where
// the crowd walks, and nothing else - and what it is worth is measured instead in the share of
// the near crowd it diverts, in the comment on BALANCE.upgrades.afterimage.bait (NOTES session 42).
//
// There is a second kind of 1.00x and it is the trickier one, because the line *does* add damage:
// a knot of bodies that cannot die never dies, so a line that is paid for by a body coming apart
// never comes round anything here. game/magnetar.js is that line - it is triggered by picking up a
// shard, and nothing drops a shard in a knot of immortal bodies - so its row says 1.00x while the
// card is worth about a tenth of a run's whole damage. Its instrument is the run itself, dealt
// against out of the deck against handed free on the same seeds, and the numbers are on
// BALANCE.upgrades.magnetar (NOTES session 43). Chill's shatter leans on the same thing - a
// frozen body coming apart, which is the only way a shatter comes round - and the leech's hull
// leans on it outright, so every one of those rows is a floor here and not a measure.

// There is a third kind of 1.00x, and it is the one that took the longest to notice: a line that is
// paid for by a body coming to a *place* it was told about rather than a place it was shot at. game
// /mines.js is that line - a mine goes off when a body's skin touches a ring drawn on the floor - and
// the knots here are pinned, so nothing ever walks into one: the column and the near field both read
// 1.00x for a line that is worth about a twentieth of a run's damage. The same row on the dense ring
// reads 16x, because one mine dropped in a knot of thirty goes off with thirty bodies in it, which
// is also not what a run does. Both ends of that are wrong in opposite directions, which is the whole
// point: a knot of bodies standing still cannot price a trap, and the line's instrument is the run
// itself (`tools/line-ab.js --line mines`), as it was for magnetar above.

import { pathToFileURL } from 'node:url';
import { BALANCE } from '../src/game/balance.js';
import { isSynergy } from '../src/game/upgrades.js';
import { TAU } from '../src/core/math.js';
import { setWeapon } from '../src/game/weapons.js';
import { scriptedRun, enemyAt, stepTheWorld } from './headless/scripted.js';

const STEP = BALANCE.sim.step;
const IMMORTAL = 1e9;
const SEEDS = [11, 12, 13, 14, 15, 16];

function readArgs(argv) {
  const opts = { seconds: 24, line: null, weapon: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seconds') opts.seconds = parseFloat(argv[++i]);
    else if (argv[i] === '--line') opts.line = argv[++i];
    else if (argv[i] === '--weapon') opts.weapon = argv[++i];
    else { console.error('usage: power-ladder.js [--seconds N] [--line ID] [--weapon ID]'); process.exit(2); }
  }
  if (!Number.isFinite(opts.seconds) || opts.seconds <= 0) {
    console.error('--seconds wants a number of seconds');
    process.exit(2);
  }
  return opts;
}

export function marked(bodies) {
  for (const body of bodies) {
    body.hpBefore = body.hp;
    body.hull0 = body.hp;
    body.homeX = body.x;
    body.homeY = body.y;
  }
  return bodies;
}

/**
 * Put the knot back where it was planted, every step.

 * The crowd is shoved by everything that hurts it - a bullet's knockback, a drone's, a
 * front's - and a knot that is allowed to drift stops being the knot the measurement is
 * about after a second or two (session 31 found exactly this with the orbital ring: a thin
 * crowd shoved out of the bite band simply leaves the band). Pinning is what lets the same
 * knot be measured over any window: it is a crowd that happens to stand still, which is
 * what a knot is for.
 */
export function pin(bodies) {
  for (const body of bodies) {
    body.ix = 0;
    body.iy = 0;
    body.x = body.homeX;
    body.y = body.homeY;
    body.px = body.homeX;
    body.py = body.homeY;
  }
}

/**
 * Bring back whatever came apart since the last step, and answer how many did.
 *
 * This is what lets a *mortal* knot be read as a rate at all: a knot that is allowed to empty is a
 * stopwatch reading and not a number a second (tools/weapon-ladder.js measures what a gun can
 * *kill*, and a gun that cleared the column in a second would otherwise spend the rest of the
 * window shooting at an empty arena). `hull0` is what `marked` remembered the body's own hull
 * being, so a revived body comes back the kind it was planted as.
 *
 * Call it between steps, after whatever hurt the knot has been stepped: every body it finds with
 * no hull left died in the step that just went by, which is what makes the count it answers the
 * number of kills and not the number of corpses.
 */
export function revive(field, bodies) {
  let kills = 0;
  for (const body of bodies) {
    if (body.hp <= 0) {
      // `hull0` is what `marked` remembered. A caller that plants its own bodies and never marks
      // them would otherwise wind the body up to `undefined` and never notice, which is the sort of
      // silence this file exists to keep out of a measurement.
      if (body.hull0 === undefined) {
        throw new Error('revive needs marked bodies: nothing remembered what this one was worth');
      }
      kills++;
      body.hp = body.hull0;
      // A kill takes the body out of the crowd (game/enemies.js `removeEnemy` splices it), so a
      // revived one has to be put back in as well as wound up: this is the whole reason the knot
      // geometry is not enough to bring one back.
      if (field.enemies.indexOf(body) === -1) field.enemies.push(body);
    }
  }
  return kills;
}

export function hullGone(bodies) {
  return bodies.reduce((sum, body) => sum + (body.hpBefore - body.hp), 0);
}

/**
 * `per` bodies on each of the radii in `radii`, evenly spaced, one of them due north.
 *
 * `hp` is how much hull the knot stands with: the ladder measures a knot that cannot die, which is
 * what makes a rank of a line measurable (the rules at the top of this file), and
 * `tools/weapon-ladder.js` plants the same knot with the kind's own hull so it can count what
 * comes *down* rather than only what is chipped off.
 */
function ringKnot(field, hp) {
  const ship = field.player;
  const bodies = [];
  for (const radius of [50, 64, 78]) {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * TAU;
      bodies.push(enemyAt('swarmling',
        ship.x + Math.cos(a) * radius, ship.y + Math.sin(a) * radius,
        hp === undefined ? IMMORTAL : hp));
    }
  }
  return marked(bodies);
}

/** A block of bodies in the air the gun is pointing: six deep, seven across. */
function columnKnot(field, hp) {
  const ship = field.player;
  const bodies = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
      bodies.push(enemyAt('swarmling',
        ship.x + 150 + row * 26, ship.y - 78 + col * 26,
        hp === undefined ? IMMORTAL : hp));
    }
  }
  return marked(bodies);
}

/** Three bodies at the distances a real press keeps, one of them due north. */
function nearKnot(field, hp) {
  const ship = field.player;
  return marked([90, 150, 200].map((radius, i) => enemyAt('swarmling',
    ship.x + Math.cos(-Math.PI / 2 + i * 2.1) * radius,
    ship.y + Math.sin(-Math.PI / 2 + i * 2.1) * radius,
    hp === undefined ? IMMORTAL : hp)));
}

export const KNOTS = [
  // The aim is part of the knot: a gun that is pointed at the sky measures the sky.
  { name: 'the ring', build: ringKnot, aim: (ship) => ({ x: ship.x, y: ship.y - 200 }) },
  { name: 'the column', build: columnKnot, aim: (ship) => ({ x: ship.x + 200, y: ship.y }) },
  { name: 'the near field', build: nearKnot, aim: (ship) => ({ x: ship.x, y: ship.y - 200 }) },
];

/** Hold the trigger for `seconds` and report the hull that came off the knot. */
function measure(field, bodies, seconds, aim) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    pin(bodies);
    field.shards.clear();
    field.xp = 0;
    const ship = field.player;
    const where = aim(ship);
    stepTheWorld({ firing: true, aimX: where.x, aimY: where.y });
  }
  return hullGone(bodies) / seconds;
}

/** A run wearing `rank` ranks of `id` and nothing else, with the knot planted in it. */
function setUp(id, rank, knotAt, seed, weapon) {
  const field = scriptedRun(seed);
  field.xpNeed = Infinity;
  if (weapon !== null) setWeapon(field, weapon);
  if (rank > 0) field.upgrades[id] = rank;
  const knot = KNOTS[knotAt];
  return { field, bodies: knot.build(field), aim: knot.aim };
}

/** Hull a second taken off the knot by `rank` ranks of `id`. */
function rateFor(id, rank, knotAt, seconds, weapon) {
  let total = 0;
  for (const seed of SEEDS) {
    const run = setUp(id, rank, knotAt, seed, weapon);
    total += measure(run.field, run.bodies, seconds, run.aim);
  }
  return total / SEEDS.length;
}

/** Only run when called as a command, so tools/weapon-ladder.js can borrow the knots. */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

function main() {
  const opts = readArgs(process.argv.slice(2));
  const lines = Object.keys(BALANCE.upgrades)
    // A synergy is not in this list, and not because the arithmetic would not run: one rank of a
    // synergy *is* the whole card, and a card that needs two other lines at three each measures as
    // nothing at all on a run that has not taken them. The question a synergy can answer is "what is
    // it worth on a run that did": tools/line-ab.js --line thermalShock --with burn=3 --with chill=3.
    .filter((id) => !isSynergy(id))
    .filter((id) => BALANCE.upgrades[id].ranks > 0)
    .filter((id) => opts.line === null || id === opts.line);

  // What a rank of the damage line buys, in hull a second, is the yardstick every other line
  // below is quoted against - and the reason the orbital ring and the nova are both built to
  // be worth exactly this much per rank on a plain gun (BALANCE.upgrades).
  console.log('a maxed line against the plain gun, ' + opts.seconds + 's of trigger, mean of '
    + SEEDS.length + ' seeds, flying ' + (opts.weapon === null ? 'the pulse' : opts.weapon));

  for (let k = 0; k < KNOTS.length; k++) {
    const plain = rateFor('damage', 0, k, opts.seconds, opts.weapon);
    const rankOfDamage = rateFor('damage', 1, k, opts.seconds, opts.weapon) - plain;
    console.log('\n' + KNOTS[k].name + ': plain gun ' + plain.toFixed(1)
      + ' hull/s, one rank of the damage line ' + rankOfDamage.toFixed(1) + ' hull/s');
    for (const id of lines) {
      const maxed = rateFor(id, BALANCE.upgrades[id].ranks, k, opts.seconds, opts.weapon);
      const one = rateFor(id, 1, k, opts.seconds, opts.weapon);
      console.log('  ' + (id + ' ' + BALANCE.upgrades[id].ranks).padEnd(16)
        + (maxed / plain).toFixed(2) + 'x'
        + '  ' + maxed.toFixed(1).padStart(8) + ' hull/s'
        + '   one rank = ' + ((one - plain) / rankOfDamage).toFixed(2)
        + ' ranks of the damage line');
    }
  }
}

if (isMain) main();
