globalThis.__COMPETITION_CONFIG__ = Object.assign({"platform":"h5","appId":"","apiUrl":""}, globalThis.__COMPETITION_CONFIG__ || {});
// Keep this file classic-script compatible: several native producers embed it verbatim.
// Both competition clients share one authority even when this source is loaded twice.
(() => {
  const root = globalThis;
  if (root.__createCompetitionIdentity) return;
  const authorities = new WeakMap();
  const providers = { wechat: 'wx', bilibili: 'bl', douyin: 'tt', kuaishou: 'ks', taptap: 'tap' };
  const error = (code) => Object.assign(new Error(code), { code });
  const valid = (value, reserve = 0) =>
    typeof value?.token === 'string' &&
    value.token.length > 0 &&
    Number.isFinite(value.expiresAt) &&
    value.expiresAt > Date.now() + reserve;
  const ownerId = (value) => value?.userId || value?.playerId || null;
  root.__createCompetitionIdentity = ({ config, sdk, storage, request }) => {
    const ephemeral = config.identityMode === 'ephemeral';
    if (config.identityMode !== undefined && !ephemeral) throw error('IDENTITY_MODE_UNSUPPORTED');
    if (
      ephemeral &&
      (!['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'].includes(config.game) ||
        ![undefined, 'h5', 'web-preview'].includes(config.platform))
    )
      throw error('IDENTITY_MODE_UNSUPPORTED');
    const unsupported =
      config.platform &&
      !['h5', 'web-preview', ...Object.keys(providers)].includes(config.platform);
    const provider =
      Object.hasOwn(providers, config.platform) || unsupported ? config.platform : 'h5';
    const base = (config.apiUrl || '/api/competition/v1').replace(/\/$/, '');
    let endpoint = base;
    try {
      endpoint = new root.URL(base, root.location?.href).href.replace(/\/$/, '');
    } catch {}
    // These two reviewed HTTPS routes reach the same service; keep existing scoped identities.
    if (endpoint === 'https://api.nenggongzhiren.cn/small-games/v1')
      endpoint = 'https://api.nenggongzhiren.cn/api/competition/v1';
    const authority = `${endpoint}|${provider}|${provider === 'h5' ? '' : config.appId || ''}${ephemeral ? '|ephemeral:' + config.game : ''}`;
    const key = `competition-session-v2:${encodeURIComponent(authority)}`;
    const installationKey = `competition-installation-v1:${encodeURIComponent(endpoint)}`;
    const legacyKey = `competition-session-v1:${provider === 'h5' ? 'h5' : `${provider}:${config.appId}`}`;
    const owner = ephemeral ? root : storage || root;
    let shared = authorities.get(owner);
    if (!shared) authorities.set(owner, (shared = new Map()));
    if (shared.has(authority)) return shared.get(authority);
    let memory = null,
      lastRaw,
      seen = false,
      memoryOnly = false,
      revision = 0,
      pending;
    let legacyTried = false,
      legacyActive = false,
      legacyBlocked = false,
      installation,
      modeRejected = false;
    const renewalReserve = (credential) =>
      ephemeral && credential?.identityExpiresAt - Date.now() <= 60000 ? 0 : 60000;
    const get = (name) => (sdk ? sdk.getStorageSync(name) : storage?.getItem(name));
    const set = (name, value) =>
      sdk ? sdk.setStorageSync(name, value) : storage?.setItem(name, value);
    if (!ephemeral)
      root.addEventListener?.('storage', (event) => {
        if (event.key === key || event.key === null || (legacyActive && event.key === legacyKey)) {
          revision++;
          memoryOnly = false;
          memory = null;
          seen = false;
          legacyTried = true;
          legacyActive = false;
        }
      });
    function read() {
      if (ephemeral) return { credential: memory, revision, readable: true };
      let raw;
      try {
        raw = get(key) || null;
      } catch {
        return { credential: memory, revision, readable: false };
      }
      if (!seen || raw !== lastRaw) {
        seen = true;
        lastRaw = raw;
        revision++;
        memoryOnly = false;
        memory = null;
        try {
          memory = JSON.parse(raw || 'null');
        } catch {}
        if (memory?.apiAuthority && memory.apiAuthority !== authority) memory = null;
      }
      if (!raw && !legacyTried) {
        legacyTried = true;
        try {
          const candidate = JSON.parse(get(legacyKey) || 'null');
          const sameOrigin =
            root.location?.href &&
            endpoint === new root.URL('/api/competition/v1', root.location.href).href;
          // Old records have no API scope. Never offer their bearer to a new foreign API.
          if (valid(candidate) && (sameOrigin || candidate.apiAuthority === authority)) {
            memory = candidate;
            memoryOnly = true;
            legacyActive = true;
          } else if (candidate?.token && provider === 'h5') legacyBlocked = true;
        } catch {}
      }
      if (
        !memoryOnly &&
        memory &&
        (typeof memory.token !== 'string' || !Number.isFinite(memory.expiresAt))
      )
        memory = null;
      return { credential: memory, revision, readable: true };
    }
    function persist(credential) {
      memory = { ...credential, apiAuthority: authority };
      legacyActive = false;
      memoryOnly = true;
      const encoded = JSON.stringify(memory);
      try {
        if (!ephemeral && storage) {
          set(key, encoded);
          lastRaw = encoded;
          seen = true;
          memoryOnly = false;
        }
      } catch {
        /* Storage denial leaves this page's server identity usable. */
      }
      revision++;
      return memory;
    }
    function installationId() {
      if (installation) return installation;
      try {
        installation = get(installationKey);
      } catch {}
      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
          installation || '',
        )
      ) {
        installation = root.crypto?.randomUUID?.();
        if (installation)
          try {
            if (storage) set(installationKey, installation);
          } catch {}
      }
      return installation;
    }
    async function loginCode(platform, appId, suppliedSdk) {
      const platformSdk = suppliedSdk || root[providers[platform]];
      if (!Object.hasOwn(providers, platform) || !appId || !platformSdk?.login)
        throw error('PLATFORM_LOGIN_UNAVAILABLE');
      let timer;
      const login = await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(error('PLATFORM_LOGIN_FAILED')), 8000);
        platformSdk.login({ success: resolve, fail: () => reject(error('PLATFORM_LOGIN_FAILED')) });
      }).finally(() => clearTimeout(timer));
      if (typeof login?.code !== 'string' || !login.code) throw error('PLATFORM_LOGIN_FAILED');
      return login.code;
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
    function unchanged(initial, credential) {
      if (ephemeral) {
        if (
          credential?.identityMode !== 'ephemeral' ||
          credential.game !== config.game ||
          credential.identityKind !== 'guest' ||
          !Number.isFinite(credential.identityExpiresAt) ||
          credential.identityExpiresAt <= Date.now() ||
          !Number.isFinite(credential.refreshExpiresAt) ||
          credential.refreshExpiresAt > credential.identityExpiresAt ||
          credential.expiresAt > credential.identityExpiresAt ||
          credential.expiresAt > Date.now() + 15 * 60_000 + 1000
        ) {
          modeRejected = true;
          throw error('IDENTITY_MODE_UNSUPPORTED');
        }
        if (
          initial.credential &&
          initial.credential.identityExpiresAt !== credential.identityExpiresAt
        )
          throw error('SESSION_CHANGED');
      }
      const latest = read();
      if (latest.revision !== initial.revision) {
        if (valid(latest.credential, renewalReserve(latest.credential))) return latest.credential;
        throw error('SESSION_CHANGED');
      }
      if (!valid(credential, renewalReserve(credential))) throw error('SESSION_EXPIRED');
      if (ownerId(initial.credential) && ownerId(credential) !== ownerId(initial.credential))
        throw error('SESSION_CHANGED');
      return persist(credential);
    }
    const result = {
      saved: () => read().credential,
      authority,
      storageKey: key,
      acceptProfile(profile, credential) {
        if (
          ephemeral &&
          (profile.identityMode !== 'ephemeral' ||
            profile.game !== config.game ||
            profile.identityExpiresAt !== credential.identityExpiresAt)
        )
          throw error('IDENTITY_MODE_UNSUPPORTED');
        const latest = read().credential;
        if (
          !ownerId(latest) ||
          ownerId(latest) !== ownerId(credential) ||
          ownerId(profile) !== ownerId(latest)
        )
          throw error('SESSION_CHANGED');
        return persist({ ...latest, ...profile });
      },
      current() {
        if (modeRejected) return Promise.reject(error('IDENTITY_MODE_UNSUPPORTED'));
        if (unsupported) return Promise.reject(error('PLATFORM_LOGIN_UNAVAILABLE'));
        if (provider !== 'h5' && (!sdk?.login || !sdk?.request || !config.appId))
          return Promise.reject(error('PLATFORM_LOGIN_UNAVAILABLE'));
        if (pending) return pending;
        const initial = read();
        if (ephemeral && initial.credential?.identityExpiresAt <= Date.now())
          return Promise.reject(error('IDENTITY_EXPIRED'));
        if (legacyBlocked && !initial.credential)
          return Promise.reject(error('IDENTITY_MIGRATION_REQUIRED'));
        if (valid(initial.credential, renewalReserve(initial.credential)) && !legacyActive)
          return Promise.resolve(initial.credential);
        return launch(async () => {
          let credential = initial.credential;
          if (legacyActive) {
            const profile = await request('/me', undefined, credential);
            if (
              !ownerId(profile) ||
              (ownerId(credential) && ownerId(credential) !== ownerId(profile))
            )
              throw error('SESSION_CHANGED');
            credential = { ...credential, ...profile };
          }
          if (credential?.refreshToken) {
            credential = await request(
              '/sessions/refresh',
              { refreshToken: credential.refreshToken },
              null,
            );
          } else if (
            credential &&
            valid(credential) &&
            (credential.identityKind === 'guest' ||
              (provider === 'h5' && credential.identityKind !== 'platform'))
          ) {
            credential = await request('/sessions/refresh', {}, credential);
          } else if (provider !== 'h5') {
            const code = await loginCode(provider, config.appId, sdk);
            credential = await request(
              '/sessions/platform',
              { platform: provider, appId: config.appId, code },
              null,
            );
          } else if (credential) {
            throw error('SESSION_EXPIRED');
          } else {
            const id = ephemeral ? undefined : installationId();
            credential = await request(
              '/sessions/guest',
              {
                identityVersion: 2,
                ...(ephemeral
                  ? { identityMode: 'ephemeral', game: config.game }
                  : id
                    ? { installationId: id }
                    : {}),
              },
              null,
            );
          }
          return unchanged(initial, credential);
        });
      },
      async forOwner(credential) {
        if (ephemeral && credential?.identityExpiresAt <= Date.now())
          throw error('IDENTITY_EXPIRED');
        const latest = read().credential;
        if (ownerId(credential) && ownerId(latest) === ownerId(credential)) {
          const renewed = await result.current();
          if (ownerId(renewed) !== ownerId(credential)) throw error('SESSION_CHANGED');
          return renewed;
        }
        return credential;
      },
      async upgrade({ platform, appId, code, sdk: platformSdk } = {}) {
        if (ephemeral) throw error('IDENTITY_UPGRADE_NOT_ALLOWED');
        if (pending) await pending;
        const credential = await result.current();
        if (pending) throw error('SESSION_CHANGED');
        if (credential.identityKind !== 'guest') throw error('IDENTITY_UPGRADE_NOT_ALLOWED');
        const initial = read();
        if (
          initial.credential?.token !== credential.token ||
          ownerId(initial.credential) !== ownerId(credential)
        )
          throw error('SESSION_CHANGED');
        return launch(async () => {
          const verifiedCode = code || (await loginCode(platform, appId, platformSdk));
          if (read().revision !== initial.revision) throw error('SESSION_CHANGED');
          const upgraded = await request(
            '/sessions/upgrade',
            { platform, appId, code: verifiedCode },
            credential,
          );
          const latest = read();
          if (latest.revision !== initial.revision) throw error('SESSION_CHANGED');
          if (upgraded.identityKind !== 'platform' || ownerId(upgraded) !== ownerId(credential))
            throw error('SESSION_CHANGED');
          return unchanged(initial, upgraded);
        });
      },
      canSyncProfile: () => !ephemeral && !!(sdk?.getSetting && sdk?.getUserInfo),
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
      config.identityMode === 'ephemeral' &&
      (root.__competition.identityMode !== 'ephemeral' ||
        root.__competition.config?.game !== config.game ||
        root.__competition.config?.apiUrl !== config.apiUrl)
    )
      throw Object.assign(new Error('IDENTITY_MODE_UNSUPPORTED'), {
        code: 'IDENTITY_MODE_UNSUPPORTED',
      });
    return;
  }
  const ephemeral = config.identityMode === 'ephemeral';
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
    if (config.identityMode === undefined) storage = sdk || root.localStorage;
  } catch {}
  const errors = {
    IDENTITY_EXPIRED: '本页临时身份已到期，请重新打开游戏开始新的临时身份；原成绩不会转移。',
    IDENTITY_SCOPE_MISMATCH: '此临时身份仅用于当前游戏，无法访问其他游戏资源。',
    IDENTITY_MODE_UNSUPPORTED: '服务尚不支持临时身份，请等待服务更新后重新打开游戏。',
    SESSION_EXPIRED: '登录已过期，请重新进入；当前对局不会冒用新身份。',
    REFRESH_EXPIRED: '匿名登录已过期，请重新进入；旧成绩不会转移给新身份。',
    SESSION_CHANGED: '账号已变化，请返回主页重新进入。',
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
  const pageRooms = new Map();
  root.__competition = {
    identityMode: ephemeral ? 'ephemeral' : 'persistent',
    roomStorage: ephemeral
      ? {
          getItem: (key) => pageRooms.get(key) ?? null,
          setItem: (key, value) => pageRooms.set(key, String(value)),
          removeItem: (key) => pageRooms.delete(key),
        }
      : null,
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
        verifyRules(game, await send('/boards/' + game, {}, owner), true);
      }
      assertCurrentOwner(owner);
      const data = await send(path, init, owner).catch((error) => {
        // An old ruleset has invalidated the room; both clients can discard local recovery.
        if (path.endsWith('/leave') && error.code === 'RULE_VERSION_CHANGED')
          return { obsolete: true };
        throw error;
      });
      if (path.startsWith('/boards/')) verifyRules(path.slice('/boards/'.length), data, true);
      if (roomRequest) verifyRules(data.game, data);
      if (data.code && Array.isArray(data.players)) {
        roomOwners.set(data.code, owner);
        while (roomOwners.size > 8) roomOwners.delete(roomOwners.keys().next().value);
      }
      if (code && path.endsWith('/leave')) roomOwners.delete(code);
      if (path === '/me' && data.userId) auth.acceptProfile(data, owner);
      return data;
    },
    config,
  };
};

globalThis.__installCompetition(globalThis.__COMPETITION_CONFIG__);
