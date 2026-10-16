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
import {
  outline, extent, profile, edgeGap, oneShape, hurtboxFit, hurtboxArt, fitRows, crowdBodies,
  crowdPairs, crowdBody, ONE_SHAPE_PX, THIN_SHAPE_PX,
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
  assert.match(out, /drifter.*42%/, 'the drifter covers the share it always covered');
  assert.match(out, /test\/crowd-art\.test\.mjs/, 'the report does not say where the bars are held');

  // The worst body first, so a reader sees the problem before the pretty rows.
  assert.ok(out.indexOf('drifter') < out.indexOf('weaver'), 'the report is not worst-first');
});

test('--show draws one body in text, and refuses a kind that is not in the crowd', () => {
  const run = shapeLab(['--show', 'sniper']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^[+#o.]+$/m, 'no art in the art report');
  assert.match(run.stdout, /hurt and not drawn/);

  const worst = shapeLab(['--show', 'worst']);
  assert.equal(worst.status, 0, worst.stderr);
  assert.match(worst.stdout, /^drifter,/, '--show worst is not the least-covered body');

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
