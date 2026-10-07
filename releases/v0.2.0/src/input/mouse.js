// The mouse: where it is and whether the button is held. Coordinates are in
// canvas pixels, which until the camera arrives are also arena coordinates.

export const mouse = { x: 0, y: 0, down: false };

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
    mouse.down = true;
    if (handlers.onPress) handlers.onPress(event);
  });

  window.addEventListener('mouseup', function () {
    mouse.down = false;
  });

  window.addEventListener('contextmenu', function (event) {
    if (event.target === canvas) event.preventDefault();
  });
}

export function releaseMouse() {
  mouse.down = false;
}
