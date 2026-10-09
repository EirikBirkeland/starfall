// The minefield (PLAN 3.2's mines, taken as an upgrade line): the ship drops mines as it
// runs, and a body that walks into one pays for it.
//
// This is the only line in the deck that is not attached to the ship. Everything else that adds
// damage happens at the ship or in a ring round it - the orbital wall at 64 px, the nova front
// going out from the hull, the magnetar field crackling at the near field, all of them read by
// wherever the ship happens to be this step. A mine keeps happening where the ship *was*, which
// is the one place in this game that the arena remembers, and the one piece of geometry a
// chasing crowd has to walk through to keep reaching you. It is the line that turns running away
// into laying something down.
//
// Four decisions live here, and each of them has a test:
//
//   **A mine is a place, not a body.** It is not in `world.enemies`, it has no hull, nothing can
//     shoot it, nothing can shove it and nothing can set it off early - not a bullet, not a
//     bomber's blast, not the ship. That is the same contract game/afterimage.js signed for its
//     ghosts and for the same reason: a placed thing that can be interacted with is a second
//     thing to aim and a second thing to lose, and the two seconds between dropping a mine and
//     its going off are the two seconds the card sold you.
//
//   **It never hurts the ship, and its own crowd is the only thing that can set it off.** The
//     mine is drawn as a circle of *the crowd's* danger and the ship drives straight over its own
//     mines all game long. `game/blast.js` is the one place in the deck that hurts everybody in
//     the circle - it is a death, and a death is nobody's weapon - so a mine has its own
//     detonation here rather than a flag on that file, and the difference is not cosmetic: a
//     mine's round is a shell of the ship's own gun, so it frosts and lights what it comes round
//     exactly as a drone bite and a nova front do (game/chill.js, game/burn.js). The magnetar's
//     crack is the one source that does not, and it does not because of how often it fires; a
//     mine goes off on the nova's scale and not the field's.
//
//   **The ring you can see is the trigger, and the blast is never smaller than the ring you
//     saw.** `trigger` is the reach a body has to come inside to light the fuse; `radius` is what
//     goes off afterwards and it is strictly bigger, so the mine is generous in exactly the
//     direction a promise has to be. The two numbers are different on purpose - a body brushing
//     the rim of a mine should be caught by the whole of it, which is what makes a mine a
//     shotgun rather than a firecracker - and the balance `radius > trigger` is a test, not a
//     comment.
//
//   **It winds up before it is live, and that is what makes it a trap and not a gun.** A mine is
//     dropped *on* the ship, and a chase is usually sitting on its tail, so a mine that was live
//     the moment it landed would be a rear-facing turret on a fixed three-second beat and the
//     card would be orbitals again. `arm` is the moment it is not live yet: the ring you watch
//     grows out to its full reach while it winds, and a body that was already standing there has
//     to still be there when it finishes. What the card is buying after that is ground, not rate.
//
// A mine that is never walked into goes out on its own clock, quietly and harmlessly: that is the
// price of the line and the reason its rate can be generous. `BALANCE.upgrades.mines` carries
// every number and the measurement each one came from.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { Pool } from '../core/pool.js';
import { dist2 } from '../core/math.js';
import { damageEnemy } from './enemies.js';
import { ignite } from './burn.js';
import { chill } from './chill.js';
import { burst, ring, shakeIt, spray } from './effects.js';
import { cueBeep } from './cues.js';
import { gainOf, minesPerDropOf, rankOf } from './upgrades.js';

/**
 * The shape of one mine. It does not move, so it has no velocity and no `px`/`py` - there is
 * nothing for the renderer to interpolate between, and a recycled mine that remembered a
 * previous life's previous position would be painted in two places at once. `arm` counts down
 * while it winds up, `life` while it waits, and `fuse` is -1 until something walks into the ring
 * and goes from there to zero, at which point it goes off.
 */
export function makeMine() {
  return { x: 0, y: 0, arm: 0, life: 0, fuse: -1 };
}

/**
 * The field: the mines standing in the arena, the wait until the next row falls out, and three
 * counters a headless run reads to see the line at all - `dropped` for every mine laid, `blown` for
 * the ones that went off rather than going out, and `hit` for the bodies those blasts actually came
 * round. The ratios between them are the line's whole story, and none of the three can be worked out
 * from the arithmetic: a field that drops 1,430 mines, blows 1,097 of them and comes round 1,214
 * bodies is a line that catches about one body a blast, which is what the measurement in
 * BALANCE.upgrades.mines found and what the weight was priced on.
 */
export function newMines() {
  return { laid: new Pool(makeMine), wait: 0, dropped: 0, blown: 0, hit: 0 };
}

/** Put the field back to nothing, with the rest of the run's resetting. */
export function resetMines(world) {
  world.mines.laid.clear();
  world.mines.wait = 0;
  world.mines.dropped = 0;
  world.mines.blown = 0;
  world.mines.hit = 0;
}

/** Has this run taken the line at all. Nothing is asked or painted until it has. */
export function hasMines(world) {
  return rankOf(world, 'mines') > 0;
}

/**
 * Which way the fallout goes: straight back along the way the ship was last going. The velocity
 * is the honest answer while the ship is moving - a mine is what the ship drops out of its own
 * wake - and the nose is the honest answer when it is not, because "behind" only stops meaning
 * anything once the ship has stopped meaning a direction at all.
 */
function falloutOf(ship, spec) {
  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed > spec.drifting) return { x: -ship.vx / speed, y: -ship.vy / speed };
  return { x: -Math.cos(ship.angle), y: -Math.sin(ship.angle) };
}

/**
 * Let the ship drop one row of mines: `minesPerDropOf` of them, spaced out behind it along the
 * way it was going. Spacing is what a rank of this line buys, so it is the thing that has to read
 * as ground and not as a stack - one mine is a point the chase can walk past, five of them are a
 * stretch of road it cannot (BALANCE.upgrades.mines.gap has the arithmetic).
 */
function layDrop(world, spec) {
  const ship = world.player;
  const field = world.mines;
  const back = falloutOf(ship, spec);
  const count = minesPerDropOf(world);

  for (let i = 0; i < count; i++) {
    const mine = field.laid.spawn();
    mine.x = ship.x + back.x * i * spec.gap;
    mine.y = ship.y + back.y * i * spec.gap;
    mine.arm = spec.arm;
    mine.life = spec.life;
    mine.fuse = -1;
    field.dropped++;

    // The ring is not painted here - the mine's own growing ring is drawn out of `arm`
    // (render/entities.js) - but the place it landed is marked with one small light, so a drop
    // behind the ship is visible even when the ship is not looking at it.
    ring(world, mine.x, mine.y, PALETTE.mineCore,
      spec.landed.ring.radius, spec.landed.ring.speed, spec.landed.ring.life);
  }

  // One sound for the row and not one for every mine in it: at the top of the line a drop is five
  // mines and the mix has no voice limiting yet (milestone 7).
  const sound = spec.landed.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * The closest body standing inside this mine's reach, or null. `reach` is the drawn ring plus the
 * body's own skin, which is what makes the circle on the floor the honest edge of the thing: a
 * body whose outline touches it has walked into the mine, wherever its middle happens to be.
 *
 * The crowd is walked directly rather than asked of the collision grid, for the same reason
 * game/orbitals.js walks it: the grid holds the crowd as it was before this step's walking, and a
 * mine should go off for where a body actually ended up. At the top of the line that is fifteen
 * mines over a capped crowd, which is a few thousand compares a step; if a performance pass ever
 * wants them back the grid is the answer and this comment is the note on why it is not used.
 */
function preyNear(world, mine, spec) {
  const crowd = world.enemies;
  for (let i = 0; i < crowd.length; i++) {
    const enemy = crowd[i];
    const reach = enemy.r + spec.trigger;
    if (dist2(enemy.x, enemy.y, mine.x, mine.y) <= reach * reach) return enemy;
  }
  return null;
}

/**
 * Light a fuse: the tell that the mine has somebody. The fuse is short - shorter than anything in
 * the arena can run out of the blast - so it is a tell and not a get-out, which is what keeps a
 * mine a trap rather than a slow explosion. From this step the mine no longer counts its life
 * down: it either goes off or it goes out, and once the fuse is lit going out is not on the table.
 */
function lightFuse(world, mine, spec) {
  mine.fuse = spec.fuse;
  const tell = spec.fused;
  ring(world, mine.x, mine.y, PALETTE.mineCore,
    tell.ring.radius, tell.ring.speed, tell.ring.life);
  const sound = tell.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * One mine, coming apart. Everything inside `radius` - measured from a centre, exactly as the
 * blast ring is drawn - loses hull, is thrown outwards, and is left frosted and alight like
 * anything the ship's own gun has come round. `byPlayer` is true because it is the ship's own
 * ordnance: a mine that finishes a bomber is the run's kill all the way down that chain.
 *
 * The crowd is picked out before any of it is hurt, because hurting it can start a bomber's blast
 * and that happens inside this call (game/blast.js), and a `victims` list is allocated here on
 * purpose: a mine going off is something that happens now and then, not a per-frame loop.
 */
function detonate(world, mine, spec) {
  world.mines.blown++;

  ring(world, mine.x, mine.y, PALETTE.blastFlash,
    spec.blast.ring.radius, spec.blast.ring.speed, spec.blast.ring.life);
  burst(world, mine.x, mine.y, PALETTE.mineCore,
    spec.blast.flash.count, spec.blast.flash.speed, spec.blast.flash.life);
  shakeIt(world, spec.blast.shake);
  const sound = spec.blast.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);

  const weight = BALANCE.bullets.damage * gainOf(world, 'damage') * spec.weight;
  const reach2 = spec.radius * spec.radius;
  const victims = [];
  for (let i = 0; i < world.enemies.length; i++) {
    const enemy = world.enemies[i];
    if (dist2(enemy.x, enemy.y, mine.x, mine.y) > reach2) continue;
    victims.push(enemy);
    const dist = Math.hypot(enemy.x - mine.x, enemy.y - mine.y) || 1;
    enemy.ix += ((enemy.x - mine.x) / dist) * spec.shove;
    enemy.iy += ((enemy.y - mine.y) / dist) * spec.shove;
  }

  const sparks = spec.blast.bite;
  for (let i = 0; i < victims.length; i++) {
    const enemy = victims[i];
    // A mine that went off earlier in this step may have brought this one down already, and one
    // body does not die twice: its score and its shards would be paid out twice.
    if (enemy.hp <= 0) continue;
    world.mines.hit++;
    const heading = Math.atan2(enemy.y - mine.y, enemy.x - mine.x);
    spray(world, enemy.x, enemy.y, PALETTE.spark, sparks.count, sparks.speed, sparks.life,
      heading, sparks.spread);
    // Frost and fire before and after the hull comes off, exactly as game/nova.js pays a front out:
    // the mine that kills a body is the cold and the flame it dies with.
    chill(world, enemy);
    damageEnemy(world, enemy, weight, true);
    ignite(world, enemy);
  }
}

/**
 * One mine, going out unwalked-into: a small light going out at the place it lay, and nothing
 * else. It is not a failure of the card - a minefield whose every mine went off would be a gun -
 * and the sound is quiet for the same reason the light is small: the arena should not be noisy
 * about the thing the player did not get paid for.
 */
function goOut(world, mine, spec) {
  const gone = spec.gone;
  ring(world, mine.x, mine.y, PALETTE.mineZone,
    gone.ring.radius, gone.ring.speed, gone.ring.life);
  const sound = gone.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * One step of the field: every mine winds up, waits, lights or goes out; then the ship drops
 * another row if the beat says it is time. Called whether or not the line was taken - with no
 * mines standing and no ranks that is two compares and a return.
 *
 * Like game/orbitals.js and game/nova.js this runs after the crowd has walked, so a fuse is lit
 * for where a body ended up. A mine can end the run - its blast kills a bomber, the bomber's own
 * blast reaches the ship - which is handled the same way a drone bite handles it, by the state
 * check the step loop already makes and not by anything here.
 */
export function updateMines(world, dt) {
  const spec = BALANCE.upgrades.mines;
  const laid = world.mines.laid;

  // Downwards, because a pool drops the last live mine into the hole this one leaves
  // (core/pool.js) - and a blast that comes apart inside this loop cannot have touched the pool,
  // because nothing but a mine can set one off.
  for (let i = laid.count - 1; i >= 0; i--) {
    const mine = laid.items[i];

    if (mine.fuse >= 0) {
      mine.fuse -= dt;
      if (mine.fuse <= 0) {
        detonate(world, mine, spec);
        laid.killAt(i);
      }
      continue;
    }

    if (mine.arm > 0) mine.arm = Math.max(0, mine.arm - dt);
    // Only a live mine has eyes, and a body standing there when the winding finishes is the one
    // that is caught: the arm is what stops a mine from going off under the tail of the ship that
    // dropped it.
    if (mine.arm <= 0 && preyNear(world, mine, spec) !== null) {
      lightFuse(world, mine, spec);
      continue;
    }

    mine.life -= dt;
    if (mine.life <= 0) {
      goOut(world, mine, spec);
      laid.killAt(i);
    }
  }

  const perDrop = minesPerDropOf(world);
  if (perDrop === 0) {
    // Nothing counted down while the line was untaken, so the first mine a card buys falls out on
    // the very next step: take MINES and the road behind you starts being yours.
    world.mines.wait = 0;
    return;
  }

  world.mines.wait -= dt;
  if (world.mines.wait > 0) return;
  world.mines.wait = spec.cycle;
  layDrop(world, spec);
}

/**
 * How far a mine still has to wind, 1 the step it is dropped and 0 once it is live. The renderer
 * draws the ring growing out to its reach out of this, which is the only way the reach a body can
 * be caught at and the circle a player is shown are ever the same number.
 */
export function armingOf(mine) {
  const arm = BALANCE.upgrades.mines.arm;
  return arm <= 0 ? 0 : mine.arm / arm;
}

/** How near a live mine is to going out unwalked-into: 0 for most of its life, 1 as it stops. */
export function fadingOf(mine) {
  const spec = BALANCE.upgrades.mines;
  if (mine.fuse >= 0) return 0;
  return mine.life >= spec.fade ? 0 : 1 - mine.life / spec.fade;
}

/** How near a lit mine is to coming apart: 0 until the fuse is lit, then up to 1 as it goes. */
export function fusingOf(mine) {
  const spec = BALANCE.upgrades.mines;
  if (mine.fuse < 0) return 0;
  return 1 - mine.fuse / spec.fuse;
}
