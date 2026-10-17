// The challenge modifiers (PLAN, After 1.0): a harder set of rules for the next run, chosen between
// runs, said out loud everywhere a run's facts are said, and read by the simulation only where the
// number each rule changes is already read.
//
// Three halves. The first is the module on its own, with no browser and no run: the cycle, the four
// levers the sim asks, the deck's gate, and the words - including the two sentences that are *built*
// out of a number, which is the only way a card cannot go stale when its number moves. The second
// is the sim, through a real run: the hull the ship stands on, the jump that is not there, the crowd
// that travels faster. The third is the interface, through the same real game: the key, the title's
// line, the glass beside the clock, the pause's rack, and both ending cards.
//
// The promise underneath all of it is that an ordinary run is untouched. Every lever answers its
// neutral number when no challenge is flying, and the reference run (`tools/simulate.js --seed
// 20261006 --trace`) traces byte for byte what it traced before this file existed. The first run test
// below is the cheap version of that promise.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { remember } from '../src/core/save.js';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { makeEnemy } from '../src/game/kinds.js';
import { enemyShotAt } from '../src/game/enemyshots.js';
import { refreshOffer } from '../src/game/upgrades.js';
import { shipRow, defaultShip } from '../src/game/ships.js';
import { ACTIONS, codeFor } from '../src/core/keymap.js';
import {
  CHALLENGES, activeOf, cardIsUsable, cardWords, crowdHoldOf, crowdSpeedOf, cycleChallenge,
  dashIsAllowed, hitGraceOf, hullOverrideOf, hudWords, isChallenge, isFlying, nameOf, pauseWords,
  saysOf, setChallenge, titleWords,
} from '../src/game/challenges.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;

const game = await bootGame({ root: ROOT, seed: 71, width: 1280, height: 720, audio: true });
const world = game.world;

function press(code) {
  game.key(code, true);
  game.key(code, false);
}

function frames(n) {
  for (let i = 0; i < n; i++) game.step(FRAME);
}

/** Take the cards off the table, so a run stopped for a choice is flying again. */
function letTheRunGo() {
  world.pendingLevels = 0;
  world.offer.length = 0;
  refreshOffer(world);
}

/** Put a body on the ship's hull and run one frame: the run is over afterwards. */
function killTheShip() {
  const ship = game.player;
  ship.hull = 1;
  ship.invuln = 0;
  ship.dashLeft = 0;            // a dash is grace too, and a test can leave one running
  ship.fireTimer = 5;
  game.enemies.push(makeEnemy(world, 'drifter', ship.x, ship.y, {
    hp: 1, speed: 0, drop: 0, score: 0,
  }));
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.OVER);
  frames(40);                    // past the restart guard, so the next launch is answered
}

/** Get to a screen a launch is answered on, whatever the run was doing. */
function toTitle() {
  if (world.state === STATE.LEVEL) letTheRunGo();
  if (world.state === STATE.PLAY) killTheShip();
  frames(30);
}

/** A run launched from a clean screen, whatever the test before it left behind. */
function launch() {
  toTitle();
  game.pressMouse(640, 240);
  frames(4);
}

/** Deal the table as many times as it takes to see what a deck is made of. */
function dealThem(times) {
  const dealt = new Set();
  for (let i = 0; i < times; i++) {
    world.pendingLevels = 1;
    world.offer.length = 0;
    refreshOffer(world);
    for (const id of world.offer) dealt.add(id);
  }
  letTheRunGo();
  return dealt;
}

/** A world with a rule on it and nothing else in it. */
function worldUnder(id) {
  return { challenge: id };
}

// ---------------------------------------------------------------------------
// The module: the table, the cycle, the levers, the words
// ---------------------------------------------------------------------------

test('every challenge is a row, a name, and a sentence', () => {
  assert.ok(CHALLENGES.length >= 3, 'the plan asks for three: ' + CHALLENGES.length);
  const ids = CHALLENGES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'an id is used twice');
  for (const challenge of CHALLENGES) {
    // The row is what the sim reads, so a challenge without one is a rule nothing enforces.
    assert.notEqual(BALANCE.challenges[challenge.id], undefined, challenge.id + ' has no row');
    assert.equal(challenge.name, challenge.name.toUpperCase(), challenge.id + "'s name is not caps");
    assert.ok(saysOf(challenge.id).length > 0, challenge.id + ' has nothing to say');
    assert.equal(nameOf(challenge.id), challenge.name);
  }
  // The rules that take a card line away are the ones the gate knows about, and no others.
  assert.deepEqual(Object.keys(BALANCE.challenges.gatedOn), ['grounded'],
    'only NO DASH takes a card line away');
});

test('the swift crowd says its own number, whatever it is', () => {
  // The sentence is built out of the row rather than written beside it, so moving the multiplier
  // cannot leave the card claiming a share it no longer charges.
  const shipped = BALANCE.challenges.swift.speedMul;
  try {
    BALANCE.challenges.swift.speedMul = 1.25;
    assert.equal(saysOf('swift'), 'the crowd travels 25% faster');
    BALANCE.challenges.swift.speedMul = 1.5;
    assert.equal(saysOf('swift'), 'the crowd travels 50% faster');
  } finally {
    BALANCE.challenges.swift.speedMul = shipped;
  }
  assert.match(saysOf('swift'), new RegExp(Math.round((shipped - 1) * 100) + '% faster'));
});

test('a rule with a number in it says that number and not a written one', () => {
  // Two rules are written with an empty `says` on purpose: their sentence is arithmetic on their own
  // row. A third that arrives that way and has no builder in challenges.js would say nothing at all,
  // which is what this check is for - the glass would print a name with no sentence under it.
  const built = CHALLENGES.filter((c) => c.says === '');
  assert.ok(built.length >= 2, 'the crowd rules are the ones with a number to say');
  for (const challenge of built) {
    assert.ok(saysOf(challenge.id).length > 0, challenge.id + ' has an empty sentence');
  }
});

test('the cycle walks every state and comes back round', () => {
  const visit = worldUnder('');
  const seen = [];
  for (let i = 0; i < CHALLENGES.length + 1; i++) seen.push(cycleChallenge(visit));
  // Nothing, then every rule in the table's order, and the last press is back at nothing.
  assert.deepEqual(seen, [...CHALLENGES.map((c) => c.id), '']);
  assert.equal(activeOf(visit), '');
});

test('the choice is checked on the way in and a nonsense one is not a locked-in state', () => {
  const visit = worldUnder('');
  assert.throws(() => setChallenge(visit, 'double-everything'), /no challenge is called/);
  assert.equal(isChallenge(''), true, 'no challenge at all is one of the choices');
  assert.equal(isChallenge('swift'), true);
  // A world left pointing at something this build has never heard of is a bug, and the cycle takes it
  // to the first rule rather than spinning on nothing.
  const broken = worldUnder('forgotten-rule');
  assert.equal(cycleChallenge(broken), CHALLENGES[0].id);
});

test('no challenge flying means every lever answers its neutral number', () => {
  const plain = worldUnder('');
  assert.equal(activeOf(plain), '');
  assert.equal(hullOverrideOf(plain), 0, 'no rule spoke about the hull');
  assert.equal(dashIsAllowed(plain), true);
  assert.equal(crowdSpeedOf(plain), 1);
  assert.equal(crowdHoldOf(plain), 1, 'and the arena holds what it ships');
  assert.equal(hitGraceOf(plain), BALANCE.player.hitInvulnerability, 'and a hit leaves its whole gap');
  assert.equal(cardIsUsable(plain, 'tether'), true);
  assert.equal(cardIsUsable(plain, 'afterimage'), true);
  assert.equal(titleWords(plain), '');
  assert.equal(hudWords(plain), '');
  assert.equal(saysOf(''), '');
  assert.equal(nameOf(''), '');
  assert.equal(cardWords(plain), '');
  assert.equal(pauseWords(plain), null);
});

test('each rule moves exactly its own lever and none of the others', () => {
  const plain = worldUnder('');
  const brittle = worldUnder('brittle');
  assert.equal(hitGraceOf(brittle), BALANCE.player.hitInvulnerability);
  assert.equal(hullOverrideOf(brittle), BALANCE.challenges.brittle.hull);
  assert.equal(dashIsAllowed(brittle), true);
  assert.equal(crowdSpeedOf(brittle), 1);
  assert.equal(cardIsUsable(brittle, 'tether'), true);

  const grounded = worldUnder('grounded');
  assert.equal(dashIsAllowed(grounded), false);
  assert.equal(hullOverrideOf(grounded), 0);
  assert.equal(crowdSpeedOf(grounded), 1);
  assert.equal(hitGraceOf(grounded), BALANCE.player.hitInvulnerability);

  // SHORT GRACE is the third rule about the ship rather than the crowd, and it reaches one number and
  // no other: the gap after a hit.
  const merciless = worldUnder('merciless');
  assert.equal(hitGraceOf(merciless), BALANCE.challenges.merciless.grace);
  assert.ok(hitGraceOf(merciless) < hitGraceOf(plain), 'a rule that left the gap alone was no rule');
  assert.ok(hitGraceOf(merciless) > 0,
    'the gap is short and not gone: with none a hazard that stays is a hull a step');
  assert.equal(hullOverrideOf(merciless), 0);
  assert.equal(dashIsAllowed(merciless), true);
  assert.equal(crowdSpeedOf(merciless), 1);
  assert.equal(crowdHoldOf(merciless), 1);

  const swift = worldUnder('swift');
  assert.equal(crowdSpeedOf(swift), BALANCE.challenges.swift.speedMul);
  assert.equal(crowdHoldOf(swift), 1);
  assert.equal(hullOverrideOf(swift), 0);
  assert.equal(dashIsAllowed(swift), true);
  assert.equal(hitGraceOf(swift), BALANCE.player.hitInvulnerability);

  const thick = worldUnder('thick');
  assert.equal(crowdHoldOf(thick), BALANCE.challenges.thick.holdMul);
  assert.equal(crowdSpeedOf(thick), 1);
  assert.equal(hullOverrideOf(thick), 0);
  assert.equal(dashIsAllowed(thick), true);
  assert.equal(hitGraceOf(thick), BALANCE.player.hitInvulnerability);

  assert.equal(isFlying(brittle, 'brittle'), true);
  assert.equal(isFlying(brittle, 'swift'), false);
});

test('NO DASH takes the two lines that fire off a dash out of the deck', () => {
  const grounded = worldUnder('grounded');
  // The two lines are gated on the jump: the tether ties its cords at the moment a dash is granted
  // and the afterimage throws its images down the streak one leaves.
  assert.equal(cardIsUsable(grounded, 'tether'), false);
  assert.equal(cardIsUsable(grounded, 'afterimage'), false);
  // ...and nothing else: the rest of the deck is still the deck, or the rule would be "half a deck".
  let kept = 0;
  for (const id of Object.keys(BALANCE.upgrades)) {
    if (BALANCE.upgrades[id].ranks > 0 && cardIsUsable(grounded, id)) kept++;
  }
  assert.ok(kept > 10, 'the gate left ' + kept + ' lines to deal, which is not a deck');
});

test('the words name the rule everywhere and say nothing when there is no rule', () => {
  // A save with nothing banked under any rule, said out loud rather than left to the file's order:
  // these are the words of a rule with no record, and what a rule *with* one says is
  // test/challenge-records.test.mjs's business.
  remember('challenges', { bests: {} });
  const under = worldUnder('brittle');
  assert.equal(hudWords(under), 'ONE HULL');
  assert.equal(titleWords(under), 'CHALLENGE  ONE HULL  \u00b7  one touch and the run is over');
  assert.equal(cardWords(under), 'CHALLENGE \u00b7 ONE HULL \u00b7 one touch and the run is over');
  assert.deepEqual(pauseWords(under), { name: 'CHALLENGE', says: 'ONE HULL' });
  // A card that names the rule also says what it does, because a score quoted from it has to carry
  // both or it is the same number as an ordinary run's.
  assert.match(cardWords(worldUnder('swift')), /SWIFT CROWD.*crowd travels/);
});

// ---------------------------------------------------------------------------
// The simulation
// ---------------------------------------------------------------------------

test('an ordinary run is written by the same hands it always was', () => {
  game.chooseChallenge('');
  launch();
  const row = shipRow(defaultShip());
  assert.equal(game.stats().maxHull, row.maxHull, 'nothing overrode the ship');
  assert.equal(game.stats().hull, row.hull);
  assert.equal(game.stats().challenge, '');
  frames(300);
  assert.ok(game.enemies.length > 0, 'a crowd walked in');
  assert.ok(game.enemies.every((e) => e.speed > 0));
});

test('ONE HULL stands on one hull, whatever the body and whatever the purse bought', () => {
  game.chooseChallenge('brittle');
  // The plating the hangar sells goes on top of the ship's own hull (game/perks.js), which is why
  // the rule has the last word rather than the first: five ranks of plating on a Bulwark would
  // otherwise be nine hulls under a rule that said one.
  const plating = world.perkRanks.hull;
  world.perkRanks.hull = 5;
  game.chooseShip('bulwark');
  launch();
  assert.equal(game.stats().hull, 1);
  assert.equal(game.stats().maxHull, 1, 'the ceiling came down with the hull');
  world.perkRanks.hull = plating;
  game.chooseShip(defaultShip());
});

test('NO DASH refuses the jump where it is granted', () => {
  game.chooseChallenge('grounded');
  launch();
  frames(60);
  assert.equal(game.stats().dashCd, 0, 'the jump is not even on cooldown, it is not there');
  game.tapDash();
  game.step(FRAME);
  assert.equal(game.stats().dashLeft, 0, 'the press bought nothing');
  assert.equal(game.stats().dashCd, 0, 'and cost no wait either');
});

test('a plain ship still jumps', () => {
  game.chooseChallenge('');
  launch();
  frames(60);
  game.tapDash();
  game.step(FRAME);
  assert.ok(game.stats().dashLeft > 0, 'the same press in a plain run is a dash');
});

test('the swift crowd travels the share the row says and no more', () => {
  game.chooseChallenge('');
  const plain = makeEnemy(world, 'drifter', 100, 100, null).speed;
  game.chooseChallenge('swift');
  const quick = makeEnemy(world, 'drifter', 100, 100, null).speed;
  assert.ok(Math.abs(quick / plain - BALANCE.challenges.swift.speedMul) < 1e-9,
    'a body came out ' + (quick / plain) + 'x as fast');

  // ...and so does a shot, off the same number: the claim the card makes is one claim.
  const spec = { speed: 200, life: 1, radius: 4, color: '#fff' };
  const calm = enemyShotAt(world, 0, 0, 1, 0, spec, 'spitter');
  world.challenge = '';
  world.enemyShots.clear();
  const still = enemyShotAt(world, 0, 0, 1, 0, spec, 'spitter');
  assert.equal(Math.hypot(still.vx, still.vy), 200);
  world.enemyShots.clear();
  world.challenge = 'swift';
  const quickShot = enemyShotAt(world, 0, 0, 1, 0, spec, 'spitter');
  assert.ok(Math.abs(Math.hypot(quickShot.vx, quickShot.vy) / 200
    - BALANCE.challenges.swift.speedMul) < 1e-9);
  world.enemyShots.clear();
  game.chooseChallenge('');
});

test('the deal refuses a line that could do nothing under the rule', () => {
  // Not the accessor: the real table, dealt the way a level-up deals it, several times over, so a
  // gate that only held the first draw would not survive this.
  game.chooseChallenge('grounded');
  launch();
  const gated = dealThem(120);
  assert.ok(gated.size > 6, 'the deals dealt nothing: ' + [...gated].join(','));
  assert.equal(gated.has('tether'), false, 'a card that cannot fire was offered');
  assert.equal(gated.has('afterimage'), false);
  // And the same deals with no rule on do offer them, which is what says the test above could have
  // failed.
  game.chooseChallenge('');
  const plain = dealThem(200);
  assert.ok(plain.has('tether') && plain.has('afterimage'),
    'the two lines are never dealt even plainly, so the gate proved nothing');
});

/**
 * Put a living body on the ship, give it one frame, and answer the gap the hit left.
 *
 * The body is taken back out and the freeze is burnt off before answering: a hit stops the world for a
 * moment (game/effects.js `hitStop`) and a body left across the ship hurts again later, either of which
 * lands on whichever test runs next rather than on this one.
 */
function touchTheShip() {
  const ship = game.player;
  ship.hull = 3;
  ship.invuln = 0;
  ship.dashLeft = 0;            // a dash is grace too, and a test can leave one running
  ship.fireTimer = 5;
  game.enemies.push(makeEnemy(world, 'drifter', ship.x, ship.y, {
    hp: 99, speed: 0, drop: 0, score: 0,
  }));
  game.step(FRAME);
  assert.equal(ship.hull, 2, 'the body went across the ship and nothing was paid');
  const gap = ship.invuln;
  game.enemies.length = 0;
  frames(12);
  return gap;
}

test('SHORT GRACE is the gap a run is actually flown with', () => {
  // The lever on the module is one thing; that a hit in a played run writes it is another. This is the
  // same claim test/challenge-merciless.test.mjs makes on a parked world, made here through the real
  // loop - and it is the version that would notice the number being cached somewhere other than the hit.
  game.chooseChallenge('');
  launch();
  assert.equal(touchTheShip(), BALANCE.player.hitInvulnerability,
    'a plain run is left a second and a half to get clear');

  game.chooseChallenge('merciless');
  launch();
  assert.equal(touchTheShip(), BALANCE.challenges.merciless.grace,
    'the rule is what shortened it, in a run that was really flying');

  game.chooseChallenge('');
});

// ---------------------------------------------------------------------------
// The interface
// ---------------------------------------------------------------------------

test('one key cycles the rule and the title says which one it landed on', () => {
  toTitle();
  game.chooseChallenge('');
  assert.equal(game.screen.titleChallenge, '', 'a visit with no rule says nothing');
  press('KeyX');
  assert.equal(game.stats().challenge, 'brittle');
  // The line is `titleWords`' own, record and all (game/challenges.js): what this test is about is that
  // the glass says which rule the key landed on, and what the save has banked under it is a fact about
  // the save and not about the cycle. test/challenge-records.test.mjs writes the whole line out word for
  // word, record included.
  assert.ok(game.screen.titleChallenge.startsWith(
    'CHALLENGE  ONE HULL  \u00b7  one touch and the run is over'),
    'the line does not say which rule is on: ' + game.screen.titleChallenge);
  press('KeyX');
  assert.equal(game.stats().challenge, 'grounded');
  press('KeyX');
  assert.equal(game.stats().challenge, 'merciless');
  press('KeyX');
  assert.equal(game.stats().challenge, 'swift');
  press('KeyX');
  assert.equal(game.stats().challenge, 'thick');
  press('KeyX');
  assert.equal(game.stats().challenge, '', 'the last press is back to no rule');
  assert.equal(game.screen.titleChallenge, '');
});

test('a run that is flying keeps the rules it was flown under', () => {
  game.chooseChallenge('');
  launch();
  press('KeyX');
  assert.equal(game.stats().challenge, '',
    'mid-run the key is refused like every key the screen cannot answer');
  // ...and so it is over the cards, which are the same run stopped and not a second screen.
  world.pendingLevels = 1;
  world.offer.length = 0;
  refreshOffer(world);
  assert.equal(world.state, STATE.LEVEL);
  press('KeyX');
  assert.equal(game.stats().challenge, '');
  letTheRunGo();
  killTheShip();
});

test('the glass beside the clock says which rule the run is under', () => {
  game.chooseChallenge('');
  launch();
  frames(2);
  assert.equal(game.texts().some((t) => t.text.trim() === 'ONE HULL'), false);
  killTheShip();
  game.chooseChallenge('brittle');
  launch();
  frames(2);
  const painted = game.texts().filter((t) => t.text.trim() === 'ONE HULL');
  assert.equal(painted.length, 1, 'the mark was painted ' + painted.length + ' times');
  killTheShip();
});

test('both ending cards say what the run was flown under, and an ordinary one says nothing', () => {
  game.chooseChallenge('');
  launch();
  killTheShip();
  assert.equal(game.screen.finalChallenge, '', 'an ordinary card is the card it always was');

  game.chooseChallenge('grounded');
  launch();
  killTheShip();
  // The rule and its sentence come first, and what the run did to the rule's own record rides on the
  // end of it (test/challenge-records.test.mjs holds that half word for word).
  assert.ok(game.screen.finalChallenge.startsWith(
    'CHALLENGE \u00b7 NO DASH \u00b7 the jump is gone, and so are the cards that need it'),
    'the card did not say the rule: ' + game.screen.finalChallenge);
});

test('the pause rack keeps the row only when there is a rule to name', () => {
  game.chooseChallenge('');
  launch();
  frames(30);
  press('KeyP');
  assert.equal(game.screen.pauseFacts.some((row) => row.name === 'CHALLENGE'), false);
  press('KeyP');

  game.chooseChallenge('swift');
  launch();
  frames(30);
  press('KeyP');
  const row = game.screen.pauseFacts.find((each) => each.name === 'CHALLENGE');
  assert.notEqual(row, undefined, 'the rack left the rule out');
  assert.equal(row.says, 'SWIFT CROWD');
  press('KeyP');
  killTheShip();
});

test('the key is a row the controls panel can move, and the page prints what it is bound to', () => {
  const row = ACTIONS.find((a) => a.id === 'challenge');
  assert.notEqual(row, undefined, 'the key is not in the table a hand can rebind');
  assert.equal(codeFor('challenge'), 'KeyX');
  assert.equal(game.text('titleKeysChallenge'), 'X', 'the title says it too');
});

test('a headless tool can ask which rule a run is standing under', () => {
  game.chooseChallenge('swift');
  assert.equal(game.stats().challenge, 'swift');
  game.chooseChallenge('');
  assert.equal(game.stats().challenge, '');
  assert.throws(() => game.chooseChallenge('nonsense'), /no challenge is called/);
});
