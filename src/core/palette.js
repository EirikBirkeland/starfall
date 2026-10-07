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
  // The thruster's flame, hottest at the nozzle.
  flameTip: '#fff0be',
  flameTail: '#ff5ec4',
  // The wake the engines drop behind the ship. Cool, and faint: it is the ship's
  // own trail, and it must never be mistaken for something that can hurt you.
  exhaust: '#2e7fb8',
  // The dash cooldown ring around the ship.
  dashRingReady: 'rgba(94,247,255,0.16)',
  dashRingWait: 'rgba(94,247,255,0.10)',
  dashRingFilling: 'rgba(169,253,255,0.55)',
  dashStreak: '#a9fdff',

  shard: '#58ffa1',
  shardLine: '#9dffcb',
  shardFill: 'rgba(88,255,161,0.28)',

  // The energy wall at the edge of the arena. Cool, like everything that is not
  // out to get you: it is the world stopping, not a hazard.
  wall: '#57b8ff',
  wallTick: '#9fdcff',

  white: '#ffffff',
  uiText: '#eafcff',
  uiDim: '#78b9dd',
  uiFaint: '#6f8fb0',
  xpBar: ['#2fe0a0', '#58ffa1', '#b6ffe0'],
  xpText: '#9dffcb',
  star: '#c8ebff',

  // Enemy kinds, in the violet to amber range for now. Milestone 3 moves the
  // harmful ones into the red-to-magenta half of the palette.
  violet: '#8b6cff',
  violetFill: 'rgba(139,108,255,0.16)',
  pink: '#ff5ec4',
  pinkFill: 'rgba(255,94,196,0.16)',
  amber: '#ffb340',
  amberFill: 'rgba(255,179,64,0.13)',
};

const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const FUNC = /^rgba?\(([^)]+)\)$/i;

/**
 * The three channels of a colour as numbers 0-255.
 *
 * Accepts everything the palette uses: '#abc', '#aabbcc', 'rgb(...)', 'rgba(...)'.
 * Anything else throws out loud: a colour that silently parsed as black would
 * put a black hole in the middle of a glow and nobody would notice for a week.
 */
export function parseColor(color) {
  if (typeof color === 'string') {
    const short = HEX3.exec(color);
    if (short) {
      return [parseInt(short[1] + short[1], 16), parseInt(short[2] + short[2], 16), parseInt(short[3] + short[3], 16)];
    }
    const long = HEX6.exec(color);
    if (long) return [parseInt(long[1], 16), parseInt(long[2], 16), parseInt(long[3], 16)];
    const func = FUNC.exec(color);
    if (func) {
      const parts = func[1].split(',').map((part) => Number(part));
      if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
        return parts.slice(0, 3).map((n) => Math.round(clampChannel(n)));
      }
    }
  }
  throw new Error('not a colour this can read: ' + String(color));
}

/** The same colour with a different opacity. The alpha in an rgba() is replaced. */
export function withAlpha(color, alpha) {
  const [r, g, b] = parseColor(color);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + Math.min(1, Math.max(0, alpha)) + ')';
}

/** `t` of the way from `from` to `to`, as a '#rrggbb' string. */
export function mixColors(from, to, t) {
  const a = parseColor(from);
  const b = parseColor(to);
  const k = Math.min(1, Math.max(0, t));
  let out = '#';
  for (let i = 0; i < 3; i++) {
    out += Math.round(a[i] + (b[i] - a[i]) * k).toString(16).padStart(2, '0');
  }
  return out;
}

// A channel is 0-255 and may arrive as a decimal ('rgb(1.7, 2.2, 3.9)').
function clampChannel(value) {
  return Math.min(255, Math.max(0, value));
}
