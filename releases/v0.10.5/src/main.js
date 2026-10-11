// Boot, the frame loop, and the wiring between the layers. This is the only
// module that is allowed to know about all of them at once.

import { world, stepWorld } from './game/world.js';
import { startRun, resetRun, canStartRun, continueRun, victoryCardIsAnswerable, victoryCardIsUp, pauseRun, resumeRun, abandonRun } from './game/run.js';
import { resetAmbient } from './game/ambient.js';
import { takeOffer, describeRanks, rerollOffer, banishOffer, banishedLines } from './game/upgrades.js';
import { shotsPerSecond, setWeapon, weaponName } from './game/weapons.js';
import { SHIPS, setShip, shipName } from './game/ships.js';
import { boughtPerks, boughtShips, buyRackByIndex, pickShipByIndex } from './game/hangar.js';
import { perkAt, perkLedger } from './game/perks.js';
import { foundFromSave, foundLedger } from './game/codex.js';
import { dustTotal, namesOf, takeAwardToasts, wonFromSave, wonShare } from './game/awards.js';
import { loggedFromSave, runLedger } from './game/history.js';
import { windOf } from './game/lance.js';
import {
  bossHullShare, bossName, bossPhase, cellsStanding, bossSummons, bossWarning, coresStanding,
  bossSweeps,
  darknessOf,
} from './game/bosses.js';
import { fieldIsCaged } from './game/field.js';
import { endlessTime } from './game/endless.js';
import { STATE } from './game/state.js';
import { BALANCE } from './game/balance.js';
import { createClock } from './core/clock.js';
import { getSeed, setSeed, randomSeed } from './core/rng.js';
import { section, saveIsWritable, saveProblem } from './core/save.js';
import { storedDust, dustForRun } from './game/stardust.js';
import {
  ROWS as PICTURE_ROWS, loadFromSave as loadPicture, stepRow as stepPictureRow,
  wordsOf as pictureWords, stepIdOf as pictureStep,
} from './game/settings.js';
import {
  ROWS as ASSIST_ROWS, loadFromSave as loadAssists, stepRow as stepAssistRow,
  wordsOf as assistWords, stepIdOf as assistStep,
} from './game/assists.js';
import { initCanvas, resizeCanvas, view, calmMotion } from './render/canvas.js';
import { camera, resolveAim, screenX, screenY, snapCamera } from './render/camera.js';
import { buildStars, updateStars } from './render/background.js';
import { updateNebula } from './render/nebula.js';
import { renderFrame } from './render/renderer.js';
import { choiceHit } from './render/cards.js';
import { arrowCount, resetIndicators } from './render/indicators.js';
import { initInput, readInput, consumeInput, mouse } from './input/index.js';
import { initAudio, restoreAudio, nudgeLevel, toggleMuted, musicLevel, effectsLevel, isMuted, VOLUME } from './audio/engine.js';
import { consumeCues, uiTick } from './audio/sfx.js';
import { auditionMusic, updateMusic } from './audio/music.js';
import { advanceVolumePanel, showVolumePanel } from './render/volume.js';
import { noteFrame, panelIsUp as debugIsUp, togglePanel as toggleDebugPanel } from './render/debug.js';
import { advanceToasts, clearToasts, pushAwardToast } from './render/toast.js';
import { advanceLogo, measureLogo, setCalmMotion } from './render/logo.js';
import { initScreens, hideScreens, showGameOver, showVictory, revealWinHint, showShip, showRack, showPerks, showCodex, showLog, showAwards, showStanding, showPause, showSettings, fitSettings, openHangar, openCodex, openPause, openSettings, closePanels, hangarIsOpen, codexIsOpen, pauseIsUp, settingsIsUp, panelIsUp, fitHangar, fitOpenPanel } from './ui/screens.js';

const clock = createClock(BALANCE.sim.step, BALANCE.sim.maxFrameDt);

/**
 * The readouts the debug hook and the developer's panel report: how fast the frames are arriving,
 * where between the last step and the next one the frame just drawn sat, and what the frame spent
 * stepping and painting. One object, written in place every frame, because "no allocation inside the
 * per-frame loops" is a rule (PLAN section 2) and nothing outside the frame loop ever needs more than
 * the newest frame's numbers.
 */
const perf = { fps: 60, frameMs: 1000 / 60, steps: 0, alpha: 0, stepMs: 0, drawMs: 0 };

/** How many gold bodies are standing in the arena. For the F3 overlay (milestone 10). */
function countElites(world) {
  let gold = 0;
  for (const enemy of world.enemies) if (enemy.elite) gold++;
  return gold;
}

/** The seed the address bar asked for, or null when nobody asked. */
function addressSeed() {
  const match = /[?&]seed=(\d+)/.exec(window.location.search);
  return match ? parseInt(match[1], 10) >>> 0 : null;
}

// True while one seed is locked to this visit: the address bar asked for it
// (that is how a run gets shared and replayed), or the headless tools fixed
// one before boot. Unlocked visits pick a fresh seed for every run, so a
// restart never replays the same arena.
let seedIsPinned = false;

// Whether this win has had its card put up yet. The card is a frame thing - it goes up a beat
// after the run is won, not on the step it is - so the frame loop is what has to remember that it
// has happened once, and it forgets again the moment the world is on any other screen.
let victoryCardShown = false;
// Whether the death's card has been put up for the ending the world is sitting on. Same bargain as
// the win's two flags below: written once per ending, forgotten the moment the world is on any other
// screen - and the reason a run ended by a key and a run ended by a bullet get the same card on the
// same frame, whichever of the two frames the ending landed in.
let overCardShown = false;

// Has the won run's card been told what its keys do yet? Same bargain as the one above: it happens
// once, and it is forgotten the moment the world is on another screen.
let winHintRevealed = false;

// The score the save document has a section for (core/save.js). A visit with nothing stored
// starts from no best at all, which is what makes the first run of a new browser a new best.
const SAVED_SCORE = { best: 0 };

// The empty heading the title mark is measured against (index.html, render/logo.js). Taken once at
// boot beside the canvas itself, because the frame loop has no business asking the page for an
// element, let alone where it ended up.
let logoBox = null;

// How the save document answered when this visit opened: '' when it held a document this build
// could use and otherwise what was wrong with it, and whether this visit may write at all (not
// over a document from a newer build). Taken once at boot, because that is the moment they are
// about - "why is nothing being remembered" is not a per-frame question, and storage is not
// something the frame loop should be reading.
let saveNote = '';
let saveWritable = true;

/** Begin a new run, if the screen accepts one right now. */
function beginRun() {
  if (!canStartRun(world)) return false;
  initAudio();
  // The press that launches a run is not also a dash. Space is both keys, and a
  // run that began with a dash already spent would read as a broken cooldown.
  consumeInput();
  if (!seedIsPinned) world.seed = randomSeed();
  startRun(world);
  hideScreens();
  // The plates belong to the run that earned them, and this is a different run: a window about to
  // show a fresh arena has not been told anything yet (render/toast.js).
  clearToasts();
  uiTick('confirm');
  return true;
}

/**
 * One press of the launch key, whatever the screen means by it: a new run from the title or the
 * death's card, and - over the win - the run that is sitting under the card handed back (game/run.js
 * `continueRun`, PLAN 3.4's endless mode). Asking for a new run there is what R and the number keys
 * are for, and the card says so.
 */
function pressAction() {
  // The settings panel owns the screen it is put up on, launch key included: a press that is meant
  // for the row the cursor is on is not also a press that starts a run out from under it.
  if (settingsIsUp()) return;
  if (continueRun(world)) {
    // The same bargain `beginRun` strikes with the launch key: Space is the dash as well, and a run
    // resumed out of the hush owes no free dash on the step it comes back on.
    initAudio();
    consumeInput();
    hideScreens();
    uiTick('confirm');
    return;
  }
  beginRun();
}

function onCanvasPressed() {
  initAudio();
  // Over a panel a click is not a launch. The title's click-to-go is worth having and the
  // death's card's is worth having, but a panel you are meant to be able to look round is not a
  // screen that throws you into a run because you aimed at a ship and missed - and there are two of
  // them now, one of which is full of things to look at and neither of which is a launch button.
  if (panelIsUp()) return;
  // While the cards are up the click is an answer, not a shot and not a restart - and it
  // can be one of three answers: take this card, banish it out of the run, or deal the
  // table again (render/cards.js is what says which one the point landed on).
  if (world.state === STATE.LEVEL) {
    answerChoice(mouse.x, mouse.y);
    return;
  }
  // Over a paused run a click is nothing at all. The pause is not a screen to be clicked through on
  // the way back into the fight: the left button is the gun, so a click that resumed the run would
  // also fire it, and a player who meant to dismiss a panel and missed would be shot off before they
  // were even looking. Esc and P are the way out, and they mean one thing.
  if (world.paused) return;
  if (world.state !== STATE.PLAY) pressAction();
}

/** One click on the choice, wherever it landed. */
function answerChoice(x, y) {
  const hit = choiceHit(x, y);
  if (hit === null) return;
  // The interface answers the press with a tick, and only when the answer was taken: a reroll the
  // run has no asks left for is refused in silence, because a tick that lies is worse than no
  // tick (BALANCE.ui).
  if (hit.reroll) {
    if (rerollOffer(world)) uiTick('reroll');
  } else if (hit.banish !== undefined) {
    if (banishOffer(world, hit.banish)) uiTick('banish');
  } else if (takeOffer(world, hit.card)) {
    uiTick('take');
  }
}

/**
 * A number key: over one of the cards on the table, or over the ship rack.
 *
 * Shift turns the same number into the other thing that screen can be answered with, which is the
 * idiom the cards already taught (Shift + a number banishes one): over a run it cuts a line out of
 * the run for good, and between runs it pays for the row the number names - a ship, or one rank of
 * a perk.
 */
function onPickCard(number, withShift) {
  // A keypress is a user gesture and this one can arrive before anything else has been pressed,
  // so this is the earliest the audio may be started at all (audio/engine.js). A machine with no
  // audio is not disturbed by the ask, and `uiTick` on its own never starts a context: only a
  // handler that is answering a press is allowed to.
  initAudio();
  // The numbers name a row of whatever panel is on the glass, and the settings panel has no numbered
  // rows - so they are refused here rather than left to quietly change the ship behind the panel a
  // player is looking at (ui/screens.js `settingsIsUp`).
  if (settingsIsUp()) return;
  if (world.state === STATE.LEVEL) {
    // Shift turns the same number into the other thing a card can be answered with: it
    // cuts that line out of the run instead of taking it.
    if (withShift) {
      if (banishOffer(world, number - 1)) uiTick('banish');
    } else if (takeOffer(world, number - 1)) {
      uiTick('take');
    }
    return;
  }
  // The same keys, on the screens that are not a run: they pick the ship the next run flies, and
  // with it the primary that ship brings (game/ships.js). They do it in three places and mean the
  // same thing in all three - in the hangar, where the rack is, on the title, where the line that
  // says what you are flying answers, and over a wreck, which is what "press 2, press Space, fly
  // the scatter" has always meant. The rack is only *lit* in the hangar and the line that names the
  // pick is only on the screen you are looking at, so no key means one thing here and another
  // there. Mid-run the keys are nobody's: a run does not get to swap its body or its gun between
  // two frames.
  if (world.state === STATE.PLAY) return;
  // And over a win, not before the card can be answered at all: until the guard is spent there is
  // no answer to give, and a number is refused rather than quietly changing what the run about to
  // be handed back is flying (game/run.js `victoryCardIsAnswerable`).
  if (world.state === STATE.WON && !victoryCardIsAnswerable(world)) return;

  const index = number - 1;
  if (withShift) {
    buyFromRack(index);
    return;
  }
  const answer = pickShipByIndex(world, index);
  if (answer === 'picked') {
    showShip(world.ship);
    uiTick('pick');
    // A won run is still a run, so it does not swap its body - and its launch key is spent on
    // keeping the run, so a number there is the whole of the other answer instead of half of it:
    // take this ship and begin again, one press.
    if (world.state === STATE.WON) beginRun();
    return;
  }
  // A ship nobody has bought yet is refused, like every key the screen cannot answer - but it is
  // answered too, by putting up the one panel that says what it costs.
  if (answer === 'locked') openRack();
  // And the same answer for a key that names a perk row. There is nothing to *pick* about a perk -
  // a rank is bought and then it is simply on, every run - so the key has exactly one honest answer,
  // which is where it lives. It is not a fake success: the purse does not move until Shift says so.
  if (answer === 'none' && perkAt(index - SHIPS.length) !== null) openRack();
}

/**
 * Shift and a number, between runs: the purse buys the row that number names - a ship, or one rank
 * of a perk (game/hangar.js `buyRackByIndex`, which reads the two racks as the one numbered list
 * the keys are printed on).
 *
 * Only while the rack is on the glass, because the price has to be somewhere the player can see it
 * before the money goes: buying from the title, where a row is not printed, would be spending
 * somebody's stardust on a key they pressed without looking at what it costs. A purse that is short
 * is refused in silence, like every other refused press, and the row it could not buy is sitting
 * right there with the number it is short by.
 */
function buyFromRack(index) {
  if (!hangarIsOpen()) return;
  if (buyRackByIndex(world, index) !== 'bought') return;
  // The purse, and the row that is no longer locked or is one rank further up, and nothing else:
  // buying is not picking (game/hangar.js), so the ship about to be flown does not move.
  showRack(world.ownedShips);
  showPerks(perkLedger(world));
  showStanding(world.best, world.dust, wonShare(world));
  // ...and a row that ran out of prices is a shorter row, so the panel may need less of the window
  // than it did a moment ago (ui/screens.js `fitHangar`).
  fitHangar();
  uiTick('buy');
}

/**
 * R asks for the deal again over the cards, and for a new run over a won one: the win card's launch
 * key keeps the run that won, so the way out of it needs a key of its own. On any other screen it
 * asks for nothing.
 */
function onReroll() {
  initAudio();     // same reason as `onPickCard`: this key can be the first press of the visit
  if (world.state === STATE.LEVEL) {
    if (rerollOffer(world)) uiTick('reroll');
  } else if (victoryCardIsAnswerable(world)) {
    beginRun();
  }
}

/**
 * M, and the tick on its way back. The mute switch is the one control the player presses without
 * looking at the screen, so the half of it that can be heard says something: going quiet is
 * already its own answer, coming back needs a word to say it happened (BALANCE.ui).
 *
 * It answers the settings panel too, when that is on the glass: the row on it and this key are the
 * one switch, and a panel that still said OFF after the key had changed it would be a panel lying.
 */
function onMuteSwitch() {
  const mutedNow = toggleMuted();
  if (!mutedNow) uiTick('unmute');
  showVolumePanel('mute');
  if (settingsIsUp()) paintSettings();
  return true;
}

/**
 * One step of one slider: `[ ]` for the music, `- =` for the sounds (input/keyboard.js, and
 * audio/engine.js for what a step is worth). Until milestone 9 put a settings page on the glass
 * these keys were the whole interface for it, which is why the press is answered twice over - the
 * level painted on the screen, and the change heard *on the bus it changed*, so the answer is made
 * of the very thing that moved and needs no calibration to read.
 *
 * A slider already at the end of its travel is refused in silence, like every other refused press
 * (BALANCE.ui): the panel does not light for a key that did nothing, because a readout that moves
 * when nothing moved is a readout you stop believing.
 *
 * The settings panel's two slider rows come through here as well, so one key press and one arrow
 * press on the same slider get the same answer. Returns whether the slider moved.
 */
function onVolume(which, delta) {
  // Same bargain as every other key that can be the first press of a visit: this is a user
  // gesture, so this is where the audio is allowed to be started.
  initAudio();
  if (nudgeLevel(which, delta) === null) return false;
  showVolumePanel(which);
  if (which === 'music') auditionMusic(world, delta > 0);
  else uiTick(delta > 0 ? 'up' : 'down');
  if (settingsIsUp()) paintSettings();
  return true;
}

// --- the settings panel ---------------------------------------------------------
// Four rows belong to game/settings.js, three to audio/engine.js and two to game/assists.js; nothing
// on this panel keeps a copy of any of them. What is kept here is the *cursor* - which row the arrow
// keys are pointing at - and that is panel furniture and not a fact about a run or a save: it is
// forgotten when the panel comes down, and no system outside this screen can see it.

/** The cursor, counted from the top of the panel. Back to the top every time the panel goes up. */
let settingCursor = 0;

/** What the panel says under its own heading, so a player knows where a change goes. */
const SETTINGS_NOTE = 'EVERY ROW IS KEPT FOR THE NEXT VISIT';

/** One slider's position, in the words the panel prints beside its name. */
function sliderWords(level) {
  return level + ' OF ' + VOLUME.steps;
}

/**
 * The panel's rows, in the order it prints them: the four the game keeps for its own picture
 * (game/settings.js), then the two sliders and the mute the mixer owns (audio/engine.js), then the two
 * switches that answer for the hand (game/assists.js).
 *
 * One list, so the cursor, the printing and the stepping all walk the same order and cannot drift
 * from one another - and one shape, so nothing on the panel has to know whether the thing under its
 * cursor is a count of sparks or a bus gain. Each row carries its own `step`, which is the one place
 * the two owners' different machinery is folded into one gesture: a picture row moves along its
 * table, a slider goes through the same door the slider keys do (so it is answered on the bus it
 * changed, and the canvas readout lights beside the panel), and the mute is one switch either way.
 * A `step` answers whether anything moved, which is how a press at the end of a row's travel stays
 * as silent as a press of a key that nothing on the screen answers.
 *
 * The two assists come last, and that is a decision rather than an accident. Everything above them is
 * the game's *report* about a run and cannot change one - which is the promise the whole panel is
 * built on, and the one `test/settings.test.mjs` plays a seed twice to pay for. These two rows can,
 * and do: they are the hand. Putting them past the end of the walk is the right friction for them, so
 * that a wander round the arrow keys cannot quietly take the trigger out of the player's hand.
 */
function settingRows() {
  const rows = [];
  for (const row of PICTURE_ROWS) {
    rows.push({
      name: row.name,
      says: row.says,
      value: pictureWords(row.id),
      step: function (delta) {
        if (stepPictureRow(row.id, delta) === null) return false;
        uiTick(delta > 0 ? 'up' : 'down');    // the same answer a slider gives, at the same moment
        return true;
      },
    });
  }
  rows.push({
    name: 'MUSIC', says: 'THE SEQUENCER UNDER THE ARENA',
    value: sliderWords(musicLevel()),
    step: function (delta) { return onVolume('music', delta); },
  });
  rows.push({
    name: 'SOUNDS', says: 'EVERY SHOT, HIT AND EXPLOSION',
    value: sliderWords(effectsLevel()),
    step: function (delta) { return onVolume('effects', delta); },
  });
  rows.push({
    name: 'MUTE', says: 'THE WHOLE GAME, QUIET',
    value: isMuted() ? 'ON' : 'OFF',
    step: function () { return onMuteSwitch(); },
  });
  for (const row of ASSIST_ROWS) {
    rows.push({
      name: row.name,
      says: row.says,
      value: assistWords(row.id),
      step: function (delta) {
        if (stepAssistRow(row.id, delta) === null) return false;
        uiTick(delta > 0 ? 'up' : 'down');    // the same answer every other row gives, at the same moment
        return true;
      },
    });
  }
  return rows;
}

/** Where every picture row stands, for `stats()`: row id -> step id. */
function settingsSteps() {
  const out = {};
  for (const row of PICTURE_ROWS) out[row.id] = pictureStep(row.id);
  return out;
}

/** Where the two switches that fly the ship stand, for `stats()`: 'off' or 'on' each. */
function assistSteps() {
  const out = {};
  for (const row of ASSIST_ROWS) out[row.id] = assistStep(row.id);
  return out;
}

/** Paint the panel from its three owners, and fit it to the window: a value is a word, and words are
 * not all the same width (ui/screens.js `fitSettings`). */
function paintSettings() {
  const rows = settingRows();
  for (let i = 0; i < rows.length; i++) rows[i].chosen = i === settingCursor;
  showSettings({ note: SETTINGS_NOTE, rows: rows });
  fitSettings();
}

/**
 * May the settings panel be put up at all right now?
 *
 * The two screens a run is chosen from, and a run that is being held - and nowhere else. Over a
 * flying run it would be a pause the run never agreed to; over the win it would be a panel over the
 * one card whose launch key means "keep flying this one" (game/run.js). The pause counts: a held run
 * is a run the game has already agreed to stop, and PLAN section 4 asks for settings on it.
 */
function settingsMayOpen() {
  return world.state === STATE.START || world.state === STATE.OVER || world.paused;
}

/**
 * O: the settings, and the way back out of them (PLAN section 6).
 *
 * One key both ways in and out, like the three panels beside it - and when it goes back out over a
 * run that is being held, the pause goes back up in its place. Opening this panel never let the run
 * go, so closing it must not either, and a held run with nothing on the glass reads as a game that
 * has stopped rather than one that is waiting.
 */
function onSettings() {
  initAudio();      // same reason as `onPickCard`: this can be the first press of the visit
  if (settingsIsUp()) {
    closePanels();
    if (world.paused) raisePause();
    uiTick('close');
    return;
  }
  if (!settingsMayOpen()) return;
  settingCursor = 0;
  paintSettings();
  openSettings();
  uiTick('open');
}

/**
 * F3: the developer's panel, and the way back out of it (PLAN milestone 10).
 *
 * The one key that works everywhere - over the title, over a fight, over the cards and over a panel -
 * because what it answers is a question about the frame and not about the screen: how is this frame
 * going, and what is in the arena. It cannot change either (render/debug.js), which is why it needs
 * none of the care every other panel takes about which screens may carry it.
 */
function onDebug() {
  initAudio();      // same reason as `onPickCard`: this can be the first press of the visit
  uiTick(toggleDebugPanel() ? 'open' : 'close');
}

/**
 * Up and down: the cursor, and nothing else (input/keyboard.js binds the arrow keys and only the
 * arrow keys, so the ship's own WASD never mean two things on one screen).
 *
 * The end of the panel is a place to be, not a thing to be beeped about: a cursor that wrapped round
 * would put the shake back under a hand that was trying to take it off.
 */
function onRowMove(delta) {
  if (!settingsIsUp()) return;
  const last = settingRows().length - 1;
  const next = Math.max(0, Math.min(last, settingCursor + delta));
  if (next === settingCursor) return;
  settingCursor = next;
  paintSettings();
  uiTick('pick');
}

/**
 * Left and right: the row the cursor is on, one step each way.
 *
 * Whoever owns the row answers the press, including with its own sound - the picture rows with the
 * same up and down the sliders use, the sliders with the change heard on the bus they moved. A row at
 * the end of its travel answers nothing at all, and the panel is not repainted for it: the panel would
 * look exactly as it did, and a press that changes nothing should not be allowed to look as though it
 * had (BALANCE.ui).
 *
 * The two slider rows repaint the panel themselves, because the keys that step them have to repaint it
 * too (see `onVolume`) - and painting is the owners being asked what they say, so asking twice on one
 * press prints the same panel twice over rather than anything worse.
 */
function onRowChange(delta) {
  if (!settingsIsUp()) return;
  if (!settingRows()[settingCursor].step(delta)) return;
  paintSettings();
}

/**
 * H: the hangar, and the way back out of it (PLAN 3.7).
 *
 * It opens over the two screens that are about the *next* run - the title and the death's card -
 * and nowhere else. Over a run it would be a pause the run never agreed to, and over the win it
 * would be a panel whose launch key means "keep flying this one", which is the one place in the
 * game where a key already means something else; the win's card is about the run you won and its
 * own two keys say everything it has to say. A refused press says nothing, like every other.
 */
function onHangar() {
  initAudio();      // same reason as `onPickCard`: this can be the first press of the visit
  if (hangarIsOpen()) {
    closePanels();
    uiTick('close');
    return;
  }
  openRack();
}

/**
 * C: the codex, and the way back out of it (PLAN 3.7).
 *
 * The same two screens carry it as carry the hangar, because it is the same kind of thing to know
 * about: the title, which is where a visit starts, and the death's card, which is where a run found
 * out what it met. Over a run it would be a pause the run never agreed to and a panel full of words
 * over a crowd that wants looking at; over the win, the same refusal the hangar gets, for the same
 * reason - that card's Space key means "keep flying this one" (game/run.js).
 *
 * If the hangar is up it comes down: one panel at a time, and this key does not have to know that
 * (ui/screens.js `raisePanel` is where the rule lives).
 */
function onCodex() {
  initAudio();      // same reason as `onPickCard`: this can be the first press of the visit
  if (codexIsOpen()) {
    closePanels();
    uiTick('close');
    return;
  }
  if (!rackMayOpen()) return;
  openCodex();
  uiTick('open');
}

/**
 * May a panel be put up at all right now? The two screens that are about the *next* run, and no
 * others: over a run it would be a pause the run never agreed to, and over the win it would be a
 * panel whose launch key means "keep flying this one" (game/run.js).
 *
 * Whether one is already up is deliberately not this question - each key toggles its own panel and
 * the other one comes down on its way up (ui/screens.js `raisePanel`), so both keys get to ask the
 * same thing and neither has to know about the other.
 */
function rackMayOpen() {
  return world.state === STATE.START || world.state === STATE.OVER;
}

/**
 * The run as it stands, for the pause screen: the same numbers the ending's card prints, read
 * mid-flight instead of after the fact, and nothing an ending has that a run does not have yet.
 *
 * `ranks` and `cut` are the build and the refusals (game/upgrades.js), which is what ui/screens.js
 * turns into the second rack; the rest are one row apiece.
 */
function describePause() {
  return {
    score: world.score,
    best: world.best,
    level: world.player.level,
    hull: world.player.hull,
    maxHull: world.player.maxHull,
    kills: world.kills,
    shards: world.shardsCollected,
    wave: world.waveNumber,
    bosses: world.bossesDown,
    seconds: Math.floor(world.elapsed),
    seed: world.seed,
    shipId: world.ship,
    // What the run would be paid if it stopped this second (game/stardust.js) - which, with a "give
    // up" key on this very panel, it might.
    dust: dustForRun(world),
    ranks: world.upgrades,
    cut: banishedLines(world),
  };
}

/**
 * Paint the pause from the run as it stands, and put it up. Both the key and a window that has lost
 * focus do this; only the key answers itself with a sound, because only a press has an ear waiting
 * for one.
 */
function raisePause() {
  showPause(describePause());
  openPause();
}

/**
 * Esc or P: the run held where it stands, or let go again (PLAN section 4's pause).
 *
 * One key both ways in and out, like the two panels - and the *only* key that means this: Esc does
 * not close the hangar or the codex, because one key one meaning is how the three of them stay
 * knowable. Over the cards the run has already stopped for the game and has its own answers to give,
 * so the key is refused there like every press the screen cannot answer, and over an ending or the
 * title there is no run to hold (game/run.js `pauseRun`).
 */
function onPauseKey() {
  initAudio();      // same reason as `onPickCard`: this can be the first press of the visit
  if (resumeRun(world)) {
    closePanels();
    uiTick('close');
    return;
  }
  if (!pauseRun(world)) return;
  raisePause();
  uiTick('open');
}

/**
 * G, and only ever with the pause on the glass: the run given up (PLAN section 4).
 *
 * It is the one press in the game that costs a run, so it is answered on the one screen that says it
 * does and nowhere else - a stray finger in the middle of a fight ends nothing. What it does is end
 * the run for real (game/run.js `abandonRun`): banked like any death, and up comes the same card,
 * because a run the player stopped is a run that stopped and it is worth what it earned.
 */
function onGiveUp() {
  initAudio();
  if (!pauseIsUp()) return;
  if (!abandonRun(world)) return;
  // The card the frame puts up a moment later is not for a panel to sit on, and the run's own ending
  // chord is the answer to the press - no tick over the top of it.
  closePanels();
}

/**
 * The window lost focus: the keys are let go of (input/index.js does that) and the run is held
 * (PLAN section 6). Nobody should come back to a wreck they were not fighting, and a run that stops
 * itself when nobody is watching is the one courtesy a browser game owes - so this is the same pause,
 * put up by the game instead of by a key, and silent: an alarm of its own over a screen nobody is
 * looking at is not an announcement.
 */
function loseFocus() {
  if (pauseRun(world)) raisePause();
}

/**
 * Put the hangar up, on the two screens that may carry it, and answer whether it went up. `onPickCard`
 * asks for the same thing when a number names a ship nobody has bought: the key that wants that ship
 * is what sends the player to the price of it.
 */
function openRack() {
  if (!rackMayOpen()) return false;
  openHangar();
  uiTick('open');
  return true;
}

function onResize() {
  resizeCanvas();
  buildStars();
  // The mark belongs where the title's own column put it, and a resize is the one moment the page
  // gets to change its mind about that (render/logo.js).
  measureLogo(logoBox);
  // The arena is its own size now, so a resize only tells the simulation how big
  // the window watching it has become - which is all it ever needs to know about
  // the screen: it is how spawning knows what is off the edge of it.
  world.view.w = view.W;
  world.view.h = view.H;
  // ...and the one panel tall enough to run out of window asks whether it still fits - whichever of
  // the three it is (ui/screens.js `fitOpenPanel`).
  fitOpenPanel();
}

function describeRun() {
  return {
    score: world.score,
    best: world.best,
    newBest: world.newBest,
    level: world.player.level,
    kills: world.kills,
    shards: world.shardsCollected,
    bosses: world.bossesDown,
    seconds: Math.floor(world.elapsed),
    seed: world.seed,
    // How much of this run was flown past its own win, and so whether it was endless at all
    // (game/endless.js). The death card says so when there is something to say.
    endlessPast: endlessTime(world),
    ship: shipName(world),
    // The ship's id as well as its name, so a card can light the rack for the body it describes
    // instead of hoping the interface already knew (ui/screens.js `showShip`).
    shipId: world.ship,
    weapon: weaponName(world),
    // What took the last hull, and what every hull before it went to (game/tally.js `hurtBy`). The
    // tally is the only place either is kept, and a run that was given up has no cause at all - which
    // the card says in words of its own rather than leaving the question unanswered (game/run.js
    // `abandonRun`).
    cause: world.tally.killedBy,
    hulls: world.tally.hurtBy,
    build: describeRanks(world),
    // What the run is worth between runs, and what the purse holds after it (game/stardust.js).
    dust: dustForRun(world),
    dustBank: world.dust,
    // What the codex knew before this run and what it knows after it (game/codex.js): the count the
    // card prints, and the ledger the panel is painted from, so the panel cannot disagree with the
    // card that went up a frame before it.
    codexNew: world.codexNew,
    codexFound: foundLedger(world),
    // What the awards this run won and what they paid (game/awards.js), and where the whole table
    // stands for this save - the card names what the run earned and says how much of the lot the
    // save has, which is the same pair the codex line gives.
    awards: namesOf(world.awardNews),
    awardDust: dustTotal(world.awardNews),
    awardsWon: wonShare(world),
    // ...and the ids themselves, so the hangar's rack is painted from the same list the card was
    // (ui/screens.js `showAwards`) and cannot say the save has three of a table the card says four.
    awardsOwned: world.awards.slice(),
    // And the log the codex prints, which this run has just been written into (game/history.js) - the
    // same reason the codex ledger travels with the card: the panel that goes up over this card has
    // to agree with the card.
    pastRuns: runLedger(world),
  };
}

function frame(now) {
  // The simulation is stepped in whole fixed steps; whatever the clock still
  // owes is the moment in between them this frame is drawn at.
  const tick = clock.frame(now);
  const input = readInput();
  // The controls speak in pixels on the glass and the simulation speaks in arena
  // coordinates, so the aim goes through the camera on its way in.
  resolveAim(input);

  // The sky drifts on the frame's clock, not the simulation's: the star layers and
  // the clouds behind them belong to the eye, so neither can move a run.
  updateStars(tick.dt);
  updateNebula(tick.dt);
  // ...and so does the mixer readout, which is answering a key and not a step (render/volume.js).
  advanceVolumePanel(tick.dt);
  // ...and so do the award plates, which hold and fade on the same clock (render/toast.js).
  advanceToasts(tick.dt);
  // ...and so does the title's mark, which is arriving or breathing while the world sits on its
  // title screen (render/logo.js). Its clock runs whatever the world is doing: nothing about a run
  // can be waiting on it, and the alternative - winding it back up every time the title came back -
  // would be a reset the frame loop has no reason to own.
  advanceLogo(tick.dt);
  // A hit-stop step holds the run still and never hears the controls, so a frame
  // made entirely of frozen steps must leave a pending dash waiting for the thaw.
  let heard = false;
  const stepStart = performance.now();
  for (let i = 0; i < tick.steps; i++) {
    if (stepWorld(BALANCE.sim.step, input)) heard = true;
  }
  const stepMs = performance.now() - stepStart;
  // Only a frame that actually simulated anything has handed the dash request to
  // the game. On a very quick display a frame can run no step at all, and a press
  // that landed on one of those stays pending rather than being swallowed.
  //
  // A run paused for an upgrade choice is the other case: the pause lasts as long as
  // the player takes to read, so a request made during it is spent rather than kept -
  // a dash that goes off three seconds after the key was pressed is not a gift. The player's own
  // pause (game/run.js `pauseRun`) is the same case for the same reason, and it may last longer.
  if (heard || world.state === STATE.LEVEL || world.paused) consumeInput();
  // The awards won since the last frame go on the glass now (render/toast.js). They were queued by
  // the step (game/awards.js `updateAwards`) and spent here, which is the same door the sound cues
  // are: the run says what happened, the frame decides when it is seen - and it is seen on this
  // frame rather than the next one, because an award and the thing that earned it should not be
  // half a second apart for no reason a player can name.
  for (const award of takeAwardToasts(world)) pushAwardToast(award);

  // The game-over card lands on the same frame the run stops: there is nothing left to see. It is
  // remembered as a flag and not read off the frame's two states, because a run can stop *between*
  // frames as well as during one - the give-up key ends it from a keypress, with no step running to
  // do it in (game/run.js `abandonRun`) - and an ended run with no card over it is a bug either way.
  if (world.state === STATE.OVER && !overCardShown) {
    showGameOver(describeRun());
    overCardShown = true;
  }
  // A win is not. The arena holds still for `BALANCE.victory.hush` with nothing over it, so the
  // fight's own going-down is the first half of the moment and the card is the second
  // (game/run.js `winRun`, `victoryCardIsUp`).
  if (world.state === STATE.WON) {
    if (!victoryCardShown && victoryCardIsUp(world)) {
      showVictory(describeRun());
      victoryCardShown = true;
    }
    // And the line that says what the card's keys do arrives when the keys start doing it - which
    // is the end of the guard, not the arrival of the card (src/ui/screens.js `revealWinHint`).
    if (!winHintRevealed && victoryCardIsAnswerable(world)) {
      revealWinHint();
      winHintRevealed = true;
    }
  } else {
    victoryCardShown = false;
    winHintRevealed = false;
    // Any screen but an ending is a run that has not ended yet, so the flag goes back with the rest.
    overCardShown = false;
  }
  consumeCues(world.state);
  // The music is wound on the same frame the cue queue drains on: what the run looks
  // like right now - how far in it is, whether a boss is standing in it, how much hull the
  // ship has left - is a frame's question, and the simulation never learns music exists at
  // all (audio/music.js).
  updateMusic(world);
  const drawStart = performance.now();
  renderFrame(tick, input, mouse);
  // The frame is over, so all three of its numbers are known and the developer's panel is told about
  // this one now - which means it paints the frame that just finished, never the one it is painting
  // in, because a frame cannot have been drawn by the time it is being drawn (render/debug.js).
  perf.fps = tick.fps;
  perf.frameMs = tick.dt * 1000;
  perf.steps = tick.steps;
  perf.alpha = tick.alpha;
  perf.stepMs = stepMs;
  perf.drawMs = performance.now() - drawStart;
  noteFrame(perf);

  requestAnimationFrame(frame);
}

function boot() {
  initScreens();
  initCanvas(document.getElementById('game'));
  logoBox = document.getElementById('logoBox');
  onResize();
  // Whether this visitor asked for as little movement as the machine can give (the same query the
  // CSS reads for its own fades). Once, at boot, like the pixel ratio: it is a fact about the
  // window, and the title is the only thing in the game that moves on the strength of it.
  setCalmMotion(calmMotion());
  // The mixer first, before anything can make a sound or paint a level: the two sliders and the
  // mute come back from wherever the last visit left them (core/save.js).
  const mixer = restoreAudio();
  // ...and the picture the same way (game/settings.js): the shake, the flash, the floating numbers and
  // the sparks, back from wherever the last visit left them. The one thing the save is *not* asked
  // about is whether this machine was told to keep still: a first visit has no answer of its own to
  // give, so the request is what it gets, and a visit that has since chosen a shake for itself has
  // answered the same question more recently (game/settings.js `loadFromSave`).
  loadPicture(undefined, calmMotion());
  // ...and the two switches that answer for the hand (game/assists.js), the held trigger and the
  // pointed gun. Both of them ship off, which is the game as it was built and balanced, and only a
  // save that says otherwise turns one on.
  loadAssists();
  // ...and a player who left the game muted and came back has no sound and nothing on the screen
  // to say why, so the readout that answers the mute key answers the reload too.
  if (mixer.muted) showVolumePanel('mute');
  // Whoever arrives first picks this visit's seed: the address bar, then the
  // headless tools (which fix one before importing this file), and failing both
  // of them the luck of the moment.
  const fromAddress = addressSeed();
  const fromTools = getSeed() !== null;
  if (fromAddress !== null) setSeed(fromAddress);
  else if (!fromTools) setSeed(randomSeed());
  seedIsPinned = fromAddress !== null || fromTools;
  world.seed = getSeed();
  world.best = section('score', SAVED_SCORE).best;
  // ...and the purse the hangar spends from, and what it has already bought, read the same once for
  // the same reason (game/stardust.js, game/hangar.js).
  world.dust = storedDust();
  world.ownedShips = boughtShips();
  // ...and the ranks of the permanent perks the purse paid for, read the same once for the same
  // reason (game/perks.js). A run reads these when it is put together; nothing here is this run's
  // to lose, and a visit that bought nothing reads four zeros.
  world.perkRanks = boughtPerks();
  // ...and what the codex has already met (game/codex.js), read the same once for the same reason. A
  // first visit reads two empty lists and the panel prints every row as unknown, which is the true
  // thing to say about a save that has met nothing.
  world.found = foundFromSave();
  // ...and which awards the runs of this save have already won (game/awards.js), read the same once
  // for the same reason. An empty list is a first visit, and the whole table is still in front of
  // whoever plays it.
  world.awards = wonFromSave();
  // ...and the runs this save has flown (game/history.js), read the same once for the same reason. An
  // empty log is a first visit, and the panel has one line to say about that.
  world.pastRuns = loggedFromSave();
  // Now the screens can be told what the visit has to show for itself, and which body it flies.
  showStanding(world.best, world.dust, wonShare(world));
  showRack(world.ownedShips);
  showPerks(perkLedger(world));
  showCodex(world.found);
  showLog(world.pastRuns);
  showAwards(world.awards);
  showShip(world.ship);
  saveNote = saveProblem();
  saveWritable = saveIsWritable();
  resetRun(world);
  resetAmbient(world);
  mouse.x = view.W / 2;
  mouse.y = view.H / 2 - 100;

  initInput(view.canvas, {
    onConfirm: pressAction,
    onPress: onCanvasPressed,
    onPickCard: onPickCard,
    onReroll: onReroll,
    onHangar: onHangar,
    onCodex: onCodex,
    onPause: onPauseKey,
    onGiveUp: onGiveUp,
    onSettings: onSettings,
    onDebug: onDebug,
    onRowMove: onRowMove,
    onRowChange: onRowChange,
    onToggleMute: onMuteSwitch,
    onVolume: onVolume,
  });
  window.addEventListener('resize', onResize);
  // ...and the world is held the moment nobody is looking at it any more (PLAN section 6). The same
  // blur that makes the controls let go of every held key makes the run stop, so a player who
  // alt-tabbed away comes back to the arena they left and not to its wreck.
  window.addEventListener('blur', loseFocus);

  requestAnimationFrame(frame);
}

boot();

// A small hook for debugging and for the headless simulation.
window.STARFALL = {
  STATE: STATE,
  world: world,
  player: world.player,
  enemies: world.enemies,
  /** Where the window is looking (render/camera.js). A live object. */
  camera: camera,
  /** Where an arena point lands on the screen - how a headless bot aims. */
  screenOf: function (x, y) { return { x: screenX(x), y: screenY(y) }; },
  /**
   * Stand a fresh page load's clock up again. Every real play session arrives on
   * a page that has never run a frame, and a headless tool that plays a second
   * run on the same boot has to say the same thing, or the run starts somewhere
   * else in the step cycle and the seed no longer replays it.
   */
  resetClock: function () { clock.reset(); },
  /**
   * Put the camera back on the ship with no lean left over. Same reasoning as
   * resetClock above: a new run is played on a view that has not been looking
   * somewhere else.
   */
  resetCamera: function () { snapCamera(); },
  /**
   * Forget the arrows at the edge of the window. Same reasoning as resetCamera
   * above: a new run is played by a view that has not been pointing anywhere.
   */
  resetIndicators: function () { resetIndicators(); },
  /**
   * Choose the primary (game/weapons.js) the way the title screen's number keys do, for
   * a headless tool that wants to say which gun a run flies. An unknown id throws.
   *
   * And it is still the honest way to ask for a gun on its own: a ship brings a gun with it
   * (`chooseShip` below), and a tool that is pricing one primary against another wants the
   * same body underneath every one of them. Set the ship first and the gun after, and the
   * gun is what you asked for.
   */
  chooseWeapon: function (id) { return setWeapon(world, id); },
  /**
   * Choose the ship (game/ships.js) the way the title screen's number keys do, and take its
   * primary with it: hull, speed, the dash's wait, the silhouette, and the gun it was built
   * around, in one call. An unknown id throws.
   */
  chooseShip: function (id) { return setShip(world, id); },
  stats: function () {
    return {
      state: world.state,
      // Is a run being held where it stands (game/run.js `pauseRun`)? A fact about the run's clock
      // and not about the screen it is on, so a headless player cannot tell it from `state` alone.
      paused: world.paused,
      // ...and whether the settings panel is on the glass above it (ui/screens.js). A headless player
      // cannot see the panel, and over it the launch key and the ship numbers go quiet - which is
      // exactly the kind of thing a tool needs to know before it presses either.
      settingsUp: settingsIsUp(),
      // Where the four picture rows stand (game/settings.js): the shake, the flash, the floating
      // numbers and the sparks. They are the only settings a headless run cannot see any other way,
      // because a screenshot is the only thing any of them changes - and a run played with all four at
      // one end of their travel has to be the same run as one played at the other.
      settings: settingsSteps(),
      // ...and where the two switches that answer for the hand stand (game/assists.js): the held
      // trigger and the pointed gun. They are on the same panel and kept the same way, and they are the
      // two rows on it that change what a run does rather than what it looks like - which is exactly why
      // a tool wants to be able to see them.
      assists: assistSteps(),
      seed: world.seed,
      score: world.score,
      // The purse, and what this run is worth into it (game/stardust.js). A headless run cannot
      // read a card, and the costs milestone 8 puts on ships and perks have to be priced against
      // numbers a tool can see.
      dust: world.dust,
      dustEarned: dustForRun(world),
      // Which ships the purse has bought (game/hangar.js). A locked ship is the one thing about a
      // visit a headless tool cannot otherwise tell, and the prices have to be priced against what
      // runs pay - which means a tool has to see both sides of the purse.
      owned: world.ownedShips.slice(),
      // ...and how many ranks of each perk it has paid for (game/perks.js), in the table's own
      // order and clamped to its own ladders, which is the shape a run is built from.
      perks: perkLedger(world),
      // ...and what the codex has met (game/codex.js), in the shape the save holds it in, and what
      // this run added to it. A tool that wants to know what a run *saw* - which bodies it met and
      // which cards it took - has no other way to ask.
      codex: foundLedger(world),
      codexNew: world.codexNew,
      // ...and which awards this save has won (game/awards.js), which ones the last ending paid
      // out and what they paid, and how many of the whole table the save has. A tool that wants to
      // know what a run was *worth* to the save between runs has no other way to ask.
      awards: world.awards.slice(),
      awardsNew: world.awardNews.slice(),
      awardsDust: dustTotal(world.awardNews),
      awardsWon: wonShare(world),
      // ...and what the last runs of this save were (game/history.js), newest first, in the shape the
      // panel prints them from. A tool that wants to ask how a run went compared with the ones before
      // it has no other way to ask.
      runs: world.pastRuns.length,
      runLog: runLedger(world),
      level: world.player.level,
      hull: world.player.hull,
      maxHull: world.player.maxHull,
      dashCd: world.player.dashCd,
      dashLeft: world.player.dashLeft,
      kills: world.kills,
      t: world.elapsed,
      freeze: world.freeze,
      enemies: world.enemies.length,
      elites: countElites(world),
      bullets: world.bullets.count,
      shots: world.enemyShots.count,
      wave: world.waveNumber,
      arrows: arrowCount(),
      shards: world.shards.count,
      gridCells: world.grid.stats().filled,
      parts: world.particles.count,
      collected: world.shardsCollected,
      // How many shards in a row the pickup note is climbing with, and how long the row has
      // left (game/pickups.js). A crack is the only other thing that reads it and a headless
      // run cannot hear a pitch, so this is how a test can see the streak at all.
      shardStreak: world.shardStreak.count,
      shardStreakIn: world.shardStreak.left,
      // The point vacuum (game/vacuum.js): how long the well has left, what it is next waiting for,
      // how many times it has opened and how much loot came through it. A headless tool cannot see a
      // gold ring, and this is the only way one can tell that a run was rewarded at all.
      vacuumLeft: world.vacuum.left,
      vacuumNext: world.vacuum.next,
      vacuumEvents: world.vacuum.events,
      vacuumSwallowed: world.vacuum.swallowed,
      // Where the two sliders stand and whether the master is shut (audio/engine.js). A headless
      // run cannot hear a bus, so this is the only way to see that a volume key did anything, and
      // the F3 overlay wants the same three numbers.
      musicLevel: musicLevel(),
      effectsLevel: effectsLevel(),
      muted: isMuted(),
      // Is the developer's panel on the glass (render/debug.js)? A headless player cannot see it,
      // and "did F3 do anything" is otherwise an unanswerable question without pixels.
      debugUp: debugIsUp(),
      // How the save document answered when this visit opened (core/save.js), and whether this
      // visit is allowed to write to it. A headless run has no other way to see that storage was
      // nonsense, or that a newer build's document is sitting in front of it.
      saveNote: saveNote,
      saveWritable: saveWritable,
      fireRate: shotsPerSecond(world),
      weapon: world.weapon,
      ship: world.ship,
      dashWait: world.player.dashWait,
      // The boss (game/bosses.js): who is fighting, how much of it is left, which phase it is
      // in, how long the siren has left, and how many this run has buried. A headless run has
      // no other way to see a fight at all, and the F3 overlay wants the same numbers.
      boss: world.boss === null ? '' : bossName(world.boss),
      bossHull: world.boss === null ? 0 : bossHullShare(world.boss),
      bossPhase: world.boss === null ? 0 : bossPhase(world.boss),
      bossWarn: world.boss === null ? 0 : bossWarning(world.boss),
      bossSummons: world.boss === null ? 0 : bossSummons(world.boss),
      bossCells: world.boss === null ? 0 : cellsStanding(world.boss),
      // How many bodies the fight is standing on. One, until a boss breaks into pieces - and then
      // the number that says why the bar is going down in three places at once.
      bossCores: world.boss === null ? 0 : coresStanding(world.boss),
      // How many sweeps the fight has let go of, and how many blades are in the air this step
      // (game/arms.js). A blade leaves no shot and no body behind, so this is the only way a headless
      // run can tell a sweep happened at all.
      bossSweeps: world.boss === null ? 0 : bossSweeps(world.boss),
      arms: world.arms.count,
      bossesDown: world.bossesDown,
      // Has a run that outlasted the schedule been handed its arena back to fly on (game/run.js
      // `continueRun`)? A headless run that wins and keeps winning has no other way to say which of
      // the two it is, and neither has the interface this reads it from.
      endless: world.endless,
      // ...and how long it has been flying since the hand-back, which is the clock every growth in
      // the game is measured on (game/endless.js). 0 for every run that has not been handed back.
      endlessPast: endlessTime(world),
      // How far the room has been put under (game/bosses.js `darknessOf`). The frame is the only
      // thing in the game that acts on it, and a headless run has no other way to know it is dark.
      dark: darknessOf(world),
      // What the run died of, and what each thing cost it on the way (game/tally.js
      // `noteHullLoss`). A headless run that says "died at 0m35s" and not *of what* is a number
      // nobody can act on, and a boss made of bodies is the first thing that makes the question
      // worth asking: is it the swarm that is killing the run, or the mass it walks into?
      killedBy: world.tally.killedBy,
      hurtBy: world.tally.hurtBy,
      caged: fieldIsCaged(world),
      // The nova (game/nova.js): how many fronts are in the air, and how long until the
      // next one. The F3 overlay wants both, and a test that cannot see a front can at
      // least see that the clock is running.
      fronts: world.nova.fronts.count,
      novaIn: world.nova.wait,
      novaEvery: world.nova.beat,
      // The arc's bolts still being drawn (game/arc.js), which is how a headless run can see
      // that a chain landed at all - it throws no bullets to count.
      bolts: world.arc.bolts.count,
      // The beams still glowing (game/beams.js). A beam is a thing that already happened,
      // so this is how a headless run can see that one went off at all.
      beams: world.beams.count,
      // The lance (game/lance.js): how far through its wind-up the gun is (0 when it is cold), how
      // much light the last discharges left, and what the gun has been asked to do. A beam throws
      // no bullets to count, so this is the only way a headless run can see the gun is working.
      lanceWind: windOf(world),
      lanceBeams: world.lance.beams.count,
      lancePulls: world.lance.pulls,
      lanceFired: world.lance.fired,
      lanceCaught: world.lance.caught,
      lanceDealt: Math.round(world.lance.dealt),
      // The leech (game/leech.js): how far the next hull is, and whether one is being held.
      leechKills: world.leech.kills,
      leechHeld: world.leech.held,
      // How full the ship's gun is, 0 cold to 1 loaded (game/overcharge.js). The ring round the
      // hull is painted out of this number, and it is how a headless run can watch a charge come
      // up and be spent instead of having to guess it from the damage.
      charge: world.overcharge.charge,
      // How many images the dash has left standing in the arena (game/afterimage.js). A ghost has
      // no hull and throws no shot, so this is the only way a headless run can see the trick is up.
      images: world.afterimage.trail.count,
      // How many shards' worth the field round the ship is holding (game/magnetar.js). A crack is
      // over in the step it happens and leaves no object behind, so this is the only way a headless
      // run can see the bank fill and let go - divide it by BALANCE.upgrades.magnetar.cost, or just
      // watch it sawtooth.
      field: world.magnetar.charge,
      // The minefield, as far as a headless run can see it (game/mines.js): how many mines are
      // standing in the arena right now, and three counters over the run - every mine laid, the ones
      // that went off rather than going out, and the bodies those blasts actually came round. The
      // ratios between the last three are the line's whole story and none of them can be worked out
      // from the arithmetic: a run that lays 1,430, blows 1,097 and touches 1,214 bodies is a line
      // that catches about one body a blast, which is the number its weight was priced on.
      mines: world.mines.laid.count,
      minesBlown: world.mines.blown,
      minesLaid: world.mines.dropped,
      minesHit: world.mines.hit,
      // The tether, as far as a headless run can see it (game/tether.js): how much life the threads
      // have left and how many of them are standing, and four counters over the run. The last two are
      // the line's whole story as a *relation to the crowd* - `tetherHeld / tetherSteps` is how many
      // bodies were standing on the threads while it was live, and `tetherHit / tetherBites` is how
      // many of them one pulse came round - which is the only way a line bought by turning can be read
      // at all, and the reason they were counted from this line's first session.
      tether: world.tether.live,
      tetherCords: world.tether.cords.count,
      tetherTied: world.tether.tied,
      tetherBites: world.tether.pulses,
      tetherHit: world.tether.hit,
      tetherHeld: world.tether.held,
      tetherSteps: world.tether.steps,
      // The fence, as far as a headless run can see it (game/turret.js): how many guns are standing, how
      // many crews have gone down and how many guns they were, and then the four counters that are the
      // line's whole story. `turretHit / turretShots` is the accuracy - how often a shell that was thrown
      // came round a body, which is the only way to tell a gun firing into traffic from a gun firing into
      // empty sky - and `turretSeen / turretSteps` is the duty: what share of the time a gun stood it had
      // somebody in its sight at all, which is the only way to tell a fence planted in the crowd from a
      // fence planted in a field.
      turret: world.turret.stands.count,
      turretCrews: world.turret.crews,
      turretGuns: world.turret.guns,
      turretShots: world.turret.shots,
      turretHit: world.turret.hit,
      turretSeen: world.turret.seen,
      turretSteps: world.turret.steps,
      // The synergy, as far as a headless run can see it (game/shock.js): how many bodies came apart
      // both alight and cold, how many were standing in one when they did, and how much hull the
      // blasts took off them. `shockCaught / shockBlasts` is the one number the card's weight was
      // priced on - how many bodies a detonation is worth - and a run that never earned the card
      // reads zero in all three, which is the gate being provably shut.
      shock: world.shock.blasts,
      shockCaught: world.shock.caught,
      shockDealt: world.shock.dealt,
      fps: perf.fps,
      alpha: perf.alpha,
      steps: world.steps,
      xp: world.xp,
      xpNeed: world.xpNeed,
      // The build, and the choice on the table if there is one (game/upgrades.js).
      // The headless bot reads these to pick a card the way a player does.
      pending: world.pendingLevels,
      offer: world.offer.slice(),
      ranks: Object.assign({}, world.upgrades),
      // The two asks a run has about its own deal (game/upgrades.js): how many of each are
      // left, and which lines the run has taken out of its deck for good. A headless player
      // cannot see a spent ask any other way, and the offers a reroll refuses are the whole
      // rule about what one is worth.
      rerollsLeft: world.rerollsLeft,
      banishesLeft: world.banishesLeft,
      banished: banishedLines(world),
      // The damage line's rank on its own, because what a shot of this run's gun is worth - and so
      // what a drone bite, a nova front, a mine and a thread on a tether are worth - is
      // `BALANCE.bullets.damage x (1 + 0.3 x this)`, and a headless tool cannot work a line's own
      // share of a run's damage out without it (tools/line-ab.js --stats damageRanks,tetherHit).
      damageRanks: world.upgrades.damage,
    };
  },
};
