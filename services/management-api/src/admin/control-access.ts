import { randomUUID } from 'node:crypto';
import type { Identity } from './github.js';
import type { AdminSession } from './store.js';
import {
  ADMINISTRATOR,
  CONTROL_PERMISSIONS,
  ControlError,
  type ControlMember,
  type ControlStore,
  type ControlTransaction,
  type Permission,
  type Principal,
} from './control-model.js';

export function createControlAccess(store: ControlStore, now = Date.now) {
  async function principal(
    tx: ControlTransaction,
    session: Pick<AdminSession, 'githubId' | 'email'>,
  ): Promise<Principal | undefined> {
    const member = (await tx.members()).find(
      (entry) =>
        entry.active && entry.githubId === session.githubId && entry.email === session.email,
    );
    if (!member) return;
    const roles = await tx.roles();
    const builtin = roles.find((role) => role.id === ADMINISTRATOR);
    if (
      !builtin?.builtin ||
      builtin.permissions.length !== CONTROL_PERMISSIONS.length ||
      CONTROL_PERMISSIONS.some((id) => !builtin.permissions.includes(id))
    )
      throw new Error('Invalid administrator role');
    const granted = roles.filter((role) => member.roleIds.includes(role.id));
    if (granted.length !== member.roleIds.length) throw new Error('Unknown member role');
    return {
      memberId: member.id,
      roles: granted.map((role) => role.id).sort(),
      permissions: CONTROL_PERMISSIONS.filter((permission) =>
        granted.some((role) => role.permissions.includes(permission)),
      ),
    };
  }
  return {
    async identify(identity: Identity, initialAllowlist: Set<string>) {
      return store.transaction(async (tx) => {
        const emails = new Set(identity.emails.map((email) => email.toLowerCase()));
        const members = await tx.members();
        const bound = members.find((member) => member.githubId === identity.githubId);
        if (bound) return bound.active && emails.has(bound.email) ? bound.email : undefined;
        // A once-only marker prevents env fallback after later deletes or disablement.
        if (!(await tx.initialized())) {
          if (members.length) throw new Error('Unexpected uninitialized membership');
          const email = [...emails].find((value) => initialAllowlist.has(value));
          if (!email) return;
          const member: ControlMember = {
            id: randomUUID(),
            email,
            githubId: identity.githubId,
            active: true,
            roleIds: [ADMINISTRATOR],
          };
          await tx.putMember(member);
          await tx.markInitialized();
          await tx.audit({
            id: randomUUID(),
            actor: member.id,
            action: 'members.bootstrap',
            target: member.id,
            detail: {},
            createdAt: now(),
          });
          return email;
        }
        const member = members.find(
          (entry) => entry.active && entry.githubId === null && emails.has(entry.email),
        );
        if (!member) return;
        await tx.putMember({ ...member, githubId: identity.githubId });
        await tx.audit({
          id: randomUUID(),
          actor: member.id,
          action: 'members.bind',
          target: member.id,
          detail: {},
          createdAt: now(),
        });
        return member.email;
      });
    },
    session(session: AdminSession) {
      return store.transaction((tx) => principal(tx, session));
    },
    async require(
      tx: ControlTransaction,
      session: AdminSession,
      permission: Permission,
    ): Promise<Principal> {
      const actor = await principal(tx, session);
      if (!actor || !actor.permissions.includes(permission))
        throw new ControlError('FORBIDDEN', 403);
      return actor;
    },
  };
}
export type ControlAccess = ReturnType<typeof createControlAccess>;
