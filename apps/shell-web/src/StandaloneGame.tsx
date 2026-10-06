import { useEffect, useRef, useState } from 'react';
import '../dev-mode.js';

import { GameShare } from './GameShare.js';
import { standaloneGameEntry } from './standalone-entry.js';

export function StandaloneGame({
  id,
  title,
  search = '',
  onExit,
}: {
  id: string;
  title: string;
  search?: string;
  onExit: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const entry = standaloneGameEntry(id, search);
  const [display, setDisplay] = useState({ entry, playing: false });
  const playing = display.entry === entry && display.playing;
  const immersive =
    id === 'ink-is-everything' ||
    id === 'ball-roguelite' ||
    id === 'xiangqi-five' ||
    id === 'letters-words2';
  useEffect(() => {
    window.SmallGamesDev.setPanelHidden(true);
    return () => window.SmallGamesDev.setPanelHidden(false);
  }, []);
  useEffect(() => {
    if (!immersive) return;
    const origin = new URL(entry, window.location.href).origin;
    function displayState(event: MessageEvent<unknown>) {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
      const message = data as Record<string, unknown>;
      if (
        Object.keys(message).length !== 3 ||
        message.type !== 'small-games:display-state' ||
        message.gameId !== id ||
        (message.screen !== 'home' && message.screen !== 'playing')
      )
        return;
      setDisplay({ entry, playing: message.screen === 'playing' });
    }
    window.addEventListener('message', displayState);
    return () => window.removeEventListener('message', displayState);
  }, [entry, immersive, id]);
  return (
    <main
      className="game-page standalone-page"
      data-game-display-host
      data-game-id={id}
      data-immersive={immersive ? 'true' : undefined}
      data-screen={immersive ? (playing ? 'playing' : 'home') : undefined}
    >
      <nav aria-label="游戏导航" hidden={immersive && playing}>
        <button onClick={onExit} aria-label="返回目录">
          返回目录
        </button>
        {!immersive && <strong>{title}</strong>}
        {(!immersive || id === 'xiangqi-five') && (
          <GameShare
            gameId={id}
            title={title}
            entryUrl={new URL(entry, window.location.href).href}
            currentUrl={() => {
              try {
                return frame.current?.contentWindow?.location.href;
              } catch {
                return undefined;
              }
            }}
          />
        )}
        {!immersive && (
          <>
            <button type="button" data-game-fullscreen>
              全屏
            </button>
            <a href={entry} target="_blank" rel="noreferrer">
              独立打开
            </a>
          </>
        )}
      </nav>
      <iframe
        ref={frame}
        onLoad={() => {
          if (immersive) setDisplay({ entry, playing: false });
        }}
        title={title}
        src={entry}
        allow={id === 'echo-lab' ? 'autoplay; fullscreen; microphone' : 'autoplay; fullscreen'}
        allowFullScreen
      />
    </main>
  );
}
