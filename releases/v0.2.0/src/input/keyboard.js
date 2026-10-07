// The keyboard. It keeps a table of what is held down and reports the few keys
// that are actions rather than state; it knows nothing about the game.

export const keys = Object.create(null);

// Keys the browser would otherwise scroll or click for us.
const SWALLOWED = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
const CONFIRM = ['Space', 'Enter', 'NumpadEnter'];

/**
 * handlers.onConfirm   - "start / restart", whatever the screen means by it
 * handlers.onToggleMute
 */
export function initKeyboard(handlers) {
  window.addEventListener('keydown', function (event) {
    const code = event.code || event.key;
    keys[code] = true;
    if (SWALLOWED.indexOf(code) >= 0) event.preventDefault();
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
}
