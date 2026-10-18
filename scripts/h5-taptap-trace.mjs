import { matrixGames } from './h5-taptap-matrix.mjs';

const methods = new Set(['GET', 'POST', 'OPTIONS', 'HEAD']);
const errors = new Set([
  'QA_FAILED',
  'ASSERTION_FAILED',
  'TIMEOUT',
  'HTTP_REJECTED',
  'PAGE_ERROR',
  'NETWORK_FAILED',
  'RATE_LIMITED',
  'IDENTITY_SCOPE_MISMATCH',
  'SESSION_EXPIRED',
  'IDENTITY_EXPIRED',
  'IDENTITY_MODE_UNSUPPORTED',
  'MATCH_CLOSED',
  'PLAYER_FINISHED',
  'ILLEGAL_ACTION',
  'GAME_DISABLED',
  'GAME_CANCELLED',
  'CONTROL_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
]);
const diagnosticFiles = new Set([
  'h5-taptap.browser.mjs',
  'h5-taptap-runtime.mjs',
  'h5-taptap-touch.mjs',
]);
const databaseErrors = new Set([
  '40001',
  '40P01',
  '57014',
  '53300',
  '55P03',
  '08000',
  '08003',
  '08006',
  '57P01',
  '57P02',
  '57P03',
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
]);
/** Only known database codes survive; query text, parameters and messages never do. */
export function safeDatabaseFailure(error) {
  let code = 'UNCLASSIFIED',
    phase;
  for (let depth = 0; error && depth < 4; depth++, error = error.cause) {
    if (databaseErrors.has(error.code)) code = error.code;
    if (
      [
        'control',
        'room-lock',
        'room-read',
        'room-write',
        'identity',
        'settlement',
        'advisory-lock',
      ].includes(error.phase)
    )
      phase = error.phase;
    const query = typeof error.query === 'string' ? error.query : '';
    if (/game_control\./i.test(query)) phase = 'control';
    else if (/runtime\.competition_rooms/i.test(query))
      phase = /for update/i.test(query)
        ? 'room-lock'
        : /^\s*select/i.test(query)
          ? 'room-read'
          : 'room-write';
    else if (/runtime\.competition_(?:players|refresh_tokens)/i.test(query)) phase = 'identity';
    else if (/runtime\.competition_(?:best|results|matches|duels)/i.test(query))
      phase = 'settlement';
    else if (/pg_advisory_xact_lock/i.test(query)) phase = 'advisory-lock';
  }
  return { code, ...(phase ? { phase } : {}) };
}
const variantPattern = new RegExp(
  `^(?:${matrixGames.join('|')})-ads-(?:on|off)-service-(?:on|off)$`,
);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
/** No userinfo/query/fragment may enter an acceptance artifact. Unknown paths are fixed labels. */
export function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '[invalid-url]';
    return `${url.origin}${safeApiPath(url.pathname)}`;
  } catch {
    return '[invalid-url]';
  }
}
export function safeApiPath(value) {
  let pathname;
  try {
    pathname = new URL(value, 'http://qa.invalid').pathname;
  } catch {
    return '/[unrecognized]';
  }
  const prefix = pathname.match(/^\/(?:api\/competition\/v1|small-games\/v1)/)?.[0];
  if (!prefix) return '/[unrecognized]';
  const suffix = pathname.slice(prefix.length);
  const game =
    '(?:cops-robbers|cops-robbers-realtime|xiangqi-five|carding-car|carrom-club|three-choose-two)';
  const recognized = [
    /^\/(?:me|sessions\/(?:guest|platform|refresh|logout)|upgrade)$/,
    /^\/rooms(?:\/join|\/[A-F0-9]{12}(?:\/(?:actions|ready|start|leave|rematch|settings))?)?$/,
    new RegExp(`^/boards/${game}$`),
    new RegExp(
      `^/games/${game}(?:/leaderboards/[a-z0-9-]{1,40}|/rooms(?:/join|/[A-F0-9]{12}(?:/(?:actions|ready|start|leave|rematch|settings))?)?)?$`,
    ),
    /^\/runs\/cops-robbers-realtime(?:\/start)?$/,
  ];
  return recognized.some((pattern) => pattern.test(suffix)) ? prefix + suffix : '/[unrecognized]';
}
export function safeFailure(error, fallback = 'QA_FAILED') {
  const code = errors.has(error?.code)
    ? error.code
    : error?.code === 'ERR_ASSERTION'
      ? 'ASSERTION_FAILED'
      : error?.name === 'TimeoutError'
        ? 'TIMEOUT'
        : fallback;
  const result = { code: errors.has(code) ? code : 'QA_FAILED' };
  // Export a bounded source location, never a stack or arbitrary path/message.
  for (const frame of typeof error?.stack === 'string'
    ? error.stack.split('\n').slice(1, 12)
    : []) {
    const match = /(?:[/\\])(h5-taptap[\w.-]*\.mjs):(\d{1,6}):(\d{1,5})\)?$/.exec(frame);
    if (match && diagnosticFiles.has(match[1])) {
      result.location = `${match[1]}:${Number(match[2])}:${Number(match[3])}`;
      break;
    }
  }
  return result;
}
export function safeTouchProgress(phase, expected) {
  const result = { sent: expected?.sent === true, completed: expected?.completed === true };
  if (
    [
      'layout',
      'state-check',
      'actor-planning',
      'target-planning',
      'actor-tap',
      'target-tap',
      'response-wait',
      'response-check',
    ].includes(phase)
  )
    result.phase = phase;
  if (Number.isSafeInteger(expected?.request?.seq) && expected.request.seq > 0)
    result.seq = expected.request.seq;
  return result;
}
/** Explicit projection, not recursive redaction: nested objects, bodies, headers and causes vanish. */
export function traceEvent(input) {
  const result = { at: new Date().toISOString() };
  if (variantPattern.test(input.variant)) result.variant = input.variant;
  if (['a', 'b'].includes(input.player)) result.player = input.player;
  if (['request', 'response', 'failure', 'checkpoint'].includes(input.kind))
    result.kind = input.kind;
  if (methods.has(input.method)) result.method = input.method;
  if (typeof input.path === 'string') result.path = safeApiPath(input.path);
  if (Number.isInteger(input.status) && input.status >= 100 && input.status <= 599)
    result.status = input.status;
  if (errors.has(input.errorCode)) result.errorCode = input.errorCode;
  if (uuid.test(input.userId)) result.userId = input.userId;
  if (/^[A-F0-9]{12}$/.test(input.roomCode)) result.roomCode = input.roomCode;
  if (Number.isSafeInteger(input.seq) && input.seq >= 0) result.seq = input.seq;
  return result;
}
export function publicStanding(value) {
  if (!value || !uuid.test(value.userId ?? value.playerId)) return null;
  const userId = value.userId ?? value.playerId;
  return Object.fromEntries(
    Object.entries({
      userId,
      playerId: uuid.test(value.playerId) ? value.playerId : userId,
      score: value.score,
      secondary: value.secondary,
      rank: value.rank,
    }).filter(([key, item]) => ['userId', 'playerId'].includes(key) || Number.isFinite(item)),
  );
}
export function safeStreetTouchFrame(frame) {
  const result = {};
  for (const key of [
    'plannedSeq',
    'plannedServerNow',
    'ordinal',
    'x',
    'y',
    'seq',
    'serverNow',
    'afterSeq',
    'afterServerNow',
    'selectedBefore',
    'selectedAfter',
  ])
    if (Number.isSafeInteger(frame?.[key]) && frame[key] >= 0) result[key] = frame[key];
  for (const key of ['trusted', 'open', 'busyBefore', 'busyAfter'])
    if (typeof frame?.[key] === 'boolean') result[key] = frame[key];
  if (frame?.pointerType === 'touch') result.pointerType = 'touch';
  return result;
}

export function publicMatchEvidence(value) {
  return {
    roomCode: /^[A-F0-9]{12}$/.test(value.roomCode) ? value.roomCode : null,
    playerIds: value.playerIds.filter((id) => uuid.test(id)),
    acceptedTouchActions: value.acceptedTouchActions.map((count) =>
      Number.isSafeInteger(count) ? count : 0,
    ),
    observedStaleTouchCounts: (value.observedStaleTouchCounts ?? [])
      .slice(0, 2)
      .map((count) => (Number.isSafeInteger(count) && count >= 0 ? count : 0)),
    observedStaleTouches: (value.observedStaleTouches ?? [])
      .slice(0, 2)
      .map((frames) => frames.slice(-24).map(safeStreetTouchFrame)),
    confirmedBlockedRouteInputs: (value.confirmedBlockedRouteInputs ?? [])
      .slice(0, 2)
      .map((inputs) =>
        inputs.slice(-24).map((input) => ({
          seq: Number.isSafeInteger(input.seq) && input.seq > 0 ? input.seq : null,
          status: input.status === 422 ? 422 : null,
          error: input.error === 'ILLEGAL_ACTION' ? 'ILLEGAL_ACTION' : null,
          sequenceUnchanged: input.sequenceUnchanged === true,
          terminal: input.terminal === true,
          recoveredUsingUI: input.recoveredUsingUI === true,
          ...(input.recovery?.seq === input.seq &&
          input.recovery?.status === 200 &&
          Number.isSafeInteger(input.recovery.actor) &&
          input.recovery.actor >= 0 &&
          ['move', 'hold'].includes(input.recovery.type)
            ? {
                recovery: {
                  seq: input.recovery.seq,
                  status: 200,
                  actor: input.recovery.actor,
                  type: input.recovery.type,
                },
              }
            : {}),
        })),
      ),
    duplicateActionsPreserveSettlement: value.duplicateActionsPreserveSettlement === true,
    results: value.results.map((row) => ({
      userId: uuid.test(row.userId ?? row.playerId) ? (row.userId ?? row.playerId) : null,
      score: Number(row.result?.score),
      secondary: Number(row.result?.secondary),
      rated: row.rated === true,
    })),
    standings: value.boards.map((board) => publicStanding(board.me)),
  };
}
