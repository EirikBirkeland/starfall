// Choosing a primary (PLAN 3.2's "pick the weapon on the title screen with a key"),
// through the real game: the DOM list it is built from, the number keys that answer it,
// the run that flies the result, and the two screens that have to say which gun was flown.
//
// One world per process, as ever, so this file is one session: sit on the title, pick the
// second primary, launch it, and finish the run with it.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { endingItAt, startBotRun, FRAME_MS } from '../tools/headless/bot.js';
import { BALANCE } from '../src/game/balance.js';
import { WEAPONS } from '../src/game/weapons.js';
import { dropShards } from '../src/game/pickups.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 71 });
const world = game.world;
const ship = world.player;
const SECOND = WEAPONS[1];
const SECOND_ROW = BALANCE.weapons[SECOND.id];

/**
 * Pay for exactly one level and step until the run stops to spend it (the same trick as
 * test/level-up.test.mjs: the bank starts empty, so one call is exactly one choice).
 */
function earnALevel() {
  world.xp = 0;
  world.shards.clear();
  world.enemies.length = 0;
  world.pendingLevels = 0;
  dropShards(world, ship.x, ship.y, Math.ceil(world.xpNeed / BALANCE.shards.xp));
  let frames = 0;
  while (world.state !== game.STATE.LEVEL && frames < 400) {
    game.step(FRAME_MS);
    frames++;
  }
  assert.equal(world.state, game.STATE.LEVEL, 'the shards came in and the run stopped for a choice');
  return frames;
}

/** One key, pressed and released, and the frame that hears it. */
function press(code) {
  game.key(code, true);
  game.key(code, false);
  game.step(FRAME_MS);
}

test('the title offers every primary, in key order, and lights the default', () => {
  const rows = game.screen.weapons;
  assert.equal(rows.length, WEAPONS.length, 'one line per primary on offer');
  for (let i = 0; i < rows.length; i++) {
    assert.ok(rows[i].label.startsWith(String(i + 1)), rows[i].label + ' is picked with ' + (i + 1));
    assert.ok(rows[i].label.includes(BALANCE.weapons[WEAPONS[i].id].name), 'it says what it is');
    assert.ok(rows[i].label.includes(WEAPONS[i].blurb), 'and what it is for');
  }

  const picked = rows.map((row) => row.picked);
  assert.deepEqual(picked, WEAPONS.map((weapon, i) => i === 0),
    'exactly one is lit, and it is the one a run that never picked flies');
  assert.equal(game.stats().weapon, WEAPONS[0].id);
});

test('every primary on the rack answers its own number', () => {
  // One row per primary and one key per primary are two different lists, and they were once
  // maintained separately: the fourth primary arrived and could be looked at and not chosen
  // (src/input/keyboard.js). So this is the whole point of the file as far as a new gun is
  // concerned - a row that no key answers is a gun nobody can fly.
  for (let i = 0; i < WEAPONS.length; i++) {
    press('Digit' + (i + 1));
    assert.equal(game.stats().weapon, WEAPONS[i].id,
      'the ' + (i + 1) + ' key is ' + WEAPONS[i].id);
  }
  // The numpad answers the same list, for a keyboard that has one.
  press('Numpad' + WEAPONS.length);
  assert.equal(game.stats().weapon, WEAPONS[WEAPONS.length - 1].id, 'and so is the numpad');
  press('Digit' + 2);            // leave the pick where the rest of this file expects it
});

test('a number key on the title chooses the primary', () => {
  press('Digit' + 2);
  assert.equal(game.stats().weapon, SECOND.id, 'the second key is the second primary');

  const rows = game.screen.weapons;
  assert.equal(rows[0].picked, false, 'the old pick went out');
  assert.equal(rows[1].picked, true, 'and the new one is lit');

  // A key past the list changes nothing: nothing is offered at that number, and a silent nothing is
  // a better answer than a surprise.
  press('Digit' + (WEAPONS.length + 1));
  assert.equal(game.stats().weapon, SECOND.id, 'the pick stands');
});

test('the run a title pick launches flies that gun', () => {
  startBotRun(game);
  ship.invuln = Infinity;          // this file is about the gun, not about dying
  world.spawnTimer = Infinity;

  assert.equal(game.stats().state, game.STATE.PLAY);
  assert.ok(Math.abs(game.stats().fireRate - SECOND_ROW.fireRate) < 1e-9,
    'the cycle is the chosen gun\'s');

  // Wait for the first pull and count what came out of it: a cone, not a shot.
  let fired = 0;
  for (let i = 0; i < 200 && fired === 0; i++) {
    const before = world.bullets.count;
    game.step(FRAME_MS);
    fired = world.bullets.count - before;
  }
  assert.ok(fired > 0, 'the trigger was held and something left');
  assert.equal(fired % SECOND_ROW.pellets, 0, 'and it left in whole fans of ' + SECOND_ROW.pellets);
});

test('a number key in the middle of a run does not swap the gun', () => {
  // The keys mean "pick a card" while a run is on, and nothing at all between pulls of
  // the trigger: a run that changed its weapon because the player fat-fingered a 2 would
  // be a run whose build was not the one it chose.
  press('Digit' + 1);
  press('Digit' + 3);
  assert.equal(game.stats().weapon, SECOND.id, 'still the scatter');
});

test('a number key while the cards are up picks a card, as it always did', () => {
  earnALevel();
  const taking = world.offer[0];
  const before = world.upgrades[taking];

  press('Digit' + 1);
  assert.equal(game.stats().weapon, SECOND.id, 'the gun did not move');
  assert.equal(world.upgrades[taking], before + 1, 'and the card was taken');
});

test('the HUD names the gun while the run is on', () => {
  game.step(FRAME_MS);
  const words = game.words();
  assert.ok(words.some((word) => word === 'GUN  ' + SECOND_ROW.name),
    'the pick is on the glass: ' + words.join(' / '));
});

test('the game-over card says which gun the run flew', () => {
  ship.invuln = 0;
  endingItAt(0)(game, 1);
  let frames = 0;
  while (game.stats().state !== game.STATE.OVER && frames++ < 200) game.step(FRAME_MS);

  assert.equal(game.stats().state, game.STATE.OVER, 'the run ended');
  assert.ok(game.screen.build.includes(SECOND_ROW.name),
    'and says what was flown: ' + game.screen.build);
});
