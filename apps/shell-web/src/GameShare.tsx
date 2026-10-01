import { useRef, useState } from 'react';

import { gameShareUrl } from './game-sharing.js';

export function GameShare({
  gameId,
  title,
  entryUrl,
  currentUrl,
}: {
  gameId: string;
  title: string;
  entryUrl: string;
  currentUrl: () => string | undefined;
}) {
  const [link, setLink] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  function close() {
    setLink('');
    toggle.current?.focus();
  }

  function open() {
    if (link) return setLink('');
    setLink(gameShareUrl(gameId, entryUrl, currentUrl()));
    setNotice('把链接发给朋友，一起玩这款游戏。');
  }

  async function copy() {
    setBusy(true);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(link);
      setNotice('链接已复制，可以发给朋友。');
    } catch {
      field.current?.focus();
      field.current?.select();
      setNotice('请长按或选中链接，手动复制。');
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    try {
      await navigator.share({ title, text: `一起玩「${title}」`, url: link });
      setNotice('已完成系统分享操作。');
    } catch (error) {
      setNotice(
        error && typeof error === 'object' && 'name' in error && error.name === 'AbortError'
          ? '已取消分享。'
          : '系统分享暂不可用，可以复制下方链接。',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="game-share">
      <button ref={toggle} type="button" aria-expanded={!!link} disabled={busy} onClick={open}>
        分享游戏
      </button>
      {link && (
        <section className="game-share-panel" aria-label="分享游戏链接">
          <label>
            游戏链接
            <input
              ref={field}
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <div>
            {typeof navigator.share === 'function' && (
              <button type="button" disabled={busy} onClick={() => void share()}>
                发给朋友
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void copy()}>
              复制链接
            </button>
            <button type="button" disabled={busy} onClick={close}>
              关闭
            </button>
          </div>
          <p role="status">{notice}</p>
        </section>
      )}
    </div>
  );
}
