import { LEVELS } from './levels.mjs';

const clone = (value) => structuredClone(value);
const levelFor = (state) => LEVELS[state.levelId];
const hasContract = (state, effect) =>
  levelFor(state).contracts.find(
    (contract) => contract.effect === effect && state.contracts.includes(contract.id),
  );
const upgrade = (state, effect) => hasContract(state, effect)?.value ?? 0;
export const getRoom = (state, id = state.roomId) => state.rooms[id];
export const getIntent = (state) => {
  const enemy = getRoom(state)?.enemy;
  return enemy && enemy.hp > 0 ? enemy.intents[enemy.intentIndex % enemy.intents.length] : null;
};

export function createGame(levelId = 'chapter-1') {
  const level = LEVELS[levelId];
  if (!level) throw new Error(`未知章节：${levelId}`);
  return {
    levelId,
    roomId: level.start,
    ...level.initial,
    seals: 0,
    status: 'playing',
    turn: 0,
    focus: 0,
    gateUnlocked: false,
    contracts: [],
    rooms: Object.fromEntries(
      level.rooms.map((room) => [
        room.id,
        {
          ...clone(room),
          revealed: room.id === level.start,
          visited: room.id === level.start,
          cleared: !room.enemy,
          claimed: false,
          traced: false,
          ...(room.enemy ? { enemy: { ...clone(room.enemy), intentIndex: 0 } } : {}),
        },
      ]),
    ),
    stats: {
      spent: { explore: 0, attack: 0, heal: 0, trade: 0 },
      inkRecovered: 0,
      roomsRevealed: 1,
      drawnRooms: 0,
      tracedRooms: 0,
      enemiesDefeated: 0,
      damageTaken: 0,
      freeAttacks: 0,
      guards: 0,
      heals: 0,
      trades: 0,
      moves: 0,
    },
    log: ['你在落笔处醒来。以墨绘路，或承受轻微擦伤免费摸索。'],
    summary: null,
  };
}

function option(type, label, cost = 0, enabled = true, extras = {}) {
  return { type, label, cost, enabled, ...extras };
}

/** Public action descriptors drive both mouse and keyboard controls. */
export function getOptions(state) {
  if (state.status !== 'playing') return [option('restart', '重新落笔')];
  const level = levelFor(state);
  const room = getRoom(state);
  const fighting = Boolean(room.enemy && room.enemy.hp > 0);
  const options = [];
  const healAmount = level.rules.healAmount + upgrade(state, 'heal');
  const healReason =
    state.hp >= state.maxHp ? '生命已满' : state.ink < level.rules.healCost ? '墨水不足' : '';
  if (fighting) {
    options.push(
      option('attack', '墨弹', level.rules.attackCost, state.ink >= level.rules.attackCost, {
        kind: 'combat',
        reason: state.ink < level.rules.attackCost ? '墨水不足' : '',
        description: `造成 ${level.rules.attackDamage + upgrade(state, 'attack')} 伤害；随后敌人执行当前意图。`,
      }),
      option('dry', '干笔轻击', 0, true, {
        kind: 'combat',
        description: `造成 ${1 + state.focus} 伤害${state.focus ? '，消耗专注' : ''}；随后敌人执行当前意图。`,
      }),
      option('guard', '收笔防守', 0, true, {
        kind: 'combat',
        description: '完全挡下当前攻击；成功挡伤获得 2 专注，使下次干笔造成 3 伤害。',
      }),
    );
  }
  options.push(
    option('heal', '蘸墨疗伤', level.rules.healCost, !healReason, {
      kind: 'survival',
      reason: healReason,
      description: `恢复 ${healAmount} 生命${fighting ? '；随后敌人执行当前意图' : ''}。`,
    }),
  );
  if (!fighting) {
    if (room.reward && !room.claimed) {
      const canBenefit = Boolean(
        room.reward.seals ||
          (room.reward.ink && state.ink < state.maxInk) ||
          (room.reward.hp && state.hp < state.maxHp),
      );
      const overflow = Math.max(0, state.ink + (room.reward.ink ?? 0) - state.maxInk);
      const description =
        room.rewardText + (overflow ? `；墨瓶将溢出 ${overflow} 墨，可以稍后领取。` : '');
      options.push(
        option('claim', room.kind === 'spring' ? '饮下泉水' : '收下馈赠', 0, canBenefit, {
          kind: 'reward',
          description,
          reason: canBenefit ? '' : '当前资源无需补充，可稍后再来',
        }),
      );
    }
    if (room.kind === 'merchant')
      for (const contract of level.contracts) {
        const bought = state.contracts.includes(contract.id);
        const reason = bought ? '已签订' : state.ink < contract.price ? '墨水不足' : '';
        options.push(
          option('buy', contract.name, contract.price, !reason, {
            target: contract.id,
            kind: 'trade',
            reason,
            description: contract.description,
          }),
        );
      }
    if (room.exits.includes(level.gate) && !state.gateUnlocked) {
      options.push(
        option('unlock', '以钥印开启终门', 0, state.seals >= level.requiredSeals, {
          kind: 'gate',
          reason:
            state.seals < level.requiredSeals
              ? `还需 ${level.requiredSeals - state.seals} 枚钥印`
              : '',
          description: '钥印不会消失，开启终门后仍可回访补给。',
        }),
      );
    }
    for (const id of room.exits) {
      const target = getRoom(state, id);
      const locked = id === level.gate && !state.gateUnlocked;
      const base = { target: id, kind: 'travel', description: target.hint };
      if (target.revealed)
        options.push(
          option('move', `前往${target.name}`, 0, !locked, {
            ...base,
            reason: locked ? '请先在门廊开启终门' : '',
          }),
        );
      else {
        const drawCost = level.rules.drawCost - upgrade(state, 'explore');
        options.push(
          option('draw', `绘路 · ${target.name}`, drawCost, !locked && state.ink >= drawCost, {
            ...base,
            turns: 1,
            reason: locked
              ? '请先在门廊开启终门'
              : state.ink < drawCost
                ? '墨水不足，可免费摸索'
                : '',
            description: `${target.hint} 绘路只需 1 回合，避免摸索擦伤${target.enemy ? '，敌人保持原有生命' : ''}。`,
          }),
        );
        options.push(
          option('trace', `摸索 · ${target.name}`, 0, !locked, {
            ...base,
            turns: level.rules.traceTurns,
            reason: locked ? '请先在门廊开启终门' : '',
            description: `${target.hint} 免费摸索耗 ${level.rules.traceTurns} 回合，擦伤 ${level.rules.traceDamage} 生命（最低保留 1，擦伤不会致死）${target.enemy ? `；敌人额外获得 ${level.rules.traceEnemyBonus} 生命` : ''}。`,
          }),
        );
      }
    }
  }
  return options;
}

function conclude(state) {
  const spent = state.stats.spent;
  const totalSpent = Object.values(spent).reduce((sum, value) => sum + value, 0);
  let title = '从容落笔';
  if (state.stats.tracedRooms >= 5 && spent.attack <= 10) title = '干笔行者';
  else if (state.stats.roomsRevealed >= 11) title = '绘界旅人';
  else if (spent.trade > 0 && spent.attack >= 15) title = '契约执笔人';
  else if (spent.attack >= 20) title = '利墨破局者';
  state.summary = {
    title,
    turns: state.turn,
    explored: state.stats.roomsRevealed,
    totalRooms: Object.keys(state.rooms).length,
    inkRemaining: state.ink,
    totalSpent,
    spent: clone(spent),
    // No clock, hidden countdown or survival penalty: efficiency is a visible optional goal.
    efficiency: state.turn <= 28 ? '行云流水' : state.turn <= 45 ? '从容有度' : '细读每一页',
  };
}

/** Pure reducer: invalid actions and terminal states never change the previous state. */
export function act(previous, action = {}) {
  if (action.type === 'restart')
    return {
      state: createGame(previous.levelId),
      ok: true,
      message: '新的一页，重新落笔。',
      events: [{ type: 'restart' }],
    };
  if (previous.status !== 'playing')
    return { state: previous, ok: false, message: '这一页已经结束，请重新落笔。', events: [] };
  const available = getOptions(previous).find(
    (candidate) => candidate.type === action.type && candidate.target === action.target,
  );
  if (!available) return { state: previous, ok: false, message: '此刻不能这样落笔。', events: [] };
  if (!available.enabled)
    return { state: previous, ok: false, message: available.reason, events: [] };

  const state = clone(previous);
  const level = levelFor(state);
  const room = getRoom(state);
  const events = [];
  let message = '';
  let resolveEnemy = false;
  let blocking = false;
  state.turn += 1;
  const spend = (category, amount) => {
    state.ink -= amount;
    state.stats.spent[category] += amount;
    events.push({ type: 'spend', category, amount });
  };

  switch (action.type) {
    case 'draw':
    case 'trace':
    case 'move': {
      const target = getRoom(state, action.target);
      if (!target.revealed) {
        target.revealed = true;
        state.stats.roomsRevealed += 1;
        if (action.type === 'draw') {
          spend('explore', available.cost);
          state.stats.drawnRooms += 1;
        } else {
          target.traced = true;
          state.stats.tracedRooms += 1;
          state.turn += level.rules.traceTurns - 1;
          const scrape = Math.min(Math.max(0, state.hp - 1), level.rules.traceDamage);
          state.hp -= scrape;
          state.stats.damageTaken += scrape;
          if (scrape > 0) events.push({ type: 'hurt', amount: scrape, source: 'trace' });
          if (target.enemy) {
            target.enemy.hp += level.rules.traceEnemyBonus;
            target.enemy.maxHp += level.rules.traceEnemyBonus;
          }
        }
      }
      target.visited = true;
      state.roomId = target.id;
      state.focus = 0;
      state.stats.moves += 1;
      message = `${action.type === 'draw' ? '你以墨绘出' : action.type === 'trace' ? '你沿纸纹摸索，找到' : '你来到'}${target.name}。${target.enemy && target.enemy.hp > 0 ? ` ${target.enemy.name}正在${target.enemy.intents[0].name}。` : ''}`;
      if (action.type === 'trace')
        message += ` 摸索用了 ${level.rules.traceTurns} 回合，${previous.hp > 1 ? `擦伤 ${previous.hp - state.hp} 生命` : '擦伤不会致死，保留最后 1 点生命'}。`;
      events.push({ type: 'move', roomId: target.id, method: action.type });
      break;
    }
    case 'attack':
    case 'dry': {
      const damage =
        action.type === 'attack'
          ? level.rules.attackDamage + upgrade(state, 'attack')
          : 1 + state.focus;
      if (action.type === 'attack') spend('attack', available.cost);
      else {
        state.focus = 0;
        state.stats.freeAttacks += 1;
      }
      room.enemy.hp = Math.max(0, room.enemy.hp - damage);
      events.push({ type: 'attack', damage, method: action.type });
      message = `${action.type === 'attack' ? '墨弹' : '干笔'}命中，造成 ${damage} 伤害。`;
      resolveEnemy = true;
      if (room.enemy.hp === 0) {
        room.cleared = true;
        state.focus = 0;
        state.stats.enemiesDefeated += 1;
        events.push({ type: 'defeat', enemy: room.enemy.name });
        message += ` ${room.enemy.name}散成墨迹。`;
        resolveEnemy = false;
        if (room.kind === 'boss') {
          state.status = 'won';
          message = '墨之门打开了。你没有留下所有墨，却为自己写出了下一页。';
          events.push({ type: 'win' });
        } else if (room.reward) message += ' 别忘了收下馈赠。';
      }
      break;
    }
    case 'guard':
      state.stats.guards += 1;
      blocking = true;
      resolveEnemy = true;
      message = '你收起笔锋，守住这一页。';
      break;
    case 'heal': {
      spend('heal', available.cost);
      const healed = Math.min(
        state.maxHp - state.hp,
        level.rules.healAmount + upgrade(state, 'heal'),
      );
      state.hp += healed;
      state.stats.heals += 1;
      events.push({ type: 'heal', amount: healed });
      message = `墨迹缝合伤口，恢复 ${healed} 生命。`;
      resolveEnemy = Boolean(room.enemy && room.enemy.hp > 0);
      break;
    }
    case 'claim': {
      room.claimed = true;
      const ink = Math.min(state.maxInk - state.ink, room.reward.ink ?? 0);
      const hp = Math.min(state.maxHp - state.hp, room.reward.hp ?? 0);
      state.ink += ink;
      state.hp += hp;
      state.seals += room.reward.seals ?? 0;
      state.stats.inkRecovered += ink;
      const received = [
        ink && `${ink} 墨`,
        hp && `${hp} 生命`,
        room.reward.seals && `${room.reward.seals} 枚钥印`,
      ].filter(Boolean);
      message = `你收下了 ${received.join('、')}。`;
      if (ink < (room.reward.ink ?? 0)) message += ' 墨瓶已满，余墨散入纸页。';
      events.push({ type: 'reward', ink, hp, seals: room.reward.seals ?? 0 });
      break;
    }
    case 'buy': {
      const contract = level.contracts.find((candidate) => candidate.id === action.target);
      spend('trade', contract.price);
      state.contracts.push(contract.id);
      state.stats.trades += 1;
      if (contract.effect === 'heal') {
        state.maxHp += contract.value;
        state.hp += contract.value;
      }
      message = `你以 ${contract.price} 墨签下「${contract.name}」。${contract.description}`;
      events.push({ type: 'contract', id: contract.id });
      break;
    }
    case 'unlock':
      state.gateUnlocked = true;
      message = '两枚钥印合拢，墨之门不再封闭。准备好后，绘出最后一条路。';
      events.push({ type: 'unlock' });
      break;
  }

  if (resolveEnemy) {
    const intent = getIntent(state);
    if (blocking && intent.damage > 0) {
      state.focus = 2;
      message += ` 挡下「${intent.name}」，获得 2 专注。`;
      events.push({ type: 'block', amount: intent.damage });
    } else if (intent.damage > 0) {
      const damage = Math.min(state.hp, intent.damage);
      state.hp -= damage;
      state.stats.damageTaken += damage;
      message += ` ${room.enemy.name}使出「${intent.name}」，你失去 ${damage} 生命。`;
      events.push({ type: 'hurt', amount: damage });
    } else message += ` 对手正在${intent.name}，没有攻击。`;
    room.enemy.intentIndex += 1;
    if (state.hp <= 0) {
      state.status = 'lost';
      message = '最后一笔落空了。纸页仍在，下一次可以读懂敌人的意图，再落笔。';
      events.push({ type: 'lose' });
    }
  }
  if (state.status !== 'playing') conclude(state);
  state.log = [...state.log, message].slice(-60);
  return { state, ok: true, message, events };
}
