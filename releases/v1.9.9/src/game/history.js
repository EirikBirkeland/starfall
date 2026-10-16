// The run log (PLAN 3.7): the last twenty runs this save has flown, and what each one was.
//
// The card a run ends on says everything about that run and then it is gone, and the best score is
// the only fact that outlives it. This is the rest of the memory: one row per run - the seed it was
// flown on, the ship that flew it, how long it lasted, what it scored, whether it ended in a win,
// and the harder rule it stood under when it had one - kept in the save document and read off the
// codex panel, where a row has no key and no price because nothing here can be bought.
//
// Three rules, which are the same three the codex and the awards keep:
//
//   **A mirror, never a cause.** Nothing reads the log back into a run, and nothing here is written
//   during a step: a row is made at an ending, out of numbers the run has finished moving. The
//   reference run traces byte for byte with this file in the game or without it.
//
//   **One run, one row.** A run that was won can be handed its arena back and flown on
//   (game/run.js `continueRun`), and it is banked twice - once at the win and once when it finally
//   goes down. The second ending *replaces* this run's row rather than adding one, so the log tells
//   the truth about how that run ended and how much it finally made, and a run is never in the list
//   twice for having stopped twice.
//
//   **Nothing is deduped.** The same seed flown twice is two runs and gets two rows, which is the
//   whole point: the log is a record of what was flown, not a set of things that have happened. The
//   order is part of the record too - newest first - which is why the store hands this list back
//   exactly as it was given it (core/save.js `records`).
//
// `world.pastRuns` is the visit's copy, read out of the save when the visit opens and never cleared
// by a new run, like the purse and the codex. `world.runLogged` is the run's own bookkeeping, and
// it is what makes the rule above one line long.

import { remember, section } from '../core/save.js';
import { BALANCE } from './balance.js';
import { activeOf } from './challenges.js';

/** A log with nothing in it yet: the shape every reader wants, whether or not anything is flown. */
export function emptyLog() {
  return [];
}

/**
 * What the last visit left behind, read once when the visit opens (main.js) beside the purse and
 * the codex. Newest first, as the panel reads it; empty on a first visit, which is the honest answer
 * and the one the panel is built to print.
 *
 * At most as many rows as this build keeps (BALANCE.history), and nothing in between is touched: a
 * log written by a build that kept more than this one is read as this one's log, because the rack
 * prints what the visit holds and the visit holds what this build can keep.
 */
export function loggedFromSave() {
  return section('runs', { log: [] }).log.slice(0, logKeeps());
}

/** The visit's log, in the shape the save would write and the panel would print. */
export function runLedger(world) {
  return world.pastRuns.slice();
}

/** How many runs this save can still be told about (BALANCE.history). */
export function logKeeps() {
  return BALANCE.history.keep;
}

/**
 * One finished run, as one row. Every number here is one the run has stopped moving, which is what
 * makes an ending the only moment this can be written at: `world.elapsed` is still climbing while a
 * run is flying, and a row written mid-run would be a row about a run that has not ended.
 *
 * `won` is the run's own fact and not the last ending's: a run that cleared the schedule, was handed
 * back and went down an hour later is a cleared run, and the log says so either way.
 *
 * The rule the run was flown under (game/challenges.js) rides with the score it was scored under,
 * and is *left off* a run that had none rather than written as a word for "none" - the same bargain an
 * unmapped control strikes in `keys.binds` (core/save.js): the absence is the answer. Two things fall
 * out of that, and they are the whole reason it is done that way: a plain run's row is byte for byte
 * the row it always was, and a row written before rules existed says the same thing a plain run
 * written after them does, so there is nothing to migrate. `rule` is optional in the store for
 * exactly this reason (`KINDS.optional`).
 */
function recordOf(world) {
  const record = {
    seed: world.seed >>> 0,
    ship: world.ship,
    seconds: Math.floor(world.elapsed),
    score: world.score,
    won: world.won === true,
  };
  const rule = activeOf(world);
  if (rule !== '') record.rule = rule;
  return record;
}

/**
 * Write this run into the log, and into the save (game/run.js `bankRun` is the only caller, and it
 * calls once per ending). Returns the row, which is what the caller has just made true about this run.
 *
 * If this run already has a row - its first of the two endings - that row is *replaced* and the rest
 * of the list is left where it was, so a run that was won, flown on and finally buried is one row
 * saying the last and biggest thing that was true of it. `world.runLogged` is what this run set when
 * it wrote the first one, so nothing has to guess whose row is at the front of the list.
 */
export function logRun(world) {
  const record = recordOf(world);
  if (world.runLogged) world.pastRuns[0] = record;
  else world.pastRuns.unshift(record);
  world.runLogged = true;
  while (world.pastRuns.length > logKeeps()) world.pastRuns.pop();
  remember('runs', { log: world.pastRuns });
  return record;
}
