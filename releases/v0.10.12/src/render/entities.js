// Drawing of the things that are on the battlefield.
//
// Nothing here asks the canvas for a blur or a gradient: every glow is a sprite
// stamped from render/glow.js, so a frame's cost is what it draws and not how
// many things happen to be shining.

import { BALANCE } from '../game/balance.js';
import { PALETTE, withAlpha } from '../core/palette.js';
import { visual } from '../core/rng.js';
import { clamp, TAU, hypot } from '../core/math.js';
import { polygon, shipPath, shipShape } from './shapes.js';
import { paintR, paintX, paintY } from './interp.js';
import { glowFor, makeStreak, paintGlow, paintStreak } from './glow.js';
import { hitFlash } from './flash.js';
import { onScreen } from './camera.js';
import {
  aimProgress, beamHalfWidth, blastPressure, blastRadius, isAiming, isLocking, isLunging,
  isSpitting, lungeReach,
} from '../game/kinds.js';
import {
  isBossBody, isBossPart, armedCount, bossTint, callAngle, callBody, callCount, callProgress,
  callStand, callStep, gapAngle, gapEnd, gapHalf, gapProgress, gapStart, spokeAngle, spokeCount,
  spokeHalf, spokeProgress, spokeStep,
} from '../game/bosses.js';
import { drawBoss } from './boss.js';
import { frostOf, isFrozen } from '../game/chill.js';
import { beamReach } from '../game/beams.js';
import { braceProgress, isBraced, isDiving } from '../game/flock.js';
import { fieldRadius, guardOf, isGuarded, shieldShare, shieldWaiting } from '../game/shields.js';
import { chargeOf, hasOvercharge, isLoaded } from '../game/overcharge.js';
// The field's own two readings, under names that do not collide with the gun's charge above - both
// are "how full is the thing round this ship", and the whole point of the two rings is that they
// are not the same thing (game/magnetar.js, game/overcharge.js).
import { chargeOf as fieldChargeOf, hasMagnetar, isPrimed as fieldPrimed } from '../game/magnetar.js';
import { fadingBy } from '../game/afterimage.js';
import { armingOf, fadingOf, fusingOf } from '../game/mines.js';
import { lettingGoOf, pulsingBy } from '../game/tether.js';
import { isWinding, windOf } from '../game/lance.js';
import { aimedOf, fadingOf as turretFadingOf, reloadingOf } from '../game/turret.js';
import { world } from '../game/world.js';

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

// How a sniper's eye is lit - the one part of the kind's own body that has anything to
// say, so it says the same thing the band across the arena says.
const EYE_LIGHT = 9;            // px of light inside the eye
const EYE_CALM = 0.18;          // at rest it is a barely lit pupil ...
const EYE_BREATH = 3;           // rad/s of breathing, so a body that never moves lives
const EYE_BREATH_SHARE = 0.14;
const EYE_LOCK = 0.7;           // ... and the lock's own countdown is piled on top

/**
 * How bright a sniper's eye is, 0..1: a dim pupil while it swings about, breathing, and
 * the lock's own countdown poured on top of it - so the eye and the band it is drawing
 * are the same number getting louder, out of `aimProgress` (game/kinds.js).
 */
export function lockLight(enemy, at) {
  const breath = 0.5 + 0.5 * Math.sin(at * EYE_BREATH + enemy.phase);
  const lock = isLocking(enemy) ? aimProgress(enemy) : 0;
  return clamp(EYE_CALM + breath * EYE_BREATH_SHARE + lock * EYE_LOCK, 0, 1);
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

/**
 * The sniper's own silhouette: an eye, pointed where it is pointing. It is the only
 * body in the game that never moves, so the shape is the whole of how it is recognised -
 * and an eye is the honest shape for a thing whose entire being is a line of sight.
 */
function lensPath(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(r * 1.5, 0);
  ctx.quadraticCurveTo(0, r, -r * 1.5, 0);
  ctx.quadraticCurveTo(0, -r, r * 1.5, 0);
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

// The sniper's lock and its beam (game/beams.js, PLAN 3.3's "long telegraphed laser
// across the whole arena").
//
// The whole of it is one promise drawn twice: the lock is the band of harm before it
// hurts, the beam is the same band after it did, and the widest pass of both is drawn
// at exactly `beamHalfWidth` doubled - the distance off the axis at which a centre is
// hurt - so the light never claims more ground than the damage and never less. Three
// passes make a band read as a band and not as a line: the full width of it faint, a
// narrower one inside that hotter, and a white axis down the middle. That is how this
// game glows without asking the canvas to blur anything (render/glow.js).
const BAND_FILL = 0.3;         // how bright the full width of the band is at full power
const BAND_CORE_SHARE = 0.34;  // the hot middle, as a share of the whole width
const BAND_HOT = 0.6;          // ... and how bright it is
const BAND_AXIS = 1.6;         // px, the white line down the middle
const LOCK_CALM = 0.22;        // the band the instant a lock begins ...
const LOCK_SHOUT = 1;          // ... and the instant before it fires
const LOCK_HEAD = 11;          // px of light building in the eye it is being drawn from
const BEAM_HEAD = 16;          // px of light left at the eye once it has fired

// The door a boss leaves in its bullet ring (game/bosses.js): a wedge of cool light, a faint fill
// under two edges under the arc that closes it off, brightened by the same countdown the spokes
// are. Cool, and the only cool thing a boss draws, because it is the one place in its attack that
// is not about to hurt you (PALETTE.bossGap).
const DOOR_FILL = 0.07;
const DOOR_EDGE = 2;            // px, the two lines that make a wedge read at any angle
const DOOR_EDGE_LIGHT = 0.5;
const DOOR_RIM = 3;             // px, the arc across its far end: this far, and no further
const DOOR_RIM_LIGHT = 0.35;
const ROUTE_LIGHT = 0.45;       // the way a walking door has to travel, against the door itself:
                                // a place to read, and not the place to stand

// The call's marks (game/bosses.js `windCall`): a tick out of the hoop, a pool of light where the
// body will be, and a ring the size of it. Sizes are fixed px, not shares of the ring's radius,
// because the glow holder is memoised on its radius (render/glow.js) and a mark that grew with
// the boss would bake a sprite per frame.
const CALL_TICK = 2;            // px, the line from the rim to the mark
const CALL_TICK_LIGHT = 0.5;
const CALL_GLOW = 1.6;          // the mark's pool of light, as a multiple of the body's own radius
const CALL_LIGHT = 0.5;
const CALL_EDGE = 2;
const CALL_EDGE_LIGHT = 0.8;

/**
 * One band of harm across the arena, from (x0, y0) to (x1, y1), `half` px each side of
 * the axis, at `light` of its full brightness, in `edge` with `core` down the middle.
 *
 * Three callers own a band: the sniper's lock and beam, which are the crowd's, the tether,
 * which is the ship's (game/tether.js), and a boss's spokes, which are the arena's
 * (game/bosses.js). The three passes are the same shape whatever colour they are - a band
 * reads as a band and not as a line only if the full width is painted faint under a hot
 * middle under a nearly white axis - which is why there is one function here and not three.
 */
export function bandPasses(ctx, x0, y0, x1, y1, half, light, edge, core) {
  const was = ctx.globalAlpha;
  ctx.strokeStyle = edge;
  ctx.lineWidth = half * 2;
  ctx.globalAlpha = was * light * BAND_FILL;
  strokeBetween(ctx, x0, y0, x1, y1);

  ctx.lineWidth = half * BAND_CORE_SHARE;
  ctx.globalAlpha = was * light * BAND_HOT;
  strokeBetween(ctx, x0, y0, x1, y1);

  ctx.strokeStyle = core;
  ctx.lineWidth = BAND_AXIS;
  ctx.globalAlpha = was * light;
  strokeBetween(ctx, x0, y0, x1, y1);
  ctx.globalAlpha = was;
}

/**
 * The locks: every sniper on the glass that is holding one, drawn as the band its beam
 * will be - which is the whole of the telegraph, edge to edge, across the arena its
 * beam will cross. Painted under the crowd, like a darter's line and a bomber's circle,
 * so nothing standing in the way of a promise hides it.
 *
 * Note what is *not* culled with the body: a band that reaches the whole arena is on the
 * glass even when the eye that drew it is not, and a player who cannot see the sniper
 * is still entitled to see the line it is about to fire down.
 */
export function drawLocks(ctx, list, alpha) {
  for (let i = 0; i < list.length; i++) {
    const enemy = list[i];
    const half = beamHalfWidth(enemy);
    if (half === 0 || !isLocking(enemy)) continue;

    const x = paintX(enemy, alpha);
    const y = paintY(enemy, alpha);
    const ends = beamReach(world, x, y, enemy.dirX, enemy.dirY);
    const x0 = x - enemy.dirX * ends.back;
    const y0 = y - enemy.dirY * ends.back;
    const x1 = x + enemy.dirX * ends.fore;
    const y1 = y + enemy.dirY * ends.fore;
    if (!onScreen((x0 + x1) / 2, (y0 + y1) / 2, hypot(x1 - x0, y1 - y0) / 2)) continue;

    const light = LOCK_CALM + (LOCK_SHOUT - LOCK_CALM) * aimProgress(enemy);
    bandPasses(ctx, x0, y0, x1, y1, half, light, PALETTE.beamEdge, PALETTE.beamCore);
    paintGlow(ctx, glowFor(PALETTE.beamCore, LOCK_HEAD), x, y, light);
  }
}

/**
 * Everything a boss is promising right now, which is one of three things: the spokes it is holding,
 * the door it is arming a ring of shots with, or the marks of a call it is filling. All three are
 * drawn here because all three are floor markings under the crowd, and none of them may be hidden
 * by a body standing in the way of it.
 *
 * The spokes: one band each, out of the hub to whatever wall stops it, drawn at exactly the width
 * its beam is paid out at (game/bosses.js `spokeHalf` is the one number both read) and reaching
 * exactly as far as that beam will reach. The same two colours and the same countdown as a
 * sniper's lock, because it is the same promise and a player should not have to learn a second
 * language for a bigger enemy.
 *
 * Culled per band and not per body: a band that reaches the far wall is on the glass whatever side
 * of it the ring happens to be standing on.
 */
export function drawBossLocks(ctx, boss, alpha) {
  const enemy = boss.enemy;
  // The warning is already up and the body is not: `world.boss` is the whole fight, and for
  // `warn.time` of it there is nothing in the arena to draw a promise round (game/bosses.js).
  if (enemy === null) return;

  const x = paintX(enemy, alpha);
  const y = paintY(enemy, alpha);
  drawSpokes(ctx, boss, enemy, x, y);
  drawTheDoor(ctx, boss, x, y);
  drawTheCall(ctx, boss, enemy, x, y);
}

function drawSpokes(ctx, boss, enemy, x, y) {
  const count = spokeCount(boss);
  if (count === 0) return;

  const light = LOCK_CALM + (LOCK_SHOUT - LOCK_CALM) * spokeProgress(boss);
  const half = spokeHalf(boss);
  const step = spokeStep(boss);

  for (let i = 0; i < count; i++) {
    const angle = spokeAngle(boss) + i * step;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const reach = beamReach(world, x, y, dirX, dirY).fore;
    const x1 = x + dirX * reach;
    const y1 = y + dirY * reach;
    if (!onScreen((x + x1) / 2, (y + y1) / 2, reach / 2 + half)) continue;

    bandPasses(ctx, x, y, x1, y1, half, light, PALETTE.beamEdge, PALETTE.beamCore);
  }

  // The hub they are drawn from, lit by the same countdown, so the thing that is about to fire
  // can still be found when the ring is behind a crowd.
  paintGlow(ctx, glowFor(PALETTE.beamCore, LOCK_HEAD), x, y, light);
}

/**
 * The door it is arming a bullet ring with: the wedge that will be empty, lit while it is being
 * promised (game/bosses.js `windRing`). It reaches as far as the room lets it along each of its
 * two edges and no further - a wedge that poked through a wall would be promising a place the
 * ship cannot get to, and the walls are the cage (game/field.js).
 *
 * Two things are painted from it, and they are the two halves of one promise, the same pair the
 * blades make with their fan (render/arms.js): the **route**, the whole of the way a walking door
 * travels, lit faint the instant the wind-up starts, and the **door** itself walking down it. A
 * door that does not walk has no route to speak of - the two come out the same wedge - and then the
 * faint pass is not made at all, which is what keeps every door in the game before the Eclipse's
 * last phase exactly the picture it always was.
 *
 * Nothing here is the shots' own doing: the same numbers the ring is thrown from are the numbers
 * the light is drawn from, which is the only way the door shown is the door that arrives.
 */
function drawTheDoor(ctx, boss, x, y) {
  const route = doorWedge(boss, x, y);
  if (route === null) return;
  const door = doorNow(boss, x, y);
  if (door === null) return;
  if (!onScreen(x, y, Math.max(route.reach, door.reach))) return;

  const light = LOCK_CALM + (LOCK_SHOUT - LOCK_CALM) * gapProgress(boss);

  // Only when there is more route than door: the walk is what is being promised, so the walk is
  // what is on the glass, end to end, from the first step and not the last.
  if (route.to - route.from > door.to - door.from + 1e-9) {
    paintWedge(ctx, x, y, route, light * ROUTE_LIGHT);
  }
  paintWedge(ctx, x, y, door, light);
}

/**
 * The door a fight is holding open, as a wedge: the two bearings the promise runs between, and how
 * far out they may go before a wall is in the way (a wedge that poked through a wall would be
 * promising a place the ship cannot get to).
 *
 * This is the *widest* answer - the whole route a walking door travels, widened by the door - and
 * it contains the door where it stands (render/entities.js `doorNow`). Two painters ask it and may
 * never disagree about the answer. One is `drawTheDoor`, which lights the promise; the other is
 * render/darkness.js, which leaves the night out of it, because a door that the dark has eaten is
 * not a promise at all and the dark is no excuse to break `bosses.telegraphMin`
 * (game/balance.js `bosses.dark`).
 *
 * Null when nothing is being armed: there is no door between shells, and the bearings the next one
 * will be opened on are not chosen until it starts being wound.
 */
export function doorWedge(boss, x, y) {
  if (armedCount(boss) === 0) return null;
  const half = gapHalf(boss);
  return wedgeToTheRoom(x, y, Math.min(gapStart(boss), gapEnd(boss)) - half,
    Math.max(gapStart(boss), gapEnd(boss)) + half);
}

/** The door where it stands this very step, as opposed to the whole of the route it promised. */
export function doorNow(boss, x, y) {
  if (armedCount(boss) === 0) return null;
  const half = gapHalf(boss);
  return wedgeToTheRoom(x, y, gapAngle(boss) - half, gapAngle(boss) + half);
}

/** One wedge's own reach: the two bearings it runs between, clipped by whatever wall is in front. */
function wedgeToTheRoom(x, y, from, to) {
  const near = beamReach(world, x, y, Math.cos(from), Math.sin(from)).fore;
  const far = beamReach(world, x, y, Math.cos(to), Math.sin(to)).fore;
  const reach = Math.min(near, far);
  if (!Number.isFinite(reach) || reach <= 0) return null;
  return { from: from, to: to, reach: reach };
}

/**
 * One wedge, lit: a fill, two radial edges and an arc across the far end. Both halves of the door's
 * promise are painted with this one function and only its strength differs, so the route cannot be
 * drawn at a different shape from the door travelling down it.
 */
function paintWedge(ctx, x, y, wedge, light) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, wedge.reach, wedge.from, wedge.to);
  ctx.closePath();
  ctx.fillStyle = withAlpha(PALETTE.bossGap, DOOR_FILL * light);
  ctx.fill();

  ctx.lineWidth = DOOR_EDGE;
  ctx.strokeStyle = withAlpha(PALETTE.bossGapLine, DOOR_EDGE_LIGHT * light);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(wedge.from) * wedge.reach, y + Math.sin(wedge.from) * wedge.reach);
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(wedge.to) * wedge.reach, y + Math.sin(wedge.to) * wedge.reach);
  ctx.stroke();

  ctx.lineWidth = DOOR_RIM;
  ctx.strokeStyle = withAlpha(PALETTE.bossGap, DOOR_RIM_LIGHT * light);
  ctx.beginPath();
  ctx.arc(x, y, wedge.reach, wedge.from, wedge.to);
  ctx.stroke();
}

/**
 * The call it is making: one mark on the rim per body it is about to send (game/bosses.js
 * `windCall`), fanned across the half of the hoop turned away from the ship, at exactly the
 * stand-off the bodies are born at and along exactly the bearings they come out of.
 *
 * It is drawn under the crowd for the same reason the door is - it is a floor marking, a place
 * where something will be - but it wears the phase's own warm light and not the door's cool one,
 * because it is the opposite promise: the door is where to stand and this is where not to have
 * stood when the light finishes filling up.
 */
function drawTheCall(ctx, boss, enemy, x, y) {
  const count = callCount(boss);
  if (count === 0) return;

  const light = LOCK_CALM + (LOCK_SHOUT - LOCK_CALM) * callProgress(boss);
  const tint = bossTint(boss);
  const body = callBody(boss);
  const middle = (count - 1) / 2;
  const near = enemy.r;
  const far = enemy.r + callStand(boss);

  for (let i = 0; i < count; i++) {
    const angle = callAngle(boss) + (i - middle) * callStep(boss);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const mx = x + dx * far;
    const my = y + dy * far;
    if (!onScreen(mx, my, body * CALL_GLOW)) continue;

    // A line out of the hoop to the mark - the way the body is coming - and then the mark itself,
    // a ring the size of the body that will fill it, both of them brighter as the light runs out.
    ctx.beginPath();
    ctx.moveTo(x + dx * near, y + dy * near);
    ctx.lineTo(mx - dx * body, my - dy * body);
    ctx.lineWidth = CALL_TICK;
    ctx.strokeStyle = withAlpha(tint, CALL_TICK_LIGHT * light);
    ctx.stroke();

    paintGlow(ctx, glowFor(tint, body * CALL_GLOW), mx, my, CALL_LIGHT * light);
    ctx.beginPath();
    ctx.arc(mx, my, body, 0, TAU);
    ctx.lineWidth = CALL_EDGE;
    ctx.strokeStyle = withAlpha(tint, CALL_EDGE_LIGHT * light);
    ctx.stroke();
  }
}

// The lance's own two halves (game/lance.js): the band the gun is aiming while it winds up, and the
// light of the band that went off. One promise drawn twice, exactly as a sniper's lock and its beam
// are, and the widest pass of both is `beam.halfWidth` doubled - the distance off the axis at which
// a centre is hurt - so the line you were shown is the line that hurt, edge for edge.
//
// What is different is who owns it. This is the ship's own gun, so it wears the ship's own colours
// the way the tether, the orbitals and the turrets do: the crowd is warm and this is not (PLAN
// section 4). And what is different about the aim: a sniper's lock is frozen the moment it starts,
// because the answer to a promise about a place is to leave the place; this one tracks the nose for
// the whole wind-up, because the answer to a promise about where *you* are pointing is to point
// better. That is the whole skill of the gun and the band is how it is taught.
//
// The extras the split line adds are drawn *dimmer and never narrower* (LANCE_EXTRA). Brightness is
// not a promise; width is, and every line of a pull is as wide as the gun says it is - so an extra
// reads as the lighter one of the pull without ever claiming a thinner line than the one it will
// hurt bodies on.
const LANCE_CALM = 0.16;      // the band the instant the gun begins to wind up ...
const LANCE_SHOUT = 0.85;     // ... and the instant before it lets go
const LANCE_EXTRA = 0.55;     // a split line's line, of the aimed one's light
const LANCE_CHARGED = 1.35;   // a loaded pull is *brighter*, and no wider than any other
const LANCE_HEAD = 0.85;      // the ship's own glow sprite, stamped small: no sprite of its own
const LANCE_ROOT = 1.25;      // ... and stamped large at the near end of a beam that went off

/**
 * The band a winding lance is aiming. Painted under the crowd, like a darter's line and a sniper's
 * lock, because a promise about where a line of light will be is worth nothing if a drifter can
 * stand in front of it.
 *
 * There is no cull here, and there cannot be one: one end of every band is the ship, which is by
 * definition on the glass (the same argument game/tether.js makes about its threads). What bounds
 * the drawing instead is the gun's own geometry - one band for the aim and one per rank of the
 * split line, six at the most, for the fifth of a second the gun hums.
 */
export function drawLanceLocks(ctx, alpha) {
  if (!isWinding(world)) return;

  const line = world.lance;
  const spec = BALANCE.weapons.lance.beam;
  const ship = world.player;
  const x = paintX(ship, alpha);
  const y = paintY(ship, alpha);
  const light = LANCE_CALM + (LANCE_SHOUT - LANCE_CALM) * windOf(world);
  const head = glowFor(PALETTE.player, DRONE_HALO);
  const nose = ship.drawR + BALANCE.bullets.noseOffset;

  for (let i = 0; i < line.pull; i++) {
    const angle = ship.angle + line.spreads[i];
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    // The reach is the arena's, not the gun's: a lance's line goes to the wall and no further, and
    // `beamReach` is asked for each line of the fan separately because a fan's lines end at
    // different walls. It hands back a scratch, so the number is copied out at once.
    const fore = beamReach(world, x, y, dirX, dirY).fore;
    bandPasses(ctx, x, y, x + dirX * fore, y + dirY * fore, spec.halfWidth,
      light * (i === 0 ? 1 : LANCE_EXTRA), PALETTE.player, PALETTE.bulletCore);
  }
  // And the light gathering at the muzzle it will leave from - the clock on when the gun lets go,
  // which is the same tell a sniper's eye is (game/kinds.js) turned round to the ship's own nose.
  paintGlow(ctx, head, x + Math.cos(ship.angle) * nose, y + Math.sin(ship.angle) * nose,
    light, LANCE_HEAD);
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

// The minefield (game/mines.js) is floor paint, like a bomber's death zone and a shielder's field:
// a mine lies *under* whatever walks over it, which is precisely the moment it goes off and stops
// being there. Three parts, and each of them is one of the mine's three states.
//
//   The ring is the reach that sets it off - `trigger`, measured to a body's own skin, exactly as
//     the simulation measures it - and it grows out to that reach while the mine winds up, so the
//     circle a player is shown is never bigger than the reach the mine has yet. It is dashed and it
//     crawls, like every other zone in the game, because a static circle reads as decoration.
//   The shell is a hard hexagon with four spikes, stroked and never filled: a thing lying on the
//     ground is not a pool of light, and the one thing on this floor that is a pool of light is
//     the eye.
//   The eye is the clock. Dim while it winds, breathing steadily once it is live, a fast strobe
//     once a body has walked into the ring, and gutting out over the last `fade` seconds of a mine
//     that nobody walked into - so the arena says which mines are still promised when it does not
//     have to say it in words.
const MINE_BODY = 6.5;          // px across the shell
const MINE_SIDES = 6;           // a hexagon, the same face the ice wears
const MINE_SPIKE = 4;           // px of spike standing off each of four corners
const MINE_LINE = 1.6;          // px, the shell's own line
const MINE_GLOW = 5;            // px, the wide faint pass under it
const MINE_EYE = 7;             // px of light the eye is baked at
const MINE_EYE_ARMING = 0.12;   // how dim an unwound mine is
const MINE_EYE_CALM = 0.34;     // a live one, at the bottom of its breath
const MINE_EYE_SHOUT = 1;       // and one that has somebody, at the top of its strobe
const MINE_BREATH = 3.2;        // rad/s of breathing while it waits
const MINE_STROBE = 26;         // rad/s once the fuse is lit
const MINE_DASH = [6, 9];       // px of dash, px of gap, on the ring
const MINE_CRAWL = 20;          // px/s the fence crawls at rest ...
const MINE_CRAWL_FUSE = 130;    // ... and this much faster once it is lit
const MINE_ZONE_SOFT = 5;       // px, the wide pass under the ring
const MINE_ZONE_LINE = 1.4;     // px, the ring itself
const MINE_ZONE_LIGHT = 0.15;   // how bright a waiting ring is ...
const MINE_ZONE_SHOUT = 0.7;    // ... and how bright a lit one is
const MINE_ROOM = 30;           // px of slack on the cull test, for the ring and its soft pass

/**
 * The mines standing in the arena. Nothing is drawn for a run that has not taken the line, because
 * a run that has not taken it has no mines - the pool is the whole of the state.
 */
export function drawMines(ctx) {
  const laid = world.mines.laid;
  if (laid.count === 0) return;

  const spec = BALANCE.upgrades.mines;
  const was = ctx.globalAlpha;
  let dashed = false;

  for (let i = 0; i < laid.count; i++) {
    const mine = laid.items[i];
    if (!onScreen(mine.x, mine.y, spec.trigger + MINE_ROOM)) continue;

    const arming = armingOf(mine);
    const fuse = fusingOf(mine);
    const lit = 1 - fadingOf(mine);
    // The eye's own beat: a slow breath while it waits, and a hard strobe once the fuse is lit.
    // The frame clock drives it, so a mine cannot be sped up by anything the simulation does.
    const beat = Math.sin(world.time * (MINE_BREATH + fuse * MINE_STROBE)) * 0.5 + 0.5;
    const eye = (MINE_EYE_ARMING + (MINE_EYE_CALM - MINE_EYE_ARMING) * (1 - arming))
      + (MINE_EYE_SHOUT - MINE_EYE_ARMING) * fuse * beat;
    const zone = (MINE_ZONE_LIGHT + (MINE_ZONE_SHOUT - MINE_ZONE_LIGHT) * fuse) * lit
      * (1 - arming);

    // The reach, grown out to its full size as the mine winds up. Never painted further out than
    // the reach a body can be caught at - which is the whole reason the ring is drawn out of the
    // same two numbers the simulation is (game/nova.js has the same rule for a ring that travels).
    const radius = spec.trigger * (1 - arming);
    if (radius > 1) {
      if (!dashed) {
        ctx.save();
        ctx.setLineDash(MINE_DASH);
        dashed = true;
      }
      ctx.lineDashOffset = -world.time * (MINE_CRAWL + fuse * MINE_CRAWL_FUSE);
      ctx.strokeStyle = PALETTE.mineZone;
      ctx.lineWidth = MINE_ZONE_SOFT;
      ctx.globalAlpha = was * zone * 0.4;
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, radius, 0, TAU);
      ctx.stroke();

      ctx.lineWidth = MINE_ZONE_LINE;
      ctx.globalAlpha = was * zone;
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, radius, 0, TAU);
      ctx.stroke();
    }

    // The shell and its four spikes, one path and two strokes.
    ctx.globalAlpha = was * lit;
    minePath(ctx, mine.x, mine.y);
    ctx.strokeStyle = withAlpha(PALETTE.mineBody, 0.3);
    ctx.lineWidth = MINE_GLOW;
    ctx.stroke();
    ctx.strokeStyle = PALETTE.mineBody;
    ctx.lineWidth = MINE_LINE;
    ctx.stroke();

    // The eye, baked once at full brightness and dimmed to whatever the mine's state says.
    paintGlow(ctx, glowFor(PALETTE.mineCore, MINE_EYE), mine.x, mine.y, eye * lit);
  }

  ctx.globalAlpha = was;
  if (dashed) ctx.restore();
}

/** The shell's outline: a hexagon, and a spike standing off it at four even bearings. `polygon` opens
 * the path; the four spikes are added to it as four more sub-paths and stroked with it. */
function minePath(ctx, x, y) {
  polygon(ctx, x, y, MINE_BODY, MINE_SIDES, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    ctx.moveTo(x + Math.cos(a) * MINE_BODY, y + Math.sin(a) * MINE_BODY);
    ctx.lineTo(x + Math.cos(a) * (MINE_BODY + MINE_SPIKE), y + Math.sin(a) * (MINE_BODY + MINE_SPIKE));
  }
}

// How a chilled body is drawn (game/chill.js, PLAN 3.5's Chill): a wash of rime over the body
// it is cold in, and for one that has frozen solid a shell of ice standing off it.
//
// The wash is one stamp, dimmed by how frozen the body is, which is what makes the same two
// sprites serve a body a tenth chilled and a whole crowd locked up. The shell is one stamp
// and one stroke more, and it is the only part of the picture that says "this one will
// shatter": the fifth rank of the line is paid out when a frozen body comes apart, so the
// frame has to say which bodies are frozen before that happens and not after.
//
// Neither of them is a blur or a gradient (render/glow.js), and the shell's breathing is two
// sines of the body's own `phase` - the fire's trick, for the same reason: a frost that
// re-rolled every frame would be a strobe, and a strobe over a whole crowd is the ugliest
// thing this game could draw.
const FROST_REACH = 1.3;     // the rime reaches this far past the body it is on
const FROST_LIGHT = 0.5;     // ...at this brightest, dimmed by how cold the body is
const FROST_SPRITE = 32;     // one sprite for every body, however wide it is
const FROST_PAD = 6;         // px of slack on the cull test, for the rime's soft edge
const SHELL_REACH = 1.62;    // the shell stands this far off a body that has stopped - well
                             // past the rime, so a frozen body is visibly the bigger thing
const SHELL_SPRITE = 24;     // ...with one glow of its own behind it
const SHELL_GLOW = 0.4;      // how much of that glow lands
const SHELL_LIGHT = 0.8;     // how the shell's own line lands
const SHELL_LINE = 2;        // px, the shell's edge
const SHELL_SIDES = 6;       // a hexagon: six straight faces, the shape ice is made of
const SHELL_BEAT = 3.4;      // rad/s of the shell's breathing
const SHELL_SHINE = 0.25;    // how much of the light the breathing takes away

/** How brightly one frozen body's shell is shining this instant, 1 - SHELL_SHINE .. 1. */
function shellShine(enemy, time) {
  const slow = Math.sin(time * SHELL_BEAT + enemy.phase) * 0.5 + 0.5;
  const quick = Math.sin(time * SHELL_BEAT * 2.3 + enemy.phase * 1.7) * 0.5 + 0.5;
  return 1 - SHELL_SHINE * (slow * 0.7 + quick * 0.3);
}

/**
 * The rime and, on a body that has frozen solid, the shell. Drawn in the body's own space - the
 * caller has already moved the canvas to where it stands - and before the body is turned, so
 * the ice stays put while whatever is inside it spins.
 */
function drawFrost(ctx, enemy) {
  const reach = enemy.r * FROST_REACH;
  paintGlow(ctx, glowFor(PALETTE.chillFrost, FROST_SPRITE), 0, 0,
    FROST_LIGHT * frostOf(enemy), reach / FROST_SPRITE);
  if (!isFrozen(enemy)) return;

  const shine = shellShine(enemy, world.time);
  const off = enemy.r * SHELL_REACH;
  paintGlow(ctx, glowFor(PALETTE.chillShell, SHELL_SPRITE), 0, 0,
    SHELL_GLOW * shine, off / SHELL_SPRITE);
  polygon(ctx, 0, 0, off, SHELL_SIDES, 0);
  ctx.lineWidth = SHELL_LINE;
  ctx.strokeStyle = withAlpha(PALETTE.chillShell, SHELL_LIGHT * shine);
  ctx.stroke();
}

function drawEnemy(ctx, enemy, dim, alpha) {
  // A boss is not a polygon with a halo on it, so it leaves the crowd's drawing entirely
  // (render/boss.js). Asked of the fight and not of the body's type name, because the boss is
  // not one of the kinds (game/bosses.js) and nothing here should have to learn its id.
  if (isBossBody(world, enemy)) { drawBoss(ctx, world.boss, enemy, alpha); return; }
  // And a cell of a boss's mass is drawn with its boss as well, in one pass over the whole
  // honeycomb: it is a body of the crowd in every way that matters - it is hurt, it pays out, it
  // walks - but a lone hexagon of wax is not a thing a player can read, and seven of them joined
  // up by one painter is a mass (render/boss.js, game/bosses.js `isBossPart`).
  if (isBossPart(world, enemy)) return;
  // A kind's look, as opposed to its behaviour: game/kinds.js says how a kind
  // moves, this says what it is made of. A new kind that is not a plain polygon
  // gets a branch here as well as its row there.
  const look = BALANCE.kinds[enemy.type];
  const flash = hitFlash(enemy);
  // A hatchling is the same kind as its parent with a smaller body, so the halo
  // follows the body it has and not the kind it is.
  const halo = enemy.r + look.glow * HALO_REACH;
  // A chilled body wears its rime further out than its halo, and the shell of a frozen one
  // further still, so the cull has to know about both or the ice would blink in and out at
  // the edge of the window.
  const rime = enemy.frost > 0
    ? enemy.r * (isFrozen(enemy) ? SHELL_REACH : FROST_REACH) + FROST_PAD
    : 0;
  if (!onScreen(enemy.x, enemy.y, Math.max(halo, rime) + 4)) return;

  ctx.save();
  if (dim) ctx.globalAlpha = 0.45;
  ctx.translate(paintX(enemy, alpha), paintY(enemy, alpha));
  paintGlow(ctx, glowFor(look.color, halo), 0, 0, HALO_LIGHT);
  if (enemy.elite) paintGlow(ctx, glowFor(PALETTE.elite, halo), 0, 0, ELITE_GLOW_LIGHT);
  if (flash > 0) paintGlow(ctx, glowFor(PALETTE.white, halo), 0, 0, flash * FLASH_LIGHT);
  // The frost goes on before the body is turned: rime lies over a body wherever it is pointing,
  // and a shell of ice does not spin with whatever the thing inside it is doing. It is under
  // the body's own fill for the same reason every other glow here is, and further out than any
  // of them, so nothing of it is hidden - and every light the body carries (a fuse, an eye, an
  // aim) still goes on top of it, because the frame may not let the ice hide what a body is
  // about to do.
  if (enemy.frost > 0) drawFrost(ctx, enemy);
  ctx.rotate(enemy.rot);
  if (isLunging(enemy)) paintStreak(ctx, dartBlurSprite(), 0, 0, 0, 1, DART_BLUR_LIGHT);
  else if (isDiving(enemy)) paintStreak(ctx, swarmBlurSprite(), 0, 0, 0, 1, DART_BLUR_LIGHT);
  ctx.fillStyle = look.fill;
  if (enemy.type === 'weaver') shipPath(ctx, 0, 0, enemy.r, 0, 1.7);
  else if (enemy.type === 'darter') dartPath(ctx, enemy.r);
  else if (enemy.type === 'shielder') bulwarkPath(ctx, enemy.r);
  else if (enemy.type === 'swarmling') shipPath(ctx, 0, 0, enemy.r, 0, SWARM_SPIKE);
  else if (enemy.type === 'sniper') lensPath(ctx, enemy.r);
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
  if (enemy.type === 'sniper') {
    // The pupil, and the only moving part of it: the eye is the muzzle the beam comes
    // out of, so the light inside it is the lock's countdown (`lockLight` above) and it
    // never has to be believed on its own - the band across the arena is the same
    // number, drawn.
    paintGlow(ctx, glowFor(PALETTE.beamCore, EYE_LIGHT), 0, 0, lockLight(enemy, world.time));
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

// The ship's own fire (game/burn.js, PLAN 3.5's Burn): a body that is alight is drawn with
// a flame over it.
//
// Two stamps and nothing else - a wide one the colour of the fire and a smaller, hotter one
// above the middle of the body - because this is the one light in the game that can be true
// of forty bodies at once, and it is drawn over the crowd it is burning, which is the
// blend's whole trick: a warm yellow stamped over a red body comes out looking lit from
// inside rather than wearing a hat.
//
// The breathing is a sum of two sines out of the body's own `phase` and nothing else, so a
// fire is a live shape without asking a random stream for a single number - a flame that
// re-rolled every frame would be a strobe, and a strobe forty times over is the ugliest
// thing this game could draw.
const FIRE_REACH = 1.55;       // the flame reaches this far past the body it is burning
const FIRE_CORE = 0.6;         // the hot part, as a share of the body's own width
const FIRE_LICK = 0.35;        // how far above the middle the hot part sits: fire goes up
const FIRE_LIGHT = 0.5;        // how bright the wide pass lands at its dimmest
const FIRE_CORE_LIGHT = 0.75;
const FIRE_BEAT = 9;           // rad/s of the main breath
const FIRE_DANCE = 0.35;       // how much of the light the flicker takes away
const FIRE_PAD = 8;            // px of slack on the cull test, for the flicker
// Two sprites for the whole of the fire, whichever body it is eating: a bigger sprite
// stamped smaller costs one more matrix multiply and buys back the eight or so that one
// sprite per body radius would have baked (test/draw-cost.test.mjs keeps an eye on how many
// sprites the game owns, and a crowd of every kind on fire used to add to it).
const FIRE_SPRITE = 40;        // px of reach the wide sprite is baked at
const FIRE_CORE_SPRITE = 16;   // ...and the hot one

/** How brightly one fire is lit this instant, 1 - FIRE_DANCE .. 1. */
function lickOf(target, time) {
  const slow = Math.sin(time * FIRE_BEAT + target.phase) * 0.5 + 0.5;
  const quick = Math.sin(time * FIRE_BEAT * 2.7 + target.phase * 1.7) * 0.5 + 0.5;
  return 1 - FIRE_DANCE * (slow * 0.7 + quick * 0.3);
}

export function drawFire(ctx, alpha) {
  const fires = world.fires;
  const time = world.time;
  const wide = glowFor(PALETTE.burnFlame, FIRE_SPRITE);
  const hot = glowFor(PALETTE.burnCore, FIRE_CORE_SPRITE);

  for (let i = 0; i < fires.count; i++) {
    const fire = fires.items[i];
    const body = fire.target;
    // It came apart since the last step and the fire has one step left to go out in
    // (game/burn.js). A flame hanging in the air where a body was is a lie about a wreck.
    if (body.hp <= 0) continue;

    const x = paintX(body, alpha);
    const y = paintY(body, alpha);
    const reach = body.r * FIRE_REACH;
    if (!onScreen(x, y, reach + FIRE_PAD)) continue;

    const lick = lickOf(body, time);
    paintGlow(ctx, wide, x, y, FIRE_LIGHT * lick, reach / FIRE_SPRITE);
    paintGlow(ctx, hot, x, y - body.r * FIRE_LICK,
      FIRE_CORE_LIGHT * lick, (body.r * FIRE_CORE) / FIRE_CORE_SPRITE);
  }
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

// The overcharge's own art (game/overcharge.js). A second ring, one outside the dash's, because
// this is the second thing round this ship that fills up over time and the player has to be able
// to tell them apart at a glance: the dash's is cyan and closes over a wait, this one is the pale
// white of a shot's own heart, breathes when it is full, and is not drawn at all for a run that
// has not taken the card.
const CHARGE_GAP = 21;          // px out from the ship's body - nine further out than the dash's
const CHARGE_SOFT = 7;          // px, the wide pass under the thin one, which is the glow
const CHARGE_LINE = 2.5;        // px, the ring itself
const CHARGE_BREATHE = 7;       // rad/s of breathing once the gun is loaded
const CHARGE_BREATH_ROOM = 2;   // px the loaded ring moves over while it breathes
const CHARGE_READY_LIGHT = 0.9; // how bright a loaded ring lands, at the top of its breath
// A charged shot: the same dot with more of it, and one wide faint ring under it for light.
// Nothing else about it changes, because a shot that flew differently would be a different gun.
const BULLET_CORE = 2.4;          // px, a plain shot's dot
const CHARGED_CORE = 4.6;         // px, a loaded one's
const CHARGED_BAND = 6;           // px of wide, faint glow under a loaded shot
const CHARGED_SOFT = withAlpha(PALETTE.bulletCore, 0.3);

// The Swarm's micro-missiles (game/missiles.js, BALANCE.weapons.swarm). They are the ship's own
// ordnance, so they wear the mine's family - a pale sky body, a nearly white eye - and none of the
// crowd's warm hues, which is the rule PLAN section 4 draws and the mines already keep (an explosion
// is warm whatever lit it, the thing that carries it is not). And they are drawn as an object with a
// nose instead of as a dot, because a dot that curves round after a body reads as a mistake on the
// glass while a small dart whose nose is swinging round reads as a gun doing the thing it was bought
// to do. The trail is the same streak every shot drags - it is stretched to the shot's own speed,
// which is why a slow shell drags a short one - so nothing is baked for these and nothing is blurred.
const MISSILE_NOSE = 5.4;   // px, point to tail of the dart
const MISSILE_TAIL = 4.6;   // px across the fletching
const MISSILE_EYE = 1.7;    // px, the hot dot near the point

// The magnetar's own art (game/magnetar.js). A third ring, one outside the charge's, and mint
// where the charge is the white of a shot: this one fills up with shards instead of with waiting,
// and the colour is the thing that pays for it. Same two passes as the other two - a wide faint
// arc under a thin bright one, which is how every ring in this game glows without a blur - and the
// same rule: nothing at all is drawn for a run that has not taken the card.
const BANK_GAP = 30;            // px out from the ship's body - nine further out than the charge's
const BANK_SOFT = 6;            // px, the wide pass under the thin one
const BANK_LINE = 2;            // px, the ring itself
const BANK_BREATHE = 9;         // rad/s of breathing when the bank is overfull - a little quicker
                                 // than the gun's, because this one empties and refills a lot
const BANK_BREATH_ROOM = 2;     // px the ready ring moves over while it breathes
const BANK_READY_LIGHT = 0.85;  // how bright a ready field lands, at the top of its breath

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

// A shot's trail shows this much of the second behind it. It is baked for a shot
// travelling at TRAIL_SPEED and stamped stretched to the shot's own speed, so the streak
// is always the distance the shot has really come: a scatter pellet drags a shorter trail
// than a pulse shot because it has travelled less, and the game has more than one speed
// of shot now (game/weapons.js).
const TRAIL_SECONDS = 0.035;
const TRAIL_SPEED = 620;      // px/s the sprite itself is baked for
const TRAIL_WIDTH = 5;
// The last of a shot's life its trail collapses over, in seconds: a shot that runs out
// visibly runs out, which is how a short-ranged gun's reach can be seen rather than
// remembered. The core dot is not part of it - the dot is where the shot is.
const TRAIL_RUNOUT = 0.12;

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
    bulletTrail = makeStreak(PALETTE.bullet, PALETTE.bulletTrail, TRAIL_SECONDS * TRAIL_SPEED, TRAIL_WIDTH);
  }
  return bulletTrail;
}

/**
 * How long a shot's trail is next to the sprite: its own speed, with the last stretch of
 * its life folding it down to nothing. See TRAIL_SECONDS and TRAIL_RUNOUT above.
 */
function trailStretch(bullet) {
  const speed = Math.sqrt(bullet.vx * bullet.vx + bullet.vy * bullet.vy);
  return (speed / TRAIL_SPEED) * clamp(bullet.life / TRAIL_RUNOUT, 0, 1);
}

/** The ship's own silhouette, pointing along +x from the origin it is drawn around. */
function shipOutline(ctx, ship) {
  shipShape(ship.shape)(ctx, ship.drawR);
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
    shipOutline(ctx, ship);
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

  // The ship's own wait, whatever ship that is (game/ships.js): the arc closing over the
  // circle is the fraction of *this* ship's cooldown that has been spent.
  const done = 1 - clamp(ship.dashCd / ship.dashWait, 0, 1);
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

/**
 * The charge round the hull (game/overcharge.js): the same two-pass arc the dash's cooldown uses,
 * because it is the same message - an arc that closes over a wait, whole when the wait is over -
 * said in a different colour and one ring further out. While the gun is loading it says how far
 * through the second you are; when it is loaded the circle is whole and breathing, which is the
 * one tell a player gets that the next pull is the heavy one.
 *
 * Not drawn at all for a run that has not taken the line: a ring nothing can fill is a riddle.
 */
function drawChargeRing(ctx, ship) {
  if (!hasOvercharge(world)) return;
  const radius = ship.drawR + CHARGE_GAP;
  const charge = chargeOf(world);

  if (isLoaded(world)) {
    const breath = 0.5 + 0.5 * Math.sin(world.time * CHARGE_BREATHE);
    const lit = CHARGE_READY_LIGHT * (0.65 + 0.35 * breath);
    ctx.strokeStyle = PALETTE.chargeRingSoft;
    ctx.lineWidth = CHARGE_SOFT;
    ctx.beginPath();
    ctx.arc(0, 0, radius + breath * CHARGE_BREATH_ROOM, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(PALETTE.chargeRingReady, lit);
    ctx.lineWidth = CHARGE_LINE;
    ctx.beginPath();
    ctx.arc(0, 0, radius + breath * CHARGE_BREATH_ROOM, 0, TAU);
    ctx.stroke();
    return;
  }

  ctx.strokeStyle = PALETTE.chargeRingTrack;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();

  ctx.strokeStyle = PALETTE.chargeRingSoft;
  ctx.lineWidth = CHARGE_SOFT;
  ctx.beginPath();
  ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + TAU * charge);
  ctx.stroke();

  ctx.strokeStyle = PALETTE.chargeRingFill;
  ctx.lineWidth = CHARGE_LINE;
  ctx.beginPath();
  ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + TAU * charge);
  ctx.stroke();
}

/**
 * How full the bank is (game/magnetar.js): the same two-pass arc as the dash's cooldown and the
 * gun's charge, one ring out again and in the shards' own mint, because it is the shards that fill
 * it. While it is filling it says how many more of them the next crack costs.
 *
 * It is a meter and not the field's size, and that is deliberate: the crack's own light is what
 * says how far the field reaches (see `light` in BALANCE.upgrades.magnetar, and the rule there that
 * it is born at exactly the reach the damage was paid out at), and a standing circle 210 px round
 * the hull would be a third of the screen and a riddle the other two rings are not - the dash's is
 * a cooldown and the charge's is the muzzle, and this is a wallet.
 *
 * The ordinary case is the fill, because the field spends itself the same step it fills
 * (`updateMagnetar`): an ordinary shard leaves the ring a shard short of whole and never shows it
 * any other way. The whole bright circle is the rarer thing - a magnet pile landing puts five
 * cracks' worth in the bank at once, and one crack per step means the ring stays whole and bright
 * for the few frames the rattle takes (game/magnetar.js has why one per step), which is the right
 * emphasis for walking into a pile.
 *
 * Not drawn at all for a run that has not taken the line - a ring nothing can fill is a riddle too.
 */
function drawFieldRing(ctx, ship) {
  if (!hasMagnetar(world)) return;
  const radius = ship.drawR + BANK_GAP;
  const charge = fieldChargeOf(world);

  if (fieldPrimed(world)) {
    const breath = 0.5 + 0.5 * Math.sin(world.time * BANK_BREATHE);
    const lit = BANK_READY_LIGHT * (0.65 + 0.35 * breath);
    ctx.strokeStyle = PALETTE.fieldRingSoft;
    ctx.lineWidth = BANK_SOFT;
    ctx.beginPath();
    ctx.arc(0, 0, radius + breath * BANK_BREATH_ROOM, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(PALETTE.shardLine, lit);
    ctx.lineWidth = BANK_LINE;
    ctx.beginPath();
    ctx.arc(0, 0, radius + breath * BANK_BREATH_ROOM, 0, TAU);
    ctx.stroke();
    return;
  }

  ctx.strokeStyle = PALETTE.fieldRingTrack;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();

  ctx.strokeStyle = PALETTE.fieldRingSoft;
  ctx.lineWidth = BANK_SOFT;
  ctx.beginPath();
  ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + TAU * charge);
  ctx.stroke();

  ctx.strokeStyle = PALETTE.fieldRingFill;
  ctx.lineWidth = BANK_LINE;
  ctx.beginPath();
  ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + TAU * charge);
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
  shipOutline(ctx, ship);
  ctx.fill();
  ctx.stroke();

  paintGlow(ctx, glowFor(PALETTE.white, CORE_HALO), 0, 0, CORE_LIGHT);
  ctx.beginPath();
  ctx.fillStyle = PALETTE.playerCore;
  ctx.arc(0, 0, 3, 0, TAU);
  ctx.fill();

  ctx.rotate(-ship.angle);
  drawDashRing(ctx, ship);
  drawChargeRing(ctx, ship);
  drawFieldRing(ctx, ship);
  ctx.restore();
}

// The afterimage's images (game/afterimage.js): the ship as it was, left standing in the arena,
// with the ring of air each one is believed by drawn at exactly `bait` - the reach the simulation
// measures a chase from, so the circle you see is the circle a body has to be inside to turn
// aside. It is the same bargain a bomber's zone and the orbital track make: the line is drawn out
// of the number the sim reads.
//
// They are drawn in the ship's own colours, at the ship's own size and a long way under the
// ship's own brightness - the lie the crowd falls for has to be a lie the player can see through
// (PLAN section 4), and there is never more than one bright ship in the middle of the screen. The
// glow is the house trick, a wide faint stroke under a thin bright one, so a frame with five of
// them standing asks the canvas for nothing it has to build.
const GHOST_GLOW = 6;            // px: the wide faint pass under the outline
const GHOST_GLOW_LIGHT = 0.1;
const GHOST_LINE_LIGHT = 0.45;
const GHOST_CORE_LIGHT = 0.34;   // a good third of what the ship's own core wears
const GHOST_REACH_LIGHT = 0.14;

/**
 * The images standing in the arena, painted under the ship - which is the one order in which a
 * ghost passing under the real thing could never be mistaken for it.
 */
export function drawGhosts(ctx) {
  const trail = world.afterimage.trail;
  if (trail.count === 0) return;

  const spec = BALANCE.upgrades.afterimage;
  const ship = world.player;
  for (let i = 0; i < trail.count; i++) {
    const image = trail.items[i];
    if (!onScreen(image.x, image.y, spec.bait)) continue;
    // Fresh and whole for the first half of its life, then thinning out to nothing: the crowd's
    // reprieve has an end, and the player is shown it rather than told it.
    const lit = 1 - fadingBy(image);

    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(PALETTE.player, GHOST_REACH_LIGHT * lit);
    ctx.beginPath();
    ctx.arc(image.x, image.y, spec.bait, 0, TAU);
    ctx.stroke();

    ctx.save();
    ctx.translate(image.x, image.y);
    ctx.rotate(image.angle);
    ctx.globalAlpha = ctx.globalAlpha * lit;

    shipOutline(ctx, ship);
    ctx.lineWidth = GHOST_GLOW;
    ctx.strokeStyle = withAlpha(PALETTE.player, GHOST_GLOW_LIGHT);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = withAlpha(PALETTE.playerLine, GHOST_LINE_LIGHT);
    ctx.stroke();
    ctx.fillStyle = PALETTE.playerFill;
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = withAlpha(PALETTE.playerCore, GHOST_CORE_LIGHT);
    ctx.arc(0, 0, 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// The tether (game/tether.js): the threads a dash ties between the places it left and the ship they
// were left from. It is the only band of the ship's own light in the game, so it is drawn with the
// sniper's three passes - a band reads as a band and not as a hairline only with the whole width
// painted faint under a hot middle under a nearly white axis - and it wears the ship's own colours,
// the way the orbital ring and the nova do, because the crowd is warm and this is not (PLAN section 4).
//
// The widest pass is `reach` px either side of the axis and nothing more, which is exactly how far off
// the line a body has to stand to be burned: the road of light is the road the damage is paid out on,
// edge for edge, the promise the sniper's beam and a mine's ring already keep. The strokes are
// butt-capped for the same reason - a round cap would reach a whole `reach` past the end of a thread,
// and the simulation clamps a body's foot to the thread itself, so the light would be claiming ground
// the tether never touches.
//
// Brightness is the pulse and nothing else: the threads brighten *because* something standing on them
// was just hurt, and dim back down as the next beat comes due. A tether with nobody on it burns steady
// at TETHER_CALM - it is a thing you can see and fly by, not a strobe.
const TETHER_CALM = 0.2;      // a thread with nothing on it ...
const TETHER_SHOUT = 0.62;    // ... and one that has just burned somebody
const TETHER_KNOT = 1.6;      // how much of the knot's light lands while the thread is calm
const TETHER_KNOT_SCALE = 0.7;// the drone's own glow sprite, stamped smaller: no sprite of its own

/**
 * The threads standing in the arena. Painted under the ship, which is the one order in which a beam
 * tied to the hull can never swallow the hull (PLAN section 1: the player must always be able to see
 * their own ship), and over the crowd, which is the one order in which a thread is never hidden by the
 * bodies it is burning.
 *
 * Nothing is drawn for a run that has not taken the line, and nothing is drawn between two dashes:
 * the threads are the whole of the line's drawing state, and there are none when nothing is tied.
 *
 * There is no cull here, and there cannot be one: one end of every thread is the ship, which is by
 * definition on the glass, so however far the knot has been left the thread still crosses the window
 * to reach it. What bounds the drawing instead is the line's own geometry - five threads, each at most
 * a dash plus two seconds of running long - which is five strokes-and-a-knot a frame and wants no
 * test to skip any of it.
 */
export function drawTether(ctx, alpha) {
  const line = world.tether;
  if (line.live <= 0 || line.cords.count === 0) return;

  const spec = BALANCE.upgrades.tether;
  const ship = world.player;
  // The near end is the ship as the frame is painting it, so the threads are tied to the ship you see
  // and not to the one the last step left (render/interp.js).
  const sx = paintX(ship, alpha);
  const sy = paintY(ship, alpha);
  const light = (1 - lettingGoOf(line))
    * (TETHER_CALM + (TETHER_SHOUT - TETHER_CALM) * pulsingBy(line));
  const knot = light * TETHER_KNOT;

  for (let i = 0; i < line.cords.count; i++) {
    const cord = line.cords.items[i];
    bandPasses(ctx, cord.x, cord.y, sx, sy, spec.reach, light,
      PALETTE.player, PALETTE.bulletCore);
    // The knot is the only part of a thread that has a beginning, so it is the only part that keeps a
    // light: the place the dash was standing when it tied this one. It is the drone's own sprite, and
    // the whole tether costs a frame no sprite of its own.
    paintGlow(ctx, glowFor(PALETTE.player, DRONE_HALO), cord.x, cord.y, knot, TETHER_KNOT_SCALE);
  }
}

// The guns the ship has set down on the road in front of it (game/turret.js). They wear the ship's own
// cyan for the reason the orbitals and the tether do: a turret is not something the ship left behind,
// it is a piece of the ship - its own gun on a mount - and cyan is what "yours" means on this glass
// (PLAN section 4). Four things are drawn and none of them is a decoration:
//
//   **The sight line is the reach.** It runs out of the muzzle to exactly `reach` px from the mount and
//     no further, so the line a player is shown is the ground the gun can shoot at and its shell can
//     reach - the same promise a mine's ring and a tether's band keep (game/mines.js, game/tether.js).
//     It is faint while the gun has nothing to shoot at and bright while it has.
//   **The barrel is the facing.** The simulation only lets a shell leave down the nose, so the way the
//     barrel points is the way the gun will shoot and nothing else: a gun still coming round is drawn
//     still coming round.
//   **The muzzle is the clock.** It brightens as the beat comes round and gutters the step a shell
//     leaves, so the frame says when the next shot is due without a meter for it.
//   **The whole gun dims as its ten seconds run out**, so the arena says which guns are still holding
//     ground and which are about to stop (game/mines.js fades its mines the same way).
const TURRET_BASE = 6.5;        // px across the mount
const TURRET_SIDES = 4;         // a diamond: no enemy wears a square and no mine wears this
const TURRET_LINE = 1.6;        // px, the mount's own line
const TURRET_GLOW = 5;          // px, the wide faint pass under it
const TURRET_BARREL = 13;       // px of barrel out from the middle, so the facing is legible
const TURRET_BARREL_W = 4;      // px, the barrel's wide pass ...
const TURRET_BARREL_LINE = 1.8; // px ... and its thin bright one
const TURRET_SIGHT_CALM = 0.12; // the reach, drawn while the gun has nothing to shoot at ...
const TURRET_SIGHT_ON = 0.46;   // ... and while it has
const TURRET_SIGHT_SOFT = 4;    // px, the wide pass under the sight line
const TURRET_SIGHT_LINE = 1.1;  // px, the sight line itself
const TURRET_LIGHT_CALM = 0.12; // a cold beat, at the muzzle ...
const TURRET_LIGHT_READY = 0.9; // ... and a beat that has come round
const TURRET_LIGHT_SCALE = 0.6; // the drone's own glow sprite, stamped smaller: no sprite of its own
const TURRET_ROOM = 34;         // px of slack on the cull test, for the sight line's head

/**
 * The guns standing in the arena. Over the crowd and under the ship: a turret is the one friendly thing
 * the crowd walks over, and a gun you cannot see is a gun that has already stopped working (the tether
 * is put down for the same reason, game/tether.js).
 *
 * Nothing is drawn for a run that has not taken the line, because the guns standing are the whole of
 * the line's drawing state - ranks included, which is what the first test of test/turret-art.test.mjs
 * is on about.
 */
export function drawTurrets(ctx) {
  const stands = world.turret.stands;
  if (stands.count === 0) return;

  const spec = BALANCE.upgrades.turret;
  const was = ctx.globalAlpha;
  ctx.lineCap = 'butt';

  for (let i = 0; i < stands.count; i++) {
    const turret = stands.items[i];
    // The sight line reaches out past the mount by the whole `reach`, so that is what the cull has to
    // give it room for - a gun just off the glass still paints a line across it.
    if (!onScreen(turret.x, turret.y, spec.reach + TURRET_ROOM)) continue;

    const lit = 1 - turretFadingOf(turret);
    const dx = Math.cos(turret.angle);
    const dy = Math.sin(turret.angle);
    const mx = turret.x + dx * spec.muzzle;
    const my = turret.y + dy * spec.muzzle;

    // The reach, along the nose and out to exactly the distance the gun will shoot at.
    const sight = (TURRET_SIGHT_CALM + (TURRET_SIGHT_ON - TURRET_SIGHT_CALM) * aimedOf(turret)) * lit;
    ctx.strokeStyle = PALETTE.player;
    ctx.lineWidth = TURRET_SIGHT_SOFT;
    ctx.globalAlpha = was * sight * 0.4;
    strokeBetween(ctx, mx, my, turret.x + dx * spec.reach, turret.y + dy * spec.reach);
    ctx.lineWidth = TURRET_SIGHT_LINE;
    ctx.globalAlpha = was * sight;
    strokeBetween(ctx, mx, my, turret.x + dx * spec.reach, turret.y + dy * spec.reach);

    // The mount: a hard diamond, stroked and never filled, because a thing standing on the floor is
    // not a pool of light - the one light on this gun is the muzzle.
    polygon(ctx, turret.x, turret.y, TURRET_BASE, TURRET_SIDES, Math.PI / 4);
    ctx.strokeStyle = withAlpha(PALETTE.playerLine, 0.3);
    ctx.lineWidth = TURRET_GLOW;
    ctx.globalAlpha = was * lit;
    ctx.stroke();
    ctx.strokeStyle = PALETTE.playerLine;
    ctx.lineWidth = TURRET_LINE;
    ctx.stroke();

    // The barrel, which is the facing and therefore the whole of the gun's honesty.
    const bx = turret.x + dx * TURRET_BARREL;
    const by = turret.y + dy * TURRET_BARREL;
    ctx.strokeStyle = withAlpha(PALETTE.playerLine, 0.35);
    ctx.lineWidth = TURRET_BARREL_W;
    strokeBetween(ctx, turret.x, turret.y, bx, by);
    ctx.strokeStyle = PALETTE.playerLine;
    ctx.lineWidth = TURRET_BARREL_LINE;
    strokeBetween(ctx, turret.x, turret.y, bx, by);

    // The muzzle: how near the next shell is, stamped with the orbital drone's own light, so the whole
    // line costs a frame no sprite of its own.
    const light = (TURRET_LIGHT_CALM
      + (TURRET_LIGHT_READY - TURRET_LIGHT_CALM) * reloadingOf(turret)) * lit;
    paintGlow(ctx, glowFor(PALETTE.player, DRONE_HALO), mx, my, light, TURRET_LIGHT_SCALE);
  }

  ctx.globalAlpha = was;
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

// The arc's bolts (game/arc.js): the record of a discharge that has already happened.
//
// A bolt is drawn as a zig between the two places the leap joined, in two passes like every
// other light here - a wide faint stroke under a thin bright one, which is how this game
// glows without asking the canvas to blur anything. The zig is the whole art of it: a
// straight line would read as a laser or a shielder's field, and this is neither; it is the
// one shape in the arena that says "something travelled through the air and it was already
// over when you saw it".
//
// Two rules keep it honest, and both are tested:
//
//   **The two ends are pinned.** The first point of a bolt is the muzzle it left and the last
//     is the body that was hurt, exactly, whatever the zig does in between - so the light
//     never claims a reach the damage did not have, and never misses a body it did.
//
//   **It wobbles, but not every frame.** A bolt re-discharges on `BOLT_FLICKER` and holds its
//     shape between one and the next, because a shape that re-rolled sixty times a second is
//     a strobe and not a live thing. The dice are hashed out of the bolt's own seed rather
//     than drawn from the frame's stream, which is what makes that hold.
const BOLT_SEG = 15;          // px of run per zig
const BOLT_JAG = 7;           // px of sideways wander at the widest point of a leap
const BOLT_FLICKER = 0.05;    // s: how often a bolt re-sparks
const BOLT_GLOW = 0.2;        // the wide faint pass under the bolt
const BOLT_GLOW_WIDTH = 6;    // ...and how wide
const BOLT_CORE = 0.9;        // the thin bright one over it
const BOLT_WIDTH = 2.2;
const BOLT_RANK = 0.72;       // how much of the light one more leap down the chain keeps
const BOLT_REACH = 40;        // px of slack on the cull test, for the wobble and the glow
const BOLT_CHARGED = 1.8;     // how much thicker a bolt thrown by a loaded gun is
const WANDER_SALT = 0x9e3779b9;
const WANDER_MIX = 0x85ebca6b;
const WANDER_SCALE = 65536;
const UINT32 = 4294967296;

/**
 * A number in [-1, 1] from a bolt's seed, the segment's place in it, and the flicker bucket.
 *
 * Deliberately a hash and not the frame's stream: the stream moves on every call, so a bolt
 * drawn from it would be a different bolt every frame. Hashed like this the shape is fixed
 * for a bolt and turns over only when the bucket does.
 */
function wander(seed, segment, bucket) {
  let h = (Math.floor(seed * WANDER_SCALE) + Math.imul(segment, WANDER_SALT)
    + Math.imul(bucket, WANDER_MIX)) | 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (((h >>> 0) / UINT32) * 2) - 1;
}

/**
 * One bolt's zig: `steps` straight legs between the two ends, each shoved sideways off the
 * line by the hash above, and held to no wobble at all at the two ends themselves so the light
 * starts and stops exactly where the leap did.
 */
function boltPath(ctx, x0, y0, x1, y1, seed, bucket) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = hypot(dx, dy) || 1;
  const steps = Math.max(2, Math.round(len / BOLT_SEG));
  // The sideways of the line, which is the only direction a wobble may go in.
  const ux = -dy / len;
  const uy = dx / len;

  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wig = (i === 0 || i === steps)
      ? 0
      : wander(seed, i, bucket) * BOLT_JAG * Math.sin(t * Math.PI);
    ctx.lineTo(x0 + dx * t + ux * wig, y0 + dy * t + uy * wig);
  }
}

/**
 * Every bolt still on screen. Drawn over the crowd and over the ship - a bolt is the story of
 * where the damage went, and a story hidden behind a drifter is a story nobody is told - and
 * before the sparks, which are the loudest thing in the frame and should stay the loudest.
 */
export function drawArcs(ctx) {
  const bolts = world.arc.bolts;
  if (bolts.count === 0) return;

  const bucket = Math.floor(world.time / BOLT_FLICKER);
  ctx.lineCap = 'round';
  for (let i = 0; i < bolts.count; i++) {
    const bolt = bolts.items[i];
    const dx = bolt.x1 - bolt.x0;
    const dy = bolt.y1 - bolt.y0;
    const len = hypot(dx, dy);
    // A bolt is a line and not a point, so the cull test is taken from its middle with half
    // of it either side: either end may be on screen while the middle is not.
    if (!onScreen(bolt.x0 + dx / 2, bolt.y0 + dy / 2, len / 2 + BOLT_JAG + BOLT_REACH)) continue;

    // A bolt fades because the air has stopped carrying it, and it fades by its place down
    // the chain because the third body a bolt reached took rather more than half of what the
    // first one did - the light thins exactly as the damage does.
    const light = clamp(bolt.life / bolt.max, 0, 1) * Math.pow(BOLT_RANK, bolt.rank);
    // A bolt from a loaded gun is the same bolt with more of it (game/overcharge.js), which is
    // the only way the third body a chain reached can still be seen to have been worth more.
    const thick = bolt.charged ? BOLT_CHARGED : 1;
    boltPath(ctx, bolt.x0, bolt.y0, bolt.x1, bolt.y1, bolt.seed, bucket);
    ctx.strokeStyle = PALETTE.player;
    ctx.globalAlpha = light * BOLT_GLOW;
    ctx.lineWidth = BOLT_GLOW_WIDTH * thick;
    ctx.stroke();
    ctx.strokeStyle = PALETTE.bulletCore;
    ctx.globalAlpha = light * BOLT_CORE;
    ctx.lineWidth = BOLT_WIDTH * thick;
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
}

/**
 * Every beam still glowing (game/beams.js). Drawn over the crowd and over the ship - a
 * beam is the record of damage that has already been paid, and one hidden behind a
 * drifter would be a hit nobody was told about - and it is the same band the lock drew,
 * at the same width, going out as the light does.
 *
 * Nothing about a beam wobbles or breathes: the line it draws is the line that hurt,
 * and a hazard that shimmers where it was not is a hazard misremembered.
 */
export function drawBeams(ctx) {
  const beams = world.beams;
  if (beams.count === 0) return;

  for (let i = 0; i < beams.count; i++) {
    const beam = beams.items[i];
    const x0 = beam.x - beam.dirX * beam.back;
    const y0 = beam.y - beam.dirY * beam.back;
    const x1 = beam.x + beam.dirX * beam.fore;
    const y1 = beam.y + beam.dirY * beam.fore;
    if (!onScreen((x0 + x1) / 2, (y0 + y1) / 2, hypot(x1 - x0, y1 - y0) / 2)) continue;

    bandPasses(ctx, x0, y0, x1, y1, beam.width, clamp(beam.life / beam.max, 0, 1),
      PALETTE.beamEdge, PALETTE.beamCore);
    paintGlow(ctx, glowFor(PALETTE.beamCore, BEAM_HEAD), beam.x, beam.y,
      clamp(beam.life / beam.max, 0, 1));
  }
}

/**
 * Every lance beam still glowing (game/lance.js). Under the ship - the near end of one of these is
 * the ship's own middle, and the loudest light in the arena must never be the thing that hides the
 * hull (PLAN section 1) - and over the crowd, because a line of damage that crossed a body silently
 * is a line that was not worth firing.
 *
 * The band is the same one the wind-up drew, at the same width, and nothing about it wobbles or
 * breathes: it is the record of where the hull came off. A charged pull is painted brighter and, on
 * purpose, no wider: a fan of shots can be drawn as fatter dots because a dot's size promises
 * nothing, but a band's width *is* the ground the damage is paid on.
 *
 * No cull, for the same reason as the bands above: one end of every one of these is the ship.
 */
export function drawLanceBeams(ctx) {
  const beams = world.lance.beams;
  if (beams.count === 0) return;

  const head = glowFor(PALETTE.player, DRONE_HALO);
  for (let i = 0; i < beams.count; i++) {
    const beam = beams.items[i];
    const x1 = beam.x + beam.dirX * beam.fore;
    const y1 = beam.y + beam.dirY * beam.fore;
    let light = clamp(beam.life / beam.max, 0, 1) * (beam.rank === 0 ? 1 : LANCE_EXTRA);
    if (beam.charged) light *= LANCE_CHARGED;
    bandPasses(ctx, beam.x, beam.y, x1, y1, beam.width, light,
      PALETTE.player, PALETTE.white);
    paintGlow(ctx, head, beam.x, beam.y, light, LANCE_ROOT);
  }
}

/**
 * One micro-missile, pointing the way it is going (game/missiles.js). Two fills and a rotate: the
 * dart, and the eye at its point. Nothing about it breathes or flickers - it is a shell in the air,
 * and the only motion it needs to show is its own nose coming round.
 */
function drawMissile(ctx, x, y, heading) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.fillStyle = PALETTE.mineBody;
  ctx.beginPath();
  ctx.moveTo(MISSILE_NOSE, 0);
  ctx.lineTo(-MISSILE_NOSE * 0.6, MISSILE_TAIL / 2);
  ctx.lineTo(-MISSILE_NOSE * 0.45, 0);
  ctx.lineTo(-MISSILE_NOSE * 0.6, -MISSILE_TAIL / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.bulletCore;
  ctx.beginPath();
  ctx.arc(MISSILE_NOSE * 0.4, 0, MISSILE_EYE, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawBullets(ctx, alpha) {
  const bullets = world.bullets.items;
  const trail = bulletTrailSprite();
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (!onScreen(b.x, b.y, BULLET_REACH)) continue;
    paintStreak(ctx, trail, paintX(b, alpha), paintY(b, alpha), Math.atan2(b.vy, b.vx), trailStretch(b));
  }

  ctx.fillStyle = PALETTE.bulletCore;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (b.hunts) continue;      // a hunting shot is drawn below, as a thing and not as a dot
    if (!onScreen(b.x, b.y, BULLET_REACH)) continue;
    const x = paintX(b, alpha);
    const y = paintY(b, alpha);
    if (b.charged) {
      // The light of a loaded shot, without a blur or a sprite: one wide faint ring under the
      // dot. It is the only way to see, while the shot is still in the air, that this pull was
      // the heavy one (game/overcharge.js), and a fan of six of them has to look heavier.
      ctx.strokeStyle = CHARGED_SOFT;
      ctx.lineWidth = CHARGED_BAND;
      ctx.beginPath();
      ctx.arc(x, y, CHARGED_CORE, 0, TAU);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, b.charged ? CHARGED_CORE : BULLET_CORE, 0, TAU);
    ctx.fill();
  }

  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (!b.hunts || !onScreen(b.x, b.y, BULLET_REACH)) continue;
    drawMissile(ctx, paintX(b, alpha), paintY(b, alpha), Math.atan2(b.vy, b.vx));
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
