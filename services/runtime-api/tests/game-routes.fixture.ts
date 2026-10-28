import Fastify from 'fastify';
import { afterEach, vi } from 'vitest';
import { registerCompetition } from '../src/competition/routes.js';
import { CompetitionError } from '../src/competition/types.js';
import type { createCompetitionStore } from '../src/competition/store.js';
import { createRankedRuns } from '../src/competition/ranked-runs.js';
import type { RankedRule } from '../src/competition/ranked-types.js';
import { memoryRuns } from './ranked-fixture.js';

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
export const token = 'a'.repeat(64);
export async function setup(dual = false, conflict = false, scope = 'tower-brake') {
  const url = new URL('../rules/ranked-games.mjs', import.meta.url).href;
  const imported = (await import(url)) as { rankedRules: RankedRule[] };
  const rankedRules = imported.rankedRules.map((rule) => ({ ...rule, boards: [...rule.boards] }));
  if (conflict)
    rankedRules[1] = {
      ...rankedRules[1]!,
      boards: [...rankedRules[1]!.boards, { ...rankedRules[1]!.boards[0]!, id: 'versus' }],
    };
  const ranked = createRankedRuns(
    memoryRuns().repository,
    new Map(rankedRules.map((rule) => [rule.id, rule])),
    async () => ({ authenticated: true }),
  );
  const identity = vi.fn(async (value: string) => {
    if (value !== token) throw new CompetitionError('SESSION_EXPIRED', 401);
    return { playerId: 'member-player', game: scope };
  });
  const roomAction = vi.fn(async (_player, _code, _operation, input) => ({ game: input.game }));
  const ranking = vi.fn(async () => ({ top: [], me: null }));
  const board = vi.fn(async () => ({ top: [], me: null }));
  const store = {
    auth: identity,
    create: vi.fn(async () => ({ code: '123456' })),
    roomAction,
    ranking,
    board,
    identityDetails: async (id: string | null) => ({
      kind: id ? 'guest' : 'anonymous',
      authenticated: true,
      provider: null,
      playerId: id,
    }),
    gameDefinitions: () => [
      { id: 'duel', title: 'Duel', version: 'v1' },
      ...(dual ? [{ id: 'tower-brake', title: 'Tower', version: 'duel-v1' }] : []),
    ],
  } as unknown as ReturnType<typeof createCompetitionStore>;
  const app = Fastify();
  apps.push(app);
  await registerCompetition(app, store, {}, undefined, undefined, ranked);
  return { app, roomAction, ranking, board };
}
