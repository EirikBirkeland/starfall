// A boss (PLAN 3.4): the schedule, the warning, the cage, the phases, and the going down.
//
// This file is the *framework*. It knows when a boss is due, how the warning runs, how the
// room closes, when a phase opens and what a phase change does; it does not know what any
// particular boss does with its turn, which is the boss's own row's business
// (`BALANCE.bosses.warden`) and gets to be as strange as a boss needs to be. Five duties,
// and each of them has a test:
//
//   **The schedule.** `BALANCE.bosses.schedule` is a list of { at, boss } and the run walks
//     it once: the entry whose time has come opens the fight, and `world.bossIndex` counts
//     how many have been spent. Nothing is timed off a timer of its own - a boss is due
//     when the run's clock says it is, which is what makes a run that starts at the five
//     minute mark (`tools/simulate.js --at`) an honest thing to measure.
//
//   **The warning.** A siren, a name on the glass and a shudder in the frame, for
//     `warn.time` before anything arrives. It is the same length every time, so a player
//     who has seen one boss knows exactly how long they have.
//
//   **The pause.** While `world.boss` is anything at all the wave director holds
//     (game/waves.js). A boss fight is one thing happening, and it is not a boss fight if
//     there are still twenty drifters walking in behind it.
//
//   **The cage.** The walls close to a room round the ship and the duel cannot be run out
//     of (game/field.js). It closes when the boss arrives and it opens the moment the boss
//     stops existing - the same instant, from the same call, so a fight can never end with
//     the room still locked.
//
//   **The phases.** Three, at the hull shares in `BALANCE.bosses.atHull`. Opening one costs
//     the run its damage and the boss its next volley for a moment: the boss flares, is
//     `immune` while it does, and starts its new phase's beat from the top. That is what
//     makes a phase a beat and not a number in a table.
//
// What a boss *is*, mechanically: an enemy. It is built by the same `makeEnemy`, lives in
// `world.enemies`, is stepped by the crowd, is hurt by every system that hurts a body and
// pays its score and its shards through `killEnemy` like any drifter. That is not a
// shortcut, it is the design: the alternative is a second body that every gun, blast,
// bolt, fire and drone in the game has to remember to look for, and one of them forgetting
// is a boss that cannot be killed by it. It is not in `KINDS` though - that table is the
// wave director's menu and the director has no business rolling a boss - so its row is
// handed to `makeEnemy` through `opts.kind` (game/kinds.js).
//
// It spends exactly one roll of the logic stream, at the arrival: the bearing it arrives
// on. The ring's starting angle is not a roll - a boss that starts its first volley facing
// a different way in two runs of one seed would be a seed that lies.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { TAU, clamp } from '../core/math.js';
import { logic } from '../core/rng.js';
import { makeEnemy } from './kinds.js';
import { fireBeam } from './beams.js';
import { addText, burst, hitStop, ring, shakeIt } from './effects.js';
import { cueBeep, cueChord } from './cues.js';
import { closeField, openField } from './field.js';
import { healPlayer } from './player.js';

/** The two beats of a boss that is not changing phase: riding round, and holding a lock. */
const RIDING = '';
const LOCKING = 'lock';

/** The row of a boss by id. A name nobody wrote is an error, not a silent no-op. */
function rowOf(id) {
  const row = BALANCE.bosses[id];
  if (row === undefined || row.phases === undefined) throw new Error('no boss is written: ' + id);
  return row;
}

/** The phase a fight is in, out of the row and the index. Read in nine places; named once. */
function phaseOf(boss) {
  return boss.row.phases[boss.phase];
}

/**
 * A fight that has been scheduled and has not arrived yet. The warning is already running,
 * which is why `warn` starts full and `enemy` starts empty: the arena holds its spawns from
 * the siren and not from the arrival, so the last of the crowd is on its way while the
 * name is still on the glass.
 */
function newFight(id, index) {
  const row = rowOf(id);
  return {
    id: id,
    row: row,
    index: index,
    enemy: null,
    warn: BALANCE.bosses.warn.time,
    phase: 0,
    change: 0,        // the phase flare still running, in seconds of immunity left
    age: 0,           // since it arrived, which is what the frame fades the cage in over
    angle: 0,         // the ring's facing; see `arrive` for why this is not a roll
    stage: RIDING,
    timer: row.phases[0].wait,
    beat: row.phases[0].wait,
    lockAngle: 0,     // the facing the spokes it is holding were drawn from
    spokes: 0,        // how many rays the lock it is holding will fire
    volleys: 0,       // two counters, like every line in the deck keeps
    beams: 0,
  };
}

/**
 * The walk a boss body is given: it does not walk (game/kinds.js `opts.kind`). What turns
 * is the ring, and the ring belongs to the fight, so all the walk does is point the body
 * the way the ring is pointing - which is also why the body is `rooted` in its row: the
 * crowd leans on a boss all run long and a boss that drifted would be a boss whose spokes
 * move on their own.
 */
function holdsItsGround(enemy, step) {
  const boss = step.world.boss;
  if (boss !== null && boss.enemy === enemy) enemy.rot = boss.angle;
}

/** The body's row: the boss's own numbers, with the walk above attached to them. */
function kindOfBoss(row) {
  return { stats: row, walk: holdsItsGround };
}

/**
 * The room a boss gets, in the scratch box. It is centred on the ship - the fight follows
 * you, you do not have to find it - and it is never smaller than the window by `beyond` px,
 * so the walls are always something you can see rather than an idea. If the window is
 * bigger than the arena (a small arena, a huge screen) the arena wins and the cage is the
 * world: a room that does not fit is no room.
 */
const BOX = { x0: 0, y0: 0, x1: 0, y1: 0 };

function spanAlong(centre, size, total, inset) {
  if (size + inset * 2 >= total) return { from: 0, to: total };
  const from = clamp(centre - size / 2, inset, total - inset - size);
  return { from: from, to: from + size };
}

function cageBox(world, spec) {
  const ship = world.player;
  const across = Math.max(spec.w, world.view.w + spec.beyond);
  const down = Math.max(spec.h, world.view.h + spec.beyond);
  const x = spanAlong(ship.x, across, world.arena.w, spec.inset);
  const y = spanAlong(ship.y, down, world.arena.h, spec.inset);
  BOX.x0 = x.from;
  BOX.y0 = y.from;
  BOX.x1 = x.to;
  BOX.y1 = y.to;
  return BOX;
}

/**
 * Where the boss stands in the room that has just closed: `gap` px of standing room from the
 * ship, in a direction that has room for the whole of it, and inside the cage by its own
 * body. Up to `tries` bearings are asked; whichever one of them fits first is taken, and if
 * none of them does - a ship in the corner of a small window - the furthest of them from
 * the ship is, because arriving close beats arriving outside the wall.
 */
const SPOT = { x: 0, y: 0 };
const TRIES = 8;

function arrivalSpot(world, row) {
  const ship = world.player;
  const box = world.field;
  const r = row.radius;
  let best = -1;
  for (let i = 0; i < TRIES; i++) {
    const bearing = logic.range(0, TAU);
    const x = clamp(ship.x + Math.cos(bearing) * row.arrival.gap, box.x0 + r, box.x1 - r);
    const y = clamp(ship.y + Math.sin(bearing) * row.arrival.gap, box.y0 + r, box.y1 - r);
    const by = Math.hypot(x - ship.x, y - ship.y);
    if (by >= row.arrival.gap) {
      SPOT.x = x;
      SPOT.y = y;
      return SPOT;
    }
    if (by > best) {
      best = by;
      SPOT.x = x;
      SPOT.y = y;
    }
  }
  return SPOT;
}

/** The siren, and the fight's place in the schedule. */
function startWarning(world) {
  const schedule = BALANCE.bosses.schedule;
  const entry = schedule[world.bossIndex];
  if (entry === undefined || world.elapsed < entry.at) return;

  const warn = BALANCE.bosses.warn;
  world.boss = newFight(entry.boss, world.bossIndex);
  shakeIt(world, warn.shake);
  cueBeep(warn.sound.freq, warn.sound.dur, warn.sound.wave, warn.sound.vol, warn.sound.slide);
}

/** The boss itself: the cage closes, the body lands, and the first beat starts. */
function arrive(world, boss) {
  const row = boss.row;
  const spec = BALANCE.bosses;
  // One room, whoever the boss is: the cage is the framework's (BALANCE.bosses.cage), so a
  // player who has fought one knows how much sky a boss fight has before they meet the next.
  closeField(world, cageBox(world, spec.cage));
  const spot = arrivalSpot(world, row);

  const body = makeEnemy(world, boss.id, spot.x, spot.y, {
    kind: kindOfBoss(row),
    // The hull is written out and not left to the kind: `makeEnemy` scales a kind's hull
    // with the run's clock (PLAN 3.3) and a boss's hull is the fight's length, priced for
    // the minute it is scheduled at and not for whatever the clock has done since.
    hp: row.hull,
  });
  // The body is on the crowd's list from here. It joins the collision world on the next
  // step, the same rule a tank's hatchling lives by (game/kinds.js): the grid is this
  // step's, and nobody is expected to be shooting yet.
  world.enemies.push(body);
  boss.enemy = body;
  boss.warn = 0;
  boss.age = 0;
  // The ring starts at the top. Not a roll: a run is a function of its seed and the way a
  // boss opens is part of the run, so two runs of one seed open the same way.
  boss.angle = -Math.PI / 2;
  boss.timer = phaseOf(boss).wait;
  boss.beat = phaseOf(boss).wait;

  const land = row.arrival;
  ring(world, body.x, body.y, row.color, land.ring.radius, land.ring.speed, land.ring.life);
  burst(world, body.x, body.y, row.color, land.burst.count, land.burst.speed, land.burst.life);
  shakeIt(world, land.shake);
  hitStop(world, land.hitStop);
  cueChord(spec.sound.arrive.notes, spec.sound.arrive.dur, spec.sound.arrive.wave, spec.sound.arrive.vol);
}

/**
 * The flare that opens a phase: the boss sheds the shape it had, cannot be hurt while it
 * does it, and drops whatever volley it was holding - a promise it never got to make is
 * broken in the player's favour, exactly like a sniper killed mid-lock (game/beams.js).
 */
function openPhase(world, boss) {
  const spec = BALANCE.bosses.phaseBreak;
  const enemy = boss.enemy;

  boss.change = spec.time;
  enemy.immune = spec.time;
  boss.stage = RIDING;
  boss.spokes = 0;
  boss.timer = phaseOf(boss).wait;
  boss.beat = phaseOf(boss).wait;

  ring(world, enemy.x, enemy.y, phaseOf(boss).tint, spec.ring.radius, spec.ring.speed, spec.ring.life);
  burst(world, enemy.x, enemy.y, phaseOf(boss).tint, spec.burst.count, spec.burst.speed, spec.burst.life);
  shakeIt(world, spec.shake);
  hitStop(world, spec.hitStop);
  cueBeep(spec.sound.freq, spec.sound.dur, spec.sound.wave, spec.sound.vol, spec.sound.slide);
}

/** One volley: a beam down every spoke it was showing, and the light of the whole of it. */
function fireSpokes(world, boss, phase) {
  const enemy = boss.enemy;
  for (let i = 0; i < boss.spokes; i++) {
    const angle = boss.lockAngle + i * TAU / boss.spokes;
    fireBeam(world, enemy.x, enemy.y, Math.cos(angle), Math.sin(angle),
      phase.beam, boss.id, enemy);
    boss.beams++;
  }
  boss.volleys++;

  const volley = phase.volley;
  ring(world, enemy.x, enemy.y, phase.tint, volley.ring.radius, volley.ring.speed, volley.ring.life);
  shakeIt(world, volley.shake);
  cueBeep(volley.sound.freq, volley.sound.dur, volley.sound.wave, volley.sound.vol, volley.sound.slide);
}

/**
 * The ring's own beat: ride, stop dead, show the spokes, fire them, ride again. The stop is
 * the telegraph - the same grammar a darter uses to say it is about to commit (game/kinds.js)
 * - and it is a stop rather than a slower turn because the lines drawn have to be the lines
 * that hurt, edge for edge, and a ring still turning between the promise and the firing
 * would move them.
 */
function stepRing(world, boss, dt) {
  const phase = phaseOf(boss);
  boss.timer -= dt;

  if (boss.stage === LOCKING) {
    if (boss.timer > 0) return;
    fireSpokes(world, boss, phase);
    boss.stage = RIDING;
    boss.spokes = 0;
    boss.timer = phase.wait;
    boss.beat = phase.wait;
    return;
  }

  boss.angle += phase.turn * dt;
  if (boss.angle > TAU) boss.angle -= TAU;
  if (boss.timer > 0) return;

  boss.stage = LOCKING;
  boss.timer = phase.windup;
  boss.beat = phase.windup;
  boss.lockAngle = boss.angle;
  boss.spokes = phase.spokes;
  const sound = phase.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/** A boss that has stopped existing: the room opens, the run is paid, the arena quiets. */
function bossDown(world, boss) {
  const spec = BALANCE.bosses;
  const enemy = boss.enemy;
  const where = { x: enemy.x, y: enemy.y };
  world.boss = null;
  world.bossIndex = boss.index + 1;
  world.bossesDown++;
  openField(world);

  // The body is already paid for by `killEnemy` - score, shards, the wreck, the noise of
  // it. What a boss gets on top of that is the framework's, and the one thing worth money
  // is a hull back: the fight is the milestone, and paying for it with a pip you did not
  // have to go and find is the point of it.
  if (boss.row.reward.hull > 0) healPlayer(world, boss.row.reward.hull);
  addText(world, where.x, where.y - enemy.r, boss.row.name + ' IS DOWN', PALETTE.elite);
  cueChord(spec.sound.down.notes, spec.sound.down.dur, spec.sound.down.wave, spec.sound.down.vol);
  world.spawnTimer = Math.max(world.spawnTimer, spec.resume);
}

/**
 * One step of the boss system: whose turn is it, and what is that boss doing about it.
 *
 * It runs at the end of the step (game/world.js), after everything that can hurt a body,
 * so a boss that died this step is buried this step and never fires a volley from a corpse.
 * The price of that ordering is that a volley fired here is paid out by game/beams.js on
 * the next step - the light appears one step before the damage, by 8 ms of game time and in
 * the player's favour, which is the same direction every other telegraph in the game breaks.
 */
export function updateBosses(world, dt) {
  const boss = world.boss;
  if (boss === null) {
    startWarning(world);
    return;
  }

  if (boss.enemy === null) {
    boss.warn -= dt;
    if (boss.warn <= 0) arrive(world, boss);
    return;
  }

  if (boss.enemy.hp <= 0) {
    bossDown(world, boss);
    return;
  }

  boss.age += dt;
  if (boss.change > 0) {
    boss.change = Math.max(0, boss.change - dt);
    if (boss.change === 0) boss.enemy.immune = 0;
    return;
  }

  // Which phase the hull has earned, and whether that is a new one. `atHull` counts down
  // from 1, so a boss that takes two phases' worth of damage in one huge hit opens both -
  // one flare, because it is one event, and the phase it ends in is the one that is true.
  const share = boss.enemy.hp / boss.enemy.maxhp;
  const marks = BALANCE.bosses.atHull;
  let want = boss.phase;
  while (want + 1 < marks.length && share <= marks[want + 1]) want++;
  if (want !== boss.phase) {
    boss.phase = want;
    openPhase(world, boss);
    return;
  }

  stepRing(world, boss, dt);
  // The body wears the ring's facing at the end of the step as well as during the crowd's own
  // (game/bosses.js `holdsItsGround`), so a frame or a contact test that reads `rot` never finds
  // it a step behind the ring that was turned after the crowd was walked.
  boss.enemy.rot = boss.angle;
}

/** Put every piece of the boss system back. A run is always played with no boss in it. */
export function resetBosses(world) {
  world.boss = null;
  world.bossIndex = 0;
  world.bossesDown = 0;
  openField(world);
}

// ---------------------------------------------------------------------------------------
// Everything the frame and the interface are allowed to know about a fight. A boss's state
// is this file's, the same way a lance's is game/lance.js's: the painter asks a question
// rather than reading a field, so the number can move and only one file has to know.
// ---------------------------------------------------------------------------------------

/** The fight in the arena, or null. */
export function bossOf(world) {
  return world.boss;
}

/** Is this body the boss - which is how the frame knows to draw a ring instead of a drifter. */
export function isBossBody(world, enemy) {
  const boss = world.boss;
  return boss !== null && boss.enemy === enemy;
}

/** The name on the bar and on the warning. */
export function bossName(boss) {
  return boss.row.name;
}

/** How much of the boss is left, 0..1 - what the hull bar is filled to. */
export function bossHullShare(boss) {
  if (boss.enemy === null) return 0;
  return clamp(boss.enemy.hp / boss.enemy.maxhp, 0, 1);
}

/** Which phase it is in, counted from one, and how many there are to get through. */
export function bossPhase(boss) {
  return boss.phase + 1;
}

export function bossPhaseCount(boss) {
  return boss.row.phases.length;
}

/** The colour of the phase it is in - the bar, the spokes and the ring all wear it. */
export function bossTint(boss) {
  return phaseOf(boss).tint;
}

/** Seconds of warning left, or 0 once it is here. */
export function bossWarning(boss) {
  return boss.enemy === null ? Math.max(0, boss.warn) : 0;
}

/** How far through the phase flare it is, 0..1, or 0 when it is not having one. */
export function bossFlare(boss) {
  if (boss.change <= 0) return 0;
  return clamp(1 - boss.change / BALANCE.bosses.phaseBreak.time, 0, 1);
}

/** How long the cage has been closed, as `open` of the frame's fade-in budget, 0..1. */
export function cageRise(boss) {
  return clamp(boss.age / BALANCE.bosses.cage.open, 0, 1);
}

/** Which way the ring is pointing. */
export function bossAngle(boss) {
  return boss.angle;
}

/**
 * How many spokes it is holding a lock with - 0 when it is riding and there is nothing to
 * draw. The count, the facing, the step between them and how far through the wind-up it
 * stands are the whole of the telegraph, and they are the same four numbers the beams are
 * fired from, which is what makes the warning a promise.
 */
export function spokeCount(boss) {
  return boss.stage === LOCKING ? boss.spokes : 0;
}

export function spokeAngle(boss) {
  return boss.lockAngle;
}

export function spokeStep(boss) {
  return boss.spokes === 0 ? 0 : TAU / boss.spokes;
}

export function spokeProgress(boss) {
  if (boss.stage !== LOCKING) return 0;
  return clamp(1 - boss.timer / (boss.beat || 1), 0, 1);
}

/** How far off a spoke's axis the light is drawn and the damage is paid out at - one number. */
export function spokeHalf(boss) {
  return phaseOf(boss).beam.halfWidth;
}

/** How far through the beat it stands, whether it is riding or holding - the bar's breathing. */
export function beatProgress(boss) {
  return clamp(1 - boss.timer / (boss.beat || 1), 0, 1);
}
