// The keyboard. It keeps a table of what is held down and reports the few keys
// that are actions rather than state; it knows nothing about the game.

export const keys = Object.create(null);

// Keys the browser would otherwise scroll or click for us.
const SWALLOWED = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
const CONFIRM = ['Space', 'Enter', 'NumpadEnter'];
const DASH_KEYS = ['Space'];

// The upgrade cards are picked with a number (PLAN section 4), and the screens that are not a run
// use the same numbers to pick the ship to fly (game/ships.js `setShipByIndex`, and the hangar's
// rack is built in that order). So the number is read out of the key rather than looked up in a
// table of three: three cards are dealt, five ships are on the rack and more are coming, and a
// table that stops at three is how a ship ends up unpickable.
// Shift turns the same number into the other thing a card can be answered with - cutting that line
// out of the run (game/upgrades.js `banishOffer`). Anything past a digit is refused here and by
// whatever is being answered, which between them cover every index the game can be asked for.
const PICK_DIGIT = /^(?:Digit|Numpad)([1-9])$/;

/** Which card or ship this key asks for, or 0 when it asks for neither. */
function pickOf(code) {
  const digits = PICK_DIGIT.exec(code);
  return digits === null ? 0 : parseInt(digits[1], 10);
}

// The reroll. A word to remember it by, and out of the way of everything else: R is not
// a movement key, not the mute, and not the launch.
const REROLL_KEYS = ['KeyR'];

// The two volume sliders (audio/engine.js), one pair of neighbours each on the top row: `[ ]`
// for the music, `- =` for the sounds. None of these four is a movement key, the launch, the
// dash, a card number, the reroll or the mute, which is the whole of how a key gets chosen in
// this game. Left of the pair turns a bus down and right turns it up, which is the direction
// the glyphs themselves point in.
const VOLUME_KEYS = {
  BracketLeft: ['music', -1],
  BracketRight: ['music', 1],
  Minus: ['effects', -1],
  Equal: ['effects', 1],
};

// The hangar (PLAN 3.7) - the screen a run is chosen from. H is not a movement key, the launch,
// the dash, a card number, the reroll, the mute or a slider, which is the whole of how a key gets
// picked in this game.
const HANGAR_KEYS = ['KeyH'];

// One-shot requests: a key that means "do that thing" rather than "this is held".
// input/index.js folds them into the descriptor and clears them once the
// simulation has had its turn at them.
export const keyTaps = { dash: false };

/**
 * handlers.onConfirm   - "start / restart", whatever the screen means by it
 * handlers.onPickCard  - the number of an upgrade card that was just asked for, and
 *                        whether it was asked for with Shift (banish, not take)
 * handlers.onReroll    - the deal was asked for again
 * handlers.onHangar    - the hangar was asked for, or asked to go away
 * handlers.onToggleMute
 * handlers.onVolume    - one step of one slider: which bus, and which way (-1 or 1)
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
      const pick = pickOf(code);
      if (pick !== 0 && handlers.onPickCard) handlers.onPickCard(pick, !!event.shiftKey);
      if (REROLL_KEYS.indexOf(code) >= 0 && handlers.onReroll) handlers.onReroll();
      const slider = VOLUME_KEYS[code];
      if (slider && handlers.onVolume) handlers.onVolume(slider[0], slider[1]);
      if (HANGAR_KEYS.indexOf(code) >= 0 && handlers.onHangar) handlers.onHangar();
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
