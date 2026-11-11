// The states of the attract / play / game-over loop.

// The fourth one, after the attract, the play and the end.
const CHOOSING = 3;
// And the fifth, for the only ending a run gets to be proud of (PLAN 3.4).
const WON = 4;

export const STATE = {
  START: 0,
  PLAY: 1,
  OVER: 2,
  // The run is holding still while the player picks an upgrade (game/upgrades.js).
  // Nothing in the arena moves and no run time passes; the window keeps painting.
  LEVEL: CHOOSING,
  // The last fight on the schedule has come down and the ship is still standing: the run is
  // won (game/run.js `winRun`). It is an ending and not a pause - no run time passes and
  // nothing in the arena can hurt anything again - but the card is not put up for
  // `BALANCE.victory.hush` seconds, so the fight's own going-down is what the player hears
  // first. The window keeps painting, the same way it does over a death. And it is the one
  // ending that can be handed back and flown on: this is where endless mode starts (game/run.js
  // `continueRun`), and the only state that has ever been asked to become `PLAY` again.
  WON: WON,
};
