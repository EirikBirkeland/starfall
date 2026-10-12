// The thumb's own picture: the stick where the thumb put it down, and the button that dashes
// (PLAN section 6, input/touch.js).
//
// This file paints places that already exist. Where the dash button is and how far a stick reaches
// are the input layer's to know - it is the one that decides what a finger landed *on* - so both
// come from input/touch.js, and the ring a thumb presses and the ring an eye sees are one number
// rather than two that happen to agree. The thumb's own position is read from the same place for
// the same reason, the way render/tutorial.js reads the prompt it is putting on the glass.
//
// Nothing here is a glow built this frame: the soft lights are the baked sprites (render/glow.js)
// and the rings are the same two passes every ring in this game uses - a wide faint stroke under a
// thin bright one, which is how a line glows without a blur.
//
// Both controls are painted only while a run is being flown on a thumb (that is the caller's rule,
// in render/renderer.js), and both belong to the glass and not to the arena: they are drawn after
// the camera and the shake have been put back, so the stick does not wobble when something behind
// it goes off.

import { PALETTE, withAlpha } from '../core/palette.js';
import { glowFor, paintGlow } from './glow.js';
import { thumb, dashButton, stickReach } from '../input/touch.js';

// The look. The stick is the ship's own cyan at about the light of the dash's cooldown ring, because
// it is the ship's own control and not a thing in the arena: warm is the crowd (PLAN section 4), and
// a control that wore the crowd's colours would look like something you were being told to fly into.
const STICK_LINE = 2;        // px, the ring the thumb travels round
const STICK_SOFT = 7;        // px, the wide pass under it, which is its glow
const STICK_LIGHT = 0.5;     // how lit that ring lands
const STICK_GLOW = 0.11;     // ...and how lit the wide pass under it is
const KNOB_SHARE = 0.34;     // the knob's radius, as a share of the stick's reach
const KNOB_LIGHT = 0.75;     // and how lit the knob is
const KNOB_CORE = 0.55;      // the nearly white heart of it, as a share of the knob

const DASH_LINE = 2.5;       // px, the button's edge
const DASH_SOFT = 9;         // px, the wide pass under it
const DASH_LIGHT = 0.42;     // how lit it lands at rest
const DASH_HELD = 0.95;      // and under a thumb
const DASH_WORD = 'DASH';
const DASH_FONT_SIZE = 13;   // px
const dashFont = '800 ' + DASH_FONT_SIZE + 'px "Segoe UI", system-ui, sans-serif';

const RING_BRIGHT = PALETTE.dashRingFilling;
const DASH_TRACK = PALETTE.dashRingReady;

/**
 * The button: a disc of the ship's own light in the bottom-right corner, brighter under a thumb,
 * with the word it is worth written across the middle of it.
 */
function drawDashButton(ctx, button, held) {
  const light = held ? DASH_HELD : DASH_LIGHT;
  paintGlow(ctx, glowFor(PALETTE.player, button.r), button.x, button.y, light * 0.5);

  ctx.beginPath();
  ctx.arc(button.x, button.y, button.r, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(PALETTE.playerFill, held ? 0.9 : 0.45);
  ctx.fill();
  ctx.strokeStyle = withAlpha(DASH_TRACK, light);
  ctx.lineWidth = DASH_SOFT;
  ctx.stroke();
  ctx.strokeStyle = withAlpha(RING_BRIGHT, light);
  ctx.lineWidth = DASH_LINE;
  ctx.stroke();

  ctx.font = dashFont;
  ctx.textAlign = 'center';
  ctx.fillStyle = withAlpha(PALETTE.uiText, held ? 1 : 0.8);
  ctx.fillText(DASH_WORD, button.x, button.y + DASH_FONT_SIZE * 0.35);
  ctx.textAlign = 'left';
}

/** The stick: the ring the thumb travels round, and the knob that is where the thumb actually is. */
function drawStick(ctx, reach) {
  ctx.beginPath();
  ctx.arc(thumb.originX, thumb.originY, reach, 0, Math.PI * 2);
  ctx.strokeStyle = withAlpha(RING_BRIGHT, STICK_GLOW);
  ctx.lineWidth = STICK_SOFT;
  ctx.stroke();
  ctx.strokeStyle = withAlpha(RING_BRIGHT, STICK_LIGHT);
  ctx.lineWidth = STICK_LINE;
  ctx.stroke();

  const knob = reach * KNOB_SHARE;
  paintGlow(ctx, glowFor(PALETTE.player, knob), thumb.knobX, thumb.knobY, KNOB_LIGHT);
  ctx.beginPath();
  ctx.arc(thumb.knobX, thumb.knobY, knob * KNOB_CORE, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.playerCore;
  ctx.fill();
}

/**
 * Paint the stick and the button, or nothing at all.
 *
 * A visit that has never put a thumb on a control sees no control at all - a mouse and a keyboard
 * has no business being shown a stick - and a thumb that is lifted sees the button but not the
 * stick, because the stick lives where the thumb put it down and right now there is no such place.
 */
export function drawTouch(ctx, W, H) {
  if (!thumb.used) return;
  drawDashButton(ctx, dashButton(W, H), thumb.onDash);
  if (thumb.onStick) drawStick(ctx, stickReach(W, H));
}
