// The Swarm's micro-missiles (PLAN 3.2's fifth primary): a shot that hunts, and the small blast
// it leaves where it lands.
//
// The gun is a fan of shots like any other (game/weapons.js writes them) and only two things make
// these shots different: they steer toward whatever they can see, and they go off where they land.
// Both of those belong to the loop that already walks the bullets, so this module holds two calls
// for `game/bullets.js` to make and nothing else - no world state, no clock, nothing to reset with
// the run. A missile is a bullet, not a system.
//
// Three decisions live here, and each has a test in test/missiles.test.mjs:
//
//   **It hunts and never gives up.** A missile turns toward the nearest body it can see, at a fixed
//     rate, for as long as it is in the air. It does not acquire, hold and release; there is no lock
//     to break by walking behind a rock, because there is nothing to walk behind. That is the gun:
//     the pulse is aimed, the scatter is pointed, the arc finds its own body at the trigger and the
//     lance is a line you lay down - this one is a flight of slow things you let go of and that
//     arrive wherever the crowd ended up. Which is also why they are slow: a shot that cannot miss
//     is only interesting if it takes its time, and because it is slow a body can still step out of
//     the way of one that has its eye on it.
//
//   **The blast spares the body it hit.** The missile's own hull comes off the body it found; the
//     blast is a second, separate payment to everything *else* standing in the circle. That reads
//     as the obvious thing and it is a decision: making the aimed body pay both (which is what
//     game/blast.js does for a corpse) prices a gun in two numbers at once and means the point-blank
//     shot - the one you cannot avoid at the flank - is the heaviest one, which is not a trade a
//     player can see. Spare the one you hit and every number means one thing: `damage` is the shot,
//     `blast.share` is the crowd around it.
//
//   **The blast never touches the ship that fired it.** Same reading as game/nova.js and
//     game/lance.js, and the same reason: a missile that detonated on its own ship would be a card
//     you are punished for firing at anything standing near you, and the honest answer to a point
//     blank is to dash, not to eat your own gun.
//
// The look of the blast is the same warm flash every explosion in this game wears (PALETTE.blastFlash,
// as game/mines.js and the bombers spend theirs): an explosion is warm whatever lit it, and the
// missile *itself* is cool, because it is the ship's own ordnance (PLAN section 4).
//
// What the shot carries and what it reads: a bullet holds that it hunts (`hunts`) and how wide it
// goes off (`splash`, 0 for every shot in the game that does not), because those are the two things
// a recycled shot could otherwise bring with it from whatever gun last fired. Everything else - the
// rate it can turn, how far it will look for a body, what the blast costs and looks like - is the
// Swarm's own and is read off its row here. If a second homing gun ever arrives, that row moves
// onto the shot; until then this is the smaller lie.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { clamp, dist2, hypot } from '../core/math.js';
import { damageEnemy, widestBodyOn } from './enemies.js';
import { burst, ring, shakeIt } from './effects.js';
import { cueBeep } from './cues.js';

/**
 * The scratch the hunt's query fills. It has to be a list of its own: game/bullets.js holds the
 * answer to its own question about the neighbourhood in `nearby` while it walks it, and a missile
 * steering is one of the things that asks while that is held (game/bullets.js, where the same rule
 * is why `withinReach` exists there).
 */
const hunted = [];

/** The Swarm's own numbers, read where they are used rather than copied into a shot. */
function missileOf() {
  return BALANCE.weapons.swarm.missile;
}

/** The shortest signed turn from `from` to `to`, in radians, wrapped to (-PI, PI]. */
function bend(from, to) {
  let delta = to - from;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return delta;
}

/**
 * One step of one missile's steering: turn at most `turn * dt` of a circle toward the nearest body
 * within reach, and fly straight if there is nothing out there.
 *
 * It runs where the bullet is walked (game/bullets.js), after the shot has moved and before anything
 * asks whether it has landed - so a missile turns, then travels, then hits, in that order every step,
 * and a body standing where the shot is heading is met on the step it is met.
 *
 * The speed never changes. A turn that also sped the shot up would be a second number to price and
 * would read as the missile gaining on the crowd, which is the one thing that would make this gun
 * feel like it was aiming itself for the player.
 *
 * The nearest body is the one it chases, measured from centre to centre, and a body counts as seen
 * when its *surface* is within reach - so a tank is hunted from further out than a weaver standing
 * the same distance away, which is what the eye expects of a big object.
 *
 * What it costs, so nobody has to measure it again: one grid query of `reach` per missile per step.
 * At the worst load the game can be talked into - 600 bodies heaped round the ship and eighteen
 * missiles in the air, more than a maxed split line keeps flying - that is 0.19 ms of a step, about
 * 2% of a 60 fps frame; a normal Swarm run has three to six in the air and a quarter of that. Which
 * is why it asks the grid and never walks the crowd.
 */
export function hunt(world, bullet, dt) {
  const line = missileOf();
  // The grid is this step's (game/bullets.js rebuilt it above) and the radius has to cover the
  // widest thing the exact test below will measure (core/grid.js).
  const found = world.grid.queryInto(bullet.x, bullet.y, line.reach + widestBodyOn(world), hunted);

  let target = null;
  let nearestBy = Infinity;
  for (let i = 0; i < found; i++) {
    const body = hunted[i];
    if (body.hp <= 0) continue;          // dead things are not chased; they have already paid
    const dist = hypot(body.x - bullet.x, body.y - bullet.y);
    if (dist - body.r > line.reach) continue;
    if (dist < nearestBy) { nearestBy = dist; target = body; }
  }
  if (target === null) return;

  const speed = hypot(bullet.vx, bullet.vy);
  if (speed === 0) return;
  const have = Math.atan2(bullet.vy, bullet.vx);
  const want = Math.atan2(target.y - bullet.y, target.x - bullet.x);
  const heading = have + clamp(bend(have, want), -line.turn * dt, line.turn * dt);
  bullet.vx = Math.cos(heading) * speed;
  bullet.vy = Math.sin(heading) * speed;
}

/**
 * Let the missile go off: the light, the noise, and one round of the blast's hull to every body in
 * the circle except `spared`, the one that got hit.
 *
 * The crowd is walked directly and not queried off the grid, for the same two reasons game/blast.js
 * gives: this happens inside a step that is already holding the grid's answer for a bullet, and a
 * body that dies in here can set a bomber off, which changes the crowd under the walk. So the
 * bodies are picked out first and hurt afterwards, and one that is dead by the time its turn comes
 * does not die twice.
 */
export function detonate(world, bullet, spared) {
  const line = missileOf();
  const blast = line.blast;
  const x = bullet.x;
  const y = bullet.y;

  ring(world, x, y, PALETTE.blastFlash, blast.ring.radius, blast.ring.speed, blast.ring.life);
  burst(world, x, y, PALETTE.blastFlash, blast.flash.count, blast.flash.speed, blast.flash.life);
  shakeIt(world, blast.shake);
  const sound = blast.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);

  const reach2 = blast.radius * blast.radius;
  const weight = bullet.dmg * blast.share;
  const victims = [];
  for (let i = 0; i < world.enemies.length; i++) {
    const body = world.enemies[i];
    if (body === spared || dist2(body.x, body.y, x, y) > reach2) continue;
    victims.push(body);
    // Outwards from where it went off, the way every blast in this game throws. It is what makes a
    // cluster *open* rather than sit there and take the next flight.
    const dist = hypot(body.x - x, body.y - y) || 1;
    body.ix += ((body.x - x) / dist) * blast.shove;
    body.iy += ((body.y - y) / dist) * blast.shove;
  }

  for (let i = 0; i < victims.length; i++) {
    const body = victims[i];
    // One of these may have brought down one of the others on the way out.
    if (body.hp <= 0) continue;
    damageEnemy(world, body, weight, true);
  }
}


