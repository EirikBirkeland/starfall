// The canvas, its size, and the things baked from that size.

import { PALETTE } from '../core/palette.js';
import { setGlowResolution } from './glow.js';

export const view = {
  canvas: null,
  ctx: null,
  W: 960,
  H: 600,
  DPR: 1,
  bgGrad: null,
  vignette: null,
};

export function initCanvas(canvas) {
  view.canvas = canvas;
  view.ctx = canvas.getContext('2d');
}

/** Fit the canvas to the window and rebuild everything baked from its size. */
export function resizeCanvas() {
  const ctx = view.ctx;
  view.DPR = Math.min(window.devicePixelRatio || 1, 2);
  view.W = Math.max(320, window.innerWidth);
  view.H = Math.max(320, window.innerHeight);
  view.canvas.width = Math.round(view.W * view.DPR);
  view.canvas.height = Math.round(view.H * view.DPR);
  view.canvas.style.width = view.W + 'px';
  view.canvas.style.height = view.H + 'px';
  // The glow sprites are baked at device resolution, so they are rebuilt when it
  // changes (render/glow.js).
  setGlowResolution(view.DPR);

  view.bgGrad = ctx.createLinearGradient(0, 0, 0, view.H);
  view.bgGrad.addColorStop(0, PALETTE.bgTop);
  view.bgGrad.addColorStop(0.55, PALETTE.bgMiddle);
  view.bgGrad.addColorStop(1, PALETTE.bgBottom);

  const cx = view.W / 2;
  const cy = view.H / 2;
  view.vignette = ctx.createRadialGradient(
    cx, cy, Math.min(view.W, view.H) * 0.25,
    cx, cy, Math.max(view.W, view.H) * 0.78);
  view.vignette.addColorStop(0, 'rgba(0,0,0,0)');
  view.vignette.addColorStop(1, PALETTE.vignette);
}
