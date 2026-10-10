# Starfall — changelog

## 0.7.3 — 2026-10-10
The music plays the run it is under: drums join at two minutes, a boss speeds the whole grid up, and one hull left strips it to a heartbeat.
- **Five patterns, and the run chooses.** The sequencer's layers became whole *patterns* — which lines play, how fast the grid runs, how the chord is voiced — and one is picked each frame out of what the world says about itself: the clock, whether a boss is standing in the arena, and how much hull the ship has got left. The title keeps its pad, a run drives on bass and arpeggio, and a run paused over its cards holds its music while you read.
- **Drums after 2:00.** A kick on the floor, a crack on the backbeat, a closed hat on the offbeats — all synthesis, the kick being a chip kick (one triangle falling through most of two octaves) and the snare a burst of the same noise buffer the explosions use, which is what stops a kit sounding like three beeps. Measured over a run: nothing beats before the threshold, and what arrives at two minutes is the kit and nothing else — the groove underneath voices exactly the notes it did before, 8.9 notes a second becoming 12.5.
- **A boss is faster and harsher, and it is the grid that speeds up.** Every part of the music, chord changes included, runs a third faster — a bar in 1.64 s instead of 2.18 — because a "faster pattern" that only hurries one layer is a stutter. The arpeggio fills its gaps in (11 notes a bar instead of 6), the bass goes to eighths, the pad's detune doubles and its chord gains the scale's second rubbing on the root: the sharpest rub A minor can ask for without leaving it. A fight measures 27.4 notes a second against 12.5, and the sequencer's own clock runs at 9.8 steps a second against 7.3.
- **One hull left strips it to nerves.** No groove, no kit, no arpeggio: a long low drone, one high note to a bar, and a heartbeat at about resting rate. It outranks a boss being in the arena on purpose — taking the groove away lands harder than adding to it — and the stripped pattern is thinner than the run it replaced, 5.1 notes a second. Heal and the fight comes straight back.
- **How loud the music may be is now measured.** It sits outside the voice budget on purpose, so `patternPeak` lays a pattern's bar out on its own grid, envelopes and all, and answers its loudest instant: title 0.18, run 0.36, driving 0.45, boss 0.50, last hull 0.33 — against a ceiling of 0.5 that a test refuses any pattern to pass, on a bus that halves it again before it meets the fight. The ledger now counts drum voices and the seconds spent in each pattern, so `tools/simulate.js --audio` prints a run's intensity curve: `run 2m02s, driving 3m05s, boss 4m54s`. 1322 tests, and the reference seed still traces byte for byte the same run — the music reads the simulation and never touches it.

## 0.7.2 — 2026-10-10
The interface answers you, a hit sounds like what you hit, and loot climbs as it comes in.
- **The interface makes a sound now.** Six ticks in `BALANCE.ui`: a ship picked, a run launched, a card taken, the table
  dealt again, a line cut out of the run for good, and a run's card landing — plus a short one for the mute switch coming
  back, because going quiet is already its own answer. These are the only sounds in the game the simulation did not ask
  for: a screen goes up on a frame and not on a step, so the presentation layers go straight to the synthesiser and the
  cue queue stays the only door the run has. Every tick answers a press that was *taken*, so a key the game refused stays
  silent and the sound never lies about what a key did — a reroll you have no asks left for is silent, a reroll you can
  afford goes down like the cards going away.
- **A hit is the body's own note.** Twice the radius, an octave down: a swarmling takes a shot at 617 Hz, a drifter at
  288, a tank at 166, a boss's framework at the floor of the band, and a body standing outside the crowd's sizes still
  makes a tick and not a whistle or a thud. Before this the whole crowd shared one 300–360 Hz click, so a sky full of
  bodies hitting was one held tone no matter what was hitting.
- **A shard pickup rises with the streak.** Half of a live run's loot lands inside 0.08 s of the last piece, so each
  shard inside a 0.15 s window lifts the note one semitone, up to one octave, and the note comes home when the loot
  stops: one kill's handful is a little run up the scale and a stroll between kills is the plain note again. The streak
  is timed and not counted — a counter would sit at the top of its range by the second minute and stop saying anything —
  and the ping's old 270 Hz of jitter, which was bigger than the entire climb, is 12 Hz now so what you hear is the
  climb. Measured over six bot runs: three pickups in ten land on the plain note and an eighth reach the top.
- **None of it can move a run.** Each of the three keeps exactly the one random draw it used to, and the reference seed
  traces byte for byte the same trace as before the session. 1314 tests, 22 of them new: `test/pitch.test.mjs` owns the
  two pitch stories at the cue queue — nine bodies, nine notes, an octave of ceiling, a row that goes cold — and
  `test/ui-sound.test.mjs` walks the whole interface once and reads back the note every press answered with, which the
  fake audio device can now see because it logs a voice's pitch.

## 0.7.1 — 2026-10-10
The game has a body. Every explosion is noise as well as a note now, and being hurt puts a blanket over the music.
- **A noise buffer, which the game never had.** The plan asked for "oscillators, noise buffers, and envelopes" and until
  now there were only oscillators — every explosion a sawtooth sliding down, which is a passable thing falling over and
  no imitation at all of air. There is one shared two-second buffer of grain now, and a voice that plays a slice of it
  through a low-pass swept while it fades: closing, a crack settles into a rumble; the other way up, it is air going past.
- **Small, medium and large.** Every body that comes apart gets a crump under its note, priced off the same number as the
  note itself, so a kind that arrives in twenties is quiet twice over and a crowd stays a sound instead of a wall. A
  bomber's blast gets the medium one; a boss's framework coming down and your own ship coming apart get the long ones —
  thirteen tenths of a second closing to the bottom of the band. The **dash whooshes** now, the only sweep that opens.
- **Being hurt pulls the music behind a wall.** The low-pass on the music's bus is slammed down to 320 Hz and let back up
  over three quarters of a second: the arpeggio and the top of the pad disappear and the bass is left holding the drive,
  which is a flinch rather than a mud. It is one filter on the bus and not a note, so it reaches the half-second of music
  that was already scheduled on its way — the plan's "low-pass sweep over the music", at last.
- **Measured, not hoped for.** A hiss is priced on the voice budget like any other voice and is always quieter than the tone
  it lies under, so in a crowded frame the note survives and the crump is what gets turned away: four three-minute runs ask
  for a sixth more voices than they used to, lose three fifths of the difference, and gain 5% more sound on a peak that did
  not move at all. The grain is drawn from outside the seeded stream — the same seed traced with the sound on is byte for
  byte the same trace with it off, and a test owns that now — and `tools/simulate.js --audio` prints what the mix made of a
  run. 1292 tests.

## 0.7.0 — 2026-10-10
The game has music. Milestone 7 opens, and the arena is no longer silent between the sound effects.
- **A generated score, not a song.** A step sequencer runs on a sixteenth-note grid at 110 BPM in A natural minor —
  Am F C G, one chord to a bar, four bars to a loop — with three synthesised layers over it: a slow detuned pad, a
  sawtooth bass that walks to the fifth and the octave, and a square-wave arpeggio two octaves up. The title screen
  breathes with the pad alone; a run gets the bass and the arpeggio on top; a run paused for its cards keeps its music;
  the win's hush and the death's card go silent and stay silent, because those moments belong to what the run just did.
- **It keeps time like a real sequencer.** Notes are queued half a second ahead on the audio clock, so a late frame
  never stutters the tune, and a clock that jumps — a backgrounded tab, a card left up for a minute — starts again
  from the top of the progression instead of dumping the missed past on the present at once.
- **Two buses under the compressor.** Sound effects and music now each have a bus of their own, so the score sits at a
  fixed level under the fight and can be balanced against it — or muted and slid, when settings come — without
  repricing a single sound effect. M is still one key for everything, and the master compressor still catches every
  transient that lands on a full mix.
- Nothing else moved: the simulation never learns music exists, the reference run's trace is byte for byte what it
  was, and a full ten-minute headless game plays out clean with the sequencer wound on every frame. 1282 tests.

## 0.6.12 — 2026-10-10
Endless keeps climbing. A run that went past its own win is no longer fought by the crowd it had already beaten.
- **A second clock.** Every ceiling the schedule spends in its first three minutes — a body's hull, its speed, the size
  of the crowd, how many bodies may stand at once — is behind the run now. From the moment the arena is handed back a
  slower clock starts counting, and it never stops: hull and the crowd's budget grow for as long as the run does, which
  is what ends it, while speed stops where the fastest body in the game has outrun what a ship can be asked to dodge and
  the count of bodies stops where the frame budget says to stop. `ENDLESS +7m` reads beside the clock, and the card that
  finally says where it ended says `ENDLESS FOR 7m12s`.
- **It ends, measured.** `node tools/endless-gauge.js` prints the curve out of the game's own functions and then plays a
  build into it and waits. Twenty runs of a build with every upgrade line maxed all went down, between 14 and 33 minutes
  past the win and a median of 22m, nearly every one with the crowd standing at the wall — the bodies outlasting the gun,
  which is the whole point of the hull row. A build kept two ranks deep, nearer what a real run has earned by the last
  fight, goes under in 6 to 16. A run the watch stopped early is no longer counted as one that ended, so the check cannot
  report a tidy median for a curve that buries nothing.
- **Nothing moved for a run that has not won.** Every growth is exactly zero until a run is handed its arena back, and the
  reference run's trace is byte for byte what it was: 1276 tests, and the same 10m fingerprint as session 66.

## 0.6.11 — 2026-10-09
A won run can keep flying, the room only shakes for the things that are worth it, and the last screen cannot be clicked away.
- **Endless.** The win's card is a door *into* the run and not only out of it. Press the launch key over ARENA CLEARED and
  the arena is handed back to the run that won it — the score it won, the hull it had left, the level it climbed to, the
  build it was built out of, every fight it buried still buried — and it goes on flying with the schedule spent, so what
  comes out of the dark from there is the wave director and never the same boss twice. `ENDLESS` sits next to the clock.
  R asks for a new run instead, and a number takes another ship and begins one, in one press. Nothing about the win is
  reset, because nothing was taken away: `winRun` stopped this exact world and this starts that one again.
- **The window stopped shaking all the time.** A ten-minute run used to spend 30% of its frames with the room moving and
  19% of them visibly rolling, and the crowd was shaking the window harder than a boss was — 1.73 px of trauma among the
  crowd against 0.9 px through a whole fight. Now the routine half of a run sits still for 99% of its frames: kills, the
  player's own guns, dashes and upgrade procs say what they used to say with hit-stop, rings, sparks and a voice, and the
  window is kept for what it was always for. Being hit still lands (a third of what it was, and less than a boss
  arriving), a boss fight still rolls 8% of its frames, and the loudest thing in the game is still a run coming apart.
- **Five seconds that belong to the ending.** "I finished the last boss, clicked, and the final screen was gone." Every
  door out of the win's card is shut for five seconds after the run ends — the launch key, a click, a number, R — and the
  card is up and readable through all of it. The line saying *press space to keep flying* now arrives when the keys start
  doing it rather than when the card does.
- **Measured, not felt.** `node tools/shake-meter.js` plays a run and reports how much the window moved: the share of
  frames it sat still, the share it was visibly rolling, a percentile spread and px·s of travel, crowd apart from boss,
  and the busiest minute. `test/shake-policy.test.mjs` walks the balance table and refuses any new shake outside a boss,
  a hit on the ship and the wreck, refuses any `shakeIt` that invents its own number, and re-measures a played run — and
  the release script runs the meter, so the rule cannot quietly rot. The whole suite is 1260 tests, and every fingerprint
  of the reference run is unchanged: nothing in the simulation ever read trauma back.

## 0.6.10 — 2026-10-09
The run can be won. Bring down the last fight on the schedule with the ship still flying and the arena stops: ARENA CLEARED.
- **A second ending, and not a gold-painted death.** A win freezes the arena exactly where a death does, so nothing still
  turning in the room can take a hull off a ship that has already finished — a blade mid-sweep, a drifter standing on the
  wreck. And a run that loses its last hull in the same second the Eclipse does is a wreck and not a win: the pretty name
  has to be earned standing up.
- **The hush.** The card does not arrive on the frame the fight comes down. The arena holds still for a second and a half
  — the going-down chord, the wreck, the night letting go of the room — and then the card lands on the tail of it, which
  is also the moment the run will take a key again. One number runs both, so the card and the key cannot come apart.
- **What the card says.** The score, the best, the level, the kills and shards, and the clock it took: `CLEARED IN 15m04s`.
  Below that, the three fights the schedule actually sent — THE WARDEN · THE HIVE · THE ECLIPSE — read out of the schedule
  itself, so the card can never advertise a fight the game does not field. Mint and not pink: the arena's whole colour
  language says warm is what is trying to kill you, and mint is what paid you.
- **The dark gives the room back over an ending.** The night the Eclipse brings used to only walk away while a run was
  still flying; now the sun coming down is the last thing that fight does, and the room brightens under the arriving card
  whether the run is won or lost. That is the reward the row always promised and never paid.
- **Everything that counts a run can tell the three endings apart now** — the headless simulation prints WON, the balance
  report separates a win from a survival from a run cut short, the tally writes down that the run was won and when, the
  agent bridge answers `won` — and 24 new tests hold the ending: that the schedule's last fight wins it and an earlier
  one does not, that a wreck outranks a win, that the hush cannot be pressed through, that the card says what the run was,
  and that a won run can be won again. The whole suite is 1224 tests, and every fingerprint of the reference run is
  unchanged.
