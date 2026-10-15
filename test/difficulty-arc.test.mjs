// PLAN 10's difficulty arc, as a check: a careless build should die between 4:00 and 9:00, and no
// one enemy type should take more than 40% of the deaths.
//
// The batch itself is minutes of playing, so it is not what is tested here. What is tested is the
// arithmetic around it - which ending counts as being in the band, how a death is credited to a
// body, and what the two verdicts say when the numbers are made up and known - plus one short real
// batch through the tool, to prove the parts are wired to a game and not only to each other.
//
// The careless build itself lives in tools/headless/bot.js `PICKS.random`: a die over whatever is
// face up, on a stream of its own so a seed is always the same build. That is tested here too,
// along with the promise that the careful default is untouched by any of it.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { bootGame } from '../tools/headless/harness.js';
import { playOneRun, endingItAt, resetPicks, PICKS } from '../tools/headless/bot.js';
import {
  ARC, endingOf, arcOf, arcTable, creditTable, deathsTable, hullsTable, verdictOf,
} from '../tools/difficulty-arc.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'difficulty-arc.js');

/** Run the tool and keep the exit status instead of throwing on a failing arc. */
function runTool(args) {
  const done = spawnSync(process.execPath, [TOOL, ...args], { cwd: ROOT, encoding: 'utf8' });
  return { status: done.status, out: done.stdout + done.stderr };
}

/** A run that ended, on the clock and with the cause, as the tool sees it. */
function died(seconds, killedBy, hurtBy) {
  return {
    died: true, won: false, seconds: seconds,
    stats: { killedBy: killedBy }, tally: { hurtBy: hurtBy || {} },
  };
}

/** A run that was still flying when the window shut. */
function flying(seconds) {
  return { died: false, won: false, seconds: seconds, stats: {}, tally: { hurtBy: {} } };
}

/** A run that outlasted the schedule. */
function wonIt(seconds) {
  return { died: false, won: true, seconds: seconds, stats: {}, tally: { hurtBy: {} } };
}

/** One of the two verdicts out of the report, whichever line it ended up on. */
function line(verdict, which) {
  return verdict.lines.filter((text) => text.startsWith(which)).join('\n');
}

test('an ending is one of four things, and the band includes both its edges', () => {
  assert.deepEqual(endingOf(died(120, 'body:drifter')), { kind: 'early', at: 120 });
  assert.equal(endingOf(died(ARC.from, 'body:drifter')).kind, 'band', '4m00s is in the band');
  assert.equal(endingOf(died(ARC.to, 'body:drifter')).kind, 'band', 'and so is 9m00s');
  assert.equal(endingOf(died(ARC.from - 1, 'body:drifter')).kind, 'early');
  assert.equal(endingOf(died(ARC.to + 1, 'body:drifter')).kind, 'late');

  // A run still flying has no death time, and inventing one is how a window gets read onto an
  // ending that never happened.
  assert.deepEqual(endingOf(flying(900)), { kind: 'alive', at: null });
  assert.deepEqual(endingOf(wonIt(900)), { kind: 'won', at: null });
});

test('the arc counts the band against the whole batch, not against the deaths', () => {
  const arc = arcOf([
    died(300, 'body:drifter'), died(500, 'body:tank'), died(60, 'body:weaver'),
    died(700, 'body:tank'), flying(900), flying(900),
  ], 900);

  assert.equal(arc.runs, 6);
  assert.equal(arc.deaths, 4);
  assert.equal(arc.inBand, 2);
  assert.equal(arc.early, 1);
  assert.equal(arc.late, 1);
  assert.equal(arc.alive, 2);
  // The denominator is the batch: "the bot should usually die in the band" is a sentence about
  // runs, and a run that never died is not one that died in the band.
  assert.equal(arc.inBand / arc.runs, 1 / 3);
  assert.equal(arc.medianDeath, 400, 'the middle of the four deaths, not of the six runs');
});

test('a batch where nothing died has a middle of nothing and says so', () => {
  const arc = arcOf([flying(900), flying(900)], 900);
  assert.equal(arc.deaths, 0);
  assert.ok(Number.isNaN(arc.medianDeath));
  assert.ok(arcTable(arc).includes('0 of 2 runs died'));
});

test('the histogram has a row per minute and marks the band out', () => {
  const arc = arcOf([died(30, 'body:tank'), died(250, 'body:tank'), died(299, 'body:tank')], 900);
  assert.equal(arc.rows.length, 15, 'a 15 minute window is fifteen rows');
  assert.equal(arc.rows[0].count, 1);
  assert.equal(arc.rows[4].count, 2, 'everything from 4m00s up to 5m00s is the fifth row');
  assert.equal(arc.rows[0].inBand, false);
  assert.equal(arc.rows[4].inBand, true);

  const table = arcTable(arc);
  assert.match(table, /4m00s-5m00s\s+in\s+2\s+##/);
  assert.match(table, /0m00s-1m00s\s+1\s+#/, 'a death outside the band is still on the chart');
});

test('a body is credited with its shots, its beams and its blades', () => {
  const credit = creditTable([
    'body:tank', 'shot:tank', 'shot:tank', 'beam:sniper', 'blast', 'body:drifter', '',
  ]);
  assert.equal(credit.total, 7);

  const byName = {};
  for (const row of credit.rows) byName[row.name] = row;
  assert.equal(byName.TANK.count, 3, 'whose shot it was is whose death it is');
  assert.equal(byName.SNIPER.count, 1);
  assert.equal(byName.BLAST.count, 1, 'a blast has nobody to blame and is a row of its own');
  assert.equal(byName['NO CAUSE'].count, 1, 'a run given up has no cause at all');
  assert.equal(byName.TANK.ways.shot, 2);
  assert.equal(byName.TANK.ways.body, 1);

  // Cheapest first for the reader, and the shares are of the whole.
  assert.equal(credit.rows[0].name, 'TANK');
  assert.equal(Math.round(byName.DRIFTER.share * 100), 14);

  assert.deepEqual(creditTable([]), { total: 0, rows: [] });
});

test('the death table and the hull table read the same sheet at two depths', () => {
  const summaries = [
    died(300, 'body:tank', { 'body:tank': 2, 'shot:spitter': 2 }),
    died(400, 'shot:spitter', { 'body:tank': 1, 'shot:spitter': 1 }),
  ];
  assert.match(deathsTable(summaries), /TANK\s+1\s+50%/);
  assert.match(deathsTable(summaries), /SPITTER\s+1\s+50%/);
  // Every hull of the batch, which is three times the sample the deaths can offer.
  assert.match(hullsTable(summaries), /SPITTER\s+3\s+50%/);
  assert.match(hullsTable(summaries), /TANK\s+3\s+50%/);
  assert.match(deathsTable([flying(900)]), /nobody died/);
});

test('the verdict passes a batch that dies in the band and loses no more than 40% to one body', () => {
  // Twenty deaths, because that is what a share is allowed to be measured on here: five bodies,
  // four deaths each, so nothing is anywhere near the ceiling and the band is everything.
  const bodies = ['drifter', 'tank', 'spitter', 'weaver', 'darter'];
  const summaries = [];
  for (let i = 0; i < 20; i++) {
    const body = bodies[i % bodies.length];
    summaries.push(died(300 + i * 7, 'body:' + body));
  }
  const verdict = verdictOf(arcOf(summaries, 900), summaries);
  assert.equal(verdict.pass, true, verdict.lines.join('\n'));
  assert.match(line(verdict, 'the band:'), /20 of 20 runs \(100%\) died between 4m00s and 9m00s.*PASS/);
  assert.match(line(verdict, 'the ceiling:'), /DARTER at 20% of 20 deaths.*PASS/);
});

test('a batch that never dies fails the band, and says which way it missed', () => {
  const summaries = [flying(900), flying(900), flying(900), flying(900)];
  const verdict = verdictOf(arcOf(summaries, 900), summaries);
  assert.equal(verdict.pass, false);
  assert.match(line(verdict, 'the band:'), /FAIL/);
  assert.match(verdict.lines.join('\n'), /never died at all/);
  assert.match(verdict.lines.join('\n'), /of the 0 that died at all, 0 \(-\) died in it/,
    'and the second reading, said honestly, which is no share at all');
  assert.doesNotMatch(verdict.lines.join('\n'), /middle one at/,
    'a batch with no deaths has no middle of them to print, and 0m00s would be a time that was never measured');
  assert.match(line(verdict, 'the ceiling:'), /only 0 deaths in 4 runs.*none to share out/, 
    'and a batch with no deaths at all has nothing to share out');
});

test('a batch that dies too soon fails the other way', () => {
  const summaries = [];
  for (let i = 0; i < 12; i++) summaries.push(died(60 + i, 'body:drifter'));
  const verdict = verdictOf(arcOf(summaries, 900), summaries);
  assert.equal(verdict.pass, false);
  assert.match(verdict.lines.join('\n'), /dies too soon: 12 of them before 4m00s/);
});

test('one body taking the batch fails the ceiling, whatever the band says', () => {
  const summaries = [];
  for (let i = 0; i < 16; i++) summaries.push(died(300 + i, 'body:drifter'));
  for (let i = 0; i < 4; i++) summaries.push(died(320 + i, 'body:tank'));
  const verdict = verdictOf(arcOf(summaries, 900), summaries);
  assert.equal(verdict.pass, false);
  assert.match(line(verdict, 'the band:'), /PASS/, 'the band is fine here - the two checks are separate');
  assert.match(line(verdict, 'the ceiling:'), /DRIFTER at 80% of 20 deaths.*FAIL/);
  // The reading under the strict one, because it is the one that says where the arc actually is:
  // every one of these deaths was in the band, and the batch still fails, because it never died.
  assert.match(verdict.lines.join('\n'), /of the 20 that died at all, 20 \(100%\)/);
  assert.match(verdict.lines.join('\n'), /died in it, the middle one at /,
    'and with deaths to average there is a middle to print');
});

test('thirteen deaths are not a share either, and the tool says how many would be', () => {
  // Not a number pulled out of the air: two batches of 24 careless runs put the same body at 46% of
  // one batch's 13 deaths and 31% of the other's, so a ceiling read on 13 deaths is a coin with a
  // percentage stuck on it (NOTES, session 88).
  const summaries = [];
  for (let i = 0; i < 13; i++) summaries.push(died(300 + i, i < 6 ? 'body:drifter' : 'body:tank'));
  for (let i = 0; i < 11; i++) summaries.push(flying(900));
  const verdict = verdictOf(arcOf(summaries, 900), summaries);
  assert.equal(ARC.minDeaths, 20);
  assert.equal(verdict.pass, false);
  assert.match(line(verdict, 'the ceiling:'), /only 13 deaths in 24 runs.*not a share.*FAIL/);
  assert.match(line(verdict, 'the ceiling:'), /try --runs 37/, '24 runs made 13 deaths, so 37 makes 20');
});

test('four deaths are not a share, and the ceiling says so instead of guessing', () => {
  const summaries = [died(300, 'body:tank'), died(310, 'body:tank'), died(320, 'body:tank'),
    died(330, 'body:tank')];
  const verdict = verdictOf(arcOf(summaries, 900), summaries);
  assert.equal(verdict.pass, false);
  assert.match(line(verdict, 'the ceiling:'), /only 4 deaths in 4 runs.*FAIL/);
});

test('the careless build is a die: a seed is always the same build, and every card gets picked', () => {
  const offer = ['damage', 'split', 'pierce'];
  const roll = (seed) => {
    resetPicks(seed);
    const picks = [];
    for (let i = 0; i < 60; i++) picks.push(PICKS.random(null, offer));
    return picks;
  };

  assert.deepEqual(roll(5), roll(5), 'the same seed rolls the same build');
  assert.notDeepEqual(roll(5), roll(6), 'a different seed is a different run of the die');
  assert.equal(new Set(roll(5)).size, offer.length, 'nothing is skipped, whatever the order');

  // The whole point of a die rather than a hand-picked "bad" picker: it is not looking at the
  // table at all. Two ranks deep in one line and nothing in another is a build it is allowed
  // to have, which is exactly what the careful one is written never to do.
  assert.equal(PICKS.random(null, ['nova']), 'nova', 'one card on the table is that card');
});

test('a run plays the same build twice, and the careful default is the default', async () => {
  const game = await bootGame({ root: ROOT, seed: 71 });
  async function at(options) {
    await game.resetToTitle(71);
    return playOneRun(game, Object.assign({ maxSeconds: 160, onFrame: endingItAt(90) }, options));
  }

  const careless = await at({ picks: 'random' });
  assert.equal(careless.picks, 'random', 'the run says which picker answered it');
  assert.deepEqual((await at({ picks: 'random' })).stats.ranks, careless.stats.ranks,
    'the same seed is the same careless build');
  assert.notDeepEqual((await at({ picks: 'wise' })).stats.ranks, careless.stats.ranks,
    'and the two builds are not the same build');

  // The promise every other tool depends on: a run that never asked about picks is the careful
  // one, byte for byte, exactly as it was before the second picker existed.
  assert.deepEqual((await at({})).stats.ranks, (await at({ picks: 'wise' })).stats.ranks);
  assert.equal((await at({})).picks, 'wise');
  game.stop();
});

test('the tool plays a batch and returns two verdicts and an exit code', () => {
  // A 90 second window cannot reach the band, so this batch is expected to come back red. What
  // is being checked is that the tool runs, prints both halves, and means its exit code.
  const short = runTool(['--runs', '3', '--seconds', '90', '--seed', '5', '--quiet']);
  assert.equal(short.status, 1, short.out);
  assert.match(short.out, /the band: .*FAIL/);
  assert.match(short.out, /the ceiling: .*deaths.*- (PASS|FAIL)/);

  const full = runTool(['--runs', '3', '--seconds', '120', '--seed', '5']);
  assert.match(full.out, /the difficulty arc: 3 runs, seeds 5-7/);
  assert.match(full.out, /answering the level-up with a die/);
  assert.match(full.out, /when the batch ended/);
  assert.match(full.out, /what took the last hull/);
  assert.match(full.out, /what every hull of the batch went to/);
});

test('the tool refuses a batch that cannot answer the question', () => {
  assert.equal(runTool(['--runs', '1']).status, 2, 'one seed is an anecdote, not an arc');
  assert.equal(runTool(['--picks', 'clever']).status, 2);
  assert.match(runTool(['--picks', 'clever']).out, /--picks wants one of: wise, random/);
  assert.equal(runTool(['--bot', 'blind']).status, 2);
  assert.equal(runTool(['--nonsense']).status, 2);
});

test('a number the table does not have is refused before a single run is played', () => {
  const done = runTool(['--runs', '3', '--seconds', '30', '--set', 'waves.crowdBaseee=1']);
  assert.equal(done.status, 2);
  assert.match(done.out, /BALANCE has no number called waves\.crowdBaseee/);
  assert.doesNotMatch(done.out, /when the batch ended/, 'nothing was played');
});

test('--set moves the game the batch is played on, and says so in the header', () => {
  // The two promises the flag has to keep. A patched batch that does not say it was patched would be
  // read for years as the shipped game; and a `--set` that quietly missed its field - a misspelling is
  // silently a *new* field - would print the same table twice and be taken for a null result.
  //
  // The patch here is the wave clock, `waves.gap` - the low and high end of how long the director
  // waits between waves - and it is measured on the same four seeds. Nearly twice the arrivals kills
  // more of a careless batch inside the same window, which is the direction the number has to move
  // in for the arc to move at all.
  const plain = runTool(['--runs', '4', '--seed', '5', '--seconds', '150']);
  const patched = runTool(['--runs', '4', '--seed', '5', '--seconds', '150',
    '--set', 'waves.gap.0=0.2', '--set', 'waves.gap.1=0.4']);
  assert.match(patched.out, /with waves\.gap\.0 0\.2, waves\.gap\.1 0\.4/);
  const deaths = (out) => Number(/(\d+) of 4 runs died/.exec(out)[1]);
  assert.ok(deaths(patched.out) > deaths(plain.out),
    'a faster wave clock is more of a crowd, and the batch has to show it:\n'
    + plain.out + '\n' + patched.out);
});

test('a sharded batch is the same batch as one played in a single process', () => {
  // The whole reason sharding is allowed here at all. One game per process is the harness's rule, so
  // a 48-run batch is 48 runs in one process or a few processes sharing the seeds - and if the second
  // answered a different question, every arc number in NOTES would be a coin flip. Same seeds, same
  // window, same bot: the report has to come back identical, header line included.
  const one = runTool(['--seeds', '1-4', '--seconds', '150']);
  const many = runTool(['--seeds', '1-4', '--seconds', '150', '--shards', '4']);
  assert.equal(many.status, one.status);
  assert.equal(many.out, one.out, 'sharding changed the batch:\n' + one.out + '\n' + many.out);
  assert.match(one.out, /the difficulty arc: 4 runs, seeds 1-4/);
});

test('pooling refuses a flag it cannot honour', () => {
  const done = runTool(['--in', '/nope/nothing.jsonl', '--shards', '4']);
  assert.equal(done.status, 2);
  assert.match(done.out, /it has nothing left to shard/);
  const noOut = runTool(['--runs', '2', '--seconds', '20', '--play-only']);
  assert.equal(noOut.status, 2);
  assert.match(noOut.out, /--play-only needs --out/);
});
