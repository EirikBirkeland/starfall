// The player that plays the game with no browser, shared by tools/simulate.js and
// the tests. Three of them, in fact, because they answer different questions.
//
//   naive   what a distracted human does: point at whatever is closest, shoot at
//           it, back off when it gets too close, drift back to the middle otherwise.
//   aware   the same player with its eyes open: it reads what is about to land -
//           shots in the air, lines that have been drawn but not fired, the circle a
//           bomber is standing in - and steps off it (see tools/headless/threats.js).
//   human   the same eyes behind a person's hands: it looks a fifth of a second at a
//           time, a quarter of its looks are at the wrong thing, and what it commits to
//           is not quite the direction it saw (see tools/headless/human.js). This is the
//           one a difficulty curve can be measured *against*.
//
// All three answer the level-up choice when the run stops for one, with keys, the
// way a player does (see `chooseCard` below). None of them dashes on its own: `--dash`
// adds `dashEscape` below to whichever policy is running, which is what any line that lives
// on the dash has to be measured with.
//
// How the level-up is answered is a second, separate choice (`PICKS` below), because
// `tools/difficulty-arc.js` has to ask what the game does to a player who does not think
// about the build. Moving and building are two different skills and a measure that can only
// move one of them cannot say which one it is blaming.
//
// The naive one is kept because it is the baseline every older note in NOTES.md was
// measured with, and because a game that is hard for a bot that tries is a different
// claim from one that is hard for a bot that barely tries. `--bot naive` runs it.

import { bootGame } from './harness.js';
import { BALANCE } from '../../src/game/balance.js';
import { escapeDirection, SKILL } from './threats.js';
import { resetDodge, setDial, theHuman } from './human.js';
import { isSynergy } from '../../src/game/upgrades.js';
import { makeEnemy } from '../../src/game/kinds.js';
import { Rng } from '../../src/core/rng.js';

/** One 60 Hz frame. The harness drives fixed steps so runs replay exactly. */
export const FRAME_MS = 16.7;

const PANIC_RANGE = 170;      // start running when an enemy is this close
const KEY_THRESHOLD = 0.35;   // how much of the wanted direction a key carries
const ATTRACT_FRAMES = 60;    // frames spent on the title screen first

export function nearestEnemy(game) {
  const ship = game.player;
  let found = null;
  let best = Infinity;
  for (const enemy of game.enemies) {
    const d = (enemy.x - ship.x) * (enemy.x - ship.x) + (enemy.y - ship.y) * (enemy.y - ship.y);
    if (d < best) {
      best = d;
      found = enemy;
    }
  }
  return found ? { enemy: found, distance2: best } : null;
}

/**
 * Point the cursor at an arena point. The camera decides where that lands on the
 * screen, so the bot aims the way a player does - at pixels - instead of assuming
 * the arena and the window are the same size.
 */
function aimAt(game, x, y) {
  const on = game.screenOf(x, y);
  game.moveMouse(on.x, on.y);
}

/**
 * Aim at whatever is closest and press the keys for `wanted`. Does not step time.
 * The two policies differ only in how they choose `wanted`.
 */
function drive(game, wanted) {
  game.key('KeyA', wanted.x < -KEY_THRESHOLD);
  game.key('KeyD', wanted.x > KEY_THRESHOLD);
  game.key('KeyW', wanted.y < -KEY_THRESHOLD);
  game.key('KeyS', wanted.y > KEY_THRESHOLD);
}

/**
 * Point the cursor at whatever is closest - at the sky above the middle of the arena
 * when there is nothing out there at all. Answers the enemy it aimed at, because the
 * two policies both want to know who that was.
 */
function aimAtTheNearest(game) {
  const near = nearestEnemy(game);
  if (near) aimAt(game, near.enemy.x, near.enemy.y);
  else aimAt(game, game.world.arena.w / 2, game.world.arena.h / 2 - 200);
  return near;
}

/** Aim at the nearest thing and run from the one thing close enough to matter. */
function naiveFrame(game) {
  drive(game, wantedDirection(game, aimAtTheNearest(game)));
}

/**
 * Aim at the nearest thing and get out of the way of everything that is on its way
 * to the ship. The aim is unchanged from the naive bot on purpose: what is being
 * measured here is a player that can dodge, not one that can also shoot better.
 */
function awareFrame(game) {
  aimAtTheNearest(game);

  const escape = escapeDirection(game.world);
  drive(game, escape.pressure < SKILL.calm ? driftToMiddle(game) : escape);
}

/**
 * Aim at the nearest thing and dodge it the way a person does: on a human clock, with a
 * quarter of the looks spent on something else. `tools/headless/human.js` is the model and
 * the dial; this is only the hands that put its answer on the keyboard.
 *
 * The `idle` it hands over is the naive bot's whole answer - back off from whatever is close,
 * drift in towards the middle otherwise - because that is exactly what a person is doing when
 * they are not reading the field.
 */
function humanFrame(game) {
  const near = aimAtTheNearest(game);
  drive(game, theHuman.look(game.world, FRAME_MS / 1000, wantedDirection(game, near)));
}

/** The three ways to play, and the one the tools use unless told otherwise. */
export const POLICIES = { naive: naiveFrame, aware: awareFrame, human: humanFrame };
export const DEFAULT_POLICY = 'aware';

/**
 * The level-up choice, taken the way a player takes one: a number key.
 *
 * The `wise` policy is written down rather than clever, because a bot that picks perfectly
 * overstates a human and every number in NOTES.md was measured with this one. So: take the line
 * with the fewest ranks already in it, and break a tie in the order below - the share
 * lines all multiply the same damage per second, so spreading them is the strongest thing
 * to do while they are all short, and damage is the one that matters most when the crowd
 * out-scales the gun. Split shot sits second because it is the one line that buys coverage
 * rather than weight, and it is the crowd that kills this bot; pierce next, for the same
 * reason in the other direction - it buys depth down the column of bodies chasing the
 * ship, which is exactly what this bot is aiming at. Ricochet goes with the coverage lines,
 * and just above pierce: a turn needs one body anywhere nearby, where a pass needs the
 * crowd arranged along the line being aimed, and this bot is always in the middle of a knot
 * rather than behind a column.
 *
 * Last come the two lines that are not a multiply on the gun. They sit last because when a
 * rank of `damage` and a rank of `orbitals` are both on the table and both are worth the
 * same, the gun's is the one worth taking first; and `DEFERRED` below is the one case where
 * even that is not enough, and has to be told not to buy a card at all.
 */
const APPETITE = ['damage', 'split', 'ricochet', 'pierce', 'fireRate', 'bulletSpeed', 'orbitals', 'nova'];

/**
 * Ranks of these lines count as this much deeper than they are when the bot chooses, so it
 * takes them late and rarely.
 *
 * This one is measured rather than a hunch (NOTES session 31: 40 seeds, aware bot, 900 s
 * cap). Every line before it multiplies the gun - `fireRate` every shot, split shot every
 * volley, damage every hit - so evening the build out across them is the best a picker can
 * do. Orbitals is the first line that instead *adds* a second source, and its rate is
 * capped by whatever is standing in the ring: a rank of it is worth a rank of the damage
 * line on a plain gun and a fraction of one once the gun is what a build makes it. So a
 * rank taken level with the gun's own ranks trades a multiply for an addition, and it
 * measured as a loss - the bot died inside the window on 11 of 40 runs with the ring
 * taken evenly (13 of 40 while the bite was flat) and on 5 of 40 with the line in the pool
 * but never chosen, a minute and a half of mean survival between them. The ring is not a bad card; a player who buys two ranks of it on
 * the way up a gun build is not paying much for it. It is the bot's even spread that cannot
 * afford it, and delaying it is what a player who wants the gun first does anyway.
 *
 * NOVA is not in this table, and was, on the same evidence being demanded here (NOTES
 * session 32: 40 seeds again, same window). Handicapped by two it cost the run: 32 of 40
 * outlasted the window against 37 of 40 with the card out of the deck altogether, and the
 * mean came down by a minute and a quarter. Untouched by any handicap it costs nothing:
 * 37 of 40 both
 * ways, and the score the same to within a rounding. The difference is the shape of the two
 * lines - the orbital ring's rate is capped by whatever stands in 64 px of the ship, which
 * for a fleeing ship is nothing, while a nova front reaches 220 px and finds bodies even
 * while running, so a rank of it really is worth what a rank of the damage line is and the
 * bot may buy it level with the rest.
 */
const DEFERRED = { orbitals: 2 };

/*
 * BURN is not in that table either, and is not going in it (NOTES session 38: twenty seeds with
 * the line in the deal against twenty with it out of the deck, same window). The bot takes it
 * in 20 of 20 runs and takes it to five, because it is the shallowest line in the game and an
 * even spread reaches five ranks of it before five of anything else - and the batch came out
 * level to slightly better with it: median 15m00s either way, 19 of 20 still flying at the cap
 * against 17 of 20, score median 115,814 against 112,578. A line worth 0.3 ranks of the gun on
 * the ladder, that costs the run nothing when a bot is free to grab it, does not need a
 * handicap; putting one here would only hide the card from the measure that shows whether it
 * belongs in the deck at all.
 */

/** How deep the bot thinks a line stands, handicaps and all. */
function depthOf(ranks, id) {
  return ranks[id] + (DEFERRED[id] === undefined ? 0 : DEFERRED[id]);
}

function preferredCard(game, offer) {
  // A synergy is taken the moment it is face up, whatever else is on the table. This is not a
  // judgement about whether it is worth a slot - the whole point of one is that it is the payoff of
  // the build the bot has already been paid for - and a bot that let an earned synergy sit face up
  // while it took a fourth rank of the gun would be measuring a game where synergies do not exist,
  // which is what every number in NOTES before this card was.
  for (const id of offer) {
    if (isSynergy(id)) return id;
  }

  const ranks = game.world.upgrades;
  let best = offer[0];
  for (const id of offer) {
    if (depthOf(ranks, id) > depthOf(ranks, best)) continue;
    if (depthOf(ranks, id) < depthOf(ranks, best) || appetiteOf(id) < appetiteOf(best)) best = id;
  }
  return best;
}

/** Where a line sits in the list above. A line nobody wrote down is the last resort. */
function appetiteOf(id) {
  const place = APPETITE.indexOf(id);
  return place === -1 ? APPETITE.length : place;
}

// The dice the careless picker rolls, on a stream of its own.
//
// A stream and not `Math.random` for the same reason everything else in the game is: a seed has
// to replay the same run, and a difficulty number that changes when it is re-run is not a number.
// It is *not* the game's own `logic` stream, because a bot's choices are not the game's business
// and a roll spent on a card would move every spawn after it into a stream nobody asked to move.
const dice = new Rng(0x51ee7b0f);

/** Start the dice over for a new run, so a seed is always the same careless build. */
export function resetPicks(seed) {
  dice.reset(seed >>> 0);
}

/** The careful build: the policy argued for above, whole. */
function wiseCard(game, offer) {
  return preferredCard(game, offer);
}

/**
 * The careless build: one roll of a die over whatever is face up.
 *
 * A die and not a hand-picked "bad" picker, deliberately. A picker written to choose badly would
 * be an invention about bad play - the worst card on a table is almost never what a person takes -
 * while "did not look" is exactly PLAN 10's *no upgrades chosen wisely*, and a die has an average:
 * nobody can argue with the same build twice, and a batch of seeds has a middle. It is not the
 * weakest build that exists and it does not claim to be; it is the unconsidered one.
 *
 * It rolls once per card the run is offered, on `dice` above, from the run's own seed.
 */
function carelessCard(game, offer) {
  return dice.pick(offer);
}

/** The two ways to answer a level-up, and the one the tools use unless told otherwise. */
export const PICKS = { wise: wiseCard, random: carelessCard };
export const DEFAULT_PICKS = 'wise';

/** The picker for a name, with `undefined` meaning the careful one every older number means. */
function pickerOf(name) {
  if (name === undefined) return PICKS[DEFAULT_PICKS];
  const picker = PICKS[name];
  if (!picker) throw new Error('no card picker is called ' + name);
  return picker;
}

function chooseCard(game, picks) {
  const offer = game.world.offer;
  if (offer.length === 0) return;
  const number = offer.indexOf(pickerOf(picks)(game, offer)) + 1;
  game.key('Digit' + number, true);
  game.key('Digit' + number, false);
}

/**
 * When the bot presses the dash, and which way it sends it. Like `SKILL` in threats.js and the
 * dial in human.js, these are the bot's own numbers and not the game's.
 *
 * The habit has to be written down at all because the first one was wrong in a way that cost runs:
 * it pressed the dash *at* the nearest body, and a dash with no movement key held goes the way the
 * cursor points - so a bot that was standing still dashed into whatever frightened it, and one
 * that was moving dashed wherever its feet were already going. It also moved the pointer to do it,
 * which moves the guns. `tools/dash-habit.js` is the measurement that says so; see NOTES session 114.
 *
 * `trigger` is how near a body has to be before pressing is worth it at all, and `push` how far out
 * bodies vote on which way is out. Both are in units of the dash's own reach, which is the only
 * honest yardstick for a dash, and both are measured rather than picked.
 *
 * The sweep is `tools/dash-habit.js --trigger N` over 30, 45, 60, 90, 110 and 170 px on sixteen
 * seeds of ten minutes, on the two careless players (a die for the cards, on the human's hands and
 * on the aware bot's). It is a cliff and not a peak. Pressing whenever a body is 170 px out - what
 * the first habit did, with the number borrowed from the walk's own panic distance - *loses* runs:
 * on the aware batch 12 of 16 died against 9 of 16 with no dash at all, and the score median fell
 * from 12,914 to 5,773; the careless human's middle death came in at 2m27s against its own floor of
 * 2m33s. Pressed at 45 px - one reach, which is contact plus the dozen px a closing body covers
 * between two of a person's looks - the same aware batch reads **1 of 16 died at a middle of 7m20s
 * with a score median of 42,893**, and the human's **4m32s against 2m33s**. A press spent early buys
 * 220 px and then spends the wait walking back into a crowd that was never cleared; a press spent
 * when something is actually reaching for the hull buys the only thing a dash can buy. 30 and 60 both
 * measured well - 4m00s and 3m05s on the human's hands, 5m13s and 4m16s on the aware one's - and 45
 * is the best of the three on both batches, which is the only reason it is the one that ships.
 *
 * What that is *not*, and the reason the sweep lives in a tool instead of in this comment: a dial on
 * the player can always be turned until the numbers look better, and a bot tuned that way is a ruler
 * that has been sanded down. What makes 45 a habit and not a tuning is that it is the press the dash
 * was designed for - PLAN 3.1's get-out-of-jail, pressed when jail has you by the arms - and that the
 * rate it comes out at is a person's rate, a dozen or sixteen presses in a fifteen-minute run
 * instead of a hundred and seven.
 *
 * `push` stays wider than `trigger` on purpose: which way the crowd is not is a neighbourhood
 * question, and the neighbourhood is what decides the direction; the press itself is about the one
 * body that nearly has me.
 *
 * Exported, and mutable, for the one thing a fixed habit cannot do: the ladder sweeps `trigger` and
 * prints what each value is worth, because "how cornered before you spend the dash" is a habit and
 * not a law. Whoever sweeps it next writes the number back here.
 */
export const DASH = {
  trigger: 45,
  push: BALANCE.player.dash.distance * 0.77,
};

/** Put the habit's own numbers over, the way human.js's `setDial` does (tools/dash-habit.js). */
export function setDashDial(dial) {
  for (const key of Object.keys(dial)) {
    if (DASH[key] === undefined) throw new Error('the dash habit has no number called ' + key);
    if (!Number.isFinite(dial[key])) throw new Error(key + ' wants a finite number');
  }
  Object.assign(DASH, dial);
  return DASH;
}

/** Is the ship flying, and is its dash spent nothing right now? */
function dashReady(game) {
  return game.world.state === game.STATE.PLAY && game.player.dashCd <= 0;
}

/** Straight away from one body, as a unit vector. */
function awayFrom(game, enemy) {
  const ship = game.player;
  const dx = ship.x - enemy.x;
  const dy = ship.y - enemy.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / d, y: dy / d };
}

/**
 * Every body within `range`, pushing the ship away, nearest loudest - the crowd's own opinion of
 * which way is out. Null when the crowd is balanced enough to have no opinion, which the caller
 * has to have a fallback for (a pinch is exactly when a dash is worth pressing and a push that
 * cancels itself says nothing).
 */
function crowdPush(game, range) {
  const ship = game.player;
  let x = 0;
  let y = 0;
  for (const enemy of game.enemies) {
    const dx = ship.x - enemy.x;
    const dy = ship.y - enemy.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > range || d < 1e-6) continue;
    const weight = (1 - d / range) / d;
    x += dx * weight;
    y += dy * weight;
  }
  const length = Math.sqrt(x * x + y * y);
  return length < 1e-9 ? null : { x: x / length, y: y / length };
}

/**
 * Take the part of a direction out that would spend the dash against a wall.
 *
 * Where the dash would actually put the ship is worked out from the dash's own distance, so a wall
 * that is nowhere near the end of the dash has no say. Cancelling an axis can leave nothing at all
 * - a ship in a corner with the crowd behind it pointing straight out of the world - and then the
 * answer is that there is no dash worth pressing this frame, which is `null` and the caller's to
 * respect. Holding the press costs one frame; a dash into a wall costs the wait.
 */
function offTheWalls(game, dir) {
  const ship = game.player;
  const field = game.world.field;
  const reach = BALANCE.player.dash.distance;
  let x = dir.x;
  let y = dir.y;
  if (x < 0 && ship.x + x * reach < field.x0) x = 0;
  if (x > 0 && ship.x + x * reach > field.x1) x = 0;
  if (y < 0 && ship.y + y * reach < field.y0) y = 0;
  if (y > 0 && ship.y + y * reach > field.y1) y = 0;
  const length = Math.sqrt(x * x + y * y);
  return length < 1e-9 ? null : { x: x / length, y: y / length };
}

/**
 * The shipped habit: when something is within `DASH.trigger`, throw the ship the way the crowd is
 * *not* - the weighted push away from everything near, with the walls given a veto over the axis
 * they stand on - and press the dash without moving the pointer, so the guns stay pointed where the
 * policy pointed them.
 *
 * The habit is one of the lines' reason to exist: game/afterimage.js, game/tether.js and
 * game/overcharge.js are priced against a bot that dashes, and a card cannot be priced against a
 * press the instrument will not make. It is still opt-in (`tools/simulate.js --dash`), for the
 * same honest reason it always was: every run measured in NOTES before it existed was measured
 * with a bot that never touched the dash, and those numbers are that bot's.
 *
 * It runs *before* the frame is stepped, not after: the dash goes the way the keys mean at the step
 * that grants it, so a habit that leans after the step has leaned one frame too late and the ship
 * has already gone wherever the policy was going.
 */
export function dashEscape(game) {
  if (!dashReady(game)) return;
  const near = nearestEnemy(game);
  if (near === null || near.distance2 > DASH.trigger * DASH.trigger) return;
  const want = crowdPush(game, DASH.push) || awayFrom(game, near.enemy);
  const out = offTheWalls(game, want);
  if (out === null) return;
  drive(game, out);
  game.tapDash();
}

/**
 * The first habit, kept so that the tool can measure against it: press the dash at the nearest
 * body, pointer and all. It is what `--dash` meant up to 0.10.19, and it was measured at the panic
 * distance of that time (170 px) on sixteen careless seeds: a middle of deaths of 1m13s on the
 * human's hands against the 2m33s of the same bot leaving the dash alone, and 1m07s against
 * 4m23s on the aware one's, with 70-76% of its dashes pointed at a body and 23-38% of them
 * finishing inside one. That is the kind of thing a measurement instrument is not allowed to be
 * quietly doing to the thing it measures.
 *
 * Which way it actually goes is not entirely its own doing. A dash follows the movement keys when
 * any are held and the pointer only when none are (game/player.js `dashDirection`), so this habit
 * lands on the body when the policy has let go of the keys and slides off its flee otherwise; the
 * `at a body` column of tools/dash-habit.js is what says how often each, and it is why the harm
 * this habit does is not only the direction - the pointer move yanks the guns off whatever they
 * were pointed at, which is the one thing the bot's aim has to keep.
 *
 * Held at the shipped panic distance of 45 px it is no longer a disaster - sixteen careless seeds
 * middle 4m28s against the get-out's 4m32s - and the reason is in the `at a body` column: pressed
 * that late the policy always has a flee key held, so the pointer barely gets to steer at all (13%
 * of its dashes pointed at a body, against the 70-76% it managed at the old distance). What the old
 * habit was really doing, either way, was spending a hundred dashes a run on nothing at all.
 * Direction and timing are both fixed here because a habit is one thing and not two, but only one
 * of them was worth three minutes of a run.
 */
export function dashDive(game) {
  if (!dashReady(game)) return;
  const near = nearestEnemy(game);
  if (near === null || near.distance2 > DASH.trigger * DASH.trigger) return;
  const on = game.screenOf(near.enemy.x, near.enemy.y);
  game.pressMouse(on.x, on.y, 2);
}

/**
 * The same get-out, read off the threat model instead of off the crowd: dash the way the ship was
 * already trying to walk (tools/headless/threats.js), which is the only reading that knows about a
 * shot in the air or a line that has been drawn. Kept for the ladder because it is the version of
 * the habit the *aware* bot alone is entitled to - the naive one has no eyes like these.
 */
export function dashAlongTheEscape(game) {
  if (!dashReady(game)) return;
  const near = nearestEnemy(game);
  if (near === null || near.distance2 > DASH.trigger * DASH.trigger) return;
  const escape = escapeDirection(game.world);
  const want = escape.pressure > 1e-6 ? escape : awayFrom(game, near.enemy);
  drive(game, want);
  game.tapDash();
}

/** The habits by name, and the one `--dash` means. */
export const DASH_HABITS = {
  off: () => {},
  escape: dashEscape,
  dive: dashDive,
  along: dashAlongTheEscape,
};
export const DEFAULT_DASH_HABIT = 'escape';

/** The habit for a name; `undefined` means the shipped one, and `true` the same. */
export function dashHabitOf(name) {
  if (name === undefined || name === true) return DASH_HABITS[DEFAULT_DASH_HABIT];
  const habit = DASH_HABITS[name];
  if (!habit) throw new Error('no dash habit is called ' + name);
  return habit;
}

/**
 * Play one frame as `policy`, answering a level-up with `picks`.
 *
 * Both arguments are optional, and both default to what every number in NOTES.md was measured
 * with, so a caller that never heard of the second one is not asking for a different bot.
 */
export function botFrame(game, policy, picks) {
  // A paused run has one business and it is not flying: the cards are answered first,
  // and the run is back before the next frame is drawn.
  if (game.world.state === game.STATE.LEVEL) {
    chooseCard(game, picks);
    return;
  }
  const play = policy === undefined ? POLICIES[DEFAULT_POLICY] : POLICIES[policy];
  if (!play) throw new Error('no bot policy is called ' + policy);
  play(game);
}

function wantedDirection(game, near) {
  const ship = game.player;
  if (!near) return driftToMiddle(game);

  const dist = Math.sqrt(near.distance2) || 1;
  if (dist < PANIC_RANGE) {
    return { x: (ship.x - near.enemy.x) / dist, y: (ship.y - near.enemy.y) / dist };
  }
  return driftToMiddle(game);
}

function driftToMiddle(game) {
  const ship = game.player;
  const arena = game.world.arena;
  return {
    x: (arena.w / 2 - ship.x) / arena.w * 2,
    y: (arena.h / 2 - ship.y) / arena.h * 2,
  };
}

/**
 * Launch a run from the title screen: sit for a moment, then press the fire
 * button, which both starts the run and holds the trigger.
 *
 * It does not touch Space on purpose. Space launches a run *and* dashes, so a bot
 * that held it over the launch would spend a dash it never asked for; the launch
 * press itself is not a dash, whatever key it comes from (see main.js).
 */
export function startBotRun(game) {
  for (let i = 0; i < ATTRACT_FRAMES; i++) game.step(FRAME_MS);
  game.pressMouse(640, 240);
}

/** A cheap hash of everything that matters, to notice a change in behaviour. */
export function fingerprint(game) {
  let h = 2166136261;
  const mix = (n) => {
    h ^= Math.round(n * 100) >>> 0;
    h = Math.imul(h, 16777619);
  };
  const ship = game.player;
  mix(ship.x); mix(ship.y); mix(ship.vx); mix(ship.vy);
  for (const enemy of game.enemies) { mix(enemy.x); mix(enemy.y); mix(enemy.hp); }
  const stats = game.stats();
  mix(stats.bullets); mix(stats.shards); mix(stats.parts);
  mix(stats.score); mix(stats.xp); mix(stats.level); mix(stats.t); mix(stats.wave);
  return (h >>> 0);
}

/**
 * Play one run on a game that is already sitting on its title screen.
 * Options: { maxSeconds, every, onFrame, policy, picks, dial, ship, weapon, challenge, at, dash }
 */
export function playOneRun(game, options) {
  const opts = options || {};
  const maxSeconds = opts.maxSeconds === undefined ? 600 : opts.maxSeconds;
  const frameLimit = Math.ceil(maxSeconds * 1000 / FRAME_MS);
  const picks = opts.picks;
  // Which dash habit, if any. Leaving it out is the bot that never touches the dash at all, which
  // is what every number already in NOTES.md was measured with; `true` is the shipped get-out and
  // a name picks one of the others (tools/dash-habit.js is the ladder that compares them).
  const dash = opts.dash === undefined || opts.dash === false ? null : dashHabitOf(opts.dash);
  // Checked before a single frame, because a batch of twenty long runs is the wrong place to
  // find out the picker's name was spelled wrong.
  pickerOf(picks);
  const drawsBefore = game.drawCalls();

  // Which ship to fly, and with it which primary, pressed through the game's own door
  // before the launch (the bot does not reach into the world for it, because the title
  // screen is what offers it).
  if (opts.ship !== undefined) game.chooseShip(opts.ship);
  // Which primary to fly, asked for after the ship so that a tool pricing one gun against
  // another gets the gun it asked for on whatever body it is standing on - which is what a
  // gun ladder is for (tools/power-ladder.js), and game/ships.js says the same about the
  // order of the two calls.
  if (opts.weapon !== undefined) game.chooseWeapon(opts.weapon);
  // Which harder rule to fly under (game/challenges.js), pressed through the same door the title's
  // key uses and, like the ship and the gun, before the launch. Leaving it out is the game as it
  // shipped; `''` says so out loud. A rule is chosen between runs and cannot be changed mid-flight,
  // which is exactly why a tool can set it here and forget about it.
  if (opts.challenge !== undefined) game.chooseChallenge(opts.challenge);

  startBotRun(game);
  // The dice for this run's cards, cut from the run's own seed: the same seed is the same
  // careless build, which is the only way a careless batch is a measurement. Done after the
  // launch because that is what puts the seed in the world.
  resetPicks(game.world.seed);
  // And the same for the third policy's eyes (tools/headless/human.js): a seed is the same
  // person having the same afternoon. Reset whatever policy is running, because a private
  // stream spent by a policy that is not running spends nothing anybody can notice.
  resetDodge(game.world.seed);
  // A tool that is measuring the *player* and not the game can put a different rung of that dial
  // on them (tools/skill-ladder.js). Left alone by default, so every number already in NOTES.md was
  // made by the ordinary pair of eyes and still means what it says.
  if (opts.dial !== undefined) setDial(opts.dial);

  let frames = 0;
  let died = false;
  let won = false;
  const trace = [];
  // Where the boss fight stood the last time the trace looked, for the lines below
  // (game/bosses.js).
  let bossName = '';
  let bossPhase = 0;
  let bossesDown = 0;
  let bossCores = 0;
  // How many times the point vacuum has been seen opening (game/vacuum.js). The trace is the only
  // place a tool can see the reward rhythm at all, and a fingerprint alone would not say which
  // change was the well emptying the arena.
  let vacuums = 0;
  while (frames < frameLimit) {
    botFrame(game, opts.policy, picks);
    // Before the step and not after it: the dash goes whichever way the keys mean at the step that
    // grants it, so a habit told after the step is always leaning one frame too late.
    if (dash) dash(game);
    game.step(FRAME_MS);
    frames++;
    // "Start the run already five minutes in", asked honestly: the launch zeroes the clock and
    // then this puts it where the tool asked, before the second frame is simulated. The whole
    // difficulty curve reads `elapsed` - the crowd budget, the hull scale, the boss schedule -
    // so a run started at 295 s is the five-minute fight and not a scripted one.
    //
    // And everything on the schedule that was due *before* the clock was put there has been and
    // gone: a run launched at ten minutes is measured from the ten-minute mark, and the boss due
    // at five must not walk in five seconds later and be the thing the tool measures (game/
    // bosses.js spends the schedule through `bossIndex` and reads nothing else).
    if (frames === 1 && opts.at !== undefined) {
      game.world.elapsed = opts.at;
      const schedule = BALANCE.bosses.schedule;
      while (game.world.bossIndex < schedule.length
        && opts.at >= schedule[game.world.bossIndex].at) {
        game.world.bossIndex++;
      }
    }
    if (opts.onFrame) opts.onFrame(game, frames);
    if (opts.every && frames % opts.every === 0) {
      const stats = game.stats();
      trace.push(frames + ':' + fingerprint(game));
      // The well opening is a run event worth a line of its own: it is the one reward the game hands
      // out by itself, and what that is worth on a run is the whole balance question behind it.
      if (stats.vacuumEvents > vacuums) {
        vacuums = stats.vacuumEvents;
        trace.push(frames + ':vacuum ' + vacuums + ' opened at ' + Math.round(stats.score));
      }
      // The three moments of a boss fight a trace is asked to show: who walked in, which phase it
      // moved to, and when it came down. A fingerprint only says that something changed, and a
      // boss is the one part of a run whose whole balance question is timing - how long the fight
      // lasted and how much of it the run was able to fight (tools/simulate.js --trace).
      if (stats.bossesDown > bossesDown) {
        bossesDown = stats.bossesDown;
        trace.push(frames + ':boss ' + bossName + ' down, ' + bossesDown + ' spent');
        bossName = '';
        bossCores = 0;
      }
      if (stats.boss !== '' && stats.boss !== bossName) {
        trace.push(frames + ':boss ' + stats.boss + ' walks in');
        bossName = stats.boss;
        bossPhase = stats.bossPhase;
        bossCores = stats.bossCores;
      } else if (stats.boss !== '' && stats.bossPhase !== bossPhase) {
        trace.push(frames + ':boss ' + stats.boss + ' phase ' + stats.bossPhase
          + ' at ' + Math.round(stats.bossHull * 100) + '%');
        bossPhase = stats.bossPhase;
        bossCores = stats.bossCores;
      } else if (stats.boss !== '' && bossCores > 0 && stats.bossCores !== bossCores) {
        // The fourth moment a trace has to show, and the one only a fight made of several bodies
        // can have: the Hive coming apart (game/bosses.js `spendSplit`), and one of its bodies
        // coming down again afterwards. Without it a trace reads a split as the fight gaining an
        // enemy out of nowhere, and a run that broke a piece off as the bar behaving oddly.
        //
        // `bossCores > 0` is the other half of the test and it is not decoration: while a fight is
        // still being announced it has no bodies at all, so the frame it arrives on would otherwise
        // read as one body breaking into one - which is exactly what the first draft of this line
        // printed, on every Warden in the game.
        const grew = stats.bossCores > bossCores;
        trace.push(frames + ':boss ' + stats.boss + (grew
          ? ' broke into ' + stats.bossCores + ' bodies at '
          : ' is down to ' + stats.bossCores + ' bodies at ')
          + Math.round(stats.bossHull * 100) + '%');
        bossCores = stats.bossCores;
      }
    }
    const ended = game.stats().state;
    if (ended === game.STATE.OVER) {
      died = true;
      break;
    }
    // The other ending a run can reach (game/run.js `winRun`): the schedule is out and the ship is
    // still standing. It is not "still flying at the cap" either - the run finished, and a batch
    // that counted it as a survival would be claiming the bot outlasted a window it never tried.
    if (ended === game.STATE.WON) {
      won = true;
      break;
    }
  }

  const draws = game.drawCalls();
  const drawCalls = {};
  for (const key of Object.keys(draws)) drawCalls[key] = draws[key] - drawsBefore[key];

  return {
    died: died,
    won: won,
    policy: opts.policy === undefined ? DEFAULT_POLICY : opts.policy,
    picks: picks === undefined ? DEFAULT_PICKS : picks,
    seed: game.world.seed,
    // What the run was made of, counted as it went (game/tally.js). The run keeps
    // its own sheet, so this stays readable after the next run starts.
    tally: game.world.tally,
    frames: frames,
    seconds: +(frames * FRAME_MS / 1000).toFixed(2),
    stats: game.stats(),
    screen: game.screen,
    storage: Object.assign({}, game.storage),
    drawCalls: drawCalls,
    trace: trace,
  };
}

/** Boot a game and play exactly one run on it. */
export async function playRun(options) {
  const game = await bootGame(options);
  const summary = playOneRun(game, options);
  game.stop();
  return summary;
}

/**
 * A run-finisher for a test that needs a *finished* run and cannot wait for a death:
 * from `seconds` in, hold the ship to one hull with no grace and put a body on it,
 * every frame, until it stops. Hand it to playOneRun as `onFrame`.
 *
 * A bot with the upgrade lines behind it can outlast any window a test can afford - a
 * maxed build was still flying at fifteen minutes (NOTES, session 28) - so "play until
 * it dies" stopped being a promise anybody can keep. What those tests need is an ended
 * run, and this ends one, at a frame count they choose.
 */
export function endingItAt(seconds) {
  return function finishIt(game, frames) {
    if (frames * FRAME_MS < seconds * 1000) return;
    // Once the run has ended there is nothing left to end, and a hull written back to
    // one after the death would be a lie in whatever the test reads off the summary. And a
    // won run has ended too - outlasting the schedule is an ending, and killing the ship
    // afterwards to make the test's point would be a lie of the same shape.
    if (game.world.state === game.STATE.OVER || game.world.state === game.STATE.WON) return;
    const ship = game.player;
    ship.hull = 1;
    ship.invuln = 0;
    ship.fireTimer = 5;           // no shot, or it kills the body planted on it
    game.enemies.push(makeEnemy(game.world, 'drifter', ship.x, ship.y, {
      hp: 1, speed: 0, drop: 0, score: 0,
    }));
  };
}

/**
 * Boot one game and play several *batches* of runs on it, one seed per run.
 *
 * One boot, however many batches: the modules hold the world, so a process can only ever boot one
 * game (tools/headless/harness.js), and a tool that wants to compare four players has to put them
 * all through that one. `resetToTitle` between runs is what makes that safe - it reseeds, clears the
 * pools and resets the clock, which is the same fresh-page state a second run in a browser gets.
 *
 * `onBatch(summaries, index)` is called as each batch finishes, because a ladder of them is minutes
 * of work and a silent terminal cannot be told apart from a stuck one.
 *
 * A batch is `playRuns`' options object: { seeds: [..], maxSeconds, every, policy, picks, dial,
 * ship, weapon, challenge, at, onRun }.
 */
export async function playBatches(batches, onBatch) {
  const first = batches[0] || {};
  const firstSeeds = first.seeds || [1];
  const game = await bootGame(Object.assign({}, first, { seed: firstSeeds[0] }));
  const results = [];
  let runs = 0;

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const seeds = batch.seeds || [1];
    const summaries = [];
    for (let i = 0; i < seeds.length; i++) {
      // Every run after the very first one, whichever batch it is in, gets a title screen that has
      // never seen a frame - including the first run of every batch after the first.
      if (runs > 0) await game.resetToTitle(seeds[i]);
      const summary = playOneRun(game, batch);
      summaries.push(summary);
      runs++;
      // A batch of long runs is minutes of silence without this, and whoever is watching
      // it wants to know which seed is taking its time.
      if (batch.onRun !== undefined) batch.onRun(summary);
    }
    results.push(summaries);
    if (onBatch !== undefined) onBatch(summaries, b);
  }

  game.stop();
  return results;
}

/**
 * Boot one game and play several runs on it, one per seed.
 * Options: { seeds: [..], maxSeconds, every, policy, picks, dial, ship, weapon, challenge, at, onRun }
 */
export async function playRuns(options) {
  const results = await playBatches([options || {}]);
  return results[0];
}
