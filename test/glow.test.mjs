// The glow sprite cache (render/glow.js): baked once, stamped many times, and
// rebuilt when the screen's pixel ratio changes.
//
// These tests do not boot the game. They hand the module a document that builds
// blank canvases and a context that writes down every stamp, which is the only
// way to see a sprite from here - and it keeps the assertions about sizes,
// anchors and rebakes exact.

import test from 'node:test';
import assert from 'node:assert/strict';
import { setGlowResolution, glowFor, makeStreak, paintGlow, paintStreak, stats } from '../src/render/glow.js';

/** A document whose canvases write down what was baked on them. */
function bakeRecorder() {
  const log = { canvases: 0, made: [], blobs: [], stops: [], scales: [] };
  globalThis.document = {
    createElement(tag) {
      const canvas = { tag, width: 0, height: 0, log };
      canvas.getContext = () => ({
        globalCompositeOperation: 'source-over',
        fillStyle: '',
        scale(x) { log.scales.push(x); },
        createRadialGradient(x0, y0, r0, x1, y1, r1) {
          log.blobs.push({ canvas, x: x1, y: y1, r: r1 });
          return { addColorStop(stop, color) { log.stops.push([stop, color]); } };
        },
        fillRect() {},
      });
      log.canvases++;
      log.made.push(canvas);
      return canvas;
    },
  };
  return log;
}

/** A canvas context that remembers where every sprite was stamped. */
function stampRecorder() {
  const log = { images: [], alphas: [], translates: [], rotates: [], saves: 0, restores: 0 };
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    drawImage(canvas, x, y, w, h) {
      log.images.push({ canvas, x, y, w, h });
      log.alphas.push(ctx.globalAlpha);
    },
    save() { log.saves++; log.stack.push(ctx.globalAlpha); },
    restore() { log.restores++; ctx.globalAlpha = log.stack.pop(); },
    translate(x, y) { log.translates.push({ x, y }); },
    rotate(a) { log.rotates.push(a); },
  };
  log.stack = [];
  return { ctx, log };
}

test('a glow is baked the first time it is stamped, then handed out again', () => {
  const log = bakeRecorder();
  const { ctx, log: draws } = stampRecorder();

  const first = glowFor('#5ef7ff', 20);
  const second = glowFor('#5ef7ff', 20);
  assert.equal(log.canvases, 0, 'asking for a sprite is not baking one');
  assert.equal(first, second, 'the same glow is one sprite, not one per caller');

  paintGlow(ctx, first, 10, 10);
  paintGlow(ctx, second, 20, 20);
  assert.equal(log.canvases, 1, 'a warm cache bakes nothing: ' + log.canvases);
  assert.equal(draws.images.length, 2);
});

test('a glow is stamped centred, at its CSS size, baked at device resolution', () => {
  const log = bakeRecorder();
  const { ctx, log: draws } = stampRecorder();
  setGlowResolution(2);

  paintGlow(ctx, glowFor('#ff4d6d', 24), 100, 60);

  const canvas = log.made[0];
  assert.equal(canvas.width, 48 * 2, 'the sprite holds twice as many pixels as it is stamped at');
  assert.deepEqual(log.scales, [2], 'the bake works in CSS pixels at that resolution');

  const stamp = draws.images[0];
  assert.equal(stamp.x, 100 - 24, 'the sprite reaches as far left as its radius');
  assert.equal(stamp.y, 60 - 24);
  assert.equal(stamp.w, 48);
  assert.equal(stamp.h, 48);
});

test('a glow falls off from its middle and out', () => {
  const log = bakeRecorder();
  const { ctx } = stampRecorder();
  setGlowResolution(1);

  paintGlow(ctx, glowFor('#ffffff', 30), 0, 0);
  const blob = log.blobs[log.blobs.length - 1];
  assert.equal(blob.r, 30, 'the light reaches the sprite edge and no further');
  assert.equal(blob.x, 30);
  assert.equal(blob.y, 30);

  const stops = log.stops.slice(-4);
  assert.equal(stops[0][0], 0);
  assert.equal(stops[stops.length - 1][0], 1);
  assert.match(stops[stops.length - 1][1], /,0\)$/, 'the edge of a glow is transparent');
});

test('a resolution change rebuilds the sprites, once each', () => {
  const log = bakeRecorder();
  const { ctx, log: draws } = stampRecorder();
  setGlowResolution(1);

  const halo = glowFor('#ffd76a', 12);
  paintGlow(ctx, halo, 0, 0);
  assert.equal(log.canvases, 1);
  assert.ok(stats().sprites >= 1, 'the sprite in use is baked');

  setGlowResolution(3);
  assert.equal(stats().sprites, 0, 'the old sprites are too soft for the new screen');
  paintGlow(ctx, halo, 0, 0);
  assert.equal(log.canvases, 2);
  assert.equal(log.made[1].width, 24 * 3);
  assert.equal(draws.images[1].w, 24, 'but it is still stamped at the same CSS size');

  setGlowResolution(3);
  paintGlow(ctx, halo, 0, 0);
  assert.equal(log.canvases, 2, 'the same resolution is not a change');
});

test('a streak is stamped with its head on the point it is given', () => {
  const log = bakeRecorder();
  const { ctx, log: draws } = stampRecorder();
  setGlowResolution(1);

  const LENGTH = 20;
  const trail = makeStreak('#ffffff', '#5ef7ff', LENGTH, 6);
  paintStreak(ctx, trail, 100, 50, 0.7);

  // The sprite is the streak plus a margin all round for its own soft edges.
  const margin = (log.made[0].width - LENGTH) / 2;
  assert.ok(margin >= 1, 'a streak leaves room around itself for its own glow');
  assert.deepEqual(draws.translates, [{ x: 100, y: 50 }]);
  assert.deepEqual(draws.rotates, [0.7], 'it is turned to the heading it was given');

  const stamp = draws.images[0];
  assert.equal(stamp.w, LENGTH + margin * 2);
  assert.equal(stamp.x, -(margin + LENGTH), 'the head of the streak sits on the point');
  assert.equal(stamp.x + LENGTH + margin, 0, 'and its tip is exactly there');
  assert.equal(stamp.y, -stamp.h / 2, 'and it is centred on it');
});

test('a streak is a row of light that grows toward its head', () => {
  const log = bakeRecorder();
  const { ctx } = stampRecorder();
  setGlowResolution(1);

  paintStreak(ctx, makeStreak('#ffffff', '#5ef7ff', 24, 8), 0, 0, 0);
  const row = log.blobs.filter((b) => b.canvas === log.made[0]);

  assert.ok(row.length > 4, 'a row of light, not one blob: ' + row.length);
  assert.ok(row[row.length - 1].x - row[0].x >= 24, 'the row runs the whole length of the streak');
  for (let i = 1; i < row.length; i++) {
    assert.ok(row[i].x >= row[i - 1].x, 'the blobs run from the tail to the head');
    assert.ok(row[i].r >= row[i - 1].r, 'and they grow and brighten on the way');
  }
});

test('stretch lengthens a streak along its own axis only', () => {
  bakeRecorder();
  const { ctx, log: draws } = stampRecorder();
  setGlowResolution(1);

  const trail = makeStreak('#ffffff', '#5ef7ff', 20, 6);
  paintStreak(ctx, trail, 0, 0, 0, 1);
  paintStreak(ctx, trail, 0, 0, 0, 2);

  const one = draws.images[0];
  const two = draws.images[1];
  assert.equal(two.w, one.w * 2, 'twice the stretch is twice the length');
  assert.equal(two.h, one.h, 'and no change in width');
  assert.equal(two.x, one.x * 2, 'the head stays on the point it was given');
});

test('strength dims a stamp and leaves the canvas as it found it', () => {
  bakeRecorder();
  const { ctx, log } = stampRecorder();
  setGlowResolution(1);
  ctx.globalAlpha = 0.5;

  paintGlow(ctx, glowFor('#7dffb0', 8), 0, 0, 0.5);
  assert.equal(log.alphas[0], 0.25, 'the caller is half faded and the glow asks for half again');
  assert.equal(ctx.globalAlpha, 0.5, 'the fade was the glow\'s business alone');
  assert.equal(log.saves, log.restores, 'and the canvas was balanced about it');
});

test('nothing at all is drawn for no light', () => {
  bakeRecorder();
  const { ctx, log } = stampRecorder();
  setGlowResolution(1);

  paintGlow(ctx, glowFor('#ff7a3d', 8), 0, 0, 0);
  paintStreak(ctx, makeStreak('#fff', '#000', 10, 4), 0, 0, 0, 1, 0);
  assert.equal(log.images.length, 0, 'a glow with no strength is not stamped');
});
