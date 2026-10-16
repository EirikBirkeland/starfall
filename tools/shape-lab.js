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
// the number. The outline distance ranks the pairs the way the eye does - these three points of the
// scale are read off the shipped crowd, and every one of them moves the day a body is redrawn, so
// `tools/palette-check.js` is the thing to believe (prose about measurements goes stale the moment a
// body moves):
//
//     the drifter and the weaver, a bowed triangle and a clover       1.3 px (worst bearing 3.5)
//     the spitter and the bomber, a spout and a mine                  5.1 px
//     the tank and the swarmling, the biggest body and the smallest  18.9 px
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
//
// ### Running it
//
// `node tools/shape-lab.js` prints what every body in the crowd covers, worst first, and
// `node tools/shape-lab.js --show sniper` draws one of them in text with the two bad states
// marked out. What each body is held to is pinned per kind in `test/crowd-art.test.mjs`; which
// pairs of bodies have to be told apart, and what each pair has left to tell it with, is read
// out by `tools/palette-check.js`, which borrows this file's outline distance to do it.

import { BALANCE } from '../src/game/balance.js';
import { crowdShape } from '../src/render/shapes.js';
import { pathToFileURL } from 'node:url';

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
 * What each body has to cover of its own hurtbox, as a share of the disc.
 *
 * One number per kind and not a single floor, because the crowd's worst share is a decision and not
 * a threshold: the swarmling wears the ship's own dart, and a body whose length is a nose cannot
 * fill a circle and keep the nose. A single floor set at the worst body's share would let a
 * thinning of the other eight pass unnoticed, which is exactly the regression this table is for: a
 * flank shaved, a tail lengthened, a body quietly redrawn as a hairline.
 *
 * The comment on each row is what the body covers today; the number is that, with a point or two of
 * room left to breathe. It goes up when a body is made fatter. It comes down only with an argument
 * written where the shape is, in `src/render/shapes.js`.
 *
 * It lives here because it is a bar on a measurement and this file makes the measurement, and
 * because two rulers read it: `test/crowd-art.test.mjs` holds the shipped crowd to it, and
 * `tools/try-body.js` refuses a proposal that would come under it. A bar that only a test can see
 * is invisible to the tool that draws up the proposal, which is how a session ends up shipping a
 * draft it had already measured as too thin.
 */
export const COVERS = {
  swarmling: 0.44,  // 45% - it wears the ship's dart; the 2.1r nose is what a point costs
  sniper: 0.83,     // 84% - the lens stood taller again, and no longer: same two corners
  drifter: 0.74,    // 75% - three faces bowed, corners exactly where they always were
  darter: 0.77,     // 78% - the head filled to a 0.9r cheek; the nose is 2.1r and stays there
  tank: 0.80,       // 83%
  shielder: 0.80,   // 84% - the face is wider than the body it stands on
  spitter: 0.90,    // 92%
  bomber: 0.90,     // 94%
  weaver: 0.95,     // 100%
};

/**
 * What an outline encloses, as a share of the hurtbox: the square of its closest bearing.
 *
 * This is not a bar and nothing is gated on it. It is a fact about a shape that a bar read off
 * yesterday's drawing cannot express: an outline that never comes nearer than `q` of the radius to
 * the middle *encloses* a disc of `q r`, and everything outside that disc is air a shot can stop in.
 * A flat triangle - the drifter as it shipped until session 143 - reaches 1r at three corners and no
 * nearer than 0.5r anywhere else, so it encloses a quarter of the circle it hurts with. Say that out
 * loud and "its bar is 40%" stops being the interesting number about it.
 */
export function inscribedShare(shape, r) {
  let nearest = Infinity;
  for (const reach of profile(shape, r)) nearest = Math.min(nearest, reach);
  // Capped at the whole hurtbox. An outline can enclose *more* than the circle that hurts you - the
  // weaver's lobes stand 1.15r out all the way round - and the only claim worth printing is that it
  // holds all of the circle there is.
  return Math.min(1, (nearest / r) ** 2);
}

/**
 * How far past its own radius a silhouette may reach, in radii.
 *
 * A nose is the house convention - the darter's spear and a swarmling's point stand twice their
 * radius out, which is what a thing that lunges looks like - so the bar is the longest nose in the
 * crowd with a little room, and not a round number: it is measured off the crowd by
 * `noseCeiling()` below rather than written down, because "longest nose plus room" is the whole
 * argument and the number has to follow the day a body grows a nose. Past the bar a body eats
 * shots it never felt, along the very axis the player aims on.
 *
 * `test/crowd-art.test.mjs` holds every shipped body to it and `tools/try-body.js` refuses a
 * proposal that grows one past it.
 */
export const NOSE_HEADROOM_R = 0.05;

/**
 * The bar itself, measured: the longest nose the crowd wears, plus `NOSE_HEADROOM_R`.
 *
 * Today the crowd's longest nose is 2.10r (a darter's spear and a swarmling's point, which are the
 * same shape at two sizes), so the bar is 2.15r. Take it from here rather than writing 2.15 down -
 * a bar copied out of a report is a bar that goes stale the day a body moves.
 */
export function noseCeiling(bodies = crowdBodies()) {
  return Math.round((longestNose(bodies) + NOSE_HEADROOM_R) * 100) / 100;
}

/** How far the crowd's longest nose stands out, in radii: see `noseCeiling`. */
export function longestNose(bodies = crowdBodies()) {
  return Math.max(...bodies.map((body) => extent(body.shape, body.r).reach / body.r));
}

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
 * pair this is: `spitter / shielder` (2.6 px mean, 5.8 px worst, 18% of the circle) is two blobs
 * of one family at two sizes, and `darter / sniper` (5.3 px mean, 18.5 px worst, 59%) is a spear
 * and an eye - one thin body and one fat one, parted over most of the circle and by a whole body's
 * width where they are.
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

/**
 * The two states of a body, as text: where the drawing is, and where the hurtbox is.
 *
 * One character per cell of the plane around a body drawn at `r`, at about `cellPx` px to a cell:
 *
 *   `#`  drawn and hurt          the body, which is the point
 *   `o`  hurt and not drawn      where a shot that was stopped had visibly stopped in the air
 *   `+`  drawn and not hurt      where a shot that looked like it landed did nothing
 *   `.`  neither
 *
 * The two bad states are this file's two rules, and this is the only place they can be seen rather
 * than counted. A shape that is all nose is all `+`; a shape drawn inside its own circle is all `o`.
 */
export function hurtboxArt(shape, r, cellPx = 1.5) {
  const polys = outline(shape, r);
  const ext = extent(shape, r);
  const step = Math.max(SAMPLE, cellPx);
  // The frame of the art is the drawing and the hurtbox together: a body drawn smaller than the
  // circle that hurts it has to have the empty air in the picture, or the picture is a lie.
  const x0 = Math.min(ext.back, -r) - 1, x1 = Math.max(ext.forward, r) + 1;
  const y0 = Math.min(ext.up, -r) - 1, y1 = Math.max(ext.down, r) + 1;
  const out = [];
  for (let y = y0; y <= y1; y += step) {
    let line = '';
    for (let x = x0; x <= x1; x += step) {
      let drawn = false, hurt = false;
      for (let dy = 0; dy < step; dy += SAMPLE) {
        for (let dx = 0; dx < step; dx += SAMPLE) {
          const px = x + dx, py = y + dy;
          if (!drawn && inside(polys, px, py)) drawn = true;
          if (!hurt && Math.hypot(px, py) <= r) hurt = true;
        }
      }
      line += drawn && hurt ? '#' : hurt ? 'o' : drawn ? '+' : '.';
    }
    out.push(line);
  }
  return out.join('\n');
}

/**
 * One row per crowd body: what it covers of its own hurtbox and how far it reaches past it.
 *
 * Worst-covered first, because the report is read to find the body that needs work. `bar` is 20
 * cells, one per five percent, which is coarser than the number beside it on purpose: the row is
 * for glancing and the number is for arguing with.
 */
export function fitRows(bodies = crowdBodies()) {
  return bodies.map((body) => {
    const fit = hurtboxFit(body.shape, body.r);
    return {
      type: body.type,
      r: body.r,
      covered: fit.covered,
      floor: COVERS[body.type],
      encloses: inscribedShare(body.shape, body.r),
      reach: fit.reachOverR,
      missed: fit.missed,
      bar: '#'.repeat(Math.round(fit.covered * 20)).padEnd(20, '.'),
    };
  }).sort((x, y) => x.covered - y.covered);
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

const USAGE = `node tools/shape-lab.js            what every body in the crowd covers of its own hurtbox
node tools/shape-lab.js --show K   one body drawn in text: what is drawn, what is hurt, and the gap

--show takes a kind name (drifter, weaver, ...) or "worst" for the least-covered body of them all.`;

function readArgs(argv) {
  const opts = { show: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--show') {
      const kind = argv[++i];
      if (kind === undefined) {
        console.error('--show wants a kind name, or "worst"');
        process.exit(2);
      }
      opts.show = kind;
    } else {
      console.error('shape-lab does not know the argument ' + arg);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return opts;
}

function head(title) {
  process.stdout.write('\n' + title + '\n' + '='.repeat(title.length) + '\n\n');
}

/** One body in text, with the two bad states counted out. */
function showBody(type) {
  if (BALANCE.kinds[type] === undefined) {
    console.error('no enemy kind is called ' + type + '; the crowd is '
      + Object.keys(BALANCE.kinds).join(', '));
    process.exit(2);
  }
  const body = crowdBody(type);
  const fit = hurtboxFit(body.shape, body.r);
  const lines = [body.type + ', drawn at ' + body.r + ' px, which is the circle that hurts you', ''];
  lines.push(hurtboxArt(body.shape, body.r), '');
  lines.push('  # drawn and hurt    o hurt and not drawn: ' + (fit.missed * 100).toFixed(0)
    + '% of the hurtbox');
  lines.push('  + drawn and not hurt    the drawing stands ' + fit.reachOverR.toFixed(2)
    + 'r out at its furthest');
  lines.push('');
  lines.push('  covers ' + (fit.covered * 100).toFixed(0) + '% of the circle and its bar is '
    + (COVERS[body.type] * 100).toFixed(0) + '%; its outline encloses '
    + (inscribedShare(body.shape, body.r) * 100).toFixed(0) + '% of it, which is the part no shot'
    + ' can stop in whatever the drawing does');
  lines.push('  the crowd lets a body reach ' + noseCeiling() + 'r out, which is its longest nose ('
    + longestNose().toFixed(2) + 'r) with ' + NOSE_HEADROOM_R + 'r of room');
  return lines.join('\n');
}

function coverReport(rows) {
  const lines = [];
  lines.push('STARFALL shape lab - ' + rows.length
    + ' bodies, measured off the paths render/shapes.js draws');
  lines.push('');
  lines.push('What each body covers of the circle that hurts it');
  lines.push('='.repeat('What each body covers of the circle that hurts it'.length));
  lines.push('');
  lines.push('  A bullet is stopped at its own radius plus the body\'s from the body\'s middle, so the');
  lines.push('  drawing owes that circle a solid fill: `covers` is the share of it the silhouette holds,');
  lines.push('  and a shot that lands in the rest was visibly stopped in the air beside the body. `past`');
  lines.push('  is the other way round - how far the drawing reaches past the circle, where a shot looks');
  lines.push('  like it hit and was not. Both are measured on the filled path alone; the frame lays a 2 px');
  lines.push('  line and a glow over it, so an eye is given a little more than this. The bars are 5% wide.');
  lines.push('');
  for (const row of rows) {
    lines.push('  ' + row.type.padEnd(11) + String(row.r).padStart(2) + ' px  ' + row.bar + '  '
      + (row.covered * 100).toFixed(0).padStart(3) + '%   ' + row.reach.toFixed(2) + 'r past'
      + '   bar ' + (row.floor * 100).toFixed(0) + '%   encloses '
      + (row.encloses * 100).toFixed(0) + '%');
  }
  lines.push('');
  lines.push('  `bar` is the share written for that body in the COVERS table above - one per kind,');
  lines.push('  because the worst share in the crowd is a decision about that body and not a');
  lines.push('  threshold. `encloses` is what the outline provably holds: the disc it never steps');
  lines.push('  inside, squared. A body whose nearest edge stands half the radius out has thrown');
  lines.push('  away three quarters of the circle whatever a table says, and that is a fact about the');
  lines.push('  shape and not a bar - which is the point of printing it next to one.');
  lines.push('');
  lines.push('  What each of these is held to is pinned per kind in test/crowd-art.test.mjs, and the shape');
  lines.push('  of a miss is `--show worst`. Which pairs of bodies the crowd has to tell apart, and what');
  lines.push('  each pair has left to tell it with, is the palette report\'s business: palette-check.js.');
  return lines;
}

function main(argv) {
  const opts = readArgs(argv);
  if (opts.help) {
    process.stdout.write(USAGE + '\n');
    return 0;
  }
  const rows = fitRows();
  const lines = opts.show === null ? coverReport(rows)
    : [showBody(opts.show === 'worst' ? rows[0].type : opts.show)];
  process.stdout.write(lines.join('\n') + '\n');
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) process.exit(main(process.argv.slice(2)));
