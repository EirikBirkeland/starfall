// The turret (game/turret.js, render/entities.js) as it is drawn, and its card as it is dealt.
//
// There is no browser here, so this cannot say a gun on a mount with a line of light laid out in front
// of it reads as "that is mine, and it is aiming". What it can say is the four promises that make the
// drawing an honest piece of the picture:
//
//   no guns standing cost a frame nothing at all - no mount, no barrel, no light - because the guns
//     standing in the arena are the whole of the line's drawing state, ranks included;
//   **the sight line is the reach**: the line drawn out of the muzzle stops at exactly `reach`, which is
//     the distance game/turret.js will aim at and the distance its shell is given flight for - the light
//     is the promise, the same promise a mine's ring and a tether's band make (game/mines.js,
//     game/tether.js), and it is measured here off the points the frame actually asked for rather than
//     off the number in the balance file;
//   a gun that has found a lock and a gun that has not cost a frame exactly the same, and differ only in
//     how bright the line is - the lock is the picture, and brightness is all it costs;
//   and a whole fence costs a mount, a barrel and a light per gun and one sprite for none of them: the
//     muzzle wears the orbital drone's own light and the card wears the ship's own pale edge, so the
//     seventeenth line asks the canvas to build nothing at all (test/draw-cost.test.mjs).
//
// Same instrument as test/tether-art.test.mjs and test/mines-art.test.mjs: boot the real game through
// the headless harness, paint real frames through the real painter, and count what the frame asked the
// canvas for (tools/headless/harness.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { makeEnemy } from '../src/game/kinds.js';
import { stats as glowStats } from '../src/render/glow.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TURRET = BALANCE.upgrades.turret;
const GUN_AT = 300;              // px east of the ship the guns of a test stand, clear of the ship
const PREY_AT = 200;             // px down the nose of the nearest one, for the frames that have a lock
const game = await bootGame({ root: ROOT, seed: 47, dpr: 1 });
const field = game.world;

// Start a run, then empty the arena and take the wave director out of it: this file counts what a gun
// costs, and a wave arriving mid-measurement would be a different measurement every time. Every gun
// here is one the test planted by hand - with no ranks up the line's own clock never runs, so
// `paintFrame` is the only thing that ever puts a gun on the floor.
game.pressMouse(640, 360);
game.step();
game.releaseMouse();
game.step();
field.spawnTimer = Infinity;
field.player.invuln = Infinity;
field.enemies.length = 0;
field.upgrades.turret = 0;

/** Where a gun of a test stands, in the arena's own coordinates. */
function gunPlace() {
  return { x: field.player.x + GUN_AT, y: field.player.y };
}

/**
 * Put `count` guns on the floor, in a line down the arena from the first one, standing where the test
 * says and holding whatever clocks it says. They are put down again before every frame, which is what
 * keeps the world's own arithmetic out of a measurement: left alone, a gun would count its ten seconds
 * down and - given a lock - fire, and a bullet in the air is a different measurement.
 */
function plant(count, at) {
  field.turret.stands.clear();
  // A frame of this file holds the guns the test asked for and, when it asks for one, one body to look
  // at - and nothing a previous test left behind.
  if (at.hold === undefined) field.enemies.length = 0;
  const here = gunPlace();
  for (let i = 0; i < count; i++) {
    const turret = field.turret.stands.spawn();
    turret.x = here.x + i * TURRET.gap;
    turret.y = here.y + i * (at.row === undefined ? 0 : at.row);
    turret.angle = at.angle === undefined ? 0 : at.angle;
    turret.aim = 0;
    turret.life = at.live === undefined ? Infinity : at.live;
    // Ready by default: a gun that has just fired has no muzzle light to measure.
    turret.cool = at.cool === undefined ? 0 : at.cool;
  }
}

/** Keep a body exactly where it was put, so two frames can differ by one lock and nothing else. */
function still(body) {
  return () => {
    body.x = body.px = body.x0;
    body.y = body.py = body.y0;
    body.ix = 0;
    body.iy = 0;
  };
}

/** A body to be looked at, down the nose of the first gun. Immortal, and held still by `still`. */
function prey() {
  const here = gunPlace();
  const body = makeEnemy(field, 'swarmling', here.x + PREY_AT, here.y);
  body.speed = 0;
  body.spin = 0;
  body.hp = 1e6;
  body.maxHp = 1e6;
  field.enemies.push(body);
  body.x0 = body.x;
  body.y0 = body.y;
  return body;
}

/**
 * Paint one frame and report what it asked the canvas for: the strokes, lights, gradients, blurs and
 * bakes it cost, and - for the geometry tests - only the points and lights that were not in the frame
 * before it.
 */
function paintFrame(state) {
  const at = state === undefined ? {} : state;
  plant(at.count === undefined ? 1 : at.count, at);
  const hold = at.hold === undefined ? null : still(at.hold);
  const before = game.drawCalls();
  const baked = game.bakeCalls();
  if (hold !== null) hold();
  game.step();
  if (hold !== null) hold();
  const after = game.drawCalls();
  const now = game.bakeCalls();
  return {
    strokes: after.strokes - before.strokes,
    stamps: after.images - before.images,
    gradients: after.gradients - before.gradients,
    shadows: after.shadows - before.shadows,
    baked: now.canvases - baked.canvases,
    // The log holds the one frame that was just drawn (tools/headless/harness.js), so this is that
    // frame's own points and nothing older than it.
    points: game.points(),
    words: game.words(),
  };
}

/** Nothing on the floor at all, painted, for the "what does this cost" comparisons. */
function bare() {
  field.enemies.length = 0;
  return paintFrame({ count: 0 });
}

/** The points of a frame that the frame before it did not have. */
function fresh(frame, seen) {
  const key = (p) => p.x.toFixed(3) + ',' + p.y.toFixed(3);
  const before = seen === undefined ? new Set() : new Set(seen.map(key));
  return frame.points.filter((p) => !before.has(key(p)));
}

/**
 * Paint one gun standing at the test's place and facing `angle`, and report what the frame added on
 * top of an empty arena, measured in the gun's own frame of reference: `along` is how far down the
 * nose a drawn point lies and `across` how far off the line of it. This is how a reach is measured in
 * here - the picture and the balance file are asked the same question and has to give the same number.
 */
function sight(angle, live) {
  const nothing = bare();
  const here = gunPlace();
  const on = game.screenOf(here.x, here.y);
  const frame = paintFrame({ angle: angle, cool: TURRET.beat, live: live });
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const along = (pt) => (pt.x - on.x) * cos + (pt.y - on.y) * sin;
  const across = (pt) => -(pt.x - on.x) * sin + (pt.y - on.y) * cos;
  const out = (pt) => Math.hypot(pt.x - on.x, pt.y - on.y);
  const gun = fresh(frame, nothing.points);
  return {
    gun: gun,
    along: along,
    across: across,
    out: out,
    on: gun.filter((pt) => Math.abs(across(pt)) < 1e-4),
    farthest: gun.reduce((a, b) => (out(a) > out(b) ? a : b)),
  };
}

/** The distinct distances down the nose that the gun was drawn at, rounded off float noise. */
function marks(seen) {
  return seen.on.map(seen.along).map((v) => Math.round(v * 1000) / 1000).sort((a, b) => a - b)
    .filter((v, i, all) => i === 0 || v !== all[i - 1]);
}

test('no guns standing costs a frame nothing at all', () => {
  const empty = bare();
  field.upgrades.turret = 5;
  field.turret.wait = Infinity;          // and no crew of its own going down mid-measurement
  const ranksAndNoGuns = paintFrame({ count: 0 });
  field.upgrades.turret = 0;
  field.turret.wait = 0;

  assert.equal(field.turret.stands.count, 0, 'the guns standing are the whole of the state');
  assert.equal(ranksAndNoGuns.strokes, empty.strokes,
    'so five ranks with nothing planted cost a frame nothing: ' + empty.strokes + ' strokes against '
    + ranksAndNoGuns.strokes);
  assert.equal(ranksAndNoGuns.stamps, empty.stamps, 'and no light of their own');
});

test('a gun is a mount, a barrel, a sight line and one light', () => {
  const nothing = bare();
  paintFrame();                                   // the first frame is where a sprite is met
  const one = paintFrame();

  // Two passes for the sight line, two for the mount, two for the barrel: a wide faint stroke under a
  // thin bright one, which is how anything here glows without a blur (render/entities.js).
  assert.equal(one.strokes - nothing.strokes, 6,
    'and nothing else: ' + (one.strokes - nothing.strokes) + ' strokes for one gun');
  assert.equal(one.stamps - nothing.stamps, 1, 'one light, at the muzzle');
  assert.equal(one.baked, 0, 'and none of it built on this frame');
});

test('the sight line is drawn from the muzzle to exactly the reach the gun shoots at', () => {
  // Up and to the right, so that the nose is not an axis and a drawing that guessed at one would show.
  const seen = sight(-Math.PI / 3);
  const every = marks(seen);
  assert.equal(every.length, 4,
    'everything on this gun is drawn along its nose, at the middle, the muzzle, the barrel\'s end and '
    + 'the end of the line: ' + every.join(', '));
  assert.equal(every[0], 0, 'from the mount\'s own middle');
  assert.equal(every[1], TURRET.muzzle, 'out of the muzzle the shell is born at');
  assert.ok(Math.abs(every[3] - TURRET.reach) < 1e-3,
    'and as far as the reach, which is how far the gun will look and how far its shell is given leave '
    + 'for: ' + every[3] + ' px of light against a ' + TURRET.reach + ' px reach');
  assert.ok(every[2] > every[1] && every[2] < every[3],
    'with the barrel\'s end between them, so the barrel is the facing and the light goes past it');
  assert.ok(Math.abs(seen.across(seen.farthest)) < 1e-4,
    'and the line runs straight down the nose, not off to one side of it');
});

test('a gun turned round is drawn turned round, because that is the only way it can shoot', () => {
  // A shell only ever leaves down the nose (game/turret.js), so the picture has to say where the nose
  // is or it is lying about what the gun can do.
  const east = sight(0);
  const about = sight(-Math.PI / 3);
  assert.equal(east.gun.length, about.gun.length,
    'the same gun either way: ' + east.gun.length + ' points against ' + about.gun.length);
  assert.deepEqual(marks(east), marks(about), 'drawn at the same distances down the nose');
  assert.ok(Math.abs(east.farthest.x - about.farthest.x) > 1 || Math.abs(east.farthest.y - about.farthest.y) > 1,
    'and the end of the line is somewhere else, because the nose is: '
    + east.farthest.x.toFixed(1) + ',' + east.farthest.y.toFixed(1) + ' against '
    + about.farthest.x.toFixed(1) + ',' + about.farthest.y.toFixed(1));
});

test('a gun that has found a lock costs the frame what a gun without one costs', () => {
  const nothing = bare();
  const quiet = paintFrame({ cool: TURRET.beat });
  const cost = quiet.strokes - nothing.strokes;

  // A body to look at, held just inside the sight, and the same gun with its nose on it: what changes
  // is how bright the line is, and nothing about what the frame asks for.
  const body = prey();
  const hold = still(body);
  const bodyOnly = paintFrame({ count: 0, hold: body });
  const lit = paintFrame({ cool: TURRET.beat, hold: body });
  assert.equal(field.turret.stands.items[0].aim, 1, 'and the gun was lined up on it');
  assert.ok(field.turret.shots === 0, 'and did not fire, so this frame is only the two of them');

  assert.equal(lit.strokes - bodyOnly.strokes, cost,
    'the same six strokes either way: ' + cost + ' against ' + (lit.strokes - bodyOnly.strokes));
  assert.equal(lit.stamps - bodyOnly.stamps, 1, 'and the same one light at the muzzle');
  assert.equal(lit.strokes - bodyOnly.strokes, 6, 'and no new pass of any kind for having found one');
  // What a lock changes is how bright the sight line is, and there are no pixels in here to see that
  // with (tools/headless/harness.js logs strokes, not alphas). The claim that can be checked is the one
  // the frame budget cares about: a lock is the same paint, lit.
});

test('a fence costs its guns and asks for no sprite of its own', () => {
  paintFrame({ count: 1 });
  const one = paintFrame({ count: 1 });
  const baked = game.bakeCalls().canvases;
  const holders = glowStats().holders;

  const five = paintFrame({ count: 5 });
  assert.equal(five.strokes - one.strokes, 24,
    'every gun after the first is its own six strokes: ' + (five.strokes - one.strokes));
  assert.equal(five.stamps - one.stamps, 4,
    'and its own muzzle light: ' + (five.stamps - one.stamps));
  assert.equal(game.bakeCalls().canvases - baked, 0,
    'and not one new sprite for the four of them - the muzzle wears the orbital drone\'s own light');
  assert.equal(glowStats().holders, holders,
    'and it did not even ask for a colour of its own: it wears the ship\'s');
});

test('a gun going out is painted right up to the last frame of its ten seconds', () => {
  // The fade is the one thing about a fading gun that changes, so the frame has to be the same gun in
  // every other way - and in particular still throwing its whole reach of light down a nose that is
  // still pointing where it was pointing.
  const whole = sight(0);
  const going = sight(0, TURRET.fade * 0.3);

  assert.deepEqual(marks(going), marks(whole),
    'the same line at the same distances, right up to the frame it goes out in');
  assert.equal(going.gun.length, whole.gun.length, 'at the same cost in points');

  paintFrame();
  const fresh = paintFrame();
  const goingFrame = paintFrame({ live: TURRET.fade * 0.3 });
  assert.ok(goingFrame.strokes > bare().strokes, 'its mount is still on the glass');
  assert.equal(goingFrame.strokes, fresh.strokes, 'and the same six strokes, only dimmer');
  assert.equal(goingFrame.stamps, fresh.stamps, 'and its muzzle is still lit');
});

test('the turret asks the canvas for nothing it has to build', () => {
  paintFrame({ count: 3 });
  const frame = paintFrame({ count: 3 });

  assert.equal(frame.gradients, 0, 'no gradient');
  assert.equal(frame.shadows, 0, 'no blur');
  assert.equal(frame.baked, 0, 'and nothing baked mid-frame');
});

test('the turret card is on the rack and prints what a rank does', () => {
  const offer = field.offer.slice();
  field.offer.length = 0;
  field.offer.push('turret');
  field.state = STATE.LEVEL;
  field.offerTime = field.time;

  paintFrame({ count: 0 });                   // the icon's glow is baked on meeting it
  const frame = paintFrame({ count: 0 });
  assert.ok(frame.points.length > 20, 'the icon is a drawing and not a glyph: ' + frame.points.length);
  assert.ok(frame.words.indexOf('TURRET') >= 0, 'the card carries its name');
  assert.ok(frame.words.indexOf('+1 turret planted') >= 0,
    'and the number it is selling, in guns: ' + frame.words.join(' / '));
  assert.equal(frame.gradients, 0, 'and it asks for nothing built mid-frame');
  assert.equal(frame.shadows, 0, 'and nothing blurred');

  field.state = STATE.PLAY;
  field.offer.length = 0;
  for (const id of offer) field.offer.push(id);
});
