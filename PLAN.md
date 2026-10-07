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
| Orbitals | 2 drones circle the ship and damage on touch |
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

- **Ricochet**: shots bounce to another enemy, 1 extra bounce per rank.
- **Pierce**: shots pass through 1 extra enemy per rank.
- **Split shot**: 1 extra projectile per rank in a fan.
- **Burn**: hits ignite for damage over time; burning enemies spread it on death at rank 3.
- **Chill**: hits slow by 8% per rank; frozen enemies shatter for area damage at rank 5.
- **Leech**: every 60 kills heals 1 hull (fewer kills per rank).
- **Overcharge**: standing still for 1 s doubles the next shot.
- **Afterimage**: the dash leaves a decoy that enemies chase for 2 s.
- **Magnetar**: collected shards deal small area damage around the ship.
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

### 3.6 Experience curve

XP needed for level n: `8 + n × 6 + n² × 0.9`, rounded. A good run reaches about level 35 by the final boss.

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

- [ ] Level-up choice: the XP curve from 3.6, a pause on level-up, and three cards to pick from
      (mouse, or keys 1, 2, 3). Start with the stat upgrades Damage, Fire rate and Bullet speed,
      5 ranks each. Teach the simulation bot to pick a card, so headless runs still play through.
      **Release as soon as this works**, so the owner can play it.
- [ ] Split shot (3.5): one extra projectile per rank, in a fan.
- [ ] Pierce (3.5): shots pass through one extra enemy per rank.
- [ ] Ricochet (3.5): shots bounce to another enemy, one extra bounce per rank. Release.
- [ ] Orbitals (3.2): two drones circle the ship and damage on touch, as an upgrade line.
- [ ] Nova (3.2): every 8 s a ring of damage expands from the ship, as an upgrade line. Release.
- [ ] A second primary weapon, Scatter (3.2), and a third, Arc (3.2). Until the hangar exists,
      let the player pick the weapon on the title screen with a key.
- [ ] Survival check. Add a median to `tools/simulate.js` and run at least 20 seeds with the `aware`
      bot picking upgrades. The median must be 5:00 or more. If it is not, add firepower: stronger
      ranks, more ranks, another upgrade from 3.5. Never by weakening the enemies (see the hard rule).
      Write the numbers in `NOTES.md`. Release.

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
- [ ] Add each enemy from 3.3, one per session, each with its telegraph and death effect.
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
- [ ] Release.

### Milestone 4: upgrades
- [x] XP curve from 3.6, level-up pause, and the three-card choice screen.
- [x] Upgrade definitions as data. Stat upgrades first.
- [ ] Each behaviour upgrade from 3.5, one per session, each with a test of its logic.
- [ ] Each secondary system from 3.2, one per session.
- [ ] Card offer weighting, reroll, and banish.
- [ ] Synergies, with their special card frame.
- [ ] Owned-upgrade icons on the HUD.
- [ ] Release.

### Milestone 5: weapons and ships
- [ ] Weapon definitions as data; the five primaries from 3.2, one per session.
- [ ] Ships with different hull, speed, weapon, and drawn shape.
- [ ] Release.

### Milestone 6: bosses
- [ ] Boss framework: phases, hull bar, intro warning, spawn pause, arena lock.
- [ ] The Warden, one phase per session.
- [ ] The Hive, one phase per session.
- [ ] The Eclipse, one phase per session, including the darkness effect.
- [ ] Victory screen and the endless mode that follows.
- [ ] Release.

### Milestone 7: sound
- [ ] Audio engine: context start on first input, master compressor, music and effects buses.
- [ ] Effects for shots, hits, explosions, pickups, level-up, dash, player hit, UI.
- [ ] Voice limiting.
- [ ] The step sequencer and the base music pattern.
- [ ] Intensity layers, boss music, low-hull variation.
- [ ] Volume settings and mute.
- [ ] Release.

### Milestone 8: between runs
- [ ] The save module: versioned, validated on load, falls back to a fresh save if corrupt. With tests.
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
