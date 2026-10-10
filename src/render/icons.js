// The mark every upgrade line wears: one shape and one colour per line, drawn from
// paths so it is legible at a card's worth of pixels and at a HUD icon's worth too.
//
// Two painters read these and must agree, because they are selling and then naming the same
// thing: the card rack (render/cards.js), which offers a line, and the HUD (render/hud.js),
// which lists the lines a run already owns. A player who has read a card should find the same
// picture in the corner of the screen - which is the only reason the shapes live here instead
// of in the file that first drew them.
//
// An icon is drawn centred on the origin, pointing up, every proportion a share of `size`.
// Nothing here is balance and nothing here is simulated: it is all paint.

import { PALETTE, withAlpha } from '../core/palette.js';
import { TAU } from '../core/math.js';
import { polygon, shipPath } from './shapes.js';
import { glowFor, paintGlow } from './glow.js';

// The colour each line wears, keyed by the icon name (game/upgrades.js names one shape
// and one colour per line). Hues were handed out in order, and the late cards took the colour
// the thing they sell already wears in the arena rather than inventing a hue nobody could
// name - every note below is that bargain, struck once and kept.
const TINT = {
  damage: PALETTE.white,
  fireRate: PALETTE.player,
  bulletSpeed: PALETTE.shard,
  split: PALETTE.violet,
  pierce: PALETTE.wall,
  ricochet: PALETTE.teal,
  orbitals: PALETTE.indigo,
  nova: PALETTE.spring,
  // The one warm tint on the rack, and the exception is on purpose: seven cool hues were
  // handed out before anything that is itself a flame came along, and a blue flame on a card
  // called BURN would be a joke nobody in the arena would get. The panel around it is still
  // the cool one (PALETTE.cardFace, cardEdge) and the rank pips are small, so the warmth is
  // an icon and not a card.
  burn: PALETTE.burnFlame,
  // The tenth tint, and the pale end of the wheel. Every tint handed out before it is a
  // saturated hue and this one is rime - the same colour a frozen body wears in the arena -
  // which is what lets a tenth card still be told from the nine at a glance without inventing
  // an eleventh hue nobody asked for. It goes across the wheel from BURN's warm one, which is
  // the pair the cards were always going to be.
  chill: PALETTE.chillFrost,
  // The eleventh tint, and not an eleventh hue: it is the pale mint a hull coming back already
  // wears on screen (the '+1 HULL' label, game/player.js `healPlayer`), so the card and the
  // thing it sells are the same colour on purpose and a player who has seen one has read the
  // other. The rack is out of cool hues by now - white, cyan, mint, violet, sky, teal, indigo,
  // spring, and a flame and a rime - and inventing a greenier green to keep the tints all
  // twelve degrees apart would be a colour nobody could name.
  leech: PALETTE.shardLine,
  // The twelfth tint, and - like the eleventh - not a new hue but the colour the thing itself
  // wears in the arena: the near-white heart of a shot, which is what this card loads and what
  // its ring is drawn in (render/entities.js). It is a paler cyan than FIRE RATE's and the two
  // shapes could not be less alike, which is the same bargain the tenth and eleventh tints made;
  // the rack is out of cool hues and a thirteenth invented to keep them evenly spaced would be a
  // colour nobody could name.
  overcharge: PALETTE.chargeRingReady,
  // The thirteenth tint, and - like the eleventh and the twelfth - not a thirteenth hue but the
  // colour the thing itself wears: an image is the ship's own silhouette and nothing else, so the
  // card wears the pale edge of the ship's own hull (render/entities.js strokes an image in it).
  // It is a shade off FIRE RATE's cyan and the two shapes could not be less alike, which is the
  // same bargain the last three tints made: the rack is out of hues and a fourteenth invented to
  // keep them evenly spaced would be a colour nobody could name.
  afterimage: PALETTE.playerLine,
  // The fourteenth tint, and the second warm one on the rack after BURN. It is not a fourteenth
  // hue: it is the gold of an elite's outline, which is the colour this card spends - PLAN section
  // 4 asks for shards gold, this game made the shards mint and gave the gold to whatever is worth
  // killing, and a card that turns loot into damage wears the colour of value. Warm on a card is
  // the exception BURN made (see above), and it means the same thing here as it does in the arena:
  // not a threat, a prize. The shape is nothing like the flame's either.
  magnetar: PALETTE.elite,
  // The fifteenth tint, and - following the four before it - not a fifteenth hue. It is the colour the
  // mine's own ring is drawn in on the arena floor (PALETTE.mineZone), which is the deepest saturated
  // cut of the walls' sky that the rack had left: a mine is the ship's own ordnance, so it wears the
  // ship's cool end of the wheel, and the one thing on this rack that is not like the others is that
  // nothing about it is attached to the ship at all. It is a bluer, harder blue than PIERCE's powder
  // blue and the two shapes could not be less alike.
  mines: PALETTE.mineZone,
  // The sixteenth tint, and the first one that is not a sixteenth hue *or* the thing's own colour: it
  // is the ship's own cyan, which FIRE RATE already wears. That is deliberate, and it is the rack
  // admitting what NOTES has been saying since the tenth card - there are no cool hues left to hand
  // out, and a sixteenth invented to keep them evenly spaced would be a colour nobody could name. The
  // tether wears the ship's cyan in the arena because it *is* the ship's own light drawn as a line
  // (render/entities.js), the same bargain the orbitals and the nova strike, and of the two cards now
  // wearing cyan, one is a stack of bars and the other is a ship trailing threads: they cannot be
  // mistaken for each other at any size, which is the only test a tint has to pass.
  tether: PALETTE.player,
  // The seventeenth tint, and - following the five before it - not a seventeenth hue. It is the pale
  // edge of the ship's own hull, which is what a turret is drawn in in the arena (render/entities.js
  // strokes its mount and barrel with it) because a turret is not something the ship left behind: it
  // is a piece of the ship, its own gun on a mount, still firing. AFTERIMAGE already wears this for the
  // same reason - an image is the ship as it was and nothing else - and of the two cards now wearing
  // the ship's pale edge one is a ship trailing ghosts and the other is a fence of guns across a road:
  // they cannot be mistaken for each other at any size, which is the only test a tint has to pass. It
  // also means the seventeenth card asks the canvas for no new sprite, which test/draw-cost.test.mjs
  // is watching.
  turret: PALETTE.playerLine,
  // The eighteenth card on the rack, and - following the six before it - not an eighteenth hue. It is
  // the shard's own mint, which is what the card spends and what the arena draws every one of them in
  // (render/entities.js), so a card about *how far off a shard is yours* wears exactly the colour of
  // the thing being noticed. BULLET SPEED already wears mint and the two shapes could not be less
  // alike - one is a shot with its wake, the other a wide fence with loot falling out of it - which is
  // the only test a tint has to pass, and it means this card asks the canvas for no new sprite.
  attractor: PALETTE.shard,
  // The nineteenth card on the rack, and the first one that is not a line: a synergy is two lines the
  // run already owns, so it wears both of their colours and asks the canvas for no new sprite - the
  // flame is the tint everything below it already shines with, and the frost is a stroke. The frame
  // is what tells it apart (see `drawSynergyEdges`), not a hue, which is just as well: NOTES session
  // 47 counted the glow cache and there was no room left in it for a colour of its own.
  thermalShock: PALETTE.burnFlame,
};
/**
 * The shapes, all pointing up, all cool: an impact for damage, a stack for the gun's
 * cycle, a shot with its own wake for velocity, three of them for split shot, one going
 * through two bodies for pierce, one turning from one body to the next for ricochet, a
 * ring of drones round a ship for the orbitals, and a wave caught mid-expansion off a
 * ship for the nova. Small, drawn from paths, and legible at
 * a card's worth of pixels. Each line names one of these in game/upgrades.js, and an icon
 * with no shape is a bug that says so rather than drawing the wrong thing.
 */
const ICONS = {
  damage: iconDamage,
  fireRate: iconFireRate,
  bulletSpeed: iconBulletSpeed,
  split: iconSplit,
  pierce: iconPierce,
  ricochet: iconRicochet,
  orbitals: iconOrbitals,
  nova: iconNova,
  burn: iconBurn,
  chill: iconChill,
  thermalShock: iconThermalShock,
  leech: iconLeech,
  overcharge: iconOvercharge,
  afterimage: iconAfterimage,
  magnetar: iconMagnetar,
  mines: iconMines,
  tether: iconTether,
  turret: iconTurret,
  attractor: iconAttractor,
};

/** The orbital icon: the ring's own radius, three of them on it, and a ship in the middle. */
const ORBIT_RING = 0.62;
const ORBIT_BODY = 0.16;
const ORBIT_THIRD = Math.PI * 2 / 3;
const ORBIT_TRAIL_ARC = 0.55;    // rad of bright arc behind each drone: which way it turns

/**
 * The nova icon's two rings: where the wave is and where it was a moment ago. The near
 * one is the bright one, because that is the edge that is hurting things now.
 */
const NOVA_NEAR = 0.5;
const NOVA_FAR = 0.86;
const NOVA_SHIP = 0.26;
const NOVA_TICKS = 8;

/** The three lengths of the pierce icon's shot, brightest where it started. */
const PIERCE_SHOT = [
  { from: 0.86, to: 0.14, wide: 0.17, thin: 0.13, at: 0.95 },
  { from: -0.12, to: -0.46, wide: 0.12, thin: 0.09, at: 0.55 },
  { from: -0.56, to: -0.86, wide: 0.08, thin: 0.03, at: 0.3 },
];

/**
 * The ricochet icon's two bodies, and the three legs of shot that run between them: in
 * from below, from one body to the next, and out again. Each leg is thinner and dimmer
 * than the one before it - the shot spends itself as it goes - and the last one is the
 * shot still flying after the body it found.
 */
const RICOCHET_BODY_A = [-0.06, 0.2];
const RICOCHET_BODY_B = [0.62, -0.3];
const RICOCHET_PATH = [
  { from: [-0.8, 0.84], to: RICOCHET_BODY_A, wide: 0.19, at: 0.95 },
  { from: RICOCHET_BODY_A, to: RICOCHET_BODY_B, wide: 0.14, at: 0.62 },
  { from: RICOCHET_BODY_B, to: [0.88, -0.66], wide: 0.09, at: 0.32 },
];

/**
 * How far an icon's glow reaches past the icon, as a share of `size`, and the one radius it is
 * baked at. Every icon asks for *that* sprite and stamps it scaled, so a tint costs the glow
 * cache one sprite however many sizes it is later drawn at - which is what lets a 70 px card
 * icon and a 17 px HUD icon shine with the same image (render/glow.js), and what stops a window
 * resize from minting a fresh set for the card's new width.
 */
const GLOW_OF_SIZE = 0.9;
const GLOW_BAKE = 64;

export function drawIcon(ctx, kind, cx, cy, size, tint) {
  const shape = ICONS[kind];
  if (shape === undefined) throw new Error('no icon is called ' + kind);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalCompositeOperation = 'lighter';
  paintGlow(ctx, glowFor(tint, GLOW_BAKE), 0, 0, 0.5, (size * GLOW_OF_SIZE) / GLOW_BAKE);
  ctx.globalCompositeOperation = 'source-over';
  shape(ctx, size, tint);
  ctx.restore();
}

/**
 * Three drones on a track round a ship. The track is the whole card - a thing that goes
 * round you and hurts whatever it touches - so it is drawn first and widest, with the
 * drones on it and a ship in the middle small enough that the ring reads before the ship
 * does. The short bright arc behind each drone is the direction the ring turns in.
 */
function iconOrbitals(ctx, size, tint) {
  ctx.strokeStyle = withAlpha(tint, 0.36);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, size * ORBIT_RING, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + i * ORBIT_THIRD;
    ctx.strokeStyle = withAlpha(tint, 0.7);
    ctx.lineWidth = size * 0.09;
    ctx.beginPath();
    ctx.arc(0, 0, size * ORBIT_RING, a - ORBIT_TRAIL_ARC, a);
    ctx.stroke();

    polygon(ctx, Math.cos(a) * size * ORBIT_RING, Math.sin(a) * size * ORBIT_RING,
      size * ORBIT_BODY, 4, Math.PI / 4);
    ctx.fillStyle = withAlpha(tint, 0.95);
    ctx.fill();
  }
  ctx.lineCap = 'butt';

  shipPath(ctx, 0, size * 0.05, size * 0.3, -Math.PI / 2, 1.7);
  ctx.fillStyle = withAlpha(tint, 0.8);
  ctx.fill();
}

/**
 * A wave caught on its way out of a ship: the ring where it is now, a fainter one further
 * out where it has come from, and eight short ticks between them pointing away. Two rings
 * rather than one is the whole card - a thing that expands, not a thing that sits there -
 * and the ship in the middle is small so the wave reads first.
 */
function iconNova(ctx, size, tint) {
  ctx.strokeStyle = withAlpha(tint, 0.28);
  ctx.lineWidth = size * 0.07;
  ctx.beginPath();
  ctx.arc(0, 0, size * NOVA_FAR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = withAlpha(tint, 0.5);
  ctx.lineWidth = size * 0.05;
  for (let i = 0; i < NOVA_TICKS; i++) {
    const a = (i / NOVA_TICKS) * Math.PI * 2 + Math.PI / NOVA_TICKS;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * size * (NOVA_NEAR + 0.08), Math.sin(a) * size * (NOVA_NEAR + 0.08));
    ctx.lineTo(Math.cos(a) * size * (NOVA_FAR - 0.06), Math.sin(a) * size * (NOVA_FAR - 0.06));
    ctx.stroke();
  }

  ctx.strokeStyle = withAlpha(tint, 0.95);
  ctx.lineWidth = size * 0.1;
  ctx.beginPath();
  ctx.arc(0, 0, size * NOVA_NEAR, 0, Math.PI * 2);
  ctx.stroke();

  shipPath(ctx, 0, 0, size * NOVA_SHIP, -Math.PI / 2, 1.7);
  ctx.fillStyle = withAlpha(tint, 0.9);
  ctx.fill();
}

/**
 * A shot that came in low, turned on a body, and is on its way to the next one. The kink
 * is the whole card: the shot that hit something does not stop, it goes somewhere you did
 * not point it - and the leg after the turn is thinner, because it is lighter for it.
 */
function iconRicochet(ctx, size, tint) {
  ctx.lineCap = 'round';
  for (const leg of RICOCHET_PATH) {
    ctx.beginPath();
    ctx.moveTo(leg.from[0] * size, leg.from[1] * size);
    ctx.lineTo(leg.to[0] * size, leg.to[1] * size);
    ctx.lineWidth = leg.wide * size;
    ctx.strokeStyle = withAlpha(tint, leg.at);
    ctx.stroke();
  }

  // The two bodies it found, quiet, so the path reads as going from one to the other
  // rather than as a bend in nothing.
  for (const spot of [RICOCHET_BODY_A, RICOCHET_BODY_B]) {
    polygon(ctx, spot[0] * size, spot[1] * size, size * 0.24, 4, Math.PI / 4);
    ctx.strokeStyle = withAlpha(tint, 0.5);
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}

/** A hit: a solid diamond with what came off it flying off in four directions. */
function iconDamage(ctx, size, tint) {
  polygon(ctx, 0, 0, size * 0.42, 4, Math.PI / 4);
  ctx.fillStyle = withAlpha(tint, 0.9);
  ctx.fill();
  ctx.strokeStyle = withAlpha(tint, 0.85);
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * (Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * size * 0.52, Math.sin(a) * size * 0.52);
    ctx.lineTo(Math.cos(a) * size * 0.86, Math.sin(a) * size * 0.86);
    ctx.stroke();
  }
}

/** Three of the same shot, close together, the newest one the brightest. */
function iconFireRate(ctx, size, tint) {
  for (let i = 0; i < 3; i++) {
    const dy = (i - 1) * size * 0.36;
    ctx.beginPath();
    ctx.moveTo(0, dy - size * 0.24);
    ctx.lineTo(size * 0.34, dy + size * 0.16);
    ctx.lineTo(-size * 0.34, dy + size * 0.16);
    ctx.closePath();
    ctx.fillStyle = withAlpha(tint, 0.34 + i * 0.3);
    ctx.fill();
  }
}

/** One shot, going fast enough to be leaving a wake behind it. */
function iconBulletSpeed(ctx, size, tint) {
  polygon(ctx, 0, -size * 0.1, size * 0.46, 3, -Math.PI / 2);
  ctx.fillStyle = withAlpha(tint, 0.9);
  ctx.fill();
  ctx.strokeStyle = withAlpha(tint, 0.6);
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const dy = size * (0.34 + i * 0.2);
    const half = size * (0.4 - i * 0.1);
    ctx.beginPath();
    ctx.moveTo(-half, dy);
    ctx.lineTo(half, dy);
    ctx.stroke();
  }
}

/**
 * A flame standing on a body: the fire is *on a thing*, which is the whole card - it is not
 * another projectile to throw, it is what happens to whatever you have already hit. The body
 * sits under it quiet, the way pierce's bodies do, and the flame leans a little so it is a
 * live shape and not a teardrop.
 */
function iconBurn(ctx, size, tint) {
  polygon(ctx, 0, size * 0.46, size * 0.26, 4, Math.PI / 4);
  ctx.fillStyle = withAlpha(tint, 0.16);
  ctx.fill();
  ctx.strokeStyle = withAlpha(tint, 0.45);
  ctx.lineWidth = 1.4;
  ctx.stroke();

  flamePath(ctx, 0, size * 0.36, size * 1.12, size * 0.6, size * 0.2);
  ctx.fillStyle = withAlpha(tint, 0.92);
  ctx.fill();

  flamePath(ctx, size * 0.02, size * 0.3, size * 0.52, size * 0.26, 0);
  ctx.fillStyle = withAlpha(PALETTE.burnCore, 0.9);
  ctx.fill();
}

/**
 * A body inside a shell of ice: the same quiet body the burn icon carries, because this card is
 * also about what happens to a thing you have already hit and not about one more thing to throw.
 * The hexagon is the shell the arena draws on a body that has frozen solid - the card and the
 * ice are the same shape, so a player who has seen one has read the other - and the ticks off
 * its faces are the cold going out, not a sparkle.
 */
function iconChill(ctx, size, tint) {
  polygon(ctx, 0, 0, size * 0.26, 4, Math.PI / 4);
  ctx.fillStyle = withAlpha(tint, 0.14);
  ctx.fill();
  ctx.strokeStyle = withAlpha(tint, 0.4);
  ctx.lineWidth = 1.4;
  ctx.stroke();

  polygon(ctx, 0, 0, size * 0.56, 6, 0);
  ctx.fillStyle = withAlpha(tint, 0.12);
  ctx.fill();
  ctx.strokeStyle = withAlpha(tint, 0.9);
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.lineWidth = 1.6;
  for (let i = 0; i < CHILL_TICKS; i++) {
    const angle = -Math.PI / 2 + (i / CHILL_TICKS) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(cos * size * CHILL_TICK_NEAR, sin * size * CHILL_TICK_NEAR);
    ctx.lineTo(cos * size * CHILL_TICK_FAR, sin * size * CHILL_TICK_FAR);
    ctx.strokeStyle = withAlpha(tint, CHILL_TICK_LIGHT - i * 0.1);
    ctx.stroke();
  }
}

/**
 * A body coming apart between the two of them: the same quiet diamond the burn and the chill icons
 * carry - because this card is about what happens to a thing you have already hit, not about one
 * more thing to throw - with the flame climbing its left side and a pair of rime ticks crossing
 * its right, and the shock going out of it in six short spikes. The spikes are the card: neither
 * parent has any, because neither of them is an event. No new colour and no new sprite, which is
 * what let the eighteenth card on the rack be drawn at all (see `TINT`).
 */
const SHOCK_SPKES = 6;
const SHOCK_BODY = 0.26;
const SHOCK_NEAR = 0.46;
const SHOCK_FAR = 0.78;

function iconThermalShock(ctx, size, tint) {
  // The shock first, under everything: alternating flame and rime, so the two parents are the
  // same shape and the same size and only their colour tells them apart.
  ctx.lineCap = 'round';
  for (let i = 0; i < SHOCK_SPKES; i++) {
    const angle = -Math.PI / 2 + (i / SHOCK_SPKES) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const frost = i % 2 === 1;
    ctx.beginPath();
    ctx.moveTo(cos * size * SHOCK_NEAR, sin * size * SHOCK_NEAR);
    ctx.lineTo(cos * size * SHOCK_FAR, sin * size * SHOCK_FAR);
    ctx.strokeStyle = withAlpha(frost ? PALETTE.chillFrost : tint, frost ? 0.75 : 0.9);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.lineCap = 'butt';

  // The flame, on the left of the body and leaning off it.
  flamePath(ctx, -size * 0.3, size * 0.34, size * 0.66, size * 0.34, -size * 0.1);
  ctx.fillStyle = withAlpha(tint, 0.9);
  ctx.fill();

  // The body, shared: half the fire's light and half the ice's, because that is the whole card.
  polygon(ctx, 0, 0, size * SHOCK_BODY, 4, Math.PI / 4);
  ctx.fillStyle = withAlpha(PALETTE.burnCore, 0.5);
  ctx.fill();
  ctx.strokeStyle = withAlpha(PALETTE.chillShell, 0.9);
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // And the rime on its right: two ticks, the cold going out the other way.
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 2; i++) {
    const at = size * (0.36 + i * 0.26);
    ctx.beginPath();
    ctx.moveTo(size * 0.3, -at);
    ctx.lineTo(size * 0.62, -at - size * 0.1);
    ctx.strokeStyle = withAlpha(PALETTE.chillFrost, 0.8 - i * 0.25);
    ctx.stroke();
  }
}

/** The shell's three ticks: where they start, where they stop, and how bright. */
const CHILL_TICKS = 3;
const CHILL_TICK_NEAR = 0.62;
const CHILL_TICK_FAR = 0.9;
const CHILL_TICK_LIGHT = 0.7;

/**
 * A hull pip with bodies coming back to it: the middle is the brightest thing on the card,
 * because the middle is what the card gives you, and the six chevrons around it all point
 * inwards - two deep, so the near ones are still arriving while the far ones have already
 * turned. No ring and no orbit: this is not a thing that goes round the ship, it is a price
 * that gets paid at every body that comes down (game/leech.js), and the chevrons are the
 * same language the edge arrows speak - a direction, not a decoration.
 */
const LEECH_PIP = 0.34;
const LEECH_TURNS = 3;
const LEECH_SPIN = -Math.PI / 2;
const LEECH_ROWS = [
  { at: 0.6, arm: 0.15, light: 0.8 },
  { at: 0.84, arm: 0.11, light: 0.34 },
];

function iconLeech(ctx, size, tint) {
  polygon(ctx, 0, 0, size * LEECH_PIP, 4, Math.PI / 4);
  ctx.fillStyle = withAlpha(tint, 0.85);
  ctx.fill();
  ctx.strokeStyle = withAlpha(tint, 0.95);
  ctx.lineWidth = 1.8;
  ctx.stroke();

  ctx.lineCap = 'round';
  for (const row of LEECH_ROWS) {
    ctx.lineWidth = size * 0.07;
    ctx.strokeStyle = withAlpha(tint, row.light);
    for (let i = 0; i < LEECH_TURNS; i++) {
      const a = LEECH_SPIN + i * (Math.PI * 2 / LEECH_TURNS);
      ctx.save();
      ctx.rotate(a);
      // A V with its point nearest the middle: the wings are `arm` further out and `arm`
      // off the axis, which is a chevron at any size without a second number to agree with.
      const reach = size * row.at;
      const arm = size * row.arm;
      ctx.beginPath();
      ctx.moveTo(reach + arm, -arm);
      ctx.lineTo(reach, 0);
      ctx.lineTo(reach + arm, arm);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.lineCap = 'butt';
}

/**
 * A shot standing inside a ring that has nearly closed over it: the card's picture is the ring the
 * ship wears in the arena (render/entities.js), because that ring *is* the card - an arc that
 * closes over a second of standing still, and a shot that comes out of it heavier than it went
 * in. The middle is the brightest thing on the card, as it is on DAMAGE and LEECH, for the same
 * reason: the middle is what the card gives you. No chevrons and no flame, because this is not a
 * thing arriving and not a thing happening to a body - it is the ship's own gun being loaded.
 */
const CHARGE_ARC = 0.78;      // how far round the ring has got, of a whole turn
const CHARGE_RING = 0.74;     // where the ring sits, of the icon's own size
const CHARGE_BAND = 0.13;     // and how thick it is

function iconOvercharge(ctx, size, tint) {
  const radius = size * CHARGE_RING;
  ctx.lineCap = 'round';
  ctx.lineWidth = size * CHARGE_BAND;

  ctx.strokeStyle = withAlpha(tint, 0.22);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();

  ctx.strokeStyle = withAlpha(tint, 0.95);
  ctx.beginPath();
  ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + TAU * CHARGE_ARC);
  ctx.stroke();
  ctx.lineCap = 'butt';

  polygon(ctx, 0, 0, size * 0.3, 4, Math.PI / 4);
  ctx.fillStyle = withAlpha(tint, 0.55);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.14, 0, TAU);
  ctx.fillStyle = withAlpha(PALETTE.white, 0.95);
  ctx.fill();
}

/**
 * Three of the ship in a row, going out: the streak a dash covers, told as the images it leaves
 * standing in it. The bright one at the front is where the ship is and the two behind it are
 * where it was - the same fade the arena paints them with (render/entities.js), and the same
 * shape, because the card and the thing it sells are one thing.
 */
const GHOST_PLACES = [
  { at: -0.68, light: 0.2 },
  { at: -0.24, light: 0.46 },
  { at: 0.3, light: 0.95 },
];
const GHOST_HULL = 0.3;     // the ship's own size, as a share of the icon
const GHOST_SPIKE = 1.3;    // how pointed: an image is the ship caught mid-dash
const GHOST_TRACK = 0.88;   // how far the streak runs out behind the last of them
const GHOST_TRACK_WIDE = 0.1;

function iconAfterimage(ctx, size, tint) {
  ctx.lineCap = 'round';
  ctx.lineWidth = size * GHOST_TRACK_WIDE;
  ctx.strokeStyle = withAlpha(tint, 0.22);
  ctx.beginPath();
  ctx.moveTo(-size * GHOST_TRACK, 0);
  ctx.lineTo(size * GHOST_TRACK, 0);
  ctx.stroke();
  ctx.lineCap = 'butt';

  ctx.lineWidth = size * 0.07;
  for (const ghost of GHOST_PLACES) {
    shipPath(ctx, size * ghost.at, 0, size * GHOST_HULL, -Math.PI / 2, GHOST_SPIKE);
    ctx.fillStyle = withAlpha(tint, ghost.light * 0.34);
    ctx.fill();
    ctx.strokeStyle = withAlpha(tint, ghost.light);
    ctx.stroke();
  }
}

/**
 * Six shards on the edge of the field, six short arrows falling in from them, and the ship at the
 * middle of it all: the whole card is the direction, which is the one thing that tells this apart
 * from the nova's two rings running out (game/nova.js). The shards are diamonds because a shard is
 * a diamond, and the ring they stand on is not drawn - the shards *are* the ring, and a line under
 * them would be the orbitals' track again.
 */
const FIELD_SHARDS = 6;
const FIELD_RING = 0.84;      // where the shards stand, of the icon's own size
const FIELD_SHARD = 0.14;     // how big one of them is
const FIELD_FALL_FROM = 0.66; // where a falling arrow starts, and where it ends
const FIELD_FALL_TO = 0.44;
const FIELD_FALL_WIDE = 0.065;
const FIELD_CORE = 0.33;      // the rim the field collapses to
const FIELD_SHIP = 0.24;      // the ship in the middle, small, as always

function iconMagnetar(ctx, size, tint) {
  for (let i = 0; i < FIELD_SHARDS; i++) {
    const a = -Math.PI / 2 + (i / FIELD_SHARDS) * Math.PI * 2;
    polygon(ctx, Math.cos(a) * size * FIELD_RING, Math.sin(a) * size * FIELD_RING,
      size * FIELD_SHARD, 4, Math.PI / 4);
    ctx.fillStyle = withAlpha(tint, 0.92);
    ctx.fill();
  }

  ctx.lineCap = 'round';
  ctx.lineWidth = size * FIELD_FALL_WIDE;
  ctx.strokeStyle = withAlpha(tint, 0.62);
  for (let i = 0; i < FIELD_SHARDS; i++) {
    // Half a step round from the shards, so every arrow falls between two of them and the two sets
    // never pile on each other.
    const a = -Math.PI / 2 + ((i + 0.5) / FIELD_SHARDS) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * size * FIELD_FALL_FROM, Math.sin(a) * size * FIELD_FALL_FROM);
    ctx.lineTo(Math.cos(a) * size * FIELD_FALL_TO, Math.sin(a) * size * FIELD_FALL_TO);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';

  ctx.lineWidth = size * 0.08;
  ctx.strokeStyle = withAlpha(tint, 0.95);
  ctx.beginPath();
  ctx.arc(0, 0, size * FIELD_CORE, 0, Math.PI * 2);
  ctx.stroke();

  shipPath(ctx, 0, 0, size * FIELD_SHIP, -Math.PI / 2, 1.7);
  ctx.fillStyle = withAlpha(tint, 0.85);
  ctx.fill();
}

/**
 * One flame: a round body of fire with a tip leaning `lean` px to the right, `width` px
 * across and `height` px tall, sitting on `base`. Two quadratic curves on each side is all
 * it is - a shape with no hard edges, which is what a flame is.
 */
function flamePath(ctx, cx, base, height, width, lean) {
  const tip = cx + lean;
  ctx.beginPath();
  ctx.moveTo(tip, base - height);
  ctx.quadraticCurveTo(cx + width, base - height * 0.42, cx + width * 0.6, base);
  ctx.quadraticCurveTo(cx, base + height * 0.16, cx - width * 0.6, base);
  ctx.quadraticCurveTo(cx - width, base - height * 0.42, tip, base - height);
  ctx.closePath();
}

/**
 * One muzzle and three shots leaving it: the fan a split pull makes. The middle one is
 * the brightest, because that one is the shot the player aimed and the heaviest thing
 * the gun fires.
 */
function iconSplit(ctx, size, tint) {
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(0, size * 0.44);
    ctx.rotate((i - 1) * 0.46);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.88);
    ctx.lineTo(size * 0.16, -size * 0.4);
    ctx.lineTo(-size * 0.16, -size * 0.4);
    ctx.closePath();
    ctx.fillStyle = withAlpha(tint, i === 1 ? 0.95 : 0.55);
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, size * 0.44, size * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(tint, 0.85);
  ctx.fill();
}

/**
 * One shot on its way through two bodies, and still going. The column of light gets
 * thinner and fainter the further it has travelled, which is the whole deal of the card
 * in one picture: the body behind the one you aimed at gets what is left of the shot.
 */
function iconPierce(ctx, size, tint) {
  // Bodies first, quiet, so the shot reads as going through them rather than past.
  for (const y of [0.3, -0.3]) {
    polygon(ctx, 0, y * size, size * 0.3, 4, Math.PI / 4);
    ctx.fillStyle = withAlpha(tint, 0.16);
    ctx.fill();
    polygon(ctx, 0, y * size, size * 0.3, 4, Math.PI / 4);
    ctx.strokeStyle = withAlpha(tint, 0.5);
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // Then the shot: three lengths of it, each narrower and dimmer than the one below.
  for (const s of PIERCE_SHOT) {
    ctx.beginPath();
    ctx.moveTo(-s.wide * size / 2, s.from * size);
    ctx.lineTo(s.wide * size / 2, s.from * size);
    ctx.lineTo(s.thin * size / 2, s.to * size);
    ctx.lineTo(-s.thin * size / 2, s.to * size);
    ctx.closePath();
    ctx.fillStyle = withAlpha(tint, s.at);
    ctx.fill();
  }
}

/**
 * A ship at the top of the card and the three mines it has just dropped behind it, each still
 * wearing its ring. The trail is the card and not the ship, which is why the ship is small and up at
 * the top and what you read first is the line of things falling out of its wake (game/mines.js).
 * Each mine is the hexagon-and-four-spikes shell the arena paints, with a lit eye; the rings get
 * fainter going down the line because the ones further back have been waiting longer.
 */
const MINE_PLACES = [
  { at: -0.36, ring: 0.3, light: 0.95 },
  { at: 0.16, ring: 0.26, light: 0.66 },
  { at: 0.66, ring: 0.22, light: 0.4 },
];
const MINE_SHELL = 0.13;    // the hexagon, as a share of the icon
const MINE_SPIKE = 0.055;   // and how far its spikes stand off
const MINE_DASH = 0.1;      // px of dash and px of gap on a ring, same share
const MINE_WAKE = 0.09;     // how wide the drop line down the middle is drawn
const MINE_SHIP = 0.22;     // the ship at the top of it, small, as always

function iconMines(ctx, size, tint) {
  // The wake: the way the ship was going, with the mines dropped out of it.
  ctx.lineCap = 'round';
  ctx.lineWidth = size * MINE_WAKE;
  ctx.strokeStyle = withAlpha(tint, 0.18);
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.52);
  ctx.lineTo(0, size * 0.82);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Every ring first, then every shell, so one dash setting serves them all and no shell is drawn
  // under a ring it is supposed to be inside.
  ctx.setLineDash([size * MINE_DASH, size * MINE_DASH]);
  ctx.lineWidth = 1.4;
  for (const place of MINE_PLACES) {
    ctx.strokeStyle = withAlpha(tint, place.light * 0.55);
    ctx.beginPath();
    ctx.arc(0, place.at * size, size * place.ring, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const place of MINE_PLACES) {
    const y = place.at * size;
    const r = size * MINE_SHELL;
    // One path for the shell and its four spikes, then the house two passes: a wide faint stroke
    // under a thin bright one, which is how anything here glows without a blur.
    polygon(ctx, 0, y, r, 6, Math.PI / 6);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.moveTo(Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(Math.cos(a) * (r + size * MINE_SPIKE), y + Math.sin(a) * (r + size * MINE_SPIKE));
    }
    ctx.strokeStyle = withAlpha(tint, place.light * 0.3);
    ctx.lineWidth = size * 0.09;
    ctx.stroke();
    ctx.strokeStyle = withAlpha(tint, place.light * 0.9);
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, y, size * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(PALETTE.white, place.light);
    ctx.fill();
  }

  shipPath(ctx, 0, -size * 0.72, size * MINE_SHIP, -Math.PI / 2, 1.6);
  ctx.fillStyle = withAlpha(tint, 0.9);
  ctx.fill();
}

/**
 * A ship that has turned, the three knots its dash tied along the way it came, and a thread from every
 * one of them back to the hull. The knots are spread across a turn and not down a straight line on
 * purpose: a ship flying straight drags one thread along its own wake and a ship that turns sweeps a
 * fan, and the fan is the card (game/tether.js). The threads are what you read first - bright, taut,
 * all of them meeting at the ship - and the faint line behind the knots is only the road they were tied
 * along.
 */
const TETHER_SHIP = [0.46, -0.52];
const TETHER_KNOTS = [
  { at: [-0.68, 0.02], light: 0.45 },
  { at: [-0.44, 0.44], light: 0.7 },
  { at: [-0.04, 0.74], light: 1 },
];
const TETHER_SOFT = 0.1;    // the wide faint pass under each thread, as a share of the icon
const TETHER_LINE = 1.4;    // px, the thread itself
const TETHER_DOT = 0.065;   // a knot, as a share of the icon
const TETHER_SHIP_SIZE = 0.24;
const TETHER_HEADING = -0.62;   // rad: off the road it came along, which is the whole story

function iconTether(ctx, size, tint) {
  const sx = size * TETHER_SHIP[0];
  const sy = size * TETHER_SHIP[1];

  // The road the knots were tied along, faint and wide, so the threads read as something tied to
  // somewhere and not as three lines drawn at nothing.
  ctx.lineCap = 'round';
  ctx.lineWidth = size * TETHER_SOFT;
  ctx.strokeStyle = withAlpha(tint, 0.16);
  ctx.beginPath();
  ctx.moveTo(size * -0.84, -size * 0.16);
  for (const knot of TETHER_KNOTS) ctx.lineTo(size * knot.at[0], size * knot.at[1]);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Every thread first and every knot after it, so no thread is painted over the dot it ends at.
  ctx.beginPath();
  for (const knot of TETHER_KNOTS) {
    ctx.moveTo(sx, sy);
    ctx.lineTo(size * knot.at[0], size * knot.at[1]);
  }
  ctx.strokeStyle = withAlpha(tint, 0.2);
  ctx.lineWidth = size * 0.09;
  ctx.stroke();

  for (const knot of TETHER_KNOTS) {
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(size * knot.at[0], size * knot.at[1]);
    ctx.strokeStyle = withAlpha(tint, knot.light * 0.9);
    ctx.lineWidth = TETHER_LINE;
    ctx.stroke();
  }

  for (const knot of TETHER_KNOTS) {
    ctx.beginPath();
    ctx.arc(size * knot.at[0], size * knot.at[1], size * TETHER_DOT, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(PALETTE.white, knot.light);
    ctx.fill();
  }

  shipPath(ctx, sx, sy, size * TETHER_SHIP_SIZE, TETHER_HEADING, 1.6);
  ctx.fillStyle = withAlpha(tint, 0.9);
  ctx.fill();
}

/**
 * The turret icon: the road ahead with a fence of guns laid across it, the middle one loaded and
 * throwing, and the ship below it small as always. Three of the five are drawn because three is what
 * fits in a card's worth of pixels and still says "a line across the road" rather than "a gun".
 */
const TURRET_ROAD = 0.09;      // how wide the lane is drawn across the icon
const TURRET_GUNS = [          // where the guns stand across it, and how lit each one is
  { at: -0.54, light: 0.38 },
  { at: 0, light: 1 },
  { at: 0.54, light: 0.38 },
];
const TURRET_Y = -0.2;         // the row of guns, as a share of the icon
const TURRET_MOUNT = 0.115;    // the mount, as a share of the icon
const TURRET_BARREL = 0.19;    // how far the barrel reaches up out of it
const TURRET_LINE = 1.4;       // px, the mount and the barrel
const TURRET_TRACER = 0.36;    // how far up the shot that just left reaches
const TURRET_SHELL = 0.055;    // and the shot itself
const TURRET_SHIP = 0.22;      // the ship at the bottom of it, small, as always

function iconTurret(ctx, size, tint) {
  const y = size * TURRET_Y;

  // The lane, so the guns read as laid across somewhere and not as three shapes in a row.
  ctx.lineCap = 'round';
  ctx.lineWidth = size * TURRET_ROAD;
  ctx.strokeStyle = withAlpha(tint, 0.14);
  ctx.beginPath();
  ctx.moveTo(-size * 0.82, y);
  ctx.lineTo(size * 0.82, y);
  ctx.stroke();
  ctx.lineCap = 'butt';

  for (const gun of TURRET_GUNS) {
    const x = size * gun.at;
    const r = size * TURRET_MOUNT;
    // One path for the mount and its barrel, then the house two passes: a wide faint stroke under a
    // thin bright one, which is how anything here glows without a blur.
    polygon(ctx, x, y, r, 4, Math.PI / 4);
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - size * TURRET_BARREL);
    ctx.strokeStyle = withAlpha(tint, gun.light * 0.3);
    ctx.lineWidth = size * 0.09;
    ctx.stroke();
    ctx.strokeStyle = withAlpha(tint, gun.light * 0.9);
    ctx.lineWidth = TURRET_LINE;
    ctx.stroke();
  }

  // The middle gun's own shot, which is the whole card: a gun that fires on its own.
  const muzzle = y - size * TURRET_BARREL;
  ctx.strokeStyle = withAlpha(tint, 0.5);
  ctx.lineWidth = size * 0.05;
  ctx.beginPath();
  ctx.moveTo(0, muzzle);
  ctx.lineTo(0, muzzle - size * TURRET_TRACER);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, muzzle - size * TURRET_TRACER, size * TURRET_SHELL, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(PALETTE.white, 1);
  ctx.fill();

  shipPath(ctx, 0, size * 0.66, size * TURRET_SHIP, -Math.PI / 2, 1.6);
  ctx.fillStyle = withAlpha(tint, 0.9);
  ctx.fill();
}

/**
 * A dashed fence at the very edge of the icon, three shards sitting on it, and every one of them
 * already falling in along a line that bows round on the way to the ship. The MAGNETAR card also
 * draws loot coming in, and the difference between the two shapes is the difference between the two
 * cards: that one is a place the ship carries, so its arrows are short and its ring is tight, while
 * this one is about *distance* - the loot starts as far out as the icon gets, and the ring it starts
 * on is dashed like every other reach in the arena is (a fence, not a wall). The three lines spiral
 * in rather than run straight in so the shape reads as movement and not as a wheel.
 */
const FENCE_AT = 0.86;      // where the reach is drawn, and where the loot stands on it
const FENCE_DASH = 0.075;   // px of dash and of gap, scaled with the icon like everything else
const FALL_TO = 0.3;        // a shard's line ends at the ship's shoulder
const FALL_BOW = 0.55;      // rad the line swings round on the way in - the whole spiral
const FALL_LINE = 0.055;
const FALL_SHARD = 0.125;
const FALL_WAYS = 3;
const REACH_SHIP = 0.22;    // the ship at the middle, small, as always

function iconAttractor(ctx, size, tint) {
  ctx.setLineDash([size * FENCE_DASH, size * FENCE_DASH]);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = withAlpha(tint, 0.45);
  ctx.beginPath();
  ctx.arc(0, 0, size * FENCE_AT, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.lineCap = 'round';
  const at = (angle, radius) => ({
    x: Math.cos(angle) * size * radius,
    y: Math.sin(angle) * size * radius,
  });
  for (let i = 0; i < FALL_WAYS; i++) {
    const a = -Math.PI / 2 + (i / FALL_WAYS) * TAU;
    const shard = at(a, FENCE_AT);
    const bow = at(a + FALL_BOW * 0.6, (FENCE_AT + FALL_TO) / 2);
    const nose = at(a + FALL_BOW, FALL_TO);

    ctx.lineWidth = size * FALL_LINE;
    ctx.strokeStyle = withAlpha(tint, 0.55);
    ctx.beginPath();
    ctx.moveTo(shard.x, shard.y);
    ctx.quadraticCurveTo(bow.x, bow.y, nose.x, nose.y);
    ctx.stroke();

    polygon(ctx, shard.x, shard.y, size * FALL_SHARD, 4, Math.PI / 4);
    ctx.fillStyle = withAlpha(tint, 0.92);
    ctx.fill();
  }
  ctx.lineCap = 'butt';

  shipPath(ctx, 0, 0, size * REACH_SHIP, -Math.PI / 2, 1.7);
  ctx.fillStyle = withAlpha(tint, 0.9);
  ctx.fill();
}

/** The colour `id` wears: the card's tint and the HUD's, from one table. */
export function tintOf(id) {
  const tint = TINT[id];
  if (tint === undefined) throw new Error('no tint is set for ' + id);
  return tint;
}
