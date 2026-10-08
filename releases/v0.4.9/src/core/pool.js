// Object pools (PLAN section 2).
//
// The busy lists in the world - sparks, shockwave rings, floating labels, and
// later bullets and enemies - are created and destroyed thousands of times a
// minute. Building a fresh object every time is what turns a crowded screen into
// a stuttering one, so a pool keeps the objects it has already built and hands
// them back out. Once a pool is warm, `spawn()` allocates nothing.
//
// A pool owns its live list, `items`, and removing an object swaps the last live
// object into its hole, which is what makes removal O(1). The price is that
// `items` is in no particular order:
//
//   - a loop that removes must count downwards, or it will skip the object that
//     was swapped into the slot it just left;
//   - nothing may depend on the order of `items`. Anything that does (a queue,
//     a back-to-front paint list) does not belong in a pool.
//
// A recycled object keeps the shape it was built with, and `spawn()` hands it
// over as it came out of the drawer: the caller must fill in every field before
// using it. The factories in game/effects.js define each shape once and every
// spawner writes all of it, which is what keeps a stale field from an earlier
// life leaking into the drawing.

export class Pool {
  /**
   * `make` builds one brand-new object with every field already present. It is
   * only ever called when the drawer is empty, so shapes never grow later.
   */
  constructor(make) {
    this.make = make;
    /** The live objects. Read this to draw or to update; never touch it directly. */
    this.items = [];
    this.free = [];
    this.made = 0;      // objects ever built; it stops growing once the pool is warm
    this.spawned = 0;   // lives lived, so a test can prove objects were reused
  }

  /** How many objects are live right now. */
  get count() {
    return this.items.length;
  }

  /** Take an object, live or recycled, and add it to the live list. */
  spawn() {
    const object = this.free.length > 0 ? this.free.pop() : this.build();
    this.items.push(object);
    this.spawned++;
    return object;
  }

  /** Internal, and the only place this pool allocates. */
  build() {
    this.made++;
    return this.make();
  }

  /** Take live object `index` out of the list and put it back in the drawer. */
  killAt(index) {
    const items = this.items;
    if (!Number.isInteger(index) || index < 0 || index >= items.length) {
      throw new RangeError('pool has ' + items.length + ' live objects, index ' + index + ' is not one of them');
    }
    const last = items.length - 1;
    const dead = items[index];
    items[index] = items[last];
    items.pop();
    this.free.push(dead);
  }

  /** Put `howMany` live objects back in the drawer. Which ones is unspecified. */
  trim(howMany) {
    for (let i = 0; i < howMany; i++) {
      if (this.items.length === 0) return;
      this.killAt(this.items.length - 1);
    }
  }

  /** Empty the live list, keeping every object ready for reuse. */
  clear() {
    while (this.items.length > 0) this.free.push(this.items.pop());
  }

  /** Numbers for the debug overlay and for the tests. */
  stats() {
    return {
      live: this.items.length,
      free: this.free.length,
      made: this.made,
      spawned: this.spawned,
    };
  }
}
