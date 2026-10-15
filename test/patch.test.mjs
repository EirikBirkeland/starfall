// The shared `--set` reader behind three measuring tools (tools/headless/patch.js, used by
// tools/line-ab.js, tools/gun-tune.js and tools/difficulty-arc.js).
//
// It exists because a tool that patches a live `BALANCE` can lie in two directions, and both are
// silent. A path that does not exist is quietly a *new* field, so the batch is measured on the
// unpatched game while the header claims it was not. And a patch that is put back by copying the row
// it landed on can put the row back in the wrong shape - session 134's lance run, where
// `Object.assign({}, ['pierce', 'ricochet'])` left a list that had no `indexOf` and killed a run
// three minutes into a batch, on the three guns that carry a list and on none of the others.
//
// So the two promises worth pinning are that a bad path is refused before anything is played, and
// that putting a patch back touches the leaf it names and nothing else.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import {
  fieldAt, numberFields, parseNumberPatch, applyPatches, patchWords,
} from '../tools/headless/patch.js';

test('a path may go through an object and through an array', () => {
  assert.equal(fieldAt(BALANCE.weapons.pulse, 'muzzle.count'), BALANCE.weapons.pulse.muzzle.count);
  assert.equal(fieldAt(BALANCE.waves, 'gap.0'), BALANCE.waves.gap[0]);
  assert.equal(fieldAt(BALANCE.waves, 'gap.1'), BALANCE.waves.gap[1]);
  // The lance's beam is three levels deep, and a depth cap would just push the next tool towards
  // writing its own path reader.
  assert.equal(typeof fieldAt(BALANCE.weapons.lance, 'beam.cut.spread'), 'number');
});

test('a path that misses answers undefined rather than throwing', () => {
  // The caller has to be able to say what its own table *does* have, in its own words, and it cannot
  // do that until it knows the path missed.
  assert.equal(fieldAt(BALANCE.weapons.pulse, 'firerate'), undefined);
  assert.equal(fieldAt(BALANCE.weapons.pulse, 'muzzle.count.deep'), undefined);
  assert.equal(fieldAt(BALANCE.weapons.pulse, 'sound.wave.deep'), undefined);
});

test('every number under a table is spelled the way a path wants it', () => {
  const fields = numberFields(BALANCE.waves);
  assert.ok(fields.includes('crowdBase'));
  assert.ok(fields.includes('gap.0'), 'a list element is addressable by its index');
  assert.ok(!fields.includes('gap'), 'the pair itself is not offered as a number');
  assert.ok(!fields.includes('attempts.deep'), 'only leaves are offered');
  const deep = numberFields(BALANCE.weapons.lance);
  assert.ok(deep.includes('beam.cut.spread'));
  assert.ok(!deep.some((field) => field.startsWith('cannotSpend')),
    'a list of line ids is never offered as a number');
});

test('a path that is not there is refused, and the message names what is', () => {
  assert.throws(
    () => parseNumberPatch('firerate=2.6', BALANCE.weapons.pulse, 'the PULSE row'),
    /the PULSE row has no number called firerate; it has fireRate, pellets/,
  );
});

test('a path that is there but is not a number is refused', () => {
  // The value parses and the field does not: `name` is a word on the row and `cannotSpend` is a list
  // of line ids, and either would go into a multiplication somewhere else, minutes later.
  assert.throws(
    () => parseNumberPatch('name=3', BALANCE.weapons.pulse, 'the PULSE row'),
    /the PULSE row has name, and it is not a number/,
  );
  assert.throws(
    () => parseNumberPatch('cannotSpend=3', BALANCE.weapons.lance, 'the LANCE row'),
    /the LANCE row has cannotSpend, and it is not a number/,
  );
});

test('an assignment that is not `path=number` is refused', () => {
  for (const bad of ['damage', 'damage=', 'damage=x', '=3', 'a=b=c']) {
    assert.throws(() => parseNumberPatch(bad, BALANCE.weapons.pulse, 'the PULSE row'),
      /--set wants <path>=<number>/, bad + ' was refused');
  }
});

test('putting a patch back touches the leaf it names and nothing else', () => {
  const row = BALANCE.weapons.pulse;
  const list = BALANCE.weapons.lance.cannotSpend;
  const before = JSON.stringify(row);
  const patches = [
    parseNumberPatch('fireRate=9', row, 'the PULSE row'),
    parseNumberPatch('muzzle.count=7', row, 'the PULSE row'),
  ];
  assert.equal(patches[0].was, row.fireRate, 'a patch remembers what it covered');
  const restore = applyPatches(patches, row);
  assert.equal(row.fireRate, 9);
  assert.equal(row.muzzle.count, 7);
  restore();
  assert.equal(JSON.stringify(row), before, 'the row is back as it was shipped');
  assert.equal(BALANCE.weapons.lance.cannotSpend, list, 'and no other row was ever touched');
});

test('a patch into a list lands on the list and comes back off it', () => {
  const waves = BALANCE.waves;
  const before = waves.gap.slice();
  const patches = [parseNumberPatch('gap.0=0.1', waves, 'BALANCE')];
  const restore = applyPatches(patches, waves);
  assert.equal(waves.gap[0], 0.1);
  assert.ok(Array.isArray(waves.gap), 'the list is still a list');
  restore();
  assert.deepEqual(waves.gap, before);
});

test('a header says what was moved, and says nothing when nothing was', () => {
  assert.equal(patchWords([]), '');
  assert.equal(patchWords([
    parseNumberPatch('gap.0=0.5', BALANCE.waves, 'BALANCE'),
    parseNumberPatch('waveMaxPoints=45', BALANCE.waves, 'BALANCE'),
  ]), ', with gap.0 0.5, waveMaxPoints 45');
});
