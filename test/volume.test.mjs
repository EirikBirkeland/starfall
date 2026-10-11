// Volume: the two sliders, the mute above them, and the readout that says what a key did.
//
// PLAN section 5 asks for "separate volume sliders for music and effects, and a mute key (M)".
// The mute key has been here since milestone 0; what this file owns is the rest of it. Four
// promises hold the feature together, and each has its tests below:
//
// 1. **A slider is a bus.** It moves a gain on the music bus or the effects bus and nothing
//    else (audio/engine.js) - so the mute, which hangs on the master above both of them, is
//    still the one value that goes quiet whatever is scheduled, and the two loudness analyses
//    the game is built on (the headroom in audio/mix.js, `MUSIC.peakLoad` in audio/music.js)
//    are repriced by nothing, because the top of a slider is exactly where they were measured.
// 2. **A step is a step to the ear.** Every position is the same number of decibels from the
//    next, which is the only way ten presses can honestly cover a range of that size.
// 3. **A press is answered on the thing it changed.** The sounds slider ticks through the
//    sounds bus and the music slider plays one note through the music one, so the answer is
//    made of the very thing that moved and needs no calibration to read. Which bus a voice
//    reaches is decided by which module plays it, and the last test refuses either module the
//    import that would let it cross over.
// 4. **Nothing moved is said nothing about.** A slider at the end of its travel is refused in
//    silence and in ink, like every other refused press in the game (game/balance.js `ui`).
//
// The readout (render/volume.js) is paint, so it is checked the only way it can be here: the
// words a frame put on the canvas, and the fact that they stop appearing by themselves.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { dropShards } from '../src/game/pickups.js';
import { makeEnemy } from '../src/game/kinds.js';
import {
  VOLUME, buildMaster, busGains, effectsLevel, isMuted, levelGain, musicLevel, nudgeLevel,
  setLevel, setMuted,
} from '../src/audio/engine.js';
import { AUDITION_NOTE, musicLedger } from '../src/audio/music.js';
import { view } from '../src/render/canvas.js';
import { panelIsUp, panelLayout } from '../src/render/volume.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const UI = BALANCE.ui;
const FRAME = 16.7;
const TOP = VOLUME.start;

/** What one step of a slider is worth, in decibels, straight out of the table. */
const STEP_DB = VOLUME.span / VOLUME.steps;

const game = await bootGame({ root: ROOT, seed: 7, audio: true });
const world = game.world;
const ship = world.player;

/** A machine with no compressor and no filters, so the graph can be read node by node. */
function bareMachine() {
  const node = () => ({ gain: { value: 0 }, connect() {} });
  return { destination: {}, createGain: node };
}

function stats() { return game.stats(); }

/** Where the pitch log stands right now. Pass it to `notesSince`. */
function mark() { return game.audio.ramps.length; }

/** Every pitch asked for since `at`, in the order they were asked for. */
function notesSince(at) {
  return game.audio.ramps.slice(at)
    .filter((r) => r.name === 'pitch' && r.op === 'set')
    .map((r) => r.v);
}

/** Did a voice slide to `hz` since `at`? (Which way a note was bent.) */
function sweptTo(at, hz) {
  return game.audio.ramps.slice(at).some((r) => r.name === 'pitch' && r.op === 'exp'
    && Math.abs(r.v - hz) < 0.001);
}

/** Press a key and let go of it, without letting a frame run in between. */
function tap(code, extra) {
  const at = mark();
  game.key(code, true, extra);
  game.key(code, false);
  return at;
}

function wait(frames) {
  for (let i = 0; i < frames; i++) game.step(FRAME);
}

/** Step until the panel has gone. Bounded: a regression has to fail, not hang the box. */
function untilPanelIsDown() {
  const limit = Math.ceil(10 * 1000 / FRAME);
  let frames = 0;
  while (panelIsUp() && frames < limit) { game.step(FRAME); frames++; }
  assert.ok(frames < limit, 'the readout went away on its own');
  return Math.round(frames * FRAME);
}

function bothSlidersAtTheTop() {
  setLevel('music', TOP);
  setLevel('effects', TOP);
}

/**
 * Both sliders back where they started, the master open, and the readout put away - so a test is
 * asking about its own press and not about the one before it, and a failure in one test cannot
 * leave the next one reading a muted game.
 */
function settle() {
  setLevel('music', TOP);
  setLevel('effects', TOP);
  setMuted(false);
  untilPanelIsDown();
}

/** Launch with the mouse, so the launch key stays uninvolved. */
function launch() {
  game.pressMouse(640, 240);
  game.releaseMouse();
  ship.invuln = Infinity;      // this file is not about dying
  game.step(FRAME);
}

/** Pay for exactly one level and step until the run stops to spend it. */
function earnALevel() {
  world.xp = 0;
  world.shards.clear();
  world.enemies.length = 0;
  world.pendingLevels = 0;
  dropShards(world, ship.x, ship.y, Math.ceil(world.xpNeed / BALANCE.shards.xp));
  let frames = 0;
  while (stats().state !== game.STATE.LEVEL && frames < 400) { game.step(FRAME); frames++; }
  assert.ok(frames < 400, 'the level-up arrived');
}

function killTheShip() {
  ship.hull = 1;
  ship.invuln = 0;
  ship.fireTimer = 5;          // no shot, or it would kill the planted enemy first
  world.enemies.length = 0;
  world.enemies.push(makeEnemy(world, 'drifter', ship.x, ship.y, {
    hp: 1, speed: 0, drop: 0, score: 0,
  }));
  game.step(FRAME);
}

// ---------------------------------------------------------------------------
// The sliders, as gains
// ---------------------------------------------------------------------------

test('both sliders start where the shipped mix was measured', () => {
  // 1 on the sounds bus and 0.5 on the music one are the two numbers audio/engine.js shipped
  // with before a player was allowed a say, and they are what every `vol` in the game and every
  // bar of the soundtrack is priced against. A slider that moved them on its own account would
  // un-measure the game, so it does not: that mix is the top of the travel, and the start of it.
  assert.equal(musicLevel(), TOP);
  assert.equal(effectsLevel(), TOP);
  const gains = busGains();
  assert.equal(gains.effects, 1, 'the sounds bus is exactly the mix mix.js prices');
  assert.equal(gains.music, 0.5, 'and the music bus exactly the half engine.js argues for');
});

test('a graph built later is built at where the sliders stand', () => {
  // The keys work before there is an audio device to move, so the levels are remembered on this
  // side of the wire and the graph is built at them - or a first press would be a settings page
  // that only takes effect on the second one.
  bothSlidersAtTheTop();
  let chain = buildMaster(bareMachine());
  assert.equal(chain.sfx.gain.value, 1);
  assert.equal(chain.music.gain.value, 0.5);
  setLevel('music', 4);
  setLevel('effects', 6);
  chain = buildMaster(bareMachine());
  assert.equal(chain.music.gain.value, busGains().music);
  assert.equal(chain.sfx.gain.value, busGains().effects);
  assert.ok(chain.music.gain.value < 0.5 && chain.sfx.gain.value < 1, 'and they were lower');
  bothSlidersAtTheTop();
});

test('every step of a slider is the same step to the ear', () => {
  // Loudness is a ratio, so the slider is one: every position is STEP_DB from the one below it,
  // and the bottom is a hard zero rather than a very quiet something.
  assert.equal(levelGain(0), 0, 'zero is nothing on that bus');
  assert.equal(levelGain(VOLUME.steps), 1, 'and the top is the shipped mix');
  for (let n = 2; n <= VOLUME.steps; n++) {
    const ratio = levelGain(n) / levelGain(n - 1);
    const dB = 20 * Math.log10(ratio);
    assert.ok(Math.abs(dB - STEP_DB) < 1e-9, 'step ' + n + ' should be ' + STEP_DB + ' dB up, got ' + dB);
  }
  for (let n = 1; n < VOLUME.steps; n++) {
    assert.ok(levelGain(n) < levelGain(n + 1), 'and they go up as you go up');
  }
  assert.ok(levelGain(5) > 0.3, 'half way is a third of the gain, not a half: -10 dB');
});

test('a slider moves one bus and leaves the other alone', () => {
  bothSlidersAtTheTop();
  const before = busGains();
  assert.equal(setLevel('music', TOP - 3), TOP - 3);
  assert.ok(busGains().music < before.music, 'the music bus came down');
  assert.equal(busGains().effects, before.effects, 'and the sounds bus did not move');
  setLevel('music', TOP);
  assert.equal(busGains().music, before.music, 'and went back up the same way');
});

test('a slider asked past either end is clamped and not refused', () => {
  // A key pressed twice too often is a slider against the end of its travel, and the end of the
  // travel is a real place to be: silent, and not an error.
  assert.equal(setLevel('music', -4), 0);
  assert.equal(busGains().music, 0, 'a bus can be shut');
  assert.equal(setLevel('music', VOLUME.steps + 6), VOLUME.steps);
  assert.equal(busGains().music, 0.5);
  bothSlidersAtTheTop();
  assert.throws(() => setLevel('vocal', 3), /no volume bus is called vocal/);
});

test('a slider already where it is answers nothing', () => {
  bothSlidersAtTheTop();
  assert.equal(setLevel('music', TOP), null, 'no move, so nothing to report');
  assert.equal(nudgeLevel('music', 1), null, 'and so at the top of the travel');
  setLevel('music', 0);
  assert.equal(nudgeLevel('music', -1), null, 'and at the bottom of it');
  setLevel('music', TOP);
});

test('the mute is above the sliders and not beside them', () => {
  bothSlidersAtTheTop();
  setLevel('effects', 3);
  setMuted(true);
  assert.ok(isMuted());
  assert.equal(effectsLevel(), 3, 'muting did not touch a slider');
  assert.equal(busGains().effects, levelGain(3), 'nor what the slider says the bus is');

  // ...and mute is still the whole game going quiet whatever the sliders say, because both buses
  // hang upstream of one master gain and the mute is that one value (audio/engine.js).
  const chain = buildMaster(bareMachine());
  assert.equal(chain.gain.gain.value, 0, 'the master is shut');
  assert.ok(chain.music.gain.value > 0, 'and both buses are still open underneath it');
  assert.ok(chain.sfx.gain.value > 0);
  setMuted(false);
  assert.ok(buildMaster(bareMachine()).gain.gain.value > 0, 'and opening it lets it all back in');
  setLevel('effects', TOP);
});

// ---------------------------------------------------------------------------
// The keys, in the real game
// ---------------------------------------------------------------------------

test('two pairs of keys, one per slider, one step per press', () => {
  bothSlidersAtTheTop();
  assert.equal(stats().musicLevel, TOP);
  assert.equal(stats().state, game.STATE.START, 'a slider key is not a launch');
  tap('BracketRight');
  assert.equal(stats().musicLevel, TOP, 'the top of the travel is the top of the travel');
  tap('BracketLeft');
  assert.equal(stats().musicLevel, TOP - 1, 'the music slider came down');
  assert.equal(stats().effectsLevel, TOP, 'and the sounds keys are not the music ones');
  tap('Minus');
  assert.equal(stats().effectsLevel, TOP - 1);
  tap('Equal');
  assert.equal(stats().effectsLevel, TOP);
  tap('Equal');
  assert.equal(stats().effectsLevel, TOP, 'and cannot be pushed past what the mix was measured at');
});

test('a key held down through its auto-repeats is one step', () => {
  setLevel('effects', TOP);
  const at = mark();
  game.key('Minus', true);
  for (let i = 0; i < 6; i++) game.key('Minus', true, { repeat: i > 0 });
  assert.equal(stats().effectsLevel, TOP - 1, 'one press, one step');
  game.key('Minus', false);
  assert.equal(game.audio.ramps.length - at, 2, 'one tick and not six: the note, and its bend');
  setLevel('effects', TOP);
});

test('a slider answers on the bus it moved', () => {
  // Read on the title, where nothing else is sounding and not one frame runs between the press
  // and the log: every note below was asked for by the key and by nothing else. Both sliders
  // start a step below the top, because a press at the top of the travel is refused (below).
  setLevel('music', TOP - 1);
  setLevel('effects', TOP - 1);
  const up = tap('Equal');
  assert.deepEqual(notesSince(up), [UI.up.freq], 'a slider up ticks up');
  assert.ok(sweptTo(up, UI.up.slide), 'and it is the rising tick BALANCE.ui says it is');

  const down = tap('Minus');
  assert.deepEqual(notesSince(down), [UI.down.freq], 'a slider down ticks down');
  assert.ok(sweptTo(down, UI.down.slide));

  const music = tap('BracketRight');
  assert.deepEqual(notesSince(music), [AUDITION_NOTE.at], 'the music slider sings its own note');
  assert.ok(sweptTo(music, AUDITION_NOTE.up), 'rising, because it went up');
  const back = tap('BracketLeft');
  assert.deepEqual(notesSince(back), [AUDITION_NOTE.at]);
  assert.ok(sweptTo(back, AUDITION_NOTE.down), 'and falling on the way back');
  assert.ok(UI.up.vol < UI.take.vol && UI.down.vol < UI.take.vol,
    'and a slider is quieter than the press a run is made of');
  settle();
});

test('the audition is not sequenced and leaves the music\'s books alone', () => {
  // The sequencer keeps its own ledger and the tests over music.test.mjs read it as the run's
  // intensity curve. One note per keypress may not show up in it as a bar of music.
  settle();
  const before = musicLedger();
  tap('BracketRight');
  tap('BracketLeft');
  const after = musicLedger();
  assert.equal(after.notes, before.notes, 'one note is not a note of the pattern');
  assert.equal(after.steps, before.steps, 'and it was not scheduled on the grid');
  assert.equal(after.drums, before.drums);
});

test('a refused press is silent and dark', () => {
  // The rule every tick in the game follows (BALANCE.ui): a key the game refused goes unanswered,
  // because a readout that moves when nothing moved is one you stop believing.
  settle();
  setLevel('effects', VOLUME.steps);
  const voices = game.audio.voices;
  const at = mark();
  tap('Equal');
  assert.equal(game.audio.voices, voices, 'nothing was asked of the synthesiser');
  assert.equal(game.audio.ramps.length, at, 'not one pitch');
  assert.equal(panelIsUp(), false, 'and nothing was painted about it');
  tap('Minus');
  assert.equal(panelIsUp(), true, 'but one step down from there, everything is');
  settle();
  setLevel('effects', 0);
  tap('Minus');
  assert.equal(panelIsUp(), false, 'the same story at the bottom of the travel');
  bothSlidersAtTheTop();
});

test('a muted game asks for nothing, however hard the sliders are moved', () => {
  settle();
  setLevel('music', TOP - 1);
  setLevel('effects', TOP - 1);
  game.key('KeyM', true);
  game.key('KeyM', false);
  assert.ok(isMuted());
  const at = mark();
  const voices = game.audio.voices;
  tap('BracketRight');
  tap('Equal');
  assert.equal(game.audio.voices, voices, 'not one voice');
  assert.equal(game.audio.ramps.length, at, 'not one pitch');
  assert.equal(stats().musicLevel, TOP, 'but the sliders still moved');
  assert.equal(stats().effectsLevel, TOP);
  assert.equal(panelIsUp(), true, 'and the readout still said so');
  game.key('KeyM', true);
  game.key('KeyM', false);
  assert.ok(!isMuted(), 'and the mute is still one key, whatever the sliders did');
  settle();
});

// ---------------------------------------------------------------------------
// The readout on the glass
// ---------------------------------------------------------------------------

test('the readout answers a press, says what it says, and goes away', () => {
  settle();
  assert.equal(panelIsUp(), false, 'it is not a permanent part of the interface');
  tap('BracketLeft');
  wait(2);
  const words = game.words();
  assert.ok(words.includes('MUSIC'), 'the row that moved');
  assert.ok(words.includes('SOUND'), 'and the row that did not, because the question is always both');
  assert.ok(words.some((w) => w.indexOf('M MUTE') === 0),
    'and the keys that did it, said in the same caps the rows above them are said in');
  assert.equal(panelIsUp(), true);

  const ms = untilPanelIsDown();
  assert.ok(ms > 800, 'it stayed long enough to be read: ' + ms + ' ms');
  assert.ok(ms < 6000, 'and it is a moment and not a mode: ' + ms + ' ms');
  wait(2);
  assert.ok(!game.words().includes('MUSIC'), 'and then it is off the glass');
});

test('the readout says MUTED, and stops saying it when the game comes back', () => {
  settle();
  setLevel('music', 2);
  setLevel('effects', 3);
  game.key('KeyM', true);
  game.key('KeyM', false);
  wait(2);
  assert.ok(game.words().some((w) => w.indexOf('MUTED') === 0),
    'while the master is shut, that is the only thing the sliders are describing');
  game.key('KeyM', true);
  game.key('KeyM', false);
  wait(2);
  assert.ok(!game.words().some((w) => w.indexOf('MUTED') === 0), 'and not after');
  settle();
});

test('the readout answers over the cards, while the run holds still', () => {
  // A level-up freezes the simulation, so this is the one place a volume key could reasonably be
  // ignored - and it is not, because turning the music down while you read is exactly what a
  // person does with a key like this one.
  launch();
  earnALevel();
  assert.equal(stats().state, game.STATE.LEVEL, 'the run is holding still');
  const at = mark();
  tap('BracketLeft');
  assert.deepEqual(notesSince(at), [AUDITION_NOTE.at], 'the key was heard');
  assert.equal(panelIsUp(), true, 'and painted');
  tap('Digit1');
  assert.equal(stats().state, game.STATE.PLAY, 'and the run is running again');
  settle();
});

test('and over the death\'s card, where the music has stopped on purpose', () => {
  // The audition is only played when there is a pattern to be under (audio/music.js): on a
  // death's card the music bus is silent by choice and a note out of nowhere would be a lie
  // about what the game is doing. The readout is the whole answer there, and it is enough.
  killTheShip();
  assert.equal(stats().state, game.STATE.OVER);
  settle();
  setLevel('music', TOP - 1);
  const at = mark();
  const voices = game.audio.voices;
  tap('BracketRight');
  assert.equal(game.audio.voices, voices, 'no note on a bus the game has gone quiet on');
  assert.equal(game.audio.ramps.length, at);
  assert.equal(stats().musicLevel, TOP, 'but the slider moved');
  wait(2);
  assert.ok(game.words().includes('MUSIC'), 'and the readout said it');
  settle();
});

// ---------------------------------------------------------------------------
// Where a voice is allowed to go, and what a slider key is not
// ---------------------------------------------------------------------------

test('the readout fits the plate it is drawn on', () => {
  // No pixels here, so the picture is measured as boxes: the plate is inside the window and
  // centred, the label column stops where the pips start (they overlapped when this was first
  // written, and nothing but arithmetic had noticed), and every word the panel put on the glass
  // landed inside its own plate rather than across its border.
  settle();
  setLevel('music', 4);
  tap('BracketRight');
  wait(2);
  const box = panelLayout();
  assert.ok(box.x > 0 && box.x + box.w < view.W, 'the plate is inside the window');
  assert.ok(box.y > 0 && box.y + box.h < view.H, 'and above the XP bar, not under it');
  assert.ok(Math.abs((box.x + box.w / 2) - view.W / 2) < 1, 'and centred on it');
  assert.ok(box.labelRight < box.pips.x, 'the labels are out and the pips are in');
  assert.ok(box.pips.x + box.pips.w < box.x + box.w, 'and the row of pips fits in the plate');
  for (const row of box.rows) {
    assert.ok(row.pipX >= box.pips.x && row.pipX === box.pips.x, 'each row of pips is one column');
    assert.ok(row.baselineY > box.y && row.baselineY < box.y + box.h, row.name + "'s row is inside");
  }

  const words = game.texts().filter((t) => t.text === 'MUSIC' || t.text === 'SOUND'
    || t.text.indexOf('M MUTE') === 0 || t.text.indexOf('MUTED') === 0);
  assert.ok(words.length >= 3, 'the two rows and the line under them, got ' + words.length);
  for (const word of words) {
    // `x` is the pen's anchor: the right edge of a right-aligned label, the middle of the centred
    // line under them. Either way the whole word has to be inside the plate.
    const left = word.align === 'right' ? word.x - word.w : word.x - word.w / 2;
    const right = word.align === 'right' ? word.x : word.x + word.w / 2;
    assert.ok(left > box.x && right < box.x + box.w,
      '"' + word.text + '" is inside the plate: ' + Math.round(left) + '..' + Math.round(right)
        + ' against ' + Math.round(box.x) + '..' + Math.round(box.x + box.w));
    assert.ok(word.y > box.y && word.y < box.y + box.h, '"' + word.text + '" is not over the edge');
  }
  settle();
});

test('the row you moved is the one that is bright', () => {
  // A brightness is a number and the layout hands it out, which is the only way to ask this
  // question with no pixels: the first version handed the painter a row that was never tagged and
  // so never lit anything, and every word on the panel was still in the right place.
  settle();
  tap('BracketLeft');
  const music = panelLayout();
  assert.equal(music.rows[0].key, 'music');
  assert.equal(music.rows[1].key, 'effects');
  const bright = music.rows[0].lit;
  const quiet = music.rows[1].lit;
  assert.ok(bright > quiet, 'the row that moved answers, and the other one waits');
  assert.equal(music.fade, 1, 'and the panel is fully up straight after the press');

  tap('Minus');
  const sound = panelLayout();
  assert.equal(sound.rows[0].lit, quiet, 'and now it is the other way round');
  assert.equal(sound.rows[1].lit, bright);

  // Mute is not a row, so it lights both: what you just changed is the whole game's sound.
  game.key('KeyM', true);
  game.key('KeyM', false);
  const muted = panelLayout();
  assert.equal(muted.rows[0].lit, bright, 'one press on the master and both rows are answering');
  assert.equal(muted.rows[1].lit, bright);
  game.key('KeyM', true);
  game.key('KeyM', false);

  // And the fade is wired to the clock rather than being a number in a file nobody believes: most
  // of the way through its hold the panel is on its way out, and then it is gone.
  let frames = 0;
  const limit = Math.ceil(2 * 1000 / FRAME);
  while (panelIsUp() && panelLayout().fade >= 1 && frames < limit) { game.step(FRAME); frames++; }
  const fading = panelLayout();
  assert.ok(panelIsUp() && fading.fade < 1 && fading.fade > 0,
    'it goes away rather than vanishing, at ' + fading.fade.toFixed(2));
  untilPanelIsDown();
});

test('the note is the music\'s and the tick is the interface\'s, and neither crosses over', () => {
  // The fake audio device cannot see which bus a voice was wired to, so the routing is checked
  // where it is actually decided: which module is allowed to import which bus. sfx.js plays the
  // interface ticks and music.js plays the audition, so if neither can reach the other's bus
  // then a tick can only land on the bus the test above heard it on.
  const sfx = fs.readFileSync(path.join(ROOT, 'src/audio/sfx.js'), 'utf8');
  const music = fs.readFileSync(path.join(ROOT, 'src/audio/music.js'), 'utf8');
  assert.ok(sfx.includes('getSfxBus'), 'the interface is on the sounds bus');
  assert.ok(music.includes('getMusicBus'), 'and the music is on its own');
  assert.ok(!music.includes('getSfxBus'), 'music.js cannot reach the sounds bus');
  assert.ok(!sfx.includes('getMusicBus'), 'and sfx.js cannot reach the music one');
});

test('a slider key is none of the other keys the game answers', async () => {
  // `[ ] - =` share nothing with WASD, the launch, the dash, the card numbers, the reroll or the
  // mute - and a slider press must not spend any of them on its way past.
  await game.resetToTitle(7);
  settle();
  const before = stats();
  tap('Minus');
  tap('Equal');
  tap('BracketLeft');
  tap('BracketRight');
  assert.equal(stats().state, game.STATE.START, 'it did not launch a run');
  assert.equal(stats().ship, before.ship, 'it did not pick a ship or a gun');
  assert.equal(stats().dashCd, before.dashCd, 'it did not spend a dash');
  assert.equal(stats().dashLeft, 0, 'nothing is underway either');
  assert.equal(stats().rerollsLeft, before.rerollsLeft, 'it did not ask for the deal again');
  assert.equal(musicLevel(), TOP, 'and it did move the sliders, net of itself');
  assert.equal(effectsLevel(), TOP);
});

/**
 * The same two sliders and the same switch, stood on from the settings panel (game/settings.js,
 * ui/screens.js, PLAN section 6).
 *
 * What is proved here is that there is one set of numbers behind both ways in: a step taken on the
 * panel lands in the same mixer a bracket key lands in, a step taken with a key *while the panel is
 * up* puts the panel right as well, and the mute row is the same switch M is. Two readouts of one
 * number is exactly the shape a lie grows in, and since session 79 the mixer has had two - the plate
 * on the canvas and now a row on the panel.
 */
test('the settings panel shows the mixer, and steps it through the same door', async () => {
  game.resetToTitle(7);
  settle();
  tap('KeyO');
  assert.equal(game.stats().settingsUp, true, 'O puts the settings up over the title');
  assert.deepEqual(game.screen.settingsRows.map((row) => row.name), [
    'SCREEN SHAKE', 'HIT FLASH', 'SCORE NUMBERS', 'PARTICLES', 'KEYS', 'MUSIC', 'SOUND', 'MUTE',
    'AUTO-FIRE', 'AUTO-AIM',
  ], 'four things the game does to the eyes, the door onto the keys, then three it does to the ears');

  // Down to MUSIC, two steps down it, and read the same number off both places it is written: the row
  // on the panel and the mixer the bracket keys move (the canvas plate is drawn, so it is measured in
  // the tests above rather than read here).
  for (let i = 0; i < 5; i++) tap('ArrowDown');
  tap('ArrowLeft');
  tap('ArrowLeft');
  assert.equal(game.screen.settingsRows[5].value, '8 OF 10');
  assert.equal(musicLevel(), 8, 'one slider, one number, two ways of standing on it');

  // A slider key while the panel is up: the plate and the row move together, because they are one press
  // answering one key through one door (main.js `onVolume`).
  tap('BracketRight');
  assert.equal(musicLevel(), 9);
  assert.equal(game.screen.settingsRows[5].value, '9 OF 10');
  assert.equal(panelIsUp(), true, 'the readout lit over the panel');
  assert.equal(game.stats().settingsUp, true, 'and the readout is not a panel, so the panel stayed up');

  // Down to MUTE, one row further, and light it: the row is the same switch M is, and either way is a
  // step, because a switch has two places and no ends.
  tap('ArrowDown');
  tap('ArrowDown');
  assert.equal(game.screen.settingsRows[7].chosen, true, 'the mute is the last of the three the mixer owns');
  tap('ArrowLeft');
  assert.equal(game.screen.settingsRows[7].value, 'ON');
  assert.equal(isMuted(), true);
  tap('ArrowLeft');
  assert.equal(game.screen.settingsRows[7].value, 'OFF', 'one switch, and either way is a step');
  assert.equal(isMuted(), false);

  // And the cursor cannot be walked off the panel: nine ups from the bottom is the top row, and a row
  // at the end of its travel does not move.
  for (let i = 0; i < 9; i++) tap('ArrowUp');
  assert.equal(game.screen.settingsRows[0].chosen, true);
  tap('ArrowRight');
  assert.equal(game.stats().settings.shake, 'full', 'a row already at the top of its travel stays there');

  tap('KeyO');
  assert.equal(game.stats().settingsUp, false);
  assert.equal(game.stats().state, game.STATE.START, 'closing the panel launched nothing');
  setLevel('music', TOP);
  setLevel('effects', TOP);
  setMuted(false);
});
