// What the eye is asked to tell apart, and what each of them means.
//
// A palette cannot be audited as a list of colours. "Is #ff4d6d far enough from
// #ff2d55" has no answer until you say what the two colours are *for*, how big a
// thing each one is painted on, and what shape the eye is given: two reds are a
// disaster if one of them is a shard and the other a bullet, and entirely fine if
// they are two bodies of a crowd that are told apart by their sizes and their
// walking anyway. So this table is the audit's question, and `tools/colour-lab.js`
// is its ruler: one row per thing a player has to make a decision about, with the
// colour it is drawn in, the meaning the palette is supposed to carry, its form,
// and the size it is drawn at.
//
// `tools/palette-check.js` prints what this says, `test/palette-read.test.mjs`
// holds it, and neither can be satisfied by a colour nobody draws: every colour
// here is read out of `BALANCE` or `PALETTE` at load, so renaming or re-aiming one
// is measured the same day it happens.
//
// ### The four meanings
//
// PLAN section 4's rule is one sentence - warm means harm, cool means help - and it
// is worth exactly nothing to an eye that cannot see the warm/cool axis. What the
// rule is *for* is the four meanings below, and those are measurable:
//
//   harm  a thing that can end the run;
//   help  a thing the run wants to touch;
//   self  the ship and what the ship is doing this instant;
//   place the room itself - a boundary, never a hazard, and never drawn where a
//         body can be, which is why it gets the loosest bar of all.
//
// ### What has to be provable, and what is left to shape and motion
//
// The promise is PLAN section 4's - harmful and helpful separated "by brightness and
// shape as well as hue" - and it is made about pairs where **one of them can hurt you**,
// because that is the only confusion that costs a run. Two bodies that both hurt you
// and look alike are a hassle; a shard that looks like a threat, or a threat that
// looks like a shard, is a death. So:
//
//   **A pair with no harm in it is reported and not promised.** Every enemy is warm,
//   and the crowd is told apart by silhouette, by size, by how it walks, and by the
//   fact that a darter lunges while a swarmling comes in a pack of twenty. Demanding
//   that all nine bodies also stand a full step apart on every axis every eye keeps
//   would demand a crowd painted in nine unrelated colours. `--all` prints those
//   numbers anyway, because a crowd that collapses into one blob is still worth seeing.
//   The same goes for a help and a self: a shard and your own shot may be one colour to
//   an eye with no hue, because walking over one of them is never fatal.
//
//   **When shape cannot tell a pair apart, colour must.** Two things of one form - a
//   diamond and a diamond, a dot and a dot - or of sizes so close that the difference
//   in shape will not be read at a glance (within SAME_SIZE_RATIO) have to carry the
//   whole difference in colour: a full step on the axes an eye keeps.
//
//   **When shape is doing most of the work, colour still has to do a lot of it.** A
//   band of light and a five-pixel diamond will not be confused, but a palette where
//   they are the *same colour* is one art change away from being confused, so the bar
//   drops to MOST_OF_IT rather than to nothing.
//
//   **A boundary is promised very little.** The wall and a boss's cage are drawn where
//   no body can be, and they are cool because they are the world stopping and not a
//   hazard. They have to be told from a hazard by hue - the one thing a wall is chosen
//   for - but they are not promised a brightness difference, because a wall is where
//   the wall is.
//
// And one rule about the eyes themselves, which is the honest part:
//
//   **A red-green colour-blind eye is promised separation by colour. An eye with no hue
//   at all is promised brightness where shape is not enough.** Roughly one man in twelve
//   is red-green colour blind; their eyes keep the blue-yellow axis and brightness, and
//   that is what the strict bar measures. Achromatopsia is about one in 30,000 and sees
//   brightness only: that eye is promised a whole step of brightness wherever a pair is
//   alike in shape or size, and nothing where the shapes already differ - because a mint
//   diamond and a cyan bolt of the same brightness are two objects to anybody who can see
//   a diamond is not a bolt, and bending the palette further for one visitor in thirty
//   thousand would take the game's colour language away from them to do it.
//
// ### What is deliberately not in here
//
//   **Transient lights** - a hurt body's white bloom, a bomber's flash, a telegraph, a
//   muzzle charge. None of them is a thing you decide about: each one lasts a fraction
//   of a second and sits on top of a body you are already looking at, and PLAN section
//   4 asks every hottest one of them to be nearly white so it reads as the last frame
//   of a thing rather than a new one. Measured against the shard they would demand a
//   palette where nothing may be bright.
//
//   **Floor paint that is not a body.** A blast ring and a mine's reach are a warning
//   about a place rather than a thing you can hit, so the mine is measured by its shell
//   and the bomber's blast by its zone, and neither is asked to behave like a body.
//
//   **Bosses** - one body alone in the arena, each drawn as its own object rather than
//   as a polygon with a halo on it (render/boss.js), announced by name and by a bar
//   across the top of the window. There is no second thing for one to be mistaken for,
//   which is the whole reason this file is about crowds.
//
//   **The interface** - cards, panels, the HUD, the codex. Those are read at leisure,
//   in words, with the run stood still; they are checked for contrast in their own
//   way (see `tools/contrast-check.js` if and when somebody wants it).
//
//   **Fills on their own.** A body's fill is a wash behind its line and the line is
//   what the eye reads as the thing's colour, so pairs are judged on the line; a fill
//   is only asked to be visible on the sky at all (FILL_STEP), because a fill that is
//   invisible is a body drawn as a hole in the background.

import { PALETTE, parseColor } from '../src/core/palette.js';
import { BALANCE } from '../src/game/balance.js';
import { oklab, over, worstVision, VISIONS } from './colour-lab.js';

/** The colour a body sits on. The sky is a vertical gradient; this is its middle. */
export const SKY = parseColor(PALETTE.bgMiddle);

/** The eyes that keep some hue, and the eye that keeps none. */
export const RED_GREEN_EYES = ['protanopia', 'deuteranopia', 'tritanopia'];
export const HUELESS_EYE = 'greyscale';

/** How much of a difference shape leaves for colour to make on its own. */
const FULL = 1;
const MOST_OF_IT = 0.55;
const SOME_OF_IT = 0.4;
const NO_BRIGHTNESS_PROMISE = 0;

/** How far out of a step the colour of a fill has to be from the sky it washes. */
const FILL_STEP = 0.6;

/** Two things within this ratio of each other's size are the same size to the eye. */
const SAME_SIZE_RATIO = 1.3;

/** Every meaning a sight can carry, in the words the report prints them in. */
export const MEANINGS = {
  harm: 'can end the run',
  help: 'the run wants to touch it',
  self: 'the ship, this instant',
  place: 'the room, never a hazard',
};

/**
 * The silhouette the eye is actually given, per body.
 *
 * Not the `sides` number in the balance table: three kinds ask for a triangle there and
 * then draw themselves something else entirely (render/entities.js gives the weaver a
 * ship silhouette, the darter a dart, the sniper a lens), and it is the drawing that an
 * eye is being asked to read. Where two bodies share one of these strings the crowd is
 * leaning on colour and size alone, which is what the report's last section is for.
 */
const FORMS = {
  drifter: 'triangle',
  weaver: 'dart',
  darter: 'dart',
  spitter: 'pentagon',
  tank: 'hexagon',
  bomber: 'octagon',
  shielder: 'bulwark',
  swarmling: 'dart',
  sniper: 'lens',
};

/** One crowd body, as the balance sheet and the renderer draw it. */
function body(type) {
  const stats = BALANCE.kinds[type];
  if (stats === undefined) throw new Error('no enemy kind is called ' + type);
  if (stats.color === undefined) throw new Error('the ' + type + ' has no colour to measure');
  return {
    id: type,
    name: type.toUpperCase(),
    meaning: 'harm',
    form: FORMS[type],
    size: stats.radius,
    colour: stats.color,
    fill: stats.fill,
    from: 'BALANCE.kinds.' + type,
  };
}

/** A shot somebody looses. `size` is the body's own radius, not the halo's reach. */
function shot(id, name, meaning, colour, size, core, from) {
  return { id, name, meaning, form: 'dot', size, colour, core, from };
}

// The sizes the renderer paints things at. These live in render/entities.js, which
// `tools/` may not import (it would drag the canvas in with it), so they are written here
// and `test/palette-read.test.mjs` reads the renderer's source and checks them - that is
// stricter than a comment: a size changed in the renderer fails there the same day.
const SHARD_SMALL = 5.4;
const SHARD_BIG = 9;
const WALL_LINE = 3;
// The mine's shell plus the four spikes standing off its corners (MINE_BODY + MINE_SPIKE):
// the shell is the thing a body can hit, and the dashed ring round it is floor paint.
const MINE_SHELL = 10.5;

/**
 * The table. Every entry is read out of the game's own numbers, so the audit cannot
 * quietly drift away from what is drawn.
 */
export const SIGHTS = [
  // The crowd.
  body('drifter'),
  body('weaver'),
  body('darter'),
  body('spitter'),
  body('tank'),
  body('bomber'),
  body('shielder'),
  body('swarmling'),
  body('sniper'),

  // What the crowd throws, and the two things that hurt without being thrown.
  //
  // A shot is measured by its *body* colour, not by its pale core: the glow is painted
  // under every shot, always (render/entities.js), and both sides' cores are nearly white,
  // which is exactly why the core is reported and promised nothing. Where a shot's meaning
  // lives is the colour of that glow - cyan is yours, orange is not.
  shot('enemyShot', 'AN ENEMY SHOT', 'harm',
    PALETTE.enemyShot, BALANCE.kinds.spitter.spit.shot.radius, PALETTE.enemyShotCore,
    'kinds.spitter.spit.shot + PALETTE.enemyShotCore'),
  {
    id: 'beam', name: 'A SNIPER BEAM', meaning: 'harm', form: 'band',
    size: BALANCE.kinds.sniper.lock.beam.halfWidth, colour: PALETTE.beamEdge,
    core: PALETTE.beamCore, from: 'kinds.sniper.lock.beam',
  },
  {
    id: 'blastZone', name: "A BOMBER'S BLAST", meaning: 'harm', form: 'zone',
    size: BALANCE.kinds.bomber.blast.radius, colour: PALETTE.blastZone, from: 'kinds.bomber.blast',
  },

  // The ship's own ordnance, which is cool because it is the ship's even though what
  // it does is explode (see the note on PALETTE.mineZone). Measured by its shell, which
  // is the thing a body can hit: the dashed ring is a warning about a place, and a ring
  // of floor paint is not an object an eye is being asked to identify.
  {
    id: 'mine', name: "THE SHIP'S OWN MINE", meaning: 'self', form: 'shell',
    size: MINE_SHELL, colour: PALETTE.mineBody, from: 'upgrades.mines + PALETTE.mineBody',
  },

  // What the run is flying, and what it is firing.
  {
    id: 'ship', name: 'THE SHIP', meaning: 'self', form: 'ship',
    size: BALANCE.player.drawRadius, colour: PALETTE.player, from: 'PALETTE.player',
  },
  shot('playerShot', "THE SHIP'S SHOT", 'self',
    PALETTE.bullet, BALANCE.bullets.hitRadius, PALETTE.bulletCore, 'PALETTE.bullet + bulletCore'),

  // What the run picks up. The small shard and the big one are two sights, because a
  // big one is nearly twice across and it is the small one that could be a body.
  {
    id: 'shard', name: 'A SHARD', meaning: 'help', form: 'diamond',
    size: SHARD_SMALL, colour: PALETTE.shard, fill: PALETTE.shardFill, from: 'PALETTE.shard',
  },
  {
    id: 'bigShard', name: 'A LARGE SHARD', meaning: 'help', form: 'diamond',
    size: SHARD_BIG, colour: PALETTE.shard, fill: PALETTE.shardFill, from: 'PALETTE.shard',
  },

  // The room.
  { id: 'wall', name: 'THE ENERGY WALL', meaning: 'place', form: 'wall', size: WALL_LINE, colour: PALETTE.wall, from: 'PALETTE.wall' },
  { id: 'cage', name: "A BOSS'S CAGE", meaning: 'place', form: 'wall', size: WALL_LINE, colour: PALETTE.cageWall, from: 'PALETTE.cageWall' },
];

/**
 * How a pair's shape and size leave colour to do: `none` (nothing is at stake, so the pair
 * is reported and not promised), `place`, `full`, or `most`.
 *
 * The stake is the whole rule: a promise is made only about a pair where being wrong costs
 * the run. Every promised pair has **harm** in it - harm against help (walk into a threat,
 * dodge a pickup), harm against self (their shot is not your shot), harm against a boundary
 * (an edge that looks like a hazard, or a hazard that looks like an edge). Two harms, a help
 * and a self, a wall and a pickup: whatever they are to each other, neither can end the run.
 */
function howMuch(a, b) {
  if (a.meaning !== 'harm' && b.meaning !== 'harm') {
    return { want: 'none', why: 'neither of them can hurt you, or both of them can' };
  }
  if (a.meaning === b.meaning) {
    return { want: 'none', why: 'both of them are ' + a.meaning };
  }
  if (a.meaning === 'place' || b.meaning === 'place') {
    // A boundary is a line at the edge of the room. It has to be told from a hazard by hue,
    // and it is not promised a brightness difference: a wall is where the wall is.
    return { want: 'place', why: 'a boundary drawn where no body can be' };
  }
  const ratio = Math.max(a.size, b.size) / Math.min(a.size, b.size);
  const alike = a.form === b.form || ratio <= SAME_SIZE_RATIO;
  return alike
    ? { want: 'full', why: a.meaning + ' against ' + b.meaning + ', alike in shape or size' }
    : { want: 'most', why: 'one is a ' + a.form + ' and the other a ' + b.form };
}

/**
 * What a pair has to show on each of the two promises, or null when the pair is not
 * promised anything. `why` is printed next to the measurement, so a reader can see which
 * rule was applied and argue with it.
 *
 * Brightness is only promised where shape cannot tell the pair apart - PLAN section 4's
 * "by brightness and shape as well as hue" read the other way round: it is when the shape
 * is *not* enough that the brightness has to be there.
 */
export function promiseOf(a, b) {
  const { want, why } = howMuch(a, b);
  if (want === 'none') return null;
  if (want === 'place') return { why, redGreen: SOME_OF_IT, hueless: NO_BRIGHTNESS_PROMISE };
  if (want === 'full') return { why, redGreen: FULL, hueless: FULL };
  return { why, redGreen: MOST_OF_IT, hueless: NO_BRIGHTNESS_PROMISE };
}

/**
 * A sight as an eye gets it: `lab` for the colour the eye reads, `fillLab` for its wash
 * after it has been laid on the sky, `coreLab` for the highlight in the middle of a shot.
 * A translucent colour is not a colour until it has been put on the thing behind it, so
 * every measurement composites first.
 */
export function measure(sight) {
  const read = parseColor(sight.colour);
  const out = { lab: oklab(read), rgb: read };
  if (sight.fill !== undefined) {
    out.fillLab = oklab(over(parseColor(sight.fill), alphaOf(sight.fill), SKY));
  }
  if (sight.core !== undefined) out.coreLab = oklab(parseColor(sight.core));
  return out;
}

/** The opacity an rgba() string carries (1 for everything else). */
function alphaOf(colour) {
  const parts = /^rgba\(([^)]+)\)$/.exec(String(colour).trim());
  if (parts === null) return 1;
  const bits = parts[1].split(',').map(Number);
  return Number.isFinite(bits[3]) ? bits[3] : 1;
}

/**
 * One pair, measured. The report and the test read the same objects, so a promise can be
 * kept in one of them and broken in the other only by a bug, not by a difference of wording.
 */
export function auditPair(a, b) {
  const need = promiseOf(a, b);
  const labA = measure(a).lab;
  const labB = measure(b).lab;
  const redGreen = worstVision(labA, labB, RED_GREEN_EYES);
  const hueless = worstVision(labA, labB, [HUELESS_EYE]);
  return {
    a,
    b,
    need,
    promised: need !== null,
    redGreen,
    hueless,
    pass: need === null
      || (redGreen.ratio >= need.redGreen && hueless.ratio >= need.hueless),
  };
}

/** Every unordered pair of sights, promised or not. */
export function auditSights(sights = SIGHTS) {
  const out = [];
  for (let i = 0; i < sights.length; i++) {
    for (let j = i + 1; j < sights.length; j++) out.push(auditPair(sights[i], sights[j]));
  }
  return out;
}

/** The pairs that carry a promise - the two audit functions hand back the same shape. */
export function promised(pairs) {
  return pairs.filter((pair) => pair.promised);
}

/**
 * Every sight against the sky it is drawn on.
 *
 * The one promise that is not about telling two things apart: a body nobody can see at
 * all is not separated from anything, it is simply missing. A line colour has to clear a
 * whole step; a wash has to clear FILL_STEP, because a wash is meant to be felt.
 */
export function auditSky(sights = SIGHTS) {
  const sky = oklab(SKY);
  const out = [];
  for (const sight of sights) {
    const m = measure(sight);
    out.push({
      sight, part: 'line', need: FULL, worst: worstVision(sky, m.lab, VISIONS.map((v) => v.id)),
    });
    if (m.fillLab !== undefined) {
      out.push({ sight, part: 'fill', need: FILL_STEP, worst: worstVision(sky, m.fillLab, VISIONS.map((v) => v.id)) });
    }
  }
  return out;
}

/** Every vision's name, for a report that wants to say who is looking. */
export function visionName(id) {
  const vision = VISIONS.find((v) => v.id === id);
  return vision === undefined ? id : vision.name;
}
