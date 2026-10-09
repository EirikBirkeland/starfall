// The boss as drawn (render/boss.js, render/hud.js, render/entities.js). There is no browser
// here, so what these can say is the arithmetic of the picture, which is where the lies live:
//
//   The bar is on the glass while the fight is, in the strip of window nothing else claims, and
//     it says which phase it is on.
//   Before the fight there is a name and no bar, and it is the same name.
//   The cage is drawn when there is a cage and not when there isn't, and it is drawn in the
//     arena's coordinates, i.e. with the camera applied.
//   A held volley is drawn as wide as it hurts, and the beams that arrive are drawn the same
//     width as the warning that came before them - the one rule every telegraph in the game is
//     held to (test/beam-art.test.mjs), repeated here because a boss is where it matters most.
//
// and the housekeeping: no blur and no gradient is smuggled in to make any of it look good.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { beamReach } from '../src/game/beams.js';
import {
  armedCount, bossCells, bossCores, bossCoreOf, bossFlare, bossPhase, bossTint, cageRise,
  callAngle, callBody, callCount, callStand, callStep, cellOpening, coreCells, gapAngle, gapHalf,
  spokeAngle, spokeCount, spokeHalf,
} from '../src/game/bosses.js';
import { PALETTE } from '../src/core/palette.js';
import { damageEnemy } from '../src/game/enemies.js';
import { bandPasses } from '../src/render/entities.js';
import { bossBarLayout } from '../src/render/hud.js';

const ROOT = path.resolve(import.meta.dirname, '..');
// Booted at a device pixel ratio of 1 on purpose: the harness draws at 2 by default, and this
// file compares drawn points with arena coordinates, which `game.screenOf` answers in the
// window's own pixels. One less conversion for a test to get wrong.
const game = await bootGame({ root: ROOT, seed: 42, dpr: 1 });
const field = game.world;
const WARDEN = BALANCE.bosses.warden;
const HIVE = BALANCE.bosses.hive;

// The title screen draws the menu crowd and no ship, so get a run going first.
game.pressMouse(640, 360);
game.step();
game.releaseMouse();

/**
 * Put the clock just before the boss is due and step until it is standing there, then give the
 * cage the moment it takes to fade up (game/bosses.js `cage.open`): a test that measures the
 * room wants the room lit and not a third of the way in.
 */
function bringItOut(index) {
  field.spawnTimer = Infinity;
  field.player.invuln = Infinity;
  // A run that got to the five-minute mark: schedule unspent, clock there. `tools/simulate.js
  // --at` does the same two things, which is the point - this is the game's own door.
  field.bossIndex = index === undefined ? 0 : index;
  field.elapsed = BALANCE.bosses.schedule[index === undefined ? 0 : index].at - 0.05;
  let guard = 0;
  while ((field.boss === null || field.boss.enemy === null) && guard < 600) { game.step(16); guard++; }
  if (field.boss === null || field.boss.enemy === null) throw new Error('the boss never arrived');
  guard = 0;
  while (cageRise(field.boss) < 1 && guard < 200) { game.step(16); guard++; }
  return field.boss;
}

/** The second boss: the Hive, which is drawn as one mass and not as a ring. */
function bringTheHiveOut() { return bringItOut(1); }

/** The third boss: the Eclipse, which is a disc of nothing with a rim and a pull. */
function bringTheEclipseOut() { return bringItOut(2); }

/** The cells of a mass that are lit for an opening. */
function litCells(boss) {
  return bossCells(boss).filter((cell) => cellOpening(cell) && cell.hp > 0);
}

/**
 * Step until the hive is lighting a cell. It turns slowly and the cells take their turns round
 * it, so this is a wait and not a nudge - and it is the honest way to catch one, because nothing
 * in here may reach into the fight and declare a beat of its own.
 */
function catchItOpening(boss) {
  let guard = 0;
  while (litCells(boss).length === 0 && guard < 900) { game.step(16); guard++; }
  // And a little way into the hold, not the first step of it: a cell begins its promise dark, so
  // the light is 0 the step it is lit (`cellProgress` of a cell that has just been chosen) and a
  // test that samples that very step sees a cell lit and not yet shining. Twelve frames of a
  // wind-up that is more than forty is still well inside the promise.
  for (let i = 0; i < 12; i++) game.step(16);
  return litCells(boss);
}

/** How many path points the last frame put within `r` px of an arena point. */
function pointsAt(x, y, r) {
  const at = game.screenOf(x, y);
  return game.points().filter((p) => Math.hypot(p.x - at.x, p.y - at.y) < r);
}

/** How many path points the last frame put at `r` px from an arena point, give or take a px. */
function pointsOn(x, y, r) {
  const at = game.screenOf(x, y);
  return game.points().filter((p) => Math.abs(Math.hypot(p.x - at.x, p.y - at.y) - r) <= 1.5);
}

/**
 * How many sprites the last frame stamped with its middle within `r` px of an arena point. The
 * log records a stamp by the corner it drew from, so the middle has to be found again from the
 * sprite's own size (render/glow.js stamps a glow centred on the point it was handed).
 */
function stampsAt(x, y, r) {
  const at = game.screenOf(x, y);
  return game.stamps().filter((s) => Math.hypot(s.at.x + s.w / 2 - at.x, s.at.y + s.h / 2 - at.y) < r).length;
}

/**
 * Park the ship beside a body of the fight and keep it there: the whole honeycomb has to be on the
 * glass to be measured (render/camera.js culls what is not, and the hive arrives 420 px from the
 * ship, which puts half of it off the window), and the mass gives ground when the ship stands this
 * close, so the parking has to be repeated every step to keep the two where they were put.
 *
 * It takes a *body* and not a fight, because since the Hive's third phase a fight can be standing
 * on three of them and the picture has to be measured one at a time.
 */
function standBesideTheMass(body) {
  const ship = field.player;
  const park = () => {
    ship.x = body.x - 220;
    ship.y = body.y;
    ship.px = ship.x;
    ship.py = ship.y;
  };
  park();
  for (let i = 0; i < 40; i++) { game.step(16); park(); }
}

/** Step until it is holding a volley, and say how many it is holding. */
function catchItHolding(boss) {
  let guard = 0;
  while (spokeCount(boss) === 0 && guard < 600) { game.step(16); guard++; }
  return spokeCount(boss);
}

/** Put it back to an ordinary run: no boss, no cage, nothing arriving. */
function clearTheSky() {
  field.boss = null;
  field.enemies.length = 0;
  field.beams.clear();
  field.particles.clear();
  field.rings.clear();
  field.texts.clear();
  field.spawnTimer = Infinity;
  // The schedule spent as well, which is the other half of what `bossDown` does. On a clock that
  // is past the boss's time a schedule left unspent opens the warning again on the next frame -
  // quite correctly, and it is why this cannot just set `world.boss` to null and call it a day.
  field.bossIndex = BALANCE.bosses.schedule.length;
  openTheField();
}

/** Hand the cage back to the arena. The framework's own door needs a live boss, so this is it. */
function openTheField() {
  const box = field.field;
  box.x0 = 0;
  box.y0 = 0;
  box.x1 = field.arena.w;
  box.y1 = field.arena.h;
}

test('a boss on the glass costs draw calls, and no blur and no gradient', () => {
  clearTheSky();
  const before = game.drawCalls();
  game.step(16);
  const plain = diff(game.drawCalls(), before);

  const boss = bringItOut();
  catchItHolding(boss);
  const withBoss = game.drawCalls();
  game.step(16);
  const fighting = diff(game.drawCalls(), withBoss);

  assert.ok(fighting.strokes > plain.strokes,
    'a boss, a cage and a volley added ' + (fighting.strokes - plain.strokes) + ' strokes');
  assert.ok(fighting.fills > plain.fills, 'the ring is not being filled at all');
  assert.equal(fighting.shadows, plain.shadows, 'something asked the canvas for a blur');
  assert.equal(fighting.gradients, plain.gradients, 'something asked the canvas for a gradient');
  clearTheSky();
});

function diff(a, b) {
  const out = {};
  for (const key of Object.keys(a)) out[key] = a[key] - b[key];
  return out;
}

test('the bar is at the top, centred, and clear of the window edge', () => {
  const layout = bossBarLayout(1280);
  assert.equal(layout.x + layout.w / 2, 640, 'the bar is not centred on the window');
  assert.ok(layout.y < 1280 * 0.15, 'the bar is not at the top of the screen');
  assert.ok(layout.x > 0 && layout.x + layout.w < 1280);

  // Narrower windows too: it gives width before it gives its own centre line.
  const narrow = bossBarLayout(600);
  assert.ok(narrow.w < 600 && narrow.x > 0);
  assert.equal(narrow.x + narrow.w / 2, 300);
});

test('while the fight is on, the bar is on the glass and says what phase it is on', () => {
  clearTheSky();
  const boss = bringItOut();
  catchItHolding(boss);

  game.step(16);
  const words = game.words();
  assert.ok(words.includes(WARDEN.name), 'the bar does not say who you are fighting');
  assert.ok(words.includes('PHASE 1/' + WARDEN.phases.length),
    'the bar does not say how far into it you are: ' + JSON.stringify(words));

  // Where it was put, and not in a corner somewhere: the name sits just above the bar.
  const texts = game.texts();
  const name = texts.find((t) => t.text === WARDEN.name);
  const bar = bossBarLayout(1280);
  assert.ok(name !== undefined);
  assert.ok(name.y < bar.y, 'the name is not above the bar it belongs to');
  assert.ok(Math.abs(name.y - (bar.y - 8)) < 1);

  // And it goes away with the fight - the body along with the fight, which is how the game does
  // it (game/bosses.js buries the body and clears `world.boss` in the same breath): a body of
  // the boss's kind left lying about with no fight to belong to is not something the frame has
  // an honest way to draw, and it is not a state a run can reach.
  clearTheSky();
  game.step(16);
  assert.equal(game.words().includes(WARDEN.name), false, 'the bar outlived the boss');
});

test('before it arrives there is a name and no bar', () => {
  clearTheSky();
  field.spawnTimer = Infinity;
  field.bossIndex = 0;
  field.elapsed = BALANCE.bosses.schedule[0].at - 0.05;
  let guard = 0;
  while (field.boss === null && guard < 60) { game.step(16); guard++; }
  assert.ok(field.boss !== null && field.boss.enemy === null, 'the warning never opened');

  game.step(16);
  const words = game.words();
  assert.ok(words.includes(WARDEN.name), 'the warning did not say who was coming');
  assert.ok(words.includes('INCOMING'));
  assert.equal(words.some((w) => w.indexOf('PHASE') === 0), false,
    'there is a hull bar for a boss that is not there yet');

  // And a line saying what it is. `blurb` sits on the boss's row next to its numbers and is the only
  // sentence the arena ever spends on a fight, so it has to actually be on the glass: the Eclipse
  // drags, and that is not a thing you can read off a shape.
  const name = game.texts().find((t) => t.text === WARDEN.name && !t.stroke);
  const line = game.texts().find((t) => t.text === WARDEN.blurb && !t.stroke);
  assert.ok(line !== undefined, 'the warning did not say what was coming: '
    + JSON.stringify(WARDEN.blurb) + ' is not on the glass');
  assert.equal(line.align, 'center');
  assert.ok(line.y > name.y && line.y - name.y < 70,
    'the line is not under the name it belongs to: ' + line.y + ' against ' + name.y);

  // And it is fitted to the window it is drawn in rather than to the width the sentence was written
  // at (render/fit.js), because a warning that runs off the edge explains nothing. Small window, same
  // warning: the words are still there and still inside the glass.
  game.setViewport(400, 300);
  game.step(16);
  const narrow = game.texts().filter((t) => t.text.indexOf('a ring that turns') === 0 && !t.stroke);
  assert.equal(narrow.length, 1, 'the line was not drawn in a small window at all');
  assert.ok(narrow[0].w <= 400 - 2 * 28,
    'the line does not fit the window it was drawn in: ' + Math.round(narrow[0].w) + ' px of 400');
  game.setViewport(1280, 720);
});

test('the cage is drawn when there is a cage', () => {
  clearTheSky();
  const plain = game.drawCalls();
  game.step(16);
  const quiet = diff(game.drawCalls(), plain);

  const boss = bringItOut();
  const caged = game.drawCalls();
  game.step(16);
  const shut = diff(game.drawCalls(), caged);

  assert.ok(shut.strokes > quiet.strokes + 4,
    'a closed room added ' + (shut.strokes - quiet.strokes) + ' strokes and a cage is at least four');
  assert.ok(shut.strokes > 8, 'the ticks are missing: ' + shut.strokes);

  // It is drawn in arena coordinates, with the camera applied, like the arena's own wall it is
  // drawn beside. The room is bigger than the window on purpose (game/balance.js `bosses.cage`),
  // so this has to go and stand against a wall for one of its edges to be on the glass at all -
  // which is the same reason a player meets a wall by walking into it.
  const box = field.field;
  field.player.x = box.x0 + field.player.r + 1;
  field.player.y = (box.y0 + box.y1) / 2;
  field.player.invuln = Infinity;
  for (let i = 0; i < 120; i++) game.step(16);   // let the camera catch up with the ship

  const want = game.screenOf(box.x0, 0).x;
  const points = game.points();
  const onALine = points.filter((p) => Math.abs(p.x - want) < 2);
  assert.ok(onALine.length > 0,
    'the cage is not drawn where the camera says the room is (' + want + ' px)');
  clearTheSky();
});

test('a held volley is drawn as wide as it hurts', () => {
  clearTheSky();
  const boss = bringItOut();
  const held = catchItHolding(boss);
  assert.ok(held > 0);

  // One spoke's telegraph, painted on a canvas of its own and counted: two strokes of light for
  // a band of the beam's own width, which is what `bandPasses` has always meant.
  const half = spokeHalf(boss);
  const enemy = boss.enemy;
  const angle = spokeAngle(boss);
  const reach = beamReach(field, enemy.x, enemy.y, Math.cos(angle), Math.sin(angle)).fore;
  const spent = game.measure((ctx) => {
    bandPasses(ctx, enemy.x, enemy.y, enemy.x + Math.cos(angle) * reach,
      enemy.y + Math.sin(angle) * reach, half, 1, '#ffffff', '#ffffff');
  });
  assert.ok(spent.strokes >= 2, 'a band is ' + spent.strokes + ' strokes');

  // And on the frame that is really being drawn, the widest stroke of the volley is exactly
  // twice the half-width the damage is measured with - the line you were shown is the line that
  // hurt, edge for edge.
  game.step(16);
  const widest = Math.max(...game.strokeWidths());
  assert.ok(widest >= half * 2, 'the widest band on the glass is ' + widest + ', the spokes are ' + half);
  clearTheSky();
});

test('a boss body is drawn as a ring and not as a drifter', () => {
  clearTheSky();
  const plain = game.drawCalls();
  game.step(16);
  const quiet = diff(game.drawCalls(), plain);

  const boss = bringItOut();
  const seen = game.drawCalls();
  game.step(16);
  const ring = diff(game.drawCalls(), seen);

  // A hoop, a rim and a flare are circles, and the crowd's bodies are polygons: an arc count is
  // the one honest way in here to tell the two apart.
  assert.ok(ring.images >= quiet.images, 'the ring is drawn with sprites and the crowd is not');
  const arcs = game.circles();
  const r = boss.enemy.r;
  // Something the size of the ring, to within a tenth of it: the hoop is drawn at the body's own
  // radius (render/boss.js), and the crowd's bodies are polygons, which draw no circles at all.
  const hoop = arcs.filter((c) => Math.abs(c.r - r) < r * 0.1);
  assert.ok(hoop.length > 0, 'nothing the size of the ring was drawn: ' + JSON.stringify(arcs.slice(0, 8)));
  clearTheSky();
});

// ---------------------------------------------------------------------------------------
// The door (game/bosses.js `windRing`, render/entities.js `drawTheDoor`): the one wedge a
// bullet ring leaves open, lit while it is being promised. It is the only place in the attack
// that is not about to hurt, so it is drawn cool and it is drawn exactly - the wedge shown is
// the wedge that arrives, edge for edge, the same promise every band in the game makes.
// ---------------------------------------------------------------------------------------

const TAU = Math.PI * 2;

/** An angle folded into [-PI, PI], which is all the door's bearings are ever compared by. */
function fold(angle) {
  let a = angle;
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

/** Step it into phase 2 and wait out the flare that opened it. */
function toPhaseTwo(boss) {
  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[1] * 0.99;
  let guard = 0;
  while (bossPhase(boss) < 2 && guard < 600) { game.step(16); guard++; }
  guard = 0;
  while (bossFlare(boss) > 0 && guard < 600) { game.step(16); guard++; }
  assert.equal(bossPhase(boss), 2, 'it never got to phase 2');
  return boss;
}

/** Step until it is standing still with a ring armed. */
function catchItArming(boss) {
  let guard = 0;
  while (armedCount(boss) === 0 && guard < 900) { game.step(16); guard++; }
  if (armedCount(boss) === 0) throw new Error('the ring never armed a volley');
  return boss;
}

/** The part-arcs drawn round the ring's own middle - the door, and nothing else the boss draws.
 *  Drawn points come back in window coordinates (the harness logs them through the camera), so
 *  the ring's own middle is asked for through `screenOf` - the same trade the cage test makes. */
function arcsRound(boss) {
  const at = game.screenOf(boss.enemy.x, boss.enemy.y);
  return game.circles().filter((c) =>
    Math.hypot(c.at.x - at.x, c.at.y - at.y) < 2 && c.to - c.from > 0 && c.to - c.from < TAU - 1e-9);
}

test('no door is on the glass while nothing is being armed', () => {
  clearTheSky();
  const boss = toPhaseTwo(bringItOut());
  assert.equal(armedCount(boss), 0, 'it came out of the flare already arming');

  game.step(16);
  assert.equal(arcsRound(boss).length, 0, 'a door is drawn for a ring nobody is throwing');
  clearTheSky();
});

test('the door is drawn exactly as wide as the ring leaves it', () => {
  clearTheSky();
  const boss = toPhaseTwo(bringItOut());
  catchItArming(boss);

  const before = game.drawCalls();
  game.step(16);
  const spent = diff(game.drawCalls(), before);
  assert.equal(spent.shadows, 0, 'something asked the canvas for a blur to light the door');
  assert.equal(spent.gradients, 0, 'something asked the canvas for a gradient to light the door');

  const half = gapHalf(boss);
  const at = gapAngle(boss);
  const enemy = boss.enemy;
  const parts = arcsRound(boss);
  const door = parts.find((c) => Math.abs((c.to - c.from) - half * 2) < 1e-9);
  assert.ok(door !== undefined,
    'nothing the width of the door was drawn: ' + JSON.stringify(parts.map((c) => [c.from, c.to])));
  assert.ok(Math.abs(fold(door.from + half - at)) < 1e-9, 'the door is drawn round the wrong bearing');

  // Its two edges are drawn down the door's own two edges, and out past the body that draws
  // them: a wedge the size of the ring would be a colour change and not a place to stand.
  const eye = game.screenOf(enemy.x, enemy.y);
  for (const edge of [at - half, at + half]) {
    const onEdge = game.points().some((p) => {
      const d = Math.hypot(p.x - eye.x, p.y - eye.y);
      return d > enemy.r && Math.abs(fold(Math.atan2(p.y - eye.y, p.x - eye.x) - edge)) < 1e-6;
    });
    assert.ok(onEdge, 'the door was not edged along ' + edge.toFixed(3) + ' rad');
  }

  // And the whole of it is inside the room the fight is being fought in: the reach is clipped to
  // the cage (game/field.js), so it never promises a place the ship cannot get to. The room's own
  // edges are asked for through `screenOf` because that is where the drawn points are.
  const box = field.field;
  const near = game.screenOf(box.x0, box.y0);
  const off = game.screenOf(box.x1, box.y1);
  for (const p of game.points()) {
    const d = Math.hypot(p.x - eye.x, p.y - eye.y);
    if (d <= enemy.r || Math.abs(fold(Math.atan2(p.y - eye.y, p.x - eye.x) - at)) > half) continue;
    assert.ok(p.x >= near.x - 1 && p.x <= off.x + 1 && p.y >= near.y - 1 && p.y <= off.y + 1,
      'the door reaches outside the room');
  }
  clearTheSky();
});

// ---------------------------------------------------------------------------
// The call's marks (game/bosses.js `windCall`, render/entities.js `drawTheCall`)
// ---------------------------------------------------------------------------

/** Step it into phase 3 and wait out the flare that opened it. */
function toPhaseThree(boss) {
  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[2] * 0.99;
  let guard = 0;
  while (bossPhase(boss) < 3 && guard < 600) { game.step(16); guard++; }
  guard = 0;
  while (bossFlare(boss) > 0 && guard < 600) { game.step(16); guard++; }
  assert.equal(bossPhase(boss), 3, 'it never got to phase 3');
  return boss;
}

/** Step until it is standing still with a call lit on the rim. */
function catchItCalling(boss) {
  let guard = 0;
  while (callCount(boss) === 0 && guard < 1500) { game.step(16); guard++; }
  if (callCount(boss) === 0) throw new Error('the ring never made a call');
  return boss;
}

/**
 * The marks on the glass: whole circles standing `callStand` px outside the hoop, one per body
 * the call will send, each drawn at `callBody` - the radius of the body that will arrive at it.
 *
 * Whole is what tells them from the door's rim, which is a part-arc round the ring's own middle;
 * the distance is what tells them from everything the ring draws on itself; the size is what
 * tells them from the dozen small circles a busy frame happens to be drawing at that distance.
 * Distances come from the ring's middle *on the glass*, because that is where the drawn points
 * are (the camera and the device ratio are already in them).
 */
function marksOnTheGlass(boss) {
  const enemy = boss.enemy;
  const body = callBody(boss);
  const eye = game.screenOf(enemy.x, enemy.y);
  const want = enemy.r + callStand(boss);
  const out = [];
  for (const c of game.circles()) {
    const dx = c.at.x - eye.x;
    const dy = c.at.y - eye.y;
    const d = Math.hypot(dx, dy);
    if (Math.abs(d - want) > 1) continue;
    if (c.to - c.from < TAU - 1e-9) continue;
    if (Math.abs(c.r - body) > 1e-9) continue;
    out.push({ bearing: Math.atan2(dy, dx), out: d, r: c.r });
  }
  return out;
}

/** The bearings the bodies will be sent from, which is the promise the marks must match. */
function promisedBearings(boss) {
  const middle = (callCount(boss) - 1) / 2;
  const out = [];
  for (let i = 0; i < callCount(boss); i++) out.push(callAngle(boss) + (i - middle) * callStep(boss));
  return out;
}

/**
 * Park the ship a known distance to the left of the ring and let the camera settle, before the
 * call is caught: a mark that is off the glass is culled like everything else (render/camera.js)
 * and a test that counts marks has to be looking at a ring that is entirely on it. The fan is
 * centred on the bearing away from the ship, i.e. to the right, so all three of them sit well
 * inside the window. The ship has no controls and no engines on, so it stays where it is put and
 * the camera - which follows the ship one for one - stays settled with it.
 */
function standBesideTheRing(boss) {
  const ship = field.player;
  const park = () => {
    ship.x = boss.enemy.x - 240;
    ship.y = boss.enemy.y;
    ship.px = ship.x;
    ship.py = ship.y;
  };
  park();
  for (let i = 0; i < 40; i++) { game.step(16); park(); }
}

test('no marks are on the glass while no call is being made', () => {
  clearTheSky();
  const boss = toPhaseThree(bringItOut());
  standBesideTheRing(boss);
  assert.equal(callCount(boss), 0, 'it came out of the flare already making a call');

  game.step(16);
  assert.equal(marksOnTheGlass(boss).length, 0, 'a mark is lit for a call nobody is making');
  clearTheSky();
});

test('a call lights one mark per body, on the bearings it sends them from', () => {
  clearTheSky();
  const boss = toPhaseThree(bringItOut());
  standBesideTheRing(boss);
  catchItCalling(boss);

  const before = game.drawCalls();
  game.step(16);
  const spent = diff(game.drawCalls(), before);
  assert.equal(spent.shadows, 0, 'something asked the canvas for a blur to light the call');
  assert.equal(spent.gradients, 0, 'something asked the canvas for a gradient to light the call');

  const found = marksOnTheGlass(boss);
  assert.equal(found.length, callCount(boss), 'the ring lit ' + found.length + ' marks for a call of '
    + callCount(boss) + ': ' + JSON.stringify(found.map((m) => [m.bearing.toFixed(2), m.r])));
  assert.equal(callBody(boss), BALANCE.kinds[WARDEN.phases[2].call.type].radius,
    'the marks are not drawn the size of the bodies they promise');

  const promised = promisedBearings(boss);
  for (const mark of found) {
    const on = promised.some((a) => Math.abs(fold(mark.bearing - a)) < 1e-6);
    assert.ok(on, 'a mark was lit on ' + mark.bearing.toFixed(3)
      + ' rad, which is not a bearing the call will use');
  }

  // And they are warm: a mark is a place a body arrives at, which is the opposite of the door
  // (PLAN section 4). The phase tint is what the bar, the spokes and the shots all wear.
  assert.notEqual(bossTint(boss), PALETTE.bossGap, 'the phase tint is the door\'s cool blue');
  clearTheSky();
});

// ---------------------------------------------------------------------------
// The Hive: the same three claims, about a boss that is not a ring
// ---------------------------------------------------------------------------

test('the hive is drawn as a mass of hexes, each one exactly as big as it hurts', () => {
  clearTheSky();
  const boss = bringTheHiveOut();
  standBesideTheMass(boss.enemy);
  const before = game.drawCalls();
  game.step(16);
  const spent = diff(game.drawCalls(), before);

  assert.ok(spent.strokes > 0 && spent.fills > 0, 'the mass was not drawn at all');
  assert.equal(spent.shadows, 0, 'the mass asked the canvas for a blur');
  assert.equal(spent.gradients, 0, 'the mass asked the canvas for a gradient');

  // The one claim every telegraph in this game is held to, turned round and pointed at a body: the
  // shape you can shoot is the shape you can see, edge for edge. A cell's collision radius is its
  // own - it is a body of the crowd - and the hexagon drawn at it has six corners exactly that far
  // out, and nothing of the mass is drawn further out than the bodies that hurt you.
  for (const cell of bossCells(boss)) {
    const on = pointsOn(cell.x, cell.y, cell.r);
    assert.ok(on.length >= 6,
      'a cell was drawn with ' + on.length + ' corners on its own radius of ' + cell.r + 'px, not six');
  }
  clearTheSky();
});

test('a cell that has been shot off is not drawn any more', () => {
  clearTheSky();
  const boss = bringTheHiveOut();
  standBesideTheMass(boss.enemy);
  const cell = bossCells(boss)[0];

  // Asked at the cell's own middle, and narrowly: the wax web runs out to the centre of every cell
  // that is standing, so a living cell has a point of the pen on this spot and a dead one has
  // nothing of its own here at all. The window is deliberately much smaller than the gap to the
  // next hex over, or a neighbour's edge would be blamed for the ghost of the cell that went.
  const CELL_MARK = 12;
  assert.ok(pointsAt(cell.x, cell.y, CELL_MARK).length > 0, 'nothing was drawn where it stood');
  damageEnemy(field, cell, cell.hp, true);
  standBesideTheMass(boss.enemy);

  // The hole is the whole of the art for a broken mass, so it has to actually be a hole.
  assert.equal(pointsAt(cell.x, cell.y, CELL_MARK).length, 0,
    'a cell that is gone is still being drawn');
  clearTheSky();
});

test('the cell that is opening is lit and the ones that are not are dark', () => {
  clearTheSky();
  const boss = bringTheHiveOut();
  standBesideTheMass(boss.enemy);
  const open = catchItOpening(boss);
  assert.ok(open.length > 0, 'the hive never lit a cell to open it');

  const dark = bossCells(boss).filter((cell) => cell.hp > 0 && !cellOpening(cell));
  assert.ok(dark.length > 0, 'every cell lit at once, so there is nothing to compare against');
  assert.ok(open.length < bossCells(boss).length, 'every cell is opening, so the tell tells nothing');

  // A cell that is opening wears the mouth as well as the honey: one more stamp on the glass, at
  // the place the brood will come out of. That is the whole of its promise, and it is on the body
  // that makes it, told the way every other body tells one (game/kinds.js `aimProgress`).
  const lit = stampsAt(open[0].x, open[0].y, open[0].r);
  const calm = stampsAt(dark[0].x, dark[0].y, dark[0].r);
  assert.ok(lit > calm,
    'an opening cell wore ' + lit + ' lights and a whole one ' + calm);
  clearTheSky();
});

// ---------------------------------------------------------------------------
// The Hive's third phase: one fight, three bodies, and one bar still over all of them
// ---------------------------------------------------------------------------

/**
 * How near a body's middle a stamp has to be to be counted as one of *its own* lights. A mass
 * wears two, both painted at its centre (render/boss.js): the halo of the whole honeycomb and the
 * countdown burning in the core.
 */
const OWN_LIGHT = 6;

/** The Hive at its last phase, which is the phase that asks for the `split` row. */
const HIVE_SPLIT = HIVE.phases[HIVE.phases.length - 1].split;

/**
 * Break the hive open on the glass: the hull to just under the last mark, and the flare and the
 * coming apart run out. Counted in frames and not in seconds, because the split stops the world
 * for a moment of its own and a step the world does not run is not a step the fight spent.
 */
function breakTheHiveOpen(boss) {
  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[2] * 0.99;
  let guard = 0;
  while (bossCores(boss).length < 2 && guard < 900) { game.step(16); guard++; }
  return bossCores(boss);
}

test('a fight that has come apart is drawn as three hives and not one with bits falling off', () => {
  clearTheSky();
  const boss = bringTheHiveOut();
  const cores = breakTheHiveOpen(boss);
  assert.equal(cores.length, HIVE_SPLIT.cores, 'it did not come apart on the glass');

  // The shape you can shoot is the shape you can see, three times over: each body of the fight
  // wears a mass of its own, at its own place, with a honeycomb of its own drawn on its own cells'
  // own radii. One blob with pieces falling off it would pass for a picture and be a lie about the
  // collision world, which is the one rule this file exists to keep.
  for (const core of cores) {
    standBesideTheMass(core.enemy);
    assert.equal(coreCells(core).length, HIVE_SPLIT.cells.count,
      'a piece was drawn with the wrong number of cells round it');
    const own = stampsAt(core.enemy.x, core.enemy.y, OWN_LIGHT);
    assert.ok(own >= 2, 'a piece wore ' + own + ' lights of its own and a mass wears a halo and a core');
    for (const cell of coreCells(core)) {
      const on = pointsOn(cell.x, cell.y, cell.r);
      assert.ok(on.length >= 6,
        'a piece\'s cell was drawn with ' + on.length + ' corners on its own radius of '
          + cell.r + 'px, not six');
    }
    // And the mass drawn here is *this* body's: the frame asks which body of the fight it is
    // looking at (game/bosses.js `bossCoreOf`) rather than drawing the first one three times.
    assert.equal(bossCoreOf(boss, core.enemy), core);
  }

  // One bar, one name, one phase: the glass says one fight even though the room has three bodies
  // in it now. The numbers behind that are test/hive.test.mjs's; this is the sentence under them.
  game.step(16);
  const words = game.words();
  assert.ok(words.includes(HIVE.name), 'the bar stopped saying who the fight is');
  assert.ok(words.includes('PHASE ' + bossPhase(boss) + '/' + HIVE.phases.length),
    'the bar does not say how far into it the fight is: ' + JSON.stringify(words));
  clearTheSky();
});

// ---------------------------------------------------------------------------
// The Eclipse: a rim round a hole, and a pull that is drawn rather than explained
// ---------------------------------------------------------------------------

/**
 * Park the ship in the middle of the room the fight is being held in, and stand the sun 360 px east
 * of it. That is inside the band the sun holds, so it stays where it is put, and it leaves every part
 * of the picture out in open sky: a ring can be measured round the body without the cage's own wall
 * crossing into it, which is the difference between this and `standBesideTheMass` - the ship is being
 * dragged the whole time, so both of them are re-parked on every step.
 */
function standBesideTheSun(boss) {
  const body = boss.enemy;
  const box = field.field;
  const ship = field.player;
  const park = () => {
    ship.x = (box.x0 + box.x1) / 2;
    ship.y = (box.y0 + box.y1) / 2;
    ship.px = ship.x;
    ship.py = ship.y;
    body.x = ship.x + 360;
    body.y = ship.y;
    body.px = body.x;
    body.py = body.y;
  };
  park();
  for (let i = 0; i < 40; i++) { game.step(16); park(); }
}

/** Every circle the last frame drew round the sun's own middle - whole ones included, unlike
 *  `arcsRound`, which is looking for a door and so only wants part-arcs. */
function circlesRound(boss) {
  const at = game.screenOf(boss.enemy.x, boss.enemy.y);
  return game.circles().filter((c) => Math.hypot(c.at.x - at.x, c.at.y - at.y) < 2);
}

/** How many path points the last frame put between `from` and `to` shares of a body's radius. */
function pointsRound(x, y, radius, from, to) {
  const at = game.screenOf(x, y);
  return game.points().filter((p) => {
    const off = Math.hypot(p.x - at.x, p.y - at.y);
    return off > radius * from && off < radius * to;
  });
}

/** Step until it is riding and so drawing nothing but itself. */
function catchItRiding(boss) {
  let guard = 0;
  while (armedCount(boss) > 0 && guard < 900) { game.step(16); guard++; }
  assert.equal(armedCount(boss), 0, 'it never stopped arming a shell');
}

test('the dark sun is a rim round a hole, and the rim is where it hurts', () => {
  clearTheSky();
  const boss = bringTheEclipseOut();
  const sun = boss.enemy;
  standBesideTheSun(boss);
  catchItRiding(boss);

  const before = game.drawCalls();
  game.step(16);
  const spent = diff(game.drawCalls(), before);
  assert.ok(spent.strokes > 0 && spent.fills > 0, 'the sun was not drawn at all');
  assert.equal(spent.shadows, 0, 'the sun asked the canvas for a blur');
  assert.equal(spent.gradients, 0, 'the sun asked the canvas for a gradient');

  // The shape you can shoot is the shape you can see, held to a body that is a hole instead of a
  // hull: the edge of the disc is drawn at the radius the body is hurt by, within a tenth of it,
  // which is where the Warden puts its hoop and for the same reason.
  const r = sun.r;
  const round = circlesRound(boss);
  const rim = round.filter((c) => Math.abs(c.r - r) < r * 0.1);
  assert.ok(rim.length > 0, 'nothing the size of the sun was drawn: '
    + JSON.stringify(round.map((c) => c.r.toFixed(1))));

  // And the disc of it is painted *over* the sky, not added to it. The whole arena pass is additive
  // (render/renderer.js), so a dark fill laid down additively is a faint violet smear with the stars
  // still shining through it rather than the hole this boss is; the only way to ask that question with
  // no pixels to look at is which composite the arc was asked for under. The rim next to it is light
  // and must still be added, so the two of them have to disagree - a blanket `source-over` over the
  // body would be a black disc with no corona on it.
  assert.ok(rim.some((c) => c.mode !== 'lighter'),
    'the sun was painted onto the sky instead of cut out of it: '
    + JSON.stringify(rim.map((c) => c.mode)));
  assert.ok(rim.some((c) => c.mode === 'lighter'),
    'the rim went dark with the disc: ' + JSON.stringify(rim.map((c) => c.mode)));

  // And inside that edge there is nothing at all - no hub, no honeycomb, no spokes. The ring and the
  // mass both paint a body in the middle of theirs; the Eclipse paints one pinprick of light, and
  // that is a stamp and not a shape. A dark sun with something drawn in the middle of it is just
  // another boss with a black coat on.
  const inside = pointsRound(sun.x, sun.y, r, 0.2, 0.75);
  assert.equal(inside.length, 0,
    'something was drawn inside the sun: ' + JSON.stringify(inside.map((p) => [p.x, p.y])));
  clearTheSky();
});

test('the pull it spends on the ship is drawn, as light falling in', () => {
  clearTheSky();
  const boss = bringTheEclipseOut();
  const sun = boss.enemy;
  standBesideTheSun(boss);
  catchItRiding(boss);
  const r = sun.r;

  // The drag is the one thing about this boss that is not a shot, so it is the one thing that has to
  // be drawn rather than promised: ticks of pale light outside the rim, streaming inward across the
  // corona. They are counted over eight frames because they are *moving* - one frame can catch the
  // whole ring of them at the far edge and faint - and the claim is that something is always out
  // there. Nothing else the sun wears is painted past its own edge, so whatever is in that ring is
  // the pull: the hole in the middle of the body is the test above, and the cage is out of range by
  // how the ship and the sun were put down.
  let least = Infinity;
  for (let i = 0; i < 8; i++) {
    game.step(16);
    standBesideTheSun(boss);
    least = Math.min(least, pointsRound(sun.x, sun.y, r, 1.05, 1.6).length);
  }
  assert.ok(least > 0, 'nothing was drawn out where the drag is spent');
  clearTheSky();
});
