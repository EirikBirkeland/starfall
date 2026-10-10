// What the pause says about a run's build (PLAN section 4: the pause "shows current upgrades").
//
// The rail at the bottom-left of the screen has always said which lines a run is built from - a mark
// and a row of pips, which is what fits next to the arena. The panel says the same thing in words, and
// it is the only place mid-run that a line's name and what it does are written down (game/upgrades.js
// is the table both of them read, so the two cannot disagree about which lines are in the build).
//
// This file drives the level-up doors for real - shards in, a card taken, a card cut out - because a
// rack painted from a hand-written `world.upgrades` would be a rack painted from a build the game
// could not have. One boot per file, so this is one run levelled up a few times and then a second one
// that has taken nothing at all.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { LINES, lineOf, effectOf, maxRanksOf, isSynergy, banishedLines } from '../src/game/upgrades.js';
import { dropShards } from '../src/game/pickups.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;

const game = await bootGame({ root: ROOT, seed: 4242, width: 1280, height: 720, storage: {} });
const world = game.world;
const ship = world.player;

function press(code, extra) {
  game.key(code, true, extra);
  game.key(code, false, extra);
  game.step(FRAME);
}

function frames(howMany) {
  for (let i = 0; i < howMany; i++) game.step(FRAME);
}

/** The build rack, as the player reads it: one row per line, and whether it is dim. */
const rack = () => game.screen.pauseBuild;

/** The row for one line's name, or null. */
function row(named) {
  return rack().find((line) => line.name === named) || null;
}

/**
 * Pay for exactly one level and step until the run has stopped to spend it - the same door
 * test/level-up.test.mjs uses: the bank starts empty and nothing is left on the floor, so one call is
 * exactly one choice and not two.
 */
function earnALevel() {
  assert.equal(world.paused, false,
    'a held run cannot level up - nothing is stepping to take the shards in');
  world.xp = 0;
  world.shards.clear();
  world.pendingLevels = 0;
  dropShards(world, ship.x, ship.y, Math.ceil(world.xpNeed / BALANCE.shards.xp));
  let frames = 0;
  while (world.state !== game.STATE.LEVEL && frames < 400) {
    game.step(FRAME);
    frames++;
  }
  assert.equal(world.state, game.STATE.LEVEL, 'the shards came in and the run stopped for a choice');
  return world.offer.slice();
}

/** Which line in this deal the run holds none of, or null when it holds all of them. */
function anUntakenLine(offer) {
  return offer.find((id) => world.upgrades[id] === 0 && !isSynergy(id)) || null;
}

/** Which line the run would like an answer about: an untaken one off this deal if there is one. */
function freshDeal() {
  const offer = earnALevel();
  const wanted = anUntakenLine(offer);
  const index = wanted === null ? 0 : offer.indexOf(wanted);
  return { offer: offer, index: index, id: offer[index] };
}

/** What a row should say for a line the run holds `rank` of: the rank, and the card's own words. */
function expected(rowLine, id, rank) {
  assert.equal(rowLine.name, lineOf(id).name);
  assert.equal(rowLine.unknown, false, lineOf(id).name + ' is taken, so it is not dim');
  assert.equal(rowLine.says, isSynergy(id)
    ? effectOf(id)
    : 'RANK ' + rank + ' OF ' + maxRanksOf(id) + '   \u00b7   ' + effectOf(id));
}

test('a run that has levelled up nothing says so, in one dim row', () => {
  press('Space');                           // launch
  world.spawnTimer = Infinity;              // these tests are about the rack
  ship.invuln = Infinity;
  frames(6);
  assert.equal(game.stats().state, game.STATE.PLAY);

  press('Escape');
  assert.equal(game.screen.pauseHidden, false);
  assert.deepEqual(rack(), [{
    name: 'NOTHING YET', says: 'THE FIRST CARD COMES WITH THE FIRST LEVEL', unknown: true,
  }], 'an empty column under a heading reads as a panel that broke');
  press('Escape');
});

test('the cards a run stops for are not a pause, and do not take one', () => {
  const offer = earnALevel();
  assert.equal(world.state, game.STATE.LEVEL, 'the run stopped for its own reason');

  // The cards have three answers of their own - take, cut, deal again - and a pause over them would
  // be a fourth that quits. Esc is refused, quietly, like every press the screen cannot answer.
  press('Escape');
  assert.equal(game.screen.pauseHidden, true, 'no pause over the cards');
  assert.equal(world.state, game.STATE.LEVEL, 'and the choice is still the one thing on the table');

  press('Digit1');
  assert.equal(world.state, game.STATE.PLAY, 'and taking a card brought the run back');
  assert.equal(world.upgrades[offer[0]], 1, 'the first card was the first line');
});

test('the rack lists the lines the run has taken, in the order the cards are dealt from', () => {
  press('Escape');
  const taken = LINES.filter((line) => world.upgrades[line.id] > 0);
  assert.ok(taken.length >= 1, 'the run holds at least the one rank it just took');
  assert.equal(rack().length, taken.length, 'one row per line held, and no more');

  for (let i = 0; i < taken.length; i++) {
    expected(rack()[i], taken[i].id, world.upgrades[taken[i].id]);
  }
  press('Escape');                          // back to the run; the next test has to level one up
});

test('every rank after that joins the rack and keeps its place', () => {
  // Three more levels, each one taken on a line the run did not have yet where the deal allowed it,
  // so the rack ends up a handful of rows and not one - and a row that lost its place in the list is
  // caught by reading the whole list against the table below.
  for (let round = 0; round < 3; round++) {
    const deal = freshDeal();
    press('Digit' + (deal.index + 1));
    assert.equal(world.state, game.STATE.PLAY);
  }
  press('Escape');

  const taken = LINES.filter((line) => world.upgrades[line.id] > 0);
  assert.ok(taken.length >= 2, 'the run now holds more than one line: ' + taken.length);
  assert.equal(rack().length, taken.length);
  for (let i = 0; i < taken.length; i++) {
    expected(rack()[i], taken[i].id, world.upgrades[taken[i].id]);
  }
  press('Escape');
});

test('a line the run cut out of its own deck is on the rack too, dim', () => {
  const deal = freshDeal();
  const cut = deal.id;
  press('Digit' + (deal.index + 1), { shiftKey: true });
  assert.deepEqual(banishedLines(world), [cut], 'the run cut that line out of itself');
  assert.equal(world.state, game.STATE.LEVEL,
    'and a cut card leaves the level owed, so the table is dealt again rather than the run resumed');

  press('Digit1');                           // take what it deals now, and get the run back
  assert.equal(world.state, game.STATE.PLAY);
  assert.equal(world.upgrades[cut] || 0, 0, 'the cut line is out of the deck for good, so it was not taken');

  press('Escape');
  const rowLine = row(lineOf(cut).name);
  assert.notEqual(rowLine, null, 'the road not taken is part of what the run became');
  assert.equal(rowLine.says, 'CUT OUT OF THE RUN');
  assert.equal(rowLine.unknown, true, 'and it is dim, like everything else on a rack that is not in play');

  // The lit rows are still the build, in the table's own order, with the refusals after them.
  const lit = rack().filter((line) => !line.unknown);
  const taken = LINES.filter((line) => world.upgrades[line.id] > 0);
  assert.deepEqual(lit.map((line) => line.name), taken.map((line) => line.name));
});

test('a second run starts the rack again from nothing', async () => {
  await game.resetToTitle(99);
  press('Space');
  world.spawnTimer = Infinity;
  ship.invuln = Infinity;
  frames(6);
  press('Escape');

  const held = Object.keys(world.upgrades).reduce((sum, id) => sum + world.upgrades[id], 0);
  assert.equal(held, 0, 'the new run holds nothing, which is what the rack has to say');
  assert.deepEqual(rack(), [{
    name: 'NOTHING YET', says: 'THE FIRST CARD COMES WITH THE FIRST LEVEL', unknown: true,
  }], 'the last run\'s build is not this run\'s to show');
});
