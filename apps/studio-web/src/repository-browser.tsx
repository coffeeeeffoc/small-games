import { useState } from 'react';
import {
  createWorkspaceAgentClient,
  type RepositoryEntry,
  type RepositoryTree,
  type WorkspaceAgentClient,
} from './workspace-agent-client.js';

const client = createWorkspaceAgentClient();

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
  const [source, setSource] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch {
      setConnected(false);
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
                setSource((await api.read(game.id, filePath)).source);
                setConnected(true);
              })
            }
          />
        </section>
      ))}
      {source && <pre tabIndex={0}>{source}</pre>}
    </section>
  );
}
