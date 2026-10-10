// The rule that keeps the game testable without a browser (PLAN section 2):
// simulation modules must not reach into the presentation layers.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOGIC_FOLDERS = ['src/game', 'src/core'];
const SIMULATION = ['src/game'];
const FORBIDDEN = ['render/', 'audio/', 'ui/', 'input/'];

function jsFilesIn(relativeFolder) {
  const folder = path.join(ROOT, relativeFolder);
  return fs.readdirSync(folder)
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(relativeFolder, name));
}

/** The same, but walking into subfolders too. */
function allJsIn(relativeFolder) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, relativeFolder), { withFileTypes: true })) {
    const name = relativeFolder + '/' + entry.name;
    if (entry.isDirectory()) out.push(...allJsIn(name));
    else if (entry.name.endsWith('.js')) out.push(name);
  }
  return out;
}

test('the game folders import nothing from render, audio, ui, or input', () => {
  const offenders = [];
  for (const folder of LOGIC_FOLDERS) {
    for (const file of jsFilesIn(folder)) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const imports = source.match(/from\s+'[^']+'/g) || [];
      for (const statement of imports) {
        for (const banned of FORBIDDEN) {
          if (statement.includes(banned)) offenders.push(file + ' imports ' + banned);
        }
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('simulation modules do not touch the browser objects directly', () => {
  // core/save.js is the one deliberate bridge to localStorage; nothing in
  // src/game may reach the browser at all.
  const forbiddenWords = [
    { pattern: /\bdocument\./, what: 'document' },
    { pattern: /\bwindow\.(addEventListener|localStorage|AudioContext|requestAnimationFrame)/, what: 'window' },
    { pattern: /\bAudioContext\b/, what: 'AudioContext' },
    { pattern: /\bctx\.(fill|stroke|save|beginPath)\b/, what: 'canvas' },
  ];
  const offenders = [];
  for (const folder of SIMULATION) {
    for (const file of jsFilesIn(folder)) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      for (const check of forbiddenWords) {
        if (check.pattern.test(source)) offenders.push(file + ' uses ' + check.what);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('only the save module touches storage', () => {
  // Milestone 8 is about to want to remember a great many things (PLAN section 3.7), and every one
  // of them belongs in the one versioned document rather than in a `setItem` call next to whatever
  // feature needed a number. A value stored outside that document is a value no version, no
  // validation, and no migration will ever reach.
  const offenders = [];
  for (const file of allJsIn('src')) {
    if (file === 'src/core/save.js') continue;
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (/\blocalStorage\b/.test(source)) offenders.push(file + ' touches localStorage');
  }
  assert.deepEqual(offenders, []);
});

test('every tuning number sits in balance.js or a named constant', () => {
  // game/ modules may not hard-code a speed, a rate, or a damage value inline.
  // Allowed: 0, 1, 2 (counting and halving), and numbers on a line that names
  // them as a constant.
  const offenders = [];
  for (const file of jsFilesIn('src/game')) {
    if (file.endsWith('balance.js')) continue;
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const lines = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').split('\n');
    lines.forEach((line, index) => {
      if (/^\s*(export )?const [A-Za-z0-9_]+ = [-\d.]+;/.test(line)) return;
      const numbers = line.match(/(?<![\w.])\d+(?:\.\d+)?(?![\w])/g) || [];
      const magic = numbers.filter((n) => !['0', '1', '2'].includes(n));
      if (magic.length > 0) {
        offenders.push(file + ':' + (index + 1) + ' hard-codes ' + magic.join(', '));
      }
    });
  }
  assert.deepEqual(offenders, []);
});

test('only the seed chooser reaches for Math.random', () => {
  // Every other random number comes from a named stream in core/rng.js, which
  // is what makes a run replayable from its seed (PLAN section 2).
  //
  // `audio/noise.js` is the one exception, and it is one because it is not the simulation:
  // the grain of an explosion is not a number a run can be won or lost on. If it came off the
  // seeded stream instead, then simply *hearing* the game would move a run, which is the one
  // thing the seed may never be used for - a run played with the sound off has to replay byte
  // for byte against the same run played with it on. The test over the random streams below
  // is what keeps this module out of the seeded ones as well.
  const allowed = ['src/core/rng.js', 'src/audio/noise.js'];
  const offenders = [];
  for (const file of allJsIn('src')) {
    if (allowed.includes(file)) continue;
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (/\bMath\.random\b/.test(source)) offenders.push(file + ' calls Math.random');
  }
  assert.deepEqual(offenders, []);
});

test('the simulation reads the logic stream and the eye reads the visual one', () => {
  // A change in the drawing must not be able to move a run, and a run must not be
  // able to depend on the drawing. The streams keep that promise: `logic` for
  // anything a run can be won or lost on, `fx` for the simulation's own cosmetics,
  // `visual` for the frame. So the eye may read only the last of them, and the
  // simulation may never read it.
  const offenders = [];
  for (const file of allJsIn('src/game')) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (/\bvisual\./.test(source)) offenders.push(file + ' reads the visual stream');
  }
  for (const folder of ['src/render', 'src/audio', 'src/ui', 'src/input']) {
    for (const file of allJsIn(folder)) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      if (/\blogic\./.test(source)) offenders.push(file + ' reads the logic stream');
      if (/\bfx\./.test(source)) offenders.push(file + ' reads the effects stream');
    }
  }
  assert.deepEqual(offenders, []);
});
