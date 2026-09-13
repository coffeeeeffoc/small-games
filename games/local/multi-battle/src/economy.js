import { CARDS, SHOP_WEIGHTS, UPGRADE_COSTS } from './content.js';
import { clone, createCard, def, emptyPrep, random } from './shared.js';

const SHOP_TYPES = ['character', 'character', 'character', 'spell', 'equipment'];
const requireRule = (condition, message) => { if (!condition) throw new Error(message); };
export const findCard = (player, uid) => [...player.board, ...player.hand].find(card => card?.uid === uid);
const onBoard = (player, card) => player.board.includes(card);
const characters = player => player.board.filter(Boolean);
const lowest = (player, excluded, count = 1) => characters(player)
  .filter(card => !excluded.includes(card)).sort((a, b) => a.level < b.level ? -1 : a.level > b.level ? 1 : 0).slice(0, count);

function draw(player, type) {
  let roll = random(player) * 100;
  const weights = SHOP_WEIGHTS[player.level - 1];
  let tier = 1;
  while (tier < weights.length && roll >= weights[tier - 1]) roll -= weights[tier++ - 1];
  const pool = CARDS.filter(card => card.type === type && card.tier === tier);
  return createCard(player, pool[Math.floor(random(player) * pool.length)].id);
}

function restock(player, choice, onlyEmpty = false) {
  player.shop = SHOP_TYPES.map((type, slot) =>
    (!choice || choice === type) && (!onlyEmpty || !player.shop[slot]) ? draw(player, type) : player.shop[slot]);
  if (!choice) player.frozen = false;
}

function effects(player, events) {
  const queue = [];
  let processing = false;
  const log = (type, text, details = {}) => {
    events.push({ type, text, ...details });
    player.log = [...player.log, text].slice(-40);
  };
  const spendUse = (card, key, limit) => {
    if ((card.used[key] || 0) >= limit) return false;
    card.used[key] = (card.used[key] || 0) + 1;
    return true;
  };
  const discount = () => {
    const card = player.shop.find(card => card && def(card).type === 'character');
    if (card) card.price = Math.max(1, card.price - 1);
  };
  const gain = (card, amount, reason = 'gain') => {
    card.level += amount;
    log(reason === 'link' ? 'LevelLinked' : 'LevelGained', `${def(card).name} 等级 +${amount}`, { uid: card.uid, delta: amount, reason });
    if (reason !== 'link' && onBoard(player, card)) dispatch('LevelGained', { card });
  };
  const linkLowest = (source, excluded, limit, count = 1) => {
    const targets = lowest(player, excluded, count);
    if (targets.length && spendUse(source, 'level', limit)) targets.forEach(card => gain(card, 1n, 'link'));
  };
  function listen(type, source, host, data) {
    if (!onBoard(player, host) || (source !== host && !host.equipment.includes(source))) return;
    const key = def(source).key;
    if (type === 'LevelGained') {
      if ((key === 'tuner' || key === 'badge') && host === data.card) linkLowest(source, [host], 1);
      if (key === 'echo_guard' && host !== data.card && spendUse(source, 'level', 2)) gain(host, 1n, 'link');
      if (key === 'conductor' && host !== data.card) linkLowest(source, [host, data.card], 1, 2);
    }
    if (type === 'PrepStarted' && (key === 'vessel' || (key === 'forge_walker' && host.equipment.length === 2))) {
      if (spendUse(source, 'prep', 1)) gain(host, 1n);
    }
    if (type === 'PaidRerolled') {
      if (key === 'broker' && spendUse(source, 'reroll', 1)) gain(host, 1n);
      if (key === 'magnate' && spendUse(source, 'reroll', 3)) discount();
      if (key === 'abacus' && spendUse(source, 'reroll', 3)) host.prep.attack += 1n;
    }
    if (type === 'CharacterSold' && key === 'bookkeeper' && spendUse(source, 'sell', 1)) {
      const reward = Math.min(1, Math.max(0, 3 - player.extraGold));
      player.extraGold += reward;
      player.gold += reward;
      log('GoldGranted', `${def(host).name} 额外获得 ${reward} 金`, { uid: host.uid });
    }
    if (type === 'SpellCast') {
      if (key === 'apprentice' && spendUse(source, 'spell', 1)) gain(host, 1n);
      if (key === 'cannoneer' && spendUse(source, 'spell', 3)) host.prep.opening.push('cannon');
      if (key === 'archivist' && spendUse(source, 'spell', 3)) characters(player).forEach(card => { card.prep.attack += 1n; });
      if (key === 'grimoire' && spendUse(source, 'spell', 2)) host.prep.attack += 2n;
    }
    if (type === 'LevelTransferred' || type === 'LevelsSwapped') {
      const change = data.changes.get(host.uid) || 0n;
      if (key === 'successor' && change > 0n && spendUse(source, 'transfer', 1)) host.prep.attack += 3n;
      if (key === 'amulet' && change < 0n && spendUse(source, 'transfer', 1)) host.prep.shield += 6n;
      if (key === 'keeper' && spendUse(source, 'transfer', 1)) data.targets.forEach(card => { card.prep.shield += 6n; });
    }
  }
  function dispatch(type, data = {}) {
    for (const host of characters(player)) {
      for (const source of [host, ...host.equipment]) queue.push(() => listen(type, source, host, data));
    }
    if (processing) return;
    processing = true;
    while (queue.length) queue.shift()();
    processing = false;
  }
  return { log, gain, dispatch, discount };
}

export function startRound(original, round) {
  if (!Number.isInteger(round) || round !== original.round + 1) return original;
  const player = clone(original);
  player.round = round;
  player.extraGold = 0;
  for (const card of [...player.board, ...player.hand].filter(Boolean)) {
    card.used = {};
    card.prep = emptyPrep();
    for (const equipment of card.equipment) equipment.used = {};
  }
  const income = Math.min(3 + round, 12);
  player.gold += income;
  restock(player, undefined, player.frozen);
  const fx = effects(player, []);
  fx.log('PrepStarted', `第 ${round} 回合，收入 ${income} 金`);
  fx.dispatch('PrepStarted');
  return player;
}

export function applyAction(original, action) {
  const player = clone(original);
  const events = [];
  const fx = effects(player, events);
  const owned = uid => {
    const card = findCard(player, uid);
    requireRule(card, '没有找到这张自有卡牌');
    return card;
  };
  const character = uid => {
    const card = owned(uid);
    requireRule(def(card).type === 'character', '请选择角色');
    return card;
  };
  const inHand = uid => {
    const card = owned(uid);
    requireRule(player.hand.includes(card), '卡牌必须位于手牌');
    return card;
  };
  const capacity = count => requireRule(count <= 10, `手牌空间不足，请腾出 ${count - 10} 格`);
  const pay = cost => { requireRule(player.gold >= cost, `金币不足，需要 ${cost} 金`); player.gold -= cost; };
  const remove = card => {
    const slot = player.board.indexOf(card);
    if (slot >= 0) player.board[slot] = null;
    else player.hand.splice(player.hand.indexOf(card), 1);
  };
  try {
    requireRule(action && typeof action === 'object', '无效操作');
    requireRule(!player.phase || player.phase === 'prep', '仅备战阶段可以操作');
    requireRule(player.hp > 0, '已淘汰，无法继续经营');
    switch (action.type) {
      case 'buy': {
        requireRule(Number.isInteger(action.slot) && action.slot >= 0 && action.slot < 5, '无效商店格');
        const card = player.shop[action.slot];
        requireRule(card, '商品已售出');
        if (action.use) {
          requireRule(['deploy', 'merge', 'equip', 'cast'].includes(action.use.type), '购买后只能部署、叠加、穿戴或施法');
          requireRule((action.use.type === 'merge' ? action.use.sourceUid : action.use.uid) === card.uid, '必须使用本次购买的商品');
        }
        pay(card.price);
        player.hand.push(card);
        player.shop[action.slot] = null;
        fx.log('Purchased', `购买 ${def(card).name}，花费 ${card.price} 金`, { uid: card.uid });
        if (action.use) {
          const used = applyAction(player, action.use);
          requireRule(used.ok, used.error);
          Object.assign(player, used.player);
          events.push(...used.events);
        }
        capacity(player.hand.length);
        break;
      }
      case 'reroll':
        pay(1);
        restock(player);
        fx.log('PaidRerolled', '花费 1 金刷新商店');
        fx.dispatch('PaidRerolled');
        break;
      case 'freeze':
        player.frozen = !player.frozen;
        fx.log('Frozen', player.frozen ? '商店已冻结，下回合保留商品' : '已解除商店冻结');
        break;
      case 'upgrade': {
        requireRule(player.level < 5, '指挥官已达到 P5');
        const cost = UPGRADE_COSTS[player.level];
        pay(cost);
        player.level++;
        fx.log('CommanderUpgraded', `花费 ${cost} 金升至 P${player.level}`);
        break;
      }
      case 'deploy': {
        const card = character(action.uid);
        requireRule(Number.isInteger(action.slot) && action.slot >= 0 && action.slot < 6, '无效战场格');
        const boardSlot = player.board.indexOf(card);
        requireRule(boardSlot !== action.slot, '角色已在这个位置');
        const replaced = player.board[action.slot];
        if (boardSlot >= 0) player.board[boardSlot] = replaced;
        else {
          const handSlot = player.hand.indexOf(card);
          if (replaced) player.hand[handSlot] = replaced;
          else player.hand.splice(handSlot, 1);
        }
        player.board[action.slot] = card;
        fx.log('Deployed', `${def(card).name} 部署至 ${action.slot < 3 ? '前' : '后'}排 ${action.slot % 3 + 1}`, { uid: card.uid });
        break;
      }
      case 'recall': {
        const card = character(action.uid);
        requireRule(onBoard(player, card), '角色不在战场');
        capacity(player.hand.length + 1);
        remove(card);
        player.hand.push(card);
        fx.log('Recalled', `${def(card).name} 撤回手牌`, { uid: card.uid });
        break;
      }
      case 'sell': {
        const card = owned(action.uid);
        capacity(player.hand.length - Number(player.hand.includes(card)) + card.equipment.length);
        remove(card);
        player.hand.push(...card.equipment);
        player.gold++;
        fx.log(def(card).type === 'character' ? 'CharacterSold' : 'ItemSold', `出售 ${def(card).name}，获得 1 金`, { uid: card.uid });
        if (def(card).type === 'character') fx.dispatch('CharacterSold', { card });
        break;
      }
      case 'merge': {
        const source = character(action.sourceUid), target = character(action.targetUid);
        requireRule(source !== target && source.defId === target.defId, '请选择两个不同的同名角色');
        capacity(player.hand.length - Number(player.hand.includes(source)) + source.equipment.length);
        remove(source);
        player.hand.push(...source.equipment);
        for (const [key, value] of Object.entries(source.used)) target.used[key] = Math.max(target.used[key] || 0, value);
        fx.gain(target, source.level, 'merge');
        break;
      }
      case 'equip': {
        const item = inHand(action.uid), target = character(action.targetUid);
        requireRule(def(item).type === 'equipment', '请选择手牌装备');
        const slot = action.slot ?? target.equipment.length;
        requireRule(Number.isInteger(slot) && slot >= 0 && slot < 2 && slot <= target.equipment.length, '装备位已满，请明确选择替换位置');
        requireRule(!target.equipment.some((equipped, i) => i !== slot && equipped.defId === item.defId), '同一角色不能佩戴两件同名装备');
        const replaced = target.equipment[slot];
        if (replaced) player.hand[player.hand.indexOf(item)] = replaced;
        else remove(item);
        target.equipment[slot] = item;
        fx.log('Equipped', `${def(target).name} 装备 ${def(item).name}`, { uid: item.uid, targetUid: target.uid });
        break;
      }
      case 'unequip': {
        const target = character(action.targetUid);
        requireRule(Number.isInteger(action.slot) && action.slot >= 0 && action.slot < target.equipment.length, '没有这件装备');
        capacity(player.hand.length + 1);
        const [item] = target.equipment.splice(action.slot, 1);
        player.hand.push(item);
        fx.log('Unequipped', `${def(target).name} 卸下 ${def(item).name}`, { uid: item.uid, targetUid: target.uid });
        break;
      }
      case 'cast': {
        const spell = inHand(action.uid);
        requireRule(def(spell).type === 'spell', '请选择手牌法术');
        requireRule(action.targets === undefined || Array.isArray(action.targets), '法术目标格式无效');
        const key = def(spell).key;
        const targets = (action.targets || []).map(character);
        const count = ['chorus', 'bequest', 'exchange', 'succession'].includes(key) ? 2 : ['open_market', 'targeted_order', 'rally'].includes(key) ? 0 : 1;
        requireRule(targets.length === count && new Set(targets).size === count, `请选择 ${count} 名不同的合法角色`);
        const canHand = ['bequest', 'exchange', 'succession', 'training', 'potential'].includes(key);
        requireRule(canHand || targets.every(card => onBoard(player, card)), '此法术只能选择战场角色');
        const [a, b] = targets;
        if (key === 'bequest' || key === 'succession') requireRule(a.level > 1n, '来源角色需要至少 L2');
        if (key === 'exchange') requireRule(a.level !== b.level, '双方等级相同，无法交换');
        if (key === 'targeted_order') requireRule(SHOP_TYPES.includes(action.choice), '请选择角色、法术或装备类型');
        if (key === 'rally') requireRule(characters(player).length, '战场至少需要一名角色');
        if (key === 'overload') requireRule(a.equipment.length, '目标至少需要一件装备');
        if (key === 'offering') {
          requireRule(characters(player).length >= 2, '战场至少需要两名角色');
          requireRule(!a.prep.opening.includes('offering'), '该角色本回合已接受赴火誓约');
        }
        if (key === 'paper_reinforcements') requireRule(!a.prep.deathSummon, '该角色本回合已接受纸偶增援');
        remove(spell);
        switch (key) {
          case 'chorus': targets.forEach(card => fx.gain(card, 1n)); break;
          case 'breakthrough':
            fx.gain(a, 3n);
            lowest(player, [a]).forEach(card => fx.gain(card, 1n, 'link'));
            break;
          case 'bequest': case 'succession': case 'exchange': {
            const oldA = a.level, oldB = b.level;
            if (key === 'exchange') [a.level, b.level] = [b.level, a.level];
            else { b.level += a.level - 1n; a.level = 1n; }
            const type = key === 'exchange' ? 'LevelsSwapped' : 'LevelTransferred';
            fx.log(type, `${def(a).name} → ${def(b).name} ${key === 'exchange' ? '交换' : '转移'}成长`, { uid: a.uid, targetUid: b.uid, amount: oldA - 1n });
            fx.dispatch(type, { targets, changes: new Map([[a.uid, a.level - oldA], [b.uid, b.level - oldB]]) });
            if (key === 'bequest') b.prep.shield += 6n;
            break;
          }
          case 'open_market': restock(player); fx.discount(); break;
          case 'targeted_order': restock(player, action.choice); break;
          case 'firemark': case 'starfall': case 'offering': a.prep.opening.push(key); break;
          case 'reinforce': a.prep.shield += a.equipment.length ? 8n : 4n; break;
          case 'overload': a.prep.attack += BigInt(a.equipment.length * 4); break;
          case 'paper_reinforcements': a.prep.deathSummon = true; break;
          case 'training': fx.gain(a, 2n); break;
          case 'potential': fx.gain(a, 4n); break;
          case 'rally': characters(player).forEach(card => { card.prep.attack += 2n; }); break;
          default: throw new Error('尚未支持该法术');
        }
        fx.log('SpellCast', `施放 ${def(spell).name}`, { uid: spell.uid, targets: targets.map(card => card.uid) });
        fx.dispatch('SpellCast');
        break;
      }
      default: throw new Error('未知操作');
    }
    return { ok: true, player, events, error: null };
  } catch (error) {
    return { ok: false, player: original, events: [], error: error.message };
  }
}
