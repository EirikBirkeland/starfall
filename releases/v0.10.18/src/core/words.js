// One way of saying a duration, for whoever is painting it.
//
// A run's clock is written in four places - the HUD beside the score, the pause's rack, the card a run
// ends on, and the codex's log of past runs - and it is one number, so it gets one wording. This is it.
//
// It lives in `core/` for the same reason the palette does (session 3's note on that): the page
// (`ui/screens.js`) paints DOM and the glass (`render/hud.js`) paints a canvas, the two are not allowed
// to read each other, and until now each had its own spelling of a minute and two seconds - the glass
// wrote `902s` on a fifteen-minute run while the card it ended on said `15m02s`. That is the sort of
// thing nobody notices until somebody reads every line in the game at once.
//
// It is words and not a rule: nothing in `src/game` may read it, because a run's length is a number
// there and a spelling is not.

/**
 * The run's clock: `47s` inside a minute and `15m02s` past one. Under a minute the seconds are the
 * whole of the number and there is nothing to group; past one, grouping is the difference between
 * reading a clock and doing arithmetic on it - and `902s` is not a clock anybody reads at a glance.
 */
export function clockWords(seconds) {
  const whole = Math.floor(seconds);
  if (whole < 60) return whole + 's';
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return minutes + 'm' + (rest < 10 ? '0' : '') + rest + 's';
}
