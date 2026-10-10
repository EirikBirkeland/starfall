// Shards: what enemies drop, what the ship sucks in, what pays for levels.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { logic } from '../core/rng.js';
import { lerp, TAU } from '../core/math.js';
import { burst, ring } from './effects.js';
import { cueBeep } from './cues.js';
import { levelUp } from './progress.js';
import { feedField } from './magnetar.js';
import { drawIn, isVacuuming, noteSwallowed } from './vacuum.js';
import { attractorReachOf } from './upgrades.js';

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

/**
 * The pickup note's climb, in steps (BALANCE.shards.sound.streak).
 *
 * A shard that lands within the window of the last one lifts the note; one that lands after the
 * window has run out starts the climb again from the plain note. So a kill's handful arriving
 * over half a second is a little run up the scale and a stroll between kills brings the note
 * home - which is the whole of "pickups rise in pitch with a streak" (PLAN section 5), and the
 * reason the streak is timed rather than counted: a counter would be at the top of its range by
 * the second minute of any run and stop saying anything.
 *
 * It is called once per shard collected, before the note is asked for: the streak is the run's
 * own fact (world.shardStreak) and the note is what it earns.
 */
function climbStreak(world, spec) {
  const streak = world.shardStreak;
  streak.count = streak.left > 0 ? Math.min(spec.max, streak.count + 1) : 0;
  streak.left = spec.window;
}

/**
 * The note one collection earns: the base, jittered a little, lifted by however far the streak
 * has climbed - `step` of an octave split `stepsPerOctave` ways per shard in a row.
 *
 * Exactly one draw off the logic stream, the one draw the plain random ping it replaces used,
 * so a pitch that follows the loot cannot move a run either way (test/pitch.test.mjs).
 */
function pickupHz(world, sound, climb) {
  const lift = climb.step * world.shardStreak.count / climb.stepsPerOctave;
  return (sound.base + logic.range(0, sound.jitter)) * Math.pow(2, lift);
}

/** Let the streak go cold: `dt` of the window spent since anything was collected. */
function coolStreak(world, dt) {
  const streak = world.shardStreak;
  if (streak.left <= 0) return;
  streak.left -= dt;
  if (streak.left <= 0) {
    streak.left = 0;
    streak.count = 0;
  }
}

export function updateShards(world, dt) {
  const spec = BALANCE.shards;
  const spark = spec.pickupSpark;
  const big = spec.big;
  const sound = spec.sound;
  const climb = sound.streak;
  coolStreak(world, dt);
  const drag = Math.pow(spec.drag, dt);
  // How far the reach goes is the attractor line's answer, not the table's: a run that took three
  // ranks of it is drawing in from twice as far off (game/upgrades.js `attractorReachOf`). The
  // gradient below is measured over this same number, which is what makes a rank widen the well and
  // deepen it at once instead of stretching the tug thin over a bigger circle.
  const magnet = attractorReachOf(world);
  const magnet2 = magnet * magnet;
  const collectR = spec.collectRadius;   // measured from the ship's centre, not its hit radius
  const collect2 = collectR * collectR;
  const shards = world.shards;
  // Is the well open (game/vacuum.js)? One question for the whole loop, because the well is a state of
  // the arena and not of any one shard.
  const vacuuming = isVacuuming(world);

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
    if (vacuuming) {
      // The whole floor is the net: the shard is carried in at the well's own speed and neither the
      // gradient below nor the drag belongs to it while the well is open (game/vacuum.js).
      drawIn(world, shard, dt);
    } else {
      if (near2 < magnet2) {
        const dist = Math.sqrt(near2) || 1;
        const pull = lerp(spec.pullNear, spec.pullFar, dist / magnet);
        shard.vx += (dx / dist) * pull * dt;
        shard.vy += (dy / dist) * pull * dt;
      }
      shard.vx *= drag;
      shard.vy *= drag;
    }
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
      // Which door it came in by - the well's, or the ship's own net (game/vacuum.js).
      noteSwallowed(world);
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
      climbStreak(world, climb);
      // The note is asked for once and the bend is a ratio of it, so the top of a streak still
      // rises instead of sliding down to the ceiling the bottom one slid to.
      const hz = pickupHz(world, sound, climb);
      cueBeep(hz, sound.dur, sound.wave, sound.vol, hz * sound.bend);
      while (world.xp >= world.xpNeed) levelUp(world);
    }
  }
}
