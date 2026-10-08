// The bridge's own two pieces of machinery: the clock the world is stepped on, and
// the brief every agent reads first (tools/agent-bridge.js).
//
// The pump is the only place in the bridge that knows about real time, and it carries
// one decision worth pinning down: a bridge that was busy - answering a call, or
// waiting on an agent that thinks for ten seconds - is a player who looked away, not
// a debt the arena has to collect. So it catches up a little and forgives the rest,
// which is the same rule the engine gives a backgrounded tab (BALANCE.sim). The tests
// below hand it a clock of their own and say the rule as numbers.

import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CATCHUP, createPump } from '../tools/agent-bridge.js';
import { FRAME_MS } from '../tools/headless/bot.js';
import { BALANCE } from '../src/game/balance.js';

/** A pump on a clock the test winds by hand. */
function clocked(step) {
  let now = 0;
  const pump = createPump(step, {
    now: () => now,
    every: null,             // no timer: the test winds it
  });
  return { pump: pump, wind: (ms) => { now += ms; } };
}

test('the pump keeps one frame per frame of real time', () => {
  let frames = 0;
  const seen = clocked(() => { frames++; });

  seen.wind(FRAME_MS);
  assert.equal(seen.pump.tick(), 1);
  seen.wind(FRAME_MS);
  assert.equal(seen.pump.tick(), 1);
  seen.wind(FRAME_MS);
  assert.equal(seen.pump.tick(), 1);
  assert.equal(frames, 3);
});

test('a tick that is a little late makes up the difference', () => {
  let frames = 0;
  const seen = clocked(() => { frames++; });

  seen.wind(FRAME_MS * 2.4);
  assert.equal(seen.pump.tick(), 2, 'two frames were owed, two were run');
  seen.wind(FRAME_MS);
  assert.equal(seen.pump.tick(), 1, 'and it is back to one, with nothing carried over');
});

test('a long stall is forgiven, not owed', () => {
  let frames = 0;
  const seen = clocked(() => { frames++; });

  seen.wind(10000);          // the agent was thinking
  const caught = seen.pump.tick();
  assert.ok(caught <= MAX_CATCHUP, caught + ' frames is more than one tick may make up');
  assert.ok(caught > 1, 'and it still made up something, got ' + caught);

  seen.wind(FRAME_MS);
  assert.equal(seen.pump.tick(), 1, 'the rest of that ten seconds is simply gone');

  assert.equal(
    MAX_CATCHUP,
    Math.round(BALANCE.sim.maxFrameDt / (FRAME_MS / 1000)),
    'the cap is the engine\'s own frame gap, not a number invented here');
});

test('a stopped pump stops', () => {
  let frames = 0;
  const seen = clocked(() => { frames++; });
  seen.pump.stop();
  seen.wind(FRAME_MS * 5);
  assert.equal(frames, 0);
});
