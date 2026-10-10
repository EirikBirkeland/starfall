// Endless mode (PLAN 3.4: "After the Eclipse, the run is won. Endless mode then continues with
// all values scaling for as long as the player lasts").
//
// This is the first half of that sentence being undone: a run that has been won is handed its
// arena back and flies on (game/run.js `continueRun`). What this file owns is the hand-back and
// what it does not take away:
//
//   **It is the same run.** Score, hull, level, build, the fights it buried: none of it is reset,
//     because `winRun` stopped this exact world and this starts that one again. A fresh sheet is
//     what a *new* run is, and that is a different key.
//
//   **The schedule stays spent.** It is walked once, so from here the wave director is all there is
//     left to fight (game/bosses.js). A run does not meet the Eclipse twice.
//
//   **The arena is live again, including on the step it comes back.** The world stopped with the
//     crowd standing where it stopped, some of it on top of a ship that had been told it was safe,
//     so the hand-back is the one place a run needs a grace it did not ask for.
//
// The keys the card answers to - the one that resumes and the ones that ask for a new run - are
// main.js, so they are owned by test/victory-card.test.mjs, which boots the game. Everything here
// is the simulation's half, in the same parked world test/victory.test.mjs plays in.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import { PALETTE } from '../src/core/palette.js';
import { STATE } from '../src/game/state.js';
import {
  canStartRun, continueRun, endRun, startRun, victoryCardIsAnswerable, victoryCardIsUp,
} from '../src/game/run.js';
import { damageEnemy } from '../src/game/enemies.js';
import { endlessTime } from '../src/game/endless.js';
import { drainCues, clearCues } from '../src/game/cues.js';
import { scriptedRun, stepTheWorld, bossOnTheField, enemyAt } from '../tools/headless/scripted.js';

const STEP = BALANCE.sim.step;
const SCHEDULE = BALANCE.bosses.schedule;
const LAST = SCHEDULE.length - 1;
const HUSH = BALANCE.victory.hush;
const GUARD = BALANCE.victory.guard;
const GRACE = BALANCE.endless.resumeInvulnerability;

let field = null;

/** One step; the seconds of arena it was actually worth (a frozen step is worth none). */
function step() {
  return stepTheWorld() ? STEP : 0;
}

/** Step until `seen` answers true, and say whether it ever did. */
function until(seen, seconds) {
  let ran = 0;
  while (!seen()) {
    if (ran > seconds) return false;
    ran += step();
  }
  return true;
}

/** Do to a boss what every gun in the game does to a body that is about to stop. */
function fell(boss) {
  damageEnemy(field, boss.enemy, boss.enemy.maxhp * 10, true);
}

/**
 * Bring the last fight on the schedule onto the field, fell it, and wait for the run to stop.
 * The siren, the arrival and the whole of the going-down are drained out of the cues afterwards,
 * so a test that reads the queue later hears only what it asked for.
 */
function winTheRun() {
  field = scriptedRun(7);
  // A run that starts against no best score at all: `world.best` is loaded once per page and
  // `resetRun` does not touch it (test/victory.test.mjs says why).
  field.best = 0;
  fell(bossOnTheField(LAST));
  assert.ok(until(() => field.state !== STATE.PLAY, 6), 'the schedule ran out and the run did not notice');
  clearCues();
  return field;
}

/**
 * Step out the whole of the ending: the hush the card arrives on, and the guard after it during
 * which the game answers to nothing at all. The hand-back waits on the guard and not the hush,
 * because a card that can be clicked away before it is read has not been shown (game/run.js
 * `victoryCardIsAnswerable`).
 */
function waitOutOfTheGuard() {
  let waited = 0;
  while (!victoryCardIsAnswerable(field) && waited < GUARD + 1) waited += step();
  assert.ok(victoryCardIsAnswerable(field), 'the card never became answerable');
  assert.ok(victoryCardIsUp(field), 'and it is still the card that was up while it was waited out');
  return waited;
}

/** A shard lying where the ship is, written field by field like any spawner must. */
function shardUnderTheShip() {
  const shard = field.shards.spawn();
  shard.x = field.player.x;
  shard.y = field.player.y;
  shard.px = shard.x;
  shard.py = shard.y;
  shard.vx = 0;
  shard.vy = 0;
  shard.life = BALANCE.shards.life;
  shard.spin = 0;
  shard.rot = 0;
  shard.worth = 1;
  return shard;
}

function ringsIn(color) {
  let n = 0;
  for (const r of field.rings.items) if (r.color === color) n++;
  return n;
}

function wordsSaying(word) {
  let n = 0;
  for (const t of field.texts.items) if (t.text === word) n++;
  return n;
}

// ---------------------------------------------------------------------------
// What will and will not hand a run back
// ---------------------------------------------------------------------------

test('a run that has not been won cannot be handed back', () => {
  field = scriptedRun(3);
  clearCues();
  assert.equal(continueRun(field), false, 'a run that is flying is not a win being resumed');
  assert.equal(field.state, STATE.PLAY, 'and asking left it exactly as it was');
  assert.equal(field.endless, false, 'and did not say it was endless');

  field.state = STATE.OVER;
  assert.equal(continueRun(field), false, 'a wreck is an ending with nothing after it');
  assert.equal(field.state, STATE.OVER);
});

test('a won run is ready to be handed back when its card is, and not before', () => {
  winTheRun();
  // The card is the hand-back: on the step the fight came down the run is still finishing being
  // won, and one clock holds both doors (game/run.js `victoryCardIsAnswerable`).
  assert.equal(continueRun(field), false, 'on the step the fight came down');
  assert.equal(field.state, STATE.WON);

  let waited = 0;
  while (!victoryCardIsUp(field) && waited < HUSH + 1) waited += step();
  assert.ok(victoryCardIsUp(field), 'the card never came up');
  assert.equal(continueRun(field), false,
    'and the card being up is not yet an answer: the guard is ' + GUARD + 's from the win');

  while (!victoryCardIsAnswerable(field) && waited < GUARD + 1) waited += step();
  assert.ok(victoryCardIsAnswerable(field), 'the guard never went away');
  assert.equal(continueRun(field), true, 'and from there the run can be handed back');
  assert.equal(continueRun(field), false, 'once, and only once: a run flying again is not handed back');
});

test('an ended run hands back nothing it did not win', () => {
  field = scriptedRun(2);
  endRun(field);
  assert.equal(field.state, STATE.OVER);
  assert.equal(continueRun(field), false, 'a wreck has no endless mode behind it');
  assert.equal(field.endless, false);
});

// ---------------------------------------------------------------------------
// The same run, not a new one
// ---------------------------------------------------------------------------

test('the run keeps everything it earned', () => {
  winTheRun();
  const ship = field.player;
  const before = {
    score: field.score,
    level: ship.level,
    hull: ship.hull,
    kills: field.kills,
    shards: field.shardsCollected,
    bosses: field.bossesDown,
    elapsed: field.elapsed,
    ranks: Object.assign({}, field.upgrades),
  };
  waitOutOfTheGuard();
  assert.equal(continueRun(field), true);

  assert.equal(field.state, STATE.PLAY, 'the arena is running again');
  assert.equal(field.endless, true, 'and it knows it is past the end of the schedule');
  assert.equal(field.overTimer, 0, 'the clock over the ending is put down');
  assert.equal(field.score, before.score, 'the score is the run\u2019s, not a fresh sheet');
  assert.equal(ship.level, before.level, 'the level it climbed to');
  assert.equal(ship.hull, before.hull, 'and the hull it had left');
  assert.equal(field.kills, before.kills);
  assert.equal(field.shardsCollected, before.shards);
  assert.equal(field.bossesDown, before.bosses, 'every fight it buried is still buried');
  assert.equal(field.elapsed, before.elapsed, 'and the run\u2019s own clock never moved during the hush');
  for (const id of Object.keys(before.ranks)) {
    assert.equal(field.upgrades[id], before.ranks[id], 'the build it was built out of: ' + id);
  }
  assert.equal(field.tally.won, true, 'the sheet still says it was won');
  assert.equal(field.tally.endless, true, 'and that it then went on');
});

test('the second clock starts on the hand-back and belongs to this run only', () => {
  winTheRun();
  assert.equal(endlessTime(field), 0, 'a won run that is still being read has not started counting');
  waitOutOfTheGuard();
  assert.equal(endlessTime(field), 0, 'nor while the guard is being waited out');

  const at = field.elapsed;
  assert.equal(continueRun(field), true);
  assert.equal(field.endlessAt, at, 'the clock is taken from the run clock, on the step of the hand-back');
  assert.equal(endlessTime(field), 0, 'and reads nothing there');

  // A second of flying past the win is a second on this clock - and one step of error either way is
  // a frame of the run, so the comparison is loose by that much and by nothing more.
  for (let i = 0; i < 120; i++) step();
  assert.ok(Math.abs(endlessTime(field) - 1) < 0.02,
    'a second past the win reads ' + endlessTime(field).toFixed(3) + 's');

  startRun(field);
  assert.equal(field.endlessAt, 0, 'a new run puts the clock back on the shelf with the last one');
  assert.equal(endlessTime(field), 0, 'and nothing is growing for a run that has not won');
});

test('a new run asked for over the card is new in every way, endless included', () => {
  winTheRun();
  waitOutOfTheGuard();
  assert.equal(canStartRun(field), true, 'a won run can be left for a new one once the card is up');
  continueRun(field);
  assert.equal(field.endless, true);
  startRun(field);
  assert.equal(field.endless, false, 'the next run starts with the schedule whole again');
  assert.equal(field.tally.endless, false, 'and starts its own sheet, not this one\u2019s');
  assert.equal(field.bossesDown, 0);
});

test('the hand-back is a ring, a word and a chord, and nothing else', () => {
  winTheRun();
  waitOutOfTheGuard();
  const spec = BALANCE.endless;
  const before = ringsIn(PALETTE.elite);
  clearCues();
  assert.equal(continueRun(field), true);

  assert.ok(ringsIn(PALETTE.elite) > before, 'one ring out of the hull, in the colour of a reward');
  assert.equal(wordsSaying(spec.word), 1, 'and the word over it, once');
  const heard = [];
  drainCues((cue) => heard.push(cue));
  assert.equal(heard.filter((cue) => cue.kind === 'chord').length, 1, 'one chord, and not a second fanfare');
  assert.equal(heard.filter((cue) => cue.kind === 'beep').length, 0, 'and no shard ping pretending to be news');
});

// ---------------------------------------------------------------------------
// The arena is live again
// ---------------------------------------------------------------------------

test('the ship is given the moment the crowd was not', () => {
  winTheRun();
  const ship = field.player;
  // The world stopped with a body standing on the ship, which is exactly what the grace is for.
  enemyAt('drifter', ship.x, ship.y, 999);
  ship.invuln = 0;
  ship.hull = ship.maxHull;
  waitOutOfTheGuard();
  assert.equal(ship.hull, ship.maxHull, 'and it took nothing for it while the run was won');

  assert.equal(continueRun(field), true);
  assert.ok(ship.invuln >= GRACE - STEP, 'the hand-back comes with the grace, not without');
  for (let i = 0; i < 30; i++) step();
  assert.equal(ship.hull, ship.maxHull, 'a body on top of it costs it nothing during the grace');

  ship.invuln = 0;
  assert.ok(until(() => ship.hull < ship.maxHull, 3), 'and costs it a hull the moment the grace is gone');
});

test('the run runs: its clock, its director, and its danger', () => {
  winTheRun();
  waitOutOfTheGuard();
  const ship = field.player;
  ship.invuln = Infinity;
  assert.equal(continueRun(field), true);

  const at = field.elapsed;
  field.spawnTimer = 0;      // the scripted world parks the director; this test wants it working
  assert.ok(until(() => field.enemies.length > 0, 20), 'the wave director did not come back');
  assert.ok(field.elapsed > at, 'and neither did the run\u2019s own clock');
});

test('a run that went on can be lost, and its bigger score is the one kept', () => {
  winTheRun();
  const wonScore = field.score;
  assert.equal(field.best, wonScore, 'the win banked what the run had when the schedule ran out');
  waitOutOfTheGuard();
  const ship = field.player;
  assert.equal(continueRun(field), true);

  // Fly on, score something, then come apart: what an endless run dies of is still an ending, and
  // the best has to follow the run rather than stop at the win.
  ship.invuln = Infinity;
  const paid = enemyAt('drifter', ship.x + 400, field.player.y, 1);
  damageEnemy(field, paid, 999, true);
  assert.ok(field.score > wonScore, 'a body that came down after the win paid for itself');

  ship.invuln = 0;
  ship.hull = 1;
  enemyAt('drifter', ship.x, ship.y, 999);
  assert.ok(until(() => field.state === STATE.OVER, 5), 'and the run can still be ended');
  assert.equal(field.tally.won, true, 'won and then beaten: the sheet says both and lies about neither');
  assert.ok(field.score > wonScore, 'it scored further than the win');
  assert.equal(field.best, field.score, 'and that is the number kept');
  assert.equal(field.newBest, true);
});

// ---------------------------------------------------------------------------
// The schedule stays spent
// ---------------------------------------------------------------------------

test('nothing walks in after the last fight', () => {
  winTheRun();
  waitOutOfTheGuard();
  const ship = field.player;
  ship.invuln = Infinity;
  assert.equal(continueRun(field), true);

  for (let i = 0; i < 120 * 60; i++) step();      // a minute of arena
  assert.equal(field.boss, null, 'no fight is due, ever again');
  assert.equal(field.bossIndex, SCHEDULE.length, 'the schedule is still walked out');
  assert.equal(field.state, STATE.PLAY, 'the run is still flying, and only flying');
  assert.equal(field.tally.won, true, 'and it is still the run that was won');
  assert.ok(field.elapsed > 60, 'for a whole minute of it');
});

test('a level up cannot steal a win', () => {
  field = scriptedRun(9);
  field.best = 0;
  const boss = bossOnTheField(LAST);
  // A shard under the ship and one XP short of a level: the shards are walked after the boss
  // framework, collecting this one would deal a card, and a card is a state that is not the win
  // (game/upgrades.js `refreshOffer`). The step has to leave the moment the fight ends the run
  // (game/world.js), which is what game/bosses.js `updateBosses` now answers for.
  const shard = shardUnderTheShip();
  field.xp = field.xpNeed - 1;
  clearCues();
  fell(boss);
  assert.ok(until(() => field.state !== STATE.PLAY, 3), 'the run never ended at all');

  assert.equal(field.state, STATE.WON, 'the run is won and not paused on a card');
  assert.equal(field.pendingLevels, 0, 'a level it did not get to earn is not owed across an ending');
  assert.ok(field.shards.items.includes(shard), 'and the shard is still lying there, uncollected');
  assert.equal(field.xp, field.xpNeed - 1, 'and it never got to swallow the XP');
});
