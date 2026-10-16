// What the crowd's bodies are drawn as, measured off the paths themselves.
//
// `tools/palette-check.js` prints these numbers for a human to argue with; this file holds them.
// The shapes live in `render/shapes.js` - one entry per kind, drawn by `render/entities.js` - so a
// test here is about the picture an eye is given and not about a word a table writes next to it.
// (That is the whole reason this file exists. `tools/sights.js` used to keep a written-down name
// per kind, session 109 found three of the nine names were wrong, and the fix was not a better
// memory: it was moving the shapes where a test could read them and measuring the outlines.)
//
// Two promises, from two different places:
//
//   **A body is drawn where it is hurt.** A silhouette has to cover most of the circle the balance
//   sheet hurts it by, or shots that land visibly did not land; and it must not stand far outside
//   that circle, or a shot that visibly hit did nothing. `hurtboxFit` measures both.
//
//   **Nine bodies are nine bodies.** Two bodies drawn as one shape have to be paid for by size or
//   by colour - a body that is one shape, one size and one colour with another body is not a
//   second body. That is the audit's rule (`tools/sights.js`) and the ruler behind it is
//   `tools/shape-lab.js`: how far one outline stands from the other, in the world, with the pair
//   allowed to turn against each other.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { CROWD_SHAPES, crowdShape } from '../src/render/shapes.js';
import {
  crowdBodies, crowdPairs, edgeGap, hurtboxFit, profile, COVERS, noseCeiling, NOSE_HEADROOM_R,
  ONE_SHAPE_PX,
} from '../tools/shape-lab.js';
import { BODY_FORMS, SAME_SIZE_RATIO, silhouettePairs, sharedSilhouettes } from '../tools/sights.js';

/* What each body has to cover of its own hurtbox is `COVERS`, in tools/shape-lab.js: the same table
 * `tools/try-body.js` refuses a draft under, because a bar only a test can see is invisible to the
 * tool that draws the proposal up - which is how a session ships a draft it had already measured as
 * too thin. Its reason is written there, next to the ruler that measures it. */

/**
 * How far past its own radius a silhouette may reach.
 *
 * Measured, not written: the crowd's own longest nose plus a little room (`noseCeiling` in
 * `tools/shape-lab.js`, which keeps the reason a nose is the house convention). A body that reaches
 * past it eats shots it never felt, along the very axis the player aims on.
 */
const REACH_AT_MOST_R = noseCeiling();

const bodies = crowdBodies();
const pairs = silhouettePairs();

test('every kind is drawn as exactly one shape, and nothing draws a shape no kind wears', () => {
  assert.deepEqual(Object.keys(CROWD_SHAPES).sort(), Object.keys(BALANCE.kinds).sort(),
    'the shape table and the balance sheet are not the same crowd');
  for (const type of Object.keys(BALANCE.kinds)) {
    assert.equal(crowdShape(type), CROWD_SHAPES[type], 'the ' + type + ' has no shape to draw');
  }
  assert.throws(() => crowdShape('saucer'), /no crowd body is drawn as saucer/);
});

test('every silhouette is drawn where the simulation hurts it', () => {
  assert.deepEqual(Object.keys(COVERS).sort(), Object.keys(BALANCE.kinds).sort(),
    'the coverage table and the crowd are not the same list');
  for (const body of bodies) {
    const fit = hurtboxFit(body.shape, body.r);
    assert.ok(fit.covered >= COVERS[body.type],
      body.type + ' covers ' + (fit.covered * 100).toFixed(0) + '% of the ' + body.r
        + ' px circle it hurts with, and the bar for it is ' + (COVERS[body.type] * 100).toFixed(0)
        + '%; shots that land on it would miss it');
    assert.ok(fit.reachOverR <= REACH_AT_MOST_R,
      body.type + ' reaches ' + fit.reachOverR.toFixed(2) + 'r out and the bar is '
        + REACH_AT_MOST_R + 'r, the crowd\'s own longest nose plus '
        + NOSE_HEADROOM_R + 'r; past that it eats shots it never felt');
  }
});

test('every silhouette is symmetric about the axis it points on', () => {
  // The renderer turns a body by `enemy.rot`, which is the way it is going or the way the ship is
  // (game/kinds.js), so a shape fatter on one side would lean over its own wake - and worse, it
  // could not be read at two different turns as the same body. The bearing profile is the check:
  // mirrored about bearing 0, to a twentieth of a pixel.
  for (const body of bodies) {
    const p = profile(body.shape, body.r);
    for (let i = 1; i < p.length / 2; i++) {
      const mirror = p[p.length - i];
      assert.ok(Math.abs(p[i] - mirror) < 0.05,
        body.type + ' stands ' + p[i].toFixed(2) + ' px out at +' + i + ' bearings and '
          + mirror.toFixed(2) + ' at -' + i);
    }
  }
});

test('every silhouette wraps the middle it is drawn around', () => {
  // A profile of zero on any bearing is a shape that does not close over the origin: a path left
  // open, or one drawn offset, and half the hurtbox would be drawn on one side of it. The same
  // shape is a closed path on the canvas and fills wrong there first, so this is cheap to catch
  // here and expensive to see in the frame.
  for (const body of bodies) {
    const p = profile(body.shape, body.r);
    const thin = [...p.entries()].filter(([, r]) => r < body.r * 0.2);
    assert.deepEqual(thin, [], body.type + "'s outline falls to "
      + (thin.length ? Math.min(...thin.map(([, r]) => r)).toFixed(1) : '?')
      + ' px from the middle, which is not a body drawn around its hurtbox');
  }
});

test('no two bodies are one shape with nothing to tell them apart', () => {
  // The rule, whole: outline, size or colour. A pair with none of the three is one body pretending
  // to be two, and the eye spends shots finding out.
  const unpaid = pairs.filter((pair) => !pair.carries).map((pair) =>
    pair.a + ' / ' + pair.b + ': ' + pair.gap.toFixed(1) + ' px of outline, '
      + pair.sizeRatio.toFixed(2) + 'x of size, ' + pair.colour.toFixed(2)
      + ' of a step of colour on ' + pair.eyes);
  assert.deepEqual(unpaid, []);
});

test('which bodies share a silhouette is a written-down list, not a drift', () => {
  // The same habit as the palette's promise list: a new kind given an old silhouette, or an old one
  // resized or re-coloured into a match, has to be argued with in words here instead of joining
  // quietly. Eleven of the crowd's thirty-six pairs are one shape - it was eight before two bodies
  // were filled out - and every one of them is paid for.
  //
  // Filling a body out to its own hurtbox makes it rounder, and a crowd of nine bodies drawn on nine
  // dark discs has only so much outline to go round: bowing the drifter's faces brought the spitter
  // from 5.3 px to 2.2 and the shielder from 6.7 to 3.9, and filling the darter's head brought the
  // weaver from 4.5 to 3.1. Every one of those pairs is carried by colour - between 1.21 and 2.43 of
  // a step for the worst eye that still has that colour - which is what session 142's brightness
  // visit bought them with, and this list is where the debt is written. It is also why `darter /
  // swarmling` left the list: the fuller spear stands 5.8 px from the shape it used to share.
  //
  // The sniper's own visit re-ordered this list without lengthening it, which is the whole reason it
  // was worth taking: a taller lens stood the eye 2.4 px from a shielder's face and 3.1 from a
  // drifter's corner, and its deeper red paid for each of them at 2.09 to 2.25 of a step. The order
  // below is what the ruler says now, and the one pair it bought elsewhere is in the test after this.
  assert.deepEqual(sharedSilhouettes().map((pair) =>
    pair.a + ' / ' + pair.b + ' - ' + pair.carriedBy), [
    'drifter / weaver - both',
    'spitter / sniper - colour',
    'drifter / spitter - colour',
    'shielder / sniper - colour',
    'weaver / spitter - both',
    'spitter / shielder - colour',
    'weaver / darter - colour',
    'drifter / sniper - colour',
    'drifter / darter - both',
    'weaver / sniper - both',
    'drifter / shielder - colour',
  ]);
  for (const pair of sharedSilhouettes()) {
    assert.ok(pair.gap <= ONE_SHAPE_PX, pair.a + ' / ' + pair.b + ' is not one shape at all');
    assert.ok(pair.sizeRatio > SAME_SIZE_RATIO || pair.colour >= 1,
      pair.a + ' / ' + pair.b + ' is carried by neither size nor colour');
  }
});

test('what hangs on a thin outline alone is a written-down list too', () => {
  // Over the bar and not by much, with no colour and no size behind it: two pairs. They are not
  // failed - a still picture cannot see a lunge, a weave, or twenty bodies bunching up to dive, and
  // every one of them is a body whose walking is the loudest thing about it (a mine that turns and
  // breathes, a bomber that is the attack) - but they are the thinnest ice in the crowd and this is
  // where a session is told so.
  //
  // The weaver and the darter used to be on this list, a pink and a coral 0.43 of a step apart on an
  // eye with no blue cone and 4.5 px of outline apart. Session 142 moved four crowd entries in
  // brightness and the pair came out at 1.21 of a step, and filling the darter's head a session later
  // took its outline from 4.5 px to 3.1 - so the pair is a shared silhouette now, carried by colour,
  // and it is not here. Three more pairs crossed into one shape with it and none of them landed here.
  //
  // `bomber / sniper` just left, and it is the pair the sniper's deeper red was for: a mine of studs
  // and an eye 4.2 px of outline apart were 0.92 of a step apart in colour, and they are 1.49 now.
  const thinly = pairs.filter((pair) => pair.carriedBy === 'thinly')
    .map((pair) => pair.a + ' / ' + pair.b);
  assert.deepEqual(thinly, ['bomber / shielder', 'spitter / bomber']);
});

test('the ruler can say "one shape", or "different" means nothing', () => {
  // A test suite that cannot go red is decoration. Give the bomber the drifter's triangle at the
  // drifter's size and the outline has to come out at nothing, and the pair list has to notice.
  const drifter = bodies.find((body) => body.type === 'drifter');
  const clone = { type: 'bomber', r: drifter.r, shape: crowdShape('drifter') };
  const gap = edgeGap(drifter, clone);
  assert.ok(gap.mean < 0.01, 'two identical outlines read as ' + gap.mean.toFixed(2) + ' px apart');
  const swapped = crowdBodies().map((body) => (body.type === 'bomber' ? clone : body));
  const rows = crowdPairs(swapped).filter((row) => row.a === 'bomber' || row.b === 'bomber');
  assert.ok(rows.some((row) => row.same), 'the ruler let a cloned silhouette through');
});

test('the names the report prints are names for shapes that exist', () => {
  // One word per body, every word used, and one word never written over two shapes the ruler can
  // tell apart - which is the exact way the old hand-written table lied: it named a pentagon and a
  // hexagon two forms and the audit believed it, and it named three darts where the renderer drew
  // one. The renderer is the truth now and this is only about words.
  const kinds = Object.keys(BALANCE.kinds);
  assert.deepEqual(Object.keys(BODY_FORMS).sort(), kinds.slice().sort(),
    'the form names and the crowd are not the same list');
  for (const name of new Set(Object.values(BODY_FORMS))) {
    const wearers = kinds.filter((kind) => BODY_FORMS[kind] === name);
    for (let i = 0; i < wearers.length; i++) {
      for (let j = i + 1; j < wearers.length; j++) {
        const a = bodies.find((body) => body.type === wearers[i]);
        const b = bodies.find((body) => body.type === wearers[j]);
        const gap = edgeGap(a, b);
        assert.ok(gap.mean <= ONE_SHAPE_PX, wearers[i] + ' and ' + wearers[j] + ' are both called '
          + name + ' and their outlines stand ' + gap.mean.toFixed(1) + ' px apart');
      }
    }
  }
});
