// The DOM screens: the title, the hangar a run is chosen in, the codex of what has been met and what
// has been flown, the game-over card and the win card. The level-up choice is not here - it is
// painted on the canvas
// (render/cards.js), because its cards are drawn, not typed. Everything the run shows while it is
// being played is on the canvas too.
//
// The hangar and the codex are overlays and not states of the world: either is put up over the title
// and over the death's card, the attract crowd keeps flying behind it, and the run it launches is
// launched the same way from either. A sixth STATE would have to be answered by everything that asks
// what the world is doing, to buy a screen that only ever sits on top of two of them. And there is
// only ever one of them up: two panels of rows over one title is a screen that has stopped being
// either of them, so the key that names a panel takes the other one down on its way up.

import { SHIPS } from '../game/ships.js';
import { priceOf, shipIsBought, perkPriceOf } from '../game/hangar.js';
import { maxRankOf, PERKS, rankWords } from '../game/perks.js';
import { CARDS, HOSTS, metShare, SYNERGIES } from '../game/codex.js';
import { BALANCE } from '../game/balance.js';
import { lineOf } from '../game/upgrades.js';
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

// Whether a panel is up right now, and which one: '' for neither, and the two keys that open them
// are the only things that can write anything else. `hideScreens` clears it with the screens
// themselves, so there is no path where a run is flying and this still says open.
let panelUp = '';

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

/**
 * The run's clock the way a card reads it: `47s` inside a minute and `15m02s` past one. The win
 * is always past the first minute - the last fight on the schedule is not due until the fifteenth
 * - and a run that went that far deserves better than "902s". The death card reads it the same
 * way, because it is the same number and there is only one place in the game it is written.
 */
function clockWords(seconds) {
  const whole = Math.floor(seconds);
  if (whole < 60) return whole + 's';
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return minutes + 'm' + (rest < 10 ? '0' : '') + rest + 's';
}

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
 * One row of the codex: a name and one line about it, and nothing else - no key and no price, which
 * is the whole difference between a thing a save has met and a thing the hangar is selling. The
 * words are written by whoever owns the list (`showCodex`, `showLog`), because neither is known when
 * the row is built.
 */
function buildEntryRow(list) {
  const row = document.createElement('div');
  row.classList.add('entry');

  const name = document.createElement('span');
  name.classList.add('name');
  const says = document.createElement('span');
  says.classList.add('says');

  row.appendChild(name);
  row.appendChild(says);
  list.appendChild(row);
  return { row: row, name: name, says: says };
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
    titleBest: document.getElementById('titleBest'),
    titleDust: document.getElementById('titleDust'),
    titleShip: document.getElementById('titleShip'),
    nextShip: document.getElementById('nextShip'),
    finalDust: document.getElementById('finalDust'),
    winDust: document.getElementById('winDust'),
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

/** Is either of them up? This is the question the launch actually cares about. */
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
 * Put one panel up over whatever screen is already there, taking the other one down first, and fit
 * it to the window on the way.
 *
 * Only one of them is ever up. Both are columns of rows over the same title, and two of them at once
 * is not two screens you can read but one screen you cannot - and neither key has anything to say
 * about the other, so the rule has to be the panel's and not the key's.
 */
function raisePanel(which, screen, body) {
  layPanelDown(el.hangar, el.hangarBody);
  layPanelDown(el.codex, el.codexBody);
  screen.classList.remove('hidden');
  panelUp = which;
  fitPanel(body, screen);
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

/** The same, for the codex: it is a taller panel than the hangar is - three columns, and the
    longest text in the game - so it needs the fitting more, not less. */
export function fitCodex() {
  fitPanel(el.codexBody, el.codex);
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

/** Take both panels away again, leaving the screen underneath exactly as it was. */
export function closePanels() {
  layPanelDown(el.hangar, el.hangarBody);
  layPanelDown(el.codex, el.codexBody);
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
 * What one run's row says (game/history.js): which seed it was flown on - which is how a run gets
 * asked for again, `?seed=` in the address bar - and then the four facts about the flying of it: the
 * body it was flown in, how long it lasted, what it scored, and whether it cleared the schedule.
 */
function logLine(run) {
  return {
    name: 'SEED ' + run.seed,
    says: logShip(run.ship) + '   \u00b7   ' + clockWords(run.seconds)
      + '   \u00b7   ' + run.score.toLocaleString('en-US')
      + (run.won ? '   \u00b7   ' + LOG_CLEARED : ''),
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
  while (logRows.length > lines.length) el.logRow.removeChild(logRows.pop().row);
  while (logRows.length < lines.length) logRows.push(buildEntryRow(el.logRow));
  for (let i = 0; i < lines.length; i++) {
    logRows[i].name.textContent = lines[i].name;
    logRows[i].says.textContent = lines[i].says;
  }
}

/**
 * What the visit has to show for itself, in both places it is read: the best score, the purse, and
 * how much of the awards table this save has cleared. The three are written together because they
 * are the same kind of thing - the number you are trying to beat, the number you are saving up,
 * and the number you are working towards - and because a reward nobody can see being earned is a
 * reward nobody believes in. `awards` is `{ won, of }` from game/awards.js.
 */
export function showStanding(best, dust, awards) {
  el.titleBest.textContent = best.toLocaleString('en-US');
  el.titleDust.textContent = dust.toLocaleString('en-US');
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
function showAwards(where, names, dust) {
  where.textContent = awardWords(names, dust);
}

/**
 * One fight buried or several, in the words both cards use. A boss is the one kill worth its own
 * word on a card: it is the mark a run is built around (PLAN 3.4).
 */
function bossWords(count) {
  return count + ' BOSS' + (count > 1 ? 'ES' : '');
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
 * weapon, build, endlessPast, dust, dustBank, codexNew, codexFound, awards, awardDust, awardsWon,
 * pastRuns }
 * - `endlessPast` being how much of the run was flown after it had already been won, 0 for every run
 * that never got that far, `dust` / `dustBank` being what the run earned between runs and what the
 * purse holds after it (game/stardust.js), `codexNew` / `codexFound` being what the run added to the
 * codex and what it holds afterwards (game/codex.js), `awards` / `awardDust` / `awardsWon` being
 * what this run won, what it paid, and where the whole table stands now (game/awards.js), and
 * `pastRuns` being the log, with this run written into it (game/history.js).
 */
export function showGameOver(summary) {
  el.finalScore.textContent = summary.score.toLocaleString('en-US');
  el.finalBest.textContent = summary.best.toLocaleString('en-US');
  el.stats.textContent = 'LEVEL ' + summary.level
    + '   \u00b7   ' + summary.kills + ' KILLS'
    + '   \u00b7   ' + summary.shards + ' SHARDS'
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
  showDust(el.finalDust, summary.dust, summary.dustBank);
  showAwards(el.finalAwards, summary.awards, summary.awardDust);
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
    + '   \u00b7   ' + summary.kills + ' KILLS'
    + '   \u00b7   ' + summary.shards + ' SHARDS'
    + '   \u00b7   ' + bossWords(summary.bosses)
    + codexWords(summary.codexNew)
    + '   \u00b7   SEED ' + summary.seed;
  if (summary.newBest) el.winNewBest.classList.remove('hidden');
  else el.winNewBest.classList.add('hidden');
  showDust(el.winDust, summary.dust, summary.dustBank);
  showAwards(el.winAwards, summary.awards, summary.awardDust);
  el.winBuild.textContent = summary.ship + ' \u00b7 ' + summary.weapon
    + '   \u00b7   BUILT FROM   \u00b7   ' + summary.build;
  showStanding(summary.best, summary.dustBank, summary.awardsWon);
  showShip(summary.shipId);
  showCodex(summary.codexFound);    // the same promise the death's card makes (see above)
  showLog(summary.pastRuns);        // ...and the log's
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
