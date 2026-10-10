// The point vacuum (milestone 10, the owner's request of 2026-10-10: "every 10,000 points scored,
// every existing point on the screen should auto-stream to the player ship. During this 10 second
// event, play some excited music").
//
// Two of those sentences are simulation and they are what this file holds down; the third is the
// fanfare and lives in test/music.test.mjs. The four decisions in `BALANCE.vacuum` each get a test
// here, in the order the row writes them:
//
//   **in the arena, not on the screen** - a shard in the far corner arrives;
//   **a window and not a photograph** - a shard that drops at second five arrives too;
//   **a shard's own clock keeps running** - a shard that was already on its last breath on the far
//     side of the world is not rescued, and the well does not claim it;
//   **priced like a card** - the counters that make the thing measurable on runs
//     (`tools/simulate.js`, `tools/balance-report.js`) tell the truth about who collected what.
//
// Around those: the arithmetic of the crossing itself (one opening per crossing, however far a large
// shard's worth of points jumped), the ten seconds being spent in step time so a card cannot eat a
// reward, and a new run getting a well of its own.
//
// The scripted world's ship sits in the middle of the arena and cannot be hurt, and a planted shard
// does not move until the well opens, so "the far corner" and "ten seconds" are facts this file
// chooses rather than races it hopes to win.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { resetRun } from '../src/game/run.js';
import { dropShards } from '../src/game/pickups.js';
import {
  drawIn, isVacuuming, nextThresholdOf, resetVacuum, vacuumEventsOf, vacuumLeftOf,
  vacuumSwallowedOf,
} from '../src/game/vacuum.js';
import { scriptedRun, shardAt, stepTheWorld } from '../tools/headless/scripted.js';

const VAC = BALANCE.vacuum;
const EVERY = VAC.every;
const ARENA = BALANCE.arena;
const STEP = BALANCE.sim.step;

/** A run with nothing in it and no levels to be had, so the only event is the one under test. */
function flying(seed) {
  const field = scriptedRun(seed === undefined ? 4100 : seed);
  field.xpNeed = Infinity;
  return field;
}

/** Step the world for `seconds` of the game's own steps. */
function forSeconds(seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) stepTheWorld();
}

/** Pay for the well by scoring, which is the only door it is ever opened by. */
function payFor(field) {
  field.score = EVERY;
  stepTheWorld();
  return field;
}

/** The arena's four corners, which are the four farthest places from a ship parked in the middle. */
const CORNERS = [
  [1, 1], [ARENA.w - 1, 1], [1, ARENA.h - 1], [ARENA.w - 1, ARENA.h - 1],
];

// --- the crossing ---------------------------------------------------------------------

test('nothing opens before the first threshold is crossed', () => {
  const field = flying();
  field.score = EVERY - 1;
  forSeconds(2);
  assert.equal(vacuumEventsOf(field), 0, 'a run a point short of the row has never seen the well');
  assert.equal(isVacuuming(field), false);
  assert.equal(nextThresholdOf(field), EVERY, 'and it is still owed at the row, not a point later');
});

test('the crossing opens the well for the whole of the ten seconds', () => {
  const field = flying();
  payFor(field);
  assert.equal(isVacuuming(field), true, 'the step that crossed the line is the step it opened on');
  assert.equal(vacuumEventsOf(field), 1);
  assert.ok(vacuumLeftOf(field) > VAC.duration - STEP, 'for all of it: ' + vacuumLeftOf(field));

  forSeconds(VAC.duration - 0.5);
  assert.ok(isVacuuming(field), 'and it is still open with half a second to go');
  forSeconds(1);
  assert.equal(isVacuuming(field), false, 'and then it is shut');
  assert.equal(vacuumLeftOf(field), 0, 'and nothing is left owing');
});

test('one crossing is one opening, however far the score jumped', () => {
  // A large shard is worth six of the ordinary ones (BALANCE.shards.big) and a body can pay a
  // thousand at a stroke, so one step can walk past two thresholds. Two openings would be one event
  // wearing two fanfares, so the next threshold steps past the score and not past the last one.
  const field = flying();
  field.score = EVERY * 2.5;
  stepTheWorld();
  assert.equal(vacuumEventsOf(field), 1);
  assert.equal(nextThresholdOf(field), EVERY * 3);

  forSeconds(VAC.duration + 1);
  assert.equal(vacuumEventsOf(field), 1, 'and the threshold it jumped is not owed twice');

  field.score = EVERY * 3;
  stepTheWorld();
  assert.equal(vacuumEventsOf(field), 2, 'but the next one is');
  assert.equal(nextThresholdOf(field), EVERY * 4);
});

test('a card holds the ten seconds and gives them back', () => {
  // `left` is spent in step time, which is what makes the reward survive being rewarded for: the
  // flood is worth more shards than a level's worth and a level is a card, and a card the player is
  // reading would otherwise be ten seconds of well spent reading it.
  const field = flying();
  payFor(field);
  const at = vacuumLeftOf(field);

  field.state = STATE.LEVEL;
  for (let i = 0; i < 200; i++) stepTheWorld();
  assert.equal(vacuumLeftOf(field), at, 'the well waited with the rest of the run');

  field.state = STATE.PLAY;
  stepTheWorld();
  assert.ok(vacuumLeftOf(field) < at, 'and started spending again when the card was answered');
});

test('a new run gets a well of its own', () => {
  const field = flying();
  payFor(field);
  shardAt(field.player.x + 40, field.player.y);
  forSeconds(0.5);
  assert.ok(vacuumEventsOf(field) > 0 && vacuumSwallowedOf(field) > 0);

  resetRun(field);
  assert.equal(vacuumLeftOf(field), 0, 'last run\'s ten seconds are not this run\'s');
  assert.equal(nextThresholdOf(field), EVERY, 'and this run owes itself its first reward');
  assert.equal(vacuumEventsOf(field), 0);
  assert.equal(vacuumSwallowedOf(field), 0);
});

// --- what the well does to the loot ---------------------------------------------------

test('a shard in the far corner of the arena is in the ship\'s hands inside the ten seconds', () => {
  // The first decision: "on the screen" means in the arena. The window is a tenth of the world, so a
  // well that only reached the view would leave nine tenths of the loot lying where it was, and a
  // shard the player never saw is one they will swear was there.
  const field = flying();
  payFor(field);
  for (const [x, y] of CORNERS) shardAt(x, y);

  forSeconds(VAC.duration);
  assert.equal(field.shardsCollected, CORNERS.length,
    'every corner of a 3000 x 3000 arena came back to the ship');
  assert.equal(field.shards.count, 0, 'and none of them went to the clock on the way');
});

test('the well carries a shard at the speed the row says, and gets the far corner in before it shuts', () => {
  const field = flying();
  payFor(field);
  const shard = shardAt(ARENA.w - 1, ARENA.h - 1);
  const ship = field.player;
  const straight = Math.hypot(ship.x - shard.x, ship.y - shard.y);

  let fastest = 0;
  let steps = 0;
  while (field.shards.count > 0 && steps < VAC.duration / STEP) {
    stepTheWorld();
    steps++;
    if (field.shards.count === 0) break;
    fastest = Math.max(fastest, Math.hypot(shard.vx, shard.vy));
  }
  const seconds = steps * STEP;
  const floor = straight / VAC.speed;
  assert.equal(field.shardsCollected, 1, 'the far corner came all the way in');
  assert.ok(isVacuuming(field), 'and it arrived while the well was still open');
  assert.ok(seconds > floor * 0.9,
    'a ' + seconds.toFixed(1) + 's walk, and not faster than the row allows');
  assert.ok(seconds < floor * 1.4,
    'with no more than a turn-in and a curve added to it: ' + Math.round(straight) + ' px');
  assert.ok(fastest <= VAC.speed * 1.02,
    'it never outran the row: ' + Math.round(fastest) + ' against ' + VAC.speed);
});

test('what drops during the ten seconds is caught by them', () => {
  // The second decision: the window is the promise, not a photograph taken the moment the score
  // crossed. A kill during the reward is paid out at once, which is the half of this that a player
  // fighting for it will actually feel.
  const field = flying();
  payFor(field);
  forSeconds(VAC.duration - 4);
  assert.ok(isVacuuming(field), 'with four seconds still to run');

  dropShards(field, 2, 2, 5);
  forSeconds(4);
  assert.equal(field.shardsCollected, 5,
    'a pile scattered on the far side of the world at second six still arrives');
  assert.equal(field.player.x, ARENA.w / 2,
    'and the ship never had to move an inch for it');
});

test('a shard whose own clock runs out on the way is not the well\'s', () => {
  // The third decision: nothing is rescued from its own expiry. Every corner of the arena is a 3.7 s
  // walk at the row's speed, so holding shard clocks back would never be noticed except by a shard
  // that was already gone - and a rule nobody can see is a rule nobody keeps.
  const field = flying();
  payFor(field);
  const dying = shardAt(1, 1);
  dying.life = 0.4;

  forSeconds(1);
  assert.equal(field.shards.count, 0, 'it went out on the way');
  assert.equal(field.shardsCollected, 0, 'and the well did not claim it');
  assert.equal(vacuumSwallowedOf(field), 0);
});

test('the well counts the loot that came through it and not the loot the run collected', () => {
  // `swallowed` is the number the thing is priced on, so it may not be a synonym for
  // `shardsCollected`: three shards arrive while it is open, two more after it has shut.
  const field = flying();
  payFor(field);
  const ship = field.player;
  for (let i = 0; i < 3; i++) shardAt(ship.x + 120 + i, ship.y);
  forSeconds(0.6);
  assert.equal(field.shardsCollected, 3);
  assert.equal(vacuumSwallowedOf(field), 3);

  forSeconds(VAC.duration);
  assert.equal(isVacuuming(field), false);
  for (let i = 0; i < 2; i++) shardAt(ship.x + 120 + i, ship.y);
  forSeconds(2);
  assert.equal(field.shardsCollected, 5, 'the ship still has its own net, of course');
  assert.equal(vacuumSwallowedOf(field), 3, 'and it does not count as the well\'s');
});

test('a shard on its way in keeps its own momentum for a moment', () => {
  // `turn` is an exponential and not a switch: a shard flying sideways sweeps onto the line instead
  // of snapping onto it, which is what makes it a stream and not a set of arrows.
  const field = flying();
  const shard = shardAt(field.player.x, field.player.y + 400);
  shard.vx = 300;          // a shard thrown across the ship's path
  const sideways = shard.vx;
  payFor(field);
  stepTheWorld();
  assert.ok(shard.vx > 0, 'the first step has not wiped its own heading: ' + shard.vx.toFixed(1));
  assert.ok(shard.vx < sideways, 'and it is being traded away for the well');
  assert.ok(shard.vy < 0, 'the pull is already on the other axis');
});

test('the well is open or it is not, and nothing in between', () => {
  const field = flying();
  assert.equal(isVacuuming(field), false);
  assert.equal(nextThresholdOf(field), EVERY);
  assert.equal(vacuumLeftOf(field), 0);
  // And a well that was never opened leaves the loot alone: this is the "off" half of the proof,
  // the one a reference run cannot make because a reference run opens the well several times.
  const shard = shardAt(field.player.x + 600, field.player.y);
  forSeconds(2);
  assert.equal(shard.x, field.player.x + 600, 'a shard outside the ship\'s own net does not move');
  assert.equal(field.shardsCollected, 0);
});

test('resetting the well empties it, wherever its timer stood', () => {
  const field = flying();
  payFor(field);
  field.score = EVERY * 7;
  assert.ok(vacuumLeftOf(field) > 0);
  resetVacuum(field);
  assert.equal(vacuumLeftOf(field), 0);
  assert.equal(nextThresholdOf(field), EVERY);
  assert.equal(vacuumEventsOf(field), 0);
});

test('the well says its own name over the ship, once, on the step it opens', () => {
  // The word that floats up from the hull and the word the HUD prints are the same string out of the
  // same row, which is the only thing that can keep them spelled the same. The rings are the other
  // half of the moment: the mouth falling in and the flare at the ship, and nothing else.
  const field = flying();
  assert.equal(field.texts.count, 0, 'a scripted run has nothing floating over it');
  payFor(field);

  const said = field.texts.items.filter((label) => label.text === VAC.start.word);
  assert.equal(said.length, 1, 'one word, and it is the row\'s own');
  const rings = field.rings.items;
  assert.equal(rings.length, 2, 'the mouth and the flare');
  assert.ok(rings.some((r) => r.vr < 0 && r.r === VAC.start.mouth.radius),
    'and the wide one is on its way in from exactly the radius the row named');
});

test('drawing in a shard is the well\'s own arithmetic on a velocity and nothing else', () => {
  // `drawIn` must not move anything: the px/py contract says a position only changes inside a
  // system that snapshots it first, and that system is game/pickups.js.
  const field = flying();
  const shard = shardAt(300, 900);
  const before = { x: shard.x, y: shard.y, px: shard.px, py: shard.py };
  drawIn(field, shard, STEP);
  assert.equal(shard.x, before.x);
  assert.equal(shard.y, before.y);
  assert.equal(shard.px, before.px);
  assert.equal(shard.py, before.py);
  assert.ok(shard.vx !== 0 || shard.vy !== 0, 'but it has been told which way to go');
});
