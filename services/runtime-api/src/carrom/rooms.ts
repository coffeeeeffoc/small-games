import { createHash, randomBytes, randomInt } from 'node:crypto';
import { CompetitionError } from '../competition/types.js';
import type { Engine, Input, Level, Repository, Room, Settings } from './types.js';

const offlineMs = 15_000;
const hostGraceMs = 45_000;
const turnMs = 45_000;
const roomMs = 2 * 60 * 60_000;
function reject(code: string, status = 409): never {
  throw new CompetitionError(code, status);
}

export function createCarromRooms(
  repository: Repository,
  engine: Engine,
  levels: Level[],
  now = Date.now,
) {
  function settings(input: Partial<Settings> = {}): Settings {
    const mode = input.mode ?? 'colors';
    const board = input.board ?? 'ordinary';
    if (
      !['singles', 'doubles', 'colors'].includes(mode) ||
      !['ordinary', 'level', 'random'].includes(board)
    )
      reject('INVALID_MODE', 422);
    if (mode !== 'colors' && board !== 'ordinary') reject('CLASSIC_BOARD_ONLY', 422);
    const maxPlayers = mode === 'singles' ? 2 : mode === 'doubles' ? 4 : (input.maxPlayers ?? 4);
    if (![2, 3, 4].includes(maxPlayers)) reject('INVALID_INPUT', 422);
    let levelId = board === 'ordinary' ? null : (input.levelId ?? null);
    if (board === 'random') levelId = levels[randomInt(levels.length)]!.id;
    if (
      board !== 'ordinary' &&
      !levels.some((level) => level.id === levelId && level.playerCounts.includes(maxPlayers))
    )
      reject('INVALID_LEVEL', 422);
    return { mode, board, levelId, maxPlayers };
  }
  function resetSeries(room: Room) {
    room.series = room.players.map((p) => ({ playerId: p.id, points: 0, wins: 0 }));
    // A room keeps a monotonic match number even when its series or roster changes.
    // Delayed unaccepted shots from an earlier match must never become valid again.
    room.settledRound = 0;
    room.reason = 'series-reset';
  }
  function view(room: Room, playerId: string) {
    return {
      code: room.code,
      game: room.game,
      version: room.version,
      hostId: room.hostId,
      status: room.status,
      settings: room.settings,
      resolvedLevelId: room.settings.levelId,
      revision: room.revision,
      round: room.round,
      state: room.state,
      you: room.players.findIndex((p) => p.id === playerId),
      players: room.players.map(({ id, name, ready, lastSeen }) => ({
        id,
        name,
        ready,
        connected: now() - lastSeen < offlineMs,
      })),
      seq: room.players.find((p) => p.id === playerId)?.seq ?? 0,
      lastShot: room.lastShot,
      turnDeadline: room.turnDeadline,
      deadline: room.deadline,
      series: room.series,
      reason: room.reason,
      serverNow: now(),
      pollMs: 900,
    };
  }
  function settle(room: Room) {
    if (room.state?.phase !== 'over' || room.settledRound === room.round) return;
    room.status = 'finished';
    room.settledRound = room.round;
    for (const result of room.state.ranking ?? []) {
      const total = room.series.find((p) => p.playerId === result.playerId);
      if (!total) continue;
      total.points += result.points;
      if (result.rank === 1) total.wins++;
    }
  }
  function advance(room: Room) {
    if (now() >= room.deadline && !['expired', 'abandoned'].includes(room.status)) {
      room.status = 'expired';
      room.reason = 'room-expired';
      room.revision++;
    }
    const host = room.players.find((p) => p.id === room.hostId);
    if (host && now() - host.lastSeen >= hostGraceMs) {
      const replacement = room.players.find((p) => now() - p.lastSeen < offlineMs);
      if (replacement && replacement.id !== room.hostId) {
        room.hostId = replacement.id;
        room.reason = 'host-transferred';
        room.revision++;
      }
    }
    if (room.status === 'playing' && room.state && now() >= room.turnDeadline) {
      room.state = engine.skipMultiplayerTurn(room.state);
      room.turnDeadline = now() + turnMs;
      room.lastShot = null;
      room.reason = 'turn-timeout';
      room.revision++;
      settle(room);
    }
  }
  async function create(playerId: string, options: Partial<Settings> = {}) {
    const room: Room = {
      code: randomBytes(6).toString('hex').toUpperCase(),
      game: 'carrom-club',
      version: engine.multiplayerVersion,
      hostId: playerId,
      status: 'waiting',
      players: [
        {
          id: playerId,
          name: await repository.name(playerId),
          ready: false,
          seq: 0,
          lastSeen: now(),
        },
      ],
      settings: settings(options),
      revision: 1,
      readyRevision: 1,
      round: 0,
      deadline: now() + roomMs,
      turnDeadline: 0,
      state: null,
      lastShot: null,
      series: [],
      settledRound: 0,
    };
    resetSeries(room);
    await repository.create(room);
    return view(room, playerId);
  }
  async function action(playerId: string, code: string, operation: string, input: Input = {}) {
    const name = operation === 'join' ? await repository.name(playerId) : undefined;
    return repository.mutate(
      code,
      (room) => {
        if (room.game !== 'carrom-club') reject('WRONG_GAME');
        if (room.version !== engine.multiplayerVersion) reject('RULE_VERSION_CHANGED');
        let member = room.players.find((p) => p.id === playerId);
        if (!member && operation === 'leave') return { left: true };
        if (!member && operation !== 'join') reject('NOT_A_MEMBER', 403);
        if (operation === 'get' && room.status === 'finished') return view(room, playerId);
        if (
          operation === 'shoot' &&
          member &&
          input.seq === member.seq &&
          member.lastHash ===
            createHash('sha256')
              .update(
                JSON.stringify({
                  round: input.round,
                  expectedTurnNumber: input.expectedTurnNumber,
                  shot: input.shot,
                }),
              )
              .digest('hex')
        )
          return view(room, playerId);
        // A returning host receives their heartbeat only after stale ownership is resolved.
        // Leaving is always available and cannot run timeouts, settlement or host progression first.
        if (operation !== 'leave') advance(room);
        if (!member && operation === 'join') {
          if (room.status !== 'waiting') reject('MATCH_STARTED');
          if (room.players.length >= room.settings.maxPlayers) reject('ROOM_FULL');
          member = { id: playerId, name: name!, ready: false, seq: 0, lastSeen: now() };
          room.players.push(member);
          room.players.forEach((p) => {
            p.ready = false;
          });
          room.revision++;
          resetSeries(room);
          room.readyRevision = room.revision;
        }
        if (!member) reject('NOT_A_MEMBER', 403);
        member.lastSeen = now();
        if (operation === 'get' || operation === 'join') return view(room, playerId);
        if (operation === 'leave') {
          if (room.status === 'playing') {
            room.status = 'abandoned';
            room.reason = 'player-left';
          }
          room.players = room.players.filter((p) => p.id !== playerId);
          if (room.hostId === playerId) room.hostId = room.players[0]?.id ?? '';
          room.players.forEach((p) => {
            p.ready = false;
          });
          if (room.status === 'waiting') resetSeries(room);
          if (!room.players.length) room.status = 'abandoned';
          room.revision++;
          room.readyRevision = room.revision;
          return { left: true };
        }
        if (['settings', 'start', 'rematch'].includes(operation) && room.hostId !== playerId)
          reject('HOST_ONLY');
        if (
          ['settings', 'start', 'rematch'].includes(operation) &&
          input.revision !== room.revision
        )
          reject('ROOM_CHANGED');
        if (operation === 'settings') {
          if (room.status !== 'waiting') reject('MATCH_STARTED');
          const next = settings(input.settings);
          if (room.players.length > next.maxPlayers) reject('TOO_MANY_PLAYERS');
          if (next.mode !== room.settings.mode) resetSeries(room);
          room.settings = next;
          room.players.forEach((p) => {
            p.ready = false;
          });
        } else if (operation === 'ready') {
          // Other players can ready concurrently against the same settings/roster.
          if (
            !Number.isInteger(input.revision) ||
            input.revision! < (room.readyRevision ?? room.revision) ||
            input.revision! > room.revision
          )
            reject('ROOM_CHANGED');
          if (room.status !== 'waiting') reject('MATCH_STARTED');
          member.ready = input.ready === true;
        } else if (operation === 'start') {
          if (room.status !== 'waiting') reject('MATCH_STARTED');
          const count = room.players.length;
          if (
            count < 2 ||
            (room.settings.mode === 'doubles' && count !== 4) ||
            (room.settings.mode === 'singles' && count !== 2)
          )
            reject('PLAYER_COUNT');
          if (room.players.some((p) => !p.ready || now() - p.lastSeen >= offlineMs))
            reject('NOT_READY');
          if (
            room.settings.levelId &&
            !levels.find((l) => l.id === room.settings.levelId)?.playerCounts.includes(count)
          )
            reject('INVALID_LEVEL');
          room.round++;
          room.state = engine.createMultiplayerMatch({
            ...room.settings,
            players: room.players.map(({ id, name }) => ({ id, name })),
            round: room.round,
            seed: randomInt(0x7fffffff),
            firstPlayer: (room.round - 1) % count,
          });
          room.status = 'playing';
          room.lastShot = null;
          room.reason = undefined;
          room.turnDeadline = now() + turnMs;
          room.deadline = now() + roomMs;
        } else if (operation === 'shoot') {
          const hash = createHash('sha256')
            .update(
              JSON.stringify({
                round: input.round,
                expectedTurnNumber: input.expectedTurnNumber,
                shot: input.shot,
              }),
            )
            .digest('hex');
          if (input.seq === member.seq && hash === member.lastHash) return view(room, playerId);
          if (input.seq !== member.seq + 1) reject('SEQUENCE_CONFLICT');
          if (room.status !== 'playing' || !room.state) reject('MATCH_CLOSED');
          if (input.round !== room.round || input.expectedTurnNumber !== room.state.turnNumber)
            reject('ROOM_CHANGED');
          if (room.state.players[room.state.turn]?.id !== playerId) reject('NOT_YOUR_TURN');
          if (room.lastShot && now() < room.lastShot.startedAt + room.lastShot.durationMs)
            reject('SHOT_MOVING');
          if (!input.shot) reject('INVALID_INPUT', 422);
          try {
            const result = engine.applyMultiplayerShot(room.state, { ...input.shot, playerId });
            room.state = result.state;
            room.lastShot = {
              id: room.revision + 1,
              playerId,
              input: input.shot,
              initialState: result.initialState,
              steps: result.steps,
              durationMs: result.durationMs,
              startedAt: now(),
            };
            room.turnDeadline = now() + result.durationMs + turnMs;
          } catch {
            reject('ILLEGAL_ACTION');
          }
          member.seq = input.seq!;
          member.lastHash = hash;
          room.reason = undefined;
          settle(room);
        } else if (operation === 'rematch') {
          if (!['finished', 'abandoned'].includes(room.status)) reject('MATCH_NOT_FINISHED');
          room.status = 'waiting';
          room.state = null;
          room.lastShot = null;
          room.players.forEach((p) => {
            p.ready = false;
          });
          if (room.series.length !== room.players.length) resetSeries(room);
          if (room.settings.board === 'random') room.settings = settings(room.settings);
          room.deadline = now() + roomMs;
        } else reject('INVALID_INPUT', 422);
        room.revision++;
        if (['settings', 'rematch'].includes(operation)) room.readyRevision = room.revision;
        return view(room, playerId);
      },
      operation,
      input,
      playerId,
    );
  }
  return { create, action };
}
