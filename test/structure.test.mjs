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

/** Every file with this extension under a folder, walked the same way. */
function filesEndingIn(relativeFolder, extension) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, relativeFolder), { withFileTypes: true })) {
    const name = relativeFolder + '/' + entry.name;
    if (entry.isDirectory()) out.push(...filesEndingIn(name, extension));
    else if (entry.name.endsWith(extension)) out.push(name);
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
  //
  // The check is textual, comments and all, so a sentence in a comment that happens to write
  // `document.` is reported the same as a line of code that calls it. That is deliberate - the
  // patterns are cheap and the false positive costs one reworded sentence - but it is the kind of
  // failure that reads like the code is wrong, so: reword the prose, do not weaken the check.
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

test('only the keyboard module hears a key event', () => {
  // A key has two names - `code`, a place on the board, and `key`, what it prints - and the game hears
  // one and keeps the other, for the reasons written out in core/keymap.js's header. That rule only
  // holds while exactly one place in the game reads an event at all: a second listener is a second
  // opinion about which name wins, and the report this is written against - "D does not work for me,
  // right-arrow does though" - is what two doors disagreeing looks like from the player's chair.
  const offenders = [];
  for (const file of allJsIn('src')) {
    if (file === 'src/input/keyboard.js') continue;
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (/addEventListener\(\s*['"]key(?:down|up)['"]/.test(source)) {
      offenders.push(file + ' listens for a key');
    }
  }
  assert.deepEqual(offenders, []);
});

test('a key is named in the keymap and the keyboard, and nowhere else', () => {
  // The corollary of the door above: a feature may not settle the question "which key means the dash"
  // for itself, because the rack that lets a player move that key would then be painting a lie. Every
  // key name in the game sits in core/keymap.js's table, or in the handful of keys input/keyboard.js
  // says out loud and explains (the launch, the card numbers, the volume pairs, F3, the panel arrows).
  const NAMED_KEY = /['"](?:Key[A-Z]|Digit[0-9]|Numpad[0-9A-Za-z]+|Arrow(?:Up|Down|Left|Right)|Space|Enter|Escape|F[0-9]+)['"]/g;
  const offenders = [];
  for (const file of allJsIn('src')) {
    if (file === 'src/core/keymap.js' || file === 'src/input/keyboard.js') continue;
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const spelled = source.match(NAMED_KEY);
    if (spelled) offenders.push(file + ' names a key: ' + spelled.join(', '));
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

test('only the day asks the clock what day it is', () => {
  // game/daily.js is the one place in the simulation folder allowed to read the wall clock, and it
  // reads it to *label* a run and never to change one: a step that asked the date would give a run's
  // own facts a clock to move on, and a run launched at 23:59 would end up belonging to whichever day
  // its last step happened to land in. Everything else is handed the day, or gets no day at all.
  const allowed = ['src/game/daily.js'];
  const offenders = [];
  for (const file of jsFilesIn('src/game')) {
    if (allowed.includes(file)) continue;
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (/\bnew Date\b|\bDate\.now\b|\.getFullYear\(|\.getMonth\(|\.getDate\(/.test(source)) {
      offenders.push(file + ' asks the clock');
    }
  }
  assert.deepEqual(offenders, []);
});

test('nothing in the game reaches for Math.hypot', () => {
  // Not a style rule. `Math.hypot` takes any number of arguments, so V8 lays them out in a list on the
  // heap and throws the list away again on every call: with the schedule's crowd on the glass that was
  // **2.7 KB of the 3.5 KB a step threw away** (`tools/alloc-probe.js`), and a step's garbage is a
  // scavenge of the collector waiting for somebody - the F3 plate's worst steps of 1.4-1.7 ms are the
  // collector and nothing else. `core/math.js` has a two-argument `hypot` that is the same number and
  // allocates nothing, and that is the one the game calls.
  const offenders = [];
  for (const file of allJsIn('src')) {
    if (file === 'src/core/math.js') continue;   // the one place it is allowed to be written about
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (/\bMath\.hypot\b/.test(source)) offenders.push(file + ' calls Math.hypot');
  }
  assert.deepEqual(offenders, []);
});

test('nothing exports a name nobody calls', () => {
  // An export nothing calls is a piece of the game nothing can test and nothing dares to delete, and it
  // accumulates quietly: a line is written for a caller that never arrives, or the caller is rewritten
  // a month later and nobody comes back for the line. Four had piled up by the time this was first run
  // (`hasAfterimage`, `fieldCentre`, `bossOf`, `pictureRows` - all of them accessors whose caller ended
  // up reading the field or the other accessor instead).
  //
  // It is a word count and not an import graph, and it counts the whole tree - the game, the tools, the
  // tests and the page - because a function only the harness calls is used, and one nothing anywhere
  // mentions is not. A mention in a sentence about the function counts too, which is the one way this
  // check is soft: a name that is only ever *talked about* passes. That is the right way to be wrong -
  // a false alarm here costs a deleted function somebody needed, and a soft pass costs one more grep.
  const sources = new Map();
  for (const file of [...allJsIn('src'), ...filesEndingIn('tools', '.js'),
    ...filesEndingIn('tools', '.mjs'), ...filesEndingIn('test', '.mjs'), 'index.html']) {
    sources.set(file, fs.readFileSync(path.join(ROOT, file), 'utf8'));
  }

  const mentions = new Map();
  for (const source of sources.values()) {
    for (const word of source.match(/[A-Za-z_$][\w$]*/g) || []) {
      mentions.set(word, (mentions.get(word) || 0) + 1);
    }
  }

  const exported = /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)|^export\s*\{([^}]*)\}/gm;
  const offenders = [];
  for (const [file, source] of sources) {
    if (!file.startsWith('src/')) continue;
    for (const match of source.matchAll(exported)) {
      const names = match[1] !== undefined ? [match[1]] : match[2].split(',').map((part) => part.trim());
      for (const name of names) {
        if (name === '' || name === 'default') continue;
        if ((mentions.get(name) || 0) <= 1) offenders.push(file + ' exports ' + name + ', which nothing calls');
      }
    }
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
