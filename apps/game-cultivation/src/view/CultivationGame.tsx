import { useEffect, useState } from 'react';

import type { GameHost } from '@coffeeeeffoc/game-contract';

import type { CultivationContent } from '../content/schema.js';
import { loadCultivationSave, writeCultivationSave } from '../adapter/save.js';
import { realm, score } from '../domain/model.js';
import {
  chooseCultivation,
  createCultivationState,
  reincarnate,
  type CultivationSave,
  type CultivationState,
} from '../domain/index.js';
import { initialCultivationSave } from '../adapter/save.js';

export type CultivationGameProps = {
  host: GameHost;
  content: CultivationContent;
  active: boolean;
};

export function CultivationGame({ host, content, active }: CultivationGameProps) {
  const [state, setState] = useState<CultivationState>(createCultivationState);
  const [save, setSave] = useState<CultivationSave>(initialCultivationSave);
  const [saveVersion, setSaveVersion] = useState<string | null>(null);
  const event = content.events[state.eventIndex];
  const chapter = content.chapters[event.chapter - 1];

  useEffect(() => {
    let cancelled = false;
    void loadCultivationSave(host).then((loaded) => {
      if (cancelled) return;
      setSave(loaded.save);
      setSaveVersion(loaded.version);
    });
    return () => {
      cancelled = true;
    };
  }, [host]);

  async function choose(choiceIndex: number) {
    const next = chooseCultivation(state, choiceIndex, content, save);
    setState(next.state);
    const persisted = await writeCultivationSave(host, save, next.save, saveVersion);
    setSave(persisted.save);
    setSaveVersion(persisted.version);
  }

  async function blessedReincarnation() {
    const result = await host.ads.offer({ id: 'cultivation.reincarnate', reward: { luck: 2 } });
    if (result.status === 'completed') setState(reincarnate(true));
  }

  if (!active) return <main className="cultivation paused">修行已暂停</main>;

  return (
    <main className="cultivation">
      <header>
        <p>第 {event.chapter} 章</p>
        <h1>三分钟修仙</h1>
        <small>
          {chapter.name} · {chapter.subtitle}
        </small>
      </header>

      <section className="stats" aria-label="角色属性">
        <span>骨 {state.stats.body}</span>
        <span>灵 {state.stats.spirit}</span>
        <span>运 {state.stats.luck}</span>
        <span>境 {realm(state.stats)}</span>
      </section>

      {!state.ended ? (
        <article className={event.boss ? 'event boss' : 'event'}>
          <small>
            {event.age} 岁 · 第 {state.eventIndex + 1} / {content.events.length} 劫
          </small>
          <h2>{event.title}</h2>
          <p>{event.text}</p>
          <div className="choices">
            {event.choices.map((choice, index) => (
              <button key={choice.text} onClick={() => void choose(index)}>
                {choice.text}
              </button>
            ))}
          </div>
          <aside>前情：{state.log}</aside>
        </article>
      ) : (
        <article className="ending">
          <small>三章已毕 · 此世评价</small>
          <h2>{realm(state.stats)}</h2>
          <strong>{score(state.stats)} 道行</strong>
          <p>{state.log}</p>
          <button onClick={() => setState(reincarnate(false))}>直接转世</button>
          <button
            disabled={!host.session.capabilities.includes('advertising')}
            onClick={() => void blessedReincarnation()}
          >
            {host.session.capabilities.includes('advertising') ? '带着福缘转世' : '福缘暂不可用'}
          </button>
        </article>
      )}

      <footer>
        灵石 {save.coins} · 最佳道行 {save.bestCultivation}
      </footer>
    </main>
  );
}
