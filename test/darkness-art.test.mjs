// The night as painted (render/darkness.js). There are no pixels here, so what these can say is the
// arithmetic of the veil - which is exactly where the lies about it would live:
//
//   It is laid OVER the world and not added to it. A night composited `lighter` is a faint blue wash
//     with every star still shining through, which is the trap the sun's own body fell into once
//     (test/boss-art.test.mjs), and a sheet of holes is only a hole if the sheet covers.
//   The ship, the shots and the fight are the lights, at the reaches the row says. Not "something is
//     brighter": the reach is the fairness of the whole feature, so it is measured here against the
//     number in game/balance.js that argues for it.
//   A promise is not eaten by the dark. The door of a shell is let through the night out of the same
//     wedge the door's own light is drawn from, or `telegraphMin` has a hole in it at the one point
//     in the game where the room is darkest.
//   Off the window a light is not worth a stamp, and a frame spends no blur, no gradient and no new
//     sprites being dark.
//
// The punches land on a sheet of the game's own, so they are read through the harness's offscreen
// log (tools/headless/harness.js `stampsOffscreen`, `circlesOffscreen`), which is in that sheet's own
// pixels: an arena point minus wherever the camera is looking.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import {
  armedCount, bossPhase, callAngle, callCount, callKind, callStand, callStep, coreReach,
  darknessOf, gapAngle, gapEnd, gapHalf, gapStart,
} from '../src/game/bosses.js';
import { damageEnemy } from '../src/game/enemies.js';
import { doorWedge } from '../src/render/entities.js';
import { view } from '../src/render/canvas.js';
import { stats as glowStats } from '../src/render/glow.js';
import { bulletFlyingToward } from '../tools/headless/scripted.js';

const ROOT = path.resolve(import.meta.dirname, '..');
// One device pixel per CSS pixel on purpose (the same reason boss-art.test.mjs gives): the sheet is
// cut at CSS resolution, and at a ratio of 1 the window's own pixels and the sheet's are the same
// numbers, so a test can compare a stamp with an arena point without converting either of them.
const game = await bootGame({ root: ROOT, seed: 9, dpr: 1 });
const field = game.world;
const DARK = BALANCE.bosses.dark;
const LIGHT = DARK.light;
const ECLIPSE = BALANCE.bosses.eclipse;
const DUE = BALANCE.bosses.schedule.findIndex((entry) => entry.boss === 'eclipse');

// The title screen draws the menu crowd and no ship, so get a run going first.
game.pressMouse(640, 360);
game.step();
game.releaseMouse();

/**
 * Bring the Eclipse out and put it on the mark that opens the phase that asks for the night, then
 * wait for the ramp to arrive. The cards are cleared as they come out, because the ramp is stepped
 * with the fight and a run parked behind a card chooses nothing (test/darkness.test.mjs).
 */
function intoTheDark() {
  field.spawnTimer = Infinity;
  field.player.invuln = Infinity;
  field.bossIndex = DUE;
  field.elapsed = BALANCE.bosses.schedule[DUE].at - 0.05;
  let guard = 0;
  while ((field.boss === null || field.boss.enemy === null) && guard++ < 900) step(16);
  const boss = field.boss;
  assert.ok(boss !== null && boss.id === 'eclipse', 'the Eclipse never walked in');
  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[1] * 0.99;
  guard = 0;
  while (darknessOf(field) < ECLIPSE.phases[1].dark.level - 1e-9 && guard++ < 2000) step(16);
  assert.ok(bossPhase(boss) >= 2,
    'the fight is not in the phase that puts the night down (a later visit cannot un-open a phase,'
    + ' so anything from 2 up is a room that is at least this dark)');
  return boss;
}

/** One frame, with the cards out of the way. */
function step(ms) {
  if (game.stats().state === game.STATE.LEVEL) {
    game.key('Digit1', true);
    game.step(ms);
    game.key('Digit1', false);
    return;
  }
  game.step(ms);
}

/** The window's own sheet of the frame: the one stamp that is exactly as big as the window. */
function veil() {
  return game.stamps().filter((s) => s.x === 0 && s.y === 0
    && Math.abs(s.w - view.W) < 0.01 && Math.abs(s.h - view.H) < 0.01);
}

/** Where an arena point lands on the sheet the night is cut on. */
function sheet(x, y) {
  const at = game.camera;
  return { x: x - at.x, y: y - at.y };
}

/** The holes the last frame cut in the night, as `{ x, y, r }` centres and reaches in arena px. */
function holes() {
  return game.stampsOffscreen().map((s) => ({
    x: s.at.x + s.w / 2,
    y: s.at.y + s.h / 2,
    r: s.w / 2,
    mode: s.mode,
    strength: s.strength,
  }));
}

/**
 * Holes of `radius` (give or take a pixel of rounding) centred on `place`.
 *
 * The slack on the centre is the interpolation, not sloppiness: the frame paints a mover between where
 * it was and where the step left it, so a ship being dragged sits up to one step of the drag away
 * from the number the test reads back after the step (render/interp.js).
 */
function holesAt(list, place, radius) {
  return list.filter((h) => Math.hypot(h.x - place.x, h.y - place.y) < 8
    && Math.abs(h.r - radius) < 1);
}

/** A shot standing still in the air, a long way out, that will not die before it is measured. */
function shotStandingAt(x, y) {
  const shot = bulletFlyingToward(x, y, 0, 0);
  shot.life = Infinity;
  return shot;
}

/** One frame, which is also what puts a fresh set of draw logs under the next claim. */
function oneFrame() {
  game.step(16);
}

// ---------------------------------------------------------------------------

test('the night is laid over the window when it is dark, and nowhere when it is not', () => {
  oneFrame();
  assert.equal(veil().length, 0, 'a sheet was laid over a bright room');

  intoTheDark();
  const laid = veil();
  assert.equal(laid.length, 1, 'the dark did not cover the window: ' + laid.length + ' sheets');

  // And it *covers*: the one composite in the game that means "over". A night stamped `lighter`
  // would be a glow the size of the screen, which is the difference between an eclipse and a smudge
  // (render/boss.js learned the same lesson one release ago, with the sun's own disc).
  assert.equal(laid[0].mode, 'source-over',
    'the night was composited ' + laid[0].mode + ', which is a wash and not a covering');
  assert.ok(darknessOf(field) > 0.5, 'and it is not even dark yet: ' + darknessOf(field));
});

test('the night is laid over the whole sheet it is cut on', () => {
  intoTheDark();
  step(16);
  // The sheet is the size of the window and the arena is a good deal bigger, so the covering has to
  // be laid from the sheet's OWN corner. Every light on it is placed at an arena point, and a fill
  // placed the same way would cover a strip of the sheet and `copy` would clear the rest - a room
  // with a bright band down two of its edges, which is the kind of thing no test here can see as a
  // pixel and therefore has to be measured as a rectangle instead.
  const laid = game.rectsOffscreen().filter((r) => Math.abs(r.w - view.W) < 0.01
    && Math.abs(r.h - view.H) < 0.01);
  assert.equal(laid.length, 1, 'the night did not fill the sheet it is cut on');
  assert.equal(laid[0].x, 0, 'the night started somewhere other than its own corner');
  assert.equal(laid[0].y, 0, 'the night started somewhere other than its own corner');

  // And the frame has to be looking somewhere other than the corner of the arena for any of the above
  // to have been a question at all.
  assert.ok(game.camera.x > 1 && game.camera.y > 1,
    'the camera was parked at the arena\'s own corner, so this tested nothing: '
    + game.camera.x + ', ' + game.camera.y);
});

test('the ship stands in a hole the row says it does', () => {
  intoTheDark();
  step(16);
  const ship = sheet(field.player.x, field.player.y);
  const lit = holesAt(holes(), ship, LIGHT.ship);
  assert.equal(lit.length, 1, 'the ship was not left a hole of the reach the row argues for');

  // The reach is the fairness of the whole feature - far enough to see a body walking at you - so it
  // had better be the number in game/balance.js and not one the painter made up on the way.
  assert.ok(Math.abs(lit[0].r - LIGHT.ship) < 1,
    'the ship is lit to ' + lit[0].r + ' px and the row says ' + LIGHT.ship);
});

test('every shot on the window is its own light, and one off it is not', () => {
  intoTheDark();
  const ship = field.player;
  const sun = field.boss.enemy;

  // Two real bullets of the gun being flown, differing only in where they stand and in being told not
  // to expire before they are measured. The near one is put at right angles to the way the sun is,
  // because a bullet standing between the ship and the sun would be a bullet inside the sun, chewing
  // on it every step - which is a fine thing for a bullet to do and a terrible thing for a test.
  const dx = sun.x - ship.x;
  const dy = sun.y - ship.y;
  const away = Math.hypot(dx, dy) || 1;
  const near = shotStandingAt(ship.x - dy / away * 60, ship.y + dx / away * 60);
  const down = field.player.y - 1200 > 40 ? -1 : 1;
  const far = shotStandingAt(ship.x, ship.y + down * 1200);
  assert.ok(far.y > 0 && far.y < field.arena.h, 'the far shot could not be got outside the arena');

  step(16);
  const list = holes();
  assert.ok(field.bullets.items.includes(near) && field.bullets.items.includes(far),
    'a planted shot did not survive the frame it was measured on');
  assert.equal(holesAt(list, sheet(near.x, near.y), LIGHT.bullet).length, 1,
    'a shot on the window was left in the dark');

  // Straight up or down, because the window is only 720 px tall: a point 1200 px along that axis is
  // off the glass wherever the camera happens to be clamped at an arena wall.
  const off = sheet(far.x, far.y);
  assert.ok(off.y < -LIGHT.bullet || off.y > view.H + LIGHT.bullet,
    'the far shot was not off the window at all, so the cull was never tested');
  assert.equal(holesAt(list, off, LIGHT.bullet).length, 0,
    'a light nobody can see still cost a stamp');
});

test('a shell in the air carries a bigger light than the ship\'s own, and the sun keeps its corona', () => {
  const boss = intoTheDark();
  const sun = boss.enemy;

  // The enemy's shots are the bigger light, because a shell is the harm in this fight and the harm is
  // the one thing the night may never hide.
  let guard = 0;
  while (field.enemyShots.count === 0 && guard++ < 900) step(16);
  assert.ok(field.enemyShots.count > 0, 'it threw no shell to look at');
  step(16);
  const list = holes();
  const air = field.enemyShots.items[0];
  assert.equal(holesAt(list, sheet(air.x, air.y), LIGHT.shot).length, 1,
    'a shell in the air was left in the dark');

  // And the fight itself, at a share of its own reach: the rim is the countdown and the corona is
  // where the drag is drawn, and neither may be lost in the dark the sun brought with it.
  assert.equal(holesAt(list, sheet(sun.x, sun.y), coreReach(boss.cores[0]) * LIGHT.body).length, 1,
    'the sun was left a hole in the dark instead of a light in it');
});

test('the door is let through the night, out of the same wedge the light is drawn from', () => {
  const boss = intoTheDark();
  const sun = boss.enemy;

  let guard = 0;
  while (armedCount(boss) === 0 && guard++ < 900) step(16);
  assert.ok(armedCount(boss) > 0, 'it never armed a shell to look at');

  // The wedge the dark leaves out is measured against the wedge the door's own light is painted from,
  // which is the same question render/entities.js `doorWedge` answers for both of them: two painters
  // that disagreed about where the door is would be the worst possible bug in this feature, because
  // both of them would look right.
  const wedge = doorWedge(boss, sun.x, sun.y);
  assert.ok(wedge !== null, 'it was arming a shell and then had no door to show');
  const at = sheet(sun.x, sun.y);
  const arcs = game.circlesOffscreen().filter((c) => c.mode === 'destination-out');
  assert.equal(arcs.length, 1, 'the night did not leave the door out: ' + JSON.stringify(arcs));
  const door = arcs[0];
  assert.ok(Math.hypot(door.at.x - at.x, door.at.y - at.y) < 4,
    'the door was let through somewhere other than the sun');
  assert.ok(Math.abs(door.r - wedge.reach) < 1, 'the dark cut a door of ' + door.r + ' px');
  assert.ok(Math.abs(door.from - (gapAngle(boss) - gapHalf(boss))) < 1e-9
    && Math.abs(door.to - (gapAngle(boss) + gapHalf(boss))) < 1e-9,
  'the door the dark left open is not the door the fight opened');

  // Only while it is arming one, too: between shells there is no door, and a wedge left lit would be
  // a promise about a volley that is not coming (game/bosses.js `alternateBeats`).
  guard = 0;
  while (armedCount(boss) > 0 && guard++ < 900) step(16);
  step(16);
  assert.equal(game.circlesOffscreen().filter((c) => c.mode === 'destination-out').length, 0,
    'a door was let through the night between shells');
});

test('a dark frame asks the canvas for nothing slow and builds nothing new', () => {
  intoTheDark();
  for (let i = 0; i < 30; i++) step(16);        // whatever is new, this frame has already met
  const before = game.drawCalls();
  const baked = game.bakeCalls();
  for (let i = 0; i < 60; i++) step(16);
  const spent = game.drawCalls();
  const build = game.bakeCalls();

  assert.equal(spent.shadows - before.shadows, 0, 'a dark frame asked the canvas for a blur');
  assert.equal(spent.gradients - before.gradients, 0, 'a dark frame built a gradient');
  assert.equal(build.canvases - baked.canvases, 0, 'every frame of the dark cut itself a new sheet');
  assert.equal(build.gradients - baked.gradients, 0, 'and baked a gradient to cut it with');
  assert.ok(glowStats().holders < 35,
    'the holes came from a bounded few sprites: ' + glowStats().holders);
});

test('the sheet is cut to the window it is laid on', () => {
  intoTheDark();
  game.setViewport(900, 620);
  step(16);
  const laid = veil();
  assert.equal(laid.length, 1, 'after a resize the night did not cover the new window');
  assert.ok(Math.abs(laid[0].w - view.W) < 0.01 && Math.abs(laid[0].h - view.H) < 0.01,
    'a stale sheet is being stretched over a window it was not cut for');
  assert.equal(holesAt(holes(), sheet(field.player.x, field.player.y), LIGHT.ship).length, 1,
    'and after the resize the ship is not where the dark thinks it is');
  game.setViewport(1280, 720);
});

// ---------------------------------------------------------------------------
// The walking door's promise, in the dark (game/bosses.js `walkTheDoor`). The last phase's shell
// promises a gap that travels, and the whole of the way it travels is a promise: the night may not
// eat any more of it than it may eat a held door. Two wedges go into the dark and the narrower of
// them - the door where it stands - has to be inside the wider.
// ---------------------------------------------------------------------------

/**
 * The last phase, deep night and all. The dark is not asked to come back for the phase change
 * (game/bosses.js `stepDarkness`), so the deeper ask is what the ramp is walking to here.
 */
function intoTheDeep() {
  const boss = intoTheDark();
  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[2] * 0.99;
  let guard = 0;
  while (darknessOf(field) < ECLIPSE.phases[2].dark.level - 1e-9 && guard++ < 2000) step(16);
  assert.equal(bossPhase(boss), 3, 'it never got to its last phase');
  return boss;
}

test('the night leaves the whole of a walking door out, and not just its last place', () => {
  const boss = intoTheDeep();
  const sun = boss.enemy;

  let guard = 0;
  while (armedCount(boss) === 0 && guard++ < 900) step(16);
  assert.ok(armedCount(boss) > 0, 'it never armed a shell to look at');

  const half = gapHalf(boss);
  const walk = gapEnd(boss) - gapStart(boss);
  const at = sheet(sun.x, sun.y);
  const arcs = game.circlesOffscreen().filter((c) => c.mode === 'destination-out');
  assert.equal(arcs.length, 2, 'the night was cut with ' + arcs.length + ' wedges and the promise has two');

  const route = arcs.find((c) => Math.abs((c.to - c.from) - (Math.abs(walk) + half * 2)) < 1e-9);
  const door = arcs.find((c) => Math.abs((c.to - c.from) - half * 2) < 1e-9);
  assert.ok(route !== undefined, 'the way the door walks was left in the dark: '
    + JSON.stringify(arcs.map((c) => [c.from, c.to])));
  assert.ok(door !== undefined, 'the door itself was left in the dark');
  for (const wedge of [route, door]) {
    assert.ok(Math.hypot(wedge.at.x - at.x, wedge.at.y - at.y) < 4,
      'a wedge was cut somewhere other than round the sun');
  }
  // The door is inside the route it was promised by - which is the one ordering that matters, since
  // the ship is asked to stand in the door and read the route.
  assert.ok(route.from <= door.from + 1e-9 && route.to >= door.to - 1e-9,
    'the door was cut outside the way it walks');
  assert.ok(Math.abs(gapAngle(boss) - (door.from + door.to) / 2) < 1e-9,
    'the door the dark left out is not the door the fight opened');

  // And only while it is arming one: between shells there is no door and no route, and a wedge left
  // cut would be a lit place in the night for a volley that is not coming.
  guard = 0;
  while (armedCount(boss) > 0 && guard++ < 900) step(16);
  step(16);
  assert.equal(game.circlesOffscreen().filter((c) => c.mode === 'destination-out').length, 0,
    'a door was let through the night between shells');
});

test('the marks a call is lit on are punched clean out of the night', () => {
  const boss = intoTheDeep();
  const sun = boss.enemy;

  // The room has been fighting for the whole of this file and the ship parked in it has taken every
  // shell on the way, so: no more damage, and the patience to wait for a call. The marks are only
  // shown for the length of one wind-up, so a frame that misses one has to wait for the next.
  //
  // The wait also clears the room, the way a run that shoots back would. That is not the test
  // pretending the fight is easier than it is: a second pack cannot be lit over a pack that is
  // still hunting (game/bosses.js `takeBeat`), and nothing in this file shoots, so without it there
  // would never be a second call to look at. And it is `damageEnemy` rather than `killEnemy` for the
  // same reason - the gate counts a pack by the hulls it has left (game/bosses.js `living`), and a
  // body taken out of the crowd with its hull still written high is a body the fight is still holding.
  field.player.invuln = Infinity;
  field.player.hull = field.player.maxHull;
  const answering = () => {
    for (const one of field.enemies) {
      if (one.type === callKind(boss)) damageEnemy(field, one, one.maxhp, false);
    }
  };
  let guard = 0;
  while (callCount(boss) === 0 && guard++ < 3000) {
    answering();
    step(16);
  }
  assert.ok(callCount(boss) > 0, 'the last phase never made a call to look at');

  // Where each mark stands: in the sheet's own pixels, which is what the veil was cut against.
  const stand = sun.r + callStand(boss);
  const middle = (callCount(boss) - 1) / 2;
  const marks = [];
  for (let i = 0; i < callCount(boss); i++) {
    const bearing = callAngle(boss) + (i - middle) * callStep(boss);
    marks.push(sheet(sun.x + Math.cos(bearing) * stand, sun.y + Math.sin(bearing) * stand));
  }

  const lit = holes();
  for (const mark of marks) {
    const hole = holesAt(lit, mark, LIGHT.mark);
    assert.equal(hole.length, 1, 'a mark was left in the dark: ' + JSON.stringify(mark));
    assert.ok(Math.abs(hole[0].r - LIGHT.mark) < 1,
      'the mark was cut ' + hole[0].r + ' px wide and the row says ' + LIGHT.mark);
    assert.equal(hole[0].mode, 'destination-out', 'a mark was cut with the wrong composite');
    // Full weight, unlike the door: the night over a mark is *gone* and not merely thinner, because a
    // mark is where a body is about to arrive and not a lit place to stand. The ship's own light is
    // no help here - the sun is dragging the ship under it, so half the marks are on the far side of
    // a body that is 28% see-through at this level (the argument BALANCE.bosses.dark.light.mark).
    assert.ok(hole[0].strength > 0.999,
      'the night was left ' + (1 - hole[0].strength).toFixed(2) + ' of itself over a mark');
  }

  // And they go out with the promise. A mark that kept shining after its body had arrived would be a
  // lit place in the dark for an ask that is already on its way to the ship.
  guard = 0;
  while (callCount(boss) > 0 && guard++ < 3000) {
    answering();
    step(16);
  }
  step(16);
  const after = holes();
  for (const mark of marks) {
    assert.equal(holesAt(after, mark, LIGHT.mark).length, 0,
      'a mark went on shining after it had been paid');
  }
});
