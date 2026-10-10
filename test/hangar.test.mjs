// The hangar, the purse, and what an ending pays (PLAN 3.7).
//
// The hangar is where a run is chosen from, and it is the first screen the save document speaks
// on: it shows the purse the last runs paid, and it is where milestone 8 will spend it. This file
// boots the game with a visit already remembered - a best score and 500 of dust - and walks the
// screens in the order a player meets them: the title, the rack, a pick, a launch, a wreck, the
// card that says what the run paid, and the win.
//
// One boot, and the tests walk through it in order, because the modules hold the world and a
// process boots one game (test/session.test.mjs says the same).

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame, everyShipBought } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { SHIPS } from '../src/game/ships.js';
import { damageEnemy } from '../src/game/enemies.js';
import { makeEnemy } from '../src/game/kinds.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const SCHEDULE = BALANCE.bosses.schedule;
const LAST = SCHEDULE.length - 1;
const DUE = SCHEDULE[LAST].at;
const GUARD = BALANCE.victory.guard;
const STARTED_WITH = 500;

const game = await bootGame({
  root: ROOT,
  seed: 33,
  audio: true,
  storage: {
    'starfall.save': JSON.stringify({
      version: 1,
      score: { best: 1234 },
      meta: { dust: STARTED_WITH },
      // The whole rack bought, because this file is about the panel and the purse, not about what
      // stands between a player and a ship (game/hangar.js). test/unlocks.test.mjs is that file.
      hangar: { ships: everyShipBought() },
    }),
  },
});

const world = game.world;

/** One key, pressed and released, and the frame that hears it. */
function press(code) {
  game.key(code, true);
  game.key(code, false);
  game.step(FRAME);
}

/** Step frames without pressing anything, and never forever. */
function wait(seconds) {
  const frames = Math.round(seconds * 1000 / FRAME);
  for (let i = 0; i < frames; i++) game.step(FRAME);
}

/** Step until `seen` answers true. Bounded: a regression has to fail, not hang the box. */
function until(seen, seconds) {
  const limit = Math.ceil(seconds * 1000 / FRAME);
  let frames = 0;
  while (!seen() && frames < limit) {
    game.step(FRAME);
    frames++;
  }
  return seen();
}

function hangarOpen() {
  return game.screen.hangarHidden === false;
}

/** Launch the run the title (or the wreck) is offering, with the mouse. */
function launch() {
  game.pressMouse(640, 240);
  game.step(FRAME);
  game.releaseMouse();
  assert.equal(game.stats().state, game.STATE.PLAY, 'the run is flying');
}

/** Put the run that is flying down, at a score the test can name. */
function killTheRun(score) {
  const ship = world.player;
  world.score = score;
  ship.hull = 1;
  ship.invuln = 0;
  ship.fireTimer = 5;             // no shot, or it kills the body planted on it
  game.enemies.push(makeEnemy(world, 'drifter', ship.x, ship.y, {
    hp: 1, speed: 0, drop: 0, score: 0,
  }));
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.OVER, 'the run ended');
  wait(BALANCE.runOver.restartGuard * 2);     // and it may be restarted straight after
}

/** A run that cannot be hurt and cannot be mobbed, parked where the last fight is due. */
function parkAtTheLastFight() {
  launch();
  world.elapsed = DUE - 0.05;
  world.bossIndex = LAST;
  world.player.invuln = Infinity;
  world.spawnTimer = Infinity;
  world.enemies.length = 0;
  assert.ok(until(() => game.stats().bossCores > 0, 20), 'the last fight never walked in');
}

test('the visit opens with what it banked, and says so', () => {
  assert.equal(game.world.best, 1234, 'the best came out of the save');
  assert.equal(game.stats().dust, STARTED_WITH, 'and so did the purse');
  assert.equal(game.screen.titleBest, '1,234');
  assert.equal(game.screen.titleDust, '500');
  assert.ok(game.screen.titleShip.startsWith('FLYING'), 'the title says what you are flying');
  assert.ok(game.screen.titleShip.includes('WISP'), 'by name: ' + game.screen.titleShip);
  assert.ok(game.screen.titleShip.includes('PULSE'), 'and with the gun that comes with it');
  assert.ok(game.screen.nextShip.startsWith('NEXT'),
    'and so does the death card, until it has a wreck to describe: ' + game.screen.nextShip);
});

test('the hangar is shut until H asks for it, and shuts again on the same key', () => {
  assert.equal(hangarOpen(), false, 'nobody asked yet');
  press('KeyH');
  assert.equal(hangarOpen(), true, 'H put it up');
  assert.equal(game.screen.hangarDust, '500', 'and the purse is on it');
  assert.equal(game.screen.startHidden, false, 'the title is still underneath it');
  press('KeyH');
  assert.equal(hangarOpen(), false, 'and H took it away again');
});

test('the rack says what each ship is, what it brings, and what it is priced on', () => {
  press('KeyH');
  const rows = game.screen.ships;
  assert.equal(rows.length, SHIPS.length, 'one line per ship on offer');
  for (let i = 0; i < SHIPS.length; i++) {
    const spec = BALANCE.ships[SHIPS[i].id];
    const label = rows[i].label;
    assert.ok(label.startsWith(String(i + 1)), label + ' is picked with ' + (i + 1));
    assert.ok(label.includes(spec.name), 'it says which ship it is');
    assert.ok(label.includes(BALANCE.weapons[spec.weapon].name), 'and which primary it brings');
    assert.ok(label.includes(SHIPS[i].blurb), 'and what the body is like');
    // The numbers a row can be compared on. The rack exists because the title's one-line list
    // could not be compared at all (game/ships.js is what these come from).
    assert.ok(label.includes(spec.hull + ' HULL'), label + ' says its hull');
    assert.ok(label.includes(Math.round(spec.maxSpeed) + ' SPEED'), 'and its speed');
    assert.ok(label.includes(spec.dashCooldown + 's DASH'), 'and how long its dash makes you wait');
  }
  const brood = rows[SHIPS.findIndex((row) => row.id === 'brood')].label;
  assert.ok(brood.includes('BEGINS WITH ORBITALS'),
    'and the one ship that arrives with a rank spent says so: ' + brood);
});

test('a number in the hangar picks a ship, lights its row, and keeps the panel up', () => {
  press('Digit3');
  assert.equal(game.stats().ship, 'volt', 'the third key is the third ship');
  assert.equal(game.stats().weapon, 'arc', 'and it brings its gun with it');
  const picked = game.screen.ships.map((row) => row.picked);
  assert.deepEqual(picked, [false, false, true, false, false], 'exactly one row is lit');
  assert.equal(hangarOpen(), true, 'looking at ships is not leaving the hangar');

  // A key past the list is refused, in the hangar as everywhere else.
  press('Digit' + (SHIPS.length + 1));
  assert.equal(game.stats().ship, 'volt', 'the pick stands');
});

test('a pick is answered on the title too, with the panel shut', () => {
  press('KeyH');                       // back out
  assert.equal(hangarOpen(), false);
  press('Digit5');
  assert.equal(game.stats().ship, 'brood');
  assert.ok(game.screen.titleShip.includes('BROOD'), 'the line moved: ' + game.screen.titleShip);
  assert.ok(game.screen.titleShip.includes('SWARM'), 'and so did the gun');
});

test('SPACE launches from the hangar, in the ship a number picked, and the panel goes away', () => {
  press('KeyH');
  press('Digit2');
  press('Space');
  assert.equal(game.stats().state, game.STATE.PLAY, 'one key, one run');
  assert.equal(hangarOpen(), false, 'and no panel left over the arena');
  assert.equal(game.screen.startHidden, true, 'with the title');
  assert.equal(world.player.hull, BALANCE.ships.bulwark.hull, 'the hull of the ship that was picked');
  assert.equal(game.stats().weapon, 'scatter', 'and its gun');
});

test('H over a run is refused', () => {
  press('KeyH');
  assert.equal(hangarOpen(), false, 'a run is not a screen you can put a panel over');
  assert.equal(game.stats().state, game.STATE.PLAY, 'and the key did not pause it either');
});

test('the wreck says what the run paid, and what the next one will be flown in', () => {
  killTheRun(2000);

  // 2,000 of score is 20 dust at PLAN's rate, on top of the 500 the visit came in with.
  assert.equal(game.stats().dustEarned, 20);
  assert.equal(game.stats().dust, STARTED_WITH + 20);
  assert.equal(game.screen.finalDust, 'STARDUST  +20   \u00b7   520 BANKED',
    'the card says both halves');
  assert.equal(game.screen.hangarDust, '520', 'and so does the hangar, shut or not');
  assert.equal(game.screen.titleDust, '520', 'and so does the title');
  assert.ok(game.screen.nextShip.includes('BULWARK'), 'and names the next ship: ' + game.screen.nextShip);
  const stored = JSON.parse(game.storage['starfall.save']);
  assert.equal(stored.meta.dust, 520, 'and it is in the save, not only on the glass');
});

test('a number over the wreck picks the next run, and says so on the card', () => {
  press('Digit4');
  assert.equal(game.stats().ship, 'needle');
  assert.ok(game.screen.nextShip.includes('NEEDLE'), 'the line moved: ' + game.screen.nextShip);
  assert.ok(game.screen.nextShip.includes('LANCE'), 'with the gun that comes with it');
  assert.equal(hangarOpen(), false, 'and a number does not open the hangar on the way');
  assert.equal(game.stats().state, game.STATE.OVER, 'nor does it launch anything');
});

test('H opens the hangar over a wreck, and a click there is not a launch', () => {
  press('KeyH');
  assert.equal(hangarOpen(), true, 'the panel went up');
  assert.equal(game.screen.overHidden, false, 'over the card, which stays where it was');
  game.pressMouse(640, 400);
  game.step(FRAME);
  game.releaseMouse();
  assert.equal(game.stats().state, game.STATE.OVER,
    'and aiming at a ship and missing did not start a run');
});

test('SPACE from the hangar over a wreck starts the ship that is picked', () => {
  press('Digit1');
  press('Space');
  assert.equal(game.stats().state, game.STATE.PLAY, 'one key, one new run');
  assert.equal(hangarOpen(), false, 'and the panel came down with it');
  assert.equal(game.stats().ship, 'wisp');
  assert.equal(world.player.hull, BALANCE.ships.wisp.hull, 'the plain body, on the plain ship');
});

test('the win pays too, and its card says so', () => {
  killTheRun(0);                          // the run above is in the way of the one below
  parkAtTheLastFight();
  damageEnemy(world, world.boss.enemy, world.boss.enemy.maxhp * 10, true);
  assert.ok(until(() => game.stats().state === game.STATE.WON, 6), 'the schedule ran out');

  // The win is worth its own dust on top of the score it was made of (game/stardust.js). The
  // fight coming down pays the moment it happens, not when the card is put up.
  const won = game.stats();
  assert.equal(won.dustEarned, Math.floor(won.score / BALANCE.stardust.perScore)
    + BALANCE.stardust.perBoss + BALANCE.stardust.won,
    'one fight down, the schedule walked out, and whatever the crowd paid on the way');
  wait(BALANCE.victory.hush * 1.2);
  assert.equal(game.screen.winHidden, false, 'the card arrived');
  assert.ok(game.screen.winDust.startsWith('STARDUST  +'), game.screen.winDust);
  assert.ok(game.screen.winDust.includes('BANKED'), 'and it names the purse as well');
  assert.equal(JSON.parse(game.storage['starfall.save']).meta.dust, won.dust,
    'and the purse in the save is the purse on the card');
});

test('H over a won run is refused, because its keys are about the run it won', () => {
  wait(GUARD);
  assert.equal(game.stats().state, game.STATE.WON, 'the card is up and answerable now');
  press('KeyH');
  assert.equal(hangarOpen(), false, 'and there is no panel over it');
  assert.equal(game.stats().state, game.STATE.WON, 'and the key did not answer the card either');
});

test('a number over the win still means this ship, and a new run, in one press', () => {
  press('Digit3');
  assert.equal(game.stats().state, game.STATE.PLAY, 'the run the card was holding was traded');
  assert.equal(game.stats().ship, 'volt', 'for the ship the number named');
  assert.equal(hangarOpen(), false);
});
