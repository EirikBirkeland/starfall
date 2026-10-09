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
import { resetRanks, resetAsks } from './upgrades.js';
import { applyShip } from './ships.js';
import { resetOrbitals } from './orbitals.js';
import { resetNova } from './nova.js';
import { resetArc } from './arc.js';
import { resetBeams } from './beams.js';
import { resetLance } from './lance.js';
import { resetFires } from './burn.js';
import { resetLeech } from './leech.js';
import { resetOvercharge } from './overcharge.js';
import { resetAfterimage } from './afterimage.js';
import { resetMagnetar } from './magnetar.js';
import { resetMines } from './mines.js';
import { resetTether } from './tether.js';
import { resetTurret } from './turret.js';
import { resetShock } from './shock.js';
import { resetBosses } from './bosses.js';

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
  // The hull is not written here: it comes from the ship this world flies, and that is
  // applied below, after the ranks - see `applyShip`.
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
  // And whatever the lance of the last run was wound up to do (game/lance.js) - both the light it
  // left and a beam that was still being aimed, which would otherwise go off for a ship that has
  // already been rebuilt at the middle of the arena.
  resetLance(world);
  // And every body still alight when the last one ended (game/burn.js) - a fire left behind
  // would be eating a body that no longer exists.
  resetFires(world);
  // And whatever the last run's leech had counted or was holding (game/leech.js). A charge
  // earned by the last run's bodies is not this run's to spend.
  resetLeech(world);
  // And however much of a charge the last run had loaded (game/overcharge.js). A gun loaded by a
  // second of standing is spent on the pull after it, not on the pull after a restart.
  resetOvercharge(world);
  // And every image the last run's dashes left standing (game/afterimage.js). They are two
  // seconds old at the oldest, so this is nearly always nothing - but a run that ends on the
  // dash that threw them would otherwise leave them in the sky behind the title screen, and the
  // next run's crowd would walk at somebody else's ghost.
  resetAfterimage(world);
  // And however much of a crack the last run had banked (game/magnetar.js). Loot picked up by the
  // last run is not this run's to let go with, and a field left full would crack on the first step
  // of the next run for a shard it never swallowed.
  resetMagnetar(world);
  // And every mine the last run left lying in the road (game/mines.js). They wait nine seconds at
  // the longest, so a restart would otherwise be chased by a trail it never laid.
  resetMines(world);
  // And whatever the last run's last dash had tied to the arena (game/tether.js). Two seconds of
  // threads at the most, but a run can end on the dash that tied them, and a thread left hanging over
  // the title screen would burn the next run's crowd on a road the last one drove down.
  resetTether(world);
  // And every gun the last run had set down across the road in front of it (game/turret.js). They hold
  // their ground for ten seconds at the most, but a run can end inside that and a gun left standing
  // would be firing at the next run's crowd off a spot the last one chose.
  resetTurret(world);
  // And whatever the last run's detonations were counted as (game/shock.js). The blasts are gone
  // with the crowd; the counters are this run's own scorecard and start again with it.
  resetShock(world);
  world.enemies.length = 0;
  world.flocks.length = 0;   // the packs went with the crowd (game/flock.js)
  world.shards.clear();
  world.grid.clear();
  world.gridReach = 0;       // nothing is standing anywhere to be found (game/enemies.js)
  // And no boss is coming or here: the schedule starts again from the top, the cage is open,
  // and a fight left standing when the last run ended is not this run's to finish
  // (game/bosses.js). This also puts the ship's flying box back to the whole arena.
  resetBosses(world);
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
  // ...and with nothing owed and nothing refused: the two asks a run gets about its own
  // deal are spent by the run that spent them (game/upgrades.js).
  resetAsks(world);
  // And now the ship itself goes on: its hull, its engines, its dash's wait, its silhouette,
  // and any upgrade rank it arrived with (game/ships.js). After the ranks are cleared, because
  // a ship that starts with a rank of something has to spend it on a table that has been wiped
  // and not on the last run's; and after everything else, because nothing between here and the
  // first step should be able to overwrite a body that has just been written.
  applyShip(world);
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
