import { useRef } from 'react';

import { GameShare } from './GameShare.js';
import { publicGameQuery } from './game-sharing.js';

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
  const query = publicGameQuery(id, search);
  const entry = `${import.meta.env.BASE_URL}games/${id}/index.html${query ? `?${query}` : ''}`;
  return (
    <main className="game-page standalone-page" data-game-display-host>
      <nav aria-label="游戏导航">
        <button onClick={onExit}>返回目录</button>
        <strong>{title}</strong>
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
        <button type="button" data-game-fullscreen>
          全屏
        </button>
        <a href={entry} target="_blank" rel="noreferrer">
          独立打开
        </a>
      </nav>
      <iframe
        ref={frame}
        title={title}
        src={entry}
        allow={id === 'echo-lab' ? 'autoplay; fullscreen; microphone' : 'autoplay; fullscreen'}
        allowFullScreen
      />
    </main>
  );
}
