// The life cycle of a single run: what a fresh run looks like, and what happens
// when it ends.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { setSeed } from '../core/rng.js';
import { STATE } from './state.js';
import { saveBest } from '../core/save.js';
import { burst, ring, shakeIt, wreck } from './effects.js';
import { cueChord, clearCues } from './cues.js';
import { newTally } from './tally.js';
import { firstLevelXp } from './progress.js';
import { resetRanks } from './upgrades.js';
import { resetOrbitals } from './orbitals.js';
import { resetNova } from './nova.js';
import { resetArc } from './arc.js';
import { resetBeams } from './beams.js';
import { resetFires } from './burn.js';
import { resetLeech } from './leech.js';

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
  ship.fireTimer = 0;
  ship.level = 1;
  ship.thrust = 0;
  ship.exhaustTimer = 0;
  ship.angle = -Math.PI / 2;

  world.bullets.clear();
  world.enemyShots.clear();
  // The ring goes with the ranks it was built from (game/orbitals.js).
  resetOrbitals(world);
  // And so does anything the nova had already thrown (game/nova.js).
  resetNova(world);
  // And every bolt the arc left hanging in the sky (game/arc.js).
  resetArc(world);
  // And every beam a sniper had still been glowing with (game/beams.js).
  resetBeams(world);
  // And every body still alight when the last one ended (game/burn.js) - a fire left behind
  // would be eating a body that no longer exists.
  resetFires(world);
  // And whatever the last run's leech had counted or was holding (game/leech.js). A charge
  // earned by the last run's bodies is not this run's to spend.
  resetLeech(world);
  world.enemies.length = 0;
  world.flocks.length = 0;   // the packs went with the crowd (game/flock.js)
  world.shards.clear();
  world.grid.clear();
  world.particles.clear();
  world.rings.clear();
  world.texts.clear();

  world.elapsed = 0;
  world.steps = 0;
  world.score = 0;
  world.xp = 0;
  world.xpNeed = firstLevelXp();
  // The run starts with nothing bought and nothing on the table: a card left over from
  // the last run would pause a run that has earned nothing.
  resetRanks(world);
  world.offer.length = 0;
  world.pendingLevels = 0;
  world.offerTime = 0;
  world.spawnTimer = BALANCE.runStart.spawnDelay;
  world.waveNumber = 0;
  world.shake = 0;
  world.freeze = 0;
  world.kills = 0;
  world.shardsCollected = 0;
  world.newBest = false;
  // A fresh sheet for the new run (game/tally.js). A new object rather than emptying
  // the old one, so anything holding on to a finished run's tally keeps reading the
  // run it belongs to - which is exactly what tools/balance-report.js does.
  world.tally = newTally();
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
