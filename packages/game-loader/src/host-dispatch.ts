import { z } from 'zod';

import {
  HostError,
  jsonValueSchema,
  type GameHost,
  type HostCapability,
  type HostErrorCode,
  type JsonValue,
} from '@coffeeeeffoc/game-contract';

const readSchema = z.object({ key: z.string().min(1) }).strict();
const writeSchema = readSchema
  .extend({
    value: z.json(),
    expectedVersion: z.string().nullable().optional(),
  })
  .strict();
const rewardSchema = z
  .object({ id: z.string().min(1), reward: z.record(z.string(), z.json()) })
  .strict();
const trackSchema = z
  .object({
    name: z.string().min(1),
    properties: z.record(z.string(), z.json()).optional(),
  })
  .strict();
const navigateSchema = z.object({ destination: z.string().min(1) }).strict();
export const contentResultSchema = z
  .object({
    gameId: z.string().min(1),
    schemaVersion: z.number().int().positive(),
    revision: z.number().int().nonnegative(),
    payload: z.json(),
  })
  .strict();
export const storageResultSchema = z
  .object({ value: z.json(), version: z.string().min(1) })
  .strict();
export const rewardResultSchema = z
  .object({ status: z.enum(['completed', 'dismissed', 'unavailable', 'failed']) })
  .strict();

const methodCapabilities: Readonly<Record<string, HostCapability>> = {
  'content.load': 'content',
  'storage.read': 'storage',
  'storage.write': 'storage',
  'ads.offer': 'advertising',
  'telemetry.track': 'telemetry',
  'navigation.navigate': 'navigation',
};

/** Converts unknown adapter failures to the transport-safe Host error shape. */
export function serializeHostError(error: unknown): Readonly<{
  code: HostErrorCode;
  message: string;
  retryable?: boolean;
  details?: Readonly<Record<string, JsonValue>>;
}> {
  const serialized =
    error instanceof HostError
      ? error
      : error instanceof z.ZodError
        ? new HostError({ code: 'INVALID_INPUT', message: 'Game Host request payload is invalid' })
        : new HostError({
            code: 'UNAVAILABLE',
            message: 'Game Host request failed',
            retryable: true,
          });
  return {
    code: serialized.code,
    message: serialized.message,
    ...(serialized.retryable === undefined ? {} : { retryable: serialized.retryable }),
    ...(serialized.details === undefined ? {} : { details: serialized.details }),
  };
}

/** Validates and dispatches one allowlisted iframe request to a Game Host port. */
export async function dispatchHostRequest(
  host: GameHost,
  method: string,
  params: JsonValue,
): Promise<JsonValue> {
  const capability = methodCapabilities[method];
  if (!capability)
    throw new HostError({ code: 'INVALID_INPUT', message: 'Unknown Game Host method' });
  if (!host.session.capabilities.includes(capability))
    throw new HostError({
      code: 'CAPABILITY_MISSING',
      message: `Missing capability: ${capability}`,
    });
  switch (method) {
    case 'content.load':
      z.null().parse(params);
      return jsonValueSchema.parse(contentResultSchema.parse(await host.content.load()));
    case 'storage.read': {
      const input = readSchema.parse(params);
      const result = await host.storage.read(input.key);
      return result === null ? null : storageResultSchema.parse(result);
    }
    case 'storage.write': {
      const input = writeSchema.parse(params);
      return storageResultSchema.parse(
        await host.storage.write(input.key, input.value, input.expectedVersion),
      );
    }
    case 'ads.offer':
      return rewardResultSchema.parse(await host.ads.offer(rewardSchema.parse(params)));
    case 'telemetry.track': {
      const input = trackSchema.parse(params);
      await host.telemetry.track(input.name, input.properties);
      return null;
    }
    case 'navigation.navigate': {
      const input = navigateSchema.parse(params);
      await host.navigation.navigate(input.destination);
      return null;
    }
    default:
      throw new HostError({ code: 'INVALID_INPUT', message: 'Unknown Game Host method' });
  }
}
