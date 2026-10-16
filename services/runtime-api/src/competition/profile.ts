import { z } from 'zod';

// Only known platform image hosts. Unknown providers keep the default avatar until reviewed.
export const avatarPolicy = {
  origins: [
    'https://img.tapimg.net',
    'https://img2.tapimg.com',
    'https://wx.qlogo.cn',
    'https://thirdwx.qlogo.cn',
    'https://i0.hdslb.com',
    'https://i1.hdslb.com',
    'https://i2.hdslb.com',
  ],
  maxBytes: 1_048_576,
};

export const nicknameSchema = z
  .string()
  .max(100)
  .transform((value) => value.normalize('NFKC').trim().replace(/\s+/g, ' '))
  .refine(
    (value) =>
      Array.from(value).length >= 2 &&
      Array.from(value).length <= 16 &&
      /^[\p{L}\p{N} ·_-]+$/u.test(value),
    'INVALID_NAME',
  );

/** Never fetch on the server. Clients also refuse redirects and omit credentials/referrers. */
export function safeAvatarUrl(value: string) {
  if (!value) return true;
  if (value !== value.trim() || /[\p{Cc}\s]/u.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port)
      return false;
    if (
      [...url.searchParams.keys()].some((key) =>
        /token|secret|password|credential|session/i.test(key),
      )
    )
      return false;
    return avatarPolicy.origins.includes(url.origin);
  } catch {
    return false;
  }
}

const regionText = z
  .string()
  .max(80)
  .transform((value) => value.normalize('NFKC').trim().replace(/\s+/g, ' '))
  .refine((value) => value.length <= 48 && /^[\p{L}\p{N} .·'’-]*$/u.test(value));
export const regionSchema = z
  .object({
    country: regionText.nullable().optional(),
    province: regionText.nullable().optional(),
  })
  .strict()
  .nullable();
export const profilePatchSchema = z
  .object({
    name: nicknameSchema.optional(),
    nickname: nicknameSchema.optional(),
    avatarUrl: z.string().max(2048).refine(safeAvatarUrl).optional(),
    region: regionSchema.optional(),
    source: z.enum(['self-reported', 'user-authorized']).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name === undefined || value.nickname === undefined || value.name === value.nickname,
  )
  .refine((value) =>
    [value.name, value.nickname, value.avatarUrl, value.region].some((item) => item !== undefined),
  );
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export function publicProfile(row: Record<string, unknown>) {
  const stored =
    row.profile && typeof row.profile === 'object' ? (row.profile as Record<string, unknown>) : {};
  const nickname = nicknameSchema.safeParse(row.display_name ?? row.name);
  const region = regionSchema.safeParse(stored.region);
  const location =
    region.success && region.data
      ? { country: region.data.country || null, province: region.data.province || null }
      : null;
  return {
    userId: String(row.id ?? row.playerId),
    nickname: nickname.success ? nickname.data : '新玩家',
    name: nickname.success ? nickname.data : '新玩家',
    avatarUrl:
      typeof stored.avatarUrl === 'string' &&
      stored.avatarUrl.length <= 2048 &&
      safeAvatarUrl(stored.avatarUrl)
        ? stored.avatarUrl
        : '',
    region: location && (location.country || location.province) ? location : null,
    profileSource:
      stored.source === 'self-reported' || stored.source === 'user-authorized'
        ? stored.source
        : stored.source === 'default'
          ? 'default'
          : nickname.success
            ? 'legacy'
            : 'default',
    profileUpdatedAt:
      typeof stored.updatedAt === 'number' && Number.isSafeInteger(stored.updatedAt)
        ? stored.updatedAt
        : null,
  };
}

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** Persisted ranking snapshots predate profile JSON; rebuild the same finite public DTO. */
export function publicRankingRow(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = object(value);
  const playerId = text(row.playerId ?? row.userId);
  const score = number(row.score),
    secondary = number(row.secondary),
    rank = number(row.rank),
    position = number(row.position),
    total = number(row.total);
  if (
    !playerId ||
    !z.uuid().safeParse(playerId).success ||
    [score, secondary, rank, position, total].some((item) => item === undefined)
  )
    return null;
  return {
    ...publicProfile({
      id: playerId,
      name: row.name ?? row.nickname,
      profile: {
        avatarUrl: row.avatarUrl,
        region: row.region,
        source: row.profileSource,
        updatedAt: row.profileUpdatedAt,
      },
    }),
    playerId,
    score,
    secondary,
    rank,
    position,
    total,
  };
}

export function publicRanking(value: unknown) {
  if (value === null || value === undefined) return null;
  const row = object(value),
    gap = object(row.gap);
  return {
    board: text(row.board),
    top: Array.isArray(row.top)
      ? row.top.map(publicRankingRow).filter((item) => item !== null)
      : [],
    me: publicRankingRow(row.me),
    previous: publicRankingRow(row.previous),
    threshold: publicRankingRow(row.threshold),
    gap: row.gap == null ? null : { score: number(gap.score), secondary: number(gap.secondary) },
    eligiblePlayers: number(row.eligiblePlayers),
    reason: text(row.reason) ?? null,
  };
}

/** Four common result fields plus the three numeric extensions owned by letters.mjs. */
export function publicResult(value: unknown) {
  if (value === null || value === undefined) return value;
  const row = object(value);
  return {
    finished: typeof row.finished === 'boolean' ? row.finished : undefined,
    eligible: typeof row.eligible === 'boolean' ? row.eligible : undefined,
    score: number(row.score),
    secondary: number(row.secondary),
    ...(number(row.correct) !== undefined ? { correct: number(row.correct) } : {}),
    ...(number(row.accuracy) !== undefined ? { accuracy: number(row.accuracy) } : {}),
    ...(number(row.assisted) !== undefined ? { assisted: number(row.assisted) } : {}),
  };
}

export function publicRoomResults(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.map((item: unknown) => {
    const row = object(item);
    return {
      userId: text(row.playerId ?? row.userId),
      playerId: text(row.playerId ?? row.userId),
      result: publicResult(row.result),
      ...(Object.hasOwn(row, 'before') ? { before: publicRankingRow(row.before) } : {}),
      rated: typeof row.rated === 'boolean' ? row.rated : undefined,
      reason: text(row.reason) ?? null,
      ...(Object.hasOwn(row, 'after') ? { after: publicRanking(row.after) } : {}),
    };
  });
}
