// The mouse: where it is, which button is held, and which one was just pressed.
// Coordinates are pixels on the canvas, which are *not* arena coordinates now that
// the arena is bigger than the window: the aim goes through render/camera.js's
// `resolveAim` on its way to the simulation (see input/index.js).
//
// The left button fires, the right button dashes (PLAN section 6). An event with
// no button on it - a synthetic one from the headless harness, say - counts as
// the fire button.

export const mouse = { x: 0, y: 0, down: false, moves: 0 };

// How many times the pointer has been *put* somewhere: a mousemove, or a thumb's tap
// (`noteGlass`). One number, and the only use anyone has for it is input/index.js asking which hand
// pointed the guns last - a stick that has gone back to its middle has pointed nowhere since, and a
// pointer that has moved since has. `main.js` sets the starting point directly, so a visit that has
// not moved a mouse has moved it zero times.

// One-shot requests, the same arrangement as the keyboard's. See input/index.js.
export const mouseTaps = { dash: false };

const FIRE_BUTTON = 0;
const DASH_BUTTON = 2;

function buttonOf(event) {
  return event.button === undefined ? FIRE_BUTTON : event.button;
}

/**
 * Put the pointer on the glass without a mouse (input/touch.js).
 *
 * The point is where the glass was last touched, whoever touched it: the upgrade table answers a
 * press by looking up where the pointer is, so a thumb that taps a card has to leave its point in
 * the same place a cursor would have. It is the position and not the button - a thumb has no button
 * to hold, and what a thumb does instead is the thumb's own business.
 */
export function noteGlass(x, y) {
  mouse.x = x;
  mouse.y = y;
  mouse.moves++;
}

/** Where the pointer was put, and the number that says it was. */
function track(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = event.clientX - rect.left;
  mouse.y = event.clientY - rect.top;
  mouse.moves++;
}

/** handlers.onPress - a button went down, whatever the screen means by it. */
export function initMouse(canvas, handlers) {
  window.addEventListener('mousemove', function (event) {
    track(canvas, event);
  }, { passive: true });

  window.addEventListener('mousedown', function (event) {
    track(canvas, event);
    const button = buttonOf(event);
    if (button === DASH_BUTTON) mouseTaps.dash = true;
    else if (button === FIRE_BUTTON) mouse.down = true;
    if (handlers.onPress) handlers.onPress(event);
  });

  window.addEventListener('mouseup', function (event) {
    if (buttonOf(event) === FIRE_BUTTON) mouse.down = false;
  });

  window.addEventListener('contextmenu', function (event) {
    if (event.target === canvas) event.preventDefault();
  });
}

export function releaseMouse() {
  mouse.down = false;
  mouseTaps.dash = false;
}
