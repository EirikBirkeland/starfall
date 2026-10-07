// The kind table: that it is complete, and that each behaviour does the one small
// thing it says it does. The crowd's own rules - spawning, separation, what a kill
// pays out - are tested in arena, collision and particles; these are about the
// definitions, which is what game/kinds.js now owns.
//
// Everything here runs on the scripted world (tools/headless/scripted.js) at the
// game's own step, because a behaviour is a thing that happens once per step.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { KINDS, kindOf, makeEnemy, widestEnemyRadius } from '../src/game/kinds.js';
import { killEnemy, damageEnemy } from '../src/game/enemies.js';
import { logic } from '../src/core/rng.js';
import { TAU } from '../src/core/math.js';
import { scriptedRun, stepTheWorld } from '../tools/headless/scripted.js';

const STEP = BALANCE.sim.step;

/** A run with one enemy of its kind in it, walking at the speed its kind was given. */
function standing(seed, type, x, y) {
  const field = scriptedRun(seed);
  const enemy = makeEnemy(field, type, x, y);
  field.enemies.push(enemy);
  return { field, enemy };
}

/** The shortest signed angle from `from` to `to`. */
function turn(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * The direction each step actually took, next to the direction the ship was in when
 * the step started: what a walk was thinking, in radians of difference.
 */
function headingAgainstTheShip(type, seed) {
  const { field, enemy } = standing(seed, type, 1100, 1000);
  const target = field.player;
  const turns = [];
  for (let i = 0; i < 240; i++) {
    const x = enemy.x;
    const y = enemy.y;
    stepTheWorld();
    const toShip = Math.atan2(target.y - y, target.x - x);
    const walked = Math.atan2(enemy.y - y, enemy.x - x);
    turns.push(turn(toShip, walked));
  }
  return turns;
}

test('every kind has both halves: its numbers and its behaviour', () => {
  const numbered = Object.keys(BALANCE.kinds).sort();
  const defined = Object.keys(KINDS).sort();
  assert.deepEqual(defined, numbered, 'a kind needs its numbers in balance.js and its row here');

  for (const name of defined) {
    const kind = kindOf(name);
    assert.equal(kind.stats, BALANCE.kinds[name], name + ' points at its numbers, it does not copy them');
    assert.equal(typeof kind.walk, 'function', name + ' says how it walks');
    assert.ok(kind.onDeath === undefined || typeof kind.onDeath === 'function',
      name + "'s death is a function or nothing at all");
  }
});

test('a kind nobody defined is an error, not a silent no-op', () => {
  assert.throws(() => kindOf('grub'), /grub/);
});

test('an enemy carries the row it was built from', () => {
  // The crowd steps `enemy.kind.walk`, so this reference is the whole link between
  // an enemy and its definition. It is taken once, when the enemy is built.
  const field = scriptedRun(4);
  for (const name of Object.keys(KINDS)) {
    assert.equal(makeEnemy(field, name, 100, 100).kind, KINDS[name],
      name + ' carries its own row');
  }
});

test('the collision broad phase is wide enough for the fattest thing in the arena', () => {
  const fattest = Math.max(...Object.values(BALANCE.kinds).map((k) => k.radius));
  assert.equal(widestEnemyRadius(), fattest);
  const split = Math.max(...Object.values(BALANCE.kinds).map((k) => (k.split ? k.split.radius : 0)));
  assert.ok(widestEnemyRadius() >= split, 'a hatchling is thinner than the fattest body, or the grid misses it');
});

test('a drifter walks the straight line to the ship, nose first', () => {
  const { enemy } = standing(11, 'drifter', 1500, 1100);
  const expect = BALANCE.kinds.drifter.speed * STEP;   // at elapsed 0 nothing has scaled yet

  stepTheWorld();

  assert.ok(Math.abs(enemy.x - 1500) < 1e-9, 'it never left the line');
  assert.ok(Math.abs((enemy.y - 1100) - expect) < 1e-9,
    'it covered its speed for one step, and not more');
  assert.ok(Math.abs(enemy.rot - Math.PI / 2) < 1e-9, 'its nose points at the ship');
});

test('a weaver walks the same line swerving both ways across it', () => {
  const straight = headingAgainstTheShip('drifter', 12);
  const weaving = headingAgainstTheShip('weaver', 12);

  const widest = Math.max(...straight.map(Math.abs));
  assert.ok(widest < 1e-9, 'a drifter never swerved, by ' + widest.toFixed(12) + ' rad');

  const amount = weaving.map(Math.abs);
  assert.ok(Math.max(...amount) > 0.3,
    'a weaver swerved up to ' + Math.max(...amount).toFixed(2) + ' rad off the line');
  const left = weaving.filter((t) => t > 0).length;
  assert.ok(left > 20 && left < weaving.length - 20,
    'and it crossed to both sides: ' + left + ' steps left of the line out of ' + weaving.length);

  const wobble = BALANCE.kinds.weaver.wobble.amount;
  assert.ok(Math.max(...amount) <= wobble + 1e-9, 'and never further than its numbers say');
});

test('a weaver keeps closing on the ship while it swerves', () => {
  const { field, enemy } = standing(13, 'weaver', 1500, 700);
  const target = field.player;
  const was = Math.hypot(enemy.x - target.x, enemy.y - target.y);

  for (let i = 0; i < 240; i++) stepTheWorld();
  const now = Math.hypot(enemy.x - target.x, enemy.y - target.y);

  assert.ok(now < was - 200, 'it came ' + (was - now).toFixed(0) + ' px closer while weaving');
});

test('a tank turns on the spot at its own pace, whatever way the ship is', () => {
  const { enemy } = standing(14, 'tank', 1500, 1000);
  const was = enemy.rot;

  const seconds = 0.5;
  for (let i = 0; i < seconds / STEP; i++) stepTheWorld();

  const turned = enemy.rot - was;
  const expect = BALANCE.kinds.tank.rotateRate * seconds;
  assert.ok(Math.abs(turned - expect) < 1e-9,
    'it turned ' + turned.toFixed(4) + ' rad, the plan says ' + expect.toFixed(4));
});

test('a shove an enemy is still carrying carries on, and dies away', () => {
  const { enemy } = standing(15, 'drifter', 1500, 1000);
  enemy.speed = 0;                 // so the only thing moving it is the shove
  enemy.ix = 300;

  const drift = BALANCE.enemies.separationDrag;   // what one second of it is worth
  for (let i = 0; i < 1 / STEP; i++) stepTheWorld();

  const sideways = enemy.x - 1500;
  // The shove is multiplied down every step, so what it is worth is that whole
  // decaying tail: it starts at 300 px/s and is down to a fiftieth of that
  // (`separationDrag`) by the end of the second.
  assert.ok(sideways > 70 && sideways < 83, 'the shove was worth ' + sideways.toFixed(1) + ' px');
  assert.ok(Math.abs(enemy.ix - 300 * drift) < 0.5,
    'and after a second there is ' + enemy.ix.toFixed(2) + ' px/s of it left');
});

test("a tank's death leaves its hatchlings; other kinds leave nothing", () => {
  const { field, enemy } = standing(16, 'tank', 600, 600);
  const spec = BALANCE.kinds.tank.split;
  enemy.hp = 5;
  const crowd = field.enemies.length;

  killEnemy(field, enemy, true);

  assert.equal(field.enemies.length, crowd - 1 + spec.into, 'the tank went, the hatchlings came');
  const kid = field.enemies[field.enemies.length - 1];
  assert.equal(kid.type, spec.type, 'it splits into the kind its numbers name');
  assert.equal(kid.r, spec.radius);
  assert.equal(kid.hp, Math.ceil(5 * spec.hpFactor), 'it inherits how wounded its parent was');
  assert.equal(kid.score, spec.score);
  assert.equal(kid.drop, spec.drop);
  assert.ok(Math.abs(kid.speed - BALANCE.kinds[spec.type].speed * spec.speedMul) < 1e-9);
  assert.ok(Math.abs(Math.hypot(kid.x - enemy.x, kid.y - enemy.y) - spec.offset) < 1e-9,
    'it starts out from the wreck at the distance its numbers say');
  assert.ok(Math.abs(Math.hypot(kid.ix, kid.iy) - spec.impulse) < 1e-9,
    'and it is thrown clear at the speed they say');

  const lone = standing(17, 'drifter', 600, 600);
  const before = lone.field.enemies.length;
  killEnemy(lone.field, lone.enemy, true);
  assert.equal(lone.field.enemies.length, before - 1, 'a drifter leaves only its wreck');
});

test('a death effect belongs to dying, not to being shot', () => {
  // A tank that came apart in somebody else's blast - a bomber's, once there is one
  // - still hatches. What the payout is for is the other question, and it is asked
  // separately.
  const { field, enemy } = standing(23, 'tank', 600, 600);
  const spec = BALANCE.kinds.tank.split;

  killEnemy(field, enemy, false);

  assert.equal(field.enemies.length, spec.into, 'the hatchlings came, whoever did the killing');
  assert.equal(field.score, 0, 'and a death nobody shot is worth nothing to anybody');
});

test('wounding an enemy kills it exactly once, and says which it did', () => {
  const { field, enemy } = standing(24, 'drifter', 1200, 1200);

  assert.equal(damageEnemy(field, enemy, 1, true), false, 'a wound it survived');
  assert.equal(enemy.hp, BALANCE.kinds.drifter.hull - 1);
  assert.ok(enemy.flash > 0, 'and it shows the hit');

  const kills = field.kills;
  assert.equal(damageEnemy(field, enemy, 99, true), true, 'the last of it says so');
  assert.equal(field.kills, kills + 1, 'once, and not again on the way out');
  assert.equal(field.enemies.length, 0);
});

test('every kind there is can be killed, and pays out what its row says', () => {
  // The one test a new kind cannot skip: a row of balance data that forgets a field
  // only complains when something finally dies, which is never while you are looking.
  for (const name of Object.keys(KINDS)) {
    const stats = BALANCE.kinds[name];
    const { field, enemy } = standing(21, name, 1200, 1200);
    const sparks = field.particles.count;
    const rings = field.rings.count;
    const texts = field.texts.count;
    const shards = field.shards.count;
    const score = field.score;
    const kills = field.kills;

    killEnemy(field, enemy, true);

    assert.ok(!field.enemies.includes(enemy), name + ': it is still in the crowd after dying');
    assert.ok(field.particles.count > sparks, name + ': nothing burst out of it');
    assert.ok(field.rings.count > rings, name + ': no shockwave came off it');
    assert.equal(field.texts.count, texts + 1, name + ': no score label went up');
    assert.equal(field.shards.count, shards + enemy.drop, name + ': it owes ' + enemy.drop + ' shards');
    assert.equal(field.score, score + enemy.score, name + ': the score did not move by its worth');
    assert.equal(field.kills, kills + 1, name + ': the kill was not counted');
    assert.equal(field.texts.items[field.texts.count - 1].text, '+' + enemy.score,
      name + ': the label says something else');
    assert.ok(stats.death.particles > 0 && stats.death.debris > 0,
      name + ': its row says it dies without making anything');
  }
});

test('a kill that the player did not do pays nothing', () => {
  const { field, enemy } = standing(22, 'drifter', 1200, 1200);
  const score = field.score;

  killEnemy(field, enemy, false);

  assert.equal(field.score, score, 'a drifter that came apart on its own is not worth anything');
  assert.equal(field.texts.count, 0, 'and nothing was announced about it');
});

test('walking the crowd spends no randomness, so a walk cannot move a run', () => {
  const field = scriptedRun(18);
  // Every kind there is, so a new one cannot slip a draw into its walk unnoticed.
  // The darter starts within its `commit` range, so it runs a whole beat or two.
  const spots = [[1200, 1400], [1600, 1300], [1400, 1700], [1700, 1600], [1300, 1200]];
  const names = Object.keys(KINDS);
  names.forEach((name, i) => {
    const spot = spots[i % spots.length];
    field.enemies.push(makeEnemy(field, name, spot[0], spot[1]));
  });

  const state = logic.state;
  for (let i = 0; i < 240; i++) stepTheWorld();
  assert.equal(field.enemies.length, names.length, 'the crowd is still here');
  assert.equal(logic.state, state, 'not one draw from the stream a run is made of');
});
