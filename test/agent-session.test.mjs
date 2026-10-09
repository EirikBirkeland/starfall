// The tools a coding agent plays the game with (tools/agent/session.js), run against
// the real game.
//
// The claim being held to here is one sentence: an agent can play this game with
// nothing but these tools, and every tool says what actually happened. So every test
// goes in through a tool and reads the answer back out of the simulation - the ship
// that moved, the shot that left the gun, the rank that landed - rather than checking
// that a function returned a pleasant object. An agent cannot tell the difference
// between a tool that lies and a tool that does nothing.
//
// One browser stub per process (tools/headless/harness.js), so these run in order and
// each one says what state it left the game in. `toTitle` is the reset between them.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { callTool, createSession, toolList } from '../tools/agent/session.js';
import { AgentError } from '../tools/agent/protocol.js';
import { INSTRUCTIONS } from '../tools/agent-bridge.js';
import { makeEnemy } from '../src/game/kinds.js';
import { enemyShotAt } from '../src/game/enemyshots.js';
import { levelUp } from '../src/game/progress.js';
import { BALANCE } from '../src/game/balance.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 5 });
const field = game.world;
const ship = field.player;

/** Everything the session has said out loud since the last `toTitle`. */
const events = [];
const api = createSession(game, {
  report: (event, data) => events.push(Object.assign({ event: event }, data)),
});

/** Ask the game for something. */
const ask = (name, args) => callTool(api, name, args === undefined ? {} : args);

/** Ask the game for something it should not do, and get the reason back. */
function refuses(name, args) {
  let said;
  try {
    said = ask(name, args);
  } catch (err) {
    assert.ok(err instanceof AgentError, name + ' broke instead of refusing: ' + err.message);
    return err.message;
  }
  assert.fail(name + ' should have refused, and answered ' + JSON.stringify(said) + ' instead');
}

/** Back to the title with an untouched run, and a clean sheet of events. */
async function toTitle(seed) {
  api.stopHolding();
  await game.resetToTitle(seed === undefined ? 5 : seed);
  api.notice();
  events.length = 0;
}

/** Let the game run, without the real-time pump. */
function frames(count) {
  for (let i = 0; i < count; i++) api.frame();
}

const seconds = () => ask('status').run.seconds;

test('the title screen is a screen an agent can read', async () => {
  await toTitle();
  const status = ask('status');
  assert.equal(status.screen, 'title');
  assert.equal(status.run.seconds, 0);
  assert.equal(status.autopilot, 'off');
  assert.equal(ask('observe').screen, 'title');

  assert.match(refuses('choose', { number: 1 }), /no upgrade is on the table/);
  assert.match(refuses('dash'), /no run flying/);
  assert.match(refuses('run_result'), /no run has been played/);
  // Stepping on the title gets nowhere, and says so instead of pretending to pass time.
  assert.equal(ask('step', { seconds: 5 }).reason, 'title');
  assert.equal(seconds(), 0);
});

test('choose_weapon picks the primary, and only between runs', async () => {
  await toTitle();
  assert.equal(ask('choose_weapon', { weapon: 'scatter' }).weapon, 'SCATTER');
  assert.match(refuses('choose_weapon', { weapon: 'bazooka' }), /no primary is called "bazooka"/);
  assert.match(refuses('choose_weapon', { weapon: 'bazooka' }), /pulse, scatter, arc/);
  assert.match(refuses('choose_weapon', {}), /"weapon" is missing/);

  ask('start');
  assert.match(refuses('choose_weapon', { weapon: 'arc' }), /does not swap its primary/);
});

test('start starts a run, and the world runs while the agent thinks', async () => {
  await toTitle();
  const started = ask('start');
  assert.equal(started.screen, 'playing');
  assert.equal(started.seed, 5, 'the seed the run plays on is answered back');
  assert.ok(events.some((event) => event.event === 'started'), 'the agent was told the run began');
  assert.match(refuses('start'), /already flying/);

  const jumped = ask('step', { seconds: 4 });
  assert.equal(jumped.reason, 'time');
  assert.ok(jumped.advanced > 3.5, 'it let go by about what it was asked, got ' + jumped.advanced);
  assert.ok(seconds() > 3.5);
  assert.ok(events.some((event) => event.event === 'wave'), 'the first wave was announced');

  assert.match(refuses('step', { seconds: 0 }), /positive number/);
  assert.match(refuses('step', { seconds: 300 }), /will not jump more than/);
});

test('move holds the ship the way a hand does', async () => {
  await toTitle();
  ask('start');
  frames(2);
  const before = ship.x;
  assert.deepEqual(ask('move', { dx: 1, dy: 0 }).held, ['right']);
  frames(60);
  assert.ok(ship.x > before + 40, 'holding right went right: ' + before + ' -> ' + ship.x);
  assert.deepEqual(ask('observe').held, ['right']);

  assert.deepEqual(ask('move', { dx: 0, dy: 0 }).held, []);
  const stopped = ship.x;
  frames(60);
  // It coasts - the ship has friction, not a brake - but it does not keep going.
  assert.ok(Math.abs(ship.x - stopped) < Math.abs(ship.x - before));

  // Anything inside the dead zone is not a direction, and the ship has no slow.
  assert.deepEqual(ask('move', { dx: 0.05, dy: 0 }).held, []);
  assert.deepEqual(ask('move', { dx: 0, dy: -1 }).held, ['up']);
  assert.deepEqual(ask('move', { dx: -1, dy: 1 }).held, ['down', 'left']);
  assert.match(refuses('move', { dx: 'wide' }), /"dx" wants a number/);
});

test('aim points the ship where the shots will go', async () => {
  await toTitle();
  ask('start');
  frames(2);

  ask('aim', { x: ship.x + 200, y: ship.y });
  frames(2);
  assert.ok(Math.abs(ship.angle) < 0.05, 'pointing right points right, got ' + ship.angle);

  ask('aim', { x: ship.x, y: ship.y - 200 });
  frames(2);
  assert.ok(Math.abs(ship.angle + Math.PI / 2) < 0.05, 'pointing up points up, got ' + ship.angle);

  // Where it says it aimed is the same place, told back in screen pixels.
  const said = ask('aim', { x: 800, y: 600 });
  assert.deepEqual(said.aim, { x: 800, y: 600 });
  assert.equal(typeof said.onScreen.x, 'number');
  assert.match(refuses('aim', { x: 10 }), /wants an x and a y/);
});

test('trigger holds the fire button, and the gun answers', async () => {
  await toTitle();
  ask('start');
  frames(2);
  assert.equal(game.stats().bullets, 0, 'a run that has not been fired has no shots');

  assert.equal(ask('trigger', { down: true }).firing, true);
  frames(30);
  assert.ok(game.stats().bullets > 0, 'holding it down put shots in the world');
  assert.equal(ask('observe').firing, true);

  ask('trigger', { down: false });
  const at = game.stats().bullets;
  frames(120);
  assert.equal(game.stats().bullets, 0, 'letting go stopped them, eventually (' + at + ' left)');
  assert.match(refuses('trigger', { down: 'yes' }), /wants true or false/);
});

test('dash spends the dash, and only during a run', async () => {
  await toTitle();
  assert.match(refuses('dash'), /no run flying to dash/);
  ask('start');
  frames(2);
  // The press is a request; the next step is what spends it.
  ask('dash');
  frames(4);
  assert.ok(ship.dashLeft > 0, 'the burst was running');
  assert.ok(ship.dashCd > 0, 'and it is being counted down');
  frames(60);
  assert.equal(ship.dashLeft, 0, 'and the burst ended on its own');
  assert.ok(ask('observe').ship.dashIn > 0, 'and observe says how long until the next one');
});

test('the cards are dealt, and choose takes one', async () => {
  await toTitle();
  ask('start');
  frames(2);
  levelUp(field);            // the same door a shard pays through
  frames(1);                 // a frame goes by, and the session says so out loud

  const status = ask('status');
  assert.equal(status.screen, 'choosing');
  assert.equal(status.offer.length, 3);
  const offered = status.offer;
  assert.deepEqual(offered.map((card) => card.number), [1, 2, 3]);
  for (const card of offered) {
    assert.ok(card.name.length > 0);
    assert.match(card.effect, /^\+/, card.id + ' says what a rank is worth');
  }
  assert.ok(events.some((event) => event.event === 'level-up'), 'the agent was told to choose');
  assert.equal(ask('step', { seconds: 5 }).reason, 'needs a card choice', 'a paused run waits, and says so');

  const took = ask('choose', { number: 2 });
  assert.equal(took.screen, 'playing');
  assert.equal(took.took.id, offered[1].id);
  assert.equal(field.upgrades[offered[1].id], 1, 'the rank landed in the build');
  assert.equal(ask('status').offer.length, 0);

  assert.match(refuses('choose', { number: 1 }), /no upgrade is on the table/);
  levelUp(field);
  assert.match(refuses('choose', { number: 4 }), /between 1 and 3/);
  assert.match(refuses('choose', { number: 1.5 }), /whole number/);
  ask('choose', { number: 1 });
});

test('the two asks about the deal: reroll deals another table, banish cuts a line', async () => {
  await toTitle();
  ask('start');
  frames(2);
  levelUp(field);
  frames(1);

  const before = ask('status');
  assert.equal(before.asks.rerolls, BALANCE.cards.rerolls, 'a fresh run is granted a reroll');
  assert.equal(before.asks.banishes, BALANCE.cards.banishes, 'and a banish');
  assert.deepEqual(before.cut, [], 'and it has cut nothing yet');
  const faceUp = before.offer.map((card) => card.id);

  const cut = ask('banish', { number: 3 });
  assert.equal(cut.banished, before.offer[2].name, 'the number is the card it was shown');
  assert.deepEqual(cut.cut, [before.offer[2].name], 'and the run says what it cut');
  assert.equal(cut.screen, 'choosing', 'a banish is not an answer to the level');
  assert.equal(cut.offer.length, 3, 'the empty place was filled');
  assert.ok(cut.offer.every((card) => card.id !== before.offer[2].id), 'and not with the line that just went');
  assert.ok(!field.offer.includes(before.offer[2].id), 'the simulation agrees it is off the table');

  const dealt = ask('reroll');
  assert.equal(dealt.screen, 'choosing', 'a reroll is not an answer either');
  assert.equal(dealt.rerollsLeft, BALANCE.cards.rerolls - 1, 'and it cost the ask');
  for (const card of dealt.offer) {
    assert.ok(!faceUp.includes(card.id), 'a reroll that hands back a card it was shown bought nothing: ' + card.id);
  }

  const status = ask('status');
  assert.deepEqual(status.cut, [before.offer[2].name], 'the cut is on the status, for the next look');
  assert.equal(status.asks.banishes, 0, 'and so is the banish');

  // A cut line is gone from a table, not just from this deal of it.
  for (let i = 0; i < 6; i++) {
    ask('choose', { number: 1 });
    frames(1);
    levelUp(field);
    frames(1);
    if (ask('status').screen !== 'choosing') break;
    assert.ok(!ask('status').offer.some((card) => card.id === before.offer[2].id),
      'the line came back to the table');
  }
  await toTitle();
});

test('an ask that cannot be granted is refused, with the ask kept', async () => {
  await toTitle();
  ask('start');
  frames(2);
  levelUp(field);
  frames(1);

  ask('banish', { number: 1 });
  ask('reroll');
  assert.match(refuses('banish', { number: 1 }), /spent its banishes/);
  assert.match(refuses('reroll'), /spent its rerolls/);
  assert.equal(ask('status').screen, 'choosing', 'and the choice is still there, untouched');

  assert.match(refuses('banish', { number: 9 }), /between 1 and 3/);
  levelUp(field);            // two levels owed, so the table is still dealable afterwards
  frames(1);
  assert.equal(ask('status').screen, 'choosing');
  ask('choose', { number: 1 });
});

test('observe says what is out there, nearest first and no more than asked', async () => {
  await toTitle();
  ask('start');
  frames(2);
  field.enemies.length = 0;
  field.enemyShots.clear();
  ship.x = 1000;
  ship.y = 1000;
  const plant = (type, x, y) => {
    const enemy = makeEnemy(field, type, x, y);
    field.enemies.push(enemy);
    return enemy;
  };
  plant('drifter', 1100, 1000);
  plant('weaver', 1600, 1000);
  plant('tank', 600, 1000);
  // A darter with a line drawn, so a telegraph is in what the agent is shown.
  const shooter = plant('darter', 1400, 1000);
  shooter.stage = 'aim';
  shooter.dirX = -1;
  shooter.dirY = 0;
  shooter.timer = 0.4;
  shooter.stageTime = 0.5;
  enemyShotAt(field, 1300, 1000, -1, 0, { speed: 200, radius: 5, life: 2 }, 'spitter');

  const seen = ask('observe', { nearest: 2 });
  assert.equal(seen.enemies.length, 2);
  assert.equal(seen.moreEnemies, 2, 'and it says how many it left out');
  assert.ok(seen.enemies[0].distance < seen.enemies[1].distance, 'nearest first');
  assert.equal(seen.enemies[0].type, 'drifter');
  assert.equal(seen.enemies[0].distance, 100);

  const whole = ask('observe', { nearest: 40 });
  assert.equal(whole.shots.length, 1);
  const shot = whole.shots[0];
  assert.equal(shot.from, 'spitter');
  assert.equal(shot.across, 0, 'it is aimed straight at the ship');
  assert.ok(shot.in > 1 && shot.in < 1.6, 'and it says when it arrives, got ' + shot.in);

  const darter = whole.enemies.filter((one) => one.type === 'darter')[0];
  assert.ok(darter.aiming, 'a body with a line drawn says so');
  assert.equal(darter.aiming.in, 0.4, 'with a countdown');
  assert.equal(darter.aiming.through.across, 0, 'and the ship is standing on it');
  assert.ok(darter.aiming.through.along > 0, 'down the line, in front of it');

  assert.match(refuses('observe', { nearest: 900 }), /between 1 and 40/);
  field.enemies.length = 0;
  field.enemyShots.clear();
});

test('autopilot hands the flying over, and gives it back', async () => {
  await toTitle(9);
  ask('start');
  assert.match(refuses('autopilot', { on: true, policy: 'clever' }), /no bot policy is called/);
  assert.equal(ask('autopilot', { on: true }).autopilot, 'aware');
  ask('step', { seconds: 20 });
  assert.ok(field.kills > 0, 'it killed something while nobody was steering');
  assert.ok(field.elapsed > 15);
  assert.equal(ask('status').autopilot, 'aware');
  assert.equal(ask('autopilot', { on: false }).autopilot, 'off');
  assert.deepEqual(ask('observe').held, [], 'the handover left no key stuck down');
});

test('a death is said once, and the result is the run that happened', async () => {
  await toTitle(9);
  ask('start');
  frames(30);
  // The crowd is cleared first: a body planted on the ship in the middle of a knot is
  // shouldered out of reach by the separation pass before it can touch anything.
  field.enemies.length = 0;
  ship.hull = 1;
  ship.invuln = 0;
  field.enemies.push(makeEnemy(field, 'drifter', ship.x, ship.y, { hp: 1, speed: 0, drop: 0, score: 0 }));
  frames(10);

  const deaths = events.filter((event) => event.event === 'died');
  assert.equal(deaths.length, 1, 'exactly one death for one death');
  assert.equal(ask('status').screen, 'over');
  assert.ok(ask('status').restartIn >= 0);

  const result = ask('run_result');
  assert.equal(result.score, field.score);
  assert.equal(result.seed, 9);
  assert.ok(result.died.killedBy.length > 0, 'it says what did it in');
  assert.equal(typeof result.build, 'object', 'the build is a map of ranks');
  assert.match(refuses('start'), /just ended/);
  const waited = ask('step', { seconds: 5 });
  assert.equal(waited.reason, 'died');
  assert.ok(waited.advanced < 1, 'it waited out the guard and came back, took ' + waited.advanced);
  assert.equal(ask('start').screen, 'playing', 'and then it will take the next run');
});

test('the brief says the things the game can actually do', () => {
  // The agent reads this before anything else. A tool it is not told about is a tool
  // it will not think to ask for, so the brief and the tool list have to agree.
  for (const name of ['start', 'observe', 'move', 'aim', 'trigger', 'dash', 'choose', 'step', 'autopilot']) {
    assert.ok(INSTRUCTIONS.indexOf(name) >= 0, 'the brief never mentions ' + name);
  }
  assert.ok(INSTRUCTIONS.length > 300);
  assert.ok(toolList().length >= 12);
});
