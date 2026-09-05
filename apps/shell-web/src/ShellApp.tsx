import { useState } from 'react';

import type { GameHost, GameManifest } from '@coffeeeeffoc/game-contract';
import { FallbackGameLoader, VersionCircuitBreaker } from '@coffeeeeffoc/game-loader';

import { GameViewport } from './GameViewport.js';
import { createWebGameHost } from './host.js';
import { builtInGameRegistry, type BuiltInGame } from './registry.js';

/** Public injection seams for catalog and Game Host integration tests. */
export type ShellAppProps = {
  registry?: readonly BuiltInGame[];
  createHost?: (game: BuiltInGame, manifest?: GameManifest) => GameHost;
  createFallbackLoader?: () => FallbackGameLoader;
};

/** Catalog and viewport owned by the Web Shell. */
export function ShellApp({
  registry = builtInGameRegistry,
  createHost = createWebGameHost,
  createFallbackLoader,
}: ShellAppProps) {
  const [breaker] = useState(() => new VersionCircuitBreaker());
  const [selected, setSelected] = useState<BuiltInGame | null>(null);

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
      </header>
      <section className="catalog-grid" aria-label="Game Catalog">
        {registry.map((game) => (
          <article key={game.id}>
            <span>{game.remote ? 'REMOTE GAME · BUILT-IN FALLBACK' : 'BUILD-TIME GAME'}</span>
            <h2>{game.title}</h2>
            <p>{game.description}</p>
            <button onClick={() => setSelected(game)}>进入游戏</button>
          </article>
        ))}
      </section>
    </main>
  );
}
