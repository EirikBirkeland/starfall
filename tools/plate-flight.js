#!/usr/bin/env node
// Read the F3 plate off a real browser, at the three loads the performance pass is about.
//
//   node tools/plate-flight.js --load endless
//   node tools/plate-flight.js --load thick
//   node tools/plate-flight.js --load brood
//   node tools/plate-flight.js --load endless --gpu --shot .scratch/plate-endless.png
//   node tools/plate-flight.js --load thick --json
//
// **What this reads.** The game's own developer panel (render/debug.js) is told what every real
// frame cost by src/main.js: `step ms` is the time spent in the simulation's fixed steps, and
// `draw ms` is the time spent issuing the canvas work. `frameCosts()` answers the mean and the
// worst of the last two seconds, which is the same pair of numbers the plate prints. This tool
// drives the page's real frame loop by hand - each call is a real `frame()` with a synthetic
// timestamp - and leaves `performance.now` alone, so both numbers are real milliseconds.
//
// **What it cannot read.** `draw ms` is the *main thread issuing* the canvas work, not what a GPU
// spends rasterising it. On a box with no display this Chromium is forced through SwiftShader, so
// the software rasteriser is what actually paints the glass, on the same CPU as V8; the `step ms`
// it reads is therefore real V8 competing with a software rasteriser, and the wall column is
// software rasterisation and says nothing about a laptop's GPU. `--gpu` leaves Chromium to its own
// device, which is how the owner's machine should be read. Do not move `endless.growth.bodiesCeil`
// on a number read here without knowing which of the two a run was.
//
// **How the loads are reached.** The clock is put where the load stands rather than played out to
// it, because the thing being measured is what a frame costs with that crowd on the glass and not
// how long it took the crowd to arrive:
//
//   endless  a run won through the game's own door (game/run.js `winRun`), handed its arena back
//            (`continueRun`), then put nine minutes past the hand-back so `bodyCeiling` is the 200
//            wall. The director fills the crowd for real.
//   thick    a run under THICK CROWD, at the end of the schedule, where the body wall is 150.
//   brood    three clumps of fourteen swarmlings with their packs on, planted the way
//            tools/perf-probe.js plants them.
//
// The last two need a word. THICK CROWD's director stands about 120 bodies in a still run - the
// wall is 150, the *budget* is what runs out first, and snipers then cut the crowd with their own
// beams - so the last of the wall is planted from the game's own makeEnemy to read the load the
// wall allows. The brood is planted for the same reason tools/perf-probe.js plants it. Both say
// how many bodies were planted over the measured window, and a run that needed none says 0.
//
// A run that ends, a page error, or a load that never reaches its wall is a failure: exit 1.

import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DEFAULT_CHROMIUM = "/usr/bin/chromium";
const DEFAULT_HOST = "http://localhost:8090";
const DEFAULT_SEED = 20261006;
const DEFAULT_VIEW = { width: 1280, height: 720 };
// frameCosts() averages the last two seconds; the measurement window covers it and a little more.
const MEASURE_FRAMES = 180;
const FRAME_MS = 16.7;

const LOADS = ["endless", "thick", "brood"];

function readArgs(argv) {
  const opts = {
    load: "endless",
    host: DEFAULT_HOST,
    chromium: DEFAULT_CHROMIUM,
    seed: DEFAULT_SEED,
    width: DEFAULT_VIEW.width,
    height: DEFAULT_VIEW.height,
    gpu: false,
    json: false,
    shot: null,
    fillSeconds: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(arg + " wants a value");
      return value;
    };
    if (arg === "--load") opts.load = next();
    else if (arg === "--host") opts.host = next().replace(/\/+$/, "");
    else if (arg === "--chromium") opts.chromium = next();
    else if (arg === "--seed") opts.seed = parseInt(next(), 10);
    else if (arg === "--width") opts.width = parseInt(next(), 10);
    else if (arg === "--height") opts.height = parseInt(next(), 10);
    else if (arg === "--fill-seconds") opts.fillSeconds = parseFloat(next());
    else if (arg === "--shot") opts.shot = next();
    else if (arg === "--gpu") opts.gpu = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("usage: node tools/plate-flight.js [--load endless|thick|brood] [--gpu] [--shot file]");
      process.exit(0);
    } else {
      throw new Error("no option is called " + arg + "; try --help");
    }
  }
  if (!LOADS.includes(opts.load)) {
    throw new Error("no load is called " + opts.load + "; try " + LOADS.join(", "));
  }
  if (!Number.isInteger(opts.seed) || opts.seed < 0) throw new Error("--seed wants a whole number");
  if (!Number.isInteger(opts.width) || opts.width < 320) throw new Error("--width wants at least 320");
  if (!Number.isInteger(opts.height) || opts.height < 240) throw new Error("--height wants at least 240");
  if (opts.fillSeconds === null) opts.fillSeconds = opts.load === "endless" ? 45 : 25;
  if (!(opts.fillSeconds > 0) || !Number.isFinite(opts.fillSeconds)) {
    throw new Error("--fill-seconds wants a positive number");
  }
  return opts;
}

/** Where the game is served: this folder is one directory under the host's document root. */
function gameUrl(opts) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const folder = path.basename(path.resolve(here, ".."));
  return opts.host + "/" + folder + "/?seed=" + opts.seed;
}

function chromiumArgs(opts) {
  const args = ["--no-sandbox", "--disable-dev-shm-usage", "--ignore-gpu-blocklist"];
  if (!opts.gpu) {
    args.push("--use-angle=swiftshader", "--enable-unsafe-swiftshader");
  }
  return args;
}

/**
 * The browser half of the tool: a page whose frame loop is handed out one frame at a time.
 *
 * Everything in here runs in the page. It is installed before the game boots, so the first
 * `requestAnimationFrame` the game asks for is captured rather than shown. `performance.now` is
 * untouched: only the timestamp the frame thinks it arrived at is synthetic.
 */
function installDriver() {
  const queue = [];
  window.requestAnimationFrame = (callback) => {
    queue.push(callback);
    return queue.length;
  };
  window.__queue = queue;
  window.__clock = 0;

  window.__frame = function () {
    window.__clock += 16.7;
    const callbacks = queue.splice(0, queue.length);
    for (const callback of callbacks) callback(window.__clock);
  };

  const held = Object.create(null);
  function key(code, down) {
    if (!!held[code] === !!down) return;
    held[code] = down;
    window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", {
      code: code, key: "", bubbles: true, cancelable: true,
    }));
  }
  window.__tap = (code) => { key(code, true); key(code, false); };

  window.__dispatch = function (type, event) {
    window.dispatchEvent(new MouseEvent(type, Object.assign({ bubbles: true, cancelable: true }, event)));
  };

  // The game's modules under whichever path the page was served from, so a renamed folder works.
  window.__mod = (rel) => import(new URL(rel, window.location.href).href);

  /** One frame that is a frame: the hull is held, cards are answered, and the clock turns once. */
  window.__tick = async function (n) {
    for (let i = 0; i < n; i++) {
      const game = window.STARFALL;
      const world = game.world;
      if (world.state === game.STATE.PLAY && game.player.hull < game.player.maxHull) {
        game.player.hull = game.player.maxHull;
      }
      if (world.state === game.STATE.LEVEL) window.__pickCard();
      window.__frame();
      // A full task between frames, so the compositor gets its turn: a synchronous burst of
      // frames piles up unpainted canvas work and measures backpressure, not the game.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };

  /** Answer a level-up the way the careful bot does, by its number key. */
  window.__pickCard = function () {
    const game = window.STARFALL;
    const offer = game.world.offer;
    if (!offer || offer.length === 0) return;
    const ranks = game.world.upgrades;
    const appetite = ["damage", "split", "ricochet", "pierce", "fireRate", "bulletSpeed", "orbitals", "nova"];
    let best = offer[0];
    for (const id of offer) {
      if (ranks[id] > ranks[best]) continue;
      if (ranks[id] < ranks[best]) { best = id; continue; }
      const a = appetite.indexOf(id);
      const b = appetite.indexOf(best);
      if ((a === -1 ? appetite.length : a) < (b === -1 ? appetite.length : b)) best = id;
    }
    window.__tap("Digit" + (offer.indexOf(best) + 1));
  };

  /** Launch a run from the title screen. The press that starts it also holds the trigger. */
  window.__launch = function () {
    window.STARFALL.resetClock();
    window.__frame();
    window.__frame();
    window.__dispatch("mousedown", { clientX: 640, clientY: 360, button: 0 });
    window.__frame();
    window.__frame();
    return window.STARFALL.stats().state;
  };

  /** Let go of the trigger: the crowd is what is being priced, not the gun clearing it. */
  window.__release = function () {
    window.__dispatch("mouseup", { button: 0 });
  };

  /**
   * Make the run a stable stand for a frame measurement: no boss schedule, no level-ups, no
   * death, and the trigger released. Everything else is the game as it ships.
   */
  window.__still = async function (elapsed) {
    const game = window.STARFALL;
    const world = game.world;
    const { BALANCE } = await window.__mod("src/game/balance.js");
    world.elapsed = elapsed;
    world.bossIndex = BALANCE.bosses.schedule.length;
    world.boss = null;
    world.xpNeed = Infinity;
    world.player.invuln = Infinity;
    window.__release();
    return { state: world.state, elapsed: world.elapsed };
  };

  /** Stand a crowd on the glass the way tools/perf-probe.js plants one, for a held wall. */
  window.__plant = async function (count) {
    const game = window.STARFALL;
    const world = game.world;
    const { makeEnemy } = await window.__mod("src/game/kinds.js");
    const kinds = ["drifter", "weaver", "darter", "spitter", "tank", "swarmling", "bomber", "shielder"];
    const ship = world.player;
    let seed = 987654321;
    const spin = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < count; i++) {
      const x = ship.x + (spin() - 0.5) * 1100;
      const y = ship.y + (spin() - 0.5) * 620;
      world.enemies.push(makeEnemy(world, kinds[i % kinds.length], x, y, { hp: 1e9 }));
    }
    return world.enemies.length;
  };

  /** The brood: three clumps of the flock, painted over one whole turn of its own clock. */
  window.__plantBrood = async function () {
    const game = window.STARFALL;
    const world = game.world;
    const { BALANCE } = await window.__mod("src/game/balance.js");
    const { makeEnemy } = await window.__mod("src/game/kinds.js");
    const { newPack } = await window.__mod("src/game/flock.js");
    const spec = BALANCE.kinds.swarmling.flock;
    const clump = BALANCE.kinds.swarmling.pack.clump;
    const clumps = 3;
    const each = Math.round((BALANCE.kinds.swarmling.pack.min + BALANCE.kinds.swarmling.pack.into) / 2);
    world.enemies.length = 0;
    world.flocks.length = 0;
    world.spawnTimer = Infinity;
    let seed = 424242;
    const spin = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const ship = world.player;
    for (let c = 0; c < clumps; c++) {
      const bearing = (c / clumps) * Math.PI * 2 + 0.7;
      const off = 320 + spin() * 180;
      const x = ship.x + Math.cos(bearing) * off;
      const y = ship.y + Math.sin(bearing) * off * 0.7;
      const pack = newPack(spec, x, y);
      pack.timer = spec.gather * (1 - (c + 1) / (clumps + 1));
      world.flocks.push(pack);
      for (let i = 0; i < each; i++) {
        const angle = (i / each) * Math.PI * 2;
        const radius = clump * 0.5 * (0.35 + spin() * 0.65);
        world.enemies.push(makeEnemy(world, "swarmling", x + Math.cos(angle) * radius,
          y + Math.sin(angle) * radius, { hp: 1e9, flock: pack }));
      }
    }
    return { clumps: clumps, each: each, bodies: world.enemies.length };
  };

  /** One frame with the body wall held at `target`; plants whatever died since the last frame. */
  window.__heldTick = async function (n, target) {
    let planted = 0;
    for (let i = 0; i < n; i++) {
      const game = window.STARFALL;
      const world = game.world;
      if (world.state === game.STATE.PLAY && game.player.hull < game.player.maxHull) {
        game.player.hull = game.player.maxHull;
      }
      if (world.enemies.length < target) {
        const missing = target - world.enemies.length;
        planted += missing;
        await window.__plant(missing);
      }
      window.__frame();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return planted;
  };

  window.__costs = async function () {
    return (await window.__mod("src/render/debug.js")).frameCosts();
  };

  window.__state = async function () {
    const game = window.STARFALL;
    const stats = game.stats();
    const { bodyCeiling } = await window.__mod("src/game/waves.js");
    return {
      state: stats.state,
      playing: stats.state === game.STATE.PLAY,
      t: Math.round(stats.t),
      endless: stats.endless,
      endlessPast: Math.round(stats.endlessPast),
      challenge: stats.challenge,
      bodies: stats.enemies,
      ceiling: Math.round(bodyCeiling(game.world)),
      flocks: game.world.flocks.length,
      bullets: stats.bullets,
      shots: stats.shots,
      sparks: stats.parts,
      shards: stats.shards,
      score: stats.score,
      level: stats.level,
    };
  };
}

/** Run `n` game seconds of fill in half-second pieces, stopping when the wall is reached. */
async function fill(page, target, seconds) {
  const limit = Math.ceil(seconds * 1000 / FRAME_MS);
  const step = 30;
  let frames = 0;
  let last = null;
  while (frames < limit) {
    await page.evaluate((n) => window.__tick(n), step);
    frames += step;
    last = await page.evaluate(() => window.__state());
    if (last.bodies >= target) break;
  }
  return { state: last, frames: frames };
}

/** The endless door: win through the game's own ending, take the arena back, and move the clock. */
async function openEndless(page) {
  await page.evaluate(async () => {
    const game = window.STARFALL;
    const world = game.world;
    const run = await window.__mod("src/game/run.js");
    world.elapsed = 900;
    const { BALANCE } = await window.__mod("src/game/balance.js");
    world.bossIndex = BALANCE.bosses.schedule.length;
    run.winRun(world);
    world.overTimer = 100;
    if (!run.continueRun(world)) throw new Error("the endless door refused the hand-back");
    await window.__still(world.endlessAt + 9 * 60);
  });
}

/** THICK CROWD at the end of the schedule, where its own body wall is 150. */
async function openThick(page) {
  await page.evaluate(async () => {
    window.STARFALL.chooseChallenge("thick");
    if (window.__launch() !== window.STARFALL.STATE.PLAY) throw new Error("the run never launched");
    await window.__still(1000);
  });
}

async function openLoad(page, load) {
  if (load === "endless") {
    if (await page.evaluate(() => window.__launch()) !== 1) throw new Error("the run never launched");
    await openEndless(page);
  } else if (load === "thick") {
    await openThick(page);
  } else {
    if (await page.evaluate(() => window.__launch()) !== 1) throw new Error("the run never launched");
    await page.evaluate(async () => { await window.__still(0); });
    const planted = await page.evaluate(() => window.__plantBrood());
    return { planted: planted, target: planted.bodies };
  }
  const state = await page.evaluate(() => window.__state());
  return { planted: null, target: state.ceiling };
}

/** Read the plate at the load: fill, then hold the wall for two seconds and read the numbers. */
async function measure(page, opts, load) {
  const opened = await openLoad(page, load);
  const target = opened.target;
  let fillResult = null;
  let planted = 0;
  let wallMs = 0;

  if (load === "brood") {
    // One whole turn of the flock's clock, so the tells are on the glass for part of the window.
    const { BROOD_WINDOW } = await page.evaluate(async () => {
      const { BALANCE } = await window.__mod("src/game/balance.js");
      return { BROOD_WINDOW: Math.ceil(BALANCE.kinds.swarmling.flock.gather
        + BALANCE.kinds.swarmling.flock.brace + BALANCE.kinds.swarmling.flock.dive.time) };
    });
    await page.evaluate((s) => window.__tick(Math.ceil(s * 1000 / 16.7)), BROOD_WINDOW);
    const wallStart = Date.now();
    planted = await page.evaluate(({ n, target }) => window.__heldTick(n, target),
      { n: MEASURE_FRAMES, target: target });
    wallMs = Date.now() - wallStart;
  } else {
    fillResult = await fill(page, target, opts.fillSeconds);
    const wallStart = Date.now();
    planted = await page.evaluate(({ n, target }) => window.__heldTick(n, target),
      { n: MEASURE_FRAMES, target: target });
    wallMs = Date.now() - wallStart;
  }

  const costs = await page.evaluate(() => window.__costs());
  const state = await page.evaluate(() => window.__state());
  if (!state.playing) throw new Error("the run left PLAY (state " + state.state + ")");
  // A planted scene is the load it was planted as; a ceiling is a wall the run must stand at.
  if (load !== "brood" && state.bodies < state.ceiling) {
    throw new Error("the load stood at " + state.bodies + " / " + state.ceiling + " - the wall was never reached");
  }
  return {
    load: load,
    bodies: state.bodies + " / " + state.ceiling,
    flocks: state.flocks,
    bullets: state.bullets,
    shots: state.shots,
    sparks: state.sparks,
    shards: state.shards,
    planted: planted,
    fillSeconds: fillResult === null ? null : +(fillResult.frames * FRAME_MS / 1000).toFixed(1),
    stepAvg: +costs.stepAvg.toFixed(3),
    stepWorst: +costs.stepWorst.toFixed(3),
    drawAvg: +costs.drawAvg.toFixed(3),
    drawWorst: +costs.drawWorst.toFixed(3),
    frames: costs.frames,
    wallFrameMs: +(wallMs / MEASURE_FRAMES).toFixed(1),
  };
}

async function main() {
  const opts = readArgs(process.argv);
  const url = gameUrl(opts);
  const browser = await chromium.launch({
    executablePath: opts.chromium,
    args: chromiumArgs(opts),
  });
  const page = await browser.newPage({ viewport: { width: opts.width, height: opts.height } });
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push("console: " + message.text());
  });
  page.on("pageerror", (error) => problems.push("page: " + error.message));
  try {
    await page.addInitScript(installDriver);
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.STARFALL && window.__queue.length > 0, { timeout: 20000 });
    await page.keyboard.press("F3");
    const row = await measure(page, opts, opts.load);
    if (problems.length > 0) throw new Error(problems.join("; "));
    if (opts.shot !== null) {
      await page.screenshot({ path: opts.shot, timeout: 180000 });
    }
    if (opts.json) {
      console.log(JSON.stringify(row));
    } else {
      console.log("plate flight: " + opts.load + (opts.gpu ? " (gpu)" : " (swiftshader - software raster)"));
      console.log("  bodies/ceiling  " + row.bodies + "   packs " + row.flocks
        + "   bullets " + row.bullets + "   shots " + row.shots + "   sparks " + row.sparks);
      console.log("  step ms  avg/worst  " + row.stepAvg + " / " + row.stepWorst);
      console.log("  draw ms  avg/worst  " + row.drawAvg + " / " + row.drawWorst);
      console.log("  wall frame ms       " + row.wallFrameMs
        + (opts.gpu ? "" : "   (software rasterisation - not a GPU number)"));
      console.log("  planted over the window  " + row.planted
        + (row.fillSeconds === null ? "" : "   filled for " + row.fillSeconds + " s"));
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("plate-flight: " + error.message);
  process.exit(1);
});
