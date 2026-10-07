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
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect: () => { counters.fills++; },
    fill: () => { counters.fills++; },
    stroke: () => { counters.strokes++; },
    fillText: () => { counters.texts++; },
    strokeText: () => { counters.texts++; },
    drawImage: (image, x, y, w, h) => {
      counters.images++;
      drawLog.images.push({ x: x, y: y, w: w, h: h });
    },
    translate: (x, y) => {
      counters.translates++;
      drawLog.translates.push({ x: x, y: y });
    },
    beginPath: noop, moveTo: noop, lineTo: noop, arc: noop, arcTo: noop,
    closePath: noop, save: noop, restore: noop, rotate: noop,
    scale: noop, setTransform: noop,
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

const ELEMENT_IDS = ['game', 'startScreen', 'overScreen', 'finalScore', 'finalBest', 'newBest', 'finalStats'];

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
  const drawLog = { translates: [], images: [], dashes: [] };
  const ctx = makeContextStub(counters, drawLog);
  const elements = {};
  for (const id of ELEMENT_IDS) {
    elements[id] = {
      id: id,
      width: 0,
      height: 0,
      style: {},
      textContent: '',
      classList: {
        _set: new Set(id === 'overScreen' ? ['screen', 'hidden'] : ['screen']),
        add(cls) { this._set.add(cls); },
        remove(cls) { this._set.delete(cls); },
        contains(cls) { return this._set.has(cls); },
      },
      getContext: () => ctx,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: width, height: height }),
    };
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
    /** The offscreen canvases the glow sprites are baked on. */
    createElement(tag) {
      bakes.canvases++;
      const spriteCtx = makeContextStub(bakes, { translates: [], images: [], dashes: [] });
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
    /** Every translate the last frame made, in the order the frame drew them. */
    translates() { return drawLog.translates.slice(); },
    /** Every sprite the last frame stamped, and where: { x, y, w, h }. */
    stamps() { return drawLog.images.slice(); },
    /** Where an arena point lands on the screen, now the arena is not the window. */
    screenOf: (x, y) => game.screenOf(x, y),
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
        newBestShown: !elements.newBest.classList.contains('hidden'),
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
