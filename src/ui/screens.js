// The two DOM screens: the title and the game-over card. Everything else is on
// the canvas.

let el = null;

export function initScreens() {
  el = {
    start: document.getElementById('startScreen'),
    over: document.getElementById('overScreen'),
    finalScore: document.getElementById('finalScore'),
    finalBest: document.getElementById('finalBest'),
    newBest: document.getElementById('newBest'),
    stats: document.getElementById('finalStats'),
  };
}

export function hideScreens() {
  el.start.classList.add('hidden');
  el.over.classList.add('hidden');
}

/** summary: { score, best, newBest, level, kills, shards, seconds, seed } */
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
  el.over.classList.remove('hidden');
}
