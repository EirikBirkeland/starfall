# Starfall — changelog

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
