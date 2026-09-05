import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { normalizeCultivationContent } from '@coffeeeeffoc/game-cultivation/content';
import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import { createDraftClient, DraftError, type Draft, type DraftClient } from './draft-client.js';
import { DraftPreview } from './draft-preview.js';

const client = createDraftClient();
/** JSON editing stays local until an explicit successful optimistic save. */
export function DraftEditor({ api = client }: { api?: DraftClient }) {
  const queryClient = useQueryClient();
  const drafts = useQuery({ queryKey: ['drafts'], queryFn: () => api.list(), retry: false });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [name, setName] = useState('修仙内容草稿');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DraftError | null>(null);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState<DynamicContentEnvelope | null>(null);
  const dirty =
    draft !== null && (name !== draft.name || text !== JSON.stringify(draft.envelope, null, 2));
  function select(value: Draft) {
    setDraft(value);
    setName(value.name);
    setText(JSON.stringify(value.envelope, null, 2));
    setPreview(null);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setStatus('');
    try {
      await action();
    } catch (failure) {
      setError(
        failure instanceof DraftError
          ? failure
          : new DraftError(
              failure instanceof SyntaxError ? 'JSON 格式不正确。' : '操作失败，请重试。',
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  function mayReplace() {
    return !dirty || window.confirm('丢弃尚未保存的本地编辑？');
  }
  return (
    <section className="draft-workspace">
      <header>
        <p className="eyebrow">DYNAMIC CONTENT</p>
        <h2>修仙内容草稿</h2>
        <p>编辑与预览不会更改玩家版本。当前 schema v2；v1 保存时自动迁移标题。</p>
      </header>
      <div className="draft-toolbar">
        <label>
          草稿名称
          <input
            aria-label="草稿名称"
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          disabled={busy}
          onClick={() => {
            if (mayReplace())
              void run(async () => {
                select(await api.create(name));
                await queryClient.invalidateQueries({ queryKey: ['drafts'] });
              });
          }}
        >
          新建草稿
        </button>
        <label>
          读取草稿
          <select
            aria-label="读取草稿"
            value={draft?.id ?? ''}
            disabled={busy}
            onChange={(event) => {
              const id = event.target.value;
              if (id && mayReplace()) void run(async () => select(await api.read(id)));
            }}
          >
            <option value="">选择草稿</option>
            {drafts.data?.map((value) => (
              <option key={value.id} value={value.id}>
                {value.name} · r{value.revision}
              </option>
            ))}
          </select>
        </label>
        {draft && (
          <button
            disabled={busy}
            onClick={() => {
              if (mayReplace()) void run(async () => select(await api.read(draft.id)));
            }}
          >
            重新读取
          </button>
        )}
      </div>
      {drafts.error && (
        <p role="alert">
          无法读取草稿列表。<button onClick={() => void drafts.refetch()}>重试</button>
        </p>
      )}
      {draft && (
        <>
          <label htmlFor="draft-json">
            版本化内容 JSON · r{draft.revision}
            {dirty ? ' · 未保存' : ''}
          </label>
          <textarea
            id="draft-json"
            spellCheck={false}
            value={text}
            disabled={busy}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="draft-toolbar">
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.validate(JSON.parse(text));
                  setStatus('校验通过。');
                })
              }
            >
              校验内容
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const saved = await api.save({ ...draft, name, envelope: JSON.parse(text) });
                  select(saved);
                  setStatus('草稿已保存。');
                  await queryClient.invalidateQueries({ queryKey: ['drafts'] });
                })
              }
            >
              保存草稿
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = normalizeCultivationContent(JSON.parse(text));
                  if (!result.success) throw new DraftError('内容校验失败。', result.issues);
                  setPreview(result.data);
                  setStatus('预览使用当前编辑内容，不会自动保存。');
                })
              }
            >
              预览当前编辑
            </button>
            {preview && <button onClick={() => setPreview(null)}>关闭预览</button>}
          </div>
        </>
      )}
      {error && (
        <div role="alert" className="form-error">
          <p>{error.message}</p>
          <ul>
            {error.issues.map((issue, index) => (
              <li key={index}>
                {issue.path.join('.')}：{issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p role="status">{busy ? '正在处理…' : status}</p>
      {preview && <DraftPreview key={JSON.stringify(preview)} envelope={preview} />}
    </section>
  );
}
