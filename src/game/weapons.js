// The primaries: what one pull of the trigger actually is (PLAN 3.2).
//
// A weapon is data (BALANCE.weapons) and one function, `fire`. Everything a gun
// owns - how often it cycles, how many projectiles one pull throws and where they
// point, what each costs a body, how far it flies, how hard it shoves, what the ship is
// shoved back by - is read here where it is used, so there is nothing cached in the ship
// to keep in step with a pick or with a card. `game/bullets.js` is what every shot has
// in common whatever fired it.
//
// Five weapons at the time of writing, and the third, fourth and fifth are the reason this is a
// module and not four lines in game/player.js: the pulse is one heavy shot thrown as far as it can
// go, the scatter is six light ones thrown a short way, and a fan of six is a different
// pull rather than a bigger one - and the arc throws nothing at all, it finds the bodies it
// hurts itself, which is a second kind of pull again and lives in game/arc.js - and the lance
// throws nothing either but spends a wind-up on a line of light, which is a third kind of pull
// and lives in game/lance.js. The fifth is the Swarm: it throws a fan of shots the way the pulse
// does and differs only in what those shots are made of, because they steer and they go off where
// they land (game/missiles.js).

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { logic } from '../core/rng.js';
import { strikeChain } from './arc.js';
import { windUp } from './lance.js';
import { burst } from './effects.js';
import { cueBeep } from './cues.js';
import { chargedPullOf, spendCharge } from './overcharge.js';
import { gainOf, countOf, pierceOf, bounceOf } from './upgrades.js';

/**
 * The primaries on offer, in the order the title screen prints them and the order the
 * number keys pick them. `blurb` is a line for the player and nothing else; the name, and
 * every number a pull needs, live on the weapon's row in `BALANCE.weapons`, which is the
 * only place either of them is written.
 */
export const WEAPONS = [
  { id: 'pulse', blurb: 'straight fast shots, the reliable default' },
  { id: 'scatter', blurb: 'six pellets in a cone, short range, heavy kick' },
  { id: 'arc', blurb: 'lightning that leaps the crowd, and aims itself' },
  { id: 'lance', blurb: 'a charged beam down a whole line of the arena' },
  { id: 'swarm', blurb: 'slow micro-missiles that find the crowd and go off in it' },
];

/** The line that hands out extra projectiles alongside the gun's own. */
const SPLIT_LINE = 'split';

/** The scratch the fan is written into: one array per process, refilled per pull. */
const fanScratch = [];

/** The weapon id a run that has not picked one flies. */
export function defaultWeapon() {
  return BALANCE.weapons.default;
}

/** The spec of the weapon this world is flying. */
export function weaponOf(world) {
  const gun = BALANCE.weapons[world.weapon];
  if (gun === undefined) throw new Error('no weapon is called ' + world.weapon);
  return gun;
}

/** The name to print for the weapon this world is flying. */
export function weaponName(world) {
  return weaponOf(world).name;
}

/** Is `id` one of the primaries on offer? */
function isOffered(id) {
  for (let i = 0; i < WEAPONS.length; i++) {
    if (WEAPONS[i].id === id) return true;
  }
  return false;
}

/**
 * Choose the primary for the runs this world plays. It is a title-screen choice -
 * there is no hangar yet - but it is honest mid-run too: nothing caches a gun into the
 * ship, so the next pull of the trigger is already the new one. An id that is not one of
 * the primaries offered is a bug and says so; `BALANCE.weapons` holds a couple of meta
 * keys beside the weapons, so being in that table is not the test.
 */
export function setWeapon(world, id) {
  if (!isOffered(id)) throw new Error('no weapon is offered called ' + id);
  world.weapon = id;
  return id;
}

/** The pick by position on the title screen: 0 is the first one offered. */
export function setWeaponByIndex(world, index) {
  const wanted = WEAPONS[index];
  if (wanted === undefined) return false;
  setWeapon(world, wanted.id);
  return true;
}

/**
 * How often the gun cycles: the weapon's own rate, times whatever the fire rate line is
 * worth (game/upgrades.js), under the ceiling the frame budget can afford. Read here and
 * nowhere else, so the card a player picks and the shot that comes out of the nose are
 * always talking about the same number.
 */
export function shotsPerSecond(world) {
  return Math.min(BALANCE.weapons.rateMax,
    weaponOf(world).fireRate * gainOf(world, 'fireRate'));
}

/**
 * How many things one pull sends out: the gun's own, plus every extra the split line has to
 * give (PLAN 3.5). This is that line read as a count rather than as words on a card; a gun
 * that throws shots reads it as shots (below) and the arc reads it as chains, because on a
 * weapon that already points itself at a body the only way to cover more ground is a second
 * place to start from (game/arc.js).
 */
export function shotsPerPull(world) {
  return weaponOf(world).pellets + countOf(world, SPLIT_LINE);
}

/**
 * Where one pull's projectiles point, written into one scratch array and refilled per
 * pull (nothing allocates in a shot loop, PLAN section 2): the gun's own shots laid out
 * from the nose outwards, nearest first and alternating sides, and the split line's
 * extras laid on past them. So the shot the player aimed at is always the first one and
 * always goes exactly where it was aimed, and the fan grows outwards one ring at a time.
 *
 * The gap is the wider of the gun's own spread and the split line's, because both are
 * selling the same shape and neither may be squeezed by the other: a pulse fan opens at
 * the split line's gap, a scatter's pellets keep the cone the weapon was designed with
 * and the extras carry on out of it at that same spread.
 *
 * A line of five ranks means an odd number of extras, and an odd number cannot sit
 * evenly on both sides of the aim: the last one leans one gap to the right. The gap is
 * small enough that nobody can see it. The alternative - aiming the heaviest shot
 * somewhere the player did not point - is worse.
 */
function shotFan(aim, count, gap) {
  fanScratch.length = 0;
  fanScratch.push(aim);

  let ring = 1;
  let side = 1;
  while (fanScratch.length < count) {
    fanScratch.push(aim + side * ring * gap);
    if (side > 0) { side = -1; } else { side = 1; ring++; }
  }
  return fanScratch;
}

/**
 * Where this pull's things point, whichever kind of thing they are (game/arc.js wants a count and
 * not a set of angles, game/lance.js wants the angles as offsets from the nose): the gun's own fan
 * opened at the wider of its own gap and the split line's, and the split line's extras laid on
 * past them. Refills and returns one scratch array, like every other hot list in the game.
 */
function pullFan(world, gun) {
  return shotFan(world.player.angle, shotsPerPull(world),
    Math.max(gun.gap, BALANCE.upgrades.split.fan));
}

/**
 * What one pull of `gun` is worth, before it is split up between the things it throws: the gun's
 * own damage, times whatever the damage line has earned, times the overcharge if the gun was
 * loaded when the trigger moved (game/overcharge.js). Read as the pull is spent, which is what lets
 * a card taken mid-frame apply to the very next pull and nothing already in the air.
 */
function pullWeight(world, gun, boost) {
  return gun.damage * gainOf(world, 'damage') * boost;
}

/**
 * One projectile, written field by field like every spawner must.
 *
 * `speed` is the gun's, `life` is the gun's reach divided by it, and `knock` is how much
 * of its own velocity a body gets for being in the way - all three baked as the shot
 * leaves, so a pick or a card taken after this one goes does not rewrite a shot already
 * in the air (game/bullets.js is where the shove is spent). `charged` says the same about
 * the overcharge line a step later: what the pull was worth when the trigger moved is what
 * the shot is worth all the way to wherever it lands, and it is also the only way the eye can
 * tell a heavy shot from a plain one (render/entities.js).
 *
 * And `hunts`/`splash` say which *kind* of shot it is: a gun with a `missile` block on its row
 * throws micro-missiles, which steer and go off where they land (game/missiles.js), and every
 * other gun in the game throws a shot that flies straight and stops. Both are written whichever
 * gun fired, because a recycled shot may come out of the drawer wearing the last one's.
 */
function shoot(world, nx, ny, angle, speed, dmg, shove, passes, turns, charged) {
  const gun = weaponOf(world);
  const missile = gun.missile;
  const bullet = world.bullets.spawn();
  bullet.x = nx;
  bullet.y = ny;
  bullet.px = nx;
  bullet.py = ny;
  bullet.vx = Math.cos(angle) * speed;
  bullet.vy = Math.sin(angle) * speed;
  bullet.life = gun.life;
  bullet.dmg = dmg;
  bullet.knock = shove;
  // The shot carries what the gun had earned when the trigger moved, and carries it for
  // its whole flight: a card taken after this one leaves does not rewrite a shot already
  // in the air (game/bullets.js is where both are spent).
  bullet.pierce = passes;
  bullet.bounce = turns;
  bullet.charged = charged;
  // And that it came off the ship's own trigger and not off one of the guns the ship has left
  // standing in the road (game/turret.js), which a recycled shot would otherwise bring with it.
  bullet.turret = false;
  // And what kind of shot it is (see the note above): the Swarm's row is the only one with a
  // `missile` block on it, and the blast's own numbers live in that block rather than on the shot.
  bullet.hunts = missile !== undefined;
  bullet.splash = missile === undefined ? 0 : missile.blast.radius;
  bullet.hits.length = 0;
  return bullet;
}

/**
 * The shots of a pull that throws shots: the fan, written into the magazine one at a time.
 *
 * The multipliers are taken from the upgrade lines as the shots leave, which is what
 * lets a card taken mid-frame apply to the very next shot. What the gun itself throws is
 * all of it worth the same - a scatter's pellets are not a fan of weights, they are six
 * of the same shot - and only what the split line adds on top carries that line's share
 * (BALANCE.upgrades.split), so a rank of split never takes anything away and always buys
 * coverage instead. Each projectile also leaves with what the gun had of the pierce and
 * ricochet lines, so a shot can go on through the body it was aimed at, or turn on to one
 * standing beside it (game/bullets.js).
 *
 * Answers whether anything left the ship, which for a fan of shots is always: it is only a
 * chain that can find nothing to throw at, and only a beam that has not been thrown yet.
 */
function shootFan(world, gun, fan, nx, ny, boost) {
  const split = BALANCE.upgrades.split;

  const speed = gun.speed * gainOf(world, 'bulletSpeed');
  // `boost` is what a loaded gun is worth (game/overcharge.js), and it is 1 for every pull that
  // was not, so the whole fan - the gun's own shots and the split line's extras together - is one
  // heavier pull rather than one heavier shot among them.
  const weight = pullWeight(world, gun, boost);

  const pierce = pierceOf(world);
  const turns = bounceOf(world);
  const charged = boost > 1;
  for (let i = 0; i < fan.length; i++) {
    // Every projectile gets its own small aim error, so a fan is a fan of shots and not
    // a grid of them - and everything past the gun's own is an extra, lighter by the
    // split line's share.
    const angle = fan[i] + logic.range(-gun.spread, gun.spread);
    const heavy = i < gun.pellets;
    shoot(world, nx, ny, angle, speed,
      heavy ? weight : weight * split.share, gun.knockback, pierce, turns, charged);
  }
  return true;
}

/**
 * One pull of the trigger: whatever the gun throws, a shove backwards, a muzzle flash, and
 * one cue.
 *
 * What leaves the ship is each gun's own business and it is one of three things: a fan of
 * shots (the Swarm's are a fan of micro-missiles, but they leave the nose the same way), a chain
 * that finds its own bodies (game/arc.js), or a wind-up on a line of light (game/lance.js) - which
 * is which is read off the row, the same way test/weapons.test.mjs reads it: a `chain` block means
 * the bolt, a `beam` block means the lance, and neither means a fan.
 * Everything after it is what a pull costs the ship whichever of the three it was - one kick
 * backwards, one flash at the nose, and one sound, however many shots left it or bodies were
 * landed on.
 *
 * A pull that threw nothing costs nothing, and only two guns can miss that way: an arc whose reach
 * holds no body leaves no bolt behind, so the silence is how it says the crowd is out of range
 * (game/arc.js); and a lance has not thrown anything yet at all, so it answers false and pays for
 * its own kick, flash, sound and charge at the discharge instead (game/lance.js).
 */
export function fire(world) {
  const ship = world.player;
  const gun = weaponOf(world);
  const fan = pullFan(world, gun);

  const nose = ship.drawR + BALANCE.bullets.noseOffset;
  const nx = ship.x + Math.cos(ship.angle) * nose;
  const ny = ship.y + Math.sin(ship.angle) * nose;

  // What a loaded gun is worth, read once for the whole pull (game/overcharge.js).
  const boost = chargedPullOf(world);
  const weight = pullWeight(world, gun, boost);

  const threw = gun.beam !== undefined ? windUp(world, gun, fan, weight, boost > 1)
    : gun.chain !== undefined ? strikeChain(world, gun, fan.length, nx, ny, boost)
      : shootFan(world, gun, fan, nx, ny, boost);
  if (!threw) return;
  // A pull that threw nothing has not fired, and a pull that has not fired has not spent the
  // charge it was carrying: the arc's own answer to an empty sky stays loaded until it finds a
  // body to spend itself on (game/overcharge.js).
  if (boost > 1) spendCharge(world, nx, ny);

  ship.vx -= Math.cos(ship.angle) * gun.recoil;
  ship.vy -= Math.sin(ship.angle) * gun.recoil;

  const muzzle = gun.muzzle;
  burst(world, nx, ny, PALETTE.spark, muzzle.count, muzzle.speed, muzzle.life);
  // One sound per pull, however many projectiles came with it: the mix has no voice
  // limiting until milestone 7, and six beeps per pull is a buzz, not a shot.
  const sound = gun.sound;
  cueBeep(logic.range(sound.base, sound.base + sound.jitter), sound.dur, sound.wave, sound.vol, sound.slide);
}
