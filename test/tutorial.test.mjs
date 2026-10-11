// The three prompts that teach the hand (PLAN milestone 10's first-run tutorial): what arrives on the
// glass, what makes it go away, and what the save keeps about it afterwards.
//
// Two halves, like most files about a feature that is half simulation and half picture. The first half
// is the plate in a real visit: which lesson is up, how long it stays, and what the run can do instead
// of reading it. The second is the ledger - what an ending writes into the document and what the next
// run refuses to say because of it.
//
// Everything here is measured through the game's own doors: `stats().tip` is the sentence on the plate,
// `world.prompt` is the board it was read off, and `tutorialLayout` is the same arithmetic the painter
// does, which is how a test with no pixels can say a word was painted inside the box it was drawn in.
//
// One boot reads one save and one boot holds one world (tools/headless/harness.js), so every test puts
// the visit back the way it wants it with `visit()` first - which is honest, because the two things it
// writes (`world.tips`, `world.pastRuns`) are exactly the two the visit read out of the document when
// it opened, and `resetToTitle` runs the same `resetRun` a new run runs.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { botFrame, fingerprint, FRAME_MS, startBotRun } from '../tools/headless/bot.js';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { makeEnemy } from '../src/game/kinds.js';
import { levelUp } from '../src/game/progress.js';
import { LESSONS, tipsFromSave } from '../src/game/tutorial.js';
import { tutorialLayout } from '../src/render/tutorial.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const SAVE_KEY = 'starfall.save';
const SEED = 51;

const game = await bootGame({ root: ROOT, seed: SEED, width: 1280, height: 720 });
const world = game.world;

/** The words a lesson is painted with. */
function saysOf(id) {
  for (const lesson of LESSONS) if (lesson.id === id) return lesson.says;
  return null;
}

/** Which lesson, if any, is on the glass right now. */
function tipIs(id) {
  return game.stats().tip === saysOf(id);
}

function frames(n) {
  for (let i = 0; i < n; i++) game.step(FRAME);
}

/** How many frames `n` seconds is, at the frame rate every timing number here is measured at. */
function framesOf(n) {
  return Math.round(n * 1000 / FRAME);
}

function press(code) {
  game.key(code, true);
  game.key(code, false);
}

/**
 * Put the visit back on its title screen as a save that has flown `runs` runs and already been
 * through `tips`. This is the only way a test can ask "what does a second visit see", because a real
 * second visit is a browser that has been closed and opened, and all the visit carries over is these
 * two numbers.
 */
async function visit(opts) {
  const setup = opts || {};
  world.tips = (setup.tips || []).slice();
  world.pastRuns.length = 0;
  for (let i = 0; i < (setup.runs || 0); i++) {
    world.pastRuns.push({ seed: 900 + i, ship: 'wisp', seconds: 60, score: 100, won: false });
  }
  await game.resetToTitle(setup.seed === undefined ? SEED : setup.seed);
}

/** Launch with the launch key, which is not also the gun. */
function launch() {
  press('Space');
  frames(2);
  assert.equal(game.stats().state, STATE.PLAY, 'the run launched');
}

/** Launch with a click, and keep the button held: a click that launches also fires. */
function launchClicking() {
  game.pressMouse(640, 300);
  frames(2);
  assert.equal(game.stats().state, STATE.PLAY, 'the run launched');
}

/** A body parked where it is told to stand, harmless and unmoving. */
function park(kind, x, y) {
  game.enemies.push(makeEnemy(world, kind, x, y, { hp: 40, speed: 0, drop: 0, score: 0 }));
}

/** Park a lethal body on the ship and run one frame: the run is over afterwards. */
function killTheShip() {
  const ship = game.player;
  ship.hull = 1;
  ship.invuln = 0;
  ship.fireTimer = 5;
  game.enemies.push(makeEnemy(world, 'drifter', ship.x, ship.y, {
    hp: 1, speed: 0, drop: 0, score: 0,
  }));
  game.step(FRAME);
  assert.equal(game.stats().state, STATE.OVER, 'the run ended');
}

/** Fly the ship by holding one direction for `seconds` of run time. */
function flyFor(seconds) {
  game.key('KeyD', true);
  frames(framesOf(seconds));
  game.key('KeyD', false);
}

/** The save's own `tutorial` section, or an empty one when the document has nothing to say. */
function tipsInSave() {
  const doc = JSON.parse(game.storage[SAVE_KEY] || '{}');
  return doc.tutorial === undefined ? { learned: [] } : doc.tutorial;
}

// --- the three lines themselves ------------------------------------------------

test('there are three lessons, in the order they are taught, and each names a key the title names', () => {
  assert.equal(LESSONS.length, 3, 'PLAN asks for three prompts, and three is the number');
  assert.deepEqual(LESSONS.map((lesson) => lesson.id), ['fly', 'fire', 'dash'],
    'fly, then shoot, then leave');
  const ids = LESSONS.map((lesson) => lesson.id);
  assert.equal(new Set(ids).size, ids.length, 'no lesson twice');
  for (const lesson of LESSONS) {
    // The id is what the save remembers, so it has to be a name the document will hold (core/save.js).
    assert.match(lesson.id, /^[a-z][a-z0-9_-]{0,31}$/, lesson.says + ' has a memorable id');
    assert.equal(lesson.says, lesson.says.toUpperCase(),
      lesson.says + ' is written in caps like every other word in the game');
    assert.ok(lesson.says.length <= 34, lesson.says + ' is short enough for one plate');
  }
});

test('every key a lesson names is a key the title screen already prints', () => {
  // The plate and the control list are two places that must not drift apart: a hint that says RIGHT
  // BUTTON for a dash the title says is RMB is a hint about a key nobody will find.
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const named = { fly: 'W A S D', fire: 'MOUSE', dash: 'SPACE' };
  for (const lesson of LESSONS) {
    const key = named[lesson.id];
    assert.ok(lesson.says.indexOf(key) === 0, lesson.says + ' starts with the key it is about');
    assert.ok(page.indexOf(key) >= 0, 'and the title screen prints ' + key + ' too');
  }
});

test('each lesson, put on the glass, is painted inside its plate', async () => {
  // The three of them are the longest words the plate ever has to hold, so this is the fit test: what
  // was painted, at what size, in what box - read out of the frame the painter itself filled.
  const need = { fly: [], fire: ['fly'], dash: ['fly', 'fire'] };
  for (const lesson of LESSONS) {
    await visit({ tips: need[lesson.id] });
    launch();
    if (lesson.id !== 'fly') park('drifter', game.player.x + 60, game.player.y);
    frames(3);
    const plate = tutorialLayout(1280, 720);
    assert.notEqual(plate, null, lesson.id + ' got the plate');
    assert.equal(plate.text, saysOf(lesson.id), 'and it is the lesson it was supposed to be');
    const words = game.texts().filter((word) => word.text === lesson.says);
    assert.ok(words.length > 0, '"' + lesson.says + '" was actually painted');
    for (const word of words) {
      assert.ok(word.w <= plate.textW,
        '"' + lesson.says + '" fits its plate: ' + word.w + ' in ' + plate.textW);
      assert.equal(word.size, 15, 'and none of it had to be shrunk');
      assert.ok(word.y > plate.y && word.y < plate.y + plate.h, 'the words sit inside the box');
      assert.equal(word.x, plate.textX, 'and are centred on it');
    }
  }
});

// --- the plate in a visit -----------------------------------------------------

test('a first run is told how to fly, and where the plate goes', async () => {
  await visit();
  launch();
  assert.ok(tipIs('fly'), 'the fly lesson is the one on the glass');
  const plate = tutorialLayout(1280, 720);
  assert.ok(plate.x > 0 && plate.x + plate.w < 1280, 'the plate is inside the window');
  assert.ok(plate.y + plate.h < 720 - 34, 'and it clears the XP bar, which sits at H - 34');
  assert.ok(plate.glow > 0 && plate.glow <= 1, 'arriving, not shouting');
  assert.equal(world.prompt.id, 'fly', 'one lesson at a time is the whole design');
});

test('flying learns it, the plate goes on its own way out, and the next lesson takes its place', async () => {
  await visit();
  launch();
  assert.ok(tipIs('fly'));
  // Watched from the first key press rather than after it: the lesson is learned about a second into
  // the flight, and the way out is half a second, so a test that looked only when the flying was over
  // would find the plate already gone and call it a cut.
  let sawFading = false;
  let sawGun = false;
  game.key('KeyD', true);
  for (let i = 0; i < framesOf(3) && !(sawFading && sawGun); i++) {
    game.step(FRAME);
    if (world.prompt.out > 0 && world.prompt.id === 'fly') sawFading = true;
    if (tipIs('fire')) sawGun = true;
  }
  game.key('KeyD', false);
  assert.ok(world.prompt.learned.indexOf('fly') >= 0, 'the hull has been flown');
  // The way out is a fade and not a cut: the plate is still there, dimmer, for `away` seconds.
  assert.ok(sawFading, 'the plate spent its own way out leaving');
  assert.ok(sawGun, 'and the gun took the plate next, because bodies are in the arena now');
});

test('a run that has already fired is never shown the gun', async () => {
  // The latch is on the gun going and not on the prompt being read - which is the whole difference
  // between this and a hint. A click on the title launches the run and fires the ship at the same
  // moment, so this visit had shot before it was ever told it could.
  await visit();
  launchClicking();
  assert.ok(world.prompt.learned.indexOf('fire') >= 0, 'the gun went, so the lesson is done');
  const seen = new Set();
  game.key('KeyD', true);
  for (let i = 0; i < framesOf(6); i++) {
    game.step(FRAME);
    if (game.stats().state !== STATE.PLAY) break;
    seen.add(game.stats().tip);
  }
  game.key('KeyD', false);
  game.releaseMouse(0);
  assert.ok(!seen.has(saysOf('fire')), 'the gun was never said out loud: ' + Array.from(seen));
  assert.ok(seen.has(saysOf('fly')), 'the fly lesson still came, because nothing had been flown');
});

test('the dash waits for a body inside one dash, then the dash itself learns it', async () => {
  await visit({ tips: ['fly', 'fire'] });
  launch();
  assert.equal(game.stats().tip, '', 'nothing to say yet: the room is empty');
  const ship = game.player;
  ship.invuln = Infinity;
  const near = BALANCE.tutorial.close;
  park('drifter', ship.x + near + 40, ship.y);
  frames(3);
  assert.equal(game.stats().tip, '', 'a body one dash and forty px away is not a reason to dash');
  game.enemies[game.enemies.length - 1].x = ship.x + near - 30;
  frames(3);
  assert.ok(tipIs('dash'), 'the same body inside one dash is');
  press('Space');
  frames(2);
  assert.ok(world.prompt.learned.indexOf('dash') >= 0, 'and one dash is the whole lesson');
  frames(60);
  assert.equal(game.stats().tip, '', 'with nothing left to teach the plate is empty for good');
  assert.equal(world.prompt.id, '');
});

test('a prompt nobody answers steps back, comes back once, and then leaves it alone', async () => {
  // Only the fly lesson is left to teach, so anything that appears on the plate is that one and the
  // counting is honest: the other two are learned already and cannot take the plate when this one runs
  // out of asks.
  await visit({ tips: ['fire', 'dash'] });
  launch();
  game.player.invuln = Infinity;         // this test is about a plate, not about a wreck
  const spec = BALANCE.tutorial;
  assert.ok(tipIs('fly'), 'up at the start');
  frames(framesOf(spec.hold - 1));
  assert.ok(tipIs('fly'), 'still up a second before it steps back');
  frames(framesOf(spec.back / 2));
  assert.equal(game.stats().tip, '', 'gone, unanswered');
  frames(framesOf(spec.back / 2 + 1));
  assert.ok(tipIs('fly'), 'and back again after its wait');
  frames(framesOf(spec.hold + 1));
  assert.equal(game.stats().tip, '', 'twice is the most it asks');
  frames(framesOf(spec.hold + spec.back + 10));
  assert.equal(game.stats().tip, '', 'and it does not ask a third time');
  assert.equal(world.prompt.asks.fly, spec.asks, 'the board knows how often it asked');
  assert.equal(world.prompt.learned.length, 0, 'and it taught nothing, because nobody flew');
});

test('the plate keeps off every screen that has taken the window', async () => {
  await visit();
  launch();
  assert.notEqual(tutorialLayout(1280, 720), null, 'up while the run is flying');

  levelUp(world);                        // the cards: the run stopped for the game
  assert.equal(world.state, STATE.LEVEL);
  assert.equal(tutorialLayout(1280, 720), null, 'the cards own the window');
  assert.ok(tipIs('fly'), 'but the lesson is still owed, because it has not been learned');
  press('Digit1');
  frames(2);

  press('Escape');                       // the pause: the run stopped for the player
  frames(2);
  assert.equal(game.stats().paused, true);
  assert.equal(tutorialLayout(1280, 720), null, 'and so does the pause rack');
  press('Escape');
  frames(2);
  assert.equal(game.stats().paused, false);
  assert.notEqual(tutorialLayout(1280, 720), null, 'and the plate is back with the run');

  killTheShip();
  assert.equal(tutorialLayout(1280, 720), null, 'an ending is not taught either');
});

// --- what the save keeps ------------------------------------------------------

test('what a run learned is banked at its ending, and the next run does not say it again', async () => {
  await visit();
  launch();
  flyFor(2);
  assert.ok(world.prompt.learned.indexOf('fly') >= 0);
  killTheShip();

  const saved = tipsInSave();
  assert.ok(saved.learned.indexOf('fly') >= 0,
    'the document knows the hull has been flown: ' + saved.learned);
  assert.deepEqual(game.stats().tipsLearned, saved.learned, 'and so does the visit');

  await visit({ seed: SEED + 1, tips: saved.learned });
  launch();
  assert.equal(game.stats().tip, '', 'a new run does not repeat a learned lesson');
  park('drifter', game.player.x + 60, game.player.y);
  frames(3);
  assert.ok(tipIs('fire') || tipIs('dash'), 'it teaches what is left instead');
});

test('a save that has flown three runs is not taught, and neither is one with nothing left to learn', async () => {
  for (const setup of [{ runs: BALANCE.tutorial.runs }, { tips: ['fly', 'fire', 'dash'] }]) {
    await visit(setup);
    launch();
    game.player.invuln = Infinity;
    park('drifter', game.player.x + 30, game.player.y);
    frames(120);
    assert.equal(world.prompt.teaching, false, JSON.stringify(setup) + ' is not a run being taught');
    assert.equal(game.stats().tip, '', 'and nothing was said');
  }
});

test('what the document says about the lessons is checked on the way in', () => {
  const write = (learned) => {
    game.storage[SAVE_KEY] = JSON.stringify({ version: 1, tutorial: { learned: learned } });
  };
  write(['fly', 'dash']);
  assert.deepEqual(tipsFromSave(), ['dash', 'fly'], 'a remembered set comes back sorted, as the store keeps every set');

  write(['fly', 7, 'zebra']);
  // The store knows what a *name* is and not what a lesson is, so a foreign name survives the read -
  // which is fine, because nothing in the game ever asks about a lesson it has not got, and the next
  // thing learned rewrites the field with the game's own ids (game/tutorial.js `bankTutorial`).
  assert.deepEqual(tipsFromSave(), ['fly', 'zebra']);

  write('not a list');
  assert.deepEqual(tipsFromSave(), [], 'a field of the wrong kind is not stored at all');
  write([7]);
  assert.deepEqual(tipsFromSave(), [], 'and a list that yields nothing is the wrong kind too');

  write(null);
  assert.deepEqual(tipsFromSave(), [], 'not even a null gets past it');
});

test('what the game banks is its own three ids and nothing the document picked up on the way', async () => {
  // A document can be holding anything - an older build's name, somebody's own edit. Reading it is
  // safe (the test above) and writing it back is the game's own tidy-up: an ending rewrites the field
  // with lesson ids and nothing else.
  game.storage[SAVE_KEY] = JSON.stringify({ version: 1, tutorial: { learned: ['zebra'] } });
  await visit({ tips: ['zebra'] });
  launch();
  flyFor(2);
  assert.deepEqual(world.prompt.learned, ['fly'], 'the hull was flown, which is news');
  killTheShip();
  assert.deepEqual(tipsInSave().learned, ['fly'], 'and the write took the zebra out with it');
});

// --- the watcher cannot touch the run ----------------------------------------

test('watching a run cannot change it: the same seed, taught and not taught', async () => {
  // The claim the reference run makes for the whole game, made here for one module: this file is a
  // watcher, and a watcher that reads the run must not be able to move it. Two runs of the same seed,
  // one with all three lessons in front of it and one with nothing left to teach, end identically.
  const played = [];
  for (const tips of [[], ['fly', 'fire', 'dash']]) {
    await visit({ tips: tips });
    startBotRun(game);
    for (let i = 0; i < 1500; i++) {
      botFrame(game);
      game.step(FRAME_MS);
    }
    played.push(fingerprint(game));
  }
  assert.equal(played[1], played[0], 'the same run, whichever lessons were up');
});
