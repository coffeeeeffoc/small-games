import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

export const rankedBoard = 'carding-car-seaside-v1';
export const rankedSeed = 20260923;
export type KartResult = {
  matchId: string;
  board: string;
  entries: { playerId: string; elapsedMs: number }[];
  startedAt: number;
  finishedAt: number;
  killEpoch?: number;
};
export const kartControlLeaseSchema = z
  .object({
    controlEnabled: z.literal(true),
    gameId: z.literal('carding-car'),
    state: z.enum(['enabled', 'draining', 'disabled']),
    killEpoch: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    digest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    validForMs: z.number().int().min(1).max(2000),
  })
  .strict()
  .refine((value) => (value.version === 0) === (value.digest === null))
  .refine((value) => value.version !== 0 || (value.killEpoch === 0 && value.state === 'enabled'));
export type KartControlLease = z.infer<typeof kartControlLeaseSchema>;
class CompetitionRequestError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
export type Competition = {
  verify(token: string): Promise<{ playerId: string }>;
  settle(result: KartResult): Promise<void>;
  saved(matchId: string): boolean;
  cancelled?(matchId: string): boolean;
  control?(): Promise<KartControlLease>;
  applied?(lease: KartControlLease): Promise<void>;
};

/** Disk outbox keeps completed races when the shared service is unavailable. */
export async function createCompetition(options: {
  url: string;
  key: string;
  directory: string;
  log?: (message: string) => void;
  instanceId?: string;
}) {
  const instanceId = options.instanceId ?? randomUUID();
  if (!instanceId || instanceId.length > 128 || /[\p{Cc}]/u.test(instanceId))
    throw new Error('Invalid COMPETITION_CONTROL_INSTANCE_ID');
  const url = new URL(options.url);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('COMPETITION_API_URL must be an HTTP(S) base URL without credentials');
  if (options.key.length < 32)
    throw new Error('COMPETITION_INTERNAL_KEY must have at least 32 characters');
  const directory = path.resolve(options.directory);
  await mkdir(directory, { recursive: true });
  const completed = new Set<string>();
  const cancelled = new Set<string>();
  const request = async (endpoint: string, body: unknown) => {
    const response = await fetch(`${url.href.replace(/\/$/, '')}/internal/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-competition-internal-key': options.key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new CompetitionRequestError(
        typeof result?.error === 'string' ? result.error : `HTTP_${response.status}`,
      );
    return result;
  };
  let flushing: Promise<void> | undefined;
  const flush = () =>
    (flushing ??= (async () => {
      for (const filename of (await readdir(directory)).filter((name) =>
        /^[a-f0-9-]{36}\.json$/.test(name),
      )) {
        try {
          const result = JSON.parse(
            await readFile(path.join(directory, filename), 'utf8'),
          ) as KartResult;
          await request('kart-results', result);
          await unlink(path.join(directory, filename));
          completed.add(result.matchId);
          if (completed.size > 4096) completed.delete(completed.values().next().value!);
          options.log?.(`kart result persisted: ${result.matchId}`);
        } catch (error) {
          if (
            error instanceof CompetitionRequestError &&
            ['GAME_DISABLED', 'GAME_CANCELLED'].includes(error.code)
          ) {
            await unlink(path.join(directory, filename));
            cancelled.add(filename.slice(0, -5));
            if (cancelled.size > 4096) cancelled.delete(cancelled.values().next().value!);
            options.log?.(`kart result cancelled without ranking: ${filename}`);
            continue;
          }
          options.log?.(`kart result retained for retry: ${filename}: ${(error as Error).message}`);
        }
      }
    })()
      .catch((error) => {
        options.log?.(`kart outbox scan failed: ${(error as Error).message}`);
      })
      .finally(() => {
        flushing = undefined;
      }));
  const timer = setInterval(() => {
    void flush();
  }, 5000);
  timer.unref();
  await flush();
  const api: Competition = {
    async control() {
      return kartControlLeaseSchema.parse(await request('control', {}));
    },
    async applied(lease) {
      if (lease.version === 0 || !lease.digest) return;
      await request('control-observation', {
        instanceId,
        version: lease.version,
        digest: lease.digest,
      });
    },
    async verify(token) {
      const result = await request('verify', { token });
      if (!result || typeof result.playerId !== 'string' || !result.playerId)
        throw new Error('Invalid competition identity response');
      return { playerId: result.playerId };
    },
    async settle(result) {
      if (!/^[a-f0-9-]{36}$/.test(result.matchId)) throw new Error('Invalid match ID');
      const filename = path.join(directory, `${result.matchId}.json`);
      const temporary = `${filename}.tmp`;
      const file = await open(temporary, 'w', 0o600);
      try {
        await file.writeFile(JSON.stringify(result));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, filename);
      void flush();
    },
    saved: (matchId) => completed.has(matchId),
    cancelled: (matchId) => cancelled.has(matchId),
  };
  return {
    ...api,
    flush,
    async close() {
      clearInterval(timer);
      await flushing;
    },
  };
}
