// The pool contract, checked by a machine instead of trusted in prose.
//
// `src/core/pool.js` hands an object over exactly as it came out of the drawer: a recycled one still
// wears every field of its last life, and the only thing standing between that and a bug is that the
// spawner writes every field. The rule is written down in three files, and it has been held so far by
// attention: every flag a shot has ever grown - `pierce` and `bounce`, `charged`, `hunts` and `splash`,
// `turret` - had to be written by every spawner that throws one in the same moment it was invented, and
// NOTES records the trap being spotted each time as the field was new. Attention is not a check, so this
// is the check.
//
// How it witnesses: every `spawn()` of every pool found under the world is wrapped so that the object
// is filled with a sentinel in every field on its way out. A field still wearing the sentinel once the
// step is over was never written, and is reported as `<pool>.<field>`.
//
//   - a number becomes NaN, because every field a spawner may need to write is a number and NaN
//     survives arithmetic, so a forgotten `life` stays NaN however many times it is decremented;
//   - a string, a boolean, a null become a private symbol, which no honest value can be confused with;
//   - an array is emptied and given the symbol as its one element, so a `hits` list that was never
//     cleared is caught while the object keeps its shape and nothing downstream throws.
//
// The sentinel is a live value sitting in a running world, so two things are promised here: the caller
// must `sweep()` between steps (never let a poisoned object reach the renderer), and `stop()` repairs
// every object it ever touched back to its factory's own values, so an audit can never leave a symbol
// in the drawer for the next test to trip over.
//
// It also counts what each pool spawned while it was watching, which is how the test that uses it can
// say which lists were actually exercised instead of assuming they all were.

import { Pool } from '../../src/core/pool.js';

/** The one value no spawner writes. A symbol, so nothing can equal it by accident. */
const POISON = Symbol('unwritten field');

/** What a field looks like once it has been poisoned, out of what it was before. */
function poisonFor(value) {
  if (typeof value === 'number') return NaN;
  if (Array.isArray(value)) {
    value.length = 0;
    value.push(POISON);
    return value;
  }
  return POISON;
}

/** Is this field still wearing the sentinel? */
function unwritten(value) {
  if (value === POISON) return true;
  if (typeof value === 'number') return Number.isNaN(value);
  if (Array.isArray(value)) return value.length > 0 && value[0] === POISON;
  return false;
}

/** Poison every field of one object, in place. */
function poison(object) {
  for (const key of Object.keys(object)) object[key] = poisonFor(object[key]);
}

/** Is this object wearing the sentinel anywhere? */
function wearingPoison(object) {
  for (const key of Object.keys(object)) {
    if (unwritten(object[key])) return true;
  }
  return false;
}

/**
 * Every pool under `root`, with the path it was found at.
 *
 * A pool is a leaf: its own fields are walked and not descended into, because a pool's insides hold
 * plain objects and the audit is about the pools the game owns, not about the arrays inside them.
 */
function findPools(root) {
  const found = [];
  const seen = new Set();

  function walk(value, path, depth) {
    if (depth > 4 || value === null || typeof value !== 'object' || seen.has(value)) return;
    if (value instanceof Pool) {
      found.push({ path, pool: value });
      return;
    }
    // Arrays are walked (the world keeps lists of small objects), but only their plain-object members.
    if (Array.isArray(value)) {
      seen.add(value);
      for (let i = 0; i < value.length; i++) walk(value[i], path + '[' + i + ']', depth + 1);
      return;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return;   // a Grid, a Map, a class instance: not a path
    seen.add(value);
    for (const key of Object.keys(value)) walk(value[key], path === '' ? key : path + '.' + key, depth + 1);
  }

  walk(root, '', 0);
  return found;
}

/**
 * Watch every pool under `root` until `stop()`.
 *
 * Returns `{ pools, sweep, report, stop, summary }`:
 *
 *   `sweep()`  - look at everything spawned since the last sweep and record what was left unwritten.
 *                Call it once per step, before anything is drawn.
 *   `report()` - the list of findings so far, one entry per pool-and-field, each saying how many times
 *                it was seen: `{ pool, key, seen, example }`.
 *   `stop()`   - unwrap the pools and repair every object the audit touched.
 *   `summary()`- what each pool did while it was watched: `[{ path, live, built, builtNow, spawned }]`.
 */
export function startPoolAudit(root) {
  const entries = findPools(root);
  // Every object spawned since the last sweep, with the pool it came out of. A Map and not a Set so
  // that a life begun *and* ended inside one step is still answered about.
  const pending = new Map();
  const findings = new Map();
  let stopped = false;

  for (const entry of entries) {
    if (Object.prototype.hasOwnProperty.call(entry.pool, 'spawn')) {
      throw new Error('a pool audit is already watching ' + entry.path);
    }
    entry.builtBefore = entry.pool.made;
    entry.spawnedBefore = entry.pool.spawned;

    const original = Pool.prototype.spawn;
    entry.pool.spawn = function auditedSpawn() {
      const object = original.call(this);
      if (!stopped) {
        poison(object);
        pending.set(object, entry.path);
      }
      return object;
    };
  }

  /** Record one finding, or count it again if it is the same pool and field. */
  function note(path, key, object) {
    const id = path + '.' + key;
    const known = findings.get(id);
    if (known) {
      known.seen++;
      return;
    }
    findings.set(id, { pool: path, key, seen: 1, example: object });
  }

  return {
    pools: entries.map((entry) => entry.path),

    sweep() {
      for (const [object, path] of pending) {
        for (const key of Object.keys(object)) {
          if (unwritten(object[key])) note(path, key, object);
        }
      }
      pending.clear();
    },

    report() {
      return [...findings.values()];
    },

    summary() {
      return entries.map((entry) => ({
        path: entry.path,
        live: entry.pool.count,
        built: entry.pool.made,
        builtNow: entry.pool.made - entry.builtBefore,
        spawned: entry.pool.spawned - entry.spawnedBefore,
      }));
    },

    stop() {
      stopped = true;
      for (const entry of entries) {
        delete entry.pool.spawn;       // back to the prototype's own, and no double-unwrapping
        // Repair everything this audit touched: an object that goes back into the drawer with a
        // sentinel in it would be handed to a later test with the sentinel still in it.
        const fresh = entry.pool.make();
        const all = entry.pool.items.concat(entry.pool.free);
        for (const object of all) {
          if (!wearingPoison(object)) continue;
          for (const key of Object.keys(object)) {
            if (!unwritten(object[key])) continue;
            const clean = fresh[key];
            object[key] = Array.isArray(clean) ? [] : clean;
          }
        }
      }
      pending.clear();
    },
  };
}

/**
 * Step under an audit until `steps` of them have been answered, sweeping after every one.
 *
 * `step(n)` is one step of the simulation and may answer `false` for a step the world swallowed (a
 * hit-stop); a swallowed step is still watched, because a spawner that ran in it still ran. It is here
 * so a test that wants a long watch cannot forget that an audit without a sweep is an audit that sees
 * nothing, which is the one way this instrument fails quietly.
 */
export function watchedSteps(audit, steps, step, until) {
  let ran = 0;
  let tries = 0;
  while (ran < steps && (until === undefined || !until())) {
    if (++tries > steps * 4 + 100) throw new Error('the watched steps never came: ' + tries + ' tries');
    const answered = step(ran);
    audit.sweep();                      // every step, answered or swallowed by a hit-stop
    if (answered !== false) ran++;
  }
  return ran;
}
