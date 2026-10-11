// The writing. Every sentence the game says to a player, held to the same three rules.
//
// This is the gate for the writing pass (PLAN: "read every line of text in the game and make it
// short, clear, and consistent"). `tools/text-survey.js` is the same harvest with the rules off, for
// reading; this file has them on. The lines come from `tools/headless/text.js`, which plays a whole
// visit in the stub browser and takes back what was on the glass at every stop, plus the sentences
// written into `index.html` - which is where most of the interface's lines actually live.
//
// **The game has three voices and every line belongs to one of them.**
//
//   *The interface speaks in caps.* Every line that tells you what a key does, what a panel holds,
//     what the run is worth: `HANGAR · BUY SHIPS AND PERKS`, `TAKEN BY A TANK`, `SPACE TO DASH`. It is
//     read at a glance, over a moving arena, and it is the same voice on the glass and on the page.
//   *The catalogue speaks in lower case, without a full stop.* What a thing *is*, said about it:
//     `too heavy to turn, and comes apart in two`. It is read slowly, on a panel, and it is a
//     description and not an instruction.
//   *A card's own copy is a sentence, and ends like one.* `A shot goes through one more body, and on
//     to the next.` It is the one place a full stop belongs, because it is the one place a line is
//     long enough to be more than one clause (game/upgrades.js keeps the budget it has to fit).
//
// What the rules below are *not*: a style court. They catch a line that has wandered out of its voice,
// a separator that has lost its room, a `1 KILLS`, a bus called one thing on one panel and another
// thing on the next - the ways two sessions of good writing drift apart from each other. The developer's
// plate (render/debug.js) is deliberately outside all of it: it is a terminal readout, it speaks in
// lower case on purpose, and it is not a sentence anyone plays.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { harvestVisit } from '../tools/headless/text.js';
import { BALANCE } from '../src/game/balance.js';
import { ROWS as ASSIST_ROWS } from '../src/game/assists.js';
import { AWARDS } from '../src/game/awards.js';
import { CARDS, HOSTS, SYNERGIES } from '../src/game/codex.js';
import { ROWS as PICTURE_ROWS } from '../src/game/settings.js';
import { PERKS } from '../src/game/perks.js';
import { SHIPS } from '../src/game/ships.js';
import { LESSONS, saysOf } from '../src/game/tutorial.js';
import { ACTIONS as KEY_ROWS } from '../src/core/keymap.js';
import { LINES } from '../src/game/upgrades.js';
import { WEAPONS } from '../src/game/weapons.js';

const ROOT = path.resolve(import.meta.dirname, '..');

/** How long a line may be before it stops being one glance, per voice. */
const LIMITS = { descriptive: 60, flavour: 130, label: 22 };

const harvest = await harvestVisit({ root: ROOT });

/** Every line the visit saw, with where it came from. */
const LINES_SEEN = [];
for (const stop of harvest.stops) {
  for (const line of stop.page) LINES_SEEN.push({ where: 'page', stop: stop.name, text: line });
  for (const line of stop.canvas) LINES_SEEN.push({ where: 'glass', stop: stop.name, text: line });
  for (const line of stop.markup) LINES_SEEN.push({ where: 'markup', stop: stop.name, text: line });
}

/**
 * The catalogue: what a thing is, said about it. `game/codex.js` holds the crowd and the fights,
 * `game/perks.js` the hangar, `game/ships.js` and `game/weapons.js` the body and the gun,
 * `BALANCE.bosses` the fights, `game/awards.js` what a run can aim at.
 */
const DESCRIPTIVE = []
  .concat(HOSTS.map((entry) => entry.says))
  .concat(PERKS.map((perk) => perk.blurb))
  .concat(SHIPS.map((ship) => ship.blurb))
  .concat(WEAPONS.map((gun) => gun.blurb))
  .concat(BALANCE.bosses.schedule.map((entry) => BALANCE.bosses[entry.boss].blurb))
  .concat(AWARDS.map((award) => award.says));

/** A card's copy: the sentence under the number, which is also what the codex prints for a line. */
const CARD_COPY = LINES.map((line) => line.flavour);

/** The noun phrase a card prints its number next to: `shot damage`, `body passed through`. A
 *  synergy sells no quantity at all and so prints no such phrase (game/upgrades.js `SYNERGY_UNIT`). */
const LABELS = LINES
  .filter((line) => line.what !== undefined)
  .map((line) => line.what);

/** Every name the game gives a thing: a ship, a gun, a body, a fight, a line, an award, a perk. */
const NAMES = []
  .concat(SHIPS.map((ship) => BALANCE.ships[ship.id].name))
  .concat(WEAPONS.map((gun) => BALANCE.weapons[gun.id].name))
  .concat(HOSTS.map((entry) => entry.name))
  .concat(PERKS.map((perk) => perk.name))
  .concat(AWARDS.map((award) => award.name))
  .concat(LINES.map((line) => line.name))
  .concat(LINES.map((line) => line.becomes === undefined ? '' : line.becomes));

/** The lines that live in a module and are interface through and through. */
const INTERFACE = []
  .concat(PICTURE_ROWS.map((row) => row.name).concat(PICTURE_ROWS.map((row) => row.says)))
  .concat(ASSIST_ROWS.map((row) => row.name).concat(ASSIST_ROWS.map((row) => row.says)))
  // ...and the controls rack's rows (core/keymap.js), which are the same shape: a name, and one plain
  // line about what the thing is.
  .concat(KEY_ROWS.map((row) => row.name).concat(KEY_ROWS.map((row) => row.says)))
  // The three lesson plates, spelled out of the table as the plate spells them out (game/tutorial.js).
  .concat(LESSONS.map(saysOf))
  .concat([BALANCE.endless.word]);

/** Every sentence the game owns: the catalogue's descriptions and the cards' copy. */
const SENTENCES = DESCRIPTIVE.concat(CARD_COPY);

/**
 * Is this line a *piece* of one of those sentences? A card wraps its copy over as many rows as it
 * needs (render/fit.js cuts it at the words), so a frame paints `Drones circle the ship` and
 * `and grind whatever they` and `touch.` as three separate lines - and the last of them is a
 * full stop with nothing in front of it. That is one sentence seen from inside, and not a line that
 * has forgotten which voice it speaks, so it is judged as the whole it came from.
 */
function pieceOfASentence(line) {
  if (line.length < 5) return false;
  for (const says of SENTENCES) {
    if (says.includes(line)) return true;
  }
  return false;
}

/**
 * Take out everything a line is allowed to say in lower case: a catalogue phrase, a card's copy, a
 * card's label, and the units a clock and a meter are written with (`2s`, `15m02s`, `2.5s`).
 * What is left is the line's own interface voice, and that has no business being lower case.
 */
function interfaceVoice(line) {
  if (pieceOfASentence(line)) return '';
  let rest = line;
  for (const phrase of SENTENCES.concat(LABELS)) {
    rest = rest.split(phrase).join(' ');
  }
  return rest
    .replace(/[0-9]+(\.[0-9]+)?m[0-9]+s/g, ' ')     // 15m02s
    .replace(/[0-9]+(\.[0-9]+)?[hms]/g, ' ')       // 2s, 902s, 2.5s
    .replace(/[0-9]+(\.[0-9]+)?%/g, ' ');          // +10%
}

test('the interface speaks in caps, everywhere a player reads it', () => {
  for (const line of LINES_SEEN) {
    const spoken = interfaceVoice(line.text);
    assert.equal(
      /[a-z]/.test(spoken), false,
      line.where + ' on ' + line.stop + ' says something in lower case: ' + JSON.stringify(line.text)
      + ' (the interface voice left over was ' + JSON.stringify(spoken) + ')');
  }
});

test('the interface voice in the tables is caps too', () => {
  for (const name of NAMES.concat(INTERFACE)) {
    if (name === '') continue;
    assert.equal(name, name.toUpperCase(), JSON.stringify(name) + ' is not said in caps');
  }
});

test('nothing on the glass or the page ends in a full stop but a card', () => {
  for (const line of LINES_SEEN) {
    if (pieceOfASentence(line.text)) continue;   // a row of a card's sentence, seen from inside
    let rest = line.text;
    for (const copy of CARD_COPY) rest = rest.split(copy).join(' ');
    assert.equal(
      /[.]$/.test(rest.trim()), false,
      line.where + ' on ' + line.stop + ' ends on a full stop: ' + JSON.stringify(line.text)
      + ' - only a card\'s own copy is a sentence');
  }
});

test('the catalogue speaks in lower case, without a full stop, and short', () => {
  for (const says of DESCRIPTIVE) {
    assert.equal(/^[a-z]/.test(says), true, JSON.stringify(says) + ' does not start in lower case');
    assert.equal(/[.]$/.test(says), false, JSON.stringify(says) + ' ends on a full stop');
    assert.ok(
      says.length <= LIMITS.descriptive,
      JSON.stringify(says) + ' is ' + says.length + ' characters; a catalogue line is '
      + LIMITS.descriptive + ' at most, because it is read in a column beside a name');
  }
});

test('a card says what it does in one sentence that fits the card', () => {
  for (const copy of CARD_COPY) {
    assert.equal(/^[A-Z]/.test(copy), true, JSON.stringify(copy) + ' does not start a sentence');
    assert.equal(/[.]$/.test(copy), true, JSON.stringify(copy) + ' does not end one');
    assert.ok(
      copy.length <= LIMITS.flavour,
      JSON.stringify(copy) + ' is ' + copy.length + ' characters; game/upgrades.js gives a card about '
      + LIMITS.flavour + ' before render/fit.js has to shrink it');
  }
});

test('what a card counts is a lowercase noun phrase and nothing more', () => {
  for (const label of LABELS) {
    assert.equal(label, label.toLowerCase(), JSON.stringify(label) + ' is not a lowercase phrase');
    assert.equal(label, label.trim(), JSON.stringify(label) + ' has loose space on an end');
    assert.ok(
      label.length <= LIMITS.label,
      JSON.stringify(label) + ' is ' + label.length + ' characters, and it shares a line with a number');
  }
});

test('a middle dot has room either side of it', () => {
  for (const line of LINES_SEEN) {
    if (line.where === 'markup') continue;   // the file holds the sentence before a number is in it
    for (const dot of line.text.matchAll(/\u00b7/g)) {
      const before = line.text[dot.index - 1];
      const after = line.text[dot.index + 1];
      assert.ok(
        before !== undefined && after !== undefined && /\s/.test(before) && /\s/.test(after),
        JSON.stringify(line.text) + ' has a middle dot with no room beside it');
    }
  }
});

test('one thing, one name: the two mixers call the two buses the same things', () => {
  // The readout the keys put up (render/volume.js) and the panel `O` puts up (main.js `settingRows`)
  // are one machine seen from two places, and they used to call its effects bus `SOUND` in one and
  // `SOUNDS` in the other.
  const readout = harvest.stops.find((stop) => stop.name === 'mixer');
  const panel = harvest.stops.find((stop) => stop.name === 'settings');
  const busNames = readout.canvas.filter((word) => word === 'MUSIC' || word === 'SOUND');
  assert.deepEqual(busNames, ['MUSIC', 'SOUND'], 'the readout names two buses');
  for (const name of busNames) {
    assert.ok(
      panel.page.indexOf(name) >= 0,
      name + ' is on the readout but the settings panel calls that bus something else');
  }
});

test('one is one: no line writes 1 KILLS', () => {
  // The win this visit reached had exactly one kill and one fight in it, which is the only time a card
  // ever finds out that its sentence was built by joining two parts together and one of them was a
  // plural noun. `1 BOSS` is English; `1 KILLS` is a bug wearing an S.
  const ONES = [/\b1 KILLS\b/, /\b1 SHARDS\b/, /\b1 BOSSES\b/, /\b1 LEVELS\b/, /\b1 CARDS\b/];
  for (const line of LINES_SEEN) {
    for (const one of ONES) {
      assert.equal(
        one.test(line.text), false,
        line.where + ' on ' + line.stop + ' counts one of something and calls it several: '
        + JSON.stringify(line.text));
    }
  }
});

test('the run clock is one wording, on the glass and on the card', () => {
  // The HUD beside the score used to write `TIME 902s` while the card the same run ended on wrote
  // `CLEARED IN 15m02s`. One number, two spellings, and the second one is the game's own argument
  // against the first (core/words.js). The win is the stop where both are on show at once.
  const win = harvest.stops.find((stop) => stop.name === 'win');
  const glass = win.canvas.find((line) => line.indexOf('TIME ') === 0);
  const card = win.page.find((line) => line.indexOf('CLEARED IN ') === 0);
  assert.ok(glass, 'the visit left the HUD clock painted');
  assert.ok(card, 'and the win card up to say how long the run took');
  const onTheGlass = /TIME ([^ ]+)/.exec(glass)[1];
  const onTheCard = /CLEARED IN ([^ ]+)/.exec(card)[1];
  assert.equal(onTheGlass, onTheCard,
    'the glass calls the same clock ' + JSON.stringify(onTheGlass)
    + ' and the card calls it ' + JSON.stringify(onTheCard));
  assert.match(onTheCard, /^\d+m\d+s$/, 'and the wording a long run gets is minutes and seconds');
});

test('the visit actually read the whole game', () => {
  // The rules above are only worth what the harvest covered, so the coverage is asserted and not
  // assumed: every stop arrived, and the stops that hold the biggest bodies of text hold their size.
  const stops = harvest.stops.map((stop) => stop.name);
  assert.deepEqual(stops, [
    'title', 'hangar', 'codex', 'settings', 'keys', 'mixer', 'run', 'cards', 'pause', 'wreck', 'win',
  ], 'the visit walked somewhere new, or stopped walking somewhere it used to');
  const read = (name) => {
    const stop = harvest.stops.find((one) => one.name === name);
    return stop.page.length + stop.markup.length + stop.canvas.length;
  };
  assert.ok(read('hangar') > 60, 'the hangar has ships, perks and thirty awards to say');
  assert.ok(read('codex') > 50, 'the codex has the whole crowd and every card line in it');
  assert.ok(read('settings') > 20, 'the settings panel has ten rows and a line about each');
  assert.ok(read('keys') > 20, 'the controls rack has a row and a line for every movable key');
  assert.ok(read('wreck') > 4, 'the wreck names what took the run');
  assert.ok(read('win') > 4, 'the win names what the run cleared');
});
