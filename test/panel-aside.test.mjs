// What happens to the screen *underneath* a panel (ui/screens.js `putScreensToBed`, render/logo.js).
//
// The hangar, the codex, the settings and the controls rack are all raised over a page that is already
// on the glass - the title, or the card a wreck leaves behind - and a panel's own dim was never enough
// to keep the two apart: the page underneath kept reading straight through the racks you were trying to
// read, which looks like a broken picture and not like a hint. So the page goes to bed while a panel is
// up, and so does the title's mark, which is the same title painted on the canvas instead of typed into
// the page.
//
// One boot, and the tests walk through it in order, because the modules hold the world and a process
// boots one game.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { drawLogo, logoDim } from '../src/render/logo.js';
import { makeEnemy } from '../src/game/kinds.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const PAGE = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Long enough for a step back or a step forward to be finished: the fade is a quarter of a second
// (render/logo.js), and the page's own screens take the same (index.html `.screen`).
const SETTLED = 0.5;

const game = await bootGame({
  root: ROOT, seed: 91, dpr: 1, width: 1280, height: 720,
  layout: { logoBox: { rect: { left: 200, top: 60, width: 880, height: 97 } } },
});

/** One key, pressed and released, and the frame that hears it. */
function press(code) {
  game.key(code, true);
  game.key(code, false);
  game.step(FRAME);
}

/** Frames, and not forever. */
function wait(seconds) {
  for (let i = 0; i < Math.round(seconds * 1000 / FRAME); i++) game.step(FRAME);
}

/** Is that page in bed right now? (`aside` is the class, and the CSS is what gives it meaning.) */
function inBed(id) {
  return game.classes(id).includes('aside');
}

/**
 * Every panel down again, however many presses that takes - the controls rack is a door *on* the
 * settings panel, so walking out of it is two presses of the same key and not one.
 */
function closeEverything() {
  for (let i = 0; i < 8; i++) {
    const allDown = game.screen.hangarHidden && game.screen.codexHidden
      && game.screen.settingsHidden && game.screen.keysHidden;
    if (allDown) break;
    if (!game.screen.hangarHidden) press('KeyH');
    else if (!game.screen.codexHidden) press('KeyC');
    else press('KeyO');
  }
  assert.ok(game.screen.hangarHidden && game.screen.codexHidden
    && game.screen.settingsHidden && game.screen.keysHidden, 'every panel is down again');
}

/**
 * The alpha every stroke of the painted mark was asked for.
 *
 * Priced on a canvas of its own (test/logo-art.test.mjs does the same) so the arena behind it is not
 * part of the bill - and counted, because "the mark dimmed" and "the mark was not drawn at all" cost
 * the same number of strokes and only the alpha tells them apart.
 */
function markLight() {
  const painted = game.measure((ctx) => drawLogo(ctx));
  assert.ok(painted.strokes > 10, 'the mark is painted: ' + painted.strokes + ' strokes');
  return painted.alphas;
}

test('on its own the title is at full light, and nothing is in bed', () => {
  wait(3);                            // the mark's arrival, so there is a whole word to measure
  assert.equal(game.screen.startHidden, false);
  assert.equal(inBed('startScreen'), false);
  assert.equal(logoDim(), 1, 'no panel has been asked for yet');
  assert.deepEqual([...new Set(markLight())], [1], 'every stroke of the mark at full light');
});

test('the hangar puts the title to bed, and the mark steps back with it', () => {
  press('KeyH');
  assert.equal(game.screen.hangarHidden, false, 'the hangar is up');
  assert.equal(inBed('startScreen'), true, 'the page under it is put to bed');

  // A step and not a cut: the frame that heard the key has begun the fade, not finished it. A hard
  // change here would read as a glitch next to a page that takes a quarter of a second.
  const mid = logoDim();
  assert.ok(mid < 1 && mid > 0.2, 'the mark is on its way back, not gone in one frame: ' + mid);

  wait(SETTLED);
  const back = logoDim();
  assert.ok(back > 0.1 && back < 0.25,
    'a hint of the mark is left behind the glass, and it is not still shouting: ' + back);
  const alphas = markLight();
  assert.ok(alphas.every((a) => Math.abs(a - back) < 1e-9),
    'the whole mark dims as one - letters, rule, studs and all');
});

test('one panel down and the title comes back up', () => {
  press('KeyH');
  assert.equal(game.screen.hangarHidden, true);
  assert.equal(inBed('startScreen'), false);
  wait(SETTLED);
  assert.equal(logoDim(), 1, 'back to full light, exactly');
  assert.deepEqual([...new Set(markLight())], [1]);
});

test('every panel puts it to bed, and so does the door off one of them', () => {
  // Each of these replaces the panel before it rather than standing next to it (only one panel is ever
  // up), so the page underneath never gets a chance to get up again in between.
  const doors = ['KeyH', 'KeyC', 'KeyO'];
  for (const key of doors) {
    press(key);
    assert.equal(inBed('startScreen'), true, key + ' leaves the title in bed');
    assert.ok(logoDim() < 1, key + ' keeps the mark stepped back');
    wait(SETTLED);
  }
  assert.equal(game.screen.settingsHidden, false, 'the settings were the last one asked for');

  // The controls rack is a door on the settings panel (core/keymap.js), not a fifth key.
  const at = game.screen.settingsRows.findIndex((row) => row.name === 'KEYS');
  assert.ok(at >= 0, 'the settings panel has a door onto the keys');
  for (let i = 0; i < at; i++) press('ArrowDown');
  press('ArrowRight');
  assert.equal(game.screen.keysHidden, false, 'and one press on the door opens it');
  assert.equal(inBed('startScreen'), true, 'through a door is still into a panel');
  assert.ok(logoDim() < 1);

  closeEverything();
  assert.equal(inBed('startScreen'), false, 'and the way out lets it up again');
  wait(SETTLED);
  assert.equal(logoDim(), 1);
});

test('a launch takes the whole menu off the glass, bed and all', () => {
  game.pressMouse(640, 240);
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.PLAY);
  assert.equal(game.screen.startHidden, true);
  assert.equal(inBed('startScreen'), false,
    'nothing is left asleep under a run that is flying');
  assert.equal(logoDim(), 1, 'the mark is not nursing a dim nobody can see');
});

test('so is the wreck\'s card - and it goes back to bed with the hangar over it', () => {
  const ship = game.world.player;
  ship.hull = 1;
  ship.invuln = 0;
  ship.fireTimer = 5;                 // no shot, or it would kill the planted enemy first
  game.world.enemies.push(makeEnemy(game.world, 'drifter', ship.x, ship.y, {
    hp: 1, speed: 0, drop: 0, score: 0,
  }));
  game.step(FRAME);
  assert.equal(game.screen.overHidden, false, 'the card is up');
  assert.equal(inBed('overScreen'), false);

  press('KeyH');
  assert.equal(game.screen.hangarHidden, false);
  assert.equal(inBed('overScreen'), true, 'the card is behind the panel now, not through it');
  assert.equal(inBed('startScreen'), true,
    'every page goes, hidden or not: `.hidden` is the one that wins in the page (index.html)');
  wait(SETTLED);
  assert.ok(logoDim() < 1, 'and the mark stays out of the way even though it is not on show');

  press('KeyH');
  assert.equal(inBed('overScreen'), false, 'the card is the way back, and it comes up itself');
  wait(SETTLED);
  assert.equal(logoDim(), 1);
});

test('and the page actually styles the class the code writes', () => {
  // The half of this feature a JavaScript test cannot see: `aside` is a class, and a class the page
  // never styled would leave the menu shining through exactly as loudly as before it was written.
  const rule = /\.screen\.aside\s*\{([^}]*)\}/.exec(PAGE);
  assert.ok(rule !== null, 'the page styles `.screen.aside`');
  const opacity = Number(/opacity:\s*([\d.]+)/.exec(rule[1])[1]);
  assert.ok(opacity > 0 && opacity <= 0.15,
    'a hint and not a half-read page: opacity ' + opacity);

  // Both rules say `opacity`, they are equally specific, and a screen can be both: last one wins, so
  // `.hidden` - the one that means *gone* - has to be the one written after it.
  assert.ok(PAGE.indexOf('.screen.aside') < PAGE.indexOf('.screen.hidden'),
    '`.hidden` must outvote `.aside`, or a screen that is hidden would be a screen at a tenth');

  // And it fades on the same clock the mark does, or the two halves of the title arrive apart.
  const seconds = Number(/transition:\s*opacity\s*([\d.]+)s/.exec(PAGE)[1]);
  assert.ok(Math.abs(seconds * 1000 - 280) < 60, 'the page fades in ' + seconds + 's');
});
