// The keys the game answers to, and what this player has told them to mean (PLAN section 6).
//
// This is a *table and a document*, not an event listener: `input/keyboard.js` is the one place that
// hears a key and asks this file what it meant, and the panels and the glass that *print* a key ask
// this file what to say. That split is why the table lives here rather than in `input/` - the game has
// to know which key the dash is on to teach the dash (game/tutorial.js), and `game/` may not reach
// into `input/` (test/structure.test.mjs) any more than it may reach into the canvas.
//
// Three promises hold it together:
//
//   **One key, one action.** A key means one thing in this game, so a rebinding that takes a key
//   somebody else holds *swaps* them: the action that had it moves to the key the hand just left.
//   Nothing is ever silently unbound, and every mess is one more press away from being untangled -
//   which is the whole reason swaps beat refusals here. A press of the key a row already wears is
//   refused, because it changed nothing.
//
//   **A row can always be put back.** Every action knows the key it ships with and `restore` hands it
//   back, so a save that has been rearranged into something unplayable is never a dead end. The
//   shipped table is also what a save with nothing in it stands on, and a stored code this build has
//   never heard of is not a binding at all - the row ships (the same bargain `game/settings.js`
//   strikes with a step name it does not know).
//
//   **What the panel prints is what the game hears.** Every reader asks *this* table - the title's
//   control list, the pause's line of keys, the lesson plate in play, the panel itself - so a rebound
//   key cannot be stale in one place and fresh in another. That is the same rule `main.js` already
//   keeps for the mute switch: a readout that has not noticed the change is a readout that is lying.
//
// A key is named by `KeyboardEvent.code` (`KeyW`, `Space`, `BracketLeft`), which names a *place on
// the keyboard* rather than the letter printed on it. That is the honest choice for a game: it is what
// the browser is willing to promise for any layout, and it is what a code can be compared against
// later. The cost is that on a non-QWERTY keyboard the word beside a row spells the QWERTY name of
// the key the player is looking at - which is why the panel puts the word in a key chip and lets the
// player press whatever is under their finger, once, rather than asking them to spell it.

import { section, remember } from './save.js';

/**
 * The actions a hand may rebind, in the order the controls panel prints them.
 *
 * These are the keys that are *hard* on a keyboard that is not QWERTY. The ones left out are left out
 * on purpose, and every one of them is reachable some other way:
 *
 *   * `Space`, `Enter` are the launch on every screen the game can be launched from, and a launch that
 *     could be moved could be moved somewhere the hand cannot find it again while a card is up. The
 *     dash ships on `Space` and *is* rebindable, which is the half of that pair a hand can hurt.
 *   * the number keys pick a card and pick a ship (input/keyboard.js). They are how a card is answered
 *     under a timer and they mean the same thing on every screen, so they stay.
 *   * the arrows are the cursor on every panel and fly the ship as well, both always (see
 *     `input/index.js`); `F3` is the developer's panel, which has to be reachable in the middle of a
 *     fight whatever else has been moved; `Esc` always holds the run and always cancels a rebinding.
 *   * the two volume pairs stay, because the sliders are rows on the settings panel and every slider
 *     is two arrow presses from the arrow keys.
 */
export const ACTIONS = [
  { id: 'up', name: 'UP', says: 'THE SHIP GOES UP', shipped: 'KeyW' },
  { id: 'down', name: 'DOWN', says: 'THE SHIP GOES DOWN', shipped: 'KeyS' },
  { id: 'left', name: 'LEFT', says: 'THE SHIP GOES LEFT', shipped: 'KeyA' },
  { id: 'right', name: 'RIGHT', says: 'THE SHIP GOES RIGHT', shipped: 'KeyD' },
  { id: 'dash', name: 'DASH', says: 'THE SHORT JUMP, ANY WAY YOU ARE LEANING', shipped: 'Space' },
  { id: 'pause', name: 'PAUSE', says: 'HOLD THE RUN WHERE IT STANDS \u00b7 ESC ALWAYS DOES IT TOO',
    shipped: 'KeyP' },
  { id: 'giveup', name: 'GIVE UP', says: 'END A RUN YOU ARE HOLDING', shipped: 'KeyG' },
  { id: 'hangar', name: 'HANGAR', says: 'THE RACK THE NEXT RUN IS CHOSEN FROM', shipped: 'KeyH' },
  { id: 'codex', name: 'CODEX', says: 'WHAT THIS SAVE HAS MET AND FLOWN', shipped: 'KeyC' },
  { id: 'settings', name: 'SETTINGS', says: 'THE PANEL THAT SETS ALL OF THIS', shipped: 'KeyO' },
  { id: 'daily', name: "TODAY'S ARENA", says: 'THE LAUNCH THAT FLYS THE DAY EVERYONE ELSE IS FLYING',
    shipped: 'KeyT' },
  { id: 'challenge', name: 'CHALLENGE',
    says: 'A HARDER RULE FOR THE NEXT RUN \u00b7 ONE PRESS, ONE RULE, ROUND AGAIN',
    shipped: 'KeyX' },
  { id: 'reroll', name: 'REROLL', says: 'DEAL THE CARDS AGAIN', shipped: 'KeyR' },
  { id: 'mute', name: 'MUTE', says: 'THE WHOLE GAME, QUIET', shipped: 'KeyM' },
];

/**
 * Which keys a hand can be asked to name. A letter, the space bar, and the punctuation keys on the
 * main block: everything a hand can find on any layout without hunting, and nothing the browser has a
 * standing use for. The numbers are deliberately not here (they answer cards and ships, above) and
 * neither are the function keys - a browser does not give `F5` to a page, so binding one would be a
 * key that reloads the game every time it is pressed, remembered in the save forever after.
 */
const BINDABLE = /^(?:Key[A-Z]|Space|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal|Backquote)$/;

/** Is this a key the game can take? */
export function bindable(code) {
  return typeof code === 'string' && BINDABLE.test(code);
}

// How a key is spelled on the glass. `KeyW` spells itself by losing its prefix; the rest need a word
// or a glyph of their own, because `BracketLeft` is not a thing anybody reads at a glance.
const SPELLINGS = {
  Space: 'SPACE',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
};

/**
 * How one key is written on the glass. Something this module cannot name is said as it came in rather
 * than guessed at - the only codes that can reach here come from `ACTIONS` or from a save that has
 * already been checked, so what a player sees is what the game was told.
 */
export function wordFor(code) {
  const spelled = SPELLINGS[code];
  if (spelled !== undefined) return spelled;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  return String(code);
}

/** The action an id names, or null when nobody has heard of it. */
function actionOf(id) {
  for (const action of ACTIONS) {
    if (action.id === id) return action;
  }
  return null;
}

/**
 * What every action is bound to on this visit: action id -> key code. Written by `loadFromSave` and
 * by `rebind`/`restore`, and read by everyone else. `bound` is the whole of the game's knowledge about
 * which key means what - nothing else keeps a copy, which is what makes the panel and the hearing
 * agree by construction instead of by memory.
 */
const bound = {};

/** The reverse index: key code -> action id, rebuilt whenever a binding moves. */
let heard = {};

function rebuildIndex() {
  heard = {};
  for (const id of Object.keys(bound)) heard[bound[id]] = id;
}

/**
 * Put every row on the key it ships with, and index it. Run once when this file is read, so nothing
 * can ever look a control up before the save has been asked - a page that painted its key words
 * before boot got as far as `loadFromSave` would print `undefined` in every chip, and a bug that only
 * happens when the calls are in the wrong order is a bug worth making impossible.
 */
function shipEverything() {
  for (const action of ACTIONS) bound[action.id] = action.shipped;
  rebuildIndex();
}

shipEverything();

/** The bindings as the save document keeps them: only the rows that are not shipped. */
function asStored() {
  const out = {};
  for (const action of ACTIONS) {
    if (bound[action.id] !== action.shipped) out[action.id] = bound[action.id];
  }
  return out;
}

/**
 * Put the rows where the last visit left them (core/save.js, the one `keys.binds` field).
 *
 * Called once at boot, before the first frame, and answers the whole table so `stats()` and a test
 * can see what it landed on. A stored code this build would not accept - a function key from a build
 * that has been and gone, a word, a number the numbers rule refuses - is not an error and not a
 * binding: that row ships. One bad row cannot spoil the other twelve.
 *
 * The whole table is one field of the document rather than a field per control for the same reason the
 * hangar's perk ranks are one ledger: the store would have to know every control by name, and a
 * control this build has never heard of would be a field it throws away instead of a row it ignores.
 */
export function loadFromSave() {
  const stored = section('keys', { binds: {} }).binds;
  for (const action of ACTIONS) {
    const wanted = stored[action.id] === undefined ? action.shipped : stored[action.id];
    bound[action.id] = bindable(wanted) ? wanted : action.shipped;
  }
  rebuildIndex();
  return tableAsWords();
}

/** Every binding, spelled the way the glass spells it: action id -> word. For `stats()` and tests. */
export function tableAsWords() {
  const out = {};
  for (const action of ACTIONS) out[action.id] = wordFor(bound[action.id]);
  return out;
}

/** The key code an action is answered by. Throws on an id the game does not have, like the save does. */
export function codeFor(id) {
  const action = actionOf(id);
  if (action === null) throw new Error('the game has no control called ' + id);
  return bound[id];
}

/** The action a key code answers, or '' when it answers nothing that can be rebound. */
export function actionFor(code) {
  const id = heard[code];
  return id === undefined ? '' : id;
}

/** How many rows this player has moved off their shipped key. Zero is the game as it shipped. */
export function changedCount() {
  let changed = 0;
  for (const action of ACTIONS) {
    if (bound[action.id] !== action.shipped) changed++;
  }
  return changed;
}

/**
 * Take one key for one action, and answer what moved: `{ took, gave }` - the action that was rebound,
 * and the action that had to move out of the key (the one the hand just left), or '' when nobody was
 * standing there. Null when nothing moved: not a bindable key, an action this game does not have, or
 * the row already wearing the key it was given.
 *
 * The swap is the whole design. A refusal would leave the hand holding a key that did nothing and no
 * idea why; a swap always lands every action on a key, so the panel can print all of its rows as
 * true afterwards and one more press can undo this one.
 */
export function rebind(id, code) {
  const action = actionOf(id);
  if (action === null) throw new Error('the game has no control called ' + id);
  if (!bindable(code)) return null;
  const old = bound[id];
  if (old === code) return null;

  const whose = actionFor(code);
  bound[id] = code;
  if (whose !== '') bound[whose] = old;
  rebuildIndex();
  remember('keys', { binds: asStored() });
  return { took: id, gave: whose };
}

/**
 * Put one row back to the key it ships with, and answer whether it moved. The way out of a table that
 * has been arranged into a knot, and the reason a rebinding can be allowed to be adventurous.
 *
 * It is `rebind` with the shipped key, which means it swaps exactly the same way: the control standing
 * on the shipped key takes the key this row is leaving. So `restore` can never put two controls on one
 * key, which a plain "write the shipped code back" would - and after a swap between two rows, restoring
 * either one of them puts *both* of them back, which is what a hand pressing "put it back" expects.
 */
export function restore(id) {
  const action = actionOf(id);
  if (action === null) throw new Error('the game has no control called ' + id);
  return rebind(id, action.shipped) !== null;
}

/**
 * How one action's key is written on the glass. Accepts several ids and writes them in the order
 * given, which is how one call paints `W A S D` for a lesson about flying (game/tutorial.js) and
 * `SPACE` for one about dashing.
 */
export function wordsOf(ids) {
  const words = [];
  for (const id of (Array.isArray(ids) ? ids : [ids])) words.push(wordFor(codeFor(id)));
  return words.join(' ');
}
