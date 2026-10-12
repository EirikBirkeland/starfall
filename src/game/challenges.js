// The challenge modifiers: a harder set of rules for the next run (PLAN, After 1.0).
//
// A challenge is a *rule the whole run stands under*, chosen between runs and impossible to change
// once it is flying. Four ship: the ship stands on one hull; the dash is gone; the crowd and its
// shots travel faster than they shipped; the arena holds more of the crowd than it ships. Every one of
// them is a row in `BALANCE.challenges` and a question asked where the number it changes is already
// read - the hull is written where the ship's
// hull is written, the dash is refused where the dash is granted, the crowd's speed is multiplied
// where a body's speed is worked out. Nothing is cached into a ship and nothing is kept in two
// places, which is what makes an ordinary run untouched by any of this: with no challenge flying,
// every lever below answers its neutral number and a run traces byte for byte what it always traced.
//
// Three decisions are worth having written down:
//
//   **One at a time.** Two rules stacked is a third rule nobody measured, and a challenge that has
//     never been measured is a guess about the player's night. So the key cycles a *single* id and
//     the levers below ask "is this the challenge flying", never "is one of these". When a
//     combination is ever wanted it wants its own row and its own yardstick, not a multiplication.
//
//   **It is a choice about the next run, so it is remembered for the visit and not for the save.**
//     That is exactly how the ship pick works (game/ships.js): `world.ship` outlives a run and dies
//     with the page. A saved challenge would be a game that is secretly harder for a visitor who
//     switched it on once weeks ago, and the only cure for a rule nobody remembers is a rule nobody
//     can leave set.
//
//   **It is said out loud everywhere a run's facts are said** - the title, the glass beside the
//     clock, the pause's rack, and the ending's card. A rule the player has forgotten is a rule the
//     game cheated with, and an ending that does not say which rules it was flown under is a number
//     that will be quoted without its units.
//
// What is here because the rules are not much good without it: a record per rule. A best under each
// line, the way the day keeps its own (game/daily.js), is what makes a rule something to beat rather
// than a difficulty dial - and a score flown under ONE HULL that is filed in the same column as an
// ordinary one is a number quoted without its units. The record is banked at an ending beside the
// all-time best and the day's, said on the title under the rule that was chosen, said on the ending's
// card, and kept on a rack of its own in the codex. An ordinary run pays nothing for any of it: no
// rule flying means no bank, no word, and no row that was not there before.

import { BALANCE } from './balance.js';
import { remember, section } from '../core/save.js';

const PERCENT = 100;

/**
 * The challenges, in the order the key cycles through them.
 *
 * The order is the shape of the rule and not a ladder of severity: the two rules about your own ship
 * come first - what your hull is, then whether you can jump - and the two about the crowd's size and
 * speed come last. It is worth saying plainly that it is *not* sorted by what each rule costs, because
 * `tools/challenge-cost.js` has measured all of them and the dearest (ONE HULL, at 0.39x a careless
 * run's middle score) is the first press. A hand that presses the key twice by accident lands on NO
 * DASH, which the ladder cannot price at all.
 *
 * `name` is the two or three words the glass prints and `says` is the sentence under it - what the
 * rule *does*, in the plain words the rest of the interface uses. `saysOf` is what a reader should
 * call, because the two crowd rules' sentences are built out of their own numbers and a sentence
 * written by hand next to a number that can move is a sentence that goes stale.
 */
export const CHALLENGES = [
  { id: 'brittle', name: 'ONE HULL', says: 'one touch and the run is over' },
  { id: 'grounded', name: 'NO DASH', says: 'the jump is gone, and so are the cards that need it' },
  { id: 'swift', name: 'SWIFT CROWD', says: '' },
  { id: 'thick', name: 'THICK CROWD', says: '' },
];

/** The row a challenge id names, and a loud answer if there is not one. */
function challengeRow(id) {
  const row = BALANCE.challenges[id];
  if (row === undefined) throw new Error('no challenge is called ' + id);
  return row;
}

/** The list, with the empty first step that means "no challenge" in front of it. */
const CYCLE = ['', ...CHALLENGES.map((c) => c.id)];

/** Is `id` one of the challenges on offer? The empty string is, and means none. */
export function isChallenge(id) {
  return CYCLE.indexOf(id) >= 0;
}

/**
 * Put a challenge on the runs this world flies. `''` takes it off again - which is what the key's
 * first step back round the cycle is, and what every run ever flown was.
 *
 * Like the ship pick it is a choice made between runs and it outlives the run it was made for
 * (`resetRun` never touches it). Whether the next run is flown under it is a different question and
 * belongs to whoever launches the run; this only says what the next one will stand under.
 */
export function setChallenge(world, id) {
  if (!isChallenge(id)) throw new Error('no challenge is called ' + id);
  world.challenge = id;
  return id;
}

/**
 * One press of the key: round the cycle, and answer what it landed on (`''` when it came back round
 * to no challenge at all). Anything that prints the choice prints what this returns.
 */
export function cycleChallenge(world) {
  const at = CYCLE.indexOf(world.challenge);
  // A world left pointing at something this build has never heard of is a bug, not a locked-in
  // choice: the cycle takes it to the first real rule rather than spinning on nothing.
  const next = at < 0 ? CHALLENGES[0].id : CYCLE[(at + 1) % CYCLE.length];
  world.challenge = next;
  return next;
}

/** Which challenge this world is flying, or '' for none. */
export function activeOf(world) {
  return world.challenge === undefined ? '' : world.challenge;
}

/** Is *this* the challenge flying? The one question every lever below asks. */
export function isFlying(world, id) {
  return activeOf(world) === id;
}

// ---------------------------------------------------------------------------
// The levers. Each one is asked where the number it changes is already read.
// ---------------------------------------------------------------------------

/**
 * The hull the ship stands on, when a challenge says one, or 0 when none does.
 *
 * 0 and not the ship's own number, so the caller's `if (hull > 0)` reads as "if a challenge spoke"
 * and an ordinary run is written by exactly the two hands that always wrote it - the ship's row and
 * the hangar's plating (game/run.js). What it replaces is the *starting* hull and its ceiling: a
 * heal still has nothing above it to reach, which is the whole of what "one hull" means, and an
 * elite's gift heals nothing because there is nothing to heal into.
 */
export function hullOverrideOf(world) {
  return isFlying(world, 'brittle') ? challengeRow('brittle').hull : 0;
}

/**
 * May this ship jump? `false` is not "the dash is on cooldown", and callers must not treat it as
 * such: the interface asks so that it can stop promising a dash that will never come.
 */
export function dashIsAllowed(world) {
  return !isFlying(world, 'grounded') || challengeRow('grounded').dash !== false;
}

/**
 * What a body's speed - and an enemy shot's - is multiplied by. 1 for every run that is not flying
 * the swift crowd, which is the reason the reference run has never noticed this line.
 *
 * One number for both, because the claim the card makes is one claim: everything that comes at you
 * travels that much quicker. A boss's *beats* are not here - they are timed by the fight's own
 * clocks (game/bosses.js), and a telegraph sped up is a pattern nobody can learn, which is the one
 * thing this rule must not do.
 */
export function crowdSpeedOf(world) {
  return isFlying(world, 'swift') ? challengeRow('swift').speedMul : 1;
}

/**
 * What the arena may hold at once is multiplied by: its wave director's budget and its wall on
 * standing bodies, both applied in game/waves.js. 1 for every run that is not flying a thick crowd.
 *
 * One number for both walls on purpose - see the row in `BALANCE.challenges`. The curve the budget
 * walks is left alone, so the crowd still *grows* between the bosses exactly as it does plainly; what
 * the rule changes is how high that curve is allowed to get before it stops, which is the difference
 * between a late run that settles and one that keeps filling up.
 *
 * The endless wall on standing bodies is not behind this lever. Endless already lifts the crowd past
 * the schedule's ceiling with its own clock (game/endless.js) and that ceiling is a frame budget that
 * has been measured on a real frame; a second multiplier on top of it would be a crowd nobody has
 * timed.
 */
export function crowdHoldOf(world) {
  return isFlying(world, 'thick') ? challengeRow('thick').holdMul : 1;
}

/**
 * Can a card on this line do anything in a run flying this challenge?
 *
 * Two lines are gated on the dash - the tether ties its cords at the moment a dash is granted and
 * the afterimage throws its images down the streak one leaves - and under NO DASH they can never
 * fire. A card that can do nothing is not a small choice, it is no choice: the run pays a level to
 * find that out and gives up the level the card would have been worth. game/upgrades.js refuses them
 * for the same reason it refuses a line the ship's gun cannot spend, and for the same price: the
 * deck is a little smaller, which was measured before it was agreed (NOTES session 119).
 */
export function cardIsUsable(world, lineId) {
  const gated = BALANCE.challenges.gatedOn;
  for (const id of Object.keys(gated)) {
    if (!isFlying(world, id)) continue;
    if (gated[id].indexOf(lineId) >= 0) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// The records. What this save has scored under each rule, kept the way the day keeps its own
// (game/daily.js): a read of storage at an ending, and a read of storage when a title is painted -
// never a read during a step, and nothing cached into the world.
// ---------------------------------------------------------------------------

/**
 * The whole ledger out of the save: challenge id -> the best score flown under it. A rule that is not
 * in here has never been flown, which is an answer and not a hole - there is no zero to beat yet.
 *
 * Read whole rather than one rule at a time because two of the three readers want all of them: the
 * codex's rack has a row per rule, and the store hands back the map as one field anyway.
 */
export function bestsFromSave() {
  return section('challenges', { bests: {} }).bests;
}

/** The best this save has flown under one rule: 0 for a rule nobody has flown, and for no rule at all. */
export function bestOf(id) {
  if (nameOf(id) === '') return 0;
  const best = bestsFromSave()[id];
  return best === undefined ? 0 : best;
}

/**
 * Bank this run against the rule it was flown under (game/run.js `bankRun` is the only caller, and it
 * calls once per ending). False when there was nothing to bank - an ordinary run, or a run that did not
 * beat what the rule already had - and true when the rule has a new best, which is what lights the
 * card's own words.
 *
 * The same bargain the day strikes above it in `bankRun`, and for the same reason: a run that is won,
 * handed back and finally goes down is banked twice, and the second ending only wins if the run came
 * out bigger than its first one, which it nearly always has.
 */
export function bankChallenge(world) {
  const id = activeOf(world);
  if (id === '') return false;
  if (world.score <= bestOf(id)) return false;
  const bests = bestsFromSave();
  bests[id] = world.score;
  remember('challenges', { bests: bests });
  return true;
}

// ---------------------------------------------------------------------------
// The words. One place says each of these, and every other reader asks here.
// ---------------------------------------------------------------------------

/** The name of the challenge an id names - `''` for no challenge, which has no name. */
export function nameOf(id) {
  for (const challenge of CHALLENGES) {
    if (challenge.id === id) return challenge.name;
  }
  return '';
}

/** What the rule does, in the sentence the glass prints under its name. */
/**
 * What the rule does, in the sentence the glass prints under its name.
 *
 * Two rules have a sentence built out of their own number rather than written beside it, so a number
 * cannot move and leave the words behind: 1.4 reads 40% faster and nothing else. A rule in the table
 * with an empty `says` and no builder in `SENTENCES` is a bug and not a silent blank - the glass would
 * print a name with nothing under it - and test/challenges.test.mjs asks every rule what it has to
 * say, so it cannot be shipped either way.
 */
const SENTENCES = {
  swift: (world) => 'the crowd travels ' + percentOf(crowdSpeedOf(world) - 1) + ' faster',
  thick: (world) => 'the arena holds ' + percentOf(crowdHoldOf(world) - 1) + ' more of the crowd',
};

/** How a share reads as a percentage: four tenths of a thing is "40%" of it. */
function percentOf(share) {
  return Math.round(share * PERCENT) + '%';
}

export function saysOf(id) {
  if (id === '' || id === undefined) return '';
  const challenge = CHALLENGES.find((c) => c.id === id);
  if (challenge === undefined) return '';
  if (challenge.says !== '') return challenge.says;
  const build = SENTENCES[id];
  return build === undefined ? '' : build({ challenge: id });
}

/**
 * What a rule's record is worth in words, or '' when there is nothing to say about it yet. Said the
 * same way on the title and on a card, because it is the same number in both places: the best this
 * save has flown under that rule, or the fact that this run just set it (game/daily.js's card line
 * makes the same pair about the day, and for the same reason - a new best and a standing one are two
 * different answers to "what did I just do").
 *
 * "FOR THIS RULE" is not padding: a card with an all-time BEST a hand's width above it would otherwise
 * print the same word twice over with two different numbers under it.
 */
function recordWords(id, isNew) {
  const best = bestOf(id);
  if (best === 0) return '';
  if (isNew === true) return 'NEW BEST FOR THIS RULE';
  return best.toLocaleString('en-US') + ' BEST FOR THIS RULE';
}

/**
 * What the title says about the next run, or '' when there is nothing to say - and an empty line
 * takes its space with it, so a title with no challenge on it is the title it always was.
 *
 * The record rides on the end of it when the save has one, which is the point of the whole feature: the
 * key that sets a rule shows what that rule is worth to this save, so what is being chosen is a number
 * to beat and not just a harder night.
 */
export function titleWords(world) {
  const id = activeOf(world);
  if (id === '') return '';
  const words = 'CHALLENGE  ' + nameOf(id) + '  \u00b7  ' + saysOf(id);
  const record = recordWords(id, false);
  return record === '' ? words : words + '  \u00b7  ' + record;
}

/**
 * The mark beside the run's clock while it is flying under a rule: `ONE HULL`, and nothing else.
 * Short, because it shares that line with the clock, the endless word and the day.
 */
export function hudWords(world) {
  const id = activeOf(world);
  return id === '' ? '' : nameOf(id);
}

/**
 * What an ending's card says about the rules its run was flown under, or '' for an ordinary run.
 * Said after the score and the best, before the day: the rule is the biggest fact about a run that
 * had one, and a score quoted without it would be quoted wrong.
 *
 * Takes the world or an ending's summary, as game/daily.js's `cardWords` does - and the summary says
 * `newChallengeBest` the same way it says `newDailyBest`, because "did that one count" is the first
 * thing anybody asks of a score.
 */
export function cardWords(run) {
  const id = activeOf(run);
  if (id === '') return '';
  const words = 'CHALLENGE \u00b7 ' + nameOf(id) + ' \u00b7 ' + saysOf(id);
  const record = recordWords(id, run.newChallengeBest);
  return record === '' ? words : words + ' \u00b7 ' + record;
}

/**
 * One row on the pause's rack for a run flying under a rule, and null for one that is not - which is
 * how the rack leaves the row out (ui/screens.js `factLines`).
 */
export function pauseWords(run) {
  const id = activeOf(run);
  if (id === '') return null;
  return { name: 'CHALLENGE', says: nameOf(id) };
}
