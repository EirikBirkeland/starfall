// The crowd: where enemies come from, how the lot of them is stepped, and what a
// kill pays out. What a single kind *is* - its numbers, the way it walks, what its
// corpse makes - lives in game/kinds.js. This file is the part that is about the
// crowd rather than about one of them: it asks a kind to walk, it never asks which
// kind it is.

import { BALANCE } from './balance.js';
import { STATE } from './state.js';
import { logic } from '../core/rng.js';
import { dist2 } from '../core/math.js';
import { addText, burst, hitStop, ring, shakeIt, wreck } from './effects.js';
import { dropShards } from './pickups.js';
import { hitPlayer, isInvulnerable } from './player.js';
import { cueBeep } from './cues.js';
import { KINDS, kindOf, makeEnemy } from './kinds.js';

/**
 * Pick a kind for the current moment of the run. `mix` is the list in balance.js:
 * each row that has unlocked yet takes its share of the roll, in order, and
 * whatever is left over is the plain walker. A row costs the roll one number
 * either way, so the stream does not care which kinds exist yet.
 */
function rollKind(world) {
  const spec = BALANCE.enemies;
  const roll = logic.next();
  let cut = 0;
  for (let i = 0; i < spec.mix.length; i++) {
    const entry = spec.mix[i];
    if (world.elapsed < entry.from) continue;
    cut += entry.chance + world.difficulty * entry.ramp;
    if (roll < cut) return entry.type;
  }
  return spec.mixFallback;
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
  const spot = arrivalSpot(world, kindOf(kind).stats.radius);
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

/**
 * The widest enemy the arena can hold, tank hatchlings included. The collision
 * broad phase queries with it, so no enemy is too fat to be found. The kinds never
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

/**
 * How many chunks a wreck throws: what its kind says, scaled by the body that
 * actually came apart. A tank hatchling is a small tank, so it makes a small mess.
 */
function chipsOf(stats, enemy) {
  return Math.max(1, Math.round(stats.death.debris * enemy.r / stats.radius));
}

/** Remove one enemy and pay out whatever it is worth. */
export function killEnemy(world, enemy, byPlayer) {
  removeEnemy(world, enemy);

  const kind = enemy.kind;
  const stats = kind.stats;
  const death = BALANCE.death;
  burst(world, enemy.x, enemy.y, stats.color, stats.death.particles, stats.death.speed, death.particleLife);
  wreck(world, enemy.x, enemy.y, stats.color, chipsOf(stats, enemy), stats.death.debrisSpeed, death.debrisLife);
  ring(world, enemy.x, enemy.y, stats.color, enemy.r * death.ringScale,
    stats.death.ringSpeed || death.ringSpeed, death.ringLife);

  if (!byPlayer) return;

  world.score += enemy.score;
  world.kills++;
  addText(world, enemy.x, enemy.y - enemy.r - BALANCE.death.labelOffset, '+' + enemy.score, stats.color);
  cueBeep(stats.sound.freq, stats.sound.dur, death.sound.wave, death.sound.vol, death.sound.slide);
  // A kill the kind calls big gets the run to hold its breath for a moment.
  if (stats.death.shake) shakeIt(world, stats.death.shake);
  if (stats.death.hitStop) hitStop(world, stats.death.hitStop);
  dropShards(world, enemy.x, enemy.y, enemy.drop);
  // And whatever else this kind leaves behind - a tank leaves two hatchlings.
  if (kind.onDeath) kind.onDeath(world, enemy);
}

/**
 * The one `step` handed to every behaviour this step (see game/kinds.js). Refilled
 * and reused, so stepping a crowd of six hundred allocates nothing.
 */
const step = { world: null, ship: null, dt: 0, drag: 1 };

/**
 * Move the crowd, keep it from piling into one blob, and see if it touched the
 * ship. Returns false when the run ended part way through, so the caller can
 * stop the rest of the frame.
 */
export function updateEnemies(world, dt) {
  const ship = world.player;
  step.world = world;
  step.ship = ship;
  step.dt = dt;
  step.drag = Math.pow(BALANCE.enemies.separationDrag, dt);

  // Everyone starts the step where they stand, before anything is moved or shoved,
  // so that the renderer can put them between here and wherever this step ends up.
  for (const starting of world.enemies) {
    starting.px = starting.x;
    starting.py = starting.y;
  }

  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const enemy = world.enemies[i];
    if (enemy.flash > 0) enemy.flash -= dt;

    // How this one moves, and which way it points while doing it, is the kind's
    // business and nobody else's.
    enemy.kind.walk(enemy, step);

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
