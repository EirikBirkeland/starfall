// The in-run interface: score, hull, the XP bar, the lines the run is built out of, and the
// frame rate. Everything here reads the world; nothing here changes it.

import { PALETTE, withAlpha } from '../core/palette.js';
import { clockWords } from '../core/words.js';
import { BALANCE } from '../game/balance.js';
import { clamp, TAU } from '../core/math.js';
import { world } from '../game/world.js';
import { bossBlurb, bossFlare, bossHullShare, bossName, bossPhase, bossPhaseCount, bossTint, bossWarning } from '../game/bosses.js';
import { hasLeech } from '../game/leech.js';
import { leechCostOf, LINES, maxRanksOf, rankOf } from '../game/upgrades.js';
import { weaponName } from '../game/weapons.js';
import { dueOf as frontDue } from '../game/nova.js';
import { dueOf as dropDue } from '../game/mines.js';
import { dueOf as crewDue } from '../game/turret.js';
import { vacuumLeftOf } from '../game/vacuum.js';
import { endlessTime } from '../game/endless.js';
import { hudWords } from '../game/daily.js';
import { polygon, roundRect } from './shapes.js';
import { drawIcon, tintOf } from './icons.js';
import { fitOneLine } from './fit.js';
import { glowFor, paintGlow } from './glow.js';
import { view } from './canvas.js';

const PAD = 22;
const FONT_HUGE = '800 30px "Segoe UI", system-ui, sans-serif';
const FONT_LABEL = '600 11px "Segoe UI", system-ui, sans-serif';
const FONT_TINY = '700 10px "Segoe UI", system-ui, sans-serif';
const FONT_FPS = '600 10px "Segoe UI", system-ui, sans-serif';
const GLOW_CYAN = 'rgba(94,247,255,0.8)';
const GLOW_MINT = 'rgba(88,255,161,0.85)';
const GLOW_GOLD = 'rgba(255,215,106,0.85)';
// A halo is a wide faint stroke under the letters - the look of a blur for the
// price of one more stroke (see render/glow.js for why nothing blurs here).
const TEXT_HALO = 0.22;
const TEXT_HALO_WIDTH = 5;
const PIP_HALO_RADIUS = 15;

// The leech's meter (game/leech.js), pinned under the hull pips it is filling up.
const LEECH_W = 96;         // px wide - about the width of the three pips above it
const LEECH_H = 5;          // px tall
const LEECH_DROP = 26;      // px of corner below the pips for the label

/** The XP bar's gradient, built once per width instead of once per frame. */
let xpGradient = null;
let xpGradientKey = '';

function xpFill(ctx, bx, bw) {
  const key = bx + ':' + bw;
  if (key !== xpGradientKey) {
    xpGradientKey = key;
    xpGradient = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    xpGradient.addColorStop(0, PALETTE.xpBar[0]);
    xpGradient.addColorStop(0.6, PALETTE.xpBar[1]);
    xpGradient.addColorStop(1, PALETTE.xpBar[2]);
  }
  return xpGradient;
}

/**
 * Text with a halo: the same letters stroked wide and faint under themselves, which is
 * the look of a blur for one more stroke (see render/glow.js on why nothing blurs).
 * The caller sets the font. Shared by the HUD and the upgrade cards.
 */
export function haloText(ctx, text, x, y, color, halo) {
  ctx.lineWidth = TEXT_HALO_WIDTH;
  ctx.strokeStyle = withAlpha(halo, TEXT_HALO);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawHullPips(ctx, x, y) {
  // One pip per hull the ship can hold; upgrades raise the cap later, and an elite's
  // heal (game/elite.js) fills one of them back in.
  const ship = world.player;
  const pips = Math.max(ship.maxHull, ship.hull);
  const halo = glowFor(PALETTE.player, PIP_HALO_RADIUS);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < pips; i++) {
    const alive = i < ship.hull;
    const cx = x - 14 - i * 30;
    ctx.save();
    ctx.translate(cx, y);
    if (alive) paintGlow(ctx, halo, 0, 0, 0.5);
    ctx.globalAlpha = alive ? 1 : 0.2;
    ctx.strokeStyle = PALETTE.playerLine;
    ctx.fillStyle = alive ? 'rgba(94,247,255,0.28)' : 'rgba(120,185,221,0.1)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-7, 8);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-7, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
}

// The well's own meter (game/vacuum.js): how much of the ten seconds is left. Nothing is drawn
// until it opens, and then it is drawn in the gold every reward here is written in, on the one line
// of the score block that the clock and the gun leave free.
const VACUUM_W = 96;        // px wide - about the width of the word above it
const VACUUM_H = 5;         // px tall
const VACUUM_AT = 118;      // px down the glass the bar sits at, under the GUN line's baseline
const VACUUM_WORD = 8;      // px the word sits above the bar
const VACUUM_PAD = 1;       // px of track left at each end of the fill

/**
 * Where the vacuum's meter goes and how full it is, as plain numbers - the `bossBarLayout` bargain:
 * a test with no pixels can measure the box and the countdown, and the painter and the test cannot
 * disagree because only one of them does the arithmetic.
 */
export function vacuumLayout(left) {
  // The whole claim of the bar in one number: the well's clock, over the clock the row gave it.
  const frac = clamp(left / BALANCE.vacuum.duration, 0, 1);
  return {
    x: PAD,
    y: VACUUM_AT,
    w: VACUUM_W,
    h: VACUUM_H,
    frac: frac,
    open: left > 0,
    filled: Math.max(0, (VACUUM_W - VACUUM_PAD * 2) * frac),
  };
}

/**
 * The point vacuum, as a countdown: the word, and a bar emptying over the ten seconds.
 *
 * The word is what says *why* the fanfare started, and the bar is what says the moment had a length -
 * without it the ten seconds are a fluke of luck and not a reward the game handed out.
 */
function drawVacuumMeter(ctx) {
  const place = vacuumLayout(vacuumLeftOf(world));
  if (!place.open) return;
  const x = place.x;
  const y = place.y;

  ctx.font = FONT_TINY;
  haloText(ctx, BALANCE.vacuum.start.word, x, y - VACUUM_WORD, PALETTE.elite, GLOW_GOLD);

  ctx.fillStyle = PALETTE.plate;
  roundRect(ctx, x, y, place.w, place.h, 2.5);
  ctx.fill();
  if (place.filled > 1) {
    // The bar's own glow, the same wide faint stroke under the fill the XP bar uses (render/glow.js
    // is for things with a fixed radius; a bar's width is continuous).
    ctx.strokeStyle = withAlpha(PALETTE.elite, 0.3);
    ctx.lineWidth = 4;
    roundRect(ctx, x + VACUUM_PAD, y, place.filled, place.h, 2.5);
    ctx.stroke();
    ctx.fillStyle = PALETTE.elite;
    roundRect(ctx, x + VACUUM_PAD, y, place.filled, place.h, 2.5);
    ctx.fill();
  }
}

/**
 * How far the leech is from the next hull (game/leech.js). Nothing is drawn until the run has
 * bought the line - an anonymous filling bar in the corner would be a riddle - and once it has,
 * this is the one place a player can read the wait that `BALANCE.upgrades.leech` sets. A held
 * charge is a full bar, breathing: the next hull the arena takes is coming back.
 */
function drawLeechMeter(ctx, x, y) {
  if (!hasLeech(world)) return;

  const leech = world.leech;
  const held = leech.held > 0;
  const cost = leechCostOf(world);
  const frac = held ? 1 : clamp(cost > 0 ? leech.kills / cost : 0, 0, 1);
  const breathe = held ? 0.7 + 0.3 * Math.sin(world.time * 5) : 1;

  ctx.textAlign = 'right';
  ctx.font = FONT_TINY;
  ctx.fillStyle = held ? PALETTE.shardLine : PALETTE.uiFaint;
  ctx.fillText('LEECH', x, y);
  ctx.textAlign = 'left';

  const left = x - LEECH_W;
  const top = y + 6;
  ctx.fillStyle = PALETTE.plate;
  roundRect(ctx, left, top, LEECH_W, LEECH_H, 2.5);
  ctx.fill();

  const filled = Math.max(0, (LEECH_W - 2) * frac);
  if (filled > 1) {
    // The same glow the XP bar pays with: the bar itself, stroked wide and faint under
    // itself, so a meter is not worth a sprite of its own (render/glow.js).
    ctx.strokeStyle = withAlpha(PALETTE.shardLine, (held ? 0.45 : 0.22) * breathe);
    ctx.lineWidth = 5;
    roundRect(ctx, left + 1, top + 1, filled, LEECH_H - 2, 2);
    ctx.stroke();

    ctx.fillStyle = withAlpha(PALETTE.shardLine, (held ? 0.95 : 0.55) * breathe);
    roundRect(ctx, left + 1, top + 1, filled, LEECH_H - 2, 2);
    ctx.fill();
  }

  // One small hull pip at the end it is filling towards, so the bar cannot be read as XP.
  polygon(ctx, left - 9, top + LEECH_H / 2, 3.4, 4, Math.PI / 4);
  ctx.strokeStyle = withAlpha(PALETTE.shardLine, held ? breathe : 0.4);
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/**
 * The endless mark that goes beside the clock: the word, and once it has been a minute out of the
 * schedule, how many of them. The minutes are the number the crowd is being paced by - every growth
 * in the game is measured from the hand-back and from nowhere else (game/endless.js) - so they are
 * the one thing beside the clock worth knowing while the crowd is being dodged.
 */
function endlessMark(field) {
  const word = BALANCE.endless.word;
  const minutes = Math.floor(endlessTime(field) / 60);
  return minutes < 1 ? word : word + ' +' + minutes + 'm';
}

export function drawHUD(ctx, fps) {
  const W = view.W;
  const H = view.H;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Score, top-left.
  ctx.font = FONT_HUGE;
  haloText(ctx, world.score.toLocaleString('en-US'), PAD, PAD + 26, PALETTE.uiText, GLOW_CYAN);

  ctx.font = FONT_LABEL;
  haloText(ctx, 'BEST ' + Math.max(world.best, world.score).toLocaleString('en-US'), PAD, PAD + 46, PALETTE.uiDim, GLOW_CYAN);

  ctx.fillStyle = PALETTE.uiFaint;
  ctx.font = FONT_LABEL;
  // `ENDLESS` once the run has outlasted the whole schedule and been handed its arena back
  // (game/run.js `continueRun`): the clock is still going and nothing new is coming, and the one
  // way to say that is next to the clock. In gold, the colour every reward here is written in, and
  // out of the balance row, so this and the word that floats over the ship on the step it happens
  // cannot be spelled differently.
  // The clock in the same words the cards, the pause and the log say it in (core/words.js): a run
  // fifteen minutes old reads `TIME 15m02s` here and `CLEARED IN 15m02s` on the card under it, and not
  // `TIME 902s` here and `15m02s` there.
  const clockLine = 'TIME ' + clockWords(world.elapsed) + '   LV ' + world.player.level;
  ctx.fillText(clockLine, PAD, PAD + 64);
  // The two marks beside the clock are written one after the other, each measured off the last, so a
  // run that is both endless and flown on a day says both and neither word lands on top of the other.
  let markAt = PAD + ctx.measureText(clockLine).width;
  if (world.endless) {
    ctx.fillStyle = PALETTE.elite;
    const endless = '   ' + endlessMark(world);
    ctx.fillText(endless, markAt, PAD + 64);
    markAt += ctx.measureText(endless).width;
  }
  // ...and which day it is, for a run flown on one (game/daily.js). Cool and not gold: the day is a
  // fact about where the arena came from, where ENDLESS is a fact about the crowd still coming, and
  // the two of them want to be readable apart from each other when a won run is handed back and
  // carried on past both.
  const day = hudWords(world);
  if (day !== '') {
    ctx.fillStyle = PALETTE.uiDim;
    ctx.fillText('   ' + day, markAt, PAD + 64);
  }

  // Which primary the run is flying (game/weapons.js). It is picked once, on the title,
  // and this is the place it can still be read while it matters.
  ctx.fillStyle = PALETTE.uiDim;
  ctx.fillText('GUN  ' + weaponName(world), PAD, PAD + 82);

  // And, while it lasts, the well: what the fanfare was for (game/vacuum.js).
  drawVacuumMeter(ctx);

  // Hull, top-right.
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.uiDim;
  ctx.font = FONT_LABEL;
  ctx.fillText('HULL', W - PAD, PAD + 12);
  drawHullPips(ctx, W - PAD, PAD + 34);
  // And what it takes to get one back, when the run has bought a way to (game/leech.js).
  drawLeechMeter(ctx, W - PAD, PAD + 34 + LEECH_DROP);
  ctx.textAlign = 'left';

  // XP bar, bottom.
  const bw = Math.min(600, W * 0.66);
  const bh = 12;
  const bx = (W - bw) / 2;
  const by = H - 34;
  ctx.fillStyle = PALETTE.plate;
  roundRect(ctx, bx, by, bw, bh, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(94,247,255,0.28)';
  ctx.lineWidth = 1;
  roundRect(ctx, bx, by, bw, bh, 6);
  ctx.stroke();

  const frac = clamp(world.xp / world.xpNeed, 0, 1);
  const filled = Math.max(0, (bw - 4) * frac);
  if (filled > 1) {
    // The bar's own glow: the same rounded shape, stroked wide and faint.
    ctx.strokeStyle = withAlpha(PALETTE.xpBar[1], 0.3);
    ctx.lineWidth = 6;
    roundRect(ctx, bx + 2, by + 2, filled, bh - 4, 5);
    ctx.stroke();

    ctx.fillStyle = xpFill(ctx, bx, bw);
    roundRect(ctx, bx + 2, by + 2, filled, bh - 4, 5);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.font = FONT_TINY;
  haloText(ctx, 'LEVEL ' + world.player.level + '   \u00b7   ' + world.xp + '/' + world.xpNeed + ' XP', W / 2, by - 8, PALETTE.xpText, GLOW_MINT);
  ctx.textAlign = 'left';

  // Frame rate, bottom-right, unobtrusive.
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(111,143,176,0.75)';
  ctx.font = FONT_FPS;
  ctx.fillText(Math.round(fps) + ' FPS', W - PAD, H - 28);
  ctx.textAlign = 'left';

  drawBuildRail(ctx);
  // The boss, last of the interface and over all of it: the bar is the fight's own clock and
  // nothing on the screen may be allowed to hide it (PLAN section 4).
  const boss = world.boss;
  if (boss !== null) {
    if (bossWarning(boss) > 0) drawBossWarning(ctx, W, boss);
    else drawBossBar(ctx, W, boss);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The boss (PLAN section 4's "boss hull bar at the top during boss fights").
//
// Two states and one place on the glass - the top middle, which is the only strip of the
// window the score, the hull pips and the XP bar all leave alone.
//
// Before it arrives there is no bar, because there is nothing to measure: there is its name,
// big, in the colour of a telegraph, for exactly as long as the siren runs (game/bosses.js
// `warn`). When it arrives the bar takes over and it stays until the boss does not exist.
//
// The bar is filled to the hull that is left, in the colour of the phase it is in - the same
// tint the ring wears and the light it fires - and notched where the next phase begins, so the
// player can see the shape of the fight rather than only its length. The notches come out of
// the simulation's own table, so a phase cannot be drawn somewhere it does not open.
// ---------------------------------------------------------------------------

const BAR_SHARE = 0.6;        // of the window, the bar's width ...
const BAR_MAX = 700;          // ... up to this
const BAR_H = 14;
const BAR_TOP = 34;           // px from the top of the glass
const BAR_NAME = '800 15px "Segoe UI", system-ui, sans-serif';
const BAR_MARK = '700 10px "Segoe UI", system-ui, sans-serif';
const BAR_PIP_R = 3.2;        // one diamond per phase, the same shape the hull pips are
const BAR_PIP_STEP = 11;
const BAR_NOTCH_LIGHT = 0.75;
const WARN_NAME = '800 46px "Segoe UI", system-ui, sans-serif';
const WARN_MARK = '700 13px "Segoe UI", system-ui, sans-serif';
const WARN_LINE = 13;         // px of the line that says what is coming
const WARN_LINE_FLOOR = 9;    // below this it is unreadable, so it gets cut short instead
const WARN_MARGIN = 28;       // px of window kept clear at each edge for that line
const warnLineFont = (size) => '600 ' + Math.round(size) + 'px "Segoe UI", system-ui, sans-serif';
const WARN_AT = 0.34;         // where down the window the name lands, as a share of its height
const WARN_PULSE = 9;         // rad/s of anxious pulse on the warning

/** Where the boss bar goes. Exported so a test and the frame never disagree (see buildRailLayout). */
export function bossBarLayout(W) {
  const w = Math.min(BAR_MAX, W * BAR_SHARE);
  return { x: (W - w) / 2, y: BAR_TOP, w: w, h: BAR_H };
}

function drawBossBar(ctx, W, boss) {
  const bar = bossBarLayout(W);
  const share = bossHullShare(boss);
  const flare = bossFlare(boss);
  const tint = bossTint(boss);

  ctx.fillStyle = PALETTE.plate;
  roundRect(ctx, bar.x, bar.y, bar.w, bar.h, 7);
  ctx.fill();
  ctx.strokeStyle = PALETTE.bossBarTrack;
  ctx.lineWidth = 1;
  roundRect(ctx, bar.x, bar.y, bar.w, bar.h, 7);
  ctx.stroke();

  const filled = Math.max(0, (bar.w - 4) * share);
  if (filled > 1) {
    // The same trick the XP bar pays with: the shape stroked wide and faint under itself, so a
    // meter is not worth a sprite of its own (render/glow.js).
    ctx.strokeStyle = withAlpha(tint, 0.3);
    ctx.lineWidth = 6;
    roundRect(ctx, bar.x + 2, bar.y + 2, filled, bar.h - 4, 6);
    ctx.stroke();

    ctx.fillStyle = withAlpha(tint, 0.9);
    roundRect(ctx, bar.x + 2, bar.y + 2, filled, bar.h - 4, 6);
    ctx.fill();
  }

  if (flare > 0) {
    // It is shedding a phase and nothing can hurt it while it does (game/bosses.js). The bar says
    // so in the only language a player reads in a hurry: the hull goes white and breathes once.
    ctx.fillStyle = withAlpha(PALETTE.white, Math.sin(flare * Math.PI) * 0.55);
    roundRect(ctx, bar.x + 2, bar.y + 2, filled, bar.h - 4, 6);
    ctx.fill();
  }

  // Where each phase after the first begins, in the same share of the bar the simulation opens it
  // at. Read from its table, so the notch cannot drift from the number.
  ctx.strokeStyle = withAlpha(PALETTE.white, BAR_NOTCH_LIGHT);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 1; i < BALANCE.bosses.atHull.length; i++) {
    const at = bar.x + 2 + (bar.w - 4) * BALANCE.bosses.atHull[i];
    ctx.moveTo(at, bar.y + 3);
    ctx.lineTo(at, bar.y + bar.h - 3);
  }
  ctx.stroke();

  // The name over the bar's left end, and the phase it is on over the right: one diamond each,
  // filled up to the one being fought, so a boss with a phase left to come looks like one.
  ctx.font = BAR_NAME;
  haloText(ctx, bossName(boss), bar.x + 2, bar.y - 8, PALETTE.uiText, withAlpha(tint, 0.7));

  ctx.font = BAR_MARK;
  ctx.fillStyle = PALETTE.uiDim;
  ctx.textAlign = 'right';
  ctx.fillText('PHASE ' + bossPhase(boss) + '/' + bossPhaseCount(boss), bar.x + bar.w - 2, bar.y - 8);
  ctx.textAlign = 'left';

  const first = bar.x + 2 + (bar.w - 4) * share;
  for (let i = 0; i < bossPhaseCount(boss); i++) {
    polygon(ctx, bar.x + bar.w + 14 + i * BAR_PIP_STEP, bar.y + bar.h / 2, BAR_PIP_R, 4, Math.PI / 4);
    if (i < bossPhase(boss)) {
      ctx.fillStyle = withAlpha(tint, 0.95);
      ctx.fill();
    } else {
      ctx.strokeStyle = withAlpha(tint, 0.3);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  // The bar's own glow, on the hull that is left rather than the whole track: the fight is what
  // shines, and an empty bar shining would be a lie.
  if (filled > 1) paintGlow(ctx, glowFor(tint, 26), first, bar.y + bar.h / 2, 0.35);
}

/**
 * The name before the thing is: the siren made visible, for exactly as long as the siren runs - and
 * under it, in one line, what the fight is going to do. That line (`blurb` on the boss's row) is the
 * only words the arena ever spends on a boss, and the only moment a player is told anything before it
 * starts: the Eclipse drags, which is the one thing about it you cannot read off a shape.
 */
function drawBossWarning(ctx, W, boss) {
  const pulse = 0.6 + 0.4 * Math.sin(world.time * WARN_PULSE);
  const y = view.H * WARN_AT;

  ctx.textAlign = 'center';
  ctx.font = WARN_NAME;
  haloText(ctx, bossName(boss), W / 2, y, withAlpha(PALETTE.bossWarn, pulse),
    withAlpha(PALETTE.bossBar, 0.5));
  ctx.font = WARN_MARK;
  haloText(ctx, 'INCOMING', W / 2, y + 24, withAlpha(PALETTE.bossWarn, pulse * 0.8),
    withAlpha(PALETTE.bossBar, 0.4));
  // Quieter than the alarm above it on purpose: the name and the pulse are the warning, and this is
  // only the sentence you get to read while you still have time to read it. It is fitted to the
  // window rather than to the width the sentence was written at (render/fit.js) - a warning that
  // runs off the edge explains nothing.
  const line = fitOneLine(ctx, bossBlurb(boss), {
    widest: W - WARN_MARGIN * 2, size: WARN_LINE, minSize: WARN_LINE_FLOOR,
    fontFor: warnLineFont,
  });
  haloText(ctx, line.text, W / 2, y + 46, withAlpha(PALETTE.uiText, pulse * 0.75),
    withAlpha(PALETTE.bossBar, 0.4));
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// The rail: what the run is built out of, down the left edge (PLAN section 4).
//
// One row per line the run has taken, in the deck's own order, so the column reads as the rack
// does: DAMAGE above FIRE RATE above SPLIT SHOT, in the shapes the cards sold them in (the icons
// live in render/icons.js for exactly that reason). A row is the mark, then one pip per rank it
// has - the same pips the card drew, minus the next-rank pulse, which is a promise about a card and
// so belongs on the card.
//
// Three of the lines hand a thing out on a wait that the arena cannot show - the next nova front,
// the next row of mines, the next turret crew - and those three wear an arc that closes over the
// wait, the same message the dash's cooldown ring round the ship gives. The other lines have no
// wait to be told about: they are either always on (the gun lines, the orbital ring, the fire and
// the frost) or they already have a meter of their own somewhere the eye already goes - the
// overcharge and the magnetar field round the hull, the leech under the hull pips.
//
// Nothing is written here about *which* lines: a row exists because `rankOf` is above zero, so a
// line that is maxed, banished after being taken, or a synergy the run found is on the rail like
// anything else.
// ---------------------------------------------------------------------------

const RAIL_LEFT = PAD + 6;    // the rail's left edge, in line with the score
const RAIL_TOP = 116;         // clear of the score, BEST, TIME and GUN lines
const RAIL_BOTTOM = 52;       // the room the XP bar and its label keep at the bottom
const STRIDE_MAX = 26;        // one row at the size the marks were drawn to be ...
const STRIDE_MIN = 15;        // ... and the smallest they may get before the rail wraps
const ICON_OF = 0.36;         // the mark's size, as a share of a row
const RING_OF = 0.46;         // ... and the wait ring's radius
const PIP_R = 2.1;            // a rank pip and its pitch: one pip per rank the line has, which is
const PIP_STEP = 5.6;         //   five for everything in the deck bar the one-line synergy
const PIP_ROOM = 6;           // px of air between a mark and its first pip
const DEEPEST = LINES.reduce((deepest, line) => Math.max(deepest, maxRanksOf(line.id)), 1);
const PIP_BLOCK = PIP_STEP * (DEEPEST - 1) + PIP_R * 2;   // the widest row of pips it can be asked for
const RING_SOFT = 0.19;       // the wide faint pass under the wait ring, as a share of a row
const RING_LINE = 0.077;

/**
 * The lines that wait on a beat, and who answers for it. Three modules own these waits and each
 * one answers the same question about its own, so the rail does not have to know that a nova keeps
 * `wait` against a beat it was armed with while a mine counts down the deck's whole cycle.
 */
const WAITS = new Map([['nova', frontDue], ['mines', dropDue], ['turret', crewDue]]);

/**
 * Where every row of the rail lands, for `count` owned lines in a window of W x H.
 *
 * The whole row is a share of its own stride, and the stride is whatever the window's left edge
 * can give: a tall window gets rows at the size the marks were drawn to be, a short one pays in
 * smaller rows rather than fewer of them - a run's build is never cut short to fit the screen.
 * When even the smallest row will not fit going down, the rail wraps into a second column beside
 * the first, and a third if it must.
 *
 * Exported because the frame that draws it and the tests that measure it must never disagree
 * about where a row is (the same bargain render/cards.js strikes with `cardLayout`).
 */
export function buildRailLayout(count, W, H) {
  const room = Math.max(STRIDE_MIN, H - RAIL_TOP - RAIL_BOTTOM);
  const stride = clamp(room / Math.max(1, count), STRIDE_MIN, STRIDE_MAX);
  const pitch = stride * RING_OF * 2 + PIP_ROOM + PIP_BLOCK;
  // A column holds as many rows as the window is tall; a second one starts beside it when it will
  // not hold them all. The rail may never eat more than half the window, though: past that the
  // arena is behind a wall of pips, and a run that owns that many lines has been playing a long
  // time and can afford to read small ones.
  const perColumn = Math.max(1, Math.floor(room / stride));
  const columns = clamp(Math.ceil(count / perColumn), 1,
    Math.max(1, Math.floor((W * 0.5 - RAIL_LEFT) / pitch)));
  const rows = Math.max(1, Math.ceil(count / columns));

  const places = [];
  for (let i = 0; i < count; i++) {
    const left = RAIL_LEFT + stride * RING_OF + Math.floor(i / rows) * pitch;
    places.push({
      x: left,
      y: RAIL_TOP + stride * ((i % rows) + 0.5),
      stride: stride,
      icon: stride * ICON_OF,
      ring: stride * RING_OF,
      pips: left + stride * RING_OF + PIP_ROOM,
    });
  }
  return places;
}

/** The lines this run has taken, in the deck's order. */
function ownedLines() {
  const owned = [];
  for (const line of LINES) {
    if (rankOf(world, line.id) > 0) owned.push(line);
  }
  return owned;
}

/**
 * Where a row's rank pips are drawn: `ranks` of them, evenly pitched to the right of its mark.
 * Exported for the same reason as the layout above - the test that counts a row's pips and the row
 * that draws them must never disagree about where one sits.
 */
export function pipsOf(place, ranks) {
  const xs = [];
  for (let i = 0; i < ranks; i++) xs.push(place.pips + i * PIP_STEP);
  return xs;
}

function drawBuildRail(ctx) {
  const owned = ownedLines();
  if (owned.length === 0) return;

  const places = buildRailLayout(owned.length, view.W, view.H);
  for (let i = 0; i < owned.length; i++) {
    drawBuildRow(ctx, owned[i], places[i]);
  }
}

function drawBuildRow(ctx, line, place) {
  const tint = tintOf(line.icon);
  const wait = WAITS.get(line.id);
  if (wait !== undefined) {
    drawWaitRing(ctx, place, wait(world), tint);
  }

  drawIcon(ctx, line.icon, place.x, place.y, place.icon, tint);

  // Taken ranks are filled in the line's own colour, the room that is left is a faint outline:
  // the row says how deep the run went, and a maxed line is a row with nothing faint left in it.
  const total = maxRanksOf(line.id);
  const have = rankOf(world, line.id);
  const pips = pipsOf(place, total);
  for (let i = 0; i < total; i++) {
    polygon(ctx, pips[i], place.y, PIP_R, 4, Math.PI / 4);
    if (i < have) {
      ctx.fillStyle = withAlpha(tint, 0.95);
      ctx.fill();
    } else {
      ctx.strokeStyle = withAlpha(tint, 0.26);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

/**
 * The wait, as an arc closing round the line's mark: a track, then a wide faint pass under a thin
 * bright one, which is how anything here shines without a blur (render/glow.js). Whole means the
 * next one is happening now. It is the same three strokes the dash's cooldown, the overcharge and
 * the magnetar field spend round the hull, in the line's own colour at a row's worth of pixels.
 */
function drawWaitRing(ctx, place, due, tint) {
  ctx.lineWidth = Math.max(1, place.stride * RING_LINE);
  ctx.strokeStyle = withAlpha(tint, 0.22);
  ctx.beginPath();
  ctx.arc(place.x, place.y, place.ring, 0, TAU);
  ctx.stroke();

  const sweep = TAU * clamp(due, 0, 1);
  if (sweep <= 0) return;

  ctx.lineWidth = Math.max(2, place.stride * RING_SOFT);
  ctx.strokeStyle = withAlpha(tint, 0.26);
  ctx.beginPath();
  ctx.arc(place.x, place.y, place.ring, -Math.PI / 2, -Math.PI / 2 + sweep);
  ctx.stroke();

  ctx.lineWidth = Math.max(1, place.stride * RING_LINE);
  ctx.strokeStyle = withAlpha(tint, 0.95);
  ctx.beginPath();
  ctx.arc(place.x, place.y, place.ring, -Math.PI / 2, -Math.PI / 2 + sweep);
  ctx.stroke();
}
