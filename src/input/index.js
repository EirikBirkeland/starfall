// The input layer's single output: one small descriptor the simulation reads
// once per frame. A thumb is in it (input/touch.js) and so is a gamepad
// (input/gamepad.js); both are written into the same fields a hand on WASD writes into.
//
// Two kinds of thing come through. Held state (which way the ship is being
// driven, whether the fire button is down) is read fresh every frame. One-shot
// requests (a dash) are *requests*: they stay pending until a frame that ran any
// simulation steps has handed them over, so a press that lands on a frame that
// simulated nothing is not swallowed. consumeInput() is what retires them.
//
// The aim is not final as it leaves here. `readInput` reports it where the pointer put it on the
// glass, and main.js turns that into an arena point with render/camera.js's `resolveAim` - unless
// `stickAim` is true, in which case the aim is a direction (input/gamepad.js) and main.js puts it
// into the arena in front of the ship instead.

import { keys, keyTaps, initKeyboard, clearKeys } from './keyboard.js';
import { codeFor } from '../core/keymap.js';
import { mouse, mouseTaps, initMouse, releaseMouse } from './mouse.js';
import { thumb, touchTaps, initTouch, clearThumb } from './touch.js';
import { pad, padTaps, initGamepad, readPads, clearPad } from './gamepad.js';

// Reused every frame; the simulation only reads it during the step.
const input = {
  moveX: 0, moveY: 0, moving: false, aimX: 0, aimY: 0, firing: false, dash: false,
  // Is this visit flying on a thumb? One boolean, and game/assists.js is the whole of what it
  // means: the trigger is held and the gun finds its own body, which is the other half of PLAN
  // section 6's touch line and is those two switches already implemented. A keyboard or mouse visit
  // leaves it false and is the visit it always was.
  thumb: false,
  // Is the nose being pointed by a stick rather than by the pointer? A stick is a direction and not a
  // place on the glass, so it cannot go through the camera the way `aimX/aimY` do: main.js turns this
  // pair into an arena point in front of the ship instead (see `resolveAim`, render/camera.js). A
  // visit that never leaned a right stick never has this true and never looks at these two.
  stickAim: false, aimDirX: 0, aimDirY: 0,
};

export function initInput(canvas, handlers) {
  initKeyboard(handlers);
  initMouse(canvas, handlers);
  initTouch(canvas, handlers);
  initGamepad(handlers);
  window.addEventListener('blur', clearInput);
}

/**
 * Which hand the guns are being pointed by, and the pointer's counter as it was last frame. A
 * pointer keeps the place it was left in, so it owns the aim until a hand leans the right stick; and a
 * stick that has come back to its middle still owns it, because the nose stayed where that hand left
 * it and nothing has said otherwise since. One variable, because "which hand spoke last" is a fact of
 * this layer and of nobody else: input/gamepad.js says what a stick is doing and input/mouse.js keeps
 * the pointer's own count of having been moved (`mouse.moves`, which a thumb's tap adds to too).
 */
let aimHand = 'pointer';
let pointerCount = 0;

/** Is the key one of the four movement controls is bound to held down? (core/keymap.js) */
function held(id) {
  return keys[codeFor(id)] === true;
}

/** Fold the devices this build supports into `input`. */
export function readInput() {
  // The pad is read here and not from an event because a pad has no event worth waiting for: the one
  // it does fire says a device arrived, which is not a control (input/gamepad.js). Polling costs one
  // call a frame and finds a pad the frame it was plugged in.
  readPads();

  // The four movement keys are wherever this player put them (core/keymap.js), and the arrows are
  // movement as well always - the shipped second pair, which no panel can take away and which is what
  // a keyboard with no letters to spare still has. A panel may use the arrows for its cursor and the
  // ship can still use them because the two never happen on one screen (input/keyboard.js).
  const dx = (held('right') || keys.ArrowRight ? 1 : 0) - (held('left') || keys.ArrowLeft ? 1 : 0);
  const dy = (held('down') || keys.ArrowDown ? 1 : 0) - (held('up') || keys.ArrowUp ? 1 : 0);

  input.moving = dx !== 0 || dy !== 0;
  if (input.moving) {
    const length = Math.sqrt(dx * dx + dy * dy);
    input.moveX = dx / length;
    input.moveY = dy / length;
  } else {
    input.moveX = 0;
    input.moveY = 0;
  }

  // A pad's left stick drives the ship the way the keys do, and is the last word: whichever hand is on
  // a control right now is the one the game listens to. Its push is a vector of at most 1, so a half
  // lean is a half-speed ship and the end of the stick is the ship's own top speed.
  if (pad.onStick) {
    input.moving = true;
    input.moveX = pad.pushX;
    input.moveY = pad.pushY;
  }

  // A thumb on the stick drives the ship the same way again, and is last of all: a finger on the
  // glass is the most recent thing a hand did, and a player who leaned a stick and then put a thumb
  // down meant the thumb.
  if (thumb.onStick) {
    input.moving = true;
    input.moveX = thumb.pushX;
    input.moveY = thumb.pushY;
  }

  input.aimX = mouse.x;
  input.aimY = mouse.y;
  // The stick's own push holds the trigger open (PLAN section 6), and it is a hold and not a press:
  // let go of the stick and the guns stop, whatever the mouse is doing.
  input.firing = mouse.down || pad.firing;
  input.dash = keyTaps.dash || mouseTaps.dash || touchTaps.dash || padTaps.dash;
  input.thumb = thumb.used;

  // Which hand owns the nose: whoever spoke last, and is still speaking. A pointer moved since the
  // stick was leaned has taken the nose back and keeps it; a stick that has gone back to its middle
  // has not handed the nose to anybody, so it stays where that hand left it.
  if (pad.aiming) {
    aimHand = 'stick';
  } else if (mouse.moves !== pointerCount) {
    pointerCount = mouse.moves;
    aimHand = 'pointer';
  }
  input.stickAim = aimHand === 'stick';
  input.aimDirX = pad.aimX;
  input.aimDirY = pad.aimY;
  return input;
}

/** The simulation has seen this frame's one-shot requests; forget them. */
export function consumeInput() {
  keyTaps.dash = false;
  mouseTaps.dash = false;
  touchTaps.dash = false;
  padTaps.dash = false;
}

export function clearInput() {
  clearKeys();
  releaseMouse();
  clearThumb();
  clearPad();
}

export { keys, mouse, thumb, pad };
// A panel that is being given a key needs the keyboard for one press (core/keymap.js, main.js), and
// the input layer is the only door anything has to it.
export { captureKeys } from './keyboard.js';
// ...and the one question a screen asks the glass before anybody has touched it: did this visit arrive
// with a finger (input/touch.js, ui/chips.js).
export { hasFinger } from './touch.js';
// ...and the thumb's pause plate, which the wiring presses for a cursor and the touch layer presses
// for a finger, against one predicate so the two can never disagree (input/touch.js, render/touch.js).
export { pausePlateIsUp, onPausePlate } from './touch.js';
