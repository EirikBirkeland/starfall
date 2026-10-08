// The orbital ring (PLAN 3.2's orbitals, taken as an upgrade line): drones that circle
// the ship and damage on touch.
//
// There is no such thing as a drone's own position. The ring is one number - the angle it
// has turned to - and drone `i` of `n` stands at `angle + i/n` of a turn out on the line's
// radius, measured from wherever the ship's middle is *this step*. That is the whole
// simulation of a drone, and it is what makes them orbit rather than fly: a drone cannot
// be lagged, knocked away, or left behind by a dash, because it is a place on a circle
// round the ship and nowhere else. The cost is that the ring is perfectly rigid, which is
// the point - a wall you can see at a distance you can learn.
//
// Three decisions live here, and each of them has a test:
//
//   **A drone bites on a beat, not once per step.** A bite is one shot of the ship's own
//     gun - `weight`, times whatever the damage line makes a shot worth - and the drone
//     then waits `beat` seconds before it may do it again, whoever it is touching. So the
//     ring's damage per second is `count * weight / beat` and does not care how many
//     bodies happen to be standing in it - a drone in a knot is worth what a drone on the
//     edge of one is worth, which is the same trade the crowd's own separation makes and
//     the reason the line can be priced at all. And because a bite is a shot and not a flat
//     number, the ring keeps its place on the ladder as the run's gun gets heavier.
//
//   **The ring has a dead zone.** A bite is a touch test at the ring's own radius, so a
//     body that has walked *past* the ring - pressed against the hull, which is where the
//     danger is - is out of reach of it. A ring is not an aura and does not forgive you
//     for standing inside it; it is a wall at a known distance and it is worth learning
//     where that distance is.
//
//   **A drone is not a body.** Nothing can hit it, nothing can dodge it, and it does not
//     block anything. It is the ship's own reach, drawn.
//
// Like `game/shields.js` and unlike `game/bullets.js`, the touch test walks the crowd
// directly rather than asking the collision grid: the grid holds the crowd as it was
// before this step's walking, and a drone should bite what is beside it now. There are at
// most ten drones and the crowd is capped (`waves.maxBodies`), so the honest double loop
// is also the cheap one - and walking the crowd itself means every body examined is alive,
// because `killEnemy` takes a body out of the list as it dies. At the top of the line and
// the top of the crowd that is a thousand distance tests a step, which measured as about
// 3.5% of a full run's cost; if a performance pass ever wants it back, the grid is the
// answer and this comment is the note on why it is not used today.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { TAU, dist2 } from '../core/math.js';
import { damageEnemy } from './enemies.js';
import { ignite } from './burn.js';
import { spray } from './effects.js';
import { cueBeep } from './cues.js';
import { dronesOf, gainOf } from './upgrades.js';

/**
 * The shape of a drone. `cool` is what is left of the wait after a bite; the positions are
 * written from the ring's angle every step, and px/py are kept for the same reason every
 * moving thing keeps them - the renderer paints between the two (render/interp.js).
 */
function makeDrone() {
  return { x: 0, y: 0, px: 0, py: 0, cool: 0 };
}

/** Where drone `i` of `count` stands on the ring, as an angle. */
function angleOf(ring, i, count) {
  return ring.angle + (i * TAU) / count;
}

/** Put one drone on the ring: `angle` out from the ship, `spec.radius` px away. */
function place(drone, ship, spec, angle) {
  drone.x = ship.x + Math.cos(angle) * spec.radius;
  drone.y = ship.y + Math.sin(angle) * spec.radius;
}

/**
 * Make the ring the size the line says it is. This happens on the one step a card is
 * taken and on no others, so growing it costs an allocation or two where a step of
 * walking the crowd costs none (PLAN section 2).
 *
 * Every drone is then put back on its slot and its previous position thrown away: adding
 * a drone changes the spacing of all of them, so the old ones jump, and a jump the
 * renderer interpolates would be painted as a streak across the arena. A ring that grew
 * appears where it belongs, all at once.
 */
function resizeRing(world, ship, spec) {
  const ring = world.orbit;
  const want = dronesOf(world);
  if (ring.drones.length === want) return;

  if (ring.drones.length > want) ring.drones.length = want;
  while (ring.drones.length < want) ring.drones.push(makeDrone());
  for (let i = 0; i < ring.drones.length; i++) {
    const drone = ring.drones[i];
    place(drone, ship, spec, angleOf(ring, i, want));
    drone.px = drone.x;
    drone.py = drone.y;
  }
}

/**
 * The closest body a drone can reach, or null. `world.enemies` is spliced on every death,
 * so everything in it is alive. A bite reaches as far as the drone's own middle plus the
 * body's own width, which is what makes the ring's reach a distance you can see rather
 * than a radius plus a guess.
 */
function preyInRange(world, drone, spec) {
  let found = null;
  let nearest = Infinity;
  for (let i = 0; i < world.enemies.length; i++) {
    const enemy = world.enemies[i];
    const reach = enemy.r + spec.touch;
    const by = dist2(drone.x, drone.y, enemy.x, enemy.y);
    if (by > reach * reach || by >= nearest) continue;
    nearest = by;
    found = enemy;
  }
  return found;
}

/**
 * What one bite is worth: a shot of the ship's own gun, at whatever the damage line makes
 * a shot worth, times the drone's own weight. Read where the bite happens, so a card taken
 * between two bites lands on the next one (game/upgrades.js).
 */
function biteWeight(world, spec) {
  return BALANCE.bullets.damage * gainOf(world, 'damage') * spec.weight;
}

/**
 * One bite: the hull comes off, the body is thrown away from the ship, and the sparks go
 * outwards along the line the drone stands on - so a bite reads as a thing being shoved
 * as well as hurt. `byPlayer` is true because it is: the ring is the ship's own weapon and
 * everything it kills is the run's, all the way down a bomber's chain (game/blast.js).
 */
function bite(world, drone, prey, spec) {
  const ship = world.player;
  drone.cool = spec.beat;

  const dx = prey.x - ship.x;
  const dy = prey.y - ship.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  prey.ix += (dx / dist) * spec.shove;
  prey.iy += (dy / dist) * spec.shove;

  const sparks = spec.bite;
  const heading = Math.atan2(dy, dx);
  spray(world, drone.x, drone.y, PALETTE.spark, sparks.count, sparks.speed, sparks.life,
    heading, sparks.spread);
  const sound = spec.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);

  // A drone bite lights the body it bit, killed or not (game/burn.js).
  damageEnemy(world, prey, biteWeight(world, spec), true);
  ignite(world, prey);
}

/**
 * One step of the ring: turn it, put the drones on it, and let any that are ready bite
 * what they are standing on. Called with no drones at all as often as not - a run that has
 * not taken the line pays nothing here beyond one length check.
 *
 * It runs after the crowd has walked, so a bite is judged against where a body actually
 * is. A bite can end the run (a killed bomber's blast reaches the ship, game/blast.js),
 * which is true of a bullet's hit too and handled the same way - by the state check the
 * step loop already makes, not by anything here.
 */
export function updateOrbitals(world, dt) {
  const spec = BALANCE.upgrades.orbitals;
  const ship = world.player;
  const ring = world.orbit;

  resizeRing(world, ship, spec);
  const count = ring.drones.length;
  if (count === 0) return;

  ring.angle = (ring.angle + spec.spin * dt) % TAU;
  for (let i = 0; i < count; i++) {
    const drone = ring.drones[i];
    drone.px = drone.x;
    drone.py = drone.y;
    place(drone, ship, spec, angleOf(ring, i, count));

    if (drone.cool > 0) {
      drone.cool = Math.max(0, drone.cool - dt);
      continue;
    }
    // Nothing to bite leaves the drone ready rather than spending its beat: a ring that
    // was idle is not punished when the first body finally walks into it.
    const prey = preyInRange(world, drone, spec);
    if (prey !== null) bite(world, drone, prey, spec);
  }
}

/**
 * Put the ring back to nothing. The ranks are reset with it, but the title screen does not
 * step a run, so a ring left over from the last one would otherwise be drawn behind the
 * logo until the next run's first step trimmed it away.
 */
export function resetOrbitals(world) {
  world.orbit.drones.length = 0;
  world.orbit.angle = 0;
}
