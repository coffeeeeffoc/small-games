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
]);
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
    /^\/(?:me|sessions\/(?:guest|platform|refresh)|upgrade)$/,
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
  return { code: errors.has(code) ? code : 'QA_FAILED' };
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
export function publicMatchEvidence(value) {
  return {
    roomCode: /^[A-F0-9]{12}$/.test(value.roomCode) ? value.roomCode : null,
    playerIds: value.playerIds.filter((id) => uuid.test(id)),
    acceptedTouchActions: value.acceptedTouchActions.map((count) =>
      Number.isSafeInteger(count) ? count : 0,
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
