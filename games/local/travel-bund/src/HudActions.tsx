type HudActionsProps = {
  onCapture: () => void;
  onJournal: () => void;
  onJump: () => void;
  jumpDisabled: boolean;
  visitsCount: number;
};

export function CameraIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M11 7 13 4h6l2 3h5a3 3 0 0 1 3 3v15a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V10a3 3 0 0 1 3-3Z" fill="currentColor" />
      <circle cx="16" cy="17" r="6" fill="none" stroke="var(--cream)" strokeWidth="2.5" />
      <circle cx="25" cy="11" r="1.3" fill="var(--cream)" />
    </svg>
  );
}

export function JournalIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 7C12 4 7 4 3 6v21c4-2 9-2 13 1 4-3 9-3 13-1V6c-4-2-9-2-13 1ZM16 7v21" />
      <path d="m7 10 5 1m-5 4 5 1m-5 4 5 1m8-10 5-1m-5 6 5-1m-5 6 5-1" />
    </svg>
  );
}

export function JumpIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="20" cy="4.5" r="2.8" fill="currentColor" stroke="none" />
      <path d="m16 9-5 2-3 4m8-6 5 3 5-3m-10 0-4 9-5 4m5-4 6 2-3 5" strokeWidth="3.5" />
      <path d="M6 29h20" strokeWidth="2" />
    </svg>
  );
}

export function HudActions({ onCapture, onJournal, onJump, jumpDisabled, visitsCount }: HudActionsProps) {
  return (
    <div className="hud-actions" role="group" aria-label="游览操作">
      <button className="hud-action jump" type="button" aria-label="跳跃" disabled={jumpDisabled} onPointerDown={(event) => event.preventDefault()} onClick={onJump}>
        <JumpIcon />
        <span className="hud-action-label">跳跃</span>
      </button>
      <button className="hud-action capture" type="button" aria-label="拍照" onClick={onCapture}>
        <CameraIcon />
        <span className="hud-action-label">拍照</span>
      </button>
      <button className="hud-action journal" type="button" aria-label="打开旅行手记" onClick={onJournal}>
        <JournalIcon />
        <span className="hud-action-label">手记</span>
        <span className="hud-action-count" aria-hidden="true">{visitsCount.toString().padStart(2, '0')}</span>
      </button>
    </div>
  );
}
