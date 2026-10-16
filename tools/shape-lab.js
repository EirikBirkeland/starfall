// The ruler for silhouettes: what a body's outline actually looks like, and how far another
// body's outline stands from it.
//
// The palette audit (`tools/colour-lab.js`, `tools/sights.js`) can say how far two colours are
// apart, and it has always had to take a body's *shape* on trust: `tools/sights.js` writes a
// name next to each kind - 'triangle', 'dart', 'bulwark' - and the audit treats two bodies with
// one name as one shape and two bodies with two names as two. That is a claim about names and
// not about pictures. A pentagon and a hexagon have two names and are one body to an eye; a
// 14 px pentagon and a 17 px hexagon are one body to an eye at a harder level still. Session
// 109 found that the names could simply be wrong and wrote a test that reads the renderer's
// source; the names can be right and still be worthless, which is what this file is for.
//
// ### What is measured, and why this measure
//
// A silhouette is turned into a **radius profile**: for each of 96 bearings, how far the
// outline stands from the middle in that direction. That is the whole of what an eye has from
// an edge-lit body on a dark sky at 10-30 px - where its edge is, all the way round - and it
// ignores what the ruler must not see: fill, glow, and the light painted inside the body.
//
// Two bodies are then compared by **how far one outline stands from the other**, in world px,
// with the pair allowed to turn freely against each other (a body's turn is decided by what it
// is pointing at, and a tank's is a slow spin, so any relative turn can be seen). The mean
// over the bearings is what a glance takes in; the worst bearing is printed with it because a
// single 12 px nose is a real cue even when the rest of the outline is a match.
//
// Why not overlap of area instead - IoU, which is the obvious first attempt? Because area is
// dominated by size: two round bodies of similar radius overlap by two thirds whatever they
// are, and a difference of shape that an eye reads loudly (a spout, a fin, a nose) barely moves
// the number. The outline distance ranks the pairs the way the eye does - these are the shipped
// crowd, measured, and they are the three points of the scale:
//
//     the drifter and the darter, a triangle and a spear        2.6 px (worst bearing 10.8)
//     the drifter and the shielder, a triangle and a wall       6.7 px
//     the tank and the sniper, two sizes and two families      11.6 px
//
// Sizes are still a cue - the audit has always said so, and `SAME_SIZE_RATIO` is its bar - but
// they are a cue of their own, so shape is measured on its own here and a pair is allowed to be
// carried by either. Size is *not* divided out of the number, deliberately: a 26 px hexagon and
// a 7 px hexagon do not look like the same body to an eye, and this ruler reports pictures.
// `silhouettePairs` prints the size ratio beside it so a reader is not counting the same
// evidence twice.
//
// ### The two geometry rules every body is held to
//
// A silhouette is a *drawing of the thing you get hit by*, so two things are promised about
// each one: it has to cover most of the hurtbox it is hurt by, or a shot that lands visibly
// misses, and it must not stand far outside it, or a shot that misses visibly lands. Both are
// measured off the rasterised body, in share-of-hurtbox and in px of reach.

import { BALANCE } from '../src/game/balance.js';
import { CROWD_SHAPES, crowdShape } from '../src/render/shapes.js';

const TAU = Math.PI * 2;
const BEARINGS = 96;   // how finely a radius profile is sampled
const TURNS = 24;      // how finely two bodies are allowed to turn against each other
const SAMPLE = 0.5;    // px between samples when a path is rasterised

/**
 * A mean outline gap under this many px, and two bodies are **one shape**: nowhere does one
 * edge stand far enough from the other to be the difference an eye is given, so colour or size
 * has to carry the pair instead.
 *
 * It is the width of the pen (`BODY_LINE` in `render/entities.js` is 2 px, and a glow halo is
 * laid over the edge as well) with room for a wobble: two outlines that never part by more than
 * about one and a half pen widths are one outline at a glance. Everything the game draws
 * itself with is measured against this bar in `test/crowd-art.test.mjs`.
 */
export const ONE_SHAPE_PX = 4;

/**
 * Over `ONE_SHAPE_PX` and under this, and the pair is **thin**: the outline is doing *something*
 * and not a lot. Printed in the report so that a session can see what the crowd is leaning on
 * without the gate failing on it - the game also tells bodies apart by how they walk, and no
 * static ruler can see walking.
 */
export const THIN_SHAPE_PX = 6;

/**
 * A context that records a path instead of drawing it: the same trick
 * `test/ship-art.test.mjs` plays, with the curves flattened into line segments and enough of
 * the canvas protocol to take what `render/shapes.js` asks for. Anything else is a bug and
 * throws, in the same spirit as the headless canvas stub.
 */
export function pathRecorder() {
  const polys = [];
  let cur = null;
  const push = (p) => { if (cur === null) { cur = [p]; polys.push(cur); } else cur.push(p); };
  return {
    polys,
    beginPath() { polys.length = 0; cur = null; },
    moveTo(x, y) { push({ x, y }); },
    lineTo(x, y) { push({ x, y }); },
    quadraticCurveTo(cx, cy, x, y) {
      const a = cur[cur.length - 1];
      for (let i = 1; i <= 16; i++) {
        const t = i / 16, u = 1 - t;
        push({
          x: u * u * a.x + 2 * u * t * cx + t * t * x,
          y: u * u * a.y + 2 * u * t * cy + t * t * y,
        });
      }
    },
    arc(x, y, radius, a0, a1) {
      const steps = 32;
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps;
        push({ x: x + Math.cos(a) * radius, y: y + Math.sin(a) * radius });
      }
    },
    closePath() {},
    save() { throw new Error('a silhouette may not save the context: it is a path, not a picture'); },
    translate() { throw new Error('a silhouette is drawn at the origin and turned by its body'); },
    rotate() { throw new Error('a silhouette is drawn pointing at +x and turned by its body'); },
  };
}

/** The outline a shape draws at radius `r`, as one array of points per sub-path. */
export function outline(shape, r) {
  const ctx = pathRecorder();
  shape(ctx, r);
  return ctx.polys.filter((p) => p.length > 2);
}

/** How far a shape reaches: forward, back, up and down, to a side, and the furthest point. */
export function extent(shape, r) {
  let forward = -Infinity, back = Infinity, side = 0, reach = 0, up = Infinity, down = -Infinity;
  for (const poly of outline(shape, r)) {
    for (const p of poly) {
      forward = Math.max(forward, p.x);
      back = Math.min(back, p.x);
      up = Math.min(up, p.y);
      down = Math.max(down, p.y);
      side = Math.max(side, Math.abs(p.y));
      reach = Math.max(reach, Math.hypot(p.x, p.y));
    }
  }
  return { forward, back, side, reach, up, down };
}

/** How far the outline stands from the middle along every bearing. */
export function profile(shape, r) {
  const segs = [];
  for (const poly of outline(shape, r)) {
    for (let i = 0; i < poly.length; i++) segs.push([poly[i], poly[(i + 1) % poly.length]]);
  }
  const out = new Float64Array(BEARINGS);
  for (let b = 0; b < BEARINGS; b++) {
    const a = (b / BEARINGS) * TAU;
    const dx = Math.cos(a), dy = Math.sin(a);
    let far = 0;
    for (const [p, q] of segs) {
      const ex = q.x - p.x, ey = q.y - p.y;
      const denom = dx * ey - dy * ex;
      if (Math.abs(denom) < 1e-12) continue;
      const t = (p.x * dy - p.y * dx) / denom;   // along the segment
      if (t < 0 || t > 1) continue;
      const along = (p.x + t * ex) * dx + (p.y + t * ey) * dy;   // along the bearing
      if (along > far) far = along;
    }
    out[b] = far;
  }
  return out;
}

/**
 * How far one body's outline stands from another's, in px, best-aligned over a relative turn.
 *
 * Best-aligned is the strict reading: two bodies can be seen at any turn against each other - a
 * tank turns on its own pace, a drift round is whatever its heading is - so if there is a turn at
 * which they match, they can be mistaken. `mean` is what a glance takes in and is what the bar is
 * measured against; `worst` is the single bearing that parts them most and `arc` the share of the
 * circle where they part by more than a pen width, both printed because they say which kind of
 * pair this is: `spitter / shielder` (2.8 px mean, 6.5 px worst, 22% of the circle) is two blobs
 * of one family at two sizes, and `darter / sniper` (3.4 px mean, 18.5 px worst, 9%) is two
 * bodies that agree nearly everywhere and scream at one bearing.
 *
 * Size is *not* divided out, which was tried and dropped: standing the two outlines on one radius
 * before differencing them can only shrink a difference, and the other reading that was tried -
 * how big a share of the circle parts by more than the bar - ranks the crowd's 36 pairs the same
 * way the mean does. One number is easier to argue with than three that agree. Size stays a cue
 * of its own, reported next to the gap as `sizeRatio` and never counted twice.
 */
export function edgeGap(a, b) {
  const pa = typeof a.shape === 'function' ? profile(a.shape, a.r) : a.profile;
  const pb = typeof b.shape === 'function' ? profile(b.shape, b.r) : b.profile;
  let best = null;
  for (let turn = 0; turn < TURNS; turn++) {
    let sum = 0, worst = 0, arc = 0;
    for (let i = 0; i < BEARINGS; i++) {
      const d = Math.abs(pa[i] - pb[(i + turn) % BEARINGS]);
      sum += d;
      if (d > worst) worst = d;
      if (d > ONE_SHAPE_PX) arc++;
    }
    const mean = sum / BEARINGS;
    // The kindest turn is the one that matters; on ties, the kindest on the worst bearing.
    const row = { mean, worst, arc: arc / BEARINGS };
    if (best === null || row.mean < best.mean - 1e-9
        || (row.mean < best.mean + 1e-9 && row.worst < best.worst)) best = row;
  }
  return best;
}

/**
 * Is this a pair of **one shape**? The mean is the whole test, and the bar is `ONE_SHAPE_PX`.
 *
 * Exported so that the report, the tests and the audit all ask the same question the same way.
 */
export function oneShape(gap) {
  return gap.mean <= ONE_SHAPE_PX;
}

/** Is the point inside the path? (nonzero winding, which is what `fill()` uses.) */
function inside(polys, x, y) {
  let w = 0;
  for (const p of polys) {
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const a = p[j], b = p[i];
      if (a.y <= y) { if (b.y > y && ((b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y)) > 0) w++; }
      else if (b.y <= y && ((b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y)) < 0) w--;
    }
  }
  return w !== 0;
}

/**
 * What share of the hurtbox the drawing covers, and how far the drawing covers past it.
 *
 * A body is hurt by the circle the balance sheet gives it (`BALANCE.kinds.*.radius`), so the
 * drawing owes that circle a solid fill: a body that covers half of it is a body that shots
 * pass through, and one that reaches 2 r out is a body that eats shots it never felt.
 */
export function hurtboxFit(shape, r) {
  const polys = outline(shape, r);
  let inDisc = 0, covered = 0, uncovered = 0;
  for (let y = -r; y <= r; y += SAMPLE) {
    for (let x = -r; x <= r; x += SAMPLE) {
      if (Math.hypot(x, y) > r) continue;
      inDisc++;
      if (inside(polys, x, y)) covered++;
      else uncovered++;
    }
  }
  const ext = extent(shape, r);
  return {
    covered: covered / inDisc,
    missed: uncovered / inDisc,
    reach: ext.reach,
    reachOverR: ext.reach / r,
  };
}

/** The drawn area in square px. */
export function area(shape, r) {
  const ext = extent(shape, r);
  const step = SAMPLE;
  let count = 0;
  const polys = outline(shape, r);
  for (let y = ext.up - 1; y <= ext.down + 1; y += step) {
    for (let x = ext.back - 1; x <= ext.forward + 1; x += step) {
      if (inside(polys, x, y)) count++;
    }
  }
  return count * step * step;
}

/** One crowd body, as the balance sheet and the shape table draw it. */
export function crowdBody(type) {
  const stats = BALANCE.kinds[type];
  if (stats === undefined) throw new Error('no enemy kind is called ' + type);
  return { type, shape: crowdShape(type), r: stats.radius };
}

/** Every crowd body, in the order the balance sheet lists the kinds. */
export function crowdBodies() {
  return Object.keys(BALANCE.kinds).map(crowdBody);
}

/**
 * Every pair of crowd bodies, worst-told-apart first.
 *
 * `gap` is the outline distance, `same` is whether the outline is doing nothing for the pair.
 * What a `same` pair has left is colour and size, which is `tools/sights.js`'s business, so the
 * pair rows carry their colour separation too - measured by the colour ruler, not guessed.
 */
export function crowdPairs(bodies = crowdBodies()) {
  const withProfiles = bodies.map((body) => ({ ...body, profile: profile(body.shape, body.r) }));
  const rows = [];
  for (let i = 0; i < withProfiles.length; i++) {
    for (let j = i + 1; j < withProfiles.length; j++) {
      const a = withProfiles[i], b = withProfiles[j];
      const gap = edgeGap(a, b);
      rows.push({
        a: a.type,
        b: b.type,
        gap: gap.mean,
        worst: gap.worst,
        arc: gap.arc,
        size: Math.max(a.r, b.r) / Math.min(a.r, b.r),
        same: oneShape(gap),
        thin: gap.mean <= THIN_SHAPE_PX,
      });
    }
  }
  rows.sort((x, y) => x.gap - y.gap);
  return rows;
}

/** The shapes as a reader can see them without a browser: one row of text per body. */
export function ascii(shape, r, cellPx = 1.5) {
  const polys = outline(shape, r);
  const ext = extent(shape, r);
  const step = Math.max(SAMPLE, cellPx);
  const out = [];
  for (let y = ext.up - 1; y <= ext.down + 1; y += step) {
    let line = '';
    for (let x = ext.back - 1; x <= ext.forward + 1; x += step) {
      let any = false;
      for (let dy = 0; dy < step && !any; dy += SAMPLE) {
        for (let dx = 0; dx < step && !any; dx += SAMPLE) {
          if (inside(polys, x + dx, y + dy)) any = true;
        }
      }
      line += any ? '#' : '.';
    }
    out.push(line);
  }
  return out.join('\n');
}
