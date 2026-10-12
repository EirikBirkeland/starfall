// How a test listens to the game.
//
// The game queues sound cues (game/cues.js) and the audio layer takes them away once per frame,
// so the only way to ask "what did that sound like?" is to drain the queue before the audio
// layer gets it. Which is what `hear` does - and it *copies* every cue it returns, because a
// cue a drain hands out is a record borrowed from the queue's pool and is refilled with the
// next frame's sound. Anything that wants to keep one keeps a copy; a test wants to keep one.

import { copyCue, drainCues } from '../../src/game/cues.js';

/**
 * Every cue queued since the last call, in the order they were queued. `only`, if given, is
 * asked for each cue and decides whether it joins the report (`(cue) => cue.kind === 'beep'`).
 */
export function hear(only = null) {
  const out = [];
  drainCues((batch) => {
    for (const cue of batch) if (only === null || only(cue)) out.push(copyCue(cue));
  });
  return out;
}
