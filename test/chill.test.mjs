// Chill (PLAN 3.5): a hit takes a share of a body's walk away, what stops moving is worth
// something, and the fifth rank is what a cold body coming apart throws at the crowd.
//
// Five things are measured here, in the order the system argues for itself in
// `game/chill.js`:
//
//   the frost is the slow - a hit buys `step x rank` of the body's own walk, and the walk is
//     measured here in pixels rather than in a field, because a field can say anything;
//   a shove is not a walk - a frozen body cannot walk but is still moved by whatever hits it,
//     which is what keeps a knot of frozen bodies pushable instead of a wall;
//   it melts - the frost is something the run keeps up with fire, and a body it turns away
//     from warms back through in `melt` seconds;
//   the shatter is what a cold body is worth, and it is worth the cold it had - the killing
//     hit counts, and what it throws is scaled by the frost and shared out at a share, so a
//     chain runs down a crowd and dies out;
//   and it is only ever the ship's own hits that make cold, at the same four doors a fire is
//     lit.
//
// Bodies that are meant to survive a measurement are given a hull big enough to; the ones
// that are meant to come apart are given a hull of 1 (NOTES session 30's fractional-damage
// trap: a corpse cannot be measured). Everything runs on the game's own fixed step in the
// scripted world, with the ship invulnerable unless a test says otherwise and the wave
// director switched off.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { PALETTE } from '../src/core/palette.js';
import { DEBRIS } from '../src/game/effects.js';
import { logic } from '../src/core/rng.js';
import { damageEnemy } from '../src/game/enemies.js';
import { fire, setWeapon } from '../src/game/weapons.js';
import { chill, isChilled, isFrozen, melt, shatterOnDeath } from '../src/game/chill.js';
import { chillOf, gainOf } from '../src/game/upgrades.js';
import { makeEnemy } from '../src/game/kinds.js';
import { scriptedRun, enemyAt, stepTheWorld } from '../tools/headless/scripted.js';

const CHILL = BALANCE.upgrades.chill;
const GUN = BALANCE.bullets;
const STEP = BALANCE.sim.step;
const BIG = 1e6;

/** Everything that would otherwise turn a measured window into a level-up pause. */
function sweep(field) {
  field.shards.clear();
  field.xp = 0;
  field.offer.length = 0;
  field.pendingLevels = 0;
}

/** Step `seconds` of the game's own clock, holding `input` the whole way. */
function runFor(field, seconds, input) {
  for (let i = 0, steps = Math.round(seconds / STEP); i < steps; i++) {
    sweep(field);
    stepTheWorld(input);
  }
}

/** A run on `ranks` of chill, and nothing in it. */
function chilled(seed, ranks) {
  const field = scriptedRun(seed);
  field.upgrades.chill = ranks;
  return field;
}

/** One body of `type`, standing still, that will not run out of hull. */
function standingStill(field, type, x, y, hp) {
  const body = enemyAt(type, x, y, hp === undefined ? BIG : hp);
  body.speed = 0;
  return body;
}

/** North of the ship - where the gun is pointed - `distance` px out. */
function ahead(field, type, distance, hp) {
  const ship = field.player;
  return standingStill(field, type, ship.x, ship.y - distance, hp);
}

/** A drifter that actually walks, at the ship, `distance` px north of it. */
function walking(field, distance) {
  const body = ahead(field, 'drifter', distance);
  body.speed = BALANCE.kinds.drifter.speed;
  return body;
}

/** How far a body has moved since it was last looked at. */
function moved(body, from) {
  return Math.hypot(body.x - from.x, body.y - from.y);
}

test('the line is nothing at all at rank 0, and a share of a walk above it', () => {
  const field = chilled(40, 0);
  const body = ahead(field, 'drifter', 200);

  chill(field, body);
  assert.equal(body.frost, 0, 'a run that did not take the card freezes nothing');
  assert.equal(chillOf(field), 0, 'and there is no cold to be worth anything');

  field.upgrades.chill = 1;
  assert.ok(Math.abs(chillOf(field) - CHILL.step) < 1e-12, 'one rank is one step');
  field.upgrades.chill = CHILL.ranks;
  assert.ok(Math.abs(chillOf(field) - CHILL.step * CHILL.ranks) < 1e-12, 'and the ranks add up');

  chill(field, body);
  assert.ok(Math.abs(body.frost - CHILL.step * CHILL.ranks) < 1e-12, 'and a hit buys all of it');
});

test('the frost is the slow: a chilled body walks the share of its pace that is left', () => {
  const field = chilled(41, 3);
  const frost = CHILL.step * 3;
  const plain = walking(field, 400);
  const cold = walking(field, 620);
  cold.frost = frost;

  const fromPlain = { x: plain.x, y: plain.y };
  const fromCold = { x: cold.x, y: cold.y };
  stepTheWorld();

  // One step, so the walk is the whole of the answer: `pace x (1 - frost) x dt`, and the frost
  // that step's own melt took off it first (game/enemies.js ticks the body's fading states
  // before it asks the kind to walk).
  const wanted = plain.speed * (1 - (frost - STEP / CHILL.melt)) * STEP;
  assert.ok(Math.abs(moved(plain, fromPlain) - plain.speed * STEP) < 1e-9,
    'the plain one walked its pace for a step');
  assert.ok(Math.abs(moved(cold, fromCold) - wanted) < 1e-6,
    'the cold one walked ' + moved(cold, fromCold).toFixed(4) + ' px where '
    + wanted.toFixed(4) + ' was the share left to it');
});

test('a body with a whole frost cannot walk, and is still moved by what hits it', () => {
  const field = chilled(42, CHILL.ranks);
  const stopped = walking(field, 400);
  const shoved = walking(field, 620);
  stopped.frost = 1;
  shoved.frost = 1;
  shoved.ix = 300;                 // a shove, from a bullet or a neighbour making room
  const fromStopped = { x: stopped.x, y: stopped.y };
  const fromShoved = { x: shoved.x, y: shoved.y };

  stepTheWorld();

  const still = moved(stopped, fromStopped);
  assert.ok(still < 0.01, 'the walk is gone: ' + still.toFixed(4) + ' px in a step');
  const gone = moved(shoved, fromShoved);
  assert.ok(gone > 300 * STEP * 0.9 && gone < 300 * STEP * 1.1,
    'and the shove moved it all the same: ' + gone.toFixed(2) + ' px of the 2.5 it is worth');
});

test('the frost is capped at a whole of it, and a hit on a frozen body buys nothing', () => {
  const field = chilled(43, CHILL.ranks);
  const body = ahead(field, 'drifter', 200);
  const rings = field.rings.count;
  const parts = field.particles.count;

  for (let i = 0; i < 8; i++) chill(field, body);

  assert.equal(body.frost, 1, 'eight hits at half a frost each and it is a whole one, not four');
  assert.equal(field.rings.count, rings + 1, 'and it was told once: one shell, eight hits');

  const dust = field.particles.count;
  chill(field, body);
  assert.equal(field.particles.count, dust,
    'and a hit that can take nothing off the walk does not pay for the light of one');
  assert.ok(parts < dust, 'there was dust to compare against in the first place');
});

test('the frost takes its share off a turn as well as a pace', () => {
  // Turning is how a body moves just as much as walking is (game/kinds.js `turnToward`). The
  // darter holding its aim is the cleanest case in the game: the only thing it does is bring
  // its nose round on to the line it has locked.
  const field = chilled(64, 3);
  const frost = CHILL.step * 3;
  const plain = enemyAt('darter', field.player.x, field.player.y - 300);
  const cold = enemyAt('darter', field.player.x - 220, field.player.y - 300);
  for (const body of [plain, cold]) {
    body.stage = 'aim';
    body.timer = 10;
    body.stageTime = 10;
    body.dirX = 0;
    body.dirY = -1;            // locked straight up, with the ship somewhere below it
    body.rot = 0;
  }
  cold.frost = frost;

  stepTheWorld();

  const turned = (body) => Math.abs(body.rot);
  const want = turned(plain) * (1 - (frost - STEP / CHILL.melt));
  assert.ok(turned(plain) > 0, 'the plain one is coming round');
  assert.ok(Math.abs(turned(cold) - want) < 1e-9,
    'and the cold one came ' + turned(cold).toFixed(4) + ' rad where ' + want.toFixed(4)
    + ' was the share left to it');
});

test('it melts: a body nobody is hitting warms back through in `melt` seconds', () => {
  const field = chilled(44, CHILL.ranks);
  const body = ahead(field, 'drifter', 200);
  body.frost = 1;

  runFor(field, CHILL.melt * 0.5);
  assert.ok(body.frost > 0.4 && body.frost < 0.6,
    'half of it gone in half the time: ' + body.frost.toFixed(3));

  runFor(field, CHILL.melt * 0.6);
  assert.equal(body.frost, 0, 'and none of it left a whole melt after the last hit');
});

test('the melt is refreshed by every hit, so the cold is something the run keeps up', () => {
  const field = chilled(45, 2);
  const body = ahead(field, 'drifter', 200);

  chill(field, body);
  runFor(field, STEP * 4);
  const halfway = body.frost;
  chill(field, body);
  assert.ok(body.frost > halfway, 'one more hit put more frost back on than the melt had taken off');
});

test('a body going solid is told, and it is told once', () => {
  const field = chilled(46, CHILL.ranks);
  const body = ahead(field, 'drifter', 200);
  const per = CHILL.step * CHILL.ranks;
  const hits = Math.ceil(1 / per);
  const rings = field.rings.count;

  chill(field, body);
  assert.ok(field.particles.count > 0, 'dust, which is the quiet half of the card');
  assert.equal(field.rings.count, rings, 'and half a frost is not a shell');

  for (let i = 1; i < hits - 1; i++) chill(field, body);
  assert.equal(field.rings.count, rings, 'and nothing is a shell until the frost is whole');

  chill(field, body);
  assert.ok(isFrozen(body) && isChilled(body), 'the last of them closed it');
  assert.equal(field.rings.count, rings + 1, 'and the shell arrives with a ring of its own');
});

test('below the fifth rank a cold body coming apart throws nothing', () => {
  for (const ranks of [CHILL.shatter.at - 1, CHILL.ranks]) {
    const field = chilled(47, ranks);
    const corpse = ahead(field, 'drifter', 200, 1);
    const neighbour = ahead(field, 'drifter', 200 + CHILL.shatter.radius * 0.5);
    corpse.frost = 1;

    damageEnemy(field, corpse, BIG, true);

    const gate = ranks >= CHILL.shatter.at;
    assert.ok(gate ? neighbour.hp < BIG : neighbour.hp === BIG,
      'rank ' + ranks + ' ' + (gate ? 'throws ice at what stands in it' : 'throws nothing'));
  }
});

test('the ice tells itself: a cold death flickers and a frozen one breaks', () => {
  // The frame has to say which bodies are worth the fifth rank before they come apart, and it
  // has to be honest about what came apart afterwards (game/burn.js makes the same argument
  // for its jump). Nearly every kill in a late run is a cold one, so a cold death is allowed a
  // flicker of the reach it hurt and nothing more; the shell, the chips and the glass belong
  // to a body that was actually frozen.
  const tells = [];
  for (const frost of [CHILL.step * CHILL.ranks, 1]) {
    const field = chilled(54, CHILL.ranks);
    const corpse = ahead(field, 'drifter', 300, 1);
    corpse.frost = frost;

    damageEnemy(field, corpse, BIG, true);

    let ring = null;
    let chips = 0;
    for (const r of field.rings.items) if (r.color === PALETTE.chillShell) ring = r;
    for (const p of field.particles.items) {
      if (p.shape === DEBRIS && p.color === PALETTE.chillShell) chips++;
    }
    assert.ok(ring !== null, 'a cold death is still told at all');
    tells.push({ frost, reach: ring.vr, chips });
  }

  const [cold, solid] = tells;
  const want = solid.reach / cold.reach;
  assert.ok(Math.abs(want / (1 / (CHILL.step * CHILL.ranks)) - 1) < 1e-6,
    'the flicker ran out as much shorter as the body was colder: ' + want.toFixed(3));
  assert.equal(cold.chips, 0, 'and a body that was merely cold threw no ice');
  assert.equal(solid.chips, CHILL.shatter.light.chips.count,
    'while the one in the shell came apart in it');
});

test('the shatter reaches what stands inside it and nothing that stands outside', () => {
  const field = chilled(48, CHILL.ranks);
  const ship = field.player;
  const corpse = ahead(field, 'drifter', 300, 1);
  corpse.frost = 1;
  const inside = standingStill(field, 'drifter', ship.x + CHILL.shatter.radius * 0.9, ship.y - 300);
  const outside = standingStill(field, 'drifter', ship.x + CHILL.shatter.radius * 1.4, ship.y - 300);

  damageEnemy(field, corpse, BIG, true);

  assert.ok(inside.hp < BIG, 'the one standing in it lost hull');
  assert.equal(outside.hp, BIG, 'and the one standing out of it did not');
});

test('how cold it was is how hard it goes', () => {
  const results = [];
  for (const frost of [0.5, 1]) {
    const field = chilled(49, CHILL.ranks);
    const ship = field.player;
    const corpse = ahead(field, 'drifter', 300, 1);
    corpse.frost = frost;
    const neighbour = standingStill(field, 'drifter', ship.x + 40, ship.y - 300);

    damageEnemy(field, corpse, BIG, true);
    results.push(BIG - neighbour.hp);
  }

  const ratio = results[1] / results[0];
  assert.ok(Math.abs(ratio - 2) < 0.05,
    'a body frozen solid threw twice what one at half frost threw: ' + ratio.toFixed(3));
});

test('a shatter is a share of one shot of the gun, so the damage line weighs it', () => {
  const field = chilled(50, CHILL.ranks);
  const ship = field.player;
  const corpse = ahead(field, 'drifter', 300, 1);
  corpse.frost = 1;
  const neighbour = standingStill(field, 'drifter', ship.x + 40, ship.y - 300);

  damageEnemy(field, corpse, BIG, true);
  const plain = BIG - neighbour.hp;
  assert.ok(Math.abs(plain / (GUN.damage * CHILL.shatter.weight) - 1) < 1e-6,
    'one shot of the plain gun, times the line\'s share: ' + plain);

  field.upgrades.damage = 3;
  const heavy = ahead(field, 'drifter', 300, 1);
  heavy.frost = 1;
  const second = standingStill(field, 'drifter', ship.x - 40, ship.y - 300);
  damageEnemy(field, heavy, BIG, true);

  const gained = (BIG - second.hp) / plain;
  assert.ok(Math.abs(gained - gainOf(field, 'damage')) < 1e-6,
    'and it came up by the whole damage line: ' + gained.toFixed(3));
});

test('what the ice throws sideways is a share, so a chain runs down and dies out', () => {
  const field = chilled(51, CHILL.ranks);
  const ship = field.player;
  const corpse = ahead(field, 'drifter', 300, 1);
  corpse.frost = 1;
  const near = standingStill(field, 'drifter', ship.x + 30, ship.y - 300);
  const far = standingStill(field, 'drifter', ship.x + CHILL.shatter.radius * 0.9, ship.y - 300);

  damageEnemy(field, corpse, BIG, true);

  assert.ok(Math.abs(near.frost - CHILL.shatter.share) < 1e-6,
    'the one standing next to it took a share of the frost and no more');
  assert.ok(far.frost > 0 && far.frost <= CHILL.shatter.share,
    'and so did the one at the edge of it');
  assert.ok(CHILL.shatter.share < 1, 'a share cannot freeze anybody on its own');
});

test('the ship is never standing in its own ice', () => {
  const field = chilled(52, CHILL.ranks);
  const ship = field.player;
  ship.invuln = 0;
  const hull = ship.hull;
  // A body frozen solid, dying right on top of the ship - the worst case for this, and the
  // one the player is most likely to arrange on purpose.
  const corpse = standingStill(field, 'drifter', ship.x, ship.y + 20, 1);
  corpse.frost = 1;

  damageEnemy(field, corpse, BIG, true);

  assert.equal(ship.hull, hull, 'the shatter hurt nothing on the ship\'s side of the arena');
});

test('the hit that kills is the cold the body dies with', () => {
  // The rule the fifth rank turns on, and the second time this lesson had to be learned in
  // this game (NOTES session 38: Burn). A run with a strong gun kills a body with the shot
  // that touches it, so if only a body that *survived* being shot could be cold, the rank
  // would pay out on almost nothing at all - measured, one body froze solid in five minutes.
  const field = chilled(53, CHILL.ranks);
  const victim = ahead(field, 'drifter', 120, 1);
  const neighbour = ahead(field, 'drifter', 120 + CHILL.shatter.radius * 0.5);

  fire(field);
  for (let i = 0; i < 60 && field.enemies.length > 1; i++) stepTheWorld();

  assert.equal(field.enemies.length, 1, 'the shot brought the first one down');
  const lost = BIG - neighbour.hp;
  const wanted = GUN.damage * CHILL.shatter.weight * CHILL.step * CHILL.ranks;
  assert.ok(Math.abs(lost - wanted) < 1e-9,
    'the body next to it was hit by ice on its way out, for exactly what the killing hit\'s'
    + ' own frost was worth: ' + lost + ' against ' + wanted);
  assert.ok(Math.abs(neighbour.frost - CHILL.shatter.share * CHILL.step * CHILL.ranks) < 0.01,
    'and it was left colder than it was, by the same share (minus the frost the wait for the\n'
    + 'shot to arrive spent: ' + neighbour.frost.toFixed(3) + ' of ' + CHILL.shatter.share * CHILL.step * CHILL.ranks);
});

test('every door the ship hits a body through makes cold: shots, bolts, drones and fronts', () => {
  // All four at the top rank, and short windows: a rank of this line is worth a fifth of a
  // frost, which a whole melt's worth of waiting would simply warm back off them.
  const shots = chilled(54, CHILL.ranks);
  const hit = ahead(shots, 'drifter', 120);
  fire(shots);
  for (let i = 0; i < 60 && !isChilled(hit); i++) stepTheWorld();
  assert.ok(isChilled(hit), 'a bullet that landed');

  const bolts = chilled(55, CHILL.ranks);
  setWeapon(bolts, 'arc');
  const stood = ahead(bolts, 'drifter', 120);
  fire(bolts);
  assert.ok(isChilled(stood), 'a bolt, which finds its own body and chills it as it lands');
  setWeapon(bolts, 'pulse');

  const ringed = chilled(56, CHILL.ranks);
  ringed.upgrades.orbitals = 1;
  const RING = BALANCE.upgrades.orbitals;
  const ground = standingStill(ringed, 'drifter', ringed.player.x + RING.radius, ringed.player.y);
  runFor(ringed, STEP * 3);
  assert.ok(isChilled(ground), 'a drone bite, which the ring takes the first step it can');

  const waved = chilled(57, CHILL.ranks);
  waved.upgrades.nova = 1;
  const crossed = ahead(waved, 'drifter', 140);
  runFor(waved, STEP * 20);
  assert.ok(isChilled(crossed), 'and a nova front that came over it - the first one is on the spot');
});

test('nothing else makes cold: a blast is somebody else\'s death', () => {
  const field = chilled(58, CHILL.ranks);
  const ship = field.player;
  // A bomber going off is the crowd's own business, and the bodies it catches stay warm
  // (game/blast.js, and the same rule game/burn.js holds).
  const bomber = ahead(field, 'bomber', 200, 1);
  const caught = standingStill(field, 'drifter', ship.x + 30, ship.y - 180);

  damageEnemy(field, bomber, BIG, false);
  stepTheWorld();

  assert.equal(caught.frost, 0, 'the blast did not chill a thing');
});

test('cold bodies warm through, all of them, and the crowd is left as it was found', () => {
  const field = chilled(59, CHILL.ranks);
  const bodies = [];
  for (let i = 0; i < 6; i++) bodies.push(ahead(field, 'drifter', 120 + i * 40));
  for (const body of bodies) chill(field, body);
  assert.ok(bodies.every(isChilled), 'six of them cold');

  runFor(field, CHILL.melt + STEP * 2);
  assert.ok(bodies.every((body) => body.frost === 0), 'and none of them cold a melt later');
});

test('chill spends no number out of the run stream, so a seed is still a seed', () => {
  const field = chilled(60, CHILL.ranks);
  const bodies = [];
  for (let i = 0; i < 6; i++) bodies.push(ahead(field, 'drifter', 120 + i * 30));
  for (const body of bodies) chill(field, body);

  const state = logic.state;
  for (let i = 0; i < 400; i++) {
    sweep(field);
    stepTheWorld();
  }

  assert.ok(bodies.some((body) => !isChilled(body)), 'the frost went through a whole melt in there');
  assert.equal(logic.state, state, 'not one draw from the stream a run is made of');
});

test('a body that is not cold at all has nothing to shatter', () => {
  const field = chilled(61, CHILL.ranks);
  const corpse = ahead(field, 'drifter', 300, 1);
  const neighbour = ahead(field, 'drifter', 300 - CHILL.shatter.radius * 0.5);

  shatterOnDeath(field, corpse, true);
  damageEnemy(field, corpse, BIG, true);

  assert.equal(neighbour.hp, BIG, 'a warm corpse is just a corpse');
  assert.equal(corpse.frost, 0, 'and nothing made it cold on the way out');
});

test('frozen is a whole frost within a tenth of it, and not exactly one', () => {
  // Why `SOLID` exists at all (game/chill.js): a frost wears away continuously, so "exactly a
  // whole" is one step wide - a shell drawn on that line would flash once and be gone, and the
  // shell is the one thing that tells a player this body will shatter.
  const field = chilled(63, CHILL.ranks);
  const body = ahead(field, 'drifter', 200);

  body.frost = 0.95;
  assert.ok(isFrozen(body), 'a body with a twentieth of its walk left is frozen');
  body.frost = 0.5;
  assert.ok(isChilled(body) && !isFrozen(body), 'and one with half of it left is only cold');

  body.frost = 1;
  runFor(field, CHILL.melt * 0.05);
  assert.ok(isFrozen(body), 'and it stays frozen for the first twentieth of its thaw, not one step');
});

test('the melt is the body\'s own, and it only happens while the crowd is stepped', () => {
  const field = chilled(62, CHILL.ranks);
  const body = ahead(field, 'drifter', 200);
  body.frost = 1;

  melt(field, body, STEP);
  assert.ok(Math.abs(body.frost - (1 - STEP / CHILL.melt)) < 1e-12, 'one step of warming');

  const planted = makeEnemy(field, 'drifter', field.player.x, field.player.y - 400);
  planted.speed = 0;
  planted.frost = 1;
  runFor(field, STEP * 3);
  assert.equal(planted.frost, 1, 'a body outside the crowd warms through with nothing stepping it');
});
