import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  normalizeManagedAdConfig,
  resolveAdPolicy,
  type ManagedAdConfig,
} from '@coffeeeeffoc/ad-config';
import {
  createAdDraftClient,
  AdDraftError,
  type AdDraft,
  type AdDraftClient,
} from './ad-draft-client.js';

const client = createAdDraftClient();
/** Managed Ad editing stays local until an explicit successful optimistic save. */
export function AdEditor({ api = client }: { api?: AdDraftClient }) {
  const queryClient = useQueryClient();
  const drafts = useQuery({ queryKey: ['ad-drafts'], queryFn: () => api.list(), retry: false });
  const [draft, setDraft] = useState<AdDraft | null>(null);
  const [name, setName] = useState('Managed Ad 草稿');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AdDraftError | null>(null);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState<ManagedAdConfig | null>(null);
  const dirty =
    draft !== null && (name !== draft.name || text !== JSON.stringify(draft.envelope, null, 2));
  function select(value: AdDraft) {
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
        failure instanceof AdDraftError
          ? failure
          : new AdDraftError(
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
        <p className="eyebrow">MANAGED AD</p>
        <h2>Managed Ad 配置</h2>
        <p>素材、频控与奖励规则；保存与预览不会影响玩家，发布后才进入 Runtime。</p>
      </header>
      <div className="draft-toolbar">
        <label>
          草稿名称
          <input
            aria-label="Managed Ad 草稿名称"
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
                await queryClient.invalidateQueries({ queryKey: ['ad-drafts'] });
              });
          }}
        >
          新建草稿
        </button>
        <label>
          读取草稿
          <select
            aria-label="读取 Managed Ad 草稿"
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
          无法读取 Managed Ad 草稿列表。
          <button onClick={() => void drafts.refetch()}>重试</button>
        </p>
      )}
      {draft && (
        <>
          <label htmlFor="ad-draft-json">
            Managed Ad 配置 JSON · r{draft.revision}
            {dirty ? ' · 未保存' : ''}
          </label>
          <textarea
            id="ad-draft-json"
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
              校验配置
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const saved = await api.save({ ...draft, name, envelope: JSON.parse(text) });
                  select(saved);
                  setStatus('草稿已保存。');
                  await queryClient.invalidateQueries({ queryKey: ['ad-drafts'] });
                })
              }
            >
              保存草稿
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = normalizeManagedAdConfig(JSON.parse(text));
                  if (!result.success) throw new AdDraftError('配置校验失败。', result.issues);
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
      {preview && <AdPreview key={JSON.stringify(preview)} config={preview} />}
    </section>
  );
}

/** Read-only rendering of the configured creatives, placements, and resolved frequency rules. */
export function AdPreview({ config }: { config: ManagedAdConfig }) {
  return (
    <section className="ad-preview" aria-label="Managed Ad 预览">
      <h3>素材与投放预览 · {config.enabled ? '已启用' : '未启用'}</h3>
      <ul>
        {config.creatives.map((creative) => (
          <li key={creative.id}>
            <strong>{creative.title}</strong>
            {creative.body ? ` · ${creative.body}` : ''} · {creative.ctaLabel} · 完整观看{' '}
            {creative.durationMs / 1000} 秒
          </li>
        ))}
      </ul>
      <h3>Reward Opportunity 规则</h3>
      {config.placements.length === 0 ? (
        <p>尚未配置投放；启用后也不会向玩家展示广告。</p>
      ) : (
        <ul>
          {config.placements.map((placement) => {
            const policy = resolveAdPolicy(
              {
                shell: config.policy,
                opportunities: { [placement.opportunityId]: placement.policy },
              },
              placement.opportunityId,
            );
            const frequency =
              policy.maxPerSession === Number.MAX_SAFE_INTEGER ? '不限' : policy.maxPerSession;
            const limit =
              typeof placement.reward.maxPerSession === 'number'
                ? ` · 每会话 ${placement.reward.maxPerSession} 次`
                : '';
            return (
              <li key={placement.opportunityId}>
                {placement.opportunityId} → {placement.creativeId} · 奖励
                {placement.reward.enabled ? '开启' : '关闭'}
                {limit} · 频控 {frequency} 次 / 冷却 {policy.cooldownMs}ms
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
