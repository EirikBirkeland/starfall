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

/**
 * The three chips, in the order the rail paints them.
 *
 * All three are a whole action in one press, which is the bar a chip has to clear to be on this rail:
 * the day launches a run, the rule changes the next one and says so on the title, and the sound turns
 * off and on again with a plate on the glass to prove it. A panel is not a whole action - the settings,
 * the hangar and the codex each need a rack a thumb can walk and a way back out - so none of them is
 * here yet, and a chip that opened a page a finger could neither use nor leave would be a trap and not
 * a control.
 */
const CHIPS = [
  { id: 'today', el: 'chipToday' },
  { id: 'rule', el: 'chipRule' },
  { id: 'mute', el: 'chipMute' },
];

// The rail, its three chips, and the canvas the press point is measured against. Filled once by
// `initChips`, beside the same elements `initScreens` took its own from.
let rail = null;
let glass = null;
let chips = [];

// Is the rail on the glass? It is put up once, for a visit that arrived with a finger
// (input/touch.js `hasFinger`), and it is the one question `chipAt` asks first: a chip the player has
// never been shown is not a chip they meant to press.
let up = false;

/**
 * Find the rail. Called once at boot, and as strict about the page as `initScreens` is: a chip the
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
}

/** Put the rail on the glass, or keep it off it (main.js asks input/touch.js which visit this is). */
export function showChips(on) {
  up = on === true;
  rail.classList.toggle('hidden', !up);
}

/**
 * Which chip is under this point on the glass? The id of one, or '' when the point hit none.
 *
 * The point is the one the press handler has - the same canvas pixels `mouse.x` keeps - and a chip's box
 * is asked for in the window's pixels, so the canvas's own place in the window is subtracted out. That
 * is what input/mouse.js does with a mouse event, and it is why a thumb's tap and a cursor's click
 * arrive at the same comparison.
 *
 * A box with nothing in it answers nothing. That is both a chip the page has hidden and a stub page that
 * was never laid out, which is the honest answer for a browser without a layout engine and the reason
 * an ordinary visit's click on an ordinary title still launches an ordinary run.
 */
export function chipAt(x, y) {
  if (!up) return '';
  const glass0 = glass.getBoundingClientRect();
  const px = x + glass0.left;
  const py = y + glass0.top;
  for (const chip of chips) {
    const box = chip.el.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) continue;
    if (px < box.left || px > box.left + box.width) continue;
    if (py < box.top || py > box.top + box.height) continue;
    return chip.id;
  }
  return '';
}
