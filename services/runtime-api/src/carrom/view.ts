import type { Room } from './types.js';

export function publicCarromRoom(room: Room, playerId: string, now: number) {
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
      connected: now - lastSeen < 15000,
    })),
    seq: room.players.find((p) => p.id === playerId)?.seq ?? 0,
    lastShot: room.lastShot,
    turnDeadline: room.turnDeadline,
    deadline: room.deadline,
    series: room.series,
    reason: room.reason,
    serverNow: now,
    pollMs: 900,
  };
}
