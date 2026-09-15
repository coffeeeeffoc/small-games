import assert from 'node:assert/strict';
import { HEROES, OFFERS } from '../src/content.mjs';
import {
  createGame,
  recruit,
  moveItem,
  startBattle,
  tick,
  getLinks,
  isAwake,
  getProductionTime,
  recycle,
  repair,
  surge,
} from '../src/engine.mjs';

const board = (index) => ({ zone: 'board', index });
const reserve = (index) => ({ zone: 'reserve', index });
function buy(state, offer, target) {
  const empty = state.reserve.indexOf(null);
  assert.ok(recruit(state, offer).ok, `${offer}: ${state.message}`);
  assert.ok(moveItem(state, reserve(empty), board(target)).ok, state.message);
}
function assemble(state, key, target, equip = true) {
  for (const part of HEROES[key].parts) buy(state, `${key}:${part}`, target);
  if (equip) buy(state, `weapon:${HEROES[key].synergy}`, target);
}
function price(key, equipped = true) {
  return OFFERS.filter(
    (offer) => offer.key === key || (equipped && offer.id === `weapon:${HEROES[key].synergy}`),
  ).reduce((sum, offer) => sum + offer.cost, 0);
}

{
  const state = createGame();
  const startingCoins = state.coins;
  tick(state, 0.25);
  assert.equal(state.reserve[1].anim, 'enter');
  assert.equal(state.reserve[1].animTime, 0.25, 'setup entry animation must advance');
  moveItem(state, reserve(0), board(4));
  tick(state, 0.4);
  assert.equal(state.board[4].anim, 'upgrade');
  assert.equal(state.board[4].animTime, 0.4, 'setup merge animation must advance');
  tick(state, 0.6);
  assert.equal(state.board[4].anim, 'idle');
  assert.equal(state.effects.length, 0, 'setup merge effects expire');
  assert.equal(state.time, 0, 'cosmetic setup ticks do not start battle clock');
  assert.equal(state.coins, startingCoins, 'setup cannot farm currency');
  assert.equal(state.units.length, 0);
}

{
  const state = createGame();
  assert.equal(isAwake(state.board[4]), false);
  assert.ok(moveItem(state, reserve(0), board(4)).ok);
  assert.equal(isAwake(state.board[4]), true);
  assert.ok(moveItem(state, reserve(1), board(4)).ok);
  assert.equal(state.board[4].weapon, 'fire');
  assert.equal(state.board[4].anim, 'upgrade');
  state.coins = 1000;
  buy(state, 'nezha:哪', 5);
  const before = JSON.stringify([state.board, state.reserve]);
  const empty = state.reserve.indexOf(null);
  recruit(state, 'nezha:哪');
  const beforeInvalid = JSON.stringify([state.board, state.reserve]);
  assert.equal(moveItem(state, reserve(empty), board(5)).ok, false);
  assert.equal(
    JSON.stringify([state.board, state.reserve]),
    beforeInvalid,
    'invalid overlapping fragments must be transactional',
  );
  assert.notEqual(before, beforeInvalid);
  buy(state, 'nezha:吒', 5);
  assert.ok(moveItem(state, board(5), board(4)).ok);
  assert.equal(state.board[4].level, 2);
  assert.equal(state.board[4].weapon, 'fire', 'equipped weapon survives hero upgrade');
  assert.equal(state.board[5], null);
  assert.equal(moveItem(state, board(-1), board(0)).ok, false);
  assert.equal(moveItem(state, board(4), { zone: '__proto__', index: 0 }).ok, false);
  assert.equal(recruit(state, 'unknown').ok, false);
  assert.equal(recycle(state, reserve(5)).ok, false);
}

{
  const state = createGame('attack');
  state.coins = 2000;
  state.board.fill(null);
  state.reserve.fill(null);
  assemble(state, 'nezha', 0, false);
  assemble(state, 'nezha', 2, false);
  buy(state, 'weapon:fire', 1);
  assert.equal(getLinks(state).length, 1, 'one weapon cannot link to two heroes');
  assert.equal(getLinks(state)[0].heroIndex, 0);
  assert.ok(getProductionTime(state.board[0], true) > getProductionTime(state.board[0], false));
  startBattle(state);
  tick(state, 13);
  assert.equal(
    state.units.filter((unit) => unit.side === 'ally').length,
    1,
    'unlinked recipe completes first',
  );
  tick(state, 6);
  const composite = state.units.find((unit) => unit.side === 'ally' && unit.linked);
  assert.ok(composite && composite.weapon === 'fire');
  assert.ok(
    composite.damage > state.units.find((unit) => unit.side === 'ally' && !unit.linked).damage,
  );
  const saved = JSON.stringify(state);
  state.paused = true;
  tick(state, 100);
  state.paused = false;
  assert.equal(JSON.stringify(state), saved, 'pause freezes all simulation state');
  tick(state, NaN);
  assert.equal(JSON.stringify(state), saved);
}

{
  const a = createGame('attack', 'normal', 17),
    b = createGame('attack', 'normal', 17);
  startBattle(a);
  startBattle(b);
  tick(a, 10);
  for (let i = 0; i < 200; i++) tick(b, 0.05);
  assert.ok(Math.abs(a.time - b.time) < 1e-9, 'long frame preserves full foreground elapsed time');
  assert.equal(a.units.length, b.units.length);
  a.units.forEach((unit, index) => assert.ok(Math.abs(unit.x - b.units[index].x) < 1e-7));
  assert.equal(surge(a).ok, true);
  assert.equal(surge(a).ok, false, 'surge cannot bypass cooldown');
  a.coreHp = 900;
  a.coins = 45;
  assert.equal(repair(a).ok, true);
  assert.equal(a.coreHp, 1180);
  assert.equal(repair(a).ok, false);
  const walker = b.units.find((unit) => unit.anim === 'walk');
  assert.ok(
    walker && walker.animTime > 1,
    'walking lifecycle age must accumulate instead of resetting every frame',
  );
}

{
  const state = createGame('attack');
  state.coins = 1000;
  state.board.fill(null);
  state.reserve.fill(null);
  assemble(state, 'nezha', 0, false);
  buy(state, 'weapon:fire', 3);
  startBattle(state);
  tick(state, 11.8);
  assert.ok(state.board[0].progress > 0.9);
  moveItem(state, board(3), board(1));
  tick(state, 1);
  assert.ok(
    state.board[0].progress < 0.1,
    'late adjacent weapon resets the whole linked production cycle',
  );
  assert.equal(
    state.units.filter((unit) => unit.side === 'ally').length,
    0,
    'late assembly cannot produce a free composite',
  );
  assert.ok(
    Math.abs(state.board[0].progress - state.board[1].progress) < 1e-9,
    'both linked recipes wait together',
  );
  moveItem(state, board(1), board(3));
  tick(state, 0.05);
  assert.ok(state.board[0].progress < 0.01, 'removing a link also restarts production');
}

{
  const state = createGame('defense');
  state.coins = 3000;
  state.board.fill(null);
  state.reserve.fill(null);
  assemble(state, 'nezha', 0, false);
  assemble(state, 'nezha', 1, false);
  startBattle(state);
  const source = state.units.find((unit) => unit.recipeId === state.board[0].id);
  source.hp = source.maxHp * 0.3;
  state.board[0].healthRatio = 0.3;
  const free = state.reserve.indexOf(null);
  moveItem(state, board(0), reserve(free));
  moveItem(state, reserve(free), board(0));
  const redeployed = state.units.find((unit) => unit.recipeId === state.board[0].id && unit.hp > 0);
  assert.ok(
    Math.abs(redeployed.hp / redeployed.maxHp - 0.3) < 1e-9,
    'reserve round trip cannot heal troops',
  );
  buy(state, 'weapon:fire', 0);
  const equipped = state.units.find((unit) => unit.recipeId === state.board[0].id && unit.hp > 0);
  assert.ok(Math.abs(equipped.hp / equipped.maxHp - 0.3) < 1e-9, 'equipping retains damage ratio');
  moveItem(state, board(0), board(1));
  const upgraded = state.units.find((unit) => unit.recipeId === state.board[1].id && unit.hp > 0);
  assert.equal(state.board[1].level, 2);
  assert.ok(
    Math.abs(upgraded.hp / upgraded.maxHp - 0.65) < 1e-9,
    'merging averages both troops health instead of healing the injured copy',
  );
}

function simulate(mode, play, difficulty = 'normal') {
  const state = createGame(mode, difficulty, 42);
  if (play) {
    moveItem(state, reserve(0), board(4));
    moveItem(state, reserve(1), board(4));
    moveItem(state, reserve(2), board(1));
    buy(state, 'wukong:悟', 1);
    buy(state, 'wukong:空', 1);
    buy(state, 'weapon:cannon', 1);
    assemble(state, 'erlang', 9, false);
  }
  startBattle(state);
  const additions = [
    ['drone', 9],
    ['nezha', 6],
    ['erlang', 2],
    ['wukong', 10],
    ['nezha', 8],
    ['erlang', 0],
    ['wukong', 7],
    ['nezha', 11],
    ['erlang', 3],
    ['wukong', 5],
  ];
  let next = 0;
  for (let second = 0; second < 420 && state.phase === 'running'; second++) {
    if (play) {
      if (state.cooldowns.surge <= 0) surge(state);
      if (state.coreHp < 650 && state.coins >= 45) repair(state);
      if (next < additions.length) {
        const [key, index] = additions[next];
        const cost = key === 'drone' ? 52 : price(key);
        if (state.coins >= cost) {
          if (key === 'drone') buy(state, 'weapon:drone', index);
          else assemble(state, key, index);
          next++;
        }
      }
    }
    tick(state, 1);
  }
  return state;
}

for (const mode of ['defense', 'attack']) {
  const empty = simulate(mode, false);
  assert.equal(empty.phase, 'lost', `${mode}: no deployment must lose`);
  const played = simulate(mode, true);
  console.log(
    `${mode}: empty loses at ${empty.time.toFixed(0)}s; strategy ${played.phase} at ${played.time.toFixed(0)}s, wave ${played.wave}, core ${played.coreHp.toFixed(0)}, enemy ${played.enemyCoreHp.toFixed(0)}, kills ${played.kills}`,
  );
  assert.equal(played.phase, 'won', `${mode}: deliberate balanced deployment must be winnable`);
  const single = createGame(mode, 'normal', 42);
  moveItem(single, reserve(0), board(4));
  moveItem(single, reserve(1), board(4));
  startBattle(single);
  tick(single, 180);
  assert.equal(single.phase, 'lost', `${mode}: one powerful hero cannot defend three lanes alone`);
  const hard = simulate(mode, true, 'hard');
  console.log(
    `${mode} hard: strategy ${hard.phase} at ${hard.time.toFixed(0)}s, wave ${hard.wave}, core ${hard.coreHp.toFixed(0)}, kills ${hard.kills}`,
  );
  assert.equal(
    hard.phase,
    'won',
    `${mode}: hard difficulty must remain winnable through deliberate deployment`,
  );
}
console.log('engine rules, lifecycle, time handling, and deterministic balance checks passed');
