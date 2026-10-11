// The developer's panel (PLAN milestone 10): F3 puts up frame time, entity counts, and pool usage.
//
// Four promises hold this feature together, and each has its tests below.
//
// 1. **It is a key.** F3 answers on every screen - the title, a fight, the cards, an ending - once
//    per press, and one press per auto-repeat like every other key in the game (input/keyboard.js).
// 2. **It says what the world is, right now.** Every number on it is read out of the world, the
//    pools, the grid, and the sprite cache at the moment the frame is painted, so a body planted is a
//    body counted and a shot in the air is a shot counted. Nothing is kept that could go stale.
// 3. **It cannot move a run.** It is frame state (render/debug.js): the frame timings come from
//    `performance.now()` and are only ever drawn, so the same seed plays the same run with the panel
//    on and with it off. That is the same promise test/rng.test.mjs makes about the drawing, and it
//    is what makes the panel an instrument rather than a second player.
// 4. **Nothing about it is kept.** Off at every page load, and never written to the save, because a
//    tool that quietly changes what the next visitor sees is a tool nobody trusts.
//
// The plate itself is measured the way the mixer readout and the upgrade cards are
// (test/volume.test.mjs, test/card-fit.test.mjs): `debugLayout` does the arithmetic and hands back
// boxes and words, so a test with no pixels can still say where everything landed - and whether it
// landed inside the window.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { playOneRun, endingItAt, startBotRun } from '../tools/headless/bot.js';
import { makeEnemy } from '../src/game/kinds.js';
import { pauseRun, resumeRun } from '../src/game/run.js';
import { bodyCeiling } from '../src/game/waves.js';
import { STATE } from '../src/game/state.js';
import { world } from '../src/game/world.js';
import {
  POOLS, debugLayout, drawDebug, frameCosts, noteFrame, panelIsUp, resetCosts, samplesTaken,
} from '../src/render/debug.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
/** px of the window the XP bar and its label keep (render/hud.js draws the bar at `H - 34`). */
const XP_ROOM = 34;

const game = await bootGame({ root: ROOT, seed: 20261006 });

/** One press of F3, down and up, the way a finger does it. */
function tapDebug() {
  game.key('F3', true);
  game.key('F3', false);
}

function wait(frames) {
  for (let i = 0; i < frames; i++) game.step(FRAME);
}

/** Put the panel where the test needs it, through the key and not behind its back. */
function showPanel(on) {
  let presses = 0;
  while (panelIsUp() !== on && presses < 3) {
    tapDebug();
    presses++;
  }
  assert.equal(panelIsUp(), on, 'F3 stopped answering after ' + presses + ' presses');
  wait(1);
}

/** Every word the last frame painted, as one string to search. */
function painted() {
  return game.words().join('\n');
}

/**
 * The plate split into its sections: `{ FRAMES: Map, ARENA: Map, ... }`, with the headings in order
 * on `.heads`.
 *
 * Read without painting anything: `debugLayout` is arithmetic on the world as it stands, which is
 * what lets a test plant five bodies and ask the plate about them between two frames. A label may
 * appear in two sections - `sparks` is both a count of what is standing and a pool's own row - and
 * this keeps the two apart, which is the whole reason the sections exist.
 */
function sections(layout) {
  const out = new Map();
  const heads = [];
  let bucket = new Map();
  for (const line of (layout || debugLayout()).lines) {
    if (line.kind === 'head') {
      heads.push(line.text);
      bucket = out.get(line.text) || new Map();
      out.set(line.text, bucket);
      continue;
    }
    for (const cell of line.cells) bucket.set(cell.label, cell.value);
  }
  out.heads = heads;
  return out;
}

/** One section of the plate, and a plain word if it is missing. */
function section(name) {
  const seen = sections().get(name);
  assert.ok(seen !== undefined, 'the plate has no ' + name + ' section');
  return seen;
}

test('the panel is off when the page opens, and nothing of it is painted', () => {
  // First test in the file on purpose: "off at boot" is a fact about the boot, and every test after
  // this one puts the panel up.
  assert.equal(panelIsUp(), false);
  assert.equal(game.stats().debugUp, false);
  wait(20);
  assert.equal(game.words().includes('FRAMES'), false, 'a frame painted the panel unprompted');
});

test('F3 puts it up and takes it down, once per press', () => {
  tapDebug();
  wait(1);
  assert.equal(panelIsUp(), true);
  assert.equal(game.stats().debugUp, true, 'the debug hook did not know the panel was up');

  const words = painted();
  assert.match(words, /FRAMES/);
  assert.match(words, /ARENA/);
  assert.match(words, /CACHE/);

  tapDebug();
  wait(1);
  assert.equal(panelIsUp(), false);
  assert.equal(painted().includes('FRAMES'), false, 'the panel was still painted after it went away');
});

test('an auto-repeat is not a second press', () => {
  showPanel(true);
  const repeat = { code: 'F3', repeat: true, preventDefault() {} };
  game.key('F3', true);                     // this press closes the panel
  for (let i = 0; i < 5; i++) game.fire('keydown', repeat);
  game.key('F3', false);
  assert.equal(panelIsUp(), false, 'the repeats toggled it back on');

  game.fire('keydown', repeat);             // and a repeat on its own is no press at all
  game.key('F3', false);
  assert.equal(panelIsUp(), false, 'a lone repeat was answered as a press');
  showPanel(true);
});

test('a pool that has never built an object gets no row', () => {
  // Still on the title screen, where nothing has been pooled yet: a section of `0 / 0` rows is noise
  // that hides the one row that means something, and a heading over nothing is not a section.
  showPanel(true);
  for (const [, pick] of POOLS) assert.equal(pick(world).stats().made, 0);
  assert.equal(sections().has('POOLS'), false, 'the plate printed an empty pool section');
});

test('every number on it is the world\'s, read now', () => {
  startBotRun(game);
  wait(30);
  assert.equal(game.stats().state, STATE.PLAY);

  // A scene for the plate to report: five bodies and seven sparks, planted and then asked about
  // before another step can move any of it.
  world.enemies.length = 0;
  for (let i = 0; i < 5; i++) world.enemies.push(makeEnemy(world, 'drifter', 400 + i * 30, 300));
  world.particles.clear();
  for (let i = 0; i < 7; i++) world.particles.spawn();

  const arena = section('ARENA');
  assert.equal(arena.get('bodies / ceiling'), '5 / ' + Math.round(bodyCeiling(world)));
  assert.equal(arena.get('sparks'), '7', 'seven sparks were not seven sparks on the plate');
  assert.equal(arena.get('bullets'), String(world.bullets.count));
  assert.equal(arena.get('enemy shots'), String(world.enemyShots.count));
  assert.equal(arena.get('shards'), String(world.shards.count));
  assert.equal(arena.get('grid cells'), String(world.grid.stats().filled));
  assert.equal(arena.get('arena'), world.arena.w + 'x' + world.arena.h);
});

test('the pool table says what the pools say, and says nothing they do not', () => {
  const pools = section('POOLS');
  let printed = 0;
  for (const [name, pick] of POOLS) {
    const stats = pick(world).stats();
    const shown = pools.get(name);
    if (stats.made === 0) {
      assert.equal(shown, undefined, '"' + name + '" printed a row without ever building an object');
      continue;
    }
    printed++;
    assert.equal(shown, stats.live + ' / ' + stats.made.toLocaleString('en-US'),
      '"' + name + '" did not say live / built');
  }
  assert.ok(printed > 0, 'not one pool had been built by a run of 30 frames');
  assert.equal(pools.size, printed, 'the pool table holds a row the world cannot back up');
});

test('the frame costs are the frame\'s own, and they are real numbers', () => {
  resetCosts();
  assert.equal(samplesTaken(), 0);
  wait(40);

  const cost = frameCosts();
  assert.equal(cost.frames, 40, 'the panel counted ' + cost.frames + ' frames of 40');
  assert.ok(Math.abs(cost.fps - 60) < 1, 'fps read ' + cost.fps);
  assert.ok(Math.abs(cost.frameMs - FRAME) < 0.2, 'frame ms read ' + cost.frameMs);
  assert.ok(cost.steps >= 1, 'a frame ran no simulation steps');
  assert.ok(cost.alpha >= 0 && cost.alpha <= 1, 'alpha was not a fraction: ' + cost.alpha);
  for (const value of [cost.stepAvg, cost.stepWorst, cost.drawAvg, cost.drawWorst]) {
    assert.ok(Number.isFinite(value) && value >= 0, 'a cost came out as ' + value);
  }
  assert.ok(cost.stepAvg > 0, 'stepping the world was timed at nothing at all');
  assert.ok(cost.stepWorst >= cost.stepAvg, 'the worst frame was cheaper than the average one');
});

test('a frame that did no work is reported as a frame that did no work', () => {
  resetCosts();
  noteFrame({ fps: 30, frameMs: 33.3, steps: 0, alpha: 0, stepMs: 0, drawMs: 0 });
  const cost = frameCosts();
  assert.equal(cost.frames, 1);
  assert.equal(cost.steps, 0);
  assert.equal(cost.stepAvg, 0);
  assert.equal(cost.stepWorst, 0);
  assert.equal(cost.fps, 30);
  wait(1);
});

test('it reads as a plate that fits, on every window the game will draw on', () => {
  for (const [w, h] of [[1280, 720], [2400, 1400], [1280, 400], [900, 320], [640, 360], [320, 320]]) {
    game.setViewport(w, h);
    const panel = debugLayout();
    // render/canvas.js never treats the window as smaller than 320 px either way, and the plate is
    // laid out against the canvas it is painted on rather than the window it was asked for.
    const canvasW = Math.max(320, w);
    const canvasH = Math.max(320, h);
    assert.ok(panel.x >= 0, 'a ' + panel.w + ' px plate would not fit ' + canvasW + ' px of window');
    assert.ok(panel.x + panel.w <= canvasW, 'the plate hung off the right edge at ' + w + 'x' + h);
    assert.ok(panel.y >= 90, 'the plate went up into the hull pips at ' + w + 'x' + h);
    assert.ok(panel.y + panel.h <= canvasH, 'the plate hung off the bottom at ' + w + 'x' + h);
    if (canvasH >= 400) {
      assert.ok(panel.y + panel.h <= canvasH - XP_ROOM, 'the plate stood on the XP bar at ' + w + 'x' + h);
    }
    for (const line of panel.lines) {
      const name = line.kind === 'head' ? line.text : line.cells[0].label;
      assert.ok(line.baseline <= panel.y + panel.h, 'a row fell below the plate: ' + name);
      for (const cell of (line.cells || [])) {
        assert.ok(cell.labelX >= panel.x && cell.valueX <= panel.x + panel.w,
          'a cell walked off the plate: ' + cell.label);
      }
    }
  }
  game.setViewport(1280, 720);
});

test('a short window gets the same facts in fewer lines, not a squeezed plate', () => {
  const full = debugLayout();
  assert.equal(full.compact, false, 'the full panel did not fit 720 px of window');
  const wide = sections(full);
  for (const need of ['FRAMES', 'ARENA', 'CACHE']) {
    assert.ok(wide.has(need), 'the full panel has no ' + need);
  }

  game.setViewport(1280, 360);
  const tight = debugLayout();
  assert.equal(tight.compact, true, 'a 360 px window was not given the compact shape');
  const seen = sections(tight);
  assert.ok(seen.get('FRAMES').has('fps'), 'the compact panel lost the frame rate');
  assert.ok(seen.get('ARENA').has('bodies'), 'the compact panel lost the crowd');
  assert.ok(seen.get('ARENA').has('pools'), 'the compact panel lost the pools altogether');
  assert.ok(tight.lines.length <= 10, 'the compact panel is ' + tight.lines.length + ' lines long');
  assert.ok(tight.y + tight.h <= 360, 'the compact plate still did not fit');
  game.setViewport(1280, 720);
});

test('no word on the plate walks over its own row', () => {
  // The harness knows roughly how wide a word is at the size a font string says to draw it at, which
  // is the only way in here to catch a label that has outgrown its column (tools/headless/harness.js).
  const panel = debugLayout();
  const ctx = game.context;
  for (const line of panel.lines) {
    if (line.kind === 'head') {
      ctx.font = panel.headFont;
      const width = ctx.measureText(line.text).width;
      assert.ok(line.x + width <= line.noteX, 'the heading "' + line.text + '" ran into its note');
      continue;
    }
    ctx.font = panel.font;
    for (const cell of line.cells) {
      const label = ctx.measureText(cell.label).width;
      const value = ctx.measureText(cell.value).width;
      assert.ok(cell.labelX + label <= cell.valueX - 2, '"' + cell.label + '" ran into its own value');
      assert.ok(cell.valueX - value >= cell.labelX,
        '"' + cell.value + '" ran back over "' + cell.label + '"');
    }
  }
});

test('the painter puts every word exactly where the layout said', () => {
  // The layout does the arithmetic and the painter is only allowed to paint it. This is the test that
  // says so: a word drawn at a height nobody planned, or aligned against the wrong column, is the
  // whole failure class this plate is built to avoid (render/volume.js makes the same bargain).
  showPanel(true);
  wait(1);
  const layout = debugLayout();     // the world has not moved since that frame drew
  // ...except the frame's own costs, which are written at the end of every frame - so the plate is
  // painted again right here, on the world this very layout describes, and that second paint is what
  // the positions are checked against. The panel lags one frame by design (render/debug.js).
  drawDebug(game.context);
  const words = game.texts();
  let checked = 0;
  for (const line of layout.lines) {
    if (line.kind === 'head') {
      checked += check(line.text, line.x, line.baseline, 'left');
      if (line.note !== '') checked += check(line.note, line.noteX, line.baseline, 'right');
      continue;
    }
    for (const cell of line.cells) {
      checked += check(cell.label, cell.labelX, line.baseline, 'left');
      checked += check(cell.value, cell.valueX, line.baseline, 'right');
    }
  }
  assert.ok(checked > 30, 'only ' + checked + ' words were laid out to check');
  showPanel(false);

  function check(text, x, y, align) {
    const found = words.find((w) => w.text === text && Math.abs(w.y - y) < 0.01);
    assert.ok(found !== undefined, '"' + text + '" was never painted at ' + y.toFixed(1));
    assert.equal(found.x, x, '"' + text + '" was not drawn at the column the layout planned');
    assert.equal(found.align, align, '"' + text + '" was aligned the wrong way');
    return 1;
  }
});

test('putting the panel up cannot move a run', async () => {
  // The whole point of a measuring instrument that lives inside the thing it measures: the same seed,
  // played by the same bot, once with the panel switched on for the whole flight and once without
  // ever touching it.
  async function play(withPanel) {
    await game.resetToTitle(20261006);
    resetCosts();
    showPanel(withPanel);
    const run = await playOneRun(game, {
      maxSeconds: 600,
      every: 61,
      onFrame: endingItAt(90),
    });
    assert.ok(run.trace.length > 5, 'the run was too short to compare');
    showPanel(false);
    return run.trace;
  }

  const plain = await play(false);
  const watched = await play(true);
  assert.deepEqual(watched, plain, 'the panel changed the run it was watching');
});

test('the heading names the screen, the clock, and the seed', async () => {
  // The run above was ended on purpose, so this is the third screen the panel has to name.
  assert.match(sections().heads[0], /^WRECK \d+m\d\ds #\d+$/, 'an ended run was not headed as one');

  await game.resetToTitle(20261006);
  startBotRun(game);
  wait(30);
  assert.equal(game.stats().state, STATE.PLAY);
  assert.match(sections().heads[0], /^RUN \d+m\d\ds #\d+$/);

  assert.equal(pauseRun(world), true, 'the run would not hold still');
  assert.match(sections().heads[0], /HELD/, 'a held run was not marked as held');
  assert.equal(resumeRun(world), true, 'and the run would not go on again');
});

test('it never touches the save', () => {
  const before = JSON.stringify(game.storage);
  showPanel(true);
  wait(5);
  showPanel(false);
  wait(5);
  assert.equal(JSON.stringify(game.storage), before, 'F3 wrote to storage');
});

test('the panel says who is holding the ship', () => {
  // A pad says nothing about itself anywhere else in the game - no ring to paint, no line on a screen -
  // so this row is the only way a player finds out the browser handed one over at all (input/gamepad.js).
  const empty = section('HANDS');
  assert.equal(empty.get('gamepad'), 'none', 'a visit with no pad says none');
  assert.equal(empty.get('thumb'), 'off');

  game.setPad({ id: 'Wheel (STANDARD GAMEPAD Vendor: 0x046d)' });
  wait(1);
  const held = section('HANDS');
  assert.equal(held.get('gamepad'), 'Wheel', 'and a pad is named, in the short form of its name');

  game.setPad(null);
  wait(1);
  assert.equal(section('HANDS').get('gamepad'), 'none', 'and it goes back to none when it is unplugged');
});

test('the plate costs no gradients and no blurs', () => {
  // PLAN section 4: every glow is a baked sprite. The plate is a box and some words, and it must not
  // be the one place in the game that buys a gradient per frame on the way to milestone 10's perf run.
  // Painted on a canvas of its own so the count is the plate's and nobody else's (tools/headless).
  showPanel(true);
  wait(2);
  const cost = game.measure((ctx) => drawDebug(ctx));
  assert.ok(cost.texts > 20, 'the plate painted ' + cost.texts + ' words; nothing was checked');
  assert.equal(cost.gradients, 0, 'the panel built a gradient');
  assert.equal(cost.shadows, 0, 'the panel blurred something');
  showPanel(false);
});
