// The arc (PLAN 3.2's third primary): what a bolt that finds its own body and leaps from
// body to body does in the world, as opposed to what a shot does.
//
// The shape of the weapon, in the order the tests take it:
//
//   * it throws no bullets at all - the bolt is instantaneous and what is left is light
//     (game/arc.js), which is why the pierce and ricochet lines have nothing to apply to and
//     why a test has to count bolts rather than shots to see a pull happen;
//   * the chain is PLAN's: the head plus three leaps, each landing worth `decay` of the one
//     before it, and it stops there - a pull cannot spend itself on a fifth body;
//   * it walks rather than sweeps: the next body is the nearest one *from where the bolt
//     landed*, so a knot is leapt through and two bodies on opposite sides of the ship are
//     two separate pulls;
//   * a body is bought once per pull, which is what keeps a knot of one from being paid for
//     four times over, and it is what the split line's extra chains buy their way past;
//   * the reach is a wall you can stand outside, and a pull that found nothing cost nothing -
//     no kick, no flash, no sound;
//   * and the numbers, measured the same way the scatter's were (NOTES session 34): weaker
//     than the pulse on a body at a time, flat with range because a bolt that lands always
//     lands, and the best of the three primaries on the crowd a ship is actually standing in.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { resetRun } from '../src/game/run.js';
import { clearCues } from '../src/game/cues.js';
import { hear } from '../tools/headless/hear.js';
import { fire, setWeapon, shotsPerPull } from '../src/game/weapons.js';
import { scriptedRun, enemyAt, stepTheWorld } from '../tools/headless/scripted.js';

const STEP = BALANCE.sim.step;
const ARC = BALANCE.weapons.arc;
const CHAIN = ARC.chain;
const PULSE = BALANCE.weapons.pulse;
const IMMORTAL = 1e6;

/** Every cue one pull of the trigger asked the audio layer for. */
function cuesOfPull(field) {
  clearCues();
  fire(field);
  return hear();
}

/** One pull, as the light it left behind: the bolts, oldest first. */
function pull(field) {
  field.arc.bolts.clear();
  field.bullets.clear();
  fire(field);
  return field.arc.bolts.items.slice(0);
}

/**
 * Plant `count` bodies that cannot die in a line out of the nose, `spacing` px apart, the
 * first one `first` px away. Answers them nearest first, with `hpBefore` marked.
 */
function bodyLine(field, count, spacing, first) {
  const ship = field.player;
  const bodies = [];
  for (let i = 0; i < count; i++) {
    const body = enemyAt('drifter', ship.x, ship.y - first - i * spacing, IMMORTAL);
    body.hpBefore = body.hp;
    bodies.push(body);
  }
  return bodies;
}

/** What one pull cost each of `bodies`, nearest first. */
function losses(bodies) {
  return bodies.map((body) => body.hpBefore - body.hp);
}

/** What the `i`th landing of a plain pull is worth, per the gun's own numbers. */
function wanted(jump) {
  return ARC.damage * Math.pow(CHAIN.decay, jump);
}

/**
 * Hold the trigger at one body standing `range` px up the nose and answer the hull a second
 * cost it, averaged over six seeds. The same instrument test/scatter.test.mjs uses: this is
 * what a gun really does to the one thing it is pointed at, not what its table says.
 *
 * The body's own shove is cancelled every step, because a bolt throws the thing it landed on
 * and a body that stands still - which is all a planted body can do - will be walked out of
 * the gun's own reach by its own jolt. What is being measured here is the rate, and the shove
 * has a test of its own below.
 */
function loneBodyRate(range, seconds, id) {
  let total = 0;
  for (let seed = 11; seed <= 16; seed++) {
    const field = scriptedRun(seed);
    if (id !== undefined) setWeapon(field, id);
    const body = enemyAt('drifter', field.player.x, field.player.y - range, IMMORTAL);
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i++) {
      body.ix = 0;
      body.iy = 0;
      stepTheWorld({ firing: true });
    }
    total += (IMMORTAL - body.hp) / seconds;
  }
  return total / 6;
}

test('a pull throws no shots, only light', () => {
  // The claim the whole module rests on: this is not a bullet with a number on it. The damage
  // is done in the step the bolt is drawn, so there is nothing in the air to count and the
  // only evidence a pull happened is the bolt pool and the hull that came off.
  const field = scriptedRun(420);
  setWeapon(field, 'arc');
  const bodies = bodyLine(field, 4, 60, 60);

  const bolts = pull(field);

  assert.equal(field.bullets.count, 0, 'not one shot left the ship');
  assert.equal(bolts.length, CHAIN.jumps + 1, 'one bolt per landing: ' + bolts.length);
  assert.ok(losses(bodies).every((lost) => lost > 0), 'and every one of them was paid for');
});

test('the chain is PLAN\'s: four bodies, each landing lighter than the last', () => {
  const field = scriptedRun(421);
  setWeapon(field, 'arc');
  const bodies = bodyLine(field, 4, 60, 60);

  pull(field);
  const lost = losses(bodies);

  for (let jump = 0; jump < CHAIN.jumps + 1; jump++) {
    assert.ok(Math.abs(lost[jump] - wanted(jump)) < 1e-9,
      'landing ' + jump + ' cost ' + lost[jump] + ', wanted ' + wanted(jump));
  }
  // PLAN's "20% less damage per jump" is a compounding loss, so a full chain of four is
  // worth under three bodies' heads and not four. That is what buys the free aim.
  const total = lost.reduce((sum, one) => sum + one, 0);
  assert.ok(total < CHAIN.jumps + 1 - 1,
    'the whole chain is worth less than the bodies it touched: ' + total.toFixed(3));
  assert.ok(total > 2, 'and still worth the four of them: ' + total.toFixed(3));
});

test('a pull stops spending at its last leap', () => {
  // Five bodies standing in a row, each within a hop of the last, and the fifth one is
  // nobody's business: the chain has `jumps` leaps and no more. This is the whole reason a
  // bolt cannot be the best gun in the game at a knot thirty deep - it is capped by its own
  // length, whatever is standing there.
  const field = scriptedRun(422);
  setWeapon(field, 'arc');
  const bodies = bodyLine(field, CHAIN.jumps + 2, 60, 60);

  pull(field);
  const lost = losses(bodies);

  for (let jump = 0; jump < CHAIN.jumps + 1; jump++) {
    assert.ok(lost[jump] > 0, 'landing ' + jump + ' happened');
  }
  assert.equal(lost[CHAIN.jumps + 1], 0, 'and the body past the last leap took nothing');
});

test('the chain walks out from where it landed, it does not sweep the arena', () => {
  // Two bodies, both inside the gun's reach from the ship, further apart from each other than
  // one hop: the bolt takes the near one and stops, because a leap is measured from wherever
  // the bolt is standing and not from the ship again. Without this the reach would be a
  // radius inside which the bolt simply picks its three favourites.
  const field = scriptedRun(423);
  setWeapon(field, 'arc');
  const ship = field.player;
  const room = (CHAIN.reach + CHAIN.leap) / 2;    // inside the reach, further than a hop
  const near = enemyAt('drifter', ship.x, ship.y - room, IMMORTAL);
  const away = enemyAt('drifter', ship.x, ship.y + room, IMMORTAL);
  near.hpBefore = near.hp;
  away.hpBefore = away.hp;

  pull(field);

  assert.ok(near.hp < near.hpBefore, 'the nearest body was found');
  assert.equal(away.hp, away.hpBefore, 'and the one on the far side of the ship was not leapt to');
});

test('a body is bought once per pull', () => {
  // One body and a full stack of split shot: six chains, one of them with something to do.
  // Without this the extras would each pay for the same head again and the gun would be a
  // multiplier rather than a coverage line.
  const field = scriptedRun(424);
  setWeapon(field, 'arc');
  field.upgrades.split = BALANCE.upgrades.split.ranks;
  const bodies = bodyLine(field, 1, 60, 90);

  assert.equal(shotsPerPull(field), ARC.pellets + BALANCE.upgrades.split.ranks,
    'the pull is worth six chains');
  pull(field);

  assert.ok(Math.abs(losses(bodies)[0] - ARC.damage) < 1e-9,
    'and the one body in reach was paid for exactly once: ' + losses(bodies)[0]);
});

test('the split line buys chains, at the share that line charges', () => {
  // The other half of the same decision: on a gun that aims itself, "one more projectile" can
  // only mean one more place to start from, and each extra is lighter by the split line's own
  // share - the same trade the line makes on a fan of shots (game/weapons.js).
  const field = scriptedRun(425);
  setWeapon(field, 'arc');
  const ship = field.player;
  const room = (CHAIN.reach + CHAIN.leap) / 2;
  const near = enemyAt('drifter', ship.x, ship.y - room, IMMORTAL);
  const away = enemyAt('drifter', ship.x, ship.y + room, IMMORTAL);
  near.hpBefore = near.hp;
  away.hpBefore = away.hp;

  pull(field);
  assert.equal(away.hp, away.hpBefore, 'one chain reaches one of them');

  near.hpBefore = near.hp;
  field.upgrades.split = 1;
  pull(field);
  const share = BALANCE.upgrades.split.share;
  assert.ok(Math.abs((near.hpBefore - near.hp) - ARC.damage) < 1e-9, 'the ship\'s own chain');
  assert.ok(Math.abs(away.hpBefore - away.hp - ARC.damage * share) < 1e-9,
    'the extra one is lighter by the line\'s share: ' + (away.hpBefore - away.hp));
});

test('pierce and ricochet are a shot\'s business and reach nothing here', () => {
  // Written down as an assertion because it is a decision and not an oversight (game/arc.js):
  // both lines are read where a *shot* decides what to do after it has been through a body,
  // and a bolt goes through nothing. A run that flies the arc and is offered them is being
  // offered two cards it cannot use, and the answer to that is PLAN's synergy table (Ricochet
  // 3 + Arc is Storm), not a bolt that pretends to be a bullet.
  const field = scriptedRun(426);
  setWeapon(field, 'arc');
  const ship = field.player;
  const room = (CHAIN.reach + CHAIN.leap) / 2;
  const near = enemyAt('drifter', ship.x, ship.y - room, IMMORTAL);
  const away = enemyAt('drifter', ship.x, ship.y + room, IMMORTAL);
  near.hpBefore = near.hp;
  away.hpBefore = away.hp;

  field.upgrades.pierce = BALANCE.upgrades.pierce.ranks;
  field.upgrades.ricochet = BALANCE.upgrades.ricochet.ranks;
  pull(field);

  assert.ok(Math.abs((near.hpBefore - near.hp) - ARC.damage) < 1e-9,
    'the head took a head, and not a head plus a pass plus a turn');
  assert.equal(away.hp, away.hpBefore, 'and nothing was turned on to the body beside it');
});

test('the damage line is on the chain like it is on a shot', () => {
  const field = scriptedRun(427);
  setWeapon(field, 'arc');
  field.upgrades.damage = 2;
  const bodies = bodyLine(field, 3, 60, 60);

  const gain = 1 + BALANCE.upgrades.damage.step * 2;
  pull(field);
  const lost = losses(bodies);

  for (let jump = 0; jump < 3; jump++) {
    assert.ok(Math.abs(lost[jump] - wanted(jump) * gain) < 1e-9,
      'landing ' + jump + ': ' + lost[jump] + ' against ' + (wanted(jump) * gain));
  }
});

test('past the reach there is nothing, and a pull that found nothing cost nothing', () => {
  // The reach is the gun's only sight of the world, so it has to be a wall a player can stand
  // outside - and the silence is the tell. No kick, no flash, no cue: the gun is not firing
  // into the sky, it has nothing to say.
  const field = scriptedRun(428);
  setWeapon(field, 'arc');
  const ship = field.player;
  enemyAt('drifter', ship.x, ship.y - CHAIN.reach - 200, IMMORTAL);
  ship.vx = 0;
  ship.vy = 0;

  const cues = cuesOfPull(field);

  assert.equal(field.arc.bolts.count, 0, 'no bolt for a boltless pull');
  assert.equal(ship.vx, 0, 'the ship was not kicked');
  assert.equal(ship.vy, 0);
  assert.equal(cues.length, 0, 'and nothing was heard');
});

test('the muzzle is where a shot would have started, and the far end is the body', () => {
  // The bolt is the only thing the player is shown about a weapon whose damage is instant, so
  // its two ends have to be the truth: out of the same nose every other gun uses, on to the
  // middle of the body that lost hull. Anything else and the light is a decoration rather
  // than a report.
  const field = scriptedRun(429);
  setWeapon(field, 'arc');
  const ship = field.player;
  const body = enemyAt('drifter', ship.x + 40, ship.y - 120, IMMORTAL);
  const nose = ship.drawR + BALANCE.bullets.noseOffset;

  const bolts = pull(field);

  assert.equal(bolts.length, 1);
  assert.ok(Math.abs(bolts[0].x0 - (ship.x + Math.cos(ship.angle) * nose)) < 1e-9);
  assert.ok(Math.abs(bolts[0].y0 - (ship.y + Math.sin(ship.angle) * nose)) < 1e-9);
  assert.equal(bolts[0].x1, body.x, 'and it ends on the body');
  assert.equal(bolts[0].y1, body.y);
  assert.equal(bolts[0].rank, 0, 'the first leap is the zeroth');
});

test('a bolt fades, and a new run does not inherit the last one\'s sky', () => {
  const field = scriptedRun(430);
  setWeapon(field, 'arc');
  bodyLine(field, 3, 60, 60);

  pull(field);
  assert.ok(field.arc.bolts.count > 0, 'the pull left light behind');

  const steps = Math.ceil(CHAIN.bolt.life / STEP) + 1;
  for (let i = 0; i < steps; i++) stepTheWorld({});
  assert.equal(field.arc.bolts.count, 0, 'and all of it had gone by its own life');

  pull(field);
  assert.ok(field.arc.bolts.count > 0, 'the next pull left some more');
  resetRun(field);
  assert.equal(field.arc.bolts.count, 0, 'and the next run starts under an empty sky');
});

test('a bolt that kills is the run\'s kill, and every landing of one', () => {
  const field = scriptedRun(431);
  setWeapon(field, 'arc');
  const bodies = bodyLine(field, CHAIN.jumps + 1, 60, 60);
  // Just under the lightest landing in a chain (the last one, at `decay` to the power of
  // `jumps` of a shot), so what the test is checking is that each of the four bodies the bolt
  // landed on is credited to the run - score, kills and shards and all - and not that the
  // first one died.
  for (const body of bodies) body.hp = 0.5;

  const bolts = pull(field);

  assert.equal(field.kills, CHAIN.jumps + 1, 'every landing took its body');
  assert.ok(field.score > 0, 'and every one of them scored');
  assert.equal(bolts.length, CHAIN.jumps + 1);
});

test('a landing throws the body it landed on', () => {
  // The chain has no mass, but it is not silent either: a small shove on away from wherever
  // the bolt came in from is what makes four landings read as one thing travelling. Small on
  // purpose - session 33 found what a heavy shove does to a short-range gun's own crowd, and
  // this gun is no less short-ranged for aiming itself.
  const field = scriptedRun(432);
  setWeapon(field, 'arc');
  const ship = field.player;
  const body = enemyAt('drifter', ship.x, ship.y - 120, IMMORTAL);
  const home = { x: body.x, y: body.y };

  pull(field);
  let furthest = 0;
  for (let i = 0; i < Math.round(0.5 / STEP); i++) {
    stepTheWorld({});
    furthest = Math.max(furthest, Math.hypot(body.x - home.x, body.y - home.y));
  }
  const pulseShot = (() => {
    const other = scriptedRun(433);
    setWeapon(other, 'pulse');
    const body2 = enemyAt('drifter', other.player.x, other.player.y - 120, IMMORTAL);
    const was = { x: body2.x, y: body2.y };
    fire(other);
    let best = 0;
    for (let i = 0; i < Math.round(0.5 / STEP); i++) {
      stepTheWorld({});
      best = Math.max(best, Math.hypot(body2.x - was.x, body2.y - was.y));
    }
    return best;
  })();

  assert.ok(furthest > 0, 'the body was moved: ' + furthest.toFixed(2) + ' px');
  assert.ok(furthest < pulseShot * 3,
    'and it is a jolt rather than a shove: ' + furthest.toFixed(1) + ' px against a pulse '
    + 'shot\'s ' + pulseShot.toFixed(1));
});

test('four landings are one pull and one sound', () => {
  const field = scriptedRun(434);
  setWeapon(field, 'arc');
  bodyLine(field, CHAIN.jumps + 1, 60, 60);

  const cues = cuesOfPull(field);
  assert.equal(cues.length, 1, 'one crackle, however many bodies were landed on');
  assert.ok(cues[0].freq > PULSE.sound.base,
    'and it is the high one - a discharge, not a gunshot');
});

test('the fire rate line is on the chain like it is on a trigger', () => {
  const field = scriptedRun(435);
  setWeapon(field, 'arc');
  const ship = field.player;
  const wanted = CHAIN.jumps + 1;
  bodyLine(field, CHAIN.jumps + 1, 60, 60);

  const pulls = [];
  for (let i = 0; i < 200 && pulls.length < 3; i++) {
    const before = field.arc.bolts.count;
    stepTheWorld({ firing: true });
    if (field.arc.bolts.count > before) pulls.push(field.arc.bolts.count - before);
  }

  assert.equal(pulls.length, 3, 'three pulls in the window');
  for (const one of pulls) assert.equal(one, wanted, 'each of them a whole chain');
  assert.ok(Math.abs(ship.fireTimer - 1 / ARC.fireRate) < 1e-9, 'and the wait is the gun\'s own');
});

test('the measurement: weaker on one body, flat with range, better on a crowd', () => {
  // The trade this gun is, measured the way the scatter's was (session 33) rather than read
  // off PLAN. Three things had to come out this way or the weapon has no reason to be picked:
  //
  //   * a bolt at one body costs less than a pulse shot at it, because a chain that also hit
  //     as hard as the gun it is chained off would simply be the best gun;
  //   * what it costs does not fall off with range, because the bolt does not travel and
  //     cannot miss - which is the thing it is paid for, and the reason its per-landing weight
  //     is where it is rather than at PLAN's four fifths of a pulse shot;
  //   * and on the three bodies a fleeing ship really has around it (session 33's near field)
  //     it is worth more than the pulse, which is the only honest place for a weapon whose
  //     value comes from the crowd and not from the aim.
  const seconds = 6;

  const close = loneBodyRate(60, seconds, 'arc');
  const closePulse = loneBodyRate(60, seconds);
  assert.ok(close < closePulse, 'one body costs less than the pulse: ' + close.toFixed(2)
    + ' against ' + closePulse.toFixed(2));

  const far = loneBodyRate(200, seconds, 'arc');
  assert.ok(Math.abs(far - close) / close < 0.1,
    'and it costs the same from 200 px as from 60, because it cannot miss: ' + far.toFixed(2));

  const out = loneBodyRate(CHAIN.reach + 200, seconds, 'arc');
  assert.equal(out, 0, 'and nothing at all past the reach');

  // The near field: three bodies at the distances a press keeps, one of them due north.
  let arcTotal = 0;
  let pulseTotal = 0;
  for (const id of ['arc', 'pulse']) {
    for (let seed = 11; seed <= 16; seed++) {
      const field = scriptedRun(seed);
      if (id === 'arc') setWeapon(field, 'arc');
      const ship = field.player;
      const knot = [90, 150, 200].map((radius, i) => enemyAt('swarmling',
        ship.x + Math.cos(-Math.PI / 2 + i * 2.1) * radius,
        ship.y + Math.sin(-Math.PI / 2 + i * 2.1) * radius, IMMORTAL));
      const before = knot.reduce((sum, body) => sum + body.hp, 0);
      const steps = Math.round(seconds / STEP);
      for (let i = 0; i < steps; i++) {
        for (const body of knot) {
          body.ix = 0; body.iy = 0;
        }
        stepTheWorld({ firing: true });
      }
      const rate = (before - knot.reduce((sum, body) => sum + body.hp, 0)) / seconds;
      if (id === 'arc') arcTotal += rate; else pulseTotal += rate;
    }
  }

  assert.ok(arcTotal / 6 > pulseTotal / 6 * 1.3,
    'on the crowd a ship is standing in, the bolt is the heavier gun: '
    + (arcTotal / 6).toFixed(2) + ' against ' + (pulseTotal / 6).toFixed(2));
});
