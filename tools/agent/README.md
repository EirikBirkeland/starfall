# The agent bridge

The game, running for real, with a coding agent on the other end of the wire.

```
node tools/agent-bridge.js
```

That is the whole of it. The bridge boots the game headless - the same boot
`tools/simulate.js` plays - keeps it stepping at about one frame per 16.7 ms of
real time, and offers it as tools on stdin and stdout. An agent that can start a
subprocess and speak to it can play this game, and so can you.

Nothing about the simulation is special on this path. The agent holds the same
keys, points at the same cursor and takes the same upgrade cards a person does,
so what an agent manages here is a measure of the game and not of the tool. That
is the same rule `tools/headless/threats.js` gives the bot.

## Have a look first

```
node tools/agent-bridge.js --demo
```

prints a whole conversation: a scripted agent introduces itself, asks what there
is, picks the scatter, plays a stretch by hand with nothing but the fire button
held (it dies: that is what a ship that never moves does), hands the flying to the
bot, plays out the run, and asks for the result. Every line is exactly what an
agent would read, in and out. It takes about fifteen seconds and four minutes of
game time.

## The wire

One JSON-RPC 2.0 message per line, in on stdin, out on stdout. That is the shape
the Model Context Protocol uses for a server an agent starts as its own subprocess,
so an MCP-speaking agent can attach with no library and no plugin.

Say hello first, and the answer carries `instructions` - the brief the game wants
every player to read before it does anything:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"my-agent","version":"1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
```

Ask what there is, and call one:

```json
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"observe","arguments":{"nearest":4}}}
```

A tool's answer is in `result.structuredContent`, and the same answer as text in
`result.content[0].text`:

```json
{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"{...}"}],
 "structuredContent":{"screen":"playing","ship":{"x":1480,"y":1502,"hull":3,"dashIn":0.4,...},
 "enemies":[{"type":"drifter","x":1604,"y":1457,"distance":129,"hp":4,"hpMax":4},...],
 "moreEnemies":6,"shots":[{"x":1300,"y":1000,"in":1.5,"across":0,"from":"spitter"}]},"isError":false}}
```

**A tool that refuses is not a fault.** "no upgrade is on the table right now"
comes back as a normal answer with `isError: true` and the reason in the text,
because refusing is a good answer to a call. A tool that *breaks* comes back as a
JSON-RPC error instead, so a bug cannot hide behind a plausible sentence.

Every request is answered exactly once, including nonsense: a line that is not
JSON, a call with no tool name, a method nobody has. A notification - a message
with no `id` - is never answered, not even when it is nonsense.

Also answered, because clients ask: `ping`, `logging/setLevel`, and the
`notifications/initialized`, `notifications/cancelled` and
`notifications/roots/list_changed` notifications, which are noted and do nothing.

## The tools

Everything the game will do for you. Coordinates are arena pixels, y going down;
`observe` says how big the arena is.

| Tool | What it does |
| --- | --- |
| `status` | Where the game is - `title`, `playing`, `choosing`, `over` - with the run's score, wave, hull, level, the build so far, the cards on the table, and how long until it will take a new run. |
| `observe` | The ship, the nearest bodies and what each has promised to do, the shots in the air and when they arrive, the shards on the floor, the nova clock. `nearest` (default 10, up to 40) says how many of each sort to name, and it says how many it left out. |
| `move` | `dx` and `dy` from -1 to 1, x right and y down. The ship has no slow: outside a small dead zone, that way it goes. Both zero stops. |
| `aim` | Point at an arena point. The ship faces the cursor, so this is where the shots go. |
| `trigger` | Hold or release the fire button, at whatever the cursor is over. While the cards are up this is also an answer to them: a press takes the card under the cursor, exactly as it does for a player. |
| `dash` | A short burst that cannot be hurt, in the direction the ship is going. One, then a wait. |
| `choose` | Take upgrade card `number`, counting from 1. Only while the run is holding still for the choice. |
| `choose_weapon` | Which primary the next run flies. Between runs only - a run does not swap its gun mid-flight. |
| `start` | Begin a run, from the title or from the game-over card. Answers back the seed it played. |
| `step` | Let up to 30 seconds of game time go by, and get the state afterwards. Stops early, and says why, if the run ends or a card is dealt and nobody is flying. |
| `autopilot` | Hand the flying to the headless bot (`aware`, or `naive`) so a slow player can still play the decisions. It holds the fire button too; `on: false` gives everything back. |
| `run_result` | What the finished run was, including what killed the ship. |

Two of those deserve a second line.

**`observe` is the whole of what a player can see, and nothing behind it.** A shot
in the air comes with `in`, seconds until it arrives if nobody moves, and `across`
- how far off its line you are standing, in pixels: a dodge is making `across`
bigger. A body with a line drawn across the arena says `aiming` or `spitting`,
with the line, its own countdown and the same reading of where you stand next to
it. A bomber carries `blast`: how wide its death is, and how close it is to going
off. None of it is a number the player is not shown on the screen.

**`step` is what makes this playable by a thinking player.** Nobody can react
sixty times a second from a text prompt, so it says "let half a minute go by" and
finds out what happened. If the answer is `reason: "needs a card choice"` the game
is waiting for an answer, and `choose` is the next call. With `autopilot` on,
`step` is how you skip to the part where a decision is actually needed.

## While you are thinking

The world does not wait. It keeps stepping on the wall clock, and a long silence
is a ship that stops dodging - which is on purpose: an arena that held still until
it was asked a question would be a different and much less interesting game.

A tick that arrives late makes up a few frames and forgives the rest, exactly as
the engine forgives a backgrounded tab (`BALANCE.sim.maxFrameDt`), so a bridge that
was busy answering you is a player who looked away for a moment and not a debt the
arena has to collect.

And it tells you when something happens, unasked:

```json
{"jsonrpc":"2.0","method":"notifications/message","params":{"level":"info","logger":"starfall",
 "data":{"event":"level-up","offer":[{"number":1,"id":"fireRate","name":"FIRE RATE","effect":"+22% shots per second",...}]}}}
```

The events are `started`, `level-up` (with the cards, so you do not have to ask)
and `died` (with the whole result). Nothing is said twice - including the death,
which is reported once however many times you look at it. There is a fourth,
`wave`, which arrives every few seconds in a long run and so is sent at `debug`
level and stays out of the way; `logging/setLevel` moves the line wherever you
want it. The server never asks you for anything.

## Attaching an agent

Any MCP client can start this as a server. For Claude Code, on the command line:

```
claude mcp add starfall -- node /absolute/path/to/tools/agent-bridge.js
```

or in `.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "starfall": { "type": "stdio", "command": "node", "args": ["tools/agent-bridge.js"] }
  }
}
```

Then say "play a run of Starfall and tell me how it went". What comes back depends
on how fast the agent is: a quick one flies with `move`, `aim` and `dash`; a
thoughtful one puts `autopilot` on and spends its turns on the upgrade cards,
which is where a slow player's judgement actually counts. Other agents that speak
MCP take the same three lines; the bridge does not care who is on the other end.

One honest caveat: this wire has been tested against the protocol tests in
`test/`, and against a scripted client that plays a whole run - not against a
particular agent build. If a client does not like something, the whole wire is in
one file of about two hundred lines, and it will tell you what it refused to
understand.

## Why this and not ACP

Somebody will ask why this is not the Agent Client Protocol, and the answer is that ACP
is the wrong direction for "let an agent play the game". ACP is for an editor that
*embeds* an agent: the game would be the client, spawning an agent and streaming its
thoughts into a pane. That is a fine idea - it is roughly milestone 12's agent-assisted
hints - but what playing from the outside needs is a game that offers tools, which is
what MCP calls a server: the game offers them, whatever agent the player has pointed at
it calls them, and switching agent is a config line and nothing else.

There is no dependency in here either, which any such bridge tends to assume there
would be. Nothing was downloaded to make this work, so nothing can fail to download, and
the wire is short enough to read in one sitting.

Also not built: the part of the plan where the player picks which agent drives
*from inside the game*. That needs the game to reach out to a process, and this
game is static files opened in a browser. `tools/agent-bridge.js` is run by
whatever starts an agent, which is where that choice belongs anyway.

## The files

- `tools/agent/protocol.js` - the wire: JSON-RPC 2.0, one message per line, and
  the rules about what gets answered and what does not. Knows nothing about the
  game or about Node, so a test can hold a whole conversation in a string.
- `tools/agent/session.js` - the tools, and the front desk that turns a call into
  what a player's hands would do. Knows nothing about the wire.
- `tools/agent-bridge.js` - the executable: stdin, stdout, the frame pump, and the
  brief an agent reads first.
- `test/agent-protocol.test.mjs` - the wire, held to its promises.
- `test/agent-session.test.mjs` - every tool, against the real game.
- `test/agent-bridge.test.mjs` - the frame pump's idea of real time.
