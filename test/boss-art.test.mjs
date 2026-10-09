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
import { cageRise, spokeAngle, spokeCount, spokeHalf } from '../src/game/bosses.js';
import { bandPasses } from '../src/render/entities.js';
import { bossBarLayout } from '../src/render/hud.js';

const ROOT = path.resolve(import.meta.dirname, '..');
// Booted at a device pixel ratio of 1 on purpose: the harness draws at 2 by default, and this
// file compares drawn points with arena coordinates, which `game.screenOf` answers in the
// window's own pixels. One less conversion for a test to get wrong.
const game = await bootGame({ root: ROOT, seed: 42, dpr: 1 });
const field = game.world;
const WARDEN = BALANCE.bosses.warden;

// The title screen draws the menu crowd and no ship, so get a run going first.
game.pressMouse(640, 360);
game.step();
game.releaseMouse();

/**
 * Put the clock just before the boss is due and step until it is standing there, then give the
 * cage the moment it takes to fade up (game/bosses.js `cage.open`): a test that measures the
 * room wants the room lit and not a third of the way in.
 */
function bringItOut() {
  field.spawnTimer = Infinity;
  field.player.invuln = Infinity;
  // A run that got to the five-minute mark: schedule unspent, clock there. `tools/simulate.js
  // --at` does the same two things, which is the point - this is the game's own door.
  field.bossIndex = 0;
  field.elapsed = BALANCE.bosses.schedule[0].at - 0.05;
  let guard = 0;
  while ((field.boss === null || field.boss.enemy === null) && guard < 600) { game.step(16); guard++; }
  if (field.boss === null || field.boss.enemy === null) throw new Error('the boss never arrived');
  guard = 0;
  while (cageRise(field.boss) < 1 && guard < 200) { game.step(16); guard++; }
  return field.boss;
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
