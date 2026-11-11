// The turret line (PLAN 3.2's turret, taken as an upgrade line): a gun is set down on the road the
// ship is travelling, it holds that ground for ten seconds, and it shoots whatever it can see.
//
// This is the only damage in the deck that *aims*. The orbital ring, the nova's front, the magnetar's
// field, a mine's ring and a tether's threads all pay out wherever the ship happens to be or wherever
// it has just been, and none of them chooses: a body that is in the shape is in it. A turret looks at
// the crowd and picks, which is the one thing a ship running for its life cannot do - it has its hands
// full - and it is why the line is worth a beat of its own rather than a share of the gun's.
//
// Five decisions live here, and each of them has a test:
//
//   **A turret is a place with a nose, and not a body.** It is not in `world.enemies`, it has no hull,
//     nothing can shoot it and nothing can shove it - not a bullet, not a bomber's blast, not the
//     ship - and it does not block anything. That is the contract game/mines.js, game/afterimage.js
//     and game/tether.js signed for the things the ship leaves behind, for the same reason: a thing in
//     the arena that can be interacted with is a second thing to aim and a second thing to lose, and
//     the ten seconds PLAN gives the turret are the ten seconds the player bought. The one thing that
//     is new is that it has a *facing*, and it can only fire where it points.
//
//   **It is set down down the road the ship is travelling, and not under it.** Mines fall out of the
//     wake; a turret is planted ahead, across the way of travel like a fence across a road. So the
//     two lines of the deck that put things on the arena floor own opposite halves of the road the
//     ship is on: **mines arm where you have been, turrets arm where you are going.** And because the
//     ship passes its own fence and the crowd walks through it a moment later, what the fence covers
//     is the whole corridor - the ground ahead on the way out, the ground behind as the chase comes
//     up through it - for the ten seconds it stands. A rank adds a gun to the fence, so a rank buys a
//     wider fence: ground, and never a heavier shell.
//
//   **It has to come round to shoot.** `turn` rad/s, and a shell only leaves when the nose is inside
//     `aim` of the line to the lock. A fence planted at full speed is born looking down the road and
//     must come about to shoot the chase off the ship's tail, which is the turret's wind-up and costs
//     no flag of its own; and a turret with nobody in reach does not spend its beat (game/orbitals.js
//     has the same rule), so a gun that was idle is hot the moment somebody walks into its sight -
//     the first thing it does is turn, and the second is fire. `aim` and `turn` together are what make
//     being *surrounded* a different thing from being on one side: a gun swings, and a swing has a
//     price.
//
//   **Its shell is a shell of this run's gun.** It is a real bullet in `world.bullets`, costing
//     `weight` shots with the damage line multiplied in exactly as it multiplies a drone's bite, a
//     nova front, a mine and a thread (session 31's rule: an added source has to grow with the gun or
//     it stops being worth taking), and it leaves the body it lands on frosted and alight like any
//     other shot and is the run's own kill, score and shards and all. It carries no pierce and no
//     ricochet: those two lines are bought for the ship's trigger and a gun that is not the ship's has
//     not bought them. And it can *miss* - it is a shell that travels at where a body was, not a
//     promise that arrives: a thing that cannot miss is not a gun, it is an aura.
//
//   **The sight line is the reach and the reach is what the shell is given flight for.** `reach` is how
//     far a gun will look for a body and how far its shell goes, the same number twice over, and the
//     line drawn out of the muzzle stops exactly there: a body whose skin is a pixel further out is out,
//     and the picture never claims a longer gun than the simulation has (game/mines.js draws its ring
//     and game/tether.js its band the same way, and for the same reason - the light is the promise). The
//     shell is given a body's width and its own radius past that, because a range measured to a body's
//     centre and one measured to its skin are two different numbers, and a shell has to be able to
//     arrive at the far edge of the body it was aimed at.
//
// Like the other lines that put things on the floor, this one carries its own instruments, because
// none of them can be worked out from the arithmetic: `hit / shots` is how often a shell that was
// thrown actually came round a body - the accuracy, which is the number that prices a gun firing at
// things that dodge - and `seen / steps` is what share of the steps a gun stood it had somebody in
// its sight at all, which is the only way to tell a fence standing in the traffic from a fence
// standing in an empty field. `BALANCE.upgrades.turret` carries every number and the measurement
// each one came from.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { Pool } from '../core/pool.js';
import { TAU, clamp, dist2, hypot } from '../core/math.js';
import { widestBodyOn } from './enemies.js';
import { burst, ring } from './effects.js';
import { cueBeep } from './cues.js';
import { gunsPerCrewOf, gainOf, rankOf } from './upgrades.js';

/**
 * The shape of one gun. It does not move - it is a place, and there is nothing for the renderer to
 * interpolate between (game/mines.js keeps its mines the same way) - so what it keeps instead is a
 * facing and the one reading the drawing is painted out of: `aim`, which is 1 when the nose is on the
 * lock and 0 when there is nothing to shoot at or the nose is still coming round.
 */
export function makeTurret() {
  return { x: 0, y: 0, angle: 0, aim: 0, life: 0, cool: 0 };
}

/**
 * The line: the guns standing in the arena, the wait until the next crew is planted and the wait it
 * was armed with, and six counters a headless run reads to see the line at all - `crews` for every
 * crew set down, `guns` for the guns in them, `shots` for the shells they threw, `hit` for the bodies
 * those shells came round, and `seen` over `steps` for the share of its standing time a gun had
 * somebody in its sight. The ratios are the line's whole story and none of them is arithmetic: a gun
 * that throws 900 shells and comes round 300 bodies is a gun firing into empty sky three times out of
 * four, and only the count says so.
 */
export function newTurret() {
  return {
    stands: new Pool(makeTurret),
    wait: 0,
    crews: 0,
    guns: 0,
    shots: 0,
    hit: 0,
    seen: 0,
    steps: 0,
  };
}

/** Put every gun back to nothing, with the rest of the run's resetting. */
export function resetTurret(world) {
  const line = world.turret;
  line.stands.clear();
  line.wait = 0;
  line.crews = 0;
  line.guns = 0;
  line.shots = 0;
  line.hit = 0;
  line.seen = 0;
  line.steps = 0;
}

/** Has this run taken the line at all. Nothing is asked or painted until it has. */
export function hasTurret(world) {
  return rankOf(world, 'turret') > 0;
}

/**
 * Which way the road goes: the way the ship was travelling. The velocity is the honest answer while
 * the ship is moving; the nose is the honest answer when it is not, because a ship that has stopped to
 * fight is going wherever it is pointing - and a ship that stops is exactly the ship that wants its
 * guns planted in front of it. This is `falloutOf` in game/mines.js read the other way round, and
 * for the same reason: the two words "the way I was going" mean one thing to a moving ship and
 * another to a standing one.
 */
function roadOf(ship, spec) {
  const speed = hypot(ship.vx, ship.vy);
  if (speed > spec.drifting) return { x: ship.vx / speed, y: ship.vy / speed };
  return { x: Math.cos(ship.angle), y: Math.sin(ship.angle) };
}

/**
 * Set down a crew: `gunsPerCrewOf` of them, in a line across the way of travel, `stand` px down the
 * road and `gap` px apart, spaced evenly about the middle so a crew of one is one gun dead ahead and a
 * crew of five is a fence with the road in the middle of it.
 *
 * A gun is born facing down the road, which is what makes the swing real: the chase is behind, so the
 * first thing every planted gun does is come about. And a gun is born with its beat ready, because
 * `cool` is only ever spent by a shell and not by waiting.
 */
function plantCrew(world, spec) {
  const ship = world.player;
  const line = world.turret;
  const road = roadOf(ship, spec);
  const side = { x: -road.y, y: road.x };
  const count = gunsPerCrewOf(world);
  const middle = (count - 1) / 2;
  const margin = spec.pad;

  for (let i = 0; i < count; i++) {
    const lean = (i - middle) * spec.gap;
    const turret = line.stands.spawn();
    // The road runs into a wall now and then, and a gun planted outside the arena would be a gun
    // nobody could reach or see, so the fence bends at the wall rather than leaving pickets outside
    // it (game/waves.js lands bodies the same way).
    turret.x = clamp(ship.x + road.x * spec.stand + side.x * lean, margin, world.arena.w - margin);
    turret.y = clamp(ship.y + road.y * spec.stand + side.y * lean, margin, world.arena.h - margin);
    turret.angle = Math.atan2(road.y, road.x);
    turret.aim = 0;
    turret.life = spec.life;
    turret.cool = 0;
    line.guns++;

    // One light and one note per gun and not one per crew: a crew of five arrives at five separate
    // places across the road, and each of them is a thing that just happened.
    ring(world, turret.x, turret.y, PALETTE.player,
      spec.planted.ring.radius, spec.planted.ring.speed, spec.planted.ring.life);
  }

  line.crews++;
  const sound = spec.planted.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * The signed short way round from one facing to another, in radians. Longer than half a turn is
 * further the other way, and a gun that could not work that out would walk the long way round every
 * target behind it.
 */
function turnTo(from, to) {
  let diff = (to - from) % TAU;
  if (diff > Math.PI) diff -= TAU;
  if (diff < -Math.PI) diff += TAU;
  return diff;
}

/** The scratch list the grid fills for a lock. One per process, refilled per gun per step. */
const lockScratch = [];

/**
 * The nearest body this gun can see, or null.
 *
 * This is the one place in the deck's family of floor lines that asks the collision grid instead of
 * walking the crowd, and it is the one question here where the grid's one step of staleness is
 * beneath the resolution of the answer: a bite and a thread are touch tests, judged where a body
 * ended up this step (game/orbitals.js, game/tether.js), but a sight line three hundred pixels long
 * is judged at where a body will be when the shell gets there, and the shell takes a tenth of a second
 * over that ground. Asking it is also what keeps a rank-five fence cheap: `reach` over a capped crowd
 * is a wide query, and the grid is exactly the tool for a wide query (core/grid.js).
 */
function lockOn(world, turret, spec) {
  // The query is as wide as the widest skin it could be asked about, and the test is per body: a body's
  // skin is inside the sight when its centre is `reach + its own r` away, and the grid answers for
  // centres (game/tether.js argues the same argument for its band).
  const found = world.grid.queryInto(turret.x, turret.y, spec.reach + widestBodyOn(world), lockScratch);
  let best = null;
  let nearest = Infinity;
  for (let i = 0; i < found; i++) {
    const body = lockScratch[i];
    // A body brought down earlier this step is still filed in the grid, and it is not worth a shell.
    if (body.hp <= 0) continue;
    const reach = spec.reach + body.r;
    const by = dist2(turret.x, turret.y, body.x, body.y);
    if (by > reach * reach || by >= nearest) continue;
    nearest = by;
    best = body;
  }
  return best;
}

/**
 * One shell: a bullet of this run's own gun, thrown along the nose - *the nose*, not the lock, which
 * is the whole difference between a gun and a targeting beam: a shell leaves where the barrel is
 * pointing and it is the swing that decides whether that was where the body was.
 *
 * It carries no pierce and no ricochet, and it dies at the end of the line it was drawn along, so the
 * gun cannot reach past its own sight line and cannot plough through a second body on the way.
 */
function fireShell(world, turret, spec) {
  const line = world.turret;
  const shell = spec.shell;
  const bullet = world.bullets.spawn();
  const nx = turret.x + Math.cos(turret.angle) * spec.muzzle;
  const ny = turret.y + Math.sin(turret.angle) * spec.muzzle;
  bullet.x = nx;
  bullet.y = ny;
  bullet.px = nx;
  bullet.py = ny;
  bullet.vx = Math.cos(turret.angle) * shell.speed;
  bullet.vy = Math.sin(turret.angle) * shell.speed;
  // As far as the sight line, plus the two widths that are the difference between a range measured to
  // a body's centre and one measured to its skin: the widest body a gun may be aimed at, and the shot's
  // own radius (game/bullets.js counts a hit at `r + hitRadius`). A shell cut off at exactly `reach`
  // would die a body's width short of the far edge of the body it was aimed at.
  bullet.life = (spec.reach + widestBodyOn(world) + BALANCE.bullets.hitRadius) / shell.speed;
  bullet.dmg = BALANCE.bullets.damage * gainOf(world, 'damage') * spec.weight;
  bullet.knock = shell.knock;
  bullet.pierce = 0;
  bullet.bounce = 0;
  bullet.charged = false;
  // And that it is a plain shell and not one of the Swarm's hunting ones (game/missiles.js): a
  // turret's gun throws what its own row says, and a recycled shot would otherwise come out of the
  // drawer still steering.
  bullet.hunts = false;
  bullet.splash = 0;
  bullet.hits.length = 0;
  // The one flag a shot in this game carries about its parentage, and the only reason it exists is
  // that a shell is paid out by game/bullets.js and not here, so this is the only way the line can
  // ever find out what its own guns came round (game/bullets.js is where it is read back).
  bullet.turret = true;

  line.shots++;
  const flash = spec.shot;
  burst(world, nx, ny, PALETTE.spark, flash.count, flash.speed, flash.life);
  const sound = spec.shot.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * One gun, going out unwasted: a small light closing in on the place it stood, and a note quiet
 * enough that the arena is not noisy about the ground the ship did not hold.
 */
function goOut(world, turret, spec) {
  const gone = spec.gone;
  ring(world, turret.x, turret.y, PALETTE.player,
    gone.ring.radius, gone.ring.speed, gone.ring.life);
  const sound = gone.sound;
  cueBeep(sound.freq, sound.dur, sound.wave, sound.vol, sound.slide);
}

/**
 * One step of the line: every gun counts down, looks for something to shoot at, comes round on to it
 * and fires when it is lined up and its beat has come round; then the next crew is planted if the
 * clock says it is time. Called with no guns standing and no ranks as often as not - that is two
 * compares and a return.
 *
 * It runs after the crowd has walked, so the crowd is read where it ended up - the grid was rebuilt
 * this step by game/bullets.js and is a step stale by now, which `lockOn` has the argument for. A
 * shell can end the run the way a mine's blast can, by killing a bomber whose own blast reaches the
 * ship, and it is handled the same way: by the state check the step loop already makes, not by
 * anything here.
 */
export function updateTurret(world, dt) {
  const spec = BALANCE.upgrades.turret;
  const stands = world.turret.stands;

  for (let i = stands.count - 1; i >= 0; i--) {
    const turret = stands.items[i];

    if (turret.cool > 0) turret.cool = Math.max(0, turret.cool - dt);
    turret.life -= dt;
    if (turret.life <= 0) {
      goOut(world, turret, spec);
      stands.killAt(i);
      continue;
    }

    const prey = lockOn(world, turret, spec);
    world.turret.steps++;
    if (prey === null) {
      // Nobody in sight: the gun holds its bearing and keeps its beat, and the sight line goes dark.
      turret.aim = 0;
      continue;
    }
    world.turret.seen++;

    const wanted = Math.atan2(prey.y - turret.y, prey.x - turret.x);
    const off = turnTo(turret.angle, wanted);
    turret.angle = turret.angle + clamp(off, -spec.turn * dt, spec.turn * dt);

    // Lined up is a state the gun holds, not a moment it passes through: the nose keeps tracking the
    // lock, so a gun that has come round stays round and fires on its own beat.
    turret.aim = Math.abs(off) <= spec.aim ? 1 : 0;
    if (turret.aim === 0 || turret.cool > 0) continue;
    turret.cool = spec.beat;
    fireShell(world, turret, spec);
  }

  const perCrew = gunsPerCrewOf(world);
  if (perCrew === 0) {
    // Nothing counted down while the line was untaken, so the first crew a card buys is planted on
    // the very next step: take TURRET and the road in front of you starts being armed.
    world.turret.wait = 0;
    return;
  }

  world.turret.wait -= dt;
  if (world.turret.wait > 0) return;
  world.turret.wait = spec.cycle;
  plantCrew(world, spec);
}

/**
 * How near a gun is to going out on its own clock: 0 for most of its life, up to 1 as it stops. The
 * painter fades the whole gun on this, so the arena says which guns are still holding ground and
 * which are about to stop (game/mines.js fades its mines the same way).
 */
export function fadingOf(turret) {
  const spec = BALANCE.upgrades.turret;
  if (turret.life >= spec.fade) return 0;
  return 1 - Math.max(0, turret.life) / spec.fade;
}

/** How near a gun is to lined up on its lock: 1 when a shell may leave, 0 when it has nothing to
 *  shoot at or its nose is still coming round. The barrel and the sight line are painted on this,
 *  which is the only way the picture can be honest about a gun that cannot fire yet. */
export function aimedOf(turret) {
  return turret.aim;
}

/** How near a gun is to its next shell: 0 the moment one left and up to 1 when the beat has come
 *  round. The muzzle light is painted out of this, so a gun brightens *because* it is about to fire
 *  - the same bargain game/tether.js paints its threads on. */
export function reloadingOf(turret) {
  const beat = BALANCE.upgrades.turret.beat;
  if (beat <= 0) return 1;
  return 1 - turret.cool / beat;
}

/**
 * How near the ship is to planting another crew: 0 the step one was set down and 1 when the next
 * one is due. A gun stands where it was planted and fades as its ten seconds run out, so the
 * arena does say which guns are still holding ground - but it cannot say anything about the two
 * seconds *after* the last one goes out, which is the gap a run has to plan around. The HUD
 * closes an arc round the turret's own mark over that wait (render/hud.js).
 *
 * A run with no ranks of the line has no wait and answers 1: the first crew a card buys is
 * planted on the very next step.
 */
export function dueOf(world) {
  const cycle = BALANCE.upgrades.turret.cycle;
  if (cycle <= 0) return 1;
  return clamp(1 - world.turret.wait / cycle, 0, 1);
}

/**
 * Count one body that a turret's shell came round. Called by game/bullets.js from the one place in
 * the game that knows a shell landed, because a shell is a bullet and bullets are spent there and
 * not here; a turret that counted its own hits would have to guess them from the crowd.
 */
export function noteShell(world) {
  world.turret.hit++;
}
