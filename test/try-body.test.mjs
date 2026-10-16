// `tools/try-body.js`: a body you have not drawn yet, judged by the gates that are already shipped.
//
// Sessions 142, 143 and 144 each hand-wrote the same ninety lines to answer one question - what
// would the crowd say if this body were fatter, or thinner, or a different red: import the real
// tables, mutate them in memory, read the shipped rulers back off the mutated tables. This tool is
// those ninety lines - the mutation, the put-it-back, the rulers - so that a draft is a six-line
// file written in the same builders `src/render/shapes.js` ships, and not another copy of a harness
// that quietly stops matching the gates two sessions later.
//
// What is worth holding to, then, is that the tool cannot flatter a draft and cannot blind itself:
//
//   a draft file that does not make sense is answered in a line and not a stack, before a row is
//   measured;
//   what a draft writes into the shipped tables is put back exactly, or every row after the first
//   was measured against somebody else's crowd;
//   a colour has to reach the sight row as well as the balance sheet, because the audit reads the
//   row and the frame reads the sheet, and a tool that updates one of the two measures a game
//   nobody plays (this is the bug every scratch version had to work around);
//   a shape that gives ground up fails, and "I meant to" is a bar moved in the same breath;
//   and nothing in it is a hand-written bar. That was the fault of the first version: it carried a
//   coverage floor of its own at 40%, while the shipped bar for the drifter was 74%, so every draft
//   that flattened a body passed here and came back red from the test. A tool whose bars are not the
//   shipped bars is worse than no tool, because it is read as an all-clear.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BALANCE } from '../src/game/balance.js';
import { PALETTE } from '../src/core/palette.js';
import { CROWD_SHAPES, lens } from '../src/render/shapes.js';
import {
  COVERS, crowdBody, hurtboxFit, inscribedShare, longestNose, noseCeiling,
} from '../tools/shape-lab.js';
import { SIGHTS, silhouettePairs } from '../tools/sights.js';
import {
  DraftError, DRAFTABLE, inspect, readDraftFile, reportDraft, reset, shipped,
} from '../tools/try-body.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'try-body.js');
const SHAPES_URL = pathToFileURL(path.join(ROOT, 'src/render/shapes.js')).href;
const scratch = mkdtempSync(path.join(tmpdir(), 'draft-'));

test.after(() => rmSync(scratch, { recursive: true, force: true }));
test.afterEach(() => reset());

/** Write a draft file into a temp dir; a real one sits in the repo and imports by relative path. */
function draftFile(name, source) {
  const file = path.join(scratch, name);
  writeFileSync(file, source);
  return file;
}

function tryBody(args) {
  return spawnSync(process.execPath, [TOOL, ...args], { cwd: ROOT, encoding: 'utf8' });
}

function countLines(text, needle) {
  return text.split('\n').filter((line) => line.includes(needle)).length;
}

/**
 * How many pair *rows* the report printed for a pair - and only rows.
 *
 * A pair can be named twice for one draft honestly: once in the table of what it is one shape with,
 * once again in the summary line that says it left that list. The rows are the thing with a count, so
 * that is what a test counts; they are the only lines that start at this indent with a pair's name.
 */
function countPairRows(text, name) {
  return text.split('\n').filter((line) => line.startsWith('      ' + name)).length;
}

function whyOf(reasons) {
  return reasons.map((reason) => reason.why);
}

/** The drifter as it shipped before session 143: three flat faces, 42% of its own circle. */
function flatDrifter() {
  const r = BALANCE.kinds.drifter.radius;
  return (ctx) => {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
}

// --- what a draft file may say ------------------------------------------------------------------------------

test('a draft file that does not make sense is answered in a line, not a stack', async () => {
  const checks = [
    ['nothing.mjs', 'export const nope = 1;', /exports no `drafts`/],
    ['not-a-list.mjs', 'export const drafts = { drifter: {} };', /has to be a list/],
    ['empty.mjs', 'export const drafts = [];', /empty list/],
    ['saucer.mjs', 'export const drafts = [{ saucer: { shape() {} } }];',
      /talks about saucer, which is not a crowd body/],
    ['typo-field.mjs', 'export const drafts = [{ drifter: { radius: 20 } }];',
      /may not; it may change/],
    ['not-a-change.mjs', 'export const drafts = [{ label: ' + "'nothing'" + ' }];',
      /changes no body the crowd has/],
    ['changes-nothing.mjs', 'export const drafts = [{ drifter: {} }];', /changes nothing/],
    ['shape-is-a-number.mjs', 'export const drafts = [{ drifter: { shape: 12 } }];',
      /shape is not a shape: a draft writes one with the builders/],
    ['covers-out-of-range.mjs', 'export const drafts = [{ drifter: { covers: 2 } }];',
      /covers as 2, which is a share/],
    ['not-a-colour.mjs', 'export const drafts = [{ drifter: { colour: ' + "'mauve'" + ' } }];',
      /is not a colour the game can paint/],
  ];
  for (const [name, source, expectation] of checks) {
    const file = draftFile(name, source);
    await assert.rejects(() => readDraftFile(file), (error) => {
      assert.ok(error instanceof DraftError, name + ' was answered with a ' + error.name);
      assert.match(error.message, expectation, name + ' was answered with: ' + error.message);
      return true;
    });
  }
});

test('the command line refuses what it should, before it measures anything', () => {
  const missing = tryBody(['no-such-file.mjs']);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /could not be loaded/);
  assert.doesNotMatch(missing.stderr, /file:\/\/\/.*:\d+/, 'a stack trace where a line should be');

  const nothing = tryBody([]);
  assert.equal(nothing.status, 2, 'a tool asked to judge nothing');
  assert.match(nothing.stderr, /nothing to judge/);

  const unknown = tryBody(['--strict']);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /does not know the option --strict/);

  const bad = draftFile('bad-kind.mjs', 'export const drafts = [{ saucer: { shape() {} } }];');
  const refused = tryBody([bad]);
  assert.equal(refused.status, 2, 'a draft about a kind that does not exist was accepted');
  assert.match(refused.stderr, /talks about saucer, which is not a crowd body/);

  const help = tryBody(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /node tools\/try-body\.js/);
});

test('a draft file can import the shipped builders it is written with', async () => {
  const file = draftFile('importer.mjs', 'import { bulged } from ' + JSON.stringify(SHAPES_URL)
    + ';\nexport const drafts = [{ label: ' + "'a rounded triangle'"
    + ', drifter: { shape: bulged(3, 1.0, 0.85) } }];\n');
  const drafts = await readDraftFile(file);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].label, 'a rounded triangle');
});

// --- a draft is written into the crowd, and put back --------------------------------------------------------

test('what a draft changes is put back, or the next row measured somebody else' + "'s crowd", () => {
  const before = silhouettePairs().map((row) => row.a + '/' + row.b + ' ' + row.gap.toFixed(3));
  const shapeBefore = CROWD_SHAPES.drifter;
  inspect({ drifter: {
    shape: flatDrifter(), colour: '#ffffff', fill: 'rgba(255,255,255,0.4)', covers: 0.2,
  } });
  reset();
  assert.deepEqual(silhouettePairs().map((row) => row.a + '/' + row.b + ' ' + row.gap.toFixed(3)),
    before, 'the crowd did not come back the way it went in');
  assert.equal(BALANCE.kinds.drifter.color, PALETTE.violet);
  assert.equal(BALANCE.kinds.drifter.fill, PALETTE.violetFill);
  assert.equal(CROWD_SHAPES.drifter, shapeBefore);
});

test('a drafted colour reaches the audit and the frame, not one of them', () => {
  const seen = inspect({ sniper: { colour: '#ffffff', fill: 'rgba(255,255,255,0.3)' } });
  const sight = SIGHTS.find((each) => each.id === 'sniper');
  assert.ok(seen.crowd.lightness.get('sniper') > 0.95,
    'the audit is still measuring the old colour: ' + seen.crowd.lightness.get('sniper'));
  assert.equal(sight.colour, '#ffffff', 'the audit would report a colour nobody paints');
  assert.equal(BALANCE.kinds.sniper.color, '#ffffff', 'the renderer would paint an old colour');
  assert.ok(seen.crowd.wash.get('sniper') > seen.base.wash.get('sniper'),
    'the wash did not move');
});

test('a colour that cannot be seen on the sky at all is refused', () => {
  const seen = inspect({ sniper: { colour: PALETTE.bgMiddle } });
  assert.ok(seen.reasons.some((r) => r.why === 'sky' && r.about.startsWith('sniper')),
    'a body painted the colour of the sky itself went unreported: ' + JSON.stringify(whyOf(seen.reasons)));
});

// --- what makes a draft fail --------------------------------------------------------------------------------

test('a shape that gives ground up fails, in the words shots would miss in', () => {
  const seen = inspect({ label: 'back to a flat triangle', drifter: { shape: flatDrifter() } });
  assert.ok(!seen.passes);
  const coverage = seen.reasons.filter((r) => r.why === 'less' || r.why === 'bar');
  assert.deepEqual(coverage.map((r) => r.about), ['drifter']);
  assert.match(coverage[0].says, /covers 42%/);
  assert.match(coverage[0].says, /gives ground up|its bar is 74%/);
});

test('"I meant to" is a bar moved in the same breath, and nothing else', () => {
  const meant = inspect({ drifter: { shape: flatDrifter(), covers: 0.4 } });
  assert.deepEqual(meant.reasons.filter((r) => r.why === 'less' || r.why === 'bar'), [],
    'a draft that moved its own bar was still held to the old one: ' + whyOf(meant.reasons));
  // Moving a bar is not meeting it.
  const lie = inspect({ drifter: { shape: flatDrifter(), covers: 0.9 } });
  const bar = lie.reasons.find((r) => r.why === 'bar');
  assert.ok(bar !== undefined, 'a body under the bar the draft asked for passed');
  assert.match(bar.says, /the bar this draft asked for/);
});

test('a body thinner than the one it replaces fails even when it clears its bar', () => {
  // The point of the `less` rule, on its own: a lens stood a shade shorter than it ships clears the
  // 83% written for the sniper and still gives ground up, which is what a bar read off yesterday's
  // drawing could not see. 83% of the hurtbox, 84% shipped.
  const seen = inspect({ sniper: { shape: lens(1.5, 1.58) } });
  const less = seen.reasons.filter((r) => r.why === 'less');
  assert.deepEqual(less.map((r) => r.about), ['sniper'], whyOf(seen.reasons).join(', '));
  assert.match(less[0].says, /covers 83%/);
  assert.match(less[0].says, /the body it replaces covers 84%/);
  assert.match(less[0].says, /gives ground up/);
  assert.ok(hurtboxFit(lens(1.5, 1.58), BALANCE.kinds.sniper.radius).covered > COVERS.sniper,
    'this draft is supposed to clear the written bar, or it proves nothing');
});

test('the fact a written bar could not express is printed beside it', () => {
  // Every number in COVERS was read off the body that shipped, so no bar can say "this shape is a
  // skeleton". The share of the hurtbox an outline *encloses* can, and nobody had to write it down:
  // a flat triangle stands 1r out at three corners and no nearer than half that anywhere else.
  const r = BALANCE.kinds.drifter.radius;
  assert.ok(Math.abs(inscribedShare(flatDrifter(), r) - 0.25) < 0.02,
    'a flat triangle encloses a quarter of its circle, and the ruler says '
      + inscribedShare(flatDrifter(), r).toFixed(3));
  assert.ok(inscribedShare(crowdBody('drifter').shape, r) > 0.6,
    'the bowed faces do not, which is what the 42% -> 75% visit bought');
  assert.ok(hurtboxFit(flatDrifter(), r).covered
    < hurtboxFit(crowdBody('drifter').shape, r).covered, 'the shipped drifter is not the thin one');
});

test('a nose longer than the crowd is refused, and the ceiling follows the crowd', () => {
  // The ceiling is not written down anywhere: it is the longest nose the crowd wears plus a little
  // room, so it moves the day a body grows one and not before.
  assert.ok(Math.abs(longestNose() - 2.1) < 0.01,
    "the crowd's longest nose is a darter at " + longestNose().toFixed(2) + 'r');
  assert.ok(Math.abs(noseCeiling() - 2.15) < 0.01, 'the ceiling is ' + noseCeiling());
  assert.ok(Math.abs(noseCeiling([{ shape: crowdBody('darter').shape, r: 10 }]) - 2.15) < 0.01);

  const long = inspect({ sniper: { shape: lens(2.3, 1.6) } });
  const nose = long.reasons.filter((r) => r.why === 'nose');
  assert.deepEqual(nose.map((r) => r.about), ['sniper']);
  assert.match(nose[0].says, /2\.30r/);
});

test('a colour that walks into what the run wants to touch is told', () => {
  // The palette's one promise: a thing that can end the run may not be the colour of a thing the run
  // wants to walk over. This is `palette-check --strict`'s rule run over the draft - the same calls
  // on the same tables, not a copy of its arithmetic in here.
  const seen = inspect({ sniper: { colour: PALETTE.shard } });
  assert.ok(seen.reasons.some((r) => r.why === 'promise' && r.about.includes('sniper')),
    'the eye was given nothing to tell the eye from a shard: ' + whyOf(seen.reasons));
});

test('an unpaid shared silhouette is the loudest failure there is', () => {
  // Two bodies of one shape, one size and one colour are one body, whoever painted them. Every kind
  // that shares an outline pays for it in colour or in size; a draft that stops paying is not
  // drafting a body, it is drafting two bodies pretending to be one.
  const seen = inspect({
    darter: { shape: crowdBody('weaver').shape, colour: PALETTE.pink, fill: PALETTE.pinkFill },
  });
  const unpaid = seen.reasons.filter((r) => r.why === 'one shape');
  // A pair is named in crowd order, which is not the order a test thinks of it in.
  const named = (reason) => reason.about.split(' / ').sort().join(' / ');
  assert.ok(unpaid.some((r) => named(r) === 'darter / weaver'),
    "a clover in the weaver's own colours is one shape with the weaver and the tool did not say so: "
      + unpaid.map((r) => r.about).join(', '));
});

// --- what one draft prints ----------------------------------------------------------------------------------

test('one section per kind the draft changes, and only the pairs that kind is in', () => {
  // A sweep that prints the whole crowd per candidate is a sweep you cannot read: the session that
  // fixed this counted `weaver` five times in a four-candidate report and could not tell a shared
  // pair from a duplicate. So a block belongs to the kind a draft touches, and a pair line to a pair
  // a touched kind is actually in.
  const base = shipped();
  const out = [];
  for (const draft of [
    { label: 'a drifter', drifter: { shape: flatDrifter() } },
    { label: 'a shorter lens', sniper: { shape: lens(1.5, 1.4) } },
    { label: 'a taller lens', sniper: { shape: lens(1.5, 1.7) } },
  ]) reportDraft(draft, base, out);
  const text = out.join('\n');
  assert.equal(countLines(text, 'drifter, drawn at '), 1);
  assert.equal(countLines(text, 'sniper, drawn at '), 2,
    'two drafts changed the sniper and only one of them said so');
  assert.equal(countLines(text, 'weaver, drawn at '), 0,
    'a body no draft touched got a section anyway');
  assert.equal(countPairRows(text, 'drifter / spitter'), 1,
    'a pair only the drifter draft touches was printed for the lens drafts too');
  assert.equal(countPairRows(text, 'spitter / sniper'), 2,
    'both lens drafts share an outline with the spitter and the report did not say so twice');
  assert.equal(countPairRows(text, 'darter / tank'), 0, 'a pair eleven px apart printed itself anyway');
});

test('a draft that ships says what ships, and what it is measured against', () => {
  const out = [];
  const passes = reportDraft(
    { label: 'as shipped', drifter: { shape: crowdBody('drifter').shape } }, shipped(), out);
  const text = out.join('\n');
  assert.ok(passes);
  assert.match(text, /DRAFT: as shipped - PASS/);
  assert.match(text, /ships now\s+75%/);
  assert.match(text, /as drafted\s+75%/);
  assert.match(text, /its bar is 74%/);
  assert.match(text, /longest nose \(2\.10r\) with 0\.05r/);
  assert.match(text, /its outline encloses 64%/);
});

test('a draft that moves a bar says it moved, and where that has to land', () => {
  const out = [];
  reportDraft({ drifter: { shape: flatDrifter(), covers: 0.4 } }, shipped(), out);
  const text = out.join('\n');
  assert.match(text, /this draft moves the bar to 40%/);
  assert.match(text, /COVERS/);
  assert.match(text, /src\/render\/shapes\.js/);
});

/**
 * The three lists the crowd keeps itself: which pairs are one shape, which are one colour, and which
 * are told apart by a hairline outline and nothing else. They are printed per draft because the
 * finding a shape or a colour visit ships with is usually one of them moving and nothing failing:
 * session 143 went from eight shared pairs to eleven and shipped, every new one paid for in colour.
 */
test('the three lists are counted, and a pair that changes hands is named with what it stands on', () => {
  const out = [];
  reportDraft({ label: 'flat again, on purpose', drifter: { shape: flatDrifter(), covers: 0.42 } },
    shipped(), out);
  const text = out.join('\n');
  assert.match(text, /8 pairs share an outline \(ships with 11\)/);
  assert.match(text, /3 stand under a step of colour \(ships with 3\)/);
  assert.match(text,
    /- drifter \/ spitter is not one shape with it any more - 5\.3 px of outline, carried by colour/);
});

test('a colour moves the colour list, which is the one a shape cannot touch', () => {
  // The sniper at the red session 144 gave up: two pairs fall back under a step of colour, which is
  // exactly what that visit bought and the reason the pinned list in test/palette-read.test.mjs is
  // three long and not five. The number is printed because "it cost something" is not a number.
  const out = [];
  reportDraft({
    label: 'the eye goes back up the scale',
    sniper: { colour: '#d81e5b', fill: 'rgba(216,30,91,0.20)' },
  }, shipped(), out);
  const text = out.join('\n');
  assert.match(text, /5 stand under a step of colour \(ships with 3\)/);
  assert.match(text, /\+ darter \/ sniper is under a step of colour now - 0\.\d+ of a step/);
  assert.match(text, /\+ swarmling \/ sniper is under a step of colour now/);
});

test('a draft that moves nothing between the lists says that, instead of printing nothing', () => {
  const out = [];
  reportDraft({ label: 'as shipped', drifter: { shape: crowdBody('drifter').shape } }, shipped(), out);
  assert.match(out.join('\n'), /nothing changed hands between the three lists/);
});

test('a sweep that found nothing is a red exit as well as a red screen', () => {
  // The point of a non-zero exit is that a sweep can be run from a script or a loop and be believed.
  // "Nothing passed" has to be as loud as "the file was nonsense", or a bad hour looks like a result.
  const builders = 'import { bulged, lens } from ' + JSON.stringify(SHAPES_URL) + ';\n';
  const none = draftFile('none.mjs', builders
    + 'export const drafts = [{ label: \'too long a lens\', sniper: { shape: lens(2.3, 1.6) } }];\n');
  const refused = tryBody([none]);
  assert.equal(refused.status, 1, refused.stdout + refused.stderr);
  assert.match(refused.stdout, /0 of 1 draft would ship/);

  const oneGood = draftFile('one-good.mjs', builders
    + 'export const drafts = [{ label: \'too long\', sniper: { shape: lens(2.3, 1.6) } },\n'
    + '  { label: \'as bowed as it ships\', drifter: { shape: bulged(3, 1.0, 0.8) } }];\n');
  const found = tryBody([oneGood]);
  assert.equal(found.status, 0, found.stdout + found.stderr);
  assert.match(found.stdout, /1 of 2 drafts would ship/);
});

test('the crowd as it ships passes the gates the tool runs', () => {
  const seen = inspect({ label: 'nothing', drifter: { shape: crowdBody('drifter').shape } });
  assert.deepEqual(whyOf(seen.reasons), [], 'the crowd as it ships would not pass its own tool');
  assert.equal(seen.gate.unpaid.length, 0);
});

test('every kind in the crowd can be drafted, and only the crowd can be', () => {
  assert.deepEqual(DRAFTABLE.slice().sort(), Object.keys(BALANCE.kinds).sort());
  for (const kind of DRAFTABLE) {
    assert.deepEqual(inspect({ [kind]: { shape: crowdBody(kind).shape } }).kinds, [kind]);
  }
});
