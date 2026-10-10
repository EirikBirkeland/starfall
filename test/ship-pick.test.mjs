// Choosing a ship (PLAN 3.7's ships, handed out from the hangar with a number key - and from the
// title and the wreck with the same keys, which mean the same thing in all three), through the real
// game: the rack it is chosen from, the number keys that answer it, the run that flies the result,
// and the two screens that have to say which ship was flown. A ship is its body and its gun
// together, so this file is the heir to both the old primary pick and the hull-and-speed numbers
// game/ships.js hands out.
//
// One world per process, as ever, so this file is one session: sit on the title, pick the
// second ship, launch it, and finish the run with it.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame, everyShipBought } from '../tools/headless/harness.js';
import { endingItAt, startBotRun, FRAME_MS } from '../tools/headless/bot.js';
import { BALANCE } from '../src/game/balance.js';
import { SHIPS } from '../src/game/ships.js';
import { WEAPONS } from '../src/game/weapons.js';
import { dropShards } from '../src/game/pickups.js';

const ROOT = path.resolve(import.meta.dirname, '..');
// Every ship bought, because this file is about which key means which ship and not about what the
// hangar charges for it (game/hangar.js, test/unlocks.test.mjs).
const game = await bootGame({
  root: ROOT,
  seed: 71,
  storage: { 'starfall.save': JSON.stringify({ version: 1, hangar: { ships: everyShipBought() } }) },
});
const world = game.world;
const ship = world.player;
const SECOND = SHIPS[1];
const SECOND_ROW = BALANCE.ships[SECOND.id];
const SECOND_GUN = BALANCE.weapons[SECOND_ROW.weapon];

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

test('the rack offers every ship, in key order, and lights the default', () => {
  const rows = game.screen.ships;
  assert.equal(rows.length, SHIPS.length, 'one line per ship on offer');
  for (let i = 0; i < rows.length; i++) {
    assert.ok(rows[i].label.startsWith(String(i + 1)), rows[i].label + ' is picked with ' + (i + 1));
    assert.ok(rows[i].label.includes(BALANCE.ships[SHIPS[i].id].name), 'it says which ship it is');
    assert.ok(rows[i].label.includes(BALANCE.weapons[BALANCE.ships[SHIPS[i].id].weapon].name),
      'and which primary that ship brings');
    assert.ok(rows[i].label.includes(SHIPS[i].blurb), 'and what the body is like');
  }

  const picked = rows.map((row) => row.picked);
  assert.deepEqual(picked, SHIPS.map((row, i) => i === 0),
    'exactly one is lit, and it is the one a run that never picked flies');
  assert.equal(game.stats().ship, SHIPS[0].id);
});

test('every ship on the rack answers its own number', () => {
  // One row per ship and one key per ship are two different lists, and they were once
  // maintained separately: the fourth primary arrived and could be looked at and not chosen
  // (src/input/keyboard.js). So this is the whole point of the file as far as a new ship is
  // concerned - a row that no key answers is a ship nobody can fly.
  for (let i = 0; i < SHIPS.length; i++) {
    press('Digit' + (i + 1));
    assert.equal(game.stats().ship, SHIPS[i].id, 'the ' + (i + 1) + ' key is the ' + SHIPS[i].id);
    assert.equal(game.stats().weapon, BALANCE.ships[SHIPS[i].id].weapon,
      'and it brings the ' + BALANCE.ships[SHIPS[i].id].weapon + ' with it');
  }
  // The numpad answers the same list, for a keyboard that has one.
  press('Numpad' + SHIPS.length);
  assert.equal(game.stats().ship, SHIPS[SHIPS.length - 1].id, 'and so is the numpad');
  press('Digit' + 2);            // leave the pick where the rest of this file expects it
});

test('the number a gun has on the rack is the number it always had', () => {
  // The ships are picked with the keys the primaries used to have, so the one promise that
  // keeps a year of muscle memory is that the ship carrying a given gun stands where that
  // gun stood. A new ship slotted in anywhere else would quietly move the key under a
  // familiar gun, and nothing on screen would say so.
  for (let i = 0; i < WEAPONS.length; i++) {
    press('Digit' + (i + 1));
    assert.equal(game.stats().weapon, WEAPONS[i].id,
      'the ' + (i + 1) + ' key still means the ' + WEAPONS[i].id);
  }
});

test('a number key on the title chooses the ship, and the title says so', () => {
  press('Digit' + 2);
  assert.equal(game.stats().ship, SECOND.id, 'the second key is the second ship');
  assert.ok(game.screen.titleShip.includes(SECOND_ROW.name),
    'and the line that names what the next run flies moved: ' + game.screen.titleShip);

  const rows = game.screen.ships;
  assert.equal(rows[0].picked, false, 'the old pick went out');
  assert.equal(rows[1].picked, true, 'and the new one is lit');

  // The first perk key is not a ship key (game/perks.js owns the numbers after the ships'), so it
  // cannot move the pick either. It is answered - it puts the rack up, which is where that row
  // lives - and it has to come back down again for the tests below, which launch with a click and a
  // click on the rack is not a launch.
  press('Digit' + (SHIPS.length + 1));
  assert.equal(game.stats().ship, SECOND.id, 'the pick stands');
  assert.equal(game.screen.hangarHidden, false, 'and the rack went up to show the row it named');
  press('KeyH');
  assert.equal(game.screen.hangarHidden, true, 'and H takes it away again');
});

test('the run a title pick launches is flown in that ship, with that gun', () => {  startBotRun(game);
  ship.invuln = Infinity;          // this file is about the ship, not about dying
  world.spawnTimer = Infinity;

  assert.equal(game.stats().state, game.STATE.PLAY);
  assert.equal(ship.hull, SECOND_ROW.hull, 'the hull the ship was priced with');
  assert.equal(ship.maxHull, SECOND_ROW.maxHull, 'and all of it there to start with');
  assert.equal(ship.maxSpeed, SECOND_ROW.maxSpeed, 'and the engines it was priced with');
  assert.equal(ship.dashWait, SECOND_ROW.dashCooldown, 'and the dash wait it was priced with');
  assert.equal(ship.shape, SECOND_ROW.shape, 'and drawn as the silhouette it was drawn as');
  assert.ok(Math.abs(game.stats().fireRate - SECOND_GUN.fireRate) < 1e-9,
    'and the cycle is the chosen gun\'s');

  // Wait for the first pull and count what came out of it: a cone, not a shot.
  let fired = 0;
  for (let i = 0; i < 200 && fired === 0; i++) {
    const before = world.bullets.count;
    game.step(FRAME_MS);
    fired = world.bullets.count - before;
  }
  assert.ok(fired > 0, 'the trigger was held and something left');
  assert.equal(fired % SECOND_GUN.pellets, 0, 'and it left in whole fans of ' + SECOND_GUN.pellets);
});

test('a number key in the middle of a run does not swap the ship', () => {
  // The keys mean "pick a card" while a run is on, and nothing at all between pulls of
  // the trigger: a run that changed its body because the player fat-fingered a 2 would be a
  // run whose hull and dash were not the ones it chose.
  press('Digit' + 1);
  press('Digit' + 3);
  assert.equal(game.stats().ship, SECOND.id, 'still the second ship');
  assert.equal(game.stats().weapon, SECOND_ROW.weapon, 'and still its gun');
  assert.equal(ship.hull, SECOND_ROW.hull, 'and the hull did not move either');
});

test('a number key while the cards are up picks a card, as it always did', () => {
  earnALevel();
  const taking = world.offer[0];
  const before = world.upgrades[taking];

  press('Digit' + 1);
  assert.equal(game.stats().ship, SECOND.id, 'the ship did not move');
  assert.equal(world.upgrades[taking], before + 1, 'and the card was taken');
});

test('the HUD names the gun while the run is on', () => {
  game.step(FRAME_MS);
  const words = game.words();
  assert.ok(words.some((word) => word === 'GUN  ' + SECOND_GUN.name),
    'the pick is on the glass: ' + words.join(' / '));
});

test('the game-over card says which ship the run flew', () => {
  ship.invuln = 0;
  endingItAt(0)(game, 1);
  let frames = 0;
  while (game.stats().state !== game.STATE.OVER && frames++ < 200) game.step(FRAME_MS);

  assert.equal(game.stats().state, game.STATE.OVER, 'the run ended');
  assert.ok(game.screen.build.includes(SECOND_ROW.name),
    'and says which ship it was flown in: ' + game.screen.build);
  assert.ok(game.screen.build.includes(SECOND_GUN.name),
    'and which primary that ship brought: ' + game.screen.build);
});
