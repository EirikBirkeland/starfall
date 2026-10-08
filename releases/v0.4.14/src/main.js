// Boot, the frame loop, and the wiring between the layers. This is the only
// module that is allowed to know about all of them at once.

import { world, stepWorld } from './game/world.js';
import { startRun, resetRun, canStartRun } from './game/run.js';
import { resetAmbient } from './game/ambient.js';
import { takeOffer, describeRanks } from './game/upgrades.js';
import { shotsPerSecond, setWeapon, setWeaponByIndex, weaponName } from './game/weapons.js';
import { STATE } from './game/state.js';
import { BALANCE } from './game/balance.js';
import { createClock } from './core/clock.js';
import { getSeed, setSeed, randomSeed } from './core/rng.js';
import { loadBest } from './core/save.js';
import { initCanvas, resizeCanvas, view } from './render/canvas.js';
import { camera, resolveAim, screenX, screenY, snapCamera } from './render/camera.js';
import { buildStars, updateStars } from './render/background.js';
import { updateNebula } from './render/nebula.js';
import { renderFrame } from './render/renderer.js';
import { cardAt } from './render/cards.js';
import { arrowCount, resetIndicators } from './render/indicators.js';
import { initInput, readInput, consumeInput, mouse } from './input/index.js';
import { initAudio, toggleMuted } from './audio/engine.js';
import { consumeCues } from './audio/sfx.js';
import { initScreens, hideScreens, showGameOver, showWeapon } from './ui/screens.js';

const clock = createClock(BALANCE.sim.step, BALANCE.sim.maxFrameDt);
// The readouts the debug hook reports: how fast the frames are arriving, and
// where between the last step and the next one the frame just drawn sat.
let lastFps = 60;
let lastAlpha = 0;

/** How many gold bodies are standing in the arena. For the F3 overlay (milestone 10). */
function countElites(world) {
  let gold = 0;
  for (const enemy of world.enemies) if (enemy.elite) gold++;
  return gold;
}

/** The seed the address bar asked for, or null when nobody asked. */
function addressSeed() {
  const match = /[?&]seed=(\d+)/.exec(window.location.search);
  return match ? parseInt(match[1], 10) >>> 0 : null;
}

// True while one seed is locked to this visit: the address bar asked for it
// (that is how a run gets shared and replayed), or the headless tools fixed
// one before boot. Unlocked visits pick a fresh seed for every run, so a
// restart never replays the same arena.
let seedIsPinned = false;

/** Start a run if the screen accepts one right now. */
function pressAction() {
  if (!canStartRun(world)) return;
  initAudio();
  // The press that launches a run is not also a dash. Space is both keys, and a
  // run that began with a dash already spent would read as a broken cooldown.
  consumeInput();
  if (!seedIsPinned) world.seed = randomSeed();
  startRun(world);
  hideScreens();
}

function onCanvasPressed() {
  initAudio();
  // While the cards are up the click is an answer, not a shot and not a restart.
  if (world.state === STATE.LEVEL) {
    takeOffer(world, cardAt(mouse.x, mouse.y));
    return;
  }
  if (world.state !== STATE.PLAY) pressAction();
}

/** A number key: over one of the cards on the table, or over the weapon list. */
function onPickCard(number) {
  if (world.state === STATE.LEVEL) {
    takeOffer(world, number - 1);
    return;
  }
  // The same keys, on the two screens that are not a run: the title picks the primary to
  // fly, because there is no hangar yet (PLAN 3.2, milestone 5). The game-over card takes
  // it too, which is what "press 2, press Space, fly the scatter" means. Mid-run the keys
  // are nobody's: a run does not get to swap its gun between two frames.
  if (world.state === STATE.PLAY) return;
  setWeaponByIndex(world, number - 1);
  showWeapon(world.weapon);
}

function onResize() {
  resizeCanvas();
  buildStars();
  // The arena is its own size now, so a resize only tells the simulation how big
  // the window watching it has become - which is all it ever needs to know about
  // the screen: it is how spawning knows what is off the edge of it.
  world.view.w = view.W;
  world.view.h = view.H;
}

function describeRun() {
  return {
    score: world.score,
    best: world.best,
    newBest: world.newBest,
    level: world.player.level,
    kills: world.kills,
    shards: world.shardsCollected,
    seconds: Math.floor(world.elapsed),
    seed: world.seed,
    weapon: weaponName(world),
    build: describeRanks(world),
  };
}

function frame(now) {
  // The simulation is stepped in whole fixed steps; whatever the clock still
  // owes is the moment in between them this frame is drawn at.
  const tick = clock.frame(now);
  lastFps = tick.fps;
  lastAlpha = tick.alpha;
  const stateBefore = world.state;
  const input = readInput();
  // The controls speak in pixels on the glass and the simulation speaks in arena
  // coordinates, so the aim goes through the camera on its way in.
  resolveAim(input);

  // The sky drifts on the frame's clock, not the simulation's: the star layers and
  // the clouds behind them belong to the eye, so neither can move a run.
  updateStars(tick.dt);
  updateNebula(tick.dt);
  // A hit-stop step holds the run still and never hears the controls, so a frame
  // made entirely of frozen steps must leave a pending dash waiting for the thaw.
  let heard = false;
  for (let i = 0; i < tick.steps; i++) {
    if (stepWorld(BALANCE.sim.step, input)) heard = true;
  }
  // Only a frame that actually simulated anything has handed the dash request to
  // the game. On a very quick display a frame can run no step at all, and a press
  // that landed on one of those stays pending rather than being swallowed.
  //
  // A run paused for an upgrade choice is the other case: the pause lasts as long as
  // the player takes to read, so a request made during it is spent rather than kept -
  // a dash that goes off three seconds after the key was pressed is not a gift.
  if (heard || world.state === STATE.LEVEL) consumeInput();

  if (stateBefore !== world.state && world.state === STATE.OVER) showGameOver(describeRun());
  consumeCues(world.state);
  renderFrame(tick, input, mouse);

  requestAnimationFrame(frame);
}

function boot() {
  initScreens();
  showWeapon(world.weapon);
  initCanvas(document.getElementById('game'));
  onResize();
  // Whoever arrives first picks this visit's seed: the address bar, then the
  // headless tools (which fix one before importing this file), and failing both
  // of them the luck of the moment.
  const fromAddress = addressSeed();
  const fromTools = getSeed() !== null;
  if (fromAddress !== null) setSeed(fromAddress);
  else if (!fromTools) setSeed(randomSeed());
  seedIsPinned = fromAddress !== null || fromTools;
  world.seed = getSeed();
  world.best = loadBest();
  resetRun(world);
  resetAmbient(world);
  mouse.x = view.W / 2;
  mouse.y = view.H / 2 - 100;

  initInput(view.canvas, {
    onConfirm: pressAction,
    onPress: onCanvasPressed,
    onPickCard: onPickCard,
    onToggleMute: toggleMuted,
  });
  window.addEventListener('resize', onResize);

  requestAnimationFrame(frame);
}

boot();

// A small hook for debugging and for the headless simulation.
window.STARFALL = {
  STATE: STATE,
  world: world,
  player: world.player,
  enemies: world.enemies,
  /** Where the window is looking (render/camera.js). A live object. */
  camera: camera,
  /** Where an arena point lands on the screen - how a headless bot aims. */
  screenOf: function (x, y) { return { x: screenX(x), y: screenY(y) }; },
  /**
   * Stand a fresh page load's clock up again. Every real play session arrives on
   * a page that has never run a frame, and a headless tool that plays a second
   * run on the same boot has to say the same thing, or the run starts somewhere
   * else in the step cycle and the seed no longer replays it.
   */
  resetClock: function () { clock.reset(); },
  /**
   * Put the camera back on the ship with no lean left over. Same reasoning as
   * resetClock above: a new run is played on a view that has not been looking
   * somewhere else.
   */
  resetCamera: function () { snapCamera(); },
  /**
   * Forget the arrows at the edge of the window. Same reasoning as resetCamera
   * above: a new run is played by a view that has not been pointing anywhere.
   */
  resetIndicators: function () { resetIndicators(); },
  /**
   * Choose the primary (game/weapons.js) the way the title screen's number keys do, for
   * a headless tool that wants to say which gun a run flies. An unknown id throws.
   */
  chooseWeapon: function (id) { return setWeapon(world, id); },
  stats: function () {
    return {
      state: world.state,
      seed: world.seed,
      score: world.score,
      level: world.player.level,
      hull: world.player.hull,
      maxHull: world.player.maxHull,
      dashCd: world.player.dashCd,
      dashLeft: world.player.dashLeft,
      kills: world.kills,
      t: world.elapsed,
      freeze: world.freeze,
      enemies: world.enemies.length,
      elites: countElites(world),
      bullets: world.bullets.count,
      shots: world.enemyShots.count,
      wave: world.waveNumber,
      arrows: arrowCount(),
      shards: world.shards.count,
      gridCells: world.grid.stats().filled,
      parts: world.particles.count,
      collected: world.shardsCollected,
      fireRate: shotsPerSecond(world),
      weapon: world.weapon,
      // The nova (game/nova.js): how many fronts are in the air, and how long until the
      // next one. The F3 overlay wants both, and a test that cannot see a front can at
      // least see that the clock is running.
      fronts: world.nova.fronts.count,
      novaIn: world.nova.wait,
      novaEvery: world.nova.beat,
      // The arc's bolts still being drawn (game/arc.js), which is how a headless run can see
      // that a chain landed at all - it throws no bullets to count.
      bolts: world.arc.bolts.count,
      // The beams still glowing (game/beams.js). A beam is a thing that already happened,
      // so this is how a headless run can see that one went off at all.
      beams: world.beams.count,
      // The leech (game/leech.js): how far the next hull is, and whether one is being held.
      leechKills: world.leech.kills,
      leechHeld: world.leech.held,
      // How full the ship's gun is, 0 cold to 1 loaded (game/overcharge.js). The ring round the
      // hull is painted out of this number, and it is how a headless run can watch a charge come
      // up and be spent instead of having to guess it from the damage.
      charge: world.overcharge.charge,
      fps: lastFps,
      alpha: lastAlpha,
      steps: world.steps,
      xp: world.xp,
      xpNeed: world.xpNeed,
      // The build, and the choice on the table if there is one (game/upgrades.js).
      // The headless bot reads these to pick a card the way a player does.
      pending: world.pendingLevels,
      offer: world.offer.slice(),
      ranks: Object.assign({}, world.upgrades),
    };
  },
};
