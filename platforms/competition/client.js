// Browser and native clients use the same server-issued identity and protocol.
globalThis.__installCompetition = (options) => {
  const root = globalThis;
  if (root.__competition) return;
  const config = options || root.__COMPETITION_CONFIG__ || {};
  const sdk =
    config.platform === 'bilibili'
      ? typeof bl !== 'undefined'
        ? bl
        : null
      : config.platform === 'wechat'
        ? typeof wx !== 'undefined'
          ? wx
          : null
        : null;
  const base = (config.apiUrl || '/api/competition/v1').replace(/\/$/, '');
  const teamRules = {
    'cops-robbers': { version: 'roles-initiative-duel-v2', modes: ['escape', 'survival'] },
    'cops-robbers-realtime': {
      version: 'street-roles-initiative-v2',
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
  const storageKey = `competition-session-v1:${sdk ? `${config.platform}:${config.appId}` : 'h5'}`;
  let credential, loggingIn;
  try {
    credential = JSON.parse(
      sdk ? sdk.getStorageSync(storageKey) || 'null' : localStorage.getItem(storageKey) || 'null',
    );
  } catch {
    /* Storage unavailable: this session lasts until page exit. */
  }
  const errors = {
    SESSION_EXPIRED: '登录已过期，请重新进入；当前对局不会冒用新身份。',
    PLATFORM_NOT_CONFIGURED: '此游戏的平台登录尚未配置。',
    PLATFORM_LOGIN_FAILED: '平台登录失败，请重新进入。',
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
  async function send(path, init = {}) {
    const headers = { 'content-type': 'application/json', ...(init.headers || {}) };
    if (credential?.token) headers.authorization = `Bearer ${credential.token}`;
    const method = init.method || (init.body ? 'POST' : 'GET');
    let status, data;
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
        data = await response.json();
      }
    } catch {
      const error = new Error('网络不可用，请重试；成绩尚未得到服务端确认。');
      error.code = 'SERVICE_UNAVAILABLE';
      throw error;
    }
    if (status < 200 || status >= 300) {
      const error = new Error(errors[data?.error] || `服务未接受请求 (${status})`);
      error.code = data?.error;
      throw error;
    }
    return data;
  }
  async function session() {
    if (credential?.expiresAt > Date.now() + 60000) return credential;
    if (loggingIn) return loggingIn;
    loggingIn = (async () => {
      if (sdk) {
        if (!config.appId || !config.platform)
          throw new Error('缺少本游戏 AppID，无法使用平台排位。');
        const login = await new Promise((resolve, reject) =>
          sdk.login({ success: resolve, fail: reject }),
        );
        credential = await send('/sessions/platform', {
          body: JSON.stringify({
            platform: config.platform,
            appId: config.appId,
            code: login.code,
          }),
        });
      } else credential = await send('/sessions/guest', { body: '{}' });
      try {
        if (sdk) sdk.setStorageSync(storageKey, JSON.stringify(credential));
        else localStorage.setItem(storageKey, JSON.stringify(credential));
      } catch {
        /* Do not claim cross-reload identity when browser storage is denied. */
      }
      return credential;
    })().finally(() => {
      loggingIn = null;
    });
    return loggingIn;
  }
  root.__competition = {
    session,
    async request(path, init) {
      await session();
      const roomRequest = path.startsWith('/rooms') && !path.endsWith('/leave');
      const game = config.game || (init?.body ? JSON.parse(init.body).game : undefined);
      if (roomRequest && teamRules[game] && !verifiedGames.has(game)) {
        verifyRules(game, await send('/boards/' + game), true);
      }
      const data = await send(path, init).catch((error) => {
        // An old ruleset has invalidated the room; both clients can discard local recovery.
        if (path.endsWith('/leave') && error.code === 'RULE_VERSION_CHANGED')
          return { obsolete: true };
        throw error;
      });
      if (path.startsWith('/boards/')) verifyRules(path.slice('/boards/'.length), data, true);
      if (roomRequest) verifyRules(data.game, data);
      return data;
    },
    config,
  };
};
