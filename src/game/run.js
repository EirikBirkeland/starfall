// The life cycle of a single run: what a fresh run looks like, and what happens
// when it ends.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { setSeed } from '../core/rng.js';
import { STATE } from './state.js';
import { saveBest } from '../core/save.js';
import { burst, ring, shakeIt, wreck } from './effects.js';
import { cueChord, clearCues } from './cues.js';

/** Put every piece of run state back to its starting value. */
export function resetRun(world) {
  const ship = world.player;
  const spec = BALANCE.player;

  ship.x = world.arena.w / 2;
  ship.y = world.arena.h / 2;
  ship.px = ship.x;
  ship.py = ship.y;
  ship.vx = 0;
  ship.vy = 0;
  ship.hull = spec.hull;
  // What the hull can hold is part of the ship, not of the run, but a heal spent in
  // the last run must not carry into this one - and a ship select (milestone 5) will
  // want to write both numbers anyway.
  ship.maxHull = spec.maxHull;
  ship.invuln = spec.startInvulnerability;
  ship.dashLeft = 0;
  ship.dashCd = 0;
  ship.dashDirX = 0;
  ship.dashDirY = 0;
  ship.fireRate = spec.fireRate;
  ship.fireTimer = 0;
  ship.level = 1;
  ship.thrust = 0;
  ship.exhaustTimer = 0;
  ship.angle = -Math.PI / 2;

  world.bullets.clear();
  world.enemyShots.clear();
  world.enemies.length = 0;
  world.shards.clear();
  world.grid.clear();
  world.particles.clear();
  world.rings.clear();
  world.texts.clear();

  world.elapsed = 0;
  world.steps = 0;
  world.score = 0;
  world.xp = 0;
  world.xpNeed = BALANCE.progression.firstLevelXp;
  world.spawnTimer = BALANCE.runStart.spawnDelay;
  world.waveNumber = 0;
  world.shake = 0;
  world.freeze = 0;
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
  // The ship came apart too, so it leaves chunks like anything else that dies.
  wreck(world, world.player.x, world.player.y, PALETTE.playerLine,
    spec.debris.count, spec.debris.speed, BALANCE.death.debrisLife);
  ring(world, world.player.x, world.player.y, PALETTE.white, spec.ring.radius, spec.ring.speed, spec.ring.life);
  shakeIt(world, spec.shake);
  cueChord(spec.sound.notes, spec.sound.dur, spec.sound.wave, spec.sound.vol);
}

/** Restart is blocked for a moment so the death key press is not eaten. */
export function canStartRun(world) {
  if (world.state === STATE.START) return true;
  return world.state === STATE.OVER && world.overTimer > BALANCE.runOver.restartGuard;
}
