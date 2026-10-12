// The one document the game remembers between visits.
//
// Milestone 8 (PLAN section 3.7) has a lot to remember - stardust, unlocked ships, perks, the
// codex, achievements, the last twenty runs - and all of it lands in the same place: one JSON
// document under one key in localStorage. What is here already is the best score (which used to
// be the only thing stored, and still is the only thing worth storing on its own) and the two
// volume sliders with the mute from milestone 7, which used to last a visit and be forgotten.
// Everything milestone 8 adds after this is a line in SCHEMA below.
//
// Three promises, which are the whole reason this is a module with tests instead of a `setItem`
// call in whoever happened to need a number:
//
// 1. **It is versioned.** `SAVE_VERSION` is the version this build writes. A document from an
//    older build is completed field by field from the defaults the feature that owns each field
//    hands in, which is all a migration needs to be while fields are only ever added (a build
//    that ever *renames* one adds a step here and says so). A document from a *newer* build is
//    left exactly as it is: this visit reads the fields it knows and writes nothing. That is not
//    a hypothetical here - the release menu serves every past version from one origin, so a
//    player who plays 0.8 and then picks 0.7 off the shelf is exactly this case, and going back
//    must not trash what the newer one saved.
//
// 2. **It is validated on the way in.** Every field is checked against the kind it is meant to
//    be, and anything else is treated as not-stored so the feature falls back to its own
//    default. A browser tab can be holding anything at all under this key: an old build's text,
//    a half-written page, somebody's own number typed into the console. None of them may be
//    able to hand the game a `best` of `undefined` or a slider that is a word.
//
// 3. **A read never destroys.** Nothing in here writes unless a caller asked for a new value, so
//    a page load that found nonsense in storage leaves the nonsense where it is until the game
//    has something of its own to remember.
//
// The document is a plain object of named sections (`{ version, score: { best }, audio: { ... } }`).
// The store knows which sections exist and what kind of thing every key is; it deliberately does
// *not* know what they mean or what they default to, because the feature that owns a number is
// the one that knows what it ships at. `section(name, defaults)` is where those two meet.
//
// The store is stateless: every call reads storage again. Nothing here happens often enough to
// want a cache - a visit reads it once at boot, a volume keypress writes it, and a finished run
// writes it once - and having no cached copy means no stale copy.

export const SAVE_KEY = 'starfall.save';

/** The version of the document this build writes. */
export const SAVE_VERSION = 1;

// Releases before this file remembered one number, in a key of its own. It is picked up on the
// way in and mirrored on the way out, which does two jobs: a player who goes back to an old
// release from the menu is not shown a best of zero, and the plain key doubles as a spare copy
// of the one number that matters. Both go away when the menu stops offering those releases.
const LEGACY_BEST_KEY = 'starfall.best';

// Nothing the game remembers is anywhere near a billion: a score that big is not an achievement,
// it is a corrupt number, and a corrupt best that cannot be beaten is worse than no best.
const MAX_WHOLE = 1e9;

// What one entry of a remembered *set* looks like: a ship id, a perk id, an achievement id. Lower
// case, a letter to start, and short - which is the shape every id in the game is written in
// (game/ships.js, game/upgrades.js), so a name that does not match it did not come from the game.
const NAME = /^[a-z][a-z0-9_-]{0,31}$/;

// No set the game remembers is anywhere near this big: five ships, a handful of perks. Past it what
// is stored is not the game's own list, and a field nobody can account for is dropped whole.
const MAX_NAMES = 32;

// ...except the codex, which is a row per enemy, per fight and per card (game/codex.js) and so is
// the one list that is a few dozen long on purpose. It still has a ceiling: a codex that has outgrown
// every row the game can name is not the game's codex either.
const MAX_CODEX = 96;

// ...and the awards, which are the same kind of list - one id per thing the game can name, and a
// table that grows as the game does (game/awards.js). Thirty-odd today, so the rack's ceiling of
// thirty-two would have been full on the day this shipped.
const MAX_AWARDS = 64;

// ...and no tally of theirs reaches this high either. A perk has five ranks and an achievement is
// worth one, so a count of a thousand is not a count the game made.
const MAX_COUNT = 1000;

// ...and the run log, which is the one list that is *records* and not names (game/history.js): the
// last twenty runs, newest first. The ceiling is the store's, not the game's - the game decides how
// many runs it keeps (BALANCE.history.keep) and the store only says what a list of runs may
// reasonably be. A log of seventy runs is not the game's log trimmed a little; it is somebody else's
// numbers.
const MAX_RUNS = 64;

// What a `KeyboardEvent.code` is allowed to look like (core/keymap.js): a capital to start, letters
// and digits after it, and nothing else - `KeyW`, `Space`, `BracketLeft`. A code is a name from the
// browser rather than one the game made, so it is not the lower-case `NAME` shape every other name in
// this document is, and it is checked against the small table of codes the game will accept anyway.
const KEYCODE = /^[A-Z][A-Za-z0-9]{1,15}$/;

// A seed is a uint32 (core/rng.js), which is the widest number this field can legitimately hold.
const MAX_SEED = 4294967295;

// A day of flying is not a run the game ended; it is a number from somewhere else, or a clock that
// was never the run's own.
const MAX_RUN_SECONDS = 86400;

// ...and the daily run's day (game/daily.js), which is a date written the way it is spoken -
// 2026-10-12 is 20261012 - so the widest day there is is the ceiling, and anything past it did not
// come off a calendar.
const MAX_DAY = 99999999;

/**
 * What a remembered thing is allowed to be. A kind answers with the value it was given, or
 * null for "that is not one of these". A whole number is a non-negative integer: every number
 * the game remembers is a count, a level, or a score, and none of them are ever a fraction or
 * below zero. A number outside its `max` is not clamped: a value this wrong is not the player's
 * setting with a rounding error, it is a value from somewhere else, and the feature that owns
 * the key gets to decide (audio/engine.js clamps its own sliders to their travel on top of this).
 */
const KINDS = {
  whole: (max) => (value) =>
    (Number.isInteger(value) && value >= 0 && value <= max ? value : null),
  flag: (value) => (typeof value === 'boolean' ? value : null),
  /** One short name on its own - one field of a record, where `names` below is a whole set. */
  name: (value) => (typeof value === 'string' && NAME.test(value) ? value : null),
  /**
   * A set of short names, kept as a list: which ships the purse has bought, later which perks.
   * The store knows it is a list of names and nothing about what the names mean - the feature
   * that owns them does (game/hangar.js), which is the same split the whole document is built on.
   *
   * An entry that is not a name is dropped rather than condemning the list: one wrecked entry in
   * a half-written page should not cost the player every ship they own. Duplicates are dropped,
   * and what is left comes out sorted, so the same set always writes the same text. A value that
   * is not a list at all, or that holds more names than the game could have, is not this field,
   * and the whole of it is dropped.
   */
  names: (max) => (value) => {
    if (!Array.isArray(value)) return null;
    const kept = [];
    for (const entry of value) {
      if (KINDS.name(entry) === null) continue;
      if (kept.indexOf(entry) < 0) kept.push(entry);
    }
    // A list that had something in it and gave up nothing this build can read is not the game's list
    // at all. That is the field being the wrong kind, not an empty set, so it is treated as not
    // stored and the feature falls back to its own default - the same bargain every other field of
    // the wrong kind gets. An empty list *is* an answer, and is kept as one: nothing bought yet.
    if (value.length > 0 && kept.length === 0) return null;
    if (kept.length > max) return null;
    return kept.sort();
  },
  /**
   * A map of one name to another: which key answers each of the controls a player can move
   * (core/keymap.js, PLAN section 6). It is `counts` with the numbers replaced by key codes, and it
   * keeps the same bargains entry by entry - an entry that is not the right kind of pair is dropped and
   * its neighbours are kept, a map bigger than the game could fill is dropped whole, keys come out
   * sorted so the same table always writes the same text.
   *
   * An empty map is the most common answer of all and is kept as one: every control on its shipped
   * key writes nothing, because a document that remembers the defaults is a document that has to be
   * right about them forever.
   */
  mapping: (maxNames) => (value) => {
    if (!isPlainObject(value)) return null;
    const kept = {};
    const names = Object.keys(value).sort();
    for (const name of names) {
      if (!NAME.test(name)) continue;
      const code = value[name];
      if (typeof code !== 'string' || !KEYCODE.test(code)) continue;
      kept[name] = code;
    }
    if (names.length > 0 && Object.keys(kept).length === 0) return null;
    if (Object.keys(kept).length > maxNames) return null;
    return kept;
  },
  /**
   * A tally of short names to whole numbers: how many ranks of each permanent perk the purse has
   * bought (game/perks.js, PLAN 3.7). Where `names` is a set - a ship is bought or it is not - this
   * is a ledger, and a ledger of a hundred names would be as much use as a ledger of a hundred
   * ships, so it is one field of a map rather than a key per perk that the store would have to
   * know about by name.
   *
   * The same bargains as the set, entry by entry: a name that is not a name or a count that is not a
   * count in `0..maxCount` is dropped and its neighbours are kept, a map with entries that yield
   * nothing is not this field at all, a map bigger than the game could fill is dropped whole, and
   * an empty map is a real answer - nothing bought yet. Keys come out sorted, so the same ledger
   * always writes the same text.
   */
  counts: (maxNames, maxCount) => (value) => {
    if (!isPlainObject(value)) return null;
    const kept = {};
    const names = Object.keys(value).sort();
    for (const name of names) {
      if (!NAME.test(name)) continue;
      const count = value[name];
      if (!Number.isInteger(count) || count < 0 || count > maxCount) continue;
      kept[name] = count;
    }
    if (names.length > 0 && Object.keys(kept).length === 0) return null;
    if (Object.keys(kept).length > maxNames) return null;
    return kept;
  },
  /**
   * A log of small records: the last twenty runs, and what each one was (game/history.js, PLAN
   * 3.7). Where `names` is a set and `counts` a ledger, this is a *list of rows*, and the rows are
   * small fixed shapes - one object per run, holding a seed, a ship, a time, a score and a win.
   *
   * Two things make this kind different from the other two lists, and both of them matter:
   *
   *   **The order is the information.** A log reads newest-first, so this is the one list the store
   *   hands back exactly as it came: nothing is sorted and nothing is deduped - the same seed flown
   *   twice is two runs and two rows, which is the truth about them.
   *
   *   **An entry is judged whole.** Every field in `fields` is required, and one field that is not
   *   that kind condemns the whole row rather than just itself: a record that lost its score is not
   *   a record with a spare field, it is a line that cannot be printed. Its neighbours on the list
   *   are kept, as always.
   */
  records: (maxEntries, fields) => (value) => {
    if (!Array.isArray(value)) return null;
    const names = Object.keys(fields);
    const kept = [];
    for (const entry of value) {
      if (!isPlainObject(entry)) continue;
      const record = {};
      let whole = true;
      for (const name of names) {
        const read = fields[name](entry[name]);
        if (read === null) { whole = false; break; }
        record[name] = read;
      }
      if (whole) kept.push(record);
    }
    // The same bargain the other lists strike: a list that held something and gave up nothing this
    // build can read is the wrong kind of field, not an empty log. An empty list *is* an answer -
    // nothing has been flown yet - and is kept as one.
    if (value.length > 0 && kept.length === 0) return null;
    if (kept.length > maxEntries) return null;
    return kept;
  },
};

/**
 * What one entry of the run log is made of (game/history.js). Every field is required: a record
 * missing one is not a half a run, it is a wrecked line, and a wrecked line in a log of twenty is
 * dropped rather than printed with a hole where the score should be.
 */
const RUN_FIELDS = {
  seed: KINDS.whole(MAX_SEED),
  ship: KINDS.name,
  seconds: KINDS.whole(MAX_RUN_SECONDS),
  score: KINDS.whole(MAX_WHOLE),
  won: KINDS.flag,
};

// The document's definition: the sections, and the kind of every key in them. A section that is
// not in here is not stored, and a key that is not in here is not read - which is what keeps a
// document written by a build with more features than this one from leaking fields this build
// would have no idea how to hold. Add a line for anything milestone 8 remembers next.
const SCHEMA = {
  // game/run.js banks the best score here at the end of a run.
  score: { best: KINDS.whole(MAX_WHOLE) },
  // The purse between runs (game/stardust.js, PLAN 3.7).
  meta: { dust: KINDS.whole(MAX_WHOLE) },
  // What the purse has bought (game/hangar.js, PLAN 3.7): the ships whose price has been paid - a
  // set of ship ids, and the ship table decides what each one is worth - and the ranks of each
  // permanent perk it has paid for, which is a count and not a yes, so it is the other kind.
  hangar: {
    ships: KINDS.names(MAX_NAMES),
    perks: KINDS.counts(MAX_NAMES, MAX_COUNT),
  },
  // What the codex has met (game/codex.js, PLAN 3.7): which bodies and fights the runs of this save
  // have seen and which cards they have taken. Two sets and not one tally, because nothing about a
  // codex row is a count - a thing is met or it is not - and the panels are two questions, not one.
  codex: {
    hosts: KINDS.names(MAX_CODEX),
    lines: KINDS.names(MAX_CODEX),
  },
  // What the runs of this save have won (game/awards.js, PLAN 3.7): a set of award ids, and a set
  // rather than a tally because an award is won once - there is no second rank of it to buy.
  awards: {
    won: KINDS.names(MAX_AWARDS),
  },
  // The runs themselves (game/history.js, PLAN 3.7): the last twenty, newest first, each one a
  // record of what was flown - the seed it was flown on, the ship that flew it, how long it lasted,
  // what it scored, and whether it ended in a win. One field and not one per fact because a run is
  // one thing, and because the store has no business knowing what a run means (see `records`).
  runs: {
    log: KINDS.records(MAX_RUNS, RUN_FIELDS),
  },
  // Which day this save last flew a daily arena, and the best it scored on it (game/daily.js, PLAN
  // milestone 10). One day and not a history: the day before the one the player is standing in is a
  // number nothing in the game can still be compared against, and a stored field nobody reads is a
  // field that quietly rots. Whoever owns this reads it *for a day* and gets 0 for any day other than
  // the one stored, which is how a turned calendar says "nobody has flown today yet".
  daily: {
    day: KINDS.whole(MAX_DAY),
    best: KINDS.whole(MAX_WHOLE),
  },
  // What the runs of this save have scored under each harder rule (game/challenges.js, PLAN After
  // 1.0): challenge id -> the best score flown under that rule. It is one map and not one key per
  // rule, for the same reason the perk tally is - the store has no business knowing how many rules the
  // game can name, and a table that grows should not have to ask for storage each time it does. The
  // number side is a *score*'s ceiling and not a rank's: a best under a rule is the same kind of
  // number as `score.best`, and 1,000 would be a record nobody could beat. A rule that is not in here
  // has never been flown, which is an answer and not a hole - see `bestOf`.
  challenges: {
    bests: KINDS.counts(MAX_NAMES, MAX_WHOLE),
  },
  // audio/engine.js owns these three: two slider positions and the mute. The ceilings are the
  // store's, not the mixer's - no slider has a thousand positions - and the mixer clamps again
  // to its own travel when it applies them.
  audio: {
    music: KINDS.whole(1000),
    effects: KINDS.whole(1000),
    muted: KINDS.flag,
  },
  // What the player asked the game to do to its own picture (game/settings.js, PLAN section 6).
  // Every one of them is the *name* of a step rather than its index or its share, so a row whose
  // steps are added to or reworded cannot silently move a saved choice along the row: a step this
  // build has never heard of is not stored at all, and the row falls back to what it ships at.
  view: {
    shake: KINDS.name,
    flash: KINDS.name,
    numbers: KINDS.name,
    particles: KINDS.name,
    marks: KINDS.name,
  },
  // The two switches that answer for the hand (game/assists.js, PLAN section 6): the trigger held down
  // and the gun pointed at a body. Flags and not step names, because a switch has two places and
  // nothing in between them - and a value that is not a yes or a no is not stored, which leaves the
  // switch at off, which is the game as it was built.
  assists: {
    fire: KINDS.flag,
    aim: KINDS.flag,
  },
  // Which of the three prompts a save has already been through (game/tutorial.js, PLAN milestone 10):
  // a set of lesson ids and nothing else, because a lesson is learned once - there is no second rank of
  // knowing how to dash. `names` is the right kind for exactly that reason, and its ceiling (thirty-two
  // against the three the game can name) is why a set and not a tally is kept.
  tutorial: {
    learned: KINDS.names(MAX_NAMES),
  },
  // Which key answers which control (core/keymap.js, PLAN section 6). Control id -> key code, and
  // only for the rows that are not on their shipped key - the shipped table is in the build, not in
  // the document, so a control this build has never heard of is simply not bound by the save.
  keys: {
    binds: KINDS.mapping(MAX_NAMES),
  },
};

/** A document with nothing remembered in it at all: the version, and an empty section each. */
export function freshSave() {
  const doc = { version: SAVE_VERSION };
  for (const name of Object.keys(SCHEMA)) doc[name] = {};
  return doc;
}

/**
 * localStorage, or null when there is none to have: a Node tool with no browser around, a
 * private window that throws on being touched, a browser with storage switched off. None of
 * them are a reason the game cannot be played.
 */
function storage() {
  try {
    return window.localStorage;
  } catch (err) {
    return null;
  }
}

function readText(key) {
  const store = storage();
  if (store === null) return null;
  try {
    return store.getItem(key);
  } catch (err) {
    return null;
  }
}

/** Returns whether it got there. A full quota or a blocked private window answers no. */
function writeText(key, text) {
  const store = storage();
  if (store === null) return false;
  try {
    store.setItem(key, String(text));
    return true;
  } catch (err) {
    return false;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Storage text -> the document this build can use, plus what to do about it. Never writes.
 *
 * Answers `{ doc, problem, writable }`. `problem` says what was wrong with what was stored (''
 * when nothing was), and `writable` is whether this build may write over it at all.
 */
function interpret(raw) {
  if (raw === null || raw === '') return { doc: freshSave(), problem: 'nothing stored', writable: true };

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { doc: freshSave(), problem: 'not JSON', writable: true };
  }
  if (!isPlainObject(parsed)) return { doc: freshSave(), problem: 'not an object', writable: true };

  // No version is no document. A version that is not a whole number, or is zero, or is a float,
  // is the same: whatever wrote it is not this game remembering something.
  const version = parsed.version;
  if (!Number.isInteger(version) || version < 1) {
    return { doc: freshSave(), problem: 'no version', writable: true };
  }
  // From a newer build than this one. Read the fields it has that we know, and write nothing:
  // this build cannot know what the newer one means by them, and it certainly cannot know how
  // to rewrite them.
  if (version > SAVE_VERSION) {
    return {
      doc: normalise(parsed),
      problem: 'written by version ' + version,
      writable: false,
    };
  }
  // Ours or older. Older needs no special case while fields are only ever added: whatever the
  // older document did not have is filled from the defaults the caller hands `section`.
  return { doc: normalise(parsed), problem: '', writable: true };
}

/**
 * Keep only what this build knows how to hold, and only in the shape it is meant to be in.
 * Unknown sections and unknown keys are dropped, a field of the wrong kind is dropped, and the
 * version is stamped with ours because from here on this document is ours. Sections and keys are
 * written in SCHEMA order, so the same values always write the same text.
 */
function normalise(parsed) {
  const doc = { version: SAVE_VERSION };
  for (const name of Object.keys(SCHEMA)) {
    const keys = SCHEMA[name];
    const stored = isPlainObject(parsed[name]) ? parsed[name] : {};
    const kept = {};
    for (const key of Object.keys(keys)) {
      const value = keys[key](stored[key]);
      if (value !== null) kept[key] = value;
    }
    doc[name] = kept;
  }
  return doc;
}

/**
 * The best score an older release left in its own key, or null when it left nothing usable.
 * Parsed the same forgiving way the old reader parsed it: text out of storage is text.
 */
function legacyBest() {
  const raw = readText(LEGACY_BEST_KEY);
  if (raw === null) return null;
  const value = parseInt(raw, 10);
  return SCHEMA.score.best(value);
}

/** What is stored, as a document - and what to make of it. */
function read() {
  const state = interpret(readText(SAVE_KEY));
  if (state.problem !== '') {
    // There was nothing to read, so this is a first visit as far as the game is concerned - and
    // the one number any earlier release remembered is worth picking up off the floor.
    const best = legacyBest();
    if (best !== null && state.doc.score.best === undefined) state.doc.score.best = best;
  }
  return state;
}

/** Why the last read fell back to a fresh document, or '' when nothing was wrong with it. */
export function saveProblem() {
  return read().problem;
}

/** Whether this build may write to storage at all (false over a newer document). */
export function saveIsWritable() {
  return read().writable;
}

/**
 * One section of the document, with every key the caller asked for filled in - from storage when
 * storage had it, from the caller's own defaults when it did not or when what it had was not the
 * right kind of thing.
 *
 * Both arguments are checked, and both throw when they are wrong: a caller asking for a key the
 * store does not know about, or defaulting a whole number to a word, is a bug in the caller and
 * should say so on the first run rather than remember nonsense quietly.
 */
export function section(name, defaults) {
  const keys = SCHEMA[name];
  if (!keys) throw new Error('the save document has no ' + name + ' section');
  const stored = read().doc[name];
  const out = {};
  for (const key of Object.keys(defaults)) {
    if (!keys[key]) throw new Error('the save document does not remember ' + name + '.' + key);
    const fallback = defaults[key];
    if (keys[key](fallback) === null) {
      throw new Error('the save document cannot default ' + name + '.' + key + ' to ' + JSON.stringify(fallback));
    }
    out[key] = stored[key] === undefined ? fallback : stored[key];
  }
  return out;
}

/**
 * Give the document new values for one section and write it out. Returns whether it got there:
 * false when a newer build's document is in the way (see `interpret`) or when this browser will
 * not store anything, neither of which is a reason to spoil whatever was happening.
 *
 * A value of the wrong kind throws rather than being dropped. It is always a bug in the caller,
 * and a remembered number that silently is not what the caller thought it was is the exact class
 * of thing this module exists to prevent.
 */
export function remember(name, values) {
  const keys = SCHEMA[name];
  if (!keys) throw new Error('the save document has no ' + name + ' section');
  const state = read();
  const stored = state.doc[name];
  for (const key of Object.keys(values)) {
    if (!keys[key]) throw new Error('the save document does not remember ' + name + '.' + key);
    const value = keys[key](values[key]);
    if (value === null) {
      throw new Error('refusing to remember ' + name + '.' + key + ' as ' + JSON.stringify(values[key]));
    }
    stored[key] = value;
  }
  if (!state.writable) return false;
  if (!writeText(SAVE_KEY, JSON.stringify(state.doc))) return false;
  mirrorLegacyBest(state.doc);
  return true;
}

/**
 * Keep the old plain best-score key up to date, so an older release off the menu still reads the
 * truth. Only ever written when there is a best to write and only with the document's own number.
 */
function mirrorLegacyBest(doc) {
  const best = doc.score.best;
  if (best === undefined) return;
  writeText(LEGACY_BEST_KEY, best);
}
