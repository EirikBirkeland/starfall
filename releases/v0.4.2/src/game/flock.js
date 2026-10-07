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

import { cueBeep } from './cues.js';
import { clamp } from '../core/math.js';

/** The two named beats of a pack. Between them it is gathering, which is `''`. */
const BRACED = 'brace';
const DIVING = 'dive';

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
    sx: 0, sy: 0, hx: 0, hy: 0,
    cx: x, cy: y,
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
  const pack = enemy.flock;
  return pack !== null && pack.stage === BRACED;
}

/** Is this body's pack committed to its line right now. */
export function isDiving(enemy) {
  const pack = enemy.flock;
  return pack !== null && pack.stage === DIVING;
}

/**
 * How far through the brace a pack is, 0..1 - the countdown the tell is drawn from,
 * and nothing at all for a body that is not braced. It reads the pack's own clock
 * rather than the kind's numbers so that any beat can be counted down, whoever
 * declared it (same deal as `aimProgress` in game/kinds.js).
 */
export function braceProgress(enemy) {
  const pack = enemy.flock;
  if (pack === null || pack.stage !== BRACED) return 0;
  return clamp(1 - pack.timer / (pack.stageTime || 1), 0, 1);
}

/** How many bodies are still flying in this pack. */
export function packSize(enemy) {
  const pack = enemy.flock;
  return pack === null ? 0 : pack.n;
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
    const away = Math.hypot(dx, dy) || 1;
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
