// Shards: what enemies drop, what the ship sucks in, what pays for levels.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { logic } from '../core/rng.js';
import { lerp, TAU } from '../core/math.js';
import { burst, ring } from './effects.js';
import { cueBeep } from './cues.js';
import { levelUp } from './progress.js';
import { feedField } from './magnetar.js';

/** The shape of a shard. `worth` is what makes a large one (PLAN 3.3's elite drop). */
export function makeShard() {
  return { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, life: 0, spin: 0, rot: 0, worth: 1 };
}

/**
 * Scatter `count` shards of `worth` each around (x, y). Every field is written, which
 * is the pool's contract: a recycled shard may not keep a value from its last life.
 */
function scatter(world, x, y, count, worth) {
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
    shard.worth = worth;
  }
}

/** A dead enemy scatters `count` shards around itself. */
export function dropShards(world, x, y, count) {
  scatter(world, x, y, count, 1);
}

/**
 * The one large shard an elite is promised on top of its own scatter: the same mint
 * thing, worth a pile more, and drawn bigger for it (render/entities.js).
 */
export function dropBigShard(world, x, y) {
  scatter(world, x, y, 1, BALANCE.shards.big.worth);
}

export function updateShards(world, dt) {
  const spec = BALANCE.shards;
  const spark = spec.pickupSpark;
  const big = spec.big;
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
      // A large shard is worth `worth` of the ordinary ones and nothing else about it
      // differs, so one collection path pays for both.
      const worth = shard.worth;
      world.xp += spec.xp * worth;
      world.shardsCollected++;
      world.score += spec.score * worth;
      // And it charges the field round the ship, if the run bought the line that spends it
      // (game/magnetar.js). Here rather than there because this is the one door a shard comes in
      // by - there is no other moment at which a shard is *collected* - and a large shard is worth
      // six of them at once, which is what makes an elite's drop nearly a whole crack.
      feedField(world, worth);
      if (worth > 1) {
        burst(world, shard.x, shard.y, PALETTE.shard, big.spark.count, big.spark.speed, big.spark.life);
        ring(world, shard.x, shard.y, PALETTE.shard, big.ring.radius, big.ring.speed, big.ring.life);
      } else {
        burst(world, shard.x, shard.y, PALETTE.shard, spark.count, spark.speed, spark.life);
      }
      cueBeep(logic.range(sound.base, sound.base + sound.jitter), sound.dur, sound.wave, sound.vol, sound.slide);
      while (world.xp >= world.xpNeed) levelUp(world);
    }
  }
}
