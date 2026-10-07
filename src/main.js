// Boot, the frame loop, and the wiring between the layers. This is the only
// module that is allowed to know about all of them at once.

import { world, stepWorld } from './game/world.js';
import { startRun, resetRun, canStartRun } from './game/run.js';
import { resetAmbient } from './game/ambient.js';
import { STATE } from './game/state.js';
import { BALANCE } from './game/balance.js';
import { clamp } from './core/math.js';
import { getSeed, setSeed, randomSeed } from './core/rng.js';
import { loadBest } from './core/save.js';
import { initCanvas, resizeCanvas, view } from './render/canvas.js';
import { buildStars, updateStars } from './render/background.js';
import { renderFrame } from './render/renderer.js';
import { initInput, readInput, mouse } from './input/index.js';
import { initAudio, toggleMuted } from './audio/engine.js';
import { consumeCues } from './audio/sfx.js';
import { initScreens, hideScreens, showGameOver } from './ui/screens.js';

let lastFrame = 0;
let fpsAvg = 60;

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
  if (!seedIsPinned) world.seed = randomSeed();
  startRun(world);
  hideScreens();
}

function onCanvasPressed() {
  initAudio();
  if (world.state !== STATE.PLAY) pressAction();
}

function onResize() {
  resizeCanvas();
  buildStars();
  world.arena.w = view.W;
  world.arena.h = view.H;
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
  };
}

function frame(now) {
  if (!lastFrame) lastFrame = now;
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (dt > BALANCE.maxFrameDt) dt = BALANCE.maxFrameDt;   // a background tab, not a hard frame
  if (dt < 0) dt = 0;
  if (dt > 0) fpsAvg += (1 / dt - fpsAvg) * clamp(dt * 2, 0, 1);

  const stateBefore = world.state;
  updateStars(dt);
  stepWorld(dt, readInput());
  if (stateBefore !== world.state && world.state === STATE.OVER) showGameOver(describeRun());
  consumeCues(world.state);
  renderFrame(fpsAvg);

  requestAnimationFrame(frame);
}

function boot() {
  initScreens();
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
  stats: function () {
    return {
      state: world.state,
      seed: world.seed,
      score: world.score,
      level: world.player.level,
      hull: world.player.hull,
      kills: world.kills,
      t: world.elapsed,
      enemies: world.enemies.length,
      bullets: world.bullets.length,
      shards: world.shards.length,
      parts: world.particles.count,
      collected: world.shardsCollected,
      fireRate: world.player.fireRate,
      fps: fpsAvg,
      xp: world.xp,
      xpNeed: world.xpNeed,
    };
  },
};
