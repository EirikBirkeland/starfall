// Does a run take everything it learned with it when it ends?
//
// `resetRun` (game/run.js) is a long list of "and the last run's X goes back to nothing", and every
// entry on it is there because a run that inherited something was a bug somebody chased. It is also
// the kind of list a new system gets forgotten by: the state is built in `createWorld`, reset in the
// system's own `resetX`, and nothing but a human reading both sides will notice when one of the two
// halves is missed.
//
// This is that reading, done by a machine. Take the world's own shape - every field, every list's
// length, every pool's live count, in one flat table of paths and primitives - and compare the table
// of a world that has flown and been reset against the table of a world that was only ever reset.
// Anything left different is state that outlived its run, except for the list below, which is the
// state that is *supposed* to outlive one.
//
// It is a snapshot of the world's own fields and nothing else: no canvas, no save file, no clock.
// Pools are counted by what is alive in them and not by what they have built, because a warm pool is
// the whole point of a pool (src/core/pool.js) and a run that built more objects is not a run that
// kept more things.

/**
 * The state a run does not own, so `resetRun` leaves it alone on purpose.
 *
 * Each one is a decision and not an oversight; the why is written next to it because a diff that is
 * explained in a table is a diff somebody will re-check, and one explained in prose three files away
 * is not.
 */
export const OUTLIVES_A_RUN = [
  { path: 'seed', why: 'the visit draws it (src/main.js) and startRun reseeds the logic stream from it' },
  { path: 'time', why: 'the session clock the eye animates on (game/world.js), not the run clock' },
  { path: 'state', why: 'which screen the player is on; startRun writes it and endRun writes its ending' },
  { path: 'best', why: 'the save\'s best score (core/save.js)' },
  { path: 'dust', why: 'the purse between runs (game/stardust.js)' },
  { path: 'awards', why: 'what the save has won (game/awards.js)' },
  { path: 'found', why: 'what the codex has met (game/codex.js)' },
  { path: 'pastRuns', why: 'the log of runs that ended (game/history.js)' },
];

/** Is this a body? A held body is a fact about a crowd, so it is a leaf and not a subtree to walk. */
function isBody(value) {
  return value !== null && typeof value === 'object' && value.hp !== undefined && value.kind !== undefined;
}

function walk(value, path, depth, out) {
  if (value === null || typeof value !== 'object') {
    out[path] = value;
    return;
  }
  const name = value.constructor === undefined ? 'Object' : value.constructor.name;
  if (name === 'Pool') {
    out[path + '.live'] = value.items.length;
    return;
  }
  if (value instanceof Map || value instanceof Set) {
    out[path + '.size'] = value.size;
    return;
  }
  if (isBody(value)) {
    out[path] = 'a body';
    return;
  }
  if (Array.isArray(value)) {
    out[path + '.length'] = value.length;
    if (depth > 0) {
      for (let i = 0; i < Math.min(value.length, 2); i++) walk(value[i], path + '[' + i + ']', depth - 1, out);
    }
    return;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    out[path] = name;                       // a Grid, a gradient: a thing with internals of its own
    return;
  }
  if (depth <= 0) {
    out[path] = 'object';
    return;
  }
  for (const key of Object.keys(value)) walk(value[key], path === '' ? key : path + '.' + key, depth - 1, out);
}

/**
 * The world as a flat table of `path -> primitive`.
 *
 * Lists are walked two deep at most: enough to see that the arena is holding a body it should have
 * dropped, not enough to walk the balance tables a body points at.
 */
export function snapshotWorld(world) {
  const out = {};
  walk(world, '', 4, out);
  return out;
}

/** Does `path` lie under one of the names that is allowed to outlive a run? */
function skipped(path, skip) {
  for (const name of skip) {
    if (path === name) return true;
    if (path.startsWith(name + '.') || path.startsWith(name + '[')) return true;
  }
  return false;
}

/**
 * What is different between two snapshots, minus the paths in `skip`.
 *
 * A skipped name covers everything under it, so `awards` skips `awards.length` and `awards[0]` too -
 * which is what makes the table above a list of eight decisions rather than a list of every field name
 * under each of them.
 *
 * Answers `[{ path, was, now }]`, sorted by path, so a failure reads as a list of leaks and not as a
 * diff of a thousand lines.
 */
export function diffSnapshots(before, after, skip) {
  const out = [];
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const path of [...paths].sort()) {
    if (skipped(path, skip)) continue;
    if (before[path] === after[path]) continue;
    out.push({ path, was: before[path], now: after[path] });
  }
  return out;
}

/** The paths of everything on `OUTLIVES_A_RUN`, which is what `diffSnapshots` wants. */
export function skippedByDesign() {
  return OUTLIVES_A_RUN.map((row) => row.path);
}
