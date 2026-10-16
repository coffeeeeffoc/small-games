import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicCompetitionPath } from './competition-gateway.mjs';

test('game gateway exposes registered public route shapes without exposing internal services', () => {
  const base = '/api/competition/v1/';
  for (const route of [
    'sessions/guest',
    'sessions/platform',
    'sessions/refresh',
    'sessions/upgrade',
    'me',
    'boards/cops-robbers',
    'runs/cops-robbers-realtime',
    'rooms',
    'rooms/join',
    'rooms/ABCDEF123456/actions',
    'games/tower-brake',
    'games/cage-rescue/leaderboards/endless',
    'games/cage-rescue/runs',
    'games/tower-brake/runs/12345678-1234-1234-1234-123456789abc/actions',
    'games/tower-brake/runs/12345678-1234-1234-1234-123456789abc/finish',
    'games/cops-robbers/rooms/join',
    'games/cops-robbers/rooms/ABCDEF123456/ready',
  ])
    assert(isPublicCompetitionPath(base + route), route);
  for (const route of [
    'internal/verify',
    'sessions/upgrade/internal',
    'sessions/refresh/anything',
    'runs/cops-robbers-realtime/internal',
    'runs/unknown-game',
    'internal',
    'games/tower-brake/internal/verify',
    'games/../internal/verify',
    'games/%2f/rooms',
    'games/tower-brake/runs/invalid/actions',
    'games/tower-brake/rooms/ABCDEF123456/admin',
    '../management',
  ])
    assert(!isPublicCompetitionPath(base + route), route);
});
