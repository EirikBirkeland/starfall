// Everything about the enemy kinds: their data, where they come from, how they
// walk, and what they leave behind. Behaviour lives in updateEnemies below;
// the numbers that go with it are BALANCE.kinds.

import { BALANCE } from './balance.js';
import { STATE } from './state.js';
import { logic } from '../core/rng.js';
import { clamp, dist2, TAU } from '../core/math.js';
import { addText, burst, hitStop, ring, shakeIt } from './effects.js';
import { dropShards } from './pickups.js';
import { hitPlayer, isInvulnerable } from './player.js';
import { cueBeep } from './cues.js';

/**
 * One value from `opts`. Giving no value leaves the kind's default standing -
 * and giving zero means zero, which `opts.r || default` would have eaten.
 */
function chosen(opts, key, fallback) {
  return opts && opts[key] !== undefined ? opts[key] : fallback;
}

/**
 * Build one enemy. `opts` overrides the kind's defaults: the split children of
 * a tank arrive smaller, tougher, and already flying apart.
 */
export function makeEnemy(world, type, x, y, opts) {
  const kind = BALANCE.kinds[type];
  const e = BALANCE.enemies;
  const hpScale = 1 + clamp(world.elapsed / e.hpScaleWindow, 0, e.hpScaleMax);
  const speedScale = 1 + clamp(world.elapsed / e.speedScaleWindow, 0, 1) * e.speedScaleMax;

  const enemy = {
    type: type,
    x: x,
    y: y,
    px: x,        // where it stood when the current step began; see render/interp.js
    py: y,
    r: chosen(opts, 'r', kind.radius),
    hp: chosen(opts, 'hp', Math.ceil(kind.hull * hpScale)),
    maxhp: 0,
    speed: chosen(opts, 'speed', kind.speed * speedScale) * chosen(opts, 'speedMul', 1),
    drop: chosen(opts, 'drop', kind.drop),
    score: chosen(opts, 'score', kind.score),
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

/** Pick a kind for the current moment of the run. */
function rollKind(world) {
  const e = BALANCE.enemies;
  const roll = logic.next();
  const tankChance = world.elapsed > e.tankFrom ? e.tankChance + world.difficulty * e.tankChanceRamp : 0;
  const darterChance = e.darterChance + world.difficulty * e.darterChanceRamp;
  if (roll < tankChance) return 'tank';
  if (roll < tankChance + darterChance) return 'darter';
  return 'chaser';
}

const EDGES = 4;   // an enemy arrives from one of four directions

/** A point on the border of a box, picked by side and then along that side. */
function onBoxEdge(box, side) {
  switch (side) {
    case 0: return { x: logic.range(box.x0, box.x1), y: box.y0 };
    case 1: return { x: box.x1, y: logic.range(box.y0, box.y1) };
    case 2: return { x: logic.range(box.x0, box.x1), y: box.y1 };
    default: return { x: box.x0, y: logic.range(box.y0, box.y1) };
  }
}

/** The arena's own border, pulled in by `margin`. */
function arenaBox(world, margin) {
  return {
    x0: margin, y0: margin,
    x1: world.arena.w - margin, y1: world.arena.h - margin,
  };
}

/**
 * The border of the screen, pushed out by `margin` and centred on the ship.
 * Everything on it is that much off what the player can see.
 */
function viewBox(world, margin) {
  const ship = world.player;
  const halfW = world.view.w / 2 + margin;
  const halfH = world.view.h / 2 + margin;
  return {
    x0: ship.x - halfW, x1: ship.x + halfW,
    y0: ship.y - halfH, y1: ship.y + halfH,
  };
}

/** Somewhere an enemy is allowed to stand: inside the arena, not on the ship. */
function arrivalFits(world, spot, radius) {
  if (spot.x < radius || spot.x > world.arena.w - radius) return false;
  if (spot.y < radius || spot.y > world.arena.h - radius) return false;
  const min = BALANCE.enemies.spawnMinDistance;
  return dist2(spot.x, spot.y, world.player.x, world.player.y) > min * min;
}

/**
 * Where the next enemy comes from: just off the part of the arena the player can
 * see, so nothing arrives out of nowhere. When the arena is smaller than the
 * screen there is no `off the screen` left to use, and the arena's own edge is
 * the next best thing. Answers null when neither fits - a window that is already
 * full of arena does not need more of it.
 */
function arrivalSpot(world, radius) {
  const attempts = BALANCE.enemies.spawnAttempts;
  const atTheEdge = viewBox(world, radius + BALANCE.enemies.spawnMargin);
  for (let i = 0; i < attempts; i++) {
    const spot = onBoxEdge(atTheEdge, logic.int(0, EDGES - 1));
    if (arrivalFits(world, spot, radius)) return spot;
  }

  const onTheArena = arenaBox(world, radius);
  for (let i = 0; i < attempts; i++) {
    const spot = onBoxEdge(onTheArena, logic.int(0, EDGES - 1));
    if (arrivalFits(world, spot, radius)) return spot;
  }
  return null;
}

/**
 * Send one enemy of `type` (or a rolled kind) in from off-screen. Answers whether
 * one arrived: on a window with the whole arena in it there is sometimes nowhere
 * to put it, and the spawn clock simply tries again.
 */
export function spawnEnemy(world, type) {
  if (world.enemies.length > BALANCE.enemies.hardCap) return false;
  const kind = type || rollKind(world);
  const spot = arrivalSpot(world, BALANCE.kinds[kind].radius);
  if (spot === null) return false;
  world.enemies.push(makeEnemy(world, kind, spot.x, spot.y));
  return true;
}

/** The spawn clock. Later in the run a tick sometimes sends more than one. */
export function updateSpawning(world, dt) {
  world.spawnTimer -= dt;
  if (world.spawnTimer > 0) return;

  const e = BALANCE.enemies;
  const base = Math.max(e.spawnFloor, e.spawnBase - world.elapsed * e.spawnDecay);
  world.spawnTimer = base * logic.range(e.spawnJitter[0], e.spawnJitter[1]);

  if (world.enemies.length < e.spawnCap) spawnEnemy(world);
  for (let i = 0; i < e.extraWaves.length; i++) {
    const wave = e.extraWaves[i];
    if (world.elapsed > wave.at && logic.chance(wave.chance) && world.enemies.length < e.extraCap) {
      spawnEnemy(world);
    }
  }
}

/** A tank breaks into two fast chasers, thrown outward from where it died. */
function splitTank(world, parent) {
  const spec = BALANCE.kinds.tank.split;
  const kidHp = Math.max(1, Math.ceil(parent.hp * spec.hpFactor));
  for (let i = 0; i < spec.into; i++) {
    const angle = logic.range(0, TAU);
    const kid = makeEnemy(world, 'chaser',
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

/**
 * The widest enemy the arena can hold, tank hatchlings included. The collision
 * broad phase queries with it, so no enemy is too fat to be found.
 */
export function widestEnemyRadius() {
  let widest = 0;
  for (const kind of Object.values(BALANCE.kinds)) {
    if (kind.radius > widest) widest = kind.radius;
    if (kind.split && kind.split.radius > widest) widest = kind.split.radius;
  }
  return widest;
}

/**
 * File the whole crowd in the world's collision grid. This is a snapshot for one
 * step, rebuilt before anything queries it; an enemy killed after the rebuild
 * stays in it until the next one, so callers skip what is already dead.
 */
export function rebuildEnemyGrid(world) {
  const grid = world.grid;
  grid.clear();
  for (let i = 0; i < world.enemies.length; i++) grid.insert(world.enemies[i]);
}

/** Take one enemy out of the crowd. Not finding it is a bug, not a no-op. */
function removeEnemy(world, enemy) {
  const at = world.enemies.indexOf(enemy);
  if (at < 0) throw new Error('that enemy is not in the crowd, so it cannot be killed twice');
  world.enemies.splice(at, 1);
}

/** Remove one enemy and pay out whatever it is worth. */
export function killEnemy(world, enemy, byPlayer) {
  removeEnemy(world, enemy);

  const kind = BALANCE.kinds[enemy.type];
  const death = BALANCE.death;
  burst(world, enemy.x, enemy.y, kind.color, kind.death.particles, kind.death.speed, death.particleLife);
  ring(world, enemy.x, enemy.y, kind.color, enemy.r * death.ringScale,
    kind.death.ringSpeed || death.ringSpeed, death.ringLife);

  if (!byPlayer) return;

  world.score += enemy.score;
  world.kills++;
  addText(world, enemy.x, enemy.y - enemy.r - BALANCE.death.labelOffset, '+' + enemy.score, kind.color);
  cueBeep(kind.sound.freq, kind.sound.dur, death.sound.wave, death.sound.vol, death.sound.slide);
  if (kind.death.shake) shakeIt(world, kind.death.shake);
  // A kill the kind calls big gets the run to hold its breath for a moment.
  if (kind.death.hitStop) hitStop(world, kind.death.hitStop);
  dropShards(world, enemy.x, enemy.y, enemy.drop);
  if (enemy.type === 'tank') splitTank(world, enemy);
}

/**
 * Move the crowd, keep it from piling into one blob, and see if it touched the
 * ship. Returns false when the run ended part way through, so the caller can
 * stop the rest of the frame.
 */
export function updateEnemies(world, dt) {
  const impulseDrag = Math.pow(BALANCE.enemies.separationDrag, dt);
  const ship = world.player;

  // Everyone starts the step where they stand, before anything is moved or shoved,
  // so that the renderer can put them between here and wherever this step ends up.
  for (const starting of world.enemies) {
    starting.px = starting.x;
    starting.py = starting.y;
  }

  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const enemy = world.enemies[i];
    if (enemy.flash > 0) enemy.flash -= dt;

    const heading = Math.atan2(ship.y - enemy.y, ship.x - enemy.x);
    let wobble = 0;
    if (enemy.type === 'darter') {
      const w = BALANCE.kinds.darter.wobble;
      wobble = Math.sin(world.elapsed * w.rate + enemy.phase) * w.amount;
    }
    enemy.x += (Math.cos(heading + wobble) * enemy.speed + enemy.ix) * dt;
    enemy.y += (Math.sin(heading + wobble) * enemy.speed + enemy.iy) * dt;
    enemy.ix *= impulseDrag;
    enemy.iy *= impulseDrag;

    if (enemy.type === 'tank') {
      enemy.rot += dt * BALANCE.kinds.tank.rotateRate;
    } else if (enemy.type === 'darter') {
      const s = BALANCE.kinds.darter.spin;
      enemy.rot = heading + Math.sin(world.elapsed * s.rate + enemy.phase) * s.amount;
    } else {
      enemy.rot = heading;
    }

    // Soft separation, so the crowd spreads out instead of stacking.
    for (let j = i - 1; j >= 0; j--) {
      const other = world.enemies[j];
      const dx = enemy.x - other.x;
      const dy = enemy.y - other.y;
      const radii = enemy.r + other.r;
      const d2 = dx * dx + dy * dy;
      if (d2 > BALANCE.enemies.separationEpsilon && d2 < radii * radii) {
        const dist = Math.sqrt(d2);
        const push = (radii - dist) * BALANCE.enemies.separationPush;
        const nx = dx / dist;
        const ny = dy / dist;
        enemy.x += nx * push;
        enemy.y += ny * push;
        other.x -= nx * push;
        other.y -= ny * push;
      }
    }

    if (world.state === STATE.PLAY && !isInvulnerable(ship)) {
      // ship.r is the hit radius, deliberately far smaller than the ship you can
      // see (PLAN 3.1): flying close to the crowd is the game, not a mistake.
      const reach = enemy.r + ship.r;
      if (dist2(enemy.x, enemy.y, ship.x, ship.y) <= reach * reach) {
        hitPlayer(world, enemy);
        if (world.state !== STATE.PLAY) return false;
      }
    }
  }
  return true;
}
