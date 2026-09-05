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
