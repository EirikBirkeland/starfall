// The second clock (PLAN 3.4: "Endless mode then continues with all values scaling for as long as
// the player lasts").
//
// A run's own clock is the schedule's. It decides when each fight walks in, and every `ScaleMax` in
// `BALANCE` is spent long before the last of them does - the crowd stops growing at
// `waves.crowdMax`, a body's hull at `enemies.hpScaleMax`, its speed at `enemies.speedScaleMax`,
// all of them inside the first three minutes. So a run that outlasts the schedule and is handed its
// arena back (game/run.js `continueRun`) would otherwise be fought by the crowd it had already
// beaten, for as long as it cared to stay.
//
// This file is the other clock. It counts **minutes past the hand-back** - not past the start of
// the run - because that is the only clock on which every endless run starts at the same place: a
// run that won at 12:00 and one that won at 20:00 both begin endless at zero and grow from the
// height they reached. Four rates in `BALANCE.endless.growth` are read through here and nowhere
// else: how much tougher a body gets, how much faster, how much of a crowd the director may hold,
// and how many bodies that is allowed to stand at once.
//
// Two of them are walls and two are not, and the difference is deliberate:
//
//   **Hull and crowd grow for as long as the run does.** They are what makes an endless run end.
//     Nothing about a tougher body is unfair, only slower, and a build's damage stops improving
//     once the cards have run out while the crowd's does not: eventually there are more bodies
//     standing than the run can clear. That is the ending of every endless run and it is the
//     reason these two are uncapped.
//   **Speed stops** at `enemies.speedScaleCeil`, because a body faster than the ship is not harder
//     to dodge, it is undodgeable, and a crowd you can neither outrun nor stop is a countdown and
//     not a difficulty. The body keeps getting tougher after that instead.
//   **The count of bodies stops** at `growth.bodiesCeil`, which is a frame budget and not a
//     difficulty knob - see the comment on that row.
//
// Nothing here is a state: the whole of it is derived from two numbers already on the world
// (`world.endless` and `world.endlessAt`), which is what keeps a run that has not won untouched by
// every line of it - each growth is exactly 0, and a normal run's trace is byte for byte what it
// always was. `tools/endless-gauge.js` prints the curve these numbers make and `test/endless-growth
// .test.mjs` holds it.

import { BALANCE } from './balance.js';

const SECONDS_PER_MINUTE = 60;

/**
 * How long this run has been flying past its own win, in seconds.
 *
 * Zero for every run that is not endless, and zero on the very step the arena is handed back, so
 * the hand-back is a seam and not a jump: the growth starts from nothing and continues the curve
 * the run was already on.
 */
export function endlessTime(world) {
  if (!world.endless) return 0;
  return Math.max(0, world.elapsed - world.endlessAt);
}

/** The same clock in minutes, which is the unit every growth row is written in. */
export function endlessMinutes(world) {
  return endlessTime(world) / SECONDS_PER_MINUTE;
}

/**
 * What the endless clock has added to a body's hull, on top of the schedule's own scaling.
 * Uncapped: this is the number that eventually ends an endless run (see the header).
 */
export function hullGrowth(world) {
  return endlessMinutes(world) * BALANCE.endless.growth.hullPerMinute;
}

/**
 * What it has added to a body's speed. Capped by `enemies.speedScaleCeil`, which the caller
 * applies to the *total*, so the schedule's own ramp and this one share one wall.
 */
export function speedGrowth(world) {
  return endlessMinutes(world) * BALANCE.endless.growth.speedPerMinute;
}

/** What it has added to the wave director's crowd budget, in points of enemy (game/waves.js). */
export function crowdGrowth(world) {
  return endlessMinutes(world) * BALANCE.endless.growth.crowdPerMinute;
}

/**
 * How many bodies the ceiling on standing bodies has been lifted by. Capped by
 * `growth.bodiesCeil` where it is applied, in game/waves.js `bodyCeiling`.
 */
export function bodyGrowth(world) {
  return endlessMinutes(world) * BALANCE.endless.growth.bodiesPerMinute;
}
