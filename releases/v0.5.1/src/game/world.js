// The world: every piece of simulation state in one object, plus the step that
// advances it. Nothing in this file touches the canvas, the DOM, or audio; a
// headless run can import this and play with no browser at all.

import { BALANCE } from './balance.js';
import { STATE } from './state.js';
import { Pool } from '../core/pool.js';
import { Grid } from '../core/grid.js';
import { updateEffects, makeParticle, makeRing, makeLabel } from './effects.js';
import { updatePlayer } from './player.js';
import { updateBullets, makeBullet } from './bullets.js';
import { updateEnemyShots, makeEnemyShot } from './enemyshots.js';
import { updateEnemies } from './enemies.js';
import { updateOrbitals } from './orbitals.js';
import { updateNova, makeFront } from './nova.js';
import { updateArc, makeBolt } from './arc.js';
import { updateBeams, makeBeam } from './beams.js';
import { newLance, updateLance } from './lance.js';
import { updateBurn, makeFire } from './burn.js';
import { updateLeech, newLeech } from './leech.js';
import { newOvercharge } from './overcharge.js';
import { newAfterimage, updateAfterimage } from './afterimage.js';
import { newMagnetar, updateMagnetar } from './magnetar.js';
import { newMines, updateMines } from './mines.js';
import { newTether, updateTether } from './tether.js';
import { newTurret, updateTurret } from './turret.js';
import { newShock } from './shock.js';
import { updateShields } from './shields.js';
import { updateFlocks } from './flock.js';
import { updateWaves } from './waves.js';
import { updateShards, makeShard } from './pickups.js';
import { updateAmbient } from './ambient.js';
import { newTally } from './tally.js';
import { firstLevelXp } from './progress.js';
import { newRanks } from './upgrades.js';
import { defaultWeapon } from './weapons.js';

function createWorld() {
  const spec = BALANCE.player;
  return {
    state: STATE.START,
    seed: 0,          // the seed this run is a function of; see core/rng.js
    // Which primary the runs of this world are flying (game/weapons.js). Picked on the
    // title screen until the hangar exists, and deliberately not cleared by a new run:
    // what you picked is what you fly on, the same way the seed is what you get.
    weapon: defaultWeapon(),
    time: 0,          // wall clock of the session, for animations
    elapsed: 0,       // this run's clock
    steps: 0,         // how many fixed steps this run has been asked for (a hit-stop step counts)
    overTimer: 0,     // time since the run ended
    // How long until the wave director is next allowed to spend (game/waves.js).
    spawnTimer: BALANCE.runStart.spawnDelay,
    // How many waves this run has seen. The HUD will want it (PLAN section 4).
    waveNumber: 0,
    newBest: false,
    // Hit-stop: how long the run still has to hold still for, in seconds (0 when
    // nothing is frozen). game/effects.js `hitStop` sets it, `stepWorld` spends it.
    freeze: 0,

    best: 0,
    score: 0,
    xp: 0,
    xpNeed: firstLevelXp(),
    kills: 0,
    shardsCollected: 0,
    shake: 0,
    // The upgrade the run is being built out of, and the choice on the table right
    // now (game/upgrades.js). `offer` is the ids of the cards dealt - empty whenever
    // the run is playing - `pendingLevels` how many levels are still owed a card, and
    // `offerTime` when they came out, which is all the slide-in needs to know.
    upgrades: newRanks(),
    offer: [],
    pendingLevels: 0,
    offerTime: 0,
    // The two asks a run has about its own deal (game/upgrades.js): how many rerolls and
    // banishes it has left, and the lines it has taken out of its deck for good. A mirror
    // of the deal, not a second copy of it: `banished` is read by the draw, which is the
    // only place that has to honour it.
    rerollsLeft: BALANCE.cards.rerolls,
    banishesLeft: BALANCE.cards.banishes,
    banished: [],
    // What this run is being made of, counted as it goes (game/tally.js). A mirror
    // and never a cause: nothing here is read by the simulation itself.
    tally: newTally(),

    // The world the run happens in, and the window it is watched through. The
    // arena is the size of the game; the view is the size of the screen, which is
    // all the simulation ever needs to know about the screen (it is how spawning
    // knows what is off it). The frame loop writes the second on every resize.
    arena: { w: BALANCE.arena.w, h: BALANCE.arena.h },
    view: { w: BALANCE.arena.viewW, h: BALANCE.arena.viewH },

    player: {
      x: 0, y: 0, vx: 0, vy: 0,
      // Where the ship stood when the current step started. Every moving thing in
      // the world keeps a px/py of its own: the renderer paints between the two,
      // which is what makes a 120 Hz simulation look smooth on any display.
      px: 0, py: 0,
      r: spec.hitRadius,
      drawR: spec.drawRadius,   // the ship on screen is bigger than the ship that gets hurt
      maxSpeed: spec.maxSpeed,
      angle: -Math.PI / 2,
      thrust: 0,
      // How close the engines are to dropping their next puff of exhaust. The
      // wake is simulated (game/effects.js `engineTrail`), so it belongs to the
      // ship like its velocity does.
      exhaustTimer: 0,
      hull: spec.hull,
      maxHull: spec.maxHull,    // what the pips can hold; only an elite's heal fills it for now
      invuln: 0,
      // The dash: how far it has left to cover, how long until the next one is
      // allowed, and which way it is going. All three are 0 on a fresh ship.
      dashLeft: 0,
      dashCd: 0,
      dashDirX: 0,
      dashDirY: 0,
      fireTimer: 0,
      level: 1,
    },

    // Bullets and shards churn the most and nobody reads them in order, so they
    // live in pools. The crowd stays a plain array: its separation pass walks
    // pairs by index, which an unordered pool cannot promise.
    bullets: new Pool(makeBullet),
    shards: new Pool(makeShard),
    // The enemy's shots, pooled separately: they travel the other way and only ever
    // look for the ship. See game/enemyshots.js.
    enemyShots: new Pool(makeEnemyShot),
    enemies: [],
    // The beams the snipers have fired (game/beams.js): the light each one left where
    // its damage already went. Pooled and plain like the arc's bolts, because a beam
    // is a record of a flash that has already happened - the light is born having hurt
    // everything standing on it - and all that is left for it to do is fade.
    beams: new Pool(makeBeam),
    // The orbital ring (game/orbitals.js): the angle it has turned to and the drones
    // standing on it, kept exactly as long as the line's rank. A plain array and not a
    // pool because a drone's place in the list *is* its place on the ring.
    orbit: { angle: 0, drones: [] },
    // The nova (game/nova.js): the fronts in the air, the wait until the next one, and
    // the wait it was armed with (which is what the frame paints the tell from). Pooled,
    // because a front is thrown thousands of times over a long run and nothing cares
    // about the order of them.
    nova: { wait: 0, beat: 0, fronts: new Pool(makeFront) },
    // The arc's bolts (game/arc.js): the light each leap of a chain leaves behind. Pooled
    // like the nova's fronts, because a pull throws up to four of them four times a second
    // and nothing cares about the order of them - a bolt is a record of a flash that has
    // already happened, and all that is left for it to do is fade.
    arc: { bolts: new Pool(makeBolt) },
    // What the lance is doing (game/lance.js): the wind-up it is holding, what the beams coming out
    // of it will be worth, the light the last few discharges left behind, and four counters of what
    // the gun has been asked to do. One wind-up at a time and a pool of light, because a beam is a
    // record of a flash that has already happened - born having hurt everything on its line - and
    // all that is left for it to do is fade.
    lance: newLance(),
    // What is on fire (game/burn.js): one fire per body that is alight, each holding on to
    // the body it is eating. Pooled and unordered like everything else that has to be many -
    // and a fire is *not* a field on the enemy because a body that dies leaves the crowd, and
    // the fire has to outlive it by the one step in which it spreads (game/burn.js).
    fires: new Pool(makeFire),
    // What the leech has been paid and what it is holding (game/leech.js): how many bodies it
    // has counted toward the next hull, and whether a hull is being held for the next wound.
    // Two numbers, no list, because a hull is worth one hull whoever paid for it.
    leech: newLeech(),
    // How full the ship's gun is (game/overcharge.js): one number, 0 cold to 1 loaded, and the
    // ring round the hull is drawn straight out of it. Nothing else is remembered, because a
    // charge is only ever worth the one pull that spends it.
    overcharge: newOvercharge(),
    // What the dash has left standing in the arena (game/afterimage.js): the images themselves,
    // and the three numbers the current dash is being paced by. Nothing is remembered about who
    // is chasing what - that is asked of the crowd every step (game/enemies.js) - so this is the
    // whole state of the line.
    afterimage: newAfterimage(),
    // How full the field round the ship is (game/magnetar.js): one number, shards' worth, and the
    // ring round the hull is drawn straight out of it. A crack is over in the step it happens, so
    // there is nothing else to keep - the field remembers who it came round for nobody.
    magnetar: newMagnetar(),
    // What the ship has left lying on the arena behind it (game/mines.js): the mines standing in
    // the road, the wait until the next row falls out, and three counters of what the line has been
    // asked to do and what it got to do with it. Pooled and unordered like everything else that has
    // to be many - a mine is a place, and no two of them care about each other.
    mines: newMines(),
    // What a dash has tied to the arena (game/tether.js): the threads standing between the knots and
    // the ship, how long the fan is still live for, who is standing on it *this step* (a list rebuilt
    // from the crowd every step and held nowhere else, like the grid and the packs), and five counters
    // of what the line was asked to do. Nothing is remembered about which bodies were on a thread -
    // that is asked of the crowd every step (game/enemies.js) - so this is the whole state of the line.
    tether: newTether(),
    // What the ship has set down on the road ahead of it (game/turret.js): the guns standing in the
    // arena, the clock until the next crew is planted, and five counters of what the line was asked to
    // do - including the two only a run can answer, how often a shell came round a body and what share
    // of its standing time a gun had somebody in its sight at all. A gun remembers nothing about what
    // it is aiming at: the lock is asked of the crowd every step, like the grid and the packs.
    turret: newTurret(),
    // What a body that came apart both alight and cold did to the room around it (game/shock.js):
    // three counters of what the synergy was asked to do and what it made of it. A detonation is
    // over in the step it happens and remembers nobody, so this is the whole state of the line -
    // and a mirror as much as a record: nothing in the simulation reads it.
    shock: newShock(),
    // The packs the world is holding (game/flock.js): one small object per swarm that
    // arrived and has somebody still flying in it. Derived state like the grid -
    // rebuilt from the crowd every step, and emptied with it.
    flocks: [],
    // The collision broad phase. Rebuilt from the crowd every step, so it is
    // derived state that no run depends on.
    grid: new Grid(BALANCE.grid.cellSize),
    // The effect lists are pooled for the same reason: a single death sprays 30 sparks.
    particles: new Pool(makeParticle),
    rings: new Pool(makeRing),
    texts: new Pool(makeLabel),
    ambient: [],
  };
}

/** The one world this process plays with. */
export const world = createWorld();

/**
 * The two clocks that are not the run's, so they keep ticking through a hit-stop:
 * the trauma the frame is shaken by, and the guard on restarting after a death -
 * one belongs to the frame being drawn, the other to the player's finger.
 */
function tickFrameClocks(world, dt) {
  world.shake = Math.max(0, world.shake - BALANCE.screen.shakeDecay * dt);
  if (world.state === STATE.OVER) world.overTimer += dt;
}

/**
 * Advance the simulation by `dt` seconds - always `BALANCE.sim.step`, in the
 * browser; the tests are allowed to dial it. `input` is the descriptor from
 * input/index.js. Star layers are updated by the renderer, not here.
 *
 * Every system below writes px/py before it moves something, which is the whole
 * interpolation contract: a position may only change inside a step.
 *
 * Answers whether the step actually simulated anything. A hit-stop step does not,
 * and neither does one of the pause where an upgrade is picked, and the frame loop
 * has to know that: input handed to a step that never happened was never heard, so a
 * dash pressed during either is still waiting when the world wakes up.
 */
export function stepWorld(dt, input) {
  world.steps++;
  world.time += dt;      // the session clock, which the eye animates on and a freeze does not stop

  if (world.freeze > 0) {
    // The freeze is spent here rather than in the frame loop on purpose: the
    // clock has already been paid for these steps, and a timer it did not pay for
    // would come back as a burst of catch-up steps the moment the world thawed.
    world.freeze = Math.max(0, world.freeze - dt);
    tickFrameClocks(world, dt);
    return false;
  }

  updateEffects(world, dt);
  // A level-up is a pause: the effects and the window's own clocks keep running, the
  // arena does not, and the answer is "no step happened" - so a dash pressed while the
  // cards are up waits for the run instead of being thrown away.
  const paused = world.state === STATE.LEVEL;
  if (world.state === STATE.PLAY) stepRun(dt, input);
  else if (!paused) updateAmbient(world, dt);

  tickFrameClocks(world, dt);
  return !paused;
}

function stepRun(dt, input) {
  world.elapsed += dt;

  updatePlayer(world, dt, input);
  updateWaves(world, dt);
  // Who is covering whom, and where each pack's middle is and what beat it is on,
  // before anything is shot at: both are relationships between bodies, so they are
  // worked out again every step rather than kept.
  updateShields(world, dt);
  updateFlocks(world, dt);
  updateBullets(world, dt);
  if (!updateEnemyShots(world, dt)) return;   // a shot ended the run
  if (!updateEnemies(world, dt)) return;   // a contact ended the run
  // First of the things that hurt the crowd afterwards, so a beam pays out where the
  // bodies ended up rather than where the collision grid last saw them (game/beams.js).
  if (!updateBeams(world, dt)) return;   // a beam ended the run
  // Last of the things that hurt the crowd, so a drone bites where a body ended up after
  // walking rather than where the collision grid last saw it (game/orbitals.js).
  updateOrbitals(world, dt);
  // And after the ring for the same reason: a nova front comes over the crowd where the
  // crowd now stands (game/nova.js).
  updateNova(world, dt);
  // And after that for the same reason again: a mine lights for where a body ended up, and its
  // blast is paid out there (game/mines.js).
  updateMines(world, dt);
  // And after that one too: a thread burns where the crowd finished walking, and its near end is the
  // ship as the engines and the dash left it (game/tether.js).
  updateTether(world, dt);
  // And after that one as well: a gun reads the crowd where it ended up, and the shell it throws is
  // walked by game/bullets.js on the next step (game/turret.js).
  updateTurret(world, dt);
  // And after that one again: a lance's line pays out where the crowd finished walking, and its
  // wind-up is wound in step time, so it waits out a level-up and freezes with a hit-stop
  // (game/lance.js).
  if (!updateLance(world, dt)) return;   // a beam ended the run
  // And after all of them, because a fire is the slowest thing here: it bites where every
  // body ended up after the walking and the other damage, and the body it finishes is the
  // one whose fire goes out sideways (game/burn.js).
  if (!updateBurn(world, dt)) return;   // a fire ended the run
  // Last of the things that can change the ship, so a hull the leech is holding is spent on
  // the wound that was actually taken this step and not on one it took before the crowd had
  // finished walking (game/leech.js).
  updateLeech(world);
  // The images go out last, after the crowd has already walked and decided what it was chasing:
  // an image is chased for every step of its two seconds and not one step less, and what is left
  // for it here is to be one step older (game/afterimage.js).
  updateAfterimage(world, dt);
  updateShards(world, dt);
  // Right after the shards, because a shard picked up this step is charged for a crack this step -
  // the mint flying in and the field letting go are one event to the eye (game/magnetar.js).
  updateMagnetar(world);
  // Last, because a bolt's only business is fading and a bolt thrown this step should be
  // seen at full brightness first (game/arc.js).
  updateArc(world, dt);
}
