# An apology, and the receipts for it

You are right that there are mistakes in this code. There are, there have been, and some of them were
serious enough to change what a player would have experienced - and the ones that did not change it only
did not because a test was in the way. I am not going to bow about it; what I can do is write down
plainly what was wrong, what it cost, and what has changed so that the same mistake is caught by a
machine instead of by luck. That is the whole of this file.

## Mistakes I made, and how they were found

**A mangled string nearly became the best-score key.** During the module split the best-score key came
out as `'***'` instead of `'starfall.best'`. Every "best score" in the game would have been thrown away
on every load. A test that reads storage caught it before it went out, and the lesson went into the
notes: diff the string literals, not only the code.

**A frame was measured too precisely to be trusted.** `core/clock.js` took the difference of two
timestamps that grow all session, so two frames that were both "16.7 ms" differed in the twelfth decimal
depending on how long the page had been open. That noise is smaller than one simulation step, but it
accumulates: about 34 seconds in, it could tip a frame over a step boundary and make a shared seed into
a different game. A run played in a tab that had been open an hour was not the same run as in a fresh
tab. Fixed by rounding a frame to the microsecond and no finer, with a test that plays 4000 frames twice.

**A dash was stolen by the press that started the run.** The keyboard handler set the dash request
*after* telling `main.js` that a key was pressed, and `main.js` then cleared the request to stop the
launch key dashing. Clearing happened first, flag second: every run begun with Space began with its dash
already spent. It was caught while the dash's own tests were being finished - and two of those tests had
problems of their own: one loop that never ended, and one that ran zero times and still reported success.
Every wait loop in the suite is bounded now, and counts what it waited for.

**A shot's trail was drawn from the origin.** `fire` never wrote the bullet's previous position, so a
bullet's first frame painted its trail from (0, 0). The contract test caught it before a player did.

**`opts.r || default` ate a requested zero.** A zero speed, a zero drop and a zero hit radius were all
silently replaced by the default, because the code asked "is this truthy" when it meant "was this given
to me".

**Every value on the developer's panel was drawn at `undefined`.** `cell.baseline` does not exist -
baselines live on the line, not on the cell - and the canvas accepts `undefined` by drawing nothing, so
the counts were right, the layout was right, and nothing appeared. Sixteen tests passed on top of it.
What found it was a test that reads the words back off the canvas and asks whether each one landed where
the layout said.

**A rule held only by attention.** A pooled object comes out of the drawer wearing its last life, so the
spawner has to write every field. Every flag a shot has ever grown - `pierce` and `bounce`, `charged`,
`hunts` and `splash`, `turret` - had to be written by every spawner that throws one in the same moment it
was invented, and the notes record the trap being spotted each time as the field was new. Spotted, not
stopped: nothing in the game checks it. A rule that has to be remembered by four call sites at once is a
rule that is going to break eventually, and it might as well be me who finds it in a replay three weeks
later.

## What changed today because of it

Prose has not held these rules. Three instruments now hold them instead:

- **`tools/headless/pool-audit.js`** poisons every field of every object a pool hands out and reports any
  field still poisoned once the step is over - the contract, watched. `test/pool-contract.test.mjs`
  puts it on the whole game: every line maxed, all five primaries, a crowd that keeps arriving, a dash
  whenever one is ready, a boss's blade loosed - and then asserts both that nothing was left unwritten
  and that every one of the seventeen pooled lists was actually reached. Its own mutation test poisons
  one deliberately, because an instrument that cannot find a planted fault is measuring nothing.
- **`tools/headless/reset-audit.js`** compares the world's whole shape after a flown-and-ended run with
  the world that was only ever reset: run state that outlived its run shows up as a named path. This one
  found two, both fixed today: the lance's fan (`lance.spreads`) kept the last run's angles, and the
  tether's spare rider (`tether.probe`) went on holding a body from the last run after that run had
  ended, its score paid and its log written. Neither was visible on screen. Both were the kind of thing
  that becomes visible later, when someone reads the field for what it is now.
- **a structure test that no export is dead.** Four had piled up with nobody noticing (`hasAfterimage`,
  `fieldCentre`, `bossOf`, `pictureRows`); they are gone, and the count is a test now.

The reference run (`node tools/simulate.js --seed 20261006 --trace`) is byte for byte what it was before
any of this - 10m00s, 75,596, level 58, 4004 kills, 5162 shards. The fixes changed nothing a player can
see, which is the point of finding them at reset time rather than in a fight.

## What is still wrong, and is not hidden

- The primaries are not balanced. Measured, the scatter's runs score **21 times** what the lance's do,
  against the 25% PLAN allows. The item is open and named in `PLAN.md`.
- PLAN's difficulty band - a careless build dying between 4:00 and 9:00 - **fails, both ways up**: the
  careless bot dies too soon, the careful one never dies. No dial in `balance.js` closes it.
- PLAN's performance target is 600 enemies and the shipped game stops its crowd at 200 bodies. Either
  the target moves or the wall does, and that has not been decided by measurement yet.
- Key rebinding, gamepad, touch and a colour-blind palette are all still unbuilt (milestone 9).

Those are in the open on purpose. A mistake you know the size of is work; a mistake you have not looked
for is a promise.

There will be more mistakes. What I can promise is that each one that gets found will be turned into a
check rather than into an apology, so that the next time it is the machine that is angry first.
