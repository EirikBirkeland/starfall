# Starfall — changelog

## 1.6.0 — 2026-10-13
A thumb can give a run up, the wreck's card lands once, and every past release has a page of its own.
- **GIVE UP, on the pause rack.** `G` was the only way to give a run up and a phone has no `G`. The rack a thumb
  sees now carries a chip for it, answered by the very handler `G` is answered by — banked, carded and
  cause-less, exactly as a run given up from a key is.
- **It takes two presses, on purpose.** Every other pixel of a thumb's pause screen means *tap back into the
  run*, so one careless tap must not be able to end it. The first press changes the word on the chip to
  `TAP AGAIN TO GIVE UP` and asks with a rising tick; the second is the run's own ending, and nothing ticks
  over the top of it. Any other press in the game leaves the question unanswered, and a rack that comes back up
  is a plain one — an ask never travels from one pause to the next.
- **A chip and not a plate.** A plate is a fight's control, claimed by the touch layer the way the dash is;
  this one sits on a panel over a run that is holding still, so it is the title rail's bargain — painted by the
  page, pressed by a hit test against the box the browser laid out, and asked *ahead* of the tap-resume rule
  that owns every other pixel there. It sits in the rack's own column so the panel is still measured as one
  thing, and a keyboard visit never sees it: that visit has `G` written under the hint.
- **Fixed: the death card knocked on every frame it was up.** One line that belonged to the win's branch was
  being taken by a death too, so the card was repainted — the card, the purse, the codex, the log, the awards
  and the rule racks — and its note re-played, sixty times a second over every death in the game. The win's
  card was already safe, and the test that let it through only ever asked whether the note had been played,
  which is as true of sixty as of one.
- **Every release has a page now.** The version menu still lists them all, and opening one gives its whole
  description — the changelog entry it was shipped with — beside a button to play it and links to the releases
  either side of it. The description is copied into the menu's own folder when the release is made, because the
  published site is that folder and nothing else.

## 1.5.0 — 2026-10-12
A phone can stop a run. The glass grows a **PAUSE plate** above the dash button, and the pause rack says what a
finger can actually do here.
- **One press holds the run, the next lets it go.** Before this, `Esc` and `P` were the only way to stop a run,
  so a phone could only stop one by backgrounding the tab. The plate is answered by the very handler those two
  keys are answered by, on the screens they are answered on and nowhere else: it is the pause key with a place
  on the glass, not a second kind of pause.
- **It is a plate, not a chip.** The title's chips are paint that the press handler hit-tests; a fight's
  controls are claimed by the touch layer, the way the stick and the dash are. So the plate is drawn from the
  same numbers that decide what a finger landed on - the disc you see and the disc you press are one disc - and
  a cursor on a machine that has both may press it too.
- **Where it sits, and how big.** The left half of the glass is the stick's, the bottom-right corner is the
  dash's and the top-right is the hull readout's, so the plate took what is left: the right edge, above the
  dash, where the same thumb already is. It is smaller than the dash on purpose - a dash is pressed a hundred
  times a run and a pause once - and the smaller of two neighbours is the one you can aim at without thinking.
- **Only a visit that arrived with a finger sees it.** A desktop with a mouse has `Esc` already and gets no
  plate over its arena, and a click where a plate would have been is still nothing at all.
- **The pause rack stopped naming keys this hand does not have.** Its line read "G GIVES THE RUN UP · O
  SETTINGS · ..." on a phone, offering two letters no phone has; a thumb visit now reads "THE HANGAR AND THE
  CODEX ARE BETWEEN RUNS", which is true of every hand. Giving a run up from a phone is still open work - it
  wants a confirm a single careless tap cannot set off.
- **Fixed: tapping back into a held run left the pause rack painted over the arena.** The tap resumed the run
  but not the screen, so the run flew on behind a full window of rack that had stopped meaning anything and
  nothing on the glass was left to close it. The tap now answers the whole way out, rack included.

## 1.4.0 — 2026-10-12
A phone visitor can do three more things. The title now has a **thumb's rail**: three chips at the bottom of
the page for the three keys a finger has no keyboard for.
- **TODAY · RULE · MUTE.** One tap flies the arena everybody else is flying today; one tap picks the harder
  rule for the next run and the title says which; one tap is the sound gone, and the next one is it back.
  A chip is its key: it is answered by the very handler `T`, `X` and `M` are answered by, so it cannot get
  out of step with the letter it stands in for.
- **Only a visit with a finger sees them.** The browser is asked whether this machine has touch, once, at
  boot - not whether a thumb has been used, because a phone sitting on its title has not been asked to do
  anything yet. A desktop with a mouse never sees the rail and a click where a chip happens to sit is
  still exactly the launch it always was.
- **Why not SETTINGS, HANGAR, CODEX?** A chip has to be a whole action in one press. Those three open
  panels, and a panel that is walked with arrow keys is a cage for a finger that can neither change a row
  nor leave the page - so they get their own thumb shape in a later version rather than a trap now. The
  pause is in the same boat: a held run is still only reachable from the keyboard.
- **The chips are 44px tall**, the same floor the dash button has, and a test reads the stylesheet to keep
  them there. Where they sit is the browser's decision, not a copy of it: the game asks the page where a
  chip was laid out and presses that box, so the chip you see and the chip you press are one chip.

## 1.3.0 — 2026-10-12
A fourth harder rule: **THICK CROWD**, which fills the arena. `X` now cycles nothing, ONE HULL, NO DASH,
SWIFT CROWD and THICK CROWD.
- **What it does.** The arena holds half again as much of the crowd as it ships: the wave director's budget
  and its ceiling on standing bodies both stand 50% taller for the whole run, so a late fight is 150 bodies
  instead of 100 and the crowd keeps climbing for longer before it stops. It is one number in one row
  (`BALANCE.challenges.thick.holdMul`) and it is spent in the two places the arena's two walls are already
  read, which is why nothing else about a run moved.
- **What it costs, measured.** On the careless hand the middle run dies at **2m48s against plain's 3m53s**
  and scores **0.60x** plain's middle. On the careful hand nobody dies either way and it still costs a run:
  **0.73x** its score and **11 hulls lost against plain's 3** - a hand that can clear the extra crowd pays
  for it in hull, not in its life.
- **It came with everything the other rules had.** A best under the rule on the title and on the ending's
  card, its own row on the codex's HARDER RULES rack, its word beside the score in PAST RUNS, the mark
  next to the clock and the line on the pause's rack: all of that was written once, last month, and a fourth
  rule joined it by being a row in a table.
- **What the ruler could not decide.** It could not tell a share of 1.3 from 1.5 from 1.75 (0.64x, 0.60x,
  0.62x on sixteen seeds), because a bigger crowd is also more bodies to shoot at, so the score column is
  not a straight line in the share the way it is for a swift crowd. The number was picked on the frame's
  account instead - 150 bodies is under the 200 a real frame has been timed against - and the flat sweep is
  said in the balance row rather than hidden.

## 1.2.1 — 2026-10-12
The run log now says which rule a run was flown under, so a score in that column comes with its units.
- **A ruled row says so.** The codex's PAST RUNS rack read `WISP · 40s · 90,000` whether the run stood on one
  hull or three, which is the exact thing the harder rules were put in to stop. A row now reads
  `WISP · 40s · 90,000 · ONE HULL`, beside the score it is the units of, and `CLEARED` still comes last.
- **Old saves are not wrecked and not rewritten.** Every run anybody has ever logged predates the rules, and
  the save store judges a row whole - a field a row was required to have and did not would have thrown away
  twenty rows of somebody's history the first time this version read them. So the rule is an *optional*
  field, and an ordinary run leaves it out instead of writing a word for "none": your log is the same text it
  was, nothing is migrated on your first read, and a row written before rules existed says exactly what a
  plain run says now - nothing, which is the truth about both of them.
- **A rule a page has never heard of still gets named.** Same rule as the unknown ships: a save written by a
  newer version than the page you opened it on keeps its row and prints its own word for the rule.
- **The store grew a kind for it.** `KINDS.optional` is the honest answer to "a field a row written before it
  existed is allowed to lack", and it is strict about what it does allow: a rule that is present and is not a
  rule id still condemns the row, and `''` is not a rule id - the document says "none" by not naming one.

## 1.2.0 — 2026-10-12
Every harder rule now has a number of its own, so a rule is something to beat and not just a harder night.
- **A best under each rule.** The save keeps the best score it has flown under ONE HULL, under NO DASH and
  under a SWIFT CROWD, separately from the all-time best and separately from today's - one map of rule to
  score, banked at an ending beside the other two. A run under a rule can beat the rule and still be nowhere
  near the save's best, and the card says both numbers for that reason.
- **Said where the rule is chosen and where a run ends.** Pressing `X` to set a rule now shows what that rule
  is worth to this save on the line under it, and an ending's card ends with **NEW BEST FOR THIS RULE** or
  with the number it did not beat - the same pair today's line makes about the day. A rule nobody has flown
  yet says nothing about a record, and an ordinary run still says nothing about any of it.
- **A fifth rack on the codex: HARDER RULES.** One row per rule, in the order the key cycles them, each with
  its best and the sentence about what it does, so all three can be read at once instead of being cycled
  blind. A rule this save has never been flown under keeps its row, says NOT FLOWN YET, and gives up its glow
  the way a thing not met does.
- **One old ratchet un-stuck.** `test/alloc-probe.test.mjs` bounded what 900 sparks and 60 shots may throw
  away on top of the crowd as a *ratio*, and the two numbers it divides do not move together: 38-42 B a step
  on a quiet box, 117-121 B with eight test files running at once, which made the suite fail about one run in
  five for no reason. It is bounded in bytes now, like the check beside it - 192 B of allowance against the
  38-121 B measured, and thousands if anyone ever puts an allocation back in the spark loop.
- **Nothing about an ordinary run moved.** `tools/simulate.js` traces byte for byte what 1.1.0 traced - seed
  1 gives the same 10 minutes, the same 73,399 and the same build, and so does seed 20261006's 73,982 - and
  the allocation and frame probes still PASS (dearest gated step 735 B, worst step 0.105 ms). 2,087 checks
  now, 18 of them about these records.

## 1.1.0 — 2026-10-12
A harder rule for the next run, picked with one key and said out loud everywhere a run's facts are said.
- **Three rules, one at a time**: `X` cycles the next run between nothing, **ONE HULL** (the ship stands on
  a single hull, whatever the body and whatever the hangar's plating bought), **NO DASH** (the jump is gone,
  and the two lines that fire off it - the tether and the afterimage - are no longer dealt) and **SWIFT
  CROWD** (every body and every enemy shot travels 40% faster). One rule at a time on purpose: two rules
  stacked is a third rule nobody has measured.
- **A rule is chosen between runs and cannot be changed underfoot.** A run that is flying, held, or waiting
  for a card keeps the rules it was flown under, and a won run keeps them until its card is answered. Like
  the ship and the gun, the choice lives for the visit and not in the save - nobody should come back weeks
  later to a game that is secretly harder.
- **And it is said everywhere**: on the title before you launch, in the glass beside the clock the whole run
  long, on the pause's rack, and on the ending's card, death or win. Under NO DASH the dash's ready ring is
  not drawn at all, because a ring promising a jump that never comes is a lie told sixty times a second.
- **What each rule costs, measured**: `tools/challenge-cost.js` flies the same eight seeds under every rule
  with a careless hand (the `human` bot answering its level-ups at random) and reads the price out of the
  score column - ONE HULL leaves a run worth **0.39x** plain and dead at **1m57s** against plain's 3m53s,
  a SWIFT CROWD **0.45x** at **2m53s**. NO DASH is printed and deliberately not judged: what the jump is
  worth is a question about a person's hands, and no bot here presses it ten times a quarter hour.
- **A run with no rule on it is the run it always was.** `tools/simulate.js` traces byte for byte what 1.0.0
  traced - same seed, same 73,399, same build - and a player who never touches the key pays nothing for it.
  2,069 checks now, 26 of them about these rules and about the ladder that prices them.

## 1.0.0 — 2026-10-12
The plan is finished. Every item of milestones 0 to 10 is done, and this is the game the plan described -
ninety-six releases of it, and 2,043 checks that keep it that way.
- **What a run is**: five ships and five guns, a fifteen-minute scheduled run with a boss at every fifth
  minute - the Warden, the Hive, the Eclipse, and a win when the last of them comes down - and then the
  endless door for anyone still flying; nine kinds of enemy; nineteen upgrade lines dealt three at a
  level-up, so a run is a different build almost every time it is played.
- **What grew around it**: the hangar and its unlock ladder, the codex, daily runs, awards, a history of
  every run you have played, and a difficulty band the last sessions measured rather than assumed. The
  whole interface is now measured too - every line of type in it is checked for contrast, for length, and
  for a voice that says what a thing does in one sentence.
- **What is in *this* version**: the three cards gated on the dash - tether, afterimage, overcharge - read
  again against the way the practice bot dashes now, which is the way a person does it. Nothing moved, and
  that is the finding: `tools/ghost-grid.js` is a new ruler for the afterimage's radius (it refuses to
  verdict a thin sample, and it re-checks the three promises that set the number in the first place), and
  the overcharge now counts its own loaded steps and spent pulls in a real run. No balance number moved.
- **What it costs a machine**: a crowded step throws away 735 bytes and steps in a tenth of a millisecond;
  the dearest painted arena averages 3,407 canvas operations against a 4,000 budget. Both budgets are
  checked on every release now, headless. The one thing left on the performance list is the half that cannot
  be checked here - what a real browser and a real canvas ask for - and it waits for a screen.
- **The rest of the story is the ninety-six releases above**, and the menu page plays every one of them.

## 0.10.20 — 2026-10-12
A crowded step now throws away a quarter less than it did, and the thing that was costing it was not the
crowd coming apart. It was the sound the crowd asks for: the game was building a fresh object for every
note, and a crowded step asks for several - a darter's beat, two shots landing, a body coming apart, the
shards it paid out.
- **One `queue.push` was 295 bytes of the 410** that separated the endless crowd dying (984 B a step) from
  the same 200 bodies standing still (574 B), which made the sound queue the dearest allocator left in the
  game once `Math.hypot` was gone. That was found by weighing the same load with one part of the game
  switched off at a time, in a copy of the tree, and by V8's own allocation sampler for names - the probe
  weighs a step and cannot name a cause.
- **A cue is a record off a pool now** (`game/cues.js`), the same trick the sparks, the rings, the floating
  labels, the shots and the shards already use. One shape for all four kinds of cue; every queue function
  writes every field, so a crash cannot be read as the beep that used the record before it; and a cue a
  drain hands out is **on loan** - it goes back the moment the frame's sounds have been looked at, which is
  what lets the mixer see a whole frame before it spends its voice budget. A real two-minute fight queues
  4,968 sounds and builds 15 records, and none of them are left over.
- **The same five loads, re-weighed**: the schedule's crowd 436 B a step down to **407**, the endless wall
  574 down to **514**, the same crowd dying 984 down to **735**, and PLAN's impossible 600-body scene 3.9 KB
  down to **3.3 KB**. A megabyte of garbage is now 11.9 s of the dearest load instead of 8.9 s, and a
  scavenge of that heap is a millisecond - which is what the debug plate's worst frames are made of.
- **The budget came down with the game** (a step 1,280 B to **896 B**, a body 8 B to **5**), and this time the
  gate was checked against the very thing that paid for it: putting an object per sound back reads 984 B a
  step and fails. A gate that the last fix would have passed is a gate nobody believes.
- **Two wrong guesses, written down so nobody spends a session on them**: the death FX are pooled already
  (a wreck, its ring and its floating number throw away nothing a pool does not take back), and the `'+9'`
  string a score label is worth **4 B a step** - which is what the optimiser leaves of a short concatenation,
  and why it was measured and left exactly where it was. 9 new tests, suite 2023; the reference run is byte
  for byte the run it was.

## 0.10.19 — 2026-10-12
The interface has been measured. The arena has had a colour ruler for five milestones - small bodies, fast,
told apart by hue - and the game's type has never once been measured against the field it sits on. Now it
has, with the ruler this question actually wants (WCAG 2.1's contrast ratio: 4.5 to 1 for a line you read,
3 to 1 for a heading), and nine lines of type failed it. Every one of them was dim on purpose, and every
one is legible now.
- **What was unreadable**: the codex's undiscovered entries (2.43 and 2.96 to 1), an award this save has
  not won (2.82), a ship the purse has not bought and its numbers (3.22 and 4.12), what a settings row
  does (3.65), the mixer's quiet slider (3.05), and the banish key on a card (3.31). The game dims these
  to say "quieter" - and it was paying for it in darkness, where the honest coin is colour: a quiet line
  is now greyer and keeps no glow, while sitting clearly below the line above it and clearly above the bar.
- **The ladder was stretched and not flattened.** The page's body blue went from 6.46 to 7.05 to 1 and its
  numbers from 5.03 to 5.60, so the quiet rungs could come up over the bar and still be one clear step
  below the rung they sit under. A locked ship row is greyer than an owned one, not merely nearer black;
  the glow is still what says "earned".
- **The mixer's untouched row** is half-lit instead of half-dark - 3.05 to 4.82 to 1 - so the slider you
  did not move is still a word and not a smudge, and still clearly the quiet one of the pair. The banish
  tab's cold mark went 3.31 to 6.43, in the same colour the interface uses for secondary text everywhere
  else.
- **New instrument**: `node tools/contrast-check.js` prints all 92 lines of type, worst first, page and
  glass (`--all` for the whole table, `--strict` to fail on a line under its bar). The page half is read
  out of `index.html` itself - every `color:` in its stylesheet, its size resolved through the page's own
  inheritance, over a veil parsed from the same file - so the audit cannot drift from the page and a new
  line of type is measured the day it is written.
- **The glass half is pinned to the drawing**, twice over: a test checks that the colour and the size each
  pinned line is measured in are the ones the function that paints it uses, and one test paints the mixer
  readout for real and reads the ink back off the canvas (the stub logs the colour and the alpha of every
  word now). That is what found the tab being audited in a colour it had not been painted in for a hundred
  sessions. The three interface plates are palette entries now - `plate`, `plateDeep`, `chipFace` - and a
  test refuses an inline rgba plate in the renderer.
- Suite 1985 to **1998**. Nothing about a run moved: the reference run traces the same bytes.

## 0.10.18 — 2026-10-12
Milestone 9 closes here, and this one ships nothing you can see, on purpose. What it fixes is the
instrument the last few releases were measured with. The palette is audited by shape as well as by
colour - "does this read as the same thing as that" - and while every colour in it is read out of the
game's own numbers, the shapes were written down by eye and three of them were wrong: the table said
the weaver, the darter and the swarmling are all little darts, where the renderer draws the darter a
dart and draws the other two with the ship's own silhouette, their noses pulled out long.
- **The shape table is read out of the renderer now.** A test opens `render/entities.js`, finds which
  silhouette each kind is given, and fails the audit the day the two disagree. That rule already held
  the sizes, which is why the sizes were never wrong.
- **What the honest numbers say**: the weaver (10 px) and the swarmling (7 px) borrow the shape your own
  ship is drawn with, so colour and size are all that says "that one is not you". Where a pair of
  different shapes is asked for half a step of colour, a body that borrows the ship's shape is asked for
  a whole step on every axis an eye keeps - and both clear it, the swarmling by 2.49 and the weaver by
  1.77, so they stay. Two bodies of one shape, one size and one colour would not, and now cannot.
- **A new section in the report** - *Who shares a silhouette* - prints which bodies are drawn the same
  shape and what each pair has left to carry the difference. Today it prints one pair, the weaver and
  the swarmling, 1.43x apart in size and 0.72 of a step apart in colour: size's job, and not colour's.
  Asking the report for `--strict` now exits on a shared shape that neither size nor colour pays for.
- **Nothing about a run moved.** The reference run - one seed, ten minutes, every frame hashed - is
  what it was, and the suite is 1985 tests with three new ones in it.
- **What milestone 9 shipped**, for the record: a title that writes itself, a pause worth reading, a
  wreck's card that says what took the run down, a settings rack, two assists that make a keyboard
  alone enough to fly with, thirteen keys you can move, a gamepad, a thumb on the glass, and a colour
  language measured instead of hoped for.

## 0.10.17 — 2026-10-12
The hangar reported this one on itself, and it was right: open it and the title screen kept shining
through - the key line, the big score on a wreck's card, the mark itself - so the panel you were reading
had a second, fainter panel underneath it and the picture looked broken. Now the page underneath a panel
is put to bed, and what is left of the menu behind the glass is a hint at a tenth.
- **Everything the menu said goes, not only the words**: the title, the wreck's card and the win's card
  fade to a tenth of what they were, and the STARFALL mark - which is painted on the canvas rather than
  typed into the page - steps back to the same share of its light, or the word would have gone on glowing
  behind the racks all on its own.
- **Every panel does it**: the hangar, the codex, the settings, and the controls rack behind them - and
  stepping from one to the next keeps the page asleep instead of letting it up in between. Whatever key
  closes the last panel lets the page back up.
- **It fades**, over the quarter of a second the page already fades its screens with, so the menu sinks
  rather than blinking. Ask your machine for as little movement as it will give and the change lands on
  a single frame instead, like everything else here that moves.
- **The arena is not part of it.** The crowd and the starfield keep drifting behind every panel exactly as
  they do behind the pause; that was always on purpose. It was the *other page's words* that had to go, and
  a tenth of them is left behind so the hangar stays a window onto the arena rather than a card pasted on
  black.
- **Eight new tests**, among them one that reads the page's own stylesheet to check that the class the code
  writes is a class the page actually styles (and that `hidden` still outvotes it), and one that prices the
  mark's strokes so a test can see the dim happen instead of assuming it. The reference run traces the
  same bytes as before it.

## 0.10.16 — 2026-10-11
There is a **MARKS** row now, one press inside the settings: on, every enemy shot is drawn with a dark
hole punched through its light and every shard with a lit spark in its middle. That is the whole feature -
a second way to tell what can hurt you from what you want, made of light and the lack of it rather than of
colour, for anyone who cannot read the game's warm-and-cool rule off the hues it is written in.
- **It is added, not swapped**: a marked shot keeps every bit of light it had, so it is no harder to *find*
  in a crowded screen - only harder to mistake for a shard, or for your own gun. A shard's mark fades away
  with the shard.
- **Two strengths**: `FULL`, and `FAINT` for the same picture with less ink in it, and `OFF`, which is what
  ships. `OFF` is the game exactly as it was yesterday, to the last thing it drew.
- **Only the two small fast things are marked**, because only they are ever mistaken for each other: no
crowd body, no beam, no wall, and not your own shots - yours are already the bright half of the pair.
- **It cannot undo the one colour rule the game runs on** (warm is harm, cool is help): a mark is a shade
  and not a colour, and there is a test that measures how far its hue moves, which is nowhere worth
  mentioning.
- **It was measured before it was shipped**, in the same Oklab ruler the last release added: with marks on,
every promise the palette makes still holds for all five kinds of eye, nothing painted on the arena goes
  invisible against the sky, and the two pairs the palette was thinnest on - a shard against an enemy's
  shot, and their shot against yours - go from 1.12 and 1.20 to 2.49 and 2.57 for an eye with no hue at
  all. The report is in `tools/palette-check.js` under *When MARKS is asked for*, and the faint step is
  what has to clear the bar, not the loud one.
- **It changes nothing about a run.** The test that already played one seed twice with every settings row
  at both ends of its travel now includes this one, and the world did the same thing both times.
- **Thirteen new tests**, and the reference run traces the same bytes as before it.

## 0.10.15 — 2026-10-11
The menu announces itself. Open the game and, wherever your browser is willing to let a page make a
sound on its own, the title screen's song is already playing - you should not have to press a key in
the right order to hear where you are.
- **The sound device is asked for when the page opens**, not when you press something. A browser that
  lets this page play - one with no such rule, or one that remembers you hearing sound here before -
  starts the song at once, before a hand has done anything.
- **Any press wakes it, including one the game does not answer.** A stray key is still a press, and the
  browser counts it as one, so the menu no longer waits for the `H` you happened to press last time.
- **A visit that came back muted gets its song the moment `M` lifts the mute** - no need to go and open
  a panel to be allowed to hear something.
- **Nothing is bought for a device nobody can hear.** The 8.7 MB of the song is fetched only once the
  browser is letting the page play, and the generated title pad waits for the same answer instead of
  writing half a second of music into a clock that is standing still.
- **Why the title is quiet is written down now**: `STARFALL.stats().menuTrack` says "asleep: no browser
  lets a page make a sound before a press", or "this visit came back muted", for whoever wonders.
- **The one thing a page cannot do**: a browser meeting this page for the first time, with its autoplay
  rule set the way browsers set it, will not make a sound before it is pressed once. That is the
  browser's rule and not the game's - and the press that launches a run buys that run its own music,
  which is the part of the soundtrack that listens to what you are doing.
- **Three new tests, eight amended**, and a stub browser that can finally model the rule at all -
  `autoplay: true` is a browser that lets the page play, and without it the device is built asleep and
  refuses to start until something is pressed. Suite 1928 → 1936, and the reference run traces the
  same bytes as before it.

## 0.10.14 — 2026-10-11
Every key the ship answers is yours to move. There is a **CONTROLS** rack one press inside the settings
panel - pick the row with the arrows, press the arrow that means "take a key", then press whatever is
under that finger. Nothing else about how the game plays has changed.
- **Thirteen controls on the rack**: the four that fly the ship, the dash, the pause, giving the run up,
  the hangar, the codex, the settings, today's arena, the reroll and the mute. Each row says in one line
  what its control is, and what key it is on right now.
- **A key can only be in one place.** Give the DASH row a key that was the HANGAR's and the hangar takes
  the key the dash just left - a table you can tie into a knot is a table you cannot escape, so nothing is
  ever stolen, only traded. One press of `←` puts a row's shipped key back, and the shipped keys are what
  the rack prints when nothing has been moved.
- **The arrow keys always fly the ship too**, whatever the rows say. They are the pair a keyboard with no
  letters to spare still has, and no panel can be put up over a run being flown - so a rack's cursor and
  the ship's movement can share them without a key ever meaning two things at once.
- **What stays put, and why**: `SPACE` to launch, the numbers that pick a card or a ship, `[ ]` and `- =`
  for the two volumes, `F3`, and `ESC`. A key that cancels a rebinding cannot be the key a rebinding
  takes, which is why the pause row is `P` and its line says `ESC` does it too.
- **Nothing is left holding an old key.** The title's list, the hints under the hangar and the codex, the
  pause's own line, the two ending cards and the little plate that teaches you to fly all say what the
  game currently hears, not what it shipped with. A visit that rebound its keys before its first run is
  taught its own keys.
- **It is kept**, in the same save as your ships and your perks, and a save that names a key the game
  will not take just leaves that one row on its shipped key.
- **Twenty-nine tests** - the table on its own, and then the machine around it: the door on the settings
  panel, the row lit amber while it waits, a rebound that has to move the actual ship, `Esc` refusing to
  be eaten twice, every page label checked against the table at once, and a save full of nonsense. Suite
  1899 → 1928; the reference run traces the same bytes as before.

## 0.10.13 — 2026-10-11
Plug a pad in and it is flying the ship on the next frame - no page reload, no option to find, nothing to
press first. It joins the keyboard and the mouse instead of replacing them, so the cards, the hangar and
the settings are still the screens they always were.
- **Left stick flies.** Push it and the ship goes: halfway out is half the ship, the end of its travel is
  the ship's own top speed, and a stick that is barely off its middle is a stick at rest. Let it go and
  the ship brakes. If you were holding WASD as well, the stick wins - the hand that is on a control is the
  one the game listens to.
- **Right stick aims, and fires while it is pointed.** Push it at a body and the nose follows; hold it
  there and the guns are held open. Let the stick come back to its middle and the nose *stays* where you
  left it instead of snapping back to a cursor you haven't touched in minutes - and one move of the mouse
  takes the aim back the moment you reach for it.
- **A shoulder dashes.** The right bumper, or the right trigger if that is where your pad keeps it - one
  press, one dash, and a trigger pulled and held at the end of its travel is one press, not a mash.
- **A launches, Start holds the run**, over the title, over the cards and over the wreck, which is
  whatever those keys already did.
- **Two families of pad, both read.** Pads disagree about where their triggers and their Start button
  live, and the game tells the two families apart by how many axes they report. A pad that fits neither
  still flies: both sticks, A and the right bumper are read wherever they are.
- **F3 now has a HANDS row** saying which pad the browser handed over, or `none` - the one place the game
  admits it is watching for a pad at all.
- **Fifteen tests** - the dead zone, a nudge that is not a lurch, the nose staying put after the stick
  comes home, a mashed bumper, a held trigger, both families' button layouts, a pad unplugged mid-run,
  and one that flies a whole run twice, once with a pad lying untouched on the desk, and asks for every
  number to agree. Suite 1899; the reference run traces the same bytes as before.

## 0.10.12 — 2026-10-11
The game plays on a phone now. One thumb flies the ship, the other presses the dash, and the gun looks
after itself. Nothing to configure, nothing to turn on: put a thumb on the left half of the glass and the
run is being flown on it.
- **A stick that appears where your thumb lands**, not one bolted to the corner. Every pair of hands
  holds a phone differently, so the stick is put down wherever the thumb was put down and its ring is
  painted there: push to the edge of the ring for the ship's own top speed, halfway for half the ship,
  and rest a thumb on the glass for nothing at all. Let go and the ship brakes.
- **DASH, the button at the bottom right.** One press, one dash, and mashing it through the wait gets
  exactly one dash the moment the wait is paid - the same answer the space bar gives. The ring you see
  and the ring your thumb presses are one ring: the button and the stick are painted from the input
  layer's own numbers, so neither can drift away from the other.
- **The gun looks after itself, and says so.** A run flown on a finger has no cursor to point with and
  no trigger to hold, so auto-aim and auto-fire ship on for it - and they are the same two rows that
  have been in the settings panel all along, which is how a thumb run can hand the trigger back. A visit
  that never touched the glass is the visit it always was: the same shots, the same run, the same bytes.
- **A tap means what a click meant.** The title launches, the level-up cards are answered, the wreck's
  card restarts - no screen had to learn the word "finger". A thumb has no Esc, so a tap is allowed back
  into a held run where a click is refused, and the pause rack and the cards say TAP where they used to
  say the thing a mouse does.
- **Thirteen tests for the driving, nine for the picture** - the stick's dead zone, a half lean, a
  mashed dash, a phone that comes back from being backgrounded under a thumb, and the promise that a
  keyboard and mouse visit is shown no control at all. Suite 1884; the reference run traces the same
  bytes as before.

## 0.10.11 — 2026-10-11
Every line of text in the game was read in one sitting - first by a tool that plays a whole visit and writes
down what it sees, then by a person. Four things had drifted, and all four are fixed where you see them.
- **A win with one kill on it said `1 KILLS`.** Both end cards join a number to a fixed plural, so a run
  that took one body and one fight read `1 KILLS · 0 SHARDS · 1 BOSS`. It says `1 KILL` now.
- **The clock beside the score was in seconds and the card under it was not.** A fifteen-minute run read
  `TIME 902s` at the top of the screen and `CLEARED IN 15m02s` when it ended. One wording now, everywhere
  the run's length is written: the HUD, the pause, both cards, the log of past runs.
- **The volume readout and the settings panel are one machine with two names for one thing** - the effects
  bus was `SOUND` on the readout the volume keys put up and `SOUNDS` in the panel. It is `SOUND` in both,
  and the readout's line of keys is in caps like everything else drawn on the glass.
- **Two lines in the control list read like the odd ones out** (`PICK A CARD, DURING A RUN`, `GIVE THE RUN
  UP, WHILE IT IS PAUSED`); they say `PICK A CARD WHEN IT IS DEALT` and `GIVE THE RUN UP WHILE PAUSED`.
  The codex said the sniper was "bolted down"; it "plants itself, draws a line, then fires down it".
- **And the gate, so it stays true:** `tools/text-survey.js` prints every sentence the game can put in front
  of you, grouped by the screen it lands on, and `test/words.test.mjs` keeps the three voices apart - the
  interface in caps, the catalogue in lower case, a card's copy a full sentence - along with the length
  ceilings, the separators and the plurals. Eleven tests new, suite 1862.

## 0.10.10 — 2026-10-11
The game teaches you now, one line at a time. There is no tutorial screen and nothing to click through: a
new save gets a small plate at the bottom of the glass, and it is gone the moment you have done the thing
it was telling you about.
- **Three prompts, in the order a run asks for them:** `W A S D TO FLY` from the first step, `MOUSE TO AIM
  · HOLD LEFT TO FIRE` when the first bodies come in, `SPACE TO DASH` when one of them is standing inside
  one dash's distance. One at a time, bottom of the window above the XP bar - the only corner of the
  screen nothing else ever asks for.
- **It stops when you have learned.** Every prompt is watching something you *do* and not waiting to be
  read: fly and the flying line goes, fire and the gun's line never comes, dash once and the dash line
  fades out. A first run that flies and shoots inside its first three seconds may never see a word of it,
  which is the point - it is a hint that can be proved wrong, not a lesson plan.
- **It never nags.** A prompt nobody answers stays nine seconds, steps back, and tries once more before it
  leaves it alone for that run. The three of them are offered across the first runs of a save and not
  after, so a save that has flown twenty runs is not about to be taught now, and what you have learned is
  remembered so the next run does not repeat it.
- **Nothing about a fight changed.** The cards still teach themselves (`CHOOSE ONE · 1 2 3 OR CLICK`, a
  number in every corner) and the level bar still teaches the loot. The tutorial is a watcher: the same
  seed played with all three lessons up and with nothing left to teach ends on the same run, to the
  fingerprint, and the ten-minute reference run is byte for byte what it was.

## 0.10.9 — 2026-10-11
There is one arena a day now, and everybody is flying it: press **T** and the run starts on a seed nobody
chose - today's date - and whatever you score on it is today's best until you beat it yourself.
- **The day is the seed.** The date written as a number (2026-10-11 is `20261011`) goes through the same
  mixer the game scrambles successive seeds with, so consecutive days are unrelated arenas rather than
  one arena with a drifter moved, and one date is one arena for everyone, everywhere, all day. Nobody can
  re-roll it: there is no seed box to type into and no second deal.
- **Nothing else about the run is different.** Same ship, same opening three, same cards, same purse, same
  awards - a daily run banks all of it, because being on everybody's seed is a challenge and not a fine.
  What it adds is the day's own best, banked as a fourth number on the title (`BEST · STARDUST · TODAY
  4,321`), written in full on the card that ends the run with `NEW TODAY` when it beats the day, named on
  the pause screen and marked beside the clock while you fly.
- **Today is your machine's today, and the day rolls when you are standing in it.** A run launched at
  23:59 belongs to the day it started on even if it is still flying after midnight. One day is kept, not
  a history: yesterday's best is a number nothing can be compared against once today has begun.
- **An ordinary visit does not change.** Every place the day is said is empty - takes up no room at all -
  until the day has been flown, and `T` is a launch rather than a mode: press it again for another run
  today, press `Space` for a run of your own, and the only thing a daily run leaves behind is the day
  written into the run that was flown on it.
- **One real bug came out of it**, three tests deep: the day's seed was being left in `world.seed`, so the
  ordinary run after a daily one kept flying the day - and that field is how the address bar, the
  simulator and the test harness hand a visit its seed.

## 0.10.8 — 2026-10-11
A step of the game throws away four to seven times less than it did, and that answers the thing the debug
plate has been reporting since the plate was built: the worst frames are the collector, and now it is
called seven times less often.
- **It was `Math.hypot`.** V8's `Math.hypot` takes any number of arguments, so it lays them out in a list
  on the heap and throws that list away again on every call. The crowd asks for a distance once or twice a
  body every step - the stand-off band a spitter and a shielder hold, the line a darter commits to, the
  middle of a swarm's flock, a bomber's circle, a missile's aim - **38 call sites**, and that was **2.7 KB
  of the 3.5 KB a crowded step threw away**. `core/math.js` has a two-argument `hypot` of its own now: a
  multiply, an add and a square root, which is the same number to within a rounding error and throws away
  nothing. Every call site in the game - the simulation and the painting of it - uses that one, and a
  structure test refuses the old one anywhere else in `src/`.
- **The same scenes, the same tool, the same box:** the schedule's crowd **3.4 KB a step down to 816 B**,
  the endless wall **6.1 KB down to 854 B**, the same crowd dying **8.5 KB down to 1.2 KB**, PLAN's
  impossible 600-body scene **19.6 KB down to 2.8 KB**. What one body costs went **31 B down to 3 B**, so
  a young generation of a browser is now about ten seconds of play instead of one and a half, and a
  scavenge of that heap costs a millisecond - which is the whole of the 1.4-1.7 ms worst steps the F3
  plate has been seeing.
- **The budgets came down with the game**: a body 52 B to **16 B** and a gated load 10 KB to **2.5 KB**,
  and each gate was mutation-checked by putting an allocation back into a copy of the tree. `Math.hypot`
  back in the crowd reads 8.5 KB a step and fails; a scratch object per step of a walk reads 15 KB and
  fails; a grid cell emptied with `cell.length = 0` reads 11.8 KB and fails. Under the old 10 KB budget,
  putting `Math.hypot` back would have passed - which is the argument for moving a ceiling when the floor
  drops, and for never tightening a gate without checking that it still bites.
- **Two wrong guesses, written down so nobody spends a session on them again**: this was not double boxing
  (writing a double into a live enemy's `x`, `rot`, `timer` or `hp` in a hot loop was measured to throw
  away *nothing* on this box) and it was not the `for..of` loops over the crowd (an iterator nobody can
  see). What found it was ablation taken one level finer than a system - copy the tree, switch one *part*
  of one function off, weigh the step again - plus V8's own allocation sampler for names.
- **The runs moved, and it is worth knowing.** `sqrt(dx*dx + dy*dy)` and `Math.hypot(dx, dy)` are the same
  number to within a rounding error, and a rounding error is enough to move a darter's aim: the reference
  run is a different run from frame ~11,000 on (10m00s / 73,982 / level 57 against 75,596 / level 58) and
  a four-seed batch's median score moved +16%, which is less than the spread between its own best and worst
  seed. No number in `balance.js` was touched. 6 new tests, suite 1809.

## 0.10.7 — 2026-10-11
The menu has a song of its own now, and a step of the game throws away a third of what it used to.
- **The owner's recording is the main menu music.** `assets/MenuMusic-SpaceRapBattle.flac` - 80 s of
  48 kHz stereo, 8.7 MB - plays on the attract screen and nowhere else, because the sequencer is what
  answers a run (the boss that walked in, the hull that went, the two minutes that bought the kit) and
  a fixed song would be deaf to all of it. While the song is up the generated title pad stands down,
  and when a run starts the song fades out over a third of a second instead of being cut.
- **You may not hear it on the first visit, and that is the browser's rule.** No page may make a sound
  before it has been given a press, and the first press is usually the one that launches. So the song
  starts for anybody who unlocks sound on the menu without launching - `H` the hangar, `C` the codex,
  `O` the settings, `M` the mute - and it plays under whatever they read there.
- **Which is why it is fetched late, and once.** The bytes are asked for only with the menu on the
  glass, only after an audio device exists, and never while the visit is muted: the ordinary visit
  spends neither the 8.7 MB nor the 31 MB of samples it turns into, and no network, a missing file, or
  a browser that will not decode FLAC all leave the title playing the pad it played before. The
  recorder sits on the music bus, so the music slider moves it, the mute out-mutes it, and the
  player-hit muffle ducks it like anything else.
- **What a frame costs, in bytes now as well as in milliseconds.** `tools/alloc-probe.js` weighs a step
  in garbage - one load per process, best of twelve windows, every window the collector came into
  thrown away and retried - and it answers the thing that had been puzzling the F3 plate: those worst
  steps of 1.4-1.7 ms are the collector, not the crowd, because the crowd at its wall throws away a
  megabyte every 1.4 s of play. Two real fixes came out of it: a grid cell is a count and a store now,
  so a rebuild and a query allocate nothing (94 bytes a body a step down to 31), and the awards rules
  stopped listing the ranks table once per rule per step. The budgets - 512 B an empty arena, 10 KB a
  gated load, 52 B a body - are the ratchet from here on.
- **29 new tests**, sixteen about the song (one visit that sits on the menu; a visit that launches
  before it unlocks sound and spends nothing; a song that is missing; a song that is not sound) and
  thirteen about the ruler that weighs a step. Suite 1803, and the reference run is byte for byte the
  run it was: a song is a frame's business, and the simulation still does not know music exists.

## 0.10.6 — 2026-10-11
Three of the five primaries were being offered cards that could do literally nothing for them. They are not in that deck any more.
- **What was dead, and how dead.** `PIERCE` and `RICOCHET` are a travelling shot's business, and the
  ARC throws no shot, the LANCE throws no shot, and the Swarm's shells are spent detonating on the
  body they find - so those three runs were being offered cards that did nothing, and the bot (which
  likes both cards) paid three or four levels a run on them. The same is true of `SHOT SPEED` on the
  arc and the lance, which nothing had counted yet: there is no projectile to speed up. That is one
  card in six on two of the five ships.
- **Measured before it was decided, and it was inert rather than weak.** `tools/line-ab.js` grew a
  `--weapon` flag so a line can be priced on a gun, and five free ranks of an inert line give a run
  *the same score* as a deck the line was taken out of - not close, the same number: 106,219 and
  106,219 on the arc, 113,614 and 113,614 on the lance, 126,877 and 126,877 on the Swarm, four seeds
  and a fifteen minute window each. Weak is not dead: the Swarm's shells do travel, and shot speed
  moves that run (126,904 against 128,405), so it stays in its deck like everyone else's.
- **So the deal asks the gun.** Three weapon rows now carry a `cannotSpend` list and
  `game/upgrades.js` keeps those lines out of the draw - and out of the "at least one of these cards
  must be new to you" promise, which walks the whole table of lines and would have dealt them by the
  back door. Nothing was written on a card and nothing was added to the hangar: a rule a player can
  never meet needs no disclaimer, and the codex still lists all nineteen cards, because that page is
  what the game has and not what one ship is shown.
- **Not a buff, and that was the worry.** Taking the dead cards off the rack could have been three
  guns quietly getting stronger. It was measured the other way first (with the cards on the rack the
  middle run moved +0.1%, +7.3% and -5.0%, which is noise in both directions) and it was measured
  after: the weapon ladder still reads **SWARM 127,258 over LANCE 112,668 = 1.13x against the 25%
  allowed, PASS**, and the two guns that can spend every line printed the scores they printed
  yesterday - PULSE 118,867, SCATTER 120,642, unchanged to the point, like the reference run.
- **11 tests**, eight of them dealing four hundred hands at a filtered gun and demanding both that
  the dead lines never came up and that everything the gun *can* spend did.

## 0.10.5 — 2026-10-11
Two of the five primaries were twenty times worse than the other three. They are in the band now, and the ladder prices a gun in bodies instead of in hull.
- **The gap, and what it was.** Sixteen seeds a gun and a fifteen minute window said SCATTER 120,642
  against LANCE 5,658 and SWARM 35,960 - 21.32x, against the 25% PLAN allows. The two knot tables said
  neither gun was short of damage: what a run is paid in is *bodies*, not hull, because a shard drops
  per kill and a level is bought with shards, and a lance run ended at level 7 where a pulse run ended
  at 66. So the two slow rows were re-priced in bodies. Same seeds, same window: SCATTER 120,642, SWARM
  125,756, PULSE 118,867, LANCE 111,963, ARC 110,868 - **1.13x, PASS**, all five outlasting the window.
- **A heavy gun buys bodies with pulls and not with weight.** The lance now pulls 2.6 times a second
  instead of 0.9, and that is the whole of its 6,736 → 111,963: a beam twice as wide did nothing
  (5,025), a fan of three beams a pull did nothing (4,891 with 20% more hull behind the pull), and a
  longer-reach missile on the other slow gun cost it runs (18,050). A press has to be thinned
  *continuously*, and no amount of size on a rare pull buys that. The Swarm keeps PLAN's three pulls a
  second and buys its bodies inside the pull instead: a pull is a pair of shells now, which was worth
  more than the bigger blast that would also have worked and would have made a liar out of "micro".
- **A body costs a body.** The lance used to pay 5 hull to remove a 3-hull body, eight hundred times a
  run, and the two hull past the body bought nothing at all; its line costs 3 now, and what it gave up
  there is what bought the rate. Every row in the table lands at 3.00-3.25 in the ladder's `cost/kill`
  column, and a test refuses any row that starts paying a multiple of a body for one again.
- **A kick and a freeze are felt per second, not per pull.** Firing a lance 2.6 times a second with its
  old recoil would have shoved the ship backwards at 572 px/s - more than it can fly - so the kick came
  to 90 and still leaves it the heaviest gun in the game; and its 30 ms stop would have held the world
  78 ms in every second, which is not a beat but a stutter, so it is 18 ms now. Both numbers are argued
  where they are written.
- **The ladder prints `bodies/s`**, because that is the currency it is now read on: 6.09 to 7.04 across
  the five guns, 1.16x, which is the first number this game has had that lets a shotgun and a beam be
  read against each other at all.
- **Still open, and now written down as its own item**: three of the five primaries cannot spend the
  deck's `pierce` line and two cannot spend `ricochet`, by design - so a lance run is dealt two dead
  cards in ten and pays for them out of the levels it is short of. Session 96 priced the guns and
  refused to answer that one with a number.
- Suite 1747 → 1748, and the reference run (`node tools/simulate.js --seed 20261006 --trace`) is byte
  for byte the run it was: the pulse is the yardstick, and the yardstick was not touched.

## 0.10.4 — 2026-10-11
Two pieces of a run stopped following it into the next one, and three rules that lived in prose are checks now.
- **Nothing a run learned comes with it.** The lance kept the last run's fan angles and the tether kept
  holding a body from a run that had already been paid for and written up in the log. Neither showed on
  screen: the lance reads only as many angles as its own current pull, and the tether's spare rider is
  only ever read straight after a yes. Both were the shape of bug that shows later, when someone reads
  the field for what it is now.
- **A machine reads both halves of `resetRun` now.** `tools/headless/reset-audit.js` snapshots the whole
  shape of the world - every field, every list's length, every pool's live count - and compares a world
  that was flown, ended and reset against one that was only ever reset. Those two findings are what it
  turned up on its first pass; the eight things a run *is* allowed to keep (the seed, the session clock,
  the screen, the best, the purse, the awards, the codex, the log) are named and argued in the open. The
  two fixes each have a test that says their name, and the sweep covers everything else.
- **"Every spawner writes every field" has a witness.** A pooled object comes out of the drawer wearing
  its last life, and until today the only thing between that and a bug was that the spawner remembered.
  `tools/headless/pool-audit.js` poisons every field of every object a pool hands out and reports
  whatever is still poisoned when the step ends. `test/pool-contract.test.mjs` runs it over the whole
  game - every line at its top rank, all five primaries, a crowd that keeps arriving, a dash whenever one
  is ready, a boss's blade - and promises twice: nothing left unwritten, and every one of the seventeen
  pooled lists actually reached. The first test poisons one on purpose.
- **Four dead exports are gone**, and a structure test refuses the next one: `hasAfterimage`,
  `fieldCentre`, `bossOf`, `pictureRows` - four accessors whose caller ended up reading something else.
- **`APOLOGY.md`** is the overlord's request of today, and it is the honest version: the mistakes this
  game has actually made, what each one cost, how each was found, and what now checks it - ending with
  what is still wrong and unfixed. Suite 1734 → 1747, and the reference run
  (`node tools/simulate.js --seed 20261006 --trace`) is byte for byte the run it was.

## 0.10.3 — 2026-10-11
`F3` puts up the developer's panel: what the frame is costing, what the arena is holding, and what the pools have built.
- **An instrument you can read while flying.** One key, over the title, over a fight, over the upgrade
  cards and over a wreck, and nothing about the run stops for it. Three sections, exactly what milestone
  10 asked for: the frames, the arena, and the pools.
- **What this frame is actually spending.** fps and frame ms, and then the mean and the worst of the last
  two seconds for the two things that can be spent - stepping the simulation and painting what it made.
  A single frame's number is a coin flip, so the plate gives you a window and its worst day in it; the
  two numbers that add up past a 60 fps budget go warm.
- **What is standing, and what was built for it.** Bodies against the crowd's ceiling, the ship's shots,
  their shots, shards, sparks, the collision grid's cells and the packs in them; then every pooled list
  in the game as `live / built`, so you can see a pool fill and stop filling, and the sprite cache's
  pixel bill beside it. A pool that has never built an object gets no row - a wall of zeros hides the
  one row that means something.
- **It cannot change the thing it measures.** It reads the numbers other modules already keep and writes
  nothing: the reference run (`--seed 20261006`) is byte for byte the run it was, and a test plays one
  seed twice - once with the panel on for the whole flight, once without touching it - and refuses the
  two the right to differ. It is off every time the page opens and it never touches the save, because a
  tool that quietly changes what the next visitor sees is a tool nobody trusts. Sixteen new tests, suite
  1734; a short window gets the same facts in fewer lines rather than in squeezed ones.

## 0.10.2 — 2026-10-11
The soundtrack gets a tune, a floor, and eight bars of harmony instead of four.
- **The song develops now.** The chord phrase is eight bars - Am - F - C - G, then Am - F - Dm - G -
  so the music states something and comes back for it instead of turning over the same four bars all
  run. Every line in the soundtrack is written against its own bar's chord, so nothing had to be
  rewritten for the second half of the phrase to sound different.
- **Nothing repeats every bar any more.** The bass has four bars that answer one another, the
  arpeggio has two, and the drum kit leaves a fill at the end of every eight-bar phrase. A pattern
  is an arrangement with a length now, and the game refuses to load one whose parts do not line up
  with the harmony.
- **There is a tune to hum.** When the drums join at two minutes a melody arrives with them: eight
  bars of long notes on the chord tones, in the register nothing else was playing. Before this the
  only melody the game owned was the vacuum's ten-second fanfare; now the tune carries most of a
  run, and the fanfare takes its place for the reward instead.
- **More oomph, not more volume.** A clean sine holds the root under the saw bass, which is the
  octave a laptop speaker can actually admit. It is paid for out of the pad and the bass and the
  drums rather than out of the loudness ceiling, so the heaviest bar of the hardest fight is *under*
  the level it was at, and the music is heavier at the end of it and not any louder.
- **Checked, not hoped.** New tests prove every note of every figure is a note of the key and a
  chord tone on every beat, that the pattern forms line up with the harmony, that the floor is the
  lowest thing playing, that the tune is the longest line, and that the loudness meter is reading
  the whole arrangement rather than its first bar.

## 0.10.1 — 2026-10-10
`VACUUM`: every 10,000 points the arena empties itself into the ship, and the music plays its fanfare.
- **A reward the game hands out by itself.** Every 10,000 points the well opens for ten seconds: every
  shard in the arena - not just the ones on screen, which is a tenth of the world - is carried to the
  ship, and anything you kill in the window is paid out the moment it drops. The first one lands about
  two and a half minutes into a good run, then one every minute or two.
- **It says what it did.** A ring opens wide round the ship and collapses in, so the pull shows how much
  floor it is emptying; the word `VACUUM` floats up and a gold countdown sits under the score for the
  ten seconds, so the moment has a length and not just a luck.
- **The fanfare is music and not a sound effect.** The run keeps its tempo, its drums and its chord and
  the arpeggio's slot is spent on a rising tune for the ten seconds - so the reward is heard *over* the
  fight it happened in, boss music and all, and the run's own pattern is waiting when it ends. It is
  metered against the same loudness ceiling as every other pattern, which is why it is a tune and not a
  wall.
- **It is worth half a card, measured and not hoped.** Ten runs either side of it: +13.9% score,
  +16.5% levels, +49.5% shards at the median. Free XP is the load-bearing thing in this game - levels
  are the only way to buy a build - so the size of a free pile is a balance number, and this one is
  deliberately smaller than a level spent on DAMAGE.
- **No shake, no freeze.** A reward is not extraordinary enough to move the window (the health rule),
  and freezing the run at the start of a flow is a stutter in the middle of the reward.
- **Inert until it is earned.** The ten-minute reference run replays byte for byte, every frame hash,
  right up to the frame the first well opens on.

## 0.10.0 — 2026-10-10
`ATTRACTOR`: the deck gets a card that buys how far off the loot is yours.
- **A new card, dealt like any other**: five ranks of +25% shard reach. The net that starts 145 px round
  the ship is 326 px wide at the fifth rank, and it is the first line in the game that buys *reach* -
  every other one multiplies the gun, adds a source of damage, or spends what the run already picked
  up.
- **A rank widens the well and deepens it.** The pull is measured over the reach itself, so a shard that
  used to sit on the rim now sits a little inside it and is tugged *harder*, not weaker. Nothing about
  the loot's own value changes and nothing about the ship does: it is a distance and nothing else.
- **It is worth levels, not damage.** Five free ranks read +43.5% of a run's score and +39.7% of its
  damage, where the DAMAGE line - the yardstick every card here is priced against - reads +31.2% and
  +51.5% on the same seeds. What the card actually buys is levels: the median run goes from level 35 to
  level 58, because shards are the only XP there is and levels are the only way to buy a build.
- **A rank you cannot feel is worse than no card at all.** At +5% to +12% a rank the same measurement
  came out *below* the game with the card taken out of the deck, because a level gets spent on it either
  way. That is why a rank is a quarter of the reach and not a tenth.
- **Nothing changed for a run that does not take it.** With the line out of the deck the ten-minute
  reference run replays byte for byte, every frame hash of it. The card wears the shard's own mint, so
  it costs the canvas no new sprite either.

## 0.9.5 — 2026-10-10
`AUTO-FIRE` and `AUTO-AIM`: the game can be flown with the keyboard alone.
- **Two new rows at the end of the settings panel** (`O`): AUTO-FIRE holds the trigger down for you,
  AUTO-AIM points the gun at the nearest body a shot can hurt. With both of them on, WASD is a whole set
  of controls - which is what the plan asked for when it said "playable with one hand or keyboard only",
  and what the game had never managed.
- **Both ship off**, and off is the game exactly as it was. With neither one on, the step asks for nothing
  and writes nothing: the ten-minute reference run is unchanged, byte for byte.
- **Auto-fire is the left button held, not a new kind of shot.** It is written into the same controls your
  hand writes into, and the test proves it: one seed played twice, once with the mouse held and once with
  the switch on, comes out the same run - same shots on the same steps, same ship pointing the same way.
- **Auto-aim keeps its mind.** It takes aim once per simulation step, on the nearest body a shot can
  actually hurt (a dead one, or one in the middle of a phase change, is not a target), and holds on to it
  until the nearest thing is forty per cent further out. Without that slack the nose snaps between two
  bodies circling in together and sprays shots between them, killing neither. And when there is nothing to
  aim at it leaves the nose where your hand left it, rather than swinging at empty sky.
- **They are the two rows on that panel that *can* change a run**, and they sit past the end of the walk
  for it: everything above them is the game's report about a run and cannot move one; these two are the
  hand, so a wander with the arrow keys will not quietly take the trigger away from you.
- **Kept like every other row** - two flags in the save's new `assists` section, read back at boot, and a
  value that is not yes or no is no value at all. The title's own control line now says where they are.

## 0.9.4 — 2026-10-10
`O` opens the settings, and none of it can change the run.
- **A fourth panel, on the fourth key**: `O` for options - because `S`, the first letter of the word,
  is the ship's own down key, and a key that moves the ship never moves anything else. It goes up over
  the title, over the death's card, or over a run you have paused, and nowhere else: over a run that
  is flying it would be a pause the run never agreed to.
- **Seven rows, and the panel owns none of them.** Screen shake, hit flash, score numbers and particles
  come out of a new `game/settings.js`; the music, the sounds and the mute come out of the mixer
  itself. The panel asks both owners and prints what they say, so it cannot offer a step the game has
  not implemented, and a bracket key pressed while it is up moves the slider and its row together.
- **`↑ ↓` put the cursor on a row, `← →` step it.** No numbers on the rows, because a number means the
  ship it means everywhere else - so the launch key and the ship numbers simply stand aside while the
  panel is on the glass, and closing the panel over a paused run puts the pause back up.
- **Every row ships at the end the game was built at.** The last step of every row is the game as it
  always was, so a fresh visit cannot be the first time the game looked wrong, and turning a row down
  makes the game *quieter* rather than making a different game.
- **And not one of them can move a run.** The shake moves the window and not the camera, sparks are
  thinned by counting rather than by gambling, the flash is a share of a bloom and the floating numbers
  are a label - and the new test plays one seed twice, once with every row at the top of its travel and
  once with every row at the bottom, and asks for the same score, the same kills and the same ship in
  the same place every half second. The ten-minute reference run is unchanged, byte for byte.
- **What `flash reduction` took, and what it did not**: the white bloom on a hurt body, which is the
  loudest strobe in the game. A boss's phase flare and the hull bar's white breath are deliberately
  still there - both say "nothing can hurt me just now", and a setting that takes news away is not an
  accessibility setting.
- **Your choices are kept, by name.** A step this build has never heard of is no setting at all and the
  row ships; and a first visit on a machine that was told to keep still (`prefers-reduced-motion`) starts
  with the window held still until it is told otherwise - a default, not an order, so a shake you chose
  for yourself outvotes it.

## 0.9.3 — 2026-10-10
The card a run ends on says what ended it.
- **A death names what took the last hull**, under the heading it happened to: `TAKEN BY A TANK`,
  `TAKEN BY A SPITTER'S SHOT`, `TAKEN BY THE ECLIPSE'S BLADE`. The run's tally has kept this since the
  day it was written and only the balance tables ever read it back; the card was the one place asked
  the question, and it answered nothing.
- **And it costs every hull the run spent**, one row apiece, the costliest first - `A TANK` /
  `TOOK TWO HULLS`, `A SNIPER'S SHOT` / `TOOK ONE HULL`. Going down to a drifter after losing two
  hulls to tanks is a different run from going down to a drifter after losing two to drifters, and
  the card could not tell them apart.
- **A win says all of them; a wreck may leave its last out.** A wreck's headline has just named what
  took the last hull, so a run that lost one hull has nothing left for a rack to say and the rack
  takes its space with it. A win has no such headline - nothing took it down - so it prints every hull
  it spent, down to a single one, and so does a run you gave up, whose headline is about the
  giving-up and not about a body.
- **A run given up with `G` is named for what it was**: `RUN GIVEN UP`, with no cause invented for it.
- **The names come out of the codex's own table**, so the card and the codex cannot call one body two
  different things - and a cause from a build this one has never met is named by what it was
  (`A GROTTO`) rather than breaking the card, the same bargain the run log strikes with a ship it does
  not know.
- **`G` has its own row on the title's control list**, beside `ESC / P`: the key that costs a run is
  said in its own words instead of tacked on the end of someone else's, and a short window takes the
  eleventh row out of the gaps and not out of the type.

## 0.9.2 — 2026-10-10
The run can be stopped, and while it is stopped it says what it is made of.
- **`Esc` or `P` holds the run where it stands** and puts up a panel of its own: the score and the clock
  it has taken, then two racks - the run's numbers (the body and the gun it is flown in, level, hull,
  kills, shards, which wave the crowd is coming out of, how many fights it has buried, what the run is
  worth into the purse, the best, and the seed it could be asked back for) and the build it is standing
  on - one row per line taken, in the order the cards are dealt, quoting each card's own words for what
  a rank is worth.
- **The lines the run refused are on there too**, dim, after the ones it took: a road not taken is part
  of what the run became, and until now that was written nowhere you could look while flying it.
- **`G` gives the run up** - offered on that panel and answered nowhere else, because it is the one press
  in the game that costs a run. Giving up is an ending and not a rewind: the best, the purse, the codex,
  the awards and the log all take it the way they take a death, so a run you stopped is worth exactly
  what it earned and is remembered as one run.
- **Losing the window holds the run as well** (PLAN section 6, arriving late): alt-tab away and the arena
  is where you left it instead of a wreck, and the panel says so instead of the game looking like it had
  frozen.
- **A held run is still the run it was, not a new screen.** The world keeps one flag and takes on no new
  state, so the HUD, the build rail and the crowd behind the panel are all still this run's. The camera
  keeps the lean it had the moment you stopped, the sparks and the sky carry on moving because they are
  the glass and not the arena, and a dash asked for during a pause is spent rather than banked, so
  nothing goes off late for a key you stopped pressing minutes ago.
- **One panel, one meaning.** `H` and `C` stay refused over a run, so the hangar and the codex remain
  between-run screens; Space, the number keys and the mouse keep their run meanings and so do nothing;
  `G` answers to nothing but the pause; and `Esc` means the pause and not "close whatever is up", which
  is why `H` and `C` are still the way out of the two panels they belong to.
- The title's control list says `ESC / P` now, because a key nobody mentions is a key nobody finds - and
  the title's column gets its tight layout from 760px of window rather than 620, because ten rows of
  controls and a logo do not fit in less than that at full size.
- The arena is unchanged by all of it: the reference run traces byte for byte the same game, because a
  pause is a fact about *whether* the run is stepped and not about what happens in it.

## 0.9.1 — 2026-10-10
The title writes its own name, and then keeps moving.
- **STARFALL is drawn, not typed.** `render/logo.js` builds the word out of an alphabet of six angular
  letters - each one a few straight lengths, stroked three times over: a wide cyan halo, a violet
  body, a white-hot core - so the logo is cut from the same straight edges as the ships and looks the
  same on a machine that has never heard of the typeface it is not using.
- **The title arrives by being written.** A pen lights one letter every tenth of a second, each letter
  drawing itself tube by tube with a spark at the pen tip; then the rule under the word shoots out from
  the middle, and the tagline, the controls and the standing lines rise in after it - a quarter of a
  second each, which is the fastest change in the game that still reads as a move and not a jump.
- **And it never quite sits still.** The word breathes, a shine travels along it, the attract crowd and
  the starfield drift behind it as they always did, and every seven seconds a star falls past - tilted
  the way the sky's own drift falls - lighting the letters it passes over.
- **It asks the page where it belongs.** The canvas cannot know what the layout did, so the mark is
  measured against an empty heading in the title's own column at boot and on every resize: the box says
  where, and bounds how big. A page that measured nothing gets a mark in about the right place rather
  than a windowful of letters.
- **`prefers-reduced-motion` is honoured in both halves.** The CSS stops its pulses and its arrivals,
  and the canvas puts the mark up already lit - all eight letters equally - and holds it there: no
  arrival, no breathing, no falling star.
- **A fix.** The win card's line of keys - "press space to keep flying" - was hidden by a class with no
  rule behind it, so it sat on the glass through the whole half-second the card is up but refuses every
  key, which is the exact thing that guard was put there to wait out. It waits now.
- The arena is unchanged by all of it: the mark is frame paint and nothing else, and the reference run
  traces byte for byte the same game.

## 0.8.7 — 2026-10-10
The awards have a page now, and the hangar says what you are saving up for.
- **`H` puts up a third rack: `AWARDS`.** All thirty of them in one column under the purse - the name,
  the one sentence about the run that earns it, and what it still pays. Ones this save has won are lit
  and give up their number; the ones it has not are dim and say what is still out there for it. The
  heading counts them, `AWARDS 7 OF 30`, which is the same number the title says and painted from the
  same list, so the two cannot fall out of agreement.
- **A correction.** The 0.8.5 entry promised awards "in four rows on the back of the hangar" and
  printed names that were never in the game - there was no such list. What had shipped was the plate
  that lands mid-run, the line on the ending's card, and a count on the title with nothing to open.
  This is that list, and these are the names in it: `CENTURY`, `THOUSANDFOLD`, `REAPER`, `BRIGHT SPARK`,
  `SUPERNOVA`, `STARFALL`, `WARMED UP`, `QUARTER HOUR`, `MAGNET`, `GOLD TOUCH`, `SWARM BREAKER`,
  `FIRST FIGHT`, `EVERY FIGHT`, `ARENA CLEARED`, one for every ship, and `FLAWLESS`, `NO DASHING`,
  `STREAKED`, `IN COMBINATION`, `FULL KIT`, `PAST THE END` among the rest.
- **The rack quotes the table rather than writing new words**, so the row, the plate and the card all
  say the same thing about an award - and it is painted when the visit opens and at every ending, so
  it is never one award behind the card that went up a moment before it.
- **An old or a newer save is read honestly.** An award this build has never heard of is counted out of
  the total rather than given a row it cannot print, and it still rides back out through the next write
  - a save is one document and this build is one page in its life.
- The arena is unchanged by any of it: the rack reads a list the ending had already written, and the
  reference run traces byte for byte the same game.

## 0.8.6 — 2026-10-10
There is a record of what you have flown now, and it writes itself.
- **`C` opens a fourth column in the codex: PAST RUNS.** One line per run, newest at the top, the last
  twenty kept: `SEED 41832` then `WISP · 12m04s · 18,300 · CLEARED`. The seed comes first because that
  is how a run is asked for again - put it in the address bar and the same arena walks out at you.
- **It remembers whether the run cleared the schedule**, not just how long it lasted: a fifteen-minute
  wreck and a fifteen-minute win are not the same memory, and the rack does not pretend they are.
- **Written by the ending, not by a key.** Nothing to press and nothing to keep: the row appears when a
  run stops, and a run that was won, handed back and finally buried keeps *one* row telling the truth
  about how it actually ended rather than two about the same run.
- **Remembered across visits**, like the purse and the codex, and in the order you flew them. The same
  seed twice is two runs and gets two rows; the twenty-first-oldest is the one that falls off the end.
- It is on the codex and not the hangar, and it is not a fifth screen on a fifth key: a row nobody can
  buy has no business among rows that can be, and "what this save has done" is the codex's subject.
- The arena is unchanged by its existence - every row is read off a run that has already stopped, and
  the reference run traces byte for byte the same game.

## 0.8.5 — 2026-10-10
There are awards now, and the game tells you the moment you win one.
- **Thirty-one of them, in four rows on the back of the hangar:** RUNS AND SCORE, FIGHTS, BUILDS AND
  SHIPS, DASHES, TIME AND PATIENCE. `FIRST BLOOD`, `FIRST BLOOD'S BLOOD`, `A THOUSAND FOLD`,
  `SCHEDULED`, `FLAWLESS`, `STREAKED`, `PATIENCE`, `BORN TO THE LANCE` - a name, one line about what
  it is made of, and what it pays.
- **Most are won in the middle of a run**, and you hear it: a plate falls in under the top of the
  window, the name in gold, what you did under it and what it paid beside it, and it fades on its
  own after three seconds. No panel to open, nothing to click, nothing that takes your hands off the
  ship. A run that wins four at once - a first win usually does - stacks them and says all four.
- **They pay stardust, once per save.** A hundred for the first boss, three hundred for outlasting
  the schedule, sixty for two hundred and fifty dashes, fifteen for a ship you have not flown before.
  The purse on the hangar now says `1,730 BANKED · +710 FROM AWARDS`, so you can see where the money
  came from.
- **Some are only true when a run stops**: that you won the schedule, that you flew a certain ship,
  that a fight beat you. Those are not announced, because there is no run left to announce them to -
  the ending's card says them instead, `AWARDS · THE HIBERNATOR · +300 STARDUST`.
- **Remembered across visits**, like the purse and the codex: an award is won once, and a second run
  that walks over the same line is not told twice. The title line says `AWARDS 7 OF 31` before you
  launch, and grows as you play.
- The arena is unchanged by their existence - every rule is read off the run's own tally after the
  step, and none of them feeds anything back into one.

## 0.8.4 — 2026-10-10
There is a codex now, and it fills itself in as you play.
- **`C` opens it**, from the title and from the death's card - the same two places the hangar lives,
  and one panel at a time: opening the codex closes the hangar and the other way round.
- **Thirty rows in three panels:** HOSTS - every body the arena sends, and every boss it schedules;
  CARD LINES - every card the table deals, in the card's own words; SYNERGIES - the cards that are
  not in any deck. A row is a name and one line about what the thing does: `SHIELDER - stands off and
  shields what stands near it`, `THE SENTINEL - turns, stops, and fires - and the way it stops is the
  tell`.
- **It remembers everything this save has met**, across visits: a body the moment a run has seen one
  arrive, a boss the moment you have stood in front of it - including the one that beat you - and a
  card the moment you have taken it. Nothing has to be found twice.
- **Undiscovered rows keep their place and give up their words**, so you can see how much of the
  arena you have not met and roughly where it sits: `UNKNOWN · NOT MET YET`, `NOT TAKEN YET`, `NOT
  FOUND YET`. The top of the panel says `MET 17 OF 30`, in the place the hangar prints its purse.
- **An ending tells you what you learned**: the card now says `· 15 NEW IN THE CODEX` when the run
  added rows, and the panel is already painted with them when you open it from that card.
- The game is unchanged by its existence - the codex is written when a run ends and never read back
  into one, so a run is not different because you have met things before.

## 0.8.3 — 2026-10-10
The hangar has something else to spend stardust on: permanent perks, bought a rank at a time.
- **Four perks, five ranks each, on a rising ladder.** `PLATING` is one more pip of hull per rank,
  `GLEANER` makes what a run leaves behind worth 10% more per rank, `REROLL` is one more time the
  table is dealt again, `BANISH` is one more card cut out of the run for good. The first rank of the
  cheapest is under two minutes of the arena; a whole ladder is an evening of it.
- **The keys after the ships' buy them:** `SHIFT + 6` through `SHIFT + 9`, in the hangar, where the
  price is on the glass like every other purchase. A plain 6-9 puts the hangar up instead, because a
  rank has nothing to *pick* - buy it once and it is on every run after.
- **A perk row says which rung the purse is on.** `RANK 1 OF 5 · +1 HULL PER RANK` and then what the
  next rung costs; a ladder walked out to the top keeps every word and stops asking for money.
- **The two racks are side by side now, and the panel is fitted to the window.** Nine rows in one
  column is taller than a short window is, and none of this screen scrolls, so the panel is measured
  and shrunk as one picture when it would not fit. Nothing is cut off at the bottom any more.
- Two of the plan's six candidate perks are deliberately not here: a starting shield (a pip you
  cannot spend, against hull you can) and a level of head start (a build somebody else played).

## 0.8.2 — 2026-10-10
The hangar has something to spend stardust on: four of the five ships now cost it.
- **Ships are bought, not just chosen.** The Wisp is free and always yours; the Bulwark costs 250
  stardust, the Volt 700, the Needle 1,300 and the Brood 2,200 - from about one run that went
  alright up to one run that beat the arena. What you buy is remembered, so the ships you paid for
  are waiting for you in the next visit too.
- **The rack says what it sells.** A ship you have not bought is dimmed and priced: `700 STARDUST
  · SHIFT + 3 BUYS IT`. Its hull, speed and dash stay printed, because those numbers are the reason
  anybody wants it.
- **SHIFT with the number buys it**, and only in the hangar, where the price is on the glass. A
  purse that is short is refused in silence and charged nothing; a ship you own is not for sale
  twice, and the free one never is.
- **A number for a ship you have not bought puts the hangar up** instead of doing nothing: the key
  that wants the ship is what takes you to the price of it. It works that way over your wreck as
  well; over the win it does nothing at all, because a number there means "fly this one, now" and
  that run is already flown.
- **One change worth saying out loud:** last release you could fly all five ships for nothing. Three
  of them are behind a price now. That is the plan's design arriving (PLAN 3.7), and it means the
  purse a run pays at last has something it is for - the next thing that will cost it is the
  permanent perks.

## 0.8.1 — 2026-10-10
A run pays stardust now, and there is a hangar to look at ships in.
- **Every run leaves something behind.** Stardust: 1 for each 100 of score, 100 for every fight
  the schedule sent that you brought down, and 500 for walking the whole schedule out. Both end
  cards say what the run paid and what your purse holds afterwards, and the purse is remembered
  between visits like the best score is. A run is paid once, whichever way it ended - including
  one you win, keep flying, and lose five minutes later.
- **H opens the hangar**: your purse, and the five ships with what each one actually is - hull,
  speed, how long its dash makes you wait, the gun it brings, and the Brood's free rank of
  Orbitals. Until now the five ships were one cramped line each on the title screen, and two
  ships could not be compared with each other at all.
- **A number key means the same thing everywhere.** Press 3 in the hangar, on the title or over
  your wreck and the next run flies the third ship; the answer is the line that names what you
  will fly. The death's card now has one of those lines, so pressing a number over a wreck is a
  key that answers instead of a key you have to trust.
- **The hangar keeps out of the way.** It goes over the title and over the death's card and over
  nothing else - not over a run in play, and not over the win, whose Space key means "keep flying
  this one" - and a click on it is never an accidental launch.

## 0.8.0 — 2026-10-10
The game remembers: one versioned save document, and the settings that live in it.
- **Your volume settings survive a reload.** `[ ]` and `- =` set the two buses, `M` shuts the
  master, and now where you left all three comes back next time you open the page. Until this
  release they lived for one visit and were forgotten by the refresh, because there was nowhere
  versioned to put them.
- **A game that comes back silent says so.** Come back to a tab you left muted and the mixer panel
  is up on the title screen saying MUTED — PRESS M TO HEAR IT AGAIN, instead of you standing in a
  quiet game wondering whether sound is broken. One line of consequence from remembering the mute:
  a remembered state nobody can see is a bug report.
- **One document, with a version on it.** Best score and settings live in one JSON document under
  `starfall.save`, with a schema naming every section and what kind of thing each field is. The
  best score keeps a mirror in the old plain key so the older releases on the menu still read it,
  and they get picked up from there the other way round too.
- **Nonsense in storage is a first visit, not a broken game.** Half-written JSON, somebody's own
  number typed into the console, a value of the wrong type: each field is checked on the way in
  and anything that fails is treated as never stored, so the game falls back to its shipped
  defaults and plays. The wreck is left where it is until the game has something of its own to
  remember — reading is never allowed to destroy — and a save that cannot be written at all (a
  private window, a full quota) is a run that simply is not remembered, not a run that ends badly.
- **A save from a newer build is left alone.** The menu serves every past version from one origin,
  so a document from the future is a real thing to find: this build reads the fields it knows and
  writes nothing at all, so playing an older release never trashes what a newer one saved.
- 25 new tests (1,368 in all) over the store itself and the three ways a browser can hand it
  something unexpected. The simulation is untouched: the same seed replays byte for byte.

## 0.7.4 — 2026-10-10
Two volume sliders, one mute above them, and a readout that says what the key you just pressed did.
- **The music and the sounds have their own sliders.** `[ ]` moves the music, `- =` the sounds — ten
  positions each, answered with a tick or a note and with the two rows painted on the glass for a
  moment and a half, because milestone 9 is where a settings page lives and a key that changes
  something invisible is a key that might not have been pressed. The top of either slider is
  exactly the mix the game shipped with, so a slider can only ever take loudness away: the
  headroom the effects are priced against and the ceiling the music is metered at stay measured.
- **A step is 2 dB and not a tenth of the gain.** Loudness is a ratio, so the slider is one: one
  exponential curve across a 20 dB span puts every press the same distance from the last, where a
  linear slider would spend half its presses on the loudest third of its own range. Zero is a hard
  zero — nothing on that bus — and a bus glides to wherever you put it over fifteen milliseconds,
  because a 2 dB jump under a pad that is mid-chord is a click out of the speakers.
- **A press is answered on the bus it changed.** The sounds slider ticks through the sounds bus —
  rising going up, falling coming down, the same two words every other tick in the interface is
  spoken in — and the music slider plays one note of the key through the music bus, so what you
  hear is the level you just set and not a beep about it. It is only played where there is music to
  sit under: on a death's card the bus is silent by choice and a note out of nowhere would be a
  lie. A slider already at the end of its travel is refused in silence and in ink, like every other
  refused press in the game.
- **The mute is still the one switch.** It hangs on the master above both buses, so it is the only
  value that goes quiet whatever is scheduled — music already queued half a second ahead, a slider
  at its top, all of it — and the music's muffle sits downstream of the music bus and is repriced
  by nothing. Mute also lights the readout now, and says MUTED while the master is shut, because
  that is the one thing a slider cannot describe.
- **The readout measures itself.** The mixer panel computes its whole layout in one function and is
  drawn over everything, cards included, and a test can ask whether the labels are out and the pips
  are in — which they were not when it was first written, arithmetic being the only thing that could
  have noticed. 1,343 tests, 21 of them new in `test/volume.test.mjs`, and the reference seed still
  traces byte for byte the same run: the sliders are a bus each and the simulation never learns.

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
