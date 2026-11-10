import { useEffect, useState } from 'react';
import { Alert, Card, Input, Modal, Select, Tabs, Tag } from 'antd';
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

import { NightOperationsEditor } from './night-operations-editor';
import {
  newCompensationError,
  nightChanges,
  nightOperationsError,
  type Deployments,
} from './night-operations-model';

const stateNames = { enabled: '开放', draining: '停止新局', disabled: '停用并终止旧局结算' };
const editableSnapshot = (snapshot: Snapshot): Snapshot => ({
  ...snapshot,
  games: { 'night-overwatch': 'disabled', tetracube: 'disabled', ...snapshot.games },
});
/** Diff grouped by what it affects, so game-specific edits read as belonging to that game. */
function changeGroups(before: Snapshot | null, after: Snapshot) {
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
function Changes({ before, after }: { before: Snapshot | null; after: Snapshot }) {
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
function TabLabel({ name, count }: { name: string; count?: number }) {
  return (
    <>
      {name}
      {/* Hidden from the accessible name; the save bar lists the same counts in words. */}
      {!!count && (
        <span className="tab-count" aria-hidden="true">
          {count}
        </span>
      )}
    </>
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
  const [pageTab, setPageTab] = useState<'games' | 'night' | 'history'>('games');
  const nightTab = pageTab === 'night';
  const [showDiff, setShowDiff] = useState(false);
  const [viewing, setViewing] = useState<Revision>();
  const [deployments, setDeployments] = useState<Deployments>();
  const [conflict, setConflict] = useState<ControlState>();
  const canWrite = session.permissions.includes('control.write');
  const canPublish = session.permissions.includes('control.publish');
  async function load() {
    const [nextState, nextCatalog, history, deployed] = await Promise.all([
      api.read<ControlState>('state'),
      api.read<Catalog>('catalog'),
      api.read<Revision[]>('revisions'),
      gamesOnly ? api.read<Deployments>('deployments') : undefined,
    ]);
    if (
      !Array.isArray(history) ||
      history.some(
        (row) => row.publishedVersion !== null && !Number.isSafeInteger(row.publishedVersion),
      )
    )
      throw new ApiError('UNAVAILABLE');
    setState(nextState);
    setDeployments(deployed);
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
  const dirty =
    JSON.stringify(draftSnapshot) !==
    JSON.stringify(
      state?.snapshot
        ? editableSnapshot(state.snapshot)
        : { apiOrigins: [], games: snapshot.games },
    );
  const publishedIds = new Set([
    ...revisions
      .filter((r) => r.publishedVersion !== null)
      .flatMap((r) => r.snapshot.nightOperations?.compensations.map((c) => c.id) ?? []),
    ...(state?.snapshot?.nightOperations?.compensations.map((c) => c.id) ?? []),
    ...(state?.publishedNightCompensationIds ?? []),
  ]);
  const operationsError =
    nightOperationsError(snapshot.nightOperations) ||
    (snapshot.nightOperations?.compensations ?? [])
      .filter((c) => !publishedIds.has(c.id))
      .map((c) => newCompensationError(c))
      .find(Boolean) ||
    '';
  const groups = state ? changeGroups(state.snapshot, draftSnapshot) : [];
  const pending = Object.fromEntries(groups.map((g) => [g.key, g.rows.length]));
  // A published row is compared with the version before it; a draft with its base version.
  const previousOf = (row: Revision) =>
    revisions.find(
      (r) => r.publishedVersion === (row.publishedVersion ?? row.parentVersion + 1) - 1,
    )?.snapshot ?? null;
  const changeCount = groups.reduce((n, g) => n + g.rows.length, 0);
  const step = saved ? 2 : changeCount ? 0 : -1;
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
          {/* One panel above every tab: the draft is global, so its status and actions live here. */}
          <section className="release-panel" role="region" aria-label="保存与发布">
            <div className="release-head">
              <div>
                <strong className="release-title">配置发布</strong>
                <span className="control-help">
                  游戏开关、夜航运营与公共配置共用一份草稿，保存后需发布才会一起生效。
                </span>
              </div>
              <div className="control-summary">
                <Tag color="blue">当前版本 {state.version}</Tag>
                <Tag>{stateLabel[state.status]}</Tag>
                <span>编辑基线 {base}</span>
              </div>
            </div>
            <ol className="release-steps" aria-label="发布步骤">
              {[
                ['编辑配置', changeCount ? `${changeCount} 项改动` : '暂无改动'],
                ['保存草稿', saved ? '已保存' : '填写理由后保存'],
                ['发布生效', saved ? '待确认发布' : '保存后可发布'],
              ].map(([name, note], i) => (
                <li key={name} className={i < step ? 'done' : i === step ? 'current' : undefined}>
                  <span className="step-index">{i + 1}</span>
                  <span>
                    <strong>{name}</strong>
                    <small>{note}</small>
                  </span>
                </li>
              ))}
            </ol>
            <div className="release-changes">
              <span>待发布改动：</span>
              {groups.map((g) => (
                <Tag key={g.key} color={g.rows.length ? 'gold' : undefined}>
                  {g.short} {g.rows.length} 项
                </Tag>
              ))}
              <Button type="link" disabled={!changeCount} onClick={() => setShowDiff((v) => !v)}>
                {showDiff ? '收起改动' : '查看改动'}
              </Button>
            </div>
            {showDiff && <Changes before={state.snapshot} after={draftSnapshot} />}
            {operationsError && <Alert type="error" title={operationsError} />}
            <div className="release-form">
              <label htmlFor="draft-reason">变更理由</label>
              <Input
                id="draft-reason"
                aria-label="变更理由"
                maxLength={500}
                placeholder="简述本次改动，例如：维护补偿 / 新版本公告"
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
                  type={saved ? 'default' : 'primary'}
                  disabled={
                    !canWrite || !reason.trim() || !originsValid || !!operationsError || !!conflict
                  }
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
                  type={saved ? 'primary' : 'default'}
                  disabled={!canPublish || !saved || !!conflict || operation.busy}
                  onClick={() => setPublishConfirm(true)}
                >
                  发布此草稿
                </Button>
                <Button disabled={operation.busy} onClick={() => void operation.run(load)}>
                  放弃编辑并重新读取
                </Button>
              </div>
            </div>
            {saved && (
              <Alert
                type="success"
                showIcon
                title="草稿已保存，尚未发布"
                description={`理由：${saved.reason} · 基线版本 ${saved.parentVersion}。核对改动后点击“发布此草稿”。`}
              />
            )}
          </section>
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
          {gamesOnly && (
            <Tabs
              className="page-tabs"
              activeKey={pageTab}
              onChange={(key) => setPageTab(key as typeof pageTab)}
              items={[
                { key: 'games', label: <TabLabel name="游戏开关" count={pending.games} /> },
                { key: 'night', label: <TabLabel name="夜航运营" count={pending.night} /> },
                { key: 'history', label: '发布记录' },
              ]}
            />
          )}
          {pageTab !== 'history' && (
            <>
              <Card
                title={
                  gamesOnly ? (nightTab ? '夜航运营草稿' : '游戏运行策略') : '公共 API 允许来源'
                }
              >
                {gamesOnly && nightTab ? (
                  <NightOperationsEditor
                    value={snapshot.nightOperations}
                    published={state.snapshot?.nightOperations}
                    publishedIds={publishedIds}
                    deployments={deployments}
                    disabled={!canWrite || operation.busy}
                    canPublish={canPublish && !conflict}
                    busy={operation.busy}
                    dirty={dirty}
                    change={(nightOperations) => edited({ ...snapshot, nightOperations })}
                    rollback={async (build, note) => {
                      let completed = false;
                      await operation.run(() =>
                        versioned(async () => {
                          await api.rollbackNightRelease(build.channel, build.buildId, base, note);
                          await load();
                          completed = true;
                          operation.success('渠道推荐版本已回退，公告与补偿已保留。');
                        }),
                      );
                      return completed;
                    }}
                  />
                ) : gamesOnly ? (
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
                                  edited({
                                    ...snapshot,
                                    games: { ...snapshot.games, [row.id]: value },
                                  })
                                }
                              />
                            ),
                          },
                          {
                            title: '终止代次',
                            key: 'epoch',
                            render: (_, row) =>
                              state.policies.find((policy) => policy.gameId === row.id)
                                ?.killEpoch ?? '未知',
                          },
                        ]}
                      />
                    </div>
                    <p className="control-help">
                      停止新局会保留在途对局；停用会终止旧局结算，重新开放不会恢复旧局资格。只有发布后才改变目标策略。
                    </p>
                    {catalog.independentGames.map((game) => (
                      <Alert
                        key={game.id}
                        type="warning"
                        title={`${game.id} · 独立服务，尚未纳管`}
                      />
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
                  <p className="control-help">
                    草稿保留 {originList.length} 个公共 API 来源；可在“公共配置”页面核对。
                  </p>
                )}
              </Card>
            </>
          )}
          <Modal
            open={publishConfirm && !!saved}
            title="确认发布此草稿"
            width={720}
            destroyOnHidden
            getContainer={false}
            onCancel={() => setPublishConfirm(false)}
            footer={null}
          >
            {saved && (
              <>
                <p>
                  将从版本 {base} 发布新版本；理由：{saved.reason}。以下改动将一起生效：
                </p>
                <Changes before={state.snapshot} after={saved.snapshot} />
                <div className="control-actions modal-actions">
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
              </>
            )}
          </Modal>
          {(!gamesOnly || pageTab === 'history') && (
            <Card title="草稿与发布历史">
              <p className="control-help">
                每次保存草稿和发布都会留下记录（理由、时间、改动）；成员操作明细见“审计”页。
              </p>
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
                          <Button type="link" onClick={() => setViewing(row)}>
                            查看改动
                          </Button>
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
              <p>公告、补偿和游戏版本策略保留当前配置。</p>
              <Changes
                before={state.snapshot}
                after={{ ...rollback.snapshot, nightOperations: state.snapshot?.nightOperations }}
              />
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
          <Modal
            open={!!viewing}
            title={
              viewing?.publishedVersion === null
                ? '未发布草稿的改动'
                : `版本 ${viewing?.publishedVersion} 的改动`
            }
            width={720}
            destroyOnHidden
            getContainer={false}
            onCancel={() => setViewing(undefined)}
            footer={<Button onClick={() => setViewing(undefined)}>关闭</Button>}
          >
            {viewing && (
              <>
                <p className="control-help">
                  理由：{viewing.reason} · {dateLabel(viewing.createdAt)}
                </p>
                <Changes before={previousOf(viewing)} after={viewing.snapshot} />
              </>
            )}
          </Modal>
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
