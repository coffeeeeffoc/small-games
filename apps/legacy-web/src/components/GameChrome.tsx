import { ReactNode } from 'react';
export function GameChrome({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <main className="game-shell">
      <header className="game-top">
        <button className="icon-button" onClick={onBack} aria-label="返回大厅">
          ←
        </button>
        <div>
          <b>{title}</b>
          <small>{subtitle}</small>
        </div>
        <span className="live-dot">MVP</span>
      </header>
      {children}
    </main>
  );
}
