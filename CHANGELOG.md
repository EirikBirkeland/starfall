# Starfall — changelog

## 0.3.8 — 2026-10-07
Twenty of them at once: the swarm arrives at nine minutes.
- A **swarm** is one arrival made of up to twenty small, fast bodies. The wave director
  rolls it like any other kind and pays for it one body at a time, but the whole pack
  takes a single place in the wave's fan - it comes in off one side, together, as one
  thing coming in. Too few bodies to be called a swarm and the swarm is not sent at all.
- They **flock**. Every body pulls towards the ship, back towards the middle of its pack
  when it strays, and along the heading its neighbours are flying; the pack has a middle,
  a heading and a clock of its own, and a body that is cut off from them is just another
  enemy.
- Every few seconds the whole pack **bunches up and slows**, and then every body flies the
  one line the pack locked when it stopped bunching, several times its walking speed. That
  bunching is the telegraph - it is the same clock the drawing counts down, and one rising
  buzz for the pack rather than twenty - so a dive is always something you were shown.
- Individually a swarmling is the cheapest thing in the arena: seven pixels, one hull, and
  scarlet, which nothing else in the game wears. Together they are the one crowd that has
  to be read as a *thing*; a pack that reaches you and settles will cost you a hull every
  time you let it touch you, and the only answer is to keep moving and let the pack come
  apart behind you.
- A run that ends before 9:00 is untouched: the reference run is byte for byte the same
  3m17s it has been. In 24 measured runs four lived long enough to meet a swarm - the
  first one landed at 10m11s, since a pack has to be affordable as well as unlocked - and
  the swarm ended two of those four.

## 0.3.7 — 2026-10-07
The shielder arrives at seven and a half minutes, and it changes what you shoot at.
- A **shielder** walks in and stands off behind its own crowd with its face to you. Every
  body standing near it gets a **shield**: three points that come off before its hull
  does, so a shot that lands on the shield is spent and does nothing. The crowd around it
  is armoured, and it shows: the fence of its field crawls on the arena floor, a link runs
  from it to everyone under the fence, and each covered body wears a ring that drains as
  its shield is shot off.
- Kill the shielder and **every shield it held goes down at once** - the hull you had
  already taken off that crowd stays off, and the bodies behind it come down like they
  were never armoured. That is the whole kind: not a bigger enemy, a reason to pick your
  targets, and the biggest single thing a late wave can do to you.
- A shield grows back, but only after a couple of seconds of being left alone. So
  focusing one body beats spraying the crowd, and a shield you shoot at never finishes
  refilling.
- All of it is the same number the simulation uses, so nothing is ever shown that is not
  true: the fence is exactly the cover, and a ring is exactly how much shield is left.
  A bomber's blast pays for a shield too - anything that hurts a body does.
- A run that ends before 7:30 is untouched: the reference run is byte for byte the same
  3m17s it has been.

## 0.3.6 — 2026-10-07
The gold bodies actually arrive now.
- 0.3.5 put elites in the game and, it turns out, never sent any: the seat a gold body
  takes in a wave was rolled over a wave eight bodies long, while the waves a crowd can
  actually pay for are two or three bodies long. Eight measured runs - one of them eleven
  minutes - saw exactly zero gold bodies. The balance report is what showed it.
- A wave now buys its leader *first* and buys its escort with whatever room is left,
  so a wave of two can still be led by one. The rate is the one the roll always asked
  for: one wave in five after 8:00 carries a gold body, which is roughly one every
  quarter minute once the run is that old.
- A leader pays for itself. It costs three of its kind out of the run's spawn budget,
  so a wave that brings a gold tank brings fewer of everything else - the crowd is
  still held to what the run may hold, gold or not.
- A wave that carries a leader now stands it anywhere in the group rather than always
  at the front of it, which is what makes it read as the leader of a wave.
- A run that ends before 8:00 is untouched: the reference run is byte for byte the same
  3m17s it has been. The runs that live past it are harder now, by about as much as a
  gold body is worth.

## 0.3.5 — 2026-10-07
From eight minutes in, some of them come in gold.
- Any enemy can arrive as an **elite**: four times the hull, a fifth faster, and
  outlined in gold with a light of its own, so across a crowded screen you can pick
  one out at a glance. As it takes damage a gold ring closes round it, because four
  times the hull of a thing has to be seen going down.
- A gold body is worth three of its kind to the game's spawn budget, so hunting them
  down genuinely thins the crowd - and one is worth five times the score and twice the
  shards, plus a **large shard**: one big mint pickup worth six of the ordinary ones,
  drawn bigger and ringed when you collect it.
- Kill one with hull missing and it may give a **hull back** - the first healing in the
  game. It says so over your ship in mint, with a chord, and it never wastes the gift
  on a ship that is already whole.
- One wave carries at most one, and it arrives as part of a wave rather than dropped in
  front of you: a crowd with a leader, standing somewhere unpredictable in the group.
- An elite off the window is worth an arrow on the edge of the screen where its plain
  self is not, which is what that arrow was always for.
- None of it touches a run that ends before 8:00: the same 128 seeds play out byte for
  byte the same as before.

## 0.3.4 — 2026-10-07
The edge of the window now points at what is coming.
- The arena is several times the size of the screen and a wave arrives off one side of
  it, so most of what is on its way to you is not in view. There is an arrow on the
  edge of the window along the line to it now - one arrow per direction, however many
  are that way, so forty enemies off to the left are one bright arrow and not forty.
- How loud an arrow is says how much of the run's pressure is waiting in that
  direction: a tank is worth more arrow than a drifter, because it is worth more of
  everything else too. It brightens as the crowd walks in. Something on the far side
  of the world is a rumour; something at the edge of the glass is a shout.
- An arrow appears only for what the window is not drawing, and it is pinned to the
  glass instead of painted out in the arena, so a shaking screen cannot slide it off
  the edge it is warning you about. It fades in and out over about a tenth of a second,
  so an enemy crossing back into view does not make the edge of the screen strobe.
- None of this can move a run: the same seed plays the same game, arrow or no arrow.

## 0.3.3 — 2026-10-07
The bomber walks in at six minutes, and it is the first thing in the game that can
hurt its own kind.
- It walks straight at you carrying a blast. The circle it stands in is drawn on the
  arena floor at exactly the blast's reach - a dashed ring that crawls round and
  brightens as it takes damage - so what you are shown and what hurts you are the same
  number. Your ship's middle outside the line and you are safe whoever else is inside
  it.
- Below 45% of its hull it stops being careful: it speeds up, its ring and its fuse
  start to strobe, and it is trying to take you with it. So the question a bomber asks
  is not whether to shoot it but where.
- The blast hurts the crowd as much as you, for six damage in a circle: a wave that
  arrives in a knot and walks into a dying bomber is a wave that dies. A chain pays
  whoever lit it. One blast does not set off another bomber outright - it leaves it
  wounded, and in a hurry, which is a better problem than a screen-clearing lottery.
- Death effects now belong to dying rather than to being shot, so a tank that comes
  apart in a blast still hatches.
- You can meet it on the title screen's crowd, so its shape is learnable before it is
  lethal.

## 0.3.2 — 2026-10-07
Enemies arrive in waves now, and the run decides how many of them it can afford.
- Instead of one enemy dribbling in on a timer, a wave arrives: a group of them off
  one side of the screen, spread across a shallow arc, so you can see the shape of
  what is coming and turn to meet it. Between one wave and the next there is a beat.
- What keeps the crowd honest is a budget. The run may hold so many points of enemy,
  that budget grows with the clock, and a wave is bought with whatever room the crowd
  has left: a drifter is cheap, a tank is not. So the two ways to bring the next wave
  are the two the game wants - wait, and the arena gets fuller; kill, and the room you
  opened is filled. Running away does neither.
- A wave is always worth at least the dearest kind's price, which sounds like a detail
  and is not: a small room buys only cheap things, and then the tanks thin out of the
  late crowd exactly when they should be joining it.
- The difficulty curve was redrawn to match. The old spawn rate saturated its ceiling
  in about two and a half minutes; the budget takes six, so the crowd keeps growing
  for longer instead of pinning. At one minute the screen holds what it used to (18.7
  bodies against 18.4) and the headless bot, which never dodges anything, now lasts
  2m12 against 1m26 - the room to grow is the point of the change, not an accident.
- Tests are up to 243. The new file checks the budget grows and levels off, that a wave
  never spends more than it was given and never less than it is worth, that the members
  really do arrive across one fan and never on top of you, that the roll is weighted and
  unlocks on its own clock and costs one random number per enemy whatever kinds exist,
  and that the whole thing replays from the seed. 19 ways of breaking it were tried and
  every one fails a test.

## 0.3.1 — 2026-10-07
A new enemy: the spitter, and the first thing that can hurt you from a distance.
- Three minutes into a run an orange pentagon walks in and stops a good way out. When it
  wants to fire it stops dead, its mouth fills with light for half a second, and then a
  slow warm shot crosses the arena. Sidestep while the mouth is still filling and it
  goes where you were not; keep walking into it and you are taking what was aimed at
  you.
- The shot travels the line it had locked before the wind-up began, not the one the
  spitter points down afterwards. That is the whole business of a telegraph: what you
  were promised is exactly what arrives, so the half second is enough to decide.
- Enemy shots are their own pool, warm always - cyan is yours and this is not - and they
  are drawn over the crowd so nothing can hide one behind a body. One costs one hull.
  Blinking or dashing through a volley costs nothing: the shot passes through unspent,
  because both sides of that are the thing you meant to do.
- A spitter keeps its distance for real: it walks in from across the arena, gives ground
  the moment you get close, and shuffles sideways in between so it is never a sitting
  duck. It cannot back itself out of the world, so a ship in a corner gets pinned there.
- The spawn mix now carries a fourth row. The special kinds' shares were trimmed to make
  room, which is the honest cost of it: late in a run about a sixth of the crowd is
  still plain chaff, and the spitter takes its share from that sixth and not from you.
- Tests are up to 218: the band it holds and the wall that stops it, the cadence measured
  in seconds between spits, a shot that goes where it was pointed and nowhere else, what
  a hit costs and what an invulnerable ship is not charged, and one frame of the whole
  thing costing a halo and a core per shot - no stroke, no blur, no gradient. There is
  also a test that kills one of every kind, so no enemy can arrive again with a death row
  it is missing.

## 0.3.0 — 2026-10-07
A new enemy: the darter, and the first telegraph in the game.
- A minute into a run something new walks in: a dart, all nose. It creeps at you, stops
  dead, and draws a thin red line along the way it has decided to come. Then it comes
  down that line faster than you can run - and only down that line. Step off it while
  the line is still being drawn and it sails past you.
- The line is not decoration. It is painted out of the same numbers the enemy actually
  moves by, so what you were shown is exactly where it goes and exactly how far. Being
  shot does not make it change its mind; a lunge that reaches the wall ends there.
- It comes apart along its own axis - sparks out of the nose and the same again out of
  the tail - and it sounds a note as it loads, so you can hear it before you see it.
- The enemy that used to be called a darter was always a weaver, so it is called that
  now and the dart has its name back.
- Tests are up to 197: the four beats of the hunt measured in seconds, the lunge
  measured against the line it was drawn from, and one frame of the telegraph costing
  two strokes and two lights - no blur, no gradient.

## 0.2.6 — 2026-10-07
The sky behind the fight is a nebula now, and milestone 2 - feel - is finished.
- Deep blue clouds drift behind the stars. They are slow, they are cold, and they are
  dimmer than the faintest star, so they say "space" without ever competing with a
  bullet, a shard or your own ship. It slides as you cross the world, but less than
  any layer of stars does, which is exactly what puts it furthest away.
- It is one offscreen canvas baked once - the first frame pays for it and nothing
  after that does, not even resizing the window - and it costs about five image
  stamps a frame: no blur, no gradient, no stroke.
- The clouds are a seamless tile, so they wrap forever instead of running out at the
  edge, and they are scattered on a jittered grid with each cloud given a different
  brightness, so the sky has dark patches and bright cores instead of being fog.
- Tests are up to 168: the sky covers the whole window however far it has drifted and
  however big the window is, it is baked exactly once, it is never blurred, and the
  near pass always slides further than the far one.

## 0.2.5 — 2026-10-07
Deaths leave a mess now, and the ship leaves a wake.
- Every wreck throws chunks of itself as well as sparks: short bars that tumble over as they fly,
  coast further than a spark does, and fade out over a second. A tank leaves fourteen of them, a
  darter two, and a tank hatchling - a small tank - leaves fewer than its parent would.
- The engines drop a wake. While you are actually driving the ship it trails soft blue puffs that
  bloom and cool behind you, so a run's history is written on the screen for a moment. They are
  painted under the ship and kept faint on purpose: your own trail must never hide you or a bullet.
  A dash still has its own streak instead.
- When your ship goes, it comes apart like anything else that dies.
- Sparkle and wreckage now draw their random numbers from a stream of their own, so a burst with one
  more spark in it cannot nudge a shot that was already in flight. The same seed plays the same run
  however thickly the sparks are thrown.
- The particle item of milestone 2 is finished, and knockback was already done three times over
  (bullets, the shove after a hit, the dash shoulder), so both are ticked off.
- Test suite is up to 161: a bigger wreck leaves more chunks, a chunk tumbles and coasts where a
  spark stops dead, the wake appears only while the engines are lit, and a frame of particles costs
  one fill per chunk and one sprite per puff - no strokes, no blurs, no gradients.

## 0.2.4 — 2026-10-07
The arena is a world now: 3000 × 3000, and a camera to fly it.
- The fight moved off the window and into a world about six screens across. The view follows the ship
  one for one - it never slides around under you - and leans a little towards whatever you are aiming
  at, so you see a touch more of what you are pointing at.
- The edge of the world is a glowing energy wall: a bright line, a soft band, and a row of ticks
  reaching in. Only the edges you can actually see are drawn.
- Nothing arrives in plain sight any more. Enemies come in just off the edge of the screen and never
  within 260 px of the ship, so being cornered against the world's edge no longer means a chaser
  lands on you.
- Shots, sparks, shards and enemies you cannot see are not drawn at all.
- The simple bot now survives about 1m20s where it took 1m00s, because it can back away instead of
  being trapped by the edge of the window. The reference run was rebaselined on purpose.
- Test suite is up to 147: the camera follows, clamps, leans and turns the cursor back into a place in
  the world; every arrival is off-screen, in the world and off the ship; a wall costs four strokes per
  visible edge and nothing for an edge you cannot see.

## 0.2.3 — 2026-10-07
The game stops for the hits that matter: hit-stop is in.
- Killing a big enemy holds the whole world still for 40 ms; taking a hit yourself holds it for 90 ms.
  Sparks hang in the air, the crowd hangs mid-lunge, the screen keeps shaking - and then it all snaps
  back. It is the difference between a number going down and something happening.
- Dying gets the same 90 ms of stillness, with the game-over summary arriving over the top of it.
- A dash pressed during that pause is not lost: the press waits for the world to wake up and is
  answered on its very first step, so mashing while you are stunned gets you moving the moment you can.
- The screen shake and the little guard on restarting still run during a freeze, so a freeze cannot
  steal time from either - it only ever stops the run.
- Test suite is up to 129: the freeze is measured in steps, and what a frozen frame is allowed to move.

## 0.2.2 — 2026-10-07
Every light in the game is now a pre-rendered sprite, and nothing asks the canvas to blur a shape.
- Halos around the ship, the enemies, the shards and the hull pips, the shots' trails, the thruster
  flame, the dash blur and the labels' halos are all baked once into small offscreen images and
  stamped, instead of being blurred or gradient-filled on the spot every frame. They read the same,
  a little brighter where a blur used to eat itself.
- A frame now builds no gradients and no shadows at all: at the plan's target load of 1500 shots in
  the air that is 1500 gradient objects and 1500 blurred strokes per frame gone, replaced by 1500
  stamps of one cached image. This is the ceiling lifted before the crowd is allowed to grow.
- A hit now flashes white as a bloom of light as well as a white outline.
- Test suite is up to 119, including the sprite cache itself and a suite that measures what a frame
  is allowed to build while you watch it.

## 0.2.1 — 2026-10-07
The dash is in: Space or the right mouse button throws the ship 220 px in 0.12 s.
- It is a committed burst on its own rails - the engines cannot fight it halfway - and it goes where
  you are leaning, or wherever the cursor is if nothing is held. You come out of it moving at the
  ship's top speed in that direction, so a dash is a flick, not a teleport.
- Nothing can touch you while it lasts, and it shoulders the crowd aside as it passes through, so a
  dash that ends in the middle of a mob ends somewhere you can stand. The 2.5 s wait starts when the
  dash starts: one stopped dead by a wall still costs all of it.
- You can see all of it: a streak with two afterimages behind the hull, a burst and a ring at the
  start, and a ring around the ship that closes over the wait and breathes once it is ready again.
- One press is one dash. Mashing during the wait buys nothing, a key's auto-repeat is not a second
  press, and the press that launches a run is not also a dash.
- Test suite is up to 102, including the whole control path through the real keyboard and mouse.

## 0.2.0 — 2026-10-07
The ship answers like you expect now.
- New flight model, on the design numbers: top speed 320, full speed about 0.13 s after you lean, a
  standstill about 0.10 s after you let go. Turning around is a slide, not a pivot, and the ship stops
  dead instead of coasting to a crawl.
- The ship's hitbox is now 6 px instead of the 16 px you can see: brush the crowd's shoulder and live.
  Hit invulnerability is 1.5 s to match.
- Fixed: a run could depend on how long the browser tab had been open. A frame is now measured to the
  microsecond and no finer, so a shared seed plays the same run in a fresh tab and an old one.
- Test suite is up to 79, including a suite that measures the ship's acceleration, braking and hitbox.

## 0.1.0 — 2026-10-07
The foundations release: the game is now modules, and its clock belongs to the game, not the display.
- Fixed 120 Hz simulation with interpolated rendering: a run plays out identically on a 30 Hz netbook
  and a 240 Hz monitor, a stutter no longer teleports the ship, and a background tab neither
  fast-forwards nor stalls it.
- Seeded runs: every seed replays exactly, and `?seed=42` in the address bar fixes the arena for the
  visit. The game-over screen shows the seed.
- A spatial collision grid (shots only meet the enemies near them) and object pools for shots, shards
  and every particle - no allocation in the hot loops.
- Tooling: `node --test` suite (71 tests), and `tools/simulate.js` plays a whole run headless with a
  simple bot and reports the outcome.

## 0.0.1 — 2026-10-06
The starting point: the whole game as one `index.html`, no libraries, no build step.
- Neon arena survival: fly with WASD, aim with the mouse, hold click to fire, collect shards, level up.
- Three enemy types (chaser, darter, splitting tank) with time-based difficulty ramp.
- Particles, shockwave rings, screen shake, parallax starfield, synthesised sound effects, best-score saving.
- Fixes found taking stock: the game now reacts to window resizes (before, a resized window left a
  stale, blurry canvas and wrong mouse coordinates), and holding M no longer toggles mute on every
  key repeat.
