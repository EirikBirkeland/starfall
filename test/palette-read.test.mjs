// The palette's promises, held.
//
// PLAN section 4 asks for "a colour-blind palette that separates harmful and helpful by brightness
// and shape as well as hue", and PLAN section 6 lists it among the settings a player can turn. This
// file holds the first half - the separation - and `tools/palette-check.js` prints the same numbers
// for a human to argue with. The settings row is the next thing built on this, and NOTES.md for the
// session that writes it will say why the ruler came first: a row with choices nobody measured is a
// dial with no instrument behind it, and the shipped palette had never once been measured.
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
import { oklab, separation } from '../tools/colour-lab.js';
import {
  SIGHTS, SKY, MEANINGS, auditSights, auditSky, auditPair, measure, promiseOf, promised,
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
