// Drawing of the things that are on the battlefield.

import { BALANCE } from '../game/balance.js';
import { PALETTE } from '../core/palette.js';
import { visual } from '../core/rng.js';
import { clamp, TAU } from '../core/math.js';
import { polygon, shipPath } from './shapes.js';
import { paintX, paintY } from './interp.js';
import { world } from '../game/world.js';

const HIT_FLASH = BALANCE.enemies.hitFlash;

function drawEnemy(ctx, enemy, dim, alpha) {
  const look = BALANCE.kinds[enemy.type];
  const flash = enemy.flash > 0 ? clamp(enemy.flash / HIT_FLASH, 0, 1) : 0;

  ctx.save();
  if (dim) ctx.globalAlpha = 0.45;
  ctx.translate(paintX(enemy, alpha), paintY(enemy, alpha));
  ctx.rotate(enemy.rot);
  ctx.shadowBlur = look.glow + flash * 26;
  ctx.shadowColor = look.color;
  ctx.lineWidth = 2;
  ctx.strokeStyle = flash > 0.4 ? PALETTE.white : look.color;
  ctx.fillStyle = look.fill;
  if (enemy.type === 'darter') shipPath(ctx, 0, 0, enemy.r, 0, 1.7);
  else polygon(ctx, 0, 0, enemy.r, look.sides, 0);
  ctx.fill();
  ctx.stroke();

  if (enemy.type === 'tank') {
    ctx.rotate(-enemy.rot * 1.8);
    ctx.beginPath();
    ctx.arc(0, 0, enemy.r * 0.42, 0, TAU);
    ctx.stroke();

    if (enemy.hp < enemy.maxhp) {
      ctx.rotate(enemy.rot * 1.8);
      const frac = clamp(enemy.hp / enemy.maxhp, 0, 1);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2.5;
      ctx.arc(0, 0, enemy.r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawEnemies(ctx, list, dim, alpha) {
  for (let i = 0; i < list.length; i++) drawEnemy(ctx, list[i], dim, alpha);
}

// The dash's own art. Visual constants, so they live here and not in balance.js.
const STREAK_LENGTH = 46;      // how far the blur reaches behind the ship
const STREAK_GHOSTS = 2;       // afterimages in it, and how far apart they sit
const STREAK_GHOST_GAP = 15;
const DASH_RING_GAP = 12;      // the cooldown ring, out from the ship's body
const RING_READY = 'rgba(94,247,255,0.16)';
const RING_WAIT = 'rgba(94,247,255,0.10)';
const RING_FILLING = 'rgba(169,253,255,0.55)';

/** The ship's silhouette, pointing along +x from the origin it is drawn around. */
function shipOutline(ctx, radius) {
  ctx.beginPath();
  ctx.moveTo(radius + 3, 0);
  ctx.lineTo(-radius * 0.72, radius * 0.82);
  ctx.lineTo(-radius * 0.35, 0);
  ctx.lineTo(-radius * 0.72, -radius * 0.82);
  ctx.closePath();
}

/**
 * The streak a dash drags behind it: a tapering blur along the way the ship
 * came, with two afterimages in it. Nothing about it is simulated - it is drawn
 * from where the dash is - so it costs nothing on the frames nobody is dashing.
 */
function drawDashStreak(ctx, ship) {
  const heading = Math.atan2(ship.dashDirY, ship.dashDirX);
  ctx.save();
  ctx.rotate(heading);

  const grad = ctx.createLinearGradient(-STREAK_LENGTH, 0, 0, 0);
  grad.addColorStop(0, 'rgba(94,247,255,0)');
  grad.addColorStop(1, 'rgba(190,252,255,0.45)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, -ship.drawR * 0.6);
  ctx.lineTo(-STREAK_LENGTH, 0);
  ctx.lineTo(0, ship.drawR * 0.6);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = PALETTE.playerFill;
  ctx.strokeStyle = 'rgba(169,253,255,0.4)';
  ctx.lineWidth = 1.5;
  for (let i = 1; i <= STREAK_GHOSTS; i++) {
    ctx.save();
    ctx.translate(-i * STREAK_GHOST_GAP, 0);
    ctx.rotate(ship.angle - heading);
    ctx.globalAlpha = ctx.globalAlpha / (i + 1);
    shipOutline(ctx, ship.drawR);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/**
 * The dash's cooldown, as a ring around the ship (PLAN section 4): a breathing
 * circle once it is ready, and an arc that closes over the wait until then.
 * Drawn in the unrotated frame, so the arc always starts at the top.
 */
function drawDashRing(ctx, ship) {
  const radius = ship.drawR + DASH_RING_GAP;
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1;

  if (ship.dashCd <= 0) {
    ctx.strokeStyle = RING_READY;
    ctx.beginPath();
    ctx.arc(0, 0, radius + Math.sin(world.time * 3) * 2, 0, TAU);
    ctx.stroke();
    return;
  }

  const done = 1 - clamp(ship.dashCd / BALANCE.player.dash.cooldown, 0, 1);
  ctx.strokeStyle = RING_WAIT;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();

  ctx.strokeStyle = RING_FILLING;
  ctx.lineWidth = 2.5;
  ctx.shadowBlur = 10;
  ctx.shadowColor = PALETTE.player;
  ctx.beginPath();
  ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + TAU * done);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

export function drawPlayer(ctx, alpha) {
  const ship = world.player;
  // Only the grace after a hit makes the ship blink. A dash is shown by its
  // streak instead, so that the thing you did not get hit by stays visible.
  const blinking = ship.invuln > 0 && (Math.floor(world.time * 14) % 2 === 0);

  ctx.save();
  ctx.translate(paintX(ship, alpha), paintY(ship, alpha));
  ctx.globalAlpha = blinking ? 0.32 : 1;

  if (ship.dashLeft > 0) drawDashStreak(ctx, ship);
  if (ship.thrust > 0.02) {
    const length = visual.range(10, 20) + ship.thrust * 12;
    ctx.save();
    ctx.rotate(ship.angle + Math.PI);
    ctx.shadowBlur = 20;
    ctx.shadowColor = PALETTE.amber;
    const grad = ctx.createLinearGradient(0, 0, length, 0);
    grad.addColorStop(0, 'rgba(255,240,190,0.9)');
    grad.addColorStop(1, 'rgba(255,94,196,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-6, 5);
    ctx.lineTo(length, 0);
    ctx.lineTo(-6, -5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.rotate(ship.angle);
  ctx.shadowBlur = 20;
  ctx.shadowColor = PALETTE.player;
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETTE.playerLine;
  ctx.fillStyle = PALETTE.playerFill;
  shipOutline(ctx, ship.drawR);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.shadowBlur = 16;
  ctx.shadowColor = PALETTE.white;
  ctx.fillStyle = PALETTE.playerCore;
  ctx.arc(0, 0, 3, 0, TAU);
  ctx.fill();

  ctx.rotate(-ship.angle);
  drawDashRing(ctx, ship);
  ctx.restore();
}

export function drawBullets(ctx, alpha) {
  const bullets = world.bullets.items;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    const tail = 0.035;
    const x = paintX(b, alpha);
    const y = paintY(b, alpha);
    const tx = x - b.vx * tail;
    const ty = y - b.vy * tail;
    const grad = ctx.createLinearGradient(tx, ty, x, y);
    grad.addColorStop(0, 'rgba(94,247,255,0)');
    grad.addColorStop(1, PALETTE.bulletTrail);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 12;
    ctx.shadowColor = PALETTE.bullet;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.fillStyle = PALETTE.bulletCore;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    ctx.beginPath();
    ctx.arc(paintX(b, alpha), paintY(b, alpha), 2.4, 0, TAU);
    ctx.fill();
  }
}

export function drawShards(ctx, alpha) {
  const shards = world.shards.items;
  for (let i = 0; i < shards.length; i++) {
    const shard = shards[i];
    const fade = shard.life < 2 ? clamp(shard.life / 2, 0, 1) : 1;
    const pulse = 0.75 + 0.25 * Math.sin(world.time * 6 + shard.rot);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(paintX(shard, alpha), paintY(shard, alpha));
    ctx.rotate(shard.rot);
    ctx.shadowBlur = 16 * pulse;
    ctx.shadowColor = PALETTE.shard;
    ctx.strokeStyle = PALETTE.shardLine;
    ctx.fillStyle = PALETTE.shardFill;
    ctx.lineWidth = 1.6;
    polygon(ctx, 0, 0, 5.4, 4, 0);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
