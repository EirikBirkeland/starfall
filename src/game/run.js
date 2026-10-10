// The life cycle of a single run: what a fresh run looks like, what happens
// when it ends, and how an ending that was a win can be handed back and flown on.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { setSeed } from '../core/rng.js';
import { STATE } from './state.js';
import { remember } from '../core/save.js';
import { payForRun } from './stardust.js';
import { recordRun } from './codex.js';
import { bankAwards, resetAwards } from './awards.js';
import { logRun } from './history.js';
import { burst, ring, addText, shakeIt, wreck } from './effects.js';
import { cueChord, cueNoise, clearCues } from './cues.js';
import { newTally, noteVictory, noteEndless } from './tally.js';
import { firstLevelXp } from './progress.js';
import { resetRanks, resetAsks } from './upgrades.js';
import { applyShip } from './ships.js';
import { extraBanishesOf, extraRerollsOf, startingHullOf } from './perks.js';
import { resetOrbitals } from './orbitals.js';
import { resetNova } from './nova.js';
import { resetArc } from './arc.js';
import { resetBeams } from './beams.js';
import { resetArms } from './arms.js';
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
  // And every blade a boss had still been sweeping (game/arms.js). A sweep is under a second long, so
  // this is nearly always nothing - but a run can end with one travelling, and a blade left standing
  // in the arena would take a hull off the next one for a fight it never fought.
  resetArms(world);
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
  // And the run is not endless: a run that outlasted the schedule and was then handed its arena back
  // is one run, and the next one starts with the schedule whole again (game/run.js `continueRun`).
  world.endless = false;
  // ...and the second clock goes back to zero with it. An endless run's growth is measured from the
  // hand-back and from nowhere else (game/endless.js), so the number it is measured against has to
  // belong to this run and not to the one that won.
  world.endlessAt = 0;
  // The run starts with nothing bought and nothing on the table: a card left over from
  // the last run would pause a run that has earned nothing.
  resetRanks(world);
  // ...and with nothing owed and nothing refused: the two asks a run gets about its own
  // deal are spent by the run that spent them (game/upgrades.js).
  resetAsks(world);
  // ...and the ranks the hangar paid for are added to both: a run whose purse bought a reroll has
  // one more deal to ask for than one that bought none (game/perks.js). Added after the grant and
  // not inside it, so `BALANCE.cards` stays "what a run is given" and the perk stays "what was
  // bought" - and a rank is never a reason a ship cannot be measured by a tool that bought nothing.
  world.rerollsLeft += extraRerollsOf(world);
  world.banishesLeft += extraBanishesOf(world);
  // And now the ship itself goes on: its hull, its engines, its dash's wait, its silhouette,
  // and any upgrade rank it arrived with (game/ships.js). After the ranks are cleared, because
  // a ship that starts with a rank of something has to spend it on a table that has been wiped
  // and not on the last run's; and after everything else, because nothing between here and the
  // first step should be able to overwrite a body that has just been written.
  applyShip(world);
  // ...and the plating the hangar bought goes over that body, on the hull *and* the maximum, so a
  // ship that starts on three pips starts on four-and-a-rank rather than on three with a hole in
  // the top of the bar (game/perks.js `startingHullOf`). After `applyShip` for the same reason the
  // ship itself is applied after the ranks: the last thing written to the hull wins.
  const plating = startingHullOf(world);
  ship.hull += plating;
  ship.maxHull += plating;
  world.offer.length = 0;
  world.pendingLevels = 0;
  world.offerTime = 0;
  world.spawnTimer = BALANCE.runStart.spawnDelay;
  world.waveNumber = 0;
  world.shake = 0;
  world.freeze = 0;
  world.kills = 0;
  world.shardsCollected = 0;
  // The pickup streak starts again with the run (game/pickups.js): a pile the last run was
  // still swallowing when it ended is not this one's climb. Written back into, not replaced.
  world.shardStreak.count = 0;
  world.shardStreak.left = 0;
  world.newBest = false;
  // ...and this run has taught the codex nothing yet (game/codex.js). What the codex *knows* is
  // above, in `world.found`, and is none of this run's to forget.
  world.codexNew = 0;
  // ...and the same bargain with the awards (game/awards.js): what the save has won stays, and what
  // this run earned, what the last ending paid out and anything still waiting to be announced all
  // go with the run they belong to.
  resetAwards(world);
  // ...and this run has not written its line in the log yet (game/history.js). The log itself is
  // above, in `world.pastRuns`, and is none of this run's to forget.
  world.runLogged = false;
  // ...and the run has not been won or paid for yet (game/stardust.js). The purse above is left
  // alone: what the last run earned is spent or it is not, and either way it is not this run's.
  world.won = false;
  world.dustPaid = 0;
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

/**
 * Bank what the run is worth between runs. Both endings go through here: a run that stopped and a
 * run that finished are two ways of being over, and neither the best score nor the purse cares
 * which one it was. The stardust is paid here rather than beside the best because a run is paid
 * once, whichever way it ended - and a won run that is handed back and goes down later is the case
 * that would otherwise be paid twice (game/stardust.js).
 *
 * The codex is filled in here for the same reason (game/codex.js): it is what the run met and what
 * it took, which is only a finished sentence once the run has stopped, and a run that is won, handed
 * back and goes down later is one run and not two meetings. `recordRun` writes only what the save
 * did not already know, so the second ending of a won run adds nothing and says nothing.
 *
 * The awards are credited here for the same third reason (game/awards.js): half of them are only
 * true of a run that has stopped, and the ones that turned true on the way are paid out here and
 * nowhere else - once per save, which is what makes the second ending of a won run pay nothing
 * again. Their stardust goes on top of the purse after the run's own, so the card can say what the
 * run earned and what being remembered earned separately, and neither number is the other's.
 *
 * The log is written here for the fourth and same reason (game/history.js): a row about a run is a
 * sentence that only finishes when the run does. One run makes one row, and the second ending of a
 * run that was won and flown on rewrites that row instead of adding a second one.
 */
function bankRun(world) {
  world.newBest = world.score > world.best;
  if (world.newBest) {
    world.best = world.score;
    remember('score', { best: world.best });
  }
  payForRun(world);
  recordRun(world);
  bankAwards(world);
  logRun(world);
}

/** The ship is gone. Bank the score and let the screen show it. */
export function endRun(world) {
  world.state = STATE.OVER;
  world.overTimer = 0;
  bankRun(world);

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
  // The chord is the run ending; the rumble under it is the ship.
  cueNoise(spec.sound.noise, spec.sound.vol * spec.sound.noise.share);
}

/**
 * The last fight on the schedule has come down and the ship is still standing: the run is won
 * (PLAN 3.4). game/bosses.js asks for this the step that happens and nobody else does.
 *
 * It is an ending and not a reward round: the arena stops exactly as it stops for a death, so
 * nothing in it can take a hull off a ship that has already finished. What a death does not get
 * is the hush - a moment of frozen arena with nothing over it, which is where the fight's own
 * going-down is heard, and the only reason `BALANCE.victory.hush` exists.
 */
export function winRun(world) {
  // Only a run that is flying can be won. The crowd is walked before the boss framework
  // (game/world.js), so a fight can take the run's last hull in the same step it loses its own,
  // and a wreck does not get to be a win as well (test/victory.test.mjs).
  if (world.state !== STATE.PLAY) return;

  world.state = STATE.WON;
  world.overTimer = 0;
  // The fact first, then the payment: the win is part of what the run is worth (game/stardust.js).
  world.won = true;
  bankRun(world);
  noteVictory(world);

  const spec = BALANCE.victory;
  const ship = world.player;
  burst(world, ship.x, ship.y, PALETTE.player, spec.burst.count, spec.burst.speed, spec.burst.life);
  ring(world, ship.x, ship.y, PALETTE.white, spec.ring.radius, spec.ring.speed, spec.ring.life);
  ring(world, ship.x, ship.y, PALETTE.elite, spec.wideRing.radius, spec.wideRing.speed,
    spec.wideRing.life);
  // No shake of its own: the last fight coming down is what shakes this moment, and the room is
  // held to a ceiling that a second source on the same step would only eat (game/balance.js
  // `victory`, and test/shake-policy.test.mjs for the ceiling).
  cueChord(spec.sound.notes, spec.sound.dur, spec.sound.wave, spec.sound.vol);
}

/**
 * Is the win's card up? It goes up `BALANCE.victory.hush` after the fight came down, and it is
 * the only thing that says the win is over: until it is, the run is still holding still in front
 * of an arena nobody has been told about yet.
 *
 * The frame asks this to know when to put the card on the glass. `victoryCardIsAnswerable` below
 * is the same question asked a few seconds later, and it is what `canStartRun` and `continueRun`
 * ask: one clock behind both, so the card and the keys that dismiss it cannot come apart.
 */
export function victoryCardIsUp(world) {
  return world.state === STATE.WON && world.overTimer > BALANCE.victory.hush;
}

/**
 * The card has been up long enough to have been read, and so may be answered.
 *
 * This is the only moment a won run can be left, and it is the whole of the answer for both of
 * the ways it can be left - kept flying (`continueRun`) and traded for a new one
 * (`canStartRun`) - so that a player cannot click past the ending before it has been an ending
 * (game/balance.js `victory.guard`, and BUG_REPORT_README for the complaint that wrote it).
 *
 * It implies `victoryCardIsUp`: the guard is longer than the hush, and a test holds that, so
 * "answerable" never means a card that was never painted. One clock, `world.overTimer`, is
 * behind both questions; there is no second timer to fall out of step with the first.
 */
export function victoryCardIsAnswerable(world) {
  return world.state === STATE.WON && world.overTimer > BALANCE.victory.guard;
}

/**
 * Hand the arena back to a run that has won, and let it fly on: PLAN 3.4's endless mode, which is
 * not a second mode so much as the same run refusing to stop.
 *
 * The win's card is a door *into* the run and not out of it, and the key that would have begun a new
 * run unwinds this one back into `PLAY` with everything it earned still on it - the score, the hull,
 * the level, the build, the fights it buried. Nothing is reset here, because nothing was ever taken
 * away: `winRun` stopped this exact world and this starts that one again.
 *
 * What the run does not get back is a fight. The schedule is walked once and it has been walked out
 * (game/bosses.js), so what comes out of the dark from here is the wave director and nobody else.
 * What goes on scaling from here is the second clock's business - `world.endlessAt` below is where
 * it starts counting from, and game/endless.js is what reads it.
 *
 * Answers false for a world this does not apply to - a run that is flying, a wreck, a won run
 * whose card is not up yet, and a won run whose card has not been up long enough to have been
 * read - so the frame can ask one question and get one answer.
 */
export function continueRun(world) {
  if (!victoryCardIsAnswerable(world)) return false;

  const spec = BALANCE.endless;
  const ship = world.player;
  world.state = STATE.PLAY;
  world.overTimer = 0;
  world.endless = true;
  // The second clock starts here and not at the win: the run's own clock did not move while the card
  // was up, and the growth is measured from the moment the arena came back rather than from the
  // moment it stopped (game/endless.js). A run that leaves the card up for a minute before pressing
  // is not punished for reading.
  world.endlessAt = world.elapsed;
  noteEndless(world);
  // The world stopped with the crowd standing where it stopped, some of it on top of a ship that had
  // no reason to be anywhere. It gets the breathing room a run is given when it starts.
  ship.invuln = Math.max(ship.invuln, spec.resumeInvulnerability);
  // And it says so: one ring out of the hull and one word over it, because the arena is about to
  // hurt again and the player has just spent a moment being told that it had stopped.
  ring(world, ship.x, ship.y, PALETTE.elite, spec.ring.radius, spec.ring.speed, spec.ring.life);
  addText(world, ship.x, ship.y - ship.drawR - spec.wordLift, spec.word, PALETTE.elite);
  cueChord(spec.sound.notes, spec.sound.dur, spec.sound.wave, spec.sound.vol);
  return true;
}

/**
 * Restart is blocked for a moment after an ending: over a wreck so the key that died is not eaten
 * on the way to the next run, and over a win because the card has to be up before the run can be
 * left (game/run.js `victoryCardIsUp`) - and leaving a won run means either of the two things its
 * card will do, a new run asked for or this one resumed.
 */
export function canStartRun(world) {
  if (world.state === STATE.START) return true;
  if (world.state === STATE.OVER) return world.overTimer > BALANCE.runOver.restartGuard;
  // A won run cannot be left before its card has been up long enough to read. The hush is not a
  // guard to wait out on the way to somewhere else; it is the win happening, and the guard after
  // it is the part where the player is being told something and should not be interrupted.
  if (world.state === STATE.WON) return victoryCardIsAnswerable(world);
  return false;
}
