// Boot, the frame loop, and the wiring between the layers. This is the only
// module that is allowed to know about all of them at once.

import { world, stepWorld } from './game/world.js';
import { startRun, resetRun, canStartRun, continueRun, victoryCardIsAnswerable, victoryCardIsUp, pauseRun, resumeRun, abandonRun } from './game/run.js';
import { resetAmbient } from './game/ambient.js';
import { takeOffer, describeRanks, rerollOffer, banishOffer, banishedLines } from './game/upgrades.js';
import { shotsPerSecond, setWeapon, weaponName } from './game/weapons.js';
import { SHIPS, setShip, shipName } from './game/ships.js';
import { boughtPerks, boughtShips, buyRackByIndex, pickShipByIndex, priceAt as rackPrice } from './game/hangar.js';
import { perkAt, perkLedger } from './game/perks.js';
import { foundFromSave, foundLedger } from './game/codex.js';
import { dustTotal, namesOf, takeAwardToasts, wonFromSave, wonShare } from './game/awards.js';
import { loggedFromSave, runLedger } from './game/history.js';
import { promptWords, tipsFromSave } from './game/tutorial.js';
import { beginDailyRun, endDailyRun, pauseWords } from './game/daily.js';
import { cycleChallenge, setChallenge, bestsFromSave, pauseWords as challengePauseWords } from './game/challenges.js';
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
  cycleRow as cyclePictureRow, wordsOf as pictureWords, stepIdOf as pictureStep,
} from './game/settings.js';
import {
  ROWS as ASSIST_ROWS, loadFromSave as loadAssists, stepRow as stepAssistRow,
  wordsOf as assistWords, stepIdOf as assistStep,
} from './game/assists.js';
import {
  ACTIONS as KEY_ACTIONS, loadFromSave as loadKeys, tableAsWords as keyTable,
  wordsOf as keyWords, bindable as keyIsBindable, rebind as rebindKey, restore as restoreKey,
  changedCount as keysChangedCount, CANCEL_KEY,
} from './core/keymap.js';
import { initCanvas, resizeCanvas, view, calmMotion } from './render/canvas.js';
import { camera, resolveAim, screenX, screenY, snapCamera } from './render/camera.js';
import { buildStars, updateStars } from './render/background.js';
import { updateNebula } from './render/nebula.js';
import { renderFrame } from './render/renderer.js';
import { choiceHit } from './render/cards.js';
import { arrowCount, resetIndicators } from './render/indicators.js';
import { initInput, readInput, consumeInput, mouse, thumb, pad, captureKeys, hasFinger, hasKeyboard, onPausePlate } from './input/index.js';
import { initAudio, openAudioDevice, wakeAudio, restoreAudio, nudgeLevel, toggleMuted, musicLevel, effectsLevel, isMuted, VOLUME } from './audio/engine.js';
import { consumeCues, uiTick } from './audio/sfx.js';
import { auditionMusic, updateMusic } from './audio/music.js';
import { menuTrackLedger, updateMenuTrack } from './audio/track.js';
import { advanceVolumePanel, showVolumePanel } from './render/volume.js';
import { noteFrame, panelIsUp as debugIsUp, togglePanel as toggleDebugPanel } from './render/debug.js';
import { advanceToasts, clearToasts, pushAwardToast } from './render/toast.js';
import { advanceLogo, dimLogo, measureLogo, setCalmMotion } from './render/logo.js';
import { initScreens, hideScreens, showGameOver, showVictory, revealWinHint, showShip, showChallenge, showRack, showPerks, showCodex, showLog, showAwards, showRules, showStanding, showPause, showSettings, fitSettings, showKeys, fitKeys, openHangar, openCodex, openPause, openSettings, openKeys, closePanels, hangarIsOpen, codexIsOpen, pauseIsUp, settingsIsUp, keysIsUp, panelIsUp, paintKeyWords, paintLaunchHints, paintSettingsHints, paintHangarHints, paintCodexHints, turnCodexRack, fitHangar, fitOpenPanel } from './ui/screens.js';
import { initChips, showChips, chipAt, showGiveUpChip, giveUpChipAt, showPanelChips, panelChipAt, settingRowAt, shipRowAt, perkRowAt } from './ui/chips.js';

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

// The seed an ordinary run comes back to. It is kept apart from `world.seed` because of the daily run
// (game/daily.js): flying today's arena writes the day's seed into the world, and the ordinary run
// after it has to go back to the arena this visit was given rather than keep flying the day by default.
// Nothing else reads it, and it is nothing but whatever `world.seed` was the last time an ordinary run
// was launched - the address bar's number, a tool's, or a fresh draw.
let visitSeed = 0;

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

/**
 * Begin a new run, if the screen accepts one right now.
 *
 * `whichDay` is 'today' for a run flown on the day's own arena (game/daily.js, the `T` key) and
 * anything else for one flown on an arena of its own. The two differ in exactly one thing before the
 * run begins: where the seed comes from. Everything after it - the arena, the crowd, the purse, the
 * awards - is one run and one set of rules, which is the whole of what "a daily is not a second mode"
 * means in the code.
 */
function beginRun(whichDay) {
  if (!canStartRun(world)) return false;
  initAudio();
  // The press that launches a run is not also a dash. Space is both keys, and a
  // run that began with a dash already spent would read as a broken cooldown.
  consumeInput();
  if (whichDay === 'today') {
    // The day's seed goes into the world for this run and no further, so the seed being replaced is
    // written down on its way past (game/daily.js `beginDailyRun`) - but only by the run that first
    // leaves the visit's own arena, or a second daily run would save the day's seed as the ordinary
    // one and the visit would never come back at all.
    if (world.dailyDay === 0) visitSeed = world.seed;
    beginDailyRun(world);
  } else {
    // Coming back from the day: the day's seed was never this visit's. Otherwise an ordinary launch
    // leaves `world.seed` exactly as it found it - a pinned visit flies its one seed over and over,
    // and a visitor who pinned nothing gets a fresh arena every time.
    if (world.dailyDay !== 0) world.seed = visitSeed;
    endDailyRun(world);
    if (!seedIsPinned) world.seed = randomSeed();
    visitSeed = world.seed;
  }
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
  // A rack that changes things owns the screen it is put up on, launch key included: a press that is
  // meant for the row the cursor is on is not also a press that starts a run out from under it.
  if (ownsTheScreen()) return;
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

/**
 * A chip went down under a thumb - or under a cursor, which is allowed the same three words.
 *
 * Nothing here is a new action. Each chip is answered by the very handler its letter is answered by,
 * guards included, which is the whole point of writing it this way: the day, the rule and the sound do
 * exactly what `T`, `X` and `M` do, on the screens those keys are answered on and nowhere else, and a
 * chip can never get out of step with the key it stands in for because there is only one of each.
 */
function pressChip(id) {
  if (id === 'today') onToday();
  else if (id === 'rule') onChallenge();
  else if (id === 'mute') onMuteSwitch();
  else if (id === 'settings') onSettings();
  else if (id === 'hangar') onHangar();
  else if (id === 'codex') onCodex();
}

/**
 * A press landed on the settings panel.
 *
 * Two things it can be, and each is the very thing a key already does somewhere else. The CLOSE chip is
 * `O` - the same `onSettings` toggle, so a panel shut from a chip over a held run puts the pause back up
 * exactly as the key does, with the same tick and the same refusal of a screen it is not offered on.
 *
 * A row is its own next value: the cursor goes to the row that was pressed and the row's `cycle` answers it,
 * so a picture row moves to the next step of its table and back round to its first, a slider goes through
 * the door the slider keys use (heard on the bus it moved, with the canvas readout lighting beside the
 * panel), and the two switches a thumb run has turned on go off. A tap is deliberately *not* the right
 * arrow: a thumb has no other direction to ask in, and most of these rows ship at the top of their travel,
 * where the right arrow answers nothing at all (see `settingRows`, where both verbs live and why).
 *
 * The one row on that panel that is not a setting - the door onto the controls rack - is not painted for a
 * visit that has never pressed a key (see `settingRows`), so a press here can never open a rack whose every
 * verb is a key press on a machine that has no keys to press.
 */
function pressSettingsPanel() {
  if (panelChipAt('settings', mouse.x, mouse.y)) { onSettings(); return; }
  const at = settingRowAt(mouse.x, mouse.y);
  if (at < 0 || at >= paintedRows.length) return;
  const row = paintedRows[at];
  settingCursor = at;
  // A door is a door whichever hand comes to it (`onRowChange` sends an arrow through the same door).
  if (row.opens !== undefined) { row.opens(); return; }
  if (row.cycle()) paintSettings();
}

/**
 * Which row of the shop is asking for its second tap: the rack's own index (the ships first, then the
 * perks, exactly as the number keys count them), or -1 when no row is.
 *
 * It lives here and not in the page because it is panel furniture and not a fact about the purse: it is
 * forgotten when the shop goes back up, it is cancelled by any other press, and nothing outside this
 * screen can see it - the same standing the settings panel's cursor has.
 */
const NOT_ASKING = -1;
let askingRow = NOT_ASKING;

/** The row of either rack this point landed on, in the rack's own numbering, or -1 for none. */
function hangarIndexAt(x, y) {
  const ship = shipRowAt(x, y);
  if (ship >= 0) return ship;
  const perk = perkRowAt(x, y);
  return perk < 0 ? -1 : SHIPS.length + perk;
}

/** Repaint both racks from their owners, with whatever the shop is asking about. */
function paintHangar() {
  const onGlass = hasFinger();
  showRack({ owned: world.ownedShips, asking: askingRow, onGlass: onGlass });
  showPerks({ ranks: perkLedger(world), asking: askingRow, onGlass: onGlass });
}

/** Take the ask off the row that had it, and off the glass. */
function clearAsk() {
  if (askingRow < 0) return;
  askingRow = NOT_ASKING;
  paintHangar();
}

/**
 * A press landed on the hangar.
 *
 * Three things it can be, and each is a thing the keys already do. The CLOSE chip is `H` (the same
 * `onHangar` toggle). A bought ship row is the number key: the next run flies that one, free, immediate,
 * and lit, because `showShip` is what lights the row the visit flies. And a row that costs stardust is
 * `SHIFT + its number` - but in two taps, because this is the only press in the game that costs the purse
 * something and a finger has no chord to lean on: the first tap asks, the row says so in its own price
 * line (`TAP TO BUY`, then `TAP AGAIN TO BUY`), and the second tap on the same row is the purchase.
 *
 * The ask is only ever put on a row the purse could actually pay for, and it comes off for anything else:
 * another row, the glass between the rows, the way out. A shop that left a row asking after a press that
 * was not its second tap would be selling the next tap to the wrong row.
 */
function pressHangarPanel() {
  if (panelChipAt('hangar', mouse.x, mouse.y)) { askingRow = NOT_ASKING; onHangar(); return; }
  const index = hangarIndexAt(mouse.x, mouse.y);
  if (index < 0) { clearAsk(); return; }
  if (askingRow === index) {
    askingRow = NOT_ASKING;
    buyFromRack(index);
    paintHangar();
    return;
  }
  clearAsk();
  if (index < SHIPS.length && pickShipByIndex(world, index) === 'picked') {
    showShip(world.ship);
    uiTick('pick');
    return;
  }
  const cost = rackPrice(world, index);
  if (cost === null || cost > world.dust) return;   // nothing to sell, or a purse too short: a silent press
  askingRow = index;
  paintHangar();
  uiTick('ask');
}

/**
 * A press landed on the codex.
 *
 * Two things it can be, and neither is a row. The CLOSE chip is `C` (the same `onCodex` toggle). The NEXT
 * RACK chip turns the panel to the next of its five racks, wrapping, because this is a page you read to
 * the bottom of and then start again. And a row answers nothing, which is the whole difference between
 * this panel and the other two: the codex sells nothing and changes nothing, so there is nothing for a
 * tap on one of its lines to mean.
 *
 * The two chips exist because the five racks do not fit a phone in the first place (ui/screens.js
 * `paintCodexHints` says why), so this is the one panel whose thumb shape is about *seeing* it rather
 * than about doing anything in it.
 */
function pressCodexPanel() {
  if (panelChipAt('codex', mouse.x, mouse.y)) { onCodex(); return; }
  if (panelChipAt('codexNext', mouse.x, mouse.y)) {
    turnCodexRack();
    uiTick('page');
  }
}

function onCanvasPressed() {
  initAudio();
  // The pause rack's GIVE UP chip, asked before anything else on this screen and before the thumb's own
  // way back into the run in particular - because on a thumb's pause that way back owns every pixel of
  // the glass, and the one control that means something else has to be asked first or it is no control
  // at all. It is refused while any other panel is up: the settings rack over a held run is a rack a
  // tap is meant for, and a chip behind a panel is not a chip anybody is aiming at.
  if (pauseIsUp() && giveUpChipAt(mouse.x, mouse.y)) {
    pressGiveUpChip();
    return;
  }
  // A thumb is the one hand with no Esc on it, and its tap carries no gun - a run flown on a finger
  // holds its own trigger (game/assists.js) - so the reason a click may not resume a paused run is
  // precisely the reason a tap is allowed to. It has to be asked before the panel rule below,
  // because the pause *is* one of the panels, and the pause rack says so in its own line
  // (ui/screens.js `showPause`). The settings rack over a held run still owns the screen: a tap that
  // is meant for a row is not a tap that goes back into the fight.
  //
  // It is answered by `onPauseKey` and not by `resumeRun` on its own, because the way out of a held
  // run is two things and not one: the clock let go *and* the rack taken down with it. Calling
  // `resumeRun` here left the run flying behind a panel that had stopped meaning anything - a whole
  // window of rack over an arena that was live again, with nothing on the glass left to close it.
  if (world.paused && thumb.used && !ownsTheScreen()) {
    onPauseKey();
    return;
  }
  // The settings panel and the shop are the two panels here that *change* something, so they answer a press
  // with their own rows rather than refusing it (see `pressSettingsPanel`, `pressHangarPanel`). They are
  // asked before the rule below, which takes a press away from every panel and answers nothing with it - the
  // right answer for the panels that only show things, and the wrong one for these two now that a finger has
  // a chip to get in with.
  if (settingsIsUp()) { pressSettingsPanel(); return; }
  // ...and the shop answers a press with its own rows (see `pressHangarPanel`): a ship row to fly, and a
  // row that costs stardust to buy, which asks first.
  if (hangarIsOpen()) { pressHangarPanel(); return; }
  // ...and the codex answers with its two chips and nothing else (see `pressCodexPanel`).
  if (codexIsOpen()) { pressCodexPanel(); return; }
  // Over a panel a click is not a launch. The title's click-to-go is worth having and the
  // death's card's is worth having, but a panel you are meant to be able to look round is not a
  // screen that throws you into a run because you aimed at a ship and missed - and there are two of
  // them now, one of which is full of things to look at and neither of which is a launch button.
  if (panelIsUp()) return;
  // The thumb's chips (ui/chips.js), which are on the title and nowhere else. The check sits after the
  // panels - a panel owns the glass it is up on, chips included, and the rail is behind one of them
  // either way - and before everything a title press can otherwise be, because a press that landed on
  // the day's chip is that press and not the launch it would otherwise have been.
  if (world.state === STATE.START) {
    const chip = chipAt(mouse.x, mouse.y);
    if (chip !== '') {
      pressChip(chip);
      return;
    }
  }
  // While the cards are up the click is an answer, not a shot and not a restart - and it
  // can be one of three answers: take this card, banish it out of the run, or deal the
  // table again (render/cards.js is what says which one the point landed on).
  if (world.state === STATE.LEVEL) {
    answerChoice(mouse.x, mouse.y);
    return;
  }
  // The pause plate (input/touch.js `pauseButton`), for the hand whose press does not come in through
  // the touch layer at all: a cursor on a machine that has both. A finger's press on the same plate is
  // claimed by the layer itself (input/touch.js `claimPause`) and never reaches here, and both of them
  // answer `onPauseKey` - the very key the plate stands in for, so it cannot get out of step with it.
  // `onPausePlate` is the same question the plate is painted with, which is the one guarantee a control
  // on the glass has to have: the disc you see is the disc you press.
  if (onPausePlate(mouse.x, mouse.y)) {
    onPauseKey();
    return;
  }
  // Over a paused run a click is nothing at all. The pause is not a screen to be clicked through on
  // the way back into the fight: the left button is the gun, so a click that resumed the run would
  // also fire it, and a player who meant to dismiss a panel and missed would be shot off before they
  // were even looking. Esc and P are the way out, and they mean one thing - and a thumb, which has
  // neither key and no gun either, was answered above.
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
 * T: fly today's arena (PLAN milestone 10, game/daily.js).
 *
 * One press is one run, on the day's own seed - the arena everybody else is flying today and nobody
 * gets to re-roll. It answers on every screen the launch key launches from (the title, the death's
 * card, and a won run once its card can be answered) and nowhere else, because it *is* a launch: mid-
 * run there is nothing to answer, and `canStartRun` is the one question that says so.
 *
 * It is not a mode. Nothing is remembered about "being on the daily": press it again for another run
 * today, press the launch key for a run of your own, and the day is only ever written into the run
 * that was flown on it.
 */
function onToday() {
  initAudio();      // same reason as `onPickCard`: this can be the first press of the visit
  beginRun('today');
}

/**
 * X: a harder rule for the next run (game/challenges.js).
 *
 * One press rounds the cycle - nothing, then one hull, then no dash, then a swift crowd, then a thick
 * one - and the title's own line says which of these the next launch will stand under. It is a choice
 * about the *next* run and nothing else, which is why it is answered on the two screens a run is
 * launched from and nowhere else:
 *
 *   * a run that is flying, or is being held, or is waiting for a card keeps the rules it was flown
 *     under. Changing them mid-run would be rewriting the game the player is playing, and the outcome
 *     of a fight you already fought would move with it.
 *   * a run that is won may still be handed back and flown on (game/run.js `continueRun`), so its
 *     rules are still its own until the card is answered one way or the other.
 *   * a settings panel or a controls rack on the glass owns the keys, as they own the launch - and a
 *     choice made behind a panel you cannot see through is a choice made in the dark.
 */
function onChallenge() {
  initAudio();      // same reason as `onToday`
  if (ownsTheScreen()) return;
  if (world.state !== STATE.START && world.state !== STATE.OVER) return;
  const id = cycleChallenge(world);
  showChallenge(world);
  // Up when a rule went on and down when the last one came off, which is the pair every other press
  // in this interface is written in (BALANCE.ui): a yes and a going-away.
  uiTick(id === '' ? 'down' : 'pick');
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
  // The numbers name a row of whatever panel is on the glass, and neither of the two racks that
  // change things has numbered rows - so they are refused here rather than left to quietly change the
  // ship behind a panel a player is looking at (see `ownsTheScreen`).
  if (ownsTheScreen()) return;
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
  showStanding(world.best, world.dust, wonShare(world));
  // ...and a row that ran out of prices is a shorter row, so the panel may need less of the window
  // than it did a moment ago (ui/screens.js `fitHangar`).
  fitHangar();
  paintHangar();
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
// Five rows belong to game/settings.js, three to audio/engine.js and two to game/assists.js; nothing
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
 * The panel's rows, in the order it prints them: the five the game keeps for its own picture
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
 * Each row carries a `cycle` beside it, for the hand that has no left and no right: a tap on a row is
 * that row's next value, coming back round to its first after its last. Without it the panel would be
 * almost dead to a finger, because most of these rows ship at the top of their travel and `step(+1)`
 * answers nothing there - including the two switches a thumb run has turned *on* for it. The arrow keys
 * keep their no-wrapping rule (game/settings.js `stepRow` says why); a tap is a different gesture, on a
 * row the player is looking at, and it is answered by whoever owns the table rather than by the panel
 * counting steps of its own.
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
      cycle: function () {
        const at = row.steps.findIndex(function (step) { return step.id === pictureStep(row.id); });
        if (cyclePictureRow(row.id) === null) return false;
        // The tick rises on the way up the table and falls on the one step that comes back round to the
        // beginning of it, because the word on the row falls there too.
        uiTick(at + 1 >= row.steps.length ? 'down' : 'up');
        return true;
      },
    });
  }
  // The door to the keys. It is not a setting - nothing it steps through changes a number, it puts up
  // another rack - so it carries an `opens` instead of a `step` and `onRowChange` sends it a different
  // way (see that function). Its value says whether this save has moved anything at all, which is the
  // one thing about the keymap a player can be told without opening it.
  //
  // And it is only on the panel for a visit that has pressed a key (input/keyboard.js `hasKeyboard`).
  // Every verb behind that door is a key press - take a key, put the shipped one back - and a rack of them
  // on a phone is a page nothing on it can be answered. A keyboard visit cannot notice the difference: it
  // reached this panel with `O`, which is itself a press of a key, so the row is there whenever the panel
  // can be reached by a key at all.
  if (hasKeyboard()) {
    const moved = keysChangedCount();
    rows.push({
      name: 'KEYS',
      says: 'EVERY KEY THE SHIP ANSWERS \u00b7 PRESS LEFT OR RIGHT',
      value: moved === 0 ? 'ALL SHIPPED' : moved + ' CHANGED',
      opens: openKeysPanel,
    });
  }
  const music = function (delta) { return onVolume('music', delta); };
  rows.push({
    name: 'MUSIC', says: 'THE SEQUENCER UNDER THE ARENA',
    value: sliderWords(musicLevel()),
    step: music,
    // Past the top of a slider is its bottom: the whole travel is one tap away in either direction, and
    // a thumb has only the one direction to ask in.
    cycle: function () { return music(1) || music(-VOLUME.steps); },
  });
  const effects = function (delta) { return onVolume('effects', delta); };
  rows.push({
    name: 'SOUND', says: 'EVERY SHOT, HIT AND EXPLOSION',
    value: sliderWords(effectsLevel()),
    step: effects,
    cycle: function () { return effects(1) || effects(-VOLUME.steps); },
  });
  rows.push({
    name: 'MUTE', says: 'THE WHOLE GAME, QUIET',
    value: isMuted() ? 'ON' : 'OFF',
    step: function () { return onMuteSwitch(); },
    // Two values, so the next one is the other one however it is asked for.
    cycle: function () { return onMuteSwitch(); },
  });
  for (const row of ASSIST_ROWS) {
    const step = function (delta) {
      if (stepAssistRow(row.id, delta) === null) return false;
      uiTick(delta > 0 ? 'up' : 'down');    // the same answer every other row gives, at the same moment
      return true;
    };
    rows.push({
      name: row.name,
      says: row.says,
      value: assistWords(row.id),
      step: step,
      // ...and these two are on for a run flown on a thumb (game/assists.js), so the way a thumb turns one
      // off has to be the way round and not the way up.
      cycle: function () { return step(1) || step(-1); },
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
  paintedRows = rows;
  showSettings({ note: SETTINGS_NOTE, rows: rows });
  fitSettings();
}

/**
 * The rows exactly as the panel was last painted.
 *
 * The panel is printed from its owners and then walked by the arrow keys, by a tap and by the cursor, and
 * all of them have to be walking the list the player is looking at rather than a fresh one built a moment
 * later. The two are not always the same list: `hasKeyboard` turns the door to the controls rack on at the
 * visit's first key press, and a key press on its own does not repaint the panel - so a list rebuilt after
 * one is a row longer than the glass says it is, and a tap on the eighth row an eye can see would step the
 * ninth. What is kept here is only the shape that was printed; every row still asks its owner live for the
 * word it shows and the step it takes.
 */
let paintedRows = [];

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
  // The controls rack is a page of this panel, and O is the way back off it - the same key that got
  // there, because a rack reached from the settings belongs to them.
  if (keysIsUp()) {
    backToSettings();
    return;
  }
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
 * Is a rack that *changes* things on the glass?
 *
 * The settings panel and the controls rack behind it are one family: both are arrow-driven, both keep
 * nothing about the run they are sitting over, and both therefore stand between the launch key and the
 * run it would otherwise start, and between a number key and the ship behind the panel. The hangar and
 * the codex only read, so a launch over them is still a launch and a number is still a pick.
 */
function ownsTheScreen() {
  return settingsIsUp() || keysIsUp();
}

// --- the controls panel ---------------------------------------------------------
// The keys a hand can move (core/keymap.js), on a rack of their own one press off the settings panel.
// What lives here is the panel's furniture - which row the cursor is on, and whether one of them is
// waiting for a key - and none of it is a fact about a run or a save: the bindings are the keymap's,
// and the keymap writes them to the save the moment one moves.

/** The cursor on the controls rack, counted from the top. Back to the top every time it goes up. */
let keysCursor = 0;

/** Which row is waiting for a key, or -1 when none is. One at a time: there is one keyboard. */
let waitingRow = -1;

/** What the rack says under its own heading, beside the settings panel's own line. */
const KEYS_NOTE = 'EVERY KEY IS KEPT FOR THE NEXT VISIT';

/** The line under the rack. It changes while a row is waiting, because the keys have changed meaning.
 * Both lines are caps and neither ends on a full stop, like everything else on a panel (test/words). */
const KEYS_HINT = '\u2191 \u2193 PICK A ROW \u00b7 \u2192 TAKE A KEY \u00b7 \u2190 PUT THE SHIPPED KEY BACK';
const WAITING_HINT = 'PRESS THE KEY YOU MEAN \u00b7 ESC LEAVES THE ROW AS IT IS';

/**
 * The rack's rows, straight out of the table (core/keymap.js `ACTIONS`): the control, the key that
 * answers it *now*, and the table's own line about what the control is.
 *
 * `waiting` is the row a hand is being asked about, and it is the only row lit in amber - a cyan cursor
 * means "this row, next arrow changes it" and amber means "this row, next key is it", and one row can
 * only be one of those at a time (ui/screens.js `showKeys`).
 */
function keyRows() {
  const rows = [];
  for (let i = 0; i < KEY_ACTIONS.length; i++) {
    const action = KEY_ACTIONS[i];
    rows.push({
      name: action.name,
      says: action.says,
      value: keyWords(action.id),
      chosen: i === keysCursor,
      waiting: i === waitingRow,
    });
  }
  return rows;
}

/** Paint the rack from the table, and fit it to the window like every other panel. */
function paintKeys() {
  showKeys({
    note: KEYS_NOTE,
    hint: waitingRow < 0 ? KEYS_HINT : WAITING_HINT,
    rows: keyRows(),
  });
  fitKeys();
}

/** Stop asking the keyboard for a key, whoever was asking. */
function stopListening() {
  waitingRow = -1;
  captureKeys(null);
}

/** Put the row the cursor is on into "press the key you mean" (input/keyboard.js hands it over). */
function startListening() {
  waitingRow = keysCursor;
  captureKeys(takeCapturedKey);
  paintKeys();
}

/**
 * The next keypress, given to the row that asked for it.
 *
 * Three answers, and the first is the safety net: the rack may have been taken down under the
 * rebinding - a held run let go of with `Esc`, a hangar opened with a stray letter - and a request made
 * by a panel nobody can see is a request to cancel rather than one to honour.
 *
 * A key the game cannot name (a function key, a modifier, one of the numbers a card is answered with)
 * is refused in silence and the row keeps waiting, which is the same bargain every refused press in this
 * game strikes: the panel does not light for a key that did nothing. `Escape` is the way out of the row,
 * and the only thing it does while the row is waiting - the pause keeps its meaning the moment the rack
 * stops asking.
 */
function takeCapturedKey(code) {
  if (!keysIsUp()) { stopListening(); return; }
  if (code === CANCEL_KEY) {
    stopListening();
    paintKeys();
    uiTick('close');
    return;
  }
  if (!keyIsBindable(code)) return;
  const moved = rebindKey(KEY_ACTIONS[waitingRow].id, code);
  if (moved === null) return;       // the key this row already wears: nothing moved, nothing to say
  stopListening();
  paintKeys();
  // ...and every other place the game prints a key says the new one too - the title's list, the racks'
  // hints, the pause's line, and the lesson plate in play (ui/screens.js `paintKeyWords`).
  paintKeyWords();
  uiTick('confirm');
}

/** The settings panel's door into this one (see `settingRows`, where the KEYS row lives). */
function openKeysPanel() {
  stopListening();
  keysCursor = 0;
  paintKeys();
  openKeys();
  uiTick('open');
}

/** ...and the way back: repaint the settings panel from its owners and put it up again, which is what
 * taking this rack down leaves looking wrong (ui/screens.js `raisePanel` takes it down on its way up). */
function backToSettings() {
  stopListening();
  paintSettings();
  openSettings();
  uiTick('close');
}

/** Up and down on the controls rack: the cursor, and nothing else. No wrapping, same rule as the
 * settings panel - the end of the rack is a place to be. Moving the cursor while a row is waiting
 * cancels the wait: a hand that has moved the cursor has stopped asking for that key. */
function moveKeysRow(delta) {
  if (waitingRow >= 0) stopListening();
  const last = KEY_ACTIONS.length - 1;
  const next = Math.max(0, Math.min(last, keysCursor + delta));
  if (next === keysCursor) {
    if (waitingRow < 0) return;      // nothing moved and nothing was waiting: a silent press
    paintKeys();
    return;
  }
  keysCursor = next;
  paintKeys();
  uiTick('pick');
}

/**
 * Left and right on the controls rack: right asks the keyboard for a new key for the row, left puts the
 * shipped one back.
 *
 * Left is the arrow that means "back", which is why it gets the undo, and it is silent when the row is
 * already shipped - a press that changed nothing is not allowed to look as though it had (BALANCE.ui).
 */
function changeKeysRow(delta) {
  // Any arrow on this rack ends the asking first: a hand that has gone back to the arrows has stopped
  // answering the question the row asked. Then the arrow does its own verb - right asks again, left puts
  // the shipped key back (and a row that is already shipped is put back by nothing).
  stopListening();
  if (delta > 0) { startListening(); return; }
  if (!restoreKey(KEY_ACTIONS[keysCursor].id)) return;
  paintKeys();
  paintKeyWords();
  uiTick('down');
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
  if (keysIsUp()) { moveKeysRow(delta); return; }
  if (!settingsIsUp()) return;
  const last = paintedRows.length - 1;
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
  if (keysIsUp()) { changeKeysRow(delta); return; }
  if (!settingsIsUp()) return;
  const row = paintedRows[settingCursor];
  // One row on that panel is not a setting at all: it is a door onto the rack below it, and a door is
  // opened the same way whichever arrow is pressed (see `settingRows`, where the row lives).
  if (row.opens !== undefined) { row.opens(); return; }
  if (!row.step(delta)) return;
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
    // Which day this run is being flown on, in the pause's own row shape - null for a run flying an
    // arena of its own, which is how the rack leaves the row out (game/daily.js).
    daily: pauseWords(world),
    // ...and which rule it is being flown under, in the same row shape - null for a run standing under
    // no rule at all, which is how that row stays off the rack (game/challenges.js).
    challenge: challengePauseWords(world),
    shipId: world.ship,
    // What the run would be paid if it stopped this second (game/stardust.js) - which, with a "give
    // up" key on this very panel, it might.
    dust: dustForRun(world),
    ranks: world.upgrades,
    cut: banishedLines(world),
  };
}

// Has the pause's GIVE UP chip been pressed once already? The word on the chip is painted from this and
// from nothing else (ui/chips.js `showGiveUpChip`), so the question a thumb reads and the press that
// answers it are one fact and not two that have to be kept in step.
let giveUpAsked = false;

/**
 * Paint the pause from the run as it stands, and put it up. Both the key and a window that has lost
 * focus do this; only the key answers itself with a sound, because only a press has an ear waiting
 * for one.
 *
 * Every rack that goes up is a plain one: a give-up that was half-asked for on the last pause is not a
 * give-up this one has been asked for, and a chip that came back wearing a question nobody asked is a
 * chip that ends a run on the next stray tap.
 */
function raisePause() {
  giveUpAsked = false;
  showPause(describePause(), thumb.used);
  showGiveUpChip(thumb.used, false);
  openPause();
}

/**
 * The pause rack's GIVE UP chip went down: a thumb's `G`, and it takes two presses to land.
 *
 * It is answered by `onGiveUp` and by nothing else, guards included, for the usual reason - the letter
 * and the chip cannot then get out of step, and a run given up from a chip is banked and carded exactly
 * as one given up from a key is. What the chip adds is the second press, and it has to: this is the one
 * press in the game that costs a run, and a screen whose every other pixel is "tap to go back" is a
 * screen where one careless tap must not be able to end one. So the first press only changes the word
 * on the chip, and every other press in the game - a tap back into the run, the settings, the rack going
 * down at all - leaves it unanswered and the run keeps flying.
 *
 * The first press answers itself with the low edge of an ask (BALANCE.ui), because it did something: the
 * chip is asking now. The second is answered by the run's own ending, which makes its own noise.
 */
function pressGiveUpChip() {
  initAudio();
  if (!giveUpAsked) {
    giveUpAsked = true;
    showGiveUpChip(true, true);
    uiTick('ask');
    return;
  }
  giveUpAsked = false;
  showGiveUpChip(true, false);      // the question is answered, so it comes off the chip with the run
  onGiveUp();
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
  // A shop that came back up still asking about a row is a shop holding a question nobody asked any
  // more: the ask is one press's business and not one visit's. And the racks are painted from their
  // owners on the way up, so what a row says about its price is what the purse says now and not what it
  // said the last time this panel was on the glass.
  askingRow = NOT_ASKING;
  paintHangar();
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
    // Which day this run was flown on, and whether this ending beat the day (game/daily.js
    // `cardWords`). 0 and false for a run that flew an arena of its own, which is what makes the card's
    // line empty rather than wrong.
    dailyDay: world.dailyDay,
    newDailyBest: world.newDailyBest,
    // Which harder rule this run was flown under ('' for none), so the card can say so and say nothing
    // when there was nothing to say (game/challenges.js `cardWords`).
    challenge: world.challenge,
    // ...and whether this ending beat what the save had scored under that rule, and where the rule's
    // best stands now (game/challenges.js). The ledger travels with the card for the same reason the
    // codex and the log do: the panel that goes up over this card must not disagree with it.
    newChallengeBest: world.newChallengeBest,
    challengeBests: bestsFromSave(),
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

/**
 * How far in front of the ship a stick's aim point is put, in px.
 *
 * It is a rendering number and nothing else: game/player.js takes an arctangent of the gap between
 * the ship and the aim point, so any distance at all points the gun the same way, and the view's own
 * lean towards whatever is being aimed at (render/camera.js) is the only thing that notices how far
 * out the point sits. This is about the distance a hand on a mouse is usually pointing at - far
 * enough that the view leans for a stick the way it leans for a cursor out near the edge.
 */
const STICK_AIM_REACH = 500;

/**
 * Point the nose where the right stick points (input/gamepad.js).
 *
 * A pointer is a place on the glass and comes into the arena through the camera. A stick is a
 * direction, so it is written as a point a fixed distance in front of the ship instead - and it is
 * measured from the ship's *stepped* position rather than its painted one on purpose. The step reads
 * this point too, and a leaning, interpolated ship would put a shiver in the angle every gun is
 * fired along; the camera is the only other reader and it smooths the difference away.
 */
function pointFromStick(input) {
  const ship = world.player;
  input.aimX = ship.x + input.aimDirX * STICK_AIM_REACH;
  input.aimY = ship.y + input.aimDirY * STICK_AIM_REACH;
}

function frame(now) {
  // The simulation is stepped in whole fixed steps; whatever the clock still
  // owes is the moment in between them this frame is drawn at.
  const tick = clock.frame(now);
  const input = readInput();
  // The controls speak in pixels on the glass and the simulation speaks in arena
  // coordinates, so the aim goes through the camera on its way in - unless a hand is pointing the
  // guns with a stick, which is a direction and has no place on the glass at all.
  if (input.stickAim) pointFromStick(input); else resolveAim(input);

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
  //
  // The mark is asked on the frame and not on the way into a panel, because panels are opened and closed
  // from half a dozen places and the mark only has to know the answer once per frame: whatever the glass
  // is putting up, the title is behind it, and the mark is the largest thing on the title.
  dimLogo(panelIsUp());
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
  }
  // The death's flag is forgotten on any screen that is not an ending at all. It is *not* forgotten in
  // the `else` above, tempting as that looks, because that branch is taken for a death as much as for a
  // title: forgetting the flag there meant the wreck's card was painted again on every frame it was up -
  // its knock once per frame instead of once per run, and the codex, the log, the awards and the rule
  // racks all written again sixty times a second behind it.
  if (world.state !== STATE.OVER && world.state !== STATE.WON) overCardShown = false;
  consumeCues(world.state);
  // The music is wound on the same frame the cue queue drains on: what the run looks
  // like right now - how far in it is, whether a boss is standing in it, how much hull the
  // ship has left - is a frame's question, and the simulation never learns music exists at
  // all (audio/music.js).
  updateMusic(world);
  // ...and beside it sits the one thing that is not synthesised: the menu's recording, which asks for
  // its bytes only while the attract screen is the screen being looked at (audio/track.js).
  updateMenuTrack(world);
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

/**
 * The presses a sleeping audio device will accept as its permission to start (audio/engine.js
 * `wakeAudio`). Every one of them, and not just the ones the game answers: a visitor who presses a key
 * this page does nothing with has still told the browser that sound is wanted here, and a menu that
 * stays quiet through that press is the bug this is here for. They stay on for the whole visit, because
 * waking a device that is already running is nothing and a browser can fall asleep again on its own.
 */
const AUDIO_WAKE_EVENTS = ['keydown', 'mousedown', 'pointerdown', 'touchstart'];

function boot() {
  // The keys first, before anything can print one: the rack of them, the title's list and the lesson
  // plate in play all read the table this fills (core/keymap.js).
  loadKeys();
  initScreens();
  initCanvas(document.getElementById('game'));
  logoBox = document.getElementById('logoBox');
  // The thumb's chips, put up or not for the whole visit on the one thing the browser says about a
  // finger (input/touch.js). They are measured against the glass, so they are built after it.
  initChips(view.canvas);
  showChips(hasFinger());
  // ...and the settings panel's way out, on the same fact: a visit that came in on a finger gets a chip to
  // close a panel it can now walk, and a visit with a keyboard has `O` and no plate where the letter is.
  showPanelChips(hasFinger());
  // ...and the three lines that say *press to go* are written for the same hand, so a visit that came in
  // on a finger is never told to find a letter it does not have (ui/screens.js `paintLaunchHints`).
  paintLaunchHints(hasFinger());
  // ...and the two lines under the settings panel's rows, on the same fact again (ui/screens.js
  // `paintSettingsHints`).
  paintSettingsHints(hasFinger());
  // ...and the two under the shop's racks (ui/screens.js `paintHangarHints`).
  paintHangarHints(hasFinger());
  // ...and the one under the codex's racks, which also decides whether that panel is walked a rack at a
  // time (ui/screens.js `paintCodexHints`).
  paintCodexHints(hasFinger());
  onResize();
  // Whether this visitor asked for as little movement as the machine can give (the same query the
  // CSS reads for its own fades). Once, at boot, like the pixel ratio: it is a fact about the
  // window, and the title is the only thing in the game that moves on the strength of it.
  setCalmMotion(calmMotion());
  // The mixer first, before anything can make a sound or paint a level: the two sliders and the
  // mute come back from wherever the last visit left them (core/save.js).
  const mixer = restoreAudio();
  // ...and the device itself, before the first frame has gone by. A browser decides for itself whether
  // a page may make a sound without being asked (a visitor who has heard sound here before, or a
  // browser with no such rule, gets a device that is already running) and the only way to find out
  // which kind of visit this is, is to ask for the device - so the title screen's own song gets its
  // chance at the first frame instead of waiting for a press that is usually the launch (audio/track.js).
  // Where the browser says no the device is built and asleep, nothing is spent on it, and the first
  // press of any kind wakes it - which is what the listeners below are, because a press the game does
  // not answer is still a press, and still the browser's answer to "may this page make a sound". A
  // visit that came back muted gets one too: the mute is a knob on the bus above it, and pressing M
  // on the title is meant to be the moment the menu starts singing.
  openAudioDevice();
  for (const wakeEvent of AUDIO_WAKE_EVENTS) {
    window.addEventListener(wakeEvent, wakeAudio, { passive: true });
  }
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
  visitSeed = world.seed;
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
  // ...and which of the three prompts this save has already been through (game/tutorial.js), read the
  // same once for the same reason. An empty list is a first visit, and a full one is a visit that
  // knows how to fly, shoot and get out - which is the only thing the three lessons are for.
  world.tips = tipsFromSave();
  // Now the screens can be told what the visit has to show for itself, and which body it flies.
  showStanding(world.best, world.dust, wonShare(world));
  paintHangar();
  showCodex(world.found);
  showLog(world.pastRuns);
  showAwards(world.awards);
  // ...and what the runs of this save have scored under each harder rule (game/challenges.js), read
  // the same once for the same reason. A rule with nothing under it is a rule nobody has flown yet, and
  // the rack says exactly that about it.
  showRules(bestsFromSave());
  showShip(world.ship);
  showChallenge(world);
  saveNote = saveProblem();
  saveWritable = saveIsWritable();
  resetRun(world);
  resetAmbient(world);
  mouse.x = view.W / 2;
  mouse.y = view.H / 2 - 100;

  initInput(view.canvas, {
    onConfirm: pressAction,
    onPress: onCanvasPressed,
    // A thumb needs to know whether a run is being flown, because that is what decides whether a
    // finger on the glass is a control or a tap on a screen (input/touch.js). This is the one
    // question the input layer asks the game, and the world is the only place that knows the answer.
    flying: () => world.state === STATE.PLAY && !world.paused,
    onPickCard: onPickCard,
    onReroll: onReroll,
    onHangar: onHangar,
    onCodex: onCodex,
    onPause: onPauseKey,
    onGiveUp: onGiveUp,
    onSettings: onSettings,
    onToday: onToday,
    onChallenge: onChallenge,
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
  /**
   * Put a harder rule on the runs this world flies (game/challenges.js), the way the title's key
   * does - `''` takes it off again. An unknown id throws. A tool that wants to *cycle* the choice the
   * way a hand does calls `cycleChallenge` on the module itself; this is the door that says which
   * rule a run is measured under, and it says it in one call.
   */
  chooseChallenge: function (id) { return setChallenge(world, id); },
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
      // Where the five picture rows stand (game/settings.js): the shake, the flash, the floating
      // numbers, the sparks and the marks. They are the only settings a headless run cannot see any other
      // way, because a screenshot is the only thing any of them changes - and a run played with all five
      // at one end of their travel has to be the same run as one played at the other.
      settings: settingsSteps(),
      // ...and where the two switches that answer for the hand stand (game/assists.js): the held
      // trigger and the pointed gun. They are on the same panel and kept the same way, and they are the
      // two rows on it that change what a run does rather than what it looks like - which is exactly why
      // a tool wants to be able to see them.
      assists: assistSteps(),
      // ...and whether the controls rack is on the glass, and where every movable key is bound
      // (core/keymap.js). A headless tool presses keys by name, so it has to be able to ask what the
      // game is hearing - and a test that rebound something has to be able to say it landed.
      keysUp: keysIsUp(),
      keysWaiting: waitingRow,
      keys: keyTable(),
      // Has this visit flown on a finger (input/touch.js)? It is the third way to hold the two
      // switches above - a thumb means the trigger is held and the gun aims itself - and a headless
      // tool cannot tell it from the two switches, because a visit that turned them on by hand and a
      // visit whose thumb has been on the stick look the same from inside the run.
      thumbUsed: thumb.used,
      // ...and what the pad is called, or '' when this visit has never had one. A headless tool cannot
      // hold a stick, so this is the only way it can say whether the pad was there at all - and the two
      // promises in test/gamepad.test.mjs (a stick flies the ship; no stick changes nothing) both have
      // to be able to tell which of the two a run was flown on. input/gamepad.js.
      pad: pad.name,
      seed: world.seed,
      // Which day this run was flown on, and whether its last ending beat that day's best
      // (game/daily.js). A headless run cannot read a card, and "did the day get banked" is the whole
      // of what the day's key does - 0 for a run that flew an arena of its own.
      dailyDay: world.dailyDay,
      newDailyBest: world.newDailyBest,
      // Which harder rule this run is standing under ('' for none, game/challenges.js) - the fact a
      // tool measures a run under and has to be able to say afterwards.
      challenge: world.challenge,
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
      // What the three prompts have to say right now, in the words on the plate ('' when the plate is
      // empty), and which of them this save has already been through (game/tutorial.js). A headless run
      // cannot see the plate, and "did the tutorial notice I can dash" is otherwise a question with no
      // way to ask it.
      tip: promptWords(world),
      tipsLearned: world.tips.slice(),
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
      // ...and what the menu's recording has got to (audio/track.js): its state machine's name, why it
      // is there, how many bytes and seconds arrived, and how many times it has started and stopped. A
      // headless visit cannot hear it and a browser will not play it before a press, so this is the only
      // way to ask whether the song is there at all.
      menuTrack: menuTrackLedger(),
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
      // ...and how many hulls the run has lost in all: the same tally read as a count instead of a
      // breakdown. A tool that asks how *often* a run is being hit, rather than by what, has no other
      // way to ask - and the rate is the question the difficulty shape asks minute by minute
      // (tools/run-shape.js).
      hullLost: world.tally.hullLost,
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
      // ...and the two counters over the whole run: how many steps the gun stood loaded, and how
      // many pulls went out loaded. A run that never took the line reads 0 in both, and the ratio
      // between them is the card's whole story - a loaded gun that is never pulled is a charge
      // spent on standing (tools/line-ab.js --line overcharge --stats overchargeLoaded,overchargeSpent).
      overchargeLoaded: world.overcharge.loaded,
      overchargeSpent: world.overcharge.spent,
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
