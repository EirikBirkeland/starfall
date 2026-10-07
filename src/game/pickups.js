// Shards: what enemies drop, what the ship sucks in, what pays for levels.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { rand, lerp, TAU } from '../core/math.js';
import { burst } from './effects.js';
import { cueBeep } from './cues.js';
import { levelUp } from './progress.js';

/** A dead enemy scatters `count` shards around itself. */
export function dropShards(world, x, y, count) {
  const spec = BALANCE.shards.drop;
  for (let i = 0; i < count; i++) {
    const angle = rand(0, TAU);
    const speed = rand(spec.speedMin, spec.speedMax);
    world.shards.push({
      x: x + rand(-spec.jitter, spec.jitter),
      y: y + rand(-spec.jitter, spec.jitter),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: BALANCE.shards.life,
      spin: rand(-spec.spinMax, spec.spinMax),
      rot: rand(0, TAU),
    });
  }
}

export function updateShards(world, dt) {
  const spec = BALANCE.shards;
  const spark = spec.pickupSpark;
  const sound = spec.sound;
  const drag = Math.pow(spec.drag, dt);
  const magnet2 = spec.magnetRadius * spec.magnetRadius;
  const collectR = world.player.r + spec.collectRadius;
  const collect2 = collectR * collectR;

  for (let i = world.shards.length - 1; i >= 0; i--) {
    const shard = world.shards[i];
    shard.life -= dt;
    if (shard.life <= 0) {
      world.shards.splice(i, 1);
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
    shard.x += shard.vx * dt;
    shard.y += shard.vy * dt;

    if (near2 < collect2) {
      world.shards.splice(i, 1);
      world.xp += spec.xp;
      world.shardsCollected++;
      world.score += spec.score;
      burst(world, shard.x, shard.y, PALETTE.shard, spark.count, spark.speed, spark.life);
      cueBeep(rand(sound.base, sound.base + sound.jitter), sound.dur, sound.wave, sound.vol, sound.slide);
      while (world.xp >= world.xpNeed) levelUp(world);
    }
  }
}
