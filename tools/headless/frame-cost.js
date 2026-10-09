// What one frame of the *arena* cost to draw.
//
// The art files (test/*-art.test.mjs) make promises like "a body on fire costs a bounded pair of
// stamps and no strokes": what a thing that is happening on the arena costs the frame. But every
// frame also paints the interface - the score, the hull, the XP bar, and one mark down the left
// edge for every line the run has taken (render/hud.js) - and the interface's cost depends on the
// run's build, which these files set freely just to get a scene in front of the painter at all.
// Their promise is about the arena, so the interface is painted a second time on a canvas of its
// own, over the world state the frame has just left, and its calls come back out of the frame's.
// What is left is the arena and nothing else, which is what these files mean.
//
// The interface is not overlooked: it is the subject of test/interface.test.mjs, which is where a
// mark for every owned line has to be paid for and accounted for.
//
// Painting the interface twice is only an honest measurement while the world has not moved between
// the frame and the second paint, so `frameCost` paints it immediately after the frame it is
// taking out, and the HUD reads the layout the real frame cached rather than asking the window.

import { drawHUD } from '../../src/render/hud.js';

const COUNTERS = ['fills', 'strokes', 'images', 'texts', 'gradients', 'shadows'];

/**
 * Measure one frame with the interface taken back out of it.
 *
 * `paint` runs the frame; the default is one animation frame at the harness's own pace, and a file
 * with a scene to set up or a clock to hold still passes its own way round. The result is the six
 * counters plus `baked` (offscreen canvases the frame had to build), and the frame's own draw log
 * as the harness logged it - `stamps`, `points`, `circles`, `words` - which the second paint never
 * touches, because it happens on another canvas.
 */
export function makeFrameCost(game) {
  return function frameCost(paint) {
    const before = game.drawCalls();
    const bakedBefore = game.bakeCalls().canvases;

    if (paint === undefined) game.step(); else paint();

    const mid = game.drawCalls();
    const baked = game.bakeCalls().canvases - bakedBefore;
    // The frame only paints the interface while a run is on the screen (render/renderer.js), and
    // the second paint has to answer for exactly what was painted.
    const worn = game.world.state !== game.STATE.START
      ? game.measure((ctx) => drawHUD(ctx, 60))
      : { fills: 0, strokes: 0, images: 0, texts: 0, gradients: 0, shadows: 0 };

    const cost = {};
    for (const key of COUNTERS) cost[key] = (mid[key] - before[key]) - worn[key];
    cost.baked = baked;
    cost.stamps = game.stamps();
    cost.points = game.points();
    cost.circles = game.circles();
    cost.words = game.words();
    return cost;
  };
}
