# Starfall — changelog

## 0.6.3 — 2026-10-09
The second boss: The Hive. A mass of cells you can shoot pieces off.
- **The thing at ten minutes is not a bigger ring, it is a wall.** The Hive is a core with six hex
  cells set in wax round it, and it drifts at you and holds its distance, because everything it
  sends is faster than it is. It does not fire spokes. It *breeds*.
- **A cell that lights is a cell that opens.** A share of the cells that are still standing fill
  with light for about a second - the same countdown every other tell in the game is made of, on
  the body that is promising it - and then each of those cells lets out a pack of swarmlings out
  of the side facing away from the core. The mouth you watched is the mouth they came out of,
  edge for edge, and the mass stands dead still the whole time it is promising.
- **Shoot the honeycomb and the whole fight gets smaller.** Every cell is a body of the crowd: it
  is hurt by your gun and your fire and your blasts, it pays its own score and shards, and when it
  comes off it takes a share of the hive's hull with it. The bar *is* the mass. And every cell you
  break is one fewer mouth, so the swarms thin out as the bar does - the same beat, paid twice.
- **The swarm is a swarm.** What comes out of one cell is one pack: it bunches, commits and dives
  as one thing, at the pace the crowd's own swarmlings have reached by then. With nothing left to
  open the core opens instead, so the rhythm never grows a hole in it.
- **The boss framework grew a second shape to do this with.** A row now names its rhythm (`ring`
  or `mass`), a boss is allowed to walk instead of standing in one place, and a boss is allowed to
  own bodies - which is also why the crowd now knows that a body and the body it is part of are
  one thing, and stops jostling a mass's own centre out of place. When the hive goes down, the
  cells that were still standing come apart with it, unpaid, on one chord.
- **What the tools can now see.** The sim reports what killed a run and how many cells of a mass
  were still standing, `--at` starts a run with the earlier bosses already spent (so `--at 595`
  is the ten-minute fight), and a traced run marks the moment a boss walks in, changes phase and
  comes down. The Warden's fights are byte-for-byte unchanged by all of it.

## 0.6.2 — 2026-10-09
The Warden's third beat: it calls Darters out of its own hoop.
- **Phase 3 grows a summon, and it is the reason to move.** The ring rides, throws its ring of
  shots, fires its spokes - and now and then it stops, lights three marks on the rim of its own
  hoop, and three Darters come out of those marks and come at you. Everything else in the fight is
  a reason to stand still and stay in the door; these are the bodies that make you leave it.
- **The marks are the bodies, edge for edge.** Each mark sits on the exact bearing its Darter is
  born on and is drawn the size of the thing that will arrive at it, so you can read where they
  land and how big they are before any of them exists. They are lit for most of a second, and
  nothing about them moves once lit.
- **They come out of the far side, and only one pack at a time.** The fan of marks is centred on
  the bearing the ring is turned away from you on - a summon that arrived in your face would not be
  an attack, it would be a wall - and the ring will not call again while the last call is still
  hunting you. Clear them and the ring calls again; leave them and it goes back to spokes and
  rings. Nothing in a call is chance: the same seed calls its Darters to the same bearings.
- **When the ring goes down, its call goes with it.** Every body it called that is still standing
  comes apart where it stands, on one chord. They were the duel's and not the arena's, and the
  fight ends on the chord and not on a loose end.
- **The Warden is finished: three phases, three beats, one rhythm.** Phase 3 spins faster and
  prices the spokes and the ring harder, and now has its own thing to learn. Four simulated runs
  starting at five minutes all bring it down.

## 0.6.1 — 2026-10-09
The Warden has a second beat: a ring of shots with a door in it.
- **Phase 2 is a new attack and not only a faster one.** Between its spoke volleys the ring now
  stops, lights a wedge across the room for most of a second, and then throws a ring of shots
  with every bearing filled except that wedge. The two beats take turns - spokes, ring, spokes,
  ring - so the fight keeps one rhythm and grows a second thing to read inside it instead of
  becoming a different game halfway through.
- **The door opens where you are already standing.** The wedge is aimed at your bearing when the
  ring stops and then holds still; it does not follow you, because a promise that chases you is a
  wall. A ship that does nothing at all is inside it. What costs a hull is sliding out of it and
  not coming back, and the moment it is lit is the moment to correct.
- **It is drawn cool, and it is drawn exactly.** The wedge is the only cool light a boss makes -
  warm is what is coming, cool is the place to be - and it is drawn from the same three numbers
  the shots are thrown from, so the door you were shown is the door that arrives, edge for edge.
- **Phase 3 keeps both and prices them harder**: 26 shots instead of 22, a narrower door, a
  shorter read, on top of eight spokes. Every beat of every phase is still shown for at least six
  tenths of a second, which is now a rule the tests hold every boss to and not a sentence.
- **The room is the wall for the ring as well as for you.** A boss's shots stop at the cage, the
  same way its beams already did: the far side of the room is not free for nothing, and no part
  of the fight leaks out through a wall you cannot cross.
- Under the hood: 13 new tests (1082 green), a shot can now belong to the room it was fired in,
  the headless bot reads the lit wedge and slides onto it, and the reference run is byte-identical.

## 0.6.0 — 2026-10-09
Bosses: the framework, and something waiting for you at five minutes.
- **At 5:00 the arena warns you and then shuts a room round the duel.** A low siren, a name on the
  glass, two and a half seconds to let go of whatever you were doing - and then the walls close to
  a box round your ship, the crowd stops being dealt, and the Warden walks in. You cannot run the
  fight out of the room, and the room is where you were standing when it arrived.
- **The Warden is a ring that turns, stops dead, shows its spokes and fires down them.** Stops
  dead and not slows down, on purpose: the lines of light it draws are the lines that hurt, edge
  for edge, and a ring still turning between the promise and the firing would move them. Eight
  spokes in its last phase is a fifth of the room to stand in, and the far side of the ring is
  always safe, which is the only place that is.
- **Three phases, each one the same fight and a harder one.** At full hull, at two thirds, at a
  third: four spokes then six then eight, riding faster, waiting less, and showing its work for a
  shorter moment each time - never less than six tenths of a second, which is the floor every
  telegraph in the game is held to. Opening a phase is a beat and not a flicker: it flares, it
  cannot be hurt for a moment, and it drops the volley it was holding, which is a promise it never
  got to make and so one the run keeps.
- **The hull bar says what phase you are in, in the colour the ring is wearing**, notched where the
  next one opens, so the fight has a shape on the glass instead of only a length. It mends a hull
  when it goes down, it is worth more than anything else in the game, and the arena is quiet for
  three seconds afterwards so you can go and collect what it dropped.
- **A boss is an enemy and nothing else**, which is what makes it safe to add more: every gun,
  blast, bolt, fire, drone and nova in the game hurts it without any of them having been told it
  exists. Two of them had to be relearned to make that true - the collision broad phase now
  measures the fattest body actually standing in the arena instead of reading a constant off the
  kinds table, so a 60 px ring cannot be shot through, and a run that never meets one never pays
  for the wider search.
- Under the hood: 38 new tests (1069 green), and `tools/simulate.js --at 295` starts a headless
  run's clock five minutes in, which is the only way a bot that dies at a minute can be used to
  measure a five-minute fight at all.

## 0.5.2 — 2026-10-09
Ships: five hulls to fly, each one the gun it was built around.
- **The title screen now asks which ship you are**, with the same number keys it used to spend on
  the primaries, and the ship answers the whole question at once: its hull, its engines, how long
  its dash takes to come back, and the primary it was built around. `1 WISP - PULSE`,
  `2 BULWARK - SCATTER`, `3 VOLT - ARC`, `4 NEEDLE - LANCE`, `5 BROOD - SWARM`. The five ships
  carry the five primaries between them, once each, and in the primaries' own order - so the
  number you press still means the gun it always meant, and nothing that was on that screen
  before has been taken away. Five ships and five guns is five combinations to balance, not
  twenty-five, and it is why one key is enough.
- **They are priced against each other.** The Bulwark sells a fifth of its speed for a fourth
  pip of hull; the Needle sells a pip of hull back for a fifth more speed and the lance, which
  wants a clear lane in front of it; the Brood pays 6% of its engines for a pair of orbital
  drones it owns from the first second; the Volt gets the quickest dash in the game - back every
  1.5 s instead of 2.5 - and pays for it with the shortest reach of the five primaries, because
  the arc throws lightning 260 px and no further. The Wisp pays nothing and is the yardstick
  every one of them was measured against.
- **What does not differ is the thing that gets hurt.** Every ship is drawn at the same size and
  hurt by the same 6 px core, whatever its silhouette says: PLAN 3.1's rule that the ship you
  see is a good deal bigger than the ship that takes a hit is now a rule about all five ships
  rather than one, and no ship is a bigger target than another. What tells them apart is the
  drawing - a dart, a blunt hexagon, a fork-tailed arrow, a needle, a pod with two pods of its
  own - and a test now measures each one: that it wraps the core it hides, that it does not run
  further out than the radius it is drawn at, that it is the same on both sides of its own axis,
  and that the Needle is the longest thing for its width in the game while the Bulwark is the
  shortest.
- **The Wisp is exactly the ship that flew before**, and it shows: the reference run this project
  measures against plays back fingerprint for fingerprint the same as it did before any of this
  existed. The game-over card now says which ship the run was flown in as well as which gun it
  fired, and `node tools/simulate.js --ship bulwark` measures one from the command line.

## 0.5.1 — 2026-10-09
Swarm: the fifth primary — a flight of slow micro-missiles that find a body each, and go off in it.
- **`5` on the title screen is the SWARM**, and that is the fifth and last of PLAN 3.2's primaries. Three
  pulls a second, one missile a pull, a hull and a half a piece: shells that leave the nose slowly and
  then bend round on to whatever is nearest them. Every one of them finds a body of its own, so a flight
  of three that you fired straight up the screen arrives as three hits on three different bodies, and
  the crowd comes apart without anybody having to aim at it. This is the gun you fire while running away;
  it is the gun that works when the mouse is somewhere else.
- **It hunts, and it never gives up.** There is no lock to break: a missile bends toward the nearest body
  it can see, at a rate and no more - a quarter of a turn takes half a second - for as long as it is in
  the air, and then it dies of old age having asked nothing of you. It is slow on purpose: 300 px/s,
  slower than your own ship, so a body that sees one coming can still step out of its way, and the
  counterplay to a gun that cannot miss is to move rather than to dodge the aim.
- **It goes off where it lands, and the blast spares what it hit.** The body the missile found pays the
  missile; everything *else* standing in the circle pays a share of it and is thrown outwards, which is
  what makes a cluster open up instead of standing there for the next flight. The circle is drawn at the
  radius it is paid out at, edge for edge, and the ship that fired it is never inside it - a gun you are
  punished for using at close range is not a gun.
- **Two of the upgrade lines do nothing for it, and one does more than anywhere else.** A shot that
  detonates on the first body it meets has nothing left to *pierce* and nothing to *ricochet* off, so
  those two cards are worth exactly nothing on this primary - the same reading that leaves three lines
  off the lance and two off the arc, said out loud rather than left as a surprise. What *bullet speed*
  buys is the whole flight: measured, five ranks of it land the same hit in 0.61 s instead of
  1.28 s, which is the best a rank of that line does for anything in the game.
- **Priced on the same knots as every other gun** (`tools/power-ladder.js --weapon swarm`, and
  `tools/gun-clock.js` for what a slow shell costs a body that moves): 4.5 hull a second on the three
  bodies a press really keeps, where the plain gun does 4.3; 13.9 on a ring thirty deep and 12.2 on a
  column, where the plain gun does 4.3 on both because it can only be pointed at one thing at a time.
  The first pass at the row was a third weaker than that and it read as a worse gun rather than a slow
  one, so the missile is heavier and its blast lighter than the first numbers.
- **A missile is a shot with two new fields, not a new system.** The bullet grew `hunts` and `splash`, and
  everything that throws a shell - the ship's trigger, a turret's gun, the test harness - now writes both,
  because a recycled shot that came out of the drawer still steering would be a gun the player did not
  pick. There is no world state to reset with the run, nothing to clock and nothing to save: a missile is
  a bullet, and `game/missiles.js` is two functions the bullet loop calls.
- **It is drawn as a small dart and not as a dot**, in the ship's own colours - the pale sky of the mine
  family and a nearly white eye - because a dot that curves round after a body reads as a mistake on the
  glass while a dart whose nose is swinging round reads as a gun doing its job. It drags the same trail
  every shot drags, stretched to its own speed, so nothing was baked and nothing is blurred, and the glow
  cache did not grow.
- A run that does not pick the Swarm is untouched: the reference run on the usual seed is byte for byte
  the run it was, trace and all.

## 0.5.0 — 2026-10-09
Lance: the fourth primary — a line of light down the whole arena, after a moment of winding up.
- **`4` on the title screen is the LANCE.** Four primaries on the rack, and the fourth is not a bullet
  either. Nine tenths of a pull a second, five hull a line - five plain shots, enough to end a drifter,
  a darter and a weaver where they stand - and the line reaches the far wall whatever is standing in
  front of it. Everything on it pays at the same instant: hull, a shove down the line away from you,
  and this build's own fire and frost, which is what lets a lance, burn and chill in one run turn a
  column into a chain of thermal shocks.
- **The band you were shown is the band that hurt, edge for edge.** For a tenth of a second the gun
  hums and a band of light lies across the arena, and the band *follows the mouse* the whole time - you
  have all of the wind-up to walk it onto a column, and the line that fires is the line that was drawn,
  at exactly the width it was drawn. That is the opposite of the sniper's lock, which is frozen the
  instant it starts, and the two readings are opposite for good reasons: the answer to a promise about
  a place is to leave the place, and the answer to a promise about where *you* are pointing is to point
  better. It is also the reason a body walking sideways at a drifter's pace is still on the line when
  the light arrives, while a darter's lunge has to be led.
- **It is the heaviest thing you own.** The kick lands when the beam does and not when the trigger did -
  a lurch backwards, the biggest in the game, with a rising note for the wind-up and a report for the
  discharge. On the crowds the game actually grows, the line is worth a shade over the plain gun on one
  body you have lined up and between four and six times it on a ring or a column, because it is the one
  gun that never has to choose: `tools/power-ladder.js --weapon lance` prints it and
  `tools/gun-clock.js` prints what the wait costs a body that moves.
- **Three of the eighteen upgrade lines do nothing for it, on purpose.** A line that hits everything on
  it cannot be given *pierce*, and nothing travels so *ricochet* has nothing to turn and *bullet speed*
  nothing to speed - the same reading that leaves pierce off the arc. What *split* buys is another
  **line**, at another angle and its own share, so a rank fans the beam across a lane instead of paying
  the same lane twice.
- **A fourth primary also needed a fourth key.** The title screen builds its own list from the rack, but
  the keys that answer it were a table of three, so the lance could be looked at and not chosen; the
  number is read out of the key now, and a fifth primary will work the day it lands. The title screen
  also gives way on a short window - everything above and below the primaries tightens, because the
  primaries are the part nobody can do without.
- **The mix got its compressor and its voice budget.** PLAN section 5's "limit how many of the same
  sound play at once, or the mix turns to mush at 500 enemies". A frame's worth of sounds is now looked
  at all of them at once and spent the way a mix is spent - loudest first, and the quiet ones only as
  far as the ceiling stretches - where the ceiling is *loudness already sounding* rather than a count,
  so forty shard pings are affordable and a bomber going off is not asked to wait behind them. A level-up
  chime is never turned away, what got turned away is counted so a test can say so out loud, and a browser
  without a compressor still hears the game.

## 0.4.21 — 2026-10-09
The run's own build, down the left edge: a mark for every upgrade you have taken, and a pip for every rank of it.
- **The build rail.** One row per line the run has taken, down the left edge, in the order the deck
  lists them - DAMAGE above FIRE RATE above SPLIT SHOT - wearing the shape and colour the card sold it
  in, and telling how deep the run went with one pip per rank: filled for the ranks taken, a faint
  outline for the room left. Until now the only place a run could see its own build was the level-up
  table, which shows three of eighteen lines and then goes away.
- **The same picture on the card and on the rail.** The icon shapes and tints moved out of the card
  painter into `render/icons.js`, so the rack that offers a line and the rail that names it are the
  same drawing at two sizes instead of two drawings that hope to agree. One side effect nobody planned
  to like: the glow sprites are now baked once per tint and scaled, which freed nine slots of the
  sprite cache the last two releases had been rationing.
- **Three lines tell you when the next one is coming.** A nova front is in the air and gone, a row of
  mines falls out of the wake behind the ship, and the gap after the last crew goes out is nothing to
  look at - so those three wear an arc that closes round the wait, the same message the dash's
  cooldown ring gives round your hull. The other lines are either always on or already have a meter
  where your eye already goes, so they wear nothing.
- **It fits, and it is quiet.** Rows shrink with a short window and then wrap into a second column
  rather than cut a line off, and the rail never takes more than half the window. It writes no words,
  builds no gradient, asks for no blur, and costs one light per row whatever its rank - a maxed line
  is no dearer to draw than a line you just took.

## 0.4.20 — 2026-10-09
Thermal shock: a body that comes apart both alight and frozen takes the room around it with it. Also, cards can no longer run off the bottom of themselves.
- **The first synergy, and the eighteenth card on the rack.** Take **BURN** to its third rank and **CHILL** to
  its third rank and a new card is face up at the next level: **THERMAL SHOCK**. It is not dealt out of the deck
  like a line, it cannot be banished, and it has one rank - it is not a thing the run buys instead of something,
  it is what the two lines the run already chose become. A reward for six levels of deciding to be a fire-and-ice
  run that then came up or did not on the throw of a weighted die would have been a reward the run could lose
  without ever being offered it, so an earned synergy is put on the table before anything is drawn.
- **One corpse, one ending.** A body that came apart alight already passed its fire to its neighbours; one that
  came apart frozen already threw ice and hull. A body that wore both, with the synergy owned, pays **one**
  bigger ending instead: a detonation of hull, cold and fire, and its own fire spent inside the blast rather
  than jumping a step later. How hard it goes is how cold the corpse was, and everything the blast throws is a
  share of what the corpse had, so a chain runs down through a crowd and dies out instead of walking the arena
  off one drifter.
- **A frame that says *both of them*.** The card wears its parents instead of a colour of its own: the flame is
  the outside edge, a line of rime runs just inside it, `SYNERGY` sits where a line keeps its banish tab, and
  where a line's rank pips would be it names what it came out of - `BURN 3 + CHILL 3`. No new hue and no new
  sprite, which is as well: the glow cache had no room left for either.
- **Measured, and honest about what the measurement can say:** worth **+5.9%** of everything a run takes off
  bodies at its weight of 4 (+1.5% at 2, +20.1% at 8), and flat in score, because the measuring runs all survive
  their whole window. The run this card is really for is the one that does not, and that is a run the tool cannot
  price at all.
- **Cards cannot overflow themselves any more.** The bug report said it plainly: during powerup selection, long
  strings exceeded the bounds of the card - a description was wrapped to the card's width but never bounded, so
  a long one printed off the bottom of the card and across the rank pips, and the turret's was 218 characters in
  a card with room for about 100. Text is now fitted to the box it was given: smaller type first, an ellipsis
  only when even the smallest honest size will not do, and the description gets exactly the room between the
  effect line and the pips. The headless canvas now measures words by their size and font instead of answering
  "10" for every string in the game, which is what lets a test prove the rack fits - and it does fit, every card
  on it, at the full window, with nothing cut.
- **And the writing gave way, not the frame,** because a card that has been cut to fit is a card nobody can
  read. The six longest descriptions are about 110 characters each now; the "one more per rank" clauses went
  first, since the effect line and the pips already say that. One effect line, `+1 SHOT OFF EVERYTHING IN REACH`,
  could not be printed whole at any size: it is `+1 SHOT OFF THE FIELD`.

## 0.4.19 — 2026-10-09
Twice per run the deal can be argued with: ask for the whole table again, or cut one of these lines out of the run for good.
- **Two chips under the cards, and they are the run's, not the deck's.** Every run is granted **one reroll**
  and **one banish**. `R` deals the table again from everything that is *not* already face up - a reroll that
  handed a card back would have bought nothing. `Shift` plus a card's number takes that line out of the run's
  deck for good, at any level, however much the run grows, and fills its slot so the choice is no smaller than
  the one it replaced. The number key on its own still just takes the card, which is the only answer that ever
  spends a level.
- **An ask that could buy nothing is refused and kept.** Out of asks, or every line with a rank left already
  face up, or nothing that could stand in the emptied slot: the ask is not spent, the table is not touched, and
  on the keyboard the key simply asks for nothing. The new table is dealt *before* anything is paid for it, so
  a refusal is never something the player has to recover from.
- **Which is why the chips stay on the screen when they are empty.** A spent ask is drawn at `×0` rather than
  hidden, because a control that vanished would leave a player wondering where it went; and a card with no
  banish left to spend has no tab on it at all, so the corner where the tab was is simply the card again and a
  click there takes what it always took.
- **The table is the same table it was, and the seed is the seed it was.** Reroll and banish spend the run's
  asks and not the run's random stream, so a run that never uses them deals exactly the cards it always used
  to - the whole reference trace on the measuring seed came back unchanged, which is the only proof worth
  having that this is two new choices and not a reshuffle of every old one.
- **What the run refused is part of what it became**, so the game-over build line names it: `NO DAMAGE` at the
  end of a run that cut damage out and lived without it. The headless tools and the agent bridge see the same
  thing a player does - `reroll` and `banish` are two more tools, and `status` says how many of each are left
  and what has been cut.

## 0.4.18 — 2026-10-08
Turret: a gun is set down across the road ahead of you and holds that ground for ten seconds, aiming and firing at whatever it can see.
- **The last of the five secondary systems PLAN 3.2 asked for, and the seventeenth card on the rack.**
  **TURRET** plants a crew of guns every twelve seconds; each one stands for ten. It is the only damage
  in the game that *aims*: the orbital wall, the nova's front, the magnetar's field, a mine's ring and a
  tether's threads all pay out wherever the ship happens to be, and a turret looks at the crowd, picks a
  body and shoots at it — which is the one thing a ship running for its life does not have the hands for.
- **Mines arm the road behind you; this arms the road in front.** A crew is laid out *across* the way you
  were travelling, a fence with the road in the middle of it, and it is born pointing down that road — so
  the first thing every gun does is swing round to shoot the chase off your tail. That swing is the
  wind-up, and it is why a gun planted in the open is not a gun that cannot be flanked: a shell only ever
  leaves down the nose.
- **A rank is a wider fence, never a heavier shell.** Rank one is a single picket; rank five is five guns
  thrown across the lane, all on the same twelve-second beat. A shell is one shot of your own gun times
  the line's weight, and it is a real bullet: it can miss, it frosts and lights what it lands on, and the
  kill and the score are yours. It carries no pierce and no ricochet, because those are bought for your
  trigger and this gun is not your trigger.
- **The light is the promise.** Each gun draws its reach on the floor, out of the muzzle to exactly the
  distance it will aim at and its shell can reach, bright when it has something in its sight and faint
  when it has nothing, and its muzzle brightens as its next shot comes due. A gun is a place and not a
  body: nothing can shoot it, shove it or block on it, and the ten seconds are yours because you bought
  them, not because the arena allowed them.
- **Measured, not guessed.** `tools/power-ladder.js` prices this line the wrong way up (it stands a
  five-rank crew in a knot of bodies that never leave and reads 5.5x), so every number came off
  `tools/line-ab.js --line turret`: five free ranks are worth +9% of a run's score and +17% of its
  damage, and the sweep says the fence's worth is the ground it holds rather than what a shell costs —
  the score column does not move at all between a weight of 1.6 and 6.5. What the same batch says about
  the guns themselves: 3,084 shells, 2,055 bodies come round (so a gun that misses a third of the time,
  which is a gun), and 364,209 of 429,095 gun-steps with somebody in its sight.
- 33 new tests: 24 on the line (the fence's geometry, the swing, the reach as a hard edge for the eye and
  the shell alike, the shell being your own gun's, and the counters) and 9 on how it is drawn and dealt.

## 0.4.17 — 2026-10-08
Tether: a dash ties a line of light from where it started to wherever you get to, and everything standing on it burns.
- **The sixteenth card on the rack, and the only damage in the game that is a line.** Everything else
  that hurts an area is a circle round the ship — the orbital wall at 64 px, the nova's front, the
  magnetar's near field, a mine's ring on the floor. **TETHER** is five ranks of "a dash ties threads
  of light along the road it came down". The far end stays at the place the dash left; the near end is
  your ship, wherever it gets to. The thread stretches, swings and follows you.
- **It pays for turning.** Fly straight and you drag one thread down your own wake. Turn, and the fan of
  threads you left behind sweeps a lane of arena you already paid for by being there — which is the whole
  skill of the card, and the reason it is the only line in the deck whose reach is a road rather than a
  radius. Two seconds is all a thread lives, and a thread is at most as long as two seconds of running,
  so this is ground you own for a moment by moving, not ground you own by standing still.
- **A rank is another thread, never the same crowd hit twice.** Rank one is one cord down your wake;
  rank five is a fan of five, knotted along the dash and all of them tied to the hull. The whole fan
  beats as one weapon, so a body with three threads across it pays once — a rank buys a wider lane on
  your next turn and not a heavier pile on whatever is already under you.
- **Light, not a net.** A thread throws bodies off itself and never slows them: a body burned on a
  tether is still walking at you, it is just no longer on the line. Nothing can cut a thread, nothing
  can shoot it, and it can never hurt the ship that tied it — a thread is a place, not a body, and there
  is nothing to clean up when it lets go. The band you are shown is the band that burns you, edge for
  edge, 34 px either side of the axis and not a pixel more.
- **Priced on the run, twice over.** The balance tool that checks every other line reads 1.00x here, so
  this one was measured by running games instead: a run that never presses dash is *identical*, score
  for score, with five free ranks in it or none — the card is the dash or it is nothing. On a bot that
  does press it, five free ranks are worth +3% to +5% of a run's whole damage, and the first pass at
  pricing it came out four times too small once the run was the instrument rather than the spreadsheet.

## 0.4.16 — 2026-10-08
Mines: the ship drops mines out of the way it was going, and a body that walks into the ring on the floor pays for the road.
- **The fifteenth card on the rack, and the first one that happens where the ship *was*.** Every other
  line in the deck is attached to the hull — the orbital wall at 64 px, the nova going out from the
  ship, the magnetar field crackling at its near field. **MINES** is five ranks of a mine every three
  seconds, falling out of your wake along the way you were last going, and it is still there when you
  are not. A rank is one more mine per drop, so a rank-five run keeps a whole stretch of road standing
  behind it instead of one point the chase can walk past.
- **The dashed ring on the floor is the mine's reach, exactly.** A body whose skin touches it lights
  the fuse; the ship drives straight over its own mines all game long and is never hurt by one. The
  ring grows out to its reach while the mine winds up, so the circle you are shown is never bigger
  than the mine has yet — and then the blast is strictly wider than the ring you were shown, which is
  the direction a promise like that has to be generous in.
- **A mine is a trap and not a rear-facing gun.** It takes a moment to open its eyes, so a chase
  sitting on your tail does not get caught by a mine the instant it lands; the eye is the clock — dim
  while it winds, a slow breath while it waits, a hard strobe once something is in the ring, and gutting
  out over the last second of a mine nobody walked into. That is the arena saying which mines are still
  promised, in light and not in a meter.
- **It pays for running rather than for standing still.** The mines fall out along the way the ship was
  *going*, not the way it is pointed, and what a mine wants is a crowd that has somewhere to walk. It is
  strongest in the first minutes of a run, when the chase is long and the gun is weak, and a mine that
  is never walked into simply goes out: that is the price of the line, and the reason a minefield can be
  this generous.

## 0.4.15 — 2026-10-08
Magnetar: the shards you pick up charge the field round the ship, and when it is full it lets go.
- **The fourteenth card on the rack, and the only one paid for by picking something up.**
  **MAGNETAR** is five ranks of "collected shards deal area damage around the ship": every shard that
  comes in charges the field round you, and when it has swallowed four of them it cracks, taking one
  shot of your own gun off every body standing in the field for every rank you have taken. A large
  shard is worth six, so one gold drop fills the field and then some — the loot you flew across the
  arena for pays for the crack that clears the way back.
- **The field is a bank and not a timer.** Nothing in it counts seconds. Its rhythm is your own
  collection rate — about one crack a second in a run that is killing — and a shard picked up in a
  quiet minute is charged up for the next crowded one, with the bank keeping its remainder so a gold
  shard is worth six and not "one, rounded down". Walking into a magnet pile pays out one crack per
  step, which comes out as a rattle, which is what walking into a pile should look like.
- **It is a nova turned inside out, in the light as well as the money.** A nova is the ship letting go
  and its ring runs out; this is the field collapsing back into the ship, so the rim you see is born at
  exactly the distance the crack hurt and falls in to nothing — never claiming a wider circle than the
  crowd it came round, never a smaller one. The mint ring round the hull is the wallet and not the
  field: it says what the next crack costs, and the light is what says how far the field reaches.
- **A crack is not a hit, on purpose.** It takes hull and hands out nothing else: no frost and no fire
  ride along with it. Burn and chill are wired to what the gun lands on a body, which is a few pulls a
  second; the field cracks about once a second whatever the rank, so a crack that frosted and lit would
  keep the whole near field frozen and alight for free and would be doing those two cards' work for
  them. This is the one place in the deck where the ship's own damage stops short.
- **From the third rank the field pays its own way**: a body the crack kills leaves a shard where it
  came apart, so the crack that clears the pocket buys the next one — and the mint flying out of a
  corpse is the only tell a crack-kill has at all.
- Priced on the run rather than on the ladder, which cannot see a line whose trigger is picking
  something up at all: five ranks came to a tenth of a fifteen-minute run's whole damage and +4.9% on
  its score, every seed up on it — burn's family, and a shade under a rank of the gun.

## 0.4.14 — 2026-10-08
Afterimage: the dash leaves images of the ship standing where it was, and the bodies next to them chase those for two seconds.
- **A new card on the rack, and the first one that buys where the crowd is walking.** **AFTERIMAGE**
  is five ranks of "the dash leaves a decoy": one image at the first rank, and one more for every
  rank after it, laid out along the streak the dash just covered — the bodies next to them chase
  those for two seconds instead of chasing you.
- **A decoy is a place, not a body.** It is not in the crowd, it has no hull, nothing can shoot it
  and it cannot hurt you: a bullet flies through it and it expires on its own clock. That is what
  keeps a ghost from being a second gun that fires itself, and it means the two seconds you bought
  are the two seconds you get — nothing can shoot the decoy early.
- **Who chases what is worked out again every step and held nowhere**, so a body that walks into a
  ghost's reach starts chasing it and goes back to the ship the moment it goes out — and the ghost's
  reach is the near field on purpose, about the width of the scrum you just left. One ghost fools
  the bodies at a point; five fool the bodies along a line, which is what a rank is for.
- **A fooled body is not a stunned one, and a promise is never broken.** It walks at full pace, it
  still shoves its neighbours and it still hurts you if it arrives. A darter mid-lunge and a sniper
  mid-lock finish what they started whatever walks past them, and a spitter that has been taken in
  spits at the ghost — which is the shot that misses you.
- **You can see it happening twice over.** The images are the ship's own silhouette in the ship's own
  colours, painted a long way under the ship so there is never any question which one is real, each
  with a faint circle round it that is exactly the reach the simulation measures. And the crowd tells
  you the rest: which way a body points is which way it is walking, so the moment the ghosts go up the
  noses of everything nearby turn aside to face them.
- **`tools/simulate.js --dash` is new, and this card is why.** Neither bot used to touch the dash, so
  a line that lives on it could only ever be a cost to them — a card taken out of the deal. Now either
  bot can be given the habit (a press when something gets within arm's reach) and the share of the
  nearby crowd that goes chasing a ghost is 6% at one rank and 30% at five. What the card does to a
  run's score is nothing either way, and that is the honest finding: both bots are runners whose near
  field is three bodies wide, and this card is for the knot a player dashes *out of*.

## 0.4.13 — 2026-10-08
Overcharge: stand still for a second and the gun loads, and the next pull of the trigger is worth double.
- **A new card on the rack, and the first one whose price is paid in place.** **OVERCHARGE** is
  five ranks of "stand still for a second and the next pull is worth more": **double** at the first
  rank and another whole copy of the pull for every rank after it — x2 · x3 · x4 · x5 · x6. It costs
  nothing to have and everything to use: the wait is the card, and the crowd is what makes the wait
  expensive.
- **What spends a charge is a pull of the trigger, and all of it.** A scatter's six pellets and an
  arc's whole chain are one shot to the person at the controls, so the boost goes on everything that
  pull throws and the pull spends the charge whether it threw one thing or eleven. A pull that threw
  nothing — an arc pointed at an empty sky — has not fired, and keeps what it was carrying.
- **A charge interrupted is cooled, not wiped.** Moving takes it off at twice the rate it came on, so
  a full charge is gone in half a second of running but a dodge between two threats costs a quarter
  of it. Wiping it on the first keypress would punish the dodge instead of the standing, and the card
  is asking the ship to *settle*, which is something you can do between two dangers.
- **Standing still is two questions: is the ship asking to move, and is it moving?** Leaning into a
  wall is not standing still, because the engines are working. Being kicked backwards by your own gun
  is, because that is what you believe you are doing while you hold the trigger and have let go of
  the direction keys.
- **A ring round the hull says it, and no numbers are needed.** An arc closes over the second and the
  circle then breathes, whole and bright; a loaded shot is the same shot with more of it — a bigger,
  whiter dot, a thicker bolt — and the pull that spent the charge shouts once at the muzzle. None of
  it is drawn at all for a run that has not taken the card.
- **Measured twice, and the gap between the two numbers is the card.** A ship that never moves: 1.96x
  the plain gun at five ranks, which sits between burn's 1.46x and the damage line's own 2.5x, and
  the difference is the standing. A real run: a bot that never meant to use it spends 6.3 loaded pulls
  a minute and has the gun loaded in 2.7% of its frames. In the deck over ten 15-minute runs it came
  out level (score median 113,299 with the line dealt against 113,634 without it, 113,951 with five
  ranks handed for free) — the first card of these three that a dodging bot does not pay for.

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
