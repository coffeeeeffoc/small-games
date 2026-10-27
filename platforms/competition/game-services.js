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
    roomOwners = new Map();
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
    const credential = roomOwners.has(code)
      ? await auth.forOwner(roomOwners.get(code))
      : await auth.current();
    const data = await request(
      `${path}/rooms/${encodeURIComponent(code)}${operation ? '/' + operation : ''}`,
      body,
      credential,
    );
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
    return room;
  }
  return {
    config,
    session: () => auth.current(),
    logout() {
      owners.clear();
      roomOwners.clear();
      matchOwner = undefined;
      return auth.logout();
    },
    metadata: () => request(path),
    profile: (patch) => request('/me', patch),
    createRoom: (input = {}) => openRoom('', input),
    async match() {
      const credential = matchOwner ? await auth.forOwner(matchOwner) : await auth.current();
      matchOwner = { ...credential };
      const room = await request(path + '/match', {}, credential);
      rememberRoom(room.code, credential);
      return room;
    },
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
    appendFrames: async ({ runId, seq, frames }) =>
      request(
        `${path}/runs/${encodeURIComponent(runId)}/actions`,
        { seq, frames },
        await owner(runId),
      ),
    finishRun: async ({ runId, seq }) =>
      request(`${path}/runs/${encodeURIComponent(runId)}/finish`, { seq }, await owner(runId)),
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
