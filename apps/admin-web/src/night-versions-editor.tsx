import { useRef, useState } from 'react';
import { useUnsavedChanges } from './unsaved-changes';
import { Alert, Card, Dropdown, Input, Select, Tag } from 'antd';
import { ActionButton as Button, DataTable as Table } from './control-common';
import { dateLabel, type GameState } from './control-api';
import {
  newGameBlock,
  ruleKinds,
  type NightRuleKind,
  type NightRuntimeStatus,
} from './night-compatibility';
import { NightRuleStatus, NightRuntimeView } from './night-runtime-view';
import {
  defaultNightOperations,
  same,
  type Deployments,
  type NightBuild,
  type NightOperations,
  type NightRelease,
} from './night-operations-model';
const identifier = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const versionOrder = new Intl.Collator('en', { numeric: true });
export function NightVersionsEditor({
  runtime,
  refreshRuntime,
  readingRuntime,
  value,
  published,
  gameState,
  publishedGameState,
  deployments,
  disabled,
  canPublish,
  change,
  quickRollback,
}: {
  runtime?: NightRuntimeStatus;
  refreshRuntime: () => void;
  readingRuntime: boolean;
  value?: NightOperations;
  published?: NightOperations;
  gameState?: GameState;
  publishedGameState?: GameState;
  deployments?: Deployments;
  disabled: boolean;
  canPublish: boolean;
  change: (value: NightOperations) => void;
  quickRollback: (build: NightBuild) => void;
}) {
  const operations = value ?? defaultNightOperations(),
    release = operations.release,
    liveRelease = published?.release;
  const [build, setBuild] = useState<NightBuild>({
    buildId: '',
    channel: 'taptap-h5',
    version: '',
    backendVersion: '',
    ranked: '',
    multiplayer: '',
  });
  const [error, setError] = useState('');
  const initialBuild = useRef(build);
  useUnsavedChanges(!same(build, initialBuild.current));
  const setRelease = (next: NightRelease) => change({ ...operations, release: next });
  const editBuild = (id: string, patch: Partial<NightBuild>) => {
    if (release)
      setRelease({
        ...release,
        builds: release.builds.map((b) => (b.buildId === id ? { ...b, ...patch } : b)),
      });
  };
  const versions = [
    ...new Set([
      ...(release?.builds.flatMap((b) => (b.backendVersion ? [b.backendVersion] : [])) ?? []),
      ...(release?.disabledBackendVersions ?? []),
      release?.legacy.backendVersion,
      liveRelease?.legacy.backendVersion,
    ]),
  ]
    .filter((v): v is string => !!v && v !== 'unknown')
    .sort((a, b) => versionOrder.compare(b, a));
  const toggleBackend = (version: string) => {
    if (!release) return;
    const old = release.disabledBackendVersions ?? [];
    setRelease({
      ...release,
      disabledBackendVersions: old.includes(version)
        ? old.filter((v) => v !== version)
        : [...old, version],
    });
  };
  const valid =
    identifier.test(build.buildId) &&
    /^[a-z0-9][a-z0-9-]{0,39}$/.test(build.channel) &&
    [build.version, build.backendVersion, build.ranked, build.multiplayer].every(
      (v) => !!v && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(v),
    ) &&
    !release?.builds.some((b) => b.buildId === build.buildId);
  const add = () => {
    if (!valid) return;
    const base: NightRelease = release ?? {
      schemaVersion: 1,
      builds: [],
      channels: [],
      allowNew: { ranked: [], multiplayer: [] },
      legacy: {
        channel: build.channel,
        ranked: build.ranked,
        multiplayer: build.multiplayer,
        backendVersion: build.backendVersion,
      },
    };
    setRelease({
      ...base,
      builds: [...base.builds, { ...build }],
      channels: base.channels.some((c) => c.channel === build.channel)
        ? base.channels
        : [...base.channels, { channel: build.channel, latestBuildId: null }],
      allowNew: {
        ranked: [...new Set([...base.allowNew.ranked, build.ranked])],
        multiplayer: [...new Set([...base.allowNew.multiplayer, build.multiplayer])],
      },
    });
    initialBuild.current = { ...build, buildId: '', version: '' };
    setBuild(initialBuild.current);
    setError('');
  };
  const importManifest = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw Error();
      const input = JSON.parse(await file.text()),
        candidate = input.release ?? input;
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        typeof candidate.buildId !== 'string' ||
        typeof candidate.ranked !== 'string' ||
        typeof candidate.multiplayer !== 'string' ||
        typeof candidate.channel !== 'string'
      )
        throw Error();
      setBuild({
        buildId: candidate.buildId,
        channel: candidate.channel,
        ranked: candidate.ranked,
        multiplayer: candidate.multiplayer,
        version: typeof candidate.version === 'string' ? candidate.version : '',
        backendVersion:
          typeof candidate.backendVersion === 'string' ? candidate.backendVersion : '',
      });
      setError('');
    } catch {
      setError('构建清单无效，请选择本次夜航 H5 包对应的 JSON 清单。');
    }
  };
  function renderRule(
    kind: NightRuleKind,
    draft: NightRelease['legacy'],
    live?: NightRelease['legacy'],
  ) {
    if (!release) return null;
    const block = newGameBlock(kind, draft, release, gameState);
    const liveBlock =
      live && liveRelease && newGameBlock(kind, live, liveRelease, publishedGameState);
    return (
      <>
        {live && (
          <NightRuleStatus kind={kind} rule={live[kind]} status={runtime} block={liveBlock} />
        )}
        {(!live || draft[kind] !== live[kind] || block !== liveBlock) && (
          <div className="night-draft-rule">
            <small>草稿预览</small>
            <NightRuleStatus kind={kind} rule={draft[kind]} status={runtime} block={block} />
          </div>
        )}
      </>
    );
  }
  return (
    <>
      <NightRuntimeView status={runtime} refresh={refreshRuntime} loading={readingRuntime} />
      <Card title="客户端新局状态">
        <p className="control-help">
          按已发布配置和运行实例的规则判断。草稿预览在发布游戏配置后生效。
        </p>
        {!liveRelease && <p className="control-help">后管尚未发布客户端版本登记。</p>}
        <div
          className="table-scroll night-versions-scroll night-builds-scroll"
          tabIndex={0}
          role="region"
          aria-label="前端版本登记列表"
        >
          <Table
            aria-label="前端版本登记"
            dataSource={(release?.builds ?? [])
              .map((b) => ({ ...b, id: b.buildId }))
              .sort((a, b) => versionOrder.compare(b.version ?? '', a.version ?? ''))}
            columns={[
              {
                title: '前端版本 / 渠道',
                key: 'version',
                render: (_, row) => {
                  const recommended = liveRelease?.channels.some(
                    (c) => c.latestBuildId === row.buildId,
                  );
                  const draftRecommended = release?.channels.some(
                    (c) => c.latestBuildId === row.buildId,
                  );
                  return (
                    <>
                      <strong>{row.version ?? '未标记版本'}</strong> · {row.channel}
                      <small className="control-id" title={row.buildId}>
                        {row.buildId}
                      </small>
                      {recommended && <Tag color="blue">推荐版本</Tag>}
                      {draftRecommended !== recommended && (draftRecommended || recommended) && (
                        <Tag color="gold">{draftRecommended ? '草稿设为推荐' : '草稿取消推荐'}</Tag>
                      )}
                    </>
                  );
                },
              },
              ...ruleKinds.map(([kind, label]) => ({
                title: `${label}新局`,
                key: kind,
                render: (_: unknown, row: NightBuild) =>
                  renderRule(
                    kind,
                    row,
                    liveRelease?.builds.find((b) => b.buildId === row.buildId),
                  ),
              })),
              {
                title: '开关分组',
                key: 'group',
                render: (_, row) => row.backendVersion ?? '未分组',
              },
              {
                title: '操作',
                key: 'actions',
                render: (_, row) => {
                  const latest = release?.channels.some((c) => c.latestBuildId === row.buildId);
                  const saved = liveRelease?.builds.find((b) => b.buildId === row.buildId);
                  const ready =
                    saved &&
                    liveRelease &&
                    ruleKinds.every(([kind]) => !newGameBlock(kind, saved, liveRelease));
                  return (
                    <div className="night-version-actions">
                      <Button
                        type="primary"
                        size="small"
                        disabled={disabled || !!row.removed}
                        onClick={() => editBuild(row.buildId, { disabled: !row.disabled })}
                      >
                        {row.disabled ? '恢复新局' : '关闭新局'}
                      </Button>
                      <Button
                        color="primary"
                        variant="filled"
                        size="small"
                        disabled={disabled || !!row.removed || !!row.disabled || !!latest}
                        onClick={() => {
                          if (release)
                            setRelease({
                              ...release,
                              channels: release.channels.map((c) =>
                                c.channel === row.channel
                                  ? { ...c, latestBuildId: row.buildId }
                                  : c,
                              ),
                            });
                        }}
                      >
                        设为推荐
                      </Button>
                      <Dropdown
                        autoFocus
                        trigger={['click']}
                        placement="bottomRight"
                        disabled={disabled && !canPublish}
                        menu={{
                          items: [
                            {
                              key: 'rollback',
                              label: '快速回退',
                              disabled:
                                !canPublish ||
                                !ready ||
                                liveRelease?.channels.some((c) => c.latestBuildId === row.buildId),
                              onClick: () => {
                                if (saved) quickRollback(saved);
                              },
                            },
                            {
                              key: 'remove',
                              label: row.removed ? '恢复登记' : '移除登记',
                              danger: !row.removed,
                              disabled: disabled || !!latest,
                              onClick: () =>
                                editBuild(row.buildId, { removed: row.removed ? undefined : true }),
                            },
                          ],
                        }}
                      >
                        <Button
                          color="primary"
                          variant="filled"
                          size="small"
                          disabled={disabled && !canPublish}
                          aria-haspopup="menu"
                        >
                          更多
                        </Button>
                      </Dropdown>
                    </div>
                  );
                },
              },
            ]}
          />
        </div>
        <section aria-label="登记前端版本">
          <h3>登记前端版本</h3>
          <label htmlFor="night-build-manifest">导入 H5 构建清单</label>
          <input
            id="night-build-manifest"
            aria-label="导入 H5 构建清单"
            type="file"
            accept=".json,application/json"
            disabled={disabled}
            onChange={(e) => {
              void importManifest(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {error && <Alert type="error" title={error} />}
          <div className="operation-fields">
            {(
              [
                ['version', '前端版本号'],
                ['backendVersion', '新局开关分组'],
                ['buildId', '构建标识'],
                ['channel', '发布渠道'],
                ['ranked', '单人规则版本'],
                ['multiplayer', '双人规则版本'],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label htmlFor={'build-' + key}>{label}</label>
                <Input
                  id={'build-' + key}
                  aria-label={label}
                  value={build[key]}
                  maxLength={key === 'buildId' ? 128 : 100}
                  disabled={disabled}
                  onChange={(e) => setBuild({ ...build, [key]: e.target.value.trim() })}
                />
              </div>
            ))}
          </div>
          <p className="control-help">
            导入会填入包的标识、渠道、开关分组和所需规则。首次登记也会用这些值初始化旧包映射。
          </p>
          {build.ranked && build.multiplayer && (
            <div className="night-rule-pair" aria-label="导入清单的规则核对">
              {ruleKinds.map(([kind, label]) => (
                <div key={kind}>
                  <span>{label}规则预览</span>
                  <NightRuleStatus kind={kind} rule={build[kind]} status={runtime} preview />
                </div>
              ))}
            </div>
          )}
          <div className="control-actions">
            <Button type="primary" disabled={disabled || !valid} onClick={add}>
              登记到草稿
            </Button>
          </div>
        </section>
      </Card>
      {release && (
        <Card title="无构建标识的旧客户端">
          <p className="control-help">
            {liveRelease
              ? `已发布映射 · ${liveRelease.legacy.channel} · 开关分组 ${liveRelease.legacy.backendVersion ?? '无'}`
              : '旧包映射尚未发布'}
            {(!liveRelease ||
              release.legacy.channel !== liveRelease.legacy.channel ||
              release.legacy.backendVersion !== liveRelease.legacy.backendVersion) && (
              <>
                {' '}
                · 草稿映射 {release.legacy.channel} · 开关分组{' '}
                {release.legacy.backendVersion ?? '无'}
              </>
            )}
          </p>
          <p className="control-help">下方状态适用于规则与映射一致的旧包。</p>
          <div className="night-rule-pair">
            {ruleKinds.map(([kind, label]) => (
              <div key={kind}>
                <span>{label}新局</span>
                {renderRule(kind, release.legacy, liveRelease?.legacy)}
              </div>
            ))}
          </div>
          <details className="night-legacy-settings">
            <summary>旧包兼容设置</summary>
            <p className="control-help">
              确认旧包使用相同规则后，可复制已登记包的渠道、规则和开关分组到草稿。
            </p>
            <label htmlFor="legacy-build">从已登记包复制旧客户端映射</label>
            <Select
              id="legacy-build"
              aria-label="从已登记包复制旧客户端映射"
              disabled={disabled}
              placeholder="选择已登记包"
              value={null}
              virtual={false}
              optionRender={(option) => <div className="night-legacy-option">{option.label}</div>}
              options={release.builds
                .filter((b) => !b.removed)
                .map((b) => ({
                  value: b.buildId,
                  label: `${b.version ?? b.buildId} · ${b.channel} · ${b.ranked} / ${b.multiplayer} · ${b.backendVersion ?? '未分组'}`,
                }))}
              onChange={(id) => {
                const b = release.builds.find((b) => b.buildId === id)!;
                setRelease({
                  ...release,
                  legacy: {
                    channel: b.channel,
                    ranked: b.ranked,
                    multiplayer: b.multiplayer,
                    backendVersion: b.backendVersion,
                  },
                });
              }}
            />
          </details>
        </Card>
      )}
      <Card title="新局开关分组">
        <p className="control-help">
          停开一个分组会关闭组内所有客户端的新局。已开局继续使用其原有规则。
        </p>
        <div
          className="table-scroll night-versions-scroll night-groups-scroll"
          tabIndex={0}
          role="region"
          aria-label="新局开关分组列表"
        >
          <Table
            aria-label="新局开关分组"
            dataSource={versions.map((id) => ({ id }))}
            columns={[
              { title: '分组标识', dataIndex: 'id' },
              {
                title: '已发布关联',
                key: 'builds',
                render: (_, row) =>
                  `${liveRelease?.builds.filter((b) => b.backendVersion === row.id && !b.removed).length ?? 0} 个前端包${liveRelease?.legacy.backendVersion === row.id ? ' + 旧包映射' : ''}`,
              },
              {
                title: '分组开关',
                key: 'state',
                render: (_, row) => {
                  const closed = !!liveRelease?.disabledBackendVersions?.includes(row.id);
                  const draftClosed = !!release?.disabledBackendVersions?.includes(row.id);
                  return (
                    <>
                      <Tag>{liveRelease ? (closed ? '已停开' : '已开放') : '未发布'}</Tag>
                      {closed !== draftClosed && (
                        <Tag color="gold">草稿{draftClosed ? '停开' : '恢复'}</Tag>
                      )}
                    </>
                  );
                },
              },
              {
                title: '操作',
                key: 'actions',
                render: (_, row) => (
                  <Button
                    type="primary"
                    size="small"
                    disabled={disabled || !release}
                    onClick={() => toggleBackend(row.id)}
                  >
                    {release?.disabledBackendVersions?.includes(row.id) ? '恢复新局' : '关闭新局'}
                  </Button>
                ),
              },
            ]}
          />
        </div>
      </Card>
      <Card title="Runtime 部署历史">
        <p className="control-help">
          最近 5 次通过健康核验的 Runtime 上线记录，用于追溯镜像与源码。
        </p>
        {deployments?.current ? (
          <p>
            <Tag color="blue">最近确认版本 {deployments.current.version}</Tag>核验于{' '}
            {dateLabel(deployments.current.verifiedAt)}
          </p>
        ) : (
          <Alert
            type="info"
            title="尚无可核实的版本部署记录"
            description="升级后的部署工具完成上线后自动记录；已有旧部署不会补造版本号。"
          />
        )}
        <div className="table-scroll">
          <Table
            aria-label="后端上线历史"
            dataSource={(deployments?.history ?? [])
              .map((d, i) => ({ ...d, id: d.release + ':' + d.verifiedAt + ':' + i }))
              .sort(
                (a, b) => versionOrder.compare(b.version, a.version) || b.verifiedAt - a.verifiedAt,
              )}
            columns={[
              {
                title: '部署版本',
                key: 'version',
                render: (_, row) => (
                  <>
                    <strong>{row.version}</strong>
                    <small className="control-id">
                      {row.mode === 'rollback' ? '回滚后版本' : '上线版本'}
                    </small>
                  </>
                ),
              },
              {
                title: '核验时间 / 源码',
                key: 'verified',
                render: (_, row) => (
                  <>
                    {dateLabel(row.verifiedAt)}
                    <small className="control-id">{row.sourceSHA}</small>
                  </>
                ),
              },
              {
                title: '镜像',
                key: 'image',
                render: (_, row) => <span className="control-id">{row.activeImages.runtime}</span>,
              },
            ]}
          />
        </div>
      </Card>
    </>
  );
}
