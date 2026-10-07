// The mouse: where it is, which button is held, and which one was just pressed.
// Coordinates are in canvas pixels, which until the camera arrives are also
// arena coordinates.
//
// The left button fires, the right button dashes (PLAN section 6). An event with
// no button on it - a synthetic one from the headless harness, say - counts as
// the fire button.

export const mouse = { x: 0, y: 0, down: false };

// One-shot requests, the same arrangement as the keyboard's. See input/index.js.
export const mouseTaps = { dash: false };

const FIRE_BUTTON = 0;
const DASH_BUTTON = 2;

function buttonOf(event) {
  return event.button === undefined ? FIRE_BUTTON : event.button;
}

function track(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = event.clientX - rect.left;
  mouse.y = event.clientY - rect.top;
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
