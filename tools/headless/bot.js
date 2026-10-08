// The player that plays the game with no browser, shared by tools/simulate.js and
// the tests. Two of them, in fact, because they answer different questions.
//
//   naive   what a distracted human does: point at whatever is closest, shoot at
//           it, back off when it gets too close, drift back to the middle otherwise.
//   aware   the same player with its eyes open: it reads what is about to land -
//           shots in the air, lines that have been drawn but not fired, the circle a
//           bomber is standing in - and steps off it (see tools/headless/threats.js).
//
// Both of them answer the level-up choice when the run stops for one, with keys, the
// way a player does (see `chooseCard` below). Neither of them dashes on its own: `--dash`
// adds `dashEscape` below to whichever policy is running, which is what any line that lives
// on the dash has to be measured with.
//
// The naive one is kept because it is the baseline every older note in NOTES.md was
// measured with, and because a game that is hard for a bot that tries is a different
// claim from one that is hard for a bot that barely tries. `--bot naive` runs it.

import { bootGame } from './harness.js';
import { escapeDirection, SKILL } from './threats.js';
import { makeEnemy } from '../../src/game/kinds.js';

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

/** The two ways to play, and the one the tools use unless told otherwise. */
export const POLICIES = { naive: naiveFrame, aware: awareFrame };
export const DEFAULT_POLICY = 'aware';

/**
 * The level-up choice, taken the way a player takes one: a number key.
 *
 * The policy is written down rather than clever, because a bot that picks at random
 * measures nothing and a bot that picks perfectly overstates a human. So: take the line
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

function chooseCard(game) {
  const offer = game.world.offer;
  if (offer.length === 0) return;
  const number = offer.indexOf(preferredCard(game, offer)) + 1;
  game.key('Digit' + number, true);
  game.key('Digit' + number, false);
}

/**
 * Press the dash when the crowd has got close and the dash is ready.
 *
 * This is the one habit that makes a bot able to use the lines that live on the dash -
 * game/afterimage.js is the first of them - and it is written as what a player does with a dash:
 * a get-out-of-jail press when something is within `PANIC_RANGE`, not a way of crossing the
 * arena. It is opt-in (`tools/simulate.js --dash`) for an honest reason: every run measured in
 * NOTES before it existed was measured with a bot that never touched the dash at all, and those
 * numbers are that bot's. A card that lives on a press the bot will not make cannot be measured
 * without it - and it cannot be measured *fairly* without saying so, because the plain bot pays
 * for such a card in the deal and can never spend it.
 *
 * It goes on `onFrame`, after the step: a dash request is a tap kept until the next frame that
 * actually simulated reads it (src/input/index.js), which is exactly how a key press works.
 * The press lands on whatever the bot is already aiming at, so the one thing a dash must not do
 * to the instrument is move the cursor and change where the gun is pointed.
 */
export function dashEscape(game) {
  if (game.world.state !== game.STATE.PLAY) return;
  const ship = game.player;
  if (ship.dashCd > 0) return;
  const near = nearestEnemy(game);
  if (near === null || near.distance2 > PANIC_RANGE * PANIC_RANGE) return;
  const on = game.screenOf(near.enemy.x, near.enemy.y);
  game.pressMouse(on.x, on.y, 2);
}

/** Play one frame as `policy`. */
export function botFrame(game, policy) {
  // A paused run has one business and it is not flying: the cards are answered first,
  // and the run is back before the next frame is drawn.
  if (game.world.state === game.STATE.LEVEL) {
    chooseCard(game);
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
 * Options: { maxSeconds, every, onFrame, policy, weapon }
 */
export function playOneRun(game, options) {
  const opts = options || {};
  const maxSeconds = opts.maxSeconds === undefined ? 600 : opts.maxSeconds;
  const frameLimit = Math.ceil(maxSeconds * 1000 / FRAME_MS);
  const drawsBefore = game.drawCalls();

  // Which primary to fly, pressed through the game's own door before the launch (the bot
  // does not reach into the world for it, because the title screen is what offers it).
  if (opts.weapon !== undefined) game.chooseWeapon(opts.weapon);

  startBotRun(game);

  let frames = 0;
  let died = false;
  const trace = [];
  while (frames < frameLimit) {
    botFrame(game, opts.policy);
    game.step(FRAME_MS);
    frames++;
    if (opts.onFrame) opts.onFrame(game, frames);
    if (opts.every && frames % opts.every === 0) trace.push(frames + ':' + fingerprint(game));
    if (game.stats().state === game.STATE.OVER) {
      died = true;
      break;
    }
  }

  const draws = game.drawCalls();
  const drawCalls = {};
  for (const key of Object.keys(draws)) drawCalls[key] = draws[key] - drawsBefore[key];

  return {
    died: died,
    policy: opts.policy === undefined ? DEFAULT_POLICY : opts.policy,
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
    // one after the death would be a lie in whatever the test reads off the summary.
    if (game.world.state === game.STATE.OVER) return;
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
 * Boot one game and play several runs on it, one per seed.
 * Options: { seeds: [..], maxSeconds, every, policy, onRun }
 */
export async function playRuns(options) {
  const opts = options || {};
  const seeds = opts.seeds || [1];
  const game = await bootGame(Object.assign({}, opts, { seed: seeds[0] }));
  const summaries = [];
  for (let i = 0; i < seeds.length; i++) {
    if (i > 0) await game.resetToTitle(seeds[i]);
    const summary = playOneRun(game, opts);
    summaries.push(summary);
    // A batch of long runs is minutes of silence without this, and whoever is watching
    // it wants to know which seed is taking its time.
    if (opts.onRun !== undefined) opts.onRun(summary);
  }
  game.stop();
  return summaries;
}
