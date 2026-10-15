// The three prompts that teach the hand (PLAN milestone 10's first-run tutorial).
//
// A new visitor has three things to find out before the arena means anything, and the game has three
// sentences to say them in: how to fly, how to shoot, and how to get out. Anything longer is a screen
// of its own standing between a person and the thing they came to look at, so there is no screen: one
// plate at the bottom of the glass, one line on it, and it is gone the moment the thing it was telling
// you about is something you already do.
//
// Three rules, all three of them about not being a tutorial.
//
//   **The game notices what you already know.** Nothing here waits for a prompt to be *read*. Every
//   lesson is a latch on something the run can see you doing - the hull has been flown, the gun has
//   gone, the dash has been spent - and each latch is checked every step whether or not anything was
//   ever put up for it. A visit that arrives already knowing how to dash is never shown the dash, and
//   a visit that flies and shoots in its first three seconds sees nothing at all. This is the whole
//   difference between a tutorial and a hint nobody asked for.
//
//   **A lesson is offered across the first runs of a save and never again.** The gate is how many runs
//   the log already holds (game/history.js), because that number is in the save already and it is the
//   honest answer to "is this visitor new": a save that has flown twenty runs and never been through
//   this - which is every save that predates these three lines - is a save that learned to play without
//   them and will not be taught now. What was learned is kept beside it, so a run that ends before the
//   dash is ever needed does not lose the lesson: the next run asks again, twice, and then drops it.
//
//   **A prompt that is ignored twice is not going to be read a third time.** Each lesson may fill the
//   plate `BALANCE.tutorial.asks` times in a run; after that it is simply not put up again until the
//   next run. An unanswered plate that stayed forever would be scenery by the second minute, and
//   scenery is worse than silence: the eye is supposed to be on the crowd.
//
// One plate at a time, in the order above. Three sentences on the glass at once is a paragraph, and a
// paragraph is what the bottom of a fighting screen is not for.
//
// Like the awards (game/awards.js) this is a watcher and not a system: it is stepped after everything
// else, it changes nothing in the run - no seed, no hull, no wave - and the reference run traces byte
// for byte with it in the game or without it. What the *save* keeps is a mirror as well: `world.tips`
// is read once when the visit opens (main.js) and written at an ending (game/run.js `bankRun`) and
// never during a step, which is also why no lesson is ever *learned* by a run that has not been flown.

import { BALANCE } from './balance.js';
import { hypot } from '../core/math.js';
import { remember, section } from '../core/save.js';
import { wordsOf } from '../core/keymap.js';

/**
 * The three lessons, in the order they are taught: fly, then shoot, then leave. The words are the
 * title screen's own vocabulary (index.html prints the same keys beside the same words), and the `id`
 * of each one is what the save remembers, so it is a name and not a number.
 *
 * The keys are not written into the line. A plate that named the keys a game ships with would be a
 * plate lying to exactly the one visitor who needs it: a hand on a keyboard that is not QWERTY rebinds
 * its keys before it has flown anything, and is then taught `W A S D` (core/keymap.js). So a lesson
 * names the *controls* its line is about and `saysOf` spells them out of the table the game actually
 * hears, which is the same rule that makes the pause say whatever key the pause is on today.
 */
export const LESSONS = [
  { id: 'fly', keys: ['up', 'left', 'down', 'right'], says: 'TO FLY' },
  { id: 'fire', says: 'MOUSE TO AIM \u00b7 HOLD LEFT TO FIRE' },
  { id: 'dash', keys: ['dash'], says: 'TO DASH' },
];

/** The whole line for one lesson, keys spelled out. What the plate is painted with. */
export function saysOf(lesson) {
  return lesson.keys === undefined ? lesson.says : wordsOf(lesson.keys) + ' ' + lesson.says;
}

/** The board: which lesson is on the glass, and how long it has been there. One per run. */
export function newPrompt() {
  const asks = {};
  for (const lesson of LESSONS) asks[lesson.id] = 0;
  return {
    id: '',           // the lesson on the glass; '' when the plate is empty
    age: 0,           // s it has been up
    out: 0,           // s of way out left, for a lesson that has just been learned
    wait: 0,          // s until another lesson may be put up at all
    asks: asks,       // how many times each lesson has filled the plate this run
    learned: [],      // ids this run has learned, banked into the save at its ending
    flown: 0,         // px of arena the hull has covered this run
    lastX: 0,         // where it stood on the last step, to count the next few px against that
    lastY: 0,
    teaching: false,  // is this run being taught at all (BALANCE.tutorial.runs)
  };
}

/**
 * What the save already knows, read once when the visit opens (main.js) beside the purse, the codex
 * and the log. Empty on a first visit, which is the only visit these three lines were written for.
 */
export function tipsFromSave() {
  return section('tutorial', { learned: [] }).learned;
}

/**
 * Put the board up for a new run and decide whether this run is being taught at all.
 *
 * The gate is the log, not a flag: a save holding three or more runs has been flying this game for
 * longer than these prompts have any business following it (rule two of the header), and a save
 * that has learned all three has nothing left to be told whoever is flying it. Note what the second
 * half asks and what it does not: whether there is a lesson *left*, not whether one of their moments
 * has come - at this moment the arena is empty by definition, so asking about a moment here would
 * decide that nobody is ever taught anything.
 */
export function resetTutorial(world) {
  world.prompt = newPrompt();
  const prompt = world.prompt;
  prompt.lastX = world.player.x;
  prompt.lastY = world.player.y;
  prompt.teaching = world.pastRuns.length < BALANCE.tutorial.runs && aLessonIsLeft(world);
}

/** Does this run still have a lesson it has not been through? (Every lesson may ask twice, and this
 * is asked at the start of a run, when none of them has asked at all.) */
function aLessonIsLeft(world) {
  for (const lesson of LESSONS) {
    if (!isKnown(world, lesson.id)) return true;
  }
  return false;
}

/**
 * One step of watching. Called after every system has had its turn (game/world.js `stepRun`), which
 * is what lets it read the run as completely as the awards do - and it writes nothing but its own
 * board, so "after" is about being complete and not about ordering anything.
 */
export function updateTutorial(world, dt) {
  const prompt = world.prompt;
  if (!prompt.teaching) return;
  const spec = BALANCE.tutorial;

  noteFlight(world);
  noteLearned(world);

  // A lesson that has just been learned gets its way out rather than vanishing on the step it landed,
  // because a plate that is simply *not there* one frame reads as a glitch and not as a graduation.
  if (prompt.out > 0) {
    prompt.out -= dt;
    if (prompt.out <= 0) {
      prompt.out = 0;
      prompt.id = '';
      prompt.age = 0;
    }
    return;
  }
  if (prompt.id !== '') {
    prompt.age += dt;
    if (isKnown(world, prompt.id)) {
      prompt.out = spec.away;
    } else if (prompt.age >= spec.hold) {
      // Unanswered. It steps back and tries again later, until it has asked as often as it is
      // allowed to - which is the only way a plate can be taken off a screen a run has stopped
      // reading without taking the lesson away with it.
      prompt.id = '';
      prompt.age = 0;
      prompt.wait = spec.back;
    }
    return;
  }
  if (prompt.wait > 0) {
    // Clamped rather than allowed to run past zero, because the board is what a test reads back and a
    // wait of -1e-13 is a number that means "no wait" while saying something else.
    prompt.wait = Math.max(0, prompt.wait - dt);
    return;
  }
  const lesson = nextLesson(world);
  if (lesson === null) return;
  prompt.id = lesson.id;
  prompt.age = 0;
  prompt.asks[lesson.id]++;
}

/**
 * Bank what this run learned (game/run.js `bankRun`, both endings). When the run taught the save
 * nothing new - which is every run of a visit that has already been through this - nothing is written
 * at all, so the usual ending of the usual run costs the document nothing.
 *
 * The save is written with the *whole* set rather than the delta, and with only ids the game knows,
 * so a document that picked up a name from somewhere else is quietly tidied rather than carried.
 */
export function bankTutorial(world) {
  const learned = world.prompt.learned;
  let fresh = 0;
  for (let i = 0; i < learned.length; i++) {
    if (world.tips.indexOf(learned[i]) < 0) fresh++;
  }
  if (fresh === 0) return;
  world.tips = knownIds(world);
  remember('tutorial', { learned: world.tips });
}

/** Is this lesson done with - learned in an earlier run of this save, or in this one? */
function isKnown(world, id) {
  return world.tips.indexOf(id) >= 0 || world.prompt.learned.indexOf(id) >= 0;
}

/** The lessons this save has learned, as the save would hold them: the game's own ids, in order. */
function knownIds(world) {
  const out = [];
  for (const lesson of LESSONS) {
    if (isKnown(world, lesson.id)) out.push(lesson.id);
  }
  return out;
}

/** The next lesson worth the plate: not learned, still allowed to ask, and its moment has come. */
function nextLesson(world) {
  const spec = BALANCE.tutorial;
  const prompt = world.prompt;
  for (const lesson of LESSONS) {
    if (isKnown(world, lesson.id)) continue;
    if (prompt.asks[lesson.id] >= spec.asks) continue;
    if (!momentIsNow(world, lesson.id)) continue;
    return lesson;
  }
  return null;
}

/**
 * Has the moment this lesson is about arrived? The three are deliberately different kinds of moment,
 * because the three things they teach happen at three different times in a run's first minute.
 *
 * Flying is taught from the first step - there is nothing to wait for and the ship has just been put
 * in the middle of an empty room. Shooting is taught once there is a body in the arena at all, which
 * is the run saying what it is now about; deliberately not "within range of the gun", because the
 * five primaries' ranges are between 260 px and 700 px apart and one number would be wrong for four
 * of them. Dashing is taught when a body is standing inside one dash's distance *and the dash is
 * ready*, because a hint about a move the ship cannot make yet is a hint about nothing.
 */
function momentIsNow(world, id) {
  if (id === 'fly') return true;
  if (id === 'fire') return world.enemies.length > 0;
  const ship = world.player;
  if (ship.dashCd > 0 || ship.dashLeft > 0) return false;
  return aBodyIsClose(world, BALANCE.tutorial.close);
}

function aBodyIsClose(world, near) {
  const ship = world.player;
  for (let i = 0; i < world.enemies.length; i++) {
    const enemy = world.enemies[i];
    if (hypot(enemy.x - ship.x, enemy.y - ship.y) <= near) return true;
  }
  return false;
}

/** The px of arena the hull has covered, walked every step and added to itself (rule one). */
function noteFlight(world) {
  const prompt = world.prompt;
  const ship = world.player;
  prompt.flown += hypot(ship.x - prompt.lastX, ship.y - prompt.lastY);
  prompt.lastX = ship.x;
  prompt.lastY = ship.y;
}

/**
 * The three latches, every step, whether or not a plate is up for them.
 *
 * Flight is measured as the path the ship has actually taken and not as its distance from where it
 * started, because a person who flew out and back has flown. The gun counts as gone the moment there
 * is a shot in the air - whoever asked for it, including the auto-fire switch (game/assists.js),
 * because what the lesson is about is that the gun goes. The dash asks the run's own tally (game/
 * tally.js `noteDash`), which counts dashes that were *granted* and not fingers that were pressed,
 * and is the same number an ending is asked about.
 */
function noteLearned(world) {
  const prompt = world.prompt;
  const spec = BALANCE.tutorial;
  if (!isKnown(world, 'fly') && prompt.flown >= spec.travel) learn(world, 'fly');
  if (!isKnown(world, 'fire') && world.bullets.count > 0) learn(world, 'fire');
  if (!isKnown(world, 'dash') && world.tally.dashes > 0) learn(world, 'dash');
}

function learn(world, id) {
  world.prompt.learned.push(id);
}

/** What the plate is there to say, in the words the lesson was written with; '' when it says nothing. */
export function promptWords(world) {
  const id = world.prompt.id;
  for (const lesson of LESSONS) {
    if (lesson.id === id) return saysOf(lesson);
  }
  return '';
}
