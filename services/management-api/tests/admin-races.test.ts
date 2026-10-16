import { expect, it } from 'vitest';
import { adminFixture, origin } from './admin.fixture.js';

for (const rotateFirst of [true, false]) {
  it(`logout revokes its complete family when rotation ${rotateFirst ? 'commits' : 'waits'} first`, async () => {
    const f = await adminFixture();
    try {
      const first = await f.login(),
        other = await f.login();
      const data = (
        await f.app.inject({ url: '/api/session', headers: f.headers, cookies: first.cookies })
      ).json();
      let entered!: () => void, release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const rotate = f.store.rotateSession;
      f.store.rotateSession = async (...args) => {
        const result = rotateFirst ? await rotate(...args) : undefined;
        entered();
        await blocked;
        return rotateFirst ? result : rotate(...args);
      };
      const headers = { ...f.headers, origin, 'x-csrf-token': data.csrfToken };
      const pending = f.app.inject({
        method: 'POST',
        url: '/api/refresh',
        headers,
        cookies: first.cookies,
      });
      await barrier;
      expect(
        (
          await f.app.inject({
            method: 'POST',
            url: '/api/logout',
            headers,
            cookies: first.cookies,
          })
        ).statusCode,
      ).toBe(200);
      release();
      const refreshed = await pending;
      expect(refreshed.statusCode).toBe(rotateFirst ? 200 : 401);
      if (rotateFirst) {
        const cookie = refreshed.cookies.find(
          (value) => value.name === '__Secure-sg_admin_session',
        )!;
        expect(
          (
            await f.app.inject({
              url: '/api/session',
              headers: f.headers,
              cookies: { [cookie.name]: cookie.value },
            })
          ).statusCode,
        ).toBe(401);
      }
      expect(
        (await f.app.inject({ url: '/api/session', headers: f.headers, cookies: other.cookies }))
          .statusCode,
      ).toBe(200);
    } finally {
      await f.app.close();
    }
  });
}
