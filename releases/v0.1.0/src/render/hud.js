// The in-run interface: score, hull, the XP bar, and the frame rate.
// Everything here reads the world; nothing here changes it.

import { PALETTE } from '../core/palette.js';
import { BALANCE } from '../game/balance.js';
import { clamp } from '../core/math.js';
import { world } from '../game/world.js';
import { roundRect } from './shapes.js';
import { view } from './canvas.js';

const PAD = 22;
const FONT_HUGE = '800 30px "Segoe UI", system-ui, sans-serif';
const FONT_LABEL = '600 11px "Segoe UI", system-ui, sans-serif';
const FONT_TINY = '700 10px "Segoe UI", system-ui, sans-serif';
const FONT_FPS = '600 10px "Segoe UI", system-ui, sans-serif';
const GLOW_CYAN = 'rgba(94,247,255,0.8)';
const GLOW_CYAN_SOFT = 'rgba(94,247,255,0.5)';
const GLOW_MINT = 'rgba(88,255,161,0.85)';
const GLOW_MINT_SOFT = 'rgba(88,255,161,0.7)';

function drawHullPips(ctx, x, y) {
  // One pip per hull the ship can hold; upgrades raise the cap later.
  for (let i = 0; i < BALANCE.player.hull; i++) {
    const alive = i < world.player.hull;
    const cx = x - 14 - i * 30;
    ctx.save();
    ctx.translate(cx, y);
    ctx.globalAlpha = alive ? 1 : 0.2;
    ctx.shadowBlur = alive ? 16 : 0;
    ctx.shadowColor = PALETTE.player;
    ctx.strokeStyle = PALETTE.playerLine;
    ctx.fillStyle = alive ? 'rgba(94,247,255,0.28)' : 'rgba(120,185,221,0.1)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-7, 8);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-7, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

export function drawHUD(ctx, fps) {
  const W = view.W;
  const H = view.H;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Score, top-left.
  ctx.shadowBlur = 18;
  ctx.shadowColor = GLOW_CYAN;
  ctx.fillStyle = PALETTE.uiText;
  ctx.font = FONT_HUGE;
  ctx.fillText(world.score.toLocaleString('en-US'), PAD, PAD + 26);

  ctx.shadowBlur = 10;
  ctx.fillStyle = PALETTE.uiDim;
  ctx.font = FONT_LABEL;
  ctx.fillText('BEST ' + Math.max(world.best, world.score).toLocaleString('en-US'), PAD, PAD + 46);

  ctx.fillStyle = PALETTE.uiFaint;
  ctx.font = FONT_LABEL;
  ctx.fillText('TIME ' + Math.floor(world.elapsed) + 's   LV ' + world.player.level, PAD, PAD + 64);

  // Hull, top-right.
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.uiDim;
  ctx.font = FONT_LABEL;
  ctx.shadowBlur = 10;
  ctx.shadowColor = GLOW_CYAN_SOFT;
  ctx.fillText('HULL', W - PAD, PAD + 12);
  drawHullPips(ctx, W - PAD, PAD + 34);
  ctx.textAlign = 'left';

  // XP bar, bottom.
  const bw = Math.min(600, W * 0.66);
  const bh = 12;
  const bx = (W - bw) / 2;
  const by = H - 34;
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(10,22,48,0.75)';
  roundRect(ctx, bx, by, bw, bh, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(94,247,255,0.28)';
  ctx.lineWidth = 1;
  roundRect(ctx, bx, by, bw, bh, 6);
  ctx.stroke();

  const frac = clamp(world.xp / world.xpNeed, 0, 1);
  const filled = Math.max(0, (bw - 4) * frac);
  if (filled > 1) {
    const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, PALETTE.xpBar[0]);
    grad.addColorStop(0.6, PALETTE.xpBar[1]);
    grad.addColorStop(1, PALETTE.xpBar[2]);
    ctx.fillStyle = grad;
    ctx.shadowBlur = 16;
    ctx.shadowColor = GLOW_MINT;
    roundRect(ctx, bx + 2, by + 2, filled, bh - 4, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.xpText;
  ctx.font = FONT_TINY;
  ctx.shadowBlur = 8;
  ctx.shadowColor = GLOW_MINT_SOFT;
  ctx.fillText('LEVEL ' + world.player.level + '   \u00b7   ' + world.xp + '/' + world.xpNeed + ' XP', W / 2, by - 8);
  ctx.textAlign = 'left';
  ctx.shadowBlur = 0;

  // Frame rate, bottom-right, unobtrusive.
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(111,143,176,0.75)';
  ctx.font = FONT_FPS;
  ctx.fillText(Math.round(fps) + ' FPS', W - PAD, H - 28);
  ctx.textAlign = 'left';
  ctx.restore();
}
