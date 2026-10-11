// The tether (PLAN 3.2's tether, taken as an upgrade line): a dash ties a line of light from the
// place it left to the ship, and everything standing on that line for the next two seconds is
// burned and thrown off it.
//
// This is the only damage in the deck that is a *line* rather than a circle round the ship. The
// orbital wall, the nova's front, the magnetar's field and the mine's ring are all measured out
// from the hull, so what they reach is a disc and what they are worth depends on how close the
// crowd is standing. A tether reaches wherever the ship has *been* and wherever it is going, and
// the ground between them is the weapon - which is the one piece of geometry a run owns by moving
// instead of by aiming, and the reason the line is worth a dash rather than a rank of the gun.
//
// Five decisions live here, and each of them has a test:
//
//   **A thread is a place and not a body.** It is not in `world.enemies`, it has no hull, nothing
//     can shoot it and nothing can cut it early - not a bullet, not a bomber's blast, not the ship.
//     That is the contract game/mines.js and game/afterimage.js signed for the things they leave
//     behind, for the same reason: a thing in the arena that can be interacted with is a second
//     thing to aim and a second thing to lose, and the two seconds PLAN gives the tether are the
//     two seconds the player bought.
//
//   **The far end is where the dash began and the near end is the ship, wherever it gets to.** PLAN
//     says the beam links the ship to "its last dash position", and the position a dash is *at* is
//     the one it left, because that is the position the ship is no longer at. So the tether is born
//     as the dash's own streak - a blade the length of the 220 px the ship just threw itself
//     through, lying across whatever it dashed past - and then it stretches and swings as the ship
//     flies. Which is the whole card in one sentence: **it pays for turning**. A ship running a
//     straight line drags one thread along its own wake; a ship that turns sweeps a fan of light
//     across the crowd, and the only way to get the second one is to fly it. Nothing here caps the
//     length, because the ship's own speed does: two seconds at 320 px/s is 640 px of tether and
//     never a pixel more.
//
//   **A rank is another thread, tied along the streak the dash covered.** One thread is a line and
//     five are a fan, and a fan covers a lane: rank 1 is PLAN's single beam down the middle of your
//     wake and rank 5 is five knots spread the length of the dash, all of them tied to the ship, so
//     whatever turn you make next sweeps five times the ground. A rank buys *breadth* rather than a
//     heavier pulse for the same reason afterimage's buys length and the nova's buys another front -
//     the same crowd hit harder is a rank nobody can feel, and `hit / pulses` below is the number
//     that says whether a rank really buys a different crowd.
//
//   **One tether is tied at a time, and the whole fan pulses together.** A body standing where two
//     threads overlap pays once, because the threads are one weapon with one beat, and that is what
//     keeps the fifth rank from being five stacks on whatever is already under the ship. A pulse is
//     not spent when nothing stands on the line (game/orbitals.js has the same rule): a tether that
//     was idle is hot the moment the first body arrives rather than half a beat late, and a second
//     dash reties the tether and whatever was tied is simply gone - the dash's own flash is the tell
//     of both halves of that, so nothing is drawn for a cutting that the dash already drew.
//
//   **A strike is a shove off the line and not a slowing of the body on it.** The throw is an
//     impulse off the thread's own perpendicular, exactly as a nova front throws what it crosses and
//     a mine throws what comes inside its ring: a shove is not a walk (game/chill.js), so a body
//     thrown off a tether is still walking at you the whole time and the line never once takes the
//     crowd's pace down. What it does take off is hull, and it takes off one shot of the ship's own
//     gun times the line's weight, with the frost and the fire that any other shell of this gun
//     leaves behind (game/chill.js, game/burn.js) - and never, ever the ship that tied it.
//
// What the line is worth is a relation to the crowd, so it carries its own instruments: `held` over
// `steps` is the mean number of bodies standing on the threads while it was live, and `hit` over
// `pulses` is how many of them one pulse came round. NOTES' lesson from mines and afterimage is that
// those two numbers are the only way a line like this can be read at all, so they are counted here
// from the first session and not added three days later. `BALANCE.upgrades.tether` carries every
// number and the measurement each one came from.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { Pool } from '../core/pool.js';
import { clamp, dist2, hypot } from '../core/math.js';
import { damageEnemy } from './enemies.js';
import { ignite } from './burn.js';
import { chill } from './chill.js';
import { ring, spray } from './effects.js';
import { cueBeep } from './cues.js';
import { cordsOf, gainOf, rankOf } from './upgrades.js';

/**
 * The shape of one thread: the knot it is tied to, which is a place in the arena and never moves.
 * The other end is the ship, which keeps its own previous position, so a thread has nothing of its
 * own to interpolate - the painter ties the two ends together wherever both happen to be (
 * render/entities.js).
 */
export function makeCord() {
  return { x: 0, y: 0 };
}

/**
 * One body standing on a thread, and where on the thread it stands - which is what the throw is
 * measured off, and the reason this is an object and not just the body. The list is rebuilt from the
 * crowd every step and held nowhere else, like the grid and the packs in game/flock.js: there is
 * nothing to clean up when a thread goes out, a rank is taken or a body dies mid-pulse.
 */
export function makeRider() {
  return { body: null, x: 0, y: 0 };
}

/**
 * The tether: the threads standing in the arena, how long the fan is still live for, how long
 * until it may pulse again, the three numbers the dash is paced by - and five counters a headless
 * run reads to see the line at all: `tied` for every dash that tied a fan, `pulses` for the ones
 * that were paid out, `hit` for the bodies they came round, and `held` over `steps` for the mean
 * crowd standing on the threads while it lasted.
 */
export function newTether() {
  return {
    cords: new Pool(makeCord),
    riders: new Pool(makeRider),
    // One spare rider, so the crowd can be asked "are you on a thread?" without the answer costing
    // an object every time it is no. `heldOn` writes it and the pool only ever sees a yes.
    probe: makeRider(),
    live: 0,
    cool: 0,
    gap: 0,
    due: 0,
    toGo: 0,
    tied: 0,
    pulses: 0,
    hit: 0,
    held: 0,
    steps: 0,
  };
}

/** Put every thread back to nothing, with the rest of the run's resetting. */
export function resetTether(world) {
  const line = world.tether;
  line.cords.clear();
  line.riders.clear();
  // And the spare rider's answer about who was standing on a thread. `heldOn` only writes it when the
  // answer is yes, so the probe is left holding the last body it said yes to - through the rest of the
  // run, which is harmless because nobody reads it except straight after a yes, and through the end of
  // the run too, which is not: it is a body from the last run, still held by this one's world.
  line.probe.body = null;
  line.probe.x = 0;
  line.probe.y = 0;
  line.live = 0;
  line.cool = 0;
  line.gap = 0;
  line.due = 0;
  line.toGo = 0;
  line.tied = 0;
  line.pulses = 0;
  line.hit = 0;
  line.held = 0;
  line.steps = 0;
}

/** Has this run taken the line at all. Nothing is asked or painted until it has. */
export function hasTether(world) {
  return rankOf(world, 'tether') > 0;
}

/**
 * Say how many threads the dash that has just been granted will tie, and how far apart along the
 * streak it covers they will be knotted. Called by game/player.js at the moment the dash is
 * granted, the same door game/afterimage.js is armed through, for the same reason: how many threads
 * a dash owes is settled once, when the dash was allowed, by whatever ranks the ship has now.
 *
 * A dash that comes while a fan is still live reties the tether: whatever was tied is cut here, with
 * no light of its own, because the dash is throwing a ring and a spray at this very step and the
 * new threads are born in it.
 */
export function armTie(world) {
  const spec = BALANCE.upgrades.tether;
  const line = world.tether;
  const count = cordsOf(world);

  line.toGo = count;
  line.gap = count > 0 ? BALANCE.player.dash.distance / count : 0;
  line.due = 0;
  if (count === 0) return;

  if (line.cords.count > 0) {
    line.cords.clear();
    line.riders.clear();
  }
  line.live = spec.life;
  line.cool = 0;      // the first pulse is ready the moment the first knot is tied
  line.tied++;

  // One note for the whole tie and not one per knot, which is the mine row's rule (game/mines.js):
  // at the top of the line a dash ties five knots inside its own twelfth of a second, and a frame
  // spends its mix once (audio/mix.js).
  const sound = spec.tied.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * Tie whatever knots this much of a dash has reached. Called by game/player.js from `dashStep`,
 * after the ship has moved, with the ship standing at the place the knot is tied to - so the knots
 * are tied as the dash goes and a dash that runs into a wall ties the knots it actually got to
 * rather than a plan it never reached (game/afterimage.js lays its images the same way).
 */
export function tieCords(world) {
  const line = world.tether;
  if (line.toGo === 0) return;

  const travelled = BALANCE.player.dash.distance - world.player.dashLeft;
  while (line.toGo > 0 && travelled >= line.due) {
    tieCord(world);
    line.due += line.gap;
    line.toGo--;
  }
}

/** One knot, driven into the floor at the place the ship has got to. */
function tieCord(world) {
  const spec = BALANCE.upgrades.tether;
  const ship = world.player;
  const cord = world.tether.cords.spawn();
  cord.x = ship.x;
  cord.y = ship.y;

  // The knot is the only part of the tether that has a beginning, so it is the only part with a
  // light at its beginning: a small ring at the place it was tied, which is also the first frame in
  // which the thread exists at all.
  ring(world, cord.x, cord.y, PALETTE.playerLine,
    spec.tied.ring.radius, spec.tied.ring.speed, spec.tied.ring.life);
}

/**
 * Fill `rider` with the thread that holds `body`, and the place on it it is held at. Answers false if
 * no thread does.
 *
 * A body is on a thread when it stands within `reach` of the *line*, measured to the body's own skin:
 * the band you see is `reach` either side of the axis and nothing else, so the light never claims a
 * wider road than the damage pays out on (game/mines.js has the same rule for a ring on the floor).
 * The foot of the body along the thread is what the throw is off, and a thread with no length at all
 * - the first instants of a dash - is a place, and a place is a dot the width of the band.
 */
function heldOn(body, ship, cords, reach, rider) {
  for (let i = 0; i < cords.count; i++) {
    const cord = cords.items[i];
    const dx = ship.x - cord.x;
    const dy = ship.y - cord.y;
    const span = dx * dx + dy * dy;
    const along = span === 0 ? 0
      : clamp(((body.x - cord.x) * dx + (body.y - cord.y) * dy) / span, 0, 1);
    const footX = cord.x + dx * along;
    const footY = cord.y + dy * along;
    if (dist2(body.x, body.y, footX, footY) > reach * reach) continue;

    rider.body = body;
    rider.x = footX;
    rider.y = footY;
    return true;
  }
  return false;
}

/**
 * Who is standing on the threads right now. Rebuilt from the crowd every step - nothing remembers
 * being on a thread, so a body that walks off is off the very next step and there is nothing to
 * forget when the tether lets go.
 *
 * The crowd is walked directly rather than asked of the collision grid, for the same reason
 * game/orbitals.js walks it: the grid holds the crowd as it was before this step's walking, and a
 * thread should burn where a body actually ended up. At the top of the line that is five threads
 * over a capped crowd, which is a few thousand compares a step and only while a tether is live.
 */
function ridersOn(world, spec) {
  const line = world.tether;
  const ship = world.player;
  const crowd = world.enemies;
  const probe = line.probe;
  const riders = line.riders;

  riders.clear();
  for (let i = 0; i < crowd.length; i++) {
    const body = crowd[i];
    if (!heldOn(body, ship, line.cords, spec.reach + body.r, probe)) continue;
    const rider = riders.spawn();
    rider.body = probe.body;
    rider.x = probe.x;
    rider.y = probe.y;
  }
  return riders;
}

/**
 * One pulse: everything standing on any thread loses hull, is thrown clear of the line, and is left
 * frosted and alight like anything else this run's gun has come round. `byPlayer` is true because it
 * is the ship's own weapon: a tether that finishes a bomber is the run's kill all the way down that
 * chain (game/blast.js).
 *
 * A body the last thread brought down is skipped, because the crowd is walked once and a bomber going
 * apart inside this loop can take a neighbour out of it - and `killEnemy` will not put a body through
 * the crowd twice (game/mines.js has the same guard for the same reason).
 */
function strike(world, riders, spec) {
  const line = world.tether;
  line.pulses++;

  const weight = BALANCE.bullets.damage * gainOf(world, 'damage') * spec.weight;
  const sparks = spec.bite;
  for (let i = 0; i < riders.count; i++) {
    const rider = riders.items[i];
    const body = rider.body;
    if (body.hp <= 0) continue;

    line.hit++;
    // Thrown off the line, off the foot the body stands at, which is the perpendicular of the thread
    // wherever the body happens to be along it. A body standing dead on the axis has no side to be
    // thrown to and is left where it is, which is the honest answer and not a missing case.
    const dx = body.x - rider.x;
    const dy = body.y - rider.y;
    const off = hypot(dx, dy);
    if (off > 0) {
      body.ix += (dx / off) * spec.shove;
      body.iy += (dy / off) * spec.shove;
    }

    spray(world, body.x, body.y, PALETTE.spark, sparks.count, sparks.speed, sparks.life,
      Math.atan2(dy, dx), sparks.spread);

    // Frost and fire before and after the hull comes off, exactly as a drone bite and a nova front
    // pay out: the tether that kills a body is the cold and the flame it dies with.
    chill(world, body);
    damageEnemy(world, body, weight, true);
    ignite(world, body);
  }

  // One note for the pulse and not one per body: at the top of the line a pulse can come round a
  // dozen bodies, and a dozen notes would be the loudest thing in the sky that frame
  // (audio/mix.js).
  const sound = spec.bite.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * One step of the tether: it counts down, works out who is standing on it, and pulses if anything is
 * and its beat has come round. Called from the run's step whether or not anything is tied - with
 * nothing tied that is one compare and a return.
 *
 * It runs after the crowd has walked and after the minefield, so a pulse is paid out where a body
 * actually ended up. A pulse can end the run (a killed bomber's blast reaches the ship), which is
 * handled the same way a drone bite handles it - by the state check the step loop already makes.
 */
export function updateTether(world, dt) {
  const line = world.tether;
  if (line.live <= 0) return;
  const spec = BALANCE.upgrades.tether;

  if (line.cool > 0) line.cool = Math.max(0, line.cool - dt);
  line.live -= dt;

  const riders = ridersOn(world, spec);
  line.steps++;
  line.held += riders.count;
  if (riders.count > 0 && line.cool <= 0) {
    line.cool = spec.beat;
    strike(world, riders, spec);
  }

  if (line.live <= 0) letGo(world, spec);
}

/**
 * The tether letting go on its own clock: a small ring closing in on every knot it was tied at, and
 * one note. Nothing is hurt by it and nothing is remembered after it - the knots are the whole state
 * of the line apart from the clock, and they are gone.
 */
function letGo(world, spec) {
  const line = world.tether;
  for (let i = 0; i < line.cords.count; i++) {
    const cord = line.cords.items[i];
    ring(world, cord.x, cord.y, PALETTE.playerLine,
      spec.gone.ring.radius, spec.gone.ring.speed, spec.gone.ring.life);
  }
  line.cords.clear();
  line.riders.clear();
  const sound = spec.gone.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * How near the tether is to letting go: 0 for most of its life and up to 1 as it stops. The painter
 * fades the threads on this, so the line says out loud that it is nearly done rather than stopping
 * between two frames (game/mines.js fades its mines the same way).
 */
export function lettingGoOf(line) {
  const spec = BALANCE.upgrades.tether;
  if (line.live >= spec.fade) return 0;
  return 1 - Math.max(0, line.live) / spec.fade;
}

/**
 * How near the next pulse is: 1 the step one went out and down to 0 as the next one comes due. It is
 * the drawing half of the promise that the pulse is the picture - the threads brighten *because*
 * something was hurt on them, and a tether with nothing on it burns steady instead of flickering.
 */
export function pulsingBy(line) {
  const beat = BALANCE.upgrades.tether.beat;
  if (beat <= 0 || line.cool <= 0) return 0;
  return line.cool / beat;
}
