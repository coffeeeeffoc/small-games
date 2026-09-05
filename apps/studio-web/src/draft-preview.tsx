import { useEffect, useRef, useState } from 'react';
import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import { cultivationGameDefinition } from '@coffeeeeffoc/game-cultivation';
import { createDraftPreviewHost } from './draft-preview-host.js';

/** Mounts a trusted Game with a disposable Host and disposes it on replacement or close. */
export function DraftPreview({ envelope }: { envelope: DynamicContentEnvelope }) {
  const target = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const container = document.createElement('div');
    target.current!.append(container);
    let cancelled = false;
    const mounted = cultivationGameDefinition.mount(container, createDraftPreviewHost(envelope));
    void mounted.catch(() => {
      if (!cancelled) setError('预览加载失败，请检查草稿。');
    });
    return () => {
      cancelled = true;
      container.remove();
      void mounted.then((instance) => instance.dispose()).catch(() => undefined);
    };
  }, [envelope]);
  return (
    <section className="draft-preview" aria-label="隔离游戏预览">
      <p>草稿预览 · 存档仅在本次预览内有效 · 广告关闭</p>
      {error && <p role="alert">{error}</p>}
      <div ref={target} />
    </section>
  );
}
