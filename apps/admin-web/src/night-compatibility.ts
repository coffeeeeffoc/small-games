import type { NightBuild, NightRelease } from './night-operations-model';

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
export function buildCompatibility(
  build: Pick<NightBuild, 'ranked' | 'multiplayer'>,
  status: NightRuntimeStatus | undefined,
  now = Date.now(),
) {
  const report = runtimeReport(status, now);
  if (!report) return '待核实';
  if (ruleKinds.some(([kind]) => !report[kind].supported.includes(build[kind]))) return '不兼容';
  return status!.otherInstances.length ? '部分实例待核实' : '兼容';
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

export function hasIncompatibleNewGames(
  build: NightBuild,
  release: NightRelease,
  status?: NightRuntimeStatus,
) {
  const report = runtimeReport(status);
  return (
    !!report &&
    !build.removed &&
    !build.disabled &&
    !release.disabledBackendVersions?.includes(build.backendVersion ?? '') &&
    ruleKinds.some(
      ([kind]) =>
        release.allowNew[kind].includes(build[kind]) &&
        !release.retiredRules?.[kind].includes(build[kind]) &&
        !report[kind].supported.includes(build[kind]),
    )
  );
}
