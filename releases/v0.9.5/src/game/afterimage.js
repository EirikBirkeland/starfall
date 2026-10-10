// An afterimage (PLAN 3.5): the dash leaves images of the ship standing in the arena, and for
// a couple of seconds the crowd chases those instead of chasing the ship.
//
// This is the one line in the deck that does not change a number about the ship or about the
// crowd. It changes *where the crowd is walking*, which is a different kind of power and needs
// a different kind of care: nothing here may make a body slower, softer, or less able to hurt,
// because a decoy that also dazed the crowd would be two cards, and a decoy that made the crowd
// harmless would not be a fight any more. What the images buy is direction and nothing else.
//
// Four decisions live here, and each of them has a test:
//
//   **An image is a place, not a body.** It is not in `world.enemies`, it has no hull, and
//     nothing in the game can shoot it: a bullet flies through it, a nova front goes over it, and
//     the ship cannot be hurt by one. That is the answer to the question a decoy has to answer
//     before it can be built - who shoots it - and the answer is nobody, because it is light and
//     not matter. It cannot be killed early, which means the two seconds PLAN gives it are the
//     two seconds the player got, and it cannot be farmed: a body that could be shot at a ghost
//     would be a ghost that also does your damage for you.
//
//   **Who chases what is worked out again every step.** A body chases the nearest image it is
//     standing within `bait` of, and the ship if there is none - which is the whole rule, held
//     nowhere, derived from the crowd and the images over again each step exactly like the packs
//     in game/flock.js and the guards in game/shields.js. Nothing has to be remembered when an
//     image goes out, when a rank is taken mid-run, or when a body walks into range halfway
//     through one's life, because none of those is an event here; they are just what the question
//     now answers.
//
//   **`bait` is small, and that is the card.** Seventy-two px is "the bodies that were already on
//     top of you", not "the arena". The reach is measured round the *image*, not round the ship,
//     because an image is a lure standing in one place. Small is also what makes a rank of this
//     line worth taking: images are spread down the length of the streak the dash covered, so
//     more ranks fool the bodies along a longer line, where a bigger `bait` would fool the same
//     bodies however many images there were (BALANCE.upgrades.afterimage has the arithmetic).
//
//   **A chase is not a stun, and a promise is not broken.** A fooled body walks at full pace -
//     the frost, the shoves and the separation all apply to it exactly as they do to one that is
//     coming at you, because it *is* coming, just somewhere else. And a body that has already
//     committed to something keeps it: a darter mid-aim or mid-lunge, a swarm mid-dive and a
//     sniper whose lock has been taken all finish what they started, because those walks read the
//     line they locked and not the quarry. The telegraph is never stolen (game/kinds.js), and a
//     decoy that could retake a lock already in flight would be the one card worth dodging twice.
//
// The tell is free, and it is the crowd: which way a body points is which way it is walking
// (game/kinds.js), so the moment the images go up the noses of everything nearby turn aside to
// face them, and the shape of the crowd says what the trick is doing without a meter for it.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { Pool } from '../core/pool.js';
import { dist2 } from '../core/math.js';
import { ring } from './effects.js';
import { cueBeep } from './cues.js';
import { imagesOf, rankOf } from './upgrades.js';

/**
 * The shape of one image. It does not move - it is the ship as it was, left standing where it
 * was - so it has no velocity and no `px`/`py` either: there is nothing for the renderer to
 * interpolate between. `age` runs up to `BALANCE.upgrades.afterimage.life`, which is also what
 * the drawing fades on, so the image's own clock is the only clock it has.
 */
export function makeImage() {
  return { x: 0, y: 0, angle: 0, age: 0 };
}

/**
 * A fresh afterimage: the images standing in the arena, and the three numbers the dash is
 * paced by - how many this dash still has to leave, how far apart they are, and the distance
 * along the streak the next one is due at. All three are written afresh every time a dash
 * starts, so a rank taken between two dashes is felt by the next one and not by a stale plan.
 */
export function newAfterimage() {
  return { trail: new Pool(makeImage), gap: 0, due: 0, left: 0 };
}

/** Put every image back to nothing, with the rest of the run's resetting. */
export function resetAfterimage(world) {
  world.afterimage.trail.clear();
  world.afterimage.gap = 0;
  world.afterimage.due = 0;
  world.afterimage.left = 0;
}

/** Has this run taken the line at all. Nothing is asked or painted until it has. */
export function hasAfterimage(world) {
  return rankOf(world, 'afterimage') > 0;
}

/**
 * Say how many images a dash that starts now will leave, and how far down the streak they
 * will be spread. Called by game/player.js the moment a dash is granted, and a run that has
 * not taken the line is told `left: 0` here, which costs one compare on every dash after it.
 *
 * The spread is the whole dash divided into as many pieces as there are images, which puts
 * the first of them where the ship was and the last of them one gap short of where it ends up
 * - so an image is never standing on top of the ship that is still moving, and the streak of
 * them covers the way the ship came.
 */
export function armDash(world) {
  const dash = world.afterimage;
  const count = imagesOf(world);
  dash.left = count;
  dash.gap = count > 0 ? BALANCE.player.dash.distance / count : 0;
  dash.due = 0;
}

/**
 * Leave whatever images this step of a dash has reached. Called by game/player.js from
 * `dashStep`, after the ship has been moved, with the ship standing at the place the image is
 * copied from - so the images are laid as the dash goes, and a dash that runs into a wall and
 * stops early leaves the images it actually got to rather than a plan it never reached.
 */
export function trailImages(world) {
  const dash = world.afterimage;
  if (dash.left === 0) return;

  const travelled = BALANCE.player.dash.distance - world.player.dashLeft;
  while (dash.left > 0 && travelled >= dash.due) {
    leaveImage(world);
    dash.due += dash.gap;
    dash.left--;
  }
}

/** Copy the ship as it stands: the same nose it was pointing, the same place it was standing. */
function leaveImage(world) {
  const ship = world.player;
  const image = world.afterimage.trail.spawn();
  image.x = ship.x;
  image.y = ship.y;
  image.angle = ship.angle;
  image.age = 0;
}

/**
 * One step of the images: they age, and the ones that are done go out with a ring closing in
 * on the place they stood. Called from the run's step whether or not the line was taken; with
 * no images standing that is one pass over an empty list.
 */
export function updateAfterimage(world, dt) {
  const spec = BALANCE.upgrades.afterimage;
  const trail = world.afterimage.trail;

  // Downwards, because a pool takes the last live object out of its hole (core/pool.js).
  for (let i = trail.count - 1; i >= 0; i--) {
    const image = trail.items[i];
    image.age += dt;
    if (image.age < spec.life) continue;
    trail.killAt(i);
    // The ship's own cyan, because that is what an image is wearing right up to the moment it
    // stops being there (render/entities.js draws it the same way).
    ring(world, image.x, image.y, PALETTE.player,
      spec.gone.ring.radius, spec.gone.ring.speed, spec.gone.ring.life);
    const sound = spec.gone.sound;
    cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
  }
}

/**
 * Who is this body chasing right now: an image it is standing next to, or the ship. This is
 * the only door game/enemies.js uses to decide what a walk is pointed at, and it answers with
 * the ship for every body in the game until some image is standing within `bait` of it.
 *
 * It answers an object with an x and a y and nothing else, because that is all a walk ever
 * asks of its quarry (game/kinds.js) - which is what lets the ship and an image be the same
 * kind of answer.
 */
export function quarryFor(world, enemy) {
  const trail = world.afterimage.trail;
  if (trail.count === 0) return world.player;

  const reach = BALANCE.upgrades.afterimage.bait;
  let best = null;
  let bestD2 = reach * reach;
  for (let i = 0; i < trail.count; i++) {
    const image = trail.items[i];
    const d2 = dist2(enemy.x, enemy.y, image.x, image.y);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = image;
    }
  }
  return best === null ? world.player : best;
}

/** How far down its last half-second an image has come, 0 while it is fresh and 1 as it goes. */
export function fadingBy(image) {
  const spec = BALANCE.upgrades.afterimage;
  const fade = spec.life / 2;
  const left = spec.life - image.age;
  return left >= fade ? 0 : 1 - left / fade;
}
