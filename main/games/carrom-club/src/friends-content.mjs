// Friend boards are shared competitive layouts, independent of solo shot budgets.
export const FRIENDS_SCHEMA_VERSION = 1;
export const MAX_FRIEND_PLAYERS = 4;
export const FRIEND_COLORS = [
  { id: 'cyan', name: '青', hex: '#238aa2', symbol: '●' },
  { id: 'orange', name: '橙', hex: '#d66c26', symbol: '▲' },
  { id: 'purple', name: '紫', hex: '#9152b7', symbol: '◆' },
  { id: 'green', name: '绿', hex: '#448849', symbol: '✚' },
];

// Every ring contains a multiple of the player count. Color ownership rotates
// around each ring, giving each player the same number and radial distribution.
export const ORDINARY_FRIEND_BOARD = {
  id: 'ordinary',
  title: '普通棋盘',
  playerCounts: [2, 3, 4],
  layouts: {
    2: [{ radius: 50, count: 8 }, { radius: 95, count: 8, offset: 22.5 }],
    3: [{ radius: 38, count: 6 }, { radius: 76, count: 12 }],
    4: [{ radius: 50, count: 8 }, { radius: 95, count: 8, offset: 22.5 }],
  },
};
export const FRIEND_LEVELS = [
  {
    id: 'open-circle',
    title: '环心散局',
    subtitle: '均匀散开，寻找直击路线',
    playerCounts: [2, 3, 4],
    layouts: {
      2: [{ radius: 200, count: 16, offset: 11.25 }],
      3: [{ radius: 210, count: 18, offset: 10 }],
      4: [{ radius: 200, count: 16, offset: 11.25 }],
    },
  },
  {
    id: 'double-ring',
    title: '双环穿插',
    subtitle: '内外双环，让角度打开局面',
    playerCounts: [2, 3, 4],
    layouts: {
      2: [{ radius: 110, count: 8 }, { radius: 225, count: 8, offset: 22.5 }],
      3: [{ radius: 110, count: 6 }, { radius: 225, count: 12, offset: 15 }],
      4: [{ radius: 110, count: 8 }, { radius: 225, count: 8, offset: 22.5 }],
    },
  },
  {
    id: 'cushion-lines',
    title: '借库长线',
    subtitle: '靠近边线，尝试擦边与反弹',
    playerCounts: [2, 3, 4],
    layouts: {
      2: [{ radius: 160, count: 8, offset: 22.5 }, { radius: 310, count: 8, offset: 22.5 }],
      3: [{ radius: 160, count: 6 }, { radius: 310, count: 12, offset: 15 }],
      4: [{ radius: 160, count: 8, offset: 22.5 }, { radius: 310, count: 8, offset: 22.5 }],
    },
  },
];

export function friendBoardCoins(board, count) {
  if (!board?.playerCounts?.includes(count) || !Array.isArray(board.layouts?.[count]))
    throw new Error('此棋盘不支持当前人数');
  const coins = [];
  for (const ring of board.layouts[count]) {
    for (let index = 0; index < ring.count; index++) {
      const angle = index / ring.count * Math.PI * 2 + (ring.offset ?? 0) * Math.PI / 180;
      coins.push({
        owner: index % count,
        x: 500 + Math.cos(angle) * ring.radius,
        y: 500 + Math.sin(angle) * ring.radius,
      });
    }
  }
  return coins;
}

export function selectFriendLevel({ board = 'ordinary', levelId = null, seed = 0 } = {}) {
  if (!['ordinary', 'level', 'random'].includes(board)) throw new Error('未知棋盘模式');
  if (board === 'ordinary') return null;
  if (levelId != null) {
    if (!FRIEND_LEVELS.some((level) => level.id === levelId)) throw new Error('未知好友关卡');
    return levelId;
  }
  if (board === 'level') throw new Error('请选择好友关卡');
  if (!Number.isSafeInteger(seed)) throw new Error('无效的随机关卡种子');
  const mixed = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return FRIEND_LEVELS[mixed % FRIEND_LEVELS.length].id;
}

export function validateFriendLevels(levels = [ORDINARY_FRIEND_BOARD, ...FRIEND_LEVELS]) {
  const ids = new Set();
  for (const level of levels) {
    if (!level.id || !level.title || ids.has(level.id) || !level.playerCounts?.length)
      throw new Error('Invalid friend board');
    ids.add(level.id);
    for (const count of level.playerCounts) {
      if (![2, 3, 4].includes(count) || !level.layouts?.[count]?.length)
        throw new Error('Invalid friend player count');
      for (const ring of level.layouts[count]) {
        if (!Number.isInteger(ring.count) || ring.count < count || ring.count % count ||
            !Number.isFinite(ring.radius) || ring.radius <= 0 ||
            !Number.isFinite(ring.offset ?? 0)) throw new Error('Invalid friend ring');
      }
      const coins = friendBoardCoins(level, count);
      if (coins.length > 24) throw new Error('Too many friend coins');
      for (const [index, coin] of coins.entries()) {
        if (coin.x < 140 || coin.x > 860 || coin.y < 140 || coin.y > 860)
          throw new Error('Friend coin outside board');
        if (coins.slice(0, index).some((other) => Math.hypot(coin.x - other.x, coin.y - other.y) < 36))
          throw new Error('Overlapping friend coins');
      }
    }
  }
  return true;
}
