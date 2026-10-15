// One number in `BALANCE`, moved by hand, measured, and put back.
//
// Three tools need this and a fourth will: `tools/line-ab.js` prices an upgrade line at a different
// depth, `tools/gun-tune.js` prices one field of a primary's row, and `tools/difficulty-arc.js` asks
// what the crowd's own budget would do to the arc. They all ask the same three questions - is that
// field there, is it a number, and what was it before you changed it - and a tool that answers the
// third one badly is the interesting case, because the row it patched is a live module that the next
// condition, and then the whole rest of the process, goes on reading.
//
// Which is what this file is for. A patch remembers the value it covered, and putting a patch back
// touches that one leaf and nothing else. The alternative - copying a whole row and restoring the
// copy - is a footgun that has already gone off once (NOTES, session 134: `Object.assign({}, list)`
// turns a weapon's `cannotSpend` into `{0: 'pierce', ...}`, which has no `indexOf`, and a lance run
// died three minutes into a batch over it). Nothing here copies a row, so nothing here can do that.
//
// A path is dotted and may go through arrays: `fireRate`, `muzzle.count`, `gap.0`. Depth is not
// capped, because the tables are shallow and a path language that refuses `gap.0` would just push
// the next tool towards writing its own.

/**
 * What is at `path` under `root`, or `undefined` when there is nothing there.
 *
 * A step that is not an object (or that has no such key) is not an error: the caller's job is to say
 * what the caller's table does have, in its own words, and it cannot do that until it knows the path
 * missed.
 */
export function fieldAt(root, path) {
  const parts = String(path).split('.');
  let at = root;
  for (const part of parts) {
    if (at === null || typeof at !== 'object' || !(part in at)) return undefined;
    at = at[part];
  }
  return at;
}

/** Every number under `root`, spelled the way a path wants it: `damage`, `muzzle.count`, `gap.0`. */
export function numberFields(root, prefix, out) {
  const at = prefix === undefined ? '' : prefix;
  const list = out === undefined ? [] : out;
  for (const key of Object.keys(root)) {
    const value = root[key];
    const path = at === '' ? key : at + '.' + key;
    if (typeof value === 'number') list.push(path);
    else if (value !== null && typeof value === 'object') numberFields(value, path, list);
  }
  return list;
}

/**
 * Read one `path=value` and check it against the table before anything is played.
 *
 * Two mistakes are worth refusing rather than measuring: a field that is not there (a misspelling is
 * silently a *new* field, so the patch does nothing and the table prints a number as though it had),
 * and a field that is there but is not a number (`name`, `sound.wave`, a list of line ids - each of
 * them would put a string into a multiplication somewhere else, several minutes later).
 *
 * Throws with the path it wanted and the value it found; the caller wraps that in its own sentence,
 * because each tool knows which table it is holding and the person typing does not.
 */
export function parseNumberPatch(assignment, root, name) {
  const who = name === undefined ? 'the table' : name;
  const parts = String(assignment).split('=');
  const path = parts[0];
  const value = Number(parts[1]);
  if (parts.length !== 2 || path === '' || parts[1] === '' || !Number.isFinite(value)) {
    throw new Error('--set wants <path>=<number>, for example fireRate=2.6: ' + assignment);
  }
  const was = fieldAt(root, path);
  if (was === undefined) {
    throw new Error(who + ' has no number called ' + path + '; it has '
      + numberFields(root).join(', '));
  }
  if (typeof was !== 'number') {
    throw new Error(who + ' has ' + path + ', and it is not a number: ' + JSON.stringify(was));
  }
  return { path, value, was };
}

/** Write each patch into `root`. Answers the one function that puts them all back. */
export function applyPatches(patches, root) {
  for (const patch of patches) setField(root, patch.path, patch.value);
  return () => {
    for (const patch of patches) setField(root, patch.path, patch.was);
  };
}

function setField(root, path, value) {
  const parts = String(path).split('.');
  let at = root;
  for (let i = 0; i < parts.length - 1; i++) at = at[parts[i]];
  at[parts[parts.length - 1]] = value;
}

/** What a batch of patches is called in a header: `with gap.0 0.6, gap.1 0.9`. */
export function patchWords(patches) {
  if (patches.length === 0) return '';
  return ', with ' + patches.map((patch) => patch.path + ' ' + patch.value).join(', ');
}
