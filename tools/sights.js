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
//   in words, with the run stood still; they are measured by `tools/contrast-check.js`
//   on a different ruler (WCAG's contrast ratio, because the question is a line of type
//   you can read and not two bodies that have to be two) and by `test/contrast.test.mjs`.
//
//   **Fills on their own.** A body's fill is a wash behind its line and the line is
//   what the eye reads as the thing's colour, so pairs are judged on the line; a fill
//   is only asked to be visible on the sky at all (FILL_STEP), because a fill that is
//   invisible is a body drawn as a hole in the background.

import { PALETTE, parseColor, mixColors } from '../src/core/palette.js';
import { BALANCE } from '../src/game/balance.js';
import { ROWS as VIEW_ROWS } from '../src/game/settings.js';
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
export const SAME_SIZE_RATIO = 1.3;

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
 * Not the `sides` number in the balance table: four kinds ask for a triangle or a hexagon
 * there and then draw themselves something else entirely, and it is the drawing an eye is
 * being asked to read. `render/entities.js` picks one silhouette per kind in `drawEnemy` -
 * `shipPath` for the weaver and the swarmling, its own `dartPath` for the darter, a
 * `bulwarkPath`, a `lensPath`, and a plain `polygon` for the rest - and
 * `test/palette-read.test.mjs` reads that branch and fails this table the day it
 * disagrees, for the reason every other number here is pinned: an audit of a shape nobody
 * draws is a formality. (Session 109 wrote this table by eye and got three of it wrong - it
 * called the weaver, the darter and the swarmling three darts, where the renderer gives one
 * of them a dart and two of them the ship. A wrong shape is a different mistake from a wrong
 * colour and needs a different remedy, which is what the pin is.)
 *
 * Two bodies share the ship's own form, and that is worth saying out loud: the weaver and
 * the swarmling are drawn with `shipPath`, the generic pointed-ship silhouette this game
 * paints its own ships with, ten and seven pixels across. They wear the player's family,
 * so colour and size are all that says "that one is not you" - which is why `promiseOf`
 * asks them for a whole step against the ship and not the 0.55 it asks of a pair whose
 * shapes already differ. `sharedSilhouettes` is the same question asked of the crowd, and
 * the report prints both.
 */
export const BODY_FORMS = {
  drifter: 'triangle',
  weaver: 'ship',
  darter: 'dart',
  spitter: 'pentagon',
  tank: 'hexagon',
  bomber: 'octagon',
  shielder: 'bulwark',
  swarmling: 'ship',
  sniper: 'lens',
};

/**
 * What each silhouette the renderer can pick is called in this table.
 *
 * The test that reads `drawEnemy`'s branch asks this what it means, so the words are in one
 * place: the renderer owns which shape a kind gets, this file owns what that shape is named.
 */
export const PATH_FORMS = {
  shipPath: 'ship',
  dartPath: 'dart',
  bulwarkPath: 'bulwark',
  lensPath: 'lens',
};

/** The same, for the kinds that fall through to a plain polygon: `sides`, named. */
export const POLYGON_FORMS = { 3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon', 8: 'octagon' };

/** One crowd body, as the balance sheet and the renderer draw it. */
function body(type) {
  const stats = BALANCE.kinds[type];
  if (stats === undefined) throw new Error('no enemy kind is called ' + type);
  if (stats.color === undefined) throw new Error('the ' + type + ' has no colour to measure');
  return {
    id: type,
    name: type.toUpperCase(),
    meaning: 'harm',
    form: BODY_FORMS[type],
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
// The opacity the two energy walls are painted at. A wall is not a body: `render/walls.js` and
// `render/boss.js` each lay three strokes down - a soft wash, a mid glow, and the bright line an eye
// actually reads - and all three are translucent. The number here is the bright line's, which is the
// colour an eye is being asked to identify. Held against both renderers by `test/palette-read.test.mjs`,
// the same way the sizes above are.
const WALL_LINE_LIGHT = 0.5;
const CAGE_LINE_LIGHT = 0.62;
// A band - the sniper's beam, a boss's spoke - is three passes down one axis: the full width faint, a
// narrower middle hot, and a nearly white axis on top (render/entities.js `bandPasses`). The row below
// declares the full width as its size, so it is measured at the opacity the full width is painted at,
// which is the least of the three. The hot middle and the axis are brighter and are reported as the
// sight's `core`, and promised nothing, as they always were.
const BAND_FILL = 0.3;
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
    size: BALANCE.kinds.sniper.lock.beam.halfWidth, colour: PALETTE.beamEdge, alpha: BAND_FILL,
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
  { id: 'wall', name: 'THE ENERGY WALL', meaning: 'place', form: 'wall', size: WALL_LINE, colour: PALETTE.wall, alpha: WALL_LINE_LIGHT, from: 'PALETTE.wall' },
  { id: 'cage', name: "A BOSS'S CAGE", meaning: 'place', form: 'wall', size: WALL_LINE, colour: PALETTE.cageWall, alpha: CAGE_LINE_LIGHT, from: 'PALETTE.cageWall' },
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

/** The crowd's sights, in the order the table lists them. */
function crowdSights() {
  return SIGHTS.filter((sight) => BALANCE.kinds[sight.id] !== undefined);
}

/**
 * Which bodies are drawn the same shape, and what each of them has left to say which is which.
 *
 * Sharing a silhouette is allowed - the crowd is nine bodies in the warm half of the wheel and the
 * promise is about harm against help, not about bodies being unlike one another. What is not allowed
 * is sharing a shape and then paying for it with neither size nor colour: two bodies of one shape,
 * one size and one colour are one body, whoever painted them. So every pair in here has to clear a
 * step of colour for the eye with the least to work with, or stand further apart in size than
 * SAME_SIZE_RATIO (which is what `howMuch` calls "the same size"). The report prints this and
 * `--strict` fails it, so the list cannot be quietly grown by a new kind given an old silhouette.
 */
export function sharedSilhouettes() {
  const groups = [];
  for (const sight of crowdSights()) {
    const group = groups.find((each) => each.form === sight.form);
    if (group === undefined) groups.push({ form: sight.form, members: [sight] });
    else group.members.push(sight);
  }
  return groups.filter((group) => group.members.length > 1).map((group) => {
    const pairs = [];
    for (let i = 0; i < group.members.length; i++) {
      for (let j = i + 1; j < group.members.length; j++) {
        const a = group.members[i];
        const b = group.members[j];
        const worst = worstVision(measure(a).lab, measure(b).lab, RED_GREEN_EYES);
        const sizeRatio = Math.max(a.size, b.size) / Math.min(a.size, b.size);
        pairs.push({
          a: a.id,
          b: b.id,
          sizeRatio,
          colour: worst.ratio,
          eyes: visionName(worst.vision),
          carries: worst.ratio >= FULL || sizeRatio > SAME_SIZE_RATIO,
          carriedBy: worst.ratio >= FULL
            ? (sizeRatio > SAME_SIZE_RATIO ? 'both' : 'colour')
            : (sizeRatio > SAME_SIZE_RATIO ? 'size' : 'nothing'),
        });
      }
    }
    return { form: group.form, members: group.members.map((member) => member.id), pairs };
  });
}

/**
 * The bodies drawn with the ship's own silhouette.
 *
 * The one sharing of a shape that can cost a run - a thing wearing your own shape, coming at you -
 * and the reason `howMuch` promises them a whole step against the ship on every axis an eye keeps
 * instead of the 0.55 it asks of a pair whose shapes already differ.
 */
export function shipBorrowers() {
  const ship = SIGHTS.find((sight) => sight.id === 'ship');
  return crowdSights().filter((sight) => sight.form === ship.form);
}

/**
 * A sight as an eye gets it: `lab` for the colour the eye reads, `fillLab` for its wash
 * after it has been laid on the sky, `coreLab` for the highlight in the middle of a shot.
 * A translucent colour is not a colour until it has been put on the thing behind it, so
 * every measurement composites first.
 *
 * A line composites too, and this is the half that used to be missing. Most bodies are painted at full
 * opacity, so their palette entry is what an eye gets; the two energy walls are not - `PALETTE.cageWall`
 * is a near-white and it is laid down at 62% over a near-black sky, where it lands far darker and far
 * greyer than the entry reads. Measured as written, the cage sat 0.13 of a step from the ship for an eye
 * with no red cone, which is what made it look for six sessions like a colour problem. Measured as
 * painted it is 2.3 steps away, which is what it is. An entry says the opacity it is painted with in
 * `alpha`; an entry that says nothing is painted opaque, as it always was.
 */
export function measure(sight) {
  const read = parseColor(sight.colour);
  const line = sight.alpha === undefined
    ? read
    : over(read, sight.alpha, SKY);
  const out = { lab: oklab(line), rgb: line };
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

/** How far a pair is clear of what it was asked to show, worst first. */
export function marginOf(pair) {
  if (!pair.promised) return 99;
  return Math.min(pair.redGreen.ratio - pair.need.redGreen, pair.hueless.ratio - pair.need.hueless);
}

// --- the marks ----------------------------------------------------------------
//
// The palette was measured and it holds (session 109), and a promise about hues is still a promise
// made to eyes a tenth of which do not have the hue it is written in. The MARKS row
// (game/settings.js, painted by render/entities.js) is the second signature those visits can have:
// a small dark centre punched through the things that can end the run, and a small lit one set in the
// middle of the thing the run wants. It is painted *over* the palette, not instead of it, and neither
// of its two colours has a hue worth the name, so it cannot undo the one colour rule the game runs on.
//
// What is measured here is whether that is worth anything, in the same units the palette is measured
// in. A mark is not a colour you can drop into the table and compare as written, because it covers a
// small part of the thing it sits on: a sight is measured with its mark as the *mean* of the two,
// blended by the share of its own middle the mark covers - `ratio * ratio`, the area of a disc of
// that radius over the area of a disc of the sight's own reach. That is deliberately harsh on the
// mark: a pupil of 0.42 r covers about a seventh of a shot's glow, and an eye that can resolve the
// shape at all gets a great deal more out of it than a seventh.

/**
 * How big each mark is, as a share of the thing it sits in the middle of.
 *
 * They are written here because they are part of what is measured, and `test/palette-read.test.mjs`
 * reads them out of `src/render/entities.js` and fails if the two ever disagree - the same rule the
 * sizes are held to, for the same reason: an audit of a picture nobody paints is a formality.
 */
const MARK_PUPIL_RATIO = 0.42;
const MARK_CORE_RATIO = 0.42;

/**
 * The two marks, and which sights they belong to.
 *
 * Only the small fast things: a shot and a shard. A crowd body has a silhouette and a size and a way
 * of walking, a beam is a band of light nothing can be mistaken for, and a wall is where the wall is -
 * which is the same argument `promiseOf` makes about shape, and it is why marking more would be
 * painting the arena for no promise at all.
 */
const MARKS = [
  {
    id: 'pupil', name: 'A DARK CENTRE', colour: PALETTE.markPupil, ratio: MARK_PUPIL_RATIO,
    paints: (sight) => sight.meaning === 'harm' && sight.form === 'dot',
  },
  {
    id: 'spark', name: 'A LIT CENTRE', colour: PALETTE.markCore, ratio: MARK_CORE_RATIO,
    paints: (sight) => sight.meaning === 'help' && sight.form === 'diamond',
  },
];

/** The MARKS row itself, out of the table the game ships. There is no second copy of it here. */
function markRow() {
  const row = VIEW_ROWS.find((each) => each.id === 'marks');
  if (row === undefined) throw new Error('the game has no MARKS row to measure');
  return row;
}

/** The mark a sight carries, or null when the row paints nothing on it. */
export function markFor(sight) {
  for (const mark of MARKS) {
    if (mark.paints(sight)) return mark;
  }
  return null;
}

/** The steps of the row that paint anything, in the order the row prints them. */
export function markSteps() {
  return markRow().steps.filter((step) => step.share > 0);
}

/** The names of the two marks, for a report that wants to say what it painted. */
export function markNames() {
  return MARKS.map((mark) => ({ name: mark.name, colour: mark.colour, ratio: mark.ratio }));
}

/**
 * One sight as an eye gets it with its mark painted on it: the mean of the mark over the sight's own
 * colour, blended by how much of the sight's middle the mark covers and by how solid the visit asked
 * for (`share`). A sight the row does not paint is handed back as it stands.
 */
export function marked(sight, share) {
  const mark = markFor(sight);
  if (mark === null) return sight;
  const coverage = mark.ratio * mark.ratio * share;
  return Object.assign({}, sight, {
    colour: mixColors(sight.colour, mark.colour, coverage),
    mark: mark.name,
    from: sight.from + ' with ' + mark.name.toLowerCase(),
  });
}

/** The whole table with its marks on. */
export function markedSights(share, sights = SIGHTS) {
  return sights.map((sight) => marked(sight, share));
}

/** The two sides of a pair, as a key that survives one of them being a marked copy. */
function pairKey(pair) {
  return pair.a.id + '|' + pair.b.id;
}

/**
 * What the MARKS row is worth, measured one step of it at a time.
 *
 * Three things come back per step, and all three are measured rather than asserted:
 *
 *   `failures`   - a marked thing that no longer clears a promise the unmarked palette keeps. A mark
 *                  is allowed to move a colour, and not allowed to move it onto something else.
 *   `sky`        - a marked thing that has gone so dark it is not visible on the sky at all, which is
 *                  the one way a mark could do harm rather than good.
 *   `needed` / `bought` - the pairs the marks exist for, and how many of them ended up further over
 *                  their bar. The pairs it picks are the ones promised a whole step of *brightness*,
 *                  because that is the promise that says "shape is not enough here", and a mark is
 *                  nothing but shape and brightness. Every one of those pairs has to come out ahead,
 *                  or the row is decoration and should say so.
 */
export function auditMarks(sights = SIGHTS) {
  const off = new Map(auditSights(sights).map((pair) => [pairKey(pair), pair]));
  const out = [];
  for (const step of markSteps()) {
    const painted = markedSights(step.share, sights);
    const pairs = promised(auditSights(painted));
    const needed = [];
    const bought = [];
    for (const pair of pairs) {
      if (pair.need === null || pair.need.hueless < FULL) continue;
      const before = off.get(pairKey(pair));
      if (before === undefined || !before.promised) continue;
      if (markFor(pair.a) === null && markFor(pair.b) === null) continue;
      // The same object goes on both lists, which is what lets a caller ask "was this one bought" by
      // looking for it rather than by re-deriving the rule in two places.
      const each = { pair, before, bought: marginOf(pair) > marginOf(before) };
      needed.push(each);
      if (each.bought) bought.push(each);
    }
    out.push({
      step,
      pairs,
      failures: pairs.filter((pair) => !pair.pass),
      sky: auditSky(painted).filter((row) => row.worst.ratio < row.need),
      needed,
      bought,
    });
  }
  return out;
}
