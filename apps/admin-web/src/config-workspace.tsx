import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useUnsavedChanges } from './unsaved-changes';
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
import { changeGroups, Changes, editableSnapshot, stateNames } from './config-changes';
import {
  newCompensationError,
  nightChanges,
  nightOperationsError,
  type Deployments,
  same,
} from './night-operations-model';

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
  const [pageTab, setPageTab] = useState<'games' | 'night'>('games');
  const [editorVersion, setEditorVersion] = useState(0);
  const nightTab = pageTab === 'night';
  const [releaseOpen, setReleaseOpen] = useState(false);
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
    setReleaseOpen(false);
    setReason('');
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
        setReleaseOpen(false);
      }
      throw error;
    }
  }
  function edited(next: Snapshot) {
    setSnapshot(next);
    setSaved(undefined);
    setPublishConfirm(false);
  }
  // The release dialog always opens blank: no previous reason, saved-draft notice, confirm step or error.
  function openRelease() {
    setReason('');
    setSaved(undefined);
    setPublishConfirm(false);
    operation.clearError();
    setReleaseOpen(true);
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
  const dirty = !same(
    draftSnapshot,
    state?.snapshot ? editableSnapshot(state.snapshot) : { apiOrigins: [], games: snapshot.games },
  );
  useUnsavedChanges(!!state && (dirty || !!saved || (releaseOpen && !!reason)));
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
  // Each page publishes only its own area; the other area stays at its published value.
  const ownKeys = gamesOnly ? ['night', 'games'] : ['origins'];
  const ownGroups = groups.filter((g) => ownKeys.includes(g.key));
  const changeCount = ownGroups.reduce((n, g) => n + g.rows.length, 0);
  // Scoped drafts copy the other page's area from the live head, so only the very first
  // publication (no head yet) can carry another page's defaults: say so instead of hiding it.
  const otherCount = state?.snapshot
    ? 0
    : groups.filter((g) => !ownKeys.includes(g.key)).reduce((n, g) => n + g.rows.length, 0);
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
          {/* Compact, always-visible status; the reason and actions live in the release dialog. */}
          <section className="release-bar" role="region" aria-label="保存与发布">
            <div className="release-status">
              <strong>{gamesOnly ? '游戏配置' : '公共配置'}</strong>
              <span className={changeCount || saved ? 'pending' : undefined}>
                {saved
                  ? '草稿已保存，待发布'
                  : changeCount
                    ? `有 ${changeCount} 项改动未发布`
                    : '与线上一致'}
              </span>
              {ownGroups
                .filter((g) => g.rows.length)
                .map((g) => (
                  <Tag key={g.key} color="gold">
                    {g.short} {g.rows.length} 项
                  </Tag>
                ))}
            </div>
            <div className="control-actions">
              <Link to="/releases" className="release-link">
                发布记录
              </Link>
              {(dirty || saved) && (
                <Button
                  disabled={operation.busy}
                  onClick={() =>
                    void operation.run(async () => {
                      await load();
                      setEditorVersion((version) => version + 1);
                    })
                  }
                >
                  放弃编辑
                </Button>
              )}
              <Button
                type="primary"
                disabled={(!canWrite && !canPublish) || (!changeCount && !otherCount && !saved)}
                onClick={openRelease}
              >
                查看改动并发布
              </Button>
            </div>
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
              ]}
            />
          )}
          {
            <>
              <Card
                title={
                  gamesOnly ? (nightTab ? '夜航运营草稿' : '游戏运行策略') : '公共 API 允许来源'
                }
              >
                {gamesOnly && (
                  <div hidden={!nightTab}>
                    <NightOperationsEditor
                      api={api}
                      key={editorVersion}
                      value={snapshot.nightOperations}
                      published={state.snapshot?.nightOperations}
                      gameState={snapshot.games['night-overwatch']}
                      publishedGameState={state.snapshot?.games['night-overwatch']}
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
                            await api.rollbackNightRelease(
                              build.channel,
                              build.buildId,
                              base,
                              note,
                            );
                            await load();
                            completed = true;
                            operation.success('渠道推荐版本已回退，公告与补偿已保留。');
                          }),
                        );
                        return completed;
                      }}
                    />
                  </div>
                )}
                {gamesOnly ? (
                  <div hidden={nightTab}>
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
                  </div>
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
              </Card>
            </>
          }
          <Modal
            open={releaseOpen}
            title={publishConfirm ? '确认发布此草稿' : `发布${gamesOnly ? '游戏配置' : '公共配置'}`}
            width={720}
            destroyOnHidden
            // Rendering in place skips rc-dialog's body scroll lock, whose injected style has no CSP nonce.
            getContainer={false}
            onCancel={() => {
              setReleaseOpen(false);
              setPublishConfirm(false);
            }}
            footer={null}
          >
            {publishConfirm && saved ? (
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
                  <Button onClick={() => setPublishConfirm(false)}>返回</Button>
                </div>
              </>
            ) : (
              <div className="release-form">
                <p className="control-help">
                  {gamesOnly
                    ? '本页“游戏开关”和“夜航运营”的改动一起保存、发布；保存草稿不会生效，发布后才生效。'
                    : '只保存、发布本页的公共 API 允许来源；保存草稿不会生效，发布后才生效。'}
                </p>
                <Changes before={state.snapshot} after={draftSnapshot} />
                {otherCount > 0 && (
                  <Alert
                    type="warning"
                    title={`首次发布会同时写入其他页面的默认配置 ${otherCount} 项。`}
                  />
                )}
                {operationsError && <Alert type="error" title={operationsError} />}
                <label htmlFor="draft-reason">变更理由</label>
                <Input
                  id="draft-reason"
                  aria-label="变更理由"
                  maxLength={500}
                  placeholder={
                    gamesOnly
                      ? '简述本次改动，例如：维护补偿 / 新版本公告'
                      : '简述本次改动，例如：新增 TapTap H5 来源'
                  }
                  value={reason}
                  disabled={!canWrite || operation.busy}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setSaved(undefined);
                    setPublishConfirm(false);
                  }}
                />
                {saved && (
                  <Alert
                    type="success"
                    showIcon
                    title="草稿已保存，尚未发布"
                    description={`理由：${saved.reason} · 基线版本 ${saved.parentVersion}`}
                  />
                )}
                <div className="control-actions modal-actions">
                  <Button
                    onClick={() => {
                      setReleaseOpen(false);
                      setPublishConfirm(false);
                    }}
                  >
                    关闭
                  </Button>
                  <Button
                    type={saved ? 'default' : 'primary'}
                    disabled={
                      !canWrite ||
                      !reason.trim() ||
                      !originsValid ||
                      !!operationsError ||
                      !!conflict
                    }
                    loading={operation.busy}
                    onClick={() =>
                      void operation.run(() =>
                        versioned(async () => {
                          const revision = await api.draft({
                            expectedVersion: base,
                            snapshot: draftSnapshot,
                            reason: reason.trim(),
                            // The server copies the other page's area from the live head.
                            scope: gamesOnly ? 'games' : 'public',
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
                </div>
              </div>
            )}
          </Modal>
        </>
      )}
    </>
  );
}
