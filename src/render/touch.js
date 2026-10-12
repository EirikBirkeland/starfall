// The thumb's own picture: the stick where the thumb put it down, the button that dashes, and the
// plate that stops (PLAN section 6, input/touch.js).
//
// This file paints places that already exist. Where the dash button is, where the pause plate is and
// how far a stick reaches are the input layer's to know - it is the one that decides what a finger
// landed *on* - so both come from input/touch.js, and the ring a thumb presses and the ring an eye
// sees are one number rather than two that happen to agree. The thumb's own position is read from the
// same place for the same reason, the way render/tutorial.js reads the prompt it is putting on the
// glass.
//
// Nothing here is a glow built this frame: the soft lights are the baked sprites (render/glow.js) and
// the rings are the same two passes every ring in this game uses - a wide faint stroke under a thin
// bright one, which is how a line glows without a blur.
//
// The stick and the button are painted only while a run is being flown on a thumb (that is the
// caller's rule, in render/renderer.js), and both belong to the glass and not to the arena: they are
// drawn after the camera and the shake have been put back, so the stick does not wobble when
// something behind it goes off. The pause plate is the one exception to the first half of that rule -
// it is painted for any visit that arrived with a finger, before it has used one, because a control
// nobody can see is a control nobody can find (input/touch.js `pausePlateIsUp`).

import { PALETTE, withAlpha } from '../core/palette.js';
import { glowFor, paintGlow } from './glow.js';
import { thumb, dashButton, pauseButton, pausePlateIsUp, stickReach } from '../input/touch.js';

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

// The pause plate: the same disc and the same word across it, one rung quieter and one rung smaller,
// because it is the one control on this glass a run is not leaning on a hundred times.
const PAUSE_LINE = 2;
const PAUSE_SOFT = 7;
const PAUSE_LIGHT = 0.34;
const PAUSE_HELD = 0.9;
const PAUSE_WORD = 'PAUSE';
const PAUSE_FONT_SIZE = 10;  // px - the word has to sit inside a smaller disc and still be read

const RING_BRIGHT = PALETTE.dashRingFilling;
const DASH_TRACK = PALETTE.dashRingReady;

/**
 * One control's look, put together once, at this file's top: the word across the disc, the font it is
 * written in (a frame may not build a font string on its way past), how far below the disc's middle
 * its baseline sits, and the four numbers of its light.
 */
function lookOf(word, fontSize, line, soft, light, held) {
  return {
    word: word,
    font: '800 ' + fontSize + 'px "Segoe UI", system-ui, sans-serif',
    lift: fontSize * 0.35,
    line: line,
    soft: soft,
    light: light,
    held: held,
  };
}

const DASH_LOOK = lookOf(DASH_WORD, DASH_FONT_SIZE, DASH_LINE, DASH_SOFT, DASH_LIGHT, DASH_HELD);
const PAUSE_LOOK = lookOf(PAUSE_WORD, PAUSE_FONT_SIZE, PAUSE_LINE, PAUSE_SOFT, PAUSE_LIGHT, PAUSE_HELD);

/**
 * One thumb control: a disc of the ship's own light, brighter under a thumb, with the word it is
 * worth written across the middle of it. The dash and the pause are the same shape and differ only in
 * their size and their light, which is what makes them read as the two buttons on the right edge.
 */
function drawButton(ctx, button, held, look) {
  const lit = held ? look.held : look.light;
  paintGlow(ctx, glowFor(PALETTE.player, button.r), button.x, button.y, lit * 0.5);

  ctx.beginPath();
  ctx.arc(button.x, button.y, button.r, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(PALETTE.playerFill, held ? 0.9 : 0.45);
  ctx.fill();
  ctx.strokeStyle = withAlpha(DASH_TRACK, lit);
  ctx.lineWidth = look.soft;
  ctx.stroke();
  ctx.strokeStyle = withAlpha(RING_BRIGHT, lit);
  ctx.lineWidth = look.line;
  ctx.stroke();

  ctx.font = look.font;
  ctx.textAlign = 'center';
  ctx.fillStyle = withAlpha(PALETTE.uiText, held ? 1 : 0.8);
  ctx.fillText(look.word, button.x, button.y + look.lift);
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
 * Paint the plate that stops the run, then the stick and the button, or nothing at all.
 *
 * A visit that has never put a thumb on a control sees no control at all - a mouse and a keyboard
 * has no business being shown a stick - and a thumb that is lifted sees the button but not the
 * stick, because the stick lives where the thumb put it down and right now there is no such place.
 *
 * The pause plate is painted on the strength of its own question (input/touch.js `pausePlateIsUp`) and
 * not of `thumb.used`, because the pause is the one control a player looks for *before* they have
 * leaned anything: a phone that has launched a run and wants it back has not touched a control yet.
 *
 * One thing does land on top of it: the developer's F3 plate (render/debug.js) is painted later and is
 * anchored to the same right edge. That is accepted rather than designed around - the plate is still
 * pressed underneath the overlay, and a run being measured is a run being flown on purpose.
 */
export function drawTouch(ctx, W, H) {
  if (pausePlateIsUp()) {
    drawButton(ctx, pauseButton(W, H), thumb.onPause, PAUSE_LOOK);
  }
  if (!thumb.used) return;
  drawButton(ctx, dashButton(W, H), thumb.onDash, DASH_LOOK);
  if (thumb.onStick) drawStick(ctx, stickReach(W, H));
}
