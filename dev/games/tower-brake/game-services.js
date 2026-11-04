import './client.js';
// Game-scoped services reuse the existing competition identity, without renewing a run's owner.
const nativeNames = { wechat: 'wx', bilibili: 'bl', douyin: 'tt', kuaishou: 'ks', taptap: 'tap' };
const failure = (code, message = '排行榜暂不可用，本地挑战仍可继续。') =>
  Object.assign(new Error(message), { code });

export function createGameServices({ gameId, ruleVersion }) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/.test(gameId)) throw failure('INVALID_GAME');
  const config = { ...globalThis.__COMPETITION_CONFIG__, game: gameId };
  if (globalThis.__COMPETITION_CONFIG__?.game && globalThis.__COMPETITION_CONFIG__.game !== gameId)
    throw failure('IDENTITY_SCOPE_MISMATCH');
  const sdk = globalThis[nativeNames[config.platform]];
  const base = (config.apiUrl || '/api/competition/v1').replace(/\/$/, '');
  const path = '/games/' + encodeURIComponent(gameId);
  const owners = new Map(),
    roomOwners = new Map(),
    roomLeases = new Map(),
    connectionEpochs = new Map();
  let matchOwner;
  let storage;
  try {
    storage = sdk || globalThis.localStorage;
  } catch {
    /* Memory-only identity. */
  }
  const auth = globalThis.__createCompetitionIdentity({
    config,
    sdk,
    storage,
    request: transport,
  });
  async function transport(url, body, owner) {
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
  async function request(url, body, credential) {
    credential ||= await auth.current();
    auth.assertCurrent(credential);
    const data = await transport(url, body, credential).catch((error) => {
      auth.invalidate(credential, error);
      throw error;
    });
    auth.assertCurrent(credential);
    return data;
  }
  async function owner(id) {
    const value = owners.get(id);
    if (!value) throw failure('SESSION_EXPIRED');
    return auth.forOwner(value);
  }
  function rememberRoom(code, credential) {
    if (!code) return;
    roomOwners.set(code, { ...credential });
    while (roomOwners.size > 8) roomOwners.delete(roomOwners.keys().next().value);
  }
  async function roomRequest(code, operation, body) {
    const leaseId = roomLeases.get(code);
    const epoch = (connectionEpochs.get(code) || 0) + (operation === 'connect' ? 1 : 0);
    if (operation === 'connect') connectionEpochs.set(code, epoch);
    if (body !== undefined && leaseId && !['connect', 'spectate'].includes(operation))
      body = { ...body, leaseId };
    const suffix = operation
      ? '/' + operation
      : leaseId
        ? '?leaseId=' + encodeURIComponent(leaseId)
        : '';
    const credential = roomOwners.has(code)
      ? await auth.forOwner(roomOwners.get(code))
      : await auth.current();
    const data = await request(
      `${path}/rooms/${encodeURIComponent(code)}${suffix}`,
      body,
      credential,
    );
    if (data.leaseId && (connectionEpochs.get(code) || 0) === epoch)
      roomLeases.set(code, data.leaseId);
    if (operation === 'leave') {
      roomOwners.delete(code);
      matchOwner = undefined;
    } else rememberRoom(code, credential);
    if (operation === 'rematch') rememberRoom(data.rematch, credential);
    return data;
  }
  async function openRoom(operation, body) {
    const credential =
      operation === '/join' && roomOwners.has(body.code)
        ? await auth.forOwner(roomOwners.get(body.code))
        : await auth.current();
    const room = await request(path + '/rooms' + operation, body, credential);
    rememberRoom(room.code, credential);
    if (room.leaseId) roomLeases.set(room.code, room.leaseId);
    return room;
  }
  async function adjustDevelopmentAssets(command, expectedPlayerId) {
    const credential = await auth.current();
    if (expectedPlayerId && credential.playerId !== expectedPlayerId)
      throw failure('IDENTITY_CHANGED');
    const result = await request(path + '/development/assets', command, credential);
    if (
      (await auth.current()).playerId !== credential.playerId ||
      result.playerId !== credential.playerId
    )
      throw failure('IDENTITY_CHANGED');
    return result;
  }
  async function nightChatRequest(suffix, body, expectedPlayerId) {
    if (gameId !== 'night-overwatch') throw failure('GAME_UNAVAILABLE');
    const credential = await auth.current();
    if (expectedPlayerId && credential.playerId !== expectedPlayerId)
      throw failure('IDENTITY_CHANGED');
    const result = await request(path + '/chat' + suffix, body, credential);
    if ((await auth.current()).playerId !== credential.playerId) throw failure('IDENTITY_CHANGED');
    return result;
  }
  return {
    config,
    ruleVersion,
    authority: auth.authority,
    legacyGuestAuthority: auth.legacyGuestAuthority,
    savedOwner() {
      const saved = auth.saved();
      return saved ? { playerId: saved.playerId || saved.userId } : null;
    },
    session: () => auth.current(),
    logout() {
      owners.clear();
      roomOwners.clear();
      roomLeases.clear();
      connectionEpochs.clear();
      matchOwner = undefined;
      return auth.logout();
    },
    metadata: () => request(path),
    adjustDevelopmentAssets,
    profile: (patch) => request('/me', patch),
    async updateProfile(patch) {
      const credential = await auth.current();
      const profile = await request('/me', patch, credential);
      auth.acceptProfile(profile, credential);
      return profile;
    },
    listRooms: () => request(path + '/rooms'),
    history: ({ cursor } = {}) =>
      request(path + '/history' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : '')),
    createRoom: (input = {}) => openRoom('', input),
    async match() {
      const credential = matchOwner ? await auth.forOwner(matchOwner) : await auth.current();
      matchOwner = { ...credential };
      const room = await request(path + '/match', {}, credential);
      rememberRoom(room.code, credential);
      if (room.leaseId) roomLeases.set(room.code, room.leaseId);
      return room;
    },
    joinRoom: ({ code, password, createdAt }) =>
      openRoom('/join', {
        code,
        ...(password ? { password } : {}),
        ...(createdAt ? { createdAt } : {}),
      }),
    spectateRoom: ({ code, password }) =>
      roomRequest(code, 'spectate', password ? { password } : {}),
    connectRoom: ({ code }) => roomRequest(code, 'connect', {}),
    getRoom: ({ code }) => roomRequest(code, '', undefined),
    roomAction({ code, operation, body = {} }) {
      if (!['ready', 'leave', 'rematch', 'actions', 'role', 'initiative'].includes(operation))
        return Promise.reject(failure('INVALID_OPERATION'));
      return roomRequest(code, operation, body);
    },
    identity: async () => (await request(path)).identity,
    nightChat: ({ cursor, waitMs = 0 } = {}, expectedPlayerId) =>
      nightChatRequest(
        '?' + new URLSearchParams({ ...(cursor ? { cursor } : {}), waitMs: String(waitMs) }),
        undefined,
        expectedPlayerId,
      ),
    sendNightChat: (input, expectedPlayerId) => nightChatRequest('', input, expectedPlayerId),
    reportNightChat: (input, expectedPlayerId) =>
      nightChatRequest('/report', input, expectedPlayerId),
    async nightAssets(expectedPlayerId) {
      if (gameId !== 'night-overwatch') throw failure('GAME_UNAVAILABLE');
      const credential = await auth.current();
      if (expectedPlayerId && credential.playerId !== expectedPlayerId)
        throw failure('IDENTITY_CHANGED');
      const result = await request(path + '/assets', undefined, credential);
      if (result.playerId !== credential.playerId) throw failure('IDENTITY_CHANGED');
      return result;
    },
    async nightAssetCommand(command, expectedPlayerId) {
      if (gameId !== 'night-overwatch') throw failure('GAME_UNAVAILABLE');
      if (command.kind === 'dev-adjust')
        return adjustDevelopmentAssets(
          {
            requestId: command.requestId,
            deltas: { coins: command.coinsDelta ?? 0, xp: command.xpDelta ?? 0 },
          },
          expectedPlayerId,
        );
      const credential = await auth.current();
      if (expectedPlayerId && credential.playerId !== expectedPlayerId)
        throw failure('IDENTITY_CHANGED');
      const result = await request(path + '/assets', command, credential);
      if (
        (await auth.current()).playerId !== credential.playerId ||
        result.playerId !== credential.playerId
      )
        throw failure('IDENTITY_CHANGED');
      return result;
    },
    listBoards: async () => (await request(path)).boards,
    leaderboard: ({ boardId, ruleVersion }) =>
      request(
        path +
          '/leaderboards/' +
          encodeURIComponent(boardId) +
          (ruleVersion ? '?ruleVersion=' + encodeURIComponent(ruleVersion) : ''),
      ),
    async startRun({ mode, levelId, requestId, playerId }) {
      if (typeof ruleVersion !== 'string' || !ruleVersion) throw failure('RULE_VERSION_CHANGED');
      const credential = await auth.current();
      if (playerId && credential.playerId !== playerId) throw failure('IDENTITY_CHANGED');
      const run = await request(
        path + '/runs',
        {
          board: mode,
          version: ruleVersion,
          ...(levelId ? { levelId } : {}),
          ...(requestId ? { requestId } : {}),
        },
        credential,
      );
      if (run?.version !== ruleVersion) throw failure('RULE_VERSION_CHANGED');
      owners.set(run.id, { ...credential });
      while (owners.size > 4) owners.delete(owners.keys().next().value);
      return { ...run, playerId: credential.playerId };
    },
    async getRun({ runId, playerId }) {
      const credential = await auth.current();
      if (credential.playerId !== playerId) throw failure('IDENTITY_CHANGED');
      const run = await request(`${path}/runs/${encodeURIComponent(runId)}`, undefined, credential);
      if (
        run.game !== gameId ||
        (!run.settlement &&
          run.version !== ruleVersion &&
          !(gameId === 'night-overwatch' && run.status === 'finished'))
      )
        throw failure('RULE_VERSION_CHANGED');
      owners.set(runId, { ...credential });
      return run;
    },
    resumeRun: async ({ runId }) =>
      request(`${path}/runs/${encodeURIComponent(runId)}/resume`, {}, await owner(runId)),
    appendFrames: async ({ runId, seq, frames }) =>
      request(
        `${path}/runs/${encodeURIComponent(runId)}/actions`,
        { seq, frames },
        await owner(runId),
      ),
    finishRun: async ({ runId, seq }) =>
      request(`${path}/runs/${encodeURIComponent(runId)}/finish`, { seq }, await owner(runId)),
    async cancelRun({ runId, playerId }) {
      const credential = playerId ? await auth.current() : await owner(runId);
      if (playerId && credential.playerId !== playerId) throw failure('IDENTITY_CHANGED');
      return request(`${path}/runs/${encodeURIComponent(runId)}/cancel`, {}, credential);
    },
    discardRun(id) {
      owners.delete(id);
    },
  };
}

// Each attempt has its own key; finished journals are immutable except for acknowledgements.
function createDurableRecorder(services, { storage, source = 'provided' }, onStatus) {
  let selectionError,
    storageDiagnostic = '';
  if (services.config.platform === 'h5' && typeof globalThis.window !== 'undefined') {
    try {
      const browserStorage = globalThis.window.localStorage;
      if (!browserStorage) throw Error('window.localStorage is unavailable');
      storage = browserStorage;
      source = 'window.localStorage';
    } catch (error) {
      selectionError = error;
    }
  }
  const safeMessage = (value) =>
    String(value ?? '')
      .replace(/[\r\n\t]/g, ' ')
      .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL]')
      .replace(/[\[{][\s\S]*/g, '[details omitted]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(
        /((?:(?:access|refresh|player)[-_ ]?)?token|authorization|cookie|password|secret|api[-_ ]?key|session[-_ ]?id|player[-_ ]?id|request[-_ ]?id)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
        '$1=[redacted]',
      )
      .replace(/night-pending-run-v1:[^\s]+/g, '[journal key]')
      .replace(/[A-Za-z0-9_+/=.-]{28,}/g, '[opaque value]')
      .slice(0, 320);
  const safeName = (value) =>
    typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(String(value || ''))
        ? safeMessage(value)
        : 'unknown';
  const bytes = (value) =>
    typeof value === 'string'
      ? [...value].reduce((total, c) => {
          const point = c.codePointAt(0);
          return total + (point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4);
        }, 0)
      : 0;
  const describeError = (error) =>
    `name=${safeName(error?.name || 'Error')} code=${safeName(error?.code)}\nmessage=${safeMessage(error?.message || 'Storage operation failed')}`;
  function diagnose(stage, error, details = '') {
    const methods = ['getItem', 'setItem', 'removeItem', 'key']
      .map((method) => {
        try {
          return `${method}=${typeof storage?.[method]}`;
        } catch {
          return `${method}=throws`;
        }
      })
      .join(' ');
    let length;
    try {
      const value = storage?.length;
      length =
        typeof value === 'number' && Number.isFinite(value) ? `number:${value}` : typeof value;
    } catch {
      length = 'throws';
    }
    storageDiagnostic = `stage=${stage}\nsource=${['window.localStorage', 'cocos.localStorage', 'provided'].includes(source) ? source : 'provided'}\n${describeError(error)}\n${methods}\nlength=${length}${details ? '\n' + details : ''}${selectionError ? '\nwindow.localStorage selection failed\n' + describeError(selectionError) : ''}`;
  }
  function access(stage, operation, details = '') {
    try {
      return operation();
    } catch (error) {
      diagnose(stage, error, details);
      throw error;
    }
  }
  const getStored = (name) => access('get', () => storage.getItem(name));
  const setStored = (name, value) =>
    access('set', () => storage.setItem(name, value), `writeBytes=${bytes(value)}`);
  const removeStored = (name) => access('remove', () => storage.removeItem(name));
  function verifyStored(name, expected) {
    const actual = access('readback', () => storage.getItem(name), `writeBytes=${bytes(expected)}`);
    if (actual !== expected) {
      const error = failure('STORAGE_UNAVAILABLE', 'Storage readback does not match written data');
      diagnose(
        'readback',
        error,
        `writeBytes=${bytes(expected)} actualType=${actual === null ? 'null' : typeof actual} readBytes=${bytes(actual)} matches=false`,
      );
      return false;
    }
    return true;
  }
  function canPersist() {
    try {
      if (
        typeof storage.key === 'function' &&
        typeof storage.removeItem === 'function' &&
        Number.isInteger(storage.length)
      )
        return true;
      throw Error('Storage enumeration or removal capability is unavailable');
    } catch (error) {
      diagnose('capability', error);
      return false;
    }
  }
  const scope =
    services.authority ||
    JSON.stringify([
      services.config.apiUrl,
      services.config.platform,
      services.config.appId,
      services.config.game,
    ]);
  const scopes = new Set([scope]);
  if (
    services.config.platform === 'h5' &&
    services.config.identityProvider === 'taptap' &&
    services.legacyGuestAuthority
  )
    scopes.add(services.legacyGuestAuthority);
  const prefix = (value) => 'night-pending-run-v1:' + encodeURIComponent(value) + ':';
  const working = new Map(),
    retries = new Map();
  const persisted = new WeakSet(),
    volatile = new WeakSet();
  let active,
    status = 'local',
    generation = 0,
    recovering,
    pending = 0;
  const report = (value) => {
    status = value;
    onStatus(value);
  };
  const key = (run) => prefix(run.scope) + run.requestId;
  const resultStatus = (result) =>
    result.accepted
      ? result.fastestEligible === false
        ? 'assisted'
        : 'finished'
      : ['RUN_EXPIRED', 'RUN_FINISHED'].includes(result.reason)
        ? 'expired'
        : 'local';
  function confirmed(run, result) {
    run.synced = true;
    run.result = result;
    retries.delete(key(run));
    if (!active || active === run) report(resultStatus(result));
  }
  function compact(run) {
    // Keep absolute sequence numbers and every unconfirmed batch for idempotent retries.
    for (let i = 0; i < run.acked; i++) run.batches[i] = null;
  }
  function cleanAcknowledged(name) {
    const serialized = getStored(name + ':synced');
    if (!serialized) return false;
    const done = JSON.parse(serialized);
    if (
      done?.schema !== 1 ||
      done.synced !== true ||
      typeof done.requestId !== 'string' ||
      !name.endsWith(':' + done.requestId) ||
      typeof done.playerId !== 'string' ||
      typeof done.id !== 'string' ||
      typeof done.result?.accepted !== 'boolean'
    )
      throw failure('INVALID_JOURNAL');
    if (
      active &&
      key(active) === name &&
      (done.playerId !== active.playerId || (active.id && done.id !== active.id))
    )
      throw failure('INVALID_JOURNAL');
    retries.delete(name);
    services.discardRun?.(done.id);
    if (!active || key(active) === name) {
      if (active) {
        active.id = done.id;
        confirmed(active, done.result);
      } else report(resultStatus(done.result));
    }
    // A valid acknowledgement already prevents replay. Cleanup is best effort;
    // Cocos/platform storage may return an empty string for an absent key.
    try {
      removeStored(name);
    } catch {
      /* Retry cleanup on recovery. */
    }
    return true;
  }
  function save(run, online = false) {
    try {
      const stored = getStored(key(run));
      if (stored && JSON.parse(stored).cancelPending) run.cancelPending = true;
      if (run.abandoned && !run.cancelPending) {
        removeStored(key(run));
        return true;
      }
      if (cleanAcknowledged(key(run))) {
        run.synced = true;
        return true;
      }
      compact(run);
      const serialized = JSON.stringify(run);
      let writeFailed = false;
      try {
        setStored(key(run), serialized);
      } catch {
        writeFailed = true;
      }
      // Another tab may acknowledge even while our write fails.
      if (cleanAcknowledged(key(run))) {
        run.synced = true;
        return true;
      }
      if (!writeFailed && !verifyStored(key(run), serialized)) writeFailed = true;
      if (writeFailed) {
        volatile.add(run);
        if ((!active || active === run) && !run.synced) report('storage-unavailable');
        // Never bypass the first durable save. Existing complete in-memory input
        // can still be uploaded online; it must not be advertised as safely cached.
        return online && persisted.has(run);
      }
      persisted.add(run);
      volatile.delete(run);
      storageDiagnostic = '';
      return true;
    } catch (error) {
      if (error instanceof SyntaxError || error?.code === 'INVALID_JOURNAL')
        diagnose('journal-parse', {
          name: error.name,
          code: error.code,
          message: 'Stored journal or acknowledgement is invalid',
        });
      if ((!active || active === run) && !run.synced) report('storage-unavailable');
      return false;
    }
  }
  function read(name) {
    if (cleanAcknowledged(name)) return null;
    const run = JSON.parse(getStored(name));
    if (run?.synced) return null;
    const validFrame = (frame) =>
      frame &&
      Number.isInteger(frame.ticks) &&
      frame.ticks >= 0 &&
      frame.ticks <= 600 &&
      frame.input &&
      typeof frame.input === 'object' &&
      !Array.isArray(frame.input);
    if (
      run?.schema !== 1 ||
      name !== key(run) ||
      !scopes.has(run.scope) ||
      typeof run.requestId !== 'string' ||
      !run.requestId ||
      typeof run.playerId !== 'string' ||
      !run.playerId ||
      typeof run.version !== 'string' ||
      !run.version ||
      typeof run.mode !== 'string' ||
      !run.mode ||
      (run.levelId !== undefined && typeof run.levelId !== 'string') ||
      (run.id !== undefined && typeof run.id !== 'string') ||
      typeof run.finishing !== 'boolean' ||
      ['abandoned', 'cancelPending', 'startAttempted'].some(
        (field) => run[field] !== undefined && typeof run[field] !== 'boolean',
      ) ||
      !Array.isArray(run.batches) ||
      !Array.isArray(run.tail) ||
      run.tail.length > 500 ||
      run.tail.some((frame) => !validFrame(frame)) ||
      !Number.isInteger(run.acked) ||
      run.acked < 0 ||
      run.acked > run.batches.length ||
      run.batches.some(
        (batch, index) =>
          !(batch === null && index < run.acked) &&
          (!Array.isArray(batch) ||
            !batch.length ||
            batch.length > 500 ||
            batch.some((frame) => !validFrame(frame))),
      )
    )
      throw failure('INVALID_JOURNAL');
    compact(run);
    persisted.add(run);
    return run;
  }
  function seal(run) {
    if (run.tail.length) {
      run.batches.push(run.tail);
      run.tail = [];
    }
    return save(run);
  }
  function failed(run, error) {
    if (run.synced) return;
    const transient = [
      'SERVICE_UNAVAILABLE',
      'RATE_LIMITED',
      'RUN_AHEAD_OF_TIME',
      'RUN_EXPIRED',
      'SESSION_EXPIRED',
    ].includes(error?.code);
    const previous = retries.get(key(run));
    const delay = transient ? Math.min(60000, (previous?.delay || 1000) * 2) : 60000;
    retries.set(key(run), { delay, at: Date.now() + delay });
    if (!active || active === run)
      report(
        error?.code === 'STORAGE_UNAVAILABLE'
          ? 'storage-unavailable'
          : error?.code === 'RULE_VERSION_CHANGED'
            ? 'update-required'
            : error?.code === 'IDENTITY_CHANGED'
              ? 'identity-changed'
              : volatile.has(run)
                ? 'storage-unavailable'
                : transient
                  ? 'pending-sync'
                  : 'needs-attention',
      );
  }
  function acknowledge(run, result) {
    // The caller has verified the server run and receipt. Local persistence
    // failure cannot turn that authoritative reward back into an unknown result.
    confirmed(run, result);
    const done = {
      schema: 1,
      synced: true,
      requestId: run.requestId,
      playerId: run.playerId,
      id: run.id,
      at: Date.now(),
      result,
    };
    const serialized = JSON.stringify(done);
    try {
      setStored(key(run) + ':synced', serialized);
      if (!verifyStored(key(run) + ':synced', serialized)) throw failure('STORAGE_UNAVAILABLE');
    } catch {
      return;
    }
    try {
      cleanAcknowledged(key(run));
    } catch {
      /* The verified server receipt remains authoritative. */
    }
  }
  async function cancelPending(run) {
    if (!save(run, true) || run.synced) return true;
    if (!run.cancelPending) return false;
    if (!run.id) {
      if (!run.startAttempted) {
        removeStored(key(run));
        run.synced = true;
        return true;
      }
      if (run.version !== services.ruleVersion) throw failure('RULE_VERSION_CHANGED');
      const created = await services.startRun({
        mode: run.mode,
        levelId: run.levelId,
        requestId: run.requestId,
        playerId: run.playerId,
      });
      run.id = created.id;
      if (!save(run, true) || run.synced) return true;
    }
    const result = await services.cancelRun({ runId: run.id, playerId: run.playerId });
    acknowledge(
      run,
      typeof result?.accepted === 'boolean' ? result : { accepted: false, reason: 'CANCELLED' },
    );
    return true;
  }
  function synchronize(run) {
    if (working.has(key(run))) return working.get(key(run));
    if ((retries.get(key(run))?.at || 0) > Date.now()) return Promise.resolve(null);
    const operation = (async () => {
      try {
        if (run.synced) {
          if (run.result) acknowledge(run, run.result);
          return null;
        }
        if (run.scope !== scope && (await services.session()).playerId !== run.playerId)
          throw failure('IDENTITY_CHANGED');
        if (!save(run, true)) return null;
        if (run.synced) return null;
        if (await cancelPending(run)) return null;
        if (!run.id) {
          if (run.version !== services.ruleVersion) throw failure('RULE_VERSION_CHANGED');
          run.startAttempted = true;
          if (!save(run) || run.synced) return null;
          const created = await services.startRun({
            mode: run.mode,
            levelId: run.levelId,
            requestId: run.requestId,
            playerId: run.playerId,
          });
          run.id = created.id;
          if (created.loadout) run.loadout = created.loadout;
          if (!save(run, true) || run.synced) return null;
          if (await cancelPending(run)) return null;
        }
        let remote = await services.getRun({ runId: run.id, playerId: run.playerId });
        if (await cancelPending(run)) return null;
        if (
          run.loadout &&
          remote.loadout &&
          JSON.stringify(run.loadout) !== JSON.stringify(remote.loadout)
        )
          throw failure('INVALID_JOURNAL');
        if (!save(run, true) || run.synced) return null;
        if (
          remote.id !== run.id ||
          remote.board !== run.mode ||
          remote.levelId !== run.levelId ||
          remote.version !== run.version
        )
          throw failure('INVALID_JOURNAL');
        if (remote.status === 'finished' && !remote.settlement) {
          acknowledge(run, { accepted: false, reason: 'RUN_FINISHED' });
          return null;
        }
        if (remote.settlement) {
          if (typeof remote.settlement.accepted !== 'boolean') throw failure('INVALID_SETTLEMENT');
          acknowledge(run, remote.settlement);
          return remote.settlement;
        }
        if (run.version !== services.ruleVersion) throw failure('RULE_VERSION_CHANGED');
        if (remote.seq < run.acked || remote.seq > run.batches.length)
          throw failure('SEQUENCE_CONFLICT');
        if (remote.status === 'active' && remote.expiresAt <= Date.now()) {
          remote = await services.resumeRun({ runId: run.id });
          if (!save(run, true) || run.synced) return null;
          if (await cancelPending(run)) return null;
        }
        // Replay the original unconfirmed batch even when the server sequence is ahead.
        while (run.acked < run.batches.length) {
          const seq = run.acked + 1;
          await services.appendFrames({ runId: run.id, seq, frames: run.batches[seq - 1] });
          if (await cancelPending(run)) return null;
          run.acked = seq;
          compact(run);
          if (!save(run, true) || run.synced) return null;
        }
        if (run.finishing) {
          const result =
            remote.settlement || (await services.finishRun({ runId: run.id, seq: run.acked }));
          if (!result || typeof result.accepted !== 'boolean') throw failure('INVALID_SETTLEMENT');
          acknowledge(run, result);
          return result;
        }
        retries.delete(key(run));
        if (active === run) report(volatile.has(run) ? 'storage-unavailable' : 'recording');
        return null;
      } catch (error) {
        const stopRecovery = () => {
          try {
            if (run.synced) return true;
            if (!cleanAcknowledged(key(run))) return false;
            run.synced = true;
            return true;
          } catch (storageError) {
            if (!active || active === run)
              report(
                storageError instanceof SyntaxError || storageError?.code === 'INVALID_JOURNAL'
                  ? 'needs-attention'
                  : 'storage-unavailable',
              );
            return true;
          }
        };
        // A different tab can settle while this request is pending, including
        // when the request rejects. Never resume or downgrade a confirmed run.
        if (stopRecovery()) return null;
        let cause = error;
        if (['RUN_EXPIRED', 'RUN_FINISHED'].includes(error?.code) && run.id) {
          try {
            // Server errors are authoritative; the local clock alone cannot discard input.
            // Re-read first so a concurrent successful finish always takes precedence.
            const remote = await services.getRun({ runId: run.id, playerId: run.playerId });
            if (stopRecovery()) return null;
            if (
              remote.id !== run.id ||
              remote.board !== run.mode ||
              remote.levelId !== run.levelId ||
              remote.version !== run.version
            )
              throw failure('INVALID_JOURNAL');
            if (remote.settlement && typeof remote.settlement.accepted !== 'boolean')
              throw failure('INVALID_SETTLEMENT');
            acknowledge(run, remote.settlement || { accepted: false, reason: error.code });
            return remote.settlement || null;
          } catch (confirmationError) {
            cause = confirmationError;
          }
          if (stopRecovery()) return null;
        }
        failed(run, cause);
        return null;
      }
    })().finally(() => working.delete(key(run)));
    working.set(key(run), operation);
    return operation;
  }
  function invalidate(reason = 'local') {
    generation++;
    if (active && !active.synced) {
      seal(active);
      // An interrupted, unfinished mission is not a completion claim.
      if (!active.finishing) {
        active.abandoned = true;
        active.cancelPending = !!(active.startAttempted || active.id);
        save(active);
        if (active.cancelPending) void synchronize(active);
      }
    }
    active = undefined;
    report(reason === 'practice' ? 'practice' : 'local');
  }
  const recorder = {
    get storageDiagnostic() {
      return storageDiagnostic;
    },
    get status() {
      return status;
    },
    get pending() {
      return pending;
    },
    get settlement() {
      return active?.synced && active.result
        ? { playerId: active.playerId, runId: active.id, result: active.result }
        : undefined;
    },
    async start({ mode, levelId, practice = false }) {
      storageDiagnostic = '';
      invalidate(practice ? 'practice' : 'local');
      if (practice) return null;
      const ownGeneration = generation;
      report('connecting');
      try {
        let credential, deferred;
        try {
          credential = await services.session();
        } catch (error) {
          if (!['SERVICE_UNAVAILABLE', 'RATE_LIMITED'].includes(error?.code)) throw error;
          credential = services.savedOwner?.();
          if (!credential) throw error;
          deferred = error;
        }
        if (generation !== ownGeneration) return null;
        const bytes = new Uint8Array(16);
        if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
        else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        const hex = Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
        const run = {
          schema: 1,
          scope,
          version: services.ruleVersion,
          playerId: credential.playerId,
          requestId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
          mode,
          levelId,
          batches: [],
          tail: [],
          acked: 0,
          finishing: false,
          savedAt: Date.now(),
        };
        if (!canPersist() || !save(run)) {
          report('storage-unavailable');
          return null;
        }
        active = run;
        if (deferred) failed(run, deferred);
        else await synchronize(run);
        return generation === ownGeneration ? run : null;
      } catch (error) {
        if (generation === ownGeneration)
          report(
            error?.code === 'RULE_VERSION_CHANGED'
              ? 'update-required'
              : error?.code === 'IDENTITY_CHANGED'
                ? 'identity-changed'
                : 'unavailable',
          );
        return null;
      }
    },
    record(input, ticks = 1) {
      const run = active;
      if (!run || run.finishing || run.abandoned || run.cancelPending || run.synced) return;
      if (!Number.isInteger(ticks) || ticks < 0 || ticks > 600) {
        report('needs-attention');
        return;
      }
      const encoded = JSON.stringify(input),
        previous = run.tail.at(-1);
      if (
        ticks > 0 &&
        previous &&
        previous.ticks + ticks <= 600 &&
        JSON.stringify(previous.input) === encoded
      )
        previous.ticks += ticks;
      else run.tail.push({ ticks, input: JSON.parse(encoded) });
      if (run.tail.length >= 500 || run.tail.reduce((sum, frame) => sum + frame.ticks, 0) >= 600) {
        seal(run);
        void synchronize(run);
      } else if (Date.now() - run.savedAt >= 1000) {
        run.savedAt = Date.now();
        save(run);
      }
    },
    async finish() {
      const run = active;
      if (!run || run.synced || run.abandoned || run.cancelPending) return null;
      run.finishing = true;
      seal(run);
      if (run.synced) return null;
      report(volatile.has(run) ? 'storage-unavailable' : 'pending-sync');
      if (working.has(key(run))) await working.get(key(run));
      return run.synced ? null : synchronize(run);
    },
    persist() {
      if (active && !active.synced) save(active);
    },
    recover() {
      if (recovering) return recovering;
      recovering = (async () => {
        pending = 0;
        try {
          const names = access('enumerate', () =>
            Array.from({ length: storage.length }, (_, i) => storage.key(i)),
          );
          for (const name of names) {
            if (
              !name ||
              ![...scopes].some((value) => name.startsWith(prefix(value))) ||
              name.endsWith(':synced')
            )
              continue;
            let run;
            try {
              run = read(name);
            } catch (error) {
              if (!active || (key(active) === name && !active.synced))
                report(
                  error instanceof SyntaxError || error?.code === 'INVALID_JOURNAL'
                    ? 'needs-attention'
                    : 'storage-unavailable',
                );
              continue;
            }
            if (!run || (run.abandoned && !run.cancelPending)) continue;
            if (active && key(run) === key(active)) run = active;
            if (!run.finishing && !run.cancelPending && run !== active) {
              if (
                run.scope === scope &&
                Number.isFinite(run.savedAt) &&
                Date.now() - run.savedAt > 86400000
              )
                removeStored(name);
              continue;
            }
            pending++;
            await synchronize(run);
            if (run.synced) pending--;
          }
        } catch {
          if (!active?.synced) report('storage-unavailable');
        }
      })().finally(() => {
        recovering = undefined;
      });
      return recovering;
    },
    invalidate,
  };
  return recorder;
}

/** Bounded live journal: acknowledged input is discarded; each retry keeps its original sequence. */
export function createRunRecorder(
  services,
  { onStatus = () => {}, startTimeoutMs = 1500, durable } = {},
) {
  if (durable && services.config?.game === 'night-overwatch')
    return createDurableRecorder(services, durable, onStatus);
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
