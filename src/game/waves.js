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
// Both of the walls here have a second, slower clock behind them for a run that has been
// handed its arena back after winning: the budget past `crowdMax` and the count of bodies past
// `maxBodies` are both grown by game/endless.js, and are exactly 0 for every other run. The
// director itself does not care which of the two clocks is spending it.
//
// This file is also the one place that decides *where* an enemy may appear: just off
// the part of the arena the player can see, and never on top of them - with the one
// exception of a kind that cannot walk, which has to be landed where the player can
// see it and shoot back at it (`arrivalSpotFor`). `spawnEnemy` is the primitive every
// arrival goes through, and it answers the enemy it placed or null when there was
// nowhere to put it.
//
// A wave spends exactly one roll of the `logic` stream per member, however many
// kinds have unlocked, so adding a kind to the roster cannot move a run that never
// meets it, and two more rolls per body of a pack (see `aroundTheAnchor`). Once the
// run is eight minutes old a wave may want a gold body, which costs two or three more
// rolls per wave - whether it carries a leader, what kind it is, and where in the fan
// it stands - and none at all before then: see game/elite.js.

import { BALANCE } from './balance.js';
import { KINDS, kindOf, makeEnemy } from './kinds.js';
import { rollElite } from './elite.js';
import { newPack } from './flock.js';
import { logic } from '../core/rng.js';
import { dist2, TAU } from '../core/math.js';
import { noteArrival } from './tally.js';
import { crowdGrowth, bodyGrowth } from './endless.js';

const EDGES = 4;   // an arrival with no bearing picks one of four sides

// A minute is a unit, not a tuning number: `crowdPerMinute` is written the way a
// designer would say it and this is what turns the run's clock into minutes.
const SECONDS_PER_MINUTE = 60;

/**
 * Every kind the director may buy, in the order it rolls them. The kinds cannot
 * change while the game is running, so the roster is built once here rather than
 * assembled for every wave.
 */
const ROSTER = Object.keys(KINDS).map((name) => {
  const stats = KINDS[name].stats;
  return {
    type: name,
    from: stats.from,
    cost: stats.cost,
    weight: stats.weight,
    // What one *arrival* of this kind has to be paid for. A pack is not one body: the
    // roll that wants one has to be able to buy the smallest one worth the name, or it
    // would buy a swarm two bodies deep and call it a swarm.
    price: stats.pack === undefined ? stats.cost : stats.cost * stats.pack.min,
    pack: stats.pack === undefined ? null : stats.pack,
  };
});

/**
 * The scratch list `pickMember` refills on every call. A wave is bought in the middle
 * of a step, and the game's rule is that the per-step loops do not allocate.
 */
const ELIGIBLE = [];

/** The scratch slots `sendWave` buys its members into: { type, elite, count } each. */
const BUY = [];

/** `pickMember`'s third argument, spelled out: may a pack be rolled? */
const WITH_PACKS = true;
const NO_PACKS = false;

/** A nudge that did not fit tries this much closer to the anchor before giving up. */
const NUDGE_RETRY = 0.5;

/** What the run may hold right now, in points of enemy. */
export function crowdBudget(world) {
  const spec = BALANCE.waves;
  const grown = spec.crowdBase + world.elapsed / SECONDS_PER_MINUTE * spec.crowdPerMinute;
  // The schedule's curve, and then whatever the endless clock has added to it (game/endless.js).
  // That second term is 0 for every run that has not been handed its arena back, which is what keeps
  // a normal run's budget exactly where it always was - the ceiling in the middle of this expression
  // is the schedule's and nothing else may lean on it.
  return Math.min(spec.crowdMax, grown) + crowdGrowth(world);
}

/**
 * How many bodies may be standing in the arena at once, wherever the budget has got to.
 *
 * The two are different walls on purpose: the budget is a difficulty and this is a frame budget
 * (`waves.maxBodies`, and `endless.growth.bodiesCeil` for how far endless may lift it). A crowd is
 * only as big as the smaller of the two, and before the endless clock existed the schedule's own
 * budget reached its ceiling at about the same moment the body wall did, which is why one number
 * appeared to be doing the work of both.
 */
export function bodyCeiling(world) {
  const spec = BALANCE.waves;
  // Floored: this counts bodies, and a fractional one would be bought as a fractional pack
  // (`packFits` hands the difference to a loop). The lift is a rate per minute and lands on whole
  // bodies one at a time, which is also how the crowd notices it.
  return Math.min(spec.maxBodies + Math.floor(bodyGrowth(world)), BALANCE.endless.growth.bodiesCeil);
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
 * "Afford" is the whole trick of the roster: a body costs its kind's `cost` and a pack
 * costs its smallest size (see `price` above), so a swarm is rolled when there is room
 * for a swarm and never when there is room for a body.
 *
 * `packs` may be given as false to keep packs out of the roll - which is how an elite
 * is chosen, and how a wave that has already bought its swarm buys the rest.
 *
 * Exactly one number out of the logic stream, whatever the roster holds.
 */
export function pickMember(world, points, packs) {
  // One pass decides who is eligible and the next one walks them. The same test must
  // not be written twice, or the two copies can drift apart and hand out a kind that
  // was never counted in the roll.
  const eligible = ELIGIBLE;
  eligible.length = 0;
  let total = 0;
  for (let i = 0; i < ROSTER.length; i++) {
    const row = ROSTER[i];
    if (packs === NO_PACKS && row.pack !== null) continue;
    if (world.elapsed >= row.from && row.price <= points) {
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
 * The part of the glass a body that cannot walk may be landed in: inside the window
 * by `inset` more than its own body, so the whole of it and the light of its arrival
 * are on the screen, and inside the arena by its own body. Answers null when those
 * two do not overlap - a window too narrow to hold the body clear of its frame.
 */
function sightBox(world, radius, inset) {
  const ship = world.player;
  const halfW = world.view.w / 2 - radius - inset;
  const halfH = world.view.h / 2 - radius - inset;
  const box = {
    x0: Math.max(ship.x - halfW, radius),
    x1: Math.min(ship.x + halfW, world.arena.w - radius),
    y0: Math.max(ship.y - halfH, radius),
    y1: Math.min(ship.y + halfH, world.arena.h - radius),
  };
  return box.x1 > box.x0 && box.y1 > box.y0 ? box : null;
}

/**
 * Somewhere a body that cannot walk out to meet the player is landed: on the glass,
 * and `min` px of standing room from the ship.
 *
 * This is the one exception to the rule that an arrival comes in off the edge of the
 * window, and it exists because the rule is about not appearing in somebody's face.
 * A body that cannot be run to and cannot be run off has to be where the player can
 * see it and shoot back at it, or it is a turret nobody can answer; the distance half
 * of the rule is kept instead, by `min`, and the kind announces itself landing
 * (kinds.js `onArrive`). Answers null only when there is no such place on the glass.
 */
function inSightSpot(world, stats) {
  const spec = stats.inSight;
  const ship = world.player;
  const box = sightBox(world, stats.radius, spec.inset);
  if (box === null) return null;

  const spot = { x: box.x0, y: box.y0 };
  for (let i = 0; i < BALANCE.waves.attempts; i++) {
    spot.x = logic.range(box.x0, box.x1);
    spot.y = logic.range(box.y0, box.y1);
    if (dist2(spot.x, spot.y, ship.x, ship.y) >= spec.min * spec.min) return spot;
  }

  // Out of tries on a window too small to offer the distance it likes. Land it on
  // whichever corner of what is on the glass is furthest from the ship, which is the
  // same rule read as far as the screen allows rather than not arriving at all.
  const edge = [box.x0, box.x1];
  const across = [box.y0, box.y1];
  let bestBy = -1;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const by = dist2(edge[i], across[j], ship.x, ship.y);
      if (by <= bestBy) continue;
      bestBy = by;
      spot.x = edge[i];
      spot.y = across[j];
    }
  }
  return spot;
}

/**
 * Where a body of this kind comes in: off the edge of the window, like everything
 * else, unless its kind says it cannot walk - and then in sight of the player, on the
 * far side of the rule that keeps an arrival out of your face (`inSightSpot`).
 */
function arrivalSpotFor(world, stats, bearing) {
  if (stats.arrival === 'inSight') return inSightSpot(world, stats);
  return arrivalSpot(world, stats.radius, bearing);
}

/**
 * Stand one enemy of `type` (rolled from the roster when no type is given) on the
 * edge of what the player can see, optionally at a bearing from the ship, optionally
 * gold (game/elite.js). Answers the enemy, or null when there was nowhere to put it
 * or the crowd is full.
 *
 * This is a *single* body: asking for a swarmling by name brings one of them, not a
 * pack. A pack arrives through a wave, which is the only thing that can pay for one.
 */
export function spawnEnemy(world, type, bearing, elite) {
  if (world.enemies.length >= bodyCeiling(world)) return null;
  const name = type || pickMember(world, Infinity);
  const spot = arrivalSpotFor(world, kindOf(name).stats, bearing);
  return placeEnemy(world, name, spot, elite === true, null);
}

/**
 * The scratch `makeEnemy` is handed, refilled per arrival. Hoisted because a wave is
 * bought in the middle of a step: `makeEnemy` reads what it is told and keeps nothing.
 */
const PLACE = { elite: false, flock: null };

/**
 * Put one body of `type` on a spot somebody already decided was allowed, flying with
 * `pack` if it belongs to one. The last word on the ceiling of bodies, because every
 * arrival comes through here.
 */
function placeEnemy(world, type, spot, elite, pack) {
  if (spot === null || world.enemies.length >= bodyCeiling(world)) return null;
  PLACE.elite = elite === true;
  PLACE.flock = pack === undefined ? null : pack;
  const enemy = makeEnemy(world, type, spot.x, spot.y, PLACE);
  world.enemies.push(enemy);
  noteArrival(world, enemy);
  // Whatever the kind wants said about its arrival - a sniper lights itself landing
  // and starts its first wait (game/kinds.js). A body built directly by a test or by
  // the title screen's crowd is not an arrival and hears nothing about it.
  if (enemy.kind.onArrive) enemy.kind.onArrive(world, enemy);
  return enemy;
}

/**
 * Arrive a pack: `count` bodies of a swarming kind in a clump on one side of the
 * window, all of them flying together from here on (game/flock.js). The clump takes
 * one place in the wave's fan, so a swarm comes in off one side rather than smeared
 * along all of them - which is the whole point of the kind: it is one arrival.
 *
 * Answers the bodies that got somewhere to stand, which is fewer than `count` only
 * when the clump hangs over the edge of the world or the arena fills up mid-arrival.
 */
function spawnPack(world, type, count, bearing) {
  const stats = kindOf(type).stats;
  const anchor = arrivalSpot(world, stats.radius, bearing);
  const arrived = [];
  if (anchor === null) return arrived;

  const pack = newPack(stats.flock, anchor.x, anchor.y);
  world.flocks.push(pack);
  for (let i = 0; i < count; i++) {
    const spot = aroundTheAnchor(world, anchor, stats.pack.clump, stats.radius);
    const body = placeEnemy(world, type, spot, false, pack);
    if (body !== null) arrived.push(body);
  }
  return arrived;
}

/**
 * Somewhere a body of a pack may stand: an allowed arrival, and still off the window.
 * The anchor is both, but a clump reaches `clump` px in every direction and a body
 * shoved back inside the player's view would be an enemy arriving in plain sight.
 */
function spotFits(world, spot, radius) {
  if (!arrivalFits(world, spot, radius)) return false;
  const ship = world.player;
  return Math.abs(spot.x - ship.x) > world.view.w / 2
    || Math.abs(spot.y - ship.y) > world.view.h / 2;
}

/**
 * One body of a pack: the anchor, nudged off in a random direction by up to `clump`
 * px. A nudge that goes outside the world, too near the ship, or back inside the
 * player's view is not worth another roll - the anchor is somewhere every one of them
 * is allowed to stand - so this spends two numbers of the stream per body, tries half
 * as far in once, and never fails to arrive.
 */
function aroundTheAnchor(world, anchor, clump, radius) {
  const angle = logic.range(0, TAU);
  const reach = logic.range(0, clump);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  let spot = { x: anchor.x + cos * reach, y: anchor.y + sin * reach };
  if (spotFits(world, spot, radius)) return spot;
  spot = { x: anchor.x + cos * reach * NUDGE_RETRY, y: anchor.y + sin * reach * NUDGE_RETRY };
  return spotFits(world, spot, radius) ? spot : anchor;
}

/**
 * How many bodies of a pack fit in `room` points with `bodiesLeft` places left in the
 * arena: as many as the kind ever brings, cut down by the room and by the ceiling, and
 * none at all if fewer than its smallest worth the name would fit. 0 means "do not
 * send this swarm", 1 means "this kind is not a pack at all".
 */
function packFits(stats, room, bodiesLeft) {
  const pack = stats.pack;
  if (pack === undefined) return 1;
  const can = Math.min(pack.into, Math.floor(room / stats.cost), bodiesLeft);
  return can >= pack.min ? can : 0;
}

/**
 * One step of an even walk from `from` to `to`: the i-th of `count` of them.
 */
function acrossFan(from, to, i, count) {
  return count === 1 ? from : from + (to - from) * i / (count - 1);
}

/**
 * Send one wave with `points` of room to spend, and report what arrived.
 *
 * The buying stops when the room cannot afford another member or the wave has as
 * many bodies as one wave is allowed, so a wave of tanks and a wave of drifters are
 * both a wave. Their bearings are spread evenly across the fan around the one the
 * wave picked, so a group reads as a group coming in.
 *
 * One member is not always one body. A kind that comes in a pack (swarmling) buys as
 * many bodies as the room and the arena have room for, up to its own ceiling, and
 * takes *one* place in the fan for all of them: a swarm is a wave spending itself on
 * a crowd, in the same way an elite is a wave spending itself on one big body.
 *
 * One of them may be gold (game/elite.js), and up to three rolls decide it: whether
 * this wave carries a leader at all, what kind it is, and where in the fan it stands.
 * So a gold body arrives as a wave with a leader, never as a screenful of gold.
 *
 * The leader is bought *first*, at a gold body's price, and the escort is bought with
 * whatever room is left over. That order is the point: an elite is a wave spending
 * itself on one bigger body rather than a wave with something extra on top, and the
 * room it costs is the same room that would otherwise have been two more bodies. It
 * also means the seat is always a place that exists, because it is rolled over the
 * members the wave actually bought - and since the leader is bought before any of
 * them, it is dealt into its seat afterwards rather than waiting at the front. A gold
 * body is always one body: a pack is excluded from that roll.
 *
 * The one way a wave wants a leader and does not get one is a room too small to pay
 * for a gold body of any kind that has unlocked; then the wave arrives plain and
 * spends the room on bodies instead. `waves.waveMinPoints` is what keeps that
 * theoretical - it is at least one gold body of the cheapest kind, and test/elite
 * asserts the lockstep.
 *
 * Answers null when not one of them found somewhere to stand, which only happens
 * on a window that already shows the whole arena. The room is none the worse for
 * the attempt: nothing arrived, so nothing was spent.
 */
function sendWave(world, points) {
  const spec = BALANCE.waves;
  const goldPrice = BALANCE.elite.costMul;
  const bearing = logic.range(0, TAU);
  const bodyRoom = bodyCeiling(world) - world.enemies.length;

  const types = BUY;
  types.length = 0;
  let left = points;
  let bodies = 0;
  let led = false;
  let packed = false;
  if (rollElite(world)) {
    // The kind is rolled out of the room divided by the gold price, so the one that
    // comes back is a kind this wave can actually pay for gold.
    const type = pickMember(world, left / goldPrice, NO_PACKS);
    if (type !== null) {
      types.push({ type: type, elite: true, count: 1 });
      left -= kindOf(type).stats.cost * goldPrice;
      bodies = 1;
      led = true;
    }
  }

  while (types.length < spec.maxMembers) {
    // One swarm per wave, for the same reason a wave carries one leader: two packs
    // arriving at once is not one thing coming in, it is a screenful.
    const type = pickMember(world, left, packed ? NO_PACKS : WITH_PACKS);
    if (type === null) break;
    const stats = kindOf(type).stats;
    const count = packFits(stats, left, bodyRoom - bodies);
    // A swarm the arena has no room for is not worth rolling again, and nothing else
    // can come after it: stop. For every other kind `count` is one and the room is the
    // only limit, exactly as it always was - which is what keeps a wave bought before
    // 9:00 rolling the same numbers it did before packs existed.
    if (count === 0) break;
    if (stats.pack !== undefined) packed = true;
    types.push({ type: type, elite: false, count: count });
    left -= stats.cost * count;
    bodies += count;
  }

  // Which place in the fan the leader takes. A wave of one is that one, wherever it
  // stands, so the roll is not spent on a seat nobody can be given.
  const seat = led && types.length > 1 ? logic.int(0, types.length - 1) : 0;

  const members = [];
  for (let i = 0; i < types.length; i++) {
    // The leader came in at the front of the buying list; this lifts it to its seat
    // and lets the escort wrap round behind it, keeping the order it was bought in.
    const slot = types.length === 1 ? 0 : (i + seat) % types.length;
    const across = acrossFan(-spec.fan / 2, spec.fan / 2, slot, types.length);
    if (types[i].count === 1) {
      const enemy = spawnEnemy(world, types[i].type, bearing + across, types[i].elite);
      if (enemy !== null) members.push(enemy);
    } else {
      // One member, many bodies, one bearing: the swarm takes the place it was bought
      // in and stands all of them there (game/flock.js).
      const pack = spawnPack(world, types[i].type, types[i].count, bearing + across);
      for (let b = 0; b < pack.length; b++) members.push(pack[b]);
    }
  }
  if (members.length === 0) return null;

  world.waveNumber++;
  return {
    number: world.waveNumber,
    bearing: bearing,
    asked: types.length,
    bodies: members.length,
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
  // A boss is in the arena, or its siren has gone and it is on its way: the director holds
  // (PLAN 3.4). Not a question asked of game/bosses.js, because that would be a cycle for
  // one field - `world.boss` is the whole of the answer and game/bosses.js owns it.
  if (world.boss !== null) return null;
  world.spawnTimer -= dt;
  if (world.spawnTimer > 0) return null;

  const room = roomToSpare(world);
  if (room < spec.waveMinPoints || world.enemies.length >= bodyCeiling(world)) {
    world.spawnTimer = spec.retry;
    return null;
  }

  const wave = sendWave(world, Math.min(room, spec.waveMaxPoints));
  world.spawnTimer = logic.range(spec.gap[0], spec.gap[1]);
  return wave;
}
