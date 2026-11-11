// How bright a hurt body's white flash is, as one question both painters can ask (PLAN section 6's
// "flash reduction", through game/settings.js).
//
// A body wears the flash for `BALANCE.enemies.hitFlash` seconds after a hit that reached its hull
// (game/enemies.js), and every painter that draws a body turns that timer into a brightness: the
// crowd, a boss's ring, a boss's mass, a boss's last shell. They all used to write the same
// expression, which is how a player's setting would have had to be added four times - so it is
// written here once, and a body that is not flashing costs nothing more than it did.
//
// The share is multiplied into the *flash* rather than into the light that is painted with it, so
// every use of it in a painter fades together: the bloom over the body, and the white line round
// its outline that is only painted while the flash is strong. A flash of nothing paints neither.
//
// What this deliberately does not reach is a boss's phase flare (render/boss.js) or the hull bar's
// white breath (render/hud.js): both are news - "this one cannot be hurt just now" - and a setting
// that takes news away is not an accessibility setting.

import { BALANCE } from '../game/balance.js';
import { clamp } from '../core/math.js';
import { flashShare } from '../game/settings.js';

const HIT_FLASH = BALANCE.enemies.hitFlash;

/** 1 the moment a hull is hurt, 0 when nothing is flashing, and between the two in between. */
export function hitFlash(enemy) {
  if (enemy.flash <= 0) return 0;
  return clamp(enemy.flash / HIT_FLASH, 0, 1) * flashShare();
}
