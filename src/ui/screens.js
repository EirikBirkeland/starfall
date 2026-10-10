// The DOM screens: the title (with the ship to fly), the game-over card and the win card. The
// level-up choice is not here - it is painted on the canvas (render/cards.js), because its cards
// are drawn, not typed. Everything the run shows while it is being played is on the canvas too.

import { SHIPS } from '../game/ships.js';
import { BALANCE } from '../game/balance.js';
import { uiTick } from '../audio/sfx.js';

let el = null;

/** The title's ship rows, in the order they were built, so one can be lit up. */
let shipRows = [];

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

/** One line of the ship list: the key, the ship and the gun it brings, and what it is for. */
function buildShipRow(ship, index) {
  const row = document.createElement('div');
  row.classList.add('ship');

  const key = document.createElement('span');
  key.classList.add('key');
  key.textContent = String(index + 1);

  const what = document.createElement('span');
  // Both names come off the balance sheet, so the title cannot offer a ship under one name
  // and fly it under another (game/ships.js is what prints the ship on the card at the end,
  // and game/weapons.js the gun in play). The gun is named because it comes with the ship:
  // one key, one line, and nothing to cross-check between the two lists.
  what.textContent = BALANCE.ships[ship.id].name + ' \u00b7 '
    + BALANCE.weapons[BALANCE.ships[ship.id].weapon].name + ' - ' + ship.blurb;

  row.appendChild(key);
  row.appendChild(what);
  el.shipRow.appendChild(row);
  return row;
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
  };
  shipRows = SHIPS.map(buildShipRow);
}

/** Light up the ship this world flies, so the pick is on the screen and not in the head. */
export function showShip(id) {
  for (let i = 0; i < shipRows.length; i++) {
    shipRows[i].classList.toggle('picked', SHIPS[i].id === id);
  }
}

export function hideScreens() {
  el.start.classList.add('hidden');
  el.over.classList.add('hidden');
  el.win.classList.add('hidden');
}

/**
 * One fight buried or several, in the words both cards use. A boss is the one kill worth its own
 * word on a card: it is the mark a run is built around (PLAN 3.4).
 */
function bossWords(count) {
  return count + ' BOSS' + (count > 1 ? 'ES' : '');
}

/**
 * summary: { score, best, newBest, level, kills, shards, bosses, seconds, seed, ship, weapon,
 * build, endlessPast } - `endlessPast` being how much of the run was flown after it had already
 * been won, 0 for every run that never got that far.
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
  el.build.textContent = summary.ship + ' \u00b7 ' + summary.weapon
    + '   \u00b7   BUILT FROM   \u00b7   ' + summary.build;
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
  el.winBuild.textContent = summary.ship + ' \u00b7 ' + summary.weapon
    + '   \u00b7   BUILT FROM   \u00b7   ' + summary.build;
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
