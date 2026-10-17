import { expect, it } from 'vitest';
import {
  ADMIN_RBAC_PROTOCOL,
  readAdminControlFlag,
  readAdminRbacPrincipal,
} from '../src/admin/rbac-protocol.js';
import { adminControlEnabled } from '../src/config.js';
import { controlFixture } from './control.fixture.js';

it('exports the actual pure deployment contract and preserves explicit flag semantics', () => {
  expect(ADMIN_RBAC_PROTOCOL).toEqual({ control: 1, dbMemberRecheck: 1 });
  expect(Object.isFrozen(ADMIN_RBAC_PROTOCOL)).toBe(true);
  for (const value of [undefined, 'false']) {
    expect(readAdminControlFlag(value)).toBe(false);
    expect(adminControlEnabled({ ADMIN_CONTROL_ENABLED: value })).toBe(false);
  }
  expect(adminControlEnabled({ ADMIN_CONTROL_ENABLED: 'true' })).toBe(true);
  for (const value of ['', 'TRUE', '1', 'true\n'])
    expect(() => readAdminControlFlag(value)).toThrow('ADMIN_CONTROL_ENABLED');
});

it('the live adapter rereads database membership and cannot retain a revoked principal', async () => {
  const f = await controlFixture();
  await f.service.saveMember(f.session, undefined, {
    email: 'second@example.com',
    roleIds: ['administrator'],
    reason: 'fixture administrator',
  });
  await f.service.access.identify(
    { githubId: 'second', login: 'second', emails: ['second@example.com'] },
    new Set(),
  );
  expect(await readAdminRbacPrincipal(f.service, f.session)).toMatchObject({
    roles: ['administrator'],
  });
  await f.service.saveMember(
    f.session,
    f.state().members.find((member) => member.githubId === f.session.githubId)!.id,
    { active: false, reason: 'revoke fixture' },
  );
  expect(await readAdminRbacPrincipal(f.service, f.session)).toBeUndefined();
});
