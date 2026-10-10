# Starfall: the full plan

A top-down arena survival shooter for the browser. The player pilots a small glowing ship through
escalating waves, collects shards, picks upgrades, fights bosses, and unlocks new ships between runs.

A first playable version already exists as a single `index.html`. This plan grows it into a deep,
beautiful, finished game. It is many days of work. Go through the milestones in order.
Tick items as `[x]` when done. Each item is sized to fit one session; split it if it turns out bigger.

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
- All sound is synthesised with the Web Audio API. No audio files.
- All art is drawn in code. No image files.
- Saved data lives in `localStorage` under the single key `starfall.save`, as versioned JSON.
- **Game logic must not touch the DOM, canvas, or audio.** Logic modules take input and time, and
  change state. Rendering and audio read state. This split is what makes headless testing possible.
- Fixed simulation step of 1/120 s with an accumulator; rendering interpolates. Clamp long frames
  to 100 ms so a background tab does not explode the simulation.
- All randomness in game logic goes through one seeded generator (`src/core/rng.js`), so a run can be
  replayed exactly from its seed.
- Performance target: 60 fps with 600 enemies, 1500 bullets, 4000 particles on a mid-range laptop.
  Use object pools for bullets, particles, and enemies. No allocation inside the per-frame loops.
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
      `test/volume.test.mjs`, 20 tests: the shipped mix at the top of both, the graph built at
      wherever the sliders stand, the equal-dB curve, one bus per slider, the clamps, the refused
      press being silent *and* dark, mute above the sliders, every pitch each key answers with,
      the audition staying out of the sequencer's ledger, the readout answering over the cards
      and over the death's card and fitting its own plate. `STARFALL.stats()` reports the two
      levels and the mute, and the reference run still traces byte for byte the same game.)
- [ ] Release.

### Milestone 8: between runs
- [ ] The save module: versioned, validated on load, falls back to a fresh save if corrupt. With
      tests. (It has a family to inherit: the two volume sliders and the mute from milestone 7 are
      remembered for a visit and forgotten when the page reloads, because until now there was no
      versioned document to put them in - `core/save.js` holds the best score and nothing else.)
- [ ] Stardust rewards and the hangar screen.
- [ ] Ship unlocks and permanent perks.
- [ ] The codex.
- [ ] Achievements, with a small toast when earned.
- [ ] Run history: the last 20 runs with their seed, ship, time, and score.
- [ ] Release.

### Milestone 9: interface and access
- [ ] Animated title screen and logo.
- [ ] Pause screen with stats.
- [ ] Full game over summary.
- [ ] Settings screen with everything from section 6.
- [ ] Key rebinding.
- [ ] Gamepad support.
- [ ] Touch support.
- [ ] Colour-blind palette.
- [ ] Release.

### Milestone 10: balance and polish
- [ ] Use the simulation to check the difficulty arc: the bot should usually die between 4:00 and 9:00
      with no upgrades chosen wisely, and no enemy type should be responsible for over 40% of deaths.
- [ ] Tune every weapon so that none is over 25% better than the others in the balance report.
- [ ] Performance pass against the target in section 2. Add a debug overlay (F3) with frame time,
      entity counts, and pool usage.
- [ ] Hunt for memory growth over a 30-minute simulated run.
- [ ] Daily run: a seed taken from the date, the same for everyone that day, with its own best score.
- [ ] A short first-run tutorial: three prompts that appear in play and vanish once done.
- [ ] Read every line of text in the game and make it short, clear, and consistent.
- [ ] Release `1.0.0`.

### After 1.0
Keep going with whatever makes the game better. Ideas: new enemies, a fourth boss, challenge modifiers
(double speed, one hull, no dash), a second arena with obstacles, more ships, more synergies,
a replay viewer driven by the seed and recorded input. Write new items here before starting them.

- [x] The agent bridge: the game offered as tools on stdin and stdout, so a coding agent can be the
      player and a different one can be attached with a config line. `node tools/agent-bridge.js`,
      or `--demo` to watch the wire; `tools/agent/README.md` has the tools and why this is MCP over
      stdio rather than ACP. Shipped in 0.4.9.
