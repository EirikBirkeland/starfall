// The marks, as drawn (game/settings.js `MARKS`, PLAN section 6).
//
// A mark is a second signature laid over the palette for a visit that cannot read the warm/cool rule
// off the hues: a dark centre punched through the small things that can end the run, and a lit one set
// in the middle of the one thing the run wants. `tools/palette-check.js` measures what that is worth in
// Oklab and `test/palette-read.test.mjs` holds the promise; what this file holds is the *painting*,
// because a promise measured on a picture nobody paints is a formality.
//
// Four claims run through it. The mark is **added** - a shot keeps every light it had, so a marked shot
// is no harder to *find*, only harder to mistake. It is **only on the two things the audit says an eye
// is asked to decide about** - a shot and a shard, not a crowd body and not the ship's own gun. It is
// **the palette's own colour at the row's own strength**, so the faint step is the same picture with
// less ink in it and not a different picture. And the step that paints nothing costs exactly what the
// game cost before the row existed.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { SAVE_KEY } from '../src/core/save.js';
import { loadFromSave } from '../src/game/settings.js';
import { BALANCE } from '../src/game/balance.js';
import { PALETTE, parseColor, withAlpha } from '../src/core/palette.js';
import { enemyShotAt } from '../src/game/enemyshots.js';
import { dropShards, dropBigShard } from '../src/game/pickups.js';
import { enemyAt, bulletFlyingToward } from '../tools/headless/scripted.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const SPIT = BALANCE.kinds.spitter.spit;

const game = await bootGame({ root: ROOT, seed: 4411, width: 1280, height: 720, storage: {} });
const field = game.world;
const ship = field.player;

// A run has to be in progress for the arena to be drawn at all.
game.pressMouse(640, 360);
game.step();
game.releaseMouse();
for (let i = 0; i < 4; i++) game.step(FRAME);

/**
 * Put the MARKS row where a visit left it, which is the only way there is of putting it.
 *
 * `stepRow` is the player's door and it walks one step at a time; a test that wants a particular step
 * writes the save the way a previous visit would have and lets the row read it back - the same rule
 * test/settings.test.mjs keeps, for the same reason: a stored choice outranks every default.
 * `null` is a fresh machine: no save, so the row ships at its shipped step.
 */
function marksAt(step) {
  delete game.storage[SAVE_KEY];
  loadFromSave(step === null ? undefined : { marks: step });
}

/** Nothing on the arena but what a test puts there, and nothing arriving. */
function clearTheSky() {
  field.enemies.length = 0;
  field.enemyShots.clear();
  field.shards.clear();
  field.bullets.clear();
  field.particles.clear();
  field.rings.clear();
  field.texts.clear();
  field.spawnTimer = Infinity;
  ship.invuln = Infinity;
}

/** Paint one frame and hand back what it cost, and every circle it asked for. */
function paintOneFrame() {
  const before = game.drawCalls();
  game.step(FRAME);
  const after = game.drawCalls();
  return {
    fills: after.fills - before.fills,
    strokes: after.strokes - before.strokes,
    images: after.images - before.images,
    gradients: after.gradients - before.gradients,
    shadows: after.shadows - before.shadows,
    circles: game.circles(),
  };
}

/** One enemy shot, parked in the middle of the window and going nowhere. */
function plantShot() {
  return enemyShotAt(field, ship.x + 120, ship.y, 0, 0, SPIT.shot);
}

/**
 * One shard, of the small kind unless it is asked for big, held still where it landed.
 *
 * A good four hundred pixels out: a shard dropped next to the ship is on its way into the ship's
 * magnet and is not on the arena by the time the frame is painted (game/pickups.js).
 */
function plantShard(big) {
  if (big === true) dropBigShard(field, ship.x + 400, ship.y + 180);
  else dropShards(field, ship.x + 400, ship.y + 180, 1);
  const shard = field.shards.items[0];
  shard.vx = 0;
  shard.vy = 0;
  shard.spin = 0;
  return shard;
}

/** Every circle the frame drew within a pixel and a half of a thing's own place. */
function circlesAt(painted, x, y) {
  return painted.circles.filter((c) => Math.abs(c.x - x) < 1.5 && Math.abs(c.y - y) < 1.5);
}

/**
 * Every circle the frame filled with one mark, at one strength.
 *
 * Matched on the ink and not on the place, because a shard's mark is drawn inside the shard's own
 * translate-and-rotate (render/entities.js), so the coordinates it was asked with are its own and not
 * the arena's. Each of these frames holds exactly one thing that can be marked, so the ink identifies
 * it - and that is the stronger claim anyway: nothing else in the game paints either colour.
 */
function marksPainted(painted, colour, share) {
  const ink = inkAt(colour, share);
  return painted.circles.filter((c) => c.fill === ink);
}

/** The rgba a mark is painted with at a given share, worked out the way the painter works it out. */
const inkAt = (colour, share) => withAlpha(colour, share);

/**
 * The channels of whatever a circle was filled with, so an `rgba()` and a `#hex` can be compared.
 *
 * A circle that was only ever stroked has no fill to read, and the stub hands back whatever the last
 * painter left in the slot - which may be nothing at all. That is not a colour, and it is not a mark.
 */
function channels(paint) {
  try {
    return parseColor(String(paint)).join();
  } catch (err) {
    return '';
  }
}

/**
 * The opacity an rgba() carries (1 for anything that is not translucent).
 *
 * A mark's strength is written into its colour rather than into `globalAlpha`, because the entity pass
 * already has a `globalAlpha` of its own and the two would multiply into something nobody chose: the
 * row's share belongs to the ink.
 */
function alphaOf(paint) {
  const parts = /^rgba\(([^)]+)\)$/.exec(String(paint).trim());
  return parts === null ? 1 : Number(parts[1].split(',')[3]);
}

/** Was this circle filled with one of the two mark colours, at any strength. */
function isMarkInk(circle) {
  const ink = channels(circle.fill);
  return ink === channels(PALETTE.markPupil) || ink === channels(PALETTE.markCore);
}

test('a marked shot is a ring of light with a hole punched through it', () => {
  marksAt(null);
  clearTheSky();
  plantShot();
  const unmarked = paintOneFrame();

  marksAt('full');
  clearTheSky();
  const shot = plantShot();
  const markedFrame = paintOneFrame();

  assert.equal(markedFrame.fills - unmarked.fills, 1,
    'one fill more than the same shot wore unmarked, and that is the whole mark');
  assert.equal(markedFrame.images, unmarked.images,
    'and not one light less: the mark is painted over the shot, not instead of it');
  assert.equal(markedFrame.shadows, 0, 'and the canvas was never asked to blur it');

  const here = circlesAt(markedFrame, shot.x, shot.y);
  const pupil = here.find((c) => channels(c.fill) === channels(PALETTE.markPupil));
  assert.ok(pupil !== undefined, 'no pupil was painted in the palette mark colour');
  assert.equal(pupil.fill, inkAt(PALETTE.markPupil, 1), 'at full strength, in the ink itself');

  // The core is still there under it, and bigger than the hole: that is what makes a marked shot read
  // as a ring of light rather than as a black disc with a halo round it.
  const core = here.find((c) => c.fill === PALETTE.enemyShotCore);
  assert.ok(core !== undefined, 'the shot lost its hot core somewhere');
  assert.ok(pupil.r < core.r,
    `a pupil of ${pupil.r.toFixed(2)} inside a core of ${core.r.toFixed(2)}`);
  assert.ok(pupil.r > 0.8, `and a hole an eye can actually see: ${pupil.r.toFixed(2)} px`);
  marksAt(null);
});

test('the faint step is the same picture with less ink in it', () => {
  marksAt('full');
  clearTheSky();
  const first = plantShot();
  const full = circlesAt(paintOneFrame(), first.x, first.y)
    .find((c) => channels(c.fill) === channels(PALETTE.markPupil));

  marksAt('faint');
  clearTheSky();
  const second = plantShot();
  const faint = circlesAt(paintOneFrame(), second.x, second.y)
    .find((c) => channels(c.fill) === channels(PALETTE.markPupil));

  assert.ok(full !== undefined && faint !== undefined, 'both steps painted a pupil');
  assert.equal(faint.r, full.r, 'the same hole, in the same place, the same size');
  assert.equal(channels(faint.fill), channels(full.fill), 'in the same colour');
  assert.ok(alphaOf(faint.fill) < alphaOf(full.fill) && alphaOf(faint.fill) > 0,
    `and less of it: ${alphaOf(faint.fill)} against ${alphaOf(full.fill)}`);
  marksAt(null);
});

test('a visit that asked for no marks pays exactly what the game paid before the row', () => {
  // The shipped step has to cost what the game cost before the row existed, or the row is a tax on
  // everybody rather than an offer to whoever wants it.
  marksAt('full');
  clearTheSky();
  plantShot();
  plantShard(false);
  const marked = paintOneFrame();
  marksAt(null);
  clearTheSky();
  plantShot();
  plantShard(false);
  const shipped = paintOneFrame();

  assert.equal(shipped.fills, marked.fills - 2, 'both marks given back, and nothing else different');
  assert.equal(shipped.images, marked.images, 'the lights are the same either way');
  assert.equal(shipped.strokes, marked.strokes, 'and so are the strokes');
  assert.ok(marked.circles.filter(isMarkInk).length > 0, 'and the marked frame really did paint them');
  assert.equal(shipped.circles.filter(isMarkInk).length, 0,
    'with the row off, neither mark colour was painted anywhere');
});

test('a shard is given a lit centre, and a large shard a bigger one', () => {
  marksAt(null);
  clearTheSky();
  plantShard(false);
  const unmarked = paintOneFrame();

  marksAt('full');
  clearTheSky();
  plantShard(false);
  const markedFrame = paintOneFrame();

  assert.equal(markedFrame.fills - unmarked.fills, 1, 'one fill for the spark set in its middle');
  const spark = marksPainted(markedFrame, PALETTE.markCore, 1);
  assert.equal(spark.length, 1, 'one shard in the frame, one lit centre on it');
  assert.ok(spark[0].r > 0.8, `and it is a thing an eye can see: ${spark[0].r.toFixed(2)} px`);

  clearTheSky();
  plantShard(true);
  const bigFrame = paintOneFrame();
  const bigSpark = marksPainted(bigFrame, PALETTE.markCore, 1);
  assert.equal(bigSpark.length, 1, 'a large shard is lit too');
  assert.ok(bigSpark[0].r > spark[0].r * 1.3,
    `and the mark grew with the shard: ${bigSpark[0].r.toFixed(2)} against ${spark[0].r.toFixed(2)}`);
  marksAt(null);
});

test('a shard going out takes its mark with it', () => {
  marksAt('full');
  clearTheSky();
  const shard = plantShard(false);
  // Two seconds of life left is when a shard starts to fade (render/entities.js), so this one is on
  // its way out - and the mark sits inside the shard's own fading, not outside it.
  shard.life = 0.5;
  const fading = marksPainted(paintOneFrame(), PALETTE.markCore, 1);
  assert.equal(fading.length, 1, 'it is still lit while it is still there');
  assert.ok(fading[0].alpha > 0 && fading[0].alpha < 1,
    'and dimmer the less of it is left: alpha ' + fading[0].alpha);
  marksAt(null);
});

test('the ship does not mark its own gun, and no crowd body is marked either', () => {
  // The rule the audit paints by (tools/sights.js): the mark goes on the harm that is a dot and on the
  // help that is a diamond. A crowd body has a silhouette, a size and a way of walking; the ship's own
  // shot is already the lit half of the pair. So neither of them may gain a fill.
  const theWholeCrowd = Object.keys(BALANCE.kinds);

  marksAt(null);
  clearTheSky();
  bulletFlyingToward(ship.x + 100, ship.y, 600, 0, 0, false);
  const plainShot = paintOneFrame();
  clearTheSky();
  enemyAt('tank', ship.x + 150, ship.y - 40);
  const plainTank = paintOneFrame();
  clearTheSky();
  for (const kind of theWholeCrowd) enemyAt(kind, ship.x + 150, ship.y - 40);
  const plainCrowd = paintOneFrame();
  assert.ok(plainCrowd.fills > plainTank.fills,
    'the crowd was drawn, or the last line proves nothing');

  marksAt('full');
  clearTheSky();
  bulletFlyingToward(ship.x + 100, ship.y, 600, 0, 0, false);
  const markedShot = paintOneFrame();
  clearTheSky();
  enemyAt('tank', ship.x + 150, ship.y - 40);
  const markedTank = paintOneFrame();
  clearTheSky();
  for (const kind of theWholeCrowd) enemyAt(kind, ship.x + 150, ship.y - 40);
  const markedCrowd = paintOneFrame();

  assert.equal(markedShot.fills, plainShot.fills, 'the ship owns that shot, so it stays lit through');
  assert.equal(markedTank.fills, plainTank.fills, 'a body costs exactly what it cost');
  assert.equal(markedCrowd.fills, plainCrowd.fills, 'and so does every body in the crowd');
  assert.equal(markedCrowd.circles.filter(isMarkInk).length, 0, 'and none of them wore mark ink');
  marksAt(null);
});

test('what is off the window is not marked either, because it is not drawn at all', () => {
  marksAt('full');
  clearTheSky();
  plantShot();
  const near = paintOneFrame();
  clearTheSky();
  enemyShotAt(field, ship.x + 4000, ship.y, 0, 0, SPIT.shot);
  const far = paintOneFrame();

  assert.ok(near.fills > far.fills,
    'the frame with a shot in it cost more than the frame without one');
  assert.equal(far.circles.filter(isMarkInk).length, 0,
    'and a shot three windows away bought no pupil');
  marksAt(null);
});
