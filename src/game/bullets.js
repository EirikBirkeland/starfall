// Bullets: travel, despawn, and the one test that matters, bullet against enemy.
//
// The hit test runs on the world's collision grid (core/grid.js): the crowd is
// filed into it once per step and every bullet asks it who is nearby, so a shot
// costs what is around it instead of the whole screen. Bullets themselves live in
// a pool - they are the most numerous thing in the game and nothing cares about
// their order.
//
// What a shot does when it lands is one of three things, and two of them are bought
// (game/upgrades.js): it is spent, it goes through the body it hit (pierce), or it turns
// on to another one (ricochet). Both of those lines are read where the hit happens,
// which means a bullet is allowed to survive a hit - so it carries its own memory of who
// it has already been through, and neither line can be paid out twice to the same body.

import { BALANCE } from './balance.js';
import { logic } from '../core/rng.js';
import { dist2 } from '../core/math.js';
import { PALETTE } from '../core/palette.js';
import { damageEnemy, rebuildEnemyGrid } from './enemies.js';
import { ignite } from './burn.js';
import { chill } from './chill.js';
import { widestEnemyRadius } from './kinds.js';
import { burst, spray } from './effects.js';
import { cueBeep } from './cues.js';

/**
 * The shape of a bullet. `shoot` in game/weapons.js writes every field, so nothing leaks
 * between shots.
 *
 * `speed`, `life` and `knock` are the weapon's, and `dmg` is the weapon's weight times
 * whatever the damage line was worth as the shot left. `pierce` is what the shot has left
 * of the pierce line when it leaves: one body past the first, per rank, and one of them
 * is spent on every body it goes through. `bounce` is the same for the ricochet line -
 * the turns it has left - and a turn is only taken when there is nothing left ahead of the
 * shot to go through. `charged` says the gun was loaded when the trigger moved, for the
 * whole flight of the shot (game/overcharge.js). `hits` is who it has already touched - a
 * shot at 620 px/s is inside a body for several steps and a passed-through body it kept
 * meeting would be shaved once per step otherwise - and it is also what stops a turned shot
 * coming back for a body it has already spent itself on.
 */
export function makeBullet() {
  return {
    x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
    life: 0, dmg: 0, knock: 0, pierce: 0, bounce: 0, charged: false, hits: [],
  };
}

/** The scratch list the grid fills, shared by every bullet in the step. */
const nearby = [];

/**
 * The scratch list a bounce asks the grid with. It has to be a second list: `nearby`
 * holds the broad phase's answer for the bullet being walked, and a query into it part
 * way through would empty the list under the loop's feet.
 */
const withinReach = [];

/** The three answers to "what does this shot do next" (see `nextMoveFor`). */
const PASS_ON = 'pass';
const TURN_OFF = 'turn';
const SPENT = 'spent';

/** Has this shot already been through this body? Small list, walked by identity. */
function alreadyThrough(bullet, enemy) {
  for (let i = 0; i < bullet.hits.length; i++) {
    if (bullet.hits[i] === enemy) return true;
  }
  return false;
}

/**
 * Where the shot that has just spent a body goes next, written here and read by the
 * caller, because nothing allocates in a hit loop (PLAN section 2).
 */
const nextMove = { mode: SPENT, target: null };

/**
 * Decide what a shot does after a hit, out of what it has left to spend.
 *
 * A pass is only worth taking if there is something *ahead* to take it through: a shot
 * that ploughs on into empty sky spends its pass and its life in the same second, and the
 * turns it bought come to nothing - measured, a run with both lines maxed turned on 2% of
 * its hits, which is a card that does not fire. So when a shot may do either, one walk of
 * the neighbourhood answers both questions at once: the nearest body anywhere in reach is
 * what a turn would aim at, and whether any of them lies ahead is what makes going
 * straight worth it.
 *
 * A shot with only one of the two lines is untouched by all this, which is what keeps a
 * run that took one card getting exactly what that card sells.
 */
function nextMoveFor(world, bullet, spec) {
  nextMove.target = null;
  if (bullet.bounce <= 0) {
    // Either the plough line on its own, exactly as it was before turns existed, or
    // nothing at all. Either way there is no second body to look for.
    nextMove.mode = bullet.pierce > 0 ? PASS_ON : SPENT;
    return nextMove;
  }

  // The grid still holds this step's crowd - it is rebuilt once per step, above - and
  // asking it a question here is allowed only because the answer goes into a list of its
  // own. Nothing else may query while the hit loop is holding `nearby`.
  world.grid.queryCircle(bullet.x, bullet.y, spec.reach, withinReach);

  const speed = Math.sqrt(bullet.vx * bullet.vx + bullet.vy * bullet.vy) || 1;
  const hx = bullet.vx / speed;
  const hy = bullet.vy / speed;
  let nearest = null;
  let nearestBy = Infinity;
  let ahead = false;

  for (let i = 0; i < withinReach.length; i++) {
    const other = withinReach[i];
    if (other.hp <= 0 || alreadyThrough(bullet, other)) continue;
    const dx = other.x - bullet.x;
    const dy = other.y - bullet.y;
    // The line's reach, plus the body's own width: a query radius always has to cover
    // what it is asking about (core/grid.js).
    const reach = spec.reach + other.r;
    const d2 = dx * dx + dy * dy;
    if (d2 > reach * reach) continue;

    const dist = Math.sqrt(d2);
    if (dist < nearestBy) { nearestBy = dist; nearest = other; }
    // In front of it, within the line's cone: the dot of two unit vectors is the cosine
    // of the angle between them.
    if (dx * hx + dy * hy > spec.ahead * dist) ahead = true;
  }

  if (nearest === null) {
    // Nowhere to turn. Straight on if there is a pass to be flying on, spent if not; a
    // turn is never paid for on a body that was never there to be found.
    nextMove.mode = bullet.pierce > 0 ? PASS_ON : SPENT;
    return nextMove;
  }
  if (bullet.pierce > 0 && ahead) {
    nextMove.mode = PASS_ON;        // the column is still standing: that is the line aimed
    return nextMove;
  }

  nextMove.mode = TURN_OFF;
  nextMove.target = nearest;
  return nextMove;
}

/**
 * Turn a shot on to another body (PLAN 3.5's ricochet). A turn is a change of heading and
 * nothing else: the shot keeps its place and its speed, so a bounce reads as a glance off
 * the body it hit rather than as a new shot fired from where the first one ended. What it
 * pays is weight (`share`), and `life` is a fuse rather than a range, so a shot that keeps
 * turning can run out of time in the middle of a crowd and vanish. That is the deal.
 */
function turnOnto(world, bullet, spec, target) {
  const speed = Math.sqrt(bullet.vx * bullet.vx + bullet.vy * bullet.vy);
  const dx = target.x - bullet.x;
  const dy = target.y - bullet.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  bullet.vx = (dx / dist) * speed;
  bullet.vy = (dy / dist) * speed;
  bullet.bounce -= 1;
  bullet.dmg *= spec.share;

  // The sparks go the way the shot now goes, which is the only way to see that it turned
  // at all: the shot itself is one bright dot either side of the kink.
  spray(world, bullet.x, bullet.y, PALETTE.bullet, spec.turn.count, spec.turn.speed,
    spec.turn.life, Math.atan2(dy, dx), spec.turn.spread);
  const sound = spec.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

export function updateBullets(world, dt) {
  const spec = BALANCE.bullets;
  const impact = spec.impact;
  const sound = spec.impactSound;
  const margin = spec.despawnMargin;
  const right = world.arena.w + margin;
  const bottom = world.arena.h + margin;
  const bullets = world.bullets;
  const grid = world.grid;
  const pierce = BALANCE.upgrades.pierce;
  const ricochet = BALANCE.upgrades.ricochet;
  // How far a hit can possibly come from: the widest enemy there is, plus the
  // bullet's own reach. A query with it finds everything the exact test below
  // can hit, and nothing much further away than that.
  const broadPhase = widestEnemyRadius() + spec.hitRadius;

  rebuildEnemyGrid(world);

  // Downwards, because killing a bullet drops the last live one into its hole
  // and that one has already been stepped.
  for (let i = bullets.count - 1; i >= 0; i--) {
    const bullet = bullets.items[i];
    bullet.px = bullet.x;
    bullet.py = bullet.y;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    if (bullet.life <= 0 || bullet.x < -margin || bullet.x > right || bullet.y < -margin || bullet.y > bottom) {
      bullets.killAt(i);
      continue;
    }

    grid.queryCircle(bullet.x, bullet.y, broadPhase, nearby);
    // A shot with nothing left is spent by the first body it meets and the loop is done
    // with it. One that has a pass or a turn left keeps flying and may well find a second
    // body in the very same step, so the walk carries on over the candidates - which is
    // why nothing a kill can trigger is allowed to ask the grid a question here: `nearby`
    // holds this loop's answer until it is finished with it. (Nothing does: `blast` walks
    // the crowd directly, and it is the only thing a death goes on to do. `nextMoveFor`
    // asks the grid too, and it is the one exception, because it reads the answer into a
    // list of its own.)
    for (let n = 0; n < nearby.length; n++) {
      const enemy = nearby[n];
      // Something killed earlier in this step is still filed in the grid, and it
      // has already paid out its score, its shards and its split. Dead things
      // are not shootable.
      if (enemy.hp <= 0) continue;
      // A body this shot has already been through is not a target twice over.
      if (alreadyThrough(bullet, enemy)) continue;

      const reach = enemy.r + spec.hitRadius;
      if (dist2(bullet.x, bullet.y, enemy.x, enemy.y) > reach * reach) continue;

      bullet.hits.push(enemy);
      // The shove is the shot's own, because a scatter pellet and a pulse shot are not
      // the same thing arriving (BALANCE.weapons). `vx` rather than the speed: a shot
      // that has been turned is still shoving the way it is going.
      enemy.ix += bullet.vx * bullet.knock;
      enemy.iy += bullet.vy * bullet.knock;
      burst(world, bullet.x, bullet.y, BALANCE.kinds[enemy.type].color, impact.count, impact.speed, impact.life);
      // The cold goes on before the hull is taken off, because the hit that kills a body is the
      // hit that gets to be the cold it dies with (game/chill.js).
      chill(world, enemy);
      const killed = damageEnemy(world, enemy, bullet.dmg, true);
      // Every hit the ship lands sets the body alight, and that includes the one that brought
      // it down (game/burn.js): a body that died alight is what the third rank is for.
      ignite(world, enemy);
      // Only a hit that did not kill makes the impact sound; a kill plays its own.
      if (!killed) cueBeep(logic.range(sound.min, sound.max), sound.dur, sound.wave, sound.vol, sound.slide);

      // What the shot does next is one question with three answers (see `nextMoveFor`):
      //
      //   straight on (pierce): it goes through the body it hit, lighter for the trouble,
      //     which is what that card sold - the body *behind* the one aimed at;
      //   a turn (ricochet): it glances off on to the nearest body it has not been
      //     through, which is the body *beside* it, and pays more for the privilege;
      //   spent: out of the loop, and out of the air.
      const move = nextMoveFor(world, bullet, ricochet);
      if (move.mode === PASS_ON) {
        bullet.pierce -= 1;
        bullet.dmg *= pierce.share;
        const pass = pierce.pass;
        spray(world, bullet.x, bullet.y, PALETTE.bullet, pass.count, pass.speed, pass.life,
          Math.atan2(bullet.vy, bullet.vx), pass.spread);
      } else if (move.mode === TURN_OFF) {
        turnOnto(world, bullet, ricochet, move.target);
      } else {
        bullets.killAt(i);
        break;
      }
    }
  }
}
