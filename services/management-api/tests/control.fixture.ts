import {
  CONTROL_GAMES,
  CONTROL_PERMISSIONS,
  type Audit,
  type ControlMember,
  type ControlRole,
  type ControlStore,
  type GamePolicy,
  type Head,
  type Observation,
  type Revision,
  type Snapshot,
} from '../src/admin/control-model.js';
import { createControlService } from '../src/admin/control-service.js';
import { origin } from './admin.fixture.js';
import type { AdminSession } from '../src/admin/store.js';

export const controlSnapshot = (): Snapshot => ({
  apiOrigins: ['http://localhost:8080'],
  games: Object.fromEntries(CONTROL_GAMES.map((id) => [id, 'enabled'])) as Snapshot['games'],
});
/** Behavioral adapter with atomic rollback and serialized transactions, not evidence of PostgreSQL execution. */
export function memoryControlStore() {
  let state = {
    members: [] as ControlMember[],
    roles: [
      {
        id: 'administrator',
        name: 'Administrator',
        permissions: [...CONTROL_PERMISSIONS],
        builtin: true,
      },
    ] as ControlRole[],
    initialized: false,
    head: { version: 0, revisionId: null } as Head,
    revisions: [] as Revision[],
    publications: [] as string[],
    observations: [] as Observation[],
    audits: [] as Audit[],
    policies: CONTROL_GAMES.map((gameId) => ({
      gameId,
      state: 'enabled',
      killEpoch: 0,
      revision: 0,
    })) as GamePolicy[],
  };
  let tail: Promise<unknown> = Promise.resolve();
  const store: ControlStore = {
    transaction(work) {
      const pending = tail.then(async () => {
        const draft = structuredClone(state);
        const result = await work({
          async members() {
            return structuredClone(draft.members);
          },
          async roles() {
            return structuredClone(draft.roles);
          },
          async putMember(member) {
            draft.members = [
              ...draft.members.filter((row) => row.id !== member.id),
              structuredClone(member),
            ];
          },
          async deleteMember(id) {
            draft.members = draft.members.filter((row) => row.id !== id);
          },
          async putRole(role) {
            draft.roles = [
              ...draft.roles.filter((row) => row.id !== role.id),
              structuredClone(role),
            ];
          },
          async deleteRole(id) {
            draft.roles = draft.roles.filter((row) => row.id !== id);
          },
          async initialized() {
            return draft.initialized;
          },
          async markInitialized() {
            draft.initialized = true;
          },
          async head() {
            return structuredClone(draft.head);
          },
          async policies() {
            return structuredClone(draft.policies);
          },
          async setHead(expected, id, _actor, _at, snapshot) {
            if (draft.head.version !== expected) return false;
            draft.head = { version: expected + 1, revisionId: id };
            draft.publications.push(id);
            for (const policy of draft.policies) {
              const next = snapshot.games[policy.gameId];
              if (next === 'disabled' && policy.state !== 'disabled') policy.killEpoch++;
              policy.state = next;
              policy.revision = expected + 1;
            }
            return true;
          },
          async published(id) {
            return draft.publications.includes(id);
          },
          async revisions() {
            return structuredClone(draft.revisions).map((row) => ({
              ...row,
              publishedVersion: draft.publications.includes(row.id)
                ? draft.publications.indexOf(row.id) + 1
                : null,
            }));
          },
          async revision(id) {
            return structuredClone(draft.revisions.find((row) => row.id === id));
          },
          async insertRevision(row) {
            draft.revisions.push(structuredClone(row));
          },
          async observations() {
            return structuredClone(draft.observations);
          },
          async audits() {
            return structuredClone(draft.audits);
          },
          async audit(row) {
            draft.audits.push(structuredClone(row));
          },
        });
        state = draft;
        return result;
      });
      tail = pending.catch(() => {});
      return pending;
    },
  };
  return { store, state: () => state };
}
export async function controlFixture() {
  const memory = memoryControlStore();
  let now = Date.now();
  const service = createControlService(memory.store, origin, () => now);
  const identity = { githubId: '123', login: 'creator', emails: ['1521152077@qq.com'] };
  await service.access.identify(identity, new Set(identity.emails));
  const session: AdminSession = {
    ...identity,
    email: identity.emails[0]!,
    expiresAt: now + 8 * 3600_000,
  };
  return {
    ...memory,
    service,
    session,
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
