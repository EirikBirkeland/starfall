// The bridge between the display's clock and the simulation's.
//
// The display arrives when it likes - 60 Hz, 144 Hz, half of a frame after a
// stutter. The simulation only ever advances in one fixed step (PLAN section 2),
// so a run does not depend on the machine showing it. A clock turns one frame's
// worth of real time into the whole steps that frame owes, plus the fraction of
// the next step that the frame is drawn at (which is what the renderer
// interpolates with, see render/interp.js).

import { clamp } from './math.js';

/**
 * `step` and `maxFrameDt` are in seconds. A frame gap longer than `maxFrameDt`
 * is counted as that much - a background tab, not a hard frame - which is also
 * what caps how many steps a single frame may catch up.
 */
export function createClock(step, maxFrameDt) {
  let last = 0;     // the timestamp the previous frame arrived with, in ms
  let carry = 0;    // real time collected but not simulated yet
  let fps = 60;     // smoothed, for the corner readout only

  return {
    /**
     * Report the frame that just arrived at `now` (the milliseconds rAF gives).
     * The answer is `{ dt, steps, alpha, fps }`: step the world `steps` times
     * and draw it at `alpha` between the last step and the next one.
     */
    frame(now) {
      if (!last) last = now;
      const dt = clamp((now - last) / 1000, 0, maxFrameDt);
      last = now;
      if (dt > 0) fps += (1 / dt - fps) * clamp(dt * 2, 0, 1);

      carry += dt;
      let steps = 0;
      while (carry >= step) {
        carry -= step;
        steps++;
      }
      return { dt, steps, alpha: carry / step, fps };
    },

    /**
     * Forget the past: the next frame is a first frame again, with no time owing.
     * A page reload does this by definition; the headless tools do it on purpose,
     * because where a run starts inside the step cycle decides when each frame's
     * input lands, and a seed only replays a run if that is the same every time.
     */
    reset() {
      last = 0;
      carry = 0;
    },
  };
}
