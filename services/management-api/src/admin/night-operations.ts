import {
  NIGHT_LOGIN_RETENTION_MS,
  normalizeControlSnapshot,
  type ControlSnapshot,
} from '@coffeeeeffoc/service-kit';
import { ControlError, snapshotDigest, type ControlTransaction } from './control-model.js';

/** Full publication history, never the bounded UI list: removed IDs remain reserved. */
export async function assertNightOperations(
  tx: ControlTransaction,
  next: ControlSnapshot,
  now: number,
) {
  const operations = next.nightOperations;
  const histories = await tx.publishedRevisions();
  for (const history of histories) {
    if (snapshotDigest(history.snapshot) !== history.digest)
      throw new Error('Invalid revision digest');
    const previous = normalizeControlSnapshot(history.snapshot).nightOperations;
    // Published compensation cannot be edited, withdrawn or removed.
    for (const old of previous?.compensations ?? []) {
      const current = operations?.compensations.find((c) => c.id === old.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(old))
        throw new ControlError('NIGHT_COMPENSATION_IMMUTABLE');
    }
    for (const old of previous?.release?.builds ?? []) {
      const current = operations?.release?.builds.find((b) => b.buildId === old.buildId);
      if (!current) throw new ControlError('NIGHT_BUILD_REMOVAL_REQUIRED');
      if (
        JSON.stringify([
          old.channel,
          old.ranked,
          old.multiplayer,
          old.version,
          old.backendVersion,
        ]) !==
        JSON.stringify([
          current.channel,
          current.ranked,
          current.multiplayer,
          current.version,
          current.backendVersion,
        ])
      )
        throw new ControlError('NIGHT_BUILD_IMMUTABLE');
    }
  }
  const published = new Set(
    histories
      .flatMap((h) => normalizeControlSnapshot(h.snapshot).nightOperations?.compensations ?? [])
      .map((c) => c.id),
  );
  for (const compensation of operations?.compensations ?? []) {
    if (published.has(compensation.id) || compensation.voided) continue;
    // Only a finished range is verifiable, and visits are kept for the login retention only.
    if (compensation.loginTo > now)
      throw new ControlError('NIGHT_COMPENSATION_FUTURE_LOGIN_RANGE', 422);
    if (compensation.loginFrom < now - NIGHT_LOGIN_RETENTION_MS)
      throw new ControlError('NIGHT_COMPENSATION_LOGIN_RANGE_EXPIRED', 422);
  }
}

export async function nightReleaseRollbackSnapshot(
  tx: ControlTransaction,
  input: { channel: string; buildId: string },
) {
  const head = await tx.head();
  const current = head.revisionId ? await tx.revision(head.revisionId) : undefined;
  if (!current) throw new ControlError('NIGHT_RELEASE_NOT_CONFIGURED');
  if (snapshotDigest(current.snapshot) !== current.digest)
    throw new Error('Invalid revision digest');
  const snapshot = normalizeControlSnapshot(current.snapshot);
  const release = snapshot.nightOperations?.release;
  if (!release) throw new ControlError('NIGHT_RELEASE_NOT_CONFIGURED');
  const build = release.builds.find(
    (b) => b.buildId === input.buildId && b.channel === input.channel,
  );
  const channel = release.channels.find((c) => c.channel === input.channel);
  if (!build || !channel) throw new ControlError('NIGHT_BUILD_NOT_FOUND');
  if (build.removed) throw new ControlError('NIGHT_BUILD_REMOVED');
  if (build.disabled) throw new ControlError('NIGHT_BUILD_DISABLED');
  if (build.backendVersion && release.disabledBackendVersions?.includes(build.backendVersion))
    throw new ControlError('NIGHT_BACKEND_DISABLED');
  for (const kind of ['ranked', 'multiplayer'] as const) {
    if (release.retiredRules?.[kind].includes(build[kind]))
      throw new ControlError('NIGHT_RULE_RETIRED');
    if (!release.allowNew[kind].includes(build[kind]))
      throw new ControlError('NIGHT_RULE_DISABLED');
  }
  channel.latestBuildId = build.buildId;
  return snapshot;
}
