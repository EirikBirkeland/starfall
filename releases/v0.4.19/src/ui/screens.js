// The DOM screens: the title (with the primary to fly) and the game-over card. The
// level-up choice is not here - it is painted on the canvas (render/cards.js), because
// its cards are drawn, not typed. Everything the run shows while it is being played is
// on the canvas too.

import { WEAPONS } from '../game/weapons.js';
import { BALANCE } from '../game/balance.js';

let el = null;

/** The title's weapon rows, in the order they were built, so one can be lit up. */
let weaponRows = [];

/** One line of the weapon list: the key, the name, and what it is for. */
function buildWeaponRow(weapon, index) {
  const row = document.createElement('div');
  row.classList.add('weapon');

  const key = document.createElement('span');
  key.classList.add('key');
  key.textContent = String(index + 1);

  const what = document.createElement('span');
  // The name is the balance row's, so the title cannot offer a gun under one name and
  // fly it under another (game/weapons.js is what prints the gun in play and on the card).
  what.textContent = BALANCE.weapons[weapon.id].name + ' - ' + weapon.blurb;

  row.appendChild(key);
  row.appendChild(what);
  el.weaponRow.appendChild(row);
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
    weaponRow: document.getElementById('weaponRow'),
  };
  weaponRows = WEAPONS.map(buildWeaponRow);
}

/** Light up the primary this world flies, so the pick is on the screen and not in the head. */
export function showWeapon(id) {
  for (let i = 0; i < weaponRows.length; i++) {
    const picked = WEAPONS[i].id === id;
    weaponRows[i].classList.toggle('picked', picked);
  }
}

export function hideScreens() {
  el.start.classList.add('hidden');
  el.over.classList.add('hidden');
}

/** summary: { score, best, newBest, level, kills, shards, seconds, seed, weapon, build } */
export function showGameOver(summary) {
  el.finalScore.textContent = summary.score.toLocaleString('en-US');
  el.finalBest.textContent = summary.best.toLocaleString('en-US');
  el.stats.textContent = 'LEVEL ' + summary.level
    + '   \u00b7   ' + summary.kills + ' KILLS'
    + '   \u00b7   ' + summary.shards + ' SHARDS'
    + '   \u00b7   ' + summary.seconds + 's'
    + '   \u00b7   SEED ' + summary.seed;
  if (summary.newBest) el.newBest.classList.remove('hidden');
  else el.newBest.classList.add('hidden');
  el.build.textContent = summary.weapon + '   \u00b7   BUILT FROM   \u00b7   ' + summary.build;
  el.over.classList.remove('hidden');
}
