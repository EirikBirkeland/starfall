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
//   **The bodies.** A fight is made of one or more *cores*: bodies that are the boss, each with
//     whatever mass of cells is rooted to it. Every fight here is one body until the Hive's third
//     phase breaks it into three, and what is worth having thought about when that happens is
//     which numbers belong to a body and which to the fight. The hull, the phase and the clock of
//     the beat are the fight's - the bar is the sum of the bodies, and one flare, one telegraph
//     and one going-down are spent by all of them together - and the place in the room, the
//     facing and the cells are the body's. The fight is over when the last of its bodies is.
//
//   **The beats.** What a boss does with its turn is its own row's business; what the framework
//     owns is the rhythm of one - ride, stop dead, show it, fire it. A rhythm says which beats
//     its phases have and how the ride between them is spent (`ring`: the Warden, which turns on
//     the spot and fires spokes, bullet rings and calls of bodies; `mass`: the Hive, which
//     drifts in and lets its cells out; `sun`: the Eclipse, which turns and walks and spends its
//     turn on a shell and, once the room has gone dark, on fans of blades), and a phase may hold
//     more than one beat, which is what
//     keeps one rhythm over a fight that has grown two or three things to read. A phase change
//     starts from whichever of them is new, which is what the flare is announcing. Every beat of
//     every phase is shown for `bosses.telegraphMin` at least, and a boss stands perfectly still
//     while it is showing one: a promise that moves is not a promise.
//
//     One beat's harm does move - the Eclipse's blades sweep - and it gets round the same rule the
//     same way every other promise here does: it shows the whole of the way it travels, a fan and
//     not a line, so what the ship is asked to leave is a place and not a rumour (game/arms.js).
//     One beat's *promise* moves too - the Eclipse's last shell walks its door across the room -
//     and it pays for the same permission twice over: the whole route is lit from the first step of
//     the wind-up, and the door is standing still again before the wall is thrown (game/bosses.js
//     `walkTheDoor`), so the harm that arrives has not moved an inch.
//
//   **The room's light.** A phase may ask for the night to come down - PLAN 3.4's Eclipse phase 2,
//     "the arena darkens, and only areas near the player and near bullets are lit" - with a `dark`
//     row, and the framework owns both the ramp to it and what is left standing in the dark: the
//     ship, every shot in the air, and the fight's own bodies (render/darkness.js). No boss ever
//     has to put the room back: a phase that wrote no `dark` row asks for a bright room, and so does
//     an arena with no fight in it, so the light always comes back by itself and there is nothing to
//     reset - which is why the ramp is stepped by the world and not by the fight, and keeps walking
//     back over a run that has stopped. It is paint the simulation is asked to describe and never to
//     obey: nothing in game/ reads it back, so a fight may take the room away without moving one
//     thing in it.
//
//   **The end of the schedule.** The list is the length of the game, and walking it to the end is
//     winning: when the last fight on it comes down and the ship is still standing, the run is
//     over and it was won, and the framework hands the ending over to game/run.js (`winRun`).
//     That is the only thing the schedule is ever asked besides who walks in, and the only thing
//     this file knows about the run it is fighting in. And it is walked *once*: past the last entry
//     nothing is ever due again, so a run that is handed its arena back and flies on (game/run.js
//     `continueRun`, PLAN 3.4's endless mode) is fought by the wave director and nobody else.
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
import { STATE } from './state.js';
import { PALETTE } from '../core/palette.js';
import { TAU, clamp } from '../core/math.js';
import { logic } from '../core/rng.js';
// The run's own life cycle, for the one thing this file has to say about the run it is fighting in:
// that the schedule has run out. It is a two-way import (game/run.js reaches back here for
// `resetBosses`) and it is safe for the reason every cycle is safe - neither file uses the other at
// the moment it is evaluated, only later, from inside a function.
import { winRun } from './run.js';
import { glide, makeEnemy } from './kinds.js';
import { damageEnemy, killEnemy } from './enemies.js';
import { noteArrival } from './tally.js';
import { fireBeam } from './beams.js';
import { enemyShotAt } from './enemyshots.js';
import { looseArm } from './arms.js';
import { newPack } from './flock.js';
import { addText, burst, hitStop, ring, shakeIt, spray } from './effects.js';
import { cueBeep, cueChord } from './cues.js';
import { closeField, holdInField, openField } from './field.js';
import { dragShip, healPlayer } from './player.js';

/**
 * What a boss does between one phase and the next: it rides round, and it stops dead to strike.
 * How it strikes is the beat, and a phase may have more than one - the Warden's phase 2 rides,
 * fires its spokes, rides again, throws a ring of shots with a door in it, and rides again:
 * one rhythm with two things in it, which is a fight a player can learn. Phase 3 grows a third
 * beat inside that same rhythm: a call of bodies sent out of the hoop itself, on the same
 * grammar of stop, show it, do it.
 */
const RIDING = '';
const LOCKING = 'lock';
const RINGING = 'ring';
const CALLING = 'call';
const OPENING = 'open';
const ARMING = 'arm';

/**
 * How a boss spends the ride from one beat to the next, and which beat the ride hands over to.
 * A ring rides by turning on the spot; a mass rides by drifting at the ship and holding a band; a
 * sun rides by turning on the spot *and* holding a band, which is why it is a third rhythm and not
 * an adjective on one of the other two. All of them stop dead to strike, and that part is the
 * framework's and not the rhythm's (`stepBeat`), so a rhythm only ever gets to say what a ride
 * looks like and what it leads to.
 *
 * `first` is the beat an arrival leads with, and `take` is which one the ride that has just ended
 * hands over to.
 */
const RHYTHMS = {
  ring: { ride: turnsInPlace, take: alternateBeats, first: LOCKING },
  mass: { ride: driftTheMass, take: takeMassBeat, first: OPENING },
  sun: { ride: turnsInPlace, take: alternateBeats, first: RINGING },
};

/**
 * The four beats a boss can be holding: `enter` starts the promise and writes down the numbers
 * it is being shown with, `land` is what happens when the promise is kept. Both halves read the
 * same numbers either way, which is the one rule every telegraph in this game is held to.
 *
 * `show` is optional, and only one beat has it: a promise that is held for a while is normally held
 * *unchanged*, and a beat that had something to do every step of its wind-up would be a telegraph
 * with a clock in it instead of a place on the floor. A door that walks is the one exception, and
 * it is an exception of the same shape as the blades' fan: the whole of the way it travels is shown
 * before anything moves, and it is at rest again before anything lands.
 */
const BEATS = {
  [LOCKING]: { enter: lockSpokes, land: fireSpokes },
  [RINGING]: { enter: windRing, land: throwRing, show: walkTheDoor },
  [CALLING]: { enter: windCall, land: sendCall },
  [OPENING]: { enter: lightCells, land: letThemOut },
  [ARMING]: { enter: showArms, land: letArmsLoose },
};

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

/** The rhythm a row asked for. A name nobody wrote is an error, not a silent no-op. */
function rhythmOf(boss) {
  const rhythm = RHYTHMS[boss.row.rhythm];
  if (rhythm === undefined) throw new Error('no boss rhythm is written: ' + boss.row.rhythm);
  return rhythm;
}

/**
 * One body of a fight, and the mass of cells rooted to it (nothing at all, for every boss that
 * has ever been fought until the Hive grew a honeycomb).
 *
 * A fight is one of these, normally: the Warden is a ring and nothing else, and the Hive arrives
 * as a core with six cells round it. Its third phase is a fight made of *three* of them, which is
 * what this row exists for - see the header's fifth duty for which numbers belong to a body and
 * which to the fight they are all part of.
 */
function newCore(enemy, layout) {
  return {
    enemy: enemy,     // the body of the crowd it is hurt by and paid out through
    layout: layout,   // the `cells` row its mass is built from, or null if it has none
    cells: [],        // the bodies rooted to this one (`buildMass`, `shedCore`)
    spawn: null,      // the `spawn` row its mouths spend; null means the phase's (`spawnOf`)
    angle: 0,         // which way it is facing - for a ring, the ring's own facing
    turn: 0,          // which cell of this mass the next opening starts from, so they take turns
    bearing: null,    // the side of the ship it is told to keep; null is anywhere it likes
    down: false,      // has its coming-down been noticed yet (`noteCoresDown`)
  };
}

/**
 * A fight that has been scheduled and has not arrived yet. The warning is already running,
 * which is why `warn` starts full and `cores` starts empty: the arena holds its spawns from
 * the siren and not from the arrival, so the last of the crowd is on its way while the
 * name is still on the glass.
 */
function newFight(id, index) {
  const row = rowOf(id);
  return {
    id: id,
    row: row,
    index: index,
    cores: [],        // the bodies this fight is made of (`newCore`); none until it arrives
    /**
     * The body the fight is measured by: the first of them, which for every fight that has ever
     * been written is the only one. It is an accessor and not a field so that it cannot disagree
     * with `cores`, and anything that has to see *every* body of a fight that has several goes to
     * `cores` instead - a telegraph is hung on one body and the bar is the sum of all of them.
     */
    get enemy() { return this.cores.length === 0 ? null : this.cores[0].enemy; },
    cameDown: null,   // the body that came down last, which is where the fight was buried
    warn: BALANCE.bosses.warn.time,
    phase: 0,
    change: 0,        // the phase flare still running, in seconds of immunity left
    split: null,      // a `split` row spent at the end of that flare, or null (`spendSplit`)
    age: 0,           // since it arrived, which is what the frame fades the cage in over
    stage: RIDING,
    timer: row.phases[0].wait,
    beat: row.phases[0].wait,
    lockAngle: 0,     // the facing the spokes it is holding were drawn from
    spokes: 0,        // how many rays the lock it is holding will fire
    nextBeat: LOCKING,// which of the phase's beats the ride just ended hands over to
    armed: 0,         // how many shots the ring it is arming is made of; 0 is nothing is armed
    gapAngle: 0,      // the bearing the door it is showing is centred on, this very step
    gapHalf: 0,       // and how wide each side of that door is, in radians
    gapFrom: 0,       // the bearing that door lit on, and the one it will come to rest on: a door
    gapTo: 0,         // may walk (`walkTheDoor`), and the route between these two is the promise
    gapRun: 0,        // how many seconds of the wind-up the walk takes; the rest of it is a hold
    armCount: 0,      // how many blades a sweep it is showing is made of; 0 is none are being shown
    armStep: 0,       // and how far apart two of them stand, in radians
    armArc: 0,        // and how far each of them will travel, in radians
    armReach: 0,      // and how far out it reaches, in px
    armHalf: 0,       // and how far off its axis a blade hurts, in px
    callCount: 0,     // how many bodies a call is sending; 0 is no call is being made
    callAngle: 0,     // the bearing that fan of marks is centred on
    callStep: 0,      // and how far apart two of them stand, in radians
    called: [],       // whatever the last call sent that is still standing (`liveCall` below)
    volleys: 0,       // counters, like every line in the deck keeps
    sweeps: 0,
    blades: 0,
    beams: 0,
    rings: 0,
    shots: 0,
    calls: 0,
    summons: 0,
  };
}

/**
 * The body of the fight that is still standing, taken first. A beat that is one event for the
 * whole fight - the length of its wind-up, the noise it makes, where on the glass its light is
 * spent - is priced off this one, and every body in one beat is built from one row, so which of
 * them is asked is never a different answer. A fight of one body is answered by its only body, so
 * every Warden beat reads the same number it always did.
 */
function liveCore(boss) {
  for (const core of boss.cores) {
    if (!core.down && core.enemy.hp > 0) return core;
  }
  return boss.cores[0];
}

/** The core a body of the crowd belongs to, or null if the fight does not own it. */
function coreOf(boss, enemy) {
  for (const core of boss.cores) {
    if (core.enemy === enemy) return core;
  }
  return null;
}

/** How far one body reaches: from its own middle out to the outside edge of its mass, or no further
 * than its own skin if it has no mass. It is what the cage holds a walking body by
 * * (`holdsItsBand`) and what the frame culls with, so that no cell can be standing in the arena with
 * its boss off the window and therefore undrawn (render/boss.js).
 */
export function coreReach(core) {
  return core.layout === null ? core.enemy.r : core.layout.ring + core.layout.radius;
}

/**
 * How much hull the fight has left, counting every body it owns and counting a body that has
 * stopped existing as none of it - overkill is not a bonus, and a bar that went up when a fragment
 * died would be a bar that lies.
 */
function hullLeft(boss) {
  let left = 0;
  for (const core of boss.cores) left += Math.max(0, core.enemy.hp);
  return left;
}

/** How much hull it arrived with: the whole length of the bar, which is a different question from
 * how much of it is left and is never the answer to it. */
function hullFull(boss) {
  let total = 0;
  for (const core of boss.cores) total += core.enemy.maxhp;
  return total;
}

/** Every cell of every body, in one list. The frame draws a body at a time and asks the core. */
function everyCell(boss) {
  const all = [];
  for (const core of boss.cores) {
    for (let i = 0; i < core.cells.length; i++) all.push(core.cells[i]);
  }
  return all;
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
  if (boss === null) return;
  const core = coreOf(boss, enemy);
  if (core !== null) enemy.rot = core.angle;
}

/**
 * The walk a boss body that *does* walk is given, which is the thing a second boss asked the
 * framework for: a boss may *walk*. The Warden's whole attack is a ring that turns on the spot, so
 * the walk used to be hard-coded to nothing but turning. A walking body drifts at the ship and
 * keeps the band its row likes - everything the Hive sends is faster than it is, and a hive that
 * walks into your face has nothing left to do - and it stands perfectly still while it is showing
 * you something, which is the same rule the ring rides by and the one that makes the cell you
 * watched light be the cell the brood come out of, in the place you saw it standing.
 *
 * It is not `rooted`: a body with a hull bar is entitled to be shoved by the things that are
 * hitting it, and a shove is the only way it will ever move sideways. Its *fragments* are (see
 * game/balance.js `split.body`), because a body that has been told which side of the ship to keep
 * has made a promise with a direction in it, and the crowd would lean that out of it. The Eclipse's
 * sun walks this same walk and is no more rooted than the hive: it holds a *distance* from the ship,
 * so a crowd that leaned it a few px sideways has leaned the direction of its drag by a few px -
 * a wobble that corrects itself, and not the lie a fragment would swallow.
 */
function holdsItsBand(enemy, step) {
  const boss = step.world.boss;
  if (boss === null) return;
  const core = coreOf(boss, enemy);
  if (core === null) return;
  enemy.rot = core.angle;         // the mass's face is its own turn, not the ship's bearing

  if (boss.stage !== RIDING) {
    glide(enemy, step, 0, 0, 0);   // standing still, but a shove still moves it
    return;
  }

  const where = stationOf(step.world, step.ship, boss.row.approach, core);
  const dx = where.x - enemy.x;
  const dy = where.y - enemy.y;
  const away = Math.hypot(dx, dy);
  if (away > boss.row.approach.park) {
    glide(enemy, step, dx / away, dy / away, enemy.speed);
  } else {
    glide(enemy, step, 0, 0, 0);   // it is where it wanted to be; a shove can still move it
  }
  // And the whole of the mass is kept inside the room that closed round the duel: the cage is
  // the arena for the duration, and a boss that walked out through a wall would be a fight
  // nobody can have. It is held by the mass's own reach and not by the core's, or the
  // honeycomb would lean through the cage with half of itself outside the fight.
  holdInField(step.world, enemy, coreReach(core));
}

/**
 * Where a body is meant to be standing, in the room's own coordinates.
 *
 * A body that has not been told where - every boss there has ever been, until the Hive broke -
 * keeps the *band* its row likes: in when the ship is out of reach, back along the line when it
 * is in arms' reach, and its own middle of the room in between. It is measured from the same
 * quarry the crowd walks at, which is what lets a dash's image pull a hive out of line for a
 * moment (game/afterimage.js) - a decoy steals a body's direction and none of its rest.
 *
 * A body that *has* been told where - a fragment, which was given a side of the ship to keep
 * when the mass came apart - stands at that bearing, at the middle of the same band, and keeps it
 * as the ship runs. That is the difference between three hives and a swarm: they come to sit round
 * the ship like a triangle and stay sitting there, so the run has a room with three things in it
 * rather than three things chasing it. The place it is asked for is clamped into the live room - a
 * body whose place to be is outside the cage it was shut in with would lean into a wall forever.
 */
const STATION = { x: 0, y: 0 };

function stationOf(world, ship, band, core) {
  const enemy = core.enemy;
  if (core.bearing === null) {
    const distance = Math.hypot(ship.x - enemy.x, ship.y - enemy.y);
    const want = distance > band.far ? band.far : (distance < band.near ? band.near : distance);
    const bearing = Math.atan2(enemy.y - ship.y, enemy.x - ship.x);
    STATION.x = ship.x + Math.cos(bearing) * want;
    STATION.y = ship.y + Math.sin(bearing) * want;
    return STATION;
  }
  const reach = coreReach(core);
  const middle = (band.near + band.far) / 2;
  STATION.x = clamp(ship.x + Math.cos(core.bearing) * middle,
    world.field.x0 + reach, world.field.x1 - reach);
  STATION.y = clamp(ship.y + Math.sin(core.bearing) * middle,
    world.field.y0 + reach, world.field.y1 - reach);
  return STATION;
}

/**
 * A cell's walk: it holds its place in the mass. The mass turns and the cell turns with it, the
 * mass stops and the cell stops, and the place is written absolutely rather than nudged, so a
 * cell is never a body with an opinion of its own about where the wall is (`rooted`, which keeps
 * the crowd's separation off it as well, game/kinds.js). Its own `timer` is the light of an
 * opening that is not finished yet, spent here the way every other body spends the countdown of
 * its own tell (game/kinds.js `aimProgress`).
 */
function holdsItsPlace(enemy, step) {
  const hub = enemy.hub;
  if (hub === null) return;
  const spec = enemy.kind.stats;
  const bearing = hub.rot + enemy.seat * TAU / spec.count;
  enemy.x = hub.x + Math.cos(bearing) * spec.ring;
  enemy.y = hub.y + Math.sin(bearing) * spec.ring;
  enemy.rot = hub.rot;
  if (enemy.timer > 0) enemy.timer -= step.dt;
}

/**
 * What walks a boss body, per rhythm: the same keys as `RHYTHMS`, because a rhythm that rides
 * by turning and a rhythm that rides by walking are two different walks and no more. `mass` and
 * `sun` share one, because a body that holds a band off the ship holds it the same way whatever it
 * is holding a band from; what differs between them is the beat the ride leads to, and not the
 * walking.
 */
const WALKS = { ring: holdsItsGround, mass: holdsItsBand, sun: holdsItsBand };

/** The body's row: the boss's own numbers, with the walk its rhythm asked for attached. */
function kindOfBoss(row) {
  return { stats: row, walk: WALKS[row.rhythm] };
}

/** The row a cell of a mass is built from: the honeycomb's numbers, and the one walk it has. */
function kindOfCell(spec) {
  return { stats: spec, walk: holdsItsPlace, onDeath: cellComesOff };
}

/**
 * The row a body made by a `split` is built from: the boss's own, with the split row's `body`
 * written over the top of it. A fragment is the same creature at a fraction of the size, so it
 * keeps the colours, the noise and the corpse of the hive it came from and names only the numbers
 * that are genuinely different - which is one source of truth for "what does a hive look like".
 *
 * `cells` and `phases` are left out of the copy on purpose: a body's mass is its core's business
 * (`core.layout`) and a phase belongs to the fight, so neither belongs on a body's row where a
 * second answer to the same question could sit and rot.
 */
function kindOfFragment(row, split) {
  return { stats: patched(row, split.body), walk: WALKS[row.rhythm] };
}

/** One row with another written over it. Both arguments are rows; the second is the exceptions. */
function patched(row, over) {
  const out = {};
  for (const key in row) {
    if (key === 'cells' || key === 'phases') continue;
    out[key] = row[key];
  }
  for (const key in over) out[key] = over[key];
  return out;
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

/**
 * The siren, and the fight's place in the schedule.
 *
 * Nothing is due once the list has been walked to the end - `world.bossIndex` is past the last entry
 * and stays there, which is the whole of how an endless run is kept boss-free (game/run.js
 * `continueRun`). A run does not meet the same fight twice.
 */
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
    // with the run's clock (game/kinds.js) and a boss's hull is the fight's length, priced for
    // the minute it is scheduled at and not for whatever the clock has done since.
    hp: row.hull,
    // And so is its pace, for the same reason: a boss that walks is as fast as its own row says
    // it is, and the crowd's speed scaling is a thing that happens to a wave.
    speed: row.speed,
  });
  // The body is on the crowd's list from here. It joins the collision world on the next
  // step, the same rule a tank's hatchling lives by (game/kinds.js): the grid is this
  // step's, and nobody is expected to be shooting yet.
  world.enemies.push(body);
  const core = newCore(body, row.cells === undefined ? null : row.cells);
  boss.warn = 0;
  boss.age = 0;
  // The ring starts at the top. Not a roll: a run is a function of its seed and the way a
  // boss opens is part of the run, so two runs of one seed open the same way.
  core.angle = -Math.PI / 2;
  body.rot = core.angle;   // the body wears its rhythm's facing from the very first frame;
  //                        from the next step the crowd's own walks keep it there
  boss.timer = phaseOf(boss).wait;
  boss.beat = phaseOf(boss).wait;
  // And its first beat is its signature. A phase *change* leads with whatever the change is
  // new (`openPhase`); an arrival leads with the attack the run has already had time to learn
  // the name of, because a boss that opens with its strangest trick has nothing left to say.
  boss.nextBeat = rhythmOf(boss).first;
  // A mass arrives whole: the cells are part of the body that lands, so they are built here and
  // not by a beat, and they join the collision world on the next step like everything else that
  // appears mid-step (game/kinds.js).
  boss.cores.push(core);
  if (core.layout !== null) buildMass(world, core);

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
 *
 * Every body the fight owns is held immune through it, and a phase whose row asks to come apart
 * is spent at the *end* of it, so the flare reads as the thing it is: a body pulling itself
 * into pieces rather than a puff of light in front of one that is already gone.
 */
function openPhase(world, boss) {
  const spec = BALANCE.bosses.phaseBreak;
  const phase = phaseOf(boss);

  boss.change = spec.time;
  for (const core of boss.cores) core.enemy.immune = spec.time;
  boss.stage = RIDING;
  putThePromiseDown(boss);
  putOutTheMass(boss);
  boss.timer = phase.wait;
  boss.beat = phase.wait;
  // Whatever is new about this phase gets the first beat, so the flare that announced it is
  // followed by the thing the flare was announcing rather than by another round of the old.
  boss.nextBeat = leadBeat(phase);
  boss.split = phase.split === undefined ? null : phase.split;

  // The light of the flare is spent at a body that is standing. A phase change can be earned by
  // the last fragment of a fight that has come apart, and a flare round a middle that is no longer
  // in the room would be a promise about nothing.
  const enemy = liveCore(boss).enemy;
  ring(world, enemy.x, enemy.y, phase.tint, spec.ring.radius, spec.ring.speed, spec.ring.life);
  burst(world, enemy.x, enemy.y, phase.tint, spec.burst.count, spec.burst.speed, spec.burst.life);
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
 * One boss's turn, in the framework's own words: ride, and when the ride is up stop dead, show
 * what is coming, land it, ride again. The stop is the telegraph - the same grammar a darter
 * uses to say it is about to commit (game/kinds.js) - and it is a stop rather than a slower
 * turn because what is on show has to be the thing that hurts, edge for edge, and a boss still
 * moving between the promise and the firing would move it. That is as true of a ring of spokes
 * or a lit cell as of a door in a bullet ring, so every beat freezes every rhythm, and nothing a
 * rhythm does to its ride changes between the two.
 *
 * What the ride is - a ring turning on the spot, a mass drifting in - and what the ride leads to
 * are the rhythm's (`RHYTHMS`); the clock of it is here and is the same for every boss there is.
 * A beat that is being shown is shown *unchanged* every step of it - `showThePromise` is there for
 * the one beat that has something to walk while it waits - and nothing lands on a step that also
 * moves a promise, because the thing on show has to be the thing that hurts right up to the moment
 * it stops being a show.
 */
function stepBeat(world, boss, dt) {
  const rhythm = rhythmOf(boss);
  const phase = phaseOf(boss);
  boss.timer -= dt;

  if (boss.stage !== RIDING) {
    if (boss.timer > 0) { showThePromise(boss); return; }
    BEATS[boss.stage].land(world, boss, phase);
    rideAgain(boss, phase);
    return;
  }

  rhythm.ride(world, boss, phase, dt);
  if (boss.timer > 0) return;

  BEATS[rhythm.take(boss, phase)].enter(world, boss, phase);
}

/**
 * The Warden's ride, and the Eclipse's: the whole body turns where it stands, and the spokes or the
 * shell it is going to fire are turned with it. A sun turns because it has a face - the corona
 * turns, and the arms a later phase of it is written about will be placed by the same angle.
 */
function turnsInPlace(world, boss, phase, dt) {
  for (const core of boss.cores) core.angle = turned(core.angle, phase.turn * dt);
}

/**
 * The Hive's ride: the mass turns slowly, and the cells that light for the next opening are
 * placed by that turning - which is the same reason the ring's spokes are, and the reason the
 * mass holds its turn as well as its drift while a beat is running (`holdsItsBand`).
 */
function driftTheMass(world, boss, phase, dt) {
  for (const core of boss.cores) core.angle = turned(core.angle, phase.spin * dt);
}

/** One facing, moved on by one turn, kept inside one turn. */
function turned(angle, by) {
  const next = angle + by;
  return next > TAU ? next - TAU : next;
}

/** Back to riding, from the top of the phase's own patience. Nothing is being shown. */
function rideAgain(boss, phase) {
  boss.stage = RIDING;
  putThePromiseDown(boss);
  boss.timer = phase.wait;
  boss.beat = phase.wait;
}

/**
 * Put every beat's promise down: no spokes are being held, no shell is being armed, no call is
 * being made and no fan of blades is being shown.
 *
 * Two places owe it - back to riding after a beat, and the top of a phase flare, where a promise the
 * fight never got to make is broken in the run's favour (game/bosses.js `openPhase`) - and they owe
 * exactly the same list, which is why it is one function and not two copies that can drift apart by
 * one line and leave a fan of blades drawn over a fight that is not promising one.
 */
function putThePromiseDown(boss) {
  boss.spokes = 0;
  boss.armed = 0;
  boss.callCount = 0;
  boss.armCount = 0;
}

/**
 * Which beat the ride that has just ended hands over to.
 *
 * A phase with a `bullets` row alternates - spokes, ring, spokes, ring - which is what keeps one
 * rhythm under a fight that has two things in it; a phase with one beat always gets that beat.
 *
 * A phase with a `call` row makes its call whenever nothing is left of the last one, and takes
 * its ordinary turn otherwise: a second pack sent over one that is still hunting the ship would
 * be the ring ignoring its own room, and a beat spent on nothing at all would be a hole in the
 * rhythm the ship has learned. So the call is what happens when the run has answered it, which
 * is a rule a player can read off the crowd rather than off a clock.
 */
function alternateBeats(boss, phase) {
  if (phase.call !== undefined && liveCall(boss) === 0) return CALLING;
  const beats = beatsOf(phase);
  // A beat a phase does not have is never taken. "It alternates" is a rule about the beats there
  // are to alternate, and taking one the row never wrote would be a rest with a telegraph on it:
  // the Warden's phases all have spokes so it never had to be said out loud, and the Eclipse - a
  // shell and nothing else - is what said it.
  const at = beats.indexOf(boss.nextBeat);
  const beat = at < 0 ? beats[0] : beats[at];
  boss.nextBeat = beats[(at + 1) % beats.length];
  return beat;
}

/**
 * Which beats a phase has, in the order it takes them: the spokes, the shell, the blades.
 *
 * Derived from the row and never written beside it, for the reason every other row in this table is
 * read and not copied: a phase's beats *are* the rows it wrote, and a list kept next to them would
 * be a second answer. A phase that wrote none of them has no business being played, and saying so
 * here - where a beat is about to be taken - is louder than firing a beat made of nothing.
 */
function beatsOf(phase) {
  const beats = [];
  if (phase.spokes !== undefined) beats.push(LOCKING);
  if (phase.bullets !== undefined) beats.push(RINGING);
  if (phase.sweep !== undefined) beats.push(ARMING);
  if (beats.length === 0) throw new Error('a phase with no beat to take');
  return beats;
}

/**
 * The mass has one beat, and it takes it whenever the ride comes round: the hive's whole attack
 * is the brood, so there is nothing to alternate with and no "nothing is left of the last one"
 * gate to wait on - a gate there would be a hole in the only rhythm it has, and a hive with a
 * hole in it is a hive that is not fighting.
 */
function takeMassBeat(boss, phase) {
  return OPENING;
}

/**
 * A fight may drag the ship: PLAN 3.4's Eclipse, "a dark sun that pulls the player inwards".
 *
 * It is spent once per step, and it is spent here rather than in game/player.js because the pull is
 * the fight's and not the room's: the phase's own row says how hard (`pull.force`, px/s of steady
 * fall) and the framework decides when it is on. It is on for every step of a fight whose phase rows
 * carry a `pull` row and never mentioned by the ones that do not, and it is off through a phase
 * flare, which is the one moment a fight has agreed to stop doing anything at all.
 *
 * It is drawn along the line from the ship to whichever of the fight's bodies is still standing
 * (`liveCore`) - a drag out of a corpse would be a promise about nothing - and that is what makes it
 * safe to run alongside the ring's fairness rule: a pull that points at the body can only ever carry
 * the ship *down* the bearing a door was opened on, never off it, so a ship that was shown a door and
 * does nothing is still in that door however hard the sun is pulling.
 *
 * And it stops at `floor` px from that body's middle, which is the whole of its fairness: a drag that
 * walked the ship into the body that hurts it on contact would be paying out damage the fight never
 * promised. Past the rim the ship is on its own, and it gets hurt only where it let itself go.
 */
function holdTheShip(world, boss, dt) {
  const spec = phaseOf(boss).pull;
  if (spec === undefined) return;

  const body = liveCore(boss).enemy;
  const ship = world.player;
  const dx = body.x - ship.x;
  const dy = body.y - ship.y;
  const away = Math.hypot(dx, dy);
  if (away === 0 || away <= spec.floor) return;

  dragShip(world, dx / away, dy / away, spec.force, dt);
}

/**
 * Which beat a phase change leads with: whatever the new phase has that the one before it had
 * not. A phase with a `spawn` row is a mass, and a mass has one beat - and so has a phase with a
 * `split` row, which is a mass that has just grown more of itself; a Warden phase leads on
 * the ring of shots if it grew one and on the spokes otherwise.
 */
function leadBeat(phase) {
  if (phase.spawn !== undefined || phase.split !== undefined) return OPENING;
  if (phase.sweep !== undefined) return ARMING;
  return phase.bullets === undefined ? LOCKING : RINGING;
}

/**
 * Whatever the last call sent that is still standing, compacted in place. Its length is the
 * whole of the summoning rule (`alternateBeats`), and it is the list the ring lets go of when it
 * goes down (`bossDown`), so nothing else in the game has to know a boss can make bodies.
 *
 * Dead ones are dropped here and nowhere else: a body leaves the crowd by dying, so `hp` is the
 * whole of the question and this is called once per ride, which is cheap enough to be honest
 * about and often enough that the list is never a pile of corpses.
 */
function liveCall(boss) {
  return living(boss.called);
}

/**
 * How many bodies of a list a fight still owns, compacting the list as it goes. The rule is the
 * one above: a body leaves the crowd by dying, so `hp` is the whole of the question.
 */
function living(list) {
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i].hp <= 0) continue;
    list[n] = list[i];
    n++;
  }
  list.length = n;
  return n;
}

/**
 * The call's wind-up: `count` marks are lit on the hoop, and then they are.
 *
 * The fan is centred on the bearing the ring is turned *away* from the ship on, taken here and
 * held for the whole of it - the same rule the door lives by (game/bosses.js `windRing`), for
 * the same reason twice over. A body may not arrive in the ship's face: standing between a
 * hoop and the wall is where a ship stands when it is dodging spokes, so a dart born on the near
 * side would be born on top of it. And a promise that chose its bearings after it was shown
 * would not be a promise, so the marks on the rim are the bearings the bodies come out of and
 * nothing about them wanders once lit. The bearing is no more a roll than the door's is.
 */
function windCall(world, boss, phase) {
  const spec = phase.call;
  const enemy = boss.enemy;
  const ship = world.player;

  boss.stage = CALLING;
  boss.timer = spec.windup;
  boss.beat = spec.windup;
  boss.callCount = spec.count;
  boss.callStep = spec.step;
  boss.callAngle = Math.atan2(enemy.y - ship.y, enemy.x - ship.x);

  const sound = spec.wind.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/** The spokes beat: hold still with the rays drawn, then send them. */
function lockSpokes(world, boss, phase) {
  boss.stage = LOCKING;
  boss.timer = phase.windup;
  boss.beat = phase.windup;
  boss.lockAngle = liveCore(boss).angle;
  boss.spokes = phase.spokes;
  const sound = phase.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * The bullet-ring beat: hold still with a door lit across the ring's own body.
 *
 * The door is aimed at the ship's bearing at this instant. It does not follow the ship - a promise
 * that chases you is not a promise, it is a wall - and that is the whole of the fairness of it: a
 * ship that does nothing at all is standing in the door the moment it lights. What costs a hull is
 * sliding out of it and not coming back, and `windup` is the time given to notice and correct -
 * which is also long enough for a dash to be the answer. The bearing is no more a roll than the
 * spokes' facing is: a run of one seed throws its rings the same way.
 *
 * A row may give that door somewhere to go (`gapWalk`, game/balance.js `eclipse`), and then it
 * walks - see `walkTheDoor`. That is the one part of this beat that is allowed to move, and it
 * buys the permission the same way the blades do: the walk is over, and the door is standing still
 * again, before a single shot is thrown round it.
 */
function windRing(world, boss, phase) {
  const spec = phase.bullets;
  const enemy = boss.enemy;
  const ship = world.player;

  boss.stage = RINGING;
  boss.timer = spec.windup;
  boss.beat = spec.windup;
  boss.armed = spec.count;
  boss.gapHalf = spec.gap;
  boss.gapFrom = Math.atan2(ship.y - enemy.y, ship.x - enemy.x);
  boss.gapTo = boss.gapFrom + walkOf(spec, boss);
  boss.gapRun = spec.gapWalk === undefined ? 0 : spec.windup - spec.gapSettle;
  walkTheDoor(boss);

  const sound = spec.wind.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * How far the door of the shell being wound will walk from where it lit, in radians, and which
 * way: 0 for every row that does not ask for it, which is every shell in the game until the
 * Eclipse's last phase.
 *
 * The direction is the count of shells the fight has already thrown, which is a rhythm a player
 * can learn (this one went right, so the next goes left) and not a roll a seed would have to
 * remember. It is measured on the way *out*, and the walk is always away from where the door lit:
 * the ask is never "guess which way it is coming", it is "that way, go with it".
 */
function walkOf(spec, boss) {
  if (spec.gapWalk === undefined) return 0;
  return boss.rings % 2 === 0 ? spec.gapWalk : -spec.gapWalk;
}

/**
 * Put the door where its walk has got to by now, which for a door that does not walk is one place
 * and always was. Then it runs out of road: a walking row has to leave `gapSettle` of its own
 * wind-up for the door to stand still in (game/balance.js `eclipse`, and test/eclipse.test.mjs
 * holds every walking row to it), and that rest is what makes the last bearing the frame ever
 * showed the exact bearing the hole is left at. No beat has to remember to land a door, and no row
 * can promise a walk that has not finished by the time the wall is thrown.
 */
function walkTheDoor(boss) {
  if (boss.gapRun <= 0) {
    boss.gapAngle = boss.gapTo;
    return;
  }
  const gone = boss.beat - boss.timer;
  const p = clamp(gone / boss.gapRun, 0, 1);
  boss.gapAngle = boss.gapFrom + (boss.gapTo - boss.gapFrom) * p;
}

/** One step of a promise being held. Most beats have nothing left to show; one has a door to walk. */
function showThePromise(boss) {
  const show = BEATS[boss.stage].show;
  if (show !== undefined) show(boss);
}

/**
 * The shot spec handed to game/enemyshots.js: the phase's bullet numbers wearing the phase's
 * own colour, refilled in place because a ring is not a place to allocate two dozen objects.
 */
const SHOT = { speed: 0, radius: 0, life: 0, color: '', caged: false };

/**
 * One ring thrown: `count` shots spread evenly over every bearing *except* the door it spent
 * its wind-up showing, going straight out from the rim. The door is honoured exactly - the two
 * shots either side of it are half a step inside what is left of the circle, so the wedge the
 * frame lit is empty of light from edge to edge - and the count is the count: a ring may not
 * arrive with a different number of holes in it than the one it promised.
 */
function throwRing(world, boss, phase) {
  const spec = phase.bullets;
  const enemy = boss.enemy;
  const from = boss.gapAngle + boss.gapHalf;   // the first bearing the ring is allowed to cover
  const step = (TAU - boss.gapHalf * 2) / spec.count;

  SHOT.speed = spec.shot.speed;
  SHOT.radius = spec.shot.radius;
  SHOT.life = spec.shot.life;
  SHOT.color = phase.tint;
  SHOT.caged = spec.shot.caged === true;

  for (let i = 0; i < spec.count; i++) {
    // Half a step inside the edge of what is left on each side: the shots do not lean on the
    // door they were told to leave out, and the arc between the two nearest it is exactly the
    // door the frame lit.
    const angle = from + i * step + step / 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    enemyShotAt(world, enemy.x + dx * enemy.r, enemy.y + dy * enemy.r, dx, dy, SHOT, boss.id);
    boss.shots++;
  }
  boss.rings++;

  const fire = spec.fire;
  ring(world, enemy.x, enemy.y, phase.tint, fire.ring.radius, fire.ring.speed, fire.ring.life);
  shakeIt(world, fire.shake);
  const sound = fire.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * The sweep's wind-up: `arms` fans of harm are lit out of the body's own facing, and then a blade
 * travels down each of them.
 *
 * What is shown is a *fan* and not a line, and that is the whole of the fairness of a hazard that
 * moves: a promise that travels has to show the whole of the way it travels, or the only honest
 * question left in it is "be somewhere else", which nobody can answer. So the frame lights the
 * wedge every blade will sweep - from the bearing it is held at to the bearing it dies at, at the
 * length it reaches and the width it hurts at (game/arms.js) - and the ship has `windup` to be out
 * of it: across either edge, or out past the tip. The bearings are the body's own facing plus one
 * step apiece, which the ride turned there and the framework is holding still, because a boss stands
 * perfectly still while it is showing a beat. Nothing about a fan wanders after it is lit, and none
 * of it is a roll: a seed sweeps its blades the same way twice over.
 */
function showArms(world, boss, phase) {
  const spec = phase.sweep;
  boss.stage = ARMING;
  boss.timer = spec.windup;
  boss.beat = spec.windup;
  boss.armCount = spec.arms;
  boss.armStep = TAU / spec.arms;
  boss.armArc = spec.arc;
  boss.armReach = spec.reach;
  boss.armHalf = spec.half;

  const sound = spec.wind.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * The fans let go: one blade per fan, out of every body of the fight that is still standing, from
 * the bearing each fan was lit at and round to the bearing it was lit *to*. From this step on they
 * are the world's business and not the fight's (game/arms.js), which is why there is nothing here
 * to keep a sweep alive - no list on the boss, no timer, nothing to put right if a body comes down
 * halfway through one.
 *
 * The count that lands is the count that was shown, which is what every telegraph in this file is
 * held to, and it is read off the fight rather than off the row for exactly that reason.
 */
function letArmsLoose(world, boss, phase) {
  const spec = phase.sweep;
  for (const core of boss.cores) {
    const body = core.enemy;
    if (body.hp <= 0) continue;
    for (let i = 0; i < boss.armCount; i++) {
      looseArm(world, body, core.angle + i * boss.armStep, spec, phase.tint);
      boss.blades++;
    }
  }
  boss.sweeps++;

  const fire = spec.fire;
  const enemy = liveCore(boss).enemy;
  ring(world, enemy.x, enemy.y, phase.tint, fire.ring.radius, fire.ring.speed, fire.ring.life);
  shakeIt(world, fire.shake);
  const sound = fire.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * One call sent: `count` bodies of the kind the phase asked for, born on the marks that were
 * just lit, `gap` px outside the hoop and thrown outwards from it.
 *
 * They are built the way a tank's hatchlings are (game/kinds.js `hatch`) - `makeEnemy`, pushed
 * on the crowd, noted for the tally - which says everything a summon needs to say: it is a body
 * of the crowd, hurt by every gun that hurts a body, worth its kind's score and its kind's
 * shards, and hunting the ship the moment it exists. It joins the collision world on the next
 * step like every body that arrives mid-step, and it is born clear of the hoop so that one step
 * of not being shootable is not a free pass in the middle of a duel.
 *
 * Nothing here is a roll. Where the ring calls is a function of where the ship was standing when
 * the marks lit, so a seed calls its darters to the same bearings twice over.
 */
function sendCall(world, boss, phase) {
  const spec = phase.call;
  const enemy = boss.enemy;
  const middle = (boss.callCount - 1) / 2;

  for (let i = 0; i < boss.callCount; i++) {
    const bearing = boss.callAngle + (i - middle) * boss.callStep;
    const dx = Math.cos(bearing);
    const dy = Math.sin(bearing);
    const x = enemy.x + dx * (enemy.r + spec.gap);
    const y = enemy.y + dy * (enemy.r + spec.gap);
    const body = makeEnemy(world, spec.type, x, y, null);
    // Out of the hoop and clear of it, which is the only shove it gets: what comes out of a call
    // walks the rest of the way on its own engines, so its speed is the crowd's and not the
    // ring's, and a dart thrown hard enough to reach the ship in one bound would be a shot.
    body.ix = dx * spec.fire.impulse;
    body.iy = dy * spec.fire.impulse;
    world.enemies.push(body);
    noteArrival(world, body);
    boss.called.push(body);
    boss.summons++;
    burst(world, x, y, phase.tint, spec.fire.spark.count,
          spec.fire.spark.speed, spec.fire.spark.life);
  }
  boss.calls++;

  const fire = spec.fire;
  ring(world, enemy.x, enemy.y, phase.tint, fire.ring.radius, fire.ring.speed, fire.ring.life);
  shakeIt(world, fire.shake);
  const sound = fire.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * The ring letting go of what it called: every body still standing out of its last call comes
 * apart where it is, at the same instant the ring stops existing.
 *
 * This is not a mercy, it is authorship. Those bodies were the fight and not the arena's, and a
 * duel that ended with one of them still nibbling at the ship would end on a loose end rather
 * than on the chord. They are not paid for - the run did not kill them - but they make a wreck
 * and a noise of their own, because a body coming apart is what a body does.
 */
function dismissCall(world, boss) {
  if (boss.called.length === 0) return;
  const phase = phaseOf(boss);
  const spec = phase.call.dismiss;

  for (let i = 0; i < boss.called.length; i++) {
    const body = boss.called[i];
    if (body.hp <= 0) continue;
    // `killEnemy` takes a body out of the crowd; it is the caller that empties it, and every
    // other death in the game comes through `damageEnemy`, which does exactly that first. Here
    // nothing hurt them, so the hull has to be written to zero by hand - a body that has stopped
    // existing and still reads as alive is a lie the next reader of `hp` would believe.
    body.hp = 0;
    const spark = spec.spark;
    spray(world, body.x, body.y, phase.tint, spark.count, spark.speed, spark.life,
          body.rot, spark.spread);
    killEnemy(world, body, false);
  }
  boss.called.length = 0;

  const sound = spec.sound;
  cueChord(sound.notes, sound.dur, sound.wave, sound.vol);
}

/**
 * The mass: the cells one body is built out of, stood round its core at the bearings its layout
 * gives them. They are built the way a boss is (through `opts.kind`, game/kinds.js), which says
 * the whole of what they are: bodies of the crowd, hurt by every gun and fire and blast in the
 * game, worth their kind's score and shards, in the collision world from the next step like
 * everything else that arrives mid-step - and not on the wave director's menu, which is the one
 * thing `opts.kind` is for.
 */
function buildMass(world, core) {
  const spec = core.layout;
  const kind = kindOfCell(spec);
  const enemy = core.enemy;

  for (let i = 0; i < spec.count; i++) {
    const bearing = core.angle + i * TAU / spec.count;
    const x = enemy.x + Math.cos(bearing) * spec.ring;
    const y = enemy.y + Math.sin(bearing) * spec.ring;
    const cell = makeEnemy(world, 'cell', x, y, { kind: kind, hub: enemy, seat: i });
    cell.rot = core.angle;
    world.enemies.push(cell);
    noteArrival(world, cell);
    core.cells.push(cell);
  }
}

/**
 * The numbers a body's mouths spend: its own, if it was built by a `split` row and given some,
 * and the phase's otherwise. Every body in one beat is built from one row, so the beat's clock and
 * the beat's noise are taken off whichever body is asked first (`liveCore`) while the mouths
 * themselves read their own - which is the whole of what changes when a fight grows bodies.
 */
function spawnOf(core, phase) {
  return core.spawn === null ? phase.spawn : core.spawn;
}

/**
 * The opening's wind-up: `share` of the cells that are still standing light up, and then that
 * is what comes out of them - every body the fight owns doing it on the one clock the framework
 * keeps, so three hives opening is one beat to read and not three.
 *
 * Which ones is no roll. They are taken in order round each mass from wherever that mass's last
 * opening left off, so every cell takes its turn and one seed opens the same cells in the same
 * order twice over. The count is a share of the *living* mass - rounded, and never none of it -
 * which is the whole of the reason to shoot the honeycomb: break the mass and the swarms thin out
 * with it, on the same beat that takes the bar down with them.
 */
function lightCells(world, boss, phase) {
  const beat = spawnOf(liveCore(boss), phase);

  boss.stage = OPENING;
  boss.timer = beat.windup;
  boss.beat = beat.windup;

  for (const core of boss.cores) lightTheCore(core, spawnOf(core, phase));

  const sound = beat.wind.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * One body's turn at the wind-up: light `share` of the cells it still has, and answer how many
 * were lit. Nothing is lit when there is nothing left to light, and the beat is spent on the core
 * itself instead (`openTheCore`) - so it is still entered and the rhythm keeps its beat even once
 * the mass is gone.
 */
function lightTheCore(core, spec) {
  const cells = core.cells;
  const standing = living(cells);
  if (standing === 0) return 0;

  const want = Math.min(standing, Math.max(1, Math.round(standing * spec.share)));
  for (let i = 0; i < want; i++) {
    const cell = cells[(core.turn + i) % standing];
    cell.stage = OPENING;
    cell.timer = spec.windup;
    cell.stageTime = spec.windup;
  }
  core.turn = (core.turn + want) % standing;
  return want;
}

/**
 * What an opening is worth, for the whole fight at once: every body opens, and the light, the
 * shudder and the noise of it are one event and not one per body.
 */
function letThemOut(world, boss, phase) {
  const beat = spawnOf(liveCore(boss), phase);
  let sent = 0;

  for (const core of boss.cores) {
    sent += openTheCore(world, core, phase, spawnOf(core, phase));
  }

  boss.calls++;
  boss.summons += sent;

  const enemy = liveCore(boss).enemy;
  const fire = beat.fire;
  ring(world, enemy.x, enemy.y, phase.tint, fire.ring.radius, fire.ring.speed, fire.ring.life);
  shakeIt(world, fire.shake);
  const sound = fire.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * One body's opening: every cell of it that was lit lets out `each` bodies, `step` radians
 * apart, out of the side of itself that faces away from its own core and `gap` px clear of its own
 * edge - so nothing is born inside a body that hurts you, and the mouth you watched is the mouth
 * they came out of, edge for edge.
 *
 * They are one pack per mouth (game/flock.js), which is what a swarmling *is*: bodies that bunch,
 * commit and dive as one thing, so six of them are one threat to read and not six.
 *
 * And a body whose whole mass has been shot off opens its own core instead - the light in the
 * middle of it is the same countdown the cells wore, fanned out along the way it is facing, and it
 * promises the same number. It is the last thing that body has and not a hole in the rhythm.
 */
function openTheCore(world, core, phase, spec) {
  const enemy = core.enemy;
  let sent = 0;

  for (let i = 0; i < core.cells.length; i++) {
    const cell = core.cells[i];
    if (cell.stage !== OPENING || cell.hp <= 0) continue;
    sent += broodFrom(world, spec, phase, cell.x, cell.y, cell.r,
      Math.atan2(cell.y - enemy.y, cell.x - enemy.x));
    cell.stage = '';
    cell.timer = 0;
  }

  if (sent === 0 && living(core.cells) === 0) {
    sent += broodFrom(world, spec, phase, enemy.x, enemy.y, enemy.r, core.angle);
  }
  return sent;
}

/**
 * One mouth opening: `each` bodies of the kind the row named, thrown out of it along `bearing`
 * and `step` radians apart. Answers how many came out, because a summon volley counts itself.
 *
 * They are the crowd's own kind and nothing about them is special (the ring's summons are built
 * the same way, game/bosses.js `sendCall`): a swarm that was a new kind of body would be a
 * second thing to learn on top of the mass that is already being learned.
 */
function broodFrom(world, spec, phase, x, y, r, bearing) {
  const middle = (spec.each - 1) / 2;
  const kind = BALANCE.kinds[spec.type];
  const pack = kind.flock === undefined ? null : newPack(kind.flock, x, y);
  if (pack !== null) world.flocks.push(pack);

  for (let i = 0; i < spec.each; i++) {
    const angle = bearing + (i - middle) * spec.step;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const at = { x: x + dx * (r + spec.gap), y: y + dy * (r + spec.gap) };
    const body = makeEnemy(world, spec.type, at.x, at.y, { flock: pack });
    // Out of the mouth and clear of it, which is the only shove they get: what comes out of a
    // cell walks the rest of the way on its own wings, at the crowd's own pace.
    body.ix = dx * spec.impulse;
    body.iy = dy * spec.impulse;
    world.enemies.push(body);
    noteArrival(world, body);
    burst(world, at.x, at.y, phase.tint,
      spec.fire.spark.count, spec.fire.spark.speed, spec.fire.spark.life);
  }
  return spec.each;
}

/** Every cell of every body that was lit, put out: the beat that lit it is over, one way or the
 * other. */
function putOutTheMass(boss) {
  for (const core of boss.cores) {
    for (let i = 0; i < core.cells.length; i++) {
      const cell = core.cells[i];
      if (cell.stage !== OPENING) continue;
      cell.stage = '';
      cell.timer = 0;
    }
  }
}

/**
 * A cell coming off the mass takes its share of the hull with it, which is what makes the bar
 * the mass and not a number sitting next to it: every point of the hive's hull is a cell somebody
 * can shoot, and the fight does not care whether it was spent on the honeycomb or on the middle of
 * it. The share is a share of the whole bar and not of the body the cell was rooted to, which is
 * what keeps a cell worth the same fraction of the fight whichever of three hives it belongs to.
 *
 * It comes off the body that cell was part of - its own hub, and not "the boss", which since the
 * third phase is not one body - so a fragment whose cells have been shot off is the fragment that
 * pays for it. `byPlayer` comes straight from the death, so a blast the run lit pays out like a
 * shot the run fired.
 */
function cellComesOff(world, cell, byPlayer) {
  const boss = world.boss;
  const hub = cell.hub;
  if (boss === null || hub === null) return;
  // A core that has already stopped existing has nothing left to take it off, and hurting it
  // again would bury it twice (game/enemies.js `killEnemy` insists on being called once).
  if (hub.hp <= 0) return;
  damageEnemy(world, hub, cell.kind.stats.share * hullFull(boss), byPlayer);
}

/**
 * One body's mass coming apart: every cell of it that is still standing is put out unpaid, and the
 * answer is how many came off, which is how the caller knows whether it is worth a chord.
 *
 * They are unpaid and they are removed rather than left standing: a body leaves the crowd by dying,
 * so a hex of wax whose core has stopped existing has to be taken out by hand (game/enemies.js),
 * and the hull it would have been worth is already in the bar its core came down through.
 */
function shedCore(world, boss, core) {
  const spec = core.layout === null ? null : core.layout.fall;
  const phase = phaseOf(boss);
  let shed = 0;

  for (let i = 0; i < core.cells.length; i++) {
    const cell = core.cells[i];
    if (cell.hp <= 0) continue;
    cell.hp = 0;               // nothing hurt these, so the hull is written to zero by hand
    if (spec !== null) {
      const spark = spec.spark;
      spray(world, cell.x, cell.y, phase.tint, spark.count, spark.speed, spark.life,
        cell.rot, spark.spread);
    }
    killEnemy(world, cell, false);
    shed++;
  }
  core.cells.length = 0;
  return shed;
}

/**
 * The whole of the fight's mass coming apart at once, in one chord for all of it rather than one
 * per body and none per cell, because it is one event: the fight letting go of its own body. Same
 * rule the ring's summons are dismissed by, and for the same reason - a duel that ended with two
 * hexes of wax still clinging to a core would end on a loose end and not on the chord.
 */
function breakMass(world, boss) {
  let shed = 0;
  for (const core of boss.cores) shed += shedCore(world, boss, core);
  if (shed === 0) return;

  const sound = boss.row.cells.fall.sound;
  cueChord(sound.notes, sound.dur, sound.wave, sound.vol);
}

/**
 * The fight coming apart into more bodies than it arrived with (PLAN 3.4's Hive, phase 3: "breaks
 * into three smaller hives").
 *
 * It is spent at the end of the phase flare, so the flare is the thing it is: a mass pulling itself
 * into pieces. What the fight was - the core, and whatever was left of its honeycomb - comes apart
 * where it stands and is paid for by nobody, which is the rule every other ending in this file is
 * written by (`breakMass`, `dismissCall`) and is doubly right here, because the fight is not over
 * and its reward is not the run's yet.
 *
 * What takes its place is `cores` bodies, each with a honeycomb of its own, each the same creature
 * at a fraction of the size, and each told which side of the ship to keep (`stationOf`). The bar is
 * the part worth reading: the pieces divide the hull the fight has *left* and their maximums add
 * back up to the maximum it arrived with, so the share on the glass in the frame after the split is
 * the share in the frame before it. That is what lets one hull bar be one fight that happens to be
 * standing in three places - and it is why this is a phase and not three bosses.
 */
function spendSplit(world, boss) {
  const split = boss.split;
  boss.split = null;

  const share = bossHullShare(boss);
  const total = hullFull(boss);
  const ship = world.player;
  const each = total / split.cores;
  const where = { x: boss.enemy.x, y: boss.enemy.y };
  // One fragment takes the bearing the hive was already holding, so the split reads as the mass
  // breaking and not as three new arrivals; the rest are spaced evenly out from it.
  const from = Math.atan2(where.y - ship.y, where.x - ship.x);

  breakMass(world, boss);
  for (const core of boss.cores) {
    const body = core.enemy;
    if (body.hp > 0) body.hp = 0;   // as every death that is not a death (game/enemies.js)
    killEnemy(world, body, false);
  }
  boss.cores.length = 0;

  const broke = split.break;
  ring(world, where.x, where.y, phaseOf(boss).tint,
    broke.ring.radius, broke.ring.speed, broke.ring.life);
  shakeIt(world, broke.shake);
  hitStop(world, broke.hitStop);
  cueChord(broke.sound.notes, broke.sound.dur, broke.sound.wave, broke.sound.vol);

  for (let i = 0; i < split.cores; i++) {
    buildFragment(world, boss, split, from + i * TAU / split.cores, each, share);
  }
}

/**
 * One of the bodies a split grows: built the way a boss is built (through `opts.kind`,
 * game/kinds.js), at the place its bearing gives it and carrying its share of the hull the fight
 * has left. Its own mass is part of it from the same step, and it joins the collision world on the
 * next one like everything else that arrives mid-step (game/kinds.js).
 */
function buildFragment(world, boss, split, bearing, each, share) {
  const body = makeEnemy(world, boss.id, world.player.x, world.player.y, {
    kind: kindOfFragment(boss.row, split),
    hp: each,
    speed: split.body.speed,
  });
  const core = newCore(body, patched(boss.row.cells, split.cells));
  core.bearing = bearing;
  core.spawn = split.spawn;
  core.angle = bearing;          // it faces the way it came, and keeps facing it
  standAt(body, stationOf(world, world.player, boss.row.approach, core));
  // The bar, written after the fact and not asked for of the kind: `makeEnemy` would scale a
  // kind's hull with the run's clock, and this number is the fight's share divided three ways.
  body.maxhp = each;
  body.hp = each * share;
  body.rot = core.angle;

  world.enemies.push(body);
  noteArrival(world, body);
  boss.cores.push(core);
  buildMass(world, core);
}

/** Put a body somewhere and remember where that was, or the frame will paint it sliding in. */
function standAt(enemy, at) {
  enemy.x = at.x;
  enemy.y = at.y;
  enemy.px = at.x;
  enemy.py = at.y;
}

/**
 * Notice the bodies that have come down since the last step, and let go of whatever they were made
 * of. A body leaves the crowd by dying, so `hp` is the whole of the question - the same question
 * `liveCall` asks - and it is asked one step late on purpose, because everything that can hurt a
 * body runs before this file does (game/world.js).
 */
function noteCoresDown(world, boss) {
  for (const core of boss.cores) {
    if (core.down || core.enemy.hp > 0) continue;
    core.down = true;
    boss.cameDown = core.enemy;
    // A fragment coming down is one event, so it gets its own chord - and when the last one goes
    // the fight itself gets another, which is the price of a fight that can end three ways.
    if (shedCore(world, boss, core) > 0) {
      const sound = core.layout.fall.sound;
      cueChord(sound.notes, sound.dur, sound.wave, sound.vol);
    }
  }
}

/** Is all of it down? One body, three bodies: the fight is over when the last of them is. */
function allCoresDown(boss) {
  for (const core of boss.cores) {
    if (!core.down && core.enemy.hp > 0) return false;
  }
  return boss.cores.length > 0;
}

/** A boss that has stopped existing: the room opens, the run is paid, the arena quiets. */
function bossDown(world, boss) {
  const spec = BALANCE.bosses;
  // The last body to come down is where the fight was buried. Every body of a fight that has
  // several has been paid for by its own death already (`noteCoresDown` sheds them, `killEnemy`
  // pays them); what is left for the framework to hand out is the fight's own reward.
  const enemy = boss.cameDown === null ? boss.enemy : boss.cameDown;
  const where = { x: enemy.x, y: enemy.y };
  world.boss = null;
  world.bossIndex = boss.index + 1;
  world.bossesDown++;
  openField(world);
  dismissCall(world, boss);
  // Whatever mass any of it was still wearing. `noteCoresDown` has usually taken all of it off
  // already, one body at a time, so this is the promise rather than the work: a fight does not end
  // with a hex of wax left standing in the room it was fought in (`dismissCall`, same rule).
  breakMass(world, boss);

  // The body is already paid for by `killEnemy` - score, shards, the wreck, the noise of
  // it. What a boss gets on top of that is the framework's, and the one thing worth money
  // is a hull back: the fight is the milestone, and paying for it with a pip you did not
  // have to go and find is the point of it.
  if (boss.row.reward.hull > 0) healPlayer(world, boss.row.reward.hull);
  addText(world, where.x, where.y - enemy.r, boss.row.name + ' IS DOWN', PALETTE.elite);
  cueChord(spec.sound.down.notes, spec.sound.down.dur, spec.sound.down.wave, spec.sound.down.vol);
  world.spawnTimer = Math.max(world.spawnTimer, spec.resume);

  // And if this was the last fight the schedule had, that is the run over - won. The schedule is
  // the whole length of the game (PLAN 3.4: "after the Eclipse, the run is won"), the run walks it
  // once, and `bossIndex` has just moved past this one, so "last" is one comparison. `winRun` is
  // the one that asks whether the ship is still standing to be won (game/run.js).
  if (boss.index + 1 >= spec.schedule.length) winRun(world);
}

/**
 * What the room is on its way to being, 0 for bright and 1 for whatever the night is worth:
 * the phase standing in the room's own ask, or nothing at all when no fight is standing in it.
 *
 * A phase that never wrote a `dark` row asks for a bright room, which is the same rule every other
 * row in this table lives by - a thing a phase never wrote is never taken (game/bosses.js
 * `alternateBeats`). A fight that is still being warned about has no phase yet and asks for nothing;
 * a fight with no bodies left is not a fight and asks for nothing either, which is what hands the
 * light back to the run that just won, without anything having to remember to do it.
 */
function darknessAsked(boss) {
  if (boss === null || boss.cores.length === 0) return 0;
  const spec = phaseOf(boss).dark;
  return spec === undefined ? 0 : spec.level;
}

/**
 * Walk the room's light one step towards what the fight asked for.
 *
 * The world steps this (game/world.js `stepWorld`) and not `updateBosses`, and that is the whole of
 * the reason a room can always be handed back: the step is taken while a run is flying *and* while
 * it lies still over an ending, and it is held only by the two things that genuinely stop the world
 * - a hit-stop, and the cards. A run that wins in the dark, a run that dies in it, a run whose tab
 * is punted: in every one of them the room is on its way back to bright and there is no loose end
 * to tidy. Over a won run that is more than tidy-up - the sun has come down and the night lets go
 * of the room while the card is arriving, which is the reward the row's own comment promises.
 *
 * It is a step of the simulation and not of the frame, so a hit-stop holds the night still with
 * everything else and a level-up pause does not let it creep ahead of the fight it belongs to.
 * And it is only ever looked at by the eye: nothing in game/ reads `world.darkness` back, so a boss
 * may take the room away without moving one thing in it (render/darkness.js).
 */
export function stepDarkness(world, dt) {
  const want = darknessAsked(world.boss);
  const ramp = BALANCE.bosses.dark;
  if (want > world.darkness) {
    world.darkness = Math.min(want, world.darkness + ramp.rise * dt);
  } else if (want < world.darkness) {
    world.darkness = Math.max(want, world.darkness - ramp.fall * dt);
  }
}

/**
 * One step of the boss system: whose turn is it, and what is that boss doing about it.
 *
 * It runs at the end of the step (game/world.js), after everything that can hurt a body,
 * so a boss that died this step is buried this step and never fires a volley from a corpse.
 * The price of that ordering is that a volley fired here is paid out by game/beams.js on
 * the next step - the light appears one step before the damage, by 8 ms of game time and in
 * the player's favour, which is the same direction every other telegraph in the game breaks.
 *
 * Answers whether the run is still flying, the way every other system that can end one does.
 * It is the only system that ends a run by *winning* it - the schedule running out is decided
 * here and nowhere else (`bossDown`) - and the step has to leave on that word the moment it is
 * said, or whatever runs after this file gets to overwrite the ending.
 */
export function updateBosses(world, dt) {
  stepFight(world, dt);
  return world.state === STATE.PLAY;
}

function stepFight(world, dt) {
  const boss = world.boss;
  if (boss === null) {
    startWarning(world);
    return;
  }

  if (boss.cores.length === 0) {
    boss.warn -= dt;
    if (boss.warn <= 0) arrive(world, boss);
    return;
  }

  // Which of its bodies came down since the last step, and what they were made of. That happens
  // here and not in `killEnemy` because a body's own death is the crowd's business; the fight's
  // share of it is shedding the mass that was rooted to it, and that has to wait its turn.
  noteCoresDown(world, boss);
  if (allCoresDown(boss)) {
    bossDown(world, boss);
    return;
  }

  boss.age += dt;
  if (boss.change > 0) {
    boss.change = Math.max(0, boss.change - dt);
    if (boss.change > 0) return;
    for (const core of boss.cores) core.enemy.immune = 0;
    // A phase that asked to come apart does it as the flare finishes, which is the moment the
    // flare has been describing. The new bodies join the collision world on the next step, like
    // everything else that arrives mid-step, and its first beat starts the step after that.
    if (boss.split !== null) spendSplit(world, boss);
    return;
  }

  // Which phase the hull has earned, and whether that is a new one. `atHull` counts down
  // from 1, so a boss that takes two phases' worth of damage in one huge hit opens both -
  // one flare, because it is one event, and the phase it ends in is the one that is true. The
  // hull is the sum of every body the fight owns, which is what keeps a fight that is standing in
  // three places being read as one fight by the bar.
  const share = bossHullShare(boss);
  const marks = BALANCE.bosses.atHull;
  let want = boss.phase;
  while (want + 1 < marks.length && share <= marks[want + 1]) want++;
  if (want !== boss.phase) {
    boss.phase = want;
    openPhase(world, boss);
    return;
  }

  stepBeat(world, boss, dt);
  // And then the thing that is not a beat. A fight whose phase rows carry a `pull` row spends its drag
  // here and nowhere else, once per step (game/bosses.js `holdTheShip`); a fight in its phase flare
  // took its step back above and let go of everything, the pull included.
  holdTheShip(world, boss, dt);
  // The bodies wear the rhythm's facing at the end of the step as well as during the crowd's own
  // (game/bosses.js `holdsItsGround`, `holdsItsBand`), so a frame or a contact test that reads
  // `rot` never finds it a step behind a ring that was turned after the crowd was walked.
  for (const core of boss.cores) core.enemy.rot = core.angle;
}

/** Put every piece of the boss system back. A run is always played with no boss in it. */
export function resetBosses(world) {
  world.boss = null;
  world.bossIndex = 0;
  world.bossesDown = 0;
  // The room bright, whatever the last run was left standing in. This is the only place the
  // darkness is ever *set*; every other place it goes is a step towards what a phase asked for.
  world.darkness = 0;
  openField(world);
}

/**
 * How dark the room is, 0 for bright and 1 for the deepest night any phase has ever asked for.
 *
 * The frame asks; nothing else does. It is a share of the darkest the game can be, so a painter
 * never has to know what level the Eclipse's second phase is (game/balance.js `bosses.dark`).
 */
export function darknessOf(world) {
  return world.darkness;
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

/**
 * Is this body one of the bodies the boss is made of? Which is how the frame knows to draw a ring
 * or a mass instead of a drifter, and how a fight of three hives gets three of them drawn.
 */
export function isBossBody(world, enemy) {
  const boss = world.boss;
  return boss !== null && coreOf(boss, enemy) !== null;
}

/**
 * Is this body one of the cells a boss's mass is built out of? A cell is a body of the crowd in
 * every way that matters - it is hurt, it pays out, it walks - but it is drawn with its boss and
 * not as a drifter of its own, because a hexagon of wax on its own is not a thing a player can
 * read (render/entities.js asks, and skips what this answers yes to).
 *
 * It is one step away from `isBossBody`: a cell knows the body it is part of, so nothing here
 * searches a list once per body per frame.
 */
export function isBossPart(world, enemy) {
  return enemy.hub !== null && isBossBody(world, enemy.hub);
}

/**
 * Which art a boss wears: the ring's, the mass's, or the sun's. It is the rhythm's own name, because
 * what a fight looks like and how it spends its ride are the same decision. The frame asks this rather
 * than matching on the boss's id, so a third boss is a row and not an edit (render/boss.js).
 */
export function bossShape(boss) {
  return boss.row.rhythm;
}

/**
 * The bodies a fight is made of, whole or broken - the frame draws one mass per body, and the
 * holes as well. `boss.cores` is the same list (`newCore`); this is the door the frame is allowed
 * to come through.
 */
export function bossCores(boss) {
  return boss.cores;
}

/** The core a body of the crowd belongs to, or null. The frame asks it to find one body's mass. */
export function bossCoreOf(boss, enemy) {
  return coreOf(boss, enemy);
}

/** The cells rooted to one body of a fight, whole or broken. */
export function coreCells(core) {
  return core.cells;
}

/**
 * The cells of every body a mass is made of, whole or broken, in one list. This is what a headless
 * run and a test count; the frame draws a body at a time and asks the core (`coreCells`).
 */
export function bossCells(boss) {
  return everyCell(boss);
}

/** How many cells of the mass are still standing. Reads; does not compact (game/bosses.js). */
export function cellsStanding(boss) {
  let n = 0;
  for (const core of boss.cores) {
    for (let i = 0; i < core.cells.length; i++) {
      if (core.cells[i].hp > 0) n++;
    }
  }
  return n;
}

/**
 * How many of the fight's bodies are still standing. One, for every boss until its mass breaks;
 * the number a headless run reads to know that it is fighting three hives and not one.
 */
export function coresStanding(boss) {
  let n = 0;
  for (const core of boss.cores) {
    if (!core.down && core.enemy.hp > 0) n++;
  }
  return n;
}

/**
 * Is this cell lighting up for an opening? It is the body's own beat, told the way every other
 * body tells one (game/kinds.js `isSpitting`), so the frame draws a cell's tell with the same
 * arithmetic it draws a spitter's mouth with.
 */
export function cellOpening(cell) {
  return cell.stage === OPENING;
}

/** How far through its opening a cell stands, 0 when it is not having one. */
export function cellProgress(cell) {
  if (cell.stage !== OPENING) return 0;
  return clamp(1 - cell.timer / (cell.stageTime || 1), 0, 1);
}

/** The name on the bar and on the warning. */
export function bossName(boss) {
  return boss.row.name;
}

/**
 * The line the warning shows under the name: what this boss is going to do to you, in one line,
 * before it does it (`blurb` on the boss's own row in game/balance.js). The shape of a fight is
 * something a player reads in the first seconds of it, and the one moment the game is allowed to say
 * something in words is the warning - so this is where the words go.
 */
export function bossBlurb(boss) {
  return boss.row.blurb;
}

/** How much of the boss is left, 0..1 - what the hull bar is filled to. */
export function bossHullShare(boss) {
  const total = hullFull(boss);
  if (total === 0) return 0;
  return clamp(hullLeft(boss) / total, 0, 1);
}

/** Which phase it is in, counted from one, and how many there are to get through. */
export function bossPhase(boss) {
  return boss.phase + 1;
}

/**
 * How many bodies the fight has sent out of its own hoop (game/bosses.js `sendCall`). A headless
 * run has no other way to see a summon beat happen at all: the bodies are ordinary crowd once
 * they are out, and this is the one number that says the ring made them.
 */
export function bossSummons(boss) {
  return boss.summons;
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
  return boss.cores.length === 0 ? Math.max(0, boss.warn) : 0;
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

/** Which way the ring is pointing. A fight with several bodies has its first one point. */
export function bossAngle(boss) {
  return boss.cores.length === 0 ? 0 : boss.cores[0].angle;
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

/**
 * How many shots the ring it is arming is made of - 0 when it is not arming one. The count,
 * the door's bearing and its half-width are the whole of that telegraph, and they are the same
 * three numbers the shots are thrown from, which is what makes the warning a promise: the door
 * shown is the door that arrives, edge for edge.
 */
export function armedCount(boss) {
  return boss.armed;
}

export function gapAngle(boss) {
  return boss.gapAngle;
}

export function gapHalf(boss) {
  return boss.gapHalf;
}

/**
 * The two ends of the route the door it is arming has promised to walk: where it lit, and where it
 * will stand still. For every door that does not walk - every door but the Eclipse's last phase -
 * both are the live bearing, which is what makes a held door and a walking one the same question
 * asked one way (game/bosses.js `walkTheDoor`).
 *
 * The frame lights the whole of the route and the night leaves the whole of it out, for the same
 * reason the blades' fan is lit end to end: a promise that travels owes the sight of all of it.
 */
export function gapStart(boss) {
  return boss.gapFrom;
}

export function gapEnd(boss) {
  return boss.gapTo;
}

/** How far through the arming it stands, 0 when it is not arming anything. */
export function gapProgress(boss) {
  if (boss.stage !== RINGING) return 0;
  return clamp(1 - boss.timer / (boss.beat || 1), 0, 1);
}

/**
 * How many blades the sweep it is showing is made of - 0 when it is not showing one. The count,
 * how far apart two of them stand, how far each travels, how far out it reaches and how wide it is
 * hurt at are that telegraph entire, and they are the same five numbers the blades are loosed from
 * (game/bosses.js `letArmsLoose`): the fan that is lit is the fan that is swept, edge for edge.
 *
 * Which bearings they start on is not here, because it is not the sweep's: each blade starts from
 * the facing of the body that loosed it (`bossCores`), which the ride turned to and the framework
 * holds still until the fan lets go.
 */
export function armCount(boss) {
  return boss.stage === ARMING ? boss.armCount : 0;
}

/** Radians between two of the blades it is showing, or 0 with no sweep to space out. */
export function armStep(boss) {
  return boss.stage === ARMING ? boss.armStep : 0;
}

/** Radians each of those blades will travel, or 0. This is the width of the fan the frame lights. */
export function armArc(boss) {
  return boss.stage === ARMING ? boss.armArc : 0;
}

/** How far out a blade reaches, in px of arena, or 0. */
export function armReach(boss) {
  return boss.stage === ARMING ? boss.armReach : 0;
}

/** How far off a blade's axis the light is drawn and the harm is paid out at - one number. */
export function armHalf(boss) {
  return boss.stage === ARMING ? boss.armHalf : 0;
}

/** How far through the fan's wind-up it stands, 0 when no fan is being shown. */
export function armProgress(boss) {
  if (boss.stage !== ARMING) return 0;
  return clamp(1 - boss.timer / (boss.beat || 1), 0, 1);
}

/**
 * How many sweeps the fight has let go of (game/bosses.js `letArmsLoose`). A headless run has no
 * other way to see one at all: a blade leaves no shot and no body behind, and the pool it lives in
 * is empty again before the next beat is even wound.
 */
export function bossSweeps(boss) {
  return boss.sweeps;
}

/** How many blades the fight has loosed, all the sweeps of this run added up. */
export function bossBlades(boss) {
  return boss.blades;
}

/**
 * How many bodies the call it is making will send - 0 when it is not making one. The count, the
 * bearing the fan is centred on, the step between two of them and how far outside the hoop they
 * will stand are that telegraph entire, and they are the same four numbers the bodies are born
 * from: the marks on the rim are the places they arrive at, edge for edge.
 */
export function callCount(boss) {
  return boss.stage === CALLING ? boss.callCount : 0;
}

/** The bearing the fan of marks is centred on, or null while no call is being made. */
export function callAngle(boss) {
  return boss.stage === CALLING ? boss.callAngle : null;
}

/** Radians between two marks of the fan, or null with no fan to space out. */
export function callStep(boss) {
  return boss.stage === CALLING ? boss.callStep : null;
}

/** How far outside the hoop the bodies will stand, in px - or 0 while no call is being made. */
export function callStand(boss) {
  return boss.stage === CALLING ? phaseOf(boss).call.gap : 0;
}

/**
 * How big the body at the end of a mark is, in px - or 0 while no call is being made.
 *
 * The frame draws each mark the size of the thing that will arrive at it (render/entities.js),
 * which is the same promise every telegraph here makes edge for edge: the door is the door, the
 * spoke is the spoke, and a summons - which is the one attack that cannot promise where its body
 * will be, only what it is - promises its size instead. It is read off the kinds table rather
 * than kept on the call because it is a fact about the crowd: the crowd's darter is what
 * `sendCall` builds, at the hull the run's clock has brought it to.
 */
export function callBody(boss) {
  if (boss.stage !== CALLING) return 0;
  return BALANCE.kinds[phaseOf(boss).call.type].radius;
}

/** How far through the call's wind-up it stands, 0 when it is not making one. */
export function callProgress(boss) {
  if (boss.stage !== CALLING) return 0;
  return clamp(1 - boss.timer / (boss.beat || 1), 0, 1);
}

/**
 * How far through whatever it is showing it stands - the spokes, the door, the call or the mass,
 * whichever it happens to be. The body's own core light is driven off this so that it says
 * "something is coming" whatever the boss's plan turns out to be, which is the one question a
 * frame may ask without knowing what a boss's attack plan is.
 *
 * It is `beatProgress` with the ride taken out of it: every beat is a hold of a known length,
 * and which one it is does not change how far through it the boss stands.
 */
export function windupProgress(boss) {
  return boss.stage === RIDING ? 0 : beatProgress(boss);
}

/**
 * Is the fight riding between two beats, and so showing nothing at all?
 *
 * The drag does not care (a sun pulls while it rides, which is what `holdTheShip` is for) and the
 * drawing does not care either, because `windupProgress` already answers zero while riding. It is
 * here because a test that measures one step has to know which stage of the beat it is standing in,
 * and "is it riding" is not a question anything outside this file may answer for itself.
 */
export function bossRiding(boss) {
  return boss.stage === RIDING;
}

/** How far through the beat it stands, whether it is riding or holding - the bar's breathing. */
export function beatProgress(boss) {
  return clamp(1 - boss.timer / (boss.beat || 1), 0, 1);
}
