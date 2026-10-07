// One frame on the canvas: the sky, the arena seen through the camera, then the
// interface.

import { visual } from '../core/rng.js';
import { STATE } from '../game/state.js';
import { world } from '../game/world.js';
import { view } from './canvas.js';
import { camera, followCamera } from './camera.js';
import { drawStars } from './background.js';
import { drawNebula } from './nebula.js';
import { drawWalls } from './walls.js';
import { drawBlastZones, drawBullets, drawEnemies, drawEnemyShots, drawPlayer, drawShards, drawShieldBubbles, drawShieldFields, drawTelegraphs } from './entities.js';
import { drawRings, drawSmoke, drawSparks, drawTexts } from './effects.js';
import { drawIndicators } from './indicators.js';
import { drawHUD } from './hud.js';

/** A shake offset large enough to notice, small enough to never blur the HUD. */
function shakeOffset(amount) {
  if (amount <= 0.1) return { x: 0, y: 0 };
  return { x: visual.range(-amount, amount), y: visual.range(-amount, amount) };
}

/**
 * Paint one frame. `tick` is what the clock said this frame is (core/clock.js):
 * its length, how many simulation steps it ran, how far between the last one and
 * the next it sits, and the frame rate. Moving things are drawn between where
 * they were and where they are - see render/interp.js - and so does the camera.
 *
 * `input` is the frame's input descriptor, which the camera leans towards.
 */
export function renderFrame(tick, input) {
  const ctx = view.ctx;
  const W = view.W;
  const H = view.H;

  followCamera(tick.dt, tick.alpha, input);

  ctx.setTransform(view.DPR, 0, 0, view.DPR, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = view.bgGrad;
  ctx.fillRect(0, 0, W, H);

  const offset = shakeOffset(world.shake);
  ctx.save();
  ctx.translate(offset.x, offset.y);

  // The sky: the clouds are the furthest thing on the screen, then the three
  // parallax star layers in front of them. Both are screen space, both shake with
  // the frame like everything else behind the arena.
  drawNebula(ctx);
  drawStars(ctx);

  // From here the canvas is in arena coordinates: one translate, and every draw
  // call after it says where a thing is in the world.
  ctx.translate(-camera.x, -camera.y);
  ctx.globalCompositeOperation = 'lighter';

  if (world.state === STATE.START) {
    drawWalls(ctx);
    drawBlastZones(ctx, world.ambient, tick.alpha);
    drawEnemies(ctx, world.ambient, true, tick.alpha);
    drawShards(ctx, tick.alpha);
  } else {
    drawWalls(ctx);
    // Floor markings go down first: a bomber's death zone is paint on the arena
    // floor, so nothing standing on the floor is ever drawn under it.
    drawBlastZones(ctx, world.enemies, tick.alpha);
    drawShieldFields(ctx, world.enemies, tick.alpha);
    drawShards(ctx, tick.alpha);
    drawSmoke(ctx, tick.alpha);
    drawRings(ctx);
    drawBullets(ctx, tick.alpha);
    // Under the crowd, so a darter sits on top of its own warning line.
    drawTelegraphs(ctx, world.enemies, tick.alpha);
    drawEnemies(ctx, world.enemies, false, tick.alpha);
    drawShieldBubbles(ctx, world.enemies, tick.alpha);
    // Over the crowd: an enemy shot must never be hidden by the thing that fired it.
    drawEnemyShots(ctx, tick.alpha);
    if (world.state === STATE.PLAY) drawPlayer(ctx, tick.alpha);
    drawSparks(ctx, tick.alpha);
    drawTexts(ctx);
  }

  // The vignette belongs to the window, not to the arena, so it waits until the
  // camera and the shake have been put back the way they were found.
  ctx.restore();
  ctx.fillStyle = view.vignette;
  ctx.fillRect(0, 0, W, H);

  // The arrows belong to the glass and not to the arena: out here they stay pinned to
  // the edge they point along however hard the frame shakes, and the vignette cannot
  // dim the one warning that has to be seen in a corner.
  if (world.state === STATE.PLAY) drawIndicators(ctx, tick.dt, tick.alpha);
  if (world.state === STATE.PLAY || world.state === STATE.OVER) drawHUD(ctx, tick.fps);
}
