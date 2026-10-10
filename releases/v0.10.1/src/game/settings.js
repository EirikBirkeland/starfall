// What the player has told the game to do to its own picture (PLAN section 6).
//
// Four rows live here: how far the window shakes, how bright the white flash of a hurt body is,
// whether the numbers that float off a body are painted at all, and how much of every spray of
// sparks is let out. They are the settings that are not sound - the two sliders and the mute are
// owned by audio/engine.js, which owns the graph they move, and the settings panel asks both
// owners rather than keeping a copy of either.
//
// Three promises hold the module together:
//
//   **Nothing here can move a run.** Every one of these numbers is read by the eye or by the
//   simulation's own cosmetics - the window's offset, a bloom, a floating label, the spark pools -
//   and never by anything a shot, a hull or a spawn depends on. test/settings.test.mjs plays one
//   seed twice with every row at the far end of its travel and asks for the same run both times;
//   that is the promise being paid for rather than asserted.
//
//   **The last step of every row is the game as it shipped.** The share of 1 that ends each row is
//   what every painter and spawner did before a player was allowed a say, so a fresh visit cannot
//   be the first time the game looked wrong - and a test can say "the defaults are the shipped
//   game" without naming a single number.
//
//   **A row is the one description of itself.** Its name, its one plain line, and its steps are the
//   same table the panel prints, the keys step through, and `stats()` reports, so the panel cannot
//   offer a step the game does not implement and the save cannot hold a step nobody ever showed.
//
// A choice is stored as the *name* of a step rather than its index, which costs a few bytes and buys
// two things: a document a person can read, and a row whose steps can be added to or reordered
// without moving anybody's saved choice by one place.

import { section, remember } from '../core/save.js';

// How far each step of each row reaches, in the units that row means. They are named here rather
// than written into the table below because the table is read as words - a row is a row is a row -
// and the shares are the part a later session may want to argue about.
const SHAKE_LOW = 0.35;      // of the frame's trauma, as a share of the window's offset
const SHAKE_HALF = 0.65;
const FLASH_SOFT = 0.4;      // of the white bloom a hurt body wears
const FEW_SPARKS = 3;        // one spark in this many is let out
const HALF_SPARKS = 2;

// The step the shake row is given to a machine that has asked for as little movement as it will give
// (render/canvas.js `calmMotion`), and the only default in the game that is not the shipped one. It is
// a step id and not a share, so the row stays the one description of itself.
const CALM_SHAKE = 'off';

/**
 * One row: what the save calls it, what the panel calls it, the one plain line about what it is, and
 * the steps it can be set to. Each step carries the number the row means by it - a `share` of some
 * one thing for three of them, a `stride` through a spray for the fourth - and only that row's own
 * getters below read it, so no reader has to know how a stranger's row is written.
 */
export const ROWS = [
  {
    id: 'shake',
    name: 'SCREEN SHAKE',
    says: 'HOW FAR THE WINDOW IS MOVED',
    default: 'full',
    // The share of the frame's trauma the window is actually moved by (render/renderer.js). A share
    // of the *offset* and not of the trauma, so turning it down does not make a death less of an
    // event or change when the room decides to be shaking at all - it moves the room less when it
    // does. NONE takes the offset away entirely, which is under the floor the stillness is measured
    // against (BALANCE.screen.shakeFloor) and so is a genuinely still frame.
    steps: [
      { id: 'off', words: 'NONE', share: 0 },
      { id: 'low', words: 'LOW', share: SHAKE_LOW },
      { id: 'half', words: 'HALF', share: SHAKE_HALF },
      { id: 'full', words: 'FULL', share: 1 },
    ],
  },
  {
    id: 'flash',
    name: 'HIT FLASH',
    says: 'THE WHITE LIGHT ON A BODY THAT IS HURT',
    default: 'full',
    // The share of the white bloom a hurt body wears (render/entities.js, render/boss.js). A crowd
    // of them lighting up at once is the loudest strobe in the game, which is why this row exists -
    // and why the flare of a boss changing phase is *not* under it: that one says "nothing can hurt
    // me just now", and a setting that takes information away is not an accessibility setting.
    steps: [
      { id: 'off', words: 'OFF', share: 0 },
      { id: 'soft', words: 'SOFT', share: FLASH_SOFT },
      { id: 'full', words: 'FULL', share: 1 },
    ],
  },
  {
    id: 'numbers',
    name: 'SCORE NUMBERS',
    says: 'THE NUMBER EACH KILL PAYS',
    default: 'on',
    // Whether the score a kill pays is painted over the body that paid it. This is PLAN section 6's
    // "damage numbers": this game throws no per-hit numbers, so the row governs the floating numbers
    // that do exist, which are the ones that come in a crowd - one per kill, every second, over the
    // busiest part of the screen. It deliberately does not govern anything else that floats: a level
    // taken, a fight gone down, hull handed back, and the word a handed-back arena says when it
    // starts again are news and not clutter, and a row that took the news as well would be a row
    // nobody trusts.
    steps: [
      { id: 'off', words: 'OFF', share: 0 },
      { id: 'on', words: 'ON', share: 1 },
    ],
  },
  {
    id: 'particles',
    name: 'PARTICLES',
    says: 'SPARKS, WRECKAGE AND THE ENGINE WAKE',
    default: 'all',
    // One spark in `stride` is let out of a spray (game/effects.js). A stride rather than a share of
    // a count, because the counts are small - a muzzle flash is a dozen sparks and a swarmling's
    // death is a handful - and "keep a third of twelve" would round whole sprays away instead of
    // thinning them. NONE is every puff and spark gone, which is the one row here that buys frames
    // back as well as calm.
    steps: [
      { id: 'none', words: 'NONE', stride: 0 },
      { id: 'few', words: 'FEW', stride: FEW_SPARKS },
      { id: 'half', words: 'HALF', stride: HALF_SPARKS },
      { id: 'all', words: 'ALL', stride: 1 },
    ],
  },
];

// The choices as this visit has them: row id -> step id. Written by `loadFromSave` and by `stepRow`,
// and read by everything else through the getters below.
const choices = {};

/** The row a setting id names, or null when nobody has heard of it. */
function rowOf(id) {
  for (const row of ROWS) {
    if (row.id === id) return row;
  }
  return null;
}

/** One row's own step by id, or null when the row has no such step. */
function stepIn(row, id) {
  for (const step of row.steps) {
    if (step.id === id) return step;
  }
  return null;
}

/**
 * The step a row is standing on.
 *
 * A row with no choice yet stands on its default, and a choice that names no step - which nothing in
 * this module can produce, but a value handed in from storage can - stands on the *last* step,
 * which is the shipped one. Falling back to the shipped game is the only fallback that cannot make a
 * fresh visit look broken.
 */
function stepOf(id) {
  const row = rowOf(id);
  if (row === null) throw new Error('the game has no setting called ' + id);
  const wanted = choices[id] === undefined ? row.default : choices[id];
  return stepIn(row, wanted) || row.steps[row.steps.length - 1];
}

/** Where every row stands, in the save document's own field names: read, or written straight back. */
function choicesAsStored() {
  const out = {};
  for (const row of ROWS) out[row.id] = stepOf(row.id).id;
  return out;
}

/**
 * Put the rows where the last visit left them (core/save.js, the `view` section).
 *
 * Boot calls this once, before the first frame, and answers what it landed on so `stats()` and a
 * test can see it. A stored step this build's row does not have is neither an error nor a crash: it
 * is a step from a build that has been and gone, and the row takes its own default rather than
 * painting a panel around a hole.
 *
 * `shippedAt` says what a row starts at when the save has nothing to say about it, and it is a
 * parameter for exactly one reason: see `calm` below. It is a *default* and not an order, because the
 * save is read over the top of it.
 *
 * `calm` is whether the machine asked for as little movement as it will give. A first visit has no
 * answer of its own yet, so the request is what it gets: the window held still until the player says
 * otherwise. A save that already has a shake in it is that player's own answer to the same question,
 * given later and on purpose, and it outvotes a standing preference of their operating system - which
 * is why this is a default handed in at boot rather than a rule this module applies whenever it likes.
 */
export function loadFromSave(shippedAt, calm) {
  const wanted = Object.assign({}, shippedAt);
  if (calm === true && wanted.shake === undefined) wanted.shake = CALM_SHAKE;
  const defaults = {};
  for (const row of ROWS) {
    defaults[row.id] = wanted[row.id] === undefined ? row.default : wanted[row.id];
    if (stepIn(row, defaults[row.id]) === null) {
      throw new Error('the ' + row.id + ' setting cannot ship a step called ' + defaults[row.id]);
    }
  }
  const stored = section('view', defaults);
  for (const row of ROWS) {
    choices[row.id] = stepIn(row, stored[row.id]) === null ? row.default : stored[row.id];
  }
  return choicesAsStored();
}

/**
 * Move one row one step in one direction, and answer the step it landed on - or null when it was
 * already at that end of its travel, which is how the caller knows there is nothing to answer the
 * press with. Like the two volume sliders there is no wrapping: a row at the end of its travel is a
 * real place to be, and a key that comes back round to the beginning is a key that can put the shake
 * back on while you were trying to take it off.
 */
export function stepRow(id, delta) {
  const row = rowOf(id);
  if (row === null) throw new Error('the game has no setting called ' + id);
  const now = stepOf(id);
  const at = row.steps.indexOf(now);
  const next = Math.max(0, Math.min(row.steps.length - 1, at + Math.sign(delta)));
  if (next === at) return null;
  choices[id] = row.steps[next].id;
  remember('view', choicesAsStored());
  return row.steps[next];
}

/** The step a row is standing on, in the words the panel prints. */
export function wordsOf(id) {
  return stepOf(id).words;
}

/** The id of the step a row is standing on, which is what `stats()` reports. */
export function stepIdOf(id) {
  return stepOf(id).id;
}

/** The rows themselves, in the order the panel prints them. */
export function pictureRows() {
  return ROWS;
}

// --- what the eye and the cosmetics read ---------------------------------------
// Four small functions rather than the raw choices, because every reader wants the number of *its*
// thing and nothing else, and a painter that could read a stranger's row could quietly start
// depending on a setting it has no business with.

/** Of the frame's trauma, how far the window is moved: 0 to 1 (render/renderer.js). */
export function shakeShare() {
  return stepOf('shake').share;
}

/** Of the white bloom a hurt body wears, how much is painted: 0 to 1 (render/entities.js). */
export function flashShare() {
  return stepOf('flash').share;
}

/** Of every spray, one spark in this many is let out; 0 lets out none (game/effects.js). */
export function particleStride() {
  return stepOf('particles').stride;
}

/** Whether the numbers that float off a body are painted at all (game/enemies.js). */
export function numbersShown() {
  return stepOf('numbers').share > 0;
}
