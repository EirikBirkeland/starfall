// A boss, as drawn (PLAN 3.4, game/bosses.js).
//
// Three things live here and they are drawn at three different depths, because a boss is
// three different promises at once:
//
//   what it is promising      a band of light down each spoke it is holding, or the door it is
//     (drawn under the crowd)   lighting for a ring of shots: edge for edge the light that hurts,
//                               or the place that will not. Same shape and same colours as a
//                               sniper's lock (game/beams.js), because it is the same promise
//                               and a player should not have to learn a second language for a
//                               bigger enemy.
//
//   the ring itself             a large ring-shaped ship: the hoop, the spokes that are its
//     (drawn with the crowd)      frame, a hub, and a core whose light is the countdown of
//                                 whatever it is holding. It turns with the facing the fight is
//                                 drawn at (game/bosses.js `bossAngle`), which is the same number
//                                 the spokes are fired from, so the
//                                 picture and the simulation cannot disagree.
//
//   the cage                    four walls of cool light round the duel, faded in over the
//     (drawn over the arena)      arrival. Drawn the same three passes as the arena's own
//                                 wall (render/walls.js) so it reads as the same kind of
//                                 thing: not a hazard, a boundary.
//
// Nothing here is remembered between frames and nothing here is balance: every number is
// read out of the boss's own state or is a named constant below.

import { PALETTE, withAlpha } from '../core/palette.js';
import { BALANCE } from '../game/balance.js';
import { clamp, TAU } from '../core/math.js';
import { world } from '../game/world.js';
import {
  bossAngle, bossCoreOf, bossFlare, bossShape, bossTint, cageRise, cellProgress, coreCells,
  coreReach, windupProgress,
} from '../game/bosses.js';
import { glowFor, paintGlow } from './glow.js';
import { camera, onScreen } from './camera.js';
import { paintX, paintY } from './interp.js';
import { polygon } from './shapes.js';

// The ring. `hoop` is the body's own radius as a share of it - the ring is drawn *at* the
// radius the body is hurt by, so what you can fly into is what you can see, which is the one
// thing a boss may not be fuzzy about. Everything else is drawn inside it.
const HOOP = 0.94;
const HOOP_WIDTH = 0.2;      // px of hoop, as a share of the radius
const RIM_WIDTH = 2;         // px, the thin line inside the hoop
const RIM_REACH = 0.58;
const CELL_SIDES = 8;        // the hub: an octagon, so it reads as the same family as the hoop
const CELL_REACH = 0.3;
const SPOKE_WIDTH = 0.13;    // px of each spoke's bar, as a share of the radius
const SPOKE_FROM = 0.3;      // ... and where along the radius it starts and stops
const CORE_REACH = 0.34;     // px of light in the middle at rest
const CORE_CALM = 0.35;      // how bright that light is when nothing is being held ...
const CORE_SHOUT = 1;        // ... and at the end of a wind-up
const BREATH = 2.2;          // rad/s of breathing on the core, so it is never a dead light
const FLASH_LIGHT = 0.9;     // a hit is white, as it is for every body in the crowd
const HALO_REACH = 1.5;      // the ring's own light reaches half again past its hoop
const HALO_LIGHT = 0.5;

// The flare of a phase change: one ring going out and a white light over the body, both
// driven by the same 0..1 the simulation counts.
const FLARE_HALO = 1.3;
const FLARE_RING_FROM = 1.15;
const FLARE_RING_TO = 1.9;
const FLARE_LINE = 4;

// The cage. Three passes and ticks, exactly like the arena's wall (render/walls.js), and
// named for the same reasons.
const CAGE_LINE = 2;
const CAGE_MID = 7;
const CAGE_SOFT = 18;
const CAGE_LINE_LIGHT = 0.62;
const CAGE_MID_LIGHT = 0.16;
const CAGE_SOFT_LIGHT = 0.07;
const CAGE_TICK_SPACING = 40;
const CAGE_TICK_DEPTH = 14;   // reaching *inwards*: the cage is the room, not the outside
const CAGE_TICK_WIDTH = 2;
const CAGE_TICK_LIGHT = 0.34;
const CAGE_BREATH = 0.16;
const CAGE_BREATH_RATE = 1.9;
const CAGE_VISIBLE = 60;     // px past the window an edge is still worth stroking
const HIT_FLASH = BALANCE.enemies.hitFlash;   // the same white every other body wears

// The mass (the Hive, PLAN 3.4's 10:00). Its cells are bodies of the crowd - each one is hurt,
// pays out and walks on its own - and they are not drawn as seven separate bodies: seven
// hexagons that happen to be standing together are not one thing until something joins them,
// and the wax is what joins them. So the whole honeycomb is painted in one pass, from the core,
// and render/entities.js skips the cells on the way past (game/bosses.js `isBossPart`).
const MASS_LIGHT = 1.25;       // the mass's own light reaches a quarter past its outermost cell
const WAX_WIDTH = 1.0;         // the web from the core to a cell, as a share of the core's body
const WAX_LIGHT = 0.92;
const CELL_LINE = 2;           // px, a cell's own edge
const CELL_FILL = 0.75;        // a whole cell's fill ...
const CELL_STRESS = 0.9;       // ... and how much brighter one is that is about to come off
const CELL_EDGE = 0.8;         // a cell's edge, at rest
const BROOD_HALO = 1.5;        // a cell's brood light, as a share of its own radius
const BROOD_CALM = 0.1;        // how much of it is there before a cell starts to open ...
const BROOD_SHOUT = 1;         // ... and how much at the end of the wind-up
const BROOD_MOUTH = 0.42;      // px of white in the mouth of a cell that is opening
const MASS_CORE = 0.8;         // the core's own body, as a share of the radius it is hurt by
const BREATH_MASS = 1.8;       // rad/s of breathing on the core, so the mass is never a dead light

/** The four sides of a box the window can see, in the order the wall is stroked. */
const SIDES = [
  { horizontal: true, at: 0, from: 0, to: 0, inward: 1 },
  { horizontal: true, at: 0, from: 0, to: 0, inward: -1 },
  { horizontal: false, at: 0, from: 0, to: 0, inward: 1 },
  { horizontal: false, at: 0, from: 0, to: 0, inward: -1 },
];

/** Which of the box's four edges are anywhere near the window, and how much of each. */
function visibleSides(box) {
  const left = Math.max(camera.x, box.x0);
  const right = Math.min(camera.x + camera.w, box.x1);
  const top = Math.max(camera.y, box.y0);
  const bottom = Math.min(camera.y + camera.h, box.y1);
  let n = 0;

  // A side is drawn when there is a stretch of it on the glass *and* the glass is anywhere
  // near the line it lies on - the same two questions render/walls.js asks the arena.
  const push = (horizontal, at, from, to, inward) => {
    if (to <= from) return;
    const across = horizontal ? camera.y : camera.x;
    const beyond = horizontal ? camera.y + camera.h : camera.x + camera.w;
    if (at < across - CAGE_VISIBLE || at > beyond + CAGE_VISIBLE) return;
    const side = SIDES[n];
    side.horizontal = horizontal;
    side.at = at;
    side.from = from;
    side.to = to;
    side.inward = inward;
    n++;
  };

  push(true, box.y0, left, right, 1);
  push(true, box.y1, left, right, -1);
  push(false, box.x0, top, bottom, 1);
  push(false, box.x1, top, bottom, -1);
  return n;
}

function traceSide(ctx, side) {
  ctx.beginPath();
  if (side.horizontal) {
    ctx.moveTo(side.from, side.at);
    ctx.lineTo(side.to, side.at);
  } else {
    ctx.moveTo(side.at, side.from);
    ctx.lineTo(side.at, side.to);
  }
}

/** The ticks, reaching in from the wall so the room is what has edges. */
function drawCageTicks(ctx, side, light) {
  const first = Math.ceil(side.from / CAGE_TICK_SPACING) * CAGE_TICK_SPACING;
  if (first > side.to) return;

  ctx.beginPath();
  for (let along = first; along <= side.to; along += CAGE_TICK_SPACING) {
    if (side.horizontal) {
      ctx.moveTo(along, side.at);
      ctx.lineTo(along, side.at + side.inward * CAGE_TICK_DEPTH);
    } else {
      ctx.moveTo(side.at, along);
      ctx.lineTo(side.at + side.inward * CAGE_TICK_DEPTH, along);
    }
  }
  ctx.lineWidth = CAGE_TICK_WIDTH;
  ctx.strokeStyle = withAlpha(PALETTE.cageTick, CAGE_TICK_LIGHT * light);
  ctx.stroke();
}

/**
 * The cage, if one is closed. Arena coordinates, with the camera already applied, like the
 * arena's own wall it is drawn beside.
 */
export function drawCage(ctx) {
  const boss = world.boss;
  if (boss === null || boss.enemy === null) return;

  const box = world.field;
  const seen = visibleSides(box);
  if (seen === 0) return;

  // It arrives with the boss and it arrives all at once along its whole length, but it fades
  // up over `cage.open` so the room announces itself rather than blinking.
  const rise = cageRise(boss);
  if (rise <= 0) return;
  const breath = 1 - CAGE_BREATH / 2 + CAGE_BREATH / 2 * Math.sin(world.time * CAGE_BREATH_RATE);
  const light = rise * breath;

  for (let i = 0; i < seen; i++) {
    const side = SIDES[i];
    traceSide(ctx, side);

    ctx.lineWidth = CAGE_SOFT;
    ctx.strokeStyle = withAlpha(PALETTE.cageWall, CAGE_SOFT_LIGHT * light);
    ctx.stroke();

    ctx.lineWidth = CAGE_MID;
    ctx.strokeStyle = withAlpha(PALETTE.cageWall, CAGE_MID_LIGHT * light);
    ctx.stroke();

    ctx.lineWidth = CAGE_LINE;
    ctx.strokeStyle = withAlpha(PALETTE.cageWall, CAGE_LINE_LIGHT * light);
    ctx.stroke();

    drawCageTicks(ctx, side, light);
  }
}

/**
 * One mass: the wax, the cells of that one body that are still standing, and its core in the middle
 * of them. A fight that has broken into three hives is drawn three times through here, once per
 * body, which is the whole of why this takes a core and not a fight: the shape you can shoot is the
 * shape you can see, and there are three shapes to shoot now.
 *
 * Everything is drawn at the positions the simulation put them at, which is what lets the cells be
 * bodies of the crowd and still be one object on the glass.
 *
 * What a cell is about to do is told the way every other body tells it - on the cell itself, out of
 * its own `stage` and its own countdown (game/kinds.js `aimProgress`) - so the mouth that is opening
 * is lit whether or not the mass is facing the ship when it does.
 */
function drawTheMass(ctx, boss, core, alpha) {
  const enemy = core.enemy;
  const x = paintX(enemy, alpha);
  const y = paintY(enemy, alpha);
  const tint = bossTint(boss);
  const flare = bossFlare(boss);
  const flash = enemy.flash > 0 ? clamp(enemy.flash / HIT_FLASH, 0, 1) : 0;
  const cells = coreCells(core);
  const reach = coreReach(core);

  paintGlow(ctx, glowFor(tint, reach * MASS_LIGHT), x, y, HALO_LIGHT);
  if (flash > 0) paintGlow(ctx, glowFor(PALETTE.white, reach * MASS_LIGHT), x, y, flash * FLASH_LIGHT);
  if (flare > 0) {
    // The same sentence the ring speaks at a phase change: a shell going out, in the colour of the
    // phase it is on the way to, and one breath of white over the body.
    paintGlow(ctx, glowFor(PALETTE.white, reach * FLARE_HALO), x, y, Math.sin(flare * Math.PI));
    ctx.lineWidth = FLARE_LINE;
    ctx.strokeStyle = withAlpha(PALETTE.white, (1 - flare) * 0.8);
    ctx.beginPath();
    ctx.arc(x, y, reach * (FLARE_RING_FROM + (FLARE_RING_TO - FLARE_RING_FROM) * flare), 0, TAU);
    ctx.stroke();
  }

  // The wax first, and under everything: one fat stroke from the core to every cell that is
  // standing, which is what turns seven shapes into one thing. It is not the phase's colour,
  // because it is not a light the hive is showing anybody - it is the material the thing is cut
  // out of. Where a cell has been shot off there is nothing at all, and a hole going round with
  // the mass is what "broken apart" looks like from the outside.
  ctx.beginPath();
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (cell.hp <= 0) continue;
    ctx.moveTo(x, y);
    ctx.lineTo(paintX(cell, alpha), paintY(cell, alpha));
  }
  ctx.lineWidth = enemy.r * WAX_WIDTH;
  ctx.strokeStyle = withAlpha(PALETTE.hiveWax, WAX_LIGHT);
  ctx.stroke();

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (cell.hp <= 0) continue;
    const cx = paintX(cell, alpha);
    const cy = paintY(cell, alpha);
    if (!onScreen(cx, cy, cell.r * BROOD_HALO + 8)) continue;
    const open = cellProgress(cell);
    const hurt = 1 - clamp(cell.hp / cell.maxhp, 0, 1);

    // A cell fills up with light as its hull goes, which is the same trick a wounded bomber's
    // ring plays (game/kinds.js `blastPressure`): the body that is about to come off says so.
    polygon(ctx, cx, cy, cell.r, 6, cell.rot);
    ctx.fillStyle = withAlpha(PALETTE.hiveCell, CELL_FILL * (1 - CELL_STRESS) + hurt * CELL_STRESS);
    ctx.fill();
    ctx.lineWidth = CELL_LINE;
    ctx.strokeStyle = withAlpha(PALETTE.hiveCell, CELL_EDGE);
    ctx.stroke();

    // And the brood inside it: every cell wears a little of the phase's light, and the one that is
    // opening wears all of it, with a white mouth in the middle of it that fills as the wind-up
    // does. It is the only thing a cell can promise, so it is the thing it shouts.
    paintGlow(ctx, glowFor(tint, cell.r * BROOD_HALO), cx, cy,
      BROOD_CALM + (BROOD_SHOUT - BROOD_CALM) * open);
    if (open > 0) {
      paintGlow(ctx, glowFor(PALETTE.white, cell.r * BROOD_MOUTH), cx, cy, open);
    }
  }

  // The core, on top of its own honeycomb: a hexagon like its cells and smaller than any of them,
  // with the countdown of whatever the hive is holding burning in the middle of it. That light is
  // the same question the cells answer (`windupProgress`), which is what keeps the mass telling
  // the truth about "something is coming" even with the cells off the edge of the window.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(enemy.rot);
  polygon(ctx, 0, 0, enemy.r * MASS_CORE, 6, 0);
  ctx.fillStyle = withAlpha(tint, 0.32);
  ctx.fill();
  ctx.lineWidth = CELL_LINE;
  ctx.strokeStyle = withAlpha(tint, 0.9);
  ctx.stroke();
  ctx.restore();

  const breath = 1 - 0.2 + 0.2 * Math.sin(world.time * BREATH_MASS);
  const coreLight = CORE_CALM + (CORE_SHOUT - CORE_CALM) * windupProgress(boss);
  paintGlow(ctx, glowFor(PALETTE.white, enemy.r * MASS_CORE), x, y, coreLight * breath);
}

/** One spoke's bar: a solid line of the ring's own frame, from `from` to `to` of its radius. */
function spokeBar(ctx, angle, radius, from, to, width) {
  ctx.beginPath();
  ctx.moveTo(Math.cos(angle) * radius * from, Math.sin(angle) * radius * from);
  ctx.lineTo(Math.cos(angle) * radius * to, Math.sin(angle) * radius * to);
  ctx.lineWidth = width;
  ctx.stroke();
}

/**
 * The boss body. Called from render/entities.js in the middle of the crowd, so the canvas is
 * already in arena coordinates and `lighter` is already the blend.
 *
 * It is drawn at `enemy.r` - the same number the contact test, the broad phase and the cage
 * clamp use - and it turns with `enemy.rot`, which the boss's own walk keeps equal to the
 * ring's angle (game/bosses.js). Every light it wears is the same tint the hull bar wears, so
 * the phase you are fighting is the colour you are looking at.
 */
export function drawBoss(ctx, boss, enemy, alpha) {
  const x = paintX(enemy, alpha);
  const y = paintY(enemy, alpha);

  // Two shapes, because a boss may be a ring that turns on the spot or a mass that walks, and the
  // frame asks which (game/bosses.js `bossShape`) rather than learning any boss's name. Both of
  // them wear the phase's tint, so the colour a player is looking at answers "how far into the
  // fight am I" whoever is doing the fighting.
  if (bossShape(boss) === 'mass') {
    // Culled by the mass's own reach and not by the body the fight is measured by: a cell can be
    // standing well outside the core's radius, and a hive that lost its left hand at the edge of
    // the window would be a lie about the room.
    const core = bossCoreOf(boss, enemy);
    if (!onScreen(x, y, coreReach(core) * MASS_LIGHT + 20)) return;
    drawTheMass(ctx, boss, core, alpha);
    return;
  }

  const r = enemy.r;
  if (!onScreen(x, y, r * FLARE_RING_TO + 20)) return;
  const tint = bossTint(boss);
  const flare = bossFlare(boss);
  const flash = enemy.flash > 0 ? clamp(enemy.flash / HIT_FLASH, 0, 1) : 0;

  ctx.save();
  ctx.translate(x, y);

  paintGlow(ctx, glowFor(tint, r * HALO_REACH), 0, 0, HALO_LIGHT);
  if (flash > 0) paintGlow(ctx, glowFor(PALETTE.white, r * HALO_REACH), 0, 0, flash * FLASH_LIGHT);
  if (flare > 0) {
    // The flare of a phase change, drawn *out* of the body rather than over it: a ring going
    // out and a white light that breathes once. Both driven by the simulation's own 0..1, so
    // the shell it sheds is the phase it is on the way to and not a flourish.
    paintGlow(ctx, glowFor(PALETTE.white, r * FLARE_HALO), 0, 0, Math.sin(flare * Math.PI));
    ctx.lineWidth = FLARE_LINE;
    ctx.strokeStyle = withAlpha(PALETTE.white, (1 - flare) * 0.8);
    ctx.beginPath();
    ctx.arc(0, 0, r * (FLARE_RING_FROM + (FLARE_RING_TO - FLARE_RING_FROM) * flare), 0, TAU);
    ctx.stroke();
  }

  ctx.rotate(bossAngle(boss));
  const width = r * HOOP_WIDTH;

  // The spokes first, under the hoop, so the hoop's own line is unbroken where they meet it.
  ctx.strokeStyle = withAlpha(tint, 0.75);
  for (let i = 0; i < CELL_SIDES; i++) {
    spokeBar(ctx, i * TAU / CELL_SIDES, r, SPOKE_FROM, HOOP, r * SPOKE_WIDTH);
  }

  // The hoop: a wide soft pass, then the body of it, then a thin rim inside. Three passes
  // for the same reason every other light here gets three - it is how a thing looks like
  // light without asking the canvas for a blur (render/glow.js).
  ctx.beginPath();
  ctx.arc(0, 0, r * HOOP, 0, TAU);
  ctx.lineWidth = width * 2.6;
  ctx.strokeStyle = withAlpha(tint, 0.16);
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = withAlpha(tint, 0.55);
  ctx.stroke();
  ctx.lineWidth = RIM_WIDTH;
  ctx.strokeStyle = withAlpha(PALETTE.white, 0.5);
  ctx.beginPath();
  ctx.arc(0, 0, r * RIM_REACH, 0, TAU);
  ctx.stroke();

  // The hub, and the core inside it: the core is the countdown. Nothing is being held it is a
  // calm light; any wind-up has it at full - the spokes or the door, whichever it is showing - so
  // the ring says what it is about to do even with the bands culled off the edge of the window.
  polygon(ctx, 0, 0, r * CELL_REACH, CELL_SIDES, 0);
  ctx.fillStyle = withAlpha(tint, 0.35);
  ctx.fill();
  ctx.lineWidth = RIM_WIDTH;
  ctx.strokeStyle = withAlpha(tint, 0.9);
  ctx.stroke();

  const core = CORE_CALM + (CORE_SHOUT - CORE_CALM) * windupProgress(boss);
  const breath = 1 - 0.2 + 0.2 * Math.sin(world.time * BREATH);
  paintGlow(ctx, glowFor(PALETTE.white, r * CORE_REACH), 0, 0, core * breath);
  ctx.restore();
}
