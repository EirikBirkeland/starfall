// The wave director: how much of a crowd the run may hold, and what the room left
// in that buys.
//
// It is one budget. `BALANCE.waves` says how many points of enemy the arena will
// hold at this moment of the run and that grows with the clock; every kind costs
// points (its `cost` in balance.js). When the crowd standing in the arena is worth
// less than the budget by at least a wave's worth, the director spends the room on
// a wave: kinds rolled from the ones that have unlocked so far, weighted, each one
// paying for itself out of the room until the room or the wave is used up, and the
// lot of them arriving off one side of the screen rather than all over it.
//
// So the crowd sits at about the budget, and there are exactly two ways to make the
// next wave come sooner: wait, and the budget grows; or kill, and the room opens.
// Running away does neither - it just keeps the same crowd on screen - which is the
// whole reason the run tightens as it goes.
//
// This file is also the one place that decides *where* an enemy may appear: just off
// the part of the arena the player can see, and never on top of them. `spawnEnemy`
// is the primitive every arrival goes through, and it answers the enemy it placed
// or null when there was nowhere to put it.
//
// A wave spends exactly one roll of the `logic` stream per member, however many
// kinds have unlocked, so adding a kind to the roster cannot move a run that never
// meets it. Once the run is eight minutes old a wave may want a gold body, which
// costs two more rolls per wave and none at all before then - see game/elite.js.

import { BALANCE } from './balance.js';
import { KINDS, kindOf, makeEnemy } from './kinds.js';
import { rollElite } from './elite.js';
import { logic } from '../core/rng.js';
import { dist2, TAU } from '../core/math.js';

const EDGES = 4;   // an arrival with no bearing picks one of four sides

// A minute is a unit, not a tuning number: `crowdPerMinute` is written the way a
// designer would say it and this is what turns the run's clock into minutes.
const SECONDS_PER_MINUTE = 60;

/**
 * Every kind the director may buy, in the order it rolls them. The kinds cannot
 * change while the game is running, so the roster is built once here rather than
 * assembled for every wave.
 */
const ROSTER = Object.keys(KINDS).map((name) => ({
  type: name,
  from: KINDS[name].stats.from,
  cost: KINDS[name].stats.cost,
  weight: KINDS[name].stats.weight,
}));

/**
 * The scratch list `pickMember` refills on every call. A wave is bought in the middle
 * of a step, and the game's rule is that the per-step loops do not allocate.
 */
const ELIGIBLE = [];

/** The scratch slots `sendWave` buys its members into: { type, elite } for each. */
const BUY = [];

/** What the run may hold right now, in points of enemy. */
export function crowdBudget(world) {
  const spec = BALANCE.waves;
  const grown = spec.crowdBase + world.elapsed / SECONDS_PER_MINUTE * spec.crowdPerMinute;
  return Math.min(spec.crowdMax, grown);
}

/**
 * What is standing in the arena, in the same points. A hatchling counts as its
 * kind, not as its smaller body: the budget is about how much of a crowd the run
 * is fighting, and two hatchlings are a tank's worth of dying to do. An elite
 * counts as `costMul` of its kind (game/elite.js), because that is what one is
 * worth to fight - and the same number is what an arrow at the window edge reads.
 */
export function crowdCost(world) {
  let spent = 0;
  for (let i = 0; i < world.enemies.length; i++) spent += world.enemies[i].cost;
  return spent;
}

/** How much room the budget has left, which is what a wave is bought with. */
export function roomToSpare(world) {
  return crowdBudget(world) - crowdCost(world);
}

/**
 * Roll one kind for the director: from the kinds that have unlocked and that `points`
 * can actually afford, weighted by what each is worth. Answers a kind name, or null
 * when nothing is affordable - which is how the buying loop knows to stop.
 *
 * Exactly one number out of the logic stream, whatever the roster holds.
 */
export function pickMember(world, points) {
  // One pass decides who is eligible and the next one walks them. The same test must
  // not be written twice, or the two copies can drift apart and hand out a kind that
  // was never counted in the roll.
  const eligible = ELIGIBLE;
  eligible.length = 0;
  let total = 0;
  for (let i = 0; i < ROSTER.length; i++) {
    const row = ROSTER[i];
    if (world.elapsed >= row.from && row.cost <= points) {
      eligible.push(row);
      total += row.weight;
    }
  }
  if (eligible.length === 0) return null;

  let roll = logic.next() * total;
  for (let i = 0; i < eligible.length; i++) {
    const row = eligible[i];
    if (roll >= row.weight) { roll -= row.weight; continue; }
    return row.type;
  }
  // Only reachable on the last decimal of a roll that landed exactly on the end.
  return eligible[eligible.length - 1].type;
}

/** A point on the border of a box, picked by side and then along that side. */
function onBoxEdge(box, side) {
  switch (side) {
    case 0: return { x: logic.range(box.x0, box.x1), y: box.y0 };
    case 1: return { x: box.x1, y: logic.range(box.y0, box.y1) };
    case 2: return { x: logic.range(box.x0, box.x1), y: box.y1 };
    default: return { x: box.x0, y: logic.range(box.y0, box.y1) };
  }
}

/** The arena's own border, pulled in by `margin`. */
function arenaBox(world, margin) {
  return {
    x0: margin, y0: margin,
    x1: world.arena.w - margin, y1: world.arena.h - margin,
  };
}

/** The border of the window, pushed out by `margin` and centred on the ship. */
function viewBox(world, margin) {
  const ship = world.player;
  const halfW = world.view.w / 2 + margin;
  const halfH = world.view.h / 2 + margin;
  return {
    x0: ship.x - halfW, x1: ship.x + halfW,
    y0: ship.y - halfH, y1: ship.y + halfH,
  };
}

/**
 * Where the border of the window lies along a ray out of the ship. The wave's
 * members are stood on this, so a wave arrives from one side of the screen and the
 * player can see the whole of it coming.
 */
function borderOnRay(world, angle, margin) {
  const ship = world.player;
  const cx = Math.cos(angle);
  const sy = Math.sin(angle);
  const reachX = cx === 0 ? Infinity : (world.view.w / 2 + margin) / Math.abs(cx);
  const reachY = sy === 0 ? Infinity : (world.view.h / 2 + margin) / Math.abs(sy);
  const reach = Math.min(reachX, reachY);
  return { x: ship.x + cx * reach, y: ship.y + sy * reach };
}

/** Somewhere an enemy is allowed to stand: inside the arena, not on the ship. */
function arrivalFits(world, spot, radius) {
  if (spot.x < radius || spot.x > world.arena.w - radius) return false;
  if (spot.y < radius || spot.y > world.arena.h - radius) return false;
  const min = BALANCE.waves.minDistance;
  return dist2(spot.x, spot.y, world.player.x, world.player.y) > min * min;
}

/**
 * Where the next enemy comes from. With a bearing - which is how a wave arrives -
 * that is the point on the border of the window the ship is looking past in that
 * direction; when the arena is not there (the ship is in a corner of it) the try
 * fans out on either side. Without one, any point on that border will do.
 *
 * When the arena is smaller than the window there is no `off the screen` left to
 * use, and the arena's own edge is the next best thing. Answers null when neither
 * fits - a window that is already full of arena does not need more of it.
 */
function arrivalSpot(world, radius, bearing) {
  const spec = BALANCE.waves;
  const margin = radius + spec.margin;
  const attempts = spec.attempts;

  if (bearing !== undefined) {
    // Straight there first, then further and further round either way.
    const offsets = [0, -spec.fanRetry, spec.fanRetry, -2 * spec.fanRetry, 2 * spec.fanRetry];
    for (let i = 0; i < offsets.length; i++) {
      const spot = borderOnRay(world, bearing + offsets[i], margin);
      if (arrivalFits(world, spot, radius)) return spot;
    }
  }

  const atTheEdge = viewBox(world, margin);
  for (let i = 0; i < attempts; i++) {
    const spot = onBoxEdge(atTheEdge, logic.int(0, EDGES - 1));
    if (arrivalFits(world, spot, radius)) return spot;
  }

  const onTheArena = arenaBox(world, radius);
  for (let i = 0; i < attempts; i++) {
    const spot = onBoxEdge(onTheArena, logic.int(0, EDGES - 1));
    if (arrivalFits(world, spot, radius)) return spot;
  }
  return null;
}

/**
 * Stand one enemy of `type` (rolled from the roster when no type is given) on the
 * edge of what the player can see, optionally at a bearing from the ship, optionally
 * gold (game/elite.js). Answers the enemy, or null when there was nowhere to put it
 * or the crowd is full.
 */
export function spawnEnemy(world, type, bearing, elite) {
  if (world.enemies.length >= BALANCE.waves.maxBodies) return null;
  const name = type || pickMember(world, Infinity);
  const spot = arrivalSpot(world, kindOf(name).stats.radius, bearing);
  if (spot === null) return null;
  const enemy = makeEnemy(world, name, spot.x, spot.y, elite ? ELITE : null);
  world.enemies.push(enemy);
  return enemy;
}

/**
 * One step of an even walk from `from` to `to`: the i-th of `count` of them.
 */
function acrossFan(from, to, i, count) {
  return count === 1 ? from : from + (to - from) * i / (count - 1);
}

/** What `makeEnemy` is told when a member arrives gold. Hoisted: a wave is bought mid-step. */
const ELITE = { elite: true };

/**
 * Send one wave with `points` of room to spend, and report what arrived.
 *
 * The buying stops when the room cannot afford another member or the wave has as
 * many bodies as one wave is allowed, so a wave of tanks and a wave of drifters are
 * both a wave. Their bearings are spread evenly across the fan around the one the
 * wave picked, so a group reads as a group coming in.
 *
 * One of them may be gold (game/elite.js). Two rolls decide it - whether this wave
 * carries an elite, and which member of it - so a gold body arrives as a wave with a
 * leader standing somewhere unpredictable in the fan, never as a screenful of gold.
 * A wave that never grows to have that many members carries none, and a gold member
 * the room cannot pay for arrives plain: the room is what limits how many bodies and
 * how much of a crowd the run is fighting, gold or not.
 *
 * Answers null when not one of them found somewhere to stand, which only happens
 * on a window that already shows the whole arena. The room is none the worse for
 * the attempt: nothing arrived, so nothing was spent.
 */
function sendWave(world, points) {
  const spec = BALANCE.waves;
  const goldPrice = BALANCE.elite.costMul;
  const bearing = logic.range(0, TAU);
  const seat = rollElite(world) ? logic.int(0, spec.maxMembers - 1) : -1;

  const types = BUY;
  types.length = 0;
  let left = points;
  while (types.length < spec.maxMembers) {
    // A gold member is bought out of the same room as everyone else, at its own
    // price; when what is left of the room cannot pay that, this member arrives
    // plain and the wave carries no elite.
    let gold = types.length === seat;
    let type = pickMember(world, gold ? left / goldPrice : left);
    if (type === null) {
      gold = false;
      type = pickMember(world, left);
      if (type === null) break;
    }

    types.push({ type: type, elite: gold });
    left -= kindOf(type).stats.cost * (gold ? goldPrice : 1);
  }

  const members = [];
  for (let i = 0; i < types.length; i++) {
    const across = acrossFan(-spec.fan / 2, spec.fan / 2, i, types.length);
    const enemy = spawnEnemy(world, types[i].type, bearing + across, types[i].elite);
    if (enemy !== null) members.push(enemy);
  }
  if (members.length === 0) return null;

  world.waveNumber++;
  return {
    number: world.waveNumber,
    bearing: bearing,
    asked: types.length,
    points: points - left,
    members: members,
  };
}

/**
 * The director's tick, in place of the old spawn clock. `world.spawnTimer` is how
 * long until the next wave is allowed; it counts down every step, and when it runs
 * out the director either spends the room on a wave or looks again shortly.
 *
 * Answers the wave that arrived, or null when there was nothing to spend - or when
 * the wave found nowhere to come in, which costs the run nothing.
 */
export function updateWaves(world, dt) {
  const spec = BALANCE.waves;
  world.spawnTimer -= dt;
  if (world.spawnTimer > 0) return null;

  const room = roomToSpare(world);
  if (room < spec.waveMinPoints || world.enemies.length >= spec.maxBodies) {
    world.spawnTimer = spec.retry;
    return null;
  }

  const wave = sendWave(world, Math.min(room, spec.waveMaxPoints));
  world.spawnTimer = logic.range(spec.gap[0], spec.gap[1]);
  return wave;
}
