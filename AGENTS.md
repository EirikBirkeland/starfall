# Starfall: instructions for the agent

You are the sole developer of this game. Nobody is watching and nobody will answer questions.
You develop it autonomously, one improvement per session, across many sessions.

## Where things are

- `PLAN.md` is the full design and the milestone list. It is the source of truth for what to build.
- `NOTES.md` is your memory between sessions. You start every session with no recollection of the last one.
- `CHANGELOG.md` lists releases.
- The game is served as static files. The player opens `index.html` in a browser. There is no build step.

## Every session

1. Read `NOTES.md` (create it if missing), then the part of `PLAN.md` for the current milestone.
2. Run `git status` and `git log --oneline -15` to see where things stand.
3. Pick ONE thing: the next unchecked item of the current milestone, or a bug you find. Bugs come first.
4. Do it with small, targeted edits. Never rewrite a whole file to change part of it.
5. Verify it (see below). If verification fails, fix it or revert with `git checkout -- <file>`.
6. Tick the item in `PLAN.md` if it is truly done.
7. Commit: `git add -A && git commit -m "<what changed, in plain words>"`.
8. Append to `NOTES.md`: what you did, anything surprising, and what should come next.
9. Stop. The next session continues.

## Verifying

There is no browser here, so be strict with what you can check:

- `node --check <file>` on every JavaScript file you touched.
- `node --test` must pass once tests exist (milestone 1 sets them up).
- `node tools/simulate.js` must run a full headless game without throwing, once it exists.
- Re-read your diff with `git diff` before committing. Look for typos, undefined names, and broken imports.

Never commit code that fails these checks.

## Releases

Make a release whenever you feel the game has meaningfully improved since the last one:
a finished milestone, a clearly better feel, a batch of fixes. You decide. No permission needed.

Releases publish themselves. The owner has a menu page that lists every release and lets them pick
which version to play, so a release is how your work gets seen.

To release:

1. Commit your work so the tree is clean.
2. Pick the version: `0.<milestone>.<patch>`, for example `0.2.3`. The very first release is `0.0.1`.
3. Add an entry at the top of `CHANGELOG.md`: the version, the date, and a few plain lines on what is new.
4. Run `tools/release.sh <version> "<one line summary>"`.

The script runs the checks, copies the playable game into `releases/v<version>/`, adds it to
`releases/releases.json` (which the menu reads), commits, and tags. If it refuses, fix what it reports.
If the game starts loading files from a new top-level folder, add that folder to the copy list in the script.
Never edit or delete an existing folder under `releases/`: old versions must stay playable as they were.

## Quality bar

This is not a prototype and nothing here is rushed. There is no deadline. Days of work are expected.

- Take as many sessions as an item needs. A small thing done properly beats a big thing done roughly.
- No stubs, no placeholders, no "TODO: implement later", no half-working feature left reachable.
- Before building on a piece of code, read it. Do not guess what a function does.
- When something feels off (movement, timing, colours, a number), fix it now. Feel is the first pillar.
- Prefer clear code over clever code. Small functions with honest names. Future sessions have to read it cold.
- Leave every file you touch a little cleaner than you found it.
- If a session ends with the item unfinished, commit nothing broken: note the state in `NOTES.md` and
  continue next session.

## Hard rules

- Stay inside this folder. Do not touch anything outside it.
- No external libraries, no CDNs, no downloaded assets. Everything is code you write.
- Do not delete `PLAN.md`, `AGENTS.md`, `NOTES.md`, `CHANGELOG.md`, `releases/`, or `.git`.
- Never rewrite git history: no `reset --hard` on commits, no force anything, no amending old commits.
- Keep the game playable at every commit. A half-built feature stays behind a flag or unreachable until it works.
- If a plan item turns out to be a bad idea, say why in `NOTES.md`, mark it `[skipped]` in `PLAN.md`, and move on.
- Do not ask questions. Decide, write the decision in `NOTES.md`, and continue.
