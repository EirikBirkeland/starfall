// THICK CROWD (PLAN, After 1.0): the fourth challenge rule, and the one that is about the arena
// rather than the ship. The wave director's budget and the wall on standing bodies both stand
// `BALANCE.challenges.thick.holdMul` taller for the whole run, and that is the whole rule.
//
// Three promises, in the order they are worth checking:
//
//   The lever answers its neutral number for every other run. One multiply, in two functions, and a
//     run that is not flying the rule is multiplied by exactly 1 - which is why the reference run has
//     never noticed any of this.
//
//   The rule reaches the director, and the director obeys it. Not "the number is bigger" but "the
//     arena actually stands more bodies, and no more than the taller wall says".
//
//   The endless wall is still the outer wall. `endless.growth.bodiesCeil` is a frame budget that has
//     been timed on a real frame, and a challenge is not allowed to move it.
//
// One trap for anybody adding tests here: `scriptedRun` hands back *the one world of the process*, so
// two fields in the same test are the same object and comparing them compares nothing. Every number a
// test wants is read out of the world and into a local before the next `scriptedRun` overwrites it -
// which is what `measureUnder` below is for.
//
// The batches that priced the number itself are `tools/challenge-cost.js` (its `--hold` sweeps it) and
// the figures are written into the balance row; this file is about the wiring, not the tuning.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import { scriptedRun } from '../tools/headless/scripted.js';
import { makeEnemy } from '../src/game/kinds.js';
import { bodyCeiling, crowdBudget, crowdCost, updateWaves } from '../src/game/waves.js';
import { crowdHoldOf, saysOf, setChallenge } from '../src/game/challenges.js';

const W = BALANCE.waves;
const G = BALANCE.endless.growth;
const T = BALANCE.challenges.thick;
const ARENA = BALANCE.arena;
const SHIP = { x: ARENA.w / 2, y: ARENA.h / 2 };
const STEP = BALANCE.sim.step;
const MINUTE = 60;

/**
 * A run aged to `seconds`, flying `challenge`, with the director listening.
 *
 * The rule is written on every call rather than left over: `world.challenge` outlives a run on purpose
 * (game/challenges.js), so a test that forgets it is measuring whatever the test before it chose - the
 * trap `tools/challenge-cost.js` documents for its own batches.
 */
function runAged(seed, seconds, challenge) {
  const field = scriptedRun(seed);
  field.arena.w = ARENA.w;
  field.arena.h = ARENA.h;
  field.player.x = SHIP.x;
  field.player.y = SHIP.y;
  field.elapsed = seconds || 0;
  field.spawnTimer = 0;
  setChallenge(field, challenge);
  return field;
}

/**
 * One world, built and read before the next one is built. `what` is handed the field and its answer
 * is kept in a local, which is the only way two runs can be compared in a single process.
 */
function measureUnder(challenge, seconds, what) {
  return what(runAged(301, seconds, challenge));
}

/** Step the director for `seconds` and answer how many bodies are standing when it stops. */
function crowdAfter(field, seconds) {
  const ticks = Math.round(seconds / STEP);
  for (let i = 0; i < ticks; i++) {
    field.elapsed += STEP;
    updateWaves(field, STEP);
  }
  return field.enemies.length;
}

/** Stand `n` bodies in the arena, however cheap they have to be. */
function fillBodies(field, n) {
  for (let i = 0; i < n; i++) {
    field.enemies.push(makeEnemy(field, 'swarmling', SHIP.x + 60 + i * 8, SHIP.y + 60));
  }
  return field.enemies.length;
}

/** A run that has been handed its arena back and flown `minutes` of endless under `challenge`. */
function handedBack(minutes, challenge, what) {
  const from = BALANCE.bosses.schedule[BALANCE.bosses.schedule.length - 1].at;
  const field = runAged(5, from + minutes * MINUTE, challenge);
  field.endless = true;
  field.endlessAt = from;
  return what(field);
}

// ---------------------------------------------------------------------------
// The lever
// ---------------------------------------------------------------------------

test('the rule answers where the number is read, and nowhere else', () => {
  assert.equal(crowdHoldOf(runAged(300, 0, '')), 1, 'no rule: the arena holds what it ships');
  assert.equal(crowdHoldOf(runAged(300, 0, 'brittle')), 1, 'one hull says nothing about the crowd');
  assert.equal(crowdHoldOf(runAged(300, 0, 'swift')), 1, 'nor does a swift one');
  assert.equal(crowdHoldOf(runAged(300, 0, 'grounded')), 1);
  assert.equal(crowdHoldOf(runAged(300, 0, 'thick')), T.holdMul);
});

test('the rule multiplies the budget and the wall on bodies, from the first step', () => {
  const plainStart = measureUnder('', 0, (f) => [crowdBudget(f), bodyCeiling(f)]);
  const thickStart = measureUnder('thick', 0, (f) => [crowdBudget(f), bodyCeiling(f)]);
  assert.equal(thickStart[0], plainStart[0] * T.holdMul, 'the budget, at the start');
  assert.equal(thickStart[1], Math.round(W.maxBodies * T.holdMul), 'and the wall, at the start');

  // ...and at the end of the schedule\u2019s own curve, where both walls have levelled off.
  const plainLate = measureUnder('', 900, (f) => [crowdBudget(f), bodyCeiling(f)]);
  const thickLate = measureUnder('thick', 900, (f) => [crowdBudget(f), bodyCeiling(f)]);
  assert.equal(plainLate[0], W.crowdMax, 'plain stops at the schedule\u2019s ceiling');
  assert.equal(thickLate[0], W.crowdMax * T.holdMul);
  assert.equal(plainLate[1], W.maxBodies);
  assert.equal(thickLate[1], Math.round(W.maxBodies * T.holdMul));
});

test('the endless clock is outside the rule, and so is its ceiling', () => {
  const minutes = 4;
  const plain = handedBack(minutes, '', crowdBudget);
  const thick = handedBack(minutes, 'thick', crowdBudget);
  // The rule multiplies the schedule\u2019s terms and not the second clock\u2019s additions, which are
  // what a handed-back run is mostly made of by now.
  assert.equal(thick, plain + W.crowdMax * (T.holdMul - 1));
  assert.ok(thick - plain > 100, 'the endless growth is in there and untouched');

  // The wall on bodies is the frame budget\u2019s, and a challenge does not lift it.
  const plainWall = handedBack(minutes, '', bodyCeiling);
  const thickWall = handedBack(minutes, 'thick', bodyCeiling);
  assert.ok(thickWall >= plainWall, 'the rule lifts the schedule\u2019s wall up to it');
  assert.ok(thickWall <= G.bodiesCeil,
    'and no further: ' + thickWall + ' against the frame budget\u2019s ' + G.bodiesCeil);
  assert.equal(handedBack(60, 'thick', bodyCeiling), G.bodiesCeil,
    'an hour of endless under the rule is still that wall and nothing above it');
});

test('the rule says its own number, whatever it is', () => {
  // The sentence is built out of the row rather than written beside it, so moving the share cannot
  // leave the card claiming a crowd it is not holding (the same promise `test/challenges.test.mjs`
  // makes about the swift crowd\u2019s speed).
  const shipped = T.holdMul;
  try {
    T.holdMul = 1.25;
    assert.equal(saysOf('thick'), 'the arena holds 25% more of the crowd');
    T.holdMul = 2;
    assert.equal(saysOf('thick'), 'the arena holds 100% more of the crowd');
  } finally {
    T.holdMul = shipped;
  }
  assert.match(saysOf('thick'), new RegExp(Math.round((shipped - 1) * 100) + '% more'));
});

test('the rule is on the world and not in the director\u2019s memory', () => {
  // The director asks the world every time. A rule cached into the field would be a rule that could
  // not be switched off between runs, which is the whole bargain challenges strike (game/challenges.js).
  const field = runAged(304, 300, '');
  const before = crowdBudget(field);
  setChallenge(field, 'thick');
  assert.equal(crowdBudget(field), before * T.holdMul, 'put on: the budget goes up');
  setChallenge(field, '');
  assert.equal(crowdBudget(field), before, 'and off again, exactly where it was');
});

// ---------------------------------------------------------------------------
// The director, obeying it
// ---------------------------------------------------------------------------

test('the arena really stands more of the crowd under the rule, and no more than its wall', () => {
  const seconds = 60;
  const plain = crowdAfter(runAged(302, 240, ''), seconds);
  const thick = crowdAfter(runAged(302, 240, 'thick'), seconds);
  const wall = measureUnder('thick', 300, bodyCeiling);
  assert.ok(plain > 4, 'the plain run has a crowd to be compared with: ' + plain);
  assert.ok(thick > plain * 1.3,
    'the thick one stands ' + thick + ' against ' + plain + ', which is not much of a crowd');
  assert.ok(thick <= wall, 'and it is under the taller wall: ' + thick + ' of ' + wall);

  // The same promise the plain director is held to: it fills the room it may hold, and does not
  // overspend it. Read on its own world, because the crowd and the budget belong to one field.
  const field = runAged(302, 240, 'thick');
  crowdAfter(field, seconds);
  assert.ok(crowdCost(field) > crowdBudget(field) - W.waveMaxPoints,
    'the room is spent: ' + crowdCost(field) + ' points of a ' + crowdBudget(field) + ' budget');
});

test('the taller wall is still a wall', () => {
  const field = runAged(303, 600, 'thick');
  const wall = bodyCeiling(field);
  assert.ok(wall > W.maxBodies, 'the rule has lifted it: ' + wall + ' against ' + W.maxBodies);
  const bodies = fillBodies(field, wall);
  assert.ok(crowdBudget(field) - crowdCost(field) > W.waveMinPoints,
    'there is room by the budget alone, so it is the bodies that are full');
  assert.equal(updateWaves(field, STEP), null, 'nothing arrives at the ceiling');
  assert.equal(field.enemies.length, bodies, 'not one body');
  assert.equal(field.spawnTimer, W.retry, 'and it will look again shortly, not next minute');
});
