import assert from 'node:assert/strict';

export const permissions = [
  'control.read',
  'control.write',
  'control.publish',
  'members.read',
  'members.write',
  'roles.read',
  'roles.write',
  'audit.read',
];
export const games = [
  'cops-robbers',
  'cops-robbers-realtime',
  'letters-words2',
  'vibeJam-myself-history-guess',
  'xiangqi-five',
  'flick-arena',
  'carrom-club',
  'cage-rescue',
  'tower-brake',
  'three-choose-two',
  'carding-car',
  'night-overwatch',
  'tetracube',
];
const uuid = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const clone = (value) => structuredClone(value);
/** HTTP-fixture UI behavior only. This never supplies a production authentication mode. */
export async function installControlFixture(page, granted = permissions) {
  const snapshot = {
    apiOrigins: ['https://game.example'],
    games: Object.fromEntries(
      games.map((id) => [
        id,
        ['night-overwatch', 'tetracube'].includes(id) ? 'disabled' : 'enabled',
      ]),
    ),
  };
  const revision = (number, publishedVersion, data = snapshot) => ({
    id: uuid(number),
    parentVersion: publishedVersion === null ? 2 : publishedVersion - 1,
    snapshot: clone(data),
    reason: `fixture reason ${number}`,
    actor: uuid(100),
    rollbackOf: null,
    digest: 'a'.repeat(64),
    createdAt: Date.now(),
    publishedVersion,
  });
  const fixture = {
    permissions: [...granted],
    roles: ['administrator'],
    sessionStatus: 200,
    requests: [],
    writes: [],
    nextError: undefined,
    state: {
      version: 2,
      revisionId: uuid(2),
      configured: true,
      snapshot: clone(snapshot),
      digest: 'a'.repeat(64),
      status: 'observed',
      policies: games.map((gameId) => ({
        gameId,
        state: snapshot.games[gameId],
        killEpoch: 0,
        revision: 2,
      })),
      observations: [
        {
          consumer: 'runtime',
          instanceId: 'expired-instance',
          version: 1,
          digest: 'b'.repeat(64),
          status: 'applied',
          observedAt: 1,
        },
      ],
      observationCoverage: {
        complete: false,
        missingConsumers: ['kart'],
        expiredUnknown: [{ consumer: 'runtime', instanceId: 'expired-instance' }],
      },
    },
    revisions: [
      revision(3, null),
      revision(2, 2),
      revision(1, 1, { ...snapshot, apiOrigins: ['https://previous.example'] }),
    ],
    members: [
      {
        id: uuid(100),
        email: 'owner@example.com',
        githubId: '123',
        active: true,
        roleIds: ['administrator'],
      },
      {
        id: uuid(101),
        email: 'viewer@example.com',
        githubId: '456',
        active: true,
        roleIds: ['viewer'],
      },
    ],
    directory: [
      { id: 'administrator', name: 'Administrator', permissions: [...permissions], builtin: true },
      { id: 'viewer', name: 'Viewer', permissions: ['control.read'], builtin: false },
    ],
    audit: [
      {
        id: uuid(900),
        actor: uuid(100),
        action: 'revisions.publish',
        target: uuid(2),
        detail: { reason: 'fixture publication', version: 2 },
        createdAt: Date.now(),
      },
    ],
  };
  let sequence = 10;
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    const trace = { path, method: request.method() };
    fixture.requests.push(trace);
    const respond = (body, status = 200) => {
      trace.status = status;
      if (typeof body?.error === 'string') trace.error = body.error;
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    };
    if (path === '/api/session')
      return respond(
        fixture.sessionStatus === 200
          ? {
              user: { login: 'creator' },
              csrfToken: 'c'.repeat(43),
              roles: fixture.roles,
              permissions: fixture.permissions,
              expiresAt: Date.now() + 3600000,
            }
          : { error: 'forbidden' },
        fixture.sessionStatus,
      );
    if (request.method() === 'GET') {
      const result = {
        catalog: {
          games,
          permissions,
          consumers: ['runtime', 'kart'],
          independentGames: [{ id: 'tianxia-chalu', managed: false }],
        },
        state: fixture.state,
        revisions: fixture.revisions,
        members: fixture.members,
        roles: fixture.directory,
        audit: fixture.audit,
      }[path.split('/').at(-1)];
      return respond(result ?? { error: 'NOT_FOUND' }, result ? 200 : 404);
    }
    assert.equal(request.headers()['x-csrf-token'], 'c'.repeat(43));
    const body = request.postDataJSON();
    fixture.writes.push({ path, body });
    if (fixture.nextError) {
      const error = fixture.nextError;
      fixture.nextError = undefined;
      return respond({ error: error.code }, error.status ?? 409);
    }
    if (path === '/api/control/revisions') {
      if (body.expectedVersion !== fixture.state.version)
        return respond({ error: 'VERSION_CONFLICT' }, 409);
      const row = {
        ...revision(sequence++, null, body.snapshot),
        reason: body.reason,
        parentVersion: body.expectedVersion,
      };
      fixture.revisions.unshift(row);
      return respond(row);
    }
    if (path.endsWith('/publish') || path === '/api/control/rollback') {
      if (body.expectedVersion !== fixture.state.version)
        return respond({ error: 'VERSION_CONFLICT' }, 409);
      let row = fixture.revisions.find(
        (entry) => entry.id === (body.revisionId ?? path.split('/').at(-2)),
      );
      assert(row);
      if (path.endsWith('/rollback')) {
        row = {
          ...revision(sequence++, null, row.snapshot),
          reason: body.reason,
          parentVersion: fixture.state.version,
          rollbackOf: row.id,
        };
        fixture.revisions.unshift(row);
      }
      row.publishedVersion = ++fixture.state.version;
      fixture.state.revisionId = row.id;
      fixture.state.snapshot = clone(row.snapshot);
      fixture.state.status = 'desired';
      return respond({ version: fixture.state.version, revisionId: row.id, status: 'desired' });
    }
    if (path.startsWith('/api/control/members')) {
      const id = path.split('/')[4];
      if (path.endsWith('/delete'))
        fixture.members = fixture.members.filter((member) => member.id !== id);
      else {
        const old = fixture.members.find((member) => member.id === id);
        fixture.members = fixture.members.filter((member) => member.id !== id);
        fixture.members.push({
          id: id ?? uuid(sequence++),
          githubId: old?.githubId ?? null,
          roleIds: [],
          ...old,
          ...body,
        });
      }
      return respond({ ok: true });
    }
    if (path.startsWith('/api/control/roles/')) {
      const id = path.split('/')[4];
      fixture.directory = fixture.directory.filter((role) => role.id !== id);
      if (!path.endsWith('/delete')) fixture.directory.push({ id, builtin: false, ...body });
      return respond({ ok: true });
    }
    return respond({ error: 'NOT_FOUND' }, 404);
  });
  return fixture;
}

export async function collectBrowserErrors(page) {
  const errors = [];
  page.__fixtureErrors = errors;
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error('FIXTURE_PAGE_ERROR ' + error.message.slice(0, 1000));
  });
  await page.addInitScript(() => {
    window.__cspViolations = [];
    window.__styleInsertions = [];
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes) {
          if (node instanceof HTMLStyleElement)
            window.__styleInsertions.push({
              key: node.getAttribute('rc-util-key'),
              cssHash: node.getAttribute('data-css-hash'),
              hasNonce: Boolean(node.nonce),
              sample: node.textContent.slice(0, 180),
            });
        }
    }).observe(document, { childList: true, subtree: true });
    addEventListener('securitypolicyviolation', (event) =>
      window.__cspViolations.push({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
      }),
    );
  });
  return async () => {
    assert.deepEqual(errors, [], 'Browser errors');
    assert.deepEqual(
      await page.evaluate(() => window.__cspViolations),
      [],
      'Legitimate interactions violate CSP',
    );
  };
}
