// The wire a coding agent plays the game over (tools/agent/protocol.js).
//
// Nothing here needs a game or a child process: the protocol is a function from one
// line of text to whatever it has to say back, so the whole conversation can be held
// in a string and read in a test. What is being held to is the promise the bridge
// makes to whoever attaches to it:
//
//   every request is answered, exactly once - including the ones that are nonsense;
//   a notification is never answered, not even when it is nonsense;
//   the game saying "no" is a tool result, and the game being broken is a protocol error;
//   and the tools it advertises are the tools it has.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentError,
  ERROR,
  PROTOCOL_VERSION,
  createProtocol,
  encode,
  refuse,
  splitLines,
} from '../tools/agent/protocol.js';
import { toolList } from '../tools/agent/session.js';

/** A server, and every message it had to say. */
function server(options) {
  const sent = [];
  const opts = options || {};
  const protocol = createProtocol({
    send: (message) => sent.push(message),
    name: 'test',
    version: '1',
    instructions: 'Do the thing.',
    listTools: opts.tools === undefined ? toolList : opts.tools,
    callTool: opts.call === undefined ? (() => ({ said: 'yes' })) : opts.call,
  });
  return {
    protocol: protocol,
    sent: sent,
    ask: (message) => protocol.handleLine(JSON.stringify(message)),
    line: (text) => protocol.handleLine(text),
  };
}

const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION } };
const call = (name, args) => ({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: name, arguments: args } });

test('initialize says who is here and what it can do', () => {
  const wire = server();
  wire.ask(init);
  assert.equal(wire.sent.length, 1);
  const result = wire.sent[0].result;
  assert.equal(wire.sent[0].id, 1);
  assert.equal(result.protocolVersion, PROTOCOL_VERSION);
  assert.equal(result.serverInfo.name, 'test');
  assert.ok(result.capabilities.tools, 'a tools server has to say so');
  assert.equal(result.instructions, 'Do the thing.', 'the brief is part of the introduction');
});

test('a client asking for another revision is answered with the one we speak', () => {
  const wire = server();
  wire.ask({ jsonrpc: '2.0', id: 7, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.equal(wire.sent[0].result.protocolVersion, PROTOCOL_VERSION);

  const older = server();
  older.ask({ jsonrpc: '2.0', id: 7, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
  assert.equal(older.sent[0].result.protocolVersion, '2024-11-05');
});

test('tools/list advertises every tool, each one described', () => {
  const wire = server();
  wire.ask({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
  const tools = wire.sent[0].result.tools;
  const names = tools.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length, 'no tool may be listed twice');
  for (const tool of tools) {
    assert.ok(tool.description.length > 20, tool.name + ' has to say what it does');
    assert.equal(tool.inputSchema.type, 'object', tool.name + ' wants an object of arguments');
  }
  // The set the design promises, in one assertion, so a tool dropped by accident is
  // a failing test and not a quiet loss.
  for (const wanted of ['status', 'observe', 'move', 'aim', 'trigger', 'dash', 'choose', 'start', 'step', 'run_result']) {
    assert.ok(names.indexOf(wanted) >= 0, 'the game lost the ' + wanted + ' tool');
  }
});

test('a tool call comes back as what the tool said', () => {
  const wire = server({ call: (name, args) => ({ name: name, args: args }) });
  wire.ask(call('move', { dx: 1, dy: 0 }));
  const result = wire.sent[0].result;
  assert.equal(wire.sent[0].id, 2, 'an answer is addressed to the one who asked');
  assert.equal(wire.sent[0].jsonrpc, '2.0');
  assert.equal(result.isError, false);
  assert.deepEqual(result.structuredContent, { name: 'move', args: { dx: 1, dy: 0 } });
  assert.equal(result.content[0].type, 'text');
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent,
    'the text and the structured answer are the same answer');
});

test('the game saying no is an answer, not a fault', () => {
  const wire = server({ call: () => refuse('no upgrade is on the table right now') });
  wire.ask(call('choose', { number: 1 }));
  const result = wire.sent[0].result;
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /no upgrade is on the table/);
  assert.equal(wire.sent[0].error, undefined);
});

test('a tool that breaks is reported as a break', () => {
  const wire = server({ call: () => { throw new TypeError('cannot read hull of nothing'); } });
  wire.ask(call('observe'));
  assert.equal(wire.sent[0].error.code, ERROR.internal);
  assert.match(wire.sent[0].error.message, /cannot read hull of nothing/);
});

test('a tool call with nothing on it is still a call', () => {
  const wire = server({ call: (name, args) => ({ name: name, args: args }) });
  wire.ask({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'status' } });
  assert.deepEqual(wire.sent[0].result.structuredContent, { name: 'status', args: {} });
});

test('a call without a tool name, or with arguments that are not an object, is a bad call', () => {
  const wire = server();
  wire.ask({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: {} });
  assert.equal(wire.sent[0].error.code, ERROR.invalidParams);
  wire.ask({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'status', arguments: [1, 2] } });
  assert.equal(wire.sent[1].error.code, ERROR.invalidParams);
});

test('nonsense on the wire is answered, once, and never crashingly', () => {
  const wire = server();
  wire.line('this is not json at all');
  assert.equal(wire.sent.length, 1);
  assert.equal(wire.sent[0].error.code, ERROR.parse);
  assert.equal(wire.sent[0].id, null, 'nobody asked, so the answer is addressed to nobody');

  wire.line('[1, 2, 3]');
  assert.equal(wire.sent[1].error.code, ERROR.invalidRequest);

  wire.line('');
  wire.line('   ');
  assert.equal(wire.sent.length, 2, 'an empty line is not a message');
});

test('an unknown method answers a request and ignores a notification', () => {
  const wire = server();
  wire.ask({ jsonrpc: '2.0', id: 9, method: 'something/else' });
  assert.equal(wire.sent.length, 1);
  assert.equal(wire.sent[0].error.code, ERROR.methodNotFound);

  wire.ask({ jsonrpc: '2.0', method: 'notifications/cancelled' });
  wire.ask({ jsonrpc: '2.0', method: 'nobody/has_heard_of_this' });
  wire.ask({ jsonrpc: '2.0', method: 'tools/list' });
  assert.equal(wire.sent.length, 1, 'a notification is never answered');
});

test('ping is answered, and a ping nobody asked an answer for is not', () => {
  const wire = server();
  wire.ask({ jsonrpc: '2.0', id: 11, method: 'ping' });
  wire.ask({ jsonrpc: '2.0', method: 'ping' });
  assert.equal(wire.sent.length, 1);
  assert.deepEqual(wire.sent[0].result, {});
});

test('the server can say something nobody asked for', () => {
  const wire = server();
  wire.protocol.notify('starfall', { event: 'wave', wave: 3 });
  assert.equal(wire.sent.length, 1);
  assert.equal(wire.sent[0].method, 'notifications/message');
  assert.equal(wire.sent[0].id, undefined);
  assert.deepEqual(wire.sent[0].params.data, { event: 'wave', wave: 3 });
  assert.equal(wire.sent[0].params.level, 'info', 'with no level asked for, it is an ordinary notice');

  const quiet = server();
  quiet.protocol.notify('starfall', { event: 'wave', wave: 3 }, 'debug');
  assert.equal(quiet.sent.length, 0, 'a wave is quieter than the default level');
});

test('a client can ask to be told less', () => {
  const wire = server();
  wire.ask({ jsonrpc: '2.0', id: 12, method: 'logging/setLevel', params: { level: 'warning' } });
  assert.deepEqual(wire.sent[0].result, {});

  wire.protocol.notify('starfall', { event: 'wave' }, 'debug');
  wire.protocol.notify('starfall', { event: 'died' }, 'info');
  wire.protocol.notify('starfall', { event: 'crash' }, 'error');
  assert.equal(wire.sent.length, 2, 'everything quieter than a warning was dropped');
  assert.equal(wire.sent[1].params.level, 'error');

  const rude = server();
  rude.ask({ jsonrpc: '2.0', id: 13, method: 'logging/setLevel', params: { level: 'loud' } });
  assert.equal(rude.sent[0].error.code, ERROR.invalidParams);

  const rude2 = server();
  rude2.ask({ jsonrpc: '2.0', method: 'logging/setLevel', params: { level: 'loud' } });
  assert.equal(rude2.sent.length, 0, 'a notification about a bad level is still a notification');
});

test('one AgentError, one meaning', () => {
  assert.ok(new AgentError('x') instanceof Error);
  assert.throws(() => refuse('no'), AgentError);
});

test('a message cut in half is glued back, and one cut at the end is kept whole', () => {
  const first = encode({ jsonrpc: '2.0', id: 1, method: 'ping' });
  const second = encode({ jsonrpc: '2.0', id: 2, method: 'ping' });
  const cut = Math.floor(first.length / 2);
  const a = splitLines(first.slice(0, cut), '');
  assert.deepEqual(a.lines, [], 'half a message is not a message');
  const b = splitLines(first.slice(cut) + second, a.rest);
  assert.equal(b.lines.length, 2);
  assert.equal(b.rest, '');
  assert.deepEqual(JSON.parse(b.lines[0]).id, 1);
  assert.deepEqual(JSON.parse(b.lines[1]).id, 2);
});
