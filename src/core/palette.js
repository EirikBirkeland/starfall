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
  // The nebula behind the stars (render/nebula.js). Deep, cold, and never bright
  // enough to be mistaken for a thing in the arena - and blue, because warm means
  // harm and a cloud is not out to get you.
  nebulaDeep: '#1f3f9c',
  nebulaTeal: '#1a6f8f',

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

  // The sixth card tint (render/cards.js). The five already taken are white, the
  // player's cyan, the shard's mint, the drifter's violet and the wall's sky blue, and
  // the one cool hue nobody was wearing is a teal - so six cards can be told apart at a
  // glance by colour and not only by the shape on them.
  teal: '#25e6c0',
  // The seventh card tint. Six cool hues are spoken for, and the one left that belongs to
  // none of them is a blue indigo - bluer than the drifter's violet, deeper than the
  // wall's sky - so seven cards can still be told apart at a glance.
  indigo: '#5f7dff',
  // The eighth card tint, and the last cool hue with any room in it: a spring green, a
  // good thirty degrees round the wheel from the shard's mint so the two do not read as
  // each other. PLAN section 4 counts green as helpful alongside cyan and white, and the
  // nova's own ring in the arena wears the ship's cyan rather than this - the tint is
  // how a card is told from the other seven, not what the thing it sells is coloured.
  spring: '#7dff5e',

  white: '#ffffff',
  uiText: '#eafcff',
  uiDim: '#78b9dd',
  uiFaint: '#6f8fb0',
  xpBar: ['#2fe0a0', '#58ffa1', '#b6ffe0'],
  xpText: '#9dffcb',
  star: '#c8ebff',

  // The upgrade choice (render/cards.js). Cool through and through, because a card is
  // the best thing that can happen to you (PLAN section 4) and a warm one would read
  // as a threat.
  cardScrim: 'rgba(3,7,20,0.74)',
  cardFace: 'rgba(9,20,44,0.94)',
  cardEdge: '#3f89c9',

  // Enemy kinds. PLAN section 4 wants the harmful ones in the red-to-magenta half
  // of the palette; the darter is the first drawn from there, and the drifter's
  // violet is the last one still waiting its turn.
  violet: '#8b6cff',
  violetFill: 'rgba(139,108,255,0.16)',
  pink: '#ff5ec4',
  pinkFill: 'rgba(255,94,196,0.16)',
  amber: '#ffb340',
  amberFill: 'rgba(255,179,64,0.13)',
  red: '#ff4d6d',
  redFill: 'rgba(255,77,109,0.16)',
  orange: '#ff7a3d',
  orangeFill: 'rgba(255,122,61,0.14)',
  // The bomber is the hottest thing in the arena: it is the one enemy whose death is
  // the attack, so it sits between the darter's red and the spitter's orange and is
  // drawn with a lit fuse (render/entities.js).
  ember: '#ff4a1e',
  emberFill: 'rgba(255,74,30,0.16)',
  // An elite (PLAN 3.3): the gold that outlines one. Gold and not one of the enemies'
  // reds on purpose - PLAN section 4 asks for it, and an elite has to read as "worth
  // killing" rather than as more of the crowd. The shards stayed mint, so nothing else
  // in the arena wears this.
  elite: '#ffd76a',
  // The swarm. Twenty small bodies are the one crowd in the game that has to be read as
  // a *thing* rather than as a crowd, so it wears the one warm hue nobody else asked
  // for: a plain scarlet, deeper than the darter's coral and nowhere near the pink. At
  // seven pixels across a hue is the only thing that can tell it from a drifter, and a
  // clump of twenty of them has to look like weather coming, not like twenty enemies.
  swarm: '#ff2d55',
  swarmFill: 'rgba(255,45,85,0.20)',
  // The shielder is the magenta PLAN section 4 asks its enemies to be drawn from:
  // it sits on the far side of the pink, away from the weaver, and it is the only
  // thing in the arena wearing it, which is what lets a whole crowd be lit up by it
  // without turning into a wall of colour (render/entities.js).
  magenta: '#e04dff',
  magentaFill: 'rgba(224,77,255,0.15)',
  // The shield a shielder holds over its neighbours: the light of the bubble, and
  // the faint track of the ring the bubble grows back along while it refills. Both of
  // them warm, because a shield is harm standing between you and harm - it is not
  // help, whatever it is doing for the enemy (PLAN section 4).
  shieldLight: '#f2b6ff',
  shieldTrack: 'rgba(224,77,255,0.4)',
  // A bomber's death zone: the ring it stands in while it lives, and the light of
  // the explosion itself. Both warm, and the flash nearly white so it reads as the
  // last frame of a thing rather than as a new one (PLAN section 4).
  blastZone: '#ff6a2e',
  blastFlash: '#ffe3b0',
  // The sniper (PLAN 3.3's stationary laser). Every warm hue in the palette is
  // spoken for by something that walks, so the one thing in the arena that never
  // moves takes the deepest one: a blood red darker than the darter's coral and
  // than the swarm's scarlet, which is what lets the *white* of its eye and of its
  // beam be the loudest light on the glass instead of another red in the crowd.
  sniper: '#d81e5b',
  sniperFill: 'rgba(216,18,72,0.20)',
  // The beam: the band of harm at the width its damage is paid out at, and the
  // white-hot axis down the middle of it. Nothing else in the game is nearly white
  // for longer than a bomber's flash, which is the whole point of the kind.
  beamEdge: '#ff5f86',
  beamCore: '#fff2f6',
  // The ship's own fire (game/burn.js, PLAN 3.5's Burn). Hotter in hue than anything the
  // crowd wears - a yellow above the tank's amber, nowhere near the bomber's red - because it
  // is stamped *over* bodies of all of those colours with the light blend, which pushes
  // whatever it covers toward white and reads as a body lit from inside. The core is nearly
  // white for the same reason every hottest thing here is: the beam's axis, a bomber's flash.
  burnFlame: '#ffc23a',
  burnCore: '#fff4c9',
  // The darter's warning line (render/entities.js): the wide soft pass is the
  // enemy's own red, the thin one over it is paler, and the head of it is almost
  // white - the order your eye should read them in.
  telegraph: '#ff9fb0',
  telegraphHead: '#ffd9df',
  // An enemy's shot, and the light that fills a spitter's mouth before one leaves.
  // Warm, every one of them: cyan is yours and this is not (PLAN section 4).
  enemyShot: '#ff9a5c',
  enemyShotCore: '#fff1dd',
  spitCharge: '#ffd9a8',
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
