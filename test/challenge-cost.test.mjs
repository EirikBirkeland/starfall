// The verdict of the challenge ladder (tools/challenge-cost.js).
//
// The ladder itself takes minutes of simming and is run by hand, the way every ladder in tools/ is.
// What lives here is the promise underneath it: that a rule which scores *better* than plain is
// reported as a failure, that a rule which lets the batch live longer than plain is reported as a
// failure too, that a rule the ladder cannot see is said out loud rather than passed in silence, and
// that NO DASH is never judged by a bot that barely presses the jump. Those four claims are prose in
// the tool's output and a decision in its code, and a decision nobody can run is a decision nobody
// can keep.
//
// The rows below are made up. They are the shapes the ladder can come back with.

import test from 'node:test';
import assert from 'node:assert/strict';
import { verdictOf } from '../tools/challenge-cost.js';
import { nameOf } from '../src/game/challenges.js';

/** One row of what a batch reports, with the parts this file does not care about filled in. */
function row(id, middleScore, middleDeath, hulls, died) {
  return {
    id,
    middleScore,
    middleDeath: middleDeath === undefined ? null : middleDeath,
    hulls: hulls === undefined ? 0 : hulls,
    bestScore: middleScore,
    level: 1,
    died: died === undefined ? 1 : died,
    won: 0,
    fights: 0,
  };
}

const PLAIN = row('none', 100000, 300, 12);

/**
 * Every problem line that names this rule, so a test can ask about one rule at a time.
 *
 * Matched on the name and not the id, because a verdict is prose read out loud and says what the glass
 * says (`ONE HULL`, not `brittle`) - which a helper matching ids in capitals would have quietly missed
 * for the two rules whose names do not begin with their own id.
 */
function problemsAbout(verdict, id) {
  return verdict.problems.filter((line) => line.startsWith(nameOf(id)));
}

test('a rule that is paid for is passed, and a rule that pays nothing is failed', () => {
  const honest = verdictOf([PLAIN, row('brittle', 40000, 120, 12), row('swift', 45000, 200, 12)], PLAIN);
  assert.deepEqual(honest.problems, [], 'both rules scored below plain and died sooner');

  // 1.2x plain: the batch scored *more* under a rule that claims to make the run harder. That is not
  // a hard rule, whatever its card says, and the ladder has to say so instead of admiring the number.
  const soft = verdictOf([PLAIN, row('swift', 120000, 200, 12)], PLAIN);
  assert.equal(problemsAbout(soft, 'swift').length, 1, 'one line, about this rule and no other');
  assert.match(problemsAbout(soft, 'swift')[0], /1\.20x plain/);
  assert.match(problemsAbout(soft, 'swift')[0], /flavour setting/);
});

test('a rule that lets the batch outlive the plain one is failed whatever it scored', () => {
  // Score is the honest column and the length of a run is the dishonest one: a rule that read as a
  // bargain on score while every run lasted longer than plain is buying its way into the batch, and
  // the `died` column is where that shows (the same claim `tools/run-shape.js` makes about a run).
  const slower = verdictOf([PLAIN, row('swift', 90000, 340, 12)], PLAIN);
  assert.equal(problemsAbout(slower, 'swift').length, 1);
  assert.match(problemsAbout(slower, 'swift')[0], /outlasts the plain batch/);

  // A batch where nobody died has no middle of deaths at all, and a missing number is not a failure.
  const unwounded = verdictOf([row('none', 100000, null, 12), row('swift', 90000, null, 12)],
    row('none', 100000, null, 12));
  assert.deepEqual(unwounded.problems, []);
});

test('a rule the ladder cannot see is said out loud and never quietly passed', () => {
  // An aware bot that finished every run with hull to spare never touched the rule that makes a hull
  // cost everything: ONE HULL then reads as a free rule, and the honest answer is that this ladder
  // is blind rather than that the rule is soft.
  const blind = verdictOf([row('none', 100000, 300, 0), row('brittle', 99000, 300, 0)],
    row('none', 100000, 300, 0));
  assert.deepEqual(problemsAbout(blind, 'brittle'), [], 'nothing was lost, so nothing was judged');
  assert.equal(blind.skipped.length, 1, 'and the blindness is printed');
  assert.match(blind.skipped[0], /ONE HULL is not measurable/);
  assert.match(blind.skipped[0], /lost no hulls/);

  // The same rule read by a hand that does lose hulls, and the blind eye is gone.
  const seeing = verdictOf([PLAIN, row('brittle', 39000, 90, 12)], PLAIN);
  assert.deepEqual(seeing.skipped, []);
  assert.deepEqual(seeing.problems, []);
});

test('SHORT GRACE needs the same wounded batch as ONE HULL, and is judged without it', () => {
  // The other rule about what a touch costs. A batch nobody wounded cannot see touches arriving in
  // clusters either, so it stands aside on the same proviso - and is judged the moment the batch can.
  const blind = verdictOf([row('none', 100000, 300, 0), row('merciless', 99000, 300, 0)],
    row('none', 100000, 300, 0));
  assert.deepEqual(problemsAbout(blind, 'merciless'), [], 'nothing was lost, so nothing was judged');
  assert.equal(blind.skipped.length, 1, 'and the blindness is printed');
  assert.match(blind.skipped[0], /SHORT GRACE is not measurable/);

  const soft = verdictOf([PLAIN, row('merciless', 97000, 300, 12)], PLAIN);
  assert.equal(problemsAbout(soft, 'merciless').length, 1, 'a wounded batch judges it');
  assert.match(problemsAbout(soft, 'merciless')[0], /0\.97x plain/);

  const honest = verdictOf([PLAIN, row('merciless', 77000, 191, 12)], PLAIN);
  assert.deepEqual(honest.problems, []);
  assert.deepEqual(honest.skipped, []);
});

test('a rule about the crowd is judged whatever the hull column says', () => {
  // ONE HULL needs a batch that actually loses hulls before the ladder can see it. A rule about the
  // crowd needs nothing of the sort - a crowd is in front of every pair of eyes, careless or not - so
  // a thick crowd that scores over the bar is a failure even on a batch nobody wounded, and one that
  // is paid for is passed without a word about what the ladder could or could not see.
  const blind = row('none', 100000, 300, 0);
  const soft = verdictOf([blind, row('thick', 97000, 300, 0)], blind);
  assert.equal(problemsAbout(soft, 'thick').length, 1);
  assert.match(problemsAbout(soft, 'thick')[0], /0\.97x plain/);
  assert.deepEqual(soft.skipped, [], 'nothing was stood aside');

  const honest = verdictOf([blind, row('thick', 60000, 200, 0)], blind);
  assert.deepEqual(honest.problems, []);
  assert.deepEqual(honest.skipped, []);
});

test('NO DASH is reported and never judged, because no bot here lives on the jump', () => {
  // 1.4x plain would fail any other rule. Under NO DASH the number is printed and the verdict is
  // held back: what the jump is worth is a question about a person's hands, and this hand presses it
  // a handful of times a quarter hour, while the deck loses the two lines that fire off it.
  const grounded = verdictOf([PLAIN, row('grounded', 140000, 400, 12)], PLAIN);
  assert.deepEqual(grounded.problems, [], 'not judged, so nothing to fail');
  assert.equal(grounded.skipped.length, 1);
  assert.match(grounded.skipped[0], /^NO DASH is reported and not judged/);
  assert.match(grounded.skipped[0], /1\.40x plain/);
});

test('a rule about the deal is stood aside on the careless table and judged on the deliberate one', () => {
  // ONE CARD takes away a *choice*. The careless hand answers the level-up with a die, so it never used
  // the thing the rule removes, and a ratio read off that table is the difference between two random
  // draws rather than a price. So the ladder flies the same seeds twice (main() does this in one boot)
  // and the verdict reads the deal rule off the second table only - and the first table stands aside out
  // loud rather than passing what it could not see.
  const carelessThin = row('thin', 74000, 260, 12);
  // The same seeds and the same feet, picking on purpose, and worth twice the careless hand: that is the
  // taste the rule takes a price off of (see dealTasteOf, and the test below that refuses a hand without
  // one).
  const wisePlain = row('none', 200000, 300, 12);
  const deal = (thinScore) => ({
    rows: [wisePlain, row('thin', thinScore, 300, 12)],
    plain: wisePlain,
    carelessPlain: PLAIN,
  });

  // 1.02x the deliberate plain: a rule that claims to be harder and pays for it in nothing.
  const soft = verdictOf([PLAIN, carelessThin], PLAIN, deal(204000));
  assert.equal(problemsAbout(soft, 'thin').length, 1, 'judged, once, on the deliberate table');
  assert.match(problemsAbout(soft, 'thin')[0], /1\.02x plain/);
  assert.equal(soft.skipped.length, 1);
  assert.match(soft.skipped[0], /ONE CARD is priced on the deliberate table and not this one/);
  assert.match(soft.skipped[0], /0\.74x plain/, 'and the careless number is printed rather than hidden');

  // 0.71x there, and the rule is paid for. The blindness of the first table is still worth a line.
  const honest = verdictOf([PLAIN, carelessThin], PLAIN, deal(142000));
  assert.deepEqual(honest.problems, []);
  assert.equal(honest.skipped.length, 1);

  // A deliberate plain that scored nothing has no ratios either - and no NaN verdict.
  const blank = {
    rows: [row('none', 0, 5, 0), row('thin', 0, 5, 0)],
    plain: row('none', 0, 5, 0),
    carelessPlain: PLAIN,
  };
  assert.deepEqual(verdictOf([PLAIN, carelessThin], PLAIN, blank).problems, []);
});

test('a deal rule is refused on a deliberate hand whose card taste is worth less than a die', () => {
  // The gate that session 157 had to build. On the default `human` policy the plain batch flown by the
  // bot's own card taste scores *less* than the same batch flown by a die, so "what was the choice worth"
  // has no answer there and a deal rule reads as a gift: not because the rule is soft but because the
  // hand cannot miss a pick it would not have made better. Refused out loud, with both numbers, and the
  // soft-looking ratio is printed rather than passed.
  const noTaste = {
    rows: [row('none', 90000, 300, 12), row('thin', 60000, 300, 12)],
    plain: row('none', 90000, 300, 12),
    carelessPlain: PLAIN,
  };
  const refused = verdictOf([PLAIN, row('thin', 97000, 300, 12)], PLAIN, noTaste);
  assert.deepEqual(problemsAbout(refused, 'thin'), [], 'nothing judged, so nothing failed');
  assert.equal(refused.skipped.length, 1);
  assert.match(refused.skipped[0], /card taste is worth less than a die/);
  assert.match(refused.skipped[0], /scored 90,000 against the careless hand/, 'with both readings');
  assert.match(refused.skipped[0], /--bot aware/, 'and the hand that does have taste');
});

test('a deal rule on a ladder that never flew a deliberate hand is not passed, it is refused', () => {
  // The failure mode this is guarding against is a silent one: a deal rule scored against the careless
  // plain would sit inside the bar on its own and be *passed* by a ladder that could not see it.
  const soft = verdictOf([PLAIN, row('thin', 120000, 300, 12)], PLAIN);
  assert.deepEqual(problemsAbout(soft, 'thin'), [], 'no verdict, so nothing to fail');
  assert.equal(soft.skipped.length, 1, 'and the blindness is printed');
  assert.match(soft.skipped[0], /ONE CARD is about the deal/);
  assert.match(soft.skipped[0], /never flew a hand that makes one/);
});

test('a deal rule is refused on a ladder that flew *only* the deliberate hand', () => {
  // `--picks wise` asked for up front: one table, and nothing beside it to say whether that hand's picks
  // are worth anything - which is the exact thing this kind of rule charges for.
  const rows = [PLAIN, row('thin', 120000, 300, 12)];
  const refused = verdictOf(rows, PLAIN, { rows: rows, plain: PLAIN });
  assert.deepEqual(problemsAbout(refused, 'thin'), []);
  assert.equal(refused.skipped.length, 1);
  assert.match(refused.skipped[0], /flew \*only\* the deliberate hand/);
});

test('a deal rule that outlives the deliberate plain is reported on that column, not failed on it', () => {
  // The score column is what a deal rule has to pay, and it is judged. The length of the batch is not:
  // the hand with the taste to price a choice is the hand that hardly dies, so its middle of deaths is a
  // handful of samples - session 157 priced ONE CARD against a deliberate plain that lost one run in 24
  // while the thin batch lost five. That column is printed with its numbers and weighed by nothing, and
  // an ordinary rule is still held to it.
  const blind = [PLAIN, row('thin', 74000, 260, 12, 8)];
  const wisePlain = row('none', 200000, 300, 12, 1);
  const deal = (thinScore) => ({
    rows: [wisePlain, row('thin', thinScore, 340, 12, 5)],
    plain: wisePlain,
    carelessPlain: PLAIN,
  });

  const paid = verdictOf(blind, PLAIN, deal(142000));
  assert.deepEqual(paid.problems, [], '0.71x plain is a paid rule, alive or not');
  assert.equal(paid.skipped.length, 2, 'the blind table, and the column stood down');
  assert.match(paid.skipped[1], /ONE CARD outlived the deliberate plain - 5m40s against 5m00s/);
  assert.match(paid.skipped[1], /5 deaths to plain's 1/);
  assert.match(paid.skipped[1], /reported and not judged/);

  // ...and a soft one outliving the plain batch is still failed, on the column that is judged.
  const soft = verdictOf(blind, PLAIN, deal(210000));
  assert.equal(problemsAbout(soft, 'thin').length, 1);
  assert.match(problemsAbout(soft, 'thin')[0], /1\.05x plain/);
  assert.equal(soft.skipped.length, 2, 'and the long life is said as well as the softness');

  // An ordinary rule is held to both columns, exemption-free: this is the check that keeps the bar where
  // the other five rules still have to clear it.
  const crowd = verdictOf([PLAIN, row('swift', 90000, 340, 12)], PLAIN);
  assert.equal(problemsAbout(crowd, 'swift').length, 1);
  assert.match(problemsAbout(crowd, 'swift')[0], /outlasts the plain batch/);
});

test('a plain batch that scored nothing has no ratios to judge', () => {
  // Division by plain's middle score, which is 0 when the batch died before it scored anything (a
  // window far too short, or a bot dialled to not shoot). No verdict at all rather than a NaN one.
  const nothing = verdictOf([row('none', 0, 5, 0), row('swift', 0, 5, 0)], row('none', 0, 5, 0));
  assert.deepEqual(nothing.problems, []);
  assert.deepEqual(nothing.skipped, []);
});
