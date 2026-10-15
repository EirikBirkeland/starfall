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
    // How big a ship is drawn. This is the one body number that is *not* on a ship's row
    // below: every ship in the game is drawn at this scale and differs by its silhouette,
    // not by its size. That is what keeps three promises true whoever you fly - the thing
    // that gets hurt stays a fraction of the thing you see, the walls clamp every ship by
    // the same edge, and every ring the frame paints at `drawRadius + a gap` (the dash's,
    // the overcharge's, the magnetar's) stands at the distance the simulation measures.
    drawRadius: 13,         // the Wisp's nose sits 16 px out from its middle
    // How fast it goes and how much of it there is belong to the ship: `maxSpeed`, `hull`
    // and `dashCooldown` are on its row in `ships` below. What is left here is what every
    // ship shares, whoever you are flying.
    accel: 2400,            // px/s^2 - full speed about 0.13 s after you lean
    brake: 3200,            // px/s^2 - letting go stops it in about 0.10 s
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
      // How long the wait is belongs to the ship (see `dashCooldown` on the rows in
      // `ships` below): one ship's whole idea is a dash that comes back quick, and a
      // number it pays for cannot live in the part of the table everybody shares.
      // None. A dash is spent a dozen times a run and the window is not moved a dozen
      // times a run (`screen`, above); the streak, the start burst and the whoosh are what
      // say it happened.
      shake: 0,
      // The crowd is shouldered out of the way as the dash goes through it, which
      // is also what makes a dash that ends inside a mob end somewhere you can
      // stand. Radius is measured from the ship's body plus the enemy's own.
      shove: { radius: 26, impulse: 300 },
      // Sparks left behind, one spray per step, thrown back along the dash.
      streak: { count: 2, speed: 150, life: 0.26, spread: 0.4 },
      // The burst and the ring that mark the moment it starts.
      start: { burst: 14, speed: 250, life: 0.32, ring: 7, ringSpeed: 380, ringLife: 0.3 },
      sound: {
        freq: 260, dur: 0.16, wave: 'triangle', vol: 0.06, slide: 880,
        // The whoosh, and the only noise sweep in the game that opens instead of closing: air
        // going past, brighter as it passes. `share` is what the hiss costs against the tone it
        // is laid over, so one number prices the pair (see `death.sound.noise` below).
        noise: { share: 0.9, dur: 0.26, cutoff: 260, sweep: 3200, q: 1.4 },
      },
    },
  },

  // The ships (PLAN 3.7): the body you fly and the gun it brings. `game/ships.js` is the
  // code that reads these rows, and the hangar's rack hands them out with a number key
  // (ui/screens.js) - `default` is what a run that never picked flies.
  //
  // Each row owns: how much of it there is (`hull`, and `maxHull` for what the pips can
  // hold), how fast it goes (`maxSpeed`), how long its dash takes to come back
  // (`dashCooldown`), which primary it carries (`weapon`), what it is drawn as (`shape`,
  // render/shapes.js), and any upgrade rank it arrives with (`ranks`). What it does NOT own
  // is its hitbox: every ship is hurt by the same 6 px core in `player` above. PLAN 3.1's
  // rule is that the thing that gets hurt is far smaller than the thing you see, and a ship
  // that was harder to hit because it was drawn small would be a ship the eye cannot
  // explain - so the silhouette changes and the core does not.
  //
  // The coins are hull, speed, and the gun, and the rows are priced against each other:
  //
  //   wisp      3 hull, 320 px/s, dash 2.5 s - the yardstick, and the plainest gun
  //   bulwark   4 hull, 256 px/s, dash 2.5 s - a pip of hull for a fifth of the speed
  //   volt      3 hull, 320 px/s, dash 1.5 s - 40% more dashes, paid for in reach
  //   needle    2 hull, 392 px/s, dash 2.5 s - a pip of hull bought back as speed
  //   brood     3 hull, 300 px/s, dash 2.5 s - a free pair of drones for 6% of the speed
  //
  // The pip of hull and the fifth of speed are the same trade made twice, once each way:
  // the Bulwark sells 64 px/s for a fourth pip and the Needle buys 72 px/s by giving one
  // back. Hull is the coin a run actually dies in (a pip is one more hit, and 1.5 s of
  // grace to make something of it) and speed is the coin that keeps you from needing it,
  // so a fifth of the second for a third of the first is about fair on a ship whose gun
  // wants to be close to the crowd and a fifth for a third the other way on a ship whose
  // gun wants a clear lane in front of it. The Volt's price is not in this table: it buys
  // the quickest dash in the game and pays with the shortest reach of the five primaries
  // (the arc makes its own lightning at 260 px, which is a distance it has to spend its
  // speed getting inside, and that is the whole idea of it). The Brood's free Orbitals
  // rank is a card the other four have to earn off the table, and a card is worth a few per
  // cent of a build at the level it is picked, so six per cent of the engines is about its price.
  //
  // The rows are in the order of the primaries they carry, which is what lets the number a
  // player presses keep meaning the gun it has always meant on this screen (game/ships.js).
  //
  // Every row carries a `cost` in stardust - what game/hangar.js asks for the body - and the ladder
  // is priced against what a run actually pays (see `stardust` below; five bot runs measured in
  // session 75, on top of session 74's):
  //
  //   a run that goes down inside the first minute    ~10
  //   a bot's ten minutes, five seeds                164 - 781
  //   the whole schedule walked out                  1,050 - 1,930
  //
  // So the first ship a player buys is one run that went alright and the last is one run that beat
  // the arena. They rise in the order the rack prints them, which is also the order of how much of
  // the arena each one asks you to give up: the Bulwark's fourth pip is the cheapest thing here
  // because it is the one that forgives a mistake, and the Brood is the dearest because a rank of
  // Orbitals spent before the first level is the only body in the game that starts with a card
  // already taken off the table.
  ships: {
    default: 'wisp',
    // The ship the game has always flown, and the one every measurement in NOTES was taken
    // on. Nothing about it is a trade: three hull, the speed the acceleration table was
    // written for, the pulse. That is its identity - the plain answer, and the row the
    // other four are priced against.
    //
    // Free, and the only row that is: it is the body a visit that has bought nothing arrives in,
    // so a price on this one would be a hangar that charges you to play at all (game/hangar.js
    // treats a cost of 0 as "always yours" and test/unlocks.test.mjs holds the line).
    wisp: {
      name: 'WISP',
      shape: 'dart',
      hull: 3,
      maxHull: 3,
      maxSpeed: 320,          // px/s
      dashCooldown: 2.5,      // s, from the start of one dash to the next
      weapon: 'pulse',
      ranks: {},
      cost: 0,
    },
    // Four hull and a fifth less of the arena out of reach of, with the scatter's whole
    // weight standing 370 px away instead of the pulse's 700. It is the ship that walks
    // into things: the extra pip is not a gift, it is what you spend on being where the
    // scatter needs to be. Drawn wide and blunt so the fourth pip is visible (render/shapes.js).
    bulwark: {
      name: 'BULWARK',
      shape: 'hex',
      hull: 4,
      maxHull: 4,
      maxSpeed: 256,
      dashCooldown: 2.5,
      weapon: 'scatter',
      ranks: {},
      cost: 250,
    },
    // The dash is the Volt. One dash every 1.5 s rather than every 2.5 is nearly half again
    // as many escapes in a crowded second, and the arc it carries - the one primary that
    // throws nothing and points itself at whatever is standing inside 260 px of it - is
    // the gun that needs a dash to get where it is useful. The hull stays at three because
    // the reach is what it paid.
    volt: {
      name: 'VOLT',
      shape: 'bolt',
      hull: 3,
      maxHull: 3,
      maxSpeed: 320,
      dashCooldown: 1.5,
      weapon: 'arc',
      ranks: {},
      cost: 700,
    },
    // The other side of the Bulwark's trade: one hull gone, a fifth more speed, and the
    // lance, which is the primary that wants a lane it can see down the end of. Two pips
    // means two mistakes, and being the fastest thing in the arena is what it bought with
    // them; the drawn ship is a needle to match, and so is the card that says "two hull".
    needle: {
      name: 'NEEDLE',
      shape: 'spike',
      hull: 2,
      maxHull: 2,
      maxSpeed: 392,
      dashCooldown: 2.5,
      weapon: 'lance',
      ranks: {},
      cost: 1300,
    },
    // The Brood arrives with a rank of Orbitals already spent - two drones on the ring from
    // the first second of the run, which is a card off the table before the first level.
    // Its engines pay for it. The swarm it carries is the slowest of the primaries and
    // does its work from further off than the ring does, so the ship reads as a carrier
    // even when the drones are the oldest part of it, and it is drawn as one.
    brood: {
      name: 'BROOD',
      shape: 'pod',
      hull: 3,
      maxHull: 3,
      maxSpeed: 300,
      dashCooldown: 2.5,
      weapon: 'swarm',
      ranks: { orbitals: 1 },
      cost: 2200,
    },
  },

  // Stardust: what a run leaves behind that the next one can spend (PLAN 3.7). The purse
  // itself is remembered in the save document and `game/stardust.js` is the code that fills it and
  // empties it; this is the rule for both halves.
  //
  // PLAN's sentence is "1 per 100 score, plus bonuses for bosses" and these are that sentence
  // priced against what a run actually scores. Held alive to the end of the schedule a run comes
  // down at 55,000-113,000 (three seeds measured in session 74 with the hull topped up every
  // frame, so it is the crowd's income and not a bot's skill), which is 550-1,130 dust, and a
  // first-timer who goes down inside the first minute leaves about 10. So one rank of a perk is
  // a couple of runs and a whole ship a good evening, which is the shape milestone 8's costs
  // have to fit - and the ships' side of that is written next to `ships` above.
  stardust: {
    perScore: 100,      // dust per this much score, and the only part that grows all run
    perBoss: 100,       // ...and per fight the schedule sent that came down
    won: 500,           // ...and for walking the whole schedule out at all
  },

  // The perks: ranks bought in the hangar between runs (PLAN 3.7). The table lives in game/perks.js
  // and the money in game/hangar.js; this is the price sheet, and it is priced in the same coin
  // the ships above are - what a run actually leaves behind, as measured, not what a wish earns.
  // That is what a first rank is (a run or two: the first purchase should be a second run that
  // starts slightly different) and what a full ladder is (an evening or a night of the arena,
  // which is the order a hangar's wants should run in: ranks before ships, and the late ranks of
  // one before the first rank of the next).
  //
  // The Gleaner is the only row that is priced in itself: a rank of it multiplies every other
  // line on this screen, so it climbs faster than the rest, and the rack reads it as the row
  // that saves, not spends.
  perks: {
    hull:     { ranks: 5, step: 1,  says: 'HULL',     cost: [120, 300, 600, 1200, 2400] },
    dust:     { ranks: 5, step: 10, says: 'STARDUST', percent: true, cost: [150, 400, 900, 1800, 3200] },
    reroll:   { ranks: 5, step: 1,  says: 'REROLL',   cost: [80, 200, 500, 1000, 1500] },
    banish:   { ranks: 5, step: 1,  says: 'BANISH',   cost: [80, 200, 500, 1000, 1500] },
  },

  // The challenge modifiers (game/challenges.js): the harder sets of rules a run can be flown under,
  // picked between runs and impossible to change once it is flying. The names, the sentences and the
  // cycle are game/challenges.js's, in the same split game/perks.js and BALANCE.perks strike; this is
  // the number sheet, and every number here is what a lever in that file reads.
  //
  // `hull` replaces the starting hull and its ceiling, whatever the ship's row and whatever the hangar
  // bought. `dash: false` refuses the jump where the jump is granted. `speedMul` multiplies a body's
  // walk and an enemy shot's velocity, at the two places those are worked out.
  //
  // `holdMul` multiplies what the arena may hold at once - the wave director's budget *and* its wall on
  // standing bodies, both in game/waves.js - for the whole run. One number and not two because the two
  // walls are already tuned to meet (waves.crowdMax is ~89 bodies at the crowd's 4.5 points a body and
  // waves.maxBodies is 100), so moving one without the other would just make the quieter one the rule.
  // The endless wall (`endless.growth.bodiesCeil`) stays outside the multiply and still the outer wall,
  // which is what keeps a scheduled run under what a real frame has been measured to pay for.
  //
  // 1.5, from `tools/challenge-cost.js` on the careless hand (8 seeds x 5m, then 16 for the sweep):
  // the middle run dies at 2m48s against plain's 3m53s and scores 0.60x plain's middle, which is the
  // pair the ladder asks of a rule. On the careful hand nobody dies either way and it still costs a
  // run: 0.73x plain's middle score, and 11 hulls lost against plain's 3 - a hand that can clear the
  // extra crowd pays for it in hull and not in its life, which is the profile this rule wanted.
  //
  // The sweep could not choose between the shares, and that is said here rather than hidden: at 1.3 it
  // reads 0.64x (3m01s), at 1.5 0.60x (2m48s) and at 1.75 0.62x (2m38s) on sixteen seeds, all of them
  // inside a twentieth of each other. A bigger crowd is more bodies to shoot, so the score column is
  // not monotonic in the share the way it is for a swift crowd; the ladder can say this rule costs a
  // quarter of a careless run and cannot say which of those three is sharper. So 1.5 was not picked off
  // the ladder. It was picked because it lifts the schedule's wall to 150 bodies, which is under the
  // 200 a real frame has been timed against (`endless.growth.bodiesCeil`, and the figure the browser
  // half of the performance pass is meant to fly to) - a share of 1.75 would stand 175 of them in a
  // scheduled run, which is a crowd nobody here has ever timed on a screen.
  //
  // `gatedOn` is which card lines a rule makes useless, and so keeps out of the deck: the tether and
  // the afterimage both fire off a dash, so under NO DASH they are cards that can do nothing.
  challenges: {
    brittle:  { hull: 1 },
    grounded: { dash: false },
    swift:    { speedMul: 1.4 },
    thick:    { holdMul: 1.5 },
    gatedOn:  { grounded: ['tether', 'afterimage'] },
  },

  // The awards (PLAN 3.7): what a run did that this save remembers, and the little stardust it pays
  // for doing it. The table - the id, the name, the line, and the rule - is game/awards.js; this is
  // the price sheet, in the same split game/perks.js and BALANCE.perks strike.
  //
  // `need` is what the rule has to reach, in the unit the rule counts in (bodies, points of score,
  // levels, seconds, shards, ranks, dashes) and is read *by* the rule rather than written into it,
  // so no threshold is hard-coded in a game module. The prose in game/awards.js spells the same
  // number out; changing one means changing the other.
  //
  // `dust` is priced against what a run actually pays (see `stardust` above): a good fifteen-minute
  // run leaves about a thousand, so the easy awards are a fraction of a run, the hard ones are a
  // run, and the whole table together is a little under one expensive ship - which is the ratio
  // PLAN asks for, "a little stardust" for doing something worth remembering.
  awards: {
    // The chime an award earns, queued by the game itself (game/awards.js `updateAwards`) rather
    // than by a keypress, because an award is the run's news and not the interface answering one.
    // Two notes a fifth apart, rising: quieter and shorter than the win's fanfare above, and than
    // the level-up's chime, because it lands in the middle of a fight that is still going on.
    sound: { notes: [880, 1318], dur: 0.42, wave: 'triangle', vol: 0.085 },
    rows: {
      // Bodies brought down in one run.
      'century':        { need: 100,    dust: 20 },
      'thousandfold':   { need: 1000,   dust: 60 },
      'reaper':         { need: 5000,   dust: 200 },
      // Score in one run.
      'bright-spark':   { need: 10000,  dust: 25 },
      'supernova':      { need: 50000,  dust: 80 },
      'starfall':       { need: 150000, dust: 250 },
      // Levels reached in one run.
      'warmed-up':      { need: 10,     dust: 20 },
      'built-different': { need: 25,    dust: 60 },
      'old-hand':       { need: 50,     dust: 120 },
      // Time survived, in seconds.
      'five-minutes':   { need: 300,    dust: 30 },
      'quarter-hour':   { need: 900,    dust: 120 },
      // The loot, and the row it comes in.
      'collector':      { need: 500,    dust: 50 },
      'magnet':         { need: 25,     dust: 40 },
      // The crowd's gold, and the pack that turns as one.
      'gold-touch':     { need: 25,     dust: 60 },
      'swarm-breaker':  { need: 500,    dust: 60 },
      // The fights. `every-fight` counts the schedule itself, and a test holds this number to its
      // length (test/awards.test.mjs) so the two cannot drift apart.
      'first-fight':    { need: 1,      dust: 50 },
      'every-fight':    { need: 3,      dust: 200 },
      // The run, and how it was flown.
      'arena-cleared':  { need: 0,      dust: 300 },
      'wisp-cleared':   { need: 0,      dust: 60 },
      'bulwark-cleared': { need: 0,     dust: 60 },
      'volt-cleared':   { need: 0,      dust: 60 },
      'needle-cleared': { need: 0,      dust: 60 },
      'brood-cleared':  { need: 0,      dust: 60 },
      'no-dashing':     { need: 0,      dust: 150 },
      'untouched':      { need: 300,    dust: 120 },
      'flawless':       { need: 0,      dust: 250 },
      'streaked':       { need: 250,    dust: 60 },
      // The build.
      'in-combination': { need: 1,      dust: 80 },
      'full-kit':       { need: 25,     dust: 60 },
      // And the mode that only a won run can enter, in seconds past the win.
      'past-the-end':   { need: 300,    dust: 100 },
    },
  },

  // The run log (PLAN 3.7): the last few runs this save has flown, kept so that "what did I just
  // play, and how did it go" is a question the game can answer after the card has gone away.
  // The rows themselves are game/history.js and the panel that prints them is the codex's; this is
  // only how many are kept, which is a design number and not a storage one (the store has its own,
  // much larger, ceiling for what a list of runs may be - core/save.js).
  //
  // Twenty is a column of rows that fits a window at the size the codex's other panels are set in,
  // and about two sittings of the arena: long enough that the best run of an evening is still on the
  // list when you come back for one more, short enough that the whole of it can be read at once.
  history: {
    keep: 20,
  },

  // The primaries (PLAN 3.2). One is flown at a time, and it comes with the ship that was picked
  // (game/ships.js); `default` is what a run that has not picked anything flies.
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
      // One heavy thump, and still one per pull however many pellets came with it: a fan is one
      // event and not six, whatever the mix would let through (audio/mix.js).
      sound: { base: 190, jitter: 34, dur: 0.09, wave: 'sawtooth', vol: 0.07, slide: 70 },
    },
    arc: {
      name: 'ARC',
      // Lines of the deck this gun has nothing to do with, so the deal keeps them out of its sight
      // (game/upgrades.js `spendableBy`). It is not a weakness to be worked around: the bolt is
      // drawn between two bodies in the step it lands (game/arc.js), so there is no shot left over
      // after a body for the pierce line to pass on with, nothing for the ricochet line to turn,
      // and no projectile at all to give speed to. Measured, not read: five free ranks of each of
      // the three, on runs that were otherwise the same game, medianed the same score to the point
      // (`tools/line-ab.js --line pierce --weapon arc --seeds 4 --seconds 900`: 106,219 with the
      // line and 106,219 without it; bullet speed 111,680 and 111,680; ricochet the same again).
      // test/arc.test.mjs holds the mechanism, and this row is the only place the list is written.
      cannotSpend: ['pierce', 'ricochet', 'bulletSpeed'],
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
      // sound and not four, whichever of them the mix would have afforded (audio/mix.js).
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
    lance: {
      name: 'LANCE',
      // The same three lines the arc cannot spend, for the same reason one degree further on: this
      // gun throws nothing at all (game/lance.js), so the pierce line has no shot to keep passing,
      // the ricochet line no shot to turn, and the shot-speed line nothing to speed up. It is a
      // line of light: what it covers is `beam.halfWidth` and the reach of the arena, and neither
      // of those is a projectile's. Measured the same way as the arc's list, and inert to the point
      // (`tools/line-ab.js --line pierce --weapon lance --seeds 4 --seconds 900`: 113,614 with the
      // line, 113,614 without; bullet speed 114,766 and 114,766). See test/lance.test.mjs.
      cannotSpend: ['pierce', 'ricochet', 'bulletSpeed'],
      // Pulls a second, and this is the number that was wrong about this gun (NOTES session 96).
      //
      // PLAN's 0.9 shipped for eight milestones, and it was a faithful reading of PLAN: one line of
      // light every 1.1 s against the pulse's 4.4 shots, buying the whole of one line and giving up
      // the sky in front of it. What that number was measuring was *hull a second*, and a run is not
      // paid in hull. A run is paid in bodies - a shard drops per kill (game/enemies.js), a shard is
      // XP, and XP is the build - and a trigger that moves 0.9 times a second caught 1.9 bodies a
      // pull in a live crowd, so the whole gun was paid for two bodies a second while the pulse was
      // paid for six. The compounding from there is the whole of the story: level 7 by the end of a
      // lance run against the pulse's 66, and a middle run that stopped at 3m40s.
      //
      // So the row is priced in bodies now, and a body is bought with a *pull*. 2.6 lines a second is
      // the middle of the pack's rate band (the scatter 2.2, the swarm 3, the arc 4, the pulse 4.4),
      // and it is the number that stopped the gun losing: eight seeds at the old rate medianed 6,736
      // with six of the eight dead before the window shut; at 1.8 it medianed 57,852 with two dead;
      // from 2.6 up it is level with everything else (`tools/weapon-ladder.js` is the gate).
      //
      // Worth writing down what did *not* work, because two of them are good ideas that were tried
      // (session 96, eight to twelve seeds and a ten minute window each, against the shipped 6,736): a
      // beam twice as wide gave 5,025, and a fan of three lines a pull - one line become a fork - gave
      // 4,891 with 20% more hull behind the pull and 7,592 with 80% more. Neither is a rate in
      // disguise, and the rate is what the crowd is actually asking for: a press has to be thinned
      // *continuously*, and a sweep once a second leaves the bodies round the ship standing there for a
      // whole second while the line empties the far end of the arena.
      fireRate: 2.6,
      // One line a pull, before the split line fans it out into more lines. `pellets` is how many
      // things a pull sends out and on this gun the things are beams (game/lance.js), so the line
      // that adds "one more projectile" adds one more *line*, each at that line's own share.
      pellets: 1,
      gap: 0,             // nothing is fanned until the split line fans it; see BALANCE.upgrades.split
      // What one line costs a body standing on it, in the unit enemy hull is counted in: **one
      // body**, which is what a mid-run swarmling is worth (`tools/weapon-ladder.js` asks
      // game/kinds.js for it rather than guessing, and the near-field knot is planted at exactly
      // this number).
      //
      // That is the answer to the question this re-price had to answer instead of skating over -
      // *what should a heavy gun cost a body?* - and the answer is: what a body costs. Five of these
      // were paying five hull to remove a three-hull body on every single pull, and the two hull over
      // the top of a body buy no shard, no XP and no level: the near knot's `cost/kill` column read
      // 5.00 against the other four guns' 3.00-3.25, which is a fifth of this gun's income thrown
      // away eight hundred times a run. At three that column reads 3.00 and the gun is charged like
      // everything else - and the two points of hull it gave up are spent on the rate above, which
      // buys far more than they did: 3 x 2.6 is 7.8 hull a second off a lone body against the 4.5 the
      // row used to spend, inside the pack's near-field band (the pulse 4.3, the scatter 6.1, the arc
      // 7.2), and 3 x 6 bodies x 2.6 is 46.8 on a column, which is still three times anything else in
      // the game and still this gun's whole reason for existing.
      //
      // The old number, for the record, and it was argued at length here: five plain shots a line,
      // which killed a drifter, a darter and a weaver outright and left a spitter with a quarter of
      // its hull.
      //
      // PLAN writes 60 against the pulse's 10 - six of its shots - and at PLAN's own rates that
      // is 54 hull a second against the pulse's 60, i.e. nine tenths of the plain gun on a body
      // that is standing on the line. Here the plain gun is 4.4 hull a second, so nine tenths of
      // it is four at a time at PLAN's rate, and what was decided then was to spend the tenth of a
      // point the
      // ratio leaves over on the wind-up instead: at five, measured with `tools/power-ladder.js
      // --weapon lance`, the gun is level with the plain one on the knot that prices a gun - the
      // near field, one body at a time, 4.4 hull a second against the pulse's 4.3 and the
      // scatter's 5.9 - and several times it on the two knots a line is for: 20.0 hull a second on
      // the ring and 26.3 on the column, against the pulse's 4.3 on both, because a lance picks up
      // every body standing in the lane and the other guns pick up one.
      //
      // That last pair is the whole of this gun's defence and the whole of its risk, so it is worth
      // saying plainly: on a crowd that happens to be in a line the lance is worth as much again as
      // a maxed damage rank on anything else, and the only thing standing between it and the
      // scatter is that the line has to be *found*, once a second, by whoever is holding the mouse.
      // (Every hull-a-second number in the two paragraphs above this one was measured at PLAN's rate
      // and is quoted from NOTES session 52 for what it was worth then; `--knots-only` prints what
      // the row is worth now.) test/lance.test.mjs holds the shape of the single-body number and
      // `tools/gun-clock.js` prints what the wait costs a body that moves.
      //
      // Note what this number buys *nothing* on: a line that hits everything on it cannot also be
      // given pierce, and a line that arrives in one instant cannot be given ricochet or a bullet
      // speed. Three of the ten upgrade lines do nothing at all for this gun, which is the price
      // of the sixth being the whole arena, and it is the same reading that leaves pierce and
      // ricochet off the arc (BALANCE.weapons.arc).
      damage: 3,
      // The heaviest kick in the game, per pull, and it is paid at the discharge and not at the
      // trigger - the gun goes off, the ship is shoved back, in that order (game/lance.js). The brake
      // eats it in a fraction of a second (NOTES session 8), so what it is: a lurch backwards every
      // time the thing lets go, and a ship that fires it with a body at its back should expect to be
      // shoved at it.
      //
      // It came down with the rate went up, and the reason is that a kick is felt per second and not
      // per pull: 220 at nine tenths of a pull a second was 198 px/s of shove, and the same 220 at
      // 2.6 would have been 572 - more than the ship's own top speed, so a player holding the trigger
      // would be flying backwards out of the very press this gun now exists to clear. At 90 the gun
      // still hands out 234 px/s, the heaviest in the game by half again (the scatter's is 121, the
      // pulse's 62), and still the one lurch a player can feel through a whole fight.
      recoil: 90,
      // The beam itself (game/lance.js). Everything about a lance is here: how long the gun hums
      // before it goes off, how thick a line still hurts, what a body on it is thrown by, and how
      // long the light that remembers it is kept.
      beam: {
        // s of wind-up: the band is drawn, tracks the nose, and the gun whines for this long before
        // it fires. Short on purpose. It is not a punishment for pulling the trigger, it is the
        // window in which the line can still be walked onto what you are aiming at (game/lance.js).
        // This number and the width below are a pair, and what they have to keep is one promise: a
        // body you pointed at when the trigger moved is still on the line when the light arrives.
        // A drifter crosses 9 px in 0.12 s, which is inside the half-width, so pointing at where a
        // walking body *is* lands on it. A darter's lunge crosses 21 px and has to be led, which is
        // the one thing in the crowd that does - and a darter comes straight at you, so leading it is
        // a matter of holding the line where it is going. At PLAN's 0.2 s the drifter is at 15 px and
        // the whole crowd has to be led, and a gun that misses what it was aimed at is not a slow
        // gun, it is a broken one. What each of the crowd's paces keeps is what the line's own tool
        // prints: `tools/gun-clock.js --weapon lance`.
        wind: 0.12,
        // px each side of the axis a *centre* is still hurt, which is the width the light is drawn
        // at and the whole of the collision test (the same one-number promise game/beams.js and
        // game/tether.js make). A third again the ship's own hit radius, and about a drifter's
        // width: a lance is a bar of light and not a needle, because a line you can never see the
        // end of is a line you cannot aim. At this width a beam aimed at a body takes that body and
        // whatever is standing behind it in a lane 32 px across - which, with the wind-up above, is
        // what lets a body walking sideways at a drifter's pace still be inside the line when the
        // light arrives.
        halfWidth: 16,
        // px/s of shove given to a body the line came round, down the line and away from the ship.
        // Heavy, because that is what a lance is *for*: the column in front of you is thrown into
        // the wall and the press behind it has to walk back across the ground the beam just took
        // off it. It is not a nova front's wall of shove and it never pushes a body sideways out
        // of the line, so the next beam finds the crowd it just moved.
        shove: 220,
        // How long the light is kept after the flash. Longer than an arc bolt's and about a third
        // of the cycle: the line is where the damage went, and at two and a half pulls a second there
        // is just room on the glass for it to be seen and gone before the next one.
        light: { life: 0.22 },
        // Sparks off each body the line came round, thrown down the line rather than back along
        // it, because a lance does not so much hit a body as take it off its feet.
        cut: { count: 3, speed: 150, life: 0.18, spread: 0.7 },
        // The muzzle: one flash and one ring at the nose, once a pull however many lines came with
        // it, and the small stop that says the gun is heavy. PLAN section 4's hit-stop is for the
        // big events and a lance going off down a loaded column is one.
        flash: { count: 12, speed: 260, life: 0.2, ring: { radius: 10, speed: 520, life: 0.24 } },
        // None, and the hit-stop below is what carries the weight instead: a primary that
        // moved the window every pull would move it the whole run (`screen`, above).
        shake: 0,
        // The stop is priced per second and not per pull, like the kick above: 30 ms at nine tenths of
        // a pull a second held the world 27 ms in every second, and the same 30 at 2.6 would hold it
        // 78 - which is not a beat, it is a stutter, and a stutter on the trigger is read as input lag
        // (pillar 1). At 18 ms the gun holds the world 47 ms a second: more than it used to, because
        // the rhythm is heavier now, and one frame and a bit of held world per pull instead of two.
        hitStop: 0.018,
        // The wind-up is heard as well as seen: one rising note, started at the trigger and ending
        // when the gun does, which is the whole clock of the thing in one sound. `dur` is the
        // wind-up, to the hundredth.
        charge: { freq: 210, dur: 0.12, wave: 'triangle', vol: 0.03, slide: 760 },
        // And the report: down instead of up, long for this game, and the loudest thing the trigger
        // does (one per pull, as every gun here, whatever that costs the sky: audio/mix.js).
        sound: { base: 150, jitter: 26, dur: 0.17, wave: 'sawtooth', vol: 0.085, slide: 44 },
      },
    },
    swarm: {
      name: 'SWARM',
      // The two of the three the Swarm really cannot spend - and the reason is narrower than the
      // arc's and the lance's, because this gun *does* throw shots. A shell is spent on the body it
      // finds: it detonates there (game/missiles.js), so there is never a shot left over to pass
      // through to the next body and never a spent one to turn onto something else. The shot-speed
      // line is not on the list, because a shell does travel and the line does move the run when it is
      // raised (126,904 with five free ranks against 128,405 with none - `tools/line-ab.js --line
      // bulletSpeed --weapon swarm --seeds 4 --seconds 900`). That is 0.988x, which is no claim that
      // the card is worth anything - the shot-speed line is a weak card on every gun that *can*
      // spend it - but the number moved, where the other two read exactly 1.000x, and the gap between
      // a card worth little and a card that is not a card at all is exactly that. test/missiles.test.mjs
      // holds the mechanism.
      cannotSpend: ['pierce', 'ricochet'],
      // PLAN's three pulls a second, and it is the middle rate of the five: the pulse pulls four and
      // a half times a second, the arc four, the scatter two and a bit, the lance two and a half.
      // Three pulls a second, each one a pair of slow things that each find a body of their own -
      // that is the whole shape of this gun.
      fireRate: 3,
      // Shells a pull, and this is the number that was wrong about this gun (NOTES session 96).
      //
      // One shell a pull at three pulls a second is three bodies a second at best, and a run is paid
      // in bodies: a shard per kill, XP per shard, levels per XP. The three guns that were doing well
      // were being paid for six bodies a second and the swarm for three, which is the whole of why its
      // middle run medianed 35,071 against their 68,000-75,000 while its hull a second was level with
      // theirs (the near knot says the same story in the other currency: 1.5 bodies a second against
      // the scatter's 2.0 and the arc's 2.3). So the row buys bodies, not hull: a pull is a *pair*,
      // which is what the gun's own name was always promising.
      //
      // Each of the two hunts for itself (game/missiles.js: the nearest body it can see), so in a thin
      // sky both of them will take the same body and the pair is one body with extra steps; in a crowd
      // that is what the shells are for, and what a pair really buys is that a chipped body is finished
      // and a blast lands twice as often. That is the honest version of the claim - the row is paid for
      // two shells a pull and the crowd decides which two bodies they are.
      //
      // A bigger blast was the other candidate and it works - radius 90 instead of 46 medianed 68,678
      // with the rate untouched - and it was refused for a simple reason: `micro` is in the name and in
      // the blurb, and a 180 px circle going off three times a second is not a micro missile, it is a
      // nova you have to aim. Two small shells in the crowd is the same number of bodies and the same
      // screen full of small cracks, and it leaves the blast's own note below true. Longer *reach* was
      // the third idea - 500 px instead of 320 of eye - and it cost the run instead of paying for it
      // (18,050), because a shell that goes looking further afield is a shell that arrives later and
      // leaves the bodies at the ship's hull to their own devices.
      pellets: 2,
      // Radians between the two shells of a pair - a look and not an income, and measured as one:
      // eight seeds and a ten minute window at 0, 0.12 and 0.25 rad medianed 75,533, 76,984 and 75,996,
      // which is the same number wearing three hats. So it is chosen for the eye. Two shells that leave
      // one nose side by side fly in lockstep and read as one fat shot; a quarter of a radian puts a
      // body's width between them by the time they are 100 px out, which is what makes it a *pair*
      // (game/missiles.js hunts with the nearest body it can see, so two shells chase one body just as
      // easily here as anywhere else - the gap is not a target-spreader, and the run does not care).
      // It is also wider than the split line's own fan (BALANCE.upgrades.split), and game/weapons.js
      // takes the wider of the two, so a rank of split never squeezes the pair back together.
      gap: 0.25,
      // What one shell costs the body it lands on, in the unit enemy hull is counted in - so a shell
      // is one and a half plain shots of the pulse, and a pull of two of them is three.
      //
      // PLAN writes 6 against the pulse's 10, i.e. three fifths of a pulse shot, and at PLAN's own
      // rates that is eighteen hull a second against the pulse's sixty: a third of the plain gun,
      // with homing and a small blast as the reason for the difference. This game counts hull in pulse
      // shots (BALANCE.bullets.damage), so it is the ratio that transfers and not the number, and the
      // ratio that shipped is a bigger one: three pulls of a missile and a half is 4.5 hull a second,
      // which is what the plain gun does - one shell a pull, which is what these next three lines were
      // measured with, and a pull is a pair now so read them all as half of what the row is worth today
      // (`tools/weapon-ladder.js --knots-only` prints that). Measured, `tools/power-ladder.js
      // --weapon swarm` (20 s, six seeds, the same knots every gun is priced on):
      //
      //   the near field   4.5 hull/s   (the pulse 4.3, the scatter 5.9, the lance 4.3)
      //   the ring        13.9          (the pulse 4.3, the scatter 12.2, the lance 20.0)
      //   the column      12.2          (the pulse 4.3, the scatter 13.0, the lance 26.3)
      //
      // and `tools/gun-clock.js --weapon swarm` says 7.5 hull off one body in two seconds of held
      // trigger at 200 px against the pulse's 8.0, and 6.0 of that same body walking across the line
      // at a darter's pace against the pulse's 0.0 - because a missile that has missed nothing does not
      // care that the body moved. That is the gun in one row: it is never behind on what it was aimed
      // at and it is two to three times the plain gun on a crowd it was not aimed at, because every
      // shell finds a different body and each of them goes off in the middle of the next few.
      //
      // Half a hull more than the plain shot, then, and not a whole one - the first pass at damage 1
      // read 3.0 / 13.8 / 11.8 on those knots, i.e. seven-tenths of the plain gun on the three bodies
      // a press actually keeps, and ten runs on each gun put that at a median 4m27s of bot survival
      // against the pulse's 5m00s and a level 9 against its 17. The gun is meant to be *slow*, not
      // behind, and a knot below the plain gun on the near field is behind.
      //
      // What this number buys *nothing* on is the pierce line and the ricochet line, and that is not
      // an oversight: a shot that detonates on the first body it meets has nothing left to pass
      // through and nothing to turn (game/missiles.js), which is the same reading that leaves three of
      // the lines off the lance and two off the arc. What the bullet speed line buys *is* something,
      // though - it is the only line that makes these shells arrive sooner - and it is worth more here
      // than anywhere else in the game for exactly that reason: measured on a body 420 px out,
      // five ranks of it land the same hit in 0.61 s instead of 1.28 s, which is the whole of
      // the line being paid back.
      damage: 1.5,
      // px/s. Slow on purpose: a third of a pulse shot, and slower than the ship can run (320). A
      // shot that cannot miss is only an interesting gun if it takes its time, and a missile that is
      // slower than you are can still be led, stepped out of, and run away from - which is the whole
      // counterplay this gun has, and the player's own judgement of whether the flight was worth the
      // wait is made out of that speed.
      speed: 300,
      // s of fuse, not of range: at 300 px/s that is 600 px of air, and it is what an orbiting
      // missile that has lost its body gets before it gives up. Long for this game - the pulse is
      // 1.15 - because a shot that turns covers less ground in a straight line and the reach a player
      // judges is the one they can see it travel.
      life: 2,
      // A little wider than the pulse's: three of them leaving the same nose in a row should be a
      // flight and not a queue.
      spread: 0.07,
      // Barely a shove. A micro-missile is a thing that sticks and goes off, not a thing that knocks
      // a body backwards - the blast does the pushing, and it pushes outwards from where it landed.
      knockback: 0.02,
      // Light, like the gun is: three small things a second, and the ship should never feel like it
      // is being pushed backwards by its own swarmling launcher.
      recoil: 10,
      muzzle: { count: 3, speed: 90, life: 0.16 },
      // One per pull, as every gun here (audio/mix.js). Up instead of down, which is the one sound in
      // the game that leaves rather than strikes: the missile is off and going before the report ends.
      sound: { base: 260, jitter: 46, dur: 0.08, wave: 'triangle', vol: 0.035, slide: 640 },
      // The missile itself (game/missiles.js): how hard it can turn, how far it will look for a body
      // to chase, and what the small blast it leaves where it lands costs and looks like.
      missile: {
        // rad/s of steering, and it is deliberately not much: a quarter of a turn takes 0.44 s, so a
        // body that sees one coming has time to step sideways and a body that does not is a body that
        // was not looking. Turn faster and the gun stops being aimable and becomes a searchlight.
        turn: 3.6,
        // px, measured to a body's skin rather than to its middle, which is what lets a tank be hunted
        // from further out than a weaver standing the same distance off. Inside this the missile will
        // find whatever is nearest; outside it, it flies where it was pointed and dies of old age.
        reach: 320,
        blast: {
          // px. Small - about the width of two drifters and a gap, and about a third of the magnetar's
          // field - because this is a micro-missile and the blast is the gun's *area*, not its punch.
          // It is drawn at this radius and paid out at it, edge for edge, like every ring in this game.
          radius: 46,
          // of the missile's own hull, paid to every body in the circle except the one it landed on
          // (game/missiles.js: the body you hit pays the shot, the crowd around it pays the blast).
          // Well under half, and that is what keeps the ring knot at the scatter's level rather than
          // the lance's: at 0.6 the same ladder read 13.8 on a damage of 1 and the crowd knots were
          // buying more of the gun than the shells were.
          share: 0.35,
          // px/s thrown outwards from where it went off. A cluster that takes a flight of these
          // comes apart, which is what makes the next flight find air rather than the same wall.
          shove: 90,
          ring: { radius: 8, speed: 240, life: 0.18 },
          flash: { count: 6, speed: 150, life: 0.16 },
          // None. Three of these a second is a drumroll of small shocks, and a drumroll of
          // small shocks is exactly what filled the screen with jitter (`screen`, above).
          // The ring, the flash and the crack are the whole of a landing now.
          shake: 0,
          // One small crack per missile that lands, and quieter than the gun's own report, because
          // on a crowd this fires about twice as often as anything else in the game (audio/mix.js).
          sound: { freq: 220, dur: 0.1, wave: 'square', vol: 0.028, slide: 60 },
        },
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
    // What a shot landing on a body sounds like, and the body's own size is the pitch: twice
    // the radius, an octave down. A ratio is the one relation that stays musical across a
    // crowd this unequal (a swarmling is 7 px and a boss's frame is 60), and `at` is the body
    // that rings at `hz`. The band is clamped so a body outside the crowd's sizes still makes a
    // hit tick rather than a thud or a whistle, and `bend` is the drop below the note it
    // started on - a ratio like the shard's, so a big body falls as far in pitch as a small
    // one and not just to the same place.
    // Measured off the crowd (NOTES session 70): a swarmling at 617 Hz, a drifter at 288, a
    // tank at 166, a boss's frame at 90 - four sizes of body, two octaves of tick.
    impactSound: {
      at: 12, hz: 360, low: 90, high: 900, jitter: 28, bend: 0.62,
      dur: 0.03, wave: 'square', vol: 0.02,
    },
  },

  // What every enemy shot shares, whoever fired it. How fast and how big a
  // particular one is lives with the kind that spits it (see `kinds.spitter.spit`).
  enemyShots: {
    despawnMargin: 40,        // this far outside the arena, it is gone
    impact: { count: 6, speed: 200, life: 0.3 },
    // What a `caged` shot leaves behind when it reaches the cage: a couple of sparks and nothing
    // else (game/field.js). Small on purpose - a boss's ring can put two dozen of them on the
    // wall in the same moment and a wall of fireworks would be the picture instead of the ring.
    wall: { count: 2, speed: 110, life: 0.2 },
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
  //   from    seconds of run before it may arrive at all (PLAN 3.3's "appears from",
  //           except on the two rows that say why they come earlier than he wrote)
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
    // PLAN 3.3 gives this body 4:30 and it gets 0:00 here, which is the one place the arrival
    // clock and the plan plainly disagree, so the reason is measured rather than assumed
    // (session 90, `tools/run-shape.js --seeds 1-48`, the person-shaped bot answering the
    // level-up with a die). The case for the plan's clock is strong: the weaver is the fastest
    // thing in the arena and dies to one shot, so it spends speed instead of hull, and it takes
    // 40% of a careless batch's deaths and 40% of its hulls - PLAN's whole "no enemy type over
    // 40%" ceiling, spent by one body that arrives before a run has bought anything. Moving it to
    // 4:30 does fix the ceiling (the widest becomes the darter at 38%) and does move the middle of
    // that batch from 2m33s to 2m53s, which is two more of the 48 runs inside PLAN's band. It is
    // not worth what it costs. The weaver is the cheapest kill in the game and so is what the
    // opening is *paid* in: a minute in, the middle of the batch is level 4 with 1,001 score on
    // this clock and level 3 with 642 on the plan's, and of the runs still flying at four minutes
    // the middle one is level 12 with 6,509 score here against level 5 with 2,313 there, against
    // the same crowd - and the reference run's ten minutes fall from 75,596 to 57,249, which is the
    // money the hangar is priced with. The runs the change really frees are the ones that were
    // already safe, too: a pair of perfect hands goes from 22 of 48 never dying to 35 of 48. The
    // careless batch it was meant to protect dies *more* often, 47 of 48 instead of 43. Longer and
    // poorer is not the arc PLAN asks for and it is squarely against the standing "do not make the
    // game easier: do not slow the spawn budget or the difficulty ramp". And the ceiling it would
    // fix is not a lever either: nothing measured in the crowd, and nothing that makes the ship
    // stronger, moves the middle of a careless batch's deaths off the two-and-a-half-minute mark -
    // half again the pulse's rate leaves it at 2m36s while the runs that never die go from 5 of 48
    // to 19 (session 90 again). The weaver taking 40% is the fastest body in the arena doing what
    // the fastest body does, and the darter takes 38% when it is gone. Taxing it instead of
    // scheduling it is worse still - `cost` 3 -> 5 middles the batch at 2m04s, because the room a
    // dearer weaver leaves is filled by two drifters - and that is the whole lesson of this row:
    // the crowd is not a difficulty dial, it is the run's income, and thinning it thins the ship.
    weaver: {
      radius: 10, speed: 172, hull: 1, score: 15, drop: 1,
      from: 0, cost: 3, weight: 5,
      // `sides` is the fallback shape; the weaver is drawn with the ship's own pointed
      // silhouette (render/entities.js, WEAVER_SPIKE) - tools/sights.js says what that costs
      // the palette and what it buys.
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
      // PLAN 3.3's Tank appears at 2:00; it arrives at ten seconds here, and that too is
      // measured (session 90). A tank is the one early body that spends 8 points of the crowd
      // budget on something slow enough to shoot out of the way and pays five shards for the
      // trouble. On the plan's clock, alone, the careless batch middles at 1m43s instead of 2m32s
      // and the weaver takes 54% of its deaths - the slow body is what stops the opening filling
      // with fast ones a two-level ship cannot answer. Moving it together with the weaver middles
      // the batch at 2m11s, against the 3m17s the weaver move alone buys.
      from: 10, cost: 8, weight: 3,
      color: PALETTE.amber, fill: PALETTE.amberFill, sides: 6, glow: 22,
      rotateRate: 0.55,
      // What it comes apart into: `into` of `type`, thrown outwards at `impulse`
      // from `offset` out. Naming the kind here is what lets the split be data.
      split: { into: 2, type: 'drifter', hpFactor: 0.5, radius: 12, drop: 1, speedMul: 1.25, impulse: 190, score: 8, offset: 8 },
      // `hitStop` marks a kill big enough to stop the run for: the seconds the
      // whole world holds still when this kind goes down (PLAN section 4). A
      // kind that does not ask for one is simply not a big enough event.
      // `shake: 0` because a tank is one body among forty and the window is not moved for
      // it (`screen`, above); the hit-stop is what says a tank went down.
      death: { particles: 30, speed: 340, debris: 14, debrisSpeed: 200, ringSpeed: 420, shake: 0, hitStop: 0.04 },
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
        // None. A bomber goes down several times a wave and this was the loudest of the
        // routine shakes (`screen`, above). The blast still stops the run and throws the
        // crowd; it just does not throw the window with it.
        shake: 0,
        hitStop: 0.05,
        sound: {
          freq: 84, dur: 0.4, wave: 'sawtooth', vol: 0.16, slide: 34,
          // The medium explosion of the game - a bomber is a fuel tank, and this is it going.
          // Half again the tone and a deal longer than it, closing to 60 Hz so the last third
          // of it is felt rather than heard.
          noise: { share: 0.5, dur: 0.5, cutoff: 1600, sweep: 60 },
        },
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
          // None, for the same reason as the blast above: a field going out is a thing that
          // happens a dozen times a run (`screen`, above). It is the ring running inwards
          // that says it, and that one is painted.
          shake: 0,
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
      // `sides` is the fallback shape; the swarmling is drawn with the ship's own pointed
      // silhouette, its nose pulled out past twice the body (render/entities.js,
      // SWARM_SPIKE), because at seven pixels the point and the colour are the whole of what
      // twenty of them can be told by - and by the fact that they come as a pack.
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
      // twenty of them can go off in the same frame, and the mix adds up how loud a frame is
      // rather than how many voices are in it (audio/mix.js), which makes a quiet one cheap.
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
          // An axis through the eye: the beam hurts both ways along the line it locked,
          // which is what a sniper aiming through itself means (game/beams.js).
          through: true,
          // No trauma: a sniper firing is routine, and the beam is 0.3 s of the loudest
          // thing a body can be shown coming (`screen`, above).
          shake: 0, hitStop: 0.04,
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
      death: { particles: 24, speed: 300, debris: 10, debrisSpeed: 210, shake: 0 },
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
    sound: {
      wave: 'sawtooth', vol: 0.11, slide: 60,
      // Every body that comes apart gets this crump under its note, and this is the one place
      // it is priced. `share` is the hiss as a fraction of the tone it is laid over, which is
      // what lets a kind that priced its own death down price the noise down with it - a
      // swarmling's 0.045 note gets a 0.022 crump, and twenty of them in one frame are still
      // a sound and not a wall (audio/mix.js).
      //
      // The sweep closes (`cutoff` above `sweep`): a crack that settles into a rumble, which
      // is the shape of a thing coming apart and the shape an oscillator could not make
      // however it slid (audio/noise.js).
      noise: { share: 0.5, dur: 0.16, cutoff: 1500, sweep: 160 },
    },
  },

  enemies: {
    hpScaleWindow: 95, hpScaleMax: 1.6,
    speedScaleWindow: 190, speedScaleMax: 0.5,
    // The wall over the *whole* of a body's speed multiplier - the schedule's ramp above and the
    // endless clock's growth (game/endless.js) both push against this one number and neither gets
    // past it. It sits here rather than in the endless row because it is a rule about bodies and not
    // about endless mode: nothing may walk faster than about twice its kind's own pace, because a
    // body the ship cannot outrun and cannot stop is a countdown and not a fight. Held above
    // `1 + speedScaleMax` by a test, so the wall cannot eat the schedule's own growth, and argued
    // against the fastest kind in the game in test/endless-growth.test.mjs.
    speedScaleCeil: 1.9,
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

  // The bosses (PLAN 3.4).
  //
  // Two halves live here. `schedule` and its neighbours are the *framework's*: when a boss
  // comes, how the warning runs, where a phase opens, and what a phase change does to the
  // room. They are written once and they apply to every boss, whoever it turns out to be
  // (game/bosses.js). Then one row per boss, which is its body and its phases.
  //
  // The schedule is the run's spine: one entry per boss, in the order they arrive. PLAN's
  // The Eclipse joins the list with its own row, so all three of PLAN's marks are spent.
  // `test/bosses.test.mjs` holds the list in the order it is played and every entry pointing
  // at a row that exists, which is the one way a schedule could lie.
  bosses: {
    schedule: [{ at: 300, boss: 'warden' }, { at: 600, boss: 'hive' }, { at: 900, boss: 'eclipse' }],

    // The warning, before the cage closes: the siren, the name on the glass, and a shudder
    // in the frame. Long enough to read and to let go of whatever you were doing, short
    // enough that nobody ever waits on a boss to show up. The wave director holds from the
    // moment the warning starts, so the last of the crowd is on its way and the arena is
    // quieting down while it plays.
    warn: { time: 2.6, shake: 3, sound: { freq: 92, dur: 1.3, wave: 'sawtooth', vol: 0.1, slide: 200 } },

    // PLAN 3.4's three phases, as hull shares: the nth phase opens when the boss's hull
    // falls to the nth number. A boss has one phase row per entry here, and
    // `test/bosses.test.mjs` holds the two tables the same length, so a phase can never be
    // scheduled without being written.
    atHull: [1, 0.66, 0.33],

    // PLAN 3.4's other rule, as a number instead of a sentence: nothing a boss does may
    // land less than this far after it was shown. Every phase of every boss is held to it.
    telegraphMin: 0.6,

    // What a phase change is. The boss flares, sheds whatever was holding it in its last
    // shape, and cannot be hurt for the moment that takes - which is why the moment is a
    // beat and not a flicker: the run stops paying damage, the boss stops attacking, and
    // both of them start again on the other side of it. Loud on purpose, because this is
    // the sentence that says the fight has changed gear.
    phaseBreak: {
      time: 1.1,
      ring: { radius: 30, speed: 760, life: 0.55 },
      burst: { count: 44, speed: 520, life: 0.6 },
      shake: 9,
      hitStop: 0.07,
      sound: { freq: 84, dur: 1, wave: 'sawtooth', vol: 0.12, slide: 260 },
    },

    // The darkening (PLAN 3.4's Eclipse, phase 2: "the arena darkens, and only areas near the
    // player and near bullets are lit"). One row belongs to the framework and one to the boss:
    // a *phase* may ask for the night (`dark: { level }` on the phase row, game/bosses.js
    // `darknessAsked`) and the framework owns both the ramp and what makes light. Nothing a boss
    // has to put back: the room is on its way to whatever the phase standing in it asked for, and
    // to nothing at all the moment no fight is standing in it - so there is no reset to forget and
    // a run that dies mid-darkness, or wins mid-darkness, is not left in a room it was never put
    // back in.
    //
    // It is paint and nothing else. `world.darkness` is stepped with the fight and read by
    // render/darkness.js and by nobody in game/, which is what lets a fight take the room away
    // without moving one pixel of the simulation - every fingerprint of every run is unchanged by
    // this row existing.
    //
    // `rise` and `fall` are shares of the ask per second, so 0.45 is two seconds of night rolling
    // in from a bright room and 0.8 is little over a second to let go of it. Asymmetric because
    // the two moments are not the same: the coming is the sentence "the fight has changed gear",
    // and it arrives *through* the phase flare rather than after it; the going is the reward for
    // having won, and a room that brightens instantly throws the reward away.
    //
    // What is in `light`, and how each number was picked without a screen to look at:
    //   ship    how far the ship's own light reaches, in px of arena. The one number that decides
    //           whether this is a fair fight: a body that walks has to be seen in time to be
    //           dodged, and the fastest thing that walks is the swarmling - 190 px/s, and 285 once
    //           the run's clock has finished speeding the crowd up, which is where a fifteen-minute
    //           fight is being held. 300 px is over a second of its walking, and more than
    //           `telegraphMin`, which is the floor every promise in this game is held to. It is not
    //           bigger, because the point of the row is that the room is gone: at 300 you can see
    //           your own corner of the eclipse and not the eclipse's.
    //   shot    the same question for the enemy's shot, which is what this fight is mostly made
    //           of. Every shot in the room carries its own light, so a shell is a ring of lights
    //           coming and not a rumour, at any distance. It is bigger than a bullet's because a
    //           shot is what you are being asked to look for.
    //   bullet  the run's own shots. Small: they are the ship's, they are already going where it
    //           is looking, and at a level-50 gun there are a great many of them.
    //   body    a fight's own body, as a share of its reach. The sun is the brightest thing in
    //           the room it is darkening and it must never be lost in its own night - the rim is
    //           the countdown and the corona is where the drag is drawn.
    //   door    how much of the night the door of a shell takes off. It is a share and not a
    //           radius because a door is already the shape of a light (render/entities.js draws
    //           it as one): what the night does to it is stop covering it up, and a little of the
    //           night is left in it so the shaft stays a lit place in a dark room instead of a
    //           second arena.
    //   blade   the same ask for the two things the Eclipse promises that are not bodies or shots:
    //           the fan of a sweep while it is being shown and the blade it lets go of afterwards
    //           (game/arms.js). It is a share for the same reason the door's is, and it is not
    //           quite 1 because a blade wants to stay a *place* in the night rather than a hole in
    //           it - but it has to be high, because a promise the dark has eaten is no promise and
    //           `telegraphMin` does not care how dark the room is.
    dark: {
      rise: 0.45,
      fall: 0.8,
      light: { ship: 300, shot: 86, bullet: 58, body: 2.4, door: 0.82, blade: 0.86 },
    },

    // The sounds of the fight itself, whoever the boss is: the siren that opens the
    // warning, the chord of the cage closing round the duel, and the chord of a boss going
    // down - which is the biggest sound in the game, because it is the biggest thing that
    // can happen to a run.
    sound: {
      arrive: { notes: [98, 147, 196, 294], dur: 1.2, wave: 'triangle', vol: 0.15 },
      down: {
        notes: [523, 659, 784, 1046], dur: 1.6, wave: 'triangle', vol: 0.16,
        // The large explosion: a whole framework coming down under the chord above it, and
        // the longest noise voice in the game - thirteen tenths of it, closing to the bottom
        // of the band as it goes (audio/noise.js).
        noise: { share: 0.6, dur: 1.3, cutoff: 900, sweep: 40 },
      },
    },

    // How long the arena stays quiet after a boss goes down, before the wave director is
    // allowed to send anything again. The shards it dropped are still on the floor and the
    // run is meant to go and get them, not to be chased the moment its reward is over.
    resume: 3,

    // The cage (PLAN 3.4's arena lock). A boss fight has a room: the walls close in round
    // the ship and the duel cannot be run away from.
    //
    // `w` and `h` are what the room is made of and `beyond` is the floor under them: the room is
    // always at least this much bigger than the window, so a duel is never a phone booth and the
    // wall that is about to stop you is never something you have already walked past. It is
    // deliberately not small enough to see all of at once - the edges come onto the glass as you
    // go at them, exactly as the arena's own walls do, and you are never further from one than
    // this. `inset` is how far from the arena's own wall the room may sit (a room that overlaps
    // the wall it is meant to be inside is a boss standing in a wall), and `open` is how long the
    // frame takes to fade the walls in, which is why the cage arrives with the boss and not
    // before it.
    cage: { w: 1560, h: 1040, beyond: 150, inset: 40, open: 0.45 },

    // The Warden (PLAN 3.4's 5:00): a large ring-shaped ship. It turns, stops dead, shows
    // its spokes, and fires down them - the same grammar a darter uses to tell you it is
    // about to commit, at four times the size and with the whole room to sweep.
    //
    // It does not walk. `radius` is the body the ring is hurt by and drawn at both, and it
    // is 60 px and not 90 for one reason: the collision broad phase queries with the widest
    // body standing in the arena (game/enemies.js), and every shot in the game pays that
    // number whether a boss is in the arena or not.
    //
    // `hull` is 127 seconds of the plain pulse gun's damage (weapons.pulse, undaugmented and
    // hitting everything it fires) - about a minute of a run that has bought some of its
    // damage by the five-minute mark, and about two of one that has bought none. `score`
    // and `drop` are what `killEnemy` pays out like any other body; `reward` is what the
    // framework adds on top of that for being a boss (game/bosses.js).
    warden: {
      name: 'THE WARDEN',
      blurb: 'a ring that turns, stops, and fires down its spokes',
      // Which beat-machine the framework runs for it (game/bosses.js `RHYTHMS`): ride by
      // turning on the spot, then spokes, bullet rings and calls of bodies in between.
      rhythm: 'ring',
      radius: 60,
      hull: 560,
      speed: 0,
      cost: 40,
      score: 1500,
      drop: 26,
      color: PALETTE.amber,
      fill: PALETTE.amberFill,
      glow: 70,
      sides: 8,
      rooted: true,
      reward: { hull: 1 },
      death: {
        particles: 90, speed: 620, debris: 40, debrisSpeed: 380,
        ringSpeed: 900, ringScale: 2.2, shake: 14, hitStop: 0.12,
      },
      sound: { freq: 70, dur: 0.7, vol: 0.16 },
      // Where it arrives: at least `gap` px of standing room from the ship, inside the room
      // that is closing at the same moment (game/bosses.js `arrive`). `gap` sits under half
      // the cage's short side by more than its own radius, which is what lets the arrival
      // keep its promise wherever the cage ended up: a direction with no room in it is
      // tried again rather than folded back onto the ship's nose.
      arrival: {
        gap: 380,
        ring: { radius: 40, speed: 900, life: 0.5 },
        burst: { count: 50, speed: 560, life: 0.7 },
        shake: 10,
        hitStop: 0.06,
      },
      // The ring, and what it does with it. One row per phase, opening at
      // `bosses.atHull`: more spokes, a faster turn, a shorter patience and a shorter
      // telegraph each time, so the same attack gets tighter as the ring comes apart. The
      // tint is the phase the player is looking at, and the hull bar wears it.
      //
      // `turn` is how fast the ring rides between volleys, rad/s; `wait` how long it rides
      // before taking aim again; `windup` how long it stands still with the spokes drawn
      // before they fire (never less than `bosses.telegraphMin`, and the lines drawn are
      // exactly the lines that hurt); `spokes` how many rays of light leave, evenly spaced
      // round the ring, which is how many gaps there are to stand in.
      //
      // `beam` is one spoke as game/beams.js understands a beam, and `through` is the one
      // field of its own: false, because a spoke is a ray out of the ring and not a line
      // across the arena, which is what leaves the far side of the ring a place to be.
      // The flare, the shudder and the noise of a whole volley are `volley`'s, not the
      // beam's, because a volley is the event - eight spokes going off in the same step is
      // one thing happening and not eight, and eight full flares would be a white hole in
      // the middle of the room.
      //
      // A phase that has a `bullets` row throws a second beat as well: an expanding ring of
      // shots with a door in it (PLAN 3.4's phase 2). The two beats take turns - spokes, ring,
      // spokes, ring - so the fight keeps one rhythm and grows a second thing to read inside
      // it. `count` shots are spread evenly over everything except a wedge `gap` radians each
      // side of the door's bearing, and that bearing is taken from where the ship was standing
      // when the wind-up began and then held: the ask is "get into the door the ring is
      // showing you", not "do not move". `windup` is how long the door is shown for and is
      // held to `bosses.telegraphMin` like every other promise.
      //
      // `shot.life` is longer than the ring's own reach on purpose - what stops these shots is
      // the cage and not an expiry (game/enemyshots.js, `caged`), and a ring that faded out
      // before it met a wall would leave the far side of the room free for nothing. They wear
      // the phase's own `tint` rather than a colour of their own, so the bar, the spokes, the
      // flare and the shots are all the same sentence: this is how far into the fight you are.
      //
      // A phase with a `call` row sends bodies out of its own hoop as well (PLAN 3.4's phase 3,
      // "spins faster and summons Darters"): `count` of them, `step` radians apart, `gap` px
      // clear of the rim so a body is born outside the thing that hurts you and not inside it,
      // fanned across the half of the hoop turned away from the ship. The fan is centred on the
      // bearing taken when the wind-up starts and then held, exactly like the door, and the marks
      // on the rim are the bearings the bodies come out of, edge for edge.
      //
      // A call is made when nothing is left of the last one standing and not otherwise: a second
      // pack thrown over one that is still hunting the ship is not a boss being clever, it is a
      // boss ignoring its own room (game/bosses.js `takeBeat`). Nothing in it is a roll, so a run
      // of one seed calls its darters to the same bearings and to the same side of the ring.
      phases: [
        {
          spokes: 4, turn: 0.55, wait: 2.5, windup: 0.95, tint: PALETTE.amber,
          sound: { freq: 240, dur: 0.6, wave: 'sawtooth', vol: 0.03, slide: 520 },
          volley: {
            shake: 8,
            ring: { radius: 34, speed: 620, life: 0.4 },
            sound: { freq: 1300, dur: 0.3, wave: 'square', vol: 0.1, slide: 70 },
          },
          beam: {
            halfWidth: 17, time: 0.26, damage: 5, through: false, shove: 250,
            shake: 1, hitStop: 0.02,
            flare: { count: 9, speed: 380, life: 0.26 },
            cut: { count: 4, speed: 250, life: 0.22, spread: 0.5 },
            sound: { freq: 1400, dur: 0.26, wave: 'square', vol: 0.03, slide: 70 },
          },
        },
        {
          spokes: 6, turn: 0.75, wait: 2.1, windup: 0.82, tint: PALETTE.orange,
          sound: { freq: 280, dur: 0.5, wave: 'sawtooth', vol: 0.032, slide: 620 },
          volley: {
            shake: 9,
            ring: { radius: 34, speed: 700, life: 0.36 },
            sound: { freq: 1450, dur: 0.28, wave: 'square', vol: 0.1, slide: 70 },
          },
          beam: {
            halfWidth: 16, time: 0.24, damage: 5, through: false, shove: 250,
            shake: 1, hitStop: 0.02,
            flare: { count: 8, speed: 380, life: 0.24 },
            cut: { count: 4, speed: 250, life: 0.22, spread: 0.5 },
            sound: { freq: 1550, dur: 0.24, wave: 'square', vol: 0.03, slide: 70 },
          },
          bullets: {
            count: 22, gap: 0.62, windup: 0.9,
            shot: { speed: 190, radius: 7, life: 6, caged: true },
            wind: { sound: { freq: 170, dur: 0.8, wave: 'triangle', vol: 0.05, slide: 640 } },
            fire: {
              shake: 7,
              ring: { radius: 46, speed: 560, life: 0.45 },
              sound: { freq: 430, dur: 0.3, wave: 'sawtooth', vol: 0.09, slide: 90 },
            },
          },
        },
        {
          spokes: 8, turn: 0.95, wait: 1.8, windup: 0.7, tint: PALETTE.red,
          sound: { freq: 330, dur: 0.42, wave: 'sawtooth', vol: 0.034, slide: 720 },
          volley: {
            shake: 10,
            ring: { radius: 34, speed: 780, life: 0.32 },
            sound: { freq: 1600, dur: 0.26, wave: 'square', vol: 0.1, slide: 70 },
          },
          beam: {
            halfWidth: 15, time: 0.22, damage: 5, through: false, shove: 250,
            shake: 1, hitStop: 0.02,
            flare: { count: 7, speed: 380, life: 0.22 },
            cut: { count: 4, speed: 250, life: 0.2, spread: 0.5 },
            sound: { freq: 1700, dur: 0.22, wave: 'square', vol: 0.03, slide: 70 },
          },
          bullets: {
            count: 26, gap: 0.5, windup: 0.72,
            shot: { speed: 215, radius: 7, life: 6, caged: true },
            wind: { sound: { freq: 190, dur: 0.65, wave: 'triangle', vol: 0.055, slide: 700 } },
            fire: {
              shake: 8,
              ring: { radius: 46, speed: 660, life: 0.4 },
              sound: { freq: 520, dur: 0.28, wave: 'sawtooth', vol: 0.1, slide: 90 },
            },
          },
          // The third beat, and the one thing phase 3 has that phase 2 does not. Three darters,
          // a degree or so apart either side of the bearing the ring is turned away on, thrown out
          // of the hoop at the far side from the ship so that every one of them has to come all
          // the way round to reach you - the fight is a room with a gun in the middle of it and
          // these are the bodies that make you leave the corner you are hiding in. `windup` is how
          // long the three marks are lit on the rim for, and is held to `bosses.telegraphMin`.
          //
          // They are the crowd's own darter and nothing about them is special (game/bosses.js
          // `sendCall` builds them with the same `makeEnemy` the wave director uses, at the same
          // hull the clock has brought them to), which is the point: a summon that was a new kind
          // of body would be a third thing to learn on top of the two the ring already teaches.
          call: {
            type: 'darter', count: 3, step: 0.95, gap: 26, windup: 0.9,
            wind: { sound: { freq: 300, dur: 0.75, wave: 'square', vol: 0.038, slide: 900 } },
            fire: {
              shake: 6,
              ring: { radius: 40, speed: 520, life: 0.42 },
              spark: { count: 12, speed: 340, life: 0.32 },
              impulse: 260,
              sound: { freq: 640, dur: 0.24, wave: 'square', vol: 0.09, slide: 260 },
            },
            // And how it ends, when the ring goes down: each body still standing comes apart in a
            // jet along its own nose (game/bosses.js `dismissCall`) and the whole pack is one chord
            // rather than one per body, because they are one event - the ring letting go.
            dismiss: {
              spark: { count: 14, speed: 360, life: 0.34, spread: 0.7 },
              sound: { notes: [392, 262], dur: 0.5, wave: 'triangle', vol: 0.07 },
            },
          },
        },
      ],
    },

    // The Hive (PLAN 3.4's 10:00): a hex-celled mass with a core in the middle of it. It has
    // no spokes and no door - it *breeds*. Everything it sends comes out of a cell, and the
    // cells are bodies of the crowd themselves, which is the second boss teaching the thing
    // the first one only hints at: a fight can have parts, and you can shoot them off.
    //
    // It is the second boss, so it is the one that said how much of game/bosses.js was
    // Warden-shaped. Four things came out of writing it: a row now names its `rhythm` (the
    // framework owns the clock of a beat - ride, stop, show it, do it - and the row says which
    // beats it has), a boss may *walk* (the Warden's whole attack is a ring that turns on the
    // spot, so the walk was hard-coded to nothing but turning), a boss may own bodies
    // (`cells` below, which go down with it on the same rule its summons already did), and its
    // third phase asked for a fourth: a fight may be made of more than one body (`split` below,
    // and game/bosses.js `newCore`).
    //
    // `radius` is the core and nothing else. The mass reaches further than that, but the core
    // is the body the collision world is built round and the widest body in the arena prices
    // every collision query in the game (game/enemies.js) - so the mass is wide with its
    // *cells*, at 26 px each, and the fattest thing in the arena stays 30 px.
    //
    // `hull` is 173 seconds of the plain pulse gun, i.e. the same bare-gun length as the
    // Warden and no more: what is different at ten minutes is that the run has had twice as
    // long to buy damage, and that this bar can be paid down by breaking the mass as much as
    // by hitting the middle of it (see `cells.share`). `score` and `drop` are what `killEnemy`
    // pays out like any other body; `reward` is what the framework adds on top for being a
    // boss (game/bosses.js).
    hive: {
      name: 'THE HIVE',
      blurb: 'a mass of cells that breeds swarms and can be broken apart',
      // Which beat-machine the framework runs for this boss (game/bosses.js `RHYTHMS`). The
      // Warden's is `ring`: ride, stop dead, show the spokes, fire them. The Hive's is `mass`:
      // drift in, stop dead, light a cell, let it out. Same grammar of a promise kept still -
      // a different thing being promised.
      rhythm: 'mass',
      radius: 30,
      hull: 760,
      // The pace the mass drifts at, and the band it wants to stand in. Both written out and
      // not left to the run's clock, for the same reason the hull is (game/bosses.js `arrive`):
      // a boss's own pace is the fight's pace, and the crowd's speed scaling is a thing that
      // happens to a wave. It keeps its distance because everything it sends is faster than it
      // is: a hive that walks into your face has nothing left to do.
      //
      // `park` is how near the place it was asked for a body counts as having arrived, and it is
      // what stops a mass that has got there from shuffling on the spot: the ask is a point and
      // not a direction, so without a deadband it would have an opinion about every pixel.
      speed: 44,
      approach: { near: 290, far: 400, park: 14 },
      cost: 40,
      score: 2600,
      drop: 32,
      color: PALETTE.hiveCell,
      fill: PALETTE.hiveCellFill,
      glow: 60,
      sides: 6,
      reward: { hull: 1 },
      death: {
        particles: 96, speed: 640, debris: 44, debrisSpeed: 400,
        ringSpeed: 940, ringScale: 2.4, shake: 15, hitStop: 0.12,
      },
      sound: { freq: 62, dur: 0.8, vol: 0.16 },
      // Where it arrives: `gap` px of standing room from the ship, inside the room that is
      // closing at the same moment. It is the Warden's number and then the mass's own reach on
      // top, because the whole of the honeycomb arrives, not just the core it is measured from.
      arrival: {
        gap: 420,
        ring: { radius: 40, speed: 900, life: 0.5 },
        burst: { count: 54, speed: 560, life: 0.7 },
        shake: 11,
        hitStop: 0.06,
      },
      // The cells: `count` of them, `ring` px out from the core, equally spaced, and rooted to
      // their places (game/kinds.js `isRooted`), so the mass holds its shape and a body that
      // walks into the honeycomb is the one that moves.
      //
      // Breaking one is worth three things at once, and that is the whole of the first phase:
      // a `share` of the hull goes down with it (the bar *is* the mass, and every point of it
      // is a cell somebody can shoot), it is one fewer mouth the brood can come out of, and it
      // is worth its own score and its own shards like any other body in the arena. Its `hull`
      // is small on purpose and is scaled by the run's clock like any other body's: about 29
      // by the time it arrives, which is a commitment to shoot and not a second boss.
      //
      // It is deliberately not in `BALANCE.kinds`: that table is the wave director's menu and
      // the director has no business rolling a cell for a wave, and `test/kinds.test.mjs`
      // holds the two kind tables the same set for exactly that reason. It is handed to
      // `makeEnemy` through `opts.kind`, which is the door a boss already walks through.
      cells: {
        count: 6, ring: 50, radius: 26, hull: 11, share: 0.05,
        speed: 0, cost: 5, score: 55, drop: 3,
        color: PALETTE.hiveCell, fill: PALETTE.hiveCellFill, sides: 6, glow: 18,
        rooted: true,
        death: { particles: 14, speed: 260, debris: 6, debrisSpeed: 170 },
        sound: { freq: 150, dur: 0.2, vol: 0.05 },
        // And how it ends when the hive goes down with cells still standing: they were the
        // fight's bodies and not the arena's, so they come apart with it - unpaid, in one
        // chord for the whole mass (game/bosses.js `breakMass`, the rule the Warden's
        // summons already live by).
        fall: {
          spark: { count: 12, speed: 300, life: 0.3, spread: 0.8 },
          sound: { notes: [330, 220], dur: 0.55, wave: 'triangle', vol: 0.07 },
        },
      },
      //
      // The rate the brood arrive at is the difficulty of this boss, and it is written as a rate
      // rather than as a count: a period of `wait` plus `windup`, and `share` x `each` bodies in
      // it. Phase 1 is four bodies every six and a half seconds, which is about what the crowd is
      // sending at ten minutes and no more - the hive *replaces* the wave rather than adding to
      // it, and a run that has also been handed a wall to walk round dies otherwise. What keeps it
      // from getting worse as the fight goes on is that `share` is a share of the mass that is
      // still *standing*: the swarm shrinks as the bar does, and a run that broke the honeycomb
      // early is fighting a sad handful of bees by the last phase - which is also why the third
      // phase, which grows the hive back to nine cells, is allowed to be the busiest of the three.
      //
      // One row per phase, opening at `bosses.atHull`, as they are for the Warden. The tints
      // get hotter as the mass comes apart - honey, then embers, then red - which is the same
      // sentence the Warden's wear, and the name on the bar is what says which boss it is.
      //
      // `spin` is how fast the whole mass turns between openings, rad/s, and `wait` how long
      // it drifts before it takes the next one. The turn belongs to the rhythm and not to the
      // walk for the same reason the Warden's belongs to its ring: the cells that light are
      // *placed* by it, so the mass that fires has to be standing where the mass that lit was.
      //
      // `spawn` is the one beat: `share` of the cells that are still standing light up, and
      // then each of them lets out `each` bodies, `step` radians apart, out of the side of the
      // cell that faces away from the core and `gap` px clear of it. `share` is a share of the
      // *living* mass and not of the six it arrived with, which is the whole of the reason to
      // shoot the cells: break the honeycomb and the swarms thin out with it, on the same beat
      // that takes the bar down. `windup` is how long the cells are lit for and is held to
      // `bosses.telegraphMin` like every other promise here.
      //
      // The brood are one pack per cell that opened (game/flock.js), so what comes out of one
      // mouth bunches, commits and dives as one thing - which is what the kind is, and what
      // makes six bodies one threat to read instead of six.
      phases: [
        {
          tint: PALETTE.amber,
          spin: 0.24, wait: 5.4,
          spawn: {
            type: 'swarmling', share: 0.34, each: 2, windup: 1.05,
            gap: 12, step: 0.5, impulse: 210,
            wind: { sound: { freq: 200, dur: 0.85, wave: 'triangle', vol: 0.05, slide: 520 } },
            fire: {
              shake: 5,
              ring: { radius: 34, speed: 480, life: 0.4 },
              spark: { count: 10, speed: 300, life: 0.3 },
              sound: { freq: 520, dur: 0.26, wave: 'sawtooth', vol: 0.08, slide: 120 },
            },
          },
        },
        {
          tint: PALETTE.ember,
          spin: 0.32, wait: 4.2,
          spawn: {
            type: 'swarmling', share: 0.5, each: 2, windup: 0.9,
            gap: 12, step: 0.42, impulse: 230,
            wind: { sound: { freq: 240, dur: 0.75, wave: 'triangle', vol: 0.055, slide: 600 } },
            fire: {
              shake: 6,
              ring: { radius: 36, speed: 540, life: 0.38 },
              spark: { count: 12, speed: 320, life: 0.3 },
              sound: { freq: 600, dur: 0.24, wave: 'sawtooth', vol: 0.085, slide: 130 },
            },
          },
        },
        {
          // PLAN 3.4's last line for the Hive, and the one thing it does that no boss here has
          // done: it stops being one body. At a third of the bar the mass pulls itself apart and
          // three smaller hives are standing where it was, each with a honeycomb of its own and
          // each breathing brood on its own clock.
          //
          // It is a phase and not three bosses because of the bar. The three pieces share the
          // hull the fight has left and their maximums add back up to the one it started with, so
          // the share on the glass is the same in the frame after the split as in the frame
          // before it (game/bosses.js `spendSplit`) - which is what lets one hull bar be one
          // fight that happens to be standing in three places, and what stops a run being told
          // by the numbers that the fight it has been having for four minutes just restarted.
          //
          // There is no `spawn` row here, because there is nothing left to spawn: the body that
          // owned this phase's mouths is the body that just came apart. The fragments read
          // `split.spawn` instead, and that row is why the brood do not triple - three hives each
          // breeding at the phase-2 rate would be three hives too many. What a fragment's mouth
          // spends is therefore measured against the whole one: three mouths light instead of
          // three (one of each fragment's three cells, the same share of the mass that is standing)
          // and each lets out the same two bodies the full-sized phase did, so the beat is a
          // little shorter than phase 2's and the same brood arrive out of three places instead of
          // one. Phase 3 is the busiest of the three, and it is busiest by being everywhere at once.
          tint: PALETTE.red,
          spin: 0.42, wait: 3.6,
          split: {
            // `cores` bodies, stood that many ways round the ship: one of them on the bearing the
            // hive was already holding, so the split reads as the mass breaking and not as three
            // new arrivals walking in. A fragment is told that side of the ship to keep and keeps
            // it as the ship runs, which is the difference between three hives and a swarm.
            cores: 3,
            // The body: a patch over the hive's own row, so everything it does not name - the
            // colours, the sound of it, the shape of its corpse - is the hive's and there is one
            // place in the file where those live. `hull` is not here: the pieces divide the hull
            // the fight has left between them, which is the bar's business and not a row's.
            //
            // `rooted` is the Warden's own answer to a problem the fragments have and the hive it
            // came from does not: a body that has been told *which side of the ship to keep* has
            // made a directional promise, and the crowd leans on a boss all run long. Measured -
            // one swarmling, seven pixels of it, diving into a fragment at 190 px/s - the pair each
            // give way half of every overlap (game/enemies.js `separationPush`) and the bee wins by
            // sheer repetition: 345 px of station walked away in four seconds of being leaned on.
            // A hive that walks at a band - which is what the whole one does - only ever has to
            // correct a distance, so a shove is a wobble and nothing more, and it stays free.
            //
            // What `rooted` takes away is the crowd's room-making and nothing else. A fragment is
            // still shoved for real by everything that shoves: a shot's kick, a dash's shoulder, a
            // blast it was standing in (those go through `ix`/`iy`, which `glide` spends whatever a
            // body is bolted down or not), and it walks back to its side afterwards.
            body: {
              radius: 20,
              speed: 58,
              cost: 14,
              score: 820,
              drop: 11,
              rooted: true,
              death: {
                particles: 44, speed: 540, debris: 20, debrisSpeed: 320,
                ringSpeed: 780, ringScale: 1.8, shake: 9, hitStop: 0.07,
              },
              sound: { freq: 78, dur: 0.5, vol: 0.13 },
            },
            // A fragment's cells, patched the same way: three of them, nearer and thinner, and
            // worth a third of what a full-sized cell was worth, because there are nine of them
            // in the room now instead of six and they cannot also be three times as generous.
            cells: { count: 3, ring: 40, radius: 17, hull: 8, share: 0.02, score: 40, drop: 2 },
            // What a fragment's mouths spend. `share` is a share of that fragment's own mass - one
            // mouth of its three lights - and `each` is the same two bodies a full-sized cell lets
            // out, so three fragments opening are one beat and about what phase 2 was sending.
            spawn: {
              type: 'swarmling', share: 0.34, each: 2, windup: 0.95,
              gap: 10, step: 0.42, impulse: 230,
              wind: { sound: { freq: 290, dur: 0.6, wave: 'triangle', vol: 0.06, slide: 700 } },
              fire: {
                shake: 5,
                ring: { radius: 30, speed: 520, life: 0.34 },
                spark: { count: 9, speed: 320, life: 0.28 },
                sound: { freq: 700, dur: 0.22, wave: 'sawtooth', vol: 0.075, slide: 140 },
              },
            },
            // And the coming apart itself. The body's own death is the crowd's (the row's `death`
            // above does the wreck and the burst), so this is only what the *room* gets: the
            // shell going out, the shudder, and a chord that says the fight grew.
            break: {
              ring: { radius: 60, speed: 900, life: 0.55 },
              shake: 12,
              hitStop: 0.09,
              sound: { notes: [147, 110, 82], dur: 0.9, wave: 'sawtooth', vol: 0.14 },
            },
          },
        },
      ],
    },

    // The Eclipse (PLAN 3.4's 15:00): a dark sun. It is the last fight in a run, and the one that
    // takes something away instead of adding something - it pulls. Everything else about it the
    // other two bosses already do: it holds a band the way the hive does, it turns the way the
    // ring does, and its shells are the ring's own beat, thrown with a door in them on your own
    // bearing. What is new is that the middle of the room is now somewhere you are always falling
    // towards, and that every one of those familiar things has to be answered while swimming.
    //
    // THE DRAG, and what its numbers are. `force` is px/s of steady fall: it is spent as a *place*
    // the ship is moved to and not as a force on its velocity, because the ship's velocity is
    // steered back to the controls every step and a push there would be corrected away before it
    // was felt (game/player.js `dragShip`). It is priced in px/s and not as a share of the ship's
    // own speed for one reason: a run that has bought the Move speed line out-swalls the sun, and a
    // run that bought nothing has to buy its way out with a dash. `floor` is how near the middle it
    // will let you get: outside the sun's own body plus the ship's, and the pull stops there -
    // a drag that walked the ship into the thing that hurts it on contact would be the fight
    // paying out damage it never promised, so past the rim the ship is on its own and only ever
    // gets hurt where it let itself be dragged to.
    //
    // The drag is not telegraphed, and it is not a hole in the rule: `telegraphMin` is about an
    // attack, and a pull is not an attack, it is the sun being there. It is shown the way
    // everything else about this boss is - the light of its own corona falling inwards
    // (render/boss.js), from the moment it arrives.
    //
    // SHIPPED, all three phases and all five of its permissions: the drag, the shell, the night,
    // the blades and the walking door. Phase 2 puts the arena under (`dark`, below) and phase 3
    // keeps it there and deeper, because PLAN's phase 3 is "everything from before", and it is the
    // phase that grows the sweeping arms (`sweep`, below) and a shell whose gap moves
    // (`gapWalk`, below) beside its plain ones.
    //
    // PLAN's "bullet walls with moving gaps" is the `gapWalk` row, and it keeps the one rule every
    // promise in this fight keeps: what travels is shown travelling, the whole of the way, before
    // anything is thrown. The wall itself never moves - not one shot of it curves - and the gap is
    // at rest for `gapSettle` seconds before it arrives, so the moving part of a moving gap is the
    // promise and not the harm. That is the same bargain the blades make with their fan
    // (game/arms.js), and it is why both of them are drawn out of one answer in render/.
    eclipse: {
      name: 'THE ECLIPSE',
      blurb: 'a dark sun that drags you in and bursts in every direction',
      // Which beat-machine the framework runs for it (game/bosses.js `RHYTHMS`): `sun` - turn on
      // the spot like the ring, walk to a band like the mass, and spend the turn it is given on a
      // shell. It is the third rhythm because it is the first boss that wants to do all three.
      rhythm: 'sun',
      // 58 px and not bigger, for the reason the Warden's 60 is 60: the collision broad phase
      // queries with the widest body in the arena and every shot in the game pays that number
      // (game/enemies.js). It has no mass to be wide with, so this is the whole of it.
      radius: 58,
      // The same bare-gun length as the other two, and not more: 191 s of a plain pulse gun.
      // A third boss at 15:00 is later in *game* terms and not in bare-gun ones - the run that
      // gets here has had three times as long to buy damage, and what makes this fight hard is
      // not the bar. `score` and `drop` are what `killEnemy` pays; `reward` is the framework's.
      hull: 840,
      // It walks, and slowly. A sun that sat still would be a fixed drainhole you could plan a
      // whole fight round; one that drifts to keep its band can lean you towards a wall, and the
      // drag is what does the leaning. It is slower than the hive on purpose - the drag is its
      // movement, and it does not need to be fast as well.
      speed: 40,
      approach: { near: 320, far: 460, park: 16 },
      cost: 40,
      score: 4000,
      drop: 40,
      color: PALETTE.eclipseRim,
      fill: PALETTE.eclipseRimFill,
      glow: 70,
      sides: 0,          // a disc; the crowd's polygon painter never sees this body anyway
      reward: { hull: 1 },
      death: {
        particles: 110, speed: 700, debris: 48, debrisSpeed: 420,
        ringSpeed: 1000, ringScale: 2.6, shake: 17, hitStop: 0.14,
      },
      sound: { freq: 55, dur: 0.9, vol: 0.17 },
      arrival: {
        gap: 420,
        ring: { radius: 40, speed: 900, life: 0.5 },
        burst: { count: 58, speed: 580, life: 0.75 },
        shake: 12,
        hitStop: 0.06,
      },
      // One row per phase, opening at `bosses.atHull`, as they are for the other two.
      //
      // `turn` is how fast the whole body rides between shells, rad/s; `wait` how long it rides
      // before taking the next one; `bullets` is the shell - `count` shots thrown out of the rim,
      // evenly over every bearing except the wedge `gap` radians each side of the door, which is
      // opened on the ship's own bearing and then held exactly as the Warden's ring opens its door
      // (game/bosses.js `windRing`): the ask is "stay in the door you were shown", and the drag is
      // what makes staying anywhere a cost. `tint` is the phase the player is looking at, and the
      // bar wears it.
      //
      // There is no `spokes` row anywhere in here, and that is the difference between this fight
      // and the Warden's rather than an oversight: a sun has no hoop to draw rays across, so its
      // one beat is the shell and it takes it every turn (game/bosses.js `alternateBeats`).
      phases: [
        {
          tint: PALETTE.eclipseRim,
          turn: 0.3, wait: 2.6,
          pull: { force: 130, floor: 92 },
          bullets: {
            count: 18, gap: 0.7, windup: 0.95,
            shot: { speed: 200, radius: 8, life: 6, caged: true },
            wind: { sound: { freq: 150, dur: 0.85, wave: 'triangle', vol: 0.05, slide: 560 } },
            fire: {
              shake: 7,
              ring: { radius: 52, speed: 520, life: 0.45 },
              sound: { freq: 380, dur: 0.32, wave: 'sawtooth', vol: 0.09, slide: 80 },
            },
          },
        },
        {
          // PLAN's phase 2, and the sentence of it that is not a shot: the room goes dark and what
          // is left is what the ship, the shots and the sun itself are lit by. `level` is how deep
          // the night is - the share of the room it covers - and the framework ramps to it over
          // `bosses.dark.rise`, which is two seconds and about the length of the flare that opens
          // the phase, so the darkening *is* the phase change and not something that happens after
          // it (game/bosses.js `darknessAsked`).
          tint: PALETTE.magenta,
          turn: 0.46, wait: 2.2,
          pull: { force: 180, floor: 92 },
          dark: { level: 0.78 },
          bullets: {
            count: 24, gap: 0.58, windup: 0.85,
            shot: { speed: 225, radius: 8, life: 6, caged: true },
            wind: { sound: { freq: 170, dur: 0.75, wave: 'triangle', vol: 0.055, slide: 640 } },
            fire: {
              shake: 8,
              ring: { radius: 56, speed: 600, life: 0.42 },
              sound: { freq: 450, dur: 0.3, wave: 'sawtooth', vol: 0.095, slide: 80 },
            },
          },
        },
        {
          // The last phase of the last fight: the drag at 230 px/s, which is more than most of the
          // ship rows can out-swim and about what the Wisp can crawl out of, so the answer to the
          // end of this fight is a dash and a bearing rather than a straight line away. The shells
          // are the ring's own beat again, and everything from before is here as PLAN asks - the
          // same two beats, priced as hard as they will go.
          //
          // The night stays, and deepens: 0.86 leaves a seventh of the room showing, which is the
          // difference between a dark arena and an almost-gone one. The drag is at 230 px/s here
          // and the shells are at their fastest, and being able to see neither where the sun is nor
          // where the wall is while both of those are true is the end of the game.
          //
          // This is the only phase of the only boss with two beats to alternate (game/bosses.js
          // `beatsOf`): a shell, then a sweep, then a shell, on the one ride the rhythm keeps. It is
          // why the ride is the longest of the three phases' even though everything in it is priced
          // the hardest - a ship needs the standing room to spend between a door it has to stand in
          // and a fan it has to leave, and the drag is what makes spending it cost something.
          tint: PALETTE.pink,
          turn: 0.66, wait: 1.85,
          pull: { force: 230, floor: 92 },
          dark: { level: 0.86 },
          // PLAN's moving gap, and the last new thing the game asks of you. The door is opened on
          // your own bearing as ever - so a ship that does nothing is shown a door it is standing
          // in - and then it walks `gapWalk` radians away from you over the wind-up and stands
          // still for `gapSettle` before the shell comes round the corner it stopped at.
          //
          // The whole of the route is on the glass from the first frame of the wind-up, which is
          // what makes the walk's own pace free: you are not chasing a thing you have to keep your
          // eye on, you are reading a place that is drawn end to end and going to its far end
          // (render/entities.js `doorWedge`). What it costs is written in the same place as every
          // other ask here, against the drag: the wall takes (r - 58) / 250 s to reach a ship at r,
          // so from the moment the door starts walking you have 1.8 s at the near edge of the sun's
          // band and 2.3 s at the far one. The door is 2 * `gap` = 1.0 rad wide and walks 1.2, so
          // 0.7 rad of bearing has to be paid for: 224 px of arc in close, 322 px out at the far
          // edge, which is 127 px/s and 138 px/s of the 320 the best ship has. That is affordable,
          // and it is not free in the one currency this fight charges in - the drag is 230 px/s
          // inwards, so the share of your speed that goes into the door comes off the share that
          // keeps your distance from the sun, and chasing a door across the room means falling
          // while you do it.
          //
          // It alternates: every other shell walks the other way (game/bosses.js `walkOf`),
          // which is a rhythm and not a roll, and only this phase has it. The two phases before are
          // the plain held door, so the fight teaches its own ending.
          bullets: {
            count: 30, gap: 0.5, windup: 0.72,
            gapWalk: 1.2, gapSettle: 0.26,
            shot: { speed: 250, radius: 8, life: 6, caged: true },
            wind: { sound: { freq: 200, dur: 0.62, wave: 'triangle', vol: 0.06, slide: 720 } },
            fire: {
              shake: 9,
              ring: { radius: 60, speed: 680, life: 0.4 },
              sound: { freq: 540, dur: 0.28, wave: 'sawtooth', vol: 0.1, slide: 80 },
            },
          },
          // PLAN's arms, and the last thing the last phase of the last fight in the game does:
          // three blades of light out of the sun's own facing, each one sweeping the fan the frame
          // lit a moment before it came round (game/arms.js, game/bosses.js `showArms`).
          //
          // The row is a *fan* and not a line, and that is the whole of its fairness: a hazard that
          // travels has to show the whole of the way it travels, or the only honest question left in
          // it is "be somewhere else", which is not a question anybody can answer in 0.85 s.
          //
          // `arms` and `arc` together decide whether leaving the fan is a question that can be
          // answered at all. Three blades stand 2.09 rad apart and each sweeps 0.9 rad, so 2.7 rad of
          // the sun's 6.28 is being swept at any moment and 3.6 rad of it - more than half the sky -
          // never is. There is always a place the blades never enter; what the fight charges for
          // finding it is the drag.
          //
          // `rate` is what the dodge costs, and it is worth writing down what it costs at each of the
          // two places a ship stands. At the near edge of the band the sun holds (320 px) a blade's
          // edge goes 256 px/s, less than a Wisp's top speed, so in close the answer is to turn with
          // the blades and stay ahead of them. Out at the far edge (460 px) it is 368 px/s, more than
          // the ship has, and the answer is the one the fan was drawn for: be out of it. The drag
          // leans a ship inwards, which is where the blades are the slower, and the sun hurts where it
          // stands, which is the price of the slower one.
          //
          // `reach` is 560 px against a band of 320 to 460, so a blade reaches past where the ship is
          // usually standing and nowhere near the far side of the room the cage has closed round the
          // duel (1560x1040). "Swim out beyond the tips" is always an answer and never an easy one,
          // because it is upstream of the drag. `half` is 20 px: wider than a spoke's 16 or 17, more
          // than three times the ship's own hit radius, so a blade is a thing you leave and not a
          // hair's width you stand on - and it is the one number for both the light and the harm.
          //
          // It costs a hull, and one: `player.hitInvulnerability` is 1.5 s and a blade is across you
          // for a fraction of that, so a sweep that catches you takes a pip and not three.
          sweep: {
            arms: 3, windup: 0.85, arc: 0.9, rate: 0.8, reach: 560, half: 20,
            wind: { sound: { freq: 96, dur: 0.8, wave: 'sawtooth', vol: 0.05, slide: 340 } },
            fire: {
              shake: 10,
              ring: { radius: 64, speed: 760, life: 0.5 },
              sound: { freq: 240, dur: 0.5, wave: 'sawtooth', vol: 0.11, slide: 120 },
            },
          },
        },
      ],
    },
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
    sound: {
      base: 1050, jitter: 12, dur: 0.05, wave: 'sine', vol: 0.05,
      // The note bends up a fifth above wherever it started, and the bend is a *ratio* and not
      // a target hz (`slide` elsewhere in this table) so that a shard at the top of a streak
      // still rises instead of sliding down to the same ceiling: a plain pickup runs 1050 ->
      // 1890 and the top of a streak runs 2100 -> 3780, the same lift an octave up.
      // The jitter is a fifth of the first step of the climb on purpose: it is what stops a pile
      // of shards sounding like one held tone, and any more of it would be heard instead of the
      // climb (a semitone at the base note is 62 Hz, so 12 of jitter is a fifth of a step).
      bend: 1.8,
      // PLAN section 5's "pickups rise in pitch with a streak". `window` is how long a shard
      // has to wait for its neighbour to count as part of the same handful, `step` is how far
      // the note lifts per shard in steps of an octave split `stepsPerOctave` ways, and `max` is
      // how many steps the climb gets - one octave, which is a run you can hear going up and come
      // back down and not a siren. Measured over six bot runs (NOTES session 70): a run that
      // lives past its first minute takes half its loot inside 0.08 s of the last piece, so the
      // window has to be short to be a streak at all - at 0.15 s about three pickups in ten land
      // on the plain note and an eighth reach the top, which is a climb that tracks what the ship
      // is really eating. The runs that died inside their first minute never got past four steps,
      // which is the right answer: they were never in a pile at all.
      streak: { window: 0.15, step: 1, max: 12, stepsPerOctave: 12 },
    },
  },

  // The point vacuum (game/vacuum.js): every `every` points the run has scored, the arena empties
  // itself into the ship for `duration` seconds while the music plays its fanfare over the pattern
  // the run is already under (audio/music.js). The owner's request of 2026-10-10, verbatim: "every
  // 10,000 points scored, every existing point on the screen should auto-stream to the player ship.
  // During this 10 second event, play some excited music". `every` and `duration` are their two
  // numbers, unwritten-by-me on purpose; the four decisions the request left out are below, and
  // every one of them has a test in test/vacuum.test.mjs.
  //
  //   **"On the screen" means in the arena.** The window is a tenth of the world (PLAN section 4),
  //     so a vacuum that only reached the view would leave nine tenths of the loot lying where it
  //     was - and a shard the player never saw is a shard they will swear was there. The whole
  //     arena is the fun answer, and it is the only answer that needs no apology.
  //
  //   **The ten seconds is a window and not a photograph.** Everything lying on the floor when the
  //     well opens is drawn in, and so is everything that drops during them: a kill during the
  //     event is paid out at once, because "the next ten seconds are yours" is the promise and a
  //     shard that landed at second nine and then behaved normally would be a hole in it.
  //
  //   **A shard's own clock keeps running.** Nothing in the arena is more than 3.7 s from the ship
  //     at the speed below, so no shard needs its expiry held back to make it in, and a rule that
  //     stopped shard clocks would only ever be seen by a shard that was on its last tenth of a
  //     second when the well opened. Loot that was already going is still going.
  //
  //   **It is free XP, so it is priced like a card and not like a treat.** A shard is the only XP in
  //     the game and a level is the only way to buy a build (game/progress.js), so a reward of shards
  //     is a reward of ranks - and ATTRACTOR (session 86) is the warning about what that does to a
  //     run. So the whole thing was measured before and after, ten runs of the aware bot over the
  //     full ten minutes, same seeds either side (NOTES session 87):
  //
  //       score median   59,612 → 67,872    (+13.9%)
  //       level median   45.5  → 53        (+16.5%)
  //       kills median   3,246 → 3,589     (+10.5%)
  //       shards median  2,748 → 4,107     (+49.5%)
  //       worst run      9m51s → 10m00s     (the bot stopped dying at all)
  //
  //     That is the number to judge it on: **the whole event is worth about half of a card the run
  //     paid a level for** - the DAMAGE line reads +31.2% of score for five free ranks, and the
  //     vacuum is free every time and reads a fifth of a run's score. It is a rhythm and not a
  //     build, which is what the two rows below are set to keep it.
  vacuum: {
    // Points between two openings of the well - the owner's number, and it lands where they put it.
    // Measured over six bot runs of the aware bot at ten minutes: the median strong run crosses
    // 10,000 points 2m25s in (the weakest of the six not until 7m32s), and after that the well opens
    // once every 60 to 130 s - six or seven openings in a full ten minutes, and one or two for a run
    // that goes down at three. Each one brought in 175 to 340 shards for a bot that stands and
    // fights, which is about three times what it picks up in ten seconds any other time.
    every: 10000,
    // The owner's other number, and the second half of the same sentence. Ten seconds is a little
    // under half the life of the loot on the floor, which is what makes it an event with a shape -
    // the well opens, everything in the world arrives, and then it is over and the fanfare stops
    // with it. Longer and it is simply "the magnet is on now"; shorter and the far half of the arena
    // never lands inside it (see `speed`).
    duration: 10,
    // How hard the well is down: the speed every shard in the arena is carried at, px/s. The arena's
    // own diagonal is 4243 px, so the farthest place in the world is 3.7 s from the ship and the ten
    // seconds is never a race a shard loses - which is the whole reason no shard's expiry is held
    // back (above). Set from the far corner and not from the middle: a shard taken from the far side
    // of a 3000 px arena at 700 px/s arrives with a second to spare, which is a promise kept only on
    // the near half of the floor.
    speed: 1150,
    // How fast a shard's own drift is traded for the well's: this fraction of the gap is *left*
    // standing after one second. It is an exponential, like every other turn in the game, so the
    // shard keeps most of its heading for a tenth of a second and comes in on a curve instead of
    // snapping onto the line and flying along it like a drawn arrow.
    turn: 0.002,
    // The moment the well opens. No trauma of its own - the owner's health rule holds the window
    // still outside the extraordinary (test/shake-policy.test.mjs), and a reward is not
    // extraordinary - and no hit-stop either, which was tried and is written down here so nobody
    // puts it back: a freeze is the language of a thing that just got hit, and this is a thing that
    // is starting. Worse, a freeze between a pause and its resume keeps a control request alive
    // across the pause (main.js only hands a pending dash over on a frame that stepped), so a well
    // opening on the first step after a held run is a dash the player never asked for, three frames
    // late. The whole of the moment is light and sound.
    start: {
      word: 'VACUUM',
      wordLift: 16,          // px over the ship, as level text is (game/endless.js `wordLift`)
      // The mouth of the well, collapsing in: a ring born a long way out and falling to the ship,
      // which is the only honest light for a pull - it says *this much floor* is on its way, and
      // it never claims a wider circle than the one it came from (game/magnetar.js drew the same
      // conclusion for the same reason).
      mouth: { radius: 460, speed: -640, life: 0.7 },
      // ...and the ship, which is where it all ends up.
      flare: { radius: 12, speed: 560, life: 0.55 },
      spark: { count: 26, speed: 300, life: 0.5 },
      // The chord is the moment's own voice and it is on the effect bus because it has to be heard
      // the same frame the well opens: the sequencer is scheduled up to half a second ahead
      // (audio/music.js) and the fanfare lands whenever it next looks. A C-major arpeggio two
      // octaves down from the win's, in the key the whole soundtrack is in, so the fanfare that
      // follows it is the same thought and not a second argument.
      sound: { notes: [262, 330, 392, 523], dur: 0.5, wave: 'triangle', vol: 0.1 },
    },
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
      // One short tick per turn. Quiet, because a busy pull can turn half a dozen times, and the
      // budget a frame has is spent by loudness and not by count (audio/mix.js).
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
      // second at the top of the line, and a voice is priced by what it adds to the sky, so
      // this one is what the twenty after it have to fit under (audio/mix.js).
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
      // cross forty bodies in a step, and forty notes at this volume in one frame is the shape
      // of a frame the budget was written for (audio/mix.js).
      sound: { freq: 150, dur: 0.28, wave: 'triangle', vol: 0.1, slide: 48 },
      // None: at the top of the line a nova front crosses the arena every second or so,
      // and the window is not moved that often (`screen`, above). The front itself is the
      // thing you watch.
      shake: 0,
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
      //
      // Re-read in session 117 on the dash habit that ships now, which is the first time this line has
      // been measured on an instrument that dashes the way session 114 said a dash should be dashed.
      // Eight seeds at the cap: score median 121,722 with the line out, 116,676 dealt (three ranks
      // taken) and 122,509 for five free - and the damage column **1.034x** for those five free
      // ranks, against **1.015x** for the same batch read on the habit that pressed the dash every
      // cooldown. The line now keeps its own counters to say why (game/overcharge.js's
      // `overchargeLoaded` and `overchargeSpent`): with five ranks handed the gun comes up and is spent
      // **399 times a quarter-hour**, standing loaded for 3.4% of the run's steps - and the habit
      // that dashes at everything gets **419** of them, *more*. So the gain is not that a get-out lets
      // the gun come up more often; it is what the heavy pulls get spent on, from a ship that has just
      // put itself where it wanted to be rather than where the crowd was. That mechanism is inferred
      // from two columns and not measured, and said so here rather than smoothed over; what is
      // measured is that +3.4% of a run's damage is the biggest figure this line has ever read, and
      // still small enough to leave every number on this row exactly where PLAN put it.
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
      // Measured, like everything else here, on a bot that dashes. The instrument is NOTES session
      // 42's: an aware bot given the dash habit, eight seeds of two minutes, and the share of the
      // bodies standing within 250 px of the ship that are walking at a ghost: 110 px takes 6%
      // of that near crowd off a rank-1 ship and 30% off a rank-5 one, where 72 px - the first
      // number, chosen for tidiness - managed 2% and 13%, which is a card that mostly does
      // nothing, and 150 px managed 18% and 44%, which is a card that ends the fight for you.
      //
      // Read that with `node tools/dash-habit.js` in mind, though: it was read with the dash habit
      // that shipped until 0.10.19, which threw the bot *at* the crowd and so dropped its images
      // inside it - the best case bait has ever had. The habit that replaced it in session 114 runs
      // away from the crowd and leaves the images behind a fleeing ship, which is where a chasing
      // crowd actually is, so the reading may well go up rather than down. Either way, if `bait` is
      // ever revisited it is re-read against the shipped habit and not against that one.
      //
      // It is also the number the rank's value depends on, and that is the second half of why it
      // sits here: images are 220/rank px apart, so at 110 the two of the second rank just touch
      // and every rank after it lays the discs out into a line. At 150 they overlap so heavily
      // that the fifth rank buys almost nothing over the first (54% of frames against 66%), which
      // is what `step` above is not allowed to be.
      //
      // And what the deck says, which is the honest half: nothing moves. Ten seeds at the 900 s
      // cap on the instrument that dashes like a person (session 114's habit, `tools/dash-habit.js`),
      // the line dealt and taken against out of the deck: score medians 122,849 out, 116,217 dealt
      // (0.946x) and 122,427 for five free ranks (0.997x), with nine or ten of ten seeds still
      // alive at the cap in every column. The same batch on a bot that never dashes reads 121,613
      // out, 117,744 dealt, and 121,613 free - free and out *identical*, because a bot that never
      // dashes cannot spend a card whose only lever is the dash. None of it is outside the noise of
      // a batch of ten, and none of it is a surprise. Both bots are runners, and a runner's near
      // field is two or three bodies wide: diverting a third of three is nothing.
      // What this card is for is the knot a player dashes *out of*, which no bot in tools/headless
      // has ever been in, so the claim is made where it can be measured instead - the press in
      // test/afterimage.test.mjs: twenty bodies coming up from behind, one dash away from them,
      // and the nearest of them 1.7x further off with five ranks than without. NOTES session 42 is
      // where the two instruments were compared, and session 114 why the dash-habit column had to
      // be re-read at all.
      //
      // Re-read in session 117, which is what that paragraph was waiting for. `tools/ghost-grid.js`
      // is the ruler and the promise: ten seeds of five minutes on the habit that ships, and the
      // share of the walking crowd within 250 px that is pointed at a ghost is **16.5% at rank 1 and
      // 37.0% at rank 5** - up from the 6.4% and 30.2% above, at both ends, for exactly the reason
      // session 114 guessed at: an image left behind a ship that is running away stands in the road
      // the crowd is walking down, and one dropped inside the crowd it dove at stands in front of it.
      // The near field is seven bodies wide and not "two or three" on that instrument, too. `bait`
      // stays at 110 anyway, and the sweep is why: at 72 px the rank ladder reads 7.7% / 19.3% /
      // 19.0% (the third rank takes everything the fifth could), at 90 px 15.9% / 21.4% / 30.2% (a
      // flatter ladder than the shipped one, so the narrower disc buys no slope after all), at 110 px
      // 16.5% / 35.7% / 37.0%, and at 130 px 19.9% / 45.2% / 51.1% - over the ceiling, and the crowd
      // stops coming. Of the four the shipped radius is the one that turns aside most at the rank a
      // player is most likely to own while still leaving the fifth rank under the bar. What the re-read
      // does put in question is the top of the ladder rather than the radius: rank 3 already has
      // nearly everything rank 5 can take, because five images spread over a 220 px streak are 44 px
      // apart and their discs have merged into one shape. That is written up as an After 1.0 item.
      // And the reason nobody moved the number on the strength of one batch: the same radius and the
      // same habit on eight seeds of two minutes reads 36.9% and 57.1%, because a short batch is
      // nothing but the opening knot. The window moves the figure more than the radius does, so the
      // tool refuses to verdict on fewer than 25 presses of the dash.
      bait: 110,
      // An image going out: one ring closing in on the place it stood, and a note thin enough to
      // be a hiss. No light when it is *born*, because the image itself is the light and a dash
      // already throws a ring and a spray of its own.
      gone: {
        ring: { radius: 22, speed: -74, life: 0.28 },
        sound: { freq: 1180, dur: 0.07, wave: 'triangle', vol: 0.016, slide: 640 },
      },
    },

    // Magnetar (game/magnetar.js): PLAN 3.5's "collected shards deal small area damage around
    // the ship", and the last behaviour line of the four that add damage. The others are paid
    // for by a hit (burn, chill) or by the ship standing somewhere (nova, orbitals); this is the
    // one paid for by *picking up*, which makes it the only line in the deck whose rate is the
    // run's own loot. The field fills as shards come in and lets go when it is full, and a crack
    // takes rank shots off every body standing in the field.
    magnetar: {
      ranks: 5,
      // A line of whole things (`each`, game/upgrades.js), and the whole things are shots of the
      // ship's own gun: a crack takes `step x rank` shots off every body inside `reach`, with the
      // damage line multiplied in exactly as it multiplies a drone's bite and a nova front
      // (session 31's rule - an added source has to grow with the gun or it stops being worth
      // taking). Rank 1 is one shot and rank 5 is five, and the card prints it.
      //
      // `step` and `cost` below are one product - what a rank is worth is
      // `weight x bodies x income / cost` - so the choice between them is not a balance question
      // but a shape one. Selling the rank as *weight* keeps the crack's rhythm at one crackle a
      // second whatever the rank and makes a rank a heavier crack; selling it as a cheaper `cost`
      // would make the field fire three times a second at the fifth rank, which is a hiss and not
      // an event, and would make the fifth rank a different sound rather than a bigger one.
      step: 1,
      // Shards the field has to swallow before it lets go. A large shard (an elite's, worth six)
      // is six of them at once, so one gold shard fills it and then some, which is the intended
      // bargain: the loot you flew across the arena for pays for the crack that clears the way back.
      //
      // Four, because that is where the field lets go about once a second in a real run, and that
      // is measured rather than picked for tidiness: six fifteen-minute aware-bot runs collected
      // 200-285 shards a minute depending on the seed, and counting the bank letting go came out
      // at 44-69 cracks a minute (medians 52 with the line dealt, 58 with five ranks handed), which
      // agrees with `shards / cost` to within a shard. A line whose rate is the run's own loot
      // scales with the killing and not with the ranks, and that is the whole point of it; a
      // cheaper `cost` would be the same damage spread thinner and faster, which is why `step`
      // above buys weight and this buys rhythm.
      cost: 4,
      // px of field round the ship, measured from its centre - the number that decides what the
      // card is *for*, and measured rather than guessed, because the near field of a ship that is
      // running is nearly empty. Over every frame of those same six runs a mean of 1.0-1.1 bodies
      // stand within 210 px of the ship, 0.4 within 145 px (the magnet's own reach, and the obvious
      // first guess for a card paid by the magnet) and 4.8 within 300. And the crack fires on the
      // *quiet* of those frames - it lets go when a shard comes in, and a shard comes in while the
      // ship is running over the field it dropped rather than while it is being chewed on - so what
      // a crack really comes round is a median of 0.63 of a body with the line dealt as usual and
      // 0.23 with five ranks handed free. Even at 210 px, then, about a crack in two crackles into
      // empty air. At 145 there would be nobody to crack at at all.
      //
      // That last number is the line's own ceiling, and it is written here because it was not what
      // I expected: hand the bot five ranks and it thins the crowd sooner, the crowd stops getting
      // inside the field, and each crack finds *less* than the same crack found at two ranks
      // (0.23 against 0.63). A rank of this line buys weight to spend on a field that empties out
      // as the run gets better, which is the same self-limiting shape the nova has for the same
      // reason and is why this card cannot run away with a run.
      //
      // 210 is also the nova's 220 minus a step, on purpose: the wide panic stays the wide one.
      reach: 210,
      // PLAN's second halves are all gated on a rank, and so is this one. From the third rank a
      // body the field kills leaves a shard where it came apart, which is the line feeding
      // itself: the crack that clears the pocket also pays for the next one, and the mint flying
      // out of a corpse is the only tell a crack-kill has at all. It is deliberately small (one
      // shard, and only on a kill the crack itself landed) - against the measured 3.6 shards a
      // second this is worth a few per cent more income and a good deal more momentum, and the
      // field is not meant to mint loot out of nothing the way the leech mints hull.
      seed: { at: 3, count: 1 },
      // The light of one crack. It is drawn *inwards*, which is the whole difference between this
      // and a nova front: a nova is the ship letting go and the ring runs out, and a magnetar is
      // the field collapsing back into the ship, so the rim the damage was paid out at is born on
      // screen and runs in to nothing (game/nova.js has the other half of the rule - a light that
      // follows damage may run out past it, but this one may not claim a smaller circle than it
      // hurt, so it starts at exactly `reach`).
      light: {
        ring: { speed: -880, life: 0.24 },
        // The rim, falling in. `turn` is rad/s of slow spin on the pattern, so a ship that cracks
        // once a second never throws the motes from the same ten places twice.
        infall: { points: 10, turn: 1.9, count: 2, speed: 620, life: 0.24, spread: 0.13 },
        flash: {
          radius: 9, speed: 300, life: 0.2,
          burst: { count: 7, speed: 240, life: 0.2 },
        },
      },
      // One crackle per crack, and quiet, because the line fires about once a second all run and
      // a voice is priced for as long as it sounds (audio/mix.js). It falls rather than rises: the
      // shard pickup above slides *up* with a streak, and this is the pickup spent.
      sound: { freq: 1420, dur: 0.07, wave: 'triangle', vol: 0.02, slide: 430 },
      // None. A nova was one event every few seconds and this was a metronome, which is
      // the sound a headache is made of (`screen`, above).
      shake: 0,
      // And what the whole line is worth, which the ladder cannot say: `tools/power-ladder.js
      // --line magnetar` prints 1.00x, not because the line is weak but because its knot is pinned
      // in place and nothing in it ever dies, so nothing is ever dropped and nothing is ever
      // collected. The instrument for a line paid for by picking things up is the run, so this is
      // the run: six seeds at the 900 s cap, aware bot, the line out of the deck (`ranks: 0`, which
      // is how a line is removed) against in the deal against five ranks handed for free - the same
      // three-condition A/B burn was priced with in session 38.
      //
      // A run's whole damage (`tally.kinds[*].damage` summed, the sheet the game keeps itself)
      // mediates 55,454 with the line out, 57,186 with it dealt and taken at the bot's own pace -
      // it reaches two or three ranks that way - and 61,414 with five ranks handed: 10.7% of
      // everything a run's damage is, and all six seeds up on it. Score medians 111,502 out,
      // 115,808 dealt, 116,937 handed, so five free ranks are worth +4.9%, which is the same family
      // as burn's +2.9% for the five ranks a bot takes by itself and a clear shade under a rank of
      // the damage line. That is the honest size of this card: a second source in burn's family,
      // paid for in flying over your own loot rather than in hitting something or standing still -
      // and, like every defensive line before it, worth more to a player who walks back into the
      // field than to a bot whose whole policy is running away from it.
    },
    mines: {
      ranks: 5,
      // A line of whole things (`each`, game/upgrades.js), and the whole things are mines: a drop
      // lays `step x rank` of them, so rank 1 is PLAN's one mine on the beat and rank 5 is five.
      // The beat never changes with the rank, which is the shape decision in this card: a rank buys
      // a longer stretch of road rather than a quicker drum, and five mines in a row is ground the
      // chase has to walk through where one mine is a point it can walk past.
      step: 1,
      // s between drops. PLAN's own number, and it is the rate the whole line is priced on: one
      // row of mines every three seconds, however many ranks are in it.
      cycle: 3,
      // px between the mines of one drop. `radius` is 112, so consecutive mines of a rank-five row
      // overlap their blasts a little and the row reads as one swept stretch of ground rather than
      // as five separate firecrackers - which is the promise a rank is selling.
      gap: 56,
      // s a mine takes to wind up before it has any eyes. This is what makes the card a trap and not
      // a rear-facing gun: a chase is sitting on the ship's tail when the mine falls out, and
      // without this the line would be a turret on PLAN's beat and would be orbitals again.
      arm: 0.6,
      // s a mine that is never walked into waits for. The price of the line, and the reason its
      // numbers can be generous: most mines go out unarmed and harmless. Nine seconds is three drops
      // worth of the beat, so what stands behind a run is about three rows of mines and not a trail
      // back to the start of the run - which is the difference between a field and a minefield.
      life: 9,
      // s of that life a mine spends visibly going out, so the arena says which mines are still
      // promised without a meter for it (render/entities.js fades on it).
      fade: 1.2,
      // px a body has to come within to light the fuse, measured to the body's own skin - the ring
      // on the floor is drawn at this and at nothing else (game/mines.js).
      trigger: 62,
      // s of tell once it is lit. Shorter than anything in the arena can back out of, so it is a
      // warning and not an escape: the ring flashes and crawls fast and then the mine is gone.
      fuse: 0.22,
      // px of blast, measured from the mine's own centre exactly as the blast ring is drawn.
      radius: 112,
      // px/s of shove thrown outwards on everything it comes round.
      shove: 260,
      // px/s of ship speed under which "the way I was going" stops meaning anything, and the mines
      // of a drop fall out behind the nose instead (game/mines.js `falloutOf`).
      drifting: 40,
      // What a body the blast comes round loses, as a multiple of one shot of the ship's own gun,
      // with the damage line multiplied into it exactly as it multiplies a drone's bite, a nova front
      // and the magnetar's crack (session 31's rule: an added source has to grow with the gun or it
      // stops being worth taking), and read when the blast is paid out.
      //
      // MEASURED on the run, because the ladder cannot see this line at all - `tools/power-ladder.js
      // --line mines` says 1.00x on the column and on the near field, where nothing on a pinned knot
      // ever walks into a ring drawn on the floor, and 16.46x on the dense ring, where one mine lands
      // inside thirty immortal bodies and goes off with all of them in it. Both ends are wrong in
      // opposite directions and the note at the top of that tool says so. The instrument is
      // `tools/line-ab.js --line mines --seeds 6 --seconds 900`, the same three-condition A/B
      // magnetar was priced with, and at this weight it reads:
      //
      //   out    score 115,808   damage 57,186
      //   dealt  score 116,141   damage 58,359   (+0.3%, +2.1%) at 3 of 5 ranks taken
      //   free   score 117,059   damage 59,963   (+1.1%, +4.9%) at all five ranks
      //
      // with the line handing the arena 1,430 mines in a quarter hour, 1,097 of them going off and
      // coming round 1,214 bodies. So: about half of what five free ranks of magnetar were (+10.7%),
      // which is the family it belongs to and under its head, and comfortably not a rank of the gun.
      // Three things about those numbers are why the share stays there:
      //
      //   **Most of the mine's damage replaces the gun's instead of adding to it.** On one seed at
      //     the same window, the hits landed on bodies go *down* with the line in - 53,895 without it
      //     against 48,084 with all five ranks, while the mines themselves come round 978 of them -
      //     because a body a mine killed is a body the gun stops spending three shots on. So `damage`
      //     is the column that moves and `score` barely does, and the honest reading of this card is
      //     cheaper kills rather than more of them.
      //   **It is front-loaded**, which is the shape of the card and not a mistake in it: at the
      //     five-minute window those same five free ranks read +15.2% of a run's damage and +11.7%
      //     of its score, against +4.9% and +1.1% by the fifteenth. A mine needs a crowd that has not
      //     arrived yet, and a late run's crowd is killed before it finishes walking into anything. It
      //     is the line that buys the early minutes.
      //   **And the bot is the wrong customer for it.** It lays a mine every three seconds and lets
      //     the chase walk into the wake behind it, which pays out about one body a blast - 978 bodies
      //     came round 952 blasts on the seed above. The card is meant to be paid by *steering* a
      //     crowd through a lane of them, and nothing in `tools/headless` steers like that - so what
      //     is priced here is the floor of the line, and a player who uses it on purpose should clear
      //     that floor by a long way.
      weight: 3,
      // A mine landing: one small light on the floor where it fell, and one quiet click for the
      // whole row rather than one per mine (audio/mix.js has a budget and a row of six would spend
      // most of it on a sound that is one event).
      landed: {
        ring: { radius: 6, speed: 120, life: 0.2 },
        sound: { freq: 620, dur: 0.05, wave: 'square', vol: 0.016, slide: 300 },
      },
      // A fuse lit: a ring collapsing in on the mine, and a hard tick - the sound of something
      // deciding.
      fused: {
        ring: { radius: 26, speed: -120, life: 0.18 },
        sound: { freq: 1180, dur: 0.05, wave: 'square', vol: 0.03, slide: 700 },
      },
      // A mine that waited out its life: a dim ring going in and a sound quiet enough that the
      // arena is not noisy about what the player did not get paid for.
      gone: {
        ring: { radius: 8, speed: -30, life: 0.3 },
        sound: { freq: 300, dur: 0.07, wave: 'triangle', vol: 0.012, slide: 190 },
      },
      // The blast itself. Smaller and quieter than a bomber's (game/kinds.js `bomber.blast`),
      // because a mine goes off several times a second at the top of the line and a bomber dies
      // once. No hit-stop, for the same reason: five of these inside a second would stutter.
      blast: {
        // The light of it, and it is aimed: born at 12 px and growing to 12 + 360 x 0.3 = 120 px, so
        // the ring a player watches stops at about the `radius` the damage was actually paid out at.
        // A bomber's blast flash is allowed to overshoot its own reach - a death is not making a
        // promise about a number - but a mine is, and this is the half of `radius > trigger` that is
        // painted rather than asserted.
        ring: { radius: 12, speed: 360, life: 0.3 },
        flash: { count: 16, speed: 380, life: 0.34 },
        bite: { count: 3, speed: 170, life: 0.2, spread: 0.8 },
        // None: mines go off on their own all run, and a mine that moved the window every
        // time it went off would move it continuously (`screen`, above).
        shake: 0,
        sound: { freq: 96, dur: 0.32, wave: 'sawtooth', vol: 0.14, slide: 40 },
      },
    },

    // Tether (game/tether.js): PLAN 3.2's "a damaging beam links the ship to its last dash position
    // for 2 s", and the second of the two secondary systems left in that table. It is the only damage
    // in the deck that is a *line*: everything else that adds damage is a circle round the hull (the
    // orbital wall, the nova's front, the magnetar's field, a mine's ring), so everything else is
    // worth what the crowd standing near you is worth, and this is worth the ground between where you
    // were and where you are going. Which makes it the second line this milestone has had to price off
    // the run rather than the ladder - a knot of immortal bodies pinned to the floor is the one crowd
    // that never turns, never dashes and never sweeps anything across it.
    tether: {
      ranks: 5,
      // A line of whole things (`each`, game/upgrades.js), and the whole things are threads: a dash
      // ties `step x rank` of them, knotted evenly down the streak the dash covered and every one of
      // them tied to the ship. Rank 1 is PLAN's single beam down the middle of the wake and rank 5 is
      // a fan of five, so a rank buys *breadth* - a wider lane swept on the next turn - rather than a
      // heavier pulse on the ground the first thread already covered. It is the nova's rule and
      // afterimage's: the same crowd hit harder is a rank nobody can feel.
      step: 1,
      // s PLAN's number, unchanged: the tether is live for two seconds from the step the dash is
      // granted and then lets go. Nothing here counts anything else - the threads have no other clock
      // - and the ship's own speed is what caps how long a thread can be, because two seconds at
      // 320 px/s is 640 px of tether and never a pixel more.
      //
      // Two seconds is also shorter than the dash's own cooldown (2.5 s, BALANCE.player.dash), which
      // is the same bargain afterimage struck: one dash's tether is gone before the next dash is
      // allowed, so a run that dashes on cooldown keeps a thread tied nearly all the time and a run
      // that saves its dashes gets one when it needs it. How much of a run *that* is depends entirely
      // on how often the player presses, and the instrument's answer to that changed in NOTES session
      // 114 (`node tools/dash-habit.js`): the bot now presses about ten times a
      // quarter-hour, and on `tools/line-ab.js --line tether --dash --seeds 6` a cord was standing for
      // a median of 482 of a run's 54,000 steps with all five ranks handed and 1,566 with three ranks
      // dealt - one and three percent of the run, not half of it. The figure quoted here for a long
      // time - 54,452 of a run's 108,000 steps, just over half the run - was read with the dash habit
      // that shipped until 0.10.19, which pressed whenever anything came within 170 px and so tied a
      // thread every few seconds. The `life` below is still what makes the bargain what it is; only
      // the rate of the presses, and therefore how much of a run is lit, moved.
      life: 2,
      // s of that life the threads spend visibly letting go, so the line says it is nearly done
      // instead of stopping between two frames (game/mines.js fades its mines the same way).
      fade: 0.4,
      // px either side of the axis a body has to stand inside to be on the thread, measured to the
      // body's own skin - and the band is drawn at exactly this width and no wider (render/
      // entities.js), so the road of light is the road the damage is paid out on, edge for edge, the
      // promise the sniper's beam and a mine's ring already keep.
      //
      // 34 px is a lane you can see and fly out of, and it is wide enough that a chasing crowd walks
      // into it rather than having to be driven into it: a drifter is 11 px across, so the band catches
      // anything whose middle comes within 45 px of the line. Swept on the run: at 50 px a mean of 0.13
      // bodies stood on the threads per live step and at 30 px only 0.06, and the width is what the
      // whole difference between those two is made of - the length of a thread is free, its width is
      // the only thing the line has to be wide with. 34 was picked as the number that still reads as a
      // *thread* rather than a beam across the glass: five of them at 50 px each side is a wall of
      // light over half the arena, and a card called TETHER that paints a wall is lying about what it
      // is. The band is drawn at exactly this, so the road you are shown is the road that burns you.
      reach: 34,
      // s between pulses of the whole fan. The threads are one weapon with one beat, so a body
      // standing where three of them overlap pays once and not three times (game/tether.js) and the
      // fifth rank buys ground rather than a stack on whatever is already under the ship.
      //
      // 0.4 s, which measured as the honest middle: at 0.3 s a thread that has a body on it paid out
      // about 20% more often for exactly the same paint, which is the same damage spread thinner and
      // faster - the magnetar's argument about `cost` again - and at 0.5 s the pulse starts arriving
      // after a body has been dragged off the line rather than while it is on it. The beat is also
      // what the threads' brightness is painted out of (render/entities.js), so 0.4 s is the fastest
      // the line can flicker and still be read as one thing lighting up rather than as a strobe.
      beat: 0.4,
      // What one pulse takes off every body it comes round, as a multiple of one shot of the ship's
      // own gun, with the damage line multiplied into it exactly as it multiplies a drone's bite, a
      // nova front, a mine and the magnetar's crack (session 31's rule: an added source has to grow
      // with the gun or it stops being worth taking).
      //
      // MEASURED on the run, because the ladder cannot see this line at all - `tools/power-ladder.js
      // --line tether` prints 1.00x on all three knots, and a wall of immortal bodies pinned to the
      // floor is exactly the crowd that never dashes, never turns and never has a thread swept across
      // it. The instrument is `tools/line-ab.js --line tether --dash`, and the first thing it says is
      // that the line is entirely gated on the dash: without `--dash`, five free ranks are worth
      // nothing at all - the same six seeds read 116,141 score and 58,359 damage with the line out and
      // 116,141 and 58,359 with all five ranks handed, identical to the unit, because a tether is only
      // ever tied by a dash. Every number below is therefore measured on the bot that presses it -
      // which is why they are all marked with the habit they were read on.
      //
      // Read with the habit that shipped until 0.10.19, which pressed the dash at anything within
      // 170 px and so spent a thread every few seconds:
      //
      //   out    score 61,000   damage 29,812   3 of 6 still flying at a quarter hour
      //   dealt  score 115,882  damage 57,627   4 of 6, at 2.5 ranks taken by the bot itself
      //   free   score 119,080  damage 60,534   6 of 6, five ranks handed
      //
      // and on two more groups of four seeds, where the same batch was *not* dying early and the score
      // column therefore had something left in it to buy: seeds 7-10 read +2.1% score and +3.7% damage
      // for five free ranks, and seeds 11-14 +3.3% and +5.3%. That is mines' family (+1.1% and +4.9%
      // for its five free ranks) and a shade above it, which is where a line that costs a dash - and
      // nothing at all if you never spend one - belongs.
      //
      // Read again in session 114 with the habit that ships now - a get-out, pressed about ten times a
      // quarter-hour instead of two hundred - the same instrument on ten seeds at the cap says the line
      // is worth a great deal less: out 120,080 score and 60,003 damage with eight of ten still flying,
      // dealt 116,217 and 57,741 at three ranks taken, free 121,930 and 59,971, i.e. +1.5% score and
      // nothing at all to the damage column. The damage column is the one this row's `damage` is priced
      // off, and it went from +3.7..5.3% to nil. `damage` is left where it is because the reason is that
      // the *bot* sweeps the threads less often, not that a sweep does less work - a person who buys
      // TETHER and dashes at the knot that has them spends it far more like the old instrument than the
      // new one, and a card's price is not the price of the bot that forgot to use it. What is owed is a
      // re-price against a bot that presses the way a TETHER buyer would, which is written up as an
      // item in PLAN's "After 1.0" and is a session of its own.
      //
      // That session is 117, and it read the line per event as well as per run, on eight seeds at the
      // cap with the counters game/tether.js has kept since its first one. The three ranks the bot
      // bought for itself tied a fan a median of 6 times, pulsed it 22 and came round 37 bodies -
      // **1.68 bodies a pulse**, with **0.56 of a body standing on the threads** averaged over the
      // steps one was live - and the five free ranks tied 2, pulsed 6 and came round 6.5 (1.08 a
      // pulse, 0.18 of a body: the ship with all five in hand is cornered so seldom that there is
      // hardly ever a fan to sweep). At the fourth rank of the damage line those runs had, a pulse is
      // 5 x 2.2 = 11 hull a body, so the line paid **0.7%** of the dealt batch's damage and **0.1%**
      // of the free one, where the old instrument reported about 6%. Per event nothing changed and was
      // never going to: 1.08-1.68 bodies a pulse against a mine's 1.11 a blast is the same near crowd
      // whoever sweeps it, which is the finding session 45 made and this one repeats.
      //
      // So `weight` stays at 5, on an argument the two readings together make rather than either one:
      // there is no press rate a person has at which 5 is too strong. Pressed the way the old
      // instrument pressed - every cooldown, which is what a buyer of a card gated on the dash
      // plausibly does - the line paid 3-6% of a run's damage and bought +2.1..5.3% of its score,
      // which is mines' family and not a beam-cannon; pressed the way the shipped habit presses it is
      // all but invisible. A card that is never too much and often nothing is priced on the *wager*,
      // which is what this row has always said it was. What the new batch does say is in the `dealt`
      // column: 0.972x, i.e. the three levels the bot spent on the card cost the run 2.8% of its
      // score, so an instrument that buys the line and cannot use it pays twice - once for the card
      // and once for the thread it never tied. That is a finding about the bot's appetite and not
      // about the number, and it is the same shape every dash-gated line has shown since session 42.
      //
      // What the line actually did, rather than what the run scored, on six of those seeds with the
      // habit that ships now: three dealt ranks tied a fan a median of 6.5 times a run, pulsed 23.5
      // of them and came round 37 bodies; five free ranks tied 2, pulsed 6 and came round 6.5 - the ship
      // with all five in hand is driven into a corner a great deal less often than the one buying them
      // one at a time, and a tether is only ever tied by a ship that is in one. Read with the old dash
      // habit the same columns were 226 tethers, 317 pulses and 339 bodies at
      // five ranks, which is what the two paragraphs below are made of. What the line takes off at
      // that rate is about 6% of everything the run took off. Two readings of that are worth writing
      // down, because they disagree and both are true:
      //
      //   **Per event it is already in mines' family, and its events are rarer again than that.** A
      //     pulse came round 1.07 bodies (339 over 317), and a mine's blast comes round 1.11 (session
      //     45) - the near crowd is the near crowd, whoever sweeps through it. But the old bot tied a
      //     tether once every four seconds and the beat fired it about 1.4 times, so it paid out 317
      //     events a run where a minefield pays out 1,097. That is why the weight is 5 and not 3: a
      //     thread is worth about a mine's blast per body and happened a quarter as often, and the two
      //     lines came out the same size on the run at a weight bigger than a mine's by roughly that
      //     ratio. The rate the ratio was made of is the old habit's - the bot that ships now dashes
      //     ten times a run, so a thread is tied about once a minute and a half and today's instrument
      //     would price this line out of the deck altogether. `damage` stays where the old readings put
      //     it, because the rate that card is bought at is a player spending dashes on the knot, which
      //     is nearer the old instrument than the new one.
      //   **The first sweep of this number was 0.4, and it was wrong by an order of magnitude.** At
      //     0.4 the threads took 0.4% of a run's damage and the score column moved by +1.1% at five
      //     free ranks, which read as "a cosmetic fifth system" and was really the ladder's disease
      //     caught in the run: a line whose rate is set by how often the player spends a dash has to be
      //     priced per event, not per second, and per event 0.4 was a firecracker. Swept at 0.4, at 3,
      //     at 6, and settled at 5: at 6 the threads' own share was 8.5% and a pulse was one-hit-killing
      //     most of the crowd twice over, which is a beam-cannon and not a tether.
      //
      // And an oddity the old instrument saw that the new one does not, kept here because it explains a
      // result nobody would otherwise believe: on those six seeds the line *out of the deck* mediated
      // 8m30s with three of six dead, and any amount of the line in - one dealt rank or five free ones
      // - took the batch to the cap, six and a half minutes of flying for a source worth 6% of a run's
      // damage. It is not arithmetic the damage column can show; it is what a wall of light across your
      // own wake is worth to a ship running for its life. The same batch with the get-out habit reads
      // 6 of 6 alive with the line out and nothing to buy at all, which is the same lesson this whole
      // instrument has now taught twice: a dash line measured on a bot that spends its dashes badly is
      // measuring the bot. No bot in tools/headless has ever dashed *on purpose*.
      weight: 5,
      // px/s thrown clear of the line, off the thread's own perpendicular. A shove and not a slow
      // (game/chill.js): a body burned off a tether is still walking at you, it is just not on the
      // line any more - which is also what makes the threads a wall to be steered around rather than
      // a net, and the one place this card comes closest to restricting the crowd.
      shove: 200,
      // A dash tying a tether: one small light driven into the floor at every knot, and one note for
      // the whole fan rather than one per knot (the mine row's rule, and a fan of six notes is six
      // voices added to the same sky: audio/mix.js). No ring at the ship, because the dash is throwing
      // one at that very step.
      tied: {
        ring: { radius: 5, speed: 100, life: 0.2 },
        sound: { freq: 880, dur: 0.05, wave: 'triangle', vol: 0.02, slide: 460 },
      },
      // The tether letting go on its own clock: a ring closing in on every knot it was tied at, and a
      // note that falls - the sound of a string going slack.
      gone: {
        ring: { radius: 16, speed: -70, life: 0.26 },
        sound: { freq: 420, dur: 0.1, wave: 'triangle', vol: 0.016, slide: 170 },
      },
      // One pulse landing: sparks thrown off the line, along the way the body is thrown, and one quiet
      // tick for the whole pulse - the threads themselves are the shout.
      bite: {
        count: 3, speed: 210, life: 0.2, spread: 0.9,
        sound: { freq: 1480, dur: 0.04, wave: 'square', vol: 0.016, slide: 520 },
      },
    },

    // Turret (game/turret.js): PLAN 3.2's "a stationary turret is placed every 12 s and lasts 10 s",
    // and the last of the five secondary systems that table asks for. It is the only damage in the deck
    // that aims: everything else the ship adds pays out round the hull or along the road it just drove,
    // and this is a shooter standing somewhere else, choosing a body and firing at it. Which makes it
    // the second line in a row that the power ladder cannot price honestly and the run can - a knot of
    // immortal bodies pinned round the ship is a crowd a fence planted down the road never sees - so
    // every number below is quoted off `tools/line-ab.js --line turret`.
    turret: {
      ranks: 5,
      // A line of whole things (`each`, game/upgrades.js), and the whole things are guns: a crew is
      // `step x rank` of them, planted in a line across the road the ship is travelling. Rank 1 is
      // PLAN's single turret on PLAN's beat; rank 5 is a fence of five with the road in the middle of
      // it. The beat never changes with the rank, which is the shape decision in this card and mines'
      // before it: a rank buys a longer fence and not a quicker drum, so what it is worth is ground.
      step: 1,
      // s between crews. PLAN's own number, unchanged: one crew every twelve seconds, however many
      // guns are in it. It is the slowest beat in the deck by a factor of four, and that is the price
      // of the line being a *place* - a minefield renews every three seconds and is gone when you stop
      // laying, while this puts down a gun you can fight around and then makes you wait.
      cycle: 12,
      // s a gun holds the ground it was set down on. PLAN's own number, and read together with the
      // beat it is the whole shape of the card: ten seconds of the twelve there is a fence standing
      // where the ship was going, and two seconds where there is nothing at all. It cannot be raised to
      // twelve without the line becoming permanent scenery, and it is long enough that a ship running
      // loops gets its own guns back at the end of each one.
      life: 10,
      // s of that life a gun spends visibly going out, so the arena says which guns are still holding
      // ground without a meter for it (render/entities.js fades the whole gun on this).
      fade: 1.2,
      // px down the road the first gun of a crew is set down at, measured from the ship's own middle
      // along the way it was going (its nose, if it has stopped going anywhere). It wants to be out
      // past the orbital ring and the nova's front - the two things that already live round the hull -
      // and short enough that a ship at full speed passes its own fence inside half a second and leaves
      // it covering the road behind.
      stand: 150,
      // px between the guns of one crew, measured across the road rather than down it. This is the
      // whole reason a crew is a fence and not a second minefield: the guns of a crew are laid out
      // across the lane the ship is travelling down rather than in a file along it, so a rank is a
      // wider fence and not a longer one. It is half `reach`, and the sweep is what made it that: at 70
      // the fifth rank is four guns aiming at the same body from the same place and the whole crew fits
      // inside one body's turning circle (+16.6% of a run's damage for five free ranks), at 260 the two
      // ends of the fence are further from the road than their own sight lines reach and the middle of
      // it - the road the ship is on - falls in a gap (+11.9%), and at 150 the five of them throw one
      // overlapping line of light across the lane and the crowd has to walk through some part of it
      // whichever way it comes (+17.7%). Past `reach` a rank-five crew also spans more of the arena
      // than the glass shows, which is a card that cannot be read off the screen.
      gap: 150,
      // px a planted gun keeps off the arena wall. The road runs into a wall now and then, and a gun
      // set down outside the arena would be a gun nobody could see or reach, so the fence bends at the
      // wall instead (game/waves.js lands bodies the same way).
      pad: 26,
      // px a gun will look for a body, measured to the body's own skin, and - because the sight line
      // drawn on the floor and the shell's own range are the same number - how far its shell flies.
      // Swept on the run at 200, 300 and 380 (six seeds, weight as below), and it is the flattest
      // number in this block: five free ranks are worth +6.2% of a run's damage at 200, +16.6% here and
      // +16.6% at 380, which is the line saying it wants to be *somewhere* rather than long. So it is
      // set by what the picture can show and what the ship is left to do: 200 is a picket that sees the
      // chase come up into it and nothing else, and 380 starts shooting at bodies on the far side of the
      // ship, which is the ship's own job. 300 is "the near field and a bit" - further than the nova's
      // front, a good deal short of the gun's own reach.
      reach: 300,
      // rad/s a gun swings at. It has to swing: a shell only leaves down the nose, which is the whole
      // difference between a turret and a rune on the floor, and it is what makes the geometry of a
      // fence matter - a gun born looking down the road has to come about to shoot the chase off the
      // ship's tail, and the time that takes is the price of planting it ahead.
      turn: 6,
      // rad inside the line to its lock a gun counts as lined up, and will only fire inside. Tight
      // enough that the swing has to actually finish, wide enough that a gun tracking a body that is
      // walking across it keeps firing rather than stuttering at the edge of the tolerance.
      aim: 0.16,
      // s a gun waits between shells, per gun and not per line: five guns fire five times as often as
      // one, which is what a rank is. One second, so one gun is worth one heavy shot a second.
      beat: 1,
      // What a shell costs the body it comes round, as a multiple of one shot of the ship's own gun,
      // with the damage line multiplied into it exactly as it multiplies a drone's bite, a nova front,
      // a mine and a thread (session 31's rule: an added source has to grow with the gun or it stops
      // being worth taking), and read as the shell leaves.
      //
      // MEASURED on the run, because the ladder prices this line the wrong way up:
      // `tools/power-ladder.js --line turret` gives five ranks 5.66x on the ring, 5.85x on the column and
      // 5.47x on the near field - one rank of a fence worth 3.24 ranks of the gun - and it gets that by
      // standing a rank-five crew in a knot of thirty bodies that never leave, where every gun has a lock
      // for ever and a rank is five more guns on the same pile. In a run the crowd walks *through* a fence
      // instead of standing in it, and the same five ranks are worth +9% of a run.
      // The instrument is `tools/line-ab.js --line turret`, swept over the whole plausible range of this
      // one number rather than read off one setting, because a single setting of it would have had to be
      // judged and there is nothing here to judge it against - the columns move by a few percent and the
      // two of them that matter disagree:
      //
      //   weight  dealt score  dealt damage  ranks taken  free score  free damage
      //     1.6      0.793x       0.832x        2.0          1.090x       1.047x
      //     2.4      0.650x       0.743x        1.5          1.090x       1.065x
      //     3.4      0.889x       0.921x        1.5          1.096x       1.099x
      //     4.0      0.915x       0.926x        2.0          1.096x       1.152x
      //     5.0      0.992x       1.006x        2.5          1.094x       1.177x
      //     6.5      0.910x       0.988x        2.0          1.096x       1.237x
      //
      // (the first three rows are eight seeds, the last three twelve; `dealt` is the line dealt like
      // every other card and the bot choosing it, `free` all five ranks handed from the first frame.)
      //
      // **The score column does not care what a shell costs.** Five free ranks are worth +9% of a run
      // at 1.6 and +9% at 6.5, while the damage they take off climbs from +5% to +24% over the same
      // sweep: the fence's worth is the ground it holds, exactly as the shape decision claims, and a
      // heavier shell mostly buys damage on bodies the gun was going to spend on anyway (mines'
      // session found the same disagreement between the two columns and for the same reason). So the
      // weight is set where the card is worth taking and not where the damage looks impressive.
      //
      // **5 is where `dealt` comes back to level**, which is the best this column gives any of the floor
      // lines: the bot takes 2.5 ranks of it on its own and the runs it dies in are no worse than the
      // control's (-0.8% of score on twelve seeds, -2.6% on six), where at 4 it is -8.5% and at 6.5
      // -9%. Read the climb for what it is: the card costs a *slot*, so a fence that does nothing is
      // worse than no fence at all and a fence that does a lot is worth the slot it takes. Above 5 the
      // shells stop paying for themselves - free damage keeps climbing and free score refuses to follow
      // it. Mines reads +1.1% and tether +2-3% for five free ranks in the same column; this is +7.5 to
      // +9.4% depending on the seeds, which is the family it belongs to and at the top of it, and the
      // top is what a line that travels with the ship rather than standing still should not be - so read
      // the `free` column as the ceiling of a card the bot cannot use on purpose and `dealt` as the
      // honest one.
      //
      // What the line actually did, rather than what the run scored: at five ranks the twelve seeds
      // planted 72 crews and 360 guns, threw 3,084 shells and came round 2,055 of them - 0.67 of a body
      // per shell, which is a gun that misses a third of the time rather than an aura with a muzzle, and
      // the number the accuracy tests in test/turret.test.mjs are the headless stand-in for. The duty
      // reading off the same batch is 364,209 of 429,095 gun-steps with somebody in sight: five guns in
      // six had a lock, because a fence planted down the road of a run is standing in the traffic almost
      // all the time it is standing at all - which is the one assumption the whole shape of this card
      // makes, and the one the measurement says holds.
      //
      // And one finding the sweep can only hint at. NOTES has written this sentence about afterimage and
      // about magnetar, and it is true of this line too: the bot runs in straight lines, and a fence is a
      // *place* - worth returning to, worth herding a crowd through, worth planting on the ground you
      // mean to fight on - which is worth nothing to a run that never returns anywhere. That is why the
      // weight here is chosen where `dealt` stops being a punishment rather than where `free` peaks, and
      // why a player who uses a fence on purpose should clear these numbers by a long way.
      weight: 5,
      // px the shell is born out along the nose, so it leaves the barrel and not the middle of the
      // mount - the same little piece of honesty `noseOffset` buys the ship's own gun.
      muzzle: 9,
      // px/s of ship speed under which "the way I was going" stops meaning anything and the crew is
      // laid out across the nose instead (game/mines.js `drifting` is the same question, asked the
      // other way round).
      drifting: 40,
      // The shell itself. It is a bullet of the ship's own gun in every way that matters - it is paid
      // out by game/bullets.js, it frosts and it lights, and the run gets the kill - and it carries no
      // pierce and no ricochet, because those two lines are bought for the ship's trigger and this gun
      // is not the ship's. `speed` is the pulse's, so a turret's tracer reads as the same ammunition
      // fired from somewhere else, and `knock` is small: a shell that shoves is a shell that pushes the
      // crowd off the ground the fence was planted to hold.
      shell: { speed: 620, knock: 0.05 },
      // A crew going down: one light and one note per gun at the place it landed, and one note for the
      // crew. The sound is quiet and a little lower than a mine landing, because a crew of five arrives
      // at five places at once and five notes at this volume in one frame is a chord nobody asked for
      // (audio/mix.js).
      planted: {
        ring: { radius: 6, speed: 150, life: 0.25 },
        sound: { freq: 520, dur: 0.06, wave: 'square', vol: 0.018, slide: 300 },
      },
      // One shell leaving: a small flare off the muzzle along the nose, and a hard little report.
      shot: {
        count: 3, speed: 190, life: 0.16,
        sound: { freq: 900, dur: 0.04, wave: 'square', vol: 0.018, slide: 420 },
      },
      // A gun going out unwasted: a ring closing in on the place it stood, and a note quiet enough that
      // the arena is not noisy about the ground the ship did not hold.
      gone: {
        ring: { radius: 9, speed: -40, life: 0.3 },
        sound: { freq: 300, dur: 0.07, wave: 'triangle', vol: 0.012, slide: 190 },
      },
    },

    // Attractor (game/pickups.js): PLAN 3.5's own "Pickup radius" stat line, which the deck never
    // had until the owner asked for it by name on 2026-10-10 ("an Attractor mod ... increases
    // attraction range allowing you to collect faster"). It is the only line in the deck that buys
    // *reach*: every other line multiplies the gun, adds a source of damage, or spends what the run
    // already collects (magnetar). Nothing about it can be priced on the power ladder - a knot of
    // immortal bodies never drops a shard for anything to collect, so it reads 1.00x there the way
    // magnetar and mines do - and the instrument is the run itself.
    //
    // A rank buys a share of `shards.magnetRadius`, and the pull gradient is read over that radius,
    // so a rank widens the well *and* deepens it: a shard standing where the old rim used to be sits
    // nearer the middle of the new one and is tugged harder rather than weaker (game/pickups.js).
    //
    // Measured with `tools/line-ab.js --line attractor --seeds 6 --seconds 600 --stats
    // collected,level`, the aware bot that never dashes. The window is ten minutes and not the tool's
    // fifteen on purpose: by a quarter of an hour the deck is out of ranks, a level buys nothing and
    // every column goes flat - which is exactly the window *not* to price a card in. The yardstick is
    // the DAMAGE line, measured the same way on the same six seeds, where out / dealt / free read
    // 1.000x / 1.070x / 1.312x of the score and 1.000x / 1.109x / 1.515x of the damage:
    //
    //   step   rank 5 reaches   dealt (score, damage)   free (score, damage)   levels out → free
    //   +5%        182 px        0.726x, 0.739x          1.342x, 1.334x           35.5 → 48.5
    //   +8%        203 px        0.664x, 0.669x          1.364x, 1.330x           35.5 → 51.5
    //   +12%       232 px        0.350x, 0.339x          1.375x, 1.369x           35.5 → 52.5
    //   +15%       261 px        1.099x, 1.068x          1.385x, 1.335x           35.5 → 53.5
    //   +20%       290 px        1.146x, 1.099x          1.420x, 1.382x           35.5 → 56.5
    //   +25%       326 px        1.114x, 1.064x          1.435x, 1.397x           35.5 → 58.0
    //
    // Three things come out of that table, and the first is the one that was not expected.
    //
    // **The card is not paid in damage, it is paid in levels.** Shards are the only way a run earns XP,
    // so a wider net is a faster build of *everything*: five free ranks take the median level from 35
    // to 58 and the median shards gathered from 1,570 to 5,272, and the damage follows the build. That
    // is why a whole stack of it (+43.5% score, +39.7% damage) comes out in the yardstick's family
    // (+31.2%, +51.5%) while being the cheaper card where damage is counted - and it is the opposite
    // shape to game/magnetar.js, which is worth most to a run that stands and fights and nothing to one
    // that runs. Whether an indirect card of this size is right is a question for a person playing it
    // (NOTES session 86); what the instrument can say is that it is not above the best line in the deck.
    //
    // **A thin rank is a tax.** At +5%, +8% and +12% a rank the `dealt` column comes out *below* the
    // same deck with the line out of it (0.726x, 0.664x, 0.350x), because the bot takes the shallowest
    // line on the table and pays a level for a rank too thin to pay it back. Six seeds is not enough to
    // say how far below - the same instrument reads 1.10x at +15% on the very next row - but the
    // direction survived two windows and it is the whole argument for the number below being a quarter
    // and not a tenth: a rank has to be a distance you can feel from the middle of the arena.
    //
    // **Past that it barely matters.** +5% a rank and +25% a rank read within ten points of each other
    // on `free` (1.342x against 1.435x of the score): once the net clears the corridor a fleeing ship
    // drags its loot down, extra width buys little. So the step is a feel knob rather than a power knob,
    // and it is set at the near end of the flat part.
    //
    // And rank 0 is nothing at all, which is the claim the whole line rests on: with `ranks: 0` the
    // ten-minute reference run (`tools/simulate.js --seed 20261006 --trace`) is byte-identical to the
    // one this card was not in the deck for, every frame hash of it - the only line that differs is the
    // build string, which now prints a nineteenth number. The gradient is read over `attractorReachOf`
    // and at no ranks that is the balance table's own number, multiplied by one.
    attractor: {
      ranks: 5,
      step: 0.25,        // of the shard's reach, per rank: 145 px as the game shipped, 326 px at five
    },

    // Thermal shock (game/shock.js): the first of PLAN 3.5's synergies - "Burn 3 + Chill 3:
    // enemies that are both burning and chilled explode". It is not a line: it has one rank, it is
    // never dealt until the run has built its way into it, and it is not bought *instead of*
    // anything - it is what the two lines the run already owns become when they are both deep
    // enough (game/upgrades.js puts it on the table, game/shock.js pays it out).
    thermalShock: {
      // One rank. A synergy is an event and not a meter: taking it twice would be taking it twice.
      ranks: 1,
      // What the card is the payoff for, and how deep each of them has to go before it is worth
      // putting on the table. PLAN's table is the numbers: both halves at their third rank, which
      // is where each of the two gets its second half (burn's fire jumping a corpse, chill's frost
      // worth twelve hits instead of fifteen) and so is where the pair starts being a build rather
      // than two things that happened to happen.
      needs: [{ line: 'burn', rank: 3 }, { line: 'chill', rank: 3 }],
      // What a detonation costs every body standing in it, as a multiple of one shot of the ship's
      // own gun with the damage line multiplied in (session 31's rule, and the same pricing as a
      // drone's bite, a nova front, a mine, a thread and a shatter), times **how cold the corpse
      // was**. That last multiply is chill's own lesson arriving a third time: a run with a strong
      // gun kills a body with about the first shot that touches it, so a payload gated on a body
      // that survived being shot is a payload that stops working as the gun grows. A body killed
      // by one cold shot goes up small; a body kept under fire goes up like a room on fire.
      //
      // Measured (6 seeds, an 8-minute window, the aware bot, on a run that always had burn 3 and
      // chill 3): +5.9% of everything a run takes off bodies at 4, +1.5% at 2, +10.3% at 6 and
      // +20.1% at 8 - and flat in score at every one of them, which is the floor-line disagreement
      // NOTES has been writing up since Mines arriving a fourth time: all six of these runs survive
      // the whole window, so score cannot move and damage is the only column that answers. What the
      // blasts were asked to do at 4: 2,875 of them, 2,416 bodies caught (0.84 a blast - most find
      // one body, a few find three), 8,368 of hull off them against the run's own 27,756, so the
      // card is worth about a third of the damage and almost all of that is *substituted* for shots
      // the run would have spent anyway. Worth a third of a run's damage for one level and one slot:
      // that is what it costs, and eight times the gun is not. The honest caveat is that a run which
      // dies at four minutes - the one where a crowd closing in has to be erased, which is the whole
      // customer for this card - is a run that measurement cannot price at all.
      weight: 4,
      // px, measured to a body's own middle, and - because the flash drawn on the arena is born at
      // exactly this number (game/shock.js) - the reach the eye is shown. The same as a fire's jump
      // and a shatter's front on purpose: the three of them are the same shape of payoff, a death
      // that reaches the bodies standing next to it, and one of them being wider than the others
      // would be a colour the player cannot tell apart from a distance.
      radius: 96,
      // How much of a whole frost a body caught in the blast gains, as a share of the frost the
      // corpse died with, and how much of a whole burn it catches (in seconds of burn time, scaled
      // the same way). Both are shares and both are the *only* decay this chain has: each hop is
      // colder, dimmer and weaker than the one before it, so a detonation runs down a crowd and
      // dies out instead of walking the arena off one drifter - which is the rule every other
      // chain in the deck signs (game/burn.js `spread`, game/chill.js `shatter`) and the reason a
      // synergy cannot be a loop that plays itself.
      cold: 0.6,
      fire: 0.6,
      // The flash. It wears *both* of its parents and no third colour of its own: a nearly white-hot
      // ring (the hottest thing in the palette is what a burst of both temperatures at once looks
      // like) with embers and chips of ice coming off it. The ring runs out by the cold the corpse
      // had, so a body that died of one cold shot never claims as much room as one kept under fire
      // (game/chill.js `light` argues the same thing).
      flash: { ring: { radius: 12, speed: 700, life: 0.3 }, embers: { count: 10, speed: 260, life: 0.45 } },
      // The glass, which belongs to a body that actually wore the shell: at the synergy's own gate
      // nearly every kill in a late run is both alight and cold, and a shriek of breaking ice on
      // every one of them would be a hiss (game/chill.js holds its own sound back the same way).
      broke: { count: 12, speed: 300, life: 0.55, sound: { freq: 1300, dur: 0.12, wave: 'square', vol: 0.03, slide: 220 } },
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
    // The two asks a run is given about its own deal (PLAN 3.5, and 3.7 where they are
    // hangar perks). A reroll deals the table again from everything that is *not*
    // already on it; a banish takes one line out of the run for good and deals its
    // replacement. Both cost the ask and not the level: taking a card is the only thing
    // that spends a level, and a charge spent on nothing at all is never charged.
    //
    // PLAN 3.7 sells these as permanent perks, which is how they get *more* than one -
    // the hangar is milestone 8 and there is nothing to buy them from yet, so a run is
    // handed one of each to start with and the hangar will add ranks on top of that.
    // Do not read these two numbers as the perk's price or its per-rank grant.
    rerolls: 1,
    banishes: 1,
  },

  playerHit: {
    // The hit-stop for the ship itself: longer than a big kill's, because this is
    // the one moment in a run the player has to be able to feel.
    hitStop: 0.09,
    sparks: { count: 34, speed: 340, life: 0.8 },
    flashSparks: { count: 12, speed: 200, life: 0.5 },
    ring: { radius: 8, speed: 420, life: 0.5 },
    sound: {
      freq: 150, dur: 0.3, wave: 'sawtooth', vol: 0.16, slide: 60,
      // The thud under the thud, and the reason the row is 0.16 where it used to be 0.2: the
      // tone and the hiss together are allowed to be about what the tone alone was, because
      // this is the loudest thing in the game that happens to a ship more than once in a run,
      // and the voice budget is a sum (audio/mix.js).
      noise: { share: 0.5, dur: 0.34, cutoff: 1100, sweep: 45 },
    },
    // The blanket over the music: the low-pass on its bus is pulled down to 320 Hz, which is
    // under the arpeggio and the top of the pad, so what disappears is the tune and what is
    // left is the bass - being hurt should take the melody away and leave the drive, which is
    // the difference between a flinch and a wall of mud. It is let back up over most of a
    // second, a little under half the time the ship spends blinking (audio/engine.js).
    duck: { to: 320, back: 0.7 },
    // The one thing outside a boss and the end of a run that is allowed to move the
    // window, and it is allowed because it is never routine noise: the ship itself being
    // hurt is the event a player has to feel, and it is the only one of the ordinary ones
    // that a run cannot keep happening to without it meaning something (`screen`, above).
    // A third of what it was, and less than a boss's arrival, so that a boss is still the
    // loudest thing in the room.
    shake: 5,
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
    // The end of a run, which is the loudest thing that happens to you and is now held to
    // the ceiling rather than being allowed past it (`screen`, above).
    shake: 18,
    sound: { notes: [520, 392, 262], dur: 0.32, wave: 'sawtooth', vol: 0.16,
      // The ship itself coming apart gets a large rumble of its own, the same size of one a
      // boss's framework gets: this is the other ending of a run and it weighs as much.
      noise: { share: 0.6, dur: 1.1, cutoff: 1300, sweep: 40 } },
  },

  // The end of the schedule (PLAN 3.4: "after the Eclipse, the run is won"), and the moment it
  // is made of. game/run.js spends it the step the last fight comes down, and a win is an ending
  // the same way a death is: the arena stops, and nothing in it can hurt anything again.
  victory: {
    // How long the arena holds still before the card goes up. The fight's own going-down chord
    // (`bosses.sound.down`) is 1.6 s long and is the first half of the moment; the card landing on
    // its tail is the second half. A card on the same frame as the kill is a cut, and a card two
    // seconds late is a wait - this is the difference between the two.
    hush: 1.6,
    // How long the win answers to nothing at all, counted from the moment the run ended: no key,
    // no click, neither of the two things its card will do (game/run.js `victoryCardIsAnswerable`).
    // The hush alone could not do this - the card arrives at 1.6 s so that it lands on the tail of
    // the going-down chord, and a player still holding the key that killed the last boss would
    // spend it before the words had drawn, which is the complaint this row exists to answer
    // (BUG_REPORT_README: "if the user clicks a button, the final screen is gone ... disable user
    // input for 5 seconds after game completion"). It is not a wait on the card: the card is up
    // from the hush and this is three and a half seconds of reading it.
    guard: 5,
    // The win's own noise, written to sit *on top of* that going-down chord and not after it: the
    // boss's is a C-major arpeggio and this is the same shape an octave open above it, so the two
    // together are one fanfare rather than two arguments. There is deliberately no second cue
    // when the card lands - the run has stopped stepping by then, and the simulation has no
    // business knowing when a card goes up.
    sound: { notes: [784, 1046, 1318, 1568], dur: 1.8, wave: 'triangle', vol: 0.12 },
    // Three things out of the ship, which is where the win happened: the shape a death makes (a
    // burst and two rings) in the colours a win wears - the ship's own cyan, white, and the
    // gold a reward is written in.
    burst: { count: 70, speed: 520, life: 1.1 },
    ring: { radius: 10, speed: 760, life: 0.9 },
    wideRing: { radius: 34, speed: 300, life: 1.4 },
    // No trauma of its own. The last fight coming down is the shake of this moment - the Eclipse's
    // own going-down is 17 of the 18 the room is held to, and the win lands on the same step - so a
    // second shake here would be a number the ceiling quietly ate, and a row nobody can measure is a
    // row nobody can keep. The win's own half of the moment is light and sound.
  },

  // Endless mode (PLAN 3.4: "Endless mode then continues with all values scaling for as long as
  // the player lasts"). The run that outlasted the schedule is handed its arena back and keeps
  // flying with everything it earned (game/run.js `continueRun`). Everything so far is about the
  // hand-back itself; what the run goes on to be faced with is the rest of this row's business.
  endless: {
    // How long the ship is left unhurt after the arena is handed back. The world stopped with the
    // crowd standing where it stopped, possibly on top of the ship, and the ship was never asked to
    // move: a run resumed with no grace at all loses a hull for reading the card. This is the same
    // span a run opens with (`player.startInvulnerability`) because that is what it is - the first
    // moment of a run, with the crowd already here.
    resumeInvulnerability: 1.2,
    // One ring out of the ship and one word over it, which is what says the arena is live again.
    // There is no burst: a resume is not an explosion, it is a door opening.
    ring: { radius: 12, speed: 520, life: 0.8 },
    word: 'ENDLESS',
    wordLift: 16,          // the word floats this far above the ship, as level text does
    // Lower and more open than the win's own chord, and shorter than it: the fanfare has been and
    // gone, and this is the arena being let back in rather than a second celebration.
    sound: { notes: [392, 588, 784], dur: 0.5, wave: 'triangle', vol: 0.09 },

    // What keeps growing once the arena has been handed back, and the rest of PLAN 3.4's sentence
    // ("continues with all values scaling for as long as the player lasts"). Every row here is a
    // rate **per minute past the hand-back**, read through game/endless.js, which is the only file
    // in the game that reads them, and measured by tools/endless-gauge.js.
    //
    // They are per minute of endless and not per minute of run because the run's own clock has been
    // spent: `waves.crowdMax`, `enemies.hpScaleMax` and `enemies.speedScaleMax` are all reached
    // inside the first three minutes, so a second curve built on the same clock would still be flat
    // by the time the last fight walks in. Counted from the hand-back instead, every endless run
    // starts from the same place and grows at the same rate from whatever height it reached.
    //
    //   hullPerMinute    added to a body's hull scale. Uncapped, on purpose: this is the number that
    //                    ends an endless run. A build's damage stops improving when the cards run
    //                    out and the crowd's does not, so the bodies eventually outlast the gun.
    //   speedPerMinute   added to a body's speed scale, up to `enemies.speedScaleCeil` and no
    //                    further. The one growth that has a wall: see that row.
    //   crowdPerMinute   points of enemy added to the director's budget, past `waves.crowdMax`.
    //   bodiesPerMinute  how far the ceiling on standing bodies lifts with it - the crowd cannot
    //                    actually get bigger if the count of bodies says it may not.
    //   bodiesCeil       the wall over that. A frame budget and not a difficulty knob, like
    //                    `waves.maxBodies`: 0.11 ms for a simulation step with this many bodies
    //                    standing on the glass, against 0.04 ms at the schedule's 100 - two of them to
    //                    a 60 fps frame is a fifth of a millisecond, and the rest of the frame belongs
    //                    to the painter. The painter is counted in draw calls and not in milliseconds,
    //                    because that is all there is to count without a browser (`tools/perf-probe.js`,
    //                    re-measured by `test/perf-probe.test.mjs`): this crowd, on the glass with the
    //                    spark cap on, is 2,947 operations a frame and 3,008 on its dearest frame,
    //                    against 1,966 at the schedule's own wall - about nine operations a body over
    //                    an empty arena - and the same bodies *dying* is 3,403, because a death is a
    //                    ring, a fire and a floating number. PLAN section 2's target is 600 enemies,
    //                    and planted that load costs 1.0 ms a step and 8,503 operations - an order of
    //                    magnitude more on the step and about three times as much on the painter.
    //                    So read this the honest way round: the simulation half of the frame is
    //                    not what the wall protects, and the painter's half is what cannot be measured
    //                    here at all - operations are not milliseconds on any machine, and a mid-range
    //                    laptop is the one thing this file cannot weigh. Raising the wall is a browser
    //                    reading away (the F3 plate), not a number away.
    //
    // The crowd and the body count are tuned to reach their walls together: an endless crowd averages
    // about 4.5 points a body, so the 200-body wall is worth about 900 points, which is 500 past
    // `waves.crowdMax` and is what 56 a minute takes eight and a half minutes to reach - the same
    // eight and a half 12 a minute takes to lift the count. Neither wall is decoration and neither
    // arrives before the other.
    //
    // The hull rate is the one that ends the run, and it was set by measurement and not by taste.
    // tools/endless-gauge.js plays a build on into endless and waits, and at 4 a minute it has never
    // yet failed to bury one: **twenty runs** of the strongest build the game can describe (every
    // line maxed, 86 ranks) went down between 14 and 33 minutes past the win, median 22m, and nearly
    // every one of them with the crowd standing at the body wall - which is the shape of the ending
    // this row is for, the bodies outlasting the gun. The same tool on a build that never went deeper
    // than two ranks a line (35 ranks, nearer what a real run has earned by the last fight) goes
    // under in 6 to 16 minutes. At 1.5 a minute two maxed runs were still flying half an hour past
    // the win, which is the failure this row exists to prevent - and half an hour is the other thing
    // to know about this number: a 30-minute cap stopped four runs that were still flying, so a
    // burial check has to be given a cap above it or it is measuring its own cap. That is why `--cap`
    // defaults to 45 and why the gauge refuses to count a capped run as a burial.
    growth: {
      hullPerMinute: 4,
      speedPerMinute: 0.06,
      crowdPerMinute: 56,
      bodiesPerMinute: 12,
      bodiesCeil: 200,
    },
  },

  levelUp: {
    burst: { count: 22, speed: 280, life: 0.7 },
    ring: { radius: 10, speed: 340, life: 0.55 },
    sound: { notes: [660, 880, 1180], dur: 0.14, wave: 'triangle', vol: 0.1 },
  },

  // PLAN section 5's "UI ticks": what the interface itself sounds like. These are not run
  // events - the simulation never queues one (game/cues.js is the only door it has to audio,
  // and `victory` above says why a card landing is not the simulation's business) - they are
  // asked for by `uiTick` in audio/sfx.js, which is presentation and is allowed to know the
  // interface exists.
  //
  // Two rules hold the whole set of them together. One: every tick answers a press that was *taken*,
  // so a key the game refused is silent - a tick that lies is worse than no tick, and the title
  // already works that way for a number with no ship behind it. Two: a rising tick means a yes or
  // a beginning and a falling one means something going away, so they are told apart by their
  // shape and not only by their pitch - the one exception is the mute switch, which is a flat
  // blip because it is not a yes or a no, it is a hello.
  //
  // They are all `must` voices in audio/sfx.js (one per press, never a sky of them), so the
  // numbers below are quiet on purpose: this is furniture, and the loudest thing here is a
  // fifth of the loudest thing in a fight.
  ui: {
    // A ship picked out of the title's list, with the gun it brings. Up, because a pick is the
    // first decision of a run.
    pick: { freq: 480, dur: 0.06, wave: 'triangle', vol: 0.05, slide: 720 },
    // A run launched, or a won one handed back to be flown on. The same rise held longer:
    // nothing else in the interface commits you to as much.
    confirm: { freq: 300, dur: 0.16, wave: 'triangle', vol: 0.07, slide: 620 },
    // A card taken off the table. Loudest of the interface, because it is the one press a run is
    // made of, and it lands over a table of cards rather than over an empty arena.
    take: { freq: 620, dur: 0.09, wave: 'sine', vol: 0.06, slide: 930 },
    // The table dealt again: down, because these cards went away to be replaced.
    reroll: { freq: 700, dur: 0.09, wave: 'triangle', vol: 0.05, slide: 380 },
    // A line cut out of the run for good. Lower than the reroll and sawtooth rather than
    // triangle - the same gesture as a reroll with the edge on it, which is what a banish is.
    banish: { freq: 300, dur: 0.14, wave: 'sawtooth', vol: 0.05, slide: 140 },
    // The pause's GIVE UP chip asking a second press (main.js `pressGiveUpChip`, and
    // test/thumb-giveup.test.mjs holds what it sounds like). It has to be heard, because the press did
    // something - the chip is asking now - and a press that goes unheard on a screen whose every other tap
    // goes back into the run is a press that gets pressed twice by accident. Low and edged like the
    // banish, but *rising* where that one falls, and quieter: it is the sound of a question and not of the
    // thing it asks about, which is the run's own ending and makes its own noise.
    ask: { freq: 230, dur: 0.1, wave: 'sawtooth', vol: 0.045, slide: 320 },
    // A run's card landing, death or win: one soft knock under whatever the arena is still
    // doing, because the card is a period and not an exclamation (the fight has already made
    // its own noise, and `victory.sound` says why the win needs no second cue).
    card: { freq: 190, dur: 0.28, wave: 'sine', vol: 0.06, slide: 120 },
    // The mute switch coming back. Shortest and highest, because it says one word ("you can
    // hear it again") and going quiet needs no sound at all to say itself.
    unmute: { freq: 900, dur: 0.05, wave: 'sine', vol: 0.05, slide: 0 },
    // A slider moved up, and a slider moved down (audio/engine.js `nudgeLevel`). These two are
    // the interface's own yes-and-less: the same pair of shapes every other tick is written in,
    // and they are quietest of the lot because they are played *on the bus being moved* - the
    // level you set is the loudness you hear, so a tick that tried to announce itself over it
    // would be tuning the very thing it is supposed to be telling you about.
    up: { freq: 620, dur: 0.055, wave: 'sine', vol: 0.035, slide: 830 },
    down: { freq: 470, dur: 0.055, wave: 'sine', vol: 0.035, slide: 350 },
    // A screen's door coming open, and going shut (the hangar, from the title and from the death's
    // card). A pair on purpose: a panel that arrives and leaves with the same note cannot be told
    // apart with your eyes shut, and this is a screen you use without looking at the key you press.
    // Between the pick and the confirm in weight, because opening a panel is a step towards a run
    // rather than either of the two decisions themselves.
    open: { freq: 380, dur: 0.09, wave: 'triangle', vol: 0.045, slide: 620 },
    close: { freq: 560, dur: 0.09, wave: 'triangle', vol: 0.045, slide: 300 },
    // The purse spent on a row of the hangar - a ship or one rank of a perk (game/hangar.js
    // `buyRackByIndex`). Brighter and longer than a pick and
    // rising further, because this is the one interface press that costs something: a pick is a
    // decision and this is a payment, and a payment that is not heard is a payment you think the
    // game ate. Nothing at all is played for a buy the purse could not cover.
    buy: { freq: 520, dur: 0.13, wave: 'triangle', vol: 0.06, slide: 1170 },
    // The codex turned to its next rack (main.js `pressCodexPanel`, ui/screens.js `turnCodexRack`). A
    // page turn, and it sounds like one: quieter and shorter than the panel opening, because the panel is
    // already there and only the rack inside it changed, and flatter than the pick - nothing was chosen
    // and nothing was spent, which is the whole difference between this panel and the shop beside it.
    page: { freq: 430, dur: 0.07, wave: 'triangle', vol: 0.04, slide: 500 },
  },

  // The three prompts that teach the hand (game/tutorial.js, PLAN milestone 10). There is no tutorial
  // screen in this game and there is not going to be one: the arena is running underneath a prompt and
  // the eye is supposed to be on the arena, so every number here is about being in the way as little
  // as possible - how often a lesson is offered at all, how long its plate is allowed to stay, and how
  // far away from the middle of the glass it is put.
  tutorial: {
    // How many runs of one save the lessons are offered across. The gate is the run log's own length
    // (game/history.js), which is what makes this the answer to "is this visitor new" rather than to
    // "has this build ever said hello": a save that has flown three runs has either learned these or
    // decided not to, and a save that arrived from an older build - twenty runs, none of them taught -
    // already knows how to play and will not be taught now.
    runs: 3,
    // px of arena the hull has to have covered before "fly" counts as learned. It is the *path*
    // walked and not the distance from where the run started, so flying out and back counts: what the
    // lesson asks is whether the keys do something. At the Wisp's 320 px/s, and 0.13 s to get there
    // (`player.accel`), this is about a second of holding any direction at all.
    travel: 260,
    // px: a body standing this close is something to get away from, which is when the dash's prompt
    // arrives. It is the dash's own distance (`player.dash.distance`, 220 px) on purpose - the prompt
    // appears at exactly the range one dash can cover, neither before it is true nor after it is too
    // late. The firing lesson needs no number like this and has none: its moment is simply that a body
    // is in the arena, because the five primaries' own reaches are between them 260 px and 700 px and
    // a single distance would be wrong for four of the five.
    close: 220,
    // s a prompt stays on the glass unanswered before it steps back, and the s it then waits before it
    // is willing to try again. Nine seconds is about how long it takes a person to finish reading a
    // line they have already read once and looked back at the crowd for; the six after it is what keeps
    // an unanswered lesson off the glass for most of the time it is left on screen.
    hold: 9,
    back: 6,
    // How many times one lesson may fill the plate in a run before it leaves it alone until the next
    // one. Twice. A hint that has been ignored twice is not going to be read a third time, and a plate
    // that came back a third time would be the game admitting it had become furniture.
    asks: 2,
    // s the plate takes coming in, and s it spends going out when the lesson it was telling you about
    // is learned. The way out is the longer of the two because it is the one that has to be noticed as
    // deliberate: a plate that is simply gone the instant you dash reads as a glitch, and one that
    // dims as it goes reads as "yes, that one. That was the one."
    arrive: 0.3,
    away: 0.5,
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

  // Who is allowed to move the window. The owner's rule, as numbers: the room is shaken
  // *extraordinarily* and not otherwise - a boss, a hit on the ship, the end of a run, and
  // nothing between (BUG_REPORT_README). Before that was written down, a ten-minute run spent
  // 30% of its frames with the room moving, 19% of them visibly rolling, and the crowd was
  // shaking the window harder than a boss was - mean 1.73 px of trauma among the crowd against
  // 0.9 px through a whole fight (tools/shake-meter.js, NOTES session 66).
  //
  // So every `shake:` row in this table outside `bosses`, `playerHit`, `runOver` and
  // `victory` is 0, and test/shake-policy.test.mjs walks the table and keeps it that way.
  // What used to shake says what it did some other way: hit-stop, a ring, sparks, a voice.
  screen: {
    // Trauma below this does not move the window at all (render/renderer.js `shakeOffset`).
    // It is the floor the stillness is measured against in tools/shake-meter.js, which is
    // the reason it lives here and not next to the painter: an instrument has to read the
    // same number the thing it measures does.
    shakeFloor: 0.1,
    // How much trauma it takes for the room to be *visibly* travelling rather than
    // trembling - the amount a player would point at and call "it's shaking". Nothing in
    // the simulation reads this; the meter reports the share of a run spent above it, and
    // that share is the one that costs a player their evening.
    shakeNotice: 3,
    // The loudest the window is ever moved, in px. This used to be 30 and it used to be
    // reached by a crowd wiping out around the ship; the ceiling now belongs to the
    // biggest things in the game - a boss coming down (17) and a run's own wreck - and an
    // ordinary nothing can reach it no more.
    shakeCap: 18,
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
