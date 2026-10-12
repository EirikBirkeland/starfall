// The night a fight puts over the arena (PLAN 3.4's Eclipse phase 2: "the arena darkens, and only
// areas near the player and near bullets are lit").
//
// One pass, laid over the whole world's own pass and under the interface. It is a *veil*, not a
// dimming: the room is not made darker, it is covered up, and what is left to see are the holes cut
// in the covering by whatever is shining - the ship, every shot in the air, the fight's own bodies,
// the door a shell is being promised through, and the fans and blades of a sweep (render/arms.js).
// That is the difference that matters, and it is the
// same lesson the sun's own body had to learn (render/boss.js): a hole is not a dark colour, it is
// the pixels under it being gone, and `source-over` and `destination-out` are the only composites
// that can say so. The arena is painted additively, so a night laid down `lighter` would be a faint
// blue wash with every star still shining through it.
//
// HOW IT IS MADE, in three passes on one offscreen layer the size of the window:
//
//   `copy`            the night itself, one flat translucent fill. `copy` and not a clear then a
//                     fill: the layer is only ever this one colour, and the composite throws the
//                     last frame away in the same pass it lays this one down. Its alpha *is* the
//                     ramp (game/bosses.js `darknessOf`), which is how the night rolls in and lets
//                     go with nothing built or destroyed on the way.
//   `destination-out` the holes, stamped with one baked sprite (render/glow.js `holeFor`) at a
//                     scale per light. Baked sprites and not gradients because a frame may not build
//                     a gradient (test/draw-cost.test.mjs would not forgive it) and because a hole
//                     wants a soft edge as much as a light does.
//   `source-over`     the layer onto the window, stretched from its own CSS-pixel size to the
//                     canvas's device ones - which is where the pass is cheap: a light mask has no
//                     detail finer than a soft edge to lose, so it is cut and composited at a
//                     quarter of the pixels of a HiDPI screen and nothing can tell.
//
// The layer is kept in arena coordinates, translated once, so every light is punched where the
// simulation put it and the same cull the rest of the frame uses (render/camera.js `onScreen`) is
// what says which of them are worth a stamp at all.
//
// It is pinned to the window and does not shake with the frame, for the same reason the vignette is
// (render/renderer.js): a night that jitters six pixels sideways reads as a fault in the window and
// not as a sun going across it. The lights inside it are punched where the *things* stand, so a
// shake moves the world a few pixels inside its own lit places, which is what a shaking frame does
// to the edges of the window anyway.
//
// What it costs: one full-window fill, one stamp per light, and one full-window composite - all of
// them on a sheet at CSS resolution, and none of them on any frame of the game that is not standing
// under a dark sun.
//
// None of it is simulated. `world.darkness` is stepped by the boss framework and read here and
// nowhere else; nothing about what is lit is fed back to anything, so a fight may take the room away
// without moving one thing in it, and every fingerprint of every run is unchanged by this file.

import { PALETTE, withAlpha } from '../core/palette.js';
import { hypot } from '../core/math.js';
import { BALANCE } from '../game/balance.js';
import { world } from '../game/world.js';
import { bossCores, coreReach, darknessOf } from '../game/bosses.js';
import { camera, onScreen } from './camera.js';
import { view } from './canvas.js';
import { holeFor, paintGlow } from './glow.js';
import { paintX, paintY } from './interp.js';
import { doorNow, doorWedge } from './entities.js';
import { bandEnds, bladesOf, fansOf } from './arms.js';

// One hole sprite for every light's size: what `scale` does to it is grow the soft edge along with
// the light, which is what a light's edge does anyway (render/glow.js).
const HOLE = 96;
// Below this the night is not worth two full-window passes. It is also what makes the whole pass
// vanish on every frame of every run that is not standing under a dark sun.
const MINIMUM = 0.003;

/** The layer, and the window it was last cut to. */
const layer = { canvas: null, ctx: null, w: 0, h: 0 };

/** The window-sized layer, in arena coordinates: built once, recut whenever the window is. */
function layerOf() {
  if (layer.ctx === null) {
    layer.canvas = document.createElement('canvas');
    layer.ctx = layer.canvas.getContext('2d');
  }
  if (layer.w !== view.W || layer.h !== view.H) {
    layer.w = view.W;
    layer.h = view.H;
    layer.canvas.width = Math.round(view.W);
    layer.canvas.height = Math.round(view.H);
  }
  return layer.ctx;
}

/**
 * One light: a hole stamped at `radius`, `strength` of the night let back through it.
 *
 * Off the glass a light is not worth a stamp, and the cull is the frame's own (render/camera.js)
 * with the light's reach as its padding - which is the right question, because what has to be on the
 * window is the *lit place* and not the thing standing in the middle of it.
 */
function punch(g, x, y, radius, strength) {
  if (radius <= 0 || strength <= 0) return;
  if (!onScreen(x, y, radius)) return;
  paintGlow(g, holeFor(HOLE), x, y, Math.min(1, strength), radius / HOLE);
}

/**
 * One side's shots, every one of them its own little lantern on its way across the room. This is
 * what keeps a fight in the dark a fair one: the harm in this game is mostly thrown, and thrown
 * things are what the night is not allowed to hide.
 */
function punchShots(g, shots, radius, alpha) {
  const items = shots.items;
  for (let i = 0; i < shots.count; i++) {
    punch(g, paintX(items[i], alpha), paintY(items[i], alpha), radius, 1);
  }
}

/**
 * The bodies a fight is standing on. A boss is the brightest thing in the room it is darkening and
 * must never be lost in its own night: the rim is the countdown and, for the sun, the corona is
 * where the drag is drawn (render/boss.js), so the whole of it is left showing.
 */
function punchBodies(g, boss, alpha) {
  const share = BALANCE.bosses.dark.light.body;
  const cores = bossCores(boss);
  for (let i = 0; i < cores.length; i++) {
    const body = cores[i].enemy;
    if (body.hp <= 0) continue;
    // `coreReach` is how far a body reaches, which is also what the frame culls it by
    // (render/boss.js), so a mass's cells are never standing in the dark outside their own light.
    punch(g, paintX(body, alpha), paintY(body, alpha), coreReach(cores[i]) * share, 1);
  }
}

/**
 * The door a shell is being promised through, left out of the night.
 *
 * This is the fairness of the whole row: a promise the dark has eaten is no promise, and
 * `bosses.telegraphMin` does not care how dark it is. Both halves of the promise are let out - the
 * whole route a walking door travels, and the door where it stands - and both are asked out of
 * render/entities.js `doorWedge` and `doorNow`, the same two answers the door's own light is
 * painted from, so what the ship is shown is what the shots leave out. Nothing is let through
 * *fully*, because a door is a lit place in a dark room and not a second arena with the crowd
 * standing in it.
 *
 * The two are one wedge whenever the door does not walk, and then it is cut once: a hole punched
 * twice in the same place is a hole punched twice, and the night's budget is stamps.
 */
function punchDoor(g, boss, alpha) {
  const body = boss.enemy;
  if (body === null) return;
  const x = paintX(body, alpha);
  const y = paintY(body, alpha);
  const route = doorWedge(boss, x, y);
  if (route === null) return;
  const door = doorNow(boss, x, y);
  if (door === null) return;
  if (!onScreen(x, y, Math.max(route.reach, door.reach))) return;

  const share = BALANCE.bosses.dark.light.door;
  punchWedge(g, x, y, route, share);
  // Only again when the door is not standing inside its own route's reach: a walking door can have
  // its route clipped short by a wall the door itself points away from, and a lit door the night
  // has eaten the edge of is exactly the bug this function exists to stop.
  if (Math.abs(door.reach - route.reach) > 1 || door.to - door.from < route.to - route.from - 1e-9) {
    punchWedge(g, x, y, door, share);
  }
}

/** Leave one wedge of the room out of the night, at a share of the night's own depth. */
function punchWedge(g, x, y, wedge, share) {
  g.beginPath();
  g.moveTo(x, y);
  g.arc(x, y, wedge.reach, wedge.from, wedge.to);
  g.closePath();
  g.globalAlpha = share;
  g.fill();
  g.globalAlpha = 1;
}

/** Is there a room to be dark in: a fight standing in the arena with bodies left. */
function fighting() {
  return world.boss !== null && world.boss.cores.length > 0;
}

/**
 * The fans a fight is promising and the blades it has let go, left out of the night.
 *
 * The same fairness as the door's, and one degree sharper: a sweep is a promise *and* a hazard that
 * travels, and a fan the dark has eaten is not a thing to dodge but a wall to be standing inside
 * when it arrives. Both halves are asked of render/arms.js, which is the one place that knows where
 * either of them is, so the night cannot disagree with the light about which part of the room is on
 * fire - and a promise the frame paints and the dark hides is the worst bug this feature has.
 */
function punchBlades(g, boss, alpha) {
  const share = BALANCE.bosses.dark.light.blade;

  const fans = fansOf(boss, alpha);
  for (let i = 0; i < fans.length; i++) {
    const fan = fans[i];
    if (!onScreen(fan.x, fan.y, fan.reach)) continue;
    g.beginPath();
    g.moveTo(fan.x, fan.y);
    g.arc(fan.x, fan.y, fan.reach, fan.from, fan.to);
    g.closePath();
    g.globalAlpha = share;
    g.fill();
    g.globalAlpha = 1;
  }

  const blades = bladesOf(world.arms, alpha);
  for (let i = 0; i < blades.length; i++) {
    // Nothing is culled here, unlike every other punch in this file: a blade is over 500 px long and
    // its middle can be off the window while its tip is not, and a hole the tip did not get would be
    // a blade with a dark end on it.
    bandOutline(g, bandEnds(blades[i]), blades[i].half);
    g.globalAlpha = share;
    g.fill();
    g.globalAlpha = 1;
  }
}

/**
 * The path of one band: `half` px each side of the line between its two ends.
 *
 * A rectangle and not a wedge on purpose - a blade is drawn at a constant width and hurts at one too
 * (game/arms.js), and a carve that tapered would be a hole wider than the thing it is letting
 * through, which is a glow and not a blade.
 */
function bandOutline(g, ends, half) {
  const dx = ends.x1 - ends.x0;
  const dy = ends.y1 - ends.y0;
  const length = hypot(dx, dy) || 1;
  const nx = -dy / length * half;
  const ny = dx / length * half;
  g.beginPath();
  g.moveTo(ends.x0 + nx, ends.y0 + ny);
  g.lineTo(ends.x1 + nx, ends.y1 + ny);
  g.lineTo(ends.x1 - nx, ends.y1 - ny);
  g.lineTo(ends.x0 - nx, ends.y0 - ny);
  g.closePath();
}

/**
 * Lay the night, if there is any to lay. Called last of the world's own pass and before the
 * interface (render/renderer.js), in window coordinates: it puts one sheet on the canvas and
 * nothing else.
 */
export function drawDarkness(ctx, alpha) {
  const level = darknessOf(world);
  if (level < MINIMUM) return;

  const light = BALANCE.bosses.dark.light;
  const g = layerOf();

  // The night, replacing the last frame. `copy` clears as it fills, so this one pass is the whole of
  // the layer's own reset - and its alpha is the ramp, which is why the fade in and the fade out
  // need no state and no cleanup anywhere else.
  //
  // In the sheet's OWN coordinates, from its own corner, and over all of it. The layer is as big as
  // the window and the arena is a thousand times bigger, so filling the rectangle the window is
  // *looking at* would fill a strip of the sheet and `copy` would clear the rest: a night with a
  // bright band down the top and the left of the screen. The camera is only applied below, with the
  // lights, because the covering has no business knowing where the frame is looking.
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'copy';
  g.globalAlpha = 1;
  g.fillStyle = withAlpha(PALETTE.eclipseNight, level);
  g.fillRect(0, 0, layer.w, layer.h);

  // From here the layer is arena coordinates, like the frame it is being laid over.
  g.translate(-camera.x, -camera.y);
  g.globalCompositeOperation = 'destination-out';

  const ship = world.player;
  punch(g, paintX(ship, alpha), paintY(ship, alpha), light.ship, 1);
  punchShots(g, world.enemyShots, light.shot, alpha);
  punchShots(g, world.bullets, light.bullet, alpha);
  if (fighting()) {
    punchBodies(g, world.boss, alpha);
    punchDoor(g, world.boss, alpha);
    punchBlades(g, world.boss, alpha);
  }

  // And the veil goes on. Window coordinates again, and `source-over`: the one composite in the game
  // that means *over*.
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(layer.canvas, 0, 0, view.W, view.H);
}
