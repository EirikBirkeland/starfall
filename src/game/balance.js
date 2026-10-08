// Every simulation tuning number in the game (PLAN section 3).
//
// Nothing in game/ may hard-code a gameplay value; it comes from here.
// Purely visual constants (fonts, paddings, star layers) live with the code
// that draws them, and the colours live in core/palette.js.

import { PALETTE } from '../core/palette.js';

export const BALANCE = {
  sim: {
    // The simulation always advances by exactly this much, however the display
    // ticks (PLAN section 2). A frame gap longer than maxFrameDt is counted as
    // that much - a background tab, not a hard frame - so the most steps one
    // frame may catch up is maxFrameDt / step.
    step: 1 / 120,
    maxFrameDt: 0.1,
  },

  arena: {
    // The world is bigger than the window and the camera looks at a corner of it
    // (PLAN section 4). The ship is kept inside these numbers.
    w: 3000,
    h: 3000,
    // The window is not balance, but the simulation has to know how big it is to
    // spawn things off the edge of it, so the frame loop writes the real size
    // into `world.view` on every resize and these are what it assumes until the
    // first one lands.
    viewW: 1280,
    viewH: 720,
  },

  grid: {
    // The collision broad phase's cell width in pixels. It wants to be about
    // twice the widest hit test (the fattest enemy plus the bullet's reach), so
    // a query reads a couple of cells and every cell it reads holds something.
    cellSize: 64,
  },

  player: {
    // PLAN 3.1. The ship is quick off the mark and stops almost as fast: both
    // numbers are a rate of change of velocity, so game/player.js steers with one
    // rule however the ship happens to be moving.
    hitRadius: 6,           // what an enemy has to actually touch - deliberately far smaller than the drawing
    drawRadius: 13,         // the ship you see; its nose sits 16 px out from the middle
    maxSpeed: 320,          // px/s
    accel: 2400,            // px/s^2 - full speed about 0.13 s after you lean
    brake: 3200,            // px/s^2 - letting go stops it in about 0.10 s
    hull: 3,
    // The most the ship can hold. Nothing raises it yet - an elite's heal is clamped
    // to it (see `elite` below) - and the milestone 4 upgrades will.
    maxHull: 3,
    // What coming back a hull looks and sounds like. Mint, because cool colours mean
    // help (PLAN section 4) and this is the only good news a run gives out by itself.
    heal: {
      sparks: { count: 20, speed: 220, life: 0.6 },
      ring: { radius: 9, speed: 360, life: 0.45 },
      labelOffset: 6,
      sound: { notes: [520, 780, 1040], dur: 0.16, wave: 'sine', vol: 0.09 },
    },
    startInvulnerability: 1.2,
    hitInvulnerability: 1.5,
    hitShoveRadius: 92,          // the crowd is pushed out after a hit
    hitShoveImpulse: 340,
    thrustRamp: 6,               // how fast the thruster graphic fades in and out

    // The wake the engines drop (PLAN section 4): `rate` puffs a second out of the
    // nozzles while the engines are lit, thrown backwards at `speed` and carrying
    // `inherit` of the ship's own velocity, so the trail hangs behind the ship
    // instead of flying off on its own. `at` is the thrust it needs before it shows
    // at all, so a ship that is only being nudged does not trail anything.
    exhaust: {
      rate: 26, speed: 130, speedFloor: 0.4, spread: 0.3,
      life: 0.34, nozzle: 7, inherit: 0.35, at: 0.25,
      color: PALETTE.exhaust,
    },

    // PLAN 3.1's dash. One committed burst, then a wait. The whole distance is
    // covered at a steady speed whatever the engines are doing - the ship is on
    // rails for `time` seconds - which is why it is a distance and a duration
    // rather than a shove of velocity the brakes would fight.
    dash: {
      distance: 220,          // px, all of them, unless the arena gets in the way
      time: 0.12,             // s to cover them
      cooldown: 2.5,          // s, from the start of one dash to the next
      shake: 2.5,             // a flick of trauma, so it is felt as well as seen
      // The crowd is shouldered out of the way as the dash goes through it, which
      // is also what makes a dash that ends inside a mob end somewhere you can
      // stand. Radius is measured from the ship's body plus the enemy's own.
      shove: { radius: 26, impulse: 300 },
      // Sparks left behind, one spray per step, thrown back along the dash.
      streak: { count: 2, speed: 150, life: 0.26, spread: 0.4 },
      // The burst and the ring that mark the moment it starts.
      start: { burst: 14, speed: 250, life: 0.32, ring: 7, ringSpeed: 380, ringLife: 0.3 },
      sound: { freq: 260, dur: 0.16, wave: 'triangle', vol: 0.06, slide: 880 },
    },
  },

  // The primaries (PLAN 3.2). One is flown at a time. The pick is made on the title
  // screen with a number key until the hangar exists (milestone 5), and `default` is
  // what a run that has not picked anything flies.
  //
  // A weapon owns everything about one pull of the trigger: how often it cycles, how
  // many projectiles it throws and where they point, what each one costs a body, how
  // fast and how far it flies, how hard it shoves, what the ship is shoved back by,
  // and what it sounds like. `game/weapons.js` is the code that reads them;
  // `game/bullets.js` is what every shot has in common whatever fired it.
  //
  // `damage` is hull per projectile, in the one unit enemy hull is counted in
  // (`bullets.damage` below - a drifter is three of them), so a weapon's weight at point
  // blank is `fireRate x pellets x damage`:
  //
  //   pulse    4.4 pulls x 1 shot    x 1    =  4.4 hull/s, out to about 700 px
  //   scatter  2.2 pulls x 6 pellets x 1    = 13.2 hull/s, out to about 370 px
  //   arc      4 pulls x 1 chain     x 1    =  4.0 hull/s on one body out to 260 px, and up
  //                                          to four bodies' heads on a pull if they stand in
  //                                          a chain, wherever they stand
  //
  // and the honest note about those three lines is that what leaves the gun is not what a body
  // pays: a cone spends most of itself on air, and a chain only lands where there is a body to
  // land on. That is why none of the three was tuned off these products and all of them were
  // measured instead - on three crowds, in NOTES sessions 33 and 34, and again any time with
  // `node tools/power-ladder.js --weapon scatter`.
  weapons: {
    default: 'pulse',
    // The most shots one ship may have in the air in a second, whatever the gun and
    // whatever the lines: a frame-budget guard rather than a balance number. It sits
    // above what the fire rate line can reach on any weapon in the game, so what a
    // player picks is never silently thrown away. A maxed pulse is 9.2 pulls of six
    // projectiles and a maxed scatter 4.6 pulls of eleven, which is the same order of
    // shots a second and the reason one number serves them all.
    rateMax: 15,
    pulse: {
      name: 'PULSE',
      fireRate: 4.4,        // pulls a second, before upgrades
      pellets: 1,           // projectiles in one pull, before the split line
      gap: 0,               // radians between neighbours of the gun's own fan
      damage: 1,            // hull per projectile
      speed: 620,           // px/s
      life: 1.15,           // s, so its reach is speed * life: about 700 px
      spread: 0.045,        // radians of random aim error per projectile
      knockback: 0.08,      // shot velocity transferred into the body it hits
      recoil: 14,           // firing pushes the ship back
      muzzle: { count: 2, speed: 60, life: 0.18 },
      sound: { base: 720, jitter: 100, dur: 0.05, wave: 'square', vol: 0.045, slide: 300 },
    },
    scatter: {
      name: 'SCATTER',
      fireRate: 2.2,        // PLAN 3.2's pull rate: half as many pulls as the pulse
      pellets: 6,           // PLAN's "7 x 6 pellets"
      // Radians between two neighbours of the cone, so five gaps of it is PLAN's 30
      // degrees from the first pellet to the last. The aim itself always keeps a
      // pellet (game/weapons.js lays a fan out from the nose outwards), which is what
      // makes a shotgun aimable at all.
      gap: 0.105,
      // One pulse shot per pellet - the sentence a player understands, and the number
      // that makes the cone worth having. It is not PLAN's number, and the reason is the
      // one thing about a shotgun that is easy to get wrong on paper: a lone body catches
      // one or three of the six and the rest goes past it, so what arrives is a fraction of
      // what left, and the fraction shrinks with distance. PLAN's table has the scatter at
      // 1.55x the pulse's damage per second (7 x 6 at 2.2/s against 10 at 6/s), and a 30
      // degree cone cannot meet that ratio at both ends of its range: one pellet would then
      // have to cost three pulse shots, which is 12x the pulse on a body standing in the fan
      // and still only a third of the fan on one standing off it. Measured on one lone
      // drifter instead, six seeds, hull a second, with the same body under the pulse in
      // brackets (test/scatter.test.mjs holds the shape of it):
      //
      //    60 px   5.8  (1.46x)     150 px  3.7  (0.93x)     300 px  2.2  (0.61x)
      //    90 px   5.1  (1.26x)     240 px  2.4  (0.65x)
      //
      // so it is a closer gun and a weaker one far off, which is the weapon PLAN asked
      // for - and against a crowd standing in the fan it is worth two and a half to three
      // times a pulse (tools/power-ladder.js on the ring and column knots: 12.2 and 13.0
      // hull a second against the pulse's 4.3). At half a hull a pellet - my first guess,
      // reading PLAN's 7 as a share of a pull - the middle row read 1.75 against 4.00, and forty bot
      // runs on the scatter medianed 3m53s against the pulse's 15m00s, which is not a
      // second primary, it is a worse one. Where it is now, the near-field knot reads 5.9
      // against 4.3 and the same forty seeds mean 6628 kills against the pulse's 6175.
      damage: 1,
      speed: 560,
      // The reach: 370 px against the pulse's 700. It is not shorter just to be punishing;
      // a cone that dies before the crowd chasing you never gets to be a cone, and the
      // first attempt at 280 px spent its weight on air at exactly the distance a fleeing
      // ship keeps its arrivals. It still wants flying *at* things, which is the different
      // game.
      life: 0.66,
      // A touch wider than the pulse's: a shotgun is a fan of shots and not a grid of
      // them, and at this gap the error is what stops the six of them being parallel.
      spread: 0.05,
      // PLAN's "heavy knockback", and it is heavy: a whole fan landing on one body is
      // about 250 px/s of shove - a nova front's worth of shrug, and what punches a hole
      // in a press.
      //
      // Not heavier, and 0.16 was tried first: six of those hand a body ~540 px/s, faster
      // than the ship can run, so a close pull flung its target out of the very range the
      // next pull needs. The crowd became a cloud flying away from the player and the gun
      // could not spend the reach it had. A shove that outruns the fight is not a feature
      // of a short-range weapon.
      knockback: 0.07,
      // One kick per pull, not per pellet - the ship is shoved by the gun, not by
      // whatever it hit.
      recoil: 55,
      muzzle: { count: 6, speed: 150, life: 0.16 },
      // One heavy thump, and still one per pull however many pellets came with it
      // (the mix has no voice limiting until milestone 7).
      sound: { base: 190, jitter: 34, dur: 0.09, wave: 'sawtooth', vol: 0.07, slide: 70 },
    },
    arc: {
      name: 'ARC',
      // PLAN's four pulls a second, and the one gun in the game that is not aimed: the bolt
      // finds the nearest body itself (game/arc.js), so what you point at is not what it
      // strikes. That is the gun and not an oversight - the pulse is the weapon you aim, the
      // scatter is the weapon you point, and this is the weapon you *fly*, and it is the only
      // one of the three whose value goes up when the crowd closes.
      fireRate: 4,
      // One chain per pull. `pellets` is how many things a pull sends out, and on this gun
      // the things are chains rather than shots: the split line's extras each start a fresh
      // chain at the nearest body the last one left alone.
      pellets: 1,
      gap: 0,             // nothing is laid out along an arc; there is no fan to open
      // What the head of a chain costs a body, in the unit enemy hull is counted in.
      //
      // PLAN writes 8 against the pulse's 10 - four fifths of one of its shots - and the first
      // cut of this gun kept that ratio. It was wrong, and the reason is the one thing a table
      // cannot see: a bolt cannot miss. It is not pointed, it does not travel, it does not lead,
      // and it cannot be dodged by walking sideways, so a landing is worth more than a shot and
      // the same ratio that makes the arc the weaker gun per shot makes it the weaker gun
      // altogether. At four fifths of a pulse shot it cost a lone body 3.1 hull a second
      // against the pulse's 4.3, the crowd knots 9.2 against the scatter's 12.2, and the
      // near-field knot 5.6 against the scatter's 5.9: worse than the best of the other two
      // everywhere, which is not a third primary, it is a third of a bad one.
      //
      // At a whole pulse shot it is the equal of the scatter in a bot's hands and better than
      // the pulse, and it still loses to the pulse on one body at a time - which is the trade
      // a chain is supposed to be. One lone drifter, six seeds, hull a second, the same
      // instrument test/arc.test.mjs drives (the pulse in brackets):
      //
      //    60 px   3.9  (0.90x)     150 px  3.9  (0.92x)     260 px  3.9  (0.94x)
      //    90 px   3.9  (0.90x)     220 px  3.9  (0.92x)     300 px  0.0  (gone: the reach)
      //
      // flat with range, because none of it is a projectile - and on the ladder's three crowds
      // (`tools/power-ladder.js --weapon arc`, the scatter quoted from session 33):
      //
      //    the ring        11.6  (pulse 4.3, scatter 12.2)
      //    the column      11.6  (pulse 4.3, scatter 13.0)
      //    the near field   7.0  (pulse 4.3, scatter  5.9)
      //
      // so it is second on a crowd thirty deep - where a chain capped at four bodies cannot
      // follow a fan that sweeps all of them - and first on the three bodies a fleeing ship
      // really has round it, which is the only place left for a weapon that aims itself to live.
      //
      // And forty seeds of the real thing, aware bot, fifteen-minute cap, one column per gun:
      // median 15m00s for all three, mean 14m34s against the scatter's 14m38s and the pulse's
      // 13m31s; 38 of 40 outlasted the window against the scatter's 38 and the pulse's 35; mean
      // kills 6461 against 6555 and 5770; mean score 114425 against 116403 and 103079. Level
      // with the scatter, ahead of the pulse, and inside PLAN's twenty-five percent band. Note
      // what that measurement cannot see: the bot aims at the nearest body, which is exactly
      // what this gun does by itself, so a human who cannot hold a cursor on a drifter gains
      // more than the table shows. That is the point of the gun.
      damage: 1,
      recoil: 26,         // the ship is shoved back by the discharge, lightly and once a pull
      muzzle: { count: 4, speed: 110, life: 0.14 },
      // A crackle rather than a shot: high, up into the squeal instead of down out of it, and
      // one per pull like every other gun here - a chain that landed on four bodies is one
      // sound and not four, because the mix has no voice limiting until milestone 7.
      sound: { base: 1180, jitter: 420, dur: 0.055, wave: 'sawtooth', vol: 0.03, slide: 2400 },
      // The chain itself (game/arc.js). Everything about a leap is here: how far the first
      // one reaches from the ship, how much further the next may go from where it landed, how
      // many landings a pull gets, and what each of them costs.
      chain: {
        // px, from the ship's nose to the body the bolt picks. It is the gun's range and the
        // player's only sight of it, so it wants to be the distance a press really keeps
        // rather than the distance a window has: measured, the mean number of bodies inside
        // 220 px of a fleeing ship is two and a third (session 32), so at 260 the bolt nearly
        // always finds something and nearly always finds it in front of the crowd rather than
        // out in the clear sky behind it.
        reach: 260,
        // px, from a body the bolt is standing on to the next one. Shorter than the reach - a
        // hop from body to body is a shorter thing to see than a leap off the ship - but long
        // enough to be a chain at all in a crowd that is only ever three bodies deep: the
        // near-field knot has its bodies about 210 px apart, measured over twelve bot runs, so
        // this sits beside the ricochet's own reach for the same reason and is the same number.
        //
        // It cannot be much smaller. At 120 px the same knot reads 3.9 hull a second instead of
        // 7.0 - under the pulse's 4.3 - because the bolt lands on the near body and stops, which
        // is a slow pulse with worse aim rather than a chain. The ladder is the argument: a
        // leap nobody can measure is not a feature.
        leap: 220,
        jumps: 3,         // PLAN's "chains to 3 nearby enemies", so four bodies a pull
        decay: 0.8,       // PLAN's "20% less damage per jump", compounding down the chain
        // px/s of shove a landing gives the body it lands on, away from wherever the bolt
        // came in from. Small - a bolt has no mass, and a chain that pushed bodies around
        // like a scatter pellet would be a crowd-spreading tool rather than a weapon, which
        // is the trap session 33 found on the scatter's knockback. It is not nothing: the
        // shove is what makes a chain read as travelling.
        jolt: 70,
        // How long a bolt is left on screen after the leap it records. It is a flash and not
        // a trail: long enough to see where the damage went (four leaps at this is a shape a
        // player can read at a glance) and short enough that the sky is not full of last
        // second's lightning while this second's is trying to be seen.
        bolt: { life: 0.16 },
        // Sparks at each landing, thrown back along the line the bolt came in on.
        hit: { count: 3, speed: 140, life: 0.18, spread: 0.9 },
      },
    },
  },

  bullets: {
    // The unit: one shot of the plain gun, and the unit every enemy's `hull` is
    // counted in. It is deliberately not read off whatever weapon is being flown -
    // game/orbitals.js and game/nova.js spend it as "one shot of the ship's gun" so
    // that a drone bite and a nova front cost a body the same whatever was picked for
    // the trigger, and why that is the honest reading is in NOTES session 33.
    damage: 1,
    noseOffset: 6,          // spawn distance in front of the ship
    despawnMargin: 30,      // this far outside the arena, it is gone
    hitRadius: 3.5,         // added to the enemy radius for a hit
    impact: { count: 4, speed: 130, life: 0.24 },
    impactSound: { min: 300, max: 360, dur: 0.03, wave: 'square', vol: 0.02, slide: 200 },
  },

  // What every enemy shot shares, whoever fired it. How fast and how big a
  // particular one is lives with the kind that spits it (see `kinds.spitter.spit`).
  enemyShots: {
    despawnMargin: 40,        // this far outside the arena, it is gone
    impact: { count: 6, speed: 200, life: 0.3 },
  },

  // How an enemy kind behaves. Behaviour itself is a small function in
  // game/kinds.js; this is the data it reads. `glow` is the one exception: it
  // is not read by the simulation at all, it is how far that kind's halo reaches
  // past its body, in pixels, and only the renderer looks at it.
  // One row per kind, named as PLAN 3.3 names them: a drifter walks at you, a
  // weaver weaves, a tank turns slowly and comes apart. `hull` is counted in
  // player shots (a bullet does `bullets.damage`), not in PLAN's damage numbers.
  //
  // Three more numbers per kind are the wave director's (game/waves.js), and they
  // describe the kind as a *spawn*, not as a fighter:
  //
  //   from    seconds of run before it may arrive at all (PLAN 3.3's "appears from")
  //   weight  how often one of them is wanted when the director is buying
  //   cost    how much of the run's spawn budget one of them takes up
  //
  // `weight` is a share of the arrivals and nothing else - the six numbers below say
  // "for every six drifters, five weavers, three darters, three tanks, two spitters".
  // `cost` is what makes a tank a rare thing rather than a common one: the room a
  // wave has to spend is what limits how many bodies arrive, and an expensive kind
  // fits into a wave fewer times. Raising a weight and lowering a cost is how you
  // make a kind common; the reverse makes it a rare, worrying arrival.
  kinds: {
    drifter: {
      radius: 15, speed: 76, hull: 3, score: 10, drop: 2,
      from: 0, cost: 2, weight: 6,
      color: PALETTE.violet, fill: PALETTE.violetFill, sides: 3, glow: 16,
      death: { particles: 16, speed: 240, debris: 4, debrisSpeed: 120 },
      sound: { freq: 210, dur: 0.12 },
    },
    weaver: {
      radius: 10, speed: 172, hull: 1, score: 15, drop: 1,
      from: 0, cost: 3, weight: 5,
      color: PALETTE.pink, fill: PALETTE.pinkFill, sides: 3, glow: 14,
      wobble: { amount: 0.42, rate: 5.5 },
      spin: { rate: 9, amount: 0.35 },
      death: { particles: 12, speed: 240, debris: 2, debrisSpeed: 165 },
      sound: { freq: 210, dur: 0.12 },
    },
    darter: {
      radius: 11, speed: 104, hull: 2, score: 18, drop: 2,
      from: 60, cost: 4, weight: 3,
      // `sides` is the fallback shape; the dart is drawn by its own silhouette.
      color: PALETTE.red, fill: PALETTE.redFill, sides: 3, glow: 16,
      // The hunt, in four beats: it walks at you, stops dead to line itself up,
      // comes down that line faster than you can run, and rests while it comes
      // about. `commit` is how far off it will start an aim at all; `turn` how fast
      // it can bring its nose onto the line during one; `mul` is the lunge's speed
      // as a multiple of its own, so the run's speed scaling reaches the lunge too.
      // The warning line the renderer draws is `mul * time` of its own speed long,
      // which is exactly how far the lunge goes.
      hunt: {
        commit: 430, beat: 0.4, turn: 9,
        aim: {
          time: 0.62,
          sound: { freq: 1250, dur: 0.12, wave: 'triangle', vol: 0.016, slide: 2000 },
        },
        lunge: {
          mul: 5.2, time: 0.45,
          sound: { freq: 720, dur: 0.1, wave: 'square', vol: 0.03, slide: 180 },
        },
        rest: { time: 0.55, crawl: 0.3 },
      },
      // It comes apart along its own axis: `jet` sparks out of the nose and the
      // same again out of the tail, on top of the wreck every kind makes.
      death: {
        particles: 14, speed: 300, debris: 3, debrisSpeed: 210,
        jet: { count: 8, speed: 260, life: 0.3, spread: 0.22 },
      },
      sound: { freq: 240, dur: 0.12 },
    },
    spitter: {
      radius: 14, speed: 66, hull: 5, score: 26, drop: 3,
      from: 180, cost: 6, weight: 2,
      color: PALETTE.orange, fill: PALETTE.orangeFill, sides: 5, glow: 18,
      // It keeps its distance and spits from there. `near`/`far` are the band it
      // tries to stand in - it walks in from beyond `far` and backs off inside
      // `near` - and `drift` is the sideways crawl that stops it sitting still
      // inside that band. `wind` is the wind-up: it stops dead, its mouth fills with
      // light, and the shot leaves along the direction it had locked when the
      // wind-up *began*. `after` is the pause before the next one.
      //
      // The shot is slower than the ship on purpose: a slow, warm, visible bullet is
      // a threat you can read, and it is the reading that makes it fair.
      spit: {
        range: { near: 200, far: 330 },
        drift: { speed: 52, rate: 1.3 },
        wind: {
          time: 0.45,
          sound: { freq: 300, dur: 0.2, wave: 'sawtooth', vol: 0.022, slide: 90 },
        },
        after: 1.7,
        shot: { speed: 270, radius: 4.5, life: 2.6, color: PALETTE.enemyShot },
      },
      death: { particles: 18, speed: 260, debris: 5, debrisSpeed: 180 },
      sound: { freq: 180, dur: 0.16 },
    },
    tank: {
      radius: 26, speed: 48, hull: 9, score: 35, drop: 5,
      from: 10, cost: 8, weight: 3,
      color: PALETTE.amber, fill: PALETTE.amberFill, sides: 6, glow: 22,
      rotateRate: 0.55,
      // What it comes apart into: `into` of `type`, thrown outwards at `impulse`
      // from `offset` out. Naming the kind here is what lets the split be data.
      split: { into: 2, type: 'drifter', hpFactor: 0.5, radius: 12, drop: 1, speedMul: 1.25, impulse: 190, score: 8, offset: 8 },
      // `hitStop` marks a kill big enough to stop the run for: the seconds the
      // whole world holds still when this kind goes down (PLAN section 4). A
      // kind that does not ask for one is simply not a big enough event.
      death: { particles: 30, speed: 340, debris: 14, debrisSpeed: 200, ringSpeed: 420, shake: 6, hitStop: 0.04 },
      sound: { freq: 130, dur: 0.24 },
    },
    bomber: {
      radius: 18, speed: 96, hull: 7, score: 32, drop: 4,
      from: 360, cost: 7, weight: 3,
      color: PALETTE.ember, fill: PALETTE.emberFill, sides: 8, glow: 20,
      // Its whole behaviour is its death. It walks at you - and that is all it does -
      // while the circle drawn round it says exactly what standing in it costs when it
      // finally goes off: `radius` px from its centre, `damage` in player shots, for
      // the crowd as much as for the ship. Measured from a *centre* either way, which
      // is what makes the drawn ring the honest edge: your ship's middle outside the
      // line and you are not hurt, whoever else's middle is inside it and you are.
      //
      // `arm` is the share of its hull left when it stops being careful about the
      // thing it is carrying: below it the bomber walks `rush` times as fast and its
      // ring starts to pulse hard, which is the tell that it means to take you with
      // it. So the decision a bomber asks for is where to shoot it, not whether.
      //
      // It is also the first thing in the game that can hurt its own kind, which is
      // what makes the wave director's habit of arriving in knots something you can
      // use: a wave that walks into a dying bomber is a wave that dies.
      blast: {
        radius: 108, damage: 6,
        arm: 0.45, rush: 1.4,
        shove: 260,          // the blast throws the crowd outwards as it goes
        ring: { radius: 12, speed: 760, life: 0.32 },
        flash: { count: 24, speed: 420, life: 0.4 },
        shake: 9,
        hitStop: 0.05,
        sound: { freq: 84, dur: 0.4, wave: 'sawtooth', vol: 0.16, slide: 34 },
      },
      death: { particles: 20, speed: 280, debris: 6, debrisSpeed: 190 },
      sound: { freq: 150, dur: 0.2 },
    },
    shielder: {
      radius: 17, speed: 60, hull: 8, score: 40, drop: 4,
      from: 450, cost: 8, weight: 1,
      // `sides` is the fallback shape; the bulwark is drawn by its own silhouette
      // (render/entities.js), flat side towards whatever it is standing between.
      color: PALETTE.magenta, fill: PALETTE.magentaFill, sides: 6, glow: 20,
      // The field (game/shields.js). Every other body standing `radius` px away is
      // covered: it gets a shield of `cap` points over it, and anything aimed at it
      // comes off the shield before it comes off the hull. Once a shield has soaked
      // anything it waits `after` seconds of being left alone, then fills back at
      // `rate` points a second.
      //
      // The two numbers that make "kill it first" the right answer are `cap` and the
      // fact that a field going out takes its shields with it: hull you have already
      // taken off a crowd stays off, so one shielder dying makes every body behind it
      // cheap at the same moment. `cap` is a flat number of player shots rather than a
      // share of a body's hull on purpose - a shield is three shots of armour whoever
      // is wearing it, and it does not compound the run's hull scaling.
      //
      // `radius` is the number to be careful with, because it is an *area*: late in a
      // run the whole crowd is packed into one window of ~1280x720 and six or seven
      // circles that reach 210 px tile that window - measured, and it turned the kind
      // from a decision into weather (93 bodies of 97 covered, the bot's killing cut
      // nearly in half). At 150 two or three of them cover about half a crowd, which is
      // what the whole idea asks for: a cluster is protected, and going and finding the
      // thing doing it is the player's move. `weight` 1 keeps them rare for the same
      // reason - one every couple of minutes, so each arrival is worth noticing.
      //
      // Two fields do not stack: a body in both is protected or it is not. A second
      // shielder therefore buys a wider crowd to shoot through, not one more body to
      // shoot at, and `cap` staying flat is what makes that one line of arithmetic.
      //
      // `stand` is the band it likes to hold, in px from the ship: it walks in from
      // beyond `far`, backs off inside `near`, and shuffles sideways with `drift` so
      // it is never a fixed point to shoot at. It never melees: a shielder that walks
      // into your face is a shielder you kill by accident.
      guard: {
        radius: 150, cap: 3, after: 2.5, rate: 1.2,
        stand: { near: 150, far: 250 },
        drift: { speed: 46, rate: 1.1 },
        // What a shield going out looks like. `pop` is one body's bubble, which
        // happens a handful of times a minute as a crowd walks in and out of a field;
        // `collapse` is the field itself, which happens once and is the loud one. Its
        // `ring.speed` is negative - the circle closes in on the body that was holding
        // it - and slow enough that it still has a radius left when its life runs out.
        pop: {
          ring: { radius: 5, speed: 200, life: 0.2 },
          burst: { count: 5, speed: 190, life: 0.25 },
        },
        collapse: {
          ring: { radius: 150, speed: -520, life: 0.3 },
          burst: { count: 26, speed: 300, life: 0.5 },
          shake: 4,
          sound: { freq: 320, dur: 0.34, wave: 'triangle', vol: 0.06, slide: 70 },
        },
        // The sound of a hit that never reached the hull.
        block: { freq: 880, dur: 0.05, wave: 'square', vol: 0.028, slide: 240 },
      },
      death: { particles: 22, speed: 290, debris: 8, debrisSpeed: 200 },
      sound: { freq: 170, dur: 0.2 },
    },
    // PLAN 3.3's "splitter swarm" (9:00): "8 each, 180, arrives in packs of 20, flocks".
    // The row is one body of that swarm - the kind is called a swarmling because the
    // pack is the arrival and this is what arrives - and the word "splitter" is taken:
    // a tank already splits (see `split` above), and two kinds meaning "comes apart into
    // more of me" would be one idea too many. What this one does instead is fly with its
    // friends (game/flock.js).
    swarmling: {
      radius: 7, speed: 190, hull: 1, score: 10, drop: 1,
      from: 540, cost: 1, weight: 1,
      // `sides` is the fallback shape; the swarmling is drawn as a long thin dart
      // (render/entities.js), because the only way twenty of them can be told apart
      // from a drifter at seven pixels is the shape and the colour.
      color: PALETTE.swarm, fill: PALETTE.swarmFill, sides: 3, glow: 11,
      // The arrival (game/waves.js). A wave that rolls this kind buys a *pack*: one
      // entry in the wave's fan that turns into `into` bodies standing in a `clump`
      // px-wide clump on one side of the window. `min` is the smallest pack worth the
      // name, and it is what the roll has to be able to pay for - so a swarm is never
      // bought a body at a time and never arrives as three of them.
      //
      // `cost` is per body, like every other kind, and the two locksteps that keep the
      // pack possible are asserted in test/swarm.test.mjs: `cost * min` has to fit in
      // the smallest wave the director will spend, and `cost * into` in the biggest.
      pack: { into: 20, min: 8, clump: 62 },
      // The flock (game/flock.js). Every body of a pack pulls at the ship, back
      // towards the pack's middle when it is further than `keep` px out of it, and
      // along the way its neighbours are flying; `pull` and `align` are the weights of
      // those three pulls, `sway` is the shimmer that stops the pack freezing into one
      // shape, and `turn` is how fast one of them can change its mind, rad/s. All of
      // it is arithmetic on the crowd, so a walk spends no randomness.
      //
      // Then the pack dives. Every `gather` seconds it bunches up for `brace` of them
      // - `braceKeep` is how much narrower it tries to be while it does, and
      // `braceSpeed` how much slower it crawls - and then every body flies the one
      // line the pack locked when the brace ended, at `dive.mul` times its speed for
      // `dive.time` seconds. The bunching is the telegraph: it is the same two numbers
      // the drawing counts down, and the `sound` is one rising buzz per pack, not one
      // per body.
      flock: {
        keep: 92, pull: 1.8, align: 0.45, turn: 5.2, loiter: 0.3,
        sway: { rate: 3.4, amount: 0.55 },
        gather: 3.4, brace: 0.7, braceKeep: 0.34, braceSpeed: 0.4,
        dive: { time: 0.5, mul: 2.4 },
        sound: { freq: 380, dur: 0.3, wave: 'sawtooth', vol: 0.03, slide: 620 },
      },
      // A small body makes a small mess, and its death beep is quiet on purpose:
      // twenty of them can go off in the same frame, and the mix has no voice limiting
      // yet (milestone 7).
      death: { particles: 6, speed: 210, debris: 1, debrisSpeed: 150 },
      sound: { freq: 660, dur: 0.06, vol: 0.045 },
    },
    // PLAN 3.3's last body (10:30): "stationary, long telegraphed laser across the
    // whole arena". It is the only body in the game that never moves, and that is
    // the whole of the kind: everything else about it follows from standing still.
    //
    // Because it cannot walk, it cannot be kited, cannot be run off, and cannot be
    // ignored: a run that leaves it alive is played inside a line of light that gets
    // drawn across the arena every few seconds. Because it cannot follow, the line
    // is always one the ship was shown and had time to step off - which is the one
    // thing a body that reaches the whole arena may be allowed to be.
    sniper: {
      radius: 16, speed: 0, hull: 12, score: 90, drop: 6,
      from: 630, cost: 8, weight: 1,
      // `sides` is the fallback shape; the eye is drawn by its own silhouette
      // (render/entities.js), because the only thing a stationary body has to be
      // recognised by is its shape.
      color: PALETTE.sniper, fill: PALETTE.sniperFill, sides: 6, glow: 24,
      // Bolted to the floor: the crowd walks round it instead of shoving it along
      // (game/enemies.js), and a bullet's kick does not budge it. This is what makes
      // the line it drew an hour ago still be the line it fires down.
      rooted: true,
      // Where one lands. A body that cannot walk has to arrive where the player can
      // see it and shoot back at it, so it does not arrive off the edge of the glass
      // like everything else: it lands inside the window, at a distance, announced
      // (see `lock.land`). The rule PLAN section 3 is protecting - nothing appears in
      // your face - is kept by `min` instead of by the edge of the screen.
      arrival: 'inSight',
      inSight: { inset: 54, min: 250 },
      // The lock, in three beats (game/beams.js, game/kinds.js).
      //
      // `wake` is how long after landing it takes its first aim, `wait` how long
      // between one beam and the next lock, and `turn` how fast it can bring its eye
      // about while it waits, rad/s - slow enough that a ship which notices it can
      // walk out from under the nose before the lock begins.
      //
      // `aim` is the telegraph and it is long on purpose (PLAN asks for a long one;
      // a darter gets 0.62 s): during it the eye is locked and *cannot* change its
      // mind, so the band drawn on the glass is exactly the band that will hurt,
      // edge for edge, which is the promise every telegraph in this game makes.
      //
      // `beam.halfWidth` is that promise as a number: a centre - the ship's or a
      // body's - within it of the axis is hurt, and the band the renderer paints is
      // drawn at exactly twice it. `time` is how long the light hangs there after
      // the damage was paid, which is why it is short: the damage is instantaneous
      // and the light is its record (see game/beams.js), so nothing is hurt by a
      // beam that has already fired.
      lock: {
        wake: 2.4, wait: 2.6, turn: 0.8,
        aim: {
          time: 1.25,
          sound: { freq: 320, dur: 0.7, wave: 'sawtooth', vol: 0.028, slide: 1500 },
        },
        beam: {
          halfWidth: 20, time: 0.3, damage: 6, shove: 260,
          shake: 7, hitStop: 0.04,
          flare: { count: 26, speed: 460, life: 0.3 },
          cut: { count: 4, speed: 240, life: 0.24, spread: 0.5 },
          sound: { freq: 1700, dur: 0.3, wave: 'square', vol: 0.1, slide: 90 },
        },
        // What it looks like when one lands inside your window.
        land: {
          ring: { radius: 10, speed: 320, life: 0.34 },
          burst: { count: 18, speed: 260, life: 0.4 },
          sound: { freq: 120, dur: 0.34, wave: 'triangle', vol: 0.07, slide: 62 },
        },
      },
      death: { particles: 24, speed: 300, debris: 10, debrisSpeed: 210, shake: 5 },
      sound: { freq: 150, dur: 0.22 },
    },
  },

  death: {
    particleLife: 0.7,
    // A wreck throws sparks *and* chunks of itself. The chunks are the part that
    // says how big the thing was, so each kind says how many it leaves.
    debrisLife: 0.9,
    ringLife: 0.4,
    ringSpeed: 260,
    ringScale: 0.6,
    labelOffset: 4,      // the score text floats this far above the wreck
    sound: { wave: 'sawtooth', vol: 0.11, slide: 60 },
  },

  enemies: {
    hpScaleWindow: 95, hpScaleMax: 1.6,
    speedScaleWindow: 190, speedScaleMax: 0.5,
    separationDrag: 0.02,   // leftover impulse decays to this fraction per second
    separationEpsilon: 0.0001,   // closer than this, and the push is meaningless
    separationPush: 0.5,    // each of a touching pair gives way this much
    spinRange: 1.2,         // how fast a kind's art turns by itself
    hitFlash: 0.09,
    hitFlashShove: 0.12,
  },

  // The wave director (game/waves.js). One budget decides how much of a crowd the
  // run may hold; a wave is what it buys with the room left in it.
  //
  //   crowdBase / crowdPerMinute / crowdMax
  //              points of enemy the arena will hold at this moment of the run.
  //              A body costs its kind's `cost` and the crowd averages about 4.5
  //              points a body, so these three are ~4 bodies to begin with, ~19
  //              after a minute, ~45 after three, and ~90 from about 6:00 on. That
  //              curve is the difficulty, and it runs the opposite way to intuition:
  //              a bigger budget means the bot dies *sooner*. Measure it over 128
  //              seeds before you touch it (session 18 of NOTES.md has the numbers
  //              this was set against: 2m12s of bot survival, 18.7 bodies on screen
  //              at 1:00).
  //   waveMinPoints  the least worth spending, so a dribble of room is not a wave.
  //              It is deliberately at least as big as the dearest kind's `cost`: a
  //              wave that could not afford a tank would never bring one, and the
  //              mix would quietly turn into cheap things as a run went on. There is
  //              a test that says so.
  //   waveMaxPoints  the most one wave may spend, so a big gap in pressure arrives
  //              as three waves and not as one screenful
  //   maxMembers     however cheap they are, one wave is not more bodies than this -
  //              counted in *members*, and one pack (kinds.swarmling.pack) is one
  //              member however many bodies it turns into
  //   maxBodies      the hard ceiling, whatever the budget says: this many bodies is
  //              what the frame budget was measured against, not a difficulty knob.
  //              A pack is cut down to whatever room is left under it, and not sent at
  //              all if that is fewer than its `min`.
  //   gap [s]        the beat between one wave and the next, so a wave stays a thing
  //              you can see arrive
  //   retry [s]      how soon to look again when there was nothing worth spending
  //   fan [rad]      how wide a wave's members spread around its bearing
  //   fanRetry [rad] and how much further it fans out when the arena was not there
  //
  // The last three are where an arrival is allowed to land at all: this far beyond
  // the edge of the screen, never this close to the ship, and this many tries before
  // the director gives up on one member and lets the next step look again.
  waves: {
    crowdBase: 18,
    crowdPerMinute: 64,
    crowdMax: 400,
    waveMinPoints: 12,
    waveMaxPoints: 30,
    maxMembers: 8,
    maxBodies: 100,
    gap: [0.9, 1.4],
    retry: 0.5,
    fan: 0.9,
    fanRetry: 0.45,
    margin: 34,
    minDistance: 260,
    attempts: 8,
  },

  // The elite variant of any kind (PLAN 3.3). An elite is not a kind: it is a flag on
  // whichever body the wave director rolled, so every enemy in the game can arrive
  // gold and a kind added later is elite for free.
  //
  //   from     seconds of run before one may arrive at all - PLAN's 8:00
  //   chance   that a wave carries one. Per wave and at most one per wave, so an elite
  //            reads as a wave with a leader rather than as a field of gold. Because
  //            the leader is bought before its escort (game/waves.js) this is also the
  //            rate that arrives, whatever the wave turns out to be worth: measured at
  //            3 gold bodies in the 42 s one of the report's runs spent past 8:00 - a
  //            gold body every quarter minute of the late game. The number is low on
  //            purpose: an elite takes `costMul` of the crowd budget as well as being
  //            four times as tough, and a crowd made mostly of them would not fit on
  //            the screen. What the bot does not measure is a player *hunting* one;
  //            `scoreMul` and a large shard are there to make that worth doing.
  //   hullMul / speedMul   PLAN's numbers, and the whole of what an elite *is*
  //   costMul  what one takes out of the spawn budget - which is also what an arrow
  //            at the window edge is worth (render/indicators.js). It sits under
  //            hullMul deliberately: at 4 the dearest kind would cost 32, more than
  //            one wave is allowed to spend (waves.waveMaxPoints), and a gold tank
  //            would never arrive at all. A wave rolls its leader's kind out of the
  //            room divided by this number, so `waves.waveMinPoints` has to stay
  //            worth at least one gold body of the cheapest kind - test/elite asserts
  //            that lockstep, and the wave would arrive without a leader if it broke.
  //   scoreMul / dropMul   what killing one pays. Above hullMul for the score: an
  //            elite is an event and should be worth hunting.
  //   heal     the chance it gives the ship back a hull, and how many. Only rolled
  //            when the ship is actually hurt - an elite never wastes its gift.
  elite: {
    from: 480,
    chance: 0.2,
    hullMul: 4,
    speedMul: 1.15,
    costMul: 3,
    scoreMul: 5,
    dropMul: 2,
    heal: { chance: 0.34, hull: 1 },
  },

  shards: {
    life: 12,
    drop: { speedMin: 40, speedMax: 150, jitter: 6, spinMax: 4 },
    magnetRadius: 145,      // further than PLAN 3.1's 70 on purpose: see NOTES
    pullNear: 900,
    pullFar: 120,
    collectRadius: 25,      // a shard this close to the ship's centre is yours
    drag: 0.25,             // fraction of speed left after one second
    // What one shard is worth towards the next level, in the same units the curve below
    // is written in. Measured with it: a five-minute run collects about two hundred and
    // fifty of them, and the fifteen ranks the three lines have to give cost about two
    // hundred and thirty shards' worth - so the choice keeps coming until roughly the
    // end of a run like that one, and then stops, which is the honest thing to do with
    // three lines.
    xp: 14,
    score: 2,
    pickupSpark: { count: 5, speed: 120, life: 0.3 },
    // A large shard: PLAN 3.3's elite drop. Worth `worth` of the ordinary ones, and
    // drawn bigger and with a ring for it (render/entities.js). `worth` is the only
    // difference between the two, which is what keeps one shard, not two systems.
    big: {
      worth: 6,
      spark: { count: 26, speed: 260, life: 0.45 },
      ring: { radius: 7, speed: 320, life: 0.35 },
    },
    sound: { base: 1050, jitter: 270, dur: 0.05, wave: 'sine', vol: 0.05, slide: 1900 },
  },

  // Levels, and what one is worth (PLAN 3.6). A level is no longer a number: it is
  // the pause where the run is built (game/upgrades.js), so this curve *is* the pace
  // at which the player's power arrives.
  //
  // The shape is PLAN's - `base + level * linear + level^2 * quad` - and so are the
  // linear and quadratic terms. The base is not: PLAN wrote 8 before a level meant a
  // card, and a quadratic curve spends its first levels absurdly cheaply (the first
  // card costs a two-hundredth of the fifteenth), so at 8 the whole first minute of a
  // run is a slot machine. The base is what makes the first card land about a quarter
  // minute in, and what makes the fifteenth land about where a median run ends - the
  // three lines have fifteen ranks between them, and a card the run never gets to
  // spend is a card the run never needed. All measured (NOTES, session 27).
  progression: {
    base: 90,
    linear: 6,
    quad: 0.9,
    labelOffset: 16,      // the level text floats this far above the ship
  },

  // The upgrade lines (game/upgrades.js). `step` is what one rank is worth, and the
  // card text prints it rather than paraphrasing it, so a card can never lie about its
  // number. For a line that sells a share of something (damage, fire rate, shot speed)
  // `step` is that share and the line is worth `1 + step * rank`. For a line that hands
  // out whole things - `unit: 'each'`, which is what the behaviour lines are - `step` is
  // how many whole things one rank adds, and there is no multiplier to ask it for.
  //
  // Five ranks each (PLAN 3.5 starts here), and every one of them is firepower: the
  // point of the build is that the run's shots get heavier, faster and more numerous,
  // not that the ship gets tougher (PLAN section 7's hard rule).
  upgrades: {
    damage: { ranks: 5, step: 0.3 },
    fireRate: { ranks: 5, step: 0.22 },
    bulletSpeed: { ranks: 5, step: 0.22 },
    split: {
      ranks: 5,
      step: 1,          // one extra projectile per rank (PLAN 3.5)
      // The extras are laid out around the gun's own shot and each carries `share` of
      // its weight, so a rank never takes anything away: the shot you aimed stays the
      // heaviest thing in the fan. What you pay is that a fan which has spread too
      // wide to touch one enemy is a fan that hit nothing, so the line wants you close.
      share: 0.35,
      fan: 0.087,       // radians between two neighbours of the fan (5 degrees)
    },
    pierce: {
      ranks: 5,
      step: 1,          // one more body a shot may go through, per rank (PLAN 3.5)
      // What the next body takes of the weight the last one took, so a shot spends
      // itself as it ploughs: body one is a whole shot, body two is 80% of one, and so on
      // down. That is the price of the line - a rank is worth nothing at all to a run that
      // is fighting one thing at a time - and what it buys is the body standing behind the
      // one you aimed at. A full stack of six bodies lands about 3.7 shots worth, which
      // is the same family of trade split shot makes (session 28) for a rarer geometry:
      // split wants a crowd wide, pierce wants one column deep.
      //
      // The number is PLAN's own convention for damage that passes on to a second target
      // - the arc weapon loses 20% per jump (3.2) - and it is high enough that the fifth
      // rank of the line still adds a third of a shot to a busy pull rather than a shred
      // of one.
      share: 0.8,
      // The sparks out of the far side of a body a shot has just gone through. It is
      // the only tell a passing shot has, so it is a slightly bigger burst than an
      // impact that stopped the shot.
      pass: { count: 5, speed: 190, life: 0.26, spread: 0.55 },
    },
    ricochet: {
      ranks: 5,
      step: 1,          // one more body a spent shot may be turned onto, per rank (PLAN 3.5)
      // A shot with a bounce left does not die on the body it hit when there is nothing
      // ahead of it to go through: it turns onto the nearest body it has not already been
      // through, within `reach`, and goes again at the same speed carrying `share` of the
      // weight it had. So the line buys coverage the player did not aim at, paid for in
      // weight - and see `ahead` below for when a turn wins over a pierce pass.
      //
      // Measured on a knot of bodies that cannot die, three seconds of trigger, average of
      // six seeds - a plain pull is 1.00x, and the firepower lines are damage 2.50x, split
      // 2.57x, pierce 3.33x, ricochet at this number 2.50x. That ladder is the whole
      // decision: `share` sits under pierce's 0.8 because a pierce pass needs a column
      // standing exactly where you aimed and a bounce needs one body anywhere nearby, so at
      // the same number this would be the easy version of that card and the two would stop
      // being a choice. At 0.8 it measured 3.44x - over pierce, for less geometry - and at
      // 0.5 it measured 1.88x, less than the plain damage card, which would make this a
      // trap. 0.65 buys a full chain worth 2.64 shots: the cheapest of the three lines that
      // buy a second body, and the second body still takes two thirds of a shot rather than
      // a chip of one.
      share: 0.65,
      // How far a shot looks for its next body, in px. It wants to be what a knot of
      // arrivals is: further than a body, far short of the window, so a bounce reads as
      // a glance into the crowd the shot was already in rather than as a missile that
      // found something across the arena. It is also the radius of the grid query a
      // bounce costs, which is why it is not enormous.
      reach: 220,
      // The cosine of the half-angle in which a body counts as being *ahead* of a shot:
      // 0.5 is 60 degrees either side. Only a shot that bought both lines is asked, and
      // only to decide whether going straight is worth a pass: inside the cone there is
      // something to go through, outside it everything is beside the shot and a pass into
      // empty sky is a pass - and a turn - thrown away. Measured over a maxed fifteen-minute
      // run, this is how often a hit ends in a turn: at 0.2, 9%; at 0.35, 11%; here, 13%;
      // at 0.6, 16%. Kills do not move between them (the arrival rate is the ceiling, not
      // the gun - NOTES session 29), so this number is about how often the player sees a
      // shot kink, and 60 degrees is the honest angle at which a line still reaches.
      ahead: 0.5,
      // The sparks thrown as a shot turns, along the new heading. It is the only tell a
      // bounce has, so it is aimed: your eye can follow where the shot went.
      turn: { count: 4, speed: 170, life: 0.22, spread: 0.5 },
      // One short tick per turn. Quiet, because a busy pull can turn half a dozen times
      // and the mix has no voice limiting yet (milestone 7).
      sound: { freq: 920, dur: 0.035, wave: 'triangle', vol: 0.015, slide: 380 },
    },
    orbitals: {
      ranks: 5,
      step: 2,          // a pair of drones per rank; PLAN 3.2's "two drones" is rank 1
      // The ring (game/orbitals.js). Every drone stands `radius` px out from the ship's
      // middle on one circle, `count` of them evenly spaced, and the whole circle turns
      // at `spin` rad/s - so a drone's place is derived from the ship's, which is what
      // makes it an orbit and not a swarm with opinions. It is drawn as a track for the
      // same reason (render/entities.js): the ring's edge is the line a body has to
      // cross to reach you, and the player has to be able to see it.
      //
      // `radius` is the number that decides what this line is. At 64 a body walking in
      // is chewed on for the last stretch of its approach and a body that has made it
      // past the ring - pressed up against the hull - is out of reach of it, which is
      // the whole argument for a ring instead of an aura: it is a wall at a known
      // distance, not a bubble that forgives you for standing in it.
      radius: 64,
      // rad/s. A drone comes round every two seconds at this number, which is about how
      // long a body takes to walk from the ring to the ship, so a walking body meets
      // each drone about once on its way in.
      spin: 3.2,
      // How close a drone's middle has to come to a body's middle to bite it, on top of
      // the body's own radius. It is a touch test and not a projectile: a drone has no
      // speed of its own to give, so the reach is the drone's size and nothing more.
      touch: 9,
      // What a bite is worth, and how long a drone then waits before it may bite again,
      // whoever it is touching. The beat is per drone and not per body, which is
      // what keeps a drone in a knot of bodies worth exactly what a drone on the edge of
      // one is: it grinds at its own tempo instead of once per neighbour per step.
      //
      // `weight` is a bite's weight as a multiple of one shot of the gun, and the damage
      // line multiplies it exactly as it multiplies a shot - a drone hits as hard as you
      // do, which is what keeps this line worth taking as the run grows. It has to be that
      // way: measured over 40 seeds with the line in the pool and out of it, a flat bite
      // made the bot *less* able to survive (at the cap 27 of 40 against 36, mean kills
      // 4653 against 5964), because every rank of the ring is a rank not spent on a line
      // that multiplies the gun, and a flat rate loses that race as soon as the gun is
      // twice what it was. `weight: 1` at `beat: 1.5` with a pair per rank puts the line
      // on the ladder: one rank of the ring is worth one rank of the damage line at the
      // plain gun (1.33 shots a second against 1.32) and it keeps its share as the gun
      // gets heavier. test/orbitals.test.mjs asserts both halves of that; whoever retunes
      // either number has to retune both.
      weight: 1,
      beat: 1.5,
      // A bitten body is thrown away from the ship at this, so the ring is felt as a
      // shove as well as a loss of hull. Small, and it decays at once (see
      // `enemies.separationDrag`): the ring is meant to keep its distance, not to build
      // a wall of bodies outside itself.
      shove: 120,
      // Sparks off the bite, thrown along the line from the ship through the drone,
      // which is outwards: the bite reads as a thing being pushed as well as hit.
      bite: { count: 4, speed: 160, life: 0.18, spread: 0.6 },
      // Very quiet, and it has to be: ten drones at this beat is six and a half ticks a
      // second at the top of the line, and the mix has no voice limiting yet (milestone 7).
      sound: { freq: 700, dur: 0.03, wave: 'square', vol: 0.014, slide: 420 },
    },
    nova: {
      ranks: 5,
      step: 1,          // one more front per cycle, per rank
      // The nova (PLAN 3.2, game/nova.js): a ring of damage that leaves the ship and
      // travels outwards, hurting every body it comes over on the way.
      //
      // `step` sells fronts per *cycle*, not per second, and `cycle` is PLAN's own eight
      // seconds. So rank 1 is exactly what PLAN wrote - one ring every eight seconds -
      // and rank 5 is one every 1.6 s, which is the same line read as "the wait gets
      // shorter". Selling the count rather than the wait is what keeps the card honest
      // (`+1 nova ring`) and keeps the ladder linear in the rank, which is how orbitals
      // is built too: rank 5 of either line is five times rank 1.
      //
      // The eight seconds are also why this is a *panic* line rather than a rate line.
      // A single rank is nearly nothing while the ship is clear of bodies and a great
      // deal while it is surrounded, because a front hurts everything inside it at once.
      // That is the geometry the card is selling - see `weight` below for what that costs.
      cycle: 8,
      // How far the front travels before it is gone, and so how big a crowd one ring can
      // take in. Four times the orbital ring's radius, which is the difference between a
      // wall at the hull and a clear-out of the whole near field - and how far is also how
      // many: two and a third bodies on average, measured, and the further out this goes
      // the more the card is a nuke rather than a shrug.
      reach: 220,
      // px/s. Reaches the rim in a quarter of a second, which is fast enough to read as
      // one event and slow enough to see cross the crowd - and it is far faster than
      // anything in the arena can run outwards, which is what makes "a body is crossed
      // once" true without the sim having to remember anything (game/nova.js).
      speed: 900,
      // What a front costs each body it comes over, as a multiple of one shot of the
      // ship's own gun, so the damage line multiplies it exactly as it multiplies a shot.
      // Read when the front is thrown, so a card taken while one is in the air does not
      // rewrite it.
      //
      // It is a multiple rather than a number for the reason session 31 learned the hard
      // way with the orbital ring: this is a line that *adds* a second source of damage
      // instead of multiplying the gun, and a flat number loses to a multiply as soon as
      // the gun is twice what it was.
      //
      // And four and a half rather than the one a player would guess, because of where the
      // crowd actually is. A rank has to be worth what a rank of the damage line is (PLAN
      // section 8), which is `fireRate x damage x step` = one and a third hull a second on
      // a plain gun; a rank of the nova throws one front every `cycle` seconds, so a front
      // has to come off with ten hull to spend. That is the whole sum: ten, divided by the
      // number of bodies a front really crosses, which is two and a third - counted over
      // twelve full bot runs, standing in the reach of the ship as it actually is, fleeing.
      // A knot is the wrong instrument for a wide ring: the ladder's crowd stands thirty
      // deep inside the reach (20.7x a plain gun, which would be a bomb and not a card),
      // and the near-field knot - three bodies at the distances a press really keeps - is
      // the one that agrees with the sum, at 2.97x, in the family with every other line.
      //
      // Four and a half and not five, because that is where the run stopped minding it: over
      // forty seeds with the card dealt and taken at face value, the ship survived the
      // fifteen-minute window as often without the line as with it (37 of 40 both ways) and
      // scored the same - which is what "worth a rank of the gun" looks like in a run, and
      // is NOTES session 32's A/B. Priced off the dense knot it would have been a fifth of
      // this and a card nobody should ever take.
      weight: 4.5,
      // A crossed body is thrown away from the ship at this, which is most of what the
      // line is *for*: it is the shrug that clears the pocket the orbital ring then
      // grinds. Larger than the ring's shove and smaller than a bomber's, because this
      // one happens to a whole crowd at once and once only.
      shove: 240,
      // The light of the front itself is painted by the renderer out of these; the ring
      // the player sees is the ring the sim has already hurt with, to the pixel.
      birth: { count: 18, speed: 300, life: 0.35 },
      bite: { count: 3, speed: 150, life: 0.2, spread: 0.8 },
      // One low thud per front, and not one per body: at the top of the line a front can
      // cross forty bodies in a step and the mix has no voice limiting yet (milestone 7).
      sound: { freq: 150, dur: 0.28, wave: 'triangle', vol: 0.1, slide: 48 },
      shake: 4,
    },
    burn: {
      ranks: 5,
      // The first `rate` line (game/upgrades.js): its rank 0 means no fire at all, and every
      // rank after it adds this much of one shot of the ship's gun, per second of burning.
      // So a burning body loses `step x rank` shots' worth of hull every second, in shots of
      // `bullets.damage` like every other thing that adds damage instead of multiplying the
      // gun (session 31's lesson: a flat rate loses the race to a multiply as soon as the gun
      // is twice what it was).
      //
      // Priced twice over, and the two agree, which is why it stayed at this number.
      // `node tools/power-ladder.js --line burn`: 1.46x on all three knots at five ranks,
      // so one rank is worth 0.30 ranks of the damage line - level with a rank of the orbital
      // ring (0.32) and worth more than a rank of the split (0.21), which is where an added
      // source belongs. And in a real run, where the fire is in a crowd rather than on a
      // single body the knot can show: an aware bot forced to five ranks of burn took 27-29%
      // of a fifteen-minute run's whole damage from the fire, over a mean of eight bodies
      // alight at a time and a peak of thirty-four, with something burning in 99% of its
      // frames (three seeds at the 900 s cap). A rank of the damage line there is worth about
      // four times that share, so the ladder and the run say the same thing to within a fifth.
      step: 0.4,
      // How long a body stays alight after the last hit that lit it, in seconds. A hit that
      // lands starts the clock again, so a body under fire is alight while it is being fired
      // at and for `time` seconds afterwards - and that tail is the whole card: the damage
      // the fire does after you have turned to the next body is damage you did not have to
      // fire. It is also why the line is a `rate` and not a duration: a duration would be
      // refreshed into nothing by the trigger and buy nothing after the first rank.
      time: 3,
      // s between two bites of the fire. The loss is paid out in chunks rather than spread
      // thin over every step, which is what lets a body flash when the fire takes hold and
      // lets a run see how badly it is burning; six bites a body, at these two numbers, and
      // a floor of `step x rank / 6` shots each.
      bite: 0.5,
      // PLAN 3.5's second half: "burning enemies spread it on death at rank 3". A body that
      // comes apart while alight passes the fire to every body within `radius`, for `share`
      // of the time the corpse had left - so a chain runs down and dies out instead of
      // setting the whole arena alight, and the first two ranks are about biting harder
      // while the third is what turns a crowd into a bonfire.
      //
      // The shot that kills a body is what lit it, which is the other half of how this reads:
      // a body that dies to a hit is alight when it dies, and so hands the fire to its
      // neighbours from this rank (game/burn.js). What it hands is `share` of a whole burn
      // and not a whole burn - a killing hit cannot light three seconds of fire in a body
      // that is already coming apart, and if it could then every kill in a late run would
      // torch everything near it and the crowd would burn forever off the rate the gun kills
      // at. That share is the only decay a chain has, and it is what makes each hop shorter
      // than the last.
      spread: {
        at: 3,
        radius: 96,
        share: 0.55,
        // The light of a jump: a ring born exactly at the reach of the jump and creeping a
        // little past it - so the light never claims less fire than was passed, which is the
        // one thing a ring that follows damage may still do.
        ring: { speed: 130, life: 0.32 },
        burst: { count: 10, speed: 190, life: 0.4 },
      },
      // What a body that has just caught fire throws, and how quietly it says so: the fire is
      // lit on every new body, which is a few times a second in a crowd, so the light is
      // small and the sound is nearly nothing.
      ignite: { count: 5, speed: 70, life: 0.34, spread: 1.1 },
      // Embers off a bite, sprayed upwards: fire goes up in this game whatever else it does.
      ember: { count: 2, speed: 60, life: 0.45, spread: 0.5 },
      // The bite is silent on purpose - a crowd on fire would be a buzz and the mix has no
      // voice limiting yet (milestone 7) - but the catching hold is not, because that is the
      // moment the card is doing something and it has to be heard as well as seen.
      sound: { freq: 300, dur: 0.09, wave: 'triangle', vol: 0.02, slide: 260 },
    },

    // Chill (game/chill.js): PLAN 3.5's other temperature card, and the only line in the
    // game that takes something away instead of adding damage. A hit buys frost, the frost
    // is the slow, and the fifth rank is what a body that has stopped is worth.
    chill: {
      ranks: 5,
      // The second `rate` line (game/upgrades.js): rank 0 means *nothing is cold*, and every
      // rank after it is worth this much of a body's own walk per hit. PLAN's number is
      // exactly this one - "hits slow by 8% per rank" - read off the first hit, with every
      // hit after it worth the same until there is no walk left to take (so a body is frozen
      // solid after 0.9/step/hits - twelve of them at rank 1, three at rank 5, and one of
      // them for anything the killing shot reaches).
      step: 0.08,
      // s for a whole frost to warm through with nobody hitting it. A hit puts the clock back,
      // so this is not how long a body under fire stays cold - it is how long one you have
      // turned away from stays cold, and it is what makes the line something you keep up with
      // aim rather than a tax the crowd pays once. Set against the crowd's own walk: at this
      // number a frozen drifter thaws and comes back for you about the time it takes to cross
      // the window.
      melt: 3.2,
      // What a chilled hit throws: three motes and no sound. The line lands on every hit the
      // run ever makes, so the light of it has to be nearly nothing or the arena is a snowstorm.
      dust: { count: 3, speed: 60, life: 0.3 },
      // The body going solid - the one moment the line is loud without being asked, and the
      // only tell a player gets that a shatter is now possible.
      freeze: {
        ring: { radius: 10, speed: 300, life: 0.3 },
        burst: { count: 10, speed: 170, life: 0.4 },
        // Up, not down: a body locking up is the good kind of ending, and a falling note is
        // what everything else in the mix that ends sounds like.
        sound: { freq: 520, dur: 0.14, wave: 'triangle', vol: 0.03, slide: 1400 },
      },
      // Letting go of a whole frost, quietly: the same motes as a hit, slower and longer, and
      // no sound because a thaw is the absence of the card rather than the card.
      thaw: { count: 4, speed: 40, life: 0.5 },
      // PLAN's second half: "frozen enemies shatter for area damage at rank 5".
      shatter: {
        // The last rank of a five-rank line in a deck of eleven, which is later than it sounds:
        // the bot's even spread never got one line past four ranks in twenty measured runs, so
        // this is a payoff a player has to decide to build towards, and the fifth rank of
        // CHILL is the reason to decide that.
        at: 5,
        // px. The same reach as a fire's jump on purpose: the two rank-5 cards are the same
        // shape of payoff - a death that reaches the bodies standing next to it - and a body
        // is only frozen where it was being shot at, which is where a fire is too.
        radius: 96,
        // What a body caught in a shatter loses, in shots of the ship's own gun (the same
        // pricing as a drone bite, a nova front and a fire's bite - game/chill.js), times how
        // cold the corpse was.
        //
        // Priced against what it is worth in a run and not against a nova front's number, which
        // would have been the lazy read of it: a shatter goes off on nearly every kill (1410 of
        // them in a five minute run at five ranks) where a nova front lands once every couple
        // of seconds. Measured the way burn was - `tally.kinds[*].damage` over twelve 900 s
        // aware runs with the fifth rank able to shatter and unable to - this weight is 16.9%
        // of a run's whole damage against 0% with the shatter off, i.e. the fifth rank is worth
        // about a nova front's share (18%, session 31) earned in many small goings-apart
        // instead of a few big ones. At 2.2 it was 5.5%, which a score did not even notice.
        weight: 4,
        // What the ice passes on, as a share of a whole frost. A share cannot freeze anybody
        // on its own, which is the decay that stops a shatter chain from walking a whole
        // arena the way a burn's does: each hop needs a body that was already half cold.
        share: 0.5,
        // The light of one. The ring is born small and runs out past the reach it hurt - the
        // one thing a light that follows damage may do (game/burn.js draws its jump the same
        // way) - and it runs out *by the frost*, because a body that died of one cold shot must
        // not claim as much room as one kept under fire. The chips and the glass are held back
        // for a body that actually wore the shell: at the fifth rank nearly every kill in a late
        // run is a cold one, and a shriek of breaking ice on each would be a hiss.
        light: { ring: { radius: 14, speed: 620, life: 0.3 }, chips: { count: 12, speed: 260, life: 0.5 } },
        // Glass, falling.
        sound: { freq: 1700, dur: 0.1, wave: 'square', vol: 0.028, slide: 300 },
      },
    },

    // Leech (game/leech.js): PLAN 3.5's "every 60 kills heals 1 hull (fewer kills per
    // rank)", and the first thing in the whole game that gives a hull *back*. Everything
    // else in the deck makes the ship hurt things more; this one is the thing the ship
    // gets out of hurting them.
    leech: {
      ranks: 5,
      // A line of whole things (`each`), and the whole things are kills taken off the price
      // of a hull: `countOf` is the cut and the price is `base - cut`, so the first rank is
      // PLAN's sixty kills and the fifth is thirty-six. Rank 0 is not a price of `base` - it
      // is no leech at all, which is why game/leech.js asks the rank before it ever counts.
      //
      // The cut is flat rather than a share because a share makes the last ranks absurd: at
      // `base / rank` the fifth rank costs twelve kills, and a run that is fifteen minutes
      // deep brings down eight bodies a second, so a hull would come back every one and a
      // half seconds - which is less an upgrade than a different game. Flat, the wait goes
      // 60 - 54 - 48 - 42 - 36, and what a rank buys is a *quicker* recovery rather than a
      // guarantee of one. What the wait really is in seconds depends entirely on how fast a
      // run is killing, which is the honest thing about the card: it pays the player who is
      // killing things, and it pays a run that is being pushed around more than one that is
      // not, because a run that is not being pushed around has no hull to be given back.
      step: 6,
      base: 66,
      // The one charge the leech may hold. A charge that comes due while the ship is whole is
      // not thrown away and is not stacked: it is held, and spent on the next hull the arena
      // takes off you (game/leech.js). One, because two would be a hull the run is carrying
      // rather than a hull the run has earned, and the HUD has one meter to say it with.
      held: 1,
    },

    // Overcharge (game/overcharge.js): PLAN 3.5's "standing still for 1 s doubles the next
    // shot", and the only line in the deck whose price is paid in place rather than in levels.
    // Everything else in the game pays for damage with a card or with the risk of being where
    // the crowd is; this one is paid for by not moving while the crowd comes.
    overcharge: {
      ranks: 5,
      // A line of shares (`percent`, game/upgrades.js), and the share is of a whole *pull* of
      // the trigger: a charged pull is worth `1 + step x rank` of a plain one, so the first
      // rank is exactly PLAN's doubling and the fifth is six times the weight in one pull.
      //
      // The rank buys weight and not speed, which is the one decision on this line worth
      // arguing about. Selling it the other way - a shorter wait per rank, always for a double
      // - is the card that stops being a decision: at the fifth rank a ship standing still
      // would be loaded every 0.2 s, which at four pulls a second is every shot doubled and a
      // permanent, costless multiplier. Selling it as weight keeps the one second the card
      // asks for and makes the question "how much are you willing to bet on a single pull",
      // which is the same shape as the nova line (rank buys another front, not a shorter cycle
      // - BALANCE.upgrades.nova).
      //
      // Measured twice, and the two measurements disagree on purpose, which is the thing to
      // understand before retuning this number. `node tools/power-ladder.js --line overcharge`
      // is a ship that never moves and holds the trigger for twelve seconds: 1.96x the plain gun
      // at five ranks, on all three knots, so the whole line is worth between burn's 1.46x
      // (session 38 - an added source that costs nothing to use) and the damage line's own 2.5x
      // (a multiply on everything), and the difference between them is the standing. In a real
      // run, where the wait has to be earned between two threats, an aware bot handed five ranks
      // spends 6.3 loaded pulls a minute and has the gun loaded in 2.7% of its frames - worth
      // about a tenth of a rank of the damage line (four seeds at the 900 s cap). Both numbers
      // are honest and the gap between them is the card: it is a playstyle and not a rate, worth
      // most of a damage rank to a player who plants and fires and close to nothing to one who
      // never stops running - and both of the bots in tools/headless run. What kept this at
      // PLAN's own doubling is the deck A/B: ten seeds at the 900 s cap, score median 113,299
      // with the line in the deal, 113,634 with it out, 113,951 with five ranks handed for free -
      // level with the deck, a shade better for free, which is the same shape leech came out with
      // (session 40) and the reason the bot is not handicapped out of taking it.
      step: 1,
      // s of standing still one charge costs. PLAN's number, unchanged, and the whole card: it
      // is long enough that a ship cannot twitch its way through a fight and keep it, and short
      // enough that one deliberate stop in a fight pays.
      hold: 1,
      // Shares of a charge lost per second of moving. A full charge is gone in `hold / bleed`
      // = half a second of running, which is the difference between a card and a trap: a ship
      // that dodges and comes back keeps most of what it had loaded, and a ship that leaves
      // loses it. Wiping the charge the instant a key is pressed would be the trap, and it
      // would also make the tell a flicker instead of a bar.
      bleed: 2,
      // px/s. What "standing still" means to the sim, and it is two questions (see
      // game/overcharge.js): whether the ship is *asking* to move, and whether it is moving.
      // This is the second one, and it sits above the hardest kick any gun gives the ship - a
      // scatter's 55 px/s (BALANCE.weapons) - so a ship that is holding no direction and
      // pulling the trigger is standing still, which is what a player believes they are doing.
      // Nothing else in the game can move the ship: the brake owns every other velocity it has
      // and kills a recoil in a few milliseconds.
      still: 60,
      // The moment a charge comes up: one ring around the ship and one note, and the only time
      // the line makes a noise by itself. Quiet, because a ship that stands and fires re-loads
      // once a second all fight long.
      ready: {
        ring: { radius: 10, speed: 260, life: 0.26 },
        sound: { freq: 620, dur: 0.09, wave: 'triangle', vol: 0.03, slide: 620 },
      },
      // The charged pull itself, spent: one shout at the nose, bigger than a muzzle flash and
      // on top of it, so the pull that is worth six of a plain one is heard as one thing.
      spent: {
        ring: { radius: 12, speed: 340, life: 0.22 },
        burst: { count: 6, speed: 190, life: 0.24 },
        sound: { freq: 380, dur: 0.12, wave: 'square', vol: 0.05, slide: 260 },
      },
    },

    // Afterimage (game/afterimage.js): PLAN 3.5's "the dash leaves a decoy that enemies chase
    // for 2 s". The one line in the deck whose whole effect is on *where the crowd is walking*
    // and none of it on damage, hull or the gun, which is why none of the usual instruments can
    // price it and why the numbers below are argued from geometry instead (NOTES session 42).
    afterimage: {
      ranks: 5,
      // A line of whole things (`each`, game/upgrades.js), and the whole things are images left
      // behind by one dash: rank 1 is PLAN's single decoy and rank 5 is five of them, spread
      // evenly down the whole length of the streak the ship just covered.
      //
      // Rank buys *more images* rather than longer-lived or wider-reaching ones, and the reason
      // is the one that makes this card work at all: a body is only fooled by an image it is
      // standing next to (`bait` below, and that is deliberately the near field and not the
      // arena), so one image fools the bodies you left at one point and five fool the bodies
      // along a whole line. Selling the rank as reach or as time would grow one disc, which is
      // the same crowd fooled again; a rank here buys *length*, which is a different crowd every
      // time. It is the nova's rule again - a rank buys another front, not a shorter cycle
      // (BALANCE.upgrades.nova).
      step: 1,
      // s. PLAN's number, unchanged, and the whole of the second half of the sentence: an image
      // is chased for two seconds and then the crowd looks up and finds the ship again. It is
      // not a slow fade and not a hard pop either: the image thins over its last half-second and
      // goes out with a ring closing in on it, so the crowd's reprieve has an end the player can
      // see coming.
      //
      // Two seconds is also shorter than the dash's own cooldown (2.5 s, BALANCE.player.dash),
      // which is not an accident: one dash's images are gone before the next dash is allowed, so
      // the line is one trick per dash and not a permanent haze over the arena.
      life: 2,
      // px. How close a body has to be standing to an image to be taken in by it, measured from
      // the image. This is the number that decides what the card is *for*, and it is the near
      // field on purpose: it means "the bodies that were already on top of you turn aside", and not "the
      // far side of the arena forgets where you are". A wider one is not a better card - a
      // crowd that stops coming at all is a crowd that never forms, and the arena would be
      // empty of danger in the two seconds the trick lasts.
      //
      // Measured, like everything else here, on a bot that dashes (the instrument is NOTES session
      // 42's: an aware bot given `dashEscape`, eight seeds of two minutes, and the share of the
      // bodies standing within 250 px of the ship that are walking at a ghost): 110 px takes 6%
      // of that near crowd off a rank-1 ship and 30% off a rank-5 one, where 72 px - the first
      // number, chosen for tidiness - managed 2% and 13%, which is a card that mostly does
      // nothing, and 150 px managed 18% and 44%, which is a card that ends the fight for you.
      //
      // It is also the number the rank's value depends on, and that is the second half of why it
      // sits here: images are 220/rank px apart, so at 110 the two of the second rank just touch
      // and every rank after it lays the discs out into a line. At 150 they overlap so heavily
      // that the fifth rank buys almost nothing over the first (54% of frames against 66%), which
      // is what `step` above is not allowed to be.
      //
      // And what the deck says, which is the honest half: nothing moves. Ten seeds at the 900 s
      // cap, the line dealt and taken against out of the deck, score medians 111,850 against
      // 112,884 for the plain bot - which cannot dash, so for it the card is a card - and 107,937
      // against 113,741 for the dash-habit one, which does dash and still does not gain: hand that
      // one five free ranks and it mediates 113,657, i.e. the same again. None of it is outside
      // the noise of a batch of ten, and none of it is a surprise. Both bots are runners, and a
      // runner's near field is two or three bodies wide: diverting a third of three is nothing.
      // What this card is for is the knot a player dashes *out of*, which no bot in tools/headless
      // has ever been in, so the claim is made where it can be measured instead - the press in
      // test/afterimage.test.mjs: twenty bodies coming up from behind, one dash away from them,
      // and the nearest of them 1.7x further off with five ranks than without. NOTES session 42 is
      // where the two instruments were compared.
      bait: 110,
      // An image going out: one ring closing in on the place it stood, and a note thin enough to
      // be a hiss. No light when it is *born*, because the image itself is the light and a dash
      // already throws a ring and a spray of its own.
      gone: {
        ring: { radius: 22, speed: -74, life: 0.28 },
        sound: { freq: 1180, dur: 0.07, wave: 'triangle', vol: 0.016, slide: 640 },
      },
    },
  },

  // The level-up choice (game/upgrades.js, render/cards.js).
  cards: {
    offer: 3,      // how many cards are dealt, which is what keys 1, 2, 3 are for
    // PLAN 3.5: offer cards weighted towards what the player already has. A line
    // with three ranks in it is therefore four times as likely to come back round,
    // which is what makes a run commit to a build instead of spreading one rank over
    // everything on offer.
    bias: 1,
  },

  playerHit: {
    // The hit-stop for the ship itself: longer than a big kill's, because this is
    // the one moment in a run the player has to be able to feel.
    hitStop: 0.09,
    sparks: { count: 34, speed: 340, life: 0.8 },
    flashSparks: { count: 12, speed: 200, life: 0.5 },
    ring: { radius: 8, speed: 420, life: 0.5 },
    sound: { freq: 150, dur: 0.3, wave: 'sawtooth', vol: 0.2, slide: 60 },
    shake: 15,
  },

  runStart: {
    spawnDelay: 0.5,        // breathing room before the first enemy arrives
    ring: { radius: 8, speed: 300, life: 0.5 },
    burst: { count: 18, speed: 240, life: 0.5 },
  },

  runOver: {
    restartGuard: 0.35,
    bigBurst: { count: 60, speed: 420, life: 1.1 },
    smallBurst: { count: 30, speed: 260, life: 0.9 },
    debris: { count: 12, speed: 240 },
    ring: { radius: 6, speed: 520, life: 0.75 },
    shake: 24,
    sound: { notes: [520, 392, 262], dur: 0.32, wave: 'sawtooth', vol: 0.16 },
  },

  levelUp: {
    burst: { count: 22, speed: 280, life: 0.7 },
    ring: { radius: 10, speed: 340, life: 0.55 },
    sound: { notes: [660, 880, 1180], dur: 0.14, wave: 'triangle', vol: 0.1 },
  },

  effects: {
    particleCap: 900,
    particleSpeedFloor: 0.25,   // a spray keeps at least this share of the burst speed
    //
    // The three shapes a particle can be (game/effects.js names them). `drag` is
    // the share of its own speed it has left after one second, `lifeFloor` the
    // shortest a spray may make it as a share of the life asked for, `sizeMin` and
    // `sizeMax` are px across, and `spin` the fastest it tumbles in rad/s (0 for
    // the shapes that are drawn square to the eye anyway).
    shapes: {
      // A spark: a hot dot that stops almost at once and shrinks away.
      spark: { drag: 0.045, lifeFloor: 0.25, sizeMin: 1.3, sizeMax: 3.4, spin: 0 },
      // A chip of a wreck. Heavier than a spark, so it coasts further, turns over
      // as it goes, and outlives the sparks it died with.
      debris: { drag: 0.12, lifeFloor: 0.5, sizeMin: 2.2, sizeMax: 6, spin: 11 },
      // A puff off the engines: stops dead, blooms, and cools in a third of a second.
      smoke: { drag: 0.004, lifeFloor: 0.65, sizeMin: 3.5, sizeMax: 7, spin: 0 },
    },
    ringDrag: 0.15,
    textLife: 0.95,
    textRise: 34,
    textCap: 40,
  },

  screen: {
    shakeCap: 30,
    shakeDecay: 34,
  },

  tally: {
    // The run counts what it is made of while it happens (game/tally.js) so that
    // tools/balance-report.js can print honest per-kind tables. Times are counted
    // into fixed histograms rather than collected into a list, so a half-hour run
    // costs exactly what a thirty-second one does, and each histogram is deep enough
    // that a whole run fits inside it: a body can live for minutes and still be
    // killed in a second, so the two want different steps.
    life: { bucket: 1, buckets: 256 },      // arrival -> death, to a little over 4m
    fire: { bucket: 0.25, buckets: 128 },   // being shot -> dead, to 32s
    // How many pulls of the trigger may go by between two hits on one body before the
    // shooting at it counts as having stopped. This is the whole definition of "a run of
    // fire" behind the report's time-to-kill column, and it is written in pulls rather
    // than in seconds so it means the same thing whatever the gun's cycle is: a scatter
    // pull and a pulse pull are different handfuls of shots, and both are one pull.
    volley: 3,
  },

  ambient: {
    // The slow, harmless crowd that drifts behind the title screen.
    kinds: ['drifter', 'weaver', 'tank', 'darter', 'spitter', 'drifter', 'weaver', 'bomber'],
    refillKinds: ['drifter', 'weaver', 'tank', 'darter', 'spitter', 'bomber'],
    target: 8,
    refillChance: 1.2,     // per second
    speedFactor: 0.45,
    spinFactor: 0.6,
    margin: 70,
  },
};
