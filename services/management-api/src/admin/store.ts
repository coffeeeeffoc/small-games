import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';

export interface AdminFlow {
  verifier: string;
  callback: string;
  expiresAt: number;
}
export interface AdminSession {
  githubId: string;
  login: string;
  email: string;
  expiresAt: number;
}
export interface AdminStore {
  putFlow(hash: string, flow: AdminFlow): Promise<void>;
  takeFlow(hash: string, now: number): Promise<AdminFlow | undefined>;
  putSession(hash: string, session: AdminSession): Promise<void>;
  getSession(hash: string, now: number): Promise<AdminSession | undefined>;
  getLogoutSession(hash: string, now: number): Promise<AdminSession | undefined>;
  rotateSession(hash: string, replacement: string, now: number): Promise<AdminSession | undefined>;
  deleteSession(hash: string): Promise<void>;
}
type Database = ReturnType<typeof openDatabase>['db'];
/** Uses the management pool and only the two authentication tables. Rotation needs no UPDATE grant. */
export function createAdminStore(db: Database): AdminStore {
  const readSession = async (hash: string, now: number, forLogout: boolean) => {
    const rows = await db.execute(
      sql`select github_id as "githubId", login, email, expires_at as "expiresAt" from admin_console.admin_sessions where token_hash = ${hash} and (active or ${forLogout}) and expires_at > ${now}`,
    );
    return rows[0] as unknown as AdminSession | undefined;
  };
  return {
    async putFlow(hash, flow) {
      await db.execute(
        sql`delete from admin_console.admin_oauth_flows where expires_at <= ${Date.now()}`,
      );
      await db.execute(
        sql`insert into admin_console.admin_oauth_flows (state_hash, verifier, callback, expires_at) values (${hash}, ${flow.verifier}, ${flow.callback}, ${flow.expiresAt})`,
      );
    },
    async takeFlow(hash, now) {
      const rows = await db.execute(
        sql`delete from admin_console.admin_oauth_flows where state_hash = ${hash} and expires_at > ${now} returning verifier, callback, expires_at as "expiresAt"`,
      );
      return rows[0] as unknown as AdminFlow | undefined;
    },
    async putSession(hash, session) {
      await db.execute(
        sql`delete from admin_console.admin_sessions where expires_at <= ${Date.now()}`,
      );
      await db.execute(
        sql`insert into admin_console.admin_sessions (token_hash, family_hash, active, github_id, login, email, expires_at) values (${hash}, ${hash}, true, ${session.githubId}, ${session.login}, ${session.email}, ${session.expiresAt})`,
      );
    },
    getSession: (hash, now) => readSession(hash, now, false),
    getLogoutSession: (hash, now) => readSession(hash, now, true),
    async rotateSession(hash, replacement, now) {
      return db.transaction(async (tx) => {
        const found = await tx.execute(
          sql`select family_hash from admin_console.admin_sessions where token_hash = ${hash} and active and expires_at > ${now}`,
        );
        const family = found[0]?.family_hash;
        if (typeof family !== 'string') return;
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended('admin-session:' || ${family}, 0))`,
        );
        const rows = await tx.execute(
          sql`delete from admin_console.admin_sessions where token_hash = ${hash} and active and expires_at > ${now} returning github_id as "githubId", login, email, expires_at as "expiresAt"`,
        );
        const old = rows[0] as unknown as AdminSession | undefined;
        if (!old) return;
        // Retired tokens can only revoke this family until its original fixed expiry.
        await tx.execute(
          sql`insert into admin_console.admin_sessions (token_hash, family_hash, active, github_id, login, email, expires_at) values (${hash}, ${family}, false, ${old.githubId}, ${old.login}, ${old.email}, ${old.expiresAt}), (${replacement}, ${family}, true, ${old.githubId}, ${old.login}, ${old.email}, ${old.expiresAt})`,
        );
        return old;
      });
    },
    async deleteSession(hash) {
      await db.transaction(async (tx) => {
        const found = await tx.execute(
          sql`select family_hash from admin_console.admin_sessions where token_hash = ${hash}`,
        );
        const family = found[0]?.family_hash;
        if (typeof family !== 'string') return;
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended('admin-session:' || ${family}, 0))`,
        );
        await tx.execute(
          sql`delete from admin_console.admin_sessions where family_hash = ${family}`,
        );
      });
    },
  };
}
