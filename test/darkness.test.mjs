// The night a fight puts over the arena (PLAN 3.4's Eclipse phase 2: "the arena darkens, and only
// areas near the player and near bullets are lit).
//
// This file owns the *simulation's* half of it, which is one number and a rule about it: a phase may
// ask for the night, and the framework walks the room towards the ask - including back down to
// nothing, which is the half a feature like this usually gets wrong. Nobody ever puts the room back;
// the room is simply never asked to be dark any more, and walks into the light by the same rule that
// brought it in. The painting of it is test/darkness-art.test.mjs's.
//
// The other claim here is the one that lets a fight take the room away at all: `world.darkness` is
// read by the frame and by nothing that can be won or lost on. A dark arena is a thing you can see,
// not a thing that happens to you, and no shot, no body and no shard is worth one pixel differently
// because it is night.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { world } from '../src/game/world.js';
import { bossPhase, darknessOf } from '../src/game/bosses.js';
import { damageEnemy } from '../src/game/enemies.js';
import { resetRun } from '../src/game/run.js';
import { scriptedRun, stepTheWorld, bossOnTheField } from '../tools/headless/scripted.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const STEP = BALANCE.sim.step;
const DARK = BALANCE.bosses.dark;
const ECLIPSE = BALANCE.bosses.eclipse;
const DUE = BALANCE.bosses.schedule.findIndex((entry) => entry.boss === 'eclipse');

/** The deepest night any phase ever asks for, which is what 1 means for every share below. */
const FULL = Math.max(...ECLIPSE.phases.map((phase) => (phase.dark === undefined ? 0 : phase.dark.level)));

/** How far the fastest thing in the crowd can walk at you once the run's clock has finished speeding it up. */
const FASTEST = Math.max(...Object.values(BALANCE.kinds).map((kind) => kind.speed))
  * (1 + BALANCE.enemies.speedScaleMax);

function steps(seconds) {
  let ran = 0;
  let guard = 0;
  while (ran < seconds - 1e-9) {
    stepTheWorld();
    ran += STEP;
    guard++;
    if (guard > 40000) throw new Error('the arena never came back to life');
  }
}

/** The Eclipse, standing in the arena with its warning spent. */
function eclipseOnTheField() {
  const boss = bossOnTheField(DUE);
  assert.equal(boss.id, 'eclipse', 'the entry the schedule sends at the last mark is not the Eclipse');
  return boss;
}

/** Open a phase of the Eclipse by putting its body on the mark that opens it, and let the flare run. */
function openPhase(boss, which) {
  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[which] * 0.99;
  // The flare's own hit-stop swallows the first steps of it, and the ramp is one of the things a
  // freeze holds still, so the wait is the flare and then some.
  steps(BALANCE.bosses.phaseBreak.time + 0.2);
}

/** Open the phase that asks for the night, let the flare run, and let the ramp finish arriving. */
function intoTheDark() {
  const boss = eclipseOnTheField();
  openPhase(boss, 1);
  const ask = ECLIPSE.phases[1].dark.level;
  let guard = 0;
  while (darknessOf(world) < ask && guard++ < 1000) steps(STEP);
  return boss;
}

function allJsIn(relative) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, relative), { withFileTypes: true })) {
    const name = relative + '/' + entry.name;
    if (entry.isDirectory()) out.push(...allJsIn(name));
    else if (entry.name.endsWith('.js')) out.push(name);
  }
  return out;
}

// ---------------------------------------------------------------------------
// What the rows are allowed to ask for
// ---------------------------------------------------------------------------

test('a phase asks for the night as a share of the darkest, and only the Eclipse ever asks', () => {
  // A `dark` row is an ask and not a colour: it is spent as the alpha of the night itself
  // (render/darkness.js), so it has to land between a bright room and a black one.
  for (const id of ['warden', 'hive', 'eclipse']) {
    const row = BALANCE.bosses[id];
    assert.equal(row.phases.length, BALANCE.bosses.atHull.length, id + ' has a row per phase');
    for (const phase of row.phases) {
      if (phase.dark === undefined) continue;
      assert.ok(phase.dark.level > 0 && phase.dark.level <= 1,
        id + ' asked for a night that is not a share of the darkest');
    }
  }

  // And the two fights that came before never asked, which is what makes "the room goes dark" the
  // third boss's own sentence rather than a thing that happens to every boss at 66% hull.
  for (const id of ['warden', 'hive']) {
    for (const phase of BALANCE.bosses[id].phases) {
      assert.equal(phase.dark, undefined, id + ' put a night on a fight that is not its business');
    }
  }

  // The Eclipse keeps the night it grew and deepens it, because PLAN's third phase is "everything
  // from before" - and the deeper of the two is what the last minute of the game is fought in.
  const asks = ECLIPSE.phases.map((phase) => (phase.dark === undefined ? 0 : phase.dark.level));
  assert.equal(asks[0], 0, 'the first phase of the Eclipse is a bright room');
  assert.ok(asks[1] > 0, 'the second phase is the one that puts the night down');
  assert.ok(asks[2] >= asks[1], 'the last phase let go of the dark it had already taken');
});

test('the room it leaves lit is big enough to be a fair one', () => {
  // `light.ship` is the number this whole row turns on, and there are no pixels here to judge it
  // with, so it is priced the way every telegraph in the game is: far enough out that the fastest
  // thing that walks at you is seen for `telegraphMin` before it arrives, with a fifth over for the
  // fact that you are usually walking the other way.
  assert.ok(DARK.light.ship > FASTEST * BALANCE.bosses.telegraphMin * 1.2,
    'a body walks into your light with less than a telegraph to spare: ' + DARK.light.ship + ' px');

  // The shots each carry their own light, so a shell is a ring of lights and not a rumour, and a
  // shot's light is bigger than a bullet's because a shot is what you are being asked to look for.
  assert.ok(DARK.light.shot > DARK.light.bullet, 'the harm is dimmer than the help');
  assert.ok(DARK.light.shot > ECLIPSE.radius,
    "a shot's own light does not even reach past the sun that threw it");
  // The fight's own body keeps a corona, which is where the sun draws the drag (render/boss.js).
  assert.ok(DARK.light.body > 2, 'the sun is lit to less than twice its own radius: that is a hole');
});

// ---------------------------------------------------------------------------
// The ramp
// ---------------------------------------------------------------------------

test('a phase that wrote no dark row leaves the room bright, forever', () => {
  const field = scriptedRun(601);
  const boss = eclipseOnTheField();
  steps(30);
  assert.equal(bossPhase(boss), 1, 'the fight is not in its first phase any more');
  assert.equal(darknessOf(field), 0, 'the room went dark on a phase that never asked for it');
});

test('the night comes in through the flare that opens the phase, and not after it', () => {
  const field = scriptedRun(602);
  const boss = eclipseOnTheField();
  const ask = ECLIPSE.phases[1].dark.level;

  boss.enemy.hp = boss.enemy.maxhp * BALANCE.bosses.atHull[1] * 0.99;

  // The flare is the sentence "the fight has changed gear" and the darkening is the second half of
  // it: the ramp is already climbing while the shell is still going out, so the room is on its way
  // down the whole time the phase is being announced and not left to change afterwards.
  steps(BALANCE.bosses.phaseBreak.time * 0.5);
  assert.equal(bossPhase(boss), 2, 'the phase did not open when it was asked to');
  const midway = darknessOf(field);
  assert.ok(midway > 0 && midway < ask, 'no night on its way during the flare: ' + midway);

  // It arrives at the pace the row says and stops there: a ramp that overshot the ask would be a room
  // darker than any phase ever asked for, and nobody would ever be able to say which. The rate is
  // measured on a stretch with no freeze in it, because a freeze is allowed to hold the ramp still
  // (below) and a wall-clock total would be measuring that instead of the ramp.
  const from = darknessOf(field);
  steps(0.5);
  const grew = darknessOf(field) - from;
  assert.ok(Math.abs(grew - DARK.rise * 0.5) < DARK.rise * STEP * 3,
    'it climbed ' + grew.toFixed(3) + ' in half a second and the row says ' + DARK.rise * 0.5);

  let took = 0;
  while (darknessOf(field) < ask - 1e-9 && took < 20) { steps(STEP); took += STEP; }
  assert.ok(Math.abs(darknessOf(field) - ask) < 1e-9, 'the night stopped nowhere near its ask');

  steps(20);
  assert.equal(darknessOf(field), ask, 'it kept getting darker than the phase asked for');
});

test('a deeper ask walks the room deeper', () => {
  const field = scriptedRun(603);
  const boss = intoTheDark();
  const second = ECLIPSE.phases[1].dark.level;
  const third = ECLIPSE.phases[2].dark.level;
  assert.ok(Math.abs(darknessOf(field) - second) < 1e-9, 'phase two is not the night it priced');

  openPhase(boss, 2);
  assert.equal(bossPhase(boss), 3);
  assert.ok(darknessOf(field) > second, 'the third phase let the night go instead of deepening it');
  assert.ok(Math.abs(darknessOf(field) - third) < 1e-9,
    'the last phase is not standing in its own ask: ' + darknessOf(field));
});

test('a fight that never asked for the dark never walks the room anywhere', () => {
  // The same ramp, on a fight whose phases wrote no `dark` row: the room stays bright through both
  // of its phase changes, which is the "a row nobody wrote is never taken" rule again.
  const field = scriptedRun(604);
  const ring = bossOnTheField(0);
  assert.equal(ring.id, 'warden');
  steps(10);
  openPhase(ring, 1);
  openPhase(ring, 2);
  assert.equal(bossPhase(ring), 3, 'the Warden is not in its last phase');
  assert.equal(darknessOf(field), 0, 'the Warden put a night on the arena');
});

test('the room is handed back the moment the fight is down', () => {
  const field = scriptedRun(605);
  const boss = intoTheDark();
  const ask = darknessOf(field);
  assert.ok(ask > 0, 'there was no night to give back');

  damageEnemy(field, boss.enemy, boss.enemy.maxhp * 10, true);
  steps(0.2);
  assert.equal(field.boss, null, 'the fight is still on the field');

  let took = 0;
  while (darknessOf(field) > 0 && took < 20) { steps(STEP); took += STEP; }
  assert.equal(darknessOf(field), 0, 'a sun that has been buried is still darkening the room');
  // A slow breath of light back rather than a snap: the going is the reward for having won, and the
  // one thing it may not be is instant (the row's own comment argues the whole case).
  assert.ok(took > 0.4 && took < 2, 'the room took ' + took.toFixed(2) + 's to come back');
});

test('the coming and the going are different numbers on purpose', () => {
  // The coming is the fight changing gear; the going is the reward for having won it. One number
  // would make one of those two wrong, and the difference between them is the whole reason the ramp
  // is a ramp and not a switch.
  assert.ok(DARK.fall > DARK.rise, 'the night arrives no faster than the day it hands back');
  assert.ok(FULL / DARK.rise > 1, 'the dark arrives so fast nobody sees it come');
  assert.ok(FULL / DARK.fall < 3, 'the room takes an age to come back after the fight is over');
});

// ---------------------------------------------------------------------------
// When the ramp is allowed to move
// ---------------------------------------------------------------------------

test('a night is stepped with the fight, so a frozen room stays frozen', () => {
  const field = scriptedRun(606);
  const boss = eclipseOnTheField();
  openPhase(boss, 1);
  const before = darknessOf(field);
  assert.ok(before > 0 && before < ECLIPSE.phases[1].dark.level, 'the ramp had already finished');

  // A hit-stop holds the whole arena still, the dark included: the freeze is spent on the frame's
  // clocks and not on the fight's, and the ramp is one of the fight's.
  field.freeze = 0.4;
  steps(0.3);
  assert.equal(darknessOf(field), before, 'the night kept moving while the world was frozen');
  steps(0.3);
  assert.ok(darknessOf(field) > before, 'the ramp never started again after the freeze');
});

test('and a level-up holds it too, because the fight is not being fought while the cards are up', () => {
  const field = scriptedRun(607);
  const boss = eclipseOnTheField();
  openPhase(boss, 1);
  const before = darknessOf(field);

  field.state = STATE.LEVEL;
  steps(1);
  assert.equal(darknessOf(field), before, 'the room went on darkening behind the cards');
  field.state = STATE.PLAY;
  steps(1);
  assert.ok(darknessOf(field) > before, 'the ramp never came back');
});

test('the ramp is walked on every step there is a boss system at all, fight or none', () => {
  // The one thing a feature that takes the room away must never need is a reset, and this is why
  // there is none: an arena with no fight in it asks for a bright room, and the step is taken before
  // anything else the boss system does. The run that dies in the dark, the run that wins in it and
  // the run that never meets a boss at all all start their next run in a bright room.
  const field = scriptedRun(608);
  assert.equal(darknessOf(field), 0);
  steps(30);
  assert.equal(darknessOf(field), 0, 'a room nobody is fighting in went dark on its own');

  intoTheDark();
  assert.ok(darknessOf(field) > 0, 'the night never came at all');

  resetRun(field);
  assert.equal(darknessOf(field), 0, 'a new run started in the last one night');
});

// ---------------------------------------------------------------------------
// The one claim that lets any of this exist
// ---------------------------------------------------------------------------

test('nothing that can be won or lost on ever asks how dark it is', () => {
  // `world.darkness` is written by a step of the simulation and is every bit as deterministic as
  // the rest of it - but it leaves the simulation again the moment it is written. It is what the room
  // looks like and never what happens in it. That is what lets a boss take the arena away from the
  // player without one bullet, one body or one shard of any run being worth differently, and it is
  // worth a test: the day something in game/ reads it back is the day the dark starts costing hull.
  const readers = [];
  const writers = [];
  for (const file of allJsIn('src')) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (/darknessOf\s*\(/.test(source) && !file.endsWith('game/bosses.js')) readers.push(file);
    if (/\.darkness\s*=[^=]/.test(source)) writers.push(file);
  }
  readers.sort();
  writers.sort();
  assert.deepEqual(readers, ['src/main.js', 'src/render/darkness.js'],
    'something outside the frame is asking how dark it is: ' + readers.join(', '));
  assert.deepEqual(writers, ['src/game/bosses.js'],
    'something outside the boss framework is writing the dark: ' + writers.join(', '));
});
