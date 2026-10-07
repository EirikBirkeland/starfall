// The upgrade lines and the level-up choice (PLAN 3.5, 3.6), as the simulation does
// it: the curve, what a rank is worth, what gets dealt, what happens when it is taken,
// and what happens when there is nothing left to deal.
//
// These run on the scripted world (tools/headless/scripted.js), so they can hand the
// run a level and then count what the pause did and did not do. What the *keys* and
// the mouse do about it belongs to test/level-up.test.mjs, which boots the real game.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { xpNeededFor, firstLevelXp, levelUp } from '../src/game/progress.js';
import { LINES, gainOf, rankOf, takeOffer, describeRanks } from '../src/game/upgrades.js';
import { fire, shotsPerSecond } from '../src/game/player.js';
import { scriptedRun, stepTheWorld } from '../tools/headless/scripted.js';

const PROGRESS = BALANCE.progression;
const IDS = LINES.map((line) => line.id);

/** Everything the pause must hold still, as one comparable string. */
function whereEverythingStands(field) {
  const ship = field.player;
  const parts = [
    'elapsed:' + field.elapsed, 'score:' + field.score, 'kills:' + field.kills,
    'ship:' + ship.x + ',' + ship.y + ',' + ship.vx,
  ];
  for (const e of field.enemies) parts.push('e:' + e.x + ',' + e.y + ',' + e.hp);
  for (const b of field.bullets.items) parts.push('b:' + b.x + ',' + b.y);
  for (const s of field.shards.items) parts.push('s:' + s.x + ',' + s.y);
  return parts.join('|');
}

/** Level the run up exactly once: the XP is there, and the chime is spent. */
function earnLevel(field) {
  field.xp = field.xpNeed;
  levelUp(field);
}

test('one level costs what the curve says and more than the level before it', () => {
  assert.equal(xpNeededFor(4), Math.round(PROGRESS.base + 4 * PROGRESS.linear + 16 * PROGRESS.quad));
  assert.equal(firstLevelXp(), xpNeededFor(1), 'a fresh run is one level short of two');
  assert.ok(xpNeededFor(9) > xpNeededFor(8), 'and it gets dearer');
});

test('a level earned stops the run, and nothing in the arena moves while it is stopped', () => {
  const field = scriptedRun(31);
  earnLevel(field);

  assert.equal(field.state, STATE.LEVEL, 'the run is holding still');
  assert.equal(field.offer.length, BALANCE.cards.offer, 'and three cards are on the table');

  const before = whereEverythingStands(field);
  for (let i = 0; i < 10; i++) {
    assert.equal(stepTheWorld(), false, 'a paused step answers that it paused');
  }
  assert.equal(whereEverythingStands(field), before, 'nothing in the arena moved');
  assert.equal(field.player.level, 2, 'the level was banked');
  assert.equal(field.xp, 0, 'and paid for');
  assert.equal(field.xpNeed, xpNeededFor(2), 'and the next one is priced');
});

test('the cards offered are every line with a rank left, in table order', () => {
  const field = scriptedRun(32);
  earnLevel(field);
  assert.deepEqual(field.offer, IDS, 'a fresh run is offered the lot');

  for (const id of IDS) field.upgrades[id] = BALANCE.upgrades[id].ranks - 1;
  field.offer.length = 0;
  earnLevel(field);
  assert.deepEqual(field.offer, IDS, 'a line on its last rank is still worth offering');

  field.upgrades.damage = BALANCE.upgrades.damage.ranks;
  field.offer.length = 0;
  earnLevel(field);
  assert.deepEqual(field.offer, ['fireRate', 'bulletSpeed'], 'a maxed line is not');
});

test('taking a card banks the rank and hands the run back', () => {
  const field = scriptedRun(33);
  assert.equal(describeRanks(field), 'NO UPGRADES', 'a fresh run has no build to show');

  earnLevel(field);
  assert.equal(takeOffer(field, 0), true);

  assert.equal(field.upgrades.damage, 1, 'the first card was damage');
  assert.equal(rankOf(field, 'damage'), 1);
  assert.equal(field.pendingLevels, 0);
  assert.equal(field.offer.length, 0, 'the table is clear');
  assert.equal(field.state, STATE.PLAY, 'and the run is running again');
  assert.equal(describeRanks(field), 'DAMAGE 1', 'and the build can be described');
});

test('a card that is not on the table is refused, and refuses to do anything', () => {
  const field = scriptedRun(34);
  assert.equal(takeOffer(field, 0), false, 'nothing is offered yet');

  earnLevel(field);
  assert.equal(takeOffer(field, field.offer.length), false, 'there is no fourth card');
  assert.equal(takeOffer(field, -1), false, 'and no minus-first card');
  assert.equal(field.state, STATE.LEVEL, 'so the run is still waiting');
  assert.equal(field.upgrades.damage, 0, 'and nothing was taken');
});

test('two levels at once are two choices, one after the other', () => {
  const field = scriptedRun(35);
  earnLevel(field);
  earnLevel(field);          // a fat shard can be worth two levels in one step

  assert.equal(field.pendingLevels, 2);
  assert.equal(field.state, STATE.LEVEL);
  assert.equal(field.offer.length, BALANCE.cards.offer, 'but only one choice is on the table');

  assert.equal(takeOffer(field, 1), true);
  assert.equal(field.state, STATE.LEVEL, 'the second level wants answering too');
  assert.equal(field.pendingLevels, 1);
  assert.equal(field.upgrades.damage, 0, 'and the first card went to the middle one');
  assert.equal(field.upgrades.fireRate, 1);

  assert.equal(takeOffer(field, 0), true);
  assert.equal(field.state, STATE.PLAY, 'and then it is over');
  assert.equal(field.pendingLevels, 0);
});

test('every line is five ranks deep and each one is worth its step', () => {
  const field = scriptedRun(36);
  for (const line of LINES) {
    const spec = BALANCE.upgrades[line.id];
    assert.equal(spec.ranks, 5, line.id + ' is five ranks deep, as PLAN 3.5 starts them');
    field.upgrades[line.id] = spec.ranks;
    assert.equal(gainOf(field, line.id), 1 + spec.step * spec.ranks);
  }
});

test('damage and shot speed come out of the gun, not just onto the ledger', () => {
  const field = scriptedRun(37);
  const gun = BALANCE.bullets;

  field.bullets.clear();
  fire(field);
  let shot = field.bullets.items[0];
  assert.equal(shot.dmg, gun.damage, 'a plain shot is a plain shot');
  assert.ok(Math.abs(Math.hypot(shot.vx, shot.vy) - gun.speed) < 1e-9, 'at the plain speed');

  field.upgrades.damage = 3;
  field.upgrades.bulletSpeed = 2;
  field.bullets.clear();
  fire(field);
  shot = field.bullets.items[0];
  assert.ok(Math.abs(shot.dmg - gun.damage * gainOf(field, 'damage')) < 1e-9, 'heavier');
  assert.ok(Math.abs(Math.hypot(shot.vx, shot.vy) - gun.speed * gainOf(field, 'bulletSpeed')) < 1e-9, 'and faster');
});

test('the fire rate line shortens the gap between two shots', () => {
  const field = scriptedRun(38);
  const spec = BALANCE.player;
  assert.equal(shotsPerSecond(field), spec.fireRate, 'a plain gun cycles at its own rate');

  field.upgrades.fireRate = BALANCE.upgrades.fireRate.ranks;
  const fast = shotsPerSecond(field);
  assert.ok(Math.abs(fast - spec.fireRate * gainOf(field, 'fireRate')) < 1e-9, 'a tuned one faster');
  assert.ok(fast < spec.fireRateMax, 'and the ceiling sits above what the line can reach');

  // And the wiring: the timer a shot leaves behind is the gap the line asked for.
  const ship = field.player;
  ship.fireTimer = 0;
  const gaps = [];
  for (let i = 0; i < 60 && gaps.length < 2; i++) {
    const before = field.bullets.count;
    stepTheWorld({ firing: true });
    if (field.bullets.count > before) gaps.push(ship.fireTimer);
  }
  assert.equal(gaps.length, 2, 'the gun fired twice');
  for (const gap of gaps) assert.ok(Math.abs(gap - 1 / fast) < 1e-9, 'and waited exactly as long as it should');
});

test('a line that is maxed never comes back, however many levels are dealt', () => {
  const field = scriptedRun(39);
  field.upgrades.damage = BALANCE.upgrades.damage.ranks;

  for (let round = 0; round < 40; round++) {
    earnLevel(field);
    if (field.state !== STATE.LEVEL) break;      // nothing left to deal
    assert.equal(field.offer.indexOf('damage'), -1, 'damage stayed off the table');
    assert.equal(takeOffer(field, 0), true);
  }
  assert.equal(field.upgrades.damage, BALANCE.upgrades.damage.ranks, 'and stayed maxed');
});

test('with every line maxed a level is still a level, but not a pause', () => {
  const field = scriptedRun(40);
  for (const id of IDS) field.upgrades[id] = BALANCE.upgrades[id].ranks;
  const level = field.player.level;

  earnLevel(field);

  assert.equal(field.state, STATE.PLAY, 'the run was never stopped for a card it could not give');
  assert.equal(field.player.level, level + 1, 'the level was still banked');
  assert.equal(field.offer.length, 0);
  assert.equal(field.pendingLevels, 0, 'and nothing is left owing');
  assert.equal(stepTheWorld(), true, 'and the next step is a real one');
});
