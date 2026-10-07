// The best score, kept in localStorage. Milestone 8 turns this into a single
// versioned save document; until then this is the only thing we remember.

const BEST_KEY = 'starfall.best';

export function loadBest() {
  try {
    return parseInt(window.localStorage.getItem(BEST_KEY) || '0', 10) || 0;
  } catch (err) {
    return 0;
  }
}

export function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch (err) {
    // Private browsing or a full quota: the run simply is not remembered.
  }
}
