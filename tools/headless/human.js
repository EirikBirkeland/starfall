// The bot that dodges like a person and not like a program.
//
// `aware` (tools/headless/bot.js) is not a person. It re-reads the whole arena every
// simulation step, it answers every shot, telegraph and bomber circle in the world, and it
// commits to the exact direction the arithmetic asked for. That is why half a careless batch
// of its runs outlives fifteen minutes and why PLAN 10's `4:00-9:00` cannot be answered with
// it (tools/difficulty-arc.js). This file is the same eyes behind slower hands: the same
// threat reading, at the rate a person can use it.
//
// Three limits, and every one of them is a thing a player would admit to:
//
//   * it re-decides on a human clock and holds the answer in between - a look every fifth of
//     a second, not every step. This is where "it notices a threat only once it is nearer than
//     the aware bot lets it see" comes from, and it comes from for free: a shot that appears
//     two frames after the last look is news for a fifth of a second, and by then it has
//     landed. Nothing had to be modelled to get it, which is why the threat model itself is
//     left alone - scaling SKILL down to fake a worse pair of eyes would be inventing a
//     blindness that latency already explains.
//   * a quarter of its looks are not at the field. The eyes are on the body chasing them, or
//     on the shard pile, or on the three little hull marks in the corner, and the shots are
//     what they were when the player last looked. When it is not looking it is not standing
//     still, it is doing the ordinary thing - backing off from whatever is close, drifting in
//     towards the middle otherwise - which is what `idle` is for and is why the caller owns it.
//   * what it commits to is not quite the direction it saw. Keys are all-or-nothing (that
//     part is `drive` in bot.js) and a hand lands on the key a moment after the mind chose
//     the way, so the held direction is the wanted one turned by a small angle.
//
// What is *not* here: aim, card choice, dashing, or anything about the game's numbers. This
// file is the player's skill and nothing else, and every number in it is the bot's, not the
// game's - change one and you have changed the player, exactly like SKILL in threats.js.
//
// Its randomness is its own (`dice` below, salted away from the card picker's), reseeded from
// the run so a seed is always the same person having the same afternoon. A bot's draws never
// touch the game's stream; that rule is what keeps `--seed` meaning what it says.

import { Rng } from '../../src/core/rng.js';
import { SKILL, escapeDirection } from './threats.js';

/**
 * How good this player is, in the only three units that matter: seconds, a share of its
 * attention, and radians. Meaningful against each other and against SKILL, and nowhere else.
 *
 *   lookEvery   how often the eyes come back to the field. A person already watching for a
 *               thing answers in 200-250 ms; the aware bot re-decides every 8.3 ms step and
 *               re-presses every frame, which is some twenty times more often than anybody
 *               commits to a new direction. A fifth of a second is also about one saccade:
 *               a gaze does not move continuously, it lands and it stays.
 *   lookJitter  the same interval, plus or minus this share. Nobody is a metronome, and a
 *               fixed 0.20 s would put the bot in step with the game's own cycles - a
 *               darter's aim timer, a spitter's breath - which is an artefact of the tool
 *               and not a skill.
 *   attention   the share of looks that take in the whole field. One in four is spent on
 *               something else, which is how a real player describes the deaths they did not
 *               see coming and is the leak that makes this a mid-skill ruler rather than a
 *               slower copy of the aware bot. It is a dial first and a number second: run it
 *               at 0.95 and the arc moves minutes (NOTES, session 89), which is the point of
 *               having a third player at all - a curve measured at one skill is a point.
 *   fumble      radians, either side, that the committed direction can be off by. About 13
 *               degrees: enough that a dodge made at the last moment clips the line it was
 *               meant to clear, not enough to walk the ship into anything.
 */
export const HUMAN = {
  lookEvery: 0.2,
  lookJitter: 0.3,
  attention: 0.75,
  fumble: 0.22,
};

/**
 * The same three keys, set to three kinds of afternoon.
 *
 * They exist so that a difficulty curve can be measured as a slope instead of as a point:
 * `tools/skill-ladder.js` plays one batch at every rung and reads how much a fifth of a second
 * and a quarter of the attention are worth in seconds of survival. They are not a tuning dial and
 * they must never be chosen to make a curve land somewhere - the rung's job is to say what kind of
 * player a number was measured on, and the game's difficulty is a different file's business.
 *
 *   flustered   one bad day: slow hands, and half the looks somewhere else
 *   ordinary    the number argued for above, and the one every other rung is compared to
 *   sharp       a good afternoon and a small screen: quick, nearly always watching
 *
 * The rung above all three is not a rung of this file at all: it is `aware`, the bot that has no
 * hands, and a curve that cannot reach it has not been measured end to end.
 */
export const RUNGS = {
  flustered: { ...HUMAN, lookEvery: 0.3, attention: 0.5, fumble: 0.3 },
  ordinary: HUMAN,
  sharp: { ...HUMAN, lookEvery: 0.12, attention: 0.92, fumble: 0.1 },
};

/**
 * Check a dial over, key by key.
 *
 * This is not fussiness: the first version of `RUNGS` above left `lookJitter` out, `range` of
 * `[-undefined, undefined]` is NaN, and `NaN > 0` is false - so the rung that was meant to be the
 * worst player on the ladder looked at the arena *every frame* and outlived the ordinary one. A
 * dial with a key missing does not become a slightly different player, it becomes a player with no
 * dial at all, and it will not say so. A rung is merged over `HUMAN` before it is looked at, so a
 * missing key is now impossible and a nonsense one is an error instead of a quiet NaN.
 */
function checked(dial) {
  const merged = { ...HUMAN, ...dial };
  for (const key of Object.keys(HUMAN)) {
    if (!Number.isFinite(merged[key]) || merged[key] < 0) {
      throw new Error('the dial key ' + key + ' wants a non-negative number, got ' + merged[key]);
    }
  }
  return merged;
}

/** Away with the card picker's (`dice` in bot.js), so one run's luck at cards is not its luck with the eyes. */
const SALT = 0x31a7b2c5;

/** Turn a vector by `angle` radians. Same length, different mind. */
function turned(v, angle) {
  if (angle === 0) return { x: v.x, y: v.y };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

/**
 * One player's eyes, with the state between one look and the next.
 *
 * Stateful on purpose - the whole subject is what happens *between* looks - so a run has to
 * `reset` before it starts, the same way the card picker's dice do.
 */
export class HumanDodge {
  constructor(dial) {
    this.dial = checked(dial === undefined ? HUMAN : dial);
    this.dice = new Rng(SALT);
    // Where the ship is being driven, and when it will next be steered again. Both are the
    // answer to the *last* look, which is what makes the latency a latency and not a lag.
    this.want = { x: 0, y: 0 };
    this.due = 0;
  }

  /** Start a new run: new afternoon, no held direction, the next look is now. */
  reset(seed) {
    this.dice.reset(seed >>> 0);
    this.want = { x: 0, y: 0 };
    this.due = 0;
  }

  /**
   * The direction to be driving this frame, asked once a frame.
   *
   * `dt` is the frame's length in seconds and `idle` is what the caller wants the ship doing
   * when nothing has to be dodged - which is also, and deliberately, what it is doing when it
   * is not looking at the field: the ordinary flight is the ordinary distraction.
   *
   * It reads the world and never writes it, like `escapeDirection`, so a test can hold a
   * moment still and ask it what it would have done.
   */
  look(world, dt, idle) {
    this.due -= dt;
    if (this.due > 0) return this.want;

    const dial = this.dial;
    this.due = dial.lookEvery * (1 + this.dice.range(-dial.lookJitter, dial.lookJitter));

    let want = idle;
    if (this.dice.chance(dial.attention)) {
      const escape = escapeDirection(world);
      // Loud enough to be worth a step, and only then: the aware bot asks the same question
      // (bot.js `awareFrame`) and the answer to an empty arena is the caller's, not mine.
      if (escape.pressure >= SKILL.calm) want = escape;
    }
    this.want = turned(want, this.dice.range(-dial.fumble, dial.fumble));
    return this.want;
  }
}

/**
 * The one the tools drive. One game per process, so one player per process as well, and
 * `bot.js playOneRun` resets it from each run's seed just as it resets the card dice.
 */
export const theHuman = new HumanDodge();

/** New run, new pair of eyes. Call it with the run's seed. */
export function resetDodge(seed) {
  theHuman.reset(seed);
}

/**
 * Put a different pair of eyes on that player (one of `RUNGS`, or a dial of your own).
 *
 * Not the dial to reach for from a tool that is measuring the game: reach for it from a tool that
 * is measuring the *player*, and say which rung a number was measured on when you write it down.
 */
export function setDial(dial) {
  theHuman.dial = checked(dial === undefined ? HUMAN : dial);
}
