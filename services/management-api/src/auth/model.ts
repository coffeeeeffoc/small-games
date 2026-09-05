import { z } from 'zod';

/** Roles are independent grants, not an implicit admin hierarchy. */
export const roles = ['creator', 'reviewer', 'publisher', 'admin'] as const;
export const roleSchema = z.enum(roles);
/** A permission grant recognized by Management Service. */
export type Role = z.infer<typeof roleSchema>;
export const operatorSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  roles: z.array(roleSchema),
});
/** Safe identity returned to Studio; excludes all password and token material. */
export type Operator = z.infer<typeof operatorSchema>;
export const accountSchema = operatorSchema.extend({ passwordHash: z.string() });
/** A server-only account record. */
export type Account = z.infer<typeof accountSchema>;
/** Persistent opaque-token hashes with a short access and absolute refresh lifetime. */
export interface AuthSession {
  accessHash: string;
  refreshHash: string;
  accountId: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
}
/** Persistence seam used by SQL and isolated tests; rotation must be atomic. */
export interface AuthStore {
  initializeAccount(account: Account): Promise<boolean>;
  findAccount(username: string): Promise<Account | undefined>;
  saveSession(session: AuthSession): Promise<void>;
  authenticate(accessHash: string, now: number): Promise<Operator | undefined>;
  refresh(
    refreshHash: string,
    replacement: Pick<AuthSession, 'accessHash' | 'refreshHash' | 'accessExpiresAt'>,
    now: number,
  ): Promise<Operator | undefined>;
  revoke(accessHash: string, refreshHash: string): Promise<void>;
}

/** Server-side role decision; UI visibility never substitutes for this check. */
export function hasRole(operator: Operator, role: Role) {
  return operator.roles.includes(role);
}
