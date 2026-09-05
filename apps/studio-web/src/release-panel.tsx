import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createReleaseClient, type ReleaseRequest } from './release-client.js';

const defaultClient = createReleaseClient();

/** Saved snapshots and Channel transitions are confirmed separately from draft editing. */
export function ReleasePanel({
  api = defaultClient,
}: {
  api?: ReturnType<typeof createReleaseClient>;
}) {
  const status = useQuery({
    queryKey: ['releases'],
    queryFn: api.status,
    refetchInterval: 3000,
    retry: false,
  });
  const drafts = useQuery({ queryKey: ['publishable-drafts'], queryFn: api.drafts, retry: false });
  const [channel, setChannel] = useState<ReleaseRequest['channel']>('development');
  const [draftId, setDraftId] = useState('');
  const [artifactId, setArtifactId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [confirmation, setConfirmation] = useState<ReleaseRequest>();
  const [message, setMessage] = useState('');
  const current = status.data?.channels.find((entry) => entry.channel === channel);
  const pending = status.data?.events.some(
    (entry) => entry.channel === channel && !entry.delivered,
  );
  const draft = drafts.data?.find((entry) => entry.id === draftId);
  const submission = useMutation({
    mutationFn: api.submit,
    onSuccess: async () => {
      setConfirmation(undefined);
      setMessage('已排队；Runtime 确认后指针才更新。');
      await status.refetch();
    },
    onError: async () => {
      await status.refetch();
    },
  });
  const confirm = (
    target: { versionId: string } | { draftId: string; draftRevision: number; artifactId: string },
  ) => {
    submission.reset();
    setMessage('');
    setConfirmation({
      eventId: crypto.randomUUID(),
      channel,
      expectedRevision: current?.revision ?? 0,
      confirmation: true,
      ...target,
    });
  };
  return (
    <section className="release-panel" aria-labelledby="release-heading">
      <h2 id="release-heading">发布与回滚</h2>
      <p>仅发布已保存且通过校验的内容；回滚只切换指针，不修改 Artifact。</p>
      {(status.error || drafts.error || submission.error) && (
        <p role="alert">{(submission.error ?? status.error ?? drafts.error)?.message}</p>
      )}
      <button
        onClick={() => {
          void status.refetch();
          void drafts.refetch();
        }}
        disabled={submission.isPending}
      >
        刷新发布状态
      </button>
      <fieldset disabled={!!confirmation || !status.data}>
        <legend>目标渠道与版本</legend>
        <label>
          渠道
          <select
            value={channel}
            onChange={(event) => {
              const value = event.target.value;
              if (value === 'development' || value === 'canary' || value === 'stable')
                setChannel(value);
            }}
          >
            <option value="development">development</option>
            <option value="canary">canary</option>
            <option value="stable">stable</option>
          </select>
        </label>
        <p>
          当前版本：<code>{current?.versionId ?? '未发布'}</code> · r{current?.revision ?? 0}
        </p>
        <label>
          已保存草稿
          <select value={draftId} onChange={(event) => setDraftId(event.target.value)}>
            <option value="">选择草稿</option>
            {drafts.data?.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} · r{entry.revision}
              </option>
            ))}
          </select>
        </label>
        <label>
          已验证 Artifact ID
          <input
            value={artifactId}
            onChange={(event) => setArtifactId(event.target.value)}
            placeholder="64 位 SHA-256"
          />
        </label>
        <button
          disabled={!!pending || !draft || !/^[a-f0-9]{64}$/.test(artifactId)}
          onClick={() => {
            if (draft) confirm({ draftId: draft.id, draftRevision: draft.revision, artifactId });
          }}
        >
          检查发布影响
        </button>
        <label>
          已有固定版本
          <select value={versionId} onChange={(event) => setVersionId(event.target.value)}>
            <option value="">选择历史版本</option>
            {status.data?.versions.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.id}
              </option>
            ))}
          </select>
        </label>
        <button disabled={!!pending || !versionId} onClick={() => confirm({ versionId })}>
          检查回滚影响
        </button>
      </fieldset>
      {pending && <p role="status">该渠道有待确认投影，正在自动重试；当前已确认指针保留。</p>}
      {confirmation && (
        <section aria-label="发布影响确认">
          <h3>
            确认{'versionId' in confirmation ? '回滚' : '发布'}至 {confirmation.channel}
          </h3>
          <p>
            {confirmation.channel === 'stable'
              ? '影响使用 stable 渠道的新会话。'
              : '影响选择此渠道的新会话。'}
            已有固定版本不变。
          </p>
          <p>
            原版本：<code>{current?.versionId ?? '未发布'}</code> · 预期 r
            {confirmation.expectedRevision}
          </p>
          {'versionId' in confirmation ? (
            <p>
              目标固定版本：<code>{confirmation.versionId}</code>
            </p>
          ) : (
            <p>
              草稿 {confirmation.draftId} · r{confirmation.draftRevision}
              <br />
              Artifact：<code>{confirmation.artifactId}</code>
            </p>
          )}
          <button disabled={submission.isPending} onClick={() => submission.mutate(confirmation)}>
            确认变更
          </button>
          <button
            disabled={submission.isPending}
            onClick={() => {
              setConfirmation(undefined);
              submission.reset();
            }}
          >
            取消
          </button>
        </section>
      )}
      {message && <p role="status">{message}</p>}
      <ul>
        {status.data?.events.slice(0, 5).map((entry) => (
          <li key={entry.eventId}>
            {entry.channel} r{entry.revision} ·{' '}
            {entry.delivered ? '已确认' : `待重试 (${entry.attempts})`}
          </li>
        ))}
      </ul>
    </section>
  );
}
