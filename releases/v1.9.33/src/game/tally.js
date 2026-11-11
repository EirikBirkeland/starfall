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
import { hostName } from './codex.js';

/** The five ways the ship can lose a hull. */
const BODY = 'body';
const SHOT = 'shot';
const BLAST = 'blast';
const BEAM = 'beam';
const ARM = 'arm';

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

/**
 * A blade names the fight that loosed it, for the same reason a beam names its kind: by the time a
 * sweep has come round the body that made it may be a wreck (game/arms.js), and the run is entitled
 * to know whose arm it walked into.
 */
export function hurtByArm(type) {
  return { how: ARM, type: type || '', enemy: null };
}

/** How a hull loss is written down: `body:tank`, `shot:spitter`, `beam:sniper`, `arm:eclipse`, `blast`. */
export function hurtLabel(cause) {
  return cause.type ? cause.how + ':' + cause.type : cause.how;
}

/** A name with whatever belongs in front of it: `A TANK`, `AN ORBIT`, `THE ECLIPSE`. */
function named(name) {
  if (/^(A|AN|THE)\b/.test(name)) return name;
  return (/^[AEIOUY]/.test(name) ? 'AN ' : 'A ') + name;
}

/** The same name owning something: `A SPITTER'S SHOT`, `THE ECLIPSE'S BLADE`. */
function owning(name) {
  return named(name) + (name.slice(-1) === 'S' ? "'" : "'S");
}

/**
 * What each way is called when there is nobody left to name whose it was - a shot that came from a
 * body nobody claims (game/enemyshots.js leaves `from` empty), and a blast, which has never had an
 * owner to blame. `body` and the last line are the two that cannot happen: a body always knows what
 * kind it is, and a sweep always remembers whose arm threw it. They are here so that a label this
 * build has never seen is said in plain words instead of a blank line on the card.
 */
const UNCLAIMED = { shot: 'A SHOT', beam: 'A BEAM', arm: 'A BLADE', blast: 'A BLAST', body: 'THE CROWD' };

/**
 * What a hull loss is called on the card a run ends on - PLAN section 4's "what killed the player",
 * which nothing in the game said out loud until now.
 *
 * The labels are this file's own (see `hurtLabel`), and so is the reading of them back: the tally's
 * rule is facts and not opinions, and what took a hull is a fact about the run. Splitting the words
 * into the interface would leave a second file guessing what `beam:sniper` meant, which is how two
 * descriptions of one thing start to disagree. A body is itself; a shot, a beam and a blade belong to
 * whoever loosed them, because by the time any of them lands the thing that fired it may be a wreck
 * (game/beams.js, game/arms.js). A blast has no owner to name. And an empty label is a run given up
 * with hull still on it (game/run.js `abandonRun`) - an ending worth naming as honestly as any other.
 *
 * Bodies and fights are named out of the codex's own table (game/codex.js `hostName`), so the card
 * and the codex cannot call the same body two different things. A way of dying this build has never
 * heard of is named by *what* it was rather than by *how*, so a label from a newer release still
 * reads as a sentence.
 */
export function causeWords(label) {
  if (label === '') return UNCLAIMED.body;
  const at = label.indexOf(':');
  const how = at < 0 ? label : label.slice(0, at);
  const type = at < 0 ? '' : label.slice(at + 1);
  if (type === '') return UNCLAIMED[how] === undefined ? UNCLAIMED.body : UNCLAIMED[how];

  const name = hostName(type);
  if (how === SHOT) return owning(name) + ' SHOT';
  if (how === BEAM) return owning(name) + ' BEAM';
  if (how === ARM) return owning(name) + ' BLADE';
  return named(name);        // a body, and any way this build has not met
}

/**
 * The card's own line about how the run ended: what took the last hull, or the giving-up said.
 *
 * The headline gets a verb and the rack under it does not - `A TANK` on its own is a row about a
 * thing that cost a hull, where `TAKEN BY A TANK` is the answer to the question the card is asked.
 * A run given up has no cause at all (game/run.js `abandonRun` leaves the tally's empty), and that
 * is said as plainly as any of them instead of leaving the line blank.
 */
export function endingWords(label) {
  if (label === '') return 'RUN GIVEN UP';
  return 'TAKEN BY ' + causeWords(label);
}

/** How a number of hulls is written on a row: `ONE HULL`, `THREE HULLS`, `TWELVE HULLS`. */
const HULL_WORDS = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE',
  'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];

function hullWords(count) {
  // Past the word table a digit is honest - and a hull count that high is not a number anybody reads
  // as prose anyway. One hull is `ONE HULL` and two are `TWO HULLS`: the row counts hulls.
  const howMany = HULL_WORDS[count] === undefined ? String(count) : HULL_WORDS[count];
  return count === 1 ? 'ONE HULL' : howMany + ' HULLS';
}

/**
 * What every hull of the run went to, the costliest thing first, in the rows the card prints.
 *
 * This is a reading of the tally's own `hurtBy` map and not a second count - the same causes
 * `tools/balance-report.js` builds its tables from, said to the player instead of to the report.
 *
 * `lastHullIsSaid` is which card is asking, and it is the only interesting thing about this list. A
 * wreck whose headline named the thing that took the last hull has nothing left for a rack to say
 * about a run that lost one hull, so the rack says nothing; a win has no such headline - nothing took
 * it down - so even the run that came through untouched but for one hull has a fact worth printing,
 * and so does a give-up, whose headline names the giving-up and not a body (game/run.js
 * `abandonRun`). The caller knows which of those it is (ui/screens.js).
 *
 * The order is a telling and not a chronology: the tally counts hulls and deliberately does not
 * remember when each went (see the bounded-histogram rule at the top of this file), and the order of
 * the map's own keys is the order the causes first turned up, which a stable sort leaves alone.
 */
export function hullLedger(hurtBy, lastHullIsSaid) {
  const labels = Object.keys(hurtBy);
  let lost = 0;
  for (const label of labels) lost += hurtBy[label];
  if (lost < (lastHullIsSaid ? 2 : 1)) return [];

  return labels
    .slice()
    .sort((a, b) => hurtBy[b] - hurtBy[a])
    .map((label) => ({ name: causeWords(label), says: 'TOOK ' + hullWords(hurtBy[label]) }));
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
    // How many dashes this run was *granted* (game/player.js `beginDash`). A run that never
    // pressed the key and a run that pressed it forty times are two different runs, and the one
    // trace either leaves afterwards is this count (game/awards.js).
    dashes: 0,
    // Did this run finish, or did it only stop? A run that outlasted the whole schedule is the
    // only kind that was *won* (game/run.js `winRun`), and a report that cannot tell the two
    // apart cannot tell a hard run from a long one.
    won: false,
    wonAt: -1,         // the run's clock when it was won; -1 when it never was
    // Did the won run then keep flying? Endless is what a win is on the way to (PLAN 3.4), and a
    // report that cannot tell the two apart cannot say whether a fifteen-minute run was beaten or
    // was finished and then went on for another ten minutes on top of that.
    endless: false,  // set when the arena was handed back to a run that had already won
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

/**
 * The run was granted a dash - a granted one and not an asked-for one, because a press during the
 * wait is not a dash and "without a single dash" is a claim about dashes and not about fingers.
 */
export function noteDash(world) {
  world.tally.dashes++;
}

/**
 * The run outlasted every fight it was scheduled. Nothing reads this back - it is a fact about
 * how the run ended, written next to the facts about what it was made of (game/tally.js).
 */
export function noteVictory(world) {
  world.tally.won = true;
  world.tally.wonAt = world.elapsed;
}

/**
 * The won run was handed its arena back and flew on (game/run.js `continueRun`). A mirror again:
 * the fact that the run is endless is held by the world (`world.endless`), which is what the frame
 * and the interface read; this is the same fact written down for whoever reads the sheet after.
 */
export function noteEndless(world) {
  world.tally.endless = true;
}
