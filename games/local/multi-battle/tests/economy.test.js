import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, SHOP_WEIGHTS } from '../src/content.js';
import { clone, createPlayer, createCard, def, stats } from '../src/shared.js';
import { applyAction, findCard, startRound } from '../src/economy.js';

const fresh = () => createPlayer('test', '测试', 12345);
test('拖购与使用按最终容量原子结算，失败不扣金也不产生记录', () => {
  const p = startRound(fresh(), 1);
  p.gold = 20;
  p.hand = Array.from({ length: 10 }, () => createCard(p, 'spell.neutral.training'));
  const card = p.shop[0];
  const before = clone(p);
  const purchase = { type: 'buy', slot: 0, use: { type: 'deploy', uid: card.uid, slot: 0 } };
  const result = applyAction(p, purchase);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.player.hand.length, 10);
  assert.equal(result.player.board[0].uid, card.uid);
  assert.equal(result.player.gold, 20 - card.price);
  assert.equal(result.player.shop[0], null);
  assert.deepEqual(p, before);
  for (const use of [{ type: 'deploy', uid: card.uid, slot: 9 }, { type: 'sell', uid: card.uid }, { type: 'cast', uid: p.hand[0].uid }]) {
    const failed = applyAction(p, { type: 'buy', slot: 0, use });
    assert.equal(failed.ok, false);
    assert.equal(failed.player, p);
    assert.deepEqual(failed.events, []);
    assert.deepEqual(p, before);
  }
  p.board[0] = createCard(p, 'character.neutral.medic');
  assert.equal(applyAction(p, purchase).ok, false, '满手调换站位会产生第11张手牌，必须回滚');
  p.shop[4] = createCard(p, 'equipment.neutral.shortsword');
  const equipped = applyAction(p, { type: 'buy', slot: 4, use: { type: 'equip', uid: p.shop[4].uid, targetUid: p.board[0].uid } });
  assert.equal(equipped.ok, true, equipped.error);
  assert.equal(equipped.player.hand.length, 10);
  assert.equal(equipped.player.board[0].equipment[0].uid, p.shop[4].uid);
});
const add = (p, key, zone = 'hand', slot = 0) => {
  const card = createCard(p, CARDS.find(d => d.key === key).id);
  if (zone === 'board') p.board[slot] = card;
  else p.hand.push(card);
  return card;
};
const equip = (p, card, key) => {
  const item = add(p, key);
  p.hand.pop();
  card.equipment.push(item);
  return item;
};
const act = (p, action) => {
  const result = applyAction(p, action);
  assert.equal(result.ok, true, result.error || action.type);
  return result.player;
};
const cast = (p, key, targets = [], extra = {}) => {
  const spell = add(p, key);
  return applyAction(p, { type: 'cast', uid: spell.uid, targets: targets.map(c => c.uid), ...extra });
};
const unchanged = (p, action) => {
  const before = clone(p);
  const result = applyAction(p, action);
  assert.equal(result.ok, false);
  assert.equal(result.player, p);
  assert.deepEqual(result.events, []);
  assert.deepEqual(p, before);
};

test('新回合收入、固定货架、品阶概率、幂等与冻结补位', () => {
  let p = startRound(fresh(), 1);
  assert.equal(p.gold, 4);
  assert.deepEqual(p.shop.map(c => def(c).type), ['character', 'character', 'character', 'spell', 'equipment']);
  assert.ok(p.shop.every(c => def(c).tier === 1));
  assert.equal(startRound(p, 1), p);
  assert.deepEqual(p, startRound(fresh(), 1));
  p.gold = 100;
  p = act(p, { type: 'buy', slot: 0 });
  p = act(p, { type: 'buy', slot: 3 });
  p = act(p, { type: 'freeze' });
  const shopBefore = clone(p.shop);
  p = act(p, { type: 'upgrade' });
  assert.deepEqual(p.shop, shopBefore);
  assert.equal(p.frozen, true);
  p = startRound(p, 2);
  assert.equal(p.frozen, false);
  assert.ok(p.shop[0] && p.shop[3]);
  for (const slot of [1, 2, 4]) assert.deepEqual(p.shop[slot], shopBefore[slot]);
  for (let level = 1; level <= 5; level++) {
    p.level = level;
    p.gold = 2000;
    const seen = new Set();
    for (let i = 0; i < 120; i++) {
      p = act(p, { type: 'reroll' });
      for (const card of p.shop) { assert.ok(def(card).tier <= level); seen.add(def(card).tier); }
    }
    for (let tier = 1; tier <= level; tier++) if (SHOP_WEIGHTS[level - 1][tier - 1]) assert.ok(seen.has(tier));
  }
  unchanged(p, { type: 'upgrade' });
});

test('非法操作、满手购买、缺钱刷新不改变卡牌或随机', () => {
  const p = startRound(fresh(), 1);
  for (let i = 0; i < 10; i++) add(p, 'training');
  unchanged(p, { type: 'buy', slot: 0 });
  unchanged(p, { type: 'buy', slot: -1 });
  unchanged(p, { type: 'buy', slot: 1.5 });
  p.gold = 0;
  unchanged(p, { type: 'reroll' });
  unchanged(p, { type: 'upgrade' });
  unchanged(p, { type: 'sell', uid: p.shop[0].uid });
  unchanged(p, { type: 'unknown' });
  p.phase = 'battle';
  unchanged(p, { type: 'freeze' });
});

test('出售带装角色和合并按最终手牌容量整体校验', () => {
  let p = fresh();
  const board = add(p, 'tuner', 'board');
  equip(p, board, 'shortsword'); equip(p, board, 'coat');
  for (let i = 0; i < 9; i++) add(p, 'training');
  unchanged(p, { type: 'sell', uid: board.uid });
  p.hand.pop();
  p = act(p, { type: 'sell', uid: board.uid });
  assert.equal(p.hand.length, 10);
  assert.equal(p.gold, 1);
  assert.equal(p.board[0], null);

  p = fresh();
  const hand = add(p, 'tuner');
  equip(p, hand, 'shortsword'); equip(p, hand, 'coat');
  for (let i = 0; i < 8; i++) add(p, 'training');
  p = act(p, { type: 'sell', uid: hand.uid });
  assert.equal(p.hand.length, 10);
  assert.equal(p.gold, 1);

  p = fresh();
  const target = add(p, 'tuner', 'board');
  const material = add(p, 'tuner');
  equip(p, material, 'shortsword'); equip(p, material, 'coat');
  for (let i = 0; i < 9; i++) add(p, 'training');
  unchanged(p, { type: 'merge', sourceUid: material.uid, targetUid: target.uid });
  p.hand.pop();
  p = act(p, { type: 'merge', sourceUid: material.uid, targetUid: target.uid });
  assert.equal(p.hand.length, 10);
  assert.equal(p.board[0].level, 2n);
  assert.equal(p.board[0].equipment.length, 0);
  assert.equal(p.gold, 0);
});

test('共鸣只产生有限link，手牌成长不能广播给战场', () => {
  let p = fresh();
  const tuner = add(p, 'tuner', 'board', 0);
  add(p, 'echo_guard', 'board', 1);
  add(p, 'conductor', 'board', 3);
  const result = cast(p, 'training', [tuner]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.player.board.filter(Boolean).map(c => c.level), [3n, 4n, 1n]);
  assert.equal(result.events.filter(e => e.type === 'LevelGained').length, 1);
  assert.equal(result.events.filter(e => e.type === 'LevelLinked').length, 3);
  p = result.player;
  const hand = add(p, 'tuner');
  const handGrowth = cast(p, 'training', [hand]);
  assert.equal(findCard(handGrowth.player, hand.uid).level, 3n);
  assert.deepEqual(handGrowth.player.board, p.board);
});

test('合并次数取max、材料不再监听、大整数不截断', () => {
  let p = fresh();
  const a = add(p, 'echo_guard', 'board', 0), b = add(p, 'echo_guard', 'board', 1);
  const c = add(p, 'tuner', 'board', 2);
  a.level = 9007199254740993n; b.level = 2n;
  b.used.level = 2;
  equip(p, b, 'badge');
  b.prep.attack = 999n;
  const result = applyAction(p, { type: 'merge', sourceUid: b.uid, targetUid: a.uid });
  assert.equal(result.ok, true);
  p = result.player;
  assert.equal(p.board[0].level, 9007199254740995n);
  assert.equal(p.board[0].used.level, 2);
  assert.equal(p.board[0].prep.attack, 0n);
  assert.equal(p.board[1], null);
  assert.equal(p.hand[0].defId, 'equipment.resonance.badge');
  assert.equal(result.events.filter(e => e.type === 'LevelGained').length, 1);
  const transferred = cast(p, 'succession', [p.board[0], c]);
  assert.equal(transferred.ok, true);
  assert.equal(transferred.player.board[0].level, 1n);
  assert.equal(transferred.player.board[2].level, 9007199254740995n);
});

test('转移守恒、交换净增奖励、装备准备效果留在原实例', () => {
  let p = fresh();
  const a = add(p, 'tuner', 'board', 0), b = add(p, 'successor', 'board', 1);
  add(p, 'keeper', 'board', 2); add(p, 'echo_guard', 'board', 3);
  equip(p, a, 'amulet');
  a.level = 7n; b.level = 3n; a.prep.attack = 5n;
  let result = cast(p, 'bequest', [a, b]);
  assert.equal(result.ok, true);
  p = result.player;
  assert.deepEqual(p.board.slice(0, 2).map(c => c.level), [1n, 9n]);
  assert.equal(p.board[0].prep.attack, 5n);
  assert.equal(p.board[0].prep.shield, 12n);
  assert.equal(p.board[1].prep.shield, 12n);
  assert.equal(p.board[1].prep.attack, 3n);
  assert.equal(p.board[3].level, 1n);
  assert.equal(result.events.filter(e => e.type === 'LevelGained').length, 0);
  result = cast(p, 'exchange', [p.board[1], p.board[0]]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.player.board.slice(0, 2).map(c => c.level), [9n, 1n]);
  assert.equal(result.player.board[0].prep.shield, 12n);
  assert.equal(result.player.board[1].prep.attack, 3n);
  assert.equal(result.events.filter(e => e.type === 'LevelsSwapped').length, 1);
  assert.equal(result.events.filter(e => e.type === 'LevelTransferred').length, 0);
});

test('16张法术均有可执行路径并且只消耗自身一次', () => {
  const keys = CARDS.filter(c => c.type === 'spell').map(c => c.key);
  assert.equal(keys.length, 16);
  for (const key of keys) {
    const p = startRound(fresh(), 1);
    const a = add(p, 'mercenary', 'board', 0), b = add(p, 'medic', 'board', 1);
    a.level = 5n;
    equip(p, a, 'shortsword');
    const two = ['chorus', 'bequest', 'exchange', 'succession'].includes(key);
    const noTarget = ['open_market', 'targeted_order', 'rally'].includes(key);
    const result = cast(p, key, two ? [a, b] : noTarget ? [] : [a], { choice: 'spell' });
    assert.equal(result.ok, true, `${key}: ${result.error}`);
    assert.equal(result.player.hand.length, 0, key);
    assert.equal(result.events.filter(e => e.type === 'SpellCast').length, 1, key);
    const changed = result.player.board[0];
    if (key === 'training') assert.equal(changed.level, 7n);
    if (key === 'potential') assert.equal(changed.level, 9n);
    if (key === 'chorus') assert.equal(result.player.board[1].level, 2n);
    if (key === 'breakthrough') { assert.equal(changed.level, 8n); assert.equal(result.player.board[1].level, 2n); }
    if (['firemark', 'starfall', 'offering'].includes(key)) assert.deepEqual(changed.prep.opening, [key]);
    if (key === 'paper_reinforcements') assert.equal(changed.prep.deathSummon, true);
    if (key === 'reinforce') assert.equal(changed.prep.shield, 8n);
    if (key === 'overload') assert.equal(changed.prep.attack, 4n);
    if (key === 'rally') assert.ok(result.player.board.filter(Boolean).every(c => c.prep.attack === 2n));
  }
});

test('无效转移、缺目标、重复准备、装备条件不会消耗法术', () => {
  let p = fresh();
  const a = add(p, 'mercenary', 'board', 0), b = add(p, 'medic');
  for (const key of ['succession', 'bequest', 'exchange', 'chorus']) {
    const spell = add(p, key);
    unchanged(p, { type: 'cast', uid: spell.uid, targets: [a.uid, a.uid] });
    unchanged(p, { type: 'cast', uid: spell.uid, targets: [a.uid] });
    unchanged(p, { type: 'cast', uid: spell.uid, targets: [a.uid, b.uid] });
    p.hand.pop();
  }
  for (const key of ['offering', 'overload']) {
    const spell = add(p, key);
    unchanged(p, { type: 'cast', uid: spell.uid, targets: [a.uid] });
    p.hand.pop();
  }
  p = act(p, { type: 'deploy', uid: b.uid, slot: 1 });
  for (const key of ['offering', 'paper_reinforcements']) {
    const result = cast(p, key, [p.board[0]]);
    assert.equal(result.ok, true);
    p = result.player;
    const spell = add(p, key);
    unchanged(p, { type: 'cast', uid: spell.uid, targets: [a.uid] });
    p.hand.pop();
  }
  const spell = add(p, 'targeted_order');
  unchanged(p, { type: 'cast', uid: spell.uid, choice: 'invalid' });
});

test('付费与法术刷新分离，定向刷新保留其他货位和冻结', () => {
  let p = startRound(fresh(), 1);
  p.gold = 20;
  const broker = add(p, 'broker', 'board', 0);
  add(p, 'magnate', 'board', 1);
  equip(p, broker, 'abacus');
  p.frozen = true;
  const before = clone(p.shop);
  const targeted = cast(p, 'targeted_order', [], { choice: 'character' });
  assert.equal(targeted.ok, true);
  p = targeted.player;
  assert.equal(p.frozen, true);
  assert.deepEqual(p.shop.slice(3), before.slice(3));
  assert.equal(p.board[0].level, 1n);
  assert.equal(p.board[0].prep.attack, 0n);
  const opened = cast(p, 'open_market');
  assert.equal(opened.ok, true);
  p = opened.player;
  assert.equal(p.frozen, false);
  assert.equal(p.shop[0].price, 2);
  assert.equal(p.board[0].level, 1n);
  for (let i = 0; i < 4; i++) p = act(p, { type: 'reroll' });
  assert.equal(p.gold, 16);
  assert.equal(p.board[0].level, 2n);
  assert.equal(p.board[0].prep.attack, 3n);
  assert.equal(p.shop[0].price, 3);
  assert.equal(p.board[1].used.reroll, 3);
});

test('出售奖励每实例一次、每指挥官每回合最多3金，出售本身不在额度内', () => {
  let p = fresh();
  for (let i = 0; i < 4; i++) add(p, 'bookkeeper', 'board', i);
  let sold = add(p, 'tuner');
  p = act(p, { type: 'sell', uid: sold.uid });
  assert.equal(p.gold, 4);
  assert.equal(p.extraGold, 3);
  assert.ok(p.board.filter(Boolean).every(c => c.used.sell === 1));
  sold = add(p, 'tuner');
  p = act(p, { type: 'sell', uid: sold.uid });
  assert.equal(p.gold, 5);
  p = startRound(p, 1);
  assert.equal(p.extraGold, 0);
  assert.ok(p.board.filter(Boolean).every(c => !c.used.sell));
  p = act(p, { type: 'sell', uid: p.board[0].uid });
  assert.equal(p.gold, 13);
});

test('施法先完成法术再监听，咒术计次与共鸣gain稳定结算', () => {
  let p = fresh();
  const apprentice = add(p, 'apprentice', 'board', 0);
  add(p, 'cannoneer', 'board', 1); add(p, 'archivist', 'board', 2); add(p, 'echo_guard', 'board', 3);
  equip(p, apprentice, 'grimoire');
  for (let i = 0; i < 4; i++) {
    const result = cast(p, 'rally');
    assert.equal(result.ok, true);
    p = result.player;
  }
  assert.equal(p.board[0].level, 2n);
  assert.equal(p.board[3].level, 2n);
  assert.equal(p.board[0].prep.attack, 15n);
  assert.equal(p.board[1].prep.attack, 11n);
  assert.deepEqual(p.board[1].prep.opening, ['cannon', 'cannon', 'cannon']);
  assert.equal(p.board[0].equipment[0].used.spell, 2);
});

test('部署交换、上下场、免费换装保留实例次数，不累加固定属性', () => {
  let p = fresh();
  const a = add(p, 'broker', 'board', 0), b = add(p, 'mercenary');
  const item = equip(p, a, 'abacus');
  a.used.reroll = 1; item.used.reroll = 3;
  const baseline = stats(a);
  for (let i = 0; i < 10; i++) {
    p = act(p, { type: 'recall', uid: a.uid });
    p = act(p, { type: 'deploy', uid: a.uid, slot: 0 });
    p = act(p, { type: 'unequip', targetUid: a.uid, slot: 0 });
    p = act(p, { type: 'equip', uid: item.uid, targetUid: a.uid });
  }
  assert.deepEqual(stats(p.board[0]), baseline);
  assert.equal(p.board[0].used.reroll, 1);
  assert.equal(p.board[0].equipment[0].used.reroll, 3);
  assert.equal(p.gold, 0);
  p = act(p, { type: 'deploy', uid: b.uid, slot: 0 });
  assert.equal(p.board[0].uid, b.uid);
  assert.equal(findCard(p, a.uid).equipment[0].uid, item.uid);
  p = act(p, { type: 'deploy', uid: a.uid, slot: 1 });
  p = act(p, { type: 'deploy', uid: a.uid, slot: 0 });
  assert.equal(p.board[0].uid, a.uid);
  assert.equal(p.board[1].uid, b.uid);
});

test('满手换装可交换，同名装备与未指明满槽替换拒绝，手牌宿主可穿装', () => {
  let p = fresh();
  const a = add(p, 'mercenary');
  equip(p, a, 'shortsword'); equip(p, a, 'coat');
  const spear = add(p, 'spear'), duplicate = add(p, 'shortsword');
  for (let i = p.hand.length; i < 10; i++) add(p, 'training');
  unchanged(p, { type: 'equip', uid: spear.uid, targetUid: a.uid });
  unchanged(p, { type: 'equip', uid: duplicate.uid, targetUid: a.uid, slot: 1 });
  unchanged(p, { type: 'unequip', targetUid: a.uid, slot: 0 });
  p = act(p, { type: 'equip', uid: spear.uid, targetUid: a.uid, slot: 0 });
  assert.equal(p.hand.length, 10);
  assert.equal(findCard(p, a.uid).equipment[0].uid, spear.uid);
  assert.ok(p.hand.some(c => def(c).key === 'shortsword'));
});

test('真实回合开始清准备与次数，再触发薪火和双装成长；上下场不补发', () => {
  let p = fresh();
  const vessel = add(p, 'vessel', 'board', 0), forge = add(p, 'forge_walker', 'board', 1);
  equip(p, forge, 'shortsword'); equip(p, forge, 'coat');
  const echo = add(p, 'echo_guard', 'board', 2);
  const hand = add(p, 'vessel');
  vessel.used.prep = 1; vessel.prep.opening.push('firemark');
  hand.prep.shield = 9n; echo.used.level = 2;
  p = startRound(p, 1);
  assert.deepEqual(p.board.slice(0, 3).map(c => c.level), [2n, 2n, 3n]);
  assert.equal(findCard(p, hand.uid).level, 1n);
  assert.equal(findCard(p, hand.uid).prep.shield, 0n);
  assert.deepEqual(p.board[0].prep.opening, []);
  p = act(p, { type: 'deploy', uid: hand.uid, slot: 3 });
  assert.equal(p.board[3].level, 1n);
  p = startRound(p, 2);
  assert.equal(p.board[3].level, 2n);
});
