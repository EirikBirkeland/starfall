// The nova (PLAN 3.2, taken as an upgrade line): a ring of damage that leaves the ship
// and travels outwards.
//
// It is the second thing in the game that hurts the crowd without being fired at it -
// the orbitals are the first - and the two are deliberately opposite. The orbital ring
// is a wall at 64 px that grinds continuously at whatever is standing in it; a nova
// front is a one-off that goes out ten times as far, hurts every body it passes, and
// throws the whole lot of them off the ship. One is a wall, the other is a shrug.
//
// Three decisions live here, and each of them has a test:
//
//   **The front is a place, not a burst.** It is born at the ship and its radius grows
//     at the line's own speed until it reaches `reach` and is gone. A body is hurt when
//     the front *crosses* it - it was outside the ring on the last step and inside it on
//     this one - which is what lets the light you watch be the damage you get: the ring
//     is never painted further out than the crowd it has already hurt, and it never
//     hurts anything the ring has not visibly reached (`game/blast.js`, by contrast, is
//     instant: the bomber's zone was drawn round it while it lived, so its circle could
//     be paid out all at once).
//
//   **A body is crossed once and only once.** The test is `was outside, is inside`, and
//     the front is monotonically outward, so nothing needs a memory of who it has
//     already bitten and nothing allocates on a step: a body that has been crossed is
//     inside the ring for the rest of its life and can never be crossed again. That
//     holds because the front grows far faster than anything in the arena can run
//     outwards - the fastest thing in the crowd is a darter at 230 px/s against a front
//     at 900 - so "outside again" is not a state a body can reach. It also means a body
//     that walks *into* the ring after the front went by is not hurt, which is the front
//     being honest rather than being an aura the ship drags around with it.
//
//   **A hit is one shot of the ship's own gun**, multiplied by whatever the damage line
//     makes a shot worth, exactly like an orbital bite (game/orbitals.js). It has to be:
//     this is a line that *adds* a second source of damage instead of multiplying the
//     gun, and a flat number loses that race as soon as the gun is twice what it was.
//     Session 31 measured the flat version of that mistake on the ring.
//
// It runs after the crowd has walked, so a front bites where bodies ended up rather than
// where the collision grid last saw them - the same reason `game/orbitals.js` and
// `game/shields.js` walk the crowd directly. The crowd is capped (`waves.maxBodies`) and
// a front is alive for a quarter of a second, so this is one pass over at most a hundred
// bodies every few seconds.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { dist2 } from '../core/math.js';
import { damageEnemy } from './enemies.js';
import { ignite } from './burn.js';
import { chill } from './chill.js';
import { burst, shakeIt, spray } from './effects.js';
import { cueBeep } from './cues.js';
import { gainOf, pulsesOf } from './upgrades.js';

/**
 * The shape of a front. `r` is how far out it has got and `pr` how far out it was when
 * the step began - the pair the renderer paints between (render/interp.js) and the pair
 * the crossing test below reads. `weight` is what a body it crosses loses, baked when
 * the front is born so a card taken while one is in the air does not rewrite a front in
 * flight, same as a bullet's `dmg`.
 */
export function makeFront() {
  return { x: 0, y: 0, r: 0, pr: 0, weight: 0 };
}

/** The scratch list of bodies one front has crossed this step. Never grows past the crowd. */
const crossed = [];

/** Has this front's ring passed over this body during this step? */
function isCrossed(front, enemy) {
  const by = dist2(enemy.x, enemy.y, front.x, front.y);
  if (by > front.r * front.r) return false;
  // The centre is inside now. It was outside when the ring was where it was a step ago,
  // or it was already inside and the ring went by some time ago - only the first of
  // those is a crossing. `px`/`py` is where the body stood when the step began, which is
  // exactly when `pr` was the ring.
  if (front.pr === 0) return true;    // the ring was born here, so it has crossed
                                      // everything inside it, including anything standing
                                      // exactly on the ship
  return dist2(enemy.px, enemy.py, front.x, front.y) > front.pr * front.pr;
}

/**
 * Throw one front off the ship. Its centre is fixed where the ship stood: a front is a
 * thing that happened to the arena, not a thing that follows the ship around, and flying
 * away from your own nova is a real choice the line hands back to you.
 */
function throwFront(world, spec) {
  const ship = world.player;
  const front = world.nova.fronts.spawn();
  front.x = ship.x;
  front.y = ship.y;
  front.pr = 0;
  front.r = 0;
  front.weight = BALANCE.bullets.damage * gainOf(world, 'damage') * spec.weight;

  const birth = spec.birth;
  burst(world, ship.x, ship.y, PALETTE.player, birth.count, birth.speed, birth.life);
  shakeIt(world, spec.shake);
  const sound = spec.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * One body the front has just come round: hurt, shoved outwards, and it throws sparks
 * away from the ship on its way, so a ring crossing a crowd reads as a wave of bodies
 * being pushed as much as a wave of damage. `byPlayer` is true, so everything a front
 * kills - including a bomber whose blast then takes somebody else with it - is the
 * run's doing, all the way down the chain.
 */
function bite(world, front, enemy, spec) {
  const dx = enemy.x - front.x;
  const dy = enemy.y - front.y;
  const dist = Math.hypot(dx, dy) || 1;
  enemy.ix += (dx / dist) * spec.shove;
  enemy.iy += (dy / dist) * spec.shove;

  const sparks = spec.bite;
  const heading = Math.atan2(dy, dx);
  spray(world, enemy.x, enemy.y, PALETTE.spark, sparks.count, sparks.speed, sparks.life,
    heading, sparks.spread);

  // And everything the front came over is left going slower than it was (game/chill.js), which
  // is the part of the wave that lasts longer than the ring you watched. Before the hull comes
  // off, like every other door: the front that kills a body is the cold it dies with.
  chill(world, enemy);
  // Whatever the front came over is alight afterwards, killed or not (game/burn.js).
  damageEnemy(world, enemy, front.weight, true);
  ignite(world, enemy);
}

/**
 * The front's one step: grow it, find out whose centres it came over, and hurt them.
 *
 * The crowd is picked out first and hurt afterwards for the same reason `game/blast.js`
 * does it that way: hurting it can start another blast, and that splices the crowd under
 * whatever loop is walking it.
 */
function stepFront(world, front, spec, dt) {
  front.pr = front.r;
  front.r = Math.min(front.r + spec.speed * dt, spec.reach);

  const crowd = world.enemies;
  crossed.length = 0;
  for (let i = 0; i < crowd.length; i++) {
    const enemy = crowd[i];
    if (enemy.hp > 0 && isCrossed(front, enemy)) crossed.push(enemy);
  }
  for (let i = 0; i < crossed.length; i++) {
    // A front crossed earlier in this list may have set off a bomber that killed this
    // one on the way out. Dead things are not hurt twice, and one that was would pay out
    // its score and its shards twice.
    if (crossed[i].hp > 0) bite(world, front, crossed[i], spec);
  }
  crossed.length = 0;
}

/**
 * One step of the nova: grow the fronts already in the air, then throw another one if
 * the cycle says it is time.
 *
 * The cycle is PLAN's eight seconds and a rank buys another front inside it, so the wait
 * is `cycle / fronts` and rank one is exactly PLAN's "every 8 s". A rank taken part way
 * through a wait leaves that wait alone and shortens the next one, which is the honest
 * order: the card cannot reach back into time it has already spent counting.
 */
export function updateNova(world, dt) {
  const spec = BALANCE.upgrades.nova;
  const nova = world.nova;
  const fronts = nova.fronts;

  // Downwards, because a front that reaches its rim is dropped into the drawer.
  for (let i = fronts.count - 1; i >= 0; i--) {
    const front = fronts.items[i];
    stepFront(world, front, spec, dt);
    if (front.r >= spec.reach) fronts.killAt(i);
  }

  const perCycle = pulsesOf(world);
  if (perCycle === 0) {
    // Nothing is counted down while the line is untaken, so the front a card buys is the
    // first one out: take NOVA and the room goes off on the next step.
    nova.wait = 0;
    nova.beat = 0;
    return;
  }

  nova.beat = spec.cycle / perCycle;
  nova.wait -= dt;
  if (nova.wait > 0) return;
  nova.wait = nova.beat;
  throwFront(world, spec);
}

/**
 * Put the nova back to nothing. The fronts go with the ranks, and a front left over from
 * the last run would hang in the sky behind the title until the next run's first step.
 */
export function resetNova(world) {
  world.nova.fronts.clear();
  world.nova.wait = 0;
  world.nova.beat = 0;
}
