import { useEffect, useRef, useState } from 'react';
import type { GameHost } from '@coffeeeeffoc/game-contract';
import { createOfficeSample } from './model.js';
import { browserSampleTarget } from './browser.js';
import { mountOfficeSample, type OfficeSampleRuntime } from './runtime.js';
import { sampleControls, sampleSummary, type SampleView } from './presentation.js';
import './sample.css';

export function OfficeSample({ host, active }: { host: GameHost; active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<OfficeSampleRuntime | null>(null);
  const hostActive = useRef(active);
  const [view, setView] = useState<SampleView>(() => ({
    state: createOfficeSample(),
    ready: false,
    error: '',
    sound: true,
    best: 0,
    saving: 'idle',
  }));
  useEffect(() => {
    if (!canvas.current) return;
    let mounted = true;
    const target = browserSampleTarget(canvas.current);
    try {
      runtime.current = mountOfficeSample(target, host, setView);
    } catch {
      queueMicrotask(() => {
        if (mounted)
          setView((current) => ({
            ...current,
            error: '当前浏览器无法显示工位场景，请启用 Canvas 后重试。',
          }));
      });
    }
    const visibility = () => {
      if (document.hidden || !hostActive.current) runtime.current?.pause();
      else runtime.current?.resume();
    };
    const blur = () => runtime.current?.pause();
    const focus = visibility;
    const keys = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (
        event.target instanceof HTMLButtonElement &&
        (event.code === 'Enter' || event.code === 'Space')
      )
        return;
      const current = runtime.current?.getView().state;
      if (!current) return;
      if (event.code === 'Escape')
        runtime.current?.dispatch({ type: current.status === 'paused' ? 'resume' : 'pause' });
      else if (event.code === 'Space')
        runtime.current?.dispatch({
          type: current.phone === 'working' ? 'phone-start' : 'phone-stop',
        });
      else if (event.code === 'KeyE')
        runtime.current?.dispatch({ type: current.pc === 'work' ? 'pc-entertainment' : 'pc-work' });
      else if (event.code === 'Enter')
        runtime.current?.dispatch(
          current.status === 'intro'
            ? { type: 'start' }
            : current.boss === 'question' && current.workConfirmed
              ? { type: 'answer', value: 42 }
              : { type: 'confirm-data', value: 42 },
        );
      else return;
      event.preventDefault();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    const element = canvas.current.parentElement!;
    element.addEventListener('keydown', keys);
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      element.removeEventListener('keydown', keys);
      void runtime.current?.dispose();
      target.dispose();
      runtime.current = null;
    };
  }, [host]);
  useEffect(() => {
    hostActive.current = active;
    if (active && !document.hidden) runtime.current?.resume();
    else runtime.current?.pause();
  }, [active, host]);
  return (
    <main className="office-sample" aria-label="工位偷闲">
      <h1 className="sample-accessible">打工人摸鱼记 · 工位偷闲</h1>
      <div className="sample-stage">
        <canvas
          ref={canvas}
          width={780}
          height={1688}
          tabIndex={0}
          aria-label="工位场景。E 切换电脑窗口，空格拿起或收好手机，Enter 确认数据，Esc 暂停。也可使用下面的按钮。"
        />
        <div className="sample-controls" aria-label="游戏操作">
          {sampleControls(view).map((control) => (
            <button
              key={control.id}
              type="button"
              data-action={control.id}
              aria-label={control.id === 'phone-fast' ? '快速收好手机，会发出声音' : control.label}
              style={{
                left: `${(control.x / 390) * 100}%`,
                top: `${(control.y / 844) * 100}%`,
                width: `${(control.w / 390) * 100}%`,
                height: `${(control.h / 844) * 100}%`,
              }}
              onClick={() => runtime.current?.dispatch(control.action)}
            >
              <span className="sample-accessible">{control.label}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="sample-accessible">{sampleSummary(view)}</p>
      <p className="sample-accessible" aria-live="polite" aria-atomic="true">
        {view.error ||
          (view.state.status === 'paused' ? '已暂停，准备好后继续。' : view.state.feedback)}
      </p>
    </main>
  );
}
