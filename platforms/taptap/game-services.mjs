import { tapCall, tapLogin, tapError } from './calls.mjs';
const copy = (value) => JSON.parse(JSON.stringify(value));
const textBytes = (text) => encodeURIComponent(text).replace(/%[A-F\d]{2}/g, 'x').length;
export function createTapGameServices({
  sdk,
  config,
  savePort,
  storage,
  now = Date.now,
  backendSession,
}) {
  const settings = config.tapServices;
  if (!settings?.enabled || !/^\d+$/.test(String(settings.appConsoleId)))
    throw tapError('TAP_CONFIG_INVALID');
  const scope = `${config.game}:${settings.appConsoleId}`;
  let stopped = false,
    busy = false,
    connected = false,
    revision = 0,
    lastUpload = -Infinity,
    lastScore = -1;
  const check = (token) => {
    if (stopped || token !== revision) throw tapError('TAP_CANCELLED', '已离开 TapTap 小站。');
  };
  const read = (key) => {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };
  let slot = read(`tap-slot:${scope}`);
  if (!/^[a-z0-9]{10,24}$/.test(slot || '')) {
    slot = Math.random().toString(36).slice(2, 12) + now().toString(36);
    try {
      storage.setItem(`tap-slot:${scope}`, slot);
    } catch {
      /* Keep this installation slot in memory. */
    }
  }
  lastUpload = Number(read(`tap-upload-time:${scope}`)) || -Infinity;
  const name = `sg-${config.game}-${slot}`;
  const owned = (item) => {
    try {
      const meta = JSON.parse(item.extra);
      return (
        meta.schema === 1 &&
        meta.game === config.game &&
        String(meta.app) === String(settings.appConsoleId) &&
        typeof item.uuid === 'string' &&
        typeof item.fileId === 'string'
      );
    } catch {
      return false;
    }
  };
  const manager = (kind) => {
    const method = kind === 'cloud' ? 'getCloudSaveManager' : 'getLeaderboardManager';
    if (typeof sdk?.[method] !== 'function')
      throw tapError('TAP_UNAVAILABLE', '当前 TapTap 客户端不支持此功能。');
    return sdk[method]();
  };
  async function operation(fn) {
    if (busy) throw tapError('TAP_BUSY', '上一项操作还未完成。');
    const token = revision;
    check(token);
    busy = true;
    try {
      const value = await fn(token);
      check(token);
      return value;
    } finally {
      busy = false;
    }
  }
  const connect = async (token) => {
    if (connected) return;
    if (backendSession) {
      const identity = await backendSession();
      if (identity?.identityKind !== 'platform') throw tapError('IDENTITY_SCOPE_MISMATCH');
    } else await tapLogin(sdk); // Code is discarded: it is not an account ID or durable credential.
    check(token);
    connected = true;
    lastScore = -1;
  };
  const list = async (token) => {
    const result = await tapCall(manager('cloud'), 'getArchiveList');
    check(token);
    if (!Array.isArray(result?.saves)) throw tapError('TAP_INVALID_SAVE');
    return result.saves.filter(owned).sort((a, b) => b.modifiedTime - a.modifiedTime);
  };
  const api = {
    get connected() {
      return connected;
    },
    get busy() {
      return busy;
    },
    connect: () =>
      operation(async (token) => {
        await connect(token);
        return { connected: true };
      }),
    list: () =>
      operation(async (token) => {
        await connect(token);
        return list(token);
      }),
    upload: () =>
      operation(async (token) => {
        if (savePort.developer?.()) throw tapError('TAP_PRACTICE', '试玩进度不上传云端。');
        if (!savePort.canRestore()) throw tapError('TAP_PLAYING', '请先回到主页，再管理进度。');
        if (now() - lastUpload < 60000)
          throw tapError('TAP_RATE_LIMIT', '云档每分钟可上传一次，请稍后再试。');
        await connect(token);
        const data = savePort.validate(savePort.export());
        const payload = JSON.stringify({
          schema: 1,
          game: config.game,
          app: String(settings.appConsoleId),
          data,
        });
        if (textBytes(payload) > 2000000) throw tapError('TAP_SAVE_TOO_LARGE');
        const cloud = manager('cloud'),
          fs = sdk.getFileSystemManager?.(),
          base = sdk.env?.USER_DATA_PATH;
        if (!fs || typeof base !== 'string' || !base) throw tapError('TAP_UNAVAILABLE');
        const previous = (await list(token)).find((item) => item.name === name);
        const filePath = `${base}/sg-${config.game}-${slot}.json`;
        await tapCall(fs, 'writeFile', { filePath, data: payload, encoding: 'utf8' });
        check(token);
        // Reserve the rate budget before a request with potentially unknown remote outcome.
        lastUpload = now();
        try {
          storage.setItem(`tap-upload-time:${scope}`, String(lastUpload));
        } catch {
          /* In-memory budget still applies. */
        }
        const result = await tapCall(
          cloud,
          previous ? 'updateArchive' : 'createArchive',
          {
            ...(previous ? { archiveUUID: previous.uuid } : {}),
            archiveMetaData: {
              name,
              summary: savePort.summary(data),
              extra: JSON.stringify({
                schema: 1,
                game: config.game,
                app: String(settings.appConsoleId),
                slot,
              }),
            },
            archiveFilePath: filePath,
          },
          { timeoutMs: 30000 },
        );
        check(token);
        return result;
      }),
    download: (item) =>
      operation(async (token) => {
        await connect(token);
        const current = (await list(token)).find(
          (row) => row.uuid === item.uuid && row.fileId === item.fileId,
        );
        if (!current) throw tapError('TAP_SAVE_CHANGED', '云档已变化，请重新查看。');
        const fs = sdk.getFileSystemManager?.();
        const result = await tapCall(
          manager('cloud'),
          'getArchiveData',
          { archiveUUID: current.uuid, archiveFileId: current.fileId },
          { timeoutMs: 30000 },
        );
        check(token);
        const file = await tapCall(fs, 'readFile', { filePath: result.filePath, encoding: 'utf8' });
        check(token);
        if (typeof file.data !== 'string' || file.data.length > 2000000)
          throw tapError('TAP_INVALID_SAVE');
        let envelope;
        try {
          envelope = JSON.parse(file.data);
        } catch {
          throw tapError('TAP_INVALID_SAVE');
        }
        if (
          envelope.schema !== 1 ||
          envelope.game !== config.game ||
          envelope.app !== String(settings.appConsoleId)
        )
          throw tapError('TAP_INVALID_SAVE');
        return savePort.validate(envelope.data);
      }),
    restore(data) {
      if (stopped || busy || !savePort.canRestore())
        throw tapError('TAP_PLAYING', '请先回到主页，再恢复进度。');
      const valid = savePort.validate(data),
        before = savePort.validate(savePort.export());
      // A failed backup must never precede a destructive restore.
      storage.setItem(`tap-backup:${scope}`, JSON.stringify(before));
      savePort.restore(copy(valid));
      return savePort.summary(valid);
    },
    submit: () =>
      operation(async (token) => {
        if (savePort.developer?.()) throw tapError('TAP_PRACTICE', '试玩进度不上传排行榜。');
        await connect(token);
        const score = savePort.score();
        if (!Number.isSafeInteger(score) || score < 0) throw tapError('TAP_INVALID_SCORE');
        if (!settings.leaderboardId || score <= lastScore) return;
        await tapCall(
          manager('board'),
          'submitScores',
          { scores: [{ leaderboardId: settings.leaderboardId, score }] },
          { leaderboard: true },
        );
        check(token);
        lastScore = score;
      }),
    openLeaderboard: () =>
      operation(async (token) => {
        await connect(token);
        if (!settings.leaderboardId) throw tapError('TAP_UNAVAILABLE', '此应用尚未配置进度榜。');
        await tapCall(
          manager('board'),
          'openLeaderboard',
          { leaderboardId: settings.leaderboardId, collection: 'public' },
          { leaderboard: true },
        );
        check(token);
      }),
    stop() {
      stopped = true;
      connected = false;
      revision++;
    },
  };
  return api;
}
