import { useEffect, useState } from 'react';
import { Alert, Card, Input, Modal, Tag } from 'antd';
import { useUnsavedChanges } from './unsaved-changes';
import {
  dateLabel,
  type ControlApi,
  type ControlState,
  type Revision,
  type Session,
} from './control-api';
import {
  ActionButton as Button,
  DataTable as Table,
  Failure,
  PageTitle,
  useOperation,
} from './control-common';
import { changeGroups, Changes } from './config-changes';

const stateLabel = {
  unpublished: '未发布 · 保留现有环境策略',
  desired: '待应用',
  partial: '部分已知应用匹配',
  observed: '已知应用版本匹配',
};
type Kind = 'published' | 'pending' | 'stale';
const kindNames: Record<Kind, string> = {
  published: '已发布',
  pending: '待发布草稿',
  stale: '已失效草稿',
};

/** One place for everything about publication: live status, application reports and history. */
export function ReleasesPage({ api, session }: { api: ControlApi; session: Session }) {
  const operation = useOperation();
  const [state, setState] = useState<ControlState>();
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const [viewing, setViewing] = useState<Revision>();
  const [publishing, setPublishing] = useState<Revision>();
  const [rollback, setRollback] = useState<Revision>();
  const [reason, setReason] = useState('');
  useUnsavedChanges(!!rollback && !!reason);
  const canPublish = session.permissions.includes('control.publish');
  async function load() {
    const [next, history] = await Promise.all([
      api.read<ControlState>('state'),
      api.read<Revision[]>('revisions'),
    ]);
    setState(next);
    setRevisions(history);
    setViewing(undefined);
    setPublishing(undefined);
    setRollback(undefined);
  }
  useEffect(() => {
    void operation.run(load);
  }, [api]);
  const kind = (row: Revision): Kind =>
    row.publishedVersion !== null
      ? 'published'
      : row.parentVersion === state?.version
        ? 'pending'
        : 'stale';
  // A published row is compared with the version before it; a draft with its base version.
  const previousOf = (row: Revision) =>
    revisions.find(
      (r) => r.publishedVersion === (row.publishedVersion ?? row.parentVersion + 1) - 1,
    )?.snapshot ?? null;
  const areas = (row: Revision) => {
    const keys = changeGroups(previousOf(row), row.snapshot)
      .filter((g) => g.rows.length)
      .map((g) => g.key);
    return [
      ...(keys.some((k) => k !== 'origins') ? ['游戏状态'] : []),
      ...(keys.includes('origins') ? ['公共配置'] : []),
    ];
  };
  const shown = filter === 'all' ? revisions : revisions.filter((r) => kind(r) === filter);
  const coverage = state?.observationCoverage;
  const reports = state
    ? [
        ...state.observations.map((item) => {
          const expired = coverage?.expiredUnknown.some(
            (e) => e.consumer === item.consumer && e.instanceId === item.instanceId,
          );
          return {
            id: `${item.consumer}/${item.instanceId}`,
            consumer: item.consumer,
            instance: item.instanceId,
            version: `版本 ${item.version}`,
            status: expired
              ? '报告过期 · 状态未知'
              : item.status === 'applied'
                ? '已应用'
                : '应用失败',
            color: expired ? 'default' : item.status === 'applied' ? 'green' : 'red',
            at: dateLabel(item.observedAt),
          };
        }),
        ...(coverage?.missingConsumers ?? []).map((consumer) => ({
          id: consumer,
          consumer,
          instance: '—',
          version: '—',
          status: '未收到报告',
          color: 'orange',
          at: '—',
        })),
      ]
    : [];
  return (
    <>
      <PageTitle
        title="发布记录"
        note="公共配置与游戏状态的每次保存、发布和回退都记录在这里；也可在此查看各服务是否已应用最新版本。"
      />
      <Failure
        error={operation.error}
        retry={!state ? () => void operation.run(load) : undefined}
      />
      {!state ? (
        <p role="status">正在读取发布记录…</p>
      ) : (
        <>
          <Card
            title="线上状态"
            extra={
              <Button loading={operation.busy} onClick={() => void operation.run(load)}>
                刷新
              </Button>
            }
          >
            <div className="control-summary">
              <Tag color="blue">当前版本 {state.version}</Tag>
              <Tag>{stateLabel[state.status]}</Tag>
            </div>
            {coverage && !coverage.complete && (
              <p className="control-help">
                应用覆盖尚不完整：下表只含已知实例的报告，不能据此判断全部服务都已生效或健康。
              </p>
            )}
            <div className="table-scroll">
              <Table
                aria-label="应用生效情况"
                dataSource={reports}
                columns={[
                  {
                    title: '服务 / 实例',
                    key: 'consumer',
                    render: (_, row) => (
                      <>
                        <strong>{row.consumer}</strong>
                        <small className="control-id">{row.instance}</small>
                      </>
                    ),
                  },
                  { title: '已应用版本', dataIndex: 'version' },
                  {
                    title: '状态',
                    key: 'status',
                    render: (_, row) => <Tag color={row.color}>{row.status}</Tag>,
                  },
                  { title: '最近报告', dataIndex: 'at' },
                ]}
              />
            </div>
          </Card>
          <Card title="草稿与发布历史">
            <div className="status-bar">
              <div role="tablist" aria-label="按类型筛选记录" className="status-tabs">
                {(['all', 'published', 'pending', 'stale'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={filter === key}
                    className={filter === key ? 'active' : undefined}
                    onClick={() => setFilter(key)}
                  >
                    {key === 'all' ? '全部' : kindNames[key]}{' '}
                    <span className="count">
                      {key === 'all'
                        ? revisions.length
                        : revisions.filter((r) => kind(r) === key).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="table-scroll">
              <Table
                aria-label="草稿与发布历史"
                dataSource={shown}
                columns={[
                  {
                    title: '记录',
                    key: 'revision',
                    render: (_, row) => (
                      <>
                        <strong>
                          {row.publishedVersion === null
                            ? kind(row) === 'pending'
                              ? '待发布草稿'
                              : `已失效草稿（基于版本 ${row.parentVersion}）`
                            : `已发布版本 ${row.publishedVersion}`}
                        </strong>
                        <div className="tag-row">
                          {row.id === state.revisionId && <Tag color="blue">当前线上</Tag>}
                          {row.rollbackOf && <Tag color="purple">回退</Tag>}
                          {areas(row).map((area) => (
                            <Tag key={area}>{area}</Tag>
                          ))}
                        </div>
                        <small className="control-id">{row.id}</small>
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
                    render: (_, row) => (
                      <div className="row-actions">
                        <Button
                          type="link"
                          aria-label={`查看改动 ${row.reason}`}
                          onClick={() => setViewing(row)}
                        >
                          查看改动
                        </Button>
                        {kind(row) === 'pending' && (
                          <Button
                            type="link"
                            disabled={!canPublish || operation.busy}
                            onClick={() => setPublishing(row)}
                          >
                            发布此草稿
                          </Button>
                        )}
                        {kind(row) === 'published' && row.id !== state.revisionId && (
                          <Button
                            type="link"
                            disabled={!canPublish || operation.busy}
                            onClick={() => {
                              setRollback(row);
                              setReason('');
                            }}
                          >
                            准备回退
                          </Button>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            </div>
            <p className="control-help">成员的具体操作明细见“审计”页。</p>
          </Card>
          <Modal
            open={!!viewing}
            title={
              viewing?.publishedVersion === null
                ? '草稿的改动'
                : `版本 ${viewing?.publishedVersion} 的改动`
            }
            width={720}
            destroyOnHidden
            // Rendering in place skips rc-dialog's body scroll lock, whose injected style has no CSP nonce.
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
          <Modal
            open={!!publishing}
            title="确认发布此草稿"
            width={720}
            destroyOnHidden
            getContainer={false}
            onCancel={() => setPublishing(undefined)}
            footer={null}
          >
            {publishing && (
              <>
                <p>
                  将从版本 {state.version} 发布新版本；理由：{publishing.reason}
                  。以下改动将一起生效：
                </p>
                <Changes before={state.snapshot} after={publishing.snapshot} />
                <div className="control-actions modal-actions">
                  <Button onClick={() => setPublishing(undefined)}>取消发布</Button>
                  <Button
                    type="primary"
                    loading={operation.busy}
                    onClick={() =>
                      void operation.run(async () => {
                        await api.publish(publishing.id, state.version);
                        await load();
                        operation.success('目标版本已发布，等待应用报告。');
                      })
                    }
                  >
                    确认发布
                  </Button>
                </div>
              </>
            )}
          </Modal>
          <Modal
            open={!!rollback}
            title={`回退至已发布版本 ${rollback?.publishedVersion}`}
            width={720}
            destroyOnHidden
            getContainer={false}
            onCancel={() => setRollback(undefined)}
            footer={null}
          >
            {rollback && (
              <>
                <p>
                  回退会从当前版本 {state.version}
                  创建新版本，历史不会删除；公告、补偿和游戏版本策略保留当前配置。
                </p>
                <Changes
                  before={state.snapshot}
                  after={{
                    ...rollback.snapshot,
                    nightOperations: state.snapshot?.nightOperations,
                  }}
                />
                <label htmlFor="rollback-reason">回退理由</label>
                <Input.TextArea
                  id="rollback-reason"
                  aria-label="回退理由"
                  rows={3}
                  value={reason}
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                />
                <div className="control-actions modal-actions">
                  <Button onClick={() => setRollback(undefined)}>取消回退</Button>
                  <Button
                    danger
                    disabled={!reason.trim()}
                    loading={operation.busy}
                    onClick={() =>
                      void operation.run(async () => {
                        await api.rollback(rollback.id, state.version, reason.trim());
                        await load();
                        operation.success('回退已创建新目标版本，等待应用报告。');
                      })
                    }
                  >
                    确认回退
                  </Button>
                </div>
              </>
            )}
          </Modal>
          {revisions.length === 0 && <Alert type="info" title="尚无草稿或发布记录。" />}
        </>
      )}
    </>
  );
}
