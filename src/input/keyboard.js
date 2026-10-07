// The keyboard. It keeps a table of what is held down and reports the few keys
// that are actions rather than state; it knows nothing about the game.

export const keys = Object.create(null);

// Keys the browser would otherwise scroll or click for us.
const SWALLOWED = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
const CONFIRM = ['Space', 'Enter', 'NumpadEnter'];
const DASH_KEYS = ['Space'];

// One-shot requests: a key that means "do that thing" rather than "this is held".
// input/index.js folds them into the descriptor and clears them once the
// simulation has had its turn at them.
export const keyTaps = { dash: false };

/**
 * handlers.onConfirm   - "start / restart", whatever the screen means by it
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
