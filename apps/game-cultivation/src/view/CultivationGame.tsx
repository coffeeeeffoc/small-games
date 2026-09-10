import { useEffect, useRef, useState } from 'react';
import type { GameHost } from '@coffeeeeffoc/game-contract';
import type { CultivationContent } from '../content/schema.js';
import {
  initialCultivationSave,
  loadCultivationSave,
  writeCultivationSave,
} from '../adapter/save.js';
import {
  chooseCultivation,
  createCultivationState,
  reincarnate,
  realm,
  realms,
  realmThresholds,
  score,
} from '../domain/index.js';
import styles from '../styles.css?inline';

export type CultivationGameProps = { host: GameHost; content: CultivationContent; active: boolean };
const attributes = [
  ['body', '根骨'],
  ['spirit', '灵识'],
  ['luck', '福缘'],
] as const;

export function CultivationGame({ host, content, active }: CultivationGameProps) {
  const [state, setState] = useState(createCultivationState);
  const [stored, setStored] = useState({
    save: initialCultivationSave,
    version: null as string | null,
  });
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(false);
  const [notice, setNotice] = useState('');
  const busy = useRef(false);
  const alive = useRef(true);
  const event = content.events[state.eventIndex];
  const chapter = content.chapters[event.chapter - 1];
  const power = score(state.stats);
  const currentRealm = realm(state.stats);
  const realmIndex = realms.indexOf(currentRealm);
  const nextThreshold = realmThresholds[realmIndex + 1];

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void loadCultivationSave(host).then((loaded) => {
      if (!cancelled) {
        setStored(loaded);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
      alive.current = false;
    };
  }, [host]);

  async function choose(index: number) {
    if (!active || !ready || busy.current || result || state.ended) return;
    busy.current = true;
    setPending(true);
    const next = chooseCultivation(state, index, content, stored.save);
    setState(next.state);
    setResult(true);
    try {
      const saved = await writeCultivationSave(host, stored.save, next.save, stored.version);
      if (alive.current) setStored(saved);
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }

  async function restart(blessed: boolean) {
    if (!active || busy.current) return;
    busy.current = true;
    setPending(true);
    setNotice('');
    try {
      if (blessed) {
        const reward = await host.ads.offer({ id: 'cultivation.reincarnate', reward: { luck: 2 } });
        if (reward.status !== 'completed') {
          if (alive.current) setNotice('福缘尚未降临，可直接转世再修一生。');
          return;
        }
      }
      if (alive.current) {
        setState(reincarnate(blessed));
        setResult(false);
      }
    } catch {
      if (alive.current) setNotice('福缘暂不可用，可直接转世。');
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }

  return (
    <main className={`cultivation ${!active ? 'paused' : ''}`}>
      <style>{styles}</style>
      <header className="xian-header">
        <div className="xian-brand">
          <span className="xian-seal">仙</span>
          <div>
            <small>一念入青云</small>
            <h1>{content.title}</h1>
          </div>
        </div>
        <span className="xian-record">
          灵石 <b>{stored.save.coins}</b>
          <br />
          最佳道行 {stored.save.bestCultivation}
        </span>
      </header>
      <nav className="xian-chapters" aria-label="修行章节">
        {content.chapters.map((item, index) => (
          <span key={item.name} aria-current={event.chapter === index + 1 ? 'step' : undefined}>
            <i>0{index + 1}</i>
            {item.name}
          </span>
        ))}
      </nav>
      <div className="xian-layout">
        <section className={`xian-landscape chapter-${event.chapter}`} aria-label="青云山修行图">
          <div className="xian-poem">
            山中无甲子
            <br />
            一念已千年
          </div>
          <svg viewBox="0 0 640 580" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs>
              <linearGradient id="xian-mist" x2="0" y2="1">
                <stop stopColor="#d9e0d5" />
                <stop offset="1" stopColor="#98b2a6" />
              </linearGradient>
            </defs>
            <path
              fill="url(#xian-mist)"
              d="M0 360 70 185 103 254 182 68 252 213 300 144 352 300 408 203 478 295 565 95 640 242V580H0Z"
            />
            <path
              fill="#668c80"
              opacity=".7"
              d="M0 440 89 319 117 375 236 207 271 281 305 264 370 401 449 330 538 402 601 291 640 395V580H0Z"
            />
            <path
              fill="#305c50"
              d="M0 480 45 435 103 464 165 381 191 408 227 347 279 429 310 420 350 485 470 465 575 514 640 477V580H0Z"
            />
            <path
              fill="none"
              stroke="#e3dbc1"
              strokeWidth="3"
              opacity=".65"
              d="m370 580-70-25 31-23-41-19 19-17-43-32-21-51"
            />
            <g fill="#223f35">
              <path d="m181 410 52-23 53 23-17-1v32h-71v-32Z" />
              <path d="m176 409 57-31 58 31-58-16Z" />
              <path stroke="#223f35" strokeWidth="5" d="m115 480-8-123m0 37-42-20m45 43 46-21" />
              <path d="m49 377 31-22 25 5 9-10 41 24-47-2Zm23 41 30-25 28 8 39-4-18 20Z" />
            </g>
            <g fill="#efe8cf">
              <circle cx="243" cy="459" r="5" />
              <path d="m238 466-7 23 12-6 14 8-10-25Z" />
              <path stroke="#d7c183" strokeWidth="2" d="m253 468 18-19" />
            </g>
            <path
              fill="none"
              stroke="#eef0e0"
              opacity=".4"
              strokeWidth="24"
              d="M-50 311Q156 351 354 307T700 295M-20 454Q188 480 402 435T700 450"
            />
          </svg>
          <div className="xian-realm">
            <small>
              {chapter.subtitle} · {event.age} 岁
            </small>
            <strong>{currentRealm}</strong>
            <span>
              {state.ended
                ? '此生已入修行录'
                : `道行 ${power}${nextThreshold ? ` / ${nextThreshold}` : ' · 圆满'}`}
            </span>
            <progress
              aria-label="境界进度"
              max={nextThreshold ? nextThreshold - realmThresholds[realmIndex] : 1}
              value={nextThreshold ? power - realmThresholds[realmIndex] : 1}
            />
          </div>
        </section>
        <section className="xian-play" aria-label="修行历练">
          <div className="xian-stats" aria-label="角色属性">
            {attributes.map(([key, label]) => (
              <div key={key}>
                <span>{label}</span>
                <b>{state.stats[key]}</b>
              </div>
            ))}
          </div>
          {!active ? (
            <article className="xian-event">
              <h2>修行已暂停</h2>
              <p>归来时，山门仍在。</p>
            </article>
          ) : state.ended ? (
            <article className="xian-event ending">
              <small className="xian-eyebrow">三章已毕 · 此世评价</small>
              <h2>{currentRealm === '飞升' ? '天门为你而开' : '此生亦有回响'}</h2>
              <p>{state.log}</p>
              <div className="xian-ending-score">
                {power}
                <span>道行 · {currentRealm}</span>
              </div>
              <p>此世获得 {Math.floor(power / 3)} 灵石。换一种选择，重走一段仙途。</p>
              <div className="choices">
                <button disabled={pending} onClick={() => void restart(false)}>
                  直接转世 <span>再修一生 →</span>
                </button>
                <button
                  disabled={pending || !host.session.capabilities.includes('advertising')}
                  onClick={() => void restart(true)}
                >
                  带着福缘转世 <span>完成奖励后获得初始加成</span>
                </button>
              </div>
              {notice && <p role="status">{notice}</p>}
            </article>
          ) : (
            <article className={`xian-event ${event.boss && !result ? 'boss' : ''}`}>
              <small className="xian-eyebrow">
                {result
                  ? '一念落定 · 因果已成'
                  : `${event.boss ? '渡劫' : '机缘'} ${String(state.eventIndex + 1).padStart(2, '0')} / ${content.events.length} · ${event.age} 岁`}
              </small>
              <h2>{result ? '这一念，入了道' : event.title}</h2>
              <p className="xian-story" role="status">
                {result ? state.log : event.text}
              </p>
              <div className="choices">
                {result ? (
                  <button disabled={pending} onClick={() => setResult(false)}>
                    继续历练 <span>{realm(state.stats)} · 前路尚长 →</span>
                  </button>
                ) : (
                  event.choices.map((choice, index) => (
                    <button
                      disabled={!ready || pending}
                      key={choice.text}
                      onClick={() => void choose(index)}
                    >
                      <strong>{choice.text}</strong>
                      <span>
                        {attributes
                          .filter(([key]) => choice.delta[key])
                          .map(
                            ([key, label]) =>
                              `${label} ${(choice.delta[key] ?? 0) > 0 ? '+' : ''}${choice.delta[key]}`,
                          )
                          .join(' · ')}{' '}
                        <i>↗</i>
                      </span>
                    </button>
                  ))
                )}
              </div>
              {!result && <aside className="xian-previous">前尘 / {state.log}</aside>}
            </article>
          )}
          <footer className="xian-footer">
            <span>凡骨问仙 · 一念一生</span>
            <span>{state.ended ? 18 : state.eventIndex} / 18 历练</span>
          </footer>
        </section>
      </div>
      <details className="xian-help">
        <summary>修行入门</summary>
        <p>
          每次选择推进一段人生。根骨、灵识、福缘共同决定道行（根骨 × 2 + 灵识 × 3 + 福缘 ×
          2）。历经十八次机缘，结算灵石并保存最佳道行；本次人生在离开后重新开始。福缘转世为可选奖励，直接转世始终免费。
        </p>
      </details>
    </main>
  );
}
