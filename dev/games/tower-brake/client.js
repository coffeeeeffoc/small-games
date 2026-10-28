// Classic script: browser and native producers embed the same authenticated identity client.
(() => {
  const root = globalThis;
  if (root.__createCompetitionIdentity) return;
  const authorities = new WeakMap();
  const providers = { wechat: 'wx', bilibili: 'bl', douyin: 'tt', kuaishou: 'ks', taptap: 'tap' };
  const error = (code) => Object.assign(new Error(code), { code });
  const ownerId = (value) => value?.userId || value?.playerId || null;
  root.__createCompetitionIdentity = ({ config, sdk, storage, request }) => {
    const provider = Object.hasOwn(providers, config.platform) ? config.platform : 'h5';
    const unsupported =
      config.platform &&
      !['h5', 'web-preview', ...Object.keys(providers)].includes(config.platform);
    const base = (config.apiUrl || '/api/competition/v1').replace(/\/$/, '');
    let endpoint = base;
    try {
      endpoint = new root.URL(base, root.location?.href).href.replace(/\/$/, '');
    } catch {}
    const authority = `${endpoint}|${provider}|${config.appId || ''}|${config.game || ''}`;
    const key = `competition-session-v3:${encodeURIComponent(authority)}`;
    const owner = storage || root;
    let shared = authorities.get(owner);
    if (!shared) authorities.set(owner, (shared = new Map()));
    if (shared.has(authority)) return shared.get(authority);
    let memory = null,
      lastRaw,
      seen = false,
      volatile = false,
      revision = 0,
      pending;
    const sameSession = (a, b) =>
      a?.sessionId && a.sessionId === b?.sessionId && ownerId(a) === ownerId(b);
    const shape = (value) =>
      ['guest', 'platform'].includes(value?.identityKind) &&
      value.game === config.game &&
      /^[a-f0-9-]{36}$/.test(value.sessionId || '') &&
      !!ownerId(value) &&
      /^[a-f0-9]{64}$/.test(value.token || '') &&
      /^[a-f0-9]{64}$/.test(value.refreshToken || '') &&
      Number.isFinite(value.expiresAt) &&
      Number.isFinite(value.refreshExpiresAt);
    const valid = (value, reserve = 0) => shape(value) && value.expiresAt > Date.now() + reserve;
    const get = () => (sdk ? sdk.getStorageSync(key) : storage?.getItem(key));
    const set = (value) => (sdk ? sdk.setStorageSync(key, value) : storage?.setItem(key, value));
    root.addEventListener?.('storage', (event) => {
      if (event.key === key || event.key === null) {
        seen = false;
        volatile = false;
      }
    });
    function read() {
      if (volatile || (!storage && !sdk)) return { credential: memory, revision };
      try {
        const raw = get() || null;
        if (!seen || raw !== lastRaw) {
          seen = true;
          lastRaw = raw;
          let next;
          try {
            next = JSON.parse(raw || 'null');
          } catch {
            next = null;
          }
          if (next?.apiAuthority !== authority || !shape(next)) next = null;
          if (!sameSession(memory, next) && (memory || next)) revision++;
          memory = next;
        }
      } catch {}
      return { credential: memory, revision };
    }
    function persist(value) {
      if (!sameSession(memory, value) && (memory || value)) revision++;
      memory = value ? { ...value, apiAuthority: authority } : null;
      lastRaw = memory ? JSON.stringify(memory) : null;
      seen = true;
      try {
        set(lastRaw || '');
        volatile = !storage && !sdk;
      } catch {
        volatile = true;
      }
      return memory;
    }
    function launch(task) {
      const running = task();
      pending = running;
      void running
        .finally(() => {
          if (pending === running) pending = null;
        })
        .catch(() => {});
      return running;
    }
    function accept(initial, credential, refreshing = false) {
      if (read().revision !== initial.revision) throw error('SESSION_CHANGED');
      if (!valid(credential)) throw error('SESSION_EXPIRED');
      if (refreshing && !sameSession(initial.credential, credential))
        throw error('SESSION_CHANGED');
      if (refreshing && memory.token !== initial.credential.token) {
        if (valid(memory)) return memory;
        throw error('SESSION_CHANGED');
      }
      if (refreshing && (memory.profileUpdatedAt || 0) > (credential.profileUpdatedAt || 0))
        for (const field of profileFields) credential[field] = memory[field];
      return persist(credential);
    }
    const profileFields = [
      'nickname',
      'name',
      'avatarId',
      'avatarUrl',
      'region',
      'profileSource',
      'profileUpdatedAt',
      'avatarPolicy',
    ];
    const result = {
      saved: () => read().credential,
      authority,
      storageKey: key,
      assertCurrent(credential) {
        if (!sameSession(read().credential, credential)) throw error('SESSION_CHANGED');
      },
      invalidate(credential, failure) {
        const latest = read().credential;
        if (failure?.code === 'SESSION_EXPIRED' && latest?.token === credential?.token)
          persist({ ...latest, expiresAt: 0 });
      },
      acceptProfile(profile, credential) {
        const latest = read().credential;
        result.assertCurrent(credential);
        if (ownerId(profile) !== ownerId(latest) || profile.game !== config.game)
          throw error('SESSION_CHANGED');
        if ((profile.profileUpdatedAt || 0) < (latest.profileUpdatedAt || 0)) return latest;
        const next = { ...latest };
        for (const field of profileFields) if (field in profile) next[field] = profile[field];
        return persist(next);
      },
      current(expectedOwner) {
        if (unsupported || (provider !== 'h5' && !sdk?.request))
          return Promise.reject(error('PLATFORM_LOGIN_UNAVAILABLE'));
        const initial = read(),
          saved = initial.credential;
        if (expectedOwner && !sameSession(saved, expectedOwner))
          return Promise.reject(error('SESSION_CHANGED'));
        if (pending) return pending;
        if (valid(saved, 60000)) return Promise.resolve(saved);
        return launch(async () => {
          try {
            const credential = saved?.refreshToken
              ? await request('/sessions/refresh', { refreshToken: saved.refreshToken }, null)
              : await request('/sessions/guest', { game: config.game }, null);
            return accept(initial, credential, !!saved?.refreshToken);
          } catch (failure) {
            const latest = read();
            if (
              latest.revision === initial.revision &&
              latest.credential?.token !== saved?.token &&
              valid(latest.credential)
            )
              return latest.credential;
            if (failure.code === 'REFRESH_EXPIRED' && latest.revision === initial.revision)
              persist(null);
            throw failure;
          }
        });
      },
      async logout() {
        const saved = read().credential;
        persist(null);
        revision++;
        pending = null;
        if (saved) await request('/sessions/logout', {}, saved);
      },
      async forOwner(credential) {
        result.assertCurrent(credential);
        const current = await result.current(credential);
        result.assertCurrent(credential);
        return current;
      },
      upgrade: async () => {
        throw error('IDENTITY_UPGRADE_NOT_ALLOWED');
      },
      canSyncProfile: () => !!(sdk?.getSetting && sdk?.getUserInfo),
      async syncProfile(expectedUserId) {
        if (!result.canSyncProfile()) throw error('PLATFORM_PROFILE_UNAVAILABLE');
        const credential = await result.current();
        if (expectedUserId && ownerId(credential) !== expectedUserId)
          throw error('SESSION_CHANGED');
        if (credential.identityKind !== 'platform') throw error('PLATFORM_PROFILE_UNAVAILABLE');
        const initial = read();
        if (
          initial.credential?.token !== credential.token ||
          ownerId(initial.credential) !== ownerId(credential)
        )
          throw error('SESSION_CHANGED');
        const call = (method, options) => {
          let timer;
          return new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(error('PLATFORM_PROFILE_UNAVAILABLE')), 8000);
            sdk[method]({
              ...options,
              success: (value) => {
                clearTimeout(timer);
                resolve(value);
              },
              fail: () => {
                clearTimeout(timer);
                reject(error('PLATFORM_PROFILE_UNAVAILABLE'));
              },
            });
          }).finally(() => clearTimeout(timer));
        };
        const setting = await call('getSetting', {});
        if (setting?.authSetting?.['scope.userInfo'] !== true)
          throw error('PLATFORM_PROFILE_NOT_AUTHORIZED');
        const { userInfo } = await call('getUserInfo', { withCredentials: false });
        if (!userInfo || typeof userInfo.nickName !== 'string')
          throw error('PLATFORM_PROFILE_UNAVAILABLE');
        if (read().revision !== initial.revision) throw error('SESSION_CHANGED');
        const region = {};
        if (typeof userInfo.country === 'string' && userInfo.country.trim())
          region.country = userInfo.country;
        if (typeof userInfo.province === 'string' && userInfo.province.trim())
          region.province = userInfo.province;
        let avatarUrl = '';
        try {
          const candidate = new root.URL(userInfo.avatarUrl);
          if (
            candidate.protocol === 'https:' &&
            !candidate.username &&
            !candidate.password &&
            !candidate.port &&
            !candidate.hash &&
            credential.avatarPolicy?.origins?.includes(candidate.origin) &&
            ![...candidate.searchParams.keys()].some((key) =>
              /token|secret|password|credential|session/i.test(key),
            )
          )
            avatarUrl = candidate.href;
        } catch {}
        const profile = await request(
          '/me',
          {
            nickname: userInfo.nickName,
            avatarUrl,
            region: Object.keys(region).length ? region : null,
            source: 'user-authorized',
          },
          credential,
        );
        if (read().revision !== initial.revision) throw error('SESSION_CHANGED');
        result.acceptProfile(profile, credential);
        return profile;
      },
    };
    shared.set(authority, result);
    return result;
  };
})();

// Browser and native clients use the same server-issued identity and protocol.
globalThis.__installCompetition = (options, nativeSdk) => {
  const root = globalThis;
  const config = options || root.__COMPETITION_CONFIG__ || {};
  if (root.__competition) {
    if (
      root.__competition.config?.game !== config.game ||
      root.__competition.config?.apiUrl !== config.apiUrl ||
      ['platform', 'appId', 'identityProvider'].some(
        (key) => root.__competition.config?.[key] !== config[key],
      )
    )
      throw Object.assign(new Error('IDENTITY_SCOPE_MISMATCH'), {
        code: 'IDENTITY_SCOPE_MISMATCH',
      });
    return;
  }
  const nativePlatforms = {
    wechat: 'wx',
    bilibili: 'bl',
    douyin: 'tt',
    kuaishou: 'ks',
    taptap: 'tap',
  };
  const native = Object.hasOwn(nativePlatforms, config.platform);
  const sdk = native ? nativeSdk || root[nativePlatforms[config.platform]] : null;
  if (native && !sdk) throw new Error(`缺少 ${config.platform} 原生 SDK，无法启动好友挑战。`);
  const base = (config.apiUrl || '/api/competition/v1').replace(/\/$/, '');
  // Bind a small, fixed diagnostic to the actual failed request. Never retain
  // request values, response bodies, raw exceptions or identity information.
  const connectionFailures = new WeakMap();
  const publicAddress = (value, originOnly = false) => {
    try {
      const url = new root.URL(value, root.location?.href);
      if (!['http:', 'https:'].includes(url.protocol)) return '不可用';
      return originOnly ? url.origin : url.origin + url.pathname;
    } catch {
      return '不可用';
    }
  };
  const rememberFailure = (error, phase, path, method, headers) => {
    connectionFailures.set(
      error,
      Object.freeze({
        pageOrigin: publicAddress(root.location?.href, true),
        apiBase: publicAddress(base),
        stage: (path.startsWith('/sessions/') ? 'session_' : 'request_') + phase,
        method: ['GET', 'POST', 'OPTIONS'].includes(method) ? method : 'OTHER',
        headerNames: Object.freeze([
          'content-type',
          ...(Object.hasOwn(headers, 'authorization') || Object.hasOwn(headers, 'Authorization')
            ? ['authorization']
            : []),
        ]),
      }),
    );
    return error;
  };
  const teamRules = {
    'cops-robbers': { version: 'roles-initiative-duel-v2', modes: ['escape', 'survival'] },
    'cops-robbers-realtime': {
      version: 'street-roles-initiative-v3',
      modes: ['classic', 'escape'],
    },
  };
  const verifiedGames = new Set();
  function verifyRules(game, data, board = false) {
    const expected = teamRules[game];
    if (!expected) return;
    if (
      data.version !== expected.version ||
      !Array.isArray(data.roles) ||
      !['pursuer', 'runner'].every((role) => data.roles.includes(role)) ||
      (board && !expected.modes.every((mode) => data.modes?.some((item) => item.id === mode)))
    ) {
      verifiedGames.delete(game);
      const error = new Error('好友服务正在更新，请稍后重试，单机仍可玩。');
      error.code = 'RULE_VERSION_CHANGED';
      throw error;
    }
    if (board) verifiedGames.add(game);
  }
  let auth, storage;
  try {
    storage = sdk || root.localStorage;
  } catch {}
  const errors = {
    LOGIN_REQUIRED: '联网身份暂不可用，请稍后重试。',
    IDENTITY_EXPIRED: '此入口的身份已过期，请重新进入。',
    IDENTITY_SCOPE_MISMATCH: '此凭证仅用于对应游戏，请从原入口进入。',
    IDENTITY_MODE_UNSUPPORTED: '联网服务正在更新，请稍后重试。',
    SESSION_EXPIRED: '连接凭证已过期，请重试以自动续期。',
    REFRESH_EXPIRED: '本机身份已失效，再次进入联网功能会建立新身份。',
    SESSION_CHANGED: '玩家身份已变化，请返回主页重新进入。',
    IDENTITY_MIGRATION_REQUIRED: '检测到旧账号，请从原服务入口恢复；不会自动换号或转移成绩。',
    IDENTITY_ALREADY_BOUND: '此平台账号已有身份，无法自动合并游客成绩。',
    IDENTITY_UPGRADE_NOT_ALLOWED: '当前账号不能自动绑定另一个平台身份。',
    PLATFORM_PROFILE_UNAVAILABLE: '平台资料暂不可用，现有头像昵称继续使用。',
    PLATFORM_PROFILE_NOT_AUTHORIZED: '尚未授权平台资料，现有头像昵称继续使用。',
    PLATFORM_NOT_CONFIGURED: '此游戏的平台登录尚未配置。',
    PLATFORM_LOGIN_FAILED: '平台登录失败，请重新进入。',
    PLATFORM_LOGIN_UNAVAILABLE: '此平台的好友挑战暂不可用，请稍后再试。',
    ROOM_FULL: '房间已满。',
    INVITATION_EXPIRED: '邀请已过期或比赛已开始。',
    INVITATION_NOT_FOUND: '找不到这个邀请，请核对房间码。',
    NOT_A_MEMBER: '你不是此房间的参赛者。',
    MATCH_CLOSED: '本局已结束。',
    ILLEGAL_ACTION: '此操作不符合当前规则，请刷新局面。',
    SEQUENCE_CONFLICT: '操作顺序已变化，请重试。',
    WRONG_GAME: '这个房间属于另一款游戏，尚未加入。',
    INVALID_ROLE: '请选择本游戏支持的角色。',
    INVALID_MODE: '请选择本游戏支持的对战模式。',
    RULE_VERSION_CHANGED: '游戏规则已更新，请退出旧房间后重新开局。',
    HOST_ONLY: '开局顺序由房主设置，双方确认后准备。',
    INVALID_INPUT: '请检查输入；昵称为 2–16 个中英文字、数字、空格或 · _ -。',
    RATE_LIMITED: '操作过于频繁，请稍后重试。',
    SERVICE_UNAVAILABLE: '全站服务暂不可用，当前结果尚未确认。',
  };
  async function send(path, init = {}, credential = auth?.saved()) {
    const headers = { 'content-type': 'application/json', ...(init.headers || {}) };
    if (credential?.token) headers.authorization = `Bearer ${credential.token}`;
    const method = init.method || (init.body ? 'POST' : 'GET');
    let status,
      data,
      phase = 'transport';
    try {
      if (sdk) {
        const response = await new Promise((resolve, reject) =>
          sdk.request({
            url: base + path,
            method,
            header: headers,
            data: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
            timeout: 8000,
            success: resolve,
            fail: reject,
          }),
        );
        status = response.statusCode;
        data = response.data;
      } else {
        const response = await fetch(base + path, {
          ...init,
          method,
          headers,
          credentials: 'omit',
          redirect: 'error',
          signal: AbortSignal.timeout(8000),
        });
        status = response.status;
        phase = 'response';
        data = await response.json();
      }
    } catch {
      const error = new Error('网络不可用，请重试；成绩尚未得到服务端确认。');
      error.code = 'SERVICE_UNAVAILABLE';
      throw rememberFailure(error, phase, path, method, headers);
    }
    if (status < 200 || status >= 300) {
      const error = new Error(errors[data?.error] || `服务未接受请求 (${status})`);
      error.code = data?.error;
      throw rememberFailure(error, 'http', path, method, headers);
    }
    return data;
  }
  auth = root.__createCompetitionIdentity({
    config,
    sdk,
    storage,
    request: (path, body, owner) =>
      send(path, body === undefined ? {} : { body: JSON.stringify(body) }, owner),
  });
  const localized = (error) => {
    if (errors[error.code]) error.message = errors[error.code];
    throw error;
  };
  const session = () => auth.current().catch(localized);
  const roomOwners = new Map();
  root.__competition = {
    identityMode: 'persistent',
    roomStorage: null,
    async logout() {
      roomOwners.clear();
      verifiedGames.clear();
      try {
        storage?.removeItem?.(`competition-room:${config.game}`);
      } catch {}
      await auth.logout();
    },
    connectionInfo: (error) => connectionFailures.get(error) || null,
    session,
    upgrade: (input) => auth.upgrade(input).catch(localized),
    canSyncProfile: () => auth.canSyncProfile(),
    syncProfile: (expectedUserId) => auth.syncProfile(expectedUserId).catch(localized),
    get avatarPolicy() {
      return auth.saved()?.avatarPolicy;
    },
    async request(path, init, expectedUserId) {
      const current = await session();
      const assertCurrentOwner = (owner) => {
        auth.assertCurrent(owner);
        if (!expectedUserId) return;
        const latest = auth.saved();
        if (
          (owner.userId || owner.playerId) !== expectedUserId ||
          (latest?.userId || latest?.playerId) !== expectedUserId ||
          latest.token !== owner.token
        ) {
          const error = new Error(errors.SESSION_CHANGED);
          error.code = 'SESSION_CHANGED';
          throw error;
        }
      };
      assertCurrentOwner(current);
      const code = path.match(/^\/rooms\/([A-F0-9]{12})(?:\/|$)/)?.[1];
      const owner =
        code && roomOwners.has(code) ? await auth.forOwner(roomOwners.get(code)) : current;
      const roomRequest = path.startsWith('/rooms') && !path.endsWith('/leave');
      const game = config.game || (init?.body ? JSON.parse(init.body).game : undefined);
      if (roomRequest && teamRules[game] && !verifiedGames.has(game)) {
        const board = await send('/boards/' + game, {}, owner).catch((error) => {
          auth.invalidate(owner, error);
          throw error;
        });
        assertCurrentOwner(owner);
        verifyRules(game, board, true);
      }
      assertCurrentOwner(owner);
      const data = await send(path, init, owner).catch((error) => {
        auth.invalidate(owner, error);
        // An old ruleset has invalidated the room; both clients can discard local recovery.
        if (path.endsWith('/leave') && error.code === 'RULE_VERSION_CHANGED')
          return { obsolete: true };
        throw error;
      });
      assertCurrentOwner(owner);
      if (path.startsWith('/boards/')) verifyRules(path.slice('/boards/'.length), data, true);
      if (roomRequest) verifyRules(data.game, data);
      if (data.code && Array.isArray(data.players)) {
        roomOwners.set(data.code, owner);
        while (roomOwners.size > 8) roomOwners.delete(roomOwners.keys().next().value);
      }
      if (code && path.endsWith('/leave')) roomOwners.delete(code);
      if (path === '/me' && data.userId) {
        const accepted = auth.acceptProfile(data, owner);
        for (const field of [
          'nickname',
          'name',
          'avatarUrl',
          'region',
          'profileSource',
          'profileUpdatedAt',
        ])
          data[field] = accepted[field];
      }
      return data;
    },
    config,
  };
};
