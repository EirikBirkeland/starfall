// The mixer on the glass: what the two sliders are set to, for a moment after one is moved.
//
// PLAN section 5 asks for "separate volume sliders for music and effects, and a mute key", and
// milestone 7 has no settings page to put a slider on - milestone 9 does. So the sliders are
// keys for now (input/keyboard.js), and a key that changes something you cannot see is a key
// that might as well not have been pressed. This is what you see instead of a fader: the two
// buses, where each one stands, and how long the game will keep saying it.
//
// It is drawn last of everything (render/renderer.js), over the interface and over the upgrade
// cards, because it is answering a press and nothing on the screen is allowed to hide the
// answer. It is also deliberately *not* a card, a dialog or a pause: the run goes on underneath
// while you can see it, because turning the music down mid-fight is a thing people do and not a
// trip to a menu.
//
// Everything here is frame state and nothing of it is the run's: the timer runs on the frame
// clock like the star drift, and the numbers it paints are read out of the mixer itself
// (audio/engine.js) every frame, so the panel cannot tell a story the graph is not living.
//
// `panelLayout` does all the arithmetic and the painter below only paints what it is handed,
// which is what makes the picture testable in a place with no pixels: test/volume.test.mjs
// measures the boxes and the words that landed in them.

import { PALETTE, withAlpha } from '../core/palette.js';
import { VOLUME, effectsLevel, isMuted, musicLevel } from '../audio/engine.js';
import { roundRect } from './shapes.js';
import { haloText } from './hud.js';
import { view } from './canvas.js';

const PANEL = {
  hold: 1.7,        // s the panel stays fully up after the last press
  fade: 0.45,       // s it spends going away at the end of that
  row: 21,          // px of height per row
  pad: 14,          // px of plate around the rows
  lift: 74,         // px of window between the XP bar and the panel's bottom edge
  label: 58,        // px of label column, right-aligned onto the pips
  pip: 12,          // px wide
  pipGap: 4,        // px between them
  pipH: 9,          // px tall
  keys: 20,         // px of the faint line of keys under the rows
  radius: 9,        // px of corner on the plate
};

// The plate is sized out of its own parts rather than a number, so the rows cannot be drawn
// wider than the box around them by somebody changing one of the parts.
const PIPS_W = VOLUME.steps * (PANEL.pip + PANEL.pipGap) - PANEL.pipGap;
const PLATE_W = PANEL.pad + PANEL.label + PANEL.pipGap + PIPS_W + PANEL.pad;

const FONT_LABEL = '700 11px "Segoe UI", system-ui, sans-serif';
const FONT_KEY = '600 10px "Segoe UI", system-ui, sans-serif';
const GLOW_CYAN = 'rgba(94,247,255,0.8)';
// The row you just moved, and the one that was merely there. Both rows are always shown: the
// question a person who just pressed a key has is "and what did the *other* one do".
const ROW_LIT = 1;
const ROW_QUIET = 0.5;
const TRACK = 'rgba(111,143,176,0.28)';
const PIP_R = 2;    // px of corner on a pip
// The line under the rows, which is also the only place in the game that says what the keys
// were: there is no settings page yet, so the readout has to do the explaining.
const KEYS_LINE = 'M mute    [ ] music    - = sound';
const MUTED_LINE = 'MUTED \u2014 PRESS M TO HEAR IT AGAIN';

// Frame state, not run state: how long the panel has left to live, and what was last touched.
let left = 0;
let lastTouched = '';

/** Light the panel and say which slider (or the mute) was just answered. */
export function showVolumePanel(what) {
  lastTouched = what;
  left = PANEL.hold;
}

/** Burn the panel's clock. main.js calls this on the frame's time, like the sky. */
export function advanceVolumePanel(dt) {
  if (left > 0) left = Math.max(0, left - dt);
}

/** Is it up? (For a test that wants to know whether anything was painted.) */
export function panelIsUp() {
  return left > 0;
}

/**
 * Every box of the panel, in window pixels, computed from the sliders as they stand: the plate,
 * one entry per row (a label right-aligned to a row of pips), and the line of keys underneath.
 * Centred horizontally and lifted clear of the XP bar, because the middle-bottom of the window
 * is the one strip the score, the hull, the boss bar and the level all leave alone.
 */
export function panelLayout() {
  const lines = [
    { name: 'MUSIC', key: 'music', level: musicLevel() },
    { name: 'SOUND', key: 'effects', level: effectsLevel() },
  ];
  const height = PANEL.pad * 2 + PANEL.row * lines.length + PANEL.keys;
  const x = (view.W - PLATE_W) / 2;
  const y = view.H - PANEL.lift - height;
  // How far the panel has to go before it is gone, and which row is the one that was just moved.
  // Both are computed here rather than in the painter so that a test can read them back: there are
  // no pixels in here, but there is a box, and a brightness is a number.
  const fade = Math.min(1, left / PANEL.fade);
  const rows = lines.map((line, i) => ({
    name: line.name,
    key: line.key,
    level: line.level,
    lit: (lastTouched === line.key || lastTouched === 'mute') ? ROW_LIT : ROW_QUIET,
    labelX: x + PANEL.pad + PANEL.label,
    baselineY: y + PANEL.pad + PANEL.row * i + PANEL.row / 2,
    pipX: x + PANEL.pad + PANEL.label + PANEL.pipGap,
    pipY: y + PANEL.pad + PANEL.row * i + (PANEL.row - PANEL.pipH) / 2,
  }));
  return {
    x: x, y: y, w: PLATE_W, h: height,
    pips: { x: x + PANEL.pad + PANEL.label + PANEL.pipGap, w: PIPS_W },
    labelRight: x + PANEL.pad + PANEL.label,
    keysY: y + height - PANEL.keys / 2,
    centreX: x + PLATE_W / 2,
    lit: lastTouched,
    fade: fade,
    rows: rows,
  };
}

/** One slider drawn as the row of positions it is: filled as far as it goes, hollow after. */
function drawPips(ctx, row) {
  for (let i = 0; i < VOLUME.steps; i++) {
    const px = row.pipX + i * (PANEL.pip + PANEL.pipGap);
    if (i < row.level) {
      ctx.fillStyle = withAlpha(PALETTE.uiText, row.lit);
      roundRect(ctx, px, row.pipY, PANEL.pip, PANEL.pipH, PIP_R);
      ctx.fill();
    } else {
      ctx.strokeStyle = withAlpha(TRACK, row.lit);
      ctx.lineWidth = 1;
      roundRect(ctx, px + 0.5, row.pipY + 0.5, PANEL.pip - 1, PANEL.pipH - 1, PIP_R);
      ctx.stroke();
    }
  }
}

export function drawVolumePanel(ctx) {
  if (left <= 0) return;
  const layout = panelLayout();

  // The whole panel fades on one dial - the plate, both rows and the line under them all going
  // away together - so the fade goes on the canvas and the rows keep their own lit-or-quiet.
  ctx.save();
  ctx.globalAlpha = layout.fade;
  ctx.fillStyle = 'rgba(6,16,41,0.86)';
  roundRect(ctx, layout.x, layout.y, layout.w, layout.h, PANEL.radius);
  ctx.fill();
  ctx.strokeStyle = withAlpha(PALETTE.wall, 0.35);
  ctx.lineWidth = 1;
  roundRect(ctx, layout.x + 0.5, layout.y + 0.5, layout.w - 1, layout.h - 1, PANEL.radius);
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.font = FONT_LABEL;
  for (const row of layout.rows) {
    ctx.textAlign = 'right';
    ctx.fillStyle = withAlpha(PALETTE.uiDim, row.lit);
    ctx.fillText(row.name, row.labelX, row.baselineY);
    drawPips(ctx, row);
  }

  // The keys, and the one thing that outranks them: while the master is shut, every slider in the
  // game is a description of something you cannot hear, and that is the thing that needs saying.
  ctx.textAlign = 'center';
  ctx.font = FONT_KEY;
  if (isMuted()) {
    haloText(ctx, MUTED_LINE, layout.centreX, layout.keysY, PALETTE.telegraph, GLOW_CYAN);
  } else {
    ctx.fillStyle = withAlpha(PALETTE.uiFaint, 0.9);
    ctx.fillText(KEYS_LINE, layout.centreX, layout.keysY);
  }
  ctx.textAlign = 'left';
  ctx.restore();
}
