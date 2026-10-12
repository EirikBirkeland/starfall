// The lance (PLAN 3.2's fourth primary): a line of light down the arena, bought with a wind-up and
// paid out to everything standing on the line at once - as the simulation does it.
//
// There is no browser here, so a "frame" is one fixed step of the scripted world
// (tools/headless/scripted.js) and what can be promised is what the gun's own numbers say. The file
// holds one promise per decision in the header of game/lance.js:
//
//   **the wind-up is a window and not a tax** - nothing leaves the ship while it runs, the band
//     tracks the nose across all of it, the tell counts up over it, and the cycle is the longer of
//     the two waits, so a real run cannot pull twice into one wind-up;
//   **the beam is one instant** - everything on the line at that instant pays once, what is off it or
//     behind the ship does not, and the light left behind hurts nobody;
//   **the line is measured at exactly the width it is drawn at** - a centre on the edge is on it and
//     a centre half a pixel past the edge is not, which is the promise every area effect here signs;
//   **it belongs to the ship** - never the ship that fired it, never behind it, and it carries this
//     gun's own fire and frost like any other shell of it;
//   **what the upgrade lines are worth on it** - damage and fire rate multiply it, the split line
//     fans it into more lines at a share each, the overcharge loads it like any other pull, and the
//     three lines that are a *travelling shot's* business buy exactly nothing;
//   **and the gun's own worth**, measured on one body at 200 px in the same instrument
//     test/scatter.test.mjs uses, because "six of a pulse shot at nine tenths of a pull a second" is
//     a sentence about a ratio and this file is the number.
//
// One world per process, so every test parks its own scene in it with `lanceRun`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { clearCues } from '../src/game/cues.js';
import { hear } from '../tools/headless/hear.js';
import { resetRun } from '../src/game/run.js';
import { fire, setWeapon, shotsPerPull, shotsPerSecond } from '../src/game/weapons.js';
import { windOf } from '../src/game/lance.js';
import { frostOf } from '../src/game/chill.js';
import { isAlight } from '../src/game/burn.js';
import { isLoaded } from '../src/game/overcharge.js';
import { scriptedRun, enemyAt, stepTheWorld } from '../tools/headless/scripted.js';

const STEP = BALANCE.sim.step;
const GUN = BALANCE.weapons.lance;
const BEAM = GUN.beam;
const PULSE = BALANCE.weapons.pulse;
const RANGE = 200;

let field;

/** A run flying the lance, with an empty sky and a ship that cannot be hurt. */
function lanceRun(seed) {
  field = scriptedRun(seed);
  setWeapon(field, 'lance');
  return field;
}

/** Hold the trigger for `seconds` of fixed steps, at whatever aim `extra` asks for. */
function holdTheTrigger(seconds, extra) {
  const input = Object.assign({ firing: true }, extra);
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) stepTheWorld(input);
}

/** Let the gun sit cold for `seconds` - no trigger, no new wind-up. */
function letItCool(seconds) {
  holdTheTrigger(seconds, { firing: false });
}

/** Pull the trigger and let the gun go off: the wind-up and the beam, in one call. */
function pullAndFire() {
  fire(field);
  holdTheTrigger(BEAM.wind * 2);
}

/** A body on the nose, `range` px away (negative is behind the ship), with `hp` to lose. */
function bodyAhead(range, hp) {
  const ship = field.player;
  return enemyAt('drifter', ship.x, ship.y - range, hp);
}

/** A body `across` px to the right of the nose and `range` px up it. */
function bodyBeside(across, range, hp) {
  const ship = field.player;
  return enemyAt('drifter', ship.x + across, ship.y - range, hp);
}

/** Every cue one pull of the trigger asked the audio layer for. */
function cuesOfPull() {
  clearCues();
  fire(field);
  return hear();
}

/** The hull a body has lost out of what it was planted with. */
function lost(body, from) {
  return from - body.hp;
}

test('the gun is a whole row of numbers, and no upgrade line can fold a pull into a wind-up', () => {
  assert.equal(GUN.pellets, 1, 'one line a pull, before the split line fans it');
  assert.ok(GUN.damage > PULSE.damage, 'and a line of it is heavier than a shot of the pulse');
  assert.ok(GUN.recoil > BALANCE.weapons.scatter.recoil, 'and it has the heaviest kick in the game');
  assert.ok(BEAM.halfWidth > BALANCE.player.hitRadius, 'the line is wider than the ship is');
  assert.ok(BEAM.light.life > BEAM.wind, 'and the light outlives the wind-up that announced it');

  // The one wind-up-at-a-time rule is a floor and not a feature: the wind-up has to fit inside the
  // fastest cycle the fire rate line can reach, or a maxed build would be pulling the trigger on a
  // gun that was still humming and quietly losing shots.
  const fastest = GUN.fireRate * (1 + BALANCE.upgrades.fireRate.step * BALANCE.upgrades.fireRate.ranks);
  assert.ok(BEAM.wind < 1 / fastest,
    'the wind-up fits inside the fastest cycle: ' + BEAM.wind + ' s of ' + (1 / fastest).toFixed(3));
});

test('the wind-up throws nothing, and then the beam does', () => {
  lanceRun(500);
  const body = bodyAhead(RANGE, 1000);

  fire(field);
  assert.ok(field.lance.wind > 0, 'the gun is humming');
  assert.equal(windOf(field), 0, 'and the tell is at the start of its count');
  assert.equal(field.bullets.count, 0, 'and it has thrown no shot to fly');
  assert.equal(field.lance.beams.count, 0, 'and no light has been left behind yet');
  assert.equal(lost(body, 1000), 0, 'and the body standing on the line has lost nothing');

  holdTheTrigger(BEAM.wind / 2);
  assert.equal(field.lance.fired, 0, 'half way through the wind-up it still has not gone off');
  const half = windOf(field);
  assert.ok(half > 0.2 && half < 0.8, 'and the tell is halfway up its own count: ' + half);

  holdTheTrigger(BEAM.wind);
  assert.equal(field.lance.fired, 1, 'and by the end of the wind-up, it has');
  assert.equal(lost(body, 1000), GUN.damage, 'and the body on the line paid for it, once');
  assert.equal(field.lance.beams.count, 1, 'and the light of it is in the pool to be seen');

  letItCool(0.5);
  assert.equal(field.lance.fired, 1, 'and nothing else went off once the trigger was let go');
  assert.equal(windOf(field), 0, 'a cold gun has no tell at all');
});

test('the band tracks the nose, so the line that fires is the line that was shown', () => {
  // The whole skill of the gun in one test. The wind-up is the window in which the line can still be
  // walked onto what you are aiming at, and a body that is not on the line when the beam arrives is
  // simply not hurt by it (game/lance.js). The first body is where the trigger was pulled; the
  // second is where the aim was walked to while the gun was humming.
  lanceRun(501);
  const ship = field.player;
  const shown = bodyAhead(RANGE, 1000);
  const walked = bodyBeside(150, RANGE, 1000);

  fire(field);
  stepTheWorld({ firing: true, aimX: walked.x, aimY: walked.y });
  assert.ok(Math.abs(ship.angle - Math.atan2(walked.y - ship.y, walked.x - ship.x)) < 0.01,
    'the nose has come round to the new aim');

  holdTheTrigger(BEAM.wind * 2, { aimX: walked.x, aimY: walked.y });
  assert.equal(lost(walked, 1000), GUN.damage, 'the beam went where the aim ended up');
  assert.equal(lost(shown, 1000), 0, 'and not where it began');
});

test('a body that walks off the band during the wind-up is not hit by it', () => {
  // What the wind-up costs, stated as a promise: the beam is the band that was shown and nothing
  // else, so a body that leaves it is simply not in the way when it lands. A darter crossing the
  // line at full speed covers `speed x wind` - thirty-four px, more than the line's own width and
  // more than its body radius as well - while a drifter covers fifteen, which the width forgives
  // (BALANCE.kinds). The gun's answer to a fast body is to lead it, and the band is how you learn to.
  lanceRun(502);
  const crossed = bodyBeside(40, RANGE, 1000);

  fire(field);
  stepTheWorld({});
  crossed.x += BALANCE.kinds.darter.speed * BEAM.wind;
  letItCool(BEAM.wind * 2);
  assert.equal(lost(crossed, 1000), 0, 'it was off the line when the beam arrived');
  assert.equal(field.lance.fired, 1, 'and the beam went off all the same');
});

test('everything on the line pays once, and nothing off it or behind it does', () => {
  lanceRun(503);
  const near = bodyAhead(60, 1000);
  const far = bodyAhead(600, 1000);
  const away = bodyBeside(BEAM.halfWidth + 1, 300, 1000);
  const behind = bodyAhead(-120, 1000);

  pullAndFire();
  assert.equal(lost(near, 1000), GUN.damage, 'the body next to the ship');
  assert.equal(lost(far, 1000), GUN.damage,
    'and the one six hundred px out - the line reaches, whatever the range');
  assert.equal(lost(away, 1000), 0, 'and not the one standing a hair off it');
  assert.equal(lost(behind, 1000), 0, 'and nothing behind the ship: a lance fires forwards');
});

test('the line is measured from a centre, at exactly the width it is drawn at', () => {
  // The promise every area effect in the game signs: the ring, band or circle a player is shown is
  // the ground the damage is paid on, edge for edge. Here that means a centre at `halfWidth` off the
  // axis is on the line and a centre a hair past it is not - and test/lance-art.test.mjs holds that
  // the light is painted at this same number and not a wider one.
  lanceRun(504);
  const on = bodyBeside(BEAM.halfWidth, RANGE, 1000);
  const off = bodyBeside(BEAM.halfWidth + 0.5, RANGE, 1000);

  pullAndFire();
  assert.equal(lost(on, 1000), GUN.damage, 'a centre on the edge is on the line');
  assert.equal(lost(off, 1000), 0, 'and a centre half a pixel past it is not');
});

test('the light is a record and not a hazard: it hurts nobody, then it is gone', () => {
  lanceRun(505);
  const body = bodyBeside(300, RANGE, 1000);

  pullAndFire();
  assert.equal(lost(body, 1000), 0, 'the beam went up the nose and this body was beside it');

  const beams = field.lance.beams;
  assert.ok(beams.count > 0, 'and there is light hanging where it went');
  // Walk the body onto that light. It is the record of a flash that already happened somewhere
  // else, so it hurts nobody (game/lance.js, and game/arc.js before it).
  const line = beams.items[0];
  body.x = line.x + line.dirX * RANGE;
  body.y = line.y + line.dirY * RANGE;
  letItCool(0.1);
  assert.equal(lost(body, 1000), 0, 'and it is a thing that happened, not a place that lasts');

  letItCool(BEAM.light.life + 0.1);
  assert.equal(field.lance.beams.count, 0, 'and then the light is gone');
});

test('one wind-up at a time: a second pull while the gun is humming buys nothing', () => {
  lanceRun(506);
  const body = bodyAhead(RANGE, 10000);

  fire(field);
  stepTheWorld({});
  const armed = field.lance.wind;
  const pulls = field.lance.pulls;
  fire(field);
  assert.equal(field.lance.wind, armed, 'the wind-up was neither restarted nor doubled');
  assert.equal(field.lance.pulls, pulls, 'and the second pull is not even counted');

  holdTheTrigger(BEAM.wind + 0.05);
  assert.equal(field.lance.fired, 1, 'one discharge came out of the two pulls');
  assert.equal(field.lance.beams.count, 1, 'and one line of light, and not two');
  assert.equal(lost(body, 10000), GUN.damage, 'and the body on the line was hurt once');
});

test('the ship is shoved back when the beam leaves, not when the trigger moves', () => {
  lanceRun(507);
  const ship = field.player;

  fire(field);
  assert.equal(ship.vy, 0, 'the pull itself moves the ship nothing at all');

  holdTheTrigger(BEAM.wind + 0.02);
  assert.ok(ship.vy > GUN.recoil * 0.5, 'the discharge kicks it back down the nose: ' + ship.vy);
});

test('a pull that winds up is one sound, and the discharge is another', () => {
  lanceRun(508);
  const cues = cuesOfPull();
  assert.equal(cues.length, 1, 'the wind-up is one note');
  assert.equal(cues[0].freq, BEAM.charge.freq);
  assert.ok(cues[0].slideTo > cues[0].freq, 'and it slides up, which is what a wind-up sounds like');

  clearCues();
  holdTheTrigger(BEAM.wind + 0.02);
  const report = hear();
  assert.equal(report.length, 1, 'and the report is one sound, however many lines came with it');
  assert.ok(report[0].slideTo < report[0].freq, 'and it slides down, for a change');
});

test('the line carries this gun\'s own fire and frost, like any other shell of it', () => {
  lanceRun(509);
  field.upgrades.burn = 1;
  field.upgrades.chill = 1;
  const body = bodyAhead(RANGE, 10000);

  pullAndFire();
  assert.ok(isAlight(field, body), 'the beam set it alight');
  assert.ok(frostOf(body) > 0, 'and left it colder than it found it');
});

test('the ship that fired it is never on its own line', () => {
  lanceRun(510);
  const ship = field.player;
  ship.invuln = 0;
  const hull = ship.hull;

  // The ship's own middle is the near end of every beam, and `axisDistance` would say it is on the
  // line - so what holds the promise is that game/lance.js never asks about the ship at all. Sweep
  // the aim through a whole turn and fire the whole way round: nothing comes back for the ship.
  const steps = Math.round(4 / STEP);
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 6.283;
    stepTheWorld({
      firing: true,
      aimX: ship.x + Math.cos(angle) * 100,
      aimY: ship.y + Math.sin(angle) * 100,
    });
  }
  assert.ok(field.lance.fired > 2, 'the gun went off several times: ' + field.lance.fired);
  assert.equal(ship.hull, hull, 'and none of it came back to hurt the ship');
});

test('the damage line is in the beam before it ever left the trigger', () => {
  lanceRun(511);
  const body = bodyAhead(RANGE, 100000);

  pullAndFire();
  assert.equal(lost(body, 100000), GUN.damage, 'one line costs a body what the row says');

  field.upgrades.damage = 2;
  body.hp = 100000;
  pullAndFire();
  // Off a body planted at a hundred thousand hull, a hull lost and regained is float dust: the row's
  // own product and what came off the body agree to well inside a thousandth of a point, and asking
  // them for exact bits is a test that breaks whenever the row is retuned (session 96 moved it).
  const ranks = GUN.damage * (1 + BALANCE.upgrades.damage.step * 2);
  assert.ok(Math.abs(lost(body, 100000) - ranks) < 1e-6,
    'and the ranks taken after that first pull are in the next one');
});

test('the fire rate line shortens the wait between beams and nothing else', () => {
  lanceRun(512);
  assert.equal(shotsPerSecond(field), GUN.fireRate, 'its own cycle to start with');

  /** How many beams come out of `seconds` of held trigger, from a cold gun on a fresh cycle. */
  function beamsIn(seconds) {
    field.lance.fired = 0;
    field.player.fireTimer = 0;
    holdTheTrigger(seconds);
    return field.lance.fired;
  }

  const plain = beamsIn(4);
  // Counted off the row and not off a remembered number: this is the test that says the fire rate
  // line moves the cycle and nothing else, and the cycle is the row's own (2.6 pulls a second since
  // session 96 priced this gun in bodies).
  const expected = Math.round(GUN.fireRate * 4);
  assert.ok(Math.abs(plain - expected) <= 1,
    'four seconds of the plain cycle is ' + plain + ' beams, against the row\'s ' + expected);

  field.upgrades.fireRate = 2;
  const faster = GUN.fireRate * (1 + BALANCE.upgrades.fireRate.step * 2);
  assert.equal(shotsPerSecond(field), faster, 'the line multiplies it like every other gun');

  const quick = beamsIn(4);
  assert.ok(quick > plain, 'and the beams come ' + plain + ' against ' + quick + ' a window');
  assert.ok(quick <= Math.ceil(faster * 4), 'and never more than the cycle allows');
});

test('the split line fans the beam into more lines, each at its share', () => {
  lanceRun(513);
  const split = BALANCE.upgrades.split;
  field.upgrades.split = split.ranks;
  assert.equal(shotsPerPull(field), GUN.pellets + split.ranks, 'one line each, plus the extras');

  const ship = field.player;
  const home = { x: ship.x, y: ship.y };

  // Where the fan's lines go is the gun's own business, so the test asks the gun: a first pull into
  // an empty sky leaves one beam per line, and each of them knows which line of the pull it was.
  pullAndFire();
  const lines = field.lance.beams.items.slice(0).map((line) => ({
    dirX: line.dirX, dirY: line.dirY, rank: line.rank,
  }));
  assert.equal(lines.length, GUN.pellets + split.ranks, 'as many lines as the pull was worth');
  assert.notEqual(lines[1].dirX, lines[2].dirX, 'and they do not all point the same way');

  // A gun is shoved backwards by its own report, so the ship is put back where it was: the second
  // pull throws the same fan from the same place, and that is the only way a body can be planted on
  // a line the test has not drawn itself.
  field.lance.beams.clear();
  field.lance.fired = 0;
  ship.x = ship.px = home.x;
  ship.y = ship.py = home.y;
  ship.vx = 0;
  ship.vy = 0;

  // Planted well out, where two neighbouring lines of the fan are further apart than the lines are
  // wide - so each of these bodies is standing on exactly one line and can only be hurt by it.
  const bodies = lines.map((line) => enemyAt('drifter',
    ship.x + line.dirX * 400, ship.y + line.dirY * 400, 1000));

  pullAndFire();
  assert.equal(field.lance.fired, lines.length, 'the second pull threw the same fan');
  assert.equal(lost(bodies[0], 1000), GUN.damage, 'the aimed line is a whole one');
  for (let i = 1; i < bodies.length; i++) {
    // A thousand hull and a share of a three-hull line are not exact in binary; what is promised is
    // the share and not the last bit of it.
    const share = GUN.damage * split.share;
    assert.ok(Math.abs(lost(bodies[i], 1000) - share) < 1e-6,
      'line ' + i + ' costs a share, exactly as an extra pellet does');
  }
});

test('the overcharge loads a lance pull, and the charge is spent when the beam leaves', () => {
  lanceRun(514);
  field.upgrades.overcharge = 1;
  const boost = 1 + BALANCE.upgrades.overcharge.step * 1;
  const body = bodyAhead(RANGE, 100000);

  // Standing still with the line owned is what loads a gun (game/overcharge.js), and a lance ship
  // can do nothing else while the thing winds up - which is the one place the two cards agree.
  letItCool(BALANCE.upgrades.overcharge.hold + 0.1);
  assert.ok(isLoaded(field), 'the gun is loaded');

  pullAndFire();
  assert.equal(lost(body, 100000), GUN.damage * boost, 'and the beam is worth the load');
  assert.equal(field.lance.beams.items[0].charged, true, 'and it is painted as a loaded one');
  assert.ok(!isLoaded(field), 'and the charge went with the beam, not with the trigger');
});

test('the three lines that are a travelling shot\'s business buy nothing at all', () => {
  // Pierce, ricochet and bullet speed are all about what a shell does after it leaves and how far it
  // gets to. A lance's beam leaves and gets there in the same instant, so there is nothing for them
  // to do - the same reading that leaves two of them off the arc (game/arc.js). Said out loud here
  // because a card that does nothing on a gun is a thing the player is entitled to be told.
  lanceRun(515);
  const seen = [];
  for (const ranks of [0, BALANCE.upgrades.pierce.ranks]) {
    field.upgrades.pierce = ranks;
    field.upgrades.ricochet = ranks;
    field.upgrades.bulletSpeed = ranks;
    const body = bodyAhead(RANGE, 100000);
    pullAndFire();
    seen.push(lost(body, 100000));
  }
  assert.deepEqual(seen, [GUN.damage, GUN.damage], 'the same hull off the body either way');
});

test('one body, at 200 px, with the cursor parked on where it was', () => {
  // The number the row was priced on, in the instrument test/scatter.test.mjs uses: one body, one
  // parked cursor, the clock. A body that walks *at* the line stays on it and so costs the gun
  // nothing - the honest half of what a wind-up does and does not cost, and the reason `wind` can be
  // as short as it is. What it does cost is a body that crosses, which is what the gun-clock prints
  // and what the row's own comment quotes.
  const HULL = 30;
  const DRIFTER = BALANCE.kinds.drifter.speed;

  function killSeconds(seed, walk) {
    const scene = scriptedRun(seed);
    setWeapon(scene, 'lance');
    const ship = scene.player;
    const target = { x: ship.x, y: ship.y - RANGE };
    const body = enemyAt('drifter', target.x, target.y, HULL);
    if (walk) body.speed = DRIFTER;

    let t = 0;
    while (body.hp > 0 && t < 20) {
      stepTheWorld({ firing: true, aimX: target.x, aimY: target.y });
      t += STEP;
    }
    assert.equal(body.hp, 0, 'the body died');
    return t;
  }

  let still = 0;
  let walking = 0;
  for (let seed = 1; seed <= 3; seed++) {
    still += killSeconds(seed, false);
    walking += killSeconds(seed, true);
  }
  still /= 3;
  walking /= 3;

  // How long the row says it takes: as many whole beams as the hull needs, at the row's own cycle,
  // plus the wind-up the first one spends. Priced in beams and not in a remembered number of seconds,
  // because session 96 moved the row and what this test holds is the relation and not a stopwatch.
  const beams = Math.ceil(HULL / GUN.damage);
  const wanted = (beams - 1) / GUN.fireRate + BEAM.wind;
  assert.ok(Math.abs(still - wanted) < 0.6,
    beams + ' beams of ' + GUN.damage + ' hull take ' + still.toFixed(2)
      + 's against the ' + wanted.toFixed(2) + 's the row\'s own numbers say');
  assert.ok(Math.abs(still - walking) < 0.5,
    'and a body walking at the line dies no slower: ' + walking.toFixed(2) + 's');
  assert.ok(HULL / still > PULSE.damage * PULSE.fireRate * 0.85,
    (HULL / still).toFixed(2) + ' hull a second against the pulse\'s '
      + (PULSE.damage * PULSE.fireRate).toFixed(2));
});

test('a run that never pulls the trigger never sees a beam, and a restart forgets one', () => {
  lanceRun(516);
  const body = bodyAhead(RANGE, 1000);
  letItCool(2);
  assert.equal(field.lance.fired, 0, 'no pull, no beam');
  assert.equal(body.hp, 1000);

  fire(field);
  assert.ok(field.lance.wind > 0, 'and now there is a wind-up underway');

  // A wind-up that was never allowed to finish must not go off for the next run's ship, and the last
  // one's light must not shine over the title screen (game/run.js).
  resetRun(field);
  assert.equal(field.lance.wind, 0, 'the wind-up went with the run that wound it');
  assert.equal(field.lance.beams.count, 0, 'and so did the light');
  assert.equal(field.lance.fired, 0, 'and what the gun did is that run\'s scorecard, not this one\'s');
});
