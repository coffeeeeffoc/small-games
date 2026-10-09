const STORAGE_KEY = 'here-and-then.session.v1';
const configuredBase = import.meta.env.VITE_HISTORY_API_URL || '/api/history';
const base = configuredBase.replace(/\/$/, '');
let token = null;
try {
  token = localStorage.getItem(STORAGE_KEY);
} catch {
  /* Session remains in memory when storage is unavailable. */
}
let sessionPromise = null;
let identityUsed = null;
try {
  identityUsed = localStorage.getItem(`${STORAGE_KEY}.identity`);
} catch {}
export class HistoryApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
async function request(path, { method = 'GET', body, anonymous = false } = {}) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 12000);
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      signal: abort.signal,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(!anonymous && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new HistoryApiError(
        '挑战服务尚未连接。可以先开启本地旅途。',
        'UNAVAILABLE',
        response.status,
      );
    }
    if (!response.ok) {
      if (response.status === 401 && !anonymous) {
        token = null;
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {}
      }
      throw new HistoryApiError(
        data.error?.message || data.message || '暂时无法完成，请稍后重试。',
        data.error?.code || data.code,
        response.status,
      );
    }
    return data;
  } catch (error) {
    if (error instanceof HistoryApiError) throw error;
    throw new HistoryApiError('挑战服务尚未连接。可以先开启本地旅途。', 'UNAVAILABLE', 0);
  } finally {
    clearTimeout(timer);
  }
}
async function session() {
  const identity = window.HISTORY_IDENTITY;
  const signature = typeof identity === 'string' ? identity.split('.').at(-1) : null;
  const upgrading = signature && signature !== identityUsed;
  if (token && !upgrading) return;
  if (!sessionPromise)
    sessionPromise = request('/sessions', {
      method: 'POST',
      anonymous: true,
      body: { nickname: '时空旅人', ...(identity && (upgrading || !token) ? { identity } : {}) },
    })
      .then((data) => {
        token = data.token;
        if (signature) identityUsed = signature;
        try {
          localStorage.setItem(STORAGE_KEY, token);
          if (signature) localStorage.setItem(`${STORAGE_KEY}.identity`, signature);
        } catch {}
      })
      .finally(() => {
        sessionPromise = null;
      });
  return sessionPromise;
}
async function auth(path, options) {
  await session();
  return request(path, options);
}
export const historyApi = {
  async me() {
    try {
      return await auth('/me');
    } catch (error) {
      if (error.status !== 401) throw error;
      await session();
      return request('/me');
    }
  },
  profile: (nickname) => auth('/me', { method: 'PATCH', body: { nickname } }),
  start: (mode) => auth('/runs', { method: 'POST', body: { mode } }),
  run: (id) => auth(`/runs/${encodeURIComponent(id)}`),
  answer: (id, body) => auth(`/runs/${encodeURIComponent(id)}/answers`, { method: 'POST', body }),
  next: (id, roundId) =>
    auth(`/runs/${encodeURIComponent(id)}/next`, { method: 'POST', body: { roundId } }),
  invite: (id) => auth(`/runs/${encodeURIComponent(id)}/invite`, { method: 'POST', body: {} }),
  inspect: (code) => auth(`/invites/${encodeURIComponent(code)}`),
  join: (code) => auth(`/invites/${encodeURIComponent(code)}/join`, { method: 'POST', body: {} }),
  leaderboard: (period) => auth(`/leaderboard?period=${period}`),
};
export function invitationUrl(code) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.username = '';
  url.password = '';
  url.searchParams.set('invite', code);
  return url.href;
}
export function parseInvite(value) {
  const raw = String(value || '').trim();
  try {
    return new URL(raw).searchParams.get('invite') || raw;
  } catch {
    return raw;
  }
}
