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

// The crowd's silhouettes (PLAN 3.3, one row per kind in `BALANCE.kinds`).
//
// This is the only place the game says what a body is drawn as, and it has to be the only
// place for the same reason the palette is defined once: the palette audit
// (`tools/sights.js`, `tools/shape-lab.js`) has to measure the shape an eye is really given,
// and a table of shape *names* written down somewhere else can be wrong without anything
// noticing. Session 109 wrote one by eye and called three bodies darts where the renderer
// gave one of them a dart and two of them the ship.
//
// Every shape is drawn pointing along +x around the origin it is put at, at the radius the
// balance sheet gives the kind, and `render/entities.js` turns the body by `enemy.rot` - so
// where a shape points is what the simulation says it is pointing at (game/kinds.js: a
// drifter's nose is its way, a spitter's mouth is aimed at the ship, a tank's turn is its own
// slow pace). Two rules hold every one of them, and test/crowd-art.test.mjs is the ruler:
// a silhouette must cover most of the hurtbox it is hurt by, and it must not stand far past
// it, or shots land on nothing and bodies pass through each other.
export const CROWD_SHAPES = {
  // The drifter: three faces and no ideas. It is the plainest body in the game because it is the
  // plainest enemy - it walks at you - and it is what every tank comes apart into.
  //
  // The faces are bowed, and they were flat for a reason that has since been paid off. Flat faces
  // stand at half the radius the corners reach, so the triangle covered 42% of the 15 px circle that
  // hurts you - the worst share in the crowd - and three shots in five that the game counted were
  // seen to stop in the air beside it. Bowing the faces to 0.8 of the radius takes that to 75% and
  // leaves the corners exactly where they were, so the body reaches no further past its hurtbox than
  // it ever did. What it gives up is outline: a fuller body stands nearer the crowd's other full-ish
  // bodies, and a rounded triangle comes within 2.2 px of a spitter, 2.8 of a sniper and 3.9 of a
  // shielder's face. Colour pays for all three, and that is the whole licence for the change - the
  // pair this body used to be told from by shape alone, drifter against shielder, is 1.49 steps of
  // brightness apart since session 142 (see the note on PALETTE.violet), and a flat triangle was all
  // that pair had before.
  drifter: bulged(3, 1.0, 0.8),

  // The weaver: a quatrefoil - four shoulders with a body between them, no points on it. It used
  // to wear the ship's own dart with a shorter nose, which was a shape the eye already had two
  // other uses for - the ship, and the swarm that arrives in twenties - and `tools/shape-lab.js`
  // measured what that cost: the outline of a 10 px ship-dart and the outline of a darter's spear
  // never part by more than 2.4 px at any turn, and a pink body and a red body 0.43 of a step
  // apart at the same size were then one body in one shape.
  //
  // A four-pointed star does not fix it either, and that is the interesting part: a star is a
  // spear with three spare points, and the ruler turns bodies against each other, so it finds the
  // turn where a pair of points lines up with a nose and a tail (measured: 3.0 px at tip 1.75).
  // Shoulders are the answer because they are what a weaver is. It rocks its turn +-0.35 rad at
  // nine rad/s (game/kinds.js `spin`), a round body rocks invisibly and a shouldered one ticks -
  // four ticks to a quarter turn - and a shoulder is the one shape a spear cannot be turned into.
  weaver: lobed(4, 1.55, 1.15),

  // The darter: a long spear with a barbed tail. It is the only body in the crowd that is
  // longer than it is wide by a mile, which is what a thing that stops dead and comes down a
  // line at you should look like.
  //
  // The cheek stands 0.9r off the axis. It used to stand 0.6r, which is why the spear covered only
  // 56% of its own hurtbox: two thirds of the drawing is nose, and the circle that hurts you is the
  // bit behind the point, so a thin cheek is a body shots pass through. Widening the head is the
  // one way a spear can fill its circle and stay a spear - the point stays 2.1r out, the barb stays a
  // barb - and it brings the outline to 3.1 px from the weaver's clover, which is one shape and is
  // paid for by 1.21 steps of colour (session 142 again). The next nearest body is the drifter, at
  // 3.2 px with both size and colour behind it.
  darter: flanks([[2.1, 0], [0.3, 0.9], [-1.1, 0.34], [-0.5, 0]]),

  // The spitter: a fat back, a flat tail and a spout down the middle of it. Its mouth points at the
  // ship always (game/kinds.js), so the spout is the honest shape for the light the frame paints in
  // it - and it is on the axis rather than off it for the same reason the sniper's eye is: a body
  // that always turns to face something has to be symmetric about the way it faces, or it leans.
  // A round blob was not honest at all: the pentagon it used to be stood 3.7-3.9 px from the darter,
  // the drifter and the shielder at every turn, which is to say it was those bodies at other sizes.
  spitter: flanks([
    [1.70, 0], [1.15, 0.45], [0.60, 0.72], [-0.30, 0.92], [-1.10, 0.70], [-1.00, 0],
  ]),

  // The tank: six faces of the heaviest body in the crowd, and the only kind whose own turn is
  // a slow spin (game/kinds.js `walksHeavy`), so a hexagon is the honest shape for a body that
  // is a rolling weight rather than a pointed one. It is bigger than everything else here by
  // a mile, and that is what tells it apart.
  tank: plainPolygon(6),

  // The bomber: a mine - six studs out to a foot and cut back between them, so its edge is the
  // roughest thing in the crowd at any turn. That is the honest drawing for the body whose whole
  // being is the burst coming out of its middle, which is what the frame already says with the
  // fuse it breathes and the ring it lays on the floor (`drawEnemy`). Two drawings were measured
  // and failed: an octagon, and then an eight-studded shell, both of which sat 3.7-3.9 px from a
  // shielder's face at three quarters of a step of colour between them - two big warm bodies and
  // nothing to say which. Six long studs is what the ruler asked for, and cannot be mistaken for
  // a face at any turn.
  bomber: studded(6, 1.50, 0.85),

  // The shielder: all face and no tail, flat side towards the ship, because a face is what a
  // thing that stands between you and its friends is made of. It always points at the ship
  // (game/kinds.js), so the flat side is never by accident. The face is wider than the body it
  // stands on - it used to be about as wide as the drifter is tall, and a 17 px six-sided slab
  // is a drifter at 17 px: 3.8 px of outline between them, no size left to tell them apart by,
  // and a shielder that reads as a fat drifter is a shielder nobody kills first.
  shielder: flanks([
    [0.50, 0], [0.82, 0.90], [0.05, 1.12], [-0.55, 0.92], [-1.02, 0],
  ]),

  // The swarmling: the ship's own silhouette again with its nose pulled further out, so that
  // twenty of them read as a shoal (game/flock.js) rather than as a crowd.
  swarmling: shipDart(2.1),

  // The sniper: an eye, pointed where it is pointing. It is the only body in the game that
  // never moves, so the shape is the whole of how it is recognised - and an eye is the honest
  // shape for a thing whose entire being is a line of sight.
  //
  // It used to be a hairline of an eye: the two flanks stood half a radius off the axis, so the
  // drawing covered 53% of the 16 px circle that hurts you, and the pupil the frame lights inside it
  // (render/entities.js, EYE_LIGHT) is nine pixels of light in a body that stood eight pixels either
  // side of its axis. The two corners have never moved - only the flanks have been stood further off
  // the axis, twice now - so nothing about the eye reaches past the hurtbox a shot can be stopped by,
  // and it covers 84% of that circle, with 12.8 px of body either side of its axis for the pupil to
  // sit in.
  //
  // 1.6 is where it stops, and it is worth writing why, because 1.7 covers 88% and nothing fails.
  // A taller lens is a rounder lens, and a round body is a body the crowd already has: at 1.7 the eye
  // comes within 3.8 px of a bomber's studs, which spends a new shared silhouette (the deeper red
  // pays for it, at 1.49 steps - see PALETTE.sniper) and the crowd has only so much outline to go
  // round. Four points of coverage for a twelfth pair drawn as one shape is a bad trade, and past
  // that the argument is taste: at 1.8 the middle of the lens stands 0.9r off the axis, which is a
  // disc with two thorns in it, and what makes this body an eye is that it comes to a point at both
  // ends.
  sniper: lens(1.5, 1.6),
};

/** One kind's silhouette, and a loud answer for a kind nothing draws. */
export function crowdShape(type) {
  const shape = CROWD_SHAPES[type];
  if (shape === undefined) throw new Error('no crowd body is drawn as ' + type);
  return shape;
}

/**
 * The ship's own silhouette with its nose pulled out to `spike` times the body - the same four
 * points `shipPath` draws, written as a flank so that every crowd body is one of the three
 * forms the ruler can measure without a canvas: a polygon, a flank, a lobed body.
 */
function shipDart(spike) {
  return flanks([[spike, 0], [-0.75, 0.7], [-0.35, 0]]);
}

/**
 * The builders below (`plainPolygon`, `bulged`, `lens`, `studded`, `lobed`, `flanks`) are the whole
 * vocabulary the crowd is drawn with, and they are exported for `tools/try-body.js`: a proposed
 * body is then written in the same words as a shipped one, where a sweep that had to re-implement
 * them in a scratch file was a sweep measuring somebody's copy. Nothing in the game imports them -
 * the table above is the only thing in `src/` that calls them, and `shipDart` under them is one body
 * written in the vocabulary rather than a word of it.
 */

/** A regular polygon: the shape a body that only walks is drawn with. */
export function plainPolygon(sides) {
  return (ctx, r) => polygon(ctx, 0, 0, r, sides, 0);
}

/**
 * A body of `sides` corners at `tip`, with every face bowed out to `face` (both in radii).
 *
 * It is `lobed` with the arithmetic done the other way round, because what a body *is called* - a
 * rounded triangle - is a statement about its faces, and `lobed`'s third number is the control that
 * bows them, which is not a thing anyone can read off a shape. The middle of a quadratic stands a
 * quarter of the way from each end and half of the way from its control, and the two corners of a
 * face of a `sides`-gon stand `cos(pi / sides)` of the tip on the axis between them, so the control
 * has to go to `2 * face - tip * cos(pi / sides)`. Then a body can be given faces of a stated share
 * of its own hurtbox, which is the number `tools/shape-lab.js` measures coverage on.
 */
export function bulged(sides, tip, face) {
  return lobed(sides, tip, 2 * face - tip * Math.cos(Math.PI / sides));
}

/**
 * A lens: two quadratic flanks meeting in points `tip` radii fore and aft, each bulging out to
 * `height` / 2 radii at the middle. It is the shape of a body that is *all axis* - the way it is
 * pointed is the way it is aimed - and how much of its own hurtbox it covers is `height`'s
 * business alone: the tips stay put however tall the lens is, so a taller lens fills the circle
 * it is hurt by without ever reaching a pixel further past it.
 */
export function lens(tip, height) {
  return (ctx, r) => {
    ctx.beginPath();
    ctx.moveTo(r * tip, 0);
    ctx.quadraticCurveTo(0, r * height, -r * tip, 0);
    ctx.quadraticCurveTo(0, -r * height, r * tip, 0);
    ctx.closePath();
  };
}

/**
 * A body of `points` studs: the outline goes out to `tip` and back to `waist` once per stud,
 * with straight faces, so the edge of it is the busiest thing in the crowd at whatever size it
 * is drawn.
 */
export function studded(points, tip, waist) {
  return (ctx, r) => {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = (i / (points * 2)) * TAU;
      const rad = (i % 2 === 0 ? tip : waist) * r;
      const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
}

/**
 * A body of `n` lobes: the outline swings out to `tip` at every lobe and in to `waist` between
 * them, with each swing one quadratic so the body has no corners to catch the eye. Drawn with a
 * lobe pointing along +x, like everything else here.
 */
export function lobed(n, tip, waist) {
  return (ctx, r) => {
    ctx.beginPath();
    // The first lobe is always at bearing 0, which is the axis the body is turned to face where it
    // is going, and every one after it is `1/n` of a turn further round.
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const between = a + TAU / (2 * n);
      const next = a + TAU / n;
      const x = Math.cos(a) * r * tip;
      const y = Math.sin(a) * r * tip;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      ctx.quadraticCurveTo(
        Math.cos(between) * r * waist, Math.sin(between) * r * waist,
        Math.cos(next) * r * tip, Math.sin(next) * r * tip);
    }
    ctx.closePath();
  };
}

/**
 * A body written as one flank: pairs of [x, y] in radii, walked from the nose at +x round to
 * the tail. The other flank is the mirror of it, so every body written this way is symmetric
 * about the axis it turns on to face where it is going - which is what a body that always
 * points at something has to be, and what test/crowd-art.test.mjs holds.
 */
export function flanks(top) {
  return (ctx, r) => {
    ctx.beginPath();
    ctx.moveTo(r * top[0][0], r * top[0][1]);
    for (let i = 1; i < top.length; i++) ctx.lineTo(r * top[i][0], r * top[i][1]);
    for (let i = top.length - 1; i > 0; i--) ctx.lineTo(r * top[i][0], -r * top[i][1]);
    ctx.closePath();
  };
}
