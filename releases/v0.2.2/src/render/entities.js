// Drawing of the things that are on the battlefield.
//
// Nothing here asks the canvas for a blur or a gradient: every glow is a sprite
// stamped from render/glow.js, so a frame's cost is what it draws and not how
// many things happen to be shining.

import { BALANCE } from '../game/balance.js';
import { PALETTE, withAlpha } from '../core/palette.js';
import { visual } from '../core/rng.js';
import { clamp, TAU } from '../core/math.js';
import { polygon, shipPath } from './shapes.js';
import { paintX, paintY } from './interp.js';
import { glowFor, makeStreak, paintGlow, paintStreak } from './glow.js';
import { world } from '../game/world.js';

const HIT_FLASH = BALANCE.enemies.hitFlash;

// How the sprites are used. All of it is look, none of it is balance.
const HALO_REACH = 0.6;    // an enemy's halo reaches this much of its glow past its body
const HALO_LIGHT = 0.45;   // how bright that halo lands
const FLASH_LIGHT = 0.85;  // ...and how bright the white one is while it flashes
const SHARD_HALO = 13;
const SHARD_LIGHT = 0.6;   // a shard twinkles, but it must not outshine a shot

function drawEnemy(ctx, enemy, dim, alpha) {
  const look = BALANCE.kinds[enemy.type];
  const flash = enemy.flash > 0 ? clamp(enemy.flash / HIT_FLASH, 0, 1) : 0;
  // A hatchling is the same kind as its parent with a smaller body, so the halo
  // follows the body it has and not the kind it is.
  const halo = enemy.r + look.glow * HALO_REACH;

  ctx.save();
  if (dim) ctx.globalAlpha = 0.45;
  ctx.translate(paintX(enemy, alpha), paintY(enemy, alpha));
  paintGlow(ctx, glowFor(look.color, halo), 0, 0, HALO_LIGHT);
  if (flash > 0) paintGlow(ctx, glowFor(PALETTE.white, halo), 0, 0, flash * FLASH_LIGHT);
  ctx.rotate(enemy.rot);
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
const DASH_STREAK_LIGHT = 0.7; // how bright the blur lands
const RING_READY = PALETTE.dashRingReady;
const RING_WAIT = PALETTE.dashRingWait;
const RING_FILLING = PALETTE.dashRingFilling;
const RING_SOFT = withAlpha(PALETTE.dashRingFilling, 0.22);

// The ship's halo, and its flame. The flame sprite is the longest it ever gets;
// thrust stretches a shorter one out of the same sprite.
const SHIP_HALO = BALANCE.player.drawRadius * 2.3;
const CORE_HALO = 9;
const SHIP_LIGHT = 0.5;
const CORE_LIGHT = 0.85;
const FLAME_LENGTH = 32;
const FLAME_WIDTH = 10;
const FLAME_NOZZLE = 6;        // how far behind the ship's middle the flame starts
const FLAME_MIN = 10;          // px of flame when the engines are barely lit
const FLAME_FLICKER = 10;      // px of random dance on top of that
const FLAME_REACH = 12;        // px more the engines add at full thrust

// A shot's trail shows this much of the second behind it.
const TRAIL_SECONDS = 0.035;
const TRAIL_WIDTH = 5;

let flameSprite = null;        // built on the first frame that needs one, then kept
let dashTrail = null;
let dashTrailRadius = 0;
let bulletTrail = null;

function flameFor() {
  if (!flameSprite) flameSprite = makeStreak(PALETTE.flameTip, PALETTE.flameTail, FLAME_LENGTH, FLAME_WIDTH);
  return flameSprite;
}

function dashTrailFor(ship) {
  if (!dashTrail || dashTrailRadius !== ship.drawR) {
    dashTrailRadius = ship.drawR;
    dashTrail = makeStreak(PALETTE.dashStreak, PALETTE.player, STREAK_LENGTH, ship.drawR * 1.2);
  }
  return dashTrail;
}

function bulletTrailSprite() {
  if (!bulletTrail) {
    bulletTrail = makeStreak(PALETTE.bullet, PALETTE.bulletTrail, BALANCE.bullets.speed * TRAIL_SECONDS, TRAIL_WIDTH);
  }
  return bulletTrail;
}

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
 * The streak a dash drags behind it: a blur along the way the ship came, with two
 * afterimages in it. Nothing about it is simulated - it is drawn from where the
 * dash is - so it costs nothing on the frames nobody is dashing.
 */
function drawDashStreak(ctx, ship) {
  const heading = Math.atan2(ship.dashDirY, ship.dashDirX);
  paintStreak(ctx, dashTrailFor(ship), 0, 0, heading, 1, DASH_STREAK_LIGHT);

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
}

/**
 * The dash's cooldown, as a ring around the ship (PLAN section 4): a breathing
 * circle once it is ready, and an arc that closes over the wait until then.
 * Drawn in the unrotated frame, so the arc always starts at the top.
 */
function drawDashRing(ctx, ship) {
  const radius = ship.drawR + DASH_RING_GAP;
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

  // A wide faint arc under a thin bright one is the glow, without the blur.
  ctx.strokeStyle = RING_SOFT;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + TAU * done);
  ctx.stroke();

  ctx.strokeStyle = RING_FILLING;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + TAU * done);
  ctx.stroke();
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
    const heading = ship.angle + Math.PI;
    const length = visual.range(FLAME_MIN, FLAME_MIN + FLAME_FLICKER) + ship.thrust * FLAME_REACH;
    paintStreak(
      ctx,
      flameFor(),
      Math.cos(heading) * FLAME_NOZZLE,
      Math.sin(heading) * FLAME_NOZZLE,
      heading,
      length / FLAME_LENGTH,
      0.5 + ship.thrust * 0.5,
    );
  }

  paintGlow(ctx, glowFor(PALETTE.player, SHIP_HALO), 0, 0, SHIP_LIGHT);
  ctx.rotate(ship.angle);
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETTE.playerLine;
  ctx.fillStyle = PALETTE.playerFill;
  shipOutline(ctx, ship.drawR);
  ctx.fill();
  ctx.stroke();

  paintGlow(ctx, glowFor(PALETTE.white, CORE_HALO), 0, 0, CORE_LIGHT);
  ctx.beginPath();
  ctx.fillStyle = PALETTE.playerCore;
  ctx.arc(0, 0, 3, 0, TAU);
  ctx.fill();

  ctx.rotate(-ship.angle);
  drawDashRing(ctx, ship);
  ctx.restore();
}

export function drawBullets(ctx, alpha) {
  const bullets = world.bullets.items;
  const trail = bulletTrailSprite();
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    paintStreak(ctx, trail, paintX(b, alpha), paintY(b, alpha), Math.atan2(b.vy, b.vx));
  }

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
    paintGlow(ctx, glowFor(PALETTE.shard, SHARD_HALO), 0, 0, pulse * SHARD_LIGHT);
    ctx.rotate(shard.rot);
    ctx.strokeStyle = PALETTE.shardLine;
    ctx.fillStyle = PALETTE.shardFill;
    ctx.lineWidth = 1.6;
    polygon(ctx, 0, 0, 5.4, 4, 0);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
