// What the game is trying to teach, on the glass (game/tutorial.js decides which lesson and for how
// long; this is the plate it says it with).
//
// One plate, one line, at the *bottom* of the window - and that place is the whole design. The top
// belongs to the score and the boss's bar, the middle belongs to the crowd, and the strip above the XP
// bar is the only bit of glass in this game that nothing else ever asks for. A lesson is worth about a
// second of reading and nothing more, so it sits where the eye travels last and it leaves as soon as
// the run has proved it was not needed.
//
// The same bargain the award plates keep (render/toast.js): the arithmetic that says where everything
// goes lives in `tutorialLayout`, so a test with no pixels can measure the box and read the words that
// landed in it, and the painter and the test cannot disagree because only one of them does the sums.
// Unlike those, this plate's clock is the run's and not the frame's: `age` and `out` are stepped by
// game/tutorial.js, which is what makes a prompt freeze with a paused run instead of fading out from
// under it, and what lets a test say "it was up for nine seconds" without owning a clock of its own.

import { PALETTE, withAlpha } from '../core/palette.js';
import { BALANCE } from '../game/balance.js';
import { STATE } from '../game/state.js';
import { promptWords } from '../game/tutorial.js';
import { world } from '../game/world.js';
import { view } from './canvas.js';
import { fitOneLine } from './fit.js';
import { haloText } from './hud.js';
import { roundRect } from './shapes.js';

const PLATE = {
  wide: 340,          // px: wider than the award plates, because this is the longest line of the two
  tall: 40,           // px
  radius: 10,         // px of corner, the same roundness every plate on this game's glass has
  side: 18,           // px of plate to the left and right of the words
  bottom: 60,         // px of window below the plate: clear of the XP bar and of its caption
};

const FONT = '800 15px "Segoe UI", system-ui, sans-serif';
const TEXT_SIZE = 15;      // px, the award plates' own size
const TEXT_FLOOR = 9;      // below this it is unreadable, so it gets cut short instead
const textFont = (size) => '800 ' + Math.round(size) + 'px "Segoe UI", system-ui, sans-serif';
const TEXT_RAISE = 5;      // px from the plate's middle to the words' baseline

/**
 * Where the plate goes, what it says, and how lit it is - or null when it has nothing to say.
 *
 * Which lesson is up is the game's business (game/tutorial.js); whether this window may carry it is
 * this file's. A run that has stopped is not being taught: over the cards the choice owns the whole
 * window, and over an ending the card does, and a hint about the dash floating above a card that says
 * the run died of not having used it is a bad joke. A *paused* run is refused for the same reason in
 * the other direction - the pause rack is a screen of its own now, and the plate would be behind it.
 */
export function tutorialLayout(W, H) {
  if (world.state !== STATE.PLAY || world.paused) return null;
  const says = promptWords(world);
  if (says === '') return null;

  const spec = BALANCE.tutorial;
  const prompt = world.prompt;
  // In over `arrive`, out over `away`. Whichever half it is in, it is never brighter than the plate
  // it belongs to: this is a note in the corner of the eye and not an announcement.
  const glow = prompt.out > 0 ? prompt.out / spec.away : Math.min(1, prompt.age / spec.arrive);
  if (glow <= 0) return null;

  const x = (W - PLATE.wide) / 2;
  const y = H - PLATE.bottom - PLATE.tall;
  return {
    text: says,
    x: x,
    y: y,
    w: PLATE.wide,
    h: PLATE.tall,
    glow: glow,
    // Where the words go, said separately because that is where a test looks: the plate moves and its
    // words move with it, and the fit needs the width the words are allowed to have. The words are
    // centred on the plate, so `textX` is its middle and not its left edge.
    textX: x + PLATE.wide / 2,
    textY: y + PLATE.tall / 2 + TEXT_RAISE,
    textW: PLATE.wide - PLATE.side * 2,
  };
}

export function drawTutorial(ctx) {
  const plate = tutorialLayout(view.W, view.H);
  if (plate === null) return;

  ctx.save();
  ctx.globalAlpha = plate.glow;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';

  ctx.fillStyle = 'rgba(6,16,41,0.86)';
  roundRect(ctx, plate.x, plate.y, plate.w, plate.h, PLATE.radius);
  ctx.fill();
  // Cool on the edge and in the letters, because everything that helps is (PLAN section 4) - and no
  // gold anywhere, because a lesson pays nothing. The award plates own the gold edge above this one.
  ctx.strokeStyle = withAlpha(PALETTE.cardEdge, 0.55);
  ctx.lineWidth = 1;
  roundRect(ctx, plate.x + 0.5, plate.y + 0.5, plate.w - 1, plate.h - 1, PLATE.radius);
  ctx.stroke();

  ctx.font = FONT;
  const line = fitOneLine(ctx, plate.text, {
    widest: plate.textW, size: TEXT_SIZE, minSize: TEXT_FLOOR, fontFor: textFont,
  });
  haloText(ctx, line.text, plate.textX, plate.textY, PALETTE.uiText, PALETTE.player);
  ctx.restore();
}
