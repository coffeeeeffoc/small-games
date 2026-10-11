import {
  STEP, COIN_POINTS, QUEEN_POINTS, createGame, createDisk, advancePhysics, returnCoin, clamp,
} from './core.mjs';
import {
  FRIEND_COLORS, FRIEND_LEVELS, ORDINARY_FRIEND_BOARD, friendBoardCoins, selectFriendLevel,
} from './friends-content.mjs';

export const multiplayerVersion = 1;
export const MAX_SHOT_STEPS = 240 * 20;
const copy = (value) => structuredClone(value);

// Seats 0/1/2/3 are bottom/right/top/left. Position is always measured along
// the player's own bottom baseline, so identical touch controls work per seat.
export function seatToWorld({ x, y }, seat) {
  switch (((seat % 4) + 4) % 4) {
    case 1: return { x: y, y: 1000 - x };
    case 2: return { x: 1000 - x, y: 1000 - y };
    case 3: return { x: 1000 - y, y: x };
    default: return { x, y };
  }
}
export const worldToSeat = (point, seat) => seatToWorld(point, -seat);
export const baselinePoint = (seat, position = 500) => seatToWorld({ x: position, y: 790 }, seat);
export const remainingFriends = (game, player = game.turn) => {
  const team = game.players[player]?.team;
  return game.coins.filter((coin) => !coin.pocketed && coin.owner === team).length;
};
export function friendsScore(game, player) {
  const team = game.players[player]?.team;
  const coins = game.coins.filter((coin) => coin.pocketed && coin.owner === team).length;
  return coins * COIN_POINTS + (game.queen === 'covered' && game.queenOwner === team ? QUEEN_POINTS : 0);
}

export function createMultiplayerMatch({
  mode = 'colors', players, board = 'ordinary', levelId = null, seed = 0,
  round = 1, firstPlayer = null,
} = {}) {
  if (!['singles', 'doubles', 'colors'].includes(mode)) throw new Error('未知好友玩法');
  if (!Array.isArray(players) || players.length < 2 || players.length > 4 ||
      (mode === 'singles' && players.length !== 2) || (mode === 'doubles' && players.length !== 4))
    throw new Error('当前玩法人数不匹配');
  if (players.some((player) => typeof player?.id !== 'string' || !player.id || player.id.length > 128) ||
      new Set(players.map((player) => player.id)).size !== players.length)
    throw new Error('玩家身份无效或重复');
  if (!Number.isSafeInteger(round) || round < 1) throw new Error('无效局数');
  if (mode !== 'colors' && board !== 'ordinary') throw new Error('经典玩法使用标准棋盘');
  const count = players.length;
  const first = firstPlayer ?? (round - 1) % count;
  if (!Number.isInteger(first) || first < 0 || first >= count) throw new Error('无效开球玩家');
  const selectedId = selectFriendLevel({ board, levelId, seed });
  const threePlayer = mode === 'colors' && count === 3;
  const rotation = threePlayer ? Math.floor((round - 1) / 3) % 4 : 0;
  const roster = players.map((player, index) => {
    const team = mode === 'colors' ? index : (index - first + count) % 2;
    const palette = FRIEND_COLORS[index];
    return {
      id: player.id,
      name: typeof player.name === 'string' ? player.name.slice(0, 40) : `棋友 ${index + 1}`,
      seat: ((count === 2 ? index * 2 : threePlayer ? (index + round - 1) % 3 : index) + rotation) % 4,
      team,
      color: mode === 'colors' ? palette.id : team === 0 ? 'white' : 'black',
      symbol: mode === 'colors' ? palette.symbol : team === 0 ? '白' : '黑',
    };
  });
  const game = createGame();
  if (mode === 'colors') {
    const layout = selectedId ? FRIEND_LEVELS.find((level) => level.id === selectedId) : ORDINARY_FRIEND_BOARD;
    game.coins = friendBoardCoins(layout, count).map((coin, index) => ({
      ...createDisk(`friend-coin-${index}`, roster[coin.owner].color, coin.x, coin.y),
      owner: coin.owner,
      symbol: roster[coin.owner].symbol,
    }));
  } else {
    for (const coin of game.coins) coin.owner = coin.kind === 'queen' ? null : coin.kind === 'white' ? 0 : 1;
  }
  const teamCount = mode === 'colors' ? count : 2;
  Object.assign(game, {
    multiplayerVersion,
    mode,
    board,
    levelId: selectedId,
    round,
    players: roster,
    firstPlayer: first,
    turn: first,
    debt: Array(teamCount).fill(0),
    foulsByPlayer: Array(count).fill(0),
    totals: Array.from({ length: teamCount }, (_, team) => game.coins.filter((coin) => coin.owner === team).length),
    queen: mode === 'colors' ? 'none' : 'board',
    queenOwner: null,
    winner: null,
    winnerTeam: null,
    finisher: null,
    ranking: [],
    simulationSteps: 0,
    turnNumber: 1,
    message: `${roster[first].name}开球${mode === 'colors' ? '' : ' · 白子先行'}`,
  });
  placeFriendsStriker(game, 500);
  return game;
}

export function placeFriendsStriker(game, requestedPosition) {
  if (game.phase !== 'ready' || !Number.isFinite(requestedPosition)) return false;
  const seat = game.players[game.turn].seat;
  const desired = clamp(requestedPosition, 235, 765);
  const free = (position) => {
    const point = baselinePoint(seat, position);
    return !game.coins.some((coin) => !coin.pocketed && Math.hypot(coin.x - point.x, coin.y - point.y) < coin.r + 25);
  };
  let position = desired;
  if (!free(position)) {
    let best = null;
    for (let candidate = 235; candidate <= 765; candidate += 2) {
      if (free(candidate) && (best === null || Math.abs(candidate - desired) < Math.abs(best - desired)))
        best = candidate;
    }
    if (best === null) return false;
    position = best;
  }
  const point = baselinePoint(seat, position);
  Object.assign(game.striker, createDisk('striker', 'striker', point.x, point.y));
  return true;
}

export function shootFriends(game, dx, dy, power) {
  const length = Math.hypot(dx, dy);
  if (game.phase !== 'ready' || !Number.isFinite(dx) || !Number.isFinite(dy) ||
      !Number.isFinite(length) || length < 0.001 || !Number.isFinite(power) || power < 0.025 || power > 1)
    return false;
  const position = worldToSeat(game.striker, game.players[game.turn].seat).x;
  if (!placeFriendsStriker(game, position)) return false;
  Object.assign(game.striker, { vx: dx / length * (180 + power * 1670), vy: dy / length * (180 + power * 1670) });
  Object.assign(game, {
    phase: 'moving', quiet: 0, elapsed: 0, simulationSteps: 0, shotPots: [], shotFoul: false,
    shots: game.shots + 1, message: '听，棋子在滑行',
  });
  game.events = [{ type: 'strike', strength: power }];
  return true;
}

export function stepFriends(game, dt = STEP) {
  if (game.phase !== 'moving') return;
  const settled = advancePhysics(game, dt);
  game.simulationSteps++;
  if (settled || game.simulationSteps >= MAX_SHOT_STEPS || game.elapsed >= 20) {
    for (const coin of [...game.coins, game.striker]) coin.vx = coin.vy = 0;
    resolveFriendsShot(game);
  }
}

function prepareTurn(game) {
  game.phase = 'ready';
  for (let attempt = 0; attempt < game.players.length; attempt++) {
    if (placeFriendsStriker(game, 500)) return;
    game.turn = (game.turn + 1) % game.players.length;
    game.message = '底线被占满 · 顺次换手';
  }
  // With every baseline occupied, return only the active baseline's blocking
  // pieces to the centre. Do not publish a ready state with an unusable striker.
  const seat = game.players[game.turn].seat;
  for (const coin of game.coins) {
    const local = worldToSeat(coin, seat);
    if (!coin.pocketed && Math.abs(local.y - 790) < coin.r + 25 && local.x > 190 && local.x < 810)
      returnCoin(game, coin);
  }
  if (!placeFriendsStriker(game, 500)) throw new Error('无法摆放击球子');
  game.message = '底线棋子返摆 · 继续出杆';
}

function finish(game, finisher) {
  game.phase = 'over';
  game.finisher = finisher;
  let winnerTeam = game.players[finisher].team;
  if (game.mode !== 'colors') {
    const teamScores = [0, 1].map((team) => friendsScore(game, game.players.findIndex((player) => player.team === team)));
    if (teamScores[0] !== teamScores[1]) winnerTeam = teamScores[0] > teamScores[1] ? 0 : 1;
  }
  game.winnerTeam = winnerTeam;
  game.winner = game.players[finisher].team === winnerTeam ? finisher : game.players.findIndex((player) => player.team === winnerTeam);
  const ranks = game.players.map((player, index) => ({
    playerId: player.id, team: player.team, remaining: remainingFriends(game, index),
    score: friendsScore(game, index), won: player.team === winnerTeam,
  }));
  if (game.mode === 'colors') {
    ranks.sort((a, b) => a.remaining - b.remaining);
    game.ranking = ranks.map((entry) => {
      const rank = ranks.filter((other) => other.remaining < entry.remaining).length + 1;
      return { ...entry, rank, points: [4, 2, 1, 0][rank - 1] };
    });
    game.message = `${game.players[game.winner].name}率先清台 · 本局获胜`;
  } else {
    game.ranking = ranks.map((entry) => ({ ...entry, rank: entry.won ? 1 : 2, points: entry.won ? 3 : 0 }));
    game.message = `${winnerTeam === 0 ? '白方' : '黑方'} ${friendsScore(game, game.winner)} 分获胜 · 清台后比较总分`;
  }
  game.events.push({ type: 'settled' });
}

export function resolveFriendsShot(game) {
  if (game.phase === 'over') return;
  const active = game.turn;
  const team = game.players[active].team;
  const own = game.coins.filter((coin) => game.shotPots.includes(coin.id) && coin.owner === team);
  const wrong = game.mode === 'colors' ? game.coins.filter((coin) => game.shotPots.includes(coin.id) && coin.owner !== team) : [];
  const queen = game.coins.find((coin) => coin.kind === 'queen');
  const queenPotted = queen && game.shotPots.includes(queen.id);
  let keep = false;
  wrong.forEach((coin) => returnCoin(game, coin));
  if (game.shotFoul) {
    game.fouls++;
    game.foulsByPlayer[active]++;
    own.forEach((coin) => returnCoin(game, coin));
    const penalty = game.coins.find((coin) => coin.owner === team && coin.pocketed);
    if (penalty) returnCoin(game, penalty);
    else game.debt[team]++;
    if (queenPotted || game.queen === `pending-${team}`) {
      returnCoin(game, queen);
      game.queen = 'board';
      game.queenOwner = null;
    }
    game.message = '击球子落袋 · 罚一子，换手';
  } else {
    for (const coin of own) {
      if (game.debt[team] > 0) {
        returnCoin(game, coin);
        game.debt[team]--;
      }
    }
    const credited = own.filter((coin) => coin.pocketed).length;
    keep = credited > 0 && wrong.length === 0;
    game.message = wrong.length ? '误入他色 · 他色棋子返摆，换手' : credited ? '本色入袋 · 继续出杆' : '未进本色 · 换手';
    if (game.queen === `pending-${team}` || queenPotted) {
      if (credited > 0) {
        game.queen = 'covered';
        game.queenOwner = team;
        keep = true;
        game.message = `红后已补进 · 红后 +${QUEEN_POINTS} 分`;
      } else if (queenPotted && !game.queen.startsWith('pending')) {
        game.queen = `pending-${team}`;
        keep = true;
        game.message = '红后入袋 · 下一杆补进本色棋子';
      } else {
        returnCoin(game, queen);
        game.queen = 'board';
        game.queenOwner = null;
        keep = false;
        game.message = '未能补进 · 红后返场';
      }
    }
  }
  const order = [active, ...game.players.map((_, index) => index).filter((index) => index !== active)];
  const examined = new Set();
  for (const player of order) {
    const candidate = game.players[player].team;
    if (examined.has(candidate)) continue;
    examined.add(candidate);
    if (remainingFriends(game, player) !== 0) continue;
    if (game.queen === 'covered' || game.queen === 'none') {
      finish(game, player);
      return;
    }
    returnCoin(game, game.coins.find((coin) => coin.owner === candidate && coin.pocketed));
    game.message = '先完成红后补进 · 最后一子返场';
  }
  if (!keep) game.turn = (active + 1) % game.players.length;
  game.turnNumber++;
  prepareTurn(game);
  game.events.push({ type: 'settled' });
}

export function applyMultiplayerShot(state, input) {
  if (!input || state?.multiplayerVersion !== multiplayerVersion || state.phase !== 'ready' ||
      state.players[state.turn].id !== input.playerId) throw new Error('尚未轮到你出杆');
  const { position, dx, dy, power } = input;
  if (![position, dx, dy, power].every(Number.isFinite) || position < 235 || position > 765 ||
      Math.hypot(dx, dy) < 0.001 || power < 0.025 || power > 1)
    throw new Error('无效出杆参数');
  const game = copy(state);
  if (!placeFriendsStriker(game, position) || !shootFriends(game, dx, dy, power))
    throw new Error('当前无法出杆');
  const initialState = copy(game);
  let steps = 0;
  while (game.phase === 'moving' && steps < MAX_SHOT_STEPS) {
    stepFriends(game);
    steps++;
    if (game.events.length > 128) game.events = game.events.slice(-64);
  }
  game.events = [];
  return { state: game, initialState, steps, durationMs: steps * STEP * 1000 };
}

export function skipMultiplayerTurn(state) {
  if (state?.multiplayerVersion !== multiplayerVersion || state.phase !== 'ready')
    throw new Error('当前不能跳过回合');
  const game = copy(state);
  const team = game.players[game.turn].team;
  if (game.queen === `pending-${team}`) {
    returnCoin(game, game.coins.find((coin) => coin.kind === 'queen'));
    game.queen = 'board';
    game.queenOwner = null;
  }
  game.turn = (game.turn + 1) % game.players.length;
  game.turnNumber++;
  game.message = '出杆超时 · 换手';
  prepareTurn(game);
  game.events = [];
  return game;
}
