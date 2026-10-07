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
    fireRate: 4.4,          // shots per second, before levels
    fireRateMax: 15,
    startInvulnerability: 1.2,
    hitInvulnerability: 1.5,
    hitShoveRadius: 92,          // the crowd is pushed out after a hit
    hitShoveImpulse: 340,
    thrustRamp: 6,               // how fast the thruster graphic fades in and out
    recoil: 14,                  // firing pushes the ship back
    spread: 0.045,               // radians of random aim error

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

  bullets: {
    speed: 620,
    life: 1.15,
    damage: 1,
    noseOffset: 6,          // spawn distance in front of the ship
    despawnMargin: 30,      // this far outside the arena, it is gone
    hitRadius: 3.5,         // added to the enemy radius for a hit
    knockback: 0.08,        // bullet velocity transferred into the enemy
    muzzle: { count: 2, speed: 60, life: 0.18 },
    impact: { count: 4, speed: 130, life: 0.24 },
    impactSound: { min: 300, max: 360, dur: 0.03, wave: 'square', vol: 0.02, slide: 200 },
  },

  firing: {
    sound: { base: 720, jitter: 100, dur: 0.05, wave: 'square', vol: 0.045, slide: 300 },
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
  //   maxMembers     however cheap they are, one wave is not more bodies than this
  //   maxBodies      the hard ceiling, whatever the budget says: this many bodies is
  //              what the frame budget was measured against, not a difficulty knob
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

  shards: {
    life: 12,
    drop: { speedMin: 40, speedMax: 150, jitter: 6, spinMax: 4 },
    magnetRadius: 145,      // further than PLAN 3.1's 70 on purpose: see NOTES
    pullNear: 900,
    pullFar: 120,
    collectRadius: 25,      // a shard this close to the ship's centre is yours
    drag: 0.25,             // fraction of speed left after one second
    xp: 1,
    score: 2,
    pickupSpark: { count: 5, speed: 120, life: 0.3 },
    sound: { base: 1050, jitter: 270, dur: 0.05, wave: 'sine', vol: 0.05, slide: 1900 },
  },

  progression: {
    firstLevelXp: 8,
    levelBase: 7, levelLinear: 3, levelExponent: 1.55,
    fireRateGain: 1.075, fireRateFlat: 0.06,
    label: 'RAPID FIRE',
    labelOffset: 16,      // the level text floats this far above the ship
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

  ambient: {
    // The slow, harmless crowd that drifts behind the title screen.
    kinds: ['drifter', 'weaver', 'tank', 'darter', 'spitter', 'drifter', 'weaver', 'tank'],
    refillKinds: ['drifter', 'weaver', 'tank', 'darter', 'spitter'],
    target: 8,
    refillChance: 1.2,     // per second
    speedFactor: 0.45,
    spinFactor: 0.6,
    margin: 70,
  },
};
