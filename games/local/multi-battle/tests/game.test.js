import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, FAMILIES } from '../src/content.js';
import { clone, createCard, createPlayer, def, seedOf } from '../src/shared.js';
import { startRound } from '../src/economy.js';
import { beginBattle, dispatch, finishBattle, newGame, nextRound, opponent, runBot, standings } from '../src/game.js';

const families = Object.keys(FAMILIES).filter(key => key !== 'neutral');
function add(p, key, slot) {
  const card = createCard(p, CARDS.find(d => d.key === key).id);
  if (slot === undefined) p.hand.push(card);
  else p.board[slot] = card;
  return card;
}
function validPlayer(p) {
  assert.ok(Number.isInteger(p.gold) && p.gold >= 0, `${p.id} 金币非法`);
  assert.ok(p.extraGold >= 0 && p.extraGold <= 3);
  assert.ok(p.level >= 1 && p.level <= 5);
  assert.equal(p.board.length, 6);
  assert.ok(p.hand.length <= 10);
  assert.equal(p.shop.length, 5);
  p.shop.forEach((c, i) => {
    if (!c) return;
    assert.equal(def(c).type, i < 3 ? 'character' : i === 3 ? 'spell' : 'equipment');
    assert.ok(def(c).tier <= p.level);
    assert.ok(c.price >= 1);
  });
  const all = [...p.board, ...p.hand, ...p.shop].filter(Boolean);
  for (const c of [...all]) {
    assert.equal(typeof c.level, 'bigint');
    assert.ok(c.level >= 1n);
    assert.ok(c.equipment.length <= 2);
    assert.equal(new Set(c.equipment.map(e => e.defId)).size, c.equipment.length);
    all.push(...c.equipment);
  }
  assert.equal(new Set(all.map(c => c.uid)).size, all.length, '实例不能复制到多个区域');
  assert.ok(p.board.filter(Boolean).every(c => def(c).type === 'character'));
}

test('新局有8个独立玩家、首轮合法经济、同种子相同且查看对手不推进随机', () => {
  const game = newGame('game-initial');
  assert.deepEqual(game, newGame('game-initial'));
  assert.equal(game.players.length, 8);
  assert.equal(game.phase, 'prep');
  assert.equal(game.round, 1);
  assert.equal(new Set(game.players.map(p => p.rng)).size, 8);
  assert.equal(new Set(game.players.map(p => p.botRng)).size, 8);
  assert.equal(new Set(game.tieOrder).size, 8);
  assert.equal(new Set(game.players.slice(1).map(p => p.family)).size, 6);
  for (const p of game.players) {
    validPlayer(p);
    assert.equal(p.gold, 4);
    assert.equal(p.hp, 30);
    assert.equal(p.level, 1);
    assert.equal(p.hand.length, 0);
    assert.ok(p.board.every(c => !c));
  }
  const snapshot = clone(game);
  assert.ok(opponent(game).board.every(c => !c));
  assert.deepEqual(game, snapshot);
  game.players[0].shop[0].level = 100n;
  assert.ok(game.players.slice(1).every(p => p.shop[0].level === 1n));
});

test('dispatch只修改真人且整备外拒绝操作，beginBattle锁定而不提前扣血', () => {
  let game = newGame('dispatch');
  const original = clone(game);
  const purchase = dispatch(game, { type: 'buy', slot: 0 });
  assert.equal(purchase.ok, true);
  assert.deepEqual(game, original);
  game = purchase.game;
  assert.equal(game.players[0].hand.length, 1);
  assert.deepEqual(game.players.slice(1), original.players.slice(1));
  const invalid = dispatch(game, { type: 'buy', slot: 0 });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.game, game);
  game = dispatch(game, { type: 'deploy', uid: game.players[0].hand[0].uid, slot: 0 }).game;
  const before = clone(game);
  const battle = beginBattle(game);
  assert.deepEqual(game, before);
  assert.equal(battle.phase, 'battle');
  assert.equal(battle.pendingResults.length, 4);
  assert.ok(battle.battle.frames.length > 0);
  assert.deepEqual(battle.players.map(p => p.hp), before.players.map(p => p.hp));
  assert.equal(beginBattle(battle), battle);
  assert.equal(dispatch(battle, { type: 'sell', uid: battle.players[0].board[0].uid }).ok, false);
  for (const p of battle.players) validPlayer(p);
});

test('大厅统一结算完整四组，真人先淘汰也不能漏算其余组，同回合排名用结算血量', () => {
  const game = newGame('simultaneous');
  game.phase = 'battle'; game.round = 5;
  game.players.forEach(p => { p.hp = 5; p.gold = 9; });
  game.battle = { opponentName: '测试对手', actions: 1 };
  game.pendingResults = [
    { leftId: 'human', rightId: 'bot0', winner: 1, remaining: [0, 3] },
    { leftId: 'bot1', rightId: 'bot2', winner: 0, remaining: [6, 0] },
    { leftId: 'bot3', rightId: 'bot4', winner: null, remaining: [0, 0] },
    { leftId: 'bot5', rightId: 'bot6', winner: 1, remaining: [0, 5] }
  ];
  const before = clone(game);
  const result = finishBattle(game);
  assert.deepEqual(game, before);
  assert.equal(result.phase, 'ended');
  assert.deepEqual(result.players.map(p => p.hp), [-1, 5, 5, -4, 2, 2, -3, 5]);
  assert.deepEqual(result.players.map(p => p.gold), Array(8).fill(9));
  assert.equal(result.players[1].wins, 1);
  assert.equal(result.players[2].wins, 1);
  assert.equal(result.players[7].wins, 1);
  assert.equal(result.rank, 6);
  assert.equal(result.lastResult.damage, 6);
  assert.deepEqual(result.pendingResults, []);
  assert.equal(finishBattle(result), result);
  assert.equal(nextRound(result), result);
});

test('结算消耗战场和手牌准备效果，下一轮收入只发一次且保留永久实例', () => {
  let game = newGame('next-round');
  const p = game.players[0];
  const a = add(p, 'tuner', 0), hand = add(p, 'vessel');
  a.level = 12n; a.prep.attack = 9n; hand.prep.shield = 20n;
  game = beginBattle(game);
  const locked = clone(game.players[0]);
  game = finishBattle(game);
  assert.equal(game.phase, 'result');
  assert.equal(game.players[0].board[0].uid, a.uid);
  assert.equal(game.players[0].board[0].level, 12n);
  assert.equal(game.players[0].board[0].prep.attack, 0n);
  assert.equal(game.players[0].hand.find(c => c.uid === hand.uid).prep.shield, 0n);
  assert.equal(game.players[0].gold, locked.gold);
  const next = nextRound(game);
  assert.equal(next.round, 2);
  assert.equal(next.phase, 'prep');
  assert.equal(next.players[0].gold, locked.gold + 5);
  assert.equal(nextRound(next), next);
  assert.equal(finishBattle(next), next);
});

test('奇数存活者只生成一个镜像，镜像源没有经济奖励且不复活', () => {
  let game = newGame('odd-ghost');
  game.phase = 'result';
  for (let i = 0; i < 8; i++) {
    const p = game.players[i];
    add(p, i % 2 ? 'mercenary' : 'rivet_guard', 0);
    p.lastBoard = clone(p.board);
    if (i >= 5) { p.hp = -i; p.eliminatedRound = 1; }
  }
  game = nextRound(game);
  assert.equal(game.pairs.length, 3);
  assert.equal(game.pairs.filter(pair => pair.includes('ghost')).length, 1);
  const participants = game.pairs.flat().filter(id => id !== 'ghost');
  assert.equal(new Set(participants).size, 5);
  assert.deepEqual(new Set(participants), new Set(game.players.filter(p => p.hp > 0).map(p => p.id)));
  assert.equal(game.ghost.hp, 0);
  const source = clone(game.players.find(p => p.id === game.ghost.sourceId));
  const oldGhost = game.ghostPlayerId;
  const battle = beginBattle(game);
  const result = finishBattle(battle);
  assert.deepEqual(result.players.find(p => p.id === source.id), source);
  assert.equal(result.players.length, 8);
  assert.equal(result.phase, 'result');
  const next = nextRound(result);
  assert.notEqual(next.ghostPlayerId, oldGhost);
});

test('五名存活者连续15轮按镜像次数公平轮转，每五轮各承受一次', () => {
  let game = newGame('ghost-fairness');
  for (let i = 5; i < 8; i++) {
    game.players[i].hp = -1;
    game.players[i].eliminatedRound = 1;
    game.players[i].lastBoard = Array(6).fill(null);
  }
  let previous = null;
  for (let cycle = 0; cycle < 3; cycle++) {
    const seen = new Set();
    for (let i = 0; i < 5; i++) {
      game.phase = 'result';
      game = nextRound(game);
      assert.notEqual(game.ghostPlayerId, previous);
      assert.ok(!seen.has(game.ghostPlayerId));
      seen.add(game.ghostPlayerId);
      previous = game.ghostPlayerId;
    }
    assert.equal(seen.size, 5);
    for (const p of game.players.slice(0, 5)) assert.equal(game.ghostCounts[p.id], cycle + 1);
  }
});

test('名次按存活、淘汰轮次、实际血量、胜场、固定席位逐级排序', () => {
  const game = newGame('ranking');
  game.tieOrder = game.players.map(p => p.id);
  const values = [
    [1, null, 0], [5, null, 1], [5, null, 2], [-1, 6, 4],
    [0, 6, 0], [-1, 4, 9], [-1, 6, 4], [5, null, 2]
  ];
  game.players.forEach((p, i) => { [p.hp, p.eliminatedRound, p.wins] = values[i]; });
  assert.deepEqual(standings(game).map(p => p.id), ['bot1', 'bot6', 'bot0', 'human', 'bot3', 'bot2', 'bot5', 'bot4']);
});

test('六流派机器人18轮经营均保持合法，手牌实际部署/施法且最终能解锁P5', () => {
  for (const family of families) {
    let p = createPlayer(`audit-${family}`, family, seedOf(family), family);
    let firstP5 = null;
    for (let round = 1; round <= 18; round++) {
      const prepared = startRound(p, round);
      const before = clone(prepared);
      p = runBot(prepared);
      if (p.level === 5 && firstP5 === null) firstP5 = round;
      assert.deepEqual(prepared, before, '机器人不能修改调用方的旧快照');
      validPlayer(p);
      assert.ok(p.board.some(Boolean), `${family} 第${round}轮未出战`);
      assert.ok(p.hand.length < 8, `${family} 第${round}轮手牌大量积压`);
    }
    assert.equal(p.level, 5, `${family} 到第18轮仍未升P5`);
    assert.ok(firstP5 <= 11, `${family} 健康运营首达P5为第${firstP5}轮，缺少升级预算`);
  }
});

test('健康P4机器人为下回合14金升级保留收入之外的2金', () => {
  const p = createPlayer('reserve', '存钱测试', 123, 'resonance');
  p.level = 4; p.round = 9; p.gold = 12;
  for (let i = 0; i < 6; i++) add(p, 'tuner', i);
  p.shop = ['tuner', 'tuner', 'tuner', 'training', 'badge'].map(key => {
    const c = createCard(p, CARDS.find(d => d.key === key).id);
    return c;
  });
  const result = runBot(p);
  assert.equal(result.level, 4);
  assert.ok(result.gold >= 2);
  assert.equal(runBot(startRound(result, 10)).level, 5);
});

test('机器人用法术目标兑现六流派机制，不凭空添加成长或临战数值', () => {
  for (const family of families) {
    const p = createPlayer(`combo-${family}`, family, 123, family);
    p.level = 5; p.round = 10;
    if (family === 'resonance') {
      add(p, 'tuner', 0).level = 5n; add(p, 'echo_guard', 1); add(p, 'training');
    } else if (family === 'legacy') {
      add(p, 'vessel', 0).level = 7n; add(p, 'successor', 1); add(p, 'bequest');
    } else if (family === 'commerce') {
      add(p, 'broker', 0); add(p, 'magnate', 1); p.gold = 4;
    } else if (family === 'arcana') {
      add(p, 'apprentice', 0); add(p, 'cannoneer', 1); add(p, 'firemark');
    } else if (family === 'armory') {
      add(p, 'forge_walker', 0); add(p, 'shortsword'); add(p, 'coat'); add(p, 'overload');
    } else if (family === 'ember') {
      add(p, 'gravekeeper', 0); add(p, 'reaper', 1); add(p, 'queen', 3); add(p, 'offering'); add(p, 'paper_reinforcements');
    }
    const before = clone(p);
    const result = runBot(p);
    assert.deepEqual(p, before);
    validPlayer(result);
    const card = key => result.board.find(c => c && def(c).key === key);
    if (family === 'resonance') { assert.equal(card('tuner').level, 7n); assert.equal(card('echo_guard').level, 3n); }
    if (family === 'legacy') { assert.equal(card('vessel').level, 1n); assert.equal(card('successor').level, 7n); assert.equal(card('successor').prep.attack, 3n); }
    if (family === 'commerce') { assert.equal(card('broker').level, 2n); assert.ok(result.log.some(line => line.includes('花费 1 金刷新'))); }
    if (family === 'arcana') { assert.equal(card('apprentice').level, 2n); assert.ok(card('cannoneer').prep.opening.includes('cannon')); }
    if (family === 'armory') { assert.equal(card('forge_walker').equipment.length, 2); assert.equal(card('forge_walker').prep.attack, 8n); }
    if (family === 'ember') { assert.ok(card('gravekeeper').prep.opening.includes('offering')); assert.equal(card('gravekeeper').prep.deathSummon, true); }
    if (family !== 'commerce') assert.equal(result.gold, 0);
  }
});

test('若干固定种子走完经营、战斗、淘汰至18回合内，同种子复跑完全一致', () => {
  const play = seed => {
    let game = newGame(seed);
    for (let turn = 0; turn < 18 && game.phase !== 'ended'; turn++) {
      game.players[0] = runBot(game.players[0]);
      game = beginBattle(game);
      const lockedHp = game.players.map(p => p.hp);
      assert.equal(game.pendingResults.length, Math.ceil(game.players.filter(p => p.hp > 0).length / 2));
      assert.deepEqual(beginBattle(game).players.map(p => p.hp), lockedHp);
      game = finishBattle(game);
      assert.ok(game.players.every(p => Number.isInteger(p.hp)));
      if (game.phase === 'result') game = nextRound(game);
    }
    assert.equal(game.phase, 'ended');
    assert.ok(game.round <= 18 && game.rank >= 1 && game.rank <= 8);
    return game;
  };
  for (const seed of ['audit-full-a', 'audit-full-b', 'audit-full-c', 'audit-full-d']) {
    assert.deepEqual(play(seed), play(seed));
  }
});
