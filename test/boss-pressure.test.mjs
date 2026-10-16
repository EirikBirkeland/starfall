// The ruler that reads what room a boss fight leaves (tools/boss-pressure.js).
//
// Session 139 found that the late game is a win and not a wall - a strong run beats all three fights
// without losing a hull from the tenth minute on - and that nothing here could argue with it, because
// every instrument measures the dodging and the bot steps off every telegraph it is shown.
// `boss-pressure.js` measures the fight instead: how much of the cage a ship may sit in and *stay*
// sitting in, which is a fact about the fight and not about the hands flying it. That claim is what
// this file holds, because a number nobody watched being made is a number to argue with and not to
// believe:
//
//   the room is the cage the duel is shut into, and a place outside it does not stand - a ship's
//     centre cannot be there, so it is not a place the fight is refusing;
//   a claim is the reach the hit itself would use - a body's `r + ship.r`, a shell's `r + ship.r`
//     walked forward across the horizon - and nothing looser, or the tool would be inventing danger;
//   a telegraph claims a place only when there is not a whole promise left to leave it in, which is
//     the difference between a warning and a wall and the hinge the whole measurement turns on;
//   a door a fight is holding open is standing room, because game/bosses.js honours it edge for edge,
//     and a sweep is claimed as an arc and not as a few bearings picked out of it;
//   and the free room is counted in pieces, because a shell can leave most of the cage free and put
//     all of it on the far side of a wall.
//
// What is *not* here is what the numbers say about the balance of a fight. That is a reading of the
// printed table - NOTES, session 147 - and not an assertion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { BALANCE } from '../src/game/balance.js';
import { world } from '../src/game/world.js';
import { enemyShotAt } from '../src/game/enemyshots.js';
import { looseArm } from '../src/game/arms.js';
import {
  armCount, armRate, armedCount, beatTimeLeft, bossCores, bossPhase, bossRiding, gapAngle,
  gapHalf, shellShot, spokeCount,
} from '../src/game/bosses.js';
import { bossOnTheField, scriptedRun, stepTheWorld } from '../tools/headless/scripted.js';
import { BIT, Room, bandShare, readRoom } from '../tools/boss-pressure.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'boss-pressure.js');
const HORIZON = BALANCE.bosses.telegraphMin;
const SHIP = world.player;
const WARDEN = 0;
const ECLIPSE = BALANCE.bosses.schedule.findIndex((row) => row.boss === 'eclipse');

function pressure(args) {
  return spawnSync(process.execPath, [TOOL, ...args], { cwd: ROOT, encoding: 'utf8' });
}

/** A fight that has just walked in: riding, with nothing of its own in the air yet. */
function freshly(index) {
  const field = scriptedRun(301);
  const boss = bossOnTheField(index === undefined ? WARDEN : index);
  field.enemyShots.clear();
  field.arms.clear();
  return { field, boss };
}

/** A room sized to the cage of the fight now on the field. */
function caged() {
  const room = new Room();
  room.open(world.field);
  return room;
}

/** Step until `seen` answers true, and say whether it ever did. */
function until(seen, seconds) {
  const step = BALANCE.sim.step;
  let ran = 0;
  while (ran < seconds) {
    if (seen()) return true;
    if (stepTheWorld()) ran += step;
  }
  return seen();
}

test('the room is the cage, and a place outside it does not stand', () => {
  const { boss } = freshly();
  assert.ok(boss, 'no fight to cage the room with');
  const box = world.field;
  const room = caged();

  assert.equal(room.cols, Math.floor((box.x1 - box.x0) / 10), 'the grid does not span the cage');
  assert.ok(room.total > 1000, 'a room of ' + room.total + ' places is not a measurement');
  assert.ok(room.total * 100 <= (box.x1 - box.x0) * (box.y1 - box.y0) + 1,
    'the grid counts places the cage does not have room for');

  // A ship's centre cannot be outside the room, so neither can a standable spot.
  assert.equal(room.stands(box.x0 - 100, (box.y0 + box.y1) / 2), false, 'the wall is not a wall');
  assert.equal(room.stands(box.x1 + 100, (box.y0 + box.y1) / 2), false);
  assert.equal(room.stands((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2), true,
    'the middle of an unclaimed cage does not stand');
});

test('a body claims exactly as far as a body hurts, and no further', () => {
  const { boss } = freshly();
  const room = caged();
  const body = boss.enemy;
  const box = world.field;
  const out = readRoom(room, boss, 0);
  const reach = body.r + SHIP.r;    // game/enemies.js' own test for a body touching the ship

  assert.ok(out.byBit.bodies > 0, 'the fight claims none of the room it stands in');
  assert.equal(out.byBit.shots, 0, 'something was in the air before the fight began');
  assert.equal(out.byBit.spokes, 0, 'a fight that is riding is firing spokes');

  // Measured in towards the middle of the room, which is where there is certainly room to measure.
  const inwards = Math.atan2((box.y0 + box.y1) / 2 - body.y, (box.x0 + box.x1) / 2 - body.x);
  const cos = Math.cos(inwards), sin = Math.sin(inwards);
  assert.equal(room.stands(body.x + cos * (reach - 2), body.y + sin * (reach - 2)), false,
    'a ship inside a body\'s reach stands free');
  assert.equal(room.stands(body.x + cos * (reach + 12), body.y + sin * (reach + 12)), true,
    'a ship outside a body\'s reach is claimed');
});

test('a shell claims the line it will have walked, and not the place it stands alone', () => {
  const { field, boss } = freshly();
  // The fight itself is set out of the room for this one, so the only claim on it is the one shell
  // being measured. Nothing is stepped after this, so the crowd can be set aside that far.
  field.enemies.length = 0;
  const room = caged();
  const box = world.field;
  const x = box.x0 + 150, y = box.y0 + 150;

  const spec = { speed: 300, radius: 7, life: 9, color: '#fff', caged: false };
  const shot = enemyShotAt(field, x, y, 1, 0, spec, 'warden');
  const out = readRoom(room, boss, HORIZON);
  const off = shot.r + SHIP.r;
  const flew = shot.vx * HORIZON;      // where it will have got to, off its own velocity

  assert.equal(out.byBit.bodies, 0, 'something still stands in a room that was emptied');
  assert.equal(out.byBit.shell, 0, 'the fight was arming a shell during a quiet read');
  assert.equal(room.stands(x, y), false, 'a shell claims nothing where it is standing');
  assert.equal(room.stands(x + flew * 0.5, y), false, 'a shell does not claim where it is off to');
  assert.equal(room.stands(x + flew, y), false, 'a shell does not claim where it arrives');
  assert.equal(room.stands(x + flew * 0.5, y + off + 16), true,
    'a shell claims the whole sky around its line');
  assert.equal(room.stands(x + flew + 40, y), true,
    'a shell claims further than the horizon it was read with');
});

test('a promise claims a place only when there is no whole promise left to leave it in', () => {
  const { field, boss } = freshly();
  const room = caged();

  // The Warden's first lock is drawn for longer than one promise, so both sides of the gate can be
  // caught in one ride: the same spokes, shown, with time to go and then with none.
  let early = null, late = null;
  const seen = until(() => {
    if (spokeCount(boss) === 0) return false;
    const left = beatTimeLeft(boss);
    if (early === null && left > HORIZON + 0.15) early = readRoom(room, boss, HORIZON);
    if (early !== null && late === null && left <= HORIZON - 0.05) {
      late = readRoom(room, boss, HORIZON);
    }
    return early !== null && late !== null;
  }, 40);

  assert.ok(seen, 'the ring never held a lock long enough to read both sides of the gate');
  assert.equal(field.boss, boss, 'the fight left the arena mid-look');
  assert.equal(early.byBit.spokes, 0,
    'a lock with ' + HORIZON + 's still to leave it in had already claimed the room');
  assert.ok(late.byBit.spokes > 0, 'a lock about to fire claimed none of the room');
});

test('a shell being armed walls the room off, with a door left in it', () => {
  // The Eclipse, because it throws a shell in every phase; the Warden's first act is spokes only.
  const { boss } = freshly(ECLIPSE);
  const room = caged();
  let read = null, edge = null, ring = 0, door = 0, half = 0, off = 0;

  const seen = until(() => {
    if (armedCount(boss) === 0) return false;
    const left = beatTimeLeft(boss);
    // Catch it late, with most of the promise spent: that is when the wall it will throw has the
    // furthest to have travelled by the end of the horizon, and so when the door is legible in it.
    if (left > HORIZON * 0.25) return false;
    const body = boss.enemy;
    const shot = shellShot(boss);
    const reach = shot.speed * (HORIZON - left) + shot.radius + SHIP.r;
    const skin = body.r + SHIP.r;
    if (reach < skin + 24) return false;          // no room yet to tell a door from a wall
    ring = skin + (reach - skin) * 0.6;           // between the fight's skin and the wall's edge
    read = readRoom(room, boss, HORIZON);
    edge = { x: body.x, y: body.y };
    door = gapAngle(boss);
    half = gapHalf(boss);
    off = door + half + 0.4;
    return true;
  }, 60);
  assert.ok(seen, 'the sun never armed a shell late enough to read');
  assert.equal(read.byBit.shots, 0, 'something was already in the air to be counted instead');
  assert.ok(read.byBit.shell > 0, 'a shell being armed claimed none of the room');

  // Walk the whole bearing at that radius: the wall claims most of it and the door is a gap in it.
  let free = 0, all = 0;
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    all++;
    if (room.stands(edge.x + Math.cos(a) * ring, edge.y + Math.sin(a) * ring)) free++;
  }
  assert.ok(free > 0, 'the wall is a wall all the way round: the door is claimed as wall');
  assert.ok(free < all, 'the shell claimed none of the bearing it was arming');
  assert.equal(room.stands(edge.x + Math.cos(door) * ring, edge.y + Math.sin(door) * ring), true,
    'the middle of the door does not stand free');
  assert.equal(room.stands(edge.x + Math.cos(off) * ring, edge.y + Math.sin(off) * ring), false,
    'a bearing a whole door-width past the door stands free');
});

test('a sweep is claimed while it is shown, and while its blades are loose', () => {
  const { field, boss } = freshly(ECLIPSE);
  const room = caged();
  // The sun's last phase is the only sweep in the game, so the fight has to be stood down into it -
  // the same thing the look does to measure a phase, and the test that it can.
  const share = bandShare(2);
  const stand = () => {
    for (const core of bossCores(boss)) core.enemy.hp = core.enemy.maxhp * share;
  };
  let early = null, shown = null, loose = null, rateShown = null, rateRide = null;

  const seen = until(() => {
    stand();
    if (bossRiding(boss) && rateRide === null) rateRide = armRate(boss);
    if (armCount(boss) > 0) {
      const left = beatTimeLeft(boss);
      if (early === null && left > HORIZON + 0.1) early = readRoom(room, boss, HORIZON);
      else if (shown === null && left <= HORIZON - 0.05) {
        shown = readRoom(room, boss, HORIZON);
        rateShown = armRate(boss);
      }
    }
    if (loose === null && world.arms.count > 0) loose = readRoom(room, boss, HORIZON);
    return early !== null && shown !== null && loose !== null && rateRide !== null;
  }, 120);

  assert.ok(seen, 'the sun never swept its arms');
  assert.equal(field.boss, boss, 'the fight left the arena mid-look');
  assert.equal(bossPhase(boss), 3, 'the sweep was read in some other phase');
  // The read API the look needs and the frame never asked for: the rate a shown fan turns at, and
  // nothing at all while the fight is riding between two beats.
  assert.equal(rateRide, 0, 'a fight showing no fan still says which way it would turn');
  assert.equal(rateShown, BALANCE.bosses.eclipse.phases[2].sweep.rate,
    'a shown fan does not say the rate its own row gave it');
  assert.equal(early.byBit.fan, 0,
    'a fan with a whole promise left to be out of it had claimed the room');
  assert.ok(shown.byBit.fan > 0, 'a fan about to be swept claimed none of the room');
  assert.ok(loose.byBit.blades > 0, 'a blade loose in the room claimed none of it');
});

test('a blade loose in the room claims the arc still in front of it, and not the one behind', () => {
  const { field, boss } = freshly(ECLIPSE);
  field.enemies.length = 0;          // the room empty but for the blade being measured
  const room = caged();
  const box = world.field;
  const sweep = BALANCE.bosses.eclipse.phases[2].sweep;
  // A pivot stood in the room with a blade due east off it, on the only sweep row the game has. The
  // fight itself is in phase 1 and riding, so this blade is the only claim on the room - which is
  // what makes the places below mean what they say, and why the pivot is put where it can be seen
  // end to end rather than taken from the fight.
  const pivot = { x: box.x0 + 120, y: (box.y0 + box.y1) / 2, r: 30, type: 'test' };
  const bare = readRoom(room, boss, HORIZON);
  const arm = looseArm(world, pivot, 0, sweep, '#fff');
  assert.equal(arm.spin, sweep.rate, 'a loose blade does not carry the rate its fan was swept at');

  const out = readRoom(room, boss, HORIZON);
  assert.ok(out.byBit.blades > 0, 'a blade loose across the room claimed none of it');
  assert.equal(out.byBit.fan, 0, 'the fight was showing a fan during a quiet read');
  assert.ok(bare.free - out.free > 0.02,
    'a blade loose across an empty room took ' + (bare.free - out.free) + ' of it');

  const along = pivot.r + 200;         // well out along the blade, clear of the body that holds it
  const at = (bearing) => room.stands(pivot.x + Math.cos(bearing) * along,
    pivot.y + Math.sin(bearing) * along);
  const where = Math.sign(sweep.rate);

  assert.equal(at(0), false, 'a place the blade is standing on stands free');
  assert.equal(at(0.24 * where), false, 'the middle of the swept arc stands free');
  assert.equal(room.stands(pivot.x + arm.inner - 12, pivot.y), true,
    'a place behind the blade\'s near end is claimed');
  assert.equal(at(0.3 * where), false, 'the arc the blade has still to travel is not claimed');
  assert.equal(at(-0.3 * where), true, 'the arc the blade has already gone is claimed as well');
  // A little past the end of the sweep, and off it by more than the blade is wide (230 x sin 0.12 =
  // 28 px, against a `half` of 20): the band's own width, checked through the arc it sweeps.
  assert.equal(at(0.6 * where), true, 'a place past the end of the sweep is claimed');
});

test('a door a fight is holding open is standing room', () => {
  const room = new Room();
  room.open({ x0: 0, y0: 0, x1: 400, y1: 400 });
  room.clear();
  // A wall of shots 90 px out from the middle, with a quarter-turn door facing +x.
  room.discExcept(BIT.shell, 200, 200, 90, 0, Math.PI / 4);

  assert.equal(room.stands(270, 200), true, 'the door is claimed: a shell has no gap in it');
  assert.equal(room.stands(200, 270), false, 'outside the door and inside the wall: standing free');
  assert.equal(room.stands(200, 120), false, 'the door is only a door on its own bearing');
  assert.equal(room.stands(340, 200), true, 'past the wall is claimed');
});

test('a wall across the room leaves two rooms, and the tool says so', () => {
  const room = new Room();
  room.open({ x0: 0, y0: 0, x1: 210, y1: 100 });
  room.clear();
  room.paint(BIT.blades, 90, -10, 110, 110, () => true);   // one band, straight down the middle

  const out = room.measure();
  assert.equal(out.spots, 2, 'a wall did not divide the room');
  assert.ok(out.biggest < 0.6 && out.biggest > 0.3,
    'the biggest piece is ' + out.biggest + ' of the room, and not about half of it');
  assert.ok(out.free > 0.8 && out.free < 1, 'a wall claimed the room as well as crossing it');
});

test('the hull a phase is held at is read off the marks, not written beside them', () => {
  const marks = BALANCE.bosses.atHull;
  assert.ok(Math.abs(bandShare(0) - (marks[0] + marks[1]) / 2) < 1e-12,
    'the first phase is not held in the middle of its own band');
  const last = marks.length - 1;
  assert.ok(Math.abs(bandShare(last) - marks[last] / 2) < 1e-12,
    'the last phase is not held in the middle of what is left of the bar');
  assert.ok(bandShare(0) < marks[0] && bandShare(0) > marks[1],
    'a phase held outside its own band would change phase under the ruler');
});

test('the look refuses a fight there is not, and a horizon there is not', () => {
  const wrong = pressure(['--boss', 'not-a-boss']);
  assert.equal(wrong.status, 2, 'an unknown fight was accepted');
  assert.match(wrong.stderr, /the schedule is/);

  assert.equal(pressure(['--horizon', 'nonsense']).status, 2, 'a horizon of "nonsense" passed');
  assert.equal(pressure(['--seconds', '0']).status, 2, 'a look of no length passed');
});

test('the whole look runs, and every phase gets a row', () => {
  const run = pressure(['--seconds', '6', '--boss', 'warden']);
  assert.equal(run.status, 0, run.stderr);
  const rows = run.stdout.split('\n').filter((line) => /^      \d  /.test(line));
  assert.equal(rows.length, BALANCE.bosses.warden.phases.length,
    'the table did not print one row per phase');
  assert.match(run.stdout, /THE WARDEN/);
});

test('the sent/s column is the fight\'s own tally over the watch', () => {
  // The column a pairing is priced with, so it had better be arithmetic and not a vibe: the fight's
  // counters over the seconds it was watched (game/bosses.js `bossShots` and its three siblings).
  const run = pressure(['--boss', 'warden', '--seconds', '20']);
  assert.equal(run.status, 0, run.stderr);
  const rows = run.stdout.split('\n').filter((line) => /^      \d  /.test(line));
  const sent = rows.map((line) => Number(line.trim().split(/\s+/)[7]));
  assert.equal(sent.length, BALANCE.bosses.warden.phases.length);
  for (const rate of sent) {
    assert.ok(rate > 0 && Number.isFinite(rate), 'a phase of the ring sent ' + rate + ' things a second');
  }

  // The first phase is one beat and nothing else: `spokes` beams out of every `wait + windup`, so
  // the column has to be that rate and not a number invented beside it.
  const one = BALANCE.bosses.warden.phases[0];
  const rate = one.spokes / (one.wait + one.windup);
  assert.ok(Math.abs(sent[0] - rate) / rate < 0.15,
    'phase 1 sends ' + sent[0] + ' a second, and its row says ' + rate.toFixed(2));
});
