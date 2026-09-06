import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createDraftClient, type DraftClient } from './draft-client.js';
import { DraftPreview } from './draft-preview.js';
import { createGenerationClient, type GenerationClient } from './generation-client.js';
import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';

const client = createGenerationClient();
const draftClient = createDraftClient();
const statusNames = {
  queued: '排队中',
  running: '生成中',
  succeeded: '已生成草稿',
  failed: '失败',
};

export function GenerationPanel({
  api = client,
  drafts = draftClient,
}: {
  api?: GenerationClient;
  drafts?: DraftClient;
}) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<DynamicContentEnvelope | null>(null);
  const jobs = useQuery({
    queryKey: ['generation-jobs'],
    queryFn: () => api.list(),
    refetchInterval: (query) =>
      query.state.data?.some((job) => job.status === 'queued' || job.status === 'running')
        ? 1_000
        : false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['generation-jobs'] });
  const create = useMutation({
    mutationFn: () => api.create(input),
    onSuccess: async () => {
      setInput('');
      await refresh();
    },
  });
  const retry = useMutation({ mutationFn: (id: string) => api.retry(id), onSuccess: refresh });
  const loadPreview = useMutation({
    mutationFn: (id: string) => drafts.read(id),
    onSuccess: (draft) => setPreview(draft.envelope as DynamicContentEnvelope),
  });
  return (
    <section className="draft-workspace">
      <header>
        <p className="eyebrow">AI DYNAMIC CONTENT</p>
        <h2>生成修仙内容草稿</h2>
        <p>输出通过 Game schema 校验后只进入草稿，不会自动发布。</p>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <label>
          生成要求
          <input value={input} onChange={(event) => setInput(event.target.value)} required />
        </label>
        <button type="submit" disabled={create.isPending}>
          提交生成任务
        </button>
      </form>
      {jobs.error && <p role="alert">无法读取生成任务。</p>}
      <ul>
        {jobs.data?.map((job) => (
          <li key={job.id}>
            <strong>{job.input}</strong> · 第 {job.attempt} 次 · {statusNames[job.status]}
            {job.model && ` · ${job.model}`}
            {job.error && <p role="alert">{job.error}</p>}
            {job.status === 'failed' && <button onClick={() => retry.mutate(job.id)}>重试</button>}
            {job.draftId && (
              <button onClick={() => loadPreview.mutate(job.draftId!)}>预览草稿</button>
            )}
          </li>
        ))}
      </ul>
      {preview && <DraftPreview envelope={preview} />}
    </section>
  );
}
