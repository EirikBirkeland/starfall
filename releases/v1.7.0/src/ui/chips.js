// The thumb's chips: the few letters a finger can press when it has no keyboard (PLAN section 6).
//
// Everything the game answers outside the fight is a letter - the day, the harder rule, the sound, the
// hangar, the codex, the settings, the pause - and a phone visitor has none of them. A tap already
// reaches the same handler a click does (input/touch.js is honest about that), so the gap is not that a
// finger cannot press anything: it is that nothing on the glass says *what* is worth pressing. A chip
// is that saying, and one chip is one key: it stands where the key would be named and it is answered by
// the very handler the key is answered by, guards and all (main.js `pressChip`).
//
// **A chip is paint, never a listener.** The page has no click handler on it and never will: the press
// comes in through the glass the same way a click always did, and this file only answers "which chip is
// under this point?". That is the same bargain the dash ring struck (render/touch.js paints the ring out
// of input/touch.js's own numbers so the ring you see and the ring you press are one ring by
// construction), and it is why the chips work for a thumb, a mouse and a stylus without a single extra
// path: there is exactly one press handler in the game and they all stand in its way.
//
// It also means the box a chip was laid out in is the box that gets pressed, and nothing else. The
// layout is the browser's (`.rail` and `.chip` in index.html, at the bottom of the title's flex column)
// and this file only asks where it ended up - the same question render/logo.js asks of `#logoBox`, and
// for the same reason: a chip whose pressed box is recomputed in JavaScript is a chip that moves when
// the CSS does, and nobody would notice until a thumb missed it.
//
// **And it answers the same question for a row of a panel.** A settings row is not a chip - it is a line
// of words the page laid out - but a press that lands on one has to be answered by the same arithmetic,
// against the same box the eye read, and this is the one file that is given the canvas. So `settingRowAt`
// asks where the browser put each row of `#settingRow` and answers which one the press came in on, or -1
// when it came in on none. What a row *means* is not this file's business: main.js `pressSettingsPanel`
// decides that, and what it decides is the row's own next value.
//
// **There is a second rail, and it is one chip long**: the pause rack's GIVE UP (main.js
// `pressGiveUpChip`). It lives here rather than beside the pause's other words in ui/screens.js for the
// one reason that decides anywhere a chip is pressed: a chip is pressed by asking the browser where it
// was laid out and comparing that with the glass the press came in through, and this is the one file
// that is given the canvas. It is not on the title's rail, because a rail is a place on a screen and the
// pause is another screen - and a control that answers from behind a panel nobody is looking at is a
// trap and not a control.

/**
 * The four chips, in the order the rail paints them.
 *
 * The first three are a whole action in one press, which was the bar a chip had to clear to be on this
 * rail: the day launches a run, the rule changes the next one and says so on the title, and the sound
 * turns off and on again with a plate on the glass to prove it.
 *
 * The fourth is not, and it is here because that bar turned out to be the wrong one for a panel that has
 * since been given a thumb shape of its own. SETTINGS opens the settings panel, and that panel now
 * answers a tap: every row on it steps from the tap that lands on it, and the CLOSE chip under it takes
 * the panel back down (main.js `pressSettingsPanel`). The chip no longer opens a page a finger can
 * neither use nor leave, which is the only reason it was left off the rail. The hangar and the codex are
 * still panels that only show things, with rows a press does not answer, and they stay off it for the old
 * reason.
 */
const CHIPS = [
  { id: 'today', el: 'chipToday' },
  { id: 'rule', el: 'chipRule' },
  { id: 'mute', el: 'chipMute' },
  { id: 'settings', el: 'chipSettings' },
];

/**
 * The pause rack's chip, and its two words.
 *
 * The second one is a whole instruction and not a shout, because the press it asks for is the one press
 * in the game that costs a run and a player who is unsure of what a second tap does should not have to
 * find out by tapping. main.js owns *whether* the chip is asking (what a press means is never a paint
 * question); this file owns the only place its word is written, so the word and the answer the wiring
 * acts on are painted from one fact.
 */
const GIVE_UP = { plain: 'GIVE UP', asking: 'TAP AGAIN TO GIVE UP' };

// The rail, its three chips, and the canvas the press point is measured against. Filled once by
// `initChips`, beside the same elements `initScreens` took its own from.
let rail = null;
let glass = null;
let chips = [];

// The settings panel's way out, and the list its rows are laid in. Both are pressed the way a chip is -
// by asking the browser where the box came out - and both belong here for that reason and no other.
let closeChip = null;
let closeUp = false;
let rowList = null;

// Is the rail on the glass? It is put up once, for a visit that arrived with a finger
// (input/touch.js `hasFinger`), and it is the one question `chipAt` asks first: a chip the player has
// never been shown is not a chip they meant to press.
let up = false;

// The pause's chip, and whether this visit's rack has one (main.js `showGiveUpChip`). Its own flag and
// not the rail's, because the two are put up by two different facts: the rail is for a browser that has
// fingers, and this is for a run that has actually been flown on one (`thumb.used`), which is the same
// fact the pause rack's own words are painted from.
let giveUp = null;
let giveUpUp = false;

/**
 * Find both rails. Called once at boot, and as strict about the page as `initScreens` is: a chip the
 * markup does not have is a chip that would sit in the list forever answering nothing.
 */
export function initChips(canvas) {
  glass = canvas;
  rail = document.getElementById('thumbRail');
  if (rail === null) throw new Error('the page has no thumb rail to put the chips on');
  chips = CHIPS.map((chip) => ({ id: chip.id, el: document.getElementById(chip.el) }));
  for (const chip of chips) {
    if (chip.el === null) throw new Error('the page has no #' + chip.el + ' chip to press');
  }
  giveUp = document.getElementById('pauseGiveUp');
  if (giveUp === null) throw new Error('the page has no give-up chip to put on the pause rack');
  closeChip = document.getElementById('settingsClose');
  if (closeChip === null) throw new Error('the page has no close chip to put on the settings panel');
  rowList = document.getElementById('settingRow');
  if (rowList === null) throw new Error('the page has no settings rows to press');
}

/** Put the rail on the glass, or keep it off it (main.js asks input/touch.js which visit this is). */
export function showChips(on) {
  up = on === true;
  rail.classList.toggle('hidden', !up);
}

/**
 * The press point, in the window's own pixels.
 *
 * The point a press arrives with is the canvas's (input/mouse.js keeps it, and input/touch.js notes a tap
 * in the same currency) and a chip's box is asked for in the window's, so the canvas's own place in the
 * window is put back in.
 */
function windowPoint(x, y) {
  const glass0 = glass.getBoundingClientRect();
  return { x: x + glass0.left, y: y + glass0.top };
}

/** Did this window point land inside that box? A box with nothing in it lands nothing. */
function landedOn(box, at) {
  return box.width > 0 && box.height > 0
    && at.x >= box.left && at.x <= box.left + box.width
    && at.y >= box.top && at.y <= box.top + box.height;
}

/**
 * Put the pause rack's GIVE UP chip on the glass, or keep it off it, and say which of its two words it
 * wears (main.js `raisePause`, main.js `pressGiveUpChip`).
 *
 * `on` is the fact the pause rack's own line is written from: this visit steers with a thumb and so has
 * no `G` to read and no letter to press. `asking` is whether the first press has happened; a rack going
 * up is always a plain one, and a chip that is not on the glass never wears the question.
 */
export function showGiveUpChip(on, asking) {
  giveUpUp = on === true;
  const asks = giveUpUp && asking === true;
  giveUp.classList.toggle('gone', !giveUpUp);
  giveUp.classList.toggle('asking', asks);
  giveUp.textContent = asks ? GIVE_UP.asking : GIVE_UP.plain;
}

/**
 * Is this point on the pause's GIVE UP chip? main.js asks it before it asks anything else about a press
 * over the pause rack, and only while the pause rack is the panel that is up.
 *
 * Same arithmetic as `chipAt` and the same reason for it: the box is the browser's, so the word a thumb
 * reads and the box that thumb presses cannot be moved apart by a stylesheet edit.
 */
export function giveUpChipAt(x, y) {
  if (!giveUpUp) return false;
  return landedOn(giveUp.getBoundingClientRect(), windowPoint(x, y));
}

/**
 * Which chip is under this point on the glass? The id of one, or '' when the point hit none.
 *
 * The point is the one the press handler has - the same canvas pixels `mouse.x` keeps - and a chip's box
 * is asked for in the window's pixels, which is what `windowPoint` is for.
 *
 * A box with nothing in it answers nothing. That is both a chip the page has hidden and a stub page that
 * was never laid out, which is the honest answer for a browser without a layout engine and the reason
 * an ordinary visit's click on an ordinary title still launches an ordinary run.
 */
export function chipAt(x, y) {
  if (!up) return '';
  const at = windowPoint(x, y);
  for (const chip of chips) {
    if (landedOn(chip.el.getBoundingClientRect(), at)) return chip.id;
  }
  return '';
}

/**
 * Put the settings panel's CLOSE chip on it, or keep it off, once per visit (main.js, beside `showChips`
 * and `paintSettingsHints`, on `input/touch.js` `hasFinger`).
 *
 * A keyboard visit is not shown one because it has `O`, which is the very key the chip is answered by -
 * the same bargain the pause rack strikes with its GIVE UP, for the same reason: a plate sitting where a
 * letter already is reads as a control that failed to arrive.
 */
export function showSettingsClose(on) {
  closeUp = on === true;
  closeChip.classList.toggle('gone', !closeUp);
}

/**
 * Did this point land on the settings panel's CLOSE chip?
 *
 * Asked only while that panel is the one that is up (main.js `pressSettingsPanel`), and answered through
 * the same `landedOn` as every other box in this file, so the word a thumb reads and the box it presses
 * cannot be moved apart.
 */
export function settingsCloseAt(x, y) {
  if (!closeUp) return false;
  return landedOn(closeChip.getBoundingClientRect(), windowPoint(x, y));
}

/**
 * Which row of the settings panel did this point land on? Its index in the list, or -1 for none.
 *
 * There is no "is the panel up" question here because a panel that is not up is `display: none` and every
 * row inside it has no box at all - `landedOn` answers nothing about a box with nothing in it, which is
 * the same rule that keeps a hidden chip from being pressed by accident. The caller still asks only while
 * the panel is up, because a headless page has no layout engine to take the boxes away with the panel.
 */
export function settingRowAt(x, y) {
  const at = windowPoint(x, y);
  const rows = rowList.children;
  for (let i = 0; i < rows.length; i++) {
    if (landedOn(rows[i].getBoundingClientRect(), at)) return i;
  }
  return -1;
}
