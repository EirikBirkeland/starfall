# Starfall: the full plan

A top-down arena survival shooter for the browser. The player pilots a small glowing ship through
escalating waves, collects shards, picks upgrades, fights bosses, and unlocks new ships between runs.

A first playable version already exists as a single `index.html`. This plan grows it into a deep,
beautiful, finished game. It is many days of work. Go through the milestones in order.
Tick items as `[x]` when done. Each item is sized to fit one session; split it if it turns out bigger.

The file "OVERLORDS_REQUESTS" contains outstanding urgent hotfixes. Prioritize maximally. When a request is completely finished, move the whole entry, with your note on what shipped, to the end of "archive/COMPLETED_OVERLORDS_REQUESTS", so only open requests are left to read.

---

## 1. Pillars

Every decision should serve these. When in doubt, re-read them.

1. **Feel first.** Moving and shooting must feel crisp within the first three seconds. Input lag, floaty
   movement, or weak hit feedback are bugs, not polish.
2. **Readable chaos.** The screen gets very busy. The player must always be able to see their ship,
   enemy bullets, and danger zones. Anything harmful uses warm colours (red, orange, magenta).
   Anything helpful uses cool colours (cyan, green, white). Never break this.
3. **A run tells a story.** Fifteen to twenty minutes, with a clear arc: fragile start → growing power →
   boss → absurd power → final stand.
4. **Choices matter.** Upgrades combine in ways that change how the player plays, not only bigger numbers.
5. **Zero friction.** Loads instantly, no accounts, no downloads, restarts in under a second.

---

## 2. Technical ground rules

- Plain JavaScript ES modules, loaded natively by the browser. No build step, no bundler, no libraries.
- `index.html` holds only the canvas, minimal CSS, and `<script type="module" src="src/main.js">`.
- Rendering on one 2D `<canvas>` filling the window. Offscreen canvases are allowed for caching.
- All sound is synthesised with the Web Audio API. No audio files. (**One exception, on the owner's
  order:** the attract screen plays their recording - see milestone 10 and `src/audio/track.js`. It is
  the only file the game plays, it plays nowhere else, and it is fetched lazily or not at all.)
- All art is drawn in code. No image files.
- Saved data lives in `localStorage` under the single key `starfall.save`, as versioned JSON.
- **Game logic must not touch the DOM, canvas, or audio.** Logic modules take input and time, and
  change state. Rendering and audio read state. This split is what makes headless testing possible.
- Fixed simulation step of 1/120 s with an accumulator; rendering interpolates. Clamp long frames
  to 100 ms so a background tab does not explode the simulation.
- All randomness in game logic goes through one seeded generator (`src/core/rng.js`), so a run can be
  replayed exactly from its seed.
- Performance target: 60 fps with 600 enemies, 1500 bullets, 4000 particles on a mid-range laptop.
  Use object pools for bullets, particles, and enemies. No allocation inside the per-frame loops -
  `tools/alloc-probe.js` weighs a step in bytes and `test/alloc-probe.test.mjs` holds the budgets, and
  that rule is also why every distance in the game comes from `hypot` in `core/math.js`: V8's
  `Math.hypot` takes any number of arguments, so it lays them out in a list on the heap and throws the
  list away on every call, which was three quarters of what a crowded step threw away. The other big
  single win was the sound queue: a cue was an object per sound, and a crowded step asks for several.
- Use a uniform spatial grid for collision. Never test every bullet against every enemy.

### Folder layout to work towards

```
index.html
src/
  main.js              boot, main loop, screen switching
  core/                rng, math, pool, grid, events, save, clock
  game/                state, player, enemies, bullets, pickups, waves, upgrades, bosses, balance
  render/              camera, background, entities, particles, hud, postfx, palette
  audio/               engine, sfx, music
  ui/                  screens (title, hangar, pause, upgrade pick, game over, codex, settings)
  input/               keyboard, mouse, gamepad, touch
tools/
  simulate.js          headless full-run simulation, run with node
  balance-report.js    prints time-to-kill and survival tables
test/                  node --test files
releases/              one folder per release
```

---

## 3. Design reference

These are the target numbers. Keep them all in `src/game/balance.js`, never scattered through the code.
Tune them when the simulation or your judgement says so, and note the reason in `NOTES.md`.

### 3.1 Player

| Property | Start value | Notes |
|---|---|---|
| Max speed | 320 px/s | |
| Acceleration | 2400 px/s² | reaches full speed in about 0.13 s |
| Friction | stops in about 0.10 s | crisp, not floaty |
| Hit radius | 6 px | much smaller than the drawn ship (16 px) |
| Hull | 3 | lost one per hit |
| Shield | 0 | upgrades add it; recharges after 6 s without damage |
| Invulnerable after hit | 1.5 s | ship blinks |
| Pickup radius | 70 px | shards inside it fly to the ship |
| Dash | 220 px in 0.12 s, 2.5 s cooldown | invulnerable during the dash; Space or right mouse |

### 3.2 Weapons

The player has one primary weapon, chosen with the ship, and up to three secondary systems from upgrades.

| Weapon | Fire rate | Damage | Behaviour |
|---|---|---|---|
| Pulse | 6 /s | 10 | straight fast shots; the reliable default |
| Scatter | 2.2 /s | 7 × 6 pellets | 30° cone, short range, heavy knockback |
| Lance | 0.9 /s | 60 | piercing beam line, brief charge-up, hits everything on the line |
| Swarm | 3 /s | 6 | slow homing micro-missiles, small blast |
| Arc | 4 /s | 8 | lightning that chains to 3 nearby enemies, 20% less damage per jump |

Secondary systems (automatic, from upgrades):

| System | Behaviour |
|---|---|
| Orbitals | drones circle the ship and bite whatever they touch: a pair per rank, so the two of them are rank 1 |
| Mines | drops a mine every 3 s; explodes when an enemy comes near |
| Nova | every 8 s, a ring of damage expands from the ship |
| Turret | a stationary turret is placed every 12 s and lasts 10 s |
| Tether | a damaging beam links the ship to its last dash position for 2 s |

### 3.3 Enemies

| Enemy | Hull | Speed | Appears from | Behaviour |
|---|---|---|---|---|
| Drifter | 20 | 70 | 0:00 | walks straight at the player |
| Darter | 12 | 230 | 1:00 | pauses, aims, lunges in a line; telegraph with a thin warning line |
| Tank | 160 | 45 | 2:00 | slow; splits into 2 Drifters on death |
| Spitter | 40 | 60 | 3:00 | keeps its distance, fires slow aimed shots |
| Weaver | 30 | 150 | 4:30 | moves in a sine wave, hard to hit |
| Bomber | 50 | 90 | 6:00 | explodes on death in a telegraphed circle; hurts other enemies too |
| Shielder | 70 | 60 | 7:30 | projects a shield onto nearby enemies; kill it first |
| Splitter swarm | 8 each | 180 | 9:00 | arrives in packs of 20, flocks |
| Sniper | 35 | 0 | 10:30 | stationary, long telegraphed laser across the whole arena |
| Elite variants | × 4 hull | × 1.15 | 8:00 | any type with a gold outline; drops a large shard and a chance of a heal |

Enemy hull scales with time: multiply by `1 + minutes × 0.12`.

### 3.4 Bosses

One boss at 5:00, one at 10:00, the final boss at 15:00. Normal spawning pauses during a boss and its
music takes over. Each boss has three phases at 100%, 66%, and 33% hull. Every attack is telegraphed
at least 0.6 s ahead.

- **The Warden (5:00).** A large ring-shaped ship. Phase 1: rotating spoke lasers. Phase 2: adds
  expanding bullet rings with gaps. Phase 3: spins faster and summons Darters.
- **The Hive (10:00).** A hex-celled mass. Phase 1: spawns swarms from its cells; cells can be destroyed
  one by one. Phase 2: fires spiral bullet patterns. Phase 3: breaks into three smaller hives.
- **The Eclipse (15:00).** A dark sun that pulls the player inwards. Phase 1: gravity plus radial bursts.
  Phase 2: the arena darkens, and only areas near the player and near bullets are lit. Phase 3: sweeping
  arms, bullet walls with moving gaps, and everything from before.

After the Eclipse, the run is won. Endless mode then continues with all values scaling for as long as the
player lasts.

### 3.5 Upgrades

On every level-up the game pauses and offers three cards. The player picks one. Each upgrade has up to
5 ranks. Offer cards weighted towards what the player already has, but always at least one new option
while slots remain.

Stat upgrades: Damage, Fire rate, Bullet speed, Move speed, Max hull, Shield, Pickup radius, Dash cooldown,
Critical chance, XP gain.

Behaviour upgrades:

- **Ricochet**: shots bounce to another enemy, 1 extra bounce per rank. Each bounce
  carries a share of the weight the body it just hit took, and a bounce is only spent
  where the shot would otherwise have died *and* there is nothing left ahead of it to go
  through - so this line buys the crowd beside you while pierce keeps buying the column in
  front of you, and taking both is a shot that ploughs until the plough runs out.
- **Pierce**: shots pass through 1 extra enemy per rank. Each body past the first takes
  a share of the weight the one before it took, so the line buys depth into a column
  rather than multiplying the gun.
- **Split shot**: 1 extra projectile per rank in a fan. Each extra carries a share of the
  aimed shot's damage, so the fan buys coverage across the crowd rather than multiplying
  the gun.
- **Burn**: hits ignite for damage over time; burning enemies spread it on death at rank 3.
  *Done in 0.4.10* (`src/game/burn.js`). The shot that kills a body is what lit it, and a dying
  body is given the share a jump carries rather than a whole burn - that share is the only decay a
  chain has, and what keeps a late run's kill rate from torching the arena.
- **Chill**: hits slow by 8% per rank; frozen enemies shatter for area damage at rank 5.
  *Done in 0.4.11* (`src/game/chill.js`). The frost a body carries **is** its slow: every hit
  takes `step x rank` of that body's own walk away (PLAN's 8% is exactly one hit at one rank),
  a shove is not a walk so bullets and neighbours still push a frozen body clear, and what is
  not being hit melts back through in `melt` seconds - the cold is something a run keeps up
  with aim, not a tax the crowd pays once.
  The second half is the one place this departs from the plan's letter, and a measurement is why:
  a shatter is scaled by how cold the body was (`weight x frost`, and `share x frost` of cold
  thrown to what it catches) rather than paid out only by a body frozen solid. A strong gun
  kills a body with about the first shot that touches it, so three hits to freeze meant one body
  froze solid in a five minute run and the fifth rank bought nothing; now the killing hit's own
  frost is what the corpse is worth, which is the same lesson Burn had in session 38. "Frozen"
  is still what the shell and the full weight mean - only a body kept under fire gets that cold,
  and a lock that has already been taken is never slowed, whatever is frozen.
- **Leech**: every 60 kills heals 1 hull (fewer kills per rank).
  *Done in 0.4.12* (`src/game/leech.js`). The price is what a rank buys - sixty bodies at the
  first rank and six fewer for every rank after it - and the second half is the one place this
  departs from the plan's letter: PLAN's "fewer" cannot mean `60 / rank`, because a fifteen-minute
  crowd comes down at eight bodies a second and at twelve kills a hull the ship would be paid
  back faster than the arena could take hull off it. Flat is what keeps it a recovery and not a
  second game: `60 - 54 - 48 - 42 - 36`. What is not in PLAN and was added because the plain
  reading wastes the card: a charge that comes due while the ship is **whole** is held, one at a
  time, and spent on the next hull the arena takes - so the hit that hurts you is refunded on
  the step it landed rather than the card doing nothing until you are already bleeding.
  Measured on the two bots that can see it (NOTES session 40): handed four ranks, the naive bot
  went from dying on 4 seeds in 16 to dying on none, and its score median went up; paying its
  own levels for it, it did worse, which is the same story every defensive line tells a bot
  whose gun is the only thing keeping it alive.
- **Overcharge**: standing still for 1 s doubles the next shot.
  *Done in 0.4.13* (`src/game/overcharge.js`). PLAN's two numbers are the code's two numbers - the
  first rank is exactly a doubling of the pull, and one second of standing still buys it - and a
  rank buys *weight* rather than a shorter wait, because a shorter wait would make the fifth rank a
  permanent double and stop the card being a decision. Two things the plan does not say, both
  decided and measured: **what spends the charge is a pull of the trigger and all of it** (a
  scatter's six pellets and an arc's whole chain are one shot to the player, and one pellet of six
  is a doubling nobody could see), and **a charge interrupted is cooled and not wiped** - moving
  takes it off at twice the rate it came on, so the card asks the ship to *settle* rather than to
  never twitch, and a dodge between two threats costs a quarter of a charge instead of all of it.
  "Standing still" is two questions - is the ship asking to move, and is it moving - so leaning
  into a wall is not standing and being kicked by your own gun is. Measured on the ladder (a ship
  that never moves: 1.96x at five ranks, between burn and the damage line) and in real runs (6.3
  loaded pulls a minute for a bot that never meant to use the card): this is the one line in the
  deck that is a playstyle rather than a rate, and NOTES session 41 has both numbers.
- **Afterimage**: the dash leaves a decoy that enemies chase for 2 s.
  *Done in 0.4.14* (`src/game/afterimage.js`). PLAN's two numbers are the code's two - one decoy
  at the first rank, chased for two seconds - and a rank buys another decoy laid along the streak
  the dash covered, because that is what makes a rank a different crowd rather than the same crowd
  again (the reach a body has to be inside to be taken in is the near field and not the arena, so
  one decoy fools the bodies you left at a point and five fool the bodies along a line). Two things
  the plan does not say, both decided and measured: **a decoy is a place and not a body** - it is
  not in the crowd, nothing can shoot it, it cannot be hurt and cannot hurt, and it expires on its
  own clock, which is what keeps a ghost from being a second gun that fires itself; and **who chases
  what is worked out again every step** and held nowhere, so a body that walks into a ghost's reach
  starts chasing it and goes back to the ship the moment it goes out, with nothing to remember and
  nothing to clean up. A fooled body is not a stunned one - it walks at full pace, and a promise is
  never broken: a darter mid-lunge and a sniper mid-lock finish what they started whatever walks
  past them. Measured on the share of the near crowd it diverts (6% of it at one rank, 30% at five,
  on a bot given the dash to press - `tools/simulate.js --dash` is new for this card and every
  number in NOTES before it belongs to a bot that never dashed); the deck itself cannot see it, and
  NOTES session 42 says why both bots are the wrong shape for it.
- **Magnetar**: collected shards deal small area damage around the ship.
  *Done in 0.4.15* (`src/game/magnetar.js`). PLAN's sentence is the code: a shard that comes in
  charges the field round the ship and when the field has swallowed `cost` of them it lets go,
  taking one shot of the ship's own gun off every body inside its reach for every rank. Three things
  the plan does not say, each decided and measured. **The field is a bank and not a timer** -
  nothing in the file counts seconds, so the line's rate is the run's own collection rate (measured
  at about one crack a second, from about 220 shards a minute) and a shard picked up in a quiet
  moment is charged for the next crowded one, with the bank carrying its remainder so a gold shard
  is worth six and not "one, rounded down"; and **the light runs inwards, born at exactly the
  reach the damage was paid out at**, because a crack is instant and a nova front travels - the
  ring you watch is the field collapsing back into the ship from the rim it hurt, never claiming a
  wider circle than it came round and never a smaller one. The third rank is the second half: a
  body the field kills leaves a shard, so the crack that clears the pocket pays for the next one,
  and the mint off a corpse is the only tell a crack-kill has. It is deliberately *not* a hit: no
  frost and no fire ride on it, which is the one place the deck's other damage systems stop short,
  because a source that fires once a second would keep the whole near field frozen and alight for
  free and do those two cards' work for them. Measured on the run rather than the ladder, which
  cannot see a line whose trigger is picking something up: five free ranks are 10.7% of a run's
  whole damage and +4.9% on its score, in burn's family and a shade under a rank of the gun
  (`BALANCE.upgrades.magnetar` has the three-condition A/B and the two surprises in it - the near
  field of a fleeing ship is nearly empty, and a better run empties it further).
- **Mines**: drops a mine every 3 s; explodes when an enemy comes near.
  *Done in 0.4.16* (`src/game/mines.js`). PLAN's sentence is the code: every three seconds a rank of
  the line drops a mine out behind the ship and a body that comes inside the ring drawn on the floor
  lights its fuse. Four things the plan does not say, each decided and measured. **A mine is a place
  and not a body** - it is not in `world.enemies`, no body aims at it, nothing can shoot it and the
  crowd walks over it as if it were paint on the floor, which is the contract the afterimage's ghosts
  and the nova's ring already keep and the only way a field of a dozen costs a frame a dozen rings and
  one sprite. **It may never hurt the ship that laid it**, so the card cannot kill its own owner and a
  mine coming apart under your own hull is purely good news. **It winds up before it is live** (`arm`,
  0.6 s), because a mine live the instant it lands is a gun that fires backwards and is paid for
  standing still, which is the mistake the dash line had to be taught out of; and a live mine also
  takes no body twice - it pays its damage the instant it lights and spends the rest of its fuse out
  of the pool, because five mines on one drifter are five detonations and not one. **And the blast is
  strictly wider than the ring on the floor**, which is what lets the ring be drawn at exactly its own
  reach: the circle you are shown is never bigger than the reach the mine has yet, and the light of it
  coming apart is what teaches you the circle was the small number. The mines fall out along the way
  the ship was *going* and not the way it is pointed, so the card pays for running, and a rank buys a
  mine per drop rather than a heavier one, so a rank-five run keeps a whole wake of them standing.
  Measured on the run rather than the ladder, which cannot see a line paid for by a body walking into
  a place: five free ranks are 4.9% of a run's whole damage and +1.1% on its score, and most of that
  damage replaces the gun's instead of adding to it (`BALANCE.upgrades.mines` has the three-condition
  A/B, the front-loading, and why the bot is the wrong customer for a trap).
- **Tether**: a damaging beam links the ship to its last dash position for 2 s.
  *Done in 0.4.17* (`src/game/tether.js`). PLAN's two numbers are the code's two: a dash ties it and
  it is live for two seconds. Four things the plan does not say, each decided and measured. **The far
  end is the place the dash left and the near end is the ship, wherever it gets to** - so the tether is
  born as the dash's own streak, a blade the length of the 220 px the ship threw itself through, and
  then stretches and swings: the tether is the only damage in the deck that is a *line* rather than a
  circle round the hull, and the only piece of ground a run owns by moving instead of by aiming. **It
  pays for turning**: a ship flying straight drags one thread along its own wake and a ship that turns
  sweeps a lane, which is the whole skill of the card and why `reach` is narrow (34 px: a thread, not a
  beam) while its length is free - bounded by nothing but the ship's own speed, since two seconds at
  320 px/s is 640 px of tether. **A rank is another thread, tied along the streak the dash covered**,
  so five ranks are a fan of five cords converging on the ship and a rank buys breadth on the next turn
  rather than the same crowd hit five times - and the whole fan pulses as one weapon, so a body under
  two overlapping threads pays once (`hit / pulses` is the instrument that says whether a rank buys a
  different crowd, and it reads 1.07 bodies a pulse against a mine's 1.11 a blast). **It is a shove off
  the line and never a slowing of the body on it**, and it can never hurt the ship that tied it, which
  is the mines contract and the afterimage contract: a thread is a place, not a body - nothing can cut
  one, nothing can shoot one, and there is nothing to clean up when it lets go. Measured on the run and
  on the dash bot only, because nothing else in the game can see it: the ladder reads 1.00x, and a run
  that never presses dash is *bit-for-bit identical* with five free ranks in it (116,141 score against
  116,141), which is the cleanest gate in the deck - the card is the dash, or it is nothing. On a bot
  that does press it, five free ranks are +3 to 5% of a run's whole damage and about 6% of the damage
  the run deals is the threads' own (`BALANCE.upgrades.tether` has the A/B, the weight sweep that found
  it four times too small, and what the line did to a batch that was dying at eight and a half minutes).
- The five secondary systems from 3.2, each as its own upgrade line.

Synergies (give these a special card frame, and discover them in the codex):

| Needs | Becomes |
|---|---|
| Burn 3 + Chill 3 | **Thermal shock**: enemies that are both burning and chilled explode |
| Ricochet 3 + Arc weapon | **Storm**: every bounce triggers a chain |
| Orbitals 3 + Pierce 2 | **Saw ring**: orbitals grow and spin twice as fast |
| Mines 3 + Magnetar 2 | **Minefield**: shards occasionally turn into mines |
| Overcharge 3 + Lance weapon | **Railgun**: the charged lance crosses the whole arena |
| Nova 3 + Shield 3 | **Aegis burst**: losing the shield triggers a nova |

Built: the first of them, and the mechanism the rest will use. A synergy is a card with `needs` and
one rank, dealt by the run's own build rather than drawn from the deck - the moment both parents are
deep enough it is face up on the next level, in the right-hand place, unbannishable (a run refusing
what its build became is not a choice), and gone for good once taken. Its frame is the two parents'
edges, flame outside and rime inside, with a SYNERGY plate where the banish tab would be. The rule
the card buys is one corpse, one ending: a body that came apart alight *and* frosted detonates
**instead of** shattering and **instead of** passing its fire, paying out hull, cold and fire at once
in one blast scaled by how cold the corpse was. `game/shock.js` argues it, `test/shock.test.mjs`
tests it, and `BALANCE.upgrades.thermalShock` has the measurement.

Storm, the saw ring and the minefield can be built the same way whenever a session takes one; the
railgun has nothing left to wait for now that the lance is in (0.5.0), but its reward needs re-reading
first, because a plain lance already crosses the whole arena - what a *loaded* one should be worth is
the open question, argued in NOTES session 52; and the Aegis burst waits on a shield line the game does
not have yet
(milestone 5 and 3.7).

### 3.6 Experience curve

XP needed for level n: `8 + n × 6 + n² × 0.9`, rounded. A good run reaches about level 35 by the final boss.

The shape and the last two terms are what the code uses. The **base is 90, not 8**, and a
shard is worth **14**, not 1 (both in `BALANCE`), and both were measured (NOTES session 27):
a quadratic cost spends its first levels absurdly cheaply, so at base 8 the whole first
minute of a run is a slot machine, and PLAN's unit was written for an XP income far above
what a run actually collects. The pair is one coupled tuning: the target is that the last
rank of the card pool lands about where a median run ends. Do not "fix" either number back
without measuring that again.

### 3.7 Between runs

Each run awards **stardust**: 1 per 100 score, plus bonuses for bosses. Spend it in the hangar on:

- **Ships.** Wisp (Pulse, balanced, free), Bulwark (Scatter, 4 hull, slow), Needle (Lance, 2 hull, fast),
  Brood (Swarm, starts with Orbitals), Volt (Arc, short dash cooldown).
- **Permanent perks**, 5 ranks each, with rising cost: starting hull, starting shield, stardust gain,
  one reroll per run, one card banish per run, start at level 3.
- **Codex.** Fills in as enemies are met, upgrades taken, and synergies found. Shows silhouettes for
  the undiscovered ones.

Achievements, around 30: first boss kill, win without dashing, win with each ship, reach level 50,
kill 1000 in one run, find every synergy, and so on. Each gives a little stardust.

---

## 4. The look

- Palette, defined once in `src/render/palette.js`: background `#050a1e` → `#0a1638` vertical gradient;
  player cyan `#5ef6ff`; helpful green `#7dffb0`; shards gold `#ffd76a`; enemies in the red to magenta range
  `#ff4d6d`, `#ff7a3d`, `#e04dff`; elites outlined in gold; UI text `#e8f1ff`.
- Three parallax star layers, plus slow drifting nebula clouds drawn once to an offscreen canvas.
- Every entity is drawn as layered shapes: a soft outer glow, a solid body, a bright core. Glows are
  pre-rendered sprites on offscreen canvases. `shadowBlur` every frame is too slow for hundreds of entities.
- Additive blending (`globalCompositeOperation = 'lighter'`) for bullets, particles, and glows.
- Particles: sparks on hit, debris and a shockwave ring on death, thruster trail behind the player,
  shard sparkle, dash streak. Larger enemies leave more.
- Screen shake with a trauma value that decays, so many small hits add up and fade smoothly.
  (Milestone 6 put a gate on this on the owner's asking - it is spent on a boss, a hit on the
  ship and the end of a run, and on nothing else, because a window that moves all run makes a
  player sick. `BALANCE.screen` says who may shake, `test/shake-policy.test.mjs` holds it, and
  `tools/shake-meter.js` measures what a run cost. The trauma model below is unchanged.)
- Hit-stop: freeze the simulation for 40 ms on big kills and 90 ms when the player is hit.
- Enemies flash white for 60 ms when damaged.
- Damage numbers float up and fade; critical hits are bigger and gold. They can be switched off in settings.
- A subtle vignette, and a brief chromatic split on player hit.
- The arena is larger than the screen, 3000 × 3000, with a camera that follows the player and leans
  slightly towards the cursor. The edges are a glowing energy wall.
- An arrow at the screen edge points to off-screen bosses and elites.

### Interface

- Title screen with the logo drawn in code, animated, with the starfield live behind it.
- HUD: hull pips and shield bar top-left; score and time top-centre; XP bar full width at the bottom
  with the level number; dash cooldown as a small ring around the ship; boss hull bar at the top during
  boss fights; small icons for owned upgrades down the left edge.
- Upgrade cards slide in with a short stagger. Choose with the mouse or keys 1, 2, 3. Each shows an icon
  drawn in code, the name, the rank as pips, and one plain line on what it does.
- Pause with Esc or P: resume, settings, give up. Shows current upgrades and stats.
- Game over: score, time survived, kills, level, stardust earned, the best of each, and what killed
  the player. One key to restart instantly.
- All screens work with keyboard alone and with a gamepad.
- Transitions between screens are short fades, never longer than 250 ms.

---

## 5. The sound

Everything synthesised. One `AudioContext`, started on the first key or click.

- Sound effects from oscillators, noise buffers, and envelopes: a distinct shot per weapon; hits pitched
  by enemy size; small, medium, and large explosions; shard pickup that rises in pitch with a streak;
  level-up chime; dash whoosh; player-hit thud with a low-pass sweep over the music; boss warning siren;
  UI ticks.
- Limit how many of the same sound play at once, or the mix turns to mush at 500 enemies.
- Music is generated: a step sequencer with bass, pad, arpeggio, and drums built from synthesis, at 110 BPM,
  in a minor key. Layers come in as intensity rises: pad only on the title; bass and arpeggio in a run;
  drums after 2:00; a faster, harsher pattern for bosses; a stripped, tense version at 1 hull.
- The title's share of that is the one thing here that is not generated: the owner's recording plays on
  the attract screen and the sequencer stands down while it does (`src/audio/track.js`). The run is
  left to the sequencer because a file cannot hear a boss walk in or a hull go.
- Separate volume sliders for music and effects, and a mute key (M).
- A master compressor so nothing clips.

---

## 6. Controls and accessibility

- Keyboard and mouse: WASD or arrows to move, mouse to aim, left mouse to fire, Space or right mouse to dash.
- An auto-fire toggle and an auto-aim toggle (aims at the nearest enemy), so the game is playable with
  one hand or keyboard only.
- Gamepad: left stick to move, right stick to aim and fire, a shoulder button to dash.
- Touch: a virtual stick on the left, auto-aim and auto-fire, a dash button on the right.
- Settings: screen shake strength, flash reduction, damage numbers on or off, particle amount,
  a colour-blind palette that separates harmful and helpful by brightness and shape as well as hue,
  key rebinding, volume sliders.
- The game pauses itself when the tab loses focus.

---

## 7. Milestones

### PRIORITY: firepower first (owner's order, 2026-10-08)

**This is now the current milestone. Do it before any other unchecked item in this plan,
including the rest of milestone 3. Start in your very next session.**

Why: the owner plays the releases, and cannot get far enough to see the new features. The default
weapon is fine for thirty seconds and then the game is only dodging. The player needs to grow
strong, quickly and visibly. More pew pew.

The goal: **median survival of at least 5:00**, reached through the player's weapons and upgrades.

Hard rule for this milestone: **do not make the game easier.** Do not lower enemy hull, speed,
damage or numbers, do not slow the spawn budget or the difficulty ramp, and do not raise the
player's hull. The enemies stay as they are; the player's firepower rises to meet them.

One item per session, as always:

- [x] Level-up choice: the XP curve from 3.6, a pause on level-up, and three cards to pick from
      (mouse, or keys 1, 2, 3). Start with the stat upgrades Damage, Fire rate and Bullet speed,
      5 ranks each. Teach the simulation bot to pick a card, so headless runs still play through.
      **Release as soon as this works**, so the owner can play it.
      (Done in session 27 and released as 0.4.0 - ticked now, three releases late. The XP curve
      needed a base of 90 rather than PLAN's 8 for the first card to land a quarter minute in;
      see PLAN 3.6 and NOTES session 27.)
- [x] Split shot (3.5): one extra projectile per rank, in a fan.
      (Done. The extras carry a share of the aimed shot's damage rather than all of it -
      see `BALANCE.upgrades.split` and NOTES session 28 - so a rank buys coverage instead
      of multiplying the gun, and the aimed shot stays the heaviest thing in the fan.)
- [x] Pierce (3.5): shots pass through one extra enemy per rank.
      (Done. Each body past the first carries `share` of the one before it - see
      `BALANCE.upgrades.pierce` and NOTES session 29 - so the line buys depth into a
      column instead of multiplying the gun, and a rank is worth nothing to a run that
      is fighting one body at a time.)
- [x] Ricochet (3.5): shots bounce to another enemy, one extra bounce per rank. Release.
      (Done, released 0.4.3. A shot that would have died turns on to the nearest body it
      has not been through, within 220 px, and carries `share` of what the body it just
      hit took - see `BALANCE.upgrades.ricochet` and NOTES session 30. A turn is only
      spent where the shot would otherwise have ended *and* there is nothing ahead of it
      to pierce: the two lines divide the work - straight down the line you aimed while it
      lasts, sideways into the crowd the moment it does not - instead of one cancelling
      the other out.)
- [x] Orbitals (3.2): two drones circle the ship and damage on touch, as an upgrade line.
      (Done. A pair per rank, five ranks, on a ring 64 px out that turns at 3.2 rad/s and
      bites whatever stands in it once every 1.5 s - and a bite is one shot of the ship's
      own gun, damage line and all, which is what keeps the line worth taking as the gun
      grows (session 31 measured the flat version of that number and it cost the run a rank
      of the gun every time it was picked). The middle of the ring is a dead zone on
      purpose: it is a wall at a distance you can see, not an aura that forgives you for
      standing in it. See `BALANCE.upgrades.orbitals`, `game/orbitals.js` and NOTES
      session 31.)
- [x] Nova (3.2): every 8 s a ring of damage expands from the ship, as an upgrade line.
      Release.
      (Done. A rank buys one more front inside an eight-second cycle, so rank 1 is exactly
      PLAN's "every 8 s" and rank 5 is one every 1.6 s. A front leaves the ship where it
      stood, travels out to 220 px at 900 px/s, and hurts a body when it comes over it -
      once and only once - so the ring you watch is the ring that hurt you to the pixel, and
      a body that walks in after the front went by takes nothing: it is a wave and not an
      aura, and it throws everything it crosses off the ship on the way. What a crossed body
      loses is one shot of the ship's own gun times 4.5, which is priced on the crowd a
      front really comes over (two and a third bodies, counted over twelve bot runs) rather
      than on a measurement knot, and that is what makes a rank of it worth a rank of the
      damage line - 2.97x a plain gun on a crowd that keeps its distance, in the family with
      every other line. Over 40 seeds the bot took it at face value and lost nothing by it.
      See `BALANCE.upgrades.nova`, `game/nova.js`, `tools/power-ladder.js` and NOTES session
      32.)
- [x] A second primary weapon, Scatter (3.2), and a third, Arc (3.2). Until the hangar exists,
      let the player pick the weapon on the title screen with a key.
      **Scatter done** in 0.3.5: weapons are data (`BALANCE.weapons`) read by one module
      (`game/weapons.js`), the title screen picks with a number key, and the HUD and the
      game-over card say which gun was flown. **Arc done** in 0.4.7: three primaries on the
      rack, and the third is not a bullet with a number on it - `game/arc.js` is a system of its
      own, like the nova and the orbitals, because a bolt that chains is a thing that happens
      *between* bodies. Two deviations from 3.2, both measured and both written beside the
      numbers in `BALANCE.weapons.arc`: the bolt finds the nearest body itself rather than the
      one you are pointing at (that is the gun - the pulse is the weapon you aim, the scatter is
      the weapon you point, this is the weapon you fly), and a landing is worth a whole pulse
      shot rather than PLAN's four fifths of one, because a bolt cannot miss and a landing is
      therefore worth more than a shot. At PLAN's ratio it was worse than the pulse on one body
      *and* worse than the scatter on every crowd, which is not a third primary. It inherits
      neither pierce nor ricochet - those are a shot's business, and PLAN's own Storm synergy is
      where the two meet again - and the split line reads as extra *chains*, because on a gun
      that aims itself the only way to cover more ground is a second place to start from.
      The measurements are in NOTES session 34.
- [x] Survival check. Add a median to `tools/simulate.js` and run at least 20 seeds with the `aware`
      bot picking upgrades. The median must be 5:00 or more. If it is not, add firepower: stronger
      ranks, more ranks, another upgrade from 3.5. Never by weakening the enemies (see the hard rule).
      Write the numbers in `NOTES.md`. Release.
      (Done in 0.4.8, and it passes by the whole width of the window, which is the one thing worth
      reading carefully: `node tools/simulate.js --runs 24 --seconds 900 --need 300` now reports a
      **median of 15m00s - the cap itself - on all three primaries**, with 22/24, 23/24 and 23/24 seeds
      still flying when the window shuts, and at a thirty-minute cap the pulse and scatter batches
      are 8/8 still up. The median is therefore a **floor**, and the tool prints the at-cap count on
      the same line so nobody reads it as a survival time. Under the floor: the `naive` bot, same
      seeds, mediating 2m43s with all 24 of them dying - so the ramp is intact and nothing was softened
      to make the headline number look good. Full table in NOTES session 35.
      *This closes the milestone: go back to the first unchecked item of milestone 3, which is the
      sniper - the one body in PLAN 3.3 that has not been built.*)

How it should feel: by two minutes in, the screen is visibly full of the player's own shots, and
every level-up changes what the weapon does, not only a number.

When an item here is also listed under milestone 4 or 5, tick it there as well.
When every item above is ticked, go back to the first unchecked item of milestone 3.

### Milestone 0: take stock
- [x] Read the existing `index.html` end to end. Write a summary of what works and what is broken in `NOTES.md`.
- [x] Fix any syntax error or crash you can find by reading.
- [x] Create `CHANGELOG.md` and `NOTES.md`. Release `0.0.1` as the starting point.

### Milestone 1: foundations
- [x] Split the single file into the module layout from section 2, with no change in behaviour.
- [x] `core/rng.js`: seeded generator, with tests.
- [x] `core/pool.js`: object pool, with tests.
- [x] `core/grid.js`: spatial grid with insert, clear, and query by circle, with tests.
- [x] Move every tuning number into `game/balance.js`.
- [x] Fixed-step simulation with interpolated rendering.
- [x] Separate logic from rendering completely: `game/` must import nothing from `render/`, `audio/`, or `ui/`.
- [x] `tools/simulate.js`: runs a whole run headless with a simple bot (move away from the nearest enemy,
      shoot the nearest enemy) and prints time survived, kills, and level. Must not throw.
- [x] Set up `node --test` and make it pass.
- [x] Release `0.1.0`.

### Milestone 2: feel
- [x] Player movement to the numbers in 3.1: acceleration, friction, small hit radius.
- [x] Dash with invulnerability, cooldown ring, and streak.
- [x] Arena 3000 × 3000 with the following camera, cursor lean, and energy walls.
- [x] Pre-rendered glow sprites; remove per-frame `shadowBlur`.
- [x] Hit flash, hit-stop, trauma-based screen shake.
- [x] Particle system on a pool: sparks, debris, shockwave rings, thruster trail.
- [x] Knockback on enemies when hit.
- [x] Parallax starfield in three layers and the nebula backdrop.
- [x] Release.

### Milestone 3: enemies and waves
- [x] Enemy definitions as data in one table, with behaviours as small functions.
- [x] Add each enemy from 3.3, one per session, each with its telegraph and death effect.
      Nine kinds, in the order PLAN 3.3 gives them, and the last of them is the sniper below.
- [x] Enemy bullets, in warm colours, with their own pool.
- [x] The wave director: a spawn budget that grows with time and is spent on the enemy types unlocked so far.
      Spawns happen off-screen, never on top of the player.
- [x] Elite variants.
- [x] Off-screen indicators.
- [x] Extend the simulation bot to dodge bullets - and the telegraphs, which turned out
  to be the same item: `tools/headless/threats.js`, `--bot aware` by default, the plain
  bot kept as `--bot naive`.
- [x] Make an elite actually arrive: the seat in a wave was rolled over `waves.maxMembers`
      while a wave is usually half that long, so a real run of eight minutes or more saw
      almost no gold (measured: 0 gold bodies in 6 runs, one of them 11 minutes long).
      The wave now buys its leader first, out of the same room, and deals itself round it:
      20% of waves after 8:00 carry one, which is what the roll always meant.
- [x] Add `tools/balance-report.js`.
- [x] The swarm (PLAN 3.3's "splitter swarm", 9:00): up to twenty small fast bodies that
      arrive as *one member of one wave* and fly as one thing. `game/flock.js` holds each
      pack's middle, its heading and its beat; a body has no opinion of its own about
      where the pack is going. Every few seconds the pack bunches up - which is the
      telegraph, not a decoration on top of it - and then every body flies the one line
      the pack locked when it stopped bunching. "Splitter" was taken by the tank, so this
      kind's word is the flock; see NOTES session 26 for what "8 hull each, 180" became
      and why.
- [x] The sniper (PLAN 3.3's last body, 10:30): bolted to the floor, an eye that turns
      slowly onto the ship, and every few seconds a lock - 1.25 s in which the band of
      light it is about to fire is drawn across the whole arena and the eye *cannot
      change its mind*, so the band you were shown is the band that hurts, edge for
      edge. `game/beams.js` is the fourth damage system and the only one an enemy owns:
      the damage is instantaneous, paid out on the step the beam is born, and the light
      hangs on for a fifth of a second as the record of it - so a body that walks onto a
      beam after it fired is not hurt by it. Its line is clipped to the arena, not the
      screen, and it is drawn whatever the camera is doing, because the whole world is
      the danger zone and the whole world can be read. Being unable to walk also means it
      cannot be kited or run off, so it is landed *inside* the window at a distance and
      announced (`waves.arrival: 'inSight'`), which is the one exception to arriving off
      the edge of the glass. "35 hull" became 12, same rescaling as every other kind.
- [x] Release.

### Milestone 4: upgrades
- [x] XP curve from 3.6, level-up pause, and the three-card choice screen.
- [x] Upgrade definitions as data. Stat upgrades first.
- [x] Each behaviour upgrade from 3.5, one per session, each with a test of its logic.
      (All nine are in, and each has its own module and its own test file: Ricochet, Pierce, Split
      shot (0.4.1-0.4.3), Burn 0.4.10, Chill 0.4.11, Leech 0.4.12, Overcharge 0.4.13, Afterimage
      0.4.14 and Magnetar 0.4.15. Of the five secondary systems of 3.2, Orbitals and Nova went in as
      upgrade lines in 0.4.4 and 0.4.5, Mines in 0.4.16, Tether in 0.4.17 and Turret in 0.4.18, which
      is the last of the five secondary systems of 3.2.)
- [x] Each secondary system from 3.2, one per session.
      (All five are in as their own lines with their own tests: Orbitals 0.4.4, Nova 0.4.5,
      Mines 0.4.16, Tether 0.4.17 and Turret 0.4.18 - "a stationary turret is placed every 12 s and
      lasts 10 s", which went in as a gun planted across the road the ship is travelling down, so that
      the two lines that own the arena floor own opposite halves of it: mines arm where you have been
      and turrets arm where you are going.)
- [x] Card offer weighting, reroll, and banish.
      (The weighting was already in - `BALANCE.cards.bias` favours the lines a run already
      has, and the deal never lets a table go without one line the run has never taken. The
      two asks went in as `rerollOffer` and `banishOffer`: a reroll deals the table again
      from everything that is *not* already face up, a banish takes a line out of the run's
      deck for good and fills its slot, and neither spends the level, which is still paid by
      taking a card. A run is granted one of each (`BALANCE.cards.rerolls`, `.banishes`),
      spent with R and Shift + a card's number or with the two chips under the cards, and an
      ask that could buy nothing is refused and kept. The hangar of 3.7 sells more of both.)
- [x] Synergies, with their special card frame.
      (The first one is in: **Thermal shock** - Burn 3 + Chill 3, and a body that comes apart both
      alight and frozen takes the room around it with it (`game/shock.js`, `BALANCE.upgrades.thermalShock`).
      A synergy is a fifth kind of card, not a line: one rank, never drawn out of the deck, dealt only
      to a run that has earned it (`needs` in its balance entry, `readySynergies` in `game/upgrades.js`),
      never banishable, and worth a whole `+5.9%` of a run's damage at weight 4. On a body that wore
      both parents it pays one ending and not two: the detonation stands in for the fire's jump and for
      the shatter, and the corpse's fire is spent inside the blast. The special frame is in `render/cards.js`:
      the flame as the card's outside edge, a line of rime just inside it, a SYNERGY plate where a line's
      banish tab would be, and the two parents named where a line's rank pips are - both parents' colours
      and no new hue and no new sprite, because the glow cache had no room for one.) (The frame and the first of the six are in -
      `game/shock.js`, and the table above says which four are left and what each is waiting for.)
- [x] Owned-upgrade icons on the HUD.
      (The rail: one row per line the run has taken, down the left edge, in the deck's own order,
      wearing the mark the card sold it in with one pip per rank - `render/hud.js`. The icon shapes
      and tints moved out of `render/cards.js` into `render/icons.js` so the rack and the rail name
      the same thing with the same picture, and a line's own module now answers how near its next
      beat is (`dueOf` in `game/nova.js`, `game/mines.js`, `game/turret.js`), which the three lines
      the arena cannot show - a nova front already in the air, mines dropped behind the ship, the
      gap after the last crew - wear an arc over. Rows shrink with a short window and the rail wraps
      into another column rather than cut a build short. `test/build-rail.test.mjs` owns it, and the
      art files now measure the arena with the interface subtracted (`tools/headless/frame-cost.js`),
      because a frame costs a mark for every line a run owns.)
- [x] Release.
      (Shipped as 0.4.0 through 0.4.21 - the tick was left behind at the time.)

### Milestone 5: weapons and ships
- [x] Weapon definitions as data; the five primaries from 3.2, one per session.
      (Done. The data half has been true since 0.3.5: `BALANCE.weapons` is the whole of a gun and
      `game/weapons.js` reads it, so the title screen and the tools grow by themselves when a primary
      lands. All five are in now - Pulse and Scatter (0.3.5), Arc (0.4.7), Lance (0.5.0) and Swarm
      (0.5.1), each with its own test file and its own module wherever it needed one. Three of them
      are not a fan of shots at all: the arc finds its own bodies (game/arc.js), the lance lays down a
      line (game/lance.js) and the Swarm's shots steer and go off where they land (game/missiles.js).
      `tools/power-ladder.js --weapon` and `tools/gun-clock.js` are the two instruments a new row is
      priced on, and `test/weapons.test.mjs` asks each row for the numbers its own kind of pull needs.)
- [x] Ships with different hull, speed, weapon, and drawn shape.
      (Done in 0.5.2. `BALANCE.ships` and `game/ships.js` hold what a ship is - hull, top
      speed, how long its dash takes to come back, the primary it brings, any upgrade rank
      it arrives with, and the silhouette `render/shapes.js` draws it as - and the title
      screen's rack is the five ships of 3.7: WISP - PULSE, BULWARK - SCATTER, VOLT - ARC,
      NEEDLE - LANCE, BROOD - SWARM, in the primaries' own order so a number key still means
      the gun it always meant. A ship is the body and the gun in one pick, which is what keeps
      it five combinations to balance rather than twenty-five, and what lets the ship pick
      replace the gun pick without taking one thing off the title screen. The hitbox and the
      drawn radius are deliberately *not* ship numbers: every ship is hurt by the same 6 px
      core and drawn at the same scale, so the five read differently without one of them being
      a bigger target than another.)
- [x] Release.
      (0.5.2 - the five ships, and with them milestone 5.)

### Milestone 6: bosses
- [x] Boss framework: phases, hull bar, intro warning, spawn pause, arena lock.
      (`game/bosses.js` owns the five duties and `game/field.js` owns the box the duel is fought
      inside. A boss is an enemy - same `makeEnemy` through `opts.kind`, same `damageEnemy`, same
      `killEnemy` - so nothing in the game has to remember to shoot it. The schedule is
      `BALANCE.bosses.schedule` read off the run's clock; the warning is a siren and a name on the
      glass for `bosses.warn`; the director holds while `world.boss` is anything at all; the cage
      closes when it arrives and opens the instant it stops existing; three phases at
      `bosses.atHull` each with a flare, a moment of immunity and a volley dropped.
      `test/bosses.test.mjs`, `test/warden.test.mjs`, `test/boss-art.test.mjs`, and
      `tools/simulate.js --at <seconds>` to measure a run that starts at five minutes.)
- [x] The Warden, one phase per session.
      (Shipped, all three. Phase 1 is the whole attack in miniature: a ring that rides, stops
      dead, shows its spokes and fires down them. Phase 2 throws a ring of shots with a door in it
      between the spoke volleys, lit as a wedge for `bullets.windup` before it leaves, opened on
      the ship's own bearing and then held - two beats taking one another's turns, so one rhythm
      holds two things to read. Phase 3 prices both harder and adds the third beat: a call of
      darters out of its own hoop, telegraphed as marks on the rim at the exact bearings and size
      of the bodies that come out of them, on the far side of the ring from the ship, and made
      only when nothing is left of the last call - so the summons are a beat the ring borrows and
      not a third clock it keeps. `test/warden.test.mjs` owns all of it, and
      `test/bosses.test.mjs` holds every beat of every phase to `telegraphMin`.)
- [x] The Hive, one phase per session.
      (All three, and the three permissions the first two cost the framework: a row names its
      `rhythm` (`ring` for the Warden, `mass` for this one), a boss may walk, and a boss may be
      made of bodies. The Hive is a core with six rooted hex cells round it, and its one beat is an
      opening - a share of the cells that are still standing light for `windup`, then each of them
      lets out a pack of swarmlings out of the side facing away from the core. Breaking a cell
      takes a share of the hull off the bar, costs the hive a mouth, and pays its own score and
      shards, which is the whole of the reason the honeycomb is there. The third phase breaks it
      into three smaller hives: the flare is the coming apart, and what stands up in its place are
      three bodies each with a honeycomb of its own, each told a side of the ship to keep, sharing
      the hull the fight has left so that the bar does not move across the split and one hull bar
      is still one fight (`split` on the third phase of `bosses.hive`, game/bosses.js
      `spendSplit`). Not shipped from 3.4's Hive row: phase 2's spiral bullet pattern - the second
      phase is the brood priced hotter and turned faster instead, and the hive has no gun. Either
      a session gives it one or that half line becomes [skipped] with a reason.
      `test/hive.test.mjs` and the mass tests of `test/boss-art.test.mjs` own all of it.)
- [x] The Eclipse, one phase per session, including the darkness effect.
      (Shipped: the arrival, the drag, the shell, the dark, and the blades - three phases, one bar,
      one flare each, PLAN's phase-2 darkness, and PLAN's phase-3 sweeping arms. It asked the
      framework for one new permission and one new rhythm: **a fight may move the ship**.
      A phase row may carry `pull`, spent once per step along the line from the ship to whichever of
      the fight's bodies is standing, as a *place* the ship is taken to and not as a force on its
      engines (game/player.js `dragShip`) - the engines are steered back to the controls every step
      and would veto a force, which is not the bargain a dark sun offers. It stops at the rim of the
      body that hurts on contact, so it can never feed the ship into the fight, and it is off through
      a phase flare. The rhythm is `sun`: it turns on the spot like the ring *and* holds a band like
      the mass, which is why it is a third rhythm; and it is the first boss whose one beat is not
      alternated with another, so a beat a phase never wrote is now never taken (game/bosses.js
      `alternateBeats`). The beat is a shell of shots out of the rim with the Warden's own door, held
      open on your bearing - and because the drag points at the body it can only ever carry you down
      the door you were shown, never out of it. And phase 2 puts the arena under: a phase row may
      carry a `dark` ask and the framework owns the ramp to it, so the night arrives *through* the
      flare that opens the phase and walks back into the light by itself the moment nothing asks for
      it - there is no reset to forget (game/bosses.js `stepDarkness`, `world.darkness`). It is a
      **veil** and not a dimming (render/darkness.js): the room is covered up and what is left are the
      holes cut in the covering by what is shining - the ship, every shot in the air at its own
      reach, the fight's own bodies, and the door a shell is being promised through, which is let out
      of the same wedge its light is drawn from or the dark would be eating a promise. The pass is
      paint the simulation describes and never obeys: nothing in game/ reads `darkness` back, and
      every fingerprint of every run is unchanged by it. And the last phase lifts an arm: a beat may
      now be a **sweep** (`sweep`, game/bosses.js `showArms`), a fan of blades shown as the whole of
      the way each blade travels and then let go of, after which they are the world's business and not
      the fight's - one pool of their own (game/arms.js), turning, paying out a hull, still sweeping
      after the body that loosed them has gone down. A beat's harm that *moves* is the one exception to
      "a boss stands still while it shows", and it gets round the rule the way every other promise
      here does: the fan is the harm, edge for edge, and the frame and the night cut it out of the same
      question (render/arms.js), so the dark this fight brings cannot eat it. And PLAN's "bullet walls
      with moving gaps" is a **walking door** (`gapWalk`, `gapSettle` on the third phase's shell): the
      door is opened on the ship's own bearing as ever, then travels 1.2 rad over the wind-up and
      stands still for the last 0.26 s of it before the wall is thrown round the place it stopped, so
      the harm never moves and only the promise does - and the whole route is lit from the first step
      of the wind-up (render/entities.js `doorWedge` answers the route and `doorNow` the door, and the
      night leaves both out) for the same reason a fan is lit end to end. It alternates direction on
      the count of shells thrown, which is a rhythm and not a roll, and only the last phase has it.
      `test/eclipse.test.mjs`,
      `test/darkness.test.mjs`, `test/darkness-art.test.mjs`, `test/arms.test.mjs`,
      `test/arms-art.test.mjs` and the sun tests of `test/boss-art.test.mjs` own what is here.)
- [x] Victory screen and the endless mode that follows.
      (Shipped in two halves. **The win**: an ending that is not a pause - the arena stops, the fight's
      own going-down is heard over a still room for `victory.hush`, and a mint-and-gold card arrives
      late saying ARENA CLEARED, the fights it took, the score and the build; `world.overTimer` is one
      clock behind both the card going up and the keys answering it, and the keys answer to nothing at
      all for the first five seconds, because a card that can be clicked away before it has been read
      has not been shown (game/run.js `winRun`, `victoryCardIsUp`, `victoryCardIsAnswerable`; it is
      the last fight on the schedule coming down that wins the run, game/bosses.js, so adding a fourth
      boss moves the win and nothing else has to be told). **Endless**: that card is a door *into* the
      run - the same key that would have begun a new one unwinds this one back into `PLAY` with
      everything it earned (`continueRun`), and the schedule stays spent, so from there the wave
      director is all there is to fight. And it scales, which is the rest of the sentence: every
      ceiling the schedule spends in its first three minutes is behind the run now, so a **second
      clock**, counted from the hand-back and not from the start of the run, keeps a body's hull and
      the crowd's budget growing for as long as the run lasts, and lifts the ceiling on how many
      bodies may stand at once with them (game/endless.js, `BALANCE.endless.growth`). Two of the four
      are uncapped on purpose - hull and crowd are what end an endless run - and two have walls:
      speed stops where the fastest kind has outrun what a ship can be asked to dodge, and the body
      count stops where the frame budget says to stop. `tools/endless-gauge.js` prints the curve and
      then plays a fully-built run into it and waits: at these numbers every run it has buried went
      down, twenty maxed builds between 14 and 33 minutes past the win (median 22m), nearly each of
      them with the crowd standing at the wall, and a build that never went deeper than two ranks a
      line goes under in 6 to 16. The glass says where the run is: `ENDLESS +7m` beside the clock, and `ENDLESS FOR
      7m12s` on the card that finally says where it ended. `test/endless-growth.test.mjs`,
      `test/endless.test.mjs` and `test/victory-card.test.mjs` own all of it.)
- [x] Release. (0.6.0 - 0.6.12: three fights, their telegraphs and their doors, the night, the win, and the endless
      stretch that follows it.)

### Milestone 7: sound
- [x] Audio engine: context start on first input, master compressor, music and effects buses.
      (The compressor was already in - `buildMaster` in `audio/engine.js` runs the master bus through
      one and falls back to a bare gain on a browser that has no `createDynamicsCompressor`. Now the
      two buses too: effects and music each connect to a gain of their own hanging upstream of the
      master, so mute is still the one value that goes quiet whatever is scheduled, the effects' own
      loudness numbers (audio/mix.js) are repriced by nothing, and the music can be balanced against
      the fight without touching a voice of it. The effects bus sits at 1 for exactly that reason;
      the music bus at half, which puts the heaviest bar the sequencer can write at a tenth of full
      scale. `test/mix.test.mjs` owns the graph, including the machine that has no compressor.)
- [x] Effects for shots, hits, explosions, pickups, level-up, dash, player hit, UI.
      (Every one of those already had a voice - one row per gun, one per kind's going-down, a chime
      for a level, a thud for being hurt - and three of them were not what their name said. **A hit
      is now the body's own note**: twice the radius and an octave down, which is the one mapping
      that stays musical over bodies from 7 px to 60 (a swarmling takes a shot at 617 Hz, a drifter
      at 288, a tank at 166, a boss's framework at the floor of the band, clamped so a nonsense body
      still ticks and does not whistle), where the whole crowd used to share one 300-360 Hz click.
      **A pickup rises with a streak** (PLAN's own words): each shard that lands inside 0.15 s of
      the last lifts the note one semitone, to one octave over the plain note, and the note comes
      home when the loot stops - so a kill's handful is a little run up the scale and a stroll
      between kills is the plain note again. The streak is timed and not counted
      (`world.shardStreak`), because a counter would sit at the top of its range by the second
      minute and stop saying anything, and the ping's old 270 Hz of jitter - twice the whole climb -
      is 12 Hz now so what is heard is the climb (both numbers measured over six bot runs, NOTES 70).
      And **the interface finally answers**: `BALANCE.ui` has six ticks - a ship picked, a run
      launched, a card taken, the table dealt again, a line cut out of the run for good, and a run's
      card landing - plus one for the mute switch coming back, because going quiet is already its own
      answer. Those are the only sounds in the game the simulation did not ask for: a screen goes up
      on a frame and not on a step and `game/` may not know audio exists, so `main.js` and
      `ui/screens.js` go to `audio/sfx.js` `uiTick` directly and the cue queue stays the run's only
      door. Every tick answers a press that was *taken*; a key the game refused is silent, so the
      sound never lies about what a key did. `test/pitch.test.mjs` owns the two pitch stories at the
      cue queue (nine bodies, nine notes, the ceiling is an octave, the row goes cold) and
      `test/ui-sound.test.mjs` walks the interface in order and reads back the note each press was
      answered with - the fake audio device logs a voice's pitch now, which is how a test can tell a
      tick from a thud.)
- [x] Voice limiting.
      (`audio/mix.js`: the master bus is allowed `MIX.headroom` worth of sounding voice volume,
      priced in each cue's own `vol`, and a voice pays for as long as it can be heard - so a sky
      of hit ticks is deep and a sky of wrecks fills in four, which is the difference PLAN asked
      for between "how many sounds" and how much sound. A frame's cues are looked at all together
      and spent loudest first, so the bomber goes off and the thirtieth shard ping does not, and a
      chime is never turned away because a chime is the run talking and not another tick. A real
      three-minute run now peaks at 16 sounds in a frame instead of 21 and spends 14% less overall;
      `test/mix.test.mjs` owns all of it, including the machine with no compressor.)
- [x] The step sequencer and the base music pattern.
      (`audio/music.js`: a 16th-note grid at 110 BPM in A natural minor - Am F C G, one chord to a
      bar, four bars to a loop - with three synthesised layers over it: a detuned two-oscillator
      pad that owns the title, a sawtooth bass walking to the fifth and the octave, and a square
      chip arpeggio two octaves up. The frame loop winds it (main.js, next to the cue drain) and
      the schedule belongs to the audio clock, half a second ahead of it: a frame that arrives late
      finds the music already queued, and a clock that ran *past* the music - a backgrounded tab,
      a card left up, the hush, the death - is re-anchored and starts again from the top of the
      progression instead of dumping the past on the present. The state says which layers are on
      (the run paused for its cards keeps its music; the win's hush and the death's card are silent
      on purpose); the music is deliberately outside the voice budget - a sequencer knows what it
      will play, and even its loudest bar only peaks at two-fifths of what a full sky of effects is
      allowed once its bus has taken its half. Drums come in with the intensity item, since they
      enter *after* 2:00. `test/music.test.mjs`
      owns all of it - the clock, the density, the clean silences, and the no-chase rule.)
- [x] Intensity layers, boss music, low-hull variation.
      (`audio/music.js`: the sequencer's layers are now *patterns* - whole sets of parts, not
      switches - and `patternFor(world)` picks one from what the run says about itself. Five of
      them: the title's pad; the run's bass and arpeggio; **`driving`**, which is that same
      groove with a drum kit laid on it and is what a run gets from 2:00 (PLAN's own threshold,
      read off `world.elapsed`, measured as the kit appearing and nothing else changing - the
      groove under it voices the same notes either way); **`boss`**, which speeds the whole grid
      up by a third (166 BPM feel, chord changes included, because a "faster pattern" that only
      speeds one layer up is a stutter), writes sixteenths where the run writes eighths, doubles
      the detune on its pad and voices that pad with the scale's second rubbing on the root -
      the sharpest rub the key can ask for without leaving it; and **`last`**, the stripped one
      at one hull left, which is a long low drone, one high note to a bar and a heartbeat at
      about resting rate - no groove, no kit, no arpeggio. The last hull outranks a boss being
      in the arena, deliberately: taking the groove away lands harder than adding to it. Measured
      through the fake audio device, notes per second of run: 8.9 in a run, 12.5 driving, 27.4
      through a fight, 5.1 on one hull - and the grid itself measured at 9.8 steps a second
      under a boss against 7.3 everywhere else. The music now keeps its own books to prove it:
      the ledger counts drum voices and the seconds spent in each pattern, which is the line
      `tools/simulate.js --audio` prints as the run's intensity curve (`run 2m02s, driving
      3m05s, boss 4m54s`). And because the sequencer is deliberately outside the voice budget,
      its loudness is metered instead: `patternPeak` lays a pattern's bar out on its own grid,
      envelopes and all, and answers its loudest instant - title 0.18, run 0.36, driving 0.45,
      boss 0.50, last 0.33, with `MUSIC.peakLoad` at 0.5 and a test refusing any pattern over
      it, plus one that proves the meter still reads the tables it claims to. Drums are the
      noise buffer and a falling triangle for the kick, so nothing about them is a sample.)
- [x] Volume settings and mute.
      (Two sliders, one per bus, and the mute above them (`audio/engine.js`): 10 positions each,
      the top one being exactly the shipped mix - 1 on the effects bus, 0.5 on the music's - so
      the sliders can only ever take loudness away and cannot un-measure the game. A step is
      **2 dB**, not a twentieth of the gain: `levelGain` is one exponential curve over a 20 dB
      span, so ten presses cover the range in ten equal-sounding steps and 0 is a hard zero
      rather than a very quiet something (a linear slider spends half its presses on the loudest
      third of the range). Keys, not faders, until milestone 9's settings page: `[`/`]` for the
      music, `-`/`=` for the sounds, one step per press with auto-repeat ignored, and a press at
      the end of the travel refused in silence like every other refused press. **A press is
      answered on the bus it changed** - the sounds slider ticks through the sounds bus
      (`BALANCE.ui`'s new `up`/`down`, rising and falling like every other tick) and the music
      slider plays one A through the music bus (`auditionMusic`, only when there is a pattern to
      sit under, so the death's card stays honest), which means the answer is made of the very
      thing that moved. The mute is untouched by all of it: it is the master gain, upstream of
      which both buses hang, so it is still the one value that goes quiet whatever is scheduled,
      and the music's muffle sits downstream of the music bus and is repriced by nothing. Bus
      gains glide over 15 ms so a step cannot click a pad that is mid-chord. And because a key
      that changes something invisible is a key that might not have been pressed, the mixer is
      painted on the glass for a moment and a half after any of it (new `render/volume.js`, drawn
      over everything including the cards): both rows, which one moved, the keys, and `MUTED`
      while the master is shut - the readout computes its own layout in `panelLayout` so a test
      can measure it without pixels. The title's control list says the keys exist.
      `test/volume.test.mjs`, 21 tests: the shipped mix at the top of both, the graph built at
      wherever the sliders stand, the equal-dB curve, one bus per slider, the clamps, the refused
      press being silent *and* dark, mute above the sliders, every pitch each key answers with,
      the audition staying out of the sequencer's ledger, the readout answering over the cards
      and over the death's card and fitting its own plate. `STARFALL.stats()` reports the two
      levels and the mute, and the reference run still traces byte for byte the same game.)
- [x] Release. (0.7.4, which is the whole of milestone 7: the sound has a body, a vocabulary, an
      intensity ladder of its own, and now a player with a say in how loud each half of it is.)

### Milestone 8: between runs
- [x] The save module: versioned, validated on load, falls back to a fresh save if corrupt. With
      tests. (Done: one document under `starfall.save`, holding the best score and the two volume
      sliders with the mute. A document from a newer build is read and never overwritten, and the
      older releases' plain `starfall.best` key is read on load and mirrored on write for as long
      as the menu offers those versions.)
- [x] Stardust rewards and the hangar screen. (Done: a run pays stardust when it ends - 1 per 100
      score, 100 per fight the schedule sent that came down, 500 for walking the schedule out - and
      the purse lives in the save document. The hangar is an overlay over the title and over the
      death's card, opened with H: the rack with each ship's hull, speed, dash and gun, the purse,
      and the number keys that pick. Ship unlocks and the perks that spend the purse are the next
      item; they land in this screen.)
- [x] Ship unlocks and permanent perks. (**Ships:** four of the five are behind a price now -
      250 / 700 / 1,300 / 2,200 of stardust, the Wisp free - and what the purse has bought is
      remembered in the save document, so the next visit starts owning them. The rack dims a ship you
      have not bought, prints its price and the key that pays it (`SHIFT` with its number), and a
      number for a locked ship puts the hangar up instead of doing nothing. **Perks:** four of the
      six this plan listed, 5 ranks each on a rising ladder, bought the same way with the keys after
      the ships' (6-9): plating on the starting hull, a stardust gain, one reroll per run, one card
      banish per run - each one at the gate it buys (game/perks.js), and the whole ledger remembered
      in the save. The two left out are a starting shield (a pip that cannot be spent, against hull
      that can) and a level of head start (a build somebody else played); the reasons are in
      game/perks.js's header and NOTES, and the ladder can gain rows later.)
- [x] The codex. (Done: `C` puts it up - the same kind of overlay the hangar is, over the title and
      over the death's card, and never both at once. Three panels of rows: HOSTS (every kind in
      game/kinds.js, then every fight on the schedule, each named and said in one line), CARD LINES
      and SYNERGIES, all of them said in the card's own words, so nothing is described twice. What has
      been met is lit and what has not keeps its row and says `UNKNOWN`; the panel opens with `MET n
      OF 30`, and an ending whose run discovered something says how much on its card.
      **Met** means: the run's tally saw a body of that kind arrive, a fight's schedule entry was
      spent or that fight was standing when the run stopped, and a card was taken - all of it read
      from a run that has stopped, so none of it is in the step (game/codex.js). Remembered in the
      save document (`codex.hosts`, `codex.lines`) like the purse and the ships.)
- [x] Achievements, with a small toast when earned. (Done: thirty of them, each one sentence about a
      single run and each paying stardust once, the first time this save's tally passes its rule - and
      the purse's total says what the awards paid beside what the runs did. The whole table is
      **readable on the back of the hangar**, a third rack beside the ships and the
      perks, in the one place stardust is already said: the purse above and the thirty ways it was
      earned under it, a won row lit and needing no number, an unwon one dim and saying what it still
      pays. Its heading says `AWARDS 7 OF 30`, the same number the title says, painted from the same
      ids (ui/screens.js `showAwards`). Not a fifth codex rack: an award is stardust and not a thing a
      save met, the codex's `MET n OF 30` would otherwise have started meaning two things, and four
      racks is as tall a panel as a short window has. The rows quote the table - name, sentence, price
      - so the rack, the plate and the card cannot disagree (game/awards.js). Earned ones are
      remembered in the save (`awards.won`); the live ones are announced on the glass by a plate that
      falls in, holds and fades (render/toast.js), with the sound the codex opening uses. A rule is
      read off the run's tally and the schedule at the end of a step, never in the middle of one
      (game/awards.js), so a player who has already seen an award is not told twice and an old save
      starts clean.)
- [x] Run history: the last 20 runs with their seed, ship, time, and score. (Done: the codex's fourth
      rack, `PAST RUNS`, read with `C` and painted at boot and at every ending like the three panels
      beside it. It is not a fifth screen on a fifth key and not a row in the hangar: a run is a thing
      this save has done, which is the codex's subject, and a row with no key and no price has nothing
      to do among rows that can be bought - the same argument that put the codex on its own key. A row
      reads `SEED 41832`, then `WISP · 12m04s · 18,300 · CLEARED`: the seed first, because that is
      how a run is asked for again (`?seed=`), then the four facts - and a fifth the plan did not ask
      for and the row needs, whether that run cleared the schedule, because a cleared run and a wreck
      that both scored 18,300 are not the same memory.
      One row per run and not one per ending (game/history.js): a run that was won, handed back and
      finally buried rewrites the row it wrote at the win rather than adding a second one, so the log
      says how the run ended and not how many times it stopped; nothing is deduped, so the same seed
      flown twice is two rows, and the order is newest first because that is the information. Stored
      in the save document as `runs.log` - which needed a new kind in the store, a list of small
      *records*, judged whole rather than field by field and never reordered, unlike the sets and the
      tally it sits beside (core/save.js `records`). The visit reads at most what this build keeps
      (BALANCE.history), so a log left by a build that kept more is read as this one's log.)
- [x] Release. (0.8.7, which closes this milestone: the awards table became readable on the back of the
      hangar, which was the one part of it nobody could look at.)

### Milestone 9: interface and access
- [x] Animated title screen and logo. (`render/logo.js` draws STARFALL as neon tubes: an alphabet of
      six angular letters, each one a few straight lengths stroked three times from a wide halo to a
      hot core, and no font anywhere in it. The title arrives by writing itself - a pen lights a
      letter every 0.09 s, then the rule under the word shoots out from the middle - and the words
      below it rise in after it (index.html `.rise`, a quarter of a second each, which is section 4's
      rule for a screen changing). Then it never quite sits still: the word breathes, a shine travels
      along it, and a star falls past - tilted the way the sky's own drift falls - every seven
      seconds, lighting the letters as it passes. *Where* it sits is the DOM's answer and not the
      canvas's: `#logoBox` is an empty heading inside the flex-centred column and main.js measures it
      at boot and on every resize, because the canvas cannot ask what flexbox did. Its size comes from
      that box too, bounded by it rather than read off it, so a page that measured nothing cannot get a
      windowful of letters by accident. `prefers-reduced-motion` is read twice - the CSS stops its
      fades and the canvas puts the mark up already lit and holds it there - and the starfield and the
      attract crowd were already live behind the title.)
- [x] Pause screen with stats. (`Esc` or `P` holds a flying run where it stands and puts up a panel of
      its own, the third of them: the run's numbers on one rack - ship and gun, level, hull, kills,
      shards, wave, fights, what the run is worth into the purse, best, seed - and what it is built
      from on the other, one row per line taken in the cards' own order quoting the card's own words,
      with the lines the run cut out of its own deck after them, dim. `G` - offered on that panel and
      answered nowhere else, because it is the one press that costs a run - gives the run up: banked
      like any death, and up comes the same card. The world keeps a flag and not a sixth STATE
      (game/run.js `pauseRun`), because a held run is still the run it was and simply not being
      stepped; the window losing focus holds it the same way, silently, which is PLAN section 6's rule
      arriving late. The camera keeps its lean, a dash asked for during a pause is spent and not kept,
      and no other key changes meaning because the panel is up - except `O`, which is the settings and
      takes the pause down with it.)
- [x] Full game over summary. (The card already said score, clock, level, kills, shards, the fights,
      stardust, awards and build, and had never said the one thing a death is asked about: *what took
      the run down*. `game/tally.js` has kept that since the tally was built (`body:tank`,
      `shot:spitter`, `beam:sniper`, `arm:eclipse`, `blast`) and only the balance tables ever read it
      back. `causeWords` names a body by its codex name (`A TANK`) and gives a shot, a beam and a
      blade to whoever loosed one (`A SPITTER'S SHOT`, `THE ECLIPSE'S BLADE`) - by then the thing that
      fired it may be a wreck - and a run given up, which has no cause on the sheet because there was
      none, is `RUN GIVEN UP` rather than a blank line. The card prints that under its own heading and
      `hullLedger` costs every hull the run lost under that, costliest first. Which rows are kept is
      the interesting part: a wreck's headline has just named what took the last hull, so a one-hull
      run has nothing left for a rack to say and the rack hides itself; a win has no such headline -
      nothing took it down - so it says every hull it spent, down to a single one, and so does a
      give-up, whose headline is about the giving-up and not a body. The names come out of the codex's
      own table (`hostName`), so the card and the codex cannot call one body two things, and a label
      from a build this one has never met is named by what it was rather than breaking the card. "The
      best of each" is read as the three numbers the save actually keeps a best of - best score on its
      own line, the purse and the award count beside it - because nothing else in the game is
      remembered well enough to be compared against.)
- [x] Settings screen with everything from section 6. (`O` puts up the fourth panel - `O` because `S`,
      the first letter of the word, is the ship's own down key and a key that moves the ship must never
      move anything else - over the title, over the death's card, or over a run that is being held, and
      nowhere else: over a flying run it would be a pause the run never agreed to. Seven rows, and the
      panel keeps none of them: four come out of `game/settings.js` (screen shake, hit flash, score
      numbers, particles) and three out of the mixer (music, sounds, mute), each row printing what its
      owner says it is, what it is set to and one plain line on what it does. `↑ ↓` put the cursor on a
      row, `← →` step it, and there are no numbers on the rows because a number means the ship it means
      everywhere else - so the launch key and the ship numbers are simply refused while it is up. Three
      promises hold it together. **The last step of every row is the game as it shipped**, so a fresh
      visit cannot be the first time the game looked wrong, and `test/settings.test.mjs` says so without
      naming a number. **Nothing here can move a run**: the cosmetics draw from their own number stream
      (`core/rng.js` `fx`), the shake moves the window and not the camera's own follow, particles are
      thinned by a *stride* rather than a probability so a spray keeps the sparks it keeps, and the
      flash is a share of a bloom - and the test plays one seed twice, once with every row at the top
      of its travel and once with every row at the bottom, and asks for the same score, the same kills,
      the same levels and the same ship at every half second. **A row is the one description of itself**,
      so the panel cannot offer a step the game has not implemented and the save cannot hold a step
      nobody ever showed; choices are stored by *name* in the save's new `view` section, which means a
      step this build has never heard of is no setting at all and the row ships. `prefers-reduced-motion`
      is the one default that is not the shipped one - a first visit on a machine that asked for calm
      gets the window held still - and it is a default and not an order, so a save that has already got a
      shake in it outvotes it. What the row called *flash* took is the white bloom on a hurt body, and
      deliberately not a boss's phase flare or the hull bar's white breath: both are news, and a setting
      that takes news away is not an accessibility setting. Closing the panel over a held run puts the
      pause back up, because opening it never let the run go.)
- [x] An auto-fire toggle and an auto-aim toggle (section 6, and nothing in the milestone list asked
      for them): the game is supposed to be playable with one hand or keyboard only, and today it is
      not - aiming is the mouse and there is no way to stop holding the trigger. (`game/assists.js`, the
      last two rows of the settings panel: AUTO-FIRE holds the trigger and AUTO-AIM points the gun, so
      with both on WASD is a whole set of controls. They ship off, which is the game as it was built and
      balanced, and they are stored as two flags in the save's new `assists` section - a switch has two
      places and nothing in between them, and a value that is not yes or no is no value at all. They are
      the two rows on that panel that *can* change a run, which is why they sit past the end of the walk
      and why `test/settings.test.mjs`'s "nothing here can move a run" promise does not cover them: a
      wander with the arrow keys should not quietly take the trigger out of the player's hand. Auto-fire
      is written into the same input descriptor the hand writes into, so an auto-fired shot and a shot
      the player fired are one and the same shot - the test plays one seed twice, once with the left
      button held and once with the switch on, and asks for the same shots on the same steps. Auto-aim
      takes aim inside the step and not in the frame loop, because a frame owes a different number of
      steps on a different display and one step gets exactly one aim; it picks the nearest body a shot
      can actually hurt (`hp > 0`, not `immune`, the same question `damageEnemy` asks) and *keeps* it until
      the nearest one is forty per cent further out, because a nose that snaps between two bodies trading
      the lead every few steps sprays shots between them and kills neither. Nothing to aim at leaves the
      nose where the hand left it: the switch does not make a target out of empty sky. The body held is
      `world.aimLock`, derived state like the grid and the packs - it goes with the crowd, with the run,
      and with the switch that asked for it.)
- [x] Key rebinding. (**Thirteen controls** on a rack of their own one press inside the settings panel:
      the four that fly the ship, the dash, the pause, giving the run up, the hangar, the codex, the
      settings, today's arena, the reroll and the mute. `core/keymap.js` is the one table - it answers
      "which key" and "which control", both ways, and it is the only thing the input layer, the page and
      the save ask. `input/keyboard.js` hard-codes nothing but what no panel can offer a row for: the
      launch, the numbers that pick a card or a ship, the two volume pairs, `F3`, the arrows, and `Esc`
      (a key that cancels a rebinding cannot be the key a rebinding takes). **The four arrows are always
      movement as well**, whatever the rows say, because they are the pair a keyboard with no letters to
      spare still has - and no panel can be put up over a run being flown, so a cursor and a ship can
      share them without a key ever meaning two things at once. A row is changed by pressing the key:
      `\u2192` asks the keyboard for one (one listener in front of everything for exactly one keypress,
      and a key that cannot be taken is refused in silence), `\u2190` puts the shipped one back, and a
      key that is already somebody else's trades instead of being stolen. **Nothing is left holding an
      old key**: the title's list, the racks' hints, the two cards, the pause's line and the lesson plate
      in play are all written from the table (`ui/screens.js` `paintKeyWords`, `game/tutorial.js`
      `saysOf`), so a visit that rebound its keys is never handed a manual about somebody else's
      keyboard.)
- [x] Gamepad support. (PLAN section 6's three controls, and deliberately nothing else: **left stick
      to fly, right stick to aim and to fire, a right shoulder to dash**, plus the two presses every
      screen already means - A is the launch key and Start holds the run. `input/gamepad.js` is polled
      once a frame rather than listened for, because `gamepadconnected` says a device arrived and no
      event says a button moved: a pad plugged in mid-visit is flying the ship on the next frame with
      no listener registered and nothing to unsubscribe from when it leaves, and a pad unplugged
      mid-run stops driving it on the next one. **A stick is a direction and not a place on the glass**,
      which is the one thing that stops the pad being just another pointer: the left stick's push goes
      into the same field WASD writes into (a vector of at most 1, remeasured from its own dead zone so
      a lean that has just cleared the line is a nudge and not a lurch), and the right stick's direction
      is turned into an arena point a fixed distance in front of the ship by `main.js` - from the
      *stepped* ship and not the painted one, because the step reads that point too and an interpolated
      ship would put a shiver in the angle every gun is fired along. That stick also owns the nose after
      it has been let go, which is what a pointer cannot do for itself: it has kept the place it was left
      in, so `input/index.js` keeps one variable for "which hand spoke last" and one pointer moved
      since is a hand taking the aim back. Two families of pad answer through the API and the two
      buttons they disagree about - the right trigger and Start - are picked from the axis count, with
      a note on what a pad that fits neither family still gets (both sticks, A, and the right bumper are
      read unconditionally). **What is not bound is a decision**: the cards, the hangar, the codex and
      the settings stay keyboard and mouse racks, because a pad in a browser is never the only device -
      it arrives beside a keyboard and is polled beside it - and a fake cursor on the glass is a whole
      second interface to keep in step for no gain a player could name. Nothing is simulated and nothing
      is remembered: the reference run traces the same bytes with the whole feature in the tree, one of
      the 14 new tests flies a whole run twice - once with no pad and once with a pad lying untouched on
      the desk - and asks for every number to agree, and the only place a pad announces itself is the
      developer's panel, which now has a HANDS row saying `gamepad  none` or the device's own name.)
- [x] Touch support. (PLAN section 6's three halves, split three ways, because each one belongs to a
      different layer. `input/touch.js` knows where a thumb has to land for it to *mean* something and
      keeps the one fact everybody else reads, which is where the thumbs are; the stick is written into
      the same descriptor the keyboard writes into, so a thumb lean and a WASD lean are one lean and
      `game/player.js` cannot tell them apart - a half lean is a half-speed ship and the far end of the
      stick is the ship's own top speed, because `steer` clamps the target speed and a vector of half
      the length is half the ship. The stick is put down wherever the thumb lands rather than painted at
      a fixed spot, because every pair of hands holds a phone differently. And the aiming and the trigger
      are `game/assists.js`, because "point at the nearest body" is a question about the crowd and not
      about the glass, and those two switches were already written. **A thumb is those switches, on** -
      not a force and not a third control: they ship on for a visit that has claimed a control and off
      for one that has not, which is the only way the same two rows keep working as the accessibility
      rows they are, since a thumb run can have the held trigger handed back and a save that has moved a
      row outvotes the thumb in whichever direction it was moved. **What a touch means depends on the
      screen**, and the input layer does not know what screen the game is on, so the wiring answers
      `flying()` for it: while a run is being flown the left half is a stick and the button on the right
      is the dash, and every other touch is the press a click already was - the title launches, a card is
      answered, the wreck's card restarts, and not one screen had to learn the word "finger". A thumb has
      no Esc on it and no gun to fire with, so a tap is allowed back into a held run where a click is
      refused, and the pause rack says which of the two this visit owns (`TAP TO GO BACK TO THE RUN`).
      The button and the ring are painted from the input layer's own numbers (render/touch.js), which is
      the only way the ring an eye sees and a thumb presses are one ring by construction rather than by
      luck, and neither is shown to a visit that never put a thumb on anything. Touch is never simulated:
      `thumb.used` is set when a control *claims* a touch and not when a screen is tapped, so a laptop
      with a touchscreen that caught one accidental brush is not a visit that asked for auto-aim, and the
      reference run traces the same bytes with the whole feature in the tree. The hangar, the codex and
      the settings stay keyboard racks - section 6 asks that screens work with keyboard alone and with a
      gamepad, and 22 tests hold what a thumb was promised: `test/touch.test.mjs` for the driving and
      `test/touch-art.test.mjs` for the picture and for the promise that a mouse visit is untouched.)
- [x] Colour-blind palette. (Two halves, and the measuring came first. **The palette itself was
      measured** (`tools/colour-lab.js`: Oklab, and five eyes each named by the axis it keeps;
      `tools/sights.js`: 19 sights - nine bodies read out of `BALANCE.kinds`, an enemy shot, a beam, a
      blast, a mine, the ship, its shot, a shard at each size, the wall, a boss's cage - each with a
      *meaning*, the form the renderer really draws and a size, plus a promise matrix that says which
      pairs an eye is actually being asked to decide between: only pairs with harm in them, and where the
      shape cannot tell them apart, a full step on every axis the eye keeps. `tools/palette-check.js`
      prints the whole thing and `test/palette-read.test.mjs` holds it, in the same words, off the same
      function. **The shipped palette passed all 84 promised pairs** - so no colour moved, and the two
      thinnest pairs (a shard against an enemy's shot at 1.12, their shot against yours at 1.20) are
      documented rather than painted over: deepening the shot, the obvious candidate, lands it on top of
      the spitter's own body, which the audit catches and a screenshot would not.)
    **The row that came out of it is `MARKS`** - the fifth picture row on the settings panel, `FULL` /
      `FAINT` / `OFF`, shipping at `off` because it is the one row in the game that *adds* something and
      the last step of every row has to be the game as it shipped. On, it punches a dark centre through
      every enemy shot and lights one in every shard: a signature made of light and the lack of it and of
      nothing else, so it cannot undo the one colour rule the game runs on (`a mark is a shade and not a
      colour` is a test), and it is measured at the row's *faintest* step against every promise the
      palette makes - every pair still clears, nothing goes invisible on the sky, and the two thinnest
      pairs go from 1.12 and 1.20 to 1.58 and 1.61 for an eye with no hue at all, and further with the
      full step. Only the two small fast things are marked, because only they are ever mistaken for each
      other: no crowd body, no beam, no wall, and not the ship's own gun (`test/marks-art.test.mjs`,
      painted and counted on the canvas stub, and the ratios pinned out of the renderer's source so the
      audit cannot measure a picture nobody paints). It changes nothing about a run - the same seed
      played with every row at both ends of its travel is the same run, 1970 tests and a reference run
      that traces the same bytes as before it.)
- [x] Release. (**0.9.0 - 0.10.18** is this whole milestone: the title that writes itself, the pause
      and the give-up, the wreck's card that says what took the run down, the settings rack, the two
      assists, the CONTROLS rack, the pad, the thumb, and the palette measured with MARKS laid over it.
      The last release is the shape half of that measurement, which had a bug in it: the audit had
      three bodies sharing one silhouette when `drawEnemy` gives one of them a dart and two of them
      the ship's own shape, so the table is read out of the renderer now and the report says who shares
      a shape and what pays for it. Nothing on the screen moved, and the honest numbers are the reason:
      the two bodies that borrow the ship's silhouette clear a whole step from the ship on every axis
      every eye keeps, which is what says "that one is not you".)

### Milestone 10: balance and polish
- [x] An upgrade that widens the shard magnet (**the owner's request of 2026-10-10**, left in
      `OVERLORDS_REQUESTS`: "an Attractor mod ... increases attraction range allowing you to collect
      faster"). It shipped in 0.10.0 as **ATTRACTOR**, and it turns out to be PLAN 3.5's own
      "Pickup radius" stat line arriving seventeen releases late rather than a new idea: five ranks of
      +25% of `shards.magnetRadius`, so 145 px as the game shipped and 326 px at the fifth rank, read
      where a shard is drawn in (`game/upgrades.js attractorReachOf` at `game/pickups.js`) so a rank
      taken between two frames is felt by every shard already lying on the floor and not only by the
      ones dropped after it. The pull gradient is measured over the reach and not over the table's
      radius, which is the difference between a well that gets wider *and* deeper and one that gets
      stretched thin: the tug at the rim stays `pullFar` and the tug at the hull stays `pullNear`, so a
      shard that used to sit on the rim sits inside the new one and is pulled harder for it. The power
      ladder cannot see a line whose trigger is picking something up, so it was priced on runs
      (`tools/line-ab.js --line attractor --seeds 6 --seconds 600 --stats collected,level`): five free
      ranks are +43.5% of a run's score and +39.7% of its damage against the DAMAGE line's +31.2% and
      +51.5% on the same seeds, and what it really buys is levels - the median run goes from 35 to 58.
      A rank too thin to be felt (5% to 12%) reads *worse* than having no such card at all, because a
      player pays a level for it either way. The owner's name for it was "Speed-dating"; it lands with
      the plain word from their own first line instead.
- [x] The point vacuum (**the owner's request of 2026-10-10, second half of the same note**): "every
      10,000 points scored, every existing point on the screen should auto-stream to the player ship.
      During this 10 second event, play some excited music, inspired by the classical Final Fantasy
      fanfare." Shipped in 0.10.1 as **VACUUM** - `game/vacuum.js`, `BALANCE.vacuum`, and six tests'
      worth of behaviour in `test/vacuum.test.mjs` and `test/vacuum-art.test.mjs`. The two numbers are
      the owner's and neither was touched: every 10,000 points, ten seconds. The four decisions this
      list asked to be written down, and where they landed (all four argued in full in
      `balance.js`'s `vacuum` row):
      **in the arena, not on the screen** - the whole 3000 x 3000 floor, because a shard nobody saw is
      a shard they will swear was there; **a window and not a photograph** - everything that drops
      during the ten seconds is drawn in too, so a kill inside the reward is paid out at once; **a
      shard's own clock keeps running** - nothing is rescued from its expiry, because the farthest
      corner of the arena is a 3.7 s walk at the row's speed and a rule nobody can observe is a rule
      nobody keeps; and **priced like a card, not like a treat** - ten runs of the aware bot either
      side of it reads +13.9% score, +16.5% level and +49.5% shards at the median, which is about half
      of what the DAMAGE line is worth for a level spent on it, and that is what makes it a rhythm and
      not a build. The fanfare is `music.js`'s after all, and it is a *layer swap*: the run keeps its
      tempo, its drums and its chord and the arpeggio's slot is spent on a tune for the ten seconds,
      which is what lets a reward interrupt a boss fight without stopping it - and the four
      `-fanfare` patterns are metered against the same bus ceiling as every other pattern, which is the
      only reason "loud enough to be the reward" is a number and not a hope. The reference run
      (`--seed 20261006 --trace`) is byte-identical to the 0.10.0 one until the frame the first well
      opens on, which is the proof the whole feature is inert until it is earned.
- [x] The release list says how much each release changed (**the owner's request of 2026-10-11**, the
      second one in `OVERLORDS_REQUESTS`, and the note on what shipped is in
      `archive/COMPLETED_OVERLORDS_REQUESTS`). `tools/release-stats.js` counts a release's `added` and
      `removed` lines with `git diff --numstat` from the previous release's tag to this one, over
      `index.html`, `src/`, `tools/` and `test/` and nothing else - the copies under `releases/` are
      copies and the markdown and `loop.log` are the story about the work and not the work - and
      records `logBytes`, how far the session log had got when the release was made, which is what the
      menu turns into a rough token cost per release. `tools/release.sh` stamps all three on the entry
      it has just written, between the entry and the commit, and warns rather than fails if it cannot:
      metadata for a menu is not allowed to lose a release. With no arguments the tool back-filled the
      77 releases already out there from their tags - every one has its two counts (0.10.1 is +934 -35,
      0.0.1 is +1266 -0 from the empty tree) - and left `logBytes` out of the 56 whose own
      `Released v<version>. It is now in the menu.` line the harness elided from the log, because a
      position quoted in a later session or interpolated from timestamps is a number with no fact
      behind it and the menu shows nothing for a missing one. `--check` says which entries are still
      blank; nothing it writes ever overwrites a number that is already there.
- [x] Use the simulation to check the difficulty arc (**built, run, and the answer is that one half
      of PLAN's sentence holds and the other cannot be measured with the players there are** - what
      that asks for is the item under this one). PLAN's two numbers are its own and neither was
      moved: a careless build should usually die between 4:00 and 9:00, and no enemy type should take
      over 40% of the deaths. What had to be built first was a run that does *not* choose wisely:
      every number in NOTES.md is measured with the aware bot and its even spread across the gun
      lines, which is the careful build, so `tools/headless/bot.js` now answers a level-up a second
      way (`PICKS.random`) - one roll of a die over whatever is face up, on a stream of its own
      seeded from the run so a seed is always the same careless build, reached with `--picks
      wise|random` on `tools/simulate.js`. A die and not a hand-written bad picker, because "did not
      look" is what the sentence is about and a die has an average, while a picker written to choose
      badly would be an invention about bad play (the worst card on a table is almost never what a
      person takes). The careful default is untouched and proven so: the reference run
      (`--seed 20261006 --trace`) is byte for byte the run it was. Then the check itself,
      `tools/difficulty-arc.js` - a check and not a report, it exits non-zero so a release could be
      gated on it - which plays a batch and prints a histogram of when each run ended with the band
      marked, what took every last hull, and what every *hull* of the batch went to (game/tally.js
      again, and the wider sample is what tells a finisher from a chipper). "Usually" is at least half
      the batch, with a run that never died in the denominator and not the numerator, which is the
      strict reading; the looser one - of the runs that did die, when did they - is printed under it
      because it says where the arc actually is and not only that it missed. The ceiling needs 20
      deaths to be a share at all: two batches of 24 runs put the same body at 46% of one batch's 13
      deaths and 31% of the other's, so a smaller batch is told it has not measured anything.
      **Measured, aware bot with a die, seeds 1-48, a 15 minute window: 26 of 48 died, the middle one
      at 4m19s, and 11 of the 48 (23%) inside the band - FAIL.** 42% of the deaths themselves were in
      it; the whole of the miss is that 22 runs never died at all. **The ceiling holds: the widest is
      the drifter at 35% of the deaths, then the weaver at 27% and the tank at 15% - PASS** - and on
      the 244 hulls that batch lost the crowd is flatter again (drifter 30%, weaver 27%, tank 14%, the
      untitled blast 11%). **The naive bot with a die, seeds 1-24: 23 of 24 died, the middle one at
      2m47s and exactly one of them in the band - FAIL the other way, too soon** - ceiling PASS
      (drifter 35%), with the spitter's shots taking 49% of 196 hulls while landing 17% of the
      deaths, which is what a chipper looks like and is why both tables are printed. **Read together
      the two players bracket the band and neither sits in it**, and that is the item's real answer:
      what kills a careless person is positioning, which the naive bot has no notion of and the aware
      bot has far too much of - it steps off everything it can see coming, so 22 of 48 careless runs
      were still flying at fifteen minutes and one of them reached level 76. A careless build is not
      too weak so much as a coin toss, and the instrument the 4:00-9:00 sentence needs does not exist
      yet.
- [x] A bot that dodges like a person (**`tools/headless/human.js`: the aware bot's threat reading
      behind a person's hands. `--bot human`, and `tools/skill-ladder.js` reads the whole slope**). The
      aware bot is not a person: it reads every shot, telegraph and bomber circle in the world and steps
      off all of them (`tools/headless/threats.js`), re-deciding every simulation step, which is why
      half a careless batch outlives fifteen minutes and why `4:00-9:00` cannot be answered with it.
      The third policy keeps that reading and adds three human limits, every one of them in `HUMAN` and
      every one the bot's business and not the game's: it **re-decides on a human clock** - a look every
      0.20 s, plus or minus 30%, driving what the last look said in between, which is where "only once it
      is nearer than `SKILL` lets it see" comes from with no blindness invented, because a shot that
      appears just after a look is news for a fifth of a second and by then it has landed; **a quarter
      of its looks are not at the field**, and while they are elsewhere it is flying the ordinary line -
      back off from what is close, drift in towards the middle - rather than standing still; and **the
      hand commits up to 0.22 rad off what the eye saw**. It is a dial first and a number second:
      `RUNGS` patches it into *flustered* and *sharp*, and `tools/skill-ladder.js` plays one careless
      batch at flustered, ordinary, sharp and the aware bot ("program") on the same seeds and prints
      what each rung is worth and what the step between two of them is - PLAN's curve measured at
      several skills instead of two. `tools/difficulty-arc.js` measures with the human by default now,
      because the sentence is about a person and not a program. **Measured (48 seeds, a die for the
      cards, a 15-minute window), both halves of PLAN's sentence still fail and the band fails the other
      way up**: 43 of 48 died, the middle one at 2m33s, 7 of them (15%) inside 4:00-9:00 and 36 of them
      before it - *the batch dies too soon* - while the ceiling passes with the weaver sitting on the
      line and not under it, at exactly 40% of the deaths. What a careless person dies of is the crowd:
      of 217 hulls, weaver 40%, drifter 24%, darter 15%, tank 10%, and only 10% went to anything that
      travels (spitter shots 5%, a blast 4%, one beam 1%). On the same seeds the naive bot middles at
      2m20s and the aware one at 4m19s with 22 of 48 never dying, so the other question this item
      carried has a clean answer for a human hand: **a die-dealt build does not outlast the window** -
      5 of 48 did, against 22 of 48 on perfect hands. And the dial's worth, measured on 16 seeds at the
      middle of deaths: a look every 0.30 s is 103s, every 0.20 s is 153s, every 0.12 s is 164s, while
      attention reads 115s at 0.5, 153s at 0.75 and 161s at 1.0 and the fumble is inside the noise of
      the batch - the reaction clock is the whole of the model, and moving it does not reach the band.
      Tests: 10 in `test/human.test.mjs` (a look holds, the next one comes when the dial says and not on
      the dot, a threat that arrives between two looks is answered at the second one, one look in four
      is elsewhere, the hand is off by the fumble and no further, one seed is one afternoon, and a
      person is hit more than a program and far less than a statue) and 13 in
      `test/skill-ladder.test.mjs`.
- [x] The tuning the third player asks for, which is a design conversation and not a dial. **PLAN's
      `usually` is read on a careless build on a person's hands** - `--bot human --picks random`, the
      default of both `tools/difficulty-arc.js` and `tools/run-shape.js` - and reading it on the aware
      hand is declined, because 42% of that batch's deaths were in the band with 22 of 48 never dying
      at all, which makes the check a formality about a player nobody has. So the sentence stands as
      written, and its two named knobs are both spent, measured. What decided it was seeing the runs
      from the inside rather than only their endings (the new `tools/run-shape.js`; a histogram of
      deaths cannot tell an overrun crowd from a ship that never got strong, and these tables can).
      On 48 seeds the careless batch is not a ramp at all, it is a cliff: at 1m the middle run is
      level 4 with all three hull and 19 bodies on screen, at 2m level 5.5 with two hull, at 3m 20 of
      the 48 are still flying at level 6.5, at 4m it is 12 of 48 at level 12, and by 5m the six that
      are left are level 37 with their hull whole and cannot be killed - the five still flying at
      fourteen minutes are level 65 with 110,991 and three hull to spare. So 36 of 48 are dead before
      the fourth minute and the rest are immortal: nothing about the crowd moves a cliff that sharp,
      and the weaver's 40% is the fastest body in the arena doing what the fastest body does, not a
      kind to be fixed by taking it away. Everything the item named, and five more, measured as the
      middle of the batch's deaths - on seeds 1-24 unless a bullet says 48, where the shipped game
      middles at 2m32s and 2m33s, 7 of 48 in the band, the weaver widest at 40%:
      - the crowd budget, `crowdBase` 18 and `crowdPerMinute` 64 both down a quarter: **2m28s**,
        which is nothing. The budget is the run's income as much as its danger - fewer bodies are
        fewer shards, and the run dies of being poor.
      - the weaver on PLAN's own 4:30: **2m53s on 48 seeds** (3m17s on these 24), the band 15% to
        19%, and the ceiling quiet at last with the darter widest at 38%. Declined anyway, and the
        reason is on the row in `src/game/balance.js` and pinned in `test/waves.test.mjs`: of the runs
        still flying at four minutes the middle one stands at level 5 where it stood at level 12, the
        reference run falls from 75,596 to 57,249 - and that score is what the hangar is priced with -
        while 35 of 48 perfect hands never die where 22 did. The weaver is the cheapest kill in the
        game, so it is what the opening is paid in, and taking it away is "do not make the game easier"
        in disguise.
      - the tank on PLAN's 2:00: **1m43s**, with the weaver taking 54% of the deaths; both clocks
        together **2m11s**. Neither moves. Taxing the weaver instead of scheduling it, `cost` 3 to 5:
        **2m04s**, worse still, because the room a dearer weaver leaves is filled by two drifters.
      - `waves.minDistance` 260 to 400: the numbers did not move at all, so where an arrival lands is
        not a lever (they come in off the window, which is further than either number).
      - a cheaper first card, `progression.base` 90 to 60: **2m22s**. More cards are not more gun.
      - the hull the run starts on, 4 instead of 3: **3m48s with 38% of the batch inside the band** -
        the one dial that reaches, and it is not this item's to spend, because PLAN 3.1 says three
        hulls and the hangar sells that trade for 250 dust as the Bulwark (4 hull for a fifth of the
        speed, "a pip of hull for a fifth of speed"). Measured on the ship and not the dial, the same
        batch on the Bulwark *overshoots the whole window*: 31 of 48 never die, and the middle one of
        them stands at level 9 with all four hull a minute in against the wisp's level 4.
      - and firepower, which is the thing PLAN's own priority order named. Half again the pulse's
        rate, `fireRate` 4.4 to 6.6: the middle of the batch's deaths **does not move at all - 2m36s
        against the shipped 2m33s** - while the runs that never die go from 5 of 48 to 19 of 48. A
        quarter more of the same gun (5.5) middles at 2m06s with 18 never dying and the weaver back at
        50% of the deaths. Power does not buy a careless run time; it converts some of its deaths into
        immortality, sooner.
      So the answer to the item is the thing the item said it was. Every dial in reach moves the tails
      and not the middle: across the ten measurements above the middle of a careless batch's deaths
      sits somewhere between 1m43s and 3m48s - and only the extra hull for the ship gets past three
      minutes and a half - while the runs that never die at all swing from 1 of 48 to 31 of 48. What a
      careless run's life is worth is decided in its first hundred seconds and it is decided by where
      the ship is standing, not by what the ship owns - and no number in `balance.js` is about where
      the ship is standing. Naming the hand and spending the two knobs the item named is this session's
      part; the gap to PLAN's band wants a mechanic that punishes being cornered instead of killing for
      it, which is a feature and not a dial and belongs after the weapon ladder. Nothing here made the
      bot worse: its rungs are untouched and every number above is the middle of a batch of them, 48
      seeds where a single reading would have been a coin flip.
- [x] Tune every weapon so that none is over 25% better than the others in the balance report. One
      warning the item above leaves behind: raising the whole ladder is not how the difficulty arc gets
      fixed, because a stronger gun was measured to leave a careless batch's middle of deaths exactly
      where it was and turn more of its runs immortal instead. Tune this ladder for parity and for the
      feel of firing, and not against `tools/difficulty-arc.js`.
      **Measured first, and it fails by a wide margin.** `tools/balance-report.js` cannot see the
      primary at all - the gun is not an upgrade line - so the sentence needed its own instrument:
      `tools/weapon-ladder.js`, a check and not a report, exiting non-zero the way the arc's tool
      does. It prices every primary three ways on the same seeds: **the knots, chipped** (hull a
      second off `tools/power-ladder.js`'s three knots, which that file now exports so one knot
      geometry is shared and its own printed table came out byte-identical to before); **the knots,
      felled** (the same knots planted with the hull a body carries once the crowd's ramp is spent -
      3, asked of `game/kinds.js` - and a body that comes apart wound up and put back, so the answer
      is *bodies a second* plus a `cost/kill`); and **the run** (the bot, N seeds a gun, the middle
      run's score). Only the run column is gated: a knot is a geometry and a shotgun is supposed to
      own a press, so the scatter's 3x on a ring (NOTES session 33) is the gun's identity and not a
      failure. Sixteen seeds a gun, the aware bot with the careful build, a fifteen minute window:
      **SCATTER 120,642 over LANCE 5,658 = 21.32x against the 1.25x allowed - FAIL**, with the pack
      of three inside the band and of each other (scatter 120,642, pulse 118,867, arc 110,868,
      1.09x best over worst) and the two slow guns out of it (swarm 35,960, lance 5,658; the middle
      lance run dies at 3m40s where the other three are still flying at the cap).
      The knot columns say neither outlier is short of damage - the lance is the strongest of the
      five on the ring (15.0 hull/s) and on the column (30.0) and mid-pack on the near field (5.0
      against the pulse's 4.3) - so on the tool's own reading it is *above* the knots and below the
      run, which is the case where buffing the row would be a nerf of every player who can line a
      beam up. What the run is buying is bodies, not hull: XP is paid per body, levels are what a
      build is made of, and kills a second in those runs rank the guns exactly as the scores do
      (scatter 6.7, pulse 6.5, arc 6.1, swarm 2.1, lance 1.8). Two numbers say why the heavy guns
      are behind on it: the lance's own scorecard (`game/lance.js`: `pulls`, `fired`, `caught`,
      `dealt`) reads **1.9 bodies a beam in a live crowd** where the column knot plants it six, and
      its `cost/kill` on the near knot is **5.00 against the pack's 3.00-3.25** - it pays a whole
      5-hull beam for a body worth 3, and the hull past the body buys no XP at all.
      Four probes at six seeds and a ten minute window, against the shipped lance's 5,418, and all
      four are worth recording because three of them are refusals of good ideas: aim the bot down the
      fullest lane it can find (4.8 bodies on the lane per aim, which is what NOTES session 53 asked
      for) gives **4,554 - no better**, so the bot's aim is not the deficit; `beam.halfWidth` 16 to
      34 gives 4,915; `damage` 5 to 3 with `fireRate` 0.9 to 1.4 gives 5,508; all three together
      give 8,069, the only move of the four and still seven times short. So the item is not a dial:
      the five rows are priced as hull a pull times pulls a second, and the game pays per body.
      The item under this one is what closes it. Also `tools/run-shape.js` takes `--weapon` now, so
      a shape table can be read for the gun a ship actually carries.
      **Closed and re-measured in session 103**, on the tree that shipped the first-run tutorial, because
      the item under it had made this one true without this box being ticked: `--seeds 1-16 --shards 10`,
      the same sixteen seeds and the same fifteen-minute window as session 97, reads **SWARM 126,460 over
      LANCE 112,979 = 1.12x against the 1.25x allowed - PASS**, all five guns outlasting the window and
      `bodies/s` between 6.39 and 7.23 (session 97's reading was 1.13x, and the rows it tuned have not
      been touched since). Nothing in PLAN's sentence is left open: the five primaries are priced in
      bodies, they are inside the band, and the deck no longer deals a card a ship's own gun cannot spend.
- [x] Price the five primaries in **bodies a second**, not hull a second, and re-tune them against
      `tools/weapon-ladder.js` until its verdict reads PASS. The measurement above is the argument:
      a run's income is the body (a shard drops per kill, XP is the shard, levels are the build), so
      a gun that costs 5 hull to remove a 3-hull body is taxed a fifth of its income on every pull,
      and a gun that pulls its trigger 0.9 times a second cannot spend more than about two bodies a
      second however wide its line is. While this is open, decide the two questions it uncovers
      rather than skating over them: what a heavy gun should cost a body (the near knot says `damage`
      is bought at the wrong denomination above about 3), and what to do with the deck lines a beam
      cannot use - `pierce` and `ricochet` buy nothing for a beam by design (NOTES session 53), so a
      lance run spends two of its card slots on cards that do nothing, and a run that is already
      short of levels is short twice over. Nothing in this item is a nerf of the three guns inside
      the band; they are 1.09x apart and that is parity.
      **Shipped in session 96, and the verdict reads PASS**: the same sixteen seeds and the same
      fifteen minute window now give SCATTER 120,642, SWARM 125,756, PULSE 118,867, LANCE 111,963,
      ARC 110,868 - **1.13x best over worst against the 1.25x allowed**, with all five outlasting the
      window and every middle run between level 63 and 66 where the lance's was level 7 and dead at
      3m40s. Two rows moved, and the three inside the band were not touched (their three medians are
      byte for byte what the failing batch printed). The run table prints **`bodies/s`** now, because
      that is the currency: 6.09 to 7.04 across the five, which is 1.16x, and it is the first column
      this game has ever had that a shotgun and a beam can be read against each other on.
      **The first of the two questions is answered: a pull costs a body, and a body is worth three.**
      The lance's `damage` 5 → 3, which is what a swarmling is once the crowd's ramp has spent itself,
      and the `cost/kill` column comes down from 5.00 to 3.00 to sit with the other four's 3.00-3.25;
      `test/weapon-ladder.test.mjs` fails any row that starts paying a multiple of a body for one
      again. What the two points of hull per pull gave up is bought back with **pulls**: the lance's
      trigger 0.9 → 2.6 a second (and its recoil 220 → 90 and its hit-stop 0.03 → 0.018, because a
      kick and a freeze are felt per second and not per pull), which is the whole of the difference
      between 6,736 and 111,963 - after a beam twice as wide (5,025), a fan of three beams a pull
      (4,891 at 20% more hull a pull, 7,592 at 80% more) and, on the other slow gun, a longer-reach
      missile (18,050) had all been measured and had all done nothing. **A heavy gun buys bodies with
      pulls and not with weight**, because a press has to be thinned continuously. The Swarm's row
      takes the same lesson the other way round and keeps PLAN's three pulls a second: `pellets` 1 → 2,
      so a pull is a pair and is paid for two shells, which was worth more than the bigger blast that
      would also have worked (radius 90 medianed 68,678 against the pair's 75,996) and would have made
      a liar out of "micro".
      **The second question is still open and is now its own item below**, rather than being quietly
      folded into a number: three of the five primaries cannot spend `pierce`, and two of them cannot
      spend `ricochet` either, and nothing in the deck or the deal knows that yet.
- [x] Decide what the deck does with the lines a primary cannot spend. Session 96 priced the five
      primaries in bodies and left this behind: `pierce` buys nothing for a beam or for a shell that
      detonates on what it hits, and `ricochet` buys nothing for a beam, by design and on purpose
      (NOTES session 53) - so a LANCE run is offered two cards in ten that do literally nothing and a
      SWARM run two that do nothing, and takes them anyway (the bot's own picker puts `ricochet` and
      `pierce` third and fourth in its appetite, and a lance run is short of levels anyway, so it
      pays for them out of the very thing it is short of). Three ways out, and they are not the same
      game: **say it on the card** (the deal keeps offering them and the card's own line tells the
      player this gun cannot use it, which is honest and cheap and leaves the dead slot dead);
      **filter the deal** (game/upgrades.js is asked what this ship's gun can spend and the dead lines
      never come up, which is kind but silently shrinks the deck for three of the five ships and
      would have to be measured to be sure it is not just a buff); or **make them spendable** (a beam
      that reads `pierce` as something - a second body at the far end of the line, say - and a shell
      that reads it as passing through the first body to detonate at the second), which is a new
      mechanic with a feel to it and is the only one of the three that makes the deck bigger.
      Measure before choosing, and note that the tool for it is one flag short: `tools/line-ab.js`
      prices a line against a batch (`--line pierce --seeds 24`) but cannot yet say which primary the
      batch is flying, which `tools/simulate.js` and `tools/run-shape.js` both can. Add that flag as
      part of the work. And none of the three ways out may be a nerf of the pulse, which can spend
      every line in the deck and is the yardstick everything else is priced against.
      **Measured, and then filtered: a line the run's gun cannot spend is no longer dealt to it.**
      The flag came first (`tools/line-ab.js --line pierce --weapon lance`, which plays the whole
      batch on that primary and says so in the header, because a table that does not name the gun it
      measured is a number nobody can use; three tests in `test/line-ab.test.mjs`), and what it
      printed was sharper than "cannot spend" - these lines are inert *to the point*, not weakly.
      Five free ranks give the middle run the same score as a deck with the line taken out, and it is
      the same number and not a near one (four seeds, a fifteen-minute window, the aware bot, the
      `free` column against the `out` one). **pierce**: pulse 1.116x and scatter 1.030x - alive - and
      then the arc 106,219 with the line and 106,219 without it, the lance 113,614 and 113,614, the
      Swarm 126,877 and 126,877. **ricochet**: pulse 1.067x, scatter 0.999x, and the same three again
      at exactly 1.000x. And the item had missed one: **bulletSpeed** is the same story on the arc and
      the lance (111,680 and 111,680; 114,766 and 114,766) because a beam and a chain have no
      projectile to speed up, while the Swarm's shells do travel and the line does move that run
      (126,904 against 128,405) - weakly, and weak is not dead. So a LANCE or an ARC run had *three*
      dead cards in eighteen and not two in ten, which is one card in six.
      **Then the second question the item asked, which was whether filtering is secretly a buff, and
      the answer is that the dead card was not a tax either.** With the line on the rack the bot took
      3.5 to 4 of its five ranks and the middle run moved +0.1% on the lance, +7.3% on the arc and
      -5.0% on the Swarm against the same batch with the line gone - inside the noise of four seeds,
      in both directions, which is what it means for a level spent on nothing to buy nothing. The
      three ways out, read against that: saying it on the card leaves a hole in a three-card rack and
      asks the player to read a disclaimer to avoid a trap that was never a choice; making them
      spendable would be inventing a mechanic to fill a slot - a beam has nothing travelling in it,
      and "the second body at the far end of the line" is a length, which the row already has - and
      the honest version of it (a Swarm shell that passes through the first body to detonate at the
      second) is one gun's card bought with three guns' worth of new rules. So the deal asks the gun,
      and the dead lines are simply not in its deck: `cannotSpend` on the three weapon rows in
      `BALANCE.weapons` (the only place the lists are written), read by `spendableBy` in
      `game/upgrades.js`, honoured by the draw *and* by the "at least one card must be new" promise,
      which walks the whole table of lines rather than the deck and would have dealt them by the back
      door. Eight tests in `test/deck-per-gun.test.mjs`: 400 hands on each of the three guns, with
      the count of hands asserted so a silent empty loop cannot pass, and every line the gun *can*
      spend demanded too; the pulse still being dealt all eighteen; the back door; the banish's
      replacement; and a run whose live lines are all maxed being handed its level back and kept
      flying instead of being offered a dead one - which is now reachable three lines sooner than it
      was, and was already handled (`refreshOffer` never pauses on an empty rack). Take either filter
      out and the tests fail, each one on its own.
      **Nothing about the pulse moved, which was the condition on all three ways out.** Its deck is
      untouched by construction, the reference run (`--seed 20261006 --trace`) is byte for byte the
      run session 96 recorded (10m00s / 75,596 / level 58 / 4004 / 5162, every trace hash equal), and
      the weapon ladder's pulse and scatter rows came out the same *numbers* they were: the sixteen
      seeds now read SWARM 127,258, SCATTER 120,642, PULSE 118,867, ARC 117,729, LANCE 112,668 - the
      same verdict, **1.13x against the 1.25x allowed, PASS** - with the three filtered guns up
      +0.6%, +6.2% and +1.2% and the two untouched ones level to the point. The arc is the one that
      gained, and it gained about what the dead card was worth on it, which is the whole of the
      measurement loop closed: a card in six that bought nothing is gone, the band did not move. What
      is *not* in the game for it: no card text and no hangar line explains a rule a player never
      meets, and the codex still lists all nineteen cards, because it is the collection of what the
      game has and not of what one ship is shown.
      mechanic with a feel to it and is the only one of the three that makes the deck bigger.
      Measure before choosing, and note that the tool for it is one flag short: `tools/line-ab.js`
      prices a line against a batch (`--line pierce --seeds 24`) but cannot yet say which primary the
      batch is flying, which `tools/simulate.js` and `tools/run-shape.js` both can. Add that flag as
      part of the work. And none of the three ways out may be a nerf of the pulse, which can spend
      every line in the deck and is the yardstick everything else is priced against.
- [x] The music is monotonous (**the owner's request of 2026-10-11**: "the basic song should have
      more oomph, and it should be less repetitive. Expand-elaborate-develop the tune."). Shipped in
      four moves, each one a number and not a hope, and all of them inside the one bus ceiling the
      music has always been held to (`MUSIC.peakLoad`, measured by `patternPeak`).
      **The harmony is eight bars now, not four** (Am - F - C - G, then Am - F - Dm - G): a phrase
      that states something and comes back for it, with the subdominant in the seventh bar leaning
      home. **A pattern is a form, not a bar**: every part carries a list of bar figures - four bars
      of bass that answer each other, two of arpeggio, a kit whose eighth bar is a fill - and
      `checked` refuses any figure list that does not divide the form or any form that is not a
      whole number of chord phrases. **There is a tune**: `LEAD`, eight bars of long notes on the
      chord tones in the register nothing else occupies, arriving with the kit at two minutes, so
      the melody is heard for most of a run and not only over a vacuum; the fanfare now spends
      whichever slot was carrying the tune instead of being the only melody the game owns. **The
      oomph is a sine**: `SUB`, the bar's own root held most of a bar, which is where a saw bass has
      no fundamental and a laptop speaker has no answer - paid for out of the pad (0.03 to 0.02) and
      the saw bass (0.16 to 0.105) and the drums, so that the heaviest pattern of the heaviest
      fight still peaks at 0.457 of the 0.5 ceiling and the music is heavier at the end of it and
      not any louder. `patternPeak` walks a pattern's whole form now, because a form measured on its
      first bar would let the fill at the end of the phrase ask for what it liked. Seven new tests
      in `test/music.test.mjs`: every note of every figure proved a note of the key and a chord tone
      on every beat; the form arithmetic; "the basic song is not one bar on a loop"; the floor is a
      sine and is the lowest thing playing; the tune is the longest line and sits between the bass
      and the sparkle; the fanfare spends the melody slot or the sparkle's; and a mutation test that
      the load meter really is reading the last bar of the form. Suite 1704. The reference run is
      byte for byte what it was - the simulation still does not know music exists.
- [x] The menu's music (**the owner's request of 2026-10-11**: "use the file
      `MenuMusic-SpaceRapBattle.flac` as the main menu music and publish"). Their recording is in the
      game at `assets/MenuMusic-SpaceRapBattle.flac` - 80 s of 48 kHz stereo, 8.7 MB - and it plays on
      the attract screen and nowhere else, which is the only reading of "main menu music" that does not
      fight section 5: the sequencer earns its keep by answering the run (the boss that walked in, the
      hull that went, the two minutes that bought the kit) and a fixed song would be deaf to all of it,
      so `patternFor` stands the generated title pad down while the recording is up and the title has
      one soundtrack instead of two arguing. `src/audio/track.js` is the whole feature: it decodes to an
      `AudioBuffer` and loops it - gapless, which a media element is not, and it is the only way to hand
      the song to the **music bus**, so the music slider moves it, the mute out-mutes it and the
      player-hit muffle reaches it without this file knowing any of those things exist; it fades in and
      out on its own gain, because a whole song starting and stopping on a state change is a click
      waiting to happen; and it **asks for the bytes late and once**: not before an `AudioContext`
      exists (no browser allows sound before a press anyway), not while the visit is muted, and only
      while the attract screen is the screen being looked at - which matters, because the usual way to
      open this game is to press Space the moment the title appears, and that press is the launch, so a
      visit that never sits on the menu with sound unlocked spends neither the 8.7 MB nor the 31 MB of
      samples it turns into. No network, no file, or a browser that will not decode FLAC all leave the
      attract screen playing the pad it played before this file existed, with the reason written in
      `menuTrackLedger()` and `stats().menuTrack` for a tool to read - and the `tools/headless/harness.js`
      stub browser grew a `network` option and a decoder that refuses anything that does not begin with
      the bytes an audio file begins with, so all of that is testable here and not only on a laptop.
      Sixteen tests in four files - `test/menu-track.test.mjs` (one visit that sits on the menu: asked
      once and only once, sequencer stood down, the run taking the bus back over a fade and not a cut,
      and the song coming back on a new source), `test/menu-track-cheap.test.mjs` (the launch-on-the-
      first-press visit spends nothing), `test/menu-track-missing.test.mjs` (refused once, not once a
      frame) and `test/menu-track-broken.test.mjs` (bytes that are not sound), plus one that the shipped
      file is really a FLAC and that `release.sh` really copies `assets/`. Suite 1803. The reference run
      is byte for byte what it was: a song is a frame's business, and the simulation still does not know
      music exists at all.
- [x] Performance pass against the target in section 2. Add a debug overlay (F3) with frame time,
      entity counts, and pool usage. (**the overlay is in, from 0.10.3** - `src/render/debug.js`,
      `test/debug.test.mjs`, and `noteFrame` in the frame loop: F3 puts up a plate with the frame's
      own clock (fps, frame ms, and the mean and worst of the last two seconds of stepping and
      painting), the arena's counts (bodies against the crowd ceiling, shots, shards, sparks, grid
      cells, packs, arena and view), the pool table (`live / built` for every pooled list that has
      built anything) and the caches (glow sprites and what their pixels cost, device ratio). It is
      frame state and not a screen - it cannot move a run, and the same seed plays byte-identically
      with it on and off - and it is off at every page load and never stored. What is left is the pass
      itself, and it cannot be run honestly before one question is answered by measurement: PLAN
      section 2's target is 600 enemies, 1500 bullets and 4000 particles, and the shipped game stops
      its crowd at 200 bodies (`waves.maxBodies`, and `endless.growth.bodiesCeil` past the schedule).
      Either the target moves or the wall does, and the F3 plate is where the difference will be read
      from.)
      **Measured, and the answer is that the target moves and the wall does not.**
      `tools/perf-probe.js` is the pass: it plants a load, holds it standing (bodies walk off and shots
      leave the glass, so a scene has to be topped up, and the topping-up is timed separately and taken
      back out), and reads it twice - one `stepWorld` in **milliseconds** on this box, and one painted
      frame in **canvas operations**, because the harness's canvas is a stub that counts calls and holds
      no pixels and nothing in the tool pretends an operation is a millisecond. Five scenes, four of
      them gated and the fifth PLAN's own sentence planted for the record: the schedule's 100 bodies on
      the glass with the spark cap is **0.04 ms a step and 1,966 operations a frame**, the endless wall
      of 200 is **0.11 ms and 2,947** (dearest frame 3,008), the same crowd *dying* is **0.11 ms and
      3,403** (dearest frame 3,638 - a death is a ring, a fire and a floating number, and a dead body
      stops walking, so it is cheaper to simulate and dearer to look at), the same crowd spread over the
      arena is **1,341** (the camera is worth more than half the painter), and PLAN's literal
      600/1500/4000 is **1.0 ms and 8,503** - measured, printed, gated against nothing, because the game
      cannot be told to hold 4,000 sparks (the spawner trims to `effects.particleCap`, 900) and no gun
      can hold 1,500 shots: `--peak` plays a real run per primary and the busiest was seen holding
      **12 shots and 900 sparks**, which is what turns that sentence from a comment into a reading.
      So the walls the game does have are nowhere near the end of what a *step* can afford - the crowd at
      its wall spends a sixteenth of a 60 fps frame - and what decides them is the half of the frame
      that cannot be weighed here at all, which is what a canvas operation costs a mid-range laptop.
      **The wall stays at 200** on the strength of that: moving it on an operation count would trade a
      measured number for an unmeasured one, and `endless.growth.bodiesCeil`'s own note now says so in
      those terms and quotes the new measurements instead of the draw-call guess it was written with.
      The gate is three numbers - a step <= 1.5 ms, a mean frame <= 4,000 operations, a dearest frame
      <= 4,400, each about a fifth over the busiest gated scene - and `test/perf-probe.test.mjs` is the
      ratchet: thirteen tests that the scenes read their body counts out of `BALANCE` and not out of a
      typed-in number, that a planted scene is still planted sixty frames later, that the step cost is
      the crowd's and not the harness's (20 bodies against 400), that dying is dearer to paint and no
      dearer to step and that culling is worth what the camera claims, that the load a scene was holding
      is the same number twice in a row (it was not: the counts came from whichever timed pass won the
      race, which is a fact about the box and not about the game), that a scene over any of the three
      budgets fails while PLAN's scene over all three fails nothing, that every flag is refused before it
      can print a wrong number, and - for the 1500-shot sentence - that a real minute of a real run holds
      12 shots and never more than the spark cap. Suite 1772. What is left of this item is one reading
      and not a feature, and it is the item below.
- [x] "No allocation inside the per-frame loops" (section 2), held to a ruler. `tools/alloc-probe.js`
      weighs a step in **bytes thrown away**: one load per process (measuring two loads in one process
      is a lie - a step that has only ever seen empty pools gets compiled for empty pools, and the same
      60 shots threw away 479 B a step as the first load a process saw and 3,145 B a step when an empty
      arena had been measured first); the best of twelve 300-step windows; and **every window the
      collector came into is thrown away and retried**, because a window the collector interrupted reads
      *low* and a plain best-of-N would keep the lies and call them the truth. It also runs with a 64 MB
      young generation so a window cannot fill it, and it reads the heap twice (`heapUsed` and V8's own
      new-space figure) and throws away a window where they disagree. The reading, on this box, with the
      crowd at its two walls: **the empty arena 184 B a step, the schedule's 100 bodies 3.4 KB (33 B a
      body), the endless wall of 200 6.1 KB (31 B), the same crowd dying 8.5 KB, PLAN's own impossible
      scene 19.6 KB** - which at the game's 120 steps a second is a megabyte of garbage every 1.4 s of
      play at the wall, and a scavenge of that heap measures **0.85-1.12 ms**: this is the answer to
      session 97's question about the F3 plate's 1.4-1.7 ms worst steps. They are not the crowd, they
      are the collector, and every byte above is a hitch a player waits through. Two real fixes came
      out of it and both are in `src/`: **`core/grid.js`** stopped emptying its cells (`cell.length = 0`
      throws the array's element store away and the next `push` buys a new one, so a cell is a count and
      a store now, and the hot door is `queryInto`, which answers with a count and never touches the
      caller's scratch array length - 94 B a body a step to 31 B), and **`game/awards.js`** stopped
      listing the ranks table once per rule per step. Three budgets are the ratchet - 512 B a step for
      the empty arena, 10 KB for a gated load, 52 B for a body - each about a quarter over what the
      commit that wrote them measured, because a ratchet with no room in it gets raised the first time
      anybody needs it. Thirteen tests in `test/alloc-probe.test.mjs`: that a crowd is visible against an
      empty arena, that the two pooled lists still throw away nothing extra (900 sparks, 60 shots), that
      the same load reads the same number twice in two processes, that every gated scene asks its body
      count of `BALANCE`, that the young-generation arithmetic is the arithmetic of a megabyte, and that
      every flag is refused before it can print a wrong number. Suite 1787. The reference run is byte
      for byte what it was: a step that allocates less does the same work.
- [x] The crowd still throws away what it throws away. **It threw away four to seven times what it needs
      to.** The reading when this item was written was **31 B a body** against a 52 B budget, and the
      ablation had named `updateEnemies` as three quarters of a step; it was right, and the thing inside
      `updateEnemies` was **`Math.hypot`**. V8's `Math.hypot` takes any number of arguments, so it lays
      them out in a list on the heap and throws that list away again on every call - and the crowd called
      it one or twice a body every step, in `holdTheBand`, in `hunting`, in `advance`, in the flock and
      the bomber's circle and the missile's aim: **38 call sites**, all of them two-argument.
      `core/math.js` now has a two-argument `hypot` of its own (a multiply, an add and a square root),
      every call site uses it, and `test/structure.test.mjs` refuses the old one anywhere in `src/`
      outside the file that explains it. The same scenes, same tool, same box: the **schedule crowd 3.4 KB
      a step down to 816 B, the endless wall 6.1 KB down to 854 B, the same crowd dying 8.5 KB down to
      1.2 KB, PLAN's own impossible scene 19.6 KB down to 2.8 KB** - and what a body costs went **31 B to
      3 B**, so a young generation is now a megabyte of play rather than a megabyte every 1.4 s.
      Measured with the same ablation doors, in the order they fell over: the walks are the crowd's
      garbage and everything else is rounding (`updateEnemies` is 731 B of the schedule's 816, and within
      it the separation pass is 259 B and the walk calls 727 B before they were made cheap; `updateShields`
      287 B, `updateBullets` 125 B, the grid rebuild 81 B, everything else under 40 B). It is *not* a
      double-unboxing story, which was the first guess and is wrong: writing a double into a live enemy's
      `x`, `rot`, `timer` or `hp` in a hot loop was measured to throw away nothing at all on this box, and
      a `for..of` over the crowd costs an iterator nobody can see.
      **The budgets came down with the game** - a body 52 B to **16 B**, a load 10 KB to **2.5 KB** - and
      all three were mutation-checked by putting the allocation back in a copy of the tree: `Math.hypot`
      back in the walk reads 8.5 KB a step and fails, a scratch object per `glide` reads 15 KB and fails,
      `cell.length = 0` back in `core/grid.js` reads 11.8 KB and fails. The old 10 KB budget would have
      passed the first of those, which is the whole argument for moving a ceiling when the floor drops.
      Six tests new (five in `test/math.test.mjs` for the helper itself - that it is the same number
      `Math.hypot` was, to within 1e-12, over every line the arena can draw - and one structure guard).
      Suite 1803 to 1809. What is left is small and diffuse: about 4 B a body, most of it inside the walk
      functions' own arithmetic, and getting that to zero would mean positions in typed arrays - which is
      a rewrite of the crowd's storage and not a sweep, and is not worth it at three bytes a body.
      One thing the reference run did move: `Math.hypot` and `sqrt(dx^2 + dy^2)` are the same number to
      within a rounding error and a rounding error is enough to move a darter's aim, so the run
      (`--seed 20261006`) is a different run from frame ~11,000 onward - 10m00s / 73,982 / level 57
      against 10m00s / 75,596 / level 58, well inside the seed-to-seed spread, and the four-seed batch
      moved +16% median score which is less than the spread between its own best and worst seed.

- [x] Cut what the crowd costs when it is dying, which was the dearest thing in the game and had not
      been looked at. **It was not the dying: it was the sound.** A cue - the note a darter's beat, a shot
      landing, a body coming apart or a shard being collected asks `audio/sfx.js` for - was a fresh object
      per sound, and a crowded step asks for 1.7 of them: that one `queue.push` was **295 B of the 410 B a
      step** that separated the crowd dying (984 B) from the same 200 bodies standing still (574 B), and it
      was the dearest allocator left in the game once `Math.hypot` was gone. The price of each suspect was
      read the way the `Math.hypot` hunt read it - copy the tree, switch one part off, weigh the same load
      again - because the probe weighs a step and cannot name a cause: cue objects off reads the dying crowd
      at 689 B and the endless wall at 507 B; the whole shard drop-and-pickup path off reads it at 533 B
      (the two overlap by ~155 B, which is the pickup pings); and the `'+' + enemy.score` string a floating
      label is worth **4 B a step**, which is what the optimiser leaves of a short concatenation - so it was
      measured and left exactly where it was, and a heap profile (`node --heap-prof`) named the queue by
      5 MB over a fight before any of that.
      **What shipped** is `game/cues.js` on a `core/pool.js` pool: one shape for all four kinds of cue, every
      queue function writing every field (the contract every other pooled list in the game keeps), and a
      drained cue *on loan* - the records go back the moment the drain is over, so `copyCue` is how you keep
      one and `drainCues` now hands the frame's whole batch to its listener at once, which is what
      `audio/sfx.js` needed anyway because it cannot spend a voice budget until it has seen the frame. Twelve
      listeners in `test/` listen through the new `tools/headless/hear.js`, and 9 tests in
      `test/cues.test.mjs` keep the loan, the wipe, the reuse and the `finally` that takes the records home
      even from a listener that throws: **a real two-minute fight queues 4,968 sounds, builds 15 records and
      leaves none live.**
      **The same five loads, re-weighed**: the schedule crowd **436 B → 407 B**, the endless wall **574 →
      514**, the crowd dying **984 → 735**, the same crowd spread out **582 → 499**, PLAN section 2's
      impossible scene 3.9 KB → **3.3 KB**; a megabyte of garbage now takes 11.9 s of the dearest load
      instead of 8.9 s, and a scavenge of that heap is what a worst frame is made of. `STEP_BYTES` came down
      1,280 → **896 B** and `BODY_BYTES` 8 → **5**, and for the first time the gate was checked against the
      regression that paid for it: putting an object per sound back reads 984 B a step and **fails** (exit 1),
      which is the mutation check this file has always run on its own budgets. What is left of the 735 B is
      small and diffuse - with the queue pooled the allocation sampler names nothing in `src/` above 200 KB
      over a whole fight, the same verdict the grid hunt reached about the walk, so it is typed-array
      positions or nothing now. The reference run is byte for byte the run it was (a cue never feeds back
      into a run, and 4,968 of them make sure of it), suite 2014 → 2023.
- [ ] The browser half of the performance pass, which this project cannot take by itself: open the game,
      put up the F3 plate, fly the endless door until the plate reads `bodies 200 / 200`, and write down
      what `step ms` and `draw ms` say. `tools/perf-probe.js` knows the arena (0.11 ms a step at that
      crowd, 2,947 canvas operations a frame) and the plate is the only thing in here that can say what
      a real canvas asks of a real machine. Until that is read, `endless.growth.bodiesCeil` stays at 200
      and PLAN section 2's 600-enemy sentence stays printed and ungated.
      **This one is the owner's to take, and it survived 1.0.0 for that reason**: there is no browser on
      this box and no canvas here to time, so a headless session can only say so. Everything the tool side
      can gate *is* gated (`tools/perf-probe.js` paints the arena into a recording painter and holds the
      step and the operation count), and it passes; what nobody has ever read is what a real GPU says.
      **One more stop for the same flight, added in session 122**: a scheduled run under THICK CROWD holds
      150 bodies instead of 100, a crowd the arena has never been timed at, between the 100 the plate's
      scheduled scene stops at and the 200 endless may reach. Read `step ms` and `draw ms` there too while
      the plate is up - `crowdHoldOf` is capped by `bodiesCeil` and by nothing else, so if a real machine
      says 150 is too many the honest answer is a smaller share and not a raised ceiling.
- [x] Hunt for memory growth over a 30-minute simulated run.
      `tools/memory-hunt.js` is the hunt, and it is a check - it exits non-zero when something is
      accumulating. It flies the endless door for the thirty minutes (a sample a minute, the heap read
      after a forced collection), and before them eight careless runs on one visit, because an ending
      is where a run's objects get built and thrown away, and a page that gets heavier per wreck needs
      a reload by lunchtime. The reading it ships with: the flight 0.030 MB a minute against a 0.12
      budget, the wrecks 0.063 MB a run against 0.20, the glow cache 8.9 MB of baked pixels against
      40. What does grow is the crowd and the pools holding it - the rings built 123 more objects and
      the fires 104 between minute 5 and the end, and the arena filled to exactly its 200-body wall -
      and the save document, and all of it is bounded: by the cap, by `BALANCE.history.keep`, by a
      palette that stops asking for new sprites. No leak found. One real change came out of looking:
      `render/glow.js`'s `stats()` now prices its own cache in bytes, because a headless canvas holds no
      pixels and a cache that baked one sprite per size would grow forever without a single heap reading
      in here noticing. Thirteen tests in `test/memory-hunt.test.mjs`, one in `test/glow.test.mjs`; suite
      1718. The reference run is byte for byte what it was. Notes, and the traps in reading a heap,
      in NOTES session 93.
- [x] Daily run: a seed taken from the date, the same for everyone that day, with its own best score.
      **Shipped as `src/game/daily.js` and one key, `T`.** A daily run is an ordinary run flown on a
      seed nobody chose - the day's own number, scrambled through the same mixer `core/rng.js` scrambles
      successive seeds with, so 2026-10-12 is not 2026-10-11 with one drifter moved but an unrelated
      arena (`seedFor`, tested over 400 consecutive days: 400 different seeds, none of them the date
      itself). The date is a whole number written the way a date is spoken - `20261012` - because it is
      a label and not a duration: nothing is ever measured between two of them, so it can sit in the save
      document and be read there without a decoder. The day's best is a fourth banked number on the
      title (`BEST · STARDUST · TODAY 4,321`), the run's own card says which day it was flown on
      and whether it beat the day, the pause names the whole date, and the HUD writes `TODAY 10-12`
      beside the clock - and every one of those four says nothing at all for a run that flew an arena of
      its own, so an ordinary visit is the visit it was, down to the pixels.
      **Four decisions, none of them free.** *The day is the player's own and not the clock's:* the date
      is read locally, so "today" is the day on the machine being played on. A shared UTC day is the
      more globally consistent answer and the less honest one - it calls yesterday's arena "today" for
      half the planet for a few hours and resets a best at four in the afternoon, and two people
      comparing scores are almost always in the same day already. *One day is kept, not a history:* the
      save holds the latest day it saw and the best on it, because once today has begun yesterday's best
      is a number nothing in the game can be compared against, and a stored field nobody reads is a
      field that quietly rots. *A daily run banks everything an ordinary one banks* - the all-time best,
      the purse, the codex, the awards, the log - because it is a run, and a run that paid half as much
      for being on everybody's seed would be a punishment for taking the challenge; the day's best is an
      extra line on top, which is what makes it a challenge and not a second mode. *`T` is a launch and
      not a mode:* one press flies today and the next launch is an ordinary run again, so nothing has to
      be remembered about "being on the daily", `Space` never changes meaning, and the only state a
      daily run leaves behind is the day written into the run that was flown on it.
      **The clock is asked for in exactly one place** (`todayDay`, and a new guard in
      `test/structure.test.mjs` refuses `new Date` anywhere else in `src/game`), and never during a step:
      a run launched at 23:59 belongs to the day it started on even if it is still flying after midnight,
      which is why the ending is banked *for the day it cares about* rather than for "today". **What the
      key is not:** a thirteenth row on the title's control list - the column is already exactly as tall
      as the window it was designed for (index.html's own comment says so, and the type adds up to it),
      so the key is written on the launch line instead, beside the launch key, which is where a first
      visit looks for it, and a test pins that sentence. `tools/agent-bridge.js` gained the same launch
      (`start { today: true }`, with the day answered back in the run result) so an agent can fly the
      arena everybody else is flying and know which day its score belongs to.
      **One real bug came out of it, in `main.js`:** the day's seed was being written into `world.seed`
      and left there, so the ordinary run after a daily one flew the day by default - and the same field
      is how the address bar, `tools/simulate.js` and the test harness hand a visit its seed, so three
      existing tests caught it before it shipped (`test/seed.test.mjs`, `test/history.test.mjs`,
      `test/agent-session.test.mjs`). `beginRun` now knows which seed an ordinary run comes back to, and
      a test pins the coming-back. Suite 1809 to **1837**: 25 tests in `test/daily.test.mjs` (the day and
      its words, the seed, nonsense in the save refused on the way in *and* on the way out, the key, the
      banking through a real death, a day that has turned, the three surfaces' words, and the page's own
      rules), one in `test/rng.test.mjs` for `seedFor`, and the clock guard - ten mutations checked, all
      ten caught. The reference run (`--seed 20261006 --trace`) is byte for byte what it was: a day is a
      label, and the simulation never learns what date it is.
- [x] A short first-run tutorial: three prompts that appear in play and vanish once done. **Shipped as
      `src/game/tutorial.js` (what is said, when, and what makes it stop) and `src/render/tutorial.js`
      (the plate it is said on).** Three lines and no more: `W A S D TO FLY`,
      `MOUSE TO AIM · HOLD LEFT TO FIRE`, `SPACE TO DASH` - the three physical acts of the game, in the
      order a run asks for them, on one plate at the bottom of the glass, gone the moment the run has
      proved it does not need them. **There is no tutorial screen and there is not going to be one**: a
      screen between a new visitor and the arena is a wall built out of the thing they came to look at,
      and everything in `BALANCE.tutorial` is therefore about being in the way - nine seconds on the
      glass, six before it will try again, two attempts per lesson per run, and a plate that dims out
      over half a second instead of blinking off.
      **The load-bearing decision is that a lesson is a latch and not a reading.** Every one of the three
      is checked every step - whether or not anything was ever put up for it - against something the run
      can see the ship doing: the hull has covered 260 px of arena (the *path* walked, so flying out and
      back counts), there is a shot in the air, the run's own tally has been granted a dash (game/`tally`
      `noteDash`, the same number an ending is asked about, and a dash *granted* rather than a finger
      pressed). A visit that arrives already knowing how to dash is never shown the dash, and a visit
      that flies and shoots inside its first three seconds sees nothing at all - which includes the very
      common case of launching with a click, because a held left button launches the run *and* fires it,
      so that visitor had shot before the game could tell them they could. That is the whole difference
      between a tutorial and a hint nobody asked for.
      **One lesson is on the glass at a time, and each arrives at the moment it is about**: flying from
      the first step, the gun once there is a body in the arena at all (deliberately not "within range of
      the gun" - the five primaries' reaches run from the arc's 260 px to the pulse's 700 and one number
      would be wrong for four of them), the dash when a body is standing inside `close` = 220 px, which
      is the dash's own distance (`player.dash.distance`) so the hint appears at exactly the range one
      dash can cover, and only while the dash is ready, because a hint about a move the ship cannot make
      yet is a hint about nothing.
      **The fourth lesson the game does not need is the cards**, and that is why there are three and not
      four: `render/cards.js` already prints `CHOOSE ONE · 1 2 3 OR CLICK` over the table with a number
      chip in every card's corner, and the level-up *is* the teaching - it stops the run, in front of
      three things with prices on them, until an answer is given. The shard-XP-level loop is taught by
      its own bar filling.
      **Offered for the first three runs of a save, and never after**, gated on how many rows the run log
      holds (game/history.js) rather than on a "have I shown the tutorial" flag - because that number is
      in the document already and it is the honest answer to *is this visitor new*: a save that arrived
      from an older build, twenty runs old and never taught, is a save that learned to play without these
      three lines and will not be taught now. What was learned is kept beside it as a set of lesson ids
      (`tutorial.learned`, and `names` is the kind a lesson is: learned once, no second rank of knowing
      how to dash), banked at an ending exactly like the codex, the awards and the log - a mirror, and
      written with the game's own ids only, so a document that picked up a name from somewhere else is
      tidied on the way out rather than carried.
      **The place on the glass is the design.** The top belongs to the score, the hull and the boss's bar,
      the top-centre to the award plates, the left edge to the build rail and the very bottom to the XP
      bar; the strip above the XP bar's caption is the only part of this window nothing else ever asks
      for, so that is where a lesson goes - and it is refused outright over the three screens that have
      taken the window (the cards, the pause rack, an ending), because a hint about the dash floating
      above a card that says the run died of not using it is a bad joke. Cool edge, no gold: gold is
      what pays you and a lesson pays nothing.
      **Verified as a watcher and not a system.** Suite 1837 to **1851**: 14 tests in
      `test/tutorial.test.mjs` - the three lines and the keys the title screen prints beside them, each
      lesson's words measured inside the plate that painted them, the plate's place and its fade out, the
      gun never shown to a run that had already fired, the dash waiting for a body inside one dash, a
      prompt stepping back and giving up after two asks, the three screens it keeps off, what an ending
      banks and what the next run then refuses to say, a document holding nonsense, and the one that
      matters most: **the same seed flown twice, once with all three lessons in front of it and once with
      nothing left to teach, ending on the same fingerprint** - this module reads the run and must not be
      able to move it. Sixteen mutations of the gates were run against the file and all sixteen were
      caught, including the four latches (a plate that never steps back, a lesson that is never learned,
      a veteran save taught anyway, a plate painted over the cards). The reference run
      (`--seed 20261006 --trace`) is byte for byte what it was - 10m00s / 73,982 / level 57 / 3,934
      kills / 4,934 shards - which it has to be, and `tools/reset-audit.js`'s list of what a run is
      allowed to keep grew by two rows with a reason next to each (`tips`, and the board's one reading
      of it) rather than by one silently.
- [x] Read every line of text in the game and make it short, clear, and consistent. **Done as a pass with an
      instrument, because the line count is the problem:** the game says something to the player in about
      three hundred and fifty places, and half of those sentences are built out of two or three string
      literals at the moment they are painted (`'RANK ' + held + ' OF ' + max`), so a grep reads the parts
      and not the writing. **`tools/headless/text.js` plays a whole visit instead** - title, hangar, codex,
      settings, mixer, a run flying, the card table, the pause, the wreck's card, the win's card - and
      takes back every word on the glass and on the page at each stop, plus the sentences written straight
      into `index.html`, which is where most of the interface's lines actually live and which the stub
      browser cannot see at all. `node tools/text-survey.js` prints that harvest for a human to read
      (`--counts` for the shape of it); **`test/words.test.mjs` is the same harvest with the rules on.**
      **The three voices, which is what "consistent" turned out to mean.** The interface speaks in caps
      (`HANGAR · BUY SHIPS AND PERKS`, `TAKEN BY A TANK`); the catalogue speaks in lower case with no full
      stop (`too heavy to turn, and comes apart in two`); a card's own copy is a sentence and ends like one
      (`A shot goes through one more body, and on to the next.`), which is the one place a full stop
      belongs. Eleven tests hold that: caps everywhere else a player reads, the catalogue's length ceilings
      (60 characters, and 130 for a card's sentence, which is `game/upgrades.js`'s own budget made
      enforceable), a middle dot with room either side, one noun for one thing, one wording for the run's
      clock, and no line that writes `1 KILLS`. Nine mutations were run against the file and all nine were
      caught. Suite 1851 to **1862**.
      **What the reading found, all of it still visible in the game until now.** The mixer's readout and
      the settings panel are one machine seen from two places and they called its effects bus `SOUND` in
      one and `SOUNDS` in the other - now `SOUND` in both, and a test pins that the two places cannot drift
      again. The readout's own line of keys was the only lower-case sentence on the glass (`M mute [ ]
      music - = sound`); it is caps like the rows above it, and the comment above it no longer claims there
      is no settings page. **`1 KILLS`**: both end cards join a count to a fixed plural, so a win with
      exactly one kill on it read `1 KILLS · 0 SHARDS · 1 BOSS` - `countWords` now says `1 KILL`, and the
      win this pass reached is the test. The HUD wrote `TIME 902s` while the card the same run ended on
      wrote `CLEARED IN 15m02s`, and `clockWords`'s own comment argued that a fifteen-minute run deserves
      better than `902s`; the wording moved to `core/words.js` (the palette's argument again: the page and
      the glass may not read each other) and the HUD reads it, with a test comparing the two clocks off one
      win. In the title's control list, two rows were the only ones joining their clauses with a comma -
      `PICK A CARD WHEN IT IS DEALT` and `GIVE THE RUN UP WHILE PAUSED` now read like the ten rows beside
      them and say the same thing in fewer characters. And the codex said the sniper was `bolted down;
      draws a line, then fires down it`, which is both the semicolon of the set and a phrase nobody would
      pick; it `plants itself, draws a line, then fires down it`.
      **Left as it is, on purpose.** The developer's plate (`F3`) is lower case like a terminal and stays
      that way - it is a readout and not a sentence, and the test file says so rather than leaving it
      unexplained. The one thing in the harvest that still reads telegraphically is a wreck's build line
      when the run took no cards at all (`WISP · PULSE · BUILT FROM · NO UPGRADES`); it was left alone
      because the only fix that reads better would split one sentence across two modules, and `NO UPGRADES`
      is the same clause the banished lines are said with (`NO TETHER`).
- [x] Measure every line of interface type, and make the quiet ones legible. (**The arena has had a
      colour ruler for five milestones and the interface has never had one**, which is how ten of the
      game's lines came to be written at 2.4 to 4.4 to 1 against the field they sit on - every one of them
      deliberate: the codex's undiscovered rows (2.43, 2.96), an award not yet won (2.82, 4.42), a ship the
      purse has not bought (3.22, 4.12), a settings row's own explanation (3.65), the mixer's quiet slider
      (3.05) and the banish tab (3.31). `tools/contrast.js` is the ruler - the WCAG 2.1 relative-luminance
      ratio, 4.5 to 1 for a line you read and 3 to 1 for a heading of 24px or more, because a line of type
      you cannot read is a fact the game is not telling you, and not a colour-vision question in the way a
      red body against a red sky is - and the Oklab step is printed beside every number so an interface
      figure can still be compared with an arena one. **The page half is read out of `index.html` itself**:
      every `color:` declaration in its stylesheet, its size resolved through the same inheritance a
      browser would use, dimmed by whatever `opacity` its own rule sets, composited over a veil parsed out
      of the same file - so the audit cannot drift from the page and a new line of type is measured the day
      it is written. **The glass half is a table** of the 27 lines `src/render/` paints, every colour read
      from `core/palette.js` by name and every plate a palette entry (`plate`, `plateDeep`, `chipFace`, and
      a test refuses an inline rgba plate in the renderer), pinned to the drawing twice: once by reading the
      function that paints it, once by painting the mixer readout in a test and reading the ink and the alpha
      back off the canvas stub. That pin is not decoration - the tab had been measured in `cardEdge` while
      the code had long since started painting it in the card's own key colour, so one of those ten failures
      was a phantom and nine were real. **What changed on the screen**: the quiet rungs are quiet in colour
      and no longer in darkness, because a line under the bar is not a quiet line, it is an absent one - the
      page's body blue went 6.46 to 7.05 and its numbers 5.03 to 5.60 so the ladder stayed stretched, and the
      eight dim rungs came up to 4.7-5.6 with the step below the rung above them intact (the glow, and not
      the colour, is the mark of a thing earned: it says so in the CSS and in a test). The mixer's untouched
      row went from alpha 0.5 to 0.7 - 3.05 to 4.82, still half as lit as the row you just moved - and the
      banish tab's cold ink from the card's blue to the interface's secondary text colour, 3.31 to 6.43.
      `tools/contrast-check.js` prints the whole thing (`--all`, `--strict`) and `test/contrast.test.mjs`
      holds it in 13 tests, including a named list of the five lines that are meant to be near their bar.
      Suite 1985 to **1998**, and the reference run traces the same bytes because nothing in `game/` moved.)
- [x] Release `1.0.0`. **Done.** The last milestone-10 item this project could take by itself: the two
      budgets it wanted re-checked were checked the same session (`tools/alloc-probe.js` - 4 gated loads,
      the dearest step 735 B, PASS; `tools/perf-probe.js` - 4 gated scenes, the worst step 0.103 ms and
      the dearest mean 3,407 operations, PASS), the whole suite of 2,043 tests passed, and a full headless
      run plays through to the cap. The only item left in this milestone is the browser half of the
      performance pass above, which needs a screen and a person in front of it.

### After 1.0
Keep going with whatever makes the game better. Ideas: new enemies, a fourth boss, challenge modifiers
(double speed, one hull, no dash), a second arena with obstacles, more ships, more synergies,
a replay viewer driven by the seed and recorded input. Write new items here before starting them.

- [x] Challenge modifiers: a harder set of rules for the next run, chosen between runs. Three of them,
      one at a time — **one hull** (the ship stands on a single hull, whatever the body and whatever the
      hangar's plating bought), **no dash** (the jump is gone, and the two lines gated on it are not
      dealt), and **a swift crowd** (every body and every enemy shot travels some share faster than it
      shipped). Each is a row in `BALANCE.challenges` plus a flag on the world that the simulation reads
      where the number is already read — nothing is cached into a ship and nothing is kept in two places.
      Chosen with one key that cycles them, on every screen the launch key launches from, remembered for
      the visit like the ship pick is and for the same reason: it is a choice about the next run, not a
      thing a save has to remember. Said out loud everywhere a run's facts are said — the title, the HUD
      beside the clock, the pause's rack, and the ending's card — because a rule the player has forgotten
      is a rule the game cheated with. Checked headlessly with the bot's yardstick: does the careless
      build die sooner under each one, by how much, and does the careful one still stand?
      A record per challenge (a best under each line, the way the day keeps its own) is a separate item,
      because it wants a save section and a panel of its own and this does not.
      Shipped as `game/challenges.js` (the table, the cycle, the four levers, the words) over
      `BALANCE.challenges`, with `tools/challenge-cost.js` as the ladder: a careless hand's middle score
      reads 0.39x plain under ONE HULL and 0.45x under a SWIFT CROWD of 1.4x speed, and both die sooner
      — while NO DASH is reported and never judged, because what the jump is worth is a question about a
      person's hands and no bot here presses it ten times a quarter hour. The ladder refuses to pass a
      rule that scores above 0.95x plain, and says out loud when a batch was blind to a rule instead of
      passing it as free.

- [x] A best under each rule: what this save has scored under every challenge, the way the day keeps
      its own. A rule with no number under it is a rule with nothing to beat, and a score flown under
      ONE HULL that is filed in the same column as an ordinary one is a number quoted without its
      units. So: a save section of challenge id to best score, banked at an ending beside the all-time
      best and the day's; the record of the *chosen* rule said on the title's challenge line, so the
      key that sets a rule also shows what that rule is worth to this save; the same record on the
      ending's card, with the NEW word the day's line uses when this run set it; and a fifth rack on
      the codex — one row per rule, its best and its sentence, dim and saying NOT FLOWN YET until it
      has been. The codex and not a panel of its own, because "what this save has flown" is already
      that panel's second question (the log is its fourth rack) and three rules do not earn a key.
      Written so an ordinary run never pays for it: no rule flying means no bank, no word and no row
      that was not there before.
      **Shipped over `SAVE.challenges.bests`** — one map of rule id to best score, in the same ledger
      shape the perk tally is, so a fourth rule is a row in a table and not a request for storage. It is
      banked in `bankRun` after the all-time best and the day's, as the narrowest of the three claims,
      and it keeps their bargain about a run that stops twice. `game/challenges.js` owns the reading
      (`bestsFromSave`, `bestOf`, `bankChallenge`) and the saying: the title's rule line ends with what
      the save has under that rule, and an ending's card ends with the same number or with NEW BEST FOR
      THIS RULE, which is the pair game/daily.js makes about the day. The codex's fifth rack has one row
      per rule in the order the key cycles them — its number and its sentence, or NOT FLOWN YET and no
      glow — so all three can be read at once instead of cycled blind, and it is repainted by the ending
      that changed it, like the log and the awards. `test/challenge-records.test.mjs` is 18 checks over
      the ledger, the store's refusals, the words, a real visit, and the rack. An ordinary run is still
      byte for byte the run it was: `tools/simulate.js` on seed 20261006 traces the same 10 minutes it
      traced before this existed.

- [x] The run log does not say which rule a run was flown under. A row of the codex's fourth rack is a
      seed, a body, a clock, a score and a win (game/history.js), and a 90,000 scored on ONE HULL sits in
      that column next to a 90,000 flown plain, which is the exact thing the last item was written to stop.
      It is not a line of code: `core/save.js` `records` judges every field of a row whole — a record that
      lost a field is a row that cannot be printed, and it is dropped — so a new required `challenge` field
      would silently throw away every row on every existing save the first time it was read. Either the
      store grows a honest kind for "a field a row written before it existed is allowed to lack", or the
      log is rewritten once on the way in with the plain answer filled in. Both are store work with a
      migration in it, which is why it is an item and not a patch.
      **Done, and the migration turned out to be the half that was not needed.** The store grew the honest
      kind — `KINDS.optional(inner)` wraps another kind and says *a record may arrive without this field*,
      which `records` reads as its own answer: an absent field is left **off the record** rather than filled
      with a stand-in, and a reader that owns the field decides what absent means. That is the whole trick,
      because it makes the absence the answer instead of a word for it: an ordinary run writes a row that is
      byte for byte the row it always wrote (`{"seed":…,"won":false}` and nothing more), a row written before
      rules existed reads back as exactly that same row, and so there is nothing to rewrite on anybody's
      way in — no migration, no save version bump, no first-read write that would break the store's own "a
      read never destroys" promise. A rule that *is* there is still judged by the inner kind, so "allowed to
      be absent" is not "allowed to be nonsense": a row with `rule: 'ONE HULL'` or `rule: ''` or `rule: 4` is
      a wrecked row and is dropped with its neighbours intact, and `''` is refused on purpose because the
      document says "none" by not naming one, the same way an unmapped control is simply not in `keys.binds`.
      `runs.log`'s row is therefore seed, ship, seconds, score, won, and `rule` when it had one
      (game/challenges.js's id, not its display name). The codex's fourth rack prints the rule next to the
      score it is the units of — `WISP · 40s · 90,000 · ONE HULL` — and says nothing for a plain row, which
      is the only sentence that is true of a row that predates the field; a rule id this build has never met
      is named by its own text, exactly as an unknown ship already was. Tested at every layer it touches:
      a test in `test/save.test.mjs` over the new kind (predecessor rows read whole, rubbish refused, a
      plain row's written text proved byte for byte), one in `test/history-rules.test.mjs` that a row keeps
      the rule its own run flew while the plain row above it says nothing, one in `test/history.test.mjs`
      over a real visit — ruled run, plain run, both rows in the save — and `test/history-saved.test.mjs`
      now arrives with a ruled row and a row under a rule that does not exist here. The reference run is
      untouched — `tools/simulate.js --trace` on seed 20261006 traces identically against a `git worktree`
      of the previous commit, which is what a mirror read at endings and never in a step is supposed to do.

- [x] The bot's dash habit is a dive in and not a get-out. `dashEscape` (`tools/headless/bot.js`) presses
      the dash at the screen point of the nearest body, and a dash taken with no movement key held goes
      the way the cursor points - at it. Measured on the same seeds it is a *negative* habit: the aware
      bot's careless middle death falls from 4m19s to 1m43s with `--dash` on, and the human's from 2m44s
      to 56s. Every line that lives on the dash was priced with it on (`game/afterimage.js` especially),
      so fixing which way it dashes means re-pricing those cards - a session, not a patch.
      **Done in NOTES session 114, and the habit turned out to be the smaller half of it.** The bot now
      dashes the way a person does - away from the crowd it is standing in, away from the edge where the
      crowd is not, when something actually gets within reach - and `tools/dash-habit.js` is the check that
      keeps it honest (`--strict`, four habits, and the columns say which way each dash was pointed and
      where it ended). What the sweep found is that *when* it presses matters far more than which way: at
      the old panic distance of 170 px the get-out habit was still worth roughly nothing (careless aware
      middle of deaths 5m11s against the 4m23s floor, 12 of 16 dead against 9), because a dash spent on
      every cooldown is a dash spent on nothing. At 45 px - about one body-reach - the same habit is worth
      more than anything else measured: careless aware 7m20s against that 4m23s floor with 1 of 16 dead
      instead of 9 and a score median of 42,893 against 12,914, and the careless human 4m32s against its
      own 2m33s floor. On the careful build nobody dies either way and the habit costs nothing, which is
      the other half of why it ships: 7.8 presses a quarter-hour against a bit over a hundred, and the
      same 15 minutes of flying.
- [x] Re-price the two dash lines against the habit that ships now. The get-out dash presses about ten
      times a quarter-hour where the dive habit pressed a hundred and thirty, and both these lines are
      gated entirely on the press: with the new habit `tools/line-ab.js --line tether --dash` says five
      free ranks are worth +1.5% score and nothing at all to the damage column, against the +2..5%
      the row was priced off, and a cord now stands for about 1% of a run instead of half of one.
      Neither is a retune on its own - the rate that card is bought at is a player spending dashes on
      purpose, which no bot here has ever done - but `tether.damage`, `afterimage.bait` and what the
      `overcharge` line is worth with its dash taken away all want reading again against an instrument
      that presses the way its buyer would. NOTES session 114 has every number.
      **Read again in session 117. No number moved, and that is a finding rather than a shrug: each
      of the three is now measured on the habit that ships, and two of them have an instrument that
      can say so again.** **`tether.weight` 5** - per event the line was never the problem: three
      ranks the bot bought for itself came round **1.68 bodies a pulse** and five free ranks 1.08
      (against a mine's 1.11 a blast), with 0.56 of a body standing on the threads averaged over a
      live step, so a sweep does exactly the work it always did and only the rate fell; the row keeps
      the weight on purpose, because at the press rate of someone who bought a card gated on the dash
      it paid 3-6% of a run's damage and +2.1..5.3% of its score - mines' family, not a beam-cannon -
      and at the get-out rate it is all but invisible. A line that is never too much and often nothing
      is priced on a wager on the player, which is what the row has always said it was. **
      `afterimage.bait` 110** - the prediction held: a get-out leaves its images in the road the crowd
      is walking down, and the share of the walking near crowd turned aside went from 6.4%/30.2%
      (rank 1/rank 5, session 42) to **16.5%/37.0%** on ten seeds of five minutes. The radius stays,
      for two reasons: the same instrument on a two-minute batch reads 36.9%/57.1% - a window that
      swings further than the radius does is not a yardstick to move a shipped number with - and the
      sweep of 72/90/110/130 px says the shipped radius is the best of the four on the habit that
      ships (130 px turns aside 51.1% at the fifth rank, which is the crowd stopping coming; 72 and
      90 px buy a *flatter* ladder, not a steeper one). `tools/ghost-grid.js` is that ruler, and
      session 42's three promises - a first rank felt, a fifth under the ceiling, a slope of at least
      twice - are now checks under `--strict`, with a floor of 25 presses of the dash under which the
      tool refuses to verdict at all. **`overcharge`** - worth more now, for the reason the item
      guessed: five free ranks are **+3.4%** of the damage column on the get-out habit against +1.5%
      on the dive habit, because a ship that dashes out and then stands its ground loads the gun and
      one that dashes every cooldown never stops moving long enough to. The line now counts its own
      loaded steps and loaded pulls (`overchargeLoaded`, `overchargeSpent`), so that claim can be
      re-read with a command instead of a guess.
- [ ] The afterimage's fourth and fifth ranks buy very little over its third. The same ruler, ten
      seeds of five minutes on the habit that ships: the share of the walking near crowd turned aside
      is 16.5% at rank 1, **35.7% at rank 3 and 37.0% at rank 5** - the ladder does nearly all of its
      work in the first three cards. The reason is the geometry the row already admits: five images
      spread over the dash's 220 px stand 44 px apart and `bait` is 110, so from the third rank on the
      discs have merged into one shape and another rank makes it fatter, not longer - the very test
      session 42 used to refuse 150 px, now arrived at from the other side. Narrowing the radius is
      not the answer and was measured as not the answer (72 and 90 px come out flatter, not steeper).
      What would answer it is a rank that buys ground the images cannot overlap - the streak they are
      spread over is `BALANCE.player.dash.distance` divided by the rank, and nothing in the game says
      a decoy has to be left within the dash that made it - or a rank that buys the two seconds PLAN
      gave the card, which is PLAN's number and would have to be argued out of existence first. Both
      are decisions about how a card feels, and the one thing a headless session does not have is eyes
      on a screen to make them with.
- [x] A fourth challenge rule: **THICK CROWD** — the arena holds more of the crowd than it ships. One
      row in `BALANCE.challenges` (`holdMul`), one lever (`crowdHoldOf`), and it is applied in the two
      places the arena's two walls are already read: the wave director's budget and its ceiling on
      standing bodies. One number for both walls because they are already tuned to meet (the budget's
      400 points is ~89 bodies at the crowd's 4.5 points a body and `waves.maxBodies` is 100), and the
      endless wall on bodies (`endless.growth.bodiesCeil`, 200) is deliberately left outside the
      multiply: it is a frame budget that has been timed on a real frame and a challenge may not move
      it. The rule is the fourth the After-1.0 list asked for and it costs the frame one row and one
      lever, exactly as the last three did — the record, the logged row, the title line, the glass
      beside the clock, the pause's rack and the codex's fifth rack all came free.
      1.5 ships. On the careless hand (8 seeds × 5m) the middle run dies at **2m48s against plain's
      3m53s** and scores **0.60x** plain's middle; on the careful hand nobody dies either way and it
      still costs a run — **0.73x** plain's middle score and **11 hulls lost against plain's 3**. The
      sweep could not choose between 1.3, 1.5 and 1.75 (0.64x, 0.60x, 0.62x on sixteen seeds), which is
      said out loud in the row rather than hidden: a bigger crowd is more bodies to shoot, so the score
      column is not monotonic in the share the way it is for a swift crowd. The number was picked on
      the frame's own account instead — 150 bodies in a scheduled run, under the 200 the browser half
      of the performance pass is meant to fly to. `tools/challenge-cost.js --hold` sweeps it and its
      verdict judges the rule like the other two; `test/challenge-thick.test.mjs` is seven checks over
      the lever, the endless wall, and the director filling the taller arena and not overflowing it.

- [ ] A thumb can fight and nothing else. The touch layer (`input/touch.js`) puts a stick and a dash
      button on the glass and, when a run is not flying, hands a tap to the same handler a click uses -
      which is enough to launch and to answer a card. Every other action in the game is a letter: the
      day (`T`), the harder rule (`X`), the codex, the hangar, the settings, the controls rack, the
      pause, and the giving-up of a run. A visitor on a phone therefore sees a title rack listing eight
      keys they cannot press and can do exactly one thing with the eight they can. Reading the layer
      cold (session 122) found nothing broken in it - the stick, the dash, the auto-fire assist and the
      "a tap resumes a held run" rule are all honest and documented; the gap is that the screens around
      the fight were never given a thumb shape. What to decide before building: *which* of those
      actions is worth a tap target on the title (my short list is TODAY, the rule, and SETTINGS,
      because the other three are reading and can wait for a keyboard), where the chips go without
      moving the logo, how big a target a thumb needs at the window sizes the game is played at
      (`input/touch.js` already answers that question for its own two controls, through `STICK_MIN`
      and `DASH_MIN`), and whether a held run gets a pause chip at all - the pause is currently reached
      by `Esc`/`P` and by nothing else, so a phone can only stop a run by backgrounding the tab. Part
      of this wants eyes on a real screen for the feel of it; the wiring does not, and the harness can
      put a touch on the glass (`touchstart`/`touchend` go through the same handlers a browser's do).

      **Part of it is built (session 123, v1.4.0): the thumb's rail.** Three chips at the bottom of the
      title - `TODAY`, `RULE`, `MUTE` - in `.rail`/`.chip` (index.html), found and hit-tested by
      `ui/chips.js`, answered in `main.js` `pressChip` by the very handlers `T`, `X` and `M` are
      answered by, guards and all. The four questions above, answered:

      * *Which ones:* the three that are a whole action in one press. That is the bar a chip has to clear,
        and it is why **SETTINGS is not on the rail** even though the short list above said it was: the
        chip would open a rack of arrow-key rows that a finger can neither change nor leave (`onCanvasPressed`
        refuses every press over a panel, so such a panel is a cage until a keyboard arrives). The
        settings, the hangar and the codex each want their own thumb shape - a row that steps when it is
        tapped, and a way out - and that is the rest of this item, not a chip.
      * *Where they go:* pinned to the bottom of the page (`position: absolute` inside the fixed
        `.screen`, above the safe-area inset), because the title's flex column is exactly as tall as the
        window it was built for and a row in it would move the mark `render/logo.js` measures.
      * *How big:* `min-height: 44px`, the same floor as `DASH_MIN`, and a test reads the stylesheet to
        hold it against the thumb's own number rather than a remembered one.
      * *Which visits see them:* one that arrived with a finger - `input/touch.js` `hasFinger()`, which
        asks the browser (`ontouchstart`, `navigator.maxTouchPoints`) because `thumbUsed()` cannot: a tap
        on a screen is deliberately not a control, so a phone on its title has never claimed one. A mouse
        visit never sees the rail and a click on where it sits is still just the launch
        (`test/thumb-rail-mouse.test.mjs`).

      A chip is **paint and never a listener**: the page has no click handler on it, the press comes in
      through the glass exactly as a click always did, and `chipAt(x, y)` asks the browser where the chip
      was laid out - the same question `render/logo.js` asks of `#logoBox`, so the box that is seen and
      the box that is pressed are one box by construction. The harness grew `touch: true` (a browser that
      reports fingers) and gives the four new boxes a 0x0 rect until a test lays them out, which is the
      honest answer for a stub with no layout engine and the reason every old visit is untouched.

      **A pause plate is built (session 124, v1.5.0).** It is not a chip - a chip is a title's and a
      plate is a fight's: `input/touch.js` grew a third place on the glass (`pauseButton`, on the right
      edge above the dash button, smaller than it, claimed by the touch layer the way the dash is) and
      `render/touch.js` paints it out of the same numbers, so the disc a thumb presses and the disc an
      eye sees are one disc. It is answered by `onPauseKey` - the very handler `Esc` and `P` are
      answered by - from both doors: the touch layer claims a finger's press and the wiring answers a
      cursor's (`onPausePlate`), because both of them have to be the same pause or the plate is a lie.
      It is on the glass for a visit that arrived with a finger and for no other, and doing it turned up
      a live bug: the thumb's tap-resume path called `resumeRun` on its own and left the pause rack
      painted over a run that was flying again, with nothing on the glass left to close it.

      Still open in this item: the panels' thumb shape (above) - which now includes the pause rack's own
      GIVE UP, since a plate can hold a run but no finger can end one, and giving a run up wants a
      confirm a single careless tap cannot set off - and the hangar, which is where a phone player
      cannot spend a coin of the stardust they have been earning.

- [x] The agent bridge: the game offered as tools on stdin and stdout, so a coding agent can be the
      player and a different one can be attached with a config line. `node tools/agent-bridge.js`,
      or `--demo` to watch the wire; `tools/agent/README.md` has the tools and why this is MCP over
      stdio rather than ACP. Shipped in 0.4.9.
