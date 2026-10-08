// A headless browser: just enough window, document, canvas, audio, and
// requestAnimationFrame for the game to boot and play without a screen.
//
// Used by tools/simulate.js and by the tests. The canvas stub throws if the
// renderer asks for something it does not implement, which turns a typo in
// drawing code into a failing test instead of a silently black screen.
//
// The modules hold the world, so a process boots exactly one game. To play more
// than one run, call resetToTitle() between them.
//
// Seeding goes through core/rng.js, the same door the browser uses: the harness
// imports the game's own rng module and fixes it before booting main.js.

import { pathToFileURL } from 'node:url';
import path from 'node:path';

function makeGradient() {
  return { addColorStop() {} };
}

function makeContextStub(counters, drawLog) {
  const noop = () => {};
  // The canvas keeps a current transform; so does the stub, well enough to answer
  // where on the canvas a draw call actually landed. A draw call's own numbers are
  // in whatever coordinate system the code was writing in - the arena, the glass, a
  // rotated ship - and only the transform says what the player ends up seeing, so
  // this is how a test can tell one from the other (see `translates()` below).
  const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stack = [];
  let matrix = identity;
  const onward = (n) => {
    matrix = {
      a: matrix.a * n.a + matrix.c * n.b,
      b: matrix.b * n.a + matrix.d * n.b,
      c: matrix.a * n.c + matrix.c * n.d,
      d: matrix.b * n.c + matrix.d * n.d,
      e: matrix.a * n.e + matrix.c * n.f + matrix.e,
      f: matrix.b * n.e + matrix.d * n.f + matrix.f,
    };
  };
  /** Where a point of the current coordinate system lands on the canvas. */
  const onto = (x, y) => ({
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  });
  const target = {
    createLinearGradient: () => { counters.gradients++; return makeGradient(); },
    createRadialGradient: () => { counters.gradients++; return makeGradient(); },
    measureText: () => ({ width: 10 }),
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    shadowBlur: 0,
    shadowColor: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    // Part of the drawing state, like the dash pattern below. The ricochet card's icon
    // draws its shot as round-ended legs (render/cards.js) and the stub has to agree to
    // be told one.
    lineCap: 'butt',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect: () => { counters.fills++; },
    fill: () => { counters.fills++; },
    stroke: () => { counters.strokes++; drawLog.strokes.push(target.lineWidth); },
    fillText: (text) => { counters.texts++; drawLog.words.push(String(text)); },
    strokeText: (text) => { counters.texts++; drawLog.words.push(String(text)); },
    drawImage: (image, x, y, w, h) => {
      counters.images++;
      drawLog.images.push({ x: x, y: y, w: w, h: h, at: onto(x, y) });
    },
    translate: (x, y) => {
      counters.translates++;
      drawLog.translates.push({ x: x, y: y, at: onto(x, y) });
      onward({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });
    },
    rotate: (r) => onward({ a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: 0, f: 0 }),
    scale: (x, y) => onward({ a: x, b: 0, c: 0, d: y, e: 0, f: 0 }),
    setTransform: (a, b, c, d, e, f) => { matrix = { a: a, b: b, c: c, d: d, e: e, f: f }; },
    save: () => { stack.push(matrix); },
    restore: () => { if (stack.length > 0) matrix = stack.pop(); },
    beginPath: noop,
    // Path points are logged where they land, so a test can measure how big a drawn
    // shape actually is - the only way to tell a bigger shard from the same shard
    // drawn in a bigger colour when there is no pixel to look at.
    moveTo: (x, y) => { drawLog.points.push(onto(x, y)); },
    lineTo: (x, y) => { drawLog.points.push(onto(x, y)); },
    // The control point of a curve is not a point the pen goes near, so only the end
    // of the curve is logged. The sniper's eye is drawn with two of them
    // (render/entities.js) and the stub has to agree to be told one.
    quadraticCurveTo: (cx, cy, x, y) => { drawLog.points.push(onto(x, y)); },
    // Circles are logged too, radius and all: a ring is how the nova's front and a
    // shielder's field are drawn, and the only way to ask in here whether the picture is
    // the size the simulation says it is. The sweep is logged as well, because three of
    // the rings round the ship are meters drawn as a part of a circle (render/entities.js)
    // and a test cannot tell a quarter-filled meter from a whole one on the radius alone.
    arc: (x, y, r, from, to) => {
      drawLog.circles.push({ x: x, y: y, r: r, from: from, to: to, at: onto(x, y) });
    },
    arcTo: noop,
    closePath: noop,
    // A dash pattern is part of the drawing state, so it is saved and restored like a
    // colour. The bomber's death zone is dashed (render/entities.js) and the stub has
    // to at least agree to be told one.
    setLineDash: (dashes) => { counters.dashes++; drawLog.dashes.push(dashes); },
    lineDashOffset: 0,
  };
  return new Proxy(target, {
    get(obj, key) {
      if (key in obj) return obj[key];
      if (key === 'toJSON') return undefined;   // so a stub can be console.log'ed
      throw new Error('the canvas stub has no member "' + String(key) + '"');
    },
    set(obj, key, value) {
      // A frame that blurs is a frame doing the most expensive thing a canvas
      // can do, so tests can ask whether one happened (render/glow.js).
      if (key === 'shadowBlur' && value !== 0) counters.shadows++;
      obj[key] = value;
      return true;
    },
  });
}

function makeAudioContextStub(log) {
  const voice = () => ({
    type: '',
    frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    connect() {},
    start() {},
    stop() {},
  });
  return {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume() {},
    createGain() {
      log.voices++;
      return {
        gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
      };
    },
    createOscillator() { log.voices++; return voice(); },
  };
}

const ELEMENT_IDS = ['game', 'startScreen', 'overScreen', 'finalScore', 'finalBest', 'newBest', 'finalStats', 'finalBuild', 'weaponRow'];

/**
 * One element of the stub DOM. Enough of an element for the screens that are written in
 * the browser - a class list, text, and children - so a test can read what a screen is
 * actually showing rather than hope the code that wrote it was right.
 */
function makeElement(tag, classes) {
  const el = {
    tag: tag,
    width: 0,
    height: 0,
    style: {},
    textContent: '',
    children: [],
    classList: {
      _set: new Set(classes),
      add(cls) { this._set.add(cls); },
      remove(cls) { this._set.delete(cls); },
      // The DOM's two-form toggle: with a force it is a plain set-or-clear.
      toggle(cls, force) {
        const on = force === undefined ? !this._set.has(cls) : !!force;
        if (on) this._set.add(cls); else this._set.delete(cls);
        return on;
      },
      contains(cls) { return this._set.has(cls); },
    },
    appendChild(child) { this.children.push(child); return child; },
  };
  return el;
}

/**
 * Boot the game with no browser.
 *
 * Options: { root, seed, url, width, height, dpr, audio, storage }
 * `seed: null` leaves the game to choose its own, which is what a browser does.
 * Pass `url` (a query string such as '?seed=42') to exercise address-bar seeds.
 */
export async function bootGame(options) {
  const opts = options || {};
  const root = opts.root || process.cwd();
  const seed = opts.seed === undefined ? 1 : opts.seed;
  let width = opts.width || 1280;
  let height = opts.height || 720;

  const counters = { fills: 0, strokes: 0, texts: 0, gradients: 0, translates: 0, images: 0, shadows: 0, dashes: 0 };
  // Everything the glow sprites need is counted apart, so "this frame baked
  // nothing" is a thing a test can say (render/glow.js).
  const bakes = { fills: 0, strokes: 0, texts: 0, gradients: 0, translates: 0, images: 0, shadows: 0, dashes: 0, canvases: 0 };
  const audioLog = { voices: 0 };
  // Everything the last frame asked to be put on the canvas. The renderer paints
  // entities by translating to them, so this is how a test can see what was drawn
  // where - and the same trick works for the stamps, which is how the sky's
  // coverage can be checked (render/nebula.js).
  const drawLog = { translates: [], images: [], dashes: [], points: [], circles: [], words: [], strokes: [] };
  const ctx = makeContextStub(counters, drawLog);
  const elements = {};
  for (const id of ELEMENT_IDS) {
    elements[id] = makeElement('div', ['screen', id === 'overScreen' ? 'hidden' : ''].filter(Boolean));
    elements[id].id = id;
    elements[id].getContext = () => ctx;
    elements[id].getBoundingClientRect = () => ({ left: 0, top: 0, width: width, height: height });
  }

  const listeners = {};
  const store = Object.assign({}, opts.storage);
  let rafQueue = [];
  let clock = 0;
  let held = Object.create(null);

  const windowObj = {
    get innerWidth() { return width; },
    get innerHeight() { return height; },
    devicePixelRatio: opts.dpr === undefined ? 2 : opts.dpr,
    location: { search: opts.url || '' },
    addEventListener(type, handler) { (listeners[type] = listeners[type] || []).push(handler); },
    localStorage: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); },
    },
    requestAnimationFrame(handler) { rafQueue.push(handler); return rafQueue.length; },
  };
  if (opts.audio) {
    windowObj.AudioContext = function FakeAudioContext() { return makeAudioContextStub(audioLog); };
  }

  globalThis.window = windowObj;
  globalThis.document = {
    getElementById: (id) => elements[id] || null,
    /**
     * The offscreen canvases the glow sprites are baked on, and - for anything that is
     * not a canvas - a plain element a screen can build its own rows out of.
     */
    createElement(tag) {
      if (tag !== 'canvas') return makeElement(tag, []);
      bakes.canvases++;
      const spriteCtx = makeContextStub(bakes, { translates: [], images: [], dashes: [], points: [], circles: [], words: [] });
      return { tag: tag, width: 0, height: 0, style: {}, getContext: () => spriteCtx };
    },
  };
  globalThis.requestAnimationFrame = (handler) => { rafQueue.push(handler); return rafQueue.length; };

  const moduleUrl = (rel) => pathToFileURL(path.join(root, 'src', rel)).href;

  const rng = await import(moduleUrl('core/rng.js'));
  if (seed !== null) rng.setSeed(seed);
  await import(moduleUrl('main.js'));

  const game = globalThis.window.STARFALL;
  if (!game) throw new Error('the game booted but did not expose window.STARFALL');

  const controller = {
    /** Run one animation frame, `ms` after the previous one. */
    step(ms) {
      clock += ms === undefined ? 16.7 : ms;
      drawLog.translates.length = 0;
      drawLog.images.length = 0;
      drawLog.dashes.length = 0;
      drawLog.points.length = 0;
      drawLog.circles.length = 0;
      drawLog.words.length = 0;
      drawLog.strokes.length = 0;
      const queue = rafQueue;
      rafQueue = [];
      for (const handler of queue) handler(clock);
    },
    /** Send a browser event to window. */
    fire(type, event) {
      for (const handler of (listeners[type] || [])) handler(event || {});
    },
    /** Hold or release a key, skipping the no-change repeats. */
    key(code, down) {
      if (!!held[code] === !!down) return;
      held[code] = down;
      controller.fire(down ? 'keydown' : 'keyup', { code: code, preventDefault() {} });
    },
    moveMouse(x, y) {
      controller.fire('mousemove', { clientX: x, clientY: y, preventDefault() {} });
    },
    /** `button` is a DOM button number: 0 left (fire), 2 right (dash). */
    pressMouse(x, y, button) {
      controller.fire('mousedown', {
        clientX: x, clientY: y, button: button === undefined ? 0 : button, preventDefault() {},
      });
    },
    releaseMouse(button) {
      controller.fire('mouseup', { button: button === undefined ? 0 : button });
    },
    setViewport(w, h) {
      width = w;
      height = h;
      controller.fire('resize', {});
    },
    /** Draw counters, so a test can tell that something was actually painted. */
    drawCalls() { return Object.assign({}, counters); },
    /** What it took to bake the glow sprites: offscreen canvases and gradients. */
    bakeCalls() { return Object.assign({}, bakes); },
    /**
     * Every translate the last frame made, in the order the frame drew them: the
     * arguments it was given (`x`, `y`) and where that lands on the canvas once the
     * transforms around it are applied (`at`, in device pixels).
     */
    translates() { return drawLog.translates.slice(); },
    /** Every sprite the last frame stamped, and where: { x, y, w, h, at }. */
    stamps() { return drawLog.images.slice(); },
    /**
     * The line width of every stroke the last frame made, in order: the only way in here
     * to ask how wide something was drawn, which is how a test can check that a warning
     * is painted as wide as the harm it warns about (test/beam-art.test.mjs).
     */
    strokeWidths() { return drawLog.strokes.slice(); },
    /**
     * Every point of a path the last frame moved or drew a line to, in device pixels
     * after the transforms around it - which is how big a drawn shape is, measured.
     */
    points() { return drawLog.points.slice(); },
    /** Every circle the last frame asked for, with its radius, in arena coordinates. */
    circles() { return drawLog.circles.slice(); },
    /** Every string the last frame put on the canvas, in the order it put them there. */
    words() { return drawLog.words.slice(); },
    /** Where an arena point lands on the screen, now the arena is not the window. */
    screenOf: (x, y) => game.screenOf(x, y),
    /** Choose the primary this game flies, exactly as the title screen's keys do. */
    chooseWeapon: (id) => game.chooseWeapon(id),
    stats() { return game.stats(); },
    get STATE() { return game.STATE; },
    get world() { return game.world; },
    get player() { return game.player; },
    get enemies() { return game.enemies; },
    /** Where the window is looking, in arena coordinates (render/camera.js). */
    get camera() { return game.camera; },
    get screen() {
      return {
        startHidden: elements.startScreen.classList.contains('hidden'),
        overHidden: elements.overScreen.classList.contains('hidden'),
        finalScore: elements.finalScore.textContent,
        finalBest: elements.finalBest.textContent,
        stats: elements.finalStats.textContent,
        build: elements.finalBuild.textContent,
        newBestShown: !elements.newBest.classList.contains('hidden'),
        // The title's primaries, as the player reads them: one line each, and which one
        // is lit up (game/weapons.js is what they are built from).
        weapons: elements.weaponRow.children.map((row) => ({
          label: row.children.map((part) => part.textContent).join(' '),
          picked: row.classList.contains('picked'),
        })),
      };
    },
    get audio() { return audioLog; },
    get storage() { return store; },

    /** Put the game back on its title screen, ready for another run. */
    async resetToTitle(nextSeed) {
      const [{ world }, { resetRun }, { resetAmbient }, { STATE }] = await Promise.all([
        import(moduleUrl('game/world.js')),
        import(moduleUrl('game/run.js')),
        import(moduleUrl('game/ambient.js')),
        import(moduleUrl('game/state.js')),
      ]);
      controller.fire('blur', {});   // the game forgets every held key
      held = Object.create(null);
      // A second run is played on a page that already ran thousands of frames,
      // which a real player never does: the simulation's step clock would start
      // mid-cycle and the same seed would land a step or two out. Reload the clock.
      game.resetClock();
      resetRun(world);
      resetAmbient(world);
      // A fresh page's camera has never looked anywhere else, so a second run on
      // one boot has to say the same thing - after the ship has been put back.
      game.resetCamera();
      // Nor has its edge ever had an arrow fading out over it.
      game.resetIndicators();
      world.state = STATE.START;
      world.overTimer = 0;
      // startRun() reseeds from world.seed, so this is all it takes to set the
      // next run up for a replay.
      if (nextSeed !== undefined) world.seed = nextSeed >>> 0;
    },

    stop() {
      rafQueue = [];
    },
  };

  return controller;
}
