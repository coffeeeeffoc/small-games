import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { createService, openDatabase } from '@coffeeeeffoc/service-kit';
import {
  createManagementService,
  createAuthStore,
  initializeOperator,
} from '@coffeeeeffoc/management-api';
import {
  createCatalogStore,
  registerCatalog,
  createReleaseStore,
  registerReleaseProjection,
  canaryBucket,
  createSaveStore,
  registerSaves,
  SaveConflict,
  CatalogUnauthorized,
} from '@coffeeeeffoc/runtime-api';
import { managementEnvironment, runtimeEnvironment } from './platform-config.mjs';
import { runCommand } from './platform-process.mjs';

// An existing gated Artifact may be supplied to avoid repeating the full build in a test batch.
const artifactId =
  process.argv[2] ??
  JSON.parse(
    (
      await promisify(execFile)(process.execPath, ['scripts/build-artifact.mjs'], {
        timeout: 300_000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      })
    ).stdout
      .trim()
      .split(/\r?\n/)
      .at(-1),
  ).artifactId;
assert.match(artifactId, /^[a-f0-9]{64}$/);
const publicHex = await readFile(
  new URL('../.scratch/artifact-signing/public-key.txt', import.meta.url),
  'utf8',
);
const publicKey = await crypto.subtle.importKey(
  'spki',
  Buffer.from(publicHex.trim(), 'hex'),
  'Ed25519',
  true,
  ['verify'],
);
const databaseName = `catalog_fixture_${randomUUID().replaceAll('-', '')}`;
assert.match(databaseName, /^catalog_fixture_[a-f0-9]{32}$/);
const dbUrl = (base) => {
  const url = new URL(base);
  url.pathname = '/' + databaseName;
  return url.href;
};
const admin = openDatabase(
  'postgres://platform_owner:local-owner-only@127.0.0.1:15432/small_games',
  'runtime',
);
let owner, runtimeDb, managementDb, runtime, management, shell, browser;
let created = false;
try {
  await admin.db.execute(sql`create database ${sql.identifier(databaseName)}`);
  created = true;
  owner = openDatabase(
    dbUrl('postgres://platform_owner:local-owner-only@127.0.0.1:15432/small_games'),
    'runtime',
  );
  await owner.db.execute(sql`revoke all on database ${sql.identifier(databaseName)} from public`);
  await owner.db.execute(
    sql`grant connect on database ${sql.identifier(databaseName)} to management_app, runtime_app`,
  );
  await owner.db.execute(sql`create schema management`);
  await owner.db.execute(sql`create schema runtime`);
  await owner.db.execute(sql`grant usage on schema management to management_app`);
  await owner.db.execute(sql`grant usage on schema runtime to runtime_app`);
  for (const migration of [
    '002-management-auth.sql',
    '003-content-drafts.sql',
    '004-release-channels.sql',
    '005-runtime-sessions.sql',
    '006-cloud-saves.sql',
    '007-managed-ad-drafts.sql',
  ])
    await runCommand(
      'docker',
      [
        'compose',
        '-f',
        'infra/docker/compose.yaml',
        'exec',
        '-T',
        'postgres',
        'psql',
        '-U',
        'platform_owner',
        '-d',
        databaseName,
        '-v',
        'ON_ERROR_STOP=1',
      ],
      { input: await readFile(new URL(`../infra/migrations/${migration}`, import.meta.url)) },
    );
  runtimeDb = openDatabase(dbUrl(runtimeEnvironment.RUNTIME_DATABASE_URL), 'runtime');
  managementDb = openDatabase(dbUrl(managementEnvironment.MANAGEMENT_DATABASE_URL), 'management');
  runtime = createService('runtime', {}, false);
  const token = randomUUID();
  registerReleaseProjection(runtime, createReleaseStore(runtimeDb.db), { token, publicKey });
  const catalogStore = createCatalogStore(runtimeDb.db);
  const saveStore = createSaveStore(runtimeDb.db);
  const options = {
    shellOrigin: 'http://localhost:5173',
    deliveryUrl: 'http://127.0.0.1:1',
    canaryPercent: 10,
  };
  await registerCatalog(runtime, catalogStore, options);
  await registerSaves(runtime, saveStore, options.shellOrigin);
  const runtimeUrl = await runtime.listen({ host: '127.0.0.1', port: 0 });
  management = createManagementService(
    {
      ...managementEnvironment,
      MANAGEMENT_DATABASE_URL: dbUrl(managementEnvironment.MANAGEMENT_DATABASE_URL),
      RELEASE_PROJECTION_TOKEN: token,
      ARTIFACT_TRUSTED_PUBLIC_KEY: publicHex.trim(),
      RUNTIME_PROJECTION_URL: runtimeUrl,
      SHELL_ORIGIN: options.shellOrigin,
    },
    false,
  );
  options.deliveryUrl = await management.listen({ host: '127.0.0.1', port: 0 });
  const username = 'catalog-fixture';
  const password = randomUUID();
  await initializeOperator(createAuthStore(managementDb.db), username, password);
  const headers = {
    origin: managementEnvironment.STUDIO_ORIGIN,
    'content-type': 'application/json',
  };
  const login = await fetch(options.deliveryUrl + '/api/auth/login', {
    method: 'POST',
    headers,
    body: JSON.stringify({ username, password }),
  });
  assert.equal(login.status, 200);
  headers.cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const request = async (path, body) => {
    const response = await fetch(options.deliveryUrl + path, {
      method: body ? 'POST' : 'GET',
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert(response.ok, `${path}: ${response.status}`);
    return response.json();
  };
  const draft = await request('/api/drafts/', { name: 'Catalog end-to-end fixture' });
  assert.deepEqual(await catalogStore.catalog(), [], 'Draft creation must not leak into Runtime');
  async function publish(channel, expectedRevision, advertising) {
    const event = await request('/api/releases/publish', {
      eventId: randomUUID(),
      channel,
      expectedRevision,
      confirmation: true,
      draftId: draft.id,
      draftRevision: draft.revision,
      artifactId,
      ...(advertising ?? {}),
    });
    for (let attempt = 0; attempt < 40; attempt++) {
      const state = await request('/api/releases/');
      if (state.events.find((entry) => entry.eventId === event.eventId)?.delivered)
        return event.version;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Outbox did not acknowledge publication');
  }
  const stable = await publish('stable', 0);
  const catalog = await catalogStore.catalog();
  assert.equal(catalog[0].versionId, stable.id);
  assert.equal(catalog[0].content, undefined);
  const playerId = randomUUID();
  const playerCredential = randomUUID().replaceAll('-', '').repeat(2);
  const sessionInput = {
    gameId: 'cultivation',
    playerId,
    channel: 'stable',
    locale: 'zh-CN',
    capabilities: [...stable.artifact.manifest.game.capabilities],
  };
  const runtimeSession = (input, canaryPercent = 10) =>
    catalogStore.session(input, canaryPercent, playerCredential);
  const fixed = await runtimeSession(sessionInput);
  assert.equal(fixed.session.publishedVersionId, stable.id);
  assert.equal(fixed.session.adAuthority, 'none');
  // Managed Ad configuration reaches players only through a published, immutable snapshot.
  const projected = await catalogStore.catalog();
  const adDraft = await request('/api/ad-drafts/', { name: 'Managed Ad fixture' });
  assert.equal(adDraft.envelope.enabled, false, 'A new advertising draft starts disabled');
  const adSave = await fetch(options.deliveryUrl + `/api/ad-drafts/${adDraft.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      ...adDraft,
      envelope: {
        ...adDraft.envelope,
        enabled: true,
        placements: [
          {
            opportunityId: 'cultivation.reincarnate',
            creativeId: adDraft.envelope.creatives[0].id,
            policy: { cooldownMs: 1000 },
            reward: { enabled: true, maxPerSession: 1 },
          },
        ],
      },
    }),
  });
  assert.equal(adSave.status, 200);
  Object.assign(adDraft, await adSave.json());
  assert.deepEqual(
    await catalogStore.catalog(),
    projected,
    'A saved advertising draft must not reach players',
  );
  const advertised = await publish('development', 0, {
    adDraftId: adDraft.id,
    adDraftRevision: adDraft.revision,
  });
  assert.deepEqual(advertised.advertising, adDraft.envelope);
  const managed = await runtimeSession({ ...sessionInput, versionId: advertised.id });
  assert.equal(managed.session.adAuthority, 'managed');
  assert.deepEqual(managed.version.advertising, adDraft.envelope);
  const staleAdvertising = await fetch(options.deliveryUrl + '/api/releases/publish', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      eventId: randomUUID(),
      channel: 'development',
      expectedRevision: 1,
      confirmation: true,
      draftId: draft.id,
      draftRevision: draft.revision,
      artifactId,
      adDraftId: adDraft.id,
      adDraftRevision: 0,
    }),
  });
  assert.equal(staleAdvertising.status, 409, 'A changed advertising draft must be re-read');
  const secondClient = await runtimeSession(sessionInput);
  await assert.rejects(catalogStore.session(sessionInput, 10, '0'.repeat(64)), CatalogUnauthorized);
  const firstSave = await saveStore.write(
    fixed.session.sessionId,
    'bili-pocket-arcade:v1',
    { cultivationChapter: 1 },
    null,
  );
  assert.deepEqual(
    await saveStore.read(secondClient.session.sessionId, 'bili-pocket-arcade:v1'),
    firstSave,
  );
  await saveStore.write(
    fixed.session.sessionId,
    'bili-pocket-arcade:v1',
    { cultivationChapter: 2 },
    firstSave.version,
  );
  await assert.rejects(
    saveStore.write(
      secondClient.session.sessionId,
      'bili-pocket-arcade:v1',
      { cultivationChapter: 3 },
      firstSave.version,
    ),
    SaveConflict,
  );
  const updated = structuredClone(draft);
  updated.envelope.payload.title = '已发布的第二个修仙版本';
  const save = await fetch(options.deliveryUrl + `/api/drafts/${draft.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(updated),
  });
  assert.equal(save.status, 200);
  Object.assign(draft, await save.json());
  const canary = await publish('canary', 0);
  let cohortPlayer = randomUUID();
  for (
    let attempt = 0;
    canaryBucket(cohortPlayer, 'cultivation') >= 10 && attempt < 1000;
    attempt++
  )
    cohortPlayer = randomUUID();
  const cohort = { ...sessionInput, playerId: cohortPlayer, channel: 'canary' };
  const cohortCredential = randomUUID().replaceAll('-', '').repeat(2);
  const cohortSession = (canaryPercent = 10) =>
    catalogStore.session(cohort, canaryPercent, cohortCredential);
  assert.equal((await cohortSession()).version.id, canary.id);
  assert.equal((await cohortSession(0)).version.id, canary.id);
  await request('/api/releases/rollback', {
    eventId: randomUUID(),
    channel: 'canary',
    expectedRevision: 1,
    confirmation: true,
    versionId: stable.id,
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal(
    (await cohortSession()).version.id,
    stable.id,
    'Rollback starts a new rollout for new sessions',
  );
  assert.equal(
    (await runtimeSession({ ...sessionInput, versionId: canary.id })).version.id,
    canary.id,
  );
  await assert.rejects(runtimeSession({ ...sessionInput, versionId: '0'.repeat(64) }));
  await assert.rejects(runtimeSession({ ...sessionInput, capabilities: [] }));
  assert.deepEqual(
    (
      await runtimeDb.db.execute(
        sql`select context from runtime.game_sessions where session_id = ${fixed.session.sessionId}`,
      )
    )[0].context,
    fixed.session,
  );
  shell = await createServer({
    root: fileURLToPath(new URL('../apps/shell-web/', import.meta.url)),
    server: { port: 5173, strictPort: true, host: '127.0.0.1' },
    define: { 'import.meta.env.VITE_RUNTIME_URL': JSON.stringify(runtimeUrl) },
  });
  await shell.listen();
  browser = await chromium.launch({
    headless: true,
    ...(process.platform === 'win32'
      ? {
          executablePath:
            process.env.PLAYWRIGHT_EXECUTABLE_PATH ??
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        }
      : {}),
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(options.shellOrigin);
  await page.getByText('已连接已发布 Catalog。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '进入游戏', exact: true }).first().click();
  await page
    .frameLocator('iframe')
    .getByRole('heading', { name: '三分钟修仙', exact: true })
    .waitFor();
  await page.getByRole('button', { name: '返回目录', exact: false }).click();
  await page.getByLabel('固定版本（可选）').fill(canary.id);
  await page.getByRole('button', { name: '进入游戏', exact: true }).first().click();
  await page
    .frameLocator('iframe')
    .getByRole('heading', { name: '已发布的第二个修仙版本', exact: true })
    .waitFor();
  await page.getByRole('button', { name: '返回目录', exact: false }).click();
  // Corrupt only the browser response, never immutable S3 bytes or published records.
  await page.route('**/published/**/remote-entry.js', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': options.shellOrigin,
        'access-control-expose-headers': 'content-security-policy',
        'content-security-policy': `default-src 'none'; script-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors ${options.shellOrigin}`,
      },
      body: 'corrupt bytes',
    }),
  );
  await page.getByRole('button', { name: '进入游戏', exact: true }).first().click();
  await page.getByText('已回退到内置版本', { exact: true }).waitFor();
  await page.locator('.game-slot > .cultivation').waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  await runtime.close();
  runtime = undefined;
  await page.goto(options.shellOrigin);
  await page.getByText('Runtime 不可用，使用本地默认 Catalog。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '进入游戏', exact: true }).first().click();
  await page.locator('.game-slot > .cultivation').waitFor();
  console.log(
    'Isolated live publication → Runtime Catalog/cloud save → published Managed Ad authority, real browser iframe launch/pin, sticky canary, corruption fallback and Runtime-offline local Catalog passed.',
  );
} finally {
  await browser?.close();
  await shell?.close();
  await Promise.all([management?.close(), runtime?.close()]);
  await Promise.all([managementDb?.close(), runtimeDb?.close(), owner?.close()]);
  if (created) await admin.db.execute(sql`drop database ${sql.identifier(databaseName)}`);
  await admin.close();
}
