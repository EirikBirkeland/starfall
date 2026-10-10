// Boot, the frame loop, and the wiring between the layers. This is the only
// module that is allowed to know about all of them at once.

import { world, stepWorld } from './game/world.js';
import { startRun, resetRun, canStartRun, continueRun, victoryCardIsAnswerable, victoryCardIsUp } from './game/run.js';
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
import { initCanvas, resizeCanvas, view } from './render/canvas.js';
import { camera, resolveAim, screenX, screenY, snapCamera } from './render/camera.js';
import { buildStars, updateStars } from './render/background.js';
import { updateNebula } from './render/nebula.js';
import { renderFrame } from './render/renderer.js';
import { choiceHit } from './render/cards.js';
import { arrowCount, resetIndicators } from './render/indicators.js';
import { initInput, readInput, consumeInput, mouse } from './input/index.js';
import { initAudio, restoreAudio, nudgeLevel, toggleMuted, musicLevel, effectsLevel, isMuted } from './audio/engine.js';
import { consumeCues, uiTick } from './audio/sfx.js';
import { auditionMusic, updateMusic } from './audio/music.js';
import { advanceVolumePanel, showVolumePanel } from './render/volume.js';
import { advanceToasts, clearToasts, pushAwardToast } from './render/toast.js';
import { initScreens, hideScreens, showGameOver, showVictory, revealWinHint, showShip, showRack, showPerks, showCodex, showLog, showAwards, showStanding, openHangar, openCodex, closePanels, hangarIsOpen, codexIsOpen, panelIsUp, fitHangar, fitCodex } from './ui/screens.js';

const clock = createClock(BALANCE.sim.step, BALANCE.sim.maxFrameDt);
// The readouts the debug hook reports: how fast the frames are arriving, and
// where between the last step and the next one the frame just drawn sat.
let lastFps = 60;
let lastAlpha = 0;

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
// Has the won run's card been told what its keys do yet? Same bargain as the one above: it happens
// once, and it is forgotten the moment the world is on another screen.
let winHintRevealed = false;

// The score the save document has a section for (core/save.js). A visit with nothing stored
// starts from no best at all, which is what makes the first run of a new browser a new best.
const SAVED_SCORE = { best: 0 };

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
 */
function onMuteSwitch() {
  const mutedNow = toggleMuted();
  if (!mutedNow) uiTick('unmute');
  showVolumePanel('mute');
}

/**
 * One step of one slider: `[ ]` for the music, `- =` for the sounds (input/keyboard.js, and
 * audio/engine.js for what a step is worth). Until milestone 9 puts a settings page on the glass
 * these keys are the whole interface for it, which is why the press is answered twice over - the
 * level painted on the screen, and the change heard *on the bus it changed*, so the answer is
 * made of the very thing that moved and needs no calibration to read.
 *
 * A slider already at the end of its travel is refused in silence, like every other refused press
 * (BALANCE.ui): the panel does not light for a key that did nothing, because a readout that moves
 * when nothing moved is a readout you stop believing.
 */
function onVolume(which, delta) {
  // Same bargain as every other key that can be the first press of a visit: this is a user
  // gesture, so this is where the audio is allowed to be started.
  initAudio();
  if (nudgeLevel(which, delta) === null) return;
  showVolumePanel(which);
  if (which === 'music') auditionMusic(world, delta > 0);
  else uiTick(delta > 0 ? 'up' : 'down');
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
  // The arena is its own size now, so a resize only tells the simulation how big
  // the window watching it has become - which is all it ever needs to know about
  // the screen: it is how spawning knows what is off the edge of it.
  world.view.w = view.W;
  world.view.h = view.H;
  // ...and the one panel tall enough to run out of window asks whether it still fits - whichever of
  // the two it is (ui/screens.js `fitPanel`).
  if (hangarIsOpen()) fitHangar();
  else if (codexIsOpen()) fitCodex();
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
  lastFps = tick.fps;
  lastAlpha = tick.alpha;
  const stateBefore = world.state;
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
  // A hit-stop step holds the run still and never hears the controls, so a frame
  // made entirely of frozen steps must leave a pending dash waiting for the thaw.
  let heard = false;
  for (let i = 0; i < tick.steps; i++) {
    if (stepWorld(BALANCE.sim.step, input)) heard = true;
  }
  // Only a frame that actually simulated anything has handed the dash request to
  // the game. On a very quick display a frame can run no step at all, and a press
  // that landed on one of those stays pending rather than being swallowed.
  //
  // A run paused for an upgrade choice is the other case: the pause lasts as long as
  // the player takes to read, so a request made during it is spent rather than kept -
  // a dash that goes off three seconds after the key was pressed is not a gift.
  if (heard || world.state === STATE.LEVEL) consumeInput();
  // The awards won since the last frame go on the glass now (render/toast.js). They were queued by
  // the step (game/awards.js `updateAwards`) and spent here, which is the same door the sound cues
  // are: the run says what happened, the frame decides when it is seen - and it is seen on this
  // frame rather than the next one, because an award and the thing that earned it should not be
  // half a second apart for no reason a player can name.
  for (const award of takeAwardToasts(world)) pushAwardToast(award);

  // The game-over card lands on the same frame the run stops: there is nothing left to see.
  if (stateBefore !== world.state && world.state === STATE.OVER) showGameOver(describeRun());
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
  consumeCues(world.state);
  // The music is wound on the same frame the cue queue drains on: what the run looks
  // like right now - how far in it is, whether a boss is standing in it, how much hull the
  // ship has left - is a frame's question, and the simulation never learns music exists at
  // all (audio/music.js).
  updateMusic(world);
  renderFrame(tick, input, mouse);

  requestAnimationFrame(frame);
}

function boot() {
  initScreens();
  initCanvas(document.getElementById('game'));
  onResize();
  // The mixer first, before anything can make a sound or paint a level: the two sliders and the
  // mute come back from wherever the last visit left them (core/save.js).
  const mixer = restoreAudio();
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
    onToggleMute: onMuteSwitch,
    onVolume: onVolume,
  });
  window.addEventListener('resize', onResize);

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
      // Where the two sliders stand and whether the master is shut (audio/engine.js). A headless
      // run cannot hear a bus, so this is the only way to see that a volume key did anything, and
      // the F3 overlay wants the same three numbers.
      musicLevel: musicLevel(),
      effectsLevel: effectsLevel(),
      muted: isMuted(),
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
      fps: lastFps,
      alpha: lastAlpha,
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
