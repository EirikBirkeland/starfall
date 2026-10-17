// Two builds flown on the same seeds, counted seed against seed.
//
// Every ladder in `tools/` compares two batches by their middles: the middle score of one against the
// middle score of the other. That is the shape a batch has, but it throws away the one thing the seeds
// were lined up for. The two batches flew the *same* runs - same spawn layout, same crowd schedule,
// same every-card-draw - so a seed can be asked which build it was better under, and the answer does
// not care how long-tailed the score distribution is. A middle does.
//
// How much that matters was measured on 2026-10-18 with the ladder this module was written for
// (`tools/pick-taste.js`, NOTES session 158): the shipped card appetite read **0.91x** its own die on
// 32 seeds of the `human` hands and **1.18x** it on 12 - the same two builds, the same window, the
// same policy, and the sign of the answer changed with how many seeds were flown. A middle of a batch
// whose best run is eight times its middle run (3,835 against 28,637 over 12 seeds) jiggles by tens of
// percent, and a ladder that prices a rule at a tenth of that jiggle is sanding its own ruler.
//
// The paired reading cannot be fooled that way. On those same 12 seeds the appetite beat its die on
// most of them but not all of them, and the pair test says what the middles could not: that the batch
// cannot tell the two builds apart at all. That is a different answer from "worth 0.91x" and it is the
// one the next ladder needed - a hand that *cannot be shown* to have a taste cannot price a rule about
// taking a choice away, and neither can a hand whose taste is only two seeds in eleven.
//
// What is here is deliberately one test and not a statistics kit: the **sign test**. Each seed says
// which side it preferred, ties and unusable seeds are set aside, and the question is whether the split
// is a coin's split or better. It does not look at by how much, which is the point - a run whose score
// doubled on one lucky seed should not outvote nine seeds that each preferred the other build by a
// tenth. The size of the difference is reported alongside it (the median of the per-seed ratios) and
// judged by nothing, because "how much" is a number that wants a distribution and this file is not one.

/** How sure the sign test has to be before a ladder says a difference was shown. */
export const CONFIDENCE = 0.05;

/**
 * The middle of a list of numbers, or `null` for an empty one.
 *
 * The upper of the two middle values, which is what every ladder here did before this function was
 * lifted out of it - a batch of runs is reported as it was read, and two ladders disagreeing about
 * which middle they use would be worse than either of them being wrong.
 */
export function median(values) {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * The exact two-sided sign test: two outcomes, and how likely a coin is to split this lopsidedly.
 *
 * `wins` and `losses` are the seeds that preferred one side and the other; ties belong to neither and
 * are not in the denominator. The answer is the probability that a fair coin, tossed `wins + losses`
 * times, lands on the rarer side at least as few times as it did - doubled, because a split can be
 * lopsided either way and a ladder that only looked one way would be choosing its answer by which
 * batch it called "first". Clipped at 1, because doubling a probability is not itself a probability
 * and a reader should never see 1.4.
 */
export function signTest(wins, losses) {
  const n = wins + losses;
  if (n === 0) return 1;
  const rarer = Math.min(wins, losses);
  // P(X <= rarer) for X ~ Binomial(n, 1/2), built term by term so nothing overflows: each term is the
  // one before it times (n - k) / (k + 1), and the first is 2^-n.
  let term = Math.pow(0.5, n);
  let tail = term;
  for (let k = 0; k < rarer; k++) {
    term = term * (n - k) / (k + 1);
    tail += term;
  }
  return Math.min(1, tail * 2);
}

/**
 * What build `a` is worth against build `b`, seed by seed.
 *
 * Both sides are `seed -> score` maps from one batch each (`tools/headless/bot.js` hands every run's
 * seed back in its summary for exactly this). Only seeds both sides flew are compared; a seed either
 * side scored nothing on is set aside rather than counted as a preference, because 0 over 0 is not a
 * ratio and a ladder that counted it would be scoring the runs that never got going.
 *
 * Returns `{ seeds, compared, wins, losses, ties, p, medianRatio }`:
 *   `seeds`      how many seeds both sides flew at all,
 *   `compared`   how many of those said which side it preferred,
 *   `wins`       ...the number that preferred `a` (and `losses` the ones that preferred `b`, `ties`
 *                the ones that could not tell),
 *   `p`          the sign test on that split - `p <= CONFIDENCE` is a difference the seeds showed,
 *                and anything above it is a batch that could not tell the two builds apart,
 *   `medianRatio` the middle of the per-seed `a / b`, which says how big the difference was on the
 *                typical seed, and is `null` when no seed could be divided.
 */
export function pairedRatio(a, b) {
  const seeds = [];
  for (const seed of a.keys()) {
    if (b.has(seed)) seeds.push(seed);
  }
  seeds.sort((x, y) => x - y);

  let wins = 0;
  let losses = 0;
  let ties = 0;
  const ratios = [];
  for (const seed of seeds) {
    const left = a.get(seed);
    const right = b.get(seed);
    if (left > right) wins++;
    else if (left < right) losses++;
    else ties++;
    if (right > 0) ratios.push(left / right);
  }

  return {
    seeds: seeds.length,
    compared: wins + losses,
    wins,
    losses,
    ties,
    p: signTest(wins, losses),
    medianRatio: median(ratios),
  };
}

/** Did the seeds say `a` is worth more than `b`, or could they not tell? */
export function isBetter(pair) {
  return pair.p <= CONFIDENCE && pair.wins > pair.losses && pair.medianRatio > 1;
}

/** Did the seeds say `a` is worth *less* than `b`? Same question, other way round. */
export function isWorse(pair) {
  return pair.p <= CONFIDENCE && pair.losses > pair.wins && pair.medianRatio < 1;
}

/** The pair said nothing either way: too few seeds, or a split a coin would make. */
export function isUndecided(pair) {
  return !isBetter(pair) && !isWorse(pair);
}

/** `21 of 32 seeds, p = 0.01` - the pair said in the words a ladder prints. */
export function pairWords(pair) {
  if (pair.compared === 0) {
    return 'none of the ' + pair.seeds + ' seeds it shared could be compared';
  }
  const side = pair.wins >= pair.losses ? pair.wins : pair.losses;
  return side + ' of ' + pair.compared + ' seeds, p = ' + (pair.p < 0.001 ? '<0.001' : pair.p.toFixed(3));
}
