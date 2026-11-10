import { Alert } from 'antd';
import type { Snapshot } from './control-api';
import { gameNames } from './control-common';
import { nightChanges } from './night-operations-model';

export const stateNames = { enabled: '开放', draining: '停止新局', disabled: '停用并终止旧局结算' };
export const editableSnapshot = (snapshot: Snapshot): Snapshot => ({
  ...snapshot,
  games: { 'night-overwatch': 'disabled', tetracube: 'disabled', ...snapshot.games },
});
/** Diff grouped by what it affects, so game-specific edits read as belonging to that game. */
export function changeGroups(before: Snapshot | null, after: Snapshot) {
  before = before && editableSnapshot(before);
  after = editableSnapshot(after);
  const was = (id: string) => (before ? stateNames[before.games[id]] : '未发布');
  const changed = (id: string) => before?.games[id] !== after.games[id];
  return [
    {
      key: 'night',
      short: '夜航守望',
      title: '夜航守望（运行状态、公告、补偿、版本）',
      rows: [
        ...(changed('night-overwatch')
          ? [`运行状态：${was('night-overwatch')} → ${stateNames[after.games['night-overwatch']]}`]
          : []),
        ...nightChanges(before?.nightOperations, after.nightOperations),
      ],
    },
    {
      key: 'games',
      short: '其他游戏开关',
      title: '其他游戏开关',
      rows: Object.keys(after.games)
        .filter((id) => id !== 'night-overwatch' && changed(id))
        .map((id) => `${gameNames[id] ?? id}：${was(id)} → ${stateNames[after.games[id]]}`),
    },
    {
      key: 'origins',
      short: '公共 API 来源',
      title: '公共 API 允许来源（所有游戏共用）',
      rows: [
        ...after.apiOrigins
          .filter((origin) => !before?.apiOrigins.includes(origin))
          .map((origin) => `新增来源：${origin}`),
        ...(before?.apiOrigins ?? [])
          .filter((origin) => !after.apiOrigins.includes(origin))
          .map((origin) => `移除来源：${origin}`),
      ],
    },
  ];
}
export function Changes({ before, after }: { before: Snapshot | null; after: Snapshot }) {
  const groups = changeGroups(before, after).filter((g) => g.rows.length);
  return (
    <div className="config-groups" aria-label="配置差异">
      {!after.apiOrigins.length && (
        <Alert
          type="warning"
          showIcon
          title="公共 API 允许来源为空"
          description="发布后所有网页与 H5 客户端（包括 TapTap H5 包）的请求都会被拒绝（ORIGIN_REJECTED）。请在“公共配置”填写客户端来源。"
        />
      )}
      {groups.length ? (
        groups.map((group) => (
          <section key={group.key} className="config-group">
            <h4>{group.title}</h4>
            <ul className="config-diff">
              {group.rows.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className="control-help">配置内容没有变化；确认后仍会创建新版本。</p>
      )}
    </div>
  );
}
