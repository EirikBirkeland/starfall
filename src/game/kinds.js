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
//   onDeath(world, e)   optional; whatever a corpse makes.
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
// does, and only when something dies.

import { BALANCE } from './balance.js';
import { logic } from '../core/rng.js';
import { clamp, TAU } from '../core/math.js';

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
  tank: {
    stats: BALANCE.kinds.tank,
    walk: walksHeavy,
    onDeath: hatch,
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

/** The row for a kind name. A name nobody defined is an error, not a silent no-op. */export function kindOf(type) {
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
 * Walk this enemy one step along the line to the ship, `swerve` radians off it,
 * carrying whatever shove is still in it (a bullet's kick, a hit's shove). Answers
 * the direction it walked, which is where a nose points unless the kind says so.
 */
function advance(enemy, step, swerve) {
  const heading = Math.atan2(step.ship.y - enemy.y, step.ship.x - enemy.x);
  enemy.x += (Math.cos(heading + swerve) * enemy.speed + enemy.ix) * step.dt;
  enemy.y += (Math.sin(heading + swerve) * enemy.speed + enemy.iy) * step.dt;
  enemy.ix *= step.drag;
  enemy.iy *= step.drag;
  return heading;
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
 * A tank comes apart into `split.into` of `split.type`, thrown outwards from where
 * it died. This is the one behaviour that spends `logic`: one draw per hatchling,
 * for the direction it flies.
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
