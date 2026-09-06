import { useState } from 'react';
import type { SourceExtensionTask, WorkspaceAgentClient } from './workspace-agent-client.js';

export function SourceGenerationPanel({ api }: { api: WorkspaceAgentClient }) {
  const [gameId, setGameId] = useState('');
  const [mode, setMode] = useState<'create' | 'modify'>('modify');
  const [input, setInput] = useState('');
  const [dependencies, setDependencies] = useState('');
  const [task, setTask] = useState<SourceExtensionTask | null>(null);
  const [explanation, setExplanation] = useState('');
  const [diff, setDiff] = useState('');
  const [busy, setBusy] = useState(false);
  const [cleanup, setCleanup] = useState<Awaited<
    ReturnType<WorkspaceAgentClient['cleanupSource']>
  > | null>(null);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="source-workspace">
      <h3>AI Source Extension</h3>
      {!task ? (
        <>
          <label>
            Game ID
            <input value={gameId} onChange={(event) => setGameId(event.target.value)} />
          </label>
          <select
            aria-label="Source Extension mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as 'create' | 'modify')}
          >
            <option value="modify">修改既有 Game</option>
            <option value="create">创建新 Game</option>
          </select>
          <label>
            已授权依赖（逗号分隔）
            <input value={dependencies} onChange={(event) => setDependencies(event.target.value)} />
          </label>
          <button
            disabled={busy || !gameId}
            onClick={() =>
              void run(async () =>
                setTask(
                  await api.startSourceExtension({
                    gameId,
                    mode,
                    allowedDependencies: dependencies
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean),
                  }),
                ),
              )
            }
          >
            创建隔离任务
          </button>
        </>
      ) : (
        <>
          <p>
            {task.gameId} · attempt {task.attempt} · {task.status}
          </p>
          <label>
            生成或修复要求
            <textarea value={input} onChange={(event) => setInput(event.target.value)} />
          </label>
          <button
            disabled={busy || !input || task.status === 'candidate'}
            onClick={() =>
              void run(async () => {
                const generated = await api.generateSource(task.id, input);
                setExplanation(generated.explanation);
                setDiff(await api.sourceDiff(task.id));
              })
            }
          >
            AI 生成 / 修复
          </button>
          <button
            disabled={busy || task.status !== 'active'}
            onClick={() => void run(async () => setTask(await api.validateSource(task.id)))}
          >
            运行验证
          </button>
          {task.status === 'failed' && (
            <button
              disabled={busy}
              onClick={() => void run(async () => setTask(await api.retrySource(task.id)))}
            >
              基于原上下文修复
            </button>
          )}
          {task.status === 'validated' && (
            <button
              disabled={busy}
              onClick={() => void run(async () => setTask(await api.commitSource(task.id)))}
            >
              确认形成候选提交
            </button>
          )}
          {explanation && <p>{explanation}</p>}
          {diff && <pre>{diff}</pre>}
          {task.commit && <p>候选提交：{task.commit}</p>}
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => setCleanup(await api.cleanupSource(task.id, false)))
            }
          >
            查看清理影响
          </button>
          {cleanup && !cleanup.removed && (
            <dialog open aria-label="清理确认">
              <p>{cleanup.worktreePath}</p>
              <p>{cleanup.attemptCount} 个 attempt 记录会保留。</p>
              <p>{cleanup.changedPaths.length} 个未提交路径会被丢弃。</p>
              <ul>
                {cleanup.changedPaths.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
              <button onClick={() => setCleanup(null)}>取消</button>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => setCleanup(await api.cleanupSource(task.id, true)))
                }
              >
                确认清理 worktree
              </button>
            </dialog>
          )}
          {cleanup?.removed && <p role="status">worktree 已清理，任务记录已保留。</p>}
        </>
      )}
    </section>
  );
}
