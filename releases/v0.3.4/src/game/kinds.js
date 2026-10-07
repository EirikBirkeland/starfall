// What an enemy kind *is*: its numbers, how it walks, what it leaves behind, and
// how one of them is built.
//
// `KINDS` below is the one table every enemy in the game is described by. Its
// numbers are not written here - they live in BALANCE.kinds, where every tuning
// number in the game lives - and each row points at its own entry, so a number is
// still only ever written down once. What a row adds is behaviour:
//
//   walk(enemy, step)   moves one enemy for one step, and turns it: which way it
//                       faces follows from how it moves, so the two are one thing.
//   onDeath(world, e, byPlayer) optional; whatever a corpse goes on to make,
//                       whoever it was that did the killing.
//
// An enemy built by `makeEnemy` keeps a reference to its own row as `enemy.kind`,
// so stepping a crowd asks the enemy what it does instead of looking its name up
// once per enemy per step.
//
// Adding an enemy is then two writes and no editing of the crowd's update loop: its
// numbers in balance.js, its row here. `test/kinds.test.mjs` fails if either half
// is missing, so the two cannot drift apart.
//
// A behaviour reads the world and moves the one enemy it was handed. It may not
// spend numbers from the `logic` stream unless its comment says it does: a walk
// runs once per enemy per step, and a run is a function of its seed, so a walk that
// drew one would quietly rewrite every run after it. `hatch` is the only one that
// does, and only when something dies. Queuing a sound cue is allowed: a cue is a
// note to the audio layer, not a number the simulation keeps.

import { BALANCE } from './balance.js';
import { logic } from '../core/rng.js';
import { clamp, TAU } from '../core/math.js';
import { cueBeep } from './cues.js';
import { spray } from './effects.js';
import { enemyShotAt } from './enemyshots.js';
import { blast } from './blast.js';

/**
 * Every enemy in the game, one row each. `stats` points at the kind's numbers in
 * balance.js; `walk` and `onDeath` are what it does.
 */
export const KINDS = {
  drifter: {
    stats: BALANCE.kinds.drifter,
    walk: walksStraight,
  },
  weaver: {
    stats: BALANCE.kinds.weaver,
    walk: walksWeaving,
  },
  darter: {
    stats: BALANCE.kinds.darter,
    walk: walksHunting,
    onDeath: shattersAlongItsAxis,
  },
  spitter: {
    stats: BALANCE.kinds.spitter,
    walk: walksSpacing,
  },
  tank: {
    stats: BALANCE.kinds.tank,
    walk: walksHeavy,
    onDeath: hatch,
  },
  bomber: {
    stats: BALANCE.kinds.bomber,
    walk: walksBomber,
    onDeath: detonate,
  },
};

/**
 * The shape of the `step` every behaviour is handed. game/enemies.js refills one
 * object per step and passes it to the whole crowd, so a behaviour reads it and
 * never keeps it:
 *
 *   world  the world, for anything beyond the one enemy
 *   ship   world.player, spelled out because every walk wants it
 *   dt     the step, in seconds
 *   drag   how much of a leftover shove survives one step
 */

/**
 * The widest enemy the arena can hold, hatchlings included. The collision broad
 * phase queries with it, so no enemy is too fat to be found. The kinds never
 * change while the game runs, so it is measured once rather than every step.
 */
function measureWidestEnemy() {
  let widest = 0;
  for (const name in KINDS) {
    const stats = KINDS[name].stats;
    if (stats.radius > widest) widest = stats.radius;
    if (stats.split && stats.split.radius > widest) widest = stats.split.radius;
  }
  return widest;
}

const widestEnemy = measureWidestEnemy();

export function widestEnemyRadius() {
  return widestEnemy;
}

/** The row for a kind name. A name nobody defined is an error, not a silent no-op. */
export function kindOf(type) {
  const kind = KINDS[type];
  if (!kind) throw new Error('no enemy kind is called ' + type);
  return kind;
}

/**
 * The numbers an enemy's kind was given. A behaviour reaches for its numbers
 * through the enemy it was handed rather than by naming a kind, so two kinds can
 * share a walk.
 */
function statsOf(enemy) {
  return enemy.kind.stats;
}

/**
 * One value from `opts`. Giving no value leaves the kind's default standing -
 * and giving zero means zero, which `opts.r || default` would have eaten.
 */
function chosen(opts, key, fallback) {
  return opts && opts[key] !== undefined ? opts[key] : fallback;
}

/**
 * Build one enemy of `type` at (x, y). `opts` overrides the kind's defaults: a
 * tank's hatchlings arrive smaller, tougher, and already flying apart.
 */
export function makeEnemy(world, type, x, y, opts) {
  const kind = kindOf(type);
  const stats = kind.stats;
  const e = BALANCE.enemies;
  const hpScale = 1 + clamp(world.elapsed / e.hpScaleWindow, 0, e.hpScaleMax);
  const speedScale = 1 + clamp(world.elapsed / e.speedScaleWindow, 0, 1) * e.speedScaleMax;

  const enemy = {
    type: type,
    kind: kind,   // the row it came from: game/kinds.js, so nothing has to look it up
    x: x,
    y: y,
    px: x,        // where it stood when the current step began; see render/interp.js
    py: y,
    r: chosen(opts, 'r', stats.radius),
    hp: chosen(opts, 'hp', Math.ceil(stats.hull * hpScale)),
    maxhp: 0,
    speed: chosen(opts, 'speed', stats.speed * speedScale) * chosen(opts, 'speedMul', 1),
    drop: chosen(opts, 'drop', stats.drop),
    score: chosen(opts, 'score', stats.score),
    rot: logic.range(0, TAU),
    spin: logic.range(-e.spinRange, e.spinRange),
    flash: 0,
    phase: logic.range(0, TAU),   // this enemy's place in the wobble and spin cycles
    // The small state machine a kind may keep for itself. Most kinds never look at
    // these: a darter spends its life in `stage` counting down `timer`, and the
    // line it locks on before a lunge lives in dirX/dirY. `stageTime` is how long
    // the beat it is in was when it started, so `aimProgress` can say how far
    // through it the enemy is. An enemy that has not been anywhere sits in '' with
    // nothing to count.
    stage: '',
    timer: 0,
    stageTime: 0,
    dirX: 0,
    dirY: 0,
    ix: chosen(opts, 'ix', 0),
    iy: chosen(opts, 'iy', 0),
    ambient: false,
    vx: 0,   // only the slow title-screen crowd uses these
    vy: 0,
  };
  enemy.maxhp = enemy.hp;
  return enemy;
}

/**
 * Move one enemy along the unit vector (dx, dy) at `pace` px/s for one step,
 * carrying whatever shove is already in it (a bullet's kick, a dash's shoulder,
 * a neighbour making room), and let that shove die away on the way.
 */
function glide(enemy, step, dx, dy, pace) {
  enemy.x += (dx * pace + enemy.ix) * step.dt;
  enemy.y += (dy * pace + enemy.iy) * step.dt;
  enemy.ix *= step.drag;
  enemy.iy *= step.drag;
}

/**
 * Walk this enemy one step along the line to the ship, `swerve` radians off it,
 * at `pace` px/s or at its own if nothing is given. Answers the direction it
 * walked, which is where a nose points unless the kind says so.
 */
function advance(enemy, step, swerve, pace) {
  const heading = Math.atan2(step.ship.y - enemy.y, step.ship.x - enemy.x);
  glide(enemy, step, Math.cos(heading + swerve), Math.sin(heading + swerve),
    pace === undefined ? enemy.speed : pace);
  return heading;
}

/** Turn toward `want` at up to `rate` rad/s, and never past it. */
function turnToward(enemy, step, want, rate) {
  let diff = (want - enemy.rot) % TAU;
  if (diff > Math.PI) diff -= TAU;
  if (diff < -Math.PI) diff += TAU;
  const reach = rate * step.dt;
  enemy.rot += clamp(diff, -reach, reach);
}

/**
 * Pull an enemy back inside the arena by its own body, and say whether it had to.
 * Only the kinds that can throw themselves at a wall need this; the ones that walk
 * at the ship are always walking away from it.
 */
function heldByTheWall(world, enemy) {
  const r = enemy.r;
  const x = enemy.x;
  const y = enemy.y;
  enemy.x = clamp(x, r, world.arena.w - r);
  enemy.y = clamp(y, r, world.arena.h - r);
  return enemy.x !== x || enemy.y !== y;
}

/** Straight at the ship, nose first, and no ideas. */
function walksStraight(enemy, step) {
  enemy.rot = advance(enemy, step, 0);
}

/**
 * At the ship, but weaving from side to side so that leading it is hard. The nose
 * follows the weave and not the line, so what you see is the way it is going.
 */
function walksWeaving(enemy, step) {
  const stats = statsOf(enemy);
  const sway = Math.sin(step.world.elapsed * stats.wobble.rate + enemy.phase) * stats.wobble.amount;
  const heading = advance(enemy, step, sway);
  enemy.rot = heading + Math.sin(step.world.elapsed * stats.spin.rate + enemy.phase) * stats.spin.amount;
}

/**
 * At the ship like anything else, but too heavy to turn in a step: it rotates on
 * the spot at its own pace, which is the only thing about it that is quick.
 */
function walksHeavy(enemy, step) {
  advance(enemy, step, 0);
  enemy.rot += step.dt * statsOf(enemy).rotateRate;
}

/**
 * The three beats of a darter's hunt that are not the walking between them. `''`
 * is the fourth: the walk, which is where an enemy starts and where it comes back
 * to after a rest.
 */
const AIMING = 'aim';
const LUNGING = 'lunge';
const RESTING = 'rest';

/**
 * The darter: it walks at you, stops dead to line itself up, comes down that line
 * in a straight dash, and rests. Which beat it is in is `enemy.stage`, and how long
 * it has left in that beat is `enemy.timer`; the renderer draws the warning line
 * out of the same three numbers (`isAiming`, `aimProgress`, `lungeReach`), which is
 * what makes the telegraph a promise rather than a threat.
 */
function walksHunting(enemy, step) {
  const hunt = statsOf(enemy).hunt;
  enemy.timer -= step.dt;
  if (enemy.stage === AIMING) return aiming(enemy, step, hunt);
  if (enemy.stage === LUNGING) return lunging(enemy, step, hunt);
  if (enemy.stage === RESTING) return resting(enemy, step, hunt);
  return hunting(enemy, step, hunt);
}

/**
 * The walk between lunges: a creeping pace at the ship, and the moment it is close
 * enough it stops to take aim. `timer` is the beat between one lunge and the next
 * look, so a darter that missed gets another look rather than another lunge.
 */
function hunting(enemy, step, hunt) {
  enemy.rot = advance(enemy, step, 0);
  if (enemy.timer > 0) return;

  const dx = step.ship.x - enemy.x;
  const dy = step.ship.y - enemy.y;
  if (dx * dx + dy * dy > hunt.commit * hunt.commit) return;

  const distance = Math.hypot(dx, dy) || 1;
  enemy.dirX = dx / distance;
  enemy.dirY = dy / distance;
  enemy.stage = AIMING;
  enemy.timer = hunt.aim.time;
  enemy.stageTime = hunt.aim.time;
  shout(hunt.aim.sound);
}

/**
 * The telegraph. It stands still and brings its nose around onto the line it has
 * locked, and holds there for `aim.time`. Being shot still shoves it around - it
 * just cannot change its mind, so the line you were shown stays the line it goes.
 */
function aiming(enemy, step, hunt) {
  glide(enemy, step, 0, 0, 0);
  turnToward(enemy, step, Math.atan2(enemy.dirY, enemy.dirX), hunt.turn);
  if (enemy.timer > 0) return;

  enemy.stage = LUNGING;
  enemy.timer = hunt.lunge.time;
  enemy.stageTime = hunt.lunge.time;
  shout(hunt.lunge.sound);
}

/** The lunge itself: the locked line, at several times its walking pace. */
function lunging(enemy, step, hunt) {
  enemy.rot = Math.atan2(enemy.dirY, enemy.dirX);
  glide(enemy, step, enemy.dirX, enemy.dirY, enemy.speed * hunt.lunge.mul);
  // The arena ends a lunge that runs into it; the darter does not stick to a wall.
  if (heldByTheWall(step.world, enemy)) enemy.timer = 0;
  if (enemy.timer > 0) return;

  enemy.stage = RESTING;
  enemy.timer = hunt.rest.time;
  enemy.stageTime = hunt.rest.time;
}

/** Overshot and turning around, at a crawl, until the next beat comes round. */
function resting(enemy, step, hunt) {
  enemy.rot = advance(enemy, step, 0, enemy.speed * hunt.rest.crawl);
  if (enemy.timer > 0) return;
  enemy.stage = '';
  enemy.timer = hunt.beat;
  enemy.stageTime = hunt.beat;
}

/** The sound a beat was given, which is not a number the simulation keeps. */
function shout(spec) {
  cueBeep(spec.freq, spec.dur, spec.wave, spec.vol, spec.slide);
}

/** The one beat a spitter has, between holding its distance and holding it again. */
const SPITTING = 'spit';

/**
 * The spitter: it keeps its distance and spits from there. It walks in from beyond
 * `far`, backs off inside `near`, and shuffles sideways in between so it is never a
 * sitting duck. When its wait is up and the ship is within reach it stops dead for
 * `wind.time` - having already decided which way the shot goes, before the wind-up
 * began - and the shot leaves along that. The wind-up is the telegraph: a still,
 * warm, slowly brightening mouth, and then something slow and warm in the air.
 */
function walksSpacing(enemy, step) {
  const spec = statsOf(enemy).spit;
  enemy.timer -= step.dt;
  if (enemy.stage === SPITTING) return winding(enemy, step, spec);
  return holding(enemy, step, spec);
}

/** Hold the band it likes, and start a spit when the wait is up and the ship is in reach. */
function holding(enemy, step, spec) {
  const dx = step.ship.x - enemy.x;
  const dy = step.ship.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  const nx = dx / distance;
  const ny = dy / distance;

  const inOrOut = distance > spec.range.far ? enemy.speed
    : (distance < spec.range.near ? -enemy.speed : 0);
  const sideways = Math.sin(step.world.elapsed * spec.drift.rate + enemy.phase) * spec.drift.speed;
  const vx = nx * inOrOut - ny * sideways;
  const vy = ny * inOrOut + nx * sideways;
  const pace = Math.hypot(vx, vy);
  if (pace > 0) glide(enemy, step, vx / pace, vy / pace, pace);
  else glide(enemy, step, 0, 0, 0);      // standing still, but a shove still moves it
  // It walks backwards on purpose, so without this it would simply leave the world.
  heldByTheWall(step.world, enemy);

  enemy.rot = Math.atan2(ny, nx);         // its mouth points at the ship, always
  if (enemy.timer > 0 || distance > spec.range.far) return;

  enemy.dirX = nx;
  enemy.dirY = ny;
  enemy.stage = SPITTING;
  enemy.timer = spec.wind.time;
  enemy.stageTime = spec.wind.time;
  shout(spec.wind.sound);
}

/** The wind-up, and the shot at the end of it. */
function winding(enemy, step, spec) {
  glide(enemy, step, 0, 0, 0);            // it stops dead to spit
  enemy.rot = Math.atan2(enemy.dirY, enemy.dirX);
  if (enemy.timer > 0) return;

  enemyShotAt(step.world,
    enemy.x + enemy.dirX * enemy.r,
    enemy.y + enemy.dirY * enemy.r,
    enemy.dirX, enemy.dirY, spec.shot);
  enemy.stage = '';
  enemy.timer = spec.after;
  enemy.stageTime = spec.after;
}

/**
 * The bomber: the straight walk, and nothing in the way of ideas - its behaviour is
 * its death, and its warning is the circle it is drawn standing in. Below `arm` of
 * its hull left it stops being careful about the thing it is carrying and speeds up,
 * because the one that is about to go off is the one in a hurry.
 */
function walksBomber(enemy, step) {
  const spec = statsOf(enemy).blast;
  enemy.rot = advance(enemy, step, 0, enemy.speed * (isCritical(enemy) ? spec.rush : 1));
}

/** Is a bomber wounded far enough to be on its way into you in a hurry. */
export function isCritical(enemy) {
  const spec = statsOf(enemy).blast;
  return spec !== undefined && enemy.hp <= enemy.maxhp * spec.arm;
}

/**
 * How far one enemy's death reaches, in px - 0 for a kind that does not go off. The
 * renderer draws exactly this as a ring, which is what makes the ring the blast's
 * word and not the renderer's opinion about it.
 */
export function blastRadius(enemy) {
  const spec = statsOf(enemy).blast;
  return spec === undefined ? 0 : spec.radius;
}

/**
 * How close a bomber is to going off, 0 when whole and 1 the moment it is critical.
 * The ring is drawn out of this, so a whole one is a faint circle and a wounded one
 * is a shout - and the number is the walk's own, so the tell and the behaviour are
 * the same fact twice.
 */
export function blastPressure(enemy) {
  const spec = statsOf(enemy).blast;
  if (spec === undefined) return 0;
  const lost = enemy.maxhp - enemy.hp;
  const beforeItTurns = enemy.maxhp * (1 - spec.arm) || 1;
  return clamp(lost / beforeItTurns, 0, 1);
}

/** Is this darter holding its aim right now - i.e. should it be drawing a line. */
export function isAiming(enemy) {
  return enemy.stage === AIMING;
}

/** Is it mid-lunge - i.e. should it be dragging a blur behind it. */
export function isLunging(enemy) {
  return enemy.stage === LUNGING;
}

/** Is a spitter winding one up right now - i.e. should its mouth be lighting up. */
export function isSpitting(enemy) {
  return enemy.stage === SPITTING;
}

/**
 * How far through the beat it is holding, 0..1 - the countdown a telegraph is drawn
 * from. It reads `stageTime` rather than the kind's numbers so that any beat can be
 * counted down, whoever declared it.
 */
export function aimProgress(enemy) {
  return clamp(1 - enemy.timer / (enemy.stageTime || 1), 0, 1);
}

/**
 * How far one darter's lunge carries it, in px. The warning line is drawn exactly
 * this far, which is the whole reason the number is here and not in the renderer.
 */
export function lungeReach(enemy) {
  const hunt = statsOf(enemy).hunt;
  return enemy.speed * hunt.lunge.mul * hunt.lunge.time;
}

/**
 * A dart comes apart along its own axis: a jet of sparks out of the nose and the
 * same again out of the tail, on top of the wreck every kind makes. This spends
 * the `fx` stream, which is the cosmetic one, so it cannot move a run.
 */
function shattersAlongItsAxis(world, enemy) {
  const stats = statsOf(enemy);
  const jet = stats.death.jet;
  const noseX = enemy.x + Math.cos(enemy.rot) * enemy.r;
  const noseY = enemy.y + Math.sin(enemy.rot) * enemy.r;
  spray(world, noseX, noseY, stats.color, jet.count, jet.speed, jet.life, enemy.rot, jet.spread);
  spray(world, noseX, noseY, stats.color, jet.count, jet.speed, jet.life, enemy.rot + Math.PI, jet.spread);
}

/**
 * A bomber's death is the circle it spent its life drawing, closing. `byPlayer` comes
 * straight from the death, so a chain the player lit pays them for all of it.
 */
function detonate(world, enemy, byPlayer) {
  blast(world, enemy.x, enemy.y, statsOf(enemy).blast, byPlayer);
}

/**
 * A tank comes apart into `split.into` of `split.type`, thrown outwards from where
 * it died. This is the one behaviour that spends `logic`: one draw per hatchling,
 * for the direction it flies. It does not care who killed the tank, so it ignores
 * the `byPlayer` a death effect is handed.
 */
function hatch(world, parent) {
  const spec = statsOf(parent).split;
  const kidHp = Math.max(1, Math.ceil(parent.hp * spec.hpFactor));
  for (let i = 0; i < spec.into; i++) {
    const angle = logic.range(0, TAU);
    const kid = makeEnemy(world, spec.type,
      parent.x + Math.cos(angle) * spec.offset,
      parent.y + Math.sin(angle) * spec.offset,
      {
        r: spec.radius,
        hp: kidHp,
        drop: spec.drop,
        score: spec.score,
        speedMul: spec.speedMul,
        ix: Math.cos(angle) * spec.impulse,
        iy: Math.sin(angle) * spec.impulse,
      });
    // The crowd grew after this step's grid was rebuilt, so a hatchling can be
    // shot from the next step. It is thrown clear as it appears; nobody notices.
    world.enemies.push(kid);
  }
}
