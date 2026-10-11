// The keyboard. It keeps a table of what is held down and reports the few keys
// that are actions rather than state; it knows nothing about the game.

export const keys = Object.create(null);

// Keys the browser would otherwise scroll or click for us.
const SWALLOWED = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'F3'];
const CONFIRM = ['Space', 'Enter', 'NumpadEnter'];
const DASH_KEYS = ['Space'];

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

// The codex (PLAN 3.7) - what the runs of this save have met. Same rule as the hangar's key, and the
// same reason for a key of its own instead of another row on that rack: the numbers are all spoken
// for, and a row nobody can buy has no business among rows that can be.
const CODEX_KEYS = ['KeyC'];

// The pause (PLAN section 4) - the run held where it stands, and let go again by the same key.
// Escape is the key every browser already means "back out of what I was doing" and P is the word;
// neither is a movement key, the launch, the dash, a card or ship number, the reroll, the mute, a
// slider, H or C. Esc does *not* mean "close a panel": one key, one meaning, and H and C already
// close the two panels they belong to.
const PAUSE_KEYS = ['Escape', 'KeyP'];

// Giving the run up, which the pause screen offers and nothing else does. This is the one key in the
// game that costs a run, so it sits as far from WASD as the alphabet gets - and main.js only answers
// it with the pause on the glass, so a stray press in the middle of a fight ends nothing.
const GIVEUP_KEYS = ['KeyG'];

// The settings panel (PLAN section 6): the shake, the flash, the floating numbers, and the sound.
// O for options - because S, the first letter of the word, is the ship's own down key and a key that
// moves the ship must never move anything else. O is beside P, which is the pause, and the two panels
// are the two places a run is looked at; and it is none of the movement keys, the launch, the dash, a
// card or ship number, the reroll, the mute, a slider, H, C, P or G.
const SETTINGS_KEYS = ['KeyO'];

// The developer's panel (PLAN milestone 10): what the frame costs, what the arena is holding, and
// what the pools have built. F3 because it is the key every browser already means "the other screen"
// and nothing else in this game is beside it - it is not a movement key, a launch, a dash, a number,
// the mute, a slider or any of the letters - and the browser's own use for it is swallowed above so
// that one press is one toggle. It is the only key in the game that works over every screen, panel
// and card alike, which is the whole point of a tool you reach for in the middle of a fight.
const DEBUG_KEYS = ['F3'];

// The daily run (PLAN milestone 10): fly today's arena, the one everybody else is flying. T for
// *today* - D is the ship's own right key and a key that moves the ship never means anything else,
// the same reason the settings are O and not S. It is not a movement key, the launch, the dash, a
// card or ship number, the reroll, the mute, a slider, H, C, P, G or O.
const TODAY_KEYS = ['KeyT'];

// Inside the settings panel, the arrow keys are the cursor and nothing else. WASD are deliberately
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
 * handlers.onRowMove   - the settings cursor was moved one row: +1 down the panel, -1 up
 * handlers.onRowChange - the row the settings cursor is on was changed: -1 down its travel, +1 up
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
      if (CODEX_KEYS.indexOf(code) >= 0 && handlers.onCodex) handlers.onCodex();
      if (PAUSE_KEYS.indexOf(code) >= 0 && handlers.onPause) handlers.onPause();
      if (GIVEUP_KEYS.indexOf(code) >= 0 && handlers.onGiveUp) handlers.onGiveUp();
      if (SETTINGS_KEYS.indexOf(code) >= 0 && handlers.onSettings) handlers.onSettings();
      if (TODAY_KEYS.indexOf(code) >= 0 && handlers.onToday) handlers.onToday();
      if (DEBUG_KEYS.indexOf(code) >= 0 && handlers.onDebug) handlers.onDebug();
      const row = ROW_KEYS[code];
      if (row !== undefined && handlers.onRowMove) handlers.onRowMove(row);
      const change = CHANGE_KEYS[code];
      if (change !== undefined && handlers.onRowChange) handlers.onRowChange(change);
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
