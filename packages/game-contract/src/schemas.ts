import { z } from 'zod';

/** JSON value accepted across the iframe transport boundary. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Runtime validation that rejects functions, symbols, and other non-transportable values. */
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

/** Capabilities a Game may request from its Game Host. */
export const hostCapabilitySchema = z.enum([
  'content',
  'storage',
  'advertising',
  'telemetry',
  'navigation',
]);
export type HostCapability = z.infer<typeof hostCapabilitySchema>;

/** Published Release Channels supported by Game Contract v1. */
export const releaseChannelSchema = z.enum(['development', 'canary', 'stable']);
export type ReleaseChannel = z.infer<typeof releaseChannelSchema>;

/** Immutable advertising authority selected when a Game Session starts. */
export const adAuthoritySchema = z.enum(['host', 'managed', 'none']);
export type AdAuthority = z.infer<typeof adAuthoritySchema>;

/** Runtime schema for a deployable Game Artifact manifest. */
export const gameManifestSchema = z.object({
  gameId: z.string().min(1),
  version: z.string().min(1),
  gameContractVersion: z.literal(1),
  contentSchemaVersion: z.number().int().positive(),
  capabilities: z.array(hostCapabilitySchema).readonly(),
  loadModes: z
    .array(z.enum(['in-process', 'iframe', 'bilibili-subpackage']))
    .min(1)
    .readonly(),
  entry: z.string().min(1),
  integrity: z.string().min(1),
});
export type GameManifest = Readonly<z.infer<typeof gameManifestSchema>>;

/** Runtime schema for values fixed for the lifetime of one Game Session. */
export const gameSessionContextSchema = z.object({
  gameId: z.string().min(1),
  gameVersion: z.string().min(1),
  publishedVersionId: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  releaseChannel: releaseChannelSchema,
  adAuthority: adAuthoritySchema,
  sessionId: z.string().min(1),
  locale: z.string().min(1),
  capabilities: z.array(hostCapabilitySchema).readonly(),
});
export type GameSessionContext = Readonly<z.infer<typeof gameSessionContextSchema>>;

/** Stable error codes shared by every transport and adapter. */
export const hostErrorCodeSchema = z.enum([
  'CAPABILITY_MISSING',
  'TIMEOUT',
  'CANCELLED',
  'INVALID_INPUT',
  'OFFLINE',
  'UNAVAILABLE',
  'CONTENT_INCOMPATIBLE',
  'CONFLICT',
]);
export type HostErrorCode = z.infer<typeof hostErrorCodeSchema>;

/** Runtime schema for errors crossing a Game Host boundary. */
export const hostErrorSchema = z.object({
  code: hostErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean().optional(),
  details: z.record(z.string(), jsonValueSchema).optional(),
});
export type HostErrorInput = z.input<typeof hostErrorSchema>;

const messageIdentitySchema = z.object({
  protocolVersion: z.literal(1),
  gameId: z.string().min(1),
  sessionId: z.string().min(1),
});

/** Runtime schema for the first identity and manifest claim sent by an iframe Game. */
export const iframeHandshakeSchema = messageIdentitySchema.extend({
  kind: z.literal('handshake'),
  manifest: gameManifestSchema,
});

/** Runtime schema for an iframe Game request with JSON-safe parameters. */
export const hostRequestSchema = messageIdentitySchema.extend({
  kind: z.literal('request'),
  id: z.string().min(1),
  method: z.string().min(1),
  params: jsonValueSchema,
});

/** Runtime schema for an iframe Game Host response with exactly one outcome. */
export const hostResponseSchema = messageIdentitySchema
  .extend({
    kind: z.literal('response'),
    id: z.string().min(1),
    result: jsonValueSchema.optional(),
    error: hostErrorSchema.optional(),
  })
  .refine((message) => (message.result === undefined) !== (message.error === undefined), {
    message: 'Host response must contain exactly one of result or error',
  });

/** Runtime schema for an iframe Game Host event with a JSON-safe payload. */
export const hostEventSchema = messageIdentitySchema.extend({
  kind: z.literal('event'),
  name: z.string().min(1),
  payload: jsonValueSchema,
});

/** Runtime schema for every Game Contract v1 iframe message. */
export const hostMessageSchema = z.union([
  iframeHandshakeSchema,
  hostRequestSchema,
  hostResponseSchema,
  hostEventSchema,
]);
export type HostMessage = z.infer<typeof hostMessageSchema>;
