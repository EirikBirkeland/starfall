// The DOM screens: the title, the hangar a run is chosen in, the codex of what has been met and what
// has been flown, the pause a run is held at, the settings of what the game does to your eyes and
// ears, the game-over card and the win card. The level-up choice is not here - it is painted on the
// canvas (render/cards.js), because its cards are drawn, not typed. Everything the run shows while it
// is being played is on the canvas too.
//
// The hangar and the codex are overlays and not states of the world: either is put up over the title
// and over the death's card, the attract crowd keeps flying behind it, and the run it launches is
// launched the same way from either. A sixth STATE would have to be answered by everything that asks
// what the world is doing, to buy a screen that only ever sits on top of two of them. The pause is
// their mirror (game/run.js `pauseRun`): nothing on it can be bought and it has no launch key, and it
// only ever sits over a run that is holding still - which makes it the one panel of the three whose
// subject is the world and not just the glass.
//
// And there is only ever one of them up: two panels of rows over one screen is a screen that has
// stopped being either of them, so the key that names a panel takes the other ones down on its way
// up.

import { SHIPS } from '../game/ships.js';
import { priceOf, shipIsBought, perkPriceOf } from '../game/hangar.js';
import { maxRankOf, PERKS, rankWords } from '../game/perks.js';
import { CARDS, HOSTS, metShare, SYNERGIES } from '../game/codex.js';
import { AWARDS, dustOf, shareOf } from '../game/awards.js';
import { BALANCE } from '../game/balance.js';
import { LINES, lineOf, effectOf, maxRanksOf, isSynergy } from '../game/upgrades.js';
import { endingWords, hullLedger } from '../game/tally.js';
import { cardWords, titleWords } from '../game/daily.js';
import { cardWords as challengeCardWords, titleWords as challengeTitleWords, CHALLENGES, nameOf, saysOf } from '../game/challenges.js';
import { clockWords } from '../core/words.js';
import { wordsOf } from '../core/keymap.js';
import { uiTick } from '../audio/sfx.js';

let el = null;

/** The hangar's rack, in the order it was built, so one row can be lit up. */
let shipRows = [];

// The price line of each row, kept beside the row for the same reason: so painting a purchase is
// `shipPrices[i].textContent = ...` and not `children[3]` (buildShipRow).
let shipPrices = [];

// The perk rack, in the same two shapes: the row, and the lines on it that say what a rank gives and
// what the next one costs (game/perks.js is the table, game/hangar.js the price).
let perkRows = [];
let perkNumbers = [];
let perkPrices = [];

// Whether a panel is up right now, and which one: '' for neither, and the five keys that open them
// are the only things that can write anything else. `hideScreens` clears it with the screens
// themselves, so there is no path where a run is flying and this still says open.
let panelUp = '';

// The five panels, in the one list everything that is true of "a panel" walks: taking them all
// down, and fitting whichever one is up. Built once in `initScreens`, beside the elements themselves.
let panels = [];
// The three screens a panel is raised *over* - the title, the wreck's card and the win's - as opposed
// to the five panels themselves. Built beside `panels` for the same reason (`initScreens` is the only
// place that knows where any of them are), and put to bed by `putScreensToBed`.
let beds = [];
// The codex's three panels, in the same shape the racks are kept in: the rows, and the two parts of
// each row that say what the thing is (`showCodex` owns both of them, because both depend on whether
// it has been met and neither is known when the panel is built).
let hostRows = [];
let cardRows = [];
let synRows = [];

// The codex's fourth rack: the last runs this save has flown (game/history.js). It is kept apart
// from the three above because it is the only list on this panel whose length is the visit's own -
// one row per run flown, so it is built as it is painted (`showLog`) and not at init with the tables
// that never change size.
let logRows = [];

// The codex's fifth rack: what this save has scored under each harder rule (game/challenges.js). It
// is built at init with the tables that never change size, because it has one row per rule the game
// can name and no more - three rows today, and a fourth rule is a row in a table, not a rack.
let ruleRows = [];

// The pause's two racks (game/run.js `pauseRun`): the run's numbers, and the lines it has taken.
// Both of them are as long as the run is, so both are grown and trimmed as they are painted, like the
// log above, and for the same reason - a rack of rows that a run has to be shorter or longer than is
// a rack that leaves a stale row on the glass.
let factRows = [];
let buildRows = [];

// The settings panel's rack (game/settings.js, audio/engine.js): one row per thing that can be set.
// The count never changes inside a visit - it is the two tables the panel is built out of - but it is
// painted from what those owners answer, so the rack grows and trims like the log's rather than being
// assumed.
let settingRows = [];

// The controls panel's rack (core/keymap.js): one row per key a hand can move. Same shape and the
// same reason as the settings above - the table is fixed for a visit, the words on it are not.
let keyRows = [];

// The two ending cards' hull racks (game/tally.js `hullLedger`): what each hull of the run went to,
// one row apiece. Both cards grow and trim theirs the way the log and the pause's racks do, because
// the number of causes a run went through is the run's own and belongs to no table.
let hullRows = [];
let winHullRows = [];

// The hangar's third rack: what this save has been credited with and what it has not (game/awards.js).
// Thirty rows, and every word on them is static but the last column, because an award's rule is the
// table's own sentence and never changes - which is the opposite of a codex row and the same as a
// perk's (`showPerks`).
let awardRows = [];

/**
 * The fights the schedule sent, in the order it sent them (game/bosses.js). The win card names
 * every one of them, and it reads them out of the schedule rather than carrying a list of its
 * own, so the card cannot advertise a fight the game does not actually field.
 */
function scheduleNames() {
  return BALANCE.bosses.schedule
    .map((entry) => BALANCE.bosses[entry.boss].name)
    .join(' \u00b7 ');
}

/**
 * The numbers that are the whole of the difference between one hull and the next
 * (game/ships.js): the pips, the engines, and how long the dash makes you wait. px/s and seconds,
 * which are the units the game itself runs on - the rack's whole job is letting two ships be
 * compared, and "FAST" beside "VERY FAST" cannot be.
 */
function shipNumbers(spec) {
  const parts = [
    spec.hull + ' HULL',
    Math.round(spec.maxSpeed) + ' SPEED',
    (Math.round(spec.dashCooldown * 10) / 10) + 's DASH',
  ];
  // And a ship that arrives with a rank of something already spent says so in the same list,
  // because that is a number of the body like the other three (game/ships.js `applyShip`
  // is what hands it out, and the rack must not advertise a thing a run does not start with).
  for (const line of Object.keys(spec.ranks)) {
    parts.push('BEGINS WITH ' + lineOf(line).name);
  }
  return parts.join('   \u00b7   ');
}

/** One line of the rack: the key, the ship and the gun it brings, what it is for, and its numbers. */
function buildShipRow(ship, index) {
  const row = document.createElement('div');
  row.classList.add('ship');

  const key = document.createElement('span');
  key.classList.add('key');
  key.textContent = String(index + 1);

  const what = document.createElement('span');
  // Both names come off the balance sheet, so the hangar cannot offer a ship under one name
  // and fly it under another (game/ships.js is what prints the ship on the card at the end,
  // and game/weapons.js the gun in play). The gun is named because it comes with the ship:
  // one key, one line, and nothing to cross-check between the two lists.
  const spec = BALANCE.ships[ship.id];
  what.textContent = spec.name + ' \u00b7 ' + BALANCE.weapons[spec.weapon].name
    + ' \u2014 ' + ship.blurb;

  const numbers = document.createElement('span');
  numbers.classList.add('numbers');
  numbers.textContent = shipNumbers(spec);

  // What the purse has to pay for this one, on a line of its own under the numbers. Empty for a
  // ship that is yours, so a bought rack reads exactly like the rack did before there was anything
  // to buy (game/hangar.js).
  const price = document.createElement('span');
  price.classList.add('price');
  shipPrices.push(price);

  row.appendChild(key);
  row.appendChild(what);
  row.appendChild(numbers);
  row.appendChild(price);
  el.shipRow.appendChild(row);
  return row;
}

/** The ship and the gun it brings, in the words every line that names a run about to be flown uses. */
function shipWords(id) {
  const spec = BALANCE.ships[id];
  return spec.name + ' \u00b7 ' + BALANCE.weapons[spec.weapon].name;
}

/**
 * The number key a perk row answers to: the ship keys are used up by the ships (game/ships.js,
 * 1-5 in rack order), so the perk keys count on from the last one and the whole hangar stays the
 * one numbered list game/hangar.js `buyRackByIndex` reads a key as.
 */
function perkKey(index) {
  return SHIPS.length + index + 1;
}

/** One line of the perk rack: the key, what the perk is for, which rank the purse is on and what a
    rank gives, and what the next one costs (painted by `showPerks`). */
function buildPerkRow(perk, index) {
  const row = document.createElement('div');
  row.classList.add('perk');

  const key = document.createElement('span');
  key.classList.add('key');
  key.textContent = String(perkKey(index));

  const what = document.createElement('span');
  what.textContent = perk.name + ' \u2014 ' + perk.blurb;

  const numbers = document.createElement('span');
  numbers.classList.add('numbers');
  perkNumbers.push(numbers);
  // Left empty on purpose. `showPerks` owns both of the second and third lines of a perk row,
  // because both of them are about what the purse has and has not done and neither is known when
  // the rack is built.

  const price = document.createElement('span');
  price.classList.add('price');
  perkPrices.push(price);

  row.appendChild(key);
  row.appendChild(what);
  row.appendChild(numbers);
  row.appendChild(price);
  el.perkRow.appendChild(row);
  return row;
}

/**
 * One row of a list of text: a line made of the named spans, in the order they are painted. The rows
 * are all this shape on every panel, so what tells them apart is which spans a row has and what class
 * it wears - and the words are written by whoever owns the list, because what a row means depends on
 * what the panel is asking (`showCodex`, `showLog`, `showAwards`, `showPause`).
 */
function buildRow(list, cls, parts) {
  const row = document.createElement('div');
  row.classList.add(cls);

  const out = { row: row };
  for (const part of parts) {
    const span = document.createElement('span');
    span.classList.add(part);
    row.appendChild(span);
    out[part] = span;
  }
  list.appendChild(row);
  return out;
}

/**
 * One row of the codex: a name and one line about it, and nothing else - no key and no price, which
 * is the whole difference between a thing a save has met and a thing the hangar is selling. The
 * words are written by whoever owns the list (`showCodex`, `showLog`), because neither is known when
 * the row is built.
 */
function buildEntryRow(list) {
  return buildRow(list, 'entry', ['name', 'says']);
}

/**
 * One row of the hangar's awards rack: the award's own name, the run that earns it in the award's
 * own words (game/awards.js), and a third column the codex's rows do not have - what it still pays,
 * which is empty once it has been paid (`showAwards`).
 */
function buildAwardRow(award) {
  const out = buildRow(el.awardRow, 'award', ['name', 'says', 'pays']);
  out.name.textContent = award.name;
  out.says.textContent = award.says;
  return out;
}

/**
 * One row of the pause screen's readout rack: a label, and the number it is a label for. Nothing
 * about the number is decided here - a run's numbers are the run's own (main.js `describePause`) and
 * this panel's whole job is to say them and nothing else.
 */
function buildFactRow() {
  return buildRow(el.factRow, 'fact', ['name', 'says']);
}

/** One row of the pause screen's build rack: the codex's own `.entry` shape, because a line the run
    has taken is a thing it has met in exactly the same sense. */
function buildBuildRow() {
  return buildEntryRow(el.buildRow);
}

/**
 * One row of an ending's hull rack: what took a hull, and how many it took.
 *
 * The shape is the pause readout's own - a thing, and the number that belongs to it - because it is
 * the same kind of line, and the two cards and the pause should not each invent their own way of
 * putting a fact and its number side by side. Both endings have a rack of these, and each is built
 * against its own list.
 */
function buildHullRow(where) {
  return buildRow(where, 'hull', ['name', 'says']);
}

/**
 * One row of the settings panel: what the row is, what it is set to, and one line on what it does.
 *
 * There is no key chip on a setting row, unlike a ship or a perk row, and that is the point: a chip
 * says "press this" and every row on this panel is changed with the arrow keys after the cursor has
 * been put on it. What a row *is* set to is the bright part, because it is the only part a player is
 * looking for once the panel is up.
 */
function buildSettingRow() {
  return buildRow(el.settingRow, 'setting', ['name', 'value', 'says']);
}

/**
 * One row of the controls panel: the control, the key that answers it, and one line on what it is.
 *
 * It is the setting row's shape - same three spans, same classes, same CSS - because it *is* a setting
 * row, one where the value happens to be a key. What a row is set to is again the bright part, and on
 * this panel it is the only part a press changes.
 */
function buildKeyRow() {
  return buildRow(el.keyRow, 'setting', ['name', 'value', 'says']);
}

/**
 * Every place the page prints a key a hand can move, and the control it prints it for
 * (core/keymap.js). index.html carries these ids and `paintKeyWords` writes them, so a rebound key
 * cannot be stale in one place and fresh in another: the title's list, the line on the pause, the
 * hints on the racks and on the two ending cards all say what the game currently hears.
 *
 * The fixed keys are deliberately not in here - `MOUSE`, the numbers, `F3`, the arrows - because a
 * line about a key that cannot move cannot go stale.
 */
export const KEY_LABELS = [
  ['titleKeysFly', ['up', 'left', 'down', 'right']],
  ['titleKeysDash', 'dash'],
  ['titleKeysPause', 'pause'],
  ['titleKeysGiveUp', 'giveup'],
  ['titleKeysHangar', 'hangar'],
  ['titleKeysCodex', 'codex'],
  ['titleKeysSettings', 'settings'],
  ['titleKeysMute', 'mute'],
  ['titleKeysToday', 'daily'],
  ['titleKeysChallenge', 'challenge'],
  ['hangarKeysBack', 'hangar'],
  ['hangarKeysSettings', 'settings'],
  ['codexKeysBack', 'codex'],
  ['codexKeysSettings', 'settings'],
  ['settingsKeysClose', 'settings'],
  ['keysKeysBack', 'settings'],
  ['pauseKeysGiveUp', 'giveup'],
  ['pauseKeysSettings', 'settings'],
  ['overKeysSettings', 'settings'],
  ['winKeysReroll', 'reroll'],
];

/**
 * Write every key the page prints, from the table that says what the game hears. Called once at boot
 * and after any row has been moved (main.js) - which is the whole of keeping the page honest.
 */
export function paintKeyWords() {
  for (const entry of KEY_LABELS) {
    const node = document.getElementById(entry[0]);
    if (node === null) {
      throw new Error('the page has no ' + entry[0] + ' element to write a key into');
    }
    node.textContent = wordsOf(entry[1]);
  }
}

export function initScreens() {
  el = {
    start: document.getElementById('startScreen'),
    over: document.getElementById('overScreen'),
    win: document.getElementById('winScreen'),
    finalScore: document.getElementById('finalScore'),
    finalBest: document.getElementById('finalBest'),
    newBest: document.getElementById('newBest'),
    stats: document.getElementById('finalStats'),
    build: document.getElementById('finalBuild'),
    winScore: document.getElementById('winScore'),
    winBest: document.getElementById('winBest'),
    winNewBest: document.getElementById('winNewBest'),
    winCleared: document.getElementById('winCleared'),
    winStats: document.getElementById('winStats'),
    winBuild: document.getElementById('winBuild'),
    winHint: document.getElementById('winHint'),
    // Which day the run was flown on, on each of the two cards that end one (game/daily.js).
    finalDaily: document.getElementById('finalDaily'),
    winDaily: document.getElementById('winDaily'),
    shipRow: document.getElementById('shipRow'),
    perkRow: document.getElementById('perkRow'),
    hangar: document.getElementById('hangarScreen'),
    hangarBody: document.getElementById('hangarBody'),
    hangarDust: document.getElementById('hangarDust'),
    codex: document.getElementById('codexScreen'),
    codexBody: document.getElementById('codexBody'),
    codexTally: document.getElementById('codexTally'),
    hostRow: document.getElementById('hostRow'),
    lineRow: document.getElementById('lineRow'),
    synRow: document.getElementById('synRow'),
    logRow: document.getElementById('logRow'),
    // ...and the fifth, what the runs of this save have scored under each harder rule (index.html,
    // game/challenges.js).
    ruleRow: document.getElementById('ruleRow'),
    awardRow: document.getElementById('awardRow'),
    awardTitle: document.getElementById('awardTitle'),
    // The pause: a run held where it stands, and its numbers read off the world (game/run.js).
    pause: document.getElementById('pauseScreen'),
    pauseBody: document.getElementById('pauseBody'),
    pauseHead: document.getElementById('pauseHead'),
    pauseHint: document.getElementById('pauseHint'),
    // The two clauses of the pause's keys line that name a letter, and so are a keyboard's only
    // (index.html, ui/screens.js `showPause`).
    pauseKeysKeys: document.getElementById('pauseKeysKeys'),
    factRow: document.getElementById('factRow'),
    buildRow: document.getElementById('buildRow'),
    // The settings: what this visit asked the game to do to its own picture and sound
    // (game/settings.js, audio/engine.js, PLAN section 6).
    settings: document.getElementById('settingsScreen'),
    settingsBody: document.getElementById('settingsBody'),
    settingsNote: document.getElementById('settingsNote'),
    settingRow: document.getElementById('settingRow'),
    // The controls: the one door off that settings panel, and the rack of keys behind it
    // (core/keymap.js, PLAN section 6).
    keys: document.getElementById('keysScreen'),
    keysBody: document.getElementById('keysBody'),
    keysNote: document.getElementById('keysNote'),
    keysHint: document.getElementById('keysHint'),
    keyRow: document.getElementById('keyRow'),
    titleBest: document.getElementById('titleBest'),
    titleDust: document.getElementById('titleDust'),
    titleToday: document.getElementById('titleToday'),
    titleShip: document.getElementById('titleShip'),
    // Which harder rule the next run stands under (game/challenges.js). Empty - and so gone - the way
    // the day's line is, because a title with no challenge on it is the title it always was.
    titleChallenge: document.getElementById('titleChallenge'),
    finalChallenge: document.getElementById('finalChallenge'),
    winChallenge: document.getElementById('winChallenge'),
    nextShip: document.getElementById('nextShip'),
    finalDust: document.getElementById('finalDust'),
    winDust: document.getElementById('winDust'),
    // What ended the run, and what every hull of it went to (game/tally.js `causeWords`).
    finalCause: document.getElementById('finalCause'),
    finalHulls: document.getElementById('finalHulls'),
    winHulls: document.getElementById('winHulls'),
    finalAwards: document.getElementById('finalAwards'),
    winAwards: document.getElementById('winAwards'),
    titleAwards: document.getElementById('titleAwards'),
  };
  shipPrices = [];
  shipRows = SHIPS.map(buildShipRow);
  perkNumbers = [];
  perkPrices = [];
  perkRows = PERKS.map(buildPerkRow);
  hostRows = HOSTS.map(() => buildEntryRow(el.hostRow));
  cardRows = CARDS.map(() => buildEntryRow(el.lineRow));
  synRows = SYNERGIES.map(() => buildEntryRow(el.synRow));
  ruleRows = CHALLENGES.map(() => buildEntryRow(el.ruleRow));
  awardRows = AWARDS.map(buildAwardRow);
  // The five panels, in the one list everything that is true of "a panel" walks: taking them all
  // down, and fitting whichever one is up. Built here, beside the elements themselves, because
  // `initScreens` is the first thing the boot does.
  panels = [
    { which: 'hangar', screen: el.hangar, body: el.hangarBody },
    { which: 'codex', screen: el.codex, body: el.codexBody },
    { which: 'pause', screen: el.pause, body: el.pauseBody },
    { which: 'settings', screen: el.settings, body: el.settingsBody },
    { which: 'keys', screen: el.keys, body: el.keysBody },
  ];
  beds = [el.start, el.over, el.win];
  keyRows = [];
  // Every key the page prints, written from the table (see `paintKeyWords`). The page ships the
  // shipped words so that a page read without any JavaScript at all still reads like the game, and
  // this is the moment the visit's own bindings take over.
  paintKeyWords();
}

/** Is the hangar up right now? main.js routes the number keys and the launch around the answer. */
export function hangarIsOpen() {
  return panelUp === 'hangar';
}

/** Is the codex up? It answers the same questions main.js asks the hangar about: a click on a panel
    is not a launch, and a panel is a place a key can be answered in. */
export function codexIsOpen() {
  return panelUp === 'codex';
}

/** Is the pause up? It is the one panel that is a fact about the world and not about the glass, and
    main.js asks it before answering the key that gives a run up: nothing ends a run off a screen
    that does not offer it (game/run.js `abandonRun`). */
export function pauseIsUp() {
  return panelUp === 'pause';
}

/** Is any of them up? This is the question the launch actually cares about. */
export function panelIsUp() {
  return panelUp !== '';
}

/**
 * Every screen the game can put up, taken down for a run to be seen. The panels go with them: they
 * are screens like the rest, and a run that is flying has no business being half over a panel.
 */
export function hideScreens() {
  el.start.classList.add('hidden');
  el.over.classList.add('hidden');
  el.win.classList.add('hidden');
  closePanels();
}

/**
 * Put the screens underneath to bed, or let them up again.
 *
 * A panel is a rack of small type, and the page it goes up over is a page of large one, and the panel's
 * own dim does not keep the two apart: with the hangar up you could still read the title's key line and
 * the wreck's big score straight through the racks you were trying to read, which looks like a broken
 * picture and not like a hint. So while a panel is up the page under it goes down to a tenth of what it
 * was (index.html's `.aside`, on `opacity` rather than on `.hidden` so it travels on the quarter-second
 * the page already fades over instead of blinking).
 *
 * A tenth is a hint and not a secret: the menu is still there, faintly, so the hangar stays a window
 * onto the arena rather than a card pasted on black. The arena itself is not part of this - it is the
 * canvas, and it keeps drifting behind every panel exactly as it does behind the pause.
 */
function putScreensToBed(down) {
  for (const screen of beds) screen.classList.toggle('aside', down);
}

/**
 * Put one panel up over whatever screen is already there, taking the other ones down first, and fit
 * it to the window on the way.
 *
 * Only one of them is ever up. Every one of them is a column of rows over a screen that is trying to
 * be read, and two of them at once is not two screens you can read but one screen you cannot - and
 * none of the four keys has anything to say about the other three, so the rule has to be the panel's
 * and not the key's.
 */
function raisePanel(which, screen, body) {
  layPanelsDown();
  putScreensToBed(true);
  screen.classList.remove('hidden');
  panelUp = which;
  fitPanel(body, screen);
}

/** Every panel, up or not, taken down. See `layPanelDown` for what that costs a panel. */
function layPanelsDown() {
  for (const panel of panels) layPanelDown(panel.screen, panel.body);
}

/**
 * Take one panel down: off the glass, and with the transform it was fitted with forgotten.
 *
 * The transform is part of what the panel *is doing*, not a mark of what it once needed: a hidden
 * panel keeping a stale scale is a panel that comes back for a frame at the wrong size if anything
 * ever repaints it before it is measured again - and a screen a test can read is a screen whose
 * numbers all mean the same thing whether it is up or not.
 */
function layPanelDown(screen, body) {
  screen.classList.add('hidden');
  if (body !== null) body.style.transform = '';
}

/** Put the hangar up over whatever screen is already there, and fit it to the window on the way. */
export function openHangar() {
  raisePanel('hangar', el.hangar, el.hangarBody);
}

/** ...and the codex, which is a panel of its own for its own reason (game/codex.js: rows nobody
    sells). A plain number key still means the ship it means everywhere else, panel up or not. */
export function openCodex() {
  raisePanel('codex', el.codex, el.codexBody);
}

/** ...and the pause, which sits over a run that is holding still and over nothing else (game/run.js
    `pauseRun`). Whoever raises it has already stopped the run and painted what it has to say. */
export function openPause() {
  raisePanel('pause', el.pause, el.pauseBody);
}

/**
 * Is the settings panel up?
 *
 * It is the one panel that *changes* things rather than reading them, which is why the launch key and
 * the ship numbers stand aside while it is on the glass (main.js): a press that tunes the music is not
 * also a press that starts a run.
 */
export function settingsIsUp() {
  return panelUp === 'settings';
}

/** ...and the settings, over the title, over the death's card, or over a run that is being held. */
export function openSettings() {
  raisePanel('settings', el.settings, el.settingsBody);
}

/**
 * Is the controls panel up? It is a settings panel in every way that matters - a rack of rows, an
 * arrow cursor, nothing on it that can move a run - and it is only ever reached from the settings
 * panel itself, which is why the launch key and the ship numbers stand aside for it exactly as they
 * do for its parent (main.js).
 */
export function keysIsUp() {
  return panelUp === 'keys';
}

/** ...and the rack of keys behind the door the settings panel has for it. */
export function openKeys() {
  raisePanel('keys', el.keys, el.keysBody);
}

/**
 * The most a rack can be shrunk and still be words rather than texture (see `scaleToFit`).
 */
const RACK_MIN = 0.6;

/**
 * How far a block has to be shrunk to fit the box it was given: 1 when it fits, and 1 when either
 * measure is nothing at all.
 *
 * The nothing case is the one that would bite. A page that has not been laid out answers 0 for a
 * box, and 0 over 0 is a `NaN` in a transform, which is how an entire screen of text vanishes.
 * The floor is honesty too: a window half the size the racks need is not a window they should be
 * shrunk into, because type that small is not readable and a clipped panel still is.
 */
export function scaleToFit(need, have) {
  if (!(need.w > 0) || !(need.h > 0) || !(have.w > 0) || !(have.h > 0)) return 1;
  const scale = Math.min(have.w / need.w, have.h / need.h, 1);
  return scale < RACK_MIN ? RACK_MIN : scale;
}

/**
 * Fit the hangar's racks to the window (see `fitPanel`).
 *
 * Five ships and four perks are nine rows of three lines each, which is a taller column than a
 * short window has - and every screen here is click-through and none of it scrolls, so a rack that
 * does not fit is a rack whose last rows, and whose prices, nobody will ever see. The two racks go
 * side by side when there is room and one over the other when there is not (index.html `.racks`);
 * this is what is left over after that, and it scales the lot as one picture, so the type keeps its
 * size *relative to itself* and the panel stays centred in the glass it is painted on.
 */
export function fitHangar() {
  fitPanel(el.hangarBody, el.hangar);
}

/**
 * Fit whichever panel is up to the window (see `fitPanel`).
 *
 * This is what the resize asks, rather than a branch per panel: a window that changes size can only
 * change the fit of the one panel that is on the glass, and the third of them was always going to be
 * forgotten by the second branch.
 */
export function fitOpenPanel() {
  const open = panels.find((panel) => panel.which === panelUp);
  if (open !== undefined) fitPanel(open.body, open.screen);
}

/**
 * Fit one panel to the window, by shrinking the whole of it and not one part of it.
 *
 * Called when the panel goes up, when the rows are repainted, and when the window changes size:
 * `offsetHeight` is a layout question, and those three are the moments the answer can change.
 */
function fitPanel(body, screen) {
  if (body === null || screen === null) return;
  const scale = scaleToFit(
    { w: body.offsetWidth, h: body.offsetHeight },
    { w: screen.clientWidth, h: screen.clientHeight });
  // No transform at all when it fits, so the common case costs nothing and leaves nothing to undo.
  body.style.transform = scale === 1 ? '' : 'scale(' + scale.toFixed(3) + ')';
}

/** Take every panel away again, leaving the screen underneath exactly as it was. */
export function closePanels() {
  layPanelsDown();
  putScreensToBed(false);
  panelUp = '';
}

/**
 * Light the rack, and say on both screens that let you choose which ship the next run flies.
 * The title says FLYING, because the pick is about the run about to be launched; the death's card
 * says NEXT, because the ship it is describing has already been flown and the pick is about the
 * one after it. Without that second line a number pressed over a wreck would be a silent key -
 * and "press 2, press Space, fly the scatter" is how this has always been done.
 */
export function showShip(id) {
  for (let i = 0; i < shipRows.length; i++) {
    shipRows[i].classList.toggle('picked', SHIPS[i].id === id);
  }
  el.titleShip.textContent = 'FLYING  ' + shipWords(id);
  el.nextShip.textContent = 'NEXT  ' + shipWords(id) + '   \u00b7   H FOR THE HANGAR';
}

/**
 * Paint which harder rule the next run stands under, on the title's own column (game/challenges.js).
 *
 * Written at boot and again on every press of the key that cycles the choice - the only two things in
 * the game that can change the answer - so the line cannot be stale in the one place a player looks
 * for it before launching. Empty means no rule, and an empty line takes its space with it: a title
 * with nothing on it is the title it always was.
 */
export function showChallenge(world) {
  el.titleChallenge.textContent = challengeTitleWords(world);
}

/**
 * Paint which rows the purse has bought and which it has not (game/hangar.js). Called once when
 * the visit opens and again after every purchase - a row that stayed dim after being paid for
 * would be the shop taking the money and not handing over the ship.
 *
 * A locked row keeps every word it had: the numbers are the whole reason a player would want the
 * ship, and a shop that hides what it sells until it has been sold is not a shop. It is dimmed,
 * and it says what it costs and which key buys it, on a line of its own.
 */
export function showRack(owned) {
  for (let i = 0; i < shipRows.length; i++) {
    const id = SHIPS[i].id;
    const cost = priceOf(id);
    const bought = shipIsBought(owned, id);
    shipRows[i].classList.toggle('locked', !bought);
    shipPrices[i].textContent = bought
      ? ''
      : cost.toLocaleString('en-US') + ' STARDUST   \u00b7   SHIFT + ' + (i + 1) + ' BUYS IT';
  }
}

/**
 * Paint the ranks the purse has bought and the price of the next one (game/hangar.js). Called once
 * when the visit opens and again after every rank is bought, for the same reason the ship rack is:
 * a row that still says "buy me" after being paid for is the shop taking the money twice.
 *
 * `ranks` is the ledger as game/perks.js prints it - one key per perk, no count above the row's own
 * ladder - so a row always knows both what it holds and how far it goes, and a rank some newer page
 * bought past this build's ladder reads as the top of this build's ladder rather than as `6 OF 5`.
 *
 * A row at the top of its ladder keeps every word it had and loses only its price line, which is the
 * same bargain a bought ship row strikes: nothing is hidden about a thing that has been paid for.
 */
export function showPerks(ranks) {
  for (let i = 0; i < perkRows.length; i++) {
    const id = PERKS[i].id;
    const held = ranks[id] === undefined ? 0 : ranks[id];
    const max = maxRankOf(id);
    const maxed = held >= max;
    perkRows[i].classList.toggle('maxed', maxed);
    perkNumbers[i].textContent =
      'RANK ' + held + ' OF ' + max + '   \u00b7   ' + rankWords(id);
    perkPrices[i].textContent = maxed
      ? ''
      : perkPriceOf(id, held).toLocaleString('en-US') + ' STARDUST   \u00b7   SHIFT + '
        + perkKey(i) + ' BUYS RANK ' + (held + 1);
  }
}

/**
 * Paint what the save has met (game/codex.js). Called once when the visit opens and again whenever a
 * run has ended and added to it - a panel that still says UNKNOWN about a thing the run just met
 * would be the codex not having read its own notes.
 *
 * A row that has not been met keeps its place in the list and loses both of its words: how many are
 * missing, and where the missing ones sit, is the whole of what an undiscovered thing may be allowed
 * to say about itself. The refused line names the panel's own verb, because "not taken yet" about a
 * card and "not met yet" about a body are two different things a player has not done.
 */
export function showCodex(found) {
  paintEntries(hostRows, HOSTS, found.hosts, 'NOT MET YET');
  paintEntries(cardRows, CARDS, found.lines, 'NOT TAKEN YET');
  paintEntries(synRows, SYNERGIES, found.lines, 'NOT FOUND YET');
  const share = metShare(found);
  el.codexTally.textContent = 'MET ' + share.met + ' OF ' + share.of;
}

function paintEntries(rows, entries, met, refused) {
  for (let i = 0; i < rows.length; i++) {
    const entry = entries[i];
    const known = met.indexOf(entry.key) >= 0;
    rows[i].row.classList.toggle('unknown', !known);
    rows[i].name.textContent = known ? entry.name : 'UNKNOWN';
    rows[i].says.textContent = known ? entry.says : refused;
  }
}

/** The word a log row says about a run that finished the schedule (game/run.js `winRun`). It is the
    same word the win's own card opens with, because it is the same fact. */
const LOG_CLEARED = 'CLEARED';

/** The join between the facts on a log row's second line - the same three-space dot every rack uses. */
const LOG_DOT = '   \u00b7   ';

/**
 * The ship a log row names (game/ships.js). A save written by a newer build can name a ship this
 * build has never met - the store keeps any well-formed name and it is not wrong to (core/save.js)
 * - so an id this build does not know is named by its own text rather than throwing the panel away.
 */
function logShip(id) {
  const spec = BALANCE.ships[id];
  return spec === undefined ? String(id).toUpperCase() : spec.name;
}

/**
 * The rule a log row says its run was flown under, joined to the line with the same dot as every
 * other fact on it - and '' for a run that was not flown under one, which is every run ever flown
 * before rules existed as well as every plain one since (game/challenges.js, `KINDS.optional` in
 * core/save.js). Saying nothing *is* the sentence: a row that had to name the absence would have to
 * name it for rows that predate the field, and the rack would be lying about them.
 *
 * A rule id this build has never heard of is named by its own text, the same way an unknown ship is,
 * so a log written by a newer page still says what it says.
 */
function logRule(id) {
  if (id === undefined) return '';
  const name = nameOf(id);
  return LOG_DOT + (name === '' ? String(id).toUpperCase() : name);
}

/**
 * What one run's row says (game/history.js): which seed it was flown on - which is how a run gets
 * asked for again, `?seed=` in the address bar - and then the facts about the flying of it: the body
 * it was flown in, how long it lasted, what it scored, the rule it was flown under if it had one,
 * and whether it cleared the schedule.
 *
 * The rule goes next to the score and not after the win, because it is the score's units: a 90,000
 * flown under ONE HULL is not the same number as a 90,000 flown plain (game/challenges.js).
 */
function logLine(run) {
  return {
    name: 'SEED ' + run.seed,
    says: logShip(run.ship) + LOG_DOT + clockWords(run.seconds)
      + LOG_DOT + run.score.toLocaleString('en-US')
      + logRule(run.rule)
      + (run.won ? LOG_DOT + LOG_CLEARED : ''),
  };
}

/** What the rack says before there is a run to name (game/history.js). */
function emptyLogLine() {
  return {
    name: 'NO RUNS YET',
    says: 'THE LAST ' + BALANCE.history.keep + ' ARE KEPT HERE',
  };
}

/**
 * Grow or trim a rack until it holds one row per line, and paint every one of them.
 *
 * Three racks have a length that belongs to a visit or a run rather than to a table that never
 * changes size - the log, and the pause's two - so their rows are built as they are painted and taken
 * back again when the list gets shorter. The trimming is defensive for the log, which only ever grows
 * today, and load-bearing for a build rack, which is as long as the run's build is and so really does
 * shrink: every new run starts with nothing taken.
 *
 * `dimClass`, when a rack has one, is the class a row wears when its line says `dim` - which is how the
 * codex's UNKNOWN rows and a build's refused rows are said without inventing a second row shape.
 */
function paintRows(rows, list, lines, build, dimClass) {
  while (rows.length > lines.length) list.removeChild(rows.pop().row);
  while (rows.length < lines.length) rows.push(build());
  for (let i = 0; i < lines.length; i++) {
    rows[i].name.textContent = lines[i].name;
    rows[i].says.textContent = lines[i].says;
    if (dimClass !== undefined) rows[i].row.classList.toggle(dimClass, lines[i].dim === true);
  }
}

/**
 * Paint the last runs this save has flown (game/history.js), newest first.
 *
 * One row per run, and as many rows as there have been runs: this is the one list on the panel whose
 * length belongs to the visit, so its rows are built here and taken back here rather than at init
 * beside the three tables that never change size. A first visit gets one row saying what will fill
 * it, because an empty column under a heading reads as a panel that broke.
 *
 * Called once when the visit opens and again at every ending, beside `showCodex` - a log that has not
 * noticed the run that just stopped would be the panel being one run behind its own card.
 */
export function showLog(runs) {
  const lines = runs.length === 0 ? [emptyLogLine()] : runs.map(logLine);
  paintRows(logRows, el.logRow, lines, () => buildEntryRow(el.logRow));
}

/**
 * Paint the codex's fifth rack: what this save has scored under each harder rule (game/challenges.js).
 *
 * One row per rule the game can name, in the order the key cycles them, so the rack is the same ladder
 * the title's line is: the mildest rule at the top and the sharpest at the bottom. A rule this save has
 * never been flown under keeps its name and gives up its glow, the way a codex row for a thing not met
 * does - it is a row about a thing that has not happened yet, and the lit rows are the ones that are.
 *
 * The sentence about what the rule does is on every row, flown or not, because this is the one place a
 * player can read every rule at once instead of cycling them blind, and a rack of numbers with no
 * units is exactly the thing this feature exists to stop.
 *
 * `bests` is the save's own ledger (game/challenges.js `bestsFromSave`), and it may name a rule this
 * build has never heard of; those are simply not on the rack, which is the same answer the awards' rack
 * gives an award it has no row for.
 */
export function showRules(bests) {
  for (let i = 0; i < ruleRows.length; i++) {
    const challenge = CHALLENGES[i];
    const best = bests[challenge.id] === undefined ? 0 : bests[challenge.id];
    ruleRows[i].row.classList.toggle('unknown', best === 0);
    ruleRows[i].name.textContent = challenge.name;
    ruleRows[i].says.textContent = (best > 0
      ? best.toLocaleString('en-US')
      : 'NOT FLOWN YET') + '   \u00b7   ' + saysOf(challenge.id);
  }
}

/**
 * Paint what this save has been credited with (game/awards.js), on the hangar's third rack.
 *
 * A row that is won keeps its name and its sentence and loses its number: an award is paid once, and
 * a column of gold numbers under an award the purse already collected would be the shop advertising
 * money that is not there any more. A row that is not won is dim and says what it still pays, which
 * is the whole reason the rack stands beside the purse - this is where the purse comes from, and
 * nobody has to die for it to find out.
 *
 * The name and the sentence are not touched here: they are the table's own words, painted once at
 * init, so the rack cannot paraphrase an award and cannot disagree with the plate that announced it
 * mid-run (render/toast.js) or the card that named it (see `showAwardLine`).
 *
 * `won` is the save's own list of ids (game/awards.js `wonFromSave`), and it may name awards this
 * build has never heard of; those are counted out of the total rather than invented a row. Called
 * once when the visit opens and again at every ending, beside `showCodex` and `showLog`, so the rack
 * can never be one award behind the card that just said what the run won.
 */
export function showAwards(won) {
  for (let i = 0; i < awardRows.length; i++) {
    const earned = won.indexOf(AWARDS[i].id) >= 0;
    awardRows[i].row.classList.toggle('unwon', !earned);
    awardRows[i].pays.textContent = earned ? '' : 'PAYS ' + dustOf(AWARDS[i].id);
  }
  const share = shareOf(won);
  el.awardTitle.textContent = 'AWARDS ' + share.won + ' OF ' + share.of;
}

/**
 * The run's numbers, in the order the pause prints them (main.js `describePause`).
 *
 * What the HUD cannot show is what belongs here: the kill and shard counts, the wave the crowd is
 * coming out of, what the run is worth into the purse, the seed it could be asked back for. Score and
 * clock are not among them - they are the panel's headline, above these two racks - and the level's XP
 * bar is not either, because that is the one thing about the run the bottom of the screen already
 * says.
 *
 * `FLOWN IN` names the body *and* the gun that came with it, the same way the title and the cards name
 * them, because a run is flown in a body and a gun and there is no sense in splitting the two.
 */
function factLines(run) {
  const rows = [
    { name: 'FLOWN IN', says: shipWords(run.shipId) },
    { name: 'LEVEL', says: String(run.level) },
    { name: 'HULL', says: run.hull + ' OF ' + run.maxHull },
    { name: 'KILLS', says: run.kills.toLocaleString('en-US') },
    { name: 'SHARDS', says: run.shards.toLocaleString('en-US') },
    { name: 'WAVES', says: String(run.wave) },
    { name: 'FIGHTS', says: run.bosses > 0 ? bossWords(run.bosses) : 'NONE' },
    // What the run would be worth if it stopped this second, and it may stop this second - the key
    // under this panel's own name ends it (game/stardust.js `dustForRun` reads what has been earned
    // and not what has been paid, which is the whole reason this row can be honest mid-run).
    { name: 'RUN WORTH', says: '+' + run.dust.toLocaleString('en-US') + ' STARDUST' },
    { name: 'BEST', says: run.best.toLocaleString('en-US') },
    // Last of the numbers, because it is the one on this panel a player can do something with
    // afterwards: `?seed=` in the address bar flies this arena again (main.js `addressSeed`).
    { name: 'SEED', says: String(run.seed) },
  ];
  // A run flown on today's arena says which day, beside the seed that made it (game/daily.js). A run
  // flown on an arena of its own has no row here at all, which is how the rack stayed the rack it was.
  if (run.daily !== null && run.daily !== undefined) rows.push(run.daily);
  // ...and the same promise about the rule it was flown under (game/challenges.js): the row is there
  // or the rack never mentions a rule that was not in play.
  if (run.challenge !== null && run.challenge !== undefined) rows.push(run.challenge);
  return rows;
}

/**
 * The build, in the order the cards are dealt from (game/upgrades.js), which is the order the rail at
 * the bottom-left of the screen draws it in - so the panel and the rail cannot disagree about which
 * lines a run is made of, because they walk the same table.
 *
 * A row quotes the card: the rank the run holds, and `effectOf`, the card's own words for what a rank
 * is worth. Those two together are the whole of what the run has, and paraphrasing them here would be
 * a second description of every line, free to drift from the rule that actually decides it. A synergy
 * has one rank and no depth to count, so it says its one sentence and no number, exactly as the card
 * and the death's summary already do.
 *
 * The lines the run *refused* come after the ones it took, dim, with the codex's own `unknown` look:
 * a road not taken is part of what the run became (the card says so too) and it is nowhere else in the
 * game while a run is flying. A line can appear twice - taken, and then cut out of the deck later -
 * and that is the truth about a run that wanted a line and then did not want any more of it.
 */
function buildLines(ranks, cut) {
  const lines = [];
  for (const line of LINES) {
    const rank = ranks[line.id] === undefined ? 0 : ranks[line.id];
    if (rank <= 0) continue;
    lines.push({
      name: line.name,
      says: isSynergy(line.id)
        ? effectOf(line.id)
        : 'RANK ' + rank + ' OF ' + maxRanksOf(line.id) + '   \u00b7   ' + effectOf(line.id),
    });
  }
  for (const id of cut) {
    lines.push({ name: lineOf(id).name, says: 'CUT OUT OF THE RUN', dim: true });
  }
  if (lines.length === 0) {
    lines.push({ name: 'NOTHING YET', says: 'THE FIRST CARD COMES WITH THE FIRST LEVEL', dim: true });
  }
  return lines;
}

/**
 * Paint the pause screen over a run that is holding still (game/run.js `pauseRun`).
 *
 * Called as the panel goes up and never again while it is up: nothing on it can change while the world
 * is not being stepped, which is the same reason the hangar is repainted on a purchase and not on a
 * frame. `run` is main.js's `describePause` - the run's own numbers read mid-flight, from the same
 * world the card will read them from once the run has stopped.
 *
 * Two racks and no keys on either of them, because there is nothing here to answer with a number: the
 * run's own keys are all still live under the panel, and a pause that quietly re-pointed `1` at
 * something on its own panel would be the one key in the game that means two things.
 *
 * This only paints; whoever calls it raises the panel after (`openPause`), which is the same order the
 * other two panels are painted and raised in - and the order matters, because raising is what measures
 * the rows this has just written.
 */
/**
 * Paint the pause rack.
 *
 * `onGlass` says whether this visit steers with a thumb (input/touch.js). It changes exactly one
 * line: how the run is let go of again. A keyboard has Esc and P, and a thumb has neither - which is
 * why main.js lets a tap back into a run that a click is refused (its own comment there says what a
 * click would have fired) - and a panel that names a key the visitor does not own is a panel that has
 * stopped being any use.
 */
export function showPause(run, onGlass) {
  el.pauseHint.textContent = onGlass
    ? 'TAP TO GO BACK TO THE RUN'
    : 'ESC OR ' + wordsOf('pause') + ' TO GO BACK TO THE RUN';
  // ...and the line under it says what else this screen can be asked to do, which for a visit with no
  // keyboard is nothing: a run cannot be given up and the settings cannot be opened from a thumb, so
  // naming the two keys that do them would name letters this hand does not have. The third clause of
  // that line - where the hangar and the codex are - is true of every hand and stays.
  el.pauseKeysKeys.classList.toggle('gone', onGlass === true);
  el.pauseHead.textContent = 'SCORE '
    + run.score.toLocaleString('en-US') + '   \u00b7   ' + clockWords(run.seconds);
  paintRows(factRows, el.factRow, factLines(run), buildFactRow);
  paintRows(buildRows, el.buildRow, buildLines(run.ranks, run.cut), buildBuildRow, 'unknown');
}

/**
 * Paint the settings panel: every thing that can be set, what it is set to now, and which row the
 * cursor is on (game/settings.js, audio/engine.js, game/assists.js, PLAN section 6).
 *
 * Every word on it is answered by whoever owns the thing it names - the four picture rows out of their
 * own table, the three sound rows out of the mixer, and the two switches out of the short table they
 * share - and main.js composes those lists into this one, so the panel cannot offer a step the game has
 * not implemented, a slider the mixer does not have, or a switch nobody built. There are no key chips
 * on these rows for the same reason: nothing here is answered by a number, because a number already
 * means the ship it means everywhere else.
 *
 * Unlike the other three panels this one is repainted *while it is up*, because a row that was just
 * changed is a row that has to say its new value on the same press. `fitSettings` is what re-measures
 * it afterwards, since a value is a word and words are not all the same width.
 */
export function showSettings(panel) {
  el.settingsNote.textContent = panel.note;
  while (settingRows.length > panel.rows.length) el.settingRow.removeChild(settingRows.pop().row);
  while (settingRows.length < panel.rows.length) settingRows.push(buildSettingRow());
  for (let i = 0; i < panel.rows.length; i++) {
    const row = settingRows[i];
    const line = panel.rows[i];
    row.name.textContent = line.name;
    row.value.textContent = line.value;
    row.says.textContent = line.says;
    row.row.classList.toggle('chosen', line.chosen === true);
  }
}

/**
 * Paint the controls panel: the note, the hint under it, and one row per control a hand can move
 * (core/keymap.js `ACTIONS`, which main.js hands over in its own words).
 *
 * It is `showSettings` with the parts turned around: there, the value is what a press changes and the
 * line under it is fixed; here, the name and the line under it are the table's and the value is what
 * the player has moved. The one extra thing a row can be is `waiting` - this row is the one a hand is
 * being asked for a key on (main.js `startListening`) - and it keeps its cursor with it, because the
 * amber is the cursor's other state and not a second light somewhere else on the rack.
 */
export function showKeys(panel) {
  el.keysNote.textContent = panel.note;
  el.keysHint.textContent = panel.hint;
  while (keyRows.length > panel.rows.length) el.keyRow.removeChild(keyRows.pop().row);
  while (keyRows.length < panel.rows.length) keyRows.push(buildKeyRow());
  for (let i = 0; i < panel.rows.length; i++) {
    const row = keyRows[i];
    const line = panel.rows[i];
    row.name.textContent = line.name;
    row.value.textContent = line.value;
    row.says.textContent = line.says;
    row.row.classList.toggle('chosen', line.chosen === true);
    row.row.classList.toggle('waiting', line.waiting === true);
  }
}

/** Fit the settings panel to the window (see `fitPanel`). */
export function fitSettings() {
  fitPanel(el.settingsBody, el.settings);
}

/** ...and the controls panel, which wears the settings panel's CSS and so needs the same fitting. */
export function fitKeys() {
  fitPanel(el.keysBody, el.keys);
}

/** What the visit has to show for itself, in both places it is read: the best score, the purse, and
 * how much of the awards table this save has cleared. The three are written together because they
 * are the same kind of thing - the number you are trying to beat, the number you are saving up,
 * and the number you are working towards - and because a reward nobody can see being earned is a
 * reward nobody believes in. `awards` is `{ won, of }` from game/awards.js.
 *
 * The fourth of them is today's own best (game/daily.js), and it is empty - and so invisible - until
 * the day has been flown: a title that showed a zero for a day nobody has tried would be a line about
 * nothing, and it is the third number on a line that has to stay one line tall.
 */
export function showStanding(best, dust, awards) {
  el.titleBest.textContent = best.toLocaleString('en-US');
  el.titleDust.textContent = dust.toLocaleString('en-US');
  // The separator belongs to the line and not to the day: no number, no dot. The other two numbers are
  // kept apart in the markup, and this one cannot be, because it is the one that is sometimes not there.
  const today = titleWords();
  el.titleToday.textContent = today === '' ? '' : ' \u00b7 ' + today;
  el.titleAwards.textContent = 'AWARDS ' + awards.won + ' OF ' + awards.of;
  el.hangarDust.textContent = dust.toLocaleString('en-US');
}

/** How many of an ending's awards are named on its card before the count takes over. */
const NAMED_AWARDS = 3;

/**
 * What a run won that the save had not won before, in the words both cards use (game/awards.js).
 *
 * A run that won nothing says nothing: the plate said what there was to say while the run was
 * flying, and an empty line about awards on every card is noise. An ending that won a handful - a
 * first run, or a first win, which is most of them at once - names the first three and counts the
 * rest: the card is a summary of a run and not the catalogue, and the awards a run won in its last
 * two minutes are the ones a player remembers best anyway.
 */
function awardWords(names, dust) {
  if (names.length === 0) return '';
  const named = names.slice(0, NAMED_AWARDS).join('   \u00b7   ');
  const more = names.length - NAMED_AWARDS;
  return 'AWARDS   ' + named
    + (more > 0 ? '   \u00b7   ' + more + ' MORE' : '')
    + '   \u00b7   +' + dust.toLocaleString('en-US') + ' STARDUST';
}

/**
 * What a finished run paid: what it earned, and what the purse holds now. `earned` is the run's
 * whole worth and not what this ending added (game/stardust.js), so a run that was won, handed
 * back and then finally went down reads the bigger number twice - which is the truth about the
 * run, and not the win being counted twice.
 */
function showDust(where, earned, banked) {
  where.textContent = 'STARDUST  +' + earned.toLocaleString('en-US')
    + '   \u00b7   ' + banked.toLocaleString('en-US') + ' BANKED';
}

/**
 * What a run won on top of its stardust, on the line under it. Empty for a run that won nothing the
 * save had not won already, and an empty line takes its space with it (index.html `.award-line`), so
 * a card with no awards reads exactly as it did before there were awards.
 */
function showAwardLine(where, names, dust) {
  where.textContent = awardWords(names, dust);
}

/**
 * A count and the thing counted, in the one number and noun the cards say it with: `1 KILL`,
 * `7 KILLS`, `0 SHARDS`. A card reads out a run's numbers in a single line, and `1 KILLS` is the
 * mistake a joined-up sentence makes when it never looked at the number it was given.
 */
function countWords(count, one, many) {
  return count + ' ' + (count === 1 ? one : many);
}

/**
 * One fight buried or several, in the words both cards use. A boss is the one kill worth its own
 * word on a card: it is the mark a run is built around (PLAN 3.4).
 */
function bossWords(count) {
  return countWords(count, 'BOSS', 'BOSSES');
}

/**
 * What a run taught the codex, in the words both cards use (game/codex.js). A run that taught it
 * nothing says nothing at all: the panel is where the codex is read, and a line about it on every
 * card would be noise about a thing that did not happen.
 */
function codexWords(count) {
  return count > 0 ? '   \u00b7   ' + count + ' NEW IN THE CODEX' : '';
}

/**
 * summary: { score, best, newBest, level, kills, shards, bosses, seconds, seed, ship, shipId,
 * weapon, cause, hulls, build, endlessPast, dust, dustBank, codexNew, codexFound, awards, awardDust,
 * awardsWon, awardsOwned, pastRuns }
 * - `endlessPast` being how much of the run was flown after it had already been won, 0 for every run
 * that never got that far, `cause` and `hulls` being what took the last hull and what every hull of
 * the run went to (both from the run's own tally, and both empty for a run that was given up),
 * `dust` / `dustBank` being what the run earned between runs and what the purse holds after it
 * (game/stardust.js), `codexNew` / `codexFound` being what the run added to the
 * codex and what it holds afterwards (game/codex.js), `awards` / `awardDust` / `awardsWon` being
 * what this run won, what it paid, and where the whole table stands now, `awardsOwned` being those
 * ids themselves - what the save has, which the hangar's rack is painted from (game/awards.js) - and
 * `pastRuns` being the log, with this run written into it (game/history.js).
 */
export function showGameOver(summary) {
  el.finalScore.textContent = summary.score.toLocaleString('en-US');
  el.finalBest.textContent = summary.best.toLocaleString('en-US');
  el.stats.textContent = 'LEVEL ' + summary.level
    + '   \u00b7   ' + countWords(summary.kills, 'KILL', 'KILLS')
    + '   \u00b7   ' + countWords(summary.shards, 'SHARD', 'SHARDS')
    // A boss is the one kill worth its own word on the card: it is the mark a run is built
    // around (PLAN 3.4), and it only shows up at all when the run got that far.
    + (summary.bosses > 0 ? '   \u00b7   ' + bossWords(summary.bosses) : '')
    + '   \u00b7   ' + clockWords(summary.seconds)
    // A run that was handed its arena back after winning and then finally went down says which part
    // of it was the endless one: the clock above is the whole of the run, and this is the stretch
    // past the win the player stayed out there for (game/endless.js).
    + (summary.endlessPast > 0
      ? '   \u00b7   ' + BALANCE.endless.word + ' FOR ' + clockWords(summary.endlessPast) : '')
    + codexWords(summary.codexNew)
    + '   \u00b7   SEED ' + summary.seed;
  if (summary.newBest) el.newBest.classList.remove('hidden');
  else el.newBest.classList.add('hidden');
  // Which day this run was flown on, under the best it is measured against (game/daily.js). '' for a
  // run that flew an arena of its own, and an empty line takes its space with it.
  el.finalDaily.textContent = cardWords(summary);
  // ...and the rule it was flown under, above the day: the rule is the bigger fact about the run, and
  // a score won under one means nothing without it (game/challenges.js).
  el.finalChallenge.textContent = challengeCardWords(summary);
  // ...and the title's own line about the rule, painted again from the record this run has just left in
  // the save. Nothing can see the title from under this card, but the line is the one thing on that
  // screen that a finished run changes, and a panel painted off it later would be a run behind.
  el.titleChallenge.textContent = challengeTitleWords({ challenge: summary.challenge });
  // What ended the run, under the heading it happened to, and what every hull of it went to (game/
  // tally.js). A run that was given up has no cause and says so. The rack keeps the last hull out of
  // its own rows only when the headline above has just named it - a give-up's line names the giving-up
  // and not a body, so a run that gave up with one hull missing still says what that one went to.
  el.finalCause.textContent = endingWords(summary.cause);
  paintRows(hullRows, el.finalHulls, hullLedger(summary.hulls, summary.cause !== ''),
    () => buildHullRow(el.finalHulls));
  showDust(el.finalDust, summary.dust, summary.dustBank);
  showAwardLine(el.finalAwards, summary.awards, summary.awardDust);
  el.build.textContent = summary.ship + ' \u00b7 ' + summary.weapon
    + '   \u00b7   BUILT FROM   \u00b7   ' + summary.build;
  // The purse and the best moved with this run, so both are written again where they are also
  // read - and the rack is lit for the ship that just flew, because it is the ship the next run
  // flies unless a number says otherwise.
  showStanding(summary.best, summary.dustBank, summary.awardsWon);
  showShip(summary.shipId);
  // ...and the codex, which this run has just been added to (game/codex.js): the panel that goes up
  // over this card has to be the one that knows what the card is saying.
  showCodex(summary.codexFound);
  showLog(summary.pastRuns);     // ...and the same promise about the log (game/history.js)
  showAwards(summary.awardsOwned);  // ...and the awards the hangar keeps (game/awards.js)
  showRules(summary.challengeBests);  // ...and what the run just scored under its rule, if it had one
  el.over.classList.remove('hidden');
  // The card itself makes the sound of landing (BALANCE.ui). The run stopped stepping before it
  // was written, so this is a screen's own event and the simulation has no idea it happened.
  uiTick('card');
}

/**
 * The win. Same card the death is, with the parts a win has and a death has not: the fights that
 * were gone through to get here, and a clock that says how long the whole of it took.
 *
 * `showGameOver` and this one share a shape on purpose - score, best, the line of numbers, the
 * build - because the two are the same statement about a run with one word changed in them.
 */
export function showVictory(summary) {
  el.winScore.textContent = summary.score.toLocaleString('en-US');
  el.winBest.textContent = summary.best.toLocaleString('en-US');
  el.winCleared.textContent = 'CLEARED   \u00b7   ' + scheduleNames();
  el.winStats.textContent = 'CLEARED IN ' + clockWords(summary.seconds)
    + '   \u00b7   LEVEL ' + summary.level
    + '   \u00b7   ' + countWords(summary.kills, 'KILL', 'KILLS')
    + '   \u00b7   ' + countWords(summary.shards, 'SHARD', 'SHARDS')
    + '   \u00b7   ' + bossWords(summary.bosses)
    + codexWords(summary.codexNew)
    + '   \u00b7   SEED ' + summary.seed;
  if (summary.newBest) el.winNewBest.classList.remove('hidden');
  else el.winNewBest.classList.add('hidden');
  el.winDaily.textContent = cardWords(summary);   // a won daily run is a daily run (game/daily.js)
  // ...and which rule it was flown under, above the day (game/challenges.js). A won run under a rule is
  // the bigger claim of the two, and it is the one a score quoted from this card would be missing.
  el.winChallenge.textContent = challengeCardWords(summary);
  // ...and the title's line, same as the death's card: see `showGameOver`.
  el.titleChallenge.textContent = challengeTitleWords({ challenge: summary.challenge });
  // What the run lost on the way to winning it. No cause line: nothing took a win down, and the tally
  // keeps no cause for a run that finished (game/run.js `winRun`) - which is also why the rack here
  // says everything it has, down to a single hull, because there is no headline above it to have said
  // any of them already.
  paintRows(winHullRows, el.winHulls, hullLedger(summary.hulls, false),
    () => buildHullRow(el.winHulls));
  showDust(el.winDust, summary.dust, summary.dustBank);
  showAwardLine(el.winAwards, summary.awards, summary.awardDust);
  el.winBuild.textContent = summary.ship + ' \u00b7 ' + summary.weapon
    + '   \u00b7   BUILT FROM   \u00b7   ' + summary.build;
  showStanding(summary.best, summary.dustBank, summary.awardsWon);
  showShip(summary.shipId);
  showCodex(summary.codexFound);    // the same promise the death's card makes (see above)
  showLog(summary.pastRuns);        // ...and the log's
  showAwards(summary.awardsOwned);  // ...and the awards' rack
  showRules(summary.challengeBests);  // ...and the rules' (game/challenges.js)
  // The invitation waits. The card goes up on the hush and the game answers to nothing until the
  // guard is spent, and a line saying "press" that nothing may be pressed with is the exact thing
  // the guard was asked to stop (game/run.js `victoryCardIsAnswerable`).
  el.winHint.classList.add('hidden');
  el.win.classList.remove('hidden');
  uiTick('card');      // the same knock the death's card gets: it is the same event, landing
}

/**
 * Say what the card's keys do, now that they do it. Called once the win's guard is spent:
 * `main.js` asks `victoryCardIsAnswerable` and this only ever paints over a card that is up.
 */
export function revealWinHint() {
  el.winHint.classList.remove('hidden');
}
