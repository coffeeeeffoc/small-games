import { createMatch } from './core.mjs';

const defaultNames = ['玩家一', '玩家二', '玩家三', '玩家四'];
const reservedIds = new Set(['__proto__', 'constructor', 'prototype']);
const clone = (value) => JSON.parse(JSON.stringify(value));

function normalizePlayers(value) {
  const players = Number.isInteger(value)
    ? Array.from({ length: value >= 2 && value <= 4 ? value : 0 }, (_, index) => ({
        id: `player-${index + 1}`,
        name: defaultNames[index],
      }))
    : value;
  if (!Array.isArray(players) || players.length < 2 || players.length > 4)
    throw new TypeError('好友擂台需要 2–4 名玩家');
  const seen = new Set();
  return players.map((player, index) => {
    const id = player?.id;
    const name = player?.name ?? defaultNames[index];
    if (
      typeof id !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id) ||
      reservedIds.has(id) ||
      seen.has(id) ||
      typeof name !== 'string' ||
      !name.trim() ||
      [...name.trim()].length > 24
    )
      throw new TypeError('玩家 ID 必须唯一，名字需要 1–24 个字符');
    seen.add(id);
    return { id, name: name.trim() };
  });
}

function prepareRound(series, next) {
  const seats = [...next.seats];
  const rotation = next.rotation % seats.length;
  series.round = next.round;
  series.attempt = next.attempt;
  series.stage = next.stage;
  series.seats = seats;
  series.matchSerial++;
  series.current = {
    roundId: `${series.seed}:${series.matchSerial}`,
    round: next.round,
    attempt: next.attempt,
    stage: next.stage,
    seats: [...seats],
    rotation,
    order: seats.map((_, index) => (index + rotation) % seats.length),
    firstPlayerId: seats[rotation],
  };
  series.phase = 'ready';
  series.next = null;
}

/** A serializable rules model shared by same-device play and authoritative rooms. */
export function createTournament(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new TypeError('赛制选项无效');
  const players = normalizePlayers(options.players ?? 2);
  const seed = options.seed ?? Date.now() >>> 0;
  const turnSeconds = options.turnSeconds ?? 10;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new TypeError('种子必须是无符号 32 位整数');
  if (![10, 15].includes(turnSeconds)) throw new TypeError('每手计时为 10 或 15 秒');
  const series = {
    version: 1,
    seed,
    players,
    mode: players.length === 2 ? 'duel' : 'ffa',
    roundLimit: players.length === 2 ? 3 : players.length,
    turnSeconds,
    scores: Object.fromEntries(players.map(({ id }) => [id, 0])),
    wins: Object.fromEntries(players.map(({ id }) => [id, 0])),
    winnerId: null,
    matchSerial: 0,
    history: [],
    lastResult: null,
  };
  prepareRound(series, {
    round: 1,
    attempt: 1,
    stage: 'regular',
    seats: players.map(({ id }) => id),
    rotation: 0,
  });
  return series;
}

/** Each player visits every spawn and starts once in a complete 3/4-player series. */
export function createTournamentMatch(series) {
  if (series?.version !== 1 || series.phase !== 'ready') return null;
  const { seats, rotation, order, roundId } = series.current;
  const points = seats.map((_, index) => {
    const slot = (index - rotation + seats.length) % seats.length;
    const angle = Math.PI / 2 + (slot * Math.PI * 2) / seats.length;
    return [Math.cos(angle) * 96, Math.sin(angle) * 96];
  });
  const layout = {
    id: `friends-${seats.length}`,
    name: '好友擂台',
    hint: '轮流出手，最后留在擂台上',
    points,
    rules: { safeRounds: 3, shrinkPerRound: 18, minRadius: 18 },
  };
  const match = createMatch(layout, (series.seed + series.matchSerial - 1) >>> 0, {
    order: [...order],
    startActor: order[0],
  });
  match.tournamentRoundId = roundId;
  match.seats = [...seats];
  series.phase = 'playing';
  return match;
}

function roundRanking(series, match) {
  const seats = series.current.seats;
  if (
    match.phase !== 'over' ||
    !Array.isArray(match.discs) ||
    match.discs.length !== seats.length ||
    !Array.isArray(match.seats) ||
    match.seats.some((id, index) => id !== seats[index]) ||
    match.seats.length !== seats.length ||
    !Array.isArray(match.eliminationBatches)
  )
    return null;
  const ranks = new Map();
  const keys = new Set();
  for (const [index, batch] of match.eliminationBatches.entries()) {
    if (
      !batch ||
      typeof batch.key !== 'string' ||
      keys.has(batch.key) ||
      !Array.isArray(batch.ids) ||
      !batch.ids.length
    )
      return null;
    keys.add(batch.key);
    for (const id of batch.ids) {
      if (!Number.isInteger(id) || id < 0 || id >= seats.length || ranks.has(id)) return null;
      ranks.set(id, index);
    }
  }
  const alive = [];
  for (const [index, disc] of match.discs.entries()) {
    if (disc?.id !== index || typeof disc.alive !== 'boolean') return null;
    if (disc.alive) {
      if (ranks.has(index)) return null;
      alive.push(index);
    } else if (!ranks.has(index)) return null;
  }
  if (alive.length > 1 || match.winner !== (alive[0] ?? -1)) return null;
  if (alive.length) ranks.set(alive[0], match.eliminationBatches.length);
  return seats.map((id, discId) => {
    const rank = ranks.get(discId);
    const outlasted = [...ranks.values()].filter((other) => other < rank).length;
    const place = 1 + [...ranks.values()].filter((other) => other > rank).length;
    return {
      id,
      discId,
      place,
      points: outlasted + (discId === match.winner ? 1 : 0),
      survived: discId === match.winner,
    };
  });
}

/** Settle once, only after the complete shot/contraction finishes, retaining tied batches. */
export function recordTournamentRound(series, match) {
  if (series?.version !== 1 || !match || typeof match.tournamentRoundId !== 'string') return null;
  const previous = series.history.find((result) => result.roundId === match.tournamentRoundId);
  if (previous) return clone(previous);
  if (series.phase !== 'playing' || match.tournamentRoundId !== series.current.roundId) return null;
  const ranking = roundRanking(series, match);
  if (!ranking) return null;
  const winnerId = match.winner < 0 ? null : series.seats[match.winner];
  const draw = winnerId === null;
  const needsReplay = draw && (series.mode === 'duel' || series.stage === 'tiebreak');
  const points = Object.fromEntries(series.players.map(({ id }) => [id, 0]));
  if (series.stage === 'regular') {
    for (const row of ranking) {
      points[row.id] = series.mode === 'duel' ? Number(row.survived) : row.points;
      series.scores[row.id] += points[row.id];
    }
    if (winnerId) series.wins[winnerId]++;
  }
  let champion = null;
  let leaders = [];
  let next = {
    round: series.round + 1,
    attempt: 1,
    stage: series.stage,
    seats: [...series.seats],
    rotation: series.current.rotation + 1,
  };
  if (needsReplay) {
    next = {
      ...next,
      round: series.round,
      attempt: series.attempt + 1,
      rotation: series.current.rotation,
    };
  } else if (series.stage === 'tiebreak') {
    champion = winnerId;
  } else if (series.mode === 'duel') {
    if (winnerId && series.wins[winnerId] >= 2) champion = winnerId;
  } else if (series.round === series.roundLimit) {
    const best = Math.max(...Object.values(series.scores));
    leaders = series.players.filter(({ id }) => series.scores[id] === best).map(({ id }) => id);
    if (leaders.length === 1) champion = leaders[0];
    else next = { ...next, stage: 'tiebreak', seats: leaders, rotation: 0 };
  }
  series.winnerId = champion;
  series.phase = champion ? 'finished' : 'round-result';
  series.next = champion ? null : next;
  const result = {
    roundId: series.current.roundId,
    round: series.round,
    attempt: series.attempt,
    stage: series.stage,
    winnerId,
    draw,
    needsReplay,
    points,
    ranking,
    scores: { ...series.scores },
    wins: { ...series.wins },
    leaders,
    championId: champion,
    finished: Boolean(champion),
  };
  series.lastResult = result;
  series.history.push(result);
  return clone(result);
}

/** A result screen/room-ready action must explicitly open the next round. */
export function nextTournamentRound(series) {
  if (series?.version !== 1 || series.phase !== 'round-result' || !series.next) return false;
  prepareRound(series, series.next);
  return true;
}

export function tournamentPlayerForDisc(series, discId) {
  if (!Number.isInteger(discId) || discId < 0) return null;
  const id = series?.current?.seats[discId];
  return series?.players?.find((player) => player.id === id) ?? null;
}

export function tournamentStandings(series) {
  if (series?.version !== 1) return [];
  const rows = series.players.map((player) => ({
    ...player,
    score: series.scores[player.id],
    wins: series.wins[player.id],
    isWinner: series.winnerId === player.id,
  }));
  rows.sort((a, b) => Number(b.isWinner) - Number(a.isWinner) || b.score - a.score);
  return rows.map((row) => ({
    ...row,
    rank:
      1 +
      rows.filter(
        (other) =>
          Number(other.isWinner) > Number(row.isWinner) ||
          (other.isWinner === row.isWinner && other.score > row.score),
      ).length,
  }));
}

export const settleTournamentRound = recordTournamentRound;
export const advanceTournament = nextTournamentRound;
