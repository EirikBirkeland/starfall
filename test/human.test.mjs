// The third player (tools/headless/human.js): the aware bot's eyes behind a person's hands.
//
// The claims this file has to keep are of two kinds, and they are deliberately kept apart.
//
// The first is the *mechanism*, and it is tested on a parked world with no luck in it: a look
// holds its answer until the next one; the next one comes when the dial says and not on the dot;
// a threat that appears between two looks is answered at the second one, which is what a reaction
// time *is*; one look in four is spent on something other than the field; and what the hand
// commits to is turned a little away from what the eye saw. Every one of those is a dial in
// `HUMAN`, so each test also says which way the dial moves when it is moved.
//
// The second is the one that matters, and it can only be measured by getting hit: a person is hit
// more often than a program that re-decides every simulation step, and much less often than a
// ship that stands still. A weaver pack is what measures it - fast enough that being two hundred
// milliseconds late costs something, slow enough that the difference is the player's and not the
// world's.
//
// The third is that a bot's luck is not the game's: a seed is one person having one afternoon, and
// the whole file's randomness lives in a stream of its own (tools/headless/human.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { BALANCE } from '../src/game/balance.js';
import { makeEnemy } from '../src/game/kinds.js';
import { enemyShotAt } from '../src/game/enemyshots.js';
import { scriptedRun, stepTheWorld, enemyAt } from '../tools/headless/scripted.js';
import { SKILL, escapeDirection } from '../tools/headless/threats.js';
import { HUMAN, HumanDodge } from '../tools/headless/human.js';
import { bootGame } from '../tools/headless/harness.js';
import { playOneRun, POLICIES, FRAME_MS } from '../tools/headless/bot.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = FRAME_MS / 1000;
const ARENA = BALANCE.arena;
const C = { x: ARENA.w / 2, y: ARENA.h / 2 };
const SPIT = BALANCE.kinds.spitter.spit;
const STILL = { x: 0, y: 0 };

/**
 * A run parked with the ship in the middle of an empty arena and able to be hurt: the scripted
 * world makes it immortal and the threat models are the subject here, not the hull.
 */
function park(hull) {
  const field = scriptedRun(3);
  const ship = field.player;
  ship.x = C.x;
  ship.y = C.y;
  ship.px = C.x;
  ship.py = C.y;
  ship.invuln = 0;
  ship.hull = hull === undefined ? 9 : hull;
  return field;
}

/** A spitter's shot, in the air at (x, y) and travelling along (dx, dy). */
function shotAt(field, x, y, dx, dy) {
  return enemyShotAt(field, x, y, dx, dy, SPIT.shot);
}

/** A shot aimed straight down the middle of the ship from 200 px to its west. */
function aimedAtTheShip(field) {
  return shotAt(field, C.x - 200, C.y, 1, 0);
}

/** `n` of a kind, evenly around the middle of the arena, `radius` out. */
function ring(field, kind, n, radius) {
  for (let i = 0; i < n; i++) {
    const bearing = (i / n) * Math.PI * 2;
    field.enemies.push(makeEnemy(field, kind,
      C.x + Math.cos(bearing) * radius, C.y + Math.sin(bearing) * radius));
  }
}

/**
 * Drive the ship for `seconds` at the tools' frame rate - two of the game's fixed steps and one
 * look per frame - and answer how many times the ship was hit. `decide` is the player: it gets
 * the world and returns the direction to be driven.
 */
function drive(field, seconds, decide) {
  let hits = 0;
  let hull = field.player.hull;
  const frames = Math.round(seconds / FRAME);
  for (let i = 0; i < frames; i++) {
    const want = decide(field);
    const input = {
      moveX: want.x, moveY: want.y, moving: Math.hypot(want.x, want.y) > 0.01,
    };
    stepTheWorld(input);
    stepTheWorld(input);
    if (field.player.hull < hull) { hits++; hull = field.player.hull; }
    if (field.state !== 1) break;
  }
  return hits;
}

/** The aware bot's answer, re-decided every frame: the control that has no hands. */
function perfect(field) {
  const escape = escapeDirection(field);
  return escape.pressure >= SKILL.calm ? escape : STILL;
}

/** The most frames a look can last, and the fewest, in whole frames. */
const LOOK_SHORT = Math.floor(HUMAN.lookEvery * (1 - HUMAN.lookJitter) / FRAME) - 1;
const LOOK_LONG = Math.ceil(HUMAN.lookEvery * (1 + HUMAN.lookJitter) / FRAME) + 1;

/** Ask the same question of a fresh player once per frame and keep every answer. */
function askFor(human, field, frames, idle) {
  const answers = [];
  for (let i = 0; i < frames; i++) answers.push(human.look(field, FRAME, idle));
  return answers;
}

// --- the mechanism ------------------------------------------------------------------

test('a look holds its answer until the next one', () => {
  const field = park();
  const human = new HumanDodge();
  human.reset(7);

  const answers = askFor(human, field, LOOK_LONG + 4, { x: 1, y: 0 });
  const held = answers[0];

  assert.ok(Math.hypot(held.x, held.y) > 0.9, 'it decided to go somewhere: ' + JSON.stringify(held));
  for (let i = 1; i < LOOK_SHORT; i++) {
    assert.deepEqual(answers[i], held, 'frame ' + i + ' drove somewhere else while the look held');
  }
  assert.notDeepEqual(answers[LOOK_LONG], held, 'and after the longest a look can last it had looked again');
});

test('the next look comes when the dial says, and not on the dot', () => {
  const field = park();
  const low = HUMAN.lookEvery * (1 - HUMAN.lookJitter);
  const high = HUMAN.lookEvery * (1 + HUMAN.lookJitter);
  const gaps = [];

  for (let seed = 1; seed <= 24; seed++) {
    const human = new HumanDodge();
    human.reset(seed);
    const first = human.look(field, FRAME, { x: 1, y: 0 });
    let t = FRAME;
    // A fresh look turns the held vector (see `fumble`), so a changed answer is a look.
    while (t < 4) {
      const next = human.look(field, FRAME, { x: 1, y: 0 });
      if (next.x !== first.x || next.y !== first.y) break;
      t += FRAME;
    }
    gaps.push(t);
  }

  for (const gap of gaps) {
    assert.ok(gap >= low - FRAME, 'a look came after ' + gap.toFixed(3) + 's, under the floor of '
      + low.toFixed(3));
    assert.ok(gap <= high + FRAME, 'a look came after ' + gap.toFixed(3) + 's, over the ceiling of '
      + high.toFixed(3));
  }
  assert.ok(new Set(gaps.map((gap) => gap.toFixed(4))).size > 4,
    'every gap was the same length: the jitter is not being spent');
  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  assert.ok(Math.abs(mean - HUMAN.lookEvery) < HUMAN.lookEvery * 0.15,
    'the average look lasted ' + mean.toFixed(3) + 's against a dial of ' + HUMAN.lookEvery);
});

test('a threat that appears between two looks is answered at the second one', () => {
  const field = park();
  const human = new HumanDodge();
  human.reset(5);
  human.look(field, FRAME, STILL);          // an empty arena, and it commits to nothing

  aimedAtTheShip(field);                    // ...and then this arrives, mid-look

  let t = 0;
  let answered = 0;
  while (t < 2 && !answered) {
    const want = human.look(field, FRAME, STILL);
    if (Math.hypot(want.x, want.y) > 0.5) answered = t;
    t += FRAME;
  }

  assert.ok(answered > 0, 'it never answered a shot aimed down its own hull');
  assert.ok(answered >= HUMAN.lookEvery * (1 - HUMAN.lookJitter) - FRAME,
    'it answered in ' + answered.toFixed(3) + 's: faster than a reaction time is a bug');
  assert.ok(answered <= HUMAN.lookEvery * (1 + HUMAN.lookJitter) + 2 * FRAME,
    'it took ' + answered.toFixed(3) + 's, which is later than the dial allows');

  const want = human.look(field, FRAME, STILL);
  assert.ok(Math.abs(want.y) > 0.9, 'the answer is off the line, not along it: ' + want.y);
  assert.ok(Math.abs(want.x) < Math.sin(HUMAN.fumble) + 0.01,
    'and it is the same answer the program would give, turned by the hand: ' + want.x);
});

test('one look in four is spent on something other than the field', () => {
  const field = park();
  aimedAtTheShip(field);
  const human = new HumanDodge();
  human.reset(11);

  // With the shot in the air, the only way the ship stands still is a look that was elsewhere,
  // and every look lasts the same average time, so the share of frames it stands still is the
  // share of looks it spent elsewhere.
  const frames = askFor(human, field, 3000, STILL);
  const away = frames.filter((want) => Math.hypot(want.x, want.y) < 0.01).length;
  const share = away / frames.length;

  assert.ok(share > 0.08, 'it never looked away: ' + share);
  assert.ok(share < 0.45, 'it looked away too often to be a player: ' + share);

  assert.equal(askFor(new HumanDodge({ ...HUMAN, attention: 1 }), field, 600, STILL)
    .filter((want) => Math.hypot(want.x, want.y) < 0.01).length, 0,
    'at full attention a shot down the hull still bought a step');
  assert.ok(askFor(new HumanDodge({ ...HUMAN, attention: 0 }), field, 600, STILL)
    .every((want) => Math.hypot(want.x, want.y) < 0.01),
    'at no attention it never moved at all, which is the other end of the dial');
});

test('the hand commits to something a little off what the eye saw', () => {
  const field = park();
  enemyAt('drifter', C.x - 110, C.y);       // one body, due west: the way out is due east
  const human = new HumanDodge();
  human.reset(4);

  const angles = [];
  for (let i = 0; i < 4000; i++) {
    const want = human.look(field, FRAME, STILL);
    if (Math.hypot(want.x, want.y) > 0.5) angles.push(Math.atan2(want.y, want.x));
  }

  assert.ok(angles.length > 100, 'the body bought no answers: ' + angles.length);
  const off = angles.map((angle) => Math.abs(angle));
  assert.ok(Math.max(...off) <= HUMAN.fumble + 1e-9,
    'a dodge came out ' + Math.max(...off).toFixed(3) + ' rad off a line it never saw');
  assert.ok(Math.max(...off) > 0.05, 'the fumble was never spent: ' + Math.max(...off));
  const mean = off.reduce((sum, angle) => sum + angle, 0) / off.length;
  assert.ok(mean > HUMAN.fumble * 0.3 && mean < HUMAN.fumble * 0.7,
    'the average dodge was ' + mean.toFixed(3) + ' rad off, which is not what a '
    + HUMAN.fumble + ' rad hand means');
});

test('one seed is one person having one afternoon', () => {
  const field = park();
  aimedAtTheShip(field);
  ring(field, 'drifter', 3, 240);
  const read = (seed) => {
    const human = new HumanDodge();
    human.reset(seed);
    return JSON.stringify(askFor(human, field, 400, STILL));
  };

  const once = read(21);
  assert.equal(read(21), once, 'the same seed drove differently twice');
  assert.notEqual(read(22), once, 'two seeds were the same afternoon');
});

test('looking is free: it reads the world and leaves it alone', () => {
  const field = park();
  aimedAtTheShip(field);
  ring(field, 'spitter', 2, 300);
  const before = JSON.stringify({
    ship: field.player, enemies: field.enemies, shots: field.enemyShots.items,
  });
  const human = new HumanDodge();
  human.reset(9);

  askFor(human, field, 500, STILL);

  assert.equal(JSON.stringify({
    ship: field.player, enemies: field.enemies, shots: field.enemyShots.items,
  }), before, 'and looking at it changed something in it');
});

// --- and does it play like a person -------------------------------------------------

test('a person is hit more than a program and far less than a statue', () => {
  // Five weavers, thirty seconds. Fast enough that being a fifth of a second late costs
  // something, and slow enough that what is being measured is the player and not the world.
  const flown = (seconds, decide) => {
    const field = park(60);
    ring(field, 'weaver', 5, 200);
    return drive(field, seconds, decide);
  };

  const program = flown(30, perfect);
  const statue = flown(30, () => STILL);
  const people = [];
  for (let seed = 1; seed <= 6; seed++) {
    const human = new HumanDodge();
    human.reset(seed);
    people.push(flown(30, (field) => human.look(field, FRAME, STILL)));
  }

  assert.ok(program <= 1, 'the program that re-decides every step was hit ' + program + ' times');
  assert.ok(statue >= 10, 'the ship that stood still was hit only ' + statue + ' times');
  const worst = Math.max(...people);
  const best = Math.min(...people);
  assert.ok(best > program, 'a person dodged as well as the program (' + best + ')');
  assert.ok(worst < statue, 'a person was dodged like a statue (' + worst + ')');
});

test('the third policy is one the tools will run', () => {
  assert.deepEqual(Object.keys(POLICIES), ['naive', 'aware', 'human']);

  const out = execFileSync(process.execPath,
    [path.join(ROOT, 'tools', 'simulate.js'), '--seconds', '30', '--seed', '5', '--bot', 'human'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /^seed 5  human  /, 'the report did not say which player sat down');
});

test('a seed replays the same person, and its dice are not the game\'s', async () => {
  const game = await bootGame({ root: ROOT, seed: 303 });
  const play = async () => {
    await game.resetToTitle(4242);
    return playOneRun(game, { maxSeconds: 300, policy: 'human', picks: 'random' });
  };

  const first = await play();
  const second = await play();

  assert.ok(first.stats.score > 0, 'the run never played at all: ' + first.seconds + 's');
  assert.ok(first.stats.level >= 2, 'it stopped answering the level-up: ' + first.stats.level);
  assert.equal(first.seconds, second.seconds, 'the same seed played twice, twice');
  assert.equal(first.stats.score, second.stats.score);
  assert.equal(first.policy, 'human', 'the run says who flew it');
  game.stop();
});
