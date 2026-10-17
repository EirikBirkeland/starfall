#!/usr/bin/env node
// Which line spends the bytes: take it out, read the load again.
//
//   node tools/alloc-ablate.js --list                        the rows it knows, and what each asks
//   node tools/alloc-ablate.js --kind shielder               every row against a shielder crowd
//   node tools/alloc-ablate.js --kind swarmling --row glide  the rows whose name matches
//   node tools/alloc-ablate.js --kind mixed                  the crowd the director actually fields
//   node tools/alloc-ablate.js --kind shielder --bare        the crowd alone: no shots, no sparks
//   node tools/alloc-ablate.js --edit kinds.js --find "..." --repl "..." --name "my guess"
//
// `tools/alloc-probe.js` says how much a step throws away and cannot say where: a byte has no return
// address, and the inspector's sampling profiler only sees what stayed alive (a crowd that throws away
// 4.8 KB a step shows up in it at 3.5 B, because everything it spent was garbage). So this file asks
// the question the other way round. Take one line out of the step, warm the load again from scratch,
// and read the same row: the bytes that went with the line were the line's. That is a clean claim, and
// the next two paragraphs are about why it does not always come out clean.
//
// **Every row is measured in a copy of `src/`.** The game is never edited, not even for a moment, so a
// session cannot leave a half-removed line behind; the copy lives in the system's temporary folder and
// is deleted on the way out unless `--keep` asks for it (the probe re-runs itself once per load, so it
// needs a whole tree - `src/` and `tools/` - and not just one file). A row whose text is not found in
// the file it names is reported as `not in the source any more` and not skipped: a silently-missing
// edit is how a byte hunt ends up chasing its own tail, and it is why `test/alloc-ablate.test.mjs`
// checks that every row still names something that exists.
//
// **What this instrument cannot say, and one of its readings is proof.** On a crowd of one hundred
// shielders - the load that started this - the row reads 48 B a body, and *each* of these on its own
// takes it back to nothing: one of the four writes in `glide`, the wall clamp in the stand-off walk,
// the sideways drift, and even asking the afterimage "is anyone chasing an image?" once a step instead
// of once a body. Nothing adds up to 48 B a body, and there is no subset of those lines that explains
// it: taking almost anything out makes the bytes simply stop, and putting a little more in - the same
// writes with the answers rounded to whole pixels - makes a *swarmling* crowd 4.7 KB a step dearer.
// What the crowd pays is a shape the loop was compiled into, and a row that reads nothing left proves
// the line it took out was load-bearing in that shape, which is not the same thing as the line being
// the spender. That is why this file is a magnifier and not a ruler. Two readings keep the finding
// honest rather than comforting:
//
//   - the shared band answer replaced by a `Float64Array`: an array store cannot box, and the bytes
//     stayed, so the shared scratch object `holdTheBand` hands back was not the spender;
//   - the walk's answers rounded to whole pixels: a Smi cannot box either, and on the shielder crowd
//     the bytes stayed and on the swarmling crowd they grew - which is weaker evidence, since a rounded
//     answer is not necessarily stored as a Smi, and rounding is extra work besides.
//
// And what the game actually fields is the mixed crowd, which pays 3 B a body against a 5 B budget. The
// two kinds over that budget are crowds the wave director never sends: a hundred bodies of one kind,
// all of them standing the same way in one shape of compilation.
//
// Read a table from this file as "where does the load stop being expensive", not as "this line is the
// one". The productive way to spend an hour with it is to look for a shape that is cheap on a box like
// this one and does not depend on a compiler's mood - which is what `core/math.js`'s own `hypot` is, and
// the pooled cues in `game/cues.js`, and for the same reason: they take work out of the loop instead of
// moving it around inside it.
//
// The rows are sorted here by what they ask about, not by what they found, so that the next session can
// run the whole list at a new load and read the shape of it in one go.

import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { bytes, BODY_BYTES } from './alloc-probe.js';
import { BALANCE } from '../src/game/balance.js';
import { table } from './headless/tables.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const GAME = path.join(ROOT, 'src');
const TOOLS = path.join(ROOT, 'tools');
const PROBE = path.join(TOOLS, 'alloc-probe.js');

/** A row whose reading is this close to the empty arena threw away the whole of the load's bytes. */
const NOTHING_LEFT_SLACK = 1.25;

/**
 * The catalogue. Each row names a question and the edits that ask it; an edit names a file under
 * `src/game/`, the exact text to find, and what to leave in its place. `about` is which crowd the row
 * was written for - `any` rows ask something of every body, the rest are a kind's own.
 */
export const ROWS = [
  {
    name: 'nothing taken out',
    about: 'any',
    why: 'the same load, untouched: the row every other row is measured against',
    edits: [],
  },

  {
    name: 'the crowd is not walked',
    about: 'any',
    why: 'is any of it in the walks at all',
    edits: [{
      file: 'enemies.js',
      find: '    enemy.kind.walk(enemy, step);',
      repl: '    //abl',
    }],
  },
  {
    name: 'the crowd is not separated',
    about: 'any',
    why: 'is it the room-making between bodies that overlap',
    edits: [{
      file: 'enemies.js',
      find: '      if (d2 > BALANCE.enemies.separationEpsilon && d2 < radii * radii) {',
      repl: '      if (false) { //abl',
    }],
  },
  {
    name: 'the crowd keeps no px/py',
    about: 'any',
    why: 'is it the renderer\'s snapshot of where each body started the step',
    edits: [{
      file: 'enemies.js',
      find: '  for (const starting of world.enemies) {\n    starting.px = starting.x;\n    starting.py = starting.y;\n  }',
      repl: '  //abl',
    }],
  },
  {
    name: 'glide writes nothing',
    about: 'any',
    why: 'is it the four number writes a step of walking makes per body',
    edits: [{
      file: 'kinds.js',
      find: '  enemy.x += (dx * walk + enemy.ix) * step.dt;\n  enemy.y += (dy * walk + enemy.iy) * step.dt;\n  enemy.ix *= step.drag;\n  enemy.iy *= step.drag;',
      repl: '  //abl',
    }],
  },
  {
    name: 'glide leaves the shove alone',
    about: 'any',
    why: 'is it just the two decay writes, and not the two position writes beside them',
    edits: [{
      file: 'kinds.js',
      find: '  enemy.ix *= step.drag;\n  enemy.iy *= step.drag;',
      repl: '  //abl',
    }],
  },
  {
    name: 'glide does not write x',
    about: 'any',
    why: 'is it one particular write - the position along the line it walked is the first of the four',
    edits: [{
      file: 'kinds.js',
      find: '  enemy.x += (dx * walk + enemy.ix) * step.dt;',
      repl: '  //abl',
    }],
  },
  {
    name: 'glide\'s answers are whole px',
    about: 'any',
    why: 'is it number boxing: a rounded answer is a Smi, and a Smi cannot be boxed',
    edits: [{
      file: 'kinds.js',
      find: '  enemy.x += (dx * walk + enemy.ix) * step.dt;\n  enemy.y += (dy * walk + enemy.iy) * step.dt;',
      repl: '  enemy.x = Math.round(enemy.x + (dx * walk + enemy.ix) * step.dt); //abl\n'
        + '  enemy.y = Math.round(enemy.y + (dy * walk + enemy.iy) * step.dt); //abl',
    }],
  },

  {
    name: 'nobody is fooled by an image',
    about: 'any',
    why: 'is it asking each body which quarry it is nearest',
    edits: [{
      file: 'enemies.js',
      find: '    step.ship = quarryFor(world, enemy);',
      repl: '    step.ship = ship; //abl',
    }],
  },
  {
    name: 'the bait is asked once a step',
    about: 'any',
    why: 'or is it the *asking* - there is no quarry but the ship until an image stands',
    edits: [
      {
        file: 'afterimage.js',
        find: 'export function quarryFor(world, enemy) {',
        repl: 'export function imagesStanding(world) { return world.afterimage.trail.count > 0; } //abl\n'
          + 'export function quarryFor(world, enemy) {',
      },
      {
        file: 'enemies.js',
        find: "import { quarryFor } from './afterimage.js';",
        repl: "import { quarryFor, imagesStanding } from './afterimage.js'; //abl",
      },
      {
        file: 'enemies.js',
        find: '  for (let i = world.enemies.length - 1; i >= 0; i--) {',
        repl: '  const baited = imagesStanding(world); //abl\n  for (let i = world.enemies.length - 1; i >= 0; i--) {',
      },
      {
        file: 'enemies.js',
        find: '    step.ship = quarryFor(world, enemy);',
        repl: '    step.ship = baited ? quarryFor(world, enemy) : ship; //abl',
      },
    ],
  },

  {
    name: 'nobody holds a field',
    about: 'shielder',
    why: 'is it the shielder\'s own work - who covers whom, and what a shield is worth',
    edits: [{
      file: 'shields.js',
      find: 'export function updateShields(world, dt) {',
      repl: 'export function updateShields(world, dt) { return; //abl',
    }],
  },
  {
    name: 'nobody is guarded',
    about: 'shielder',
    why: 'or is it the fields reaching bodies - the relation, and not the walk',
    edits: [{
      file: 'shields.js',
      find: '      if (d2 > squared) continue;',
      repl: '      if (d2 >= 0) continue; //abl',
    }],
  },
  {
    name: 'the shielder walks like a drifter',
    about: 'shielder',
    why: 'is it the walk this kind was given, or the body it is given to walk',
    edits: [{
      file: 'kinds.js',
      find: '    stats: BALANCE.kinds.shielder,\n    walk: walksGuarding,',
      repl: '    stats: BALANCE.kinds.shielder,\n    walk: walksStraight, //abl',
    }],
  },
  {
    name: 'holdTheBand does not drift sideways',
    about: 'shielder',
    why: 'is it the sideways term of the stand-off walk - the one that keeps the band a band',
    edits: [{
      file: 'kinds.js',
      find: '  const sideways = Math.sin(step.world.elapsed * drift.rate + enemy.phase) * drift.speed;',
      repl: '  const sideways = 0; //abl',
    }],
  },
  {
    name: 'holdTheBand does not clamp to the wall',
    about: 'shielder',
    why: 'is it the bodies being held at the arena edge instead of walking past it',
    edits: [{ file: 'kinds.js', find: '  heldByTheWall(step.world, enemy);', repl: '  //abl' }],
  },
  {
    name: 'the band answer is a Float64Array',
    about: 'shielder',
    why: 'is it the three writes into the one shared scratch object holdTheBand hands back - an array'
      + ' store cannot box, so if the bytes were that, they go',
    edits: [
      { file: 'kinds.js', find: 'const band = { nx: 0, ny: 0, distance: 0 };', repl: 'const band = new Float64Array(3); // abl' },
      {
        file: 'kinds.js',
        find: '  band.nx = nx;\n  band.ny = ny;\n  band.distance = distance;',
        repl: '  band[0] = nx;\n  band[1] = ny;\n  band[2] = distance;',
      },
      {
        file: 'kinds.js',
        find: '  enemy.rot = Math.atan2(toShip.ny, toShip.nx);   // its mouth points at the ship, always\n'
          + '  if (enemy.timer > 0 || toShip.distance > spec.range.far) return;\n\n'
          + '  enemy.dirX = toShip.nx;\n  enemy.dirY = toShip.ny;',
        repl: '  enemy.rot = Math.atan2(toShip[1], toShip[0]); //abl\n'
          + '  if (enemy.timer > 0 || toShip[2] > spec.range.far) return;\n\n'
          + '  enemy.dirX = toShip[0]; //abl\n  enemy.dirY = toShip[1]; //abl',
      },
      {
        file: 'kinds.js',
        find: '  const toShip = holdTheBand(enemy, step, spec.stand, spec.drift);\n  enemy.rot = Math.atan2(toShip.ny, toShip.nx);',
        repl: '  const toShip = holdTheBand(enemy, step, spec.stand, spec.drift);\n  enemy.rot = Math.atan2(toShip[1], toShip[0]); //abl',
      },
    ],
  },

  {
    name: 'the flock does not turn toward its pulls',
    about: 'swarmling',
    why: 'is it the three pulls being added and the body turning slowly onto the answer',
    edits: [{
      file: 'kinds.js',
      find: '  turnToward(enemy, step, headingThePack(enemy, step, pack, spec), spec.turn);',
      repl: '  //abl',
    }],
  },
  {
    name: 'the flock does not update',
    about: 'swarmling',
    why: 'is it the pack being rebuilt from the crowd every step',
    edits: [{
      file: 'flock.js',
      find: 'export function updateFlocks(world, dt) {',
      repl: 'export function updateFlocks(world, dt) { return; //abl',
    }],
  },
  {
    name: 'the flock has no middle to read',
    about: 'swarmling',
    why: 'or is it the spread and the pace a clump\'s tell is built out of',
    edits: [{
      file: 'flock.js',
      find: 'function spreadOf(pack) {',
      repl: 'function spreadOf(pack) { return 0; //abl',
    }],
  },
];

/** One row's edit, against the copy: does it still name something that exists? */
export function applyEdits(edits, into) {
  const texts = new Map();
  for (const edit of edits) {
    if (!texts.has(edit.file)) texts.set(edit.file, readFileSync(path.join(GAME, 'game', edit.file), 'utf8'));
    const text = texts.get(edit.file);
    if (!text.includes(edit.find)) {
      return { ok: false, problem: `not in ${edit.file} any more: ${edit.find.slice(0, 60)}...` };
    }
    texts.set(edit.file, text.replace(edit.find, edit.repl));
  }
  for (const [file, text] of texts) writeFileSync(path.join(into, 'game', file), text);
  return { ok: true, files: [...texts.keys()] };
}

/** Which rows this run asks for: a kind's own, plus the ones that ask something of every body. */
export function chosenRows(kind, want) {
  return ROWS.filter((row) => (row.about === 'any' || row.about === kind)
    && (want === '' || row.name.toLowerCase().includes(want.toLowerCase())));
}

/** The flags this file takes. The load itself is the probe's to build. */
export function readArgs(argv) {
  const opts = {
    kind: 'mixed', row: '', list: false, bare: false, keep: false, json: false,
    steps: 400, windows: 5, scene: 'schedule',
    edit: null, find: '', repl: '', name: 'the edit you asked for',
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const next = () => { i += 1; return argv[i]; };
    if (key === '--kind') opts.kind = next();
    else if (key === '--row') opts.row = next();
    else if (key === '--scene') opts.scene = next();
    else if (key === '--steps') opts.steps = Number(next());
    else if (key === '--windows') opts.windows = Number(next());
    else if (key === '--bare') opts.bare = true;
    else if (key === '--keep') opts.keep = true;
    else if (key === '--json') opts.json = true;
    else if (key === '--list') opts.list = true;
    else if (key === '--edit') opts.edit = next();
    else if (key === '--find') opts.find = next().replace(/\\n/g, '\n');
    else if (key === '--repl') opts.repl = next().replace(/\\n/g, '\n');
    else if (key === '--name') opts.name = next();
    else throw new Error('I do not know the flag ' + key);
  }
  if (opts.edit !== null) {
    if (opts.find === '') throw new Error('--edit needs --find as well, and --repl for what to leave instead');
    opts.custom = [{ file: opts.edit, find: opts.find, repl: opts.repl }];
  }
  return opts;
}

/**
 * A fresh copy of the game to edit, and the tools to measure it with. `package.json` comes along so a
 * `node --check` of a file in the copy knows the tree is a module tree, same as the real one.
 */
export function makeCopy(into) {
  cpSync(GAME, path.join(into, 'src'), { recursive: true });
  cpSync(TOOLS, path.join(into, 'tools'), { recursive: true });
  cpSync(path.join(ROOT, 'package.json'), path.join(into, 'package.json'));
  return into;
}

/** Put the copy's game back to what the tree holds, so every row starts from the same source. */
export function resetCopy(into) {
  cpSync(GAME, path.join(into, 'src'), { recursive: true });
}

/**
 * One row, measured: the probe's own `--json` row for the scene, read off a child that ran the copy.
 * Returns a `problem` instead of a reading when the row could not be measured at all.
 */
export function measureRow(row, opts, into) {
  resetCopy(into);
  const applied = applyEdits(row.edits, path.join(into, 'src'));
  if (!applied.ok) return { name: row.name, why: row.why, problem: applied.problem };
  for (const file of applied.files) {
    const checked = spawnSync(process.execPath,
      ['--check', path.join(into, 'src', 'game', file)], { encoding: 'utf8' });
    if (checked.status !== 0) return { name: row.name, why: row.why, problem: 'does not parse' };
  }

  const args = [path.join(into, 'tools', 'alloc-probe.js'), '--json', '--scene', opts.scene,
    '--steps', String(opts.steps), '--windows', String(opts.windows)];
  if (opts.kind !== 'mixed') args.push('--kind', opts.kind);
  // Shots and sparks are levers of the load, and moving one renames the row (`tools/alloc-probe.js`
  // calls a load you built yourself "a scene you asked for"), so the row is found by not being the
  // arena rather than by its name.
  if (opts.bare) args.push('--shots', '0', '--sparks', '0');
  const run = spawnSync(process.execPath, args, { cwd: into, encoding: 'utf8', timeout: 900000 });
  const line = (run.stdout || '').split('\n').filter((l) => l.startsWith('ROWS '))[0];
  if (!line) return { name: row.name, why: row.why, problem: 'the probe printed no rows: ' + (run.stderr || '').slice(0, 200) };
  const rows = JSON.parse(line.slice(5, line.lastIndexOf(']') + 1));
  const floor = rows.find((r) => r.floor) || { bytesPerStep: 0 };
  const mine = rows.find((r) => !r.floor);
  if (!mine) return { name: row.name, why: row.why, problem: 'no load row in the reading' };
  return { name: row.name, why: row.why, bytes: mine.bytesPerStep, perBody: mine.perBody, floor: floor.bytesPerStep };
}

/** What a reading means, next to the load it came from and the empty arena under it. */
export function verdictOf(reading, baseline, floor) {
  if (reading.problem) return reading.problem;
  const left = reading.bytes - floor;
  const spent = baseline.bytes - floor;
  if (spent <= 0) return '-';
  if (reading.bytes <= floor * NOTHING_LEFT_SLACK) return 'the whole of it went';
  if (left <= spent * 0.5) return 'most of it went';
  if (left <= spent * 0.9) return 'a share went';
  return 'nothing came off';
}

function listRows() {
  console.log('The rows tools/alloc-ablate.js knows. Each one takes something out of a copy of the game'
    + ' and reads the load again.');
  for (const row of ROWS) {
    console.log(`  ${row.name} [${row.about}]`);
    console.log(`      ${row.why}`);
  }
}

export function main(argv) {
  const opts = readArgs(argv);
  if (opts.list) { listRows(); return 0; }
  if (opts.kind !== 'mixed' && BALANCE.kinds[opts.kind] === undefined) {
    console.log(`no enemy kind is called "${opts.kind}"; the kinds are `
      + Object.keys(BALANCE.kinds).join(', ') + ', or ask the mixed crowd with --kind mixed');
    return 1;
  }

  const rows = chosenRows(opts.kind, opts.row);
  if (opts.custom) {
    rows.push({ name: opts.name, about: opts.kind, why: 'the edit you asked for', edits: opts.custom });
  }
  // Every row is read *against* the untouched load, so a filtered run pays for the plain row even when
  // the filter does not name it: a row of ablations without its baseline is a list of numbers.
  if (rows.length > 0 && !rows.some((row) => row.name === 'nothing taken out')) rows.unshift(ROWS[0]);
  if (rows.length === 0) {
    console.log(`no row matches "${opts.row}" for a crowd of ${opts.kind}; try --list`);
    return 1;
  }

  const into = path.join(os.tmpdir(), `starfall-ablate-${process.pid}`);
  rmSync(into, { recursive: true, force: true });
  makeCopy(into);
  if (!opts.json) {
    console.log(`A crowd of ${opts.kind === 'mixed' ? 'every kind' : `all ${opts.kind}`}, the scene`
      + ` "${opts.scene}"${opts.bare ? ' with no shots and no sparks' : ''}, measured ${opts.steps}`
      + ` steps' worth in ${opts.windows} windows, one row per edit, in a copy at ${into}`);
  }

  const readings = [];
  for (const row of rows) {
    const reading = measureRow(row, opts, into);
    readings.push(reading);
    if (!opts.json) {
      process.stdout.write(reading.problem ? `  ${reading.name}: ${reading.problem}\n`
        : `  ${reading.name}: ${bytes(reading.bytes)} a step\n`);
    }
  }
  if (!opts.keep) rmSync(into, { recursive: true, force: true });

  const baseline = readings.find((r) => r.name === 'nothing taken out') || readings[0];
  if (baseline.problem) {
    console.log(`the plain load could not be measured (${baseline.problem}), so nothing else here can be`);
    return 1;
  }
  const floor = baseline.floor;
  if (opts.json) {
    console.log('ABLA ' + JSON.stringify({ kind: opts.kind, scene: opts.scene, baseline: baseline.bytes,
      rows: readings.map((r) => ({ name: r.name, bytes: r.bytes ?? null, problem: r.problem || '' })) }));
    return 0;
  }

  const head = ['row', 'bytes a step', 'a body', 'off the plain load', 'what that says'];
  // A load that already costs what an empty arena costs has nothing in it to attribute, and rows off it
  // would read as though they had proved something.
  const nothingToFind = baseline.bytes - floor < BODY_BYTES * 4;
  const note = nothingToFind
    ? `the plain load is "${baseline.name}" at ${bytes(baseline.bytes)} a step, which is what an empty`
      + ' arena costs on its own - there is nothing in this load to attribute, so read every row as noise'
    : `the plain load is "${baseline.name}" at ${bytes(baseline.bytes)} a step, of which ${bytes(floor)} is`
      + ' what the arena on its own costs; a row that reads nothing left is a line the crowd\'s compilation'
      + ' was leaning on, which is not the same as the line being the spender - see the header';
  const body = readings.map((r) => [r.name,
    r.problem ? r.problem : bytes(r.bytes),
    r.problem || r.perBody === null ? '-' : bytes(r.perBody),
    r.problem || r === baseline ? '-'
      : (r.bytes <= baseline.bytes ? '-' + bytes(baseline.bytes - r.bytes) : '+' + bytes(r.bytes - baseline.bytes)),
    r.problem || r === baseline ? '-'
      : verdictOf(r, baseline, floor)]);
  console.log('');
  console.log(table('WHICH LINE SPENDS THEM', note, ['l', 'r', 'r', 'r', 'l'], head, body));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  process.exitCode = main(process.argv.slice(2));
}
