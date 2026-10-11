// The arc (PLAN 3.2's third primary): a bolt that leaves the ship, finds a body of its
// own accord, and leaps from body to body, thinner every time it lands.
//
// This is the third thing in the game that hurts the crowd without being fired at it - the
// orbitals are the first, the nova the second - and it is the only one of the three that is
// a *gun*. What makes it a weapon rather than a second nova is that it costs the ship a
// rank on the trigger: it throws nothing into the air, it spends bodies.
//
// Three decisions live here, and each of them has a test:
//
//   **The bolt is instantaneous and the light outlives it.** A leap is a line drawn between
//     two bodies in one step: the damage is done on the spot, like `game/blast.js`, and what
//     is left behind is a bolt in a pool, whose only future is to fade. That is what makes
//     it lightning rather than a slow missile, and it is why the reach of this gun is a
//     distance you can watch rather than one you can lead: the light you see is the line the
//     damage already travelled, and it names every body that lost hull on it.
//
//   **The first body is the nearest one, whoever the player is pointing at.** The pulse is
//     the gun you aim and the scatter is the gun you point into; this one is the gun you
//     *fly*. It is the reason the arc exists at all - a weapon whose value goes up when the
//     crowd closes, which is the one thing the other two cannot do from across the arena -
//     and it is why the chain's decay has to be steep: a bolt that aimed itself and never
//     missed would be the best gun in the game at every range if it also hit as hard.
//
//   **A body is paid for once per pull, and the chain spends itself getting there.** The
//     bodies a pull has already bought are remembered, so a knot of four cannot be hit twice
//     by one pull and a bolt leaps *onwards* rather than back and forth. Each landing costs
//     `decay` of the one before (PLAN's "20% less damage per jump"), so a chain of four is
//     worth under three bodies' heads rather than four, and a pull at a crowd of one - the
//     common case, for a ship that is being chased - is worth what a single bolt is worth.
//
// It throws no bullets, which is the whole reason it is a module and not a number in
// `game/bullets.js`: the pierce and ricochet lines are a shot's business (they are read
// where a shot decides what to do after a body) and there is nothing here for them to
// apply to. The split line does reach it, because on this gun "one more projectile" means
// one more *chain* - see `strikeChain`, and BALANCE.upgrades.split for why that is the
// honest reading rather than a special case.
//
// Like `game/orbitals.js` and unlike `game/bullets.js` the search walks the crowd directly
// instead of asking the collision grid, for two reasons: the strike happens inside
// `updatePlayer`, before the step has rebuilt the grid, so the grid would be a step stale;
// and the crowd is capped (`waves.maxBodies`), so the whole of a pull is `jumps + 1` walks of
// at most a hundred bodies per chain - four at the plain gun, twenty-four with the split line
// maxed - which is nothing next to what the step already does.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { dist2, hypot } from '../core/math.js';
import { fx } from '../core/rng.js';
import { damageEnemy } from './enemies.js';
import { ignite } from './burn.js';
import { chill } from './chill.js';
import { spray } from './effects.js';
import { gainOf } from './upgrades.js';

/**
 * The shape of one bolt: the two ends of one leap, how far down the chain it is (`rank`,
 * which is what the renderer thins and dims by), how long it has left to be seen, and one
 * number the zig is worked out from.
 *
 * A bolt is a record of a flash that already happened, not a thing that travels, so it
 * keeps no px/py and the renderer paints it straight from the state it was left in - the
 * same arrangement as the cosmetic shockwave rings in render/effects.js. The ends are
 * snapshot positions: the bodies it was drawn between are already walking away.
 */
export function makeBolt() {
  return { x0: 0, y0: 0, x1: 0, y1: 0, rank: 0, life: 0, max: 0, seed: 0, charged: false };
}

/**
 * The bodies this pull has already bought, so that one pull cannot pay for a body twice.
 * Scratch, like the fan in game/weapons.js: one list per process, emptied per pull, and
 * never longer than the crowd.
 */
const struck = [];

function alreadyStruck(body) {
  for (let i = 0; i < struck.length; i++) {
    if (struck[i] === body) return true;
  }
  return false;
}

/**
 * The nearest body a bolt may still leap to from (x, y), or null.
 *
 * `world.enemies` holds only what is still alive - `killEnemy` takes a body out of the list
 * as it dies (game/enemies.js) - so a body that died earlier in this very chain cannot be
 * landed on again, and there is nothing to filter. `reach` covers centres plus the body's
 * own width, because a leap that lands on the near edge of a big body is a leap that landed.
 */
function preyNear(world, x, y, reach) {
  let found = null;
  let nearest = Infinity;
  for (let i = 0; i < world.enemies.length; i++) {
    const body = world.enemies[i];
    if (alreadyStruck(body)) continue;
    const room = reach + body.r;
    const by = dist2(x, y, body.x, body.y);
    if (by > room * room || by >= nearest) continue;
    nearest = by;
    found = body;
  }
  return found;
}

/**
 * Leave one leap of the bolt behind: the line from wherever the bolt was standing to the
 * body it has just found, stamped before the body is hurt so the light joins the two places
 * the damage was really between. `rank` is how far down the chain this leap is - the ship's
 * own leap is the zeroth, and every one after it is drawn thinner for what it cost.
 */
function leaveBolt(world, spec, x0, y0, body, rank, charged) {
  const bolt = world.arc.bolts.spawn();
  bolt.x0 = x0;
  bolt.y0 = y0;
  bolt.x1 = body.x;
  bolt.y1 = body.y;
  bolt.rank = rank;
  bolt.life = spec.bolt.life;
  bolt.max = spec.bolt.life;
  bolt.seed = fx.next();
  // The same thing a bullet carries it for: a bolt thrown by a loaded gun is thicker light, for
  // as long as it is seen at all (game/overcharge.js, render/entities.js).
  bolt.charged = charged;
}

/**
 * What one landing costs the body it landed on: the hull, a shove on away from wherever the
 * bolt came in from, and sparks thrown back along the line it came in on, so a chain reads
 * as a thing travelling rather than as four separate hits. `byPlayer` is true - the bolt is
 * the ship's own weapon and everything it kills is the run's, a bomber's chain reaction all
 * the way down (game/blast.js).
 */
function land(world, spec, body, fromX, fromY, weight) {
  const dx = body.x - fromX;
  const dy = body.y - fromY;
  const dist = hypot(dx, dy) || 1;
  body.ix += (dx / dist) * spec.jolt;
  body.iy += (dy / dist) * spec.jolt;

  const hit = spec.hit;
  spray(world, body.x, body.y, PALETTE.spark, hit.count, hit.speed, hit.life,
    Math.atan2(dy, dx), hit.spread);
  // And a bolt leaves the body it landed on colder than it found it (game/chill.js) - the arc
  // aims itself, so this is the one gun whose chill the player steers by flying rather than by
  // pointing. Before the hull comes off, like every other door: the landing that kills is a
  // landing.
  chill(world, body);
  // A body the bolt touched is set alight whether or not the bolt finished it, same as a shot
  // that landed (game/burn.js): the arc is the ship's own weapon and its fire is the same
  // fire, and a kill is exactly when the third rank wants that fire to go sideways.
  damageEnemy(world, body, weight, true);
  ignite(world, body);
}

/**
 * Throw one chain from the ship's nose. Returns whether it landed anywhere - a chain with
 * nothing inside its reach is a coil firing into empty sky, and the caller has to know that
 * nothing left the ship, because a pull that threw nothing owes no kick, no flash, and no
 * sound.
 *
 * Bodies are found one at a time and hurt immediately after being found, which is safe for
 * the same reason `game/orbitals.js` is safe: the strike happens inside `updatePlayer`, while
 * nothing is walking the crowd, so a body that dies here and is taken out of the list cannot
 * splice anything that is being read. Each landing starts the next search from where it landed, so a chain is a
 * walk - out to the nearest thing, then on to the next nearest thing from there - and not
 * four independent sweeps of the arena from the ship.
 */
function throwChain(world, spec, noseX, noseY, weight, charged) {
  let x = noseX;
  let y = noseY;
  let landed = false;

  for (let jump = 0; jump <= spec.jumps; jump++) {
    // The ship's own leap is as long as the gun's reach; every one after it is a hop from
    // body to body, which is a shorter thing to see and has to be a shorter thing to be.
    const body = preyNear(world, x, y, jump === 0 ? spec.reach : spec.leap);
    if (body === null) break;

    struck.push(body);
    leaveBolt(world, spec, x, y, body, jump, charged);
    land(world, spec, body, x, y, weight * Math.pow(spec.decay, jump));
    x = body.x;
    y = body.y;
    landed = true;
  }
  return landed;
}

/**
 * One pull of an arc's trigger: as many chains as the pull is worth, the ship's own and then
 * one more per rank of the split line.
 *
 * On a gun that throws a fan of shots the split line adds shots at angles; on this one there
 * are no angles to add, and what a chain needs to cover more of the arena is a second place
 * to start from. So `chains` is the same count read both ways - see `shotsPerPull` in
 * game/weapons.js - and each extra chain is lighter by the split line's own share, exactly as
 * an extra pellet is, which is what keeps one card meaning one trade on every gun: more
 * ground covered, at a share of the weight.
 *
 * `noseX`/`noseY` is the muzzle point game/weapons.js worked out for the pull, so a bolt
 * leaves the ship from exactly where a shot would have.
 *
 * Returns whether anything was struck, which is the answer `fire` needs before it decides
 * whether this pull costs the ship anything at all - and `boost` is what the pull is worth if
 * the gun was loaded when the trigger moved (game/overcharge.js), which goes on every landing of
 * every chain it throws, exactly as it goes on every pellet of a fan.
 */
export function strikeChain(world, gun, chains, noseX, noseY, boost) {
  const spec = gun.chain;
  const weight = gun.damage * gainOf(world, 'damage') * boost;
  const share = BALANCE.upgrades.split.share;
  const charged = boost > 1;

  struck.length = 0;
  let threw = false;
  for (let chain = 0; chain < chains; chain++) {
    // Every chain starts from the ship, at whatever is nearest that the last chain has not
    // already bought - so the extras go to the crowd the first one did not reach rather than
    // doubling up on the body it started at.
    const light = chain === 0 ? weight : weight * share;
    if (throwChain(world, spec, noseX, noseY, light, charged)) threw = true;
  }
  return threw;
}

/**
 * One step of the bolt pool: everything fades and nothing else happens to it. Counted down
 * in the simulation rather than in the renderer so that a bolt belongs to the run - it freezes
 * with a hit-stop and it dies with the run - and so a headless game can be asked how much
 * light the last pull left behind.
 */
export function updateArc(world, dt) {
  const bolts = world.arc.bolts;
  for (let i = bolts.count - 1; i >= 0; i--) {
    const bolt = bolts.items[i];
    bolt.life -= dt;
    if (bolt.life <= 0) bolts.killAt(i);
  }
}

/** Put the arc back to nothing: a bolt left over from the last run would hang in the sky. */
export function resetArc(world) {
  world.arc.bolts.clear();
}
