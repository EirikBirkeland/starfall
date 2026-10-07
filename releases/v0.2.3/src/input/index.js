// The input layer's single output: one small descriptor the simulation reads
// once per step. Gamepad and touch will join it here later.
//
// Two kinds of thing come through. Held state (which way the ship is being
// driven, whether the fire button is down) is read fresh every frame. One-shot
// requests (a dash) are *requests*: they stay pending until a frame that ran any
// simulation steps has handed them over, so a press that lands on a frame that
// simulated nothing is not swallowed. consumeInput() is what retires them.

import { keys, keyTaps, initKeyboard, clearKeys } from './keyboard.js';
import { mouse, mouseTaps, initMouse, releaseMouse } from './mouse.js';

// Reused every frame; the simulation only reads it during the step.
const input = { moveX: 0, moveY: 0, moving: false, aimX: 0, aimY: 0, firing: false, dash: false };

export function initInput(canvas, handlers) {
  initKeyboard(handlers);
  initMouse(canvas, handlers);
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

  input.aimX = mouse.x;
  input.aimY = mouse.y;
  input.firing = mouse.down;
  input.dash = keyTaps.dash || mouseTaps.dash;
  return input;
}

/** The simulation has seen this frame's one-shot requests; forget them. */
export function consumeInput() {
  keyTaps.dash = false;
  mouseTaps.dash = false;
}

export function clearInput() {
  clearKeys();
  releaseMouse();
}

export { keys, mouse };
