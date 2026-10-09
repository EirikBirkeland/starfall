// Path helpers shared by the renderer. Each one leaves a path on the context
// for the caller to fill or stroke.

import { TAU } from '../core/math.js';

/** A regular polygon with `sides` corners. */
export function polygon(ctx, x, y, radius, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = rot + (i / sides) * TAU;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** The pointed ship silhouette, `spike` stretching the nose. */
export function shipPath(ctx, x, y, radius, rot, spike) {
  ctx.beginPath();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.moveTo(radius * spike, 0);
  ctx.lineTo(-radius * 0.75, radius * 0.7);
  ctx.lineTo(-radius * 0.35, 0);
  ctx.lineTo(-radius * 0.75, -radius * 0.7);
  ctx.closePath();
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// The ships' silhouettes (PLAN 3.7, game/ships.js). One per ship, each drawn pointing
// along +x around the origin it is put at, and each filled and stroked the same way in
// render/entities.js - so the shape is the only thing that tells five ships apart.
//
// They are all drawn at the one radius the balance sheet gives a ship
// (BALANCE.player.drawRadius): ships differ in silhouette and not in size, which is what
// keeps the game's oldest promise true whoever you fly - the core that gets hurt is a
// fraction of what you see, and the walls, the dash's shoulder and every ring the frame
// paints around you are all measured from that same radius. So no silhouette here may run
// away from it: they stay inside about 1.4 of it and they all wrap the middle they are drawn
// around, and test/ship-art.test.mjs holds every one of them to both.
export const SHIP_SHAPES = {
  // The dart the game has always flown, and the one every screenshot in the changelog shows.
  // Its nose reaches past the radius it is drawn at (16 px at the default 13), which is the
  // house convention rather than an accident: the point is where the shots leave from.
  dart(ctx, radius) {
    ctx.beginPath();
    ctx.moveTo(radius + 3, 0);
    ctx.lineTo(-radius * 0.72, radius * 0.82);
    ctx.lineTo(-radius * 0.35, 0);
    ctx.lineTo(-radius * 0.72, -radius * 0.82);
    ctx.closePath();
  },

  // The Bulwark: wide, short, and blunt at the front, because the fourth pip of hull is worth
  // being seen from across the arena. It is the only ship whose widest point is a shoulder
  // rather than a nose, which is what makes it read as a thing that walks in rather than one
  // that leans.
  hex(ctx, radius) {
    ctx.beginPath();
    ctx.moveTo(radius * 0.8, -radius * 0.55);
    ctx.lineTo(-radius * 0.1, -radius * 1.15);
    ctx.lineTo(-radius * 0.9, -radius * 0.7);
    ctx.lineTo(-radius * 0.9, radius * 0.7);
    ctx.lineTo(-radius * 0.1, radius * 1.15);
    ctx.lineTo(radius * 0.8, radius * 0.55);
    ctx.closePath();
  },

  // The Needle: all nose. Everything about it is pulled forward - the longest body in the
  // game and the thinnest, with small fins well back - so a ship with two hull and a great
  // deal of speed does not look like anything that could stand still and take a hit. Its
  // point reaches no further out than the dart's does: a longer ship is not a ship that may
  // poke through a wall.
  spike(ctx, radius) {
    ctx.beginPath();
    ctx.moveTo(radius * 1.23, 0);
    ctx.lineTo(radius * 0.15, radius * 0.26);
    ctx.lineTo(-radius * 0.5, radius * 0.62);
    ctx.lineTo(-radius * 0.4, radius * 0.12);
    ctx.lineTo(-radius * 0.95, 0);
    ctx.lineTo(-radius * 0.4, -radius * 0.12);
    ctx.lineTo(-radius * 0.5, -radius * 0.62);
    ctx.lineTo(radius * 0.15, -radius * 0.26);
    ctx.closePath();
  },

  // The Volt: a swept arrow with its tail split in two. The fork is the whole point of the
  // drawing - it is the shape of something that is expected to be somewhere else a moment
  // after now, which is the ship's entire argument about its own dash.
  bolt(ctx, radius) {
    ctx.beginPath();
    ctx.moveTo(radius * 1.2, 0);
    ctx.lineTo(-radius * 0.05, radius * 0.9);
    ctx.lineTo(-radius * 0.2, radius * 0.3);
    ctx.lineTo(-radius * 0.95, radius * 0.55);
    ctx.lineTo(-radius * 0.45, 0);
    ctx.lineTo(-radius * 0.95, -radius * 0.55);
    ctx.lineTo(-radius * 0.2, -radius * 0.3);
    ctx.lineTo(-radius * 0.05, -radius * 0.9);
    ctx.closePath();
  },

  // The Brood: a pod with two pods of its own, swept out either side and pulled in at the
  // waist behind them. It is the widest thing in the game from tip to tip after the Bulwark,
  // which is how a ship that arrives with drones on it says so without a word - and the shape
  // is the same one the ring of drones will be drawn around.
  pod(ctx, radius) {
    ctx.beginPath();
    ctx.moveTo(radius * 0.95, 0);
    ctx.lineTo(radius * 0.2, radius * 0.42);
    ctx.lineTo(radius * 0.6, radius * 0.95);
    ctx.lineTo(-radius * 0.55, radius);
    ctx.lineTo(-radius * 0.4, radius * 0.32);
    ctx.lineTo(-radius * 0.9, radius * 0.28);
    ctx.lineTo(-radius * 0.9, -radius * 0.28);
    ctx.lineTo(-radius * 0.4, -radius * 0.32);
    ctx.lineTo(-radius * 0.55, -radius);
    ctx.lineTo(radius * 0.6, -radius * 0.95);
    ctx.lineTo(radius * 0.2, -radius * 0.42);
    ctx.closePath();
  },
};

/** The silhouette a ship is drawn as, and a loud answer for a shape nothing draws. */
export function shipShape(name) {
  const shape = SHIP_SHAPES[name];
  if (shape === undefined) throw new Error('no ship is drawn as ' + name);
  return shape;
}
