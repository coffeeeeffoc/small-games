import { normalizeControlSnapshot } from '@coffeeeeffoc/service-kit';
import { randomUUID } from 'node:crypto';
import type { AdminSession } from './store.js';
import { createControlAccess } from './control-access.js';
import { controlApplicationState } from './control-observations.js';
import {
  ADMINISTRATOR,
  CONSUMERS,
  CONTROL_GAMES,
  CONTROL_PERMISSIONS,
  ControlError,
  parseSnapshot,
  snapshotDigest,
  type ControlMember,
  type ControlRole,
  type ControlStore,
  type ControlTransaction,
  type Permission,
  type Principal,
  type Revision,
} from './control-model.js';

export function createControlService(store: ControlStore, adminOrigin: string, now = Date.now) {
  const access = createControlAccess(store, now);
  const audit = (
    tx: ControlTransaction,
    actor: Principal,
    action: string,
    target: string,
    detail: Record<string, unknown> = {},
  ) =>
    tx.audit({ id: randomUUID(), actor: actor.memberId, action, target, detail, createdAt: now() });
  function withPermission<T>(
    session: AdminSession,
    permission: Permission,
    work: (tx: ControlTransaction, actor: Principal) => Promise<T>,
  ) {
    return store.transaction(async (tx) => work(tx, await access.require(tx, session, permission)));
  }
  async function checkVersion(tx: ControlTransaction, expected: number) {
    if ((await tx.head()).version !== expected) throw new ControlError('VERSION_CONFLICT');
  }
  function grantable(actor: Principal, roles: ControlRole[]) {
    if (
      !actor.roles.includes(ADMINISTRATOR) &&
      roles.some(
        (role) =>
          role.id === ADMINISTRATOR ||
          role.permissions.some((permission) => !actor.permissions.includes(permission)),
      )
    )
      throw new ControlError('FORBIDDEN', 403);
  }
  async function preserveAdministrator(
    tx: ControlTransaction,
    id: string,
    replacement?: ControlMember,
  ) {
    const after = (await tx.members()).filter((member) => member.id !== id);
    if (replacement) after.push(replacement);
    if (
      !after.some(
        (member) =>
          member.active && member.githubId !== null && member.roleIds.includes(ADMINISTRATOR),
      )
    )
      throw new ControlError('LAST_ADMINISTRATOR');
  }
  async function newRevision(
    tx: ControlTransaction,
    actor: Principal,
    expected: number,
    snapshot: unknown,
    reason: string,
    rollbackOf: string | null = null,
  ) {
    await checkVersion(tx, expected);
    const parsed = parseSnapshot(snapshot, adminOrigin);
    const revision: Revision = {
      id: randomUUID(),
      parentVersion: expected,
      snapshot: parsed,
      reason,
      actor: actor.memberId,
      rollbackOf,
      digest: snapshotDigest(parsed),
      createdAt: now(),
    };
    await tx.insertRevision(revision);
    await audit(tx, actor, rollbackOf ? 'revisions.rollback' : 'revisions.create', revision.id, {
      expectedVersion: expected,
      digest: revision.digest,
      reason,
      rollbackOf,
    });
    return revision;
  }
  async function publish(
    tx: ControlTransaction,
    actor: Principal,
    revision: Revision,
    expected: number,
  ) {
    await checkVersion(tx, expected);
    if (revision.parentVersion !== expected || (await tx.published(revision.id)))
      throw new ControlError('VERSION_CONFLICT');
    if (snapshotDigest(revision.snapshot) !== revision.digest)
      throw new Error('Invalid revision digest');
    const snapshot = parseSnapshot(normalizeControlSnapshot(revision.snapshot), adminOrigin);
    if (!(await tx.setHead(expected, revision.id, actor.memberId, now(), snapshot)))
      throw new ControlError('VERSION_CONFLICT');
    await audit(tx, actor, 'revisions.publish', revision.id, {
      version: expected + 1,
      digest: revision.digest,
    });
    return { version: expected + 1, revisionId: revision.id, status: 'desired' as const };
  }
  return {
    access,
    catalog(session: AdminSession) {
      return withPermission(session, 'control.read', async () => ({
        games: CONTROL_GAMES,
        permissions: CONTROL_PERMISSIONS,
        consumers: CONSUMERS,
        independentGames: [{ id: 'tianxia-chalu', managed: false }],
      }));
    },
    state(session: AdminSession) {
      return withPermission(session, 'control.read', async (tx) => {
        const head = await tx.head();
        const revision = head.revisionId ? await tx.revision(head.revisionId) : undefined;
        if (head.version > 0 && !revision) throw new Error('Missing published revision');
        const observations = await tx.observations();
        return {
          ...head,
          configured: head.version > 0,
          snapshot: revision?.snapshot ?? null,
          digest: revision?.digest ?? null,
          policies: await tx.policies(),
          observations,
          ...controlApplicationState(head, revision, observations, now()),
        };
      });
    },
    revisions: (session: AdminSession) =>
      withPermission(session, 'control.read', (tx) => tx.revisions()),
    members: (session: AdminSession) =>
      withPermission(session, 'members.read', (tx) => tx.members()),
    roles: (session: AdminSession) => withPermission(session, 'roles.read', (tx) => tx.roles()),
    audits: (session: AdminSession) => withPermission(session, 'audit.read', (tx) => tx.audits()),
    draft(
      session: AdminSession,
      input: { expectedVersion: number; snapshot: unknown; reason: string },
    ) {
      return withPermission(session, 'control.write', (tx, actor) =>
        newRevision(tx, actor, input.expectedVersion, input.snapshot, input.reason),
      );
    },
    publish(session: AdminSession, id: string, expected: number) {
      return withPermission(session, 'control.publish', async (tx, actor) => {
        const revision = await tx.revision(id);
        if (!revision) throw new ControlError('NOT_FOUND', 404);
        return publish(tx, actor, revision, expected);
      });
    },
    rollback(
      session: AdminSession,
      input: { revisionId: string; expectedVersion: number; reason: string },
    ) {
      return withPermission(session, 'control.publish', async (tx, actor) => {
        const target = await tx.revision(input.revisionId);
        if (!target || !(await tx.published(target.id))) throw new ControlError('NOT_FOUND', 404);
        if (snapshotDigest(target.snapshot) !== target.digest)
          throw new Error('Invalid revision digest');
        const revision = await newRevision(
          tx,
          actor,
          input.expectedVersion,
          normalizeControlSnapshot(target.snapshot),
          input.reason,
          target.id,
        );
        return publish(tx, actor, revision, input.expectedVersion);
      });
    },
    saveMember(
      session: AdminSession,
      id: string | undefined,
      input: { email?: string; active?: boolean; roleIds?: string[]; reason: string },
    ) {
      return withPermission(session, 'members.write', async (tx, actor) => {
        const members = await tx.members(),
          roles = await tx.roles();
        const old = members.find((member) => member.id === id);
        if (id && !old) throw new ControlError('NOT_FOUND', 404);
        if (old?.githubId && input.email && input.email !== old.email)
          throw new ControlError('BOUND_EMAIL_IMMUTABLE');
        const member: ControlMember = {
          id: id ?? randomUUID(),
          email: input.email ?? old?.email ?? '',
          githubId: old?.githubId ?? null,
          active: input.active ?? old?.active ?? true,
          roleIds: [...new Set(input.roleIds ?? old?.roleIds ?? [])].sort(),
        };
        if (
          !member.email ||
          members.some((other) => other.id !== member.id && other.email === member.email)
        )
          throw new ControlError('MEMBER_CONFLICT');
        const grants = roles.filter((role) => member.roleIds.includes(role.id));
        if (grants.length !== member.roleIds.length) throw new ControlError('UNKNOWN_ROLE', 422);
        grantable(actor, [...grants, ...roles.filter((role) => old?.roleIds.includes(role.id))]);
        await preserveAdministrator(tx, member.id, member);
        await tx.putMember(member);
        await audit(tx, actor, old ? 'members.update' : 'members.create', member.id, {
          reason: input.reason,
          before: old ? { active: old.active, roleIds: old.roleIds } : null,
          after: { active: member.active, roleIds: member.roleIds },
        });
        return member;
      });
    },
    deleteMember(session: AdminSession, id: string, reason: string) {
      return withPermission(session, 'members.write', async (tx, actor) => {
        const member = (await tx.members()).find((entry) => entry.id === id);
        if (!member) throw new ControlError('NOT_FOUND', 404);
        grantable(
          actor,
          (await tx.roles()).filter((role) => member.roleIds.includes(role.id)),
        );
        await preserveAdministrator(tx, id);
        await tx.deleteMember(id);
        await audit(tx, actor, 'members.delete', id, {
          reason,
          before: { active: member.active, roleIds: member.roleIds },
          after: null,
        });
        return { ok: true };
      });
    },
    saveRole(
      session: AdminSession,
      id: string,
      input: { name: string; permissions: Permission[]; reason: string },
    ) {
      return withPermission(session, 'roles.write', async (tx, actor) => {
        if (id === ADMINISTRATOR) throw new ControlError('BUILTIN_ROLE');
        const role: ControlRole = {
          id,
          name: input.name,
          permissions: [...new Set(input.permissions)].sort(),
          builtin: false,
        };
        const existing = (await tx.roles()).find((entry) => entry.id === id);
        grantable(actor, existing ? [existing, role] : [role]);
        await tx.putRole(role);
        await audit(tx, actor, 'roles.save', id, {
          reason: input.reason,
          before: existing ? { name: existing.name, permissions: existing.permissions } : null,
          after: { name: role.name, permissions: role.permissions },
        });
        return role;
      });
    },
    deleteRole(session: AdminSession, id: string, reason: string) {
      return withPermission(session, 'roles.write', async (tx, actor) => {
        if (id === ADMINISTRATOR) throw new ControlError('BUILTIN_ROLE');
        const role = (await tx.roles()).find((entry) => entry.id === id);
        if (!role) throw new ControlError('NOT_FOUND', 404);
        grantable(actor, [role]);
        if ((await tx.members()).some((member) => member.roleIds.includes(id)))
          throw new ControlError('ROLE_IN_USE');
        await tx.deleteRole(id);
        await audit(tx, actor, 'roles.delete', id, {
          reason,
          before: { name: role.name, permissions: role.permissions },
          after: null,
        });
        return { ok: true };
      });
    },
  };
}
export type ControlService = ReturnType<typeof createControlService>;
