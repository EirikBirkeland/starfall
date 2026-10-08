# Starfall — changelog

## 0.4.12 — 2026-10-08
Leech: every body you bring down is worth a hull back, and the first card in the game that gives something.
- **A new card on the rack, and the first one that pays the ship instead of the gun.** **LEECH** is
  five ranks of "bodies you bring down patch the ship": **60 kills** for a hull at the first rank,
  and **six fewer with every rank after it** — 60 · 54 · 48 · 42 · 36. It is priced in bodies and
  not in seconds on purpose, so the wait is what your own gun makes it: three minutes of a slow
  first minute, eight seconds of a fifteen-minute crowd.
- **A hull is the one thing the game never gave back before.** Everything else on the rack makes
  the crowd hurt more; this is the second thing in the arena to hand out hull after an elite's
  gift, and it borrows that gift's light, word and chord, so a hull coming back looks the same
  whoever paid for it.
- **A charge that comes due while you are whole is not wasted.** The leech holds **one** hull and
  spends it on the next hit that takes one off you, on the very step it lands: the pip goes down,
  the mint light goes up, and the pip comes back. One and not three, because more than one is a
  hull you are carrying rather than one you have earned — and the meter under the hull pips shows
  what is counted and glows when one is held.
- **Counting and paying are separate jobs.** Every credited kill counts — a shot, a bolt, a drone,
  a nova front, a fire, a body that came apart cold — and a body that came apart in a blast nobody
  lit counts not at all. The hull is handed back at one point in the step, after everything that
  could hurt you has had its turn, which is also what makes a rank taken in the middle of a pile
  worth itself at once: the bodies already in hand buy the cheaper price.
- **Measured on the two bots that can see it.** The skilled one loses no hull in fifteen minutes
  (median zero, seven hull lost between twenty whole runs), so to it the card is a wash: 20 of 20
  still flying either way, score median 113,662 with it in the deck against 113,789 with it out.
  The plain one *is* getting clipped, and for it the card is dramatic: handed four ranks it went
  from dying on 4 seeds in 16 to dying on none, its score median rose, and it was handed back
  about as much hull as the arena had taken (17 back against 18 lost). A card for a run that is
  being pushed around, which is the right shape for a thing paid for in bodies.

## 0.4.11 — 2026-10-08
Chill: every hit the ship lands takes the speed out of them, and a cold body coming apart throws ice.
- **A new card on the rack, and the first one that takes something away.** **CHILL** is five ranks
  of "a hit slows them down". Each hit takes **8% per rank** of the body's *own walk* off it, and
  that frost is what it is: a chilled drifter walks a tenth of its pace, a frozen one walks
  nowhere. Bullets, arc bolts, orbital drones and nova fronts all make cold — the same four doors
  a fire is lit at.
- **A shove is not a walk.** A frozen body cannot move under its own engines but is still shoved
  by a bullet's kick, a darter's shoulder and a neighbour making room, so a knot of ice is a
  thing you push through instead of a wall you fly around. Frozen is not harmless either: it still
  hurts to touch, a frozen spitter still spits, and a sniper that has already taken a lock fires it
  on the second it promised. What the card buys is time to aim and room to fly.
- **It melts.** A body nobody is hitting warms back through in **3.2 s**, so freezing the crowd is
  something you keep up with fire rather than a tax the arena pays once.
- **Rank 5 is the shatter.** A body that comes apart cold throws a front of ice **96 px** wide:
  hull and frost to everything inside it, sized by *how cold that body was*, and passing on a
  share of its cold — so a chain runs down a crowd and dies out. The hit that kills is itself a
  frost, so killing things is what sets the ice off, the same way the killing hit is what lights a
  fire.
- **Rime and a shell.** A cold body wears a wash of rime as pale as its cold, and a body frozen
  solid stands in a shell of ice that breathes, so the frame says which bodies are worth the fifth
  rank before one comes apart and not after. A body going solid gets a ring, ten motes and one high
  note; a body that thaws lets go quietly.

## 0.4.10 — 2026-10-08
Burn: every hit the ship lands sets the crowd alight, and a body that dies alight passes it on.
- **A new card on the rack - the first behaviour upgrade of milestone 4.** **BURN** is five ranks
  of "a hit sets them alight". A burning body loses a *share of one shot of your own gun* every
  second, in chunks on a half-second beat, for **3 s** after the last hit that lit it. That share
  grows with the damage line exactly as a shot does, so the fire is worth more on a heavy gun and
  nothing at all on a weak one - which is the right way for it to be.
- **The tail is the card.** The fire keeps eating the body after you have turned to the next one,
  and a body under fire keeps having its clock restarted, so what you are buying is the damage you
  did not have to fire. Ranks 1 and 2 are about that bite getting heavier.
- **Rank 3 is the bonfire.** A body that comes apart while alight hands the fire to everything
  within **96 px**, for a share of what was still burning in it - and the shot that killed it is
  what lit it, so killing a crowd is what sets a crowd alight. Each jump is shorter than the last,
  so fire runs *down* through a crowd and dies out instead of setting the arena alight from one
  match; measured, a chain walks about six bodies and stops.
- **The third kind of number.** Every other line sells a multiplier (`+30%`) or a number of things
  (`+1 bounce`). Burn sells a *rate*, which is neither: at rank 0 there is no fire at all, not fire
  of strength zero, so the card prints `+40% burning damage` and the sim asks its own question of
  it. That is a new `unit` in the upgrade data, with its own accessor.
- **Fire is a thing in the world, not a number on the body.** `world.fires` holds one fire per
  body that is alight, and a fire holds on to the body it is eating - which is what lets a corpse
  outlive itself by the one step in which it spreads the fire. It costs no random numbers at all,
  so a run that is on fire is exactly as reproducible from its seed as one that is not.
- **What it looks like.** Two soft stamps over the body - a wide yellow and a smaller near-white
  one above the middle, both blended additively, so a flame over a red body reads as a body lit
  from inside rather than wearing a hat - breathing off two sines of the body's own phase, never
  a re-roll. Over the crowd, under the ship. The whole of it is two baked sprites for the game,
  whichever body is burning and however many there are.
- Measured twice, and the two agree: one rank of burn is worth **0.30 ranks of the damage line** on
  the power ladder (level with an orbital rank), and in a real fifteen-minute run at five ranks the
  fire was **27-29% of all the damage the run dealt**, over a mean of eight bodies alight at a
  time. Twenty bot runs with the card in the deck against twenty with it out: the bot takes it
  every single time, and came out level to slightly better - 19 of 20 still flying at the cap
  against 17 of 20, score median 115,814 against 112,578.
- 23 new tests. The logic file proves one fire per body, that the tail is paid after the last hit,
  that a chain decays and dies out, that a killing hit lights a corpse only from rank 3 and only
  for the share it passes, and that fire spends no numbers out of the run's own random stream. The
  art file proves the frame paints no fire for a ship that has taken the card and hit nothing, that
  a flame is exactly two stamps and no strokes, that it is stamped on the body and buried under the
  ship, and that a fire on a body that has come apart draws nothing at all.

## 0.4.9 — 2026-10-08
The game can be played by a coding agent: `node tools/agent-bridge.js`.
- **No gameplay change.** What is new is a door in: the game boots headless, steps at about one frame
  per 16.7 ms of real time, and offers itself as **twelve tools on stdin and stdout** - `observe`,
  `move`, `aim`, `trigger`, `dash`, `choose`, `choose_weapon`, `start`, `step`, `autopilot`, `status`,
  `run_result` - over JSON-RPC 2.0, one message per line. That is the shape the Model Context
  Protocol uses for a subprocess server, so an agent can be pointed at this game with one config
  line and no library: `claude mcp add starfall -- node tools/agent-bridge.js`.
- **The agent plays by the same controls you do.** No tool moves the ship; they hold keys, point the
  cursor and press buttons. `observe` reports only what is on screen - and reports a shot as *when it
  arrives* and *how far off its line you are standing*, which is what a dodge is made of. `step` lets
  half a minute of game go by while a slow player thinks, and stops early with the reason when the
  game needs an answer. `autopilot` hands the flying to the headless bot so a thoughtful agent can
  still play the decisions: the cards, the gun, when to start the next run.
- **`node tools/agent-bridge.js --demo`** plays a whole four-minute run through the wire and prints
  every line of the conversation, including the refusals. `tools/agent/README.md` is the manual.
- The bridge says what happens while nobody is asking (`started`, `level-up`, `died`, and `wave` for
  anyone who wants the chatter), refuses an order as an answer rather than a fault, and keeps the
  world's clock honest: a bridge that was busy thinking makes up a few frames and forgives the rest,
  the same rule the engine gives a backgrounded tab.
- 31 new tests, all of them against the real game: the same keys a person presses are seen moving the
  ship, a card taken through the wire is a rank in the build, a death is reported exactly once.

## 0.3.9 — 2026-10-08
The sniper: the last body from the plan, bolted to the floor, drawing a laser across the whole arena.
- **A new enemy at ten and a half minutes.** It never moves. An eye turns slowly onto your ship,
  stops, and holds a lock for **1.25 s** while the band of light it is about to fire is painted
  across the entire arena - and then the beam goes down exactly that line. This is the ninth and
  last body of PLAN 3.3, so the enemy roster is now complete.
- **The warning is the thing itself.** The band you are shown is the band that hurts, edge for edge:
  the eye *cannot change its mind* during a lock, the painted band is exactly twice the distance off
  the axis at which your centre is hurt, and the line is clipped to the arena rather than to the
  screen - so it is drawn wherever the world can be seen, even when the sniper itself is off the
  glass. Kill it during the telegraph and nothing fires.
- **The damage is instant and the light is its record.** A beam hurts everything standing on it on
  the step it is born and then hangs there for a fifth of a second, fading, like a bolt of the arc.
  A body that walks onto a beam after it fired is not hurt by it: a beam is a thing that happened,
  not an area that lasts.
- **It cannot be walked to, so it arrives where you can see it.** Every other enemy comes in off the
  edge of the window; a body you can neither kite nor run off is landed *inside* it, at least 250 px
  away, with a ring of light and a sound - and it starts its first wait after landing, so nothing
  fires the instant it appears.
- **Nothing can push it over.** A bullet's kick, a bomber's blast and a crowd making room are all
  refused, which is what keeps the line it drew a minute ago the line it fires down. And it does not
  stand in its own light: a beam spares the eye that fired it, so the kind threatens a run instead
  of eating itself.
- **What a beam kills, nobody killed** - no score, no kill, and the balance sheet now keeps a fourth
  cause of hull loss, `beam:sniper`, beside body, shot and blast.
- 32 new tests. The band is measured to the pixel (one px inside hurts, one px outside does not), the
  lock is proven unable to follow the ship, the art is measured to be drawn at exactly the width the
  damage is paid out at, and the headless bot is shown stepping off a band it cannot see the end of:
  forty seconds against two snipers, 0 hits for the ship that reads them and 9 for the one that
  stands still. Late-game survival is unchanged - 6 runs of 15 minutes, all still flying.

## 0.4.8 — 2026-10-08
Survival check: the firepower milestone is closed, and the number it was argued over is now a tool.
- **No gameplay change.** What changed is the measuring: `node tools/simulate.js --runs 24`
  reports the **median** run of the batch - the middle one, not the average - next to the mean,
  with how many runs were still flying when the window shut. `--need 300` turns PLAN's own
  bar (median survival of 5:00 or more) into an exit code instead of an eye test.
- **The bar is cleared, by the whole width of the window.** Twenty-four seeds a gun, the dodging
  bot picking its own upgrades, a fifteen-minute cap: **median 15m00s on all three primaries** -
  22/24 pulse, 23/24 scatter and 23/24 arc were still flying when it shut, and at a thirty-minute
  cap the pulse and the scatter runs were 8/8 still up. So that median is a floor and the tool
  says so on the same line rather than pretending the run ended.
- **What sits under the floor:** the plain bot, which does not dodge, mediates **2m43s** on the same
  seeds and every one of the twenty-four died. The enemies were not softened to reach those
  numbers - the hard rule of this milestone - the player's firepower grew to meet them.
- The middle and the mean are the two numbers every decision here has been argued from since the
  first weapon landed, and until now they have been recomputed by hand out of the run lines each
  time. They are in the tool now, per gun, with the worst seed of the batch beside them.

## 0.4.7 — 2026-10-08
Arc: the third primary - lightning that finds the nearest body itself and leaps four of them.
- **`3` on the title screen is the ARC.** Three primaries on the rack now, and the third is not
  a bullet: a bolt leaves the ship, lands on the **nearest body** wherever that is, and leaps on
  to three more, each landing worth 80% of the one before (PLAN's own numbers). Four pulls a
  second, four bodies a pull, and a bolt that is gone in a sixteenth of a second.
- **It aims itself, and that is the weapon.** The pulse is the gun you aim, the scatter is the
  gun you point, this is the gun you *fly*: it works behind you, in a press, at the edge of its
  reach, and it cannot be dodged by walking sideways. What it pays is that it is the **weakest
  of the three on a single body** - 3.9 hull a second against the pulse's 4.3, flat with range,
  because a bolt that lands always lands - and it stops at its fourth body, so a crowd thirty
  deep is not its to spend.
- On the three bodies a fleeing ship really has around it it is the **best of the three**: 7.0
  hull a second against the scatter's 5.9 and the pulse's 4.3. Forty bot runs a gun, same seeds:
  median 15m00s for all three, and the arc means 6461 kills and 114425 score against the
  scatter's 6555/116403 and the pulse's 5770/103079. Nothing is 25% better than anything else.
- **You always see what it hit.** The damage is instantaneous, so the light is the weapon: the
  zig's two ends are the muzzle and the body, to the pixel, and its scribble never wanders off
  the line the damage took. It re-sparks five times a second rather than every frame, so it
  reads as a live discharge and not a strobe.
- **Split shot means more chains here**, one more place to start from per rank at the line's
  usual share - the coverage card working on a gun that has no angles to add. Pierce, ricochet
  and shot speed do nothing at all on an arc, because there is no shot: PLAN's Storm synergy
  (Ricochet 3 + Arc) is where those two meet, and the tests say so out loud.
- The bolt pool, the draw order, and the trigger's own dispatch are all new plumbing: a pull that
  found nothing to strike costs no kick, no flash and no sound, so the reach is something you can
  hear as well as see.

## 0.4.6 — 2026-10-08
Scatter: the second primary, and the gun itself became data.
- **The title screen asks which gun you fly.** `1` is the PULSE, `2` is the SCATTER, then launch
  as before. The HUD reads `GUN SCATTER` while you fly it and the game-over card names it, so
  there is no guessing afterwards which gun did it. There is no hangar yet, so the choice lives
  here until milestone 5 makes it a ship choice.
- **SCATTER** is 2.2 pulls a second of **six pellets in a 30° cone**, a little slower than the
  pulse and at about **half its reach** - 370 px against 700 - and each pellet costs a body what
  a pulse shot costs it. One pull is one sound and one kick of the ship, and the kick is the
  gun's own, not whatever it happened to hit.
- It is a closer gun and a weaker one far off, which is the weapon PLAN asked for. Measured on
  one lone drifter: **1.46x the pulse at 60 px**, level with it at 150, **0.61x at 300** - and
  against a crowd standing in the cone, **two and a half to three times** a pulse. Forty bot
  runs on each gun, same seeds: the scatter means 6628 kills and 117896 score against the
  pulse's 6175 and 110015, and 39 of its runs outlasted the fifteen-minute window where the
  pulse managed 37. Nothing is 25% better than anything else, which is the band PLAN set.
- A whole fan landing on one body throws it for **about 250 px/s**, a nova front's worth of
  shrug, and that is what punches a hole in a press. It started at more than twice that, which
  was worse than useless: a close pull was flinging its target clear out of the range the next
  pull needed, and the crowd turned into a cloud flying away.
- **Weapons are data now** (`BALANCE.weapons`, read by one module, `src/game/weapons.js`):
  rate, pellets, cone, weight, speed, reach, spread, shove, recoil, muzzle and sound sit on one
  row, and there is no gun number left on the ship or in `BALANCE.bullets`. Every shot leaves
  with its own speed, reach and shove, so the streak behind a shot is the distance it really
  came, and a pellet that is about to die visibly runs out instead of winking.
- The reference run is byte for byte what it was before that move - seed 20261006, score 71395,
  level 49, 4054 kills - which is the proof that moving the pulse's numbers did not move the
  pulse.
- Found while measuring, and not a bug: **the split line is nearly worthless on a scatter**
  (1.0x-1.3x a plain gun, against the pulse's 1.8x-2.8x), because the cone already covers the
  arc a split extra would add to. SPLIT SHOT is a bad buy on this gun; what to do about that is
  a design question and it is written up in NOTES.
- `node tools/simulate.js --weapon scatter` and `node tools/power-ladder.js --weapon scatter`
  put either gun under the bot and under the firepower ladder.

## 0.4.5 — 2026-10-08
Nova: the eighth card, and the ship throws a wave of damage.
- **NOVA** is an eighth upgrade line. Every rank buys **one more ring inside an eight-second
  cycle**: rank 1 is one wave every 8 s, rank 5 is one every 1.6 s. A front leaves the ship
  where it stood, travels out to **220 px** in a quarter of a second, and every body it comes
  over loses a shot's worth of damage and is **thrown away from the ship**.
- The ring you watch is the ring that hurt you, to the pixel. A body is hurt when the front
  reaches it, so a nearer body flinches before a further one, and a body that walks in behind
  the front takes nothing: it is a wave and not an aura you drag round with you. It will not
  hurt you either - a nova is a thing that happened to the arena, and flying away from your
  own is a real move.
- Priced on the crowd a front really comes over - **two and a third bodies**, counted over
  twelve full runs - rather than on a dense test crowd, a rank of the nova is worth **a rank
  of the damage line**: 2.97x a plain gun against a crowd that keeps its distance, in the
  family with every other line. A front carries your gun's weight, not its rate, so the card
  is still worth taking at level forty.
- Measured over 40 runs, the card is **free**: 37 of 40 runs outlasted the fifteen-minute
  window with it in the deck and taken at face value, against 37 of 40 with it taken out, at
  the same score and the same kill rate. Telling the bot to hold off on it - what the orbital
  ring needs - cost a minute and a quarter of mean survival instead, so it buys the card
  level with the gun.
- The card's own colour is a spring green, the last cool hue with room in it, and its icon is
  two rings with eight ticks going out of them. In the arena the front wears your own cyan,
  because it is your reach going out.
- Also fixed: a line with no ranks left to give could still be dealt, because the promise that
  a deal always holds something you have not taken yet was not asking whether that line had
  anything to give. It could not happen in the shipped game; it made a measurement lie.
- `tools/power-ladder.js` is the firepower ladder as a file now - every maxed line against a
  plain gun, on three crowds - so the next line is priced against these numbers instead of a
  new throwaway.

## 0.4.4 — 2026-10-08
Orbitals: a ring of drones round the ship that chews whatever gets close.
- **ORBITALS** is a seventh upgrade line. Every rank puts **two more drones** in orbit round
  the ship - the pair of them at rank 1, ten of them at rank 5 - and each one bites whatever
  stands in the ring once every 1.5 seconds.
- A bite is worth **one shot of your own gun**, damage upgrades and all, so the ring keeps its
  weight as your weapon grows instead of being left behind by it. A maxed ring measures at
  **2.5x a plain pull** against a crowd that surrounds you - the same family as damage, split
  and ricochet - and at nothing at all against a crowd standing a hundred and fifty pixels in
  front of you, which is what a ring is.
- It is a wall at a distance you can see, and the track is drawn for you: **what walks past it
  is out of reach of it.** Ten drones will grind the crowd pressing in and not one of them
  will save you from a body already in your face.
- A bite shoves as it hits, so a press of bodies is held off where a thin stream of them gets
  pushed clear of the ring.
- The card has its own colour - indigo, the last cool hue left - and its own shape: three
  drones on a track round a little ship.
- Measured over 40 runs with the bot buying the line late rather than evenly: **37 of 40 runs
  outlasted the fifteen-minute window** against 36 of 40 with the card taken out of the game,
  and the kill average is up. An earlier, flat version of the bite cost the bot two and a half
  minutes of mean survival, which is why a bite carries the gun's weight.

## 0.4.3 — 2026-10-07
Ricochet: the sixth card, and your shots stop flying away from the crowd.
- **RICOCHET** is a sixth upgrade line. Every rank lets one more body be *bounced* on to:
  a shot that hits something and has nothing left ahead of it turns onto the nearest body
  it has not already been through - up to 220 px away - and goes again (PLAN 3.5).
- A turn is a change of direction and nothing else: same speed, same place, less weight.
  Every body turned on to takes **65%** of what the body before it took, so a rank buys
  *coverage* across the crowd instead of multiplying the gun - the same family of trade
  split and pierce make, each one paying for the geometry it needs: split wants a crowd
  wide, pierce wants a column deep, ricochet wants one body anywhere nearby.
- Pierce and ricochet divide the work rather than cancelling each other out. A shot goes
  straight on while a body stands ahead of it, and turns the moment none does. Measured
  over a maxed run, **13%** of its hits end in a turn; the obvious rule - pierce first,
  always - managed 2%, which is a card that never fires.
- Six cards now have six colours and six shapes: ricochet's is teal, and shows a shot
  kinking from one body to the next, thinner and dimmer for the trip.
- The card pool is thirty ranks deep now, five more choices on the way up.
- Measured over the same 24 runs as the last three releases: median survival is still the
  whole **fifteen-minute measuring window**, with **21 of the 24 still flying** when it
  shuts, median kills **6539** and median score **117015**. Firepower stopped being what
  sets this bot's survival at the last release and that is still true - this card buys
  what it looks like, not more time. Nothing about the crowd moved: its hull, speeds,
  budget and ramp are exactly as they were.

## 0.4.2 — 2026-10-07
Pierce: the second card that changes what the gun does, and your shots stop stopping.
- **PIERCE** is a fifth upgrade line. Every rank lets one more body lie in your shot's
  way: at rank 5 a single shot goes through **six** of them and keeps flying (PLAN 3.5).
- A body only ever takes one hit from a shot, and only the body you aimed at takes a
  whole shot's damage. Every one after it takes **80%** of what the one before it took -
  so a rank buys *depth* down a column of bodies rather than multiplying the gun, and a
  rank is worth nothing at all to a run that is fighting one thing at a time. That is the
  trade the card sells, and the mirror of split shot: split wants a crowd wide, pierce
  wants a column deep.
- Both lines now multiply each other: a fully split, fully piercing pull is six shots,
  any of which can go through six bodies.
- A shot that goes through something throws sparks out of the far side of it, so you can
  see the difference between a shot that stopped and one that did not.
- The card pool is twenty-five ranks deep now, which is five more choices on the way to
  the build you were always going to end up with.
- Measured over the same 24 runs as the last two releases: median survival is now the
  whole **fifteen-minute measuring window** (was **8m17s**), median kills **6517** (was
  2708), and **20 of the 24 are still flying** when the window shuts. Nothing about the
  crowd moved: its hull, speeds, budget and ramp are exactly as they were. The next work
  on the swarm's side of the ledger is what turns these runs into a fifteen-minute story.

## 0.4.1 — 2026-10-07
Split shot: the first card that changes what the gun *is*, not just how hard it hits.
- **SPLIT SHOT** is a fourth upgrade line. Every rank adds one more projectile to every
  pull of the trigger, laid out in a fan around where you aim (PLAN 3.5), so a maxed gun
  fires **six** shots per pull where it used to fire one.
- The shot you aimed stays the heaviest thing in the fan and every extra carries **35%**
  of it, so a rank never takes anything away. What you pay is sideways: shots that have
  spread too far to touch one enemy touch nothing, so the line wants you close and the
  crowd wide.
- The fan opens one 5° ring at a time, alternating sides around your aim, so the shot you
  pointed at always goes exactly where you pointed and the fan grows evenly outwards.
- Four lines into three places is the first time the *offering* rules can bite: a maxed
  line stops coming back, the deal leans towards what you have already committed to, and
  at least one of the three cards is always something you have never taken.
- One sound per pull rather than one per shot, or six shots a pull would be a buzz.
- Measured over the same 24 runs as the last release: median survival **8m17s** (was
  **5m53s**), median kills **2708** (was 754), and 8 of the 24 now outlast the whole
  fifteen-minute measuring window. All of it bought with firepower - the crowd, its
  numbers, its speeds, its budget and the ramp are exactly as they were.

## 0.4.0 — 2026-10-07
The run builds itself now: every level-up stops the game and deals you three cards.
- **Levels are choices, not numbers.** Collect enough shards and the run holds still,
  three cards slide up out of the bottom of the screen, and the world starts again the
  moment you answer - with the mouse, or with keys **1**, **2**, **3**.
- Three lines to build with, five ranks each: **DAMAGE** (+30% shot damage a rank),
  **FIRE RATE** (+22% shots a second) and **SHOT SPEED** (+22% shot velocity). Each card
  shows an icon drawn in code, its rank as pips with the next one waiting, and one plain
  line on what it is worth. A line that is maxed stops coming back, and the cards are
  weighted towards the lines you have already committed to.
- The XP curve is PLAN 3.6's, and its first term has been raised so that the first card
  lands about a quarter of a minute in and the fifteenth about where a good run ends -
  fifteen ranks is all three lines have to give, and a card you never get to spend is a
  card you never needed.
- Measured over 24 runs: the bot now kills **754** bodies a run where it used to manage
  **348**, for twice the score, and survives a median of **5m53s**. A finished run walks
  away with all fifteen ranks; the game-over card now says what it was built from.
- Nothing about the crowd moved: same hull, same speeds, same spawn budget, same ramp.

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
