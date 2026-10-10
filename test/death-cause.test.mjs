// What the card a run ends on says about how the run ended (PLAN section 4: "Game over: ... and what
// killed the player"). Nothing in the game said it out loud for eight milestones: game/tally.js has
// been writing `body:tank`, `shot:spitter`, `beam:sniper`, `arm:eclipse` and `blast` onto the sheet
// since the tally was built, and the labels stopped at the balance tables.
//
// Three halves, in this order because one process boots one game (see test/session.test.mjs):
//
//   the words themselves - every way there is to lose a hull, a fight's own name, a name this build
//     has never met, and the rack that costs every hull the run lost (game/tally.js `causeWords`,
//     `endingWords`, `hullLedger`);
//
//   the sheet they are printed on - the two new lines have rules of their own and an empty rack that
//     takes its space with it, which is not something a class attribute has ever guaranteed;
//
//   and the card, in a booted game: a death named, a multi-hull death costed row by row, a run
//     given up said as what it was, and both endings' racks - a win has no headline to lean on, so it
//     says every hull it spent down to the last one, where a wreck may leave its last out.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { HOSTS } from '../src/game/codex.js';
import { KINDS, makeEnemy } from '../src/game/kinds.js';
import { damageEnemy } from '../src/game/enemies.js';
import { hitPlayer } from '../src/game/player.js';
import { causeWords, endingWords, hullLedger, hurtByBody, hurtByShot } from '../src/game/tally.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
// The last fight on the schedule, which is the only way a run is won (game/bosses.js).
const SCHEDULE = BALANCE.bosses.schedule;
const LAST = SCHEDULE.length - 1;
const DUE = SCHEDULE[LAST].at;
const HUSH = BALANCE.victory.hush;
const GUARD = BALANCE.victory.guard;

// --- the words ----------------------------------------------------------------

test('every way the ship can lose a hull is said in words', () => {
  assert.equal(causeWords('body:tank'), 'A TANK');
  assert.equal(causeWords('shot:spitter'), "A SPITTER'S SHOT");
  assert.equal(causeWords('beam:sniper'), "A SNIPER'S BEAM");
  assert.equal(causeWords('arm:eclipse'), "THE ECLIPSE'S BLADE");
  assert.equal(causeWords('blast'), 'A BLAST');
});

test('the headline gets a verb the rack does not need', () => {
  assert.equal(endingWords('body:tank'), 'TAKEN BY A TANK');
  assert.equal(endingWords("arm:warden"), "TAKEN BY THE WARDEN'S BLADE");
  // A run given up has no cause on the sheet at all (game/run.js `abandonRun`), and the card says
  // that instead of leaving the line under its own heading empty.
  assert.equal(endingWords(''), 'RUN GIVEN UP');
});

test('a fight is named as a fight, and not as a body', () => {
  // Boss names arrive with their own article (game/bosses.js), so no second one goes in front.
  assert.equal(causeWords('body:eclipse'), 'THE ECLIPSE');
  assert.equal(causeWords('shot:hive'), "THE HIVE'S SHOT");
  assert.equal(endingWords('body:warden'), 'TAKEN BY THE WARDEN');
});

test('every body and fight the codex has a row for can be named', () => {
  for (const host of HOSTS) {
    const words = causeWords('body:' + host.id);
    assert.ok(words.length > 0, host.id + ' said nothing');
    assert.equal(words.indexOf(':'), -1, host.id + ' leaked its tally label: ' + words);
    assert.ok(/^(A|AN|THE) /.test(words), host.id + ' is not a sentence: ' + words);
    assert.ok(words.indexOf(host.name) >= 0,
      host.id + ' was not called by its own name: ' + words);
  }
});

test('every kind the game can field can be named', () => {
  // The codex's list and the crowd's table are held equal by test/kinds.test.mjs; this is the other
  // direction - a kind added to `KINDS` cannot arrive without words on the card with it.
  for (const type of Object.keys(KINDS)) {
    assert.ok(causeWords('body:' + type).length > 2, type + ' has no words');
  }
});

test('a name this build has never met is named by its own text', () => {
  // The same bargain the run log strikes with a ship it does not know (ui/screens.js `logShip`):
  // a label from a newer release is odd text on a card, not a card that throws.
  assert.equal(causeWords('body:grotto'), 'A GROTTO');
  assert.equal(causeWords('venom:widow'), 'A WIDOW');
  assert.equal(causeWords(''), 'THE CROWD', 'and no cause at all is not a blank line');
});

// --- the rack that costs the hulls ---------------------------------------------

test('one hull is not a story, unless nobody has said it yet', () => {
  assert.deepEqual(hullLedger({}, true), []);
  assert.deepEqual(hullLedger({ 'body:tank': 1 }, true), [],
    'the wreck\'s own headline just said what the last hull was');
  // ...but a win has no such headline and neither has a give-up, and one missing hull is the whole
  // story of a run that came through nearly untouched: a card silent about it reads as a flawless one.
  assert.deepEqual(hullLedger({ 'body:tank': 1 }, false), [
    { name: 'A TANK', says: 'TOOK ONE HULL' },
  ]);
});

test('every hull is costed, the costliest thing first', () => {
  const rows = hullLedger({ 'body:tank': 2, 'shot:spitter': 1 }, true);
  assert.deepEqual(rows, [
    { name: 'A TANK', says: 'TOOK TWO HULLS' },
    { name: "A SPITTER'S SHOT", says: 'TOOK ONE HULL' },
  ]);
});

test('the telling is not a chronology, and a big number is still a number', () => {
  // The map's own order is the order the causes first turned up; sorting by cost leaves the two
  // equal-cost ones in that order, and puts the worst first.
  const rows = hullLedger({ 'shot:spitter': 1, 'body:tank': 4, 'body:drifter': 3, blast: 12 }, true);
  assert.equal(rows[0].says, 'TOOK 12 HULLS', 'past the word table a digit is honest');
  assert.equal(rows[1].name, 'A TANK');
  assert.equal(rows[2].name, 'A DRIFTER');
  assert.equal(rows.length, 4);
});

// --- the sheet the two new lines live on ---------------------------------------
//
// The lesson of a release that shipped a `hidden` class with no rule behind it (session 81's
// `winHint`): a line is not styled because the markup asked for it. Both endings grew a line here, so
// the sheet is read the same way that one is.

const markup = fs.readFileSync(path.resolve(ROOT, 'index.html'), 'utf8');

/** The one rule in the sheet whose selector is exactly this. */
function ruleFor(selector) {
  const at = markup.indexOf('\n  ' + selector + ' {');
  assert.ok(at >= 0, 'nothing in the sheet styles ' + selector);
  return markup.slice(at, markup.indexOf('}', at) + 1);
}

test('the cause line and the hull rack are rules and not just classes', () => {
  assert.match(ruleFor('.cause-line'), /color: /, 'the thing that hurt you is the warm colour');
  assert.match(ruleFor('.hull-list'), /display: grid/);
  assert.match(ruleFor('.hull'), /display: flex/);
  assert.match(ruleFor('.hull .name'), /color: /);
  assert.match(ruleFor('.hull .says'), /color: /);
  // ...and an empty rack takes its space with it, which is the whole reason a one-hull wreck's card is
  // exactly as tall as it was before the rack existed.
  assert.match(markup, /\.hull-list:empty \{ display: none; \}/);
});

test('both new lines are tightened on a short window, like the rest of the card', () => {
  const tight = markup.slice(markup.indexOf('@media (max-height: 620px)'),
    markup.indexOf('@media (prefers-reduced-motion'));
  assert.ok(tight.length > 0, 'the short-window block is there');
  assert.match(tight, /\.cause-line \{ margin-top: 8px; \}/);
  assert.match(tight, /\.hull-list \{ margin-top: 8px; gap: 3px; \}/);
  // The title's control list is eleven rows now, since `G` got a row of its own beside the pause; the
  // same block is what keeps all of them on the glass when the window is short.
  assert.match(tight, /\.controls \{ margin-top: 10px; gap: 5px; \}/);
});

// --- the card, in a game --------------------------------------------------------

const game = await bootGame({ root: ROOT, seed: 9 });
const world = game.world;

function press(code) {
  game.key(code, true);
  game.key(code, false);
}

function frames(n) {
  for (let i = 0; i < n; i++) game.step(FRAME);
}

/** Step until `seen` answers true. Bounded: a regression has to fail, not hang the box. */
function until(seen, seconds) {
  const limit = Math.ceil(seconds * 1000 / FRAME);
  let frames = 0;
  while (!seen() && frames < limit) {
    game.step(FRAME);
    frames++;
  }
  return seen();
}

/** A body standing on the ship, ready to be blamed for something. */
function bodyOnTheShip(type) {
  const ship = game.world.player;
  return makeEnemy(game.world, type, ship.x, ship.y, { hp: 500, speed: 0, drop: 0, score: 0 });
}

/** Hurt the ship the way the world does it, and let the tally keep the book. */
function takeHull(cause) {
  game.world.player.invuln = 0;
  hitPlayer(game.world, cause);
}

function launch() {
  game.pressMouse(640, 240);
  game.releaseMouse();
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.PLAY);
}

test('the card says what took the last hull', () => {
  frames(20);
  launch();

  const ship = game.world.player;
  ship.hull = 1;
  ship.invuln = 0;
  ship.fireTimer = 5;                       // no shot, or it would kill the planted body first
  game.enemies.push(makeEnemy(world, 'drifter', ship.x, ship.y, { hp: 1, speed: 0, drop: 0, score: 0 }));
  game.step(FRAME);

  assert.equal(game.stats().state, game.STATE.OVER);
  assert.equal(game.stats().killedBy, 'body:drifter');
  assert.equal(game.screen.finalCause, 'TAKEN BY A DRIFTER');
  assert.deepEqual(game.screen.hulls, [],
    'one hull is not a rack: the headline has already said all there is');
});

test('and costs every hull the run lost, when there was more than one', () => {
  for (let i = 0; i < 40; i++) game.step(FRAME);        // the restart guard, spent
  launch();

  const ship = game.world.player;
  ship.hull = 3;
  const tank = bodyOnTheShip('tank');
  takeHull(hurtByBody(tank));
  takeHull(hurtByShot({ from: 'spitter' }));
  takeHull(hurtByBody(tank));
  game.step(FRAME);

  assert.equal(game.stats().state, game.STATE.OVER);
  assert.equal(game.stats().hull, 0);
  assert.equal(game.screen.finalCause, 'TAKEN BY A TANK', 'the last blow, in the headline');
  assert.deepEqual(game.screen.hulls, [
    { name: 'A TANK', says: 'TOOK TWO HULLS' },
    { name: "A SPITTER'S SHOT", says: 'TOOK ONE HULL' },
  ], 'and every one of them on the rack, costliest first');
});

test('a run that was given up says so, and invents no cause', () => {
  for (let i = 0; i < 40; i++) game.step(FRAME);
  launch();
  frames(30);

  // One hull spent before the giving-up, and nothing else that can spend one: the card has to say what
  // that hull went to, because its own headline is about the giving-up and not about a body.
  world.enemies.length = 0;
  world.spawnTimer = Infinity;
  game.world.player.hull = 3;
  takeHull(hurtByShot({ from: 'spitter' }));

  press('Escape');                          // the pause, which is the only screen that offers G
  assert.equal(game.stats().paused, true);
  press('KeyG');
  game.step(FRAME);

  assert.equal(game.stats().state, game.STATE.OVER);
  assert.equal(game.stats().killedBy, '', 'the tally kept no cause, because there was none');
  assert.equal(game.screen.finalCause, 'RUN GIVEN UP');
  assert.deepEqual(game.screen.hulls, [{ name: "A SPITTER'S SHOT", says: 'TOOK ONE HULL' }],
    'and what the one hull it did lose went to');
});

test('the card never prints a tally label', () => {
  // `body:` and friends are the tally's shorthand for the balance tables. The card is the player's,
  // so a label reaching the glass means a cause escaped with its label still on it.
  const screen = game.screen;
  const lines = [screen.finalCause].concat(screen.hulls.map((row) => row.name + ' ' + row.says));
  for (const line of lines) {
    assert.equal(line.indexOf(':'), -1, 'a raw label reached the card: ' + line);
  }
  assert.ok(screen.finalCause.length > 0, 'and the headline always says something');
});

test('the whole of what a run was is on its card (PLAN section 4)', () => {
  // Score, time survived, kills, level, stardust earned, and what killed the player - all six on the
  // glass at once, and none of them only reachable in a tool.
  const screen = game.screen;
  const stats = game.stats();
  assert.equal(screen.finalScore, stats.score.toLocaleString('en-US'));
  assert.match(screen.stats, new RegExp('LEVEL ' + stats.level));
  assert.match(screen.stats, new RegExp(stats.kills.toLocaleString('en-US') + ' KILLS'));
  assert.match(screen.stats, /\d+s/, 'a clock, in the card\'s own words');
  assert.match(screen.finalDust, /STARDUST\s+\+[\d,]+/u, 'what the run paid between runs');
  assert.ok(screen.finalCause.length > 0, 'and what ended it');
  assert.equal(screen.finalCause, endingWords(stats.killedBy), 'named by the same thing the tally is');
});

test('a win that cost hulls says what they went to, and has no cause', () => {
  // A win is an ending too, and the hulls it spent on the way are the run's story as much as the
  // score is. What it cannot have is a cause: nothing took a win down, and the tally keeps none
  // (game/run.js `winRun`), so the win's card grows the rack and not the line above it.
  frames(40);                                      // the wreck's restart guard, spent
  launch();

  world.elapsed = DUE - 0.05;
  world.bossIndex = LAST;
  world.spawnTimer = Infinity;                    // no crowd, or it would end the run early
  world.enemies.length = 0;
  game.world.player.invuln = Infinity;            // the fight is the only thing that may touch it
  assert.ok(until(() => game.stats().bossCores > 0, 20), 'the last fight never walked in');

  const tank = bodyOnTheShip('tank');
  game.world.player.hull = 3;
  takeHull(hurtByBody(tank));
  takeHull(hurtByBody(tank));
  assert.equal(game.stats().hull, 1, 'one hull left when the fight comes down');

  const boss = game.world.boss;
  damageEnemy(world, boss.enemy, boss.enemy.maxhp * 10, true);
  assert.ok(until(() => game.stats().state === game.STATE.WON, 6), 'the schedule ran out');
  assert.ok(until(() => game.screen.winHidden === false, HUSH + 1), 'the card never came up');

  assert.deepEqual(game.screen.winHulls, [{ name: 'A TANK', says: 'TOOK TWO HULLS' }],
    'what the win spent, costed like anything else');
  assert.equal(game.stats().killedBy, '', 'and nothing is blamed for a run that finished');
});

test('a win that cost one hull says which one, because nothing has said it yet', () => {
  // The same rack, emptied and filled again by the next run - and this one has a single row in it,
  // which is the case the wreck's headline gets to leave out and the win's has no way to hide.
  frames(Math.ceil((GUARD + 1) * 1000 / FRAME));       // the win's guard, spent
  press('KeyR');
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.PLAY, 'a new run is flying');

  world.elapsed = DUE - 0.05;
  world.bossIndex = LAST;
  world.spawnTimer = Infinity;
  world.enemies.length = 0;
  game.world.player.invuln = Infinity;
  assert.ok(until(() => game.stats().bossCores > 0, 20), 'the last fight never walked in again');

  game.world.player.hull = 3;
  takeHull(hurtByShot({ from: 'sniper' }));
  assert.equal(game.stats().hull, 2, 'one hull gone, and then the fight comes down');

  const boss = game.world.boss;
  damageEnemy(world, boss.enemy, boss.enemy.maxhp * 10, true);
  assert.ok(until(() => game.stats().state === game.STATE.WON, 6), 'the schedule ran out');
  assert.ok(until(() => game.screen.winHidden === false, HUSH + 1), 'the card never came up');

  assert.deepEqual(game.screen.winHulls, [{ name: "A SNIPER'S SHOT", says: 'TOOK ONE HULL' }],
    'one row, not two: the last run\'s rows came down with its win');
});
