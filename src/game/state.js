// The states of the attract / play / game-over loop.

// The fourth one, after the attract, the play and the end.
const CHOOSING = 3;

export const STATE = {
  START: 0,
  PLAY: 1,
  OVER: 2,
  // The run is holding still while the player picks an upgrade (game/upgrades.js).
  // Nothing in the arena moves and no run time passes; the window keeps painting.
  LEVEL: CHOOSING,
};
