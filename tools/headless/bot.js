// A deliberately simple player, shared by tools/simulate.js and the tests.
//
// It does what a distracted human does: point at whatever is closest, shoot at
// it, back off when it gets too close, and drift back to the middle otherwise.
// A smarter bot (dodging bullets, picking upgrades) comes with milestone 3.

import { bootGame } from './harness.js';

/** One 60 Hz frame. The harness drives fixed steps so runs replay exactly. */
export const FRAME_MS = 16.7;

const PANIC_RANGE = 170;      // start running when an enemy is this close
const KEY_THRESHOLD = 0.35;   // how much of the wanted direction a key carries
const ATTRACT_FRAMES = 60;    // frames spent on the title screen first

export function nearestEnemy(game) {
  const ship = game.player;
  let found = null;
  let best = Infinity;
  for (const enemy of game.enemies) {
    const d = (enemy.x - ship.x) * (enemy.x - ship.x) + (enemy.y - ship.y) * (enemy.y - ship.y);
    if (d < best) {
      best = d;
      found = enemy;
    }
  }
  return found ? { enemy: found, distance2: best } : null;
}

/**
 * Point the cursor at an arena point. The camera decides where that lands on the
 * screen, so the bot aims the way a player does - at pixels - instead of assuming
 * the arena and the window are the same size.
 */
function aimAt(game, x, y) {
  const on = game.screenOf(x, y);
  game.moveMouse(on.x, on.y);
}

/** Aim, decide where to run, and press the keys for it. Does not step time. */
export function botFrame(game) {
  const arena = game.world.arena;
  const near = nearestEnemy(game);

  if (near) aimAt(game, near.enemy.x, near.enemy.y);
  else aimAt(game, arena.w / 2, arena.h / 2 - 200);

  const wanted = wantedDirection(game, near);
  game.key('KeyA', wanted.x < -KEY_THRESHOLD);
  game.key('KeyD', wanted.x > KEY_THRESHOLD);
  game.key('KeyW', wanted.y < -KEY_THRESHOLD);
  game.key('KeyS', wanted.y > KEY_THRESHOLD);
}

function wantedDirection(game, near) {
  const ship = game.player;
  const arena = game.world.arena;
  if (!near) return driftToMiddle(game);

  const dist = Math.sqrt(near.distance2) || 1;
  if (dist < PANIC_RANGE) {
    return { x: (ship.x - near.enemy.x) / dist, y: (ship.y - near.enemy.y) / dist };
  }
  return driftToMiddle(game);
}

function driftToMiddle(game) {
  const ship = game.player;
  const arena = game.world.arena;
  return {
    x: (arena.w / 2 - ship.x) / arena.w * 2,
    y: (arena.h / 2 - ship.y) / arena.h * 2,
  };
}

/**
 * Launch a run from the title screen: sit for a moment, then press the fire
 * button, which both starts the run and holds the trigger.
 *
 * It does not touch Space on purpose. Space launches a run *and* dashes, so a bot
 * that held it over the launch would spend a dash it never asked for; the launch
 * press itself is not a dash, whatever key it comes from (see main.js).
 */
export function startBotRun(game) {
  for (let i = 0; i < ATTRACT_FRAMES; i++) game.step(FRAME_MS);
  game.pressMouse(640, 240);
}

/** A cheap hash of everything that matters, to notice a change in behaviour. */
export function fingerprint(game) {
  let h = 2166136261;
  const mix = (n) => {
    h ^= Math.round(n * 100) >>> 0;
    h = Math.imul(h, 16777619);
  };
  const ship = game.player;
  mix(ship.x); mix(ship.y); mix(ship.vx); mix(ship.vy);
  for (const enemy of game.enemies) { mix(enemy.x); mix(enemy.y); mix(enemy.hp); }
  const stats = game.stats();
  mix(stats.bullets); mix(stats.shards); mix(stats.parts);
  mix(stats.score); mix(stats.xp); mix(stats.t);
  return (h >>> 0);
}

/**
 * Play one run on a game that is already sitting on its title screen.
 * Options: { maxSeconds, every, onFrame }
 */
export function playOneRun(game, options) {
  const opts = options || {};
  const maxSeconds = opts.maxSeconds === undefined ? 600 : opts.maxSeconds;
  const frameLimit = Math.ceil(maxSeconds * 1000 / FRAME_MS);
  const drawsBefore = game.drawCalls();

  startBotRun(game);

  let frames = 0;
  let died = false;
  const trace = [];
  while (frames < frameLimit) {
    botFrame(game);
    game.step(FRAME_MS);
    frames++;
    if (opts.onFrame) opts.onFrame(game, frames);
    if (opts.every && frames % opts.every === 0) trace.push(frames + ':' + fingerprint(game));
    if (game.stats().state === game.STATE.OVER) {
      died = true;
      break;
    }
  }

  const draws = game.drawCalls();
  const drawCalls = {};
  for (const key of Object.keys(draws)) drawCalls[key] = draws[key] - drawsBefore[key];

  return {
    died: died,
    seed: game.world.seed,
    frames: frames,
    seconds: +(frames * FRAME_MS / 1000).toFixed(2),
    stats: game.stats(),
    screen: game.screen,
    storage: Object.assign({}, game.storage),
    drawCalls: drawCalls,
    trace: trace,
  };
}

/** Boot a game and play exactly one run on it. */
export async function playRun(options) {
  const game = await bootGame(options);
  const summary = playOneRun(game, options);
  game.stop();
  return summary;
}

/**
 * Boot one game and play several runs on it, one per seed.
 * Options: { seeds: [..], maxSeconds, every }
 */
export async function playRuns(options) {
  const opts = options || {};
  const seeds = opts.seeds || [1];
  const game = await bootGame(Object.assign({}, opts, { seed: seeds[0] }));
  const summaries = [];
  for (let i = 0; i < seeds.length; i++) {
    if (i > 0) await game.resetToTitle(seeds[i]);
    summaries.push(playOneRun(game, opts));
  }
  game.stop();
  return summaries;
}
