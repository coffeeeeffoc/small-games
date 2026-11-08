import { normalizeControlSnapshot } from '@coffeeeeffoc/service-kit';
import { randomUUID } from 'node:crypto';
import { assertNightOperations } from './night-operations.js';
import {
  ControlError,
  parseSnapshot,
  snapshotDigest,
  type ControlTransaction,
  type Principal,
  type Revision,
} from './control-model.js';

export async function newControlRevision(
  tx: ControlTransaction,
  actor: Principal,
  expected: number,
  snapshot: unknown,
  reason: string,
  adminOrigin: string,
  now: () => number,
  rollbackOf: string | null = null,
) {
  if ((await tx.head()).version !== expected) throw new ControlError('VERSION_CONFLICT');
  const parsed = parseSnapshot(snapshot, adminOrigin);
  await assertNightOperations(tx, parsed, now());
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
  await tx.audit({
    id: randomUUID(),
    actor: actor.memberId,
    action: rollbackOf ? 'revisions.rollback' : 'revisions.create',
    target: revision.id,
    createdAt: now(),
    detail: {
      expectedVersion: expected,
      digest: revision.digest,
      reason,
      rollbackOf,
    },
  });
  return revision;
}

export async function publishControlRevision(
  tx: ControlTransaction,
  actor: Principal,
  revision: Revision,
  expected: number,
  adminOrigin: string,
  now: () => number,
) {
  if ((await tx.head()).version !== expected) throw new ControlError('VERSION_CONFLICT');
  if (revision.parentVersion !== expected || (await tx.published(revision.id)))
    throw new ControlError('VERSION_CONFLICT');
  if (snapshotDigest(revision.snapshot) !== revision.digest)
    throw new Error('Invalid revision digest');
  const snapshot = parseSnapshot(normalizeControlSnapshot(revision.snapshot), adminOrigin);
  await assertNightOperations(tx, snapshot, now());
  if (!(await tx.setHead(expected, revision.id, actor.memberId, now(), snapshot)))
    throw new ControlError('VERSION_CONFLICT');
  await tx.audit({
    id: randomUUID(),
    actor: actor.memberId,
    action: 'revisions.publish',
    target: revision.id,
    createdAt: now(),
    detail: {
      version: expected + 1,
      digest: revision.digest,
    },
  });
  return { version: expected + 1, revisionId: revision.id, status: 'desired' as const };
}
