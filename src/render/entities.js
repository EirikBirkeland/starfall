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
import { paintR, paintX, paintY } from './interp.js';
import { glowFor, makeStreak, paintGlow, paintStreak } from './glow.js';
import { onScreen } from './camera.js';
import { aimProgress, blastPressure, blastRadius, isAiming, isLunging, isSpitting, lungeReach } from '../game/kinds.js';
import { braceProgress, isBraced, isDiving } from '../game/flock.js';
import { fieldRadius, guardOf, isGuarded, shieldShare, shieldWaiting } from '../game/shields.js';
import { world } from '../game/world.js';

const HIT_FLASH = BALANCE.enemies.hitFlash;

// How the sprites are used. All of it is look, none of it is balance.
const HALO_REACH = 0.6;    // an enemy's halo reaches this much of its glow past its body
const HALO_LIGHT = 0.45;   // how bright that halo lands
const FLASH_LIGHT = 0.85;  // ...and how bright the white one is while it flashes
const SHARD_HALO = 13;
const SHARD_LIGHT = 0.6;   // a shard twinkles, but it must not outshine a shot
const SHARD_BODY = 5.4;    // px across the mint diamond itself
// A large shard (PLAN 3.3's elite drop) is the same thing with more worth in it, so
// it is drawn as the same thing bigger - and the light around it is what you notice
// from across the arena.
const BIG_SHARD_HALO = 21;
const BIG_SHARD_BODY = 9;

// How far past the edge of the window each kind of thing is still drawn: its own
// reach, plus room for the halo around it. The arena is a good deal bigger than
// the window, so most of what the game holds is off screen and never asked about.
const BULLET_REACH = 32;
const SHARD_REACH = 6;         // px of slack on a shard's own halo, for its twinkle

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

// An elite (PLAN 3.3): the same body with a gold outline, and gold twice over - the
// wide soft pass under the thin bright one is how light is painted here (see
// render/glow.js), and the outline is the whole of how a player is told "this one is
// different", so it gets the first stroke. The ring that closes as its hull drains
// is there for the same reason: four times the hull of a thing has to be seen going
// down, or an elite reads as an enemy that cannot be hurt.
const ELITE_GLOW_LIGHT = 0.3;  // how much of its own light the gold carries
const ELITE_SOFT = 5;          // px, the wide pass under the outline
const ELITE_SOFT_LIGHT = 0.35;
const BODY_LINE = 2;           // px, the outline every body gets
const ELITE_HULL = 2;          // px, the ring that drains
const ELITE_HULL_GAP = 9;      // px, how far out it sits
const ELITE_HULL_LIGHT = 0.75;

// How a bomber's death zone is drawn (PLAN 3.3's "telegraphed circle"): a dashed
// ring at exactly the reach of its blast, out of the same number the blast is done
// by, so it cannot promise more or less than the explosion it stands for. The dash
// crawls round and the ring pulses, both faster the less hull the bomber has left -
// the whole warning is the same fact getting louder.
const ZONE_DASH = [9, 8];        // px of dash, px of gap
const ZONE_SOFT = 7;             // px, the wide faint pass under the ring
const ZONE_THIN = 1.5;           // px, the ring itself
const ZONE_ROOM = 30;            // px of slack on the cull test, for the wide pass
const ZONE_CALM = 0.14;          // how a whole one is drawn ...
const ZONE_SHOUT = 0.7;          // ... and how a nearly-dead one is
const ZONE_SOFT_SHARE = 0.4;     // the wide pass sits this far under the thin one
const ZONE_PULSE_CALM = 3;       // rad/s of breathing at rest ...
const ZONE_PULSE_PANIC = 19;     // ... and this much more when it is about to go
const FUSE_LIGHT = 9;            // px of light at a bomber's core, its lit fuse
const FUSE_PULSE_CALM = 4;       // rad/s of breathing at full hull ...
const FUSE_PULSE_PANIC = 16;     // ... and this much more when it is about to go
const FUSE_CALM = 0.25;          // a whole bomber's fuse barely glows; a wounded one strobes

// The shielder's field (PLAN 3.3's "projects a shield onto nearby enemies"), in three
// registers from the largest and faintest to the smallest and brightest: the circle a
// field reaches, the line from a field to every body it is covering, and the bubble
// over a covered body - filled up with how much shield is left in it.
//
// The order is deliberate. The circle is the biggest thing on the floor and says only
// "stand here and my friends are armour", so it is the faintest; the lines are the
// whole answer to "which one do I shoot", and they are drawn like the darter's warning
// line - two passes and a crawl; the bubble is the one you are actually shooting at, so
// it is the brightest of the three. All of it is warm, because a shield is harm standing
// between you and harm, whatever it is doing for the enemy (PLAN section 4).
const FIELD_DASH = [3, 13];      // px of dash, px of gap: a fence, not a wall
const FIELD_CRAWL = 14;          // px/s the fence crawls at, so it is a zone
const FIELD_LINE = 1.2;          // px, the circle itself
const FIELD_SOFT = 5;            // px, the wide faint pass under it
const FIELD_LIGHT = 0.13;        // how bright a field's own circle is
const FIELD_SOFT_SHARE = 0.4;    // the wide pass sits this far under the thin one
const FIELD_ROOM = 26;           // px of slack on the cull test, for the wide pass
const LINK_DASH = [7, 6];        // px of dash, px of gap, on the line to a covered body
const LINK_CRAWL = 46;           // px/s it crawls, and towards the body: the flow
const LINK_SOFT = 5;
const LINK_THIN = 1.2;
const LINK_CALM = 0.12;          // a thin link for a body about to lose its cover ...
const LINK_SHOUT = 0.42;         // ... and a loud one for a body standing behind a wall
const BUBBLE_GAP = 7;            // px of air between a body and the shield over it
const BUBBLE_SOFT = 6;           // px, the wide pass under the bubble
const BUBBLE_THIN = 2;           // px, the bubble itself
const BUBBLE_CALM = 0.16;        // how a shield that is waiting to refill looks ...
const BUBBLE_SHOUT = 0.8;        // ... and how a whole one looks
const BUBBLE_BEAT = 5;           // rad/s of breathing while it waits
const BUBBLE_TRACK = 0.22;       // the ring the bubble grows back along, held this faint
const BUBBLE_SOFT_SHARE = 0.4;   // the wide pass sits this far under the thin one
const BUBBLE_ROOM = 26;          // px of slack on the cull test, for the wide pass
// The shielder's own face: the arc it stands with, and the light of the field leaving
// through it towards whoever is close enough to be covered.
const FACE_GLOW = 9;
const FACE_LIGHT = 0.45;

// The swarm (PLAN 3.3's pack of twenty). A swarmling is seven pixels across, so the
// whole of its look is one long thin dart and one light at its nose: the dart so that
// twenty of them read as a shoal and not as a crowd, the light because a pack that is
// bunching up to dive has to say so out loud (game/flock.js).
const SWARM_SPIKE = 2.1;          // how far the nose reaches out from a swarmling's body
const SWARM_CHARGE = 6;           // px of light at its nose while its pack braces
const SWARM_BLUR_LENGTH = 18;     // px of blur a diving swarmling drags behind it
const SWARM_BLUR_WIDTH = 6;

/**
 * How bright a bomber's death ring is right now, 0..1. It is a function of the
 * bomber's own `blastPressure` and of the frame clock and of nothing else, and it is
 * here rather than inline because "it breathes, and breathes harder the closer it is
 * to going" is the whole warning and therefore worth a test (test/blast-art.test.mjs).
 */
export function zoneLight(enemy, at) {
  const pressure = blastPressure(enemy);
  const beat = 0.5 + 0.5 * Math.sin(at * (ZONE_PULSE_CALM + pressure * ZONE_PULSE_PANIC) + enemy.phase);
  return ZONE_CALM + (ZONE_SHOUT - ZONE_CALM) * pressure * (0.55 + 0.45 * beat);
}

/** The same for the light at its core: never out, strobing faster as it nears. */
export function fuseLight(enemy, at) {
  const pressure = blastPressure(enemy);
  const beat = 0.5 + 0.5 * Math.sin(at * (FUSE_PULSE_CALM + pressure * FUSE_PULSE_PANIC) + enemy.phase);
  return FUSE_CALM + (1 - FUSE_CALM) * beat * (0.4 + 0.6 * pressure);
}

/**
 * How bright the bubble over a body is, 0..1: full and steady while the shield over it
 * is whole, a breathing glimmer while it waits to fill back up, and nothing at all on
 * a body no field is covering. It is built out of the simulation's own two numbers -
 * how much shield is up, and how far through its wait it is - which is what makes the
 * tell and the rule it tells you about one fact twice (test/shield-art.test.mjs).
 */
export function bubbleLight(enemy, at) {
  if (!isGuarded(enemy)) return 0;
  const charge = shieldShare(enemy);
  if (charge >= 1) return BUBBLE_SHOUT;
  const beat = 0.5 + 0.5 * Math.sin(at * BUBBLE_BEAT + enemy.phase);
  return BUBBLE_CALM + (BUBBLE_SHOUT - BUBBLE_CALM) * Math.max(charge, shieldWaiting(enemy) * beat);
}

/** How loud the line to a covered body is, off the same light. */
export function linkLight(enemy, at) {
  const light = bubbleLight(enemy, at);
  return light === 0 ? 0 : LINK_CALM + (LINK_SHOUT - LINK_CALM) * light / BUBBLE_SHOUT;
}

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

/**
 * The shielder's own silhouette: all face and no tail, flat side towards the ship,
 * because a face is what a thing that stands between you and its friends is made of.
 * It always points at the ship (game/kinds.js), so the flat side is never by accident.
 */
function bulwarkPath(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(r * 0.86, r * 0.94);
  ctx.lineTo(-r * 0.42, r * 0.7);
  ctx.lineTo(-r * 0.86, 0);
  ctx.lineTo(-r * 0.42, -r * 0.7);
  ctx.lineTo(r * 0.86, -r * 0.94);
  ctx.lineTo(r * 0.34, 0);
  ctx.closePath();
}

let dartBlur = null;

function dartBlurSprite() {
  if (!dartBlur) dartBlur = makeStreak(PALETTE.telegraphHead, PALETTE.red, DART_BLUR_LENGTH, DART_BLUR_WIDTH);
  return dartBlur;
}

let swarmBlur = null;

function swarmBlurSprite() {
  if (!swarmBlur) swarmBlur = makeStreak(PALETTE.telegraphHead, PALETTE.swarm, SWARM_BLUR_LENGTH, SWARM_BLUR_WIDTH);
  return swarmBlur;
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

/**
 * The death zones: the circle every bomber in sight is standing in, drawn under the
 * crowd so the ship and the bodies stay on top of it. See the ZONE_ constants above
 * for what it looks like; what matters here is that it asks the simulation nothing
 * but `blastRadius` and `blastPressure`, so a kind that does not go off is not drawn
 * at all and one that does is drawn for exactly what it will do.
 */
export function drawBlastZones(ctx, list, alpha) {
  for (let i = 0; i < list.length; i++) {
    const enemy = list[i];
    const radius = blastRadius(enemy);
    if (radius === 0) continue;
    if (!onScreen(enemy.x, enemy.y, radius + ZONE_ROOM)) continue;

    const pressure = blastPressure(enemy);
    const light = zoneLight(enemy, world.time);
    const x = paintX(enemy, alpha);
    const y = paintY(enemy, alpha);

    ctx.save();
    const was = ctx.globalAlpha;
    ctx.setLineDash(ZONE_DASH);
    // The dash crawling round is the only moving part, and it is the part that says
    // "this is a zone and not a decoration". It runs off the frame clock, so it
    // cannot change with anything the simulation does.
    ctx.lineDashOffset = -world.time * (12 + pressure * 40);

    ctx.strokeStyle = PALETTE.blastZone;
    ctx.lineWidth = ZONE_SOFT;
    ctx.globalAlpha = was * light * ZONE_SOFT_SHARE;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = PALETTE.blastFlash;
    ctx.lineWidth = ZONE_THIN;
    ctx.globalAlpha = was * light;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * The fields: the circle every shielder in sight reaches, and the line from each of
 * them to every body it is covering. Floor paint, like a bomber's death zone, so the
 * bodies stay on top of their own cover. A shielder standing near nobody is a circle
 * on its own, and that is the whole of what it has to say at that moment.
 */
export function drawShieldFields(ctx, list, alpha) {
  const was = ctx.globalAlpha;
  let open = false;

  // The dash pattern is only put on the canvas when there is something to draw with
  // it: a frame with no shielder in it asks for nothing at all (test/shield-art).
  for (let i = 0; i < list.length; i++) {
    const field = list[i];
    const radius = fieldRadius(field);
    if (radius === 0) continue;
    if (!onScreen(field.x, field.y, radius + FIELD_ROOM)) continue;
    if (!open) {
      ctx.save();
      ctx.setLineDash(FIELD_DASH);
      // The only moving part, and the same trick the death zone plays: a fence that
      // crawls is a zone, a static one is a decoration.
      ctx.lineDashOffset = -world.time * FIELD_CRAWL;
      open = true;
    }

    const x = paintX(field, alpha);
    const y = paintY(field, alpha);
    ctx.strokeStyle = PALETTE.magenta;
    ctx.lineWidth = FIELD_SOFT;
    ctx.globalAlpha = was * FIELD_LIGHT * FIELD_SOFT_SHARE;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = PALETTE.shieldLight;
    ctx.lineWidth = FIELD_LINE;
    ctx.globalAlpha = was * FIELD_LIGHT;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.stroke();
  }
  if (open) ctx.restore();

  open = false;
  for (let i = 0; i < list.length; i++) {
    const body = list[i];
    const light = linkLight(body, world.time);
    if (light === 0) continue;
    if (!open) {
      ctx.save();
      ctx.setLineDash(LINK_DASH);
      // The dash travels towards the body, which is the way the cover is flowing.
      ctx.lineDashOffset = -world.time * LINK_CRAWL;
      open = true;
    }

    const holder = guardOf(body);
    if (!onScreen(body.x, body.y, BUBBLE_ROOM) && !onScreen(holder.x, holder.y, FIELD_ROOM)) continue;
    // Both ends are interpolated, or a link would jitter one step out of phase with
    // the two bodies it is bolted to.
    const x0 = paintX(body, alpha);
    const y0 = paintY(body, alpha);
    const x1 = paintX(holder, alpha);
    const y1 = paintY(holder, alpha);

    ctx.strokeStyle = PALETTE.magenta;
    ctx.lineWidth = LINK_SOFT;
    ctx.globalAlpha = was * light * FIELD_SOFT_SHARE;
    strokeBetween(ctx, x0, y0, x1, y1);

    ctx.strokeStyle = PALETTE.shieldLight;
    ctx.lineWidth = LINK_THIN;
    ctx.globalAlpha = was * light;
    strokeBetween(ctx, x0, y0, x1, y1);
  }
  if (open) ctx.restore();
}

/**
 * The bubbles: one over every covered body, filled up with how much shield is left in
 * it. Drawn over the crowd, because this is the thing you are shooting at and it must
 * never be hidden by the body behind it.
 */
export function drawShieldBubbles(ctx, list, alpha) {
  const was = ctx.globalAlpha;
  for (let i = 0; i < list.length; i++) {
    const enemy = list[i];
    const light = bubbleLight(enemy, world.time);
    if (light === 0) continue;
    const radius = enemy.r + BUBBLE_GAP;
    if (!onScreen(enemy.x, enemy.y, radius + BUBBLE_ROOM)) continue;

    const x = paintX(enemy, alpha);
    const y = paintY(enemy, alpha);
    const left = shieldShare(enemy);

    // The whole ring first, faint: it is the track the shield grows back along, so a
    // soaked one still shows you how much is on its way back.
    ctx.strokeStyle = PALETTE.shieldTrack;
    ctx.lineWidth = BUBBLE_THIN;
    ctx.globalAlpha = was * light * BUBBLE_TRACK;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.stroke();

    // Then what is left of it, from the top round clockwise, and wide-and-faint under
    // thin-and-bright the way light is painted here (render/glow.js).
    const sweep = TAU * left;
    if (sweep > 0) {
      ctx.strokeStyle = PALETTE.shieldLight;
      ctx.lineWidth = BUBBLE_SOFT;
      ctx.globalAlpha = was * light * BUBBLE_SOFT_SHARE;
      ctx.beginPath();
      ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + sweep);
      ctx.stroke();

      ctx.lineWidth = BUBBLE_THIN;
      ctx.globalAlpha = was * light;
      ctx.beginPath();
      ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + sweep);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = was;
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
  if (enemy.elite) paintGlow(ctx, glowFor(PALETTE.elite, halo), 0, 0, ELITE_GLOW_LIGHT);
  if (flash > 0) paintGlow(ctx, glowFor(PALETTE.white, halo), 0, 0, flash * FLASH_LIGHT);
  ctx.rotate(enemy.rot);
  if (isLunging(enemy)) paintStreak(ctx, dartBlurSprite(), 0, 0, 0, 1, DART_BLUR_LIGHT);
  else if (isDiving(enemy)) paintStreak(ctx, swarmBlurSprite(), 0, 0, 0, 1, DART_BLUR_LIGHT);
  ctx.fillStyle = look.fill;
  if (enemy.type === 'weaver') shipPath(ctx, 0, 0, enemy.r, 0, 1.7);
  else if (enemy.type === 'darter') dartPath(ctx, enemy.r);
  else if (enemy.type === 'shielder') bulwarkPath(ctx, enemy.r);
  else if (enemy.type === 'swarmling') shipPath(ctx, 0, 0, enemy.r, 0, SWARM_SPIKE);
  else polygon(ctx, 0, 0, enemy.r, look.sides, 0);
  ctx.fill();
  if (enemy.elite) {
    ctx.lineWidth = ELITE_SOFT;
    ctx.strokeStyle = withAlpha(PALETTE.elite, ELITE_SOFT_LIGHT);
    ctx.stroke();
  }
  // White while it flashes, gold while it is gold, its own colour the rest of the
  // time - in that order, because the hit has to be the loudest thing about it.
  ctx.lineWidth = BODY_LINE;
  ctx.strokeStyle = flash > 0.4 ? PALETTE.white : (enemy.elite ? PALETTE.elite : look.color);
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
  if (isBraced(enemy)) {
    // Every body of a braced pack lights its nose on the same countdown, and the pack
    // is drawing itself tighter at the same time (game/flock.js). Twenty small lights
    // coming together is the read; the dive that follows is on the line they show.
    paintGlow(ctx, glowFor(PALETTE.telegraphHead, SWARM_CHARGE), enemy.r * 1.5, 0, braceProgress(enemy));
  }
  if (enemy.type === 'bomber') {
    // A lit fuse: the light at its core breathes, and the less hull it has left the
    // faster and brighter it breathes. The ring on the floor says how far the blast
    // reaches; this says how close it is.
    paintGlow(ctx, glowFor(PALETTE.blastFlash, FUSE_LIGHT), 0, 0, fuseLight(enemy, world.time));
  }
  if (enemy.type === 'shielder') {
    // The face of the bulwark, and the light of the field leaving through it. This is
    // the one body whose job is written on its own silhouette, so it is worth the two
    // extra strokes and the one stamp; the circles and the links do the rest of the
    // telling (drawShieldFields).
    ctx.beginPath();
    ctx.arc(0, 0, enemy.r * 0.55, -0.95, 0.95);
    ctx.stroke();
    paintGlow(ctx, glowFor(PALETTE.shieldLight, FACE_GLOW), enemy.r * 0.6, 0, FACE_LIGHT);
  }

  if (enemy.elite && enemy.hp < enemy.maxhp) {
    // Back out of the body's own turn, so the ring starts at the top however the
    // enemy is spinning, and fill in what is left of its hull.
    ctx.rotate(-enemy.rot);
    ctx.lineWidth = ELITE_HULL;
    ctx.strokeStyle = withAlpha(PALETTE.elite, ELITE_HULL_LIGHT);
    ctx.beginPath();
    ctx.arc(0, 0, enemy.r + ELITE_HULL_GAP, -Math.PI / 2,
      -Math.PI / 2 + TAU * clamp(enemy.hp / enemy.maxhp, 0, 1));
    ctx.stroke();
    ctx.rotate(enemy.rot);
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

// The orbital ring (game/orbitals.js). It wears the ship's own colours because it *is*
// the ship's own reach: nothing out there in the arena is cyan except you and your shots
// (PLAN section 4). The track is drawn for the same reason a bomber's zone is - the
// simulation measures a bite from exactly this circle, so the line you see is the line a
// body has to cross (the same deal as `blastRadius` in game/kinds.js).
const ORBIT_TRACK_LIGHT = 0.12;   // how much of the track is visible
const DRONE_HALO = 13;            // px of light around one drone
const DRONE_LIGHT = 0.55;
const DRONE_SIZE = 5;             // px across the little hull
const DRONE_SPIKE = 1.8;          // how pointed it is - a drone is always moving
const DRONE_REACH = 34;           // px of slack on the cull test, for halo and trail
const DRONE_TRAIL = 12;           // px of blur a drone drags along the ring
const DRONE_TRAIL_WIDTH = 6;
const DRONE_TRAIL_LIGHT = 0.45;

let droneTrail = null;

function droneTrailSprite() {
  if (!droneTrail) {
    droneTrail = makeStreak(PALETTE.playerLine, PALETTE.player, DRONE_TRAIL, DRONE_TRAIL_WIDTH);
  }
  return droneTrail;
}

/**
 * The ring and the drones standing on it, painted after the ship: the ship stays the
 * brightest thing in the middle of the screen and everything on its ring is smaller than
 * it (PLAN section 4). A drone's heading is the *tangent* and not the radius, which is the
 * only way the direction the ring turns in is legible at five pixels across.
 */
export function drawOrbitals(ctx, alpha) {
  const ring = world.orbit;
  const count = ring.drones.length;
  if (count === 0) return;

  const spec = BALANCE.upgrades.orbitals;
  const ship = world.player;
  const cx = paintX(ship, alpha);
  const cy = paintY(ship, alpha);

  ctx.lineWidth = 1;
  ctx.strokeStyle = withAlpha(PALETTE.player, ORBIT_TRACK_LIGHT);
  ctx.beginPath();
  ctx.arc(cx, cy, spec.radius, 0, TAU);
  ctx.stroke();

  const trail = droneTrailSprite();
  for (let i = 0; i < count; i++) {
    const drone = ring.drones[i];
    if (!onScreen(drone.x, drone.y, DRONE_REACH)) continue;
    const x = paintX(drone, alpha);
    const y = paintY(drone, alpha);
    const heading = Math.atan2(drone.y - ship.y, drone.x - ship.x) + Math.PI / 2;

    paintStreak(ctx, trail, x, y, heading, 1, DRONE_TRAIL_LIGHT);
    paintGlow(ctx, glowFor(PALETTE.player, DRONE_HALO), x, y, DRONE_LIGHT);
    shipPath(ctx, x, y, DRONE_SIZE, heading, DRONE_SPIKE);
    ctx.fillStyle = PALETTE.playerFill;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = PALETTE.playerLine;
    ctx.stroke();
  }
}

// The nova front (game/nova.js): the ring itself, painted as the edge of the damage and
// nothing more. Two strokes - a wide faint one under a thin bright one, which is how
// every ring in this game glows without a blur - and both of them at the radius the
// simulation has actually come round, so the line the player is shown is never further
// out than the bodies the front has already hurt. It fades as it goes because it is
// spent when it reaches its rim, and it is drawn under the ship so the brightest thing in
// the middle of the frame stays the ship (PLAN pillar 2).
const FRONT_GLOW = 0.2;        // the wide faint pass under the front
const FRONT_GLOW_MIN = 4;      // ...and how wide it is, narrowing as the front weakens
const FRONT_GLOW_SPAN = 9;

export function drawNova(ctx, alpha) {
  const fronts = world.nova.fronts;
  const spec = BALANCE.upgrades.nova;

  for (let i = 0; i < fronts.count; i++) {
    const front = fronts.items[i];
    const r = paintR(front, alpha);
    if (r <= 0 || !onScreen(front.x, front.y, r + FRONT_GLOW_SPAN + 4)) continue;

    // The front's own life is its radius: born at the ship, spent at the rim.
    const t = clamp(1 - r / spec.reach, 0, 1);
    ctx.strokeStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(front.x, front.y, r, 0, TAU);
    ctx.globalAlpha = t * FRONT_GLOW;
    ctx.lineWidth = FRONT_GLOW_MIN + t * FRONT_GLOW_SPAN;
    ctx.stroke();
    ctx.globalAlpha = t * 0.85;
    ctx.lineWidth = 1 + t * 2.5;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
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
    const big = shard.worth > 1;
    const halo = big ? BIG_SHARD_HALO : SHARD_HALO;
    if (!onScreen(shard.x, shard.y, halo + SHARD_REACH)) continue;
    const fade = shard.life < 2 ? clamp(shard.life / 2, 0, 1) : 1;
    const pulse = 0.75 + 0.25 * Math.sin(world.time * 6 + shard.rot);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(paintX(shard, alpha), paintY(shard, alpha));
    paintGlow(ctx, glowFor(PALETTE.shard, halo), 0, 0, pulse * SHARD_LIGHT);
    ctx.rotate(shard.rot);
    ctx.strokeStyle = PALETTE.shardLine;
    ctx.fillStyle = PALETTE.shardFill;
    ctx.lineWidth = big ? 2.2 : 1.6;
    polygon(ctx, 0, 0, big ? BIG_SHARD_BODY : SHARD_BODY, 4, 0);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
