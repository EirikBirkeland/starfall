// The wire between the game and a coding agent.
//
// One JSON-RPC 2.0 message per line, in on stdin and out on stdout - the shape the
// Model Context Protocol uses for a server an agent starts as its own subprocess.
// The game offers tools (look at the arena, move, shoot, dash, pick an upgrade) and
// the agent calls them, which is what lets a player point any MCP-speaking agent at
// this game with one config line and no library: see tools/agent/README.md.
//
// Nothing in this file knows about Node or about the game. It takes a line of text
// and returns the answer, and is told where to send it, so a test can drive the
// whole wire with strings and never start a process.
//
// Two kinds of failure, told apart on purpose:
//
//   * an AgentError is the game refusing an order - "no upgrade is on the table" -
//     which is a perfectly good answer and goes back as a tool result that says so;
//   * anything else is a bug in here or in the session, and goes back as a protocol
//     error, because pretending a broken tool refused is how a bug becomes invisible.

/** The protocol revision this server speaks. */
export const PROTOCOL_VERSION = '2025-06-18';

/** Revisions a client may ask for that this server is willing to answer to. */
const KNOWN_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

/** The JSON-RPC 2.0 codes this server ever sends. */
export const ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
};

/** The notice levels a client may ask to be left alone with, loudest last. */
export const LEVELS = ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'];

/** The game said no, and said why. The agent reads the why. */
export class AgentError extends Error {}

/** Refuse an order: the message is written for the agent that will read it. */
export function refuse(message) {
  throw new AgentError(message);
}

/**
 * A server, ready to answer lines.
 *
 * Options: { send, name, version, instructions, listTools, callTool }
 *   send(message)         - where a message goes; called once per reply, synchronously
 *   listTools()           - the tool descriptors, as MCP wants them
 *   callTool(name, args)  - run one tool and return anything JSON-able
 */
export function createProtocol(options) {
  const opts = options || {};
  if (typeof opts.send !== 'function') throw new Error('the protocol needs somewhere to send to');
  if (typeof opts.callTool !== 'function') throw new Error('the protocol needs a tool to call');

  const send = opts.send;
  // What level of notice the client wants. It has to ask for quieter than this, and
  // the game has nothing louder than `info` to say anyway.
  let level = opts.level === undefined ? 'info' : opts.level;
  const loudEnough = (wanted) => LEVELS.indexOf(wanted) >= LEVELS.indexOf(level);
  const reply = (id, result) => ({ jsonrpc: '2.0', id: id, result: result });
  const fail = (id, code, message) => ({ jsonrpc: '2.0', id: id, error: { code: code, message: message } });

  /** What a tool said, in the shape every MCP client reads. */
  function toolSaid(data) {
    return {
      content: [{ type: 'text', text: JSON.stringify(data) }],
      structuredContent: data,
      isError: false,
    };
  }

  /** A refusal, in the same shape: the call went through, the game said no. */
  function toolRefused(message) {
    return { content: [{ type: 'text', text: message }], isError: true };
  }

  /** The answer to a tools/call, or an error response if the call was malformed. */
  function callTool(id, params) {
    if (params === null || typeof params !== 'object') return fail(id, ERROR.invalidParams, 'tools/call wants params');
    if (typeof params.name !== 'string') return fail(id, ERROR.invalidParams, 'tools/call wants the name of a tool');
    const args = params.arguments === undefined ? {} : params.arguments;
    if (args === null || typeof args !== 'object' || Array.isArray(args)) {
      return fail(id, ERROR.invalidParams, 'a tool wants its arguments as an object');
    }
    try {
      return reply(id, toolSaid(opts.callTool(params.name, args)));
    } catch (err) {
      if (err instanceof AgentError) return reply(id, toolRefused(err.message));
      throw err;
    }
  }

  function initialize(params) {
    const asked = params === undefined ? undefined : params.protocolVersion;
    return {
      // A client may ask for a revision we do not speak; the answer is the one we do.
      protocolVersion: KNOWN_VERSIONS.indexOf(asked) >= 0 ? asked : PROTOCOL_VERSION,
      capabilities: { tools: {}, logging: {} },
      serverInfo: { name: opts.name || 'starfall', version: opts.version || '0' },
      instructions: opts.instructions || '',
    };
  }

  /**
   * One message from the client, answered. A notification - or a notification-shaped
   * nobody-told-me-about - answers nothing, and answering a notification with an
   * error would be a second error.
   */
  function answer(message) {
    const askedId = message.id;
    const isRequest = askedId !== undefined && askedId !== null;
    const params = message.params === undefined ? {} : message.params;

    if (typeof message.method !== 'string') {
      return isRequest ? fail(askedId, ERROR.invalidRequest, 'no method on the request') : undefined;
    }

    switch (message.method) {
      case 'initialize':
        return isRequest ? reply(askedId, initialize(params)) : undefined;
      case 'ping':
        return isRequest ? reply(askedId, {}) : undefined;
      case 'tools/list':
        return isRequest
          ? reply(askedId, { tools: opts.listTools === undefined ? [] : opts.listTools() })
          : undefined;
      case 'tools/call':
        if (!isRequest) return undefined;
        try {
          return callTool(askedId, params);
        } catch (err) {
          return fail(askedId, ERROR.internal, 'the tool "' + params.name + '" broke: ' + err.message);
        }
      // The notifications that mean "noted", and nothing else.
      case 'notifications/initialized':
      case 'notifications/cancelled':
      case 'notifications/roots/list_changed':
        return undefined;
      case 'logging/setLevel': {
        const wanted = params.level;
        if (LEVELS.indexOf(wanted) < 0) {
          return isRequest ? fail(askedId, ERROR.invalidParams, 'no notice level is called ' + String(wanted)) : undefined;
        }
        level = wanted;
        return isRequest ? reply(askedId, {}) : undefined;
      }
      default:
        return isRequest
          ? fail(askedId, ERROR.methodNotFound, 'the game has no method called ' + String(message.method))
          : undefined;
    }
  }

  /**
   * Answer one line of text from the client, and send whatever came of it.
   * Returns true when something was sent, which is all a caller - or a test - wants.
   */
  function handleLine(line) {
    const text = String(line).trim();
    if (text === '') return false;

    let message;
    try {
      message = JSON.parse(text);
    } catch (err) {
      send(fail(null, ERROR.parse, 'that line is not JSON: ' + err.message));
      return true;
    }
    if (message === null || typeof message !== 'object' || Array.isArray(message)) {
      send(fail(null, ERROR.invalidRequest, 'expected a JSON-RPC object'));
      return true;
    }

    const out = answer(message);
    if (out === undefined) return false;
    send(out);
    return true;
  }

  /** Tell the agent something it did not ask for: a wave arrived, the run ended. */
  function notify(logger, data, at) {
    const wanted = at === undefined ? 'info' : at;
    if (!loudEnough(wanted)) return;
    send({
      jsonrpc: '2.0',
      method: 'notifications/message',
      params: { level: wanted, logger: logger, data: data },
    });
  }

  return { handleLine: handleLine, notify: notify };
}

/**
 * Cut a chunk of stdin into whole lines.
 *
 * Reads arrive wherever the writer stopped, not at message ends, so what is left
 * over is handed back to be glued to the next chunk. Returns { lines, rest }.
 */
export function splitLines(buffer, carry) {
  const text = (carry === undefined ? '' : carry) + String(buffer);
  const lines = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      lines.push(text.slice(start, i));
      start = i + 1;
    }
  }
  return { lines: lines, rest: text.slice(start) };
}

/** One message on the wire: compact JSON and a newline, and nothing else. */
export function encode(message) {
  return JSON.stringify(message) + '\n';
}
