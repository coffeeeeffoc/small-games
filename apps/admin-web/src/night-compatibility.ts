import type { NightBuild, NightRelease } from './night-operations-model';
import type { GameState } from './control-api';

export type RuntimeRules = { current: string; supported: string[] };
export type NightRuntimeStatus = {
  checkedAt: number;
  report: { instanceId: string; ranked: RuntimeRules; multiplayer: RuntimeRules } | null;
  error: 'UNAVAILABLE' | 'NOT_CONFIGURED' | null;
  otherInstances: string[];
};
export const ruleKinds = [
  ['ranked', '单人'],
  ['multiplayer', '双人'],
] as const;
export type NightRuleKind = (typeof ruleKinds)[number][0];
type RuleClient = Pick<
  NightBuild,
  'ranked' | 'multiplayer' | 'backendVersion' | 'disabled' | 'removed'
>;
export function ruleOrder(client: string, server: string) {
  if (client === server) return '一致';
  const a = /^(.*)-v(\d+)$/.exec(client),
    b = /^(.*)-v(\d+)$/.exec(server);
  if (!a || !b || a[1] !== b[1] || a[2].length > 9 || b[2].length > 9)
    return '版本系列不同，无法排序';
  return Number(a[2]) > Number(b[2])
    ? '客户端较高 / 服务端较低'
    : Number(a[2]) < Number(b[2])
      ? '客户端较低 / 服务端较高'
      : '编号相同，标识不同';
}
export function runtimeReport(status: NightRuntimeStatus | undefined, now = Date.now()) {
  return status && status.checkedAt <= now + 5000 && status.checkedAt > now - 60_000
    ? status.report
    : null;
}
export function ruleSupport(
  kind: NightRuleKind,
  rule: string,
  status: NightRuntimeStatus | undefined,
  now = Date.now(),
) {
  const server = runtimeReport(status, now)?.[kind];
  if (!server) return 'unknown';
  if (!server.supported.includes(rule)) return 'unsupported';
  if (status?.otherInstances.length) return 'partial';
  return rule === server.current ? 'current' : 'retained';
}
export function ruleAdvice(client: string, server: RuntimeRules) {
  const order = ruleOrder(client, server.current);
  if (server.supported.includes(client))
    return order === '一致' ? '与当前规则一致' : `${order}；已保留支持`;
  return order.startsWith('客户端较高')
    ? `${order}；需升级服务端`
    : order.startsWith('客户端较低')
      ? `${order}；需升级客户端或恢复旧规则执行器`
      : `${order}；需部署对应执行器或更换客户端`;
}

export function newGameBlock(
  kind: NightRuleKind,
  build: RuleClient,
  release: NightRelease,
  gameState?: GameState,
) {
  if (gameState === 'disabled') return '游戏已停用';
  if (gameState === 'draining') return '游戏已暂停新局';
  if (build.removed) return '已移除登记';
  if (build.disabled) return '已关闭此包的新局';
  if (release.disabledBackendVersions?.includes(build.backendVersion ?? '')) return '分组已停开';
  if (release.retiredRules?.[kind].includes(build[kind])) return '规则已退役';
  if (!release.allowNew[kind].includes(build[kind])) return '规则未开放新局';
}

export function hasIncompatibleNewGames(
  build: RuleClient,
  release: NightRelease,
  status?: NightRuntimeStatus,
  gameState?: GameState,
) {
  return ruleKinds.some(
    ([kind]) =>
      !newGameBlock(kind, build, release, gameState) &&
      ruleSupport(kind, build[kind], status) === 'unsupported',
  );
}
