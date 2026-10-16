// The ruler for silhouettes itself, and the report it prints (tools/shape-lab.js).
//
// `test/crowd-art.test.mjs` uses this ruler to hold the crowd to two promises. This file holds the
// ruler: that it measures what it says it measures, that it cannot be quietly blinded, and that the
// command line refuses what it should before it prints anything.
//
// The reason a ruler needs its own tests at all is the one session 140 wrote down after shipping a
// ladder that tripped its own check: a test that reads what the code says goes green while the thing
// it was supposed to measure is wrong. So the checks here are against shapes whose answers are known
// from the geometry and not from the code - a disc covers a disc, a half-square covers half of one,
// a square of 10 px has a diagonal of 14.14 px - and a clone always reads as nothing apart.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { TAU } from '../src/core/math.js';
import { BALANCE } from '../src/game/balance.js';
import { bulged, lobed, plainPolygon, studded } from '../src/render/shapes.js';
import {
  outline, extent, profile, edgeGap, oneShape, hurtboxFit, hurtboxArt, fitRows, crowdBodies,
  crowdPairs, crowdBody, inscribedShare, ONE_SHAPE_PX, THIN_SHAPE_PX,
} from '../tools/shape-lab.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'shape-lab.js');

function shapeLab(args) {
  return spawnSync(process.execPath, [TOOL, ...args], { cwd: ROOT, encoding: 'utf8' });
}

/** A disc, drawn as the four quadrant arcs the canvas would take. */
function disc(ctx, r) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.closePath();
}

/** A rectangle from the origin out to (w, h), for answers that can be worked out by hand. */
function rect(w, h) {
  return (ctx, unusedR) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
  };
}

test('a body drawn as its own hurtbox covers it, and nothing covers more than that', () => {
  const fit = hurtboxFit(disc, 20);
  // Not exactly 1.0: the ruler flattens a curve into a 32-gon (pathRecorder), and an inscribed
  // 32-gon is 0.4% smaller than the circle it stands in.
  assert.ok(fit.covered > 0.985, 'a disc covers ' + (fit.covered * 100).toFixed(1) + '% of itself');
  assert.ok(Math.abs(fit.reachOverR - 1) < 0.05, 'a disc reaches ' + fit.reachOverR.toFixed(2) + 'r');

  // A square from the middle out to two radii, up and to the right: a quarter of the disc.
  const quarter = hurtboxFit(rect(20, 20), 20);
  assert.ok(Math.abs(quarter.covered - 0.25) < 0.02,
    'a quarter of the disc drawn reads as ' + (quarter.covered * 100).toFixed(1) + '%');

  // A body drawn at a fifth of the circle it hurts with is the bug the floor is for.
  const dot = hurtboxFit(rect(4, 4), 20);
  assert.ok(dot.covered < 0.02, 'a 4 px square in a 20 px hurtbox covers too much already');
});

test('the reach is the furthest the drawing stands out, in the body\'s own units', () => {
  // A 10x10 square standing in the +x quarter from the origin: the corner is at 14.14 px, and it
  // is drawn at r = 10, so it reaches 1.41r out - exactly the over-draw a body may not have.
  const ext = extent(rect(10, 10), 10);
  assert.ok(Math.abs(ext.reach - Math.SQRT2 * 10) < 0.01, 'reach ' + ext.reach.toFixed(2));
  assert.equal(Math.round(ext.forward), 10);
  assert.equal(Math.round(ext.side), 10);
});

test('a profile is the outline seen as an edge, and it closes over the middle', () => {
  const p = profile(disc, 12);
  assert.equal(p.length, 96);
  const far = Math.max(...p), near = Math.min(...p);
  assert.ok(Math.abs(far - 12) < 0.05, 'a disc stands ' + far.toFixed(2) + ' out at best');
  assert.ok((far - near) / far < 0.01, 'a disc wobbles between ' + near.toFixed(2) + ' and '
    + far.toFixed(2) + '; a curve is flattened to a 32-gon, not to a wobble');

  // A shape that does not wrap the origin shows up as a bearing that reads nothing: an open or
  // offset path, which is a body drawn half off its own hurtbox.
  const offset = (ctx, r) => {
    ctx.beginPath();
    ctx.arc(r * 2, 0, r * 0.4, 0, TAU);
    ctx.closePath();
  };
  assert.ok(profile(offset, 12).some((r) => r === 0),
    'a body drawn beside the middle read as wrapping it');
});

test('a corner that lands exactly on a sampled bearing is still outline', () => {
  // The profile is read along 96 bearings, and a regular polygon has a corner exactly on one of
  // them: a hexagon's sits at 300 degrees, which is bearing 80 of 96. The crossing there belongs to
  // both of the segments that meet at the corner - at the very end of one and the very start of the
  // other - and the arithmetic puts each a ulp or two outside its own `[0,1]`, so a strict test
  // refused both and the body was left with a bearing where it had no outline at all.
  //
  // Whether a given shape trips it depends on its radius as well as its corner, and the answer
  // moves with a pixel: the tank's own hexagon is clean at the 26 px it ships at and lost the
  // bearing at 25 px, and `bulged(6, ...)` - the same hexagon with its faces bowed, which is the
  // obvious thing for a shape visit to propose - loses it at 26. Both are here, because the crowd
  // is one resize away from measuring wrong and a draft is measured at radii nobody has tried.
  const hexagon = crowdBody('tank').shape;
  for (const r of [25, 26, 26.5]) {
    const holes = [...profile(hexagon, r)].filter((reach) => reach === 0).length;
    assert.equal(holes, 0, 'a hexagon at ' + r + ' px read as empty on ' + holes
      + ' of its 96 bearings');
  }

  // Two hexagons two px apart in size part by exactly 2 px at a corner and by less everywhere
  // else, so 2 px is the worst bearing there is. A lost corner made that bearing 22 px wide - and
  // the mean with it, which is the number the crowd's whole silhouette audit is measured on.
  const gap = edgeGap({ type: 'a', r: 25, shape: hexagon }, { type: 'b', r: 27, shape: hexagon });
  assert.ok(Math.abs(gap.worst - 2) < 1e-6,
    'two hexagons two px apart part by ' + gap.worst.toFixed(3) + ' px at their widest bearing');
  assert.ok(gap.mean > 1.8 && gap.mean < 2,
    'two hexagons two px apart mean ' + gap.mean.toFixed(3) + ' px apart');

  // And the share: faces bowed out to 0.9r enclose a disc of 0.9r, so the answer is 0.81 - and it
  // is not the 0 the ruler answered for this exact shape, which `tools/try-body.js` then printed as
  // a fact about a proposed body.
  const bowed = bulged(6, 1.0, 0.9);
  assert.ok(Math.abs(inscribedShare(bowed, 26) - 0.81) < 0.01,
    'a hexagon bowed to 0.9r encloses ' + inscribedShare(bowed, 26).toFixed(3)
      + ' of the circle it hurts with');
});

test('every body the builders can build closes over its middle on all 96 bearings', () => {
  // The general promise behind the one above, said about the whole vocabulary rather than the one
  // shape that happened to trip it: a polygon, a bowed polygon, a studded shell and a lobed body,
  // for the side counts the crowd uses and a couple it does not, have to be found on every bearing
  // this ruler reads. Those side counts include the ones that divide 96 - 3, 4, 6, 8, 12 and 16 -
  // which are exactly the ones that put a corner on a sampled bearing.
  const missing = [];
  for (const sides of [3, 4, 5, 6, 8, 12, 16]) {
    for (const [words, shape] of [
      [sides + '-gon', plainPolygon(sides)],
      [sides + '-gon bowed', bulged(sides, 1.0, 0.9)],
      [sides + '-stud', studded(sides, 1.5, 0.85)],
      [sides + '-lobe', lobed(sides, 1.55, 1.15)],
    ]) {
      const holes = [...profile(shape, 20)].filter((reach) => reach === 0).length;
      if (holes > 0) missing.push(words + ' loses ' + holes + ' bearing' + (holes > 1 ? 's' : ''));
    }
  }
  assert.deepEqual(missing, [], 'a body the ruler cannot see all the way round: ' + missing.join('; '));
});

test('two outlines are as far apart as the kindest turn between them allows', () => {
  const a = crowdBody('drifter');
  const clone = { type: 'drifter', r: a.r, shape: a.shape };
  const identical = edgeGap(a, clone);
  assert.equal(identical.mean, 0);
  assert.equal(identical.arc, 0);

  // The kindest turn is the one reported, so a pair that matches at one turn is one shape however
  // far apart they start. Turn a four-lobed body by a quarter of a lobe and it is the same body.
  const square = { type: 'x', r: 10, shape: (ctx, r) => {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * TAU;
      const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } };
  const wide = { type: 'y', r: 10, shape: (ctx, r) => {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * TAU + TAU / 8;
      const x = Math.cos(ang) * r * 1.6, y = Math.sin(ang) * r * 1.6;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } };
  assert.ok(edgeGap(square, wide).mean > ONE_SHAPE_PX,
    'a square and a square 60% bigger are told apart at every turn but one');
});

test('the two bars are ordered, and a pair is in exactly one band', () => {
  assert.ok(ONE_SHAPE_PX < THIN_SHAPE_PX, 'the bands are ' + ONE_SHAPE_PX + ' and ' + THIN_SHAPE_PX);
  const bands = crowdPairs().map((pair) => (pair.gap <= ONE_SHAPE_PX ? 'one'
    : pair.gap <= THIN_SHAPE_PX ? 'thin' : 'own'));
  assert.equal(new Set(bands).size, 3, 'the crowd does not use all three bands');
  assert.equal(bands.filter((b) => b === 'one').length, crowdPairs().filter((p) => p.same).length,
    '`same` and the one-shape band disagree');
});

test('the art shows the drawing, the hurtbox, and the gap between them', () => {
  // A body drawn as a quarter of its own circle: the quarter is `#`, the rest of the disc is `o`,
  // and the one corner of the square that stands past the circle is `+`.
  const art = hurtboxArt(rect(10, 10), 10, 2).split('\n');
  const counts = art.join('').split('').reduce((tally, c) => {
    tally[c] = (tally[c] || 0) + 1; return tally;
  }, {});
  assert.ok(counts['#'] > 0, 'nothing was drawn');
  assert.ok(counts.o > counts['#'], 'a quarter of the disc drawn, and ' + counts.o + ' cells of air');
  assert.ok(counts['+'] > 0, 'the corner of a 10 px square is 14 px out and the art did not see it');

  // And the other way round: a body all nose has `+` cells and hardly any air in the disc.
  const dart = hurtboxArt(crowdBody('swarmling').shape, 7, 2).split('\n').join('');
  assert.ok(dart.includes('+'), 'a 2.1r nose reaches past its circle and the art did not see it');
});

test('the rows are the crowd, worst-covered first, and one bar each', () => {
  const rows = fitRows();
  assert.deepEqual(rows.map((row) => row.type).sort(), Object.keys(BALANCE.kinds).sort());
  const shares = rows.map((row) => row.covered);
  assert.deepEqual(shares, shares.slice().sort((x, y) => x - y), 'the report is not worst-first');
  for (const row of rows) {
    assert.equal(row.bar.length, 20, row.type + "'s bar is " + row.bar);
    assert.equal(row.bar.replaceAll('#', '').length, 20 - Math.round(row.covered * 20));
  }
});

test('the report prints every body, and says what the bars mean', () => {
  const run = shapeLab([]);
  assert.equal(run.status, 0, run.stderr);
  const out = run.stdout;
  for (const type of Object.keys(BALANCE.kinds)) {
    assert.ok(out.includes(type), 'the report has no row for the ' + type);
  }
  assert.match(out, /swarmling.*45%/, 'the thin body in the crowd is the swarmling, on purpose');
  assert.match(out, /drifter.*75%/, 'the drifter covers three quarters of the circle now');
  assert.match(out, /test\/crowd-art\.test\.mjs/, 'the report does not say where the bars are held');

  // The worst body first, so a reader sees the problem before the pretty rows.
  const rows = fitRows();
  assert.ok(out.indexOf(rows[0].type) < out.indexOf(rows[rows.length - 1].type),
    'the report is not worst-first');
});

test('--show draws one body in text, and refuses a kind that is not in the crowd', () => {
  const run = shapeLab(['--show', 'sniper']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^[+#o.]+$/m, 'no art in the art report');
  assert.match(run.stdout, /hurt and not drawn/);

  const worst = shapeLab(['--show', 'worst']);
  assert.equal(worst.status, 0, worst.stderr);
  assert.match(worst.stdout, /^swarmling,/, '--show worst is not the least-covered body');

  const nonsense = shapeLab(['--show', 'saucer']);
  assert.equal(nonsense.status, 2);
  assert.match(nonsense.stderr, /no enemy kind is called saucer/);
  assert.match(nonsense.stderr, /drifter/, 'a refusal that does not say what the crowd is');
});

test('the command line refuses what it should, in words', () => {
  assert.equal(shapeLab(['--show']).status, 2, 'a --show with no kind was accepted');
  assert.equal(shapeLab(['--spacing', '105']).status, 2, 'an argument shape-lab does not have');
  const help = shapeLab(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /node tools\/shape-lab\.js/);
});

test('the ruler is run against the shipped crowd and finds what it is for', () => {
  // A guard on the guard: the crowd as it ships has bodies that under-fill their own circles, and
  // the ruler has to still be saying so. If a session fattens every one of them and this goes red,
  // that is the test working - delete it with the numbers it quoted.
  const rows = fitRows();
  assert.ok(rows[0].covered < 0.5, 'the worst body now covers ' + (rows[0].covered * 100).toFixed(0)
    + '%; the crowd has changed and the report quoted in PLAN and NOTES needs re-reading');
  assert.ok(rows.some((row) => row.reach > 2), 'nothing in the crowd reaches past twice its radius');
  assert.equal(crowdBodies().length, Object.keys(BALANCE.kinds).length);
});
