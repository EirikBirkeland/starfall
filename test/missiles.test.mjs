// The Swarm (PLAN 3.2's fifth primary): a flight of slow micro-missiles that find a body of their
// own and go off where they land - as the simulation does it (game/missiles.js, game/bullets.js).
//
// There is no browser here, so a "frame" is one fixed step of the scripted world
// (tools/headless/scripted.js) and what can be promised is what the gun's own numbers say. One
// promise per decision in the header of game/missiles.js:
//
//   **it hunts, and never gives up** - a missile bends toward whatever it can see, at a rate and no
//     more, for as long as it is in the air; a body outside its reach is not hunted at all and the
//     shot flies where it was pointed until it dies of old age;
//   **nearest first** - of everything in reach it chases the closest body, which is what spreads a
//     flight of them across a crowd without anybody aiming;
//   **one body, one detonation** - a missile is spent on the first body it meets, so the pierce line
//     has nothing to pass through and the ricochet line nothing to turn, and what the run paid those
//     two lines for on this gun is exactly nothing;
//   **the blast spares what it hit** - the body the missile found pays the missile and nothing else,
//     and every *other* body inside the circle pays the share; the circle is paid out at the radius
//     the ring is drawn at;
//   **the blast never touches the ship** - the ship that fired it is not asked;
//   **what the lines are worth** - the damage line is in the shell before it left, the fire rate line
//     is the cycle, the bullet speed line is the one line that makes these arrive sooner, the split
//     line is one more missile, and a shot that does not hunt must not inherit a hunt from the last
//     one that did.
//
// One world per process, so every test parks its own scene in it with `swarmRun`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { clearCues, drainCues } from '../src/game/cues.js';
import { fire, setWeapon, shotsPerPull, WEAPONS } from '../src/game/weapons.js';
import { scriptedRun, enemyAt, stepTheWorld } from '../tools/headless/scripted.js';

const STEP = BALANCE.sim.step;
const GUN = BALANCE.weapons.swarm;
const MISSILE = GUN.missile;
const BLAST = MISSILE.blast;
const PULSE = BALANCE.weapons.pulse;
const SHOTS = BALANCE.bullets.hitRadius;

let field;

/** A run flying the Swarm, with an empty sky and a ship that cannot be hurt. */
function swarmRun(seed) {
  field = scriptedRun(seed);
  setWeapon(field, 'swarm');
  return field;
}

/** Hold the trigger for `seconds` of fixed steps, at whatever aim `extra` asks for. */
function holdTheTrigger(seconds, extra) {
  const input = Object.assign({ firing: true }, extra);
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) stepTheWorld(input);
}

/** Let the sky empty itself: nothing fired, everything still flying. */
function letItFly(seconds) {
  holdTheTrigger(seconds, { firing: false });
}

/** A body straight up the nose, `range` px from the ship, with `hp` to lose. */
function bodyAhead(range, hp) {
  const ship = field.player;
  return enemyAt('drifter', ship.x, ship.y - range, hp);
}

/** A body `across` px to the right of the nose and `up` px up it. */
function bodyBeside(across, up, hp) {
  const ship = field.player;
  return enemyAt('drifter', ship.x + across, ship.y - up, hp);
}

/** How many steps `seconds` is, so no loop here is ever unbounded. */
function stepsIn(seconds) {
  return Math.round(seconds / STEP);
}

/** The hull a body has lost out of what it was planted with. */
function lost(body, from) {
  return from - body.hp;
}

/** The heading a shot is going, and how far it is from the one it started on. */
function headingOf(shot) {
  return Math.atan2(shot.vy, shot.vx);
}

test('the row is a whole row, and it is the only one that hunts', () => {
  // game/missiles.js reads the Swarm's own row for the turn rate, the reach and the blast, which is
  // the one thing it assumes about the table. If a second homing gun ever arrives that row moves onto
  // the shot, and this test is where the assumption is written down.
  let hunting = 0;
  for (const offered of WEAPONS) {
    if (BALANCE.weapons[offered.id].missile !== undefined) hunting++;
  }
  assert.equal(hunting, 1, 'exactly one primary throws micro-missiles');

  assert.ok(MISSILE.turn > 0, 'it can turn');
  assert.ok(MISSILE.reach > 0, 'it can see');
  assert.ok(BLAST.radius > 0 && BLAST.share > 0 && BLAST.share < 1, 'it goes off, for less than itself');
  assert.ok(GUN.speed < BALANCE.ships.wisp.maxSpeed,
    'and it is slower than the ship, which is the whole of the counterplay: ' + GUN.speed);
  assert.ok(GUN.damage > PULSE.damage, 'a missile is heavier than the shot it is not');
});

test('a missile bends round on to the nearest body and a plain shot never does', () => {
  // The gun in one scene: a body standing well off the line it was fired along, inside reach. The
  // Swarm's shot curves onto it and kills it; the same body, fired by the pulse, is never touched -
  // which is the difference between this gun and the one every number is priced against.
  swarmRun(600);
  const aside = bodyBeside(120, 90, 1000);

  fire(field);
  let hit = false;
  for (let i = 0; i < stepsIn(2); i++) {
    stepTheWorld({});
    if (lost(aside, 1000) > 0) { hit = true; break; }
  }
  assert.ok(hit, 'the missile found it: ' + lost(aside, 1000).toFixed(2) + ' hull off');

  const scene = scriptedRun(601);
  setWeapon(scene, 'pulse');
  const missed = bodyBeside(120, 90, 1000);
  fire(scene);
  letItFly(2);
  assert.equal(lost(missed, 1000), 0, 'and the pulse shot flew straight past the same body');
});

test('it turns at its rate and no faster', () => {
  // The turn is a rate and not a snap: one step may bend the heading by `turn * dt` and nothing more,
  // or the gun would be a searchlight and the player's aim would be decoration.
  swarmRun(602);
  const aside = bodyBeside(200, 30, 100000);

  fire(field);
  const shot = field.bullets.items[0];
  const from = headingOf(shot);
  let worst = 0;
  for (let i = 0; i < stepsIn(0.5); i++) {
    if (field.bullets.items.indexOf(shot) === -1) break;   // it landed; the turning is over
    const before = headingOf(shot);
    stepTheWorld({});
    let delta = headingOf(shot) - before;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    worst = Math.max(worst, Math.abs(delta));
  }
  assert.ok(aside.hp > 0, 'the body is still standing, so the missile has been turning all along');
  assert.ok(worst <= MISSILE.turn * STEP + 1e-9,
    'never more than ' + MISSILE.turn + ' rad/s: ' + (worst / STEP).toFixed(3));
});

test('a body out of reach is not chased, and the shot dies of old age', () => {
  swarmRun(603);
  const far = bodyBeside(MISSILE.reach + 260, 40, 1000);

  fire(field);
  const shot = field.bullets.items[0];
  const from = headingOf(shot);
  letItFly(GUN.life / 2);
  assert.equal(field.bullets.count, 1, 'the missile is still in the air');
  assert.ok(Math.abs(headingOf(field.bullets.items[0]) - from) < 1e-9,
    'with nothing in reach it flies exactly where it was pointed');
  letItFly(GUN.life);
  assert.equal(field.bullets.count, 0, 'and then its fuse runs out');
  assert.equal(lost(far, 1000), 0, 'and the body it could not see is none the worse');
});

test('of everything in reach it chases the nearest', () => {
  swarmRun(604);
  const near = bodyBeside(60, 140, 1000);
  const far = bodyBeside(60, 260, 1000);

  fire(field);
  letItFly(1.2);
  assert.ok(lost(near, 1000) > 0, 'the close one paid');
  assert.equal(lost(far, 1000), 0, 'and the one behind it is 120 px further out than the blast');
});

test('the body it lands on pays the missile, and the crowd around it pays the blast', () => {
  swarmRun(605);
  const hit = bodyAhead(200, 10000);
  // How far short of a body's middle a shot is met: the body's own width and the shot's own radius.
  // The blast is paid out from where it went off, which is somewhere inside that much of the middle,
  // so both of the placements below are clear of the line by more than that.
  const edge = hit.r + SHOTS;
  const inside = bodyBeside(BLAST.radius - edge - 2, 200, 10000);
  const outside = bodyBeside(BLAST.radius + edge + 2, 200, 10000);

  fire(field);
  letItFly(1.5);

  assert.ok(Math.abs(lost(hit, 10000) - GUN.damage) < 1e-9,
    'the body it hit pays the shell and nothing else: ' + lost(hit, 10000));
  assert.ok(Math.abs(lost(inside, 10000) - GUN.damage * BLAST.share) < 1e-9,
    'one inside the circle pays the share: ' + lost(inside, 10000));
  assert.equal(lost(outside, 10000), 0, 'and one outside it pays nothing at all');
});

test('the ship that fired it is never inside its own blast', () => {
  swarmRun(606);
  const ship = field.player;
  ship.invuln = 0;
  const hull = ship.hull;
  // Close enough that the detonation is inside the circle round the ship's own middle, which is
  // exactly the case that would punish a player for firing at anything standing next to them.
  bodyAhead(40, 10000);

  fire(field);
  letItFly(1);
  assert.equal(ship.hull, hull, 'the hull is untouched: ' + ship.hull);
});

test('a missile is spent on the first body, and the two travelling-shot lines buy nothing', () => {
  const once = (pierceRanks, ricochetRanks) => {
    const scene = scriptedRun(607);
    setWeapon(scene, 'swarm');
    scene.upgrades.pierce = pierceRanks;
    scene.upgrades.ricochet = ricochetRanks;
    const hit = bodyAhead(200, 10000);
    const behind = bodyBeside(18, 240, 10000);      // inside the blast, outside the missile's path
    fire(scene);
    letItFly(1.5);
    return {
      hit: lost(hit, 10000),
      behind: lost(behind, 10000),
      left: scene.bullets.count,
    };
  };

  const plain = once(0, 0);
  const both = once(BALANCE.upgrades.pierce.ranks, BALANCE.upgrades.ricochet.ranks);
  assert.deepEqual(both, plain, 'the same hull off both bodies, and no shot left in the air');
  assert.equal(plain.left, 0, 'one missile, one detonation, one less missile');
});

test('the blast kills, and a body the blast finishes comes apart', () => {
  swarmRun(608);
  const hit = bodyAhead(200, 10000);
  // Less than the blast is worth, so the only thing that can finish it is the blast
  // (BALANCE.weapons.swarm.missile.blast.share).
  const frail = bodyBeside(20, 200, BLAST.share * GUN.damage * 0.9);

  fire(field);
  letItFly(1.5);
  assert.ok(hit.hp > 0, 'the big body took the missile and lived');
  assert.ok(frail.hp <= 0 || field.enemies.indexOf(frail) === -1,
    'and the frail one beside it was finished by the blast');
});

test('the damage line is in the shell before it left the trigger', () => {
  swarmRun(609);
  const body = bodyAhead(200, 10000);
  fire(field);
  letItFly(1.5);
  assert.ok(Math.abs(lost(body, 10000) - GUN.damage) < 1e-9, 'what the row says');

  field.upgrades.damage = 2;
  body.hp = 10000;
  fire(field);
  letItFly(1.5);
  assert.ok(Math.abs(lost(body, 10000) - GUN.damage * (1 + BALANCE.upgrades.damage.step * 2)) < 1e-9,
    'and the ranks taken after that first pull are in the next one');
});

test('the bullet speed line is the one line that makes them arrive sooner', () => {
  // It is worth more here than on any other gun in the game, and this is the number that says so: the
  // shells have the same ground to cross either way, so the line buys the whole of the flight.
  const secondsUntilHit = (ranks) => {
    const scene = scriptedRun(610);
    setWeapon(scene, 'swarm');
    scene.upgrades.bulletSpeed = ranks;
    const body = bodyAhead(420, 10000);
    fire(scene);
    let t = 0;
    while (body.hp >= 10000 && t < 8) {
      stepTheWorld({});
      t += STEP;
    }
    assert.ok(body.hp < 10000, 'it arrived in ' + t.toFixed(2) + 's');
    return t;
  };

  const slow = secondsUntilHit(0);
  const quick = secondsUntilHit(BALANCE.upgrades.bulletSpeed.ranks);
  assert.ok(quick < slow, slow.toFixed(2) + 's against ' + quick.toFixed(2) + 's');
  const gain = 1 + BALANCE.upgrades.bulletSpeed.step * BALANCE.upgrades.bulletSpeed.ranks;
  assert.ok(Math.abs(slow / quick - gain) < 0.25,
    'and by about the speed it bought: ' + (slow / quick).toFixed(2) + ' against ' + gain.toFixed(2));
});

test('the split line is one more missile, hunting on its own', () => {
  swarmRun(611);
  const split = BALANCE.upgrades.split;
  field.upgrades.split = split.ranks;
  assert.equal(shotsPerPull(field), GUN.pellets + split.ranks, 'one missile each, plus the extras');

  fire(field);
  const shots = field.bullets.items.slice(0);
  assert.equal(shots.length, GUN.pellets + split.ranks, 'as many missiles as the pull was worth');
  for (const shot of shots) {
    assert.equal(shot.hunts, true, 'every one of them hunts');
    assert.equal(shot.splash, BLAST.radius, 'and every one of them goes off');
  }
  field.upgrades.split = 0;
});

test('the sound is one per pull, and it leaves rather than strikes', () => {
  swarmRun(612);
  clearCues();
  fire(field);
  const cues = [];
  drainCues((cue) => cues.push(cue));
  assert.equal(cues.length, 1, 'one report a pull, however many shells came with it');
  assert.ok(cues[0].slideTo > cues[0].freq, 'and it slides up: the missile is off and going');

  clearCues();
  bodyAhead(200, 10000);
  letItFly(1.5);
  const report = [];
  drainCues((cue) => report.push(cue));
  assert.ok(report.length >= 1, 'and the blast makes its own crack when it lands');
});

test('a plain shot fired after a missile does not inherit the hunt', () => {
  // The pool contract, on the two newest fields: a recycled shell that still steered would give the
  // pulse a gun the player did not pick, and one that still went off would be a bomb in their magazine.
  swarmRun(613);
  fire(field);
  assert.equal(field.bullets.items[0].hunts, true, 'the Swarm shots hunt');
  field.bullets.clear();

  setWeapon(field, 'pulse');
  fire(field);
  for (const shot of field.bullets.items) {
    assert.equal(shot.hunts, false, 'and the pulse ones do not');
    assert.equal(shot.splash, 0, 'and they do not go off where they land');
  }
});
