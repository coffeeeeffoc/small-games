/** Key-order-insensitive equality: stored JSONB and freshly built objects order keys differently. */
export function same(a: unknown, b: unknown) {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .filter(([, x]) => x !== undefined)
              .sort(([x], [y]) => (x < y ? -1 : 1))
              .map(([k, x]) => [k, stable(x)]),
          )
        : v;
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}
export type NightBuild = {
  buildId: string;
  channel: string;
  ranked: string;
  multiplayer: string;
  version?: string;
  backendVersion?: string;
  disabled?: boolean;
  removed?: true;
};
export type NightRelease = {
  schemaVersion: 1;
  builds: NightBuild[];
  channels: { channel: string; latestBuildId: string | null }[];
  allowNew: { ranked: string[]; multiplayer: string[] };
  legacy: { channel: string; ranked: string; multiplayer: string; backendVersion?: string };
  disabledBackendVersions?: string[];
  retiredRules?: { ranked: string[]; multiplayer: string[] };
};
export type NightAnnouncement = {
  id: string;
  title: string;
  body: string;
  enabled: boolean;
  startsAt: number;
  endsAt?: number;
};
export type NightCompensation = {
  id: string;
  title: string;
  body: string;
  /** Players seen in the game during [loginFrom, loginTo] receive one mail each. */
  loginFrom: number;
  loginTo: number;
  /** Voided before publication: kept for the record, never delivered. */
  voided?: true;
  playerIds?: string[];
  reward: { coins: number; xp: number; packs: number };
};
/** Mirrors the runtime visit retention; older login ranges cannot be verified. */
export const LOGIN_RETENTION_DAYS = 120;
export type NightOperations = {
  announcements: NightAnnouncement[];
  compensations: NightCompensation[];
  release?: NightRelease;
};
export type BackendDeployment = {
  version: string;
  sourceSHA: string | null;
  release: string;
  mode: 'execute' | 'rollback';
  services: string[];
  activeImages: Record<string, string>;
  verifiedAt: number;
  nightRules?: { ranked: string; multiplayer: string };
};
export type Deployments = { current: BackendDeployment | null; history: BackendDeployment[] };
export const defaultNightOperations = (): NightOperations => ({
  announcements: [
    {
      id: 'growth-v1',
      title: '成长与军需上线',
      body: '积分保持原规则。金币、经验独立记录；单人和双人分别配装。技能按冷却重复使用。',
      enabled: true,
      startsAt: Date.parse('2026-11-01T00:00:00+08:00'),
    },
  ],
  compensations: [],
});
export function nightOperationsError(value?: NightOperations) {
  if (!value) return '';
  for (const item of [...value.announcements, ...value.compensations])
    if (!item.title.trim() || !item.body.trim()) return '请填写公告和补偿的标题、正文。';
  for (const item of value.announcements)
    if (
      !Number.isFinite(item.startsAt) ||
      (item.endsAt !== undefined && (!Number.isFinite(item.endsAt) || item.endsAt <= item.startsAt))
    )
      return '公告失效时间必须晚于生效时间。';
  const live = value.announcements.filter((a) => a.enabled).sort((a, b) => a.startsAt - b.startsAt);
  for (let i = 1; i < live.length; i++)
    if ((live[i - 1]!.endsAt ?? Infinity) > live[i]!.startsAt)
      return '同一时间最多只能有一条生效公告；请下线或调整时间重叠的公告。';
  for (const item of value.compensations) {
    if (
      !Number.isFinite(item.loginFrom) ||
      !Number.isFinite(item.loginTo) ||
      item.loginTo <= item.loginFrom
    )
      return '补偿登录时间范围的结束必须晚于开始。';
    const amounts = Object.values(item.reward);
    if (amounts.some((n) => !Number.isSafeInteger(n) || n < 0) || amounts.every((n) => n === 0))
      return '补偿奖励至少一项大于零，且必须是非负整数。';
  }
  return '';
}
export type AnnouncementStatus = 'live' | 'scheduled' | 'expired' | 'offline';
export const announcementStatusNames: Record<AnnouncementStatus, string> = {
  live: '生效中',
  scheduled: '待生效',
  expired: '已过期',
  offline: '已下线',
};
export function announcementStatus(a: NightAnnouncement, now = Date.now()): AnnouncementStatus {
  if (!a.enabled) return 'offline';
  if (a.startsAt > now) return 'scheduled';
  return a.endsAt !== undefined && a.endsAt <= now ? 'expired' : 'live';
}
export type CompensationStatus = 'draft' | 'published' | 'voided';
export const compensationStatusNames: Record<CompensationStatus, string> = {
  draft: '草稿',
  published: '已发布',
  voided: '已作废',
};
export const compensationStatus = (c: NightCompensation, published: Set<string>) =>
  c.voided ? 'voided' : published.has(c.id) ? 'published' : 'draft';
/**
 * Players see at most one announcement. Going live ends an earlier overlapping one at the new
 * start time and takes any later-starting overlap offline.
 */
export function goLive(list: NightAnnouncement[], id: string) {
  const target = list.find((a) => a.id === id)!;
  const end = (a: NightAnnouncement) => a.endsAt ?? Infinity;
  const clashes = list.filter(
    (a) => a.id !== id && a.enabled && a.startsAt < end(target) && target.startsAt < end(a),
  );
  const trimmed = clashes.filter((a) => a.startsAt < target.startsAt);
  return {
    trimmed,
    offline: clashes.filter((a) => !trimmed.includes(a)),
    next: list.map((a) =>
      a.id === id
        ? { ...a, enabled: true }
        : trimmed.includes(a)
          ? { ...a, endsAt: target.startsAt }
          : clashes.includes(a)
            ? { ...a, enabled: false }
            : a,
    ),
  };
}
/** Range checks that only apply before the compensation is first published. */
export function newCompensationError(item: NightCompensation, now = Date.now()) {
  if (item.voided) return '';
  if (item.loginTo > now) return '登录范围的结束时间不能晚于当前时间。';
  if (item.loginFrom < now - LOGIN_RETENTION_DAYS * 86400000)
    return `登录范围最早只能追溯 ${LOGIN_RETENTION_DAYS} 天。`;
  return '';
}
export function nightChanges(before?: NightOperations, after?: NightOperations) {
  const rows: string[] = [];
  for (const [key, label] of [
    ['announcements', '公告'],
    ['compensations', '补偿'],
  ] as const) {
    for (const item of after?.[key] ?? []) {
      const old = before?.[key].find((other) => other.id === item.id);
      const reward = key === 'compensations' ? (item as NightCompensation).reward : undefined;
      if (!same(old, item)) {
        rows.push(
          `${label}：${item.title || item.id} · ${reward ? `${(item as NightCompensation).voided ? '已作废 · ' : ''}${reward.coins} 金币 / ${reward.xp} EXP / ${reward.packs} 补给箱` : (item as NightAnnouncement).enabled ? '上线' : '下线'}`,
        );
        rows.push(`${label}正文：${item.body}`);
      }
    }
    for (const item of before?.[key] ?? [])
      if (!after?.[key].some((other) => other.id === item.id))
        rows.push(`移除${label}：${item.title}`);
  }
  if (!same(before?.release, after?.release)) {
    for (const channel of after?.release?.channels ?? []) {
      const old = before?.release?.channels.find((c) => c.channel === channel.channel);
      if (old?.latestBuildId !== channel.latestBuildId)
        rows.push(
          `${channel.channel} 推荐版本：${old?.latestBuildId ?? '未指定'} → ${channel.latestBuildId ?? '未指定'}`,
        );
    }
    for (const build of after?.release?.builds ?? []) {
      const old = before?.release?.builds.find((b) => b.buildId === build.buildId);
      if (!same(old, build))
        rows.push(
          `前端 ${build.version ?? build.buildId}：${build.removed ? '移除登记' : build.disabled ? '关闭新局' : '启用'} · 后端 ${build.backendVersion ?? '未标记'}`,
        );
    }
    const previous = before?.release?.disabledBackendVersions ?? [],
      next = after?.release?.disabledBackendVersions ?? [];
    for (const version of new Set([...previous, ...next]))
      if (previous.includes(version) !== next.includes(version))
        rows.push(
          `后端兼容版本 ${version}：${next.includes(version) ? '关闭新局服务' : '恢复新局服务'}`,
        );
  }
  return rows;
}
