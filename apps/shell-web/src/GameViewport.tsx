import { useEffect, useRef, useState } from 'react';

import type { GameHost } from '@coffeeeeffoc/game-contract';
import { InProcessGameLoader } from '@coffeeeeffoc/game-loader';

import type { BuiltInGame } from './registry.js';

export function GameViewport({
  game,
  createHost,
  onExit,
}: {
  game: BuiltInGame;
  createHost: (game: BuiltInGame) => GameHost;
  onExit: () => void;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  const loaderRef = useRef(new InProcessGameLoader());
  const [error, setError] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const loader = loaderRef.current;
    const target = targetRef.current;
    if (!target) return;
    let active = true;
    void loader.launch(game.definition, target, createHost(game)).catch((reason: unknown) => {
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
  }, [createHost, game]);

  async function exit() {
    setExiting(true);
    try {
      await loaderRef.current.dispose();
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
