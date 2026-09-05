import { useEffect, useRef, useState } from 'react';

import { gameManifestSchema, type GameHost, type GameManifest } from '@coffeeeeffoc/game-contract';
import {
  FallbackGameLoader,
  InProcessGameLoader,
  type RemoteGameArtifact,
} from '@coffeeeeffoc/game-loader';

import type { BuiltInGame } from './registry.js';

function readLastKnownGood(gameId: string): RemoteGameArtifact | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`game-lkg:${gameId}`) ?? 'null');
    if (!value || typeof value !== 'object' || !('entryUrl' in value) || !('manifest' in value))
      return null;
    const manifest = gameManifestSchema.safeParse(value.manifest);
    return typeof value.entryUrl === 'string' && manifest.success
      ? { entryUrl: value.entryUrl, manifest: manifest.data }
      : null;
  } catch {
    return null;
  }
}

function rememberLastKnownGood(gameId: string, artifact: RemoteGameArtifact): void {
  try {
    localStorage.setItem(`game-lkg:${gameId}`, JSON.stringify(artifact));
  } catch {
    // Storage availability must not block a verified Game launch.
  }
}

export function GameViewport({
  game,
  createHost,
  createFallbackLoader = () => new FallbackGameLoader(),
  onExit,
}: {
  game: BuiltInGame;
  createHost: (game: BuiltInGame, manifest?: GameManifest) => GameHost;
  createFallbackLoader?: () => FallbackGameLoader;
  onExit: () => void;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  const [loader] = useState(() =>
    game.remote ? createFallbackLoader() : new InProcessGameLoader(),
  );
  const [error, setError] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    let active = true;
    const launch = game.remote
      ? (loader as FallbackGameLoader).launch(
          {
            target: game.remote.target,
            lastKnownGood: readLastKnownGood(game.id),
            builtIn: game.definition,
            rememberLastKnownGood: (artifact) => rememberLastKnownGood(game.id, artifact),
          },
          target,
          (manifest) => createHost(game, manifest),
        )
      : (loader as InProcessGameLoader).launch(game.definition, target, createHost(game));
    void launch.catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Game 启动失败');
    });

    const handleVisibility = () => {
      void (document.hidden ? loader.pause() : loader.resume()).catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Game 生命周期切换失败');
      });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      void loader.dispose().catch(() => undefined);
    };
  }, [createHost, game, loader]);

  async function exit() {
    setExiting(true);
    try {
      await loader.dispose();
      onExit();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Game 释放失败');
      setExiting(false);
    }
  }

  return (
    <main className="game-page">
      <nav>
        <button disabled={exiting} onClick={() => void exit()}>
          {exiting ? '正在返回…' : '← 返回目录'}
        </button>
        <strong>{game.title}</strong>
      </nav>
      {error ? (
        <section role="alert">Game 错误：{error}</section>
      ) : (
        <div ref={targetRef} className="game-slot" />
      )}
    </main>
  );
}
