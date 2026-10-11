// The input layer's single output: one small descriptor the simulation reads
// once per frame. A thumb is in it too now (input/touch.js); a gamepad would join
// it here.
//
// Two kinds of thing come through. Held state (which way the ship is being
// driven, whether the fire button is down) is read fresh every frame. One-shot
// requests (a dash) are *requests*: they stay pending until a frame that ran any
// simulation steps has handed them over, so a press that lands on a frame that
// simulated nothing is not swallowed. consumeInput() is what retires them.
//
// One field is not final as it leaves here: `readInput` reports the aim where it
// sits on the glass, and main.js turns it into an arena point with
// render/camera.js's `resolveAim` before any of it reaches the simulation.

import { keys, keyTaps, initKeyboard, clearKeys } from './keyboard.js';
import { mouse, mouseTaps, initMouse, releaseMouse } from './mouse.js';
import { thumb, touchTaps, initTouch, clearThumb } from './touch.js';

// Reused every frame; the simulation only reads it during the step.
const input = {
  moveX: 0, moveY: 0, moving: false, aimX: 0, aimY: 0, firing: false, dash: false,
  // Is this visit flying on a thumb? One boolean, and game/assists.js is the whole of what it
  // means: the trigger is held and the gun finds its own body, which is the other half of PLAN
  // section 6's touch line and is those two switches already implemented. A keyboard or mouse visit
  // leaves it false and is the visit it always was.
  thumb: false,
};

export function initInput(canvas, handlers) {
  initKeyboard(handlers);
  initMouse(canvas, handlers);
  initTouch(canvas, handlers);
  window.addEventListener('blur', clearInput);
}

/** Fold the devices this build supports into `input`. */
export function readInput() {
  const dx = ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0);
  const dy = ((keys.KeyS || keys.ArrowDown) ? 1 : 0) - ((keys.KeyW || keys.ArrowUp) ? 1 : 0);

  input.moving = dx !== 0 || dy !== 0;
  if (input.moving) {
    const length = Math.sqrt(dx * dx + dy * dy);
    input.moveX = dx / length;
    input.moveY = dy / length;
  } else {
    input.moveX = 0;
    input.moveY = 0;
  }

  // A thumb on the stick drives the ship the way the keys do, and is the last word: whichever hand
  // is on the glass right now is the one the game listens to. The stick's push is already a vector
  // of at most 1, so a half lean is a half-speed ship and a full one is the ship's own top speed.
  if (thumb.onStick) {
    input.moving = true;
    input.moveX = thumb.pushX;
    input.moveY = thumb.pushY;
  }

  input.aimX = mouse.x;
  input.aimY = mouse.y;
  input.firing = mouse.down;
  input.dash = keyTaps.dash || mouseTaps.dash || touchTaps.dash;
  input.thumb = thumb.used;
  return input;
}

/** The simulation has seen this frame's one-shot requests; forget them. */
export function consumeInput() {
  keyTaps.dash = false;
  mouseTaps.dash = false;
  touchTaps.dash = false;
}

export function clearInput() {
  clearKeys();
  releaseMouse();
  clearThumb();
}

export { keys, mouse, thumb };
