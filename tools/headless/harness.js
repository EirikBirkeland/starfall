// A headless browser: just enough window, document, canvas, audio, and
// requestAnimationFrame for the game to boot and play without a screen.
//
// Used by tools/simulate.js and by the tests. The canvas stub throws if the
// renderer asks for something it does not implement, which turns a typo in
// drawing code into a failing test instead of a silently black screen.
//
// The modules hold the world, so a process boots exactly one game. To play more
// than one run, call resetToTitle() between them.

import { pathToFileURL } from 'node:url';
import path from 'node:path';

/** A small deterministic generator, so a seeded run replays exactly. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGradient() {
  return { addColorStop() {} };
}

function makeContextStub(counters) {
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
    beginPath: noop, moveTo: noop, lineTo: noop, arc: noop, arcTo: noop,
    closePath: noop, save: noop, restore: noop, translate: noop, rotate: noop,
    scale: noop, setTransform: noop,
  };
  return new Proxy(target, {
    get(obj, key) {
      if (key in obj) return obj[key];
      if (key === 'toJSON') return undefined;   // so a stub can be console.log'ed
      throw new Error('the canvas stub has no member "' + String(key) + '"');
    },
    set(obj, key, value) {
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
 * Options: { root, seed, width, height, dpr, audio, storage }
 */
export async function bootGame(options) {
  const opts = options || {};
  const root = opts.root || process.cwd();
  const seed = opts.seed === undefined ? 1 : opts.seed;
  let width = opts.width || 1280;
  let height = opts.height || 720;

  const counters = { fills: 0, strokes: 0, texts: 0, gradients: 0 };
  const audioLog = { voices: 0 };
  const ctx = makeContextStub(counters);
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

  const savedRandom = Math.random;
  globalThis.window = windowObj;
  globalThis.document = { getElementById: (id) => elements[id] || null };
  globalThis.requestAnimationFrame = (handler) => { rafQueue.push(handler); return rafQueue.length; };
  if (seed !== null) Math.random = mulberry32(seed);

  const moduleUrl = (rel) => pathToFileURL(path.join(root, 'src', rel)).href;
  await import(moduleUrl('main.js'));

  const game = globalThis.window.STARFALL;
  if (!game) throw new Error('the game booted but did not expose window.STARFALL');

  const controller = {
    /** Run one animation frame, `ms` after the previous one. */
    step(ms) {
      clock += ms === undefined ? 16.7 : ms;
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
    pressMouse(x, y) {
      controller.fire('mousedown', { clientX: x, clientY: y, preventDefault() {} });
    },
    releaseMouse() {
      controller.fire('mouseup', {});
    },
    setViewport(w, h) {
      width = w;
      height = h;
      controller.fire('resize', {});
    },
    /** Draw counters, so a test can tell that something was actually painted. */
    drawCalls() { return Object.assign({}, counters); },
    stats() { return game.stats(); },
    get STATE() { return game.STATE; },
    get world() { return game.world; },
    get player() { return game.player; },
    get enemies() { return game.enemies; },
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
      resetRun(world);
      resetAmbient(world);
      world.state = STATE.START;
      world.overTimer = 0;
      if (nextSeed !== undefined) Math.random = mulberry32(nextSeed);
    },

    stop() {
      Math.random = savedRandom;
      rafQueue = [];
    },
  };

  return controller;
}
