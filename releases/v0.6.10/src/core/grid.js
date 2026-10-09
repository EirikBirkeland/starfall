// A uniform spatial grid: the broad phase of every collision test (PLAN
// section 2: never test every bullet against every enemy).
//
// The plane is cut into square cells of `cellSize` pixels. `insert` files an
// item in the single cell that holds its centre; `queryCircle` walks the cells
// that overlap the circle's bounding box and hands back everything it finds in
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
// Rebuilding costs no allocation: a cell keeps its array once it has one, and a
// query appends into a scratch array the caller owns.

/**
 * Cell coordinates are folded into a single integer with this stride so a Map can
 * index them without building a string first. Two different cells share a key
 * only if their y coordinates differ by a multiple of this number, and cell
 * coordinates stay far below it in this game (this allows over 400 million
 * pixels of arena at a 64-pixel cell), so they never do.
 */
const CELL_STRIDE = 1000003;

export class Grid {
  /** `cellSize` is in pixels, and wants to be about twice the widest query. */
  constructor(cellSize) {
    if (!(cellSize > 0)) {
      throw new RangeError('a grid cell has to be wider than nothing, got ' + cellSize);
    }
    this.cellSize = cellSize;
    this.invCell = 1 / cellSize;
    this.cells = new Map();   // cell key -> the items filed in it
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

  /** Empty the grid, keeping every cell array ready for the next rebuild. */
  clear() {
    for (const cell of this.cells.values()) cell.length = 0;
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
      cell = [];
      this.cells.set(key, cell);
    }
    if (cell.length === 0) this.filled++;
    cell.push(item);
    this.items++;
  }

  /**
   * Everything that could be within `radius` of (x, y), appended into `out` - a
   * scratch array the caller owns, so a query allocates nothing. A fresh array
   * is made when you do not pass one. The result is a superset; see the header.
   */
  queryCircle(x, y, radius, out) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius)) {
      throw new RangeError('a circular query needs finite numbers, got ' + x + ',' + y + ' r=' + radius);
    }
    const found = out === undefined ? [] : out;
    found.length = 0;

    const reach = radius > 0 ? radius : 0;
    const x0 = Math.floor((x - reach) * this.invCell);
    const x1 = Math.floor((x + reach) * this.invCell);
    const y0 = Math.floor((y - reach) * this.invCell);
    const y1 = Math.floor((y + reach) * this.invCell);

    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells.get(cx * CELL_STRIDE + cy);
        if (cell === undefined) continue;
        for (let i = 0; i < cell.length; i++) found.push(cell[i]);
      }
    }
    return found;
  }

  /** Numbers for the debug overlay (F3, milestone 10) and for the tests. */
  stats() {
    return { items: this.items, filled: this.filled, allocated: this.cells.size, cellSize: this.cellSize };
  }
}
