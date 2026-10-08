// The nova (PLAN 3.2, taken as an upgrade line): a ring of damage that leaves the ship
// and travels outwards, hurting every body it comes over.
//
// A front is not a thing with a lifetime of its own behaviour - it is one number, `r`,
// growing, and a rule about what that number passing a body means. So the interesting
// failures here are not bookkeeping either, they are the three ideas in `game/nova.js`:
//
//   the count: a rank buys one more front inside the cycle, the wait is the cycle divided
//     by them, the first one goes off on the step the card was taken, and a rank taken
//     part way through a wait shortens the next one and not the one being spent;
//   the crossing: a body is hurt once and only once by a front, when the ring comes over
//     it - so a nearer body is hurt before a further one, which is what makes the light
//     you watch be the damage you got; and a body that walks into the ring after the
//     front went by is not hurt at all, because this is a wave and not an aura;
//   the weight: what a crossed body loses is one shot of the ship's own gun times the
//     line's weight, so it pays out like a shot, is soaked like a shot, and grows with
//     the damage line like a shot does - which is the only reason a line that *adds*
//     damage is still worth taking at level forty.
//
// The scripted world's ship sits in the middle of the arena pointing straight up and does
// not move unless a test drives it, and its bodies do not move either unless something
// shoves them, so "a body the gun cannot reach" is simply one standing below the ship.
// Bodies with `hp: 0.2` die to any hit at all, which is what makes a count of corpses
// mean a count of crossings (NOTES session 30's fractional-damage trap); the ones that
// are counted rather than killed are given a hull no nova can take off.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { countOf, effectOf, gainOf, pulsesOf } from '../src/game/upgrades.js';
import { guardOf } from '../src/game/shields.js';
import { resetRun } from '../src/game/run.js';
import { scriptedRun, enemyAt, stepTheWorld } from '../tools/headless/scripted.js';

const NOVA = BALANCE.upgrades.nova;
const GUN = BALANCE.bullets;
const PULSE = BALANCE.weapons.pulse;
const RANKS = NOVA.ranks;
const STEP = BALANCE.sim.step;
const IMMORTAL = 1e9;
/** What one crossed body loses on a plain gun: a shot, at the front's own weight. */
const BITE = GUN.damage * NOVA.weight;

function marked(bodies) {
  for (const body of bodies) body.hpBefore = body.hp;
  return bodies;
}

function hullGone(bodies) {
  return bodies.reduce((sum, body) => sum + (body.hpBefore - body.hp), 0);
}

/** Step the world for `seconds`, sweeping the shards so a crowd cannot buy a level. */
function runFor(field, seconds, input) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    // A level-up would stop the arena and the test would measure the pause, not the nova.
    field.shards.clear();
    field.xp = 0;
    stepTheWorld(input || { firing: false });
  }
}

/** A run wearing `rank` ranks of the line, and nothing else. */
function wearing(rank) {
  const field = scriptedRun(610 + rank);
  field.xpNeed = Infinity;
  field.upgrades.nova = rank;
  return field;
}

/** One body `distance` above the ship, `hp` apiece. Above, so a held trigger can hit it. */
function ahead(field, distance, hp) {
  const ship = field.player;
  return marked([enemyAt('swarmling', ship.x, ship.y - distance, hp)])[0];
}

/**
 * Step the world for `seconds`, holding `hold` in place and counting the fronts thrown.
 *
 * A front shoves what it crosses, which is most of what the line is for - and it also lets
 * a crowd being counted walk out of the reach and stop being crossed, which is a different
 * question. The counting tests put their bodies on rails; the tests about the shove do not.
 */
function frontsThrown(field, seconds, hold) {
  let thrown = 0;
  // Whatever is already up there is not a throw this window saw.
  let seen = field.nova.fronts.count;
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    holdStill(hold);
    field.shards.clear();
    field.xp = 0;
    stepTheWorld({ firing: false });
    const live = field.nova.fronts.count;
    // A front is only ever added with its radius at nought, and one that has reached the
    // rim is dropped, so an increase in the drawer is a front being thrown and nothing
    // else. Fronts live a quarter of a second and the shortest wait here is over a
    // second, so two are never in the air to confuse the count.
    if (live > seen) thrown += live - seen;
    seen = live;
  }
  return thrown;
}

/** The same walk without counting. */
function stepWhile(field, seconds, hold) {
  frontsThrown(field, seconds, hold);
}

/** Put every held body back on the rails. */
function holdStill(bodies) {
  if (!bodies) return;
  for (const body of bodies) {
    body.ix = 0;
    body.iy = 0;
    body.x = body.homeX;
    body.y = body.homeY;
    body.px = body.homeX;
    body.py = body.homeY;
  }
}

/** `marked`, remembering where each body was planted so it can be held there. */
function planted(bodies) {
  for (const body of bodies) {
    body.homeX = body.x;
    body.homeY = body.y;
  }
  return marked(bodies);
}

test('a rank buys one more front inside the cycle, and the wait is the cycle over them', () => {
  for (let rank = 0; rank <= RANKS; rank++) {
    const field = wearing(rank);
    assert.equal(pulsesOf(field), rank * NOVA.step,
      'rank ' + rank + ' throws ' + pulsesOf(field) + ' fronts a cycle');
    assert.equal(countOf(field, 'nova'), pulsesOf(field), 'and it is the line, counted');

    if (rank === 0) continue;
    // PLAN wrote the rank-one case: one ring every eight seconds. The rank buys more of
    // them inside the same eight rather than a shorter wait, which is what the card says.
    assert.ok(Math.abs(NOVA.cycle / pulsesOf(field) - NOVA.cycle / (rank * NOVA.step)) < 1e-9);
    const thrown = frontsThrown(field, NOVA.cycle * 2);
    assert.equal(thrown, rank * 2,
      'rank ' + rank + ' threw ' + thrown + ' fronts in two cycles, ' + rank * 2 + ' expected');
  }
});

test('an untaken line throws nothing and counts nothing down', () => {
  const field = wearing(0);
  runFor(field, NOVA.cycle * 2);
  assert.equal(field.nova.fronts.count, 0, 'no front in the sky');
  assert.equal(field.nova.wait, 0, 'and nothing was being counted down for it, so the first');
  assert.equal(field.nova.beat, 0, 'one after the card is taken can go off at once');
});

test('the first front goes off on the step the card is taken', () => {
  // Taking NOVA is supposed to be a bang and not eight seconds of nothing, and the way to
  // have both that and an honest counter is to leave the wait at nought while the line is
  // untaken rather than to special-case the first one.
  const field = wearing(0);
  stepTheWorld({});
  assert.equal(field.nova.fronts.count, 0, 'nothing until the card');

  field.upgrades.nova = 1;
  stepTheWorld({});
  assert.equal(field.nova.fronts.count, 1, 'the room went off on the next step');
  assert.ok(field.nova.wait > NOVA.cycle * 0.9, 'and the counter started from the full cycle');
});

test('a body is crossed once by a front and not once per step', () => {
  // One body, one front, and the whole front's flight. What it loses is one bite: a front
  // is a ring coming over you and not a blender you stand inside.
  const field = wearing(1);
  const body = ahead(field, 120, IMMORTAL);
  runFor(field, NOVA.cycle - 1);         // one cycle, less the front's own flight time
  assert.ok(Math.abs(hullGone([body]) - BITE) < 1e-9,
    'lost ' + hullGone([body]) + ' where one crossed body is worth ' + BITE);
});

test('every front of a maxed line crosses the same body, and each one once', () => {
  // The count again, from the other side: two cycles of a maxed line is ten fronts and so
  // ten crossings of a body standing inside the reach, however long the front is in the
  // air and however many bodies are standing there with it. The bodies are on rails, so
  // that this counts crossings and not the shove's talent for emptying the reach.
  const field = wearing(RANKS);
  const ship = field.player;
  const bodies = planted([60, 90, 120].map((d) =>
    enemyAt('swarmling', ship.x, ship.y - d, IMMORTAL)));
  const thrown = frontsThrown(field, NOVA.cycle * 2, bodies);
  assert.equal(thrown, RANKS * 2, 'and ' + thrown + ' fronts were thrown in two cycles');
  for (const body of bodies) {
    assert.ok(Math.abs(hullGone([body]) - thrown * BITE) < 1e-9,
      'a body at ' + Math.round(ship.y - body.y) + ' px lost ' + hullGone([body])
      + ' where ' + thrown + ' crossings are worth ' + thrown * BITE);
  }
});

test('the reach is a wall, and it is the wall the ring is drawn at', () => {
  const inside = wearing(1);
  const near = ahead(inside, NOVA.reach - 10, IMMORTAL);
  runFor(inside, 1);
  assert.ok(hullGone([near]) > 0, 'a body just inside the reach was crossed');

  const outside = wearing(1);
  const far = ahead(outside, NOVA.reach + 30, IMMORTAL);
  runFor(outside, 1);
  assert.equal(hullGone([far]), 0, 'and one thirty px past it was not crossed at all');
});

test('a nearer body is hurt before a further one', () => {
  // The claim that makes the picture honest: the ring you can see is the ring that hurts
  // you, at the radius it is at and not all at once when it finishes. Two bodies, one at
  // forty px and one at two hundred, and the question is which of them loses hull first.
  const field = wearing(1);
  const ship = field.player;
  const near = marked([enemyAt('swarmling', ship.x, ship.y - 40, IMMORTAL)])[0];
  const far = marked([enemyAt('swarmling', ship.x - 140, ship.y - 140, IMMORTAL)])[0];

  let nearAt = -1;
  let farAt = -1;
  for (let i = 0; nearAt < 0 || farAt < 0; i++) {
    field.shards.clear();
    field.xp = 0;
    stepTheWorld({});
    if (nearAt < 0 && hullGone([near]) > 0) nearAt = i;
    if (farAt < 0 && hullGone([far]) > 0) farAt = i;
    assert.ok(i < 400, 'both bodies were crossed, and soon');
  }
  assert.ok(nearAt < farAt,
    'the body at 40 px was crossed on step ' + nearAt + ' and the one at 200 px on step ' + farAt);
  // And both inside one front's flight, which is what "a ring" means: a quarter of a
  // second for the whole thing, not a slow ripple the crowd can walk out of.
  assert.ok((farAt - nearAt) * STEP < 0.3, 'the whole front passed in under a third of a second');
});

test('a body that walks into the ring after the front has gone is not hurt', () => {
  // The decision written as a test: this is a wave and not an aura. It goes out, it hurts
  // what was there, and then the sky is empty again - which is why a front has to be
  // thrown again to do any good, and why the line is bought in fronts per cycle rather
  // than in a bigger aura.
  const field = wearing(1);
  stepTheWorld({});                            // the front is born
  for (let i = 0; i < 16; i++) stepTheWorld({});  // ...and has come round past 200 px
  assert.ok(field.nova.fronts.count === 1, 'the front is still on its way');

  const late = ahead(field, 60, IMMORTAL);     // walks in behind it, right where it has been
  for (let i = 0; i < 20; i++) stepTheWorld({});
  assert.equal(hullGone([late]), 0, 'a body the ring has already passed takes nothing');
});

test('a crossed body is thrown away from the ship', () => {
  // Most of what the line is for, and the part a damage number cannot show: the pocket of
  // bodies that has closed on the hull gets put back out into the arena.
  const field = wearing(1);
  const ship = field.player;
  const body = enemyAt('swarmling', ship.x + 80, ship.y, IMMORTAL);

  let steps = 0;
  while (body.ix === 0 && steps < 200) { stepTheWorld({}); steps++; }
  assert.ok(steps < 200, 'the front came over it');
  assert.ok(body.ix > 0, 'and it was shoved outwards, away from the ship: ' + body.ix.toFixed(1));
  assert.equal(body.iy, 0, 'straight outwards, along the line from the ship to it');
});

test('what a front kills is paid for, and nothing of it is left', () => {
  const field = wearing(RANKS);
  const ship = field.player;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    enemyAt('swarmling', ship.x + Math.cos(a) * 90, ship.y + Math.sin(a) * 90, 0.2);
  }
  for (let i = 0; i < Math.round(1 / STEP); i++) stepTheWorld({ firing: false });
  assert.equal(field.kills, 6, 'the front cleared the whole ring of them');
  assert.ok(field.score > 0, 'and the run was paid for every one');
  assert.ok(field.shards.count > 0, 'and the shards came out of it');
  assert.equal(field.enemies.length, 0, 'and nothing of it is left');
});

test('a shielder drinks a front before the hull does, like any other shot', () => {
  // A shielder's field drinks part of it, the same way it drinks a shot: one way to hurt a
  // body in this game, and a wide ring is not a way of getting past it (game/shields.js).
  // The rig is the same on both sides - the front the card buys is spent before the bodies
  // are put down, so what is being measured is one named front and not the first one.
  const guarded = fieldWithGuard(true);
  const bare = fieldWithGuard(false);
  stepWhile(guarded.field, NOVA.cycle, [guarded.body]);
  stepWhile(bare.field, NOVA.cycle, [bare.body]);

  assert.notEqual(guardOf(guarded.body), null, 'and the body really was standing in a field');
  assert.ok(hullGone([bare.body]) > hullGone([guarded.body]),
    'the guarded body lost ' + hullGone([guarded.body]) + ' against the bare one at '
    + hullGone([bare.body]));
});

/** One body inside the reach, with or without a shielder standing over it. */
function fieldWithGuard(withShielder) {
  const field = wearing(1);
  stepTheWorld({});                             // the front the card buys, and it is spent
  const ship = field.player;
  const body = planted([enemyAt('drifter', ship.x, ship.y - 90, IMMORTAL)])[0];
  if (withShielder) enemyAt('shielder', ship.x + 60, ship.y - 40, IMMORTAL);
  for (let i = 0; i < 10; i++) stepTheWorld({});    // let the field be worked out
  body.hpBefore = body.hp;
  return { field, body };
}

test('a crossing carries the damage line, exactly like a shot does', () => {
  // A front hits as hard as the gun does, which is the whole reason this line is a
  // multiple of a shot rather than a number of its own: a flat number loses the race
  // against a multiplying gun, and a card that stops mattering by minute three is a card
  // the player paid a level for (NOTES session 31 measured that mistake on the ring).
  const plain = wearing(RANKS);
  const plainBody = ahead(plain, 100, IMMORTAL);
  runFor(plain, NOVA.cycle);

  const heavy = wearing(RANKS);
  heavy.upgrades.damage = BALANCE.upgrades.damage.ranks;
  const heavyBody = ahead(heavy, 100, IMMORTAL);
  runFor(heavy, NOVA.cycle);

  const gain = gainOf(heavy, 'damage');
  assert.ok(gain > 1, 'the damage line is worth something');
  assert.ok(Math.abs(hullGone([heavyBody]) - hullGone([plainBody]) * gain) < 1e-9,
    'the same front over the same cycle took ' + hullGone([heavyBody]).toFixed(1)
    + ' against ' + hullGone([plainBody]).toFixed(1) + ' x ' + gain);
});

test('a rank taken part way through a wait shortens the next one and not that one', () => {
  // The card cannot reach back into time it has already spent counting, so the wait being
  // spent is left alone and only the beat changes. Half a cycle at rank one, then rank
  // five: the second front still has half a cycle to come, and the third then has a
  // fifth of a cycle after that.
  const field = wearing(1);
  runFor(field, NOVA.cycle / 2);
  assert.equal(field.nova.fronts.count, 0, 'one front went off, at the start, and is gone');
  const spent = field.nova.wait;
  assert.ok(Math.abs(spent - NOVA.cycle / 2) < STEP * 2, 'and half a cycle has been spent');

  field.upgrades.nova = RANKS;
  assert.ok(Math.abs(field.nova.wait - spent) < 1e-9, 'the wait was not retroactively cut');

  // Nothing comes for the rest of that half cycle, which is the point: the card cannot
  // reach back into time already spent. Then the new beat takes over, a fifth of a cycle.
  assert.equal(frontsThrown(field, NOVA.cycle / 2 - STEP * 4), 0, 'the old wait was kept');
  assert.equal(frontsThrown(field, STEP * 8), 1, 'and the front came when it had been kept');
  assert.ok(Math.abs(field.nova.beat - NOVA.cycle / RANKS) < 1e-9, 'the beat is the new one');
  assert.equal(frontsThrown(field, NOVA.cycle / RANKS + STEP * 12), 1,
    'and the next came a fifth of a cycle after it, and only one');
});

test('the front stays where the ship was when it was thrown', () => {
  // A nova is a thing that happened to the arena, not a shield that goes with you: flying
  // away from your own ring is a real thing a player does, and the ring they left behind
  // still hurts what it comes over.
  const field = wearing(1);
  const ship = field.player;
  const where = { x: ship.x, y: ship.y };
  const body = enemyAt('swarmling', ship.x - 120, ship.y, IMMORTAL);
  marked([body]);

  stepTheWorld({});
  const front = field.nova.fronts.items[0];
  assert.ok(Math.abs(front.x - where.x) < 1e-9 && Math.abs(front.y - where.y) < 1e-9);

  let steps = 0;
  while (ship.x - where.x < 100 && steps < 600) { stepTheWorld({ moveX: 1, moving: true }); steps++; }
  assert.ok(steps < 600, 'and the ship really left');
  assert.ok(Math.abs(front.x - where.x) < 1e-9, 'the front did not follow it');
  runFor(field, 1);
  assert.ok(hullGone([body]) > 0, 'and the crowd the ship left behind was still crossed');
});

test('a crowd the gun cannot reach dies to the line', () => {
  // The claim the card sells, end to end: the same bodies, below the ship, out of the air
  // a trigger aimed up will ever cover, and only the run wearing the line clears them.
  assert.equal(clearedBehind(0), 0, 'the gun, aimed up, hit none of the eight below it');
  assert.equal(clearedBehind(RANKS), 8, 'the nova cleared every one of them');
});

/** Eight bodies below the ship, and how many of them died in two seconds of nothing. */
function clearedBehind(rank) {
  const field = wearing(rank);
  const ship = field.player;
  const bodies = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 2 + (i - 3.5) * 0.3;
    const radius = 70 + (i % 3) * 50;
    bodies.push(enemyAt('swarmling',
      ship.x + Math.cos(a) * radius, ship.y + Math.sin(a) * radius, 0.2));
  }
  runFor(field, 2, { firing: true });
  assert.equal(field.state, STATE.PLAY, 'and nothing stopped the run on the way');
  return bodies.filter((body) => body.hp <= 0).length;
}

test('a maxed line does not leave fronts in the sky', () => {
  // The pool is reused and never grown; a front that reached its rim is dropped. If that
  // ever stopped being true the drawer would fill and the frame would be drawing rings
  // that hurt nothing.
  const field = wearing(RANKS);
  let most = 0;
  for (let i = 0; i < Math.round(60 / STEP); i++) {
    field.shards.clear();
    field.xp = 0;
    stepTheWorld({});
    most = Math.max(most, field.nova.fronts.count);
  }
  const aliveAtOnce = Math.ceil((NOVA.reach / NOVA.speed) / (NOVA.cycle / pulsesOf(field)));
  assert.ok(most <= aliveAtOnce + 1,
    'never more than ' + aliveAtOnce + ' fronts in the air at once, saw ' + most);
  assert.ok(field.nova.fronts.stats().made <= aliveAtOnce + 1, 'and the drawer never grew');
});

test('a new run has no fronts in it', () => {
  const field = wearing(RANKS);
  stepTheWorld({});
  assert.ok(field.nova.fronts.count > 0, 'the ranks were there to begin with');

  // A restart runs `resetRun`, and the title screen does not step a run - so a front left
  // over from the last run would hang in the sky behind the logo (game/run.js).
  resetRun(field);
  assert.equal(field.nova.fronts.count, 0, 'the fronts went with the ranks');
  assert.equal(field.nova.wait, 0, 'and the counter started again');
});

test('the line is a count, not a multiplier, and the card says so', () => {
  const field = wearing(0);
  assert.equal(pulsesOf(field), 0, 'a fresh run throws nothing');

  field.upgrades.nova = RANKS;
  assert.equal(pulsesOf(field), RANKS * NOVA.step);
  assert.equal(countOf(field, 'nova'), pulsesOf(field), 'and it is the line, counted');
  assert.equal(effectOf('nova'), '+' + NOVA.step + ' nova ring');
  assert.throws(() => gainOf(field, 'nova'), /not a line of shares/);
});

test('a rank of the nova is worth a rank of the damage line, at the crowd it really meets', () => {
  // The ladder, as a lockstep - with one difference from every other line in it, which is
  // the crowd. A ring line is worth its weight times the bodies it comes over, and the
  // bodies a front really comes over are two and a third and not the thirty that stand
  // inside a measurement knot: counted over twelve full bot runs, in the reach of a ship
  // as it actually is, which is fleeing (NOTES session 32, and BALANCE.upgrades.nova).
  // Price it on a knot and you have a bomb; price it on a run and it is worth taking when
  // you are surrounded and worth leaving when you are not, which is the card.
  const CROWD = 2.33;
  const perRank = NOVA.step * NOVA.weight * GUN.damage * CROWD / NOVA.cycle;
  // What a rank of the damage line is worth a second on the plain gun - and the plain
  // gun is the pulse (game/weapons.js), which is also the weapon the weight of a front
  // was measured against.
  const gunPerRank = PULSE.damage * PULSE.fireRate * BALANCE.upgrades.damage.step;
  assert.ok(Math.abs(perRank / gunPerRank - 1) < 0.15,
    'a rank of the nova is ' + perRank.toFixed(2) + ' a second against the damage line at '
    + gunPerRank.toFixed(2));
});
