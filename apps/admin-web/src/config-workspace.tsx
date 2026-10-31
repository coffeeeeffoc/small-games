import { useEffect, useState } from 'react';
import { Alert, Card, Input, Select, Tag } from 'antd';
import {
  ApiError,
  dateLabel,
  validOrigin,
  type Catalog,
  type ControlApi,
  type ControlState,
  type GameState,
  type Revision,
  type RevisionData,
  type Session,
  type Snapshot,
} from './control-api';
import {
  ActionButton as Button,
  DataTable as Table,
  Failure,
  gameNames,
  PageTitle,
  useOperation,
} from './control-common';

const stateNames = { enabled: '开放', draining: '停止新局', disabled: '停用并终止旧局结算' };
const editableSnapshot = (snapshot: Snapshot): Snapshot => ({
  ...snapshot,
  games: { 'night-overwatch': 'disabled', tetracube: 'disabled', ...snapshot.games },
});
function Changes({ before, after }: { before: Snapshot | null; after: Snapshot }) {
  before = before && editableSnapshot(before);
  after = editableSnapshot(after);
  const rows = [
    ...after.apiOrigins
      .filter((origin) => !before?.apiOrigins.includes(origin))
      .map((origin) => `新增来源：${origin}`),
    ...(before?.apiOrigins ?? [])
      .filter((origin) => !after.apiOrigins.includes(origin))
      .map((origin) => `移除来源：${origin}`),
    ...Object.entries(after.games)
      .filter(([id, state]) => before?.games[id] !== state)
      .map(
        ([id, state]) =>
          `${gameNames[id] ?? id}：${before ? stateNames[before.games[id]] : '未发布'} → ${stateNames[state]}`,
      ),
  ];
  return (
    <ul className="config-diff" aria-label="配置差异">
      {rows.length ? (
        rows.map((row) => <li key={row}>{row}</li>)
      ) : (
        <li>公共配置内容没有变化；确认后仍会创建新版本。</li>
      )}
    </ul>
  );
}
export function ConfigWorkspace({
  api,
  session,
  gamesOnly,
}: {
  api: ControlApi;
  session: Session;
  gamesOnly: boolean;
}) {
  const operation = useOperation();
  const [state, setState] = useState<ControlState>();
  const [catalog, setCatalog] = useState<Catalog>();
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot>({ apiOrigins: [], games: {} });
  const [origins, setOrigins] = useState('');
  const [reason, setReason] = useState('');
  const [base, setBase] = useState(0);
  const [saved, setSaved] = useState<RevisionData>();
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [rollback, setRollback] = useState<Revision>();
  const [rollbackReason, setRollbackReason] = useState('');
  const [conflict, setConflict] = useState<ControlState>();
  const canWrite = session.permissions.includes('control.write');
  const canPublish = session.permissions.includes('control.publish');
  async function load() {
    const [nextState, nextCatalog, history] = await Promise.all([
      api.read<ControlState>('state'),
      api.read<Catalog>('catalog'),
      api.read<Revision[]>('revisions'),
    ]);
    if (
      !Array.isArray(history) ||
      history.some(
        (row) => row.publishedVersion !== null && !Number.isSafeInteger(row.publishedVersion),
      )
    )
      throw new ApiError('UNAVAILABLE');
    setState(nextState);
    setCatalog(nextCatalog);
    setRevisions(history);
    setBase(nextState.version);
    const initial = nextState.snapshot ?? {
      apiOrigins: [],
      games: Object.fromEntries(
        nextCatalog.games.map((id) => [
          id,
          ['night-overwatch', 'tetracube'].includes(id) ? 'disabled' : 'enabled',
        ]),
      ) as Snapshot['games'],
    };
    setSnapshot(editableSnapshot(initial));
    setOrigins(initial.apiOrigins.join('\n'));
    setSaved(undefined);
    setPublishConfirm(false);
    setConflict(undefined);
  }
  useEffect(() => {
    void operation.run(load);
  }, [api]);
  async function versioned(work: () => Promise<void>) {
    try {
      await work();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
        const latest = await api.read<ControlState>('state');
        setState(latest);
        setConflict(latest);
        setSaved(undefined);
        setPublishConfirm(false);
      }
      throw error;
    }
  }
  function edited(next: Snapshot) {
    setSnapshot(next);
    setSaved(undefined);
    setPublishConfirm(false);
  }
  const originList = origins
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  const originsValid =
    originList.length <= 32 &&
    originList.every(validOrigin) &&
    new Set(originList).size === originList.length;
  const draftSnapshot = { ...snapshot, apiOrigins: originList };
  const stateLabel = {
    unpublished: '未发布 · 保留现有环境策略',
    desired: '待应用',
    partial: '部分已知应用匹配',
    observed: '已知应用版本匹配',
  };
  return (
    <>
      <PageTitle
        title={gamesOnly ? '游戏状态' : '公共配置'}
        note="先保存草稿，再明确发布。发布写入目标版本，不代表全部服务已生效。"
      />
      <Failure
        error={operation.error}
        retry={!state ? () => void operation.run(load) : undefined}
      />
      {!state || !catalog ? (
        <p role="status">正在读取配置…</p>
      ) : (
        <>
          <div className="control-summary">
            <Tag color="blue">当前版本 {state.version}</Tag>
            <Tag>{stateLabel[state.status]}</Tag>
            <span>编辑基线 {base}</span>
          </div>
          <Alert
            type="info"
            title="应用覆盖尚不完整"
            description={
              <>
                <p>只展示已知实例的报告，不能据此判断完整部署覆盖或服务健康。</p>
                {state.observationCoverage.missingConsumers.length > 0 && (
                  <p>缺少新鲜报告：{state.observationCoverage.missingConsumers.join('、')}</p>
                )}
                {state.observationCoverage.expiredUnknown.map((item) => (
                  <p key={`${item.consumer}/${item.instanceId}`}>
                    状态未知：{item.consumer} / {item.instanceId}（报告过期，不能视为进程已停止）
                  </p>
                ))}
              </>
            }
          />
          {conflict && (
            <Card title="版本冲突 · 输入已保留" className="conflict-panel">
              <p>
                编辑基线 {base}，当前版本 {conflict.version}。请比较你的草稿与最新配置。
              </p>
              <Changes before={conflict.snapshot} after={draftSnapshot} />
              <Button
                onClick={() => {
                  setBase(conflict.version);
                  setConflict(undefined);
                  setSaved(undefined);
                  setPublishConfirm(false);
                  operation.clearError();
                }}
              >
                已核对差异，采用版本 {conflict.version} 作为新基线
              </Button>
            </Card>
          )}
          <Card title={gamesOnly ? '游戏运行策略' : '公共 API 允许来源'}>
            {gamesOnly ? (
              <>
                <div className="table-scroll">
                  <Table
                    pagination={false}
                    rowKey="id"
                    aria-label="游戏运行策略"
                    dataSource={catalog.games.map((id) => ({ id }))}
                    columns={[
                      {
                        title: '游戏',
                        dataIndex: 'id',
                        render: (_, { id }) => (
                          <>
                            <strong>{gameNames[id] ?? id}</strong>
                            <small className="control-id">{id}</small>
                          </>
                        ),
                      },
                      {
                        title: '草稿状态',
                        key: 'state',
                        render: (_, row) => (
                          <Select
                            aria-label={`${row.id} 状态`}
                            value={snapshot.games[row.id]}
                            disabled={!canWrite || operation.busy}
                            options={Object.entries(stateNames).map(([value, label]) => ({
                              value,
                              label,
                            }))}
                            onChange={(value: GameState) =>
                              edited({ ...snapshot, games: { ...snapshot.games, [row.id]: value } })
                            }
                          />
                        ),
                      },
                      {
                        title: '终止代次',
                        key: 'epoch',
                        render: (_, row) =>
                          state.policies.find((policy) => policy.gameId === row.id)?.killEpoch ??
                          '未知',
                      },
                    ]}
                  />
                </div>
                <p className="control-help">
                  停止新局会保留在途对局；停用会终止旧局结算，重新开放不会恢复旧局资格。只有发布后才改变目标策略。
                </p>
                {catalog.independentGames.map((game) => (
                  <Alert key={game.id} type="warning" title={`${game.id} · 独立服务，尚未纳管`} />
                ))}
              </>
            ) : (
              <>
                <label htmlFor="api-origins">每行一个完整 Origin（协议、域名、可选端口）</label>
                <Input.TextArea
                  id="api-origins"
                  aria-label="公共 API Origins"
                  rows={5}
                  value={origins}
                  disabled={!canWrite || operation.busy}
                  onChange={(event) => {
                    setOrigins(event.target.value);
                    setSaved(undefined);
                    setPublishConfirm(false);
                  }}
                />
                <p className="control-help">
                  不接受路径、尾斜线、通配符、账号密码、查询参数或管理站点。留空表示明确不允许跨域来源，不会自动加入平台域名。
                </p>
                {!originsValid && (
                  <Alert type="error" title="来源必须是规范且不重复的公共 HTTP(S) Origin。" />
                )}
              </>
            )}
            {gamesOnly && (
              <p>草稿保留 {originList.length} 个公共 API 来源；可在“公共配置”页面核对。</p>
            )}
            <label htmlFor="draft-reason">变更理由</label>
            <Input.TextArea
              id="draft-reason"
              aria-label="变更理由"
              rows={3}
              maxLength={500}
              value={reason}
              disabled={!canWrite || operation.busy}
              onChange={(event) => {
                setReason(event.target.value);
                setSaved(undefined);
                setPublishConfirm(false);
              }}
            />
            <div className="control-actions">
              <Button
                type="primary"
                disabled={!canWrite || !reason.trim() || !originsValid || !!conflict}
                loading={operation.busy}
                onClick={() =>
                  void operation.run(() =>
                    versioned(async () => {
                      const revision = await api.draft({
                        expectedVersion: base,
                        snapshot: draftSnapshot,
                        reason: reason.trim(),
                      });
                      setSaved(revision);
                      setRevisions(await api.read<Revision[]>('revisions'));
                      operation.success('草稿已保存，尚未发布。');
                    }),
                  )
                }
              >
                保存草稿
              </Button>
              <Button
                disabled={!canPublish || !saved || !!conflict || operation.busy}
                onClick={() => setPublishConfirm(true)}
              >
                发布此草稿
              </Button>
              <Button disabled={operation.busy} onClick={() => void operation.run(load)}>
                放弃编辑并重新读取
              </Button>
            </div>
          </Card>
          {saved && (
            <Alert
              type="success"
              title="草稿已保存，尚未发布"
              description={`草稿 ${saved.id} · 基线 ${saved.parentVersion} · ${saved.reason}`}
            />
          )}
          {publishConfirm && saved && (
            <Card title="确认发布此草稿" className="confirmation">
              <p>
                将从版本 {base} 发布新版本；理由：{saved.reason}
              </p>
              <Changes before={state.snapshot} after={saved.snapshot} />
              <div className="control-actions">
                <Button
                  type="primary"
                  loading={operation.busy}
                  disabled={!!conflict}
                  onClick={() =>
                    void operation.run(() =>
                      versioned(async () => {
                        await api.publish(saved.id, base);
                        await load();
                        operation.success('目标版本已发布，等待应用报告。');
                      }),
                    )
                  }
                >
                  确认发布
                </Button>
                <Button onClick={() => setPublishConfirm(false)}>取消发布</Button>
              </div>
            </Card>
          )}
          {!gamesOnly && (
            <Card title="草稿与发布历史">
              <div className="table-scroll">
                <Table
                  pagination={false}
                  rowKey="id"
                  aria-label="草稿与发布历史"
                  dataSource={revisions}
                  columns={[
                    {
                      title: '记录',
                      key: 'revision',
                      render: (_, row) => (
                        <>
                          <strong>
                            {row.publishedVersion === null
                              ? '未发布草稿'
                              : `已发布版本 ${row.publishedVersion}`}
                          </strong>
                          <small className="control-id">{row.id}</small>
                          {row.id === state.revisionId && <Tag>当前目标</Tag>}
                        </>
                      ),
                    },
                    {
                      title: '理由 / 时间',
                      key: 'reason',
                      render: (_, row) => (
                        <>
                          {row.reason}
                          <small className="control-id">{dateLabel(row.createdAt)}</small>
                        </>
                      ),
                    },
                    {
                      title: '操作',
                      key: 'actions',
                      render: (_, row) =>
                        row.publishedVersion === null ? (
                          <Button
                            disabled={
                              row.parentVersion !== state.version ||
                              (!canWrite && !canPublish) ||
                              operation.busy
                            }
                            onClick={() => {
                              setBase(row.parentVersion);
                              setSnapshot(editableSnapshot(row.snapshot));
                              setOrigins(row.snapshot.apiOrigins.join('\n'));
                              setReason(row.reason);
                              setSaved(row);
                              setPublishConfirm(false);
                              setConflict(undefined);
                            }}
                          >
                            载入草稿
                          </Button>
                        ) : (
                          <Button
                            disabled={!canPublish || row.id === state.revisionId || operation.busy}
                            onClick={() => {
                              setRollback(row);
                              setRollbackReason('');
                            }}
                          >
                            准备回退
                          </Button>
                        ),
                    },
                  ]}
                />
              </div>
            </Card>
          )}
          {rollback && (
            <Card title={`回退至已发布版本 ${rollback.publishedVersion}`} className="confirmation">
              <p>回退会从当前版本 {state.version} 创建新版本，历史不会删除。</p>
              <Changes before={state.snapshot} after={rollback.snapshot} />
              <label htmlFor="rollback-reason">回退理由</label>
              <Input.TextArea
                id="rollback-reason"
                aria-label="回退理由"
                rows={3}
                value={rollbackReason}
                maxLength={500}
                onChange={(event) => setRollbackReason(event.target.value)}
              />
              <div className="control-actions">
                <Button
                  danger
                  disabled={!rollbackReason.trim() || !!conflict}
                  loading={operation.busy}
                  onClick={() =>
                    void operation.run(() =>
                      versioned(async () => {
                        await api.rollback(rollback.id, base, rollbackReason.trim());
                        setRollback(undefined);
                        await load();
                        operation.success('回退已创建新目标版本，等待应用报告。');
                      }),
                    )
                  }
                >
                  确认回退
                </Button>
                <Button onClick={() => setRollback(undefined)}>取消回退</Button>
              </div>
            </Card>
          )}
          {state.observations.length > 0 && (
            <Card title="已知应用报告">
              <ul>
                {state.observations.map((item) => (
                  <li key={`${item.consumer}/${item.instanceId}`}>
                    {item.consumer} / {item.instanceId} · 版本 {item.version} ·{' '}
                    {item.status === 'applied' ? '已报告应用' : '应用失败'} ·{' '}
                    {dateLabel(item.observedAt)}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </>
  );
}
