// Magnetar (PLAN 3.5): the shards the ship picks up charge the field round it, and when the
// field is full it lets go - every body standing in the field loses as many shots of the ship's
// own gun as there are ranks.
//
// This is the fourth thing in the game that adds damage instead of multiplying the gun (the
// orbital ring, the nova and the ship's own fire are the other three) and it is the only one of
// the four that is paid for by *picking something up*. That is the whole identity of the line and
// everything below follows from it: the field's rhythm is the run's own loot, so the card is
// worth most to a ship that flies back over its own battlefield and least to one that runs.
//
// Five decisions live here, and each of them has a test:
//
//   **The field is a bank and not a timer.** Nothing in this file counts seconds. The crack
//     happens when the shards come in, at one crack per `cost` of them, which is what makes the
//     line's rate the run's collection rate and not a beat the ship keeps whether or not anything
//     is happening. It also means there is nothing to wait for and nothing to waste: a shard picked
//     up in a quiet moment is charged for the next crowded one, and the bank carries its remainder
//     from one crack to the next, so a large shard is worth six and not "one, rounded down".
//
//   **One crack per step, however full the bank is.** A magnet pile arriving at once is twenty
//     shards in one step, and paying all twenty out in the same step would be twenty rings, twenty
//     sounds and twenty discharges in a single frame. One per step spreads it over the next few
//     steps, which at 120 Hz is still a rattle a fraction of a second long - and a rattle is what
//     walking into a pile should look like.
//
//   **The field is a place, and the whole of it is one number.** There is no object in the arena,
//     no pool, nothing to step and nothing that can be shot at - the same shape game/afterimage.js
//     chose for its images. A crack is an event inside one step, like game/blast.js: it happens,
//     it leaves light behind as effects, and it is gone.
//
//   **A crack is not a hit.** It takes hull off a body and gives it nothing else: no frost
//     (game/chill.js) and no fire (game/burn.js), which is the one thing every other source of the
//     ship's own damage hands on as it goes. The reason is the rate. Burn and chill are wired to
//     what the gun lands on a body, and a gun is a few pulls a second; the field cracks about once
//     a second whatever the rank, so a crack that frosted and lit would keep the whole near field
//     frozen and alight for free and would be doing those two cards' work for them. What it gives
//     besides hull is the rank-3 shard, below.
//
//   **The light runs inwards, and it starts at exactly `reach`.** A nova front travels, so the ring
//     you watch is the damage on its way out (game/nova.js). A crack is instant, so the only
//     honest light is one born at the radius that was actually hurt and collapsing back to the
//     ship: it may run *in* past the centre of the field but it never claims a wider circle than
//     the crowd it came round, and never a smaller one either.
//
// Nothing here spends the logic stream except the rank-3 shard, and that goes through the same
// `dropShards` every other drop goes through. The field's arithmetic - the bank, the cost, the
// reach, the weight - is pure, and a run that never takes the card is exactly as reproducible as
// one that does.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { TAU, dist2 } from '../core/math.js';
import { burst, ring, shakeIt, spray } from './effects.js';
import { cueBeep } from './cues.js';
import { damageEnemy } from './enemies.js';
import { dropShards } from './pickups.js';
import { crackShotsOf, gainOf, rankOf } from './upgrades.js';

/**
 * The whole state of the line: how many shards' worth the field is holding. A fraction is a
 * perfectly good charge - a large shard is worth six of them and a run may be three and a half
 * deep into the next crack - and there is nothing else to remember, because a crack is over in the
 * step it happens and the field keeps no record of who it came round.
 */
export function newMagnetar() {
  return { charge: 0 };
}

/** Empty the field, with the rest of the run's resetting. Last run's loot is not this run's. */
export function resetMagnetar(world) {
  world.magnetar.charge = 0;
}

/** Has this run taken the line at all. Nothing is drawn and nothing is banked until it has. */
export function hasMagnetar(world) {
  return rankOf(world, 'magnetar') > 0;
}

/**
 * How many shards' worth the field is holding, for the frame that draws it (render/entities.js).
 * Clamped to 1 because a magnet pile can put five cracks' worth in the bank at once and the ring
 * has no way to say more than whole (see the overfull case in `drawFieldRing`).
 */
export function chargeOf(world) {
  if (!hasMagnetar(world)) return 0;
  return Math.min(1, world.magnetar.charge / BALANCE.upgrades.magnetar.cost);
}

/** Whether the bank has paid for a crack the next step will let go. The overfull ring reads this. */
export function isPrimed(world) {
  return hasMagnetar(world) && world.magnetar.charge >= BALANCE.upgrades.magnetar.cost;
}

/**
 * One shard came in, worth `worth` of the ordinary ones. Called by `updateShards`
 * (game/pickups.js) at the moment the shard is collected - the same moment it pays its XP and its
 * score - because the shard is spent by being collected and there is no other door it could come
 * in by.
 *
 * A run that has not taken the line banks nothing at all, which is not a punishment but the
 * absence of the field: take the card and the next four shards fill it.
 */
export function feedField(world, worth) {
  if (!hasMagnetar(world)) return;
  world.magnetar.charge += worth;
}

/** The scratch list of bodies one crack came round. Never grows past the crowd. */
const caught = [];

/**
 * Let the field go. Every body inside `reach` of where the ship stands loses `crackShotsOf` shots
 * of the ship's own gun - multiplied by the damage line exactly as a drone's bite and a nova front
 * are, because this is an added source and a flat number loses that race as soon as the gun is
 * twice what it was (session 31's lesson, and game/nova.js has the long version of it).
 *
 * The crowd is picked out first and hurt afterwards, the way game/nova.js and game/blast.js do it:
 * hurting a body can set off a bomber, and that splices the crowd under whatever loop is walking
 * it. A body that came apart in that chain is not hurt again - it would come out of the crowd
 * twice and pay its score twice - so every hit here is still asked whether the body is up.
 */
function crack(world, spec) {
  const ship = world.player;
  const weight = crackShotsOf(world) * BALANCE.bullets.damage * gainOf(world, 'damage');
  const light = spec.light;

  // The field, collapsing in from exactly the radius it is hurting.
  ring(world, ship.x, ship.y, PALETTE.shardLine, spec.reach, light.ring.speed, light.ring.life);
  // The rim, falling inwards: the loot spent, going back where it came from.
  const rim = light.infall;
  const turn = world.time * rim.turn;
  for (let i = 0; i < rim.points; i++) {
    const a = turn + (i / rim.points) * TAU;
    spray(world, ship.x + Math.cos(a) * spec.reach, ship.y + Math.sin(a) * spec.reach,
      PALETTE.shard, rim.count, rim.speed, rim.life, a + Math.PI, rim.spread);
  }
  // And the ship, which is where it all ended up.
  ring(world, ship.x, ship.y, PALETTE.shardLine,
    light.flash.radius, light.flash.speed, light.flash.life);
  burst(world, ship.x, ship.y, PALETTE.playerLine,
    light.flash.burst.count, light.flash.burst.speed, light.flash.burst.life);
  shakeIt(world, spec.shake);
  const sound = spec.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);

  const crowd = world.enemies;
  const reach2 = spec.reach * spec.reach;
  caught.length = 0;
  for (let i = 0; i < crowd.length; i++) {
    const enemy = crowd[i];
    if (enemy.hp > 0 && dist2(enemy.x, enemy.y, ship.x, ship.y) <= reach2) caught.push(enemy);
  }

  const seeds = rankOf(world, 'magnetar') >= spec.seed.at;
  for (let i = 0; i < caught.length; i++) {
    const enemy = caught[i];
    if (enemy.hp <= 0) continue;
    const died = damageEnemy(world, enemy, weight, true);
    // The third rank and after: the field pays its own way. Only a kill the crack itself landed
    // seeds anything, and only one shard, so this is momentum and not a mint (BALANCE.upgrades
    // .magnetar.seed has the arithmetic on what it adds to a run's income).
    if (died && seeds) dropShards(world, enemy.x, enemy.y, spec.seed.count);
  }
  caught.length = 0;
}

/**
 * One step of the field. It does one thing: if the bank has paid for a crack, spend the price of
 * one and let it go.
 *
 * It runs after `updateShards` (game/world.js) so a shard picked up this step is charged for a
 * crack this step - the mint flying in and the field letting go are one event to the eye - and
 * after everything that walks, so a crack comes round the crowd where it ended up rather than
 * where the collision grid last saw it, which is the same reason the orbitals, the nova and the
 * fire are where they are. It cannot end the run by itself, but a body it kills can (a bomber),
 * and that is the nova's story too, told one step before the arc has to fade.
 */
export function updateMagnetar(world) {
  if (!hasMagnetar(world)) return;
  const spec = BALANCE.upgrades.magnetar;
  const field = world.magnetar;
  if (field.charge < spec.cost) return;
  field.charge -= spec.cost;
  crack(world, spec);
}
