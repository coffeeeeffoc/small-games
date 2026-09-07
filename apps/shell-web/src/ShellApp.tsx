import { useEffect, useState } from 'react';

import type { GameHost, GameManifest, ReleaseChannel } from '@coffeeeeffoc/game-contract';
import { FallbackGameLoader, VersionCircuitBreaker } from '@coffeeeeffoc/game-loader';

import { GameViewport } from './GameViewport.js';
import { createWebGameHost } from './host.js';
import { builtInGameRegistry, type BuiltInGame } from './registry.js';
import {
  createRuntimeClient,
  localPlayerCredential,
  parsePlayerLoginCode,
  playerLoginCode,
  savePlayerCredential,
  type PlayerCredential,
  unavailableRuntimeStorage,
  withPublishedSession,
} from './runtime-client.js';
import type { RemoteGameArtifact } from '@coffeeeeffoc/game-loader';

const defaultRuntime = createRuntimeClient(
  import.meta.env.VITE_RUNTIME_URL ?? 'http://127.0.0.1:43002',
);

/** Public injection seams for catalog and Game Host integration tests. */
export type ShellAppProps = {
  registry?: readonly BuiltInGame[];
  createHost?: (
    game: BuiltInGame,
    manifest?: GameManifest,
    artifact?: RemoteGameArtifact,
  ) => GameHost;
  createFallbackLoader?: () => FallbackGameLoader;
  runtimeClient?: ReturnType<typeof createRuntimeClient> | false;
  playerCredential?: PlayerCredential;
};

/** Catalog and viewport owned by the Web Shell. */
export function ShellApp({
  registry = builtInGameRegistry,
  createHost = createWebGameHost,
  createFallbackLoader,
  runtimeClient = defaultRuntime,
  playerCredential,
}: ShellAppProps) {
  const [breaker] = useState(() => new VersionCircuitBreaker());
  const [selected, setSelected] = useState<BuiltInGame | null>(null);
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof defaultRuntime.catalog>>>([]);
  const [channel, setChannel] = useState<ReleaseChannel>('stable');
  const [versionId, setVersionId] = useState('');
  const [credential, setCredential] = useState(() => playerCredential ?? localPlayerCredential());
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('本地默认 Catalog 可随时启动。');
  useEffect(() => {
    let active = true;
    if (runtimeClient)
      void runtimeClient
        .catalog()
        .then((entries) => {
          if (active) {
            setCatalog(entries);
            setNotice(
              entries.length ? '已连接已发布 Catalog。' : '尚无已发布版本，使用本地默认 Catalog。',
            );
          }
        })
        .catch(() => {
          if (active) setNotice('Runtime 不可用，使用本地默认 Catalog。');
        });
    return () => {
      active = false;
    };
  }, [runtimeClient]);
  async function launch(game: BuiltInGame) {
    setLoading(true);
    try {
      if (runtimeClient && (versionId || catalog.some((entry) => entry.gameId === game.id))) {
        const published = await runtimeClient.session(
          {
            gameId: game.id,
            playerId: credential.playerId,
            channel,
            locale: 'zh-CN',
            capabilities: ['content', 'storage', 'advertising', 'telemetry', 'navigation'],
            ...(versionId ? { versionId } : {}),
          },
          credential.playerToken,
        );
        setSelected(
          withPublishedSession(
            game,
            published,
            runtimeClient.storage(published.session.sessionId),
            credential.playerId,
          ),
        );
      } else
        setSelected({
          ...game,
          playerId: credential.playerId,
          runtimeStorage: runtimeClient ? unavailableRuntimeStorage : undefined,
        });
    } catch {
      setNotice('目标版本不可用或不兼容，已使用本地内置版本。');
      setSelected({
        ...game,
        playerId: credential.playerId,
        remote: undefined,
        runtimeSession: undefined,
        runtimeStorage: runtimeClient ? unavailableRuntimeStorage : undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  return selected ? (
    <GameViewport
      game={selected}
      createHost={createHost}
      createFallbackLoader={
        createFallbackLoader ?? (() => new FallbackGameLoader(undefined, breaker))
      }
      onExit={() => setSelected(null)}
    />
  ) : (
    <main className="shell-catalog">
      <header>
        <small>COFFEEEEFFOC ARCADE</small>
        <h1>摸鱼游戏社</h1>
        <p>选择一个小世界，随时可以安全返回。</p>
        <p role="status">{notice}</p>
        {runtimeClient && (
          <fieldset disabled={loading}>
            <legend>已发布版本选择</legend>
            <label>
              Release Channel
              <select
                value={channel}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'development' || value === 'canary' || value === 'stable')
                    setChannel(value);
                }}
              >
                <option value="stable">stable</option>
                <option value="canary">canary</option>
                <option value="development">development</option>
              </select>
            </label>
            <label>
              固定版本（可选）
              <input
                value={versionId}
                onChange={(event) => setVersionId(event.target.value.trim())}
                placeholder="发布快照 SHA-256"
              />
            </label>
          </fieldset>
        )}
        {runtimeClient && (
          <details>
            <summary>云存档账号</summary>
            <p>在另一台设备粘贴登录码即可恢复存档。登录码等同密码，请勿公开。</p>
            <label>
              当前登录码
              <input
                readOnly
                value={playerLoginCode(credential)}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const next = parsePlayerLoginCode(
                  String(new FormData(event.currentTarget).get('player-login-code') ?? ''),
                );
                if (!next) return setNotice('云存档登录码无效。');
                savePlayerCredential(next);
                setCredential(next);
                setNotice('云存档账号已切换。');
                event.currentTarget.reset();
              }}
            >
              <label>
                在此设备登录
                <input name="player-login-code" type="password" autoComplete="off" required />
              </label>
              <button type="submit">登录云存档</button>
            </form>
          </details>
        )}
      </header>
      <section className="catalog-grid" aria-label="Game Catalog">
        {registry.map((game) => (
          <article key={game.id}>
            <span>{game.remote ? 'REMOTE GAME · BUILT-IN FALLBACK' : 'BUILD-TIME GAME'}</span>
            <h2>{game.title}</h2>
            <p>{game.description}</p>
            <button
              disabled={loading || (!!versionId && !/^[a-f0-9]{64}$/.test(versionId))}
              onClick={() => void launch(game)}
            >
              进入游戏
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}
