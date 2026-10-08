// Overcharge (PLAN 3.5): "standing still for 1 s doubles the next shot", and the one card in the
// deck whose price is paid in place rather than in levels.
//
// Six things are measured here, in the order `game/overcharge.js` argues for itself:
//
//   the price - the first rank is PLAN's doubling and every rank after it is another copy of the
//     pull, and rank 0 is not a charge that does nothing but no charge at all;
//   the wait - a charge is worth a second of standing still and not one step less, and a charge
//     cannot be banked: three seconds of standing is one loaded gun;
//   what standing means - two questions, "is it asking to move" and "is it moving", so a ship
//     shoved flat against a wall by its own engines is not standing and a ship being kicked
//     backwards by its own gun is;
//   the bleed - a charge interrupted is cooled and not wiped, so what the card asks for is that
//     the ship settles rather than that it never twitches;
//   the spending - a pull spends the charge and all of it is heavy: every pellet of a fan, every
//     leap of a chain, and a pull that threw nothing has not fired and so has spent nothing;
//   and the limits - one charge at a time, one shout when it comes up, and a new run does not
//     inherit the last one's loaded gun.
//
// Everything runs in the scripted world on the game's own fixed step, with the wave director off
// and the XP ceiling pushed out of reach, so a level-up can never pause a measured window. Where
// a hull has to come off a body the body is planted with a million hull and the hull loss is read
// back off it, because "double" is a claim about damage and not about a flag on a bullet.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { BALANCE } from '../src/game/balance.js';
import { setWeapon, weaponOf } from '../src/game/weapons.js';
import { clearCues, drainCues } from '../src/game/cues.js';
import { effectOf, pullBoostOf } from '../src/game/upgrades.js';
import {
  chargeOf, hasOvercharge, isLoaded, isStandingStill,
} from '../src/game/overcharge.js';
import { scriptedRun, enemyAt, stepTheWorld } from '../tools/headless/scripted.js';
import { bootGame } from '../tools/headless/harness.js';
import { playOneRun } from '../tools/headless/bot.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OC = BALANCE.upgrades.overcharge;
const STEP = BALANCE.sim.step;
const BIG = 1e6;

/** Ranks of the line, on a fresh world. */
function armed(seed, ranks) {
  const field = scriptedRun(seed);
  field.upgrades.overcharge = ranks;
  // No level-up may interrupt a measured window, and no wave may arrive in it.
  field.xpNeed = Infinity;
  return field;
}

/** Step `seconds` of the game's own clock with `input` held. */
function holdFor(field, seconds, input) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) stepTheWorld(Object.assign({ firing: false }, input));
}

/** Hold the ship still, unloaded, for just under a whole charge. */
function nearlyLoaded(field, seconds) {
  holdFor(field, seconds === undefined ? OC.hold - STEP : seconds);
}

/**
 * One pull of the trigger, and the shots it threw.
 *
 * The magazine is emptied first and the trigger forced, so whatever comes back is exactly one
 * pull of whichever gun is being flown - and the sky is empty unless the test planted a body, so
 * nothing dies on the step and every shot thrown is still there to be read.
 */
function onePull(field, input) {
  field.bullets.clear();
  field.player.fireTimer = 0;
  stepTheWorld(Object.assign({ firing: true }, input));
  return field.bullets.items.slice();
}

/** What a plain pull of the gun being flown costs a body, with no lines in the way. */
function plainWeight(field) {
  return weaponOf(field).damage * (1 + BALANCE.upgrades.damage.step * field.upgrades.damage);
}

function cuesOf(action) {
  clearCues();
  action();
  const cues = [];
  drainCues((cue) => cues.push(cue));
  return cues;
}

test('the first rank doubles the pull and every rank after it adds another copy of it', () => {
  const field = armed(1, 0);
  assert.equal(pullBoostOf(field), 1, 'rank 0 is no charge at all, not a charge worth nothing');
  for (let rank = 1; rank <= OC.ranks; rank++) {
    field.upgrades.overcharge = rank;
    assert.equal(pullBoostOf(field), 1 + OC.step * rank);
  }
  assert.equal(pullBoostOf(armed(1, 1)), 2, 'PLAN\'s "doubles the next shot", at the first rank');
});

test('the card says what one rank is worth', () => {
  assert.equal(effectOf('overcharge'), '+' + Math.round(OC.step * 100) + '% charged shot');
});

test('a charge is worth a second of standing still, and not one step less', () => {
  const field = armed(2, 1);
  nearlyLoaded(field);
  assert.ok(chargeOf(field) < 1, 'just short of the second and the gun is not loaded');
  assert.equal(isLoaded(field), false);

  holdFor(field, STEP);
  assert.ok(isLoaded(field), 'and on the step the second finishes, it is');
  assert.ok(chargeOf(field) > 0.9999, 'and the meter is as good as full');
});

test('a run that has not taken the line never loads a gun', () => {
  const field = armed(3, 0);
  assert.equal(hasOvercharge(field), false);
  const rings = field.rings.count;
  holdFor(field, OC.hold * 3);
  assert.equal(chargeOf(field), 0, 'nothing was counted');
  assert.equal(field.rings.count, rings, 'and nothing was announced');
  assert.equal(onePull(field)[0].charged, false, 'and a pull is a plain pull');
});

test('standing is three seconds and the meter still says one charge', () => {
  const field = armed(4, 1);
  holdFor(field, OC.hold * 3);
  assert.ok(isLoaded(field), 'the charge fills to a full and stops there');
  assert.ok(chargeOf(field) <= 1, 'and never past it: three seconds is one loaded gun');

  field.player.fireTimer = 0;
  holdFor(field, STEP, { firing: true });
  assert.equal(chargeOf(field), 0, 'and it is all spent by the one pull that took it');
});

test('holding a direction is not standing still, even against a wall', () => {
  const field = armed(5, 1);
  // Park the ship against the left wall and lean into it. It goes nowhere - the wall keeps it -
  // but it is not standing still: the engines are working, the nose is pointed into the rock, and
  // a ship that was holding a direction a moment ago is a ship that is trying to go somewhere.
  const wall = field.player.drawR;
  field.player.x = wall;
  holdFor(field, OC.hold * 2, { moveX: -1, moveY: 0 });
  assert.equal(field.player.x, wall, 'the wall really did hold it');
  assert.equal(chargeOf(field), 0, 'and it was not standing still');
});

test('a ship being kicked backwards by its own gun is standing still', () => {
  // The scatter has the hardest kick in the game (55 px/s, BALANCE.weapons), which is what
  // `still` is set above: a player who has stopped moving and is holding the trigger down
  // believes they are standing still, and the card has to agree with the player.
  const field = armed(6, 1);
  setWeapon(field, 'scatter');
  let kicked = 0;
  for (let i = 0; i < Math.round(OC.hold / STEP); i++) {
    stepTheWorld({ firing: true });
    kicked = Math.max(kicked, Math.abs(field.player.vx) + Math.abs(field.player.vy));
  }
  assert.ok(isLoaded(field), 'the second went up between two pulls');
  assert.ok(kicked > 0, 'even though the gun was shoving it the whole time');
});

test('a dash is the loudest way not to stand still', () => {
  const field = armed(7, 1);
  nearlyLoaded(field);
  const loaded = chargeOf(field);
  stepTheWorld({ dash: true });
  assert.ok(field.player.dashLeft > 0, 'the dash started');
  holdFor(field, STEP * 4);
  assert.ok(chargeOf(field) < loaded, 'and the charge went down while it was on rails');
});

test('a charge interrupted is cooled, not wiped', () => {
  const field = armed(8, 1);
  nearlyLoaded(field);
  const before = chargeOf(field);

  // A twitch off a threat: a tenth of a second of running.
  holdFor(field, 0.1, { moveX: 1, moveY: 0 });
  const twitched = chargeOf(field);
  assert.ok(twitched > before * 0.5, 'a twitch costs a little of it: ' + twitched);

  // And coming back and settling for half a second puts it up again.
  holdFor(field, 0.5);
  assert.ok(isLoaded(field), 'and the ship settled in time to load anyway');
});

test('a whole charge is gone in the time the balance says it is', () => {
  const field = armed(9, 1);
  nearlyLoaded(field);
  holdFor(field, OC.hold / OC.bleed + STEP, { moveX: 0, moveY: 1 });
  assert.equal(chargeOf(field), 0);
});

test('a ship moving faster than the still number is not standing, and slower than it is', () => {
  const field = armed(10, 1);
  const ship = field.player;
  ship.vy = OC.still + 20;
  assert.equal(isStandingStill(field, { moveX: 0, moveY: 0 }), false, 'above the kick of a gun');
  ship.vy = OC.still;
  assert.equal(isStandingStill(field, { moveX: 0, moveY: 0 }), true, 'and at it');
  ship.vy = 0;
  ship.vx = 1;
  assert.equal(isStandingStill(field, { moveX: 0, moveY: 1 }), false, 'asking to move settles it');
});

test('a loaded pull costs a body twice what a plain one does', () => {
  const field = armed(11, 1);
  // The scripted world aims the ship straight up (tools/headless/scripted.js), so the body that
  // is going to be shot at stands above it.
  const body = enemyAt('drifter', field.player.x, field.player.y - 90, BIG);

  const plain = body.hp;
  onePull(field);
  const weight = plainWeight(field);
  assert.equal(field.bullets.count, 1, 'the pulse throws one shot');
  assert.ok(Math.abs(field.bullets.items[0].dmg - weight) < 1e-9, 'and it is worth what the gun is');

  field.player.fireTimer = STEP * 3;   // let the shot go and the ship stay put
  holdFor(field, STEP * 3);
  nearlyLoaded(field);
  const before = body.hp;
  onePull(field);
  const shot = field.bullets.items[0];
  assert.equal(shot.charged, true, 'the shot says it was loaded when it left');
  assert.ok(Math.abs(shot.dmg - weight * 2) < 1e-9, 'and it weighs twice what one weighs');
  holdFor(field, 0.3, { firing: false });
  assert.equal(before - body.hp, weight * 2, 'and that is what the body paid');
});

test('a loaded fan is a heavier fan, every pellet of it', () => {
  const field = armed(12, 1);
  field.upgrades.split = 2;
  setWeapon(field, 'scatter');
  nearlyLoaded(field);

  const shots = onePull(field);
  const heavy = BALANCE.weapons.scatter.pellets;
  assert.equal(shots.length, heavy + 2, 'six of its own and two the split line added');
  assert.equal(shots.filter((s) => s.charged).length, shots.length, 'the pull spent the charge');

  const weight = plainWeight(field) * 2;
  const share = BALANCE.upgrades.split.share;
  for (let i = 0; i < shots.length; i++) {
    const want = i < heavy ? weight : weight * share;
    assert.ok(Math.abs(shots[i].dmg - want) < 1e-9,
      'pellet ' + i + ' is worth ' + shots[i].dmg + ', wanted ' + want);
  }
});

test('a chain from a loaded gun lands twice the weight, and looks like it', () => {
  const field = armed(13, 1);
  setWeapon(field, 'arc');
  const body = enemyAt('drifter', field.player.x, field.player.y - 120, BIG);

  holdFor(field, STEP, { firing: true });
  const plain = BIG - body.hp;
  assert.ok(plain > 0, 'a plain chain landed');

  body.hp = BIG;
  field.arc.bolts.clear();
  field.player.fireTimer = STEP * 3;
  holdFor(field, STEP * 3);
  nearlyLoaded(field);
  field.player.fireTimer = 0;
  holdFor(field, STEP, { firing: true });

  assert.ok(Math.abs((BIG - body.hp) - plain * 2) < 1e-9,
    'the same chain, twice the hull: ' + (BIG - body.hp) + ' against ' + plain);
  assert.ok(field.arc.bolts.items.every((bolt) => bolt.charged), 'and every bolt of it is lit bigger');
});

test('a pull that threw nothing has not fired, and keeps its charge', () => {
  const field = armed(14, 1);
  setWeapon(field, 'arc');
  holdFor(field, OC.hold);
  assert.ok(isLoaded(field), 'loaded, and pointing at nothing');

  holdFor(field, STEP * 4, { firing: true });
  assert.ok(isLoaded(field), 'the sky took nothing, so the gun spent nothing');

  // And the moment there is a body out there, the same loaded gun spends itself on it.
  enemyAt('drifter', field.player.x, field.player.y - 120, BIG);
  field.player.fireTimer = 0;
  holdFor(field, STEP, { firing: true });
  assert.equal(chargeOf(field), 0, 'and then it went');
});

test('one charge, and the shout for it is one shout', () => {
  const field = armed(15, 1);
  const cues = cuesOf(() => holdFor(field, OC.hold + STEP * 5));
  assert.equal(cues.length, 1, 'the note for the second being up is one note: ' + cues.length);
  assert.equal(cues[0].kind, 'beep');

  // Standing on past it says nothing more until the charge has been spent and earned again.
  const quiet = cuesOf(() => holdFor(field, OC.hold));
  assert.equal(quiet.length, 0, 'a loaded gun standing about is silent');
  assert.ok(isLoaded(field));
});

test('spending a charge is heard, and a plain pull is not', () => {
  const field = armed(16, 1);
  const plain = cuesOf(() => { onePull(field); });
  assert.equal(plain.length, 1, 'one sound for a plain pull: the gun\'s own');

  holdFor(field, OC.hold);        // up comes the charge, and the shout for it, uncounted
  const loaded = cuesOf(() => { onePull(field); });
  assert.ok(loaded.length > plain.length, 'and the loaded one says something extra');
});

test('a new run does not inherit the last one\'s loaded gun', async () => {
  const field = armed(17, 1);
  holdFor(field, OC.hold);
  assert.ok(isLoaded(field));
  scriptedRun(18);
  assert.equal(chargeOf(field), 0, 'resetRun took the charge with the ranks');
});

test('a real run that stands still gets its heavy pulls', async () => {
  const game = await bootGame({ root: ROOT, seed: 77 });
  let loadedFrames = 0;
  let heavyShots = 0;
  const summary = playOneRun(game, {
    maxSeconds: 180,
    policy: 'naive',
    onFrame: (g) => {
      // Handed the line rather than hoped for: this test is about whether the wiring works in a
      // run that is really being flown, not about whether the bot would buy the card.
      g.world.upgrades.overcharge = 3;
      if (g.stats().charge >= 1) loadedFrames++;
      for (const shot of g.world.bullets.items) {
        if (shot.charged) { heavyShots++; break; }
      }
    },
  });
  game.stop();

  assert.ok(summary.seconds > 20, 'the bot flew: ' + summary.seconds + 's');
  assert.ok(loadedFrames > 0, 'the naive bot stands still, so the gun came up between pulls');
  assert.ok(heavyShots > 0, 'and a heavy pull was really in the air (' + heavyShots + ' frames)');
});
