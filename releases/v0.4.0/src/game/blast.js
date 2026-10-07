// A blast: one round of damage in a circle, and the light of it.
//
// A bomber's death is the first thing that uses this, and the nova and the mines of
// milestone 4 will want it too, so it is a system of its own rather than a few lines
// inside a kind. It is not a thing that lives in the world - there is no list of
// blasts, and nothing steps them - it is an event that happens inside one step: the
// ring and the sparks are left behind as effects, the damage is done on the way out.
//
// Two rules make it what it is:
//
//   The circle is the whole of it, and it is drawn by the renderer out of the same
//   number this file reads. A centre inside the radius - or standing exactly on the
//   line - is hurt and a centre outside it is not, for the ship exactly as for the
//   crowd, so a ring you can see is a promise you can stand on.
//
//   Whoever lit it gets the credit for everything it kills, and that carries down a
//   chain: a bomber caught in a blast detonates too, and if the player fired the
//   first shot the whole chain is theirs.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { STATE } from './state.js';
import { dist2 } from '../core/math.js';
import { damageEnemy } from './enemies.js';
import { hitPlayer, isInvulnerable } from './player.js';
import { burst, hitStop, ring, shakeIt } from './effects.js';
import { cueBeep } from './cues.js';
import { hurtByBlast } from './tally.js';

/**
 * Let off one blast at (x, y). `spec` is the numbers of whatever went off: `radius`,
 * `damage`, `shove`, and the `ring`, `flash`, `shake`, `hitStop` and `sound` that say
 * what it looks and sounds like. `byPlayer` says who to pay for the bodies.
 *
 * The crowd is picked out first and hurt afterwards, because hurting it can start
 * another blast and that happens inside this call: a chain detonation splices the
 * crowd under whatever loop is walking it. The list is allocated here on purpose - a
 * blast is something that happens when a thing dies, not a per-frame loop - and it
 * is small, because it only ever holds what was standing in the circle.
 */
export function blast(world, x, y, spec, byPlayer) {
  ring(world, x, y, PALETTE.blastFlash, spec.ring.radius, spec.ring.speed, spec.ring.life);
  burst(world, x, y, PALETTE.blastFlash, spec.flash.count, spec.flash.speed, spec.flash.life);
  shakeIt(world, spec.shake);
  hitStop(world, spec.hitStop);
  cueBeep(spec.sound.freq, spec.sound.dur, spec.sound.wave, spec.sound.vol, spec.sound.slide);

  const reach2 = spec.radius * spec.radius;
  const victims = [];
  for (let i = 0; i < world.enemies.length; i++) {
    const enemy = world.enemies[i];
    if (dist2(enemy.x, enemy.y, x, y) > reach2) continue;
    victims.push(enemy);

    // Thrown outwards, the same way a ship that takes a hit shoves the crowd clear
    // of itself. It also means a chain reaction spreads rather than sitting still.
    const dist = Math.hypot(enemy.x - x, enemy.y - y) || 1;
    enemy.ix += ((enemy.x - x) / dist) * spec.shove;
    enemy.iy += ((enemy.y - y) / dist) * spec.shove;
  }

  for (let i = 0; i < victims.length; i++) {
    const enemy = victims[i];
    // A blast set off by one of these deaths may have killed this one already. Dead
    // things do not die twice, and one that does would pay out twice.
    if (enemy.hp <= 0) continue;
    damageEnemy(world, enemy, spec.damage, byPlayer);
  }

  const ship = world.player;
  if (world.state !== STATE.PLAY || isInvulnerable(ship)) return;
  if (dist2(ship.x, ship.y, x, y) <= reach2) hitPlayer(world, hurtByBlast());
}
