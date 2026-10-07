// Shards: what enemies drop, what the ship sucks in, what pays for levels.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { logic } from '../core/rng.js';
import { lerp, TAU } from '../core/math.js';
import { burst } from './effects.js';
import { cueBeep } from './cues.js';
import { levelUp } from './progress.js';

/** The shape of a shard. `dropShards` writes every field. */
export function makeShard() {
  return { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, life: 0, spin: 0, rot: 0 };
}

/** A dead enemy scatters `count` shards around itself. */
export function dropShards(world, x, y, count) {
  const spec = BALANCE.shards.drop;
  for (let i = 0; i < count; i++) {
    const angle = logic.range(0, TAU);
    const speed = logic.range(spec.speedMin, spec.speedMax);
    const shard = world.shards.spawn();
    shard.x = x + logic.range(-spec.jitter, spec.jitter);
    shard.y = y + logic.range(-spec.jitter, spec.jitter);
    shard.px = shard.x;
    shard.py = shard.y;
    shard.vx = Math.cos(angle) * speed;
    shard.vy = Math.sin(angle) * speed;
    shard.life = BALANCE.shards.life;
    shard.spin = logic.range(-spec.spinMax, spec.spinMax);
    shard.rot = logic.range(0, TAU);
  }
}

export function updateShards(world, dt) {
  const spec = BALANCE.shards;
  const spark = spec.pickupSpark;
  const sound = spec.sound;
  const drag = Math.pow(spec.drag, dt);
  const magnet2 = spec.magnetRadius * spec.magnetRadius;
  const collectR = spec.collectRadius;   // measured from the ship's centre, not its hit radius
  const collect2 = collectR * collectR;
  const shards = world.shards;

  for (let i = shards.count - 1; i >= 0; i--) {
    const shard = shards.items[i];
    shard.life -= dt;
    if (shard.life <= 0) {
      shards.killAt(i);
      continue;
    }
    shard.rot += shard.spin * dt;

    const dx = world.player.x - shard.x;
    const dy = world.player.y - shard.y;
    const near2 = dx * dx + dy * dy;
    if (near2 < magnet2) {
      const dist = Math.sqrt(near2) || 1;
      const pull = lerp(spec.pullNear, spec.pullFar, dist / spec.magnetRadius);
      shard.vx += (dx / dist) * pull * dt;
      shard.vy += (dy / dist) * pull * dt;
    }
    shard.vx *= drag;
    shard.vy *= drag;
    shard.px = shard.x;
    shard.py = shard.y;
    shard.x += shard.vx * dt;
    shard.y += shard.vy * dt;

    if (near2 < collect2) {
      shards.killAt(i);
      world.xp += spec.xp;
      world.shardsCollected++;
      world.score += spec.score;
      burst(world, shard.x, shard.y, PALETTE.shard, spark.count, spark.speed, spark.life);
      cueBeep(logic.range(sound.base, sound.base + sound.jitter), sound.dur, sound.wave, sound.vol, sound.slide);
      while (world.xp >= world.xpNeed) levelUp(world);
    }
  }
}
