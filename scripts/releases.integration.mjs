import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { createPublicationStore } from '@coffeeeeffoc/management-api';
import { createRuntimeService } from '@coffeeeeffoc/runtime-api';
import { buildArtifact, hex } from '@coffeeeeffoc/game-artifact';
import { createPublishedVersion } from '@coffeeeeffoc/release-contract';
import { managementEnvironment, runtimeEnvironment } from './platform-config.mjs';

const owner = openDatabase(
  'postgres://platform_owner:local-owner-only@127.0.0.1:15432/small_games',
  'management',
);
const management = openDatabase(managementEnvironment.MANAGEMENT_DATABASE_URL, 'management');
const runtime = openDatabase(runtimeEnvironment.RUNTIME_DATABASE_URL, 'runtime');
const gameId = `release-fixture-${randomUUID()}`;
const actorId = randomUUID();
const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
const token = randomUUID();
const app = createRuntimeService(
  {
    ...runtimeEnvironment,
    RELEASE_PROJECTION_TOKEN: token,
    ARTIFACT_TRUSTED_PUBLIC_KEY: hex(await crypto.subtle.exportKey('spki', keys.publicKey)),
  },
  false,
);
const publications = createPublicationStore(management.db);
const deliverOwn = (deliver) => publications.deliverOne(deliver, gameId);
const eventIds = [];
const sentinelId = randomUUID();
const sentinelGame = `untouched-${randomUUID()}`;
try {
  const artifact = await buildArtifact(
    {
      gameId,
      version: '1.0.0',
      gameContractVersion: 1,
      contentSchemaVersion: 1,
      capabilities: ['content'],
      loadModes: ['iframe'],
      entry: 'index.html',
      integrity: `builtin:${gameId}@1.0.0`,
    },
    new Map([
      ['index.html', new Uint8Array([1])],
      ['remote-entry.js', new Uint8Array([2])],
    ]),
    keys.privateKey,
    keys.publicKey,
  );
  const first = await createPublishedVersion(artifact, {
    gameId,
    schemaVersion: 1,
    revision: 1,
    payload: { title: 'one' },
  });
  const second = await createPublishedVersion(artifact, {
    gameId,
    schemaVersion: 1,
    revision: 2,
    payload: { title: 'two' },
  });
  const sentinelArtifact = await buildArtifact(
    { ...artifact.manifest.game, gameId: sentinelGame },
    new Map([
      ['index.html', new Uint8Array([1])],
      ['remote-entry.js', new Uint8Array([2])],
    ]),
    keys.privateKey,
    keys.publicKey,
  );
  const sentinelVersion = await createPublishedVersion(sentinelArtifact, {
    ...first.content,
    gameId: sentinelGame,
  });
  const sentinelEvent = {
    formatVersion: 1,
    eventId: sentinelId,
    channel: 'stable',
    revision: 1,
    version: sentinelVersion,
  };
  // A completed, valid row cannot poison or distract a concurrently running worker.
  await owner.db.execute(
    sql`insert into management.release_outbox (event_id, game_id, channel, revision, request_hash, payload, created_at, delivered) values (${sentinelId}, ${sentinelGame}, 'stable', 1, 'test-sentinel', ${JSON.stringify(sentinelEvent)}::jsonb, 0, true)`,
  );
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const deliver = async (event) => {
    const response = await fetch(address + '/internal/v1/releases', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const enqueue = async (version, revision, channel = 'stable') => {
    const input = {
      eventId: randomUUID(),
      channel,
      expectedRevision: revision,
      actorId,
      version,
      confirmation: true,
      request: { channel, expectedRevision: revision, versionId: version.id },
    };
    eventIds.push(input.eventId);
    const event = await publications.enqueue(input);
    assert.deepEqual(await publications.enqueue(input), event);
    await assert.rejects(
      publications.enqueue({
        ...input,
        expectedRevision: revision + 1,
        request: { ...input.request, expectedRevision: revision + 1 },
      }),
    );
    return event;
  };
  const pointer = async () =>
    (await publications.status(gameId)).channels.find((entry) => entry.channel === 'stable');
  const event1 = await enqueue(first, 0);
  await deliverOwn(async () => {
    throw new Error('offline');
  });
  assert.equal((await pointer()).versionId, null);
  assert.equal(
    (await runtime.db.execute(sql`select * from runtime.game_versions where game_id = ${gameId}`))
      .length,
    0,
  );
  await deliverOwn(deliver);
  assert.equal((await pointer()).versionId, first.id);
  assert.deepEqual(await Promise.all([deliver(event1), deliver(event1)]), [
    await deliver(event1),
    await deliver(event1),
  ]);
  const changedReplay = await app.inject({
    method: 'POST',
    url: '/internal/v1/releases',
    headers: { authorization: `Bearer ${token}` },
    payload: { ...event1, version: second },
  });
  assert.equal(changedReplay.statusCode, 409);
  const event2 = await enqueue(second, 1);
  await deliverOwn(async (event) => {
    await deliver(event);
    throw new Error('response lost after commit');
  });
  assert.equal((await pointer()).versionId, first.id);
  assert.equal(
    (
      await runtime.db.execute(
        sql`select version_id from runtime.release_channels where game_id = ${gameId} and channel = 'stable'`,
      )
    )[0].version_id,
    second.id,
  );
  await deliverOwn(deliver);
  assert.equal((await pointer()).versionId, second.id);
  await enqueue(first, 2);
  await deliverOwn(deliver);
  assert.equal((await pointer()).versionId, first.id);
  for (const channel of ['development', 'canary']) {
    await enqueue(second, 0, channel);
    await deliverOwn(deliver);
  }
  assert.equal((await publications.status(gameId)).versions.length, 2);
  assert.equal(
    (await runtime.db.execute(sql`select id from runtime.game_versions where game_id = ${gameId}`))
      .length,
    2,
  );
  assert.deepEqual(await publications.getVersion(second.id), second);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/internal/v1/releases',
        headers: { authorization: `Bearer ${token}` },
        payload: { ...event2, eventId: randomUUID() },
      })
    ).statusCode,
    409,
  );
  const permissionDenied = (error) => error.cause?.code === '42501';
  await assert.rejects(
    management.db.execute(
      sql`update management.game_versions set snapshot = '{}'::jsonb where id = ${first.id}`,
    ),
    permissionDenied,
  );
  await assert.rejects(
    management.db.execute(sql`delete from management.audit_log where actor_id = ${actorId}`),
    permissionDenied,
  );
  await assert.rejects(
    runtime.db.execute(sql`delete from runtime.game_versions where id = ${first.id}`),
    permissionDenied,
  );
  assert.equal(
    (await owner.db.execute(sql`select id from management.audit_log where actor_id = ${actorId}`))
      .length,
    5,
  );
  assert.equal(await deliverOwn(deliver), false);
  const sentinel = await owner.db.execute(
    sql`select attempts, last_error, delivered from management.release_outbox where event_id = ${sentinelId}`,
  );
  assert.deepEqual([...sentinel], [{ attempts: 0, last_error: null, delivered: true }]);
  console.log(
    'Live transactional outbox, all Channels, replay/conflict, lost acknowledgment retry, fixed snapshots, rollback and immutable SQL grants passed.',
  );
} finally {
  await app.close();
  await owner.db.execute(
    sql`delete from management.release_outbox where event_id = ${sentinelId} and game_id = ${sentinelGame}`,
  );
  // Only this run's UUID-owned rows are removed; published user snapshots/Artifacts are untouched.
  for (const eventId of eventIds)
    await owner.db.execute(
      sql`delete from runtime.projection_receipts where event_id = ${eventId}`,
    );
  await owner.db.execute(sql`delete from runtime.release_channels where game_id = ${gameId}`);
  await owner.db.execute(sql`delete from runtime.game_versions where game_id = ${gameId}`);
  await owner.db.execute(sql`delete from management.release_outbox where game_id = ${gameId}`);
  await owner.db.execute(sql`delete from management.release_channels where game_id = ${gameId}`);
  await owner.db.execute(sql`delete from management.game_versions where game_id = ${gameId}`);
  await owner.db.execute(sql`delete from management.audit_log where actor_id = ${actorId}`);
  await Promise.all([owner.close(), management.close(), runtime.close()]);
}
