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
 *
 * `patience` belongs to the third habit, `impatient`, and it is a length of time and not a distance:
 * how long a walk may run before the ship gives up on it.
 *
 * What the sweep found (2026-10-17, careless hand, `--seconds 300`; `gave up` is walks abandoned per
 * run, and the last two columns are `greedy` against that row, seed against seed, with the side the
 * seeds went to named). `greedy` middled **29,888** on the 12-seed batches (1,670 shards a run, the
 * wheel on 45% of the frames flown), and `off` - the bot that never goes anywhere - **3,835**:
 *
 *   * **0 s** - byte for byte the `off` row: 3,835, 281 shards, the wheel on nothing, and no walk ever
 *     abandoned. A trip with no time in it is never begun.
 *   * **1 s** - 27,068, 1,469 shards, 28% steered, **75.5** given up; `greedy` worth 1.06x per seed,
 *     the seeds even at 6 each way (p = 1.000).
 *   * **2 s** - 18,069, 1,327 shards, 40.1 given up; `greedy` 1.72x, the seeds 7 of 12 for it (p = 0.774).
 *   * **4 s** - 17,558, 1,093 shards, 19.3 given up; `greedy` 1.38x, **9 of 12 for `greedy`** (p = 0.146).
 *   * **8 s** - 27,644, 1,313 shards, 6.3 given up; `greedy` 1.93x, the seeds 7 of 12 for it (p = 0.774).
 *   * **16 s** - 32,231, 1,978 shards, **0.4** given up; `greedy` worth only 0.91x of it, and **7 of 12
 *     for `impatient`** (p = 0.774).
 *   * **100000 s**, past any trip - the same habit with no fuse, which is a plain committed walk - read
 *     32,231 and 2,008 shards, **8 of 12 for `impatient`** (p = 0.388).
 *
 * Two findings, and they pull opposite ways.
 *
 * **The give-up is not free**, and the reason is arithmetic rather than mysterious: the give-up and the
 * sulking after it are the same dial, so what a row pays in sulking is its give-ups times its patience -
 * 75 s at 1 s, 80 s at 2 s, 77 s at 4 s, about a quarter of a 300-second run spent not going anywhere,
 * whichever of those three the dial was turned to. A sixth of a run at 8 s; by 16 s the bill has gone
 * along with the rule that levied it. Every patience short enough for the rule to fire read under
 * `greedy` on both readings, and the loot column says the same thing as the score column for once: 1,093
 * to 1,469 shards a run wherever the rule fires against `greedy`'s 1,670, with the wheel on 26-39% of
 * the frames instead of 45%. The least surprising sentence this ladder has ever printed.
 *
 * **The sticking behind it is worth a lean.** Take the fuse off entirely and the same habit led `greedy`
 * on all four batches it was flown on and on both readings on every one of them: **+8%** on 12 seeds with
 * 8 of the 12 seeds; **+9%** on 32 (32,593 against 29,888, 22 of 32, p = 0.050 - a flight from before
 * this file named the side); **+5%** on 40 (32,187 against 30,592, **25 of 40 for `impatient`**, p =
 * 0.154); and **+5%** on 64, where it banked 2,005 shards a run to `greedy`'s 1,813, died 20 of 64 to
 * its 23, and took **38 of the 64 seeds** (p = 0.169). The gate never tripped once: the middles never
 * passed 1.09x where it wants 1.1x, and no split that named its side got nearer to shown than p = 0.154.
 * So `greedy` is still what `--loot` means and the ladder says so without failing on it - but four batch
 * sizes pointing the same way on both statistics is not `wary`'s nothing, and what it asks for is a
 * `committed` habit of its own, this walk with no fuse and no sulk, flown wide enough beside `off` that
 * a 5% edge either shows or dies.
 *
 * 4 s is shipped for two reasons and neither is that it won. It is under `shards.life` (12 s), so the
 * rule the habit is named for is the one that fires rather than the rotting rule getting there first -
 * 16 s gives up half a walk a run, 4 s gives up nineteen - and `test/loot-habit.test.mjs` pins that.
 * And it is a time a person would really give a pile across the middle of the arena, which is what the
 * row is meant to be a picture of. `greedy` stays what `--loot` means.
 */
export const LOOT = {
  reach: 700,
  grace: 0.4,
  crowd: 250,
  patience: 4,
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
 *
 * `gaveUp` is how many walks the third habit abandoned, and it is the only number that says the give-up
 * rule ever fired at all: a batch of `impatient` that never gave up a walk is the same batch as a
 * patience so long no trip ever ran out, and nothing else in the row can tell them apart.
 */
export const FORAGE = { steered: 0, gaveUp: 0 };

/**
 * What `impatient` remembers about the walk it is on: the pile it set off for, the run-clock reading
 * at which it has had enough of the trip, and the reading before which it will not start another one.
 * Cleared between runs with the counters above, because a walk is a thing that happens inside a run.
 */
const WALK = { shard: null, until: 0, notBefore: 0 };

/** Start the count over for a new run, and forget any walk left over from the last one. */
export function resetForage() {
  FORAGE.steered = 0;
  FORAGE.gaveUp = 0;
  WALK.shard = null;
  WALK.until = 0;
  WALK.notBefore = 0;
}

/**
 * Whether this shard is worth walking to at all, answered as its distance in px or -1 for "no".
 *
 * Two things disqualify a shard. Beyond `reach` it is not worth leaving the middle for, whatever it is
 * worth - that is the whole of the reach dial, and the whole of what the ladder sweeps. And a shard
 * that will have rotted before the ship arrives is not on the floor any more, however close it looks:
 * `life` is the game's clock on it and `distance / maxSpeed` is the fastest the ship could cover the
 * ground, so a shard failing that test is one the ship would walk the length of the arena for and
 * arrive at nothing.
 *
 * It is a function and not the body of the loop in `shardToWalkFor` because the third habit has to
 * ask the same question about the one pile it is already walking to: a committed walk is only worth
 * keeping while the pile it is aimed at is still worth walking to, and a second copy of the test would
 * be a second rule waiting to drift.
 */
function walkableDistance(game, shard, speed) {
  const ship = game.player;
  const dx = shard.x - ship.x;
  const dy = shard.y - ship.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1 || d > LOOT.reach) return -1;
  if (shard.life < d / speed + LOOT.grace) return -1;
  return d;
}

/**
 * The shard worth walking to, or null when nothing out there is worth a walk.
 *
 * `valueOf(shard, distance)` is what the trip is worth, and it is the caller's, because that is the
 * one thing the habits disagree about (see `greedy`, `wary` and `impatient` below). Everything else is
 * shared: which shards are candidates at all, and the walk itself.
 */
function shardToWalkFor(game, valueOf) {
  const speed = game.player.maxSpeed;
  const shards = game.world.shards;
  let best = null;
  let bestValue = 0;
  for (let i = 0; i < shards.count; i++) {
    const shard = shards.items[i];
    const d = walkableDistance(game, shard, speed);
    if (d < 0) continue;
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

/**
 * Is this shard still one of the ones on the floor? A collected shard goes back to the pool and may be
 * handed out again as a pile somewhere else entirely, so a remembered shard is not proof of anything;
 * the live list is. The list is walked because that is what a pool offers - it is ~30 shards on
 * average and 77 at the peak of a five-minute run, and it is asked once a frame on a frame the policy
 * had nothing else to do, which is the same cost as one `bodiesOn` look.
 */
function stillOnTheFloor(shards, shard) {
  for (let i = 0; i < shards.count; i++) {
    if (shards.items[i] === shard) return true;
  }
  return false;
}

/**
 * The third habit: set off for a pile, and give up if the trip drags.
 *
 * `greedy` and `wary` answer the idle question fresh every frame, which means a ship that set off for a
 * pile 600 px away can be talked out of it by anything - a slightly better pile appearing behind it,
 * its own dodge stealing a third of the frames - and can be talked back in again a second later. A
 * person does not do that. They pick a pile, walk at it, and if they are still walking at it four
 * seconds later they give up and go back to what they were doing, and they are not going to try for a
 * pile again until they have stopped feeling silly about it.
 *
 * So this is the same walk with a memory, and the memory buys two things: **the walk is committed**
 * (the pile picked at the start of the trip keeps the ship's attention until the trip ends, so two
 * equal piles stop pulling it backwards and forwards) and **the walk is finite** (a trip over
 * `patience` seconds is abandoned, and a failed trip costs the same length of time out of the shopping
 * afterwards - one dial, not two, and the reason it costs something is that without a price a give-up
 * is worthless, the ship would give up and immediately set off for the same pile again).
 *
 * A walk that ends because the pile went - banked, rotted, or walked out of reach - is not a give-up
 * and is not counted as one. That is why `gaveUp` can be read as nerve rather than as arithmetic.
 *
 * Two things make whatever this habit measures attributable, in the same shape `--crowd 0` gives
 * `wary`: at `patience` 0 no trip ever gets under way and the row is `off`, and at a patience longer
 * than any trip the row is a committed walk with no give-up in it. Everything a middle in between says
 * belongs to giving up.
 *
 * **And the give-up is worth nothing while the sticking behind it is worth a lean**, which is why
 * `greedy` is still what `--loot` means. The sweep is written out under `LOOT.patience`: every patience
 * short enough for the rule to fire often finished behind `greedy` on both readings, and the row it
 * trails most soundly is the shipped one - 19 walks abandoned a run buys a third less banked loot. The
 * half of the habit that does read like something is the commitment: with the fuse off entirely it led
 * `greedy` on all four batches it was flown on, and on the widest of them banked 2,005 shards a run to
 * `greedy`'s 1,813 while taking **38 of the 64 seeds** - and the gate refused it every time as a lean.
 * The habit stays flown in the ladder because a habit nobody can rank is a habit nobody can defend, and
 * because "the way you walk is free" is a finding that has to be re-taken whenever the game moves.
 */
export function forageImpatient(game) {
  const now = game.world.elapsed;
  if (WALK.shard !== null) {
    const gone = !stillOnTheFloor(game.world.shards, WALK.shard);
    if (gone || walkableDistance(game, WALK.shard, game.player.maxSpeed) < 0) {
      WALK.shard = null;                    // the pile left; this is not the give-up below
    } else if (now >= WALK.until) {
      return giveUp(now);
    }
  }
  if (WALK.shard === null) {
    if (now < WALK.notBefore) return null;  // still sulking about the last one
    const shard = shardToWalkFor(game, payPerPx);
    if (shard === null) return null;
    const until = now + LOOT.patience;
    // A trip with no time left in it is not begun, so a patience of nothing is the bot that never
    // went shopping (`off`) and not a bot that gives up every frame: nothing was ever abandoned.
    if (until <= now) return null;
    WALK.shard = shard;
    WALK.until = until;
  }
  return walkTo(game, WALK.shard);
}

/** Abandon the walk, and stay out of the shopping for as long as the walk just took. */
function giveUp(now) {
  WALK.shard = null;
  WALK.until = 0;
  WALK.notBefore = now + LOOT.patience;
  FORAGE.gaveUp++;
  return null;
}

/** The habits by name, and the one `--loot` means. `off` is the bot that never went shopping. */
export const LOOT_HABITS = {
  off: () => null,
  greedy: forage,
  wary: forageWary,
  impatient: forageImpatient,
};
export const DEFAULT_LOOT_HABIT = 'greedy';

/** The habit for a name; `undefined` means the shipped one, and `true` the same. */
export function lootHabitOf(name) {
  if (name === undefined || name === true) return LOOT_HABITS[DEFAULT_LOOT_HABIT];
  const habit = LOOT_HABITS[name];
  if (!habit) throw new Error('no loot habit is called ' + name);
  return habit;
}
