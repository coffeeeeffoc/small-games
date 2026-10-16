import { expect, it } from 'vitest';
import { createControlService } from '../src/admin/control-service.js';
import { CONTROL_PERMISSIONS } from '../src/admin/control-model.js';
import { origin } from './admin.fixture.js';
import { controlFixture, controlSnapshot, memoryControlStore } from './control.fixture.js';

it('bootstraps only one verified allowlisted GitHub identity under the shared transaction lock', async () => {
  const f = memoryControlStore();
  const service = createControlService(f.store, origin);
  const allowlist = new Set(['a@example.com', 'b@example.com']);
  const results = await Promise.all([
    service.access.identify({ githubId: '11', login: 'a', emails: ['a@example.com'] }, allowlist),
    service.access.identify({ githubId: '22', login: 'b', emails: ['b@example.com'] }, allowlist),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(f.state().members).toHaveLength(1);
  expect(f.state().audits).toHaveLength(1);
  expect(f.state().initialized).toBe(true);
  expect(
    await service.access.identify(
      { githubId: '33', login: 'forged', emails: ['unlisted@example.com'] },
      allowlist,
    ),
  ).toBeUndefined();
});

it('binds a DB-whitelisted verified email once, ignores later env additions and immediately honors revocation', async () => {
  const f = await controlFixture();
  await f.service.saveRole(f.session, 'viewer', {
    name: 'Viewer',
    permissions: ['control.read'],
    reason: 'least privilege',
  });
  const member = await f.service.saveMember(f.session, undefined, {
    email: 'viewer@example.com',
    roleIds: ['viewer'],
    reason: 'invite',
  });
  expect(
    await f.service.access.identify(
      { githubId: '44', login: 'viewer', emails: ['viewer@example.com'] },
      new Set(),
    ),
  ).toBe('viewer@example.com');
  expect(
    await f.service.access.identify(
      { githubId: '55', login: 'impostor', emails: ['viewer@example.com'] },
      new Set(),
    ),
  ).toBeUndefined();
  const session = { ...f.session, githubId: '44', email: member.email };
  expect(await f.service.access.session(session)).toMatchObject({
    roles: ['viewer'],
    permissions: ['control.read'],
  });
  await expect(
    f.service.draft(session, {
      expectedVersion: 0,
      snapshot: controlSnapshot(),
      reason: 'unauthorized',
    }),
  ).rejects.toMatchObject({ status: 403 });
  await f.service.saveMember(f.session, member.id, { active: false, reason: 'revoke now' });
  expect(await f.service.access.session(session)).toBeUndefined();
  expect(
    await f.service.access.identify(
      { githubId: '44', login: 'viewer', emails: [member.email] },
      new Set([member.email]),
    ),
  ).toBeUndefined();
  expect(
    await f.service.access.identify(
      { githubId: '66', login: 'new env user', emails: ['env@example.com'] },
      new Set(['env@example.com']),
    ),
  ).toBeUndefined();
});

it('protects the final active bound builtin administrator and rejects referenced/builtin role edits', async () => {
  const f = await controlFixture();
  const id = f.state().members[0]!.id;
  for (const operation of [
    () => f.service.saveMember(f.session, id, { active: false, reason: 'disable' }),
    () => f.service.saveMember(f.session, id, { roleIds: [], reason: 'demote' }),
    () => f.service.deleteMember(f.session, id, 'delete'),
  ])
    await expect(operation()).rejects.toMatchObject({ code: 'LAST_ADMINISTRATOR' });
  await expect(
    f.service.saveRole(f.session, 'administrator', {
      name: 'changed',
      permissions: [],
      reason: 'edit',
    }),
  ).rejects.toMatchObject({ code: 'BUILTIN_ROLE' });
  await expect(f.service.deleteRole(f.session, 'administrator', 'delete')).rejects.toMatchObject({
    code: 'BUILTIN_ROLE',
  });
  await f.service.saveRole(f.session, 'reader', {
    name: 'Reader',
    permissions: ['control.read'],
    reason: 'create',
  });
  const member = await f.service.saveMember(f.session, undefined, {
    email: 'reader@example.com',
    roleIds: ['reader'],
    reason: 'invite',
  });
  await expect(f.service.deleteRole(f.session, 'reader', 'delete')).rejects.toMatchObject({
    code: 'ROLE_IN_USE',
  });
  await f.service.deleteMember(f.session, member.id, 'remove invitation');
  await expect(f.service.deleteRole(f.session, 'reader', 'unused')).resolves.toEqual({ ok: true });
  expect(f.state().roles.find((role) => role.id === 'administrator')!.permissions).toEqual(
    CONTROL_PERMISSIONS,
  );
});

it('serializes concurrent removal of two administrators and audits only the committed mutation', async () => {
  const f = await controlFixture();
  const first = f.state().members[0]!;
  const second = await f.service.saveMember(f.session, undefined, {
    email: 'second@example.com',
    roleIds: ['administrator'],
    reason: 'invite administrator',
  });
  await f.service.access.identify(
    { githubId: '77', login: 'second', emails: [second.email] },
    new Set(),
  );
  const secondSession = { ...f.session, githubId: '77', email: second.email };
  const before = f.state().audits.length;
  const result = await Promise.allSettled([
    f.service.deleteMember(f.session, second.id, 'remove second'),
    f.service.deleteMember(secondSession, first.id, 'remove first'),
  ]);
  expect(result.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
  expect(
    f.state().members.filter((member) => member.active && member.roleIds.includes('administrator')),
  ).toHaveLength(1);
  expect(f.state().audits.length).toBe(before + 1);
});

it('cannot delegate permissions above the acting role or grant builtin administrator indirectly', async () => {
  const f = await controlFixture();
  await f.service.saveRole(f.session, 'delegate', {
    name: 'Delegate',
    permissions: ['members.write', 'roles.write'],
    reason: 'delegate limited administration',
  });
  const member = await f.service.saveMember(f.session, undefined, {
    email: 'delegate@example.com',
    roleIds: ['delegate'],
    reason: 'invite',
  });
  await f.service.access.identify(
    { githubId: '88', login: 'delegate', emails: [member.email] },
    new Set(),
  );
  const session = { ...f.session, githubId: '88', email: member.email };
  await expect(
    f.service.saveRole(session, 'escalation', {
      name: 'Escalation',
      permissions: ['control.publish'],
      reason: 'escalate',
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    f.service.saveMember(session, member.id, { roleIds: ['administrator'], reason: 'escalate' }),
  ).rejects.toMatchObject({ status: 403 });
  await f.service.saveRole(f.session, 'publisher', {
    name: 'Publisher',
    permissions: ['control.publish'],
    reason: 'publish permission',
  });
  for (const permissions of [[], ['members.write']] as const) {
    await expect(
      f.service.saveRole(session, 'publisher', {
        name: 'Changed by lower privilege actor',
        permissions: [...permissions],
        reason: 'cannot reduce or replace a higher privilege role',
      }),
    ).rejects.toMatchObject({ status: 403 });
  }
});
