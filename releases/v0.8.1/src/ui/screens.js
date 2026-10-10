// The DOM screens: the title, the hangar a run is chosen in, the game-over card and the win card.
// The level-up choice is not here - it is painted on the canvas (render/cards.js), because its
// cards are drawn, not typed. Everything the run shows while it is being played is on the canvas too.
//
// The hangar is an overlay and not a state of the world: it is put up over the title and over the
// death's card, the attract crowd keeps flying behind it, and the run it launches is launched the
// same way from either. A sixth STATE would have to be answered by everything that asks what the
// world is doing, to buy a screen that only ever sits on top of two of them.

import { SHIPS } from '../game/ships.js';
import { BALANCE } from '../game/balance.js';
import { lineOf } from '../game/upgrades.js';
import { uiTick } from '../audio/sfx.js';

let el = null;

/** The hangar's rack, in the order it was built, so one row can be lit up. */
let shipRows = [];

// Whether the hangar is up right now. `hideScreens` clears it with the screens themselves, so
// there is no path where a run is flying and this still says open.
let hangarUp = false;

/**
 * The run's clock the way a card reads it: `47s` inside a minute and `15m02s` past one. The win
 * is always past the first minute - the last fight on the schedule is not due until the fifteenth
 * - and a run that went that far deserves better than "902s". The death card reads it the same
 * way, because it is the same number and there is only one place in the game it is written.
 */
function clockWords(seconds) {
  const whole = Math.floor(seconds);
  if (whole < 60) return whole + 's';
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return minutes + 'm' + (rest < 10 ? '0' : '') + rest + 's';
}

/**
 * The fights the schedule sent, in the order it sent them (game/bosses.js). The win card names
 * every one of them, and it reads them out of the schedule rather than carrying a list of its
 * own, so the card cannot advertise a fight the game does not actually field.
 */
function scheduleNames() {
  return BALANCE.bosses.schedule
    .map((entry) => BALANCE.bosses[entry.boss].name)
    .join(' \u00b7 ');
}

/**
 * The numbers that are the whole of the difference between one hull and the next
 * (game/ships.js): the pips, the engines, and how long the dash makes you wait. px/s and seconds,
 * which are the units the game itself runs on - the rack's whole job is letting two ships be
 * compared, and "FAST" beside "VERY FAST" cannot be.
 */
function shipNumbers(spec) {
  const parts = [
    spec.hull + ' HULL',
    Math.round(spec.maxSpeed) + ' SPEED',
    (Math.round(spec.dashCooldown * 10) / 10) + 's DASH',
  ];
  // And a ship that arrives with a rank of something already spent says so in the same list,
  // because that is a number of the body like the other three (game/ships.js `applyShip`
  // is what hands it out, and the rack must not advertise a thing a run does not start with).
  for (const line of Object.keys(spec.ranks)) {
    parts.push('BEGINS WITH ' + lineOf(line).name);
  }
  return parts.join('   \u00b7   ');
}

/** One line of the rack: the key, the ship and the gun it brings, what it is for, and its numbers. */
function buildShipRow(ship, index) {
  const row = document.createElement('div');
  row.classList.add('ship');

  const key = document.createElement('span');
  key.classList.add('key');
  key.textContent = String(index + 1);

  const what = document.createElement('span');
  // Both names come off the balance sheet, so the hangar cannot offer a ship under one name
  // and fly it under another (game/ships.js is what prints the ship on the card at the end,
  // and game/weapons.js the gun in play). The gun is named because it comes with the ship:
  // one key, one line, and nothing to cross-check between the two lists.
  const spec = BALANCE.ships[ship.id];
  what.textContent = spec.name + ' \u00b7 ' + BALANCE.weapons[spec.weapon].name
    + ' \u2014 ' + ship.blurb;

  const numbers = document.createElement('span');
  numbers.classList.add('numbers');
  numbers.textContent = shipNumbers(spec);

  row.appendChild(key);
  row.appendChild(what);
  row.appendChild(numbers);
  el.shipRow.appendChild(row);
  return row;
}

/** The ship and the gun it brings, in the words every line that names a run about to be flown uses. */
function shipWords(id) {
  const spec = BALANCE.ships[id];
  return spec.name + ' \u00b7 ' + BALANCE.weapons[spec.weapon].name;
}

export function initScreens() {
  el = {
    start: document.getElementById('startScreen'),
    over: document.getElementById('overScreen'),
    win: document.getElementById('winScreen'),
    finalScore: document.getElementById('finalScore'),
    finalBest: document.getElementById('finalBest'),
    newBest: document.getElementById('newBest'),
    stats: document.getElementById('finalStats'),
    build: document.getElementById('finalBuild'),
    winScore: document.getElementById('winScore'),
    winBest: document.getElementById('winBest'),
    winNewBest: document.getElementById('winNewBest'),
    winCleared: document.getElementById('winCleared'),
    winStats: document.getElementById('winStats'),
    winBuild: document.getElementById('winBuild'),
    winHint: document.getElementById('winHint'),
    shipRow: document.getElementById('shipRow'),
    hangar: document.getElementById('hangarScreen'),
    hangarDust: document.getElementById('hangarDust'),
    titleBest: document.getElementById('titleBest'),
    titleDust: document.getElementById('titleDust'),
    titleShip: document.getElementById('titleShip'),
    nextShip: document.getElementById('nextShip'),
    finalDust: document.getElementById('finalDust'),
    winDust: document.getElementById('winDust'),
  };
  shipRows = SHIPS.map(buildShipRow);
}

/** Is the hangar up right now? main.js routes the number keys and the launch around the answer. */
export function hangarIsOpen() {
  return hangarUp;
}

/**
 * Every screen the game can put up, taken down for a run to be seen. The hangar goes with them:
 * it is a screen like the rest, and a run that is flying has no business being half over a panel.
 */
export function hideScreens() {
  el.start.classList.add('hidden');
  el.over.classList.add('hidden');
  el.win.classList.add('hidden');
  closeHangar();
}

/** Put the hangar up over whatever screen is already there. */
export function openHangar() {
  el.hangar.classList.remove('hidden');
  hangarUp = true;
}

/** Take it away again, leaving the screen underneath exactly as it was. */
export function closeHangar() {
  el.hangar.classList.add('hidden');
  hangarUp = false;
}
/**
 * Light the rack, and say on both screens that let you choose which ship the next run flies.
 * The title says FLYING, because the pick is about the run about to be launched; the death's card
 * says NEXT, because the ship it is describing has already been flown and the pick is about the
 * one after it. Without that second line a number pressed over a wreck would be a silent key -
 * and "press 2, press Space, fly the scatter" is how this has always been done.
 */
export function showShip(id) {
  for (let i = 0; i < shipRows.length; i++) {
    shipRows[i].classList.toggle('picked', SHIPS[i].id === id);
  }
  el.titleShip.textContent = 'FLYING  ' + shipWords(id);
  el.nextShip.textContent = 'NEXT  ' + shipWords(id) + '   \u00b7   H FOR THE HANGAR';
}

/**
 * What the visit has to show for itself, in both places it is read: the best score and the purse.
 * The purse is written beside the score rather than under it because the two are the same kind of
 * thing - the number you are trying to beat, and the number you are saving up.
 */
export function showStanding(best, dust) {
  el.titleBest.textContent = best.toLocaleString('en-US');
  el.titleDust.textContent = dust.toLocaleString('en-US');
  el.hangarDust.textContent = dust.toLocaleString('en-US');
}

/**
 * What a finished run paid: what it earned, and what the purse holds now. `earned` is the run's
 * whole worth and not what this ending added (game/stardust.js), so a run that was won, handed
 * back and then finally went down reads the bigger number twice - which is the truth about the
 * run, and not the win being counted twice.
 */
function showDust(where, earned, banked) {
  where.textContent = 'STARDUST  +' + earned.toLocaleString('en-US')
    + '   \u00b7   ' + banked.toLocaleString('en-US') + ' BANKED';
}

/**
 * One fight buried or several, in the words both cards use. A boss is the one kill worth its own
 * word on a card: it is the mark a run is built around (PLAN 3.4).
 */
function bossWords(count) {
  return count + ' BOSS' + (count > 1 ? 'ES' : '');
}

/**
 * summary: { score, best, newBest, level, kills, shards, bosses, seconds, seed, ship, shipId,
 * weapon, build, endlessPast, dust, dustBank } - `endlessPast` being how much of the run was
 * flown after it had already been won, 0 for every run that never got that far, and `dust` /
 * `dustBank` being what the run earned between runs and what the purse holds after it
 * (game/stardust.js).
 */
export function showGameOver(summary) {
  el.finalScore.textContent = summary.score.toLocaleString('en-US');
  el.finalBest.textContent = summary.best.toLocaleString('en-US');
  el.stats.textContent = 'LEVEL ' + summary.level
    + '   \u00b7   ' + summary.kills + ' KILLS'
    + '   \u00b7   ' + summary.shards + ' SHARDS'
    // A boss is the one kill worth its own word on the card: it is the mark a run is built
    // around (PLAN 3.4), and it only shows up at all when the run got that far.
    + (summary.bosses > 0 ? '   \u00b7   ' + bossWords(summary.bosses) : '')
    + '   \u00b7   ' + clockWords(summary.seconds)
    // A run that was handed its arena back after winning and then finally went down says which part
    // of it was the endless one: the clock above is the whole of the run, and this is the stretch
    // past the win the player stayed out there for (game/endless.js).
    + (summary.endlessPast > 0
      ? '   \u00b7   ' + BALANCE.endless.word + ' FOR ' + clockWords(summary.endlessPast) : '')
    + '   \u00b7   SEED ' + summary.seed;
  if (summary.newBest) el.newBest.classList.remove('hidden');
  else el.newBest.classList.add('hidden');
  showDust(el.finalDust, summary.dust, summary.dustBank);
  el.build.textContent = summary.ship + ' \u00b7 ' + summary.weapon
    + '   \u00b7   BUILT FROM   \u00b7   ' + summary.build;
  // The purse and the best moved with this run, so both are written again where they are also
  // read - and the rack is lit for the ship that just flew, because it is the ship the next run
  // flies unless a number says otherwise.
  showStanding(summary.best, summary.dustBank);
  showShip(summary.shipId);
  el.over.classList.remove('hidden');
  // The card itself makes the sound of landing (BALANCE.ui). The run stopped stepping before it
  // was written, so this is a screen's own event and the simulation has no idea it happened.
  uiTick('card');
}

/**
 * The win. Same card the death is, with the parts a win has and a death has not: the fights that
 * were gone through to get here, and a clock that says how long the whole of it took.
 *
 * `showGameOver` and this one share a shape on purpose - score, best, the line of numbers, the
 * build - because the two are the same statement about a run with one word changed in them.
 */
export function showVictory(summary) {
  el.winScore.textContent = summary.score.toLocaleString('en-US');
  el.winBest.textContent = summary.best.toLocaleString('en-US');
  el.winCleared.textContent = 'CLEARED   \u00b7   ' + scheduleNames();
  el.winStats.textContent = 'CLEARED IN ' + clockWords(summary.seconds)
    + '   \u00b7   LEVEL ' + summary.level
    + '   \u00b7   ' + summary.kills + ' KILLS'
    + '   \u00b7   ' + summary.shards + ' SHARDS'
    + '   \u00b7   ' + bossWords(summary.bosses)
    + '   \u00b7   SEED ' + summary.seed;
  if (summary.newBest) el.winNewBest.classList.remove('hidden');
  else el.winNewBest.classList.add('hidden');
  showDust(el.winDust, summary.dust, summary.dustBank);
  el.winBuild.textContent = summary.ship + ' \u00b7 ' + summary.weapon
    + '   \u00b7   BUILT FROM   \u00b7   ' + summary.build;
  showStanding(summary.best, summary.dustBank);
  showShip(summary.shipId);
  // The invitation waits. The card goes up on the hush and the game answers to nothing until the
  // guard is spent, and a line saying "press" that nothing may be pressed with is the exact thing
  // the guard was asked to stop (game/run.js `victoryCardIsAnswerable`).
  el.winHint.classList.add('hidden');
  el.win.classList.remove('hidden');
  uiTick('card');      // the same knock the death's card gets: it is the same event, landing
}

/**
 * Say what the card's keys do, now that they do it. Called once the win's guard is spent:
 * `main.js` asks `victoryCardIsAnswerable` and this only ever paints over a card that is up.
 */
export function revealWinHint() {
  el.winHint.classList.remove('hidden');
}
