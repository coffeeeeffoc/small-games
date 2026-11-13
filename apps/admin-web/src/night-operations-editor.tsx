import { useEffect, useState, useCallback, useRef } from 'react';
import type { ControlApi } from './control-api';
import { hasIncompatibleNewGames, type NightRuntimeStatus } from './night-compatibility';
import { Alert, Card, Input, Tabs } from 'antd';
import { useUnsavedChanges } from './unsaved-changes';
import { ActionButton as Button } from './control-common';
import { NightMessagesEditor } from './night-messages-editor';
import { NightVersionsEditor } from './night-versions-editor';
import type { Deployments, NightBuild, NightOperations } from './night-operations-model';

export function NightOperationsEditor({
  api,
  value,
  published,
  publishedIds,
  deployments,
  disabled,
  canPublish,
  busy,
  dirty,
  change,
  rollback,
}: {
  api: ControlApi;
  value?: NightOperations;
  published?: NightOperations;
  publishedIds: Set<string>;
  deployments?: Deployments;
  disabled: boolean;
  canPublish: boolean;
  busy: boolean;
  dirty: boolean;
  change: (value: NightOperations) => void;
  rollback: (build: NightBuild, reason: string) => Promise<boolean>;
}) {
  const [runtime, setRuntime] = useState<NightRuntimeStatus>();
  const [readingRuntime, setReadingRuntime] = useState(false);
  const reading = useRef(0);
  const refreshRuntime = useCallback(async () => {
    const attempt = ++reading.current;
    setReadingRuntime(true);
    try {
      const next = await api.read<NightRuntimeStatus>('night-runtime');
      if (attempt === reading.current) setRuntime(next);
    } catch {
      if (attempt === reading.current) setRuntime(undefined);
    } finally {
      if (attempt === reading.current) setReadingRuntime(false);
    }
  }, [api]);
  useEffect(() => {
    void refreshRuntime();
    const timer = setInterval(() => void refreshRuntime(), 30_000);
    return () => {
      clearInterval(timer);
      reading.current++;
    };
  }, [refreshRuntime]);
  const incompatible =
    value?.release?.builds.filter((build) =>
      hasIncompatibleNewGames(build, value.release!, runtime),
    ) ?? [];
  const [target, setTarget] = useState<NightBuild>();
  const [reason, setReason] = useState('');
  useUnsavedChanges(!!target && !!reason);
  return (
    <>
      {incompatible.length > 0 && (
        <Alert
          type="error"
          showIcon
          title={`${incompatible.length} 个启用的客户端版本与运行服务端不兼容`}
          description={`包括 ${incompatible.map((build) => `${build.version ?? build.buildId}${value?.release?.channels.some((channel) => channel.latestBuildId === build.buildId) ? '（推荐版本）' : ''}`).join('、')}。请在“版本与部署”查看规则差异，升级服务端或处理客户端后再开放新局。`}
        />
      )}
      <Tabs
        className="section-tabs"
        items={[
          ...(['announcements', 'compensations'] as const).map((kind) => ({
            key: kind,
            label: kind === 'announcements' ? '公告管理' : '补偿管理',
            children: (
              <NightMessagesEditor
                kind={kind}
                value={value}
                published={published}
                disabled={disabled}
                publishedIds={publishedIds}
                change={change}
              />
            ),
          })),
          {
            key: 'versions',
            label: '版本与部署',
            children: (
              <NightVersionsEditor
                runtime={runtime}
                refreshRuntime={() => void refreshRuntime()}
                readingRuntime={readingRuntime}
                value={value}
                published={published}
                deployments={deployments}
                disabled={disabled}
                canPublish={canPublish && !busy && !dirty}
                change={change}
                quickRollback={(build) => {
                  setTarget(build);
                  setReason('');
                }}
              />
            ),
          },
        ]}
      />
      {dirty && <p className="control-help">有未发布编辑。快速回退前请发布或放弃这些编辑。</p>}
      {target && (
        <Card title="确认快速回退游戏版本" className="confirmation">
          <p>
            {target.channel} 推荐版本将切换为 {target.version ?? target.buildId}。
          </p>
          <p className="control-id">{target.buildId}</p>
          <Alert
            type="info"
            title="保留当前公告、补偿和其他渠道配置。"
            description="只切换渠道推荐标识，不替换已上传的前端包或服务器镜像。新局仍须通过版本开关，旧局按原规则结算。"
          />
          <label htmlFor="night-rollback-reason">版本回退理由</label>
          <Input.TextArea
            id="night-rollback-reason"
            aria-label="版本回退理由"
            value={reason}
            maxLength={500}
            rows={3}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="control-actions">
            <Button
              danger
              loading={busy}
              disabled={!canPublish || dirty || !reason.trim()}
              onClick={async () => {
                if (await rollback(target, reason.trim())) setTarget(undefined);
              }}
            >
              确认回退游戏版本
            </Button>
            <Button disabled={busy} onClick={() => setTarget(undefined)}>
              取消版本回退
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
