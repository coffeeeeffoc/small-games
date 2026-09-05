import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sql } from 'drizzle-orm';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import {
  createManagementService,
  createAuthStore,
  initializeOperator,
  hashPassword,
} from '@coffeeeeffoc/management-api';
import { managementEnvironment } from './platform-config.mjs';

const owner = openDatabase(
  'postgres://platform_owner:local-owner-only@127.0.0.1:15432/small_games',
  'management',
);
const database = openDatabase(managementEnvironment.MANAGEMENT_DATABASE_URL, 'management');
const store = createAuthStore(database.db);
const app = createManagementService(managementEnvironment, false);
const username = `integration-${randomUUID()}`;
const password = randomUUID();
let accountId;
const draftName = `draft-integration-${randomUUID()}`;
try {
  const initialized = await initializeOperator(store, username, password);
  if (!initialized) {
    // Existing operators are never changed; create a uniquely named owned test fixture.
    accountId = randomUUID();
    await owner.db.execute(
      sql`insert into management.accounts (id, username, password_hash, roles) values (${accountId},${username},${await hashPassword(password)},'["creator","reviewer","publisher","admin"]'::jsonb)`,
    );
  }
  const account = await store.findAccount(username);
  assert(account);
  accountId = account.id;
  assert.match(account.passwordHash, /^\$argon2id\$/);
  assert.notEqual(account.passwordHash, password);
  assert.equal(await initializeOperator(store, `other-${randomUUID()}`, randomUUID()), false);
  const repeated = await promisify(execFile)(
    process.execPath,
    ['scripts/initialize-operator.mjs'],
    {
      env: {
        ...process.env,
        STUDIO_ADMIN_USERNAME: `other-${randomUUID()}`,
        STUDIO_ADMIN_PASSWORD: randomUUID(),
      },
      timeout: 30_000,
    },
  );
  assert.match(repeated.stdout, /already exists/);
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const post = (path, body, cookie = '') =>
    fetch(address + `/api/auth/${path}`, {
      method: 'POST',
      headers: {
        origin: managementEnvironment.STUDIO_ORIGIN,
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify(body),
    });
  const session = (cookie) => fetch(address + '/api/auth/session', { headers: { cookie } });
  const cookies = (response) =>
    response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
  assert.equal((await session('')).status, 401);
  assert.equal((await post('login', { username, password: 'wrong' })).status, 401);
  const login = await post('login', { username, password });
  assert.equal(login.status, 200);
  const identity = await login.json();
  assert.deepEqual(identity.roles, ['creator', 'reviewer', 'publisher', 'admin']);
  assert.equal(identity.passwordHash, undefined);
  const original = cookies(login);
  assert.equal((await session(original)).status, 200);
  const draftRequest = (path, method = 'GET', body) =>
    fetch(address + '/api/drafts' + path, {
      method,
      headers: {
        cookie: original,
        origin: managementEnvironment.STUDIO_ORIGIN,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const created = await draftRequest('/', 'POST', { name: draftName });
  assert.equal(created.status, 201);
  const draft = await created.json();
  assert.equal((await draftRequest(`/${draft.id}`)).status, 200);
  assert((await (await draftRequest('/')).json()).some((value) => value.id === draft.id));
  const invalid = structuredClone(draft);
  invalid.envelope.payload.events[0].title = '';
  const invalidSave = await draftRequest(`/${draft.id}`, 'PUT', invalid);
  assert.equal(invalidSave.status, 422);
  assert.deepEqual((await invalidSave.json()).issues[0].path, ['payload', 'events', 0, 'title']);
  const legacy = structuredClone(draft);
  legacy.envelope.schemaVersion = 1;
  delete legacy.envelope.payload.title;
  const saves = await Promise.all([
    draftRequest(`/${draft.id}`, 'PUT', legacy),
    draftRequest(`/${draft.id}`, 'PUT', draft),
  ]);
  assert.deepEqual(saves.map((value) => value.status).sort(), [200, 409]);
  const winner = await saves.find((value) => value.status === 200).json();
  assert.equal(winner.revision, 1);
  assert.equal(winner.envelope.revision, 1);
  assert.equal(winner.envelope.schemaVersion, 2);
  assert.deepEqual(await (await draftRequest(`/${draft.id}`)).json(), winner);
  // Explicitly verify migration after the concurrent winner, irrespective of race order.
  legacy.revision = winner.revision;
  const migration = await draftRequest(`/${draft.id}`, 'PUT', legacy);
  assert.equal(migration.status, 200);
  assert.equal((await migration.json()).envelope.payload.title, '三分钟修仙');
  console.log(
    'Live authenticated draft CRUD, field validation, v1 migration and atomic two-writer SQL conflict passed.',
  );
  // Expiration is driven by persisted state, without weakening the production clock.
  await owner.db.execute(
    sql`update management.auth_sessions set access_expires_at=0 where account_id=${accountId}`,
  );
  assert.equal((await session(original)).status, 401);
  const rotations = await Promise.all([
    post('refresh', {}, original),
    post('refresh', {}, original),
  ]);
  assert.deepEqual(rotations.map((response) => response.status).sort(), [200, 401]);
  const rotated = cookies(rotations.find((response) => response.status === 200));
  assert.equal((await session(rotated)).status, 200);
  assert.equal((await post('logout', {}, rotated)).status, 200);
  assert.equal((await session(rotated)).status, 401);
  assert.equal((await post('refresh', {}, rotated)).status, 401);
  console.log(
    'Live Argon2 SQL login, immutable initialization, expiry, atomic refresh replay rejection and logout passed.',
  );
} finally {
  try {
    await owner.db.execute(sql`delete from management.content_drafts where name=${draftName}`);
    if (accountId)
      await owner.db.execute(
        sql`delete from management.accounts where id=${accountId} and username=${username}`,
      );
  } finally {
    const closed = await Promise.allSettled([app.close(), database.close(), owner.close()]);
    if (closed.some((result) => result.status === 'rejected')) {
      console.error('Auth integration cleanup failed');
      process.exitCode = 1;
    }
  }
}
