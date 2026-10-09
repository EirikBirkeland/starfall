// The win (PLAN 3.4: "After the Eclipse, the run is won").
//
// The schedule is the length of the game, and the boss framework is the only thing that
// knows when it has been walked to the end (game/bosses.js). What this file owns is the
// moment it hands the run over to game/run.js as a win instead of a wreck, and the shape
// of that ending:
//
//   **It is an ending, not a prize round.** The arena stops, exactly as it stops for a
//     death, because a fight's last second is still a second of a fight: a ship that has
//     finished must not lose a hull to a blade that was already turning.
//
//   **A wreck is not a win.** The crowd is walked before the boss framework is, so a fight
//     can take the run's last hull in the same step it loses its own, and that run is a
//     wreck with a pretty name.
//
//   **The hush.** The card is not put up on the step the fight comes down - the arena holds
//     still for `victory.hush` first, so the going-down is what the player sees and the card
//     is the second beat - and the same number is what the run waits on before it will take
//     a key. One number, so the card and the key cannot come apart.
//
// The card itself - the glass and the score line - is test/victory-card.test.mjs, which
// boots the game for it. Everything here is the simulation's half.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import { PALETTE } from '../src/core/palette.js';
import { STATE } from '../src/game/state.js';
import { canStartRun, victoryCardIsUp, winRun } from '../src/game/run.js';
import { damageEnemy } from '../src/game/enemies.js';
import { fieldIsCaged } from '../src/game/field.js';
import { drainCues, clearCues } from '../src/game/cues.js';
import { scriptedRun, stepTheWorld, bossOnTheField, enemyAt } from '../tools/headless/scripted.js';

const STEP = BALANCE.sim.step;
const SCHEDULE = BALANCE.bosses.schedule;
const LAST = SCHEDULE.length - 1;
const HUSH = BALANCE.victory.hush;

// The one world this file plays in, rebuilt at the top of every test. `scriptedRun` puts a
// whole run back to its starting value, the boss schedule included.
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

/** How many sparks are alive, painted in one colour. */
function sparksIn(color) {
  let n = 0;
  for (const p of field.particles.items) if (p.color === color) n++;
  return n;
}

/** How many rings are alive, drawn in one colour. */
function ringsIn(color) {
  let n = 0;
  for (const r of field.rings.items) if (r.color === color) n++;
  return n;
}

/**
 * Bring the last fight on the schedule onto the field. The siren and the arrival are drained
 * out of the cues straight afterwards: they are not what these tests are claiming.
 */
function lastFightOnTheField() {
  field = scriptedRun(7);
  // A run that starts against no best score at all. `world.best` is loaded once per page and
  // `resetRun` does not touch it, so in a process that has already won a run the bank would be
  // comparing the new one against the last one's score (test: "a won run banks its score").
  field.best = 0;
  const boss = bossOnTheField(LAST);
  clearCues();
  field.player.invuln = Infinity;
  return boss;
}

/** Fell the last fight and step until the run has stopped. */
function winTheRun() {
  lastFightOnTheField();
  fell(field.boss);
  assert.ok(until(() => field.state !== STATE.PLAY, 6),
    'the schedule ran out and the run did not notice');
}

// ---------------------------------------------------------------------------
// Which ending belongs to which fight
// ---------------------------------------------------------------------------

test('the schedule ends where PLAN puts the last fight, so winning means getting there', () => {
  assert.ok(SCHEDULE.length > 0, 'an empty schedule is a game that is won at once');
  assert.equal(SCHEDULE[LAST].boss, 'eclipse',
    'the Eclipse is the last fight in PLAN 3.4, and the win is defined off that');
  assert.equal(SCHEDULE[LAST].at, 900, 'and it is the fifteen-minute fight');
});

test('the last fight coming down wins the run', () => {
  winTheRun();
  assert.equal(field.state, STATE.WON, 'the run is won');
  assert.equal(field.state === STATE.OVER, false, 'and it is not an over: two endings, two names');
  assert.equal(field.boss, null, 'there is no fight left standing in it');
  assert.equal(field.bossIndex, SCHEDULE.length, 'the schedule is walked to the end');
  assert.equal(field.bossesDown, 1, 'and the one fight that came onto this field is the one that came down');
  assert.equal(fieldIsCaged(field), false, 'and the cage opened on the way out');
});

test('the win stops the run clock and starts the one over the ending', () => {
  winTheRun();
  const at = field.elapsed;
  for (let i = 0; i < 60; i++) step();
  assert.equal(field.elapsed, at, 'no run time passes after the last fight is gone');
  assert.ok(field.overTimer > 0, 'but the clock over an ended run counts, as it does over a death');
});

test('nothing in the arena can hurt a ship that has already finished', () => {
  winTheRun();
  const ship = field.player;
  ship.invuln = 0;
  ship.hull = ship.maxHull;
  enemyAt('drifter', ship.x, ship.y, 5);
  for (let i = 0; i < 30; i++) step();
  assert.equal(ship.hull, ship.maxHull, 'a body standing on the ship costs it nothing now');
});

test('a fight earlier in the schedule is a fight won and not a run won', () => {
  field = scriptedRun(11);
  assert.ok(LAST > 0, 'the first fight had better not also be the last one');
  const boss = bossOnTheField(0);
  fell(boss);
  assert.ok(until(() => field.boss === null, 6), 'the fight never came down');
  for (let i = 0; i < 30; i++) step();
  assert.equal(field.state, STATE.PLAY, 'there are fights left, so the run flies on');
  assert.equal(field.tally.won, false, 'and the sheet says so');
  assert.equal(field.bossIndex, 1, 'and the schedule moved on by exactly one');
});

test('a wreck and a win in the same step is a wreck', () => {
  const boss = lastFightOnTheField();
  // The crowd is walked before the boss framework, and the step leaves the moment the run ends
  // (game/world.js, `stepRun`), so the wreck is the ending this run gets and the framework never
  // gets to say the schedule is out. `winRun` refuses a run that is not flying for the same
  // reason (game/run.js), and both are in place so no reordering can hand a wreck a win.
  field.player.invuln = 0;
  field.player.hull = 1;
  enemyAt('drifter', field.player.x, field.player.y, 1);
  fell(boss);
  assert.ok(until(() => field.state !== STATE.PLAY, 6), 'nothing ended at all');
  assert.equal(field.state, STATE.OVER, 'a run that is a wreck does not get to be a win as well');
  assert.equal(field.tally.won, false, 'and the sheet does not let it pretend');
});

// ---------------------------------------------------------------------------
// The ending itself: the score, the sheet, the noise and the light
// ---------------------------------------------------------------------------

test('a won run banks its score the way a wreck does', () => {
  winTheRun();
  assert.ok(field.score > 0, 'the fight was worth something');
  assert.equal(field.newBest, true, 'the run beat whatever it started against');
  assert.equal(field.best, field.score, 'and the best is now that score');
});

test('the sheet says the run was won, and when', () => {
  winTheRun();
  assert.equal(field.tally.won, true);
  assert.ok(Math.abs(field.tally.wonAt - field.elapsed) < STEP,
    'stamped at the step the last fight came down');
  assert.equal(field.tally.killedBy, '', 'nothing took its last hull, because it still has them all');
});

test('the win is a chord over the fight that made it, not instead of it', () => {
  const boss = lastFightOnTheField();
  fell(boss);
  assert.ok(until(() => field.state === STATE.WON, 6), 'the run never got won');
  const heard = [];
  drainCues((cue) => heard.push(cue));
  const chords = heard.filter((cue) => cue.kind === 'chord');
  assert.ok(chords.length >= 2,
    'the going-down and the win are two chords between them; heard ' + chords.length);
});

test('the win makes its own light out of where the ship is standing', () => {
  const boss = lastFightOnTheField();
  const spec = BALANCE.victory;
  fell(boss);
  // Whatever the kill itself shook has already been shaken by the time the body is down; anything
  // the step that wins puts on top of that is the win's own.
  const shook = field.shake;
  assert.ok(until(() => field.state === STATE.WON, 6), 'the run never got won');
  assert.ok(sparksIn(PALETTE.player) >= spec.burst.count,
    'the burst the row asks for, out of the ship, in the ship\u2019s own colour');
  assert.ok(ringsIn(PALETTE.white) >= 1, 'and the two rings: white for the win');
  assert.ok(ringsIn(PALETTE.elite) >= 1, 'and gold, which is what a reward is written in');
  assert.ok(field.shake > shook, 'and it is felt');
});

// ---------------------------------------------------------------------------
// The hush
// ---------------------------------------------------------------------------

test('the hush outlasts the death guard, and outlasts a step', () => {
  assert.ok(HUSH > BALANCE.runOver.restartGuard,
    'the moment is not something a key can run straight through on the way past');
  assert.ok(HUSH > BALANCE.sim.step, 'and it is a span of time and not one frame');
});

test('the card and the key wait on the same hush', () => {
  winTheRun();
  assert.equal(victoryCardIsUp(field), false, 'the card is not up on the step the fight fell');
  assert.equal(canStartRun(field), false, 'and the run cannot be left yet either');

  let waited = 0;
  while (!victoryCardIsUp(field) && waited < HUSH + 1) waited += step();
  assert.ok(waited >= HUSH - STEP, 'the card came up early, at ' + waited);
  assert.ok(waited <= HUSH + STEP * 3, 'the card came up late, at ' + waited);
  assert.equal(canStartRun(field), true, 'and the key is ready with it');
});

test('a run only wins once', () => {
  winTheRun();
  const score = field.score;
  const best = field.best;
  for (let i = 0; i < 600; i++) step();
  assert.equal(field.state, STATE.WON, 'it is the same ending seconds later');
  assert.equal(field.tally.won, true);
  assert.equal(field.score, score, 'and nothing is still being scored behind the card');
  assert.equal(field.best, best, 'and the best is not being banked again every step');
});

test('a win asked for outside a run does not move the world', () => {
  field = scriptedRun(5);
  field.state = STATE.START;
  clearCues();
  winRun(field);
  assert.equal(field.state, STATE.START, 'a title screen cannot be won');
  assert.equal(field.tally.won, false, 'and the sheet is not written for one that was not');
});
