#!/usr/bin/env node
// The game, running for real, with a coding agent on the other end of the wire.
//
//   node tools/agent-bridge.js                     a game on stdin/stdout, random seed
//   node tools/agent-bridge.js --seed 7            the same arena every time
//   node tools/agent-bridge.js --audio             with the fake audio device fitted
//   node tools/agent-bridge.js --verbose           say every call as it arrives
//   node tools/agent-bridge.js --demo              talk to it from here, once, to see the wire
//
// The game boots headless (the same harness tools/simulate.js plays), the world is
// stepped at about one frame per 16.7 ms of real time, and the tools in
// tools/agent/session.js are offered over JSON-RPC on stdin/stdout - one message per
// line, the shape the Model Context Protocol uses for a subprocess server, so an agent
// can be told to drive this game with no library and no plugin. tools/agent/README.md
// has the tools, the wire, and the config line that attaches one.
//
// Everything that is not the wire goes to stderr: stdout is the agent's and nothing
// else. If the agent's end closes, the game is put down and this exits.
//
// A frame the bridge could not run because it was busy answering a call is forgiven
// rather than owed, exactly as the engine forgives a slow frame (BALANCE.sim): a
// thinking agent is a player taking its time, not a debt the arena has to collect.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { bootGame } from './headless/harness.js';
import { FRAME_MS } from './headless/bot.js';
import { createProtocol, encode, splitLines, PROTOCOL_VERSION } from './agent/protocol.js';
import { callTool, createSession, toolList } from './agent/session.js';

/** How far behind the wall clock one pumped tick may try to make up. */
export const MAX_CATCHUP = Math.max(1, Math.round(BALANCE.sim.maxFrameDt / (FRAME_MS / 1000)));

const USAGE = [
  'usage: node tools/agent-bridge.js [--seed N] [--audio] [--verbose] [--demo] [--help]',
  '',
  '  --seed N      play the same arena every run (default: a fresh seed each run)',
  '  --audio       boot with the fake audio device fitted',
  '  --verbose     say every tool call on stderr as it arrives',
  '  --demo        talk to the game from here once, and print the wire',
  '',
  'The game is offered as tools on stdin/stdout, one JSON-RPC message per line.',
  'tools/agent/README.md has the tools, the wire, and how to attach an agent to it.',
].join('\n');

/** What the agent reads before it does anything: the brief. */
export const INSTRUCTIONS = [
  'Starfall: a top-down arcade game. The ship sits in an arena, faces wherever the cursor is,',
  'and shots go that way. Whatever the game offers is what you get: there is nothing to look',
  'for outside these tools.',
  '',
  'To play: `start`, then keep the ship alive. `observe` says where everything is (arena',
  'pixels, y is down); `move` drives, `aim` points, `trigger` holds the fire button, `dash`',
  'is a short burst that cannot be hurt. A shot that would arrive has an `in` in seconds and',
  'an `across` - how far off its line you are standing, in pixels. A body that is about to',
  'lunge or spit has a line drawn and a countdown.',
  '',
  'At a level the run stops and deals three upgrade cards: `status` lists them and `choose`',
  'takes one by number. Twice per run you may instead argue with the deal: `reroll` deals the',
  'whole table again and `banish` takes a card out of the run for good (both are refused, and',
  'the ask kept, when there is nothing to deal). Between runs `choose_weapon` picks the',
  'primary. `start` with `today: true` flies the daily arena - the one every player is flying on',
  'this date, and the only run whose score belongs to a day rather than to you.',
  '',
  'The game runs in real time and will not wait for you. If you cannot answer that fast, put',
  '`autopilot` on and play the decisions - the cards, the gun, when to start the next run -',
  'while the headless bot flies. `step` lets the game run while you think and hands back the',
  'state afterwards, stopping early if the run ends or a card is dealt.',
].join('\n');

/** What the screen is called, in the one line the bridge writes when it is put down. */
const SCREEN = {
  [STATE.START]: 'the title',
  [STATE.PLAY]: 'a run',
  [STATE.LEVEL]: 'an upgrade choice',
  [STATE.OVER]: 'game over',
  [STATE.WON]: 'a won run',
};

function readArgs(argv) {
  const opts = { seed: null, audio: false, verbose: false, demo: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      i++;
      return argv[i];
    };
    if (arg === '--help' || arg === '-h') {
      console.error(USAGE);
      process.exit(0);
    } else if (arg === '--seed') opts.seed = parseInt(next(), 10);
    else if (arg === '--audio') opts.audio = true;
    else if (arg === '--verbose') opts.verbose = true;
    else if (arg === '--demo') opts.demo = true;
    else {
      console.error('unknown option: ' + arg + '\n\n' + USAGE);
      process.exit(2);
    }
  }
  if (opts.seed !== null && !Number.isFinite(opts.seed)) {
    console.error('--seed wants a whole number');
    process.exit(2);
  }
  return opts;
}

/** The newest release this tree has, which is the honest version of what is playing. */
function gameVersion(root) {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(root, 'releases', 'releases.json'), 'utf8'));
    return list.length > 0 ? list[0].version : 'dev';
  } catch (err) {
    return 'dev';
  }
}

/**
 * The frame pump: one frame per tick of real time, a little more after a busy tick,
 * and no debt carried past `MAX_CATCHUP` frames.
 *
 * A bridge that was busy answering a call is a player who looked away for a moment,
 * and the engine's own rule for that is `BALANCE.sim.maxFrameDt`: catch up a little,
 * forgive the rest. Options: { now, every } - a test can hand its own clock and pass
 * `every: null` to pump it by hand.
 */
export function createPump(step, options) {
  const opts = options || {};
  const now = opts.now === undefined ? Date.now : opts.now;
  const every = opts.every === undefined ? Math.round(FRAME_MS) : opts.every;
  let last = now();
  let timer = null;

  function tick() {
    const at = now();
    const elapsed = at - last;
    last = at;
    const frames = Math.min(Math.max(1, Math.round(elapsed / FRAME_MS)), MAX_CATCHUP);
    for (let i = 0; i < frames; i++) step();
    return frames;
  }

  const pump = {
    tick: tick,
    stop: function () {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
  };
  if (every !== null) {
    timer = setInterval(tick, every);
  }
  return pump;
}

/**
 * A scripted agent, playing a whole run through the wire and printing the wire.
 *
 * It is not clever - it is a demonstration of the surface: it introduces itself, asks
 * what there is, picks a gun, flies a stretch by hand with the trigger held, hands the
 * flying to the bot, and asks for the result. Whatever the game answers goes to stdout
 * exactly as an agent would read it, including the answers it does not like.
 */
function playTheDemo(ask, spoken) {
  let id = 0;
  /** One tool call, answered. The wire is the only way to read it back. */
  const call = (name, args) => {
    id++;
    ask({ jsonrpc: '2.0', id: id, method: 'tools/call', params: { name: name, arguments: args === undefined ? {} : args } });
    const last = spoken[spoken.length - 1];
    return last !== undefined && last.result !== undefined ? last.result.structuredContent : undefined;
  };
  const say = (method, params) => {
    id++;
    ask({ jsonrpc: '2.0', id: id, method: method, params: params });
  };
  const why = (answer) => (answer === undefined ? 'time' : answer.reason);

  say('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'demo', version: '1' } });
  ask({ jsonrpc: '2.0', method: 'notifications/initialized' });
  say('tools/list');
  call('choose_weapon', { weapon: 'scatter' });
  call('start');

  // A stretch flown by hand: the trigger held and nothing else, which is about what a
  // player who has just decided to look at the screen does. It does not last.
  call('trigger', { down: true });
  let reason = why(call('step', { seconds: 5 }));
  if (reason === 'died') {
    // `step` waits out the short pause after a death, so this is taken straight away.
    call('start');
    reason = 'time';
  }

  call('autopilot', { on: true });
  call('observe');
  // Eight minutes of game time, in jumps, and no longer than the run needs.
  for (let i = 0; i < 16 && reason !== 'died'; i++) {
    reason = why(call('step', { seconds: 30 }));
  }
  call('status');
  call('run_result');
}

async function main() {
  const opts = readArgs(process.argv.slice(2));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const write = (text) => process.stdout.write(text);
  const log = (text) => console.error(text);

  const game = await bootGame({ seed: opts.seed, audio: opts.audio, root: root });
  const version = gameVersion(root);
  if (opts.demo) log('the demo is playing a run through the wire; its answers follow on stdout.');
  else log('starfall v' + version + ' is on the wire'
    + (opts.seed === null ? ', a fresh seed every run' : ', pinned to seed ' + opts.seed)
    + '. Waiting for an agent on stdin.');

  const session = createSession(game, {
    report: function (event, data, level) {
      protocol.notify('starfall', Object.assign({ event: event }, data), level);
    },
  });

  const spoken = [];
  const protocol = createProtocol({
    send: function (message) {
      write(encode(message));
      // The demo reads its own answers back out of the wire, the only way it can.
      if (opts.demo) spoken.push(message);
    },
    name: 'starfall',
    version: version,
    instructions: INSTRUCTIONS,
    listTools: toolList,
    callTool: function (name, args) {
      if (opts.verbose) log('> ' + name + ' ' + JSON.stringify(args));
      return callTool(session, name, args);
    },
  });

  if (opts.demo) {
    playTheDemo(function (message) { protocol.handleLine(JSON.stringify(message)); }, spoken);
    session.stopHolding();
    game.stop();
    log('that is the whole conversation: ' + spoken.length + ' messages, one way and the other.');
    return;
  }

  const pump = createPump(session.frame);

  let carry = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function (chunk) {
    const cut = splitLines(chunk, carry);
    carry = cut.rest;
    for (const line of cut.lines) {
      try {
        protocol.handleLine(line);
      } catch (err) {
        // Nothing should get past the protocol, and if it does the agent deserves to
        // hear about it rather than watch the game fall over quietly.
        log('the wire broke on: ' + line.slice(0, 200));
        log(String(err && err.stack ? err.stack : err));
      }
    }
  });

  function finish(why) {
    pump.stop();
    session.stopHolding();
    game.stop();
    const stats = game.stats();
    log('the agent went away (' + why + '); the game was on ' + SCREEN[stats.state]
      + ' with ' + stats.score + ' points after ' + Math.floor(stats.t) + 's.');
  }
  process.stdin.on('end', function () { finish('stdin closed'); });
  process.on('SIGINT', function () { finish('interrupted'); process.exit(0); });
  process.on('SIGTERM', function () { finish('terminated'); process.exit(0); });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch(function (err) {
    console.error('the bridge could not run: ' + (err && err.stack ? err.stack : err));
    process.exitCode = 1;
  });
}
