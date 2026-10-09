// The keyboard. It keeps a table of what is held down and reports the few keys
// that are actions rather than state; it knows nothing about the game.

export const keys = Object.create(null);

// Keys the browser would otherwise scroll or click for us.
const SWALLOWED = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
const CONFIRM = ['Space', 'Enter', 'NumpadEnter'];
const DASH_KEYS = ['Space'];

// The upgrade cards are picked with a number (PLAN section 4). One per card, so a
// fourth key is simply not one of them. The same numbers with Shift answer a card the
// other way - by cutting it out of the run (game/upgrades.js `banishOffer`).
const PICK_KEYS = { Digit1: 1, Digit2: 2, Digit3: 3, Numpad1: 1, Numpad2: 2, Numpad3: 3 };

// The reroll. A word to remember it by, and out of the way of everything else: R is not
// a movement key, not the mute, and not the launch.
const REROLL_KEYS = ['KeyR'];

// One-shot requests: a key that means "do that thing" rather than "this is held".
// input/index.js folds them into the descriptor and clears them once the
// simulation has had its turn at them.
export const keyTaps = { dash: false };

/**
 * handlers.onConfirm   - "start / restart", whatever the screen means by it
 * handlers.onPickCard  - the number of an upgrade card that was just asked for, and
 *                        whether it was asked for with Shift (banish, not take)
 * handlers.onReroll    - the deal was asked for again
 * handlers.onToggleMute
 */
export function initKeyboard(handlers) {
  window.addEventListener('keydown', function (event) {
    const code = event.code || event.key;
    keys[code] = true;
    if (SWALLOWED.indexOf(code) >= 0) event.preventDefault();
    // One press, one request: a key held down through its auto-repeats is one press.
    // Recorded before onConfirm is told, because a screen that swallows the press -
    // the launch, which is Space as well as the dash - retires the request (main.js).
    // Recorded after, the launch would leave a dash queued for the run's first step.
    if (DASH_KEYS.indexOf(code) >= 0 && !event.repeat) keyTaps.dash = true;
    if (CONFIRM.indexOf(code) >= 0 && handlers.onConfirm) handlers.onConfirm();
    if (!event.repeat) {
      const pick = PICK_KEYS[code];
      if (pick !== undefined && handlers.onPickCard) handlers.onPickCard(pick, !!event.shiftKey);
      if (REROLL_KEYS.indexOf(code) >= 0 && handlers.onReroll) handlers.onReroll();
    }
    if (code === 'KeyM' && !event.repeat && handlers.onToggleMute) handlers.onToggleMute();
  });

  window.addEventListener('keyup', function (event) {
    keys[event.code || event.key] = false;
  });
}

/** Forget every held key: called when the window loses focus. */
export function clearKeys() {
  for (const code in keys) keys[code] = false;
  keyTaps.dash = false;
}
