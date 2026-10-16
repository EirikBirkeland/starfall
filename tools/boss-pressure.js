#!/usr/bin/env node
// What a boss fight leaves a ship to stand in.
//
// `tools/difficulty-arc.js` says when a careless run dies; `tools/run-shape.js` says the survivors
// stop losing hull from the tenth minute on - which is to say that the three fights on the schedule
// are the one thing a strong run converts into nothing. Session 139 went looking for the lever and
// wrote down the finding: it is not the crowd and it is not the bosses' hull; a late game that bites
// would bite with *attacks*. It also wrote down the reason that has not happened since - the bot in
// this box steps off every telegraph it can see, so "did the run lose hull" cannot report a denser
// phase at all. The instrument was weaker than the claim.
//
// So this measures the room instead of the dodging. It never asks whether a ship gets hit; it asks
// how much of the cage a ship may occupy and *stay* occupying, which is a fact about the fight and
// not about the hands flying it.
//
// ### What is measured
//
// While a fight is on, the arena is a live box (game/field.js shuts a cage round the duel and the
// ship is clamped inside it by what it looks like), so that box is the room and the room is the
// denominator. A spot in it is **standable** for h seconds if a ship whose centre sat there and
// never moved would not be touched for h seconds. `h` is `bosses.telegraphMin` by default - the
// game's own promise that nothing lands less than that far after it was shown - so the column reads
// as "the room left to a ship that has one promise to answer", a duration the game already agreed to
// rather than one invented here.
//
// What claims a spot, every one of them measured with the test the hit itself would use:
//
//   a shell in the air      swept forward across the horizon, at `shot.r + ship.r`
//   a lock it is holding    the spokes it has drawn, if they fire inside the horizon (`axisDistance`)
//   a shell it is arming    as far as that wall could have travelled since it is thrown, minus the
//                           door it is holding open - game/bosses.js honours a door edge for edge,
//                           so a door is standing room and not a maybe
//   a fan it is showing     the whole arc the blades will travel, if they are loosed inside it
//   a blade already loose   the part of its sweep still in front of it (`offTheBlade`)
//   a body standing there   the fight, its mass and anything it called: `enemy.r + ship.r`
//   a call it is making     the marks on the rim, at the size of the body that will arrive on one
//   a brood not diving yet  the whole room it can *arrive* in inside the horizon, round itself and
//                           not in a lane - the dive it has not flown will be pointed at wherever
//                           the ship is standing, and that is the place being asked about
//   a brood already diving  the locked line its pack committed to, walked forward at the pace the
//                           beat flies it at
//
// A telegraph is only claimed once there is *not* a whole horizon left to leave it in, which is the
// entire point of a telegraph: a fan lit for 1.2 s is a place you may still be standing and the same
// fan with 0.2 s left is a place you may not. A fired beam claims nothing at all - a beam pays out
// on the step it is fired and the light left behind is the record of it (game/beams.js) - so
// standing in fading light is safe, and this says so.
//
// Beside the share of the room that is free, it counts how the free room is *cut up*. A shell with
// one door in it can leave 60% of the cage free and still divide it in two, and a ship on the wrong
// side of that wall has to cross the shell to get anywhere: `biggest` is the largest piece as a
// share of the room and `spots` the number of pieces big enough for a ship to be standing in.
//
// And it counts what the fight *sends*: shots, spokes, blades and bodies per second, which is the
// bill a beat that carries a second promise is supposed to pay out of its own ride (`with`,
// game/balance.js) instead of adding to it. A denser phase and a louder phase read the same in the
// standable column and nowhere else, and this is the column that tells them apart.
//
// ### What it is not
//
// It is not a difficulty rating. A phase that leaves 90% of the room free is a phase you can stand
// still through, which is one property of a fight and not the whole of one, and a phase that leaves
// 40% may be generous or murderous depending on how the room is shaped and how far the ship can
// cross in a promise. The caveats below are part of the measurement and not decoration:
//
//   * The Eclipse *drags* (balance.js `pull`): a ship that stands still is not standing still, it
//     falls sunwards. Its standable share overstates its freedom by whatever the drag is worth, and
//     the phase's own drag is printed beside it for that reason.
//   * There is no crowd in the room, because the wave director holds while a fight is on. This is
//     the duel alone, which is how a duel is played.
//   * Nothing shoots back. The ship is parked in the middle of the cage, cannot be hurt, and cannot
//     be moved - the aim a boss is given that it would never be given in a run - and the fight's mass
//     is whole, because nothing is shooting cells off it.
//
// ### Running it
//
//   node tools/boss-pressure.js                       all three fights, three phases each
//   node tools/boss-pressure.js --boss eclipse        one fight
//   node tools/boss-pressure.js --seconds 20          a shorter look (a shorter sample)
//   node tools/boss-pressure.js --horizon 1           a horizon of a second, not of a promise
//   node tools/boss-pressure.js --seed 12             a different die
//   node tools/boss-pressure.js --quiet               the tables and nothing else

import { pathToFileURL } from 'node:url';

import { BALANCE } from '../src/game/balance.js';
import { nextDive, packOf } from '../src/game/flock.js';
import { world } from '../src/game/world.js';
import { axisDistance, beamReach } from '../src/game/beams.js';
import { offTheBlade } from '../src/game/arms.js';
import { bossOnTheField, scriptedRun, stepTheWorld } from './headless/scripted.js';
import {
  armedCount, armArc, armCount, armHalf, armRate, armReach, armStep, beatTimeLeft, bossBeams,
  bossBlades, bossCores, bossFlare, bossName, bossPhase, bossPhaseCount, bossShots, bossSummons,
  callAngle, callBody, callCount, callStand, callStep, gapAngle, gapHalf, shellShot, spokeAngle,
  spokeCount, spokeHalf, spokeStep,
} from '../src/game/bosses.js';

/** px on a side of one sample of the room. One cell is one place a ship's centre can be. */
const CELL = 10;
/** How often to read the room, in seconds of the fight. */
const EVERY = 0.1;
/** The default horizon: PLAN 3.4's promise, read as a duration. */
const HORIZON = BALANCE.bosses.telegraphMin;
/** A piece of free room this many cells or bigger is a place a ship could actually be. */
const SPOT_CELLS = 9;
/** Below this share of the room standable, the phase has the ship in a corner. */
const TIGHT = 0.4;
/** How long a phase is left to settle into its own room before it is watched, in seconds. */
const SETTLE = 6.5;
/**
 * How many times a phase has to be read for its row to mean anything.
 *
 * The guard every ladder here carries: a phase that was never watched would report a room with
 * nothing in it, and a report that says "nothing is claimed" about a fight nobody watched is worse
 * than no report at all.
 */
const MIN_READS = 50;

/** What claimed a spot. One bit each, so a spot two things claim is counted under both. */
export const CLAIMS = [
  { key: 'shell', bit: 1 },
  { key: 'shots', bit: 2 },
  { key: 'spokes', bit: 4 },
  { key: 'fan', bit: 8 },
  { key: 'blades', bit: 16 },
  { key: 'call', bit: 32 },
  { key: 'bodies', bit: 64 },
  { key: 'arrive', bit: 128 },
  { key: 'dive', bit: 256 },
];
export const BIT = {};
for (const claim of CLAIMS) BIT[claim.key] = claim.bit;

/** Scratches for the two line tests borrowed from game/beams.js and game/arms.js. */
const SPBEAM = { x: 0, y: 0, dirX: 1, dirY: 0, fore: 0, back: 0 };
const BLADE = { x: 0, y: 0, dirX: 1, dirY: 0, inner: 0, reach: 0 };

/**
 * The room, as a grid of the places a ship's centre may be, and the claims on it.
 *
 * Built once per fight, refilled every sample: the cage does not move during a phase.
 */
export class Room {
  constructor() {
    this.cell = CELL;
    this.stamp = 0;
  }

  /** Size the grid to the cage: the box the duel is shut into, which is where a ship's centre may go. */
  open(box) {
    this.x0 = box.x0;
    this.y0 = box.y0;
    this.cols = Math.max(1, Math.floor((box.x1 - box.x0) / this.cell));
    this.rows = Math.max(1, Math.floor((box.y1 - box.y0) / this.cell));
    const cells = this.cols * this.rows;
    // A Uint8Array would have been enough until there were nine claims and a tenth bit to keep them
    // in: `claimed` is a set of flags, `BIT.dive` is 256, and a typed array narrower than the highest
    // bit files every dive under nothing without saying so. 16 bits now, and the test file paints
    // one cell per claim bit so an eleventh cannot go as quietly as the dive column did.
    this.claimed = new Uint16Array(cells);
    this.seen = new Int32Array(cells);
    this.stack = new Int32Array(cells);
    this.total = cells;
  }

  cx(i) { return this.x0 + (i + 0.5) * this.cell; }
  cy(j) { return this.y0 + (j + 0.5) * this.cell; }

  clear() { this.claimed.fill(0); }

  /**
   * Does this place stand free, in the reading that is laid out right now?
   *
   * Somewhere outside the room does not stand: the room is the cage, and a ship's centre cannot be
   * outside it - the arena has already held it off the walls (`fieldHalfWidth`), so a place beyond
   * the cage is not a place the fight is refusing, it is a place there is no cage for.
   */
  stands(x, y) {
    if (!this.inside(x, y)) return false;
    return this.claimed[this.index(x, y)] === 0;
  }

  /** Is this place inside the cage at all. */
  inside(x, y) {
    return this.index(x, y) !== -1;
  }

  /** The cell a place falls in, or -1 for a place the cage does not have. */
  index(x, y) {
    const i = Math.floor((x - this.x0) / this.cell);
    const j = Math.floor((y - this.y0) / this.cell);
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return -1;
    return j * this.cols + i;
  }

  /**
   * Claim every cell whose centre the test calls its, within a bounding box.
   *
   * Every claim in this file is a box and a predicate, which is the same shape for a disc, a shell
   * walked forward and a fan of blades: the geometry is named once, in the predicate, and the grid
   * is walked once.
   */
  paint(bit, x0, y0, x1, y1, inside) {
    const j0 = Math.max(0, Math.floor((y0 - this.y0) / this.cell));
    const j1 = Math.min(this.rows - 1, Math.floor((y1 - this.y0) / this.cell));
    const i0 = Math.max(0, Math.floor((x0 - this.x0) / this.cell));
    const i1 = Math.min(this.cols - 1, Math.floor((x1 - this.x0) / this.cell));
    for (let j = j0; j <= j1; j++) {
      const py = this.cy(j);
      let at = j * this.cols + i0;
      for (let i = i0; i <= i1; i++, at++) {
        if (inside(this.cx(i), py)) this.claimed[at] |= bit;
      }
    }
  }

  /** A disc: a body, or the mark a summon will arrive on. */
  disc(bit, x, y, r) {
    const r2 = r * r;
    this.paint(bit, x - r, y - r, x + r, y + r, (px, py) => {
      const dx = px - x, dy = py - y;
      return dx * dx + dy * dy <= r2;
    });
  }

  /** A disc with a wedge taken out of it: a wall of shots, and the door left in it. */
  discExcept(bit, x, y, r, doorAngle, doorHalf) {
    const r2 = r * r;
    this.paint(bit, x - r, y - r, x + r, y + r, (px, py) => {
      const dx = px - x, dy = py - y;
      if (dx * dx + dy * dy > r2) return false;
      if (doorHalf <= 0) return true;
      return Math.abs(wrapped(Math.atan2(dy, dx) - doorAngle)) > doorHalf;
    });
  }

  /** A capsule: a shell, walked forward across the horizon. */
  capsule(bit, x0, y0, x1, y1, r) {
    const r2 = r * r;
    const ax = x1 - x0, ay = y1 - y0;
    const len2 = ax * ax + ay * ay;
    this.paint(bit, Math.min(x0, x1) - r, Math.min(y0, y1) - r,
      Math.max(x0, x1) + r, Math.max(y0, y1) + r, (px, py) => {
        const t = len2 === 0 ? 0 : clamp01(((px - x0) * ax + (py - y0) * ay) / len2);
        const dx = px - (x0 + ax * t), dy = py - (y0 + ay * t);
        return dx * dx + dy * dy <= r2;
      });
  }

  /**
   * A spoke: a band out of a body and one way only, to `reach`.
   *
   * The test is the game's own - `beams.js axisDistance`, which is what a spoke pays out on - and
   * the scratch below is written here and read by nothing else.
   */
  ray(bit, x, y, angle, reach, half) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    SPBEAM.x = x; SPBEAM.y = y; SPBEAM.dirX = dx; SPBEAM.dirY = dy;
    SPBEAM.fore = reach; SPBEAM.back = 0;
    const pad = half + this.cell;
    const fx = x + dx * reach, fy = y + dy * reach;
    this.paint(bit, Math.min(x, fx) - pad, Math.min(y, fy) - pad,
      Math.max(x, fx) + pad, Math.max(y, fy) + pad,
      (px, py) => axisDistance(SPBEAM, px, py) <= half);
  }

  /**
   * A band swept through an arc: one blade still to travel, or a whole fan of them.
   *
   * The test is the game's own again (`arms.js offTheBlade`, which is a blade with a near end), asked
   * at whichever bearing of the sweep lies nearest the place - the same question the blade asks the
   * ship, once per place instead of once per step. Walking the arc in steps was the first draft and
   * it is wrong: two sub-angles `d` apart leave a hole of `reach x d - 2 x half` at the far end of a
   * long blade, and a hole in a claim is a place the tool swears is safe. `span` is signed, so a
   * blade that turns the other way claims the arc it has still to come and not the one behind it.
   */
  sweep(bit, x, y, from, span, inner, reach, half) {
    const edge = reach + half;
    this.paint(bit, x - edge, y - edge, x + edge, y + edge, (px, py) => {
      const dx = px - x, dy = py - y;
      const off = wrapped(Math.atan2(dy, dx) - from);
      const t = span === 0 ? 0 : clamp01(off / span);
      const angle = from + span * t;
      BLADE.x = x; BLADE.y = y; BLADE.dirX = Math.cos(angle); BLADE.dirY = Math.sin(angle);
      BLADE.inner = inner; BLADE.reach = reach;
      return offTheBlade(BLADE, px, py) <= half;
    });
  }

  /** How the room stands: how much of it is free, and how the free part is cut up. */
  measure() {
    const byBit = {};
    for (const claim of CLAIMS) byBit[claim.key] = 0;
    let free = 0;
    for (let i = 0; i < this.total; i++) {
      const c = this.claimed[i];
      if (c === 0) { free++; continue; }
      for (const claim of CLAIMS) if ((c & claim.bit) !== 0) byBit[claim.key]++;
    }
    this.stamp++;
    this.top = 0;
    let biggest = 0, spots = 0;
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const at = j * this.cols + i;
        if (this.claimed[at] !== 0 || this.seen[at] === this.stamp) continue;
        const size = this.flood(at);
        if (size > biggest) biggest = size;
        if (size >= SPOT_CELLS) spots++;
      }
    }
    for (const claim of CLAIMS) byBit[claim.key] /= this.total;
    return {
      free: free / this.total,
      biggest: biggest / this.total,
      spots,
      byBit,
    };
  }

  /** One connected piece of free room, painted out as it is counted. */
  flood(start) {
    let size = 0;
    this.stack[this.top++] = start;
    this.seen[start] = this.stamp;
    while (this.top > 0) {
      const at = this.stack[--this.top];
      size++;
      const x = at % this.cols;
      const y = (at - x) / this.cols;
      if (x > 0) this.push(at - 1);
      if (x + 1 < this.cols) this.push(at + 1);
      if (y > 0) this.push(at - this.cols);
      if (y + 1 < this.rows) this.push(at + this.cols);
    }
    return size;
  }

  push(at) {
    if (this.claimed[at] !== 0 || this.seen[at] === this.stamp) return;
    this.seen[at] = this.stamp;
    this.stack[this.top++] = at;
  }
}

function wrapped(angle) {
  const TAU = Math.PI * 2;
  let a = angle % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

// ---------------------------------------------------------------------------------------------
// The claims
// ---------------------------------------------------------------------------------------------

/** Everything already in the air, and everywhere it can reach before the horizon is up. */
function claimShells(room, horizon) {
  const reach = world.player.r;
  for (const shot of world.enemyShots.items) {
    const r = shot.r + reach;
    room.capsule(BIT.shots, shot.x, shot.y,
      shot.x + shot.vx * horizon, shot.y + shot.vy * horizon, r);
  }
}

/** Every body in the room: the fight, its mass, its brood and whatever it has called. */
function claimBodies(room) {
  const reach = world.player.r;
  for (const body of world.enemies) {
    if (body.hp <= 0) continue;
    room.disc(BIT.bodies, body.x, body.y, body.r + reach);
  }
}

/**
 * The brood: what a pack can put where the ship is standing, and where it is already putting it.
 *
 * A flock is the one attack in this game that *steers*, and the whole of the question is what a
 * steering body may honestly be credited with. Two geometries, and the game's own beat clock says
 * which one a body gets (game/flock.js `nextDive`):
 *
 *   a body **already diving** is flying a line its pack locked when the bunch ended, at the pace the
 *     beat glides it at - a shell with wings, and it gets the claim a shell gets: the lane it will
 *     have walked, measured from where it stands;
 *
 *   a body **not diving yet** - bracing, or gathering - has a dive coming at a moment its own clock
 *     already knows, and it will point that dive at wherever the ship is standing. Which is the
 *     place this tool is asking about, cell by cell, so no bearing can be borrowed from the world:
 *     the claim is the whole room the body can *arrive* in inside the horizon, a room round itself
 *     and not a lane out of it. This is the one claim here that is deliberately aim-free, and it is
 *     honest precisely because of that - whichever place a ship is standing in is the place the dive
 *     will point at. What is not counted is the approach: a gathering body is read from where it
 *     stands and given only its dive, never the walk that gets it closer first.
 *
 * Like every other telegraph here, a dive that has not been flown yet claims a place only once there
 * is not a whole horizon left to be out of it. A dive already in the air is claimed whatever the
 * clock, because it is not a promise any more.
 */
function claimBrood(room, horizon) {
  const reach = world.player.r;
  for (const body of world.enemies) {
    if (body.hp <= 0) continue;
    const dive = nextDive(body);
    // A dive whose time has not come inside the horizon yet claims nothing. The `away <= 0` two
    // lines down refuses it too - `horizon - dive.wait` has gone negative by then - so this is the
    // rule said in words rather than a branch with a test of its own, and it is written first for
    // that reason and not because anything would break if it were dropped.
    if (dive === null || dive.wait > horizon) continue;

    const away = dive.pace * Math.min(dive.left, horizon - dive.wait);
    if (away <= 0) continue;
    if (dive.wait > 0) {
      room.disc(BIT.arrive, body.x, body.y, body.r + reach + away);
      continue;
    }
    const pack = packOf(body);
    room.capsule(BIT.dive, body.x, body.y,
      body.x + pack.dirX * away, body.y + pack.dirY * away, body.r + reach);
  }
}

/** Every blade loose in the room, and the part of its sweep still in front of it. */
function claimBlades(room, horizon) {
  for (const arm of world.arms.items) {
    // How far it has still to go: its rate, for as long as it has any sweep left to spend - and a
    // blade that has spent it claims the place it stands and nothing further.
    const turn = arm.spin * Math.min(horizon, Math.abs(arm.left / (arm.spin || 1)));
    room.sweep(BIT.blades, arm.x, arm.y, arm.angle, turn, arm.inner, arm.reach, arm.half);
  }
}

/**
 * What the fight is promising, if it is out of time to be left.
 *
 * Nothing here is a guess at where an attack will land: every number is the one the beat itself is
 * fired from (game/bosses.js keeps them on the fight for exactly that reason, so that the warning
 * and the harm are the same four or five numbers), and each claim is clipped to the horizon the same
 * way the harm would be.
 */
function claimPromises(room, boss, horizon) {
  const left = beatTimeLeft(boss);
  if (left > horizon) return;            // a whole horizon left to leave it in
  const spare = horizon - left;          // how far past the landing the horizon reaches
  const body = boss.enemy;

  const spokes = spokeCount(boss);
  if (spokes > 0 && body !== null) {
    const half = spokeHalf(boss);
    for (let i = 0; i < spokes; i++) {
      const angle = spokeAngle(boss) + i * spokeStep(boss);
      const dx = Math.cos(angle), dy = Math.sin(angle);
      // The same clip the beam gets when it is fired (game/beams.js), and the same one-way axis:
      // a spoke is a ray out of the ring, which is what leaves the far side of a ring a place to be.
      const ends = beamReach(world, body.x, body.y, dx, dy);
      room.ray(BIT.spokes, body.x, body.y, angle, ends.fore, half);
    }
  }

  if (armedCount(boss) > 0 && body !== null) {
    const shot = shellShot(boss);
    const r = shot.speed * spare + shot.radius + world.player.r;
    room.discExcept(BIT.shell, body.x, body.y, r, gapAngle(boss), gapHalf(boss));
  }

  const fans = armCount(boss);
  if (fans > 0) {
    const arc = armArc(boss) * Math.sign(armRate(boss) || 1);
    const reach = armReach(boss), half = armHalf(boss), step = armStep(boss);
    for (const core of bossCores(boss)) {
      const coreBody = core.enemy;
      if (coreBody.hp <= 0) continue;
      for (let i = 0; i < fans; i++) {
        const from = core.angle + i * step;
        // The whole fan, not the part of it a blade could cross inside the horizon: a sweep that
        // lands inside the promise is a sweep the ship has to be out of, edge for edge, and it has
        // all of `left` - which is inside the horizon - to have left it by.
        room.sweep(BIT.fan, coreBody.x, coreBody.y, from, arc, coreBody.r, reach, half);
      }
    }
  }

  const marks = callCount(boss);
  if (marks > 0 && body !== null) {
    const middle = (marks - 1) / 2;
    const stand = body.r + callStand(boss);
    const size = callBody(boss) + world.player.r;
    for (let i = 0; i < marks; i++) {
      const angle = callAngle(boss) + (i - middle) * callStep(boss);
      room.disc(BIT.call, body.x + Math.cos(angle) * stand, body.y + Math.sin(angle) * stand, size);
    }
  }
}

/** How many bodies are standing in the room - the fight, its mass, its brood, its calls. */
function bodiesIn(room) {
  let seen = 0;
  for (const body of world.enemies) {
    if (body.hp > 0 && room.inside(body.x, body.y)) seen++;
  }
  return seen;
}

/** One reading of the room: clear it, lay every claim on it, and count what is left. */
export function readRoom(room, boss, horizon) {
  room.clear();
  claimShells(room, horizon);
  claimBlades(room, horizon);
  claimPromises(room, boss, horizon);
  claimBrood(room, horizon);
  claimBodies(room);
  return room.measure();
}

// ---------------------------------------------------------------------------------------------
// Driving a fight to a phase and holding it there
// ---------------------------------------------------------------------------------------------

/** The hull share a phase is fought at: the middle of the band `atHull` opens it in. */
export function bandShare(index) {
  const marks = BALANCE.bosses.atHull;
  const bottom = index + 1 < marks.length ? marks[index + 1] : 0;
  return (marks[index] + bottom) / 2;
}

/**
 * Stand the fight's hull still in the middle of one phase's band, every step, for as long as that
 * phase is watched. The bar is notched by a fixed amount (`damageBar`), so pinning it mid-band both
 * holds the phase and keeps the notch honest - the fight can still be hit, it just cannot fall.
 */
function holdHull(boss, share) {
  for (const core of bossCores(boss)) {
    core.enemy.hp = core.enemy.maxhp * share;
  }
}

/** Put the ship back in the cage's middle, and keep it there whatever the fight does to it. */
function park() {
  const box = world.field;
  const x = (box.x0 + box.x1) / 2, y = (box.y0 + box.y1) / 2;
  const ship = world.player;
  ship.x = x; ship.px = x; ship.y = y; ship.py = y;
  ship.vx = 0; ship.vy = 0;
}

/**
 * Walk the clock until the phase asked for is standing in the room, flare spent, and then let the
 * room settle for a few seconds more.
 *
 * The settle is not tidiness. Whatever the phase before was throwing has to have flown out of the
 * room or died at a wall before the room can be called this phase's own, and a shell lives six
 * seconds, so the wait is about that long.
 */
function intoPhase(boss, index) {
  const share = bandShare(index);
  const step = BALANCE.sim.step;
  let guard = 0;
  while ((bossPhase(boss) !== index + 1 || bossFlare(boss) > 0) && guard++ < 6000) {
    park();
    holdHull(boss, share);
    stepTheWorld();
  }
  if (bossPhase(boss) !== index + 1) throw new Error('phase ' + (index + 1) + ' never opened');
  for (let t = 0; t < SETTLE - 1e-9; t += step) {
    park();
    holdHull(boss, share);
    stepTheWorld();
  }
  return share;
}

/**
 * How many separate things the fight has put into the room: shots thrown, spokes fired, blades
 * loosed, bodies called. One number, because the question it answers is "how many things is a ship
 * being asked to be out of per second", and that question does not care which of them it is.
 *
 * It is the accounting a pairing is held to: a beat that carries a second promise should raise how
 * many of these a ship has to answer *at once*, and not how many arrive per second.
 */
export function thingsSent(boss) {
  return bossShots(boss) + bossBeams(boss) + bossBlades(boss) + bossSummons(boss);
}

/**
 * Watch one phase of one fight and report the room it leaves.
 *
 * The fight is held at one hull share so that the phase does not change under the ruler, the ship is
 * parked and emptied out of the way of the answer, and every shot the phase throws is left to fly -
 * nothing is faked, the fight simply keeps fighting for as long as it is asked to.
 */
function watchPhase(boss, room, share, seconds, horizon) {
  const step = BALANCE.sim.step;
  const every = Math.max(1, Math.round(EVERY / step));
  const row = {
    samples: 0, free: 0, worst: 1, tight: 0, biggest: 0, spots: 0, byBit: {},
  };
  for (const claim of CLAIMS) row.byBit[claim.key] = 0;
  let since = 0;
  let t = 0;
  let crowd = 0, crowdAt = 0;
  const sentAtFirst = thingsSent(boss);
  while (t < seconds - 1e-9) {
    park();
    holdHull(boss, share);
    stepTheWorld();
    t += step;
    since++;
    if (since < every) continue;
    since = 0;
    const now = readRoom(room, boss, horizon);
    row.samples++;
    row.free += now.free;
    row.biggest += now.biggest;
    row.spots += now.spots;
    crowd += bodiesIn(room);
    crowdAt++;
    if (now.free < row.worst) row.worst = now.free;
    if (now.free < TIGHT) row.tight++;
    for (const claim of CLAIMS) row.byBit[claim.key] += now.byBit[claim.key];
  }
  const n = row.samples;
  if (n < MIN_READS) {
    throw new Error('a phase was read ' + n + ' times, which is not a sample: '
      + 'it needs ' + MIN_READS + ' (try a longer --seconds)');
  }
  return {
    samples: n,
    free: row.free / n,
    worst: row.worst,
    tight: row.tight / n,
    biggest: row.biggest / n,
    spots: row.spots / n,
    crowd: crowdAt === 0 ? 0 : crowd / crowdAt,
    sent: (thingsSent(boss) - sentAtFirst) / t,
    byBit: Object.fromEntries(Object.entries(row.byBit).map(([k, v]) => [k, v / n])),
  };
}

// ---------------------------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------------------------

const USAGE = `node tools/boss-pressure.js          what room a fight leaves a ship to stand in
node tools/boss-pressure.js --boss K       one fight only (warden, hive, eclipse)
node tools/boss-pressure.js --seconds N    how long to watch each phase for (default 40)
node tools/boss-pressure.js --horizon S    the horizon in seconds (default: telegraphMin, 0.6)
node tools/boss-pressure.js --seed N       a different die
node tools/boss-pressure.js --quiet        the tables and nothing else
node tools/boss-pressure.js --help         this text`;

function readArgs(argv) {
  const opts = { boss: null, seconds: 40, horizon: HORIZON, seed: 7, quiet: false, help: false };
  const number = (arg, value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      console.error(arg + ' wants a number of seconds, got ' + value);
      process.exit(2);
    }
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--quiet') opts.quiet = true;
    else if (arg === '--boss') opts.boss = argv[++i];
    else if (arg === '--seconds') opts.seconds = number('--seconds', argv[++i]);
    else if (arg === '--horizon') opts.horizon = number('--horizon', argv[++i]);
    else if (arg === '--seed') opts.seed = number('--seed', argv[++i]);
    else {
      console.error('boss-pressure does not know the argument ' + arg);
      console.error(USAGE);
      process.exit(2);
    }
  }
  const ids = BALANCE.bosses.schedule.map((row) => row.boss);
  if (opts.boss !== null && !ids.includes(opts.boss)) {
    console.error('no fight is called ' + opts.boss + '; the schedule is ' + ids.join(', '));
    process.exit(2);
  }
  return opts;
}

const pct = (v) => (v * 100).toFixed(1) + '%';

function fightRows(index, opts) {
  const entry = BALANCE.bosses.schedule[index];
  // One fresh duel per fight. A world keeps the boss it is fighting, so the second and third fight
  // of a look have to be asked for in a run that is not still standing in the first one.
  scriptedRun(opts.seed);
  const boss = bossOnTheField(index);
  const room = new Room();
  room.open(world.field);
  const table = BALANCE.bosses[entry.boss];
  const rows = [];
  for (let phase = 0; phase < bossPhaseCount(boss); phase++) {
    const share = intoPhase(boss, phase);
    const row = watchPhase(boss, room, share, opts.seconds, opts.horizon);
    const phaseRow = table.phases[phase];
    rows.push({
      phase: phase + 1,
      band: bandShare(phase),
      pull: phaseRow.pull === undefined ? null : phaseRow.pull.force,
      ...row,
    });
  }
  return { id: entry.boss, name: bossName(boss), cage: { ...world.field }, rows };
}

function fightTable(fight) {
  const lines = [];
  const width = fight.cage.x1 - fight.cage.x0;
  const height = fight.cage.y1 - fight.cage.y0;
  lines.push(fight.name + ' - a room ' + width + ' by ' + height + ' px, '
    + fight.rows.length + ' phases');
  lines.push('');
  lines.push('  phase  held at   standable    worst    in a corner   biggest piece   spots  '
    + ' crowd   sent/s   claims: ' + CLAIMS.map((c) => c.key).join(' '));
  for (const row of fight.rows) {
    const claims = CLAIMS.map((c) => (row.byBit[c.key] * 100).toFixed(1).padStart(5)).join(' ');
    lines.push('      ' + String(row.phase) + '  ' + pct(row.band).padStart(5) + '   '
      + pct(row.free).padStart(8) + '  ' + pct(row.worst).padStart(7) + '     '
      + pct(row.tight).padStart(6) + '        ' + pct(row.biggest).padStart(6) + '   '
      + row.spots.toFixed(1).padStart(5) + '   ' + row.crowd.toFixed(0).padStart(5) + '   '
      + row.sent.toFixed(2).padStart(6) + '     ' + claims
      + (row.pull === null ? '' : '   drag ' + row.pull));
  }
  return lines;
}

const FOREWORD = [
  'A spot in a boss fight is standable if a ship parked on it and never moved would not be touched',
  'for one promise - `bosses.telegraphMin`, 0.6 s - and the room is the cage the fight shuts round',
  'the duel. A telegraph only claims a place once there is not a whole promise left to leave it in,',
  'and a shell leaves the door it is holding open standing room. `worst` is the single tightest step',
  'of the watch; `in a corner` is how often the room was down to under 40%; `biggest piece` and',
  '`spots` say how the free room is cut up, because a shell across the room can leave 60% free and',
  'still put it all on the other side of the wall. `sent/s` is how many separate things the fight',
  'puts into the room per second - shots, spokes, blades, bodies - which is the bill a beat that',
  'carries a second promise pays out of its ride (`with`) and does not add to. `crowd` is how many',
  'bodies were standing in the room to be read, which matters more than it looks: nothing in here is',
  'shooting any of them back. `claims` is what took each share of the room - a place two things',
  'claim is counted under both, so those columns can add to more than 100%.',
];
const FOOTNOTES = [
  'Caveats that are part of the number: there is no crowd in the room, because the director holds',
  'while a fight is on; nothing shoots back, so every shell is aimed at the middle of the cage where',
  'the ship was parked and the mass is whole because no cell is being shot off; and the Eclipse',
  'drags, so a ship standing still in its room is not standing still and its standable share is a',
  'flattering read of its freedom by whatever the drag in the `drag` column is worth.',
  '',
  'And because nothing shoots back, a brood a fight calls is never called off. `crowd` is how many',
  'bodies were standing in the room to be read, and over a long watch of a breeding fight it only',
  'grows: the second boss\'s last phase reads 41 of them after eight seconds of watch and 216 after',
  'eighty, and the `arrive` share grows with the crowd. That is not a flaw in the read: it is the',
  'read telling you the state is not one a run is in - a hive\'s `arrive` share is a share of the',
  'room a *passive* ship is left with after a minute of not shooting. Read each row beside its',
  '`crowd`, and read `--seconds 8` as the nearer thing to a fight a run is actually having.',
  '',
  'One more, and it is why the second boss used to be the flattest row in this report. A shell, a',
  'spoke, a fan and a blade all travel a line the fight has already shown, so each could be counted',
  'where it will have got to across the horizon. A brood steers, and a steering body cannot be',
  'projected - but it can be *promised*, and a flock is a promise on a clock: a pack already diving',
  'flies a line it has locked, and a pack bunching has a dive whose time its own clock already says',
  'and whose bearing will be wherever the ship turns out to be standing. Those two are read now.',
  'What is not read is the approach of a flock that has committed to nothing. It gets credited with',
  'the place it stands and no more, which a probe says is worth some 200 px of flattering flight -',
  'the smaller half of the flattery, and the only half left. Read the brood at all and the second',
  'boss is not the flattest of the three; on its worst moment it is the tightest thing in the game.',
];

function main(argv) {
  const opts = readArgs(argv);
  if (opts.help) {
    process.stdout.write(USAGE + '\n');
    return 0;
  }
  const schedule = BALANCE.bosses.schedule;
  const out = [];
  out.push('STARFALL boss pressure - the room a fight leaves a ship, measured off the fight itself');
  out.push('');
  if (!opts.quiet) out.push(...FOREWORD, '');
  for (let i = 0; i < schedule.length; i++) {
    if (opts.boss !== null && schedule[i].boss !== opts.boss) continue;
    out.push(...fightTable(fightRows(i, opts)), '');
  }
  if (!opts.quiet) out.push(...FOOTNOTES, '');
  out.push('seed ' + opts.seed + ', horizon ' + opts.horizon.toFixed(2) + ' s, '
    + opts.seconds + ' s of each phase watched (' + Math.floor(opts.seconds / EVERY)
    + ' readings), one cell = ' + CELL + ' px.');
  process.stdout.write(out.join('\n') + '\n');
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) process.exit(main(process.argv.slice(2)));
