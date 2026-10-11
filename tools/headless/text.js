// Every line of text the game can put in front of a player, gathered by playing a whole visit.
//
// This is the reading instrument behind the writing pass (PLAN: "read every line of text in the game
// and make it short, clear, and consistent"). A text pass cannot be done by grepping for string
// literals: half of the game's sentences are built out of two or three of them at the moment they are
// painted (`'RANK ' + held + ' OF ' + max`), and a grep reads the parts and not the sentence. So this
// boots the real game in the stub browser, walks a visit the way a player walks it, and takes back
// what was on the glass at every stop - the canvas words the frame asked for and every word the page's
// own elements are holding.
//
// What it covers, in the order it visits it: the title, the hangar (ships, perks, awards), the codex,
// the settings, the rack of keys behind them, the mixer readout, a run flying (the HUD, the level-up
// table), the pause, the wreck's card, and the win's card. What it does *not* reach, and why the test
// says so as well:
//
//   * the first-run prompts (game/tutorial.js), which need a visit that has never flown before and so
//     need a page of their own - one game lives in a process (tools/headless/harness.js);
//   * the developer's plate (render/debug.js), which is its own register on purpose;
//   * the toast (render/toast.js), which is paid out at an exact moment of a run.
//
// The visit arrives as a player who has been here before: every ship and perk bought, most of the
// codex met, a handful of awards won and a couple of runs in the log. That is deliberate - a rack that
// has been bought, met and won is the rack that prints its sentences, and an empty one prints one line
// about being empty.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { bootGame, everyPerkBought, everyShipBought } from './harness.js';
import { BALANCE } from '../../src/game/balance.js';
import { AWARDS } from '../../src/game/awards.js';
import { CARDS, HOSTS, SYNERGIES } from '../../src/game/codex.js';
import { damageEnemy } from '../../src/game/enemies.js';
import { makeEnemy } from '../../src/game/kinds.js';
import { dropShards } from '../../src/game/pickups.js';

const FRAME = 16.7;
const SCHEDULE = BALANCE.bosses.schedule;
const LAST = SCHEDULE.length - 1;
const DUE = SCHEDULE[LAST].at;

/** The screens whose words are written into the markup, in the order the file holds them. */
const MARKED_SCREENS = [
  { id: 'startScreen', stop: 'title' },
  { id: 'hangarScreen', stop: 'hangar' },
  { id: 'codexScreen', stop: 'codex' },
  { id: 'pauseScreen', stop: 'pause' },
  { id: 'settingsScreen', stop: 'settings' },
  { id: 'keysScreen', stop: 'keys' },
  { id: 'overScreen', stop: 'wreck' },
  { id: 'winScreen', stop: 'win' },
];

/** The character references the markup uses, spelled out the way the browser spells them. */
function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (all, code) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

/** The save the visit arrives with: somebody who has played this game before. */
function aVisitUnderTest() {
  return {
    version: 1,
    score: { best: 24680 },
    meta: { dust: 3120 },
    hangar: { ships: everyShipBought(), perks: everyPerkBought() },
    codex: {
      hosts: HOSTS.map((entry) => entry.key),
      lines: CARDS.concat(SYNERGIES).map((entry) => entry.key),
    },
    awards: { won: AWARDS.slice(0, 4).map((award) => award.id) },
    runs: {
      log: [
        { seed: 4101, ship: 'wisp', seconds: 61, score: 2140, won: false },
        { seed: 4100, ship: 'volt', seconds: 812, score: 51234, won: true },
      ],
    },
    // Nothing left to teach, so that a prompt is not standing on the glass while everything else is
    // being read. The prompts themselves are read from game/tutorial.js by the test.
    tutorial: { learned: ['fly', 'fire', 'dash'] },
  };
}

/**
 * The strings the page is holding for one stop.
 *
 * `game.screen` answers the whole page - every panel keeps its last words whether or not it is on the
 * glass, which is what a browser does too and what the panels rely on. So a stop says which parts of
 * that answer belong to it, by the key they are filed under: `title*` and `nextShip` are the title's,
 * `hangar*`, `ships`, `perks` and `award*` are the hangar's, and so on. A stop that reads none of it
 * (a run flying, the card table) reads only the glass.
 */
function pageWords(screen, reads) {
  const found = [];
  const walk = (value) => {
    if (typeof value === 'string') {
      found.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (value !== null && typeof value === 'object') {
      for (const key of Object.keys(value)) walk(value[key]);
    }
  };
  for (const key of Object.keys(screen)) {
    for (const read of reads) {
      if (key.indexOf(read) === 0) {
        walk(screen[key]);
        break;
      }
    }
  }
  return found;
}

/**
 * The words the page itself is written with (index.html), read out of the file one screen at a time.
 *
 * Most of the interface's sentences are not built by any code: the control list, the headings, and the
 * line of keys at the bottom of every panel are written straight into the markup and never touched
 * after. The stub browser cannot see them - it has no HTML, only the elements the game asks for - so
 * this reads the file the way the browser will: the text between the tags of one screen, with the
 * character references spelled out and the markup left out.
 */
export function pageMarkupWords(root) {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const body = html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  // The screens are top-level in the file and in this order, so every one of them runs from its own
  // `id="..."` to the next one's.
  const marks = MARKED_SCREENS.map((screen) => {
    const at = body.indexOf('id="' + screen.id + '"');
    if (at < 0) throw new Error('index.html has no screen called ' + screen.id);
    return body.indexOf('>', at) + 1;      // past the tag the id was written in
  });
  marks.push(body.length);
  const stops = [];
  for (let i = 0; i < marks.length - 1; i++) {
    const lines = body
      .slice(marks[i], marks[i + 1])
      .replace(/<[^>]*>?/g, '\n')        // a tag, or the start of one the slice ran out inside
      .split('\n')
      .map((line) => decodeEntities(line).replace(/\s+/g, ' ').trim())
      .filter((line) => line !== '');
    stops.push({ name: MARKED_SCREENS[i].stop, lines: lines });
  }
  return stops;
}

/** Which parts of the page each stop owns. See `pageWords`. */
const READS = {
  title: ['title', 'nextShip'],
  hangar: ['hangar', 'ships', 'perks', 'award'],
  codex: ['codex', 'pastRuns'],
  settings: ['settings'],
  keys: ['keys'],
  pause: ['pause'],
  wreck: ['final', 'hulls', 'newBest', 'stats'],
  win: ['win', 'newBest'],
};

/**
 * One stop of the visit: hold the glass still for a few frames, and take back what it said.
 * The page is read once and the canvas words are gathered across `frames` frames, because a frame
 * that runs no simulation still paints, and a line that fades in is not there on the first one.
 */
function look(game, name, frames) {
  const hold = frames === undefined ? 4 : frames;
  const canvas = [];
  for (let i = 0; i < hold; i++) {
    game.step(FRAME);
    for (const word of game.words()) if (canvas.indexOf(word) < 0) canvas.push(word);
  }
  const reads = READS[name] === undefined ? [] : READS[name];
  return {
    name: name, reads: reads, canvas: canvas,
    page: pageWords(game.screen, reads), markup: [],
  };
}

/** Fly a little: hold a key and the trigger, so the HUD has something to say. */
function flyFor(game, seconds) {
  const frames = Math.round(seconds * 1000 / FRAME);
  game.key('KeyD', true);
  game.pressMouse(900, 300, 0);
  for (let i = 0; i < frames; i++) game.step(FRAME);
  game.releaseMouse(0);
  game.key('KeyD', false);
}

/** Press a key the way a hand does: down, one frame, up. */
function tap(game, code) {
  game.key(code, true);
  game.step(FRAME);
  game.key(code, false);
}

/** Step until `seen` answers true, and say whether it ever did. Bounded: a break must fail, not hang. */
function until(game, seen, seconds) {
  const limit = Math.ceil(seconds * 1000 / FRAME);
  let frames = 0;
  while (!seen()) {
    if (frames >= limit) return false;
    game.step(FRAME);
    frames += 1;
  }
  return true;
}

/**
 * Play one whole visit and say what was on the glass at every stop.
 * Returns `{ root, stops: [{ name, page: [string], canvas: [string] }] }`.
 */
export async function harvestVisit(options) {
  const opts = options || {};
  const game = await bootGame({
    root: opts.root,
    seed: opts.seed === undefined ? 20261012 : opts.seed,
    audio: false,
    storage: { 'starfall.save': JSON.stringify(aVisitUnderTest()) },
  });
  const world = game.world;
  const ship = world.player;
  const stops = [];

  for (let i = 0; i < 20; i++) game.step(FRAME);      // the title breathing, with nobody in it
  stops.push(look(game, 'title'));

  tap(game, 'KeyH');
  stops.push(look(game, 'hangar'));
  tap(game, 'KeyH');

  tap(game, 'KeyC');
  stops.push(look(game, 'codex'));
  tap(game, 'KeyC');

  tap(game, 'KeyO');
  stops.push(look(game, 'settings'));
  // The rack of keys behind the door on that panel. The cursor is walked down to the door rather than
  // guessed at, because the door is wherever the panel prints it (main.js `settingRows`).
  for (let i = 0; i < 4; i++) tap(game, 'ArrowDown');
  tap(game, 'ArrowRight');
  stops.push(look(game, 'keys'));
  tap(game, 'KeyO');                                    // back to the settings it came from
  tap(game, 'KeyO');                                    // and away

  // The mixer readout, which is the one panel that goes up over a run and outlives nothing.
  tap(game, 'BracketLeft');
  game.releaseMouse();
  stops.push(look(game, 'mixer'));

  game.pressMouse(640, 360);                          // launch with the mouse, so Space is not spent
  game.step(FRAME);
  flyFor(game, 2.5);
  stops.push(look(game, 'run'));

  // The level-up table: one level paid for, and the run stops in front of three cards by itself.
  world.xp = 0;
  world.shards.clear();
  world.pendingLevels = 0;
  dropShards(world, ship.x, ship.y, Math.ceil(world.xpNeed / BALANCE.shards.xp));
  const dealt = until(game, () => world.state === game.STATE.LEVEL, 12);
  stops.push(look(game, dealt ? 'cards' : 'cards-not-dealt'));
  if (dealt) {
    tap(game, 'Digit1');
    until(game, () => world.state === game.STATE.PLAY, 5);
  }

  tap(game, 'KeyP');
  until(game, () => game.screen.pauseHidden === false, 3);
  stops.push(look(game, 'pause'));
  tap(game, 'KeyP');

  // The wreck's card: one hull left, and a body standing exactly where the ship is.
  ship.hull = 1;
  ship.invuln = 0;
  ship.fireTimer = 5;
  world.enemies.length = 0;
  world.enemies.push(makeEnemy(world, 'drifter', ship.x, ship.y, {
    hp: 1, speed: 0, drop: 0, score: 0,
  }));
  until(game, () => game.screen.overHidden === false, 5);
  stops.push(look(game, 'wreck', 30));

  // And the win's card, on a run parked at the last fight - the same thing
  // `tools/simulate.js --at` does, and for the same reason: the whole curve reads the run's clock.
  tap(game, 'Space');                                 // past the restart guard
  until(game, () => game.stats().state === game.STATE.PLAY, 5);
  world.elapsed = DUE - 0.05;
  world.bossIndex = LAST;
  ship.invuln = Infinity;
  world.spawnTimer = Infinity;
  world.enemies.length = 0;
  if (until(game, () => game.stats().bossCores > 0, 30)) {
    const boss = world.boss;
    damageEnemy(world, boss.enemy, boss.enemy.maxhp * 10, true);
    until(game, () => game.screen.winHidden === false, BALANCE.victory.hush + 5);
    stops.push(look(game, 'win', Math.round((BALANCE.victory.guard + 1) * 1000 / FRAME)));
  } else {
    stops.push({ name: 'win-not-reached', reads: [], page: [], markup: [], canvas: [] });
  }

  // The markup's own words, filed under the stop they belong to. They are kept apart from the live
  // page because the file holds the sentence before the game has filled a number into it, and because
  // a browser collapses a run of spaces in a page and the canvas keeps every one of its own.
  const root = opts.root === undefined ? process.cwd() : opts.root;
  for (const stop of pageMarkupWords(root)) {
    const mine = stops.find((one) => one.name === stop.name);
    if (mine === undefined) continue;
    for (const line of stop.lines) if (mine.markup.indexOf(line) < 0) mine.markup.push(line);
  }

  return { game: game, stops: stops };
}
