// One frame on the canvas: the sky, the arena seen through the camera, then the
// interface.

import { visual } from '../core/rng.js';
import { BALANCE } from '../game/balance.js';
import { shakeShare } from '../game/settings.js';
import { STATE } from '../game/state.js';
import { world } from '../game/world.js';
import { view } from './canvas.js';
import { camera, followCamera } from './camera.js';
import { drawStars } from './background.js';
import { drawNebula } from './nebula.js';
import { drawWalls } from './walls.js';
import { drawCage } from './boss.js';
import { drawArmFans, drawBlades } from './arms.js';
import { drawDarkness } from './darkness.js';
import { drawArcs, drawBeams, drawBlastZones, drawBullets, drawEnemies, drawEnemyShots, drawBossLocks, drawFire, drawGhosts, drawLanceBeams, drawLanceLocks, drawLocks, drawMines, drawNova, drawOrbitals, drawPlayer, drawShards, drawShieldBubbles, drawShieldFields, drawTelegraphs, drawTether, drawTurrets } from './entities.js';
import { drawRings, drawSmoke, drawSparks, drawTexts } from './effects.js';
import { drawIndicators } from './indicators.js';
import { drawHUD } from './hud.js';
import { drawVolumePanel } from './volume.js';
import { drawDebug } from './debug.js';
import { drawToasts } from './toast.js';
import { drawLogo } from './logo.js';
import { drawCards } from './cards.js';

/**
 * A shake offset large enough to notice, small enough to never blur the HUD.
 *
 * The trauma is the run's and the share of it is the player's (game/settings.js): the room decides
 * how hard a thing went off and the settings screen decides how far the window travels because of
 * it. Taking the share first, before the floor, is what makes NONE mean none - a frame under the
 * floor is not shaken at all, and the eye's stream is not even asked for a number.
 */
function shakeOffset(amount) {
  const px = amount * shakeShare();
  if (px <= BALANCE.screen.shakeFloor) return { x: 0, y: 0 };
  return { x: visual.range(-px, px), y: visual.range(-px, px) };
}

/**
 * Paint one frame. `tick` is what the clock said this frame is (core/clock.js):
 * its length, how many simulation steps it ran, how far between the last one and
 * the next it sits, and the frame rate. Moving things are drawn between where
 * they were and where they are - see render/interp.js - and so does the camera.
 *
 * `input` is the frame's input descriptor, which the camera leans towards. `pointer`
 * is where the mouse sits on the glass - only the upgrade choice cares about it, and
 * only because it has to light up the card it is over.
 */
export function renderFrame(tick, input, pointer) {
  const ctx = view.ctx;
  const W = view.W;
  const H = view.H;

  followCamera(tick.dt, tick.alpha, input);

  ctx.setTransform(view.DPR, 0, 0, view.DPR, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = view.bgGrad;
  ctx.fillRect(0, 0, W, H);

  const offset = shakeOffset(world.shake);
  ctx.save();
  ctx.translate(offset.x, offset.y);

  // The sky: the clouds are the furthest thing on the screen, then the three
  // parallax star layers in front of them. Both are screen space, both shake with
  // the frame like everything else behind the arena.
  drawNebula(ctx);
  drawStars(ctx);

  // From here the canvas is in arena coordinates: one translate, and every draw
  // call after it says where a thing is in the world.
  ctx.translate(-camera.x, -camera.y);
  ctx.globalCompositeOperation = 'lighter';

  if (world.state === STATE.START) {
    drawWalls(ctx);
    drawBlastZones(ctx, world.ambient, tick.alpha);
    drawEnemies(ctx, world.ambient, true, tick.alpha);
    drawShards(ctx, tick.alpha);
  } else {
    drawWalls(ctx);
    // The cage on top of the arena's own wall, and under everything standing in the room: the
    // boundary a boss has closed the duel into, cool like the wall it echoes (game/field.js).
    drawCage(ctx);
    // Floor markings go down first: a bomber's death zone is paint on the arena floor, so
    // nothing standing on the floor is ever drawn under it.
    drawBlastZones(ctx, world.enemies, tick.alpha);
    drawShieldFields(ctx, world.enemies, tick.alpha);
    // Floor paint again, and for the same reason: a mine lies under whatever walks over it, which is
    // the moment it goes off (game/mines.js).
    drawMines(ctx);
    drawShards(ctx, tick.alpha);
    drawSmoke(ctx, tick.alpha);
    drawRings(ctx);
    drawBullets(ctx, tick.alpha);
    // Under the crowd, so a darter sits on top of its own warning line.
    drawTelegraphs(ctx, world.enemies, tick.alpha);
    // And under it for the same reason: a lock is a promise across the whole arena and
    // nothing standing in the middle of it may be allowed to hide it (game/beams.js).
    drawLocks(ctx, world.enemies, tick.alpha);
    // And under it for the same reason: the ship's own lance is drawing a band across the arena
    // while it winds up, and the band is the only way to see a line that reaches the far wall
    // coming (game/lance.js).
    drawLanceLocks(ctx, tick.alpha);
    // And under it for the same reason a third time: a boss's spokes are bands across the whole
    // room and nothing standing in the middle of one may hide it (game/bosses.js).
    if (world.boss !== null) drawBossLocks(ctx, world.boss, tick.alpha);
    // And the fans of blades a fight is promising, for the same reason and in the same place: a fan
    // is a place on the floor the harm is going to travel across, and nothing standing in the way of
    // it may hide it (game/arms.js).
    if (world.boss !== null) drawArmFans(ctx, world.boss, tick.alpha);
    drawEnemies(ctx, world.enemies, false, tick.alpha);
    // Over the crowd and under the ship: a fire is on the body it is eating, and the one
    // thing it must never do is hide the ship behind somebody else's flames (game/burn.js).
    drawFire(ctx, tick.alpha);
    drawShieldBubbles(ctx, world.enemies, tick.alpha);
    // Under the ship: a nova front is the ship's own reach going out, and the ship must
    // never be lost inside the ring it just threw (game/nova.js).
    drawNova(ctx, tick.alpha);
    // Under the ship for the same reason: a beam is the loudest light in the arena for a
    // fifth of a second and the ship must never be lost inside it (PLAN section 1).
    drawBeams(ctx);
    // Over the crowd and under the ship, like the beams: a blade is the loudest thing about to hurt
    // the hull and must never be the thing the ship is lost inside (game/arms.js).
    drawBlades(ctx, world.arms, tick.alpha);
    // Under the ship for the same reason, and over the crowd on purpose: a lance's band is where the
    // hull came off, and the ship must never be lost inside the light of its own gun
    // (game/lance.js).
    drawLanceBeams(ctx);
    // Under the ship for the same reason again, and over the crowd on purpose: a thread is the road
    // between where the dash was and where the ship is, and it must never be hidden by the bodies it
    // is burning (game/tether.js).
    drawTether(ctx, tick.alpha);
    // Under the ship for the same reason once more, and over the crowd on purpose: a gun the crowd
    // walks over and cannot see is a gun that has already stopped working (game/turret.js).
    drawTurrets(ctx);
    // Over the crowd: an enemy shot must never be hidden by the thing that fired it.
    drawEnemyShots(ctx, tick.alpha);
    // Under the ship: an image is the ship as it was, and where the two overlap the real one is
    // the one painted last (game/afterimage.js).
    drawGhosts(ctx);
    if (world.state !== STATE.START) drawPlayer(ctx, tick.alpha);
    // Over the crowd and over the ship: the ring is the ship's own reach and it must never
    // be hidden by the bodies it is grinding (game/orbitals.js).
    drawOrbitals(ctx, tick.alpha);
    // Last of the ship's own weapons and over everything it fired at: a bolt is the record of
    // where the damage went, and a bolt behind a drifter is a bolt nobody is told about
    // (game/arc.js).
    drawArcs(ctx);
    drawSparks(ctx, tick.alpha);
    drawTexts(ctx);
  }

  // The vignette belongs to the window, not to the arena, so it waits until the
  // camera and the shake have been put back the way they were found.
  ctx.restore();

  // The night, if a fight has put one down: over the whole world pass and under the interface,
  // because what the dark is asking you to read is the room and not the glass (render/darkness.js).
  // It comes after the restore for the same reason the vignette beside it does - it belongs to the
  // window - and it draws nothing at all on any frame it is not dark.
  drawDarkness(ctx, tick.alpha);

  ctx.fillStyle = view.vignette;
  ctx.fillRect(0, 0, W, H);

  // The arrows belong to the glass and not to the arena: out here they stay pinned to
  // the edge they point along however hard the frame shakes, and the vignette cannot
  // dim the one warning that has to be seen in a corner.
  if (world.state === STATE.PLAY) drawIndicators(ctx, tick.dt, tick.alpha);
  if (world.state !== STATE.START) drawHUD(ctx, tick.fps);
  // The mark, while the world is on its title screen. Out here - past the vignette and the shake -
  // it belongs to the glass and not to the arena, so nothing it says can wobble or dim just because
  // something over the crowd just went off (render/logo.js).
  if (world.state === STATE.START) drawLogo(ctx);
  // Last of all, over the interface it pauses: the run is holding still and the whole
  // window belongs to the choice (game/upgrades.js).
  if (world.state === STATE.LEVEL) drawCards(ctx, pointer);
  // And last of the last, over the cards too: the mixer readout is answering a key the player
  // just pressed, and nothing on the screen may be allowed to hide the answer (render/volume.js).
  drawVolumePanel(ctx);
  // ...and beside it the awards this run has just won (render/toast.js), which land under the top
  // of the window rather than over the middle of it: the fight is still going on underneath them
  // and the eye is where the fight is.
  drawToasts(ctx);
  // ...and last of the last, over everything including the cards: the developer's panel (F3) is
  // read while the frame is going on, so nothing may be allowed to hide it (render/debug.js).
  drawDebug(ctx);
}
