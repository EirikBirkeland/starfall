// Mines (game/mines.js, render/entities.js) as they are drawn, and their card as it is dealt.
//
// There is no browser here, so this cannot say a mine on the arena floor reads as "yours, and it
// waits". What it can say is the four promises that make the line an honest piece of the picture:
//
//   an empty field costs the arena nothing at all - no ring, no shell, no eye, because the mines
//     standing in the arena are the whole of the line's drawing state;
//   the ring on the floor is the reach that sets the mine off and never more: it is born at the mine
//     and grows out to `trigger`, so a circle a player is shown is never bigger than the reach the
//     mine has yet, whatever the mine is doing;
//   the blast is a bigger circle than the ring, so the light of a mine coming apart is painted
//     further out than anything that was drawn while it waited - the drawing half of the
//     `radius > trigger` promise, and the reason a mine is generous in the direction it should be;
//   and a mine costs a handful of strokes, one stamped eye and nothing built mid-frame - no
//     gradient, no blur, no sprite per mine, which is the only way a rank-five row can afford to be
//     lit at all.
//
// Same instrument as test/magnetar-art.test.mjs and test/afterimage-art.test.mjs: boot the real
// game through the headless harness, paint real frames through the real painter, and count what the
// frame asked the canvas for (tools/headless/harness.js). Painting the arena and not just the card
// is the point of this file, and it is the rule NOTES has written down twice now: an icon-only art
// test is how a drawing that throws on a real frame stays green until a release.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { makeFrameCost } from '../tools/headless/frame-cost.js';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const MINES = BALANCE.upgrades.mines;
const game = await bootGame({ root: ROOT, seed: 44, dpr: 1 });
const field = game.world;
// What a frame cost the arena, with the interface taken back out of it. tools/headless/frame-cost.js.
const frameCost = makeFrameCost(game);

// Start a run, then leave the arena empty and the wave director out of it: this file counts what a
// standing mine costs, and a wave arriving mid-measurement would be a different measurement every
// time. The line's own drops are held off too (see `paintFrame`): every mine here is put in the pool
// by hand, because a row dropping under the ship between two assertions would make the counts below
// mean whatever the timing happened to be.
game.pressMouse(640, 360);
game.step();
game.releaseMouse();
game.step();
field.spawnTimer = Infinity;
field.player.invuln = Infinity;
field.enemies.length = 0;

/**
 * Paint one frame and report what it asked the arena for. The mine drop is parked first, so the
 * field holds exactly what the test put in it whatever the frame clock says, and the interface -
 * which paints a mark for every line the run owns, and so costs more the more of the line has been
 * bought - is measured apart: tools/headless/frame-cost.js.
 */
function paintFrame() {
  const cost = frameCost(() => {
    field.mines.wait = Infinity;
    game.step();
  });
  return {
    strokes: cost.strokes,
    // What this file counts as a stamp, the helper calls an image.
    stamps: cost.images,
    gradients: cost.gradients,
    shadows: cost.shadows,
    baked: cost.baked,
    circles: cost.circles,
    words: cost.words,
  };
}

/** Put one mine on the floor, south of the ship and out of the way of anything it wears. */
function put(x, y, state) {
  const mine = field.mines.laid.spawn();
  mine.x = x;
  mine.y = y;
  mine.arm = MINES.arm * (state.arm === undefined ? 0 : state.arm);
  mine.life = MINES.life * (state.life === undefined ? 1 : state.life);
  mine.fuse = state.fuse === undefined ? -1 : state.fuse;
  return mine;
}

/**
 * Clear the field, put one mine in it in `state`, and settle for two frames - the first of which is
 * where the drawing meets the line and bakes whatever it needs, so nothing is counted on the frame
 * something is first built.
 */
function standing(state) {
  field.mines.laid.clear();
  put(field.player.x, field.player.y + MINES.trigger + 40, state);
  paintFrame();
  return paintFrame();
}

/** The circles drawn at one place on the floor, innermost first. */
function atTheMine(frame, mine) {
  const out = [];
  for (const circle of frame.circles) {
    if (Math.abs(circle.x - mine.x) > 0.5 || Math.abs(circle.y - mine.y) > 0.5) continue;
    out.push(circle.r);
  }
  return out.sort((a, b) => a - b);
}

/** The mine's own ring: the widest circle drawn at it, which is the reach it has grown to. */
function ringOf(frame, mine) {
  const radii = atTheMine(frame, mine);
  return radii.length === 0 ? 0 : radii[radii.length - 1];
}

/** An empty arena, painted, for the "what does this cost" comparisons. */
function bare() {
  field.mines.laid.clear();
  return paintFrame();
}

test('an empty field costs the arena nothing at all', () => {
  const empty = bare();
  field.upgrades.mines = 4;
  const ranksAndNoMines = paintFrame();
  field.upgrades.mines = 0;

  assert.equal(field.mines.laid.count, 0, 'the mines standing are the whole of the state');
  assert.equal(ranksAndNoMines.strokes, empty.strokes,
    'so ranks with nothing standing cost the arena nothing: ' + empty.strokes + ' strokes against '
    + ranksAndNoMines.strokes);
});
test('a standing mine is a ring, a shell and an eye', () => {
  const nothing = bare();
  const mine = put(field.player.x, field.player.y + MINES.trigger + 40, {});
  paintFrame();
  const frame = paintFrame();

  assert.ok(Math.abs(ringOf(frame, mine) - MINES.trigger) < 1,
    'the ring is drawn at exactly the reach a body has to come inside: ' + ringOf(frame, mine)
    + ' px against a reach of ' + MINES.trigger);
  assert.ok(frame.strokes > nothing.strokes + 3,
    'a ring of two passes, a shell of two and its spikes: ' + frame.strokes + ' against '
    + nothing.strokes);
  assert.ok(frame.stamps > nothing.stamps, 'and one stamped eye, which is the whole of its light');
  assert.equal(frame.baked, 0, 'and none of it built on this frame');
});

test('the ring grows out to the reach and never past it, whatever the mine is doing', () => {
  const winding = standing({ arm: 0.7 });
  const live = standing({});
  const lit = standing({ fuse: MINES.fuse * 0.5 });
  const dying = standing({ life: MINES.fade * 0.5 });
  const mine = field.mines.laid.items[0];

  assert.ok(ringOf(winding, mine) > 1, 'a mine still winding draws a ring at all');
  assert.ok(ringOf(winding, mine) < MINES.trigger * 0.6,
    'grown only part way out: ' + ringOf(winding, mine).toFixed(1) + ' px of a ' + MINES.trigger
    + ' px reach');
  for (const frame of [winding, live, lit, dying]) {
    // The promise the drawing half of game/mines.js exists to keep: the circle a player is shown is
    // the reach that sets the mine off, and it is never bigger than that reach. The blast is what is
    // bigger, and the blast has not happened yet.
    assert.ok(ringOf(frame, mine) <= MINES.trigger + 0.5,
      'never out past the reach: ' + ringOf(frame, mine).toFixed(1));
  }
  assert.ok(Math.abs(ringOf(lit, mine) - ringOf(live, mine)) < 0.01,
    'and a lit mine does not stretch its own reach: ' + ringOf(lit, mine).toFixed(1));
});

test('a lit mine and a waiting one cost a frame the same, and differ only in how bright', () => {
  const waiting = standing({});
  const lit = standing({ fuse: MINES.fuse * 0.9 });

  assert.equal(lit.strokes, waiting.strokes,
    'the tell is the same paint lit harder: ' + waiting.strokes + ' strokes, ' + lit.strokes);
  assert.equal(lit.stamps, waiting.stamps, 'including the eye');
});

test('a mine going out is painted right up to the last frame of it', () => {
  const whole = standing({});
  const going = standing({ life: MINES.fade * 0.2 });
  const mine = field.mines.laid.items[0];

  assert.ok(ringOf(going, mine) > 1, 'its ring is still there');
  assert.equal(going.strokes, whole.strokes, 'at the same cost, only dimmer');
  assert.ok(atTheMine(going, mine).length >= 2, 'two passes of the ring, still both of them');
});

test('a row of them costs a row of strokes and one sprite, not one sprite each', () => {
  const ship = field.player;
  field.mines.laid.clear();
  const first = put(ship.x, ship.y + MINES.trigger + 40, {});
  paintFrame();
  const one = paintFrame();
  const oneAt = atTheMine(one, first).length;

  for (let i = 0; i < 4; i++) put(ship.x, ship.y + MINES.trigger + 40 + (i + 1) * MINES.gap, {});
  const bakedBefore = game.bakeCalls().canvases;
  const five = paintFrame();
  const each = (five.strokes - one.strokes) / 4;

  assert.ok(each >= 4 && each < 10,
    'a mine is a handful of strokes - ring, shell and the wide pass under it - and not a hundred: '
    + each.toFixed(1));
  assert.ok(oneAt >= 2, 'and what one mine drew is more than a ring: ' + oneAt + ' circles');
  assert.equal(five.stamps - one.stamps, 4,
    'one stamped eye apiece: ' + (five.stamps - one.stamps));
  assert.equal(game.bakeCalls().canvases - bakedBefore, 0,
    'and not one new sprite for the four of them - the eye is one sprite for the whole field');
});

test('the minefield asks the canvas for nothing it has to build', () => {
  const frame = standing({ fuse: MINES.fuse * 0.3 });
  assert.equal(frame.gradients, 0, 'no gradient');
  assert.equal(frame.shadows, 0, 'no blur');
});

test('a mine coming apart paints a circle bigger than the ring it waited inside', () => {
  // The other half of `radius > trigger`, in the drawing: the blast ring is born outside the ring
  // the mine spent its whole life showing, so what a player learns when a mine goes off is that the
  // circle they were shown was never the whole of it - and never wider than the damage, either.
  field.mines.laid.clear();
  const ship = field.player;
  const mine = put(ship.x, ship.y + 200, { fuse: MINES.fuse * 0.5 });
  const waited = atTheMine(paintFrame(), mine);
  assert.ok(waited.length > 0 && Math.max(...waited) <= MINES.trigger + 0.5,
    'the ring was drawn while it waited, and never past the reach');

  let widest = 0;
  for (let i = 0; i < 40; i++) {
    game.step();
    for (const circle of game.circles()) {
      if (Math.abs(circle.x - mine.x) > 0.5 || Math.abs(circle.y - mine.y) > 0.5) continue;
      widest = Math.max(widest, circle.r);
    }
  }
  assert.equal(field.mines.laid.count, 0, 'it went off');
  assert.ok(widest > MINES.trigger,
    'and the light of it reached further than the ring it waited inside: ' + widest.toFixed(1)
    + ' px from a ' + MINES.trigger + ' px ring');
});

test('the mines card is on the rack and prints what a rank does', () => {
  const offer = field.offer.slice();
  field.offer.length = 0;
  field.offer.push('mines');
  field.state = STATE.LEVEL;
  field.offerTime = field.time;

  paintFrame();                       // the icon's glow is baked on meeting it
  const frame = paintFrame();
  assert.ok(frame.words.indexOf('MINES') >= 0, 'the card carries its name');
  assert.ok(frame.words.indexOf('+1 mine per drop') >= 0,
    'and the number it is selling, in mines: ' + frame.words.join(' / '));
  assert.equal(frame.gradients, 0, 'and it asks for nothing built mid-frame');
  assert.equal(frame.shadows, 0, 'and nothing blurred');

  field.state = STATE.PLAY;
  field.offer.length = 0;
  for (const id of offer) field.offer.push(id);
});
