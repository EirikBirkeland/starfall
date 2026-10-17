// Where the bot's feet go when nothing is wrong.
//
// Every policy in this folder had the same answer to that question up to now: drift back towards
// the middle of the arena. That is a player who never goes anywhere on purpose, and it left half of
// the game out of every number this repo quotes. The shard net (`shards.magnetRadius`, 145 px)
// carries loot to a ship that stands in the middle, so no bot here has ever walked *back* for a pile
// it walked away from - there was nothing to walk back for until BY HAND flew (game/challenges.js,
// NOTES session 160), and when that rule was priced the hand starved: level 7 down to level 1, and
// the aware hand's eight-minute score down to 0.12x, because the instrument had never once had to
// *want* a shard. Every build the line ladders priced was a build the net dealt them.
//
// So this is a habit and not a feature: it answers one question - where do my feet go when nothing
// is wrong - and it is opt-in exactly like the dash habit is (`tools/simulate.js --loot`, `{ loot:
// true }` for the tools) for the same honest reason. Every number already in NOTES.md and every
// `measured` row in `BALANCE.challenges` was flown with a magnet-fed bot, and a habit that quietly
// changed the instrument underneath all of them would invalidate them on the way past.
// `tools/loot-habit.js` is the ladder that chose the shipped one, flies the rival against it, and
// says what each of them is worth.
//
// Three things it deliberately does not do:
//
//   * it never overrules a dodge. It is asked from `idleDirection` in bot.js, which is what a policy
//     answers when it is *not* fleeing - so a shard can only ever replace the drift to the middle,
//     and never a step off a darter's line. A bot that walked into a bomber's circle to collect a
//     shard would be a worse instrument than the game it measures.
//   * it never touches the pointer. The aim belongs to the policy; the dash habit has the same rule
//     and `tools/dash-habit.js` is what breaking it cost.
//   * it never sees what a player does not. A shard lies on the screen with a glow round it, so
//     where the nearest one is and how big it is are both in plain sight, and the walk time the rot
//     test below uses is worked out from the ship's own top speed - which a person judges by eye,
//     and which is what decides whether a pile will still be there when they get there. Bodies are on
//     the glass too, which is all the second habit reads: who is standing near a pile.

/**
 * The habit's own numbers, and not the game's - changing these changes the player, not the run.
 *
 * `reach` is how far off a shard may be and still be worth getting up for. It is swept by
 * `tools/loot-habit.js --reach N` and the winner is written back here, because "how far would you
 * go for loot" is a habit and not a law, and a number picked by hand would be a ruler sanded to
 * whatever the last batch liked.
 *
 * What that sweep found (2026-10-18, 12 seeds x 5m of the careless hand - `human`, picking at a
 * die, pressing the get-out dash - every row against the same bot standing still, which middle-
 * scored 3,835 and banked 281 shards a run): 200 px reads **8.26x** with 10 of 12 seeds behind it,
 * 400 reads **7.91x** (11 of 12), and 700, 1200 and 2000 all read **7.79x** (11 of 12) - the last
 * three byte for byte the same batch, because past 700 px the walk never once found a shard that a
 * nearer one had not already won. That is the finding, and it is not about the dial: a ship that
 * kills where it stands has loot within a few hundred px of it almost always, so the walk is local
 * whatever the number says, and the sweep cannot choose between 400 and the horizon.
 *
 * 700 is the middle of that plateau and was kept for two reasons beyond the tie. It is about half a
 * screen of "I can see that from where I am" - far enough that a pile across the middle of the arena
 * is worth a stroll, short enough that the habit cannot be talked into crossing a world for one
 * shard and dying in the far corner for the privilege. And 200, which middle-scored a little better,
 * middle-died a minute worse (2m44s against 3m41s): a shorter stride means more trips and more trips
 * spent in the crowd, which is the one way this habit can cost a run.
 *
 * For the size of the thing itself, and not of the dial: on this hand the walk is worth better than
 * seven times a standing-still run's middle score, with eleven of twelve seeds agreeing, and the
 * batch's middle level goes from 7 to 42. That is what session 160 meant by the instrument having a
 * blind spot, and it is why `--loot` stays opt-in: every number already in NOTES.md was measured
 * without it.
 *
 * `grace` is not swept and is not really a habit: it is the slack in a person's eye when they judge
 * whether a thing will still be there when they arrive. A shard is worth walking to if it will
 * still be on the floor `grace` seconds after the ship could get there; `shards.life` does the rest
 * of the deciding and that is the game's number, not this one.
 *
 * `crowd` belongs to one habit only - `wary`, the second one, which is the same walk with a look at
 * who is standing on the pile before it sets off. It is the radius it counts a body as sitting in,
 * and `tools/loot-habit.js --crowd N` sweeps it. At 0 it counts nobody and `wary` is `greedy` with
 * an extra step - proved, not assumed: a 12-seed batch at `--crowd 0` came back byte for byte the
 * `greedy` batch (29,888 / 1,670 shards / 45% of the frames), which is what makes whatever the
 * other rows say belong to the look and not to something else in the arithmetic.
 *
 * What the sweep found (2026-10-17, `--seeds 12 --seconds 300` on the careless hand, all against the
 * same `greedy` row of 29,888): 80 px reads **28,551**, 150 **29,912**, 250 **29,071**, 500
 * **29,229**, and not one of those head-to-heads got below p = 0.77. On a wider batch - 32 seeds of
 * the same five minutes - the two habits split **16 of 32 each way** at 250 px (p = 1.0), while at
 * 150 px **20 of 32** preferred `greedy` (p = 0.215, still only a lean). That is the finding, and it
 * is a null: *which* pile you walk to is worth nothing on the column the ladder gates on, once you
 * are walking at all (the walk itself is worth 4-8x a run). What the look does move is the loot
 * column - 250 px banked **1,859** shards a run against `greedy`'s **1,784** on those 32 seeds, and
 * died **9 of 32** against its **11** - so that is the number shipped, on the only column that can
 * see it, with the score column in a tie.
 */
export const LOOT = {
  reach: 700,
  grace: 0.4,
  crowd: 250,
};

/** Put the habit's numbers over, the way `setDashDial` does the dash's (tools/loot-habit.js). */
export function setLootDial(dial) {
  for (const key of Object.keys(dial)) {
    if (LOOT[key] === undefined) throw new Error('the loot habit has no number called ' + key);
    if (!Number.isFinite(dial[key])) throw new Error(key + ' wants a finite number');
  }
  Object.assign(LOOT, dial);
  return LOOT;
}

/**
 * What the habit did on the run it is running. `steered` is how many times it answered the idle
 * question with a place to go, which is the difference between a habit that fired and a habit that
 * found nothing out there; `tools/loot-habit.js` reads it and `playOneRun` reports it per run.
 */
export const FORAGE = { steered: 0 };

/** Start the count over for a new run. */
export function resetForage() {
  FORAGE.steered = 0;
}

/**
 * The shard worth walking to, or null when nothing out there is worth a walk.
 *
 * `valueOf(shard, distance)` is what the trip is worth, and it is the caller's, because that is the
 * one thing the habits disagree about (see `greedy` and `wary` below). Everything else here is the
 * same for both of them: which shards are even candidates, and the walk itself.
 *
 * Two things disqualify a shard before its value is counted. Beyond `reach` it is not worth leaving
 * the middle for, whatever it is worth - that is the whole of the dial, and the whole of what the
 * ladder sweeps. And a shard that will have rotted before the ship arrives is not on the floor any
 * more, however close it looks: `life` is the game's clock on it and `distance / maxSpeed` is the
 * fastest the ship could cover the ground, so a shard failing that test is one the ship would walk
 * the length of the arena for and arrive at nothing.
 */
function shardToWalkFor(game, valueOf) {
  const ship = game.player;
  const speed = ship.maxSpeed;
  const shards = game.world.shards;
  let best = null;
  let bestValue = 0;
  for (let i = 0; i < shards.count; i++) {
    const shard = shards.items[i];
    const dx = shard.x - ship.x;
    const dy = shard.y - ship.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1 || d > LOOT.reach) continue;
    if (shard.life < d / speed + LOOT.grace) continue;
    const value = valueOf(shard, d);
    if (value > bestValue) {
      bestValue = value;
      best = shard;
    }
  }
  return best;
}

/**
 * A shard is worth `worth / distance`: twice as far for twice the pay is the same trip, which is
 * the arithmetic of a person deciding whether it is worth crossing the arena for an elite's pile.
 * Nothing is summed over a pile - a kill scatters its handful over a few dozen px, so the closest
 * one is the pile and the ship walks the handful off one at a time.
 */
function payPerPx(shard, distance) {
  return shard.worth / distance;
}

/**
 * How many bodies are sitting within `crowd` px of a place - the pile's crowd, which is the one
 * thing `wary` looks at that `greedy` does not. It is a count and not a threat: `threats.js` is
 * asked about what is coming at the *ship*, and nothing here is coming at the ship from a shard
 * 400 px away. A person glancing at two piles reads this as "there are three of them on that one".
 *
 * The whole crowd is walked for every candidate shard, which is the honest cost of looking: a
 * five-minute careless run peaks at 77 shards on the floor and ~30 on average against ~35 bodies
 * (200 in an endless wall), and it is asked at most once a frame and only on a frame the policy had
 * nothing else to do. Measured with `game.enemies` at 200 and 60 shards on the floor: 30 µs a look
 * against 1.5 µs for the same walk without the look - the tool's cost, not the game's, and the
 * whole crowd's worth of distance tests either way.
 */
function bodiesOn(game, x, y) {
  const r = LOOT.crowd;
  const r2 = r * r;
  let count = 0;
  for (const enemy of game.enemies) {
    const dx = enemy.x - x;
    const dy = enemy.y - y;
    if (dx * dx + dy * dy <= r2) count++;
  }
  return count;
}

/** The walk, once the shard has been chosen: point the feet at it, and note that the habit spoke. */
function walkTo(game, shard) {
  const ship = game.player;
  const dx = shard.x - ship.x;
  const dy = shard.y - ship.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  FORAGE.steered++;
  return { x: dx / d, y: dy / d };
}

/**
 * The shipped habit: go and get the best shard in reach, and answer "nothing" when there is none -
 * "nothing" being the policy's own drift to the middle, which is what this habit replaces and never
 * hides. It is called at most once a frame, by whichever policy has the wheel.
 */
export function forage(game) {
  const shard = shardToWalkFor(game, payPerPx);
  return shard === null ? null : walkTo(game, shard);
}

/**
 * The same walk with a look at who is standing on the loot: `payPerPx`, discounted for every body
 * sitting within `crowd` px of the pile.
 *
 * `greedy` picks the best *value* in reach and walks into whatever is already there, which is not a
 * thing a person does - they pick the pile with nobody on it and leave the one in the middle of the
 * clump for the next fifteen seconds. The discount is a division rather than a veto on purpose: one
 * body on a big elite pile is still worth going round them for, two bodies on a chaser's two shards
 * is not worth the trip. Dividing by `1 + count` says exactly that, and it says it in the same
 * units as the pay, so a pile twice as valuable buys its way past twice as many bodies.
 *
 * **And it is worth nothing on the score column, which is the honest reason `greedy` is still the
 * shipped habit.** Over 32 seeds of five minutes on the careless hand its middle score sits 3% under
 * `greedy`'s and the seeds call it 16 of 32 each way, p = 1.0 - and that is despite the look working
 * as designed. It points the feet somewhere else on nearly a quarter of the frames both habits
 * answer (23% of them more than 30° apart); the ground it lands on really is emptier, 6.9 bodies
 * within 250 px of a point down the walk against `greedy`'s 8.3; and it banks a little more of the
 * loot and dies a little less often. A hand that walks further and slower shoots less where it
 * stands, and that is what the look buys itself with. It stays flown in the ladder because "worth
 * nothing" is a reading that has to be re-taken whenever the game moves, and because a habit that
 * never gets ranked is a habit nobody can defend.
 */
export function forageWary(game) {
  const shard = shardToWalkFor(game, (shard, distance) => {
    return payPerPx(shard, distance) / (1 + bodiesOn(game, shard.x, shard.y));
  });
  return shard === null ? null : walkTo(game, shard);
}

/** The habits by name, and the one `--loot` means. `off` is the bot that never went shopping. */
export const LOOT_HABITS = {
  off: () => null,
  greedy: forage,
  wary: forageWary,
};
export const DEFAULT_LOOT_HABIT = 'greedy';

/** The habit for a name; `undefined` means the shipped one, and `true` the same. */
export function lootHabitOf(name) {
  if (name === undefined || name === true) return LOOT_HABITS[DEFAULT_LOOT_HABIT];
  const habit = LOOT_HABITS[name];
  if (!habit) throw new Error('no loot habit is called ' + name);
  return habit;
}
