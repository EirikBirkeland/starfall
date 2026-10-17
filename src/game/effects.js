// The stuff that sprays, flashes and floats: sparks, chunks of whatever just came
// apart, the wake off the engines, shockwave rings, the little score labels that
// drift upwards, and the two pieces of feedback that are just a number on the
// world - trauma and hit-stop. They are simulated (they need to move in step
// with everything else) but they never touch anything back.
//
// Every list lives in a pool, because they are the busiest things in the game (a
// single death sprays 30 sparks and throws a dozen chips) and they never care
// about their own order. Each spawner below writes every field of its shape, so a
// recycled object can never carry a leftover from its previous life.
//
// The numbers that say how a spray scatters come from `fx`, not from `logic` (see
// core/rng.js): a burst with one more spark in it must not be able to move a shot
// that was already in flight.

import { BALANCE } from './balance.js';
import { fx } from '../core/rng.js';
import { Pool } from '../core/pool.js';
import { TAU } from '../core/math.js';
import { particleStride } from './settings.js';

/**
 * The three shapes a particle can be, and the keys of `BALANCE.effects.shapes`.
 * The renderer draws each of them its own way: a spark is a hot dot, a chip of
 * debris is a tumbling bar, a puff of exhaust is a soft bloom of light.
 */
export const SPARK = 'spark';
export const DEBRIS = 'debris';
export const SMOKE = 'smoke';

/** The shapes of the effect lists, one factory each. */
export function makeParticle() {
  return {
    x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
    life: 0, max: 1, size: 0, color: '',
    shape: SPARK,
    rot: 0,     // which way a chip is lying, for the shapes that tumble
    spin: 0,    // rad/s
  };
}

export function makeRing() {
  return { x: 0, y: 0, r: 0, vr: 0, life: 0, max: 1, color: '' };
}

export function makeLabel() {
  return { x: 0, y: 0, text: '', color: '', life: 0, max: 1 };
}

/** Trauma, in the units the camera shake reads. */
export function shakeIt(world, amount) {
  world.shake = Math.min(BALANCE.screen.shakeCap, world.shake + amount);
}

/**
 * Hit-stop (PLAN section 4): hold the whole run still for `seconds`. The longest
 * of two overlapping freezes wins, so a small kill landing in the middle of a
 * player hit cannot cut it short. `stepWorld` spends it.
 */
export function hitStop(world, seconds) {
  world.freeze = Math.max(world.freeze, seconds);
}

/**
 * Of a spray, is this the spark that gets leave?
 *
 * The particle row of the settings screen (game/settings.js) is a stride: one spark in `stride` is
 * let out, and 0 lets out none. Counting which spark it is, rather than asking the stream, is on
 * purpose: a thinned spray that keeps every third spark is the same spray with room in it, while one
 * that asked the stream would move whichever sparks survived to wherever the next draw landed - and
 * a setting should not be able to change what a spray looks like beyond thinning it.
 *
 * The count is a phase and not a fact about the run: it is deliberately not reset with a run, so no
 * system may read it, and nothing in a run could notice if one did.
 */
let emitted = 0;

function letsEmit() {
  const stride = particleStride();
  if (stride <= 0) return false;
  if (stride === 1) return true;
  emitted++;
  return emitted % stride === 0;
}

/**
 * One particle, already aimed.
 *
 * It draws exactly four numbers, always in the same order - life, size, how it is
 * lying, how fast it turns - so that one spray cannot be told apart from another by
 * how much it asks the stream for. Two of them go for nothing on the shapes that
 * never tumble, and that is still cheaper than a shape that asks for a different
 * amount.
 *
 * `carry` is a velocity the particle is born holding on top of its own: the
 * engines' puffs take a share of the ship's, so they trail it instead of shooting
 * off by themselves.
 */
function emit(world, shape, x, y, angle, speed, life, color, carryX = 0, carryY = 0) {
  if (!letsEmit()) return;
  const spec = BALANCE.effects.shapes[shape];
  const p = world.particles.spawn();
  p.x = x;
  p.y = y;
  p.px = x;
  p.py = y;
  p.vx = Math.cos(angle) * speed + carryX;
  p.vy = Math.sin(angle) * speed + carryY;
  p.life = fx.range(spec.lifeFloor * life, life);
  p.max = life;
  p.size = fx.range(spec.sizeMin, spec.sizeMax);
  p.color = color;
  p.shape = shape;
  p.rot = fx.range(0, TAU);
  p.spin = fx.range(-spec.spin, spec.spin);

  // Over the cap, some of them have to go. The pool is unordered, so this drops
  // an arbitrary handful rather than the oldest ones; at this crowd size no one
  // can tell, and no run may depend on it.
  const over = world.particles.count - BALANCE.effects.particleCap;
  if (over > 0) world.particles.trim(over);
}

/** `count` of `shape`, thrown outwards in every direction from one point. */
function scatter(world, shape, x, y, color, count, speed, life) {
  const floor = BALANCE.effects.particleSpeedFloor;
  for (let i = 0; i < count; i++) {
    emit(world, shape, x, y, fx.range(0, TAU), fx.range(speed * floor, speed), life, color);
  }
}

export function burst(world, x, y, color, count, speed, life) {
  scatter(world, SPARK, x, y, color, count, speed, life);
}

/**
 * The chunks of a thing that just came apart (PLAN section 4). Same shape as a
 * burst, heavier shape: they are what says how big the enemy was.
 */
export function wreck(world, x, y, color, count, speed, life) {
  scatter(world, DEBRIS, x, y, color, count, speed, life);
}

/**
 * `count` sparks out of (x, y), pointed along `heading` and no more than
 * `spread` radians off it. A dash sprays these backwards; a fleeing enemy will
 * want them forwards.
 */
export function spray(world, x, y, color, count, speed, life, heading, spread) {
  const floor = BALANCE.effects.particleSpeedFloor;
  for (let i = 0; i < count; i++) {
    const angle = heading + fx.range(-spread, spread);
    emit(world, SPARK, x, y, angle, fx.range(speed * floor, speed), life, color);
  }
}

/**
 * The thruster trail (PLAN section 4): a steady stream of puffs out of the
 * nozzles, dropped into the world and left there, so a ship that has been flying
 * drags its own wake behind it. `rate` is puffs per second, so an accumulator
 * decides which steps get one - the sim runs at 120 Hz and nobody needs 120 puffs.
 *
 * A dash is not included: it has its own streak, drawn by render/entities.js.
 */
export function engineTrail(world, ship, dt) {
  const spec = BALANCE.player.exhaust;
  if (ship.dashLeft > 0 || ship.thrust < spec.at) {
    ship.exhaustTimer = 0;
    return;
  }

  ship.exhaustTimer += spec.rate * dt;
  const back = ship.angle + Math.PI;
  const nozzleX = ship.x + Math.cos(back) * spec.nozzle;
  const nozzleY = ship.y + Math.sin(back) * spec.nozzle;
  while (ship.exhaustTimer >= 1) {
    ship.exhaustTimer -= 1;
    emit(
      world, SMOKE, nozzleX, nozzleY,
      back + fx.range(-spec.spread, spec.spread),
      fx.range(spec.speed * spec.speedFloor, spec.speed),
      spec.life, spec.color,
      ship.vx * spec.inherit, ship.vy * spec.inherit,
    );
  }
}

export function ring(world, x, y, color, radius, speed, life) {
  const r = world.rings.spawn();
  r.x = x;
  r.y = y;
  r.r = radius;
  r.vr = speed;
  r.life = life;
  r.max = life;
  r.color = color;
}

export function addText(world, x, y, string, color) {
  const fxSpec = BALANCE.effects;
  const label = world.texts.spawn();
  label.x = x;
  label.y = y;
  label.text = string;
  label.color = color;
  label.life = fxSpec.textLife;
  label.max = fxSpec.textLife;
  const over = world.texts.count - fxSpec.textCap;
  if (over > 0) world.texts.trim(over);
}

/**
 * Move every spark, ring and label on the glass one step: drift, drag, tumble, and out when its time
 * is up. "The share of its own speed a shape has left after this step" is what the three pows below
 * are, and each spark picks one of them by its own `shape`.
 */
export function updateEffects(world, dt) {
  // Three pows, into three locals, and picked by name in the loop under them.
  //
  // They used to live in one module object keyed by shape name, refilled in place under a comment
  // claiming the loop therefore allocated nothing. It allocated a great deal, once V8 finished with the
  // function: `dragOf[p.shape]` is a *keyed* read out of a dictionary-mode object, and a keyed read of
  // a double has to hand back a tagged value, so it builds a HeapNumber. Two reads a spark a step, 900
  // sparks on the cap, and the dying crowd went from **735 B a step to 29 KB** the moment the compiler
  // stopped being able to prove the numbers were doubles - which took about 10 minutes of arena time,
  // and is why this sat in the game unnoticed while every byte budget in `tools/alloc-probe.js` passed.
  // A lookup that is three named loads and two comparisons is not slower than a dictionary, and it
  // cannot box.
  const shapes = BALANCE.effects.shapes;
  const sparkDrag = Math.pow(shapes[SPARK].drag, dt);
  const debrisDrag = Math.pow(shapes[DEBRIS].drag, dt);
  const smokeDrag = Math.pow(shapes[SMOKE].drag, dt);

  const particles = world.particles;
  for (let i = particles.count - 1; i >= 0; i--) {
    const p = particles.items[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.killAt(i);
      continue;
    }
    p.px = p.x;
    p.py = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const drag = p.shape === SPARK ? sparkDrag : (p.shape === DEBRIS ? debrisDrag : smokeDrag);
    p.vx *= drag;
    p.vy *= drag;
    p.rot += p.spin * dt;
  }

  const ringDrag = Math.pow(BALANCE.effects.ringDrag, dt);
  const rings = world.rings;
  for (let i = rings.count - 1; i >= 0; i--) {
    const r = rings.items[i];
    r.life -= dt;
    if (r.life <= 0) {
      rings.killAt(i);
      continue;
    }
    r.r += r.vr * dt;
    r.vr *= ringDrag;
  }

  const texts = world.texts;
  for (let i = texts.count - 1; i >= 0; i--) {
    const label = texts.items[i];
    label.life -= dt;
    if (label.life <= 0) {
      texts.killAt(i);
      continue;
    }
    label.y -= BALANCE.effects.textRise * dt;
  }
}
