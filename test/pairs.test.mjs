// The statistics the ladders rank themselves on (tools/headless/pairs.js).
//
// Everything in `tools/` that prices a rule or a card appetite compares two batches, and until this
// module existed every one of them did it by dividing one middle score by the other. These tests are
// the argument for the change: a middle of a batch of runs moves by tens of percent between one seed
// count and the next, and a ladder whose tolerance is a tenth is ranking noise. The pair test is not
// smarter in general - it is blind to size on purpose - but it cannot be moved by a single lucky run,
// and it can say "this batch cannot tell the two builds apart", which a quotient of two medians never
// can.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIDENCE, median, signTest, pairedRatio, isBetter, isWorse, isUndecided, pairWords,
} from '../tools/headless/pairs.js';

/** P(X <= r) for X ~ Binomial(n, 1/2), worked out the slow obvious way for the test to check against. */
function coinTail(n, r) {
  // Exact combinations, no recurrence: the test is checking the ladder's shortcut, so it may be dumb.
  const choose = (n2, k) => {
    let out = 1;
    for (let i = 1; i <= k; i++) out = out * (n2 - k + i) / i;
    return out;
  };
  let sum = 0;
  for (let k = 0; k <= r; k++) sum += choose(n, k);
  return sum / Math.pow(2, n);
}

test('the middle of nothing is nothing, and the middle of an even list is the upper of the two', () => {
  assert.equal(median([]), null);
  assert.equal(median([7]), 7);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 3, 'the upper middle, which is what every ladder here used');
  assert.equal(median([4, 1, 3, 2]), 3, 'and it does not care what order they came in');
});

test('a coin lands how a coin lands', () => {
  assert.equal(signTest(0, 0), 1, 'nothing to compare is no evidence at all');
  assert.equal(signTest(1, 1), 1, 'a split even is a split a coin makes every time');
  assert.equal(signTest(6, 6), 1, 'and bigger does not make an even split more interesting');

  // The textbook numbers, one at a time: two seeds both the same way is a quarter of the four ways
  // there are, times two because either way would have done.
  assert.ok(Math.abs(signTest(2, 0) - 0.5) < 1e-12);
  assert.ok(Math.abs(signTest(4, 0) - 0.125) < 1e-12);
  assert.ok(Math.abs(signTest(10, 0) - 2 / 1024) < 1e-12);

  // And a worked example against the slow way, which is the check that the recurrence is the sum.
  // The number of tosses is the two sides together, which is the easy thing to get wrong here.
  assert.ok(Math.abs(signTest(20, 6) - 2 * coinTail(26, 6)) < 1e-12);
  assert.ok(Math.abs(signTest(31, 12) - 2 * coinTail(43, 12)) < 1e-12);
});

test('which side won is not the question the test asks', () => {
  assert.equal(signTest(9, 3), signTest(3, 9));
  assert.equal(signTest(28, 4), signTest(4, 28));
  // More seeds of the same split is more evidence, never less.
  assert.ok(signTest(14, 6) < signTest(7, 3));
  assert.ok(signTest(21, 9) < signTest(14, 6));
});

test('a batch shows a difference when the seeds agree, not when one seed shouts', () => {
  // This is the whole reason the module exists. The two middles say the first build is worth a tenth
  // less; the seeds say one seed liked it and four did not, which is a coin.
  const loud = new Map([[1, 1000], [2, 10], [3, 10], [4, 10], [5, 10]]);
  const calm = new Map([[1, 900], [2, 11], [3, 11], [4, 11], [5, 11]]);
  assert.ok(median([1000, 10, 10, 10, 10]) < median([900, 11, 11, 11, 11]),
    'the middles do say the loud batch is worse');

  const pair = pairedRatio(loud, calm);
  assert.equal(pair.seeds, 5);
  assert.equal(pair.compared, 5);
  assert.deepEqual([pair.wins, pair.losses, pair.ties], [1, 4, 0]);
  assert.ok(pair.p > CONFIDENCE, 'and the pairs refuse to call it: ' + pair.p);
  assert.ok(isUndecided(pair), 'not better, not worse - undecided');
  assert.ok(pair.medianRatio < 1, 'the size still leans the other way, and judges nothing on its own');
});

test('the same edge on every seed is the difference the pair can see', () => {
  const a = new Map([[1, 102], [2, 204], [3, 306], [4, 408], [5, 510], [6, 612],
    [7, 714], [8, 816], [9, 918], [10, 1020], [11, 1122], [12, 1224]]);
  const b = new Map([[1, 100], [2, 200], [3, 300], [4, 400], [5, 500], [6, 600],
    [7, 700], [8, 800], [9, 900], [10, 1000], [11, 1100], [12, 1200]]);
  const pair = pairedRatio(a, b);
  assert.equal(pair.wins, 12);
  assert.equal(pair.losses, 0);
  assert.ok(pair.p < CONFIDENCE, 'twelve seeds all the same way is a difference: ' + pair.p);
  assert.ok(isBetter(pair));
  assert.equal(isWorse(pair), false);
  assert.ok(Math.abs(pair.medianRatio - 1.02) < 1e-9, 'the size is the per-seed ratio, not the ratio of middles');
});

test('only the seeds both sides flew are compared, and a seed that scored nothing divides nothing', () => {
  const a = new Map([[1, 500], [2, 300], [3, 100], [4, 0], [5, 700], [7, 200]]);
  const b = new Map([[1, 400], [2, 300], [3, 200], [4, 0], [5, 0], [6, 900]]);
  const pair = pairedRatio(a, b);
  assert.equal(pair.seeds, 5, 'seed 7 alone on one side and 6 alone on the other are not compared');
  assert.equal(pair.wins, 2, 'including the seed where the other build scored nothing at all');
  assert.equal(pair.losses, 1);
  assert.equal(pair.ties, 2, 'the two ties are seed 2 and the two runs that both scored nothing');
  assert.equal(pair.medianRatio, 1,
    'the middle of the three seeds that could be divided - 1.25, 1, 0.5 - and seed 5 is not one of them');
  assert.ok(isUndecided(pair), 'two seeds against two is nothing');
});

test('an appetite that wins every seed it can is shown to be worth something', () => {
  // The shape the `aware` reading came back with: the same seeds, one build preferred on most of them.
  const die = new Map();
  const ship = new Map();
  for (let seed = 1; seed <= 24; seed++) {
    const base = 1000 * seed;
    die.set(seed, base);
    ship.set(seed, seed % 8 === 0 ? base * 0.7 : base * 1.3);
  }
  const pair = pairedRatio(ship, die);
  assert.equal(pair.wins, 21);
  assert.equal(pair.losses, 3);
  assert.ok(isBetter(pair));
  assert.match(pairWords(pair), /^21 of 24 seeds, p = /);
});

test('one seed can score five times as much under the harder rule, which is why no size comes from ratios', () => {
  // Not a made-up shape. This is ONE CARD against plain, six seeds, the aware hand answering on purpose,
  // measured 2026-10-17: 1.20x, 0.24x, 0.56x, 0.15x, 4.05x and 5.14x. A run of this game is a chaotic
  // trajectory - change what the rack deals and the whole twenty minutes goes somewhere else - so the
  // middle of those ratios is 1.20x, i.e. the harder rule looking *worth more*, while half the seeds
  // preferred the plain build and the batch middles put the rule at 0.65x of a run. Session 158's note on
  // this file suggested a per-seed ratio as an honest size; this is the flight that retired the idea, and
  // the split is what survived it.
  const plain = new Map([[1, 49835], [2, 62657], [3, 39405], [4, 36758], [5, 13836], [6, 11920]]);
  const rule = new Map([[1, 60021], [2, 14908], [3, 22060], [4, 5440], [5, 55982], [6, 61265]]);
  const pair = pairedRatio(rule, plain);
  assert.deepEqual([pair.wins, pair.losses, pair.ties], [3, 3, 0]);
  assert.ok(pair.medianRatio > 1,
    'the middle of the per-seed ratios says the harder rule was worth more: ' + pair.medianRatio);
  assert.ok(isUndecided(pair), 'and the honest answer to "by how much" is that these seeds cannot say');
});

test('a rule that only fires on some seeds is still shown by the count', () => {
  // The SHORT GRACE shape measured on 24 seeds (NOTES session 159): thirteen of those runs were never hit
  // twice, so they score the same whichever gap the rule leaves the ship, and the middle of every seed's
  // ratio sits exactly on 1.00x - "this rule changes nothing" - while all eleven seeds the rule did bite
  // say it took something. The count is the finding, and its p is a shown difference; the size of those
  // ratios is not, which is why the challenge ladder quotes batch middles and lets a pair like this say
  // only whether the cost is real.
  const plain = new Map();
  const rule = new Map();
  for (let seed = 1; seed <= 24; seed++) {
    plain.set(seed, 1000);
    rule.set(seed, seed <= 11 ? 500 : 1000);
  }
  const pair = pairedRatio(rule, plain);
  assert.equal(pair.ties, 13, 'the runs that were never hit twice');
  assert.deepEqual([pair.compared, pair.wins, pair.losses], [11, 0, 11]);
  assert.equal(pair.medianRatio, 1, 'the all-seed middle is exactly the untouched runs');
  assert.ok(pair.p < CONFIDENCE, 'and eleven seeds all one way is a shown split: ' + pair.p);
  assert.ok(isUndecided(pair), 'isWorse keeps its eye on the all-seed middle, which is the conservative '
    + 'question: a rule only bites the runs it is asked about');
});

test('a pair says what it said, in words a ladder can print', () => {
  assert.equal(pairWords(pairedRatio(new Map([[1, 5]]), new Map([[1, 4]]))),
    '1 of 1 seeds, p = 1.000');
  const twelve = new Map();
  const one = new Map();
  for (let seed = 1; seed <= 12; seed++) { twelve.set(seed, 900); one.set(seed, 100); }
  assert.match(pairWords(pairedRatio(twelve, one)), /^12 of 12 seeds, p = <0\.001$/);
  assert.match(pairWords(pairedRatio(new Map([[1, 1]]), new Map([[2, 1]]))),
    /none of the 0 seeds it shared could be compared/);
});
