import { createHash, randomInt, randomUUID } from 'node:crypto';
import { CompetitionError } from './types.js';
import type {
  Frame,
  RankedRule,
  RankedRun,
  RunRepository,
  RunView,
  Settlement,
} from './ranked-types.js';

const lifetime = 24 * 60 * 60 * 1000;
const view = (run: RankedRun): RunView => ({
  id: run.id,
  game: run.game,
  board: run.board,
  version: run.version,
  seed: run.seed,
  levelId: run.levelId,
  seq: run.seq,
  status: run.status,
  stepHz: 120,
  expiresAt: run.expiresAt,
});
// Canonical object key order makes retries independent of JSON property ordering.
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, canonical(item)]),
        )
      : value;

export function createRankedRuns(
  repository: RunRepository,
  rules: Map<string, RankedRule>,
  identity: (playerId: string) => Promise<{ authenticated: boolean }>,
  now = Date.now,
) {
  const ruleFor = (game: string) => {
    const rule = rules.get(game);
    if (!rule) throw new CompetitionError('GAME_UNAVAILABLE', 404);
    return rule;
  };
  const boardFor = (game: string, board: string) => {
    const rule = ruleFor(game);
    const definition = rule.boards.find((item) => item.id === board);
    if (!definition) throw new CompetitionError('BOARD_UNAVAILABLE', 404);
    return { rule, definition, key: `${game}:${board}:${rule.version}` };
  };
  function assertOwner(run: RankedRun, playerId: string, game: string) {
    if (run.playerId !== playerId) throw new CompetitionError('NOT_A_MEMBER', 403);
    if (run.game !== game) throw new CompetitionError('WRONG_GAME', 409);
  }
  function assertActive(run: RankedRun) {
    if (run.status !== 'active') throw new CompetitionError('RUN_FINISHED');
    if (run.expiresAt <= now()) throw new CompetitionError('RUN_EXPIRED');
    if (ruleFor(run.game).version !== run.version)
      throw new CompetitionError('RULE_VERSION_CHANGED');
  }
  return {
    rules,
    boardFor,
    async create(
      playerId: string,
      game: string,
      board: string,
      levelId?: string,
      version?: string,
    ) {
      const { rule, definition, key } = boardFor(game, board);
      if (!version || version !== rule.version) throw new CompetitionError('RULE_VERSION_CHANGED');
      if (!definition.guestAllowed && !(await identity(playerId)).authenticated)
        throw new CompetitionError('LOGIN_REQUIRED', 403);
      const seed = randomInt(0x7fffffff);
      let state: unknown;
      try {
        state = rule.create(board, seed, levelId);
      } catch {
        throw new CompetitionError('INVALID_LEVEL', 422);
      }
      const run: RankedRun = {
        kind: 'ranked-run-v1',
        id: randomUUID(),
        playerId,
        game,
        board,
        boardKey: key,
        levelId,
        seed,
        version: rule.version,
        seq: 0,
        ticks: 0,
        state,
        createdAt: now(),
        expiresAt: now() + lifetime,
        status: 'active',
      };
      await repository.create(run);
      return view(run);
    },
    get(playerId: string, game: string, id: string) {
      return repository.mutate(id, async ({ run, assertControl }) => {
        assertOwner(run, playerId, game);
        if (!run.settlement) assertControl?.();
        return { ...view(run), settlement: run.settlement ?? null };
      });
    },
    actions(playerId: string, game: string, id: string, input: { seq: number; frames: Frame[] }) {
      return repository.mutate(id, async (tx) => {
        const run = tx.run;
        assertOwner(run, playerId, game);
        const hash = createHash('sha256')
          .update(JSON.stringify(canonical(input)))
          .digest('hex');
        const existing = await tx.receipt(input.seq);
        if (existing) {
          if (existing.hash !== hash) throw new CompetitionError('SEQUENCE_CONFLICT');
          return existing.response;
        }
        tx.assertControl?.();
        assertActive(run);
        if (input.seq !== run.seq + 1) throw new CompetitionError('SEQUENCE_CONFLICT');
        const ticks = input.frames.reduce((sum, frame) => sum + frame.ticks, 0);
        if (
          !input.frames.length ||
          input.frames.length > 1200 ||
          ticks > 2400 ||
          input.frames.some((frame) => !Number.isSafeInteger(frame.ticks) || frame.ticks < 0)
        )
          throw new CompetitionError('INVALID_INPUT', 422);
        if (((run.ticks + ticks) * 1000) / 120 > now() - run.createdAt + 2000)
          throw new CompetitionError('RUN_AHEAD_OF_TIME', 422);
        try {
          run.state = ruleFor(game).apply(run.state, input.frames);
        } catch {
          throw new CompetitionError('ILLEGAL_ACTION', 422);
        }
        run.seq = input.seq;
        run.ticks += ticks;
        run.expiresAt = now() + lifetime;
        const response = view(run);
        await tx.saveReceipt(input.seq, { hash, response });
        return response;
      });
    },
    finish(playerId: string, game: string, id: string, seq: number) {
      return repository.mutate(id, async (tx) => {
        const run = tx.run;
        assertOwner(run, playerId, game);
        if (seq !== run.seq) throw new CompetitionError('SEQUENCE_CONFLICT');
        if (run.settlement) return run.settlement;
        tx.assertControl?.();
        assertActive(run);
        const result = ruleFor(game).result(run.state);
        if (
          !Number.isSafeInteger(result.score) ||
          result.score < 0 ||
          !Number.isSafeInteger(result.secondary) ||
          result.secondary < 0
        )
          throw new CompetitionError('INVALID_RESULT', 422);
        const accepted = result.eligible && result.complete && result.score > 0;
        const settlement: Settlement = {
          ...result,
          accepted,
          runId: id,
          reason: accepted ? null : 'INCOMPLETE_OR_PRACTICE',
        };
        if (accepted) await tx.record(settlement);
        run.status = 'finished';
        run.settlement = settlement;
        return settlement;
      });
    },
  };
}
