// The point vacuum: every so often the arena empties itself into the ship.
//
// The owner's request of 2026-10-10, which is milestone 10's second item and the second half of the
// same note that bought ATTRACTOR: "every 10,000 points scored, every existing point on the screen
// should auto-stream to the player ship. During this 10 second event, play some excited music". The
// two numbers are in `BALANCE.vacuum` with the four decisions the request left out; this file is the
// arithmetic those decisions need, and the fanfare is in audio/music.js, which reads the run and
// never the other way round.
//
// **The well is a state of the arena and not a thing in it.** There is no object standing on the
// floor, no pool, nothing to collide with and nothing to shoot at - the same shape game/magnetar.js
// chose for its field. Two numbers describe it: how long it has left, and where the next threshold
// stands. Everything else is asked of the crowd and the loot every step, which is why a rank taken
// between two frames, a shard dropped at second nine, and a body that bursts on the far side of the
// world are all handled without a single line of bookkeeping.
//
// **The score has two doors, so the threshold is asked about once a step in one place.** A run's
// score goes up in exactly two places - a body coming down (game/enemies.js) and a shard being
// swallowed (game/pickups.js) - and either of them can be the one that crosses the line. Asking in
// both would be two chances to fire twice, and asking once at the end of the step means the step that
// crosses the line is also the step the well opens on. It runs before the shards are walked
// (game/world.js) so the loot a kill just scattered is inside the well in the same step it landed.
//
// **One crossing, one opening.** A large shard is worth six and can carry the score over two
// thresholds at once, and two openings on one step would be one event with two fanfares. So the next
// threshold does not step by `every`, it steps *past the score*: a jump that crossed 20,000 and
// 30,000 buys one well, and the next one is owed at 40,000. Nothing is lost, because the arena only
// has one floor's worth of loot on it.
//
// **The ten seconds are the run's own, so a card keeps them.** `left` is spent in step time like
// every other timer in the game, which means the flood stops dead at a level-up and picks up where it
// left off - the honest outcome, and the only one that does not steal a reward to pay for reading a
// card. The same goes for a hit-stop and for the player's own pause.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { addText, burst, ring } from './effects.js';
import { cueChord } from './cues.js';

/** The whole state of the well: how long it has left, what it is next waiting for, and two tallies. */
export function newVacuum() {
  return { left: 0, next: BALANCE.vacuum.every, events: 0, swallowed: 0 };
}

/** Empty the well and move its next threshold back to the first one. Last run's score is not this one's. */
export function resetVacuum(world) {
  const well = world.vacuum;
  well.left = 0;
  well.next = BALANCE.vacuum.every;
  well.events = 0;
  well.swallowed = 0;
}

/** Is the well open this step? Every reader of the vacuum asks this one question. */
export function isVacuuming(world) {
  return world.vacuum.left > 0;
}

/** How much of the ten seconds is left, for the frame that draws the meter and for a tool. */
export function vacuumLeftOf(world) {
  return world.vacuum.left;
}

/** What score the next opening of the well is owed at. */
export function nextThresholdOf(world) {
  return world.vacuum.next;
}

/** How many times the well has opened this run, and how many shards came in while it was open. */
export function vacuumEventsOf(world) {
  return world.vacuum.events;
}

export function vacuumSwallowedOf(world) {
  return world.vacuum.swallowed;
}

/**
 * A shard came in. Counted only while the well is open, which is what makes `swallowed` the number of
 * shards the vacuum is responsible for rather than the number the run collected. Said at the door
 * `game/pickups.js` pays a shard at, because that is the one place a shard is ever collected.
 */
export function noteSwallowed(world) {
  if (world.vacuum.left > 0) world.vacuum.swallowed++;
}

/**
 * The well's arithmetic on one shard, written straight onto its velocity: steer toward the ship at
 * `speed`, getting most of the way there in a tenth of a second and never snapping onto the line.
 *
 * The shard keeps its `px/py` contract through here because it is not moved here - only its velocity
 * is, and `game/pickups.js` moves it afterwards like it always does.
 */
export function drawIn(world, shard, dt) {
  const spec = BALANCE.vacuum;
  const ship = world.player;
  const dx = ship.x - shard.x;
  const dy = ship.y - shard.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  // The same exponential every turn in the game is: `turn` is what is left of the gap after a second,
  // so this is the same no matter how the step is cut.
  const left = 1 - Math.pow(spec.turn, dt);
  const toX = (dx / dist) * spec.speed;
  const toY = (dy / dist) * spec.speed;
  shard.vx += (toX - shard.vx) * left;
  shard.vy += (toY - shard.vy) * left;
}

/** The mouth opening: the ring that falls in, the flare at the ship, the word, and the voice. */
function open(world) {
  const spec = BALANCE.vacuum.start;
  const ship = world.player;
  const above = ship.y - ship.drawR - spec.wordLift;

  addText(world, ship.x, above, spec.word, PALETTE.elite);
  ring(world, ship.x, ship.y, PALETTE.elite,
    spec.mouth.radius, spec.mouth.speed, spec.mouth.life);
  ring(world, ship.x, ship.y, PALETTE.white,
    spec.flare.radius, spec.flare.speed, spec.flare.life);
  burst(world, ship.x, ship.y, PALETTE.elite,
    spec.spark.count, spec.spark.speed, spec.spark.life);
  cueChord(spec.sound.notes, spec.sound.dur, spec.sound.wave, spec.sound.vol);
}

/**
 * One step of the well: spend a little of it if it is open, and if it is shut see whether the score has
 * paid for another one. Returns whether it just opened, which nothing in the game needs today and
 * which a test may want tomorrow.
 */
export function updateVacuum(world, dt) {
  const spec = BALANCE.vacuum;
  const well = world.vacuum;

  if (well.left > 0) {
    well.left = Math.max(0, well.left - dt);
    return false;
  }
  if (world.score < well.next) return false;

  // Past the score rather than past the last threshold, so one crossing is one opening however many
  // thresholds a large shard's worth of points jumped over.
  well.next = (Math.floor(world.score / spec.every) + 1) * spec.every;
  well.left = spec.duration;
  well.events++;
  open(world);
  return true;
}
