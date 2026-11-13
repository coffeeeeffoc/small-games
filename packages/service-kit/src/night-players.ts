import { z } from 'zod';

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const at = Date.parse(s + 'T00:00:00Z');
    return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === s;
  });
export const nightPlayerQuerySchema = z
  .object({
    from: day.optional(),
    to: day.optional(),
    nickname: z.string().trim().min(1).max(100).optional(),
    shortId: z
      .string()
      .regex(/^#?[a-fA-F0-9]{8}$/)
      .transform((s) => s.replace('#', '').toLowerCase())
      .optional(),
    page: z.number().int().min(1).max(10000).default(1),
  })
  .strict()
  .refine((q) => Boolean(q.from && q.to) || Boolean(q.nickname || q.shortId), 'FILTER_REQUIRED')
  .refine(
    (q) => Boolean(q.from) === Boolean(q.to) && (!q.from || q.from <= q.to!),
    'INVALID_RANGE',
  );

export const nightPlayerSections = [
  'wallet',
  'records',
  'results',
  'best',
  'rooms',
  'social',
  'messages',
  'directMessages',
  'reports',
  'presence',
] as const;
export const nightPlayerDetailQuerySchema = z
  .object({
    id: z.uuid(),
    section: z.enum(nightPlayerSections).default('wallet'),
    pageSize: z.number().int().min(1).max(50).default(20),
    page: z.number().int().min(1).max(10000).default(1),
  })
  .strict();
export type NightPlayerQuery = z.infer<typeof nightPlayerQuerySchema>;
export type NightPlayerDetailQuery = z.infer<typeof nightPlayerDetailQuerySchema>;

export const nightPlayerObservation = {
  source: 'night-assets.visits',
  timezone: 'Asia/Shanghai',
  retentionDays: 120,
  semantics:
    '每日首次/末次访问观测；按北京时间整日范围匹配，非逐次登录流水。仅覆盖功能启用后已留存记录，无记录为未知。',
} as const;
const player = z
  .object({
    id: z.uuid(),
    shortId: z.string(),
    nickname: z.string().nullable(),
    platform: z.string(),
    createdAt: z.number(),
    observedFrom: z.number().nullable(),
    observedTo: z.number().nullable(),
    coins: z.number().nullable(),
    xp: z.number().nullable(),
  })
  .strict();
const observation = z
  .object({
    source: z.literal(nightPlayerObservation.source),
    timezone: z.literal('Asia/Shanghai'),
    retentionDays: z.literal(120),
    semantics: z.string(),
  })
  .strict();
export const nightPlayerListSchema = z
  .object({
    items: z.array(player).max(50),
    page: z.number().int(),
    pageSize: z.literal(50),
    total: z.number().int().nonnegative(),
    nextPage: z.number().int().nullable(),
    observation,
  })
  .strict();
export const nightPlayerCoverage = {
  wallet:
    '当前资产及旧钱包：金币、经验、背包、永久/限时装备、配装、签到、任务、成就、信箱、广告订单、预留道具、访问观测、迁移记录。',
  records:
    '该玩家夜航资产/旧钱包事件、广告审计、单人局及双人历史的业务字段；不含动作回执和仿真state。',
  results: '该玩家夜航逐场成绩。',
  best: '该玩家夜航各榜最佳成绩。',
  rooms: '仍留存且该玩家参与的夜航房间业务状态及结算；不含仿真state、租约和口令。',
  social: '好友关系、私聊已读游标、好友请求限流及双人计分去重记录。',
  messages: '该玩家发出的夜航公聊（含已移除记录）。',
  directMessages: '该玩家收发的夜航私聊（含已移除记录）。',
  reports: '该玩家发起或被举报的夜航聊天举报与业务证据。',
  presence: '在线活动观测、聊天限流及禁言状态。',
} as const;
export const nightPlayerExcluded = [
  '认证会话、刷新凭据、平台subject、令牌、密钥、口令、哈希、签名、租约',
  '其他游戏、云存档身份体系、动作回执、原始仿真state、已清理数据；事件/房间仅覆盖本文列出的业务字段',
];
export const nightPlayerDetailSchema = z
  .object({
    player,
    profile: z.json(),
    section: z.enum(nightPlayerSections),
    page: z.number().int(),
    pageSize: z.number().int().min(1).max(50),
    total: z.number().int().nonnegative(),
    nextPage: z.number().int().nullable(),
    items: z.array(z.json()).max(50),
    truncated: z.boolean(),
    truncatedPaths: z.array(z.string()).max(101),
    coverage: z.record(z.string(), z.string()),
    excluded: z.array(z.string()),
    observation,
  })
  .strict();
export type NightPlayerResponse =
  | z.infer<typeof nightPlayerListSchema>
  | z.infer<typeof nightPlayerDetailSchema>;

// Keep sensitive fields out even inside historical snapshots and embedded business receipts.
const privateField =
  /token|secret|password|credential|hash|signature|salt|subject|lease|authorization|session|nonce/i;
export function hasPrivatePlayerField(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, child]) => privateField.test(key) || hasPrivatePlayerField(child),
  );
}
/** Business records remain whole. Only sensitive fields and documented simulation snapshots are omitted. */
export function playerBusiness(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(playerBusiness);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !privateField.test(key) && key !== 'state' && key !== 'before')
        .map(([key, child]) => [key, playerBusiness(child)]),
    );
  return value;
}
export const NIGHT_PLAYER_RESPONSE_BYTES = 4 * 1024 * 1024;
