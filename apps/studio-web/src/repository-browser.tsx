import { useEffect, useRef, useState } from 'react';
import {
  renderUnifiedDiff,
  type RepositoryDiff,
  type RepositoryFile,
} from '@coffeeeeffoc/repository-bridge';
import {
  createWorkspaceAgentClient,
  type RepositoryEntry,
  type RepositoryTree,
  type WorkspaceAgentClient,
  WorkspaceAgentError,
} from './workspace-agent-client.js';

const client = createWorkspaceAgentClient();

function language(path: string) {
  const extension = path.split('.').at(-1)?.toLowerCase();
  if (extension === 'json') return 'json';
  if (extension === 'js' || extension === 'jsx' || extension === 'mjs') return 'javascript';
  if (extension === 'ts' || extension === 'tsx') return 'typescript';
  if (extension === 'css') return 'css';
  if (extension === 'html') return 'html';
  return 'plaintext';
}

function SourceEditor({
  path,
  value,
  onChange,
}: {
  path: string;
  value: string;
  onChange(value: string): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const initialValue = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => {
    if (!host.current || !('ResizeObserver' in window)) return;
    let disposed = false;
    let dispose: (() => void) | undefined;
    void import('monaco-editor').then((monaco) => {
      if (disposed || !host.current) return;
      const editor = monaco.editor.create(host.current, {
        value: initialValue.current,
        language: language(path),
        automaticLayout: true,
        minimap: { enabled: false },
        theme: 'vs-dark',
      });
      const listener = editor.onDidChangeModelContent(() => onChangeRef.current(editor.getValue()));
      dispose = () => {
        listener.dispose();
        editor.dispose();
      };
      setEnhanced(true);
    });
    return () => {
      disposed = true;
      dispose?.();
    };
  }, [path]);
  return (
    <>
      <div className="source-editor" ref={host} aria-label={`${path} Monaco Editor`} />
      <textarea
        className={enhanced ? 'editor-fallback editor-fallback--hidden' : 'editor-fallback'}
        aria-label={`${path} source`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </>
  );
}

function Entries({ entries, onRead }: { entries: RepositoryEntry[]; onRead(path: string): void }) {
  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry.path}>
          {entry.type === 'file' ? (
            <button onClick={() => onRead(entry.path)}>{entry.name}</button>
          ) : (
            <>
              <span>{entry.name}</span>
              <Entries entries={entry.children ?? []} onRead={onRead} />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Pairs with the local Agent and keeps the last source visible if it disconnects. */
export function RepositoryBrowser({ api = client }: { api?: WorkspaceAgentClient }) {
  const [code, setCode] = useState('');
  const [tree, setTree] = useState<RepositoryTree | null>(null);
  const [file, setFile] = useState<RepositoryFile | null>(null);
  const [source, setSource] = useState('');
  const [review, setReview] = useState<RepositoryDiff | null>(null);
  const [message, setMessage] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      if (!(error instanceof WorkspaceAgentError)) setConnected(false);
      setMessage(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="repository-browser">
      <header>
        <p className="eyebrow">REPOSITORY BRIDGE</p>
        <h2>本地 Game 源码</h2>
      </header>
      {!connected && <p role="status">只读：Workspace Agent 已断开</p>}
      {!tree && (
        <div className="draft-toolbar">
          <label>
            短期配对码
            <input value={code} onChange={(event) => setCode(event.target.value)} disabled={busy} />
          </label>
          <button
            disabled={busy || !code}
            onClick={() =>
              void run(async () => {
                await api.pair(code);
                setTree(await api.tree());
                setConnected(true);
                setCode('');
                setMessage('');
              })
            }
          >
            连接本机 Workspace Agent
          </button>
        </div>
      )}
      {tree?.games.map((game) => (
        <section key={game.id}>
          <h3>{game.id}</h3>
          <Entries
            entries={game.files}
            onRead={(filePath) =>
              void run(async () => {
                const next = await api.read(game.id, filePath);
                setFile(next);
                setSource(next.source);
                setReview(null);
                setMessage('');
                setConnected(true);
              })
            }
          />
        </section>
      ))}
      {file && (
        <section className="source-workspace">
          <h3>{file.path}</h3>
          <SourceEditor
            key={`${file.gameId}/${file.path}/${file.version}`}
            path={file.path}
            value={source}
            onChange={(value) => {
              setSource(value);
              setReview(null);
              setMessage('');
            }}
          />
          <button
            disabled={busy || source === file.source}
            onClick={() =>
              void run(async () => {
                setReview(
                  await api.diff({
                    gameId: file.gameId,
                    path: file.path,
                    source,
                    baseVersion: file.version,
                  }),
                );
              })
            }
          >
            审查 diff
          </button>
        </section>
      )}
      {message && <p role="status">{message}</p>}
      {review && (
        <dialog open aria-label="保存确认">
          <h3>确认应用 diff</h3>
          {review.files.map((affected) => (
            <p key={affected.path}>
              {affected.path}（+{affected.added} / -{affected.removed}）
            </p>
          ))}
          <pre>{renderUnifiedDiff(review.repositoryPath, review.hunks)}</pre>
          {review.stale && <p role="alert">文件已被其他修改覆盖，请重新读取后再试。</p>}
          <button onClick={() => setReview(null)}>取消</button>
          <button
            disabled={busy || review.stale || review.files.length === 0}
            onClick={() =>
              void run(async () => {
                if (!file) return;
                const saved = await api.write({
                  gameId: file.gameId,
                  path: file.path,
                  source,
                  baseVersion: file.version,
                  confirmation: true,
                });
                setFile({ ...saved, editable: true });
                setSource(saved.source);
                setReview(null);
                setMessage('已保存并重新读取，格式检查通过。');
              })
            }
          >
            确认保存
          </button>
        </dialog>
      )}
    </section>
  );
}
