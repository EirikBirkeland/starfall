// How long a batch of runs is played when nobody asks for a window.
//
// Both batch tools (`tools/difficulty-arc.js` and `tools/run-shape.js`) used to default to 900 s.
// That is PLAN's band's far edge - and it is also, exactly, the moment the last boss walks in
// (`BALANCE.bosses.schedule`). A batch stopped there can never see a run that beat the final boss,
// so the row both tools print under the histogram - `won the schedule` - has been a zero by
// construction since the day it was written, and every run that got all the way through was filed
// under "never died". That is the difference between "four of these forty-eight are unkillable" and
// "four of these forty-eight won the game", and the second one is what the seeds actually do.
//
// So the window is read off the schedule rather than written down: the last entry's arrival, plus
// time enough to answer it. A schedule that moves moves the window with it, and both tools resolve
// it *after* any `--set` has gone onto the table, so a batch measured with a moved schedule is still
// played long enough to see the end of it.

import { BALANCE } from '../../src/game/balance.js';

/** How long the last fight in the schedule is given before the window closes. */
const FIGHT_ALLOWANCE = 300;

/** The length, in seconds, of a window long enough to see the schedule resolved. */
export function scheduleWindow() {
  const schedule = BALANCE.bosses.schedule;
  return schedule[schedule.length - 1].at + FIGHT_ALLOWANCE;
}
