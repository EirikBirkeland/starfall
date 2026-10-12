// The ruler that measures what a step throws away, and the budgets it enforces (PLAN section 2,
// milestone 10).
//
// PLAN section 2's second performance rule is "no allocation inside the per-frame loops". Object pools
// were bought for the first half of that and `tools/perf-probe.js` measures how long a step costs;
// neither of them can see garbage, and garbage is what makes the collector come - which is the one
// thing that explains a frame costing fifteen times what the crowd inside it is worth (the F3 plate
// sees worst steps of 1.4-1.7 ms; a scavenge of this heap costs about a millisecond of that). So
// `tools/alloc-probe.js` weighs a step in bytes, and this file keeps three things true about it:
//
//   - **the instrument notices the loads it claims to notice**: a crowd costs more than an empty arena,
//     and the two lists that live in pools - sparks, and the shots that only ever fly - cost nothing
//     more than the arena on its own. Those two are the promise `core/pool.js` and `core/grid.js` make,
//     and if either is ever undone this fails instead of a hitch appearing at the busiest moment;
//   - **the same load reads the same number twice**, which is the whole reason the tool measures each
//     load in its own process: measured in one shared process, 60 shots threw away 479 bytes a step
//     when they were the first load the process had seen and 3,145 when an empty arena had come first,
//     and a ratchet that depends on which row came first is not a ratchet;
//   - **the reading does not depend on how long a window you ask for**, which is the sign that a load
//     has been *warmed* rather than measured cold and that no window in the set is lying: asking for six
//     windows instead of twenty-four used to read the endless wall 4-8x dearer, because the code being
//     weighed was still the code V8 had started it on and not the code it finished, and once that was
//     fixed a rarer window - one where the heap and the young generation disagree about what grew - made
//     the *cheap* reading depend on how many windows you had drawn. Warming needs turns of the event
//     loop, not a count of steps (`tools/alloc-probe.js` has the measurements); a browser turns the loop
//     every frame, so the warm number is the one a player pays and the cold one was a ruler measuring
//     its own compiler;
//   - **the gated loads are inside both budgets**, which is the ratchet: a change that makes a step
//     throw away more has to be argued about here, in bytes, and not discovered as a stutter.
//
// What is *not* in here is any claim about a browser. The young generation of a page is a different
// size from the one this file asks node for, and how long a scavenge takes there is unknown from here;
// the bytes are the only honest currency, and the plate (render/debug.js) is where a real machine is
// read.
//
// Every measurement in here runs in a child process, because a window needs `--expose-gc` and a test
// file cannot add a flag to the process it is already in. The tool adds it to itself; these tests just
// ask it for short windows so the suite is not waiting on a full ladder.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { BALANCE } from '../src/game/balance.js';
import {
  bytes, verdictOf, secondsPerYoungGeneration, chosenLoads, partLoads, readArgs,
  FLOOR_BYTES, STEP_BYTES, BODY_BYTES, TAB_YOUNG_BYTES, readingsAgree,
} from '../tools/alloc-probe.js';
import { SCENES } from '../tools/perf-probe.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'alloc-probe.js');

/** One run of the tool, with the windows a test wants rather than the ladder a reader wants. */
function probe(args) {
  return spawnSync(process.execPath, [TOOL, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
}

/** The rows one `--json` run printed, plus the arena on its own. */
function rows(args) {
  const out = probe(args);
  // A non-zero status is the verdict saying a load is over budget, which several tests below read out
  // of the rows themselves; what must never happen is the tool dying without printing anything.
  assert.ok(out.stdout.includes('ROWS '), 'the probe printed no rows: ' + out.stderr);
  const line = out.stdout.split('\n').find((l) => l.startsWith('ROWS '));
  const parts = line.slice('ROWS '.length).split(' floor ');
  return { rows: JSON.parse(parts[0]), floor: Number(parts[1]) };
}

// Short windows, because a whole ladder is a minute of the suite's life and the warm-up is what spends
// it: a load is measured in 1,000-step windows until six of them in a row agree, and then read in
// windows of this size. The window width no longer moves the number - there is a test for that now,
// where the old numbers moved 4-8x between six windows and forty - so 300 is just the point where a
// window is cheap and still long enough to average the step out.
const QUICK = ['--json', '--steps', '300', '--windows', '6'];

// --- the arithmetic in the tool ---------------------------------------------------

test('a byte count reads like a person wrote it', () => {
  assert.equal(bytes(843), '843 B');
  assert.equal(bytes(1024), '1.0 KB');
  assert.equal(bytes(10_240), '10.0 KB');
  assert.equal(bytes(NaN), '-');
});

test('a young generation lasts as long as the rate says and no longer', () => {
  // 1,024 B a step at 120 steps a second is 120 KB a second, so a megabyte is 8.something seconds.
  assert.ok(secondsPerYoungGeneration(1024, TAB_YOUNG_BYTES) > 8);
  assert.ok(secondsPerYoungGeneration(1024, TAB_YOUNG_BYTES) < 9);
  assert.equal(secondsPerYoungGeneration(0, TAB_YOUNG_BYTES), Infinity, 'nothing to collect is forever');
  // Halving what a step throws away doubles the time until the collector is called again. That is the
  // whole argument for the file, in one line.
  assert.ok(Math.abs(secondsPerYoungGeneration(512, TAB_YOUNG_BYTES)
    - 2 * secondsPerYoungGeneration(1024, TAB_YOUNG_BYTES)) < 1e-9);
});

test('the verdict fails on the floor as well as on a load', () => {
  const inside = [{ name: 'a wall', gated: true, bytesPerStep: 100, ok: true }];
  assert.equal(verdictOf(inside, 100).pass, true);
  assert.equal(verdictOf([{ name: 'a wall', gated: true, bytesPerStep: 1e6, ok: false }], 100).failed
    .join(), 'a wall');
  const overFloor = verdictOf(inside, 1e6);
  assert.equal(overFloor.pass, false);
  assert.ok(overFloor.failed.includes('the empty arena'));
});

test('a window whose two readings disagree is not a reading', () => {
  // The instrument is really two instruments: what the heap grew across a window, and what its young
  // generation filled with. On an honest window they are the same number to under a percent, and about
  // one window in a hundred old space hands a page back mid-window and only one of them notices. Both
  // pairs below are real, from the box this file was written on: the first is `endless` over 300 steps,
  // the second is the liar that appeared in one run in twenty - and "best of N" would have kept the
  // liar and called it the cheapest window.
  assert.ok(readingsAgree(170_100, 169_800), '567 B a step against 566 B a step is one number');
  assert.equal(readingsAgree(59 * 1024, 176 * 1024), false,
    'a window saying the heap grew by a third of what its young generation did was collected in');
  assert.ok(readingsAgree(19 * 1024, 19 * 1024 + 300), 'the empty arena, read two ways');
  // The absolute half of the bound, for a window too small to compare percentages over.
  assert.ok(readingsAgree(4000, 0), 'a tiny window keeps its 4 KB of slack');
  assert.equal(readingsAgree(5000, 0), false, 'and no more than that');
});

test('every flag is refused with a sentence before a number can be printed', () => {
  for (const args of [['--nonsense'], ['--scene', 'nowhere'], ['--kind', 'nowhere'],
    ['--windows', '1'], ['--steps', '0'], ['--seconds', '-1']]) {
    const out = probe(args);
    assert.notEqual(out.status, 0, args.join(' ') + ' should not be accepted');
    assert.match(out.stderr, /alloc-probe: /, args.join(' ') + ' printed no honest complaint');
    assert.doesNotMatch(out.stdout, /ROWS |VERDICT/, args.join(' ') + ' printed a number anyway');
  }
});

test('the loads are the walls the game has, read out of BALANCE', () => {
  // Every gated scene's body count is a wall from balance.js and not a typed-in number, and the parts
  // ladder is the spark cap and the schedule crowd - the same two the perf probe plants.
  for (const scene of SCENES) {
    if (!scene.gated) continue;
    assert.ok(typeof scene.bodies === 'function', scene.id + ' asks for its crowd');
  }
  const parts = partLoads();
  const sparks = parts.find((p) => p.name === 'the spark cap alone');
  const crowd = parts.find((p) => p.name === 'the schedule crowd alone');
  assert.equal(sparks.sparks, BALANCE.effects.particleCap);
  assert.equal(crowd.bodies, BALANCE.waves.maxBodies);
});

test('--scene and --kind choose the loads they name', () => {
  assert.deepEqual(chosenLoads(readArgs(['--scene', 'endless'])).map((l) => l.id), ['endless']);
  const kinds = chosenLoads(readArgs(['--kinds']));
  assert.equal(kinds.length, Object.keys(BALANCE.kinds).length);
  for (const load of kinds) assert.ok(BALANCE.kinds[load.kind], 'a row per kind, named');
});

// --- what the loads actually weigh ------------------------------------------------

const parts = rows(['--parts', ...QUICK]);

test('a crowd costs the step something, and it is a fraction of what it used to be', () => {
  const crowd = parts.rows.find((r) => r.name === 'the schedule crowd alone');
  assert.ok(crowd.bytesPerStep > parts.floor * 2,
    '100 bodies should be visible against an empty arena, and the ruler would be worthless if not');
  assert.ok(crowd.perBody <= BODY_BYTES, 'a body costs ' + bytes(crowd.perBody)
    + ' a step, over the ' + bytes(BODY_BYTES) + ' the budget allows');
  // The history of this number, because it is the one that shows what the rule has cost: **94 B** a body
  // while `core/grid.js` emptied its cells with `cell.length = 0`, **31 B** once a cell was a count and a
  // store and `game/awards.js` stopped listing the ranks table every step, and **3-5 B** now that the
  // crowd's walks call `core/math.js`'s `hypot` instead of `Math.hypot` and that the load has been
  // warmed before it was weighed. The bound below is where it sat
  // before the last of those two fixes, so a regression that puts an allocation back in the walk trips
  // this and a rounding error does not.
  assert.ok(crowd.perBody < 31, 'a body used to cost 31 B a step; it now costs ' + crowd.perBody);
});

test('the two lists that live in pools throw away nothing extra', () => {
  // This is `core/pool.js` and the grid's "a rebuild costs no allocation" made visible: 900 sparks and
  // 60 shots are each their own rows, and neither may cost the step a slice of what a body costs.
  const sparks = parts.rows.find((r) => r.name === 'the spark cap alone');
  const shots = parts.rows.find((r) => r.name === "a gun's shots alone");
  const slack = Math.max(96, parts.floor * 0.25);
  assert.ok(sparks.bytesPerStep - parts.floor <= slack, '900 sparks threw away '
    + bytes(sparks.bytesPerStep - parts.floor) + ' a step over an empty arena');
  assert.ok(shots.bytesPerStep - parts.floor <= slack, '60 shots threw away '
    + bytes(shots.bytesPerStep - parts.floor) + ' a step over an empty arena - a query that empties'
    + ' its scratch array, or a broad phase that builds a list, is back');
});

test('all three together is the crowd, and not the crowd plus the two free lists', () => {
  const crowd = parts.rows.find((r) => r.name === 'the schedule crowd alone');
  const both = parts.rows.find((r) => r.name === 'all three together');
  assert.ok(both.bytesPerStep < crowd.bytesPerStep * 1.35,
    '900 sparks and 60 shots on top of the crowd cost '
      + bytes(both.bytesPerStep - crowd.bytesPerStep) + ' a step, which is not nothing');
});

test('the same load reads the same number twice', () => {
  // The reason the tool measures every load in its own process. Twice the same command, and the number
  // has to come back close: on a quiet box these two come back identical to the byte, and the slack is
  // for a suite running eight files at once, not for the ruler itself.
  const first = rows(['--scene', 'endless', ...QUICK]).rows.find((r) => r.id === 'endless');
  const again = rows(['--scene', 'endless', ...QUICK]).rows.find((r) => r.id === 'endless');
  const spread = Math.abs(first.bytesPerStep - again.bytesPerStep)
    / Math.max(first.bytesPerStep, again.bytesPerStep);
  assert.ok(spread < 0.15, 'the same load read ' + bytes(first.bytesPerStep) + ' and then '
    + bytes(again.bytesPerStep));
});

test('the reading does not depend on how many windows you ask for', () => {
  // The one that would have caught the ruler lying. A load is warmed by being measured in windows, and
  // if the warm-up has not actually warmed anything then the reading depends on how much stepping the
  // windows happened to do - so six windows and twenty-four of them disagree. They used to: the endless
  // wall read 2,410 B a step at six windows and 577 B at forty, and every budget in the file was set
  // against numbers of that kind, which is how a gate can sit at FAIL for a whole milestone without a
  // single byte of the game changing.
  const few = rows(['--scene', 'endless', ...QUICK]).rows.find((r) => r.id === 'endless');
  const many = rows(['--scene', 'endless', '--json', '--steps', '300', '--windows', '24'])
    .rows.find((r) => r.id === 'endless');
  assert.equal(few.warmSettled, true, 'the load never stopped getting cheaper in six-window runs');
  assert.equal(many.warmSettled, true, 'the load never stopped getting cheaper in twenty-four windows');
  const spread = Math.abs(few.bytesPerStep - many.bytesPerStep)
    / Math.max(few.bytesPerStep, many.bytesPerStep);
  assert.ok(spread < 0.15, bytes(few.bytesPerStep) + ' a step at six windows against '
    + bytes(many.bytesPerStep) + ' at twenty-four: the reading is still carrying its own warm-up');
});

test('the gated loads are inside the budgets - the ratchet', () => {
  // One run of the four gated scenes, which is what `tools/release.sh` would want to run and does not,
  // because a byte count is not a claim about a browser. Each row carries its own gate, and the tool's
  // exit code is the verdict, so this test is the ratchet proper.
  const out = probe([...QUICK]);
  assert.equal(out.status, 0, 'a gated load is over budget:\n' + out.stdout + out.stderr);
  const line = out.stdout.split('\n').find((l) => l.startsWith('ROWS '));
  const parsed = JSON.parse(line.slice('ROWS '.length).split(' floor ')[0]);
  for (const row of parsed.filter((r) => r.gated)) {
    assert.notEqual(row.warmSettled, false, row.name + ' was still getting cheaper when the warm-up gave'
      + ' up after ' + row.warmSteps + ' steps: the ruler cannot set a budget against it');
    assert.ok(row.bytesPerStep <= STEP_BYTES, row.name + ' throws away '
      + bytes(row.bytesPerStep) + ' a step, over the ' + bytes(STEP_BYTES) + ' allowed');
    assert.ok(row.perBody <= BODY_BYTES, row.name + ': a body costs ' + bytes(row.perBody)
      + ' a step, over the ' + bytes(BODY_BYTES) + ' allowed');
  }
  assert.match(out.stdout, /VERDICT PASS/);
});

test('the empty arena is inside its own budget', () => {
  // The floor is the noisiest number in the file (it is small, and a short window has less of the step
  // to hide in): warmed, it reads 64 B a step here and did so on every one of a dozen runs, loaded and
  // unloaded. It used to read 219-415 across the short windows these tests ask for, and that was the
  // warm-up not warming. The budget is double the reading because what it is for is a whole system's
  // worth of per-step lookups turning up here, not a rounding error.
  assert.ok(parts.floor <= FLOOR_BYTES, 'the arena on its own throws away ' + bytes(parts.floor)
    + ' a step, over the ' + bytes(FLOOR_BYTES) + ' allowed - a lookup added to every step belongs in'
    + ' a system that needs it, not in the frame');
});
