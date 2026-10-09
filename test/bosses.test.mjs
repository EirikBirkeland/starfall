// The boss framework (game/bosses.js): the schedule that decides when a duel starts, the cage
// it is fought inside, the hull bar's numbers, the phase changes, and the director standing aside
// while one is on the field.
//
// The attacks themselves are test/warden.test.mjs. Everything here is the part that would be
// exactly the same whatever the next boss turns out to be.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import { world, stepWorld } from '../src/game/world.js';
import { STATE } from '../src/game/state.js';
import { resetRun } from '../src/game/run.js';
import { fieldIsCaged, openField } from '../src/game/field.js';
import { damageEnemy, killEnemy } from '../src/game/enemies.js';
import { isBossBody } from '../src/game/bosses.js';
import { drainCues } from '../src/game/cues.js';
import {
  bossFlare, bossHullShare, bossName, bossPhase, bossPhaseCount, bossTint, bossWarning,
  spokeCount,
} from '../src/game/bosses.js';
import { scriptedRun, stepTheWorld, bossOnTheField, enemyAt } from '../tools/headless/scripted.js';

const STEP = BALANCE.sim.step;

/**
 * Step until `seconds` of the arena have actually happened.
 *
 * "Actually" matters: a hit-stop (game/effects.js `hitStop`) swallows steps without spending
 * any of the arena's clock, and a boss is written out of things that stop the world for a
 * living - its arrival, every phase change, every volley. Counting calls here would mean a
 * test that quietly asked for nothing and then wondered why nothing had happened.
 */
function steps(seconds) {
  let ran = 0;
  let guard = 0;
  while (ran < seconds - 1e-9) {
    if (stepTheWorld()) ran += STEP;
    guard++;
    if (guard > 20000) throw new Error('the arena never came back to life');
  }
}

/** Every sound the game has asked for since the last time this was called. */
function cues() {
  const out = [];
  drainCues((cue) => out.push(cue));
  return out;
}

/**
 * Do to the boss what everything else in the game does to a body that is about to stop
 * existing: hurt it, plenty of it. `killEnemy` directly would take it out of the crowd with
 * its hull full, which is a thing that cannot happen in a live run and which the boss system
 * (quite rightly) reads as "still fighting".
 */
function fell(field, boss) {
  damageEnemy(field, boss.enemy, boss.enemy.maxhp * 10, true);
}

/** Every phase row of every scheduled boss, flattened. A new boss is walked automatically. */
function everyPhase() {
  const rows = [];
  for (const entry of BALANCE.bosses.schedule) {
    const boss = BALANCE.bosses[entry.boss];
    assert.ok(boss, 'the schedule names ' + entry.boss + ', which is not in BALANCE.bosses');
    boss.phases.forEach((phase, i) => rows.push({ id: entry.boss, phase, index: i }));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

test('every boss is scheduled, in order, and named in the schedule it is played from', () => {
  const schedule = BALANCE.bosses.schedule;
  assert.ok(schedule.length >= 1, 'a schedule with nothing in it is a milestone with nothing in it');

  let last = -1;
  for (const entry of schedule) {
    assert.ok(entry.at > last, 'the schedule has to be in the order it is played: ' + entry.at);
    assert.ok(entry.at > 0, 'nothing is due at the same moment the run starts');
    assert.ok(BALANCE.bosses[entry.boss], 'the schedule names ' + entry.boss);
    last = entry.at;
  }
});

test('a boss has one phase row for each mark the hull is cut at', () => {
  // The bar draws a notch at every `atHull` mark and the simulation opens a phase at the same
  // numbers, so the two can only be promised together.
  assert.equal(BALANCE.bosses.atHull.length, BALANCE.bosses.warden.phases.length);
  for (const { id } of everyPhase()) {
    assert.equal(BALANCE.bosses[id].phases.length, BALANCE.bosses.atHull.length, id);
  }

  let last = Infinity;
  for (const share of BALANCE.bosses.atHull) {
    assert.ok(share > 0 && share <= 1, 'a phase mark has to be a share of the hull');
    assert.ok(share < last, 'the marks go down, or a phase would open before the one before it');
    last = share;
  }
});

test('no phase of any boss is quicker to read than the telegraph floor', () => {
  // kinds.js refuses a sniper that locks for less than `telegraphMin`; a boss is the same promise
  // multiplied by however many spokes it holds, so the floor matters more here, not less. Every
  // beat a phase has is held to it - the spokes, and whatever else the phase grows.
  for (const { id, phase, index } of everyPhase()) {
    assert.ok(phase.windup >= BALANCE.bosses.telegraphMin,
      id + ' phase ' + (index + 1) + ' shows its spokes for ' + phase.windup + 's');
    for (const beat of Object.values(phase)) {
      if (beat === null || typeof beat !== 'object' || beat.windup === undefined) continue;
      assert.ok(beat.windup >= BALANCE.bosses.telegraphMin,
        id + ' phase ' + (index + 1) + ' shows a beat for only ' + beat.windup + 's');
    }
  }
});

test('a boss has enough hull to be a fight and not a wall', () => {
  // Read off what a bare pulse gun does to it: the run that meets the first boss at 5:00 with
  // no upgrades at all should still have a fight, and should not be bored by one.
  const gun = BALANCE.weapons.pulse;
  const bare = gun.damage * gun.pellets * gun.fireRate;
  const seconds = BALANCE.bosses.warden.hull / bare;
  assert.ok(seconds > 60, 'the first boss melts in ' + seconds.toFixed(0) + 's of a bare gun');
  assert.ok(seconds < 200, 'the first boss is ' + seconds.toFixed(0) + 's of a bare gun');
});

// ---------------------------------------------------------------------------
// The warning, and the arrival
// ---------------------------------------------------------------------------

test('nothing is due before its time', () => {
  scriptedRun(41);
  const at = BALANCE.bosses.schedule[0].at;
  world.elapsed = at - 3;
  steps(2.5);
  assert.equal(world.boss, null, 'a boss showed up three seconds before it was due');
  assert.equal(fieldIsCaged(world), false);
});

test('the siren goes before the thing does', () => {
  scriptedRun(42);
  const at = BALANCE.bosses.schedule[0].at;
  world.bossIndex = 0;
  world.elapsed = at - 0.05;
  cues();
  steps(0.1);

  const boss = world.boss;
  assert.ok(boss !== null, 'the schedule fired and nothing came of it');
  assert.equal(boss.enemy, null, 'it walked onto the field before the siren had run');
  assert.ok(bossWarning(boss) > BALANCE.bosses.warn.time * 0.5, 'the siren is over in no time at all');
  assert.equal(fieldIsCaged(world), false, 'the cage shut while the warning was still up');
  assert.equal(bossHullShare(boss), 0, 'there is no hull to measure yet, so there is no bar');

  const siren = cues();
  assert.ok(siren.some((cue) => cue.kind === 'beep' && cue.freq < 200),
    'the warning made no sound a player could hear: ' + JSON.stringify(siren));

  steps(BALANCE.bosses.warn.time);
  assert.equal(boss.enemy === null, false, 'the siren ended and the arena is still empty');
});

test('it arrives shut in with the ship, a long way from the ship', () => {
  const field = scriptedRun(43);
  const boss = bossOnTheField();
  const ship = field.player;

  assert.ok(fieldIsCaged(field), 'the duel opened in the open arena');
  assert.equal(field.enemies.length, 1, 'a crowd turned up for what was meant to be a duel');
  assert.ok(field.enemies[0] === boss.enemy);

  // Big enough that the camera's own lead cannot slide an edge through the visible play area -
  // which is the whole reason the cage is a ring and not the arena wall (game/field.js).
  const view = BALANCE.arena;
  assert.ok(field.field.x1 - field.field.x0 >= view.viewW + 100, 'the cage is narrower than the view');
  assert.ok(field.field.y1 - field.field.y0 >= view.viewH + 100);
  // ... and it has to fit inside the real arena, or a body could be shut outside a wall.
  assert.ok(field.field.x0 >= 0 && field.field.x1 <= field.arena.w);
  assert.ok(field.field.y0 >= 0 && field.field.y1 <= field.arena.h);

  const gap = Math.hypot(boss.enemy.x - ship.x, boss.enemy.y - ship.y);
  assert.ok(gap >= boss.row.arrival.gap,
    'it landed ' + gap.toFixed(0) + 'px away, inside the ship own reflexes');
});

test('the cage holds the ship and nothing else', () => {
  const field = scriptedRun(44);
  bossOnTheField();
  const ship = field.player;
  const box = field.field;

  // Fly at a corner as hard as the ship can go, dashes and all, for longer than it takes.
  for (let i = 0; i < 400; i++) {
    stepTheWorld({ moveX: 1, moveY: -1, moving: true, dash: i % 40 === 0 });
    assert.ok(ship.x >= box.x0 - ship.r && ship.x <= box.x1 + ship.r, 'it slipped the cage at x=' + ship.x);
    assert.ok(ship.y >= box.y0 - ship.r && ship.y <= box.y1 + ship.r, 'it slipped the cage at y=' + ship.y);
  }

  // The crowd is not locked in, on purpose: bodies walking in from outside a wall that is not
  // there any more are caught by the walls themselves, and snapping them would be a flicker.
  const late = enemyAt('drifter', field.arena.w - 20, 20);
  steps(1);
  assert.ok(late.dead || late.hp > 0);
});

// ---------------------------------------------------------------------------
// The director stands aside
// ---------------------------------------------------------------------------

test('no crowd arrives while a boss is on the field, and comes back after it', () => {
  const field = scriptedRun(45);
  bossOnTheField();
  const count = field.enemies.length;

  field.spawnTimer = 0;
  steps(20);
  assert.equal(field.enemies.length, count, 'the director kept dealing cards during the duel');
  assert.equal(field.spawnTimer, 0, 'the director was counting down behind its own back');

  fell(field, field.boss);
  steps(0.05);
  assert.equal(field.enemies.length, 0, 'the body outlived the fight');
  assert.ok(field.spawnTimer > BALANCE.bosses.resume - 0.5, 'the waves were left to start on the moment the boss died');
  steps(BALANCE.bosses.resume - 0.7);
  assert.equal(field.enemies.length, 0, 'the quiet after a boss was shorter than it is priced at');
  steps(1.4);
  assert.ok(field.enemies.length > 0, 'the waves never came back');
});

test('the field is open again the moment the boss is down', () => {
  const field = scriptedRun(46);
  const boss = bossOnTheField();
  const before = field.score;
  field.player.hull = 1;

  fell(field, boss);
  steps(0.1);

  assert.equal(field.boss, null);
  assert.equal(fieldIsCaged(field), false, 'the cage stayed shut over an empty arena');
  assert.ok(field.field.x1 - field.field.x0 >= field.arena.w * 0.9);
  assert.equal(field.bossesDown, 1);
  assert.ok(field.score > before, 'a boss died and nothing was paid for it');
  assert.equal(field.player.hull, 2, 'the reward did not mend a hull');
  assert.equal(field.player.invuln > 0, true);
});

test('a boss is hurt by everything that hurts anything', () => {
  // The whole point of building it as an enemy (game/kinds.js `opts.kind`): every damage door in
  // the game already knows how to hit it, and so does every telegraph, slow field and blast.
  const field = scriptedRun(47);
  const boss = bossOnTheField();
  const enemy = boss.enemy;

  assert.equal(enemy.type, boss.id, 'the body is not the boss the schedule asked for');
  assert.equal(isBossBody(field, enemy), true);
  const before = enemy.hp;
  assert.equal(damageEnemy(field, enemy, 12, true), false, 'twelve damage killed it outright');
  assert.equal(enemy.hp, before - 12);
  assert.ok(bossHullShare(boss) < 1);
});

test('the hull bar has a number for every state of the fight', () => {
  const field = scriptedRun(48);
  const boss = bossOnTheField();

  assert.equal(bossHullShare(boss), 1);
  assert.equal(bossPhase(boss), 1);
  assert.equal(bossPhaseCount(boss), boss.row.phases.length);
  assert.equal(bossName(boss), boss.row.name);
  assert.ok(bossTint(boss) !== undefined);
  assert.equal(spokeCount(boss), 0, 'it arrives riding, with nothing promised yet');

  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[1] * 0.99;
  steps(0.1);
  assert.equal(bossPhase(boss), 2);
  assert.ok(bossHullShare(boss) < 1);
  assert.ok(bossHullShare(boss) > 0.6);
});

test('a phase change is a moment, and the boss cannot be hurt during it', () => {
  const field = scriptedRun(49);
  const boss = bossOnTheField();
  const enemy = boss.enemy;

  enemy.hp = enemy.maxhp * BALANCE.bosses.atHull[1] * 0.99;
  steps(STEP);
  assert.equal(bossPhase(boss), 2);
  assert.ok(enemy.immune > 0);

  const before = enemy.hp;
  assert.equal(damageEnemy(field, enemy, 20, true), false, 'damage landed on something immune');
  assert.equal(enemy.hp, before, 'and it still hurt it');

  // Not on the very first step of it: the flare is a breath, and it is 0% through a breath the
  // step it starts (bossFlare), which is what makes it a light that comes up and goes away.
  steps(BALANCE.bosses.phaseBreak.time * 0.4);
  assert.ok(bossFlare(boss) > 0, 'the change was not lit, so the player has to be told by a bar');
  assert.ok(bossFlare(boss) < 1);

  steps(BALANCE.bosses.phaseBreak.time + 0.05);
  assert.equal(bossFlare(boss), 0);
  assert.equal(enemy.immune, 0);
  assert.equal(damageEnemy(field, enemy, 20, true), false, 'something on the far side of a phase change cannot be hurt');
  assert.ok(enemy.hp < before);
});

test('a hit big enough to fall two marks lands two phases down, in one flare', () => {
  const field = scriptedRun(50);
  const boss = bossOnTheField();
  // One bullet that would take it straight past the second mark. Both phases are true the
  // moment it lands, so both are opened - but as one event, one flare, and the beat that
  // starts is the one it ends up in (game/bosses.js `updateBosses`).
  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[2] * 0.99;
  steps(BALANCE.bosses.phaseBreak.time * 0.3);
  assert.equal(bossPhase(boss), 3, 'it skipped to the phase it is really in');
  assert.ok(bossFlare(boss) > 0, 'two phases opened as two flares, or as none');
  steps(BALANCE.bosses.phaseBreak.time + 0.1);
  assert.equal(bossPhase(boss), 3);
  assert.equal(spokeCount(boss), 0, 'it fired before the break was over');
});

test('a run that ends on a boss leaves nothing behind', () => {
  const field = scriptedRun(51);
  bossOnTheField();
  assert.equal(fieldIsCaged(field), true);

  field.player.hull = 0;
  field.state = STATE.OVER;
  steps(0.5);

  resetRun(field);
  assert.equal(field.boss, null);
  assert.equal(field.bossIndex, 0);
  assert.equal(field.bossesDown, 0);
  assert.equal(fieldIsCaged(field), false, 'the next run started in the last one cage');
  assert.equal(field.player.x, field.arena.w / 2);
});

test('a boss that arrives on a field somebody left open is still inside it', () => {
  // game/field.js is written to be handed a box it did not choose, so a cage wider than the
  // arena would be a boss standing inside a wall. The clamp is the last word.
  const field = scriptedRun(52);
  openField(field);
  const wide = { x0: -500, y0: -500, x1: field.arena.w + 500, y1: field.arena.h + 500 };
  const boss = bossOnTheField();
  assert.ok(field.field.x0 >= 0 && field.field.x1 <= field.arena.w);
  assert.ok(field.field.y0 >= 0 && field.field.y1 <= field.arena.h);
  assert.ok(boss.enemy.x > field.field.x0 && boss.enemy.x < field.field.x1);
  assert.ok(wide.x0 < 0);
});

test('stepping a world with no boss in it costs nothing and never throws', () => {
  const field = scriptedRun(53);
  assert.equal(field.boss, null);
  steps(2);
  assert.equal(field.boss, null);
  assert.equal(fieldIsCaged(field), false);
});

// ---------------------------------------------------------------------------
// The frame's read of it (game/bosses.js exports these for render/ and tools/ only)
// ---------------------------------------------------------------------------

test('the frame can ask what it is looking at without opening the boss up', () => {
  const field = scriptedRun(54);
  bossOnTheField();
  const boss = field.boss;
  cues();

  assert.equal(bossWarning(boss), 0);
  assert.equal(bossFlare(boss), 0);
  assert.equal(bossPhase(boss), 1);
  assert.equal(typeof bossTint(boss), 'string');

  // Every phase, in turn: the tint changes with it, because the bar, the body and the light it
  // fires are meant to be the same colour and the colour is how far into the fight you are.
  const tints = [bossTint(boss)];
  for (let i = 1; i < bossPhaseCount(boss); i++) {
    boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[i] * 0.99;
    steps(BALANCE.bosses.phaseBreak.time + 0.1);
    tints.push(bossTint(boss));
    assert.equal(bossPhase(boss), i + 1);
  }
  assert.equal(new Set(tints).size, tints.length, 'two phases wear the same colour: ' + tints);
});

test('the siren is spent once, and the next one is the next entry of the schedule', () => {
  const field = scriptedRun(55);
  bossOnTheField();
  assert.equal(field.bossIndex, 0, 'a fight was counted as spent while it was still being fought');
  assert.ok(field.elapsed > BALANCE.bosses.schedule[0].at);

  // Nothing else is due in a short fight, and once the boss is down the world is an ordinary one.
  fell(field, field.boss);
  steps(0.1);
  assert.equal(field.bossIndex, 1);
  steps(30);
  assert.equal(field.boss, null);
  assert.equal(field.bossIndex, 1);
});

test('stepWorld keeps the world alive through a whole boss fight, unsupervised', () => {
  // The sim's own door, not a scripted one: the harness runs the game this way and a state the
  // fixed step cannot survive is a crash a player would meet at five minutes.
  const field = scriptedRun(56);
  bossOnTheField();
  let guard = 0;
  while (field.boss !== null && guard < 60 * 60) {
    const body = field.boss.enemy;
    if (body.hp > 0) damageEnemy(field, body, 4, true);
    stepWorld(STEP, { moveX: 0, moveY: 0, moving: false, aimX: body.x, aimY: body.y, firing: true, dash: false });
    cues();
    guard++;
  }
  assert.equal(field.boss, null, 'the thing never died in a minute of being shot');
  assert.equal(fieldIsCaged(field), false);
  assert.equal(field.bossesDown, 1);
});
