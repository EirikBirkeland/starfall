// Everything about the enemy kinds: their data, where they come from, how they
// walk, and what they leave behind. Behaviour lives in updateEnemies below;
// the numbers that go with it are BALANCE.kinds.

import { BALANCE } from './balance.js';
import { STATE } from './state.js';
import { rand, randi, clamp, dist2, TAU } from '../core/math.js';
import { addText, burst, ring, shakeIt } from './effects.js';
import { dropShards } from './pickups.js';
import { hitPlayer } from './player.js';
import { cueBeep } from './cues.js';

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
    r: (opts && opts.r) || kind.radius,
    hp: (opts && opts.hp) || Math.ceil(kind.hull * hpScale),
    maxhp: 0,
    speed: ((opts && opts.speed) || kind.speed * speedScale) * ((opts && opts.speedMul) || 1),
    drop: (opts && opts.drop) || kind.drop,
    score: kind.score,
    rot: rand(0, TAU),
    spin: rand(-e.spinRange, e.spinRange),
    flash: 0,
    seed: rand(0, TAU),
    ix: (opts && opts.ix) || 0,
    iy: (opts && opts.iy) || 0,
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
  const roll = Math.random();
  const tankChance = world.elapsed > e.tankFrom ? e.tankChance + world.difficulty * e.tankChanceRamp : 0;
  const darterChance = e.darterChance + world.difficulty * e.darterChanceRamp;
  if (roll < tankChance) return 'tank';
  if (roll < tankChance + darterChance) return 'darter';
  return 'chaser';
}

const EDGES = 4;   // an enemy arrives from one of the four arena edges

/** A point just outside the arena, `margin` pixels out. */
function edgeSpot(world, margin) {
  const w = world.arena.w;
  const h = world.arena.h;
  switch (randi(0, EDGES - 1)) {
    case 0: return { x: rand(0, w), y: -margin };
    case 1: return { x: w + margin, y: rand(0, h) };
    case 2: return { x: rand(0, w), y: h + margin };
    default: return { x: -margin, y: rand(0, h) };
  }
}

/** Send one enemy of `type` (or a rolled kind) in from an edge. */
export function spawnEnemy(world, type) {
  if (world.enemies.length > BALANCE.enemies.hardCap) return;
  const kind = type || rollKind(world);
  const spot = edgeSpot(world, BALANCE.kinds[kind].radius + BALANCE.enemies.spawnMargin);
  world.enemies.push(makeEnemy(world, kind, spot.x, spot.y));
}

/** The spawn clock. Later in the run a tick sometimes sends more than one. */
export function updateSpawning(world, dt) {
  world.spawnTimer -= dt;
  if (world.spawnTimer > 0) return;

  const e = BALANCE.enemies;
  const base = Math.max(e.spawnFloor, e.spawnBase - world.elapsed * e.spawnDecay);
  world.spawnTimer = base * rand(e.spawnJitter[0], e.spawnJitter[1]);

  if (world.enemies.length < e.spawnCap) spawnEnemy(world);
  for (let i = 0; i < e.extraWaves.length; i++) {
    const wave = e.extraWaves[i];
    if (world.elapsed > wave.at && Math.random() < wave.chance && world.enemies.length < e.extraCap) {
      spawnEnemy(world);
    }
  }
}

/** A tank breaks into two fast chasers, thrown outward from where it died. */
function splitTank(world, parent) {
  const spec = BALANCE.kinds.tank.split;
  const kidHp = Math.max(1, Math.ceil(parent.hp * spec.hpFactor));
  for (let i = 0; i < spec.into; i++) {
    const angle = rand(0, TAU);
    const kid = makeEnemy(world, 'chaser',
      parent.x + Math.cos(angle) * spec.offset,
      parent.y + Math.sin(angle) * spec.offset,
      {
        r: spec.radius,
        hp: kidHp,
        drop: spec.drop,
        speedMul: spec.speedMul,
        ix: Math.cos(angle) * spec.impulse,
        iy: Math.sin(angle) * spec.impulse,
      });
    kid.score = spec.score;
    world.enemies.push(kid);
  }
}

/** Remove enemy `index` and pay out whatever it is worth. */
export function killEnemy(world, index, byPlayer) {
  const enemy = world.enemies[index];
  world.enemies.splice(index, 1);

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

  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const enemy = world.enemies[i];
    if (enemy.flash > 0) enemy.flash -= dt;

    const heading = Math.atan2(ship.y - enemy.y, ship.x - enemy.x);
    let wobble = 0;
    if (enemy.type === 'darter') {
      const w = BALANCE.kinds.darter.wobble;
      wobble = Math.sin(world.elapsed * w.rate + enemy.seed) * w.amount;
    }
    enemy.x += (Math.cos(heading + wobble) * enemy.speed + enemy.ix) * dt;
    enemy.y += (Math.sin(heading + wobble) * enemy.speed + enemy.iy) * dt;
    enemy.ix *= impulseDrag;
    enemy.iy *= impulseDrag;

    if (enemy.type === 'tank') {
      enemy.rot += dt * BALANCE.kinds.tank.rotateRate;
    } else if (enemy.type === 'darter') {
      const s = BALANCE.kinds.darter.spin;
      enemy.rot = heading + Math.sin(world.elapsed * s.rate + enemy.seed) * s.amount;
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

    if (world.state === STATE.PLAY && ship.invuln <= 0) {
      const reach = enemy.r + ship.r * BALANCE.player.contactRadiusFactor;
      if (dist2(enemy.x, enemy.y, ship.x, ship.y) <= reach * reach) {
        hitPlayer(world, enemy);
        if (world.state !== STATE.PLAY) return false;
      }
    }
  }
  return true;
}
