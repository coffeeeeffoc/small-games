import {
  nightPlayerQuerySchema,
  nightPlayerDetailQuerySchema,
  nightPlayerListSchema,
  nightPlayerDetailSchema,
  hasPrivatePlayerField,
  NIGHT_PLAYER_RESPONSE_BYTES,
  type NightPlayerResponse,
} from '@coffeeeeffoc/service-kit';
import type { AdminSession } from './store.js';
import { ControlError } from './control-model.js';
import { validateRuntimeOrigin } from './night-runtime.js';

export function validateNightPlayerConfig(env: Record<string, string | undefined>) {
  validateRuntimeOrigin(env.ADMIN_RUNTIME_ORIGIN);
  if (
    env.ADMIN_RUNTIME_KEY !== undefined &&
    (env.ADMIN_RUNTIME_KEY.length < 32 || /[\r\n]/.test(env.ADMIN_RUNTIME_KEY))
  )
    throw new Error('Invalid management configuration: ADMIN_RUNTIME_KEY');
}

export async function readNightPlayers(
  origin: string | undefined,
  key: string | undefined,
  operation: 'list' | 'detail',
  input: unknown,
  request = fetch,
): Promise<NightPlayerResponse> {
  if (!origin || !key) throw new ControlError('NIGHT_PLAYERS_NOT_CONFIGURED', 503);
  try {
    const response = await request(
      `${origin}/api/competition/v1/internal/night-players/${operation}`,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: { 'content-type': 'application/json', 'x-competition-internal-key': key },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 404) throw new ControlError('NOT_FOUND', 404);
      if (response.status === 422) throw new ControlError('INVALID_INPUT', 422);
      if (response.status === 413) throw new ControlError('NIGHT_PLAYER_DATA_TOO_LARGE', 413);
      throw new ControlError('NIGHT_PLAYERS_UNAVAILABLE', 503);
    }
    const reader = response.body?.getReader();
    if (!reader) throw Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > NIGHT_PLAYER_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ControlError('NIGHT_PLAYER_DATA_TOO_LARGE', 413);
      }
      chunks.push(value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (hasPrivatePlayerField(value)) throw Error();
    return operation === 'list'
      ? nightPlayerListSchema.parse(value)
      : nightPlayerDetailSchema.parse(value);
  } catch (error) {
    if (error instanceof ControlError) throw error;
    throw new ControlError('NIGHT_PLAYERS_UNAVAILABLE', 503);
  }
}

type AuditRead = (
  session: AdminSession,
  action: string,
  target: string,
  detail: Record<string, unknown>,
) => Promise<unknown>;
export function nightPlayerControl(
  origin: string | undefined,
  key: string | undefined,
  audit: AuditRead,
) {
  async function read(session: AdminSession, operation: 'list' | 'detail', raw: unknown) {
    const input =
      operation === 'list'
        ? nightPlayerQuerySchema.parse(raw)
        : nightPlayerDetailQuerySchema.parse(raw);
    const target = 'id' in input ? input.id : 'night-overwatch';
    // Commit the permission-checked access audit before any remote read, including failed reads.
    await audit(session, `night.players.${operation}.requested`, target, { ...input });
    const result = await readNightPlayers(origin, key, operation, input);
    // Recheck current permissions after the network wait; never hold a DB transaction across it.
    await audit(session, `night.players.${operation}.read`, target, {
      page: result.page,
      total: result.total,
    });
    return result;
  }
  return {
    nightPlayers: (session: AdminSession, input: unknown) => read(session, 'list', input),
    nightPlayer: (session: AdminSession, input: unknown) => read(session, 'detail', input),
  };
}
