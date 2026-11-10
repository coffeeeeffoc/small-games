import { useState } from 'react';
import { Alert, Card, Input, Tabs } from 'antd';
import { ActionButton as Button } from './control-common';
import { NightMessagesEditor } from './night-messages-editor';
import { NightVersionsEditor } from './night-versions-editor';
import type { Deployments, NightBuild, NightOperations } from './night-operations-model';

export function NightOperationsEditor({
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
  const [target, setTarget] = useState<NightBuild>();
  const [reason, setReason] = useState('');
  return (
    <>
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
