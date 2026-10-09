// Tether (game/tether.js, render/entities.js) as it is drawn, and its card as it is dealt.
//
// There is no browser here, so this cannot say a thread of light across the arena reads as "yours,
// and this is the road it burns". What it can say is the four promises that make the line an honest
// piece of the picture:
//
//   nothing tied costs the arena nothing at all - no band, no knot, no light - because the threads
//     standing between the knots and the ship are the whole of the line's drawing state, ranks
//     included;
//   the band is drawn at exactly `reach` either side of the axis and never wider, which is the reach a
//     body has to stand inside to be burned: the road of light is the road the damage is paid out on,
//     edge for edge, the same promise a sniper's lock and a mine's ring keep (game/beams.js,
//     game/mines.js);
//   a thread that has just burned somebody and a thread with nobody on it cost a frame exactly the
//     same, and differ only in how bright they are - the pulse is the picture, and brightness is all
//     it costs;
//   and a whole fan costs a band and a knot per thread and one sprite for none of them: a knot is the
//     orbital drone's own light and the card wears the ship's own cyan, so the sixteenth line asks the
//     canvas to build nothing at all (test/draw-cost.test.mjs).
//
// Same instrument as test/mines-art.test.mjs and test/magnetar-art.test.mjs: boot the real game
// through the headless harness, paint real frames through the real painter, and count what the frame
// asked the canvas for (tools/headless/harness.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { makeFrameCost } from '../tools/headless/frame-cost.js';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TETHER = BALANCE.upgrades.tether;
const BAND = TETHER.reach * 2;         // px: the whole width of the road a thread burns
const game = await bootGame({ root: ROOT, seed: 46, dpr: 1 });
const field = game.world;
// What a frame cost the arena, with the interface taken back out of it: a frame paints a mark for
// every line the run owns (render/hud.js) and this file is measuring threads. tools/headless/frame-cost.js.
const frameCost = makeFrameCost(game);

// Start a run, then leave the arena empty and the wave director out of it: this file counts what a
// tied tether costs, and a wave arriving mid-measurement would be a different measurement every time.
// Every thread here is one the test drove in by hand rather than one a dash happened to lay between
// two assertions, and the tether's clock is handed to each frame so the fading states can be painted.
game.pressMouse(640, 360);
game.step();
game.releaseMouse();
game.step();
field.spawnTimer = Infinity;
field.player.invuln = Infinity;
field.enemies.length = 0;

/**
 * Paint one frame and report what it asked the arena for. `live` is how much of its two seconds the
 * tether has left, and the default - forever - is what keeps a measurement from being interrupted by
 * the tether letting go halfway through it.
 */
function paintFrame(live) {
  const cost = frameCost(() => {
    field.tether.live = live === undefined ? Infinity : live;
    game.step();
  });
  const widths = game.strokeWidths();
  return {
    strokes: cost.strokes,
    // What this file counts as a stamp, the helper calls an image.
    stamps: cost.images,
    gradients: cost.gradients,
    shadows: cost.shadows,
    baked: cost.baked,
    widest: widths.length ? Math.max(...widths) : 0,
    paths: cost.points,
    words: cost.words,
  };
}

/**
 * Drive `count` knots into the floor west and north-west of the ship, so their threads lie across the
 * window the ship is in and five of them are five distinguishable bands and not one wide blur.
 */
function tie(count, cool) {
  const ship = field.player;
  field.tether.cords.clear();
  for (let i = 0; i < count; i++) {
    const cord = field.tether.cords.spawn();
    cord.x = ship.x - 260 - i * 40;
    cord.y = ship.y - 120 + i * 60;
  }
  field.tether.cool = cool === undefined ? 0 : cool;
}

/** The knots as the painter sees them. */
function cords() {
  return field.tether.cords.items.slice(0, field.tether.cords.count);
}

/** An empty sky, painted, for the "what does this cost" comparisons. */
function bare() {
  field.tether.cords.clear();
  return paintFrame();
}

test('nothing tied costs the arena nothing at all', () => {
  const empty = bare();
  field.upgrades.tether = 5;
  const ranksAndNoThreads = paintFrame();
  field.upgrades.tether = 0;

  assert.equal(field.tether.cords.count, 0, 'the threads standing are the whole of the state');
  assert.equal(ranksAndNoThreads.strokes, empty.strokes,
    'so five ranks with nothing tied cost the arena nothing: ' + empty.strokes + ' strokes against '
    + ranksAndNoThreads.strokes);
  assert.equal(ranksAndNoThreads.stamps, empty.stamps, 'and no light of their own');
});

test('a tether armed but not yet tied draws nothing', () => {
  // The step a dash is granted ties the tether and the step after it drives the first knot in, so a
  // frame in between them holds a live tether with no threads in it at all (game/tether.js).
  const empty = bare();
  field.tether.live = 1;
  const armed = paintFrame(1);
  assert.equal(armed.strokes, empty.strokes, 'live is not the drawing; the threads are');
});

test('a thread is three passes of a band and one knot of light', () => {
  const nothing = bare();
  tie(1);
  paintFrame();                                   // the first frame is where a sprite is met
  const one = paintFrame();

  assert.equal(one.strokes - nothing.strokes, 3,
    'the whole width of it, a hotter middle, and the axis - and nothing else: '
    + (one.strokes - nothing.strokes));
  assert.equal(one.stamps - nothing.stamps, 1, 'and one light at the knot it was tied at');
  assert.equal(one.baked, 0, 'and none of it built on this frame');
});

test('the band is as wide as the road it burns, and never wider', () => {
  const nothing = bare();
  assert.ok(nothing.widest <= BAND,
    'with nothing tied the frame has no stroke this wide: ' + nothing.widest);

  tie(1);
  paintFrame();
  const one = paintFrame();
  assert.equal(one.widest, BAND,
    'the widest pass is exactly `reach` px either side of the axis, which is how far off a thread a '
    + 'body has to stand to be burned: ' + one.widest + ' px of stroke against a ' + TETHER.reach
    + ' px reach');
});

test('a thread that has just burned somebody costs the same as one with nobody on it', () => {
  tie(3);
  paintFrame();
  const quiet = paintFrame();
  tie(3, TETHER.beat);
  const shout = paintFrame();

  assert.equal(shout.strokes, quiet.strokes,
    'the pulse is the same paint lit harder: ' + quiet.strokes + ' strokes, ' + shout.strokes);
  assert.equal(shout.stamps, quiet.stamps, 'including the knots');
  assert.equal(shout.widest, quiet.widest, 'and the same width, to the pixel');
});

test('a thread letting go is painted right up to the last frame of it', () => {
  tie(2);
  paintFrame();
  const whole = paintFrame();
  const going = paintFrame(TETHER.fade * 0.3);

  assert.ok(going.strokes > bare().strokes, 'its bands are still on the glass');
  assert.equal(going.strokes, whole.strokes, 'at the same cost, only dimmer');
  assert.equal(going.widest, whole.widest, 'and the band is still drawn the width it always was');
  assert.equal(going.stamps, whole.stamps, 'and the knots are still lit');
});

test('a fan costs a band and a knot per thread, and no sprite of its own', () => {
  tie(1);
  paintFrame();
  const one = paintFrame();
  const baked = game.bakeCalls().canvases;

  tie(5);
  const five = paintFrame();

  assert.equal(five.strokes - one.strokes, 12, 'every thread after the first is its own three passes');
  assert.equal(five.stamps - one.stamps, 4, 'and its own knot: ' + (five.stamps - one.stamps));
  assert.equal(game.bakeCalls().canvases - baked, 0,
    'and not one new sprite for the four of them - a knot is the orbital drone\'s own light');
});

test('a thread is drawn however far its knot was left, because the ship is at the other end', () => {
  // There is no cull on a tether and there cannot be one: one end of every thread is the ship, which is
  // on the glass by definition, so the thread always crosses the window to reach its knot. What bounds
  // the drawing is the line's own geometry - five threads, each at most a dash plus two seconds of
  // running long - and this is the frame that says nothing quietly skips a thread out of timidity.
  const ship = field.player;
  tie(2);
  paintFrame();
  const near = paintFrame();

  cords()[0].x = ship.x + 6000;     // a real knot can never be that far off; the drawing is the point
  const far = paintFrame();
  assert.equal(far.strokes, near.strokes, 'the long thread is still drawn, stroke for stroke');
  assert.equal(far.stamps, near.stamps, 'and its knot is still lit where it stands');
  assert.ok(far.widest >= BAND, 'and it is still a band and not a hairline');
});

test('the tether asks the canvas for nothing it has to build', () => {
  tie(5, TETHER.beat * 0.5);
  paintFrame();
  const frame = paintFrame();

  assert.equal(frame.gradients, 0, 'no gradient');
  assert.equal(frame.shadows, 0, 'no blur');
  assert.equal(frame.baked, 0, 'and nothing baked mid-frame');
});

test('the tether card is on the rack and prints what a rank does', () => {
  const offer = field.offer.slice();
  field.offer.length = 0;
  field.offer.push('tether');
  field.state = STATE.LEVEL;
  field.offerTime = field.time;

  paintFrame();                       // the icon's glow is baked on meeting it
  const frame = paintFrame();
  assert.ok(frame.paths.length > 20, 'the icon is a drawing and not a glyph: ' + frame.paths.length);
  assert.ok(frame.words.indexOf('TETHER') >= 0, 'the card carries its name');
  assert.ok(frame.words.indexOf('+1 thread tied') >= 0,
    'and the number it is selling, in threads: ' + frame.words.join(' / '));
  assert.equal(frame.gradients, 0, 'and it asks for nothing built mid-frame');
  assert.equal(frame.shadows, 0, 'and nothing blurred');

  field.state = STATE.PLAY;
  field.offer.length = 0;
  for (const id of offer) field.offer.push(id);
});
