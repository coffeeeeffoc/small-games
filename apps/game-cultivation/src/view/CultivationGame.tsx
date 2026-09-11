import { useEffect, useRef, useState } from 'react';
import type { GameHost } from '@coffeeeeffoc/game-contract';
import type { CultivationContent } from '../content/schema.js';
import { createCultivationSurface, type CultivationSurface } from '../canvas/surface.js';
import { browserSound } from './browser-sound.js';
import { relicNames } from '../domain/world.js';
import styles from '../styles.css?inline';

type Props = { host: GameHost; content: CultivationContent; active: boolean };
type View = {
  state: CultivationSurface['state'];
  ui: CultivationSurface['ui'];
  buttons: CultivationSurface['buttons'];
};
export function CultivationGame({ host, content, active }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    controller = useRef<CultivationSurface | null>(null);
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    let game: CultivationSurface;
    try {
      game = createCultivationSurface(
        {
          canvas: node,
          onTap: () => () => {},
          onPointer: () => () => {},
          createSound: browserSound,
        },
        content,
        host,
      );
    } catch (reason) {
      queueMicrotask(() => setError(String(reason)));
      return;
    }
    controller.current = game;
    game.ui.reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stop = game.subscribe(() =>
      setView({ state: game.state, ui: game.ui, buttons: game.buttons }),
    );
    const blur = () => game.blur();
    const visibility = () => {
      if (document.hidden) game.blur();
    };
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    if (import.meta.env.DEV)
      Object.defineProperty(node, 'getCultivationSnapshot', {
        configurable: true,
        value: () => structuredClone(game.state),
      });
    return () => {
      stop();
      controller.current = null;
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      if (import.meta.env.DEV) Reflect.deleteProperty(node, 'getCultivationSnapshot');
      void game.dispose();
    };
  }, [host, content]);
  useEffect(() => {
    if (active) controller.current?.resume();
    else controller.current?.pause();
  }, [active]);
  const s = view?.state;
  return (
    <main
      className="cultivation"
      tabIndex={0}
      data-phase={s?.phase ?? 'ready'}
      onKeyDown={(event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (controller.current?.keyboard(event.code, true)) event.preventDefault();
      }}
      onKeyUp={(event) => {
        if (controller.current?.keyboard(event.code, false)) event.preventDefault();
      }}
    >
      <style>{styles}</style>
      <div
        className="trial-stage"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.closest<HTMLElement>('.cultivation')?.focus({ preventScroll: true });
          const box = event.currentTarget.getBoundingClientRect();
          controller.current?.pointer({
            phase: 'down',
            pointerId: event.pointerId,
            x: ((event.clientX - box.left) * 960) / box.width,
            y: ((event.clientY - box.top) * 1600) / box.height,
          });
        }}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          controller.current?.pointer({
            phase: 'move',
            pointerId: event.pointerId,
            x: ((event.clientX - box.left) * 960) / box.width,
            y: ((event.clientY - box.top) * 1600) / box.height,
          });
        }}
        onPointerUp={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          controller.current?.pointer({
            phase: 'up',
            pointerId: event.pointerId,
            x: ((event.clientX - box.left) * 960) / box.width,
            y: ((event.clientY - box.top) * 1600) / box.height,
          });
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) =>
          controller.current?.pointer({ phase: 'cancel', pointerId: event.pointerId, x: 0, y: 0 })
        }
        onLostPointerCapture={(event) =>
          controller.current?.pointer({ phase: 'cancel', pointerId: event.pointerId, x: 0, y: 0 })
        }
      >
        <canvas
          ref={canvas}
          width={960}
          height={1600}
          aria-label="青云山修行场景：左侧行走，右侧御剑，靠近灵脉吐纳"
        />
        {view?.buttons.map((button, index) => (
          <button
            key={`${button.id}-${index}`}
            className="trial-hit-target"
            aria-label={button.label}
            disabled={button.disabled}
            style={{
              left: `${button.x / 4.8}%`,
              top: `${button.y / 8}%`,
              width: `${button.w / 4.8}%`,
              height: `${button.h / 8}%`,
            }}
            onClick={(event) => {
              if (event.detail === 0) controller.current?.command(button.id);
            }}
          >
            <span className="trial-sr">{button.label}</span>
          </button>
        ))}
        {error && (
          <p className="trial-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <aside className="trial-notebook">
        <span className="trial-eyebrow">青云山 · 一念入道</span>
        <h1>{content.title}</h1>
        <p className="trial-poem">
          听风入定。
          <br />
          携剑问山。
          <br />
          <em>以此身，叩天门。</em>
        </p>
        <div className="trial-rule" />
        <p>
          两分钟寻缘，一分钟渡劫。
          <br />
          每一道剑光，都由你亲手放出。
        </p>
        <dl>
          <div>
            <dt>行走</dt>
            <dd>WASD / 方向键 / 左侧摇杆</dd>
          </div>
          <div>
            <dt>御剑</dt>
            <dd>按住空格或御剑，松开出剑</dd>
          </div>
          <div>
            <dt>身法</dt>
            <dd>Shift 闪避 · E 吐纳 / 互动</dd>
          </div>
        </dl>
        <div className="trial-journal">
          <h2>此行回响</h2>
          {s?.journal.length ? (
            s.journal.slice(-4).map((entry) => <p key={entry}>· {entry}</p>)
          ) : (
            <p>山门已开，等你写下第一笔。</p>
          )}
        </div>
        <p className="trial-record">
          试炼 {view?.ui.record.runs ?? 0} 次 · 筑基 {view?.ui.record.wins ?? 0} 次 · 最佳{' '}
          {view?.ui.record.best ?? 0}
        </p>
      </aside>
      <div className="trial-sr">
        <output aria-label="当前气血">{Math.ceil(s?.health ?? 100)}</output>
        <output aria-label="当前真气">{Math.floor(s?.qi ?? 35)}</output>
        <output aria-label="当前场景">{s?.scene ?? 'cave'}</output>
        <output aria-label="本局机缘">
          {s?.relics.map((r) => relicNames[r]).join('、') || '暂无'}
        </output>
        <p role="status" aria-live="polite">
          {view?.ui.paused || view?.ui.hostPaused ? '修行已暂停' : s?.message}
        </p>
        <p>{view?.ui.notice}</p>
      </div>
    </main>
  );
}
