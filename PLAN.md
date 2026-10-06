# Game: Starfall

Build a complete, polished browser game in ONE file: `/work/game/index.html`.
No libraries, no build step, no external assets. Plain HTML + CSS + JavaScript on a `<canvas>`.

## The game
A top-down arena survival shooter.
- The player is a small glowing ship. Move with WASD or arrow keys. Aim with the mouse. Hold left mouse to shoot.
- Enemies drift in from the screen edges and chase the player. Three kinds: slow chasers, fast darters, big tanks that split in two when killed.
- Enemies drop glowing shards. Collecting shards fills an XP bar; every level-up raises fire rate a little.
- Difficulty ramps up steadily with time.
- The player has 3 lives, with a short invulnerability blink after being hit.
- Game over screen shows score and best score (kept in localStorage). Press Space or click to restart.
- Start screen with the title and the controls.

## The look
- Dark deep-blue background with a slow parallax starfield.
- Neon palette, everything drawn with canvas shapes and glow (shadowBlur).
- Particle bursts on every kill, screen shake on player hit, bullet trails.
- Clean HUD: score top-left, lives top-right, XP bar along the bottom.
- Canvas fills the whole window and handles resize.

## Rules for you
- Write the entire game to `/work/game/index.html` with the write tool.
- Use requestAnimationFrame with delta time so speed is the same on any refresh rate.
- When done, check the file for syntax errors with: `node --check` on the extracted script, and fix anything it reports.
- Do not ask questions. Finish the game.
