// What the game will let a coding agent do, and what it says when asked.
//
// A session is the game's front desk: it holds one booted game (the same headless
// game tools/simulate.js plays, through tools/headless/harness.js) and turns tool
// calls into what a player's hands would do - hold a key, move the cursor, press a
// button. Nothing here reaches into the simulation to move the ship: an agent plays
// the game through the same controls a person does, so what it manages is a measure
// of the game and not of the tool. That is the same rule tools/headless/threats.js
// gives the bot.
//
// The session does not know about the wire either. It takes a game and returns plain
// objects, so a test can call the tools directly; tools/agent-bridge.js is what puts
// it on stdin and stdout.

import { STATE } from '../../src/game/state.js';
import { BALANCE } from '../../src/game/balance.js';
import { victoryCardIsUp } from '../../src/game/run.js';
import { WEAPONS, weaponName } from '../../src/game/weapons.js';
import { LINES, banishedLines, effectOf, lineOf, maxRanksOf } from '../../src/game/upgrades.js';
import {
  aimProgress,
  blastPressure,
  blastRadius,
  isAiming,
  isLunging,
  isSpitting,
  lungeReach,
} from '../../src/game/kinds.js';
import { mouse } from '../../src/input/index.js';
import { DEFAULT_POLICY, FRAME_MS, POLICIES, botFrame } from '../headless/bot.js';
import { refuse } from './protocol.js';

/** One frame of the game, in ms - the harness's own idea of a frame. */
const FRAME_SECONDS = FRAME_MS / 1000;

/** How far `step` may jump in one call, in seconds of game time. */
const MAX_STEP = 30;

/** How many of each sort of thing `observe` will name. The rest are "and N more". */
const DEFAULT_NEAREST = 10;
const MAX_NEAREST = 40;

/** Which word the screen answers to. */
const SCREEN = {
  [STATE.START]: 'title',
  [STATE.PLAY]: 'playing',
  [STATE.LEVEL]: 'choosing',
  [STATE.OVER]: 'over',
  [STATE.WON]: 'won',
};

/** The keys the ship answers to, and what `move` calls them. */
const MOVE_KEYS = {
  right: 'KeyD',
  left: 'KeyA',
  down: 'KeyS',
  up: 'KeyW',
};

/** Anything not this far off zero counts as being asked for. The ship has no slow. */
const DEAD_ZONE = 0.1;

function round(value) {
  return Math.round(value);
}

function square(v) {
  return v * v;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * How a line reads from the ship: `along` is how far down it the ship stands,
 * `across` is how far off it and on which side, and `eta` is how long something
 * travelling down it at `speed` would take to arrive. `across` is the number that
 * matters: a ship on a line has an `across` of nothing, and a dodge is making it
 * bigger than whatever is wide enough to hurt it.
 */
function lineReading(ship, x, y, dirX, dirY, speed) {
  const length = Math.hypot(dirX, dirY);
  if (length === 0) return undefined;
  const ux = dirX / length;
  const uy = dirY / length;
  const along = (ship.x - x) * ux + (ship.y - y) * uy;
  const across = (ship.x - x) * uy - (ship.y - y) * ux;
  return {
    across: round(across),
    along: round(along),
    eta: speed > 0 && along > 0 ? +(along / speed).toFixed(2) : null,
  };
}

/** Where a body is, as the ship would describe it: the body is not the point, the gap is. */
function bearing(ship, x, y) {
  return { dx: round(x - ship.x), dy: round(y - ship.y), distance: round(Math.hypot(x - ship.x, y - ship.y)) };
}

/** One body of the crowd, with whatever it has promised to do. */
function describeEnemy(ship, enemy) {
  const brief = {
    type: enemy.type,
    x: round(enemy.x),
    y: round(enemy.y),
    r: round(enemy.r),
    hp: Math.ceil(enemy.hp),
    hpMax: Math.ceil(enemy.maxhp),
    elite: enemy.elite === true,
    distance: round(distance(ship, enemy)),
  };
  if (isAiming(enemy)) {
    // It has locked a line and will cross it when its timer runs out.
    brief.aiming = {
      dirX: +enemy.dirX.toFixed(2),
      dirY: +enemy.dirY.toFixed(2),
      in: +enemy.timer.toFixed(2),
      reach: round(lungeReach(enemy)),
      through: lineReading(ship, enemy.x, enemy.y, enemy.dirX, enemy.dirY, 0),
    };
  }
  if (isLunging(enemy)) {
    brief.lunging = { in: +enemy.timer.toFixed(2), reach: round(lungeReach(enemy)) };
  }
  if (isSpitting(enemy)) {
    brief.spitting = {
      dirX: +enemy.dirX.toFixed(2),
      dirY: +enemy.dirY.toFixed(2),
      in: +enemy.timer.toFixed(2),
      progress: +aimProgress(enemy).toFixed(2),
      through: lineReading(ship, enemy.x, enemy.y, enemy.dirX, enemy.dirY, 0),
    };
  }
  const blast = blastRadius(enemy);
  if (blast > 0) {
    // Its death is the attack, and the ring drawn under it is exactly this wide.
    brief.blast = { radius: round(blast), pressure: +blastPressure(enemy).toFixed(2) };
  }
  return brief;
}

/** One shot in the air, and when it would arrive if nobody moved. */
function describeShot(ship, shot) {
  const speed = Math.hypot(shot.vx, shot.vy);
  const reading = lineReading(ship, shot.x, shot.y, shot.vx, shot.vy, speed);
  return {
    x: round(shot.x),
    y: round(shot.y),
    r: +shot.r.toFixed(1),
    speed: round(speed),
    distance: round(distance(ship, shot.x, shot.y)),
    from: shot.from,
    in: reading === undefined ? null : reading.eta,
    across: reading === undefined ? null : reading.across,
  };
}

/** Put `items` in the order `pick` likes and keep the front of the queue. */
function theNearest(items, count, pick) {
  return items
    .map((item) => ({ item: item, rank: pick(item) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, count)
    .map((row) => row.item);
}

function poolArray(pool) {
  const out = [];
  for (let i = 0; i < pool.count; i++) out.push(pool.items[i]);
  return out;
}

/** The cards on the table, numbered the way the keys number them. */
function describeOffer(world) {
  return world.offer.map((id, index) => ({
    number: index + 1,
    id: id,
    name: lineOf(id).name,
    effect: effectOf(id),
    rank: world.upgrades[id],
    max: maxRanksOf(id),
  }));
}

/** Ranks worth mentioning: the lines the run actually has a rank in. */
function describeRanksTaken(world) {
  const taken = {};
  for (const line of LINES) {
    if (world.upgrades[line.id] > 0) taken[line.id] = world.upgrades[line.id];
  }
  return taken;
}

function describeRun(world) {
  const tally = world.tally;
  return {
    score: world.score,
    best: world.best,
    newBest: world.newBest,
    seconds: +world.elapsed.toFixed(2),
    wave: world.waveNumber,
    level: world.player.level,
    kills: world.kills,
    shards: world.shardsCollected,
    seed: world.seed,
    weapon: weaponName(world),
    // The build, as ranks per line - the same map `status` answers with, so an agent
    // can compare the run it is playing against the one that just ended. The card the
    // player is shown spells this out in words (game/upgrades.js `describeRanks`).
    build: describeRanksTaken(world),
    // Why it ended, in the game's own words (game/tally.js), and what it cost what.
    // `won` is the other half of that answer: a run that outlasted the whole schedule ended as
    // well as one that ran out of hull did, and the two are not the same event.
    won: tally.won,
    died: {
      killedBy: tally.killedBy,
      hullLost: tally.hullLost,
      arrived: tally.arrived,
      killed: tally.killed,
      hurtBy: Object.assign({}, tally.hurtBy),
    },
  };
}

/**
 * A front desk for one booted game.
 *
 * Options: { report(event, data, level), autopilot, policy }
 * `report` is where the session says "a wave arrived" / "the run ended" as they
 * happen, whether the moment came from a `step` call or from the real-time pump.
 */
export function createSession(game, options) {
  const opts = options || {};
  const report = opts.report === undefined ? function () {} : opts.report;
  if (!game || typeof game.step !== 'function') throw new Error('a session needs a booted game');

  const session = {
    /** The keys being held for the ship, as `move` left them. */
    held: { up: false, down: false, left: false, right: false },
    firing: false,
    autopilot: opts.autopilot === true,
    policy: opts.policy === undefined ? DEFAULT_POLICY : opts.policy,
    // What the last frame looked like, so a change can be noticed and said out loud.
    was: { screen: '', wave: 0, choosing: false },
  };
  session.was.screen = SCREEN[game.world.state];

  /** One frame: whatever the session is holding, plus the bot if it is flying. */
  function frame() {
    if (session.autopilot) botFrame(game, session.policy);
    game.step(FRAME_MS);
    notice();
  }

  /** Say what just happened, once each: a new wave, cards on the table, a dead ship. */
  function notice() {
    const world = game.world;
    const screen = SCREEN[world.state];
    const from = session.was.screen;
    if (screen !== from) {
      session.was.screen = screen;
      if (screen === 'choosing') report('level-up', { offer: describeOffer(world) });
      else if (screen === 'over') report('died', describeRun(world));
      // A run beginning, not a card being taken: the screen goes to `playing` both
      // times, and only one of them is worth telling anybody about.
      else if (screen === 'playing' && (from === 'title' || from === 'over')) {
        report('started', { seed: world.seed });
      }
    }
    if (world.waveNumber !== session.was.wave) {
      session.was.wave = world.waveNumber;
      // A wave every few seconds by the end of a long run, so this one is quieter
      // than the rest: a client that wants it asks for it (logging/setLevel).
      if (screen === 'playing') report('wave', { wave: world.waveNumber, seconds: +world.elapsed.toFixed(1) }, 'debug');
    }
  }

  function stopHolding() {
    for (const name of Object.keys(MOVE_KEYS)) {
      if (session.held[name]) {
        session.held[name] = false;
        game.key(MOVE_KEYS[name], false);
      }
    }
    if (session.firing) {
      session.firing = false;
      game.releaseMouse(0);
    }
  }

  // ---- the tools -------------------------------------------------------------

  function status() {
    const world = game.world;
    const ship = world.player;
    const out = {
      screen: SCREEN[world.state],
      seed: world.seed,
      best: world.best,
      weapon: weaponName(world),
      autopilot: session.autopilot ? session.policy : 'off',
      run: {
        seconds: +world.elapsed.toFixed(2),
        score: world.score,
        wave: world.waveNumber,
        level: ship.level,
        xp: round(world.xp),
        xpNeed: round(world.xpNeed),
        kills: world.kills,
        shards: world.shardsCollected,
        hull: ship.hull,
        maxHull: ship.maxHull,
      },
      upgrades: describeRanksTaken(world),
      offer: describeOffer(world),
      owedCards: world.pendingLevels,
      // The two asks a run has about its own deal (game/upgrades.js): what is left of
      // each, and which lines the run has already cut out of its deck. An agent that
      // cannot see a spent chip has no reason to look for one.
      asks: { rerolls: world.rerollsLeft, banishes: world.banishesLeft },
      cut: banishedLines(world).map((id) => lineOf(id).name),
    };
    if (world.state === STATE.OVER) {
      out.restartIn = Math.max(0, +(BALANCE.runOver.restartGuard - world.overTimer).toFixed(2));
    }
    // Over a win the wait is not the key guard but the card: the hush is what has to pass before
    // the game will take somewhere else (game/run.js `victoryCardIsUp`).
    if (world.state === STATE.WON) {
      out.restartIn = Math.max(0, +(BALANCE.victory.hush - world.overTimer).toFixed(2));
    }
    return out;
  }

  function observe(args) {
    const count = intArg(args, 'nearest', DEFAULT_NEAREST, 1, MAX_NEAREST);
    const world = game.world;
    const ship = world.player;

    const enemies = world.enemies.slice();
    const shots = poolArray(world.enemyShots);
    const shards = poolArray(world.shards);

    const nearest = (item) => square(item.x - ship.x) + square(item.y - ship.y);
    const seen = theNearest(enemies, count, nearest).map((enemy) => describeEnemy(ship, enemy));
    const incoming = theNearest(shots, count, nearest).map((shot) => describeShot(ship, shot));
    const glinting = theNearest(shards, count, nearest).map((shard) => {
      const where = bearing(ship, shard.x, shard.y);
      return { x: round(shard.x), y: round(shard.y), worth: shard.worth, distance: where.distance };
    });

    return {
      screen: SCREEN[world.state],
      seconds: +world.elapsed.toFixed(2),
      ship: {
        x: round(ship.x),
        y: round(ship.y),
        vx: round(ship.vx),
        vy: round(ship.vy),
        hull: ship.hull,
        maxHull: ship.maxHull,
        invulnerable: ship.invuln > 0,
        // The dash, as the player feels it: how long until the next one is allowed,
        // and how much of the one in progress is still to run (`0` when standing still).
        dashIn: +ship.dashCd.toFixed(2),
        dashing: round(ship.dashLeft),
        // Where the nose is pointing, which is where a shot leaves: the cursor sets
        // the facing, and `aim` is what moves the cursor.
        facing: {
          x: round(ship.x + Math.cos(ship.angle) * 100),
          y: round(ship.y + Math.sin(ship.angle) * 100),
        },
      },
      arena: { w: world.arena.w, h: world.arena.h },
      enemies: seen,
      moreEnemies: Math.max(0, enemies.length - seen.length),
      shots: incoming,
      moreShots: Math.max(0, shots.length - incoming.length),
      shards: glinting,
      moreShards: Math.max(0, shards.length - glinting.length),
      orbitals: world.orbit.drones.length,
      nova: { fronts: world.nova.fronts.count, nextIn: +world.nova.wait.toFixed(2), every: +world.nova.beat.toFixed(2) },
      held: heldNames(),
      firing: session.firing,
    };
  }

  function heldNames() {
    // Sorted, so the answer is the same list every time rather than the order the
    // keys happen to be kept in.
    const names = [];
    for (const name of Object.keys(session.held)) if (session.held[name]) names.push(name);
    return names.sort();
  }

  function move(args) {
    const dx = numberArg(args, 'dx', 0);
    const dy = numberArg(args, 'dy', 0);
    // The ship has no analog speed: a key held is a key held. Anything inside the
    // dead zone counts as not asked for, which is how `dx: 0.02` stops being a drift.
    // A paused run takes the keys too, and holds them until it is back - which is what
    // a player pressing on through an upgrade choice does.
    setHold('right', dx > DEAD_ZONE);
    setHold('left', dx < -DEAD_ZONE);
    setHold('down', dy > DEAD_ZONE);
    setHold('up', dy < -DEAD_ZONE);
    return { held: heldNames() };
  }

  function setHold(name, on) {
    if (session.held[name] === on) return;
    session.held[name] = on;
    game.key(MOVE_KEYS[name], on);
  }

  function aim(args) {
    const x = numberArg(args, 'x', undefined);
    const y = numberArg(args, 'y', undefined);
    if (x === undefined || y === undefined) refuse('aim wants an x and a y in arena coordinates');
    // The controls speak in pixels on the glass; the camera says where that is.
    const on = game.screenOf(x, y);
    game.moveMouse(on.x, on.y);
    return {
      aim: { x: round(x), y: round(y) },
      onScreen: { x: round(on.x), y: round(on.y) },
      angle: +game.world.player.angle.toFixed(2),
    };
  }

  function setFiring(down) {
    if (down === session.firing) return;
    session.firing = down;
    // Press where the cursor already is: a press that also moved the aim would be
    // two orders in one, and the second one unasked for.
    if (down) game.pressMouse(mouse.x, mouse.y, 0);
    else game.releaseMouse(0);
  }

  function trigger(args) {
    const down = boolArg(args, 'down', true);
    setFiring(down);
    return { firing: session.firing };
  }

  function dash() {
    if (game.world.state !== STATE.PLAY) refuse('there is no run flying to dash');
    // The right button, not Space: Space means "start a run" on the other screens,
    // and a dash that launched a second run would be a lie about what was pressed.
    game.pressMouse(mouse.x, mouse.y, 2);
    const ship = game.world.player;
    return { dashIn: +ship.dashCd.toFixed(2), dashing: round(ship.dashLeft) };
  }

  function choose(args) {
    const world = game.world;
    if (world.state !== STATE.LEVEL) refuse('no upgrade is on the table right now');
    const number = intArg(args, 'number', undefined, 1, world.offer.length);
    if (number === undefined) refuse('choose wants which card: a number from 1 to ' + world.offer.length);
    // Read the table before the key goes down: taking a card empties it.
    const table = describeOffer(world);
    game.key('Digit' + number, true);
    game.key('Digit' + number, false);
    notice();
    return { took: table[number - 1], offer: describeOffer(world), screen: SCREEN[world.state] };
  }

  /**
   * R: the run asks for the table again. Whether it gets it is the game's business, not
   * this one's - a reroll is refused when the run has spent its asks or when nothing else
   * could be dealt, and either way the ask it did not spend comes back as a refusal.
   */
  function reroll() {
    const world = game.world;
    if (world.state !== STATE.LEVEL) refuse('no upgrade is on the table right now');
    const asks = world.rerollsLeft;
    const before = world.offer.join(',');
    game.key('KeyR', true);
    game.key('KeyR', false);
    if (world.offer.join(',') === before) {
      refuse(asks > 0
        ? 'nothing else could be dealt - every line with a rank left is already on the table, and the ask was kept'
        : 'this run has spent its rerolls');
    }
    notice();
    return { offer: describeOffer(world), rerollsLeft: world.rerollsLeft, screen: SCREEN[world.state] };
  }

  /** Shift + a card's number: that line is out of this run's deck for good. */
  function banish(args) {
    const world = game.world;
    if (world.state !== STATE.LEVEL) refuse('no upgrade is on the table right now');
    const number = intArg(args, 'number', undefined, 1, world.offer.length);
    if (number === undefined) refuse('banish wants which card: a number from 1 to ' + world.offer.length);
    const asks = world.banishesLeft;
    const gone = describeOffer(world)[number - 1];
    game.key('Digit' + number, true, { shiftKey: true });
    game.key('Digit' + number, false, { shiftKey: true });
    if (world.banishesLeft === asks) {
      refuse(asks > 0
        ? 'that one could not be cut - nothing is left to replace it with, and the ask was kept'
        : 'this run has spent its banishes');
    }
    notice();
    return {
      banished: gone.name,
      offer: describeOffer(world),
      banishesLeft: world.banishesLeft,
      cut: banishedLines(world).map((id) => lineOf(id).name),
      screen: SCREEN[world.state],
    };
  }

  function chooseWeapon(args) {
    const world = game.world;
    if (world.state === STATE.PLAY || world.state === STATE.LEVEL) {
      refuse('a run does not swap its primary mid-flight; choose one between runs');
    }
    const wanted = stringArg(args, 'weapon');
    const known = WEAPONS.map((gun) => gun.id);
    if (known.indexOf(wanted) < 0) refuse('no primary is called "' + wanted + '"; the ones on offer are ' + known.join(', '));
    game.chooseWeapon(wanted);
    return { weapon: weaponName(world) };
  }

  function start() {
    if (game.world.state === STATE.PLAY || game.world.state === STATE.LEVEL) refuse('a run is already flying');
    // Over a won run whose card is up, Space no longer means "a new run": it hands that one back to
    // fly on (game/run.js `continueRun`). This tool asks for a new one, so it says so rather than
    // pressing a key that would quietly keep the old run and its score.
    if (victoryCardIsUp(game.world)) {
      refuse('that run was won and its card is up: Space would keep it flying, not begin a new one');
    }
    // The same key press a player makes. Space means "go" on the title and the
    // game-over card, and the game itself retires the dash it would otherwise queue.
    game.key('Space', true);
    game.key('Space', false);
    notice();
    if (game.world.state !== STATE.PLAY) {
      const why = game.world.state === STATE.OVER
        ? '; it has only just ended, so let it be for ' + BALANCE.runOver.restartGuard + 's and try again'
        : game.world.state === STATE.WON
          ? '; it was won, and its card has ' + BALANCE.victory.hush + 's of hush still on it'
          : '';
      refuse('the game did not start' + why);
    }
    return { screen: 'playing', seed: game.world.seed, weapon: weaponName(game.world) };
  }

  function result() {
    if (game.world.state === STATE.PLAY || game.world.state === STATE.LEVEL) refuse('that run is still flying');
    if (game.world.elapsed === 0) refuse('no run has been played yet');
    return describeRun(game.world);
  }

  /**
   * Advance the game, which is what an agent does when it cannot react in real time.
   * Stops early - and says why - the moment the game needs an answer from it.
   */
  function step(args) {
    const seconds = numberArg(args, 'seconds', 0.5);
    if (seconds <= 0) refuse('step wants a positive number of seconds');
    if (seconds > MAX_STEP) refuse('step will not jump more than ' + MAX_STEP + ' seconds at a time');
    const frames = Math.max(1, Math.round(seconds / FRAME_SECONDS));
    let run = 0;
    let reason = 'time';
    while (run < frames) {
      const screen = SCREEN[game.world.state];
      if (screen === 'title') { reason = 'title'; break; }
      if (screen === 'choosing' && !session.autopilot) { reason = 'needs a card choice'; break; }
      frame();
      run++;
      if (screen === 'over') {
        // A dead run has one business left, and it is the short guard before it will
        // take another: let that tick by, and come back as soon as it would.
        reason = 'died';
        if (game.world.overTimer > BALANCE.runOver.restartGuard) break;
      }
      if (screen === 'won') {
        // A won run has the same one business and a longer wait: the hush the card arrives on
        // (game/run.js `winRun`). An agent that steps over a win would otherwise sit through the
        // whole window watching an arena that has stopped.
        reason = 'won';
        if (game.world.overTimer > BALANCE.victory.hush) break;
      }
    }
    return { advanced: +(run * FRAME_SECONDS).toFixed(2), reason: reason, status: status() };
  }

  function autopilot(args) {
    const on = boolArg(args, 'on', true);
    const policy = args.policy === undefined ? session.policy : stringArg(args, 'policy');
    if (on && !POLICIES[policy]) {
      refuse('no bot policy is called "' + policy + '"; there are ' + Object.keys(POLICIES).join(' and '));
    }
    session.policy = policy;
    session.autopilot = on;
    // Handover, both ways: the bot will not inherit a key this session is holding,
    // and the session will not steer against a bot that is already flying.
    stopHolding();
    // The bot aims and flies; it does not decide to shoot, because a player holds the
    // fire button down and lets the aiming do the work. So a handover holds it.
    if (on) setFiring(true);
    return { autopilot: on ? policy : 'off', firing: session.firing };
  }

  return {
    status: status,
    observe: observe,
    move: move,
    aim: aim,
    trigger: trigger,
    dash: dash,
    choose: choose,
    reroll: reroll,
    banish: banish,
    chooseWeapon: chooseWeapon,
    start: start,
    step: step,
    autopilot: autopilot,
    runResult: result,
    /** One frame, whether it comes from the pump or from `step`. */
    frame: frame,
    /** Say anything that has happened since the last look. */
    notice: notice,
    /** Let go of everything, the way a window losing focus does. */
    stopHolding: stopHolding,
  };
}

// ---- argument reading --------------------------------------------------------
// An agent writes these by hand, so a wrong one is answered with a sentence and not
// with a stack trace: the agent has to be able to fix what it typed.

function numberArg(args, name, fallback) {
  const value = args[name];
  if (value === undefined) return fallback;
  const number = typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(number)) refuse('"' + name + '" wants a number, and got ' + JSON.stringify(value));
  return number;
}

function intArg(args, name, fallback, min, max) {
  if (args[name] === undefined) return fallback;
  const number = numberArg(args, name, fallback);
  if (!Number.isInteger(number)) refuse('"' + name + '" wants a whole number');
  if (number < min || number > max) refuse('"' + name + '" has to be between ' + min + ' and ' + max);
  return number;
}

function boolArg(args, name, fallback) {
  const value = args[name];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') refuse('"' + name + '" wants true or false');
  return value;
}

function stringArg(args, name) {
  const value = args[name];
  if (value === undefined) refuse('"' + name + '" is missing');
  if (typeof value !== 'string') refuse('"' + name + '" wants a word');
  return value;
}

/**
 * The tools, as the wire advertises them and as `callTool` runs them.
 *
 * `description` is what an agent reads before it acts, so each one says what the
 * game will answer with and what the order means in the player's own terms.
 */
export const TOOLS = [
  {
    name: 'status',
    description: 'Where the game is - title, playing, choosing, or over - with the run\'s score, wave, hull, level, the build so far, and any upgrade cards on the table.',
    inputSchema: { type: 'object', properties: {} },
    run: function (api) { return api.status(); },
  },
  {
    name: 'observe',
    description: 'What the ship can see: where it stands, the nearest bodies and what each has promised to do, the shots in the air and when they arrive, the shards on the floor, the nova clock. Coordinates are arena pixels; the ship is at (x, y).',
    inputSchema: {
      type: 'object',
      properties: {
        nearest: { type: 'integer', description: 'How many of each sort to name, nearest first. Default 10, up to 40.' },
      },
    },
    run: function (api, args) { return api.observe(args); },
  },
  {
    name: 'move',
    description: 'Hold the ship one way: dx and dy from -1 to 1, where x is right and y is down. It has no slow, so anything outside a small dead zone counts as that way. Both zero stops.',
    inputSchema: {
      type: 'object',
      properties: {
        dx: { type: 'number', description: '-1 left, 0 nothing, 1 right' },
        dy: { type: 'number', description: '-1 up, 0 nothing, 1 down' },
      },
    },
    run: function (api, args) { return api.move(args); },
  },
  {
    name: 'aim',
    description: 'Point the ship at an arena point. The ship faces where the cursor is, so this is where its shots will go.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'arena x in pixels' },
        y: { type: 'number', description: 'arena y in pixels' },
      },
      required: ['x', 'y'],
    },
    run: function (api, args) { return api.aim(args); },
  },
  {
    name: 'trigger',
    description: 'Hold or release the fire button, at whatever the cursor is pointing at. While the upgrade cards are up the fire button is also the answer to them: a press takes the card the cursor is over, exactly as it does for a player.',
    inputSchema: {
      type: 'object',
      properties: { down: { type: 'boolean', description: 'true to hold it, false to let go. Default true.' } },
    },
    run: function (api, args) { return api.trigger(args); },
  },
  {
    name: 'dash',
    description: 'Dash: a short burst of speed, and no damage while it lasts. It has a cooldown, and the ship dashes the way it is going.',
    inputSchema: { type: 'object', properties: {} },
    run: function (api) { return api.dash(); },
  },
  {
    name: 'choose',
    description: 'Take one of the upgrade cards on the table, by the number the game prints on it. Only while the run is holding still for the choice.',
    inputSchema: {
      type: 'object',
      properties: { number: { type: 'integer', description: 'which card, counting from 1' } },
      required: ['number'],
    },
    run: function (api, args) { return api.choose(args); },
  },
  {
    name: 'reroll',
    description: 'Ask for the whole table to be dealt again - it costs one of the run\'s rerolls, and each run is granted one. Refused, with the ask kept, if the run has spent its rerolls or if every line with a rank left is already on the table.',
    inputSchema: { type: 'object', properties: {} },
    run: function (api) { return api.reroll(); },
  },
  {
    name: 'banish',
    description: 'Take a card off the table without taking it: that upgrade line cannot come up again for the rest of the run, and the slot is refilled. Costs one of the run\'s banishes, and each run is granted one.',
    inputSchema: {
      type: 'object',
      properties: { number: { type: 'integer', description: 'which card, counting from 1' } },
      required: ['number'],
    },
    run: function (api, args) { return api.banish(args); },
  },
  {
    name: 'choose_weapon',
    description: 'Pick which primary the next run flies. Only between runs.',
    inputSchema: {
      type: 'object',
      properties: { weapon: { type: 'string', description: 'one of the primaries on offer' } },
      required: ['weapon'],
    },
    run: function (api, args) { return api.chooseWeapon(args); },
  },
  {
    name: 'start',
    description: 'Begin a run, from the title or from the game-over card. The seed the run plays on is answered back.',
    inputSchema: { type: 'object', properties: {} },
    run: function (api) { return api.start(); },
  },
  {
    name: 'step',
    description: 'Let the game run for a while - up to 30 seconds - and get the state back afterwards. It stops early, and says why, if the run ends or a card is dealt and nobody is flying.',
    inputSchema: {
      type: 'object',
      properties: { seconds: { type: 'number', description: 'how much game time to let go by. Default 0.5.' } },
    },
    run: function (api, args) { return api.step(args); },
  },
  {
    name: 'autopilot',
    description: 'Hand the flying to the headless bot, so a slow player can still play the decisions: it flies, shoots, dodges and takes the upgrade cards itself, and it holds the fire button. on:false gives everything back.',
    inputSchema: {
      type: 'object',
      properties: {
        on: { type: 'boolean', description: 'default true' },
        policy: { type: 'string', description: 'aware (dodges what is aimed at it, the default) or naive (walks and shoots)' },
      },
    },
    run: function (api, args) { return api.autopilot(args); },
  },
  {
    name: 'run_result',
    description: 'What the finished run was: score, time, build, and what killed the ship.',
    inputSchema: { type: 'object', properties: {} },
    run: function (api) { return api.runResult(); },
  },
];

/** The tool descriptors, for `tools/list`. */
export function toolList() {
  return TOOLS.map(function (tool) {
    return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
  });
}

/**
 * Run one tool by name on a session's front desk. Throws AgentError for a refusal
 * and for a tool nobody offered; the wire turns both into an answer.
 */
export function callTool(api, name, args) {
  const tool = TOOLS.filter((one) => one.name === name)[0];
  if (tool === undefined) refuse('the game has no tool called "' + name + '"');
  return tool.run(api, args === undefined ? {} : args);
}
