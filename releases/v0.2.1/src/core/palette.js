// The one palette for the whole game (PLAN section 4).
//
// It lives in core/ rather than render/ because the simulation picks colours
// too: a dying enemy bursts in its own colour, the level-up ring is mint, and
// so on. Keeping the colours here means one definition that both sides read.
//
// Rule of the game: warm colours mean harm, cool colours mean help.

export const PALETTE = {
  // Background, drawn as a vertical gradient plus a vignette.
  bgTop: '#061029',
  bgMiddle: '#050c1e',
  bgBottom: '#02040d',
  vignette: 'rgba(0,0,0,0.55)',

  player: '#5ef7ff',
  playerLine: '#a9fdff',
  playerFill: 'rgba(94,247,255,0.18)',
  playerCore: 'rgba(255,255,255,0.9)',
  spark: '#bff9ff',
  bullet: '#5ef7ff',
  bulletCore: '#eaffff',
  bulletTrail: 'rgba(190,252,255,0.95)',

  shard: '#58ffa1',
  shardLine: '#9dffcb',
  shardFill: 'rgba(88,255,161,0.28)',

  white: '#ffffff',
  uiText: '#eafcff',
  uiDim: '#78b9dd',
  uiFaint: '#6f8fb0',
  xpBar: ['#2fe0a0', '#58ffa1', '#b6ffe0'],
  xpText: '#9dffcb',
  star: '200,235,255',

  // Enemy kinds, in the violet to amber range for now. Milestone 3 moves the
  // harmful ones into the red-to-magenta half of the palette.
  violet: '#8b6cff',
  violetFill: 'rgba(139,108,255,0.16)',
  pink: '#ff5ec4',
  pinkFill: 'rgba(255,94,196,0.16)',
  amber: '#ffb340',
  amberFill: 'rgba(255,179,64,0.13)',
};
