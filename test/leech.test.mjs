// Leech (PLAN 3.5): "every 60 kills heals 1 hull (fewer kills per rank)", and the first thing
// in the game that gives a hull back.
//
// Five things are measured here, in the order `game/leech.js` argues for itself:
//
//   the price - the first rank is PLAN's sixty bodies and every rank after it is six fewer, and
//     rank 0 is not an expensive leech but no leech at all;
//   the door - a body the run brought down counts once, however it came down, and a body that
//     came apart in a blast nobody lit does not count;
//   the payment - counting and paying are separate jobs, and the step does the paying: a hull is
//     handed back at one point in a step, at exactly the price and not one body sooner;
//   the hold - a charge that comes due while the ship is whole is kept and spent on the next
//     hull the arena takes, one at a time and not three;
//   and the limits - a hull is one hull, a dead ship is not owed a refund, and a new run does
//     not inherit what the last one earned.
//
// Everything runs in the scripted world on the game's own fixed step, with the wave director
// off and the shards swept away every step, so a level-up can never pause a measured window.
// Hull is taken off the ship with the game's own `hitPlayer`, because a refund that only reads
// well when the hole was made by hand is not a refund.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { damageEnemy } from '../src/game/enemies.js';
import { hitPlayer } from '../src/game/player.js';
import { hurtByBody } from '../src/game/tally.js';
import { effectOf, leechCostOf } from '../src/game/upgrades.js';
import { feedLeech, hasLeech, updateLeech } from '../src/game/leech.js';
import { scriptedRun, enemyAt, stepTheWorld } from '../tools/headless/scripted.js';
import { bootGame } from '../tools/headless/harness.js';
import { playOneRun } from '../tools/headless/bot.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const LEECH = BALANCE.upgrades.leech;
const STEP = BALANCE.sim.step;
const HULL = BALANCE.ships.wisp.hull;
const BIG = 1e6;

/** Everything that would otherwise turn a measured window into a level-up pause. */
function sweep(field) {
  field.shards.clear();
  field.xp = 0;
  field.offer.length = 0;
  field.pendingLevels = 0;
}

/** Step `seconds` of the game's own clock, with every system of the run running. */
function runFor(field, seconds) {
  for (let i = 0, steps = Math.round(seconds / STEP); i < steps; i++) {
    sweep(field);
    stepTheWorld();
  }
}

/** A run on `ranks` of leech and nothing in it. */
function leechRun(seed, ranks) {
  const field = scriptedRun(seed);
  field.upgrades.leech = ranks;
  return field;
}

/** One body standing at a place, that will come down to the next thing that touches it. */
function body(field, hp) {
  return enemyAt('drifter', 120, 120, hp === undefined ? 1 : hp);
}

/** One body brought down and credited to the run, the way a shot does it. */
function bringDown(field, type) {
  const enemy = enemyAt(type || 'drifter', 120, 120, 1);
  damageEnemy(field, enemy, BIG, true);
  return enemy;
}

/** Bring down `n` bodies, and hand the step over so the leech is paid like the game pays it. */
function bringDownMany(field, n) {
  for (let i = 0; i < n; i++) bringDown(field);
  updateLeech(field);
}

/** Take `times` hull off the ship the way the arena takes them, and clear the bodies after. */
function wound(field, times) {
  const ship = field.player;
  for (let i = 0; i < times; i++) {
    const other = body(field, BIG);
    ship.invuln = 0;
    hitPlayer(field, hurtByBody(other));
    const at = field.enemies.indexOf(other);
    if (at >= 0) field.enemies.splice(at, 1);
  }
}

test('the first rank is PLAN sixty, and every rank after it is six fewer', () => {
  const field = scriptedRun(1);
  assert.equal(LEECH.base - LEECH.step, 60, 'PLAN 3.5: "every 60 kills heals 1 hull"');
  assert.equal(LEECH.ranks, 5);

  const costs = [];
  for (let rank = 0; rank <= LEECH.ranks; rank++) {
    field.upgrades.leech = rank;
    costs.push(leechCostOf(field));
  }
  assert.deepEqual(costs, [0, 60, 54, 48, 42, 36], 'and rank 0 is no bargain at all');
  assert.ok(costs[LEECH.ranks] > 12,
    'and the last rank is not a fountain: one hull every ' + costs[LEECH.ranks] + ' bodies');
  assert.equal(effectOf('leech'), '+6 fewer kills per hull', 'and the card says which it is selling');
});

test('rank 0 is nothing at all: no price, no hull, no holding', () => {
  const field = leechRun(2, 0);
  wound(field, 1);
  const hull = field.player.hull;

  for (let i = 0; i < LEECH.base * 4; i++) feedLeech(field);
  updateLeech(field);

  assert.equal(field.player.hull, hull, 'four hundred bodies and not one of them counted');
  assert.equal(field.leech.kills, 0, 'and the leech never even started counting');
  assert.equal(field.leech.held, 0);
  assert.equal(hasLeech(field), false, 'and the HUD has no business mentioning it');
});

test('a hull is paid for at exactly the price, and not one body sooner', () => {
  const field = leechRun(3, 1);
  wound(field, 1);
  const hurt = field.player.hull;
  const cost = leechCostOf(field);

  for (let i = 0; i < cost - 1; i++) feedLeech(field);
  updateLeech(field);
  assert.equal(field.player.hull, hurt, 'fifty-nine bodies is fifty-nine bodies');
  assert.equal(field.leech.kills, cost - 1);

  feedLeech(field);
  updateLeech(field);
  assert.equal(field.player.hull, hurt + 1, 'and the sixtieth is the one that pays');
  assert.equal(field.leech.kills, 0, 'and the count starts again from here');
});

test('a hull costs what it says it costs, to the body', () => {
  // Real bodies, brought down by the door the game brings them down by, counted against the
  // price rather than against the helper: this is the test that says "sixty kills".
  const field = leechRun(4, 1);
  wound(field, 1);
  const hurt = field.player.hull;
  const cost = leechCostOf(field);

  for (let i = 0; i < cost - 1; i++) bringDown(field);
  updateLeech(field);
  assert.equal(field.player.hull, hurt, 'one short of the price is one short');
  assert.equal(field.kills, cost - 1, 'and the run agrees that many came down');

  bringDown(field);
  updateLeech(field);
  assert.equal(field.player.hull, hurt + 1);
});

test('a tank is one body, and its hatchlings are two more', () => {
  // What a "kill" is, asked at the one place it could be gotten wrong: a splitting body adds to
  // the crowd as it dies, and only the thing that came down is counted.
  const field = leechRun(5, 1);
  wound(field, 1);
  const hurt = field.player.hull;
  const cost = leechCostOf(field);

  for (let i = 0; i < cost - 1; i++) bringDown(field);
  const hatchlings = field.enemies.length;
  bringDown(field, 'tank');
  updateLeech(field);

  assert.equal(field.player.hull, hurt + 1, 'the tank itself was the sixtieth body');
  assert.ok(field.enemies.length > hatchlings, 'and its hatchlings are still waiting to be counted');
});

test('a body the run did not bring down feeds nothing', () => {
  const field = leechRun(6, 1);
  wound(field, 1);
  const hurt = field.player.hull;

  for (let i = 0; i < LEECH.base * 2; i++) damageEnemy(field, body(field), BIG, false);
  updateLeech(field);

  assert.equal(field.player.hull, hurt, 'something else came down on them and it was not the run doing it');
  assert.equal(field.leech.kills, 0);
  assert.equal(field.kills, 0, 'and the score did not count them either');
});

test('a deeper rank is paid for sooner, out of the same bodies', () => {
  const field = leechRun(7, LEECH.ranks);
  wound(field, 1);
  const hurt = field.player.hull;

  bringDownMany(field, leechCostOf(field));
  assert.equal(field.player.hull, hurt + 1, 'thirty-six bodies at the fifth rank');
  assert.equal(field.leech.kills, 0);
});

test('a rank taken in the middle of a pile is worth itself at once', () => {
  const field = leechRun(8, 1);
  wound(field, 1);
  const hurt = field.player.hull;

  bringDownMany(field, 55);
  assert.equal(field.player.hull, hurt, 'fifty-five is not sixty');

  field.upgrades.leech = 2;
  updateLeech(field);
  assert.equal(field.player.hull, hurt + 1, 'and the fifty-four bodies of the new rank are already paid for');
  assert.equal(field.leech.kills, 1, 'one body over, and one body towards the next hull');
});

test('a charge that comes due at full hull is kept, and the next wound is refunded', () => {
  const field = leechRun(9, 1);
  const ship = field.player;
  const whole = ship.hull;

  bringDownMany(field, leechCostOf(field));
  assert.equal(ship.hull, whole, 'the ship was whole, so there was nothing to fill');
  assert.equal(field.leech.held, 1, 'and the leech is holding it');
  assert.equal(field.leech.kills, 0, 'paid for, and starting again');

  ship.invuln = 0;
  hitPlayer(field, hurtByBody(body(field, BIG)));
  assert.equal(ship.hull, whole - 1, 'the arena takes a hull...');
  updateLeech(field);
  assert.equal(ship.hull, whole, '...and on the step it was taken, it comes back');
  assert.equal(field.leech.held, 0, 'and the charge is spent, not refunded to itself');
});

test('the world spends a held charge in the step the hull was lost', () => {
  // The wiring, not the arithmetic: game/world.js runs the leech after everything that can hurt
  // the ship, so a body that walks into the ship and a charge that was waiting meet in one step.
  const field = leechRun(10, 1);
  const ship = field.player;
  bringDownMany(field, leechCostOf(field));
  assert.equal(field.leech.held, 1, 'whole, so it is being held');

  ship.invuln = 0;
  enemyAt('drifter', ship.x, ship.y, BIG);
  stepTheWorld();

  assert.equal(field.tally.hullLost, 1, 'the contact landed');
  assert.equal(ship.hull, BALANCE.ships.wisp.maxHull, 'and the hull came straight back');
  assert.equal(field.leech.held, 0, 'and the charge went with it');
});

test('one charge at a time: a held leech does not stack', () => {
  const field = leechRun(11, 1);
  const ship = field.player;
  const whole = ship.hull;

  bringDownMany(field, leechCostOf(field) * 3);
  assert.equal(field.leech.held, 1, 'three prices paid, one charge held');
  assert.equal(field.leech.kills, 0, 'and the bodies past the first price were thrown away');

  wound(field, 1);
  updateLeech(field);
  assert.equal(ship.hull, whole, 'the first wound is refunded');

  wound(field, 1);
  updateLeech(field);
  assert.equal(ship.hull, whole - 1, 'and the second one is not: nobody bought it');
});

test('a hull is one hull, and the cap is the cap', () => {
  const field = leechRun(12, 1);
  const ship = field.player;
  wound(field, 2);
  assert.equal(ship.hull, HULL - 2);

  bringDownMany(field, leechCostOf(field));
  assert.equal(ship.hull, HULL - 1, 'one hull, exactly, and the cap did not move');
  assert.equal(ship.maxHull, BALANCE.ships.wisp.maxHull);

  bringDownMany(field, leechCostOf(field) * 4);
  assert.equal(ship.hull, BALANCE.ships.wisp.maxHull, 'full, and no further');
  assert.equal(field.leech.held, 1, 'and the last price paid is being held');
});

test('a crowd that comes down in one step is paid for as it comes down', () => {
  // A nova front through a knot can bring down twenty bodies between two steps, and twenty
  // bodies is money: the price is subtracted, not the count thrown away.
  const field = leechRun(18, 1);
  wound(field, 2);
  assert.equal(field.player.hull, HULL - 2);

  bringDownMany(field, leechCostOf(field) * 2);
  assert.equal(field.player.hull, HULL, 'two prices, two hull, in the one step');
  assert.equal(field.leech.kills, 0, 'and nothing invented and nothing wasted');
  assert.equal(field.leech.held, 0, 'and the ship is whole, so there is nothing left to hold');
});

test('a run that has ended is not owed a refund', () => {
  const field = leechRun(13, 1);
  const ship = field.player;
  bringDownMany(field, leechCostOf(field));
  assert.equal(field.leech.held, 1);

  ship.hull = 1;
  ship.invuln = 0;
  hitPlayer(field, hurtByBody(body(field, BIG)));
  assert.equal(field.state, STATE.OVER, 'and that was the last of it');
  assert.equal(ship.hull, 0, 'a held charge does not buy a second chance');

  runFor(field, 1);
  assert.equal(ship.hull, 0, 'and nothing hands it back afterwards');
  assert.equal(field.leech.held, 1, 'still holding it, and holding it forever');
});

test('a hull coming back is the same news whoever paid for it', () => {
  // The elite's gift and the leech's charge both go through game/player.js `healPlayer`, so the
  // light, the word and the chord are one thing and not two. What this pins is that the leech
  // really went through that door: a heal paints a ring and floats a word over the ship.
  const field = leechRun(14, 1);
  wound(field, 1);
  const rings = field.rings.count;
  const labels = field.texts.count;

  bringDownMany(field, leechCostOf(field));
  assert.ok(field.rings.count > rings, 'a ring went out from the ship');
  assert.ok(field.texts.count > labels, 'and a word went up from it');
});

test('a new run forgets what the last one earned', () => {
  const field = leechRun(15, 2);
  wound(field, 1);
  bringDownMany(field, 40);
  assert.ok(field.leech.kills > 0 || field.leech.held > 0, 'the last run got something going');

  scriptedRun(16);
  assert.equal(field.leech.kills, 0, 'the bodies went with the last run');
  assert.equal(field.leech.held, 0, 'and so did the charge');
  assert.equal(field.player.hull, BALANCE.ships.wisp.hull, 'and the ship starts whole, as it always did');
});

test('the leech does not disturb the crowd it is healing among', () => {
  const field = leechRun(17, 1);
  const crowd = [];
  for (let i = 0; i < 8; i++) crowd.push(enemyAt('drifter', 300 + i * 40, 400, BIG));
  wound(field, 1);

  runFor(field, 2);
  assert.equal(field.enemies.length, crowd.length, 'nothing came apart on its own');
  assert.equal(field.player.hull, HULL - 1, 'and no free hull arrived with the walking');

  bringDownMany(field, leechCostOf(field));
  assert.equal(field.player.hull, HULL, 'the hull came back');
  assert.equal(field.enemies.length, crowd.length, 'and the crowd is exactly the crowd it was');
});

test('a real run gets healed by it, and the meter says so', async () => {
  // The naive bot loses hull - median two in two minutes (NOTES session 39) - which makes it the
  // one instrument in the game that can see this card at all: the aware bot is not clipped in a
  // fifteen-minute run. The ranks are forced up from outside, which is the direction forcing
  // works in (session 39); nothing is asked of the bot's own choices.
  const game = await bootGame({ root: ROOT, seed: 3 });
  let healed = 0;
  let wasHeld = false;
  let last = game.world.player.hull;

  const summary = playOneRun(game, {
    maxSeconds: 240,
    policy: 'naive',
    onFrame: (g) => {
      g.world.upgrades.leech = LEECH.ranks;
      const hull = g.world.player.hull;
      const held = g.world.leech.held > 0;
      // A hull that came up with an empty counter came up from the leech (an elite's gift would
      // leave the counter where it was), and a charge that went 1 -> 0 was spent on a wound.
      if ((hull > last && g.world.leech.kills === 0) || (wasHeld && !held)) healed++;
      last = hull;
      wasHeld = held;
    },
  });
  game.stop();

  assert.ok(summary.seconds > 20, 'the bot flew: ' + summary.seconds + 's');
  assert.ok(healed > 0, 'and the leech handed hull back in a real run (' + healed + ' times)');
});
