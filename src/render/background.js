// Three parallax star layers, sliding slowly past the ship. Purely decorative,
// so this state lives in the renderer and never reaches the simulation.

import { PALETTE, withAlpha } from '../core/palette.js';
import { visual } from '../core/rng.js';
import { clamp, TAU } from '../core/math.js';
import { view } from './canvas.js';
import { world } from '../game/world.js';

const LAYERS = [
  { depth: 0.014, speed: 5, count: 110, min: 0.5, max: 1.2, alpha: 0.34 },
  { depth: 0.038, speed: 11, count: 62, min: 0.9, max: 1.8, alpha: 0.55 },
  { depth: 0.075, speed: 19, count: 30, min: 1.4, max: 2.6, alpha: 0.9 },
];

let stars = [];

export function buildStars() {
  stars = [];
  const scale = clamp((view.W * view.H) / (1280 * 720), 0.55, 1.8);
  for (let i = 0; i < LAYERS.length; i++) {
    const layer = LAYERS[i];
    const count = Math.round(layer.count * scale);
    for (let j = 0; j < count; j++) {
      stars.push({
        l: i,
        x: visual.next() * view.W,
        y: visual.next() * view.H,
        r: visual.range(layer.min, layer.max),
        tw: visual.next() * TAU,
        tws: visual.range(0.5, 2.0),
      });
    }
  }
}

export function updateStars(dt) {
  for (let i = 0; i < stars.length; i++) {
    const star = stars[i];
    const layer = LAYERS[star.l];
    star.x -= layer.speed * dt;
    star.y += layer.speed * 0.35 * dt;
    star.tw += star.tws * dt;
    if (star.x < -4) {
      star.x = view.W + 4;
      star.y = visual.next() * view.H;
    }
    if (star.y > view.H + 4) {
      star.y = -4;
      star.x = visual.next() * view.W;
    }
  }
}

export function drawStars(ctx) {
  const px = world.player.x - view.W / 2;
  const py = world.player.y - view.H / 2;
  for (let i = 0; i < stars.length; i++) {
    const star = stars[i];
    const layer = LAYERS[star.l];
    const x = ((star.x - px * layer.depth) % view.W + view.W) % view.W;
    const y = ((star.y - py * layer.depth) % view.H + view.H) % view.H;
    const alpha = layer.alpha * (0.62 + 0.38 * Math.sin(star.tw));
    ctx.fillStyle = withAlpha(PALETTE.star, alpha);
    ctx.beginPath();
    ctx.arc(x, y, star.r, 0, TAU);
    ctx.fill();
  }
}
