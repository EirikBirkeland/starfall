// The palette's promises, held.
//
// PLAN section 4 asks for "a colour-blind palette that separates harmful and helpful by brightness
// and shape as well as hue", and PLAN section 6 lists it among the settings a player can turn. This
// file holds both halves: the separation the game ships with, and the MARKS row a visit can put on top
// of it. `tools/palette-check.js` prints the same numbers for a human to argue with. The ruler came
// first on purpose (session 108 parked it, session 109 measured with it): a row with choices nobody
// measured is a dial with no instrument behind it, and the shipped palette had never once been measured.
//
// Everything here is measured, not remembered: no test in this file names a hex value or asserts
// that a colour is what it was last Tuesday. Re-aim a colour and these tests move with it, which is
// the point - they are about what an eye is given, not about what the source spells.
//
// `tools/sights.js` is the question and `tools/colour-lab.js` is the ruler; the long comments at the
// top of those two say what every number below means and why the bar sits where it does.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PALETTE, parseColor } from '../src/core/palette.js';
import { BALANCE } from '../src/game/balance.js';
import { oklab, oklch, separation } from '../tools/colour-lab.js';
import {
  SIGHTS, SKY, MEANINGS, BODY_FORMS, PATH_FORMS, POLYGON_FORMS, SAME_SIZE_RATIO,
  auditSights, auditSky, auditPair, auditMarks, markFor, markNames,
  marked, measure, promiseOf, promised, marginOf, sharedSilhouettes, shipBorrowers,
} from '../tools/sights.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const pairs = auditSights();
const promisedPairs = promised(pairs);

const sightOf = (id) => SIGHTS.find((s) => s.id === id);

/** The same failure list the report prints, so a red test says what a red report would say. */
function failing(list) {
  return list.filter((p) => !p.pass).map((p) => p.a.id + ' / ' + p.b.id
    + ': red-green ' + p.redGreen.ratio.toFixed(2) + ' (needed ' + p.need.redGreen
    + ', worst eye: ' + p.redGreen.vision + '), no hue ' + p.hueless.ratio.toFixed(2)
    + ' (needed ' + p.need.hueless + ')');
}

test('every enemy the game can spawn is in the table', () => {
  // The audit is only worth as much as its table. A new kind that is not measured is a new kind
  // nobody has ever checked, and the silence would look like a pass - so the crowd is asked who
  // is in it, rather than being listed by hand.
  for (const kind of Object.keys(BALANCE.kinds)) {
    assert.ok(sightOf(kind) !== undefined, 'the ' + kind + ' is not in tools/sights.js');
    assert.equal(sightOf(kind).meaning, 'harm', kind + ' walks at you, so it is harm');
  }
  // And nothing is in the table that the game has never heard of.
  for (const sight of SIGHTS) {
    if (BALANCE.kinds[sight.id] === undefined) continue;
    assert.equal(sight.colour, BALANCE.kinds[sight.id].color, sight.id + ' is measured in a different colour than it is drawn');
  }
});

test('every sight is a thing, with a meaning, a shape, a size and a colour', () => {
  for (const sight of SIGHTS) {
    assert.ok(MEANINGS[sight.meaning] !== undefined, sight.id + ' has a meaning nobody defines');
    assert.equal(typeof sight.form, 'string');
    assert.ok(sight.form.length > 0);
    assert.ok(Number.isFinite(sight.size) && sight.size > 0, sight.id + ' has no size to compare');
    assert.equal(parseColor(sight.colour).length, 3, sight.id + ' carries a colour that does not parse');
    assert.ok(sight.name === sight.name.toUpperCase(), sight.id + ' is named in caps, like everything the interface says');
  }
});

test('the sizes the table measures are the sizes the renderer draws', () => {
  // Three of these live in render/entities.js and are written down again in tools/sights.js,
  // because tools/ may not import the renderer. Read straight out of the source, a change there
  // fails here the same day instead of quietly making the audit measure a thing that is not drawn.
  const source = fs.readFileSync(path.join(ROOT, 'src/render/entities.js'), 'utf8');
  const constant = (name) => {
    const found = new RegExp('const ' + name + ' = ([\\d.]+);').exec(source);
    assert.ok(found !== null, 'render/entities.js no longer has a const ' + name + ' to read');
    return Number(found[1]);
  };
  assert.equal(sightOf('shard').size, constant('SHARD_BODY'));
  assert.equal(sightOf('bigShard').size, constant('BIG_SHARD_BODY'));
  assert.equal(sightOf('mine').size, constant('MINE_BODY') + constant('MINE_SPIKE'));
  // And the ones read out of the balance sheet, spelled out so a rename in balance.js is a failure.
  assert.equal(sightOf('ship').size, BALANCE.player.drawRadius);
  assert.equal(sightOf('playerShot').size, BALANCE.bullets.hitRadius);
  assert.equal(sightOf('enemyShot').size, BALANCE.kinds.spitter.spit.shot.radius);
});

test('the opacity the table measures is the opacity the renderer paints', () => {
  // The two energy walls are the only sights in the table that are not painted at full opacity, and
  // the whole point of measuring them is that the palette entry is not what an eye gets. So the
  // opacity is written down in the table and read back out of both renderers here, the same way the
  // sizes above are read out of `render/entities.js`.
  const read = (file, name) => {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const found = new RegExp('const ' + name + ' = ([\\d.]+);').exec(source);
    assert.ok(found !== null, file + ' no longer has a const ' + name + ' to read');
    return Number(found[1]);
  };
  assert.equal(sightOf('wall').alpha, read('src/render/walls.js', 'LINE_LIGHT'));
  assert.equal(sightOf('cage').alpha, read('src/render/boss.js', 'CAGE_LINE_LIGHT'));
});

test('a translucent sight is measured as painted, not as written', () => {
  // The reason the cage spent six sessions looking like a colour problem. `PALETTE.cageWall` is a
  // near-white; it is laid down at 62% over a near-black sky, where it lands far darker and far
  // greyer than the entry reads. Measured as written it sat 0.13 of a step from the ship for an eye
  // with no red cone. Measured as painted it is nowhere near the ship, and the number that gets
  // printed is the one an eye is actually given.
  const cage = sightOf('cage');
  const ship = sightOf('ship');
  assert.ok(cage.alpha !== undefined && cage.alpha > 0 && cage.alpha < 1,
    'the cage is painted translucent, so the table has to say at what opacity');

  const painted = measure(cage);
  const asWritten = { colour: cage.colour, form: cage.form, size: cage.size, meaning: cage.meaning };
  const worse = worstOf(ship, painted.lab);
  const written = worstOf(ship, measure(asWritten).lab);
  assert.ok(worse.ratio > written.ratio + 1,
    'compositing the cage over the sky is worth a real difference, not a rounding: '
    + written.ratio.toFixed(2) + ' as written, ' + worse.ratio.toFixed(2) + ' as painted');
  assert.ok(worse.ratio >= 1, 'and an eye with no red cone is handed a difference to see');
});

/** The worst red-green eye for a sight against an already-measured colour. */
function worstOf(sight, lab) {
  const m = measure(sight);
  let worst = null;
  for (const eye of ['protanopia', 'deuteranopia', 'tritanopia']) {
    const s = separation(eye, m.lab, lab);
    if (worst === null || s.ratio < worst.ratio) worst = Object.assign({ vision: eye }, s);
  }
  return worst;
}

test('the silhouettes the table measures are the silhouettes the renderer draws', () => {
  // The same rule as the sizes, for the other half of the shape: `tools/` may not import the
  // renderer, so the forms are written down again in `BODY_FORMS` and read out of the source
  // here. Session 109 wrote that table by eye and got three rows of it wrong - it called the
  // weaver, the darter and the swarmling three darts, where `drawEnemy` gives one of them a dart
  // and two of them the ship - and everything built on it was about a picture nobody paints.
  const source = fs.readFileSync(path.join(ROOT, 'src/render/entities.js'), 'utf8');
  // The branch is `if (enemy.type === 'weaver') shipPath(...)`. The other four places the file
  // asks a body's type name are followed by a block and not a call, so they do not answer here.
  const drawn = new Map();
  for (const [, kind, paint] of source.matchAll(/enemy\.type === '(\w+)'\)\s+(\w+)\(/g)) {
    assert.ok(PATH_FORMS[paint] !== undefined, 'drawEnemy gives the ' + kind + ' a ' + paint
      + ', which tools/sights.js has no name for');
    drawn.set(kind, PATH_FORMS[paint]);
  }
  assert.ok(drawn.size >= 4, 'drawEnemy has stopped choosing silhouettes by kind');
  // Everything else falls through to a plain polygon, whose form is its side count.
  assert.match(source, /else polygon\(ctx, 0, 0, enemy\.r, look\.sides, 0\);/,
    'drawEnemy no longer falls through to a polygon, so this test has to learn what it falls through to');
  for (const [kind, stats] of Object.entries(BALANCE.kinds)) {
    const form = drawn.has(kind) ? drawn.get(kind) : POLYGON_FORMS[stats.sides];
    assert.ok(form !== undefined, 'the ' + kind + ' asks for ' + stats.sides
      + ' sides, which has no name in tools/sights.js');
    assert.equal(BODY_FORMS[kind], form,
      'the ' + kind + ' is measured as a ' + BODY_FORMS[kind] + ' and drawn as a ' + form);
  }
});

test('nothing that can hurt you is the colour of nothing that can help you', () => {
  // The promise, whole: every pair that carries one clears it. This is the line a palette change
  // trips over, and the only one that has to hold for the game to ship.
  assert.deepEqual(failing(promisedPairs), []);
});

test('a shard is never mistaken for a threat', () => {
  // The one pair worth more than the rest, picked out so that a regression names itself: the shard
  // is the only thing in the arena the run wants to touch, and it is small. Against the small warm
  // things that fly at it - a swarmling, a shot - colour is nearly all the eye gets.
  for (const harm of SIGHTS.filter((s) => s.meaning === 'harm' && s.size <= 12)) {
    for (const shard of ['shard', 'bigShard']) {
      const pair = auditPairOf(shard, harm.id);
      assert.ok(pair.promised, shard + ' / ' + harm.id + ' should carry a promise');
      assert.ok(pair.redGreen.ratio >= 1,
        shard + ' and ' + harm.id + ' are one colour to a ' + pair.redGreen.vision);
    }
  }
});

test('their shot is not your shot', () => {
  // The other life-or-death pair: the crowd's shot and the ship's are the two small fast things on
  // the glass, and every assist in the game (auto-aim, auto-fire, the vacuum) leans on the player
  // knowing which side a dot belongs to.
  const theirs = auditPairOf('enemyShot', 'playerShot');
  assert.ok(theirs.redGreen.ratio >= 1, 'a red-green eye cannot tell your shot from theirs');
  assert.ok(theirs.hueless.ratio >= 1, 'nor can an eye with no hue: they are the same brightness');
  // The beam is the widest thing the crowd throws, and it is nearly white down the middle - the one
  // place the game spends near-white on harm, which is why it is worth its own line here.
  const beam = auditPairOf('beam', 'playerShot');
  assert.ok(beam.pass, 'the beam and your own shot are ' + beam.redGreen.ratio.toFixed(2) + ' apart');
});

test('every sight can be seen at all', () => {
  // The promise that is not about telling two things apart. A body the colour of the sky behind it
  // is not separated from anything - and a translucent fill that washes out to nothing is a body
  // drawn as a hole in the background.
  assert.deepEqual(auditSky().filter((row) => row.worst.ratio < row.need)
    .map((row) => row.sight.id + ' ' + row.part + ' is ' + row.worst.ratio.toFixed(2)
      + ' of a step from the sky on ' + row.worst.vision), []);
});

test('what is promised, and what is not', () => {
  // The rule itself, held in place, because it is the part a later session is tempted to quietly
  // soften: the promise is only made where being wrong costs the run, and where the shape cannot
  // tell the pair apart the colour has to.
  assert.equal(promiseOf(sightOf('drifter'), sightOf('darter')), null, 'two harms are not promised anything');
  assert.equal(promiseOf(sightOf('shard'), sightOf('playerShot')), null, 'a help and a self are not promised anything');
  assert.equal(promiseOf(sightOf('shard'), sightOf('bigShard')), null, 'one thing at two sizes is not promised anything');
  assert.equal(promiseOf(sightOf('shard'), sightOf('wall')), null, 'a wall cannot hurt you, and a shard is not a hazard');
  assert.equal(promiseOf(sightOf('darter'), sightOf('wall')).hueless, 0, 'a wall is where the wall is');
  // A far pair (a band of light and a small diamond) is given hue to carry and not brightness...
  const far = promiseOf(sightOf('beam'), sightOf('shard'));
  assert.equal(far.hueless, 0);
  assert.ok(far.redGreen > 0 && far.redGreen < 1);
  // ...and an alike pair is given both, at a full step.
  const alike = promiseOf(sightOf('enemyShot'), sightOf('shard'));
  assert.equal(alike.redGreen, 1);
  assert.equal(alike.hueless, 1);
});

test('what shares a silhouette pays for it with size or with colour', () => {
  // Nine bodies in the warm half of the wheel cannot all be a different shape as well as a
  // different colour, and the promise is about harm against help and not about bodies being
  // unlike one another. What is not allowed is a shared silhouette paid for by neither: two
  // bodies of one shape, one size and one colour are one body whoever painted them. So every
  // pair here has to clear a step of colour, or stand further apart in size than the audit
  // calls "the same size" - and the list is pinned, because a new kind given an old silhouette
  // has to be written down in words rather than join a group unnoticed.
  const groups = sharedSilhouettes();
  assert.deepEqual(groups.map((group) => group.form + ': ' + group.members.join(', ')), [
    'ship: weaver, swarmling',
  ]);
  const unpaid = [];
  for (const group of groups) {
    for (const pair of group.pairs) {
      if (pair.carries) continue;
      unpaid.push(pair.a + ' / ' + pair.b + ' are ' + pair.sizeRatio.toFixed(2)
        + 'x apart in size and ' + pair.colour.toFixed(2) + ' of a step in colour');
    }
  }
  assert.deepEqual(unpaid, []);
  // And the size bar is the audit's own and not a number invented here.
  for (const group of groups) {
    for (const pair of group.pairs) {
      if (pair.carriedBy !== 'size') continue;
      assert.ok(pair.sizeRatio > SAME_SIZE_RATIO, pair.a + ' / ' + pair.b
        + ' is carried by size and the audit does not even call them the same size');
      assert.ok(pair.colour < 1, pair.a + ' / ' + pair.b
        + ' is called a size pair but colour does the job on its own (a step is 1)');
    }
  }
});

test("what wears the ship's own silhouette is a whole step from the ship", () => {
  // The one sharing of a shape that can cost a run: a warm body drawn with `shipPath`, the
  // generic pointed ship the game paints its own ships with (render/entities.js), coming at the
  // ship ten and seven pixels across. `howMuch` sees one form and asks for a full step on every
  // axis every eye keeps - hue for the colour-blind eye and brightness for the one with no hue at
  // all - and this is where a re-coloured crowd trips over it.
  const borrowers = shipBorrowers();
  assert.ok(borrowers.length >= 1, 'the table says nothing wears the shape the ship wears');
  const ship = sightOf('ship');
  for (const sight of borrowers) {
    const pair = auditPair(sight, ship);
    assert.ok(pair.promised, sight.id + ' borrows the shape the ship wears and carries no promise');
    assert.equal(pair.need.redGreen, 1, sight.id + ' is promised less than a step of hue');
    assert.equal(pair.need.hueless, 1, sight.id + ' is promised less than a step of brightness');
    assert.ok(pair.pass, sight.id + ' is ' + pair.redGreen.ratio.toFixed(2)
      + ' from the ship for a red-green eye and ' + pair.hueless.ratio.toFixed(2)
      + ' for an eye with no hue at all: ' + pair.need.why);
  }
});

test('the promise can fail - it is a guard and not a formality', () => {
  // A test suite that cannot go red is decoration. Paint a shard in the colour of an enemy's shot,
  // and say so: two sights of different meaning, one form, one size, one colour, is the exact case
  // the rule exists to catch.
  const painted = {
    id: 'wrongShard', name: 'A SHARD PAINTED WRONG', meaning: 'help',
    form: 'diamond', size: 5.4, colour: PALETTE.enemyShot, from: 'a test',
  };
  const pair = auditPair(painted, sightOf('enemyShot'));
  assert.equal(pair.promised, true, 'a help and a harm alike in shape must carry a promise');
  assert.equal(pair.pass, false, 'and the same colour on both of them must not clear it');
});

test('the crowd shares colours, and says which pairs do', () => {
  // Nine bodies cannot all be a step apart inside the warm half of the wheel, and they do not need
  // to be: silhouette, size and the way a body walks do most of the telling, and the audit prints
  // these pairs under their own heading instead of judging them (see tools/sights.js).
  //
  // What this test holds is that the list stays the list. A new kind that lands on top of an
  // existing one has to be written down here, in words, rather than passing unnoticed - and the
  // day somebody re-silhouettes those bodies and the list shortens, that is a better palette.
  const crowded = [];
  const bodies = SIGHTS.filter((s) => BALANCE.kinds[s.id] !== undefined);
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const best = separation('normal', measure(bodies[i]).lab, measure(bodies[j]).lab).ratio;
      if (best < 1) crowded.push(bodies[i].id + ' / ' + bodies[j].id);
    }
  }
  assert.deepEqual(crowded.sort(), [
    'bomber / swarmling',
    'darter / swarmling',
    'spitter / bomber',
    'swarmling / sniper',
  ]);
});

test('the table is measured against the middle of the sky the game paints', () => {
  // The audit composites every translucent sight over `SKY`, and the sky is a vertical gradient -
  // so the one thing worth pinning is that the colour being used is the middle of that gradient and
  // not one of its ends. A body is drawn somewhere between them, and the middle is the nearest thing
  // to an average anybody can measure against.
  const lift = (colour) => oklab(parseColor(colour)).L;
  assert.ok(lift(PALETTE.bgBottom) < oklab(SKY).L, 'the bottom of the sky has overtaken its middle');
  assert.ok(oklab(SKY).L < lift(PALETTE.bgTop), 'the top of the sky has fallen below its middle');
  assert.ok(oklab(SKY).L < 0.2, 'the sky has gone bright enough that the audit is measuring a new picture');
});

/** One pair out of the table, by id, with a loud complaint if either id is a typo. */
function auditPairOf(aId, bId) {
  const a = sightOf(aId);
  const b = sightOf(bId);
  assert.ok(a !== undefined, 'no sight is called ' + aId);
  assert.ok(b !== undefined, 'no sight is called ' + bId);
  return auditPair(a, b);
}

// --- the MARKS row -------------------------------------------------------------
//
// The palette holds on its own (every test above is about the game as it shipped). What these hold is
// the second signature a visit can *ask for* on top of it - a dark centre on the small things that can
// end the run, a lit one on the thing the run wants - in the same units, on the same table, measured
// one step of the row at a time. `tools/sights.js` says what a mark is and what it is for; the short
// version is that a mark is nothing but shape and brightness, which is exactly what PLAN section 6 asks
// the palette to separate harm from help with when the hue is not available.

test('every step of the marks row clears every promise the palette makes', () => {
  const steps = auditMarks();
  assert.ok(steps.length > 0, 'the row offers a step that paints anything, or there is nothing to measure');
  for (const one of steps) {
    assert.deepEqual(failing(one.pairs), [],
      'MARKS ' + one.step.words + ' broke a promise the shipped palette keeps');
    assert.deepEqual(one.sky.map((row) => row.sight.id + ' ' + row.part + ' is ' + row.worst.ratio.toFixed(2)
      + ' of a step from the sky'), [],
      'MARKS ' + one.step.words + ' put something so dark on the arena it cannot be seen on it');
  }
});

test('a mark buys margin exactly where the palette was shortest', () => {
  // The pairs it picks are the ones promised a whole step of *brightness* - the promise that says
  // "shape is not enough here" - and only the ones a mark is actually painted on. If any of them comes
  // out no further over its bar than it was, the mark is decoration and this test says so.
  for (const one of auditMarks()) {
    assert.ok(one.needed.length >= 2, 'the audit found the pairs the marks are for, and found '
      + one.needed.length + ' at ' + one.step.words);
    const missed = one.needed.filter((each) => !each.bought)
      .map((each) => each.pair.a.id + ' / ' + each.pair.b.id + ' was ' + marginOf(each.before).toFixed(2)
        + ' and is ' + marginOf(each.pair).toFixed(2));
    assert.deepEqual(missed, [], 'MARKS ' + one.step.words + ' bought nothing for: ' + missed.join(', '));
  }
});

test('the two pairs the shipped palette was shortest on are not short any more', () => {
  // Session 109 measured the shipped palette and named the two thinnest promises: a shard against an
  // enemy's shot, and their shot against yours. This is what the row was built for, so it is measured
  // at the faintest step the row offers - the full step is the same two colours with more ink in them.
  //
  // What is asserted is the pair's margin (how far its worst eye is clear of what that eye was asked
  // for) and the eye with no hue, because that is what a mark is *for*. A red-green eye can lose a hair
  // on the axis it was already a long way clear on - a mark takes a little saturation out of a warm dot
  // to put a hole in it - and the test above is what says that trade is bounded: the pair still clears
  // its bar on every eye, at every step the row offers.
  const faint = auditMarks()[0];
  for (const [aId, bId] of [['enemyShot', 'shard'], ['enemyShot', 'playerShot']]) {
    const before = auditPairOf(aId, bId);
    assert.ok(before.pass, 'the shipped palette has to hold up on its own too: ' + aId + ' / ' + bId);
    const pair = onePair(faint, aId, bId);
    assert.ok(marginOf(pair) > marginOf(before),
      aId + ' / ' + bId + ' was ' + marginOf(before).toFixed(2)
      + ' clear of its bar and is ' + marginOf(pair).toFixed(2) + ' with the marks on');
    assert.ok(pair.hueless.ratio >= before.hueless.ratio + 0.4,
      aId + ' / ' + bId + ' with no hue at all: ' + before.hueless.ratio.toFixed(2)
      + ' unmarked, ' + pair.hueless.ratio.toFixed(2) + ' with the marks on');
  }
});

test('a mark goes on the two things an eye is asked to decide between, and on nothing else', () => {
  // The rule the painter paints by (render/entities.js) and the rule the audit measures by are this one
  // sentence: the harm that is a dot gets a dark centre, the help that is a diamond gets a lit one.
  assert.ok(markFor(sightOf('enemyShot')), "an enemy's shot is the small warm thing a shard is mistaken for");
  assert.ok(markFor(sightOf('shard')), 'and a shard is the thing it is mistaken for');
  assert.ok(markFor(sightOf('bigShard')), 'the same shard at twice the size');

  assert.equal(markFor(sightOf('playerShot')), null,
    "the ship's own shot is already the lit half of the pair");
  assert.equal(markFor(sightOf('ship')), null, 'the ship is not a thing anybody mistakes for a shard');
  assert.equal(markFor(sightOf('beam')), null, 'a band of light is not a dot');
  assert.equal(markFor(sightOf('blastZone')), null, 'nor is a zone of floor paint');
  assert.equal(markFor(sightOf('mine')), null, 'the ship owns its own mines');
  assert.equal(markFor(sightOf('wall')), null, 'a wall is where the wall is');
  assert.equal(markFor(sightOf('cage')), null);
  for (const sight of SIGHTS) {
    if (BALANCE.kinds[sight.id] === undefined) continue;
    assert.equal(markFor(sight), null, sight.id + ' has a silhouette, a size and a way of walking');
  }
});

test('a mark is a shade and not a colour', () => {
  // The whole reason the row can exist without a second palette: it puts light where there was less of
  // it and less where there was more, and it leaves the hue alone - so it cannot undo the one colour
  // rule the game does run on (warm is harm, cool is help, PLAN section 4).
  for (const sight of SIGHTS) {
    if (markFor(sight) === null) continue;
    const before = oklch(parseColor(sight.colour));
    const after = oklch(parseColor(marked(sight, 1).colour));
    let swing = Math.abs(before.h - after.h);
    if (swing > 180) swing = 360 - swing;
    assert.ok(swing < 4, sight.id + ' swung ' + swing.toFixed(1) + ' degrees of hue, which is a colour');
  }
  // ...and the lightness is where the money is, or the mark is invisible.
  const shot = oklch(parseColor(PALETTE.enemyShot));
  const markedShot = oklch(parseColor(marked(sightOf('enemyShot'), 1).colour));
  assert.ok(markedShot.L < shot.L - 0.04,
    'a marked shot is a good deal darker through the middle: ' + markedShot.L.toFixed(3)
    + ' against ' + shot.L.toFixed(3));
  const shard = oklch(parseColor(PALETTE.shard));
  const markedShard = oklch(parseColor(marked(sightOf('shard'), 1).colour));
  assert.ok(markedShard.L > shard.L, 'and a marked shard brighter: ' + markedShard.L.toFixed(3)
    + ' against ' + shard.L.toFixed(3));
});

test('the marks the audit measures are the marks the game paints', () => {
  // The sizes are pinned the same way the bodies' are, and for the same reason: an audit of a picture
  // nobody paints is a formality. The two ratios are read out of the renderer and the two colours out
  // of the palette it paints with, and the paint is looked for in the source.
  const source = fs.readFileSync(path.join(ROOT, 'src/render/entities.js'), 'utf8');
  const constant = (name) => {
    const found = new RegExp('const ' + name + ' = ([\\d.]+);').exec(source);
    assert.ok(found !== null, 'render/entities.js no longer has a const ' + name + ' to read');
    return Number(found[1]);
  };
  const names = markNames();
  assert.equal(names.length, 2, 'a dark centre and a lit one');
  assert.equal(names[0].ratio, constant('MARK_PUPIL_RATIO'), 'the pupil the audit measures is the one drawn');
  assert.equal(names[1].ratio, constant('MARK_CORE_RATIO'), 'and so is the spark');
  assert.equal(names[0].colour, PALETTE.markPupil);
  assert.equal(names[1].colour, PALETTE.markCore);
  assert.match(source, /PALETTE\.markPupil/, 'the renderer stopped punching pupils');
  assert.match(source, /PALETTE\.markCore/, 'and stopped lighting shards');
  // Both colours have to parse, like every other colour in the game (test/palette.test.mjs), and neither
  // may be a colour in any meaningful sense: see the test above about a mark being a shade.
  assert.equal(parseColor(PALETTE.markPupil).length, 3);
  assert.equal(parseColor(PALETTE.markCore).length, 3);
});

/** One promised pair out of a marks audit, by the two sight ids. */
function onePair(stepAudit, aId, bId) {
  const pair = stepAudit.pairs.find((p) => (p.a.id === aId && p.b.id === bId)
    || (p.a.id === bId && p.b.id === aId));
  assert.ok(pair !== undefined, 'the marks audit did not measure ' + aId + ' / ' + bId);
  assert.ok(pair.promised, aId + ' / ' + bId + ' carries no promise to buy anything on');
  return pair;
}
