// The bot's card taste (tools/headless/bot.js TASTE) and the verdict of the ladder that measures it
// (tools/pick-taste.js).
//
// Both halves are about the instrument and not the game. The first is the claim that what the bot
// reaches for at a level-up is written down somewhere and can be changed from there - which is what
// makes it a thing a ladder can sweep rather than a habit hidden in a helper. The second is the claim
// `tools/challenge-cost.js` ends up leaning on: that a hand which cannot be *shown* to pick better than a
// die cannot price a rule about taking a pick away, and that a written-down taste which loses to another
// one on a given pair of hands is a finding and not a rounding error. NOTES session 157 is why: the
// careful picker scored *under* its own die on the `human` hands and nobody had ever asked.
//
// The third is the one session 158 added and this one undid: a taste is ranked seed against seed, not by
// dividing the middle of one batch by the middle of another. Every row below therefore carries the seeds
// it flew, and the fixtures are built to say which seeds preferred which build - because the reading that
// started this (0.91x on 32 seeds, 1.18x on 12) was two middles disagreeing with each other.
//
// The rows the verdict is given below are made up. They are the shapes the ladder can come back with.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PICKS, TASTE, setTasteDial } from '../tools/headless/bot.js';
import { newRanks } from '../src/game/upgrades.js';
import { verdictOf, BUILDS } from '../tools/pick-taste.js';

/** The shipped taste, so a test that bends it can put it back. */
const SHIPPED = { appetite: TASTE.appetite.slice(), deferred: Object.assign({}, TASTE.deferred) };

/** Put the taste back after a test that needed to change it. */
function withTaste(dial, body) {
  setTasteDial(SHIPPED);
  try {
    if (dial !== null) setTasteDial(dial);
    return body();
  } finally {
    setTasteDial(SHIPPED);
  }
}

/** A ship with the ranks the test names, and nothing else - the whole of what the picker reads. */
function ship(ranks) {
  const build = newRanks();
  for (const id of Object.keys(ranks)) build[id] = ranks[id];
  return { world: { upgrades: build } };
}

/** What the picker takes from a table of cards, with the taste the test asked for. */
function pick(dial, ranks, offer) {
  return withTaste(dial, () => PICKS.wise(ship(ranks), offer));
}

test('the taste is one dial, and it says no to a value it cannot mean', () => {
  assert.deepEqual(Object.keys(TASTE).sort(), ['appetite', 'deferred'],
    'a taste the ladder can sweep is a taste with all of it in one place');

  assert.equal(setTasteDial({ deferred: { orbitals: 0 } }).deferred.orbitals, 0);
  assert.deepEqual(setTasteDial({ appetite: ['nova'] }).appetite, ['nova']);

  assert.throws(() => setTasteDial({ panic: 3 }), /no knob called panic/);
  assert.throws(() => setTasteDial({ deferred: { orbitals: 'late' } }), /orbitals wants a number/);
  assert.throws(() => setTasteDial({ deferred: { orbital: 2 } }), /no upgrade line is called orbital/);
  assert.throws(() => setTasteDial({ deferred: [] }), /wants a name -> number map/);
  assert.throws(() => setTasteDial({ appetite: ['orbital'] }), /no upgrade line is called orbital/);
  assert.throws(() => setTasteDial({ appetite: 4 }), /appetite wants a list of line names/);
  assert.throws(() => setTasteDial({ appetite: [null] }), /is not one/);

  // The dial is handed back so a caller can put it back the way it found it.
  assert.equal(setTasteDial(SHIPPED), TASTE);
  assert.deepEqual(TASTE.appetite, SHIPPED.appetite, 'and putting it back really did put it back');
});

test('a run picks by the dial it was given and not by the one the last row left behind', () => {
  // The orbital ring, held two ranks back: on this table the gun line is shallower *after* the
  // handicap, so the shipped taste takes the gun and waits for the ring.
  const offer = ['orbitals', 'damage'];
  assert.equal(pick(null, { damage: 1 }, offer), 'damage', 'the ring is held back');
  // The same table with the ring unbent is the `nodefer` row of the ladder: now the ring really is
  // the shallowest line on the table, and the same picker reaches for it.
  assert.equal(pick({ deferred: {} }, { damage: 1 }, offer), 'orbitals', 'the ring is bought level');
});

test('the appetite order is what breaks a tie, and an empty one is a real opinion', () => {
  // Two lines, both untouched: the shipped order has pierce above fire rate, and NOTES sessions 31
  // and 32 are why (a turn needs one body anywhere; a pass needs the crowd in a column).
  assert.equal(pick(null, {}, ['fireRate', 'pierce']), 'pierce');
  assert.equal(pick(null, {}, ['pierce', 'fireRate']), 'pierce', 'and not whichever came first');

  // `flat` is the ladder's control: no order at all, so the tie goes to the first card face up and
  // the picker is only "spread the build out" with nothing said about which line.
  assert.equal(pick({ appetite: [], deferred: {} }, {}, ['fireRate', 'pierce']), 'fireRate');
});

test('the lines a build names are lines the deck has', () => {
  // A dial made of names nobody can check is a dial that silently does nothing. The lines the ladder
  // writes into its rows have to exist, and this is the cheapest place to find out.
  for (const name of ['damage', 'fireRate', 'bulletSpeed', 'split', 'pierce', 'ricochet',
    'orbitals', 'nova']) {
    assert.equal(pick({ appetite: [name], deferred: {} }, {}, [name, 'damage']),
      name === 'damage' ? 'damage' : name, name + ' is a line the picker can be told to want');
  }
});

test('every row the ladder can fly is a taste the bot can be given, and states both its numbers', () => {
  // The dial is one global and the ladder flies its rows through one booted game, so a row that leaves
  // a number out does not mean "the shipped value" - it means "whatever the row before me left
  // behind", which is a row that measured something nobody asked about. So every row states both.
  const names = Object.keys(BUILDS);
  assert.ok(names.includes('die'), 'and there is a floor to measure the tastes against');
  assert.ok(names.includes('ship'), 'and the shipped taste is one of the rows');
  for (const name of names) {
    const taste = BUILDS[name].taste;
    assert.ok(Array.isArray(taste.appetite), name + ' states an appetite list');
    assert.equal(typeof taste.deferred, 'object', name + ' states the handicap map');
    assert.equal(Array.isArray(taste.deferred), false, name + "'s handicap is a map");
    // And it really is acceptable: a row the dial would refuse is a row that never got flown.
    assert.equal(setTasteDial(taste), TASTE, name + ' is a taste the bot will take');
  }
  setTasteDial(SHIPPED);
  assert.deepEqual(TASTE.appetite, SHIPPED.appetite, 'and the ladder can put it back');
});

/** One row of what a ladder comes back with: the seeds it flew and the columns the table prints. */
function row(build, scores, middleDeath) {
  return {
    build,
    policy: 'human',
    bySeed: new Map(scores),
    middleScore: medianOf(scores.map((s) => s[1])),
    middleDeath: middleDeath === undefined ? null : middleDeath,
    died: middleDeath === undefined ? 0 : 1,
    bestScore: Math.max(...scores.map((s) => s[1])),
    middleLevel: 20,
    middleArea: 1,
    middleLines: 8,
    hulls: 12,
  };
}

/** The same upper-middle the ladder uses, so a fixture's `middle score` means what the column means. */
function medianOf(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Twenty-four seeds scored by one rule, which is how every fixture below is built. */
function seeds(n, what) {
  const out = [];
  for (let seed = 1; seed <= n; seed++) out.push([seed, Math.round(what(seed))]);
  return out;
}

/** The plain die: every seed worth what the test says it was worth before anything picked for it. */
function die(n, base) {
  return seeds(n, (seed) => seed * base);
}

/** The batch the verdict is asked about: a die, the shipped taste, and two other written-down tastes. */
function batch(ship, area) {
  return [row('die', die(24, 1000), 250), row('ship', ship, 210),
    row('flat', seeds(24, (seed) => seed * 1000), 220), row('area', area, 230)];
}

/** The shipped taste winning on 21 seeds of 24 and losing on every eighth, which is what `aware` did. */
const WINNER = seeds(24, (seed) => (seed % 8 === 0 ? seed * 700 : seed * 1300));
/** The shipped taste winning half and losing half: a coin, which is what `human` came back as. */
const COIN = seeds(24, (seed) => (seed % 2 === 0 ? seed * 1400 : seed * 950));
/** The shipped taste losing on twenty seeds of twenty-four: a die that beat it. */
const LOSER = seeds(24, (seed) => (seed % 12 <= 9 ? seed * 800 : seed * 1200));

test('a taste the seeds agree on is worth something, and is said to be', () => {
  const verdict = verdictOf(batch(WINNER, seeds(24, (seed) => seed * 900)), 'aware');
  assert.deepEqual(verdict.problems, [], 'nothing beat the shipped taste here');
  assert.equal(verdict.lines.length, 1);
  assert.match(verdict.lines[0], /worth a middle of 1\.30x a run per seed/);
  assert.match(verdict.lines[0], /21 of 24 seeds/);
  assert.match(verdict.lines[0], /can use a choice/);
});

test('a taste the seeds cannot tell from a die is a finding and not a failure', () => {
  // The reading that started all this: the middles said 0.91x on 32 seeds and 1.18x on 12, and what the
  // seeds actually said was "I cannot tell". That is a different answer and it is the usable one.
  const verdict = verdictOf(batch(COIN, seeds(24, (seed) => seed * 900)), 'human');
  assert.deepEqual(verdict.problems, [], 'the ladder was not beaten, it was shown an empty hand');
  assert.match(verdict.lines[0], /cannot tell the two apart/);
  assert.match(verdict.lines[0], /no taste to price/);
  assert.equal(verdict.notes.length, 1);
  assert.match(verdict.notes[0], /could not be told from its own die/);
});

test('a taste a die beats is a failure and not a shrug', () => {
  // The case the old ladder hid: `taste <= 1` was a note, so a written-down appetite that was worse
  // than rolling looked exactly like one that could not be measured. It is not the same finding.
  const verdict = verdictOf(batch(LOSER, seeds(24, (seed) => seed * 900)), 'human');
  // Three failures, and they are the same failure three times: the appetite is under its own die, and so
  // is every other written-down taste on the table - which is the ladder saying that *something* about
  // these hands is wrong rather than pointing at one row.
  assert.equal(verdict.problems.length, 3, verdict.problems.join(' / '));
  assert.match(verdict.problems[0], /is worth less than rolling a die/);
  assert.match(verdict.problems[1], /the build `flat` is worth a middle of 1\.25x/);
  assert.match(verdict.lines[0], /The die beat it/);
});

test('a written-down taste that beats the shipped one on the seeds is a failure', () => {
  // The answer this file exists to be able to print: the ring taken early is worth three tenths more on
  // these hands than the appetite that ships, on 22 seeds of 24, which is not a rounding error.
  const area = seeds(24, (seed) => seed * 1690);
  const verdict = verdictOf(batch(WINNER, area), 'human');
  assert.equal(verdict.problems.length, 1, verdict.problems.join(' / '));
  assert.match(verdict.problems[0], /^on the human hands the build `area` is worth a middle of 1\.30x/);
  assert.match(verdict.problems[0], /the table says which one is/);
});

test('a better taste inside the size bar is not a finding, even on every seed', () =>
{
  // Two per cent on all twenty-four seeds: the sign test is delighted and the ladder does not care,
  // because a difference nobody can feel is not a reason to rewrite the appetite.
  const area = seeds(24, (seed) => seed * 1020);
  const verdict = verdictOf(batch(seeds(24, (seed) => seed * 1000), area), 'human');
  assert.deepEqual(verdict.problems, [], verdict.problems.join(' / '));
});

test('a taste that beats the die when the shipped one cannot is a finding too', () => {
  // Head to head the two tastes are hard to tell apart - both are near a die - but one of them is not,
  // and a ladder that only compared the shipped taste with its rivals would have missed it.
  const area = seeds(24, (seed) => (seed % 12 === 0 ? seed * 1000 : seed * 1300));
  const verdict = verdictOf(batch(COIN, area), 'human');
  assert.equal(verdict.problems.length, 1, verdict.problems.join(' / '));
  assert.match(verdict.problems[0], /the build `area` beats the die/);
  assert.match(verdict.problems[0], /the shipped taste does not/);
});

test('a batch too small to rank anything says so instead of giving a verdict', () => {
  const small = [row('die', die(4, 1000), 250), row('ship', seeds(4, (seed) => seed * 3000), 210)];
  const verdict = verdictOf(small, 'human');
  assert.deepEqual(verdict.problems, [], 'no verdict, however flattering');
  assert.deepEqual(verdict.lines, [], 'and nothing printed as one');
  assert.match(verdict.notes[0], /4 shared seeds is below the 8/);
});

test('a table with no die row cannot say what a taste is worth', () => {
  const verdict = verdictOf([row('ship', WINNER, 200), row('area', WINNER, 210)], 'human');
  assert.deepEqual(verdict.problems, []);
  assert.deepEqual(verdict.lines, []);
  assert.match(verdict.notes[0], /`die` and `ship` both have to be in the table/);
});

test('a die that scored nothing has no ratios to judge', () => {
  const verdict = verdictOf([row('die', die(24, 0), 200), row('ship', WINNER, 200)], 'human');
  assert.deepEqual(verdict.problems, []);
  assert.deepEqual(verdict.lines, []);
  assert.match(verdict.notes[0], /scored nothing on any seed/);
});
