// The build rail: what the run is built out of, down the left edge of the window.
//
// PLAN section 4 asks for "small icons for owned upgrades down the left edge", and the reason a
// player wants it is the reason the game needs it: a run that has taken eight cards has to be able
// to see what it has, not only what it is being offered next. So the rail lists one row per line
// the run owns, in the order the deck lists them, wearing the mark the card sold it in
// (render/icons.js is the one place those marks are drawn, for exactly that reason), and tells how
// deep the run went in each with a pip for every rank that line has - five for everything in the
// deck except the one synergy a run finds on its own, which goes one rank deep.
//
// Four promises hold it up:
//
//   a line the run does not own is not on the rail at all, and an empty rail costs a frame nothing;
//   the rows are the deck's own order, so the rail reads like the rack does;
//   a row costs one mark and its row of pips whatever its rank is, and the whole rail builds no
//     sprite, no gradient, no blur and no word: it is a list of shapes, not a second screen of
//     text the player has to read while flying;
//   and three lines - the nova, the mines, the turret - hand a thing out on a wait the arena cannot
//     show, so their rows wear an arc that closes over the wait, the same message the dash's
//     cooldown ring round the ship gives (render/entities.js).
//
// It also has to fit: the marks shrink with a short window and the rail wraps into another column
// before it would ever cut a line off, because a run's build is never the thing that gets cropped.
//
// Same instrument as the art files: boot the real game through the headless harness, paint real
// frames (tools/headless/harness.js), and measure where the frame put its marks - which is what
// `buildRailLayout` is exported for (render/hud.js): painter and test must never disagree about
// where a row is. One device pixel to the CSS pixel, so a mark can be compared with the layout
// without a scale factor in the way.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { buildRailLayout, pipsOf } from '../src/render/hud.js';
import { view } from '../src/render/canvas.js';
import { stats as glowStats } from '../src/render/glow.js';
import { LINES, maxRanksOf } from '../src/game/upgrades.js';
import { BALANCE } from '../src/game/balance.js';
import { clearToasts } from '../src/render/toast.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 71, dpr: 1 });
const field = game.world;
const PIP_TOUCH = 2.5;        // a pip is drawn within this many px of its own centre
const TAU = Math.PI * 2;
// The lines whose beat the arena cannot show: a nova front is in the air and gone, a row of mines
// falls out behind the ship, and the gap after the last crew goes out is nothing at all to look at.
const WAITED = ['nova', 'mines', 'turret'];

// A run under way, and a sky nobody else is filling: the rail lists a build, so this file needs a
// run that is playing and nothing in the way of it.
game.pressMouse(640, 360);
game.step();
game.releaseMouse();
game.step();
field.enemies.length = 0;
field.spawnTimer = Infinity;
field.player.invuln = Infinity;

/** Wear `build` - { line: rank } - and nothing else, then let the world settle onto it. */
function take(build) {
  for (const line of LINES) field.upgrades[line.id] = 0;
  for (const id of Object.keys(build)) field.upgrades[id] = build[id];
  game.step();
  game.step();
  // A build worth an award wins one, and its plate would be drawn over the rail this file is
  // measuring (game/awards.js, render/toast.js). The plate has tests of its own (test/awards-art).
  clearToasts();
}

/** The lines a build lists, in the deck's order: what the rail has rows for. */
function listed(build) {
  return LINES.filter((line) => (build[line.id] || 0) > 0);
}

/** Paint one frame and say what it cost, and where it put its marks. */
function frame() {
  const before = game.drawCalls();
  const beforeBakes = game.bakeCalls().canvases;
  game.step();
  const after = game.drawCalls();
  return {
    fills: after.fills - before.fills,
    strokes: after.strokes - before.strokes,
    images: after.images - before.images,
    texts: after.texts - before.texts,
    gradients: after.gradients - before.gradients,
    shadows: after.shadows - before.shadows,
    baked: game.bakeCalls().canvases - beforeBakes,
    stamps: game.stamps(),
    circles: game.circles(),
    points: game.points(),
    words: game.words(),
  };
}

/** Where the rows land for a build, in the window the game is actually in. */
const rows = (count) => buildRailLayout(count, view.W, view.H);
const apart = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** The stamps whose centre landed on a row: a row's mark is one sprite, centred on the row. */
function marksOn(stamps, place) {
  return stamps.filter((s) => apart({ x: s.at.x + s.w / 2, y: s.at.y + s.h / 2 }, place) < place.stride * 0.6);
}

/**
 * The wait ring's arcs: the circles drawn at the ring's own radius and centred on the row. Nothing
 * of a mark itself reaches that far out - the mark is drawn inside `ring` - so an arc here is the
 * ring and nothing else.
 */
function ringOn(circles, place) {
  return circles.filter((c) => apart(c.at, place) < 0.5 && Math.abs(c.r - place.ring) < 0.01);
}

/**
 * The pips that were actually drawn, out of the `ranks` the row has to show: a pip is four short
 * lines round its own centre, so a pip is here when a path point landed on it (render/hud.js
 * `pipsOf` says where it would be).
 */
function pipsOn(points, place, ranks) {
  const band = bandOf(points, place);
  return pipsOf(place, ranks).filter((pip) => band.some((x) => Math.abs(x - pip) < PIP_TOUCH)).length;
}

/** Path points down the row past its last pip: the place a rank the line does not have would be. */
function pastTheLastPip(points, place, ranks) {
  const last = pipsOf(place, ranks)[ranks - 1];
  return bandOf(points, place).filter((x) => x > last + PIP_TOUCH * 2).length;
}

const bandOf = (points, place) => points
  .filter((q) => Math.abs(q.y - place.y) < place.stride * 0.4 && q.x > place.pips - 4)
  .map((q) => q.x);

/** How far a frame's ring had closed: 0 when the ring is a bare track and nothing more. */
function closing(f, place) {
  let widest = 0;
  for (const arc of ringOn(f.circles, place)) {
    if (arc.to - arc.from < TAU - 0.01) widest = Math.max(widest, arc.to - arc.from);
  }
  return widest;
}

const WHOLE_DECK = (() => {
  const all = {};
  for (const line of LINES) all[line.id] = 1;
  return all;
})();

test('a run that has taken nothing leaves the left edge to the sky', () => {
  take({});
  const empty = frame();

  for (const place of rows(4)) {
    assert.equal(marksOn(empty.stamps, place).length, 0,
      'nothing was stamped at ' + place.y.toFixed(0) + ' px down the rail');
  }
});

test('one row per line the run owns, one mark per row', () => {
  const build = { damage: 1, nova: 2, turret: 3 };
  take(build);
  const lines = listed(build);
  const places = rows(lines.length);
  const painted = frame();

  for (let i = 0; i < lines.length; i++) {
    assert.equal(marksOn(painted.stamps, places[i]).length, 1,
      lines[i].name + ' wears exactly one mark, at ' + places[i].y.toFixed(0) + ' px down');
  }
  assert.equal(marksOn(painted.stamps, rows(lines.length + 1)[lines.length]).length, 0,
    'and nothing is painted where a fourth row would have been');
});

test('the rows come in the order the deck lists its lines, not the order they were taken in', () => {
  // Turret first, then nova, then damage. A rail that listed the build in the order it was filled
  // in would ring the first two rows; the deck puts the gun lines above the nova and the nova above
  // the turret, so the ringed rows are the last two (game/upgrades.js).
  const build = { turret: 1, nova: 1, damage: 1 };
  take(build);
  const places = rows(3);
  const painted = frame();

  assert.deepEqual(places.map((p) => ringOn(painted.circles, p).length > 0), [false, true, true],
    'the gun line wears no ring and the nova and the turret do');
});

test('a rank is told by a pip, and the row costs the same at every rank', () => {
  const ranks = maxRanksOf('damage');
  take({ damage: 1 });
  const place = rows(1)[0];
  const first = frame();
  assert.equal(pipsOn(first.points, place, ranks), ranks,
    'one shape per rank the line has, taken or not: the row says how deep it goes');
  assert.equal(pastTheLastPip(first.points, place, ranks), 0, 'and exactly that many of them');

  // One mark for the row whatever the rank, because a taken pip is a fill and a rank still to come
  // is an outline of the same shape: a maxed line is no dearer than a line that was just taken.
  for (const rank of [2, 3, 4, ranks]) {
    take({ damage: rank });
    const cost = frame();
    assert.equal(cost.images, first.images,
      'rank ' + rank + ' costs the same lights as rank 1: ' + cost.images + ' against ' + first.images);
    assert.equal(pipsOn(cost.points, place, ranks), ranks, 'and the same row of pips');
  }
});

test('a line with one rank to it wears one pip', () => {
  // The synergy the run finds on its own rather than being offered (game/synergies.js) goes one
  // rank deep, and the row says so: a full row of five would promise four ranks nobody can take.
  take({ thermalShock: 1 });
  const place = rows(1)[0];
  const painted = frame();

  assert.equal(maxRanksOf('thermalShock'), 1, 'the line is one rank deep');
  assert.equal(pipsOn(painted.points, place, 1), 1, 'and wears one pip');
  assert.equal(pastTheLastPip(painted.points, place, 1), 0, 'and nothing where a second would be');
});

test('the three lines that wait on a beat wear a ring, and the rest wear none', () => {
  const build = { nova: 1, mines: 1, turret: 1, damage: 1, orbitals: 1 };
  take(build);
  const lines = listed(build);
  const places = rows(lines.length);
  const painted = frame();

  for (let i = 0; i < places.length; i++) {
    const ringed = ringOn(painted.circles, places[i]).length > 0;
    assert.equal(ringed, WAITED.includes(lines[i].id),
      lines[i].name + (ringed ? ' wears a ring' : ' wears no ring') +
      ' (' + ringOn(painted.circles, places[i]).length + ' arcs)');
  }
});

test('the ring closes over the wait, which is the whole message', () => {
  take({ mines: 1 });
  const place = rows(1)[0];
  const cycle = BALANCE.upgrades.mines.cycle;

  // A whole cycle to go: the ring is a track, and a row that has just fallen out has nothing the
  // player is being asked to wait on.
  field.mines.wait = cycle;
  const early = closing(frame(), place);

  // Three quarters of the way through: three quarters round, in both of the ring's two passes - the
  // wide faint one under the thin bright one, which is how anything here shines (render/glow.js).
  field.mines.wait = cycle * 0.25;
  const late = closing(frame(), place);

  assert.ok(early < 0.1, 'a wait that has barely started has nothing to close: ' + early.toFixed(3) + ' rad');
  assert.ok(Math.abs(late - TAU * 0.75) < 0.1,
    'three quarters of the way round: ' + late.toFixed(3) + ' rad of ' + TAU.toFixed(2));
});

test('the rail is shapes and no words', () => {
  take({});
  const bare = frame().words.length;
  take({ damage: 2 });
  const painted = frame();

  assert.equal(painted.words.length, bare, 'the rail wrote nothing down: a build is read as a column'
    + ' of marks, not read while flying');
  assert.equal(painted.gradients, 0, 'nothing built a gradient');
  assert.equal(painted.shadows, 0, 'nothing asked the canvas for a blur');
});

test('a line at the top of its ranks still wears its mark', () => {
  // Nothing may treat a maxed line as spent and let its row drop off: the rail is what the run is,
  // and a maxed line is the most of it.
  const maxed = { magnetar: maxRanksOf('magnetar') };
  take(maxed);
  const place = rows(1)[0];
  const painted = frame();

  assert.equal(field.upgrades.magnetar, maxRanksOf('magnetar'), 'the line is maxed');
  assert.equal(marksOn(painted.stamps, place).length, 1, 'and it is still on the rail');
});

test('the rail asks for its sprites once, however many lines it lists', () => {
  take({});
  frame();
  const before = glowStats().sprites;

  take(WHOLE_DECK);
  frame();

  assert.ok(glowStats().sprites - before <= LINES.length,
    'every line in the deck meeting the rail builds at most its own mark: +' +
    (glowStats().sprites - before) + ' sprites for ' + LINES.length + ' lines');
  assert.equal(frame().baked, 0, 'and the next frame builds nothing at all');
  assert.equal(frame().gradients, 0, 'or builds a gradient');
  assert.equal(frame().shadows, 0, 'or a blur');
});

test('every row fits, however short the window is', () => {
  for (const [w, h] of [[1280, 720], [900, 560], [560, 420]]) {
    game.setViewport(w, h);
    take(WHOLE_DECK);
    const lines = listed(WHOLE_DECK);
    const places = rows(lines.length);
    const painted = frame();

    for (let i = 0; i < places.length; i++) {
      const place = places[i];
      assert.ok(place.y - place.ring > 0 && place.y + place.ring < h,
        'row ' + i + ' is inside a ' + h + ' px window: ' + place.y.toFixed(1) + ' px');
      assert.ok(place.pips + 26 < w / 2,
        'and the rail has not eaten more than half of a ' + w + ' px window: ' + place.pips.toFixed(1) + ' px');
      assert.equal(marksOn(painted.stamps, place).length, 1,
        'at ' + w + 'x' + h + ' every line still wears its mark (' + i + ')');
      const ranks = maxRanksOf(lines[i].id);
      assert.equal(pipsOn(painted.points, place, ranks), ranks, 'and tells its ranks');
    }
    assert.ok(places[0].stride >= 15, 'the rows shrink, but never past being marks: ' + places[0].stride);
  }

  // A short window and a long build: the rail wraps into a second column rather than cut lines off.
  game.setViewport(480, 360);
  take(WHOLE_DECK);
  const places = rows(LINES.length);
  const columns = new Set(places.map((p) => Math.round(p.x))).size;
  assert.ok(columns > 1, 'a 480x360 window with the whole deck wraps into columns');
  assert.equal(new Set(places.map((p) => Math.round(p.y))).size, Math.ceil(LINES.length / columns),
    'and it fills the first column before starting the next');
  assert.equal(frame().baked, 0, 'and wrapping costs nothing new either');

  game.setViewport(1280, 720);
});
