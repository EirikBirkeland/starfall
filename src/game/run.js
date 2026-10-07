// The life cycle of a single run: what a fresh run looks like, and what happens
// when it ends.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { setSeed } from '../core/rng.js';
import { STATE } from './state.js';
import { saveBest } from '../core/save.js';
import { burst, ring, shakeIt } from './effects.js';
import { cueChord, clearCues } from './cues.js';

/** Put every piece of run state back to its starting value. */
export function resetRun(world) {
  const ship = world.player;
  const spec = BALANCE.player;

  ship.x = world.arena.w / 2;
  ship.y = world.arena.h / 2;
  ship.vx = 0;
  ship.vy = 0;
  ship.hull = spec.hull;
  ship.invuln = spec.startInvulnerability;
  ship.fireRate = spec.fireRate;
  ship.fireTimer = 0;
  ship.level = 1;
  ship.thrust = 0;
  ship.angle = -Math.PI / 2;

  world.bullets.length = 0;
  world.enemies.length = 0;
  world.shards.length = 0;
  world.particles.clear();
  world.rings.clear();
  world.texts.clear();

  world.elapsed = 0;
  world.difficulty = 0;
  world.score = 0;
  world.xp = 0;
  world.xpNeed = BALANCE.progression.firstLevelXp;
  world.spawnTimer = BALANCE.runStart.spawnDelay;
  world.shake = 0;
  world.kills = 0;
  world.shardsCollected = 0;
  world.newBest = false;
  clearCues();
}

/** Begin a run from the title or the game-over screen. */
export function startRun(world) {
  // From this number on, the run is entirely a function of world.seed: the same
  // seed always plays out the same way.
  setSeed(world.seed);
  resetRun(world);
  world.state = STATE.PLAY;

  const spec = BALANCE.runStart;
  ring(world, world.player.x, world.player.y, PALETTE.player, spec.ring.radius, spec.ring.speed, spec.ring.life);
  burst(world, world.player.x, world.player.y, PALETTE.player, spec.burst.count, spec.burst.speed, spec.burst.life);
}

/** The ship is gone. Bank the score and let the screen show it. */
export function endRun(world) {
  world.state = STATE.OVER;
  world.overTimer = 0;
  world.newBest = world.score > world.best;
  if (world.newBest) {
    world.best = world.score;
    saveBest(world.best);
  }

  const spec = BALANCE.runOver;
  burst(world, world.player.x, world.player.y, PALETTE.player,
    spec.bigBurst.count, spec.bigBurst.speed, spec.bigBurst.life);
  burst(world, world.player.x, world.player.y, PALETTE.pink,
    spec.smallBurst.count, spec.smallBurst.speed, spec.smallBurst.life);
  ring(world, world.player.x, world.player.y, PALETTE.white, spec.ring.radius, spec.ring.speed, spec.ring.life);
  shakeIt(world, spec.shake);
  cueChord(spec.sound.notes, spec.sound.dur, spec.sound.wave, spec.sound.vol);
}

/** Restart is blocked for a moment so the death key press is not eaten. */
export function canStartRun(world) {
  if (world.state === STATE.START) return true;
  return world.state === STATE.OVER && world.overTimer > BALANCE.runOver.restartGuard;
}
