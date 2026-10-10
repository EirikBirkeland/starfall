// A boss's blades, as painted (PLAN 3.4's Eclipse, phase 3: "sweeping arms").
//
// Two things get drawn here and they are the two halves of one promise: the **fan** a fight lights
// while it is being shown, and the **blade** it lets go of down that fan. Both are in one file for
// the same reason the door's wedge is answered by one function (render/entities.js `doorWedge`):
// the fairness of a hazard that travels *is* the difference between them - the fan is the whole of
// the way the blade travels, and the blade is the fan arriving - and two painters that disagreed
// about where either of them is would be the worst bug in the feature, because both would look
// right. So nobody outside this file does the geometry: the frame and the night (render/darkness.js)
// both ask `fansOf` and `bladesOf` and get the same wedges and the same bands out of the same numbers
// the harm is paid out at (game/arms.js, game/bosses.js `showArms`).
//
// The fan is a floor marking and is drawn under the crowd, like the door of a shell and the marks of
// a call: it is a place on the arena floor, and nothing standing in it may be allowed to hide it.
// The blade is a band of harm and is drawn over the crowd and under the ship, like a beam, for the
// same reason twice over - the ship must never be lost inside the thing about to hurt it.
//
// A blade is drawn with `bandPasses`, the same three passes every other band of harm in the game gets
// (a sniper's lock, a boss's spoke, a tether's thread), because a band reads as a band only if the
// full width is painted faint under a hot middle under a nearly white axis - and because the width
// it is drawn at is one number with the collision test (game/arms.js `offTheBlade`).
//
// None of it is simulated. `world.arms` is stepped by game/arms.js and painted here.

import { PALETTE, withAlpha } from '../core/palette.js';
import {
  armArc, armCount, armHalf, armProgress, armReach, armStep, bossCores, bossTint,
} from '../game/bosses.js';
import { onScreen } from './camera.js';
import { glowFor, paintGlow } from './glow.js';
import { bandPasses } from './entities.js';
import { paintX, paintY } from './interp.js';

// The fan: a faint fill, two radial edges, and an arc across the far end - the same four passes a
// shell's door gets (render/entities.js), because it is the same kind of promise: a place marked out
// on the floor before anything happens in it. It wears the phase's warm colours instead of the
// door's cool ones because it is the opposite promise - the door is where to stand, this is where
// not to have stood when the light finishes filling up.
const FAN_FILL = 0.07;
const FAN_EDGE = 2;            // px, the two bearings a blade starts and dies at
const FAN_EDGE_LIGHT = 0.55;
const FAN_RIM = 3;             // px, the arc across its far end: this far, and no further
const FAN_RIM_LIGHT = 0.4;
const FAN_CALM = 0.3;          // the fan the instant a sweep begins ...
const FAN_SHOUT = 1;           // ... and the instant the blades come round
const BLADE_HEAD = 15;         // px of light at the tip of a live blade

// One scratch list each, refilled in place: two painters ask either question every frame and neither
// of them may keep the answer, which is the rule `beamReach` lives by too (game/beams.js).
const FANS = [];
const BLADES = [];
const FAN_KEYS = ['x', 'y', 'angle', 'from', 'to', 'reach', 'half', 'tint'];
const BLADE_KEYS = ['x', 'y', 'angle', 'inner', 'reach', 'half', 'color'];

/** The nth shape of a scratch list: built once, refilled for ever. */
function slot(list, n, keys) {
  while (list.length <= n) {
    const shape = {};
    for (const key of keys) shape[key] = 0;
    list.push(shape);
  }
  return list[n];
}

/**
 * The fans a fight is promising: one wedge per blade per body of the fight that is still standing,
 * in the coordinates the frame is painting in - which is what makes the answer honest for a fight
 * that walks while it promises, and for one that has broken into three bodies.
 *
 * `from` is the bearing the blade is held at and `to` the bearing it dies at, so the wedge is the
 * whole of the way it travels and not just the line it starts on (game/bosses.js `showArms`). The
 * list is empty when the fight is not sweeping, because a fan lit between sweeps would be a promise
 * about a blade that is not coming.
 *
 * The list belongs to this file and a caller uses it at once: a shape in it is refilled the next time
 * the question is asked, which is the only price of asking it twice in one frame.
 */
export function fansOf(boss, alpha) {
  const count = armCount(boss);
  FANS.length = 0;
  if (count === 0) return FANS;

  const arc = armArc(boss);
  const step = armStep(boss);
  const reach = armReach(boss);
  const half = armHalf(boss);
  const tint = bossTint(boss);
  const cores = bossCores(boss);

  let n = 0;
  for (let c = 0; c < cores.length; c++) {
    const body = cores[c].enemy;
    if (body.hp <= 0) continue;
    for (let i = 0; i < count; i++) {
      const fan = slot(FANS, n++, FAN_KEYS);
      fan.x = paintX(body, alpha);
      fan.y = paintY(body, alpha);
      fan.angle = cores[c].angle + i * step;
      fan.from = fan.angle;
      fan.to = fan.angle + arc;
      fan.reach = reach;
      fan.half = half;
      fan.tint = tint;
    }
  }
  FANS.length = n;
  return FANS;
}

/**
 * Every blade loose in the arena, as the band of harm it is: the painted place it pivots on, the
 * bearing it points, the two distances it runs between, how wide it is, and what colour the phase
 * that loosed it was wearing. Same numbers, same source (game/arms.js), which is the whole of the
 * reason the two painters cannot disagree.
 */
export function bladesOf(arms, alpha) {
  BLADES.length = 0;
  for (let i = 0; i < arms.count; i++) {
    const arm = arms.items[i];
    const blade = slot(BLADES, i, BLADE_KEYS);
    blade.x = paintX(arm, alpha);
    blade.y = paintY(arm, alpha);
    // The turn is interpolated the same way a position is: a blade's `angle` is deliberately
    // unwrapped (game/arms.js), so a frame between two steps is a lerp and not a jump across pi.
    blade.angle = arm.pangle + (arm.angle - arm.pangle) * alpha;
    blade.inner = arm.inner;
    blade.reach = arm.reach;
    blade.half = arm.half;
    blade.color = arm.color;
  }
  BLADES.length = arms.count;
  return BLADES;
}

/**
 * The two ends of a band, in the frame's own coordinates. Both painters cut from these, and both
 * of the shapes here have a bearing called `angle` for exactly that reason.
 */
export function bandEnds(shape) {
  const dx = Math.cos(shape.angle);
  const dy = Math.sin(shape.angle);
  return {
    x0: shape.x + dx * shape.inner,
    y0: shape.y + dy * shape.inner,
    x1: shape.x + dx * shape.reach,
    y1: shape.y + dy * shape.reach,
  };
}

/**
 * The fans a fight is promising, lit on the floor under the crowd (render/renderer.js), with the
 * blade that will travel down each one drawn at its starting bearing - so what the ship is shown is
 * the harm, edge for edge, at the width it hurts and to the length it reaches, before any of it is
 * loose.
 */
export function drawArmFans(ctx, boss, alpha) {
  const fans = fansOf(boss, alpha);
  if (fans.length === 0) return;

  const light = FAN_CALM + (FAN_SHOUT - FAN_CALM) * armProgress(boss);
  for (let i = 0; i < fans.length; i++) {
    const fan = fans[i];
    if (!onScreen(fan.x, fan.y, fan.reach)) continue;

    ctx.beginPath();
    ctx.moveTo(fan.x, fan.y);
    ctx.arc(fan.x, fan.y, fan.reach, fan.from, fan.to);
    ctx.closePath();
    ctx.fillStyle = withAlpha(fan.tint, FAN_FILL * light);
    ctx.fill();

    ctx.lineWidth = FAN_EDGE;
    ctx.strokeStyle = withAlpha(fan.tint, FAN_EDGE_LIGHT * light);
    ctx.beginPath();
    ctx.moveTo(fan.x, fan.y);
    ctx.lineTo(fan.x + Math.cos(fan.from) * fan.reach, fan.y + Math.sin(fan.from) * fan.reach);
    ctx.moveTo(fan.x, fan.y);
    ctx.lineTo(fan.x + Math.cos(fan.to) * fan.reach, fan.y + Math.sin(fan.to) * fan.reach);
    ctx.stroke();

    ctx.lineWidth = FAN_RIM;
    ctx.strokeStyle = withAlpha(fan.tint, FAN_RIM_LIGHT * light);
    ctx.beginPath();
    ctx.arc(fan.x, fan.y, fan.reach, fan.from, fan.to);
    ctx.stroke();

    // The blade itself, at the bearing it is held at: drawn last so it reads as the hot thing in the
    // middle of its own faint fan, and drawn with the same band every other line of harm in this game
    // is drawn with, at the width the harm is paid out at.
    const ends = bandEnds(fan);
    bandPasses(ctx, ends.x0, ends.y0, ends.x1, ends.y1, fan.half, light, fan.tint, PALETTE.white);
  }
}

/**
 * Every blade loose in the arena (game/arms.js). Over the crowd and under the ship, like a beam:
 * the ship must never be lost inside the thing that is about to take a hull off it, and a body
 * standing across a blade may not be allowed to hide one.
 *
 * Nothing about a live blade breathes or wobbles. It is a place the fight is holding, and a hazard
 * that shimmers where it was not is a hazard misremembered (render/entities.js, same rule for a
 * beam).
 */
export function drawBlades(ctx, arms, alpha) {
  const blades = bladesOf(arms, alpha);
  for (let i = 0; i < blades.length; i++) {
    const blade = blades[i];
    const ends = bandEnds(blade);
    if (!onScreen((ends.x0 + ends.x1) / 2, (ends.y0 + ends.y1) / 2,
      Math.hypot(ends.x1 - ends.x0, ends.y1 - ends.y0) / 2)) continue;

    bandPasses(ctx, ends.x0, ends.y0, ends.x1, ends.y1, blade.half, 1, blade.color, PALETTE.white);
    paintGlow(ctx, glowFor(PALETTE.white, BLADE_HEAD), ends.x1, ends.y1, 1);
  }
}
