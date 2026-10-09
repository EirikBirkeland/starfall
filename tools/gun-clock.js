#!/usr/bin/env node
// What one body loses to a gun whose cursor is parked on where it was.
//
//   node tools/gun-clock.js                       every primary, four crossing speeds
//   node tools/gun-clock.js --weapon lance        one gun only
//   node tools/gun-clock.js --range 400           further up the nose
//   node tools/gun-clock.js --seconds 3           a longer window
//   node tools/gun-clock.js --seeds 10            more seeds for the argument that matters
//
// `tools/power-ladder.js` measures crowds that cannot move, which is what makes a rank of a line
// measurable at all, and its knots are aimed at: the bodies stay where the cursor is. This file
// measures the other half, which is what a gun is worth when the cursor is a heartbeat behind the
// body - because that is what a wind-up and a shell's flight time actually cost.
//
// One body, `range` px up the nose, too much hull to die, holding its distance and walking across
// the line at a chosen pace while the cursor stays on the place it was standing. The hull that comes
// off in `--seconds` is the answer. A gun that arrives late - a beam after a wind-up, a shell after
// a flight - meets a body that has moved, and the sooner it arrives the more of this window it is
// paid out in. Read a row as a slope: the flat row is a gun whose aim is a formality and the falling
// row is a gun that has to be led.
//
// The four paces are the crowd's own, out of BALANCE.kinds: nothing (a knot, which is what the other
// tools measure), a drifter's walk, a darter's lunge, and a swarmling's flock. The distance a body
// gets off the line before the light lands is `pace x the gun's own wait`, so the number that decides
// each column is that against the line's own tolerance - half the beam's width plus the body's own
// radius - and the comment on BALANCE.weapons.lance quotes what this file printed.
//
// The ship is held in the middle of the arena and the body holds its distance up the nose on purpose:
// a gun is shoved backwards by its own report and knockback pushes a body out of reach, and neither
// of those is what is being asked here.

import { BALANCE } from '../src/game/balance.js';
import { WEAPONS, setWeapon } from '../src/game/weapons.js';
import { scriptedRun, enemyAt, stepTheWorld } from './headless/scripted.js';
import { clock, int, dec, table } from './headless/tables.js';

const STEP = BALANCE.sim.step;
const IMMORTAL = 100000;

function readArgs(argv) {
  const opts = { weapon: null, range: 200, seconds: 2, seeds: 5 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--weapon') opts.weapon = argv[++i];
    else if (arg === '--range') opts.range = parseFloat(argv[++i]);
    else if (arg === '--seconds') opts.seconds = parseFloat(argv[++i]);
    else if (arg === '--seeds') opts.seeds = parseInt(argv[++i], 10);
    else {
      console.error('usage: gun-clock.js [--weapon id] [--range px] [--seconds n] [--seeds n]');
      process.exit(2);
    }
  }
  if (opts.weapon !== null && BALANCE.weapons[opts.weapon] === undefined) {
    console.error('no weapon is called ' + opts.weapon);
    process.exit(2);
  }
  return opts;
}

const PACES = [
  { name: 'standing', across: 0 },
  { name: 'drifter', across: BALANCE.kinds.drifter.speed },
  { name: 'darter', across: BALANCE.kinds.darter.speed },
  { name: 'swarmling', across: BALANCE.kinds.swarmling.speed },
];

/**
 * Park the cursor `range` px up the nose, hold the trigger for `seconds`, and answer the hull the
 * body lost while it walked across at `across` px/s. The body cannot die, so the answer is a rate of
 * damage and not a count of corpses (the same rule tools/power-ladder.js keeps and for the same
 * reason: a kill throws the body out of the arena and out of the measurement).
 */
function hullLost(weapon, seed, across, range, seconds) {
  const field = scriptedRun(seed);
  setWeapon(field, weapon);
  const ship = field.player;
  const middle = { x: ship.x, y: ship.y };
  const aim = { x: ship.x, y: ship.y - range };
  const body = enemyAt('drifter', aim.x, aim.y, IMMORTAL);
  body.speed = 0;

  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    // Held, so that the only thing moving the body is the pace the row asked for.
    ship.x = ship.px = middle.x;
    ship.y = ship.py = middle.y;
    ship.vx = 0;
    ship.vy = 0;
    body.y = body.py = aim.y;
    body.x += across * STEP;
    body.px = body.x;
    stepTheWorld({ firing: true, aimX: aim.x, aimY: aim.y });
  }
  return IMMORTAL - body.hp;
}

const opts = readArgs(process.argv.slice(2));
const guns = opts.weapon === null ? WEAPONS.map((weapon) => weapon.id) : [opts.weapon];
const start = process.hrtime.bigint();

const rows = [];
for (const id of guns) {
  const row = [id];
  for (const pace of PACES) {
    let total = 0;
    for (let seed = 1; seed <= opts.seeds; seed++) {
      total += hullLost(id, seed, pace.across, opts.range, opts.seconds);
    }
    row.push(dec(total / opts.seeds, 1));
  }
  rows.push(row);
}

console.log(table(
  'one body ' + int(opts.range) + ' px up the nose, walking across while the cursor stays where it was',
  'hull lost in ' + dec(opts.seconds, 1) + 's of held trigger, mean of ' + opts.seeds + ' seeds',
  ['l', 'r', 'r', 'r', 'r'],
  ['gun', 'standing', 'drifter', 'darter', 'swarmling'],
  rows));
console.log(clock(Number(process.hrtime.bigint() - start) / 1e9));
