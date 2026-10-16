import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import {
  CONTROL_GAMES,
  type Audit,
  type ControlMember,
  type ControlRole,
  type ControlStore,
  type GamePolicy,
  type Head,
  type Observation,
  type Revision,
} from './control-model.js';

type Database = ReturnType<typeof openDatabase>['db'];
const json = (value: unknown) => JSON.stringify(value);
/** Shares the existing management pool. No bootstrap or migration runs at application startup. */
export function createControlStore(db: Database): ControlStore {
  return {
    transaction(work) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('game-control:v1',0))`);
        const revision = (row: Record<string, unknown>): Revision => ({
          id: String(row.id),
          parentVersion: Number(row.parent_version),
          snapshot: row.snapshot as Revision['snapshot'],
          reason: String(row.reason),
          actor: String(row.actor),
          rollbackOf: row.rollback_of ? String(row.rollback_of) : null,
          digest: String(row.digest),
          createdAt: Number(row.created_at),
        });
        return work({
          async members() {
            const rows = await tx.execute(
              sql`select m.*, coalesce(jsonb_agg(mr.role_id order by mr.role_id) filter(where mr.role_id is not null),'[]'::jsonb) as roles from game_control.members m left join game_control.member_roles mr on mr.member_id=m.id group by m.id order by m.email`,
            );
            return rows.map(
              (row): ControlMember => ({
                id: String(row.id),
                email: String(row.email),
                githubId: row.github_id === null ? null : String(row.github_id),
                active: Boolean(row.active),
                roleIds: row.roles as string[],
              }),
            );
          },
          async roles() {
            const rows = await tx.execute(sql`select * from game_control.roles order by id`);
            return rows.map(
              (row): ControlRole => ({
                id: String(row.id),
                name: String(row.name),
                permissions: row.permissions as ControlRole['permissions'],
                builtin: Boolean(row.builtin),
              }),
            );
          },
          async putMember(member) {
            await tx.execute(
              sql`insert into game_control.members(id,email,github_id,active) values(${member.id},${member.email},${member.githubId},${member.active}) on conflict(id) do update set email=excluded.email,github_id=excluded.github_id,active=excluded.active`,
            );
            await tx.execute(
              sql`delete from game_control.member_roles where member_id=${member.id}`,
            );
            for (const role of member.roleIds)
              await tx.execute(
                sql`insert into game_control.member_roles(member_id,role_id) values(${member.id},${role})`,
              );
          },
          async deleteMember(id) {
            await tx.execute(sql`delete from game_control.member_roles where member_id=${id}`);
            await tx.execute(sql`delete from game_control.members where id=${id}`);
          },
          async putRole(role) {
            await tx.execute(
              sql`insert into game_control.roles(id,name,permissions,builtin) values(${role.id},${role.name},${json(role.permissions)}::jsonb,${role.builtin}) on conflict(id) do update set name=excluded.name,permissions=excluded.permissions`,
            );
          },
          async deleteRole(id) {
            await tx.execute(sql`delete from game_control.roles where id=${id}`);
          },
          async initialized() {
            const rows = await tx.execute(
              sql`select initialized from game_control.bootstrap where id=1`,
            );
            if (rows.length !== 1) throw new Error('Control schema is not initialized');
            return rows[0]!.initialized === true;
          },
          async markInitialized() {
            await tx.execute(
              sql`update game_control.bootstrap set initialized=true where id=1 and not initialized`,
            );
          },
          async head() {
            const rows = await tx.execute(
              sql`select version,revision_id from game_control.active_head where id=1`,
            );
            if (rows.length !== 1) throw new Error('Control head is not initialized');
            return {
              version: Number(rows[0]!.version),
              revisionId: rows[0]!.revision_id ? String(rows[0]!.revision_id) : null,
            } satisfies Head;
          },
          async policies() {
            const rows = await tx.execute(
              sql`select * from game_control.current_policy order by game_id`,
            );
            return rows.map(
              (row): GamePolicy => ({
                gameId: row.game_id as GamePolicy['gameId'],
                state: row.state as GamePolicy['state'],
                killEpoch: Number(row.kill_epoch),
                revision: Number(row.revision),
              }),
            );
          },
          async setHead(expected, id, actor, at, snapshot) {
            const rows = await tx.execute(
              sql`update game_control.active_head set version=version+1,revision_id=${id} where id=1 and version=${expected} returning version`,
            );
            if (rows.length === 1) {
              // Runtime uses the shared variant of these exact keys before SELECT policy, then room/run locks.
              // Exclusive keys avoid granting runtime_app UPDATE merely to support SELECT FOR SHARE.
              for (const game of [...CONTROL_GAMES].sort())
                await tx.execute(
                  sql`select pg_advisory_xact_lock(hashtextextended('game-control:' || ${game},0))`,
                );
              const policies = await tx.execute(
                sql`select game_id,state,kill_epoch,revision from game_control.current_policy order by game_id for update`,
              );
              if (
                policies.length !== CONTROL_GAMES.length ||
                CONTROL_GAMES.some((game) => !policies.some((row) => row.game_id === game)) ||
                policies.some((row) => Number(row.revision) !== expected)
              )
                throw new Error('Incomplete or stale game policy');
              for (const policy of policies) {
                const state = snapshot.games[policy.game_id as GamePolicy['gameId']];
                await tx.execute(
                  sql`update game_control.current_policy set state=${state},kill_epoch=kill_epoch+case when ${state}='disabled' and state<>'disabled' then 1 else 0 end,revision=${expected + 1} where game_id=${policy.game_id}`,
                );
              }
              await tx.execute(
                sql`insert into game_control.publications(version,revision_id,actor,created_at) values(${expected + 1},${id},${actor},${at})`,
              );
            }
            return rows.length === 1;
          },
          async published(id) {
            return (
              (
                await tx.execute(
                  sql`select 1 from game_control.publications where revision_id=${id}`,
                )
              ).length === 1
            );
          },
          async revisions() {
            return (
              await tx.execute(
                sql`select r.*,p.version as published_version from game_control.revisions r left join game_control.publications p on p.revision_id=r.id order by r.created_at desc,r.id desc limit 100`,
              )
            ).map((row) => ({
              ...revision(row),
              publishedVersion:
                row.published_version == null ? null : Number(row.published_version),
            }));
          },
          async revision(id) {
            const rows = await tx.execute(sql`select * from game_control.revisions where id=${id}`);
            return rows[0] ? revision(rows[0]) : undefined;
          },
          async insertRevision(row) {
            await tx.execute(
              sql`insert into game_control.revisions(id,parent_version,snapshot,reason,actor,rollback_of,digest,created_at) values(${row.id},${row.parentVersion},${json(row.snapshot)}::jsonb,${row.reason},${row.actor},${row.rollbackOf},${row.digest},${row.createdAt})`,
            );
          },
          async observations() {
            const rows = await tx.execute(
              // At an equal timestamp, retain failure or the older version rather than hiding uncertainty.
              sql`select distinct on(consumer,instance_id) * from game_control.application_observations order by consumer,instance_id,observed_at desc,(status='failed') desc,version asc,id desc`,
            );
            return rows.map(
              (row): Observation => ({
                consumer: row.consumer as Observation['consumer'],
                instanceId: String(row.instance_id),
                version: Number(row.version),
                digest: String(row.digest),
                status: row.status as Observation['status'],
                observedAt: Number(row.observed_at),
              }),
            );
          },
          async audits() {
            const rows = await tx.execute(
              sql`select * from game_control.audit order by created_at desc,id desc limit 100`,
            );
            return rows.map(
              (row): Audit => ({
                id: String(row.id),
                actor: String(row.actor),
                action: String(row.action),
                target: String(row.target),
                detail: row.detail as Audit['detail'],
                createdAt: Number(row.created_at),
              }),
            );
          },
          async audit(row) {
            await tx.execute(
              sql`insert into game_control.audit(id,actor,action,target,detail,created_at) values(${row.id},${row.actor},${row.action},${row.target},${json(row.detail)}::jsonb,${row.createdAt})`,
            );
          },
        });
      });
    },
  };
}
