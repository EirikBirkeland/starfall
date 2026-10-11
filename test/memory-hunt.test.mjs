// The memory hunt: the arithmetic that decides whether a page is getting heavier, and the census
// that says what is doing it.
//
// A real hunt is thirty minutes of flight plus a batch of wrecks, which is minutes of playing and so
// is not what runs here. What is tested is everything the verdict is built out of - the slope, the
// warm-up that must not be mistaken for a leak, the census that names what grew, and one reading
// taken off a live game to prove the parts are wired to a world and not only to each other.
//
// The budgets themselves are pinned here as well, because a check whose thresholds live only in a
// default nobody reads is a check that will be widened the first time it complains.

import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGame } from '../tools/headless/harness.js';
import { Pool } from '../src/core/pool.js';
import { SAVE_KEY } from '../src/core/save.js';
import {
  MB, DEFAULTS, slopeOf, slopePerMinute, slopePerRun, poolsOf, censusOf, survey,
  grewBetween, verdictOf, flightTable, readArgs,
} from '../tools/memory-hunt.js';

/** One sample, with everything the verdict does not care about filled in harmlessly. */function sample(at, heapMB, over) {
  return Object.assign({
    at: at,
    heap: heapMB * MB,
    external: 0,
    poolMade: 0,
    poolLive: 0,
    pools: {},
    census: { objects: 0, slots: 0, byPath: {} },
    enemies: 0,
    score: 0,
    holders: 0,
    sprites: 0,
    spriteBytes: 0,
    save: 0,
  }, over || {});
}

/* ------------------------------------------------------------------------ the slope */

test('a straight line gets its slope, and one point has none', () => {
  assert.equal(slopeOf([{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }]), 1);
  assert.equal(slopeOf([{ x: 0, y: 5 }, { x: 3, y: 5 }]), 0);
  assert.equal(slopeOf([{ x: 0, y: 5 }]), 0, 'one point is not a trend');
  assert.equal(slopeOf([]), 0);
});

test("a flight's slope is megabytes of heap per minute of game time", () => {
  // Three samples two minutes apart, each half a megabyte heavier than the last.
  const rows = [sample(0, 10), sample(120, 10.5), sample(240, 11)];
  assert.ok(Math.abs(slopePerMinute(rows) - 0.25) < 1e-9, slopePerMinute(rows));
});

test("a batch of wrecks' slope is megabytes of heap per run played", () => {
  const rows = [sample(30, 10), sample(60, 10), sample(90, 10)];
  assert.equal(slopePerRun(rows), 0);
  const heavier = [sample(30, 10), sample(60, 10.1), sample(90, 10.2)];
  assert.ok(Math.abs(slopePerRun(heavier) - 0.1) < 1e-9, slopePerRun(heavier));
});

/* ------------------------------------------------------------------------ the verdict */

test('warm-up is not a leak: a flight that fills out and then flatlines passes', () => {
  // The first two samples are the pools and the sprite cache reaching their size - four megabytes of
  // it, which is what the real hunt measures in its first minute - and after the warm-up mark the
  // heap does not move at all. A check that read the whole flight would call this a leak.
  const rows = [sample(0, 9), sample(60, 13), sample(120, 13), sample(180, 13), sample(240, 13)];
  const verdict = verdictOf(rows, [], { warmup: 2, budget: 0.05, perRun: 0.2, spriteMB: 40 });
  assert.ok(verdict.pass, verdict.lines.join('\n'));
  assert.equal(verdict.slope, 0);
  assert.ok(verdict.warmSlope > 1, 'and the warm-up slope is printed, because it is the story: ' + verdict.warmSlope);
});

test('a flight that keeps climbing fails, and says which budget it failed', () => {
  const rows = [sample(0, 13), sample(60, 13), sample(120, 14), sample(180, 15), sample(240, 16)];
  const verdict = verdictOf(rows, [], { warmup: 1, budget: 0.2, perRun: 0.2, spriteMB: 40 });
  assert.ok(!verdict.pass);
  assert.ok(verdict.slope > 0.9, verdict.slope);
  assert.ok(verdict.lines.join('\n').includes('FAIL'));
});

test('a sprite cache over its budget fails the hunt on its own', () => {
  // The one thing the headless heap cannot see (render/glow.js bakes canvases the fake device has no
  // pixels for), so it is the one thing that has to be gated by arithmetic rather than by a reading.
  const rows = [sample(0, 13), sample(60, 13, { spriteBytes: 60 * MB, holders: 400, sprites: 400 })];
  const verdict = verdictOf(rows, [], { warmup: 0, budget: 0.2, perRun: 0.2, spriteMB: 40 });
  assert.ok(!verdict.pass);
  const said = verdict.lines.join('\n');
  assert.ok(said.split('\n')[0].includes('- pass'), 'the flight itself was fine:\n' + said);
  assert.ok(said.includes('the sprite cache') && said.includes('FAIL'), said);
});

test('a page visit that gets heavier with every wreck fails too', () => {
  const flat = [sample(60, 13), sample(60, 13), sample(60, 13)];
  const wrecks = [sample(90, 12), sample(90, 12.3), sample(90, 12.6)];
  const verdict = verdictOf(flat, wrecks, { warmup: 0, warmRuns: 0, budget: 0.2, perRun: 0.1, spriteMB: 40 });
  assert.ok(!verdict.pass);
  assert.ok(Math.abs(verdict.perWreck - 0.3) < 1e-9, verdict.perWreck);
  // ...and the same batch costs nothing when the visit is not growing.
  assert.ok(verdictOf(flat, [sample(90, 12), sample(90, 12), sample(90, 12)],
    { warmup: 0, warmRuns: 0, budget: 0.2, perRun: 0.1, spriteMB: 40 }).pass);
  // ...and a batch of two is not a batch.
  assert.ok(!verdictOf(flat, [sample(90, 12), sample(90, 12)],
    { warmup: 0, warmRuns: 0, budget: 0.2, perRun: 0.1, spriteMB: 40 }).lines.join('\n').includes('the wrecks'));
});

test('the first runs of a visit are warm-up too', () => {
  // The way it actually measures: eight careless runs put on 1.4 MB across the first three - the pools
  // meeting a real crowd, the sprite cache filling, the tally's histograms being built - and then sat
  // still. Reading run 1 against run 8 would call that a leak.
  const rows = [sample(90, 11.5), sample(90, 12.4), sample(90, 12.9), sample(90, 13.2),
    sample(90, 13.15), sample(90, 13.3), sample(90, 13.2), sample(90, 13.25)];
  const quietFlight = [sample(0, 13), sample(60, 13), sample(120, 13)];
  const opts = { warmup: 0, warmRuns: 3, budget: 0.2, perRun: 0.1, spriteMB: 40 };
  const verdict = verdictOf(quietFlight, rows, opts);
  assert.ok(verdict.pass, verdict.lines.join('\n'));
  assert.ok(verdict.lines.join('\n').includes('the last 5 of 8 runs'), verdict.lines.join('\n'));
  assert.ok(verdict.perWreck < 0.1, verdict.perWreck);
  // And however small the batch, at least three runs are always measured: a slope off two points is a
  // line drawn through whatever the second one happened to be.
  const three = verdictOf(quietFlight, rows.slice(0, 3), { ...opts });
  assert.ok(three.lines.join('\n').includes('the last 3 of 3 runs'), three.lines.join('\n'));
});

/* ------------------------------------------------------------------------ what grew */

test('the census names what grew and stays quiet about what did not', () => {
  const before = sample(0, 13, {
    pools: { bullets: { made: 100, live: 20, free: 80, spawned: 500 }, rings: { made: 10, live: 2, free: 8, spawned: 40 } },
    census: { objects: 50, slots: 200, byPath: { 'bullets.items': 20, 'bullets.free': 80, 'enemies': 12 } },
    holders: 70, sprites: 70, spriteBytes: 8 * MB, save: 1000,
  });
  const after = sample(600, 14, {
    pools: { bullets: { made: 140, live: 22, free: 118, spawned: 900 }, rings: { made: 10, live: 4, free: 6, spawned: 44 } },
    census: { objects: 60, slots: 300, byPath: { 'bullets.items': 22, 'bullets.free': 118, 'enemies': 40 } },
    holders: 75, sprites: 75, spriteBytes: 9 * MB, save: 1500,
  });
  const lines = grewBetween(before, after).join('\n');
  assert.ok(lines.includes('pool bullets built 40 more objects'), lines);
  assert.ok(!lines.includes('pool rings'), 'a pool that built nothing new is not mentioned');
  assert.ok(lines.includes('sprite cache took 5 more holders'), lines);
  assert.ok(lines.includes('save document grew 500 bytes'), lines);
  assert.ok(lines.includes('world.enemies holds +28 slots'), lines);
  assert.equal(grewBetween(before, before).length, 0, 'nothing grew between a reading and itself');
});

test('a pool is found wherever it hangs off the world', () => {
  const world = {
    bullets: new Pool(() => ({ x: 0 })),
    mines: { laid: new Pool(() => ({ x: 0 })) },
    deeper: { nested: { cords: new Pool(() => ({ x: 0 })) } },
    enemies: [{ x: 0 }],
    upgrades: { damage: 3 },
  };
  world.bullets.spawn();
  const pools = poolsOf(world);
  assert.deepEqual(Object.keys(pools).sort(), ['bullets', 'deeper.nested.cords', 'mines.laid']);
  assert.equal(pools.bullets.made, 1);
  assert.equal(pools.bullets.live, 1);
});

test('the census counts what the world can reach, and counts it once', () => {
  const shared = { things: [1, 2, 3] };
  const census = censusOf({ left: shared, right: shared, own: [4, 5] });
  assert.equal(census.byPath['left.things'], 3);
  assert.equal(census.byPath['right.things'], undefined, 'the second route to it is not a second copy');
  assert.equal(census.byPath['own'], 2);
  assert.equal(census.objects, 2, 'the world itself and the one shared object, counted once');
  assert.equal(census.slots, 5);
});

/* ------------------------------------------------------------------------ wired to a game */

test('a reading taken off a live game says something true about it', async () => {
  const game = await bootGame({ seed: 3, audio: false });
  const row = survey(game, 0);
  assert.ok(row.heap > MB, 'the page is holding something: ' + row.heap);
  assert.ok(row.pools.bullets && row.pools.particles, "the world's pools are named");
  assert.ok(row.census.objects > 0 && row.census.slots >= 0);
  assert.ok(row.holders >= 0 && row.spriteBytes >= 0, 'the sprite cache answers in bytes too');
  assert.ok(row.at === 0);
  // The save document is read where the game keeps it. `core/save.js` goes through
  // `window.localStorage` and the headless shim hangs its store on the window object it builds
  // (tools/headless/harness.js), so a survey that looked on `globalThis` would report a save of zero
  // bytes forever - a number whose being wrong looks exactly like its being right.
  globalThis.window.localStorage.setItem(SAVE_KEY, 'x'.repeat(1234));
  assert.equal(survey(game, 30).save, 1234);
  const table = flightTable([row, survey(game, 60)]);
  assert.ok(table.includes('heap MB') && table.includes('sprites'), table);
  game.stop();
});

/* ------------------------------------------------------------------------ the command line */

test('the budgets that ship are the budgets this file has read', () => {
  const opts = readArgs([]);
  assert.equal(opts.minutes, DEFAULTS.minutes, "PLAN's thirty-minute run");
  assert.equal(opts.warmup, DEFAULTS.warmup);
  assert.equal(opts.warmRuns, DEFAULTS.warmRuns);
  assert.ok(opts.budget > 0 && opts.perRun > 0 && opts.spriteMB > 0);
  assert.equal(readArgs(['--minutes', '9', '--every', '30', '--budget', '0.3']).minutes, 9);
  assert.equal(readArgs(['--per-run', '0.05']).perRun, 0.05);
  // The short runs are flown by the hand that gets buried, not the one that outlives the window.
  assert.equal(readArgs([]).wreckPolicy, 'human');
  assert.equal(readArgs(['--wreck-policy', 'aware']).wreckPolicy, 'aware');
  assert.throws(() => readArgs(['--wreck-policy', 'nobody']), /no bot policy/);
  assert.throws(() => readArgs(['--nonsense']), /unknown option/);
  assert.throws(() => readArgs(['--budget']), /wants a value/);
  assert.throws(() => readArgs(['--minutes', '0']), /real numbers/);
  // A flight that ends inside its own warm-up has no steady stretch to read, and saying so beats a
  // verdict built on nothing.
  assert.throws(() => readArgs(['--minutes', '5', '--warmup', '5']), /outlast/);
});
