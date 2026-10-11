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

import { SHIPS } from '../../src/game/ships.js';
import { BALANCE } from '../../src/game/balance.js';
import { priceOf } from '../../src/game/hangar.js';
import { maxRankOf, PERKS } from '../../src/game/perks.js';

/**
 * The ids of every ship the hangar sells (game/hangar.js), for a test that wants the whole rack
 * without earning it: a file about which key picks which ship is not a file about money, and does
 * not have to buy its way through five ships to press a number key. Pass it as the `hangar.ships`
 * of a `bootGame({ storage })` document.
 */
export function everyShipBought() {
  const bought = [];
  for (const ship of SHIPS) {
    if (priceOf(ship.id) > 0) bought.push(ship.id);
  }
  return bought;
}

/**
 * Every perk at the top of its ladder, for the same reason (game/perks.js): a file about what a
 * rank *does* should not have to buy four ranks of it first, and a file about the *top* of one
 * should not be writing the ladder's length out by hand. Pass it as the `hangar.perks` of a
 * `bootGame({ storage })` document.
 */
export function everyPerkBought() {
  const bought = {};
  for (const perk of PERKS) bought[perk.id] = maxRankOf(perk.id);
  return bought;
}

/** The whole price of one perk's ladder, in stardust (BALANCE.perks). A test that wants to be able
    to buy a rank and then be refused the next one needs the two numbers the shop uses. */
export function perkLadderCost(id) {
  let total = 0;
  for (const price of BALANCE.perks[id].cost) total += price;
  return total;
}

function makeGradient() {
  return { addColorStop() {} };
}

/**
 * How wide a character is, as a share of the font size. A real canvas knows the letterforms; this
 * knows that a Latin sentence in a normal UI face runs about this much per character, which is a
 * touch on the generous side of the real number for a bold face - and generous is the direction
 * that matters, because text that fits inside this estimate fits inside a browser. It exists so
 * that `measureText` answers with something the size of the word and the size of the font, which
 * is the only way a test can catch words that walk off the box they were drawn in (render/fit.js).
 */
const TEXT_ADVANCE = 0.56;

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
  /** The point size in the ctx's current font string, which is what says how wide a word is. */
  const fontSize = () => {
    const found = /(\d+(?:\.\d+)?)px/.exec(String(target.font));
    return found === null ? 12 : Number(found[1]);
  };
  const textWidth = (text) => fontSize() * TEXT_ADVANCE * String(text).length;
  const logText = (text, x, y, stroke) => {
    if (drawLog.texts === undefined) return;
    drawLog.texts.push({
      text: String(text),
      x: x,
      y: y,
      w: textWidth(text),
      size: fontSize(),
      align: target.textAlign,
      // `haloText` strokes a word and then fills it, so every haloed word on the card rack is in
      // here twice. A test that counts words asks for the filled ones.
      stroke: stroke,
    });
  };
  const target = {
    createLinearGradient: () => { counters.gradients++; return makeGradient(); },
    createRadialGradient: () => { counters.gradients++; return makeGradient(); },
    measureText: (text) => ({ width: textWidth(text) }),
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
    fillRect: (x, y, w, h) => {
      counters.fills++;
      // The rectangle itself, for the same reason the stamps and circles are logged: the only way to
      // ask whether a covering pass covered the thing it was laid on (render/darkness.js).
      drawLog.rects.push({ x: x, y: y, w: w, h: h, at: onto(x, y) });
    },
    fill: () => { counters.fills++; },
    stroke: () => { counters.strokes++; drawLog.strokes.push(target.lineWidth); },
    fillText: (text, x, y) => {
      counters.texts++;
      drawLog.words.push(String(text));
      logText(text, x, y, false);
    },
    strokeText: (text, x, y) => {
      counters.texts++;
      drawLog.words.push(String(text));
      logText(text, x, y, true);
    },
    drawImage: (image, x, y, w, h) => {
      counters.images++;
      // The composite is logged here as well as on a circle, because the only way to tell a sheet
      // laid *over* the world from one added to it is the composite it was laid with - which is the
      // whole difference between a night and a glow (render/darkness.js).
      drawLog.images.push({ x: x, y: y, w: w, h: h, at: onto(x, y), mode: target.globalCompositeOperation });
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
      // The composite it was asked for is logged as well, because that is the only way to tell a body
      // that *covers* the sky from one that adds to it: there is no pixel here to look at, and the
      // arena is painted additively (render/renderer.js), so a dark body is only a hole if it said so.
      drawLog.circles.push({
        x: x, y: y, r: r, from: from, to: to, at: onto(x, y),
        mode: target.globalCompositeOperation,
      });
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

/**
 * The audio device, as far as the game is concerned.
 *
 * `now` is the frame clock, in seconds: a voice is scheduled on the audio clock and the
 * audio clock has to move with the frames, or a test that asks "is the sky still full of
 * that voice?" gets the same answer for ever. Everything the synthesiser needs is here;
 * a machine that has none of the optional parts - no compressor, no filters, no buffers - is
 * `audio: 'raw'`, which is how a test can ask what the engine and the noise voice do when
 * the browser is old (audio/engine.js, audio/noise.js).
 *
 * Every AudioParam the game *sweeps* logs what it was asked to do, into `log.ramps` - the
 * envelopes are left out, because a busy frame writes thousands of them and nobody reads
 * those. That log is how a test can see a sweep *happen* rather than only that a node was
 * built, which is the difference between knowing the game made a filter and knowing it moved
 * one.
 *
 * A voice's pitch is logged too, and it is not an envelope: it is the one thing about a voice a
 * test can ask a question about - was that tick the body's own note, did the interface answer
 * with the note its row says - and a voice writes two of them (the note, and where it slides)
 * against the thousands of gain moves that nobody reads.
 */
function makeAudioContextStub(log, now) {
  const voice = () => ({
    type: '',
    frequency: knob('pitch'),
    connect() {},
    start() {},
    stop() {},
  });
  /** An envelope: a knob nobody is asked to keep a book for, because a voice writes three of
   * them every time it is played and nobody wants to read them. */
  const envelope = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
    cancelScheduledValues() {},
  });
  /** One knob that *is* logged, and the book of everything it was asked to do. */
  const knob = (name) => ({
    value: 0,
    setValueAtTime(v, at) { log.ramps.push({ name, op: 'set', v, at }); },
    exponentialRampToValueAtTime(v, at) { log.ramps.push({ name, op: 'exp', v, at }); },
    setTargetAtTime(v, at, tc) { log.ramps.push({ name, op: 'target', v, at, tc }); },
    cancelScheduledValues(at) { log.ramps.push({ name, op: 'cancel', at }); },
  });
  const stub = {
    state: 'running',
    sampleRate: 48000,
    get currentTime() { return now(); },
    destination: {},
    resume() {},
    createGain() {
      log.voices++;
      return { gain: envelope(), connect() {} };
    },
    createOscillator() { log.voices++; return voice(); },
    // The noise buffer (audio/noise.js): two seconds of a float each. The game fills it
    // through `getChannelData`, so the stub hands back a real one and the fill is real too.
    createBuffer(channels, length, rate) {
      log.buffers++;
      const data = new Float32Array(length);
      log.noiseData = data;
      return {
        numberOfChannels: channels, length, sampleRate: rate, duration: length / rate,
        getChannelData() { return data; },
      };
    },
    createBufferSource() {
      log.noise++;
      return {
        buffer: null, loop: false, playbackRate: envelope(),
        connect() {}, start() {}, stop() {},
      };
    },
  };
  // The optional parts. `raw` is a machine with none of them, and a browser that old still
  // has to be able to hear the game.
  if (log.raw !== true) {
    stub.createDynamicsCompressor = () => {
      log.compressors++;
      return {
        threshold: knob('threshold'), knee: knob('knee'), ratio: knob('ratio'),
        attack: knob('attack'), release: knob('release'),
        reduction: 0, connect() {},
      };
    };
    stub.createBiquadFilter = () => {
      log.filters++;
      return { type: '', frequency: knob('tone'), Q: knob('resonance'), connect() {} };
    };
    // The decoder is one of the optional parts (audio/track.js). It cannot decode - there is no codec
    // in here - but it can be faithfully unhelpful in the two ways a real one is: it refuses anything
    // that does not start with the bytes a real audio file starts with, and on a machine with none of
    // the optional parts it is not there at all. What it accepts it answers with a fixed 80-second
    // stereo buffer, because nothing in the game reads a duration but the ledger that says the song
    // arrived. Both calling styles are honoured, because browsers have both.
    stub.decodeAudioData = (bytes, onOk, onErr) => {
      log.decodes++;
      log.decodedBytes += bytes.byteLength;
      const head = String.fromCharCode.apply(null, new Uint8Array(bytes.slice(0, 4)));
      const known = ['fLaC', 'OggS', 'RIFF', 'ID3'].includes(head);
      const seconds = 80;
      const buffer = () => {
        const length = seconds * stub.sampleRate;
        return {
          numberOfChannels: 2, length, sampleRate: stub.sampleRate, duration: seconds,
          getChannelData() { return new Float32Array(length); },
        };
      };
      if (!known) {
        const err = new Error('this browser cannot decode a file that starts with ' + head);
        if (onErr) onErr(err);
        return Promise.reject(err);
      }
      if (onOk) onOk(buffer());
      return Promise.resolve(buffer());
    };
  }
  return stub;
}

const ELEMENT_IDS = [
  'game', 'startScreen', 'overScreen', 'finalScore', 'finalBest', 'newBest', 'finalStats',
  'finalBuild', 'shipRow', 'finalDust', 'finalAwards', 'nextShip',
  // What ended the run, and what every hull of it went to (index.html, game/tally.js).
  'finalCause', 'finalHulls', 'winHulls',
  // The hangar's second rack: the perks the purse buys ranks of (index.html, game/perks.js).
  'perkRow',
  // ...and its third, what the save has been credited with (index.html, game/awards.js).
  'awardRow', 'awardTitle',
  // What the visit has banked, and what the hangar spends it on (index.html).
  'titleBest', 'titleDust', 'titleAwards', 'titleShip', 'hangarScreen', 'hangarDust', 'hangarBody',
  // ...and the fourth of them, which resets by itself (index.html, game/daily.js).
  'titleToday',
  // The codex: what the runs of this save have met (index.html, game/codex.js).
  'codexScreen', 'codexBody', 'codexTally', 'hostRow', 'lineRow', 'synRow',
  // ...and the fourth rack, what they have flown (index.html, game/history.js).
  'logRow',
  // The box the title's mark is measured against (index.html, render/logo.js). It is the one element
  // on the page that is not a screen: an empty heading whose rectangle in the flex column is where
  // the drawn word belongs.
  'logoBox',
  // The line on the pause rack that says how the run is let go of again - which is a key or a tap,
  // depending on which hands this visit arrived with (ui/screens.js `showPause`, input/touch.js).
  'pauseHint',
  // The win's card (index.html), read the same way the death's is.
  'winScreen', 'winScore', 'winBest', 'winNewBest', 'winCleared', 'winStats', 'winBuild',
  'winHint', 'winDust', 'winAwards',
  // Which day a run was flown on, on both of the cards that end one (index.html, game/daily.js).
  'finalDaily', 'winDaily',
  // The pause: a run held where it stands, and its numbers (index.html, game/run.js, ui/screens.js).
  'pauseScreen', 'pauseBody', 'pauseHead', 'factRow', 'buildRow',
  // The settings: what the game does to the eyes and the ears (index.html, game/settings.js,
  // audio/engine.js). One rack, and a row on it has three parts instead of two - the value is the
  // bright middle of the line, which is the part a press changes.
  'settingsScreen', 'settingsBody', 'settingsNote', 'settingRow',
];

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
    /**
     * The DOM's other half of `appendChild`, and just as strict: a child that is not in here is a
     * bug in the caller, and the stub says so rather than agreeing. The codex's run log takes its own
     * rows back this way when the list it is painting is shorter than the last one was
     * (ui/screens.js `showLog`).
     */
    removeChild(child) {
      const at = this.children.indexOf(child);
      if (at < 0) throw new Error('this element has no such child to take away');
      this.children.splice(at, 1);
      return child;
    },
  };
  return el;
}

/**
 * One row of an `.entry` rack as the stub DOM is holding it: the two parts of the line, and whether
 * the thing it names is missing (`unknown` is the row's own class, and the stub keeps classes). Two
 * racks wear the shape: the codex's three panels, where it means this save has not met the thing yet,
 * and the pause's build rack, where it means the run cut that line out of itself.
 */
function entryRow(row) {
  return {
    name: row.children[0].textContent,
    says: row.children[1].textContent,
    unknown: row.classList.contains('unknown'),
  };
}

/**
 * One row of a rack that has no missing ones: the two parts of the line and nothing else. The run log
 * (game/history.js) and the pause's readout are both this shape - on those panels a row that is not
 * in the list at all is the way of saying it did not happen.
 */
function plainRow(row) {
  return { name: row.children[0].textContent, says: row.children[1].textContent };
}

/**
 * One row of the awards rack (game/awards.js): the two parts of the line, the number it still pays
 * ('' once it has been paid), and whether this save has it yet (`unwon` is the row's own class).
 */
function awardRow(row) {
  return {
    name: row.children[0].textContent,
    says: row.children[1].textContent,
    pays: row.children[2].textContent,
    unwon: row.classList.contains('unwon'),
  };
}

/**
 * One row of the settings rack (game/settings.js, audio/engine.js): what the row is, what it is set
 * to, the one line about what it does, and whether the cursor is on it (ui/screens.js `showSettings`).
 */
function settingRow(row) {
  return {
    name: row.children[0].textContent,
    value: row.children[1].textContent,
    says: row.children[2].textContent,
    chosen: row.classList.contains('chosen'),
  };
}

/**
 * Boot the game with no browser.
 *
 * Options: { root, seed, url, width, height, dpr, audio, storage, layout, motion, network }
 * `seed: null` leaves the game to choose its own, which is what a browser does.
 * Pass `url` (a query string such as '?seed=42') to exercise address-bar seeds.
 * `layout` says what the page measured for a box, per id: `{ hangarBody: { offsetHeight: 900 } }`,
 * or `{ logoBox: { rect: { left, top, width, height } } }` for a box with a place as well as a size.
 * Nothing is laid out here, so a block answers 0 until a test that cares says what it came to.
 * `motion: 'reduce'` says the visitor asked for as little movement as the machine can give.
 * `network` is the files the page is served: `{ 'assets/song.flac': bytes }`. With none, every
 * request is refused - which is the same shape as a page that was served a file it does not have -
 * and the game that asks one says so in `game.audio.fetched` (audio/track.js is who asks).
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
  // `raw` is the machine with none of the optional audio parts in it (audio/engine.js and
  // audio/noise.js both have to work on one). `ramps` is every sweep the game asked for and
  // `noiseData` the grain it was given to fill (test/noise.test.mjs).
  const audioLog = {
    voices: 0, compressors: 0, buffers: 0, noise: 0, filters: 0, ramps: [],
    noiseData: null, raw: opts.audio === 'raw',
    // The one recording the game plays (audio/track.js): every url the page asked for, how many times
    // it was handed to the decoder and how many bytes that was. A headless visit cannot hear it; this
    // is how it can still say the bytes were asked for once, and not once a frame.
    fetched: [], decodes: 0, decodedBytes: 0,
  };
  /**
   * The network. Without `network` the stub has none and every request is refused, which is the same
   * answer a browser gives a page whose file has gone missing - and a game that plays a recording has
   * to be tested against that answer as much as against the file.
   */
  globalThis.fetch = (url) => {
    const asked = String(url);
    audioLog.fetched.push(asked);
    const files = opts.network;
    if (!files) return Promise.reject(new Error('the stub browser has no network'));
    const body = files[asked];
    if (body === undefined) return Promise.reject(new Error('nothing here was served at ' + asked));
    const bytes = body instanceof Uint8Array ? body : Uint8Array.from(body);
    return Promise.resolve({
      ok: true, status: 200,
      arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    });
  };
  // Everything the last frame asked to be put on the canvas. The renderer paints
  // entities by translating to them, so this is how a test can see what was drawn
  // where - and the same trick works for the stamps, which is how the sky's
  // coverage can be checked (render/nebula.js).
  const drawLog = { translates: [], images: [], dashes: [], points: [], circles: [], words: [], texts: [], strokes: [], rects: [] };
  // The same log for every offscreen canvas the game makes - the glow sprites, and anything that
  // paints a layer of its own and lays the sheet on the window (render/darkness.js). Cleared with
  // the frame, like the window's, so a test can ask what the last frame cut. Nothing else stamps or
  // arcs onto an offscreen canvas: a sprite bake fills soft blobs and nothing more, so on any frame
  // that meets no new thing to draw, what is in here is the layer's own work.
  const offLog = { translates: [], images: [], dashes: [], points: [], circles: [], words: [], texts: [], strokes: [], rects: [] };
  const ctx = makeContextStub(counters, drawLog);
  const elements = {};
  for (const id of ELEMENT_IDS) {
    // Which screens start out hidden is in the markup, and the stub says the same thing the
    // browser does: the title is up and both of the cards a run ends on are not - and so is the
    // win card's line of keys, which arrives with the guard (src/ui/screens.js `revealWinHint`),
    // and so are the four panels, each of which is put up by a key.
    const startsHidden = id === 'overScreen' || id === 'winScreen' || id === 'winHint'
      || id === 'hangarScreen' || id === 'codexScreen' || id === 'pauseScreen'
      || id === 'settingsScreen';
    elements[id] = makeElement('div', ['screen', startsHidden ? 'hidden' : ''].filter(Boolean));
    elements[id].id = id;
    elements[id].getContext = () => ctx;
    elements[id].getBoundingClientRect = () => rectOf(elements[id]);
    // The box's own measurements, as far as a stub without a layout engine can give them: a screen
    // is the window it is painted on, and a *block* inside one measured nothing at all until a test
    // says otherwise (`layout` below). ui/screens.js `fitHangar` asks those questions, and 0 is the
    // honest answer for a page that has not been laid out - which is what it is written to survive.
    elements[id].clientWidth = width;
    elements[id].clientHeight = height;
    elements[id].offsetWidth = 0;
    elements[id].offsetHeight = 0;
  }

  /** Move every screen's box with the window (see `setViewport`). */
  function sizeScreens(w, h) {
    for (const id of ELEMENT_IDS) {
      elements[id].clientWidth = w;
      elements[id].clientHeight = h;
    }
  }

  /**
   * Where an element sits. Every screen here is `fixed; inset: 0`, so the window is the honest
   * answer for all of them - except for a box a test has said something else about through
   * `layout: { logoBox: { rect: { left, top, width, height } } }`, which is how a test says where
   * the title's mark was laid out (render/logo.js `measureLogo`).
   */
  function rectOf(el) {
    const rect = el.rect;
    if (rect === undefined || rect === null) {
      return { left: 0, top: 0, width: width, height: height };
    }
    return {
      left: rect.left === undefined ? 0 : rect.left,
      top: rect.top === undefined ? 0 : rect.top,
      width: rect.width === undefined ? 0 : rect.width,
      height: rect.height === undefined ? 0 : rect.height,
    };
  }

  // A test that wants the page to have been *laid out* - because it is about what a panel does with
  // the room it was given - says what each box came to: `{ hangarBody: { offsetHeight: 900 } }`.
  for (const id of Object.keys(opts.layout || {})) {
    if (elements[id] === undefined) throw new Error('the stub DOM has no #' + id);
    Object.assign(elements[id], opts.layout[id]);
  }

  const listeners = {};
  const store = Object.assign({}, opts.storage);
  let rafQueue = [];
  let clock = 0;
  let held = Object.create(null);
  // Every touch event the game was handed, and how many times it asked the page not to do its own
  // thing with one (input/touch.js). A browser left to scroll is a browser that eats the gesture a
  // stick is made of, so "it prevented the default" is a promise worth a test.
  let touchPrevented = 0;

  /** One finger, in the shape input/touch.js reads. */
  function touchEvent(id, x, y) {
    return {
      cancelable: true,
      preventDefault() { touchPrevented++; },
      changedTouches: [{ identifier: id === undefined ? 0 : id, clientX: x, clientY: y }],
    };
  }

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
    // The one media query the game reads (render/canvas.js `calmMotion`). `motion: 'reduce'` is how
    // a test boots a visitor who asked for as little movement as possible.
    matchMedia(query) {
      return { matches: opts.motion === 'reduce' && /reduced-motion/.test(String(query)) };
    },
  };
  if (opts.audio) {
    // The audio clock is the frame clock, so a voice ages as the run ages (see the stub).
    windowObj.AudioContext = function FakeAudioContext() {
      return makeAudioContextStub(audioLog, () => clock / 1000);
    };
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
      const spriteCtx = makeContextStub(bakes, offLog);
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
      for (const key of Object.keys(drawLog)) drawLog[key].length = 0;
      for (const key of Object.keys(offLog)) offLog[key].length = 0;
      const queue = rafQueue;
      rafQueue = [];
      for (const handler of queue) handler(clock);
    },
    /** Send a browser event to window. */
    fire(type, event) {
      for (const handler of (listeners[type] || [])) handler(event || {});
    },
    /**
     * Hold or release a key, skipping the no-change repeats. `extra` is anything else the
     * event would have carried - `{ shiftKey: true }` is how a test asks for the banish
     * chord, which is a modifier and not a key of its own.
     */
    key(code, down, extra) {
      if (!!held[code] === !!down) return;
      held[code] = down;
      controller.fire(down ? 'keydown' : 'keyup',
        Object.assign({ code: code, preventDefault() {} }, extra));
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
    /**
     * A finger on the glass (input/touch.js). `id` is the touch's own, so a test can put a second
     * thumb down beside the first and know which of the two moved. The game asks every touch event
     * to `preventDefault`, so the event handed over says it was cancelable and has somewhere to say
     * it - and `touched` counts the asks, which is how a test can be sure the page was told not to
     * scroll out from under a stick.
     */
    touchDown(x, y, id) {
      controller.fire('touchstart', touchEvent(id, x, y));
    },
    touchMove(x, y, id) {
      controller.fire('touchmove', touchEvent(id, x, y));
    },
    touchUp(x, y, id) {
      controller.fire('touchend', touchEvent(id, x, y));
    },
    setViewport(w, h) {
      width = w;
      height = h;
      sizeScreens(w, h);
      controller.fire('resize', {});
    },
    /** Draw counters, so a test can tell that something was actually painted. */
    drawCalls() { return Object.assign({}, counters); },
    /** How many times a touch event was told to stop the page doing its own thing (see `touchDown`). */
    get touchPrevented() { return touchPrevented; },
    /**
     * Paint something on a canvas of its own and say what it cost: `{ fills, strokes, images,
     * texts, gradients, shadows }`, and where it drew them: `widths`, `points`, `circles`, `rects`
     * and `stamps`, in the coordinates the painter was writing in. Nothing about the run or the frame
     * being measured is touched - not the counters, not the last frame's draw log - so a test can
     * hold one part of the picture still while it measures another (see tools/headless/frame-cost.js),
     * and can ask how wide a particular thing was drawn without hoping nothing else in the frame drew
     * a line at that width. The painted words are deliberately not among them: `texts` is a count in
     * the counters and a list in the log, and a return value cannot be both.
     */
    measure(paint) {
      const spent = { fills: 0, strokes: 0, texts: 0, gradients: 0, translates: 0, images: 0, shadows: 0, dashes: 0 };
      const blank = {
        translates: [], images: [], dashes: [], points: [], circles: [], words: [], texts: [],
        strokes: [], rects: [],
      };
      paint(makeContextStub(spent, blank));
      return Object.assign({}, spent, {
        widths: blank.strokes.slice(),
        points: blank.points.slice(),
        circles: blank.circles.slice(),
        rects: blank.rects.slice(),
        stamps: blank.images.slice(),
      });
    },
    /**
     * The canvas the game draws into - the stub, in other words, and with it the honest measure of
     * how wide a word is at the size a font string says to draw it. A test that wants to paint one
     * thing on its own (the card rack, say) hands this to the painter that normally only main.js
     * calls, and then reads `texts()` back to see where the words landed.
     */
    get context() { return ctx; },
    /** What it took to bake the glow sprites: offscreen canvases and gradients. */
    bakeCalls() { return Object.assign({}, bakes); },
    /**
     * Every translate the last frame made, in the order the frame drew them: the
     * arguments it was given (`x`, `y`) and where that lands on the canvas once the
     * transforms around it are applied (`at`, in device pixels).
     */
    translates() { return drawLog.translates.slice(); },
    /** Every sprite the last frame stamped, and where: { x, y, w, h, at, mode }. */
    stamps() { return drawLog.images.slice(); },
    /**
     * The same for the offscreen canvases: every sprite a layer stamped on its own sheet last frame,
     * in that sheet's own pixels, and the composite it used (render/darkness.js).
     */
    stampsOffscreen() { return offLog.images.slice(); },
    /** Every circle a layer asked for on its own sheet last frame, with its composite. */
    circlesOffscreen() { return offLog.circles.slice(); },
    /**
     * The points of every path a layer cut on its own sheet last frame, in that sheet's own pixels -
     * which is how a test can ask where a *cut* went, and not merely that one happened
     * (render/darkness.js punches blades and fans out of the night with paths, not with stamps).
     */
    pointsOffscreen() { return offLog.points.slice(); },
    /** Every rectangle the last frame filled on the window, or on a layer, and how big it was. */
    rects() { return drawLog.rects.slice(); },
    rectsOffscreen() { return offLog.rects.slice(); },
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
    /**
     * Every circle the last frame asked for, with its radius, in arena coordinates, and with `mode`
     * - the composite it was asked for under, which is how a test can tell a body that covers the sky
     * from one that adds to it (the arena is painted additively, render/renderer.js).
     */
    circles() { return drawLog.circles.slice(); },
    /** Every string the last frame put on the canvas, in the order it put them there. */
    words() { return drawLog.words.slice(); },
    /**
     * Every string the last frame put on the canvas, with where and how big: `{ text, x, y, w,
     * size, align, stroke }`, in the coordinates the painter was writing in (the cards are drawn in
     * CSS pixels, so those are CSS pixels). This is how a test can ask whether words that were meant
     * to fit inside a box did - which measureText alone cannot say, because measuring is not
     * drawing. A haloed word appears twice, once as its stroke and once as its fill.
     */
    texts() { return drawLog.texts.slice(); },
    /** Where an arena point lands on the screen, now the arena is not the window. */
    screenOf: (x, y) => game.screenOf(x, y),
    /** Choose the primary this game flies, exactly as the title screen's keys do. */
    chooseWeapon: (id) => game.chooseWeapon(id),
    /** Choose the ship it flies, and take the primary that ship brings with it. */
    chooseShip: (id) => game.chooseShip(id),
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
        winHidden: elements.winScreen.classList.contains('hidden'),
        finalScore: elements.finalScore.textContent,
        finalBest: elements.finalBest.textContent,
        stats: elements.finalStats.textContent,
        build: elements.finalBuild.textContent,
        // What ended the run, in the card's own words, and one row per thing that took a hull
        // (game/tally.js `causeWords`, `hullLedger`). Empty when there is nothing to say: a win has no
        // cause, and a wreck that lost one hull has no rack because its own headline just said it.
        finalCause: elements.finalCause.textContent,
        hulls: elements.finalHulls.children.map(plainRow),
        winHulls: elements.winHulls.children.map(plainRow),
        newBestShown: !elements.newBest.classList.contains('hidden'),
        // The win's card, in the same shape, so a test can ask either one what it is showing.
        winScore: elements.winScore.textContent,
        winBest: elements.winBest.textContent,
        winCleared: elements.winCleared.textContent,
        winStats: elements.winStats.textContent,
        winBuild: elements.winBuild.textContent,
        winNewBestShown: !elements.winNewBest.classList.contains('hidden'),
        // And the line of keys on it, which is hidden until the guard is spent.
        winHintShown: !elements.winHint.classList.contains('hidden'),
        // What the visit has banked, and the line that says what the next run flies.
        titleBest: elements.titleBest.textContent,
        titleDust: elements.titleDust.textContent,
        titleToday: elements.titleToday.textContent,
        titleShip: elements.titleShip.textContent,
        nextShip: elements.nextShip.textContent,
        // What a finished run paid, on each of the two cards - its own stardust, and what it won
        // that the save had not won before ('' when it won nothing: the line is not painted).
        finalDust: elements.finalDust.textContent,
        winDust: elements.winDust.textContent,
        finalAwards: elements.finalAwards.textContent,
        winAwards: elements.winAwards.textContent,
        titleAwards: elements.titleAwards.textContent,
        // Which day the run was flown on and where that day's best stands ('' for a run that flew an
        // arena of its own - the line is not painted, space and all). game/daily.js.
        finalDaily: elements.finalDaily.textContent,
        winDaily: elements.winDaily.textContent,
        // The hangar: whether it is up, and what its purse says.
        hangarHidden: elements.hangarScreen.classList.contains('hidden'),
        hangarDust: elements.hangarDust.textContent,
        // How the panel was fitted to the window (ui/screens.js `fitHangar`). '' is "it fit".
        hangarScale: elements.hangarBody.style.transform || '',
        // The rack, as the player reads it: one line per ship, naming the ship and the gun it
        // brings and the numbers it is priced on, which one is lit up, and which ones the purse has
        // not bought yet (game/ships.js is what they are built from, game/hangar.js what it costs).
        ships: elements.shipRow.children.map((row) => ({
          label: row.children.map((part) => part.textContent).join(' '),
          picked: row.classList.contains('picked'),
          locked: row.classList.contains('locked'),
        })),
        // ...and the perk rack beside it: one line per perk, naming the rank the purse is on, what
        // a rank gives and what the next one costs (game/perks.js, game/hangar.js).
        perks: elements.perkRow.children.map((row) => ({
          label: row.children.map((part) => part.textContent).join(' '),
          maxed: row.classList.contains('maxed'),
        })),
        // The codex: whether it is up, how much of it is filled in, how it was fitted to the window
        // ('' is "it fit", see ui/screens.js `fitOpenPanel`), and its three panels as the player reads
        // them - one line per row, and which rows are still empty (game/codex.js).
        codexHidden: elements.codexScreen.classList.contains('hidden'),
        codexTally: elements.codexTally.textContent,
        codexScale: elements.codexBody.style.transform || '',
        codexPanels: {
          hosts: elements.hostRow.children.map(entryRow),
          lines: elements.lineRow.children.map(entryRow),
          synergies: elements.synRow.children.map(entryRow),
        },
        // ...and the fourth rack: the last runs this save has flown, newest first, or the one line
        // that says there have been none (game/history.js).
        pastRuns: elements.logRow.children.map(plainRow),
        // The pause: whether it is up, how it was fitted to the window ('' is "it fit"), its headline
        // of score and clock, and its two racks - the run's numbers, and the lines it was built from
        // (game/run.js `pauseRun`, ui/screens.js `showPause`).
        pauseHidden: elements.pauseScreen.classList.contains('hidden'),
        pauseHint: elements.pauseHint.textContent,
        pauseScale: elements.pauseBody.style.transform || '',
        pauseHead: elements.pauseHead.textContent,
        pauseFacts: elements.factRow.children.map(plainRow),
        pauseBuild: elements.buildRow.children.map(entryRow),
        // The settings: whether they are up, how they were fitted, what the note under the heading
        // says, and every row as the player reads it - name, value, one line about it, and where the
        // cursor is (game/settings.js, audio/engine.js, ui/screens.js `showSettings`).
        settingsHidden: elements.settingsScreen.classList.contains('hidden'),
        settingsScale: elements.settingsBody.style.transform || '',
        settingsNote: elements.settingsNote.textContent,
        settingsRows: elements.settingRow.children.map(settingRow),
        // The hangar's third rack: every award there is, and which of them this save has (its title
        // carries the count) - game/awards.js, ui/screens.js `showAwards`.
        awardTitle: elements.awardTitle.textContent,
        awards: elements.awardRow.children.map(awardRow),
      };
    },
    get audio() { return audioLog; },
    get storage() { return store; },

    /** Put the game back on its title screen, ready for another run. */
    async resetToTitle(nextSeed) {
      const [{ world }, { resetRun }, { resetAmbient }, { STATE }, { closePanels }] = await Promise.all([
        import(moduleUrl('game/world.js')),
        import(moduleUrl('game/run.js')),
        import(moduleUrl('game/ambient.js')),
        import(moduleUrl('game/state.js')),
        import(moduleUrl('ui/screens.js')),
      ]);
      // The game forgets every held key - and, since PLAN section 6, holds the run that was flying.
      // That is safe here only because of what runs below: `resetRun` lets go of the pause and
      // `closePanels` takes the panel it put up off the glass.
      controller.fire('blur', {});
      held = Object.create(null);
      // And a panel the last session left open is not this one's to be looking through.
      closePanels();
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
