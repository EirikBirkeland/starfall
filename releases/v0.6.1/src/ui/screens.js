// The DOM screens: the title (with the ship to fly) and the game-over card. The level-up
// choice is not here - it is painted on the canvas (render/cards.js), because its cards are
// drawn, not typed. Everything the run shows while it is being played is on the canvas too.

import { SHIPS } from '../game/ships.js';
import { BALANCE } from '../game/balance.js';

let el = null;

/** The title's ship rows, in the order they were built, so one can be lit up. */
let shipRows = [];

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
    finalScore: document.getElementById('finalScore'),
    finalBest: document.getElementById('finalBest'),
    newBest: document.getElementById('newBest'),
    stats: document.getElementById('finalStats'),
    build: document.getElementById('finalBuild'),
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
}

/** summary: { score, best, newBest, level, kills, shards, bosses, seconds, seed, ship, weapon, build } */
export function showGameOver(summary) {
  el.finalScore.textContent = summary.score.toLocaleString('en-US');
  el.finalBest.textContent = summary.best.toLocaleString('en-US');
  el.stats.textContent = 'LEVEL ' + summary.level
    + '   \u00b7   ' + summary.kills + ' KILLS'
    + '   \u00b7   ' + summary.shards + ' SHARDS'
    // A boss is the one kill worth its own word on the card: it is the mark a run is built
    // around (PLAN 3.4), and it only shows up at all when the run got that far.
    + (summary.bosses > 0 ? '   \u00b7   ' + summary.bosses + ' BOSS' + (summary.bosses > 1 ? 'ES' : '') : '')
    + '   \u00b7   ' + summary.seconds + 's'
    + '   \u00b7   SEED ' + summary.seed;
  if (summary.newBest) el.newBest.classList.remove('hidden');
  else el.newBest.classList.add('hidden');
  el.build.textContent = summary.ship + ' \u00b7 ' + summary.weapon
    + '   \u00b7   BUILT FROM   \u00b7   ' + summary.build;
  el.over.classList.remove('hidden');
}
