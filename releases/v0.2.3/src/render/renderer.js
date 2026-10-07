// One frame on the canvas: background, the world, then the interface.

import { visual } from '../core/rng.js';
import { STATE } from '../game/state.js';
import { world } from '../game/world.js';
import { view } from './canvas.js';
import { drawStars } from './background.js';
import { drawBullets, drawEnemies, drawPlayer, drawShards } from './entities.js';
import { drawParticles, drawRings, drawTexts } from './effects.js';
import { drawHUD } from './hud.js';

/** A shake offset large enough to notice, small enough to never blur the HUD. */
function shakeOffset(amount) {
  if (amount <= 0.1) return { x: 0, y: 0 };
  return { x: visual.range(-amount, amount), y: visual.range(-amount, amount) };
}

/**
 * Paint one frame. `alpha` is how far between the last simulation step and the
 * next one this frame sits (core/clock.js); moving things are drawn between where
 * they were and where they are, see render/interp.js.
 */
export function renderFrame(fps, alpha) {
  const ctx = view.ctx;
  const W = view.W;
  const H = view.H;

  ctx.setTransform(view.DPR, 0, 0, view.DPR, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = view.bgGrad;
  ctx.fillRect(0, 0, W, H);

  const offset = shakeOffset(world.shake);
  ctx.save();
  ctx.translate(offset.x, offset.y);

  drawStars(ctx);
  ctx.globalCompositeOperation = 'lighter';

  if (world.state === STATE.START) {
    drawEnemies(ctx, world.ambient, true, alpha);
    drawShards(ctx, alpha);
  } else {
    drawShards(ctx, alpha);
    drawRings(ctx);
    drawBullets(ctx, alpha);
    drawEnemies(ctx, world.enemies, false, alpha);
    if (world.state === STATE.PLAY) drawPlayer(ctx, alpha);
    drawParticles(ctx, alpha);
    drawTexts(ctx);
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = view.vignette;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  if (world.state === STATE.PLAY || world.state === STATE.OVER) drawHUD(ctx, fps);
}
