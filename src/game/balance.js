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
    fireRate: 4.4,          // shots per second, before upgrades
    // A ceiling on how many shots one ship may have in the air per second, mostly
    // so that no combination of lines can turn the frame budget into confetti. It
    // deliberately sits above everything the fire rate line can reach on its own
    // (4.4 * 2.1 = 9.2), so what a player picks is never silently thrown away.
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
    // How many shots' worth of the ship's own fire rate may go by between two hits on
    // one body before the shooting at it counts as having stopped. This is the whole
    // definition of "a run of fire" behind the report's time-to-kill column, and it
    // is written as shots rather than seconds so it means the same thing whatever
    // weapon is doing the firing.
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
