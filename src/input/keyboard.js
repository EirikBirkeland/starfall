// The keyboard. It keeps a table of what is held down and reports the few keys that are actions
// rather than state; it knows nothing about the game.
//
// Which key means what comes from `core/keymap.js`, all of it, for every control a player can move
// (PLAN section 6). What is hard-coded here is only what no panel can offer a row for: the launch,
// the numbers that answer a card or a ship, the two volume pairs, `F3`, and the arrows that drive a
// panel's cursor. Why those stay put is written out beside the table in `core/keymap.js`.

import { actionFor } from '../core/keymap.js';

export const keys = Object.create(null);

// Keys the browser would otherwise scroll or click for us.
const SWALLOWED = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'F3'];
const CONFIRM = ['Space', 'Enter', 'NumpadEnter'];

// The one key that always holds the run and is never a row on the controls rack (core/keymap.js). It
// is not bindable either - a key that cancels a rebinding cannot be the key a rebinding takes - so the
// PAUSE row prints `P` and says on its own line that `ESC` does it too, which is the only way those two
// can stay true at once. One key, one meaning, still: `Esc` never closes a panel.
const ALWAYS_PAUSE = ['Escape'];

// The upgrade cards are picked with a number (PLAN section 4), and the screens that are not a run
// use the same numbers to pick the ship to fly (game/hangar.js `pickShipByIndex`, and the rack is
// built in game/ships.js's order). So the number is read out of the key rather than looked up in a
// table of three: three cards are dealt, five ships are on the rack and more are coming, and a
// table that stops at three is how a ship ends up unpickable.
// Shift turns the same number into the *other* thing that key can be answered with, which is one
// idiom for two screens: during a run it cuts that card's line out of the run for good
// (game/upgrades.js `banishOffer`), and between runs it pays for that ship (game/hangar.js
// `buyShipByIndex`). Anything past a digit is refused here and by whatever is being answered, which
// between them cover every index the game can be asked for.
const PICK_DIGIT = /^(?:Digit|Numpad)([1-9])$/;

/** Which card or ship this key asks for, or 0 when it asks for neither. */
function pickOf(code) {
  const digits = PICK_DIGIT.exec(code);
  return digits === null ? 0 : parseInt(digits[1], 10);
}

// The two volume sliders (audio/engine.js), one pair of neighbours each on the top row: `[ ]`
// for the music, `- =` for the sounds. None of these four is a movement key, the launch, the
// dash, a card number, the reroll or the mute, which is the whole of how a key gets chosen in
// this game. Left of the pair turns a bus down and right turns it up, which is the direction
// the glyphs themselves point in. They stay fixed because the sliders are two rows on the settings
// panel, which is the same number of arrow presses away on any keyboard.
const VOLUME_KEYS = {
  BracketLeft: ['music', -1],
  BracketRight: ['music', 1],
  Minus: ['effects', -1],
  Equal: ['effects', 1],
};

// The developer's panel (PLAN milestone 10): what the frame costs, what the arena is holding, and
// what the pools have built. F3 because it is the key every browser already means "the other screen"
// and nothing else in this game is beside it, and the browser's own use for it is swallowed above so
// that one press is one toggle. It is the only key in the game that works over every screen, panel
// and card alike, which is the whole point of a tool you reach for in the middle of a fight - and the
// reason it is not a row the controls panel can be asked to move.
const DEBUG_KEYS = ['F3'];

// Inside a panel, the arrow keys are the cursor and nothing else. WASD are deliberately
// not bound here: they are how the ship flies, and a panel that also flew the ship one way and pointed
// a row another would be the one screen in the game where a key means two things at once. The arrows
// do mean the ship's movement - but only while a run is being flown, and no panel can be put up over
// a run that is flying (main.js `settingsMayOpen`), so on the one screen that has these keys there is
// nothing else for them to mean.
const ROW_KEYS = { ArrowUp: -1, ArrowDown: 1 };
const CHANGE_KEYS = { ArrowLeft: -1, ArrowRight: 1 };

// One-shot requests: a key that means "do that thing" rather than "this is held".
// input/index.js folds them into the descriptor and clears them once the
// simulation has had its turn at them.
export const keyTaps = { dash: false };

/**
 * The one listener a panel can put in front of every other one (main.js uses it for a row that is
 * being rebound: it needs the next key the hand presses, and nothing else may have it first).
 *
 * While it is set the keyboard is not a keyboard: no key is remembered as held, no handler is told,
 * nothing else is even looked at. One keypress, one answer, and the panel takes the listener back
 * (main.js `stopListening`). `preventDefault` on everything it swallows, because a page is allowed to
 * scroll, click a link or open the browser's own search on a key that a panel has just been given.
 */
let capture = null;

/** Give one listener the next keypress, or take the listener away (pass null). */
export function captureKeys(fn) {
  capture = typeof fn === 'function' ? fn : null;
}

/**
 * handlers.onConfirm   - "start / restart", whatever the screen means by it
 * handlers.onPickCard  - the number of an upgrade card, or of a ship on the rack, and whether it
 *                        was asked for with Shift (banish the card, or buy the ship)
 * handlers.onReroll    - the deal was asked for again
 * handlers.onHangar    - the hangar was asked for, or asked to go away
 * handlers.onCodex     - the codex was asked for, or asked to go away
 * handlers.onPause     - the run was asked to hold still, or to go on
 * handlers.onGiveUp    - the run was given up, from the pause screen and nowhere else
 * handlers.onSettings  - the settings panel was asked for, or asked to go away
 * handlers.onToday     - today's arena was asked for (game/daily.js)
 * handlers.onDebug     - the developer's panel was asked for, or asked to go away (F3)
 * handlers.onRowMove   - the panel cursor was moved one row: +1 down the panel, -1 up
 * handlers.onRowChange - the row the cursor is on was changed: -1 down its travel, +1 up
 * handlers.onToggleMute
 * handlers.onVolume    - one step of one slider: which bus, and which way (-1 or 1)
 *
 * Every one of those except `onConfirm`, `onPickCard`, `onDebug` and `onVolume` is answered by a
 * control in core/keymap.js's table, which is the part of the keyboard a player can move.
 */
export function initKeyboard(handlers) {
  window.addEventListener('keydown', function (event) {
    const code = event.code || event.key;

    // A panel that is asking for a key owns the keyboard for exactly one keypress, and it gets the
    // press before anything else does - including the launch, including the dash, including the pause
    // that `Esc` is. Auto-repeats are not further presses: one hold is one key offered.
    //
    // The four arrows are the exception, and there is no kindness in it: they are the panel's own verbs
    // and core/keymap.js will not accept one as a binding, so a hand that presses one is moving about
    // the rack and not naming a key. Sending them to the capture would leave a player unable to leave.
    if (capture !== null
        && ROW_KEYS[code] === undefined && CHANGE_KEYS[code] === undefined) {
      event.preventDefault();
      if (!event.repeat) capture(code);
      return;
    }

    keys[code] = true;
    if (SWALLOWED.indexOf(code) >= 0) event.preventDefault();
    const action = actionFor(code);

    // One press, one request: a key held down through its auto-repeats is one press.
    // Recorded before onConfirm is told, because a screen that swallows the press -
    // the launch, which is Space as well as the dash - retires the request (main.js).
    // Recorded after, the launch would leave a dash queued for the run's first step.
    if (action === 'dash' && !event.repeat) keyTaps.dash = true;
    if (CONFIRM.indexOf(code) >= 0 && handlers.onConfirm) handlers.onConfirm();
    if (!event.repeat) {
      const pick = pickOf(code);
      if (pick !== 0 && handlers.onPickCard) handlers.onPickCard(pick, !!event.shiftKey);
      const slider = VOLUME_KEYS[code];
      if (slider && handlers.onVolume) handlers.onVolume(slider[0], slider[1]);
      if (DEBUG_KEYS.indexOf(code) >= 0 && handlers.onDebug) handlers.onDebug();
      if (ALWAYS_PAUSE.indexOf(code) >= 0 && handlers.onPause) handlers.onPause();
      const row = ROW_KEYS[code];
      if (row !== undefined && handlers.onRowMove) handlers.onRowMove(row);
      const change = CHANGE_KEYS[code];
      if (change !== undefined && handlers.onRowChange) handlers.onRowChange(change);
      // The controls a player can move, answered last and by the table: the four movement keys are in
      // here and answer nothing, because they are held state and input/index.js reads them per frame.
      if (action !== '' && action !== 'dash') runAction(action, handlers);
    }
  });

  window.addEventListener('keyup', function (event) {
    keys[event.code || event.key] = false;
  });
}

/** What a rebound control does when it is pressed. One switch, because "which key" is now a lookup. */
function runAction(action, handlers) {
  switch (action) {
    case 'pause':
      if (handlers.onPause) handlers.onPause();
      break;
    case 'giveup':
      if (handlers.onGiveUp) handlers.onGiveUp();
      break;
    case 'hangar':
      if (handlers.onHangar) handlers.onHangar();
      break;
    case 'codex':
      if (handlers.onCodex) handlers.onCodex();
      break;
    case 'settings':
      if (handlers.onSettings) handlers.onSettings();
      break;
    case 'daily':
      if (handlers.onToday) handlers.onToday();
      break;
    case 'reroll':
      if (handlers.onReroll) handlers.onReroll();
      break;
    case 'mute':
      if (handlers.onToggleMute) handlers.onToggleMute();
      break;
    default:
      // up, down, left, right: held state, and read by input/index.js on the frame's turn.
      break;
  }
}

/** Forget every held key: called when the window loses focus. */
export function clearKeys() {
  for (const code in keys) keys[code] = false;
  keyTaps.dash = false;
}
