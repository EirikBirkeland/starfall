// Boot, the frame loop, and the wiring between the layers. This is the only
// module that is allowed to know about all of them at once.

import { world, stepWorld } from './game/world.js';
import { startRun, resetRun, canStartRun } from './game/run.js';
import { resetAmbient } from './game/ambient.js';
import { STATE } from './game/state.js';
import { BALANCE } from './game/balance.js';
import { clamp } from './core/math.js';
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

/** Start a run if the screen accepts one right now. */
function pressAction() {
  if (!canStartRun(world)) return;
  initAudio();
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
      score: world.score,
      level: world.player.level,
      hull: world.player.hull,
      kills: world.kills,
      t: world.elapsed,
      enemies: world.enemies.length,
      bullets: world.bullets.length,
      shards: world.shards.length,
      parts: world.particles.length,
      collected: world.shardsCollected,
      fireRate: world.player.fireRate,
      fps: fpsAvg,
      xp: world.xp,
      xpNeed: world.xpNeed,
    };
  },
};
