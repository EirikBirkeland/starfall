// The awards on the glass: a plate that lands when a run wins one (game/awards.js).
//
// A run earns an award in the middle of a fight, and the fight is the reason the plate has to be
// small: the eye is on the crowd and not on a menu, and an award that stops the player to be read
// has cost more than it paid. So it is one plate of two lines - what the award is called, and what
// it was earned for with what it pays - that lands under the top of the window, holds, and fades.
//
// The mixer readout (render/volume.js) is the precedent, and it is the same shape for the same
// reasons: it is frame state and not run state, its clock is burnt by the frame (`advanceToasts`)
// and not by the step, and the arithmetic that says where everything goes lives in `toastLayout`
// so that a test with no pixels can still measure the boxes and read the words that landed in them.
//
// What arrives here has already been decided by the game: `game/awards.js` queues an id while the
// run is flying, main.js drains the queue into `pushAwardToast` once per frame, and nothing in
// here knows what a threshold is. An award won *at* an ending is never a plate at all - the
// ending's card names it instead (ui/screens.js), because a plate over the card that already says
// the same thing is two things to read at once.

import { PALETTE, withAlpha } from '../core/palette.js';
import { fitOneLine } from './fit.js';
import { haloText } from './hud.js';
import { roundRect } from './shapes.js';
import { view } from './canvas.js';

const PLATE = {
  wide: 320,          // px: every plate the same width, so a stack of them reads as one stack
  tall: 52,           // px of one plate
  gap: 8,             // px between two plates in a stack
  top: 84,            // px from the top of the glass: under the boss bar, clear of the score
  radius: 10,         // px of corner on the plate
  side: 15,           // px of plate to the left of the words
  bar: 3,             // px of the gold edge that says "this one paid you"
  hold: 3.1,          // s a plate stays fully up
  fade: 0.55,         // s it spends going away at the end of that
  arrive: 0.18,       // s it spends coming in
  drop: 14,           // px it falls through on its way in
  max: 4,             // plates at once; a fifth is a queue nobody asked for and it goes on unread
};

const FONT_NAME = '800 15px "Segoe UI", system-ui, sans-serif';
const FONT_DUST = '700 11px "Segoe UI", system-ui, sans-serif';
const WHY_SIZE = 10;      // px of the line that says what the award was earned for
const WHY_FLOOR = 8;      // below this it is unreadable, so it gets cut short instead
const whyFont = (size) => '600 ' + Math.round(size) + 'px "Segoe UI", system-ui, sans-serif';
const NAME_Y = 21;      // px of the name's baseline inside the plate
const WHY_Y = 40;       // ...and the line under it
const DUST_WORD = '+';
const DUST_UNIT = ' STARDUST';

// Frame state: what is up, and how old each one is. Not run state - a plate is about the frame
// being drawn, and it outlives a run by the second or so it takes to fade (see the note above on
// awards won at an ending, which never get here at all).
let plates = [];

/**
 * Put one award on the glass. `award` is `{ name, says, dust }` - what a plate needs to say and
 * nothing else, so this module never has to know what an award *is* (game/awards.js).
 *
 * A fifth plate in a window is not information, it is a pile, and a pile is unreadable by the time
 * the second one lands: the oldest goes instead, mid-fade if it was mid-fade.
 */
export function pushAwardToast(award) {
  if (plates.length >= PLATE.max) plates.shift();
  plates.push({ name: award.name, says: award.says, dust: award.dust, age: 0 });
}

/** Burn the plates' clocks. main.js calls this on the frame's time, like the sky. */
export function advanceToasts(dt) {
  for (let i = plates.length - 1; i >= 0; i--) {
    plates[i].age += dt;
    if (plates[i].age >= PLATE.hold + PLATE.fade) plates.splice(i, 1);
  }
}

/** How many plates are up. For a test that wants to know whether anything was painted. */
export function toastCount() {
  return plates.length;
}

/** Take every plate off the glass at once. */
export function clearToasts() {
  plates.length = 0;
}

/**
 * Where everything goes, in window pixels: one plate per award up, newest at the bottom of a stack
 * that starts under the boss bar. Each plate carries its own brightness (`glow`, 0 to 1: in over
 * `arrive` seconds, out over `fade` at the end of its hold) and how far it still has to fall.
 */
export function toastLayout() {
  const x = (view.W - PLATE.wide) / 2;
  const out = [];
  for (let i = 0; i < plates.length; i++) {
    const plate = plates[i];
    const age = plate.age;
    const arrived = age < PLATE.arrive ? age / PLATE.arrive : 1;
    const left = PLATE.hold + PLATE.fade - age;
    const away = left < PLATE.fade ? left / PLATE.fade : 1;
    const top = PLATE.top + i * (PLATE.tall + PLATE.gap) - PLATE.drop * (1 - arrived);
    out.push({
      name: plate.name,
      says: plate.says,
      dust: plate.dust,
      x: x,
      y: top,
      w: PLATE.wide,
      h: PLATE.tall,
      glow: Math.min(arrived, away),
      // Where the three pieces of the plate go, said separately because that is where a test
      // looks: the plate moves and its words move with it, and a number nobody can read back is a
      // decoration. `dustX` is the *right* edge of the money, which is drawn right-aligned.
      nameY: top + NAME_Y,
      dustY: top + NAME_Y,
      dustX: x + PLATE.wide - PLATE.side,
      whyY: top + WHY_Y,
      textX: x + PLATE.side + PLATE.bar,
      textW: PLATE.wide - (PLATE.side + PLATE.bar) * 2,
    });
  }
  return out;
}

export function drawToasts(ctx) {
  if (plates.length === 0) return;
  const layout = toastLayout();

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  for (const plate of layout) {
    ctx.globalAlpha = plate.glow;
    ctx.fillStyle = 'rgba(6,16,41,0.9)';
    roundRect(ctx, plate.x, plate.y, plate.w, plate.h, PLATE.radius);
    ctx.fill();
    ctx.strokeStyle = withAlpha(PALETTE.elite, 0.45);
    ctx.lineWidth = 1;
    roundRect(ctx, plate.x + 0.5, plate.y + 0.5, plate.w - 1, plate.h - 1, PLATE.radius);
    ctx.stroke();
    // The gold edge. A reward is written in gold everywhere in this game - the purse, NEW BEST, the
    // shards' own outline - and the edge says which plate it is before a word has been read.
    ctx.fillStyle = withAlpha(PALETTE.elite, 0.85);
    roundRect(ctx, plate.x + 4, plate.y + 8, PLATE.bar, plate.h - 16, 1);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.font = FONT_NAME;
    haloText(ctx, plate.name, plate.textX, plate.nameY, PALETTE.elite, PALETTE.elite);

    // What it paid, at the other end of the same line, in the gold every reward in this game is
    // written in: the name is the thing that happened and the number is what it was worth, and
    // they belong together rather than one line under the other.
    ctx.textAlign = 'right';
    ctx.font = FONT_DUST;
    ctx.fillStyle = PALETTE.elite;
    ctx.fillText(DUST_WORD + plate.dust + DUST_UNIT, plate.dustX, plate.dustY);

    // And what it was earned for, on its own line under them. It is fitted rather than trusted,
    // because these are the longest words the awards write and a plate is not.
    ctx.textAlign = 'left';
    ctx.font = whyFont(WHY_SIZE);
    const line = fitOneLine(ctx, plate.says, {
      widest: plate.textW, size: WHY_SIZE, minSize: WHY_FLOOR, fontFor: whyFont,
    });
    ctx.fillStyle = withAlpha(PALETTE.uiDim, 1);
    ctx.fillText(line.text, plate.textX, plate.whyY);
  }
  ctx.restore();
}
