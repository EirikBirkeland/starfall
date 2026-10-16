// The swarm's flock: where a pack's middle is, which way it is flying, and when it
// commits.
//
// The swarmling (PLAN 3.3, 9:00) is the second kind whose behaviour is a
// *relationship*. It is not an enemy that comes in twenty at a time; it is one thing
// that happens to be made of twenty bodies, and the whole of the kind is in the fact
// that a body cannot answer "where are we going" on its own. So somebody has to hold
// the answer for the pack, and that somebody is this file.
//
// A **pack** is an object created when a swarm arrives (game/waves.js) and referenced
// by every body that arrived with it. It is listed in `world.flocks`, which is how the
// pass below finds them all; a pack whose last body died is dropped from that list and
// goes away with it.
//
// Everything about a pack except its clock is recomputed from the crowd every step,
// for the same reason the shields are (game/shields.js): a middle and a heading are
// facts about twenty positions, and a crowd spends its life moving positions. `n`,
// `sx`, `sy`, `hx`, `hy` are scratch that is zeroed at the top of the pass and filled
// again from the bodies that are still in the crowd, so a body that died last step is
// not in this step's middle and a body that was shoved by a blast moves it.
//
// The **clock** is the other half, and it is deliberately not derived: a pack dives
// together or the kind means nothing, so one pack has one beat and every body in it
// flies the beat it is on. The beat goes `''` (gathering) -> `BRACED` -> `DIVING` ->
// back to gathering. When the brace ends the pack locks the line from its own middle to
// the ship and every body flies that line - one lock, one decision, one thing for the
// player to read, rather than twenty small opinions. It is the same promise the darter
// makes with its warning line and the spitter makes with its mouth: what you were shown
// is what comes, and it was decided before it started.
//
// Nothing here spends a number out of the `logic` stream. A pack's shape comes out of
// where its bodies are standing and out of each one's own `phase`, which is what lets a
// walk that reads it still be a function of the seed and nothing else.

import { BALANCE } from './balance.js';
import { cueBeep } from './cues.js';
import { clamp, hypot } from '../core/math.js';

/** The two named beats of a pack. Between them it is gathering, which is `''`. */
const BRACED = 'brace';
const DIVING = 'dive';

/**
 * How many bodies it takes before a pack is a **clump**.
 *
 * Half the smallest flock the wave director will send (`pack.min`, so this is four) is where a
 * bunch of bodies starts reading as one thing with a shape of its own - and it is where a whole
 * hive's brood sits, because a beat's mouths are neighbours and their bodies fly in one flock
 * (game/bosses.js `openTheCore`). Under it is a pair: two nose lights are already two lights more
 * than anyone can miss, and a ring round every pair a late split hive leaves standing would be a
 * dozen rings where the read wanted three. So the number is asked here, next to the pack it is a
 * fact about, and both the eye that draws a clump's tell (render/flock.js) and the fight that
 * fields one answer from it.
 */
const MIN_BODIES = Math.ceil(BALANCE.kinds.swarmling.pack.min / 2);

/** Is this pack a clump - one thing made of many bodies, rather than a pair that happens to share
 * a clock. */
export function isClump(pack) {
  return pack !== null && pack.n >= MIN_BODIES;
}

/**
 * How far a body of this pack is from its own middle, on average, right now.
 *
 * It comes out of the same two sums as the middle does: the mean of `x^2 + y^2`
 * less the square of the mean is the mean square distance from the middle, so a
 * step costs no extra walk of the crowd and no square root per body - one, at the
 * end. It is derived state, like `cx`/`cy`: nothing in `game/` reads it back, and
 * the only thing that wants it is the tell that goes round the pack
 * (render/flock.js), which needs to know how big a clump it is drawing a ring round.
 */
function spreadOf(pack) {
  const n = pack.n;
  if (n === 0) return 0;
  const mx = pack.sx / n;
  const my = pack.sy / n;
  const mean2 = pack.sq / n - (mx * mx + my * my);
  // Rounding can take a pack standing in one place a hair below zero, and a NaN
  // reaching a radius is a ring that never draws and a bug nobody can see.
  return Math.sqrt(Math.max(0, mean2));
}

/**
 * The pace this pack flies a committed line at, px/s: the mean of the pace of every
 * body still in it (`divePace` for each), so a pack half of which is chilled commits
 * to a shorter lunge than a warm one - which is what it does.
 */
function paceOf(pack) {
  if (pack.n === 0) return 0;
  return (pack.pq / pack.n) * pack.spec.dive.mul;
}

/**
 * A pack of bodies that arrived together and fly together from then on, stood at
 * (x, y) - the place it arrived at, which is its first middle until the crowd says
 * otherwise. `spec` is the kind's own flock numbers.
 */
export function newPack(spec, x, y) {
  return {
    // This step's answer, rebuilt from the crowd every step. `n` is how many bodies
    // are still flying in it, `cx`/`cy` their middle, `hx`/`hy` the average of the way
    // they are pointing (a short vector on purpose: a scattered pack agrees less).
    n: 0,
    sx: 0, sy: 0, sq: 0, pq: 0, hx: 0, hy: 0,
    cx: x, cy: y,
    // How wide the clump is, and how fast it would fly a line. Both rebuilt from the
    // crowd every step, beside the middle they are worked out with.
    spread: 0, pace: 0,
    // The line the whole pack will fly when it commits, and the beat it is on.
    // `stageTime` is what the beat it is in was worth when it began, so the tell can
    // be drawn as a share of the beat it is telling you about.
    dirX: 0, dirY: 0,
    stage: '',
    timer: spec.gather,
    stageTime: spec.gather,
    spec: spec,
  };
}

/** The pack a body flies with, or null for every body that flies alone. */
export function packOf(enemy) {
  return enemy.flock;
}

/** Is this body's pack bunching up for a dive right now - i.e. is it the telegraph. */
export function isBraced(enemy) {
  return isBracing(enemy.flock);
}

/** Is this body's pack committed to its line right now. */
export function isDiving(enemy) {
  return isCommitted(enemy.flock);
}

/** Is this pack bunching up for a dive. Takes the pack, for the eye that draws one tell per pack. */
export function isBracing(pack) {
  return pack !== null && pack.stage === BRACED;
}

/** Is this pack committed to its line. Takes the pack, like `isBracing`. */
export function isCommitted(pack) {
  return pack !== null && pack.stage === DIVING;
}

/**
 * How far through the beat a pack is, 0..1 - the countdown every tell of this pack's
 * is drawn from. It reads the pack's own clock rather than the kind's numbers so that
 * any beat can be counted down, whoever declared it (same deal as `aimProgress` in
 * game/kinds.js), and it is one clock for the whole pack: the arc round the clump and
 * the light at each of its bodies cannot disagree about the time.
 */
export function beatProgress(pack) {
  if (pack === null) return 0;
  return clamp(1 - pack.timer / (pack.stageTime || 1), 0, 1);
}

/**
 * How far through the brace a body's pack is, 0..1, and nothing at all for a body that
 * is not braced. The body's own nose light and the ring round its pack count down off
 * this one number (render/flock.js).
 */
export function braceProgress(enemy) {
  const pack = enemy.flock;
  return isBracing(pack) ? beatProgress(pack) : 0;
}

/** How many bodies are still flying in this pack. */
export function packSize(enemy) {
  const pack = enemy.flock;
  return pack === null ? 0 : pack.n;
}

/**
 * How fast this body flies the line its pack has locked: `dive.mul` times its own pace, with the
 * frost off it because the dive is a walk like every other, and nought for a body with no pack -
 * which has no line and so nothing to fly it at.
 *
 * Exported for `tools/boss-pressure.js`, which has to say how far a brood will have got to across a
 * horizon. The only honest answer is the pace game/kinds.js `committed` actually glides it at, and
 * that is this function, so the tool cannot be reading a dive the game would not fly.
 */
export function divePace(enemy) {
  const pack = packOf(enemy);
  if (pack === null) return 0;
  return enemy.speed * (1 - enemy.frost) * pack.spec.dive.mul;
}

/**
 * The next dive this body will fly: `pace` px/s along the line, `wait` seconds before it starts at
 * all, and `left` seconds of line it has to give. Null only for a body with no pack, which dives
 * never.
 *
 * All three of a pack's beats answer, because a pack's beat is a clock and not a coin toss, and
 * what the clock says is a fact about the room however far off it is. A body already `DIVING` is on
 * its line now: no wait, and as much of the dive as its own timer has left. A `BRACED` one has the
 * whole of `dive.time` in front of it and the bunching to get through first. A gathering one has
 * that same dive plus the rest of the gathering to walk through before the bunching even starts -
 * and a gathering body has promised nothing about *where* it will turn, which is why the read of it
 * is a room it can arrive in and not a lane, and why the walk is not counted: what is claimed is
 * the dive, and never the approach.
 */
export function nextDive(enemy) {
  const pack = packOf(enemy);
  if (pack === null) return null;
  const spec = pack.spec;

  if (pack.stage === DIVING) {
    return { pace: divePace(enemy), wait: 0, left: Math.max(0, pack.timer) };
  }
  if (pack.stage === BRACED) {
    return { pace: divePace(enemy), wait: Math.max(0, pack.timer), left: spec.dive.time };
  }
  return {
    pace: divePace(enemy),
    wait: Math.max(0, pack.timer) + spec.brace,
    left: spec.dive.time,
  };
}

/**
 * One step of every pack in the world: zero the scratch, file the crowd into it, and
 * throw away the packs that nobody is flying in any more. Called before anything is
 * shot at, next to the shield pass, so a pack's middle is the crowd as the step found
 * it - which is the honest thing to tell a body when it asks where its friends are.
 */
export function updateFlocks(world, dt) {
  const packs = world.flocks;
  for (let i = 0; i < packs.length; i++) {
    const pack = packs[i];
    pack.n = 0;
    pack.sx = 0;
    pack.sy = 0;
    pack.sq = 0;
    pack.pq = 0;
    pack.hx = 0;
    pack.hy = 0;
  }

  const crowd = world.enemies;
  for (let i = 0; i < crowd.length; i++) {
    const body = crowd[i];
    const pack = body.flock;
    if (pack === null) continue;
    pack.n++;
    pack.sx += body.x;
    pack.sy += body.y;
    pack.sq += body.x * body.x + body.y * body.y;
    // The same frost `divePace` takes off a body, kept here as a raw pace per body so the
    // pack's own number is the mean of the bodies that are actually flying in it.
    pack.pq += body.speed * (1 - body.frost);
    pack.hx += Math.cos(body.rot);
    pack.hy += Math.sin(body.rot);
  }

  for (let i = packs.length - 1; i >= 0; i--) {
    const pack = packs[i];
    if (pack.n === 0) {
      // The last of them is gone. Nothing references this one any more either, so the
      // arena does not accumulate packs however long a run goes on.
      packs.splice(i, 1);
      continue;
    }
    pack.cx = pack.sx / pack.n;
    pack.cy = pack.sy / pack.n;
    pack.hx /= pack.n;
    pack.hy /= pack.n;
    pack.spread = spreadOf(pack);
    pack.pace = paceOf(pack);
    tickBeat(pack, dt, world.player);
  }
}

/** One step of one pack's clock, and the one line it locks when the brace ends. */
function tickBeat(pack, dt, ship) {
  const spec = pack.spec;
  pack.timer -= dt;
  if (pack.timer > 0) return;

  if (pack.stage === BRACED) {
    // The commit. Locked from the pack's middle, before anything has moved, so the
    // line the player was shown while it bunched is the line every body flies.
    const dx = ship.x - pack.cx;
    const dy = ship.y - pack.cy;
    const away = hypot(dx, dy) || 1;
    pack.dirX = dx / away;
    pack.dirY = dy / away;
    pack.stage = DIVING;
    pack.timer = spec.dive.time;
    pack.stageTime = spec.dive.time;
  } else if (pack.stage === DIVING) {
    pack.stage = '';
    pack.timer = spec.gather;
    pack.stageTime = spec.gather;
  } else {
    // The bunching, and the one buzz for the whole pack: twenty bodies drawing a
    // warning each would be a wall of noise and nobody would read it.
    pack.stage = BRACED;
    pack.timer = spec.brace;
    pack.stageTime = spec.brace;
    cueBeep(spec.sound.freq, spec.sound.dur, spec.sound.wave, spec.sound.vol, spec.sound.slide);
  }
}
