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
import { onScreen } from './camera.js';
import { aimProgress, isAiming, isLunging, isSpitting, lungeReach } from '../game/kinds.js';
import { world } from '../game/world.js';

const HIT_FLASH = BALANCE.enemies.hitFlash;

// How the sprites are used. All of it is look, none of it is balance.
const HALO_REACH = 0.6;    // an enemy's halo reaches this much of its glow past its body
const HALO_LIGHT = 0.45;   // how bright that halo lands
const FLASH_LIGHT = 0.85;  // ...and how bright the white one is while it flashes
const SHARD_HALO = 13;
const SHARD_LIGHT = 0.6;   // a shard twinkles, but it must not outshine a shot

// How far past the edge of the window each kind of thing is still drawn: its own
// reach, plus room for the halo around it. The arena is a good deal bigger than
// the window, so most of what the game holds is off screen and never asked about.
const BULLET_REACH = 32;
const SHARD_REACH = SHARD_HALO + 6;

// The darter's own art: the warning line it draws before it commits, and the blur
// it comes in on. Two passes for each glow - a wide soft one under a thin bright
// one - because that is how light is painted here without asking the canvas to
// blur anything (render/glow.js).
const TELEGRAPH_SOFT = 6;      // px, the width of the soft pass under the line
const TELEGRAPH_THIN = 1.5;    // px, the line itself
const TELEGRAPH_HEAD = 7;      // px, the bright dot at its end
const TELEGRAPH_ROOM = 30;     // px of slack on the cull test, for the head
const DART_BLUR_LENGTH = 30;     // px of blur a lunging dart drags behind it
const DART_BLUR_WIDTH = 9;
const DART_BLUR_LIGHT = 0.55;
const DART_CHARGE = 8;         // px of light building at the nose while it aims
const SPIT_CHARGE = 9;         // px of light filling a spitter's mouth
const ENEMY_SHOT_HALO = 8;     // px of light past a shot's own reach

/**
 * The enemy's shots, drawn over the crowd: this is the one thing on the arena that
 * can end the run from a distance, so it is never allowed to hide behind a body.
 * A halo and a hot core per shot, both sized off the shot's own radius: the light
 * reaches a little further than the distance that actually hits you, so a shot is
 * never harder to see than it is to dodge.
 */
export function drawEnemyShots(ctx, alpha) {
  const shots = world.enemyShots.items;
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const halo = shot.r + ENEMY_SHOT_HALO;
    if (!onScreen(shot.x, shot.y, halo + 4)) continue;
    paintGlow(ctx, glowFor(shot.color, halo), paintX(shot, alpha), paintY(shot, alpha), 0.8);
  }

  ctx.fillStyle = PALETTE.enemyShotCore;
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const halo = shot.r + ENEMY_SHOT_HALO;
    if (!onScreen(shot.x, shot.y, halo + 4)) continue;
    ctx.beginPath();
    ctx.arc(paintX(shot, alpha), paintY(shot, alpha), shot.r * 0.7, 0, TAU);
    ctx.fill();
  }
}

/** The dart's own silhouette: all nose and swept wings, and nothing behind them. */
function dartPath(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(r * 2.1, 0);
  ctx.lineTo(r * 0.3, r * 0.6);
  ctx.lineTo(-r * 1.1, r * 0.34);
  ctx.lineTo(-r * 0.5, 0);
  ctx.lineTo(-r * 1.1, -r * 0.34);
  ctx.lineTo(r * 0.3, -r * 0.6);
  ctx.closePath();
}

let dartBlur = null;

function dartBlurSprite() {
  if (!dartBlur) dartBlur = makeStreak(PALETTE.telegraphHead, PALETTE.red, DART_BLUR_LENGTH, DART_BLUR_WIDTH);
  return dartBlur;
}

/** One straight stroke, because the warning line is drawn twice. */
function strokeBetween(ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/**
 * The warning line (PLAN 3.3's telegraph): a thin warm line along the way the
 * darter has already decided to go, reaching out to the length its lunge will
 * actually cover and burning brighter as its countdown runs out. It is drawn out of
 * the same three numbers the simulation moves the enemy by - `lungeReach`, the
 * locked `dirX/dirY`, `aimProgress` - so it can never promise something else.
 */
export function drawTelegraphs(ctx, list, alpha) {
  for (let i = 0; i < list.length; i++) {
    const enemy = list[i];
    if (!isAiming(enemy)) continue;
    const reach = lungeReach(enemy);
    if (!onScreen(enemy.x, enemy.y, reach + TELEGRAPH_ROOM)) continue;

    const done = aimProgress(enemy);
    // It reaches out to its full length early and then only brightens, so there is
    // a moment of "that is where it is going" before it commits to it.
    const length = reach * Math.min(1, 0.35 + done);
    const x = paintX(enemy, alpha);
    const y = paintY(enemy, alpha);
    const tipX = x + enemy.dirX * length;
    const tipY = y + enemy.dirY * length;

    const was = ctx.globalAlpha;
    ctx.strokeStyle = PALETTE.red;
    ctx.lineWidth = TELEGRAPH_SOFT;
    ctx.globalAlpha = was * (0.1 + 0.28 * done);
    strokeBetween(ctx, x, y, tipX, tipY);

    ctx.strokeStyle = PALETTE.telegraph;
    ctx.lineWidth = TELEGRAPH_THIN;
    ctx.globalAlpha = was * (0.35 + 0.65 * done);
    strokeBetween(ctx, x, y, tipX, tipY);
    ctx.globalAlpha = was;

    paintGlow(ctx, glowFor(PALETTE.telegraphHead, TELEGRAPH_HEAD), tipX, tipY, 0.2 + 0.8 * done);
  }
}

function drawEnemy(ctx, enemy, dim, alpha) {
  // A kind's look, as opposed to its behaviour: game/kinds.js says how a kind
  // moves, this says what it is made of. A new kind that is not a plain polygon
  // gets a branch here as well as its row there.
  const look = BALANCE.kinds[enemy.type];
  const flash = enemy.flash > 0 ? clamp(enemy.flash / HIT_FLASH, 0, 1) : 0;
  // A hatchling is the same kind as its parent with a smaller body, so the halo
  // follows the body it has and not the kind it is.
  const halo = enemy.r + look.glow * HALO_REACH;
  if (!onScreen(enemy.x, enemy.y, halo + 4)) return;

  ctx.save();
  if (dim) ctx.globalAlpha = 0.45;
  ctx.translate(paintX(enemy, alpha), paintY(enemy, alpha));
  paintGlow(ctx, glowFor(look.color, halo), 0, 0, HALO_LIGHT);
  if (flash > 0) paintGlow(ctx, glowFor(PALETTE.white, halo), 0, 0, flash * FLASH_LIGHT);
  ctx.rotate(enemy.rot);
  if (isLunging(enemy)) paintStreak(ctx, dartBlurSprite(), 0, 0, 0, 1, DART_BLUR_LIGHT);
  ctx.lineWidth = 2;
  ctx.strokeStyle = flash > 0.4 ? PALETTE.white : look.color;
  ctx.fillStyle = look.fill;
  if (enemy.type === 'weaver') shipPath(ctx, 0, 0, enemy.r, 0, 1.7);
  else if (enemy.type === 'darter') dartPath(ctx, enemy.r);
  else polygon(ctx, 0, 0, enemy.r, look.sides, 0);
  ctx.fill();
  ctx.stroke();
  if (isAiming(enemy)) {
    // Only a darter has an aim to hold, so this never asks which kind it is.
    // The last thing to arrive is the light at its nose, which is where the line
    // it is drawing starts.
    paintGlow(ctx, glowFor(PALETTE.telegraphHead, DART_CHARGE), enemy.r * 1.6, 0, aimProgress(enemy));
  }
  if (isSpitting(enemy)) {
    // A spitter's whole warning: its mouth, pointed at you, filling with light over
    // the wind-up. It starts at nothing, so the change is the tell.
    paintGlow(ctx, glowFor(PALETTE.spitCharge, SPIT_CHARGE), enemy.r * 1.3, 0, aimProgress(enemy));
  }

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
    if (!onScreen(b.x, b.y, BULLET_REACH)) continue;
    paintStreak(ctx, trail, paintX(b, alpha), paintY(b, alpha), Math.atan2(b.vy, b.vx));
  }

  ctx.fillStyle = PALETTE.bulletCore;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (!onScreen(b.x, b.y, BULLET_REACH)) continue;
    ctx.beginPath();
    ctx.arc(paintX(b, alpha), paintY(b, alpha), 2.4, 0, TAU);
    ctx.fill();
  }
}

export function drawShards(ctx, alpha) {
  const shards = world.shards.items;
  for (let i = 0; i < shards.length; i++) {
    const shard = shards[i];
    if (!onScreen(shard.x, shard.y, SHARD_REACH)) continue;
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
