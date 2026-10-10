// The two switches that answer for the hand (PLAN section 6, game/assists.js).
//
// AUTO-FIRE holds the trigger and AUTO-AIM points the gun, and with both of them on WASD is a whole
// set of controls - which is the whole of what PLAN means by "playable with one hand or keyboard
// only". They are the opposite kind of thing from the four rows in game/settings.js: those are the
// game's report about a run and may not change one, these two *are* the hand and the whole of what
// they are for is to change what happens in a run. So they get their own file, and the first claim
// this file has to pay for is the one settings.test.mjs could never have made: that a switch is the
// gesture it stands in for and nothing else.
//
// Six things are measured here:
//
//   the switch itself - two places, no third, no wrapping, and zero is not a direction;
//   the trigger - auto-fire is *exactly* a held left button, the same shots on the same steps;
//   the gun - the nearest body a shot can hurt, and nothing else (a body in a phase change is not a
//     target, and empty sky is not a target either);
//   the keeping of it - the gun does not change its mind every step, because two bodies trading the
//     lead every few steps sprays shots between them and kills neither;
//   the off position - both switches off read nothing and write nothing, which is why the reference
//     run traces the same bytes with this file in the tree as without it; and
//   the panel and the purse - a row on the settings panel, kept in the save like every other row,
//     read back by the boot, and a whole run flown with the keyboard alone.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { BALANCE } from '../src/game/balance.js';
import { SAVE_KEY } from '../src/core/save.js';
import {
  ROWS, loadFromSave, stepRow, wordsOf, stepIdOf, autoFireOn, autoAimOn, driveAssists, takeAim,
} from '../src/game/assists.js';
import { scriptedRun, enemyAt, stepTheWorld } from '../tools/headless/scripted.js';
import { bootGame } from '../tools/headless/harness.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const STEP = BALANCE.sim.step;
const BIG = 1e6;

/** Both switches back to the place the game ships at, which is the only place with no claim in it. */
function off() {
  stepRow('fire', -1);
  stepRow('aim', -1);
  assert.deepEqual(loadFromSave(), { fire: false, aim: false });
}

/** The controls with the hand off both the trigger and the mouse: still, and pointed straight up. */
function handsOff(ship) {
  return {
    moveX: 0, moveY: 0, moving: false,
    aimX: ship.x, aimY: ship.y - 100, firing: false, dash: false,
  };
}

/**
 * A world with two bodies to shoot at and nothing else in it: one 120 px to the right of the ship,
 * one 300 px to the left, both standing still and both able to take a hit. The ship starts in the
 * middle of the arena pointing up, so which body the gun has picked is readable off the controls.
 */
function twoBodies(seed) {
  const field = scriptedRun(seed);
  const ship = field.player;
  const near = enemyAt('drifter', ship.x + 120, ship.y, BIG);
  const far = enemyAt('tank', ship.x - 300, ship.y, BIG);
  return {
    field: field, ship: ship, near: near, far: far,
    // The bullet pool counts every shot this process ever fired, so a measured window is measured as
    // a difference and not as the counter itself.
    spawnedAt: field.bullets.stats().spawned,
  };
}

/** Step `seconds` with the same controls held. */
function hold(seconds, input) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) stepTheWorld(input);
}

/** Everything a measured window came to, as one string to compare two windows with. */
function fingerprint(world) {
  const field = world.field;
  return [
    field.steps, field.score, field.kills,
    field.bullets.stats().spawned - world.spawnedAt,
    Math.round(field.player.x), Math.round(field.player.y), field.player.angle.toFixed(9),
  ].join('/');
}

// --- the switches ----------------------------------------------------------------

test('a switch has two places, no third, and ships at the one that asks for nothing', () => {
  assert.deepEqual(loadFromSave(), { fire: false, aim: false },
    'both of them ship off, which is the game as it was built and balanced');
  assert.equal(autoFireOn(), false);
  assert.equal(autoAimOn(), false);

  // Every row is worth reading by a person: a name, one plain line, and words for its two places.
  assert.deepEqual(ROWS.map((row) => row.id), ['fire', 'aim']);
  for (const row of ROWS) {
    assert.equal(row.name, row.name.toUpperCase());
    assert.equal(row.says, row.says.toUpperCase());
    assert.ok(row.name.length > 0 && row.says.length > 0);
  }

  assert.equal(stepRow('fire', 1).id, 'on');
  assert.equal(stepRow('fire', 1), null, 'there is nothing above on, so nothing to step to');
  assert.equal(wordsOf('fire'), 'ON');
  assert.equal(stepIdOf('fire'), 'on');
  assert.equal(stepRow('fire', -1).id, 'off');
  assert.equal(stepRow('fire', -1), null, 'and nothing below off either - a switch does not wrap');
  assert.equal(wordsOf('fire'), 'OFF');

  // Zero is not a direction. The one answer a two-place row has to give the same way a five-place one
  // does (game/settings.js refuses it too), or a press of no direction would lean the row somewhere.
  assert.equal(stepRow('aim', 0), null, 'zero is not a direction');
  assert.equal(stepIdOf('aim'), 'off');

  assert.throws(() => stepRow('no-such-row', 1), /no assist called/, 'a row the game has not got');
  assert.throws(() => wordsOf('no-such-row'), /no assist called/);
  off();
});

// --- the trigger -----------------------------------------------------------------

test('auto-fire is the left button held, and nothing besides', () => {
  // Two identical worlds, one seed, one measured window. In one of them the hand is holding the
  // trigger; in the other the hand is off everything and the switch is pulling it. If the switch is
  // the gesture it stands in for then the two runs are the same run - same shots on the same steps,
  // same ship pointing the same way - and that is a much stronger claim than "shots appeared".
  off();
  const held = twoBodies(5101);
  hold(2, Object.assign(handsOff(held.ship), { firing: true }));
  assert.ok(held.field.bullets.stats().spawned - held.spawnedAt > 3, 'the hand got shots away');
  const byHand = fingerprint(held);

  off();
  const auto = twoBodies(5101);
  stepRow('fire', 1);
  hold(2, handsOff(auto.ship));
  assert.ok(auto.field.bullets.stats().spawned - auto.spawnedAt > 3, 'and so did the switch');
  assert.equal(fingerprint(auto), byHand, 'the same shots, the same steps, the same nose');

  // And this switch alone does not turn the ship - that is the other row's job.
  assert.ok(Math.abs(auto.field.player.angle + Math.PI / 2) < 1e-9,
    'the nose is still where the hand left it, pointing up');
  off();
});

// --- the gun ---------------------------------------------------------------------

test('auto-aim points the gun at the nearest body a shot can hurt', () => {
  off();
  const world = twoBodies(5102);
  stepRow('aim', 1);

  const input = handsOff(world.ship);
  driveAssists(world.field, input);
  assert.equal(input.aimX, world.near.x, 'the body to the right, not the one to the left');
  assert.equal(input.aimY, world.near.y);
  assert.equal(world.field.aimLock, world.near, 'and it is held, so the next step asks the same question');

  // Through the step, not just out of the module: the ship's nose really does follow.
  stepTheWorld(handsOff(world.ship));
  assert.ok(Math.abs(world.field.player.angle) < 0.01, 'the nose is along +x, at the body');

  // The far body is the only one left that a shot can hurt, so the gun swings all the way round to it.
  world.near.immune = 1;
  const swung = handsOff(world.ship);
  driveAssists(world.field, swung);
  assert.equal(swung.aimX, world.far.x, 'a body in a phase change is not a target');
  assert.equal(world.field.aimLock, world.far);

  // Nothing left to hurt: the aim stays wherever the hand left it, and the lock is not kept waiting.
  world.far.immune = 1;
  const empty = handsOff(world.ship);
  assert.equal(takeAim(world.field), null, 'there is nothing to aim at');
  driveAssists(world.field, empty);
  assert.equal(empty.aimX, world.ship.x, 'the gun is left where the hand left it, not swung at sky');
  assert.equal(empty.aimY, world.ship.y - 100);
  assert.equal(world.field.aimLock, null, 'and a lock on nothing is no lock');
  off();
});

test('the gun does not change its mind every step', () => {
  // Two bodies circling in from one side trade the lead every few steps, and a nose that snaps between
  // them every few steps sprays shots between both of them and kills neither. So the held body is
  // kept until the nearest one is worth the trade - and then it really is traded, or the gun is
  // holding on to a body it ought to have let go of.
  off();
  const world = twoBodies(5103);
  const ship = world.ship;
  stepRow('aim', 1);

  const a = world.near;
  const b = world.far;
  const input = handsOff(ship);

  // Jitter the pair within the slack of one another, twenty times, and count the minds changed.
  let minds = 0;
  let last = null;
  for (let i = 0; i < 20; i++) {
    a.x = ship.x + (i % 2 === 0 ? 100 : 130);
    b.x = ship.x - (i % 2 === 0 ? 200 : 170);
    driveAssists(world.field, input);
    if (world.field.aimLock !== last) minds++;
    last = world.field.aimLock;
  }
  assert.equal(minds, 1, 'one body won the gun and kept it, however the pair traded the lead');
  assert.equal(world.field.aimLock, a);

  // Now the far body is worth the trade: the nearest is a sixth of the distance away, and a body that
  // much further out is a different fight. The gun says so and lets the old one go.
  a.x = ship.x + 400;
  b.x = ship.x - 60;
  driveAssists(world.field, input);
  assert.equal(world.field.aimLock, b, 'the gun let the old one go');
  assert.equal(input.aimX, b.x);

  // And it follows the body it has, step for step, rather than pointing at where that body was.
  for (let i = 0; i < 6; i++) {
    b.x -= 40;
    driveAssists(world.field, input);
    assert.equal(input.aimX, b.x, 'step ' + i + ' aims where the body is now');
    assert.equal(world.field.aimLock, b, 'and it is the same body all the way');
  }
  off();
});

test('a body that dies takes the lock with it, and so does a new run', () => {
  off();
  const world = twoBodies(5104);
  stepRow('aim', 1);

  driveAssists(world.field, handsOff(world.ship));
  assert.equal(world.field.aimLock, world.near);

  // The way a body leaves the crowd is by dying, and a dead body cannot be hurt (game/enemies.js
  // `damageEnemy` refuses it), so the same question answers both: the lock is a fact about this
  // step's crowd and nothing else.
  world.near.hp = 0;
  driveAssists(world.field, handsOff(world.ship));
  assert.equal(world.field.aimLock, world.far, 'the gun moved on to the only body left');

  // Turning the switch off drops the lock rather than leaving it lying there for the next time the
  // switch is turned on, in whichever arena that happens to be.
  stepRow('aim', -1);
  assert.equal(autoAimOn(), false);
  driveAssists(world.field, handsOff(world.ship));
  assert.equal(world.field.aimLock, null, 'a lock from a switch that is off is not a lock');

  // And a fresh run starts with nothing held - the crowd it was held on went with the last run.
  stepRow('aim', 1);
  const next = twoBodies(5105);
  assert.equal(next.field.aimLock, null, 'a new run inherits no lock');
  driveAssists(next.field, handsOff(next.ship));
  assert.equal(next.field.aimLock, next.near, 'and it finds a body of its own on the first step');
  off();
});

// --- both of them, and the game they do not touch ----------------------------------

test('with both switches off, nothing is read and nothing is written', () => {
  // The claim the reference run leans on: a build that has never heard of these switches and a build
  // that has, with both of them off, are the same build. So the step asks for nothing - no walk of the
  // crowd, no field of the controls touched - and a run plays exactly as it always did.
  off();
  const field = scriptedRun(5106);
  const ship = field.player;
  enemyAt('drifter', ship.x + 90, ship.y, BIG);
  const input = handsOff(ship);
  const before = Object.assign({}, input);
  driveAssists(field, input);
  assert.deepEqual(input, before, 'the controls came back exactly as they went in');
  assert.equal(field.aimLock, null);

  const spawnedAt = field.bullets.stats().spawned;
  hold(2, handsOff(ship));
  assert.equal(field.bullets.stats().spawned - spawnedAt, 0, 'not one shot went off on its own');
  assert.equal(field.score, 0, 'and nothing died, because nothing was fired');
});

// --- the panel, the save, and a run flown without a mouse --------------------------

const game = await bootGame({ root: ROOT, seed: 6101, width: 1280, height: 720, storage: {} });

function press(code) {
  game.key(code, true);
  game.key(code, false);
  game.step(FRAME);
}

function frames(howMany) {
  for (let i = 0; i < howMany; i++) game.step(FRAME);
}

/** Write a save document into this browser as a previous visit left it. */
function storedAssists(assists) {
  game.storage[SAVE_KEY] = JSON.stringify({ version: 1, assists: assists });
}

test('the panel asks for the two switches last, and keeps them in the save', async () => {
  off();
  await game.resetToTitle(6101);
  frames(4);
  press('KeyO');

  // Last, and that is a decision: everything above them is the game's report about a run and cannot
  // change one; these two are the hand (main.js `settingRows`).
  assert.deepEqual(game.screen.settingsRows.map((row) => row.name), [
    'SCREEN SHAKE', 'HIT FLASH', 'SCORE NUMBERS', 'PARTICLES', 'MUSIC', 'SOUNDS', 'MUTE',
    'AUTO-FIRE', 'AUTO-AIM',
  ], 'four to the eyes, three to the ears, then the two to the hand');
  assert.deepEqual(game.screen.settingsRows.slice(7).map((row) => row.value), ['OFF', 'OFF'],
    'and the panel prints where they stand, which is off');
  for (const row of game.screen.settingsRows.slice(7)) {
    assert.ok(row.says.length > 0, row.name + ' says what it does');
  }

  // Down the whole panel to AUTO-FIRE, and step it: the row on the glass and the game agree.
  for (let i = 0; i < 7; i++) press('ArrowDown');
  assert.equal(game.screen.settingsRows[7].chosen, true, 'the cursor reaches the last two rows');
  press('ArrowRight');
  assert.equal(game.stats().assists.fire, 'on');
  assert.equal(game.screen.settingsRows[7].value, 'ON');
  press('ArrowRight');
  assert.equal(game.stats().assists.fire, 'on', 'refused at the end of the row, in silence');

  press('ArrowDown');
  press('ArrowRight');
  assert.equal(game.stats().assists.aim, 'on');
  assert.equal(game.stats().assists.fire, 'on', 'one row is one row');
  press('ArrowLeft');
  assert.equal(game.stats().assists.aim, 'off');

  press('KeyO');
  const saved = JSON.parse(game.storage[SAVE_KEY]);
  assert.deepEqual(saved.assists, { fire: true, aim: false },
    'the switch that was moved is kept, for the next visit');
  off();
});

test('the boot reads the switches back, and a value that is not yes or no is no', () => {
  storedAssists({ fire: true, aim: true });
  assert.deepEqual(loadFromSave(), { fire: true, aim: true }, 'a visit that asked for them gets them');
  assert.equal(autoFireOn(), true);

  // The argument core/save.js makes about every field it reads: a value that is not this build's value
  // is not that value trimmed a little, so it is dropped and the switch ships at off.
  storedAssists({ fire: 'yes', aim: 1 });
  assert.deepEqual(loadFromSave(), { fire: false, aim: false }, 'a string and a number are not a switch');

  storedAssists({});
  assert.deepEqual(loadFromSave(), { fire: false, aim: false }, 'and a row nobody set is off');

  delete game.storage[SAVE_KEY];
  off();
});

/**
 * One launch, the mouse never touched, and whatever the switches were left at.
 *
 * The pointer sits where the harness put it and the left button is never pressed: everything that
 * goes off in these two runs is the switches' doing.
 */
async function flyHandedOff(seconds) {
  await game.resetToTitle(6102);
  frames(4);
  press('Space');
  frames(Math.round(seconds * 1000 / FRAME));
  const s = game.stats();
  return { bullets: s.bullets, kills: s.kills, score: s.score, state: s.state };
}

test('a run can be flown with the keyboard alone', async () => {
  // The whole point of the two rows, in one pair of launches: the same seed flown with the hand off
  // the mouse, once with the switches off - where nothing can happen - and once with them on.
  off();
  const silent = await flyHandedOff(6);
  assert.equal(silent.kills, 0, 'with both switches off the ship has no way to shoot');
  assert.equal(silent.score, 0);

  stepRow('fire', 1);
  stepRow('aim', 1);
  const flying = await flyHandedOff(6);
  assert.equal(flying.state, game.STATE.PLAY, 'the run is still going');
  assert.ok(flying.kills > 0, 'and it killed ' + flying.kills + ' bodies with the keyboard alone');
  assert.ok(flying.score > 0, 'and it scored ' + flying.score);

  off();
  await game.resetToTitle(6102);
  frames(4);
});
