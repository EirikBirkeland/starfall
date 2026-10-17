// The gamepad: a stick to fly with, a stick to point the guns with, a shoulder to get out of the
// way with (PLAN section 6).
//
// PLAN's row is three controls - "left stick to move, right stick to aim and fire, a shoulder button
// to dash" - and that is what this file implements, plus the two presses every screen already means:
// A is the launch key and Start is the pause. Nothing else on a pad is bound, and that is a decision
// rather than an omission, so it is written down here:
//
//   * **A pad in a browser is never the only device.** It arrives beside a keyboard, it is polled
//     beside it, and a hand that reaches for the pad has not put the mouse down. The cards, the
//     hangar, the codex and the settings stay keyboard and mouse racks - which is also what they are
//     for a thumb (input/touch.js says the same thing about the glass).
//   * **A fake cursor on the glass is a whole interface of its own** - which card is lit, what moves
//     it, what clicks it, and what happens when it is over nothing. Inventing one here would be a
//     bigger design than the one line of PLAN's it is meant to serve, and it would be a second
//     pointer to keep in step with the mouse's for no gain a player could name.
//
// **The pad is polled, not listened for.** `gamepadconnected` says a pad arrived, not that a button
// moved, and no other event says a button moved at all; so `readPads()` runs once a frame from
// input/index.js and a pad plugged in mid-visit is flying the ship within one frame of being plugged
// in, with no listener to register, no state machine and nothing to unsubscribe from when it leaves.
//
// **Two families of pad answer through the API and every layout question has to be answered twice** -
// see `layoutOf` below. Everything the two families agree on is read without asking: the sticks live
// on axes 0 to 3, A is button 0 and the right bumper is button 5.
//
// Nothing here is simulated, and nothing here is remembered between visits. Like the thumb, the mouse
// and the keys, a pad writes into the one descriptor the simulation reads (input/index.js); a visit
// that never touched a pad plays the run it always played, down to the trace hash, and this file
// never draws from either number stream.

import { hypot } from '../core/math.js';

// How far a stick has to be leaned for it to be meant. The aim's line is the bigger of the two
// because it is also the trigger's: past it the guns are held open (PLAN's "right stick to aim and
// fire"), so the room a thumb has to rest in without firing has to be the roomier one.
const MOVE_DEAD = 0.2;
const AIM_DEAD = 0.32;
// How far a trigger has to be pulled to be a press. It is a whole axis of travel and a pad at rest
// sits anywhere on it, so this is a line and not a value.
const TRIGGER_LINE = 0.3;

/**
 * Where the two buttons the two families disagree about are: the right trigger, and Start.
 *
 * A pad that reports fewer than five axes is the family the Gamepad API's own "standard" mapping was
 * drawn for: both sticks on axes 0-3, both triggers reported as buttons (the right one is 7), Back
 * at 8 and Start at 9. That is what an Xbox pad says on Windows, and what a great many generic pads
 * imitate. A pad that reports five or six axes is the older family with the two triggers as axes 4
 * and 5 - and with everything from the bumpers inwards shifted down two places, so its Start is 7.
 *
 * A pad that fits neither family still flies: the sticks, A and the right bumper are read
 * unconditionally. The right trigger and Start are the only two guesses here, and when Start is
 * guessed wrong the worst a stick click does is hold the run, which the same press lets go of.
 */
const FOUR_AXIS = { trigger: 7, triggerAxis: -1, start: 9 };
const SIX_AXIS = { trigger: -1, triggerAxis: 5, start: 7 };

/**
 * What the game reads: where the sticks are leaned and whether the guns are being held open.
 *
 * `name` is the only fact here about the pad as a thing - the developer's panel prints it and a
 * headless tool asks it, and it is '' whenever no pad is being read, so a pad that has been unplugged
 * cannot be reported as one that is plugged in. The rest is this frame's controls, and it is zeroed
 * whenever no pad is being read, so a pad unplugged mid-run stops flying the ship rather than flying
 * it forever in the direction somebody left it.
 */
export const pad = {
  name: '',
  onStick: false,   // the left stick is being leaned
  pushX: 0,         // ...and how far: a vector no longer than 1, so a half lean is a half-speed ship
  pushY: 0,
  aiming: false,    // the right stick is being leaned, which also holds the trigger open
  firing: false,
  aimX: 0,          // the direction it points, as a unit vector: a direction and not a place
  aimY: 0,
};

// One-shot requests, the same arrangement as the keyboard's, the mouse's and the thumb's: the dash is
// a request that waits for a frame that ran a step (input/index.js explains why). The other two are
// answered where they are read, because a launch and a pause are a screen's business and not the
// simulation's.
export const padTaps = { dash: false };

let confirmPress = null;
let pausePress = null;

// Which buttons were held last frame. A button is a press and not a state, and this is the only place
// the difference can be seen: the poll sees a pad twice in a row and the press is the gap between.
let heldDash = false;
let heldConfirm = false;
let heldPause = false;

// Reused scratch, because this runs every frame and "no allocation inside the per-frame loops" is a
// rule (PLAN section 2).
const lean = { x: 0, y: 0 };

function layoutOf(gamepad) {
  return gamepad.axes.length >= 5 ? SIX_AXIS : FOUR_AXIS;
}

/**
 * What the pad is called, in the length a panel has room for.
 *
 * A browser puts everything it knows about a device in `id` - "Wireless Controller (STANDARD GAMEPAD
 * Vendor: 0x045d Product: 0x028f)" - and the part a human reads is the part before the bracket. The
 * rest is for a driver and for `navigator.getGamepads()` to be able to tell two pads apart, neither
 * of which is a developer's panel that is 117 px wide in this column.
 */
function nameOf(gamepad) {
  if (gamepad.id === undefined || gamepad.id === null) return 'GAMEPAD';
  const name = String(gamepad.id).split('(')[0].trim();
  return name === '' ? 'GAMEPAD' : name;
}

/** Is this button down? Browsers have reported a button as an object, a number and a boolean. */
function buttonDown(gamepad, index) {
  if (index < 0) return false;
  const button = gamepad.buttons[index];
  if (button === undefined || button === null) return false;
  if (typeof button === 'object') return button.pressed === true;
  return Number(button) > 0.5;
}

function axisOf(gamepad, index) {
  if (index < 0) return 0;
  const value = gamepad.axes[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * How far a stick is leaned, into `lean`: a direction, and how far along it.
 *
 * Inside the dead zone it is not being leaned at all. Past it the push is *remeasured from the zone*,
 * so a lean that has only just cleared the line is a nudge rather than a lurch - and the end of the
 * stick's travel is still 1, which is still the ship's own top speed, because game/player.js `steer`
 * clamps the speed it is handed.
 */
function leanOf(x, y, dead) {
  const length = hypot(x, y);
  if (length <= dead) {
    lean.x = 0;
    lean.y = 0;
    return false;
  }
  const push = Math.min(1, (length - dead) / (1 - dead));
  lean.x = (x / length) * push;
  lean.y = (y / length) * push;
  return true;
}

/**
 * The first pad the browser will hand over, or null when there is none.
 *
 * The API is missing outright on a browser without it (and on every headless tool that has not
 * pretended), which is not an error and is not worth hearing about again: no pad, no polling.
 * Otherwise the list is sparse - `getGamepads()` keeps a hole where a pad used to be - so the first
 * one that is there wins, and a player with two pads flies on whichever was plugged in first.
 */
function firstPad() {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
  const pads = navigator.getGamepads();
  if (pads === undefined || pads === null) return null;
  for (let i = 0; i < pads.length; i++) {
    if (pads[i] !== null && pads[i] !== undefined) return pads[i];
  }
  return null;
}

/** Every stick home and nothing held: what a visit with no pad on it looks like. */
function letGo() {
  pad.name = '';
  pad.onStick = false;
  pad.pushX = 0;
  pad.pushY = 0;
  pad.aiming = false;
  pad.firing = false;
  // The last direction the stick was pointing stays in `aimX/aimY`: a hand that let go of the aim
  // stick left the nose pointing there, and input/index.js is what decides whether it still owns it.
  heldDash = false;
  heldConfirm = false;
  heldPause = false;
}

/**
 * Read the pad. Called once a frame, from `readInput` (input/index.js), because a pad is the one
 * device with no event worth waiting for.
 *
 * `handlers.onConfirm` and `handlers.onPause` are answered here and now, the way a keydown answers
 * them - not queued for the simulation. A screen takes the run or holds it wherever it is asked, and
 * a frame that ran no step at all (a 240 Hz display, or the frame after a long stall) is still a
 * frame in which a player pressed a button and expects an answer.
 */
export function readPads() {
  const gamepad = firstPad();
  if (gamepad === null) {
    letGo();
    return;
  }

  pad.name = nameOf(gamepad);
  const layout = layoutOf(gamepad);

  // --- the left stick: the ship's own lean
  pad.onStick = leanOf(axisOf(gamepad, 0), axisOf(gamepad, 1), MOVE_DEAD);
  pad.pushX = lean.x;
  pad.pushY = lean.y;

  // --- the right stick: where the guns point, and the trigger with it
  const leaned = leanOf(axisOf(gamepad, 2), axisOf(gamepad, 3), AIM_DEAD);
  if (leaned) {
    // Only the line matters to a gun, so this keeps the direction and throws the travel away. A stick
    // that comes back to the middle keeps whatever it last pointed at: the nose stays where the hand
    // left it rather than snapping back to a pointer the hand has not touched in minutes. Whether the
    // nose *should* stay there is input/index.js's question to answer, and it is not this file's.
    pad.aimX = lean.x;
    pad.aimY = lean.y;
  }
  pad.aiming = leaned;
  pad.firing = leaned;

  // --- the shoulder: one press, one dash, wherever the finger goes after that
  const dash = buttonDown(gamepad, 5) || (layout.triggerAxis >= 0
    ? axisOf(gamepad, layout.triggerAxis) > TRIGGER_LINE
    : buttonDown(gamepad, layout.trigger));
  if (dash && !heldDash) padTaps.dash = true;
  heldDash = dash;

  // --- the two presses every screen already means
  const confirm = buttonDown(gamepad, 0);
  if (confirm && !heldConfirm && confirmPress !== null) confirmPress();
  heldConfirm = confirm;

  const pause = buttonDown(gamepad, layout.start);
  if (pause && !heldPause && pausePress !== null) pausePress();
  heldPause = pause;
}

/**
 * handlers.onConfirm - A, which is whatever Space is on the screen that is up.
 * handlers.onPause   - Start, which is whatever Escape and P are (game/run.js holds and lets go).
 */
export function initGamepad(handlers) {
  confirmPress = handlers.onConfirm || null;
  pausePress = handlers.onPause || null;
}

/**
 * Let go of everything (window blur). Only the request that was on its way to the simulation is
 * dropped - the sticks are read fresh every frame and a pad that was held while the window lost focus
 * is still being held when it comes back, which is the truth and not a bug to paper over.
 */
export function clearPad() {
  padTaps.dash = false;
}
