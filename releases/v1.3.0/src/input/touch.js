// The thumb: one finger to fly with and one to dash with (PLAN section 6).
//
// PLAN's row is the whole design - "a virtual stick on the left, auto-aim and auto-fire, a dash
// button on the right" - and its three halves are split three ways, because each half belongs to a
// different layer:
//
//   * this file knows where a thumb has to land for it to *mean* something, and keeps the one fact
//     everybody else reads: where the thumbs are;
//   * the stick goes into the same descriptor the keyboard writes into (input/index.js), so a thumb
//     lean and a WASD lean are one lean and the ship cannot tell them apart;
//   * the aiming and the trigger are game/assists.js, because "point at the nearest body" is a
//     question about the crowd and not about the glass - and they are the same two switches a
//     keyboard player turns on from the settings panel. A thumb is those switches, on.
//
// **What a touch means depends on the screen, and this layer does not know what screen the game is
// on.** So `handlers.flying()` asks the wiring (src/main.js) whether a run is being flown. While
// one is, the left half of the glass is a stick and the button on the right is the dash. While one
// is not, every touch is a tap, and a tap is the press a click already was: the title launches, the
// cards are answered and the wreck's card restarts, all of which is `onCanvasPressed` deciding what
// a press means on the screen it landed on - exactly what the mouse's left button has been doing
// since the first version. Nothing about those screens had to learn about a finger.
//
// The stick is put down wherever the thumb lands rather than being painted at a fixed spot first. A
// phone is held a different way by every pair of hands, and a stick you can drop under your own
// thumb is the same thing a native game calls a floating stick. Its reach is a share of the shorter
// window side, so it is a thumb's width on a phone in a pocket and the same thumb's width on a
// tablet; and a push shorter than the full reach drives the ship *proportionally*, because
// game/player.js `steer` clamps the target speed and a vector of half the length is half the ship.
//
// Nothing here is simulated. The thumb is a place on the glass, the way the mouse is, and a run that
// never met a finger is the run it always was - down to the trace hash.

import { noteGlass } from './mouse.js';
import { clamp, hypot } from '../core/math.js';

// Where a thumb belongs, in CSS pixels on the glass. render/touch.js paints these places, which is
// the only way the ring you see and the ring you press are the same ring by construction and not by
// luck. Everything is a share of the shorter window side with a floor and a ceiling, so the controls
// are a thumb's size on every window instead of a fixed pixel size that is a speck on a phone and a
// wheel on a desktop.
const STICK_EDGE = 0.5;    // a touch that begins left of this share of the width belongs to the stick
const STICK_SIZE = 0.19;   // the stick's reach, as a share of the shorter window side
const STICK_MIN = 46;      // px, how small it may get before it is a fidget and not a stick
const STICK_MAX = 90;      // px, past which a full lean costs a wrist
const STICK_DEAD = 0.18;   // of the reach: a thumb resting on the glass is not a lean
const DASH_SIZE = 0.15;    // the dash button's radius, same share and same reason
const DASH_MIN = 44;
const DASH_MAX = 76;
const DASH_INSET = 26;     // px from the right edge of the window to the button's edge
const DASH_LIFT = 46;      // px from the bottom edge: clear of the XP bar and of the frame-rate read

/** How far a thumb has to travel on the stick for it to be a full lean. */
export function stickReach(width, height) {
  const short = Math.min(width, height);
  return clamp(short * STICK_SIZE, STICK_MIN, STICK_MAX);
}

/** Where the dash button is, and how big: the bottom-right corner, above the XP bar. */
export function dashButton(width, height) {
  const r = clamp(Math.min(width, height) * DASH_SIZE, DASH_MIN, DASH_MAX);
  return { x: width - r - DASH_INSET, y: height - r - DASH_LIFT, r: r };
}

/**
 * Where the thumbs are. Live state, written only by this file and read by input/index.js and
 * render/touch.js once a frame.
 *
 * `used` is the one that answers "is this visit flying on a thumb" - and it is set when a touch is
 * *claimed by a control*, not by a tap: a laptop with a touchscreen that gets one accidental touch
 * on the title screen is not a visit that has asked for auto-aim, and a visit whose thumb has been
 * on the stick once has. Everything outside this file asks through `thumbUsed`.
 */
export const thumb = {
  used: false,
  onStick: false,
  onDash: false,
  originX: 0,     // where the stick was put down
  originY: 0,
  knobX: 0,       // where the thumb is now, which is the knob of the stick
  knobY: 0,
  pushX: 0,       // the stick's push: a vector no longer than 1, 0 when it is not being leaned on
  pushY: 0,
};

// The dash is a request and not a state, so it joins the keyboard's and the mouse's one-shot queue
// (input/index.js says why).
export const touchTaps = { dash: false };

/**
 * Is this visit flying on a thumb?
 *
 * The one question the rest of the game asks the glass, and it is asked as a function rather than read
 * off the object because the answer is only ever wanted away from the input layer, and only ever once:
 * by whoever is about to write the word CLICK where a thumb will read it (render/cards.js), and by
 * `main.js` for the two panels that print how a run is let go of. The two assists a thumb cannot do
 * for itself are told the same way, through the controls descriptor (game/assists.js).
 */
export function thumbUsed() {
  return thumb.used;
}

let glass = null;
let press = null;
// Asked of the wiring, because which half of the glass a finger is in is not the only question a
// touch answers - whether the game is flying a run at all decides whether it is a control or a tap.
let runIsFlying = () => false;

let stickId = -1;
let dashId = -1;

/** The glass's own box and size: every touch coordinate is measured against it. */
function glassRect() {
  const rect = glass.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/** How far a thumb is from the middle of the stick, as a push of at most 1. */
function setPush(dx, dy, reach) {
  const length = hypot(dx, dy);
  if (length <= reach * STICK_DEAD) {
    thumb.pushX = 0;
    thumb.pushY = 0;
    return;
  }
  const push = Math.min(1, length / reach);
  thumb.pushX = (dx / length) * push;
  thumb.pushY = (dy / length) * push;
}

function claimStick(touch, rect) {
  stickId = touch.identifier;
  thumb.used = true;
  thumb.onStick = true;
  thumb.originX = touch.clientX - rect.left;
  thumb.originY = touch.clientY - rect.top;
  thumb.knobX = thumb.originX;
  thumb.knobY = thumb.originY;
  thumb.pushX = 0;
  thumb.pushY = 0;
}

function claimDash(touch) {
  dashId = touch.identifier;
  thumb.used = true;
  thumb.onDash = true;
  // One press, one dash, wherever the finger goes after that. It is spent whether the ship was
  // standing still, mid-wait, or in the middle of a dash already.
  touchTaps.dash = true;
}

function onTouchStart(event) {
  // A finger is never a scroll, a pinch, or the click the browser would otherwise synthesise after
  // it - and that last one is the important one, because a tap that was answered twice would launch
  // a run and then answer a card with the same press.
  if (event.cancelable !== false) event.preventDefault();
  if (glass === null) return;

  const rect = glassRect();
  const button = dashButton(rect.width, rect.height);
  const flying = runIsFlying();
  const touches = event.changedTouches || [];

  for (let i = 0; i < touches.length; i++) {
    const touch = touches[i];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    if (!flying) {
      // The screen owns this press. The thumb is a pointer too, so the point goes where the mouse
      // keeps its own and the same handler that answers a click answers the tap.
      noteGlass(x, y);
      if (press !== null) press();
      continue;
    }
    if (dashId < 0 && hypot(x - button.x, y - button.y) <= button.r) {
      claimDash(touch);
    } else if (stickId < 0 && x < rect.width * STICK_EDGE) {
      claimStick(touch, rect);
    }
    // Anywhere else on the glass while a run is flying is nobody's: it is where the interface lives,
    // and an interface is not a control.
  }
}

function onTouchMove(event) {
  if (event.cancelable !== false) event.preventDefault();
  if (glass === null || stickId < 0) return;

  const rect = glassRect();
  const reach = stickReach(rect.width, rect.height);
  const touches = event.changedTouches || [];
  for (let i = 0; i < touches.length; i++) {
    const touch = touches[i];
    if (touch.identifier !== stickId) continue;
    thumb.knobX = touch.clientX - rect.left;
    thumb.knobY = touch.clientY - rect.top;
    setPush(thumb.knobX - thumb.originX, thumb.knobY - thumb.originY, reach);
  }
}

function onTouchEnd(event) {
  const touches = event.changedTouches || [];
  for (let i = 0; i < touches.length; i++) {
    const id = touches[i].identifier;
    if (id === stickId) {
      stickId = -1;
      thumb.onStick = false;
      thumb.pushX = 0;
      thumb.pushY = 0;
    } else if (id === dashId) {
      dashId = -1;
      thumb.onDash = false;
    }
  }
}

/**
 * handlers.onPress  - the same handler the mouse's left button calls, for a tap on a screen
 * handlers.flying   - is a run being flown right now (src/main.js answers it)
 */
export function initTouch(canvas, handlers) {
  glass = canvas;
  press = handlers.onPress || null;
  if (handlers.flying) runIsFlying = handlers.flying;
  // Passive false on every one of them: a browser that is allowed to scroll is a browser that eats
  // the gesture a stick is made of.
  window.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: false });
  window.addEventListener('touchcancel', onTouchEnd, { passive: false });
}

/**
 * Let go of everything. A phone that was backgrounded under a thumb comes back with that thumb
 * lifted and no touchend to say so, so the stick must not be left leaned over.
 */
export function clearThumb() {
  stickId = -1;
  dashId = -1;
  thumb.onStick = false;
  thumb.onDash = false;
  thumb.pushX = 0;
  thumb.pushY = 0;
  // ...and a dash asked for in the same instant as the focus going away is not a dash owed to
  // whatever screen comes back. input/mouse.js lets go of its own tap the same way.
  touchTaps.dash = false;
}
