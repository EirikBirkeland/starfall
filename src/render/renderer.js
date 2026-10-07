// One frame on the canvas: background, the world, then the interface.

import { rand } from '../core/math.js';
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
  return { x: rand(-amount, amount), y: rand(-amount, amount) };
}

export function renderFrame(fps) {
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
    drawEnemies(ctx, world.ambient, true);
    drawShards(ctx);
  } else {
    drawShards(ctx);
    drawRings(ctx);
    drawBullets(ctx);
    drawEnemies(ctx, world.enemies, false);
    if (world.state === STATE.PLAY) drawPlayer(ctx);
    drawParticles(ctx);
    drawTexts(ctx);
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.fillStyle = view.vignette;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  if (world.state === STATE.PLAY || world.state === STATE.OVER) drawHUD(ctx, fps);
}
