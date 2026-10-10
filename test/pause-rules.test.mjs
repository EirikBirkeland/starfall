// The rules behind the pause, on the scripted world (game/run.js, game/world.js): who may be held,
// what a held step is, and what giving a run up does.
//
// The other file about the pause (test/pause.test.mjs) drives a booted game and reads the glass. This
// one has no browser in it at all, because what it is checking is the simulation's side of the deal:
// that a held run is *not stepped*, that the flag belongs to the run and dies with `resetRun`, and
// that a give-up is an ending like any other - banked, and paid once.

import test from 'node:test';
import assert from 'node:assert/strict';

import { scriptedRun, stepTheWorld, enemyAt } from '../tools/headless/scripted.js';
import { world, stepWorld } from '../src/game/world.js';
import { STATE } from '../src/game/state.js';
import { BALANCE } from '../src/game/balance.js';
import { pauseRun, resumeRun, abandonRun, resetRun } from '../src/game/run.js';
import { dustForRun } from '../src/game/stardust.js';

const STEP = BALANCE.sim.step;

function frames(howMany, input) {
  for (let i = 0; i < howMany; i++) stepTheWorld(input);
}

test('only a run that is flying can be held', () => {
  const world_ = scriptedRun(11);
  assert.equal(world_.state, STATE.PLAY);
  assert.equal(pauseRun(world_), true, 'a flying run says yes');
  assert.equal(world_.paused, true);
  assert.equal(pauseRun(world_), true, 'and asking twice is not an error, it is the same answer');

  resumeRun(world_);
  assert.equal(world_.paused, false);
  assert.equal(resumeRun(world_), false, 'letting go of a run that was never held is nothing');

  for (const state of [STATE.START, STATE.LEVEL, STATE.OVER, STATE.WON]) {
    world_.paused = false;
    world_.state = state;
    assert.equal(pauseRun(world_), false, state + ' is not a run to hold');
    assert.equal(world_.paused, false, 'and it is not held by proxy either');
  }
  world_.state = STATE.PLAY;
});

test('a held step is not a step', () => {
  const world_ = scriptedRun(12);
  const walker = enemyAt('drifter', world_.player.x + 90, world_.player.y);
  pauseRun(world_);

  const at = walker.x;
  const clock = world_.elapsed;
  let answered = 0;
  for (let i = 0; i < 60; i++) {
    if (stepWorld(STEP, { moveX: 0, moveY: 0, moving: false, aimX: 0, aimY: 0, firing: false, dash: false })) {
      answered++;
    }
  }
  assert.equal(answered, 0, 'every held step answered "nothing happened", as a hit-stop step does');
  assert.equal(world_.elapsed, clock, 'the run clock did not move');
  assert.equal(walker.x, at, 'and nothing in the arena moved');

  // The frame loop asks this question to decide whether a one-shot request was heard. A dash asked
  // for while the run is held is not heard - and main.js spends it rather than banking it, which is
  // what test/pause.test.mjs checks through the real keys.
  world_.player.dashCd = 0;
  world_.player.dashLeft = 0;
  stepTheWorld({ dash: true });
  assert.equal(world_.player.dashLeft, 0, 'a dash asked for in a pause went nowhere');
  assert.equal(world_.player.dashCd, 0, 'and did not even start the wait');
  resumeRun(world_);
});

test('a held run still lets the window breathe', () => {
  // The bargain the level-up pause already strikes: the arena holds and the glass does not. A panel
  // over a screen that has stopped painting is a hang, and the sky and the sparks are the glass.
  const world_ = scriptedRun(13);
  frames(10);
  pauseRun(world_);
  const session = world_.time;
  const clock = world_.elapsed;
  frames(30);
  assert.ok(world_.time > session, 'the session clock went on');
  assert.equal(world_.elapsed, clock, 'the run clock did not');
  resumeRun(world_);
  frames(10);
  assert.ok(world_.elapsed > clock, 'and it picked up where it left off');
});

test('a new run is not born held', () => {
  const world_ = scriptedRun(14);
  pauseRun(world_);
  assert.equal(world_.paused, true);
  resetRun(world_);
  assert.equal(world_.paused, false, 'the pause belongs to the run, and goes with it');
});

test('giving a run up ends it, and banks it like any other ending', () => {
  const world_ = scriptedRun(15);
  frames(120);
  world_.score = 50000;
  pauseRun(world_);

  const worth = dustForRun(world_);
  assert.equal(abandonRun(world_), true);
  assert.equal(world_.state, STATE.OVER, 'the run is over');
  assert.equal(world_.paused, false, 'and an ending is not a held run');
  assert.equal(world_.newBest, true, 'the best is the best whichever way the run stopped');
  assert.equal(world_.best, 50000);
  assert.equal(world_.dustPaid, worth, 'and the purse paid what the run was worth (game/stardust.js)');
  assert.equal(world_.tally.killedBy, '', 'nothing killed it, and the tally is not asked to lie');

  assert.equal(abandonRun(world_), false, 'a wreck cannot be given up twice');
});

test('give-up needs a flying run, paused or not', () => {
  const world_ = scriptedRun(16);
  world_.state = STATE.START;
  assert.equal(abandonRun(world_), false, 'there is no run');
  world_.state = STATE.LEVEL;
  assert.equal(abandonRun(world_), false, 'the cards are answered with a card');
  world_.state = STATE.WON;
  assert.equal(abandonRun(world_), false, 'a won run is left with the card\'s own two keys');
  world_.state = STATE.PLAY;
  assert.equal(abandonRun(world_), true, 'a flying one is yours to give up');
  assert.equal(world_.paused, false);
});
