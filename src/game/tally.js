// What the run is made of, counted while it happens.
//
// A balance table wants to say things like "a tank takes four seconds of steady fire
// to bring down" and "two thirds of the hull this run lost went to drifters", and
// none of that can be recovered afterwards: a body that died is out of the crowd and
// the only trace of it is the score it paid. So the run keeps the count itself,
// beside the score, and `tools/balance-report.js` reads it back out.
//
// Three rules, all of them tested in `test/tally.test.mjs`:
//
//   **A mirror, never a cause.** Nothing in the game reads the tally to decide
//   anything, and counting spends no number out of the logic stream, so no run can
//   be different because this file exists. The reference run is the same run byte for
//   byte with the tally in it or not.
//
//   **Facts, not opinions.** Every number here is something that happened - a body
//   arrived, a hit landed, a body stopped - and whether that is good balance is a
//   question for the report, next to the tables, where it can be argued.
//
//   **Bounded.** Lives and times under fire are counted into fixed histograms
//   (BALANCE.tally), never into a list that grows with the run, so a thirty minute
//   run costs exactly what a thirty second one does.
//
// An arrival is only counted when the *world* puts a body in play - the wave
// director, or a tank's hatchlings. A body a test or the title-screen crowd builds
// directly is not an arrival, which is what keeps the attract screen out of the
// numbers and lets a test plant a body without confusing the tally.

import { BALANCE } from './balance.js';
import { shotsPerSecond } from './weapons.js';

/** The four ways the ship can lose a hull. */
const BODY = 'body';
const SHOT = 'shot';
const BLAST = 'blast';
const BEAM = 'beam';

/** A blast has no attacker to flash and no kind to blame, so it is always the same. */
const THE_BLAST = { how: BLAST, type: '', enemy: null };

/**
 * What hurt the ship, as the places that hurt it can describe it. `enemy` is
 * only there for a body, because that is the one thing `hitPlayer` can flash; `type`
 * is whose it was, and `''` when nothing knows (a blast, or a shot nobody claims).
 */
export function hurtByBody(enemy) {
  return { how: BODY, type: enemy.type, enemy: enemy };
}

export function hurtByShot(shot) {
  return { how: SHOT, type: shot.from, enemy: null };
}

export function hurtByBlast() {
  return THE_BLAST;
}

/**
 * A beam names its kind rather than carrying one: by the time the light reaches
 * anything the eye that fired it may be a wreck (game/beams.js), and the run is
 * entitled to know what put the hole in it.
 */
export function hurtByBeam(type) {
  return { how: BEAM, type: type || '', enemy: null };
}

/** How a hull loss is written down: `body:tank`, `shot:spitter`, `beam:sniper`, `blast`. */
export function hurtLabel(cause) {
  return cause.type ? cause.how + ':' + cause.type : cause.how;
}

/** A fresh histogram: every step empty, up to the cap the spec gives. */
function histogram(spec) {
  const steps = [];
  for (let i = 0; i < spec.buckets; i++) steps.push(0);
  return steps;
}

/**
 * Which step of a histogram `seconds` falls in. Longer than the whole histogram
 * lands in the last step and stays there: a runaway number has to be visible in the
 * table, not vanish off the end of it.
 */
function stepOf(spec, seconds) {
  const at = Math.floor(seconds / spec.bucket);
  return at < spec.buckets ? at : spec.buckets - 1;
}

/** One kind's row. A row is built the first time that kind turns up in the run. */
function newRow() {
  return {
    arrived: 0,        // bodies of this kind the world put in play
    eliteArrived: 0,   // ... of which gold
    killed: 0,         // ... and the ones the player brought down
    eliteKilled: 0,
    lost: 0,           // came apart some other way, so they count in no time table
    firstAt: -1,       // the run's clock when the first one was seen; -1 = never
    hits: 0,           // how many times something landed on this kind, alive or not
    damage: 0,         // how much hull that took off it
    hullOfKilled: 0,   // the hull of everything the player killed, for a mean
    shotsOnKilled: 0,  // ... and how many shots each of those took before it came down
    lifeSamples: 0,    // how many killed bodies the whole life of was watched
    lifeSum: 0,
    lifeMin: Infinity,
    lifeMax: 0,
    lifeHist: histogram(BALANCE.tally.life),       // arrival -> death
    fireSamples: 0,    // ... and how many of them were ever shot at
    fireSum: 0,
    fireMin: Infinity,
    fireMax: 0,
    fireHist: histogram(BALANCE.tally.fire),       // being fired at -> death
  };
}

/** The whole tally for one run. `resetRun` builds a new one for every run. */
export function newTally() {
  return {
    arrived: 0,
    killed: 0,
    lost: 0,
    eliteArrived: 0,
    eliteKilled: 0,
    hullLost: 0,
    hurtBy: {},        // 'body:tank' -> how many hulls that cost
    killedBy: '',      // what took the last hull, so: why the run ended
    kinds: {},         // kind name -> the row above
  };
}

function rowOf(tally, type) {
  let row = tally.kinds[type];
  if (row === undefined) {
    row = newRow();
    tally.kinds[type] = row;
  }
  return row;
}

/** The world put one more body in play. */
export function noteArrival(world, enemy) {
  const tally = world.tally;
  const row = rowOf(tally, enemy.type);
  tally.arrived++;
  row.arrived++;
  if (row.firstAt < 0) row.firstAt = world.elapsed;
  if (enemy.elite) {
    tally.eliteArrived++;
    row.eliteArrived++;
  }
  // The tally stamps the body with what only a witness would know, so that when it
  // stops the death can be measured against them. See `makeEnemy` in game/kinds.js.
  enemy.born = world.elapsed;
}

/** Something landed on this body. `amount` is the hull it cost, whoever did it. */
export function noteHit(world, enemy, amount) {
  const row = rowOf(world.tally, enemy.type);
  row.hits++;
  row.damage += amount;
  enemy.hits++;

  // The body's `fired` is how long it has spent being fired at, and a hit only adds
  // to it when the gap since the last one is shorter than a few pulls of the ship's own
  // trigger: that is what "still shooting at it" means whatever the gun is
  // (BALANCE.tally.volley). A body clipped once in passing has spent no time under fire
  // at all, which is the honest answer.
  const now = world.elapsed;
  const gap = BALANCE.tally.volley / shotsPerSecond(world);
  if (enemy.firstHit < 0) enemy.firstHit = now;
  else if (now - enemy.lastHit <= gap) enemy.fired += now - enemy.lastHit;
  enemy.lastHit = now;
}

/**
 * One body stopped. `byPlayer` says whether to write it down as a kill, and only a
 * kill is timed: a body that came apart in a blast nobody lit has no business in a
 * time-to-kill table.
 */
export function noteDeath(world, enemy, byPlayer) {
  const tally = world.tally;
  const row = rowOf(tally, enemy.type);

  if (!byPlayer) {
    tally.lost++;
    row.lost++;
    return;
  }

  tally.killed++;
  row.killed++;
  row.hullOfKilled += enemy.maxhp;
  row.shotsOnKilled += enemy.hits;
  if (enemy.elite) {
    tally.eliteKilled++;
    row.eliteKilled++;
  }

  const spec = BALANCE.tally;
  if (enemy.born >= 0) {
    const age = world.elapsed - enemy.born;
    row.lifeSamples++;
    row.lifeSum += age;
    row.lifeHist[stepOf(spec.life, age)]++;
    if (age < row.lifeMin) row.lifeMin = age;
    if (age > row.lifeMax) row.lifeMax = age;
  }

  // A body that was never shot at has spent no time under fire, and is not counted:
  // the mean would be pulled down by kills it did not earn.
  if (enemy.firstHit >= 0) {
    const underFire = enemy.fired;
    row.fireSamples++;
    row.fireSum += underFire;
    row.fireHist[stepOf(spec.fire, underFire)]++;
    if (underFire < row.fireMin) row.fireMin = underFire;
    if (underFire > row.fireMax) row.fireMax = underFire;
  }
}

/**
 * The ship lost a hull. The last of these is what the run died of, which is the one
 * number in here the game-over screen will want as well (PLAN section 4).
 */
export function noteHullLoss(world, cause) {
  const tally = world.tally;
  const label = hurtLabel(cause);
  tally.hullLost++;
  tally.hurtBy[label] = (tally.hurtBy[label] || 0) + 1;
  if (world.player.hull <= 0) tally.killedBy = label;
}
