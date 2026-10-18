// The bot's loot habit (tools/headless/loot.js): where its feet go when nothing is wrong.
//
// This is a test about the *instrument* and not about the game - what the shard net pulls, and what
// a collected shard pays, live in test/shards.test.mjs and test/attractor.test.mjs. What lives here
// is the claim that a bot given `--loot` goes and gets the loot (tools/loot-habit.js is the ladder
// that says what that is worth), and the claims about how far it will go, which shard it picks, and
// how long it will keep walking for, which are the habit's own three rules.
//
// The rule the whole file is arranged around is the one that makes a loot habit safe to put on a
// measuring instrument at all: **the walk replaces the drift to the middle and nothing else**. A
// habit that could outvote a dodge would be measuring the game and the bot's own bad habits at the
// same time, so one test below plants a shard at right angles to a threat and insists the ship
// takes the threat.
//
// The last two tests are about the ladder itself (`tools/loot-habit.js`) rather than the habit: that
// it refuses a bad dial before it plays anything, and that it flies every row and asks the head-to-
// head question. They spawn the tool, like test/line-ab.test.mjs does.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BALANCE } from '../src/game/balance.js';
import { makeEnemy } from '../src/game/kinds.js';
import { shardAt } from '../tools/headless/scripted.js';
import { bootGame } from '../tools/headless/harness.js';
import {
  forage, forageWary, forageImpatient, FORAGE, LOOT, LOOT_HABITS, DEFAULT_LOOT_HABIT,
  lootHabitOf, setLootDial,
} from '../tools/headless/loot.js';
import { playOneRun, botFrame, setLootHabit, FRAME_MS } from '../tools/headless/bot.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 71 });
const world = game.world;
const ship = world.player;
const ARENA = BALANCE.arena;
const CENTRE = { x: ARENA.w / 2, y: ARENA.h / 2 };
const NET = BALANCE.shards.magnetRadius;
const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];

/**
 * A run with the ship parked where the test wants it and nothing in the arena but what the test
 * plants. Spawn is stopped, the ship cannot be hurt, there is nothing to level up for: these tests
 * are about which way the ship walks, and a weaver wandering in or a rack opening halfway through
 * would decide that instead.
 */
function park(x, y) {
  if (world.state !== game.STATE.PLAY) {
    game.pressMouse(CENTRE.x, CENTRE.y - 200);       // the left button launches the run
    game.step(FRAME_MS);
  }
  for (const code of KEYS) game.key(code, false);
  world.spawnTimer = Infinity;
  world.enemies.length = 0;
  world.shards.clear();
  world.xpNeed = Infinity;
  ship.invuln = Infinity;
  ship.hull = 3;
  ship.x = x === undefined ? CENTRE.x : x;
  ship.y = y === undefined ? CENTRE.y : y;
  ship.px = ship.x;
  ship.py = ship.y;
  ship.vx = 0;
  ship.vy = 0;
  game.moveMouse(ship.x + 200, ship.y);
  setLootHabit(DEFAULT_LOOT_HABIT);
}

/** A shard lying at (x, y), still, with `life` seconds and `worth` shards' pay if the test says so. */
function plant(x, y, life, worth) {
  const shard = shardAt(x, y, worth);
  if (life !== undefined) shard.life = life;
  return shard;
}

/**
 * Put `n` bodies on a pile - what a person means by "there are three of them on that one". They are
 * inert (no speed, no drop, and nothing in these tests steps the world while it is deciding) and they
 * sit within `LOOT.crowd` of the shard, which is the only distance the habit can see.
 */
function sit(n, x, y) {
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996;            // a golden spread, so they are not all in one line
    const r = 30 + 12 * i;            // ...and none of them on top of the shard itself
    world.enemies.push(makeEnemy(world, 'drifter', x + Math.cos(a) * r, y + Math.sin(a) * r, {
      hp: 1e6, speed: 0, drop: 0, score: 0,
    }));
  }
}

/**
 * Drive the bot for `frames` frames and say where the ship got to: where it finished, and how far
 * east it ever got. The second one is what a test wants when the ship may bank the shard mid-flight
 * and start walking home again - which is the habit working, not a test going wrong.
 */
function fly(frames, policy) {
  const from = { x: ship.x, y: ship.y };
  let furthestEast = 0;
  for (let i = 0; i < frames; i++) {
    botFrame(game, policy);
    game.step(FRAME_MS);
    furthestEast = Math.max(furthestEast, ship.x - from.x);
  }
  return { x: ship.x, y: ship.y, east: furthestEast };
}

/** How much a unit direction agrees with a vector from the ship to a place. */
function agreement(dir, to) {
  if (dir === null) return 0;
  const length = Math.hypot(to.x, to.y) || 1;
  return (dir.x * to.x + dir.y * to.y) / length;
}

test('the walk goes for a shard the net cannot reach', () => {
  park();
  assert.equal(forage(game), null, 'the habit found a shard in an empty arena');
  // Out past the net, or the walk would be redundant: this is the loot the ship has to fly to.
  const shard = plant(ship.x + NET + 200, ship.y + 60);
  const dir = forage(game);
  assert.ok(dir !== null, 'the habit would not walk to a shard the net cannot touch');
  assert.ok(agreement(dir, { x: shard.x - ship.x, y: shard.y - ship.y }) > 0.9,
    'the walk went nowhere near the shard');
});

test('how far off a shard may be and still be worth getting up for', () => {
  park();
  plant(ship.x + LOOT.reach + 150, ship.y);
  assert.equal(forage(game), null, 'the habit walked past the reach it ships with');
  world.shards.clear();
  plant(ship.x + LOOT.reach - 150, ship.y);
  assert.ok(forage(game) !== null, 'the habit left a shard inside its own reach on the floor');
  // And the dial is a dial: shortening it to nothing is the habit not running, which is what the
  // ladder flies as `off` and what a sweep of the shipped number has to be able to come back to.
  const before = LOOT.reach;
  try {
    setLootDial({ reach: 0 });
    assert.equal(forage(game), null, 'a walk of no distance still went somewhere');
  } finally {
    setLootDial({ reach: before });
  }
});

test('a shard that will rot before the ship gets there is not worth the trip', () => {
  park();
  const far = 600;
  const walk = far / ship.maxSpeed;
  // One frame of grace short of arriving in time, and then one frame long: the rule is the ship's
  // own top speed and the shard's own clock, so both halves of it are checkable.
  plant(ship.x + far, ship.y, walk + LOOT.grace - 0.05);
  assert.equal(forage(game), null, 'the habit set off for a shard that will not be there');
  world.shards.clear();
  plant(ship.x + far, ship.y, walk + LOOT.grace + 0.05);
  assert.ok(forage(game) !== null, 'the habit left a shard it had time to reach');
});

test('an elite pile is worth a longer walk than a small one', () => {
  park();
  const small = plant(ship.x + 200, ship.y - 40);
  const bigWorth = BALANCE.shards.big.worth;
  const big = plant(ship.x - 520, ship.y, undefined, bigWorth);
  const dir = forage(game);
  assert.ok(dir !== null);
  assert.ok(agreement(dir, { x: big.x - ship.x, y: big.y - ship.y }) > 0.9,
    'the habit went for the small shard next to it instead of the elite pile four times further out');
  // And with the big one gone the small one is worth walking to on its own, which is the same
  // arithmetic with one fewer term and is what stops the rule being "only elites matter".
  world.shards.clear();
  plant(small.x, small.y);
  const back = forage(game);
  assert.ok(agreement(back, { x: small.x - ship.x, y: small.y - ship.y }) > 0.9,
    'with the elite gone the plain shard next door was left behind');
});

test('a pile with bodies sitting on it is worth walking round', () => {
  // The whole of the second habit, in one pair of identical piles.
  park();
  const out = 400;
  const east = plant(ship.x + out, ship.y);
  plant(ship.x - out, ship.y);
  // With nobody on either pile the two are worth exactly the same and the habit takes the first it
  // came to - the baseline, so that what changes below is the crowd and nothing else.
  assert.ok(agreement(forageWary(game), { x: 1, y: 0 }) > 0.9,
    'with both piles clear the habit did not go for the first one it came to');
  // Three bodies sit on the east one. `greedy` does not look and still walks east; `wary` turns
  // round and takes the identical pile behind it, which is the difference between a person
  // choosing a pile and a ray-tracer walking into a crowd.
  sit(3, east.x, east.y);
  assert.ok(agreement(forage(game), { x: 1, y: 0 }) > 0.9,
    'greedy changed its mind about a crowd it never looks at');
  assert.ok(agreement(forageWary(game), { x: -1, y: 0 }) > 0.9,
    'wary walked into a pile with three bodies on it while an identical one sat clear behind it');
  // Take the bodies away and east wins again: the crowd was the only thing that moved.
  world.enemies.length = 0;
  assert.ok(agreement(forageWary(game), { x: 1, y: 0 }) > 0.9,
    'the walk stayed off a pile it had no reason left to avoid');
});

test('a big pile buys its way past the crowd sitting on it', () => {
  // A discount and not a veto, in the game's own numbers: an elite pile is worth 6 of the plain
  // ones, so two bodies on it leave 6/3 and it still beats a plain shard a similar distance off;
  // six bodies leave 6/7 and it does not. That is a person going round two bodies for an elite's
  // handful and not going near one with six on it.
  park();
  const out = 400;
  const elite = plant(ship.x + out, ship.y, undefined, BALANCE.shards.big.worth);
  plant(ship.x - out, ship.y);
  sit(2, elite.x, elite.y);
  assert.ok(agreement(forageWary(game), { x: 1, y: 0 }) > 0.9,
    'an elite pile with two bodies on it lost to a plain shard sitting clear');
  sit(4, elite.x, elite.y);
  assert.ok(agreement(forageWary(game), { x: -1, y: 0 }) > 0.9,
    'six bodies on an elite pile were still worth a walk for its six shards');
});

test('with nothing counted as a crowd, wary is greedy and nothing else', () => {
  // The attributability check the ladder leans on: `--crowd 0` has to collapse the second habit onto
  // the first, or a difference between the two rows is a difference in the arithmetic as well.
  park();
  const east = plant(ship.x + 400, ship.y);
  plant(ship.x - 400, ship.y);
  sit(5, east.x, east.y);
  assert.ok(agreement(forage(game), { x: 1, y: 0 }) > 0.9);
  assert.ok(agreement(forageWary(game), { x: -1, y: 0 }) > 0.9,
    'five bodies on a pile changed nothing even with the dial on');
  const before = LOOT.crowd;
  try {
    setLootDial({ crowd: 0 });
    assert.deepEqual(forageWary(game), forage(game),
      'with nobody counted as a crowd the two habits still disagreed, so something else differs');
  } finally {
    setLootDial({ crowd: before });
  }
});

test('the reach and the rot rule belong to every habit that walks', () => {
  // Both habits share the candidate test, and a second habit that quietly kept its own would be a
  // second ladder as well as a second habit.
  park();
  plant(ship.x + LOOT.reach + 150, ship.y);
  assert.equal(forageWary(game), null, 'wary walked past the reach the habit ships with');
  assert.equal(forageImpatient(game), null, 'impatient walked past the reach the habit ships with');
  world.shards.clear();
  const far = 600;
  plant(ship.x + far, ship.y, far / ship.maxSpeed + LOOT.grace - 0.05);
  assert.equal(forageWary(game), null, 'wary set off for a shard that will not be there');
  assert.equal(forageImpatient(game), null, 'impatient set off for a shard that will not be there');
});

test('a committed walk stays on its pile while greedy changes its mind', () => {
  // The commitment half of the third habit, and the only thing that separates it from `greedy`
  // apart from the give-up: a pile picked on the way out keeps the ship's attention instead of
  // losing it to whatever looked better a moment later.
  park();
  setLootHabit('impatient');
  const out = 400;
  plant(ship.x + out, ship.y);
  const west = plant(ship.x - out, ship.y);
  assert.ok(agreement(forageImpatient(game), { x: 1, y: 0 }) > 0.9,
    'the walk did not set off for the first pile it came to');
  // An elite's handful lands on the western pile. `greedy` re-decides and turns round; the
  // committed walk is still looking east, which is what a person mid-trip does with a better offer.
  west.worth = BALANCE.shards.big.worth;
  assert.ok(agreement(forage(game), { x: -1, y: 0 }) > 0.9,
    'greedy did not notice the better pile appear behind it');
  assert.ok(agreement(forageImpatient(game), { x: 1, y: 0 }) > 0.9,
    'the committed walk turned round for a pile it had not set off for');
  // And when its own pile goes - banked, rotted, or recycled into a pile somewhere else, which the
  // habit cannot tell apart - the commitment ends with it. A remembered shard is not proof of a live
  // one: the pool hands the same object out again for a different pile, and a collected shard goes
  // back to the drawer still lying about where it was, so the live list is the only witness.
  world.shards.clear();
  assert.equal(forageImpatient(game), null,
    'the ship kept walking at the place a pile was collected from');
  assert.equal(FORAGE.gaveUp, 0,
    'a walk that ended because its pile went was counted as a give-up; the pile left, nobody quit');
  // And the better pile on the other side is picked up like any other, once there is one to pick up.
  plant(west.x, west.y, undefined, BALANCE.shards.big.worth);
  assert.ok(agreement(forageImpatient(game), { x: -1, y: 0 }) > 0.9,
    'with its own pile gone the walk ignored the best one left on the floor');
});

test('a walk that outstays its patience is given up on, and the shopping is shut for as long again', () => {
  // The give-up half, flown on a patience short enough to run out inside the window: a pile 500 px
  // out is a second and a half of walking at top speed, and a half-second patience cannot cover it.
  park();
  const before = LOOT.patience;
  try {
    setLootDial({ patience: 0.5 });
    setLootHabit('impatient');
    plant(ship.x + 500, ship.y, 60);          // life enough that rotting is not what ends the walk
    const skittish = fly(120);                // two seconds of an idle ship with loot to the east
    assert.ok(FORAGE.gaveUp >= 1,
      'a half-second patience gave nothing up in two seconds of walking at a pile it could not reach');
    assert.ok(FORAGE.steered > 0, 'the habit never took the wheel, so the give-up counted nothing');
    assert.ok(skittish.east < 480,
      'the ship banked a pile it was supposed to have given up on ' + Math.round(skittish.east) + ' px');
    // The same pile, the same two seconds, and a habit with no give-up in it gets there. That is the
    // comparison the row in the ladder is making, in one screenful.
    world.shards.clear();
    plant(ship.x + 500, ship.y, 60);
    setLootHabit('greedy');                   // and it puts the counters back for the second half
    const steady = fly(120);
    assert.equal(FORAGE.gaveUp, 0, 'greedy gave a walk up, and it has no rule that could');
    assert.ok(steady.east >= 460,
      'greedy did not reach the pile either (' + Math.round(steady.east)
      + ' px), so the two-second window is showing something else');
  } finally {
    setLootDial({ patience: before });
  }
});

test('a give-up shuts the shopping for as long as the walk took, and then opens it again', () => {
  // The price of giving up, checked on the clock rather than on the ship: a give-up that cost nothing
  // would be a stutter and not a decision, because the next frame would set off for the same pile.
  park();
  setLootHabit('impatient');
  const before = LOOT.patience;
  const clock = world.elapsed;
  try {
    setLootDial({ patience: 1 });
    plant(ship.x + 500, ship.y, 60);
    assert.ok(forageImpatient(game) !== null, 'the walk did not set off');
    world.elapsed += 1.01;                    // the patience is spent
    assert.equal(forageImpatient(game), null, 'the walk outstayed its patience and kept on walking');
    assert.equal(FORAGE.gaveUp, 1, 'the give-up was not counted');
    world.elapsed += 0.5;                     // halfway through the sulking
    assert.equal(forageImpatient(game), null, 'the ship went back shopping in the middle of a sulk');
    assert.equal(FORAGE.gaveUp, 1, 'the sulking time was spent giving up all over again');
    world.elapsed += 1;                       // and now it is over
    assert.ok(forageImpatient(game) !== null, 'the ship never went back out shopping');
    assert.equal(FORAGE.gaveUp, 1, 'going shopping again should not cost another give-up');
  } finally {
    world.elapsed = clock;            // the run clock belongs to the game, not to this test
    setLootDial({ patience: before });
  }
});

test('the two ends of the patience dial are controls, not decorations', () => {
  // The attributability the ladder's middle rows lean on, in the same shape `--crowd 0` gives `wary`.
  // At 0 no trip ever gets under way - which is `off`, and not a bot that gives up every frame; past
  // any trip the walk is committed but never abandoned - which is a plain committed walk.
  park();
  const before = LOOT.patience;
  try {
    setLootDial({ patience: 0 });
    setLootHabit('impatient');
    plant(ship.x + 500, ship.y, 60);
    assert.equal(forageImpatient(game), null, 'a trip with no time in it still set off');
    fly(60);
    assert.equal(FORAGE.steered, 0, 'with no patience the habit was out walking anyway');
    assert.equal(FORAGE.gaveUp, 0, 'nothing was ever begun, so there was nothing to give up');
    assert.ok(agreement(forage(game), { x: 1, y: 0 }) > 0.9,
      'greedy stayed home too, so it is not only the patience moving');

    setLootDial({ patience: 100000 });
    park();
    setLootHabit('impatient');
    plant(ship.x + 500, ship.y, 60);
    const patient = fly(120);
    assert.equal(FORAGE.gaveUp, 0, 'a patience longer than any trip still found a walk to give up');
    assert.ok(patient.east >= 460,
      'a walk that is never abandoned did not get to the pile either (' + Math.round(patient.east) + ' px)');
  } finally {
    setLootDial({ patience: before });
  }
});

test('the walk never overrules a dodge', () => {
  // The one rule that makes this habit safe to put on an instrument: it answers the idle question,
  // so it is only ever asked when the policy was going to drift anyway. A shard straight east and a
  // body pressing from the east as well - the flee is west, the loot is east, and only one of them
  // can be the way the ship goes.
  park();
  const trouble = { x: 70, y: 0 };
  const enemy = makeEnemy(world, 'drifter', ship.x + trouble.x, ship.y, {
    hp: 1e6, speed: 0, drop: 0, score: 0,
  });
  world.enemies.push(enemy);
  plant(ship.x + 500, ship.y + 4);            // loot that way, trouble between here and there
  ship.invuln = 0;
  ship.hull = 9;
  const from = { x: ship.x, y: ship.y };
  fly(40);
  assert.ok(ship.x < from.x - 20,
    'the ship went ' + Math.round(ship.x - from.x) + ' px in the body\'s direction with a shard out '
    + 'that way; the walk is supposed to step down for a threat, not compete with one');
});

test('every policy goes shopping when it has nothing else to do', () => {
  // The habit hangs off the one answer all three policies give when nothing is wrong, so none of
  // them has to know about it and all three get it - including the human one, whose look is late
  // and a quarter spent on something else, which is exactly the hand the difficulty band is read on.
  // Every habit that walks, for the same reason: they all come through the same door.
  for (const habit of ['greedy', 'wary', 'impatient']) {
    for (const policy of ['naive', 'aware', 'human']) {
      park();
      setLootHabit(habit);
      plant(ship.x + 500, ship.y);
      const gone = fly(120, policy);
      assert.ok(gone.east > 200,
        'the ' + policy + ' hand with the ' + habit + ' walk got ' + Math.round(gone.east)
        + ' px east of the middle in two seconds with loot that way and nothing to run from');
    }
  }
});

test('the habit does not touch where the guns are pointed', () => {
  park();
  game.moveMouse(ship.x - 300, ship.y + 250);        // the policy's own aim
  const before = game.pointer;
  plant(ship.x + 400, ship.y);
  for (let i = 0; i < 5; i++) {
    assert.ok(forage(game) !== null);
    assert.deepEqual(game.pointer, before, 'the walk moved the pointer, and with it the guns');
  }
});

test('how far the walk is for, pinned against how far the net already reaches', () => {
  // Pinned against tools/loot-habit.js's sweep, which is the only reason the number is what it is.
  // What the pin is *for*, and it is not the sweep: a reach at or under the net is not a habit, it
  // is a shrug - the net is already bringing that loot in, so the walk would only be the ship
  // standing where it stands. And a reach of the whole arena is the other failure, a bot that will
  // cross a world for one shard and die in the far corner for the privilege.
  assert.equal(LOOT.reach, 700);
  assert.ok(LOOT.reach > NET * 3, 'the walk is for loot the net cannot touch, and this one can');
  assert.ok(LOOT.reach < Math.min(ARENA.w, ARENA.h) / 2,
    'this walk crosses a whole arena for one shard');
  assert.ok(LOOT.grace > 0 && LOOT.grace < 2,
    'the slack on a shard rotting is a blink, not a second opinion');
  // The crowd radius, same argument in miniature: too tight and the second habit is counting nobody
  // out of a clump (which is `greedy` with a step wasted); wider than the walk itself and every pile
  // in reach is crowded, which is `off` with a step wasted.
  assert.ok(LOOT.crowd >= 60, 'a body sitting on a pile is not counted at this radius');
  assert.ok(LOOT.crowd < LOOT.reach / 2, 'this counts the whole reach as one crowd');
  // The patience, and the two numbers it has to agree with. Shorter than the longest walk the reach
  // offers and the two dials contradict each other - the ship would set off for piles it is not
  // allowed to reach; longer than a shard lives and no walk can ever finish, only be abandoned.
  assert.ok(LOOT.patience * ship.maxSpeed >= LOOT.reach,
    'this patience is shorter than the walk the reach offers, so the two dials argue');
  assert.ok(LOOT.patience < BALANCE.shards.life,
    'a walk that outlasts the loot on the floor can only ever end in a give-up');
});

test('the habits by name, and the one --loot means', () => {
  assert.equal(lootHabitOf(undefined), LOOT_HABITS[DEFAULT_LOOT_HABIT]);
  assert.equal(lootHabitOf(true), LOOT_HABITS[DEFAULT_LOOT_HABIT]);
  assert.equal(lootHabitOf('greedy'), forage);
  assert.equal(lootHabitOf('wary'), forageWary);
  assert.equal(lootHabitOf('impatient'), forageImpatient);
  assert.equal(LOOT_HABITS.off(game), null, '`off` is supposed to answer "nothing"');
  assert.throws(() => lootHabitOf('scavenger'), /no loot habit is called scavenger/);
});

test("the habit's dials can be put over, and refuse a number that is not one", () => {
  const before = { reach: LOOT.reach, grace: LOOT.grace, crowd: LOOT.crowd, patience: LOOT.patience };
  try {
    assert.equal(setLootDial({ reach: 300 }).reach, 300);
    assert.equal(setLootDial({ crowd: 90 }).crowd, 90);
    assert.equal(setLootDial({ patience: 2 }).patience, 2);
    assert.throws(() => setLootDial({ panic: 3 }), /no number called panic/);
    assert.throws(() => setLootDial({ grace: 'soon' }), /grace wants a finite number/);
  } finally {
    setLootDial(before);
  }
  assert.equal(LOOT.reach, before.reach);
  assert.equal(LOOT.grace, before.grace);
  assert.equal(LOOT.crowd, before.crowd);
  assert.equal(LOOT.patience, before.patience);
});

test('a bot told to go and get loot gets more of it, and one not told gets none', async () => {
  // The claim the whole habit exists for, flown twice on one seed: the same ship, the same arena,
  // the same crowd - the only difference is whether it went looking. Two minutes and the aware
  // hand, which is the shortest window in which the net and the walk can be told apart at all.
  await game.resetToTitle(61);
  const walked = playOneRun(game, { maxSeconds: 120, loot: true });
  assert.ok(walked.foraged > 0, 'a run with the habit never took the wheel');
  assert.ok(walked.stats.collected > 0);
  await game.resetToTitle(61);
  const still = playOneRun(game, { maxSeconds: 120 });
  assert.equal(still.foraged, 0, 'a run without the habit went shopping anyway');
  assert.ok(walked.stats.collected > still.stats.collected,
    'the bot that went looking banked ' + walked.stats.collected + ' shards against the one that '
    + 'waited for the net\'s ' + still.stats.collected);
  // And the counter belongs to the run, not to the process: a second run over the same seed walks
  // the same distance and does not inherit the last one's tally.
  await game.resetToTitle(61);
  const again = playOneRun(game, { maxSeconds: 120, loot: true });
  assert.equal(again.foraged, walked.foraged, 'the walk count carried over between runs');
  // And the second habit is reachable the way the tool reaches it - by name - or the ladder's third
  // row is a decoration nobody can fly. It has to bank loot too: it is a way of walking, not a
  // different answer of "nothing".
  await game.resetToTitle(61);
  const wary = playOneRun(game, { maxSeconds: 120, loot: 'wary' });
  assert.ok(wary.foraged > 0, 'a run flown `--loot-habit wary` never let the habit take the wheel');
  assert.ok(wary.stats.collected > still.stats.collected,
    'the wary walk banked ' + wary.stats.collected + ' shards, no more than the bot that waited for '
    + 'the net\'s ' + still.stats.collected);
  assert.notEqual(wary.foraged, again.foraged,
    'the two habits walked exactly the same amount on the same seed, so one of them is not walking');
  // And the third one, which has to be reachable by name like the other two - and has to walk, and
  // has to be a different walk from either of them on the same seed.
  await game.resetToTitle(61);
  const impatient = playOneRun(game, { maxSeconds: 120, loot: 'impatient' });
  assert.ok(impatient.foraged > 0, 'a run flown `impatient` never let the habit take the wheel');
  assert.ok(impatient.stats.collected > still.stats.collected,
    'the impatient walk banked ' + impatient.stats.collected + ' shards, no more than the bot that '
    + 'waited for the net\'s ' + still.stats.collected);
  assert.notEqual(impatient.foraged, again.foraged,
    'the impatient walk steered exactly as much as the greedy one on the same seed');
  assert.notEqual(impatient.foraged, wary.foraged,
    'the impatient walk steered exactly as much as the wary one on the same seed');
  // The give-up counter is the third habit's own, and nobody else's: two runs of `impatient` can
  // differ in how many walks they abandoned, but a habit with no give-up in it must never move it.
  assert.equal(again.gaveUp, 0, 'greedy gave up a walk, and it has no rule that could');
  assert.equal(wary.gaveUp, 0, 'wary gave up a walk, and it has no rule that could');
});

test('a patience of nothing flies exactly like the bot that never went shopping', async () => {
  // The flown version of the control, and the one that says anything the impatient row buys belongs
  // to the give-up: at `patience` 0 no trip ever gets under way, so the run has to be byte for byte
  // the run of a bot with no habit at all - score, shards, and every trace hash along the way.
  const before = LOOT.patience;
  try {
    setLootDial({ patience: 0 });
    await game.resetToTitle(61);
    const sulking = playOneRun(game, { maxSeconds: 120, loot: 'impatient' });
    await game.resetToTitle(61);
    const homebody = playOneRun(game, { maxSeconds: 120, loot: 'off' });
    assert.deepEqual(sulking.trace, homebody.trace,
      'with no patience the third habit still changed the run, so it is not just a give-up');
    assert.equal(sulking.stats.score, homebody.stats.score);
    assert.equal(sulking.stats.collected, homebody.stats.collected);
    assert.equal(sulking.foraged, 0);
    assert.equal(sulking.gaveUp, 0, 'nothing was begun, so nothing should have been counted as quit');
  } finally {
    setLootDial({ patience: before });
  }
});

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const LADDER = path.join(ROOT_DIR, 'tools', 'loot-habit.js');

function ladder(args) {
  return spawnSync(process.execPath, [LADDER, ...args], { cwd: ROOT_DIR, encoding: 'utf8' });
}

test('the ladder refuses a bad dial before it plays a single run', () => {
  const crowd = ladder(['--crowd', '-5', '--seeds', '1', '--seconds', '5']);
  assert.equal(crowd.status, 2);
  assert.match(crowd.stderr, /--reach and --crowd want a number of pixels/);
  const patience = ladder(['--patience', '-1', '--seeds', '1', '--seconds', '5']);
  assert.equal(patience.status, 2);
  assert.match(patience.stderr, /--grace and --patience a number of seconds/);
  const habit = ladder(['--habits', 'off,hoarder']);
  assert.equal(habit.status, 2);
  assert.match(habit.stderr, /--habits wants some of: off, greedy, wary, impatient/);
});

test('the ladder flies every way of walking and asks who won', () => {
  // One seed and twenty seconds: the point is that every rival row got flown and that the file
  // knows a batch that small cannot rank them - a ladder that printed a verdict off one run would
  // be the thing session 162's note calls a coin-toss gate, and --strict would pass it.
  const run = ladder(['--seeds', '1', '--seconds', '20']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^greedy \*/m, 'the shipped row is missing');
  assert.match(run.stdout, /^wary\s/m, 'the second way of walking was not flown');
  assert.match(run.stdout, /^impatient\s/m, 'the third way of walking was not flown');
  assert.match(run.stdout, /gave up\/run/, 'the column that says whether a give-up ever fired is gone');
  assert.match(run.stdout, /Head to head against `(wary|impatient)`/);
  // The split has to arrive with its side named. `pairs.js` prints the bigger half of a split, which
  // is a riddle beside a ratio that leans the other way - and on this game the two disagree constantly.
  assert.match(run.stdout, /the seeds say [^\n]*(for (greedy|wary|impatient)|each way)/,
    'the ladder printed a seed split without saying which side won it');
  assert.match(run.stdout, /below the 8 this file will rank anything on/);
});
