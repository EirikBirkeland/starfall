// Who is allowed to move the window.
//
// The owner's rule, verbatim (BUG_REPORT_README): "Screen shaking makes the game a
// headache. ONLY use screenshaking extraordinarily, e.g. boss battles only."
//
// That is a feel requirement and it has a body count attached to it, so it is held down as
// tightly as anything else that hurts a player. Four promises, from the table out:
//
//   **Only the extraordinary rows ask for trauma.** Every `shake:` number in `BALANCE` is
//     0 except a boss's, the ship being hurt, and the wreck. The walk below is the
//     whole enforcement: a future row that asks for trauma outside those three goes red
//     here, which is the only way the rule survives somebody adding a sensible-looking
//     `shake: 4` to a new kind two years from now. (The win is not one of the three: the
//     last fight coming down is the same step and is already at the ceiling.)
//   **Nothing asks past the ceiling**, and the ceiling is the end of a run - the biggest
//     thing that happens to you - so no smaller event can stack up over it.
//   **Trauma only ever comes out of the table.** No `shakeIt` call passes a number of its
//     own, so the walk above is the whole list of who can shake and not most of it.
//   **The routine half of a run sits still**, measured on runs the bot actually played
//     (tools/shake-meter.js), and a boss fight is where the movement is. Before this was
//     written, a ten-minute run moved 30% of its frames and the crowd shook harder than
//     the boss did; the last two tests are what stop that coming back.
//
// What is left for a routine event is not nothing: it says what it used to say with
// hit-stop, a ring, sparks and a voice, and the tests for those live with the events.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { BALANCE } from '../src/game/balance.js';
import { killEnemy, damageEnemy } from '../src/game/enemies.js';
import { hitPlayer } from '../src/game/player.js';
import { WEAPONS, setWeapon } from '../src/game/weapons.js';
import { scriptedRun, stepTheWorld, enemyAt, bossOnTheField }
  from '../tools/headless/scripted.js';
import { bootGame } from '../tools/headless/harness.js';
import { playOneRun } from '../tools/headless/bot.js';
import { shakeReport } from '../tools/shake-meter.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const STEP = BALANCE.sim.step;

/**
 * Every `shake` number in the balance table, as `{ path, value }`.
 *
 * The path is the dotted route from `BALANCE` down, which is the only way to say "that
 * number belongs to the bomber" once the table is three thousand lines long.
 */
function shakeRows() {
  const out = [];
  (function walk(node, trail) {
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'shake' && typeof value === 'number') {
        out.push({ path: [...trail, key].join('.'), value });
      } else if (value !== null && typeof value === 'object') {
        walk(value, [...trail, key]);
      }
    }
  })(BALANCE, []);
  return out;
}

/** The rows that may ask for trauma, other than a boss's. Everything else must be 0. */
const ALLOWED = ['playerHit', 'runOver'];

function isExtraordinary(row) {
  return ALLOWED.includes(row.path.replace(/\.shake$/, '')) || row.path.startsWith('bosses.');
}

test('only a boss, a hit on the ship, and the wreck ask to move the window', () => {
  const rows = shakeRows();
  assert.ok(rows.length > 20, 'the walk found the whole table: ' + rows.length + ' shake rows');

  const loud = rows.filter((row) => row.value > 0);
  const offenders = loud.filter((row) => !isExtraordinary(row));
  assert.deepEqual(offenders.map((row) => row.path + ' = ' + row.value), [],
    'these are not a boss, the ship being hurt, or an ending, and they moved the window anyway');

  // And the other half of the same lock: the allowed doors all still have somebody
  // behind them. A row moved out of `bosses` into some new key would pass the test above
  // only by not being a boss any more, which is the one thing it cannot do.
  for (const path of ALLOWED) {
    const row = rows.find((row) => row.path === path + '.shake');
    assert.ok(row !== undefined && row.value > 0, path + ' still asks for trauma, as the rule promises');
  }
  for (const entry of BALANCE.bosses.schedule) {
    const loudHere = loud.filter((row) => row.path.startsWith('bosses.' + entry.boss + '.'));
    assert.ok(loudHere.length > 0, entry.boss + ' still shakes, and it is the reason the rule exists');
  }
});

test('nothing asks for more than the end of a run, and the ceiling is real', () => {
  const cap = BALANCE.screen.shakeCap;
  assert.equal(cap, BALANCE.runOver.shake,
    'the ceiling is the wreck: the biggest single thing in the game owns the top number');

  const over = shakeRows().filter((row) => row.value > cap);
  assert.deepEqual(over.map((row) => row.path + ' = ' + row.value), [],
    'a row asking for more than the ceiling would be a number the cap quietly eats');

  // The ladder the row argues for: the ship being hurt is worth less than a boss walking
  // in, so a boss stays the loudest thing in the room even though it is the third door.
  assert.ok(BALANCE.playerHit.shake < BALANCE.bosses.warden.arrival.shake,
    'a hit on the ship is less than a boss arriving');
  assert.ok(BALANCE.playerHit.shake > BALANCE.screen.shakeNotice,
    'and more than nothing: it is the one routine event that has to be felt');
});

test('the painter and the meter read the same floor', () => {
  // tools/shake-meter.js says how much of a run the window sat still. That claim is worth
  // nothing if the thing it measures is not the number the camera actually uses, so the
  // renderer is required to read the same row out of the table.
  const source = fs.readFileSync(path.join(ROOT, 'src/render/renderer.js'), 'utf8');
  assert.match(source, /BALANCE\.screen\.shakeFloor/,
    'the painter reads the floor from the table, where the meter reads it from');
});

test('no code asks for trauma out of its own head', () => {
  // Every `shakeIt` must take its amount from a balance row, or the table walk above is a
  // list of most of the sources and not all of them.
  const offenders = [];
  (function walk(folder) {
    for (const entry of fs.readdirSync(path.join(ROOT, folder), { withFileTypes: true })) {
      const name = folder + '/' + entry.name;
      if (entry.isDirectory()) { walk(name); continue; }
      if (!entry.name.endsWith('.js')) continue;
      const source = fs.readFileSync(path.join(ROOT, name), 'utf8');
      for (const call of source.match(/shakeIt\([^)]*\)/g) || []) {
        if (call.startsWith('shakeIt(world, amount)')) continue;   // the definition itself
        const amount = call.slice(0, -1).split(',')[1] || '';
        if (!/\w+\.shake$/.test(amount.trim())) offenders.push(name + ': ' + call);
      }
    }
  })('src');
  assert.deepEqual(offenders, [], 'these take a number of their own instead of a row');
});

// --- and what that means in an arena -----------------------------------------

const field = scriptedRun(20261009);
const ship = field.player;
const MID = { x: BALANCE.arena.w / 2, y: BALANCE.arena.h / 2 };

/** One step of the game's own clock, with the ship doing nothing. */
function step() {
  stepTheWorld({});
}

/** Put the world on a fresh sheet of paper: nothing in it, nothing arriving, no trauma. */
function cleared() {
  field.enemies.length = 0;
  field.particles.clear();
  field.rings.clear();
  field.texts.clear();
  field.bullets.clear();
  field.shards.clear();
  field.enemyShots.clear();
  field.spawnTimer = Infinity;
  field.shake = 0;
  field.freeze = 0;
  // And no level-up in the middle of a test: nothing here is about the cards, and a gun that can kill
  // a planted target out of its own three seconds of firing would deal a card and pause the arena on
  // whatever the next test was measuring (session 96's Swarm stopped being able to do that to a tank,
  // and this file's world does not need to be told twice).
  field.xp = 0;
  field.xpNeed = Infinity;
  ship.invuln = Infinity;
  ship.x = MID.x;
  ship.y = MID.y;
}

test('the whole crowd can go down without the window moving', () => {
  // Every kind the game fields, killed in one step each, which is what a wave wiping out
  // around the ship actually is. None of them may spend a pixel of trauma.
  cleared();
  const kinds = Object.keys(BALANCE.kinds);
  const bodies = kinds.map((type, i) => enemyAt(type, MID.x + 60 + i * 40, MID.y));
  assert.equal(bodies.length, kinds.length, 'every kind is in the arena');

  for (const body of bodies) {
    // Some of them die to the first one's blast on the way, which is the point of putting
    // a whole crowd down at once rather than one at a time.
    if (field.enemies.includes(body)) killEnemy(field, body, true);
  }
  for (let i = 0; i < 20; i++) step();

  assert.ok(field.kills >= bodies.length, 'and they all died: ' + field.kills);
  assert.equal(field.shake, 0,
    'and not one of them was worth moving the window for');
});

test('a dash does not move the window', () => {
  // A dash is spent a dozen times a run, and the ship has already been thrown about by
  // it; the streak and the burst are the whole of the report.
  cleared();
  ship.invuln = 0;
  ship.dashCd = 0;
  ship.dashLeft = 0;
  stepTheWorld({ dash: true, aimX: ship.x, aimY: ship.y - 300 });
  assert.ok(ship.dashLeft > 0, 'the dash started');
  for (let i = 0; i < 40; i++) step();

  assert.equal(ship.dashLeft, 0, 'and it finished');
  assert.equal(field.shake, 0, 'and the window never moved');
});

test('firing every primary does not move the window', () => {
  // The guns are the metronome a run is made of: a lance pulling five pixels of trauma a
  // pull, a swarm landing three times a second, and the room is never still again.
  const defaultGun = field.weapon;
  for (const weapon of WEAPONS) {
    setWeapon(field, weapon.id);
    cleared();
    const target = enemyAt('tank', MID.x + 110, MID.y);
    for (let i = 0; i < Math.round(3 / STEP); i++) {
      stepTheWorld({ firing: true, aimX: target.x, aimY: target.y });
    }
    assert.ok(target.hp < target.maxhp, weapon.id + ' actually went off');
    assert.equal(field.shake, 0, weapon.id + ' spent no trauma');
  }
  setWeapon(field, defaultGun);
});

test('a hit on the ship is still felt', () => {
  // The one door outside a boss that stays open, and it stays open on purpose: a run that
  // could not feel itself being hurt would be worse than one that shakes too much.
  cleared();
  ship.invuln = 0;
  const before = ship.hull;
  hitPlayer(field, 'test');

  assert.equal(ship.hull, before - 1, 'the hit landed');
  assert.equal(field.shake, BALANCE.playerHit.shake, 'and it spent exactly what the row says');

  // And it fades: trauma is a thing that stops, not a thing that stays.
  for (let i = 0; i < Math.round(1 / STEP); i++) step();
  assert.equal(field.shake, 0, 'a second later the room is still again');
});

test('a boss still weighs what it weighed', () => {
  // The half of the rule that could have been quietly lost on the way: muting the crowd
  // must not mute a boss. The Warden walks in and comes down, and the coming down is still
  // the loudest thing short of losing the run.
  cleared();
  const boss = bossOnTheField(0);
  field.shake = 0;
  damageEnemy(field, boss.enemy, boss.enemy.maxhp * 10, true);

  let peak = field.shake;
  let guard = 0;
  while (field.boss !== null && guard < 1000) {
    step();
    peak = Math.max(peak, field.shake);
    guard++;
  }
  assert.ok(field.boss === null, 'the fight is over');
  // The peak and not the last reading: coming down stops the run for a moment (`hitStop`),
  // trauma fades through a stop like any other time, and by the step the cage is gone the
  // loudest of it has already spent itself going back down.
  assert.ok(peak >= BALANCE.bosses.warden.death.shake,
    'the death spent its ' + BALANCE.bosses.warden.death.shake + ' px: peak ' + peak.toFixed(1));
});

// --- and on a run the bot actually played ------------------------------------

// One boot, two runs on it: `main.js` is evaluated once per fake page (test/session.test.mjs
// says why), so a file that wants two played runs plays them the way a player does - one
// page, back to the title in between.
const game = await bootGame({ root: ROOT, seed: null });

/**
 * One played run, sampled every frame: what the camera was doing, second by second.
 * Trauma is a thing that happens over time, and a summary taken at the end of a run cannot
 * see the shape of it, so there is nothing for it but to stand by the frame loop.
 */
async function stillnessOf(options) {
  const samples = [];
  await game.resetToTitle(options.seed === undefined ? 20261009 : options.seed);
  const summary = playOneRun(game, {
    maxSeconds: options.maxSeconds,
    at: options.at,
    every: 0,
    onFrame: (played) => samples.push({
      t: played.world.elapsed,
      shake: played.world.shake,
      boss: played.world.boss !== null,
    }),
  });
  return { report: shakeReport(samples), summary };
}

test('a crowd run sits still', async () => {
  // Ninety seconds of the ordinary half of a run - the crowd, the guns, a ship being hit -
  // with no boss in it. This is the number the owner was complaining about, and it used to
  // be 70%. It is allowed to be beaten; what it may not do is drift back.
  const { report, summary } = await stillnessOf({ maxSeconds: 90 });
  assert.ok(summary.stats.kills > 50, 'the run fought: ' + summary.stats.kills + ' kills');
  assert.ok(report.still >= 0.95,
    'the window sat still for ' + Math.round(report.still * 100) + '% of the frames');
  assert.ok(report.rolling <= 0.02,
    Math.round(report.rolling * 100) + '% of the frames were visibly rolling');
  assert.ok(report.crowd.max <= BALANCE.playerHit.shake,
    'nothing in the crowd moved it past a hit on the ship: peak ' + report.crowd.max.toFixed(1));
});

test('a boss run is where the movement is', async () => {
  // The other half of the same claim, and the one that would be easy to lose: a game that
  // never shook at all would pass the test above and have thrown the feel away with the
  // headache. Put the bot in front of the Warden and the room moves again.
  const { report, summary } = await stillnessOf({ maxSeconds: 200, at: 295 });
  assert.ok(report.boss.frames > 0, 'a boss was on the field: ' + summary.stats.boss);
  assert.ok(report.boss.mean > report.crowd.mean,
    'the fight shook more than the crowd did: ' + report.boss.mean.toFixed(2)
    + ' px against ' + report.crowd.mean.toFixed(2));
  assert.ok(report.boss.max >= BALANCE.bosses.warden.arrival.shake,
    'the arrival landed: peak ' + report.boss.max.toFixed(1) + ' px');
});
