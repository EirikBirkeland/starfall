// The in-run interface: score, hull, the XP bar, and the frame rate.
// Everything here reads the world; nothing here changes it.

import { PALETTE, withAlpha } from '../core/palette.js';
import { clamp } from '../core/math.js';
import { world } from '../game/world.js';
import { roundRect } from './shapes.js';
import { glowFor, paintGlow } from './glow.js';
import { view } from './canvas.js';

const PAD = 22;
const FONT_HUGE = '800 30px "Segoe UI", system-ui, sans-serif';
const FONT_LABEL = '600 11px "Segoe UI", system-ui, sans-serif';
const FONT_TINY = '700 10px "Segoe UI", system-ui, sans-serif';
const FONT_FPS = '600 10px "Segoe UI", system-ui, sans-serif';
const GLOW_CYAN = 'rgba(94,247,255,0.8)';
const GLOW_MINT = 'rgba(88,255,161,0.85)';
// A halo is a wide faint stroke under the letters - the look of a blur for the
// price of one more stroke (see render/glow.js for why nothing blurs here).
const TEXT_HALO = 0.22;
const TEXT_HALO_WIDTH = 5;
const PIP_HALO_RADIUS = 15;

/** The XP bar's gradient, built once per width instead of once per frame. */
let xpGradient = null;
let xpGradientKey = '';

function xpFill(ctx, bx, bw) {
  const key = bx + ':' + bw;
  if (key !== xpGradientKey) {
    xpGradientKey = key;
    xpGradient = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    xpGradient.addColorStop(0, PALETTE.xpBar[0]);
    xpGradient.addColorStop(0.6, PALETTE.xpBar[1]);
    xpGradient.addColorStop(1, PALETTE.xpBar[2]);
  }
  return xpGradient;
}

function haloText(ctx, text, x, y, color, halo) {
  ctx.lineWidth = TEXT_HALO_WIDTH;
  ctx.strokeStyle = withAlpha(halo, TEXT_HALO);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawHullPips(ctx, x, y) {
  // One pip per hull the ship can hold; upgrades raise the cap later, and an elite's
  // heal (game/elite.js) fills one of them back in.
  const ship = world.player;
  const pips = Math.max(ship.maxHull, ship.hull);
  const halo = glowFor(PALETTE.player, PIP_HALO_RADIUS);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < pips; i++) {
    const alive = i < ship.hull;
    const cx = x - 14 - i * 30;
    ctx.save();
    ctx.translate(cx, y);
    if (alive) paintGlow(ctx, halo, 0, 0, 0.5);
    ctx.globalAlpha = alive ? 1 : 0.2;
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
  ctx.globalCompositeOperation = 'source-over';
}

export function drawHUD(ctx, fps) {
  const W = view.W;
  const H = view.H;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Score, top-left.
  ctx.font = FONT_HUGE;
  haloText(ctx, world.score.toLocaleString('en-US'), PAD, PAD + 26, PALETTE.uiText, GLOW_CYAN);

  ctx.font = FONT_LABEL;
  haloText(ctx, 'BEST ' + Math.max(world.best, world.score).toLocaleString('en-US'), PAD, PAD + 46, PALETTE.uiDim, GLOW_CYAN);

  ctx.fillStyle = PALETTE.uiFaint;
  ctx.font = FONT_LABEL;
  ctx.fillText('TIME ' + Math.floor(world.elapsed) + 's   LV ' + world.player.level, PAD, PAD + 64);

  // Hull, top-right.
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.uiDim;
  ctx.font = FONT_LABEL;
  ctx.fillText('HULL', W - PAD, PAD + 12);
  drawHullPips(ctx, W - PAD, PAD + 34);
  ctx.textAlign = 'left';

  // XP bar, bottom.
  const bw = Math.min(600, W * 0.66);
  const bh = 12;
  const bx = (W - bw) / 2;
  const by = H - 34;
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
    // The bar's own glow: the same rounded shape, stroked wide and faint.
    ctx.strokeStyle = withAlpha(PALETTE.xpBar[1], 0.3);
    ctx.lineWidth = 6;
    roundRect(ctx, bx + 2, by + 2, filled, bh - 4, 5);
    ctx.stroke();

    ctx.fillStyle = xpFill(ctx, bx, bw);
    roundRect(ctx, bx + 2, by + 2, filled, bh - 4, 5);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.font = FONT_TINY;
  haloText(ctx, 'LEVEL ' + world.player.level + '   \u00b7   ' + world.xp + '/' + world.xpNeed + ' XP', W / 2, by - 8, PALETTE.xpText, GLOW_MINT);
  ctx.textAlign = 'left';

  // Frame rate, bottom-right, unobtrusive.
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(111,143,176,0.75)';
  ctx.font = FONT_FPS;
  ctx.fillText(Math.round(fps) + ' FPS', W - PAD, H - 28);
  ctx.textAlign = 'left';
  ctx.restore();
}
