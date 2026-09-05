import { sql } from 'drizzle-orm';
import { type openDatabase } from '@coffeeeeffoc/service-kit';
import { accountSchema, operatorSchema, type AuthStore } from './model.js';

type Database = ReturnType<typeof openDatabase>['db'];
/** Management-owned SQL persistence. Application credentials cannot cross schemas. */
export function createAuthStore(db: Database): AuthStore {
  return {
    async initializeAccount(account) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(71212001)`);
        const existing = await tx.execute(sql`select id from management.accounts limit 1`);
        if (existing.length) return false;
        await tx.execute(
          sql`insert into management.accounts (id, username, password_hash, roles) values (${account.id}, ${account.username}, ${account.passwordHash}, ${JSON.stringify(account.roles)}::jsonb)`,
        );
        return true;
      });
    },
    async findAccount(username) {
      const rows = await db.execute(
        sql`select id, username, password_hash as "passwordHash", roles from management.accounts where username = ${username}`,
      );
      return rows[0] ? accountSchema.parse(rows[0]) : undefined;
    },
    async saveSession(session) {
      await db.execute(
        sql`insert into management.auth_sessions (access_hash, refresh_hash, account_id, access_expires_at, refresh_expires_at) values (${session.accessHash}, ${session.refreshHash}, ${session.accountId}, ${session.accessExpiresAt}, ${session.refreshExpiresAt})`,
      );
    },
    async authenticate(accessHash, now) {
      const rows = await db.execute(
        sql`select a.id, a.username, a.roles from management.auth_sessions s join management.accounts a on a.id = s.account_id where s.access_hash = ${accessHash} and s.access_expires_at > ${now} and s.refresh_expires_at > ${now}`,
      );
      return rows[0] ? operatorSchema.parse(rows[0]) : undefined;
    },
    async refresh(refreshHash, replacement, now) {
      const rows = await db.execute(
        sql`with rotated as (update management.auth_sessions set access_hash = ${replacement.accessHash}, refresh_hash = ${replacement.refreshHash}, access_expires_at = ${replacement.accessExpiresAt} where refresh_hash = ${refreshHash} and refresh_expires_at > ${now} returning account_id) select a.id, a.username, a.roles from management.accounts a join rotated r on a.id = r.account_id`,
      );
      return rows[0] ? operatorSchema.parse(rows[0]) : undefined;
    },
    async revoke(accessHash, refreshHash) {
      await db.execute(
        sql`delete from management.auth_sessions where access_hash = ${accessHash} or refresh_hash = ${refreshHash}`,
      );
    },
  };
}
