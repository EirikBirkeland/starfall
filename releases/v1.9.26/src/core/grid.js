// A uniform spatial grid: the broad phase of every collision test (PLAN
// section 2: never test every bullet against every enemy).
//
// The plane is cut into square cells of `cellSize` pixels. `insert` files an
// item in the single cell that holds its centre; a query walks the cells that
// overlap the box it is asking about and hands back everything it finds in
// them. A query therefore costs what is *near* instead of what *exists*: with
// 1500 bullets and 600 enemies, a shot only ever looks at the handful of things
// beside it.
//
// Items are filed by their centre, which brings two rules with it:
//
//   1. A query result is a *candidate list*. It holds every item whose centre is
//      inside the circle plus possibly a few whose centre is outside it, so the
//      caller still has to make the exact test.
//   2. Anything wider than a point has to be covered by the radius you ask with.
//      Pass "how close two centres can be and still count", never just the
//      distance you happen to care about - a bullet queries with the widest
//      enemy it could meet plus its own hit radius.
//
// The grid is a snapshot, not a live index. Whoever uses it rebuilds it every
// step (`clear`, then `insert` the lot). An item taken out of the game part way
// through a step stays in the grid until the next rebuild, so a caller must skip
// what is already dead - see the `hp <= 0` test in game/bullets.js.
//
// **A rebuild and a query allocate nothing**, and that is a rule with a measured
// reason rather than a preference: `tools/alloc-probe.js` found the whole crowd
// throwing away about 94 bytes a body a step here, which is one small array per
// cell per step and more garbage than the entire rest of the fight put together.
// Two things would break it and both are avoided on purpose:
//
//   - emptying a cell. `cell.length = 0` throws the array's element store away,
//     and the next `push` buys a new one. So a cell is not an array but a count
//     and an array (`{ n, items }`), and `clear` writes zero over the count and
//     leaves the store standing at whatever the busiest step ever needed.
//   - walking the cells through `Map.values()`, which builds an iterator every
//     time. `every` is a plain array of the same cells in the order they were
//     made, and `clear` counts down it.

/**
 * Cell coordinates are folded into a single integer with this stride so a Map can
 * index them without building a string first. Two different cells share a key
 * only if their y coordinates differ by a multiple of this number, and cell
 * coordinates stay far below it in this game (this allows over 400 million
 * pixels of arena at a 64-pixel cell), so they never do.
 */
const CELL_STRIDE = 1000003;

/** One cell: how many items it holds, and the store they are written into. */
function makeCell() {
  return { n: 0, items: [] };
}

export class Grid {
  /** `cellSize` is in pixels, and wants to be about twice the widest query. */
  constructor(cellSize) {
    if (!(cellSize > 0)) {
      throw new RangeError('a grid cell has to be wider than nothing, got ' + cellSize);
    }
    this.cellSize = cellSize;
    this.invCell = 1 / cellSize;
    this.cells = new Map();   // cell key -> the cell holding the items filed there
    this.every = [];          // the same cells, in the order they were built, for clear()
    this.items = 0;
    this.filled = 0;          // how many of those cells hold something
  }

  /** How many items are filed right now. */
  get count() {
    return this.items;
  }

  /** The key of the cell holding the point (x, y). */
  cellKey(x, y) {
    return Math.floor(x * this.invCell) * CELL_STRIDE + Math.floor(y * this.invCell);
  }

  /** Empty the grid, keeping every cell and every element store ready for the next rebuild. */
  clear() {
    for (let i = this.every.length - 1; i >= 0; i--) this.every[i].n = 0;
    this.items = 0;
    this.filled = 0;
  }

  /** File `item` - anything with finite x and y - in the cell holding its centre. */
  insert(item) {
    if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) {
      throw new RangeError('an item at ' + item.x + ',' + item.y + ' cannot be filed in a grid');
    }
    const key = this.cellKey(item.x, item.y);
    let cell = this.cells.get(key);
    if (cell === undefined) {
      cell = makeCell();
      this.cells.set(key, cell);
      this.every.push(cell);
    }
    const at = cell.n;
    cell.n = at + 1;
    if (at < cell.items.length) cell.items[at] = item;
    else cell.items.push(item);
    if (at === 0) this.filled++;
    this.items++;
  }

  /**
   * The hot door: everything that could be within `radius` of (x, y), written into
   * `out` from its beginning, and the answer is **how many were written** - read
   * them at `out[0] .. out[n - 1]`.
   *
   * `out` is a scratch array the caller owns and it is deliberately never emptied:
   * `out.length = 0` is the one thing that would put an allocation back in this
   * loop, because it throws the element store away and the next write buys one.
   * So the array keeps whatever length the widest query ever needed and `n` is
   * the only truth about what is in it now. The result is a superset; see the
   * header.
   */
  queryInto(x, y, radius, out) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius)) {
      throw new RangeError('a circular query needs finite numbers, got ' + x + ',' + y + ' r=' + radius);
    }
    if (!Array.isArray(out)) {
      throw new TypeError('a query writes into a scratch array the caller owns; give it one');
    }
    const reach = radius > 0 ? radius : 0;
    const x0 = Math.floor((x - reach) * this.invCell);
    const x1 = Math.floor((x + reach) * this.invCell);
    const y0 = Math.floor((y - reach) * this.invCell);
    const y1 = Math.floor((y + reach) * this.invCell);

    let n = 0;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells.get(cx * CELL_STRIDE + cy);
        if (cell === undefined) continue;
        const items = cell.items;
        for (let i = 0; i < cell.n; i++) {
          const at = n++;
          if (at < out.length) out[at] = items[i];
          else out.push(items[i]);
        }
      }
    }
    return n;
  }

  /**
   * The cold door on the same walk: a list of everything that could be within
   * `radius` of (x, y). It hands back an array you can read with `.length` and
   * iterate at leisure - which is exactly what it costs, so a step that asks this
   * question every frame for every bullet wants `queryInto` instead. Pass `out`
   * to have it written into an array you own (it is emptied first, which is the
   * cost above).
   */
  queryCircle(x, y, radius, out) {
    const found = out === undefined ? [] : out;
    const n = this.queryInto(x, y, radius, found);
    found.length = n;
    return found;
  }

  /** Numbers for the debug overlay (F3, milestone 10) and for the tests. */
  stats() {
    return { items: this.items, filled: this.filled, allocated: this.cells.size, cellSize: this.cellSize };
  }
}
