import { useState } from 'react';
import { Alert, Card, Input, Select, Tag } from 'antd';
import { ActionButton as Button, DataTable as Table } from './control-common';
import { dateLabel } from './control-api';
import {
  defaultNightOperations,
  type Deployments,
  type NightBuild,
  type NightOperations,
  type NightRelease,
} from './night-operations-model';
const identifier = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export function NightVersionsEditor({
  value,
  published,
  deployments,
  disabled,
  canPublish,
  change,
  quickRollback,
}: {
  value?: NightOperations;
  published?: NightOperations;
  deployments?: Deployments;
  disabled: boolean;
  canPublish: boolean;
  change: (value: NightOperations) => void;
  quickRollback: (build: NightBuild) => void;
}) {
  const operations = value ?? defaultNightOperations(),
    release = operations.release;
  const [build, setBuild] = useState<NightBuild>({
    buildId: '',
    channel: 'taptap-h5',
    version: '',
    backendVersion: '',
    ranked: '',
    multiplayer: '',
  });
  const [error, setError] = useState('');
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
      ...(deployments?.history.map((d) => d.version) ?? []),
      ...(release?.builds.flatMap((b) => (b.backendVersion ? [b.backendVersion] : [])) ?? []),
      ...(release?.disabledBackendVersions ?? []),
    ]),
  ].filter((v) => v !== 'unknown');
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
    setBuild({ ...build, buildId: '', version: '' });
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
  return (
    <>
      <Card title="实际后端部署">
        <p className="control-help">
          最近 5 次通过健康核验的 Runtime
          上线记录。配置发布与前端打包不会生成上线记录；此列表不是实时健康检测。
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
            dataSource={(deployments?.history ?? []).map((d, i) => ({
              ...d,
              id: d.release + ':' + d.verifiedAt + ':' + i,
            }))}
            columns={[
              {
                title: '版本',
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
      <Card title="游戏版本与兼容服务">
        <p className="control-help">
          按前端包绑定的后端版本控制新局。关闭或移除不删除执行器、资产、旧局及回执；恢复需当前服务器仍保留对应规则。所有草稿操作需在下方保存并发布。
        </p>
        <div className="table-scroll">
          <Table
            aria-label="后端兼容服务"
            dataSource={versions.map((id) => ({ id }))}
            columns={[
              { title: '后端兼容版本', dataIndex: 'id' },
              {
                title: '新局服务',
                key: 'state',
                render: (_, row) => (
                  <Tag>
                    {release?.disabledBackendVersions?.includes(row.id) ? '已关闭' : '启用'}
                  </Tag>
                ),
              },
              {
                title: '操作',
                key: 'actions',
                render: (_, row) => (
                  <Button disabled={disabled || !release} onClick={() => toggleBackend(row.id)}>
                    {release?.disabledBackendVersions?.includes(row.id)
                      ? '恢复该版本服务'
                      : '关闭该版本服务'}
                  </Button>
                ),
              },
            ]}
          />
        </div>
        <div className="table-scroll">
          <Table
            aria-label="前端版本登记"
            dataSource={(release?.builds ?? []).map((b) => ({ ...b, id: b.buildId }))}
            columns={[
              {
                title: '前端版本 / 渠道',
                key: 'version',
                render: (_, row) => (
                  <>
                    <strong>{row.version ?? '未标记版本'}</strong> · {row.channel}
                    <small className="control-id">{row.buildId}</small>
                  </>
                ),
              },
              {
                title: '兼容服务 / 状态',
                key: 'status',
                render: (_, row) => (
                  <>
                    {row.backendVersion ?? '旧版未标记'}
                    <br />
                    <Tag>{row.removed ? '已移除登记' : row.disabled ? '已关闭新局' : '启用'}</Tag>
                    {release?.channels.some((c) => c.latestBuildId === row.buildId) && (
                      <Tag color="blue">推荐版本</Tag>
                    )}
                  </>
                ),
              },
              {
                title: '操作',
                key: 'actions',
                render: (_, row) => {
                  const latest = release?.channels.some((c) => c.latestBuildId === row.buildId);
                  const saved = published?.release?.builds.find((b) => b.buildId === row.buildId);
                  const ready =
                    saved &&
                    !saved.disabled &&
                    !saved.removed &&
                    !published?.release?.disabledBackendVersions?.includes(
                      saved.backendVersion ?? '',
                    ) &&
                    (['ranked', 'multiplayer'] as const).every(
                      (k) =>
                        published?.release?.allowNew[k].includes(saved[k]) &&
                        !published?.release?.retiredRules?.[k].includes(saved[k]),
                    );
                  return (
                    <div className="control-actions">
                      <Button
                        disabled={disabled || !!row.removed}
                        onClick={() => editBuild(row.buildId, { disabled: !row.disabled })}
                      >
                        {row.disabled ? '恢复新局' : '关闭新局'}
                      </Button>
                      <Button
                        danger
                        disabled={disabled || !!latest}
                        onClick={() =>
                          editBuild(row.buildId, { removed: row.removed ? undefined : true })
                        }
                      >
                        {row.removed ? '恢复登记' : '移除旧版本'}
                      </Button>
                      <Button
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
                      <Button
                        disabled={
                          !canPublish ||
                          !ready ||
                          published?.release?.channels.some((c) => c.latestBuildId === row.buildId)
                        }
                        onClick={() => {
                          if (saved) quickRollback(saved);
                        }}
                      >
                        快速回退到此版本
                      </Button>
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
                ['backendVersion', '绑定后端版本号'],
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
            使用包清单中的准确标识与规则版本。首次登记将同一规则设为无构建标识旧客户端的兼容映射，推荐版本需另行确认。
          </p>
          <div className="control-actions">
            <Button disabled={disabled || !valid} onClick={add}>
              登记到草稿
            </Button>
          </div>
        </section>
        {release && (
          <section aria-label="旧客户端兼容">
            <h3>未携带构建标识的旧客户端</h3>
            <p className="control-help">
              旧客户端也绑定后端兼容版本；关闭该服务版本同样停止其新局。
            </p>
            <label htmlFor="legacy-build">采用已登记版本的规则</label>
            <Select
              id="legacy-build"
              aria-label="旧客户端兼容版本"
              disabled={disabled}
              placeholder="选择兼容版本"
              value={
                release.builds.find(
                  (b) =>
                    b.channel === release.legacy.channel &&
                    b.ranked === release.legacy.ranked &&
                    b.multiplayer === release.legacy.multiplayer &&
                    b.backendVersion === release.legacy.backendVersion,
                )?.buildId
              }
              options={release.builds
                .filter((b) => !b.removed)
                .map((b) => ({
                  value: b.buildId,
                  label: (b.version ?? b.buildId) + ' · ' + b.channel,
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
          </section>
        )}
      </Card>
    </>
  );
}
