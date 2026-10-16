import { createHash } from 'node:crypto';
import { z } from 'zod';

/** IDs backed by Runtime rules/ranked engines and the independent Kart service. */
export const CONTROL_GAMES = [
  'cops-robbers',
  'cops-robbers-realtime',
  'letters-words2',
  'vibeJam-myself-history-guess',
  'xiangqi-five',
  'flick-arena',
  'carrom-club',
  'cage-rescue',
  'tower-brake',
  'three-choose-two',
  'carding-car',
] as const;
export const CONTROL_PERMISSIONS = [
  'control.read',
  'control.write',
  'control.publish',
  'members.read',
  'members.write',
  'roles.read',
  'roles.write',
  'audit.read',
] as const;
export type Permission = (typeof CONTROL_PERMISSIONS)[number];
export const ADMINISTRATOR = 'administrator';
export const CONSUMERS = ['runtime', 'kart'] as const;
export const permissionSchema = z.enum(CONTROL_PERMISSIONS);
export const roleIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
export const emailSchema = z
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());
export const reasonSchema = z.string().trim().min(1).max(500);
export const versionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const publicOriginSchema = z
  .string()
  .max(255)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        !value.includes('*') &&
        ['https:', 'http:'].includes(url.protocol) &&
        url.origin === value &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, 'A canonical HTTP(S) origin is required');
const gameShape = Object.fromEntries(
  CONTROL_GAMES.map((id) => [id, z.enum(['enabled', 'draining', 'disabled'])]),
) as Record<
  (typeof CONTROL_GAMES)[number],
  z.ZodEnum<{ enabled: 'enabled'; draining: 'draining'; disabled: 'disabled' }>
>;
export const snapshotSchema = z
  .object({
    apiOrigins: z
      .array(publicOriginSchema)
      .max(32)
      .refine((items) => new Set(items).size === items.length),
    games: z.object(gameShape).strict(),
  })
  .strict();
export type Snapshot = z.infer<typeof snapshotSchema>;
export function parseSnapshot(input: unknown, adminOrigin?: string): Snapshot {
  const parsed = snapshotSchema.parse(input);
  if (adminOrigin && parsed.apiOrigins.includes(adminOrigin))
    throw new ControlError('INVALID_INPUT', 422);
  return {
    apiOrigins: [...parsed.apiOrigins].sort(),
    games: Object.fromEntries(
      CONTROL_GAMES.map((id) => [id, parsed.games[id]]),
    ) as Snapshot['games'],
  };
}
export function snapshotDigest(snapshot: Snapshot): string {
  return createHash('sha256')
    .update(JSON.stringify(parseSnapshot(snapshot)))
    .digest('hex');
}
export interface ControlRole {
  id: string;
  name: string;
  permissions: Permission[];
  builtin: boolean;
}
export interface ControlMember {
  id: string;
  email: string;
  githubId: string | null;
  active: boolean;
  roleIds: string[];
}
export interface Principal {
  memberId: string;
  roles: string[];
  permissions: Permission[];
}
export interface Revision {
  id: string;
  parentVersion: number;
  snapshot: Snapshot;
  reason: string;
  actor: string;
  rollbackOf: string | null;
  digest: string;
  createdAt: number;
}
export interface Head {
  version: number;
  revisionId: string | null;
}
/** Publication membership is projected for lists; immutable revision contents remain unchanged. */
export interface ListedRevision extends Revision {
  publishedVersion: number | null;
}
export interface GamePolicy {
  gameId: (typeof CONTROL_GAMES)[number];
  state: 'enabled' | 'draining' | 'disabled';
  killEpoch: number;
  revision: number;
}
export interface Observation {
  consumer: (typeof CONSUMERS)[number];
  instanceId: string;
  version: number;
  digest: string;
  status: 'applied' | 'failed';
  observedAt: number;
}
export interface Audit {
  id: string;
  actor: string;
  action: string;
  target: string;
  detail: Record<string, unknown>;
  createdAt: number;
}
export class ControlError extends Error {
  constructor(
    readonly code: string,
    readonly status = 409,
  ) {
    super(code);
  }
}

/** Every mutation and membership bootstrap uses the same transaction lock. */
export interface ControlTransaction {
  members(): Promise<ControlMember[]>;
  roles(): Promise<ControlRole[]>;
  putMember(member: ControlMember): Promise<void>;
  deleteMember(id: string): Promise<void>;
  putRole(role: ControlRole): Promise<void>;
  deleteRole(id: string): Promise<void>;
  initialized(): Promise<boolean>;
  markInitialized(): Promise<void>;
  head(): Promise<Head>;
  setHead(
    expectedVersion: number,
    revisionId: string,
    actor: string,
    at: number,
    snapshot: Snapshot,
  ): Promise<boolean>;
  policies(): Promise<GamePolicy[]>;
  published(id: string): Promise<boolean>;
  revisions(): Promise<ListedRevision[]>;
  revision(id: string): Promise<Revision | undefined>;
  insertRevision(revision: Revision): Promise<void>;
  observations(): Promise<Observation[]>;
  audits(): Promise<Audit[]>;
  audit(entry: Audit): Promise<void>;
}
export interface ControlStore {
  transaction<T>(work: (tx: ControlTransaction) => Promise<T>): Promise<T>;
}
