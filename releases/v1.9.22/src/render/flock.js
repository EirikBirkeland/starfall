// The brood's own two tells, drawn once per pack instead of once per body.
//
// A pack of the swarm is one thing made of many bodies (game/flock.js), and the whole of the kind
// is that it commits together: the clump bunches up for `brace` seconds, one line is locked from
// its middle to the ship, and every body in it flies that line. Until this file the only way to see
// that was twenty small lights - one at each body's nose, on the same countdown (render/entities.js) -
// which is the right tell for a body you are standing next to and the wrong one for a clump of
// fifteen seen from the far side of the room, or from behind another clump. So this draws the coarse
// version of the same two facts, one shape per pack, off the numbers the simulation already publishes:
//
//   **the brace is a clock** - a ring round the clump, standing `RING_GAP` px outside its own spread,
//     with an arc of it left that gets eaten as the beat runs out. A part-of-a-circle closing over a
//     circle is the grammar the game already uses for a wait (the ship's own dash ring, an elite's
//     hull), and here it is a fuse rather than a refill: what is left of the arc is what is left of
//     the time before the pack throws itself.
//
//   **the dive is a line** - a soft trail from the clump to as far along its locked line as it still
//     has to give, which is the same capsule `tools/boss-pressure.js` counts as the pack's claim on
//     the room. It gets shorter as the dive runs and is gone when the dive is, so the light never
//     outlives the promise: the far end is the reach of the lunge, and a ship that knows a lunge's
//     reach knows whether it has to move and how far.
//
// What it is sized by, measured over a late run's waves (NOTES session 151): three packs of 14-17
// bodies on the arena at a time, so a frame is asked for at most three of these; a spread of ~40 px
// at rest, tightening only a hair over the brace proper (~4 px, so it is the *arc* that tells the time
// and not the radius), and a dive that closes 170-340 px of ground depending on how late in a run the
// flock is. The ring therefore lands 40-60 px across and the line is a fraction of the window, which
// is the scale the read wanted: one shape per clump, a handful per frame.
//
// What it is NOT drawn for: a pack of two. A fragment of the split hive lets `each` bodies out of
// its one lit mouth (balance.js `split.spawn`), which is a pair and not a clump - two nose lights
// are already two lights more than you can miss, and a ring round each of the twelve pairs a late
// split leaves standing would be twelve rings where the read wanted three. So a pack has to be
// worth the word "clump" before it gets one, and `isClump` says where that line is drawn. A
// whole hive is on the other side of it: every mouth a body lights on a beat sends its bodies into
// one flock (game/bosses.js `openTheCore`), so the second boss's first two phases are clumps of
// four and six on one clock, and they wear the ring like any wave does.
//
// None of it is simulated. Every number here is read - the middle, the spread, the pace and the clock
// are rebuilt from the crowd each step in game/flock.js and nothing in game/ reads them back - so a
// run's fingerprint does not know this file exists. The pack's middle is not interpolated, on the
// same bargain render/effects.js makes with its rings: a step of the clump's travel is a few pixels
// of a shape that is tens of pixels across and soft at the edge, and it is the *closing* of the arc
// that is the information, not which pixel the ring stands on.
//
// The night does not punch holes for these (render/darkness.js). Neither does it for the bodies they
// describe: the veil lights the ship, the shots and the fight's own bodies, and a swarm that walked
// into a dark phase is as covered up as it always was - the tell is drawn for the eye that can see
// the clump it rounds, and no more.

import { PALETTE } from '../core/palette.js';
import { clamp, TAU } from '../core/math.js';
import { beatProgress, isBracing, isClump, isCommitted } from '../game/flock.js';
import { onScreen } from './camera.js';
import { glowFor, makeStreak, paintGlow, paintStreak } from './glow.js';

// Whether a pack is a clump at all is the pack's own answer (game/flock.js `isClump`), so that the
// eye and the fight agree on the number: a whole hive's beat is (two neighbours' mouths, four
// bodies, on one clock) and a fragment's brood is not - two bodies out of its one mouth, on
// purpose - and keeps its own two lights instead of borrowing a ring every four and a half seconds,
// which is what the flock's whole cycle costs.

// The ring. Its radius follows the clump's own spread - which does tighten as the bunching comes,
// only a little - and the arc eaten off it is the beat running out: one clock, two ways of reading
// it, in one shape.
const RING_GAP = 10;      // px outside the bodies
const RING_MIN = 16;      // px, so a pack bunched to a point still gets a ring and not a dot
const RING_SOFT = 6;      // px, the wide faint pass that stands in for a blur
const RING_LINE = 2;      // px, the arc itself
const RING_CALM = 0.18;   // the ring the instant the brace starts ...
const RING_SHOUT = 0.85;  // ... and the instant before the pack goes
const RING_HEAD = 8;      // px of light at the head of the closing arc
const RING_ROOM = 26;     // px of slack on the cull, for the ring's own reach

// The line. One baked trail, stamped stretched (render/glow.js `paintStreak`): the length changes
// every step and a sprite per length would be a sprite per frame. Baked at about the middle of the
// reach it is asked for, so the stretch it needs is a share either way of one and not a squash.
const LANE_BAKE = 140;    // px of trail baked, which is what `stretch` is measured against
const LANE_WIDTH = 30;    // px across, about the width of a bunched clump
const LANE_MIN = 26;      // px of lunge left, below which there is nothing worth drawing
const LANE_LIGHT = 0.5;   // how bright a freshly committed line lands
const LANE_HEAD = 9;      // px of light at the far end: this is as far as it gets
const LANE_ROOM = 40;     // px of slack on the cull

let laneSprite = null;

function laneOf() {
  if (laneSprite === null) {
    laneSprite = makeStreak(PALETTE.telegraphHead, PALETTE.swarm, LANE_BAKE, LANE_WIDTH);
  }
  return laneSprite;
}

/** One arc, because the ring is stroked over itself three times to be a glow without a blur. */
function stroke(ctx, x, y, radius, from, to) {
  ctx.beginPath();
  ctx.arc(x, y, radius, from, to);
  ctx.stroke();
}

/**
 * The two tells, for every pack on the arena that is big enough to be a clump.
 *
 * `packs` is `world.flocks`, and a pack in it always has a body in it: game/flock.js throws away the
 * ones nobody is flying in any more, at the top of its own pass.
 */
export function drawFlockTells(ctx, packs) {
  for (let i = 0; i < packs.length; i++) {
    const pack = packs[i];
    if (!isClump(pack)) continue;
    if (isBracing(pack)) drawBrace(ctx, pack);
    else if (isCommitted(pack)) drawLine(ctx, pack);
  }
}

/** The countdown: a ring round the clump with an arc of it left, burning brighter as it runs out. */
function drawBrace(ctx, pack) {
  const radius = Math.max(RING_MIN, pack.spread + RING_GAP);
  if (!onScreen(pack.cx, pack.cy, radius + RING_ROOM)) return;

  const done = beatProgress(pack);
  const light = RING_CALM + (RING_SHOUT - RING_CALM) * done;
  const was = ctx.globalAlpha;
  const from = -Math.PI / 2;

  // The whole circle, faint: what the beat was. Then what is left of it, hot, closing over that.
  ctx.globalAlpha = was * light * 0.5;
  ctx.strokeStyle = PALETTE.red;
  ctx.lineWidth = RING_SOFT;
  stroke(ctx, pack.cx, pack.cy, radius, from, from + TAU);

  const left = TAU * (1 - done);
  ctx.globalAlpha = was * light * 0.4;
  ctx.lineWidth = RING_SOFT;
  stroke(ctx, pack.cx, pack.cy, radius, from, from + left);

  ctx.globalAlpha = was * light;
  ctx.strokeStyle = PALETTE.telegraph;
  ctx.lineWidth = RING_LINE;
  stroke(ctx, pack.cx, pack.cy, radius, from, from + left);
  ctx.globalAlpha = was;

  // One light at the head of the arc, where the time is being spent, so the countdown has an end
  // the eye can find rather than a shrinking edge it has to compare against nothing.
  paintGlow(ctx, glowFor(PALETTE.telegraphHead, RING_HEAD), pack.cx
    + Math.cos(from + left) * radius, pack.cy + Math.sin(from + left) * radius, light);
}

/** The lunge: a trail from the clump out to as far along its locked line as it still has to fly. */
function drawLine(ctx, pack) {
  const left = Math.max(0, pack.timer);
  const reach = left * pack.pace;
  if (reach < LANE_MIN) return;

  // The middle of the trail is the honest place to ask about the window: it is as far from either
  // end as the line is long, so a half of it on the glass is enough to be worth drawing.
  const toX = pack.cx + pack.dirX * reach;
  const toY = pack.cy + pack.dirY * reach;
  if (!onScreen((pack.cx + toX) / 2, (pack.cy + toY) / 2, reach / 2 + LANE_ROOM)) return;

  const angle = Math.atan2(pack.dirY, pack.dirX);
  const fade = clamp(left / (pack.stageTime || 1), 0, 1);
  paintStreak(ctx, laneOf(), toX, toY, angle, reach / LANE_BAKE, LANE_LIGHT * fade);
  paintGlow(ctx, glowFor(PALETTE.telegraphHead, LANE_HEAD), toX, toY, fade);
}
