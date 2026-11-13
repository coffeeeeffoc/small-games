import type { NightOperations } from './night-operations-model';

export const permissions = [
  'control.read',
  'control.write',
  'control.publish',
  'members.read',
  'members.write',
  'roles.read',
  'roles.write',
  'audit.read',
] as const;
export type Permission = (typeof permissions)[number];
export type GameState = 'enabled' | 'draining' | 'disabled';
export type Snapshot = {
  apiOrigins: string[];
  games: Record<string, GameState>;
  nightOperations?: NightOperations;
};
export type Session = {
  login: string;
  csrfToken: string;
  roles: string[];
  permissions: Permission[];
};
export type Catalog = {
  games: string[];
  permissions: Permission[];
  independentGames: { id: string; managed: false }[];
};
export type RevisionData = {
  id: string;
  parentVersion: number;
  snapshot: Snapshot;
  reason: string;
  actor: string;
  rollbackOf: string | null;
  digest: string;
  createdAt: number;
};
export type Revision = RevisionData & { publishedVersion: number | null };
export type Observation = {
  consumer: string;
  instanceId: string;
  version: number;
  digest: string;
  status: 'applied' | 'failed';
  observedAt: number;
};
export type ControlState = {
  version: number;
  revisionId: string | null;
  configured: boolean;
  snapshot: Snapshot | null;
  digest: string | null;
  policies: { gameId: string; state: GameState; killEpoch: number; revision: number }[];
  observations: Observation[];
  publishedNightCompensationIds?: string[];
  observationCoverage: {
    complete: false;
    missingConsumers: string[];
    expiredUnknown: { consumer: string; instanceId: string }[];
  };
  status: 'unpublished' | 'desired' | 'partial' | 'observed';
};
export type Member = {
  id: string;
  email: string;
  githubId: string | null;
  active: boolean;
  roleIds: string[];
};
export type Role = { id: string; name: string; permissions: Permission[]; builtin: boolean };
export type Audit = {
  id: string;
  actor: string;
  action: string;
  target: string;
  detail: Record<string, unknown>;
  createdAt: number;
};
const errors: Record<string, string> = {
  NIGHT_COMPENSATION_IMMUTABLE: '已发布补偿的内容、奖励和资格不能修改。请新建补偿。',
  NIGHT_COMPENSATION_FUTURE_ELIGIBILITY: '补偿账号截止时间不能在未来。',
  NIGHT_BUILD_IMMUTABLE: '已发布的构建标识不能绑定其他版本或规则。请登记新构建。',
  NIGHT_BUILD_REMOVAL_REQUIRED: '已发布构建须使用移除开关，不能删除历史登记。',
  NIGHT_RELEASE_NOT_CONFIGURED: '尚未发布游戏版本配置。',
  NIGHT_BUILD_NOT_FOUND: '该渠道版本不存在，请重新读取。',
  NIGHT_BUILD_REMOVED: '该版本已移除，请先恢复登记并发布。',
  NIGHT_BUILD_DISABLED: '该版本已关闭，请先恢复并发布。',
  NIGHT_BACKEND_DISABLED: '该版本绑定的后端服务已关闭，请先恢复并发布。',
  NIGHT_RULE_RETIRED: '该版本规则已退役，不能回退。',
  NIGHT_RULE_DISABLED: '该版本规则未开放新局，不能回退。',
  FORBIDDEN: '访问权限已变化，正在重新确认登录状态。',
  forbidden: '成员权限已撤销，请重新登录。',
  authentication_required: '登录已过期，请重新登录。',
  VERSION_CONFLICT: '版本已变化。草稿已保留，请对照最新配置后重新确认。',
  LAST_ADMINISTRATOR: '必须保留至少一位已绑定 GitHub 的有效管理员。',
  BUILTIN_ROLE: '内置管理员角色不能修改或删除。',
  ROLE_IN_USE: '该角色仍有成员引用，请先调整成员。',
  BOUND_EMAIL_IMMUTABLE: '已绑定 GitHub 的成员邮箱不能直接修改。',
  MEMBER_CONFLICT: '成员邮箱已存在，请检查后重试。',
  UNKNOWN_ROLE: '角色目录已变化，请重新读取。',
  INVALID_INPUT: '输入不符合要求，请检查字段。',
  NOT_FOUND: '对象已不存在，请刷新列表。',
  invalid_csrf: '会话已变化，请重新确认登录状态。',
  invalid_origin: '请求来源未获允许。',
};
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status = 0,
  ) {
    super(errors[code] ?? '操作暂未完成，请稍后手动重试。');
  }
}
/** Only same-origin, fixed API paths; mutations are never retried. */
export function createControlApi(session: Session, accessLost: () => Promise<void>) {
  let refreshing: Promise<void> | undefined;
  async function request<T>(path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`/api/control/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers:
          body === undefined
            ? undefined
            : { 'content-type': 'application/json', 'x-csrf-token': session.csrfToken },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new ApiError('UNAVAILABLE');
    }
    const result = await response.json().catch(() => undefined);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        refreshing ??= accessLost();
        await refreshing;
      }
      throw new ApiError(
        typeof result?.error === 'string' ? result.error : 'UNAVAILABLE',
        response.status,
      );
    }
    if (result === undefined) throw new ApiError('UNAVAILABLE');
    return result as T;
  }
  return {
    read: <T>(
      path:
        | 'catalog'
        | 'state'
        | 'revisions'
        | 'members'
        | 'roles'
        | 'audit'
        | 'deployments'
        | 'night-runtime',
    ) => request<T>(path),
    draft: (body: {
      expectedVersion: number;
      snapshot: Snapshot;
      reason: string;
      scope?: 'public' | 'games';
    }) => request<RevisionData>('revisions', body),
    publish: (id: string, expectedVersion: number) =>
      request(`revisions/${encodeURIComponent(id)}/publish`, { expectedVersion }),
    rollback: (revisionId: string, expectedVersion: number, reason: string) =>
      request('rollback', { revisionId, expectedVersion, reason }),
    rollbackNightRelease: (
      channel: string,
      buildId: string,
      expectedVersion: number,
      reason: string,
    ) => request('night-release/rollback', { channel, buildId, expectedVersion, reason }),
    member: (id: string | undefined, body: unknown) =>
      request(`members${id ? `/${encodeURIComponent(id)}` : ''}`, body),
    deleteMember: (id: string, reason: string) =>
      request(`members/${encodeURIComponent(id)}/delete`, { reason }),
    role: (id: string, body: unknown) => request(`roles/${encodeURIComponent(id)}`, body),
    deleteRole: (id: string, reason: string) =>
      request(`roles/${encodeURIComponent(id)}/delete`, { reason }),
  };
}
export type ControlApi = ReturnType<typeof createControlApi>;
export const dateLabel = (value: number) =>
  new Date(value).toLocaleString('zh-CN', { hour12: false });
export function validOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      !value.includes('*') &&
      ['http:', 'https:'].includes(url.protocol) &&
      url.origin === value &&
      !url.username &&
      !url.password &&
      value !== location.origin &&
      value !== 'https://admin.nenggongzhiren.cn'
    );
  } catch {
    return false;
  }
}
