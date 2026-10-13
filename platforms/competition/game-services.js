// Game-scoped services reuse the existing competition identity, without renewing a run's owner.
const nativeNames = { wechat: 'wx', bilibili: 'bl', douyin: 'tt', kuaishou: 'ks', taptap: 'tap' };
const failure = (code, message = '排行榜暂不可用，本地挑战仍可继续。') =>
  Object.assign(new Error(message), { code });

// Shared by factories using the same authority/storage, including concurrent game entries.
const credentialAuthorities = new WeakMap();
const validCredential = (value, reserve = 0) =>
  typeof value?.token === 'string' &&
  value.token.length > 0 &&
  Number.isFinite(value.expiresAt) &&
  value.expiresAt > Date.now() + reserve;
function credentialAuthority(storage, key, authority, sdk, config, request) {
  const owner = storage || globalThis;
  let authorities = credentialAuthorities.get(owner);
  if (!authorities) credentialAuthorities.set(owner, (authorities = new Map()));
  if (authorities.has(authority)) return authorities.get(authority);
  let memory = null,
    lastRaw,
    seen = false,
    memoryOnly = false,
    revision = 0,
    pending;
  globalThis.addEventListener?.('storage', (event) => {
    if (event.key === key || event.key === null) revision++;
  });
  function read() {
    let raw;
    try {
      raw = (sdk ? sdk.getStorageSync(key) : storage.getItem(key)) || null;
    } catch {
      return { credential: validCredential(memory) ? memory : null, revision, readable: false };
    }
    if (!seen || raw !== lastRaw) {
      seen = true;
      lastRaw = raw;
      revision++;
      memoryOnly = false;
      memory = null;
      try {
        memory = JSON.parse(raw || 'null');
      } catch {
        /* An explicit invalid value is not an IO failure. */
      }
    }
    if (!memoryOnly && !validCredential(memory)) memory = null;
    return { credential: validCredential(memory) ? memory : null, revision, readable: true };
  }
  async function issue() {
    if (config.platform && config.platform !== 'h5') {
      if (!sdk?.login || !config.appId) throw failure('PLATFORM_LOGIN_UNAVAILABLE');
      let timer;
      const login = await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(failure('PLATFORM_LOGIN_FAILED')), 8000);
        sdk.login({ success: resolve, fail: () => reject(failure('PLATFORM_LOGIN_FAILED')) });
      }).finally(() => clearTimeout(timer));
      if (typeof login?.code !== 'string' || !login.code) throw failure('PLATFORM_LOGIN_FAILED');
      return request(
        '/sessions/platform',
        { platform: config.platform, appId: config.appId, code: login.code },
        null,
      );
    }
    return request('/sessions/guest', {}, null);
  }
  const result = {
    saved: () => read().credential,
    current() {
      if (
        config.platform &&
        config.platform !== 'h5' &&
        (!nativeNames[config.platform] || !sdk?.login || !sdk?.request || !config.appId)
      )
        return Promise.reject(failure('PLATFORM_LOGIN_UNAVAILABLE'));
      const initial = read();
      if (validCredential(initial.credential, 60000))
        return Promise.resolve({ ...initial.credential });
      if (pending) return pending;
      pending = (async () => {
        const credential = await issue();
        if (!validCredential(credential, 60000)) throw failure('SESSION_EXPIRED');
        const latest = read();
        if (latest.revision !== initial.revision) {
          if (validCredential(latest.credential, 60000)) return { ...latest.credential };
          throw failure('SESSION_CHANGED');
        }
        // Never let an old login response overwrite a different observed account.
        memory = { ...credential };
        memoryOnly = true;
        const encoded = JSON.stringify(credential);
        try {
          if (sdk) sdk.setStorageSync(key, encoded);
          else storage.setItem(key, encoded);
          lastRaw = encoded;
          seen = true;
          memoryOnly = false;
          revision++;
        } catch {
          /* Keep this page's identity until a readable storage value changes. */
        }
        return { ...credential };
      })().finally(() => {
        pending = null;
      });
      return pending;
    },
  };
  authorities.set(authority, result);
  return result;
}

export function createGameServices({ gameId, ruleVersion }) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/.test(gameId)) throw failure('INVALID_GAME');
  const config = globalThis.__COMPETITION_CONFIG__ || {};
  const sdk = globalThis[nativeNames[config.platform]];
  const base = (config.apiUrl || '/api/competition/v1').replace(/\/$/, '');
  const path = '/games/' + encodeURIComponent(gameId);
  const owners = new Map(),
    roomOwners = new Map();
  const storageKey = `competition-session-v1:${config.platform && config.platform !== 'h5' ? `${config.platform}:${config.appId}` : 'h5'}`;
  let storage;
  try {
    storage = sdk || globalThis.localStorage;
  } catch {
    /* Memory-only identity. */
  }
  const auth = credentialAuthority(
    storage,
    storageKey,
    `${base}:${config.platform || 'h5'}:${config.appId || ''}`,
    sdk,
    config,
    request,
  );
  async function request(url, body, owner = auth.saved()) {
    const headers = { 'content-type': 'application/json' };
    if (owner?.token) headers.authorization = 'Bearer ' + owner.token;
    let response;
    try {
      if (sdk) {
        const result = await new Promise((resolve, reject) =>
          sdk.request({
            url: base + url,
            method: body === undefined ? 'GET' : 'POST',
            header: headers,
            data: body,
            timeout: 8000,
            success: resolve,
            fail: reject,
          }),
        );
        response = { status: result.statusCode, data: result.data };
      } else {
        const result = await fetch(base + url, {
          method: body === undefined ? 'GET' : 'POST',
          headers,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          credentials: 'omit',
          redirect: 'error',
          signal: AbortSignal.timeout(8000),
        });
        response = { status: result.status, data: await result.json() };
      }
    } catch {
      throw failure('SERVICE_UNAVAILABLE');
    }
    if (response.status < 200 || response.status >= 300)
      throw failure(response.data?.error || 'SERVICE_UNAVAILABLE');
    return response.data;
  }
  function owner(id) {
    const value = owners.get(id);
    if (!value) throw failure('SESSION_EXPIRED');
    return value;
  }
  function rememberRoom(code, credential) {
    if (!code) return;
    roomOwners.set(code, { ...credential });
    while (roomOwners.size > 8) roomOwners.delete(roomOwners.keys().next().value);
  }
  async function roomRequest(code, operation, body) {
    const credential = roomOwners.get(code) || (await auth.current());
    const data = await request(
      `${path}/rooms/${encodeURIComponent(code)}${operation ? '/' + operation : ''}`,
      body,
      credential,
    );
    if (operation === 'leave') roomOwners.delete(code);
    else rememberRoom(code, credential);
    if (operation === 'rematch') rememberRoom(data.rematch, credential);
    return data;
  }
  async function openRoom(operation, body) {
    const credential =
      (operation === '/join' && roomOwners.get(body.code)) || (await auth.current());
    const room = await request(path + '/rooms' + operation, body, credential);
    rememberRoom(room.code, credential);
    return room;
  }
  return {
    metadata: () => request(path),
    createRoom: (input = {}) => openRoom('', input),
    joinRoom: ({ code }) => openRoom('/join', { code }),
    getRoom: ({ code }) => roomRequest(code, '', undefined),
    roomAction({ code, operation, body = {} }) {
      if (!['ready', 'leave', 'rematch', 'actions', 'role', 'initiative'].includes(operation))
        return Promise.reject(failure('INVALID_OPERATION'));
      return roomRequest(code, operation, body);
    },
    identity: async () => (await request(path)).identity,
    listBoards: async () => (await request(path)).boards,
    leaderboard: ({ boardId }) => request(path + '/leaderboards/' + encodeURIComponent(boardId)),
    async startRun({ mode, levelId }) {
      if (typeof ruleVersion !== 'string' || !ruleVersion) throw failure('RULE_VERSION_CHANGED');
      const credential = await auth.current();
      const run = await request(
        path + '/runs',
        { board: mode, version: ruleVersion, ...(levelId ? { levelId } : {}) },
        credential,
      );
      if (run?.version !== ruleVersion) throw failure('RULE_VERSION_CHANGED');
      owners.set(run.id, { ...credential });
      while (owners.size > 4) owners.delete(owners.keys().next().value);
      return run;
    },
    appendFrames: ({ runId, seq, frames }) =>
      request(`${path}/runs/${encodeURIComponent(runId)}/actions`, { seq, frames }, owner(runId)),
    finishRun: ({ runId, seq }) =>
      request(`${path}/runs/${encodeURIComponent(runId)}/finish`, { seq }, owner(runId)),
    discardRun(id) {
      owners.delete(id);
    },
  };
}

/** Bounded live journal: acknowledged input is discarded; each retry keeps its original sequence. */
export function createRunRecorder(services, { onStatus = () => {}, startTimeoutMs = 1500 } = {}) {
  let generation = 0,
    active = null,
    status = 'local';
  const draining = new Set();
  const report = (value) => {
    status = value;
    onStatus(value);
  };
  const current = (run) => active === run && run.generation === generation;
  const live = (run) => current(run) || draining.has(run);
  function clear(run) {
    run.frames = [];
    run.bufferTicks = 0;
    run.bufferFrames = 0;
    services.discardRun?.(run.id);
    draining.delete(run);
  }
  function invalidate(reason = 'local') {
    generation++;
    if (active?.finishing && !active.settled) {
      draining.add(active);
      if (draining.size > 2) clear(draining.values().next().value);
    } else if (active) clear(active);
    active = null;
    report(reason === 'practice' ? 'practice' : 'local');
  }
  function unavailable(run) {
    if (!live(run)) return;
    const visible = current(run);
    clear(run);
    if (visible) {
      active = null;
      report('unavailable');
    }
  }
  async function retry(operation) {
    try {
      return await operation();
    } catch (error) {
      if (!['SERVICE_UNAVAILABLE', 'RATE_LIMITED'].includes(error.code)) throw error;
      return operation();
    }
  }
  function flush(run) {
    if (run.inflight) return run.inflight;
    if (!live(run) || !run.frames.length) return Promise.resolve();
    const frames = [];
    let ticks = 0;
    while (run.frames.length && frames.length < 500 && ticks + run.frames[0].ticks <= 2400) {
      const frame = run.frames.shift();
      frames.push(frame);
      ticks += frame.ticks;
    }
    const seq = run.seq + 1;
    run.inflight = (async () => {
      try {
        await retry(() => services.appendFrames({ runId: run.id, seq, frames }));
        if (!live(run)) return;
        run.seq = seq;
        run.bufferTicks -= ticks;
        run.bufferFrames -= frames.length;
      } catch {
        unavailable(run);
      }
    })().finally(() => {
      run.inflight = null;
      if (current(run) && !run.finishing && (run.bufferTicks >= 600 || run.bufferFrames >= 500))
        void flush(run);
    });
    return run.inflight;
  }
  return {
    get status() {
      return status;
    },
    async start({ mode, levelId, practice = false }) {
      invalidate(practice ? 'practice' : 'local');
      if (practice) return null;
      const ownGeneration = generation;
      report('connecting');
      let timer,
        expired = false,
        failureStatus = 'unavailable';
      const pending = Promise.resolve()
        .then(() => services.startRun({ mode, levelId }))
        .then((run) => {
          if (expired || ownGeneration !== generation) {
            services.discardRun?.(run?.id);
            return null;
          }
          return run;
        })
        .catch((error) => {
          // Pre-handshake servers reject the version field through their strict input schema.
          if (['RULE_VERSION_CHANGED', 'INVALID_INPUT'].includes(error?.code))
            failureStatus = 'update-required';
          return null;
        });
      const run = await Promise.race([
        pending,
        new Promise((resolve) => {
          timer = setTimeout(() => {
            expired = true;
            resolve(null);
          }, startTimeoutMs);
        }),
      ]);
      clearTimeout(timer);
      if (ownGeneration !== generation) return null;
      if (!run) {
        report(failureStatus);
        return null;
      }
      active = {
        ...run,
        generation,
        frames: [],
        bufferTicks: 0,
        bufferFrames: 0,
        seq: run.seq || 0,
        inflight: null,
        finishing: false,
        completion: null,
      };
      report('recording');
      return run;
    },
    record(input, ticks = 1) {
      const run = active;
      if (!run || run.finishing) return;
      if (!Number.isInteger(ticks) || ticks < 0 || ticks > 600) {
        unavailable(run);
        return;
      }
      const encoded = JSON.stringify(input);
      const previous = run.frames.at(-1);
      // Discrete operations must never be coalesced: rotation/brake/launch apply exactly once.
      if (
        ticks > 0 &&
        previous &&
        !('rotation' in input || 'brake' in input || 'launch' in input) &&
        previous.ticks + ticks <= 600 &&
        JSON.stringify(previous.input) === encoded
      )
        previous.ticks += ticks;
      else {
        run.frames.push({ ticks, input: JSON.parse(encoded) });
        run.bufferFrames++;
      }
      run.bufferTicks += ticks;
      if (run.bufferTicks > 4800 || run.bufferFrames > 2400) {
        unavailable(run);
        return;
      }
      if (run.bufferTicks >= 600 || run.bufferFrames >= 500) void flush(run);
    },
    finish() {
      const run = active;
      if (!run) return Promise.resolve(null);
      if (run.completion) return run.completion;
      run.finishing = true;
      report('syncing');
      run.completion = (async () => {
        while (live(run) && (run.inflight || run.frames.length)) await flush(run);
        if (!live(run)) return null;
        try {
          const result = await retry(() => services.finishRun({ runId: run.id, seq: run.seq }));
          if (!live(run)) return null;
          if (current(run)) report(result.accepted ? 'finished' : 'local');
          run.settled = true;
          clear(run);
          return result;
        } catch {
          unavailable(run);
          return null;
        }
      })();
      return run.completion;
    },
    invalidate,
  };
}
