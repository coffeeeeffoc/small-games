import { useEffect, useState } from 'react';

import type { GameHost, GameManifest, ReleaseChannel } from '@coffeeeeffoc/game-contract';
import { FallbackGameLoader, VersionCircuitBreaker } from '@coffeeeeffoc/game-loader';

import { GameViewport } from './GameViewport.js';
import standaloneGames from './standalone-games.json';
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

const featuredGameOrder: Record<string, number> = {
  'carding-car': 0,
  'cops-robbers': 1,
  'cops-robbers-realtime': 2,
  'letters-words2': 3,
  'vibeJam-myself-history-guess': 4,
  'xiangqi-five': 5,
};

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
  const [hash, setHash] = useState(() => window.location.hash);
  const [selected, setSelected] = useState<BuiltInGame | null>(null);
  const game = registry.find((entry) => hash === `#/games/${encodeURIComponent(entry.id)}`);
  const standalone = standaloneGames.find(
    (entry) => hash === `#/games/${encodeURIComponent(entry.id)}`,
  );
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof defaultRuntime.catalog>>>([]);
  const [catalogReady, setCatalogReady] = useState(!runtimeClient);
  const [channel, setChannel] = useState<ReleaseChannel>('stable');
  const [versionId, setVersionId] = useState('');
  const [credential, setCredential] = useState(() => playerCredential ?? localPlayerCredential());
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(
    runtimeClient ? '本地默认 Catalog 可随时启动。' : '即点即玩，游戏进度保存在当前浏览器。',
  );
  useEffect(() => {
    const syncRoute = () => setHash(window.location.hash);
    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('popstate', syncRoute);
    return () => {
      window.removeEventListener('hashchange', syncRoute);
      window.removeEventListener('popstate', syncRoute);
    };
  }, []);

  function navigate(gameId?: string) {
    const next = gameId ? `#/games/${encodeURIComponent(gameId)}` : '';
    if (window.location.hash !== next)
      window.history.pushState(
        null,
        '',
        `${window.location.pathname}${window.location.search}${next}`,
      );
    setHash(next);
  }

  useEffect(() => {
    let active = true;
    setCatalogReady(!runtimeClient);
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
        })
        .finally(() => {
          if (active) setCatalogReady(true);
        });
    return () => {
      active = false;
    };
  }, [runtimeClient]);
  useEffect(() => {
    let active = true;
    setSelected(null);
    if (!game || !catalogReady) {
      setLoading(false);
      return;
    }
    setLoading(true);
    async function launch(game: BuiltInGame) {
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
          if (!active) return;
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
        if (!active) return;
        setNotice('目标版本不可用或不兼容，已使用本地内置版本。');
        setSelected({
          ...game,
          playerId: credential.playerId,
          remote: undefined,
          runtimeSession: undefined,
          runtimeStorage: runtimeClient ? unavailableRuntimeStorage : undefined,
        });
      } finally {
        if (active) setLoading(false);
      }
    }
    void launch(game);
    return () => {
      active = false;
    };
  }, [game, catalogReady, catalog, runtimeClient, versionId, channel, credential]);

  return standalone ? (
    <main className="game-page standalone-page">
      <nav aria-label="游戏导航">
        <button onClick={() => navigate()}>返回目录</button>
        <strong>{standalone.title}</strong>
        <a
          href={`${import.meta.env.BASE_URL}games/${standalone.id}/index.html`}
          target="_blank"
          rel="noreferrer"
        >
          独立打开
        </a>
      </nav>
      <iframe
        title={standalone.title}
        src={`${import.meta.env.BASE_URL}games/${standalone.id}/index.html`}
        allow="autoplay; fullscreen"
        allowFullScreen
      />
    </main>
  ) : selected && selected.id === game?.id ? (
    <GameViewport
      key={selected.id}
      game={selected}
      createHost={createHost}
      createFallbackLoader={
        createFallbackLoader ?? (() => new FallbackGameLoader(undefined, breaker))
      }
      onExit={() => navigate()}
    />
  ) : (
    <main className="shell-catalog">
      <header>
        <small>COFFEEEEFFOC ARCADE</small>
        <h1>摸鱼游戏社</h1>
        <p>选择一个小世界，随时可以安全返回。</p>
        <p role="status">{loading ? '正在进入游戏…' : notice}</p>
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
        {[...registry, ...standaloneGames]
          .sort((a, b) => (featuredGameOrder[a.id] ?? 6) - (featuredGameOrder[b.id] ?? 6))
          .map((game) => (
            <article key={game.id}>
              <span>
                {'definition' in game
                  ? game.remote
                    ? 'REMOTE GAME · BUILT-IN FALLBACK'
                    : 'BUILD-TIME GAME'
                  : '独立游戏'}
              </span>
              <h2>{game.title}</h2>
              <p>{game.description}</p>
              <button
                disabled={
                  'definition' in game &&
                  (loading || (!!versionId && !/^[a-f0-9]{64}$/.test(versionId)))
                }
                onClick={() => navigate(game.id)}
              >
                进入游戏
              </button>
            </article>
          ))}
      </section>
    </main>
  );
}
