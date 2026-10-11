// The developer's panel: what the frame is costing, what the arena is holding, and what the pools
// have built. F3 puts it up and takes it down (input/keyboard.js).
//
// PLAN milestone 10 asks for "a debug overlay (F3) with frame time, entity counts, and pool usage",
// and those are exactly the three sections below. Everything in it is a number some other module
// already keeps: `Pool.stats()` for the pools, `core/clock.js` for the frames, `core/grid.js` and
// `render/glow.js` for the caches. Nothing here measures anything twice and nothing here is a fact
// of its own - which is the whole reason it is safe to leave this panel reachable from a fight.
//
// What it is *not*: it is not a screen, not a pause, and not a state of the run. It is frame state
// like the mixer readout (render/volume.js) and the award plates (render/toast.js) - a thing painted
// over the glass that the simulation never learns about. Two promises follow from that and both are
// paid in test/debug.test.mjs:
//
//   - **Putting it up cannot move a run.** It reads the world and writes nothing, and the frame
//     timings are taken with `performance.now()` and only ever drawn, so the same seed plays the
//     same run with the panel on and with it off;
//   - **Nothing about it is remembered.** It is off every time the page is opened and it never
//     touches `core/save.js`, because a tool that quietly changes what the next visitor sees is a
//     tool nobody trusts.
//
// `noteFrame` is the one input: main.js measures the frame around the step loop and around the paint
// and hands the numbers over once per frame. The panel *lags one frame* by construction - the frame
// being drawn cannot have been drawn yet - which is why the averages are taken over the last two
// seconds rather than the last frame: a single frame's number is a coin flip and a two second window
// is the shortest thing that reads the same twice.
//
// Like render/volume.js, render/toast.js and render/cards.js, all the arithmetic lives in
// `debugLayout` and the painter below only paints what it is handed, so a test with no pixels can
// still measure the plate and read the words that landed in it.

import { PALETTE, withAlpha } from '../core/palette.js';
import { clamp } from '../core/math.js';
import { STATE } from '../game/state.js';
import { world } from '../game/world.js';
import { bodyCeiling } from '../game/waves.js';
import { pad } from '../input/gamepad.js';
import { thumbUsed } from '../input/touch.js';
import { stats as glowStats } from './glow.js';
import { roundRect } from './shapes.js';
import { view } from './canvas.js';

const PANEL = {
  wide: 268,          // px: two columns of `label  value`, and the plate around them
  right: 22,          // px off the right edge - the margin the hull pips keep too
  top: 100,           // px down the glass: below the hull pips and the leech meter
  bottom: 34,         // px the XP bar and the FPS readout keep at the bottom
  pad: 11,            // px of plate above the first row and below the last
  row: 13,            // px of one row at full size ...
  minRow: 10,         // ... and the smallest it may be squeezed to before rows are dropped instead
  gap: 12,            // px between the two columns
  radius: 9,          // px of corner on the plate
};

// A frame that spends more than this on the simulation and the paint has missed 60 fps whatever the
// clock says, and the two numbers that added up to it go warm.
const FRAME_BUDGET = 1000 / 60;

const FONT_HEAD = '700 10px "Segoe UI", system-ui, sans-serif';
const FONT_ROW = '600 10px "Segoe UI", system-ui, sans-serif';
const FONT_SMALL = '600 9px "Segoe UI", system-ui, sans-serif';
const HEAD_SHARE = 0.85;        // the panel's own headings, against the values' full weight
const NOTE_SHARE = 0.55;        // the hint at the right end of a heading

/** How the panel's heading names whichever screen the world is on. */
const STATE_WORDS = {
  [STATE.START]: 'TITLE',
  [STATE.PLAY]: 'RUN',
  [STATE.OVER]: 'WRECK',
  [STATE.LEVEL]: 'CARDS',
  [STATE.WON]: 'WON',
};

/**
 * Every pooled list in the world, with the name the panel prints for it.
 *
 * One table, in the order the panel reads them: the three that are always busy, then the ship's own
 * weapons and the crowd's, then the cosmetic lists a death fills. A pool that has never built an
 * object is left out of the panel rather than printed as a row of zeros - `made` never goes down, so
 * a row that appears once has appeared for the visit and the plate cannot flicker mid-fight.
 *
 * Exported for test/debug.test.mjs, which asks the world the same question this table asks and
 * refuses the panel a row the world cannot back up - or a missing row it should have printed.
 */
export const POOLS = [
  ['bullets', (w) => w.bullets],
  ['shards', (w) => w.shards],
  ['sparks', (w) => w.particles],
  ['e-shots', (w) => w.enemyShots],
  ['rings', (w) => w.rings],
  ['labels', (w) => w.texts],
  ['fires', (w) => w.fires],
  ['beams', (w) => w.beams],
  ['bolts', (w) => w.arc.bolts],
  ['fronts', (w) => w.nova.fronts],
  ['lance', (w) => w.lance.beams],
  ['blades', (w) => w.arms],
  ['mines', (w) => w.mines.laid],
  ['threads', (w) => w.tether.cords],
  ['riders', (w) => w.tether.riders],
  ['guns', (w) => w.turret.stands],
  ['ghosts', (w) => w.afterimage.trail],
];

// --- frame state --------------------------------------------------------------

/** Whether the panel is on the glass. Off every time the page opens, and never stored. */
let showing = false;

/**
 * How many frames of cost are averaged. Two seconds at 60 fps: long enough that the same reading
 * comes back twice, short enough that walking into a crowd still shows up at once.
 */
const WINDOW = 120;

// Two ring buffers, filled in order and read in full every time the panel is painted. Fixed-size
// typed arrays, because "no allocation inside the per-frame loops" (PLAN section 2) is a rule and a
// plain push every frame is an allocation every frame.
const stepHistory = new Float64Array(WINDOW);
const drawHistory = new Float64Array(WINDOW);
let slot = 0;
let taken = 0;

/** The last frame that was reported, as it was reported. */
const lastFrame = { fps: 0, frameMs: 0, steps: 0, alpha: 0 };

/**
 * Tell the panel what the frame that just finished cost.
 *
 * `frame` is `{ fps, frameMs, steps, alpha, stepMs, drawMs }`. main.js owns one object and writes it
 * every frame, so this copies the four numbers it keeps and holds no reference to the caller's.
 */
export function noteFrame(frame) {
  lastFrame.fps = frame.fps;
  lastFrame.frameMs = frame.frameMs;
  lastFrame.steps = frame.steps;
  lastFrame.alpha = frame.alpha;
  stepHistory[slot] = frame.stepMs;
  drawHistory[slot] = frame.drawMs;
  slot = (slot + 1) % WINDOW;
  if (taken < WINDOW) taken++;
}

/** How many frames of cost are in the averages. */
export function samplesTaken() {
  return taken;
}

/**
 * What the frames have been costing: the last frame's own clock, and the mean and the worst of the
 * last `WINDOW` for the two things that can actually be spent - stepping the simulation and painting
 * what it produced.
 */
export function frameCosts() {
  let stepSum = 0;
  let drawSum = 0;
  let stepWorst = 0;
  let drawWorst = 0;
  for (let i = 0; i < taken; i++) {
    const s = stepHistory[i];
    const d = drawHistory[i];
    stepSum += s;
    drawSum += d;
    if (s > stepWorst) stepWorst = s;
    if (d > drawWorst) drawWorst = d;
  }
  const n = Math.max(1, taken);
  return {
    fps: lastFrame.fps,
    frameMs: lastFrame.frameMs,
    steps: lastFrame.steps,
    alpha: lastFrame.alpha,
    frames: taken,
    stepAvg: stepSum / n,
    stepWorst: stepWorst,
    drawAvg: drawSum / n,
    drawWorst: drawWorst,
  };
}

/** Put the panel up, or take it down. Returns whether it is up afterwards. */
export function togglePanel() {
  showing = !showing;
  return showing;
}

export function panelIsUp() {
  return showing;
}

/** Forget the history. A new page has never seen a frame; a headless tool that replays says so too. */
export function resetCosts() {
  stepHistory.fill(0);
  drawHistory.fill(0);
  slot = 0;
  taken = 0;
  lastFrame.fps = 0;
  lastFrame.frameMs = 0;
  lastFrame.steps = 0;
  lastFrame.alpha = 0;
}

// --- the numbers on it --------------------------------------------------------

function count(value) {
  return String(value);
}

/** Milliseconds, at the precision the number is worth: a tenth is enough once it is a two-digit one. */
function ms(value) {
  return value < 10 ? value.toFixed(2) : value.toFixed(1);
}

/** Bytes, in the unit a human reads first. */
function bytes(value) {
  if (value >= 1048576) return (value / 1048576).toFixed(1) + ' MB';
  if (value >= 1024) return Math.round(value / 1024) + ' KB';
  return Math.round(value) + ' B';
}

/** A whole number with its thousands marked, so a five-digit count is still scannable. */
function group(value) {
  return value.toLocaleString('en-US');
}

function mmss(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0') + 's';
}

function cell(label, value, hot) {
  return { label: label, value: value, hot: !!hot };
}

function row(label, value, hot) {
  return { cells: [cell(label, value, hot)] };
}

function two(labelA, valueA, labelB, valueB) {
  return { cells: [cell(labelA, valueA), cell(labelB, valueB)] };
}

function head(text, note) {
  return { head: text, note: note === undefined ? '' : note };
}

/** Every pooled list that has built something, newest of the busy ones first. */
function livePools() {
  const live = [];
  for (const [name, pick] of POOLS) {
    const stats = pick(world).stats();
    if (stats.made > 0) live.push({ name: name, stats: stats });
  }
  return live;
}

/** The panel's own heading: which screen, how far into the run, and which seed. */
function stateLine() {
  let line = STATE_WORDS[world.state] || '???';
  if (world.state !== STATE.START) line += ' ' + mmss(world.elapsed);
  if (world.paused) line += ' HELD';
  return line + ' #' + world.seed;
}

/**
 * The rows, in the order the panel prints them.
 *
 * `facts` is the world read once per plate (its costs, its grid, its sprite cache) and `compact` is
 * the short-window shape: the same three sections and the same headline numbers, with the pool table
 * folded into one line and every row paired up. Which shape the window gets is `debugLayout`'s
 * question to answer; this function only ever answers with content.
 */
function contentOf(compact, facts) {
  const cost = facts.cost;
  const grid = facts.grid;
  const glow = facts.glow;
  const over = cost.stepAvg + cost.drawAvg > FRAME_BUDGET;
  const lines = [head(stateLine())];

  lines.push(head('FRAMES'));
  if (compact) {
    lines.push(two('fps', cost.fps.toFixed(1), 'frame ms', ms(cost.frameMs)));
    lines.push(two('step ms', ms(cost.stepAvg) + '/' + ms(cost.stepWorst),
      'draw ms', ms(cost.drawAvg) + '/' + ms(cost.drawWorst)));
  } else {
    lines.push(row('fps', cost.fps.toFixed(1)));
    lines.push(row('frame ms', ms(cost.frameMs), cost.frameMs > FRAME_BUDGET * 1.15));
    lines.push(row('step ms  avg / worst', ms(cost.stepAvg) + ' / ' + ms(cost.stepWorst), over));
    lines.push(row('draw ms  avg / worst', ms(cost.drawAvg) + ' / ' + ms(cost.drawWorst), over));
    lines.push(two('steps', count(cost.steps), 'alpha', cost.alpha.toFixed(2)));
  }

  lines.push(head('ARENA'));
  if (compact) {
    lines.push(two('bodies', world.enemies.length + '/' + Math.round(bodyCeiling(world)),
      'sparks', group(world.particles.count)));
    lines.push(two('bullets', group(world.bullets.count), 'shards', group(world.shards.count)));
  } else {
    lines.push(row('bodies / ceiling', world.enemies.length + ' / ' + Math.round(bodyCeiling(world))));
    lines.push(two('bullets', group(world.bullets.count), 'enemy shots', group(world.enemyShots.count)));
    lines.push(two('shards', group(world.shards.count), 'sparks', group(world.particles.count)));
    lines.push(two('grid cells', group(grid.filled), 'packs', group(world.flocks.length)));
    lines.push(two('arena', world.arena.w + 'x' + world.arena.h, 'view', view.W + 'x' + view.H));
  }

  const live = livePools();
  if (compact) {
    if (live.length > 0) {
      let liveTotal = 0;
      let madeTotal = 0;
      for (const pool of live) {
        liveTotal += pool.stats.live;
        madeTotal += pool.stats.made;
      }
      lines.push(row('pools', live.length + ' pools ' + group(liveTotal) + ' / ' + group(madeTotal)));
    }
    lines.push(row('glow', glow.sprites + ' sprites ' + bytes(glow.bytes)));
    return lines;
  }

  if (live.length > 0) {
    // No heading and no table while nothing has been pooled at all: on the title screen the attract
    // crowd is a plain array and nothing has died yet, and a heading over nothing is not a section.
    lines.push(head('POOLS', 'live / built'));
    for (let i = 0; i < live.length; i += 2) {
      const a = live[i];
      const b = live[i + 1];
      const left = cell(a.name, a.stats.live + ' / ' + group(a.stats.made));
      lines.push(b === undefined
        ? { cells: [left] }
        : { cells: [left, cell(b.name, b.stats.live + ' / ' + group(b.stats.made))] });
    }
  }

  lines.push(head('CACHE'));
  lines.push(two('glow sprites', group(glow.sprites), 'glow pixels', bytes(glow.bytes)));
  lines.push(row('device ratio', glow.pixelRatio + 'x'));

  // Who is holding the ship. A pad says nothing else about itself anywhere in the game - it has no
  // ring to paint and no line on a screen - so this is where a player finds out the browser handed
  // one over at all (input/gamepad.js). `none` is the honest answer for the visit that has not had one.
  lines.push(head('HANDS'));
  lines.push(two('gamepad', facts.pad === '' ? 'none' : facts.pad, 'thumb', facts.thumb ? 'on' : 'off'));

  return lines;
}

/** How tall a stack of `lines` is at a given row height. */
function heightOf(lines, rowHeight) {
  return PANEL.pad * 2 + rowHeight * lines.length;
}

/**
 * The plate, its rows and every word's place in them, in window pixels.
 *
 * Two shapes and one decision: the full panel, or - when a row of the full panel would have to be
 * squeezed below `PANEL.minRow` to fit the window - the compact one, which says the same three
 * things in half the lines rather than saying them illegibly. The plate is never allowed off the
 * bottom of the window and never over the hull pips at the top of it, and a narrow window pays in a
 * narrower plate before it pays in anything else.
 *
 * Every number on it is read once, here: the costs, the grid, the sprite cache and the crowd. The
 * painter below asks for nothing.
 */
export function debugLayout() {
  const facts = {
    cost: frameCosts(), grid: world.grid.stats(), glow: glowStats(),
    pad: pad.name, thumb: thumbUsed(),
  };
  const room = Math.max(PANEL.minRow, view.H - PANEL.top - PANEL.bottom);
  const full = contentOf(false, facts);
  const compact = heightOf(full, PANEL.row) > room;
  const lines = compact ? contentOf(true, facts) : full;
  const rowHeight = clamp((room - PANEL.pad * 2) / lines.length, PANEL.minRow, PANEL.row);
  const w = Math.min(PANEL.wide, Math.max(160, view.W - PANEL.right * 2));
  const x = view.W - PANEL.right - w;
  const y = PANEL.top;
  const h = heightOf(lines, rowHeight);
  const column = (w - PANEL.pad * 2 - PANEL.gap) / 2;
  const right = x + w - PANEL.pad;

  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Every row is drawn on its own middle - the same bargain render/volume.js strikes, and what
    // makes the plate's top and bottom margins the same width.
    const baseline = y + PANEL.pad + rowHeight * (i + 0.5);
    if (line.head !== undefined) {
      out.push({
        kind: 'head', text: line.head, note: line.note,
        x: x + PANEL.pad, noteX: right, baseline: baseline,
      });
      continue;
    }
    const cells = [];
    for (let c = 0; c < line.cells.length; c++) {
      const at = x + PANEL.pad + c * (column + PANEL.gap);
      cells.push({
        label: line.cells[c].label,
        value: line.cells[c].value,
        hot: line.cells[c].hot,
        labelX: at,
        valueX: c === line.cells.length - 1 ? right : at + column,
      });
    }
    out.push({ kind: 'rows', cells: cells, baseline: baseline });
  }

  return {
    x: x, y: y, w: w, h: h, row: rowHeight, compact: compact,
    font: rowHeight < 12 ? FONT_SMALL : FONT_ROW,
    headFont: FONT_HEAD,
    lines: out,
  };
}

/**
 * Paint the panel. Called last of everything (render/renderer.js): a tool that reads the frame has to
 * be legible over the frame, including over the cards and the mixer readout.
 */
export function drawDebug(ctx) {
  if (!showing) return;
  const panel = debugLayout();

  ctx.save();
  ctx.fillStyle = 'rgba(6,16,41,0.9)';
  roundRect(ctx, panel.x, panel.y, panel.w, panel.h, PANEL.radius);
  ctx.fill();
  ctx.strokeStyle = withAlpha(PALETTE.wall, 0.35);
  ctx.lineWidth = 1;
  roundRect(ctx, panel.x + 0.5, panel.y + 0.5, panel.w - 1, panel.h - 1, PANEL.radius);
  ctx.stroke();

  ctx.textBaseline = 'middle';
  for (const line of panel.lines) {
    if (line.kind === 'head') {
      ctx.font = panel.headFont;
      ctx.textAlign = 'left';
      ctx.fillStyle = withAlpha(PALETTE.uiDim, HEAD_SHARE);
      ctx.fillText(line.text, line.x, line.baseline);
      if (line.note !== '') {
        ctx.textAlign = 'right';
        ctx.fillStyle = withAlpha(PALETTE.uiFaint, NOTE_SHARE);
        ctx.fillText(line.note, line.noteX, line.baseline);
      }
      continue;
    }
    ctx.font = panel.font;
    for (const cell of line.cells) {
      ctx.textAlign = 'left';
      ctx.fillStyle = withAlpha(PALETTE.uiFaint, 0.9);
      ctx.fillText(cell.label, cell.labelX, line.baseline);
      ctx.textAlign = 'right';
      ctx.fillStyle = cell.hot ? PALETTE.telegraph : PALETTE.uiText;
      ctx.fillText(cell.value, cell.valueX, line.baseline);
    }
  }
  ctx.textAlign = 'left';
  ctx.restore();
}
