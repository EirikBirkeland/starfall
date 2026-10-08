// What a frame costs to paint (PLAN section 2 and 4).
//
// A frame may not ask the canvas for the two slowest things a canvas knows:
// blurring a shape (`shadowBlur`) and building a gradient. Both used to be the
// ceiling on how much could be on screen; both are baked sprites now
// (render/glow.js). The harness counts every one of them, so this file can make
// promises instead of intentions.
//
// A sprite is built the first time the thing it belongs to is drawn, so the
// windows below are measured late in a run and in pairs: whatever an earlier
// window baked on meeting something new, a later one already has.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { botFrame, startBotRun, FRAME_MS } from '../tools/headless/bot.js';
import { stats as glowStats } from '../src/render/glow.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 7 });

/** Fly the simple bot for `frames` frames and report what painting them cost. */
function flyAndCount(frames) {
  const before = { draw: game.drawCalls(), bake: game.bakeCalls() };
  for (let i = 0; i < frames; i++) {
    botFrame(game);
    game.step(FRAME_MS);
  }
  const draw = game.drawCalls();
  const bake = game.bakeCalls();
  return {
    shadows: draw.shadows - before.draw.shadows,
    gradients: draw.gradients - before.draw.gradients,
    stamps: draw.images - before.draw.images,
    fills: draw.fills - before.draw.fills,
    baked: bake.canvases - before.bake.canvases,
    bakeGradients: bake.gradients - before.bake.gradients,
    alive: game.stats().state === game.STATE.PLAY,
    seconds: game.stats().t,
  };
}

/** Fly until the run is `seconds` old, so everything it shows has been drawn. */
function flyUntil(seconds) {
  let guard = 0;
  while (game.stats().t < seconds && game.stats().state === game.STATE.PLAY && guard++ < 400) {
    flyAndCount(50);
  }
}

test('the opening frames bake the game a handful of glow sprites', () => {
  startBotRun(game);
  // This file is about what painting costs, not about surviving: the ship cannot
  // be hurt, so a measurement window is never cut short by a death.
  game.world.player.invuln = Infinity;
  const opening = flyAndCount(60);

  assert.ok(opening.baked > 0, 'the game should bake something to shine with');
  assert.ok(opening.baked < 40, 'it bakes a handful of sprites, not one per thing: ' + opening.baked);
  assert.ok(opening.alive, 'and the run is flying');
});

test('a busy frame paints light without blurring and without gradients', () => {
  // A minute and a half in: every kind a run meets by then - the darter arrives at
  // 1:00 - has been drawn and had its sprite baked, and the next kind, the spitter,
  // is three minutes away, so the windows below meet nothing new. That is what makes
  // the last test's "builds nothing" a fair demand.
  flyUntil(100);
  const busy = flyAndCount(300);

  assert.ok(busy.alive, 'the ship is still there to be measured on');
  assert.ok(busy.fills > 40000, 'these are busy frames, not an empty screen: ' + busy.fills);
  assert.ok(busy.stamps > 5000, 'glow sprites are doing the shining: ' + busy.stamps);
  assert.equal(busy.shadows, 0, 'nothing asked the canvas for a blur');
  assert.equal(busy.gradients, 0, 'nothing built a gradient this frame');
  assert.ok(glowStats().holders < 35, 'and it came from a bounded few sprites: ' + glowStats().holders);
  // (34, and the same run on the commit before the ship owned a fire stood at 27: two sprites
  // are the whole of the fire - one wide, one hot, stamped at the size of whatever is burning
  // - and the ninth card tint asked for one more. Chill is two more still - the rime, and the
  // shell a frozen body stands in - which is why this window measured 29 and the bound was 32:
  // it had not met a body frozen solid yet, and two sprites are the whole of the ice however
  // many bodies wear it. Leech is one more - the mint its card wears, which is the mint a hull
  // coming back already wears in the arena, and the meter under the hull pips glows the way the
  // XP bar does, with a wide stroke and no sprite of its own. Magnetar is the one after that, and
  // it is only the fourteenth card tint: an icon is stamped with a glow of its own hue, and the
  // crack in the arena itself asks a frame for nothing but strokes and sparks (game/magnetar.js).
  // The rest is one per kind's colour and halo, plus the ship, the shards and the cards.)
});

test('a steady frame builds nothing at all', () => {
  const earlier = flyAndCount(300);
  const later = flyAndCount(300);

  assert.ok(later.alive, 'the ship is still there');
  assert.ok(later.stamps > 5000, 'still shining: ' + later.stamps);
  assert.ok(earlier.baked <= 4, 'a window may still meet something new: ' + earlier.baked);
  assert.equal(later.baked, 0, 'a steady frame bakes no new sprite');
  assert.equal(later.bakeGradients, 0, 'and builds no gradient to bake one with');
  assert.equal(later.shadows, 0, 'and never asks for a blur');
  game.stop();
});
