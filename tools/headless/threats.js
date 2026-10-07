// What the bot is afraid of, and the way out of it.
//
// This is the bot's eyes. It reads the world and answers one question - which way
// should the ship be going - and it answers it out of the same information a player
// is given: a shot already in the air, a darter standing still with a line drawn
// down it, a spitter's mouth filling up, the circle a bomber is standing in. It
// never looks at a number the player is not shown, so a bot that lives a long time
// here is a measure of the game being readable, not of the tool getting an edge.
//
// Everything in it is a *push*: a threat says which way to get out of the way and
// how loudly. They are added up and the sum is the direction the ship wants. That
// is deliberately not a planner - a player reacts to the two or three things about
// to land on them, and so does this.
//
// Two rules do most of the work, and they are the two a player would name:
//
//   * urgency - a threat is louder the sooner it lands. Time to arrival, not
//     distance, is what the weight is made of, so a shot about to connect outvotes
//     a drifter breathing on the ship and a line drawn for next second is a hint.
//   * commitment - stepping off a line means getting clear of it, not edging to the
//     edge of being hit. Every line threat keeps pushing until the ship is
//     comfortably off it (`clear`), fading out over that distance. A ship that
//     stopped the moment it was technically missed would be standing on the same
//     line when the next volley was aimed.
//
// The numbers here are the bot's skill, not the game's balance, so they live with
// the bot and not in balance.js. Change them and you have changed the player, not
// the game.

import {
  aimProgress,
  blastPressure,
  blastRadius,
  isAiming,
  isLunging,
  isSpitting,
  lungeReach,
} from '../../src/game/kinds.js';

/**
 * How good this player is. Distances are px, times are seconds, weights are only
 * meaningful against each other.
 *
 *   personalSpace   the air it likes around its hull before it moves at all
 *   shotRoom        how close a shot has to be aimed for it to bother moving
 *   shotClear       how far off the line it wants to end up
 *   shotHorizon     how far ahead it looks for something to land
 *   telegraphRoom / telegraphClear   the same pair for a line that has been drawn
 *                   but not fired - it is being aimed at, so it can be looser
 *   blastRoom       how far outside a bomber's circle it stands
 *   wallRoom        how far off the edge of the world it tries to stay
 *   calm            where the whole sum stops counting as a threat at all
 *   idleWeight      the share of a threat's weight that survives when it is nowhere
 *                   near landing - zero would mean ignoring a shot until it is nearly
 *                   on top of the ship
 */
export const SKILL = {
  // Measured, not guessed: at 90 px of personal space the crowd simply walks the bot
  // down and it dies at ~2m; at 130 px it kites the crowd instead of trading blows
  // with it and dies at ~6m, which is also where PLAN's milestone 10 wants the bot to
  // be dying. Past ~170 px it stops dying at all, which makes it a useless ruler.
  personalSpace: 130,
  meleeWeight: 1,
  shotRoom: 30,
  shotClear: 95,
  shotHorizon: 1.3,
  shotWeight: 2.6,
  telegraphRoom: 26,
  telegraphClear: 100,
  aimWeight: 1.6,
  lungeWeight: 2.4,
  spitWeight: 1.5,
  blastRoom: 40,
  blastWeight: 1,
  wallRoom: 130,
  wallWeight: 0.7,
  calm: 0.06,
  idleWeight: 0.25,
};

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Add one push to the running total.
 */
function addPush(avoid, dx, dy, weight) {
  avoid.x += dx * weight;
  avoid.y += dy * weight;
}

/** A fresh total. */
function total() {
  return { x: 0, y: 0 };
}

/**
 * How far a point stands from a line, measured the way a dodge is measured: `along`
 * is how far down the line it is from where the line starts, `across` is how far off
 * the line it is and on which side. A ship sitting on a line something travels down
 * has to make `across` bigger; that is the whole of a dodge.
 */
function offset(fromX, fromY, dirX, dirY, x, y) {
  const rx = x - fromX;
  const ry = y - fromY;
  return { along: rx * dirX + ry * dirY, across: rx * dirY - ry * dirX };
}

/**
 * Which side of a line to step to. Normally the side the ship is already nearest -
 * it is already off the line, so that is the way it is going. Dead on the line
 * (`across` is nothing) it has to choose anyway, and then it steps the way it was
 * already drifting, which is what a player does: you finish the dodge you started.
 * With no drift either, it picks the side that points away from the edge of the
 * world rather than the one that pins itself against it.
 */
function stepOffLine(world, ship, dirX, dirY, across) {
  let side = across >= 0 ? 1 : -1;
  if (Math.abs(across) < 1) {
    const drift = dirY * ship.vx - dirX * ship.vy;
    if (drift < 0) return { x: -dirY, y: dirX };
    if (drift === 0) {
      const toCentreX = world.arena.w / 2 - ship.x;
      const toCentreY = world.arena.h / 2 - ship.y;
      if (dirY * toCentreX - dirX * toCentreY < 0) return { x: -dirY, y: dirX };
    }
  }
  return { x: dirY * side, y: -dirX * side };
}

/**
 * One threat that travels in a straight line: an enemy shot, a darter's locked
 * lunge, a line a spitter has already taken aim down.
 *
 *   line     { x, y, dirX, dirY, reach } - where the line starts, which way it
 *            goes, and how far down it it is worth caring about
 *   room     how far off the line the ship has to be before it stops minding
 *   clear    how far off it keeps stepping to be sure
 *   lands    seconds until it arrives, from where the ship stands now
 *   weight   how loudly this kind of threat asks
 */
function lineThreat(world, avoid, line, room, clear, lands, weight) {
  const ship = world.player;
  if (line.dirX === 0 && line.dirY === 0) return;
  const where = offset(line.x, line.y, line.dirX, line.dirY, ship.x, ship.y);
  // Behind the ship, or beyond the reach of the thing that travels down it.
  if (where.along < 0 || where.along > line.reach) return;
  const across = Math.abs(where.across);
  if (across >= clear) return;

  // Full weight anywhere inside `room`, easing out to nothing at `clear`. That tail
  // is the commitment: the ship is already safe at `room` and keeps going anyway.
  const off = room >= clear ? 1 : clamp01((clear - across) / (clear - room));
  const urgency = SKILL.idleWeight + (1 - SKILL.idleWeight) * clamp01(1 - lands / SKILL.shotHorizon);
  const step = stepOffLine(world, ship, line.dirX, line.dirY, where.across);
  addPush(avoid, step.x, step.y, weight * off * urgency);
}

/** Everything already in the air and flying at the ship. */
function dodgeShots(world, avoid) {
  const ship = world.player;
  const shots = world.enemyShots;
  for (let i = 0; i < shots.count; i++) {
    const shot = shots.items[i];
    const speed = Math.hypot(shot.vx, shot.vy);
    if (speed === 0) continue;
    const dirX = shot.vx / speed;
    const dirY = shot.vy / speed;
    const where = offset(shot.x, shot.y, dirX, dirY, ship.x, ship.y);
    // The reach is however far the shot can still travel inside the look-ahead, so
    // "further than the ship is looking" and "further than the shot can get" are the
    // one test. A shot the ship has already passed is behind it, and `lineThreat`
    // answers that by ignoring it.
    lineThreat(world, avoid,
      { x: shot.x, y: shot.y, dirX: dirX, dirY: dirY, reach: speed * SKILL.shotHorizon },
      shot.r + ship.r + SKILL.shotRoom, shot.r + ship.r + SKILL.shotClear,
      Math.max(0, where.along) / speed, SKILL.shotWeight);
  }
}

/**
 * The crowd: what can touch the ship, what has promised to, and the one kind that
 * is worth more room than its own body.
 */
function dodgeCrowd(world, avoid) {
  const ship = world.player;
  for (const enemy of world.enemies) {
    const dx = ship.x - enemy.x;
    const dy = ship.y - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;

    // Anything that can touch the ship: pushed directly away from it, louder the
    // closer it stands. The plain bot gave the one nearest body that say; the whole
    // crowd gets it, which is what keeps the ship out of a knot.
    const reach = enemy.r + ship.r + SKILL.personalSpace;
    if (dist < reach) addPush(avoid, dx / dist, dy / dist, SKILL.meleeWeight * (1 - dist / reach));

    telegraphed(world, avoid, enemy, dist);
  }
}

/**
 * The three promises the game draws before it strikes: a darter lining itself up, a
 * darter already committed, and a spitter mid-breath. Each is a line the ship had
 * better not be standing on when the blow lands - and it lands at a time the enemy's
 * own timer says, which is what makes the warning worth anything.
 */
function telegraphed(world, avoid, enemy, dist) {
  const stats = enemy.kind.stats;
  const ship = world.player;
  const room = enemy.r + ship.r + SKILL.telegraphRoom;
  const clear = room + SKILL.telegraphClear;

  if (stats.hunt && enemy.speed > 0) {
    // `&& enemy.speed > 0` because a darter that cannot walk cannot lunge anywhere,
    // and the game's own `lungeReach` is a balance constant that does not know that:
    // its arrival time would then be a division by nothing.
    const lungeSpeed = enemy.speed * stats.hunt.lunge.mul;
    if (isAiming(enemy)) {
      // It fires when its aim timer runs out, then crosses the gap at lunge speed.
      lineThreat(world, avoid,
        { x: enemy.x, y: enemy.y, dirX: enemy.dirX, dirY: enemy.dirY, reach: lungeReach(enemy) },
        room, clear,
        enemy.timer + Math.max(0, dist - enemy.r) / lungeSpeed,
        SKILL.aimWeight * (0.5 + aimProgress(enemy)));
    }
    if (isLunging(enemy)) {
      // It is on the line already; how much of the line is left is its timer's doing.
      const left = enemy.stageTime > 0 ? enemy.timer / enemy.stageTime : 0;
      lineThreat(world, avoid,
        { x: enemy.x, y: enemy.y, dirX: enemy.dirX, dirY: enemy.dirY, reach: lungeReach(enemy) * left },
        room, clear, dist / lungeSpeed, SKILL.lungeWeight);
    }
  }

  if (stats.spit && isSpitting(enemy)) {
    // It has already chosen the line and the shot will be slow, so this is the cheap
    // half of the dodge: step off once, before anything has even been fired.
    lineThreat(world, avoid,
      { x: enemy.x, y: enemy.y, dirX: enemy.dirX, dirY: enemy.dirY,
        reach: stats.spit.shot.speed * stats.spit.shot.life },
      room, clear,
      enemy.timer + dist / stats.spit.shot.speed,
      SKILL.spitWeight * (0.4 + aimProgress(enemy)));
  }

  // A bomber's circle is drawn on the floor at exactly its reach, and the bot knows
  // what it is for: standing in it when anything kills the bomber costs two hull. For
  // a bomber the ring - and the margin around it - falls inside the air the ship keeps
  // around any body anyway, so what it adds here is say rather than distance: the ship
  // pushes away from a bomb much harder than away from a body of the same size, and it
  // pushes harder as the bomb is damaged, which is exactly when the bomber itself is in
  // a hurry. A kind whose blast reached further than the ship's own air would get the
  // distance out of it too.
  const blast = blastRadius(enemy);
  if (blast > 0 && dist < blast + SKILL.blastRoom) {
    addPush(avoid, (ship.x - enemy.x) / dist, (ship.y - enemy.y) / dist,
      SKILL.blastWeight * (1 + blastPressure(enemy)));
  }
}

/** The edge of the world: a dodge into a wall is not a dodge. */
function awayFromTheWalls(world, avoid) {
  const ship = world.player;
  const room = SKILL.wallRoom;
  addPush(avoid, 1, 0, SKILL.wallWeight * clamp01((room - ship.x) / room));
  addPush(avoid, -1, 0, SKILL.wallWeight * clamp01((room - (world.arena.w - ship.x)) / room));
  addPush(avoid, 0, 1, SKILL.wallWeight * clamp01((room - ship.y) / room));
  addPush(avoid, 0, -1, SKILL.wallWeight * clamp01((room - (world.arena.h - ship.y)) / room));
}

/**
 * Which way the ship wants to go, as a unit vector, and `pressure`: how loudly the
 * arena is asking, counted before the walls were asked their opinion. Still, and no
 * pressure, when nothing nearby can hurt it.
 *
 * Two honest limits, both measured rather than assumed:
 *
 *   * The asks are added and nothing else. A perfectly symmetric pinch - two equal
 *     bodies closing from exactly opposite sides - adds up to nothing, and then the
 *     ship has no opinion. Over six real runs and 64 000 frames in which something
 *     was out there, the sum cancelled to nothing not once, so this is a paper limit
 *     and not a way to die. A rule that committed to the loudest single ask instead
 *     was tried and measured a wash on 24 seeds, and it oscillated: with no memory
 *     between frames the loudest body flickers between two equals.
 *   * `pressure` is loudness, not direction: it answers "should the ship move at all",
 *     which is what the bot wants, since the keys it presses are all-or-nothing.
 *
 * It only ever reads. Asking twice about the same moment costs nothing and gives the
 * same answer, which is what lets a test hold the world still and interrogate it.
 */
export function escapeDirection(world) {
  const threats = total();
  dodgeShots(world, threats);
  dodgeCrowd(world, threats);
  const pressure = Math.hypot(threats.x, threats.y);

  const walls = total();
  awayFromTheWalls(world, walls);

  const want = {
    x: threats.x + walls.x,
    y: threats.y + walls.y,
  };
  const length = Math.hypot(want.x, want.y);
  if (length < 1e-9) return { x: 0, y: 0, pressure };
  return { x: want.x / length, y: want.y / length, pressure };
}
