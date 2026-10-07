// The clock turns whatever the display is doing into fixed simulation steps
// (core/clock.js). It is the piece that decides a run plays out the same on a
// 30 Hz netbook and a 240 Hz one, and it is the piece that hands the renderer the
// moment in between two steps to draw.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from '../src/core/clock.js';
import { BALANCE } from '../src/game/balance.js';

const STEP = BALANCE.sim.step;
const GAP = BALANCE.sim.maxFrameDt;

const many = (count, ms) => Array.from({ length: count }, () => ms);

/** Hand a fresh clock these frame lengths and report what it asked to simulate. */
function play(frames) {
  const clock = createClock(STEP, GAP);
  const perFrame = [];
  let now = 0;
  let steps = 0;
  let last = null;
  for (const ms of frames) {
    now += ms;
    last = clock.frame(now);
    steps += last.steps;
    perFrame.push(last);
  }
  return { clock, steps, perFrame, last, alphas: perFrame.map((t) => t.alpha) };
}

/** How far a count of steps is from the seconds those frames really were. */
function offBy(steps, frames) {
  // A fresh page has no previous frame, so the first one is owed nothing.
  const seconds = (frames.reduce((a, b) => a + b, 0) - frames[0]) / 1000;
  return Math.abs(steps - seconds / STEP);
}

test('the simulation gets the same time whichever display it runs on', () => {
  for (const hz of [240, 144, 60, 30]) {
    const frames = many(10 * hz, 1000 / hz);
    const seen = play(frames);
    assert.ok(offBy(seen.steps, frames) <= 2, hz + ' Hz gave ' + seen.steps + ' steps for 10 seconds');
  }
});

test('a frame shorter than a step can owe nothing at all', () => {
  const frames = many(1000, 1);              // a 1000 Hz display, one second of it
  const seen = play(frames);
  assert.ok(seen.perFrame.some((t) => t.steps === 0), 'some frames asked for no step');
  assert.ok(offBy(seen.steps, frames) <= 2, 'and the run still only got one second of time');
});

test('a background tab is the clamp, not the gap', () => {
  const tabbed = play([1000 / 60, 5000]);
  const honest = play([1000 / 60, GAP * 1000]);

  assert.equal(tabbed.last.dt, GAP, 'five seconds away is counted as the clamp');
  assert.equal(tabbed.last.steps, honest.last.steps, 'and it runs exactly as many steps');
  assert.equal(tabbed.last.steps, Math.round(GAP / STEP), 'which is the catch-up limit');
});

test('alpha says where between two steps a frame is drawn', () => {
  const seen = play(many(240, 4));           // a display faster than the simulation
  for (const alpha of seen.alphas) {
    assert.ok(alpha >= 0 && alpha < 1, 'alpha is a fraction: ' + alpha);
  }
  assert.ok(seen.alphas.some((a) => a < 0.1), 'some frames are drawn just after a step');
  assert.ok(seen.alphas.some((a) => a > 0.9), 'and some just before the next one');
});

test('the clock does not leak time: nothing is invented, nothing is lost', () => {
  // Steps taken plus the time still sitting in the accumulator add up to the wall
  // clock, minus the one frame a fresh page has no previous frame for.
  const frames = many(400, 16.7);
  const seen = play(frames);
  const seconds = (frames.reduce((a, b) => a + b, 0) - frames[0]) / 1000;
  const accounted = seen.steps * STEP + seen.last.alpha * STEP;
  assert.ok(Math.abs(accounted - seconds) < STEP, accounted + ' accounted for, ' + seconds + ' on the wall clock');
});

test('reset stands a fresh page load up again', () => {
  const fresh = createClock(STEP, GAP);
  const old = createClock(STEP, GAP);
  for (let i = 1; i <= 777; i++) old.frame(i * 16.7);   // a page that has been open a while

  const plain = (tick) => ({ dt: tick.dt, steps: tick.steps, alpha: tick.alpha });
  old.reset();
  for (let i = 1; i <= 50; i++) {
    assert.deepEqual(plain(old.frame(i * 16.7)), plain(fresh.frame(i * 16.7)), 'frame ' + i);
  }
});

test('the frame readout counts frames, not steps', () => {
  assert.ok(Math.abs(play(many(300, 1000 / 60)).last.fps - 60) < 1, 'a 60 fps display reads 60');
  assert.ok(Math.abs(play(many(300, 1000 / 144)).last.fps - 144) < 2, 'and a 144 Hz one reads 144');
});
