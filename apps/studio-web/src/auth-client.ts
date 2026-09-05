import { z } from 'zod';

const operatorSchema = z.object({
  id: z.string(),
  username: z.string(),
  roles: z.array(z.enum(['creator', 'reviewer', 'publisher', 'admin'])),
});
/** Server-authoritative identity only; no token is ever exposed to React. */
export type Operator = z.infer<typeof operatorSchema>;
/** Authentication transport shared by the router and interactive login form. */
export interface AuthClient {
  session(): Promise<Operator | null>;
  login(username: string, password: string): Promise<Operator>;
  logout(): Promise<void>;
}

/** Uses same-origin, HttpOnly-cookie authentication through the local API proxy. */
export function createAuthClient(): AuthClient {
  async function request(path: string, body?: unknown) {
    return fetch(`/api/auth/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  return {
    async session() {
      let response = await request('session');
      if (response.status === 401) {
        const refresh = await request('refresh', {});
        if (refresh.status === 401) return null;
        if (!refresh.ok) throw new Error('暂时无法连接登录服务，请稍后重试。');
        response = await request('session');
      }
      if (response.status === 401) return null;
      if (!response.ok) throw new Error('暂时无法连接登录服务，请稍后重试。');
      return operatorSchema.parse(await response.json());
    },
    async login(username, password) {
      const response = await request('login', { username, password });
      if (response.status === 429) throw new Error('尝试次数过多，请稍后再试。');
      if (response.status === 401) throw new Error('账号或密码不正确。');
      if (!response.ok) throw new Error('暂时无法登录，请稍后重试。');
      return operatorSchema.parse(await response.json());
    },
    async logout() {
      const response = await request('logout', {});
      if (!response.ok) throw new Error('退出失败，请重试。');
    },
  };
}
